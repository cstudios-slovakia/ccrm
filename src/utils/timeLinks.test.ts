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
});

test("a task with only a client uses the client's single active project", () => {
  const leads = [lead("client-1", "Acme", { adjustment: 1 })];
  const projects = [project("p1", { clientId: "client-1" }), project("p2", { clientId: "client-2" })];
  const r = resolveTaskProject({ relatedLeadId: "client-1" }, projects, leads, open);
  assert.equal(r.projectId, "p1");
});

test("with several projects the caller must ask; finished and archived ones do not count", () => {
  const leads = [lead("client-1", "Acme")];
  const projects = [
    project("p1", { clientId: "client-1" }),
    project("p2", { clientId: "client-1" }),
    project("p3", { clientId: "client-1", archived: true }),
    project("p4", { clientId: "client-1", status: "done" }),
  ];
  const r = resolveTaskProject({ relatedLeadId: "client-1" }, projects, leads, (p) => p.status === "done");
  assert.equal(r.projectId, null);
  assert.deepEqual(r.candidates.map((p) => p.id), ["p1", "p2"]);
});

test("clientForTask resolves the lead to its client, and keeps a lead that has none", () => {
  const leads = [lead("client-1", "Acme", { adjustment: 1 }), lead("lead-1", "Side", { clientId: "client-1" }), lead("lead-2", "Solo")];
  assert.equal(clientForTask({ relatedLeadId: "lead-1" }, leads)?.id, "client-1");
  assert.equal(clientForTask({ relatedLeadId: "client-1" }, leads)?.id, "client-1");
  assert.equal(clientForTask({ relatedLeadId: "lead-2" }, leads)?.id, "lead-2");
  assert.equal(clientForTask({}, leads), null);
  assert.equal(clientForTask({ relatedLeadId: "missing" }, leads), null);
});

test("a lead linked to a client by id finds the client's projects, not a same-named lead's", () => {
  const leads = [lead("client-1", "Acme", { adjustment: 1 }), lead("lead-1", "Acme", { clientId: "client-1" }), lead("lead-2", "Acme")];
  const projects = [project("p1", { clientId: "client-1" })];
  assert.equal(resolveTaskProject({ relatedLeadId: "lead-1" }, projects, leads, open).projectId, "p1");
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
