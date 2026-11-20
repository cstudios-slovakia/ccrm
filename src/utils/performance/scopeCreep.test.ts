import test from "node:test";
import assert from "node:assert/strict";
import type { AcceptanceCriterion, Project } from "../../types/index.ts";
import { buildPeriod } from "./period.ts";
import { computeScopeCreep } from "./scopeCreep.ts";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const NOW = new Date(2026, 10, 20, 15, 30);
const period = buildPeriod("custom", day(2026, 11, 1), day(2026, 11, 20), NOW); // 1 Nov 00:00 - 20 Nov 23:59:59.999 local
const ALL = buildPeriod("all", null, null, NOW);

/** The UTC instant ("...Z") of a local wall-clock time, so the tests hold in any time zone. */
const utc = (y: number, m: number, d: number, hh = 0, mm = 0, ss = 0, ms = 0): string => new Date(y, m - 1, d, hh, mm, ss, ms).toISOString();

const APPROVED = utc(2026, 10, 5, 12);
const crit = (id: string, createdAt: string, over: Partial<AcceptanceCriterion> = {}): AcceptanceCriterion => ({
  id, title: id, done: false, createdAt, createdBy: "A", removedAt: null, removedBy: null, ...over,
});
const project = (id: string, criteria: AcceptanceCriterion[], over: Partial<Project> = {}): Project =>
  ({ id, name: id.toUpperCase(), projectTypeId: "t", status: "active", managers: [], data: {}, acceptanceCriteria: criteria, scopeApprovedAt: APPROVED, ...over }) as unknown as Project;
const before = utc(2026, 10, 1);
const inside = utc(2026, 11, 10, 9);

test("no projects: zeros, no share, no rows, scale 1", () => {
  assert.deepEqual(computeScopeCreep({ projects: [], period }), { addedInPeriod: 0, originalTotal: 0, sharePct: null, rows: [], scaleMax: 1 });
});

test("approved project without additions counts its original scope and gets no row", () => {
  const data = computeScopeCreep({ projects: [project("a", [crit("1", before), crit("2", before)])], period });
  assert.equal(data.originalTotal, 2);
  assert.equal(data.addedInPeriod, 0);
  assert.equal(data.sharePct, 0);
  assert.deepEqual(data.rows, []);
});

test("zero original scope: additions are counted but the share is null", () => {
  const data = computeScopeCreep({ projects: [project("a", [crit("1", inside)])], period });
  assert.equal(data.addedInPeriod, 1);
  assert.equal(data.originalTotal, 0);
  assert.equal(data.sharePct, null);
  assert.deepEqual(data.rows, [{ projectId: "a", name: "A", original: 0, added: 1 }]);
  assert.equal(data.scaleMax, 1);
});

test("a criterion created exactly at the approval instant is original", () => {
  const data = computeScopeCreep({
    projects: [project("a", [crit("1", APPROVED), crit("2", utc(2026, 10, 5, 12, 0, 0, 1)), crit("3", inside)])],
    period: ALL,
  });
  assert.equal(data.originalTotal, 1);
  assert.equal(data.addedInPeriod, 2);
});

test("period boundary: the UTC instant is compared with the local day bounds", () => {
  const lastMoment = utc(2026, 11, 20, 23, 59, 59, 999); // inside (the end is inclusive)
  const nextDay = utc(2026, 11, 21, 0, 0, 0, 0); // outside
  const firstMoment = utc(2026, 11, 1, 0, 0, 0, 0); // inside
  const dayBefore = utc(2026, 10, 31, 23, 59, 59, 999); // outside, but after the approval
  const data = computeScopeCreep({
    projects: [project("a", [crit("1", lastMoment), crit("2", nextDay), crit("3", firstMoment), crit("4", dayBefore)])],
    period,
  });
  assert.equal(data.addedInPeriod, 2);
  // a criterion added outside the period is not part of the original scope either
  assert.equal(data.originalTotal, 0);
});

test("period all counts every addition", () => {
  const data = computeScopeCreep({
    projects: [project("a", [crit("0", before), crit("1", utc(2026, 10, 6)), crit("2", inside), crit("3", utc(2026, 12, 1))])],
    period: ALL,
  });
  assert.equal(data.originalTotal, 1);
  assert.equal(data.addedInPeriod, 3);
});

test("a removed criterion counts nowhere", () => {
  const removed = utc(2026, 11, 12);
  const data = computeScopeCreep({
    projects: [project("a", [crit("1", before, { removedAt: removed }), crit("2", inside, { removedAt: removed }), crit("3", before), crit("4", inside)])],
    period,
  });
  assert.equal(data.originalTotal, 1);
  assert.equal(data.addedInPeriod, 1);
});

test("an unapproved or archived project is ignored", () => {
  const data = computeScopeCreep({
    projects: [
      project("a", [crit("1", inside)], { scopeApprovedAt: null }),
      project("b", [crit("2", before), crit("3", inside)], { archived: true }),
      project("c", [crit("4", before), crit("5", inside)]),
    ],
    period,
  });
  assert.equal(data.originalTotal, 1);
  assert.equal(data.addedInPeriod, 1);
  assert.deepEqual(data.rows.map((r) => r.projectId), ["c"]);
});

test("more than five projects: the five with most additions, most first; totals cover all", () => {
  const projects = ["a", "b", "c", "d", "e", "f", "g"].map((id, i) =>
    project(id, [crit(`${id}-o`, before), ...Array.from({ length: i + 1 }, (_, n) => crit(`${id}-${n}`, inside))]),
  );
  const data = computeScopeCreep({ projects, period });
  assert.deepEqual(data.rows.map((r) => r.projectId), ["g", "f", "e", "d", "c"]);
  assert.equal(data.addedInPeriod, 1 + 2 + 3 + 4 + 5 + 6 + 7);
  assert.equal(data.originalTotal, 7);
  assert.equal(data.scaleMax, 8); // g: 1 original + 7 added
  assert.equal(data.sharePct, (28 / 7) * 100);
});

test("rows with equal additions are ordered by name; a project without a name takes the paired lead's", () => {
  const projects = [
    project("p2", [crit("a", inside)], { name: "Zeta" }),
    project("p1", [crit("b", inside)], { name: "", leadId: "l1" }),
  ];
  const data = computeScopeCreep({ projects, period, leads: [{ id: "l1", name: "Alfa client" }] });
  assert.deepEqual(data.rows.map((r) => r.name), ["Alfa client", "Zeta"]);
});
