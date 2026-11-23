/**
 * "Rekurentné príjmy": what recurring income brings per month, its change, the yearly run rate,
 * its share of all income and the categories it comes from.
 *
 * Recurring income is every income rule (`isRecurring && type === "income"`) together with the
 * stored payments that came out of a rule (an income movement with a `recurringSourceId`: the
 * ledger keeps each past charge as a movement of its own, see recurringRuleDeletion.ts). The
 * amounts are not re-derived: the recurring subset goes through `financeForPeriod` (marketingRoi.ts),
 * which is `aggregateOverviewTable`, exactly as the Finance table sums them (a rule's charges from
 * its schedule, a stored payment on its own date, a rule's own row only when the schedule does not
 * already account for it), read as `real + estimated`.
 *
 * Simplified Finance has no ledger and so no rules: everything is 0 / null / empty there.
 */

import type { RecurringIncomeData, PerformancePeriod } from "../../components/dashboard/performance/types.ts";
import type { FinancialRecord } from "../../types/index.ts";
import { financeForPeriod, type FinanceInput } from "../marketingRoi.ts";
import { financePeriodOf, monthSpan, shiftMonth } from "./cashflow.ts";

export interface RecurringIncomeOptions {
  /** The translated "Uncategorized" label (the Finance tab's: "Bez kategórie"). Default "Uncategorized". */
  uncategorizedLabel?: string;
}

/** Income that recurs: a rule, or a payment stored from one. */
export const isRecurringIncomeRecord = (rec: FinancialRecord): boolean =>
  rec.type === "income" && (rec.isRecurring || Boolean(rec.recurringSourceId));

export const computeRecurringIncome = (
  finance: FinanceInput,
  period: PerformancePeriod,
  today: Date,
  options: RecurringIncomeOptions = {},
): RecurringIncomeData => {
  if (finance.mode === "simplified") {
    return { monthly: 0, deltaMonthly: null, yearly: 0, shareOfIncomePct: null, breakdown: [] };
  }

  const recurring: FinanceInput = { ...finance, records: finance.records.filter(isRecurringIncomeRecord) };
  const incomeOf = (input: FinanceInput, span: { startIso: string | null; endIso: string | null }): number =>
    financeForPeriod(input, span)?.totalIncomeSummary.total ?? 0;

  // The month the period ends in; today's month for "all time".
  const reference = period.end ?? today;
  const ref = { year: reference.getFullYear(), month: reference.getMonth() };
  const prev = shiftMonth(ref.year, ref.month, -1);

  const refSpan = monthSpan(ref, ref);
  const monthly = incomeOf(recurring, refSpan);
  const previousMonthly = incomeOf(recurring, monthSpan(prev, prev));

  // Share of all income in the period, with the same amount and date rules as the cashflow card.
  const periodSpan = financePeriodOf(period);
  const recurringInPeriod = incomeOf(recurring, periodSpan);
  const incomeInPeriod = incomeOf(finance, periodSpan);

  // Breakdown of the reference month by category.
  const uncategorized = options.uncategorizedLabel ?? "Uncategorized";
  const categoryById = new Map(finance.categories.map((c) => [c.id, c]));
  // One aggregation per category label, not per record: the matrix is built once for each.
  const recordsByLabel = new Map<string, FinancialRecord[]>();
  for (const rec of recurring.records) {
    const category = rec.categoryId ? categoryById.get(rec.categoryId) : undefined;
    const label = rec.categoryPath?.trim() || (category && category.type === "income" ? category.name : "") || uncategorized;
    const list = recordsByLabel.get(label);
    if (list) list.push(rec);
    else recordsByLabel.set(label, [rec]);
  }
  const byLabel = new Map<string, number>();
  for (const [label, records] of recordsByLabel) {
    const amount = incomeOf({ ...recurring, records }, refSpan);
    if (amount !== 0) byLabel.set(label, amount);
  }
  const sorted = [...byLabel.entries()]
    .map(([label, amount]) => ({ label, amount, other: false }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
  const breakdown = sorted.slice(0, 3);
  if (sorted.length > 3) {
    breakdown.push({ label: "", amount: sorted.slice(3).reduce((sum, row) => sum + row.amount, 0), other: true });
  }

  return {
    monthly,
    deltaMonthly: period.preset === "all" ? null : monthly - previousMonthly,
    yearly: monthly * 12,
    shareOfIncomePct: incomeInPeriod > 0 ? (recurringInPeriod / incomeInPeriod) * 100 : null,
    breakdown,
  };
};
