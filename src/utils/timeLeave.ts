/**
 * Time tracking: paid and unpaid leave days of one person in one month — pure.
 * docs/TIME-TRACKING-V2.md D4.2 (decisions C2, C11). Feeds `computeCostRate`'s leave input (D4.1).
 *
 * - Only rows with status `approved` or `taken` count; `requested`, `pending` and `rejected` do not.
 * - Each row is cut to the month and only working days of the caller's calendar count (the same
 *   calendar as the month's WD: Mon–Fri minus holidays ± overrides, `makeHolidayCalendar`).
 * - A row whose `daysCount` is smaller than the working days of its whole range (a half day) is
 *   scaled: each working day weighs `daysCount ÷ working days in the range`, at most 1. A missing
 *   or non-numeric `daysCount` weighs 1; zero or negative weighs 0.
 * - Rounding: the exact sum of each kind is rounded ONCE to one decimal (half up), because the
 *   rate card stores DECIMAL(4,1) and the rate must be recomputable from what it stores. The rate
 *   is then computed from these rounded values.
 *
 * `public/api/time_leave.php` is a port; `scripts/fixtures/time-leave-cases.json` is run by both
 * (`npm run test:unit` and `npm run test:time-cost`). Change both files in the same commit.
 */
import { addDays, daysInMonth } from "./holidays.ts";

export interface LeaveRow {
  startDate: string;
  endDate: string;
  daysCount?: number | string | null;
  status?: string | null;
  vacationTypeId?: string | null;
}

export interface LeaveDays {
  paid: number;
  unpaid: number;
}

export interface LeaveTypeLike {
  id: string;
  isPaid?: boolean | null;
}

const COUNTED_STATUSES = new Set(["approved", "taken"]);

/** The leave types the app ships as paid (DEFAULT_EMPLOYEE_SETTINGS); used when a type is not configured. */
const DEFAULT_PAID_TYPES = new Set(["annual", "worked_days"]);

export const round1 = (n: number): number => Math.round((n + Number.EPSILON) * 10) / 10;

const countWorkingDays = (from: string, to: string, isWorkingDay: (iso: string) => boolean): number => {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkingDay(d)) n++;
  return n;
};

/**
 * Paid and unpaid leave working days in `month` ('YYYY-MM'), one decimal each.
 * `isWorkingDay(iso)` is the person's calendar; `isPaid(vacationTypeId)` decides PL or UL.
 */
export const leaveDaysInMonth = (
  rows: readonly LeaveRow[],
  month: string,
  isWorkingDay: (iso: string) => boolean,
  isPaid: (vacationTypeId: string) => boolean,
): LeaveDays => {
  const [y, m] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
  let paid = 0;
  let unpaid = 0;
  for (const row of rows) {
    if (!COUNTED_STATUSES.has(String(row.status ?? ""))) continue;
    const start = String(row.startDate ?? "").slice(0, 10);
    const end = String(row.endDate ?? "").slice(0, 10);
    if (!start || !end || end < start || end < monthStart || start > monthEnd) continue;
    const rangeDays = countWorkingDays(start, end, isWorkingDay);
    if (rangeDays <= 0) continue;
    const raw = row.daysCount;
    const dc = raw === null || raw === undefined || raw === "" ? Number.NaN : Number(raw);
    const weight = Number.isFinite(dc) ? (dc <= 0 ? 0 : Math.min(1, dc / rangeDays)) : 1;
    const inMonth = countWorkingDays(start > monthStart ? start : monthStart, end < monthEnd ? end : monthEnd, isWorkingDay);
    const days = inMonth * weight;
    if (isPaid(String(row.vacationTypeId ?? ""))) paid += days;
    else unpaid += days;
  }
  return { paid: round1(paid), unpaid: round1(unpaid) };
};

/**
 * The leave-type lookup for `leaveDaysInMonth`: a configured type is paid only when `isPaid === true`
 * (sick and unpaid leave ship with `false`; a type with no flag counts as unpaid). A type id that is
 * not configured falls back to the shipped defaults (annual and worked_days paid).
 */
export const leaveTypeIsPaid = (types: readonly LeaveTypeLike[] | null | undefined) => (vacationTypeId: string): boolean => {
  const type = (types ?? []).find((t) => t.id === vacationTypeId);
  return type ? type.isPaid === true : DEFAULT_PAID_TYPES.has(vacationTypeId);
};
