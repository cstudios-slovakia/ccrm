import type { FinancialCategory, FinancialRecord, FinancialType } from "../types";
import { effectiveParentId } from "./financialCategoryTree.ts";
import { recurringCharges } from "./recurringExpenses.ts";

// The finance "Overview Table" is a matrix of category rows × period columns.
// Everything that decides which row a movement lands on, how much of it counts
// as settled ("Skutočnosť") versus still expected ("Plán"), and how the
// category levels roll up lives here, so the numbers can be checked without a
// browser and the other finance tabs can be held to the same rules.

/** One period column of the matrix. Dates are `YYYY-MM-DD`, inclusive. */
export interface OverviewColumn {
  id: string;
  startIso: string;
  endIso: string;
  /** The whole column lies ahead of today: nothing in it can be settled yet. */
  isFuture: boolean;
}

export interface OverviewCell {
  /** Money that has actually moved. */
  real: number;
  /** Money still expected: the plan of an unpaid movement, or the unpaid remainder of a partial one. */
  estimated: number;
  /** `real + estimated` — what the period costs / brings once everything settles. */
  total: number;
}

/**
 * Synthetic row ids for movements that have no usable category. They are not
 * category ids, so nothing else in the app can collide with them.
 */
export const UNCATEGORIZED_ROW_ID: Record<FinancialType, string> = {
  expense: "__uncategorized__expense",
  income: "__uncategorized__income"
};

export const isUncategorizedRowId = (id: string): boolean =>
  id === UNCATEGORIZED_ROW_ID.expense || id === UNCATEGORIZED_ROW_ID.income;

export const emptyOverviewCell = (): OverviewCell => ({ real: 0, estimated: 0, total: 0 });

export const isEmptyOverviewCell = (cell: OverviewCell | undefined): boolean =>
  !cell || (cell.real === 0 && cell.estimated === 0 && cell.total === 0);

/**
 * The row a movement is counted on.
 *
 * A movement is "uncategorized" when it has no category, when its category no
 * longer exists (deleted, or never synced), or when the category belongs to
 * the other side of the ledger — an income filed under an expense category
 * would otherwise be added to the expenses while every other tab calls it an
 * income. In all three cases the movement is still counted, on the
 * uncategorized row of its own type, so the table's totals agree with the
 * movements ledger and the cash-flow trend.
 */
export function overviewRowIdFor(
  rec: Pick<FinancialRecord, "type" | "categoryId">,
  categoriesById: Map<string, FinancialCategory>
): string {
  const cat = rec.categoryId ? categoriesById.get(rec.categoryId) : undefined;
  return cat && cat.type === rec.type ? cat.id : UNCATEGORIZED_ROW_ID[rec.type];
}

/**
 * How much of a one-off movement has been settled and how much is still
 * expected.
 *
 * - `paid`: everything is real (the settled amount, or the plan when none was
 *   entered).
 * - `partially_paid`: what was paid is real, the rest of the plan is still an
 *   estimate — a 9 200 € invoice with 4 000 € received shows 4 000 real and
 *   5 200 estimated, not 4 000 estimated and nothing real.
 * - anything else (`planned`, `pending`, `overdue`, `cancelled`): nothing is
 *   real yet, the plan is the estimate.
 */
export function splitRecordAmounts(
  rec: Pick<FinancialRecord, "status" | "amountPlanned" | "amountReal">
): { real: number; estimated: number } {
  const planned = Number(rec.amountPlanned) || 0;
  const real = Number(rec.amountReal) || 0;
  // A paused/cancelled movement is not money still expected, whether it is a
  // one-off or a recurring rule's own row.
  if (rec.status === "cancelled") return { real: 0, estimated: 0 };
  if (rec.status === "paid") return { real: real !== 0 ? real : planned, estimated: 0 };
  if (rec.status === "partially_paid") {
    const expected = planned !== 0 ? planned : real;
    return { real, estimated: expected - real };
  }
  return { real: 0, estimated: planned !== 0 ? planned : real };
}

/**
 * The date a one-off movement is filed under — cash basis, the same order the
 * trend and the movements ledger use, so a movement cannot land in three
 * different months across the three tabs. A datetime value is truncated to
 * its calendar day so a time-of-day suffix cannot sort it past the end of its
 * own month.
 */
export const overviewRecordDate = (
  rec: Pick<FinancialRecord, "issueDate" | "paidDate" | "dueDate">
): string => {
  const raw = rec.paidDate || rec.dueDate || rec.issueDate || "";
  return raw ? raw.slice(0, 10) : "";
};

export interface OverviewTableAggregate {
  /** `cells[rowId][columnId]`, with every category holding its own and its descendants' movements. */
  cells: Record<string, Record<string, OverviewCell>>;
  /** Each row summed across every column. */
  rowTotals: Record<string, OverviewCell>;
  totalExpensesByCol: Record<string, OverviewCell>;
  totalIncomesByCol: Record<string, OverviewCell>;
  netCashFlowByCol: Record<string, OverviewCell>;
  totalExpenseSummary: OverviewCell;
  totalIncomeSummary: OverviewCell;
  netSummary: OverviewCell;
  /** Whether the uncategorized row of each type has anything in it. */
  hasUncategorized: Record<FinancialType, boolean>;
  /** One-off movements whose date fell in none of the given columns. */
  outsideHorizon: Record<FinancialType, { count: number; real: number; estimated: number }>;
}

const addTo = (target: OverviewCell, real: number, estimated: number) => {
  target.real += real;
  target.estimated += estimated;
  target.total += real + estimated;
};

const addCell = (target: OverviewCell, source: OverviewCell) => addTo(target, source.real, source.estimated);

/**
 * Aggregates every movement into the matrix.
 *
 * One-off movements land in the column their date falls in. Recurring rules
 * are enumerated off the calendar into every column they charge in, each
 * charge priced at the amount in force on its date; a paused rule
 * (`cancelled`) charges nothing, the same as the recurring tab's totals treat
 * it. Each category then absorbs its descendants, walking the real parent
 * chain rather than trusting the stored `level`, so a category whose parent
 * was deleted still counts as the root row it is displayed as.
 */
export function aggregateOverviewTable(
  records: FinancialRecord[],
  categories: FinancialCategory[],
  columns: OverviewColumn[]
): OverviewTableAggregate {
  const byId = new Map(categories.map((c) => [c.id, c]));

  const direct: Record<string, Record<string, OverviewCell>> = {};
  const addDirect = (rowId: string, colId: string, real: number, estimated: number) => {
    if (real === 0 && estimated === 0) return;
    const row = (direct[rowId] ||= {});
    addTo((row[colId] ||= emptyOverviewCell()), real, estimated);
  };

  const outsideHorizon: OverviewTableAggregate["outsideHorizon"] = {
    expense: { count: 0, real: 0, estimated: 0 },
    income: { count: 0, real: 0, estimated: 0 }
  };

  records.forEach((rec) => {
    const rowId = overviewRowIdFor(rec, byId);

    if (!rec.isRecurring) {
      const date = overviewRecordDate(rec);
      if (!date) return;
      const { real, estimated } = splitRecordAmounts(rec);
      const col = columns.find((c) => date >= c.startIso && date <= c.endIso);
      if (col) {
        addDirect(rowId, col.id, real, estimated);
      } else if (real !== 0 || estimated !== 0) {
        const bucket = outsideHorizon[rec.type];
        bucket.count += 1;
        bucket.real += real;
        bucket.estimated += estimated;
      }
      return;
    }

    // A recurring rule fires on its own schedule rather than waiting for
    // someone to mark each charge paid, so a charge in a column that has
    // already elapsed is settled money regardless of the rule's current
    // lifecycle status (active/paused). Pausing or resuming the rule only
    // changes which *future* columns it still charges — via
    // `recurringEndDate`/`recurringStartDate`, honoured by `recurringCharges`
    // itself — and must never retroactively move already-elapsed charges
    // between "real" and "estimated".
    columns.forEach((col) => {
      const amount = recurringCharges(rec, col.startIso, col.endIso).reduce((sum, charge) => sum + charge.amount, 0);
      if (amount <= 0) return;
      addDirect(rowId, col.id, col.isFuture ? 0 : amount, col.isFuture ? amount : 0);
    });
  });

  // Every category's unique ids, so a duplicated entry (a bad sync or import)
  // is counted once rather than once per array element.
  const uniqueCategories = Array.from(byId.values());

  // Roll every category's direct sums up through its ancestors, walking a
  // guarded parent chain. A chain that cycles back on itself before reaching a
  // true root (no parent) never resolves to a root at all: the category that
  // holds the money is then its own root, and nothing is drawn onto the other
  // categories caught in the same cycle.
  const cells: Record<string, Record<string, OverviewCell>> = {};
  const cellOf = (rowId: string, colId: string): OverviewCell => (cells[rowId] ||= {})[colId] ||= emptyOverviewCell();

  const chainOf = (cat: FinancialCategory): { ancestors: FinancialCategory[]; root: FinancialCategory } => {
    const ancestors: FinancialCategory[] = [];
    const seen = new Set<string>([cat.id]);
    let current = cat;
    for (;;) {
      const parentId = effectiveParentId(current, byId);
      if (parentId === null) return { ancestors, root: current };
      if (seen.has(parentId)) return { ancestors: [], root: cat };
      const parent = byId.get(parentId)!;
      ancestors.push(parent);
      seen.add(parent.id);
      current = parent;
    }
  };

  uniqueCategories.forEach((cat) => {
    const own = direct[cat.id];
    const targets = [cat, ...chainOf(cat).ancestors];
    columns.forEach((col) => {
      const value = own?.[col.id];
      targets.forEach((target) => {
        const cell = cellOf(target.id, col.id);
        if (value) addCell(cell, value);
      });
    });
  });

  (["expense", "income"] as FinancialType[]).forEach((type) => {
    const rowId = UNCATEGORIZED_ROW_ID[type];
    columns.forEach((col) => {
      const value = direct[rowId]?.[col.id];
      const cell = cellOf(rowId, col.id);
      if (value) addCell(cell, value);
    });
  });

  const rowTotals: Record<string, OverviewCell> = {};
  Object.keys(cells).forEach((rowId) => {
    const total = emptyOverviewCell();
    columns.forEach((col) => addCell(total, cellOf(rowId, col.id)));
    rowTotals[rowId] = total;
  });

  // Section totals: the root rows of each type (as `chainOf` defines a root)
  // plus that type's uncategorized row.
  const rootsOf = (type: FinancialType): string[] => {
    const ids = new Set<string>();
    uniqueCategories.forEach((c) => {
      if (c.type === type) ids.add(chainOf(c).root.id);
    });
    ids.add(UNCATEGORIZED_ROW_ID[type]);
    return [...ids];
  };
  const expenseRoots = rootsOf("expense");
  const incomeRoots = rootsOf("income");

  const totalExpensesByCol: Record<string, OverviewCell> = {};
  const totalIncomesByCol: Record<string, OverviewCell> = {};
  const netCashFlowByCol: Record<string, OverviewCell> = {};
  const totalExpenseSummary = emptyOverviewCell();
  const totalIncomeSummary = emptyOverviewCell();
  const netSummary = emptyOverviewCell();

  columns.forEach((col) => {
    const exp = emptyOverviewCell();
    expenseRoots.forEach((id) => addCell(exp, cellOf(id, col.id)));
    totalExpensesByCol[col.id] = exp;
    addCell(totalExpenseSummary, exp);

    const inc = emptyOverviewCell();
    incomeRoots.forEach((id) => addCell(inc, cellOf(id, col.id)));
    totalIncomesByCol[col.id] = inc;
    addCell(totalIncomeSummary, inc);

    const net: OverviewCell = {
      real: inc.real - exp.real,
      estimated: inc.estimated - exp.estimated,
      total: inc.total - exp.total
    };
    netCashFlowByCol[col.id] = net;
    netSummary.real += net.real;
    netSummary.estimated += net.estimated;
    netSummary.total += net.total;
  });

  return {
    cells,
    rowTotals,
    totalExpensesByCol,
    totalIncomesByCol,
    netCashFlowByCol,
    totalExpenseSummary,
    totalIncomeSummary,
    netSummary,
    hasUncategorized: {
      expense: !isEmptyOverviewCell(rowTotals[UNCATEGORIZED_ROW_ID.expense]),
      income: !isEmptyOverviewCell(rowTotals[UNCATEGORIZED_ROW_ID.income])
    },
    outsideHorizon
  };
}
