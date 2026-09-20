import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  RotateCcw,
  Sparkles,
  Send,
  Mic,
  MicOff,
  PhoneOff,
  ChevronRight
} from "lucide-react";
import { BlobatarAvatar } from "../common/BlobatarAvatar";
import { Markdown } from "../../utils/markdown";
import { VERSION_CODENAME } from "../../utils/version";
import type { Language } from "../../utils/translations";
import type { ScreenContextInfo } from "../../hooks/useCurrentScreenContext";

interface CopilotSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  systemLanguage?: Language;
  screenContext: ScreenContextInfo;
  currentUser?: any;
  onWidthChange?: (width: number) => void;
}

interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: Date;
}

const STORAGE_WIDTH_KEY = "ccrm_copilot_width";
const DEFAULT_WIDTH = 440;
const MIN_WIDTH = 360;

export const CopilotSidebar: React.FC<CopilotSidebarProps> = ({
  isOpen,
  onClose,
  systemLanguage = "sk",
  screenContext,
  currentUser,
  onWidthChange
}) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  // Sidebar width & resizing
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_WIDTH_KEY);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= MIN_WIDTH) return parsed;
      }
    }
    return DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Voice Calling Mode State
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [callState, setCallState] = useState<"idle" | "connecting" | "connected" | "ended" | "error">("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [userAudioLevel, setUserAudioLevel] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState<{ user: string; agent: string }>({ user: "", agent: "" });
  const [voiceErrorMessage, setVoiceErrorMessage] = useState("");

  // WebRTC Refs
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Synchronize width changes to parent and localStorage
  useEffect(() => {
    onWidthChange?.(sidebarWidth);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_WIDTH_KEY, sidebarWidth.toString());
    }
  }, [sidebarWidth, onWidthChange]);

  // Handle Drag Resizing
  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX;
      const maxAllowed = Math.max(MIN_WIDTH, window.innerWidth - 360);
      const newWidth = Math.max(MIN_WIDTH, Math.min(maxAllowed, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const handlePointerUp = () => {
      setIsResizing(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  // Scroll to bottom on messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Format User's display name
  const userName = useMemo(() => {
    if (currentUser?.name && currentUser.name.trim()) return currentUser.name.trim();
    if (currentUser?.email) {
      const prefix = currentUser.email.split("@")[0];
      return prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }
    return "Erik";
  }, [currentUser]);

  // Track if user has received first-time comprehensive introduction
  const [hasIntroduced, setHasIntroduced] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("ccrm_copilot_introduced") === "true";
    }
    return false;
  });

  // Welcome message localized (first time vs returning)
  const welcomeText = useMemo(() => {
    if (!hasIntroduced) {
      return t(
        `👋 Hi **${userName}**! I am your **Executive Copilot (${VERSION_CODENAME})**. I have live CRM data access and I am actively grounded in **${screenContext.title}**. How can I help you today?`,
        `👋 Ahoj **${userName}**! Som tvoj **Výkonný AI Copilot (${VERSION_CODENAME})**. Mám živý prístup k CRM dátam a sledujem s tebou obrazovku **${screenContext.title}**. Ako ti môžem dnes pomôcť?`,
        `👋 Szia **${userName}**! Én vagyok a **Vezetői AI Copilot (${VERSION_CODENAME})**. Valós időben látom a CRM adatokat és a megnyitott **${screenContext.title}** felületet. Miben segíthetek ma?`
      );
    }
    return t(
      `👋 Hi **${userName}**, how can I help you today? I'm currently looking at **${screenContext.title}** with you.`,
      `👋 Ahoj **${userName}**, ako ti môžem dnes pomôcť? Momentálne sledujem s tebou obrazovku **${screenContext.title}**.`,
      `👋 Szia **${userName}**, miben segíthetek ma? Jelenleg a(z) **${screenContext.title}** felületet nézem veled.`
    );
  }, [hasIntroduced, userName, screenContext.title, systemLanguage]);

  // Mark introduced on open
  useEffect(() => {
    if (!hasIntroduced && typeof window !== "undefined") {
      localStorage.setItem("ccrm_copilot_introduced", "true");
      setHasIntroduced(true);
    }
  }, [hasIntroduced]);

  // Auto-focus input bar when opening chat
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isOpen && !isVoiceMode) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isVoiceMode]);

  // Fetch initial chat history on mount and ensure welcome message is present
  useEffect(() => {
    const userId = currentUser?.id || currentUser?.email || "default_user";

    // Start immediately with welcome message
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: "agent",
        text: welcomeText,
        timestamp: new Date()
      }
    ]);

    fetch(`/api/chat_rag.php?action=chat_history&user_id=${encodeURIComponent(userId)}&agent_id=orchestrator`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.messages) && data.messages.length > 0) {
          const loaded: ChatMessage[] = data.messages.map((m: any, idx: number) => ({
            id: `msg-${idx}-${Date.now()}`,
            sender: m.sender === "agent" ? "agent" : "user",
            text: m.text,
            timestamp: m.timestamp ? new Date(m.timestamp) : new Date()
          }));

          // Check if last message is already a recent greeting for this session
          const lastMsg = loaded[loaded.length - 1];
          const hasRecentGreeting = lastMsg && lastMsg.sender === "agent" && (lastMsg.text.includes(userName) || lastMsg.text.includes(screenContext.title));

          if (hasRecentGreeting) {
            setMessages(loaded);
          } else {
            // Append welcoming greeting for the current session & screen
            setMessages([
              ...loaded,
              {
                id: `welcome-session-${Date.now()}`,
                sender: "agent",
                text: welcomeText,
                timestamp: new Date()
              }
            ]);
          }
        }
      })
      .catch(() => {
        // Keep initial welcome message
      });
  }, [currentUser?.id, currentUser?.email, welcomeText, userName, screenContext.title]);

  // Send Text Message
  const handleSendText = async (customText?: string) => {
    const query = (customText !== undefined ? customText : inputText).trim();
    if (!query || isLoading) return;

    setInputText("");
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date()
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const userId = currentUser?.id || currentUser?.email || "default_user";
      const res = await fetch("/api/chat_rag.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          user_id: userId,
          agent_id: "orchestrator",
          message: query,
          current_screen_context: screenContext.summary
        })
      });

      const data = await res.json();
      if (data.success && data.reply) {
        const agentMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          sender: "agent",
          text: data.reply,
          timestamp: new Date()
        };
        setMessages((prev) => [...prev, agentMsg]);
      } else {
        const errMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          sender: "agent",
          text: data.message || "An error occurred while generating response.",
          timestamp: new Date()
        };
        setMessages((prev) => [...prev, errMsg]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "agent",
          text: `Connection error: ${err?.message || "Failed to reach server"}`,
          timestamp: new Date()
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Reset Chat History
  const handleResetChat = async () => {
    if (isLoading) return;
    const userId = currentUser?.id || currentUser?.email || "default_user";
    try {
      await fetch("/api/chat_rag.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset_history",
          user_id: userId,
          agent_id: "orchestrator"
        })
      });
      setMessages([
        {
          id: `welcome-${Date.now()}`,
          sender: "agent",
          text: t(
            `Chat history reset. How can I help you regarding **${screenContext.title}**?`,
            `História bola vyčistená. Ako ti môžem pomôcť ohľadom **${screenContext.title}**?`,
            `A chat előzmények törölve. Miben segíthetek a(z) **${screenContext.title}** kapcsán?`
          ),
          timestamp: new Date()
        }
      ]);
    } catch {}
  };

  // Quick contextual prompts based on active screen
  const contextualPrompts = useMemo(() => {
    switch (screenContext.category) {
      case "client":
        return [
          t("Summarize this client's financial history", "Zosumarizuj finančnú históriu tohto klienta", "Foglald össze az ügyfél pénzügyi előzményeit"),
          t("List all active projects for this client", "Vypíš všetky aktívne projekty tohto klienta", "Listázd az ügyfél aktív projektjeit"),
          t("Are there any overdue invoices for them?", "Má tento klient nejaké faktúry po splatnosti?", "Van lejárt tartozása ennek az ügyfélnek?")
        ];
      case "leads":
        return [
          t("Analyze our lead conversion pipeline", "Analyzuj konverzný lievik záujemcov", "Elemezd a lead konverziós tölcsért"),
          t("Which lead has the highest potential value?", "Ktorý lead má najvyššiu potenciálnu hodnotu?", "Melyik érdeklődő bír a legnagyobb értékkel?"),
          t("Identify uncontacted leads needing urgent follow-up", "Ukáž nekontaktovaných záujemcov na follow-up", "Mutasd a sürgős követést igénylő leadeket")
        ];
      case "projects":
        return [
          t("Which projects are at risk of missing deadlines?", "Ktoré projekty majú ohrozený termín?", "Melyik projekt határideje van veszélyben?"),
          t("Summarize ongoing team workload", "Zosumarizuj vyťaženie tímu na projektoch", "Foglald össze a csapat projektterhelését"),
          t("Show highest revenue projects", "Ukáž projekty s najvyšším ziskom", "Mutasd a legmagasabb bevételű projekteket")
        ];
      case "finances":
        return [
          t("Forecast our net cashflow for next 30 days", "Odhadni cashflow na najbližších 30 dní", "Becsüld meg a 30 napos pénzáramlást"),
          t("List all unpaid and overdue customer receivables", "Vypíš všetky nezaplatené pohľadávky po splatnosti", "Listázd az összes lejárt kintlévőséget"),
          t("Evaluate monthly recurring revenue (MRR)", "Vyhodnoť mesačný opakovaný príjem (MRR)", "Értékeld a havi ismétlődő bevételt (MRR)")
        ];
      case "tasks":
        return [
          t("What are the top 3 high priority tasks today?", "Aké sú 3 najdôležitejšie úlohy na dnes?", "Mi a 3 legfontosabb feladat mára?"),
          t("Who has the most overdue assignments?", "Kto má najviac úloh po termíne?", "Kinek van a legtöbb késedelmes feladata?"),
          t("Summarize completed work this week", "Zosumarizuj splnené úlohy tento týždeň", "Foglald össze a héten elvégzett munkát")
        ];
      default:
        return [
          t("Give me an executive brief of today's CRM activity", "Daj mi manažérsky súhrn dnešných CRM aktivít", "Adj vezetői összefoglalót a mai aktivitásokról"),
          t("What strategic decisions or risks should I review?", "Aké strategické riziká by sme mali riešiť?", "Milyen stratégiai kockázatokat vizsgáljunk meg?"),
          t("Highlight top revenue opportunities", "Zvýrazni najlepšie obchodné príležitosti", "Emeld ki a legjobb bevételi lehetőségeket")
        ];
    }
  }, [screenContext.category, systemLanguage]);

  // Navigate tool handler for Voice & Chat
  const handleNavigate = (entityType: string, target: string) => {
    if (typeof window === "undefined") return;
    const cleanTarget = target.trim();
    let targetHash = "";

    switch (entityType.toLowerCase()) {
      case "client":
        targetHash = `#client-${encodeURIComponent(cleanTarget)}`;
        break;
      case "lead":
        targetHash = `#lead-${encodeURIComponent(cleanTarget)}`;
        break;
      case "project":
        targetHash = cleanTarget.startsWith("#") ? cleanTarget : `#projects?id=${encodeURIComponent(cleanTarget)}`;
        break;
      case "finances":
      case "invoice":
        targetHash = `#finances${cleanTarget ? `?invoice=${encodeURIComponent(cleanTarget)}` : ""}`;
        break;
      case "tasks":
        targetHash = "#tasks";
        break;
      case "meetings":
        targetHash = "#meetings";
        break;
      case "dashboard":
        targetHash = "#dashboard";
        break;
      case "automation":
        targetHash = "#automation";
        break;
      default:
        targetHash = cleanTarget.startsWith("#") ? cleanTarget : `#${cleanTarget}`;
        break;
    }

    window.location.hash = targetHash;
    window.dispatchEvent(new CustomEvent("ccrm:navigate", { detail: { url: targetHash } }));
  };

  // Clean up Voice Call
  const cleanupVoiceCall = () => {
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
    setCallState("idle");
  };

  // Start Embedded Voice Call
  const startVoiceCall = async () => {
    setIsVoiceMode(true);
    setCallState("connecting");
    setVoiceErrorMessage("");
    setLiveTranscript({ user: "", agent: "" });

    try {
      const userName = currentUser?.name || currentUser?.email?.split("@")[0] || "Erik";
      const res = await fetch("/api/realtime_session.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: "orchestrator",
          language: systemLanguage,
          user_name: userName,
          current_screen_context: screenContext.summary
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error (${res.status})`);
      }

      const sessionInit = await res.json();
      if (!sessionInit.success || !sessionInit.client_secret) {
        throw new Error(sessionInit.message || "Failed to initialize realtime session token.");
      }

      const clientSecret = sessionInit.client_secret;

      // Microphone Stream
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      localStreamRef.current = mediaStream;

      // Mic Volume Analyser
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
            for (let i = 0; i < pcmData.length; i++) sum += pcmData[i];
            const avg = sum / pcmData.length;
            const norm = Math.min(100, Math.round((avg / 128) * 100));
            setUserAudioLevel(norm);
            setIsUserSpeaking(norm > 15);
          }
          animationFrameRef.current = requestAnimationFrame(checkVolume);
        };
        checkVolume();
      } catch (e) {
        console.warn("AudioContext visualizer error", e);
      }

      // RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      pcRef.current = pc;

      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      remoteAudioRef.current = remoteAudio;

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          remoteAudio.srcObject = event.streams[0];
        }
      };

      mediaStream.getTracks().forEach((track) => pc.addTrack(track, mediaStream));

      // Realtime Data Channel
      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;

      dc.addEventListener("open", () => {
        setCallState("connected");
      });

      dc.addEventListener("message", async (event) => {
        try {
          const msg = JSON.parse(event.data);

          // User Speech Started -> Interrupt AI Speech
          if (msg.type === "input_audio_buffer.speech_started") {
            setIsUserSpeaking(true);
            setIsAiSpeaking(false);
            if (dc.readyState === "open") {
              dc.send(JSON.stringify({ type: "response.cancel" }));
            }
          }

          // User speech transcription
          if (msg.type === "conversation.item.input_audio_transcription.completed") {
            const transcript = msg.transcript || "";
            if (transcript.trim()) {
              setLiveTranscript((prev) => ({ ...prev, user: transcript.trim() }));
            }
          }

          // AI Speaking state
          if (msg.type === "response.audio.delta") {
            setIsAiSpeaking(true);
          }
          if (msg.type === "response.audio.done" || msg.type === "response.done") {
            setIsAiSpeaking(false);
          }

          // AI Transcript stream
          if (msg.type === "response.audio_transcript.delta") {
            setLiveTranscript((prev) => ({
              ...prev,
              agent: (prev.agent || "") + (msg.delta || "")
            }));
          }
          if (msg.type === "response.audio_transcript.done") {
            setLiveTranscript((prev) => ({
              ...prev,
              agent: msg.transcript || prev.agent
            }));
          }

          // Function Calling: query_crm_live_data or navigate_to_entry
          if (msg.type === "response.function_call_arguments.done") {
            const callId = msg.call_id;
            const functionName = msg.name;
            let args: any = {};
            try {
              args = JSON.parse(msg.arguments || "{}");
            } catch {}

            if (functionName === "navigate_to_entry") {
              handleNavigate(args.entity_type || "tab", args.target || "dashboard");
              if (dc.readyState === "open") {
                dc.send(
                  JSON.stringify({
                    type: "conversation.item.create",
                    item: {
                      type: "function_call_output",
                      call_id: callId,
                      output: JSON.stringify({
                        success: true,
                        message: `Successfully navigated user screen to ${args.entity_type}: ${args.target}`
                      })
                    }
                  })
                );
                dc.send(JSON.stringify({ type: "response.create" }));
              }
            } else if (functionName === "query_crm_live_data") {
              const ragRes = await fetch("/api/realtime_session.php", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "query_rag",
                  query: args.query || "",
                  language: systemLanguage
                })
              });
              const ragJson = await ragRes.json();
              if (dc.readyState === "open") {
                dc.send(
                  JSON.stringify({
                    type: "conversation.item.create",
                    item: {
                      type: "function_call_output",
                      call_id: callId,
                      output: JSON.stringify({
                        result: ragJson.result || "No data found."
                      })
                    }
                  })
                );
                dc.send(JSON.stringify({ type: "response.create" }));
              }
            }
          }
        } catch {}
      });

      // SDP Offer & Exchange
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch("/api/realtime_session.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "exchange_sdp",
          sdp: offer.sdp,
          client_secret: clientSecret,
          model: "gpt-realtime-1.5"
        })
      });

      const sdpData = await sdpRes.json();
      if (!sdpData.success || !sdpData.sdp) {
        throw new Error(sdpData.message || "Failed WebRTC SDP answer negotiation.");
      }

      await pc.setRemoteDescription({
        type: "answer",
        sdp: sdpData.sdp
      });
    } catch (err: any) {
      setCallState("error");
      setVoiceErrorMessage(err?.message || "Failed to start live voice session.");
    }
  };

  // Close or toggle voice mode
  const handleToggleVoice = () => {
    if (isVoiceMode) {
      cleanupVoiceCall();
      setIsVoiceMode(false);
    } else {
      startVoiceCall();
    }
  };

  // Toggle Mute
  const handleToggleMute = () => {
    if (localStreamRef.current) {
      const nextMuted = !isMuted;
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
      setIsMuted(nextMuted);
    }
  };

  if (!isOpen) return null;

  return (
    <aside
      style={{ width: `${sidebarWidth}px` }}
      className={`h-screen flex flex-col bg-white border-l border-slate-200/90 shadow-2xl relative z-[1000] shrink-0 min-w-[360px] transition-[width] duration-75 select-text ${
        isResizing ? "cursor-ew-resize select-none" : ""
      }`}
      aria-label="AI Executive Copilot"
    >
      {/* Left-edge Resize Drag Handle */}
      <div
        onPointerDown={handleResizePointerDown}
        className="absolute top-0 left-0 -translate-x-1.5 w-3.5 h-full cursor-ew-resize hover:bg-purple-500/20 active:bg-purple-600/30 transition-colors z-50 flex items-center justify-center group"
        title={t("Drag to resize sidebar (Min 360px)", "Potiahnutím zmeňte šírku (Min 360px)", "Húzással méretezhető (Min 360px)")}
      >
        <div className="w-1 h-8 rounded-full bg-slate-300 group-hover:bg-purple-600 transition-colors" />
      </div>

      {/* TOP HEADER */}
      <div className="p-3.5 border-b border-slate-200/80 bg-gradient-to-r from-purple-50/70 via-indigo-50/40 to-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <BlobatarAvatar
              name={`Executive Leader (${VERSION_CODENAME})`}
              roleColor="purple"
              size={40}
              rounded="2xl"
              animate="always"
              expression={isAiSpeaking ? "happy" : isLoading ? "thinking" : "idle"}
            />
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-heading font-extrabold text-xs text-slate-900 truncate">
                Executive Copilot
              </h3>
              <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-700 border border-purple-200 uppercase tracking-wider">
                {VERSION_CODENAME}
              </span>
            </div>
            <p className="text-[9.5px] text-slate-500 font-semibold truncate flex items-center gap-1 mt-0.5" title={screenContext.summary}>
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
              <span className="truncate">{screenContext.title}</span>
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Talk / Voice Mode Toggle Button */}
          <button
            type="button"
            onClick={handleToggleVoice}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10.5px] font-black transition-all cursor-pointer shadow-xs active:scale-95 ${
              isVoiceMode
                ? "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/25"
                : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-purple-500/25"
            }`}
            title={isVoiceMode ? t("Exit Voice Mode", "Ukončiť hlasový hovor", "Hanghívás vége") : t("Start Live Voice Call", "Spustiť hlasový hovor", "Hanghívás indítása")}
          >
            {isVoiceMode ? <PhoneOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5 animate-pulse" />}
            <span>{isVoiceMode ? t("End", "Koniec", "Vége") : t("Talk", "Hovor", "Beszéd")}</span>
          </button>

          {/* Reset History */}
          {!isVoiceMode && (
            <button
              type="button"
              onClick={handleResetChat}
              disabled={isLoading}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer disabled:opacity-50"
              title={t("Reset Chat History", "Vyčistiť históriu", "Előzmények törlése")}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Close Sidebar Button */}
          <button
            type="button"
            onClick={() => {
              if (isVoiceMode) cleanupVoiceCall();
              onClose();
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer"
            title={t("Close Copilot", "Zavrieť copilot", "Copilot bezárása")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* BODY CONTENT: Embedded Voice Mode OR Text Chat Mode */}
      {isVoiceMode ? (
        /* EMBEDDED LIVE VOICE MODE */
        <div className="flex-1 flex flex-col justify-between p-6 bg-gradient-to-b from-slate-50/50 via-purple-50/20 to-white overflow-y-auto">
          {/* Top Status */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-700 bg-purple-100/70 border border-purple-200 px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${callState === "connected" ? "bg-emerald-500 animate-ping" : "bg-amber-400"}`} />
              {callState === "connected" ? t("Live Voice Connected", "Hlasové spojenie aktívne", "Élő hanghívás aktív") : t("Connecting...", "Pripájanie...", "Csatlakozás...")}
            </span>
            <span className="text-[10px] text-slate-400 font-bold">
              {VERSION_CODENAME} Live
            </span>
          </div>

          {/* Centered Frameless Blobatar with Voice Animation */}
          <div className="my-auto flex flex-col items-center justify-center py-6 text-center">
            <div className="relative">
              {/* Dynamic Sound Wave Halo */}
              <div
                className={`absolute -inset-6 rounded-full transition-all duration-300 ${
                  isAiSpeaking
                    ? "bg-purple-500/25 blur-xl scale-125 animate-pulse"
                    : isUserSpeaking
                      ? "bg-emerald-500/25 blur-xl scale-115 animate-pulse"
                      : "bg-indigo-500/10 blur-lg scale-100"
                }`}
              />

              <BlobatarAvatar
                name={`Executive Leader (${VERSION_CODENAME})`}
                roleColor="purple"
                size={140}
                animate="always"
                expression={isAiSpeaking ? "happy" : isUserSpeaking ? "surprised" : "idle"}
                frameless
              />
            </div>

            {/* Speaking Status Subtitle */}
            <div className="mt-6">
              {callState === "error" ? (
                <div className="bg-rose-50 text-rose-700 text-xs p-3 rounded-xl border border-rose-200 font-medium">
                  {voiceErrorMessage || t("Voice connection error", "Chyba hlasového spojenia", "Hanghívási hiba")}
                </div>
              ) : (
                <>
                  <h4 className="font-heading font-extrabold text-sm text-slate-800">
                    {isAiSpeaking
                      ? t("Executive Orchestrator speaking...", "AI líder hovorí...", "A vezetői AI beszél...")
                      : isUserSpeaking
                        ? t("Listening to you...", "Počúvam vás...", "Hallgatom Önt...")
                        : t("Ready for your question", "Pripravený na otázku", "Készen áll a kérdésre")}
                  </h4>
                  <p className="text-[10.5px] text-slate-500 mt-1 max-w-[280px]">
                    {t(
                      "Ask anything or request to navigate entries (e.g., 'Show me client Silvia')",
                      "Môžete sa opýtať čokoľvek alebo požiadať o otvorenie záznamu (napr. 'Otvor klienta Silvia')",
                      "Bármit kérdezhet vagy navigációt kérhet (pl. 'Mutasd Silvia ügyfelet')"
                    )}
                  </p>
                </>
              )}
            </div>

            {/* Audio Wave Visualizer Bars */}
            <div className="flex items-center gap-1 mt-4 h-6">
              {[...Array(9)].map((_, i) => {
                const height = isAiSpeaking
                  ? Math.max(6, Math.sin(Date.now() / 200 + i) * 18 + 10)
                  : isUserSpeaking
                    ? Math.max(6, Math.min(24, (userAudioLevel / 100) * 24 + Math.sin(i) * 6))
                    : 4;
                return (
                  <span
                    key={i}
                    style={{ height: `${height}px` }}
                    className={`w-1 rounded-full transition-all duration-75 ${
                      isAiSpeaking ? "bg-purple-600" : isUserSpeaking ? "bg-emerald-500" : "bg-slate-200"
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Real-time Rolling Transcript Preview */}
          <div className="space-y-2 bg-white/80 backdrop-blur-xs p-3.5 rounded-2xl border border-slate-200/80 shadow-xs text-xs">
            {liveTranscript.user && (
              <p className="text-slate-600 font-medium">
                <span className="font-bold text-slate-800">{t("You:", "Vy:", "Ön:")}</span> {liveTranscript.user}
              </p>
            )}
            {liveTranscript.agent && (
              <p className="text-purple-700 font-semibold">
                <span className="font-bold text-purple-900">{VERSION_CODENAME}:</span> {liveTranscript.agent}
              </p>
            )}
            {!liveTranscript.user && !liveTranscript.agent && (
              <p className="text-slate-400 italic text-[11px] text-center">
                {t("Speak naturally to start conversation...", "Hovorte plynule, mikrofón je aktívny...", "Beszéljen természetesen, a mikrofon aktív...")}
              </p>
            )}
          </div>

          {/* Voice Controls Bottom Bar */}
          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={handleToggleMute}
              className={`p-3 rounded-2xl border transition-all cursor-pointer shadow-sm active:scale-95 ${
                isMuted
                  ? "bg-rose-50 border-rose-200 text-rose-600"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
              title={isMuted ? "Unmute Mic" : "Mute Mic"}
            >
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                cleanupVoiceCall();
                setIsVoiceMode(false);
              }}
              className="px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-600/25 flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
            >
              <PhoneOff className="h-4 w-4" />
              <span>{t("End Call", "Ukončiť hovor", "Hívás befejezése")}</span>
            </button>
          </div>
        </div>
      ) : (
        /* TEXT CHAT MODE */
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/30">
          {/* Quick Screen-Aware Strategic Prompts Bar */}
          <div className="p-2.5 bg-slate-100/70 border-b border-slate-200/80 flex items-center gap-1.5 overflow-x-auto scrollbar-none min-w-0">
            <span className="text-[9px] font-black uppercase tracking-wider text-purple-700 shrink-0 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-500" />
              {t("Screen Prompts:", "Témy:", "Kérdések:")}
            </span>
            {contextualPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSendText(prompt)}
                disabled={isLoading}
                className="text-[10px] bg-white hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-200/80 hover:border-purple-200 px-2.5 py-1 rounded-full whitespace-nowrap transition-all shadow-2xs cursor-pointer shrink-0 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Messages Area */}
          <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-3.5 scrollbar-thin">
            {messages.map((msg) => {
              const isAgent = msg.sender === "agent";
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 max-w-[94%] min-w-0 ${isAgent ? "mr-auto" : "ml-auto flex-row-reverse"}`}
                >
                  {/* Mini Avatar */}
                  <div className="shrink-0 mt-0.5">
                    {isAgent ? (
                      <BlobatarAvatar
                        name={`Executive Leader (${VERSION_CODENAME})`}
                        roleColor="purple"
                        size={28}
                        rounded="xl"
                        animate="always"
                      />
                    ) : (
                      <BlobatarAvatar
                        name={currentUser?.name || currentUser?.email || "Erik"}
                        roleColor="indigo"
                        size={28}
                        rounded="xl"
                        animate="always"
                      />
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-xs relative min-w-0 max-w-full ${
                      isAgent
                        ? "bg-white border border-slate-200/80 text-slate-800 rounded-tl-none"
                        : "bg-purple-600 text-white rounded-tr-none font-medium"
                    }`}
                  >
                    {isAgent ? (
                      <div className="min-w-0 max-w-full">
                        <Markdown content={msg.text} />
                        <span className="text-[8.5px] block mt-2 text-slate-400 font-semibold text-right">
                          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ) : (
                      <div>
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                        <span className="text-[8px] block mt-1.5 text-right text-purple-200">
                          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex gap-2.5 max-w-[90%] mr-auto">
                <div className="shrink-0 mt-0.5">
                  <BlobatarAvatar
                    name={`Executive Leader (${VERSION_CODENAME})`}
                    roleColor="purple"
                    size={28}
                    rounded="xl"
                    animate="always"
                    expression="thinking"
                  />
                </div>
                <div className="p-3.5 rounded-2xl bg-white border border-slate-200 text-slate-600 rounded-tl-none shadow-xs flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">
                    {t("Analyzing screen & CRM context...", "Analyzujem kontext obrazovky...", "Képernyő és adatok elemzése...")}
                  </span>
                  <span className="h-1.5 w-1.5 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Chat Input Form - Ultra Visible, Glowing & Elevated */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendText();
            }}
            className="p-3.5 sm:p-4 bg-white/95 backdrop-blur-md border-t-2 border-purple-200/90 shadow-[0_-12px_32px_rgba(124,58,237,0.12)] shrink-0 z-20"
          >
            <div className="relative flex items-center bg-slate-50/90 hover:bg-slate-50 focus-within:bg-white rounded-2xl border-2 border-purple-400/90 hover:border-purple-500 focus-within:border-purple-600 focus-within:ring-4 focus-within:ring-purple-500/20 p-2 transition-all shadow-sm">
              <Sparkles className="h-4 w-4 text-purple-600 ml-1.5 shrink-0 animate-pulse" />
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={t(
                  `Ask ${VERSION_CODENAME} about ${screenContext.title}...`,
                  `Opýtajte sa na ${screenContext.title}...`,
                  `Kérdezzen a(z) ${screenContext.title} témában...`
                )}
                disabled={isLoading}
                className="flex-1 bg-transparent px-3 py-1.5 text-xs sm:text-sm text-slate-900 font-semibold placeholder:text-slate-400 placeholder:font-normal focus:outline-none disabled:opacity-50 min-w-0"
              />

              <div className="flex items-center gap-2 shrink-0 pr-1">
                {/* Voice Call Quick Launch Button */}
                <button
                  type="button"
                  onClick={startVoiceCall}
                  className="h-9 px-3 rounded-xl bg-purple-100 hover:bg-purple-200/90 text-purple-800 hover:text-purple-950 font-bold border border-purple-300 flex items-center gap-1.5 text-xs transition-all shadow-2xs active:scale-95 cursor-pointer"
                  title={t("Start Voice Call", "Spustiť hlasový hovor", "Hanghívás indítása")}
                >
                  <Mic className="h-4 w-4 text-purple-700" />
                  <span className="hidden sm:inline font-bold text-[11.5px]">{t("Talk", "Hovor", "Beszéd")}</span>
                </button>

                {/* Prominent Send Button */}
                <button
                  type="submit"
                  disabled={!inputText.trim() || isLoading}
                  className="h-9 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 disabled:opacity-30 disabled:cursor-not-allowed text-white flex items-center justify-center gap-1.5 text-xs font-black shadow-md shadow-purple-600/35 transition-all active:scale-95 cursor-pointer"
                  title={t("Send Message", "Odoslať správu", "Üzenet küldése")}
                >
                  <span>{t("Send", "Odoslať", "Küldés")}</span>
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Grounding & Help Subtext */}
            <div className="flex items-center justify-between px-1.5 pt-2 text-[10px] text-slate-400 font-medium">
              <span className="flex items-center gap-1.5 truncate max-w-[70%]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="truncate">
                  {t("Grounded in:", "Kontext:", "Kontextus:")} <strong className="text-slate-700 font-semibold">{screenContext.title}</strong>
                </span>
              </span>
              <span className="text-[9.5px] text-slate-400 shrink-0">
                ↵ {t("Enter to send", "Enter pre odoslanie", "Enter a küldéshez")}
              </span>
            </div>
          </form>
        </div>
      )}
    </aside>
  );
};
