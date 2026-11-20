import { addMoney, sumMoney, visibleEntryCost, type MoneyByCurrency } from "./timeTeam.ts";

export interface TimesheetCostCell {
  /** Labour cost per currency; null when there is nothing to show (hidden, or no entry carries a cost). */
  bag: MoneyByCurrency | null;
  /** True when some entry belongs to another person and the viewer lacks the cost permission. */
  hidden: boolean;
}

interface CostEntry {
  userId: string;
  cost?: number | null;
  currency?: string | null;
}

/**
 * Labour cost of a set of entries (a row, or the whole shown week). Own entries always count, other
 * people's only with the cost permission. A partial sum is never shown as the total: when any entry's
 * cost is hidden the result is `{ bag: null, hidden: true }`. Entries without a cost add nothing.
 */
export function timesheetCost(entries: readonly CostEntry[], viewerUserId: string, canCosts: boolean, fallbackCurrency: string): TimesheetCostCell {
  if (entries.some((e) => !canCosts && e.userId !== viewerUserId)) return { bag: null, hidden: true };
  const bag: MoneyByCurrency = {};
  for (const e of entries) addMoney(bag, e.currency || fallbackCurrency, visibleEntryCost(e, viewerUserId, canCosts));
  return { bag: Object.keys(bag).length ? bag : null, hidden: false };
}

/** The Totals cell: the row bags added per currency; hidden as soon as one row is hidden. */
export function timesheetCostTotal(rows: readonly TimesheetCostCell[]): TimesheetCostCell {
  if (rows.some((r) => r.hidden)) return { bag: null, hidden: true };
  const bags = rows.map((r) => r.bag).filter((b): b is MoneyByCurrency => !!b);
  return { bag: bags.length ? sumMoney(bags) : null, hidden: false };
}
