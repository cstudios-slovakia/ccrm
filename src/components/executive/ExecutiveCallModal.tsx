import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  Activity,
  FileText,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle
} from "lucide-react";
import { type ExecutiveRole, EXECUTIVE_COLOR_MAP } from "../../utils/executive/defaultExecutives";
import type { Language } from "../../utils/translations";
import { BlobatarAvatar, type ExpressionName } from "../common/BlobatarAvatar";

interface ExecutiveCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  executive: ExecutiveRole;
  currentUser?: any;
  systemLanguage: Language;
  onCallTranscriptLogged?: (items: { role: "user" | "agent"; text: string; timestamp: Date }[]) => void;
}

interface TranscriptTurn {
  id: string;
  sender: "user" | "executive";
  text: string;
  timestamp: Date;
}

export const ExecutiveCallModal: React.FC<ExecutiveCallModalProps> = ({
  isOpen,
  onClose,
  executive,
  currentUser,
  systemLanguage,
  onCallTranscriptLogged
}) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  // Call status: 'idle' | 'connecting' | 'connected' | 'ended' | 'error'
  const [callState, setCallState] = useState<"idle" | "connecting" | "connected" | "ended" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Audio / Speech State
  const [isMuted, setIsMuted] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptTurn[]>([]);

  // WebRTC & Audio references
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [userAudioLevel, setUserAudioLevel] = useState(0);

  // Colors & styling
  const colorTheme = EXECUTIVE_COLOR_MAP[executive.color] || EXECUTIVE_COLOR_MAP.purple;

  // User display name
  const userName = useMemo(() => {
    if (currentUser?.name && currentUser.name.trim()) return currentUser.name.trim();
    if (currentUser?.email) {
      const prefix = currentUser.email.split("@")[0];
      return prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }
    return "Erik";
  }, [currentUser]);

  // Executive position translated
  const translatedPosition =
    systemLanguage === "sk"
      ? executive.positionSk
      : systemLanguage === "hu"
        ? executive.positionHu
        : executive.position;

  // Format timer MM:SS
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // 1. Initialize Call when modal opens
  useEffect(() => {
    if (!isOpen) {
      cleanupCall();
      return;
    }

    startCall();

    return () => {
      cleanupCall();
    };
  }, [isOpen, executive.id]);

  // 2. Call Timer
  useEffect(() => {
    let interval: any;
    if (callState === "connected") {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callState]);

  // 3. Cleanup all audio & WebRTC resources
  const cleanupCall = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    setIsAiSpeaking(false);
    setIsUserSpeaking(false);
    setUserAudioLevel(0);
  };

  // 4. Start WebRTC Live Audio Session
  const startCall = async () => {
    setCallState("connecting");
    setErrorMessage("");
    setCallDuration(0);
    setTranscripts([]);

    try {
      // Step A: Request ephemeral session token from backend
      const res = await fetch("/api/realtime_session.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: executive.id,
          language: systemLanguage,
          user_name: userName
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error (${res.status})`);
      }

      const sessionInit = await res.json();
      if (!sessionInit.success || !sessionInit.client_secret) {
        throw new Error(sessionInit.message || "Failed to negotiate session secret token.");
      }

      const clientSecret = sessionInit.client_secret;

      // Step B: Acquire Microphone Access
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone access is not supported on this browser.");
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      localStreamRef.current = mediaStream;

      // Initialize Mic volume analyser for visualizer
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioCtx;
        const sourceNode = audioCtx.createMediaStreamSource(mediaStream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        sourceNode.connect(analyser);
        analyserRef.current = analyser;

        const pcmData = new Uint8Array(analyser.frequencyBinCount);
        const checkVolume = () => {
          if (analyserRef.current && audioCtx.state === "running") {
            analyserRef.current.getByteFrequencyData(pcmData);
            let sum = 0;
            for (let i = 0; i < pcmData.length; i++) {
              sum += pcmData[i];
            }
            const average = sum / pcmData.length;
            const norm = Math.min(100, Math.round((average / 128) * 100));
            setUserAudioLevel(norm);
            setIsUserSpeaking(norm > 15);
          }
          animationFrameRef.current = requestAnimationFrame(checkVolume);
        };
        checkVolume();
      } catch (e) {
        console.warn("AudioContext visualizer init failed", e);
      }

      // Step C: Initialize RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      pcRef.current = pc;

      // Attach remote audio element
      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      remoteAudioRef.current = remoteAudio;

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          remoteAudio.srcObject = event.streams[0];
        }
      };

      // Add local microphone tracks to peer connection
      mediaStream.getTracks().forEach((track) => {
        pc.addTrack(track, mediaStream);
      });

      // Step D: Create Data Channel for Realtime Events
      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;

      dc.addEventListener("open", () => {
        setCallState("connected");

        // 1. Explicitly configure session settings (VAD & transcription)
        const updateSessionEvent = {
          type: "session.update",
          session: {
            input_audio_transcription: {
              model: "whisper-1"
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500
            }
          }
        };

        try {
          dc.send(JSON.stringify(updateSessionEvent));
        } catch (err) {
          console.warn("session.update failed", err);
        }

        // 2. Proactively trigger the AI to speak first upon pickup!
        const initialGreetingDirective = {
          type: "response.create",
          response: {
            instructions: `Speak now. Proactively greet ${userName} warmly by name in ${
              systemLanguage === "sk" ? "Slovak" : systemLanguage === "hu" ? "Hungarian" : "English"
            }. Introduce yourself as ${executive.name} (${translatedPosition}). State that you have live access to CCRM database records (including client accounts such as Cstudios, s.r.o., active projects, financials, and tasks) and ask what strategic priority or decision you can advise them on today.`
          }
        };
        try {
          dc.send(JSON.stringify(initialGreetingDirective));
        } catch (err) {
          console.warn("Initial greeting trigger failed", err);
        }
      });

      dc.addEventListener("message", (event) => {
        try {
          const realtimeEvent = JSON.parse(event.data);
          handleRealtimeEvent(realtimeEvent);
        } catch (e) {
          // Non-JSON message
        }
      });

      // Step E: Create WebRTC Offer & Exchange with Backend SDP Proxy (avoids browser CORS & network blocks)
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch("/api/realtime_session.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "exchange_sdp",
          sdp: offer.sdp,
          model: "gpt-realtime-1.5",
          client_secret: clientSecret
        })
      });

      if (!sdpRes.ok) {
        const sdpErrData = await sdpRes.json().catch(() => ({}));
        throw new Error(sdpErrData.message || `OpenAI WebRTC negotiation failed (${sdpRes.status})`);
      }

      const sdpData = await sdpRes.json();
      if (!sdpData.success || !sdpData.sdp) {
        throw new Error(sdpData.message || "Failed to receive SDP answer from OpenAI.");
      }

      const answer: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: sdpData.sdp
      };
      await pc.setRemoteDescription(answer);
    } catch (err: any) {
      console.error("Failed to start voice call", err);
      setCallState("error");
      setErrorMessage(err.message || "Could not establish audio connection.");
    }
  };

  // 5. Handle Realtime Data Channel Events
  const handleRealtimeEvent = (event: any) => {
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        setIsUserSpeaking(true);
        setIsAiSpeaking(false);
        setIsAiThinking(false);
        break;

      case "input_audio_buffer.speech_stopped":
        setIsUserSpeaking(false);
        setIsAiThinking(true);
        break;

      case "response.created":
        setIsAiThinking(true);
        break;

      case "output_audio_buffer.started":
        setIsAiSpeaking(true);
        setIsAiThinking(false);
        break;

      case "output_audio_buffer.stopped":
        setIsAiSpeaking(false);
        setIsAiThinking(false);
        break;

      case "response.function_call_arguments.done":
        if (event.name === "query_crm_live_data" && event.call_id) {
          setIsAiThinking(true);
          let parsedQuery = "";
          try {
            const parsedArgs = JSON.parse(event.arguments || "{}");
            parsedQuery = parsedArgs.query || "";
          } catch (e) {
            parsedQuery = event.arguments || "";
          }

          fetch("/api/realtime_session.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "query_rag",
              query: parsedQuery,
              agent_id: executive.id,
              language: systemLanguage
            })
          })
            .then((r) => r.json())
            .then((data) => {
              const outputText = data.result || "No records found matching query.";
              if (dataChannelRef.current && dataChannelRef.current.readyState === "open") {
                dataChannelRef.current.send(
                  JSON.stringify({
                    type: "conversation.item.create",
                    item: {
                      type: "function_call_output",
                      call_id: event.call_id,
                      output: outputText
                    }
                  })
                );
                dataChannelRef.current.send(JSON.stringify({ type: "response.create" }));
              }
            })
            .catch((err) => {
              console.warn("Realtime function call execution failed", err);
              if (dataChannelRef.current && dataChannelRef.current.readyState === "open") {
                dataChannelRef.current.send(
                  JSON.stringify({
                    type: "conversation.item.create",
                    item: {
                      type: "function_call_output",
                      call_id: event.call_id,
                      output: "Error querying CRM database."
                    }
                  })
                );
                dataChannelRef.current.send(JSON.stringify({ type: "response.create" }));
              }
            });
        }
        break;

      case "response.audio_transcript.delta":
        if (event.delta) {
          setTranscripts((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.sender === "executive") {
              return [
                ...prev.slice(0, -1),
                { ...last, text: last.text + event.delta }
              ];
            } else {
              return [
                ...prev,
                {
                  id: Date.now().toString(),
                  sender: "executive",
                  text: event.delta,
                  timestamp: new Date()
                }
              ];
            }
          });
        }
        break;

      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript && event.transcript.trim()) {
          setTranscripts((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              sender: "user",
              text: event.transcript.trim(),
              timestamp: new Date()
            }
          ]);
        }
        break;

      case "error":
        console.warn("Realtime error event", event.error);
        if (event.error?.message) {
          setErrorMessage(event.error.message);
        }
        break;

      default:
        break;
    }
  };

  // 6. Toggle Microphone Mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const nextMuted = !isMuted;
        audioTracks.forEach((track) => {
          track.enabled = !nextMuted;
        });
        setIsMuted(nextMuted);
      }
    }
  };

  // 7. End Call
  const handleEndCall = () => {
    setCallState("ended");
    cleanupCall();

    // If transcripts were recorded, send structured transcript callback
    if (transcripts.length > 0 && onCallTranscriptLogged) {
      const items = transcripts.map((t) => ({
        role: t.sender === "user" ? ("user" as const) : ("agent" as const),
        text: t.text,
        timestamp: t.timestamp
      }));
      onCallTranscriptLogged(items);
    }

    setTimeout(() => {
      onClose();
    }, 400);
  };

  // Dynamic speaking cadence state for organic mouth movement
  const [speakingTick, setSpeakingTick] = useState(0);

  useEffect(() => {
    if (!isAiSpeaking) {
      setSpeakingTick(0);
      return;
    }
    const interval = setInterval(() => {
      setSpeakingTick((prev) => (prev + 1) % 4);
    }, 180);
    return () => clearInterval(interval);
  }, [isAiSpeaking]);

  // Dynamic blobatar expression reflecting call interaction states
  const avatarExpression = useMemo(() => {
    if (callState === "connecting") return "thinking";
    if (callState === "error") return "sad";
    if (isAiThinking) return "thinking";
    if (isAiSpeaking) {
      // Alternate mouth-flap expressions for realistic talking animation
      const speechExpressions: ExpressionName[] = ["happy", "smug", "happy", "idle"];
      return speechExpressions[speakingTick] || "happy";
    }
    if (isUserSpeaking) return "surprised"; // alert reaction to user voice input!
    return "idle";
  }, [callState, isAiThinking, isAiSpeaking, speakingTick, isUserSpeaking]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100050] flex flex-col items-center justify-between p-6 sm:p-10 pointer-events-auto select-none backdrop-blur-3xl animate-in fade-in duration-300 overflow-hidden"
      style={{
        background:
          "radial-gradient(circle 900px at center, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.85) 38%, rgba(246, 249, 255, 0.68) 70%, rgba(235, 242, 255, 0.50) 100%)"
      }}
    >
      <style>{`
        @keyframes blobTalk {
          0% {
            transform: scale(1, 1) translateY(0px) rotate(0deg);
          }
          18% {
            transform: scale(1.10, 0.91) translateY(-14px) rotate(-2.5deg);
          }
          36% {
            transform: scale(0.93, 1.08) translateY(-4px) rotate(2deg);
          }
          54% {
            transform: scale(1.08, 0.93) translateY(-12px) rotate(-1.5deg);
          }
          72% {
            transform: scale(0.95, 1.05) translateY(-5px) rotate(2.5deg);
          }
          90% {
            transform: scale(1.06, 0.95) translateY(-8px) rotate(-1deg);
          }
          100% {
            transform: scale(1, 1) translateY(0px) rotate(0deg);
          }
        }
        @keyframes blobThink {
          0%, 100% {
            transform: translateY(0px) rotate(0deg) scale(1);
          }
          50% {
            transform: translateY(-8px) rotate(3deg) scale(1.03);
          }
        }
        @keyframes blobIdle {
          0%, 100% {
            transform: translateY(0px) scale(1);
          }
          50% {
            transform: translateY(-5px) scale(1.02);
          }
        }
      `}</style>

      {/* Soft Ambient Role Bloom directly behind center Blob */}
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-3xl opacity-25 pointer-events-none transition-colors duration-700 -z-10 ${
          executive.color === "emerald"
            ? "bg-emerald-400"
            : executive.color === "amber"
              ? "bg-amber-400"
              : executive.color === "rose"
                ? "bg-rose-400"
                : executive.color === "cyan"
                  ? "bg-cyan-400"
                  : executive.color === "orange"
                    ? "bg-orange-400"
                    : executive.color === "blue"
                      ? "bg-blue-400"
                      : "bg-purple-400"
        }`}
      />

      {/* TOP BAR: Floating Minimal Info */}
      <div className="w-full max-w-4xl flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/80 backdrop-blur-md border border-slate-200/60 shadow-xs text-xs font-bold text-slate-700">
          <Sparkles className="h-3.5 w-3.5 text-purple-600" />
          <span>Voice: {executive.voice ? executive.voice.toUpperCase() : "ALLOY"}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Optional Transcript Toggle Pill */}
          <button
            type="button"
            onClick={() => setShowTranscript(!showTranscript)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 hover:bg-white backdrop-blur-md border border-slate-200/60 shadow-xs text-xs font-bold text-slate-700 hover:text-slate-900 transition-all cursor-pointer"
          >
            <FileText className="h-3.5 w-3.5 text-purple-600" />
            <span>{t("Transcript", "Prepis", "Átirat")}</span>
            {transcripts.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-extrabold">
                {transcripts.length}
              </span>
            )}
          </button>

          {/* Active Call Timer Pill */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur-md border border-slate-200/60 shadow-xs text-xs font-bold text-slate-800 font-mono">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>{formatTimer(callDuration)}</span>
          </div>
        </div>
      </div>

      {/* CENTER STAGE: Frameless Talking Blobatar & Floating Titles (No Cards/Frames) */}
      <div className="my-auto flex flex-col items-center justify-center text-center z-10 w-full max-w-2xl py-4">
        
        {/* Frameless Avatar Stage with Animated Speech Waves */}
        <div className="relative my-4 flex items-center justify-center">
          
          {/* Radial Soundwave ripples when AI is speaking */}
          {isAiSpeaking && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10">
              <div className="absolute w-[240px] h-[240px] rounded-full bg-purple-400/25 animate-ping duration-1000 scale-135" />
              <div className="absolute w-[280px] h-[280px] rounded-full bg-indigo-300/30 animate-pulse duration-700" />
              <div className="absolute w-[330px] h-[330px] rounded-full border border-purple-300/40 animate-spin duration-3000" />
            </div>
          )}

          {/* User speech reaction ring */}
          {isUserSpeaking && !isAiSpeaking && (
            <div
              className="absolute -inset-8 rounded-full border-2 border-emerald-400/60 transition-all duration-75 pointer-events-none"
              style={{ transform: `scale(${1 + userAudioLevel / 130})` }}
            />
          )}

          {/* Thinking glow ring */}
          {isAiThinking && !isAiSpeaking && (
            <div className="absolute -inset-8 rounded-full border-2 border-amber-400/60 animate-pulse pointer-events-none" />
          )}

          {/* Frameless Animated Talking Blobatar */}
          <div
            className={`relative flex items-center justify-center transition-transform duration-200 z-10 ${
              isAiSpeaking
                ? "animate-[blobTalk_1.05s_ease-in-out_infinite]"
                : isAiThinking
                  ? "animate-[blobThink_2.4s_ease-in-out_infinite]"
                  : isUserSpeaking
                    ? "scale-105"
                    : "animate-[blobIdle_4s_ease-in-out_infinite]"
            }`}
            style={{
              filter: isAiSpeaking
                ? "drop-shadow(0 25px 40px rgba(147, 51, 234, 0.25))"
                : isUserSpeaking
                  ? "drop-shadow(0 25px 40px rgba(16, 185, 129, 0.22))"
                  : isAiThinking
                    ? "drop-shadow(0 25px 40px rgba(245, 158, 11, 0.22))"
                    : "drop-shadow(0 20px 35px rgba(15, 23, 42, 0.10))"
            }}
          >
            <BlobatarAvatar
              name={executive.name}
              roleColor={executive.color}
              size={210}
              animate="always"
              expression={avatarExpression}
              frameless={true}
              className="w-full h-full"
            />
          </div>
        </div>

        {/* Floating Titles & Metadata (Directly in scene, no card container) */}
        <div className="space-y-1.5 mt-4 mb-3">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide bg-white/80 border border-slate-200/80 text-purple-700 shadow-xs backdrop-blur-md">
            <Sparkles className="h-3 w-3 text-purple-500" />
            {executive.badge}
          </div>
          <h2 className="text-3xl sm:text-4xl font-black font-heading tracking-tight text-slate-900 drop-shadow-xs">
            {executive.name}
          </h2>
          <p className="text-sm sm:text-base font-semibold text-slate-600 max-w-md mx-auto">
            {translatedPosition}
          </p>
        </div>

        {/* Live Status Pill */}
        <div className="my-3">
          {callState === "connecting" && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/90 border border-amber-200 text-amber-800 text-xs font-bold animate-pulse shadow-xs backdrop-blur-md">
              <Activity className="h-3.5 w-3.5 animate-spin text-amber-600" />
              {t("Connecting to Executive...", "Pripájanie k poradcovi...", "Kapcsolódás a vezetőhöz...")}
            </div>
          )}

          {callState === "connected" && isAiThinking && !isAiSpeaking && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/90 border border-amber-200 text-amber-800 text-xs font-bold animate-pulse shadow-xs backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-amber-600 animate-spin" />
              {t(`${executive.name} is analyzing...`, `${executive.name} analyzuje...`, `${executive.name} elemez...`)}
            </div>
          )}

          {callState === "connected" && isAiSpeaking && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/90 border border-purple-200 text-purple-800 text-xs font-bold animate-pulse shadow-xs backdrop-blur-md">
              <Volume2 className="h-3.5 w-3.5 text-purple-600" />
              {t(`${executive.name} is speaking...`, `${executive.name} hovorí...`, `${executive.name} beszél...`)}
            </div>
          )}

          {callState === "connected" && !isAiSpeaking && !isAiThinking && isUserSpeaking && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/90 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-xs backdrop-blur-md">
              <Mic className="h-3.5 w-3.5 text-emerald-600" />
              {t("Listening to you...", "Počúvam vás...", "Hallgatom Önt...")}
            </div>
          )}

          {callState === "connected" && !isAiSpeaking && !isAiThinking && !isUserSpeaking && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/90 border border-slate-200/80 text-slate-700 text-xs font-bold shadow-xs backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t("Ready & connected to CRM data", "Pripravený s prístupom k CRM dátam", "Készen áll a CRM adatokkal")}
            </div>
          )}

          {callState === "error" && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/90 border border-rose-200 text-rose-700 text-xs font-bold max-w-sm text-center shadow-xs backdrop-blur-md">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{errorMessage || t("Connection error", "Chyba spojenia", "Kapcsolati hiba")}</span>
            </div>
          )}
        </div>

        {/* Audio Visualizer Waves */}
        <div className="w-full max-w-[240px] h-6 flex items-center justify-center gap-1.5 mt-2">
          {[...Array(16)].map((_, i) => {
            const height = isAiSpeaking
              ? Math.max(4, Math.sin(i + callDuration * 4) * 22 + 8)
              : isUserSpeaking
                ? Math.max(4, (userAudioLevel / 100) * 24 * Math.random() + 4)
                : 4;
            return (
              <span
                key={i}
                className={`w-1 rounded-full transition-all duration-75 ${
                  isAiSpeaking
                    ? "bg-purple-500"
                    : isUserSpeaking
                      ? "bg-emerald-500"
                      : "bg-slate-300/80"
                }`}
                style={{ height: `${height}px` }}
              />
            );
          })}
        </div>

        {/* Floating Subtitle / Transcript Drawer */}
        {showTranscript && (
          <div className="w-full max-w-lg mt-6 p-4 max-h-48 overflow-y-auto rounded-3xl bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-lg space-y-2.5 text-xs text-left animate-in fade-in slide-in-from-bottom-2 duration-200">
            {transcripts.length === 0 ? (
              <p className="text-slate-400 text-center py-4 italic">
                {t("Transcripts will stream here in real time...", "Prepisy sa zobrazia počas hovoru...", "Az átirat itt jelenik meg...")}
              </p>
            ) : (
              transcripts.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-2xl ${
                    item.sender === "user"
                      ? "bg-slate-100/90 text-slate-800 ml-4"
                      : "bg-purple-50/90 text-purple-950 font-medium mr-4"
                  }`}
                >
                  <span className="font-bold text-[10px] block opacity-70 mb-0.5">
                    {item.sender === "user" ? userName : executive.name}
                  </span>
                  <p className="leading-relaxed">{item.text}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* BOTTOM BAR: Floating Controls Centered */}
      <div className="w-full max-w-md flex items-center justify-center gap-4 z-10 pb-2">
        {/* Mute Button */}
        <button
          type="button"
          onClick={toggleMute}
          disabled={callState !== "connected"}
          className={`p-4 rounded-full border transition-all active:scale-90 cursor-pointer shadow-md backdrop-blur-md ${
            isMuted
              ? "bg-amber-50/90 border-amber-300 text-amber-700 shadow-amber-500/15"
              : "bg-white/90 hover:bg-white border-slate-200/80 text-slate-700 hover:text-slate-900 shadow-slate-900/5"
          } ${callState !== "connected" ? "opacity-50 cursor-not-allowed" : ""}`}
          title={isMuted ? t("Unmute Microphone", "Zapnúť mikrofón", "Mikrofon bekapcsolása") : t("Mute Microphone", "Stlmiť mikrofón", "Mikrofon némítása")}
        >
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>

        {/* End Call Button */}
        <button
          type="button"
          onClick={handleEndCall}
          className="flex items-center gap-2.5 px-8 py-4 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-xs font-black uppercase tracking-wider shadow-xl shadow-rose-500/35 hover:shadow-rose-500/50 active:scale-95 transition-all cursor-pointer"
        >
          <PhoneOff className="h-5 w-5" />
          <span>{t("End Call", "Ukončiť hovor", "Hívás befejezése")}</span>
        </button>
      </div>
    </div>
  );
};
