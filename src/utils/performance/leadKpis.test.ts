import test from "node:test";
import assert from "node:assert/strict";
import type { Lead } from "../../types/index.ts";
import { buildKpiStrip, computeLeadKpis, type LeadKpiResult } from "./leadKpis.ts";

const lead = (over: Partial<Lead>): Lead =>
  ({ id: "l", name: "Lead", status: "new", value: 0, createdAt: "2026-11-10", archived: false, ...over }) as unknown as Lead;

const groups = { won: "closed", lost: "closed", new: "in_progress", offer: "in_progress" };
const parents = { "won-extra": "won" };
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const range = { start: day(2026, 11, 1), end: day(2026, 11, 20) };

/*
  Hand-computed set, November 2026 (the dashboard's formula, dashboardMetrics.ts):
    a  new   1000  open
    b  offer  500  open
    c  new    300  open
    d  won   2000  closed, won
    e  won-extra (child of won) 1000  closed, won
    l  lost   700  closed, LOST: in the pipeline total, not won
    client-1  5000 a client record, not a lead
    f archived / unassigned-docs / h created 21 Nov / i created 31 Oct: excluded
  total = 6 (a, b, c, d, e, l); won = 2 (d, e), value 3000;
  conversion = 2 / 6 x 100; average deal = 1500.
*/
const set = [
  lead({ id: "a", status: "new", value: 1000 }),
  lead({ id: "b", status: "offer", value: 500 }),
  lead({ id: "c", status: "new", value: 300, createdAt: "2026-11-01" }),
  lead({ id: "d", status: "won", value: 2000, createdAt: "2026-11-20" }),
  lead({ id: "e", status: "won-extra", value: 1000 }),
  lead({ id: "l", status: "lost", value: 700 }),
  lead({ id: "client-1", status: "active", value: 5000 }),
  lead({ id: "f", status: "new", value: 999, archived: true }),
  lead({ id: "unassigned-docs", status: "new", value: 999 }),
  lead({ id: "h", status: "new", value: 999, createdAt: "2026-11-21" }),
  lead({ id: "i", status: "won", value: 999, createdAt: "2026-10-31" }),
];

test("pins the dashboard's formula on a hand-computed set", () => {
  const r = computeLeadKpis(set, range, groups, parents);
  assert.equal(r.total, 6);
  assert.deepEqual(r.won, { count: 2, value: 3000 });
  assert.ok(Math.abs(r.conversionPct - (2 / 6) * 100) < 1e-9);
});

test("a lost lead is not won and a client record is not a lead", () => {
  const lostOnly = computeLeadKpis([lead({ id: "l", status: "lost", value: 700 })], range, groups, parents);
  assert.deepEqual(lostOnly.won, { count: 0, value: 0 });
  assert.equal(lostOnly.total, 1);

  const clients = [lead({ id: "client-9", status: "client", value: 800 }), lead({ id: "x", status: "new", adjustment: 5 })];
  const clientOnly = computeLeadKpis(clients, range, groups, parents);
  assert.equal(clientOnly.total, 0);
  assert.equal(clientOnly.won.value, 0);
});

test("the first and the last day are in, the day before and after are out", () => {
  const total = (createdAt: string) => computeLeadKpis([lead({ id: "x", createdAt })], range, groups, parents).total;
  assert.deepEqual([total("2026-11-01"), total("2026-11-20"), total("2026-10-31"), total("2026-11-21")], [1, 1, 0, 0]);
  // A timestamp late on the last day is still inside.
  assert.equal(total("2026-11-20 23:30"), 1);
});

test("no range counts every lead; empty input is zeros; a lead without createdAt is never counted", () => {
  assert.equal(computeLeadKpis(set, { start: null, end: null }, groups, parents).total, 8);
  const empty = computeLeadKpis([], range, groups, parents);
  assert.equal(empty.total, 0);
  assert.equal(empty.won.count, 0);
  assert.equal(computeLeadKpis([lead({ id: "x", createdAt: "" })], { start: null, end: null }, groups, parents).total, 0);
});

const kpis = (total: number, wonCount: number, wonValue: number): LeadKpiResult => ({
  total,
  active: { count: total - wonCount, value: 0 },
  won: { count: wonCount, value: wonValue },
  conversionPct: total > 0 ? (wonCount / total) * 100 : 0,
});

test("buildKpiStrip: mapping and deltas against the previous period", () => {
  const current = computeLeadKpis(set, range, groups, parents);
  const previous = kpis(4, 1, 2000); // 25 %, average 2 000
  const offerSuccess = { ratePct: 62, accepted: 18, closed: 29 };
  const strip = buildKpiStrip({ current, previous, offerSuccess });

  assert.equal(strip.revenue.value, 3000);
  assert.equal(strip.revenue.deltaPct, 50);
  assert.equal(strip.leadConversion.converted, 2);
  assert.equal(strip.leadConversion.total, 6);
  assert.ok(Math.abs(strip.leadConversion.ratePct! - (2 / 6) * 100) < 1e-9);
  assert.ok(Math.abs(strip.leadConversion.deltaPp! - ((2 / 6) * 100 - 25)) < 1e-9);
  assert.equal(strip.averageDeal.value, 1500);
  assert.equal(strip.averageDeal.deals, 2);
  assert.equal(strip.averageDeal.deltaPct, -25);
  assert.deepEqual(strip.offerSuccess, offerSuccess);
});

test("buildKpiStrip: no delta when the previous value is 0, missing or the period is all time", () => {
  const current = computeLeadKpis(set, range, groups, parents);
  const offerSuccess = { ratePct: null, accepted: 0, closed: 0 };

  const vsZero = buildKpiStrip({ current, previous: kpis(0, 0, 0), offerSuccess });
  assert.equal(vsZero.revenue.deltaPct, null);
  assert.equal(vsZero.leadConversion.deltaPp, null);
  assert.equal(vsZero.averageDeal.deltaPct, null);

  assert.equal(buildKpiStrip({ current, previous: null, offerSuccess }).revenue.deltaPct, null);
  assert.equal(buildKpiStrip({ current, previous: kpis(3, 1, 100), offerSuccess, period: { preset: "all" } }).revenue.deltaPct, null);

  const empty = buildKpiStrip({ current: computeLeadKpis([], range, groups, parents), previous: null, offerSuccess });
  assert.equal(empty.leadConversion.ratePct, null);
  assert.equal(empty.leadConversion.total, 0);
  assert.equal(empty.averageDeal.value, null);
  assert.equal(empty.averageDeal.deals, 0);
});
