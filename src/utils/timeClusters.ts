/**
 * Time tracking v2: parallel clusters (docs/TIME-TRACKING-V2.md, D5.5) — pure, derived, never stored.
 *
 * A cluster is a group of at least two timed entries of ONE person connected by overlap. The
 * connection is transitive (A overlaps B, B overlaps C: one cluster even if A and C do not touch)
 * and intervals that only touch (end == start) do not connect. An overlap made by a manual edit or
 * an import is a cluster like any other.
 */

import { totalSeconds, type TimeEntry } from "./timeTracking.ts";
import { entryWorkedSeconds, liveWorkedShares } from "./timeWorked.ts";

type ClusterEntry = Pick<TimeEntry, "id" | "userId" | "durationSec" | "running" | "startAt" | "endAt" | "workedMs">;

export interface TimeCluster {
  userId: string;
  /** Member ids, earliest start first. */
  ids: string[];
  startMs: number;
  endMs: number;
  /** Σ worked seconds of the members (a running member counts its live share). */
  workedSec: number;
  /** Σ project (delivered) seconds of the members. */
  deliveredSec: number;
  count: number;
}

interface Interval {
  e: ClusterEntry;
  startMs: number;
  endMs: number;
}

const intervalOf = (e: ClusterEntry, nowMs: number): Interval | null => {
  if (!e.startAt) return null;
  const startMs = Date.parse(e.startAt);
  if (!Number.isFinite(startMs)) return null;
  const end = e.running ? nowMs : e.endAt ? Date.parse(e.endAt) : startMs + (e.durationSec ?? 0) * 1000;
  return Number.isFinite(end) && end > startMs ? { e, startMs, endMs: end } : null;
};

/** The clusters (two or more connected timed entries) of every person in `entries`. */
export const clusterEntries = (entries: readonly ClusterEntry[], nowMs: number): TimeCluster[] => {
  const shares = entries.some((e) => e.running) ? liveWorkedShares(entries, nowMs) : undefined;
  const byUser = new Map<string, Interval[]>();
  for (const e of entries) {
    const iv = intervalOf(e, nowMs);
    if (!iv) continue;
    const list = byUser.get(e.userId);
    if (list) list.push(iv);
    else byUser.set(e.userId, [iv]);
  }
  const out: TimeCluster[] = [];
  for (const [userId, list] of byUser) {
    list.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.e.id.localeCompare(b.e.id));
    let group: Interval[] = [];
    let groupEnd = -Infinity;
    const flush = () => {
      if (group.length >= 2) {
        const members = group.map((g) => g.e);
        out.push({
          userId,
          ids: members.map((m) => m.id),
          startMs: group[0].startMs,
          endMs: groupEnd,
          workedSec: Math.round(members.reduce((s, m) => s + entryWorkedSeconds(m, nowMs, shares), 0) * 1000) / 1000,
          deliveredSec: totalSeconds(members as TimeEntry[], nowMs),
          count: members.length,
        });
      }
      group = [];
    };
    for (const iv of list) {
      if (group.length && iv.startMs >= groupEnd) flush();
      group.push(iv);
      groupEnd = group.length === 1 ? iv.endMs : Math.max(groupEnd, iv.endMs);
    }
    flush();
  }
  return out;
};

export interface ClusterSegment<T> {
  cluster: TimeCluster | null;
  items: T[];
}

/**
 * Splits `rows` (in display order) into runs: consecutive rows whose entries belong to the same
 * cluster form one segment, every other row is its own segment with `cluster: null`. A collapsed
 * row of identical entries (`idsOf` returns all its members) joins a cluster when ANY member does.
 */
export const segmentByCluster = <T>(rows: readonly T[], clusters: readonly TimeCluster[], idsOf: (row: T) => string[]): ClusterSegment<T>[] => {
  const byId = new Map<string, TimeCluster>();
  for (const c of clusters) for (const id of c.ids) byId.set(id, c);
  const out: ClusterSegment<T>[] = [];
  for (const row of rows) {
    const cluster = idsOf(row).map((id) => byId.get(id)).find(Boolean) ?? null;
    const last = out[out.length - 1];
    if (cluster && last && last.cluster === cluster) last.items.push(row);
    else out.push({ cluster, items: [row] });
  }
  return out;
};
