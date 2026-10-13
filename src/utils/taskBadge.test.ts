import assert from "node:assert/strict";
import test from "node:test";
import type { Task } from "../types";
import { countBadgeTasks } from "./taskBadge.ts";

const STATES = ["New", "In progress", "Blocked", "Done"];
// Monday 12 Oct 2026, 10:30 local time
const NOW = new Date(2026, 9, 12, 10, 30);

let n = 0;
const task = (over: Partial<Task>): Task =>
  ({
    id: `t${++n}`,
    title: "t",
    status: "New",
    priority: "medium",
    deadline: "2026-10-12",
    assignedUsers: ["Erik"],
    createdBy: "Erik",
    ...over,
  }) as Task;

test("counts missed and today separately and in total", () => {
  const tasks = [
    task({ deadline: "2026-10-10" }),
    task({ deadline: "2026-10-11" }),
    task({ deadline: "2026-10-12", deadlineTime: "16:00" }),
    task({ deadline: "2026-10-13" }),
  ];
  assert.deepEqual(countBadgeTasks(tasks, "Erik", STATES, NOW), { missed: 2, today: 1, total: 3 });
});

test("a task due today whose time has passed is missed, not today", () => {
  const tasks = [task({ deadlineTime: "09:00" }), task({ deadlineTime: "11:00" }), task({ deadlineTime: undefined })];
  assert.deepEqual(countBadgeTasks(tasks, "Erik", STATES, NOW), { missed: 1, today: 2, total: 3 });
});

test("done, archived and other people's tasks never count", () => {
  const tasks = [
    task({ status: "Done" }),
    task({ status: "done" }),
    task({ archived: true }),
    task({ assignedUsers: ["Mária"], createdBy: "Mária" }),
  ];
  assert.equal(countBadgeTasks(tasks, "Erik", STATES, NOW).total, 0);
});

test("tasks the user created for someone else still count, like on the My Tasks board", () => {
  const tasks = [task({ assignedUsers: ["Mária"], createdBy: "Erik" })];
  assert.equal(countBadgeTasks(tasks, "Erik", STATES, NOW).total, 1);
});

test("no tasks, no user and no deadline are all zero", () => {
  assert.equal(countBadgeTasks([], "Erik", STATES, NOW).total, 0);
  assert.equal(countBadgeTasks([task({})], "", STATES, NOW).total, 0);
  assert.equal(countBadgeTasks([task({ deadline: "" as unknown as string })], "Erik", STATES, NOW).total, 0);
});
