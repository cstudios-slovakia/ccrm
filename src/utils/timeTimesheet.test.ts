import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTimesheet,
  copyRowKeys,
  durationPatch,
  editCell,
  lastCellEntry,
  rowExists,
  timesheetCellLock,
  type TimesheetRowKey,
} from "./timeTimesheet.ts";
import type { LockSettings } from "./timeLock.ts";
import type { TimeEntry } from "./timeTracking.ts";

const entry = (over: Partial<TimeEntry> = {}): TimeEntry => ({
  id: "te-1",
  userId: "u1",
  recordedByUserId: "u1",
  employeeId: null,
  projectId: "p1",
  taskId: "t1",
  ticketId: null,
  title: "Work",
  titleSource: "task",
  titleDeleted: false,
  description: null,
  legacyNote: null,
  note: null,
  entryDate: "2026-10-26",
  startAt: null,
  endAt: null,
  durationSec: 3600,
  running: false,
  billable: true,
  tags: [],
  source: "timesheet",
  originType: null,
  originId: null,
  approvalStatus: null,
  createdAt: "2026-10-26T08:00:00.000Z",
  ...over,
});

const key = (row: TimesheetRow): TimesheetRowKey => ({ projectId: row.projectId, taskId: row.taskId, userId: row.userId });

interface TimesheetRow {
  projectId: string | null;
  taskId: string | null;
  userId: string | null;
}

test("the grid is Monday–Sunday, one row per project and task, and the totals row sums hours", () => {
  const entries = [
    entry({ id: "a", entryDate: "2026-10-26", durationSec: 3600, createdAt: "2026-10-26T08:00:00.000Z" }),
    entry({ id: "b", entryDate: "2026-10-26", durationSec: 1800, createdAt: "2026-10-26T12:00:00.000Z" }),
    entry({ id: "c", entryDate: "2026-10-27", durationSec: 7200, projectId: "p1", taskId: "t1" }),
    entry({ id: "d", entryDate: "2026-10-28", durationSec: 3600, projectId: "p2", taskId: null }),
    entry({ id: "outside", entryDate: "2026-10-19", durationSec: 9999 }),
  ];
  const sheet = buildTimesheet(entries, "2026-10-27", Date.parse("2026-10-27T12:00:00.000Z"));
  assert.deepEqual(sheet.days, ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  assert.equal(sheet.rows.length, 2);
  const projectTask = sheet.rows.find((r) => r.projectId === "p1" && r.taskId === "t1")!;
  const projectOnly = sheet.rows.find((r) => r.projectId === "p2")!;
  assert.equal(projectTask.cells[0].seconds, 5400);
  assert.deepEqual(projectTask.cells[0].entryIds.sort(), ["a", "b"]);
  assert.equal(projectTask.cells[0].lastId, "b");
  assert.equal(projectTask.cells[1].seconds, 7200);
  assert.equal(projectTask.totalSec, 5400 + 7200);
  assert.equal(projectOnly.cells[2].seconds, 3600);
  assert.equal(sheet.columnTotals[0], 5400);
  assert.equal(sheet.columnTotals[1], 7200);
  assert.equal(sheet.columnTotals[2], 3600);
  assert.equal(sheet.columnTotals[3], 0);
  assert.equal(sheet.grandTotal, 5400 + 7200 + 3600);
  assert.equal(sheet.columnTotals.reduce((s, n) => s + n, 0), sheet.grandTotal);
});

test("an empty cell creates an hours-only entry, and an edit adjusts the last entry so the total matches", () => {
  const first = entry({ id: "a", durationSec: 3600, createdAt: "2026-10-26T08:00:00.000Z" });
  const last = entry({ id: "b", durationSec: 1800, createdAt: "2026-10-26T18:00:00.000Z" });
  assert.equal(lastCellEntry([first, last])?.id, "b");
  const row = { projectId: "p1", taskId: "t1", userId: "u1" };
  const created = editCell([], 5400, row, "2026-10-26");
  assert.equal(created.action, "create");
  if (created.action === "create") {
    assert.equal(created.durationSec, 5400);
    assert.equal(created.entryDate, "2026-10-26");
    assert.equal(created.projectId, "p1");
    assert.equal(created.taskId, "t1");
  }
  const updated = editCell([first, last], 7200, row, "2026-10-26");
  assert.deepEqual(updated, { action: "update", id: "b", durationSec: 3600 });
  const overflow = editCell([first, last], 1800, row, "2026-10-26");
  assert.deepEqual(overflow, { action: "noop", reason: "overflow" });
  assert.deepEqual(editCell([], null, row, "2026-10-26"), { action: "noop", reason: "empty" });
  const running = entry({ id: "run", running: true, startAt: "2026-10-26T10:00:00.000Z", durationSec: null });
  assert.equal(editCell([running], 3600, row, "2026-10-26").action, "noop");
});

test("a timed entry's new duration moves its end by UTC seconds; an hours-only entry has no end", () => {
  const hours = durationPatch({ startAt: null }, 5400);
  assert.deepEqual(hours, { durationSec: 5400 });
  assert.equal("endAt" in hours, false);
  const start = "2026-10-26T08:00:00.000Z";
  const timed = durationPatch({ startAt: start }, 5400);
  assert.equal(timed.durationSec, 5400);
  assert.equal(Date.parse(timed.endAt!) - Date.parse(start), 5400 * 1000);
});

test("copy rows from last week adds the missing project-and-task pairs and does not copy hours", () => {
  const previous = [
    { projectId: "p1", taskId: "t1", userId: "u1" },
    { projectId: "p2", taskId: null, userId: "u1" },
    { projectId: "p1", taskId: "t1", userId: "u1" },
  ];
  const current = [{ projectId: "p1", taskId: "t1", userId: "u1" }];
  const copied = copyRowKeys(previous, current, false);
  assert.deepEqual(copied, [{ projectId: "p2", taskId: null, userId: null }]);
  assert.equal(rowExists([...current, ...copied], { projectId: "p2", taskId: null }, false), true);
  assert.equal(rowExists(current, { projectId: "p2", taskId: "other" }, false), false);
});

test("a paid payroll month locks a timesheet cell and an unpaid month does not", () => {
  const now = "2026-10-27";
  const row = entry({ entryDate: "2026-05-04", durationSec: 3600 });
  const paid: LockSettings = { lockAfterDays: null, paidPayrollMonths: ["2026-05"], isAdmin: false };
  const unpaid: LockSettings = { ...paid, paidPayrollMonths: ["2026-04"] };
  const existing = timesheetCellLock([row], "2026-05-04", paid, now);
  assert.equal(existing.locked, true);
  assert.equal(existing.reason, "paid_payroll");
  const emptyPaid = timesheetCellLock([], "2026-05-04", paid, now);
  assert.equal(emptyPaid.locked, true);
  assert.equal(emptyPaid.reason, "paid_payroll");
  assert.equal(timesheetCellLock([row], "2026-05-04", unpaid, now).locked, false);
  assert.equal(timesheetCellLock([], "2026-05-20", unpaid, now).locked, false);
  assert.equal(timesheetCellLock([row], "2026-05-04", { ...paid, isAdmin: true }, now).locked, false);
  assert.equal(timesheetCellLock([row], "2026-05-04", { ...paid, isAdmin: true }, now).reason, "paid_payroll");
});

test("an extra empty row is kept, and the whole team splits rows by person", () => {
  const sheet = buildTimesheet([], "2026-10-26", 0, { extraRows: [{ projectId: "p9", taskId: null }] });
  assert.equal(sheet.rows.length, 1);
  assert.equal(sheet.rows[0].projectId, "p9");
  assert.equal(sheet.rows[0].totalSec, 0);
  assert.equal(sheet.grandTotal, 0);
  const team = buildTimesheet(
    [
      entry({ id: "a", userId: "u1", durationSec: 3600 }),
      entry({ id: "b", userId: "u2", durationSec: 1800, projectId: "p1", taskId: "t1" }),
    ],
    "2026-10-26",
    0,
    { byPerson: true },
  );
  assert.equal(team.rows.length, 2);
  assert.equal(team.grandTotal, 5400);
  const keys = team.rows.map(key);
  assert.equal(copyRowKeys(keys, [keys[0]], true).length, 1);
});
