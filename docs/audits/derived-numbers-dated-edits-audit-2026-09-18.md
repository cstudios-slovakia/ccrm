# Derived numbers, history-rewriting edits and missing "effective from" inputs — audit 2026-09-18

Commissioned after the recurring-amount bug of 2026-09-18 (fixed in 1.9.68 and 1.9.75): one
edit, four defects — three tabs pricing one charge by three rules, an edit form with no
"applies from" field so the change silently took effect today, a settled row re-priced, and a
hint promising behaviour the code did not have. This audit looks for the same four shapes in
every module the sidebar exposes.

Method: inventory by search (`todayLocal()` vs `toISOString()`, `amountReal > 0 ?`,
`status === …`, `reduce(`, rate/VAT/due-days fields, every save handler), then every candidate
confirmed against the working copy, pure helpers run under node to get the numbers, and the
app driven on a private port (5299, QA fixture plus two extra records) for screenshots.
Evidence is in `test-results/audit-derived-numbers-2026-09-18/` (untracked). The parallel
reader agents planned for this audit were lost to a session rate limit; the inventory below is
one reader's, so breadth is uneven — see *Modules not fully exercised* at the end.

**Nothing was fixed.** Several findings are a disagreement between two screens where only the
owner can say which one is right.

- **18 findings, 18 pinning tests** in [`src/utils/derivedNumbersDatedEdits.audit.test.ts`](../../src/utils/derivedNumbersDatedEdits.audit.test.ts) — **14 fail by design**, 4 are `skip`ped because they can only be pinned by a Playwright spec (the skip reason names it).
- Run them with `node --test --experimental-strip-types src/utils/derivedNumbersDatedEdits.audit.test.ts`.
- ⚠️ The file is inside the `npm run test:unit` glob, so **the unit suite is now red (14 failures) and `npm run deploy` will refuse to ship** until the findings are addressed or the file is moved. Deliberate, as with the 2026-09-17 audit.

## Summary

| # | Finding | Module | Shape | Severity |
|---|---|---|---|---|
| F7 | Editing an invoice re-prices and re-dates a movement that is already paid | Invoicing → Finance | 2 | **Critical** |
| F1 | "Mark paid" on a recurring rule re-prices the *next* charge, not the one settled | Finance | 1, 2 | **High** |
| F2 | Recurring tab: KPI cards price a weekly rule by the calendar, the row by 52/12 | Finance | 1 | **High** |
| F3 | Two WAP formulas, both weighted against one warehouse for an item-wide price | Warehouse | 1 | **High** |
| F4 | Three definitions of "won" / "open" pipeline between the dashboard widget and the overview | Dashboard, Leads | 1 | **High** |
| F11 | Invoices cannot be dated: no issue-date, due-date or valid-until input | Invoicing | 3 | **High** |
| F5 | "Overdue" is time-aware on the Tasks board, date-only on the dashboard | Tasks, Dashboard | 1 | Medium |
| F6 | "Total invoiced" counts an offer marked invoiced *and* the invoice raised from it | Invoicing | 1 | Medium |
| F8 | The item form lets the WAP be typed over, re-valuing all stock undated | Warehouse | 2 | Medium |
| F9 | Pause overwrites a planned end date; the two "paused" rules disagree on the day of the click | Finance | 2 | Medium |
| F10 | Renaming a lead state orphans its SLA limit and every follow-up tick | Settings, Leads | 2 | Medium |
| F12 | Invoice status changes carry no date | Invoicing | 3 | Medium |
| F13 | Warehouse "Monthly" KPIs sum every movement ever | Warehouse | 3 | Medium |
| F14 | Finance `taxRate` is stored and forced to 20 but has no input and no reader | Finance | 3 | Low |
| F15 | The project/client finance form stamps the UTC day as `paidDate` | Finance | 4 | Low |
| F16 | Batch expiry compares UTC midnight with local midnight | Warehouse | 4 | Low |
| F17 | Task-deadline defaults built from the UTC day in four modules | Tasks, Email, Meetings, Files, Leads | 4 | Low |
| F18 | Warehouse document numbers never restart in a new year and repeat after a gap | Warehouse | 4 | Low |

Shape: 1 = one fact, several derivations · 2 = an edit that rewrites history · 3 = missing input or
misleading text · 4 = edge day.

**Top three by impact.** F7 (a paid invoice can be re-priced underneath its own "paid" status and
moved to another month), F1 (the amount the user just typed as paid is shown in no tab), F3
(the stock valuation KPI is wrong by the WAP error times every unit in every other warehouse).

---

## Root cause A — the same fact re-derived by a second rule

### F1. Settling a recurring charge inline re-prices the next charge instead of the one settled
Severity: **High**

**Observed.** Rent 2 000 €/month on the 1st, active since January. On 18 September the user
opens the inline status editor on the rule's row, picks *paid* and types **2 200** (the amount
actually paid for September). Run through the real helpers:

```
history written      [{ until: "2026-09-17", amountPlanned: 2000, amountReal: 2000 }]
charge on 2026-09-01 → 2 000     (table, trend, forecast, and the rule's own row after 1.9.75)
charge on 2026-10-01 → 2 200
```

The 2 200 € the user just entered appears in **no** September figure. The edit form, opened on
the same rule with the same numbers, defaults *applies from* to the next charge (1 October) and
so prices September the same way — but it lets the user pick 1 September; the inline editor
never asks.

**Root cause.** `FinancialManagementView.tsx:2952` — `recurringAmountHistoryAfterChange(record, {…, amountReal}, todayLocal())`
in `handleConfirmStatusAmount`. The comment above it says "this is a new price, not a
correction of the ones already charged", which is the wrong reading of a *settlement*: marking
the row paid at 2 200 is a statement about the charge being settled, i.e. the last occurrence
on or before today. The form path at `:2783` uses `formAmountAppliesFrom || nextRecurringChargeAfter(…)`,
a second rule for the same field.

**Proposed fix.** One rule: an inline settlement applies from the last occurrence on or before
today (`recurringOccurrences(rule, shiftIsoDate(today, −400), today).at(-1)`), so the settled
charge takes the paid amount and earlier ones keep theirs. If the owner prefers "paid amount is
a new price from now on", the inline editor must say so and offer the date, like the form.

**Pinned by.** `F1`.

### F2. The Recurring tab prices a weekly rule two ways on one screen
Severity: **High**

**Observed** in the UI (QA fixture + one 100 €/Friday rule, screenshot `finance-recurring.png`):

| Where | Text | Implied yearly |
|---|---|---|
| KPI card *Ročný projektovaný náklad* | −82 100 €/rok | 76 800 (wages) + **5 300** (53 Fridays in the 12-month window) |
| KPI card *Mesačné pravidelné výdavky* | −6 841,667 €/mes | 82 100 / 12 |
| The rule's own row | ≈ −433,333 € / mesiac | **5 200** |

By the real helper, the same rule is worth 500 € in May 2026 (five Fridays) and 400 € in
February; 433,33 € is right for no month.

**Root cause.** Cards: `:1747` `recurringTotalInRange(r, rangeStart, rangeEnd)` — calendar.
Row: `:6274-6275` `amount = rec.amountReal > 0 ? rec.amountReal : rec.amountPlanned; monthlyCost = getMonthlyEquivalent(amount, …)`
with `getMonthlyEquivalent` (`:1608-1611`) approximating weekly as 52/12. The row also ignores
`recurringAmountHistory` and reads the raw fields rather than `recurringChargeAmount`. This is
the last remnant of finding F17 of the 2026-09-17 audit, which fixed the cards but not the row.

**Proposed fix.** Delete `getMonthlyEquivalent`; the row shows `recurringTotalInRange(rec, <this month>)`
(or the next 12 months / 12 if a smoothed figure is wanted, labelled as such).

**Pinned by.** `F2`.

### F3. Two weighted-average-price formulas, both weighted against one warehouse
Severity: **High** (stock valuation wrong in money)

**Observed.** 100 pcs @ 10 € in the main warehouse, 50 pcs @ 10 € in the east one, 100 pcs
@ 16 € received into the east one:

```
item-wide WAP              (150·10 + 100·16) / 250 = 12,40
quick purchase (:953)      ( 50·10 + 100·16) / 150 = 14,00
receipt        (:1464)     ( 50·10 + 100·16) / 150 = 14,0000
valuation KPI (:507)       250 pcs × 14,00 = 3 500 €   instead of 3 100 €
```

Receiving the same lot into the main warehouse instead would give 13,00 — the item's price
depends on which door the pallet came through. The two paths also round differently (2 dp vs
4 dp), so two receipts of one lot can differ at the fourth decimal.

**Root cause.** `WarehouseView.tsx:953-961` (quick purchase, `currentStock.quantity` of the
selected warehouse) and `:1464-1474` (receipt, `getStockInfoForItem(v.itemId, receiptWarehouseId).onHand`).
`avgPurchasePrice` is a field of `WarehouseItem`, not of `WarehouseStock`, so the weight must be
the item's total on hand. Only one warehouse's stock is read in either path.

**Proposed fix.** One exported `nextWeightedAveragePrice(totalOnHandAllWarehouses, oldAvg, qty, price)`
in `src/utils/`, called from both paths, with one rounding rule. If per-warehouse WAP is the
intent, move the field onto `WarehouseStock` and make the valuation KPI read it per row.

**Pinned by.** `F3`.

### F4. Three definitions of "won" and "open" for one lead register
Severity: **High**

**Observed** in the UI (screenshots `dashboard.png`, `overview.png`, QA fixture with empty stage
groups):

| Screen | Label | Figure | Rule |
|---|---|---|---|
| Dashboard widget | Hodnota pipeline | 26 900 € | `SELECT SUM(value) FROM leads` — every lead |
| Overview | Aktívny pipeline · *4 prebiehajúce obchody* | 26 900 € | stage group ≠ closed |
| Overview | Celkový obrat · *iba uzavreté obchody* | 2 500 € | status literally `"accepted"` |

The accepted lead is counted as *closed revenue* and as an *open deal* on the same screen.
With stage groups configured (`accepted`, `won` = closed) and one archived won lead of 7 000 €:
widget 33 900, overview pipeline 24 400, overview revenue 2 500 (the `won` lead is revenue by
the stage-group rule and revenue in no total).

**Root cause.** `api/dashboard_query.php:246` (no status, stage-group or `archived` filter);
`Dashboard.tsx:373-379` (stage groups); `Dashboard.tsx:346-348, :354-356, :383` (hard-coded
state name `"accepted"`, so renaming the state — F10 — zeroes "revenue", conversion and the
campaign cards). `leadSla.ts:85-88` already defines *closed* from stage groups; nothing reuses it.

**Proposed fix.** Export `isClosedLeadState` / `isWonLeadState` from `leadStates.ts` and use them
in `Dashboard.tsx`; give `pipeline_value` the same `statuses` parameter `leads_by_status`
already takes (`dashboard_query.php:216`) and have the widget send the open states, plus
`archived = 0`.

**Pinned by.** `F4`.

### F5. "Overdue" for a task depends on which screen shows it
Severity: Medium

**Observed.** A task due today at 09:00, viewed at 15:00: overdue on the Tasks board, "on time"
on the dashboard task widget. `deadlineTime` exists precisely for this.

**Root cause.** `TaskDashboardView.tsx:1350-1368` compares `deadline` and `deadlineTime` with the
local clock; `presetWidgets.tsx:478` uses `String(row.deadline).slice(0, 10) < today`.
`projectTasks.ts` already exports `isDoneTaskState` for both; the overdue rule was not lifted with it.

**Proposed fix.** Export `isTaskOverdue(task, nowLocalStamp())` from `projectTasks.ts` and call it
from both.

**Pinned by.** `F5`.

### F6. "Total invoiced" counts a job twice once its offer is marked invoiced
Severity: Medium

**Observed.** Offer CP-2026-001 (1 200 €) set to *Vyfakturovaná*, invoice FA-2026-001 (1 200 €)
issued for it: KPI *total invoiced* = **2 400 €**. There is no conversion action and no link
between the two documents, so this is the normal flow.

**Root cause.** `InvoicingView.tsx:335-337` `filter(o => o.type === "invoice" || o.status === "invoiced")`.

**Proposed fix.** Sum invoices only; count `status === "invoiced"` offers in the win rate, not in money.

**Pinned by.** `F6`.

---

## Root cause B — edits that rewrite settled facts

### F7. Editing an invoice re-prices and re-dates a movement that is already paid
Severity: **Critical**

**Observed** with the real helper. Invoice FA-2026-001, 1 200 € gross, issued 1 August; its
bridged movement is marked paid on 10 August (`amountReal 1200`). The invoice is then edited to
1 500 € and re-issued on 1 September:

```
movement after edit: { status: "paid", amountPlanned: 1500, amountReal: 1200,
                       issueDate: "2026-09-01", paidDate: "2026-08-10" }
```

- The overview table (issue-date basis) moves 1 200 € of *received* income from August to
  September; the ledger and trend keep it in August. Two tabs disagree by 1 200 €.
- The row reads "paid" while 300 € is outstanding; no status, badge or total can show it.
- A re-numbered invoice also rewrites the movement's title, so the ledger loses the number the
  bank statement carries.

**Root cause.** `invoiceFinanceBridge.ts` `invoiceOwnedFields()` is applied unconditionally in
`reconcileInvoiceMovements` (the `differs` branch) — settlement is checked only for *removal*
(`isSettled`), never for *update*. The invoice "owns" amount and dates, but the doc-comment's own
rule ("the ledger owns settlement") is not enforced on the fields settlement depends on.

**Proposed fix.** Owner decision, two defensible options: (a) once a movement is settled, an
invoice edit updates title/number/client only and leaves `amountPlanned`/`issueDate`/`dueDate`
alone, surfacing "invoice differs from its movement" in the ledger; (b) apply the new amount but
demote `paid` to `partially_paid` when `amountReal < amountPlanned` and never move `issueDate`
of a record with `paidDate`. Either way, add the guard next to `isSettled`.

**Pinned by.** `F7`.

### F8. The item form lets the WAP be typed over
Severity: Medium

`WarehouseView.tsx:1144` saves `avgPurchasePrice: Number(itemForm.avgPurchasePrice)` from an
editable field. One keystroke re-values every unit on hand in every warehouse (valuation KPI
`:507`, analytics `:5466`, `:5900`) with no date, no movement and no trace; on create, `:1170`
also copies the typed WAP into `lastPurchasePrice`. Outward movements already snapshot the WAP
into `unitPurchasePrice` at issue time, so past profit is safe — only the balance-sheet figure
rewrites.

**Proposed fix.** Make the field read-only once any stock exists and offer a dated *revaluation*
adjustment movement instead.

**Pinned by.** `F8` (skipped — needs a Playwright spec).

### F9. Pause overwrites a planned end date, and the two "paused" rules disagree on the day of the click
Severity: Medium

**Observed.** A lease with `recurringEndDate = 2026-12-31`. Pause on 18 September → end date
becomes `2026-09-18`; resume → `null`: the lease is now endless. Worse, on the day of the click
`isRecurringPaused` (`:1244`, `endDate < today`) still says *active* while the toggle (`:1596`,
`endDate >= today` = active) will treat the next click as a *resume* — the button reads "pause"
twice and the second press clears the end date.

**Root cause.** `FinancialManagementView.tsx:1592-1606` stores the pause *in* `recurringEndDate`
instead of beside it, and uses `>=` where `:1244` uses `<`.

**Proposed fix.** A dedicated `recurringPausedOn` (or keep the pause in `recurringEndDate` but
remember the planned end in `recurringPlannedEndDate`), and one exported `isRecurringPaused(rule, today)`
used by both the toggle and the badge.

**Pinned by.** `F9`.

### F10. Renaming a lead state orphans its SLA limit and every follow-up tick
Severity: Medium

**Observed.** State *offer sent* with a 5-day SLA, a lead 17 days in it (SLA badge red). Rename
the state to *quote sent*: the lead's status follows, the badge disappears (`evaluateLeadSla`
returns `null`), and every completed follow-up on every lead in that phase is unticked.

**Root cause.** `SettingsView.tsx:705-720` `handleRenameState` migrates `leadStateColors`,
`leadStageGroups`, `leadStateParents` and each lead's `status`, but not `leadStateSla`
(keyed by state name, `:4980-4990`), not `leadStateFollowUp` (`:5008`), and not the
`followUps` map on each lead (keyed by lowercased state, `LeadsDatagrid.tsx:923`, `:5412`).
The finding F4 above is the same hole from the other side: `Dashboard.tsx` keys "won" on the
literal `"accepted"`.

**Proposed fix.** Extend the cascade with `migrateMapKey` for both settings maps and a
`followUps` re-key on every lead; or key all four by a stable state id (`leadSourceIds` already
exists for sources, `:700`).

**Pinned by.** `F10`.

---

## Root cause C — missing inputs and misleading text

### F11. Invoices cannot be dated
Severity: **High**

**Observed.** The five-step wizard (screenshot `invoices-editor.png`) has no date on any step;
`grep -c 'type="date"' InvoicingView.tsx` → 0. Every document is therefore:

| Field | Value | Where |
|---|---|---|
| `issuedAt` | today, at creation | `:173`, `:424` |
| `dueDate` | today + `defaultPaymentDueDays` (14) | `:726` |
| `validUntil` | today + **30**, hard-coded, no setting | `:725` |

On edit `existing?.issuedAt || …` keeps the original, so a document opened tomorrow to fix a typo
keeps today's dates — correct, but there is still no way to issue an invoice for last Friday, and
the PDF prints all three dates (`DefaultOfferTemplate.tsx:154-177`), the finance bridge files the
movement by them (F7), and SuperFaktura/iDoklad receive them. The document number is built from
`new Date().getFullYear()` (`:221`), which will disagree with a back-dated `issuedAt` the moment
a date input exists — fix both together.

**Proposed fix.** An *Issued on* field (defaulting to today) on step 1 with *Due on* / *Valid until*
derived from it and editable; number from the issue year.

**Pinned by.** `F11` (skipped — needs a Playwright spec).

### F12. Invoice status changes carry no date
Severity: Medium

`handleChangeStatus` (`InvoicingView.tsx:895-898`) writes `{ ...o, status }` and nothing else.
*Sent*, *approved*, *invoiced*, *cancelled* have no date, so the win-rate KPI (`:341-344`) cannot
be filtered by period, "invoiced this month" is unanswerable, and the bridge's movement keeps the
creation-time `issueDate` whatever happens. Contrast the finance inline editor, which stamps
`paidDate` on settlement (`:2957`).

**Proposed fix.** `statusChangedAt` (or a small `statusHistory`) written by `handleChangeStatus`.

**Pinned by.** `F12` (skipped — needs a Playwright spec).

### F13. Warehouse "Monthly" KPIs sum every movement ever
Severity: Medium

**Observed** (screenshot `warehouse.png`, QA fixture): *Mesačný výdaj tovaru* 234 € · *Príjem*
2 400 €. The receipt is dated **19 August** (`fixture.ts:535`, −30 days); it is in "this month's"
figure on 18 September and will be next year.

**Root cause.** `WarehouseView.tsx:518-527` iterates `warehouseMovements` with only
`status === "confirmed"`; `monthlyInward`/`monthlyOutward`/`monthlyProfit` never read `issuedAt`.
Label at `:4825` ("Monthly Issues (Sales)").

**Proposed fix.** Filter on `issuedAt.slice(0, 7) === thisMonth` (local), or rename the cards
"All-time".

**Pinned by.** `F13`.

### F14. Finance `taxRate` is stored, forced to 20, and read by nothing
Severity: Low

`formTaxRate` is only ever reset (`FinancialManagementView.tsx:1554`, `:2708`, `:2742`) — there is
no input; the project and client forms force `taxRate = 20` on every new record
(`ProjectDetailsView.tsx:600`, `ClientsView.tsx:1468`); no total, split or export reads it; the
invoice bridge derives a rounded blended rate (`invoiceFinanceBridge.ts` `invoiceOwnedFields`).
Nothing on any finance screen says whether an amount is gross or net, while the bridged invoice
movements are gross. Not wrong today, but it is the field F11/F7 will trip over.

**Proposed fix.** Decide gross-or-net once; either render the rate and use it, or drop the column.

**Pinned by.** `F14` (skipped — product decision).

---

## Root cause D — edge days

### F15. The project/client finance form stamps the UTC day as `paidDate`
Severity: Low (nightly window, but money lands in the wrong month)

**Observed** with the test runner's clock at 00:30 Bratislava (22:30 UTC the day before):

```
derivePaidDate(null, "paid")  → "2026-09-17"      financialRecordMerge.ts:32
todayLocal()                  → "2026-09-18"      every other writer
```

On the first of a month the record is filed under the previous month by the ledger and the
trend (paid-date basis).

**Root cause.** `financialRecordMerge.ts:32` `new Date().toISOString().slice(0, 10)` — introduced by
the 1.9.70 fix for F19 of the previous audit, which copied the *preserve-if-set* rule but not
the local clock. `mergeFinancialRecord` (`:20`) stamps `updatedAt` the same way, harmlessly.

**Proposed fix.** `existing?.paidDate || todayLocal()`.

**Pinned by.** `F15`.

### F16. Batch expiry compares UTC midnight with local midnight
Severity: Low

`WarehouseView.tsx:65-78`: `new Date("2026-09-18")` is UTC 00:00, `today.setHours(0,0,0,0)` is
local 00:00. Observed with the runner's clock: in Bratislava a batch expiring *today* reads
`{ warning, 1 day }`; in Los Angeles a batch expiring *tomorrow* reads `{ expired, 0 }`. The same
UTC habit sets movement `issuedAt` (`:944`, `:1070`, `:1449`, as `toISOString()` wall-clock) and
the goods-issue date default (`:415`, `:1551`) while the rest of the app uses `todayLocal()`.

**Proposed fix.** `isoDaysBetween(todayLocal(), expirationDate)` from `recurringExpenses.ts`;
`nowLocalStamp()` / `todayLocal()` for the three stamps.

**Pinned by.** `F16`.

### F17. Task-deadline defaults built from the UTC day in four modules
Severity: Low

`LeadsDatagrid.tsx:2130-2134` and `:3396-3398` (inline locking task), `EmailView.tsx:331-332`
(task from mail; `:232`, `:363` for `createdAt`), `MeetingRoomView.tsx:516`, `:995`, `:1082`, `:1180`
(tasks from minutes), `FilesView.tsx:264`. Observed at 00:30 local: "+3 days" → `2026-09-20`,
expected `2026-09-21`. The board treats deadlines as local dates (`projectTasks.ts:8` comment),
so the task is overdue a day early.

**Proposed fix.** One `todayLocalPlusDays(n)` next to `todayLocal()`.

**Pinned by.** `F17`.

### F18. Warehouse document numbers never restart and repeat after a gap
Severity: Low

`WarehouseView.tsx:911`, `:1035`, `:1405`, `:1550`, `:1819`: `PREFIX-${new Date().getFullYear()}-${count of that type + 1}`.
Observed: two issues in 2026 → the first of 2027 is `VYD-2027-0003`; issues 0001 and 0003 on
file → the next is `VYD-2026-0003` again. Invoicing had the identical bug and fixed it by scanning
for the highest existing number (`InvoicingView.tsx:216-231`); the warehouse still has the old
shape. No delete exists for movements today, so the duplicate path needs a failed sync or an
import to trigger.

**Proposed fix.** Lift `nextDocumentNumber` into `src/utils/` and use it for both modules, keyed
on the *issue* year.

**Pinned by.** `F18`.

---

## Checked and found CORRECT — do not re-audit

**Finance (regression checks on the 2026-09-17 fixes)**
1. The 1.9.75 flow is intact: the edit form has an *applies from* date (`:3456`), defaults to the
   next charge (`:2783`), refuses dates inside pinned history (`recurringEarliestRepriceDate`), and
   the purple hint names the exact dates and says when nothing is pinned (`:3442-3449`).
2. `recurringAmountHistoryAfterChange` and `recurringPlannedAmountAt` behave as documented on the
   inputs used here; `recurringCharges` is the single expansion used by the table, trend and
   forecast, and the working copy's `recurringOwnRowCharge` adds the rule's own row only when the
   schedule has not yet charged (another session's uncommitted work; not audited further).
3. Pause is now an end date (F2 of the previous audit is fixed) — what remains is F9 above.
4. `ProjectDetailsView` and `ClientsView` now read `splitRecordAmounts` (F20 fixed) and merge via
   `mergeFinancialRecord` (F15/F16/F19 fixed), and `derivePaidDate` preserves an existing paid date.
5. `addDays` in `InvoicingView.tsx:92-97` and `addIsoMonths` in `futureMovements.ts` are month-end safe.
6. Invoice totals are one rule: per-line net after discount rounded to 2 dp (`:284-294`), VAT per
   line on that net, document totals rounded once (`:300-310`); both PDF templates print the stored
   totals rather than recomputing (`DefaultOfferTemplate.tsx:286-310`), and the SuperFaktura/iDoklad
   payloads send unit price, rate and discount per line, so the provider computes the same thing.
   Only the no-items fallback (`superfaktura.php:186-193`, `idoklad.php:257-263`) sends the gross
   total as a net unit price at 20 % — unreachable while the wizard requires at least one item.
7. Changing `defaultVatRate` or `defaultPaymentDueDays` in Settings touches no existing document:
   both are copied at creation (`:261`, `:681`).
8. The bridge's double-entry guard and its "keep a settled movement when the invoice is cancelled
   or deleted" rule both hold on the cases run here.

**Leads, projects, tasks**
9. `evaluateLeadSla` and `evaluateProjectDeadline` both take `today` from the caller, and every
   caller passes `todayLocal()`; `finishedAt` outranks `deadline` in the helper and every list uses
   the helper. Changing an SLA limit or a deadline-warning threshold re-evaluates live with no
   history to rewrite — by design, and the badge text promises nothing else.
10. Every lead status writer in `LeadsDatagrid.tsx` appends a `status_change` timeline event
    (`:2781`, `:3620`), so `leadPhaseEnteredAt` is the true phase entry. New leads are stamped with
    `todayLocal()` (`:3701`, with a comment explaining why).
11. "Done" for a task is one exported rule (`projectTasks.ts:4`, `isDoneTaskState`) used by the
    board, the widgets and the archive.
12. The task-completion stamp is written on completion and cleared on reopen (`TaskDashboardView.tsx:820`).
13. The state-rename cascade *does* migrate colours, stage groups, parents and lead statuses, and
    the source and category renames migrate their id maps.

**Warehouse**
14. Outward movements snapshot the WAP into `unitPurchasePrice` at issue time (`:1037`, `:1696`,
    `:1825`), so a later WAP change does not rewrite past profit.
15. Every movement is created `confirmed` and there is no edit, cancel or delete path, so stock is
    never applied twice or left un-reversed. (That is also why there is no way to correct a
    mistake — a product gap, not a consistency bug.)
16. `getStockInfoForItem` is the single on-hand rule (quantity, reserved, available) for the list,
    the KPIs and the analytics tab.

**Backend**
17. `config.php:5` sets `Europe/Bratislava`, so server-side `date('Y-m-d')` defaults
    (`sync.php:2852`, `:3235`, `:3837`, `:3978`, `pipeline.php:421`) agree with a browser in Slovakia;
    they will disagree with a browser elsewhere, which no current deployment has.
18. `sync.php`, `public/sync.php` and `dist/sync.php` are md5-identical in this working copy.

---

## Modules not fully exercised, and why

The eight reader agents planned for this audit terminated on a session rate limit before
reporting, so the inventory was done by one reader against the largest surfaces first. Coverage
by module:

| Module | Coverage |
|---|---|
| Finance, Invoicing, Warehouse, Dashboard/overview, Leads (SLA, states, value), Tasks (overdue, done) | Inventory and findings above; UI walked on port 5299 |
| Projects | Helpers (`projects.ts`, `projectSort.ts`) read and found consistent; the gantt/timeline rendering (`ProjectDetailsView.tsx:1205-1250`, `:2860-2870`) compares local `Date`s through `toISOString()`, which is safe east of UTC and off by one west of it — not reported because no deployment runs there |
| Clients | Client identity = leads sharing a name (`ClientsView.tsx:918`); category and archive flags are written to every lead of the name (`:563`, `:581`). A design choice with an obvious failure mode (two companies, one name) rather than a derivation bug; not walked |
| Email, Meetings, Social media, Files | Only their date-stamping was searched (F17); unread counts, meeting durations, post scheduling and storage figures were not inventoried |
| Automation, RAG/AI, Settings other than lead states, Unified entry, Updates | Not inventoried |
| PHP backend | Only timezone, date defaults and `dashboard_query.php` were read; `workflows_engine.php` conditions on amounts/dates, `cron.php`, and delete cascades were not |
| Data import / export | Only `SocialMediaView.tsx` references CSV; no lead/finance import path was found in `src/components`, so none was audited. The SuperFaktura client import (`api/superfaktura.php`) was not read |
| Server-side numbers | `npm run test:qa` mocks the backend, and port 5273 was held by another session's live QA run, so nothing here was verified against PHP output |
