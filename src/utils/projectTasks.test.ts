import assert from "node:assert/strict";
import test from "node:test";
import type { Task } from "../types";
import {
  buildProjectTasks,
  isDoneTaskState,
  parseTaskLines,
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
