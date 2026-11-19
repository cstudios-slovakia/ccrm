import type { TimePresencePhase } from "./timeTrackingApi.ts";
import { timerTabTitle } from "./timeContainer.ts";

/** TT2 D8: pure helpers of the presence UI (ring geometry, countdown text, tab title). */

/** The ring is drawn on a path of length 100: the filled part, and for the question the last sixth. */
export interface RingArcs {
  /** Rose arc length (0..100). */
  filled: number;
  /** Start and length of the amber pulsing arc, or null outside the question. */
  alert: { start: number; length: number } | null;
}

export function ringArcs(phase: TimePresencePhase, fraction: number): RingArcs {
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  if (phase === "question") return { filled: 100 * (5 / 6), alert: { start: 100 * (5 / 6), length: 100 / 6 } };
  if (phase === "tracking") return { filled: Math.round(f * 1000) / 10, alert: null };
  return { filled: 0, alert: null };
}

/** `m:ss` countdown, never negative. */
export function formatCountdown(seconds: number | null): string {
  const s = Math.max(0, Math.floor(seconds ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Whole minutes left, rounded up, for the ring's accessible label. */
export const minutesLeft = (seconds: number | null): number => Math.max(1, Math.ceil((seconds ?? 0) / 60));

/** `HH:MM` local time of an ISO instant; empty when unknown. */
export function clockTime(iso: string | null): string {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return "";
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

export interface TabTitleInput {
  base: string;
  phase: TimePresencePhase;
  runningCount: number;
  workedSec: number;
  secondsToPause: number | null;
  questionLabel: string;
  pausedLabel: string;
}

/**
 * The tab title by phase: question `⏰ 9:12 · Still working? · <base>`, paused (nothing running)
 * `⏸ Paused · <base>`, otherwise the timer format of `timerTabTitle`.
 */
export function presenceTabTitle(i: TabTitleInput): string {
  if (i.runningCount > 0 && i.phase === "question") return `⏰ ${formatCountdown(i.secondsToPause)} · ${i.questionLabel} · ${i.base}`;
  if (i.runningCount === 0 && i.phase === "paused") return `⏸ ${i.pausedLabel} · ${i.base}`;
  return timerTabTitle(i.base, i.runningCount, i.workedSec);
}
