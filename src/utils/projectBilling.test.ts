import assert from "node:assert/strict";
import test from "node:test";
import type { FinancialRecord, ProjectType } from "../types";
import { projectBilling, resolveProjectValue } from "./projectBilling.ts";
import { aggregateOverviewTable, type OverviewColumn } from "./financialOverviewTable.ts";
import { projectFutureMovements } from "./futureMovements.ts";

const P = "p1";
const inc = (over: Partial<FinancialRecord>): FinancialRecord => ({
  id: over.id || `r-${Math.random()}`,
  type: "income",
  title: "t",
  categoryId: null,
  amountPlanned: 0,
  amountReal: 0,
  status: "pending",
  issueDate: "2026-03-10",
  isRecurring: false,
  projectId: P,
  ...over,
});

const expectBilling = (actual: ReturnType<typeof projectBilling>, expected: ReturnType<typeof projectBilling>) =>
  assert.deepEqual(actual, expected);

test("S1: partially paid invoice - the unpaid rest is still invoiced", () => {
  const b = projectBilling(10000, [inc({ amountPlanned: 9200, amountReal: 4000, status: "partially_paid" })], P);
  expectBilling(b, { value: 10000, received: 4000, invoicedOpen: 5200, invoiced: 9200, notInvoiced: 800, stillToBePaid: 6000, overInvoiced: 0 });
});

test("S2: cancelled invoice does not count as invoiced", () => {
  const b = projectBilling(10000, [inc({ amountPlanned: 3000, status: "cancelled" })], P);
  expectBilling(b, { value: 10000, received: 0, invoicedOpen: 0, invoiced: 0, notInvoiced: 10000, stillToBePaid: 10000, overInvoiced: 0 });
});

test("S4: paid + pending", () => {
  const b = projectBilling(10000, [
    inc({ amountPlanned: 4000, amountReal: 4000, status: "paid" }),
    inc({ amountPlanned: 6000, status: "pending" }),
  ], P);
  expectBilling(b, { value: 10000, received: 4000, invoicedOpen: 6000, invoiced: 10000, notInvoiced: 0, stillToBePaid: 6000, overInvoiced: 0 });
});

test("Over-invoiced", () => {
  const b = projectBilling(10000, [inc({ amountPlanned: 12000, status: "pending" })], P);
  expectBilling(b, { value: 10000, received: 0, invoicedOpen: 12000, invoiced: 12000, notInvoiced: 0, stillToBePaid: 12000, overInvoiced: 2000 });
});

test("Overpaid", () => {
  const b = projectBilling(10000, [inc({ amountPlanned: 11000, amountReal: 11000, status: "paid" })], P);
  expectBilling(b, { value: 10000, received: 11000, invoicedOpen: 0, invoiced: 11000, notInvoiced: 0, stillToBePaid: 0, overInvoiced: 1000 });
});

test("No value: nothing is owed and nothing is over-invoiced", () => {
  const b = projectBilling(0, [inc({ amountPlanned: 5000, amountReal: 5000, status: "paid" })], P);
  expectBilling(b, { value: 0, received: 5000, invoicedOpen: 0, invoiced: 5000, notInvoiced: 0, stillToBePaid: 0, overInvoiced: 0 });
});

test("Other projects and expense rows are ignored", () => {
  const b = projectBilling(10000, [
    inc({ projectId: "other", amountPlanned: 5000, status: "pending" }),
    inc({ type: "expense", amountPlanned: 700, status: "pending" }),
  ], P);
  expectBilling(b, { value: 10000, received: 0, invoicedOpen: 0, invoiced: 0, notInvoiced: 10000, stillToBePaid: 10000, overInvoiced: 0 });
});

const moneyType = { attributes: [
  { id: "m1", type: "money" }, { id: "m2", type: "money" }, { id: "t", type: "text" },
] } as unknown as ProjectType;

test("resolveProjectValue: project.value wins", () => {
  const r = resolveProjectValue({ value: 500, data: { m1: { amount: 9, currency: "USD" } }, leadId: null }, moneyType, { value: 7 }, "EUR");
  assert.deepEqual(r, { value: 500, currency: "EUR" });
});

test("resolveProjectValue: money attributes are summed, first currency wins", () => {
  const r = resolveProjectValue({ value: null, data: { m1: { amount: 300, currency: "USD" }, m2: { amount: 200, currency: "EUR" }, t: "x" }, leadId: null }, moneyType, undefined, "EUR");
  assert.deepEqual(r, { value: 500, currency: "USD" });
});

test("resolveProjectValue: _projectValue, then lead, then 0 (never budget)", () => {
  assert.deepEqual(resolveProjectValue({ value: null, data: { _projectValue: 42 }, leadId: null }, moneyType, { value: 7 }, "EUR"), { value: 42, currency: "EUR" });
  assert.deepEqual(resolveProjectValue({ value: null, data: {}, leadId: "l" }, moneyType, { value: 7 }, "EUR"), { value: 7, currency: "EUR" });
  const withBudget = { value: null, data: {}, leadId: null, budget: 9999 } as any;
  assert.deepEqual(resolveProjectValue(withBudget, moneyType, undefined, "EUR"), { value: 0, currency: "EUR" });
});

test("old bug: S1 + a payment for notInvoiced adds up to exactly the value in Finance", () => {
  const s1 = inc({ id: "inv", amountPlanned: 9200, amountReal: 4000, status: "partially_paid", dueDate: "2099-01-10" });
  const before = projectBilling(10000, [s1], P);
  // The payment row covers only the not-invoiced part (800), never the unpaid 5 200.
  const payment = inc({ id: "pay", title: "Payment received", amountPlanned: before.notInvoiced, amountReal: before.notInvoiced, status: "paid", issueDate: "2026-04-01", paidDate: "2026-04-01" });
  const records = [s1, payment];

  const columns: OverviewColumn[] = [{ id: "all", startIso: "2000-01-01", endIso: "2100-12-31", isFuture: false }];
  const agg = aggregateOverviewTable(records, [], columns, "2026-10-02");
  const future = projectFutureMovements(records, "2026-10-03", "2100-12-31").filter((m) => m.type === "income").reduce((s, m) => s + m.amount, 0);

  assert.equal(agg.totalIncomeSummary.real + future, 4000 + 800 + 5200);
  assert.equal(agg.totalIncomeSummary.total, 10000);
  const after = projectBilling(10000, records, P);
  assert.equal(after.stillToBePaid, 5200);
  assert.equal(after.received + after.stillToBePaid, 10000);
});
