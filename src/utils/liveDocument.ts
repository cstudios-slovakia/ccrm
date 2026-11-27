/**
 * Pure state machine for the Meeting Room "live document" (docs/LIVE-MEETING-DOCUMENT.md, C3.3).
 *
 * The live transcript is a list of segments. The document is Markdown sections written by the
 * model from the NEW final segments only. Finished sections are frozen and never sent again in
 * full; only the last, open section travels with each request and is rewritten. This file decides
 * WHEN to ask (cadence), WHAT to send, how to MERGE the answer, and how to back off after a
 * failure. The hook (useLiveDocument) is a thin driver around it.
 *
 * No React, no DOM, no network, and no clock of its own: every function takes `now` (ms).
 */

import { formatClock } from "./liveTranscript.ts";
import type { LiveSegment } from "./liveTranscript.ts";

export interface LiveDocSection {
  /** Stable, client-generated. */
  id: string;
  /** Starts with "## Heading"; may contain [[P1]] speaker tokens. */
  markdown: string;
  /** Frozen: never rewritten again. */
  closed: boolean;
}

export type LiveDocStatus = "idle" | "waiting" | "updating" | "error";

export type LiveDocRecordingState = "idle" | "recording" | "paused" | "stopped" | "none";

export interface LiveDocTurn {
  speaker?: string;
  at: string;
  text: string;
}

export interface LiveDocRequest {
  language: "en" | "sk" | "hu";
  outline: string[];
  open_section: string;
  turns: LiveDocTurn[];
  final: boolean;
}

export interface LiveDocResponseSection {
  markdown: string;
  closed: boolean;
}

export interface LiveDocState {
  /** Closed sections first, then at most one open section. */
  sections: LiveDocSection[];
  /** Ids of segments whose text is already in the document. */
  consumedIds: Set<string>;
  /** When the last request STARTED (ms), or null before the first. */
  lastRequestAt: number | null;
  inFlight: boolean;
  /** Consecutive failures; a success resets it. */
  failures: number;
  /** No request before this time (ms). */
  nextRetryAt: number;
  /** The final call after Stop went through. */
  finalDone: boolean;
  /** Raw text of the last failure, for a tooltip. Cleared by a success. */
  errorDetail?: string;
  /** Source of section ids. */
  idCounter: number;
}

// ----- Tuning (C3.3) ----------------------------------------------------------------------

/** Words of new speech that justify an update once MIN_GAP_MS has passed. */
export const UPDATE_WORDS = 40;
/** With enough words: wait at least this long since the last request. */
export const UPDATE_AFTER_WORDS_MS = 12_000;
/** With any pending speech at all: wait this long since the last request. */
export const UPDATE_AFTER_ANY_MS = 30_000;
/** Never two requests closer than this (the final one after Stop excepted). */
export const MIN_GAP_MS = 8_000;
/** Retry delays after the 1st, 2nd and every later consecutive failure. */
export const RETRY_DELAYS_MS = [10_000, 30_000, 60_000] as const;
/** `status` is "error" from this many consecutive failures on. */
export const ERROR_AFTER_FAILURES = 3;
/** Request caps; the server enforces the same numbers (C3.1). */
export const MAX_TURNS = 80;
export const MAX_TURN_CHARS = 12_000;
export const MAX_OUTLINE = 40;
export const MAX_OUTLINE_CHARS = 120;

// ----- State ------------------------------------------------------------------------------

export const createLiveDocState = (): LiveDocState => ({
  sections: [],
  consumedIds: new Set(),
  lastRequestAt: null,
  inFlight: false,
  failures: 0,
  nextRetryAt: 0,
  finalDone: false,
  idCounter: 0,
});

/** True for a state that has never done anything (nothing to clear). */
export const isPristine = (s: LiveDocState): boolean =>
  s.sections.length === 0 &&
  s.consumedIds.size === 0 &&
  s.lastRequestAt === null &&
  !s.inFlight &&
  s.failures === 0 &&
  !s.finalDone;

/** The open section: the last one, when it is not closed. */
export const openSectionOf = (sections: LiveDocSection[]): LiveDocSection | undefined => {
  const last = sections[sections.length - 1];
  return last && !last.closed ? last : undefined;
};

/** Pending = final, not failed, with text, not yet in the document; array order. Non-final never. */
export const pendingSegments = (segments: LiveSegment[], consumedIds: Set<string>): LiveSegment[] =>
  segments.filter((s) => s.final && !s.failed && s.text.trim().length > 0 && !consumedIds.has(s.id));

/** The ids the panel shows as the live tail. */
export const pendingIdsOf = (segments: LiveSegment[], state: LiveDocState): Set<string> =>
  new Set(pendingSegments(segments, state.consumedIds).map((s) => s.id));

export const countWords = (text: string): number => {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
};

// ----- When to ask ------------------------------------------------------------------------

/** What `decideUpdate` wants: a request, final or not. */
export interface UpdateDecision {
  final: boolean;
}

/** The chunk of pending segments one request carries (the oldest; the rest stays pending). */
const takeChunk = (pending: LiveSegment[]): { taken: LiveSegment[]; all: boolean } => {
  const taken: LiveSegment[] = [];
  let chars = 0;
  for (const seg of pending) {
    const len = seg.text.trim().length;
    // One enormous turn must not block the queue forever: it goes alone (and is cut, see below).
    if (taken.length > 0 && (taken.length >= MAX_TURNS || chars + len > MAX_TURN_CHARS)) break;
    taken.push(seg);
    chars += len;
  }
  return { taken, all: taken.length === pending.length };
};

/**
 * Should a request go out now, and is it the final one?
 *
 *  - recording: 40+ pending words and 12 s since the last request, or any pending and 30 s;
 *  - paused: any pending;
 *  - stopped: any pending, or the final close of a still-open section. The call is "final" only
 *    when every pending turn fits in it, so a long backlog is drained first and closed last.
 *    Late final segments that arrive after the final call (the live stream flushes on Stop)
 *    are sent in one more final call, so they are not lost;
 *  - never within 8 s of the last request (the final one is exempt), never while one is in
 *    flight, never before `nextRetryAt`.
 */
export const decideUpdate = (
  state: LiveDocState,
  segments: LiveSegment[],
  recordingState: LiveDocRecordingState,
  now: number,
): UpdateDecision | null => {
  if (state.inFlight || now < state.nextRetryAt) return null;
  if (recordingState === "none" || recordingState === "idle") return null;

  const pending = pendingSegments(segments, state.consumedIds);
  const sinceLast = state.lastRequestAt === null ? Number.POSITIVE_INFINITY : now - state.lastRequestAt;

  if (recordingState === "stopped") {
    if (pending.length === 0) {
      // Nothing new: close the open section once, then stop.
      if (state.finalDone || !openSectionOf(state.sections)) return null;
      return { final: true };
    }
    const { all } = takeChunk(pending);
    if (all) return { final: true };
    // A backlog bigger than one request: the partial calls keep the normal minimum gap.
    return sinceLast >= MIN_GAP_MS ? { final: false } : null;
  }

  if (pending.length === 0) return null;
  if (sinceLast < MIN_GAP_MS) return null;

  if (recordingState === "paused") return { final: false };

  // recording
  const words = pending.reduce((n, s) => n + countWords(s.text), 0);
  if (words >= UPDATE_WORDS && sinceLast >= UPDATE_AFTER_WORDS_MS) return { final: false };
  if (sinceLast >= UPDATE_AFTER_ANY_MS) return { final: false };
  return null;
};

// ----- What to send -----------------------------------------------------------------------

/** First `## ` line of a section, without the marks: the outline entry. */
export const sectionHeading = (markdown: string): string => {
  for (const line of markdown.split("\n")) {
    const m = /^##\s+(.*\S)\s*$/.exec(line.trim());
    if (m) return m[1].trim();
  }
  return "";
};

export interface BuiltRequest {
  request: LiveDocRequest;
  /** Ids of the segments the request carries; they become consumed on success. */
  sentIds: string[];
}

/**
 * The request for the next call, or null when there is nothing to send. `final` is honoured only
 * when every pending turn fits in this one request.
 */
export const buildRequest = (
  state: LiveDocState,
  segments: LiveSegment[],
  language: "en" | "sk" | "hu",
  final: boolean,
): BuiltRequest | null => {
  const pending = pendingSegments(segments, state.consumedIds);
  const open = openSectionOf(state.sections);
  if (pending.length === 0 && !(final && open)) return null;

  const { taken, all } = takeChunk(pending);
  const outline = state.sections
    .filter((s) => s.closed)
    .map((s) => sectionHeading(s.markdown).slice(0, MAX_OUTLINE_CHARS))
    .filter(Boolean)
    .slice(-MAX_OUTLINE);
  const turns: LiveDocTurn[] = taken.map((seg) => {
    const turn: LiveDocTurn = { at: formatClock(seg.startSec), text: seg.text.trim().slice(0, MAX_TURN_CHARS) };
    if (seg.speaker) turn.speaker = seg.speaker;
    return turn;
  });
  return {
    request: {
      language,
      outline,
      open_section: open ? open.markdown : "",
      turns,
      final: final && all,
    },
    sentIds: taken.map((s) => s.id),
  };
};

// ----- Merging the answer -----------------------------------------------------------------

/** A request starts: one in flight, and the cadence clock runs from now. */
export const beginRequest = (state: LiveDocState, now: number): LiveDocState => ({
  ...state,
  inFlight: true,
  lastRequestAt: now,
});

/** Validate the server's JSON into sections, or null when it is not usable. */
export const parseResponseSections = (data: unknown): LiveDocResponseSection[] | null => {
  const raw = (data as { sections?: unknown } | null)?.sections;
  if (!Array.isArray(raw)) return null;
  const out: LiveDocResponseSection[] = [];
  for (const item of raw) {
    const markdown = typeof (item as { markdown?: unknown })?.markdown === "string" ? (item as { markdown: string }).markdown : "";
    if (!markdown.trim()) continue;
    out.push({ markdown: markdown.trim(), closed: (item as { closed?: unknown }).closed === true });
  }
  return out.length > 0 ? out : null;
};

/**
 * Merge an answer. The returned sections replace the open section (if any); the first one keeps
 * the open section's id so React keeps the node. The sent ids become consumed and the failure
 * count resets. Whatever the server said, only the last section may stay open, and after a final
 * call none does.
 */
export const applySuccess = (
  state: LiveDocState,
  sent: BuiltRequest,
  returned: LiveDocResponseSection[],
): LiveDocState => {
  const open = openSectionOf(state.sections);
  const kept = open ? state.sections.slice(0, -1) : state.sections.slice();
  let counter = state.idCounter;
  const lastIndex = returned.length - 1;
  const next: LiveDocSection[] = returned.map((r, i) => {
    const id = i === 0 && open ? open.id : `ld-${++counter}`;
    return { id, markdown: r.markdown, closed: sent.request.final || i < lastIndex || r.closed };
  });
  const consumedIds = new Set(state.consumedIds);
  for (const id of sent.sentIds) consumedIds.add(id);
  return {
    ...state,
    sections: [...kept, ...next],
    consumedIds,
    inFlight: false,
    failures: 0,
    nextRetryAt: 0,
    finalDone: state.finalDone || sent.request.final,
    errorDetail: undefined,
    idCounter: counter,
  };
};

/** Milliseconds to wait after the `failures`-th consecutive failure: 10 s, 30 s, then every 60 s. */
export const retryDelayMs = (failures: number): number =>
  RETRY_DELAYS_MS[Math.min(Math.max(failures, 1), RETRY_DELAYS_MS.length) - 1];

/** The request failed: the sent turns stay pending, and the next try waits (10 s, 30 s, 60 s...). */
export const applyFailure = (state: LiveDocState, now: number, detail?: string): LiveDocState => {
  const failures = state.failures + 1;
  return {
    ...state,
    inFlight: false,
    failures,
    nextRetryAt: now + retryDelayMs(failures),
    errorDetail: detail ? detail : state.errorDetail,
  };
};

/** What the panel shows: error (3+ failures in a row) > updating > waiting (speech queued) > idle. */
export const deriveStatus = (state: LiveDocState, segments: LiveSegment[]): LiveDocStatus => {
  if (state.failures >= ERROR_AFTER_FAILURES) return "error";
  if (state.inFlight) return "updating";
  return pendingSegments(segments, state.consumedIds).length > 0 ? "waiting" : "idle";
};

/**
 * The document starts over when the recording is gone ("none"), or when the segments are emptied
 * after having had content (a new recording starts a new transcript).
 */
export const shouldResetDocument = (
  previousSegmentCount: number,
  segmentCount: number,
  recordingState: LiveDocRecordingState,
): boolean => recordingState === "none" || (previousSegmentCount > 0 && segmentCount === 0);

// ----- Speaker tokens (C1.4) --------------------------------------------------------------

export type MdPiece = { kind: "text"; text: string } | { kind: "speaker"; id: string };

/**
 * Split a line of the document's Markdown at its `[[P<n>]]` tokens (n = 1 to 99). One space after
 * a token belongs to it and is dropped. Empty text pieces are omitted; a line without tokens is
 * one text piece; an empty line is no pieces.
 */
export const splitSpeakerTokens = (markdownLine: string): MdPiece[] => {
  const pieces: MdPiece[] = [];
  const re = /\[\[(P[1-9]\d?)\]\] ?/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdownLine)) !== null) {
    if (m.index > last) pieces.push({ kind: "text", text: markdownLine.slice(last, m.index) });
    pieces.push({ kind: "speaker", id: m[1] });
    last = m.index + m[0].length;
  }
  if (last < markdownLine.length) pieces.push({ kind: "text", text: markdownLine.slice(last) });
  return pieces;
};
