import test from "node:test";
import assert from "node:assert/strict";
import type { FinancialCategory, FinancialRecord } from "../../types/index.ts";
import type { FinanceInput } from "../marketingRoi.ts";
import { buildPeriod } from "./period.ts";
import { computeRecurringIncome } from "./recurringIncome.ts";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const TODAY = day(2026, 11, 20);
const period = buildPeriod("custom", day(2026, 11, 1), day(2026, 11, 20), TODAY);
const all = buildPeriod("all", null, null, TODAY);

const fin = (records: FinancialRecord[], cats: FinancialCategory[] = []): FinanceInput => ({
  mode: "connected",
  records,
  categories: cats,
  simplifiedTable: {},
  todayIso: "2026-11-20",
});

const cat = (id: string, name: string): FinancialCategory => ({ id, type: "income", name, level: 1, parentId: null });
const categories = [cat("c-host", "Hosting"), cat("c-support", "Support"), cat("c-lic", "Licenses"), cat("c-misc", "Misc")];

const rule = (id: string, amount: number, over: Partial<FinancialRecord> = {}): FinancialRecord => ({
  id,
  type: "income",
  title: id,
  categoryId: null,
  amountPlanned: amount,
  amountReal: amount,
  status: "paid",
  issueDate: "2026-01-01",
  isRecurring: true,
  recurringFrequency: "monthly",
  recurringConfig: { monthlyType: "day_of_month", dayOfMonth: 1 },
  recurringStartDate: "2026-01-01",
  ...over,
});

const oneOff = (id: string, paidDate: string, amount: number, over: Partial<FinancialRecord> = {}): FinancialRecord => ({
  id,
  type: "income",
  title: id,
  categoryId: null,
  amountPlanned: amount,
  amountReal: amount,
  status: "paid",
  issueDate: paidDate,
  paidDate,
  isRecurring: false,
  ...over,
});

const records: FinancialRecord[] = [
  rule("a", 500, { categoryId: "c-host" }),
  rule("b", 300, { categoryId: "c-support", categoryPath: "Services / Support" }),
  rule("c", 400, { categoryId: "c-lic" }),
  rule("d", 100, { categoryId: "c-misc", issueDate: "2026-11-01", recurringStartDate: "2026-11-01" }), // starts this month
  rule("e", 50), // uncategorised
  oneOff("stored", "2026-11-03", 25, { recurringSourceId: "deleted-rule" }), // a payment kept from a rule
  oneOff("plain", "2026-11-05", 1000), // not recurring
];

test("monthly, change, yearly and share", () => {
  const r = computeRecurringIncome(fin(records, categories), period, TODAY, { uncategorizedLabel: "Bez kategórie" });
  assert.equal(r.monthly, 1375); // 500 + 300 + 400 + 100 + 50 + the stored 25
  assert.equal(r.deltaMonthly, 125); // October: 1 250 (rule d had not started)
  assert.equal(r.yearly, 1375 * 12);
  assert.ok(Math.abs(r.shareOfIncomePct! - (1375 / 2375) * 100) < 1e-9);
});

test("breakdown: top three categories, the rest in one 'other' row, the path wins over the name", () => {
  const r = computeRecurringIncome(fin(records, categories), period, TODAY, { uncategorizedLabel: "Bez kategórie" });
  assert.deepEqual(r.breakdown, [
    { label: "Hosting", amount: 500, other: false },
    { label: "Licenses", amount: 400, other: false },
    { label: "Services / Support", amount: 300, other: false },
    { label: "", amount: 175, other: true }, // Misc 100 + uncategorised 75
  ]);
});

test("three or fewer categories need no 'other' row; uncategorised uses the given label", () => {
  const r = computeRecurringIncome(fin([rule("e", 50)], categories), period, TODAY, { uncategorizedLabel: "Bez kategórie" });
  assert.deepEqual(r.breakdown, [{ label: "Bez kategórie", amount: 50, other: false }]);
});

test("the reference month is the month the period ends in", () => {
  const october = buildPeriod("custom", day(2026, 10, 1), day(2026, 10, 31), TODAY);
  const r = computeRecurringIncome(fin(records, categories), october, TODAY);
  assert.equal(r.monthly, 1250);
  assert.equal(r.deltaMonthly, 0); // September had the same four rules
});

test("all time: today's month, no delta", () => {
  const r = computeRecurringIncome(fin(records, categories), all, TODAY);
  assert.equal(r.monthly, 1375);
  assert.equal(r.deltaMonthly, null);
  assert.ok(r.shareOfIncomePct !== null && r.shareOfIncomePct > 0 && r.shareOfIncomePct < 100);
});

test("a charge exactly on the first and last day of the month is in, the neighbours are out", () => {
  const edge = [rule("first", 10, { recurringStartDate: "2026-11-01", issueDate: "2026-11-01" })];
  assert.equal(computeRecurringIncome(fin(edge), period, TODAY).monthly, 10);

  const lastDay = [rule("last", 10, { recurringConfig: { monthlyType: "day_of_month", dayOfMonth: 30 }, recurringStartDate: "2026-11-30", issueDate: "2026-11-30" })];
  assert.equal(computeRecurringIncome(fin(lastDay), period, TODAY).monthly, 10);

  // A rule that first charges on 1 December is nothing in November.
  const dec = [rule("dec", 10, { recurringStartDate: "2026-12-01", issueDate: "2026-12-01" })];
  assert.equal(computeRecurringIncome(fin(dec), period, TODAY).monthly, 0);
});

test("empty input and zero denominators", () => {
  const r = computeRecurringIncome(fin([]), period, TODAY);
  assert.deepEqual(r, { monthly: 0, deltaMonthly: 0, yearly: 0, shareOfIncomePct: null, breakdown: [] });
  assert.equal(computeRecurringIncome(fin([]), all, TODAY).deltaMonthly, null);
});

test("simplified Finance has no rules: zeros, no delta, no share, no breakdown", () => {
  const simplified: FinanceInput = {
    mode: "simplified",
    records,
    categories,
    simplifiedTable: { "c-host:2026-11": "500", "c-host:2026-10": "500" },
    todayIso: "2026-11-20",
  };
  assert.deepEqual(computeRecurringIncome(simplified, period, TODAY), { monthly: 0, deltaMonthly: null, yearly: 0, shareOfIncomePct: null, breakdown: [] });
});

test("expense rules and one-off income do not count", () => {
  const r = computeRecurringIncome(fin([rule("x", 99, { type: "expense" }), oneOff("y", "2026-11-05", 500)]), period, TODAY);
  assert.equal(r.monthly, 0);
  assert.equal(r.shareOfIncomePct, 0);
});
