/**
 * Time tracking: types and pure helpers shared by every view of the module.
 *
 * The server (`api/time_entries.php`) owns the data; this file owns how it is read:
 * durations in and out, the week and day arithmetic, totals, the stable project colour.
 * No fetching, no React — see `timeTrackingApi.ts` and `useTimeTracking.tsx`.
 *
 * The title rule: an entry linked to a task or ticket has no title of its own — `title`
 * is the linked item's, resolved live by the server, and renaming it renames THAT item.
 * Only an entry with no task and no ticket owns its text (`titleSource === "entry"`).
 */

import { addDays, isWeekend, weekdayOf, type HolidayCalendar, type HolidayOverrides } from "./holidays.ts";
import type { CostRateSource } from "./timeCost.ts";

export type TFn = (en: string, sk: string, hu: string) => string;

/** The `t(en, sk, hu)` helper for a UI language. */
export const makeT = (language: string): TFn => (en, sk, hu) => (language === "sk" ? sk : language === "hu" ? hu : en);

export type TimeEntrySource =
  | "timer"
  | "manual"
  | "day"
  | "calendar"
  | "timesheet"
  | "extension"
  | "activity"
  | "toggl"
  | "clockify"
  | "ticket_legacy";

export type TimeTitleSource = "task" | "ticket" | "entry";

export interface TimeEntry {
  id: string;
  userId: string;
  recordedByUserId: string;
  employeeId: string | null;
  projectId: string | null;
  projectName?: string | null;
  taskId: string | null;
  ticketId: string | null;
  /** What to show: the task's / ticket's title, else the entry's own text. */
  title: string;
  titleSource: TimeTitleSource;
  /** The linked task or ticket is gone; `title` is the greyed snapshot. */
  titleDeleted: boolean;
  /** The entry's OWN text; null whenever it is linked. */
  description: string | null;
  legacyNote: string | null;
  /** YYYY-MM-DD, company timezone. */
  entryDate: string;
  startAt: string | null;
  endAt: string | null;
  durationSec: number | null;
  running: boolean;
  billable: boolean;
  tags: string[];
  source: TimeEntrySource;
  originType: string | null;
  originId: string | null;
  approvalStatus: string | null;
  /** True when this entry's employee has a paid salary row for the entry's month. */
  paidPayrollMonth?: boolean;
  createdAt: string;
  // Present only when the viewer may see cost (own entries always, others with time_tracking_costs).
  costRate?: number | null;
  costRateSource?: CostRateSource;
  costRateBasisDays?: number | null;
  cost?: number | null;
  billableRate?: number | null;
}

export interface TimeTrackingSettings {
  hoursBasis: "workingDays" | "fixed";
  fixedHoursPerMonth: number;
  hoursPerDay: number;
  employerMultiplier: number;
  holidayOverrides: HolidayOverrides;
  requireProjectToStop: boolean;
  requireTask: boolean;
  billableByDefault: boolean;
  autoStopAt: string | null;
  longEntryWarnHours: number | null;
  idleReminderMinutes: number | null;
  lockAfterDays: number | null;
  weeklyApproval: boolean;
  rounding: { minutes: 0 | 5 | 15 | 30; mode: "nearest" | "up" };
  extension: { enabled: boolean; activityCaptureAllowed: boolean; unsortedRetentionDays: number };
  ticketTimeVisibleToClients: boolean;
}

/** Mirrors ccrm_tt_default_settings() in api/time_entries_lib.php. */
export const DEFAULT_TIME_TRACKING_SETTINGS: TimeTrackingSettings = {
  hoursBasis: "workingDays",
  fixedHoursPerMonth: 168,
  hoursPerDay: 8,
  employerMultiplier: 1.352,
  holidayOverrides: {},
  requireProjectToStop: true,
  requireTask: false,
  billableByDefault: true,
  autoStopAt: "23:59",
  longEntryWarnHours: 10,
  idleReminderMinutes: 15,
  lockAfterDays: 14,
  weeklyApproval: false,
  rounding: { minutes: 0, mode: "nearest" },
  extension: { enabled: true, activityCaptureAllowed: true, unsortedRetentionDays: 30 },
  ticketTimeVisibleToClients: false,
};

// ---------------------------------------------------------------------------
// Durations
// ---------------------------------------------------------------------------

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** "2:15:00" (with seconds, the running timer) or "2:15" (everywhere else). */
export const formatDuration = (sec: number | null | undefined, withSeconds = false): string => {
  const total = Math.max(0, Math.round(sec ?? 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return withSeconds ? `${h}:${pad2(m)}:${pad2(s)}` : `${h}:${pad2(m)}`;
};

/** Decimal hours for charts and CSV: 8100 -> 2.25. */
export const hoursOf = (sec: number | null | undefined): number => Math.round(((sec ?? 0) / 3600) * 100) / 100;

/**
 * What a person types into an hours field, as seconds. Accepts `1.5` and `1,5` (hours),
 * `1:30`, `90m`, `2h`, `2h 30m`, `45min`. Returns null for anything else, and for zero.
 */
export const parseDurationInput = (text: string): number | null => {
  const raw = text.trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return null;
  let seconds: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = raw.match(/^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?$/))) {
    seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
  } else if ((m = raw.match(/^(?:(\d+(?:[.,]\d+)?)h(?:ours?|rs?)?)?(?:(\d+(?:[.,]\d+)?)m(?:in(?:utes?)?)?)?$/)) && (m[1] || m[2])) {
    seconds = Number((m[1] ?? "0").replace(",", ".")) * 3600 + Number((m[2] ?? "0").replace(",", ".")) * 60;
  } else if ((m = raw.match(/^(\d+(?:[.,]\d+)?)$/))) {
    seconds = Number(m[1].replace(",", ".")) * 3600;
  }
  if (seconds === null || !Number.isFinite(seconds)) return null;
  const rounded = Math.round(seconds);
  return rounded > 0 && rounded <= 86400 ? rounded : null;
};

/** Seconds since `startAt` at `nowMs`; never counts ticks. */
export const elapsedSeconds = (startAt: string | null, nowMs: number): number =>
  startAt ? Math.max(0, Math.floor((nowMs - Date.parse(startAt)) / 1000)) : 0;

/** The seconds an entry contributes: its duration, or the running time so far. */
export const entrySeconds = (e: Pick<TimeEntry, "durationSec" | "running" | "startAt">, nowMs: number): number =>
  e.running ? elapsedSeconds(e.startAt, nowMs) : e.durationSec ?? 0;

// ---------------------------------------------------------------------------
// Dates (local calendar, YYYY-MM-DD)
// ---------------------------------------------------------------------------

export const localIsoDate = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Today in the browser's timezone. */
export const todayIso = (now: Date = new Date()): string => localIsoDate(now);

/** Monday of the week containing `iso`. */
export const weekStart = (iso: string): string => {
  const w = weekdayOf(iso); // 0 = Sunday
  return addDays(iso, w === 0 ? -6 : 1 - w);
};

/** Mon..Sun of the week containing `iso`. */
export const weekDays = (iso: string): string[] => {
  const start = weekStart(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

/** HH:MM of an ISO instant, in the browser's timezone. */
export const clockTime = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/** The ISO instant for a local date and "HH:MM". */
export const isoFromLocal = (date: string, time: string): string => {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(y, mo - 1, d, h || 0, mi || 0, 0, 0).toISOString();
};

/** The local date an ISO instant falls on (the entry's day as the viewer sees it). */
export const localDateOf = (iso: string): string => localIsoDate(new Date(iso));

/** The entry ends on a later local day than it starts (shown as a `+1` marker). */
export const endsNextDay = (e: Pick<TimeEntry, "startAt" | "endAt">): boolean =>
  !!e.startAt && !!e.endAt && localDateOf(e.endAt) > localDateOf(e.startAt);

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export const totalSeconds = (entries: readonly TimeEntry[], nowMs: number): number =>
  entries.reduce((sum, e) => sum + entrySeconds(e, nowMs), 0);

export const billableSeconds = (entries: readonly TimeEntry[], nowMs: number): number =>
  entries.reduce((sum, e) => sum + (e.billable ? entrySeconds(e, nowMs) : 0), 0);

/** Share of billable time, 0–100; null with no time at all. */
export const billablePercent = (entries: readonly TimeEntry[], nowMs: number): number | null => {
  const total = totalSeconds(entries, nowMs);
  return total > 0 ? Math.round((billableSeconds(entries, nowMs) / total) * 100) : null;
};

/** The sum of the cost fields the viewer was allowed to see; null when none of them was. */
export const totalCost = (entries: readonly TimeEntry[]): number | null => {
  let any = false;
  let cents = 0;
  for (const e of entries) {
    if (typeof e.cost === "number") {
      any = true;
      cents += Math.round(e.cost * 100);
    }
  }
  return any ? cents / 100 : null;
};

/** entries -> { date -> entries }, entries of a day newest first (running one on top). */
export const groupByDay = (entries: readonly TimeEntry[]): Map<string, TimeEntry[]> => {
  const out = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const list = out.get(e.entryDate);
    if (list) list.push(e);
    else out.set(e.entryDate, [e]);
  }
  for (const list of out.values()) {
    list.sort((a, b) => Number(b.running) - Number(a.running) || (b.startAt ?? b.createdAt).localeCompare(a.startAt ?? a.createdAt));
  }
  return out;
};

/** What makes two entries "the same work" for the count badge in the List view. */
const sameWork = (a: TimeEntry, b: TimeEntry): boolean =>
  a.title === b.title && a.projectId === b.projectId && a.taskId === b.taskId && a.ticketId === b.ticketId && a.billable === b.billable && a.userId === b.userId && !a.running && !b.running;

/** Consecutive identical entries collapsed into one row with a count. */
export const collapseIdentical = (entries: readonly TimeEntry[]): { entry: TimeEntry; members: TimeEntry[] }[] => {
  const out: { entry: TimeEntry; members: TimeEntry[] }[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && sameWork(last.entry, e)) last.members.push(e);
    else out.push({ entry: e, members: [e] });
  }
  return out;
};

// ---------------------------------------------------------------------------
// Targets and the day strip
// ---------------------------------------------------------------------------

/** The hours a person should log in the given days: working days (holidays excluded) x hoursPerDay. */
export const targetSeconds = (calendar: HolidayCalendar, days: readonly string[], hoursPerDay: number): number =>
  days.filter((d) => calendar.isWorkingDay(d)).length * hoursPerDay * 3600;

export type DayDot = "met" | "short" | "empty";

/** The dot under a day in the strip: emerald at/above target, amber under it, grey with nothing logged. */
export const dayDot = (loggedSec: number, targetSec: number): DayDot =>
  loggedSec <= 0 ? "empty" : loggedSec >= targetSec && targetSec > 0 ? "met" : "short";

/** A day that is not a working day by default (weekend) — for callers that have no calendar yet. */
export const isDefaultOffDay = (iso: string): boolean => isWeekend(iso);

// ---------------------------------------------------------------------------
// Project colour
// ---------------------------------------------------------------------------

const PROJECT_PALETTE = ["#0d9488", "#4f6edb", "#d97706", "#7c3aed", "#e11d48", "#0284c7", "#65a30d", "#c026d3"] as const;

/** A stable colour per project id from a fixed 8-colour palette: the same project, the same colour, everywhere. */
export const projectColor = (projectId: string | null | undefined): string => {
  if (!projectId) return "#94a3b8";
  let h = 0;
  for (let i = 0; i < projectId.length; i++) h = (h * 31 + projectId.charCodeAt(i)) >>> 0;
  return PROJECT_PALETTE[h % PROJECT_PALETTE.length];
};

// ---------------------------------------------------------------------------
// Link rules
// ---------------------------------------------------------------------------

/**
 * Whether the entry's title is the entry's own text. False for task- and ticket-linked
 * entries, whose title belongs to the linked item.
 */
export const hasOwnTitle = (e: Pick<TimeEntry, "titleSource">): boolean => e.titleSource === "entry";

/**
 * Linking a standalone entry drops its own description. The user is asked first when that
 * text is not empty and differs from the new title.
 */
export const needsLinkConfirmation = (ownText: string | null | undefined, newTitle: string): boolean => {
  const own = (ownText ?? "").trim();
  return own !== "" && own.toLowerCase() !== newTitle.trim().toLowerCase();
};

/** Error codes the API answers with -> the sentence key the UI shows (see timeTrackingApi.ts). */
export const TIME_ERROR_CODES = [
  "forbidden",
  "forbidden_project",
  "forbidden_ticket",
  "task_not_found",
  "ticket_not_found",
  "project_not_found",
  "task_project_mismatch",
  "project_required",
  "task_required",
  "already_running",
  "end_before_start",
  "duration_required",
  "duration_out_of_range",
  "bad_time",
  "not_found",
  "save_failed",
] as const;
