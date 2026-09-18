import assert from "node:assert/strict";
import test from "node:test";
import type { FinancialCategory, FinancialRecord } from "../types";
import {
  UNCATEGORIZED_ROW_ID,
  aggregateOverviewTable,
  overviewRowIdFor,
  splitRecordAmounts,
  type OverviewColumn
} from "./financialOverviewTable.ts";

const cat = (id: string, type: FinancialCategory["type"], level: 1 | 2 | 3, parentId: string | null = null): FinancialCategory => ({
  id,
  type,
  name: id,
  level,
  parentId
});

const rec = (over: Partial<FinancialRecord>): FinancialRecord => ({
  id: over.id || "r",
  type: "expense",
  title: "t",
  categoryId: null,
  amountPlanned: 0,
  amountReal: 0,
  status: "pending",
  issueDate: "2026-03-10",
  isRecurring: false,
  ...over
});

const columns: OverviewColumn[] = [
  { id: "2026-02", startIso: "2026-02-01", endIso: "2026-02-28", isFuture: false },
  { id: "2026-03", startIso: "2026-03-01", endIso: "2026-03-31", isFuture: false },
  { id: "2026-04", startIso: "2026-04-01", endIso: "2026-04-30", isFuture: true }
];

const categories: FinancialCategory[] = [
  cat("exp", "expense", 1),
  cat("exp-l2", "expense", 2, "exp"),
  cat("exp-l3", "expense", 3, "exp-l2"),
  cat("inc", "income", 1)
];

test("a paid movement without a category lands on the uncategorized row and in the section totals", () => {
  const out = aggregateOverviewTable(
    [rec({ id: "a", amountPlanned: 180, amountReal: 180, status: "paid" })],
    categories,
    columns
  );

  const row = out.cells[UNCATEGORIZED_ROW_ID.expense]["2026-03"];
  assert.deepEqual(row, { real: 180, estimated: 0, total: 180 });
  assert.deepEqual(out.totalExpensesByCol["2026-03"], { real: 180, estimated: 0, total: 180 });
  assert.equal(out.totalExpenseSummary.real, 180);
  assert.equal(out.netSummary.real, -180);
  assert.equal(out.hasUncategorized.expense, true);
  assert.equal(out.hasUncategorized.income, false);
});

test("a category that no longer exists counts as uncategorized instead of vanishing", () => {
  const out = aggregateOverviewTable(
    [rec({ id: "a", categoryId: "deleted-long-ago", amountPlanned: 50, status: "paid", type: "income" })],
    categories,
    columns
  );
  assert.equal(out.cells[UNCATEGORIZED_ROW_ID.income]["2026-03"].real, 50);
  assert.equal(out.totalIncomeSummary.real, 50);
});

test("an income filed under an expense category is still an income", () => {
  const byId = new Map(categories.map((c) => [c.id, c]));
  assert.equal(overviewRowIdFor({ type: "income", categoryId: "exp" }, byId), UNCATEGORIZED_ROW_ID.income);
  assert.equal(overviewRowIdFor({ type: "expense", categoryId: "exp-l3" }, byId), "exp-l3");

  const out = aggregateOverviewTable(
    [rec({ id: "a", type: "income", categoryId: "exp", amountPlanned: 300, status: "paid" })],
    categories,
    columns
  );
  assert.equal(out.totalIncomeSummary.real, 300);
  assert.equal(out.totalExpenseSummary.real, 0);
});

test("a partial payment is real for what was paid and estimated for the rest", () => {
  assert.deepEqual(splitRecordAmounts({ status: "partially_paid", amountPlanned: 9200, amountReal: 4000 }), {
    real: 4000,
    estimated: 5200
  });
  assert.deepEqual(splitRecordAmounts({ status: "paid", amountPlanned: 9200, amountReal: 0 }), { real: 9200, estimated: 0 });
  assert.deepEqual(splitRecordAmounts({ status: "paid", amountPlanned: 9200, amountReal: 9000 }), { real: 9000, estimated: 0 });
  assert.deepEqual(splitRecordAmounts({ status: "pending", amountPlanned: 700, amountReal: 0 }), { real: 0, estimated: 700 });
  assert.deepEqual(splitRecordAmounts({ status: "overdue", amountPlanned: 0, amountReal: 120 }), { real: 0, estimated: 120 });
});

test("level 3 rolls into level 2 and level 1; each level's total is the sum of its columns", () => {
  const out = aggregateOverviewTable(
    [
      rec({ id: "a", categoryId: "exp-l3", amountPlanned: 100, status: "paid", issueDate: "2026-02-03" }),
      rec({ id: "b", categoryId: "exp-l2", amountPlanned: 40, status: "pending", issueDate: "2026-03-03" }),
      rec({ id: "c", categoryId: "exp", amountPlanned: 1, status: "paid", issueDate: "2026-03-30" })
    ],
    categories,
    columns
  );

  assert.deepEqual(out.cells["exp-l3"]["2026-02"], { real: 100, estimated: 0, total: 100 });
  assert.deepEqual(out.cells["exp-l2"]["2026-02"], { real: 100, estimated: 0, total: 100 });
  assert.deepEqual(out.cells["exp-l2"]["2026-03"], { real: 0, estimated: 40, total: 40 });
  assert.deepEqual(out.cells["exp"]["2026-03"], { real: 1, estimated: 40, total: 41 });
  assert.deepEqual(out.rowTotals["exp"], { real: 101, estimated: 40, total: 141 });
  // The section total counts every movement exactly once.
  assert.deepEqual(out.totalExpenseSummary, { real: 101, estimated: 40, total: 141 });
});

test("a category whose parent was deleted is a root row, and its movements reach the section total", () => {
  const orphaned = [cat("exp", "expense", 1), cat("orphan", "expense", 2, "gone")];
  const out = aggregateOverviewTable(
    [rec({ id: "a", categoryId: "orphan", amountPlanned: 75, status: "paid" })],
    orphaned,
    columns
  );
  assert.equal(out.cells["orphan"]["2026-03"].real, 75);
  assert.equal(out.totalExpenseSummary.real, 75);
});

test("a recurring rule charges every column it lands in, real in the past and estimated in the future, regardless of its current status", () => {
  // A recurring rule fires on its own schedule rather than waiting for someone
  // to mark each charge paid, so a charge in an elapsed column is settled
  // money whatever the rule's live `status` says — see
  // docs/audits/finance-section-consistency-audit-2026-09-17.md, F2/F2b: the
  // opposite used to be true (a paused rule retroactively lost its settled
  // history, and a merely-"pending" rule counted its past charges as only
  // "estimated"), which this test now pins as the bug it was.
  const rule = (over: Partial<FinancialRecord>) =>
    rec({
      id: "rent",
      categoryId: "exp",
      amountPlanned: 500,
      isRecurring: true,
      recurringFrequency: "monthly",
      recurringConfig: { monthlyType: "day_of_month", dayOfMonth: 1 },
      recurringStartDate: "2026-01-01",
      ...over
    });

  const paid = aggregateOverviewTable([rule({ status: "paid" })], categories, columns);
  assert.deepEqual(paid.cells["exp"]["2026-02"], { real: 500, estimated: 0, total: 500 });
  assert.deepEqual(paid.cells["exp"]["2026-04"], { real: 0, estimated: 500, total: 500 });
  assert.equal(paid.rowTotals["exp"].total, 1500);

  const pending = aggregateOverviewTable([rule({ status: "pending" })], categories, columns);
  assert.deepEqual(
    pending.cells["exp"]["2026-02"],
    { real: 500, estimated: 0, total: 500 },
    "an elapsed charge is real however the rule's live status reads"
  );

  const paused = aggregateOverviewTable([rule({ status: "cancelled" })], categories, columns);
  assert.deepEqual(
    paused.rowTotals["exp"],
    { real: 1000, estimated: 500, total: 1500 },
    "pausing today must not erase the two charges already made in Feb and Mar"
  );
  assert.equal(paused.totalExpenseSummary.total, 1500);

  const uncategorizedRule = aggregateOverviewTable([rule({ status: "pending", categoryId: null })], categories, columns);
  assert.equal(uncategorizedRule.rowTotals[UNCATEGORIZED_ROW_ID.expense].real, 1000);
  assert.equal(uncategorizedRule.rowTotals[UNCATEGORIZED_ROW_ID.expense].estimated, 500);
});

test("a movement dated outside every column is not counted anywhere", () => {
  const out = aggregateOverviewTable(
    [rec({ id: "a", categoryId: "exp", amountPlanned: 10, status: "paid", issueDate: "2025-12-31" })],
    categories,
    columns
  );
  assert.equal(out.totalExpenseSummary.total, 0);
});

test("a recurring rule's own row is worth what the rule charged on its date, not its latest price", () => {
  const rent = rec({
    isRecurring: true,
    status: "paid",
    issueDate: "2026-09-18",
    paidDate: "2026-09-18",
    amountPlanned: 2000,
    amountReal: 2400,
    recurringAmountHistory: [{ until: "2026-11-30", amountPlanned: 2000, amountReal: 2200 }]
  });
  assert.deepEqual(splitRecordAmounts(rent), { real: 2200, estimated: 0 });
  assert.deepEqual(splitRecordAmounts({ ...rent, paidDate: "2026-12-01" }), { real: 2400, estimated: 0 });
  assert.deepEqual(splitRecordAmounts({ ...rent, recurringAmountHistory: null }), { real: 2400, estimated: 0 });
});
