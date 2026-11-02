import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampDeadline,
  deadlineChange,
  deadlinePostponement,
  minDeadlineFor,
  quickDeadlines,
  taskCreatedDate,
} from "./taskDeadline.ts";

// Wednesday 4 November 2026, local time.
const NOW = new Date(2026, 10, 4, 10, 0, 0);

describe("task deadline floor", () => {
  it("reads the creation day from a stored timestamp", () => {
    assert.equal(taskCreatedDate({ createdAt: "2026-10-12 08:30:11" }), "2026-10-12");
    assert.equal(taskCreatedDate({ createdAt: "2026-10-12" }), "2026-10-12");
    assert.equal(taskCreatedDate({}), "");
  });

  it("is today for a new task and the creation day for a stored one", () => {
    assert.equal(minDeadlineFor(null, NOW), "2026-11-04");
    assert.equal(minDeadlineFor({ createdAt: "2026-10-12 08:30:11" }, NOW), "2026-10-12");
    assert.equal(minDeadlineFor({}, NOW), "", "a legacy task with no stamp has no floor");
  });

  it("raises an earlier date to the floor and leaves the rest alone", () => {
    assert.equal(clampDeadline("2026-10-01", "2026-10-12"), "2026-10-12");
    assert.equal(clampDeadline("2026-10-12", "2026-10-12"), "2026-10-12");
    assert.equal(clampDeadline("2026-12-01", "2026-10-12"), "2026-12-01");
    assert.equal(clampDeadline("", "2026-10-12"), "");
    assert.equal(clampDeadline("2026-01-01", ""), "2026-01-01");
  });
});

describe("deadline postponements", () => {
  it("counts a later date and pins the date the task was first given", () => {
    const first = deadlineChange({ deadline: "2026-11-10" }, "2026-11-12");
    assert.deepEqual(first, { deadline: "2026-11-12", originalDeadline: "2026-11-10", deadlineMoves: 1 });
    const second = deadlineChange(first, "2026-11-20");
    assert.deepEqual(second, { deadline: "2026-11-20", originalDeadline: "2026-11-10", deadlineMoves: 2 });
  });

  it("does not count an earlier date or an unchanged one", () => {
    const moved = { deadline: "2026-11-12", originalDeadline: "2026-11-10", deadlineMoves: 1 };
    assert.equal(deadlineChange(moved, "2026-11-11").deadlineMoves, 1);
    assert.equal(deadlineChange(moved, "2026-11-12").deadlineMoves, 1);
    assert.equal(deadlineChange(moved, "2026-11-11").originalDeadline, "2026-11-10");
  });

  it("reads the badge: original date is the current one until it moves", () => {
    assert.deepEqual(deadlinePostponement({ deadline: "2026-11-10" }), { moves: 0, original: "2026-11-10" });
    assert.deepEqual(
      deadlinePostponement({ deadline: "2026-11-20", originalDeadline: "2026-11-10", deadlineMoves: 2 }),
      { moves: 2, original: "2026-11-10" },
    );
    // Moved before the original was recorded: the count is known, the date is not.
    assert.deepEqual(deadlinePostponement({ deadline: "2026-11-20", deadlineMoves: 1 }), { moves: 1, original: "" });
  });
});

describe("quick deadlines", () => {
  it("offers today, tomorrow, next Monday, +1 week and +1 month", () => {
    assert.deepEqual(
      quickDeadlines("", NOW).map((q) => [q.key, q.date]),
      [
        ["today", "2026-11-04"],
        ["tomorrow", "2026-11-05"],
        ["nextMonday", "2026-11-09"],
        ["plusWeek", "2026-11-11"],
        ["plusMonth", "2026-12-04"],
      ],
    );
  });

  it("drops dates before the floor and never repeats a day", () => {
    const keys = quickDeadlines("2026-11-05", NOW).map((q) => q.key);
    assert.ok(!keys.includes("today"));
    // On a Sunday "next Monday" is tomorrow: only one of them is offered.
    const sunday = new Date(2026, 10, 8, 10, 0, 0);
    const dates = quickDeadlines("", sunday).map((q) => q.date);
    assert.equal(new Set(dates).size, dates.length);
  });
});
