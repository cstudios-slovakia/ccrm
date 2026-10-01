import React, { useState, useRef, useEffect } from "react";
import { Mic, Plus, X, Check, Loader2, Volume2, Play, Pause } from "lucide-react";
import type { Task, UserProfile } from "../types";
import type { Language } from "../utils/translations";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

const toLocalDateStr = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const formatVoiceDuration = (sec: number) => {
    const total = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
    const mins = Math.floor(total / 60);
    const s = total % 60;
    return `${mins}:${String(s).padStart(2, "0")}`;
};

export interface VoiceTaskActionBarProps {
    onTasksCreated: (createdTasks: Task[]) => void;
    onManualCreateClick?: (e?: React.MouseEvent) => void;
    systemLanguage?: Language;
    currentUser?: UserProfile | null;
    users?: UserProfile[];
    defaultAssignee?: string;
    defaultStatus?: string;
    relatedLeadId?: string;
    relatedProjectId?: string;
    isLocking?: boolean;
    canCreate?: boolean;
    manualButtonText?: string;
    manualButtonIcon?: React.ReactNode;
    manualButtonClassName?: string;
    voiceButtonClassName?: string;
    containerClassName?: string;
    hideManualButton?: boolean;
    isSubmittingManual?: boolean;
}

export const VoiceTaskActionBar: React.FC<VoiceTaskActionBarProps> = ({
    onTasksCreated,
    onManualCreateClick,
    systemLanguage = "sk",
    currentUser,
    users = [],
    defaultAssignee,
    defaultStatus = "New",
    relatedLeadId,
    relatedProjectId,
    isLocking = false,
    canCreate = true,
    manualButtonText,
    manualButtonIcon,
    manualButtonClassName,
    voiceButtonClassName,
    containerClassName = "",
    hideManualButton = false,
    isSubmittingManual = false,
}) => {
    const t = (en: string, sk: string, hu: string) => {
        if (systemLanguage === "sk") return sk;
        if (systemLanguage === "hu") return hu;
        return en;
    };

    const myName = currentUser?.name || "";

    const [isVoiceRecording, setIsVoiceRecording] = useState(false);
    const [isVoiceTranscribing, setIsVoiceTranscribing] = useState(false);
    const [voiceRecordDuration, setVoiceRecordDuration] = useState(0);
    const [audioVolumeBars, setAudioVolumeBars] = useState<number[]>([
        12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12,
    ]);

    // Debug audio playback state
    const [lastAudioUrl, setLastAudioUrl] = useState<string | null>(null);
    const [lastAudioBlobSize, setLastAudioBlobSize] = useState<number>(0);
    const [lastAudioMimeType, setLastAudioMimeType] = useState<string>("audio/webm");
    const [lastAudioDuration, setLastAudioDuration] = useState<number>(0);
    const [isPlayingDebug, setIsPlayingDebug] = useState(false);
    const [debugCurrentTime, setDebugCurrentTime] = useState(0);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const voiceTimerRef = useRef<any>(null);
    const recordStartTimeRef = useRef<number>(0);
    const audioStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animFrameRef = useRef<number | null>(null);
    const lastPushTimeRef = useRef<number>(0);
    const debugAudioRef = useRef<HTMLAudioElement | null>(null);
    const durationProbeRef = useRef(false);

    const cleanupAudio = () => {
        if (voiceTimerRef.current) {
            clearInterval(voiceTimerRef.current);
            voiceTimerRef.current = null;
        }
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
            try {
                audioContextRef.current.close();
            } catch (_) {}
            audioContextRef.current = null;
        }
        if (audioStreamRef.current) {
            try {
                audioStreamRef.current.getTracks().forEach((track) => track.stop());
            } catch (_) {}
            audioStreamRef.current = null;
        }
    };

    useEffect(() => {
        return () => {
            cleanupAudio();
            if (lastAudioUrl) {
                URL.revokeObjectURL(lastAudioUrl);
            }
        };
    }, []);

    const handleStartVoiceRecording = async () => {
        if (!canCreate || isVoiceTranscribing || isVoiceRecording) return;
        try {
            audioChunksRef.current = [];

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error(
                    t(
                        "Microphone requires HTTPS or localhost. If on Android over HTTP, please open via HTTPS tunnel or enable chrome://flags/#unsafely-treat-insecure-origin-as-secure.",
                        "Mikrofón vyžaduje HTTPS alebo localhost. Na mobile cez HTTP otvorte zabezpečený HTTPS tunel alebo povoľte chrome://flags.",
                        "A mikrofonhoz HTTPS vagy localhost kapcsolat szükséges. Mobilon nyissa meg HTTPS alagúton keresztül.",
                    ),
                );
            }

            const audioConstraints: MediaStreamConstraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            };

            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia(audioConstraints);
            } catch (err) {
                console.warn("Retrying getUserMedia with basic audio:true fallback:", err);
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            audioStreamRef.current = stream;

            // Real-time audio waveform meter via Web Audio API (strictly visualizer)
            try {
                const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioCtx) {
                    const ctx = new AudioCtx();
                    audioContextRef.current = ctx;
                    if (ctx.state === "suspended") {
                        await ctx.resume();
                    }

                    const source = ctx.createMediaStreamSource(stream);
                    const analyser = ctx.createAnalyser();
                    analyser.fftSize = 128;
                    analyser.smoothingTimeConstant = 0.3;
                    source.connect(analyser);
                    analyserRef.current = analyser;

                    const timeData = new Uint8Array(analyser.fftSize);
                    const freqData = new Uint8Array(analyser.frequencyBinCount);

                    const updateMeter = (timestamp: number) => {
                        if (analyserRef.current) {
                            analyserRef.current.getByteTimeDomainData(timeData);
                            analyserRef.current.getByteFrequencyData(freqData);

                            let maxDev = 0;
                            for (let i = 0; i < timeData.length; i++) {
                                const dev = Math.abs(timeData[i] - 128);
                                if (dev > maxDev) maxDev = dev;
                            }

                            let freqSum = 0;
                            for (let i = 0; i < freqData.length; i++) {
                                freqSum += freqData[i];
                            }
                            const freqAvg = freqSum / (freqData.length || 1);

                            // High sensitivity response for mobile microphones
                            const timeLevel = (maxDev / 35) * 100;
                            const freqLevel = (freqAvg / 30) * 100;
                            const combined = Math.max(timeLevel, freqLevel);
                            const instantLevel = Math.max(12, Math.min(100, Math.round(combined)));

                            if (!lastPushTimeRef.current || timestamp - lastPushTimeRef.current > 40) {
                                lastPushTimeRef.current = timestamp;
                                setAudioVolumeBars((prev) => {
                                    const next = [...prev.slice(1), instantLevel];
                                    return next;
                                });
                            }
                        }
                        animFrameRef.current = requestAnimationFrame(updateMeter);
                    };
                    animFrameRef.current = requestAnimationFrame(updateMeter);
                }
            } catch (err) {
                console.warn("AudioContext setup warning:", err);
            }

            // Determine best supported MIME type
            let mimeType = "audio/webm";
            if (typeof MediaRecorder !== "undefined") {
                if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
                    mimeType = "audio/webm;codecs=opus";
                } else if (MediaRecorder.isTypeSupported("audio/webm")) {
                    mimeType = "audio/webm";
                } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
                    mimeType = "audio/mp4";
                } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
                    mimeType = "audio/ogg;codecs=opus";
                } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
                    mimeType = "audio/ogg";
                } else if (MediaRecorder.isTypeSupported("audio/wav")) {
                    mimeType = "audio/wav";
                } else {
                    mimeType = "";
                }
            }

            const recorderOptions: MediaRecorderOptions = {
                ...(mimeType ? { mimeType } : {}),
            };

            // CRITICAL FOR ANDROID/MOBILE: MediaRecorder must record directly from the physical stream
            const recorder = new MediaRecorder(stream, recorderOptions);
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            // Record in 100ms slices so audio chunks are buffered reliably
            recorder.start(100);
            recordStartTimeRef.current = Date.now();
            setIsVoiceRecording(true);
            setVoiceRecordDuration(0);

            if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
            voiceTimerRef.current = setInterval(() => {
                const elapsed = Math.round((Date.now() - recordStartTimeRef.current) / 1000);
                setVoiceRecordDuration(elapsed);
            }, 250);
        } catch (err: any) {
            console.error("Mic access error:", err);
            if (typeof (window as any).showToast === "function") {
                (window as any).showToast(
                    t(
                        "Microphone access error: " + (err?.message || "Permission denied"),
                        "Chyba prístupu k mikrofónu: " + (err?.message || "Prístup odmietnutý"),
                        "Mikrofon hozzáférési hiba: " + (err?.message || "Hozzáférés megtagadva"),
                    ),
                    "error",
                );
            }
        }
    };

    const handleStopAndProcessVoiceRecording = async () => {
        if (!isVoiceRecording && !mediaRecorderRef.current) return;

        const finalDuration = Math.max(
            1,
            Math.round((Date.now() - (recordStartTimeRef.current || Date.now())) / 1000),
        );
        setLastAudioDuration(finalDuration);

        // Stop duration timer and animation frame
        if (voiceTimerRef.current) {
            clearInterval(voiceTimerRef.current);
            voiceTimerRef.current = null;
        }
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }

        const recorder = mediaRecorderRef.current;
        setIsVoiceRecording(false);
        setIsVoiceTranscribing(true);

        const stopPromise = new Promise<Blob>((resolve) => {
            if (!recorder || recorder.state === "inactive") {
                const mime = recorder?.mimeType || "audio/webm";
                resolve(new Blob(audioChunksRef.current, { type: mime }));
                return;
            }
            recorder.onstop = () => {
                const mime = recorder.mimeType || "audio/webm";
                const blob = new Blob(audioChunksRef.current, { type: mime });
                resolve(blob);
            };
            try {
                if (recorder.state === "recording") {
                    try {
                        recorder.requestData();
                    } catch (_) {}
                    recorder.stop();
                }
            } catch (_) {
                const mime = recorder?.mimeType || "audio/webm";
                resolve(new Blob(audioChunksRef.current, { type: mime }));
            }
        });

        let audioBlob: Blob | null = null;
        try {
            audioBlob = await stopPromise;
        } finally {
            // Safely cleanup audio stream tracks and context AFTER recorder has assembled the blob
            cleanupAudio();
            mediaRecorderRef.current = null;
        }

        if (audioBlob && audioBlob.size > 0) {
            if (lastAudioUrl) {
                URL.revokeObjectURL(lastAudioUrl);
            }
            const url = URL.createObjectURL(audioBlob);
            setLastAudioUrl(url);
            setLastAudioBlobSize(audioBlob.size);
            setLastAudioMimeType(audioBlob.type || "audio/webm");
            setIsPlayingDebug(false);
            setDebugCurrentTime(0);
            durationProbeRef.current = false;
            (window as any).lastRecordedAudioBlob = audioBlob;
            (window as any).lastRecordedAudioUrl = url;
        }

        try {
            if (!audioBlob || audioBlob.size < 200) {
                throw new Error(
                    t(
                        "Recording too short or empty. Please speak clearly.",
                        "Nahrávka je príliš krátka alebo prázdna. Prosím hovorte zreteľne.",
                        "A felvétel túl rövid vagy üres. Kérjük, beszéljen érthetően.",
                    ),
                );
            }

            const ext = audioBlob.type.includes("mp4")
                ? "mp4"
                : audioBlob.type.includes("ogg")
                  ? "ogg"
                  : audioBlob.type.includes("wav")
                    ? "wav"
                    : "webm";
            const formData = new FormData();
            formData.append("audio", audioBlob, `voice_task.${ext}`);
            formData.append("today", toLocalDateStr(new Date()));
            formData.append("language", systemLanguage);
            formData.append("users", JSON.stringify(users.map((u) => u.name)));

            const res = await fetchWithTimeout(
                "/api/transcribe_task.php",
                {
                    method: "POST",
                    body: formData,
                },
                60000,
            );

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(
                    data?.message ||
                        t(
                            "Failed to transcribe voice task",
                            "Nepodarilo sa prepísať hlasovú úlohu",
                            "Nem sikerült átírni a hangfeladatot",
                        ),
                );
            }

            const rawTasks: any[] = data.tasks || [];
            if (rawTasks.length === 0) {
                throw new Error(
                    t(
                        "No tasks could be identified from the voice memo.",
                        "Z hlasového záznamu sa nepodarilo rozpoznať žiadne úlohy.",
                        "A hangjegyzetből nem sikerült feladatot azonosítani.",
                    ),
                );
            }

            const now = Date.now();
            const todayDateStr = toLocalDateStr(new Date());

            const createdTasks: Task[] = rawTasks.map((tItem: any, idx: number) => {
                const matchedUser =
                    tItem.assignedTo &&
                    users.some(
                        (u) => u.name.toLowerCase() === String(tItem.assignedTo).toLowerCase(),
                    )
                        ? users.find(
                              (u) =>
                                  u.name.toLowerCase() ===
                                  String(tItem.assignedTo).toLowerCase(),
                          )?.name || tItem.assignedTo
                        : defaultAssignee || myName;

                const priorityVal =
                    tItem.priority === "high" || tItem.priority === "urgent"
                        ? "high"
                        : tItem.priority === "low"
                          ? "low"
                          : "medium";

                return {
                    id: `task-${now}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
                    title: String(tItem.title || data.transcription || "Voice Task").trim(),
                    description: tItem.description
                        ? String(tItem.description).trim()
                        : data.transcription
                          ? `Voice memo: ${data.transcription}`
                          : "",
                    status: defaultStatus,
                    priority: priorityVal,
                    deadline: tItem.deadline || todayDateStr,
                    deadlineTime: tItem.deadlineTime || undefined,
                    owner: matchedUser,
                    createdBy: myName,
                    assignedUsers: matchedUser ? [matchedUser] : [],
                    relatedLeadId: relatedLeadId || undefined,
                    relatedProjectId: relatedProjectId || undefined,
                    isLocking: isLocking || undefined,
                    isAiGenerated: true,
                };
            });

            onTasksCreated(createdTasks);

            if (typeof (window as any).showToast === "function") {
                const titles = createdTasks.map((tk) => `"${tk.title}"`).join(", ");
                const heardSnippet = data.transcription ? ` (🎤 "${data.transcription}")` : "";
                (window as any).showToast(
                    t(
                        `Voice task created: ${titles}${heardSnippet}`,
                        `Úloha vytvorená: ${titles}${heardSnippet}`,
                        `Hangfeladat létrehozva: ${titles}${heardSnippet}`,
                    ),
                    "success",
                );
            }
        } catch (err: any) {
            console.error("Voice task creation failed:", err);
            if (typeof (window as any).showToast === "function") {
                (window as any).showToast(
                    err?.message ||
                        t(
                            "Error creating voice task",
                            "Chyba pri vytváraní hlasovej úlohy",
                            "Hiba a hangfeladat létrehozásakor",
                        ),
                    "error",
                );
            }
        } finally {
            setIsVoiceTranscribing(false);
            setVoiceRecordDuration(0);
        }
    };

    const handleCancelVoiceRecording = () => {
        cleanupAudio();
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            try {
                mediaRecorderRef.current.stop();
            } catch (_) {}
        }
        mediaRecorderRef.current = null;
        setIsVoiceRecording(false);
        setVoiceRecordDuration(0);
    };

    const togglePlayDebugAudio = () => {
        const el = debugAudioRef.current;
        if (!el) return;
        if (isPlayingDebug) {
            el.pause();
            setIsPlayingDebug(false);
        } else {
            el.play()
                .then(() => {
                    setIsPlayingDebug(true);
                })
                .catch((err) => {
                    console.error("Audio playback failed:", err);
                });
        }
    };

    const handleDebugAudioDurationChange = () => {
        const el = debugAudioRef.current;
        if (!el) return;
        if (!Number.isFinite(el.duration)) {
            if (!durationProbeRef.current) {
                durationProbeRef.current = true;
                try {
                    el.currentTime = 1e101;
                } catch {
                    durationProbeRef.current = false;
                }
            }
            return;
        }
        if (durationProbeRef.current) {
            durationProbeRef.current = false;
            el.currentTime = 0;
            setDebugCurrentTime(0);
        }
    };

    const defaultManualText = t("Create New Task", "Vytvoriť novú úlohu", "Új feladat");
    const labelText = manualButtonText || defaultManualText;

    const renderDebugPlayer = () => {
        if (!lastAudioUrl || isVoiceRecording || isVoiceTranscribing) return null;
        return (
            <div className="w-full flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/60 dark:via-orange-950/60 dark:to-amber-950/60 text-amber-950 dark:text-amber-100 rounded-2xl text-xs font-semibold shadow-md border-2 border-amber-300 dark:border-amber-700/80 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center gap-2 min-w-0">
                    <button
                        type="button"
                        onClick={togglePlayDebugAudio}
                        className="p-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white rounded-xl shadow-md transition-all active:scale-95 cursor-pointer shrink-0 flex items-center justify-center"
                        title={isPlayingDebug ? t("Pause", "Pozastaviť", "Szünet") : t("Play", "Prehrať", "Lejátszás")}
                    >
                        {isPlayingDebug ? (
                            <Pause className="h-4 w-4 fill-white stroke-white" />
                        ) : (
                            <Play className="h-4 w-4 fill-white stroke-white ml-0.5" />
                        )}
                    </button>
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                            <Volume2 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span className="text-xs font-black text-amber-900 dark:text-amber-200 truncate">
                                {t("Recorded Audio Check", "Kontrola nahraného zvuku", "Hangellenőrző")}
                            </span>
                        </div>
                        <span className="text-[10px] font-mono text-amber-700 dark:text-amber-400">
                            {(lastAudioBlobSize / 1024).toFixed(1)} KB • {isPlayingDebug ? `${formatVoiceDuration(debugCurrentTime)} / ` : ""}{formatVoiceDuration(lastAudioDuration)} ({lastAudioMimeType.split(";")[0]})
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-1 justify-end min-w-[200px]">
                    <audio
                        ref={debugAudioRef}
                        controls
                        playsInline
                        preload="auto"
                        src={lastAudioUrl}
                        onPlay={() => setIsPlayingDebug(true)}
                        onPause={() => setIsPlayingDebug(false)}
                        onEnded={() => {
                            setIsPlayingDebug(false);
                            setDebugCurrentTime(0);
                        }}
                        onTimeUpdate={() => setDebugCurrentTime(debugAudioRef.current?.currentTime || 0)}
                        onDurationChange={handleDebugAudioDurationChange}
                        onLoadedMetadata={handleDebugAudioDurationChange}
                        className="h-8 max-w-[200px] sm:max-w-[230px] rounded-lg accent-amber-600"
                    />
                    <button
                        type="button"
                        onClick={() => {
                            if (lastAudioUrl) {
                                URL.revokeObjectURL(lastAudioUrl);
                            }
                            setLastAudioUrl(null);
                            setIsPlayingDebug(false);
                        }}
                        className="p-1.5 text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-white hover:bg-amber-200/60 dark:hover:bg-amber-800/60 rounded-xl transition-all cursor-pointer shrink-0"
                        title={t("Dismiss", "Zatvoriť", "Bezárás")}
                    >
                        <X className="h-4 w-4 stroke-[2.5]" />
                    </button>
                </div>
            </div>
        );
    };

    if (hideManualButton) {
        return (
            <div className={`w-full flex flex-col gap-1.5 ${containerClassName}`}>
                <div className="w-full flex items-center gap-2">
                    {isVoiceTranscribing ? (
                        <div className="w-full py-2.5 px-3 bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 rounded-2xl border-2 border-orange-200/90 shadow-md flex items-center justify-center gap-2 text-orange-700 text-xs font-black uppercase tracking-wider animate-pulse transition-all duration-300 ease-in-out shrink-0">
                            <Loader2 className="h-4 w-4 animate-spin text-[#ff5d00] shrink-0" />
                            <span className="truncate">
                                {t(
                                    "Transcribing voice & creating task…",
                                    "Prepisujem hlas a vytváram úlohu…",
                                    "Hang átírása és feladat készítése…",
                                )}
                            </span>
                        </div>
                    ) : isVoiceRecording ? (
                        <div
                            onClick={handleStopAndProcessVoiceRecording}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    handleStopAndProcessVoiceRecording();
                                }
                            }}
                            title={t(
                                "Click anywhere to send & create task",
                                "Kliknutím odošlite a vytvorte úlohu",
                                "Kattintson a küldéshez és létrehozáshoz",
                            )}
                            className="w-full py-2 px-3 bg-gradient-to-r from-rose-500 via-rose-600 to-rose-700 hover:from-rose-600 hover:to-rose-800 text-white rounded-2xl shadow-lg shadow-rose-500/30 flex items-center justify-between gap-2 border-2 border-rose-400 transition-all duration-300 ease-in-out cursor-pointer active:scale-[0.99] select-none shrink-0 group"
                        >
                            <div className="flex items-center gap-2 shrink-0">
                                <div className="relative flex items-center justify-center shrink-0">
                                    <span className="absolute h-3 w-3 rounded-full bg-white opacity-75 animate-ping" />
                                    <span className="relative h-2.5 w-2.5 rounded-full bg-white shadow-xs" />
                                </div>
                                <span className="font-mono font-black text-xs tracking-wider bg-black/25 px-2 py-0.5 rounded-md shadow-inner shrink-0">
                                    {formatVoiceDuration(voiceRecordDuration)}
                                </span>
                            </div>
                            <div className="flex-1 flex items-center justify-center overflow-hidden px-1">
                                <div className="flex items-center gap-[2px] h-5 overflow-hidden">
                                    {audioVolumeBars.map((height, i) => (
                                        <span
                                            key={i}
                                            className="w-[2.5px] bg-white/95 rounded-full transition-all duration-75 shrink-0 shadow-xs"
                                            style={{
                                                height: `${Math.max(4, (height / 100) * 20)}px`,
                                                opacity: Math.max(0.4, height / 100),
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500 group-hover:bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-wider shadow-sm transition-all border border-emerald-400/80 shrink-0">
                                    <Check className="h-3 w-3 stroke-[3]" />
                                    <span>{t("Send", "Odoslať", "Küldés")}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleCancelVoiceRecording();
                                    }}
                                    className="p-1.5 bg-black/20 hover:bg-black/40 active:bg-black/50 text-white/90 hover:text-white rounded-xl transition-all active:scale-95 cursor-pointer border border-white/20 shrink-0"
                                    title={t("Cancel recording", "Zrušiť nahrávanie", "Felvétel megszakítása")}
                                >
                                    <X className="h-4 w-4 stroke-[2.5]" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={handleStartVoiceRecording}
                            className={
                                voiceButtonClassName ||
                                "w-full py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 active:from-rose-700 active:to-rose-800 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-rose-500/25 transition-all duration-300 ease-in-out active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer border-2 border-rose-400 disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
                            }
                            disabled={!canCreate}
                            title={t(
                                "Record Voice Task (Auto-transcribes and creates task)",
                                "Nahrať úlohu hlasom (Automaticky prepíše a vytvorí úlohu)",
                                "Hangfeladat rögzítése (Automatikusan átírja és létrehozza)",
                            )}
                        >
                            <Mic className="h-4 w-4 shrink-0 stroke-[2.5]" />
                            <span className="text-[11px] truncate">
                                {t("Record Voice Task", "Nahrať hlasovú úlohu", "Hangfeladat felvétele")}
                            </span>
                        </button>
                    )}
                </div>

                {renderDebugPlayer()}
            </div>
        );
    }

    return (
        <div className={`w-full flex flex-col gap-1.5 transition-all duration-300 ease-in-out ${containerClassName}`}>
            <div className="w-full flex items-center gap-2">
                {/* Left Button: Manual Task Creation (80% default, squeezes to 20% during recording) */}
                <button
                    type="button"
                    onClick={(e) => {
                        if (isVoiceRecording) {
                            handleCancelVoiceRecording();
                        }
                        if (!canCreate || isVoiceTranscribing || isSubmittingManual) return;
                        onManualCreateClick?.(e);
                    }}
                    disabled={!canCreate || isVoiceTranscribing || isSubmittingManual}
                    title={
                        isVoiceRecording
                            ? t(
                                  "Cancel recording & create task manually",
                                  "Zrušiť nahrávanie a vytvoriť úlohu ručne",
                                  "Hangfelvétel megszakítása és kézi létrehozás",
                              )
                            : labelText
                    }
                    className={
                        manualButtonClassName
                            ? `${manualButtonClassName} ${
                                  isVoiceRecording || isVoiceTranscribing ? "!w-[20%]" : "!w-[80%]"
                              }`
                            : `py-2.5 bg-[#ff5d00] hover:bg-[#e05200] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-orange-500/25 transition-all duration-300 ease-in-out active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 flex items-center justify-center gap-1.5 cursor-pointer border-2 border-[#ff701e] disabled:cursor-not-allowed disabled:opacity-50 shrink-0 ${
                                  isVoiceRecording || isVoiceTranscribing ? "w-[20%]" : "w-[80%]"
                              }`
                    }
                >
                    {isSubmittingManual ? (
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    ) : (
                        manualButtonIcon || <Plus className="h-4 w-4 stroke-[3] shrink-0" />
                    )}
                    <span
                        className={`truncate transition-opacity duration-200 ${
                            isVoiceRecording || isVoiceTranscribing ? "hidden" : "inline"
                        }`}
                    >
                        {labelText}
                    </span>
                </button>

                {/* Right Button: Record Voice Task (20% default, expands to 80% during recording) */}
                {isVoiceTranscribing ? (
                    <div className="w-[80%] py-2.5 px-3 bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 rounded-2xl border-2 border-orange-200/90 shadow-md flex items-center justify-center gap-2 text-orange-700 text-xs font-black uppercase tracking-wider animate-pulse transition-all duration-300 ease-in-out shrink-0">
                        <Loader2 className="h-4 w-4 animate-spin text-[#ff5d00] shrink-0" />
                        <span className="truncate">
                            {t(
                                "Transcribing voice & creating task…",
                                "Prepisujem hlas a vytváram úlohu…",
                                "Hang átírása és feladat készítése…",
                            )}
                        </span>
                    </div>
                ) : isVoiceRecording ? (
                    /* Whole button sends the task on click, with cancel on the right */
                    <div
                        onClick={handleStopAndProcessVoiceRecording}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleStopAndProcessVoiceRecording();
                            }
                        }}
                        title={t(
                            "Click anywhere to send & create task",
                            "Kliknutím odošlite a vytvorte úlohu",
                            "Kattintson a küldéshez és létrehozáshoz",
                        )}
                        className="w-[80%] py-2 px-3 bg-gradient-to-r from-rose-500 via-rose-600 to-rose-700 hover:from-rose-600 hover:to-rose-800 text-white rounded-2xl shadow-lg shadow-rose-500/30 flex items-center justify-between gap-2 border-2 border-rose-400 transition-all duration-300 ease-in-out cursor-pointer active:scale-[0.99] select-none shrink-0 group"
                    >
                        {/* Left: Pulsing status orb & live timer */}
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="relative flex items-center justify-center shrink-0">
                                <span className="absolute h-3 w-3 rounded-full bg-white opacity-75 animate-ping" />
                                <span className="relative h-2.5 w-2.5 rounded-full bg-white shadow-xs" />
                            </div>
                            <span className="font-mono font-black text-xs tracking-wider bg-black/25 px-2 py-0.5 rounded-md shadow-inner shrink-0">
                                {formatVoiceDuration(voiceRecordDuration)}
                            </span>
                        </div>

                        {/* Center: Live Sound Waves flowing from RIGHT to LEFT */}
                        <div className="flex-1 flex items-center justify-center overflow-hidden px-1">
                            <div className="flex items-center gap-[2px] h-5 overflow-hidden">
                                {audioVolumeBars.map((height, i) => (
                                    <span
                                        key={i}
                                        className="w-[2.5px] bg-white/95 rounded-full transition-all duration-75 shrink-0 shadow-xs"
                                        style={{
                                            height: `${Math.max(4, (height / 100) * 20)}px`,
                                            opacity: Math.max(0.4, height / 100),
                                        }}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Right: Send badge indicator + Cancel X Button */}
                        <div className="flex items-center gap-1.5 shrink-0">
                            <div className="hidden xs:flex items-center gap-1 px-2 py-1 bg-emerald-500 group-hover:bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-wider shadow-sm transition-all border border-emerald-400/80 shrink-0">
                                <Check className="h-3 w-3 stroke-[3]" />
                                <span>{t("Send", "Odoslať", "Küldés")}</span>
                            </div>

                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleCancelVoiceRecording();
                                }}
                                className="p-1.5 bg-black/20 hover:bg-black/40 active:bg-black/50 text-white/90 hover:text-white rounded-xl transition-all active:scale-95 cursor-pointer border border-white/20 shrink-0"
                                title={t("Cancel recording", "Zrušiť nahrávanie", "Felvétel megszakítása")}
                            >
                                <X className="h-4 w-4 stroke-[2.5]" />
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={handleStartVoiceRecording}
                        className={
                            voiceButtonClassName ||
                            "w-[20%] py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 active:from-rose-700 active:to-rose-800 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-rose-500/25 transition-all duration-300 ease-in-out active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer border-2 border-rose-400 disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
                        }
                        disabled={!canCreate}
                        title={t(
                            "Record Voice Task (Auto-transcribes and creates task)",
                            "Nahrať úlohu hlasom (Automaticky prepíše a vytvorí úlohu)",
                            "Hangfeladat rögzítése (Automatikusan átírja és létrehozza)",
                        )}
                    >
                        <Mic className="h-4 w-4 shrink-0 stroke-[2.5]" />
                        <span className="hidden xl:inline text-[11px] truncate">
                            {t("Record", "Hlasom", "Hanggal")}
                        </span>
                    </button>
                )}
            </div>

            {renderDebugPlayer()}
        </div>
    );
};
