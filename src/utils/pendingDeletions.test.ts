import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { baselineOf, diffRecords } from "./syncDiff.ts";
import {
  cancelDeletion,
  clearPendingDeletions,
  hasPendingDeletions,
  isDeletionPending,
  markDeletionPending,
  pendingDeletionIds,
  pendingDeletionRecords,
  releaseDeletion,
  unifiedEntryKey,
  withoutPendingDeletions,
} from "./pendingDeletions.ts";
import { pickFields, reinsertAt, removeByIds, restoreFields } from "./undoableList.ts";

beforeEach(() => clearPendingDeletions());

const a = { id: "a", title: "A" };
const b = { id: "b", title: "B" };
const c = { id: "c", title: "C" };

test("registry marks, reports and releases ids", () => {
  markDeletionPending("tasks", [a, b]);
  assert.equal(hasPendingDeletions(), true);
  assert.equal(isDeletionPending("tasks", "a"), true);
  assert.equal(isDeletionPending("tasks", 1), false);
  assert.deepEqual([...pendingDeletionIds("tasks")].sort(), ["a", "b"]);
  assert.deepEqual(pendingDeletionRecords("tasks"), [a, b]);
  releaseDeletion("tasks", ["a"]);
  cancelDeletion("tasks", ["b"]);
  assert.equal(hasPendingDeletions(), false);
});

test("diff without hold-back reports the deletion", () => {
  const baseline = baselineOf([a, b, c]);
  const { deletedIds } = diffRecords([a, c], baseline);
  assert.deepEqual(deletedIds, ["b"]);
});

test("a held-back id is not deleted and stays in the next baseline", () => {
  const baseline = baselineOf([a, b, c]);
  const { deletedIds, next } = diffRecords([a, c], baseline, new Set(["b"]));
  assert.deepEqual(deletedIds, []);
  assert.ok(next.has("b"), "baseline must keep the row so a later diff still deletes it");
  // After the undo window closes the deletion goes out.
  const later = diffRecords([a, c], next);
  assert.deepEqual(later.deletedIds, ["b"]);
});

test("undo: restoring the record makes the diff empty — nothing is ever pushed", () => {
  const baseline = baselineOf([a, b, c]);
  const first = diffRecords([a, c], baseline, new Set(["b"]));
  const restored = diffRecords([a, b, c], first.next);
  assert.deepEqual(restored.changed, []);
  assert.deepEqual(restored.deletedIds, []);
});

test("only held-back ids are protected; others still delete", () => {
  const baseline = baselineOf([a, b, c]);
  const { deletedIds } = diffRecords([c], baseline, new Set(["b"]));
  assert.deepEqual(deletedIds, ["a"]);
});

test("a pull does not resurrect a pending deletion", () => {
  markDeletionPending("tasks", [b]);
  const data = { tasks: [a, b, c], leads: [{ id: "l" }] };
  const out = withoutPendingDeletions(data);
  assert.deepEqual(out.tasks, [a, c]);
  assert.equal(out.leads, data.leads);
  assert.deepEqual(data.tasks, [a, b, c], "input is not mutated");
});

test("a pull with nothing pending returns the same object", () => {
  const data = { tasks: [a] };
  assert.equal(withoutPendingDeletions(data), data);
});

test("unified-entry rows are filtered per entry", () => {
  markDeletionPending(unifiedEntryKey("ue1"), [{ id: "r2" }]);
  const data = { unifiedEntriesData: { ue1: [{ id: "r1" }, { id: "r2" }], ue2: [{ id: "r2" }] } };
  const out = withoutPendingDeletions(data);
  assert.deepEqual(out.unifiedEntriesData.ue1, [{ id: "r1" }]);
  assert.deepEqual(out.unifiedEntriesData.ue2, [{ id: "r2" }]);
});

test("removeByIds / reinsertAt put records back at their original index", () => {
  const list = [a, b, c];
  const { next, removed } = removeByIds(list, ["a", "c"], (r) => r.id);
  assert.deepEqual(next, [b]);
  assert.deepEqual(reinsertAt(next, removed, (r) => r.id), [a, b, c]);
});

test("reinsertAt never duplicates a record that is already present", () => {
  const { next, removed } = removeByIds([a, b], ["a"], (r) => r.id);
  const once = reinsertAt(next, removed, (r) => r.id);
  assert.deepEqual(reinsertAt(once, removed, (r) => r.id), [a, b]);
});

test("reinsertAt clamps an index past the end", () => {
  const { removed } = removeByIds([a, b, c], ["c"], (r) => r.id);
  assert.deepEqual(reinsertAt([a], removed, (r) => r.id), [a, c]);
});

test("restoreFields removes a field that did not exist before", () => {
  const original: { id: string; archived?: boolean; status?: string } = { id: "x", status: "open" };
  const fields = ["archived", "status"] as const;
  const snap = pickFields(original, fields);
  const changed = { ...original, archived: true, status: "done" };
  const back = restoreFields(changed, snap, fields);
  assert.deepEqual(back, original);
  assert.equal(JSON.stringify(back), JSON.stringify(original));
});
