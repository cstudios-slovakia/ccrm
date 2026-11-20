import test from "node:test";
import assert from "node:assert/strict";
import type { Lead } from "../../types/index.ts";
import { buildKpiStrip, computeLeadKpis } from "./leadKpis.ts";

const lead = (over: Partial<Lead>): Lead =>
  ({ id: "l", name: "Lead", status: "new", value: 0, createdAt: "2026-11-10", archived: false, ...over }) as unknown as Lead;

const groups = { won: "closed", lost: "closed", new: "in_progress", offer: "in_progress" };
const parents = { "won-extra": "won" };
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const range = { start: day(2026, 11, 1), end: day(2026, 11, 20) };

/*
  Hand-computed set, November 2026:
    a  new   1000  open
    b  offer  500  open
    c  new    300  open
    d  won   2000  closed -> revenue
    e  won-extra (child of won) 1000 closed -> revenue
    f  new   999   archived -> excluded
    g  new   999   unassigned-docs -> excluded
    h  new   999   created 21 Nov -> outside
    i  won   999   created 31 Oct -> outside
  open = 3 (a, b, c); won = 2 (d, e); revenue = 3000;
  conversion = 2 / 3 x 100; average deal = 1500.
*/
const set = [
  lead({ id: "a", status: "new", value: 1000 }),
  lead({ id: "b", status: "offer", value: 500 }),
  lead({ id: "c", status: "new", value: 300, createdAt: "2026-11-01" }),
  lead({ id: "d", status: "won", value: 2000, createdAt: "2026-11-20" }),
  lead({ id: "e", status: "won-extra", value: 1000 }),
  lead({ id: "f", status: "new", value: 999, archived: true }),
  lead({ id: "unassigned-docs", status: "new", value: 999 }),
  lead({ id: "h", status: "new", value: 999, createdAt: "2026-11-21" }),
  lead({ id: "i", status: "won", value: 999, createdAt: "2026-10-31" }),
];

test("pins the dashboard's formula on a hand-computed set", () => {
  const r = computeLeadKpis(set, range, groups, parents);
  assert.equal(r.revenue, 3000);
  assert.equal(r.wonCount, 2);
  assert.equal(r.openCount, 3);
  assert.ok(Math.abs(r.conversionPct! - (2 / 3) * 100) < 1e-9);
  assert.equal(r.averageDeal, 1500);
});

test("the first and the last day are in, the day before and after are out", () => {
  const first = computeLeadKpis([lead({ id: "x", createdAt: "2026-11-01" })], range, groups, parents);
  const last = computeLeadKpis([lead({ id: "x", createdAt: "2026-11-20" })], range, groups, parents);
  const before = computeLeadKpis([lead({ id: "x", createdAt: "2026-10-31" })], range, groups, parents);
  const after = computeLeadKpis([lead({ id: "x", createdAt: "2026-11-21" })], range, groups, parents);
  assert.deepEqual([first.openCount, last.openCount, before.openCount, after.openCount], [1, 1, 0, 0]);
  // A timestamp late on the last day is still inside.
  const late = computeLeadKpis([lead({ id: "x", createdAt: "2026-11-20 23:30" })], range, groups, parents);
  assert.equal(late.openCount, 1);
});

test("no range counts every lead; empty input and zero denominators give null, not NaN", () => {
  assert.equal(computeLeadKpis(set, { start: null, end: null }, groups, parents).openCount, 4);

  const empty = computeLeadKpis([], range, groups, parents);
  assert.deepEqual(empty, { revenue: 0, wonCount: 0, openCount: 0, conversionPct: null, averageDeal: null });

  const onlyWon = computeLeadKpis([lead({ id: "w", status: "won", value: 10 })], range, groups, parents);
  assert.equal(onlyWon.openCount, 0);
  assert.equal(onlyWon.conversionPct, null);
  assert.equal(onlyWon.averageDeal, 10);
});

test("a lead without createdAt is never counted", () => {
  assert.equal(computeLeadKpis([lead({ id: "x", createdAt: "" })], { start: null, end: null }, groups, parents).openCount, 0);
});

test("buildKpiStrip: deltas against the previous period", () => {
  const current = computeLeadKpis(set, range, groups, parents);
  const previous = { revenue: 2000, wonCount: 1, openCount: 4, conversionPct: 25, averageDeal: 2000 };
  const offerSuccess = { ratePct: 62, accepted: 18, closed: 29 };
  const strip = buildKpiStrip({ current, previous, offerSuccess });

  assert.equal(strip.revenue.value, 3000);
  assert.equal(strip.revenue.deltaPct, 50);
  assert.equal(strip.leadConversion.converted, 2);
  assert.equal(strip.leadConversion.total, 3);
  assert.ok(Math.abs(strip.leadConversion.deltaPp! - ((2 / 3) * 100 - 25)) < 1e-9);
  assert.equal(strip.averageDeal.value, 1500);
  assert.equal(strip.averageDeal.deals, 2);
  assert.equal(strip.averageDeal.deltaPct, -25);
  assert.deepEqual(strip.offerSuccess, offerSuccess);
});

test("buildKpiStrip: no delta when the previous value is 0, missing or the period is all time", () => {
  const current = computeLeadKpis(set, range, groups, parents);
  const offerSuccess = { ratePct: null, accepted: 0, closed: 0 };
  const zero = { revenue: 0, wonCount: 0, openCount: 0, conversionPct: null, averageDeal: null };

  const vsZero = buildKpiStrip({ current, previous: zero, offerSuccess });
  assert.equal(vsZero.revenue.deltaPct, null);
  assert.equal(vsZero.leadConversion.deltaPp, null);
  assert.equal(vsZero.averageDeal.deltaPct, null);

  const none = buildKpiStrip({ current, previous: null, offerSuccess });
  assert.equal(none.revenue.deltaPct, null);

  const all = buildKpiStrip({ current, previous: { ...zero, revenue: 100 }, offerSuccess, period: { preset: "all" } });
  assert.equal(all.revenue.deltaPct, null);

  const empty = buildKpiStrip({ current: computeLeadKpis([], range, groups, parents), previous: null, offerSuccess });
  assert.equal(empty.leadConversion.ratePct, null);
  assert.equal(empty.averageDeal.value, null);
  assert.equal(empty.averageDeal.deals, 0);
});
