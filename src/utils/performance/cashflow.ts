/**
 * "Financie" card: income and expenses of six actual months and two forecast months, and the
 * headline figures of the selected period, in the mode Finance runs in.
 *
 * Nothing here has its own amount or date rule:
 *
 * - Actual months and the period are `financeForPeriod` (marketingRoi.ts): the Finančný prehľad
 *   matrix (`aggregateOverviewTable`) in connected mode, the hand-filled monthly table
 *   (`aggregateSimplifiedOverviewTable`) in simplified mode. Amounts are read the way the table's
 *   "Total" mode reads them: `real + estimated` of the "Total Incomes" / "Total Expenses" rows.
 * - The two forecast months in connected mode are `projectFutureMovements` (futureMovements.ts),
 *   the ledger's own forecast. In simplified mode there is no ledger to forecast from: the table's
 *   own cells for those future months are the user's plan, and they are drawn as the forecast.
 */

import type { CashflowData, CashflowMonth, PerformancePeriod } from "../../components/dashboard/performance/types.ts";
import { financeForPeriod, type FinanceInput } from "../marketingRoi.ts";
import { projectFutureMovements } from "../futureMovements.ts";
import { daysInMonth, toIsoDay } from "./period.ts";
import { niceCeil } from "./scale.ts";

const pad = (n: number): string => String(n).padStart(2, "0");

/** Year and month (0-11) `offset` calendar months from the given one. */
export const shiftMonth = (year: number, month: number, offset: number): { year: number; month: number } => {
  const d = new Date(year, month + offset, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
};

/** The column id `financeForPeriod` gives a calendar month (also the simplified table's key). */
export const monthId = (year: number, month: number): string => `${year}-${pad(month + 1)}`;

/** First and last day of a run of calendar months, as "YYYY-MM-DD". */
export const monthSpan = (from: { year: number; month: number }, to: { year: number; month: number }): { startIso: string; endIso: string } => ({
  startIso: `${from.year}-${pad(from.month + 1)}-01`,
  endIso: `${to.year}-${pad(to.month + 1)}-${pad(daysInMonth(to.year, to.month))}`,
});

/** The selected period as the bounds `financeForPeriod` takes (open on both sides for "all"). */
export const financePeriodOf = (period: PerformancePeriod): { startIso: string | null; endIso: string | null } => ({
  startIso: period.start ? toIsoDay(period.start) : null,
  endIso: period.end ? toIsoDay(period.end) : null,
});

export const computeCashflow = (finance: FinanceInput, period: PerformancePeriod, today: Date): CashflowData => {
  const ty = today.getFullYear();
  const tm = today.getMonth();

  // Six actual months ending with the current one.
  const first = shiftMonth(ty, tm, -5);
  const actualAgg = financeForPeriod(finance, monthSpan(first, { year: ty, month: tm }));
  const months: CashflowMonth[] = [-5, -4, -3, -2, -1, 0].map((offset) => {
    const { year, month } = shiftMonth(ty, tm, offset);
    const id = monthId(year, month);
    return {
      year,
      month,
      income: actualAgg?.totalIncomesByCol[id]?.total ?? 0,
      expenses: actualAgg?.totalExpensesByCol[id]?.total ?? 0,
      forecast: false,
      current: offset === 0,
    };
  });

  // The next two calendar months.
  const forecast = [shiftMonth(ty, tm, 1), shiftMonth(ty, tm, 2)];
  const span = monthSpan(forecast[0], forecast[1]);
  if (finance.mode === "simplified") {
    const agg = financeForPeriod(finance, span);
    for (const { year, month } of forecast) {
      const id = monthId(year, month);
      months.push({
        year,
        month,
        income: agg?.totalIncomesByCol[id]?.total ?? 0,
        expenses: agg?.totalExpensesByCol[id]?.total ?? 0,
        forecast: true,
        current: false,
      });
    }
  } else {
    const future = projectFutureMovements(finance.records, span.startIso, span.endIso);
    for (const { year, month } of forecast) {
      const prefix = monthId(year, month);
      let income = 0;
      let expenses = 0;
      for (const m of future) {
        if (!m.date.startsWith(prefix)) continue;
        if (m.type === "income") income += m.amount;
        else expenses += m.amount;
      }
      months.push({ year, month, income, expenses, forecast: true, current: false });
    }
  }

  // Headline figures of the selected period.
  const periodAgg = financeForPeriod(finance, financePeriodOf(period));
  const largest = months.reduce((max, m) => Math.max(max, m.income, m.expenses), 0);
  return {
    periodIncome: periodAgg?.totalIncomeSummary.total ?? 0,
    periodExpenses: periodAgg?.totalExpenseSummary.total ?? 0,
    months,
    scaleMax: niceCeil(largest),
  };
};
