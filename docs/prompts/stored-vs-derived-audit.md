# Audit prompt: facts that are calculated on every read but should be saved in the database

Paste everything below the line into a fresh session (Opus recommended). The task is **read-only analysis plus a report**. Do not change application code.

---

## The bug class

A **fact that has already happened** is shown in the app, but it exists nowhere in the database. It is *recomputed on every read* from a rule, a schedule, a template or other rows. Consequences:

- Deleting or editing the rule rewrites or erases history (we found this with recurring finance rules: deleting a rule deleted every payment it had already made).
- The number cannot be edited, annotated, attached to, reported on server-side (SQL, MCP, exports) or audited.
- Two readers can compute different answers (one tab honours a pause, another does not).
- A changed formula silently changes past numbers.

**The rule we want:** anything whose day has *arrived* (it is due, done, happened) is **a stored row**. Only the **future** stays calculated (forecasts, previews, "next 4 payments"). Derived *aggregates* (totals, balances, KPIs) may stay calculated, but only from stored rows, never from a schedule.

The fix we already shipped for recurring finance payments, as a reference pattern (read it first):

- `src/utils/recurringRuleDeletion.ts`: `materializeDueCharges` writes one movement per due charge, with a **deterministic id** (`fr-rec-<ruleId>-<date>`) so two sessions converge on one row; the day is listed in the rule's `recurringSkippedDates` so nothing counts twice; it is idempotent and returns the same array when there is nothing to do.
- `src/App.tsx`: an effect runs it after the first sync, only for sessions that may edit the module, plus a 10-minute timer for an app left open across midnight.
- A user-deleted past payment stays deleted (its day stays skipped).
- Precedent for the id trick: `src/utils/invoiceFinanceBridge.ts` (`fr-inv-<invoiceId>`).

## Read first

`CLAUDE.md`, `entities_overview.md`, `docs/TESTING.md`, `.agents/rules/database-schema-and-sync.md`, `.agents/rules/licensing.md`, `docs/TIME-TRACKING.md`. Then the sync layer: `public/sync.php` (what is persisted, per entity) and `src/utils/syncDiff.ts`.

## Where to look: every entity, not only the ones named here

Start from `entities_overview.md` and go through **every** entity/table. For each, ask the two questions below. Candidates that deserve extra suspicion:

1. **Recurring tasks**: templates (`task_kind = 'recurring'`) vs. generated occurrences. Are past occurrences stored rows, or computed from the template? What happens to history when the template is deleted, edited or paused? (`recurringTaskActions.ts`, `TaskDashboardView.tsx`, `ccrm_sql_real_tasks()`.)
2. **Recurring finance, other readers**: the overview table, trend, forecast (`futureMovements.ts`), `pastRecurringCharges.ts`, `mcp_ext.php` and `sync.php` line ~5940. Do any still derive *past* charges instead of reading stored movements? Is anything now counted twice because both a stored payment and the schedule produce the day?
3. **Employees / salaries / payslips**: is each month's salary, advance or payout a stored row, or computed from contract + rate + hours at read time? (`Vyplatené` vs `Cena práce` in the salary drawer.)
4. **Time tracking**: durations, billable totals, rounded values; stored on the entry or recomputed? Anything "approved" or "invoiced" that is only implied?
5. **Invoices and offers**: totals, VAT breakdown, "overdue" state, payment status, numbering. Stored or computed? Is the invoice → finance movement bridge complete for every state transition, including payments received?
6. **Support contracts / subscriptions / licences**: billing periods, renewals, "next invoice", usage. Are past periods and past renewals rows?
7. **Warehouse**: stock levels vs. movements; batches; reservations; valuation. Is on-hand quantity stored, derived from movements, or both, and can they disagree?
8. **Projects**: budget / cost / margin / progress / status rollups; milestone completion. Does a "completed" or "overdue" state exist only as a calculation over dates?
9. **Clients and leads**: the `adjustment`, lifetime value, balance, `client_id` fallback "by name", conversion lead → client. What is a stored fact and what is re-derived by matching?
10. **Orders, tickets, meetings, email, automation**: SLA breach, "overdue", reminders sent, automation runs. Is "this reminder fired / this automation ran / this SLA was breached" recorded, or recomputed (and therefore re-fired or lost)?
11. **Anything with `*_json` columns**: lists inside a JSON blob that are really rows (history, skipped dates, amount history, attachments).
12. **Audit trail / history**: any "history" the UI shows that is reconstructed from current state instead of logged.

## For each entity, answer

**Q1. Which facts are only calculated?** List each displayed value or row that comes from a function over other data (look for `*Occurrences`, `project*`, `derive*`, `compute*`, `*ForRange`, `useMemo` building row lists, SQL `SUM/COUNT/CASE` in `sync.php`/`api/`, loops generating dates). Name file:line.

**Q2. For each one: has its day already arrived, and would losing the source change what the user sees?** Classify:

| Class | Meaning | Action |
|---|---|---|
| **A: must be stored** | happened/due, user-visible as a row or a number they can act on, history changes if the rule changes | materialize (propose how) |
| **B: fine as derived** | pure aggregate or preview over stored rows; future-only; cheap and always consistent | leave |
| **C: stored AND derived** | both exist; they can disagree or double-count | name the source of truth, remove the other |
| **D: missing audit fact** | an event (sent, fired, approved, paid, breached) that is not recorded at all | add a stored event |

Do not mark something A just because it is computed. The test is: **if the rule, template or formula were deleted or changed tomorrow, would a past number the user relies on change or disappear?** If not, it is B.

## What to check for every class A/C finding

- **Trigger**: what would write it (client effect like `materializeDueCharges`, server-side on request, or a scheduled job)? This app has **no cron** and the production server has no build step; say which the codebase supports and what the cost is. Note who is allowed to write (permissions, `readScope`, demo mode).
- **Idempotency and concurrency**: two browsers, two tabs, the sync poll. Propose a deterministic id or a unique key.
- **Deletion semantics**: if the user deletes the stored row, does it come back? (It must not.)
- **Edit semantics**: what happens to stored rows when the rule or template is later edited?
- **Backfill**: existing data has no stored rows. How many would be created for the oldest realistic rule (weekly rule, years back)? Any cap (e.g. `MAX_OCCURRENCES`)?
- **Schema**: does it need a new column? If so, apply the **4-place rule** from `.agents/rules/database-schema-and-sync.md` (schema.php, migration, pre-transaction healing in `sync.php`, `entities_overview.md`, `npm run sync:backend`).
- **Double counting**: after storing, which readers must stop deriving it? List them.
- **Tests**: which unit test proves it (see `recurringRuleDeletion.test.ts` for the shape: stores once, idempotent, deleted stays deleted, no double count)?

## Method

1. Build the entity list from `entities_overview.md` and `sync.php`. Do not rely on the candidate list above.
2. For each entity, grep for generators and derivations (date loops, `Occurrences`, `derive`, `project`, `compute`, `useMemo` returning rows, SQL aggregates). Read the code, do not guess from names.
3. Verify with data when cheap: the QA suite seeds its own dataset (`docs/TESTING.md`); `node scripts/qa/run-qa.mjs --files <files>` drives the real app, mocks `/sync.php`, and never touches real data. Never test against a real database.
4. Confirm each finding in `src/` or `public/` before reporting. A suspicion is not a finding.
5. Do **not** edit code, do **not** commit, do **not** run `npm run build` (it rewrites the committed `dist/`).

## Report

Write `docs/audits/stored-vs-derived-audit.md`. Start with a summary table, then findings grouped by **root cause**, not by entity (one pattern often hits several entities).

```
| # | Entity | What is only calculated | Class | Severity | Proposed fix | Needs schema? |
```

Each finding:

- **Observed symptom** (what the user sees go wrong, or could)
- **Root cause** (file:line, the function that derives it, and why no stored row exists)
- **Evidence** (the exact steps or data that show it, from the code or from a QA run)
- **Proposed fix** (trigger, id scheme, deletion/edit semantics, backfill, readers to change). Name the reference pattern if it fits.
- **Severity**: *data loss* (history disappears) > *wrong numbers* (disagreeing or double-counted) > *missing capability* (cannot edit or report) > *cosmetic*.

End with:

1. **Order of work**: which findings first, and which can run in parallel.
2. **Not a problem**: entities you checked and why they are class B, so nobody re-audits them.
3. **Open questions** for the product owner: only decisions that are genuinely theirs (e.g. should an unpaid-but-due charge be stored as paid or as open?).

Report as observed symptom → root cause → proposed fix. Never hide a finding by loosening the definition of "must be stored".
