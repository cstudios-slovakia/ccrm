import assert from "node:assert/strict";
import test from "node:test";
import type { Task, UserProfile } from "../types";
import {
  canDeleteTask,
  canEditTask,
  canViewTask,
  isActiveTask,
  isTaskAssignedTo,
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
const fullAccess = { view: true, create: true, edit: true, delete: true };
const normalAccess = { view: true, create: true, edit: true, delete: false };

test("assignment is the only source of personal-calendar membership", () => {
  assert.equal(isTaskAssignedTo(task, "Sam"), true);
  assert.equal(isTaskAssignedTo(task, "Alex"), false);
  assert.equal(canViewTask(task, alex, false), false);
  assert.equal(canViewTask(task, sam, false), true);
  assert.equal(canViewTask(task, admin, true), true);
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
