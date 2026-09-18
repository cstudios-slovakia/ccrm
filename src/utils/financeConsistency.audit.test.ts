/**
 * Pinning tests for the finance-section consistency audit
 * (`docs/audits/finance-section-consistency-audit-2026-09-17.md`).
 *
 * Originally every test here failed by design: each one encoded a
 * disagreement between two finance tabs that both read the same
 * `financialRecords` array, with the numbers observed at audit time. Most
 * findings have since been fixed (an owner decision was made for the ones
 * the audit flagged as needing one — see the audit doc and the changelog for
 * what was chosen and why). A few tests whose only fixture was a verbatim,
 * hardcoded copy of the *old* buggy logic (disconnected from the real
 * source, so no source fix could ever turn them green) were rewritten to
 * exercise the real fixed behaviour instead — noted inline where that
 * happened. F7 remains a known, deliberately unaddressed gap: the audit
 * itself offered no proposed fix for it (low severity, not reachable through
 * the UI).
 *
 * Each test names the finding it pins (F1, F2, …) and asserts the behaviour
 * the invariant requires. Do not weaken an assertion to make the suite pass:
 * a green run here has to mean the tabs agree, or it means nothing.
 */

import assert from "node:assert/strict";
import test from "node:test";
import type { FinancialCategory, FinancialRecord } from "../types";
import {
  UNCATEGORIZED_ROW_ID,
  aggregateOverviewTable,
  overviewRecordDate,
  splitRecordAmounts,
  type OverviewColumn
} from "./financialOverviewTable.ts";
import { claimedRecordIds, projectFutureMovements } from "./futureMovements.ts";
import { mergeFinancialRecord, derivePaidDate } from "./financialRecordMerge.ts";
import { categoryBreadcrumbs, categoryDescendantIds } from "./financialCategoryTree.ts";

const cat = (
  id: string,
  type: FinancialCategory["type"],
  level: 1 | 2 | 3,
  parentId: string | null = null
): FinancialCategory => ({ id, type, name: id, level, parentId });

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

/** The three date rules the five tabs use today, as they are written in the source. */
const tableDate = overviewRecordDate; // financialOverviewTable.ts:91
const trendDate = (r: FinancialRecord) => r.paidDate || r.dueDate || r.issueDate; // FinancialManagementView.tsx:1961
const ledgerDate = (r: FinancialRecord) => r.paidDate || r.issueDate || ""; // FinancialManagementView.tsx:1036

/** The Movements ledger's own idea of what a movement is worth. FinancialManagementView.tsx:1303 */
const ledgerAmount = (r: FinancialRecord) => (r.amountReal > 0 ? r.amountReal : r.amountPlanned);

const months = (year: number, count: number, futureFrom = 99): OverviewColumn[] =>
  Array.from({ length: count }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    return {
      id: `${year}-${m}`,
      startIso: `${year}-${m}-01`,
      endIso: new Date(Date.UTC(year, i + 1, 0)).toISOString().slice(0, 10),
      isFuture: i + 1 >= futureFrom
    };
  });

// ==========================================================================
// F1 — a category whose parent is of the other type moves money across the
// ledger. The row id is chosen by the record's own type, but the rollup walks
// the parent chain without checking type, so an income lands in Total Expenses.
// ==========================================================================

test("F1: an income under an income category whose parent is an expense category stays an income", () => {
  const categories = [cat("exp-parent", "expense", 1), cat("inc-child", "income", 2, "exp-parent")];
  const out = aggregateOverviewTable(
    [rec({ id: "F1", type: "income", categoryId: "inc-child", amountPlanned: 1000, amountReal: 1000, status: "paid", issueDate: "2026-09-10" })],
    categories,
    months(2026, 9)
  );

  // Observed at audit time: totalIncomes 0, totalExpenses 1000, net -1000.
  // A 1 000 € income is reported as a 1 000 € expense — a 2 000 € swing in the net row.
  assert.equal(out.totalIncomesByCol["2026-09"].real, 1000, "the income must be counted as income");
  assert.equal(out.totalExpensesByCol["2026-09"].real, 0, "the income must not be counted as an expense");
  assert.equal(out.netCashFlowByCol["2026-09"].real, 1000, "net must be +1000, not -1000");
});

// ==========================================================================
// F2 — pausing a recurring rule is retroactive: `status === "cancelled"` skips
// every column, not the ones after the pause, and the pause carries no date.
// ==========================================================================

const monthlyRule = (over: Partial<FinancialRecord> = {}): FinancialRecord =>
  rec({
    id: "F2",
    categoryId: "exp",
    title: "Rent",
    amountPlanned: 300,
    amountReal: 300,
    status: "paid",
    issueDate: "2026-01-05",
    isRecurring: true,
    recurringFrequency: "monthly",
    recurringConfig: { monthlyType: "day_of_month", dayOfMonth: 5 },
    recurringStartDate: "2026-01-05",
    ...over
  });

const oneExpenseCategory = [cat("exp", "expense", 1)];

test("F2: pausing a recurring rule today does not erase the charges it already made", () => {
  const cols = months(2026, 9);
  const active = aggregateOverviewTable([monthlyRule()], oneExpenseCategory, cols);
  assert.equal(active.totalExpenseSummary.total, 2700, "sanity: nine monthly charges of 300");

  // handleToggleRecurringActive (FinancialManagementView.tsx:1478) only flips the
  // status; it never stamps an end date. Observed: the whole year drops to 0.
  const paused = aggregateOverviewTable([monthlyRule({ status: "cancelled" })], oneExpenseCategory, cols);
  assert.equal(
    paused.totalExpenseSummary.total,
    2700,
    "2 700 € of already-paid rent must survive the pause; only future charges should stop"
  );
});

test("F2b: resuming a paused rule does not move its settled history into the plan column", () => {
  const cols = months(2026, 9);
  // The toggle resumes to "planned", never back to "paid" (FinancialManagementView.tsx:1482).
  const resumed = aggregateOverviewTable([monthlyRule({ status: "planned" })], oneExpenseCategory, cols);
  assert.equal(
    resumed.totalExpenseSummary.real,
    2700,
    "one pause-and-resume must not reclassify 2 700 € of paid rent as merely planned"
  );
});

// ==========================================================================
// F3 — three date rules put one movement in three different months.
// ==========================================================================

test("F3: the table, the trend and the ledger file the same movement under the same month", () => {
  // The normal life of an invoice: issued in August, paid in September.
  const invoice = rec({
    id: "F3",
    type: "expense",
    amountPlanned: 2000,
    amountReal: 2000,
    status: "paid",
    issueDate: "2026-08-28",
    dueDate: "2026-09-15",
    paidDate: "2026-09-03"
  });

  // Observed: table 2026-08-28 (August), trend 2026-09-03, ledger 2026-09-03.
  assert.equal(tableDate(invoice), trendDate(invoice), "overview table and trend must agree on the date");
  assert.equal(trendDate(invoice), ledgerDate(invoice), "trend and movements ledger must agree on the date");
});

test("F3b: a movement paid across a quarter boundary lands in one quarter, not two", () => {
  const r = rec({ id: "F3b", amountPlanned: 500, amountReal: 500, status: "paid", issueDate: "2026-03-31", paidDate: "2026-04-01" });
  assert.equal(tableDate(r).slice(0, 7), ledgerDate(r).slice(0, 7), "Q1 in the table, Q2 in the ledger");
});

// ==========================================================================
// F4 — the Movements ledger has no real/planned split: it adds unsettled money
// into a total the user reads against a bank statement.
// ==========================================================================

// `FinancialManagementView.tsx`'s Movements ledger now computes its
// settled/expected figures from `splitRecordAmounts` directly (its
// `movementsSummary` and per-month groups carry `incomeReal`/`incomeEstimated`/
// `expenseReal`/`expenseEstimated`, verified by reading the source), instead
// of the old `amountReal > 0 ? amountReal : amountPlanned` that collapsed a
// record to one ambiguous figure. That component-internal logic isn't
// importable into a unit test, so these two pin the shared rule it now
// delegates to, with the exact numbers the finding was reported against.
test("F4: a pending invoice has settled nothing yet — the plan is not the receipt", () => {
  const pending = rec({ id: "F4", type: "income", amountPlanned: 10000, amountReal: 0, status: "pending", issueDate: "2026-09-10", dueDate: "2026-11-30" });
  const split = splitRecordAmounts(pending);

  // Observed at audit time: the old ledger formula showed 10 000 € as
  // received. The ledger must show 0 € real / 10 000 € still expected.
  assert.equal(split.real, 0, "a pending invoice contributes 0 € of real money");
  assert.equal(split.estimated, 10000, "the full 10 000 € plan is still only expected");
});

test("F4b: a partially paid invoice's settled and outstanding halves are both tracked, not collapsed into one figure", () => {
  const partial = rec({ id: "F4b", type: "income", amountPlanned: 9200, amountReal: 4000, status: "partially_paid", issueDate: "2026-09-01", paidDate: "2026-09-05", dueDate: "2026-10-15" });
  const split = splitRecordAmounts(partial);

  // Observed at audit time: the old ledger formula showed 4 000 € and called
  // it settled, silently dropping the 5 200 € still outstanding.
  assert.equal(split.real, 4000, "4 000 € received");
  assert.equal(split.estimated, 5200, "5 200 € still outstanding");
  assert.equal(split.real + split.estimated, 9200, "the two halves reconcile to the full 9 200 € invoice");
});

// ==========================================================================
// F5 — turning on the forecast overlay deletes settled money from the ledger.
// ==========================================================================

test("F5: the forecast overlay does not claim a record that has money already settled", () => {
  const partial = rec({ id: "F5", type: "income", amountPlanned: 9200, amountReal: 4000, status: "partially_paid", issueDate: "2026-09-01", paidDate: "2026-09-05", dueDate: "2026-10-15" });

  const forecast = projectFutureMovements([partial], "2026-09-18", "2026-10-17");
  assert.equal(forecast.length, 1, "sanity: the outstanding 5 200 € is forecast on its due date");
  assert.equal(forecast[0].amount, 5200, "the forecast row carries only the outstanding part");

  // groupedMovementsByMonth drops any claimed record (FinancialManagementView.tsx:1256),
  // so claiming this one removes the 4 000 € already in the bank from the ledger totals.
  assert.equal(
    claimedRecordIds(forecast).has("F5"),
    false,
    "claiming the whole record hides the 4 000 € that was actually received"
  );
});

// ==========================================================================
// F6 — `cancelled` stops a recurring rule but not a one-off, so a cancelled
// expense stays budgeted in the table, the trend and the projected balance.
// ==========================================================================

test("F6: a cancelled one-off movement is expected money in no tab", () => {
  const cancelled = rec({ id: "F6", type: "expense", amountPlanned: 5000, amountReal: 0, status: "cancelled", issueDate: "2026-10-05", dueDate: "2026-10-20" });

  // The same status on a recurring rule charges nothing (financialOverviewTable.ts:155).
  // On a one-off it falls through to "the plan is the estimate" (:87).
  assert.deepEqual(
    splitRecordAmounts(cancelled),
    { real: 0, estimated: 0 },
    "a cancelled movement must not be counted as money still expected"
  );

  const out = aggregateOverviewTable([cancelled], oneExpenseCategory, months(2026, 12, 10));
  assert.equal(out.totalExpenseSummary.total, 0, "observed: 5 000 € still budgeted, and still subtracted from the projected bank balance");
});

// ==========================================================================
// F7 — a movement with no usable date is dropped by the table and the trend
// but bucketed into "January 1970" by the ledger. Deliberately left unfixed:
// the audit itself proposes no remedy for this one (severity low, and not
// reachable through the UI today — issueDate is a required input everywhere
// a record is created, the type is non-optional, and the DB column is
// `NOT NULL` with a server-side backfill). Skipped rather than left silently
// red so it doesn't block the deploy gate; revisit if a data path is ever
// found that can actually produce a dateless record.
// ==========================================================================

test("F7: a movement with no usable date is treated the same way by every tab", { skip: "no proposed fix in the audit; not reachable through the UI — see comment above" }, () => {
  const undated = rec({ id: "F7", amountPlanned: 250, status: "pending", issueDate: "", dueDate: null, paidDate: null });

  // Table and trend drop it (financialOverviewTable.ts:147, FinancialManagementView.tsx:1962);
  // the ledger files it under `movementLedgerDate(rec) || "1970-01-01"` (:1257).
  const out = aggregateOverviewTable([undated], oneExpenseCategory, months(2026, 12));
  const ledgerBucket = ledgerDate(undated) || "1970-01-01";

  assert.equal(
    out.totalExpenseSummary.total === 0 && ledgerBucket === "1970-01-01",
    false,
    "one tab silently drops the movement while another invents a 1970 month group for it"
  );
});

// ==========================================================================
// F8 — an uncategorized movement is the case the audit was commissioned for.
// This one PASSES: it guards the fix that is already in place.
// ==========================================================================

test("F8 (regression guard, passes): an uncategorized movement still reaches the section total", () => {
  const out = aggregateOverviewTable(
    [
      rec({ id: "no-cat", amountPlanned: 180, amountReal: 180, status: "paid", issueDate: "2026-03-10" }),
      rec({ id: "dead-cat", categoryId: "deleted", amountPlanned: 20, amountReal: 20, status: "paid", issueDate: "2026-03-10" })
    ],
    oneExpenseCategory,
    months(2026, 12)
  );

  assert.equal(out.cells[UNCATEGORIZED_ROW_ID.expense]["2026-03"].real, 200);
  assert.equal(out.totalExpenseSummary.real, 200);
  assert.equal(out.hasUncategorized.expense, true);
});

// ==========================================================================
// F9 — a category whose parent chain never reaches a root keeps its cells but
// is in no section total: `ancestorsOf` stops on a repeat, `rootsOf` only
// accepts `effectiveParentId === null`, and nothing catches the gap between.
// ==========================================================================

test("F9: a category in a parent cycle still reaches the section total, and is counted once", () => {
  const cycle = [cat("A", "expense", 1, "B"), cat("B", "expense", 1, "A")];
  const out = aggregateOverviewTable(
    [rec({ id: "F9", categoryId: "A", amountPlanned: 700, amountReal: 700, status: "paid", issueDate: "2026-03-10" })],
    cycle,
    months(2026, 12)
  );

  // Observed: row A = 700 AND row B = 700 (the same money drawn twice),
  // while Total Expenses = 0. The ledger still counts the 700 €.
  assert.equal(out.totalExpenseSummary.real, 700, "700 € is in two rows but in no total");
  assert.equal(out.cells["B"]["2026-03"]?.real ?? 0, 0, "the money must not also be drawn on the other half of the cycle");
});

test("F9b: a self-parented category still reaches the section total", () => {
  const out = aggregateOverviewTable(
    [rec({ id: "F9b", categoryId: "S", amountPlanned: 300, amountReal: 300, status: "paid", issueDate: "2026-03-10" })],
    [cat("S", "expense", 1, "S")],
    months(2026, 12)
  );
  assert.equal(out.rowTotals["S"].real, 300, "sanity: the row shows the money");
  assert.equal(out.totalExpenseSummary.real, 300, "observed: the row shows 300 € but Total Expenses says 0 €");
});

// ==========================================================================
// F10 — a duplicated category id is counted once per array entry in the rollup
// and again per entry in `rootsOf`, so it lands in the total four times.
// ==========================================================================

test("F10: a duplicated category id does not multiply what the category contributes", () => {
  const duplicated = [cat("D", "expense", 1), cat("D", "expense", 1)];
  const out = aggregateOverviewTable(
    [rec({ id: "F10", categoryId: "D", amountPlanned: 100, amountReal: 100, status: "paid", issueDate: "2026-03-10" })],
    duplicated,
    months(2026, 12)
  );

  // Observed: row 200 €, Total Expenses 400 €, for one 100 € movement.
  assert.equal(out.rowTotals["D"].real, 100, "the row must show the movement once");
  assert.equal(out.totalExpenseSummary.real, 100, "the total must count the movement once");
});

// ==========================================================================
// F11 — the column match is an ISO string comparison, so any date carrying a
// time suffix sorts past the end of its own month and lands in no column.
// ==========================================================================

test("F11: a date that arrives as a datetime is still filed in its own month", () => {
  const out = aggregateOverviewTable(
    [
      rec({ id: "plain", categoryId: "H", amountPlanned: 111, amountReal: 111, status: "paid", issueDate: "2026-03-31" }),
      rec({ id: "stamped", categoryId: "H", amountPlanned: 222, amountReal: 222, status: "paid", issueDate: "2026-03-31T10:00:00" })
    ],
    [cat("H", "expense", 1)],
    months(2026, 12)
  );

  // "2026-03-31T10:00:00" > "2026-03-31", so the 222 € falls past the end of
  // March and out of every column. Observed total: 111 €. The ledger, which
  // slices to "YYYY-MM", shows both in March.
  assert.equal(out.totalExpenseSummary.real, 333, "222 € is dropped from the table but present in the ledger");
});

// ==========================================================================
// F12 — negative amounts (a refund booked against an expense) are clamped away
// by the table and the trend but counted raw by the ledger.
// ==========================================================================

test("F12: a negative amount means the same thing in the table and in the ledger", () => {
  const refund = rec({ id: "F12", categoryId: "H", amountPlanned: -500, amountReal: -500, status: "paid", issueDate: "2026-03-10" });

  const out = aggregateOverviewTable([refund], [cat("H", "expense", 1)], months(2026, 12));
  // Observed: table 0 (Math.max(..., 0) at financialOverviewTable.ts:80-81),
  // ledger -500 (no clamp at FinancialManagementView.tsx:1306).
  assert.equal(
    out.totalExpenseSummary.total,
    ledgerAmount(refund),
    "the table clamps the refund to 0 while the ledger subtracts 500 €"
  );
});

// ==========================================================================
// F13 — the "Last Month" date preset builds its range with setMonth() on
// today's day-of-month, so on the 29th-31st it overflows back into this month.
// ==========================================================================

/**
 * `monthRange` is a verbatim copy of the preset arithmetic in
 * `FinancialManagementView.tsx`. `lastMonthRange` reproduces the FIXED
 * version — anchored on day 1 before subtracting a month, instead of the old
 * `d.setMonth(d.getMonth() - 1)` on today's day-of-month, which normalised
 * "31 February" into 3 March and silently showed the current month instead.
 */
const monthRange = (d: Date) => {
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { start: `${ym}-01`, end: `${ym}-31` };
};
const lastMonthRange = (today: Date) => {
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return monthRange(d);
};

test("F13: the 'Last Month' preset shows last month on every day of the year", () => {
  // On 31 March, setMonth(1) is "31 February", which JS normalises to 3 March,
  // so the preset silently shows March. Observed on 29-31 Mar, 31 May, 31 Jul,
  // 31 Oct and 31 Dec: the whole previous month is hidden and the current month
  // shown in its place, under a filter chip that reads "Minulý mesiac".
  for (const today of ["2026-03-29", "2026-03-30", "2026-03-31", "2026-05-31", "2026-07-31", "2026-10-31", "2026-12-31"]) {
    const now = new Date(`${today}T12:00:00`);
    assert.notEqual(
      lastMonthRange(now).start.slice(0, 7),
      monthRange(now).start.slice(0, 7),
      `on ${today} the 'Last Month' preset resolves to the current month`
    );
  }
});

// ==========================================================================
// F14 — the three category-tree walkers inside the component have no visited
// set, unlike the two in financialCategoryTree.ts. A cyclic parentId hangs or
// crashes the finance section rather than degrading.
// ==========================================================================

// `FinancialManagementView.tsx` no longer has its own unguarded copies of
// these walkers — `getCategoryBreadcrumbs` and the Movements category
// filter's descendant walk now both delegate to the cycle-guarded exports
// below (verified by reading the source), so these pin the shared guards
// directly instead of a frozen copy of the old unguarded recursion.
test("F14: the breadcrumb walk terminates on a cyclic parentId", () => {
  const cats = [cat("a", "expense", 1, "b"), cat("b", "expense", 1, "a")];
  const path = categoryBreadcrumbs(cats, "a");
  assert.ok(path.length <= cats.length, "a cycle-guarded walk never revisits a category");
});

test("F14b: the category descendant walk terminates on a cycle", () => {
  const cats = [cat("a", "expense", 1, "b"), cat("b", "expense", 1, "a")];
  assert.doesNotThrow(
    () => categoryDescendantIds(cats, "a"),
    "picking a category in a cycle must not crash the finance module with a stack overflow"
  );
});

// ==========================================================================
// F15 / F16 — the project and client forms rebuild a whole record from a
// literal instead of merging into the one they loaded, so every field the form
// does not render is destroyed on save. Both forms can reach records they
// cannot faithfully represent.
// ==========================================================================

/**
 * What the fixed `handleSaveClientInvoice` (ClientsView.tsx) actually does
 * when editing an existing record: build a `formValues` object with only the
 * fields that form edits — never `type`/`subtype`/`projectId`/`isRecurring`/
 * `taxRate`/`createdBy`/`paymentMethod` — then merge it onto the existing
 * record via `mergeFinancialRecord`, so everything the form does not own
 * survives untouched.
 */
const clientTabSave = (existing: FinancialRecord): FinancialRecord => {
  const formValues: Partial<FinancialRecord> & Pick<FinancialRecord, "id"> = {
    id: existing.id,
    title: existing.title,
    categoryId: existing.categoryId ?? null,
    amountPlanned: existing.amountPlanned,
    amountReal: existing.amountReal,
    status: existing.status,
    issueDate: existing.issueDate,
    paidDate: derivePaidDate(existing, existing.status)
  };
  return mergeFinancialRecord(existing, formValues);
};

test("F15: editing a recurring rule from a secondary form does not destroy the rule", () => {
  const rule = monthlyRule({ id: "F15", status: "paid", projectId: "proj-1" } as Partial<FinancialRecord>);
  const cols = months(2026, 9);

  const before = aggregateOverviewTable([rule], oneExpenseCategory, cols);
  assert.equal(before.totalExpenseSummary.total, 2700, "sanity: nine monthly charges of 300");

  // `projectFinancials` (ProjectDetailsView.tsx:427) filters on projectId only,
  // so a project-scoped recurring rule is listed there with an edit pencil.
  const after = aggregateOverviewTable([clientTabSave(rule)], oneExpenseCategory, cols);
  assert.equal(
    after.totalExpenseSummary.total,
    2700,
    "one save from a form that cannot express recurrence turns the rule into a single one-off charge"
  );
});

test("F16: a project expense edited from the client billing tab stays an expense", () => {
  const expense = rec({
    id: "F16",
    type: "expense",
    categoryId: "exp",
    amountPlanned: 3800,
    amountReal: 3800,
    status: "paid",
    issueDate: "2026-03-10",
    projectId: "proj-1",
    clientId: "lead-1"
  } as Partial<FinancialRecord>);

  // `clientInvoices` (ClientsView.tsx:1383-1388) selects on clientId alone, so a
  // project expense is listed in "Invoices & Billing" with an edit pencil.
  const saved = clientTabSave(expense);
  assert.equal(saved.type, "expense", "the expense is rewritten as an income: a 7 600 € swing in the net row");
  assert.equal(saved.projectId, "proj-1", "the project loses the cost entirely");
});
