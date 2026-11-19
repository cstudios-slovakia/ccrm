import assert from "node:assert/strict";
import test from "node:test";
import { isRunningTarget, isSameTarget, resolveStartMode, sameRunningIds } from "./timeTrackingRunning.ts";

const entry = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  taskId: null,
  ticketId: null,
  projectId: null,
  description: null,
  title: "",
  ...over,
}) as { id: string; taskId: string | null; ticketId: string | null; projectId: string | null; description: string | null; title: string };

test("isSameTarget: a task matches by task id only", () => {
  assert.equal(isSameTarget(entry({ taskId: "t1", projectId: "p1" }), { taskId: "t1" }), true);
  assert.equal(isSameTarget(entry({ taskId: "t1" }), { taskId: "t2", projectId: null }), false);
  assert.equal(isSameTarget(entry({ ticketId: "k1" }), { taskId: "t1" }), false);
});

test("isSameTarget: a ticket matches only an entry without a task", () => {
  assert.equal(isSameTarget(entry({ ticketId: "k1" }), { ticketId: "k1" }), true);
  assert.equal(isSameTarget(entry({ ticketId: "k1", taskId: "t1" }), { ticketId: "k1" }), false);
});

test("isSameTarget: free text matches project and title, trimmed", () => {
  const free = entry({ projectId: "p1", description: "Call", title: "Call" });
  assert.equal(isSameTarget(free, { projectId: "p1", title: " Call " }), true);
  assert.equal(isSameTarget(free, { projectId: "p2", title: "Call" }), false);
  assert.equal(isSameTarget(free, { projectId: "p1", title: "Other" }), false);
  assert.equal(isSameTarget(entry({ taskId: "t1", projectId: "p1", title: "Call" }), { projectId: "p1", title: "Call" }), false);
  assert.equal(isSameTarget(entry(), {}), true);
});

test("isRunningTarget looks through the whole running set", () => {
  const set = [entry({ id: "a", taskId: "t1" }), entry({ id: "b", ticketId: "k9" })];
  assert.equal(isRunningTarget(set, { ticketId: "k9" }), true);
  assert.equal(isRunningTarget(set, { taskId: "t2" }), false);
  assert.equal(isRunningTarget([], { taskId: "t1" }), false);
});

test("resolveStartMode: nothing running is a plain start", () => {
  assert.equal(resolveStartMode({ runningCount: 0, preference: "ask", parallel: { enabled: true } }), "plain");
  assert.equal(resolveStartMode({ runningCount: 0, preference: "parallel", parallel: { enabled: true }, forced: "parallel" }), "plain");
});

test("resolveStartMode: parallel off always switches", () => {
  for (const preference of ["ask", "switch", "parallel"] as const) {
    assert.equal(resolveStartMode({ runningCount: 1, preference, parallel: { enabled: false } }), "switch");
  }
});

test("resolveStartMode: the preference decides when parallel is on", () => {
  assert.equal(resolveStartMode({ runningCount: 2, preference: "switch", parallel: { enabled: true } }), "switch");
  assert.equal(resolveStartMode({ runningCount: 2, preference: "parallel", parallel: { enabled: true } }), "parallel");
  assert.equal(resolveStartMode({ runningCount: 1, preference: "ask", parallel: { enabled: true } }), "ask");
});

test("resolveStartMode: a running target never asks; a forced mode wins", () => {
  assert.equal(resolveStartMode({ runningCount: 1, preference: "ask", parallel: { enabled: true }, targetRunning: true }), "switch");
  assert.equal(resolveStartMode({ runningCount: 1, preference: "ask", parallel: { enabled: true }, forced: "parallel" }), "parallel");
  assert.equal(resolveStartMode({ runningCount: 1, preference: "parallel", parallel: { enabled: false }, forced: "switch" }), "switch");
});

test("sameRunningIds ignores order", () => {
  assert.equal(sameRunningIds([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "a" }]), true);
  assert.equal(sameRunningIds([{ id: "a" }], [{ id: "a" }, { id: "b" }]), false);
  assert.equal(sameRunningIds([], []), true);
});
