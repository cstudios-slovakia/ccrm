/**
 * Pure helpers for the Meeting Room Focus panel (docs/LIVE-MEETING-DOCUMENT.md, C4):
 * the live tail grouped by speaker, and the speaker chip colours.
 */
import { speakerNumber, visibleSegments, type LiveSegment } from "./liveTranscript.ts";

export interface TailGroup {
  /** Speaker id, or undefined when the provider has no diarization. */
  speaker?: string;
  startSec: number;
  /** Text of the group's segments joined with a space, plus whether the last part is still in progress. */
  text: string;
  /** Some part of the group is not final yet (rendered lighter). */
  inProgress: boolean;
  /** Segment ids in the group, the last one is the React key. */
  ids: string[];
}

/**
 * The "Now speaking" tail: FINAL segments the document does not hold yet (`pendingIds`) plus every
 * non-final segment, in order, consecutive rows of one speaker merged into a group.
 */
export const liveTailGroups = (segments: LiveSegment[], pendingIds: Set<string>): TailGroup[] => {
  const groups: TailGroup[] = [];
  for (const s of visibleSegments(segments)) {
    if (s.final && !pendingIds.has(s.id)) continue;
    const text = s.text.trim();
    const last = groups[groups.length - 1];
    if (last && last.speaker === s.speaker) {
      last.text = `${last.text} ${text}`;
      last.inProgress = last.inProgress || !s.final;
      last.ids.push(s.id);
    } else {
      groups.push({ speaker: s.speaker, startSec: s.startSec, text, inProgress: !s.final, ids: [s.id] });
    }
  }
  return groups;
};

/** Fixed 8-colour palette (full class names so Tailwind sees them). */
export const SPEAKER_COLORS: ReadonlyArray<{ chip: string; dot: string }> = [
  { chip: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100", dot: "bg-indigo-500" },
  { chip: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100", dot: "bg-emerald-500" },
  { chip: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100", dot: "bg-amber-500" },
  { chip: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100", dot: "bg-rose-500" },
  { chip: "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100", dot: "bg-sky-500" },
  { chip: "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100", dot: "bg-violet-500" },
  { chip: "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100", dot: "bg-teal-500" },
  { chip: "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100", dot: "bg-orange-500" },
];

/** P1 -> indigo, P2 -> emerald, … P9 wraps to indigo again; an unknown id gets the first colour. */
export const speakerColor = (id: string | undefined): { chip: string; dot: string } => {
  const n = speakerNumber(id);
  return SPEAKER_COLORS[n == null ? 0 : (n - 1) % SPEAKER_COLORS.length];
};

/** A rename draft: empty or whitespace resets to the default (the entry is removed). */
export const withSpeakerName = (names: Record<string, string>, id: string, draft: string): Record<string, string> => {
  const name = draft.trim().slice(0, 40);
  const next = { ...names };
  if (name) next[id] = name;
  else delete next[id];
  return next;
};
