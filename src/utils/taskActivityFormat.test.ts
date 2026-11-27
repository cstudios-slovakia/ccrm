import assert from "node:assert/strict";
import test from "node:test";
import type { TaskActivityItem } from "../types";
import {
  formatActivityTimestamp,
  formatStateChange,
  mergeActivityDelta,
  prependOlderActivities,
  toggleReactionMap,
} from "./taskActivityFormat.ts";

test("toggleReactionMap adds, appends, and removes user emoji cleanly", () => {
  const r1 = toggleReactionMap(null, "👍", "Erik");
  assert.deepEqual(r1, { "👍": ["Erik"] });

  const r2 = toggleReactionMap(r1, "👍", "Peti");
  assert.deepEqual(r2, { "👍": ["Erik", "Peti"] });

  // Clicking same emoji removes only that user
  const r3 = toggleReactionMap(r2, "👍", "Erik");
  assert.deepEqual(r3, { "👍": ["Peti"] });

  // Removing last user deletes key completely
  const r4 = toggleReactionMap(r3, "👍", "Peti");
  assert.deepEqual(r4, {});
});

test("toggleReactionMap caps distinct emojis at 12", () => {
  const full: Record<string, string[]> = {};
  const list = ["👍", "❤️", "🔥", "👀", "🎉", "✅", "🚀", "👏", "😄", "🤔", "🙏", "💡"];
  for (const e of list) full[e] = ["Erik"];
  const overflow = toggleReactionMap(full, "🥳", "Erik");
  assert.equal(Object.keys(overflow).length, 12);
  assert.equal(overflow["🥳"], undefined);
});

test("mergeActivityDelta inserts new rows, replaces edited rows, and drops tombstones", () => {
  const base: TaskActivityItem[] = [
    {
      id: 10,
      taskId: "t1",
      kind: "state_change",
      eventType: "created",
      authorName: "Erik",
      body: "",
      createdAt: "2026-11-22 10:00:00.000",
      updatedAt: "2026-11-22 10:00:00.000",
    },
    {
      id: 11,
      taskId: "t1",
      kind: "comment",
      authorName: "Peti",
      body: "Original text",
      createdAt: "2026-11-22 10:05:00.000",
      updatedAt: "2026-11-22 10:05:00.000",
    },
  ];

  const merged = mergeActivityDelta(base, [
    {
      id: 11,
      taskId: "t1",
      kind: "comment",
      authorName: "Peti",
      body: "Edited text",
      reactions: { "👍": ["Erik"] },
      createdAt: "2026-11-22 10:05:00.000",
      updatedAt: "2026-11-22 10:06:00.000",
    },
    {
      id: 12,
      taskId: "t1",
      kind: "comment",
      authorName: "Erik",
      body: "Follow up",
      createdAt: "2026-11-22 10:07:00.000",
      updatedAt: "2026-11-22 10:07:00.000",
    },
  ]);

  assert.equal(merged.length, 3);
  assert.equal(merged[1].body, "Edited text");
  assert.deepEqual(merged[1].reactions, { "👍": ["Erik"] });
  assert.equal(merged[2].id, 12);

  const afterDelete = mergeActivityDelta(merged, [
    {
      id: 11,
      taskId: "t1",
      kind: "comment",
      authorName: "",
      body: "",
      deleted: true,
      createdAt: "",
      updatedAt: "2026-11-22 10:08:00.000",
    },
  ]);
  assert.deepEqual(
    afterDelete.map((x) => x.id),
    [10, 12]
  );
});

test("prependOlderActivities deduplicates and preserves chronological order", () => {
  const older: TaskActivityItem[] = [
    { id: 1, taskId: "t1", kind: "state_change", eventType: "created", authorName: "Erik", body: "", createdAt: "", updatedAt: "" },
    { id: 5, taskId: "t1", kind: "comment", authorName: "A", body: "old", createdAt: "", updatedAt: "" },
  ];
  const existing: TaskActivityItem[] = [
    { id: 5, taskId: "t1", kind: "comment", authorName: "A", body: "old-updated", createdAt: "", updatedAt: "" },
    { id: 8, taskId: "t1", kind: "comment", authorName: "B", body: "new", createdAt: "", updatedAt: "" },
  ];
  const res = prependOlderActivities(older, existing);
  assert.deepEqual(
    res.map((r) => [r.id, r.body]),
    [
      [1, ""],
      [5, "old-updated"],
      [8, "new"],
    ]
  );
});

test("formatStateChange localizes status, priority, and postponed deadlines", () => {
  const statusEv = formatStateChange(
    { eventType: "status", meta: { from: "todo", to: "done" } },
    "sk",
    { translateStatus: (s) => (s === "todo" ? "Nové" : "Hotovo") }
  );
  assert.equal(statusEv.label, "zmenil(a) stav");
  assert.equal(statusEv.fromValue, "Nové");
  assert.equal(statusEv.toValue, "Hotovo");

  const deadlineEv = formatStateChange(
    { eventType: "deadline", meta: { from: "2026-11-20", to: "2026-11-25", postponed: true } },
    "en"
  );
  assert.equal(deadlineEv.label, "postponed deadline");
  assert.equal(deadlineEv.postponed, true);
  assert.equal(deadlineEv.fromValue, "20. 11. 2026");
  assert.equal(deadlineEv.toValue, "25. 11. 2026");
});

test("formatActivityTimestamp shows HH:MM for same day and date+time otherwise", () => {
  const now = new Date(2026, 10, 22, 15, 0, 0); // 2026-11-22
  assert.equal(formatActivityTimestamp("2026-11-22 14:35:10.123", "en", now), "14:35");
  assert.equal(formatActivityTimestamp("2026-11-20 09:12:00.000", "sk", now), "20. 11. 09:12");
  assert.equal(formatActivityTimestamp("2026-11-20 09:12:00.000", "hu", now), "11.20. 09:12");
});
