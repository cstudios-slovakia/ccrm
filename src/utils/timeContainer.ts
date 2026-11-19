/**
 * Time tracking v2: the multi-timer container's pure helpers (docs/TIME-TRACKING-V2.md, D5.4).
 */

import { elapsedSeconds, formatDuration, type TimeEntry } from "./timeTracking.ts";

type RunningLike = Pick<TimeEntry, "startAt">;

/**
 * The worked clock of the current stretch: the union of the running intervals. Every running
 * interval ends "now", so the union is simply now minus the earliest start.
 */
export const workedClockSeconds = (running: readonly RunningLike[], nowMs: number): number => {
  let earliest = Infinity;
  for (const e of running) {
    const ms = e.startAt ? Date.parse(e.startAt) : NaN;
    if (Number.isFinite(ms) && ms < earliest) earliest = ms;
  }
  return Number.isFinite(earliest) ? elapsedSeconds(new Date(earliest).toISOString(), nowMs) : 0;
};

/** Delivered: Σ elapsed of the running items (project time, so parallel items add up). */
export const deliveredSeconds = (running: readonly RunningLike[], nowMs: number): number =>
  running.reduce((sum, e) => sum + (e.startAt ? elapsedSeconds(e.startAt, nowMs) : 0), 0);

/** The "+2" of the header pill: the items beyond the first. */
export const extraItemsLabel = (count: number): string => (count > 1 ? `+${count - 1}` : "");

const TITLE_PREFIX = /^▶ \d+:\d{2}(?::\d{2})? · (?:∥\d+ · )?/;

/** Removes our own prefix from a document title, so the page's own title is left. */
export const stripTimerTitle = (title: string): string => title.replace(TITLE_PREFIX, "");

/**
 * `▶ 0:42 · ∥3 · <title>` with several items, `▶ 1:12:05 · <title>` with one. `workedSec` is
 * the worked clock (several) or the item's elapsed time (one); `∥N` appears only for N >= 2.
 */
export const timerTabTitle = (base: string, count: number, workedSec: number): string => {
  if (count <= 0) return base;
  const clock = formatDuration(workedSec, true);
  return count >= 2 ? `▶ ${clock} · ∥${count} · ${base}` : `▶ ${clock} · ${base}`;
};
