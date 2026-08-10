import assert from "node:assert/strict";
import test from "node:test";
import type { Task, UserProfile } from "../types";
import {
  canDeleteTask,
  canEditTask,
  canViewTask,
  isActiveTask,
  isOnPersonalDashboard,
  isTaskAssignedTo,
  resolveAssigneeName,
  resolveTaskViewAll,
} from "./taskSelectors.ts";

const admin: UserProfile = { name: "Ada", email: "ada@example.com", role: "Admin", color: "#000" };
const alex: UserProfile = { name: "Alex", email: "alex@example.com", role: "Project Manager", color: "#111" };
const sam: UserProfile = { name: "Sam", email: "sam@example.com", role: "Project Manager", color: "#222" };
const task: Task = {
  id: "task-1",
  title: "Follow up",
  description: "",
  status: "New",
  priority: "medium",
  deadline: "2026-07-24",
  owner: "Sam",
  createdBy: "Alex",
  assignedUsers: ["Sam"],
};
const fullAccess = { view: true, create: true, edit: true, delete: true, viewAll: true };
const normalAccess = { view: true, create: true, edit: true, delete: false, viewAll: true };

test("assignment decides who a task belongs to", () => {
  assert.equal(isTaskAssignedTo(task, "Sam"), true);
  assert.equal(isTaskAssignedTo(task, "Alex"), false);
  assert.equal(canViewTask(task, alex, false), false);
  assert.equal(canViewTask(task, sam, false), true);
  assert.equal(canViewTask(task, admin, true), true);
});

test("the personal dashboard holds assigned tasks and ones you created", () => {
  // Assigned to Sam, created by Alex: on both their calendars, nobody else's.
  assert.equal(isOnPersonalDashboard(task, "Sam"), true);
  assert.equal(isOnPersonalDashboard(task, "Alex"), true);
  assert.equal(isOnPersonalDashboard(task, "Ada"), false);
  // Legacy rows predate createdBy, so assignment is all there is to go on.
  assert.equal(
    isOnPersonalDashboard({ ...task, createdBy: undefined }, "Alex"),
    false,
  );
  // An empty name must never match a task with no creator or no assignees.
  assert.equal(
    isOnPersonalDashboard({ ...task, createdBy: "", assignedUsers: [] }, ""),
    false,
  );
});

test("active tasks exclude done and manually archived tasks", () => {
  const isDone = (status: string) => status === "Done";
  assert.equal(isActiveTask(task, isDone), true);
  assert.equal(isActiveTask({ ...task, status: "Done" }, isDone), false);
  assert.equal(isActiveTask({ ...task, archived: true }, isDone), false);
});

test("edit access is scoped to administrators, assignees, and creators", () => {
  assert.equal(canEditTask(task, admin, fullAccess), true);
  assert.equal(canEditTask(task, sam, normalAccess), true);
  assert.equal(canEditTask(task, alex, normalAccess), true);
  assert.equal(canEditTask(task, sam, { ...normalAccess, edit: false }), false);
});

test("delete access allows admins, explicit permission, or the creator", () => {
  assert.equal(canDeleteTask(task, admin, normalAccess), true);
  assert.equal(canDeleteTask(task, alex, normalAccess), true);
  assert.equal(canDeleteTask(task, sam, normalAccess), false);
  assert.equal(canDeleteTask(task, sam, fullAccess), true);
});

test("legacy tasks without createdBy remain deletable by their assignee", () => {
  assert.equal(canDeleteTask({ ...task, createdBy: undefined }, sam, normalAccess), true);
});

test("the team-wide task board is on for every role until it is revoked", () => {
  // No RBAC record at all, or one that never mentions the slug: everyone sees
  // the team's workload. This is the whole point of the 1.6.48 change — before
  // it, only the Admin role did.
  assert.equal(resolveTaskViewAll(undefined, false), true);
  assert.equal(resolveTaskViewAll({}, false), true);
  assert.equal(resolveTaskViewAll({ "tasks.view": "view" }, false), true);
  // Granted explicitly, in either of the two "allowed" states.
  assert.equal(resolveTaskViewAll({ "tasks.view_all": "view" }, false), true);
  assert.equal(resolveTaskViewAll({ "tasks.view_all": "edit" }, false), true);
  // Revoked: the board narrows back to the user's own tasks.
  assert.equal(resolveTaskViewAll({ "tasks.view_all": "nothing" }, false), false);
  // An administrator keeps the board whatever the record says.
  assert.equal(resolveTaskViewAll({ "tasks.view_all": "nothing" }, true), true);
});

test("an assignee is resolved to a real user so a task never lands in nobody's calendar", () => {
  const users = ["Ada", "Alex", "Sam"];
  // A registered preference wins, whoever asked for it.
  assert.equal(resolveAssigneeName("Sam", "Alex", users), "Sam");
  // A lead owner who is no longer a user (renamed, removed) falls back to the
  // creator instead of hiding the task from every calendar in the app.
  assert.equal(resolveAssigneeName("Old Owner", "Alex", users), "Alex");
  assert.equal(resolveAssigneeName("", "Alex", users), "Alex");
  assert.equal(resolveAssigneeName(undefined, "Alex", users), "Alex");
  // Nothing usable on either side: the first registered user beats an empty
  // assignee list, which no view can surface.
  assert.equal(resolveAssigneeName("Old Owner", "", users), "Ada");
  assert.equal(resolveAssigneeName("Old Owner", undefined, []), "");
});
