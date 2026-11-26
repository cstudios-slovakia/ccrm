/*
  ── PIPELINE STRIP: OVERFLOW MODE ───────────────────────
  Some companies configure fifteen or more pipeline steps. Drawn one chevron
  each, the labels shrink to "CEN…" and the strip stops saying anything. Past a
  limit the strip folds around the step the record is on:

    [✓ 6] [CURRENT STEP] [NEXT STEP] [+3] [OUTCOME]

  The reached steps before the current one become one "✓ N" segment, the
  upcoming ones after the next step one "+N" segment; their tooltips list what
  they hide. The last segment (the outcome) always stays.
*/

export interface PipelineStripSegment {
  key: string;
  title: string;
  tooltip: string;
  /** Reached — lit in its colour with white text. */
  filled: boolean;
  /** Tailwind background class for the segment. */
  colorClass: string;
  /** A hex background instead, for colours configured in settings. */
  color?: string;
  /** The step the record is on now. Without one, the last reached step counts. */
  current?: boolean;
}

/** More segments than this always fold, whatever the width. */
export const PIPELINE_MAX_SEGMENTS = 7;

/** The step the record is on: the flagged one, else the last reached one, else -1. */
export const pipelineCurrentIndex = (segments: readonly PipelineStripSegment[]): number => {
  const flagged = segments.findIndex((s) => s.current);
  if (flagged !== -1) return flagged;
  for (let i = segments.length - 1; i >= 0; i--) if (segments[i].filled) return i;
  return -1;
};

const summarise = (group: PipelineStripSegment[], title: string, paintFrom: PipelineStripSegment): PipelineStripSegment => ({
  ...paintFrom,
  key: `collapsed:${group[0].key}:${group[group.length - 1].key}`,
  title,
  tooltip: group.map((s) => s.title).join(" → "),
  current: false,
});

/**
 * Folds `segments` around the current step when there are more than `max`.
 * Returns the very same array when nothing folds, so callers can compare by
 * reference. Pass `max = 0` to fold whenever folding shortens the strip.
 */
export const collapsePipeline = (
  segments: PipelineStripSegment[],
  max: number = PIPELINE_MAX_SEGMENTS,
): PipelineStripSegment[] => {
  const n = segments.length;
  if (n <= max || n < 4) return segments;

  const last = n - 1;
  const current = pipelineCurrentIndex(segments);

  let before: PipelineStripSegment[];
  let window: PipelineStripSegment[];
  let after: PipelineStripSegment[];
  if (current === last) {
    // On the outcome (a closed lead): everything before it is history.
    before = segments.slice(0, last);
    window = [];
    after = [];
  } else {
    const start = Math.max(current, 0);
    const end = Math.min(start + 1, last - 1);
    before = segments.slice(0, start);
    window = segments.slice(start, end + 1);
    after = segments.slice(end + 1, last);
  }

  // A group of one stays itself: "✓ 1" says less than the step's own name.
  const beforeOut = before.length >= 2 ? [summarise(before, `✓ ${before.length}`, before[before.length - 1])] : before;
  const afterOut = after.length >= 2 ? [summarise(after, `+${after.length}`, after[0])] : after;
  const out = [...beforeOut, ...window, ...afterOut, segments[last]];
  return out.length < n ? out : segments;
};
