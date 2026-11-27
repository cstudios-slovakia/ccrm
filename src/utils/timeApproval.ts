/**
 * Weekly approval of a timesheet.
 *
 * `weekApprovalState` is pure: the Timesheet (phase 3) and the tests call it with
 * the entries they already have. `submitWeek` is the network call — it marks the
 * caller's entries in that Monday–Sunday week `approved`. Locking then treats
 * those entries as admin-edit only (`timeLock.ts`).
 */

import { addDays, weekdayOf } from "./holidays.ts";

export type WeekApprovalStatus = "off" | "empty" | "open" | "approved";

export interface WeekApprovalEntry {
  entryDate: string;
  userId?: string;
  approvalStatus?: string | null;
  deleted?: boolean;
  running?: boolean;
}

export interface WeekApprovalInput {
  /** Any day inside the week; normalised to the Monday. */
  weekStart: string;
  entries: readonly WeekApprovalEntry[];
  /** Whose week. Omit to consider every entry in the week. */
  userId?: string;
  /** The company setting. Off means the button is not shown and nothing locks for approval. */
  weeklyApproval: boolean;
}

export interface WeekApprovalState {
  /** Monday, YYYY-MM-DD. */
  weekStart: string;
  weekEnd: string;
  enabled: boolean;
  status: WeekApprovalStatus;
  entryCount: number;
  approvedCount: number;
  /** True when the setting is on, the week has unapproved stopped entries, and it is not already fully approved. */
  canSubmit: boolean;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})/;

/** Monday of the week containing `iso` (Monday–Sunday). */
export const approvalWeekStart = (iso: string): string => {
  if (!ISO.test(iso)) return iso;
  const w = weekdayOf(iso);
  return addDays(iso, w === 0 ? -6 : 1 - w);
};

const isApproved = (status: string | null | undefined): boolean =>
  typeof status === "string" && status.trim().toLowerCase() === "approved";

export const weekApprovalState = (input: WeekApprovalInput): WeekApprovalState => {
  const start = approvalWeekStart(input.weekStart);
  const end = ISO.test(start) ? addDays(start, 6) : start;
  const inWeek = input.entries.filter((e) => {
    if (e.deleted || e.running) return false;
    if (input.userId && e.userId && e.userId !== input.userId) return false;
    return e.entryDate >= start && e.entryDate <= end;
  });
  const approvedCount = inWeek.filter((e) => isApproved(e.approvalStatus)).length;
  const base = {
    weekStart: start,
    weekEnd: end,
    enabled: input.weeklyApproval,
    entryCount: inWeek.length,
    approvedCount,
  };
  if (!input.weeklyApproval) {
    return { ...base, status: "off", canSubmit: false };
  }
  if (inWeek.length === 0) {
    return { ...base, status: "empty", canSubmit: false };
  }
  if (approvedCount === inWeek.length) {
    return { ...base, status: "approved", canSubmit: false };
  }
  return { ...base, status: "open", canSubmit: true };
};

/**
 * Mark the signed-in user's entries for the week of `weekStart` as approved.
 * The server refuses the call when weekly approval is off, and ignores entries
 * that are already approved (submitting twice is a no-op).
 */
export const submitWeek = async (weekStart: string): Promise<void> => {
  const res = await fetch("/api/time_entries.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "submit_week", weekStart: approvalWeekStart(weekStart) }),
  });
  let body: { success?: boolean; code?: string } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.success !== true) {
    const code = body?.code || (res.status === 401 ? "signed_out" : "save_failed");
    throw new Error(code);
  }
};
