import test from "node:test";
import assert from "node:assert/strict";
import { clientForTask, matchOpenTasks, resolveTaskProject } from "./timeLinks.ts";

const lead = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, ...extra }) as never;
const project = (id: string, extra: Record<string, unknown> = {}) => ({ id, status: "active", ...extra }) as never;
const task = (id: string, title: string, extra: Record<string, unknown> = {}) => ({ id, title, status: "todo", ...extra }) as never;
const open = () => false;

test("a task with a project uses that project", () => {
  const r = resolveTaskProject({ relatedProjectId: "p1" }, [], [], open);
  assert.equal(r.projectId, "p1");
  assert.deepEqual(r.candidates, []);
});

test("a task with only a client does NOT guess a project and returns no blocking candidates", () => {
  const leads = [lead("client-1", "Acme", { adjustment: 1 }), lead("lead-1", "Side", { clientId: "client-1" })];
  const projects = [project("p1", { clientId: "client-1" }), project("p2", { clientId: "client-1" })];
  assert.deepEqual(resolveTaskProject({ relatedLeadId: "client-1" }, [projects[0]], leads, open), { projectId: null, candidates: [] });
  assert.deepEqual(resolveTaskProject({ relatedLeadId: "client-1" }, projects, leads, open), { projectId: null, candidates: [] });
  assert.deepEqual(resolveTaskProject({ relatedLeadId: "lead-1" }, projects, leads, open), { projectId: null, candidates: [] });
});

test("clientForTask resolves the lead to its client, and keeps a lead that has none", () => {
  const leads = [lead("client-1", "Acme", { adjustment: 1 }), lead("lead-1", "Side", { clientId: "client-1" }), lead("lead-2", "Solo")];
  assert.equal(clientForTask({ relatedLeadId: "lead-1" }, leads)?.id, "client-1");
  assert.equal(clientForTask({ relatedLeadId: "client-1" }, leads)?.id, "client-1");
  assert.equal(clientForTask({ relatedLeadId: "lead-2" }, leads)?.id, "lead-2");
  assert.equal(clientForTask({}, leads), null);
  assert.equal(clientForTask({ relatedLeadId: "missing" }, leads), null);
});

test("with no project and no client, the timer starts without one", () => {
  assert.deepEqual(resolveTaskProject({}, [project("p1")], [], open), { projectId: null, candidates: [] });
});

test("autocomplete offers open tasks by title, prefix matches first, at least two characters", () => {
  const tasks = [task("1", "Write the offer"), task("2", "Review offer"), task("3", "Offer sent", { archived: true }), task("4", "Offer call", { status: "done" })];
  const done = (t: { status: string }) => t.status === "done";
  assert.deepEqual(matchOpenTasks(tasks, "offer", done as never).map((t) => t.id), ["2", "1"]);
  assert.deepEqual(matchOpenTasks(tasks, "o", done as never), []);
  assert.deepEqual(matchOpenTasks(tasks, "rev", done as never).map((t) => t.id), ["2"]);
});
