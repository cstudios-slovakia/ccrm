import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_COST_SETTINGS,
  computeCostRate,
  computeEntryCost,
  costRateTooltip,
  explainCostRate,
  type CostSettings,
} from "./timeCost.ts";
import { builtinWorkingDays } from "./holidays.ts";

const fixtures = JSON.parse(readFileSync(new URL("../../scripts/fixtures/time-cost-cases.json", import.meta.url), "utf8"));
const money = (n: number) => `€${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const t = (en: string) => en;

for (const c of fixtures.cases) {
  test(`timeCost fixture: ${c.name}`, () => {
    const settings: CostSettings = c.settings ?? fixtures.settings;
    const r = computeCostRate(c.person, c.workingDays, settings);
    assert.equal(r.rate, c.expect.rate);
    assert.equal(r.source, c.expect.source);
    assert.equal(r.basisDays, c.expect.basisDays);
    assert.equal(computeEntryCost(c.durationSec, r.rate), c.expect.cost);
  });
}

test("fixtures share the app's default settings", () => {
  assert.deepEqual(fixtures.settings, DEFAULT_COST_SETTINGS);
});

test("Erik: 3200 / 22 days = man-day 145.45, 18.18/h, x1.352 = 24.58/h; 2:15:00 costs 55.31", () => {
  const r = computeCostRate({ kind: "employee", salaryType: "monthly", salaryAmount: 3200 }, 22);
  assert.equal(r.manDay, 145.4545);
  assert.equal(r.rate, 24.5818);
  assert.equal(computeEntryCost(2 * 3600 + 15 * 60, r.rate), 55.31);
});

test("the monthly rate differs between months, driven by the calendar (May 20 days vs June 22)", () => {
  const erik = { kind: "employee", salaryType: "monthly", salaryAmount: 3200 };
  const may = builtinWorkingDays("SK", 2026, 5);
  const june = builtinWorkingDays("SK", 2026, 6);
  assert.equal(may, 20);
  assert.equal(june, 22);
  assert.equal(computeCostRate(erik, may).rate, 27.04);
  assert.equal(computeCostRate(erik, june).rate, 24.5818);
});

test("September 2026 in Slovakia has the same 22 working days as October (15 Sept is not a rest day in 2026)", () => {
  assert.equal(builtinWorkingDays("SK", 2026, 9), 22);
  assert.equal(builtinWorkingDays("SK", 2026, 10), 22);
});

test("the same salary in Oct 2026 Hungary uses 21 days (23 Oct is a Friday holiday)", () => {
  const days = builtinWorkingDays("HU", 2026, 10);
  assert.equal(days, 21);
  assert.equal(computeCostRate({ kind: "employee", salaryType: "monthly", salaryAmount: 3200 }, days).rate, 25.7524);
});

test("fixed hours basis ignores the month's working days", () => {
  const fixed: CostSettings = { ...DEFAULT_COST_SETTINGS, hoursBasis: "fixed", fixedHoursPerMonth: 160 };
  const a = computeCostRate({ kind: "employee", salaryType: "monthly", salaryAmount: 3200 }, 20, fixed);
  const b = computeCostRate({ kind: "employee", salaryType: "monthly", salaryAmount: 3200 }, 23, fixed);
  assert.equal(a.rate, b.rate);
  assert.equal(a.basisDays, null);
  assert.equal(a.basisHours, 160);
});

test("a person with no kind is priced as an employee; a contractor with no salary type as hourly", () => {
  assert.equal(computeCostRate({ salaryType: "hourly", salaryAmount: 10 }, 22).source, "hourly");
  assert.equal(computeCostRate({ kind: "contractor", salaryAmount: 10 }, 22).source, "contractor_hourly");
});

test("a negative, NaN or missing amount gives no rate", () => {
  for (const salaryAmount of [-5, Number.NaN, undefined, null]) {
    assert.equal(computeCostRate({ kind: "employee", salaryType: "hourly", salaryAmount }, 22).source, "none");
  }
});

test("cost is null without a rate or a duration, and 0 seconds costs 0", () => {
  assert.equal(computeEntryCost(3600, null), null);
  assert.equal(computeEntryCost(null, 20), null);
  assert.equal(computeEntryCost(0, 20), 0);
});

test("the frozen rate is explained in plain words", () => {
  const r = computeCostRate({ kind: "employee", salaryType: "monthly", salaryAmount: 3200 }, 22);
  const ctx = { t, money, monthLabel: "Oct 2026", country: "SK" };
  assert.equal(explainCostRate(r, DEFAULT_COST_SETTINGS, ctx), "€3,200.00 ÷ 22 working days (Oct 2026, SK) ÷ 8 h × 1.352 = €24.58/h");
  assert.equal(costRateTooltip(r, ctx), "Oct 2026 · 22 working days · man-day €145.45 · €24.58/h");
  assert.match(explainCostRate(computeCostRate(null, 22), DEFAULT_COST_SETTINGS, ctx), /no employee linked/);
});
