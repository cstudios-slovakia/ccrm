import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectCostItem } from "./timeTrackingApi.ts";
import { summarizeProjectLabourCosts } from "./projectTimeLabour.ts";

const item = (over: Partial<ProjectCostItem> = {}): ProjectCostItem => ({
  month: "2026-11",
  userId: "u-1",
  userName: "Alice",
  salaryType: "hourly",
  seconds: 3600,
  workedMs: 3_600_000,
  cost: 50,
  canSeeCost: true,
  complete: true,
  excluded: false,
  ...over,
});

test("known labour costs are summed even when another active contributor has no hourly cost", () => {
  const res = summarizeProjectLabourCosts(
    [
      item({ userId: "u-dev", cost: 2400.5, seconds: 144_000 }),
      item({ userId: "u-pm", cost: null, seconds: 7200, complete: false }),
    ],
    true,
  );
  assert.deepEqual(res, { labourCost: 2400.5, unpricedSeconds: 7200 });
});

test("partial unpricedSeconds on a mixed priced/unpriced row is preserved alongside known cost", () => {
  const res = summarizeProjectLabourCosts(
    [
      item({ userId: "u-1", cost: 1200.25, seconds: 72_000, unpricedSeconds: 3600, complete: false }),
      item({ userId: "u-2", cost: 300.75, seconds: 18_000, unpricedSeconds: 0, complete: true }),
    ],
    true,
  );
  assert.deepEqual(res, { labourCost: 1501, unpricedSeconds: 3600 });
});

test("excluded items do not add to labourCost or unpricedSeconds", () => {
  const res = summarizeProjectLabourCosts(
    [
      item({ userId: "u-1", cost: 1000, excluded: false }),
      item({ userId: "u-2", cost: 500, excluded: true }),
      item({ userId: "u-3", cost: null, seconds: 5400, excluded: true, complete: false }),
    ],
    true,
  );
  assert.deepEqual(res, { labourCost: 1000, unpricedSeconds: 0 });
});

test("withheld cost permission still hides the total labourCost", () => {
  const res = summarizeProjectLabourCosts(
    [
      item({ userId: "u-me", cost: 400, canSeeCost: true }),
      item({ userId: "u-other", cost: null, canSeeCost: false, complete: false }),
    ],
    false,
  );
  assert.deepEqual(res, { labourCost: null, unpricedSeconds: 0 });
});
