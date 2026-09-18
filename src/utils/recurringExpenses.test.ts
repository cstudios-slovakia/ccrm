import assert from "node:assert/strict";
import test from "node:test";
import {
  recurringAmountHistoryAfterChange,
  recurringAmountsAt,
  recurringCharges,
  recurringOccurrences,
  recurringPlannedAmountAt,
  recurringTotalInRange,
  shiftIsoDate,
  type RecurringRule
} from "./recurringExpenses.ts";

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  amountPlanned: 500,
  amountReal: 0,
  isRecurring: true,
  recurringFrequency: "monthly",
  recurringConfig: { monthlyType: "day_of_month", dayOfMonth: 1 },
  recurringStartDate: "2026-01-01",
  recurringEndDate: null,
  recurringAmountHistory: null,
  ...over
});

test("a rule with no history charges its current amount on any date", () => {
  const rent = rule();
  assert.equal(recurringPlannedAmountAt(rent, "2025-03-01"), 500);
  assert.equal(recurringPlannedAmountAt(rent, "2030-03-01"), 500);
});

test("raising the amount leaves past charges alone and applies from the change", () => {
  const rent = rule();
  const history = recurringAmountHistoryAfterChange(rent, { amountPlanned: 600, amountReal: 0 }, "2026-09-17");
  assert.deepEqual(history, [{ until: "2026-09-16", amountPlanned: 500, amountReal: 0 }]);

  const raised = { ...rent, amountPlanned: 600, recurringAmountHistory: history };
  // Every charge already made stays at the old price...
  assert.equal(recurringPlannedAmountAt(raised, "2026-01-01"), 500);
  assert.equal(recurringPlannedAmountAt(raised, "2026-09-01"), 500);
  // ...and the next one is the first at the new price.
  assert.equal(recurringPlannedAmountAt(raised, "2026-10-01"), 600);
});

test("a second change adds a period without disturbing the first", () => {
  const rent = rule({
    amountPlanned: 600,
    recurringAmountHistory: [{ until: "2026-09-16", amountPlanned: 500, amountReal: 0 }]
  });
  const history = recurringAmountHistoryAfterChange(rent, { amountPlanned: 750, amountReal: 0 }, "2026-11-05");
  const raised = { ...rent, amountPlanned: 750, recurringAmountHistory: history };

  assert.equal(recurringPlannedAmountAt(raised, "2026-08-01"), 500);
  assert.equal(recurringPlannedAmountAt(raised, "2026-10-01"), 600);
  assert.equal(recurringPlannedAmountAt(raised, "2026-11-01"), 600);
  assert.equal(recurringPlannedAmountAt(raised, "2026-12-01"), 750);
});

test("out-of-order history still resolves by the tightest period", () => {
  const rent = rule({
    amountPlanned: 750,
    recurringAmountHistory: [
      { until: "2026-11-04", amountPlanned: 600, amountReal: 0 },
      { until: "2026-09-16", amountPlanned: 500, amountReal: 0 }
    ]
  });
  assert.equal(recurringPlannedAmountAt(rent, "2026-09-01"), 500);
  assert.equal(recurringPlannedAmountAt(rent, "2026-10-01"), 600);
  assert.equal(recurringPlannedAmountAt(rent, "2026-12-01"), 750);
});

test("nothing is pinned when the amount did not move, or the record is a one-off", () => {
  const rent = rule();
  assert.equal(recurringAmountHistoryAfterChange(rent, { amountPlanned: 500, amountReal: 0 }, "2026-09-17"), null);
  assert.equal(
    recurringAmountHistoryAfterChange({ ...rent, isRecurring: false }, { amountPlanned: 900, amountReal: 0 }, "2026-09-17"),
    null
  );
});

test("a rule that has not charged yet is simply corrected, not versioned", () => {
  const fresh = rule({ recurringStartDate: "2026-09-17" });
  assert.equal(recurringAmountHistoryAfterChange(fresh, { amountPlanned: 550, amountReal: 0 }, "2026-09-17"), null);

  // Started two weeks ago, but the first charge is only on the 20th.
  const notYetDue = rule({
    recurringStartDate: "2026-09-01",
    recurringConfig: { monthlyType: "day_of_month", dayOfMonth: 20 }
  });
  assert.equal(recurringAmountHistoryAfterChange(notYetDue, { amountPlanned: 550, amountReal: 0 }, "2026-09-17"), null);

  // Same rule, but its charge on the 1st has already gone out.
  const alreadyDue = rule({ recurringStartDate: "2026-09-01" });
  assert.deepEqual(recurringAmountHistoryAfterChange(alreadyDue, { amountPlanned: 550, amountReal: 0 }, "2026-09-17"), [
    { until: "2026-09-16", amountPlanned: 500, amountReal: 0 }
  ]);
});

test("a second edit on the same day keeps the first pin", () => {
  const rent = rule({
    amountPlanned: 600,
    recurringAmountHistory: [{ until: "2026-09-16", amountPlanned: 500, amountReal: 0 }]
  });
  const history = recurringAmountHistoryAfterChange(rent, { amountPlanned: 640, amountReal: 0 }, "2026-09-17");
  assert.deepEqual(history, [{ until: "2026-09-16", amountPlanned: 500, amountReal: 0 }]);
});

test("a rule that already ended still pins what it used to charge", () => {
  const ended = rule({ recurringEndDate: "2026-06-30" });
  const history = recurringAmountHistoryAfterChange(ended, { amountPlanned: 600, amountReal: 0 }, "2026-09-17");
  const edited = { ...ended, amountPlanned: 600, recurringAmountHistory: history };
  assert.equal(recurringPlannedAmountAt(edited, "2026-05-01"), 500);
});

test("the settled amount is versioned alongside the planned one", () => {
  const rent = rule({ amountPlanned: 0, amountReal: 480 });
  const history = recurringAmountHistoryAfterChange(rent, { amountPlanned: 0, amountReal: 520 }, "2026-09-17");
  const edited = { ...rent, amountReal: 520, recurringAmountHistory: history };
  assert.deepEqual(recurringAmountsAt(edited, "2026-08-01"), { amountPlanned: 0, amountReal: 480 });
  assert.equal(recurringPlannedAmountAt(edited, "2026-08-01"), 480);
  assert.equal(recurringPlannedAmountAt(edited, "2026-10-01"), 520);
});

test("a paid amount outranks the plan — the rule's row, the recurring tab and the forecast agree", () => {
  // Budgeted at 2 000, actually paying 2 200: every charge is worth 2 200.
  const rent = rule({ amountPlanned: 2000, amountReal: 2200 });
  assert.equal(recurringPlannedAmountAt(rent, "2026-10-01"), 2200);
  assert.deepEqual(recurringCharges(rent, "2026-10-01", "2026-11-30"), [
    { date: "2026-10-01", amount: 2200 },
    { date: "2026-11-01", amount: 2200 }
  ]);

  // Raising only the paid amount re-prices the next charge, not the past ones.
  const history = recurringAmountHistoryAfterChange(rent, { amountPlanned: 2000, amountReal: 2350 }, "2026-09-18");
  const raised = { ...rent, amountReal: 2350, recurringAmountHistory: history };
  assert.equal(recurringPlannedAmountAt(raised, "2026-09-01"), 2200);
  assert.equal(recurringPlannedAmountAt(raised, "2026-10-01"), 2350);
});

test("monthly occurrences follow the configured day and clamp to short months", () => {
  const endOfMonth = rule({ recurringConfig: { monthlyType: "day_of_month", dayOfMonth: 31 } });
  assert.deepEqual(recurringOccurrences(endOfMonth, "2026-01-01", "2026-04-30"), [
    "2026-01-31",
    "2026-02-28",
    "2026-03-31",
    "2026-04-30"
  ]);
});

test("monthly nth-weekday rules land on the right week", () => {
  // 2nd Tuesday of each month; 2026-09-01 is a Tuesday.
  const payroll = rule({ recurringConfig: { monthlyType: "nth_weekday", weekOfMonth: 2, dayOfWeek: 2 } });
  assert.deepEqual(recurringOccurrences(payroll, "2026-09-01", "2026-10-31"), ["2026-09-08", "2026-10-13"]);

  const lastFriday = rule({ recurringConfig: { monthlyType: "nth_weekday", weekOfMonth: -1, dayOfWeek: 5 } });
  assert.deepEqual(recurringOccurrences(lastFriday, "2026-09-01", "2026-09-30"), ["2026-09-25"]);
});

test("weekly rules charge once per week on their weekday", () => {
  const cleaning = rule({ recurringFrequency: "weekly", recurringConfig: { dayOfWeek: 3 } });
  assert.deepEqual(recurringOccurrences(cleaning, "2026-09-01", "2026-09-30"), [
    "2026-09-02",
    "2026-09-09",
    "2026-09-16",
    "2026-09-23",
    "2026-09-30"
  ]);
});

test("yearly rules charge in their month only", () => {
  const insurance = rule({ recurringFrequency: "yearly", recurringConfig: { month: 3, dayOfMonth: 15 } });
  assert.deepEqual(recurringOccurrences(insurance, "2026-01-01", "2027-12-31"), ["2026-03-15", "2027-03-15"]);
  assert.deepEqual(recurringOccurrences(insurance, "2026-07-01", "2026-09-30"), []);
});

test("the rule's own start and end dates bound the occurrences", () => {
  const bounded = rule({ recurringStartDate: "2026-03-01", recurringEndDate: "2026-05-01" });
  assert.deepEqual(recurringOccurrences(bounded, "2026-01-01", "2026-12-31"), [
    "2026-03-01",
    "2026-04-01",
    "2026-05-01"
  ]);
});

test("a period total mixes the old and the new price at the right dates", () => {
  const rent = rule({
    amountPlanned: 600,
    recurringAmountHistory: [{ until: "2026-09-16", amountPlanned: 500, amountReal: 0 }]
  });
  assert.equal(recurringTotalInRange(rent, "2026-07-01", "2026-12-31"), 500 * 3 + 600 * 3);
  assert.deepEqual(recurringCharges(rent, "2026-09-01", "2026-10-31"), [
    { date: "2026-09-01", amount: 500 },
    { date: "2026-10-01", amount: 600 }
  ]);
});

test("shiftIsoDate crosses month and year boundaries", () => {
  assert.equal(shiftIsoDate("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftIsoDate("2026-03-01", -1), "2026-02-28");
});
