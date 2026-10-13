import assert from "node:assert/strict";
import test from "node:test";
import { createUndoQueue } from "./undoQueue.ts";

const make = () => {
  const log: string[] = [];
  const action = (name: string, extra: { id?: string } = {}) => ({
    ...extra,
    onUndo: () => log.push(`undo:${name}`),
    onCommit: () => log.push(`commit:${name}`),
  });
  return { log, action };
};

test("a registered action is pending until settled", () => {
  const q = createUndoQueue();
  const { action } = make();
  const id = q.register(action("a"));
  assert.equal(q.statusOf(id), "pending");
  assert.equal(q.size(), 1);
  assert.equal(q.current(), id);
});

test("undo runs onUndo once and never onCommit", () => {
  const q = createUndoQueue();
  const { log, action } = make();
  const id = q.register(action("a"));
  assert.equal(q.undo(id), true);
  assert.equal(q.commit(id), false);
  assert.equal(q.undo(id), false);
  assert.deepEqual(log, ["undo:a"]);
  assert.equal(q.statusOf(id), "undone");
  assert.equal(q.size(), 0);
});

test("commit runs onCommit once and a later undo is a no-op", () => {
  const q = createUndoQueue();
  const { log, action } = make();
  const id = q.register(action("a"));
  assert.equal(q.commit(id), true);
  assert.equal(q.commit(id), false);
  assert.equal(q.undo(id), false);
  assert.deepEqual(log, ["commit:a"]);
  assert.equal(q.statusOf(id), "committed");
});

test("registering a new action commits the old one first (supersede)", () => {
  const q = createUndoQueue();
  const { log, action } = make();
  const first = q.register(action("a"));
  const second = q.register(action("b"));
  assert.deepEqual(log, ["commit:a"]);
  assert.equal(q.statusOf(first), "committed");
  assert.equal(q.statusOf(second), "pending");
  assert.equal(q.current(), second);
  // The superseded action can no longer be undone.
  assert.equal(q.undo(first), false);
});

test("commitAll settles everything pending and reports the count", () => {
  const q = createUndoQueue();
  const { log, action } = make();
  q.register(action("a"));
  const b = q.register(action("b"));
  assert.equal(q.commitAll(), 1);
  assert.deepEqual(log, ["commit:a", "commit:b"]);
  assert.equal(q.statusOf(b), "committed");
  assert.equal(q.commitAll(), 0);
  assert.equal(q.size(), 0);
  assert.equal(q.current(), null);
});

test("commitAll skips actions that were already undone", () => {
  const q = createUndoQueue();
  const { log, action } = make();
  const id = q.register(action("a"));
  q.undo(id);
  assert.equal(q.commitAll(), 0);
  assert.deepEqual(log, ["undo:a"]);
});

test("unknown ids are ignored", () => {
  const q = createUndoQueue();
  assert.equal(q.undo("nope"), false);
  assert.equal(q.commit("nope"), false);
  assert.equal(q.statusOf("nope"), null);
});

test("a throwing handler does not stop the rest of commitAll", () => {
  const q = createUndoQueue();
  const log: string[] = [];
  const origError = console.error;
  console.error = () => {};
  try {
    q.register({ onUndo() {}, onCommit() { throw new Error("boom"); } });
    // Supersede commits the throwing one; the new registration must still succeed.
    const b = q.register({ onUndo() {}, onCommit: () => log.push("b") });
    assert.equal(q.statusOf(b), "pending");
    assert.equal(q.commitAll(), 1);
    assert.deepEqual(log, ["b"]);
  } finally {
    console.error = origError;
  }
});

test("a commit handler that re-enters commitAll does not run twice", () => {
  const q = createUndoQueue();
  let commits = 0;
  q.register({
    onUndo() {},
    onCommit() {
      commits++;
      q.commitAll();
    },
  });
  q.commitAll();
  assert.equal(commits, 1);
});

test("explicit ids are honoured", () => {
  const q = createUndoQueue();
  const { action } = make();
  const id = q.register(action("a", { id: "task-1" }));
  assert.equal(id, "task-1");
  assert.equal(q.statusOf("task-1"), "pending");
});
