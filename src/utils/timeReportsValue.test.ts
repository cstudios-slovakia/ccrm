import test from "node:test";
import assert from "node:assert/strict";
import { buildReport, hoursPerDay, periodRange } from "./timeReports.ts";

const filters = { from: "2026-05-01", to: "2026-05-31", userId: null, projectId: null, clientId: null, billable: "all" as const, groupBy: "project" as const };
const common = { rounding: { minutes: 0 as const, mode: "nearest" as const }, viewerUserId: "u1", currency: "EUR", workingDays: 20 };

test("billable value, margin and the internal split", () => {
  const base = { userId: "u1", clientId: null, entryDate: "2026-05-04", title: "x", currency: "EUR" };
  const report = buildReport({
    entries: [
      { ...base, id: "a", projectId: "p1", durationSec: 7200, billable: true, billableRate: 50, cost: 40 },
      { ...base, id: "b", projectId: "p1", durationSec: 3600, billable: false, billableRate: 50, cost: 20 },
      { ...base, id: "c", projectId: "pi", internal: true, durationSec: 3600, billable: false, cost: 20 },
      { ...base, id: "d", projectId: null, durationSec: 1800, billable: false, cost: 10 },
    ],
    filters,
    canCosts: true,
    ...common,
  });
  assert.deepEqual(report.totals.billableValue, { EUR: 100 });
  assert.deepEqual(report.totals.costSplit, { client: { EUR: 60 }, internal: { EUR: 20 }, unallocated: { EUR: 10 } });
  const p1 = report.groups.find((g) => g.key === "p1");
  const pi = report.groups.find((g) => g.key === "pi");
  assert.deepEqual(p1!.margin, { amount: { EUR: 40 }, partial: false });
  assert.equal(pi!.margin, null);

  const hidden = buildReport({
    entries: [{ ...base, id: "a", projectId: "p1", durationSec: 3600, billable: true, billableRate: 50 }],
    filters,
    canCosts: false,
    ...common,
  });
  assert.deepEqual(hidden.totals.billableValue, {});
});

test("hours per day and the period presets", () => {
  const base = { userId: "u1", projectId: "p", clientId: null, title: "x", workedSeconds: 0, cost: {}, billableValue: null, currency: "EUR", internal: false };
  const bars = hoursPerDay(
    [
      { ...base, id: "a", entryDate: "2026-05-04", seconds: 3600, billable: true },
      { ...base, id: "b", entryDate: "2026-05-04", seconds: 1800, billable: false },
      { ...base, id: "c", entryDate: "2026-05-09", seconds: 600, billable: true },
    ],
    ["2026-05-04", "2026-05-05"],
  );
  assert.deepEqual(bars, [
    { date: "2026-05-04", billableSeconds: 3600, otherSeconds: 1800 },
    { date: "2026-05-05", billableSeconds: 0, otherSeconds: 0 },
  ]);
  assert.deepEqual(periodRange("thisMonth", "2026-03-15"), { from: "2026-03-01", to: "2026-03-31" });
  assert.deepEqual(periodRange("lastMonth", "2026-01-15"), { from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(periodRange("thisWeek", "2026-05-06"), { from: "2026-05-04", to: "2026-05-10" });
  assert.deepEqual(periodRange("lastWeek", "2026-05-06"), { from: "2026-04-27", to: "2026-05-03" });
  assert.deepEqual(periodRange("thisYear", "2026-05-06"), { from: "2026-01-01", to: "2026-12-31" });
  assert.equal(periodRange("custom", "2026-05-06"), null);
});

test("margin leaves out parallel, cost-less and uses unrounded value", () => {
  const base = { userId: "u1", clientId: null, entryDate: "2026-05-04", title: "x", currency: "EUR", projectId: "p", billable: true, billableRate: 60 };
  const run = (entries: Parameters<typeof buildReport>[0]["entries"], rounding = common.rounding) =>
    buildReport({ entries, filters, canCosts: true, ...common, rounding }).totals.margin;
  // (a) parallel: worked 1800 of 3600 -> excluded, nothing qualifies
  assert.equal(run([{ ...base, id: "a", durationSec: 3600, workedSec: 1800, cost: 10 }]), null);
  // (b) rate but no cost -> excluded; the other line gives a partial margin
  assert.deepEqual(run([{ ...base, id: "a", durationSec: 3600, cost: 20 }, { ...base, id: "b", durationSec: 3600 }]), { amount: { EUR: 40 }, partial: true });
  // (c) 8 min rounds to 15; value uses the real 8 min = 8
  assert.deepEqual(run([{ ...base, id: "a", durationSec: 480, cost: 3 }], { minutes: 15, mode: "nearest" }), { amount: { EUR: 5 }, partial: false });
});
