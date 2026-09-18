# Finance section consistency audit — 2026-09-17

Commissioned by [`finance-section-consistency-audit-PROMPT.md`](finance-section-consistency-audit-PROMPT.md).
Method: five parallel readers (one per invariant group), every finding re-verified by
the auditor against the source and, where the bug is in a pure function, against
observed numbers from the real helpers.

**Nothing was fixed.** The prompt asks for the reproduction, not the repair, because
most findings are a disagreement between two tabs and only the owner can say which of
the two should change.

- **21 pinning tests** in [`src/utils/financeConsistency.audit.test.ts`](../../src/utils/financeConsistency.audit.test.ts) — **20 fail by design**, one is a passing regression guard for the Uncategorized fix that prompted this audit.
- Run them with `node --test --experimental-strip-types src/utils/financeConsistency.audit.test.ts`.
- ⚠️ This file is inside the `npm run test:unit` glob, so **the unit suite is now red (20 failures) and `npm run deploy` will refuse to ship.** That is deliberate. Move or delete the file if you need a green suite before the findings are addressed.

## Verdict

| Invariant | Verdict |
|---|---|
| 1 — completeness, no movement silently dropped | **FAIL** — F1, F5, F6, F9, F11, F12, F26 |
| 2 — one definition of "Real" / Skutočnosť | **FAIL** — five independent definitions (F4, F17, F20) |
| 3 — one date per movement | **FAIL** — four independent date rules (F3, F19) |
| 4 — one side of the ledger | **FAIL** — F1 (blocker), F16 (blocker), F24 |
| 5 — recurring rules are one entity | **FAIL** — F2, F15 (blockers), F17, F22 |
| 6 — category tree integrity | **FAIL** — F1, F9, F10, F14, F22 |
| 7 — totals add up | **PASS for well-formed data**; FAIL for the shapes in F1, F9, F10, F12 |
| 8 — filters hide, they do not lose | **FAIL** — F13, F18, F23 |
| 9 — other writers | **FAIL** — F15, F16 (blockers), F19, F20 |
| 10 — sync round trip | **PASS on values**, FAIL on hardening (F21) |

**Six blockers.** Ranked by how much money moves and how easily a user reaches them:

1. **F1** — an income under a category whose parent is an expense category is added to *Total Expenses*. Reachable in three clicks.
2. **F16** — editing a project expense from the client billing tab rewrites it as an income and detaches it from the project.
3. **F15** — editing a recurring rule from the project or client tab destroys the rule.
4. **F2** — pausing a recurring rule retroactively erases every charge it ever made.
5. **F5** — turning on the forecast overlay deletes already-received money from the ledger totals.
6. **F4** — the Movements ledger has no concept of "Real" at all.

---

## Root cause A — the category parent chain is trusted without checking type, cycles or duplicates

`effectiveParentId()` ([`src/utils/financialCategoryTree.ts:27-28`](../../src/utils/financialCategoryTree.ts)) forgives a *missing* parent but nothing else. `aggregateOverviewTable`'s rollup walks that chain and `rootsOf()` defines a section root as "has no parent", so any category the chain mishandles takes its movements with it.

### F1. A category whose parent is of the other type puts its movements in the opposite section's total
Severity: **blocker** (money on the wrong side of the ledger, and a double-size error in net)

**Observed.** Categories `exp-parent` (expense, L1) and `inc-child` (**income**, L2, `parentId: exp-parent`). One paid income of 1 000 € under `inc-child`:

```
totalIncomesByCol["2026-09"] = { real:    0, estimated: 0, total:    0 }
totalExpensesByCol["2026-09"] = { real: 1000, estimated: 0, total: 1000 }
netCashFlowByCol["2026-09"]   = { real: -1000 }        expected: +1000
hasUncategorized = { expense: false, income: false }   ← no trace anywhere
```

The Movements ledger reports the same record as income +1 000. The row is also drawn in **neither** tree — the income tree asks `categoryChildren(cats,"income",null)` and `inc-child` has a parent; `exp-parent`'s children are filtered to `type === "expense"`. So 1 000 € sits inside "Total Expenses" with no row on screen that explains it.

**Root cause.** [`financialOverviewTable.ts:168-179`](../../src/utils/financialOverviewTable.ts) — `ancestorsOf()` never compares `parent.type` to `cat.type`; [`:210-213`](../../src/utils/financialOverviewTable.ts) — `rootsOf(type)` requires `effectiveParentId === null`, so the child is in no section's root list while its money is inside an expense root. `overviewRowIdFor()` ([`:57-63`](../../src/utils/financialOverviewTable.ts)) guards the *record→category* type match; the hole is one level up, at the *category→parent* link.

**Reachable from the UI, no corrupt data needed.** `newCatParentId` (`FinancialManagementView.tsx:953`) is not reset when the Expense/Income tree switcher flips (`:6219`, `:6227`), and `handleCreateCategory` (`:2818-2846`) validates depth but never `parent.type === catTreeType`. The parent field shows the "Select…" placeholder because `CustomSelect` finds no matching option, so the user believes they are creating a root while the state still holds the expense parent id.

**Also affects.** The Movements category filter (`:1056-1062`, raw `parentId` walk with no type check, so filtering by the expense parent returns the income record); the Categories tab and the picker, where the row is invisible.

**Invariant.** 1, 4, 6, 7.

**Proposed fix.** One rule, one place: extend `effectiveParentId(cat, byId)` to return `null` when the parent's `type` differs from the child's. `categoryChildren`, `ancestorsOf` and `rootsOf` all already route through it, so the stray category becomes a visible root of its own section and the money lands on the right side everywhere at once. Separately, guard `handleCreateCategory` and reset `newCatParentId` on `setCatTreeType`.

**Pinned by.** `financeConsistency.audit.test.ts` → `F1`.

### F9. A category unreachable from any root keeps its cells but is in no total
Severity: **high**

**Observed.** Cycle `A.parentId = B`, `B.parentId = A`, one paid 700 € expense under `A`:

```
cells["A"]["2026-03"] = { real: 700 }   cells["B"]["2026-03"] = { real: 700 }   ← same money, twice
totalExpenseSummary   = { real:   0 }                                           ← and in no total
```

Self-parent (`S.parentId === "S"`), 300 € under `S`: `rowTotals["S"].real = 300`, `totalExpenseSummary.real = 0`. The ledger counts the money in both cases.

**Root cause.** [`financialOverviewTable.ts:168-179`](../../src/utils/financialOverviewTable.ts) — `ancestorsOf()` stops on a repeat but returns a chain that never ends at a parentless category; [`:210-213`](../../src/utils/financialOverviewTable.ts) — `rootsOf()` only accepts `effectiveParentId === null`. Nothing catches "has a parent, but no ancestor is a root". `categoryChildren(…, null)` excludes the same rows, so they cannot be repaired from the UI either.

**Invariant.** 1, 6, 7.

**Proposed fix.** Define "root" as *the last element of the guarded parent chain* rather than *has no parent*, and use that one definition for both the rollup and `rootsOf`. `effectiveParentId` should also reject `cat.parentId === cat.id` outright.

**Pinned by.** `F9`, `F9b`.

### F10. A duplicated category id quadruples what that category contributes
Severity: medium (reachable only through a bad sync or import, but silent and large)

**Observed.** `financialCategories` holds the id `D` twice; one paid 100 € expense under `D` → `rowTotals["D"].real = 200`, `totalExpenseSummary.real = **400**`.

**Root cause.** [`financialOverviewTable.ts:181-191`](../../src/utils/financialOverviewTable.ts) adds `direct[cat.id]` once per *array entry*, not once per id; `rootsOf()` then returns the id twice, adding the already-doubled cell twice more.

**Invariant.** 7.

**Proposed fix.** Iterate `byId.values()` (the `Map` already collapses duplicates) in both the rollup loop and `rootsOf`. One line each.

**Pinned by.** `F10`.

### F14. Three in-component tree walkers have no cycle guard — the finance tab hangs or crashes
Severity: **high**

**Observed**, running verbatim copies against `a.parentId = "b"`, `b.parentId = "a"`:

- `getCategoryBreadcrumbs("a")` (`FinancialManagementView.tsx:1020-1032`) — `while (current.parentId)` with no visited set; the path grows without bound. Called once per ledger row (`:5491`) and per recurring row (`:5980`), so the tab freezes.
- `addChildren` (`:1056-1062`) — recurses with no visited set → `RangeError: Maximum call stack size exceeded`, thrown inside a `useMemo` during render, so the per-view `ErrorBoundary` (`src/App.tsx:3257`) replaces the **entire finance section** with the error screen. Triggered by simply picking a category in the Movements filter.
- `getCategoryPath` in the picker (`:194-204`) — same unbounded loop, run for every option in the dropdown.

`categoryDescendantIds()` ([`financialCategoryTree.ts:57-69`](../../src/utils/financialCategoryTree.ts)) and `ancestorsOf()` **do** guard. The in-component copies were written without it.

**Invariant.** 6.

**Proposed fix.** Delete all three in-component walkers and import guarded ones from `financialCategoryTree.ts` — lift the chain walk that already exists inside `aggregateOverviewTable`. One tree module, one set of guards.

**Pinned by.** `F14`, `F14b`.

---

## Root cause B — there is no single definition of "Real"

Five independent rules decide what counts as settled money.

| Site | Rule |
|---|---|
| `splitRecordAmounts()` [`financialOverviewTable.ts:77-88`](../../src/utils/financialOverviewTable.ts) — **the reference** | `paid` → all real; `partially_paid` → paid part real, remainder estimated; else all estimated |
| Overview Table, recurring branch [`:159`](../../src/utils/financialOverviewTable.ts) | `!col.isFuture && rec.status === "paid"` — a whole-column verdict |
| Trend, recurring branch `FinancialManagementView.tsx:2005-2013` | past/current week ⇒ **real, status never read** |
| Movements ledger `:1159`, `:1303`, `:5495` | `amountReal > 0 ? amountReal : amountPlanned` — **no status at all** |
| Recurring KPIs `:1619`, `:1624`, `:5796`, `:5983` | `amountReal > 0 ? … : amountPlanned` — **real-first**, vs `recurringPlannedAmountAt`'s planned-first |
| `ProjectDetailsView.tsx:447-451`, `ClientsView.tsx:4439-4442` | `+= r.amountReal \|\| 0` — raw field, status never read |

### F4. The Movements ledger has no concept of "Real" — it adds planned, pending, overdue and cancelled money into a total labelled "Príjmy / Výdavky / Čistý rozdiel"
Severity: **blocker**

**Observed.** A `pending` income, `amountPlanned = 10 000`, `amountReal = 0`, due 2026-11-30:

| Tab | Figure |
|---|---|
| Movements KPI pill + September group | **+10 000 €** |
| Overview Table, September | Skutočnosť **0 €**, Plán 10 000 € |
| Trend | `incomeReal 0`, `incomeProjected 10 000` |

The ledger's is the only figure with no real/estimated separation — and it is the one the user reads against the bank statement. For a `partially_paid` 9 200 € invoice with 4 000 € received, the ledger shows 4 000 € and calls it settled while the table's column total is 9 200 € (4 000 real + 5 200 estimated).

**Root cause.** `FinancialManagementView.tsx:1303`, with the same expression at `:1159` (the amount-range filter, so a 10 000 € *plan* passes a "min 5 000 € received" filter) and `:5495`.

**Invariant.** 2, 7.

**Proposed fix.** The ledger should call `splitRecordAmounts()` and carry `real` and `estimated` per group and in `movementsSummary`, exactly as the trend already does at `:1969`. The rule is already exported and already imported by this file at `:61`. The pill can then read "+4 000 settled · +5 200 expected".

**Pinned by.** `F4`, `F4b`.

### F17. The Recurring tab's KPIs are computed from a different rule set than every other tab
Severity: **high**

**Observed.** Eight rules, 2026. The four cards say `Annual Overhead Projection −28 840 €/yr`; the Overview Table's own 2026 columns for the same rules total **24 380 €**. Four independent causes in `recurringMetrics` (`:1604-1650`) and `getMonthlyEquivalent` (`:1495-1500`):

- **`recurringAmountHistory` ignored** (`:1619` uses the current amount). A rule raised 500 → 600 on 1 Sep counts as 600 × 12 = 7 200 €/yr; `recurringCharges` gives 8 × 500 + 4 × 600 = **6 400 €**.
- **`recurringEndDate` ignored** — a weekly rule that ended 2026-03-31 charges 0 € for the rest of the year but still contributes 433,33 €/month → **5 200 €/yr** to the card, and is counted in "Active Commitments". `recurringStartDate` is ignored the same way, so a rule starting next year is already in this month's costs.
- **planned/real inverted** (see the table above).
- **weekly approximated as 52/12** rather than read off the calendar.

Also: the "Next charge" card (`:5796`) prices at `amountReal || amountPlanned`, ignoring `recurringAmountHistory`, and scans `activeExpenses` only — a recurring **income** can never be the next charge. No card renders `totalMonthlyIncome` / `totalAnnualIncome` at all (`:5731-5810`), so recurring income is invisible on the tab that owns recurring movements.

**Invariant.** 2, 5(b), 5(c), 5(d).

**Proposed fix.** Compute the cards from the same helper the table uses — `recurringTotalInRange(rule, <next 12 months>)` for the annual card, `/12` for the monthly one. Start date, end date, history, month-end clamping and real week counts then all come for free and the card cannot disagree with the table.

**Pinned by.** Not yet — needs `recurringMetrics` lifted out of the component first. Reproduction is in the finding above.

### F20. The project and client readers take "Real" straight off `amountReal`
Severity: **high**

**Observed.** A `paid` expense, `amountPlanned = 3 000`, `amountReal = 0`, `projectId = P1`:

- `splitRecordAmounts` → **real 3 000** (the `paid` branch falls back to the plan). Table, trend and the ledger row all show 3 000 € settled.
- `ProjectDetailsView.tsx:451` → `totalRealExpenses += r.amountReal || 0` = **0**. So `realProfit` (`:456`) overstates profit by 3 000 €, `budgetAnalysis.spent` (`:493`) reports **0 € spent**, and the per-row cell (`:3445`) prints 0,00 € for a movement the ledger prints as −3 000 €.
- Mirror case: `status = cancelled, amountReal = 1 200` counts 1 200 € into `totalRealExpenses`, because neither reader ever looks at `status`.
- `ClientsView.tsx:4439-4442` has the identical shape, plus `pendingAmount`/`overdueAmount` buckets that exclude `partially_paid` and `cancelled` while the totals include them — so the panel's own buckets do not add up to its own total.

**Invariant.** 2, 9.

**Proposed fix.** Both readers should import `splitRecordAmounts` and accumulate `real`/`estimated` from it, exactly as `weeklyTrendData` does at `:1969`. The rule already lives in one place and is already unit-tested; these two files simply are not using it.

**Pinned by.** Not yet — component-level; best pinned by a Playwright check that the project finance card equals the ledger figure for the same scope.

---

## Root cause C — there is no single date rule

Four independent orders decide which period a movement lands in.

| Rule | Expression | Site |
|---|---|---|
| D1 Overview Table | `issueDate \|\| paidDate \|\| dueDate` | [`financialOverviewTable.ts:91-93`](../../src/utils/financialOverviewTable.ts) |
| D2 Trend | `paidDate \|\| dueDate \|\| issueDate` | `FinancialManagementView.tsx:1961` |
| D3 Movements ledger | `paidDate \|\| issueDate` (**`dueDate` never consulted**) | `FinancialManagementView.tsx:1036` |
| D4 Forecast overlay | `dueDate \|\| issueDate` (**`paidDate` never consulted**) | [`futureMovements.ts:92-94`](../../src/utils/futureMovements.ts) |

Since `issueDate` is typed non-optional and is `DATE NOT NULL`, D1 is effectively *always* issue-basis while D2/D3 are cash-basis.

### F3. Three date rules put the same movement in three different months
Severity: **high**

**Observed.** The normal life of an invoice — `issueDate 2026-08-28`, `dueDate 2026-09-15`, `paidDate 2026-09-03`, 2 000 €:

| Tab | Date used | Bucket |
|---|---|---|
| Overview Table | 2026-08-28 | **August** |
| Trend | 2026-09-03 | **September** |
| Movements ledger | 2026-09-03 | **September** |

August's "Total Expenses" is 2 000 € higher in the table than in the ledger; September is 2 000 € lower. Neither tab is wrong alone; they cannot both be right.

This is created on purpose: `handleConfirmStatusAmount` (`:2780`) stamps `paidDate = record.paidDate || todayLocal()` the moment a row is marked paid, so marking an August invoice paid today instantly moves it out of August in two tabs of three.

Boundary variants, same cause: `issueDate 2026-03-31 / paidDate 2026-04-01` → **Q1** in the table, **Q2** in the ledger and in the `this_quarter` filter. `issueDate 2026-12-31 / paidDate 2027-01-02` → two annual totals differ by the amount.

**Invariant.** 3.

**Proposed fix — owner decides, do not change unilaterally.** Put one exported function next to `overviewRecordDate` and have all four sites call it.

- *Recommended — cash basis* (`paidDate || dueDate || issueDate`, i.e. adopt D2 everywhere). It is the rule two of the three tabs already use and the only one that matches a bank statement, which the prompt names as the thing the user compares against. **Trade-off:** the table's columns then mean "when the money moved", so a paid invoice leaves the month it was issued in, and an accountant reconciling against an issued-invoice report will see different monthly figures.
- *Alternative — accrual basis* (`issueDate` always). The table keeps its present meaning, but the trend stops being a cash-flow projection and the bank-balance plotline becomes meaningless.
- A defensible middle course: file by cash date everywhere **and** give the Overview Table an explicit "by issue date / by payment date" switch, so the disagreement becomes a stated choice rather than a silent one.

**Pinned by.** `F3`, `F3b`.

### F11. A date carrying a time suffix is silently dropped from the table
Severity: medium

**Observed.** Two identical paid expenses on the last day of March — `"2026-03-31"` (111 €) and `"2026-03-31T10:00:00"` (222 €). Table total: **111 €**. The 222 € is in no column and no total; the ledger, which slices to `YYYY-MM`, shows both in March.

**Root cause.** [`financialOverviewTable.ts:150`](../../src/utils/financialOverviewTable.ts) compares ISO strings and `"2026-03-31T10:00:00" > "2026-03-31"`, so the record falls past the end of its own month. Same comparison in the trend (`:1965`).

Today `sync.php` stores all five date fields as MySQL `DATE` and returns bare `YYYY-MM-DD` (verified — see F21), so this is not live. It is the failure mode the prompt's invariant 10 predicted, and it is one import away.

**Proposed fix.** Normalise in one place: `overviewRecordDate()` returns `String(value).slice(0, 10)`, same in the trend.

**Pinned by.** `F11`.

### F7. A movement with no usable date is dropped by two tabs and bucketed into 1970 by the third
Severity: low (not reachable through the UI)

Table and trend drop it (`financialOverviewTable.ts:147`, `:1962`); the ledger files it under `movementLedgerDate(rec) || "1970-01-01"` (`:1257`), so the ledger total exceeds the table's by the amount. Not reachable today: the issue-date input is `required` (`FinancialManagementView.tsx:3330`, `ProjectDetailsView.tsx:3620`, `ClientsView.tsx:4661`), the type is non-optional, the column is `DATE NOT NULL`, and `sync.php:3839` backfills today's date.

**Pinned by.** `F7`.

---

## Root cause D — `cancelled` means two opposite things, and pausing is retroactive

### F2. Pausing a recurring rule erases every charge it ever made
Severity: **blocker**

**Observed.** A 300 €/month rule running since 2026-01-05, Jan–Sep columns:

```
status = "paid"       Total Expenses = { real: 2700, estimated:    0, total: 2700 }
status = "cancelled"  Total Expenses = { real:    0, estimated:    0, total:    0 }   ← 2 700 € gone
status = "planned"    Total Expenses = { real:    0, estimated: 2700, total: 2700 }   ← after resume
```

Click Active→Paused today and 2 700 € of already-paid rent vanishes from Jan–Sep, from "Total Expenses", from the net row and from the 18-week trend. The Movements ledger still shows the row, so the two tabs now disagree by 2 700 €.

Resuming is the mirror: `handleToggleRecurringActive` (`:1478-1492`) resumes to `"planned"`, never back to `"paid"`, so one pause-and-resume moves 2 700 € out of *Skutočnosť* into *Plán* in every past month — while the trend keeps billing the same weeks as real (F17).

**Root cause.** [`financialOverviewTable.ts:155`](../../src/utils/financialOverviewTable.ts) `if (rec.status === "cancelled") return;` skips **all** columns, not the ones after the pause. Same guard at `:1999` and [`futureMovements.ts:125`](../../src/utils/futureMovements.ts). The pause carries no date: `handleToggleRecurringActive` only flips `status`.

**Invariant.** 1, 5(b).

**Proposed fix.** A pause is an end date, not a retro-delete. Stamp `recurringEndDate = todayLocal()` (or a dedicated `pausedOn`) and leave `status` alone; resuming clears it. The three `status === "cancelled"` short-circuits then disappear, because `recurringOccurrences` already honours `recurringEndDate` exactly (verified: a charge **on** the end date is included; a rule whose end date has passed yields `[]`).

**Pinned by.** `F2`, `F2b`.

### F6. `cancelled` cancels nothing for a one-off movement
Severity: **high**

**Observed.** A `cancelled` 5 000 € expense, due 2026-10-20:

- Overview Table, October: `{ real: 0, estimated: 5000 }` → the cell, the rollup, "Total Expenses" Plán and the net row all carry −5 000 €.
- Trend: `expenseProjected += 5000` → **the projected cumulative bank balance is 5 000 € lower for that week and every week after it**.
- Ledger: counted at 5 000 € into October's `totalExpense`, i.e. as settled money (F4).
- `ProjectDetailsView` / `ClientsView`: counted into planned totals, and into real totals too if `amountReal > 0`.
- Forecast overlay: **excluded** ([`futureMovements.ts:102-103`](../../src/utils/futureMovements.ts)).

Cancelling an expense therefore changes exactly one thing in the whole app: it disappears from the forecast overlay. Meanwhile the *same status* on a *recurring* record is an explicit stop in four places. One status, two opposite meanings, decided by `isRecurring`.

**Root cause.** [`financialOverviewTable.ts:87`](../../src/utils/financialOverviewTable.ts) — the fallthrough lumps `cancelled` in with `planned`/`pending`/`overdue`. The doc comment at `:75` says this is deliberate, so it is a decision to revisit, not an oversight — but it contradicts the recurring branch 68 lines below it in the same file.

**Proposed fix.** `splitRecordAmounts()` returns `{ real: 0, estimated: 0 }` for `cancelled`, making the one-off case agree with the recurring case. **Caveat:** the movement must then stay visible in the ledger as a zero-valued, struck-through row, or it violates invariant 1.

**Pinned by.** `F6`.

---

## Root cause E — the secondary forms rebuild a record from a literal instead of merging

`ProjectDetailsView.tsx:565-589` and `ClientsView.tsx:1430-1453` construct a whole `FinancialRecord` from scratch on save. Every field the form does not render is destroyed. `ClientsView` was **not** in the prompt's list of writers.

### F15. Editing a recurring rule from the project or client tab destroys the rule
Severity: **blocker**

**Observed.** `projectFinancials` (`ProjectDetailsView.tsx:427-429`) filters on `projectId` **only** — no `isRecurring` exclusion — so a project-scoped recurring rule is listed there with an edit pencil (`:3457`). Changing one character of the title rewrites it with `isRecurring: false` and **no** `recurringFrequency` / `recurringConfig` / `recurringStartDate` / `recurringEndDate` / `recurringAmountHistory` key at all. `sync.php:3843-3852` then binds NULL for every one and `is_recurring = 0`. The rule is gone from the database, not just from state: a 420 €/month commitment stops charging in every column of the table and every week of the trend, with no undo.

**Proposed fix.** One shared `mergeFinancialRecord(existing, formValues)` helper in `src/utils/` that starts from `{...existing}` and overwrites only the keys the form owns. As an immediate guard, make the edit pencil open read-only when `record.isRecurring`.

**Pinned by.** `F15`.

### F16. The client billing tab rewrites any record it can reach as an income invoice with no project
Severity: **blocker**

**Observed.** `clientInvoices` (`ClientsView.tsx:1383-1388`) selects **every** record whose `clientId` matches — no filter on `type`, `subtype`, `projectId` or `isRecurring`. The finance form sets `clientId` on project-scoped records too (`:2673`, derived from the project's client). So a project **expense** of 3 800 € appears in "Invoices & Billing" with an edit pencil (`:4530`). Saving writes `type: "income"` (`:1432`), `subtype: "invoice"` (`:1433`), `projectId: null` (`:1447`).

Net effect on the Overview Table: expenses −3 800, incomes +3 800 — a **7 600 € swing** in the net row from an edit that looked like a typo fix. The project's revenue analysis loses the cost entirely.

**Proposed fix.** Narrow the selector to `r.type === "income" && !r.projectId` so the tab lists only what its form can faithfully represent, and take `type`/`projectId` from `clientInvEditing` instead of hardcoding.

**Pinned by.** `F16`.

### F19. Five more fields the secondary writers clobber, and a paid date rewritten to today
Severity: **high**

- **`paidDate` rewritten.** `paidDate: finFormStatus === "paid" ? todayLocal() : null` (`ProjectDetailsView.tsx:579`, `ClientsView.tsx:1444`). Editing an already-paid record rewrites its paid date to **today** — and neither form has a paid-date input, so it cannot be typed back. Under root cause C the record then jumps months in two of the three tabs. Switching to `pending` **nulls** it. Contrast the two correct writers: `:2666` (`formPaidDate || todayLocal()` — only defaults when empty) and `:2780` (`record.paidDate || todayLocal()` — preserves).
- **Status options missing.** Both selects offer only planned/pending/paid/overdue (`ProjectDetailsView.tsx:3606-3611`, `ClientsView.tsx:4649-4652`); the enum has six. A `partially_paid` record edited there renders a `<select>` matching no option, and a `cancelled` (paused) rule un-paused this way starts charging again.
- **`createdBy`** replaced with the current user (`:586` / `:1451`) — audit trail lost. **`paymentMethod`** forced to `"bank_transfer"`. **`taxRate`** forced to `20`. **`subtype`** forced. **`attachments`** omitted entirely → `sync.php:3854` binds NULL (latent: no UI populates it yet).
- **`categoryPath` built three ways** — full breadcrumb in the finance form (`:2609-2624`), `cat.name` only in both secondary forms, a hardcoded literal in the quick-seed. It is read at `ProjectDetailsView.tsx:465` and `:3442`, so the same category shows two different names in one list.

**Proposed fix.** The same `mergeFinancialRecord` helper closes F15, F16 and F19 at once — every one of them is the same mistake. Export one `FINANCIAL_STATUS_OPTIONS` list for all three forms. Stop persisting `categoryPath`; derive it at render time.

**Pinned by.** Partially — `F15` and `F16` pin the shape; the field-by-field clobbering is component-level.

---

## Root cause F — the forecast overlay's claim is all-or-nothing

### F5. Turning on "Future movements" deletes already-received money from the ledger
Severity: **blocker**

**Observed.** A `partially_paid` income, planned 9 200 €, **4 000 € already received**, issued 01.09, due 15.10, forecast horizon 1 month (window 2026-09-18 … 2026-10-17):

| Toggle | September group | `movementsSummary` |
|---|---|---|
| **off** | `totalIncome = 4000` | `{ income: 4000, count: 1 }` |
| **on** | *group gone* | `{ income: 0, net: 0, count: 0, expectedIncome: 5200 }` |

The 4 000 € that is actually in the bank is in **no figure on the page**. The Overview Table and the trend both still show it, so three views give 0, 4 000 and 4 000 for one record.

**Root cause.** [`futureMovements.ts:170-176`](../../src/utils/futureMovements.ts) — `claimedRecordIds()` claims the **whole record** for any non-recurring forecast row, while the row it substitutes carries only `splitRecordAmounts(rec).estimated` (`:145`). `FinancialManagementView.tsx:1256` then drops the record entirely. `isOpen()` (`:102-103`) admits `partially_paid`, so every partially paid invoice with a due date in the window loses its paid part.

**Invariant.** 1, 2, 8.

**Proposed fix.** Claim only records with nothing settled (`splitRecordAmounts(rec).real === 0`); otherwise keep the record row on its settled date and let the forecast row carry only the outstanding part. Once the ledger carries a real/estimated split (F4) the claim stops mattering at all.

**Pinned by.** `F5`.

### F22. A recurring rule is one ledger row *and* a set of forecast rows at the same time
Severity: **high**

**Observed.** For eight rules, the ledger's 2026 month groups total **expense 3 470 € / income 2 000 €** while the Overview Table for the same rules and year says **expense 24 380 € / income 22 000 €** — the ledger draws one row per *rule*, filed by `paidDate || issueDate`, counted once as settled money; the table draws one row per *charge*. A 20 910 € hole with no explanation on screen.

Compounding it: `claimedRecordIds` deliberately does **not** claim recurring rules ([`futureMovements.ts:170-176`](../../src/utils/futureMovements.ts)), so the rule row stays *and* every future charge is drawn as an extra forecast row. A rule seeded by `handleQuickSeedRecurringExpenses` (`:1659-1755`, `issueDate = todayLocal()`, `amountReal = amountPlanned = 1250`, `status: "planned"`) shows **1 250 € "settled" in September plus 1 250 € "expected" on 1 October for the same first charge** — and nothing has been paid at all.

**Proposed fix.** Decide once what a rule *is* in the ledger. Recommended: the rule row is a **definition, not a transaction** — draw it so it can be edited and searched, but exclude it from the month totals and from `movementsSummary`, and let the expansion rows carry all the money. Either way it must not be both a settled amount and a set of expected amounts.

**Pinned by.** Not yet — needs a Playwright spec comparing the ledger total against `aggregateOverviewTable` for the same range.

---

## Root cause G — filters hide rows without hiding the totals above them

### F13. The "Last Month" preset shows *this* month on the 29th–31st
Severity: medium

**Observed**, the verbatim preset code against a frozen today:

| today | this_month | last_month |
|---|---|---|
| 2026-03-29 / 30 / 31 | 2026-03 | **2026-03** |
| 2026-05-31 | 2026-05 | **2026-05** |
| 2026-07-31 | 2026-07 | **2026-07** |
| 2026-10-31 | 2026-10 | **2026-10** |
| 2026-12-31 | 2026-12 | **2026-12** |
| 2026-09-17 | 2026-09 | 2026-08 ✓ |

`FinancialManagementView.tsx:1075-1078` — `d.setMonth(d.getMonth() - 1)` on today's day-of-month. On 31 March, `setMonth(1)` is "31 February", which JS normalises to 3 March. Roughly 7 days a year the whole previous month is silently hidden and the current month shown in its place, under a chip that reads "Minulý mesiac".

**Proposed fix.** `new Date(now.getFullYear(), now.getMonth() - 1, 1)` — anchor on day 1 so the rollover is exact. One `monthRange(year, monthIndex)` helper for both presets.

**Pinned by.** `F13`.

### F18. A search hides rows but not the totals underneath them
Severity: medium

**Observed.** Overview Table: `renderCategoryMatrixRow` returns `null` for non-matching roots (`:2375-2381`) and the Uncategorized row hides itself the same way (`:2475-2477`), but the Total/net rows read `overviewTableData.totalExpensesByCol` (`:4693-4703`), computed over **all** records. The user sees three rows totalling 2 400 € above a "Total Expenses" of 18 900 €.

Same shape in the Recurring tab: `filteredRecurringRecords` (`:1567-1601`) filters the list while `recurringMetrics` (`:1604-1620`) re-reads the unfiltered `financialRecords`, so the KPI cards ignore every filter above them.

Smaller edge: a search matching only a level-3 name shows the collapsed level-1 row but does not auto-expand it, so the match itself is never displayed.

**Proposed fix.** Pick one semantic for both tabs. Recommended: the search is a *find*, not a filter — keep the totals unfiltered, label the total row "of all categories" while a search is active, and auto-expand ancestors of a match.

**Pinned by.** Not yet — component-level rendering.

### F23. Smaller filter defects
Severity: low

- **URL-seeded filters land in a collapsed drawer.** `movementsCategoryId`/`Scope`/`ProjectId`/`ClientId` are initialised from the hash (`:997-1000`) while `isMovementsAdvancedOpen` defaults to `false` (`:1008`) and all four controls live inside it. A bookmarked `#financial/movements?category=…` hides records with the control off-screen. No in-app link produces such a URL today.
- **Dead parameter.** `parseFinancialUrlState` returns `time: params.get("time") || "this_month"` (`:839`), never read — a date filter defaulting to the current month, one wiring change from hiding every record outside it.
- **Scope overlaps.** `handleSaveTransaction` (`:2676`) derives `clientId` from the project, so a project record carries both ids; scope "Client" (`:1125-1127`, `!rec.clientId`) therefore lists project records too. Nothing is lost, but project + client + global does not partition the ledger. Fix: derive `projectId ? "project" : clientId ? "client" : "global"` once and filter on that.

---

## Root cause H — aggregation robustness

### F12. Negative amounts are clamped by the table and counted raw by the ledger
Severity: **high**

A refund booked as a negative expense (`amountPlanned = amountReal = −500`, paid): `splitRecordAmounts` returns `{ real: 0, estimated: 0 }` and `addDirect` drops it before it can create a row ([`financialOverviewTable.ts:80-81`, `:138`](../../src/utils/financialOverviewTable.ts)); the ledger computes **−500** and subtracts it. Table 0, ledger −500.

**Proposed fix.** Decide once whether a negative amount is legal. If it is (refunds, corrections), remove the clamps so the table can show a negative cell; if it is not, reject it in the form and normalise on sync. It must not be legal in one projection and illegal in another.

**Pinned by.** `F12`.

### F26. Everything outside the table's horizon is dropped with no trace
Severity: low (behaviour is intended; the absent indicator is the defect)

A movement matching no column contributes nothing (`:150-151`). In **week** granularity the columns come from `weeklyTrendData` (`:2271-2282`) — 4 past weeks + current + horizon — so most of the year's history is simply not in the table, under a header that reads "Total / Horizon". Nothing on screen says how many movements fell outside.

**Proposed fix.** Return `outsideHorizon: {count, expense, income}` from the same loop and show "N movements outside this period" next to the granularity switch.

### F24. "Quick seed recurring overheads" can file an expense under an income category
Severity: low

`:1653-1656` resolves four category ids by name — `financialCategories.find(c => c.name.includes("Office"))` — with no `c.type === "expense"` filter, while every seeded record is an expense. An income category named "Office services" wins the match. The Uncategorized row catches them, so nothing is lost, but they are filed nowhere the user expects, and the hardcoded `categoryPath` displays a breadcrumb that does not exist.

---

## Root cause I — sync hardening

### F21. The finance block binds raw client strings and raw dates into narrow columns
Severity: medium (latent — no reachable UI path today)

Every field the UI can edit **round-trips identically** (see the verified list). The gaps are hardening:

- The whole POST runs in one transaction (`sync.php:2036` → `:4044`); any throw rolls back everything and returns a generic failure. PDO is in `ERRMODE_EXCEPTION` and MySQL 8 defaults to `STRICT_TRANS_TABLES`.
- `title` → `VARCHAR(255)`, `category_path` → `VARCHAR(255)`, `financial_categories.name` → `VARCHAR(150)`, `client_id` → `VARCHAR(50)` are all bound raw, with **no `ccrm_sanitize_db_text()` clamp** and **no `maxLength` on any input** in 6 700 lines of `FinancialManagementView.tsx`. `ClientsView.tsx:1428` binds `activeClient.name` into `client_id` — a *name* in an *id* column.
- The five DATE columns are bound raw (`:3836-3842`). `ccrm_date_only()` exists at `sync.php:165-173` with a comment describing exactly this failure ("rolls back the entire sync transaction, so every later push fails too") — it is used only for `leads.created_at`, never for finance.
- **2-dp re-rounding.** `amount_planned`/`amount_real` are `DECIMAL(15,2)`; the three forms bind `Number(x) || 0` with no rounding and the input has no `step`. `33.333` displays until the next full pull, then becomes `33.33`. `handleConfirmStatusAmount` already rounds correctly (`:2769`); the three forms do not.

**Proposed fix.** Wrap the five DATE binds in `ccrm_date_only()` and the four narrow text binds in `ccrm_sanitize_db_text()`, exactly as the `timeline_events` block does. Round to 2 dp at the three form boundaries. Add `maxLength` to the title and category-name inputs.

### F25. `dist/sync.php` is stale — checked, and **not** a production risk
Severity: informational

Root `sync.php` and `public/sync.php` are byte-identical (`md5 be26fa93…`); `dist/sync.php` differs (`e713724f…`) and has **no `recurring_amount_history_json`** at all. Serving it would re-price every past charge of every recurring rule at the current amount — a straight regression of `f51dd37`.

It cannot be served: `dist/sync.php` is gitignored and untracked, `php ccrm update` re-copies `public/` → `dist/` **before** publishing (`ccrm:446-455`, with a comment naming this file), and `vite build` does the same. It is local build residue.

**Worth passing on separately:** the committed bundle is `1.9.56-Jackfruit` while `version.ts` says `1.9.63`, and `grep recurringAmountHistory dist/assets/*.js` returns zero hits — the amount-history work has no built bundle yet. Expected mid-workflow, but until that build commit lands a deploy ships the new `sync.php` with a frontend that never sends the field.

---

## Checked and found CORRECT — do not re-audit

**Aggregation and totals**
1. Totals add up for well-formed data: sum of level-1 rows + Uncategorized == `totalExpensesByCol` in every column, and `sum(rowTotals) == totalExpenseSummary`, verified on an 8-record awkward set.
2. `netSummary` is the column-wise sum and equals `totalIncomeSummary − totalExpenseSummary`.
3. Trend identities hold in every bucket: `totalIncome === incomeReal + incomePlanned + incomeProjected`, and `cumulativeBalance[i] − cumulativeBalance[i−1] === netDifference[i]` in both directions from the anchor. The multi-anchor branch is a correct piecewise running sum.
4. `sum(month-group totals) == movementsSummary`, with the overlay off and on — it is derived from the groups by construction.
5. Period boundaries are inclusive and correct at every granularity; a record on the last day of a month/quarter/half/year lands in that column. The hand-built `-31` end dates (incl. `this_quarter`) are safe because the comparison is a string compare — but only while dates stay bare `YYYY-MM-DD` (see F11).
6. `splitRecordAmounts()` is internally sound for `paid` and `partially_paid`, including `paid` with `amountReal = 0` → real = planned, and a partial with no plan → no negative remainder. Only the `cancelled` case is disputed (F6).
7. No `NaN`, crash or coercion bug is reachable from `amountReal`/`amountPlanned` being `0`, `null` or `undefined` at any of the 19 money sites.
8. The infinite-scroll slice truncates rendered rows only; totals are computed over the full set.

**Recurring**
9. Occurrence boundaries are all correct: a charge exactly **on** the start date and exactly **on** the end date is included; an end date in the past yields `[]`; no end date runs to the window edge.
10. Month-end handling is correct — a monthly rule on day 31 charges on the last day of every short month; a yearly "31 February" clamps to the 28th. `clampDay` defends against 0, NaN and >31.
11. Every frequency is handled by every consumer (the type is `weekly|monthly|yearly` only — there is no `quarterly` to skip), because all four consumers route through `recurringOccurrences`.
12. `recurringAmountHistory` is honoured identically in all three **projections** (table, trend, forecast) — commit `f51dd37` did land there. What it did not reach is the Recurring tab's KPIs and the ledger row (F17).
13. `recurringAmountsAt` picks the tightest covering `until` and is order-independent. `recurringAmountHistoryAfterChange` behaves as documented in every edge case.
14. The **next-charge date** agrees across the Recurring tab, the trend week, the forecast row and the table column. They disagree only on classification (F17).
15. No timezone bug: `recurringExpenses.ts` works entirely in UTC-constructed ISO strings; the trend and table stringify with a local `toYMD`; `todayLocal()` offsets before `toISOString`.
16. `handleDuplicateRecurring` correctly clears `recurringAmountHistory` on the copy.

**Categories, forms, filters**
17. A `parentId` pointing at a **deleted** category is handled consistently everywhere — the orphan is promoted to a root by `effectiveParentId` and the Categories tab, the table rows and `rootsOf` all agree.
18. A wrong stored `level` does not misplace a row or move money — every walker uses the parent chain, not `level`. (`level` only affects picker indentation and the depth guards.)
19. `handleDeleteCategory` is correct: it deletes the whole subtree **and** rewrites affected records to `categoryId: null, categoryPath: null` with a fresh `updatedAt`, so they show as Uncategorized in every tab — and the change survives a sync, in either push order.
20. `switchFormType` clears `formCategoryId` when the type toggle flips, and `SearchableCategorySelect` receives `filterType`, so the main form can no longer save an income under an expense category.
21. Every read path derives the side of the ledger from `record.type`, not from the category. `overviewRowIdFor` correctly routes a record with a cross-type *category* to the Uncategorized row of its own type (verified numerically).
22. `resolveCategoryDrop` refuses a drop across income/expense, onto itself, or into its own subtree; the drag-and-drop `sortOrder`/`level`/`icon` bookkeeping is sound.
23. Every filter defaults to a neutral value, so nothing is hidden on a plain first load. No filter state leaks across tabs. `clearAllMovementsFilters` resets exactly the eleven variables `hasActiveMovementsFilters` tests.
24. `movementMatchesFilters` is deliberately shared between real rows and forecast rows, so a filter cannot hide a movement from one and not the other.
25. The forecast overlay's own arithmetic is right — it carries `estimated` only, never a settled amount, and `futureTotals` is kept out of `movementsSummary.income/expense`. The bug is the claim (F5), not the maths.

**Sync**
26. `is_recurring` round-trips as a real boolean (`!empty() ? 1 : 0` in, `(int)(…) === 1` out). No `"0"` truthiness bug — the field the prompt worried about most is clean.
27. `category_id` NULL round-trips as `null`, never `""` — both client representations converge on SQL NULL via `!empty()`.
28. Amounts come back as JS **numbers**, not DECIMAL strings, because of the explicit `(float)` cast on read. No concatenation bug is reachable, including in the two unguarded reducers.
29. All five date fields are MySQL `DATE`, not `DATETIME`, and return bare `YYYY-MM-DD`. A `2026-01-31T10:00` cannot fall out of January because no such value exists in the column.
30. `recurring_config_json` and `recurring_amount_history_json` are single-encoded, not double; empty/null handling is symmetric and invalid JSON degrades to `null`, which both consumers tolerate.
31. All eight `financial_categories` fields round-trip identically, including the deliberate `color: null` for inheriting children and integer `sortOrder`.
32. Every column in both INSERT lists is also in its `ON DUPLICATE KEY UPDATE` clause, re-verified after the `recurring_amount_history_json` migration.
33. Record and category deletions propagate correctly, and the mass-delete circuit breaker does not interfere with a v2 client at any tree size.
34. `InvoicingView.tsx` does **not** write `financialRecords` — no cross-link. `setFinancialCategories` has exactly one calling component.
35. The delta baseline cannot enter a re-push loop on finance data, despite `createdAt`/`updatedAt` changing format across the round trip.
36. `FinancialManagementView`'s own inline status editor is the **correct model** for the other writers: it merges rather than replaces, preserves an existing `paidDate`, rounds to 2 dp, and maintains `recurringAmountHistory`.

---

## The single highest-value fix

Four of the six blockers are one mistake each, in one line:

| Fix | Closes |
|---|---|
| `effectiveParentId` rejects a cross-type or cycling parent | F1, F9 |
| `mergeFinancialRecord(existing, formValues)` used by all three forms | F15, F16, F19 |
| Pause writes `recurringEndDate` instead of `status = cancelled` | F2 |
| `claimedRecordIds` claims only records with nothing settled | F5 |
| The ledger reads `splitRecordAmounts()` | F4, F12, F22 |

Root causes B and C (one "Real" rule, one date rule) are **not** one-line fixes and need an owner decision before any code changes — that is why this audit does not make them.

---

## Addendum — items from the 1.9.63 fix session, cross-referenced

The session that shipped 1.9.63 (`c7095bf`) left five things unfixed on
purpose. Four of them are already findings above; one is a product gap this
audit's invariants do not reach, recorded here so it is not lost.

| Left unfixed in 1.9.63 | Where it lives now |
|---|---|
| The three tabs date a movement differently (issue date first in the table, paid date first in the trend and the ledger) | **F3** (root cause C) |
| A `cancelled` one-off movement is still counted as planned money in every tab | **F6** (root cause D) |
| A recurring rule is counted once in the ledger totals but once per charge in the table and the trend | **F22** (root cause F) |
| The project finance tab rewrites a paid record's `paidDate` to today on every edit | **F19** (root cause E) |
| Invoices from the Invoicing module never reach any finance tab | **F27**, below |

### F27. An invoice issued in the Invoicing module is in no finance tab at all
Severity: medium (product gap, not a wrong number — nothing is double-counted or lost from `financialRecords`; the money simply is not there)
Observed: `invoicesOffers` is its own collection in `App.tsx` and is never passed to `FinancialManagementView`. An invoice issued there with a due date next month is absent from the ledger, the overview table, the trend and the forecast overlay, so next month's expected income is understated by every open Invoicing invoice.
Root cause: there is no bridge between `invoicesOffers` and `financialRecords`; item 34 above confirms `InvoicingView.tsx` writes neither. Raised by the session that built the forecast overlay (1.9.64).
Also affects: any dashboard, project or client panel that sums `financialRecords` for "expected income".
Invariant: none of 1–10 (they are scoped to `financialRecords`); this is a scope decision.
Proposed fix: an owner decision first. Either (a) issuing an invoice creates a linked `pending` income movement (and paying it settles that movement), or (b) the finance tabs read `invoicesOffers` as a second source alongside `financialRecords`. (a) keeps one ledger and is the smaller change; it must guard against double entry when a user already records the same invoice by hand.
Pinned by: `src/utils/invoiceFinanceBridge.test.ts`.
**Fixed (option a).** `reconcileInvoiceMovements` (`src/utils/invoiceFinanceBridge.ts`), called from `updateInvoicesOffersAndSync` in `App.tsx`, gives every live invoice (type `invoice`, not cancelled or rejected) one linked `pending` income movement with id `fr-inv-<invoiceId>`. The invoice owns the title, number, client, amount and dates. The ledger owns settlement: status once paid, `amountReal`, `paidDate`, category and project. Invoicing has no "paid" status, so an invoice is settled by marking its movement paid in the finance tabs. A cancelled, rejected, deleted or re-typed invoice removes its movement unless money was already recorded against it. Double-entry guard: no linked movement is created when an unlinked income movement already carries the same invoice number. Only invoices that change are reconciled, so older invoices are not backfilled as outstanding income.

### Note on F2 versus the 1.9.63 change
1.9.63 introduced the `status === "cancelled"` short-circuit that F2 describes as retroactive. Before it, a paused rule kept charging every month in the table and the trend while the Recurring tab's totals excluded it, which was the worse inconsistency; F2's fix (pause = end date) is the right next step and supersedes the short-circuit.
