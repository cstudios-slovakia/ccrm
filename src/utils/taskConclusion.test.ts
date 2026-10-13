import assert from "node:assert/strict";
import test from "node:test";
import type { Task } from "../types";
import {
  canUntickConclusion,
  cleanConclusion,
  hasConclusion,
  needsConclusionToFinish,
  normalizeTaskSettings,
} from "./taskConclusion.ts";
import { toggleTaskDone } from "./projectTasks.ts";

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

test("normalizeTaskSettings: offerConclusion is on by default, defaultRequiresConclusion is off by default", () => {
  assert.deepEqual(normalizeTaskSettings(undefined), { offerConclusion: true, defaultRequiresConclusion: false });
  assert.deepEqual(normalizeTaskSettings(null), { offerConclusion: true, defaultRequiresConclusion: false });
  assert.deepEqual(normalizeTaskSettings({}), { offerConclusion: true, defaultRequiresConclusion: false });
  assert.deepEqual(normalizeTaskSettings({ offerConclusion: "yes" }), { offerConclusion: false, defaultRequiresConclusion: false });
  assert.deepEqual(normalizeTaskSettings({ offerConclusion: true }), { offerConclusion: true, defaultRequiresConclusion: false });
  assert.deepEqual(normalizeTaskSettings({ offerConclusion: false }), { offerConclusion: false, defaultRequiresConclusion: false });
  assert.deepEqual(normalizeTaskSettings({ defaultRequiresConclusion: true }), { offerConclusion: true, defaultRequiresConclusion: true });
  assert.deepEqual(normalizeTaskSettings({ offerConclusion: false, defaultRequiresConclusion: true }), { offerConclusion: false, defaultRequiresConclusion: true });
});

test("hasConclusion: blank space is not a conclusion", () => {
  assert.equal(hasConclusion(task({})), false);
  assert.equal(hasConclusion(task({ conclusion: "" })), false);
  assert.equal(hasConclusion(task({ conclusion: "  \n " })), false);
  assert.equal(hasConclusion(task({ conclusion: "Shipped" })), true);
});

test("cleanConclusion: trims, and blank becomes undefined", () => {
  assert.equal(cleanConclusion("  done well \n"), "done well");
  assert.equal(cleanConclusion("   "), undefined);
});

test("needsConclusionToFinish: only a flagged, still-open task moving to a done state", () => {
  const flagged = task({ requiresConclusion: true });
  assert.equal(needsConclusionToFinish(flagged, "Done", STATES), true);
  // The last configured state counts as done even when it is not called "Done".
  assert.equal(needsConclusionToFinish(flagged, "Shipped", ["New", "Shipped"]), true);
  // A step that is not finishing the task is never blocked.
  assert.equal(needsConclusionToFinish(flagged, "In progress", STATES), false);
  // No flag, no requirement.
  assert.equal(needsConclusionToFinish(task({}), "Done", STATES), false);
  assert.equal(needsConclusionToFinish(task({ requiresConclusion: false }), "Done", STATES), false);
});

test("needsConclusionToFinish: a written conclusion clears the block", () => {
  const written = task({ requiresConclusion: true, conclusion: "All shipped" });
  assert.equal(needsConclusionToFinish(written, "Done", STATES), false);
  const blank = task({ requiresConclusion: true, conclusion: "   " });
  assert.equal(needsConclusionToFinish(blank, "Done", STATES), true);
});

test("needsConclusionToFinish: a task already done is not asked again", () => {
  const alreadyDone = task({ status: "Done", requiresConclusion: true });
  assert.equal(needsConclusionToFinish(alreadyDone, "Done", STATES), false);
});

test("toggleTaskDone keeps the conclusion when a task is reopened", () => {
  const finished = task({ status: "Done", requiresConclusion: true, conclusion: "Delivered" });
  const reopened = toggleTaskDone(finished, STATES, "Sam");
  assert.equal(reopened.status, "New");
  assert.equal(reopened.conclusion, "Delivered");
  assert.equal(reopened.requiresConclusion, true);
});

test("canUntickConclusion: unflagged task can be toggled by anyone", () => {
  const unflagged = task({ requiresConclusion: false, createdBy: "Sam" });
  assert.equal(canUntickConclusion(unflagged, undefined), true);
  assert.equal(canUntickConclusion(unflagged, { name: "Bob", role: "Employee" }), true);
});

test("canUntickConclusion: flagged task unticking restricted to creator or Admin", () => {
  const flagged = task({ requiresConclusion: true, createdBy: "Sam" });

  // No user -> forbidden
  assert.equal(canUntickConclusion(flagged, undefined), false);

  // The task's creator may untick
  assert.equal(canUntickConclusion(flagged, { name: "Sam", role: "Employee" }), true);
  assert.equal(canUntickConclusion(flagged, { name: "sam ", role: "Employee" }), true);

  // An Admin may untick even if not the creator
  assert.equal(canUntickConclusion(flagged, { name: "Bob", role: "Admin" }), true);
  assert.equal(canUntickConclusion(flagged, { name: "Bob", role: "admin" }), true);

  // A colleague / assignee who is not creator and not admin is forbidden
  assert.equal(canUntickConclusion(flagged, { name: "Bob", role: "Manager" }), false);
  assert.equal(canUntickConclusion(flagged, { name: "Bob", role: "Employee" }), false);

  // Legacy task without createdBy: only Admin can untick
  const legacy = task({ requiresConclusion: true, createdBy: undefined });
  assert.equal(canUntickConclusion(legacy, { name: "Bob", role: "Admin" }), true);
  assert.equal(canUntickConclusion(legacy, { name: "Bob", role: "Employee" }), false);
});
