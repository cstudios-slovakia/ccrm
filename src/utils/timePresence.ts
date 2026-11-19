import type { TimePresence, TimePresencePhase } from "./timeTrackingApi.ts";

/**
 * TT2 D8.1: where the presence cycle stands at `nowMs`, derived locally from the server's
 * timestamps so the UI changes phase on time between polls. `nowMs` is the provider's clock,
 * already corrected by `serverNow` (D11: a wrong device clock never moves a countdown).
 */

const ms = (iso: string | null): number => (iso ? Date.parse(iso) : NaN);
const secondsUntil = (iso: string | null, nowMs: number): number | null => {
  const at = ms(iso);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - nowMs) / 1000)) : null;
};

/** True while a cycle runs (the server reports tracking or question with an anchor). */
const cycleRuns = (p: TimePresence): boolean => (p.phase === "tracking" || p.phase === "question") && Number.isFinite(ms(p.anchorAt));

/**
 * The phase at `nowMs`. Tracking turns into question at `promptAt` and into paused at
 * `deadlineAt` without waiting for the server (see `isPausing`). With presence checks off a
 * running cycle stays in tracking. A paused state whose resume window ran out is idle.
 */
export function presencePhase(presence: TimePresence | null, nowMs: number): TimePresencePhase {
  if (!presence) return "idle";
  if (presence.phase === "paused") {
    const until = ms(presence.resumeUntil);
    return Number.isFinite(until) && nowMs >= until ? "idle" : "paused";
  }
  if (!cycleRuns(presence)) return presence.phase === "idle" ? "idle" : "tracking";
  if (!presence.enabled) return "tracking";
  const prompt = ms(presence.promptAt);
  const deadline = ms(presence.deadlineAt);
  if (Number.isFinite(deadline) && nowMs >= deadline) return "paused";
  if (Number.isFinite(prompt) && nowMs >= prompt) return "question";
  return "tracking";
}

/** Locally past the deadline while the server still reports the cycle running: show "pausing…" and re-read. */
export function isPausing(presence: TimePresence | null, nowMs: number): boolean {
  return !!presence && cycleRuns(presence) && presencePhase(presence, nowMs) === "paused";
}

/** How full the cycle ring is: (now − anchor) ÷ (promptAfter + confirmWindow), 0..1; 0 when no cycle runs or checks are off. */
export function ringFraction(presence: TimePresence | null, nowMs: number): number {
  if (!presence || !presence.enabled || !cycleRuns(presence)) return 0;
  const anchor = ms(presence.anchorAt);
  const span = ms(presence.deadlineAt) - anchor;
  if (!Number.isFinite(span) || span <= 0) return 0;
  return Math.min(1, Math.max(0, (nowMs - anchor) / span));
}

/** Seconds until the question is asked (`promptAt`); null when no checked cycle runs. */
export function secondsToPrompt(presence: TimePresence | null, nowMs: number): number | null {
  if (!presence || !presence.enabled || !cycleRuns(presence)) return null;
  return secondsUntil(presence.promptAt, nowMs);
}

/** Seconds until the automatic pause (`deadlineAt`); null when no checked cycle runs. 0 while "pausing…". */
export function secondsToPause(presence: TimePresence | null, nowMs: number): number | null {
  if (!presence || !presence.enabled || !cycleRuns(presence)) return null;
  return secondsUntil(presence.deadlineAt, nowMs);
}

/** Seconds until the automatic pause can no longer be resumed (`resumeUntil`); null unless paused. */
export function secondsToExpiry(presence: TimePresence | null, nowMs: number): number | null {
  if (!presence || presence.phase !== "paused") return null;
  return secondsUntil(presence.resumeUntil, nowMs);
}

/** The next instant the server must be asked again: the deadline of a running cycle, or the end of the resume window. */
export function nextPresenceBoundary(presence: TimePresence | null): number | null {
  if (!presence) return null;
  const at = presence.phase === "paused" ? ms(presence.resumeUntil) : presence.enabled && cycleRuns(presence) ? ms(presence.deadlineAt) : NaN;
  return Number.isFinite(at) ? at : null;
}

/** Everything a presence UI reads, computed once per tick by the provider. */
export interface PresenceView {
  phase: TimePresencePhase;
  /** Past the deadline locally; the server has not confirmed the pause yet. */
  pausing: boolean;
  ringFraction: number;
  secondsToPrompt: number | null;
  secondsToPause: number | null;
  secondsToExpiry: number | null;
}

export const IDLE_PRESENCE_VIEW: PresenceView = {
  phase: "idle",
  pausing: false,
  ringFraction: 0,
  secondsToPrompt: null,
  secondsToPause: null,
  secondsToExpiry: null,
};

export function presenceView(presence: TimePresence | null, nowMs: number): PresenceView {
  if (!presence) return IDLE_PRESENCE_VIEW;
  return {
    phase: presencePhase(presence, nowMs),
    pausing: isPausing(presence, nowMs),
    ringFraction: ringFraction(presence, nowMs),
    secondsToPrompt: secondsToPrompt(presence, nowMs),
    secondsToPause: secondsToPause(presence, nowMs),
    secondsToExpiry: secondsToExpiry(presence, nowMs),
  };
}
