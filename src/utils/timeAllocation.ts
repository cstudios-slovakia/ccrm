/**
 * Time tracking v2: the allocation engine (docs/TIME-TRACKING-V2.md, D2) — pure.
 *
 * Splits ONE person's real clock time between their overlapping timed entries, so that
 * the sum of everybody's worked time equals the length of the union of the intervals.
 *
 * TWIN of public/api/time_allocation.php (`ccrm_ta_allocate`). Same algorithm, same tie
 * breaking, same fixtures (scripts/fixtures/time-allocation-cases.json, run by
 * `npm run test:unit` and `npm run test:time-allocation`). Change both files in the same commit.
 *
 * Algorithm:
 *   1. Every start and end, sorted, duplicates dropped. Two neighbours bound one stretch.
 *   2. A stretch of `len` ms with n >= 1 active entries gives each floor(len / n); the
 *      remainder len mod n goes 1 ms each to the first active entries ordered by startMs
 *      ascending, then id ascending (plain code-unit comparison, `strcmp` in PHP; keep ids ASCII).
 *   3. worked_ms(entry) = the sum of its shares.
 *
 * Integer milliseconds throughout. No Date, no clock: a running entry is passed with the end of
 * the window being settled (server) or "now" (live display). Hours-only and deleted entries are
 * not passed (use workedMsForHoursOnly for the former). Ids are expected to be unique.
 */

export interface AllocationEntry {
  id: string;
  startMs: number;
  endMs: number;
}

const byStartThenId = (a: AllocationEntry, b: AllocationEntry): number =>
  a.startMs !== b.startMs ? a.startMs - b.startMs : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * Worked ms of every entry, keyed by id. Every input id is present in the result; an entry
 * with endMs <= startMs gets 0 and does not bound any stretch. The result does not depend on
 * the order of the input. O(n log n + stretches × active).
 */
export function allocateWorkedMs(entries: readonly AllocationEntry[]): Map<string, number> {
  const worked = new Map<string, number>();
  const timed: AllocationEntry[] = [];
  for (const e of entries) {
    worked.set(e.id, 0);
    if (e.endMs > e.startMs) timed.push(e);
  }
  if (timed.length === 0) return worked;

  timed.sort(byStartThenId);
  const points = new Set<number>();
  for (const e of timed) { points.add(e.startMs); points.add(e.endMs); }
  const bounds = [...points].sort((a, b) => a - b);

  // `active` stays ordered by (startMs, id): entries are appended in that order and an entry
  // already active always started earlier than one being added.
  let active: AllocationEntry[] = [];
  let next = 0;
  for (let i = 0; i + 1 < bounds.length; i++) {
    const from = bounds[i];
    const to = bounds[i + 1];
    if (active.length > 0) active = active.filter((e) => e.endMs > from);
    while (next < timed.length && timed[next].startMs === from) active.push(timed[next++]);
    const n = active.length;
    if (n === 0) continue;
    const len = to - from;
    const share = Math.floor(len / n);
    const extra = len % n;
    for (let k = 0; k < n; k++) {
      const id = active[k].id;
      worked.set(id, (worked.get(id) ?? 0) + share + (k < extra ? 1 : 0));
    }
  }
  return worked;
}

/** Hours-only entries have no interval: their worked time is their duration (C15). */
export function workedMsForHoursOnly(durationSec: number): number {
  return Math.round(durationSec * 1000);
}

/** Length of the union of the intervals in ms (invariant I1); handy for callers and tests. */
export function unionLengthMs(entries: readonly AllocationEntry[]): number {
  const timed = entries.filter((e) => e.endMs > e.startMs).sort((a, b) => a.startMs - b.startMs);
  let total = 0;
  let curStart = 0;
  let curEnd = -Infinity;
  for (const e of timed) {
    if (e.startMs > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = e.startMs;
      curEnd = e.endMs;
    } else if (e.endMs > curEnd) {
      curEnd = e.endMs;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}
