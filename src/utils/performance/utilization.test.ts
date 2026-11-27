import test from "node:test";
import assert from "node:assert/strict";
import type { Employee, Task } from "../../types/index.ts";
import type { TimeEntry } from "../timeTracking.ts";
import { buildPeriod } from "./period.ts";
import { overviewEntryRange } from "./labour.ts";
import { computeUtilization } from "./utilization.ts";

const H = 3_600_000;
const NOW = new Date(2026, 10, 20, 15, 30); // 20 Nov 2026
const NOVEMBER = buildPeriod("month", null, null, NOW); // 1-20 Nov
const ALL = buildPeriod("all", null, null, NOW);

const entry = (id: string, over: Partial<TimeEntry> = {}): TimeEntry =>
  ({
    id,
    userId: "u1",
    employeeId: "e1",
    taskId: null,
    projectId: null,
    entryDate: "2026-11-10",
    startAt: "2026-11-10T08:00:00Z",
    durationSec: 3600,
    workedMs: H,
    running: false,
    ...over,
  }) as unknown as TimeEntry;
const task = (id: string, category: string | null = null): Pick<Task, "id" | "category"> => ({ id, category });
const employees = [
  { id: "e1", userId: "u1", name: "Anna" },
  { id: "e2", userId: "u2", name: "Boris" },
] as unknown as Employee[];
const tasks = [task("bug1", "bug"), task("bug2", "BUG"), task("feat", null), task("other", "docs")];

test("empty input: no rows, no share", () => {
  assert.deepEqual(computeUtilization({ entries: [], tasks, employees, period: NOVEMBER }), {
    bugMs: 0,
    totalMs: 0,
    sharePct: null,
    rows: [],
  });
});

test("per person and team; rows sorted by share, highest first; worked_ms and not duration_sec is summed", () => {
  const data = computeUtilization({
    entries: [
      entry("a1", { taskId: "bug1", workedMs: 2 * H, durationSec: 99_999 }), // Anna: 2 h bug
      entry("a2", { taskId: "feat", workedMs: 6 * H }), // Anna: 6 h other
      entry("b1", { employeeId: null, userId: "u2", taskId: "bug2", workedMs: 3 * H }), // Boris through userId: 3 h bug
      entry("b2", { employeeId: "e2", userId: "u2", taskId: "other", workedMs: H }), // Boris: 1 h other
    ],
    tasks,
    employees,
    period: NOVEMBER,
  });
  assert.equal(data.bugMs, 5 * H);
  assert.equal(data.totalMs, 12 * H);
  assert.equal(data.sharePct, (5 / 12) * 100);
  assert.deepEqual(data.rows, [
    { employeeId: "e2", name: "Boris", bugMs: 3 * H, totalMs: 4 * H, sharePct: 75 },
    { employeeId: "e1", name: "Anna", bugMs: 2 * H, totalMs: 8 * H, sharePct: 25 },
  ]);
});

test("time exists but no task is a bug: real zeros, rows with 0 %", () => {
  const data = computeUtilization({ entries: [entry("a1", { taskId: "feat" })], tasks, employees, period: NOVEMBER });
  assert.equal(data.sharePct, 0);
  assert.equal(data.totalMs, H);
  assert.deepEqual(data.rows, [{ employeeId: "e1", name: "Anna", bugMs: 0, totalMs: H, sharePct: 0 }]);
});

test("zero denominator: entries without worked time give no share and no row", () => {
  const data = computeUtilization({
    entries: [entry("z1", { workedMs: 0, taskId: "bug1" })],
    tasks,
    employees,
    period: NOVEMBER,
  });
  assert.equal(data.sharePct, null);
  assert.equal(data.totalMs, 0);
  assert.deepEqual(data.rows, []);
});

test("period boundary: first and last day are in, the day before and after are out", () => {
  const at = (id: string, entryDate: string) => entry(id, { entryDate, taskId: "bug1", workedMs: H });
  const data = computeUtilization({
    entries: [at("before", "2026-10-31"), at("first", "2026-11-01"), at("last", "2026-11-20"), at("after", "2026-11-21")],
    tasks,
    employees,
    period: NOVEMBER,
  });
  assert.equal(data.totalMs, 2 * H);
  assert.equal(data.bugMs, 2 * H);
});

test("period 'all' has no bounds", () => {
  const data = computeUtilization({
    entries: [entry("old", { entryDate: "2019-01-01" }), entry("new", { entryDate: "2026-12-31" })],
    tasks,
    employees,
    period: ALL,
  });
  assert.equal(data.totalMs, 2 * H);
});

test("an entry without a task is other work; a task id that is not in the list too", () => {
  const data = computeUtilization({
    entries: [entry("n1", { taskId: null }), entry("n2", { taskId: "deleted-task" }), entry("b", { taskId: "bug1" })],
    tasks,
    employees,
    period: NOVEMBER,
  });
  assert.equal(data.totalMs, 3 * H);
  assert.equal(data.bugMs, H);
});

test("a running entry (workedMs null) is ignored", () => {
  const data = computeUtilization({
    entries: [entry("run", { running: true, workedMs: null, endAt: null, durationSec: null, taskId: "bug1" }), entry("done", { taskId: "feat" })],
    tasks,
    employees,
    period: NOVEMBER,
  });
  assert.equal(data.totalMs, H);
  assert.equal(data.bugMs, 0);
});

test("someone the roster does not know counts for the team under their own id", () => {
  const data = computeUtilization({
    entries: [entry("x", { employeeId: null, userId: "u-gone", taskId: "bug1" })],
    tasks,
    employees,
    period: NOVEMBER,
  });
  assert.equal(data.totalMs, H);
  assert.deepEqual(data.rows, [{ employeeId: "u-gone", name: "u-gone", bugMs: H, totalMs: H, sharePct: 100 }]);
});

test("overviewEntryRange: the period or the last 30 days, whichever starts earlier, up to today", () => {
  assert.deepEqual(overviewEntryRange(NOVEMBER, NOW), { from: "2026-10-21", to: "2026-11-20" }); // 30 days back beats 1 Nov
  const year = buildPeriod("year", null, null, NOW);
  assert.deepEqual(overviewEntryRange(year, NOW), { from: "2026-01-01", to: "2026-11-20" });
  const past = buildPeriod("custom", new Date(2026, 0, 5), new Date(2026, 0, 20), NOW);
  assert.deepEqual(overviewEntryRange(past, NOW), { from: "2026-01-05", to: "2026-11-20" });
  assert.deepEqual(overviewEntryRange(ALL, NOW), { from: "2000-01-01", to: "2026-11-20" });
});
