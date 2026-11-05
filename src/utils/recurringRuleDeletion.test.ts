import assert from "node:assert/strict";
import test from "node:test";
import type { FinancialRecord } from "../types";
import { recurringOccurrences } from "./recurringExpenses.ts";
import { detachFromRule, dueChargeId, dueChargeMovements, materializeDueCharges } from "./recurringRuleDeletion.ts";

const rent = (over: Partial<FinancialRecord> = {}): FinancialRecord =>
  ({
    id: "fr-rent",
    type: "expense",
    title: "Rent",
    amountPlanned: 500,
    amountReal: 0,
    status: "planned",
    issueDate: "2026-01-01",
    isRecurring: true,
    recurringFrequency: "monthly",
    recurringConfig: { monthlyType: "day_of_month", dayOfMonth: 1 },
    recurringStartDate: "2026-01-01",
    recurringEndDate: null,
    recurringAmountHistory: null,
    ...over
  }) as FinancialRecord;

const NOW = "2026-04-15T00:00:00.000Z";
const TODAY = "2026-04-15";

test("every charge up to today becomes a settled one-off movement standing in for the rule's day", () => {
  const out = dueChargeMovements(rent(), TODAY, NOW);
  assert.deepEqual(out.map((r) => r.issueDate), ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"]);
  for (const r of out) {
    assert.equal(r.id, dueChargeId("fr-rent", r.issueDate));
    assert.equal(r.isRecurring, false);
    assert.equal(r.status, "paid");
    assert.equal(r.amountReal, 500);
    assert.equal(r.paidDate, r.issueDate);
    assert.equal(r.recurringSourceId, "fr-rent");
    assert.equal(r.recurringOccurrenceDate, r.issueDate);
  }
});

test("each movement keeps the price in force on its own day", () => {
  const out = dueChargeMovements(
    rent({ amountPlanned: 600, recurringAmountHistory: [{ until: "2026-02-28", amountPlanned: 500, amountReal: 0 }] }),
    TODAY,
    NOW
  );
  assert.deepEqual(out.map((r) => r.amountReal), [500, 500, 600, 600]);
});

test("a rule that has not started yet writes nothing; the future stays calculated", () => {
  const future = rent({ recurringStartDate: "2026-06-01", issueDate: "2026-06-01" });
  const records = [future];
  assert.equal(materializeDueCharges(records, TODAY, NOW), records);
});

test("materializing stores the payments and lists their days on the rule, so nothing counts twice", () => {
  const out = materializeDueCharges([rent()], TODAY, NOW);
  const rule = out.find((r) => r.id === "fr-rent")!;
  assert.equal(out.length, 5);
  assert.deepEqual(rule.recurringSkippedDates, ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"]);
  // The schedule draws nothing up to today any more; the next payment is still calculated.
  assert.deepEqual(recurringOccurrences(rule, "2026-01-01", TODAY), []);
  assert.deepEqual(recurringOccurrences(rule, "2026-01-01", "2026-05-31"), ["2026-05-01"]);
});

test("running it again changes nothing, and returns the same array", () => {
  const once = materializeDueCharges([rent()], TODAY, NOW);
  assert.equal(materializeDueCharges(once, TODAY, NOW), once);
});

test("a new day writes only that day's payment", () => {
  const once = materializeDueCharges([rent()], TODAY, NOW);
  const later = materializeDueCharges(once, "2026-05-02", NOW);
  assert.equal(later.length, 6);
  assert.equal(later[0].issueDate, "2026-05-01");
});

test("a payment the user deleted stays deleted", () => {
  const once = materializeDueCharges([rent()], TODAY, NOW);
  const withoutMarch = once.filter((r) => r.id !== dueChargeId("fr-rent", "2026-03-01"));
  assert.equal(materializeDueCharges(withoutMarch, TODAY, NOW), withoutMarch);
});

test("a stored movement the rule still draws is only skipped, never duplicated", () => {
  const once = materializeDueCharges([rent()], TODAY, NOW);
  const rule = once.find((r) => r.id === "fr-rent")!;
  const lostSkips = once.map((r) => (r === rule ? { ...rule, recurringSkippedDates: null } : r));
  const healed = materializeDueCharges(lostSkips, TODAY, NOW);
  assert.equal(healed.length, once.length);
  assert.deepEqual(healed.find((r) => r.id === "fr-rent")!.recurringSkippedDates, rule.recurringSkippedDates);
});

test("a paused rule stops at its end date", () => {
  const out = dueChargeMovements(rent({ recurringEndDate: "2026-02-15" }), TODAY, NOW);
  assert.deepEqual(out.map((r) => r.issueDate), ["2026-01-01", "2026-02-01"]);
});

test("a payment detaches into a plain movement when its rule is deleted", () => {
  const [first] = dueChargeMovements(rent(), TODAY, NOW);
  const plain = detachFromRule(first);
  assert.equal(plain.recurringSourceId, null);
  assert.equal(plain.recurringOccurrenceDate, null);
});
