# Time Tracking: implementation prompt

Run with Sonnet 5.5 (`claude-sonnet-5-5`) at **high** effort, in the `ccrm-app` repo root.

---

You are implementing the **Time Tracking** module in CCRM as a real, working
feature: backend, database, API, frontend, permissions and tests. The design work
is already done. Your job is to build it.

## 0. Read these first, in this order

1. `CLAUDE.md` (repo root): testing, workflow rules and "Things that will bite you".
2. `docs/prompts/time-tracking-module.md`: **the functional specification and design
   brief.** Follow it, including its link to the design canvas (12 artboards), its
   phases, its permissions and its edge cases.
3. Everything in `.agents/rules/`, `docs/TESTING.md`, `docs/VIEW-SIZE.md`, and
   "Adding a permission" in `docs/db_integration_notes/RBAC_SYSTEM.md`.

**Precedence:** this prompt > `time-tracking-module.md` > the canvas. This prompt
changes the brief in four places (sections 1–4 below). Wherever the brief
disagrees with them, this prompt wins. Anything this prompt does not mention
follows the brief unchanged.

## Changes to the brief

### 1. A task-linked entry has no title of its own. It *is* the task's title.

An entry linked to a task has no separate entry title. The title you see on the
entry is the task's title, read live. Editing that title anywhere renames the
**task**.

- `time_entries.description` is the title **only for entries with no task and no
  ticket** (§4). For a linked entry it stays `NULL`, and every surface shows the
  linked item's title instead: List rows, Day rows and the Day "Notes" column,
  Calendar blocks, Timesheet rows, the entry drawer, the timer bar, the header
  pill, Reports (grouping by description groups by this derived title), CSV and
  PDF exports, and the extension popup.
- The API returns a resolved `title` and a `titleSource: 'task' | 'ticket' | 'entry'`
  on every entry. It gets them by joining `tasks.title` / `tickets.subject` server-side,
  so the extension and the reports work without the sync blob.
- **Editing the title of a linked entry** (drawer, inline in List/Day, timer bar
  while running) saves the **task** through the same frontend path that
  `TaskEditDrawer` uses. Tasks persist through `sync.php`, so this gets the
  normal conflict handling, audit and permission checks. Do not write
  `tasks.title` from `time_entries.php`. Next to the field, show a small hint such
  as "Renames the task". If the user cannot edit that task, the field is
  read-only and a tooltip says why. The extension shows linked titles read-only.
- Renaming a task renames every entry that points at it (it is a live join).
  This is intended.
- **Unlinking** the task from an entry makes its own title editable again,
  prefilled with the task's title as it was at that moment.
- **Linking** an existing standalone entry to a task drops the entry's own
  description. If that description was not empty and differed from the task
  title, ask first ("The entry's title will be replaced by the task's title").
- Timer bar autocomplete: typing matches open tasks and tickets by title.
  Picking one **links** it (task/ticket + its project). It does not copy text.
- `title_snapshot` (varchar 500, never shown while the task exists, never
  editable) is written on every save. It is used only as a greyed-out fallback
  when the task or ticket has been deleted, so the brief's rule "deleted items:
  entries stay, greyed out" keeps a readable title.

### 2. Working days and public holidays come from an API (SK and HU)

The brief keeps holidays as a hand-filled setting. Replace that with holidays
loaded from an API, for **Slovakia and Hungary**, shown in the app language and
used everywhere time tracking depends on working days.

- **Source:** Nager.Date, `GET https://date.nager.at/api/v3/PublicHolidays/{year}/{SK|HU}`.
  It needs no API key. Count only entries with `global: true` whose `types`
  include `Public`. Check the current response shape before you rely on it.
- **Fetched server-side only**, never from the browser. Add
  `public/api/holidays.php` plus a cache table
  `public_holidays(country CHAR(2), date DATE, local_name, name_en, source ENUM('api','builtin','manual'), fetched_at, PK(country,date))`
  in `schema.php`. Fetch a year the first time it is needed and refresh it from
  the server cron (current year + next year, monthly). Use a 5 s timeout. Use the
  outbound-HTTP conventions already in the codebase (look at how `ares_cz.php`
  and the egress guards in `auth.php` do it). Never fetch from the
  `sync.php ?probe=1` path or from schema migrations.
- **Offline fallback:** `src/utils/holidays.ts` (pure, with unit tests) computes
  the fixed-date and Easter-based SK/HU holidays. Use it when the API cannot be
  reached and nothing is cached, and in the QA suite (which mocks `/api/*`). When
  the fallback is in use, Settings shows an amber "Holidays: built-in list, the
  API could not be reached" note.
- **Overrides** in Settings → Time tracking, per country and per year: "extra day
  off" and "extra working day", each with a name. This matters for **Hungary**,
  which every year moves rest days and adds working Saturdays (*áthelyezett
  munkanap*) by decree. Nager does not carry those. Look for a reliable free
  machine-readable source for them. If you find none, say so in your plan and
  make manual entry clear (Settings explains it and links the official source).
  Do not invent dates.
- **Slovakia changed its holidays by law for 2025 onwards.** Check the API's SK
  data for 2026 against an official source. The brief's fixtures assume
  **September 2026 = 21 working days** (15 Sept off, 1 Sept a working day) and
  **October 2026 = 22**. If the API disagrees with an official source, or with
  these fixtures, **stop and tell me**. Do not change the fixtures to match.
- **Names in three languages.** Show `localName` when the UI language matches the
  holiday's country, otherwise the English name. Better still: add a small
  `en/sk/hu` name map for the ~15 SK and ~12 HU holidays (keyed by country + rule)
  so every combination reads natively. Fall back to the API names for anything
  unmapped.
- **Whose calendar applies:** company default = `CompanyProfile.country` mapped
  to SK/HU, or SK when unknown. Per-employee override `workCountry: 'SK' | 'HU' | null`.
  That is a change to Employees, so **confirm it in your plan** (as the brief
  requires). A user with no linked employee uses the company default.
- **Where holidays show up:** Day strip (muted, with the name in a tooltip),
  Calendar (an all-day band with the name; the cell is tinted like weekends),
  Timesheet column headers, Team matrix basis hours and utilisation bars, List
  day-card headers ("State holiday"), and the "This week / target" stat (the
  target excludes holidays). A holiday never blocks logging time on it.
- The brief's `publicHolidays: Record<string, string[]>` setting is replaced by
  `holidayOverrides` plus the cache table. Update the `TimeTrackingSettings`
  interface to match.

### 3. Cost rate depends on the worker's employment status

The brief's §5.1 formula stays. Make it explicit for every employment type, with
a **per-month** rate for monthly salaries that is based on that month's real
working days (§2 of this prompt, in that person's country).

| `Employee.kind` | `salaryType` | Hourly cost rate for an entry on date D | Multiplier |
|---|---|---|---|
| `employee` | `monthly` | `salary / workingDays(month of D, country) / hoursPerDay` (= man-day rate ÷ hoursPerDay) | × employer multiplier |
| `employee` | `daily` | `amount / hoursPerDay` | × multiplier |
| `employee` | `hourly` | `amount` | × multiplier |
| `contractor` (freelancer, company) | `hourly` | `amount` | none |
| `contractor` | `daily` (man-day price) | `amount / hoursPerDay` | none |
| `contractor` | `monthly` (retainer) | `amount / basisHours(month of D)` | none |
| `ledger`, no employee linked, no salary | — | `NULL`, source `none` | — |

- `workingDays` = Mon–Fri − public holidays + extra working days − extra days off
  (the overrides from §2). Vacation and sick days **do not** reduce it: the
  employee is paid for them.
- The setting `hoursBasis: 'fixed'` still replaces `workingDays × hoursPerDay`
  with `fixedHoursPerMonth` for the monthly types.
- Worked examples. These must be unit tests:
  - Erik, employee, monthly €3,200, Oct 2026 SK: 22 days → man-day €145.45 →
    €18.18/h → ×1.352 = **€24.58/h**. A 2:15:00 entry = **€55.31**.
  - The same salary in Sept 2026 SK (21 days) gives a different rate. Show that it
    does.
  - The same salary in Oct 2026 **HU** (23 Oct is a holiday, a Friday) → 21 days.
  - Freelancer, hourly €20 → **€20.00/h**, no multiplier.
  - Contractor company, man-day €160 → €20.00/h.
  - Employee, hourly €12 → €16.22/h.
  - No employee linked → `none`, cost `NULL`, shown as "no rate — no employee linked".
- `cost_rate_source` grows to: `monthly | daily | hourly | contractor_hourly | contractor_daily | contractor_monthly | none`.
  Store `cost_rate_basis_days` (the month's working days used) on the entry, so
  the drawer can explain the frozen rate in plain words: "€3,200 ÷ 22 working
  days (Oct 2026, SK) ÷ 8 h × 1.352 = €24.58/h".
- Everything lives in **one pure module**, `src/utils/timeCost.ts`, which takes
  the working-days count as an input and does no fetching. Mirror it in
  `public/api/time_cost.php` and add a test that runs both on the same fixtures.
  The snapshot, re-price and "creates no financial records" rules (brief
  §5.2–5.5) are unchanged. Project Finances gets the computed "Labour (time
  tracking)" line.
- In the Team matrix and the entry drawer, show the rate's month and its basis
  (tooltip: "Oct 2026 · 22 working days · man-day €145.45 · €24.58/h"), because
  a monthly employee's rate now differs from month to month.

### 4. An entry can be linked to a support ticket

An entry can be linked to a **project**, a **task**, or a **customer/support
ticket** (`Ticket`, `TicketsView.tsx`). Ticket-linked entries follow the same
title rule as tasks (§1): the title is `ticket.subject`, and editing it renames
the ticket through the normal ticket save path.

- Add `ticket_id varchar NULL` + index `(ticket_id)` to `time_entries`, and
  `'ticket'` to `origin_type`.
- **Link resolution:**
  - **Task:** `task_id` set. If that task has `relatedTicketId` (or a
    `ticket_task_links` row), `ticket_id` is also filled in, resolved the same
    way as `employee_id`, so the ticket's totals include work done on its tasks.
    The title comes from the task.
  - **Ticket only:** `ticket_id` set, `task_id` NULL, title = ticket subject.
  - The project is `ticket.projectId`. Without one, use the support contract's
    project (`contractId` → `SupportContract.projectId`). Without that, use the
    brief's §7.1 rule on the ticket's client (via `src/utils/leadClient.ts`).
    Otherwise there is no project.
- **Billable:** defaults to `ticket.billable`. The rate follows brief §7.3, using
  the ticket's contract.
- **Entry points:** in the ticket detail, add ▶ Start timer, a "running" state,
  and tracked/billable totals. The existing **Log time** form and the ticket's
  time list read and write **native entries** through `time_entries.php`
  (`ticketId` filter). They no longer write `ticket.timeEntries` into the sync
  blob. Also add a ticket picker to the entry drawer and timer bar, next to the
  task picker.
- **One source of truth, no double counting.** Today ticket time lives in
  `ticket_time_entries` and is read and written by `sync.php` (`$timeByTicket`
  around line 2400, and an upsert plus a **delete-not-in-payload** around
  6530–6700). The `ticket.loggedMinutes` and
  `SupportContract.hoursUsedThisMonth` fields are bumped client-side in
  `TicketsView.tsx` (`~1081–1103`), and `computeProjectRetainerUsage` in
  `src/utils/tickets.ts` sums `ticket.timeEntries`.
  - Add a one-time, idempotent migration in `schema.php` that copies
    `ticket_time_entries` → `time_entries`. Keep the original id in
    `external_id = 'tte:<id>'`. Resolve `user_id` from `user_id`, else from
    `user_name` through the existing name→user helpers. If that fails, store the
    entry under the ticket's assignee and record it in the migration log. Use
    `entry_date = logged_at`, hours-only. Price entries normally. Keep the
    original note in a read-only `legacy_note` column, shown as muted secondary
    text, so no data is lost. **Do not drop** `ticket_time_entries`.
  - After the migration, `sync.php` must **ignore** `timeEntries` in incoming
    ticket payloads, so an old cached PWA cannot delete or duplicate anything,
    and must stop serving them. The retainer usage, `loggedMinutes` and
    `hoursUsedThisMonth` figures are all derived from `time_entries`. In your
    plan, list every place that reads or writes these figures today and say how
    each one changes.
  - Remember the schema fingerprint rule in `CLAUDE.md`: the migration lives in
    a fingerprinted file.

## Rules for how you work

- **Plan gate.** Before phase 1, write your plan to
  `docs/plans/time-tracking-plan.md` and **stop for my approval**. The plan
  contains: schema (every table and column, including `ticket_id`,
  `title_snapshot`, `legacy_note`, `cost_rate_basis_days`, and the holidays
  table), the API surface, the ticket migration and sync changes from §4, the
  holiday source findings from §2 (including the HU working-Saturday question and
  the SK 2026 check), and answers to:
  1. The brief's §18 open questions 1–7. My answers so far: 2 → global multiplier
     for now; 5 → importer; 6 → zip first. Treat the rest as unconfirmed.
  2. `Employee.workCountry`: OK to add?
  3. Should a task/ticket-linked entry have its own short per-entry note (a note,
     not a title)? Default: **no**. Only migrated ticket notes are kept, read-only.
- **Phases** follow brief §17, with these additions: holidays (§2) and the full
  cost table (§3) belong in **phase 1**, and ticket linking plus the migration
  (§4) belong in **phase 2**, with the task entry points.
- **Every phase** passes `npx tsc --noEmit`, `npm run test:unit` and
  `npm run test:qa`, extends the QA suite (seed data + mocks for
  `/api/time_entries.php`, `/api/holidays.php`, `/api/time_tracker_ext.php`), and
  follows `.agents/rules/`: test → version bump → changelog → build → commit, with
  the version tag in the commit message. One phase = at least one build commit.
  Add QA checks for:
  - renaming a linked entry renames the task, and the ticket;
  - a holiday shows in the Day strip and the Calendar, and it lowers the weekly
    target;
  - a monthly employee's rate differs between Sept and Oct 2026;
  - a freelancer's flat rate;
  - logging time on a ticket counts once toward the contract;
  - cost is hidden without `time_tracking_costs`.
- **Backend:** edit `public/` only, then run `npm run sync:backend`. Lint PHP
  through Docker if PHP is not installed locally
  (`docker run --rm -v <dir>:/app -w /app php:8.2-cli php -l <file>`).
- **Shared checkout.** Other agent sessions may be editing this same working
  tree at the same time. Never `git stash`, never `git add -A`. Stage only your
  own hunks, and check `git diff` per file for foreign changes before every
  commit. Do not rebuild `dist/` while someone else has uncommitted frontend work
  in the tree; tell me instead. If QA port 5273 is busy, wait and retry. Do not
  kill the process holding it.
- **Never** make a QA finding go away by loosening a check. Never use
  `DEPLOY_SKIP_QA`.
- UI: reuse the existing primitives named in the brief, write every string with
  `t(en, sk, hu)`, use raw Tailwind palette classes like the rest of the
  codebase, and follow the per-device View size.
- Ask me before changing Finance or Employees beyond what this prompt and the
  brief describe.

## Reporting

At the end of each phase, report: what was built, the version number, the test
results (with output if anything failed), and anything you deferred or assumed.
Report a bug or design gap you find in existing code as **symptom → root cause →
proposed fix**, and do not silently fix things outside the phase's scope.
