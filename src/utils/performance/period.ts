/**
 * Period and date helpers of the "Výkonnostný prehľad" tab.
 *
 * Every other module in this folder reads dates through here, so the rule for what is local and
 * what is UTC lives in one place:
 *
 * - "YYYY-MM-DD" and "YYYY-MM-DD HH:MM[:SS]" are local wall-clock (the app stores them that way).
 * - An ISO instant with `Z` or an offset is an instant; `Date` already shows it in local time.
 * - Server-stamped columns that carry no zone (tickets) are UTC: pass `{ utc: true }`.
 */

import type { PeriodPreset, PerformancePeriod } from "../../components/dashboard/performance/types.ts";

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ day arithmetic */

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

export const endOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/** `d` moved by whole local days (DST safe: the calendar day moves, not 24 h). */
export const addDays = (d: Date, days: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());

export const daysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate();

export const isLastDayOfMonth = (d: Date): boolean => d.getDate() === daysInMonth(d.getFullYear(), d.getMonth());

/**
 * `d` moved by whole months. The day of the month is kept where the target month is long
 * enough and clamped to its last day otherwise; a date that is the last day of its month lands
 * on the last day of the target month (30 Nov - 1 month = 31 Oct).
 */
export const addMonthsClamped = (d: Date, months: number): Date => {
  const first = new Date(d.getFullYear(), d.getMonth() + months, 1, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  const last = daysInMonth(first.getFullYear(), first.getMonth());
  const day = isLastDayOfMonth(d) ? last : Math.min(d.getDate(), last);
  first.setDate(day);
  return first;
};

/** Whole calendar days from `a` to `b` (positive when `b` is later), ignoring the time of day. */
export const dayDiff = (a: Date, b: Date): number =>
  Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS);

/** "YYYY-MM-DD" of the local calendar day. */
export const toIsoDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* ------------------------------------------------------------------ ISO week */

/** Monday 00:00 of the ISO week `d` falls in. */
export const startOfIsoWeek = (d: Date): Date => {
  const day = startOfDay(d);
  const weekday = (day.getDay() + 6) % 7; // Monday = 0
  return addDays(day, -weekday);
};

/** ISO 8601 week number (1-53) and the ISO year it belongs to. */
export const isoWeekOf = (d: Date): { year: number; week: number } => {
  const monday = startOfIsoWeek(d);
  const thursday = addDays(monday, 3);
  const year = thursday.getFullYear();
  const firstThursday = new Date(year, 0, 4);
  const firstMonday = startOfIsoWeek(firstThursday);
  const week = Math.round(dayDiff(firstMonday, monday) / 7) + 1;
  return { year, week };
};

export const isoWeekNumber = (d: Date): number => isoWeekOf(d).week;

/* ------------------------------------------------------------------ parsing */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * An app date or timestamp as a `Date`, or null when it is empty or unreadable.
 *
 * - "YYYY-MM-DD" is local midnight (never UTC midnight, which would shift the day west of UTC).
 * - "YYYY-MM-DD HH:MM[:SS]" and "YYYY-MM-DDTHH:MM[:SS]" without a zone are local, or UTC with `utc`.
 * - An ISO string with `Z` or an offset is the instant it names.
 */
export const parseAppDate = (value: string | Date | null | undefined, opts: { utc?: boolean } = {}): Date | null => {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  const text = String(value).trim();
  if (!text) return null;

  const dateOnly = DATE_ONLY.exec(text);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    // Reject 2026-02-31, which `Date` would roll into March.
    return date.getMonth() === Number(m) - 1 && date.getDate() === Number(d) ? date : null;
  }

  if (HAS_ZONE.test(text) && text.length > 10) {
    const instant = new Date(text.replace(" ", "T"));
    return Number.isNaN(instant.getTime()) ? null : instant;
  }

  const dateTime = DATE_TIME.exec(text);
  if (dateTime) {
    const [, y, m, d, hh, mm, ss, frac] = dateTime;
    const ms = frac ? Number(frac.padEnd(3, "0").slice(0, 3)) : 0;
    const parts = [Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? 0), ms] as const;
    const date = opts.utc ? new Date(Date.UTC(...parts)) : new Date(...parts);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

/** A server timestamp that carries no zone (tickets): those are UTC. */
export const parseUtcStamp = (value: string | null | undefined): Date | null => parseAppDate(value, { utc: true });

/* ------------------------------------------------------------------ ranges */

/** Null bounds are unbounded. A null or invalid `date` is never in a range. The end bound is inclusive. */
export const isInRange = (date: Date | null | undefined, start: Date | null, end: Date | null): boolean => {
  if (!date || Number.isNaN(date.getTime())) return false;
  if (start && date.getTime() < start.getTime()) return false;
  if (end && date.getTime() > end.getTime()) return false;
  return true;
};

/** Does the period carry a range at all (anything but "all")? */
export const periodHasRange = (period: PerformancePeriod): boolean => period.start !== null && period.end !== null;

/** The period before the selected one as a plain range, or null for "all". */
export const previousRangeOf = (period: PerformancePeriod): { start: Date; end: Date } | null =>
  period.previousStart && period.previousEnd ? { start: period.previousStart, end: period.previousEnd } : null;

/* ------------------------------------------------------------------ preset and period */

const PRESET_BY_NAME: Record<string, PeriodPreset> = {
  "this week": "week",
  "this month": "month",
  "this quarter": "quarter",
  "this year": "year",
  "all time": "all",
};

/** Maps the dashboard's preset names to a preset; an unknown name is a custom range, none is "all". */
export const periodPresetFromName = (name: string | null | undefined): PeriodPreset => {
  const key = (name ?? "").trim().toLowerCase();
  if (!key) return "all";
  return PRESET_BY_NAME[key] ?? "custom";
};

const quarterStart = (d: Date): Date => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);

/** First day of the calendar unit of `preset` that holds `d`. */
const unitStart = (preset: "week" | "month" | "quarter" | "year", d: Date): Date => {
  if (preset === "week") return startOfIsoWeek(d);
  if (preset === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  if (preset === "quarter") return quarterStart(d);
  return new Date(d.getFullYear(), 0, 1);
};

/**
 * The selected range and the one before it, as local day bounds.
 *
 * Previous range: for week / month / quarter / year the same elapsed part of the preceding
 * calendar unit (1-20 Nov -> 1-20 Oct, clamped to a shorter month; a whole month maps to the
 * whole previous month); for a custom range the same number of days ending the day before
 * `start`; for "all" everything is null. A missing bound of a calendar preset is taken from
 * `today` (the unit's first day, and today).
 */
export const buildPeriod = (preset: PeriodPreset, start: Date | null, end: Date | null, today: Date): PerformancePeriod => {
  if (preset === "all") {
    return { preset, start: null, end: null, previousStart: null, previousEnd: null };
  }

  let from = start;
  let to = end;
  if (preset !== "custom") {
    from = from ?? unitStart(preset, today);
    to = to ?? today;
  }
  if (!from || !to) {
    return { preset, start: from ? startOfDay(from) : null, end: to ? endOfDay(to) : null, previousStart: null, previousEnd: null };
  }

  const s = startOfDay(from);
  const e = endOfDay(to);
  let previousStart: Date;
  let previousEnd: Date;

  if (preset === "custom") {
    const length = dayDiff(s, e) + 1;
    previousEnd = endOfDay(addDays(s, -1));
    previousStart = startOfDay(addDays(previousEnd, -(length - 1)));
  } else if (preset === "week") {
    previousStart = startOfDay(addDays(s, -7));
    previousEnd = endOfDay(addDays(e, -7));
  } else {
    const months = preset === "month" ? 1 : preset === "quarter" ? 3 : 12;
    previousStart = startOfDay(addMonthsClamped(s, -months));
    previousEnd = endOfDay(addMonthsClamped(e, -months));
  }
  return { preset, start: s, end: e, previousStart, previousEnd };
};
