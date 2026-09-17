# Audit prompt — the finance section must never hide or lose a movement

Hand this whole file to the agent. It is a **prompt**, not a report: the agent's job is
to produce the report. Work through every step in order; do not skip a step because it
"looks fine". Quote file paths and line numbers for every claim.

---

## The defect class

The finance section (`src/components/FinancialManagementView.tsx`, hash `#financial`)
shows the **same set of movements** in five tabs:

| Tab | Hash | What it is |
|---|---|---|
| Global Overview & Trend | `#financial/overview` | 18-week cash-flow chart + weekly breakdown table, computed in `weeklyTrendData` |
| Overview Table | `#financial/table` | category × period matrix, computed in `overviewTableData` → `src/utils/financialOverviewTable.ts` |
| Movements | `#financial/movements` | the ledger: every record, filterable, grouped by month (`filteredMovements`, `groupedMovementsByMonth`, `movementsSummary`) |
| Recurring Expenses | `#financial/recurring` | only `isRecurring` records, with monthly/annual KPIs (`filteredRecurringRecords`, `recurringMetrics`) |
| Movement Categories | `#financial/categories` | the 3-level tree the table rows come from (`categoryTree`, `src/utils/financialCategoryTree.ts`) |

There is **one** array behind all of them, `financialRecords`, plus `financialCategories`.
Every tab is a different projection of that one array. A movement that is counted in
one tab and silently dropped, double-counted, dated differently, or put on the wrong
side of the ledger in another tab is a bug — even when each tab "looks right" on its
own, because the user compares the tabs against each other and against the bank
statement.

The worked example, and the reason this audit exists:

> Task as reported: *"skutočnosť sa nezobrazuje v prehľadovej tabuľke"* (the "Real"
> figure does not show in the overview table).
>
> Root cause: `overviewTableData` did `if (!recDate || !rec.categoryId) return;` — every
> movement without a category was dropped from the matrix, from the "Total Expenses" /
> "Total Incomes" rows and from the net row. The Movements tab and the trend chart still
> counted the same movement. So "Real" in the table was lower than "Real" everywhere else
> until the user categorised every single payment.
>
> Fixed by giving each section an **Uncategorized** row (`UNCATEGORIZED_ROW_ID` in
> `src/utils/financialOverviewTable.ts`) that also catches a category id that no longer
> exists and a category of the other type. Pinned by `src/utils/financialOverviewTable.test.ts`
> and `tests/e2e/financialOverviewTable.spec.ts`.
>
> Two neighbours were found in the same pass and fixed with it: a `partially_paid`
> movement counted its paid part as an *estimate* and lost the unpaid remainder; and a
> **paused** recurring rule (`status === "cancelled"`) kept charging every month in the
> table and the trend while the Recurring tab's KPIs excluded it.

Your job is to find **every remaining bug of this class**.

## The invariants

Test each tab against these. Every violation is a finding.

1. **Completeness.** Every record in `financialRecords` is counted in exactly one row of
   the Overview Table, exactly one week of the trend (or several, for a recurring rule),
   and exactly one month group of the Movements ledger — unless a *visible* filter
   excludes it. "No category", "category deleted", "category of the other type",
   "no due date", "no paid date", "amountReal = 0", "amountPlanned = 0", "status =
   cancelled", "dated on the last day of a period", "dated before the horizon" are all
   inputs that must not make a movement disappear without trace.
2. **One definition of "Real" / "Skutočnosť".** What counts as settled money must be the
   same rule everywhere. Today the rule is `splitRecordAmounts()` in
   `src/utils/financialOverviewTable.ts`. Find every other place that decides "real vs
   planned" from `status` / `amountReal` / `amountPlanned` and check it agrees:
   `weeklyTrendData`, `movementsSummary`, `groupedMovementsByMonth`, the movement row
   value cell, `recurringMetrics`, the KPI cards at the top of each tab, the project
   finance tab in `src/components/ProjectDetailsView.tsx`, and any dashboard card that
   reads `financialRecords` (`src/components/ProjectsView.tsx`, `src/components/ClientsView.tsx`,
   `src/App.tsx`).
3. **One date per movement.** A movement must land in the same period in every tab.
   Today the tabs disagree: Overview Table files by `issueDate || paidDate || dueDate`
   (`overviewRecordDate`), the trend by `paidDate || dueDate || issueDate`, the
   Movements ledger by `paidDate || issueDate`. Document each place, show a concrete
   record that lands in different months, and propose one rule (recommended: cash-basis
   `paidDate` once paid, otherwise `dueDate || issueDate` — but state the trade-off and
   let the owner decide; do not change it yourself).
4. **One side of the ledger.** `record.type` decides income vs expense. A category of the
   other type must not flip it. Check the movement form (`formType` toggle vs
   `formCategoryId`), the project finance form, and `SearchableCategorySelect`.
5. **Recurring rules are one entity, shown many times.** A rule appears once in the
   Recurring tab and once per charge in the table and the trend. Check: (a) the Movements
   ledger — does a rule appear there as a single row, and is it counted once in
   `movementsSummary` and the month group totals while the table counts it 12 times?
   Decide whether that is intended and say so; (b) paused rules (`cancelled`) charge
   nothing anywhere; (c) `recurringStartDate` / `recurringEndDate` are respected in every
   tab; (d) `recurringAmountHistory` (amount changes over time) is honoured everywhere a
   past charge is priced — see `src/utils/recurringExpenses.ts`; (e) the "next charge"
   date in the Recurring tab is the same date the trend bills the week on.
6. **Category tree integrity.** For every category: `parentId` exists or is null, `level`
   equals the real depth, `type` equals its parent's type, no cycles. Rows in the
   Overview Table are built by `categoryChildren()` (which forgives a missing parent) —
   the rollup in `aggregateOverviewTable()` walks the same parent chain, so check that
   nothing else (the Categories tab, the category picker, `getCategoryBreadcrumbs`,
   the Movements category filter which uses raw `c.parentId === parentId`) disagrees with
   that tree. Deleting a category (`handleDeleteCategory`) must leave the records that
   used it visible as Uncategorized in every tab, and the change must survive a sync.
7. **Totals add up.** In the Overview Table: sum of level-1 rows + Uncategorized row =
   "Total Expenses" (and Incomes), per column and in the horizon column; net = incomes −
   expenses. In the trend: `totalIncome = incomeReal + incomePlanned + incomeProjected`
   and the cumulative balance is a running sum of `netDifference` from the anchor. In the
   Movements ledger: sum of month-group totals = `movementsSummary`. Check each with a
   real dataset, not by reading the code.
8. **Filters hide, they do not lose.** For every filter (search, type, category incl.
   descendants, scope global/project/client, min/max amount, date presets incl.
   `this_quarter`'s hand-built `-31` end date, custom range), removing the filter must
   bring the same records back. Check that a filter set in one tab does not silently
   apply to another (state is per tab: `movementsScope`, `recurringScopeFilter`,
   `tableSearchQuery`).
9. **Other writers.** `financialRecords` is also written by `ProjectDetailsView.tsx`
   (project finance tab) and read by `ProjectsView.tsx` / `ClientsView.tsx`. Records
   created there must obey the same shape (note `paidDate: finFormStatus === "paid" ?
   todayLocal() : null` — editing an already paid record rewrites its paid date to today;
   `partially_paid` gets no paid date). Confirm every writer produces records the five
   tabs agree on.
10. **Sync round trip.** A record or category edited in any tab reaches `sync.php`
    (`financial_records`, `financial_categories` blocks) and comes back identical:
    `category_id` null vs `""`, `is_recurring` as boolean, `recurring_config_json`,
    `recurring_amount_history_json`, `amount_real` decimals, dates as `YYYY-MM-DD` (not
    datetimes — the table compares ISO strings, so a `2026-01-31T10:00` would fall out of
    January). See `docs/audits/sync-roundtrip-audit-2026-09-16.md` for the method.

## How to work

1. **Read first, then run.** Read `FinancialManagementView.tsx` top to bottom once. It is
   ~6 300 lines; the computations are all `useMemo`s between lines ~980 and ~2 300, the
   tabs render from ~3 530. Read `src/utils/financialOverviewTable.ts`,
   `src/utils/recurringExpenses.ts`, `src/utils/financialCategoryTree.ts` in full.
2. **Build a hostile dataset.** Extend `tests/e2e/helpers/fixture.ts` (`FINANCIAL_RECORDS`,
   `FINANCIAL_CATEGORIES`) on a scratch branch with, at minimum: an income under an
   expense category; a record whose `categoryId` points nowhere; a `partially_paid`
   invoice; a `cancelled` one-off; a paused recurring rule; a yearly rule; a weekly rule
   with an end date in the past; a record dated the last day of a month, one dated the
   first day of the year, one with `issueDate` in one month and `paidDate` in the next;
   a level-3 category under a level-1 (wrong `level`); a category whose parent is of
   the other type; an amountPlanned = 0 / amountReal > 0 paid record. Then load
   `#financial` and compare the five tabs by hand. The QA harness seeds this fixture
   (`npm run test:qa` — see `docs/TESTING.md`), no database needed.
3. **Prove each finding two ways.** A code citation *and* an observed number: "table
   says 2 400 in March, ledger says 2 580 for the same filter". Put the reproduction in
   a unit test against `aggregateOverviewTable()` / `splitRecordAmounts()` when the bug is
   in the aggregation, or in a Playwright spec next to `tests/e2e/financialOverviewTable.spec.ts`
   when it is in a tab's rendering or filters. Do not fix; the tests may fail — that is
   the deliverable.
4. **Do not loosen a check to make a number match.** If two tabs disagree, the finding
   is the disagreement plus a recommendation, not a change to one of them.
5. **Stay in scope.** Finance only: the five tabs, the two forms, the project finance
   tab, the dashboard/project/client readers, and the finance parts of `sync.php`.
   Invoicing (`InvoicingView.tsx`) is a separate module; note a cross-link only if it
   writes `financialRecords`.

## Report format

Write `docs/audits/finance-section-consistency-audit-<date>.md`. Group by **root cause**,
not by tab — one wrong date rule surfaces in three tabs and is one finding. For each:

```
### F<n>. <one line: what is wrong>
Severity: blocker | high | medium | low     (blocker = money missing from a total)
Observed: <tab, action, number seen vs number expected — with the dataset record ids>
Root cause: <file:line — the exact expression>
Also affects: <other tabs / readers that share the cause>
Invariant: <which of 1–10 above>
Proposed fix: <one paragraph; name the single place the rule should live>
Pinned by: <test file you added, or "not yet — reason">
```

Finish with a table: invariant → pass / fail / not verifiable, and a list of everything
you checked that was **correct**, so the next audit does not redo it.
