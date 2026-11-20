import test from "node:test";
import assert from "node:assert/strict";
import type { FinancialCategory, FinancialRecord } from "../../types/index.ts";
import { aggregateOverviewTable } from "../financialOverviewTable.ts";
import { computeCashflow, monthColumn } from "./cashflow.ts";
import { buildPeriod } from "./period.ts";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const TODAY = day(2026, 11, 20);
const TODAY_ISO = "2026-11-20";
const novPeriod = buildPeriod("custom", day(2026, 11, 1), day(2026, 11, 20), TODAY);
const all = buildPeriod("all", null, null, TODAY);

const rec = (over: Partial<FinancialRecord>): FinancialRecord => ({
  id: over.id || "r",
  type: "income",
  title: "t",
  categoryId: null,
  amountPlanned: 0,
  amountReal: 0,
  status: "pending",
  issueDate: "2026-11-01",
  isRecurring: false,
  ...over,
});
const categories: FinancialCategory[] = [];

const paidIncome = (id: string, paidDate: string, amount: number) =>
  rec({ id, type: "income", status: "paid", amountPlanned: amount, amountReal: amount, issueDate: paidDate, paidDate });

const records: FinancialRecord[] = [
  paidIncome("oct", "2026-10-12", 400),
  paidIncome("nov", "2026-11-05", 1000),
  rec({ id: "exp-nov", type: "expense", amountPlanned: 300, dueDate: "2026-11-25", issueDate: "2026-11-02" }),
  rec({ id: "exp-dec", type: "expense", amountPlanned: 200, dueDate: "2026-12-10", issueDate: "2026-11-02" }),
  rec({
    id: "rule",
    type: "income",
    status: "paid",
    amountPlanned: 500,
    amountReal: 500,
    issueDate: "2026-01-01",
    isRecurring: true,
    recurringFrequency: "monthly",
    recurringConfig: { monthlyType: "day_of_month", dayOfMonth: 1 },
    recurringStartDate: "2026-01-01",
  }),
];

test("six actual months ending with the current one, then two forecast months", () => {
  const data = computeCashflow(records, categories, novPeriod, TODAY);
  assert.deepEqual(
    data.months.map((m) => `${m.year}-${m.month + 1}${m.forecast ? "f" : ""}${m.current ? "*" : ""}`),
    ["2026-6", "2026-7", "2026-8", "2026-9", "2026-10", "2026-11*", "2026-12f", "2027-1f"],
  );
  assert.deepEqual(data.months.map((m) => m.income), [500, 500, 500, 500, 900, 1500, 500, 500]);
  assert.deepEqual(data.months.map((m) => m.expenses), [0, 0, 0, 0, 0, 300, 200, 0]);
  assert.equal(data.scaleMax, 1500);
});

test("actual months are exactly what the overview table aggregates", () => {
  const data = computeCashflow(records, categories, novPeriod, TODAY);
  const col = monthColumn(2026, 10, TODAY_ISO);
  const agg = aggregateOverviewTable(records, categories, [col], TODAY_ISO);
  assert.equal(data.months[5].income, agg.totalIncomesByCol[col.id].total);
  assert.equal(data.months[5].expenses, agg.totalExpensesByCol[col.id].total);
});

test("period figures follow the selected period, all time runs from the first record to the end of this month", () => {
  const nov = computeCashflow(records, categories, novPeriod, TODAY);
  assert.equal(nov.periodIncome, 1500); // 1 Nov rule charge + 1 000 paid on the 5th
  assert.equal(nov.periodExpenses, 0); // the expense is due on the 25th, after the period

  const whole = computeCashflow(records, categories, all, TODAY);
  assert.equal(whole.periodIncome, 11 * 500 + 400 + 1000);
  assert.equal(whole.periodExpenses, 300);
});

test("period boundary: first and last day in, day before and after out", () => {
  const edge = [
    paidIncome("before", "2026-10-31", 1),
    paidIncome("first", "2026-11-01", 10),
    paidIncome("last", "2026-11-20", 100),
    paidIncome("after", "2026-11-21", 1000),
  ];
  assert.equal(computeCashflow(edge, categories, novPeriod, TODAY).periodIncome, 110);
});

test("empty input: eight zero months, one current, scale of 1", () => {
  const data = computeCashflow([], categories, novPeriod, TODAY);
  assert.equal(data.months.length, 8);
  assert.equal(data.months.filter((m) => m.current).length, 1);
  assert.equal(data.months.filter((m) => m.forecast).length, 2);
  assert.ok(data.months.every((m) => m.income === 0 && m.expenses === 0));
  assert.equal(data.periodIncome, 0);
  assert.equal(data.periodExpenses, 0);
  assert.equal(data.scaleMax, 1);
  assert.equal(computeCashflow([], categories, all, TODAY).periodIncome, 0);
});

test("the year boundary runs through the month list", () => {
  const data = computeCashflow([], categories, novPeriod, day(2027, 1, 15));
  assert.deepEqual(data.months.map((m) => [m.year, m.month]), [
    [2026, 7], [2026, 8], [2026, 9], [2026, 10], [2026, 11], [2027, 0], [2027, 1], [2027, 2],
  ]);
});
