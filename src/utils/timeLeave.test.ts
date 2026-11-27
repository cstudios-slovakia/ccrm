import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leaveDaysInMonth, leaveTypeIsPaid } from "./timeLeave.ts";
import { builtinHolidays, builtinWorkingDays, isWeekend, makeHolidayCalendar } from "./holidays.ts";
import { computeCostRate } from "./timeCost.ts";

const fixtures = JSON.parse(readFileSync(new URL("../../scripts/fixtures/time-leave-cases.json", import.meta.url), "utf8"));
const holidays = new Set<string>(fixtures.holidays);
const isWorkingDay = (iso: string) => !isWeekend(iso) && !holidays.has(iso);

for (const c of fixtures.cases) {
  test(`timeLeave fixture: ${c.name}`, () => {
    const got = leaveDaysInMonth(c.rows, c.month, isWorkingDay, leaveTypeIsPaid(c.vacationTypes ?? fixtures.vacationTypes));
    assert.deepEqual(got, c.expect);
  });
}

test("the fixture calendar is the built-in SK 2026 calendar", () => {
  assert.deepEqual(fixtures.holidays, builtinHolidays("SK", 2026).map((h) => h.date));
});

test("Erik end to end: booked leave in May 2026 SK gives D4.1's €32.4480", () => {
  const cal = makeHolidayCalendar("SK", builtinHolidays("SK", 2026));
  const rows = [
    { startDate: "2026-05-11", endDate: "2026-05-13", daysCount: 3, status: "approved", vacationTypeId: "annual" },
    { startDate: "2026-05-18", endDate: "2026-05-19", daysCount: 2, status: "approved", vacationTypeId: "unpaid" },
  ];
  const leave = leaveDaysInMonth(rows, "2026-05", cal.isWorkingDay, leaveTypeIsPaid(null));
  const r = computeCostRate({ kind: "employee", salaryType: "monthly", salaryAmount: 3200 }, builtinWorkingDays("SK", 2026, 5), undefined, {
    paidLeaveDays: leave.paid,
    unpaidLeaveDays: leave.unpaid,
  });
  assert.equal(r.rate, 32.448);
  assert.equal(r.monthCost, 3893.76);
  assert.equal(r.basisHours, 120);
});
