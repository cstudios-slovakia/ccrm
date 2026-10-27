# Time tracking: the one file

This is the **only** document for the Time Tracking module: status, decisions,
what to build in each phase, and the full specification. It replaces the old
plan and the two prompts (`docs/plans/time-tracking-plan.md`,
`docs/prompts/time-tracking-implementation.md`, `docs/prompts/time-tracking-module.md`).
Those three are gone; git history keeps them.

> **To start work, tell any coding agent:** `make phase 2` (or "make the next phase").
> The agent reads this file and follows Part A.

Written for any coding agent (Claude Code, Cursor, Grok, Antigravity, Codex, …).
It uses only plain markdown, file paths and shell commands.

---

# Part A. How to work with this file

## A1. The protocol for "make phase N"

1. **Read this whole file**, then the repo rules that apply to every change:
   `CLAUDE.md` (the same rules are in `AGENTS.md` / `GEMINI.md`), `docs/TESTING.md`,
   `docs/VIEW-SIZE.md`, everything in `.agents/rules/`, and "Adding a permission" in
   `docs/db_integration_notes/RBAC_SYSTEM.md`.
2. **Check the status table (A2).**
   - Every earlier phase must be ✅. If an earlier phase is 🟡, finish its
     **Left over** items first (they belong to that phase), and say so in your report.
   - If phase N is already ✅, stop and tell the user.
3. **Build only the checklist of phase N (A4).** Part C is the detailed spec.
   Part B (decisions) is final: do not re-ask and do not change it. If a source,
   fixture or API disagrees with a decision or a number in this file, **stop and tell the
   user**. Do not change a fixture to make a test pass.
4. **Test** (all must pass): `npx tsc --noEmit`, `npm run test:unit`, `npm run test:qa`,
   plus the phase's own checks. Extend the QA suite with the phase's QA items (A4, C19).
   Never loosen a check to make a finding disappear. Never use `DEPLOY_SKIP_QA`.
5. **Ship in the repo's order:** test → version bump (`src/utils/version.ts`) → changelog
   (`1.13-nectarine-changelog.md`) → build → commit with the version tag in the message.
   One phase = at least one build commit.
6. **Update this file in the same commit:**
   - tick the phase's checkboxes (`- [x]`);
   - fill the phase's row in the status table (status, version, commit, date);
   - write what you deferred or assumed under the phase's **Left over** line;
   - add anything new you learned to **Findings (A5)**.
   Use ✅ only when every box is ticked, the tests are green and the build is committed.
   Otherwise use 🟡 and list what is missing.
7. **Report to the user:** what was built, the version, test results (with the output of
   anything that failed), what you deferred or assumed. Report a bug or design gap in
   existing code as **symptom → root cause → proposed fix**; do not silently fix things
   outside the phase.
8. **Stop.** Do not start the next phase.

### Rules that apply to every phase

- **Backend:** edit `public/` only, then `npm run sync:backend`. PHP is linted through
  Docker if it is not installed:
  `docker run --rm -v <dir>:/app -w /app php:8.2-cli php -l <file>`.
- **Shared checkout.** Other agents may edit the same working tree at the same time.
  Never `git stash`, never `git add -A`. Stage only your own hunks and check `git diff`
  per file for foreign changes before every commit. Do not rebuild `dist/` while someone
  else has uncommitted frontend work; tell the user instead. If QA port 5273 is busy, wait
  and retry; do not kill the process holding it.
- **UI:** reuse the existing primitives (`PageHeader`, `EntityHeader`, `Surface`, `Tabs`,
  `StatGrid`, `Toolbar`, `CustomSelect`, `HoldToConfirm`, `UndoToast`, the drawer pattern of
  `TaskEditDrawer`). Write every string with `t(en, sk, hu)`. Use raw Tailwind palette
  classes like the rest of the codebase (this repo does not use semantic colour tokens).
  Type and spacing follow `docs/VIEW-SIZE.md`.
- **Do not** put time entries into the `sync.php` blob and do not add work to the
  `?probe=1` path.
- **Ask first** before changing Finance or Employees beyond what this file describes.
- **Settings** is one registry now (`src/components/settings/settingsRegistry.ts`, see
  `docs/SETTINGS.md`). The Time tracking settings are the section `projects/time`.
- Licensing never disables the running module (`.agents/rules/licensing.md`).

## A2. Status

Legend: ⬜ not started · 🟡 built but not finished (see Left over) · ✅ done (tests green, built, committed)

| # | Phase | Status | Version | Commit | Date |
|---|---|---|---|---|---|
| 1 | Core, holidays, cost | 🟡 | v1.13.4-Nectarine | `04cc18b6` | 2026-10-27 |
| 2 | Entry points and tickets | 🟡 | v1.13.6-Nectarine | | 2026-10-27 |
| 3 | Calendar and Timesheet | 🟡 | v1.13.11-Nectarine | | 2026-10-27 |
| 4 | Team, Reports, salary allocation, exports | 🟡 | v1.13.11-Nectarine | | 2026-10-27 |
| 5 | Chrome extension, then activity capture and Unsorted | 🟡 | v1.13.11-Nectarine | | 2026-10-27 |
| 6 | Locking and approval, Toggl import, mobile polish, idle reminder | 🟡 | v1.13.11-Nectarine | | 2026-10-27 |

Branch: all phases go on `1.13-nectarine`. (Phase 1 was first committed on `1.12-mango`
as v1.12.84 by mistake. It was moved on 2026-10-27; a backup ref
`backup/time-tracking-phase1-on-1.12` keeps the original two commits.)

## A3. Verification log

### Phase 1, checked 2026-10-27 against the plan, the code and the tests

Only phase 1 was built. Nothing from phases 2 to 6 is in the code: no ticket migration
or `sync.php` ticket changes (the only `sync.php` change is `employees.work_country`),
no Calendar, Timesheet, Team or Reports tabs (the module has List and Day), no task ▶,
no project Time tab, no Finances "Labour" line, no `tickets.time` permission, no
extension, no `time_tracker_*` tables.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npm run test:unit` | 946 pass, 0 fail, 5 skipped (whole suite) |
| PHP lint of the 9 changed PHP files (Docker, php 8.2) | no syntax errors |
| `npm run test:time-cost` (PHP against the same fixtures as `timeCost.test.ts`) | all checks passed |
| `npm run test:time-tracking` (real PHP + scratch database, 65 checks) | 65 / 65 on the second run. The first run lost one connection during the re-price request (`other side closed`) and did not repeat. |
| `npm run test:qa` for `tests/e2e/timeTracking.spec.ts` | see "Left over" below |

Against the plan's phase 1 scope:

- [x] Schema: `time_entries` (all columns, `running_guard` UNIQUE), `public_holidays`, `employees.work_country`
- [x] `timeCost.ts` + `time_cost.php` + shared fixtures (Erik €24.58/h Oct, €27.04/h May, €25.75/h HU Oct, freelancer, contractor, hourly, none)
- [x] `holidays.ts` + `holidays.php` + `holidays_lib.php` + monthly refresh in `cron.php` (never from the probe or a migration)
- [x] `time_entries.php`: list, running, start (one transaction, 409 on a lost race), stop, create, update, soft delete and restore, settings, re-price
- [x] Timer bar, List, Day (hours-only rows), header pill, entry drawer, project picker, Settings section
- [x] RBAC section (4 keys, mirrored in `permissions.php`), route mapping, sidebar, Start menu, Visible modules
- [x] Title rule built in from the start
- [x] Cost stripped server-side; owner always sees own cost

Gaps found: see "Left over" in phase 1 (A4).

## A4. Phases

### Phase 1. Core, holidays, cost

Spec: C2 to C9, C11 (List, Day, drawer, picker), C13, C16.

- [x] Schema: `time_entries`, `public_holidays`, `employees.work_country` (C4)
- [x] `src/utils/timeCost.ts` + tests, PHP mirror `public/api/time_cost.php`, fixtures `scripts/fixtures/time-cost-cases.json` (C7)
- [x] `src/utils/holidays.ts` + tests, `public/api/holidays.php`, cron refresh, overrides, amber "built-in list" note (C6)
- [x] `public/api/time_entries.php` core actions (C4.4)
- [x] Timer bar, List, Day with hours-only rows, header pill, tab-title prefix, entry drawer, project picker (C8, C11)
- [x] Settings: hours basis, multiplier with live example, holidays list and overrides, rules, re-price (C13)
- [x] RBAC (`time_tracking`, `_team`, `_costs`, `_salary_report`), route, sidebar, Start menu, Visible modules (C16)
- [x] Title rule: linked entry has no title of its own (C5)
- [x] `Employee.workCountry` (type, column, employee form, sync mapping) (C6)
- [x] Unit tests, PHP parity test, server probe, e2e spec written (`tests/e2e/timeTracking.spec.ts`)
- [x] **Module setup wizard step** (`ModuleSetupWizard.tsx`): hours basis, multiplier, which users track time, extension on/off.
- [ ] **`npm run test:qa` for the time tracking spec**: the spec was written but never executed ("QA not run at the owner's request"). Run it, fix what it finds.
- [ ] **Build commit on `1.13-nectarine`** (`dist/` bundle) once QA is green. The original bundle was on `1.12-mango` and was dropped with the move.

**Left over:** QA and the build commit. The wizard step is in. Who tracks time is stored on the role, so people who share a role are checked together, and administrators stay on.
**Open item carried to later:** verify HU 24 Dec 2026 against the official decree before adding it to the built-in list (it is deliberately absent). SK 1 Sept 2026 is settled (working day).
**Moved to phase 2:** the brief's extra columns (`tasks.estimate_minutes`, `projects.hours_budget`, `projects.billable_rate`, project type `isInternal`) were not added in phase 1. Nothing reads them before the project Time tab, so they start phase 2.

### Phase 2. Entry points and tickets

Spec: C9, C10, C5, C7.4 (billable rate), C4.3.

- [x] Schema: `tasks.estimate_minutes`, `projects.hours_budget`, `projects.billable_rate`, project type `isInternal`, `tickets.time` permission (C4.3, C16)
- [x] Task card ▶ and tracked-time chip, `TaskEditDrawer` "Time tracking" section (C9.2)
- [x] Project "Start timer on this project" and the project **Time** tab in `ProjectDetailsView`
- [x] Project Finances: computed "Labour (time tracking)" line, included in real profit and the profit badge. No financial records created (C7.5)
- [x] Task without a project: the "Which project is this for?" popover (C9.1)
- [x] Ticket linking in the timer bar and drawer (ticket picker next to the task picker), ticket title rule (C5)
- [x] Ticket detail: ▶ Start timer, running state, tracked and billable totals; **Log time** and the time list use native entries (C10)
- [x] Ticket-time migration `ticket_time_entries` → `time_entries`, idempotent, in a fingerprinted file (C10.3)
- [x] `sync.php` ticket-time changes and `TicketsView` rewrite from the table in C10.4
- [x] Retainer usage derived from entries (`computeProjectRetainerUsage`), counted once (C10.5)
- [x] Billable rate priority resolution (C7.4)
- [ ] QA: renaming a linked entry renames the task and the ticket; logging time on a ticket counts once toward the contract; ticket time hidden without `tickets.time`; start-from-task prefill
- [x] Unit tests, server probe checks for the migration, e2e spec extended

**Left over:** QA was skipped at the owner's request (2026-10-27), including the phase 1 run of `tests/e2e/timeTracking.spec.ts`. The new checks are in that spec and in `scripts/probe-time-tracking/run.mjs` (T12) but neither was executed. "Create project for the client" is wired, and the task drawer lists each person plus a cost figure the viewer is allowed to see. Lowering a ticket's logged total writes nothing and tells the admin to shorten or delete an entry (`ticketLoggedTotalAdjustment`); raising it still adds one positive hours-only correcting entry. The typed total reverts to the real sum. Phase 1's wizard step is done; its QA and build commit are still open.

### Phase 3. Calendar and Timesheet

Spec: C11.2, C11.3, C6.5 (holidays shown here).

- [x] Calendar tab (Day / Week / Month): drag to create, move, resize, "Untimed" lane, running entry with a "now" line, task rail with drag-to-calendar
- [x] Timesheet tab: weekly grid, Totals row, hours-only entries from cells, "Copy rows from last week", "+ Add row"
- [x] Holidays: all-day band and tinted cell in the Calendar, Timesheet column headers
- [ ] QA: a holiday shows in the Calendar and the Timesheet header; hours-only entry in the Untimed lane
- [x] Unit tests. The e2e spec was not extended.

**Left over:** QA was skipped at the owner's request (2026-10-27). On the month grid, creating time is a click (09:00–10:00); dragging between days moves an entry. A paid payroll month now locks Calendar move, resize and create, and Timesheet cell edits, for a non-admin. The month list is that employee's paid `employeeSalaries` rows already on the client, plus a month the time-entry API already flagged on a loaded entry. Age and approval locks still apply. Admins can still edit; the API remains the enforcement. "Submit week" mounts phase 6's `SubmitWeekButton`.

### Phase 4. Team, Reports, salary allocation, exports

Spec: C11.4, C12, C4.4 (`team`, `report`).

- [x] Team tab (matrix people × week/month, hours, cost, basis bars, vacation, popover, Totals) (needs `time_tracking_team`; cost lines need `time_tracking_costs`)
- [x] "Viewing as" selector (Me / Whole team / one person) across List and Day
- [x] Reports: Summary and Detailed, filters, grouping by derived title, Totals row
- [x] Salary allocation report (admins, `time_tracking_salary_report`), "Time without salary data"
- [x] Exports: CSV, client PDF (rounded, no cost, billable only)
- [x] Rate month and basis shown in the Team matrix tooltip (C7.3)
- [ ] QA: Team matrix totals; cost hidden without `time_tracking_costs`; user without an employee record
- [x] Unit tests. The e2e spec was not extended.

**Left over:** QA was skipped at the owner's request (2026-10-27). Team and Reports are computed on the client from the entries list. No `action=team` or `action=report` was added. Other people's cost is removed in `visibleEntryCost`, not only hidden in CSS.

### Phase 5. Chrome extension, then activity capture and Unsorted

Spec: C15, C4.2, C4.4 (`time_tracker_ext.php`).

- [x] 5a. Tables `time_tracker_pairing_codes`, `time_tracker_devices`; `public/api/time_tracker_ext.php` (Bearer device key, CORS for `chrome-extension://<id>`, pair rate-limited per IP)
- [x] 5a. Extension source in `extensions/chrome-time-tracker/` (Manifest V3, TypeScript, Vite), popup (running, idle, not paired), badge, offline queue, "Paired browsers" with Revoke
- [x] 5a. `npm run build:extension` zips to `public/downloads/ccrm-time-tracker.zip` (committed)
- [x] 5b. Activity capture (opt-in, off by default), table `time_activity`, `activity` endpoint, Unsorted inbox (Day panel, List chip, extension footer), purge in cron
- [ ] QA: pairing flow with the mock, one running timer shared with the extension, revoked device returns 401
- [x] Unit tests. The e2e spec was not extended.

**Left over:** QA was skipped at the owner's request (2026-10-27). The zip is on disk at `public/downloads/ccrm-time-tracker.zip` and is not committed. The extension download, pairing code, and paired browsers live in Settings → Time tracking. There is no module overflow-menu entry. The new PHP files exist only under `public/api/` (the sync script does not create a root copy for a file that has none).

### Phase 6. Locking and approval, Toggl import, mobile polish, idle reminder

Spec: C14, C13 (locking), C17.

- [x] Locking (entries older than `lockAfterDays`, in a paid payroll month, or approved: admin edit only, audit-logged) and weekly approval ("Submit week")
- [x] Toggl importer on the existing connector (`time_tracking_lib.php`): map projects and users, date range, preview, idempotent through `external_id`; shows "N entries already imported"
- [x] `EmployeeTimesheetSummary` source switch "Toggl / CCRM time tracking" (explicit, per view, never automatic)
- [x] Mobile polish (large running card, 44 px ▶, bottom bar), idle reminder in the PWA
- [ ] QA: import is idempotent; locked entry opens read-only
- [x] Unit tests. The e2e spec was not extended.

**Left over:** QA was skipped at the owner's request (2026-10-28). No new columns: approval uses `time_entries.approval_status`, and a paid month is read from `employee_salaries`. Calendar and Timesheet use that same fact from the sync blob so a drag, resize or cell edit in a paid month does not start. `npm run sync:backend` has copied the root files that already had a counterpart (`cron.php`, `schema.php`, `time_tracking_lib.php`). Version is v1.13.11-Nectarine.

## A5. Findings in existing code

Symptom → root cause → proposed fix. Fixed only inside the phase named.

1. **Ticket → contract link is not persisted.** `ticket.contractId` and `SupportContract.hoursUsedThisMonth` vanish after reload. The `tickets` table has no `contract_id`; the `sync.php` GET never emits `contractId` and sends `usedHours: 0.0`; `hoursUsedThisMonth` is only React state bumped in `TicketsView.tsx` (~1089-1103). `support_contracts` has no `reset_day`. Fix (phase 2): derive contract usage from `time_entries`, resolving the contract as `resolveProjectRetainer` does (ticket → project → contract by `project_id`, else client → contract by `client_id`). No new `tickets.contract_id` column.
2. **`ticket.billable` is hardcoded `true`** in the `sync.php` GET (~line 2475) and there is no `tickets.billable` column. Keep the default `true` and add no column.
3. **Delete-not-in-payload on ticket time** (`sync.php` ~6687-6692): a stale PWA tab that lacks an entry deletes the server's entries. Fixed by the phase 2 migration and by ignoring incoming `timeEntries`.
4. **No dedicated name → user helper exists** beyond ad-hoc `users` queries in `auth.php`. Phase 2 adds one small helper beside the migration: case-insensitive exact match on `users.name`, accepted only when exactly one user matches.
5. **Only Toggl is implemented.** `provider === 'clockify'` answers "Unsupported provider" and the Clockify settings fields are placeholders. Keep that. Clockify import is not built unless the user asks.
6. **Price levels have no hourly rate.** `PriceLevel` is an id and a name for warehouse prices. C7.4 step 4 is implemented and tested when a caller supplies a number; the server passes none, because there is no column to read. Adding a rate means a new field, not a lookup that already exists.
7. **Dark-mode Start contrast,** fixed by `text-primary-foreground`.

---

# Part B. Decisions (final)

Decided by the project owner. Do not re-ask. If reality contradicts one, stop and report.

| # | Decision |
|---|---|
| B1 | **Slovakia Sept 2026 = 22 working days, not 21.** The original brief's fixture was wrong: Nager.Date and the consolidated law 241/1993 (new § 4b: in 2026 the days in § 2 ods. 2 písm. e) and j), 15 Sept and 8 May, are not rest days) agree. 1 Sept is a working day. The "rate differs by month" example and QA check use **May 2026 = 20 days (€27.04/h) vs June 2026 = 22 days (€24.58/h)**. |
| B2 | **Hungary:** the API carries only statutory holidays. Decree days (*áthelyezett pihenőnap*, *ledolgozós szombat*) are **manual overrides only**; no free machine-readable source exists. Never invent dates. 24 Dec 2026 stays out of the built-in list until verified against the official text (NGM decree, njt.hu / Magyar Közlöny). |
| B3 | **Holidays follow the person's work country, never the UI language.** The language only picks the holiday's *name* (en/sk/hu map). Country = `Employee.workCountry`, else the company country (`CompanyProfile.country` mapped to SK/HU, else SK). A Slovak-language user with `workCountry = 'HU'` sees Hungarian holidays named in Slovak. |
| B4 | `Employee.workCountry` ('SK' \| 'HU' \| null) is approved (type, `employees.work_country`, employee form, sync mapping). |
| B5 | **Keep the existing Toggl connectors untouched** (`time_tracking.php`, `time_tracking_lib.php`, `my_employment.php`, `employees.time_tracking_*`, `EMPLOYEE_SETTINGS.timeTracking`, `EmployeeTimesheetSummary`). Phase 6 builds the importer on top of them. |
| B6 | Salary source for past months: **`Employee.salaryAmount`** (an `EmployeeSalary` record mixes base pay with bonuses and would inflate the rate). A per-month override can come later. |
| B7 | Employer multiplier is **global** (1.352 default). |
| B8 | **Employees see their own cost rate and cost.** Others' cost needs `time_tracking_costs`. `billable_rate` and margins always need it. |
| B9 | **"Require a project before Stop" defaults to on** (`requireProjectToStop: true`). |
| B10 | Toggl is a **one-way importer**, not a live sync. |
| B11 | Chrome extension ships as a **zip first** (Web Store later). |
| B12 | Activity capture ships, **opt-in, off by default**. |
| B13 | A task- or ticket-linked entry has **no own note**. Only migrated ticket notes survive, read-only, in `legacy_note`. |
| B14 | **No `tickets.contract_id` column.** The contract is found from the ticket's project, else its client (finding A5.1). |
| B15 | **Ticket time visibility:** admins, project managers and any role given the new toggle `tickets.time` (needs `tickets` ≥ view; on for Admin and Project Manager, off for new roles). Not visible to clients by default, never on non-employee surfaces (ticket widget, public ticket token). Setting `ticketTimeVisibleToClients` (default false) is stored and enforced in the endpoint that would serve it. No client-facing time view is built. Users with `time_tracking_team` see ticket entries through the Team views. |
| B16 | Ticket `billable` defaults to `true` (no column, finding A5.2). |
| B17 | Keep the existing Toggl summary; the native module never hides Toggl data. A per-view switch (phase 6) avoids double counting. |

---

# Part C. Specification

Where this part and an older note disagree, this part wins.

## C1. What the module is

A native, Toggl-style time tracker built into CCRM.

- Every entry is owned by the **user who records it** (a CCRM login, `users.id`).
- An entry belongs to a **project**, and optionally to a **task** and/or a **support ticket**. An entry without a project is allowed but flagged (C8.3).
- Each entry is priced at the owner's **hourly cost rate**, from the salary of the employee record linked to that login. That gives a real labour cost per project and a report of where each salary went.

Time is recorded from the timer, from tasks, from projects, from the calendar, as hours-only
day rows, from the timesheet and from a **Chrome extension**. The existing Toggl
integration stays and later feeds an **importer** into the native table (C14).

Visual reference (optional, needs the owner's account; this file is complete without it):
design canvas `https://claude.ai/artifact/G1ZJkEvLUbzXAQG8bpwwsd` (12 artboards). The
numbers in the mockups are consistent with each other and may serve as fixtures, except
where Part B overrides them (B1). Do not copy another Cstudios app's code or styling.

## C2. Screens

The route is `time-tracking`. Tabs: **List · Day · Calendar · Timesheet · Team · Reports**
(phase 1 ships List and Day). The "Viewing as" selector sits right of the tab bar: *Me* by
default; managers can pick *Whole team* or one person.

| # | Screen | Where it lives |
|---|---|---|
| 1 | Timer + List | Tab **List** (default) |
| 2 | Calendar (Day / Week / Month) | Tab **Calendar** |
| 3 | Timesheet (weekly grid) | Tab **Timesheet** |
| 4 | Edit entry drawer + project picker | Right drawer, from any entry anywhere |
| 5 | Start from a task | Task cards and `TaskEditDrawer` |
| 6 | Project → Time tab | New tab in `ProjectDetailsView`, after **Tasks** |
| 7 | Reports + salary allocation | Tab **Reports** |
| 8 | Settings → Time tracking | Section `projects/time` of the Settings registry |
| 9 | Mobile timer | The same route at phone width (PWA) |
| 10 | Daily log | Tab **Day**: strip, hours-only rows, logs grouped by user, Unsorted inbox |
| 11 | Team work and expenses | Tab **Team**: person × week/month matrix of hours and cost |
| 12 | Chrome extension | Module ⋯ menu → "Chrome extension" (also linked from Personal settings), plus the popup |
| — | Header | `Header.tsx`: the global running-timer pill |
| — | Sidebar | `Sidebar.tsx`: module icon `Timer`, teal |

### Visual mapping

- Module colour **teal-600** (`#0d9488`). Active sidebar item: `bg-teal-600 text-white shadow-lg shadow-teal-600/30 border border-teal-500/20`.
- Primary actions and Start: `bg-primary` (`#4f6edb`). Running state and Stop: `rose-600`. Billable: `emerald-*`. "Assign project" and Unsorted: `amber-*`. Cost figures in the Team matrix: `violet-700`.
- Cards: `Surface` (rounded-3xl, white, `border-slate-200/80`); insets `Surface tone="inset"`.
- Durations and money always use `tabular-nums`.
- Project colour: the project's own, else a stable colour hashed from the project id out of a fixed 8-colour palette. The same project has the same colour everywhere.

## C3. Ownership: whose time is it

- `user_id` (**required**): the login whose time this is; by default the logged-in user.
- `recorded_by_user_id`: who typed it. Differs only when a manager logs time for someone (the drawer's **Person** field, shown only with `time_tracking_team`). Lists show "Recorded by …" then.
- `employee_id` is **resolved, not chosen**: the `employees` row whose `userId` equals `user_id`, written on save. It supplies the salary.
- **A user with no linked employee can still track time.** `employee_id = NULL`, `cost_rate_source = 'none'`, cost shown as "no rate — no employee linked" (amber). An admin can re-price later (C7.6).
- Contractors are `employees` with `kind = 'contractor'`; they log through their own login or through a manager's Person field.

## C4. Data model and API

### C4.1 `time_entries` (in `public/api/schema.php`, covered by `ccrm_schema_fingerprint()`)

| Column | Type | Notes |
|---|---|---|
| `id` | varchar(64) PK | `te-<uuid>` |
| `user_id` | varchar(50) NOT NULL | owner |
| `recorded_by_user_id` | varchar(50) NOT NULL | who typed it |
| `employee_id` | varchar(50) NULL | resolved from `user_id` on save |
| `project_id` | varchar(50) NULL | NULL = "Assign project" |
| `task_id` | varchar(50) NULL | must belong to `project_id` when both are set |
| `ticket_id` | varchar(50) NULL, index | |
| `description` | varchar(500) NULL | the title **only** for entries with no task and no ticket; NULL when linked (C5) |
| `title_snapshot` | varchar(500) NULL | written on every save; never shown while the task/ticket exists; never editable |
| `legacy_note` | varchar(500) NULL | read-only; migrated ticket-time notes |
| `entry_date` | DATE NOT NULL | company-timezone date |
| `start_at`, `end_at` | DATETIME NULL | UTC. `start_at` NULL = hours-only entry; `end_at` NULL while running |
| `duration_sec` | INT NULL | required unless running |
| `billable` | TINYINT(1) | |
| `billable_rate` | DECIMAL(10,2) NULL | snapshot |
| `cost_rate` | DECIMAL(10,4) NULL | snapshot of the hourly cost rate |
| `cost_rate_source` | varchar(32) | `monthly \| daily \| hourly \| contractor_hourly \| contractor_daily \| contractor_monthly \| none` |
| `cost_rate_basis_days` | TINYINT NULL | the month's working days used (NULL for hourly and `none`) |
| `cost` | DECIMAL(12,2) NULL | `duration_sec / 3600 × cost_rate` |
| `tags` | JSON | |
| `source` | varchar(16) | `timer \| manual \| day \| calendar \| timesheet \| extension \| activity \| toggl \| clockify \| ticket_legacy` |
| `origin_type`, `origin_id` | varchar NULL | where it was started: `task`, `ticket`, `project`, `calendar`, `activity` |
| `device_id` | varchar NULL | the extension device |
| `external_id` | varchar NULL | Toggl/Clockify id; migrated ticket time uses `tte:<id>`; unique per `source` |
| `approval_status` | varchar(16) NULL | only with weekly approval |
| `running_guard` | generated, UNIQUE | `IF(start_at IS NOT NULL AND end_at IS NULL AND deleted_at IS NULL, user_id, NULL)`: the database allows one running timer per user |
| `created_at`, `updated_at`, `deleted_at` | | soft delete for Undo and the audit log |

Indexes: `(user_id, entry_date)`, `(project_id, entry_date)`, `(task_id)`, `(ticket_id)`,
`(employee_id, entry_date)`, unique `(source, external_id)`.
**No foreign keys** to tasks, tickets, projects or users: an entry must survive deletion
of the item (shown greyed out with `title_snapshot`).

Hours-only entries appear in List, Day, Timesheet, Team and Reports. On the Calendar they
sit in an "Untimed" lane above the hour grid; dragging one into the grid gives it times.

### C4.2 Other tables

- `public_holidays(country CHAR(2), date DATE, local_name, name_en, source ENUM('api','builtin','manual'), fetched_at, PK(country, date))`
- `employees.work_country CHAR(2) NULL` (SK | HU)
- Phase 5:
  ```
  time_tracker_pairing_codes(code_hash CHAR(64) PK, user_id, expires_at, used_at NULL, created_at)
    -- 8 characters shown XXXX-XXXX, valid 10 min, single use, sha256 stored
  time_tracker_devices(id PK, user_id, key_hash CHAR(64) UNIQUE, key_prefix VARCHAR(12),
    name, browser, os, extension_version, created_at, last_used_at, revoked_at NULL)
    -- modelled on `mcp_keys`: only the hash is stored; the full key is returned once
  time_activity(id PK, user_id, device_id, domain, page_title VARCHAR(300), started_at, ended_at,
    duration_sec, suggested_project_id NULL, status ENUM('unsorted','assigned','dismissed'),
    entry_id NULL, created_at)
    -- the "Unsorted" inbox; rows older than N days are purged by cron
  ```
- `ticket_time_entries` is **kept** (never dropped), no longer written after phase 2.
- Settings blob `TIME_TRACKING_SETTINGS` in `system_settings`; per-user `TIME_TRACKING_ACTIVITY_RULES` (phase 5).

### C4.3 Additions to existing entities (phase 2)

`Task.estimateMinutes?: number | null` (`tasks.estimate_minutes`), `Project.hoursBudget?`
(`projects.hours_budget`), `Project.billableRate?` (`projects.billable_rate`), project
type flag `isInternal` (default false; `projects.is_internal`).

### C4.4 API: `public/api/time_entries.php` (session auth)

- `GET ?from&to&userId&projectId&taskId&ticketId&running`: list. Every entry carries the resolved `title`, `titleSource: 'task' | 'ticket' | 'entry'` and `titleDeleted: bool` (greyed fallback from `title_snapshot`).
- Without `time_tracking_costs`, `cost_rate`, `cost`, `billable_rate`, `cost_rate_basis_days`, `cost_rate_source` are **stripped server-side**, except on the caller's own entries (B8). Without `time_tracking_team`, `userId` is forced to the caller.
- `GET ?running=1`: the caller's running entry.
- `POST action=start`: in **one transaction** stop the caller's running entry and insert the new one; return both for the Undo toast. A start that loses a race answers 409 with the entry that already runs.
- `POST action=stop {id}`; `POST/PUT/DELETE` (soft) and `restore` for manual, hours-only, calendar and timesheet entries; `settings`; `reprice`.
- Phase 4: `GET action=team&from&to&bucket=week|month&activeOnly&projectId`, `GET action=report&…`.
- Phase 5: `GET action=unsorted`, `POST action=assign|dismiss`.
- Phase 6: `POST action=import` (Toggl).
- **Never write `tasks.title` or `tickets.title` here.** Renaming goes through the existing frontend save paths (C5).
- Link resolution on save: task → fills `ticket_id` from `tasks.related_ticket_id` (or a `ticket_task_links` row), then the project; ticket only → project via `ticket.project_id`, else the contract's project, else the client rule (C9.1); always writes `title_snapshot`.
- Ticket reads (`ticketId` filter) require `tickets.time` (B15) from phase 2.

`public/api/time_tracker_ext.php` (phase 5): authenticated by `Authorization: Bearer <device key>`,
never by session cookie; CORS for `chrome-extension://<id>`. `POST pair {code, deviceName,
browser, os, version}` → `{deviceKey, user, ccrmUrl}` (rate-limit per IP); `GET running`,
`POST start`, `POST stop`, `GET recent`, `GET projects?q=`, `GET tasks?projectId=`,
`POST activity` (batch), `GET unsortedCount`. Every call updates `last_used_at`; a revoked
key returns 401 and the extension shows "not paired". Linked entries come back with the
resolved `title`; the extension shows linked titles read-only.

The web app refreshes the running timer on load, on `visibilitychange` and after
start/stop. The extension polls `running` every 60 s through `chrome.alarms`.

`public/api/holidays.php` (session auth): `GET ?country=SK|HU&year=YYYY` →
`{days:[{date, localName, nameEn, names:{en,sk,hu}, kind, source}], fallback: bool}` (C6).

Changes to existing endpoints: `permissions.php` / `permissions.ts` (the `time_tracking*`
keys, and `tickets.time` in phase 2); `cron.php` (holiday refresh in phase 1; auto-stop at
`autoStopAt` and unsorted purge later); `sync.php` (C10.4).

## C5. The title rule: a task-linked entry has no title of its own

An entry linked to a task or ticket shows **that item's title**, read live. Editing it anywhere
renames the **task** (or ticket).

- `time_entries.description` is the title only for entries with no task and no ticket. For a linked entry it stays `NULL` and every surface shows the linked item's title: List rows, Day rows and the Day "Notes" column, Calendar blocks, Timesheet rows, the drawer, the timer bar, the header pill, Reports (grouping by description groups by this derived title), CSV and PDF exports, and the extension popup.
- The API joins `tasks.title` / `tickets.title` server-side (the ticket "subject" is the `title` column), so the extension and reports work without the sync blob.
- **Editing the title of a linked entry** (drawer, inline in List/Day, timer bar while running) saves the **task** through the same frontend path `TaskEditDrawer` uses (`onSave`; for tickets `updateSelectedTicket`), so conflict handling, audit and permission checks apply. Next to the field a hint reads "Renames the task" / "Renames the ticket". If the user cannot edit the item, the field is read-only with a tooltip saying why.
- Renaming a task renames every entry that points at it (live join). Intended.
- **Unlinking** makes the entry's own title editable again, prefilled with the task's title at that moment.
- **Linking** an existing standalone entry drops its description. If it was non-empty and differed from the task title, ask first ("The entry's title will be replaced by the task's title").
- Timer bar autocomplete matches open tasks and tickets by title. Picking one **links** it (item + its project); it does not copy text.
- `title_snapshot` is only the greyed fallback after the task or ticket was deleted.

## C6. Working days and public holidays (Slovakia and Hungary)

### C6.1 Source and caching

- **Nager.Date** `GET https://date.nager.at/api/v3/PublicHolidays/{year}/{SK|HU}`, no key. Count only `global: true` entries whose `types` include `Public`. Response shape was checked on 2026-10-26: `date, localName, name, countryCode, fixed, global, counties, launchYear, types`.
- **Server-side only** (`public/api/holidays.php`, `holidays_lib.php`), never from the browser. 5 s timeout, `https` only, no redirects, peer verification on, `ccrm_assert_public_host('date.nager.at')` (the egress guard in `auth.php`). Cached in `public_holidays`. Fetched on first need; refreshed monthly for the current and next year from `api/cron.php` (a `system_settings` timestamp gates it). **Never** from `sync.php`, from `?probe=1`, or from a migration.
- **Offline fallback:** `src/utils/holidays.ts` (pure, unit-tested) computes the fixed-date and Easter-based SK/HU holidays. Used when the API cannot be reached and nothing is cached, and in the QA suite (which mocks `/api/*`). Settings then shows an amber "Holidays: built-in list, the API could not be reached" note.

### C6.2 Overrides

Settings → Time tracking → Overrides, per country and per year: **extra day off** and
**extra working day**, each with a name. Needed for Hungary (B2). Settings explains this and
links the official source (njt.hu).

```ts
holidayOverrides: Record<'SK' | 'HU', Record<string /* year */, Array<{
  date: string;                          // YYYY-MM-DD
  kind: 'extraDayOff' | 'extraWorkingDay';
  name: string;
}>>>;
```

### C6.3 Names

Show `localName` when the UI language matches the holiday's country, else the English name.
An `en/sk/hu` map for ~15 SK and ~12 HU rules (keyed by country + rule) is used first; API names
are the fallback for anything unmapped.

### C6.4 Whose calendar

B3. A user with no linked employee uses the company default.

### C6.5 Where holidays show

Day strip (muted, name in tooltip), Calendar (all-day band, tinted cell), Timesheet column
headers, Team matrix basis hours and utilisation bars, List day-card header ("State holiday"),
and the weekly target (excludes holidays, counts extra working days). **A holiday never blocks
logging time.**

### C6.6 Working days

`workingDays(month, country)` = Mon–Fri − public holidays + extra working days − extra days
off. Vacation and sick days **do not** reduce it (the employee is paid for them).

Verified 2026 facts: SK May = 20, Jun = 22, Sep = 22, Oct = 22 (8 May and 15 Sept are not
rest days in 2026, § 4b); HU Oct = 21 (23 Oct is a holiday, a Friday).

## C7. Cost rate by employment status

### C7.1 The table (one pure module `src/utils/timeCost.ts`, no fetching, takes the working-days count as input)

| `Employee.kind` | `salaryType` | Hourly cost rate for an entry on date D | Multiplier |
|---|---|---|---|
| `employee` | `monthly` | `salary / workingDays(month of D, country) / hoursPerDay` | × employer multiplier |
| `employee` | `daily` | `amount / hoursPerDay` | × multiplier |
| `employee` | `hourly` | `amount` | × multiplier |
| `contractor` | `hourly` | `amount` | none |
| `contractor` | `daily` | `amount / hoursPerDay` | none |
| `contractor` | `monthly` (retainer) | `amount / basisHours(month of D)` | none |
| `ledger`, no employee, no salary | — | `NULL`, source `none` | — |

`hoursBasis: 'fixed'` replaces `workingDays × hoursPerDay` with `fixedHoursPerMonth` for the
monthly types. `multiplier` = employer contributions, default **1.352**. The PHP mirror is
`public/api/time_cost.php`; both run `scripts/fixtures/time-cost-cases.json`.

### C7.2 Worked examples (they are unit tests)

- Erik, employee, monthly €3,200, Oct 2026 SK: 22 days → man-day €145.45 → €18.18/h → ×1.352 = **€24.58/h**; a 2:15:00 entry = **€55.31**.
- Same salary, **May 2026 SK**: 20 days → **€27.04/h**; June 22 days → **€24.58/h**.
- Same salary, Oct 2026 **HU**: 21 days → **€25.75/h**.
- Freelancer hourly €20 → **€20.00/h**, no multiplier. Contractor company man-day €160 → €20.00/h. Employee hourly €12 → €16.22/h. No employee → `none`, cost NULL, "no rate — no employee linked".

### C7.3 Explaining a frozen rate

`cost_rate_basis_days` is stored so the drawer can say: "€3,200 ÷ 22 working days (Oct 2026, SK) ÷ 8 h × 1.352 = €24.58/h". In the Team matrix and the drawer the tooltip reads "Oct 2026 · 22 working days · man-day €145.45 · €24.58/h".

### C7.4 Billable rate, in priority order

1. The entry's own rate. 2. `Project.billableRate`. 3. The client's support contract `hourlyRate` (then `overageRate` once the monthly hours are used). 4. The price level hourly rate. 5. None. For tickets the contract is resolved as in finding A5.1.

### C7.5 Snapshot and Finance

`cost_rate` is written when an entry is stopped or saved and is never recomputed silently.
**Time tracking creates no financial records.** The project **Finances** tab gets a computed
expense line **"Labour (time tracking)"** (sum of `cost`) included in real profit and the profit
badge. Company totals stay unchanged, so nothing is counted twice.

### C7.6 Re-price a period

Settings → "Re-price a period…" (admin, `HoldToConfirm`): pick a month and optionally users;
recomputes rate and cost, and fills entries that had no rate once an employee is linked.
Writes an audit-log entry.

## C8. The timer

### C8.1 Rules

- **One running timer per user**, enforced by the database. Starting a new one stops the old one and shows an `UndoToast` ("Timer started on *X*. *Y* was stopped at 0:30:00. [Undo]"). Web app, PWA and extension share one running entry.
- Elapsed = `now − start_at`. Never count ticks.
- The **header pill** shows on every screen while a timer runs (title, project, elapsed, Stop); with none running it is "▶ Start timer".
- The browser tab title gets the prefix `▶ 1:12 ·` while running.
- Auto-stop at the configured time (default 23:59) through the server cron, with a notification to the owner (phase 6 at the latest; cron entry).
- Long-entry warning (default 10 h); idle reminder in the PWA and extension (phase 6).

### C8.2 Timer bar

Left to right: title · project chip · task chip · tags · billable (€) · elapsed · Start/Stop ·
Timer/Manual mini toggle. Manual mode swaps in start → end, date, duration and **Add**.
Typing suggests recent title + project + task combinations.

### C8.3 Project is required (soft)

You can start without a project. The entry then shows an amber **"Assign project"** chip, is
left out of project cost and counts as unallocated. The setting "Require a project before Stop"
(**default on**, B9) makes Stop open the picker.

## C9. Entry points (prefill rules)

| Started from | Title | Project | Task | `source` / origin |
|---|---|---|---|---|
| Timer bar / header pill | typed | picked | picked | `timer` |
| **Task** card ▶ / task drawer | the task's | `task.relatedProjectId`, else C9.1 | the task | `timer` / `task` |
| **Ticket** detail ▶ | the ticket's | C10.1 | — | `timer` / `ticket` |
| **Project** "Start timer on this project" | empty | the project | — | `timer` / `project` |
| List row ▶ Continue | same | same | same | `timer` |
| **Day** "Add row" | notes | picked (required) | optional | `day` (hours-only) |
| Calendar drag on an empty slot | empty | picker opens | — | `calendar` |
| Calendar rail: drag a task | the task's | as for Task | the task | `calendar` |
| Timesheet cell | — | the row's | the row's | `timesheet` (hours-only) |
| **Chrome extension** popup | typed | picked (suggested from the open tab) | optional | `extension` |
| **Unsorted** item → Assign | page title | chosen | optional | `activity` |

### C9.1 A task without a project

1. If the task's lead/client has exactly **one** active project, use it.
2. If several, show the popover "Which project is this for?" with **Create project for <client>** and the checkbox "Save the project on the task" (on by default).
3. If none, start without a project.

Use `src/utils/leadClient.ts` for lead → client. Never match by name.

### C9.2 Task cards and drawer

Every task card gets ▶ and a tracked-time chip; the running card gets a rose ring and ■ Stop.
`TaskEditDrawer` gets a **Time tracking** section: running state, tracked / estimate / cost,
entries by person, "+ Add time manually".

## C10. Tickets (phase 2)

### C10.1 Link resolution

- **Task:** `task_id` set. If the task has `relatedTicketId` (or a `ticket_task_links` row), `ticket_id` is also filled (so ticket totals include work on its tasks). Title from the task.
- **Ticket only:** `ticket_id` set, `task_id` NULL, title = ticket title.
- Project = `ticket.projectId`; else the support contract's project (`SupportContract.projectId`); else the client rule on the ticket's client (via `src/utils/leadClient.ts`); else none.
- Billable defaults to `true` (B16); rate per C7.4.

### C10.2 Entry points

Ticket detail: ▶ Start timer, "running" state, tracked / billable totals. The **Log time** form
and the ticket's time list read and write **native entries** through `time_entries.php`
(`ticketId` filter); they no longer write `ticket.timeEntries` into the sync blob. A ticket
picker sits next to the task picker in the drawer and timer bar.

### C10.3 Migration (idempotent, in `schema.php` or a file added to the fingerprint)

For each `ticket_time_entries` row without a `time_entries` row with `external_id = 'tte:<id>'`, insert:
- `user_id` = the row's `user_id` if it exists in `users`, else a unique case-insensitive match of `user_name` (the helper from A5.4), else the ticket's `assignee_id`. Anything resolved by fallback goes to the migration log (`error_log` + `system_settings` key `TIME_TICKET_MIGRATION_LOG`).
- `ticket_id`, `project_id` (via the ticket, then C10.1), `entry_date = logged_at`, hours-only, `duration_sec = minutes × 60`, `billable`, `legacy_note = note`, `description` NULL, `title_snapshot` = ticket title, `source = 'ticket_legacy'`.
- Priced normally, with **no network call**: working days come from the cache table, else the built-in rules ported to PHP in `time_cost.php`.

Re-running inserts nothing. It runs inside `ccrm_apply_migrations`, never on the probe path.
Remember the schema fingerprint rule in `CLAUDE.md`.

### C10.4 Every place that reads or writes ticket time today, and the change

| Place | Today | After |
|---|---|---|
| `sync.php` ~2407-2424 | loads all `ticket_time_entries`, builds `timeEntries` | removed; `timeEntries` is `[]` |
| `sync.php` ~2434-2438, 2476 | `loggedMinutes` = sum of those rows | sum of `time_entries.duration_sec` per `ticket_id` (one grouped query); stays a derived number so old clients still show a total |
| `sync.php` ~2487 | serves `timeEntries` | serves `[]` |
| `sync.php` ~6533-6541 | `upsertTimeEntry` statement | removed |
| `sync.php` ~6666-6693 | upserts payload entries and **deletes the rest** | removed; incoming `timeEntries` is ignored |
| `sync.php` ~6702 | cascade delete of a deleted ticket's time rows | stays for the legacy table; `time_entries` rows are **not** deleted (they grey out via `title_snapshot`) |
| `schema.php` ~1128, 4175, 4424 | table, ensure list, demo seed | table kept and no longer written; ensure list kept; demo seed also writes its two sample entries into `time_entries` |
| `TicketsView.tsx` ~1070-1113 (Log time) | appends to `ticket.timeEntries`, bumps `loggedMinutes` and `hoursUsedThisMonth` | POST a native entry (`ticketId`); list refetches; no client bumps |
| `TicketsView.tsx` ~1115-1181 (admin edit total) | rewrites `timeEntries` | admin adjusts real entries; the "edit total" shortcut creates one hours-only correcting entry |
| `TicketsView.tsx` ~1183-1232 (edit/delete entry) | mutates `timeEntries` | PUT / DELETE (soft) on `time_entries.php` |
| `TicketsView.tsx` ~2631, 2647, 3154-3262, 3471, 3868, 4027-4040 | count / timeline / list from `timeEntries` | read from the ticket's native entries (hook `useTicketTimeEntries(ticketId)`) |
| `TicketsView.tsx` ~1089-1103, 1271, 5121 | client counter `hoursUsedThisMonth` | derived from entries via `computeProjectRetainerUsage` |
| `src/utils/tickets.ts` ~733-754 | sums `ticket.timeEntries` / `loggedMinutes` | takes native entries (billable only, within `[periodStart, nextResetDate)`); an entry linked to both a task and a ticket counts once |
| `src/types/index.ts` ~1560-1632 | `TicketTimeEntry`, `timeEntries`, `hoursUsedThisMonth` | kept as deprecated optional fields, documented as derived |
| `ProjectTicketsPanel.tsx`, `TicketsView.tsx` ~769 | create tickets with `timeEntries: []` | unchanged |
| `tickets.test.ts`, `scripts/probe-rbac/run.mjs`, `scripts/capture-module-screenshots.mjs` | fixtures with `timeEntries` | updated with the retainer change |

Line numbers are from 2026-10-26; search by the symbol if they moved.

### C10.5 Contract usage

Derived from `time_entries`. Contract resolved as in A5.1. Logging time on a ticket counts once
toward the contract.

## C11. Views

### C11.1 List

- Stat strip: Today, This week / target, Billable %, Labour cost this week (cost permission only).
- Toolbar: week navigator, an **"Unsorted · N"** chip (only when N > 0, links to Day → Unsorted), "Viewing as", filter.
- Day cards, newest first. Row: checkbox · title · task · project or "Assign project" · tags · billable · time range (or "hours only") · duration · cost · hover ▶ / ⋯.
- "Viewing as: Whole team" adds the owner's avatar and a "Person" column.
- Identical consecutive entries are grouped with a count badge. Bulk bar for selected rows (delete with Undo). Running entry pinned at the top of Today.

### C11.2 Calendar (phase 3)

- Week view by default, 08–20 visible, full 24 h scrollable; an "Untimed" lane for hours-only entries.
- Drag to create (15-minute snap), drag to move, drag the bottom edge to resize, click for a quick popover.
- Running entry with a rose "now" line. Right rail: your tasks, each with ▶ and drag-to-calendar.

### C11.3 Timesheet (phase 3)

- Rows = project + task, columns Mon–Sun, ending in a **Totals** row (repo rule `project-totals.md`).
- Typing into an empty cell creates an **hours-only** entry for that day; editing a cell adjusts the last entry of that cell.
- "Copy rows from last week", "+ Add row", "Submit week" (only with approval on).

### C11.4 Day / Daily log

- **Day strip**: 14 days with arrows to scroll further. Each day shows weekday, date, a dot and that day's logged hours for the current scope. Dot: emerald when the day reaches the daily target (`hoursPerDay`; for the whole team the sum over people), amber when under, grey when nothing is logged. Weekends and holidays are muted. Today is the teal pill.
- Day header: long date (`Intl` in the app language), "Team logged 12:42 · you 4:42 of 8:00", **Add row**.
- **Add row** opens an inline row: Project * · Task · Notes · Hours · Billable · Save. Hours accepts `1.5`, `1:30` and `90m`; creates an **hours-only** entry; `Enter` saves and opens the next empty row.
- **Saved logs grouped by user** (when viewing the team): avatar, name, role badge, rate (or "no rate — no employee linked"), cost, day total. Row: project · notes · time range or "hours only" · hours · edit / delete on hover.
- **Unsorted** panel on the right (C15.4), personal only.

### C11.5 Team work and expenses (phase 4)

- Requires `time_tracking_team`; cost lines require `time_tracking_costs` (without it the matrix shows hours only).
- Filters: "Active projects only", project select, Weekly / Monthly, period navigator (8 weeks or 6 months per screen, with "Current"), CSV.
- Rows = people (everyone with entries in the range plus every active employee even at zero hours): avatar, name, role badge (Admin / Manager / Employee / Contractor from RBAC role + employee kind), current rate and its source.
- Cells: hours (teal, bold), cost (violet), and a thin bar of hours ÷ that period's basis hours (amber under 75 %). Empty cell "—". A whole-week vacation shows "vacation" (from `EmployeeVacation`). Current week column highlighted.
- Clicking a cell opens a popover with that person's per-project breakdown and "Open entries →" (List filtered to that person and range).
- Last column **Total**, last row **Totals**. A week crossing a month boundary is costed by each entry's own frozen rate, never re-derived.

### C11.6 Entry drawer

- Title (or the linked item's title, C5) · **Project \*** · Task · Ticket · Date · Start · End · Duration (start and end optional, so an entry can stay hours-only) · **Person** (managers only) · Tags · Billable switch with its rate.
- Cost panel (permission): frozen rate, the formula in plain words (C7.3), cost, billable value, margin.
- Provenance line: "Recorded by *X* with the *timer / extension / day log* on *date*, started from task *T*".
- Footer: Hold to delete · Duplicate · Cancel · Save. Locked entries open read-only.

### C11.7 Project picker (shared)

- Search by project name, client or code; results grouped by client; recent first.
- Option: colour dot, name, meta line (hours, or contract usage), status pill.
- "Show finished" toggle, and **+ Create project "<query>"** with an inline mini form (name, client, project type); requires the projects create permission.

## C12. Reports (phase 4)

- **Summary and Detailed.** Filters: period, people, projects, clients, billable, group by. Summary: stat cards, hours per working day, share by project, grouped table with a Totals row. Detailed: flat table. Exports: CSV, and a client PDF (rounded, no cost, billable only).
- **Salary allocation** (admins only, `time_tracking_salary_report`): for a closed month, per employee: loaded salary, rate, tracked hours, a split bar (client / internal / unallocated), the three costs, utilisation, Totals row. Users without an employee record are listed below as "Time without salary data".
- **Unsorted inbox** is personal: visible only to its owner, never to managers; purged after N days (default 30).

## C13. Settings → Time tracking (`projects/time`)

```ts
interface TimeTrackingSettings {
  hoursBasis: 'workingDays' | 'fixed';
  fixedHoursPerMonth: number;        // 168
  hoursPerDay: number;               // 8 (also the Day strip target)
  employerMultiplier: number;        // 1.352
  holidayOverrides: Record<'SK' | 'HU', Record<string, Array<{ date: string; kind: 'extraDayOff' | 'extraWorkingDay'; name: string }>>>;
  requireProjectToStop: boolean;     // true (B9)
  requireTask: boolean;              // false
  billableByDefault: boolean;        // true
  autoStopAt: string | null;         // "23:59"
  longEntryWarnHours: number | null; // 10
  idleReminderMinutes: number | null;// 15
  lockAfterDays: number | null;      // 14
  weeklyApproval: boolean;           // false
  rounding: { minutes: 0 | 5 | 15 | 30; mode: 'nearest' | 'up' };
  extension: { enabled: boolean; activityCaptureAllowed: boolean; unsortedRetentionDays: number }; // true, true, 30
  ticketTimeVisibleToClients: boolean; // false (B15)
}
```

Settings also *links* to the existing "External time tracker" settings (Toggl); it does not
duplicate them. Rounding applies only in reports and client PDFs. **Locking:** entries older
than `lockAfterDays`, in a paid payroll month, or approved, are editable only by admins
(audit-logged).

## C14. Toggl import (phase 6)

Settings → "Map projects & import": map external projects → CCRM projects and external users
→ CCRM **users** (the existing `employees.time_tracking_*` fields are the default user
mapping), pick a date range, preview, import. Idempotent through `external_id` (`source = 'toggl'`,
`external_id = <toggl id>`); imported entries are priced normally. It reuses the existing Toggl
client in `time_tracking_lib.php` (no second client). It never removes or replaces the
`EmployeeTimesheetSummary` Toggl data; that view gets an explicit "Source: Toggl / CCRM time
tracking" switch, and the importer preview shows "N entries already imported". Clockify import is
not built unless the user asks.

## C15. Chrome extension (phase 5)

### C15.1 Where it lives and how it ships

Source in `extensions/chrome-time-tracker/` (Manifest V3, TypeScript, Vite →
`extensions/chrome-time-tracker/dist`). `npm run build:extension` zips it to
`public/downloads/ccrm-time-tracker.zip`, copied into `dist/` by the normal build. The
production server has no build step, so the zip is committed like `dist/`. The extension version
is shown in CCRM next to the download button; a device on an older version shows "Update
available". Until a Web Store listing exists, the setup guide explains "Load unpacked".

### C15.2 Pairing

1. CCRM → Time tracking → ⋯ → **Chrome extension** shows a **one-time pairing code** (`K7Q4-9MZT`, valid 10 min, single use, "New code" button).
2. The extension's first screen asks for the CCRM address and the code, then calls `pair`.
3. The server returns a long-lived **device key** (prefix `ttk_`), kept in `chrome.storage.local`. CCRM stores only its hash.
4. "Paired browsers" lists each device (name, OS, paired date, last sync, Active/Idle) with **Revoke**.

### C15.3 Popup (360 × up to 560 px)

- **Running:** title, project · task, large elapsed time, Stop, today's total, last 3 entries with ▶ Continue, footer "Open CCRM" and "N unsorted".
- **Idle:** title input, project search (`projects?q=`; the **suggested** project first when the active tab matches a watched-site rule), optional task, Start.
- **Not paired:** CCRM address + pairing code + Connect.
- The toolbar badge shows the elapsed `h:mm` in rose while running, nothing when idle (alarm every minute).
- **Offline:** start and stop are queued with client timestamps and sent when back online; the server accepts a client `startedAt`/`stoppedAt` up to 24 h old.
- Same API rules as the web app: one running timer per user, prefills, the require-project setting.

### C15.4 Activity capture and Unsorted (opt-in, off by default)

- Requires the optional `tabs` permission, requested only when the user turns it on.
- Only while **no timer is running**: track how long the active tab stays on a watched site (a per-user domain/pattern list, each mapped to a suggested project), ignore blocks shorter than N minutes (default 5), merge consecutive blocks on the same site.
- Store **only** the domain, page title and times. Never the full URL path or page content. Upload in batches to `activity` → **Unsorted** inbox. Admins can disable capture company-wide (`extension.activityCaptureAllowed`).
- Each Unsorted item: favicon letter, page title, domain, when, duration, a suggested project (dashed chip; amber "No suggestion — pick a project" when none), **Assign**, dismiss (✕). **Assign** creates a timed entry (`source = 'activity'`, page title as title) once the project is confirmed and marks the item `assigned`. Several items can be assigned together.

## C16. Permissions (RBAC)

Section **Time tracking** in `PERMISSION_SECTIONS` (`src/utils/permissions.ts`), mirrored in
`public/api/permissions.php` (follow "Adding a permission" in `docs/db_integration_notes/RBAC_SYSTEM.md`):

- `time_tracking`: access. View = own entries. Edit = create and edit own entries (including through the extension). Existing roles keep it at *edit*; new roles start at *nothing*.
- `time_tracking_team`: others' entries, logging time for others, the Team tab, "Viewing as".
- `time_tracking_costs`: cost, rates, margins of others' time (server-enforced; everyone always sees their own cost).
- `time_tracking_salary_report`: the salary allocation report.
- `tickets.time` (phase 2, B15): toggle; needs `tickets` ≥ view.
- Route `time-tracking` is mapped in `permissionKeyForRoute`. The module is in the sidebar, `VisibleModulesSettings` (via `moduleCatalog.ts`) and `ModuleSetupWizard` (setup step: hours basis, multiplier, which users track time, extension on/off).
- Labels in en, sk and hu.

## C17. Mobile / PWA (phase 6 polish)

A large running card, today's entries with 44 px ▶ buttons, and a bottom bar (Timer ·
Calendar · Tasks · Add). On a phone the Day strip scrolls horizontally and the quick row stacks
into a vertical form.

## C18. Edge cases to handle and test

- Midnight crossings: shown on the start day with a `+1` end marker. DST: durations come from UTC.
- Two clients (web app and extension) start at once: the unique index rejects one and the API returns the existing running entry.
- A user without an employee record: entries allowed, cost "no rate", listed separately in the salary report.
- A salary change mid-month: snapshots keep the old entries; a re-price is offered.
- A revoked extension device keeps its queued offline actions locally; they are rejected with 401; the popup says to pair again and offers to show the lost actions.
- A deleted or archived project, task or ticket: its entries stay, greyed out (`title_snapshot`).
- A stale cached PWA sends ticket `timeEntries`: ignored, nothing is deleted or duplicated (phase 2).

## C19. QA checks to add (the suite mocks `/api/time_entries.php`, `/api/holidays.php`, `/api/time_tracker_ext.php`)

Each phase adds its own, drawn from this list. The suite seeds its own data and never touches
real records.

- start → stop → edit → delete; start-from-task prefill; one running timer; hours-only rows in the Day view
- renaming a linked entry renames the task, and the ticket
- a holiday shows in the Day strip and the Calendar and lowers the weekly target
- a monthly employee's rate differs between May 2026 (20 days, €27.04/h) and June 2026 (22 days, €24.58/h)
- switching the UI language does not change the holiday set (B3)
- a freelancer's flat rate
- logging time on a ticket counts once toward the contract
- cost of **other people's** entries is hidden without `time_tracking_costs`, while an employee still sees their own rate and cost
- ticket time is hidden without `tickets.time`
- Team matrix totals; a user without an employee record
