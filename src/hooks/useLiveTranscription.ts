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
import {
  applySonioxResponse,
  createSonioxState,
  finishSonioxStream,
  nextStream,
  sonioxSegments,
} from "../utils/sonioxTokens";
import { startPcmCapture, type PcmCapture } from "../utils/pcmCapture";

/**
 * Meeting Room focus helper: a live transcript next to the recording.
 *
 * One Realtime TRANSCRIPTION session (`gpt-live-transcribe`) over WebRTC, opened with an
 * ephemeral secret that `/api/live_transcription_session.php` mints. The audio is a CLONE of the
 * recorder's own microphone track: this hook never calls getUserMedia, and it never touches the
 * MediaRecorder, so a failing live session cannot interrupt the recording.
 *
 * Two providers, chosen by the server (`create_session` answers `provider`):
 * - "openai" (no Soniox key): the WebRTC session above, no speakers. Everything below this list
 *   about VAD, commits and rotation is this path.
 * - "soniox": a WebSocket to Soniox real-time (`stt-rt-v6`) opened with a TEMPORARY key, fed 16 kHz
 *   mono PCM from the same cloned track (`pcmCapture`). Speakers are told apart live; `segments`
 *   are turns with a `speaker` id (P1, P2, ...). Pause keeps the socket open (finalize + keepalive)
 *   so speaker numbers survive; only Stop ends the stream. See docs/LIVE-MEETING-DOCUMENT.md C2.
 *
 * - `running` false (paused, stopped) closes the OpenAI session; the text stays in memory.
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

export type LiveProvider = "openai" | "soniox";

export interface LiveTranscription {
  /** Which provider the server picked; null until the first `create_session` answer. */
  provider: LiveProvider | null;
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
/** Soniox: a stream carries at most 300 minutes of audio; a new one is opened at 290. */
const SONIOX_ROTATE_AFTER_AUDIO_SEC = 290 * 60;
/** Soniox closes a stream that gets neither audio nor a keepalive for 20 s. */
const SONIOX_KEEPALIVE_MS = 10_000;
/** After Stop, how long to wait for Soniox's `finished` message before closing anyway. */
const SONIOX_FINISH_WAIT_MS = 3000;
const SONIOX_SAMPLE_RATE = 16000;

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

/** One Soniox WebSocket stream. The microphone capture lives outside it, so a swap has no gap. */
interface SxConn {
  ws: WebSocket;
  openedAt: number;
  closed: boolean;
  /** Soniox sent `finished: true`. */
  finished: boolean;
  /** Recording time (s) of the first audio frame sent on this stream: `start_ms` counts from it. */
  offsetSec: number;
  firstFrame: boolean;
  /** Audio seconds sent on this stream (for the 300 minute limit). */
  audioSec: number;
  onFinished: (() => void) | null;
  closeNow: () => void;
}

export function useLiveTranscription({ enabled, running, stream, getElapsed, languages }: Options): LiveTranscription {
  const [transcript, setTranscript] = useState(createTranscriptState);
  const [status, setStatus] = useState<LiveStatus>(enabled ? "idle" : "off");
  const [error, setError] = useState<LiveError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [provider, setProvider] = useState<LiveProvider | null>(null);

  const getElapsedRef = useRef(getElapsed);
  getElapsedRef.current = getElapsed;
  const runningRef = useRef(running);
  runningRef.current = running;
  // Soniox: the token accumulator outlives a socket (a reconnect keeps the text and the speakers).
  const sxStateRef = useRef(createSonioxState());
  const sxUsedRef = useRef(false);
  const sxControlRef = useRef<{ setRunning: (r: boolean) => void } | null>(null);
  const langKey = languages.join(",");

  // A new recording starts a new transcript.
  const lastStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    if (stream && stream !== lastStreamRef.current) {
      lastStreamRef.current = stream;
      sxStateRef.current = createSonioxState();
      sxUsedRef.current = false;
      setTranscript(createTranscriptState());
    }
  }, [stream]);

  // Soniox keeps its socket open while paused: only the audio flow follows `running`.
  useEffect(() => {
    sxControlRef.current?.setRunning(running);
  }, [running]);

  // With Soniox the effect below must NOT restart on pause, so `running` drops out of its inputs.
  const keepWhilePaused = provider === "soniox";

  useEffect(() => {
    // Every run starts undecided: the provider is only known once the server has answered.
    setProvider(null);
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

    let mode: LiveProvider | null = null;
    let current: Conn | null = null;
    let ctx: AudioContext | null = null;
    let vadTimer: ReturnType<typeof setInterval> | null = null;
    let usageTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let rotateTimer: ReturnType<typeof setTimeout> | null = null;
    let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
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
      for (const t of [vadTimer, usageTimer, keepaliveTimer]) if (t) clearInterval(t);
      for (const t of [reconnectTimer, rotateTimer]) if (t) clearTimeout(t);
      vadTimer = usageTimer = keepaliveTimer = null;
      reconnectTimer = rotateTimer = null;
    };

    // --- Soniox state of this effect run ---------------------------------------------------
    let sxCurrent: SxConn | null = null;
    let capture: PcmCapture | null = null;
    let capturePending = false;
    let flowing = false; // audio is being sent (recording, not paused)
    let sxUnreported = 0; // audio seconds sent and not reported to the usage ledger yet
    let sxConfirmed = false; // the server has answered with at least one real response
    let sxRotating = false;

    const flushSxUsage = () => {
      if (sxUnreported < 1) return;
      reportLiveTranscriptionSeconds(sxUnreported, "stt-rt-v6");
      sxUnreported = 0;
    };
    const publishSx = () => setTranscript({ segments: sonioxSegments(sxStateRef.current) });

    /** Final teardown: connection, analyser, and the cloned microphone track. */
    const release = () => {
      if (finished) return;
      finished = true;
      stopTimers();
      current?.closeNow();
      current = null;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
      try { clone.stop(); } catch { /* already stopped */ }
      sxCurrent?.closeNow();
      sxCurrent = null;
      if (capture) { capture.stop(); capture = null; }
      flushSxUsage();
      if (mode === "soniox") {
        // Whatever Soniox had not finalised stays as text, and nothing is "in progress" any more.
        sxStateRef.current = finishSonioxStream(sxStateRef.current);
        publishSx();
      } else {
        setTranscript((prev) => finalizeAll(prev));
      }
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
    const openConn = (onDrop: (conn: Conn, expired: boolean) => void, preset?: any): Promise<Conn> =>
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
            const created = preset ?? (await postJson({ action: "create_session", languages: hints }));
            if (disposed) return fail(new LiveStartError("connect"));
            // The server picked Soniox since this session started (a key was added): not ours to open.
            if (created.provider === "soniox") return fail(new LiveStartError("connect", "provider changed"));
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

    // ------------------------------------------------------------------------------------------
    // Soniox path
    // ------------------------------------------------------------------------------------------

    const sxSend = (conn: SxConn, data: string | ArrayBuffer): boolean => {
      if (conn.closed || conn.ws.readyState !== WebSocket.OPEN) return false;
      try { conn.ws.send(data); return true; } catch { return false; }
    };
    const sxControl = (conn: SxConn, type: "finalize" | "keepalive") => sxSend(conn, JSON.stringify({ type }));

    /** One Soniox stream; resolves once the socket is open and the start message is sent. */
    const openSx = (preset: any | null): Promise<SxConn> =>
      new Promise((resolve, reject) => {
        let opened = false;
        let settled = false;
        let openTimer: ReturnType<typeof setTimeout> | null = null;
        const conn: SxConn = {
          ws: null as unknown as WebSocket,
          openedAt: 0,
          closed: false,
          finished: false,
          offsetSec: getElapsedRef.current(),
          firstFrame: false,
          audioSec: 0,
          onFinished: null,
          closeNow: () => {
            if (conn.closed) return;
            conn.closed = true;
            if (openTimer) clearTimeout(openTimer);
            try { conn.ws?.close(); } catch { /* already closed */ }
          },
        };
        const fail = (err: LiveStartError) => {
          conn.closeNow();
          if (!settled) { settled = true; reject(err); }
        };

        (async () => {
          try {
            // Every stream, including a reconnect, gets its own temporary key.
            const session = preset ?? (await postJson({ action: "create_session", languages: hints }));
            if (disposed) return fail(new LiveStartError("connect"));
            if (session.provider !== "soniox" || !session.ws_url || !session.api_key) {
              return fail(new LiveStartError("connect", "provider changed"));
            }
            // The temporary key travels in the protocols list; the `api_key` field of the start
            // message is deprecated and refused from 2027-01-15, so it is never used.
            const ws = new WebSocket(session.ws_url, ["soniox-api-key", session.api_key]);
            ws.binaryType = "arraybuffer";
            conn.ws = ws;
            openTimer = setTimeout(() => fail(new LiveStartError("connect", "timeout")), OPEN_TIMEOUT_MS);
            ws.addEventListener("open", () => {
              if (conn.closed) return;
              try {
                ws.send(JSON.stringify({
                  model: session.model,
                  audio_format: "pcm_s16le",
                  sample_rate: SONIOX_SAMPLE_RATE,
                  num_channels: 1,
                  language_hints: hints,
                  enable_speaker_diarization: true,
                  // Endpoint detection lowers diarization accuracy; turns come from the token timestamps.
                  enable_endpoint_detection: false,
                }));
              } catch {
                return fail(new LiveStartError("connect"));
              }
              opened = true;
              conn.openedAt = Date.now();
              if (openTimer) clearTimeout(openTimer);
              settled = true;
              resolve(conn);
            });
            ws.addEventListener("message", (raw: MessageEvent) => {
              if (conn.closed || typeof raw.data !== "string") return;
              let res: any = null;
              try { res = JSON.parse(raw.data); } catch { return; }
              if (!res || typeof res !== "object") return;
              if (res.error_code != null) return sxError(conn, res);
              sxConfirmed = true;
              sxStateRef.current = applySonioxResponse(sxStateRef.current, res, conn.offsetSec);
              publishSx();
              if (res.finished) {
                conn.finished = true;
                const done = conn.onFinished;
                conn.onFinished = null;
                if (done) done();
              }
            });
            ws.addEventListener("close", () => {
              if (conn.closed) return;
              if (conn.finished) return conn.closeNow(); // the normal end after Stop
              if (!opened) return fail(new LiveStartError("connect"));
              sxDropped(conn, false);
            });
            // An `error` event is always followed by `close`, which carries the decision.
            ws.addEventListener("error", () => {});
          } catch (e: any) {
            fail(e instanceof LiveStartError ? e : new LiveStartError("connect", e?.message));
          }
        })();
      });

    /** A response with `error_code`: Soniox closes the socket right after it. */
    function sxError(conn: SxConn, res: any) {
      if (conn.closed) return;
      const code = Number(res.error_code);
      const detail = String(res.error_message || res.error_type || `HTTP ${code}`);
      if (disposed) { release(); return; } // an error while ending after Stop: nothing left to do
      if (conn !== sxCurrent) { conn.closeNow(); return; }
      // 400 (bad request) and 402 (budget exhausted) would fail the same way again. Before the
      // stream has ever worked, any error is shown at once, like a failed first connection.
      if (!sxConfirmed || code === 400 || code === 402) {
        sxCurrent = null;
        conn.closeNow();
        return giveUp({ code: "server", detail });
      }
      // 401 (a bad temporary key), 403 session expired, 408, 413 (duration), 429, 5xx: the
      // backoff replaces the stream, with a fresh temporary key.
      sxDropped(conn, true);
    }

    function sxDropped(conn: SxConn, expired: boolean) {
      if (disposed || finished || conn !== sxCurrent) {
        if (conn !== sxCurrent) conn.closeNow(); // a superseded stream ending is the end of a swap
        return;
      }
      sxCurrent = null;
      conn.closeNow();
      stopKeepalive();
      // The old stream will refine nothing more: keep its words, and a new stream starts new speakers.
      sxStateRef.current = finishSonioxStream(sxStateRef.current);
      publishSx();
      const liveMs = Date.now() - conn.openedAt;
      failures = failuresAfterDrop(failures, liveMs);
      scheduleSxReconnect(expired && failures === 0 && liveMs >= HEALTHY_AFTER_MS);
    }

    const scheduleSxReconnect = (immediate = false) => {
      const delay = immediate ? 0 : nextReconnectDelay(failures);
      if (delay == null) return giveUp({ code: "dropped" });
      if (!immediate) failures += 1;
      setStatus("reconnecting");
      reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        if (disposed || finished) return;
        try {
          const conn = await openSx(null);
          if (disposed || finished) return conn.closeNow();
          adoptSx(conn);
        } catch {
          if (!disposed && !finished) scheduleSxReconnect();
        }
      }, delay);
    };

    const stopKeepalive = () => {
      if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
    };

    const onPcmFrame = (buf: ArrayBuffer) => {
      const conn = sxCurrent;
      if (!flowing || !conn || conn.closed) return;
      if (!conn.firstFrame) {
        // `start_ms` counts the audio sent on this stream, so the stream's clock starts here.
        conn.firstFrame = true;
        conn.offsetSec = getElapsedRef.current();
      }
      if (!sxSend(conn, buf)) return;
      const sec = buf.byteLength / 2 / SONIOX_SAMPLE_RATE;
      conn.audioSec += sec;
      sxUnreported += sec;
    };

    const startAudio = () => {
      flowing = true;
      if (capture || capturePending || disposed || finished) return;
      capturePending = true;
      startPcmCapture(local, onPcmFrame)
        .then((c) => {
          capturePending = false;
          if (disposed || finished || !flowing) { c.stop(); return; }
          capture = c;
        })
        .catch(() => {
          capturePending = false;
          if (!disposed && !finished) giveUp({ code: "mic_analyser" });
        });
    };
    const stopAudio = () => {
      flowing = false;
      if (capture) { capture.stop(); capture = null; }
    };

    /** Audio flow follows `running`; the socket stays. Pause = finalize, then keepalives. */
    const applyRunning = (isRunning: boolean) => {
      const conn = sxCurrent;
      if (!conn || conn.closed || disposed || finished) return;
      if (isRunning) {
        stopKeepalive();
        setStatus("live");
        startAudio();
      } else {
        stopAudio();
        flushSxUsage();
        setStatus("idle");
        sxControl(conn, "finalize");
        if (!keepaliveTimer) {
          keepaliveTimer = setInterval(() => {
            if (sxCurrent) sxControl(sxCurrent, "keepalive");
          }, SONIOX_KEEPALIVE_MS);
        }
      }
    };

    /** Checkpoint usage; replace the stream shortly before its 300 minute limit. */
    const sxTick = () => {
      flushSxUsage();
      const conn = sxCurrent;
      if (conn && !sxRotating && conn.audioSec >= SONIOX_ROTATE_AFTER_AUDIO_SEC) void sxRotate();
    };

    /** New stream first, then the old one is closed; the new stream's speakers get new numbers. */
    const sxRotate = async () => {
      const old = sxCurrent;
      if (disposed || finished || !old || old.closed) return;
      sxRotating = true;
      try {
        const next = await openSx(null);
        if (disposed || finished || sxCurrent !== old) return next.closeNow();
        adoptSx(next);
        old.closeNow();
      } catch {
        // The next 60 s checkpoint tries again while the old stream still runs.
      } finally {
        sxRotating = false;
      }
    };

    /** A live Soniox stream became current. */
    const adoptSx = (conn: SxConn) => {
      sxCurrent = conn;
      if (sxUsedRef.current) sxStateRef.current = nextStream(sxStateRef.current);
      sxUsedRef.current = true;
      publishSx();
      setError(null);
      if (!usageTimer) usageTimer = setInterval(sxTick, USAGE_CHECKPOINT_MS);
      applyRunning(runningRef.current);
    };
    sxControlRef.current = { setRunning: applyRunning };

    // First connection: a failure here (no key, no permission, no network) is an error at once,
    // not a retry loop. Only a session that has been working reconnects by itself.
    (async () => {
      try {
        const created = await postJson({ action: "create_session", languages: hints });
        if (disposed || finished) return;
        mode = created.provider === "soniox" ? "soniox" : "openai";
        setProvider(mode);
        if (mode === "soniox") {
          const sx = await openSx(created);
          if (disposed || finished) return sx.closeNow();
          adoptSx(sx);
          return;
        }
        const conn = await openConn(handleDrop, created);
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
      stopKeepalive();
      if (mode === "soniox") {
        // Stop (or the helper turned off, or a new stream): end the stream the documented way,
        // finalize then an empty text frame, and give Soniox a moment to return the last words.
        stopAudio();
        const conn = sxCurrent;
        if (!finished && conn && !conn.closed && conn.ws.readyState === WebSocket.OPEN) {
          sxControl(conn, "finalize");
          sxSend(conn, "");
          conn.onFinished = release;
          setTimeout(release, SONIOX_FINISH_WAIT_MS);
        } else {
          release();
        }
        return;
      }
      // Paused or stopped in the middle of a sentence: commit it and let the last words land.
      if (!finished && current && !current.closed && current.dc.readyState === "open" && pendingSpeech()) {
        sendCommit(current);
        setTimeout(release, FLUSH_GRACE_MS);
      } else {
        release();
      }
    };
  }, [enabled, keepWhilePaused ? true : running, stream, attempt, langKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const clear = useCallback(() => {
    sxStateRef.current = createSonioxState();
    sxUsedRef.current = false;
    setTranscript(createTranscriptState());
  }, []);

  return { provider, status, error, segments: transcript.segments, retry, clear };
}
