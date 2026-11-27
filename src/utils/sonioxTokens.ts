/**
 * Soniox real-time token accumulator for the Meeting Room Focus helper (docs/LIVE-MEETING-DOCUMENT.md C2.3).
 *
 * Soniox streams `tokens` (sub-word pieces, with their own leading spaces):
 *   - FINAL tokens (`is_final: true`) are sent exactly once and never repeated: they accumulate.
 *   - NON-final tokens are a provisional tail that is re-sent, in full, in every response and can
 *     change or disappear: each response's non-final set REPLACES the previous one.
 *   - `<fin>` (answer to a `finalize` message) and `<end>` (endpoint detection) are control tokens:
 *     never shown, but they seal the turn in progress.
 *   - With diarization on, a token carries `speaker`, a string such as "1" (up to 15 per stream).
 *
 * A TURN is a run of one speaker's tokens with no gap of more than 1.5 s. The segments the panel and
 * the live document read are turns. A turn is reported `final: true` only once it can no longer
 * grow (a later turn started in the FINAL tokens, it was sealed, the stream ended, or the final
 * audio position moved more than 1.5 s past it). Reporting it earlier would let the live document
 * consume a turn and then miss the words added to it afterwards.
 *
 * Soniox speaker labels are only meaningful inside one stream. They are mapped to app-level ids
 * "P1", "P2", … in order of first appearance across the whole recording; a new stream (reconnect,
 * rotation) cannot know the old voices, so its speakers get new numbers.
 *
 * No React, no DOM, no network.
 */
import type { LiveSegment } from "./liveTranscript.ts";

export interface SonioxToken {
  text: string;
  start_ms?: number;
  end_ms?: number;
  is_final?: boolean;
  speaker?: string;
}

/** What `applySonioxResponse` reads from one WebSocket message. */
export interface SonioxResponse {
  tokens?: SonioxToken[];
  /** Audio (ms of this stream) already turned into final tokens. */
  final_audio_proc_ms?: number;
  /** The last message of a stream. */
  finished?: boolean;
}

/** Silence longer than this between two tokens starts a new turn. */
export const TURN_GAP_MS = 1500;

const CONTROL_TOKENS = new Set(["<fin>", "<end>"]);

interface NormToken {
  text: string;
  speaker?: string;
  startSec: number;
  endSec: number;
  startMs?: number;
  endMs?: number;
}

interface Turn {
  id: string;
  stream: number;
  speaker?: string;
  text: string;
  startSec: number;
  updatedSec: number;
  /** End of the last token, in ms of its own stream (for the gap rule). */
  endMs?: number;
  /** A `<fin>` / `<end>` / end of stream came after it: it never grows again. */
  sealed: boolean;
}

export interface SonioxState {
  /** Number of the current stream, starting at 1. */
  stream: number;
  /** Turns built from FINAL tokens only. */
  turns: Turn[];
  /** Turns started in the current stream (the next id is `s<stream>-t<turnSeq + 1>`). */
  turnSeq: number;
  /** The provisional tail of the latest response, already normalised. */
  nonFinal: NormToken[];
  /** `<stream>:<soniox label>` -> "P<n>". */
  speakerMap: Record<string, string>;
  nextSpeaker: number;
  /** `final_audio_proc_ms` of the latest response of the current stream. */
  finalAudioMs: number | null;
}

export const createSonioxState = (): SonioxState => ({
  stream: 1,
  turns: [],
  turnSeq: 0,
  nonFinal: [],
  speakerMap: {},
  nextSpeaker: 1,
  finalAudioMs: null,
});

/**
 * A new stream (reconnect / rotation). Whatever the old stream had not finalised is kept as final
 * text (the old socket will not refine it any more) and its last turn is sealed. The speaker
 * labels of the new stream map to new P ids.
 */
export const nextStream = (s: SonioxState): SonioxState => {
  const done = finishSonioxStream(s);
  return { ...done, stream: s.stream + 1, turnSeq: 0, nonFinal: [], finalAudioMs: null };
};

/**
 * The stream ended (stop, drop): keep the provisional words as final text and seal the last turn,
 * so nothing stays "in progress" forever.
 */
export const finishSonioxStream = (s: SonioxState): SonioxState => {
  const promoted = s.nonFinal.length ? buildTurns(s.turns, s.turnSeq, s.stream, s.nonFinal) : null;
  const turns = promoted ? promoted.turns.slice() : s.turns.slice();
  const last = turns[turns.length - 1];
  if (last && !last.sealed) turns[turns.length - 1] = { ...last, sealed: true };
  return {
    ...s,
    turns,
    turnSeq: promoted ? promoted.turnSeq : s.turnSeq,
    nonFinal: [],
  };
};

/**
 * Append tokens to `turns` by the turn rules. Returns new arrays; the inputs are not modified.
 */
const buildTurns = (
  turns: Turn[],
  turnSeq: number,
  stream: number,
  tokens: NormToken[],
): { turns: Turn[]; turnSeq: number } => {
  const out = turns.slice();
  let seq = turnSeq;
  for (const tok of tokens) {
    const last = out[out.length - 1];
    const speaker = tok.speaker ?? (last && last.stream === stream ? last.speaker : undefined);
    const continues =
      !!last &&
      last.stream === stream &&
      !last.sealed &&
      last.speaker === speaker &&
      !(last.endMs != null && tok.startMs != null && tok.startMs - last.endMs > TURN_GAP_MS);
    if (continues && last) {
      out[out.length - 1] = {
        ...last,
        text: last.text + tok.text,
        updatedSec: Math.max(last.updatedSec, tok.endSec),
        endMs: tok.endMs ?? last.endMs,
      };
      continue;
    }
    const text = tok.text.replace(/^\s+/, "");
    if (!text) continue; // a lone space never opens a turn
    seq += 1;
    out.push({
      id: `s${stream}-t${seq}`,
      stream,
      speaker,
      text,
      startSec: tok.startSec,
      updatedSec: Math.max(tok.startSec, tok.endSec),
      endMs: tok.endMs,
      sealed: false,
    });
  }
  return { turns: out, turnSeq: seq };
};

/**
 * Feed one WebSocket message in. `elapsedOffsetSec` is the recording time at which this stream
 * started: a stream's `start_ms` counts the audio sent on that stream only.
 */
export const applySonioxResponse = (
  s: SonioxState,
  res: SonioxResponse,
  elapsedOffsetSec: number,
): SonioxState => {
  const tokens = Array.isArray(res?.tokens) ? res.tokens : [];
  const speakerMap = { ...s.speakerMap };
  let nextSpeaker = s.nextSpeaker;
  // Provisional ids for labels not seen in a FINAL token yet. They are only committed when the
  // label shows up in a final token, so a retracted label never burns a number.
  const tentative: Record<string, string> = {};
  let tentativeNext = nextSpeaker;

  const resolve = (label: string | undefined, persist: boolean): string | undefined => {
    if (label == null || label === "") return undefined;
    const key = `${s.stream}:${label}`;
    if (speakerMap[key]) return speakerMap[key];
    if (persist) {
      const id = `P${nextSpeaker}`;
      speakerMap[key] = id;
      nextSpeaker += 1;
      tentativeNext = Math.max(tentativeNext, nextSpeaker);
      return id;
    }
    if (!tentative[key]) {
      tentative[key] = `P${tentativeNext}`;
      tentativeNext += 1;
    }
    return tentative[key];
  };

  const norm = (t: SonioxToken, persist: boolean): NormToken => {
    const startSec = t.start_ms != null ? elapsedOffsetSec + t.start_ms / 1000 : elapsedOffsetSec;
    const endSec = t.end_ms != null ? elapsedOffsetSec + t.end_ms / 1000 : startSec;
    return {
      text: t.text,
      speaker: resolve(t.speaker, persist),
      startSec,
      endSec,
      startMs: t.start_ms,
      endMs: t.end_ms,
    };
  };

  // Final tokens first, so a label that is final in this very message gets its number before a
  // provisional one could be handed a tentative one.
  const finalRaw: SonioxToken[] = [];
  const provisionalRaw: SonioxToken[] = [];
  let sealAfterFinals = false;
  for (const t of tokens) {
    if (!t || typeof t.text !== "string") continue;
    if (CONTROL_TOKENS.has(t.text)) {
      // A control token is always final; it seals what came before it in this message.
      if (t.is_final !== false) sealAfterFinals = true;
      continue;
    }
    if (t.is_final) finalRaw.push(t);
    else provisionalRaw.push(t);
  }
  const finals = finalRaw.map((t) => norm(t, true));
  const provisional = provisionalRaw.map((t) => norm(t, false));

  let turns = s.turns;
  let turnSeq = s.turnSeq;
  if (finals.length) {
    const built = buildTurns(turns, turnSeq, s.stream, finals);
    turns = built.turns;
    turnSeq = built.turnSeq;
  }
  if (sealAfterFinals || res.finished) {
    const last = turns[turns.length - 1];
    if (last && !last.sealed) {
      turns = turns.slice();
      turns[turns.length - 1] = { ...last, sealed: true };
    }
  }

  return {
    ...s,
    turns,
    turnSeq,
    // The provisional set is replaced wholesale: an empty one clears the tail.
    nonFinal: res.finished ? [] : provisional,
    speakerMap,
    nextSpeaker,
    finalAudioMs: typeof res.final_audio_proc_ms === "number" ? res.final_audio_proc_ms : s.finalAudioMs,
  };
};

/**
 * The turns as live segments, oldest first: the final turns, with the provisional tail either
 * merged into the turn it continues or shown as new in-progress turn(s).
 */
export const sonioxSegments = (s: SonioxState): LiveSegment[] => {
  const merged = s.nonFinal.length ? buildTurns(s.turns, s.turnSeq, s.stream, s.nonFinal) : null;
  const all = merged ? merged.turns : s.turns;
  const finalCount = s.turns.length;
  const lastFinal = s.turns[finalCount - 1];
  // The provisional tail continues the last final turn when that turn text grew.
  const continued = !!merged && !!lastFinal && merged.turns[finalCount - 1]?.text.trim() !== lastFinal.text.trim();

  return all.map((t, i) => {
    let final: boolean;
    if (i >= finalCount) final = false; // a turn that exists only in the provisional tail
    else if (i < finalCount - 1) final = true; // a later turn already started in the final tokens
    else if (t.sealed || t.stream !== s.stream) final = true;
    else if (continued) final = false;
    else {
      final =
        s.finalAudioMs != null && t.endMs != null && s.finalAudioMs - t.endMs > TURN_GAP_MS;
    }
    const seg: LiveSegment = {
      id: t.id,
      text: t.text.trim(),
      final,
      startSec: t.startSec,
      updatedSec: t.updatedSec,
    };
    if (t.speaker) seg.speaker = t.speaker;
    return seg;
  });
};
