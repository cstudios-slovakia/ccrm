import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allocateWorkedMs, unionLengthMs, workedMsForHoursOnly, type AllocationEntry } from "./timeAllocation.ts";

interface Case {
  name: string;
  entries: AllocationEntry[];
  expect: Record<string, number>;
  rate?: number;
  expectCost?: Record<string, number>;
  expectTotalCost?: number;
  billableRate?: number;
  expectBillable?: Record<string, number>;
  expectBillableTotal?: number;
}

const fixtures: { cases: Case[]; invariants: string[] } = JSON.parse(
  readFileSync(new URL("../../scripts/fixtures/time-allocation-cases.json", import.meta.url), "utf8"),
);
const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const toObject = (m: Map<string, number>) => Object.fromEntries([...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** I1-I4 for one input; returns the allocation. */
function checkInvariants(entries: AllocationEntry[], label: string): Map<string, number> {
  const worked = allocateWorkedMs(entries);
  const sum = [...worked.values()].reduce((s, v) => s + v, 0);
  assert.equal(sum, unionLengthMs(entries), `${label}: I1 sum = union`);
  for (const e of entries) {
    const w = worked.get(e.id)!;
    assert.ok(Number.isInteger(w), `${label}: ${e.id} integer`);
    const dur = Math.max(0, e.endMs - e.startMs);
    assert.ok(w <= dur, `${label}: I3 ${e.id} worked <= duration`);
    if (dur > 0) assert.ok(w > 0, `${label}: I3 ${e.id} worked > 0`);
    const alone = dur > 0 && entries.every((o) => o === e || o.endMs <= o.startMs || o.endMs <= e.startMs || o.startMs >= e.endMs);
    if (alone) assert.equal(w, dur, `${label}: I2 ${e.id} alone keeps its duration`);
  }
  const reversed = allocateWorkedMs([...entries].reverse());
  assert.deepEqual(toObject(reversed), toObject(worked), `${label}: I4 order independent`);
  return worked;
}

for (const c of fixtures.cases) {
  test(`timeAllocation fixture: ${c.name}`, () => {
    const worked = checkInvariants(c.entries, c.name);
    assert.deepEqual(toObject(worked), c.expect);
    if (c.rate !== undefined) {
      const rate = c.rate;
      for (const [id, cost] of Object.entries(c.expectCost ?? {})) {
        assert.equal(round4((worked.get(id)! / 3600000) * rate), cost, `${id} cost`);
      }
      const total = [...worked.values()].reduce((s, v) => s + v, 0);
      assert.equal(round2((total / 3600000) * rate), c.expectTotalCost);
    }
    if (c.billableRate !== undefined) {
      const rate = c.billableRate;
      let total = 0;
      for (const e of c.entries) {
        const billable = round2(((e.endMs - e.startMs) / 3600000) * rate);
        assert.equal(billable, c.expectBillable?.[e.id], `${e.id} billable`);
        total += billable;
      }
      assert.equal(round2(total), c.expectBillableTotal);
    }
  });
}

test("fixtures list the four invariants of D2", () => {
  assert.deepEqual(fixtures.invariants.map((s) => s.slice(0, 3)), ["I1.", "I2.", "I3.", "I4."]);
});

test("hours-only entries: worked = duration", () => {
  assert.equal(workedMsForHoursOnly(5400), 5400000);
  assert.equal(workedMsForHoursOnly(0), 0);
});

test("empty input gives an empty map", () => {
  assert.equal(allocateWorkedMs([]).size, 0);
});

// Deterministic pseudo-random cases (mulberry32), checked against I1-I4 and a naive reference.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** O(stretches × n) reference straight from the D2 text. */
function naive(entries: AllocationEntry[]): Map<string, number> {
  const out = new Map(entries.map((e) => [e.id, 0]));
  const timed = entries.filter((e) => e.endMs > e.startMs);
  const pts = [...new Set(timed.flatMap((e) => [e.startMs, e.endMs]))].sort((a, b) => a - b);
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const act = timed
      .filter((e) => e.startMs <= a && e.endMs >= b)
      .sort((x, y) => x.startMs - y.startMs || (x.id < y.id ? -1 : 1));
    act.forEach((e, k) => out.set(e.id, out.get(e.id)! + Math.floor((b - a) / act.length) + (k < (b - a) % act.length ? 1 : 0)));
  }
  return out;
}

test("200 seeded random cases satisfy I1-I4 and match the naive reference", () => {
  const rnd = mulberry32(20261119);
  const T0 = 1777885200000;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  for (let c = 0; c < 200; c++) {
    const n = 1 + Math.floor(rnd() * 9);
    const ids = new Set<string>();
    while (ids.size < n) ids.add(Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join(""));
    const entries = [...ids].map((id) => {
      // Coarse grid so identical and touching bounds happen often, plus odd ms now and then.
      const startMs = T0 + Math.floor(rnd() * 12) * 900000 + (rnd() < 0.3 ? Math.floor(rnd() * 1000) : 0);
      const len = rnd() < 0.05 ? 0 : Math.floor(rnd() * 8) * 900000 + (rnd() < 0.3 ? Math.floor(rnd() * 1000) : 0);
      return { id, startMs, endMs: startMs + len };
    });
    const worked = checkInvariants(entries, `random #${c}`);
    assert.deepEqual(toObject(worked), toObject(naive(entries)), `random #${c} vs naive`);
  }
});

test("a large input (5000 entries) stays fast", () => {
  const entries: AllocationEntry[] = [];
  for (let i = 0; i < 5000; i++) entries.push({ id: `x${i}`, startMs: i * 60000, endMs: i * 60000 + 300000 + (i % 7) });
  const t = performance.now();
  const worked = allocateWorkedMs(entries);
  assert.ok(performance.now() - t < 1000);
  assert.equal([...worked.values()].reduce((s, v) => s + v, 0), unionLengthMs(entries));
});
