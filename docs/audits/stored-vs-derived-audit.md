# Stored vs derived audit

Date: 2026-11-06. Branch at audit time: `1.13-nectarine`. Read-only analysis; no application code was changed by the audit.
Spec: [`docs/prompts/stored-vs-derived-audit.md`](../prompts/stored-vs-derived-audit.md).

The audit ran as five parallel agents, one per slice. Each part below is that agent's full report (findings, evidence,
proposed fix, "not a problem" list, open questions). Finding numbers are unique within a part; the **Ref** column of the
master table gives the part. Class: **A** must be stored, **B** fine as derived, **C** stored and derived (can disagree),
**D** missing audit fact.

## Master summary table (47 findings)

| Ref | Entity | What is only calculated | Class | Severity | Proposed fix | Needs schema? |
|---|---|---|---|---|---|---|
| P1-1 | tasks (every reader: recurring generator, reminders, sync notifications, ticket auto-resolve, workflows, MCP, UI) | "this task is done" = `status` compared with the **current last entry** of the editable `TASK_STATES` list; ~9 separate implementations, and one helper they call (`ccrm_is_done_task_status`) does not exist | C | wrong numbers (+ missed notifications) | Store which states mean done (`TASK_DONE_STATES`/state roles, like `LEAD_STAGE_GROUPS`), one PHP and one TS helper, every reader uses them; adding a state no longer redefines done | settings key only (no column) |
| P1-2 | workflows / workflow_logs / workflow_queue | Deleting a workflow deletes all of its run history; save, toggle and delete leave no audit row | D (+ data loss) | data loss | Soft-delete the workflow (or keep the logs and snapshot the workflow name in each log row); `ccrm_audit_log` on save/toggle/delete | yes (`workflows.deleted_at` or `workflow_logs.workflow_name`) |
| P1-3 | workflows (timer trigger) | "When did this timer last fire" = `MAX(workflow_logs.created_at)`, which ignores queued/failed runs and runs that threw before logging | C | wrong numbers (duplicate runs) | Record the fire itself: a deterministic slot key on `workflow_queue` (unique `workflow_id`+slot) or `workflows.last_triggered_at`, written when enqueuing | yes (one column + unique key) |
| P1-4 | tasks (recurring, `after_completion` mode) | The next occurrence date is recalculated from the previous completion, so a deleted ("Only this task") occurrence is generated again with the same date | D (the skip is not stored) | wrong numbers (a deleted row comes back) | Honour the template's `lastOccurrence` cursor in after_completion mode, or store skipped dates in `recurrence_json` (same as finance `recurringSkippedDates`) | no (JSON field) |
| P1-5 | meeting_tasks → tasks | The "Created" badge on a meeting suggestion = `!!assignedUser`; no stored link to the task that was created; regenerating the summary wipes the record; two statuses that are never reconciled | C / D | wrong numbers (UI says "Created" when no task exists) | `meeting_tasks.created_task_id`; badge and status read through it; regenerating keeps converted rows | yes (4-place rule: `meeting_tasks` is written by sync.php) |
| P1-6 | tasks (deadline history) | `original_deadline` / `deadline_moves` are updated only by the sync.php upsert; MCP and the WAAI integration move deadlines without counting | D | wrong numbers (low) | One shared SQL fragment for the deadline SET used by every writer | no |
| P1-7 | timeline_events (lead state history) | The status_change history row is written only by the browser; the bulk path writes it with no author, raw state keys, a hard-coded Slovak title, and logs "X → X" for leads already in that state | D (partial) | cosmetic / missing capability | Fix the bulk path to use `buildStatusChangeEvent`; optionally move the write into sync.php where the transition is already detected (one writer only) | no |
| P2-1 | financial_records (recurring rule) | Which past days are "due" is recomputed from the **current** schedule on every materializer run. A schedule edit creates new past days, and these get stored as paid on top of the old ones | C | wrong numbers (doubled history) | Store a per-rule watermark `recurring_materialized_through`. The materializer and every schedule reader draw only after it, so a schedule edit applies from the next charge | yes |
| P2-2 | financial_records (recurring rule) | The pause interval is not recorded. Resume restores the end date, so the paused months come back and get materialized as paid | C | wrong numbers | Same watermark, advanced daily even when nothing is due. Paused days ≤ watermark are never drawn | yes (same column) |
| P2-3 | financial_records (stand-ins) | "This day is stored" lives in two places: the rule's `recurring_skipped_dates_json` and the row's `recurring_source_id` + `recurring_occurrence_date`. The materializer's idempotency checks only its own id pattern | C | wrong numbers (duplicate payment) | Dedupe on the (source, occurrence) pair. Add a UNIQUE KEY on it. Before the first run, rebuild skip lists from the stand-ins | yes (unique key) |
| P2-4 | financial_records read by projects / clients / MCP / AI | A rule's **template row** is counted as a movement next to its now-stored payments | C | wrong numbers | Add one guard, "real movements" = `is_recurring = 0` (like `ccrm_sql_real_tasks()`), plus a guard test | no |
| P2-5 | financial_records (legacy rule own row) | A payment that exists only as the rule's own row (paid before the schedule starts). It is never stored on its own, and deleting the rule deletes it | A | data loss | The materializer also writes `recurringOwnRowCharge` as a movement and skips its day | no |
| P2-6 | financial_records (rule descriptions) | "≈ X / month", the active/paused count, annual totals and the reprice hint all read the schedule, which now has holes where stored payments are | C | wrong numbers / cosmetic | Describe the rule from its cadence (ignoring skips) or from stored + future. `hasChargedBy` reads the watermark / stored rows | no |
| P2-7 | financial_records (server readers) | Materialization is client-only. Until an editor opens the app, MCP, AI and SQL readers derive past charges from the schedule and nothing is stored | A | missing capability | Materialize on the server too, on request, gated to once a day, with `INSERT IGNORE` on deterministic ids | yes (uses #1) |
| P2-8 | invoices_offers ↔ financial_records ↔ orders | "Payment received" is held in up to 4 unlinked places. The bridge copies none of them after creation, and ClientsView skips the paid stamp entirely | C + D | wrong numbers | Ledger movement = source of truth. Bridge order-paid, invoice-won and SuperFaktúra-paid into it. Share one order→invoice helper | no |
| P2-9 | financial_records.status `overdue` | Overdue is a manual stored status in the app, but derived from `due_date < today` in MCP. The two disagree | C | wrong numbers (disagreeing readers) | One derived `paymentState(rec, today)` in TS and PHP. Treat the stored `overdue` as `pending` | no (data migration only) |
| P2-10 | invoices_offers.document_number | The issued-number sequence is derived as max(existing) + 1. Deleting the newest invoice re-issues its number. The order flow uses random numbers. No UNIQUE key | A / D | wrong numbers (legal) | Stored counter per (prefix, year) under GET_LOCK. Add UNIQUE(document_number). Never reuse a number | yes |
| P2-11 | financial_records.category_path | A stored copy of the category breadcrumb that goes stale on rename or move | C | cosmetic (AI summary splits one category) | Derive the label from `category_id` at read. Keep the column only as "filed as", if wanted | no |
| P2-12 | invoices_offers → financial_records | The movement's existence is re-derived from the invoice: a user-deleted unsettled `fr-inv-*` comes back on the next invoice change. MCP cancels by status, the app by deletion | C | cosmetic / missing capability | Respect a user deletion (tombstone or a flag on the invoice). Pick one cancel representation | maybe |
| P3-HR-1 | `employee_salaries` | The payroll month's identity. The profile drawer stores `period_key = "M05"` (no year), and the matrix, MCP, demo and time lock use `"2026-05"`. With `UNIQUE(employee_id, period_key)` this produces duplicate months and overwritten months | C | **data loss** | Always build the key from year and month (`YYYY-MM`). Idempotent data migration rewrites `M\d\d` keys from the `year` column and merges collisions. Orphaned `fr-sal-*` rows get cleaned up | No (data migration only) |
| P3-HR-2 | `employees.salary_amount` → past periods | The contract salary valid in a past month. Readers use today's value: salary-allocation report (loaded salary, rate, utilisation), re-price of a past month, late, imported or moved entries, and the Toggl summary's "Calculated pay" | A | wrong numbers | Report: derive the month's rate from the frozen entry snapshots (no schema). Pricing: an effective-dated salary history that `ccrm_tt_price` reads by `entry_date` | Yes (history table) for pricing; no for the report |
| P3-HR-3 | `employee_salaries` ↔ `time_entries` lock | "Payroll month closed / entries locked". It is re-derived on every request from the live `status = 'paid'` (which a later Cena práce edit can flip back), the current `lockAfterDays`, and a key format that misses `M05` rows | D | wrong numbers (closed months reopen silently) | Record the close: `employee_salaries.closed_at` stamped once when the month first becomes paid, cleared only by an explicit admin "Reopen". The lock reads the stamp | Yes |
| P3-HR-4 | `employee_salaries` payments | Individual payouts. `total_paid` is one cumulative number with one `payment_date`, so an advance or split payout overwrites the earlier date, and Finance `paid_date` = the last date | D | missing capability (cash-flow dates wrong) | Store payments as rows (child table, or one `fr-sal-<salId>-p<n>` movement per payment) | Yes |
| P3-HR-5 | Server-side payroll readers (MCP, AI context) | "What the month costs" and "paid". The app uses Cena práce (`labor_cost ?? total_salary`). MCP sums or compares `total_salary`. `get_payroll_summary` filters on **current** `is_active`, so an archived employee's past payroll vanishes | C | wrong numbers | One PHP helper `ccrm_salary_due()` used by `sync.php`, `mcp_ext_writes.php`, `mcp_ext_ops.php`, `agent_utils.php`. Drop the `is_active` filter for past periods | No |
| P3-HR-6 | `financial_records` `fr-sal-*` | The payroll auto-expense is a stored copy that both Finance and Payroll write. A salary save overwrites Finance edits and resurrects a deleted expense. Turning `auto_expense` off orphans existing copies. Re-saving an old month re-categorises it under today's category and name | C | wrong numbers (low) | Name the salary row as the source of truth. Make the `fr-sal-*` row read-only in Finance (link to the payroll month). Stop rewriting category and title on re-save | No |
| P3-HR-7 | `employees.vacation_allowances_json` | Per-year leave entitlement. One current number per type is used for **every** year in the profile's year switcher. No carry-over. A leave type removed from settings drops its past usage | A | wrong numbers (past years) / missing capability | `employee_leave_entitlements` rows per employee × year × type (deterministic id), frozen once the year starts | Yes |
| P3-HR-8 | `ticket_time_entries` (legacy) | Demo seed still writes ticket time into the legacy table. It is only copied into `time_entries` by a migration that runs when the schema fingerprint changes, so the hours are invisible until then | C | wrong numbers (demo only) | Demo seed writes `time_entries` directly (`demo-time-tte-*` ids). Stop writing the legacy table | No |
| P3-HR-9 | `time_entries` billing | "These hours were billed to the client." The client PDF is generated live with today's rounding setting and today's billable flags. Nothing records what was sent, so double billing is possible | D | missing capability | `time_entries.billed_at` + `billing_ref` (or a `time_billing_exports` table), stamped on "Mark as billed" | Yes |
| P3-HR-10 | Approvals (`time_entries`, `employee_vacations`) | Who approved and when. Submit week sets `approval_status='approved'` on one's own entries with no approver or time on the row. Moving leave from `approved` to `taken` erases `approved_by` | D | missing capability (low) | `time_entries.approved_by/approved_at`. Keep `approved_by` when the status moves to `taken` | Yes (time_entries) |
| P4-W1 | warehouse_stock vs warehouse_movements | On-hand is stored twice (stock table + movement ledger), written separately by every handler, never reconciled. Four code paths make them drift apart by construction | C | wrong numbers | The ledger is the source of truth. The server applies each confirmed movement's delta to `warehouse_stock` exactly once (keyed by movement id). The client stops sending absolute quantities | yes (1 col, `warehouse_movements.stock_applied_at`) |
| P4-W2 | warehouse_stock (sync) | Stock rows have no `id`, so every push from a warehouse editor re-sends the whole stock table as absolute numbers. That overwrites concurrent changes (MCP, other tabs) | C | wrong numbers (stock levels revert silently) | Stop accepting `quantity` from the client (W1). At minimum, give rows a synthetic id `wh:item` so the diff only sends changed rows | no (if W1 is done) |
| P4-W3 | orders / order_items -> warehouse_movements | Order fulfilment writes a confirmed outward movement but changes no stock and writes no `fulfilled_quantity`. It can also be repeated | D + C | wrong numbers | Deterministic movement id per order, write `order_items.fulfilled_quantity`, apply stock via W1, take cost from WAP | no (column exists) |
| P4-W4 | warehouse_batches vs warehouse_stock | Batch `current_quantity` is a third copy of on-hand. Transfers, unbatched issues and MCP never touch it. Receipt lines point at batch ids that do not exist | C | wrong numbers | Maintain batch quantity from movement lines (same server step as W1). Fix the batch-id link | no |
| P4-W5 | warehouse_items.avg_purchase_price (WAP) | The running WAP is stored with no history and recomputed client-side from a stale snapshot. It can disagree with the ledger it should follow | C | wrong numbers | Compute WAP server-side in the same transaction as W1. Store `wap_after` on the movement line | optional (1 col) |
| P4-S1 | support_contracts + projects.ticket_widget_config_json.retainer | Contract terms are stored twice, edited in place, and deleted when the retainer is switched off. The UI and the server pick different contracts and different period windows | C | wrong numbers | One source (`support_contracts`). A change of terms or a renewal makes a new row with `valid_from/valid_until`. One shared period function | yes (`reset_day`, `overage_rate`) |
| P4-S2 | retainer periods | Usage/overage exists only for the current period and is computed live. At reset it disappears, and editing the allowance rewrites days that already happened | A | missing capability (-> lost billing figure) | Materialise one closed-period row per contract per period, deterministic id `scp-<contractId>-<periodStart>` | yes (new table) |
| P4-S3 | tickets.resolve_due_at | The resolution SLA due date of tickets created in the Tickets view is computed and shown, then dropped by sync (key mismatch). After a reload it is gone | A | data loss | Fix the key mapping (client sends `slaResolutionDueAt`, server also accepts `resolutionDueAt`). Backfill from created_at + priority target | no |
| P4-S4 | tickets SLA outcome | Breach is never recorded, and every closed ticket shows "SLA OK". Pause time is never accumulated, so a paused ticket breaches the moment it resumes | D | wrong numbers | Store breach/met at the transition (`first_response_breached`, `resolve_breached`). Write `sla_paused_at` / `sla_paused_seconds` on status changes and shift due dates | yes (2 cols) |
| P4-S5 | tickets (auto-resolve) | Auto-resolve from linked tasks changes the status without writing a `ticket_messages` system event | D | missing capability | Insert a system message in the same statement block, deterministic id `tmsg-auto-<ticketId>-<taskId>` | no |
| P5-S5-1 | leads / clients | Which leads belong to a client, so also the client's value, timeline, categories, invoices, orders and tickets. The app groups by **name** even though `leads.client_id` is stored. | C | wrong numbers | Make `client_id` the source of truth in the Clients register and in MCP. The name match only applies to unlinked rows. | No |
| P5-S5-2 | leads (`adjustment`) | One "client value adjustment" lives on many rows. A profile save copies it onto every linked or same-name lead, and "is a client" is worked out from `adjustment > 0`. | C | wrong numbers (phantom client, adjustment counted twice) | Stop copying `adjustment` to non-client rows, clean up the copies, keep it on the `client-*` row only | No |
| P5-S5-3 | projects × financial_records | Project billing and margin count a recurring rule's own row as a movement, next to the stored payments it made. Before materialization they count none of the past payments. | C | wrong numbers | Count a rule row through `recurringOwnRowCharge` / `mcp_fin_recurring_own_row`, as Finance does | No |
| P5-S5-4 | projects (`value`) | The contract value is read through a fallback chain: the live lead estimate, the type's money attributes, then `data.value`. `projects.value` stays empty. | C | wrong numbers | Freeze the resolved value into `projects.value` (one-off migration plus the creation paths) | No |
| P5-S5-5 | project_types → projects / proj_* | Deleting a project type (a template) CASCADE-deletes every project of that type and DROPs their data, timeline and Gantt tables. Removing an attribute DROPs its column for every project. | A (history erased by template) | data loss | Refuse to delete a type that still has projects (FK `RESTRICT`). Hide removed attributes instead of dropping them. | FK change only |
| P5-S5-6 | projects / proj_gantt_* | "Completed on" is missing on two write paths. Project status history is never recorded. A milestone that reaches 100 % has no completion date. | D | missing capability (wrong "finished late") | Stamp `finished_at` on every path. Log status changes. Add `completed_at` to Gantt rows. | Yes (Gantt column, optional log table) |
| P5-S5-7 | leads (SLA) | "Breached the phase SLA" exists only while the lead sits in the phase. It is never recorded, so changing the limit rewrites it. | D | missing capability | Optional breach event with a deterministic id | Maybe (timeline ENUM) |
| P5-S5-8 | users (`metadata_json.activityLog`) | The "User activity" timeline is a JSON list the client can edit, with a "Simulate activity" form. The real `audit_log` rows are never shown. | D | missing capability (audit integrity) | Show `audit_log` for the user. Drop the JSON list and the simulator. | No |

Parts: **P1** tasks, meetings, automation, audit trail · **P2** finance and invoices · **P3** HR and time tracking ·
**P4** warehouse and support · **P5** CRM, projects, JSON columns, remaining sections.

## Cross-cutting root causes

1. **Two stored copies, nobody reconciles them (class C).** Warehouse stock vs ledger vs batches (P4 W1/W2/W4), recurring
   rule row vs its stored payments (P2 #3/#4/#6, P5 S5-3), client `client_id` vs matching by name (P5 S5-1/S5-2),
   payroll `M05` vs `2026-05` keys (P3 HR-1), retainer terms in two places (P4 S1).
2. **A derived readout read from today's setting (class A/D).** Salary history (P3 HR-2), leave entitlement per year
   (P3 HR-7), SLA breach and pause (P4 S4), "done" task state from the editable list (P1 #1), project completion (P5 S5-6).
3. **A template or config deletion erases history (data loss).** Project type delete cascades to projects (P5 S5-5),
   workflow delete erases its logs (P1 #2), rule delete losing its own-row payment (P2 #5).
4. **A key or field mismatch silently drops data.** `resolutionDueAt` vs `slaResolutionDueAt` (P4 S3),
   `ccrm_is_done_task_status` is called but defined nowhere (P1 #1).

The finance findings P2 #3 and #5 should land before the uncommitted `materializeDueCharges` ships (P2 report).

---

# Part P1

# Stored vs derived: tasks, meetings, automation, audit trail (slice 1)

Scope: Section 3 (`tasks`, `task_assignees`, recurring templates/occurrences), Section 4 (`meeting_notes`,
`meeting_tasks`), automation / reminders / overdue / "fired" events (item 10, tickets and SLA excluded), Section 7 + item 12
(`audit_log`, `timeline_events`, `error_logs`, UI history). This is read-only: every finding was confirmed in `public/` or `src/`.

## Summary table

| # | Entity | What is only calculated | Class | Severity | Proposed fix | Needs schema? |
|---|---|---|---|---|---|---|
| 1 | tasks (every reader: recurring generator, reminders, sync notifications, ticket auto-resolve, workflows, MCP, UI) | "this task is done" = `status` compared with the **current last entry** of the editable `TASK_STATES` list; ~9 separate implementations, and one helper they call (`ccrm_is_done_task_status`) does not exist | C | wrong numbers (+ missed notifications) | Store which states mean done (`TASK_DONE_STATES`/state roles, like `LEAD_STAGE_GROUPS`), one PHP and one TS helper, every reader uses them; adding a state no longer redefines done | settings key only (no column) |
| 2 | workflows / workflow_logs / workflow_queue | Deleting a workflow deletes all of its run history; save, toggle and delete leave no audit row | D (+ data loss) | data loss | Soft-delete the workflow (or keep the logs and snapshot the workflow name in each log row); `ccrm_audit_log` on save/toggle/delete | yes (`workflows.deleted_at` or `workflow_logs.workflow_name`) |
| 3 | workflows (timer trigger) | "When did this timer last fire" = `MAX(workflow_logs.created_at)`, which ignores queued/failed runs and runs that threw before logging | C | wrong numbers (duplicate runs) | Record the fire itself: a deterministic slot key on `workflow_queue` (unique `workflow_id`+slot) or `workflows.last_triggered_at`, written when enqueuing | yes (one column + unique key) |
| 4 | tasks (recurring, `after_completion` mode) | The next occurrence date is recalculated from the previous completion, so a deleted ("Only this task") occurrence is generated again with the same date | D (the skip is not stored) | wrong numbers (a deleted row comes back) | Honour the template's `lastOccurrence` cursor in after_completion mode, or store skipped dates in `recurrence_json` (same as finance `recurringSkippedDates`) | no (JSON field) |
| 5 | meeting_tasks → tasks | The "Created" badge on a meeting suggestion = `!!assignedUser`; no stored link to the task that was created; regenerating the summary wipes the record; two statuses that are never reconciled | C / D | wrong numbers (UI says "Created" when no task exists) | `meeting_tasks.created_task_id`; badge and status read through it; regenerating keeps converted rows | yes (4-place rule: `meeting_tasks` is written by sync.php) |
| 6 | tasks (deadline history) | `original_deadline` / `deadline_moves` are updated only by the sync.php upsert; MCP and the WAAI integration move deadlines without counting | D | wrong numbers (low) | One shared SQL fragment for the deadline SET used by every writer | no |
| 7 | timeline_events (lead state history) | The status_change history row is written only by the browser; the bulk path writes it with no author, raw state keys, a hard-coded Slovak title, and logs "X → X" for leads already in that state | D (partial) | cosmetic / missing capability | Fix the bulk path to use `buildStatusChangeEvent`; optionally move the write into sync.php where the transition is already detected (one writer only) | no |

---

## Findings, grouped by root cause

### Root cause I: "done" is a formula over a mutable setting, not a stored fact (finding 1)

**Observed symptom**
- On a Slovak or Hungarian install (default states `Nový, Prebieha, Blokovaný, Hotovo` / `Új, Folyamatban, Blokkolva, Kész`,
  `public/api/schema.php:3048,3055`), closing a task never sends the "task completed" e-mail or push notification, and
  linked tickets with `sync_mode = 'auto_resolve'` are never resolved.
- An admin adds a new task state in Settings (for example "Fakturované" or "Archived"). Every task that was done becomes open
  again in every reader: overdue badges come back on finished work, reminder e-mails start going out for finished tasks, the
  recurring generator sees an "open occurrence" and stops creating new ones, and workflows that dedupe on "open task exists"
  stop creating follow-ups. If the admin removes the last state instead, every task in the state before it (by default
  "Blocked") counts as done.

**Root cause**
- Done-ness is never stored. Every reader recomputes it as `status === 'done' || status === last(TASK_STATES)`:
  - `src/utils/projectTasks.ts:4` (`isDoneTaskState`), `src/components/TaskDashboardView.tsx:561`,
    `src/components/LeadsDatagrid.tsx:1190` (case-sensitive),
  - `src/components/dashboard/presetWidgets.tsx:78`, a different rule: case-insensitive, and also accepts `hotová/hotovo/kész`,
  - `public/api/recurring_tasks.php:394-399` (generator gate, used at :441),
  - `public/api/task_reminders.php:181,218` (reminder skip),
  - `public/sync.php:4929-4933` (`$conclusionIsDone`), and at `public/sync.php:5044-5045` the "closed" check is
    `done-by-status || completedAt`, a third rule,
  - `public/api/workflows_engine.php:272-288` (`ccrm_workflow_open_task_exists`),
  - `public/api/mcp_ext_ops.php:15`, `public/api/integration_tasks.php:34`.
- `public/sync.php:5072` and `:5091` gate the completion e-mail/push and ticket auto-resolve on
  `strtolower($status) === 'done' || (function_exists('ccrm_is_done_task_status') && ...)`. **`ccrm_is_done_task_status` is
  defined nowhere** (grep over `public/` and the root mirror), so only the literal English `done` passes.
- Settings appends a new state at the end: `src/components/SettingsView.tsx:6280` (`setTaskStates([...taskStates, val])`),
  and removes one with a plain filter at `:6225`. Neither touches existing task rows. Rename (`:927-934`) does cascade.
- `completed_at` / `completed_by` are stored at the transition (sync upsert `public/sync.php:4924`, MCP
  `mcp_ext_writes.php:306`, integration `integration_tasks.php:877`). The readers above ignore them, except sync.php:5044, so
  the stored fact and the derived fact can disagree. Legacy done rows have `completed_at` NULL on purpose
  (`public/api/schema.php:2977-2979`), so `completed_at` alone cannot be the source of truth either.

**Evidence (from code)**
SK install: TASK_STATES = `[Nový, Prebieha, Blokovaný, Hotovo]`. A user moves a task to `Hotovo`. In sync.php:5072,
`strtolower('Hotovo') !== 'done'` and `function_exists('ccrm_is_done_task_status')` is false, so
`ccrm_send_task_completed_email_notification` and the ticket auto-resolve block never run. Next, the admin adds `Fakturované`.
Then `recurring_tasks.php:441` treats the `Hotovo` occurrence as open (`gated++`, nothing is generated), and
`task_reminders.php:218` no longer skips it, so a "1 day before" reminder goes out for a finished task.

**Proposed fix**
- *Source of truth*: an explicit, stored definition of which states are done, e.g. system setting `TASK_DONE_STATES`
  (a list, so "Hotovo" and "Fakturované" can both be done) or a role map like `LEAD_STAGE_GROUPS`. A migration seeds it with
  the current last state (plus literal `done`). Adding, removing or reordering states never changes it implicitly. The Settings
  UI shows a "counts as done" toggle per state.
- *One helper per language*: `ccrm_task_is_done(string $status, PDO|array $cfg)` (in `api/recurring_tasks.php` or
  `auth.php`; this also fixes the `function_exists` dead branch), and `isDoneTaskState` in `src/utils/projectTasks.ts` as
  the only TS implementation. Delete the local copies in TaskDashboardView, LeadsDatagrid and presetWidgets, and the PHP copies
  in recurring_tasks, task_reminders, sync, workflows_engine, mcp_ext_ops and integration_tasks.
- *Trigger / idempotency*: none needed; it is configuration. No row ids involved.
- *Deletion semantics*: removing a state that is in `TASK_DONE_STATES` must either be refused while tasks carry it, or
  cascade those tasks to another done state (same pattern as rename).
- *Backfill*: one settings row. Do not stamp `completed_at` on legacy done rows: schema.php:2977 deliberately keeps it NULL.
- *Schema*: no column; a new `system_settings` key (add it to the settings registry and to `entities_overview.md` under
  system_settings).
- *Double counting*: none. The readers to change are listed above.
- *Tests*: a unit test for both helpers (`done` literal, a configured done state, a state appended after it still done, the
  removed last state not making "Blocked" done), plus a guard test in the style of `recurringTaskGuard.test.ts` that fails if
  "last element of TASK_STATES" logic reappears outside the helper (grep `end($taskStates)` /
  `taskStates[taskStates.length - 1]`).

**Severity**: wrong numbers. In practice: notifications and ticket auto-resolve are missed on every non-English install today,
and recurring series stall after any state edit.

---

### Root cause II: automation history is tied to the rule's lifetime and the "fired" fact is inferred (findings 2, 3)

#### Finding 2: deleting a workflow erases what it did (D, data loss)

**Observed symptom**: An admin deletes an automation. Its whole run history (which leads it touched, which e-mails it sent,
which tasks it created, failures) disappears from Automation → Logs. Tasks it created keep a `workflow_id` that points to
nothing. Nothing in Settings → Audit log says who deleted it, changed it, or switched it off.

**Root cause**: `public/api/workflows.php:279-301` runs `DELETE FROM workflows`, then `DELETE FROM workflow_queue`, then
`DELETE FROM workflow_logs WHERE workflow_id = ?` in one transaction. `workflows.php` has no `ccrm_audit_log` call at all
(`grep -c audit` = 0) for `save` (:179), `toggle_active` (:258) or `delete` (:279). This is the same pattern as the finance
rule that deleted its payments: the rule owns its history.

**Evidence**: code above. `workflow_logs` has no FK (`schema.php:543-554`), so the delete is explicit, not a side effect.

**Proposed fix**
- Keep the logs. Either soft-delete (`workflows.deleted_at`, hidden from the list, `trigger_type` lookups add
  `deleted_at IS NULL`, logs stay readable), or hard-delete the definition but keep `workflow_logs` and add
  `workflow_logs.workflow_name` (a snapshot at run time) so an orphaned log still says what ran.
- Add `ccrm_audit_log($pdo, $user, 'workflow.save' | 'workflow.toggle' | 'workflow.delete', <id + name>)`.
- Pending `workflow_queue` rows of a deleted workflow may still be dropped (they never ran). Mark them `failed` with a reason
  instead, so the queue keeps a trace.
- *Idempotency/concurrency*: n/a. *Edit semantics*: editing nodes does not touch past logs (already true;
  `execution_log_json` is self-contained). *Backfill*: none possible for logs already deleted.
- *Schema*: `workflows`/`workflow_logs` are not written by sync.php, so pre-transaction healing is not required. Add the
  column to `CREATE TABLE` in schema.php plus an idempotent migration in `ccrm_apply_migrations()`, document the three tables
  in `entities_overview.md` (they are missing today), and run `npm run sync:backend`.
- *Tests*: a QA spec (mock workflows.php): create a workflow, run it, delete it, then assert the log row survives and an
  `audit_log` row exists. A PHP-level harness is preferable if one is added.

**Severity**: data loss (audit history disappears).

#### Finding 3: timer workflows decide "did I already fire?" from the execution log (C, duplicate runs)

**Observed symptom**: A timer automation ("every 60 min: create a follow-up task / send an e-mail") runs more often than
configured. In the worst case it runs on every cron tick.

**Root cause**: `public/api/cron.php:62-98`. For each active `trigger_type = 'timer'` workflow, the last run is
`SELECT MAX(created_at) FROM workflow_logs WHERE workflow_id = ?` (:73-75). If no log exists or the interval has passed, a new
`workflow_queue` row is inserted. But:
- the log row is written at the **end** of `ccrm_execute_workflow` (`workflows_engine.php:1239-1251`). A run that throws
  before that (for example `throw new Exception("Workflow trigger node is missing.")` at `workflows_engine.php:724`, or any
  exception escaping node execution) marks the queue row `failed` (`:1287-1290`) and writes **no log**. Every following cron
  tick then sees "never ran" and enqueues again;
- the queue is drained 10 rows per call (`workflows_engine.php:1266`, `LIMIT 10`). With a backlog, the timer's row is still
  `pending` at the next tick, the log is still old, and a second row is enqueued;
- finding 2 (deleting logs) resets the clock too.
The stored fact "the timer fired at T" exists (`workflow_queue.created_at`, `trigger_event_type = 'timer'`), but the scheduler
reads a different, lagging table: class C.

**Proposed fix**
- *Trigger*: same place (cron.php). Record the fire when enqueuing: add `workflow_queue.dedupe_key VARCHAR(80) NULL` with a
  UNIQUE index, and enqueue with `INSERT IGNORE` and
  `dedupe_key = CONCAT(workflow_id, ':timer:', FLOOR(UNIX_TIMESTAMP()/(interval*60)))`. Two overlapping cron runs then
  converge on one row (deterministic id, same idea as `fr-rec-<ruleId>-<date>`). A simpler alternative:
  `workflows.last_triggered_at`, updated with a conditional
  `UPDATE ... WHERE last_triggered_at IS NULL OR last_triggered_at <= NOW() - INTERVAL ? MINUTE`, enqueuing only when
  `rowCount() === 1`.
- *Deletion semantics*: deleting a queue row or log does not re-arm the slot (the key or timestamp stays).
- *Edit semantics*: changing `interval_minutes` changes future slots only.
- *Backfill*: none; the first tick after deploy fires once.
- *Schema*: `workflow_queue` is not written by sync.php, so schema.php + migration + entities_overview + sync:backend
  (no pre-transaction healing).
- *Readers to change*: cron.php:73 stops reading `workflow_logs`. The Automation stats (`workflows.php:65-73`) keep reading
  logs (correct: that is "ran", not "fired").
- *Tests*: unit-test the slot computation; a PHP harness test that runs the timer block twice in the same slot and finds
  one queue row, and that a workflow throwing before logging is not re-enqueued in the same slot.

**Severity**: wrong numbers (duplicate tasks / e-mails from automations).

---

### Root cause III: a user's skip is recomputed away (finding 4)

**Observed symptom**: On a recurring task in "repeat after completion" mode, the user deletes the open occurrence and picks
"Only this task", which the dialog describes as "Skips this occurrence. The series continues with the next scheduled date."
(`src/components/RecurringOccurrenceDeleteDialog.tsx:88-100`). Within about a minute the same task, with the same deadline,
reappears.

**Root cause**: `public/api/recurring_tasks.php:461-476`. In `after_completion` mode the next date is computed from
`$latestOccurrence` (the newest **remaining** occurrence, ordered by `recurring_occurrence_date DESC`):
`next = completed_at(previous) + interval`. That is exactly the date of the occurrence the user just deleted. The template's
`lastOccurrence` cursor, which schedule mode uses (`:477-484`) and which already holds the deleted date, is ignored in this
branch. The `INSERT IGNORE` on `uq_recurring_occurrence (recurring_source_id, recurring_occurrence_date)`
(`schema.php:180`) does not block it, because that row was deleted. The generator runs opportunistically after any sync
(`sync.php:987-995`, 60 s throttle), so the row returns quickly. If no occurrence is left at all, the `startsOn` branch
(`:472-475`) recreates the first one the same way.

Schedule mode is **not** affected: deleting the open occurrence leaves `lastOccurrence` at its date, and the next one is
computed after it.

**Proposed fix**
- Minimal: in the after_completion branch, `if (!empty($rec['lastOccurrence']) && $scheduledDate <= $rec['lastOccurrence'])`,
  recompute from the deletion day: `next_after_completion(max(compAt, today), ...)`. That gives "continues with the next date".
- Explicit: store the skip like finance does: `recurrence_json.skippedDates[]`, appended by `task.php` DELETE when the deleted
  row has `recurring_source_id`, and checked by the generator in both modes. `ccrm_recurring_validate_json` must carry
  `skippedDates` from `$stored` the way it carries `lastOccurrence`.
- *Idempotency*: the unique key already handles two concurrent generators.
- *Deletion semantics*: that is the fix itself: the deleted occurrence stays deleted.
- *Edit semantics*: editing the template must keep `skippedDates`/cursor (validate_json already preserves cursor fields from
  `$stored`).
- *Backfill*: none.
- *Schema*: none (JSON field inside `recurrence_json`); update the field list in `entities_overview.md`.
- *Tests*: mirror `recurringRuleDeletion.test.ts`: generate → delete open occurrence → run generator → not recreated; a second
  run is idempotent; schedule mode is unchanged. The generator is PHP only, so this needs a PHP-level test. The QA suite
  mocks sync.php and will not exercise it.

**Severity**: wrong numbers (a user-deleted row comes back; the UI promise is broken).

---

### Root cause IV: a derived badge stands in for a stored link (finding 5)

**Observed symptom** (Meeting room → note → "Task suggestions"):
- Setting an assignee in the suggestion's detail drawer shows the green "Created" badge, but no task exists anywhere.
- Re-running "Generate summary" replaces the suggestion list. The record of which suggestions were turned into real tasks is
  gone, and those tasks no longer trace back to the meeting.
- A suggestion's own status ("todo") never follows the real task it produced.

**Root cause**
- The badge is `const isCreated = !!task.assignedUser;` (`src/components/MeetingRoomView.tsx:1667`).
- A real task is created only by `updateTaskAssignment` (`:1079-1116`), and only when the suggestion had no assignee yet. The
  created task id (`task-ai-<ts>`) is not written back to the suggestion.
- The drawer sets `assignedUser` directly (`:2699-2700`), and `handleSaveTaskDetails` (`:1139-1155`) saves it without creating
  a task.
- `handleGenerateSummary` (`:1184-1199`, fallback `:1285-1299`) builds a fresh `automatedTasks` array with new ids. On save,
  sync.php deletes and re-inserts all `meeting_tasks` of the note (`public/sync.php:5334-5355`). Also
  `automatedTasks: newSummaryGenerated ? newAutomatedTasks : []` (`MeetingRoomView.tsx:1448`) wipes them when the summary flag
  is off.
- `meeting_tasks.status` and `tasks.status` are two stored copies with no link (class C).

**Proposed fix**
- Add `meeting_tasks.created_task_id VARCHAR(50) NULL`, written by `updateTaskAssignment` with the new task's id. The badge
  becomes `!!created_task_id`, and the suggestion's status is read from the linked task (fall back to its own status only when
  unlinked). The drawer's assignee field no longer implies creation; offer an explicit "Create task" action.
- Regeneration merges: suggestions with `created_task_id` are kept, and only unconverted ones are replaced.
- Optionally `tasks.meeting_id` for the reverse link (the task drawer could show "from meeting X"). That is a second column and
  more sync work, so decide with the PO.
- *Idempotency*: the task id is client-generated. Make it deterministic (`task-mt-<meetingTaskId>`) so a double click or two
  tabs converge on one task.
- *Deletion*: deleting the real task clears the badge (link points to a missing row → show "deleted"). Deleting the meeting
  leaves the tasks.
- *Backfill*: existing rows have no link. Leave NULL; best-effort match by title + assignee + lead is possible but optional.
- *Schema*: **4-place rule** (sync.php writes `meeting_tasks`): `CREATE TABLE` in schema.php, idempotent migration in
  `ccrm_apply_migrations()`, pre-transaction `ccrm_column_exists` healing above `beginTransaction()` in `public/sync.php`,
  `entities_overview.md`, `npm run sync:backend`. Add the column to the INSERT at sync.php:5339 and to the GET mapping at
  ~1498.
- *Tests*: a unit test on a pure helper (`mergeRegeneratedSuggestions(old, fresh)` keeps converted rows; badge true only with
  a link), plus a QA spec on the meeting room: assign → task appears; regenerate → badge persists.

**Severity**: wrong numbers / wrong state (the UI claims a task was created when none was).

---

### Root cause V: an audit counter maintained by one writer only (finding 6)

**Observed symptom**: A task postponed through the MCP tools (AI assistant) or through a WhatsApp (WAAI) chat update shows no
or a smaller "Postponed N×" badge (`src/components/TaskDeadlineExtras.tsx:61-81`), and `original_deadline` stays empty.

**Root cause**: The counter lives only in the sync.php upsert:
`original_deadline = IF(VALUES(deadline) > deadline AND original_deadline IS NULL, deadline, original_deadline), deadline_moves = deadline_moves + IF(VALUES(deadline) > deadline, 1, 0)`
(`public/sync.php:4924`). The other writers update `deadline` directly with no such clause:
`public/api/mcp_ext_writes.php:245,280`, `public/api/integration_tasks.php:610,616,660`. The client mirror
`src/utils/taskDeadline.ts:60-69` is display-side only.

**Proposed fix**: a PHP helper `ccrm_sql_task_deadline_set()` returning the three SET fragments (`original_deadline`,
`deadline_moves`, `deadline`), used by sync.php, mcp_ext_writes and integration_tasks. No schema change, no backfill possible
for past moves. *Tests*: a guard test (like `recurringTaskGuard.test.ts`) that fails when a PHP file writes
`` `deadline` = `` on `tasks` without the helper.

**Severity**: wrong numbers (low; cosmetic in most installs).

---

### Root cause VI: state history written by the browser (finding 7)

**Observed symptom**: After a bulk state change in the leads grid, the lead timeline shows "Zmena stavu" (always Slovak),
`Status changed from contacted to won (Bulk Update)` with raw keys, **no author**, and an entry even for leads that were already
in that state.

**Root cause**: `src/components/LeadsDatagrid.tsx:4658-4676` (`handleBulkStatusChange`) builds its own event instead of
`buildStatusChangeEvent` (`:4240-4254`, used by the profile form `:3408` and the pipeline move `:4299`). sync.php already
detects the transition server-side (`public/sync.php:4632-4638`, for the workflow trigger) but stores no history itself, so
every new client path has to remember to write one. Server writers do it on their own: MCP does (`public/api/mcp.php:1596,1626`).

**Proposed fix**: use `buildStatusChangeEvent` in the bulk path and skip leads whose status is unchanged. Optionally make
sync.php the single writer (insert a `status_change` row with a deterministic id `evt-st-<leadId>-<unix ts>` when
`oldStatus !== newStatus`, author = session user) and remove the client writes, but **not both** (double entries). Lead stage
age (`mcp_ext_ops.php:371`, `src/utils/leadSla.ts`) reads these rows, so they must exist exactly once per transition.

**Severity**: cosmetic / missing capability (who made the change is not recorded).

---

## Order of work

1. **Finding 1** first: it is the widest (9 readers) and silently breaks notifications on every SK/HU install today. One
   settings key, two helpers, then mechanical reader changes.
2. **Finding 4** in parallel with 1: about 10 lines in `recurring_tasks.php`, independent. It touches the same file as
   finding 1's generator change, so coordinate the merge.
3. **Findings 2 + 3** together (one PR: workflows schema, cron.php, workflows.php), independent of 1 and 4.
4. **Finding 5** independent (meeting room + sync.php meeting block + 4-place rule).
5. **Findings 6 and 7**: small, any time.

## Not a problem (class B): checked, leave as is

- **Recurring task occurrences**: stored rows, generated server-side (`recurring_tasks.php:ccrm_process_recurring_tasks`,
  run from cron, the sync shutdown hook and post-sync), unique `(recurring_source_id, recurring_occurrence_date)`. Deleting a
  template deletes only the template row (`sync.php:5266-5273`, `ccrm_delete_omitted(..., 'recurring')`; `task.php:43-45`
  refuses templates). Completed occurrences survive, which is what "Completed occurrences remain in history" in
  TaskDashboardView promises. Schedule-mode deletion stays deleted (the cursor moves). Pause and resume shift the cursor
  (`validate_json`). The exception is finding 4.
- **Template `deadline`/`start_date`**: a stored preview of the *next* due date, future-only.
- **`getNextDueDates` / `TaskRecurrenceFields` previews and calendar ghost occurrences**
  (`TaskDashboardView.tsx:2229-2275`): projections from the cursor forward, skipping keys that already exist. Caveat: while an
  occurrence stays open past later cycles, ghosts are drawn on *past* days (no `>= today` filter). The generator creates them
  one at a time, already overdue, when the open one closes. It is a preview, not lost history; see open question 3.
- **`ccrm_sql_real_tasks()`**: a WHERE filter only.
- **Task "overdue"**: a state over stored `deadline` + status (`projectTasks.ts:isTaskOverdue`), not an event anybody
  relies on later (but inherits finding 1's done rule).
- **Task e-mail reminders "fired"**: stored. `task_reminder_log` PK `(task_id, user_name, scheduled_for)` is claimed with
  INSERT IGNORE before sending (`task_reminders.php:211-240`). It is idempotent across overlapping runs, and failures are
  recorded and not retried.
- **Event-triggered workflow runs**: stored in `workflow_queue` and `workflow_logs`. Automation statistics
  (`workflows.php:65-73`) are aggregates over those rows (exceptions are findings 2 and 3).
- **Task completion `completed_by` / `completed_at`**: stored at the transition by every writer (sync upsert, MCP, WAAI).
  The legacy fallback to `updatedAt`/deadline in `isClosedRecentTask` (`TaskDashboardView.tsx:572`) and `byCompletionDesc`
  (`:1261`) affects pre-1.6.41 rows only and is labelled as an estimate.
- **Task deletion**: audited (`task.php:114`, `tasks.delete`).
- **`task_assignees`**: a stored junction table, copied from the template by the generator.
- **`meeting_notes`**: every displayed field (date, duration, attendees, AI summary, transcription) is a stored column.
- **`timeline_events`**: stored rows. The mail merge (`mailTimeline.ts:mergeLeadTimeline`, `ClientsView.tsx:1393`) overlays the
  live mailbox read on stored rows, and `api/mail_filing.php` files those messages in the background. The future/past split is
  a display filter.
- **Lead stage age / SLA breach in MCP** (`mcp_ext_ops.php:371`): an aggregate over stored `status_change` rows (finding 7
  keeps them complete).
- **`audit_log`**: append-only, and the viewer is read-only (`audit_log.php`).
- **`error_logs`**: stored; "clear" is itself audited (`error_logs.php:24`).
- **Browser push / in-app task notifications** (`App.tsx:2870-2900`): ephemeral by design, computed from a diff of the
  synced list. Server-side e-mail/push exist for assign/complete (complete is broken by finding 1).

## Open questions for the product owner

1. **Which task states count as done?** One state or several (for example "Hotovo" and "Fakturované")? Should adding a state
   ever move the done marker automatically? (Proposed: no, an explicit toggle.)
2. **Workflow deletion**: keep run history after a workflow is deleted (soft delete), or delete it on a retention schedule
   because logs carry lead payloads?
3. **Recurring tasks in schedule mode, missed cycles**: while one occurrence stays open, should the cycles that pass be (a)
   generated later one by one as overdue backlog (current behaviour; the calendar shows them as past "planned" ghosts), (b)
   stored as skipped, or (c) dropped so that the next generated task is the next *future* date?
4. **After-completion skip**: when the user deletes the open occurrence, should the next date be counted from the deletion
   day or from the previous completion plus two intervals?
5. **Meeting suggestions**: once a suggestion becomes a task, should the suggestion row stay (with a link) or disappear in
   favour of the real task? Should tasks show "from meeting X"?

## Side notes (documentation gaps found while auditing, not in the bug class)

`entities_overview.md` is missing these: `tasks.completed_by`, `completed_at`, `email_reminders_json`, `requires_conclusion`,
`conclusion`, `estimate_minutes`, `workflow_id`, `related_project_id`, `related_ticket_id`; the tables `task_reminder_log`,
`task_tags`, `workflows`, `workflow_queue`, `workflow_logs`; `audit_log.ip`; `meeting_notes.ai_summary_json`,
`summary_generated`, `audio_file`, `transcription`, `automated_notes`; `meeting_tasks.start_date`.

---

# Part P2

# Slice 2: Finance (section 9) and invoices, plus recurring finance in every other reader

Read-only audit. Code was read as it stands on `1.13-nectarine`, **including uncommitted work by other
sessions** in `src/App.tsx`, `src/components/FinancialManagementView.tsx` and (mid-audit)
`src/utils/recurringExpenses.ts` / `.test.ts`. Those files were changing while I read them, so line numbers
there are approximate. Each finding names its function as well, so it can be found again.

Probes: two throwaway scripts in the scratchpad (`probe-fin.mts`, `probe-fin2.mts`) import the real
`src/utils/*.ts` modules with node and replay the scenarios. No app code was touched, nothing was committed
and no build was run. The numbers quoted under "Evidence" come from those runs.

## Summary

| # | Entity | What is only calculated | Class | Severity | Proposed fix | Needs schema? |
|---|---|---|---|---|---|---|
| 1 | financial_records (recurring rule) | Which past days are "due" is recomputed from the **current** schedule on every materializer run. A schedule edit creates new past days, and these get stored as paid on top of the old ones | C | wrong numbers (doubled history) | Store a per-rule watermark `recurring_materialized_through`. The materializer and every schedule reader draw only after it, so a schedule edit applies from the next charge | yes |
| 2 | financial_records (recurring rule) | The pause interval is not recorded. Resume restores the end date, so the paused months come back and get materialized as paid | C | wrong numbers | Same watermark, advanced daily even when nothing is due. Paused days ≤ watermark are never drawn | yes (same column) |
| 3 | financial_records (stand-ins) | "This day is stored" lives in two places: the rule's `recurring_skipped_dates_json` and the row's `recurring_source_id` + `recurring_occurrence_date`. The materializer's idempotency checks only its own id pattern | C | wrong numbers (duplicate payment) | Dedupe on the (source, occurrence) pair. Add a UNIQUE KEY on it. Before the first run, rebuild skip lists from the stand-ins | yes (unique key) |
| 4 | financial_records read by projects / clients / MCP / AI | A rule's **template row** is counted as a movement next to its now-stored payments | C | wrong numbers | Add one guard, "real movements" = `is_recurring = 0` (like `ccrm_sql_real_tasks()`), plus a guard test | no |
| 5 | financial_records (legacy rule own row) | A payment that exists only as the rule's own row (paid before the schedule starts). It is never stored on its own, and deleting the rule deletes it | A | data loss | The materializer also writes `recurringOwnRowCharge` as a movement and skips its day | no |
| 6 | financial_records (rule descriptions) | "≈ X / month", the active/paused count, annual totals and the reprice hint all read the schedule, which now has holes where stored payments are | C | wrong numbers / cosmetic | Describe the rule from its cadence (ignoring skips) or from stored + future. `hasChargedBy` reads the watermark / stored rows | no |
| 7 | financial_records (server readers) | Materialization is client-only. Until an editor opens the app, MCP, AI and SQL readers derive past charges from the schedule and nothing is stored | A | missing capability | Materialize on the server too, on request, gated to once a day, with `INSERT IGNORE` on deterministic ids | yes (uses #1) |
| 8 | invoices_offers ↔ financial_records ↔ orders | "Payment received" is held in up to 4 unlinked places. The bridge copies none of them after creation, and ClientsView skips the paid stamp entirely | C + D | wrong numbers | Ledger movement = source of truth. Bridge order-paid, invoice-won and SuperFaktúra-paid into it. Share one order→invoice helper | no |
| 9 | financial_records.status `overdue` | Overdue is a manual stored status in the app, but derived from `due_date < today` in MCP. The two disagree | C | wrong numbers (disagreeing readers) | One derived `paymentState(rec, today)` in TS and PHP. Treat the stored `overdue` as `pending` | no (data migration only) |
| 10 | invoices_offers.document_number | The issued-number sequence is derived as max(existing) + 1. Deleting the newest invoice re-issues its number. The order flow uses random numbers. No UNIQUE key | A / D | wrong numbers (legal) | Stored counter per (prefix, year) under GET_LOCK. Add UNIQUE(document_number). Never reuse a number | yes |
| 11 | financial_records.category_path | A stored copy of the category breadcrumb that goes stale on rename or move | C | cosmetic (AI summary splits one category) | Derive the label from `category_id` at read. Keep the column only as "filed as", if wanted | no |
| 12 | invoices_offers → financial_records | The movement's existence is re-derived from the invoice: a user-deleted unsettled `fr-inv-*` comes back on the next invoice change. MCP cancels by status, the app by deletion | C | cosmetic / missing capability | Respect a user deletion (tombstone or a flag on the invoice). Pick one cancel representation | maybe |

Counts: **A: 3** (#5, #7, #10) · **C: 8** (#1, #2, #3, #4, #6, #9, #11, #12) · **C + D: 1** (#8).

---

## Root cause I: the past of a recurring rule is still defined by its schedule (#1, #2, #3, #6, #7)

The shipped pattern (`recurringRuleDeletion.ts`) stores each due charge. But on every run, which days are
"due and not yet stored" is still recomputed from the rule's **current** schedule, from
`recurringStartDate` up to today (`dueCharges`, `recurringRuleDeletion.ts:40-44`). The only memory of what
was already handled is the skip list, which is a list of dates. Any change that moves the dates escapes
that memory.

### #1 A schedule edit doubles the stored history (C, wrong numbers)

- **Observed symptom.** A monthly rent of 500 €, materialized Jan–Apr (2 000 € paid). The user opens the
  rule and moves "Prvá platba" from 1 Jan to 15 Jan, or switches weekday or cadence. The next materializer
  run writes four more paid movements (15 Jan … 15 Apr). History now shows 4 000 €.
- **Root cause.**
  - `FinancialManagementView.tsx` `handleSaveTransaction` (~4008-4105) rebuilds `recurringConfig` from the
    first-payment date (`formRecurringRule` → `recurringConfigFromFirstPayment`, ~3986). It keeps the old
    skip list (uncommitted line ~4090), which lists only the *old* days.
  - The "First payment" input is editable on an existing rule (~4788).
  - `materializeDueCharges` (`recurringRuleDeletion.ts:94-114`) then sees new, unskipped past days and
    stores them.
  - The other session's in-flight `firstPaymentOnOrAfter` (uncommitted, `recurringExpenses.ts` ~417) makes
    schedule changes even easier to make.
- **Evidence.** `probe-fin.mts` case 2: `stored paid after materialize: 2000 rows 5` → after the edit
  `4000 rows 9`.
- **Proposed fix.**
  - **Schema:** add `recurring_materialized_through DATE NULL` on `financial_records`. It means "every
    charge on or before this day is either a stored row or deliberately absent".
  - **Writes:** `materializeDueCharges` writes only charges with `watermark < date ≤ today`, then sets
    watermark = today, even when nothing was due.
  - **Reads:** every schedule reader (`recurringCharges` callers in the overview table, trend,
    `pastRecurringCharges`, MCP `mcp_rec_charges`) clamps its start to `watermark + 1`. So a schedule edit
    only ever changes the future, which mirrors what `recurringAmountHistoryAfterChange` already does for
    the amount.
  - The skip list shrinks to future stand-ins only.
  - **Moving the start date earlier.** This is the one legitimate way to add old history. Make it explicit:
    "add payments from X?" (open question 3).
  - **Trigger:** unchanged (the client effect in `App.tsx` ~2270, plus server per #7).
  - **Idempotency:** deterministic ids already exist. The watermark is monotonic: take max(local, incoming)
    on merge.
  - **Deletion:** a deleted stored payment stays deleted, because its day is ≤ watermark and is never drawn
    again.
  - **Backfill:** for existing rules, set the watermark to the max stored `recurring_occurrence_date` for
    that rule, else NULL (the first run materializes as today).
  - **4-place rule:** `CREATE TABLE` in `schema.php`; an idempotent migration in `ccrm_apply_migrations()`;
    pre-transaction healing in `sync.php` above `beginTransaction()` (4.14 writes the column); the
    `entities_overview.md` §9 entry; then `npm run sync:backend`. Add it to the sync INSERT/UPDATE column
    list at `sync.php` ~5909 and the GET mapping at ~2108.
  - **Readers that must stop deriving the past:** `aggregateOverviewTable`, the weekly and monthly trend
    (`FinancialManagementView` ~2785 and ~3044), `projectPastRecurringCharges`, `recurringOwnRowCharge`,
    `mcp_fin_aggregate` / `mcp_fin_recurring_own_row` (`mcp_ext.php` ~468-492).
- **Tests** (shape of `recurringRuleDeletion.test.ts`):
  - "a schedule edit after materializing writes no past payment"
  - "watermark advances on a day with no charge"
  - "start moved earlier writes nothing unless confirmed"

### #2 Resuming a paused rule bills the paused months (C, wrong numbers)

- **Observed symptom.** The rule is paused on 15 Apr and resumed on 10 Jun. May and June were never paid.
  On resume, both are written as **paid** movements.
- **Root cause.**
  - `resumeRecurringRule` (`recurringExpenses.ts` ~587) only restores `recurringEndDate` from
    `recurringPlannedEndDate`. Used via `toggleRecurringPause` from `handleToggleRecurringActive` (~2193)
    and the form's `toggleRuleActive` (~4398).
  - The paused interval is recorded nowhere, so the schedule redraws it. Before materialization the derived
    readers did the same, which is the original bug class: changing the rule's state rewrote the past. Now
    the materializer stores the rewrite.
- **Evidence.** `probe-fin.mts` case 3: `paid while paused: 2000  after resume: 3000`, with the new rows on
  2026-05-01 and 2026-06-01.
- **Proposed fix.** #1's watermark. While paused, the materializer still runs daily and advances the
  watermark (nothing is due), so on resume every paused day is ≤ watermark and is never drawn. No extra
  column is needed.
- **Test.** "pause → days pass → resume writes nothing for the paused days".

### #3 A user-edited payment is duplicated when its rule lost the skip (C, wrong numbers)

- **Observed symptom.** The February charge was edited by hand (520 € on 3 Feb). Later the rule was saved
  by a session running HEAD code. On the next materializer run, February holds **two** payments: 520 € and
  500 €.
- **Root cause.**
  - **Two sources of truth for "stored":** the rule's `recurringSkippedDates`, and the movement's
    `recurringSourceId` + `recurringOccurrenceDate`.
  - **The materializer heals only its own ids.** `storedIds.has(dueChargeId(rule.id, date))`
    (`recurringRuleDeletion.ts:59`, `:95`) recognizes only ids of the form `fr-rec-<rule>-<date>`.
  - **Hand-edited stand-ins get random ids.** `handleSaveOccurrence` uses
    `` `fr-${Date.now()}-${rand}` `` (`FinancialManagementView.tsx` ~3931).
  - **Committed code drops the skip list.** `handleSaveTransaction` at HEAD (`fdc46820`) builds the rule
    payload **without** `recurringSkippedDates`, so every rule save so far wrote NULL. Only the uncommitted
    edit at ~4090 keeps it. Production data may therefore already hold stand-ins whose day is no longer
    skipped (today that double-counts in the derived readers). The materializer would freeze it into a
    stored duplicate.
  - **No unique key.** `financial_records` has no unique key on
    (`recurring_source_id`, `recurring_occurrence_date`). `tasks` has `uq_recurring_occurrence`
    (`sync.php` ~3298).
- **Evidence.** `probe-fin2.mts` returns `fr-rec-fr-rent-2026-02-01 … 500` **and**
  `fr-1767000000000-abcde 2026-02-01 520`.
- **Proposed fix.**
  - In `materializeDueCharges`, build `Set("<sourceId>|<occurrenceDate>")` over all rows and treat a hit as
    stored. Re-skip that day; never write a second row.
  - Migration: dedupe existing pairs, keeping the hand-edited one, then add
    `UNIQUE KEY uq_fr_recurring_occurrence (recurring_source_id, recurring_occurrence_date)`. NULLs do not
    collide, so one-off rows are unaffected. Heal the key pre-transaction in `sync.php` like the tasks key.
  - One-time backfill before the first materialization: rebuild every rule's skip list from its stand-ins.
  - Use `INSERT IGNORE` / `ON DUPLICATE KEY` semantics for `fr-rec-*` server-side (#7).
- **Test.** "a stand-in with a random id whose day is missing from the skip list is not duplicated".

### #6 Readers describing a rule now see holes (C, wrong numbers / cosmetic)

- **Observed symptom.**
  - On the Recurring tab, the card's "≈ −500 € / mesiac" drops to **0 €** once that month's charge has been
    stored.
  - The KPI "active vs paused" count and the annual totals lose today's charge. A yearly rule whose charge
    is today can count as paused.
  - Editing the amount of a materialized rule shows "Pred X sa nič neúčtovalo, suma sa iba opraví"
    (nothing was charged, the amount is only corrected), although four stored payments exist.
- **Root cause.**
  - `monthlyCost = recurringTotalInRange(rec, monthStart, monthEnd)` (`FinancialManagementView` ~8463).
  - `recurringMetrics` sums `[today, today+365]` (~2342-2385).
  - `hasChargedBy` (`recurringExpenses.ts:165`) calls `recurringOccurrences`, which drops skipped days. So
    `recurringAmountHistoryAfterChange` (`:187`) returns "never charged".
- **Evidence.**
  - `probe-fin.mts` case 4: `monthly cost card April (after the 1st): 0  before materialize: 500`.
  - Case 6: history `null` (materialized) vs `[{"until":"2026-04-30",…}]` (unmaterialized).
- **Proposed fix.**
  - Figures that describe the rule's cadence ("per month", "per year", active) use the scheduled
    occurrences ignoring skips (`scheduledOccurrences`, or `recurringOccurrences` with
    `recurringSkippedDates: null`, as `openEditor` already does at ~3815).
  - The current-month cost can alternatively be "stored this month + still to come".
  - `hasChargedBy` returns true when watermark ≥ start or a stored `recurringSourceId` row exists.
- **Tests.**
  - "monthly cost of a materialized rule equals the unmaterialized one"
  - "reprice hint after materialization pins / says charges exist"

### #7 Nothing is stored until an editor opens the app (A, missing capability)

- **Observed symptom.**
  - An MCP `get_financial_overview`, the AI summary, or a SQL export run on a day when nobody with finance
    edit rights has opened the app reads past charges that exist nowhere in the database.
  - `mcp_fin_aggregate` counts them as real via `if ($ch['date'] <= $todayIso) $real += …`
    (`mcp_ext.php` ~479-485).
  - A stale tab running pre-fix code that deletes a rule still erases the un-stored past.
- **Root cause.** The only trigger is the client effect `canMaterializeCharges` (`App.tsx` ~2270:
  `isInitialSyncResolved && !isDemoMode && access.module("financial").edit && !restricted`). The server has
  no trigger (no cron, and there is no build step on prod).
- **Proposed fix.**
  - Port `materializeDueCharges` to PHP next to `mcp_rec_charges` (the schedule port already exists in
    `mcp_ext.php` ~169-320).
  - Run it in `sync.php` GET **outside** the 5 s `?probe=1` path, and in MCP finance tools before reading.
    Gate it once per day with a `system_settings` stamp (`FIN_MATERIALIZED_ON = CURDATE()`), so the steady
    state costs one SELECT.
  - Write with `INSERT IGNORE` on the deterministic id plus #3's unique key. Update the skip list (or, after
    #1, the watermark) in the same transaction. DML only, no DDL.
  - Permissions: this is a system write, not a user write. Skip it when the DB is a demo seed.
  - **Cost:** one pass over `is_recurring = 1` rules per day.
- **Test.** A PHP/TS parity test (same rule → same ids and dates), reusing the
  `financeConsistency.audit.test.ts` style.

## Root cause II: a rule's template row is read as if it were a movement (#4, #5)

### #4 Projects, clients, MCP and AI count the rule row on top of its payments (C, wrong numbers)

- **Observed symptom.** A monthly 1 000 € retainer on a project, materialized Jan–Apr. Project billing
  shows `received 4000` **and** `invoicedOpen 1000`: a phantom open invoice that never goes away. Before
  materialization it showed only the phantom 1 000. A legacy rule row with status `paid` adds a fifth
  "received" 1 000.
- **Root cause.** These readers skip `isRecurring` / `is_recurring` neither in TS nor SQL:
  - `projectBilling.ts:77-82` (comment: "A recurring income rule counts as one row"). Used by
    `Dashboard.tsx:365`, `DynamicDashboardView.tsx:707`, `ProjectsView.tsx:678` and
    `ProjectDetailsView.tsx` ~814.
  - `ProjectDetailsView` `revenueAnalysis` (~713-752).
  - `ClientsView` `clientInvoices` (1604-1612) and its summary cards (~5296-5299).
  - `mcp_income_by_project` (`mcp_ext.php:663`) → `mcp_project_billing` / `mcp_installment_row`
    (`mcp_ext_intel.php` ~379-400).
  - MCP `list_financial_movements` (`mcp_ext.php` ~953-990): the rule is listed with `expected` = its amount
    on its first-payment day.
  - `mcp.php` `list_expenses` (~2226).
  - `agent_utils.php` ~865-919 (rule rows added to `pendingPayables` / `totalPlannedExpense`).

  For comparison, `mcp_scope_ledger_income` already filters `is_recurring = 0` (`mcp_ext_intel.php:541`).
- **Evidence.** `probe-fin.mts` case 5: before
  `{"received":0,"invoicedOpen":1000,…}`, after `{"received":4000,"invoicedOpen":1000,…}`.
- **Proposed fix.**
  - Add `isRealMovement(r) = !r.isRecurring` in TS and `ccrm_sql_real_movements()` → `is_recurring = 0` in
    PHP, the same idea as `ccrm_sql_real_tasks()`.
  - Apply them in every reader above. Readers that want "still to come" add `projectFutureMovements` for the
    project or client explicitly.
  - Add a guard test like `recurringTaskGuard.test.ts`: grep `financial_records` reads in `public/api/` and
    `financialRecords.filter(` aggregations for the guard.
  - Ship **after #5**, so excluding rule rows loses no legacy payment.
- **Test.** "projectBilling of a materialized rule = sum of its stored payments".

### #5 A payment that lives only on the rule row is lost with the rule (A, data loss)

- **Observed symptom.** A rule entered as "paid 18 Dec 2025, charges on the 1st" (the case documented at
  `financialOverviewTable.ts` ~128-137). Its first payment is the rule row itself. "Vymazať pravidlo"
  (delete rule) deletes the row, and December's 500 € disappears from the overview, trend and ledger.
- **Root cause.**
  - `recurringOwnRowCharge` (`financialOverviewTable.ts:138-151`) counts the rule's own row as money when
    no charge falls on or before its day.
  - `materializeDueCharges` stores only schedule days, never this one.
  - `handleDeleteRecurringRule` (uncommitted, ~4275) keeps `dueChargeMovements` plus the stand-ins, but not
    the own-row payment.
  - The same applies to the ledger row delete (`handleDeleteTransaction` ~7783), bulk delete, and
    `ClientsView.handleDeleteClientInvoice` (~1999).
  - `handleSaveTransaction` deliberately keeps such rows (`ownRowIsPayment`, ~4061), so new ones can still
    appear.
- **Evidence.** `probe-fin.mts` case 7: the stored movements are 2026-01…04 only. December real = 500 with
  the rule row and 0 without it.
- **Proposed fix.**
  - In `materializeDueCharges`, when `recurringOwnRowCharge(rule)` returns `real > 0`, write one movement
    `dueChargeId(rule.id, ownDate)` with the row's own status, `amountReal`, `paidDate` and
    `recurringSourceId`/`recurringOccurrenceDate = ownDate`. Then skip `ownDate`, so
    `recurringOwnRowCharge` returns null and the rule row becomes a pure template.
  - **Idempotency:** same deterministic id.
  - **Backfill:** at most one row per rule.
  - Reset the rule row to `planned`, dated on its first payment, as v1.13.61 does for new rules.
- **Test.** "a rule whose own row is a payment before its schedule: the payment survives rule deletion".

## Root cause III: payment and overdue state of an invoice live in several places (#8, #9, #12)

### #8 "Paid" is decided in four places that never reconcile (C + D, wrong numbers)

- **Observed symptom.**
  - An order already paid by card is invoiced from the client detail. The invoice gets status `invoiced`
    (group `won` = "invoiced / settled", `offerStatuses.ts:28-30`). The ledger movement stays **pending**:
    it shows in the forecast as income still to come and in the client's "Čaká na úhradu" (awaiting
    payment) card.
  - Marking an order paid later, or setting an invoice to `approved`, never touches the ledger.
  - For a document issued in SuperFaktúra, only MCP knows it was paid.
- **Root cause.**
  - `invoiceFinanceBridge.ts` intentionally copies only identity and settlement fields (`:59-81`). Money
    belongs to the ledger, but nothing ever writes "money received" into it from the other three sources:
  - **Order → invoice paid stamp, one place only.** `OrdersView.handleCreateInvoice` (~396-410) sets the
    `fr-inv-*` movement paid when the order is paid. `ClientsView.handleCreateInvoice` (~1781-1880) is a
    copy of it **without** that step.
  - **Later order payment.** `OrderDetailView` ~1366 edits `paymentStatus` and nothing bridges it.
  - **Invoice status `won`.** Not mirrored.
  - **SuperFaktúra.** Payment state is fetched live only (`mcp_ext_intel.php` ~626-631, merged as
    `superfaktura_payment_status` ~836) and never stored. The app issues only estimates upstream
    (`PriceOffersView` `create_estimate`, ~376).
- **Evidence.** The code paths above. ClientsView never calls `setFinancialRecords` in `handleCreateInvoice`
  (its only finance writes are at ~1985 and ~2000, which are unrelated).
- **Proposed fix.**
  - **Source of truth:** the `fr-inv-<id>` movement (status / `amountReal` / `paidDate`). Readers show an
    invoice's payment from it, as `mcp_scope_invoice_docs` already does.
  - **(a)** Extract `invoiceFromOrder(order, …)` plus `markInvoiceMovementPaid(records, invoiceId, amount, date)`,
    and call both from OrdersView and ClientsView.
  - **(b)** When an order's `paymentStatus` becomes `paid` and it has `invoiceId`: settle the unsettled
    movement (`amountReal = total`, `paidDate = order.paidAt || today`). Never un-settle.
  - **(c)** When an invoice moves into a `won` status: offer "mark as paid" (open question 5), or stop
    treating `won` as settled.
  - **(d)** SuperFaktúra: a server-side pull on request (daily gate, as in #7) for external invoices whose
    movement is still open. Write `paid` / `partially_paid`, `amount_real = amount_paid`,
    `paid_date = paydate`. Idempotent: it only moves forward.
  - **Deletion / edit:** unchanged. Settled movements are already frozen (`isSettled`, `isFullyPaid`).
- **Tests.** In `invoiceFinanceBridge.test.ts`:
  - "invoice from a paid order (both entry points) → movement paid"
  - "order paid later → movement paid"
  - "settled movement is never reopened"

### #9 "Overdue" means different things to different readers (C, wrong numbers)

- **Observed symptom.** An invoice 30 days past its due date is "Čaká na úhradu" in the client detail and
  is missing from the "po splatnosti" (overdue) count. MCP calls the same invoice `overdue`. A movement
  someone once set to `overdue` by hand stays overdue after its due date is moved.
- **Root cause.**
  - `financial_records.status` includes a manual `overdue` (`schema.php` ~727, offered in the pickers at
    `FinancialManagementView` ~4556 / ~5079). Nothing sets or clears it.
  - The app counts only `status === "overdue"` (`ClientsView` ~5299, ~5316, ~5380), as does
    `agent_utils.php` (~904, ~915, ~966).
  - MCP derives it instead: `mcp_payment_status` → `$due < $today` (`mcp_ext_intel.php:374`).
- **Proposed fix.**
  - "Overdue" is not a past event to store, so derive it: one `paymentState(rec, todayIso)` in TS, mirroring
    `mcp_payment_status`, used by ClientsView, ProjectDetailsView and the finance status badge.
  - Migration `UPDATE financial_records SET status = 'pending' WHERE status = 'overdue'`, and drop it from
    the pickers. Or keep it only as a legacy synonym for `pending`.
  - If dunning is ever added, "reminder sent on X" would be a class D event of its own. None exists today.
- **Test.** "a pending movement past its due date is overdue in TS and PHP alike".

### #12 A user-deleted invoice movement comes back (C, cosmetic / missing capability)

- **Observed symptom.** The user deletes the unsettled `fr-inv-*` movement in Finance, perhaps because they
  booked the money differently. The next status change on the invoice re-creates the movement.
- **Root cause.**
  - `reconcileInvoiceMovements` (`invoiceFinanceBridge.ts:163-173`) creates a movement for every changed
    live invoice that has none. Only the hand-recorded invoice-number guard stops it.
  - Separately, MCP cancels by `UPDATE … status = 'cancelled'` (`mcp_ext_writes.php` ~519-524) while the
    app removes the row (`:156-158`).
- **Proposed fix.**
  - When the user deletes a linked movement, stamp the invoice (e.g. `ledger_detached`, or a
    `custom_fields_json` key) and skip it in reconcile.
  - Align cancellation on one representation (the app's: delete if unsettled).
  - Schema only if a column is chosen over the JSON key.

## Root cause IV: facts derived from the rows that happen to exist today (#10, #11)

### #10 Invoice numbers are re-derived, so they can be re-issued (A / D, wrong numbers, legal)

- **Observed symptom.**
  - Delete the newest invoice FA-2026-012 (already sent to the customer): the next invoice is FA-2026-012
    again.
  - An invoice issued from an order gets a random number such as FA-2026-7342. Two order invoices can
    collide, and the next MCP invoice becomes FA-2026-7343 (the series jumps).
- **Root cause.**
  - The "last number issued" is not stored. `nextDocumentNumber` (`documentNumbering.ts:5-18`) and
    `mcp_next_document_number` (`mcp_ext_writes.php:40-52`) both take max(existing) + 1.
  - `OrdersView` ~320 and `ClientsView` ~1808 use `Math.random()`.
  - `PriceOffersView` ~195 numbers only `CP-` offers.
  - `invoices_offers.document_number` has only `INDEX idx_io_doc` (`schema.php` ~811), not UNIQUE. The
    MCP path holds `GET_LOCK`, but the app paths do not.
- **Proposed fix.**
  - Add a `document_sequences(prefix, year, last_value)` row, or a `system_settings` JSON. Increment it
    server-side under `GET_LOCK('ccrm_invoice_number')`, and have the client obtain a number from an
    endpoint or from sync before saving an invoice.
  - Never decrement on delete. Use one helper for orders, clients and MCP.
  - Add `UNIQUE(document_number)` after a duplicate check in the migration. Heal pre-transaction in
    `sync.php` 4.15.
  - Backfill: last_value = current max per prefix and year, ignoring the random 4-digit outliers (open
    question 6).
- **Test.** "deleting the newest invoice does not free its number". "Two concurrent issues get distinct
  numbers" (PHP).

### #11 `category_path` goes stale (C, cosmetic)

- **Observed symptom.** After a category is renamed, project expense breakdowns and the AI summary show the
  old name. The AI's `expenseByCat` splits one category into two buckets, old path and new path.
- **Root cause.**
  - `financial_records.category_path` (`schema.php` ~723, a "pre-calculated breadcrumb") is written once at
    save (`handleSaveTransaction` path, `ClientsView` ~1962, `ProjectDetailsView` ~985).
  - Materialized movements copy it from the rule (`...rule` spread, `recurringRuleDeletion.ts:60`).
  - `FinancialCategoriesManager` only clears it on delete (~205-240), never on rename or move.
  - Readers: `ProjectDetailsView` ~744 and ~4718, `agent_utils.php` ~895-913.
- **Proposed fix.** Derive the label from `category_id` at read, as `FinancialManagementView.categoryPathLabel`
  (~1921) already does. Either drop the column from the readers or document it as "filed as at the time"
  (open question 8). No schema change.

---

## Order of work

1. **Before the materializer ships** (it is still uncommitted): #3 (pair dedupe, unique key and skip-list
   rebuild) and #5 (own-row payment). Otherwise the first run freezes existing double counts and loses
   legacy payments.
2. **#1 + #2 together** (one watermark column, 4-place rule), then **#6** (readers that describe a rule).
3. **#4** (rule-row guard) can run in parallel with step 2, once #5 is in.
4. **#7** (server-side trigger) after #1 and #3, because it relies on the watermark and the unique key.
5. **#8** and **#10** are independent of everything above and of each other. Run them in parallel.
6. **#9, #11, #12** are low severity and can be done at any time.

## Not a problem (class B)

- `invoices_offers.subtotal / vat_amount / total_price`: stored at save (`offerDraft.ts` `finalizeOffer`
  ~263-288, MCP `mcp_do_create_invoice`). PDFs print the stored figures (`DefaultOfferTemplate.tsx` 437-441,
  `CustomAiOfferTemplate.tsx` 537-541, `OfferBlockDocument.tsx` 348-353). The editor recomputes only while
  editing.
- `invoice_offer_items.total_price`: stored per line. No per-rate VAT breakdown is displayed anywhere.
- `financial_records.tax_rate` on `fr-inv-*`: a blended rate (`invoiceFinanceBridge.ts:74`), but no reader
  computes VAT from it.
- `invoices_offers.status` / `status_changed_at`: stored (client-stamped). Offer validity has no derived
  "expired" state.
- MCP `get_invoicing_metrics`: `SUM(total_price) GROUP BY type, status` over stored rows.
- `futureMovements.ts` and MCP `get_cash_flow_forecast`: future only (from tomorrow), so a preview by
  definition. `claimedRecordIds` prevents double drawing.
- `pastRecurringCharges.ts`, `aggregateOverviewTable`, the weekly and monthly trend, `mcp_fin_aggregate`:
  aggregates. For days already materialized they draw nothing (the skip list), so stored and derived never
  overlap today. Their remaining derivation of the past is covered by #1, #2 and #7 (the watermark clamp),
  not a separate defect.
- `splitRecordAmounts`, `overviewRecordDate`: pure functions of stored status, amounts and dates.
- `financialTrend.ts` bank anchors: stored in `system_settings.FINANCIAL_TREND`.
- `financial_categories` tree and level: stored. Rollups are aggregates.
- `sync.php` 4.14 (~5899-5985) and 4.15 (~6017+): persist every field, including the skip list and the
  source/occurrence columns. No derivation.
- MCP `list_recurring_movements` (`next_charge` from tomorrow) and `mcp_scope_ledger_income` (already
  filters `is_recurring = 0`).
- The invoice → movement freeze once settled (`isFullyPaid` / `isSettled`): correct by design.
- Invoice movement creation from MCP (`mcp_ext_writes.php` ~445-458): mirrors the app bridge, including the
  hand-entry guard.

## Open questions for the product owner

1. Should a recurring charge whose day arrives be stored as **paid** (today's behavior) or as **pending**
   until confirmed? This matters most for **income** rules such as client retainers, where "received" is an
   assumption.
2. When a rule with history changes its schedule, should the change apply from the next charge only (the
   proposal), or may it rewrite past payments? If the latter, the user must explicitly replace the stored
   rows.
3. When the first-payment date is moved **earlier** than existing history, should the app add the earlier
   payments, ask first, or refuse?
4. After pause then resume, is the paused period free (the proposal), or owed?
5. Should an order marked paid, an invoice set to a "won" status, or SuperFaktúra reporting payment
   **automatically** settle the ledger movement, or only offer to?
6. May an issued invoice be deleted at all, or must it be cancelled or credit-noted so its number is never
   reused? And what should happen to the random `FA-YYYY-NNNN` numbers already issued from orders?
7. Is a manual "overdue" status still wanted, or is overdue purely due date < today?
8. Should `category_path` show the category name **at the time of filing** (historic), or the live name?

---

# Part P3

# Slice 3: Employees, salaries, vacations, time tracking (incl. ticket time)

Read-only audit, 2026-11-06, branch `1.13-nectarine` at `fdc46820` (+ uncommitted foreign work in
`App.tsx` / `FinancialManagementView.tsx`, not touched). Every finding below was confirmed in `src/` or
`public/`. No QA run (nothing here needed one to confirm; all evidence is code paths).

**Headline:** time tracking itself is in good shape: duration, cost rate, cost and billable rate
are frozen on the entry at stop or save, and every rollup reads those snapshots. The problems are on
the **payroll** side: the same payroll month can be stored under two keys (data loss and double
counting), "this month is closed" is never recorded, and several past-period figures read today's
contract salary or today's leave allowance.

## Summary table

| # | Entity | What is only calculated | Class | Severity | Proposed fix | Needs schema? |
|---|---|---|---|---|---|---|
| HR-1 | `employee_salaries` | The payroll month's identity. The profile drawer stores `period_key = "M05"` (no year), and the matrix, MCP, demo and time lock use `"2026-05"`. With `UNIQUE(employee_id, period_key)` this produces duplicate months and overwritten months | C | **data loss** | Always build the key from year and month (`YYYY-MM`). Idempotent data migration rewrites `M\d\d` keys from the `year` column and merges collisions. Orphaned `fr-sal-*` rows get cleaned up | No (data migration only) |
| HR-2 | `employees.salary_amount` → past periods | The contract salary valid in a past month. Readers use today's value: salary-allocation report (loaded salary, rate, utilisation), re-price of a past month, late, imported or moved entries, and the Toggl summary's "Calculated pay" | A | wrong numbers | Report: derive the month's rate from the frozen entry snapshots (no schema). Pricing: an effective-dated salary history that `ccrm_tt_price` reads by `entry_date` | Yes (history table) for pricing; no for the report |
| HR-3 | `employee_salaries` ↔ `time_entries` lock | "Payroll month closed / entries locked". It is re-derived on every request from the live `status = 'paid'` (which a later Cena práce edit can flip back), the current `lockAfterDays`, and a key format that misses `M05` rows | D | wrong numbers (closed months reopen silently) | Record the close: `employee_salaries.closed_at` stamped once when the month first becomes paid, cleared only by an explicit admin "Reopen". The lock reads the stamp | Yes |
| HR-4 | `employee_salaries` payments | Individual payouts. `total_paid` is one cumulative number with one `payment_date`, so an advance or split payout overwrites the earlier date, and Finance `paid_date` = the last date | D | missing capability (cash-flow dates wrong) | Store payments as rows (child table, or one `fr-sal-<salId>-p<n>` movement per payment) | Yes |
| HR-5 | Server-side payroll readers (MCP, AI context) | "What the month costs" and "paid". The app uses Cena práce (`labor_cost ?? total_salary`). MCP sums or compares `total_salary`. `get_payroll_summary` filters on **current** `is_active`, so an archived employee's past payroll vanishes | C | wrong numbers | One PHP helper `ccrm_salary_due()` used by `sync.php`, `mcp_ext_writes.php`, `mcp_ext_ops.php`, `agent_utils.php`. Drop the `is_active` filter for past periods | No |
| HR-6 | `financial_records` `fr-sal-*` | The payroll auto-expense is a stored copy that both Finance and Payroll write. A salary save overwrites Finance edits and resurrects a deleted expense. Turning `auto_expense` off orphans existing copies. Re-saving an old month re-categorises it under today's category and name | C | wrong numbers (low) | Name the salary row as the source of truth. Make the `fr-sal-*` row read-only in Finance (link to the payroll month). Stop rewriting category and title on re-save | No |
| HR-7 | `employees.vacation_allowances_json` | Per-year leave entitlement. One current number per type is used for **every** year in the profile's year switcher. No carry-over. A leave type removed from settings drops its past usage | A | wrong numbers (past years) / missing capability | `employee_leave_entitlements` rows per employee × year × type (deterministic id), frozen once the year starts | Yes |
| HR-8 | `ticket_time_entries` (legacy) | Demo seed still writes ticket time into the legacy table. It is only copied into `time_entries` by a migration that runs when the schema fingerprint changes, so the hours are invisible until then | C | wrong numbers (demo only) | Demo seed writes `time_entries` directly (`demo-time-tte-*` ids). Stop writing the legacy table | No |
| HR-9 | `time_entries` billing | "These hours were billed to the client." The client PDF is generated live with today's rounding setting and today's billable flags. Nothing records what was sent, so double billing is possible | D | missing capability | `time_entries.billed_at` + `billing_ref` (or a `time_billing_exports` table), stamped on "Mark as billed" | Yes |
| HR-10 | Approvals (`time_entries`, `employee_vacations`) | Who approved and when. Submit week sets `approval_status='approved'` on one's own entries with no approver or time on the row. Moving leave from `approved` to `taken` erases `approved_by` | D | missing capability (low) | `time_entries.approved_by/approved_at`. Keep `approved_by` when the status moves to `taken` | Yes (time_entries) |

---

## Findings, grouped by root cause

### Root cause 1: the same payroll month has two identities

#### HR-1. Payroll month keyed `M05` in the profile, `2026-05` everywhere else (class C, data loss)

- **Observed symptom.**
  1. A salary month entered or edited from the employee profile disappears from the Salaries matrix (cell shows "—").
  2. Clicking that cell creates a **second** record for the same month. With auto-expense on, Finance books the month's payroll **twice**.
  3. Saving May 2025 from the profile while May 2026 exists **overwrites** the May 2026 row on the server. After the next pull, May 2026 is gone.
  4. Time entries in a month paid from the profile never lock.
- **Root cause.**
  - `src/components/employees/SalaryCellDrawer.tsx:106-109`: `activePeriodKey` is `M0${n}` / `M${n}` whenever `canChangePeriod` is true. `initialPeriodKey` (and the existing record's key) is ignored.
  - `:277`: the id becomes `sal_<emp>_M05_<year>` and `periodKey: activePeriodKey`.
  - `src/components/employees/EmployeeDetailView.tsx:2377-2381` opens the drawer with `canChangePeriod={true}` and no `periodKey`. So **every** profile save, including an edit of a matrix-made `2026-05` record, writes `M05`.
  - The matrix (`SalariesMatrixView.tsx:99-107, 144-146`), MCP (`mcp_ext_writes.php:683`, `sal-<emp>-<YYYY-MM>`), the demo seed (`demo_seed/employees.php:137`) and the time lock (`time_entries.php:161-173`, `src/utils/timeLock.ts`) all use `YYYY-MM`.
  - `public/api/schema.php:1042`: `UNIQUE KEY uk_emp_period (employee_id, period_key)`. `M05` carries no year, so May of different years collide.
  - `public/sync.php:6384-6403`: `INSERT … ON DUPLICATE KEY UPDATE` fires on the unique key as well as the PK. It rewrites the *other* year's row in place (year, items, totals and `financial_record_id`), and the client still holds both ids.
  - `sync.php:6464-6491`: each id gets its own `fr-sal-<salId>` expense, so the duplicate month books twice. In the collision case the overwritten year's `fr-sal-*` row is orphaned but stays in Finance.
  - Introduced in `b82dd9e4` (v1.11.100-Lemon).
- **Evidence (code path).**
  - Matrix click on May 2026 → record `sal_e1_2026-05_2026`, key `2026-05`.
  - Open it in the profile and save → the same id is now stored with key `M05`. The matrix lookup `${emp}_2026-05` misses it, the cell shows "—", and a click creates `sal_e1_2026-05_2026`… a second row.
  - Profile → add May 2025 → id `sal_e1_M05_2025`, key `M05` → collides with `sal_e1_M05_2026` on `uk_emp_period` → that row now says 2025.
- **Proposed fix.**
  1. `SalaryCellDrawer`: the key is always `${activeYear}-${MM}` (weekly: `${year}-W${ww}`). An existing record keeps its own key and id.
  2. **Data migration** in `ccrm_apply_migrations()`: `UPDATE employee_salaries SET period_key = CONCAT(year,'-',LPAD(period_number,2,'0')) WHERE period_key REGEXP '^M[0-9]{2}$'`. Make it idempotent (the WHERE matches nothing a second time).
     - On a collision with an existing `YYYY-MM` row of the same employee, do not overwrite. Keep the row with the higher `total_paid`, then the later `updated_at`, and log the loser to `audit_log` with its JSON.
     - Delete the loser's `fr-sal-*` only if no other salary references it.
  3. Server guard in `sync.php` 4.18: reject or normalise any incoming `periodKey` that does not match `^\d{4}-(\d{2}|W\d{2})$`.
  4. Reconcile orphans: `fr-sal-*` rows whose `id` is no salary's `financial_record_id`. List them and do not auto-delete (they may carry receipts). Ask the owner.
  - **Trigger:** the migration runs once (fingerprint-gated). **Schema:** none. **Readers to fix:** none beyond the drawer.
  - **Tests:** a drawer save from the profile keeps `YYYY-MM`. Migration: idempotent, collision is merged rather than overwritten, the second run is a no-op.
- **Severity.** data loss (overwritten month), plus wrong numbers (double payroll expense).

### Root cause 2: past periods read today's contract and today's allowance

#### HR-2. Contract salary has no history (class A, wrong numbers)

- **Observed symptom.** Raise Erik from €3,200 to €3,500 in November, then open last October in the salary-allocation report:
  - "Loaded salary" now says €3,500, and the rate column shows the November-salary rate.
  - The cost columns in the same row still use October's frozen €24.58/h. The row contradicts itself.
  - An admin "Re-price October" (offered after exactly such a change) re-prices October at **€3,500**.
  - A manual entry added in December for an October day, an entry moved from September to October, a Toggl import of last year, and the ticket-time migration are all priced at today's salary.
- **Root cause.**
  - `employees.salary_amount` is a single current value. Nothing stores which salary was valid in which month (B6 chose `Employee.salaryAmount` because an `employee_salaries` total mixes in bonuses).
  - Readers:
    - `src/utils/timeReports.ts:396-411` (`buildSalaryReport`: `computeCostRate(p.salaryAmount)`, `loadedSalary: p.salaryAmount`, utilisation from the current holiday calendar), fed by `src/components/timeTracking/TimeSalaryReport.tsx:46-57` with the current employee row, kind, salary type and user↔employee link.
    - `public/api/time_entries_lib.php:243-261` (`ccrm_tt_price` reads the current `employees.salary_amount`), called by `reprice` (`time_entries.php:692-724`), `update` when the month or owner changes (`:1107-1110`), `import` (`:639-644`) and `ticket_time_migration.php:98`.
    - `src/components/employees/EmployeeTimesheetSummary.tsx:288-295`: "Calculated pay" = hours of the viewed month × **current** hourly rate. This is shown beside, and can disagree with, the stored `employee_salaries` row for that month.
- **Evidence.** Code paths above. `timeReports.ts:6` states the choice explicitly ("Salary figures are `Employee.salaryAmount`").
- **Proposed fix.**
  1. **No schema, do first:** in the salary report, take a closed month's rate from the stored snapshots: the entries' `cost_rate`, `cost_rate_source` and `cost_rate_basis_days` (every entry of that person and month carries them). Show "loaded salary" as `cost_rate × basis hours ÷ multiplier`, or as the month's `employee_salaries` base item when present. Fall back to the current contract only for a person with no priced entry, flagged "current contract".
  2. **Schema:** `employee_salary_history (id, employee_id, valid_from DATE, kind, salary_type, salary_amount, created_at, created_by)`.
     - **Trigger:** server-side in `sync.php` 4.x employees upsert. When `salary_amount`, `salary_type` or `kind` differs from the stored row, insert a row with `valid_from = today`. Use deterministic id `esh-<empId>-<valid_from>` with upsert, so two sessions converge.
     - `ccrm_tt_price` reads the row valid on `entry_date`.
     - **Backfill:** one row per employee, `valid_from = created_at`, current values. Earlier history is unknown; say so in the UI.
     - **Deletion and edit:** rows are append-only. An admin may correct `valid_from`, with an audit log entry.
     - **4-place rule:** `schema.php` CREATE TABLE, migration, a `sync.php` pre-transaction `CREATE TABLE IF NOT EXISTS` (this is a new table that sync writes), `entities_overview.md`, `npm run sync:backend`.
     - **Readers to change:** `ccrm_tt_price`, `buildSalaryReport`, `EmployeeTimesheetSummary`. The `SalaryCellDrawer` "locked to contract" base should compare against the month's history row, not today's.
  - **Tests:** extend `timeCost` fixtures with "salary changed mid-year, re-price October → October rate". The report row uses the snapshot rate.
- **Severity.** wrong numbers.

#### HR-7. Leave entitlement is one current number for every year (class A, wrong numbers)

- **Observed symptom.** In the profile, step the year switcher back to 2025. "Used / allowance / left" uses **today's** allowance. Raise annual leave from 20 to 25 days (in SK, 5 weeks from age 33) and 2025 suddenly shows 5 more days left. Nothing carries unused days into the next year. Removing a leave type in settings drops its usage from the quota cards, although the leave rows still exist.
- **Root cause.**
  - `src/components/employees/EmployeeDetailView.tsx:302-330` (`vacationStats`): allowance = `employee.vacationAllowances[type]`, used = sum of `daysCount` of non-rejected rows starting in `calYear`. `calYear` is user-switchable (`:193, 2004, 2020`). Only types still in settings get a bucket (`:321-325`).
  - `public/api/my_employment.php:235-250` does the same for the current year.
  - `employees.vacation_allowances_json` (entities_overview §10) is a single map, and no per-year row exists.
  - A leave spanning New Year counts wholly in its start year (both readers).
- **Evidence.** Code above. The stored facts (`employee_vacations.days_count`, status) are fine; only the entitlement side is unversioned.
- **Proposed fix.**
  - Table `employee_leave_entitlements (id = 'ent-<emp>-<year>-<type>', employee_id, year, vacation_type_id, days, carried_over_days, created_at, updated_at)`.
  - **Trigger:** client effect after first sync, for sessions with `employees.vacations` edit rights, in the same shape as `materializeDueCharges`. It creates the current year's rows from the current allowance if missing, and is idempotent through the deterministic id. Server-side creation in `my_employment.php` is acceptable too.
  - **Edit:** editing the allowance in the employee form writes **this** year's row only. Past rows change only by explicit edit.
  - **Deletion:** a deleted row is re-created from the current allowance, which is acceptable because it is an entitlement and not a fact. If the owner disagrees, store a tombstone.
  - **Backfill:** one row per employee × type × year that has leave rows (a handful each). Seed with the current allowance and flag it "assumed".
  - **4-place rule** (new table written through sync): schema, migration, sync pre-transaction create, overview, `sync:backend`.
  - **Readers:** `vacationStats`, `my_employment.php` balances, MCP vacation tools. Count leave by days falling in the year, not by start year (open question).
  - **Tests:** changing the allowance leaves last year's balance unchanged. Idempotent creation. Carry-over computed from the stored previous year.
- **Severity.** wrong numbers (past years) and missing capability (carry-over).

### Root cause 3: events on the payroll month are not recorded

#### HR-3. "Payroll month closed" is re-derived on every request (class D, wrong numbers)

- **Observed symptom.**
  - Mark October paid (Vyplatené = Hrubá mzda). Time entries for October lock.
  - Weeks later type in Cena práce from the payslip (higher than gross, which is the normal case since c10e9cd2). On save the server recomputes `status = partially_paid`, and **October's time entries unlock** for the employee: they can be edited, moved and re-priced.
  - Raising `lockAfterDays` from 14 to 60 likewise unlocks every entry between 14 and 60 days old.
  - Months saved from the profile (`M05`, HR-1) never lock at all.
- **Root cause.**
  - `public/api/time_entries.php:176-187, 193-214, 245-277`: the lock is computed per request from `employee_salaries.status = 'paid'` matched against `period_key` (`ccrm_te_month_is_paid`), plus `lockAfterDays` from current settings, plus `approval_status`.
  - The same derivation runs client-side in `src/utils/timeLock.ts:82-117`.
  - `public/sync.php:6435-6443` rewrites `status` on **every** salary save from `total_paid` vs `salaryDue` (`labor_cost ?? total_salary`). So a month's paid state is not a fact; it is a formula that a later payslip edit changes. Nothing records "closed at X by Y".
- **Evidence.** Code above. `src/utils/payslip.ts:38-49` (`salaryDue`, `salaryStatus`) and the c10e9cd2 commit message: "Vyplatené is measured against Cena práce".
- **Proposed fix.**
  - Add `employee_salaries.closed_at DATETIME NULL` and `closed_by VARCHAR(100) NULL`.
  - **Trigger:** server-side in `sync.php` 4.18. When the computed status becomes `paid` and `closed_at` is NULL, stamp it. Never clear it automatically. An explicit admin action "Reopen month" clears it, with an audit log entry.
  - The lock (`ccrm_te_paid_keys`, `paidMonthsForOwner`) reads `closed_at IS NOT NULL` instead of `status = 'paid'`.
  - **Optional:** stamp `time_entries.locked_at` per entry at the same moment, so the age rule also stops depending on the current setting.
  - **Idempotency:** `closed_at` is only set when NULL, so concurrent saves converge.
  - **Backfill:** `UPDATE … SET closed_at = COALESCE(payment_date, updated_at) WHERE status = 'paid' AND closed_at IS NULL`.
  - **4-place rule:** schema CREATE TABLE, migration, **pre-transaction healing in `sync.php`** (sync writes this table), `entities_overview.md`, `sync:backend`.
  - **Readers:** `time_entries.php` lock and paid stamp, `timeLock.ts`, the MCP refusal in `mcp_ext_writes.php:687` ("already paid").
  - **Tests:** paid → Cena práce raised → still locked. Admin reopen → unlocked. Idempotent stamp.
- **Severity.** wrong numbers (a closed payroll month's labour cost can change).

#### HR-4. Salary payments are one cumulative number (class D, missing capability)

- **Observed symptom.** Pay a €500 advance on the 20th and the rest on the 10th of the next month. Vyplatené becomes €1,800 with **one** `payment_date`, and the first payment's date is gone. The Finance expense shows the whole amount paid on the last date. Since c10e9cd2, Vyplatené is measured against Cena práce, which explicitly includes money paid to insurers and the tax office on other dates. Those payouts cannot be told apart either.
- **Root cause.**
  - `employee_salaries.total_paid`, `payment_date` (`schema.php:1028, 1033`).
  - The drawer has one `paidText` and one `paymentDate` (`SalaryCellDrawer.tsx:187-205, 290`).
  - `sync.php:6459-6461` sets the expense's `paid_date` to the last date.
- **Proposed fix.**
  - Payments as rows: `employee_salary_payments (id, salary_id, paid_on, amount, payee ENUM('employee','insurers','tax','other'), method, note)`. `total_paid` becomes a derived aggregate over them (or stays a cached sum written in the same transaction).
  - Finance: one movement per payment with deterministic id `fr-sal-<salId>-<paymentId>`, replacing the single `fr-sal-<salId>`. **Double counting:** the old single row must be retired in the same migration.
  - **Backfill:** one payment per existing row, `amount = total_paid`, `paid_on = payment_date`.
  - **Deletion:** deleting a payment deletes its movement. A deleted movement must not come back (tombstone list on the salary, as with `recurringSkippedDates`).
  - **4-place rule** applies (new table through sync).
- **Severity.** missing capability (cash-flow dates and audit of payouts).

#### HR-10. Approvals without an approver (class D, low)

- **Observed symptom.** With weekly approval on, an employee presses "Submit week" and their own entries become `approved`, which means locked. The row shows no approver and no time. A leave request moved from `approved` to `taken` loses who approved it.
- **Root cause.**
  - `public/api/time_entries.php:1157-1189`: `submit_week` sets `approval_status='approved'` for the caller's own week. Only `audit_log` records it.
  - `public/sync.php:6545-6555`: `approved_by` is kept only while status ∈ {approved, rejected} and is nulled for `taken`.
- **Proposed fix.**
  - `time_entries.approved_by`, `approved_at`. `time_entries` is not written by `sync.php`, so only schema + migration + overview are needed (no sync healing).
  - Decide whether "submitted" and "approved" are distinct states (open question).
  - In `sync.php`, keep the stored `approved_by` when moving approved → taken.
- **Severity.** missing capability.

#### HR-9. No "billed" fact on time entries (class D, missing capability)

- **Observed symptom.** Export the client PDF for October and send it. Later someone edits an unlocked October entry, or changes rounding from 15 min to 30 min. The same export now shows different hours, and nothing says the earlier version was billed, nor prevents billing those hours again in November's export.
- **Root cause.**
  - `src/components/timeTracking/TimeReportsView.tsx:121-150` and `src/utils/timeReports.ts:80-86, 141-150` build the PDF from live entries with `settings.rounding` (C13: "Rounding applies only in reports and client PDFs").
  - `time_entries` has no billed or invoice column (`schema.php:1268-1310`).
- **Proposed fix.** `time_entries.billed_at DATETIME NULL`, `billing_ref VARCHAR(100) NULL` (invoice id or export id), and `billed_seconds INT NULL` (the rounded value actually billed).
  - **Trigger:** an explicit "Mark as billed" on export (or on creating an invoice from time). Billed entries lock like approved ones, and the export excludes billed rows by default.
  - **Schema:** schema + migration + overview (no sync healing; `time_entries` is endpoint-only).
- **Severity.** missing capability. This is the owner's call (open question 4).

### Root cause 4: two writers, two definitions

#### HR-5. MCP and AI readers disagree with the app on "due" and "paid" (class C, wrong numbers)

- **Observed symptom.**
  - The MCP `get_payroll_summary` for 2026 shows planned payroll = gross while the app shows Cena práce.
  - It **omits every past month of an employee archived today** (`WHERE e.is_active = 1`), and groups `M05` and `2026-05` as separate periods.
  - MCP `record_salary_payout` on a month with Cena práce stores `status='paid'` once Vyplatené reaches the *gross*. That locks the month's time entries (HR-3) while the app shows "partially paid". It also resets the Finance expense's planned amount to the gross.
  - The AI context block (`agent_utils.php`) reports only `total_salary`.
- **Root cause.**
  - `public/api/mcp_ext_ops.php:586-590`: `SUM(total_salary)`, `e.is_active = 1`.
  - `public/api/mcp_ext_writes.php:699, 712-716`: status and `amount_planned` against `$totalSalary`, ignoring `labor_cost`.
  - `public/api/agent_utils.php:1367-1379`.
  - The app's definition is `src/utils/payslip.ts:38-42` and the PHP copy is inline at `sync.php:6433`.
- **Proposed fix.**
  - `ccrm_salary_due(array $row): float` (`labor_cost ?? total_salary`) in a shared PHP lib, used by `sync.php`, `mcp_ext_writes.php`, `mcp_ext_ops.php` and `agent_utils.php`.
  - The past-period summary filters by period, never by current `is_active`. The "nominal" figure may keep it.
  - **Tests:** a PHP parity test against the `payslip.test.ts` cases.
- **Severity.** wrong numbers.

#### HR-6. The payroll auto-expense is an editable copy (class C, low)

- **Observed symptom.**
  - Edit the "Salary: Erik (2026-10)" expense in Finance (category or amount) and the next save of the payroll month silently reverts it.
  - Delete it, and it comes back.
  - Switch the employee's auto-expense off: existing expenses stay and stop following the payroll.
  - Re-save an old month after renaming the employee or changing their expense category: the old expense moves to today's category and name.
- **Root cause.** `public/sync.php:6406-6420, 6464-6491`: `ON DUPLICATE KEY UPDATE` overwrites title, description, category, amounts, status and dates whenever the salary row is in the payload. Finance treats `fr-sal-*` as an ordinary movement (`read_scope.php:444-446` only renames it for privacy).
- **Proposed fix.**
  - The salary row is the source of truth. In Finance, render `fr-sal-*` read-only with "Edit in Payroll →".
  - Category and title are set on **create** only. Amounts, status and dates follow on update.
  - Turning auto-expense off asks: keep the existing expenses (frozen) or remove them.
  - No schema.
- **Severity.** wrong numbers (low).

#### HR-8. Demo ticket time is written to the legacy table (class C, demo only)

- **Observed symptom.** After a demo reseed, tickets show 0 tracked hours. After the next deploy that changes `schema.php`, the hours appear, with random ids.
- **Root cause.**
  - `public/api/demo_seed/tickets.php:104-107, 159-170` inserts into `ticket_time_entries`.
  - The sync GET reads only `time_entries` (`sync.php:2504-2513`).
  - The copy runs only inside `ccrm_apply_schema()` when the fingerprint changes (`schema.php:2088-2089, 3431`), with `ccrm_tt_new_id()` ids (`ticket_time_migration.php:102`).
  - Leaving demo mode truncates both tables (`demo_seed/leave.php:46-47`), so nothing leaks into real data.
- **Proposed fix.** The demo seed inserts `time_entries` (`source='ticket_legacy'` or `manual`, id `demo-time-tte-<n>`, priced with `ccrm_tt_price`). Stop writing `ticket_time_entries`. Probably overlaps with the demo-mode slice.
- **Severity.** wrong numbers (demo only).

---

## Order of work

1. **HR-1** first: data loss, no schema, small change plus a careful data migration. Do it before anything else touches salaries.
2. **HR-5** next: same files (`sync.php` 4.18, MCP), no schema. Run it sequentially after HR-1.
3. **HR-3**: schema on `employee_salaries`, so it needs the 4-place rule. It depends on HR-1 (key format) and HR-5 (shared helper).
4. In parallel with 1–3 (different files):
   - **HR-2 step 1** (`timeReports.ts` / `TimeSalaryReport.tsx`, snapshot-based report)
   - **HR-8** (demo seed)
   - **HR-6** (Finance read-only rendering)
5. After the owner answers the open questions: **HR-2 step 2** (salary history), **HR-7**, **HR-4**, **HR-9**, **HR-10**.

## Not a problem (class B)

- **`time_entries` duration, cost, cost rate, billable rate.** Frozen on the row at stop or save: `time_entries.php:766-767, 848-850, 1007-1016`. Update keeps the frozen rate unless the owner or month changes (`:1105-1121`). The basis days are stored for the explanation tooltip.
- **Team matrix cost cells.** Sum of stored `cost` (`timeTeam.ts:330-350`), with per-cell tooltips from the frozen snapshot (`frozenCostRate`). The row's "rate" is explicitly today's rate.
- **Project "Labour (time tracking)".** SQL `SUM(cost)` over stored entries (`time_entries.php:305-342`, `ProjectDetailsView.tsx:711-732`). It is not a financial record, so it is not double counted with `fr-sal-*` (C7.5).
- **Task, ticket and per-person totals; retainer `usage`.** SQL aggregates over stored entries (`time_entries.php:305-405`). Past-period overage depends on the contract's current hours, which belongs to the support-contracts slice.
- **`tickets.loggedMinutes`.** Derived total from `time_entries` for old clients (`sync.php:2504-2513`).
- **Reports Summary/Detailed and CSV.** Views over stored rows. Rounding is display-only; the billing aspect is HR-9.
- **Salaries matrix totals.** Only stored rows are summed. No month is synthesised from the contract (`SalariesMatrixView.tsx:99-141`).
- **Salary status, "due", Odvody.** Arithmetic over stored hand-typed values (`payslip.ts`). `sync.php` re-stores `status` on write. The closed fact is HR-3.
- **`employee_salaries.due_date`.** Computed once at write and stored (`sync.php:6446-6454`).
- **Employee list "monthly payroll".** A current-state nominal KPI from current contracts (`EmployeeListView.tsx:103-110`).
- **`employee_vacations.days_count`, `approved_by`.** Stored. `approved_by` is server-stamped on the transition (`sync.php:6545-6555`); the `taken` caveat is HR-10.
- **"On leave today", Team-matrix vacation cells.** Current state over stored rows.
- **Ticket-time migration.** Idempotent through `external_id = tte:<id>` (`ticket_time_migration.php:62-77`). Incoming blob `timeEntries` are ignored (`sync.php:7071`).
- **`time_activity` / Unsorted.** Personal and purged by design (C12).

## Open questions for the product owner

1. **B6 revisited.** Should a past month's labour cost use the salary valid *in that month* (needs a salary history, HR-2) or keep using today's contract salary? Re-price currently means "re-price at today's salary".
2. **Closing a payroll month (HR-3).** Is "paid in full once" the moment a month closes, or should closing be an explicit button? Who may reopen it?
3. **Split payouts (HR-4).** Do you record advances, or payments to insurers and the tax office separately, with their own dates? If yes, Finance gets one movement per payment.
4. **Billing time (HR-9).** Do you bill clients from tracked hours? If yes, should a billed entry lock, and should the billed (rounded) hours be stored?
5. **Leave entitlement (HR-7).** Do unused days carry over (and expire, e.g. by 30 June)? Should leave across New Year count per day in each year?
6. **Weekly approval (HR-10).** Is "Submit week" meant to be self-approval, or should a manager approve?
7. **HR-1 collisions.** When the migration finds both `M05` and `2026-05` for one employee, which wins: the higher Vyplatené, or the newer edit? Orphaned `fr-sal-*` expenses: delete or keep?

## Side note (outside this audit's class, not verified further)

`autoStopAt` (default `23:59`) is normalised in `time_entries_lib.php:81-82`, but no code stops a running timer. `time_entries.php` says "a timer left running is stopped by the cron", and `public/api/cron.php` has no time-entry code.

---

# Part P4

# Slice 4: Warehouse (section 8), Support/Tickets (section 11 minus ticket_time_entries), Licensing

Read-only audit. Every finding below is confirmed in `src/` or `public/` (file:line). Paths are relative to the repo root.

## Summary

| # | Entity | What is only calculated / not stored once | Class | Severity | Proposed fix | Needs schema? |
|---|---|---|---|---|---|---|
| W1 | warehouse_stock vs warehouse_movements | On-hand is stored twice (stock table + movement ledger), written separately by every handler, never reconciled. Four code paths make them drift apart by construction | C | wrong numbers | The ledger is the source of truth. The server applies each confirmed movement's delta to `warehouse_stock` exactly once (keyed by movement id). The client stops sending absolute quantities | yes (1 col, `warehouse_movements.stock_applied_at`) |
| W2 | warehouse_stock (sync) | Stock rows have no `id`, so every push from a warehouse editor re-sends the whole stock table as absolute numbers. That overwrites concurrent changes (MCP, other tabs) | C | wrong numbers (stock levels revert silently) | Stop accepting `quantity` from the client (W1). At minimum, give rows a synthetic id `wh:item` so the diff only sends changed rows | no (if W1 is done) |
| W3 | orders / order_items -> warehouse_movements | Order fulfilment writes a confirmed outward movement but changes no stock and writes no `fulfilled_quantity`. It can also be repeated | D + C | wrong numbers | Deterministic movement id per order, write `order_items.fulfilled_quantity`, apply stock via W1, take cost from WAP | no (column exists) |
| W4 | warehouse_batches vs warehouse_stock | Batch `current_quantity` is a third copy of on-hand. Transfers, unbatched issues and MCP never touch it. Receipt lines point at batch ids that do not exist | C | wrong numbers | Maintain batch quantity from movement lines (same server step as W1). Fix the batch-id link | no |
| W5 | warehouse_items.avg_purchase_price (WAP) | The running WAP is stored with no history and recomputed client-side from a stale snapshot. It can disagree with the ledger it should follow | C | wrong numbers | Compute WAP server-side in the same transaction as W1. Store `wap_after` on the movement line | optional (1 col) |
| S1 | support_contracts + projects.ticket_widget_config_json.retainer | Contract terms are stored twice, edited in place, and deleted when the retainer is switched off. The UI and the server pick different contracts and different period windows | C | wrong numbers | One source (`support_contracts`). A change of terms or a renewal makes a new row with `valid_from/valid_until`. One shared period function | yes (`reset_day`, `overage_rate`) |
| S2 | retainer periods | Usage/overage exists only for the current period and is computed live. At reset it disappears, and editing the allowance rewrites days that already happened | A | missing capability (-> lost billing figure) | Materialise one closed-period row per contract per period, deterministic id `scp-<contractId>-<periodStart>` | yes (new table) |
| S3 | tickets.resolve_due_at | The resolution SLA due date of tickets created in the Tickets view is computed and shown, then dropped by sync (key mismatch). After a reload it is gone | A | data loss | Fix the key mapping (client sends `slaResolutionDueAt`, server also accepts `resolutionDueAt`). Backfill from created_at + priority target | no |
| S4 | tickets SLA outcome | Breach is never recorded, and every closed ticket shows "SLA OK". Pause time is never accumulated, so a paused ticket breaches the moment it resumes | D | wrong numbers | Store breach/met at the transition (`first_response_breached`, `resolve_breached`). Write `sla_paused_at` / `sla_paused_seconds` on status changes and shift due dates | yes (2 cols) |
| S5 | tickets (auto-resolve) | Auto-resolve from linked tasks changes the status without writing a `ticket_messages` system event | D | missing capability | Insert a system message in the same statement block, deterministic id `tmsg-auto-<ticketId>-<taskId>` | no |

Counts: A 2, C 6, D 3. W3 is counted as both D and C but listed once. Licensing is class B.

---

## Root cause 1: on-hand quantity has three stored copies and no single writer (W1, W2, W4, W5, W3)

### W1. The stock table and the movement ledger are separate truths that drift apart (class C)

**Observed symptom.** On the product card, "Physical stock" (from `warehouse_stock`) and the movement history (from `warehouse_movements`) can disagree. Examples:
- A goods issue of 10 against 5 on hand leaves stock at 0, while the ledger says 10 left.
- A fulfilled order shows a VYD document, but stock never went down.
- An MCP "adjustment" cannot be read back as + or -.

**Root cause.** Every client handler appends a movement **and** separately rewrites the absolute stock row. The server stores both as sent and never cross-checks them:
- Receipt: `src/components/WarehouseView.tsx:1530` (movement) and `:1551-1568` (stock `quantity + newQty`).
- Quick purchase: `WarehouseView.tsx:1022` and `:1035-1052`.
- Quick sale: `WarehouseView.tsx:1144` and `:1146-1149` (`Math.max(0, ...)`).
- Goods issue: `WarehouseView.tsx:1809` and `:1813-1816` (`Math.max(0, ...)`). Before that, `:1747-1754` explicitly **allows** issuing more than is available ("Do you want to proceed with dispatch?"). Because of the clamp, the ledger and the stock differ by the over-issued amount forever.
- Transfer: `WarehouseView.tsx:1936` and `:1941-1963`.
- Order fulfilment (OrdersView / ClientsView) writes only the movement, no stock (see W3).
- MCP `adjust_stock`: `public/api/mcp_ext_writes.php:593` sets `$qty = abs($change)`, and `:644-647` stores that unsigned quantity on an `adjustment` movement line. Only the free-text note says why. The ledger cannot reproduce a negative adjustment. The UI also labels any `adjustment` as "PRE (Prevod)" (`WarehouseView.tsx:4241`), i.e. as a transfer.
- Server write: `public/sync.php:5724-5741` upserts `quantity` as sent, and `:5777-5833` upserts movements. Neither looks at the other.

**Evidence.** The code paths above. To reproduce: take an item with 5 on hand, make a goods issue of 10 and confirm the notice. The movement line quantity is 10 (`:1776`) and stock is 0 (`:1815`). SUM(ledger) = -5, stock = 0.

**Proposed fix.**
- **Source of truth:** the movement ledger (`warehouse_movements` + `warehouse_movement_items`). `warehouse_stock.quantity` becomes a cache that the server maintains.
- **Trigger:** server-side, in `sync.php` section 4.12 and in `mcp_do_adjust_stock`. When a movement with `status = 'confirmed'` is seen for the first time (the `INSERT`, not the `ON DUPLICATE KEY UPDATE` branch), apply `quantity = quantity +/- line.quantity` per line and per warehouse. A transfer subtracts at the source and adds at the target. The MCP path already does a relative `quantity = quantity + VALUES(quantity)` (`mcp_ext_writes.php:632-635`), so the pattern already exists.
- **Idempotency:** add `warehouse_movements.stock_applied_at DATETIME NULL`. Apply only `WHERE id = ? AND stock_applied_at IS NULL`, inside the sync transaction. Two tabs pushing the same movement converge because the movement id is the key. Client movement ids are `mov-${Date.now()}`, which is fine as a key. MCP uses random hex.
- **Signed quantities:** store adjustment lines with a sign (or add a `direction` column), so the ledger alone can reproduce stock.
- **Over-issue:** decide whether negative stock is allowed (open question 1). Either way, stop clamping silently.
- **Deletion / cancel:** today there is no UI to delete or cancel a movement. If one is added, cancelling must post a reversing movement (deterministic id `mov-rev-<id>`) and never edit stock directly.
- **Edit semantics:** the `ON DUPLICATE KEY UPDATE` branch for movement items (`sync.php:5788`, `delMovItems` at `:5806`) lets a client rewrite the lines of a confirmed movement. Once `stock_applied_at` is set, the lines should be frozen, or an edit must post the delta.
- **Backfill:** for each (warehouse, item), compute `stock - SUM(ledger)`. For every non-zero pair, post one opening/correction adjustment movement with deterministic id `mov-open-<warehouseId>-<itemId>` and `stock_applied_at = NOW()`, so it is not applied again. That is at most #warehouses x #items rows, typically hundreds.
- **Schema:** `stock_applied_at` follows the 4-place rule: CREATE TABLE in schema.php, `ccrm_apply_migrations()`, pre-transaction healing in `sync.php` above `beginTransaction()` at `:3312`, `entities_overview.md`, then `npm run sync:backend`.
- **Readers that must stop deriving or writing:** every `setWarehouseStock` in `WarehouseView.tsx` listed above becomes optimistic-only or is removed, and `warehouseStock` leaves the push payload (`src/App.tsx:1436`, `:1534`). Server readers that already read `warehouse_stock` keep working: `agent_utils.php:1022/1057`, `universal_search.php:438`, `mcp.php:2278/2299`, `mcp_ext_ops.php:494`.
- **Tests:**
  - a unit test for a pure `applyMovementToStock(stock, movement)` covering receipt, issue, transfer and adjustment +/-;
  - a PHP test: pushing the same movement twice moves stock once;
  - a reconciliation check after backfill: `SUM(ledger) == stock`.

**Severity.** Wrong numbers: the user orders and sells against this stock level.

### W2. Every push re-sends the whole stock table as absolute numbers (class C, lost update)

**Observed symptom.** A stock change made through MCP or in another browser is silently reverted the next time any warehouse editor saves anything (even a lead edit), if that editor's tab has not pulled the change yet.

**Root cause.**
- `public/sync.php:1955-1961` returns stock rows **without an `id`**. The table has a composite PK (`schema.php:614-623`).
- `src/utils/syncDiff.ts:25-30` (`baselineOf`) skips records without an id, and `syncDiff.ts:56-66` (`diffRecords`) **always sends** them.
- `src/App.tsx:1436` always puts `warehouseStock` in the payload. The narrowing at `:1534` keeps every row, because none of them has an id.
- `public/sync.php:5725` upserts `quantity = VALUES(quantity)` with no `ccrm_write_would_clobber` check. The table has no `updated_at` to check against.
- Compare `mcp_ext_writes.php:598-635`, which does a correct locked relative update. The next browser push then overwrites it.

**Evidence.**
1. Tab A loads: stock X = 10.
2. MCP `adjust_stock` -5: DB holds 5.
3. Tab A edits a lead: the push carries all stock rows, and the DB is back to X = 10.

The same happens when two browsers each do a receipt between polls.

**Proposed fix.** Preferred: W1, where the client never sends `quantity` and the server owns it. If W1 has to wait, a stop-gap: emit a synthetic `id: "<warehouseId>:<itemId>"` on read, so the delta diff only sends rows the tab actually changed, and send a delta (`quantityDelta`) instead of an absolute value.

Batches (`warehouse_batches.current_quantity`, `sync.php:5748`) and item WAP (`sync.php:5690`) do have ids, so they are only sent when changed. They are still absolute, though: for concurrent edits of the same row the last writer wins. W4 and W5 cover them.

**Tests:**
- a `syncDiff` unit test: an unchanged stock row is not re-sent;
- a PHP test: a push without stock leaves an MCP adjustment intact.

**Severity.** Wrong numbers. Stock reverts silently, so the stock figure in effect loses recorded receipts and issues while the ledger keeps them.

### W3. Order fulfilment is not recorded on the order and does not move stock (class D + C)

**Observed symptom.** "Fulfil with warehouse delivery note" can be clicked any number of times for the same order, and each click creates another VYD document. Stock never goes down. Margin KPIs count the sale with zero cost.

**Root cause.**
- `src/components/OrdersView.tsx:250-287` and its duplicate `src/components/ClientsView.tsx:1740-1777` build an outward movement with:
  - `id: mov_${Date.now()}`;
  - a **random** document number `VYD-<year>-<random 4 digits>`. It can collide with the sequential numbers from `nextDocumentNumber`, and the column is UNIQUE (`schema.php:643`);
  - `totalCostValue: 0`, `unitPurchasePrice: 0`, `totalProfitValue: 0`;
  - no `setWarehouseStock` and no batch update.
- `order_items.fulfilled_quantity` exists (`schema.php:1143`, synced at `sync.php:2354` / `:6783`), but it is only ever initialised to 0 (`src/components/OrderDetailView.tsx:363`). Nothing writes it. The button is never disabled based on it (`OrdersView.tsx:1045-1053`, `OrderDetailView.tsx:614-617`).
- `itemId: item.itemId || item.id` falls back to the **order line id** for a product that is not from the catalog. `warehouse_movement_items.item_id` is a `FOREIGN KEY ... ON DELETE RESTRICT` to `warehouse_items` (`schema.php:680`), and `$insMovItem->execute` at `sync.php:5809` has no try/catch. So the whole push rolls back (`sync.php:7158`).
- Readers that then disagree: monthly outward/profit in `WarehouseView.tsx:585-592` and `mcp_ext_ops.php:506` count the sale but with cost 0 and profit 0.

**Proposed fix.** Treat fulfilment as an event on the order:
- Deterministic movement id `mov-ord-<orderId>-<seq>`.
- Write `fulfilledQuantity` per line in the same action.
- Disable the button, or warn, when everything is fulfilled.
- Quantity per line = `quantity - fulfilledQuantity`, which also supports partial fulfilment.
- Stock and batches go through W1/W4. Cost comes from the current WAP, as in the goods-issue handler (`WarehouseView.tsx:1766`).
- Take the document number from `nextDocumentNumber`, or let the server assign it as MCP does with `mcp_next_document_number`.
- Skip lines without a catalog `itemId` instead of falling back to the line id.
- Merge the two copies of the handler into one util, with a unit test: it stores once, a second click issues nothing, and a partial fulfilment issues the remainder.

Backfill, best effort: for existing orders, set `fulfilled_quantity` from the movements whose note is `... : <orderNumber>`. That note is the only link today. No schema change.

Note: the `orders` table is not in `entities_overview.md`. Whoever owns orders should be told.

**Severity.** Wrong numbers (stock, margin). The same order can be issued twice.

### W4. Batch quantities are a third copy that nobody keeps in step (class C)

**Observed symptom.** The batch/expiry list (FEFO) shows quantities that are no longer in the warehouse, or that sit in the wrong warehouse. As a result, "expired stock" alerts and batch pickers over-state what is there.

**Root cause.**
- A transfer moves stock but not batches: `WarehouseView.tsx:1866-1966` has no `setWarehouseBatches`.
- Goods issue and quick sale decrement a batch only if the user picked one (`:1819-1824`, `:1151-1156`). Otherwise the item's stock goes down and every batch stays full.
- MCP `adjust_stock` (`mcp_ext_writes.php:567-663`) never touches `warehouse_batches`.
- The receipt link is broken:
  - The movement line gets `batchId: bat-${Date.now()}-${idx}` (`WarehouseView.tsx:1498`), but the batch is created with `id: bat-${Date.now()}-${v.itemId}` (`:1572`).
  - The batch is created only when both number **and** expiry are filled (`:1569`), but the line gets a batch id when only the number is filled.
  - Quick purchase has the mirror case (`:992` vs `:1052-1056`): the batch is created with only an expiry, and the line has `batchId: null`.
- The server stores `current_quantity` as sent (`sync.php:5748-5761`).

**Proposed fix.** Make batch quantity follow the ledger:
- For `has_expiration` items, a movement line must name a batch. A receipt creates the batch with id = the line's `batchId`.
- The server step from W1 also applies the delta to `warehouse_batches.current_quantity`.
- A transfer creates or increases a batch row in the target warehouse with the same `batch_number`.

Backfill: per item and warehouse, if SUM(batches) > stock, report it rather than auto-fix. FEFO could pick which batch to reduce, but that is a product owner decision.

Tests:
- a transfer moves the batch quantity;
- an unbatched issue on a batch-tracked item is rejected or FEFO-assigned.

**Severity.** Wrong numbers.

### W5. The weighted average purchase price is a stored running value with no history (class C)

**Observed symptom.** Inventory valuation (`stock x WAP`) and the cost booked on each goods issue use a WAP that can be wrong and that cannot be audited or rebuilt.

**Root cause.**
- Multi-line receipt: inside `validItems.forEach`, the code reads `item` from the pre-receipt `warehouseItems` and `totalOnHand` from the pre-receipt memo (`WarehouseView.tsx:1536-1548`). Two lines of the same item therefore each compute WAP from the old state, and the last `setWarehouseItems` wins. Stock adds both lines, but WAP misses the first one.
- The client pushes WAP as an absolute value (`sync.php:5690`). A concurrent MCP receipt's WAP update (`mcp_ext_writes.php:614-617`) is lost the next time the tab saves that item.
- MCP rounds WAP to 2 decimals (`mcp_ext_writes.php:617`), while the column is `DECIMAL(12,4)` (entities_overview) and the client does not round. Two writers, two precisions.
- WAP history exists nowhere. Movement lines store `unit_purchase_price` for receipts and the WAP used for issues, so the ledger could rebuild it, but nothing does.

**Proposed fix.**
- Compute WAP on the server in the same step as W1 (inward lines only, in ledger order).
- Store `wap_after DECIMAL(15,4)` on the inward movement line (schema, 4-place rule). That makes valuation at any date answerable and edits traceable.
- The client stops writing `avgPurchasePrice` once stock exists. It already refuses typed edits (`WarehouseView.tsx:1219-1223`).

Backfill: replay the inward lines per item to fill `wap_after`. Compare the result with the current `avg_purchase_price` and log the differences.

Test: two lines of the same item in one receipt give the same WAP as two separate receipts.

**Severity.** Wrong numbers (valuation, issue cost, margin).

---

## Root cause 2: support contract terms are overwritten in place and read differently (S1, S2)

### S1. Contract terms are stored twice, edited in place, and two readers disagree (class C)

**Observed symptom.**
- The retainer card on a project shows one allowance and overage. The rate frozen on time entries is decided from another contract, another allowance and another month window.
- A contract created from the Tickets view loses its hours and rate on reload.
- Switching a retainer off deletes the contract.

**Root cause.**
- Two stored copies:
  - `ProjectTicketsPanel.tsx:155-161` writes `projects.ticket_widget_config_json.retainer`.
  - `:163-199` writes or overwrites a `support_contracts` row with the fixed id `sc-<projectId>`. It edits in place with no `valid_from`/`valid_until`, and it **removes the row** when the retainer is disabled (`:166-169`).
- The same panel sets `hourlyRate = hourlyOverageRate = overageRate` (`:183-185`). So the server's in-allowance rate equals the overage rate, and the threshold in `time_entries_lib.php:328-337` has no effect.
- The UI reader, `resolveProjectRetainer` (`src/utils/tickets.ts:652-700`):
  - prefers the project JSON, then the first contract for the project with `isActive !== false`;
  - but `sync.php:2459` hardcodes `'isActive' => true` and ignores `valid_until`;
  - uses the reset-day cycle as its period window (`tickets.ts:614-650`).
- The server reader, `ccrm_tt_lookup_billable_rate` (`public/api/time_entries_lib.php:305-337`):
  - takes `support_contracts.monthly_hours/hourly_rate` from the row with the newest `valid_until`, **not** the contract valid on the entry date;
  - takes the overage rate from the project JSON;
  - uses a **calendar month** window (`:328-330`).
- A contract created in the Tickets view (`src/components/TicketsView.tsx:1242-1256`) sends `monthlyHoursIncluded` / `overageRate`. `sync.php:6840-6852` reads `monthlyHours` (default **10**) and `hourlyRate`/`hourlyOverageRate` (default **0**). After a reload, `resolveProjectRetainer` gets `overageRate ?? hourlyOverageRate` = 0.
- `resetDay`, `overageRate` and `currency` are not columns at all. `support_contracts` keeps only `monthly_hours` and `hourly_rate`.

**Evidence.** Take reset day 15 and a 10 h allowance. On the 20th, the card counts hours since the 15th, while the server freezes rates counting hours since the 1st. Code paths above.

**Proposed fix.**
- One source of truth: `support_contracts`. Add `reset_day` and `overage_rate` (4-place rule). The project JSON keeps only widget presentation.
- A change of terms after a period with entries has started creates a new contract row: `valid_from` = the next period start, and the previous row gets `valid_until`.
- Disabling a retainer sets `valid_until` and never deletes.
- One period function (reset-day window), implemented in TS and in PHP, with a shared test table.
- The server rate lookup filters `valid_from <= entry_date <= COALESCE(valid_until, entry_date)`.
- Fix the Tickets-view key mapping.

Readers to change: `resolveProjectRetainer`, `ccrm_tt_lookup_billable_rate`, `ProjectTicketsPanel.handleUpdateRetainer`, `TicketsView.handleCreateContract`.

Backfill: contracts without `valid_from` get their `created_at` date. `reset_day` comes from the project JSON where present.

Tests:
- the same set of entries gives the same used/overage minutes in TS and in PHP;
- a renewal mid-year keeps old entries on the old rate.

**Severity.** Wrong numbers (billing).

### S2. Closed retainer periods are not rows (class A)

**Observed symptom.**
- On reset day, the "overage" figure on the project card drops to 0, and the previous period's usage/overage is no longer visible anywhere.
- Lowering the allowance on day 20 changes the overage already accrued on days 1-19.

**Root cause.** `computeProjectRetainerUsage` (`src/utils/tickets.ts:749-833`) is only ever called with `new Date()` (`ProjectTicketsPanel.tsx:128-134`, `TicketsView.tsx:2233-2239`) and uses the live contract terms (S1). There is no table of periods and no "overage invoiced" link.

**The spec's test.** If the allowance or reset day changes tomorrow, the overage shown for days that already passed changes, and at reset the figure disappears. The time entries remain, so used minutes can be summed again. But the terms that applied are overwritten (S1), so the past overage cannot be reproduced reliably.

**Proposed fix.**
- **Table:** `support_contract_periods` with `id`, `contract_id`, `period_start`, `period_end`, `allowance_minutes`, `used_minutes`, `overage_minutes`, `overage_rate`, `currency`, `invoice_id` (NULL), `closed_at`.
- **Id and idempotency:** deterministic id `scp-<contractId>-<periodStart>` with `INSERT IGNORE`, so two sessions converge.
- **Trigger:** server-side on request is the cheapest, since the retainer maths already runs in `time_entries.php:376`. Alternatively, a client effect like `materializeDueCharges` for sessions with ticket edit rights, plus a timer for a tab left open across reset day.
- **What is stored:** only **closed** periods. The current period stays derived (class B).
- **Deletion:** a deleted period row stays deleted only if a tombstone is kept. Simpler: users cannot delete periods, only "void" them.
- **Edit:** later changes of terms never touch closed rows.
- **Backfill:** periods are monthly, so at most 12 rows per contract per year, going back to `valid_from` or the first billable entry. Cap at e.g. 36.
- **Readers:** a "Past periods" list. Future overage invoicing reads `overage_minutes` from the row.
- **Schema:** a new table: CREATE TABLE in schema.php, a migration, sync read/write only if the client edits it, and `entities_overview.md`.
- **Tests:** closing a period stores it once, is idempotent, and a later allowance change does not alter it.

**Severity.** Missing capability today: there is no past-period view and no invoicing flow. It becomes data loss as soon as overage is billed from the card.

---

## Root cause 3: ticket SLA facts are lost or only implied (S3, S4, S5)

### S3. The resolution due date is dropped for tickets created in the Tickets view (class A, data loss)

**Observed symptom.** A new manual ticket shows a resolution SLA countdown. After a reload, once the first response is in, its SLA shows "—".

**Root cause.**
- `src/components/TicketsView.tsx:750-754` computes `{ firstResponseDueAt, resolutionDueAt }` and puts them on the ticket under those names (`:786-787`).
- `public/sync.php:6962-6964` reads `slaFirstResponseDueAt || firstResponseDueAt`, which works, but `slaResolutionDueAt || resolveDueAt`, with no `resolutionDueAt`. So `resolve_due_at` is stored as NULL.
- The read side (`sync.php:2556-2557`) returns `slaResolutionDueAt` / `resolveDueAt`. `evaluateTicketSla` reads `slaResolutionDueAt || resolutionDueAt` (`src/utils/tickets.ts:530`).
- `ProjectTicketsPanel.tsx:300-303` sets both names and is not affected.

Related: the two creation paths store different due dates for the same ticket.
- The client path never applies the contract's SLA. `computeTicketSlaDueDates` reads `contract.slaFirstResponseMins` (`tickets.ts:412`), a field the sync never returns. `TicketsView` also passes no contract, although the form picks `newContractId`.
- The server paths do apply it (`public/api/tickets.php:100-125`, `ticket_widget.php:331-337`).

**Proposed fix.**
- The server accepts `resolutionDueAt` as a third alias, and the client sets `slaResolutionDueAt`.
- Apply the contract's per-priority hours in `computeTicketSlaDueDates` (use `slaResponse<Priority>Hours` / `slaResolve<Priority>Hours` from the synced contract), so both writers agree.
- Backfill: `UPDATE tickets SET resolve_due_at = created_at + <priority target>` where it is NULL and the ticket was created manually (`source = 'manual'`). The target comes from `TICKET_SETTINGS` or the contract.
- Test: a ticket round-tripped through the sync mapping keeps `resolve_due_at`.
- No schema change.

**Severity.** Data loss: the SLA commitment for the ticket disappears.

### S4. SLA breach and pause time are never recorded (class D)

**Observed symptom.**
- Every resolved or closed ticket shows "SLA OK", including ones that blew their deadline. There is no way to report SLA compliance.
- A ticket parked in "waiting for client" for three days shows "breached" the moment it returns to an active status.

**Root cause.**
- `evaluateTicketSla` (`src/utils/tickets.ts:505-586`) returns `met` for any terminal status (`:509-518`). It does not compare `resolved_at` to `resolve_due_at`, or `first_responded_at` to `first_response_due_at`.
- Pause is derived only from the current status (`:519-527`). `sla_paused_at` and `sla_paused_seconds` exist (`schema.php:1203-1204`) and are synced (`sync.php:6965`, `:6918-6919`), but no code writes them except an initial 0 (`ProjectTicketsPanel.tsx:304`). Due dates are never shifted.
- `resolved_at` is kept on reopen (`TicketsView.tsx:695`, `:739`, `:925` use `tk.resolvedAt || now`, and the server uses `COALESCE` at `sync.php:5097`). So the stored resolution time is the first one, not the final one.
- Nothing fires on a breach: I found no e-mail or push in `tickets.php`, `ticket_widget.php` or `sync.php`. So nothing can fire twice; the problem is loss, not duplication.

**Proposed fix.** Record outcomes at the transition:
- On the first public agent reply (`TicketsView.tsx:886-924`, and the e-mail reply path in `tickets.php`), store `first_response_breached TINYINT NULL` = `first_responded_at > first_response_due_at`.
- When a ticket becomes terminal (client handlers `:674-699` and `:716-744`, server auto-resolve `sync.php:5096-5098`), store `resolve_breached TINYINT NULL`. On reopen, either clear `resolved_at` and the flag, or keep the first and add `reopened_count` (open question 5).
- On entering a `pausesSla` status, set `sla_paused_at`. On leaving it, add the interval to `sla_paused_seconds` and push both due dates forward by the same amount.
- Idempotency: each write sets a column once, through a guarded `UPDATE ... WHERE flag IS NULL`. No ids are needed.
- Readers: `evaluateTicketSla` shows "met" or "breached" for terminal tickets from the stored flags. The "SLA risk" KPI (`TicketsView.tsx:548`, `:586`) stays live for open tickets (class B).
- Backfill: compute both flags from stored timestamps where present. This ignores past pauses, which were never recorded; the UI should say so.
- Schema: 2 columns, 4-place rule. `sync.php` writes tickets, so pre-transaction healing is mandatory.
- Tests: `evaluateTicketSla` returns breached for a ticket closed late; a pause of N minutes shifts the due dates by N.

**Severity.** Wrong numbers (SLA compliance) and a missing audit fact.

### S5. Auto-resolve from linked tasks leaves no trace on the ticket (class D)

**Observed symptom.** A ticket flips to "resolved" with no message in its thread saying why. Manual status changes do get one.

**Root cause.** `public/sync.php:5096-5098` updates only `tickets.status/resolved_at`. Client status changes append a system message (`TicketsView.tsx:685-697`, via `createStatusChangeMessage`). The server block also hardcodes the status `'resolved'`, regardless of the custom `TICKET_STATUSES` set.

**Proposed fix.** In the same block, insert a `ticket_messages` row (`author_type = 'system'`, `event_type = 'status_change'`) with deterministic id `tmsg-auto-<ticketId>-<taskId>` and `INSERT IGNORE`. Use the configured terminal status key. No schema change.

Test: completing the last linked task twice creates one message.

**Severity.** Missing capability (audit).

---

## Order of work

1. **S3**: one key alias plus a backfill, and it stops ongoing data loss. Can run in parallel with step 2.
2. **W2 stop-gap** (synthetic stock id) if W1 cannot land soon. Otherwise go straight to W1.
3. **W1 + W4 + W5** together: one server-side "apply movement" step owns stock, batches and WAP. Needs the schema column.
4. **W3** after W1, because it relies on the server applying stock.
5. **S1**, then **S2**: periods need stable, versioned contract terms first.
6. **S4** and **S5** in parallel with the warehouse work. They touch separate files: `tickets.ts`, `TicketsView.tsx` and the ticket block of `sync.php`.

Parallel tracks: the warehouse work (W*) and the ticket work (S3/S4/S5) touch disjoint code. The exception is that both add pre-transaction healing in `sync.php`, so merge those carefully. S1 and S2 are sequential.

## Not a problem (class B)

- `warehouse_movements.total_cost_value / total_sell_value / total_profit_value`: stored on the document when it is created. Monthly KPIs sum stored rows (`WarehouseView.tsx:580-593`, `mcp_ext_ops.php:506`).
- Movement line prices (`unit_purchase_price`, `unit_sell_price`, `total_price`): stored per line, so purchase-price history exists in the ledger.
- Inventory valuation `stock x current WAP` (`WarehouseView.tsx:572`, `:3927`, `:5593`, `:6033`): a current snapshot by definition. It is fine once W1/W5 make its inputs right.
- Low-stock / out-of-stock counts and filters (`WarehouseView.tsx:565-617`): current-state aggregates over stored stock.
- Batch expiry status expired/warning/ok (`WarehouseView.tsx:668-698`): a pure function of the stored `expiration_date` and today. No past fact.
- Item 30-day inflow/outflow (`WarehouseView.tsx:2975-3000`): an aggregate over stored movement lines.
- `warehouse_item_prices`: a current price list. Documents carry their own line prices (other slice).
- `warehouses`, `suppliers` (incl. `contacts_json`, `payment_due_days`): master data with no derived history.
- Deleting an item or a warehouse cannot erase history: `warehouse_movement_items.item_id` and `warehouse_movements.warehouse_id` are `ON DELETE RESTRICT` (`schema.php:659`, `:680`).
- `reserved_quantity`: no code ever writes a non-zero value (only the demo seed does). "Available = on hand - reserved" is a formula over a stored 0, so nothing is derived wrongly. The reservation feature simply does not exist (open question 7).
- SLA due dates, when they reach the DB: computed once at creation and stored. They are not recomputed on read or on a priority change.
- SLA countdown / "SLA risk" KPI for open tickets: live and future-facing.
- `ticket_messages`: stored rows, including client status-change events.
- `ticket_task_links`: stored link rows. Auto-resolve fires only on a task status transition (`sync.php:5072`) and is guarded by `status NOT IN ('resolved','closed')`, so it cannot fire twice.
- Billable rate on ticket time: frozen on `time_entries.billable_rate` at create/stop (`time_entries.php:765`, `:1015`). This is the time-tracking slice; S1 covers how the frozen value is chosen.
- **Licensing** (`licenses`, `.agents/rules/licensing.md`): status and expiry are re-derived from the signed token on every read **by design** (rule 2), and the other columns are display copies. A renewal replaces the single row (`id = 1`), so past licence periods are not kept. No user-facing number depends on them, and a licence gates only updates. No change.

## Open questions for the product owner

1. **Negative stock:** may a goods issue take stock below zero? Today the app asks, then silently clamps at 0. The answer decides whether the ledger or the clamp wins in W1.
2. **Order fulfilment:** are partial deliveries allowed? Should fulfilling an order always issue stock and book cost at WAP?
3. **Retainer billing:** what is the in-allowance rate: prepaid/zero, or the contract rate? Today the panel stores the overage rate as both. Is overage invoiced per closed period?
4. **Contract changes:** is a change of hours or rate a new contract term (new row), or a correction of the current one? When the project retainer and a client-level contract disagree, which wins?
5. **SLA on reopen:** keep the first `resolved_at` and count reopens, or reset it? Should a "waiting for client" pause extend the deadlines? Business hours or wall clock?
6. **Timezone:** three writers and readers use different clocks:
   - the server writes SLA timestamps with PHP `date()`, i.e. server local time (`tickets.php:120-123`);
   - the client writes them with UTC `toISOString` (`tickets.ts:415`);
   - `evaluateTicketSla` treats every stored timestamp as UTC (`tickets.ts:540-543`).

   Which one is canonical? Today every breach on widget and e-mail tickets is shifted by the UTC offset.
7. **Reservations:** build reservations (orders reserving stock), or drop `reserved_quantity` from the UI?

---

# Part P5

# Slice 5: CRM (leads/clients), projects, every `*_json` column, sections 1/5/7

Read-only audit. Every finding below was confirmed in `src/` or `public/` at the cited lines. Two were also run with
`node --experimental-strip-types` against the real modules (scripts in this scratchpad folder: `check-adj.mts`,
`check-bill.mts`). Nothing in the repo was changed.

## Summary

| # | Entity | What is only calculated | Class | Severity | Proposed fix | Needs schema? |
|---|---|---|---|---|---|---|
| S5-1 | leads / clients | Which leads belong to a client, so also the client's value, timeline, categories, invoices, orders and tickets. The app groups by **name** even though `leads.client_id` is stored. | C | wrong numbers | Make `client_id` the source of truth in the Clients register and in MCP. The name match only applies to unlinked rows. | No |
| S5-2 | leads (`adjustment`) | One "client value adjustment" lives on many rows. A profile save copies it onto every linked or same-name lead, and "is a client" is worked out from `adjustment > 0`. | C | wrong numbers (phantom client, adjustment counted twice) | Stop copying `adjustment` to non-client rows, clean up the copies, keep it on the `client-*` row only | No |
| S5-3 | projects × financial_records | Project billing and margin count a recurring rule's own row as a movement, next to the stored payments it made. Before materialization they count none of the past payments. | C | wrong numbers | Count a rule row through `recurringOwnRowCharge` / `mcp_fin_recurring_own_row`, as Finance does | No |
| S5-4 | projects (`value`) | The contract value is read through a fallback chain: the live lead estimate, the type's money attributes, then `data.value`. `projects.value` stays empty. | C | wrong numbers | Freeze the resolved value into `projects.value` (one-off migration plus the creation paths) | No |
| S5-5 | project_types → projects / proj_* | Deleting a project type (a template) CASCADE-deletes every project of that type and DROPs their data, timeline and Gantt tables. Removing an attribute DROPs its column for every project. | A (history erased by template) | data loss | Refuse to delete a type that still has projects (FK `RESTRICT`). Hide removed attributes instead of dropping them. | FK change only |
| S5-6 | projects / proj_gantt_* | "Completed on" is missing on two write paths. Project status history is never recorded. A milestone that reaches 100 % has no completion date. | D | missing capability (wrong "finished late") | Stamp `finished_at` on every path. Log status changes. Add `completed_at` to Gantt rows. | Yes (Gantt column, optional log table) |
| S5-7 | leads (SLA) | "Breached the phase SLA" exists only while the lead sits in the phase. It is never recorded, so changing the limit rewrites it. | D | missing capability | Optional breach event with a deterministic id | Maybe (timeline ENUM) |
| S5-8 | users (`metadata_json.activityLog`) | The "User activity" timeline is a JSON list the client can edit, with a "Simulate activity" form. The real `audit_log` rows are never shown. | D | missing capability (audit integrity) | Show `audit_log` for the user. Drop the JSON list and the simulator. | No |

---

## Root cause 1: the link is stored, but readers re-derive it by name (S5-1, S5-2)

### S5-1 Client membership is grouped by name, ignoring the stored `leads.client_id`

- **Observed symptom.** A lead is linked to its client by id (LeadsDatagrid "create client from lead", the new-lead
  form "existing client", MCP `convert_lead_to_client`). If its name differs from the client's (allowed: "An explicit
  link wins even when the names differ", `leadClient.ts:25`), the lead drawer shows the client. The client's own page
  does not list the lead, its value, its timeline, its categories or its tickets. Renaming a lead silently moves its
  value from one client's "Client value" to another's, or to none. MCP `list_clients` / `get_client` /
  `get_client_dossier` return the same name-based answer, so the server-side numbers disagree with the lead drawer.
- **Root cause.**
  - `src/components/ClientsView.tsx:1058`: `const clientKey = lead.name.trim().toLowerCase();` is the only grouping
    key of `allClientProfiles`.
  - `:1129` `totalValue += lead.value` and `:1160-1163` `+ adjustment` sum by that key.
  - The same name test is repeated at `:698, :716, :1648, :1661, :2064, :2112, :2934, :3051, :3201`.
  - `clientInvoices` (`:1604-1612`) even matches `financial_records.client_id === activeClient.name`.
  - `clientOrders` (`:1669-1677`) matches `billing.name`.
  - Server side: `public/api/mcp_ext_ops.php:126-161` (`mcp_client_profiles`, `GROUP` by `LOWER(TRIM(name))`) and
    `public/api/mcp_ext_intel.php:192-204` (`mcp_client_scope_from`: `WHERE LOWER(TRIM(name)) = …`) behave the same.
  - Only `LeadsDatagrid.tsx:2551-2562`, `OrdersView.tsx:159`, `utils/timeLinks.ts`, `utils/whatsappLinks.ts` use
    `resolveLinkedClient` (`src/utils/leadClient.ts:24-35`), which honours `client_id`.
- **Evidence.** `LeadsDatagrid.tsx:2613-2641` creates `client-<ts>` and sets `clientId` on the lead. `mcp.php:1604-1607`
  says so outright: "so the Clients register (which groups by name) shows the client with the lead's value". The
  lead's link to its client depends on the two names staying equal.
- **Proposed fix.**
  - *Source of truth*: `leads.client_id` → the `client-*` row. The name match stays only as the fallback for rows
    without a usable link, exactly as `resolveLinkedClient` already does.
  - *Readers to change*: `allClientProfiles` (key = `resolveLinkedClient(lead, leads)?.id ?? nameKey`), the nine
    name comparisons above, `clientInvoices`/`clientOrders` (by the profile's record ids only, no name equality),
    `mcp_client_profiles`, `mcp_client_scope_from` and `list_clients`/`get_client` in `mcp.php`.
  - *Trigger / backfill*: no new write. Coverage depends on `php ccrm backfill-clients` (`api/lead_client_backfill.php`)
    and `php ccrm adjustment-clients --apply` (S5-2) having run. Ambiguous rows stay name-matched and are reported.
  - *Deletion semantics*: deleting a `client-*` row leaves `client_id` dangling. The leads fall back to the name match,
    which is the current behaviour. Decide whether a client delete should clear `client_id` (open question 4).
  - *Edit semantics*: renaming a lead no longer moves it between clients.
  - *Double counting*: a profile is keyed by client id. A lead must never also be added by name to a second
    same-name profile.
  - *Schema*: none.
  - *Tests*: extend `src/utils/leadClient.test.ts` and add a `clientProfiles` pure helper test:
    - a lead linked by id under another name counts in its client's total and timeline;
    - a rename does not move it;
    - a same-name lead linked to another client does not count.
    - Plus a PHP parity test for `mcp_client_profiles`.
- **Severity**: wrong numbers ("Client value", client timeline and documents, MCP).

### S5-2 The client value adjustment is copied onto every linked lead, which then becomes a client of its own

- **Observed symptom.** Saving the profile of a client that has a positive adjustment and a linked lead with a
  different name produces two clients in the register. The lead turns into a client of its own, and the adjustment is
  counted in both "Client value" figures.
- **Root cause.**
  - `src/components/ClientsView.tsx:2779-2781` passes `adjustment` in the profile patch.
  - `src/utils/leadClient.ts:86-99` (`applyClientProfile`) strips only contact fields and the name for a `linked` lead
    (`:94-98`), so `adjustment` is written onto it.
  - Same-name siblings get it too (`:94`).
  - `src/utils/clientRecord.ts:17` then classifies any row with `adjustment > 0` as a client, and `ClientsView.tsx:1172-1178`
    puts its name-group in the register.
  - Readers pick "the first non-zero adjustment" per name in different orders: `ClientsView.tsx:1122-1124` and
    `mcp_ext_ops.php:143-144`. `api/adjustment_client_migration.php:14-16` acknowledges this.
- **Evidence.** `check-adj.mts` output: after `applyClientProfile(all, "Novak s.r.o.", {adjustment: 5000})`, the lead
  `lead-1` named "Kuchyna Novak" (`clientId: client-1`) carries `adjustment: 5000` and `isClientRecord` gives `[true, true]`.
- **Proposed fix.**
  - *Trigger*: none. This is a write bug plus a cleanup. In `applyClientProfile`, delete `adjustment` from the patch for
    every role except the client row itself (ideally only the `client-*` row).
  - *Cleanup*: a dry-run-first CLI step next to `adjustment-clients`, which resets to 0 the adjustment of any
    non-`client-*` lead whose `client_id` points at a client-* row with the same adjustment. Report the rest.
  - *Afterwards*: once `php ccrm adjustment-clients --apply` has run on every installation, drop the
    `adjustment > 0` branch from `isClientRecord`, `mcp_is_client_record` (`mcp_ext_intel.php:30-32`) and
    `mcp_client_profiles`, so "is a client" is a stored fact (the `client-*` row) and not a number.
  - *Idempotency*: the cleanup touches only rows that match. A second run finds nothing.
  - *Schema*: none.
  - *Tests*:
    - `applyClientProfile` never writes `adjustment` on a `linked`/`sibling` row;
    - the register total is unchanged by a profile save.
- **Severity**: wrong numbers (phantom client, adjustment counted twice).

---

## Root cause 2: project rollups read the recurring rule as if it were a payment (S5-3)

### S5-3 Project billing and margin count the rule row as well as the payments stored from it

- **Observed symptom.** Take a project with a monthly recurring income of 100 since 1 August (4 payments due by 6 Nov).
  - *After materialization*: the project page, the projects list (and its Totals row), the dashboard tile and the MCP
    billing tools show received 400 **plus** invoiced-open 100 (invoiced 500, still-to-be-paid 600). The extra 100 is
    the rule's own row. Finance counts the same rule as 400.
  - *Before materialization*: in a session that may not edit finance, or through MCP before any editor opened the app,
    the same figures show received 0 and invoiced-open 100, so all four past payments are missing.
- **Root cause.**
  - `src/utils/projectBilling.ts:77-81` runs `splitRecordAmounts(r)` on every income row of the project, including
    `isRecurring` rule rows. A new rule is saved with `status: "planned"` (`FinancialManagementView.tsx:4073`), so it
    always adds one planned charge as "invoiced open".
  - `ProjectDetailsView.tsx:719-727` (`revenueAnalysis`) adds `r.amountPlanned` of the rule row to planned income and
    expenses.
  - PHP: `mcp_project_billing` (`public/api/mcp_ext.php:640-657`) uses `mcp_fin_split`, and `mcp_project_financials`
    (`mcp_ext_intel.php:396-399`) also lists the rule row in the installment schedule.
  - Finance's own reader avoids this through `recurringOwnRowCharge` (`financialOverviewTable.ts:138-151`), which
    returns null for a rule whose first day is stored.
  - `materializeDueCharges` (`recurringRuleDeletion.ts:58-87`, working tree) copies `projectId` onto every stored
    payment (`...rule`).
- **Evidence.** `check-bill.mts` output:
  - before: `received 0, invoicedOpen 100`;
  - after `materializeDueCharges`: `received 400, invoicedOpen 100, invoiced 500, stillToBePaid 600`;
  - `recurringOwnRowCharge(rule)` = `null`.
- **Proposed fix.**
  - *Readers*: in `projectBilling` and `revenueAnalysis`, a row with `isRecurring` contributes `recurringOwnRowCharge(r)`
    (null contributes nothing) instead of `splitRecordAmounts(r)` / `amountPlanned`. Do the same in PHP with
    `mcp_fin_recurring_own_row` (`mcp_ext.php:393-403`) inside `mcp_project_billing`. Show the rule in
    `mcp_project_financials` as a schedule, not as an installment.
  - *Callers that change automatically*: `Dashboard.tsx:365`, `DynamicDashboardView.tsx:707`, `ProjectsView.tsx:678`
    (Totals row via `SUMMABLE_PROJECT_COLUMNS`), `ProjectDetailsView.tsx:814`, `mcp_ext.php:814,867`,
    `mcp_ext_intel.php:398`.
  - *Trigger dependency*: the past payments must be stored for every reader. Today only an editing browser session
    writes them (`App.tsx` diff: `canMaterializeCharges`). The finance slice owns server-side materialization, so
    cross-reference it. MCP and viewer sessions undercount until it exists.
  - *Product decision*: should future scheduled charges count as "invoiced open" on a project (open question 3)?
  - *Schema*: none.
  - *Tests*: `projectBilling.test.ts`:
    - a rule plus its materialized payments counts each payment once (received 400, invoiced 400);
    - an old rule whose own row is a real paid payment still counts once.
- **Severity**: wrong numbers.
- **Related reader disagreements, same area**:
  - `Dashboard.tsx:362-372` falls back to `invoicesOffers` matched by `leadId` when there are no finance records, so a
    different source yields a different "invoiced".
  - `mcp_ext.php:712,868-872` `dashboard_basis_total` still reproduces an older tile formula (budget fallback,
    cancelled rows count) that `Dashboard.tsx` no longer uses.

---

## Root cause 3: a contract fact is read live from its sources instead of being stored (S5-4)

### S5-4 Project contract value follows the lead estimate and the type's attributes

- **Observed symptom.** A project created by auto-create, a workflow, the lead card or MCP `convert_lead_to_client`
  has no own `value`. Its contract value, "still to be paid", "not invoiced", the projects Totals row and the
  dashboard all change in the following cases:
  - someone edits the paired lead's estimate (a pipeline field);
  - the lead is deleted (the value drops to 0);
  - a money attribute is retyped or removed from the project type.
- **Root cause.**
  - `src/utils/projectBilling.ts:19-46` (`resolveProjectValue`): first positive of `project.value`, then the sum of the
    type's `money` attributes, then `data._projectValue ?? data.value`, then `lead.value`.
  - PHP mirror: `mcp_project_value` (`public/api/mcp_ext.php:588-637`).
  - The creation paths never write `value`: `api/auth.php:1473` (auto-create inserts only id, type, lead, client,
    status) and `api/workflows_engine.php:1106`.
- **Evidence.** The fallback order is documented in the function itself, and the `INSERT`s above omit `value`.
  Retyping an attribute changes the `attr.type !== "money"` filter (`projectBilling.ts:30`). Removing one DROPs the
  column (S5-5).
- **Proposed fix.**
  - *Trigger*: two parts.
    - A one-off, idempotent server migration: `UPDATE projects SET value = <mcp_project_value()> WHERE value IS NULL OR value = 0`,
      run only where the resolved value is > 0, reported per project. It lives in a file inside the schema
      fingerprint, or better a `php ccrm` command because it changes data.
    - Write the resolved value at creation in `ccrm_auto_create_project_for_lead`, `convert_lead_to_project`, the MCP
      convert and the app's new-project flow.
  - *Edit semantics*: after the freeze, the value changes only when someone edits `projects.value`. The fallback stays
    only for a project not saved yet.
  - *Money-attribute types*: if the owner wants the attribute sum as the contract value, keep deriving it. Those
    values are stored rows in `proj_data_*`, but S5-5 must stop them being dropped.
  - *Backfill size*: at most one write per project.
  - *Schema*: none (`projects.value` exists).
  - *Double counting*: none. Readers still call `resolveProjectValue`, whose first branch then wins.
  - *Tests*:
    - `resolveProjectValue` ignores a changed `lead.value` once `project.value` is set;
    - the migration is idempotent and skips projects with their own value.
- **Severity**: wrong numbers.

---

## Root cause 4: deleting or editing a template erases the stored history beneath it (S5-5)

### S5-5 Deleting a project type deletes its projects; removing an attribute drops its data

- **Observed symptom.** An admin deletes a project type they consider obsolete (hold-to-confirm, then an undo window).
  When the window closes, every project of that type is gone, together with its managers, custom attribute values,
  project timeline and Gantt milestones. Finance movements, tasks, time entries and tickets that point at those
  projects are left orphaned. Removing an attribute from a type wipes that field (for a money attribute, also the
  contract value of S5-4) in every project of the type.
- **Root cause.**
  - `public/api/schema.php:434`: `FOREIGN KEY (project_type_id) REFERENCES project_types (id) ON DELETE CASCADE`.
  - `public/sync.php:4058-4073` deletes the type and queues `DROP TABLE proj_data_/proj_timeline_/proj_gantt_`, which
    runs at `:7117-7125`.
  - Removing an attribute: `public/sync.php:203-211` (`DROP COLUMN attr_*` in `proj_data_*`) and `:266-273` (timeline
    attributes).
  - The UI says it outright: `src/components/ProjectSettings.tsx:876-877` ("Deleting a type also drops its data
    tables and every project of that type on the server") and `:258-261` ("which no Undo can bring back").
  - `ccrm_filter_mass_delete` guards only against an accidental mass delete, not a deliberate one.
- **Evidence.** The code paths above. The spec's test holds: delete the template tomorrow and the past projects and
  their numbers vanish.
- **Proposed fix.**
  - *Server*: in `sync.php` before `$delPt->execute`, skip (and report back) any type with
    `SELECT 1 FROM projects WHERE project_type_id = ? LIMIT 1`, archived projects included.
  - *Schema*: a migration in `ccrm_apply_migrations()` that replaces the FK with `ON DELETE RESTRICT`. This is an FK
    change, not a new column, so no pre-transaction column healing is needed. Update `entities_overview.md`.
  - *UI*: the delete button says "N projects use this type: move them to another type or delete them first". Offer an
    "archive type" instead. An `archived` flag on `project_types` would need a column and the 4-place rule.
  - *Attributes*: instead of DROP COLUMN, mark the attribute `removed: true` inside `attributes_json` and hide it.
    Actual purging becomes an explicit admin action. No schema.
  - *Deletion and edit semantics*: projects survive their template. A removed attribute keeps its stored values.
  - *Backfill*: none.
  - *Tests*:
    - PHP: a sync push that omits a type which still has projects keeps the type and the projects;
    - removing an attribute keeps the `attr_*` column.
- **Severity**: data loss.

---

## Root cause 5: lifecycle events are inferred from current state and never recorded (S5-6, S5-7, S5-8)

### S5-6 Project completion date, status history and milestone completion are not stored on every path

- **Observed symptom.**
  - A project completed by an automation ("Lead status changed → Change project status") has no finish date, so lists
    show it as closed with no "Finished …" and no late-finish check (no delay reason demanded).
  - A project of a type without the deadline switch never gets a finish date when completed on its card.
  - "When did this project go on hold / come back?" cannot be answered for any project.
  - A Gantt milestone at 100 % has no date it was reached.
- **Root cause.**
  - `public/api/workflows_engine.php:991`: `UPDATE projects SET status = ?` writes no `finished_at`.
  - `src/components/ProjectDetailsView.tsx:2150` stamps only `if projectType.hasDeadline`.
  - `ProjectsView.tsx:1003-1006` (bulk) stamps for *cancelled* too and clears otherwise, unlike `finishedAtForStatus`
    (`utils/projects.ts:183-194`).
  - `api/realtime_session.php:498-501` stamps for completed but never clears on reopen. Only
    `mcp_ext_writes.php:79,134` follows the rule.
  - No writer logs a project status change. Leads do (`LeadsDatagrid.tsx:4245`, `mcp.php:1590-1596`).
  - `proj_gantt_*` has only `progress` (`sync.php:277-285`), and "done/overdue" is computed in
    `mcp_ext_intel.php:437`.
- **Proposed fix.**
  - *Shared helper*: move `mcp_finished_at_for_status` into `auth.php` and call it from `workflows_engine.php:991` and
    `realtime_session.php`.
  - *Client*: always apply `finishedAtForStatus` in ProjectDetailsView (the field can stay hidden), and use it in
    bulk change.
  - *Status log*: on each status change write a `proj_timeline_<type>` row (`type='status_change'`, id
    `pst-<projectId>-<unix ms>`, idempotent per write), or a small `project_status_log` table (schema, 4-place rule).
  - *Gantt*: add `completed_at DATE NULL` to `proj_gantt_*`, healed in the dynamic-table function at `sync.php:~277`.
    Stamp it when `progress` first reaches 100 and clear it below 100.
  - *Backfill*: none is trustworthy. Optionally set `finished_at = DATE(updated_at)` for completed-group projects that
    have none (approximate; open question 5).
  - *Tests*:
    - `finishedAtForStatus` parity test for bulk;
    - a PHP test that the workflow status action stamps and clears `finished_at`.
- **Severity**: missing capability. Wrong "finished late" and delay-reason state for automation-completed projects.

### S5-7 Lead SLA breach is only a present-tense calculation

- **Observed symptom.** A lead that sat 20 days in a 7-day phase shows a red flag. Once it moves on, or the limit is
  raised, the breach is gone without a trace, so "how many leads breached SLA last month" is unanswerable.
- **Root cause.** `src/utils/leadSla.ts:118-144` (`evaluateLeadSla`) and `LeadsDatagrid.tsx:1159-1175`
  (`breachedSlaById`) compute it from the newest `status_change` event and the current `LEAD_STATE_SLA` setting.
  Nothing is written.
- **Proposed fix.** If the owner wants it reported:
  - write one breach event per (lead, phase entry), with id `sla-<leadId>-<stateKey>-<enteredAt>`, so two sessions
    converge;
  - trigger: an editing session effect (the `materializeDueCharges` pattern) or `api/cron.php` where a cron token is
    configured;
  - deletion semantics: a deleted event is not rewritten, because the id is deterministic and existence is checked
    first;
  - schema: `timeline_events.type` is an ENUM (`schema.php:117`), so a new type needs an ENUM migration plus healing;
    otherwise store it as `note` with a marker.
- **Severity**: missing capability (low).

### S5-8 "User activity" is a client-editable JSON list; the real audit log is not shown

- **Observed symptom.** Settings → Users → user → activity timeline shows "Account provisioned" plus whatever an admin
  types into "Simulate Real-time Activity". Real events (logins, role and permission changes) never appear there, even
  though the server records them in `audit_log`.
- **Root cause.**
  - `src/components/SettingsView.tsx:2699-2701` seeds the list.
  - `:3445-3460` appends a typed "simulated" event and saves it.
  - `public/sync.php:1342-1345, 3728-3733, 3864-3867` round-trip `metadata_json.activityLog` as the client sends it.
  - `audit_log` (`schema.php:446`) has no reader in this view.
- **Proposed fix.** Read the timeline from `audit_log WHERE actor_id = ?`, remove the simulation form, and stop
  persisting `activityLog` (keep reading old entries read-only, or drop them). No schema. Test: a sync push cannot
  write an activity entry.
- **Severity**: missing capability (audit integrity).

---

## Every `*_json` column: is the list really rows? (item 11)

| Table.column | Content | Verdict |
|---|---|---|
| financial_records.recurring_skipped_dates_json | Days already stored, plus tombstones of user-deleted payments | **Cross-ref finance.** The only record that a user deleted a past payment. If a rule edit loses it, `materializeDueCharges` recreates the payment (the code comment at `recurringRuleDeletion.ts:84-86` admits a rule edit can lose the list). Overlaps with `recurring_source_id`/`recurring_occurrence_date` on the stored rows. |
| financial_records.recurring_amount_history_json | Effective-dated price | B once past charges are stored (each carries its amount). Cross-ref finance. |
| financial_records.recurring_config_json, attachments_json | Config; files of the rule/movement | B |
| tasks.recurrence_json | "schedule config **and cursor**" | Cross-ref tasks: the cursor is generation state, check that occurrences are rows |
| tasks.email_reminders_json | Reminder config | B. Sends are logged in `task_reminder_log` (`schema.php:194`) |
| tasks.external_meta_json, metadata_json | Chat title/labels; plugin | B |
| timeline_events / tickets / ticket_messages / filed_mail_bodies .attachments_json, employees.files_json, projects.custom_files_json | Files of the parent row | B: no lifecycle apart from the parent (not queryable server-side, which is acceptable) |
| employee_salaries.items_json | Payslip line items | Cross-ref HR: are paid items rows? |
| employees.vacation_allowances_json | Per-year allowances | Cross-ref HR |
| meeting_notes.attached_clients/leads/users_json | Link sets | B (many-to-many in JSON, not history) |
| meeting_notes.ai_summary_json | Stored AI snapshot | B |
| tickets.watchers_json, tags_json | Sets | B. tickets.metadata_json: cross-ref support |
| users.metadata_json | Prefs, e-mail settings, **activityLog** | activityLog = S5-8. The rest is B |
| leads.metadata_json, follow_ups, ticket_allowed_emails, vat_validation_result | Plugin; `{state: date}` of ticked follow-ups; whitelist; stored VIES answer | B. follow_ups is stored, not derived. It has no author, and unticking erases the date |
| leads.recurrence_json, users.recurrence_json (+ task_kind, recurring_*) | **Stray columns** in CREATE TABLE (`schema.php:31-34, 88-91`, added in b43593a7/997f9765) | Not used. Schema hygiene only, fresh installs only |
| project_types.attributes_json / file_fields_json / timeline_*_json / list_columns_json | Template config | B as JSON. Their *editing* erases data, see S5-5 |
| projects.ticket_widget_config_json | Config | B |
| invoices_offers.custom_fields_json, usp_cards_json, custom_template_style_json | Document content snapshot | B. Cross-ref finance/invoices |
| ai_custom_templates.*_json, custom_dashboards.prompts_json/layout_json | Config | B |
| workflows.nodes/edges/trigger_config_json, workflow_queue.payload_json | Config, queue | B |
| workflow_logs.execution_log_json | Per-run log | B. Automation runs **are** recorded |
| suppliers.contacts_json, warehouse_item_prices.settings_json | Contacts, config | B. Cross-ref warehouse |
| company_mailboxes / integration_clients .settings_json, plugins.config_json, integration_clients scopes/allowed_ips/owner_user_ids, integration_refs.applied_snapshot | Config; three-way merge base | B |
| ai_usage.alt_codes_json, external_meta_json | Usage metadata | B |
| unified_entries.modules_json, folder_modules_json | Config | B |
| client_adjustment_migration.moved_from / linked_ids | Undo log of a CLI migration | B |

## Order of work

1. **S5-5 first.** It is the only data-loss item, and the guard is small (a server check plus the FK). It can run in
   parallel with everything else.
2. **S5-3 together with the finance slice's recurring materialization.** It is the same release, otherwise the
   double count ships. It is a small, pure change (`projectBilling.ts`, `ProjectDetailsView.tsx` revenueAnalysis,
   `mcp_ext.php`).
3. **S5-2 before S5-1.** Stop the adjustment copy and clean up the copies; S5-1's register re-keying would otherwise
   show the phantom clients more prominently.
4. **S5-1** after S5-2, in parallel with S5-4 and S5-6.
5. **S5-4** after the S5-5 attribute decision, because money attributes feed the value.
6. **S5-6** in parallel (independent writers).
7. **S5-7 and S5-8** are low priority and independent.

## Not a problem (class B)

- **lead_categories**: stored junction rows. The profile's category union is a display aggregate.
- **timeline_events**: stored. Every lead status move writes `status_change` (app `LeadsDatagrid.tsx:4245`, MCP
  `mcp.php:1590-1596, 1619-1624`). Mail rows the user hides keep a `hidden` tombstone so they are not filed again.
- **Lead → client conversion**: stored as a `client-*` row, plus `leads.client_id`, plus a `status_change` event
  (`LeadsDatagrid.tsx:2613-2641`, `mcp.php:1603-1652`).
- **Pipeline counts and stage values, "Total invoicable active value" lead part**: aggregates over the current stored
  lead state.
- **contactDetailsFor / projectDisplayName fallbacks**: display-only borrowing. No number depends on them.
- **Project deadline tone (overdue/soon/ok/closed/finished)**: present tense over stored `completion_deadline`,
  `finished_at` and status, and a stored `finished_at` wins (`utils/projects.ts:105-170`). Minor: `finishedLateDays`
  is recomputed from the *current* deadline, so editing the deadline after finishing changes it.
- **Project status meaning (group)**: the key is stored on the project, the group comes from settings, and deleting a
  status in use moves its projects first (`ProjectStatusSettings.tsx:97-114, 177-196`).
- **Project progress**: the average of stored Gantt `progress` (`ProjectsView.tsx:659-663`).
- **project_managers**: stored junction.
- **Projects Totals row / budget analysis**: aggregates of per-row figures. They inherit S5-3/S5-4 but add no
  derivation of their own.
- **Project labour cost**: `time_entries.cost` and `cost_rate` are snapshots (`schema.php:1286-1289`). The time
  slice should confirm the reader uses them.
- **Section 5 e-mail** (`rag_emails`, `email_summaries`, `company_mailboxes`, `mail_sync_state`, `filed_mail_bodies`):
  stored caches and cursors.
- **Section 7**:
  - `unified_entries`: config; `warning_days` is a present-tense flag.
  - `custom_dashboards`, `system_settings`, `plugins`: config.
  - `error_logs`, `audit_log`: stored.
  - `integration_clients`, `integration_tokens`, `integration_refs`, `integration_rate`: stored.
  - `whatsapp_links`: stored, written by the API.
  - `whatsapp_numbers`: a cache of lookups.
- **Section 1** (`users`, `permissions`, `role_permissions`, password/remember tokens): stored. The only issue is S5-8.

## Observations outside the bug class (for the lead to route)

- **`entities_overview.md` has drifted badly for this slice**:
  - `projects` lacks `name`, `rating`, `invoice_date`, `completion_deadline`, `delay_reason`, `start_date`,
    `finished_at`, `budget`, `value`, `custom_files_json`, `archived`, `hours_budget`, `billable_rate`, `is_internal`;
  - `leads` lacks `adjustment`, `follow_ups`, `referral_lead_id`, `interest_note`, `client_category_id`,
    `traffic_origin*`;
  - `project_types` lacks `has_deadline`, `has_invoice_date`, `deadline_*`, `has_files`, `file_fields_json`,
    `list_columns_json`.
  - Any schema fix above must also correct the doc.
- **`api/agent_utils.php:582-588`** counts "overdue projects" for the AI summary without checking `has_deadline` or
  `finished_at`, so it disagrees with the UI.
- **`mcp.php:1647` → `mcp_ext_writes.php:110-112`**: MCP `convert_lead_to_client` with `create_project` passes the
  *lead* id as the project's `client_id` (both `lead_id` and `client_id` become the lead id), not the new `client-*` id.
- **The spec says "no cron", but `public/api/cron.php` exists** (token-gated, runs workflows, task reminders and
  recurring tasks). It is an optional trigger for server-side materialization where an installation has configured it.

## Open questions for the product owner

1. **"Client value"**: should it stay "sum of every lead's *estimate* (lost deals included) + adjustment", or become
   booked revenue (paid income on the client and its projects)? Today it is pipeline estimates grouped by name
   (`ClientsView.tsx:1129`).
2. **When is a project's contract value fixed?** At creation, when the lead is won, or at the first invoice? Should it
   follow the lead estimate until then (S5-4)?
3. **Should a project's future recurring charges count as "invoiced open / still to be paid"**, or only charges
   already due (S5-3)?
4. **Project types and attributes**: forbid deleting a type that has projects, or allow it with "move projects to
   type X"? May removing an attribute ever delete its stored values (S5-5)?
5. **Project history**: is a status-change log wanted (like leads)? Is an approximate `finished_at` backfill from
   `updated_at` acceptable for projects completed without one (S5-6)?
6. **The adjustment**: one amount per client, on its `client-*` row only? May `php ccrm adjustment-clients --apply` be
   run on production installations (S5-2)? Should deleting a client clear its leads' `client_id`?
7. **SLA breaches**: record them for reporting, or is the live flag enough (S5-7)?
8. **User activity**: replace it with the `audit_log` view and remove "Simulate Real-time Activity" (S5-8)?

---

