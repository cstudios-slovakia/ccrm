import test from "node:test";
import assert from "node:assert/strict";
import { isWeekend } from "./holidays.ts";
import { costRateTooltip, DEFAULT_COST_SETTINGS } from "./timeCost.ts";
import {
  buildTeamMatrix,
  visibleEntryCost,
  weekBuckets,
  type TeamEntry,
  type TeamPerson,
} from "./timeTeam.ts";

const settings = { ...DEFAULT_COST_SETTINGS };

const weekday = (_country: "SK" | "HU", iso: string) => !isWeekend(iso);

const person = (over: Partial<TeamPerson> & Pick<TeamPerson, "userId" | "name">): TeamPerson => ({
  roleName: "Employee",
  kind: "employee",
  employeeId: over.userId,
  active: false,
  workCountry: "SK",
  salaryType: "monthly",
  salaryAmount: 3200,
  ...over,
});

const entry = (over: Partial<TeamEntry> & Pick<TeamEntry, "userId" | "entryDate">): TeamEntry => ({
  projectId: "client",
  durationSec: 3600,
  cost: 0,
  currency: "EUR",
  ...over,
});

const base = {
  projects: [
    { id: "client", active: true },
    { id: "old", active: false },
  ],
  vacations: [] as { employeeId: string; startDate: string; endDate: string; status: string }[],
  viewerUserId: "u1",
  currency: "EUR",
  settings,
  today: "2026-05-04",
  bucketKind: "week" as const,
  activeOnly: false,
  projectId: null,
  isWorkingDay: weekday,
  monthWorkingDays: () => 20,
};

test("a week crossing a month sums each entry's frozen cost", () => {
  const buckets = weekBuckets("2026-05-03", 1);
  assert.deepEqual(buckets, [{ id: "2026-04-27", from: "2026-04-27", to: "2026-05-03" }]);
  const matrix = buildTeamMatrix({
    ...base,
    buckets,
    canCosts: true,
    people: [person({ userId: "u1", name: "Erik", employeeId: "e1" })],
    entries: [
      entry({
        userId: "u1",
        entryDate: "2026-04-30",
        cost: 10,
        costRate: 27.04,
        costRateSource: "monthly",
        costRateBasisDays: 20,
      }),
      entry({
        userId: "u1",
        entryDate: "2026-05-01",
        cost: 20,
        costRate: 24.58,
        costRateSource: "monthly",
        costRateBasisDays: 22,
      }),
    ],
  });
  const cell = matrix.rows[0].cells[0];
  assert.equal(cell.seconds, 7200);
  assert.equal(cell.cost.EUR, 30);
  assert.equal(matrix.totals.totalCost.EUR, 30);
  assert.equal(matrix.totals.totalSeconds, 7200);
  // Not 27.04×2 or 24.58×2 — those would be a rate re-derived for the week.
  assert.notEqual(cell.cost.EUR, 54.08);
  assert.notEqual(cell.cost.EUR, 49.16);
  const months = cell.rates.map((r) => `${r.month}:${r.rate.basisDays}`).sort();
  assert.deepEqual(months, ["2026-04:20", "2026-05:22"]);
  const may = cell.rates.find((r) => r.month === "2026-05");
  assert.ok(may);
  const tip = costRateTooltip(may.rate, {
    t: (en) => en,
    money: (n) => `€${n.toFixed(2)}`,
    monthLabel: "May 2026",
    country: "SK",
  });
  assert.match(tip, /May 2026/);
  assert.match(tip, /22 working days/);
  assert.match(tip, /€24\.58\/h/);
});

test("other people's cost is hidden; own cost and everyone's hours stay", () => {
  assert.equal(visibleEntryCost({ userId: "u2", cost: 7 }, "u1", false), null);
  assert.equal(visibleEntryCost({ userId: "u1", cost: 10 }, "u1", false), 10);
  const buckets = weekBuckets("2026-05-03", 1);
  const matrix = buildTeamMatrix({
    ...base,
    canCosts: false,
    buckets,
    people: [
      person({ userId: "u1", name: "Erik", employeeId: "e1" }),
      person({ userId: "u2", name: "Ada", employeeId: "e2", active: true }),
      person({ userId: "u3", name: "Bea", employeeId: "e3", active: true }),
    ],
    entries: [
      entry({ userId: "u1", entryDate: "2026-04-30", cost: 10, currency: "EUR", durationSec: 480 }),
      entry({ userId: "u2", entryDate: "2026-04-30", cost: 7, currency: "USD", durationSec: 3600 }),
    ],
    vacations: [{ employeeId: "e3", startDate: "2026-04-27", endDate: "2026-05-03", status: "approved" }],
  });
  const erik = matrix.rows.find((r) => r.userId === "u1");
  const ada = matrix.rows.find((r) => r.userId === "u2");
  const bea = matrix.rows.find((r) => r.userId === "u3");
  assert.ok(erik && ada && bea);
  assert.equal(erik.totalCost.EUR, 10);
  assert.equal(erik.cells[0].seconds, 480);
  assert.equal(ada.totalSeconds, 3600);
  assert.deepEqual(ada.totalCost, {});
  assert.equal(ada.showRate, false);
  assert.equal(bea.cells[0].vacation, true);
  assert.equal(bea.totalSeconds, 0);
  assert.equal(matrix.totals.totalSeconds, 4080);
  assert.deepEqual(matrix.totals.totalCost, { EUR: 10 });
  // Report rounding would turn 480s into 900s. The matrix must not.
  assert.equal(erik.cells[0].seconds, 480);
});

test("costs in two currencies are not added together", () => {
  const matrix = buildTeamMatrix({
    ...base,
    canCosts: true,
    buckets: weekBuckets("2026-05-03", 1),
    people: [person({ userId: "u1", name: "Erik", employeeId: "e1" })],
    entries: [
      entry({ userId: "u1", entryDate: "2026-04-30", cost: 10, currency: "EUR" }),
      entry({ userId: "u1", entryDate: "2026-05-01", cost: 5, currency: "USD" }),
    ],
  });
  assert.deepEqual(matrix.totals.totalCost, { EUR: 10, USD: 5 });
});

test("active projects only drops inactive projects and keeps zero-hour employees", () => {
  const matrix = buildTeamMatrix({
    ...base,
    canCosts: true,
    activeOnly: true,
    buckets: weekBuckets("2026-05-03", 1),
    people: [
      person({ userId: "u1", name: "Erik", employeeId: "e1" }),
      person({ userId: "u3", name: "Bea", employeeId: "e3", active: true }),
    ],
    entries: [
      entry({ userId: "u1", entryDate: "2026-04-30", projectId: "old", cost: 99 }),
      entry({ userId: "u1", entryDate: "2026-05-01", projectId: "client", cost: 4 }),
    ],
  });
  assert.equal(matrix.rows.find((r) => r.userId === "u1")?.totalCost.EUR, 4);
  assert.ok(matrix.rows.some((r) => r.userId === "u3" && r.totalSeconds === 0));
});
