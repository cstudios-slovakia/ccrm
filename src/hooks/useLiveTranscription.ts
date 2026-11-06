import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyTranscriptEvent,
  createTranscriptState,
  finalizeAll,
  type LiveSegment,
  type RealtimeTranscriptEvent,
} from "../utils/liveTranscript";
import { DEFAULT_VAD, initialVad, rmsFromBytes, stepVad } from "../utils/liveCommitVad";
import {
  HEALTHY_AFTER_MS,
  failuresAfterDrop,
  isSessionExpiredError,
  nextReconnectDelay,
  rotateAfterMs,
} from "../utils/liveReconnect";
import { reportLiveTranscriptionSeconds } from "../utils/aiUsage";

/**
 * Meeting Room focus helper: a live transcript next to the recording.
 *
 * One Realtime TRANSCRIPTION session (`gpt-live-transcribe`) over WebRTC, opened with an
 * ephemeral secret that `/api/live_transcription_session.php` mints. The audio is a CLONE of the
 * recorder's own microphone track: this hook never calls getUserMedia, and it never touches the
 * MediaRecorder, so a failing live session cannot interrupt the recording.
 *
 * - `running` false (paused, stopped) closes the session; the text stays in memory.
 * - A new `stream` (a new recording) clears the text; a re-connect on the same stream keeps it.
 * - The model has no server-side turn detection, so the end of each stretch of speech is found
 *   here (`liveCommitVad`) and committed over the data channel.
 * - While `running`, a dropped or expired session is re-opened on its own (1 s, 3 s, 10 s), and a
 *   session is replaced shortly before the 60 minute limit, new one first. Only then an error.
 */

export type LiveStatus = "off" | "idle" | "connecting" | "live" | "reconnecting" | "error";

/** Why the helper stopped. The panel translates it; `detail` is the raw server text, for a tooltip. */
export type LiveErrorCode = "unsupported" | "mic_analyser" | "connect" | "dropped" | "server";
export interface LiveError {
  code: LiveErrorCode;
  detail?: string;
}

interface Options {
  /** The user turned the Focus helper on. */
  enabled: boolean;
  /** The recording is actually running (not paused, not stopped). */
  running: boolean;
  /** The recorder's microphone stream. */
  stream: MediaStream | null;
  /** Elapsed recording seconds, pause-aware. Read when an event arrives. */
  getElapsed: () => number;
  /** ISO-639-1 hints, e.g. ["sk", "en"]. */
  languages: string[];
}

export interface LiveTranscription {
  status: LiveStatus;
  error: LiveError | null;
  segments: LiveSegment[];
  retry: () => void;
  clear: () => void;
}

const BENIGN_ERROR_CODES = new Set(["input_audio_buffer_commit_empty"]);
const USAGE_CHECKPOINT_MS = 60_000;
const VAD_TICK_MS = 50;
/** After pause or stop mid-sentence, give the model this long to return the last words. */
const FLUSH_GRACE_MS = 3000;
/** Longest wait for a new session to open before it counts as failed. */
const OPEN_TIMEOUT_MS = 15_000;
/** A disconnected peer gets this long to recover before it counts as dropped. */
const DISCONNECT_GRACE_MS = 5000;
/** A replacement that fails to open is retried this often while the old session still runs. */
const ROTATE_RETRY_MS = 30_000;

class LiveStartError extends Error {
  code: LiveErrorCode;
  constructor(code: LiveErrorCode, detail?: string) {
    super(detail || code);
    this.code = code;
  }
}

const postJson = async (body: Record<string, unknown>): Promise<any> => {
  const res = await fetch("/api/live_transcription_session.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new LiveStartError("connect", data?.message || `HTTP ${res.status}`);
  }
  return data;
};

/** One WebRTC connection. The microphone clone, analyser and VAD live outside it, so a swap has no gap. */
interface Conn {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  openedAt: number;
  closed: boolean;
  closeNow: () => void;
}

export function useLiveTranscription({ enabled, running, stream, getElapsed, languages }: Options): LiveTranscription {
  const [transcript, setTranscript] = useState(createTranscriptState);
  const [status, setStatus] = useState<LiveStatus>(enabled ? "idle" : "off");
  const [error, setError] = useState<LiveError | null>(null);
  const [attempt, setAttempt] = useState(0);

  const getElapsedRef = useRef(getElapsed);
  getElapsedRef.current = getElapsed;
  const langKey = languages.join(",");

  // A new recording starts a new transcript.
  const lastStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    if (stream && stream !== lastStreamRef.current) {
      lastStreamRef.current = stream;
      setTranscript(createTranscriptState());
    }
  }, [stream]);

  useEffect(() => {
    if (!enabled) {
      setStatus("off");
      setError(null);
      return;
    }
    if (!running || !stream) {
      setStatus("idle");
      return;
    }
    const sourceTrack = stream.getAudioTracks().find((t) => t.readyState === "live");
    if (!sourceTrack || typeof RTCPeerConnection === "undefined") {
      setStatus("error");
      setError({ code: "unsupported" });
      return;
    }

    let disposed = false;
    let finished = false;
    const clone = sourceTrack.clone();
    const local = new MediaStream([clone]);
    const hints = langKey ? langKey.split(",") : [];

    let current: Conn | null = null;
    let ctx: AudioContext | null = null;
    let vadTimer: ReturnType<typeof setInterval> | null = null;
    let usageTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let rotateTimer: ReturnType<typeof setTimeout> | null = null;
    let liveSince: number | null = null;
    let failures = 0;
    let vad = initialVad();

    setStatus("connecting");
    setError(null);

    const flushUsage = () => {
      if (liveSince == null) return;
      const now = Date.now();
      reportLiveTranscriptionSeconds((now - liveSince) / 1000);
      liveSince = now;
    };
    const pauseUsage = () => {
      flushUsage();
      liveSince = null;
    };

    const sendCommit = (conn: Conn | null) => {
      if (conn && !conn.closed && conn.dc.readyState === "open") {
        try { conn.dc.send(JSON.stringify({ type: "input_audio_buffer.commit" })); } catch { /* closing */ }
      }
    };
    const pendingSpeech = () => vad.inSpeech && vad.speechMs >= DEFAULT_VAD.minSpeechMs;

    const stopTimers = () => {
      for (const t of [vadTimer, usageTimer]) if (t) clearInterval(t);
      for (const t of [reconnectTimer, rotateTimer]) if (t) clearTimeout(t);
      vadTimer = usageTimer = null;
      reconnectTimer = rotateTimer = null;
    };

    /** Final teardown: connection, analyser, and the cloned microphone track. */
    const release = () => {
      if (finished) return;
      finished = true;
      stopTimers();
      current?.closeNow();
      current = null;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
      try { clone.stop(); } catch { /* already stopped */ }
      setTranscript((prev) => finalizeAll(prev));
    };

    /** Out of retries (or never connected): the visible error, with Retry. */
    const giveUp = (err: LiveError) => {
      if (disposed) return;
      pauseUsage();
      release();
      setStatus("error");
      setError(err);
    };

    const startVad = () => {
      if (vadTimer) return;
      try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) throw new Error("no AudioContext");
        ctx = new Ctx();
        if (ctx!.state === "suspended") ctx!.resume().catch(() => {});
        const analyser = ctx!.createAnalyser();
        analyser.fftSize = 1024;
        ctx!.createMediaStreamSource(local).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        let last = performance.now();
        vadTimer = setInterval(() => {
          const now = performance.now();
          const dt = now - last;
          last = now;
          analyser.getByteTimeDomainData(buf);
          const step = stepVad(vad, rmsFromBytes(buf), dt, DEFAULT_VAD);
          vad = step.state;
          if (step.commit) sendCommit(current);
        }, VAD_TICK_MS);
      } catch {
        // Without the analyser nothing is ever committed, so the feed would stay silent.
        giveUp({ code: "mic_analyser" });
      }
    };

    /** Open one connection and resolve when its data channel is open. */
    const openConn = (onDrop: (conn: Conn, expired: boolean) => void): Promise<Conn> =>
      new Promise((resolve, reject) => {
        let pc: RTCPeerConnection | null = null;
        let dc: RTCDataChannel | null = null;
        let lostTimer: ReturnType<typeof setTimeout> | null = null;
        let openTimer: ReturnType<typeof setTimeout> | null = null;
        let opened = false;
        let settled = false;
        const conn: Conn = {
          get pc() { return pc as RTCPeerConnection; },
          get dc() { return dc as RTCDataChannel; },
          openedAt: 0,
          closed: false,
          closeNow: () => {
            if (conn.closed) return;
            conn.closed = true;
            if (lostTimer) clearTimeout(lostTimer);
            if (openTimer) clearTimeout(openTimer);
            try { dc?.close(); } catch { /* already closed */ }
            try { pc?.close(); } catch { /* already closed */ }
          },
        } as Conn;
        const fail = (err: LiveStartError) => {
          conn.closeNow();
          if (!settled) { settled = true; reject(err); }
        };
        const dropped = (expired = false) => {
          if (conn.closed) return;
          if (!opened) return fail(new LiveStartError("connect"));
          onDrop(conn, expired);
        };

        (async () => {
          try {
            const created = await postJson({ action: "create_session", languages: hints });
            if (disposed) return fail(new LiveStartError("connect"));
            pc = new RTCPeerConnection();
            pc.addTrack(clone, local);
            dc = pc.createDataChannel("oai-events");
            openTimer = setTimeout(() => fail(new LiveStartError("connect", "timeout")), OPEN_TIMEOUT_MS);
            dc.addEventListener("open", () => {
              if (conn.closed) return;
              opened = true;
              conn.openedAt = Date.now();
              if (openTimer) clearTimeout(openTimer);
              settled = true;
              resolve(conn);
            });
            dc.addEventListener("close", () => dropped());
            dc.addEventListener("message", (raw: MessageEvent) => {
              if (conn.closed) return;
              let event: (RealtimeTranscriptEvent & { error?: { code?: string; message?: string; type?: string } }) | null = null;
              try { event = JSON.parse(raw.data); } catch { return; }
              if (!event || typeof event.type !== "string") return;
              if (event.type === "error") {
                if (event.error?.code && BENIGN_ERROR_CODES.has(event.error.code)) return;
                if (isSessionExpiredError(event.error)) return dropped(true);
                if (!opened) return fail(new LiveStartError("server", event.error?.message));
                conn.closeNow();
                return giveUp({ code: "server", detail: event.error?.message });
              }
              const at = getElapsedRef.current();
              setTranscript((prev) => applyTranscriptEvent(prev, event as RealtimeTranscriptEvent, at));
            });
            pc.addEventListener("connectionstatechange", () => {
              const s = pc?.connectionState;
              if (s === "failed" || s === "closed") dropped();
              else if (s === "disconnected") {
                lostTimer = setTimeout(() => {
                  if (pc?.connectionState === "disconnected") dropped();
                }, DISCONNECT_GRACE_MS);
              } else if (s === "connected" && lostTimer) {
                clearTimeout(lostTimer);
                lostTimer = null;
              }
            });

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            const answer = await postJson({ action: "exchange_sdp", sdp: offer.sdp, client_secret: created.client_secret });
            if (conn.closed) return;
            await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
          } catch (e: any) {
            fail(e instanceof LiveStartError ? e : new LiveStartError("connect", e?.message));
          }
        })();
      });

    /** A live connection became current: start billing, the VAD, and the proactive swap timer. */
    const adopt = (conn: Conn) => {
      current = conn;
      setStatus("live");
      setError(null);
      if (liveSince == null) liveSince = Date.now();
      if (!usageTimer) usageTimer = setInterval(flushUsage, USAGE_CHECKPOINT_MS);
      startVad();
      if (rotateTimer) clearTimeout(rotateTimer);
      rotateTimer = setTimeout(rotate, rotateAfterMs());
    };

    /** Replace the session shortly before the limit: commit, open the new one, then close the old. */
    const rotate = async () => {
      rotateTimer = null;
      const old = current;
      if (disposed || finished || !old || old.closed) return;
      try {
        if (pendingSpeech()) { sendCommit(old); vad = initialVad(); }
        const next = await openConn(handleDrop);
        if (disposed || finished) return next.closeNow();
        adopt(next);
        // Let the old session return the words it was still working on.
        setTimeout(() => old.closeNow(), FLUSH_GRACE_MS);
      } catch {
        if (!disposed && !finished && current === old && !old.closed) rotateTimer = setTimeout(rotate, ROTATE_RETRY_MS);
      }
    };

    /** The current connection dropped or expired while recording: back off and re-open. */
    function handleDrop(conn: Conn, expired: boolean) {
      if (disposed || finished || conn !== current) {
        // A superseded connection ending is the normal end of a swap.
        if (conn !== current) conn.closeNow();
        return;
      }
      current = null;
      conn.closeNow();
      pauseUsage(); // nothing is streamed while reconnecting, so nothing is billed
      const liveMs = Date.now() - conn.openedAt;
      failures = failuresAfterDrop(failures, liveMs);
      if (rotateTimer) { clearTimeout(rotateTimer); rotateTimer = null; }
      // An expired session that had been working is simply replaced; one that expires at once
      // goes through the backoff like any other failure, so it can never spin.
      scheduleReconnect(expired && failures === 0 && liveMs >= HEALTHY_AFTER_MS);
    }

    const scheduleReconnect = (immediate = false) => {
      const delay = immediate ? 0 : nextReconnectDelay(failures);
      if (delay == null) return giveUp({ code: "dropped" });
      if (!immediate) failures += 1;
      setStatus("reconnecting");
      reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        if (disposed || finished) return;
        try {
          const conn = await openConn(handleDrop);
          if (disposed || finished) return conn.closeNow();
          adopt(conn);
        } catch {
          if (!disposed && !finished) scheduleReconnect();
        }
      }, delay);
    };

    // First connection: a failure here (no key, no permission, no network) is an error at once,
    // not a retry loop. Only a session that has been working reconnects by itself.
    (async () => {
      try {
        const conn = await openConn(handleDrop);
        if (disposed || finished) return conn.closeNow();
        adopt(conn);
      } catch (e: any) {
        const err = e instanceof LiveStartError ? e : new LiveStartError("connect", e?.message);
        giveUp({ code: err.code, detail: err.message === err.code ? undefined : err.message });
      }
    })();

    return () => {
      disposed = true;
      pauseUsage();
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (rotateTimer) { clearTimeout(rotateTimer); rotateTimer = null; }
      if (usageTimer) { clearInterval(usageTimer); usageTimer = null; }
      if (vadTimer) { clearInterval(vadTimer); vadTimer = null; }
      // Paused or stopped in the middle of a sentence: commit it and let the last words land.
      if (!finished && current && !current.closed && current.dc.readyState === "open" && pendingSpeech()) {
        sendCommit(current);
        setTimeout(release, FLUSH_GRACE_MS);
      } else {
        release();
      }
    };
  }, [enabled, running, stream, attempt, langKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const clear = useCallback(() => setTranscript(createTranscriptState()), []);

  return { status, error, segments: transcript.segments, retry, clear };
}
