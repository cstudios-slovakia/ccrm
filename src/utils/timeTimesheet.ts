/**
 * The weekly timesheet grid: rows are a project plus a task, columns are
 * Monday–Sunday, and the last row is the column totals.
 *
 * A cell shows the sum of its entries. Typing into an empty cell creates one
 * hours-only entry. Editing a cell changes the last entry so the sum matches
 * what was typed; earlier entries in the cell stay as they are.
 */

import { isEntryLocked, lockReason, type LockableEntry, type LockReasonCode, type LockSettings } from "./timeLock.ts";
import { entrySeconds, weekDays, type TimeEntry } from "./timeTracking.ts";

export interface TimesheetRowKey {
  projectId: string | null;
  taskId: string | null;
  userId?: string | null;
}

const SEP = "\u0001";

export const timesheetKey = (row: TimesheetRowKey, byPerson: boolean): string => {
  const base = `${row.projectId ?? ""}${SEP}${row.taskId ?? ""}`;
  return byPerson ? `${row.userId ?? ""}${SEP}${base}` : base;
};

export interface TimesheetCell {
  day: string;
  entryIds: string[];
  /** The entry an edit writes. Null when the cell is empty or only a timer is running. */
  lastId: string | null;
  seconds: number;
}

export interface TimesheetRow {
  projectId: string | null;
  taskId: string | null;
  userId: string | null;
  cells: TimesheetCell[];
  totalSec: number;
}

export interface TimesheetModel {
  /** Monday through Sunday. */
  days: string[];
  rows: TimesheetRow[];
  columnTotals: number[];
  grandTotal: number;
}

const cmpId = (a: string | null | undefined, b: string | null | undefined): number => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
};

/** The last entry of a cell: latest start, else latest created. A running timer is not editable. */
export const lastCellEntry = <T extends { id: string; createdAt: string; startAt: string | null; running?: boolean }>(
  entries: readonly T[],
): T | null => {
  const list = entries.filter((e) => !e.running);
  if (list.length === 0) return null;
  return [...list].sort((a, b) => {
    const start = (a.startAt ?? "").localeCompare(b.startAt ?? "");
    if (start !== 0) return start;
    const created = a.createdAt.localeCompare(b.createdAt);
    if (created !== 0) return created;
    return a.id.localeCompare(b.id);
  })[list.length - 1];
};

export const buildTimesheet = (
  entries: readonly TimeEntry[],
  anchor: string,
  nowMs: number,
  options?: { extraRows?: readonly TimesheetRowKey[]; byPerson?: boolean },
): TimesheetModel => {
  const days = weekDays(anchor);
  const byPerson = options?.byPerson === true;
  const daySet = new Set(days);
  const groups = new Map<string, { key: TimesheetRowKey; entries: TimeEntry[] }>();

  const ensure = (key: TimesheetRowKey) => {
    const id = timesheetKey(key, byPerson);
    const existing = groups.get(id);
    if (existing) return existing;
    const created = { key: { projectId: key.projectId, taskId: key.taskId, userId: byPerson ? key.userId ?? null : null }, entries: [] as TimeEntry[] };
    groups.set(id, created);
    return created;
  };

  for (const entry of entries) {
    if (!daySet.has(entry.entryDate)) continue;
    ensure({ projectId: entry.projectId, taskId: entry.taskId, userId: entry.userId }).entries.push(entry);
  }
  for (const extra of options?.extraRows ?? []) ensure(extra);

  const rows: TimesheetRow[] = [...groups.values()]
    .sort((a, b) => cmpId(a.key.userId, b.key.userId) || cmpId(a.key.projectId, b.key.projectId) || cmpId(a.key.taskId, b.key.taskId))
    .map((group) => {
      const cells = days.map((day) => {
        const cellEntries = group.entries.filter((e) => e.entryDate === day);
        const last = lastCellEntry(cellEntries);
        return {
          day,
          entryIds: cellEntries.map((e) => e.id),
          lastId: last?.id ?? null,
          seconds: cellEntries.reduce((sum, e) => sum + entrySeconds(e, nowMs), 0),
        };
      });
      return {
        projectId: group.key.projectId,
        taskId: group.key.taskId,
        userId: group.key.userId ?? null,
        cells,
        totalSec: cells.reduce((sum, cell) => sum + cell.seconds, 0),
      };
    });

  const columnTotals = days.map((_, index) => rows.reduce((sum, row) => sum + row.cells[index].seconds, 0));
  return {
    days,
    rows,
    columnTotals,
    grandTotal: columnTotals.reduce((sum, n) => sum + n, 0),
  };
};

export type CellEdit =
  | { action: "noop"; reason: "empty" | "running" | "overflow" }
  | { action: "create"; durationSec: number; entryDate: string; projectId: string | null; taskId: string | null; userId: string | null }
  | { action: "update"; id: string; durationSec: number };

/**
 * `typedSec` is the new total of the cell. The last entry absorbs the
 * difference. A total that cannot be reached without erasing that entry
 * (the earlier ones already exceed it) is refused.
 */
export const editCell = (
  cellEntries: readonly TimeEntry[],
  typedSec: number | null,
  row: TimesheetRowKey,
  day: string,
): CellEdit => {
  if (typedSec == null || typedSec <= 0) return { action: "noop", reason: "empty" };
  const ordered = [...cellEntries]
    .filter((e) => !e.running)
    .sort((a, b) => {
      const start = (a.startAt ?? "").localeCompare(b.startAt ?? "");
      if (start !== 0) return start;
      const created = a.createdAt.localeCompare(b.createdAt);
      return created !== 0 ? created : a.id.localeCompare(b.id);
    });
  if (ordered.length === 0) {
    if (cellEntries.some((e) => e.running)) return { action: "noop", reason: "running" };
    return {
      action: "create",
      durationSec: typedSec,
      entryDate: day,
      projectId: row.projectId,
      taskId: row.taskId,
      userId: row.userId ?? null,
    };
  }
  const last = ordered[ordered.length - 1];
  const others = ordered.slice(0, -1).reduce((sum, e) => sum + (e.durationSec ?? 0), 0);
  const next = typedSec - others;
  if (next <= 0) return { action: "noop", reason: "overflow" };
  return { action: "update", id: last.id, durationSec: next };
};

/**
 * Whether typing in this cell must not start.
 * A cell with entries is locked when the entry an edit would change (the last
 * one) is locked. An empty cell is locked when a new hours-only entry on that
 * day would be locked — including a paid payroll month. Admins are not locked.
 */
export const timesheetCellLock = (
  entries: readonly TimeEntry[],
  day: string,
  settings: LockSettings,
  nowIso: string,
): { locked: boolean; reason: LockReasonCode | null } => {
  const last = lastCellEntry(entries);
  const subject: LockableEntry = last
    ? { entryDate: last.entryDate || day, approvalStatus: last.approvalStatus, running: false }
    : { entryDate: day, approvalStatus: null, running: false };
  return {
    locked: isEntryLocked(subject, settings, nowIso),
    reason: lockReason(subject, settings, nowIso),
  };
};

/**
 * A timed entry's duration change moves its end by the same UTC seconds, so a
 * DST boundary does not stretch the clock to match. Hours-only entries carry
 * no end.
 */
export const durationPatch = (
  entry: { startAt: string | null },
  durationSec: number,
): { durationSec: number; endAt?: string } => {
  if (!entry.startAt) return { durationSec };
  const startMs = Date.parse(entry.startAt);
  if (!Number.isFinite(startMs)) return { durationSec };
  return { durationSec, endAt: new Date(startMs + durationSec * 1000).toISOString() };
};

/** Row keys present last week and missing from this week. Hours are not copied. */
export const copyRowKeys = (
  previous: readonly TimesheetRowKey[],
  current: readonly TimesheetRowKey[],
  byPerson: boolean,
): TimesheetRowKey[] => {
  const have = new Set(current.map((row) => timesheetKey(row, byPerson)));
  const seen = new Set<string>();
  const out: TimesheetRowKey[] = [];
  for (const row of previous) {
    const key = timesheetKey(row, byPerson);
    if (have.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ projectId: row.projectId, taskId: row.taskId, userId: byPerson ? row.userId ?? null : null });
  }
  return out;
};

export const rowExists = (rows: readonly TimesheetRowKey[], row: TimesheetRowKey, byPerson: boolean): boolean =>
  rows.some((existing) => timesheetKey(existing, byPerson) === timesheetKey(row, byPerson));
