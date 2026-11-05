import assert from "node:assert/strict";
import test from "node:test";
import type { FinancialRecord } from "../types";
import { recurringOccurrences } from "./recurringExpenses.ts";
import { recurringOwnRowCharge } from "./financialOverviewTable.ts";
import { detachFromRule, dueChargeId, dueChargeMovements, materializeDueCharges, storedChargeKeys } from "./recurringRuleDeletion.ts";

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

// --- Stored-vs-derived audit, finance #3: the (rule, day) pair, not only the id, marks a charge stored ---

const handEdited = (over: Partial<FinancialRecord> = {}): FinancialRecord =>
  ({
    id: "fr-1767000000000-abcde",
    type: "expense",
    title: "Rent (February)",
    amountPlanned: 520,
    amountReal: 520,
    status: "paid",
    issueDate: "2026-02-03",
    paidDate: "2026-02-03",
    isRecurring: false,
    recurringSourceId: "fr-rent",
    recurringOccurrenceDate: "2026-02-01",
    ...over
  }) as FinancialRecord;

test("a hand-edited charge with a random id whose day fell off the skip list is not duplicated", () => {
  // The rule was saved by code that dropped `recurringSkippedDates`.
  const out = materializeDueCharges([rent({ recurringSkippedDates: null }), handEdited()], TODAY, NOW);
  const february = out.filter((r) => !r.isRecurring && r.recurringOccurrenceDate === "2026-02-01");
  assert.deepEqual(february.map((r) => r.id), ["fr-1767000000000-abcde"]);
  assert.equal(out.some((r) => r.id === dueChargeId("fr-rent", "2026-02-01")), false);
  // The day goes back on the rule, so the schedule stops drawing it too.
  const rule = out.find((r) => r.id === "fr-rent")!;
  assert.ok(rule.recurringSkippedDates!.includes("2026-02-01"));
  // Stored total: three charges of 500 and the hand-edited 520.
  const paid = out.filter((r) => !r.isRecurring).reduce((sum, r) => sum + r.amountReal, 0);
  assert.equal(paid, 3 * 500 + 520);
});

test("a future hand-edited charge whose day fell off the skip list is skipped again", () => {
  const future = handEdited({ id: "fr-x", recurringOccurrenceDate: "2026-06-01", issueDate: "2026-06-01" });
  const out = materializeDueCharges([rent({ recurringSkippedDates: null }), future], TODAY, NOW);
  const rule = out.find((r) => r.id === "fr-rent")!;
  assert.ok(rule.recurringSkippedDates!.includes("2026-06-01"));
  assert.deepEqual(recurringOccurrences(rule, "2026-05-01", "2026-07-31"), ["2026-05-01", "2026-07-01"]);
});

test("deleting a rule keeps a hand-edited charge and adds no second payment for its day", () => {
  const records = [rent({ recurringSkippedDates: null }), handEdited()];
  const kept = dueChargeMovements(records[0], TODAY, NOW, storedChargeKeys(records));
  assert.deepEqual(kept.map((r) => r.recurringOccurrenceDate), ["2026-01-01", "2026-03-01", "2026-04-01"]);
});

test("a stored movement whose rule is gone does not resurrect anything", () => {
  const records = [handEdited({ recurringSourceId: "fr-gone" })];
  assert.equal(materializeDueCharges(records, TODAY, NOW), records);
});

// --- Stored-vs-derived audit, finance #5: a payment held only on the rule's own row ---

/** A rule entered as "paid on 18 Dec 2025, charges on the 1st from January". */
const legacyPaidRule = () =>
  rent({
    status: "paid",
    amountReal: 500,
    issueDate: "2025-12-18",
    paidDate: "2025-12-18",
    recurringStartDate: "2026-01-01"
  });

test("a payment that exists only as the rule's own row is stored as a movement of its own", () => {
  const out = materializeDueCharges([legacyPaidRule()], TODAY, NOW);
  const own = out.find((r) => r.id === dueChargeId("fr-rent", "2025-12-18"));
  assert.ok(own, "the December payment is stored");
  assert.equal(own.isRecurring, false);
  assert.equal(own.status, "paid");
  assert.equal(own.amountReal, 500);
  assert.equal(own.paidDate, "2025-12-18");
  assert.equal(own.recurringSourceId, "fr-rent");
  assert.equal(own.recurringOccurrenceDate, "2025-12-18");
  // The rule row is a template now: the overview no longer counts it as a payment.
  const rule = out.find((r) => r.id === "fr-rent")!;
  assert.equal(recurringOwnRowCharge(rule), null);
  assert.equal(rule.status, "planned");
  assert.equal(rule.issueDate, "2026-01-01");
  // December once, January to April once each.
  assert.equal(out.filter((r) => !r.isRecurring).length, 5);
});

test("the own-row payment survives deleting the rule", () => {
  const out = materializeDueCharges([legacyPaidRule()], TODAY, NOW);
  const afterDelete = out.filter((r) => r.id !== "fr-rent").map(detachFromRule);
  const december = afterDelete.filter((r) => r.issueDate === "2025-12-18");
  assert.equal(december.length, 1);
  assert.equal(december[0].amountReal, 500);
});

test("deleting the rule before the materializer ran still keeps the own-row payment", () => {
  const rule = legacyPaidRule();
  const kept = dueChargeMovements(rule, TODAY, NOW, storedChargeKeys([rule]));
  assert.deepEqual(
    kept.map((r) => r.recurringOccurrenceDate),
    ["2025-12-18", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"]
  );
});

test("the own-row payment is stored once, and stays deleted once deleted", () => {
  const once = materializeDueCharges([legacyPaidRule()], TODAY, NOW);
  assert.equal(materializeDueCharges(once, TODAY, NOW), once);
  const deleted = once.filter((r) => r.id !== dueChargeId("fr-rent", "2025-12-18"));
  assert.equal(materializeDueCharges(deleted, TODAY, NOW), deleted);
});

test("a rule row that only plans its first charge is not a payment and writes nothing extra", () => {
  const planned = rent({ status: "planned", issueDate: "2025-12-18", recurringStartDate: "2026-01-01" });
  const out = materializeDueCharges([planned], TODAY, NOW);
  assert.equal(out.some((r) => r.id === dueChargeId("fr-rent", "2025-12-18")), false);
});
