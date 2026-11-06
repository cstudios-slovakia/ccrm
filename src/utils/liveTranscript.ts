/**
 * Pure segment assembly for the Meeting Room "Focus helper".
 *
 * The Realtime transcription session streams `conversation.item.input_audio_transcription.delta`
 * events (a piece of text for one committed item) and a final
 * `conversation.item.input_audio_transcription.completed` event (the whole text of that item).
 * Completion order across items is NOT guaranteed, so everything is keyed by `item_id`.
 *
 * No React, no DOM, no network: the hook feeds events in, the panel reads segments out.
 */

export interface LiveSegment {
  id: string;
  text: string;
  /** True once the `completed` event arrived; until then the text is still being refined. */
  final: boolean;
  /** Elapsed recording time (seconds) when the item first showed up. */
  startSec: number;
  /** Elapsed recording time (seconds) of the last update. */
  updatedSec: number;
  failed?: boolean;
}

export interface LiveTranscriptState {
  segments: LiveSegment[];
}

export interface RealtimeTranscriptEvent {
  type?: string;
  item_id?: string;
  previous_item_id?: string | null;
  delta?: string;
  transcript?: string;
}

export const createTranscriptState = (): LiveTranscriptState => ({ segments: [] });

const indexOf = (segments: LiveSegment[], id: string): number => segments.findIndex((s) => s.id === id);

const withSegment = (
  segments: LiveSegment[],
  id: string,
  nowSec: number,
  previousId: string | null | undefined,
  patch: (current: LiveSegment) => LiveSegment,
): LiveSegment[] => {
  const at = indexOf(segments, id);
  if (at >= 0) {
    const next = segments.slice();
    next[at] = patch(next[at]);
    return next;
  }
  const fresh = patch({ id, text: "", final: false, startSec: nowSec, updatedSec: nowSec });
  // `previous_item_id` places a late item where it was spoken; otherwise it is the newest.
  if (previousId) {
    const prevAt = indexOf(segments, previousId);
    if (prevAt >= 0) {
      const next = segments.slice();
      next.splice(prevAt + 1, 0, fresh);
      return next;
    }
  }
  return [...segments, fresh];
};

/**
 * Apply one data-channel event. Unknown events return the same state object, so a caller can
 * skip a re-render with a reference check.
 */
export const applyTranscriptEvent = (
  state: LiveTranscriptState,
  event: RealtimeTranscriptEvent,
  nowSec: number,
): LiveTranscriptState => {
  if (!event || typeof event.type !== "string") return state;
  const id = typeof event.item_id === "string" ? event.item_id : "";
  if (!id) return state;

  switch (event.type) {
    case "input_audio_buffer.committed": {
      // The item exists from the commit on; showing it early keeps the order stable.
      if (indexOf(state.segments, id) >= 0) return state;
      return { segments: withSegment(state.segments, id, nowSec, event.previous_item_id, (s) => s) };
    }
    case "conversation.item.input_audio_transcription.delta": {
      const delta = typeof event.delta === "string" ? event.delta : "";
      if (!delta) return state;
      return {
        segments: withSegment(state.segments, id, nowSec, event.previous_item_id, (s) =>
          s.final ? s : { ...s, text: s.text + delta, updatedSec: nowSec },
        ),
      };
    }
    case "conversation.item.input_audio_transcription.completed": {
      const transcript = typeof event.transcript === "string" ? event.transcript.trim() : "";
      const known = indexOf(state.segments, id) >= 0;
      if (!transcript && !known) return state; // silence: nothing worth a row
      if (!transcript) {
        // Completed with no text: drop a row that only ever held nothing.
        const cur = state.segments[indexOf(state.segments, id)];
        if (!cur.text.trim()) return { segments: state.segments.filter((s) => s.id !== id) };
        return {
          segments: state.segments.map((s) => (s.id === id ? { ...s, final: true, updatedSec: nowSec } : s)),
        };
      }
      return {
        segments: withSegment(state.segments, id, nowSec, event.previous_item_id, (s) => ({
          ...s,
          text: transcript,
          final: true,
          updatedSec: nowSec,
        })),
      };
    }
    case "conversation.item.input_audio_transcription.failed": {
      if (indexOf(state.segments, id) < 0) return state;
      return {
        segments: state.segments.map((s) => (s.id === id ? { ...s, final: true, failed: true, updatedSec: nowSec } : s)),
      };
    }
    default:
      return state;
  }
};

/**
 * The session ended (pause, stop, error): nothing is going to refine an in-progress row any
 * more, so it stops looking "in progress". Returns the same state when there is nothing to do.
 */
export const finalizeAll = (state: LiveTranscriptState): LiveTranscriptState =>
  state.segments.some((s) => !s.final)
    ? { segments: state.segments.map((s) => (s.final ? s : { ...s, final: true })) }
    : state;

/** Segments worth showing: rows with text (an in-progress row with no text yet is hidden). */
export const visibleSegments = (segments: LiveSegment[]): LiveSegment[] =>
  segments.filter((s) => s.text.trim().length > 0 && !s.failed);

/**
 * Segments that began within the last `windowSec` seconds. An item still being transcribed
 * always counts, whatever its start time.
 */
export const recentSegments = (segments: LiveSegment[], nowSec: number, windowSec: number): LiveSegment[] =>
  visibleSegments(segments).filter((s) => !s.final || nowSec - s.startSec <= windowSec);

/** Id of the segments that make up the "last N seconds" highlight (same rule as above). */
export const recentSegmentIds = (segments: LiveSegment[], nowSec: number, windowSec: number): Set<string> =>
  new Set(recentSegments(segments, nowSec, windowSec).map((s) => s.id));

/**
 * Text for the "Catch me up" request: everything spoken in the last `windowSec` seconds, oldest
 * first. A segment counts when it STARTED inside the window, or is still being transcribed.
 */
export const catchUpText = (segments: LiveSegment[], nowSec: number, windowSec = 120): string =>
  recentSegments(segments, nowSec, windowSec)
    .map((s) => s.text.trim())
    .join("\n");

export const formatClock = (sec: number): string => {
  const total = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/** The whole live transcript as plain text, for "Use live transcript". */
export const liveTranscriptToText = (segments: LiveSegment[], withTimestamps = false): string =>
  visibleSegments(segments)
    .map((s) => (withTimestamps ? `[${formatClock(s.startSec)}] ${s.text.trim()}` : s.text.trim()))
    .join("\n");
