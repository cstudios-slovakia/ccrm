/**
 * Figures for the project's Time tab: the period, the hours per week by person, the by-task bars and
 * the hours-budget share. Pure maths over the entries the tab already holds; money, billable value and
 * margin come from `buildReport` (timeReports.ts), so they follow the same gating and comparable-lines rule.
 */

import { addDays } from "./holidays.ts";
import { periodRange, type ReportLine } from "./timeReports.ts";
import { weekStart } from "./timeTracking.ts";

export type ProjectPeriod = "all" | "thisMonth" | "lastMonth" | "custom";

/** The date range of a period. "custom" falls back to all time until both dates are valid. */
export const projectPeriodRange = (period: ProjectPeriod, today: string, customFrom: string, customTo: string): { from: string; to: string } => {
  const all = { from: "2000-01-01", to: "2100-01-01" };
  if (period === "all") return all;
  if (period === "custom") return customFrom && customTo && customFrom <= customTo ? { from: customFrom, to: customTo } : all;
  return periodRange(period, today) ?? all;
};

export interface WeekBucket {
  /** Monday, YYYY-MM-DD. */
  start: string;
  /** Seconds per person. */
  byUser: Record<string, number>;
}

/**
 * Up to `maxWeeks` Monday-based weeks ending with the week of the period's end (or of today when the
 * period reaches past it), never before the period's first week. Lines outside those weeks are left out.
 */
export const weeklyByPerson = (
  lines: readonly Pick<ReportLine, "userId" | "entryDate" | "seconds">[],
  range: { from: string; to: string },
  today: string,
  maxWeeks = 10,
): { weeks: WeekBucket[]; people: { userId: string; seconds: number }[] } => {
  const last = weekStart(range.to < today ? range.to : today);
  const first = weekStart(range.from);
  let start = addDays(last, -7 * (maxWeeks - 1));
  if (first > start) start = first;
  const weeks: WeekBucket[] = [];
  for (let d = start; d <= last; d = addDays(d, 7)) weeks.push({ start: d, byUser: {} });
  const index = new Map(weeks.map((w, i) => [w.start, i]));
  const totals = new Map<string, number>();
  for (const l of lines) {
    const i = index.get(weekStart(l.entryDate));
    if (i === undefined || l.seconds <= 0) continue;
    weeks[i].byUser[l.userId] = (weeks[i].byUser[l.userId] ?? 0) + l.seconds;
    totals.set(l.userId, (totals.get(l.userId) ?? 0) + l.seconds);
  }
  const people = [...totals.entries()].map(([userId, seconds]) => ({ userId, seconds })).sort((a, b) => b.seconds - a.seconds || a.userId.localeCompare(b.userId));
  return { weeks, people };
};

export interface TaskTimeRow {
  /** Task id, or "" for time that is not on a task. */
  taskId: string;
  title: string;
  seconds: number;
  /** Estimate in seconds; null when the task has none. */
  estimateSec: number | null;
}

/** Tracked seconds per task, most time first. `taskOf` returns the task's title and estimate in minutes. */
export const timeByTask = (
  entries: readonly { taskId: string | null; title: string; seconds: number }[],
  taskOf: (taskId: string) => { title: string; estimateMinutes?: number | null } | undefined,
  limit = 8,
): TaskTimeRow[] => {
  const rows = new Map<string, TaskTimeRow>();
  for (const e of entries) {
    if (e.seconds <= 0) continue;
    const id = e.taskId ?? "";
    const task = id ? taskOf(id) : undefined;
    const row = rows.get(id) ?? {
      taskId: id,
      title: task?.title || e.title,
      seconds: 0,
      estimateSec: task?.estimateMinutes && task.estimateMinutes > 0 ? task.estimateMinutes * 60 : null,
    };
    row.seconds += e.seconds;
    rows.set(id, row);
  }
  return [...rows.values()].sort((a, b) => b.seconds - a.seconds || a.title.localeCompare(b.title)).slice(0, limit);
};

/** Share of the hours budget used, in whole percent (may exceed 100). Null without a positive budget. */
export const budgetUsedPercent = (seconds: number, budgetHours: number | null | undefined): number | null =>
  budgetHours && budgetHours > 0 ? Math.round((seconds / 3600 / budgetHours) * 100) : null;
