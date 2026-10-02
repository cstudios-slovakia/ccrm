# Task: Project Value block — "still to be paid", Edit remaining, status badges

You are working in the CCRM repo (React + TypeScript + Vite, PHP backend). Before
writing code, read `CLAUDE.md`, `docs/TESTING.md`, every file in `.agents/rules/`,
and `docs/VIEW-SIZE.md`. Follow them. Where this prompt and those rules disagree,
stop and ask.

## Why this change exists

The finance tab of a project (`src/components/ProjectDetailsView.tsx`, block
"Project Value & Invoicable", search for `0A. PROJECT VALUE & INVOICABLE`) shows
a "Remaining" figure and a "Mark remaining as paid" button. An analysis found:

1. "Remaining" is computed as `value − Σ (amountReal || amountPlanned)` over the
   project's income rows, **ignoring status** (`invoicableAnalysis`). As a result:
   - a **cancelled** invoice counts as invoiced, so its amount disappears;
   - a **partially paid** invoice counts only its paid part, so its unpaid rest is
     shown as "remaining" again. "Mark remaining as paid" then books that rest a
     second time, and Finance expects it twice;
   - "Remaining" means "not invoiced yet", so a project with an unpaid invoice
     shows "Remaining 0" while the client still owes money. The owner wants to
     see, and edit, **how much is still to be paid to us**.
2. Finance (overview table, trend, movements, forecast) only reads
   `financialRecords`. It never reads the project value. The block reaches
   Finance only through rows it writes, so every row it writes must be exact.
3. The same "project value / invoiced" calculation is copied, with different
   rules, into `ProjectsView.tsx` (`getProjectFinancials`), `Dashboard.tsx` and
   `DynamicDashboardView.tsx`. The dashboards even fall back to `project.budget`
   (a **cost** ceiling) as the project's value.
4. The project's invoice table shows every status other than paid/overdue as
   "Pending" (cancelled included). The expense table shows everything other
   than paid as "Planned".

## Decisions already made by the owner. Do not change them.

- A payment entered in the block is **always recorded as a separate income row**.
  It never changes, settles or re-statuses existing invoices.
- Because of that, a separate payment row may only cover the part of the value
  that is **not invoiced yet**. Money for an open invoice is recorded by marking
  that invoice paid in the invoice table (existing edit button). This rule is
  what stops the double counting. Do not relax it.
- The project value never falls back to `project.budget`.

## Part A: one shared helper, using Finance's own rules

Create `src/utils/projectBilling.ts` and `src/utils/projectBilling.test.ts`.
Runtime imports inside `src/utils` use the `.ts` extension (see
`financialOverviewTable.ts`), so `node --test` can load them.

```ts
/** The contract value of a project, and the currency it is in. */
export function resolveProjectValue(
  project: Pick<Project, "value" | "data" | "leadId">,
  projectType: ProjectType | undefined,
  lead: Pick<Lead, "value"> | undefined,
  defaultCurrency: string,
): { value: number; currency: string };
```

Resolution order (first one that yields a positive number wins):
1. `project.value`
2. the **sum** of every `money` attribute of the project type found in
   `project.data` (use `parseMoneyValue` / `isMoneyValueEmpty` from
   `utils/currency.ts`); currency = the first attribute that carries one
3. `project.data._projectValue ?? project.data.value`
4. `lead.value`
5. otherwise `0`. **Never** `project.budget`.

Currency is `defaultCurrency` unless step 2 supplied one.

```ts
export interface ProjectBilling {
  value: number;         // contract value
  received: number;      // money that has actually come in
  invoicedOpen: number;  // invoiced (or planned) but not received yet
  invoiced: number;      // received + invoicedOpen. Cancelled rows are excluded
  notInvoiced: number;   // max(0, value − invoiced)
  stillToBePaid: number; // invoicedOpen + notInvoiced
  overInvoiced: number;  // max(0, invoiced − value), only when value > 0
}

export function projectBilling(
  value: number,
  records: FinancialRecord[],
  projectId: string,
): ProjectBilling;
```

- Consider only `records` with `projectId === projectId && type === "income"`.
- For each row use `splitRecordAmounts` from `utils/financialOverviewTable.ts`:
  `received += real`, `invoicedOpen += estimated`. That function already returns
  0/0 for `cancelled`, and splits `partially_paid` into paid + rest. Do not
  re-implement those rules.
- A recurring income rule counts as one row, as today. Say so in a comment.
- Round every output to cents (`Math.round(x * 100) / 100`).

Unit tests (value 10 000 unless stated). Each must assert every field:

| Case | Rows | Expected |
|---|---|---|
| S1 | invoice 9 200 `partially_paid`, `amountReal` 4 000 | received 4 000, open 5 200, invoiced 9 200, notInvoiced 800, still 6 000 |
| S2 | invoice 3 000 `cancelled` | received 0, open 0, invoiced 0, notInvoiced 10 000, still 10 000 |
| S4 | 4 000 `paid` + 6 000 `pending` | received 4 000, open 6 000, notInvoiced 0, still 6 000 |
| Over | 12 000 `pending` | open 12 000, notInvoiced 0, still 12 000, overInvoiced 2 000 |
| Overpaid | 11 000 `paid` | received 11 000, still 0, overInvoiced 1 000 |
| No value | value 0, 5 000 `paid` | still 0, overInvoiced 0 |
| Other project / expense rows | rows with another `projectId`, or `type: "expense"` | ignored |

Also cover `resolveProjectValue`: `project.value` wins; two money attributes are
summed; `_projectValue` fallback; lead fallback; a project with only `budget`
set resolves to **0**.

Finally, add one test that reproduces the old bug: S1 + a payment row for
`notInvoiced`. Then assert with `aggregateOverviewTable` and
`projectFutureMovements` that Finance's total expected income from the project
equals exactly 10 000.

## Part A, continued: the block shows the new numbers

In `ProjectDetailsView.tsx`:
- Replace `projectTotalValue` with `resolveProjectValue(...)` and replace
  `invoicableAnalysis` with `projectBilling(...)`. Keep `handleSaveContractValue`
  writing exactly what it writes today.
- Inside the block, when value > 0:
  - **Bar with three segments:** received (`bg-emerald-500`), invoiced but unpaid
    (`bg-blue-500`), and not invoiced yet (the existing track background).
    When `overInvoiced > 0`, keep the amber warning style.
  - **Legend line:** "Received X · Invoiced, unpaid Y · Not invoiced yet Z".
  - **Main figure:** "Still to be paid to us: S", with an **Edit remaining** button
    beside it (Part B). When S is 0 and nothing is over-invoiced: "Fully paid".
    When over-invoiced, keep the "Invoiced exceeds value by …" message.
- When no value is set, keep the existing empty-state text. The Edit remaining
  button stays hidden.
- Every string goes through `t(en, sk, hu)`, like the surrounding code.
- Match the surrounding markup: raw Tailwind palette classes, plus the type
  classes from `docs/VIEW-SIZE.md` (`text-ui`, `text-caption`, `type-overline`,
  …). Do not introduce new colour tokens.

## Part B: the "Edit remaining" editor

An inline form inside the block, opened by **Edit remaining**. It follows the
pattern of the existing value editor (`contractValueDraft`): Esc and ✕ cancel,
and only one of the two editors is open at a time. It contains:

1. **Mode toggle**, two segmented buttons:
   - *Payment received*. Needs `canEditFinance && setFinancialRecords`.
   - *Price changed*. Needs `canEdit`.

   A mode the user may not use is disabled. Hide the Edit remaining button when
   neither mode is allowed.
2. **"Still to be paid to us"** number input, prefilled with the current
   `stillToBePaid`. It accepts `,` or `.` as the decimal separator, like the
   value editor.
3. **Payment date** (Payment received mode only): `type="date"`, default
   `todayLocal()`, `max` today.
4. **Live explanation line** under the inputs. It describes what Save will do,
   or why Save is disabled.
5. Save / Cancel.

Let `R` be the typed amount and `B` the current `ProjectBilling`.

**Validation (both modes):**
`R < B.invoicedOpen` → disable Save and show: "X is already invoiced and unpaid.
Mark those invoices paid, or cancel them, in the invoice table below."

**Payment received:**
- Payment `P = B.stillToBePaid − R`.
- `P ≤ 0` → disable Save and show: "A payment can only lower the amount. To raise
  it, choose Price changed."
- If `R ≥ B.invoicedOpen` and `P > 0`, then `P ≤ B.notInvoiced` holds
  automatically. Keep an explicit guard anyway.
- On Save, append **one new row** via `setFinancialRecords`, built with
  `mergeFinancialRecord(null, …)` and the same field set `handleMarkValuePaid`
  uses today, except for these fields:
  - `title`: t("Payment received", "Prijatá platba", "Beérkezett befizetés")
  - `amountPlanned` = `amountReal` = `P`, rounded to cents
  - `status: "paid"`, with `issueDate` = `paidDate` = the chosen date
- Never modify any existing row.

**Price changed:**
- On Save, set the new value `V = B.received + R`, rounded to cents, through the
  same code path as `handleSaveContractValue`. Extract that body into a
  `saveProjectValue(amount)` function that both editors call.
- Explanation line: "The project value changes from A to V. Finance is not
  affected."

**The old "Mark remaining as paid" button becomes a shortcut:**
- Show it only when `B.notInvoiced > 0` and Payment received mode is allowed.
- Label:
  - when `received + invoicedOpen === 0`: "Mark whole value as paid (X)"
  - otherwise: t("Mark the uninvoiced rest as paid (X)", "Označiť nevyfakturovaný
    zvyšok ako uhradený (X)", "A nem számlázott maradék kifizetettnek jelölése (X)")

  In both labels, X = `notInvoiced`.
- Clicking it **does not book anything**. It opens the editor in Payment received
  mode with `R = B.invoicedOpen` and today's date, so the user confirms with Save
  and can change the date. This removes the `confirm()` browser dialog.

## Part C: status badges in the project finance tables

In both the invoice table and the expense table of the project finance tab,
render all six `FinancialStatus` values. Use the same labels and colours as the
Finance module: `movementStatusLabel` and `movementStatusBadgeClass` in
`FinancialManagementView.tsx`. Copy them into a small local helper and note
where they come from. **Do not edit `FinancialManagementView.tsx`.**

For cancelled rows, strike through the two amount cells (`line-through
text-slate-400`), because they do not count.

## Part D: move the three other callers onto the helper (all or nothing)

Change these to use `resolveProjectValue` and `projectBilling`, keeping their
existing return shapes:
- `ProjectsView.tsx`, `getProjectFinancials`:
  - `totalBudget` = value
  - `invoiced` = `invoiced`
  - `invoicable` = `notInvoiced`
  - `currency` and `hasValue` as today
- `Dashboard.tsx` and `DynamicDashboardView.tsx`: the per-project loops that
  compute `pVal` / `pInvoiced` / `pInvoicable` (find them by searching for
  `p.budget` and `Number(r.amountReal) || Number(r.amountPlanned)`). Keep their
  `invoicesOffers` fallback branch as it is.

**Concurrency rule.** Another session may have uncommitted work in this tree.
Run `git status` before starting.
- If any of `ProjectsView.tsx`, `Dashboard.tsx` or `DynamicDashboardView.tsx`
  has changes you did not make, **do not touch any of the three**. Finish Parts
  A–C, and list the exact replacements still to do in your report.
- Never stage, commit, revert or reformat a file you did not change.
- Stage only your own files, by explicit path. Never use `git add -A` or
  `git add .`.

## Out of scope. Do not do these.

- Linking Invoicing-module invoices to projects. A bridged invoice still has
  `projectId: null`, so the block cannot see it.
- A Finance "not invoiced yet" tile.
- A category for the payment row: it stays `categoryId: null`.
- VAT net/gross handling.
- The lead-value overwrite in `handleSaveContractValue`.
- Any change to `FinancialManagementView.tsx` or to the files in
  `src/utils/financial*.ts` / `futureMovements.ts`.

## Verification, in this order

1. `npm run test:unit`: all green, including the new tests.
2. `npx tsc --noEmit -p tsconfig.app.json`. The root `tsconfig.json` checks
   nothing on its own. Do **not** run `npm run build` (it rewrites the committed
   `dist/`).
3. Add `tests/e2e/projectValueBlock.spec.ts`, modelled on an existing project
   spec such as `projectAutosave.spec.ts`, with the QA seed and mocks. It must
   cover:
   - S4 data shows "Still to be paid to us 6 000"
   - a cancelled invoice shows the Cancelled badge, and the "not invoiced yet"
     amount includes its 3 000
   - the shortcut opens the editor and Save adds exactly one paid row of
     `notInvoiced`
   - Save is disabled for `R < invoicedOpen`
   - Price changed updates the header value

   Run it with `npm run test:qa:full -- projectValueBlock.spec.ts`.
4. `npm run test:qa`, then read `test-results/qa-audit-report.md`. Never make a
   finding disappear by loosening a check.

## Finishing (test → bump version → changelog → commit)

- Bump `src/utils/version.ts` by one patch from whatever it holds when you
  finish. It was `1.11.139-Lemon` when this prompt was written. If the file has
  uncommitted changes you did not make, stop and ask.
- Add an entry to `1.11-lemon-changelog.md`, with today's date. Cover:
  - the new "still to be paid" breakdown
  - Edit remaining (payment row / price change)
  - the shortcut no longer double-books partially paid invoices
  - cancelled invoices no longer count as invoiced
  - the dashboards no longer use the cost budget as value
  - a project type with several money attributes now shows their sum on the
    project detail, as the list already did
- One commit: `feat(projects): still-to-be-paid breakdown and Edit remaining on
  the project value block (v1.11.X-Lemon)`.

## Report back

- What you changed, file by file.
- Test results: unit, tsc, the new e2e spec, and the QA summary table.
- Whether Part D was done or skipped because of the concurrency rule. If
  skipped, list the remaining replacements.
- Anything in this prompt that turned out to be wrong when you read the code.
