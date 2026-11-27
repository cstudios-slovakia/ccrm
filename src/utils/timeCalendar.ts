/**
 * Calendar geometry for the Time tracking Calendar tab.
 *
 * Snap, move and resize are minute maths. A block's duration is the UTC
 * difference of its two instants (C18): a local hour across a DST change is
 * not 3600 seconds. Hours-only entries stay in the Untimed lane until a drop
 * gives them a start.
 */

import { addDays, daysInMonth, isoDate } from "./holidays.ts";
import { isEntryLocked, type LockSettings } from "./timeLock.ts";
import { localIsoDate, weekDays, weekStart, type TimeEntry } from "./timeTracking.ts";

export const SNAP_MINUTES = 15;
export const MINUTES_PER_DAY = 24 * 60;
/** The hour grid opens scrolled so 08:00 is the first visible hour. */
export const VISIBLE_START_MIN = 8 * 60;
/** 20:00 is the bottom of that first screen; the rest of the day still scrolls. */
export const VISIBLE_END_MIN = 20 * 60;
export const DEFAULT_ZOOM = "week" as const;
export const DEFAULT_BLOCK_MINUTES = 60;
/** The API rejects a duration above 24 hours. */
export const MAX_DURATION_SEC = 86400;

export type CalendarZoom = "day" | "week" | "month";

export interface MinuteSpan {
  /** Minutes from local midnight of the span's start day. */
  startMin: number;
  /** Minutes from that same midnight. 1440 is the next midnight; above that crosses into the next day. */
  endMin: number;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Nearest snap boundary. Does not clamp: callers that need a day range clamp afterwards. */
export const snapMinute = (minute: number, snap = SNAP_MINUTES): number => {
  if (!Number.isFinite(minute)) return 0;
  return Math.round(minute / snap) * snap;
};

export const clampMinute = (minute: number, min = 0, max = MINUTES_PER_DAY): number =>
  Math.min(max, Math.max(min, minute));

/** Fraction of a day column (0 at midnight, 1 at the next midnight) → a snapped minute inside the day. */
export const minuteFromFraction = (fraction: number, snap = SNAP_MINUTES): number => {
  const raw = clampMinute(fraction, 0, 1) * MINUTES_PER_DAY;
  return clampMinute(snapMinute(raw, snap), 0, MINUTES_PER_DAY);
};

/**
 * Snap both edges, keep at least one snap of length, and never run longer than
 * 24 clock-hours. A start before midnight is shifted forward with its end.
 */
export const snapSpan = (startMin: number, endMin: number, snap = SNAP_MINUTES): MinuteSpan => {
  let start = snapMinute(startMin, snap);
  let end = snapMinute(endMin, snap);
  if (end < start + snap) end = start + snap;
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end > start + MINUTES_PER_DAY) end = start + MINUTES_PER_DAY;
  if (end < start + snap) end = start + snap;
  return { startMin: start, endMin: end };
};

/** Move a block by a minute delta, keeping its length (then snapped). */
export const moveSpan = (span: MinuteSpan, deltaMin: number, snap = SNAP_MINUTES): MinuteSpan =>
  snapSpan(span.startMin + deltaMin, span.endMin + deltaMin, snap);

/** Drag the bottom edge. The start stays put. */
export const resizeSpan = (span: MinuteSpan, newEndMin: number, snap = SNAP_MINUTES): MinuteSpan =>
  snapSpan(span.startMin, newEndMin, snap);

/** Month-view resize: each step is one snap. */
export const resizeBySteps = (span: MinuteSpan, steps: number, snap = SNAP_MINUTES): MinuteSpan =>
  resizeSpan(span, span.endMin + steps * snap, snap);

/** Drag-to-create between two pointer minutes on one day. Minimum length is one snap. */
export const createSpan = (anchorMin: number, pointerMin: number, snap = SNAP_MINUTES): MinuteSpan => {
  const a = clampMinute(anchorMin, 0, MINUTES_PER_DAY);
  const b = clampMinute(pointerMin, 0, MINUTES_PER_DAY);
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  return snapSpan(start, end <= start ? start + snap : end, snap);
};

/** A click (no drag) proposes a one-hour block from the snapped minute. */
export const defaultClickSpan = (minute: number, length = DEFAULT_BLOCK_MINUTES, snap = SNAP_MINUTES): MinuteSpan => {
  const start = clampMinute(snapMinute(minute, snap), 0, MINUTES_PER_DAY - snap);
  return snapSpan(start, start + length, snap);
};

/**
 * A running timer's start can move; its end stays "now", so the start cannot
 * pass the current minute. Resize of a running entry is refused separately.
 */
export const moveRunningStart = (startMin: number, endMin: number, deltaMin: number, snap = SNAP_MINUTES): number => {
  const next = snapMinute(startMin + deltaMin, snap);
  const latest = Math.max(0, endMin - snap);
  return clampMinute(next, 0, latest);
};

/** Midnights crossed by an end minute. 1440 → 1 (00:00 the next day). 1439 → 0. */
export const plusDays = (endMin: number): number => {
  if (endMin < MINUTES_PER_DAY) return 0;
  if (endMin % MINUTES_PER_DAY === 0) return endMin / MINUTES_PER_DAY;
  return Math.floor(endMin / MINUTES_PER_DAY);
};

/** HH:MM on the clock face. An end of 1440 (or 2880, …) reads 00:00; the +N marker carries the day. */
export const formatMinute = (min: number): string => {
  const plus = plusDays(min);
  const within = plus > 0 ? min - plus * MINUTES_PER_DAY : min;
  const rounded = Math.max(0, Math.floor(within + 1e-6));
  return `${pad2(Math.floor(rounded / 60))}:${pad2(rounded % 60)}`;
};

/** Seconds between two UTC instants. This is the duration the entry stores. */
export const durationSecFromUtc = (startMs: number, endMs: number): number => {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.round((endMs - startMs) / 1000));
};

/** Local calendar date + minute-of-day (may be ≥ 1440) → a Date in the browser timezone. */
export const instantFromLocal = (day: string, minuteOfDay: number): Date => {
  const [y, mo, d] = day.split("-").map(Number);
  const extra = Math.floor(minuteOfDay / MINUTES_PER_DAY);
  const min = minuteOfDay - extra * MINUTES_PER_DAY;
  return new Date(y, (mo || 1) - 1, (d || 1) + extra, Math.floor(min / 60), min % 60, 0, 0);
};

export const spanToInstants = (day: string, span: MinuteSpan): { start: Date; end: Date; durationSec: number } => {
  const start = instantFromLocal(day, span.startMin);
  const end = instantFromLocal(day, span.endMin);
  return { start, end, durationSec: durationSecFromUtc(start.getTime(), end.getTime()) };
};

/** Pull the end back, one snap at a time, until the UTC duration fits the API's 24-hour cap. */
export const fitSpanDuration = (day: string, span: MinuteSpan, maxSec = MAX_DURATION_SEC): MinuteSpan => {
  let end = span.endMin;
  let guard = 0;
  while (guard++ < 200) {
    const dur = spanToInstants(day, { startMin: span.startMin, endMin: end }).durationSec;
    if (dur <= maxSec || end <= span.startMin + SNAP_MINUTES) break;
    end -= SNAP_MINUTES;
  }
  return { startMin: span.startMin, endMin: Math.max(end, span.startMin + SNAP_MINUTES) };
};

/** A start that landed on the next midnight belongs to the next calendar day. */
export const normalizeSpanDay = (day: string, span: MinuteSpan): { day: string; span: MinuteSpan } => {
  let d = day;
  let start = span.startMin;
  let end = span.endMin;
  let guard = 0;
  while (start >= MINUTES_PER_DAY && guard++ < 4) {
    d = addDays(d, 1);
    start -= MINUTES_PER_DAY;
    end -= MINUTES_PER_DAY;
  }
  return { day: d, span: { startMin: start, endMin: end } };
};

export const instantsForSpan = (
  day: string,
  span: MinuteSpan,
): { entryDate: string; startAt: string; endAt: string; durationSec: number } => {
  const norm = normalizeSpanDay(day, span);
  const fitted = fitSpanDuration(norm.day, norm.span);
  const { start, end, durationSec } = spanToInstants(norm.day, fitted);
  return { entryDate: norm.day, startAt: start.toISOString(), endAt: end.toISOString(), durationSec };
};

/** Hours-only: no start, and not the running timer (that one has a start and no end). */
export const isUntimed = (entry: Pick<TimeEntry, "startAt" | "running">): boolean => !entry.running && !entry.startAt;

export const localMinutesOf = (iso: string): { day: string; minute: number } | null => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { day: localIsoDate(d), minute: d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 };
};

const calendarDaysBetween = (from: string, to: string): number => {
  let days = 0;
  let cursor = from;
  while (cursor < to && days < 7) {
    cursor = addDays(cursor, 1);
    days += 1;
  }
  return days;
};

/** Where a timed entry sits, measured from the local midnight of its start. Null for hours-only. */
export const spanFromEntry = (
  entry: Pick<TimeEntry, "startAt" | "endAt" | "running">,
  nowMs: number,
): MinuteSpan | null => {
  if (!entry.startAt) return null;
  const start = localMinutesOf(entry.startAt);
  if (!start) return null;
  const endIso = entry.running || !entry.endAt ? new Date(nowMs).toISOString() : entry.endAt;
  const end = localMinutesOf(endIso);
  if (!end) return null;
  let endMin = end.minute;
  if (end.day > start.day) endMin = calendarDaysBetween(start.day, end.day) * MINUTES_PER_DAY + end.minute;
  else if (end.day < start.day) endMin = start.minute;
  return { startMin: start.minute, endMin: Math.max(endMin, start.minute) };
};

/** The seconds an entry contributes: UTC elapsed while running, else the stored UTC span, else the hours-only duration. */
export const entryDurationSec = (
  entry: Pick<TimeEntry, "startAt" | "endAt" | "durationSec" | "running">,
  nowMs: number,
): number => {
  if (entry.running && entry.startAt) {
    const startMs = Date.parse(entry.startAt);
    return Number.isFinite(startMs) ? durationSecFromUtc(startMs, nowMs) : 0;
  }
  if (entry.startAt && entry.endAt) {
    const startMs = Date.parse(entry.startAt);
    const endMs = Date.parse(entry.endAt);
    if (Number.isFinite(startMs) && Number.isFinite(endMs)) return durationSecFromUtc(startMs, endMs);
  }
  return Math.max(0, entry.durationSec ?? 0);
};

/** Dropping an hours-only entry (or a task) onto the grid gives it a snapped start and keeps its length. */
export const spanFromUntimedDrop = (startMin: number, durationSec: number, snap = SNAP_MINUTES): MinuteSpan => {
  const start = clampMinute(snapMinute(startMin, snap), 0, MINUTES_PER_DAY - snap);
  const durMin = Math.max(snap, snapMinute(Math.round((durationSec || 0) / 60), snap) || snap);
  return snapSpan(start, start + durMin, snap);
};

export const spanForDrop = (startMin: number, durationMin = DEFAULT_BLOCK_MINUTES, snap = SNAP_MINUTES): MinuteSpan =>
  spanFromUntimedDrop(startMin, durationMin * 60, snap);

/**
 * A new entry on this day is refused for a non-admin when the day is locked
 * by age or a paid payroll month. Same check as a move.
 */
export const calendarDayLocked = (day: string, settings: LockSettings, nowIso: string): boolean =>
  isEntryLocked({ entryDate: day, approvalStatus: null, running: false }, settings, nowIso);

/** Move and resize are refused when the lock check says the entry is locked. */
export const dragAllowed = (locked: boolean): boolean => !locked;

/** The running entry's end is the now line; only a stopped entry can be resized. */
export const resizeAllowed = (locked: boolean, running: boolean): boolean => !locked && !running;

export interface LaidBlock {
  id: string;
  startMin: number;
  endMin: number;
  column: number;
  columns: number;
}

const overlaps = (a: { startMin: number; endMin: number }, b: { startMin: number; endMin: number }): boolean =>
  a.startMin < b.endMin && b.startMin < a.endMin;

/** Side-by-side columns for blocks that overlap. Touching edges do not overlap. */
export const layoutOverlaps = (blocks: { id: string; startMin: number; endMin: number }[]): LaidBlock[] => {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.id.localeCompare(b.id));
  const columnEnds: number[] = [];
  const placed: LaidBlock[] = [];
  for (const block of sorted) {
    let column = columnEnds.findIndex((end) => end <= block.startMin);
    if (column < 0) {
      column = columnEnds.length;
      columnEnds.push(block.endMin);
    } else {
      columnEnds[column] = block.endMin;
    }
    placed.push({ ...block, column, columns: 1 });
  }
  const parent = placed.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) if (overlaps(placed[i], placed[j])) union(i, j);
  }
  const maxCol = new Map<number, number>();
  for (let i = 0; i < placed.length; i++) {
    const root = find(i);
    maxCol.set(root, Math.max(maxCol.get(root) ?? 0, placed[i].column));
  }
  for (let i = 0; i < placed.length; i++) placed[i].columns = (maxCol.get(find(i)) ?? 0) + 1;
  return placed;
};

export interface DayLayoutBlock {
  id: string;
  startMin: number;
  endMin: number;
  durationSec: number;
  plus: number;
  column: number;
  columns: number;
}

export interface DayLayout {
  untimed: { id: string; durationSec: number }[];
  timed: DayLayoutBlock[];
}

/**
 * One day's column. Timed entries are drawn on the day they start, with a +N
 * marker when they cross midnight — they are not repeated on the next day.
 */
export const layoutDay = (entries: readonly TimeEntry[], day: string, nowMs: number): DayLayout => {
  const untimed: DayLayout["untimed"] = [];
  const raw: { id: string; startMin: number; endMin: number; durationSec: number; plus: number }[] = [];
  for (const entry of entries) {
    if (isUntimed(entry)) {
      if (entry.entryDate === day) untimed.push({ id: entry.id, durationSec: entryDurationSec(entry, nowMs) });
      continue;
    }
    if (!entry.startAt) continue;
    const start = localMinutesOf(entry.startAt);
    if (!start || start.day !== day) continue;
    const span = spanFromEntry(entry, nowMs);
    if (!span) continue;
    raw.push({
      id: entry.id,
      startMin: span.startMin,
      endMin: span.endMin,
      durationSec: entryDurationSec(entry, nowMs),
      plus: plusDays(span.endMin),
    });
  }
  const laid = new Map(layoutOverlaps(raw).map((block) => [block.id, block]));
  return {
    untimed,
    timed: raw.map((block) => {
      const lay = laid.get(block.id)!;
      return { ...block, column: lay.column, columns: lay.columns };
    }),
  };
};

/** Monday-first month grid, including the leading and trailing days that fill the weeks. */
export const monthGrid = (anchor: string): string[] => {
  const [y, m] = anchor.split("-").map(Number);
  const first = isoDate(y, m, 1);
  const start = weekStart(first);
  const last = isoDate(y, m, daysInMonth(y, m));
  const end = addDays(weekStart(last), 6);
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
};

export const visibleDays = (zoom: CalendarZoom, anchor: string): string[] => {
  if (zoom === "day") return [anchor];
  if (zoom === "week") return weekDays(anchor);
  return monthGrid(anchor);
};

export const queryRange = (zoom: CalendarZoom, anchor: string): { from: string; to: string } => {
  const days = visibleDays(zoom, anchor);
  return { from: days[0], to: days[days.length - 1] };
};

export const shiftAnchor = (zoom: CalendarZoom, anchor: string, dir: -1 | 1): string => {
  if (zoom === "day") return addDays(anchor, dir);
  if (zoom === "week") return addDays(weekStart(anchor), dir * 7);
  const [y, m] = anchor.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1 + dir, 1));
  return isoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, 1);
};

/** Scroll fraction that puts 08:00 at the top of a 24-hour column. */
export const visibleScrollFraction = (): number => VISIBLE_START_MIN / MINUTES_PER_DAY;

export const nowPosition = (nowMs: number): { day: string; minute: number } => {
  const d = new Date(nowMs);
  return { day: localIsoDate(d), minute: d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 };
};

export interface WorkCountryPerson {
  userId: string;
  workCountry: "SK" | "HU" | null;
}

/**
 * Whose public holidays the grid shows (B3). "Me" and the whole team use the
 * viewer's already-resolved work country. One other person uses that person's
 * work country, else the company country. The UI language is not an input.
 */
export const countryForScope = (
  scope: string,
  viewerUserId: string | null,
  viewerCountry: "SK" | "HU",
  companyCountry: "SK" | "HU",
  people: readonly WorkCountryPerson[],
): "SK" | "HU" => {
  if (scope === "all" || scope === "me" || scope === "" || scope === viewerUserId) return viewerCountry;
  const person = people.find((p) => p.userId === scope);
  return person?.workCountry ?? companyCountry;
};
