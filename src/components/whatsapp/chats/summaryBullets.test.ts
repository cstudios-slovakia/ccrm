import assert from "node:assert/strict";
import test from "node:test";
import type { ChatSummaryPreview } from "../api/contract.ts";
import { chatsMessages } from "./chatsI18n.ts";
import { rowBullets, standingCount } from "./summaryBullets.ts";

const summary = (items: Array<[string, string | null]>, narrative = ""): ChatSummaryPreview => ({
  action_items: items.map(([text, task_id]) => ({ text, task_id })),
  narrative,
  message_count: 10,
  created_at: "2026-11-03T10:00:00.000Z",
});
const none = new Set<string>();

test("no summary → none", () => {
  assert.deepEqual(rowBullets(undefined, none), { kind: "none" });
});

test("five items, none done → five bullets", () => {
  const r = rowBullets(summary([["a", "t1"], ["b", "t2"], ["c", null], ["d", null], ["e", "t5"]]), none);
  assert.equal(r.kind, "bullets");
  assert.equal(r.kind === "bullets" && r.bullets.length, 5);
  assert.equal(standingCount(r), 5);
});

test("seven items → first five only", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g"].map((t): [string, string | null] => [t, null]);
  const r = rowBullets(summary(items), none);
  assert.deepEqual(r.kind === "bullets" && r.bullets.map((b) => b.text), ["a", "b", "c", "d", "e"]);
});

test("an item with empty text is skipped", () => {
  const r = rowBullets(summary([["  ", null], [" real ", "t1"]]), none);
  assert.deepEqual(r, { kind: "bullets", bullets: [{ text: "real", taskId: "t1" }] });
});

test("a done task is removed and the count drops", () => {
  const r = rowBullets(summary([["a", "t1"], ["b", "t2"], ["c", null]]), new Set(["t1"]));
  assert.equal(standingCount(r), 2);
  assert.deepEqual(r.kind === "bullets" && r.bullets.map((b) => b.text), ["b", "c"]);
});

test("the first five count even when done: a done one among them shrinks the row", () => {
  const items = ["a", "b", "c", "d", "e", "f"].map((t, i): [string, string | null] => [t, `t${i}`]);
  assert.equal(standingCount(rowBullets(summary(items), new Set(["t0"]))), 4);
});

test("every task bullet done → all_done", () => {
  const r = rowBullets(summary([["a", "t1"], ["b", "t2"]]), new Set(["t1", "t2"]));
  assert.deepEqual(r, { kind: "all_done" });
  assert.equal(standingCount(r), 0);
});

test("no action items, narrative of four sentences → three bullets", () => {
  const r = rowBullets(summary([], "One. Two! Three? Four."), none);
  assert.deepEqual(r.kind === "bullets" && r.bullets.map((b) => b.text), ["One.", "Two!", "Three?"]);
  assert.ok(r.kind === "bullets" && r.bullets.every((b) => b.taskId === null));
});

test("narrative with **bold** and '9. marca' → one clean sentence", () => {
  const r = rowBullets(summary([], "Viktor sa **9. marca** pýtal na termín."), none);
  assert.deepEqual(r, { kind: "bullets", bullets: [{ text: "Viktor sa 9. marca pýtal na termín.", taskId: null }] });
});

test("no action items and an empty narrative → none", () => {
  assert.deepEqual(rowBullets(summary([], "   "), none), { kind: "none" });
  assert.deepEqual(rowBullets(summary([["", null]], ""), none), { kind: "none" });
});

test("plural of the count: Slovak 1, 3, 5, Hungarian, English", () => {
  const sk = chatsMessages("sk").summaryPoints;
  assert.deepEqual([sk(1), sk(3), sk(5), sk(0)], ["1 bod", "3 body", "5 bodov", "0 bodov"]);
  assert.equal(chatsMessages("hu").summaryPoints(4), "4 pont");
  assert.deepEqual([chatsMessages("en").summaryPoints(1), chatsMessages("en").summaryPoints(2)], ["1 point", "2 points"]);
});
