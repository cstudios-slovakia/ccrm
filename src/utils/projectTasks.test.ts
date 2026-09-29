import assert from "node:assert/strict";
import test from "node:test";
import type { Task } from "../types";
import {
  buildProjectTasks,
  computeTaskDateRange,
  isDoneTaskState,
  isTaskInDateRange,
  parseTaskLines,
  splitFilteredTasks,
  splitProjectTasks,
  toggleTaskDone,
} from "./projectTasks.ts";

const STATES = ["New", "In progress", "Blocked", "Done"];

const task = (over: Partial<Task>): Task => ({
  id: "t",
  title: "Task",
  description: "",
  status: "New",
  priority: "medium",
  deadline: "2026-09-20",
  owner: "Sam",
  assignedUsers: ["Sam"],
  ...over,
});

test("parseTaskLines: one task per non-empty line, trimmed", () => {
  assert.deepEqual(parseTaskLines("  Call client \n\n Order tiles\r\nSend offer  "), [
    "Call client",
    "Order tiles",
    "Send offer",
  ]);
});

test("parseTaskLines: drops pasted list markers but keeps the text", () => {
  assert.deepEqual(parseTaskLines("- one\n* two\n• three\n1. four\n2) five\n[ ] six\n- [x] seven"), [
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
  ]);
  // A number that is part of the title, not a marker, stays.
  assert.deepEqual(parseTaskLines("3 windows to measure"), ["3 windows to measure"]);
});

test("parseTaskLines: nothing typed means no tasks", () => {
  assert.deepEqual(parseTaskLines(" \n \n"), []);
});

test("parseTaskLines: caps a title at the column width", () => {
  assert.equal(parseTaskLines("x".repeat(400))[0].length, 255);
});

test("buildProjectTasks: links every task to the project with distinct ids", () => {
  const built = buildProjectTasks(
    ["A", "B"],
    {
      projectId: "project-1",
      status: "New",
      deadline: "2026-09-15",
      deadlineTime: "16:00",
      assignee: "Sam",
      createdBy: "Alex",
      startDate: "2026-09-15",
    },
    1000,
  );
  assert.equal(built.length, 2);
  assert.notEqual(built[0].id, built[1].id);
  assert.ok(built.every((t) => t.relatedProjectId === "project-1"));
  assert.deepEqual(built[0].assignedUsers, ["Sam"]);
  assert.equal(built[0].owner, "Sam");
  assert.equal(built[0].createdBy, "Alex");
  assert.equal(built[1].title, "B");
});

test("buildProjectTasks: an unassigned task has no assignees", () => {
  const [built] = buildProjectTasks(["A"], {
    projectId: "p",
    status: "New",
    deadline: "2026-09-15",
    deadlineTime: "",
    assignee: "",
    createdBy: "Alex",
    startDate: "",
  });
  assert.deepEqual(built.assignedUsers, []);
  assert.equal(built.deadlineTime, undefined);
});

test("splitProjectTasks: only the project's tasks, open by deadline, finished apart", () => {
  const tasks = [
    task({ id: "late", deadline: "2026-09-30", relatedProjectId: "p" }),
    task({ id: "soon", deadline: "2026-09-16", relatedProjectId: "p" }),
    task({ id: "soon-morning", deadline: "2026-09-16", deadlineTime: "09:00", relatedProjectId: "p" }),
    task({ id: "done", status: "Done", relatedProjectId: "p" }),
    task({ id: "archived", archived: true, relatedProjectId: "p" }),
    task({ id: "other", relatedProjectId: "q" }),
    task({ id: "none" }),
  ];
  const { open, finished } = splitProjectTasks(tasks, "p", STATES);
  assert.deepEqual(open.map((t) => t.id), ["soon-morning", "soon", "late"]);
  assert.deepEqual(finished.map((t) => t.id).sort(), ["archived", "done"]);
});

test("toggleTaskDone: finishing records who and when, reopening clears it", () => {
  const now = new Date(2026, 8, 15, 14, 5);
  const done = toggleTaskDone(task({}), STATES, "Alex", now);
  assert.equal(done.status, "Done");
  assert.equal(done.completedBy, "Alex");
  assert.equal(done.completedAt, "2026-09-15 14:05");
  assert.ok(isDoneTaskState(done.status, STATES));

  const reopened = toggleTaskDone(done, STATES, "Alex", now);
  assert.equal(reopened.status, "New");
  assert.equal(reopened.completedBy, undefined);
  assert.equal(reopened.completedAt, undefined);
});

test("toggleTaskDone: custom states finish on the last one", () => {
  const states = ["Open", "Working", "Closed"];
  assert.equal(toggleTaskDone(task({ status: "Open" }), states, "Alex").status, "Closed");
});

test("computeTaskDateRange: computes presets accurately", () => {
  // Tuesday Sep 29, 2026
  const ref = new Date(2026, 8, 29, 12, 0);

  // All
  assert.deepEqual(computeTaskDateRange("all", ref), { start: null, end: null });

  // Last week: Monday Sep 21 to Sunday Sep 27
  assert.deepEqual(computeTaskDateRange("last_week", ref), { start: "2026-09-21", end: "2026-09-27" });

  // Last month: Aug 1 to Aug 31
  assert.deepEqual(computeTaskDateRange("last_month", ref), { start: "2026-08-01", end: "2026-08-31" });

  // Last quarter: Q2 (April 1 to June 30) since September is Q3
  assert.deepEqual(computeTaskDateRange("last_quarter", ref), { start: "2026-04-01", end: "2026-06-30" });

  // Last year to date: Jan 1 2025 to Sep 29 2026
  assert.deepEqual(computeTaskDateRange("last_year_to_date", ref), { start: "2025-01-01", end: "2026-09-29" });
});

test("isTaskInDateRange: filters tasks by deadline, completedAt or startDate", () => {
  const ref = new Date(2026, 8, 29, 12, 0);

  const t1 = task({ id: "1", deadline: "2026-09-23" }); // last week
  const t2 = task({ id: "2", deadline: "2026-09-29" }); // today
  const t3 = task({ id: "3", deadline: "2026-08-15" }); // last month
  const t4 = task({ id: "4", deadline: "2026-05-10" }); // last quarter
  const t5 = task({ id: "5", deadline: "2025-06-15" }); // last year

  // all
  assert.ok(isTaskInDateRange(t1, "all", undefined, undefined, ref));
  assert.ok(isTaskInDateRange(t2, "all", undefined, undefined, ref));

  // last_week
  assert.ok(isTaskInDateRange(t1, "last_week", undefined, undefined, ref));
  assert.ok(!isTaskInDateRange(t2, "last_week", undefined, undefined, ref));
  assert.ok(!isTaskInDateRange(t3, "last_week", undefined, undefined, ref));

  // last_month
  assert.ok(isTaskInDateRange(t3, "last_month", undefined, undefined, ref));
  assert.ok(!isTaskInDateRange(t1, "last_month", undefined, undefined, ref));

  // last_quarter
  assert.ok(isTaskInDateRange(t4, "last_quarter", undefined, undefined, ref));
  assert.ok(!isTaskInDateRange(t1, "last_quarter", undefined, undefined, ref));

  // last_year_to_date
  assert.ok(isTaskInDateRange(t5, "last_year_to_date", undefined, undefined, ref));
  assert.ok(isTaskInDateRange(t3, "last_year_to_date", undefined, undefined, ref));
  assert.ok(isTaskInDateRange(t2, "last_year_to_date", undefined, undefined, ref));

  // custom interval
  assert.ok(isTaskInDateRange(t1, "custom", "2026-09-20", "2026-09-25", ref));
  assert.ok(!isTaskInDateRange(t2, "custom", "2026-09-20", "2026-09-25", ref));

  // completedAt match
  const tCompleted = task({ id: "comp", deadline: "2026-07-01", completedAt: "2026-09-23 15:30" });
  assert.ok(isTaskInDateRange(tCompleted, "last_week", undefined, undefined, ref));
});

test("splitFilteredTasks: splits tasks into open and finished buckets with filter", () => {
  const ref = new Date(2026, 8, 29, 12, 0);
  const tasks = [
    task({ id: "t1", deadline: "2026-09-23", status: "New" }),
    task({ id: "t2", deadline: "2026-09-24", status: "Done", completedAt: "2026-09-24 10:00" }),
    task({ id: "t3", deadline: "2026-09-29", status: "New" }),
  ];

  const resLastWeek = splitFilteredTasks(tasks, STATES, "last_week", undefined, undefined, ref);
  assert.deepEqual(resLastWeek.open.map((t) => t.id), ["t1"]);
  assert.deepEqual(resLastWeek.finished.map((t) => t.id), ["t2"]);
  assert.equal(resLastWeek.totalCount, 2);

  const resAll = splitFilteredTasks(tasks, STATES, "all", undefined, undefined, ref);
  assert.deepEqual(resAll.open.map((t) => t.id), ["t1", "t3"]);
  assert.deepEqual(resAll.finished.map((t) => t.id), ["t2"]);
  assert.equal(resAll.totalCount, 3);
});

