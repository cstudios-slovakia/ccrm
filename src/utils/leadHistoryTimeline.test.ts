import test from "node:test";
import assert from "node:assert/strict";
import { isLeadHistoryItem, leadEventText, leadHistoryItems, mergeLeadHistory } from "./leadHistoryTimeline.ts";
import type { TimelineEvent } from "../types/index.ts";

const ev = (id: string, timestamp: string, extra: Partial<TimelineEvent> = {}): TimelineEvent =>
  ({ id, type: "phone", timestamp, title: id, content: "", ...extra }) as TimelineEvent;

test("leadHistoryItems drops hidden and undated entries and sorts newest first", () => {
  const items = leadHistoryItems([ev("a", "2026-01-01 10:00"), ev("b", "2026-03-01 10:00"), ev("h", "2026-02-01 10:00", { hidden: true }), ev("x", "")]);
  assert.deepEqual(items.map((i) => i.id), ["lead:b", "lead:a"]);
  assert.equal(isLeadHistoryItem(items[0]), true);
  assert.deepEqual(leadHistoryItems(undefined), []);
});

test("mergeLeadHistory weaves by time without reordering the project's own entries", () => {
  const project = [{ id: "p2", timestamp: "2026-02-15 09:00" }, { id: "p1", timestamp: "2026-01-15 09:00" }];
  const lead = leadHistoryItems([ev("l3", "2026-03-01 08:00"), ev("l2", "2026-02-01 08:00"), ev("l0", "2025-12-01 08:00")]);
  assert.deepEqual(mergeLeadHistory(project, lead).map((e) => e.id), ["lead:l3", "p2", "lead:l2", "p1", "lead:l0"]);
  assert.deepEqual(mergeLeadHistory(project, []).map((e) => e.id), ["p2", "p1"]);
  assert.deepEqual(mergeLeadHistory([], lead).map((e) => e.id), ["lead:l3", "lead:l2", "lead:l0"]);
});

test("leadEventText reads old rich notes and leaves plain text alone", () => {
  assert.equal(leadEventText('[{"content":"<b>Call</b> back"},{"content":"Send offer"}]'), "Call back · Send offer");
  assert.equal(leadEventText("  Plain text "), "Plain text");
  assert.equal(leadEventText("[not json"), "[not json");
  assert.equal(leadEventText(null), "");
});
