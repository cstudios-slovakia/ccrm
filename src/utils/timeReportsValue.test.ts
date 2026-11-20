import test from "node:test";
import assert from "node:assert/strict";
import { buildReport, defaultThenBy, drillGroups, hoursPerDay, linesOfGroup, periodRange } from "./timeReports.ts";

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

test("drill-down children add up to their parent: rounding, currencies and the margin rule", () => {
  const base = { clientId: null, entryDate: "2026-05-04", title: "x" };
  const report = buildReport({
    entries: [
      { ...base, id: "a", userId: "u1", projectId: "p1", title: "t1", durationSec: 1000, billable: true, billableRate: 50, cost: 5, currency: "EUR" },
      { ...base, id: "b", userId: "u2", projectId: "p1", title: "t2", durationSec: 1100, billable: true, billableRate: 60, cost: 7, currency: "CZK" },
      // parallel entry: worked time differs, so it is left out of the margin ("≈")
      { ...base, id: "c", userId: "u1", projectId: "p1", title: "t1", durationSec: 1300, workedSec: 600, billable: true, billableRate: 50, cost: 3, currency: "EUR" },
      { ...base, id: "d", userId: "u2", projectId: "p1", title: "t3", durationSec: 400, billable: false, cost: 2, currency: "EUR" },
      { ...base, id: "e", userId: "u1", projectId: "p2", durationSec: 900, billable: false, currency: "EUR" },
    ],
    filters,
    canCosts: true,
    rounding: { minutes: 15 as const, mode: "up" as const },
    viewerUserId: "u1",
    currency: "EUR",
    workingDays: 20,
  });
  assert.equal(defaultThenBy("project"), "person");
  assert.equal(defaultThenBy("person"), "project");
  for (const g of report.groups) {
    const kids = drillGroups(linesOfGroup(report.lines, "project", g.key), "person");
    assert.equal(kids.reduce((s, k) => s + k.seconds, 0), g.seconds);
    assert.equal(kids.reduce((s, k) => s + k.workedSeconds, 0), g.workedSeconds);
    assert.equal(kids.reduce((s, k) => s + k.billableSeconds, 0), g.billableSeconds);
    for (const bag of ["cost", "billableValue"] as const) {
      const sum: Record<string, number> = {};
      for (const k of kids) for (const [c, v] of Object.entries(k[bag])) sum[c] = (sum[c] ?? 0) + v;
      for (const c of new Set([...Object.keys(sum), ...Object.keys(g[bag])])) assert.ok(Math.abs((sum[c] ?? 0) - (g[bag][c] ?? 0)) < 1e-9, `${bag} ${c}`);
    }
    // the group's own margin is the margin over its lines (same function the children use)
    assert.deepEqual(drillGroups(linesOfGroup(report.lines, "project", g.key), "project")[0].margin, g.margin);
  }
  const p1 = drillGroups(linesOfGroup(report.lines, "project", "p1"), "person");
  assert.equal(p1.find((k) => k.key === "u1")!.margin?.partial, true);
  assert.equal(report.groups.find((g) => g.key === "p1")!.margin?.partial, true);
  assert.ok(p1.find((k) => k.key === "u2")!.margin);
});
