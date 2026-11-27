# Prompt: Recurring tasks (for Sonnet 5.5, high effort)

> Hand this whole file to the implementing agent. The "Decisions" sections are
> settled with the user. Do not change them without asking.

---

You are implementing **recurring tasks** in CCRM (React + TypeScript + Vite SPA,
PHP/MySQL backend). Read `CLAUDE.md` in the repo root first, plus every rule in
`.agents/rules/` it links. Those rules are binding. The ones that matter most
here are the **4-place rule for new DB columns**, **qa-before-ship**,
**commit-and-versioning** and **view-size**.

This is a large change. Work in phases and commit after each one (see "Order of
work" at the end). Don't stop halfway and report the rest as "future work":
everything in this file is in scope.

## What the user asked for

- A new tab on the Tasks screen called **Recurring** ("Opakované" / "Ismétlődő").
  It sits **between "Global Tasks" and "Done & Archived"**. The tab has only a
  "New recurring task" button and a simple **list** of recurring tasks. It has
  no calendar of its own.
- Every "create a new task" dialog gets a **Repeat** switch. The edit drawer of
  an existing task gets one too, to convert that task.
- Recurring tasks are **not a new entity**. They are rows in the `tasks` table
  with a new kind. They get the same CRUD actions regular tasks have.
- A recurring task works like **recurring movements in Finance**: one stored
  rule produces the occurrences.
- **A new task is created from a recurring task only when the previous one is
  closed.** A series never has more than one task open because of the generator.
- **No period may be silently skipped.** If the work is due every month, every
  month gets its own task, even when the user is late.

## Decisions: data model

- The **series** is one `tasks` row with `task_kind = 'recurring'`, called the
  *template*. It holds the shared task fields (title, description, priority,
  owner, assignees, tags, related lead / project, `isLocking`,
  `requiresConclusion`, `emailReminders`, `estimateMinutes`, `deadlineTime`)
  and the schedule in `recurrence_json`. A template is never done, never on the
  calendar as a real task, and never in the normal task lists.
- Each **occurrence** is an **ordinary task** created from the template. It
  carries `recurring_source_id` (the template id) and
  `recurring_occurrence_date` (the scheduled date it was created for). After
  that it behaves like any other task.
- This mirrors Finance. A recurring movement is one rule. A materialised
  one-off carries `recurringSourceId` / `recurringOccurrenceDate` (see
  `src/utils/recurringExpenses.ts` and `FinancialRecord` in `src/types/index.ts`).

### A template must never leak. This is enforced by structure and tests, not by care

A template lives in `tasks` and has a `deadline`. Any code that reads `tasks`
without filtering would count it, remind about it, show it, or let an AI agent
"complete" it. The user explicitly asked for this risk to be **removed**, not
just documented. Implement all of the layers below.

1. **Separate sync collection.** On the wire, templates are their own
   collection, `recurringTasks`, next to `tasks`. The sync GET builds `tasks`
   from real tasks only and `recurringTasks` from templates only. On the
   client, templates live in their own state with their own TypeScript type,
   `RecurringTaskTemplate` (no `status`, `completedAt`, `conclusion`, …). No
   component typed for `Task[]` can receive a template without a compile
   error.
2. **Deletion scoping in sync.php — critical.** The omitted/deleted-record
   logic for `tasks` (`ccrm_delete_omitted` and the explicit-deletions path)
   must only ever consider rows with `task_kind IS NULL`. Templates are not in
   the `tasks` payload, so they would otherwise be deleted as "omitted". The
   `recurringTasks` collection gets the mirror rule: it only touches template
   rows. Write a test that proves both directions.
3. **Write guards.** The `tasks` collection cannot create or edit a template
   or change `task_kind`, and `recurringTasks` cannot touch a real task. Every
   other write path that takes a task id must refuse a template id with a
   clear error: `task.php`, the `mcp_ext_writes.php` tools,
   `integration_tasks.php`, the time tracker / time entries, and workflows.
4. **One SQL helper on the backend.** Add a helper such as
   `ccrm_sql_real_tasks(string $alias = ''): string`, which returns the
   `task_kind IS NULL` fragment. Every PHP reader of `tasks` uses it. Readers
   found today: `agent_utils.php`, `dashboard_query.php`,
   `integration_tasks.php`, `mcp.php`, `mcp_ext_intel.php`, `mcp_ext_ops.php`,
   `mcp_ext_writes.php`, `read_scope.php`, `task.php`, `task_reminders.php`,
   `time_entries_lib.php`, `time_tracker_lib.php`, `vector_index.php`,
   `workflows_engine.php`, `demo_seed/*`, `wipe_demo.php` and `sync.php`
   (locking-task stage checks, counts, the task GET). Re-grep, because the
   list may have grown.
5. **Guard test that fails the build.** Add a test to `npm run test:unit`
   (`src/**/*.test.ts`, e.g. `src/utils/recurringTaskGuard.test.ts`). It scans
   `public/**/*.php` for SQL that reads or writes the `tasks` table (`FROM` /
   `JOIN` / `UPDATE` / `DELETE FROM` / `INSERT INTO` `tasks`, backticked or
   not, across multi-line strings). It fails, listing `file:line`, for any
   statement that neither uses the helper nor carries an explicit annotation
   `/* recurring-template: <reason> */`. The annotation is for code that
   deliberately handles templates: the generator, the `recurringTasks` sync
   collection, schema and migrations. A reader added a year from now then
   fails the build instead of leaking. Make the test catch a deliberately
   broken query; check that before relying on it.
6. **Behaviour tests.** Seed a template and run the real code paths: reminder
   processing, MCP task list/search/get/complete, `dashboard_query`, the
   locking-task stage check, time tracker start, vector indexing. Assert that
   the template is absent or refused in every one. Use the PHP harness the
   repo already has (`scripts/test-*.php`, `npm run test:integration` in the
   dev container).
7. **Frontend grep.** Even with separate state, grep every consumer of tasks
   (dashboard widgets in `src/components/dashboard/`, task badges, project
   tasks, `EntityTasksPanel`, `ProjectTasksPanel`, time tracking, Copilot /
   swarm ontology, `useCurrentScreenContext`). Confirm that none of them reads
   tasks from a path that bypasses the split, for example a direct fetch.

## Decisions: dates

### Two repeat modes (the user picks one per series)

- **On a schedule** (default). The series is due on fixed calendar dates:
  "every month on the 15th", "every 2 weeks on Monday".
- **After completion.** The next task is due a set interval after the previous
  one was closed: "3 months after it was last done". Good for maintenance work
  where the clock restarts when the work is done.

### Schedule options

| Field | Values |
|---|---|
| `frequency` | `daily` · `weekly` · `monthly` · `yearly` |
| `interval` | integer ≥ 1: every N days / weeks / months / years (1 = every) |
| `config` | as Finance's `FinancialRecurrenceConfig`: weekday for weekly; day of month **or** nth weekday (last included) for monthly; month + day for yearly |
| `weekendRule` | `keep` · `before` (move to the Friday before) · `after` (move to the Monday after). For `daily`, `before`/`after` both mean **weekdays only**, so Sat/Sun are left out and not moved (moving would create two tasks on Monday). |
| `leadDays` | integer 0–365: create the task N days before it is due. Defaults by frequency: daily 0, weekly 1, monthly 3, yearly 14 |
| `startsOn` | earliest due date, default today |
| `endsOn` | optional; nothing is scheduled after it |
| `paused` | boolean |

In **after completion** mode only `frequency` (days / weeks / months / years),
`interval`, `weekendRule`, `leadDays` and `endsOn` apply.

**Interval anchoring (schedule mode):** the first occurrence is the first
matching date on or after `startsOn`. Each later occurrence is N periods
after it. For example: every 2 months on the 15th, starting 1 Nov, gives
15 Nov, 15 Jan, 15 Mar. Every 2 weeks on Monday gives the first Monday on or
after `startsOn`, then +14 days. A day the month doesn't have falls on the
month's last day (31st → 28/29 Feb), the same as Finance.

**Weekend rule** shifts the task's `deadline` only. `recurring_occurrence_date`
keeps the unshifted scheduled date, so the schedule never drifts.

### The rules

1. **The schedule sets the due date.** An occurrence's `deadline` = its
   scheduled date (after the weekend shift). Its `startDate` = deadline −
   `leadDays`. `deadlineTime` is copied from the template.
2. **No task before its start date.** The generator creates an occurrence only
   when today ≥ its start date. Future occurrences don't clutter the lists.
3. **Gate: no open occurrence.** The generator creates the next occurrence only
   when the series has **no open occurrence**. Open means not in a done state
   and not archived. A deleted occurrence is not open.
4. **No silent skipping (schedule mode).** The next occurrence is the **first
   scheduled date after the cursor**, even if that date has already passed.
   The task is then created at once, already overdue. Every period gets a task,
   one at a time: closing a late task immediately produces the next overdue
   one, until the series is back on time. The only ways to skip a period are
   explicit user actions: deleting "only this task" (see below) or pausing.
5. **Cursor.** The template stores `lastOccurrence` (the scheduled date of the
   newest occurrence it created) and `lastOccurrenceId` in `recurrence_json`.
   The next occurrence is computed from the cursor, not by looking at task
   rows. Deleting an occurrence therefore never makes the generator recreate
   it.
6. **Fixed schedule, not "from completion" (schedule mode).** Finishing early
   does not pull the next task forward. If the 15 Nov task is finished on
   10 Nov, the next one is still due 15 Dec and appears 12 Dec (leadDays 3).
   Moving one task's deadline doesn't move the schedule either.
7. **After-completion mode.** Next due date = the previous occurrence's
   completion date (date part of `completedAt`) + interval, then the weekend
   rule. If the previous one was archived or deleted without being completed,
   use the day the generator first notices it is no longer open. No catch-up
   question exists in this mode.
8. **First occurrence.** It is the first scheduled date on or after `startsOn`.
   If `startsOn` is in the past, the backlog is worked through one task at a
   time by rule 4. The create dialog warns: "The first task will already be
   overdue."
9. **Pause / resume.** A paused series creates nothing. On resume, the cursor
   moves so that the next occurrence is the first scheduled date **on or after
   the resume day**. Periods that fell inside the pause are not back-filled,
   because pausing is the user's explicit choice to skip them. A pause that
   ends before the next date has passed loses nothing.
10. **End date.** Occurrences scheduled after `endsOn` are never created. A
    backlog of occurrences due on or before `endsOn` is still worked through
    after `endsOn` has passed (rule 4). When nothing is left, the list shows
    the series as **Ended**.
11. **Editing the series** changes **future** occurrences only. The open
    occurrence is not touched. A changed schedule applies from the first date
    of the new schedule after the cursor.
12. **Editing an occurrence** changes only that task. This is Finance's "Edit
    this payment only" pattern. The task drawer has an "Edit series" link for
    the rest.

### Worked examples (use every row as a unit-test case)

Monthly on the 15th, leadDays 3, schedule mode, unless stated otherwise:

| Situation | Result |
|---|---|
| Series created 1 Nov | Due 15 Nov, created 12 Nov |
| Created 14 Nov | Due 15 Nov, created immediately |
| Created 16 Nov (`startsOn` = today) | Due 15 Dec, created 12 Dec |
| Created 16 Nov with `startsOn` 1 Nov | Due 15 Nov, created immediately, already overdue; dialog warned |
| 15 Nov task closed 10 Nov | Due 15 Dec, created 12 Dec |
| 15 Nov task closed 15 Nov | Due 15 Dec, created 12 Dec |
| 15 Nov task closed 13 Dec | Due 15 Dec, created immediately |
| 15 Nov task closed 20 Dec | **Dec task created immediately (overdue since 15 Dec)**; once that is closed, Jan task appears 12 Jan |
| 15 Nov task closed 20 Feb | Dec (overdue) now → close it → Jan (overdue) → close → Feb (overdue) → close → Mar appears 12 Mar |
| 15 Nov task still open on 20 Dec | Nothing; the series waits |
| 15 Nov task deleted "only this task" on 13 Nov | Due 15 Dec, created 12 Dec; 15 Nov is not recreated |
| Paused 10 Nov, resumed 11 Nov | Nothing lost: 15 Nov task created 12 Nov |
| Paused 10 Nov, resumed 20 Jan | Dec and Jan skipped (by choice); next due 15 Feb, created 12 Feb |
| 15 Nov task reopened after the Dec one exists | Two open tasks; the generator waits until both are closed |
| Every 2 months on the 15th, `startsOn` 1 Nov | 15 Nov, 15 Jan, 15 Mar |
| Monthly on the 31st | 30 Nov, 31 Dec, 31 Jan, 28 Feb (29 Feb in a leap year) |
| Monthly on the 15th, `weekendRule` `after`; 15 Feb 2027 is a Monday, 15 May 2027 a Saturday | 15 May → deadline 17 May; occurrence date stays 15 May |
| Daily, `weekendRule` `before` | Mon–Fri only, no Saturday/Sunday task |
| After completion, every 3 months, leadDays 14; closed 1 Nov | Due 1 Feb, created 18 Jan |
| After completion; previous deleted on 5 Nov without completion | Due 5 Feb |

Check the weekday claims in this table against a real calendar before
encoding them, and fix the example (not the rule) if one is off.

## Decisions: deleting

**Deleting an occurrence** that belongs to a series (from any list, card,
calendar pill or drawer) opens a dialog with two choices:

- **Only this task.** Deletes this task. The series continues with the next
  date. This is the explicit way to skip one period.
- **This and all future tasks.** Deletes this task and stops the series: the
  template is deleted. Tasks already closed stay as history, with
  `recurring_source_id` cleared.

Plus Cancel. Use the existing `ConfirmDialog` look. Keep the undo behaviour
regular task deletion has today (`deleteRecordsWithUndo` or whatever the task
delete path uses), and make undo restore the template too when it was
deleted. Finance has no such dialog to copy (it uses "Edit this payment only"
plus hold-to-confirm), so build this one new, in the same visual language.
Deleting a task that is not in a series keeps today's behaviour exactly.

**Deleting the series** from the Recurring tab means the same as "This and all
future tasks": the template and its open occurrence (if any) are deleted, and
closed history stays. Use one confirm, which names the open task it will
remove.

## Where generation runs: on the server, never in the browser

Several browsers are open at once, so client-side generation would create
duplicates. Follow the pattern of task e-mail reminders exactly
(`public/api/task_reminders.php`):

- New `public/api/recurring_tasks.php` with `ccrm_process_recurring_tasks($pdo, ?string $onlyTemplateId = null)`
  and `ccrm_maybe_process_recurring_tasks($pdo)` (throttled to once a minute
  across all browsers, the same as reminders).
- Call it from `public/api/cron.php` and from the `register_shutdown_function`
  in `public/sync.php`, next to `ccrm_maybe_process_task_reminders`.
- Also run it, unthrottled, for one template right after a sync that created
  or edited a template, or that closed or deleted an occurrence. Do this after
  the transaction commits, so the next task appears on the next poll.
- Generating a backlog: one run creates **at most one** occurrence per
  template (rule 3 gates the rest), so a long backlog cannot flood the table.
- **Idempotency:** a UNIQUE index on `(recurring_source_id,
  recurring_occurrence_date)`, `INSERT IGNORE`, and the cursor advanced in the
  same transaction. Two overlapping runs cannot both create a task.
- "Today": use the same timezone source and `DateTimeImmutable` handling as
  `task_reminders.php`. Store plain `YYYY-MM-DD`.
- "Done state": reuse the server-side done-state check sync.php already uses
  (`$conclusionIsDone` / the custom task states). Never hardcode `'done'`.
- A generated occurrence must cause the same side effects as a task created
  through sync: `task_assignees` rows, notifications to assignees, activity /
  timeline entries, vector index, and whatever else `$isNewTask` triggers
  today. Read that path and reuse it. Do not write a partial copy.
- The template row keeps `deadline` = the next due date and `start_date` = the
  day the next task will appear, both kept up to date by the generator. The
  Recurring list sorts on them.
- Verify that a row the server inserts is **not** deleted by a client sync
  with an older base (`ccrm_delete_omitted` / `ccrm_write_would_clobber`
  against `baseSyncedAt`). Prove it with a test.

## Database (4-place rule, for every column)

New columns on `tasks`:

| Column | Type | Meaning |
|---|---|---|
| `task_kind` | `VARCHAR(20) NULL` | `NULL` = normal task, `'recurring'` = series template; indexed |
| `recurrence_json` | `TEXT NULL` | Template only: `{mode, frequency, interval, config, weekendRule, leadDays, startsOn, endsOn, paused, lastOccurrence, lastOccurrenceId}` |
| `recurring_source_id` | `VARCHAR(50) NULL` | Occurrence only: template id |
| `recurring_occurrence_date` | `DATE NULL` | Occurrence only: the unshifted scheduled date |

Plus `UNIQUE (recurring_source_id, recurring_occurrence_date)`.

For each column: add it to `CREATE TABLE` in `public/api/schema.php`, add an
idempotent migration in `ccrm_apply_migrations()`, add **column healing in
`public/sync.php` above `beginTransaction()`**, and update
`entities_overview.md` (`entity-sync` skill). Then run `npm run sync:backend`.
Keep migration code inside the fingerprinted files (see the
`ccrm_schema_fingerprint()` note in CLAUDE.md).

Validate `recurrence_json` on the server: drop unknown keys, clamp `interval`
to 1–999 and `leadDays` to 0–365, and reject impossible configs. **Never trust
a client-sent cursor** (`lastOccurrence`, `lastOccurrenceId`). The generator
owns them, so keep the stored values. Resume is the one exception: on a
`paused: true → false` transition the **server** moves the cursor (rule 9).

## UI

Match the existing Tasks screen styling (raw palette classes, as the codebase
writes them; do not introduce semantic tokens). Follow `docs/VIEW-SIZE.md`.
Every string uses `t(en, sk, hu)`.

### Recurring tab (`TaskDashboardView.tsx`)

Add `"recurring"` to the `viewMode` union, and add the tab button between
Global Tasks and Done & Archived. Give the header subtitle its own text.

- A "New recurring task" button opens the normal create dialog with Repeat on.
- The list (table on wide screens, cards on narrow ones) shows: title, the
  schedule in words ("Every 2 months on the 15th · weekends → Monday · shows
  3 days before", or "3 months after completion"), next due date and the day
  it appears, assignees, and the current task (a link with its status and an
  overdue mark, or "Next appears on 12 Dec"). Add a **Paused** / **Ended**
  badge where it applies.
- A search box filters by title. Sort by next due date.
- Row actions follow the global task list where they make sense: open/edit,
  pause/resume, delete (series confirm, above). Complete and archive don't
  apply to a template; pause takes their place.
- Empty state: one sentence explaining what a recurring task is, plus the
  create button.

### Repeat switch: every create dialog, plus conversion in the edit drawer

Find every place a new task is created and add the switch there:
`QuickTaskModal.tsx`, the create flow in `TaskDashboardView.tsx`,
`TaskEditDrawer.tsx` if it has a create mode, `EntityTasksPanel.tsx` and
`ProjectTasksPanel.tsx`. Check `MeetingRoomView.tsx`, `EmailView.tsx`,
`LeadsDatagrid.tsx`, `ClientsView.tsx` and `VoiceTaskActionBar.tsx` too. Grep;
do not trust this list. Reuse the switch markup already in the codebase
(`role="switch"` in `TaskDashboardView.tsx` / `ProjectSettings.tsx`).

Build **one** shared `TaskRecurrenceFields` component, used everywhere:
- Off: the dialog is unchanged.
- On: the deadline date field is replaced by:
  - the mode (On a schedule / After completion);
  - frequency (Daily / Weekly / Monthly / Yearly) and "every N";
  - day settings, copied in behaviour from Finance's recurring form
    (`FinancialManagementView.tsx`, around `formRecurringFreq` /
    `formMonthlyType`);
  - the weekend rule;
  - "Show N days before due";
  - "Starts on" and an optional "Ends on".

  Deadline time stays.
- A live preview: "First task: due 15 Nov, appears 12 Nov", plus the **next 5
  due dates** (schedule mode), plus the overdue warning from rule 8. It comes
  from the same TS engine the tests cover.
- Saving creates the template. The server creates the first occurrence.

**Converting an existing task.** In `TaskEditDrawer`, for a task that is
neither a template nor already in a series, the same switch reads "Make this
task repeat". Saving creates a template from the task's fields, with the
schedule defaulted from its deadline (for example monthly on that day). The
task itself becomes the **first occurrence**: `recurring_source_id` and
`recurring_occurrence_date` = its deadline, and the cursor is set to that
date. If the task is already done, the generator proceeds per the rules.

### Editing a template

Opens `TaskEditDrawer` with `TaskRecurrenceFields` filled in. Hide the fields
that only make sense on a real task: status, conclusion text, completed by/at
and time tracking.

### Occurrences

- A small repeat icon (lucide `Repeat`) on rows, cards and calendar pills,
  with the tooltip "Part of a recurring series".
- The task drawer shows "Repeats monthly on the 15th · Edit series". Editing
  there changes only this task (rule 12).
- Deleting one opens the two-choice dialog above.

### Upcoming occurrences on the My Tasks calendar

In the month and week views (not the timeline), show future occurrences of
**schedule-mode** series that do not exist yet as **ghost pills**. Make them
faded, dashed and marked with the repeat icon, labelled "Planned". Clicking
one opens the series. Ghosts are computed on the client from the templates by
the TS engine, only for the visible range, never past `endsOn`, and never for
paused series. They are not tasks: they never enter task counts, badges,
filters, totals, search, drag-and-drop or the dashboard widgets. After-
completion series show nothing, because their next date is unknown until the
current task is closed. Add a "Show planned recurring tasks" toggle next to
the calendar scope controls, on by default and persisted the way the calendar
scope is (cookie).

## Engine and tests

- `src/utils/recurringTasks.ts`: the pure engine. It covers schedule
  occurrences with interval, the weekend rule, the next occurrence after a
  cursor, start dates, after-completion mode, pause/resume cursor moves and
  the end date, plus `describeRecurrence()` for the human-readable schedule
  text. Work in `YYYY-MM-DD` UTC strings like `recurringExpenses.ts`. You may
  export date helpers from `recurringExpenses.ts` (`nthWeekdayOfMonth`, the
  clamping) to reuse them, but Finance behaviour and Finance's tests must
  stay unchanged.
- `src/utils/recurringTasks.test.ts`: **every row of the worked-examples
  table**, plus leap years, interval across a year boundary, `endsOn` with a
  backlog, and nth-weekday "last".
- **PHP and TS must agree.** Put the worked examples in one shared JSON
  fixture under `scripts/fixtures/`, read by the TS test and by a new
  `scripts/test-recurring-tasks.php` (same style as
  `scripts/test-integration-lib.php`). Add an npm script for it. On this
  machine, PHP runs through docker.
- Server-side tests: the gate (no second task while one is open), the backlog
  produces one task per run, the `INSERT IGNORE` race, deletion scoping in
  both directions, write guards, the stale-client-sync-doesn't-delete-a-
  generated-row case, conversion of an existing task, and both delete scopes.
- The guard test and the behaviour tests from the "must never leak" section.
- QA: the QA suite mocks `/sync.php`, so the generator does not run there.
  Extend the QA mock and seed with a `recurringTasks` collection (one schedule
  template, one after-completion template, one open occurrence). Add
  coverage for the Recurring tab, the Repeat switch in each dialog,
  conversion in the drawer, the delete dialog, the repeat badge and the ghost
  pills. Run `node scripts/qa/run-qa.mjs --files <changed files>` and read
  `test-results/qa-audit-report.md`. Never loosen a check to make a finding go
  away.
- `npx tsc --noEmit` and `npm run test:unit` must be clean.

## Docs

- `docs/RECURRING-TASKS.md`: the date rules, the worked-examples table, where
  the generator runs, the delete scopes, and the leak-proofing layers
  (especially the guard-test annotation, so future authors know what to do
  when it fails).
- One line in `CLAUDE.md` under "Things that will bite you": "a `tasks` row
  with `task_kind = 'recurring'` is a template; read tasks through
  `ccrm_sql_real_tasks()`. The guard test enforces it."

## Order of work (commit after each phase)

1. DB columns (4 places) + `recurring_tasks.php` generator + SQL helper +
   reader filters + write guards + guard test + PHP tests.
2. Sync: the `recurringTasks` collection, deletion scoping, and the client
   state split with the `RecurringTaskTemplate` type.
3. `recurringTasks.ts` engine + shared fixture + unit tests.
4. Recurring tab + `TaskRecurrenceFields` + Repeat switch in every create
   dialog + template editing.
5. Occurrence badge, "Edit series" link, delete dialog, conversion in the
   drawer.
6. Ghost pills on the calendar.
7. QA seed and coverage, docs.

When all of that is done: **test → bump version (`src/utils/version.ts`) →
changelog → build → commit** with the version tag suffix. Restore `dist/`
unless you are deliberately committing a bundle. Other sessions may be
working in this checkout. Stage only your own hunks and never use
`git stash`.

## When you finish, report

1. What was built, phase by phase, in short.
2. Every reader of `tasks` you changed, and every place you annotated as
   template-aware, with the reason.
3. The test and QA results, with real output, including failures.
4. Anything in this prompt that turned out to be wrong or impossible, and what
   you did instead.
