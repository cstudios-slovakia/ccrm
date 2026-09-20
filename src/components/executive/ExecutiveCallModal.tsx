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
import { BlobatarAvatar } from "../common/BlobatarAvatar";

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

        // 1. Explicitly configure session settings (voice, instructions, VAD, transcription)
        const updateSessionEvent = {
          type: "session.update",
          session: {
            modalities: ["audio", "text"],
            instructions: `You are ${executive.name} (${translatedPosition}), an executive in CCRM.\nYou are in a live voice call with ${userName}.\nRespond concisely and conversationally in ${
              systemLanguage === "sk" ? "Slovak" : systemLanguage === "hu" ? "Hungarian" : "English"
            }.`,
            voice: executive.voice || "alloy",
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
            }. Introduce yourself as ${executive.name} (${translatedPosition}) and ask what strategic priority or decision you can advise them on today.`
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

  // Dynamic blobatar expression reflecting call interaction states
  const avatarExpression = useMemo(() => {
    if (callState === "connecting") return "thinking";
    if (callState === "error") return "sad";
    if (isAiThinking) return "thinking";
    if (isAiSpeaking) return "smug";
    if (isUserSpeaking) return "surprised"; // alert reaction to user voice input!
    return "idle";
  }, [callState, isAiThinking, isAiSpeaking, isUserSpeaking]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100050] flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 rounded-3xl border border-slate-800 shadow-2xl shadow-purple-950/40 overflow-hidden flex flex-col items-center p-6 sm:p-8 text-white">
        
        {/* Ambient background glow matching executive color */}
        <div
          className={`absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none transition-colors duration-500 ${
            executive.color === "emerald"
              ? "bg-emerald-500"
              : executive.color === "amber"
                ? "bg-amber-500"
                : executive.color === "rose"
                  ? "bg-rose-500"
                  : executive.color === "cyan"
                    ? "bg-cyan-500"
                    : executive.color === "orange"
                      ? "bg-orange-500"
                      : executive.color === "blue"
                        ? "bg-blue-500"
                        : "bg-purple-600"
          }`}
        />

        {/* Top Header: Voice Indicator & Call Timer */}
        <div className="w-full flex items-center justify-between border-b border-slate-800/80 pb-4 mb-4 z-10">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/80 text-[11px] font-bold text-slate-300">
            <Volume2 className="h-3.5 w-3.5 text-purple-400" />
            <span>Voice: {executive.voice ? executive.voice.toUpperCase() : "ALLOY"}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/80 text-[11px] font-bold text-slate-300">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-mono font-bold text-slate-300">
              {formatTimer(callDuration)}
            </span>
          </div>
        </div>

        {/* Executive Avatar & Pulsing Waveform Ring */}
        <div className="relative my-6 flex items-center justify-center">
          {/* Radial Soundwave animation when AI is speaking */}
          {isAiSpeaking && (
            <>
              <div className="absolute inset-0 rounded-full bg-purple-500/20 animate-ping duration-1000 scale-125 pointer-events-none" />
              <div className="absolute -inset-4 rounded-full bg-indigo-500/20 animate-pulse duration-700 pointer-events-none" />
              <div className="absolute -inset-8 rounded-full border border-purple-500/30 animate-spin duration-3000 pointer-events-none" />
            </>
          )}

          {/* User speech ring */}
          {isUserSpeaking && !isAiSpeaking && (
            <div
              className="absolute -inset-4 rounded-full border-2 border-emerald-400/60 transition-all duration-75 pointer-events-none"
              style={{ transform: `scale(${1 + userAudioLevel / 150})` }}
            />
          )}

          {/* Thinking glow ring */}
          {isAiThinking && !isAiSpeaking && (
            <div className="absolute -inset-4 rounded-full border-2 border-amber-400/60 animate-pulse pointer-events-none" />
          )}

          {/* Center Avatar Box */}
          <div
            className={`relative flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center rounded-3xl border-2 shadow-2xl transition-all duration-300 z-10 overflow-hidden bg-slate-900 ${
              isAiSpeaking
                ? "scale-105 ring-4 ring-purple-400/50 shadow-purple-500/30"
                : isUserSpeaking
                  ? "scale-105 ring-4 ring-emerald-400/50 shadow-emerald-500/30"
                  : isAiThinking
                    ? "scale-100 ring-4 ring-amber-400/50 shadow-amber-500/20"
                    : "scale-100"
            } ${colorTheme.border}`}
          >
            <BlobatarAvatar
              name={executive.name}
              size={128}
              rounded="2xl"
              animate="always"
              expression={avatarExpression}
              className="w-full h-full border-0 shadow-none"
            />
          </div>
        </div>

        {/* Executive Titles & Metadata */}
        <div className="text-center space-y-1 mb-6 z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wide bg-slate-800/80 border border-slate-700 text-purple-300 mb-1">
            <Sparkles className="h-3 w-3 text-purple-400" />
            {executive.badge}
          </div>
          <h2 className="text-xl sm:text-2xl font-black font-heading tracking-tight text-white">
            {executive.name}
          </h2>
          <p className="text-xs sm:text-sm font-medium text-slate-400 max-w-md mx-auto">
            {translatedPosition}
          </p>
        </div>

        {/* Live Status Pill */}
        <div className="mb-6 z-10">
          {callState === "connecting" && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold animate-pulse">
              <Activity className="h-3.5 w-3.5 animate-spin" />
              {t("Connecting to Executive...", "Pripájanie k poradcovi...", "Kapcsolódás a vezetőhöz...")}
            </div>
          )}

          {callState === "connected" && isAiThinking && !isAiSpeaking && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold animate-pulse">
              <Sparkles className="h-3.5 w-3.5 text-amber-400 animate-spin" />
              {t(`${executive.name} is thinking & analyzing...`, `${executive.name} premýšľa a analyzuje...`, `${executive.name} gondolkodik és elemez...`)}
            </div>
          )}

          {callState === "connected" && isAiSpeaking && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-bold animate-pulse">
              <Volume2 className="h-3.5 w-3.5 text-purple-400" />
              {t(`${executive.name} is speaking...`, `${executive.name} hovorí...`, `${executive.name} beszél...`)}
            </div>
          )}

          {callState === "connected" && !isAiSpeaking && !isAiThinking && isUserSpeaking && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
              <Mic className="h-3.5 w-3.5 text-emerald-400" />
              {t("Listening to you...", "Počúvam vás...", "Hallgatom Önt...")}
            </div>
          )}

          {callState === "connected" && !isAiSpeaking && !isAiThinking && !isUserSpeaking && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 text-xs font-bold">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {t("Ready & grounded in CRM data", "Pripravený s prístupom k CRM dátam", "Készen áll a CRM adatokkal")}
            </div>
          )}

          {callState === "error" && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold max-w-md text-center">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMessage || t("Connection error", "Chyba spojenia", "Kapcsolati hiba")}</span>
            </div>
          )}
        </div>

        {/* Live Audio Visualizer Bars */}
        <div className="w-full max-w-xs h-6 flex items-center justify-center gap-1 mb-6 z-10">
          {[...Array(16)].map((_, i) => {
            const height = isAiSpeaking
              ? Math.max(4, Math.sin(i + callDuration * 3) * 20 + 8)
              : isUserSpeaking
                ? Math.max(4, (userAudioLevel / 100) * 24 * Math.random() + 4)
                : 4;
            return (
              <span
                key={i}
                className={`w-1 rounded-full transition-all duration-75 ${
                  isAiSpeaking
                    ? "bg-purple-400"
                    : isUserSpeaking
                      ? "bg-emerald-400"
                      : "bg-slate-700"
                }`}
                style={{ height: `${height}px` }}
              />
            );
          })}
        </div>

        {/* Collapsible Live Transcript Drawer */}
        <div className="w-full mb-6 z-10">
          <button
            type="button"
            onClick={() => setShowTranscript(!showTranscript)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 text-xs font-bold text-slate-300 transition-colors"
          >
            <span className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-purple-400" />
              {t("Live Transcript Stream", "Živý prepis rozhovoru", "Élő átirat")} ({transcripts.length})
            </span>
            {showTranscript ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {showTranscript && (
            <div className="mt-2 p-3 max-h-48 overflow-y-auto rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2 text-xs font-mono">
              {transcripts.length === 0 ? (
                <p className="text-slate-500 text-center py-4 italic">
                  {t("Transcripts will appear here as you speak...", "Prepisy sa zobrazia počas rozhovoru...", "Az átirat itt jelenik meg...")}
                </p>
              ) : (
                transcripts.map((item) => (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-xl flex items-start gap-2.5 ${
                      item.sender === "user"
                        ? "bg-slate-800/80 text-slate-200 border-l-2 border-emerald-400"
                        : "bg-purple-950/40 text-purple-200 border-l-2 border-purple-400"
                    }`}
                  >
                    <BlobatarAvatar
                      name={item.sender === "user" ? userName : executive.name}
                      size={24}
                      rounded="lg"
                      animate="hover"
                      className="shrink-0 mt-0.5 border-slate-700"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-[10px] block opacity-70 mb-0.5">
                        {item.sender === "user" ? userName : executive.name}
                      </span>
                      <p className="leading-relaxed whitespace-pre-wrap">{item.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Action Controls Bar */}
        <div className="w-full flex items-center justify-center gap-4 z-10 pt-2 border-t border-slate-800/80">
          {/* Mute Button */}
          <button
            type="button"
            onClick={toggleMute}
            disabled={callState !== "connected"}
            className={`p-3.5 rounded-2xl border transition-all active:scale-90 cursor-pointer ${
              isMuted
                ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200"
            } ${callState !== "connected" ? "opacity-50 cursor-not-allowed" : ""}`}
            title={isMuted ? t("Unmute Microphone", "Zapnúť mikrofón", "Mikrofon bekapcsolása") : t("Mute Microphone", "Stlmiť mikrofón", "Mikrofon némítása")}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          {/* End Call Button */}
          <button
            type="button"
            onClick={handleEndCall}
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold uppercase tracking-wider shadow-lg shadow-rose-900/40 hover:shadow-rose-900/60 active:scale-95 transition-all cursor-pointer"
          >
            <PhoneOff className="h-5 w-5" />
            <span>{t("End Call", "Ukončiť hovor", "Hívás befejezése")}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
