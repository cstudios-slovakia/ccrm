/**
 * The maths behind a recurring financial movement (rent, subscriptions, wages).
 *
 * A recurring rule is stored as ONE record — there is no row per charge — so
 * every report has to derive the individual occurrences from the rule. Two
 * things follow from that, and both live here:
 *
 *  1. **When does it charge?** `recurringOccurrences` turns a rule plus a date
 *     range into the dates it actually falls on. The reports used to
 *     approximate this ("a weekly rule costs 4x per month", "a yearly rule hits
 *     every quarter"), which drifts from the calendar.
 *
 *  2. **How much did it charge *then*?** Editing the amount must not rewrite
 *     history: raising the rent from 500 to 600 today leaves every month
 *     already paid at 500 and applies 600 from the next charge onwards. The
 *     record keeps its current amount, `recurringAmountHistory` pins the
 *     superseded ones, and `recurringAmountsAt` picks the right pair for a
 *     given occurrence date.
 *
 * Everything works on `YYYY-MM-DD` strings in UTC, so the occurrence dates do
 * not shift with the viewer's timezone.
 */

import type {
  FinancialRecord,
  FinancialRecurrenceConfig,
  FinancialRecurringAmountPeriod,
  FinancialRecurringFrequency
} from "../types";

/** The planned / real pair as it stood on a particular day. */
export interface RecurringAmounts {
  amountPlanned: number;
  amountReal: number;
}

/** The subset of a record the helpers here actually need. */
export type RecurringRule = Pick<
  FinancialRecord,
  | "amountPlanned"
  | "amountReal"
  | "isRecurring"
  | "recurringFrequency"
  | "recurringConfig"
  | "recurringStartDate"
  | "recurringEndDate"
  | "recurringAmountHistory"
>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Guards against a runaway loop if a caller asks for a century of weeks. */
const MAX_OCCURRENCES = 1000;

const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" && ISO_DATE.test(value);

const toIso = (date: Date): string => date.toISOString().slice(0, 10);

const fromIso = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

const clampDay = (year: number, month: number, day: number): number =>
  Math.min(Math.max(Math.round(day) || 1, 1), daysInMonth(year, month));

/** `YYYY-MM-DD` shifted by whole days — used for the day before a change. */
export function shiftIsoDate(iso: string, days: number): string {
  const date = fromIso(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

/** Whole days from `fromIso` to `toIso`, negative when the target is behind. */
export function isoDaysBetween(from: string, to: string): number {
  return Math.round((fromIso(to).getTime() - fromIso(from).getTime()) / 86400000);
}

// ==========================================
// Amounts over time
// ==========================================

/**
 * What the rule charged on `dateIso`.
 *
 * The history holds only *closed* periods, so any date past the newest entry
 * falls through to the record's current amounts. Entries are matched by the
 * tightest `until` that still covers the date, which keeps the answer right
 * even if the stored list ever arrives out of order.
 */
export function recurringAmountsAt(
  rule: Pick<RecurringRule, "amountPlanned" | "amountReal" | "recurringAmountHistory">,
  dateIso: string
): RecurringAmounts {
  const current: RecurringAmounts = {
    amountPlanned: Number(rule.amountPlanned) || 0,
    amountReal: Number(rule.amountReal) || 0
  };

  const history = rule.recurringAmountHistory;
  if (!Array.isArray(history) || history.length === 0 || !isIsoDate(dateIso)) return current;

  let match: FinancialRecurringAmountPeriod | null = null;
  for (const period of history) {
    if (!isIsoDate(period?.until) || dateIso > period.until) continue;
    if (!match || period.until < match.until) match = period;
  }

  return match
    ? { amountPlanned: Number(match.amountPlanned) || 0, amountReal: Number(match.amountReal) || 0 }
    : current;
}

/**
 * The one figure a charge is worth: what the rule actually settles for, falling
 * back to the budget while nothing has been paid yet.
 */
export const recurringChargeAmount = ({ amountPlanned, amountReal }: RecurringAmounts): number =>
  amountReal > 0 ? amountReal : amountPlanned;

/**
 * The single figure the cash-flow and budget reports work in for a charge on
 * `dateIso`: the amount that was in force that day, priced by
 * `recurringChargeAmount`.
 *
 * Paid-first, because that is what the rule's own ledger row and the recurring
 * tab already show — the plan is the budget, the paid amount is what the rent
 * actually costs, and the forecast should not quietly disagree with both.
 */
export function recurringPlannedAmountAt(rule: RecurringRule, dateIso: string): number {
  return recurringChargeAmount(recurringAmountsAt(rule, dateIso));
}

const sameAmounts = (a: RecurringAmounts, b: RecurringAmounts): boolean =>
  Math.round(a.amountPlanned * 100) === Math.round(b.amountPlanned * 100) &&
  Math.round(a.amountReal * 100) === Math.round(b.amountReal * 100);

const cleanHistory = (
  history: FinancialRecurringAmountPeriod[] | null | undefined
): FinancialRecurringAmountPeriod[] =>
  (Array.isArray(history) ? history : [])
    .filter((period) => isIsoDate(period?.until))
    .map((period) => ({
      until: period.until,
      amountPlanned: Number(period.amountPlanned) || 0,
      amountReal: Number(period.amountReal) || 0
    }))
    .sort((a, b) => a.until.localeCompare(b.until));

/**
 * Has the rule charged at all by `dateIso`?
 *
 * A rule without a start date has always been running, so it has. Otherwise it
 * is enough to look at the year after its start: whatever the cadence, the
 * first charge falls within it, and a rule created last week whose first charge
 * is next month has nothing to pin an old amount to.
 */
function hasChargedBy(rule: RecurringRule, dateIso: string): boolean {
  const start = rule.recurringStartDate;
  if (!isIsoDate(start)) return true;
  if (start > dateIso) return false;

  const firstYear = shiftIsoDate(start, 400);
  return recurringOccurrences(rule, start, firstYear < dateIso ? firstYear : dateIso).length > 0;
}

/**
 * The history a rule should carry once its amount is changed, with the new
 * price in force from `appliesFrom` onwards.
 *
 * The old amount is pinned up to the day before, so the first charge on or
 * after `appliesFrom` is the first one at the new price and everything before
 * it keeps its figure — including the rule's own settled row, when the new
 * price starts later than today. Returns the history unchanged when there is
 * nothing to record: a one-off record, an untouched amount, a rule that has
 * not charged before `appliesFrom`, or a date that is already inside a pinned
 * period — the earlier edit is the one that describes what the past was
 * charged.
 */
export function recurringAmountHistoryAfterChange(
  rule: RecurringRule,
  next: RecurringAmounts,
  appliesFrom: string
): FinancialRecurringAmountPeriod[] | null {
  const history = cleanHistory(rule.recurringAmountHistory);
  const unchanged = () => (history.length > 0 ? history : null);

  if (!rule.isRecurring || !isIsoDate(appliesFrom)) return unchanged();

  const previous: RecurringAmounts = {
    amountPlanned: Number(rule.amountPlanned) || 0,
    amountReal: Number(rule.amountReal) || 0
  };
  if (sameAmounts(previous, next)) return unchanged();

  const until = shiftIsoDate(appliesFrom, -1);
  if (history.some((period) => period.until >= until)) return unchanged();
  // Nothing has been charged yet — the rule is being corrected, not re-priced.
  if (!hasChargedBy(rule, until)) return unchanged();

  return [...history, { until, ...previous }];
}

/**
 * The first day a new price can sensibly start: the day after the newest
 * pinned period, so an edit cannot be dated inside history that is already
 * written. `null` when the rule has no history yet.
 */
export function recurringEarliestRepriceDate(rule: RecurringRule): string | null {
  const history = cleanHistory(rule.recurringAmountHistory);
  return history.length > 0 ? shiftIsoDate(history[history.length - 1].until, 1) : null;
}

/**
 * The rule's first charge strictly after `dateIso`, or `null` when none falls
 * within the next year (a rule that has ended, or one with a broken config).
 * This is the default day a price change takes effect from: "from the next
 * charge" is what everybody means by raising the rent.
 */
export function nextRecurringChargeAfter(rule: RecurringRule, dateIso: string): string | null {
  if (!isIsoDate(dateIso)) return null;
  const from = shiftIsoDate(dateIso, 1);
  return recurringOccurrences(rule, from, shiftIsoDate(from, 400))[0] ?? null;
}

/**
 * The occurrence a settlement made "today" actually belongs to: the rule's
 * last charge on or before `dateIso`, or `dateIso` itself when the rule has
 * not charged yet (nothing to settle retroactively). Used to date an inline
 * "mark paid at this amount" edit, which is a statement about the charge
 * being settled — not a forward-looking price change like the edit form's
 * "applies from" field (`nextRecurringChargeAfter`).
 */
export function lastRecurringOccurrenceOnOrBefore(rule: RecurringRule, dateIso: string): string {
  if (!isIsoDate(dateIso)) return dateIso;
  const occurrences = recurringOccurrences(rule, shiftIsoDate(dateIso, -400), dateIso);
  return occurrences.length > 0 ? occurrences[occurrences.length - 1] : dateIso;
}

// ==========================================
// Occurrence dates
// ==========================================

/** Date of the `nth` given weekday in a month; `nth <= 0` means the last one. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): string {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;

  if (nth <= 0 || nth > 4) {
    let day = 1 + offset;
    while (day + 7 <= daysInMonth(year, month)) day += 7;
    return toIso(new Date(Date.UTC(year, month, day)));
  }

  const day = 1 + offset + (nth - 1) * 7;
  const capped = day > daysInMonth(year, month) ? day - 7 : day;
  return toIso(new Date(Date.UTC(year, month, capped)));
}

/** The date a monthly rule falls on in a given month. */
function monthlyOccurrence(config: FinancialRecurrenceConfig, year: number, month: number): string {
  if (config.monthlyType === "nth_weekday") {
    return nthWeekdayOfMonth(year, month, (config.dayOfWeek ?? 1) % 7, config.weekOfMonth ?? 1);
  }
  const day = clampDay(year, month, config.dayOfMonth ?? 1);
  return toIso(new Date(Date.UTC(year, month, day)));
}

/**
 * Every date the rule charges between `startIso` and `endIso`, inclusive.
 *
 * The rule's own start / end dates narrow the window further. A day of the
 * month the month is too short for lands on its last day (a rule set to the
 * 31st still charges in February) rather than skipping the month entirely.
 */
export function recurringOccurrences(
  rule: RecurringRule,
  startIso: string,
  endIso: string
): string[] {
  if (!isIsoDate(startIso) || !isIsoDate(endIso)) return [];

  const from =
    isIsoDate(rule.recurringStartDate) && rule.recurringStartDate > startIso
      ? rule.recurringStartDate
      : startIso;
  const to =
    isIsoDate(rule.recurringEndDate) && rule.recurringEndDate < endIso
      ? rule.recurringEndDate
      : endIso;
  if (from > to) return [];

  const config: FinancialRecurrenceConfig = rule.recurringConfig || {};
  const frequency: FinancialRecurringFrequency = rule.recurringFrequency || "monthly";
  const dates: string[] = [];

  if (frequency === "weekly") {
    const weekday = (config.dayOfWeek ?? 1) % 7;
    const cursor = fromIso(from);
    cursor.setUTCDate(cursor.getUTCDate() + ((weekday - cursor.getUTCDay() + 7) % 7));
    while (toIso(cursor) <= to && dates.length < MAX_OCCURRENCES) {
      dates.push(toIso(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return dates;
  }

  const fromDate = fromIso(from);
  const toDate = fromIso(to);

  if (frequency === "yearly") {
    const month = Math.min(Math.max((config.month ?? 1) - 1, 0), 11);
    for (let year = fromDate.getUTCFullYear(); year <= toDate.getUTCFullYear(); year++) {
      const day = clampDay(year, month, config.dayOfMonth ?? 1);
      const occurrence = toIso(new Date(Date.UTC(year, month, day)));
      if (occurrence >= from && occurrence <= to) dates.push(occurrence);
    }
    return dates;
  }

  let year = fromDate.getUTCFullYear();
  let month = fromDate.getUTCMonth();
  const lastYear = toDate.getUTCFullYear();
  const lastMonth = toDate.getUTCMonth();
  while ((year < lastYear || (year === lastYear && month <= lastMonth)) && dates.length < MAX_OCCURRENCES) {
    const occurrence = monthlyOccurrence(config, year, month);
    if (occurrence >= from && occurrence <= to) dates.push(occurrence);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return dates;
}

/**
 * What the rule costs over a date range: one entry per charge, each carrying
 * the amount that was in force on that day.
 */
export function recurringCharges(
  rule: RecurringRule,
  startIso: string,
  endIso: string
): { date: string; amount: number }[] {
  return recurringOccurrences(rule, startIso, endIso).map((date) => ({
    date,
    amount: recurringPlannedAmountAt(rule, date)
  }));
}

/** Sum of `recurringCharges` — the figure a report cell shows for the period. */
export function recurringTotalInRange(rule: RecurringRule, startIso: string, endIso: string): number {
  return recurringCharges(rule, startIso, endIso).reduce((sum, charge) => sum + charge.amount, 0);
}
