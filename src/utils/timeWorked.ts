/**
 * Time tracking v2: worked time on the client (docs/TIME-TRACKING-V2.md, D1, D9) — pure.
 *
 * Project time (`durationSec`) is what a project received; worked time (`workedMs`) is the
 * entry's share of the person's real clock time. Anything about a person sums worked time,
 * anything about a project sums project time, cost always comes from worked time.
 *
 * A closed entry's `workedMs` is settled by the server; this file never recomputes it. Only a
 * running entry gets a live share here, allocated with the same engine as the server
 * (`allocateWorkedMs`) with the running end at `nowMs`. An entry without `workedMs` (an old
 * server, a cached response) falls back to its project time, which is what the C16 migration
 * stores for every pre-v2 entry anyway.
 */

import { allocateWorkedMs, type AllocationEntry } from "./timeAllocation.ts";
import { entrySeconds, totalSeconds, type TimeEntry } from "./timeTracking.ts";

type WorkedEntry = Pick<TimeEntry, "id" | "userId" | "durationSec" | "running" | "startAt" | "workedMs">;

/** The entry's interval in ms, or null for an hours-only entry (no start) or a bad timestamp. */
const intervalOf = (e: WorkedEntry, nowMs: number): AllocationEntry | null => {
  if (!e.startAt) return null;
  const startMs = Date.parse(e.startAt);
  if (!Number.isFinite(startMs)) return null;
  const endMs = e.running ? nowMs : startMs + (e.durationSec ?? 0) * 1000;
  return { id: e.id, startMs, endMs };
};

/**
 * Worked seconds of one entry.
 * - hours-only (no `startAt`): its duration (C15);
 * - running: its live share from `liveShares` (id -> ms, whole seconds as the timer shows them),
 *   else its elapsed time;
 * - closed: `workedMs / 1000`, else its project time when `workedMs` is missing.
 */
export const entryWorkedSeconds = (e: WorkedEntry, nowMs: number, liveShares?: ReadonlyMap<string, number>): number => {
  if (e.running) {
    const share = liveShares?.get(e.id);
    return typeof share === "number" ? Math.floor(share / 1000) : entrySeconds(e, nowMs);
  }
  if (!e.startAt) return e.durationSec ?? 0;
  return typeof e.workedMs === "number" ? e.workedMs / 1000 : entrySeconds(e, nowMs);
};

/**
 * Live worked ms of every RUNNING timed entry, keyed by id. Entries are grouped by `userId`; for
 * each user the engine runs over the running entries plus the timed entries that overlap one of
 * them (only those can share a stretch with a running entry). Closed entries are not in the
 * result: they keep the `workedMs` the server settled.
 */
export const liveWorkedShares = (entries: readonly WorkedEntry[], nowMs: number): Map<string, number> => {
  const out = new Map<string, number>();
  const byUser = new Map<string, AllocationEntry[]>();
  const runningByUser = new Map<string, AllocationEntry[]>();
  for (const e of entries) {
    const iv = intervalOf(e, nowMs);
    if (!iv) continue;
    const bucket = e.running ? runningByUser : byUser;
    const list = bucket.get(e.userId);
    if (list) list.push(iv);
    else bucket.set(e.userId, [iv]);
  }
  for (const [userId, running] of runningByUser) {
    const overlapping = (byUser.get(userId) ?? []).filter((c) =>
      running.some((r) => c.startMs < r.endMs && r.startMs < c.endMs),
    );
    const shares = allocateWorkedMs([...running, ...overlapping]);
    for (const r of running) out.set(r.id, shares.get(r.id) ?? 0);
  }
  return out;
};

/** Σ worked seconds, with the live shares of running entries computed per user. Rounded to the ms. */
export const totalWorkedSeconds = (entries: readonly WorkedEntry[], nowMs: number): number => {
  const shares = entries.some((e) => e.running) ? liveWorkedShares(entries, nowMs) : undefined;
  const sum = entries.reduce((acc, e) => acc + entryWorkedSeconds(e, nowMs, shares), 0);
  return Math.round(sum * 1000) / 1000;
};

/** Project time ÷ worked time (1 = no parallel work); null when nothing was worked. */
export const leverage = (entries: readonly TimeEntry[], nowMs: number): number | null => {
  const worked = totalWorkedSeconds(entries, nowMs);
  return worked > 0 ? totalSeconds(entries, nowMs) / worked : null;
};

/** Show "Worked · Delivered" (true) or one number (false): the two differ by at least a second. */
export const showsWorkedAndDelivered = (projectSec: number, workedSec: number): boolean =>
  Math.abs(projectSec - workedSec) >= 1;
