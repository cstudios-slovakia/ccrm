import test from "node:test";
import assert from "node:assert/strict";
import { budgetUsedPercent, projectPeriodRange, timeByTask, weeklyByPerson } from "./projectTimeStats.ts";

test("all time and an incomplete custom range cover everything", () => {
  assert.deepEqual(projectPeriodRange("all", "2026-11-20", "", ""), { from: "2000-01-01", to: "2100-01-01", invalid: false });
  assert.deepEqual(projectPeriodRange("custom", "2026-11-20", "", ""), { from: "2000-01-01", to: "2100-01-01", invalid: false });
  assert.deepEqual(projectPeriodRange("custom", "2026-11-20", "2026-11-01", ""), { from: "2026-11-01", to: "2100-01-01", invalid: false });
  assert.deepEqual(projectPeriodRange("custom", "2026-11-20", "2026-11-01", "2026-11-09"), { from: "2026-11-01", to: "2026-11-09", invalid: false });
  assert.equal(projectPeriodRange("custom", "2026-11-20", "2026-11-09", "2026-11-01").invalid, true);
});

test("this and last month are calendar months", () => {
  assert.deepEqual(projectPeriodRange("thisMonth", "2026-11-20", "", ""), { from: "2026-11-01", to: "2026-11-30", invalid: false });
  assert.deepEqual(projectPeriodRange("lastMonth", "2026-11-20", "", ""), { from: "2026-10-01", to: "2026-10-31", invalid: false });
});

test("weeks end at today, stack by person and ignore time outside them", () => {
  const range = { from: "2000-01-01", to: "2100-01-01" };
  const lines = [
    { userId: "a", entryDate: "2026-11-17", seconds: 3600 },
    { userId: "b", entryDate: "2026-11-18", seconds: 1800 },
    { userId: "a", entryDate: "2026-11-10", seconds: 600 },
    { userId: "a", entryDate: "2025-01-01", seconds: 9999 },
  ];
  const { weeks, people } = weeklyByPerson(lines, range, "2026-11-20", 10);
  assert.equal(weeks.length, 10);
  assert.equal(weeks.at(-1)?.start, "2026-11-16");
  assert.deepEqual(weeks.at(-1)?.byUser, { a: 3600, b: 1800 });
  assert.deepEqual(weeks.at(-2)?.byUser, { a: 600 });
  assert.deepEqual(people, [{ userId: "a", seconds: 4200 }, { userId: "b", seconds: 1800 }]);
});

test("a week that spans New Year is one bucket", () => {
  const lines = [
    { userId: "a", entryDate: "2026-12-31", seconds: 100 },
    { userId: "a", entryDate: "2027-01-01", seconds: 200 },
  ];
  const { weeks } = weeklyByPerson(lines, { from: "2000-01-01", to: "2100-01-01" }, "2027-01-02", 3);
  assert.deepEqual(weeks.map((w) => w.start), ["2026-12-14", "2026-12-21", "2026-12-28"]);
  assert.deepEqual(weeks[2].byUser, { a: 300 });
});

test("a short period shows only its own weeks", () => {
  const { weeks } = weeklyByPerson([], { from: "2026-11-03", to: "2026-11-20" }, "2026-11-20", 10);
  assert.deepEqual(weeks.map((w) => w.start), ["2026-11-02", "2026-11-09", "2026-11-16"]);
});

test("by task: estimate only where the task has one, time without a task kept apart", () => {
  const tasks: Record<string, { title: string; estimateMinutes?: number | null }> = { t1: { title: "Design", estimateMinutes: 120 }, t2: { title: "Build" } };
  const rows = timeByTask(
    [
      { taskId: "t1", title: "x", seconds: 3600 },
      { taskId: "t1", title: "x", seconds: 1800 },
      { taskId: "t2", title: "x", seconds: 7200 },
      { taskId: null, title: "Call", seconds: 60 },
      { taskId: "t2", title: "x", seconds: 0 },
    ],
    (id) => tasks[id],
  );
  assert.deepEqual(rows.map((r) => [r.title, r.seconds, r.estimateSec]), [["Build", 7200, null], ["Design", 5400, 7200], ["Call", 60, null]]);
});

test("budget share rounds and may pass 100", () => {
  assert.equal(budgetUsedPercent(3600 * 5, 10), 50);
  assert.equal(budgetUsedPercent(3600 * 12, 10), 120);
  assert.equal(budgetUsedPercent(3600, null), null);
  assert.equal(budgetUsedPercent(3600, 0), null);
});
