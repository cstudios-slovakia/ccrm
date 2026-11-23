/**
 * Time entries as the overview reads them: one worked-time rule and the date range to fetch.
 *
 * Worked time is `workedMs` (the entry's share of the person's real clock time, settled by the
 * server with overlaps counted once; `src/utils/timeWorked.ts` owns the rule). Project time
 * (`durationSec`) is what gets billed and is never summed here. A running entry has no settled
 * share yet and counts for nothing.
 */

import type { TimeEntry } from "../timeTracking.ts";
import { entryWorkedSeconds } from "../timeWorked.ts";
import type { PerformancePeriod } from "../../components/dashboard/performance/types.ts";
import { addDays, startOfDay, toIsoDay } from "./period.ts";

/** Days of "recent" labour and expenses that keep an inactive project in Ziskovosť projektov. */
export const RECENT_DAYS = 30;

/** Worked milliseconds of one entry; 0 while it runs. */
export const entryWorkedMs = (entry: Pick<TimeEntry, "id" | "userId" | "durationSec" | "running" | "startAt" | "workedMs">): number => {
  if (entry.running) return 0;
  if (typeof entry.workedMs === "number") return Math.max(0, entry.workedMs);
  // An old server that sends no `workedMs`: the shared fallback (project time), as everywhere else.
  return Math.max(0, entryWorkedSeconds(entry, 0) * 1000);
};

/** Is the entry's company-timezone day inside the period? "All" has no bounds. */
export const entryInPeriod = (entry: Pick<TimeEntry, "entryDate">, period: PerformancePeriod): boolean => {
  const day = (entry.entryDate ?? "").slice(0, 10);
  if (!day) return false;
  if (period.start && day < toIsoDay(period.start)) return false;
  if (period.end && day > toIsoDay(period.end)) return false;
  return true;
};

/**
 * The one range to fetch for both needs of the overview: the period (utilisation) and the last
 * `RECENT_DAYS` days up to today (recent labour of inactive projects). "All" starts at the epoch.
 */
export const overviewEntryRange = (period: PerformancePeriod, today: Date): { from: string; to: string } => {
  const recentFrom = toIsoDay(addDays(startOfDay(today), -RECENT_DAYS));
  const todayIso = toIsoDay(today);
  const from = period.start ? toIsoDay(period.start) : "2000-01-01";
  const to = period.end ? toIsoDay(period.end) : todayIso;
  return { from: from < recentFrom ? from : recentFrom, to: to > todayIso ? to : todayIso };
};
