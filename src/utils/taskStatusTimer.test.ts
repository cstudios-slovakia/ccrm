import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Task } from "../types/index.ts";
import { normalizeStatusTimerMap, planStatusTimerActions, timerActionForStatusChange } from "./taskStatusTimer.ts";

const fixtures = JSON.parse(readFileSync(new URL("../../scripts/fixtures/task-status-timer-cases.json", import.meta.url), "utf8"));

for (const c of fixtures.cases) {
  test(`taskStatusTimer fixture: ${c.name}`, () => {
    assert.equal(timerActionForStatusChange(c.old, c.new, "map" in c ? c.map : fixtures.map), c.expect);
  });
}

test("normalizeStatusTimerMap keeps only valid entries; a non-object is empty", () => {
  assert.deepEqual(normalizeStatusTimerMap({ A: "start", B: "go", C: null }), { A: "start" });
  assert.deepEqual(normalizeStatusTimerMap(null), {});
  assert.deepEqual(normalizeStatusTimerMap(["start"]), {});
});

const MAP = fixtures.map;
const task = (id: string, status: string, extra: Partial<Task> = {}): Task =>
  ({ id, title: id, description: "", status, priority: "low", deadline: "", owner: "", assignedUsers: [], ...extra }) as Task;
const base = {
  map: MAP,
  userId: "u-jana",
  userName: "Jana",
  running: [] as { id: string; taskId: string | null }[],
  paused: [] as { id: string; taskId: string | null }[],
  canTrack: true,
};
/** The UI writers replace only the changed row: unchanged rows keep their identity. */
const edit = (before: Task[], changes: Record<string, Partial<Task>>) => before.map((t) => (changes[t.id] ? { ...t, ...changes[t.id] } : t));

test("a single change to a Start status starts the timer for an assignee", () => {
  const before = [task("t1", "To do", { assignedUsers: ["Jana"] }), task("t2", "To do")];
  const plan = planStatusTimerActions({ ...base, before, after: edit(before, { t1: { status: "In progress" } }) });
  assert.deepEqual(plan, [{ taskId: "t1", action: "start" }]);
});

test("a task with nobody assigned may be started by anyone", () => {
  const before = [task("t1", "To do")];
  assert.deepEqual(planStatusTimerActions({ ...base, before, after: edit(before, { t1: { status: "In progress" } }) }), [{ taskId: "t1", action: "start" }]);
});

test("a non-assignee starts nothing", () => {
  const before = [task("t1", "To do", { owner: "Marek", assignedUsers: ["Marek"] })];
  assert.deepEqual(planStatusTimerActions({ ...base, before, after: edit(before, { t1: { status: "In progress" } }) }), []);
});

test("a bulk change starts nothing but still pauses and stops the user's own items", () => {
  const before = [task("t1", "To do"), task("t2", "In progress"), task("t3", "In progress"), task("t4", "Waiting")];
  const after = edit(before, { t1: { status: "In progress" }, t2: { status: "Waiting" }, t3: { status: "Done" }, t4: { status: "Done" } });
  const plan = planStatusTimerActions({
    ...base,
    before,
    after,
    running: [{ id: "e2", taskId: "t2" }, { id: "e3", taskId: "t3" }],
    paused: [{ id: "e4", taskId: "t4" }],
  });
  assert.deepEqual(plan, [
    { taskId: "t2", action: "pause", entryId: "e2" },
    { taskId: "t3", action: "stop", entryId: "e3" },
    { taskId: "t4", action: "stop", entryId: "e4" },
  ]);
});

test("pause and stop do nothing when the user has no item on the task (another person's timer is not theirs)", () => {
  const before = [task("t1", "In progress")];
  const after = edit(before, { t1: { status: "Done" } });
  assert.deepEqual(planStatusTimerActions({ ...base, before, after, running: [{ id: "e9", taskId: "other" }] }), []);
});

test("a rebuilt array with unchanged content still counts as a single change", () => {
  const before = [task("t1", "To do"), task("t2", "To do")];
  const after = before.map((t) => (t.id === "t1" ? { ...t, status: "In progress" } : { ...t }));
  assert.deepEqual(planStatusTimerActions({ ...base, before, after }), [{ taskId: "t1", action: "start" }]);
});

test("no status change, or an unmapped one, plans nothing", () => {
  const before = [task("t1", "To do")];
  assert.deepEqual(planStatusTimerActions({ ...base, before, after: edit(before, { t1: { title: "Renamed" } }) }), []);
  assert.deepEqual(planStatusTimerActions({ ...base, before, after: edit(before, { t1: { status: "Review" } }) }), []);
});

test("a recurring template never fires", () => {
  const before = [task("t1", "To do", { taskKind: "recurring" } as Partial<Task>)];
  assert.deepEqual(planStatusTimerActions({ ...base, before, after: edit(before, { t1: { status: "In progress" } }) }), []);
});

test("no start when the user may not track time, the task already runs, or nobody is signed in", () => {
  const before = [task("t1", "To do")];
  const after = edit(before, { t1: { status: "In progress" } });
  assert.deepEqual(planStatusTimerActions({ ...base, before, after, canTrack: false }), []);
  assert.deepEqual(planStatusTimerActions({ ...base, before, after, running: [{ id: "e1", taskId: "t1" }] }), []);
  assert.deepEqual(planStatusTimerActions({ ...base, before, after, userId: null }), []);
});
