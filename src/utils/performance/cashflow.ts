/**
 * "Financie" card: income and expenses of six actual months and two forecast months, and the
 * headline figures of the selected period.
 *
 * Nothing here has its own amount or date rule. Actual months and the period are
 * `aggregateOverviewTable` (financialOverviewTable.ts), the matrix behind the Finančný prehľad
 * table, read the way its "Total" mode reads it: `real + estimated` of the "Total Incomes" /
 * "Total Expenses" rows. The two forecast months are `projectFutureMovements`
 * (futureMovements.ts), the same forecast the movements ledger shows.
 */

import type { FinancialCategory, FinancialRecord } from "../../types/index.ts";
import type { CashflowData, CashflowMonth, PerformancePeriod } from "../../components/dashboard/performance/types.ts";
import { aggregateOverviewTable, overviewRecordDate, type OverviewColumn } from "../financialOverviewTable.ts";
import { projectFutureMovements } from "../futureMovements.ts";
import { daysInMonth, toIsoDay } from "./period.ts";
import { niceCeil } from "./scale.ts";

const pad = (n: number): string => String(n).padStart(2, "0");

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** One calendar month as an overview-table column (what FinancialManagementView builds for its month columns). */
export const monthColumn = (year: number, month: number, todayIso: string): OverviewColumn => {
  const startIso = `${year}-${pad(month + 1)}-01`;
  const endIso = `${year}-${pad(month + 1)}-${pad(daysInMonth(year, month))}`;
  return { id: `${year}-${pad(month + 1)}`, startIso, endIso, isFuture: startIso > todayIso };
};

/** Year and month (0-11) `offset` calendar months from the given one. */
export const shiftMonth = (year: number, month: number, offset: number): { year: number; month: number } => {
  const d = new Date(year, month + offset, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
};

/** The earliest day any record is filed under; today when there is none. */
const earliestDay = (records: readonly FinancialRecord[], todayIso: string): string => {
  let earliest = "";
  const consider = (value: string | null | undefined) => {
    const day = (value ?? "").slice(0, 10);
    if (!ISO_DAY.test(day) || day < "1970-01-01") return;
    if (!earliest || day < earliest) earliest = day;
  };
  for (const rec of records) {
    if (rec.isRecurring) {
      consider(rec.recurringStartDate);
      consider(rec.issueDate);
      consider(rec.paidDate);
    } else {
      consider(overviewRecordDate(rec));
    }
  }
  return earliest || todayIso;
};

/**
 * The selected period as one overview column. "All time" runs from the earliest record to the end
 * of today's month: a recurring rule never ends, so an all-time total has to stop somewhere, and
 * the end of the current month is where the Finance table's current column stops too.
 */
export const periodColumn = (records: readonly FinancialRecord[], period: PerformancePeriod, today: Date): OverviewColumn => {
  const todayIso = toIsoDay(today);
  if (period.start && period.end) {
    return { id: "period", startIso: toIsoDay(period.start), endIso: toIsoDay(period.end), isFuture: toIsoDay(period.start) > todayIso };
  }
  const startIso = earliestDay(records, todayIso);
  const endIso = monthColumn(today.getFullYear(), today.getMonth(), todayIso).endIso;
  return { id: "period", startIso, endIso: endIso < startIso ? startIso : endIso, isFuture: false };
};

export const computeCashflow = (
  records: readonly FinancialRecord[],
  categories: readonly FinancialCategory[],
  period: PerformancePeriod,
  today: Date,
): CashflowData => {
  const todayIso = toIsoDay(today);
  const ty = today.getFullYear();
  const tm = today.getMonth();
  const all = records as FinancialRecord[];
  const cats = categories as FinancialCategory[];

  // Six actual months ending with the current one.
  const actual = [-5, -4, -3, -2, -1, 0].map((offset) => {
    const { year, month } = shiftMonth(ty, tm, offset);
    return { year, month, column: monthColumn(year, month, todayIso) };
  });
  const monthAgg = aggregateOverviewTable(all, cats, actual.map((a) => a.column), todayIso);

  const months: CashflowMonth[] = actual.map(({ year, month, column }) => ({
    year,
    month,
    income: monthAgg.totalIncomesByCol[column.id]?.total ?? 0,
    expenses: monthAgg.totalExpensesByCol[column.id]?.total ?? 0,
    forecast: false,
    current: year === ty && month === tm,
  }));

  // The next two calendar months: the ledger's own forecast, grouped by month.
  const forecast = [1, 2].map((offset) => shiftMonth(ty, tm, offset));
  const first = monthColumn(forecast[0].year, forecast[0].month, todayIso);
  const last = monthColumn(forecast[1].year, forecast[1].month, todayIso);
  const future = projectFutureMovements(all, first.startIso, last.endIso);
  for (const { year, month } of forecast) {
    const prefix = `${year}-${pad(month + 1)}`;
    let income = 0;
    let expenses = 0;
    for (const m of future) {
      if (!m.date.startsWith(prefix)) continue;
      if (m.type === "income") income += m.amount;
      else expenses += m.amount;
    }
    months.push({ year, month, income, expenses, forecast: true, current: false });
  }

  // Headline figures of the selected period.
  const col = periodColumn(all, period, today);
  const periodAgg = aggregateOverviewTable(all, cats, [col], todayIso);

  const largest = months.reduce((max, m) => Math.max(max, m.income, m.expenses), 0);
  return {
    periodIncome: periodAgg.totalIncomesByCol[col.id]?.total ?? 0,
    periodExpenses: periodAgg.totalExpensesByCol[col.id]?.total ?? 0,
    months,
    scaleMax: niceCeil(largest),
  };
};
