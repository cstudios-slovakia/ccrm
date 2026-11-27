import test from "node:test";
import assert from "node:assert/strict";
import { buildNoteActivity, isNoteActivity, noteActivityTitle, noteSnippet } from "./noteActivity.ts";

test("snippet collapses whitespace and cuts long text at 80 characters", () => {
  assert.equal(noteSnippet("  call \n\n back\ttomorrow "), "call back tomorrow");
  const cut = noteSnippet("word ".repeat(40));
  assert.equal(cut.length, 80);
  assert.ok(cut.endsWith("…"));
  assert.equal(noteSnippet("x".repeat(80)), "x".repeat(80));
});

test("titles come in all three languages", () => {
  assert.equal(noteActivityTitle("added", "en"), "Note added");
  assert.equal(noteActivityTitle("edited", "sk"), "Poznámka upravená");
  assert.equal(noteActivityTitle("deleted", "hu"), "Jegyzet törölve");
});

test("a trace carries the action, a snippet, the minute and the actor", () => {
  const trace = buildNoteActivity({
    action: "added",
    text: "Customer wants marble\nfor the kitchen",
    language: "en",
    now: "2026-11-24 09:30:45",
    suffix: "k1",
    author: "Peter",
  });
  assert.deepEqual(trace, {
    id: "na-k1",
    type: "note_activity",
    timestamp: "2026-11-24 09:30",
    title: "Note added",
    content: "Customer wants marble for the kitchen",
    author: "Peter",
  });
  assert.equal(isNoteActivity(trace), true);
  assert.equal(isNoteActivity({ type: "note" }), false);
});

test("a trace without a known actor has no author key", () => {
  const trace = buildNoteActivity({ action: "deleted", text: "x", language: "sk", now: "2026-11-24 09:30", suffix: "k2" });
  assert.equal("author" in trace, false);
  assert.equal(trace.title, "Poznámka zmazaná");
});
