import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Search, Calendar, User, Users, Clock, CheckSquare, Plus, ArrowLeft, Filter, Sparkles, AlertCircle, ChevronDown, X, Archive, Settings, Mic, Play, Pause, Square, Volume2, Trash2 } from "lucide-react";
import type { Lead, UserProfile, Task } from "../types";
import { cn } from "../utils/cn";
import { BlockEditor } from "./BlockEditor";
import type { EditorBlock } from "./BlockEditor";
import { Markdown } from "../utils/markdown";

const parseNotesToBlocks = (notes: string): EditorBlock[] => {
  if (notes.trim().startsWith("[")) {
    try {
      return JSON.parse(notes);
    } catch (e) {}
  }
  return notes.split("\n").map((line, idx) => ({
    id: `b-init-${idx}`,
    type: "paragraph",
    content: line.trim() || "<br>"
  }));
};

const serializeBlocksToPlainText = (blocks: EditorBlock[]): string => {
  return blocks.map(b => b.content.replace(/<[^>]*>/g, "")).join("\n");
};

export interface MeetingTask {
  id: string;
  title: string;
  description: string;
  startDate?: string;   // YYYY-MM-DD
  assignedUser: string; // empty string if unassigned
  dueDate: string;      // YYYY-MM-DD
  priority: "low" | "medium" | "high";
  status: "todo" | "in_progress" | "done";
}

export interface MeetingNote {
  id: string;
  title: string;
  date: string;
  leadId: string;
  leadName: string;
  duration: number; // minutes
  notes: string;
  aiSummary: {
    summary: string;
    actionItems: string[];
    sentiment: "positive" | "neutral" | "negative";
    topics: string[];
  };
  attachedLeads?: string[];
  attachedClients?: string[];
  attachedUsers?: string[];
  summaryGenerated?: boolean;
  automatedTasks?: MeetingTask[];
  archived?: boolean;
  // null (not undefined) mirrors what sync.php returns, so the saved shape round-trips
  // identically and the background poller stops seeing phantom changes.
  audioFile?: string | null;
  transcription?: string | null;
  automatedNotes?: string | null;
}

interface MeetingRoomViewProps {
  leads: Lead[];
  users: UserProfile[];
  systemLanguage: "en" | "sk" | "hu";
  meetingNotes: MeetingNote[];
  setMeetingNotes: React.Dispatch<React.SetStateAction<MeetingNote[]>>;
  initialView?: "list" | "new";
  onClearInitialView?: () => void;
  integrationsConfig?: any;
  tasks: Task[];
  setTasks: (newTasks: Task[] | ((prev: Task[]) => Task[])) => void;
  taskStates?: string[];
}

export const MeetingRoomView: React.FC<MeetingRoomViewProps> = ({
  leads,
  users,
  systemLanguage,
  meetingNotes,
  setMeetingNotes,
  initialView = "list",
  onClearInitialView,
  integrationsConfig,
  setTasks,
  taskStates = ["New", "In progress", "Blocked", "Done"]
}) => {
  const t = (en: string, sk: string, hu: string) => systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;
  const [viewState, setViewState] = useState<"list" | "new" | "detail">(initialView);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingNote | null>(null);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLeadFilter, setSelectedLeadFilter] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [showArchived, setShowArchived] = useState(false);
  
  // Leads & Clients lists
  const clientsList = useMemo(() => leads.filter((l) => l.status === "accepted" && l.id !== "unassigned-docs"), [leads]);
  const leadsList = useMemo(() => leads.filter((l) => l.status !== "accepted" && l.id !== "unassigned-docs"), [leads]);

  // New Meeting Form state
  const [newTitle, setNewTitle] = useState("");
  const [attachedLeads, setAttachedLeads] = useState<string[]>([]);
  const [attachedClients, setAttachedClients] = useState<string[]>([]);
  const [attachedUsers, setAttachedUsers] = useState<string[]>([]);
  const [newDate, setNewDate] = useState(new Date().toISOString().split("T")[0]);
  const [newBlocks, setNewBlocks] = useState<EditorBlock[]>([
    { id: "b-1", type: "paragraph", content: "" }
  ]);
  // Detail view states for automated tasks & AI Summary
  const [activeTaskForEdit, setActiveTaskForEdit] = useState<MeetingTask | null>(null);
  const [isClosingTaskDrawer, setIsClosingTaskDrawer] = useState(false);
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null);
  const [isGeneratingDetailSummary, setIsGeneratingDetailSummary] = useState(false);

  // Selector dropdowns & search inputs
  const [activeDropdown, setActiveDropdown] = useState<"leads" | "clients" | "users" | null>(null);
  const [leadSearch, setLeadSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);

  // Recording & transcription states
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "paused" | "stopped" | "none">("none");
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordDuration, setRecordDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [uploadedAudioFile, setUploadedAudioFile] = useState<string | null>(null);

  // Audio Context and Visualizer states
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [dataArray, setDataArray] = useState<Uint8Array | null>(null);
  const [visualizerBars, setVisualizerBars] = useState<number[]>(new Array(15).fill(4));
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null);

  // Custom Audio Player states
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  // Tabs state
  const [activeTab, setActiveTab] = useState<"manual" | "transcription" | "automated">("manual");

  // New transcription fields for new note
  const [newTranscription, setNewTranscription] = useState<string>("");
  const [newAutomatedNotes, setNewAutomatedNotes] = useState<string>("");
  const [newSummaryGenerated, setNewSummaryGenerated] = useState<boolean>(false);
  const [newAiSummary, setNewAiSummary] = useState<any>(null);
  const [newAutomatedTasks, setNewAutomatedTasks] = useState<MeetingTask[]>([]);

  const isOpenAiConfigured = !!(integrationsConfig?.openAiKey && integrationsConfig.openAiKey.trim() !== "");
  const transcriptionAvailable = viewState === "new" ? !!newTranscription : !!selectedMeeting?.transcription;

  // Visualizer height updater
  useEffect(() => {
    if (recordingState !== "recording" || !analyser || !dataArray) {
      if (recordingState === "paused") {
        setVisualizerBars(prev => prev.map(() => 4));
      }
      return;
    }

    let animationFrameId: number;
    const update = () => {
      analyser.getByteFrequencyData(dataArray as any);
      const barCount = 15;
      const binSize = Math.floor(dataArray.length / barCount);
      const newBars = [];
      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        for (let j = 0; j < binSize; j++) {
          sum += dataArray[i * binSize + j];
        }
        const avg = sum / (binSize || 1);
        const h = Math.max(4, Math.min(40, (avg / 255) * 40));
        newBars.push(h);
      }
      setVisualizerBars(newBars);
      animationFrameId = requestAnimationFrame(update);
    };

    update();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [recordingState, analyser, dataArray]);

  // Recording timer
  useEffect(() => {
    if (recordingState !== "recording") return;

    const interval = setInterval(() => {
      setRecordDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [recordingState]);

  const formatDuration = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const startVisualizer = (stream: MediaStream) => {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      const src = ctx.createMediaStreamSource(stream);
      const ana = ctx.createAnalyser();
      ana.fftSize = 64;
      src.connect(ana);

      const bufferLength = ana.frequencyBinCount;
      const data = new Uint8Array(bufferLength);

      setAudioContext(ctx);
      setAnalyser(ana);
      setDataArray(data);
    } catch (e) {
      console.warn("Visualizer init failed", e);
    }
  };

  const startRecording = async () => {
    // Automatically set title if empty or default
    if (viewState === "new" && (!newTitle.trim() || newTitle === "Untitled Note" || newTitle === "Nepomenovaný zápis" || newTitle === "Névtelen jegyzet")) {
      const todayStr = new Date().toLocaleDateString(systemLanguage === "sk" ? "sk-SK" : systemLanguage === "hu" ? "hu-HU" : "en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
      setNewTitle(t(`Recorded Meeting - ${todayStr}`, `Nahrávané stretnutie - ${todayStr}`, `Rögzített megbeszélés - ${todayStr}`));
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(t("Microphone access is not supported by this browser.", "Tento prehliadač nepodporuje prístup k mikrofónu.", "Ez a böngésző nem támogatja a mikrofonhoz való hozzáférést."));
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicrophoneStream(stream);

      let mimeType = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
          mimeType = "audio/ogg";
        } else if (MediaRecorder.isTypeSupported("audio/wav")) {
          mimeType = "audio/wav";
        }
      }

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        setIsUploadingAudio(true);
        const ext = mimeType.split("/")[1] || "webm";
        const blob = new Blob(chunks, { type: mimeType });
        const localUrl = URL.createObjectURL(blob);
        setAudioUrl(localUrl);

        const currentId = viewState === "new" ? currentNoteId : selectedMeeting?.id;
        if (!currentId) {
          setIsUploadingAudio(false);
          return;
        }

        const formData = new FormData();
        formData.append("audio", blob, `meeting_${currentId}.${ext}`);
        formData.append("meetingId", currentId);

        try {
          const res = await fetch("/api/upload_audio.php", {
            method: "POST",
            body: formData
          });
          const data = await res.json();
          if (res.ok && data.success) {
            setUploadedAudioFile(data.filePath);
            if (viewState !== "new" && selectedMeeting) {
              const updated = { ...selectedMeeting, audioFile: data.filePath };
              setSelectedMeeting(updated);
              setMeetingNotes(prev => prev.map(m => m.id === selectedMeeting.id ? updated : m));
            } else if (viewState === "new" && currentNoteId) {
              // Force-save note immediately to include the audio file path in local state and trigger sync
              saveNoteAction(true, data.filePath);
            }
            if (typeof (window as any).showToast === "function") {
              (window as any).showToast(t("Audio recording saved successfully!", "Zvuková nahrávka bola úspešne uložená!", "A hangfelvétel sikeresen elmentve!"));
            }
          } else {
            throw new Error(data.message || t("Upload failed", "Nahrávanie zlyhalo", "A feltöltés sikertelen"));
          }
        } catch (err: any) {
          if (typeof (window as any).showToast === "function") {
            (window as any).showToast(t("Failed to upload audio to server: ", "Nepodarilo sa nahrať zvuk na server: ", "A hang szerverre való feltöltése sikertelen: ") + err.message, "error");
          }
        } finally {
          setIsUploadingAudio(false);
        }
      };

      setMediaRecorder(recorder);
      setRecordDuration(0);
      recorder.start();
      setRecordingState("recording");
      startVisualizer(stream);
    } catch (err: any) {
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(t("Microphone access denied or error: ", "Prístup k mikrofónu bol zamietnutý alebo nastala chyba: ", "A mikrofonhoz való hozzáférés megtagadva vagy hiba történt: ") + err.message, "error");
      }
    }
  };

  const pauseRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.pause();
      setRecordingState("paused");
    }
  };

  const resumeRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "paused") {
      mediaRecorder.resume();
      setRecordingState("recording");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    if (microphoneStream) {
      microphoneStream.getTracks().forEach(track => track.stop());
      setMicrophoneStream(null);
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
      setAudioContext(null);
    }
    setRecordingState("stopped");
  };

  const cancelRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.onstop = null;
      if (mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    }
    if (microphoneStream) {
      microphoneStream.getTracks().forEach(track => track.stop());
      setMicrophoneStream(null);
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
      setAudioContext(null);
    }
    setRecordingState("none");
    setAudioUrl(null);
    setUploadedAudioFile(null);
    if (window.location.hash.includes("?record=true")) {
      window.location.hash = window.location.hash.replace("?record=true", "");
    }
  };

  const removeAudioFile = () => {
    if (confirm(t("Are you sure you want to remove this recording?", "Naozaj chcete odstrániť túto nahrávku?", "Biztosan eltávolítja ezt a felvételt?"))) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setAudioUrl(null);
      setUploadedAudioFile(null);
      setRecordingState("none");
      
      if (viewState !== "new" && selectedMeeting) {
        const updated = { ...selectedMeeting, audioFile: undefined };
        setSelectedMeeting(updated);
        setMeetingNotes(prev => prev.map(m => m.id === selectedMeeting.id ? updated : m));
      }
      
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(t("Recording removed", "Nahrávka bola odstránená", "A felvétel eltávolítva"));
      }
    }
  };

  const handleTranscribeMeeting = async () => {
    setIsTranscribing(true);
    const manualNotesText = viewState === "new" 
      ? serializeBlocksToPlainText(newBlocks)
      : serializeBlocksToPlainText(parseNotesToBlocks(selectedMeeting?.notes || ""));

    try {
      const res = await fetch("/api/transcribe_meeting.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId: viewState === "new" ? currentNoteId : selectedMeeting?.id,
          manualNotes: manualNotesText
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const extractedTasks: MeetingTask[] = (data.actionItems || []).map((title: string, idx: number) => ({
          id: `task-${Date.now()}-${idx}`,
          title: title,
          description: `Extracted from meeting action items: ${title}`,
          assignedUser: "",
          startDate: new Date().toISOString().split("T")[0],
          dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split("T")[0],
          priority: "medium",
          status: "todo"
        }));

        if (viewState === "new") {
          const aiSum = {
            summary: data.summary,
            sentiment: data.sentiment,
            topics: data.topics,
            actionItems: data.actionItems
          };
          setNewTranscription(data.transcription);
          setNewAutomatedNotes(data.automatedNotes);
          setNewSummaryGenerated(true);
          setNewAiSummary(aiSum);
          setNewAutomatedTasks(extractedTasks);

          const finalTitle = newTitle.trim() || t("Untitled Note", "Nepomenovaný zápis", "Névtelen jegyzet");
          let primaryLeadId = "";
          let primaryLeadName = "General Contact";
          if (attachedClients.length > 0) {
            const firstClient = leads.find((l) => String(l.id) === attachedClients[0]);
            if (firstClient) {
              primaryLeadId = String(firstClient.id);
              primaryLeadName = firstClient.name;
            }
          } else if (attachedLeads.length > 0) {
            const firstLead = leads.find((l) => String(l.id) === attachedLeads[0]);
            if (firstLead) {
              primaryLeadId = String(firstLead.id);
              primaryLeadName = firstLead.name;
            }
          }

          const updatedNote: MeetingNote = {
            id: currentNoteId!,
            title: finalTitle,
            date: newDate,
            leadId: primaryLeadId,
            leadName: primaryLeadName,
            duration: 0,
            notes: JSON.stringify(newBlocks),
            audioFile: uploadedAudioFile || "",
            transcription: data.transcription,
            automatedNotes: data.automatedNotes,
            summaryGenerated: true,
            automatedTasks: extractedTasks,
            aiSummary: aiSum,
            attachedLeads,
            attachedClients,
            attachedUsers
          };

          setMeetingNotes(prev => {
            const exists = prev.some(n => n.id === currentNoteId);
            if (exists) return prev.map(n => n.id === currentNoteId ? updatedNote : n);
            return [updatedNote, ...prev];
          });
          setActiveTab("automated");
        } else if (selectedMeeting) {
          const updatedNote = {
            ...selectedMeeting,
            transcription: data.transcription,
            automatedNotes: data.automatedNotes,
            summaryGenerated: true,
            automatedTasks: extractedTasks,
            aiSummary: {
              summary: data.summary,
              sentiment: data.sentiment,
              topics: data.topics,
              actionItems: data.actionItems
            }
          };
          setSelectedMeeting(updatedNote);
          setMeetingNotes(prev => prev.map(m => m.id === selectedMeeting.id ? updatedNote : m));
          setActiveTab("automated");
        }

        if (typeof (window as any).showToast === "function") {
          (window as any).showToast(t("Transcription and synthesis completed successfully!", "Prepis a syntéza boli úspešne dokončené!", "Az átírás és szintézis sikeresen befejeződött!"));
        }
      } else {
        throw new Error(data.message || t("Transcription failed", "Prepis zlyhal", "Az átírás sikertelen"));
      }
    } catch (err: any) {
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(t("Transcription failed: ", "Prepis zlyhal: ", "Az átírás sikertelen: ") + err.message, "error");
      }
    } finally {
      setIsTranscribing(false);
    }
  };

  const renderRecordingBar = () => {
    if (recordingState === "none") return null;

    return (
      <div className="w-full max-w-[850px] bg-white/70 backdrop-blur-md border border-slate-200 shadow-md p-4 rounded-2xl mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all duration-350 z-20">
        <div className="flex items-center gap-3 flex-1">
          {/* Status Indicator Dot */}
          <div className="relative flex h-3.5 w-3.5 shrink-0">
            {recordingState === "recording" && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            )}
            <span className={cn(
              "relative inline-flex rounded-full h-3.5 w-3.5",
              recordingState === "recording" ? "bg-rose-600" :
              recordingState === "paused" ? "bg-amber-500" :
              recordingState === "stopped" ? "bg-emerald-500" : "bg-slate-350"
            )}></span>
          </div>

          <div className="text-left min-w-0">
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-800 truncate">
              {recordingState === "idle" && t("Ready to Record", "Pripravené na nahrávanie", "Felvételre kész")}
              {recordingState === "recording" && t("Recording...", "Nahrávanie...", "Felvétel...")}
              {recordingState === "paused" && t("Recording Paused", "Nahrávanie pozastavené", "Felvétel szüneteltetve")}
              {recordingState === "stopped" && t("Recording Saved", "Nahrávka pripravená", "Felvétel elmentve")}
            </div>
            {(recordingState === "recording" || recordingState === "paused") && (
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-0.5">
                {formatDuration(recordDuration)}
              </div>
            )}
          </div>
        </div>

        {/* Live Soundwave Visualization */}
        {(recordingState === "recording" || recordingState === "paused") && (
          <div className="flex items-end gap-1 h-9 px-4 border-l border-r border-slate-150/60 mx-2 shrink-0">
            {visualizerBars.map((h, idx) => (
              <div
                key={idx}
                className={cn(
                  "w-1 rounded-full transition-all duration-75",
                  recordingState === "recording" ? "bg-rose-500" : "bg-slate-300"
                )}
                style={{ height: `${h}px` }}
              />
            ))}
          </div>
        )}

        {/* Sleek Custom Audio Player */}
        {recordingState === "stopped" && audioUrl && (
          <div className="flex items-center gap-3 flex-1 max-w-sm sm:max-w-md w-full">
            <audio
              ref={audioRef}
              src={audioUrl}
              onTimeUpdate={() => {
                if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
              }}
              onDurationChange={() => {
                if (audioRef.current) setAudioDuration(audioRef.current.duration);
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => {
                if (!audioRef.current) return;
                if (isPlaying) {
                  audioRef.current.pause();
                } else {
                  audioRef.current.play();
                }
              }}
              className="p-2 rounded-full bg-slate-800 hover:bg-slate-900 text-white cursor-pointer transition-all shadow-sm flex items-center justify-center shrink-0"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5 fill-white" /> : <Play className="h-3.5 w-3.5 fill-white" />}
            </button>
            
            <div className="flex-1 min-w-0">
              <input
                type="range"
                min={0}
                max={audioDuration || 100}
                value={currentTime}
                onChange={(e) => {
                  if (audioRef.current) {
                    audioRef.current.currentTime = parseFloat(e.target.value);
                    setCurrentTime(audioRef.current.currentTime);
                  }
                }}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-650"
              />
              <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                <span>{formatDuration(Math.floor(currentTime))}</span>
                <span>{formatDuration(Math.floor(audioDuration))}</span>
              </div>
            </div>
            <Volume2 className="h-4 w-4 text-slate-400 shrink-0" />
            <button
              type="button"
              onClick={removeAudioFile}
              className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer shrink-0"
              title={t("Remove recording", "Odstrániť nahrávku", "Felvétel eltávolítása")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Buttons Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {recordingState === "idle" && (
            <>
              <button
                type="button"
                onClick={startRecording}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-md shadow-rose-600/20 flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-95"
              >
                <Mic className="h-3.5 w-3.5 fill-white" />
                {t("Record", "Nahrávať", "Rögzítés")}
              </button>
              <button
                type="button"
                onClick={cancelRecording}
                className="px-4 py-2 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm flex items-center gap-1.5 transition-all"
              >
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
            </>
          )}

          {recordingState === "recording" && (
            <>
              <button
                type="button"
                onClick={pauseRecording}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm flex items-center gap-1.5 transition-all"
              >
                <Pause className="h-3.5 w-3.5 fill-white" />
                {t("Pause", "Pozastaviť", "Szünet")}
              </button>
              <button
                type="button"
                onClick={stopRecording}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm flex items-center gap-1.5 transition-all"
              >
                <Square className="h-3.5 w-3.5 fill-white" />
                {t("Stop", "Zastaviť", "Leállítás")}
              </button>
              <button
                type="button"
                onClick={cancelRecording}
                className="px-4 py-2 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-805 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm flex items-center gap-1.5 transition-all"
              >
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
            </>
          )}

          {recordingState === "paused" && (
            <>
              <button
                type="button"
                onClick={resumeRecording}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm flex items-center gap-1.5 transition-all"
              >
                <Play className="h-3.5 w-3.5 fill-white" />
                {t("Resume", "Pokračovať", "Folytatás")}
              </button>
              <button
                type="button"
                onClick={stopRecording}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm flex items-center gap-1.5 transition-all"
              >
                <Square className="h-3.5 w-3.5 fill-white" />
                {t("Stop", "Zastaviť", "Leállítás")}
              </button>
              <button
                type="button"
                onClick={cancelRecording}
                className="px-4 py-2 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-805 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm flex items-center gap-1.5 transition-all"
              >
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
            </>
          )}

          {recordingState === "stopped" && isOpenAiConfigured && !transcriptionAvailable && (
            <button
              type="button"
              disabled={isTranscribing || isUploadingAudio || !uploadedAudioFile}
              onClick={handleTranscribeMeeting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-md shadow-indigo-600/10 flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-95"
            >
              {isTranscribing ? (
                <>
                  <div className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  {t("Transcribing...", "Prepisuje sa...", "Átírás...")}
                </>
              ) : isUploadingAudio ? (
                <>
                  <div className="h-3 w-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                  {t("Uploading...", "Ukladanie...", "Feltöltés...")}
                </>
              ) : !uploadedAudioFile ? (
                <>
                  <div className="h-3 w-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                  {t("No recording", "Chýba nahrávka", "Nincs felvétel")}
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("Transcribe", "Prepísať a zhrnúť", "Átírás és összegzés")}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  // Synchronize state with URL hash
  useEffect(() => {
    const syncStateWithHash = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#meetings/")) {
        const fullPath = hash.substring("#meetings/".length);
        const [path, query] = fullPath.split("?");
        const isRecord = query === "record=true";

        if (path === "new") {
          setViewState("new");
          setSelectedMeeting(null);
          // If we requested recording mode, activate recording bar
          if (isRecord) {
            setRecordingState(prev => {
              if (prev === "none") {
                setUploadedAudioFile(null);
                setAudioUrl(null);
                return "idle";
              }
              return prev;
            });
          } else {
            setRecordingState("none");
          }
          setActiveTab("manual");
          setNewTranscription("");
          setNewAutomatedNotes("");
          setNewSummaryGenerated(false);
        } else if (currentNoteId && path === currentNoteId) {
          // Keep editor open if we are actively editing this new note session
          setViewState("new");
          setSelectedMeeting(null);
        } else {
          // Find the meeting by ID
          const found = meetingNotes.find(m => m.id === path);
          if (found) {
            setSelectedMeeting(found);
            setViewState("detail");
            // Set active tab based on transcription existence
            setActiveTab(found.transcription ? "automated" : "manual");
            // Set recordingState to stopped if it has an audio file, otherwise none
            if (found.audioFile) {
              setRecordingState("stopped");
              setAudioUrl(found.audioFile);
              setUploadedAudioFile(found.audioFile);
            } else {
              setRecordingState("none");
              setAudioUrl(null);
              setUploadedAudioFile(null);
            }
          } else {
            // fallback to list if not found
            setViewState("list");
            setSelectedMeeting(null);
            setRecordingState("none");
            setActiveTab("manual");
          }
        }
      } else if (hash === "#meetings") {
        setViewState("list");
        setSelectedMeeting(null);
        setRecordingState("none");
        setActiveTab("manual");
      }
    };

    // Run initially
    syncStateWithHash();

    // Listen to hash changes
    window.addEventListener("hashchange", syncStateWithHash);
    return () => window.removeEventListener("hashchange", syncStateWithHash);
  }, [meetingNotes, currentNoteId]);

  // Trigger initial save and URL unique id update when user starts typing in a new note
  useEffect(() => {
    if (viewState === "new" && currentNoteId && window.location.hash.startsWith("#meetings/new")) {
      const hasContent = newTitle.trim() !== "" || newBlocks.some(b => b.content && b.content.trim() !== "");
      if (hasContent) {
        saveNoteAction(true);
        window.location.hash = `meetings/${currentNoteId}`;
      }
    }
  }, [newTitle, newBlocks, viewState, currentNoteId]);

  useEffect(() => {
    if (viewState === "new" && !currentNoteId) {
      setCurrentNoteId(`meet-${Date.now()}`);
    } else if (viewState !== "new" && currentNoteId) {
      setCurrentNoteId(null);
    }
  }, [viewState, currentNoteId]);

  useEffect(() => {
    if (initialView && !window.location.hash.includes("/")) {
      setViewState(initialView);
      if (initialView === "list") {
        setSelectedMeeting(null);
      }
      if (onClearInitialView) {
        onClearInitialView();
      }
    }
  }, [initialView]);

  // Handle meeting detail select
  const handleSelectMeeting = (meeting: MeetingNote) => {
    window.location.hash = `meetings/${meeting.id}`;
  };

  const updateTaskAssignment = (taskId: string, username: string) => {
    const targetTask = viewState === "new"
      ? newAutomatedTasks.find(t => t.id === taskId)
      : (selectedMeeting?.automatedTasks || []).find(t => t.id === taskId);
    
    if (targetTask && username && !targetTask.assignedUser) {
      const mapMeetingTaskStatusToCrmStatus = (status: "todo" | "in_progress" | "done") => {
        if (status === "done") {
          const found = taskStates.find(s => s.toLowerCase() === "done");
          return found || taskStates[taskStates.length - 1] || "Done";
        }
        if (status === "in_progress") {
          const found = taskStates.find(s => s.toLowerCase() === "in progress" || s.toLowerCase() === "in_progress");
          return found || taskStates[1] || "In progress";
        }
        return taskStates[0] || "New";
      };

      const newCrmTask: Task = {
        id: `task-ai-${Date.now()}`,
        title: targetTask.title,
        description: targetTask.description || `AI extracted suggestion from meeting notes`,
        status: mapMeetingTaskStatusToCrmStatus(targetTask.status),
        priority: targetTask.priority || "medium",
        startDate: targetTask.startDate || new Date().toISOString().split("T")[0],
        deadline: targetTask.dueDate || new Date(Date.now() + 86400000).toISOString().split("T")[0],
        deadlineTime: "23:59",
        owner: "AI Assistant",
        assignedUsers: [username],
        relatedLeadId: (viewState === "new" ? attachedLeads[0] : selectedMeeting?.leadId) || undefined
      };
      setTasks(prev => [newCrmTask, ...prev]);
      
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(t(`Task created and assigned to ${username}!`, `Úloha bola vytvorená a priradená používateľovi ${username}!`, `A feladat létrehozva és hozzárendelve ${username} felhasználóhoz!`));
      }
    }

    if (viewState === "new") {
      const updatedTasks = newAutomatedTasks.map(t => 
        t.id === taskId ? { ...t, assignedUser: username } : t
      );
      setNewAutomatedTasks(updatedTasks);
    } else if (selectedMeeting) {
      const updatedTasks = (selectedMeeting.automatedTasks || []).map(t => 
        t.id === taskId ? { ...t, assignedUser: username } : t
      );
      const updated = { ...selectedMeeting, automatedTasks: updatedTasks };
      setSelectedMeeting(updated);
      setMeetingNotes(prev => prev.map(m => m.id === selectedMeeting.id ? updated : m));
    }
  };

  const closeTaskDrawer = () => {
    setIsClosingTaskDrawer(true);
    setTimeout(() => {
      setActiveTaskForEdit(null);
      setIsClosingTaskDrawer(false);
    }, 350);
  };

  const handleSaveTaskDetails = (updatedTask: MeetingTask) => {
    if (viewState === "new") {
      const updatedTasks = newAutomatedTasks.map(t => 
        t.id === updatedTask.id ? updatedTask : t
      );
      setNewAutomatedTasks(updatedTasks);
      closeTaskDrawer();
    } else if (selectedMeeting) {
      const updatedTasks = (selectedMeeting.automatedTasks || []).map(t => 
        t.id === updatedTask.id ? updatedTask : t
      );
      const updated = { ...selectedMeeting, automatedTasks: updatedTasks };
      setSelectedMeeting(updated);
      setMeetingNotes(prev => prev.map(m => m.id === selectedMeeting.id ? updated : m));
      closeTaskDrawer();
    }
  };

  const handleGenerateSummary = async (meetingToSummarize: MeetingNote) => {
    setIsGeneratingDetailSummary(true);
    
    // Extract plain text from blocks
    const parsedBlocks = parseNotesToBlocks(meetingToSummarize.notes);
    const plainText = serializeBlocksToPlainText(parsedBlocks);
    
    if (plainText.trim() === "") {
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(t("Cannot summarize empty notes.", "Prázdne poznámky nie je možné zhrnúť.", "Üres jegyzetek nem összegezhetők."), "error");
      }
      setIsGeneratingDetailSummary(false);
      return;
    }

    try {
      const res = await fetch("/api/summarize_meeting.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: plainText })
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        // Create automated tasks from AI action items
        const extractedTasks: MeetingTask[] = (data.actionItems || []).map((title: string, idx: number) => ({
          id: `task-${Date.now()}-${idx}`,
          title: title,
          description: `Extracted from meeting action items: ${title}`,
          assignedUser: "",
          startDate: new Date().toISOString().split("T")[0],
          dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split("T")[0],
          priority: "medium",
          status: "todo"
        }));

        const updated = {
          ...meetingToSummarize,
          summaryGenerated: true,
          automatedTasks: extractedTasks,
          aiSummary: {
            summary: data.summary,
            sentiment: data.sentiment,
            topics: data.topics,
            actionItems: data.actionItems
          }
        };

        setMeetingNotes(prev => {
          const exists = prev.some(m => m.id === meetingToSummarize.id);
          if (exists) {
            return prev.map(m => m.id === meetingToSummarize.id ? updated : m);
          }
          return [updated, ...prev];
        });

        if (viewState === "new") {
          setNewTranscription(meetingToSummarize.transcription || "");
          setNewAutomatedNotes(meetingToSummarize.automatedNotes || "");
          setNewSummaryGenerated(true);
          setNewAiSummary(updated.aiSummary);
          setNewAutomatedTasks(extractedTasks);
        } else {
          setSelectedMeeting(updated);
        }
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast(t("AI Summary generated successfully!", "AI zhrnutie bolo úspešne vygenerované!", "Az AI összefoglaló sikeresen elkészült!"));
        }
      } else {
        throw new Error(data.message || t("Unknown error occurred.", "Vyskytla sa neznáma chyba.", "Ismeretlen hiba történt."));
      }
    } catch (err: any) {
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(err.message || t("Failed to generate AI Summary. Using fallback seeder.", "Nepodarilo sa vygenerovať AI zhrnutie. Použije sa záložný generátor.", "Az AI összefoglaló létrehozása sikertelen. Tartalék generátor használata."), "warning");
      }
      
      // Fallback local heuristic generation from actual note content if OpenAI fails or is not configured
      const localSuggestions: string[] = [];
      
      // Heuristic 1: Extract all "todo" block types
      parsedBlocks.forEach(b => {
        if (b.type === "todo" && b.content && b.content.trim() !== "" && b.content !== "<br>") {
          localSuggestions.push(b.content.replace(/<[^>]*>/g, "").trim());
        }
      });

      // Heuristic 2: Parse sentences looking for action keywords
      if (localSuggestions.length === 0) {
        const sentences = plainText.split(/[.!?\n]+/).map(s => s.trim()).filter(Boolean);
        const actionKeywords = [
          "need to", "should", "will", "must", "todo", "task", "prepare", "send", "call", "meet", 
          "schedule", "follow up", "verify", "check", "contact", "email", "write", "buy", "sell", "fix"
        ];
        
        sentences.forEach(sentence => {
          const lower = sentence.toLowerCase();
          const hasKeyword = actionKeywords.some(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'i');
            return regex.test(lower);
          });
          if (hasKeyword && sentence.length > 5 && sentence.length < 120) {
            localSuggestions.push(sentence);
          }
        });
      }

      // Heuristic 3: Fallback to first few non-header lines if nothing else matches
      if (localSuggestions.length === 0) {
        const paragraphs = parsedBlocks
          .filter(b => b.type === "paragraph" && b.content && b.content.trim() !== "" && b.content !== "<br>")
          .map(b => b.content.replace(/<[^>]*>/g, "").trim());
        if (paragraphs.length > 0) {
          localSuggestions.push(...paragraphs.slice(0, 2));
        }
      }

      // Final fallback if the document is totally empty of content
      if (localSuggestions.length === 0) {
        localSuggestions.push("Follow up on topics discussed in meeting");
      }

      const finalSuggestions = localSuggestions.slice(0, 4);

      const extractedTasks: MeetingTask[] = finalSuggestions.map((title: string, idx: number) => ({
        id: `task-${Date.now()}-${idx}`,
        title: title,
        description: `Suggested action item: ${title}`,
        assignedUser: "",
        startDate: new Date().toISOString().split("T")[0],
        dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split("T")[0],
        priority: "medium",
        status: "todo"
      }));

      const localSummary = `Summary of "${meetingToSummarize.title}": ${plainText.substring(0, 150)}${plainText.length > 150 ? "..." : ""}`;

      const updated = {
        ...meetingToSummarize,
        summaryGenerated: true,
        automatedTasks: extractedTasks,
        aiSummary: {
          summary: localSummary,
          sentiment: "neutral" as const,
          topics: ["Meeting Note"],
          actionItems: finalSuggestions
        }
      };

      setMeetingNotes(prev => prev.map(m => m.id === meetingToSummarize.id ? updated : m));
      setSelectedMeeting(updated);
    } finally {
      setIsGeneratingDetailSummary(false);
    }
  };

  // Filter calculations
  const filteredMeetings = meetingNotes.filter((m) => {
    if (m.archived && !showArchived) return false;

    const notesText = m.notes.trim().startsWith("[") 
      ? parseNotesToBlocks(m.notes).map(b => b.content).join(" ")
      : m.notes;

    const matchesSearch = 
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      notesText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.aiSummary.summary.toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesLead = selectedLeadFilter ? m.leadId === selectedLeadFilter : true;
    
    // Date filter calculation
    if (dateFilter === "all") return matchesSearch && matchesLead;
    const meetingDate = new Date(m.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let matchesDate = true;
    if (dateFilter === "today") {
      const compDate = new Date(m.date);
      matchesDate = compDate.toDateString() === today.toDateString();
    } else if (dateFilter === "week") {
      const diffTime = Math.abs(today.getTime() - meetingDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      matchesDate = diffDays <= 7;
    } else if (dateFilter === "month") {
      const diffTime = Math.abs(today.getTime() - meetingDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      matchesDate = diffDays <= 30;
    }
    
    return matchesSearch && matchesLead && matchesDate;
  });

  // Common action to save note data
  const saveNoteAction = (silent = false, overrideAudioFile?: string) => {
    if (!currentNoteId) return;

    const finalTitle = newTitle.trim() || t("Untitled Note", "Nepomenovaný zápis", "Névtelen jegyzet");
    let primaryLeadId = "";
    let primaryLeadName = "General Contact";

    if (attachedClients.length > 0) {
      const firstClient = leads.find((l) => String(l.id) === attachedClients[0]);
      if (firstClient) {
        primaryLeadId = String(firstClient.id);
        primaryLeadName = firstClient.name;
      }
    } else if (attachedLeads.length > 0) {
      const firstLead = leads.find((l) => String(l.id) === attachedLeads[0]);
      if (firstLead) {
        primaryLeadId = String(firstLead.id);
        primaryLeadName = firstLead.name;
      }
    }

    const plainTextNotes = serializeBlocksToPlainText(newBlocks);
    const textToAnalyze = plainTextNotes.toLowerCase();
    let sentiment: "positive" | "neutral" | "negative" = "neutral";
    if (textToAnalyze.includes("happy") || textToAnalyze.includes("great") || textToAnalyze.includes("agreed") || textToAnalyze.includes("excited")) {
      sentiment = "positive";
    } else if (textToAnalyze.includes("disappoint") || textToAnalyze.includes("concern") || textToAnalyze.includes("expensive") || textToAnalyze.includes("reject")) {
      sentiment = "negative";
    }

    const topics = ["Budget & Pricing", "Project Timeline"];
    if (textToAnalyze.includes("color") || textToAnalyze.includes("design") || textToAnalyze.includes("aesthetic")) {
      topics.push("Design System");
    }
    if (textToAnalyze.includes("contract") || textToAnalyze.includes("sign")) {
      topics.push("Legal & Contracts");
    }
    if (textToAnalyze.includes("technical") || textToAnalyze.includes("api") || textToAnalyze.includes("code")) {
      topics.push("Technical Spec");
    }

    const actionItems = [
      "Send follow-up email with updated project metrics",
      "Update contract details as discussed in the call"
    ];
    if (textToAnalyze.includes("call") || textToAnalyze.includes("phone")) {
      actionItems.push("Schedule next progress call next Tuesday");
    }
    if (textToAnalyze.includes("design") || textToAnalyze.includes("mock")) {
      actionItems.push("Review UI design mocks internally");
    }

    const aiSummary = newSummaryGenerated && newAiSummary ? newAiSummary : {
      summary: `This meeting focused on clarifying primary requirements. The client discussed their budget parameters and established critical milestone dates. ${plainTextNotes.substring(0, 120)}...`,
      actionItems,
      sentiment,
      topics
    };

    // Preserve the archived flag of an existing note (saving previously dropped it).
    const existingNote = meetingNotes.find((n) => n.id === currentNoteId);

    // NOTE: field order and null/boolean conventions below intentionally mirror sync.php's
    // meeting-note serialization so the saved note round-trips byte-identically and the 5s
    // background poller does not treat every save as a change (which caused the endless
    // "Saving to server..." churn where recordings appeared unsaved).
    const createdNote: MeetingNote = {
      id: currentNoteId,
      title: finalTitle,
      date: newDate,
      leadId: primaryLeadId,
      leadName: primaryLeadName,
      duration: existingNote?.duration ?? 0,
      notes: JSON.stringify(newBlocks),
      aiSummary,
      summaryGenerated: !!newSummaryGenerated,
      attachedLeads,
      attachedClients,
      attachedUsers,
      automatedTasks: newSummaryGenerated ? newAutomatedTasks : [],
      archived: existingNote?.archived ?? false,
      audioFile: overrideAudioFile !== undefined ? overrideAudioFile : (uploadedAudioFile || null),
      transcription: newTranscription || null,
      automatedNotes: newAutomatedNotes || null
    };

    setMeetingNotes((prev) => {
      const exists = prev.some((n) => n.id === currentNoteId);
      if (exists) {
        return prev.map((n) => (n.id === currentNoteId ? createdNote : n));
      } else {
        return [createdNote, ...prev];
      }
    });

    if (!silent && typeof (window as any).showToast === "function") {
      (window as any).showToast(t("Meeting saved and AI Summary successfully compiled!", "Stretnutie bolo uložené a AI zhrnutie úspešne zostavené!", "A megbeszélés elmentve és az AI összefoglaló sikeresen összeállítva!"));
    }
  };

  // Save note data immediately without showing loader
  const handleSaveNewMeeting = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentNoteId) return;

    saveNoteAction(false);
    const targetId = currentNoteId;
    
    // Reset form
    setNewTitle("");
    setAttachedLeads([]);
    setAttachedClients([]);
    setAttachedUsers([]);
    setNewBlocks([{ id: "b-1", type: "paragraph", content: "" }]);
    setCurrentNoteId(null);

    window.location.hash = `meetings/${targetId}`;
  };

  // Autosave every 5 seconds
  useEffect(() => {
    if (viewState !== "new" || !currentNoteId) return;

    const interval = setInterval(() => {
      saveNoteAction(true);
    }, 5000);

    return () => clearInterval(interval);
  }, [viewState, currentNoteId, newTitle, newDate, newBlocks, attachedLeads, attachedClients, attachedUsers]);

  const getSentimentBadge = (sentiment: "positive" | "neutral" | "negative") => {
    switch (sentiment) {
      case "positive":
        return <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/50 text-[10px] font-black uppercase tracking-wider">{t("🟢 Positive", "🟢 Pozitívne", "🟢 Pozitív")}</span>;
      case "negative":
        return <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/50 text-[10px] font-black uppercase tracking-wider">{t("🔴 Critical", "🔴 Kritické", "🔴 Kritikus")}</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full bg-slate-50 text-slate-700 border border-slate-200/50 text-[10px] font-black uppercase tracking-wider">{t("⚪ Neutral", "⚪ Neutrálne", "⚪ Semleges")}</span>;
    }
  };

  const synthesizedMeeting = useMemo(() => {
    if (viewState !== "new") return null;
    return {
      id: currentNoteId || "",
      title: newTitle.trim() || t("Untitled Note", "Nepomenovaný zápis", "Névtelen jegyzet"),
      date: newDate,
      leadId: attachedLeads[0] || "",
      leadName: leads.find(l => String(l.id) === attachedLeads[0])?.name || "General Contact",
      duration: 0,
      notes: JSON.stringify(newBlocks),
      attachedLeads,
      attachedClients,
      attachedUsers,
      audioFile: uploadedAudioFile || undefined,
      transcription: newTranscription || undefined,
      automatedNotes: newAutomatedNotes || undefined,
      summaryGenerated: newSummaryGenerated,
      aiSummary: newAiSummary || undefined,
      automatedTasks: newAutomatedTasks
    };
  }, [viewState, currentNoteId, newTitle, newDate, newBlocks, attachedLeads, attachedClients, attachedUsers, uploadedAudioFile, newTranscription, newAutomatedNotes, newSummaryGenerated, newAiSummary, newAutomatedTasks, systemLanguage, leads]);

  const renderAiAssistantPanel = (meeting: MeetingNote | null) => {
    if (!meeting) return null;

    const summaryGenerated = !!meeting.summaryGenerated;
    const automatedTasks = meeting.automatedTasks || [];

    return (
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
        {/* TOP: MAKE SUMMARY / RESUMMARIZE BUTTON */}
        {summaryGenerated ? (
          <button
            type="button"
            disabled={isGeneratingDetailSummary}
            onClick={() => handleGenerateSummary(meeting)}
            className="w-full py-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-heading font-black text-[11px] uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-indigo-100"
          >
            <Sparkles className="h-4 w-4 text-indigo-655" />
            {isGeneratingDetailSummary ? t("Generating...", "Generuje sa...", "Generálás...") : t("Resummarize Note", "Znova zhrnúť poznámku", "Jegyzet újraösszegzése")}
          </button>
        ) : (
          <button
            type="button"
            disabled={isGeneratingDetailSummary || !integrationsConfig?.openAiKey || integrationsConfig.openAiKey.trim() === ""}
            onClick={() => handleGenerateSummary(meeting)}
            className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-250 disabled:text-slate-400 text-white font-heading font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20"
          >
            <Sparkles className="h-4 w-4" />
            {isGeneratingDetailSummary ? t("Generating...", "Generuje sa...", "Generálás...") : t("Make AI Summary", "Vytvoriť AI zhrnutie", "AI összefoglaló készítése")}
          </button>
        )}

        {/* LOADER */}
        {isGeneratingDetailSummary && (
          <div className="p-8 flex flex-col items-center justify-center space-y-3 text-center bg-slate-50 border border-slate-150 rounded-2xl">
            <div className="h-8 w-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
            <p className="text-xs font-extrabold text-slate-800 animate-pulse">{t("Analyzing note content...", "Analyzuje sa obsah poznámky...", "Jegyzet tartalmának elemzése...")}</p>
            <p className="text-[10px] text-slate-400 font-medium">{t("Extracting actions & customer sentiment", "Extrahujú sa akcie a sentiment zákazníka", "Műveletek és ügyfél-hangulat kinyerése")}</p>
          </div>
        )}

        {/* API Key Hint if not configured */}
        {!summaryGenerated && (!integrationsConfig?.openAiKey || integrationsConfig.openAiKey.trim() === "") && (
          <div className="p-4 bg-amber-50/50 border border-amber-200/50 rounded-2xl space-y-2 text-center">
            <p className="text-xs text-amber-900 font-extrabold leading-relaxed uppercase tracking-wider text-[10px]">
              {t("AI Assistant Inactive", "AI asistent neaktívny", "AI asszisztens inaktív")}
            </p>
            <p className="text-[10px] text-amber-700 leading-relaxed font-semibold">
              {t("Please configure your secret OpenAI API Key in settings to enable summary generation, topic tagging, and automated action plans.", "Nastavte si svoj tajný OpenAI API kľúč v nastaveniach, aby ste umožnili generovanie zhrnutí, označovanie tém a automatizované akčné plány.", "Állítsa be a titkos OpenAI API-kulcsát a beállításokban az összefoglalók generálásának, a témacímkézésnek és az automatizált cselekvési terveknek az engedélyezéséhez.")}
            </p>
          </div>
        )}

        {/* SUMMARY SECTION */}
        {summaryGenerated && !isGeneratingDetailSummary && meeting.aiSummary && (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-indigo-505" />
              {t("AI Summary", "AI zhrnutie", "AI összefoglaló")}
            </h3>
            
            <div className="p-4 bg-indigo-50/40 border border-indigo-100/30 rounded-2xl space-y-2">
              <p className="text-xs text-slate-705 font-semibold leading-relaxed">
                {meeting.aiSummary.summary}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl space-y-1">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{t("Sentiment", "Sentiment", "Hangulat")}</div>
                <div className="font-bold text-emerald-600 uppercase tracking-wide flex items-center gap-1 text-[10px]">
                  {getSentimentBadge(meeting.aiSummary.sentiment)}
                  {meeting.aiSummary.sentiment}
                </div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl space-y-1">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{t("Topics", "Témy", "Témák")}</div>
                <div className="font-bold text-indigo-600 truncate text-[9px] uppercase tracking-wide" title={meeting.aiSummary.topics.join(", ")}>
                  {meeting.aiSummary.topics.slice(0, 2).join(" • ")}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TASK SUGGESTIONS SECTION */}
        {summaryGenerated && !isGeneratingDetailSummary && (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <CheckSquare className="h-4 w-4 text-indigo-500" />
              {t("Task Suggestions", "Návrhy úloh", "Feladatjavaslatok")}
            </h3>

            <div className="space-y-3">
              {automatedTasks.length === 0 ? (
                <p className="text-[10px] text-slate-400 italic text-center py-2">{t("No suggestions generated", "Neboli vygenerované žiadne návrhy", "Nincs generált javaslat")}</p>
              ) : (
                automatedTasks.map(task => {
                  const isAssigningThis = assigningTaskId === task.id;
                  const isCreated = !!task.assignedUser;

                  return (
                    <div key={task.id} className={cn(
                      "p-3.5 border rounded-2xl space-y-3 relative group/task transition-all",
                      isCreated 
                        ? "bg-emerald-50/20 border-emerald-100/60 animate-fade-in" 
                        : "bg-slate-50 border-slate-150"
                    )}>
                      
                      {/* Task details header */}
                      <div className="space-y-1 text-left">
                        <div className="flex items-start justify-between gap-1.5">
                          <h4 className="text-xs font-extrabold text-slate-800 leading-snug">
                            {task.title}
                          </h4>
                          {isCreated && (
                            <span className="shrink-0 flex items-center gap-0.5 text-[8px] font-black uppercase text-emerald-600 bg-emerald-100/40 border border-emerald-200/35 px-1.5 py-0.5 rounded-md">
                              {t("Created", "Vytvorené", "Létrehozva")}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                          <span className="flex items-center gap-0.5">
                            <Calendar className="h-3 w-3" />
                            {task.dueDate || t("No deadline", "Bez termínu", "Nincs határidő")}
                          </span>
                          <span>•</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[8px]",
                            task.priority === "high" && "bg-rose-50 text-rose-700 border border-rose-200/30",
                            task.priority === "medium" && "bg-amber-50 text-amber-700 border border-amber-200/30",
                            task.priority === "low" && "bg-slate-200 text-slate-700"
                          )}>
                            {task.priority}
                          </span>
                        </div>
                      </div>

                      {/* Task Controls: Assign / Details */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-150/70 gap-2">
                        {/* Assigned user display / dropdown */}
                        <div className="relative">
                          {isCreated ? (
                            <div className="flex items-center gap-1.5">
                              <div className="h-5.5 w-5.5 rounded-full bg-emerald-100 border border-emerald-200/40 text-emerald-700 flex items-center justify-center text-[9px] font-black uppercase shrink-0">
                                {task.assignedUser.substring(0, 2)}
                              </div>
                              <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                                {task.assignedUser}
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAssigningTaskId(task.id)}
                              className="text-[9px] font-black text-indigo-655 hover:text-indigo-800 transition-colors uppercase tracking-wider flex items-center gap-0.5 cursor-pointer bg-indigo-50/50 hover:bg-indigo-50 px-2.5 py-1.5 rounded-xl border border-indigo-100/50"
                            >
                              <Plus className="h-3 w-3" />
                              {t("Assign to Create", "Priradiť a vytvoriť", "Hozzárendelés és létrehozás")}
                            </button>
                          )}

                          {/* Assign Dropdown Popover */}
                          {isAssigningThis && (
                            <>
                              <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setAssigningTaskId(null)} />
                              <div className="absolute left-0 bottom-full mb-1.5 z-50 bg-white border border-slate-250 rounded-xl shadow-2xl p-1 w-[160px] max-h-[180px] overflow-y-auto">
                                {users.map(u => (
                                  <button
                                    key={u.name}
                                    type="button"
                                    onClick={() => {
                                      updateTaskAssignment(task.id, u.name);
                                      setAssigningTaskId(null);
                                    }}
                                    className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded-lg text-[10px] font-black text-slate-700 uppercase tracking-wider cursor-pointer flex items-center gap-1.5"
                                  >
                                    <div className="h-4.5 w-4.5 rounded-full bg-indigo-50 border border-indigo-200/40 text-indigo-600 flex items-center justify-center text-[8px] font-black">
                                      {u.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    {u.name}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>

                        {/* Edit details & Suggestion explanation */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveTaskForEdit(task)}
                            className="text-[9px] font-black text-slate-500 hover:text-slate-700 transition-colors uppercase tracking-wider flex items-center gap-0.5 cursor-pointer bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl border border-slate-200"
                          >
                            <Settings className="h-3.5 w-3.5 text-slate-500" />
                            {t("Edit Details", "Upraviť detaily", "Részletek szerkesztése")}
                          </button>
                          {!isCreated && (
                            <span className="text-[9px] text-slate-400 italic">{t("Suggestion", "Návrh", "Javaslat")}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* HEADER SECTION */}
      {viewState !== "new" && (
        <div className="flex flex-row items-center justify-between gap-4 bg-white/40 backdrop-blur-md p-6 rounded-3xl border border-white/60 shadow-sm">
          {viewState === "list" ? (
            <>
              <div>
                <h2 className="text-xl font-heading font-extrabold text-[#0b1329] flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-500 animate-pulse" />
                  {systemLanguage === "sk" ? "AI Zasadačka & Analýza Stretnutí" : systemLanguage === "hu" ? "AI Tárgyaló & Megbeszélés Elemzés" : "AI Meeting Room & Note Summarizer"}
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  {systemLanguage === "sk" 
                    ? "Nahrávajte stretnutia, sledujte prepisy a nechajte umelú inteligenciu vygenerovať zhrnutia a úlohy." 
                    : systemLanguage === "hu" 
                      ? "Rögzítse megbeszéléseit, tekintse meg a leiratokat, és hagyja, hogy a mesterséges inteligenciát összefoglalót készítsen." 
                      : "Log call/meeting notes, view raw conversations, and let AI automatically extract key take-aways, sentiment analysis, and follow-up actions."}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => {
                    window.location.hash = "meetings/new?record=true";
                  }}
                  className="px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 transition-all font-heading font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 shrink-0"
                >
                  <Mic className="h-4.5 w-4.5" />
                  {systemLanguage === "sk" ? "Nahrať stretnutie" : systemLanguage === "hu" ? "Rögzítés" : "Record Meeting"}
                </button>
                <button
                  onClick={() => { window.location.hash = "meetings/new"; }}
                  className="px-5 py-3 rounded-2xl bg-[#0b1329] text-white hover:bg-slate-900 shadow-md shadow-[#0b1329]/20 transition-all font-heading font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 shrink-0"
                >
                  <Plus className="h-4.5 w-4.5" />
                  {systemLanguage === "sk" ? "Nové stretnutie" : systemLanguage === "hu" ? "Új megbeszélés" : "New Meeting Note"}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  window.location.hash = "meetings";
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-800 transition-colors text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
                {systemLanguage === "sk" ? "Späť na zoznam" : systemLanguage === "hu" ? "Vissza a listához" : "Back to List"}
              </button>

              {viewState === "detail" && selectedMeeting && (
                <button
                  onClick={() => {
                    const updated = { ...selectedMeeting, archived: !selectedMeeting.archived };
                    setSelectedMeeting(updated);
                    setMeetingNotes(prev => prev.map(m => m.id === selectedMeeting.id ? updated : m));
                    if (typeof (window as any).showToast === "function") {
                      (window as any).showToast(
                        updated.archived
                          ? (systemLanguage === "sk" ? "Zápis bol archivovaný" : systemLanguage === "hu" ? "Jegyzet archiválva" : "Note archived")
                          : (systemLanguage === "sk" ? "Zápis bol obnovený" : systemLanguage === "hu" ? "Jegyzet visszaállítva" : "Note unarchived")
                      );
                    }
                  }}
                  className={cn(
                    "px-4 py-2.5 rounded-xl border text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shrink-0 transition-all hover:scale-[1.02]",
                    selectedMeeting.archived
                      ? "border-rose-200 bg-rose-600 text-white hover:bg-rose-700"
                      : "border-rose-200 bg-white text-rose-600 hover:bg-rose-50/50 hover:text-rose-700"
                  )}
                >
                  <Archive className="h-4 w-4" />
                  {selectedMeeting.archived ? (
                    <>
                      {systemLanguage === "sk" ? "Obnoviť z archívu" : systemLanguage === "hu" ? "Visszaállítás" : "Restore"}
                    </>
                  ) : (
                    <>
                      {systemLanguage === "sk" ? "Archivovať" : systemLanguage === "hu" ? "Archiválás" : "Archive"}
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      )}


      {/* VIEW STATE 1: LIST VIEW */}
      {viewState === "list" && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* LEFT COLUMN: SEARCH & FILTERS */}
          <div className="lg:col-span-1 bg-white/60 backdrop-blur-md p-5 rounded-3xl border border-slate-200/50 shadow-sm space-y-5">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <Filter className="h-3.5 w-3.5" />
              {systemLanguage === "sk" ? "Filtrovať Stretnutia" : systemLanguage === "hu" ? "Keresési Szűrők" : "Filter Meeting Logs"}
            </div>

            {/* Search Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">{systemLanguage === "sk" ? "Kľúčové slovo" : systemLanguage === "hu" ? "Kulcsszó keresés" : "Text Search"}</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder={systemLanguage === "sk" ? "Hľadať v zápisoch..." : systemLanguage === "hu" ? "Keresés a jegyzetekben..." : "Search title or text..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-250 text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Lead filter selection */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">{systemLanguage === "sk" ? "Klient / Lead" : systemLanguage === "hu" ? "Kapcsolódó Lead" : "Associated Lead"}</label>
              <select
                value={selectedLeadFilter}
                onChange={(e) => setSelectedLeadFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-250 text-xs text-slate-700 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="">{systemLanguage === "sk" ? "Všetky kontakty" : systemLanguage === "hu" ? "Összes Ügyfél" : "All Associated Contacts"}</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            {/* Date filter range selection */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">{systemLanguage === "sk" ? "Časový interval" : systemLanguage === "hu" ? "Időtartomány" : "Time Interval"}</label>
              <div className="flex flex-col gap-1.5">
                {(["all", "today", "week", "month"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setDateFilter(opt)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer",
                      dateFilter === opt
                        ? "bg-[#0b1329] text-white"
                        : "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    )}
                  >
                    {opt === "all" && (systemLanguage === "sk" ? "Všetko" : systemLanguage === "hu" ? "Minden" : "All Time")}
                    {opt === "today" && (systemLanguage === "sk" ? "Dnes" : systemLanguage === "hu" ? "Ma" : "Today")}
                    {opt === "week" && (systemLanguage === "sk" ? "Posledný týždeň" : systemLanguage === "hu" ? "Elmúlt 7 nap" : "Last 7 Days")}
                    {opt === "month" && (systemLanguage === "sk" ? "Posledný mesiac" : systemLanguage === "hu" ? "Elmúlt 30 nap" : "Last 30 Days")}
                  </button>
                ))}
              </div>
            </div>

            {/* Show Archived toggle */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <label htmlFor="show-archived" className="text-xs font-semibold text-slate-650 cursor-pointer select-none">
                {systemLanguage === "sk" ? "Zobraziť archivované" : systemLanguage === "hu" ? "Archiváltak megjelenítése" : "Show Archived"}
              </label>
              <input
                id="show-archived"
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-650 focus:ring-indigo-500 cursor-pointer"
              />
            </div>
          </div>

          {/* RIGHT COLUMN: LIST OF MEETINGS */}
          <div className="lg:col-span-3 space-y-4">
            {filteredMeetings.length === 0 ? (
              <div className="bg-white/60 backdrop-blur-md p-12 rounded-3xl border border-slate-200/50 shadow-sm text-center max-w-md mx-auto">
                <AlertCircle className="h-10 w-10 text-slate-400 mx-auto mb-4" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
                  {systemLanguage === "sk" ? "Nenašli sa žiadne stretnutia" : systemLanguage === "hu" ? "Nincs találat" : "No Meeting Logs Found"}
                </h3>
                <p className="text-xs text-slate-400 mt-2 font-medium">
                  {systemLanguage === "sk" 
                    ? "Vyskúšajte zmeniť vyhľadávacie frázy alebo filtre." 
                    : systemLanguage === "hu" 
                      ? "Módosítsa a keresési feltételeket a találatok megjelenítéséhez." 
                      : "Try adjusting your filters or search keywords, or record a new meeting note."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMeetings.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => handleSelectMeeting(m)}
                    className="group bg-white border border-slate-200/80 rounded-2xl px-6 py-4 hover:border-slate-800 hover:shadow-md transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 hover:scale-[1.005]"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {/* Date Badge */}
                      <div className="flex flex-col items-center justify-center bg-slate-50 border border-slate-200/60 rounded-xl p-2 w-16 shrink-0 text-center">
                        <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider leading-none">
                          {new Date(m.date).toLocaleString('default', { month: 'short' })}
                        </span>
                        <span className="text-base font-heading font-black text-slate-800 leading-tight">
                          {new Date(m.date).getDate()}
                        </span>
                      </div>

                      {/* Main Details */}
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h4 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">
                            {m.title}
                          </h4>
                          <span className="shrink-0 flex items-center gap-1 bg-slate-50 text-slate-550 text-[10px] font-bold px-2.5 py-0.5 rounded-lg border border-slate-200/60">
                            <Clock className="h-3 w-3 text-slate-400" />
                            {m.duration} min
                          </span>
                          {m.audioFile && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectMeeting(m);
                              }}
                              className="shrink-0 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white flex items-center justify-center shadow-md shadow-rose-600/30 transition-all cursor-pointer hover:scale-105 active:scale-95"
                              title={t("Play recording", "Prehrať nahrávku", "Felvétel lejátszása")}
                            >
                              <Mic className="h-3 w-3 fill-white" />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-450 line-clamp-1 leading-relaxed">
                          {m.aiSummary.summary}
                        </p>
                      </div>
                    </div>

                    {/* Metadata & Sentiment */}
                    <div className="flex items-center justify-between md:justify-end gap-6 shrink-0 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
                      <span className="flex items-center gap-1.5 text-xs text-slate-550 font-semibold">
                        <User className="h-4 w-4 text-slate-400" />
                        {m.leadName}
                      </span>
                      <div className="w-24 flex justify-end">
                        {getSentimentBadge(m.aiSummary.sentiment)}
                      </div>
                      
                      {/* Archive/Unarchive Action Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const updated = { ...m, archived: !m.archived };
                          setMeetingNotes(prev => prev.map(item => item.id === m.id ? updated : item));
                          if (typeof (window as any).showToast === "function") {
                            (window as any).showToast(
                              updated.archived
                                ? (systemLanguage === "sk" ? "Zápis bol archivovaný" : systemLanguage === "hu" ? "Jegyzet archiválva" : "Note archived")
                                : (systemLanguage === "sk" ? "Zápis bol obnovený" : systemLanguage === "hu" ? "Jegyzet visszaállítva" : "Note unarchived")
                            );
                          }
                        }}
                        className={cn(
                          "shrink-0 w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95",
                          m.archived 
                            ? "bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100" 
                            : "bg-slate-50 border-slate-200 text-slate-550 hover:text-slate-800 hover:bg-slate-100"
                        )}
                        title={m.archived 
                          ? (systemLanguage === "sk" ? "Obnoviť z archívu" : systemLanguage === "hu" ? "Visszaállítás" : "Restore from Archive") 
                          : (systemLanguage === "sk" ? "Archivovať" : systemLanguage === "hu" ? "Archiválás" : "Archive")
                        }
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW STATE 2: DETAIL VIEW */}
      {viewState === "detail" && selectedMeeting && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* LEFT COLUMN: THE WHOLE A4 PAPER SHEET */}
          <div className="lg:col-span-2 flex flex-col items-center">
            {renderRecordingBar()}
            <div className="w-full max-w-[850px] bg-white border border-slate-300 shadow-2xl rounded-[2px] px-12 md:px-16 py-12 md:py-16 flex flex-col justify-start transition-all relative min-h-[800px]">
              {/* Document Title (Editable inside the A4 Sheet - Seamless and borderless) */}
              <div className="w-full mb-6">
                <input
                  type="text"
                  placeholder={t("Untitled Document...", "Názov dokumentu / stretnutia...", "Névtelen dokumentum...")}
                  value={selectedMeeting.title}
                  onChange={(e) => {
                    const updated = { ...selectedMeeting, title: e.target.value };
                    setSelectedMeeting(updated);
                    setMeetingNotes((prev) => prev.map((m) => m.id === selectedMeeting.id ? updated : m));
                  }}
                  className="w-full text-3xl font-heading font-black text-slate-800 placeholder:text-slate-355 bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:border-none p-0 m-0"
                />
              </div>

              {/* Tab Selector */}
              {transcriptionAvailable && (
                <div className="flex border-b border-slate-200 mb-6 gap-4">
                  <button
                    type="button"
                    onClick={() => setActiveTab("manual")}
                    className={cn(
                      "pb-2 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all",
                      activeTab === "manual" ? "border-indigo-600 text-indigo-600 font-extrabold" : "border-transparent text-slate-400 hover:text-slate-600 font-semibold"
                    )}
                  >
                    {systemLanguage === "sk" ? "Ručné poznámky" : systemLanguage === "hu" ? "Kézi jegyzetek" : "Manual Notes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("transcription")}
                    className={cn(
                      "pb-2 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all",
                      activeTab === "transcription" ? "border-indigo-600 text-indigo-600 font-extrabold" : "border-transparent text-slate-400 hover:text-slate-600 font-semibold"
                    )}
                  >
                    {systemLanguage === "sk" ? "Prepis nahrávky" : systemLanguage === "hu" ? "Leirat" : "Transcription"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("automated")}
                    className={cn(
                      "pb-2 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all",
                      activeTab === "automated" ? "border-indigo-600 text-indigo-600 font-extrabold" : "border-transparent text-slate-400 hover:text-slate-600 font-semibold"
                    )}
                  >
                    {systemLanguage === "sk" ? "AI Výstup" : systemLanguage === "hu" ? "AI Jegyzet" : "Automated Notes"}
                  </button>
                </div>
              )}

              {/* Content Panel */}
              {activeTab === "manual" && (
                <div className="outline-none">
                  <BlockEditor
                    key={selectedMeeting.id}
                    initialBlocks={parseNotesToBlocks(selectedMeeting.notes)}
                    onChange={(updatedBlocks) => {
                      const updated = { ...selectedMeeting, notes: JSON.stringify(updatedBlocks) };
                      setSelectedMeeting(updated);
                      setMeetingNotes((prev) => prev.map((m) => m.id === selectedMeeting.id ? updated : m));
                    }}
                    systemLanguage={systemLanguage}
                  />
                </div>
              )}

              {activeTab === "transcription" && (
                <div className="text-slate-700 text-xs font-medium leading-relaxed bg-slate-50 border border-slate-200/60 p-6 rounded-2xl max-h-[500px] overflow-y-auto whitespace-pre-wrap select-text text-left">
                  {selectedMeeting.transcription || t("No transcription available.", "Žiadny prepis k dispozícii.", "Nincs elérhető átirat.")}
                </div>
              )}

              {activeTab === "automated" && (
                <div className="prose prose-slate max-w-none text-xs font-medium leading-relaxed bg-indigo-50/20 border border-indigo-100/50 p-6 rounded-2xl max-h-[500px] overflow-y-auto select-text text-left">
                  <Markdown content={selectedMeeting.automatedNotes || ""} />
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: AI MEETING ASSISTANT PANEL + ASSIGNMENT CARD */}
          <div className="lg:col-span-1 space-y-6">
            {renderAiAssistantPanel(selectedMeeting)}

            {/* Item 8: assign a client or a project manager to this meeting */}
            {(() => {
              const meeting = selectedMeeting;
              const applyUpdate = (patch: Partial<MeetingNote>) => {
                const updated = { ...meeting, ...patch };
                setSelectedMeeting(updated);
                setMeetingNotes((prev) => prev.map((m) => (m.id === meeting.id ? updated : m)));
              };
              const assignedClients = meeting.attachedClients || [];
              const assignedUsers = meeting.attachedUsers || [];
              return (
                <div className="bg-white/60 backdrop-blur-md p-5 rounded-3xl border border-slate-200/50 shadow-sm space-y-4">
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                    <Users className="h-4 w-4 text-indigo-600" />
                    {t("Assign", "Priradiť", "Hozzárendelés")}
                  </h3>

                  {/* Client assignment */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      {t("Client", "Klient", "Ügyfél")}
                    </label>
                    <select
                      value=""
                      onChange={(e) => {
                        const id = e.target.value;
                        if (id && !assignedClients.includes(id)) {
                          applyUpdate({ attachedClients: [...assignedClients, id] });
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 text-xs font-bold focus:outline-none cursor-pointer"
                    >
                      <option value="">{t("Add client...", "Pridať klienta...", "Ügyfél hozzáadása...")}</option>
                      {leads
                        .filter((l) => !assignedClients.includes(String(l.id)))
                        .map((l) => (
                          <option key={l.id} value={String(l.id)}>{l.name}</option>
                        ))}
                    </select>
                    {assignedClients.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {assignedClients.map((id) => {
                          const c = leads.find((l) => String(l.id) === id);
                          return (
                            <span key={id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
                              {c?.name || id}
                              <button
                                type="button"
                                onClick={() => applyUpdate({ attachedClients: assignedClients.filter((x) => x !== id) })}
                                className="text-emerald-500 hover:text-rose-500 cursor-pointer"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Project manager assignment */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      {t("Project Manager", "Projektový manažér", "Projektmenedzser")}
                    </label>
                    <select
                      value=""
                      onChange={(e) => {
                        const name = e.target.value;
                        if (name && !assignedUsers.includes(name)) {
                          applyUpdate({ attachedUsers: [...assignedUsers, name] });
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 text-xs font-bold focus:outline-none cursor-pointer"
                    >
                      <option value="">{t("Add manager...", "Pridať manažéra...", "Menedzser hozzáadása...")}</option>
                      {users
                        .filter((u) => !assignedUsers.includes(u.name))
                        .map((u) => (
                          <option key={u.name} value={u.name}>{u.name}</option>
                        ))}
                    </select>
                    {assignedUsers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {assignedUsers.map((name) => (
                          <span key={name} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-[10px] font-bold text-indigo-700">
                            {name}
                            <button
                              type="button"
                              onClick={() => applyUpdate({ attachedUsers: assignedUsers.filter((x) => x !== name) })}
                              className="text-indigo-500 hover:text-rose-500 cursor-pointer"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* VIEW STATE 3: CREATE NEW MEETING */}
      {viewState === "new" && (
        <div className="w-full flex flex-col items-center bg-slate-100/50 -mx-4 px-4 py-6 md:p-8 min-h-screen">
          {/* FLOATING STICKY HEADER CARD */}
          <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-md rounded-[20px] p-3 mb-8 w-full max-w-5xl flex flex-wrap items-center justify-between gap-4 transition-all">
            {/* Left controls: Back, Date */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  window.location.hash = "meetings";
                }}
                className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-550 hover:text-slate-800 hover:bg-slate-50 transition-all cursor-pointer shrink-0"
                title={t("Back to list", "Späť na zoznam", "Vissza a listához")}
              >
                <ArrowLeft className="h-4.5 w-4.5" />
              </button>
              
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
                  />
                </div>
                {recordingState === "none" && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecordingState("idle");
                      setUploadedAudioFile(null);
                      setAudioUrl(null);
                    }}
                    className="w-3.5 h-3.5 rounded-full bg-rose-600 border border-white hover:bg-rose-700 hover:scale-110 active:scale-95 transition-all cursor-pointer shadow-md shadow-rose-600/30 animate-pulse shrink-0"
                    title={t("Enable recording", "Zapnúť nahrávanie", "Felvétel engedélyezése")}
                  />
                )}
              </div>
            </div>

            {/* Middle controls: Attach dropdowns */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-655">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider shrink-0 mr-1">
                {t("Attach:", "Priradiť:", "Csatolás:")}
              </span>

              {/* LEADS MULTI-SELECT */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setActiveDropdown(activeDropdown === "leads" ? null : "leads")}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-700 cursor-pointer font-bold transition-all"
                >
                  <Filter className="h-3.5 w-3.5 text-indigo-505" />
                  <span>{t("Leads", "Leady", "Leadek")} ({attachedLeads.length})</span>
                  <ChevronDown className="h-3 w-3 text-slate-405" />
                </button>
                {activeDropdown === "leads" && (
                  <div className="absolute left-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2.5 flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder={t("Search leads...", "Hľadať leady...", "Leadek keresése...")}
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:border-indigo-500"
                    />
                    <div className="max-h-40 overflow-y-auto flex flex-col gap-0.5">
                      {leadsList.filter(l => l.name.toLowerCase().includes(leadSearch.toLowerCase())).length === 0 ? (
                        <div className="text-[11px] text-slate-400 p-2 text-center">{t("No leads found", "Nenašli sa žiadne leady", "Nincs találat")}</div>
                      ) : (
                        leadsList.filter(l => l.name.toLowerCase().includes(leadSearch.toLowerCase())).map(l => {
                          const isSelected = attachedLeads.includes(l.id);
                          return (
                            <label
                              key={l.id}
                              className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-[11px] text-slate-750 font-bold"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setAttachedLeads(prev =>
                                    isSelected ? prev.filter(x => x !== l.id) : [...prev, l.id]
                                  );
                                }}
                                className="rounded text-indigo-600 border-slate-355 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                              />
                              <span className="truncate">{l.name}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* CLIENTS MULTI-SELECT */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setActiveDropdown(activeDropdown === "clients" ? null : "clients")}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-700 cursor-pointer font-bold transition-all"
                >
                  <User className="h-3.5 w-3.5 text-emerald-505" />
                  <span>{t("Clients", "Klienti", "Ügyfelek")} ({attachedClients.length})</span>
                  <ChevronDown className="h-3 w-3 text-slate-405" />
                </button>
                {activeDropdown === "clients" && (
                  <div className="absolute left-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2.5 flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder={t("Search clients...", "Hľadať klientov...", "Ügyfelek keresése...")}
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:border-indigo-500"
                    />
                    <div className="max-h-40 overflow-y-auto flex flex-col gap-0.5">
                      {clientsList.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 ? (
                        <div className="text-[11px] text-slate-400 p-2 text-center">{t("No clients found", "Nenašli sa žiadni klienti", "Nincs találat")}</div>
                      ) : (
                        clientsList.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).map(c => {
                          const isSelected = attachedClients.includes(c.id);
                          return (
                            <label
                              key={c.id}
                              className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-[11px] text-slate-750 font-bold"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setAttachedClients(prev =>
                                    isSelected ? prev.filter(x => x !== c.id) : [...prev, c.id]
                                  );
                                }}
                                className="rounded text-indigo-600 border-slate-355 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                              />
                              <span className="truncate">{c.name}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* USERS MULTI-SELECT */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setActiveDropdown(activeDropdown === "users" ? null : "users")}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-700 cursor-pointer font-bold transition-all"
                >
                  <Users className="h-3.5 w-3.5 text-purple-505" />
                  <span>{t("Team", "Tím", "Csapat")} ({attachedUsers.length})</span>
                  <ChevronDown className="h-3 w-3 text-slate-405" />
                </button>
                {activeDropdown === "users" && (
                  <div className="absolute left-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2.5 flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder={t("Search users...", "Hľadať používateľov...", "Felhasználók keresése...")}
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:border-indigo-500"
                    />
                    <div className="max-h-40 overflow-y-auto flex flex-col gap-0.5">
                      {users.filter(u => u.name.toLowerCase().includes(userSearch.toLowerCase())).length === 0 ? (
                        <div className="text-[11px] text-slate-400 p-2 text-center">{t("No team members found", "Nenašli sa žiadni členovia tímu", "Nincs találat")}</div>
                      ) : (
                        users.filter(u => u.name.toLowerCase().includes(userSearch.toLowerCase())).map(u => {
                          const isSelected = attachedUsers.includes(u.name);
                          return (
                            <label
                              key={u.name}
                              className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-[11px] text-slate-750 font-bold"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setAttachedUsers(prev =>
                                    isSelected ? prev.filter(x => x !== u.name) : [...prev, u.name]
                                  );
                                }}
                                className="rounded text-indigo-600 border-slate-355 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                              />
                              <span className="truncate">{u.name} ({u.role})</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Close active dropdown backdrop trick */}
              {activeDropdown && (
                <div
                  className="fixed inset-0 z-40 bg-transparent"
                  onClick={() => setActiveDropdown(null)}
                />
              )}
            </div>

            {/* Right controls: Save button */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-400 font-bold animate-pulse">
                {t("Autosaving...", "Automatické ukladanie...", "Automatikus mentés...")}
              </span>
              <button
                type="button"
                onClick={() => handleSaveNewMeeting()}
                className="px-5 py-1.5 rounded-xl bg-black text-white hover:bg-slate-800 font-heading font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 hover:scale-[1.01] active:scale-95 shadow-md shadow-black/10"
              >
                {t("Save Document", "Uložiť", "Dokumentum mentése")}
              </button>
            </div>

            {/* Attached tags row */}
            {(attachedLeads.length > 0 || attachedClients.length > 0 || attachedUsers.length > 0) && (
              <div className="w-full flex flex-wrap items-center gap-1.5 border-t border-slate-100/50 pt-2.5 mt-1">
                {attachedLeads.map(leadId => {
                  const leadObj = leads.find(l => String(l.id) === leadId);
                  if (!leadObj) return null;
                  return (
                    <span key={leadId} className="flex items-center gap-1 bg-indigo-50 text-indigo-700 text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-lg border border-indigo-200/40">
                      <span>{t("Lead", "Lead", "Lead")}: {leadObj.name}</span>
                      <button
                        type="button"
                        onClick={() => setAttachedLeads(prev => prev.filter(x => x !== leadId))}
                        className="hover:text-indigo-900 transition-colors p-0.5 hover:bg-indigo-100 rounded cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}

                {attachedClients.map(clientId => {
                  const clientObj = leads.find(l => String(l.id) === clientId);
                  if (!clientObj) return null;
                  return (
                    <span key={clientId} className="flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-lg border border-emerald-200/40">
                      <span>{t("Client", "Klient", "Ügyfél")}: {clientObj.name}</span>
                      <button
                        type="button"
                        onClick={() => setAttachedClients(prev => prev.filter(x => x !== clientId))}
                        className="hover:text-emerald-900 transition-colors p-0.5 hover:bg-emerald-100 rounded cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}

                {attachedUsers.map(userName => {
                  const userObj = users.find(u => u.name === userName);
                  const userRole = userObj ? userObj.role : "";
                  return (
                    <span key={userName} className="flex items-center gap-1 bg-purple-50 text-purple-700 text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-lg border border-purple-200/40">
                      <span>{t("Team", "Tím", "Csapat")}: {userName} {userRole && `(${userRole})`}</span>
                      <button
                        type="button"
                        onClick={() => setAttachedUsers(prev => prev.filter(x => x !== userName))}
                        className="hover:text-purple-900 transition-colors p-0.5 hover:bg-purple-100 rounded cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recording Bar */}
          {renderRecordingBar()}

          {newSummaryGenerated ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start w-full max-w-7xl">
              {/* LEFT COLUMN: THE WHOLE A4 PAPER SHEET */}
              <div className="lg:col-span-2 flex flex-col items-center">
                <div className="w-full bg-white border border-slate-300 shadow-2xl rounded-[2px] px-12 md:px-16 py-12 md:py-16 flex flex-col justify-start transition-all relative min-h-[800px]">
                  <div className="space-y-6">
                    {/* Document Title (Editable inside the A4 Sheet - Seamless and borderless) */}
                    <div className="w-full mb-6">
                      <input
                        type="text"
                        placeholder={t("Untitled Document...", "Názov dokumentu / stretnutia...", "Névtelen dokumentum...")}
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="w-full text-3xl font-heading font-black text-slate-800 placeholder:text-slate-300 bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:border-none p-0 m-0"
                      />
                    </div>

                    {/* Tab Selector */}
                    {transcriptionAvailable && (
                      <div className="flex border-b border-slate-200 mb-6 gap-4">
                        <button
                          type="button"
                          onClick={() => setActiveTab("manual")}
                          className={cn(
                            "pb-2 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all",
                            activeTab === "manual" ? "border-indigo-600 text-indigo-600 font-extrabold" : "border-transparent text-slate-400 hover:text-slate-600 font-semibold"
                          )}
                        >
                          {systemLanguage === "sk" ? "Ručné poznámky" : systemLanguage === "hu" ? "Kézi jegyzetek" : "Manual Notes"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("transcription")}
                          className={cn(
                            "pb-2 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all",
                            activeTab === "transcription" ? "border-indigo-600 text-indigo-600 font-extrabold" : "border-transparent text-slate-400 hover:text-slate-600 font-semibold"
                          )}
                        >
                          {systemLanguage === "sk" ? "Prepis nahrávky" : systemLanguage === "hu" ? "Leirat" : "Transcription"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("automated")}
                          className={cn(
                            "pb-2 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all",
                            activeTab === "automated" ? "border-indigo-600 text-indigo-600 font-extrabold" : "border-transparent text-slate-400 hover:text-slate-600 font-semibold"
                          )}
                        >
                          {systemLanguage === "sk" ? "AI Výstup" : systemLanguage === "hu" ? "AI Jegyzet" : "Automated Notes"}
                        </button>
                      </div>
                    )}

                    {/* Content Panel */}
                    {activeTab === "manual" && (
                      <div className="outline-none">
                        <BlockEditor
                          initialBlocks={newBlocks}
                          onChange={(blocks) => setNewBlocks(blocks)}
                          systemLanguage={systemLanguage}
                        />
                      </div>
                    )}

                    {activeTab === "transcription" && (
                      <div className="text-slate-700 text-xs font-medium leading-relaxed bg-slate-50 border border-slate-200/60 p-6 rounded-2xl max-h-[500px] overflow-y-auto whitespace-pre-wrap select-text text-left">
                        {newTranscription || t("No transcription available.", "Žiadny prepis k dispozícii.", "Nincs elérhető átirat.")}
                      </div>
                    )}

                    {activeTab === "automated" && (
                      <div className="prose prose-slate max-w-none text-xs font-medium leading-relaxed bg-indigo-50/20 border border-indigo-100/50 p-6 rounded-2xl max-h-[500px] overflow-y-auto select-text text-left">
                        <Markdown content={newAutomatedNotes || ""} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: AI MEETING ASSISTANT PANEL */}
              <div className="lg:col-span-1">
                {renderAiAssistantPanel(synthesizedMeeting)}
              </div>
            </div>
          ) : (
            /* A4 SHEET WRAPPER (INFINITE GROWING PAPER SHEET) */
            <div className="w-full max-w-[850px] bg-white border border-slate-300 shadow-2xl rounded-[2px] px-12 md:px-16 py-12 md:py-16 flex flex-col justify-start transition-all relative">
              <div className="space-y-6">
                {/* Document Title (Editable inside the A4 Sheet - Seamless and borderless) */}
                <div className="w-full mb-6">
                  <input
                    type="text"
                    placeholder={t("Untitled Document...", "Názov dokumentu / stretnutia...", "Névtelen dokumentum...")}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full text-3xl font-heading font-black text-slate-800 placeholder:text-slate-300 bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:border-none p-0 m-0"
                  />
                </div>

                {/* Tab Selector */}
                {transcriptionAvailable && (
                  <div className="flex border-b border-slate-200 mb-6 gap-4">
                    <button
                      type="button"
                      onClick={() => setActiveTab("manual")}
                      className={cn(
                        "pb-2 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all",
                        activeTab === "manual" ? "border-indigo-600 text-indigo-600 font-extrabold" : "border-transparent text-slate-400 hover:text-slate-600 font-semibold"
                      )}
                    >
                      {systemLanguage === "sk" ? "Ručné poznámky" : systemLanguage === "hu" ? "Kézi jegyzetek" : "Manual Notes"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("transcription")}
                      className={cn(
                        "pb-2 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all",
                        activeTab === "transcription" ? "border-indigo-600 text-indigo-600 font-extrabold" : "border-transparent text-slate-400 hover:text-slate-600 font-semibold"
                      )}
                    >
                      {systemLanguage === "sk" ? "Prepis nahrávky" : systemLanguage === "hu" ? "Leirat" : "Transcription"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("automated")}
                      className={cn(
                        "pb-2 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all",
                        activeTab === "automated" ? "border-indigo-600 text-indigo-600 font-extrabold" : "border-transparent text-slate-400 hover:text-slate-600 font-semibold"
                      )}
                    >
                      {systemLanguage === "sk" ? "AI Výstup" : systemLanguage === "hu" ? "AI Jegyzet" : "Automated Notes"}
                    </button>
                  </div>
                )}

                {/* Content Panel */}
                {activeTab === "manual" && (
                  <div className="outline-none">
                    <BlockEditor
                      initialBlocks={newBlocks}
                      onChange={(blocks) => setNewBlocks(blocks)}
                      systemLanguage={systemLanguage}
                    />
                  </div>
                )}

                {activeTab === "transcription" && (
                  <div className="text-slate-700 text-xs font-medium leading-relaxed bg-slate-50 border border-slate-200/60 p-6 rounded-2xl max-h-[500px] overflow-y-auto whitespace-pre-wrap select-text text-left">
                    {newTranscription || t("No transcription available.", "Žiadny prepis k dispozícii.", "Nincs elérhető átirat.")}
                  </div>
                )}

                {activeTab === "automated" && (
                  <div className="prose prose-slate max-w-none text-xs font-medium leading-relaxed bg-indigo-50/20 border border-indigo-100/50 p-6 rounded-2xl max-h-[500px] overflow-y-auto select-text text-left">
                    <Markdown content={newAutomatedNotes || ""} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {/* TASK DETAILS SLIDEOUT DRAWER */}
      {activeTaskForEdit && createPortal(
        <>
          <div className={`fixed inset-0 z-[100000] bg-slate-950/45 backdrop-blur-xs transition-opacity ${isClosingTaskDrawer ? "animate-fade-out" : "animate-fade-in"}`} onClick={closeTaskDrawer} />
          <div className={`fixed top-0 right-0 bottom-0 z-[100001] w-full max-w-md bg-white shadow-2xl flex flex-col border-l border-slate-200/80 ${isClosingTaskDrawer ? "animate-slide-out-right" : "animate-slide-in-right"}`}>
            {/* Header */}
            <div className="p-6 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <div className="space-y-1 text-left">
                <span className="text-[9px] font-black bg-indigo-50 border border-indigo-150/10 text-indigo-700 px-2 py-0.5 rounded uppercase tracking-widest">
                  {t("Task Specification", "Špecifikácia úlohy", "Feladat specifikáció")}
                </span>
                <h3 className="text-sm font-extrabold text-slate-800">{t("Edit Automated Task", "Upraviť automatickú úlohu", "Automatikus feladat szerkesztése")}</h3>
              </div>
              <button
                type="button"
                onClick={closeTaskDrawer}
                className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form Fields */}
            <div className="flex-1 p-6 overflow-y-auto space-y-5 text-left">
              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("Task Title", "Názov úlohy", "Feladat címe")}</label>
                <input
                  type="text"
                  value={activeTaskForEdit.title}
                  onChange={(e) => setActiveTaskForEdit(prev => prev ? { ...prev, title: e.target.value } : null)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("Description", "Popis", "Leírás")}</label>
                <textarea
                  rows={4}
                  value={activeTaskForEdit.description}
                  onChange={(e) => setActiveTaskForEdit(prev => prev ? { ...prev, description: e.target.value } : null)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all leading-relaxed"
                />
              </div>

              {/* Assigned User */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("Assigned Team Member", "Priradený člen tímu", "Hozzárendelt csapattag")}</label>
                <select
                  value={activeTaskForEdit.assignedUser}
                  onChange={(e) => setActiveTaskForEdit(prev => prev ? { ...prev, assignedUser: e.target.value } : null)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
                >
                  <option value="">{t("Unassigned", "Nepriradené", "Nincs hozzárendelve")}</option>
                  {users.map(u => (
                    <option key={u.name} value={u.name}>{u.name}</option>
                  ))}
                </select>
              </div>

              {/* Start Date */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("Start Date", "Dátum začatia", "Kezdő dátum")}</label>
                <input
                  type="date"
                  value={activeTaskForEdit.startDate || ""}
                  onChange={(e) => setActiveTaskForEdit(prev => prev ? { ...prev, startDate: e.target.value } : null)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
                />
              </div>

              {/* Due Date */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("Due Date", "Termín", "Határidő")}</label>
                <input
                  type="date"
                  value={activeTaskForEdit.dueDate}
                  onChange={(e) => setActiveTaskForEdit(prev => prev ? { ...prev, dueDate: e.target.value } : null)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
                />
              </div>

              {/* Priority & Status Row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("Priority", "Priorita", "Prioritás")}</label>
                  <select
                     value={activeTaskForEdit.priority}
                     onChange={(e) => setActiveTaskForEdit(prev => prev ? { ...prev, priority: e.target.value as any } : null)}
                     className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="low">{t("Low", "Nízka", "Alacsony")}</option>
                    <option value="medium">{t("Medium", "Stredná", "Közepes")}</option>
                    <option value="high">{t("High", "Vysoká", "Magas")}</option>
                  </select>
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("Status", "Stav", "Állapot")}</label>
                  <select
                    value={activeTaskForEdit.status}
                    onChange={(e) => setActiveTaskForEdit(prev => prev ? { ...prev, status: e.target.value as any } : null)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="todo">{t("To Do", "Na vykonanie", "Teendő")}</option>
                    <option value="in_progress">{t("In Progress", "Prebieha", "Folyamatban")}</option>
                    <option value="done">{t("Completed", "Dokončené", "Befejezve")}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-6 border-t border-slate-150 flex gap-3 bg-slate-50">
              <button
                type="button"
                onClick={closeTaskDrawer}
                className="flex-1 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-650 hover:text-slate-800 rounded-xl text-xs font-heading font-black uppercase tracking-wider transition-colors cursor-pointer animate-none"
              >
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
              <button
                type="button"
                onClick={() => handleSaveTaskDetails(activeTaskForEdit)}
                className="flex-1 py-2.5 bg-indigo-650 hover:bg-indigo-600 hover:text-white rounded-xl text-xs font-heading font-black uppercase tracking-wider transition-colors cursor-pointer animate-none"
              >
                {t("Save Changes", "Uložiť zmeny", "Módosítások mentése")}
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};
