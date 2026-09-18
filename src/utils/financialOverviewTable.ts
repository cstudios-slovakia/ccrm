import type { FinancialCategory, FinancialRecord, FinancialType } from "../types";
import { effectiveParentId } from "./financialCategoryTree.ts";
import { recurringAmountsAt, recurringCharges } from "./recurringExpenses.ts";

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
 * Whether a recurring charge dated `dateIso` has actually happened by
 * `todayIso` — the one rule the overview table and the cash-flow trend both
 * read a recurring charge's settled/estimated split by. A charge later this
 * month is still estimated even though the column holding it (the current
 * month) is not itself "future"; a charge dated today or earlier is real. The
 * movements ledger (`pastRecurringCharges.ts`) already applies the same rule
 * by bounding its charge range at `todayIso`.
 */
export const isRecurringChargeSettled = (dateIso: string, todayIso: string): boolean => dateIso <= todayIso;

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
  rec: Pick<FinancialRecord, "status" | "amountPlanned" | "amountReal"> &
    Partial<Pick<FinancialRecord, "isRecurring" | "recurringAmountHistory" | "issueDate" | "dueDate" | "paidDate">>
): { real: number; estimated: number } {
  // A recurring rule's own row is one of its charges, so it is worth what the
  // rule charged on that day — a price change dated later must not re-price
  // the row already settled at the old amount.
  const amounts =
    rec.isRecurring && rec.recurringAmountHistory?.length
      ? recurringAmountsAt(rec, overviewRecordDate(rec))
      : rec;
  const planned = Number(amounts.amountPlanned) || 0;
  const real = Number(amounts.amountReal) || 0;
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
  rec: Partial<Pick<FinancialRecord, "issueDate" | "paidDate" | "dueDate">>
): string => {
  const raw = rec.paidDate || rec.dueDate || rec.issueDate || "";
  return raw ? raw.slice(0, 10) : "";
};

/**
 * A recurring rule's own ledger row, when it is money the schedule does not
 * already account for.
 *
 * A rule entered and settled on 18 September but set to charge on the 1st
 * first charges on 1 October — yet the ledger shows the 18 September row, and
 * that payment is real. The row is then the rule's first charge and counts on
 * its own date, split by its own status exactly as the ledger splits it. Once
 * the schedule has charged on or before the row's day, the row is just the
 * rule's representation and adds nothing, or that month would count twice.
 */
export function recurringOwnRowCharge(
  rec: FinancialRecord
): { date: string; real: number; estimated: number } | null {
  if (!rec.isRecurring) return null;
  const date = overviewRecordDate(rec);
  if (!date) return null;
  if (recurringCharges(rec, "0000-01-01", date).length > 0) return null;
  const { real, estimated } = splitRecordAmounts(rec);
  if (real === 0 && estimated === 0) return null;
  return { date, real, estimated };
}

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
 * charge priced at the amount in force on its date; the schedule itself
 * (`recurringOccurrences`/`effectiveRecurringEndDate`) already stops a rule
 * paused either way — a `recurringEndDate` or, for a rule paused the old way,
 * `status === "cancelled"` — so nothing here needs to guard on `status`
 * again. Each category then absorbs its descendants, walking the real parent
 * chain rather than trusting the stored `level`, so a category whose parent
 * was deleted still counts as the root row it is displayed as.
 */
export function aggregateOverviewTable(
  records: FinancialRecord[],
  categories: FinancialCategory[],
  columns: OverviewColumn[],
  todayIso: string
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
    // someone to mark each charge paid, so a charge that has come due is
    // settled money regardless of the rule's current lifecycle status
    // (active/paused). Pausing or resuming the rule only changes which
    // *future* charges the schedule still makes — via `effectiveRecurringEndDate`
    // / `recurringStartDate`, honoured by `recurringCharges` itself — and must
    // never retroactively move already-elapsed charges between "real" and
    // "estimated".
    //
    // Real vs estimated is decided per charge against `todayIso`, not per
    // column: the column holding today (the current month, week, ...) is not
    // itself "future", but a charge inside it dated after today has not
    // happened yet and must still show as estimated (Problem A of the 18
    // September audit follow-up).
    columns.forEach((col) => {
      let real = 0;
      let estimated = 0;
      recurringCharges(rec, col.startIso, col.endIso).forEach(({ date, amount }) => {
        if (isRecurringChargeSettled(date, todayIso)) real += amount;
        else estimated += amount;
      });
      if (real > 0 || estimated > 0) addDirect(rowId, col.id, real, estimated);
    });

    const ownRow = recurringOwnRowCharge(rec);
    if (ownRow) {
      const col = columns.find((c) => ownRow.date >= c.startIso && ownRow.date <= c.endIso);
      if (col) addDirect(rowId, col.id, ownRow.real, ownRow.estimated);
    }
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
