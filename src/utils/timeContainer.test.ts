import assert from "node:assert/strict";
import { test } from "node:test";
import { deliveredSeconds, extraItemsLabel, stripTimerTitle, timerTabTitle, workedClockSeconds } from "./timeContainer.ts";

const NOW = Date.parse("2026-11-19T10:00:00Z");
const at = (minutesAgo: number) => ({ startAt: new Date(NOW - minutesAgo * 60_000).toISOString() });

test("worked clock is the union of running intervals: now minus the earliest start", () => {
  assert.equal(workedClockSeconds([at(42), at(10)], NOW), 42 * 60);
  assert.equal(workedClockSeconds([], NOW), 0);
  assert.equal(workedClockSeconds([{ startAt: null }], NOW), 0);
});

test("delivered sums every running item", () => {
  assert.equal(deliveredSeconds([at(42), at(10)], NOW), 52 * 60);
});

test("extra label is the items beyond the first", () => {
  assert.equal(extraItemsLabel(1), "");
  assert.equal(extraItemsLabel(3), "+2");
});

test("tab title: parallel marker only from two items", () => {
  assert.equal(timerTabTitle("Koperniq", 3, 42 * 60), "▶ 0:42:00 · ∥3 · Koperniq");
  assert.equal(timerTabTitle("Koperniq", 1, 65), "▶ 0:01:05 · Koperniq");
  assert.equal(timerTabTitle("Koperniq", 0, 0), "Koperniq");
});

test("stripTimerTitle removes both prefix forms", () => {
  assert.equal(stripTimerTitle("▶ 0:42:00 · ∥3 · Koperniq"), "Koperniq");
  assert.equal(stripTimerTitle("▶ 1:12 · Koperniq"), "Koperniq");
  assert.equal(stripTimerTitle("Koperniq"), "Koperniq");
});
