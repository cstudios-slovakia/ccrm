/**
 * The presence cycle as the extension sees it (TT2 D7, phase 10). The server owns the cycle and
 * stays the judge; the extension only mirrors its last answer and, while the system is idle or
 * locked, shows "paused" itself once the deadline has passed instead of waiting for a poll.
 */

export type PresencePhase = "idle" | "tracking" | "question" | "paused";
export type IdleState = "active" | "idle" | "locked";

export interface PresenceState {
  enabled?: boolean;
  phase: PresencePhase;
  anchorAt?: string | null;
  promptAt?: string | null;
  deadlineAt?: string | null;
  autoPausedAt?: string | null;
  resumeUntil?: string | null;
}

/** The last server answer kept in storage: the state, server-minus-local clock offset, how many run and are paused. */
export interface PresenceSnapshot {
  presence: PresenceState | null;
  offsetMs: number;
  count: number;
  pausedCount: number;
  firstStartAt: string | null;
  savedAt: number;
}

export function serverOffset(serverNow: unknown, localNow = Date.now()): number {
  const at = typeof serverNow === "string" ? Date.parse(serverNow) : Number.NaN;
  return Number.isFinite(at) ? at - localNow : 0;
}

export function snapshotFrom(res: any, localNow = Date.now()): PresenceSnapshot {
  return {
    presence: res?.presence && typeof res.presence.phase === "string" ? res.presence : null,
    offsetMs: serverOffset(res?.serverNow, localNow),
    count: Number(res?.count) || 0,
    pausedCount: Array.isArray(res?.paused) ? res.paused.length : 0,
    firstStartAt: res?.entry?.running ? String(res.entry.startAt || "") || null : null,
    savedAt: localNow,
  };
}

/**
 * The phase to show now. From the clock alone: tracking turns into question at promptAt. Past the
 * deadline the item is shown paused only while the system is idle or locked (nobody could have
 * answered); when active the next server read decides.
 */
export function localPhase(snapshot: PresenceSnapshot | null, idle: IdleState, localNow = Date.now()): PresencePhase {
  const p = snapshot?.presence;
  if (!p) return "idle";
  if (p.phase !== "tracking" && p.phase !== "question") return p.phase;
  const now = localNow + (snapshot?.offsetMs || 0);
  const deadline = p.deadlineAt ? Date.parse(p.deadlineAt) : Number.NaN;
  if (p.enabled !== false && idle !== "active" && Number.isFinite(deadline) && now >= deadline) return "paused";
  const prompt = p.promptAt ? Date.parse(p.promptAt) : Number.NaN;
  if (p.enabled !== false && Number.isFinite(prompt) && now >= prompt) return "question";
  return p.phase;
}

/** The badge for a phase: question "?" amber, paused "II" amber, otherwise the count or the elapsed time. */
export function badgeFor(snapshot: PresenceSnapshot | null, phase: PresencePhase, elapsedLabel: (startedAt: string) => string): { text: string; color: string } {
  const amber = "#f59e0b";
  const rose = "#e11d48";
  if (phase === "question") return { text: "?", color: amber };
  if (phase === "paused") return { text: "II", color: amber };
  const count = snapshot?.count || 0;
  if (count > 1) return { text: `${count}x`, color: rose };
  if (count === 1 && snapshot?.firstStartAt) return { text: elapsedLabel(snapshot.firstStartAt), color: rose };
  // A manual pause with nothing running.
  if ((snapshot?.pausedCount || 0) > 0) return { text: "II", color: amber };
  return { text: "", color: rose };
}

/** Pulsing alert badge/icon state cycled at 550ms during the 50-minute check-in window. */
export function alertFrameBadge(frame: number, remainingMs: number | null = null): {
  text: string;
  color: string;
  iconPrefix: string;
} {
  const f = Math.abs(Math.trunc(frame)) % 4;
  const amber = "#f59e0b";
  const rose = "#e11d48";
  const minsLeft = remainingMs !== null && Number.isFinite(remainingMs) && remainingMs > 0
    ? Math.max(1, Math.ceil(remainingMs / 60_000))
    : null;
  if (f === 0 || f === 1) {
    return { text: "?", color: f === 0 ? amber : rose, iconPrefix: `alert-${f}` };
  }
  return {
    text: minsLeft !== null && f === 3 ? `${minsLeft}m` : "!",
    color: f === 2 ? rose : amber,
    iconPrefix: `alert-${f}`,
  };
}

export function iconSetFor(prefix: string): Record<string, string> {
  return {
    "16": `icons/${prefix}-16.png`,
    "32": `icons/${prefix}-32.png`,
    "48": `icons/${prefix}-48.png`,
    "128": `icons/${prefix}-128.png`,
  };
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function timeOfDay(iso: string | null | undefined): string {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(at)) return "";
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
