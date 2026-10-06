import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MOCK_EMPLOYEES,
  generateDefaultMockSalaries,
  generateDefaultMockVacations,
} from "./mockEmployees.ts";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthPrefix = (d: Date, offset: number) => {
  const m = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  return `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
};
/** Does a leave record touch the given YYYY-MM month? */
const touchesMonth = (v: { startDate: string; endDate: string }, prefix: string) =>
  v.startDate.slice(0, 7) <= prefix && v.endDate.slice(0, 7) >= prefix;

// Dates picked to hit year boundaries, month ends, weekends and a leap day.
const SAMPLE_DATES = [
  new Date(2026, 0, 1),
  new Date(2026, 1, 28),
  new Date(2026, 9, 6),
  new Date(2026, 9, 10), // Saturday
  new Date(2026, 9, 11), // Sunday
  new Date(2026, 11, 31),
  new Date(2028, 1, 29),
];

test("demo vacations: every employee has leave in the month that is open by default", () => {
  for (const now of SAMPLE_DATES) {
    const vacations = generateDefaultMockVacations(now);
    for (const emp of DEFAULT_MOCK_EMPLOYEES) {
      const thisMonth = vacations.filter(
        (v) => v.employeeId === emp.id && touchesMonth(v, monthPrefix(now, 0))
      );
      assert.ok(thisMonth.length >= 2, `${emp.id} has ${thisMonth.length} leave record(s) in ${ymd(now)}'s month`);
    }
  }
});

test("demo vacations: neighbouring months are populated too", () => {
  for (const now of SAMPLE_DATES) {
    const vacations = generateDefaultMockVacations(now);
    for (const offset of [-2, -1, 1]) {
      const prefix = monthPrefix(now, offset);
      assert.ok(
        vacations.some((v) => touchesMonth(v, prefix)),
        `no leave in ${prefix} when seeded on ${ymd(now)}`
      );
    }
  }
});

test("demo vacations: somebody is on leave today, whatever day the CRM is installed", () => {
  for (const now of SAMPLE_DATES) {
    const today = ymd(now);
    const onLeave = generateDefaultMockVacations(now).filter(
      (v) => v.status !== "rejected" && today >= v.startDate && today <= v.endDate
    );
    assert.ok(onLeave.length >= 1, `nobody on leave on ${today}`);
  }
});

test("demo vacations: one employee's leave never overlaps (calendar paints the first match per day)", () => {
  for (const now of SAMPLE_DATES) {
    const vacations = generateDefaultMockVacations(now);
    for (const a of vacations) {
      for (const b of vacations) {
        if (a === b || a.employeeId !== b.employeeId) continue;
        assert.ok(
          a.endDate < b.startDate || b.endDate < a.startDate,
          `${a.id} (${a.startDate}..${a.endDate}) overlaps ${b.id} (${b.startDate}..${b.endDate}) for ${now.toDateString()}`
        );
      }
    }
  }
});

test("demo vacations: well-formed records", () => {
  for (const now of SAMPLE_DATES) {
    const vacations = generateDefaultMockVacations(now);
    const ids = new Set(vacations.map((v) => v.id));
    assert.equal(ids.size, vacations.length, "ids are unique");
    const today = ymd(now);
    for (const v of vacations) {
      assert.match(v.startDate, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(v.endDate, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(v.startDate <= v.endDate, `${v.id}: start after end`);
      assert.ok(v.daysCount >= 1);
      assert.ok(
        ["approved", "pending"].includes(v.status),
        `${v.id}: status "${v.status}" has no label in the detail view`
      );
      // Only future leave can still be waiting for approval.
      if (v.status === "pending") assert.ok(v.startDate > today, `${v.id}: pending leave in the past`);
      // Leave starts on a working day.
      const day = new Date(`${v.startDate}T12:00:00`).getDay();
      assert.ok(day !== 0 && day !== 6, `${v.id} starts on a weekend`);
    }
  }
});

test("demo vacations: stay within each employee's allowance per type and year", () => {
  for (const now of SAMPLE_DATES) {
    const used = new Map<string, number>();
    for (const v of generateDefaultMockVacations(now)) {
      const key = `${v.employeeId}|${v.vacationTypeId}|${v.startDate.slice(0, 4)}`;
      used.set(key, (used.get(key) ?? 0) + v.daysCount);
    }
    for (const [key, days] of used) {
      const [empId, typeId] = key.split("|");
      if (typeId === "unpaid") continue; // allowance is 0 by design: unpaid leave is unlimited
      const emp = DEFAULT_MOCK_EMPLOYEES.find((e) => e.id === empId)!;
      const allowance = emp.vacationAllowances?.[typeId] ?? 0;
      assert.ok(days <= allowance, `${key}: ${days} days > allowance ${allowance} (seeded ${ymd(now)})`);
    }
  }
});

test("demo salaries: months before the current one are paid, later ones pending", () => {
  const now = new Date(2026, 9, 6); // 6 Oct: payday (15th) not reached yet
  const salaries = generateDefaultMockSalaries(2026, now);
  assert.equal(salaries.length, DEFAULT_MOCK_EMPLOYEES.length * 12);
  for (const s of salaries) {
    const expected = s.periodNumber <= 9 ? "paid" : "pending";
    assert.equal(s.status, expected, `${s.id}`);
    assert.equal(s.totalPaid, expected === "paid" ? s.totalSalary : 0, `${s.id}`);
  }
});

test("demo salaries: the current month flips to paid once payday arrives", () => {
  const before = generateDefaultMockSalaries(2026, new Date(2026, 9, 13));
  const after = generateDefaultMockSalaries(2026, new Date(2026, 9, 14));
  assert.ok(before.filter((s) => s.periodNumber === 10).every((s) => s.status === "pending"));
  assert.ok(after.filter((s) => s.periodNumber === 10).every((s) => s.status === "paid"));
});

test("demo salaries: totals equal the sum of their items", () => {
  const now = new Date(2026, 9, 6);
  const salaries = generateDefaultMockSalaries(2026, now);
  for (const s of salaries) {
    const sum = s.items.reduce((acc, it) => acc + (it.salary ?? 0), 0);
    assert.equal(s.totalSalary, sum, s.id);
  }
  assert.ok(
    salaries.some((s) => s.items.some((it) => it.categoryId === "overtime")),
    "some overtime items for variety"
  );
});
