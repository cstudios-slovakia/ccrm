import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  SummaryDto,
  SummaryGenerateRequest,
  SummaryLanguage,
  SummaryLookupResponse,
  SummaryStreamEvent,
  SummaryWindowKey,
} from "../api/contract.ts";
import { type WaaiClient, WaaiApiError } from "../api/waaiClient.ts";

export interface UseChatSummaryOptions {
  client: WaaiClient;
  conversationId: string;
  active?: boolean;
  initialLanguage?: SummaryLanguage;
}

export interface UseChatSummaryReturn {
  windowKey: SummaryWindowKey;
  setWindowKey: (key: SummaryWindowKey) => void;
  customFrom: string;
  setCustomFrom: (val: string) => void;
  customTo: string;
  setCustomTo: (val: string) => void;
  customValid: boolean;
  language: SummaryLanguage;
  setLanguage: (lang: SummaryLanguage) => void;
  summary: SummaryDto | null;
  partialNarrative: string;
  messageCount: number;
  loading: boolean;
  streaming: boolean;
  error: string | null;
  loadSummary: () => Promise<void>;
  generateSummary: (regenerate?: boolean) => Promise<void>;
  // Audio playback
  audioUrl: string | null;
  audioPlaying: boolean;
  audioLoading: boolean;
  audioCurrentTime: number;
  audioDuration: number;
  audioSpeed: number;
  toggleAudio: () => void;
  setAudioSpeed: (speed: number) => void;
  seekAudio: (seconds: number) => void;
}

export function useChatSummary({
  client,
  conversationId,
  active = true,
  initialLanguage = "en",
}: UseChatSummaryOptions): UseChatSummaryReturn {
  const [windowKey, setWindowKey] = useState<SummaryWindowKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [language, setLanguage] = useState<SummaryLanguage>(initialLanguage);

  const [summary, setSummary] = useState<SummaryDto | null>(null);
  const [partialNarrative, setPartialNarrative] = useState("");
  const [messageCount, setMessageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioSpeed, setAudioSpeedState] = useState(1);

  const customValid = useMemo(() => {
    if (windowKey !== "custom") return true;
    if (!customFrom || !customTo) return false;
    const f = new Date(customFrom).getTime();
    const t = new Date(customTo).getTime();
    return !Number.isNaN(f) && !Number.isNaN(t) && f < t;
  }, [windowKey, customFrom, customTo]);

  const audioUrl = useMemo(() => {
    if (!summary?.audio_url) return null;
    return client.mediaUrl(summary.audio_url);
  }, [client, summary?.audio_url]);

  // Clean up audio on unmount or URL change
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setAudioPlaying(false);
    setAudioLoading(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);
  }, [audioUrl]);

  const toggleAudio = useCallback(() => {
    if (!audioUrl) return;

    if (audioPlaying && audioRef.current) {
      audioRef.current.pause();
      setAudioPlaying(false);
      return;
    }

    if (!audioRef.current) {
      const audio = new Audio(audioUrl);
      audio.playbackRate = audioSpeed;
      audio.onplay = () => {
        setAudioPlaying(true);
        setAudioLoading(false);
      };
      audio.onpause = () => setAudioPlaying(false);
      audio.onended = () => {
        setAudioPlaying(false);
        setAudioCurrentTime(0);
      };
      audio.ontimeupdate = () => setAudioCurrentTime(audio.currentTime);
      audio.ondurationchange = () => setAudioDuration(audio.duration || 0);
      audio.onloadstart = () => setAudioLoading(true);
      audio.oncanplay = () => setAudioLoading(false);
      audio.onerror = () => {
        setAudioLoading(false);
        setAudioPlaying(false);
      };
      audioRef.current = audio;
    }

    setAudioLoading(true);
    audioRef.current.play().catch(() => {
      setAudioLoading(false);
      setAudioPlaying(false);
    });
  }, [audioUrl, audioPlaying, audioSpeed]);

  const setAudioSpeed = useCallback((speed: number) => {
    setAudioSpeedState(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, []);

  const seekAudio = useCallback((seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setAudioCurrentTime(seconds);
    }
  }, []);

  const generateSummary = useCallback(
    async (regenerate = false) => {
      if (windowKey === "custom" && !customValid) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setStreaming(true);
      setError(null);
      setPartialNarrative("");

      const body: SummaryGenerateRequest = {
        window: windowKey,
        regenerate,
        language,
      };
      if (windowKey === "custom") {
        body.from_at = new Date(customFrom).toISOString();
        body.to_at = new Date(customTo).toISOString();
      }

      try {
        let finalSummary: SummaryDto | null = null;
        let streamError: string | null = null;

        await client.stream(
          `/conversations/${encodeURIComponent(conversationId)}/summary`,
          (event) => {
            try {
              const data = JSON.parse(event.data) as SummaryStreamEvent["data"];
              if (event.event === "meta") {
                const meta = data as { message_count?: number };
                if (typeof meta.message_count === "number") setMessageCount(meta.message_count);
              } else if (event.event === "delta") {
                const delta = data as { delta?: string };
                if (typeof delta.delta === "string") {
                  setPartialNarrative((prev) => prev + delta.delta);
                }
              } else if (event.event === "done") {
                const done = data as { summary?: SummaryDto };
                if (done.summary) finalSummary = done.summary;
              } else if (event.event === "error") {
                const err = data as { message?: string };
                streamError = err.message ?? "Generation failed";
              }
            } catch {
              // Ignore non-json chunks
            }
          },
          {
            method: "POST",
            body,
            signal: ctrl.signal,
          },
        );

        if (streamError) {
          setError(streamError);
          setPartialNarrative("");
        } else if (finalSummary) {
          setSummary(finalSummary);
          setPartialNarrative("");
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof WaaiApiError ? err.message : "Failed to generate summary");
      } finally {
        if (abortRef.current === ctrl) {
          abortRef.current = null;
          setStreaming(false);
        }
      }
    },
    [client, conversationId, windowKey, customValid, language, customFrom, customTo],
  );

  const loadSummary = useCallback(async () => {
    if (windowKey === "custom" && !customValid) {
      setSummary(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const query: Record<string, string> = { window: windowKey };
    if (windowKey === "custom") {
      query.from = new Date(customFrom).toISOString();
      query.to = new Date(customTo).toISOString();
    }

    try {
      const res = await client.get<SummaryLookupResponse>(
        `/conversations/${encodeURIComponent(conversationId)}/summary`,
        { query },
      );
      setMessageCount(res.message_count ?? 0);
      if (res.cached && res.summary) {
        setSummary(res.summary);
      } else {
        setSummary(null);
        await generateSummary(false);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof WaaiApiError ? err.message : "Failed to load summary");
    } finally {
      setLoading(false);
    }
  }, [client, conversationId, windowKey, customValid, customFrom, customTo, generateSummary]);

  useEffect(() => {
    if (!active) return;
    void loadSummary();
    return () => {
      abortRef.current?.abort();
    };
  }, [active, loadSummary]);

  return {
    windowKey,
    setWindowKey,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    customValid,
    language,
    setLanguage,
    summary,
    partialNarrative,
    messageCount,
    loading,
    streaming,
    error,
    loadSummary,
    generateSummary,
    audioUrl,
    audioPlaying,
    audioLoading,
    audioCurrentTime,
    audioDuration,
    audioSpeed,
    toggleAudio,
    setAudioSpeed,
    seekAudio,
  };
}
