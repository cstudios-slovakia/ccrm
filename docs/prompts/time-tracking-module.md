# Time Tracking module — design and implementation brief

**Design canvas:** https://claude.ai/artifact/G1ZJkEvLUbzXAQG8bpwwsd
(12 screens and 2 shared components. Open each artboard in Play to see the
interactive parts. The numbers in the mockups are consistent with each other, so
they can serve as test fixtures.)

**Reference:** another Cstudios app ("CSS Projects → Time Logging") already has a
dark timer bar, a Chrome extension with a pairing token, a daily timeline with a
day strip and quick rows, and a "Team work & expenses" matrix. This module takes
those ideas into CCRM's own design and data model. Do not copy that app's code
or styling.

---

## Prompt for Claude Code

> Implement the new **Time Tracking** module in CCRM, following the design canvas
> linked above and this document (`docs/prompts/time-tracking-module.md`). The
> canvas is the visual reference and this document is the functional
> specification. Where they disagree, this document wins. Build it in the phases
> listed under "Delivery phases". Each phase must pass `npx tsc --noEmit`,
> `npm run test:unit` and `npm run test:qa`, and follow the repo workflow rules
> (`.agents/rules/`: QA before ship, version bump + changelog, one commit per
> build). Reuse the existing layout primitives (`PageHeader`, `EntityHeader`,
> `Surface`, `Tabs`, `StatGrid`, `Toolbar`, `CustomSelect`, `HoldToConfirm`,
> `UndoToast`, the drawer pattern of `TaskEditDrawer`) instead of copying markup
> from the canvas. Write every string with `t(en, sk, hu)`. Before phase 1, show
> me your plan for the schema and the API. Ask me before changing anything in
> Finance or Employees beyond what this document describes.

---

## 1. What the module is

A native, Toggl-style time tracker built into CCRM.

- Every time entry is owned by the **user who records it** (a CCRM login, `users.id`).
- Every entry belongs to a **project**, and optionally to a **task**. An entry without a project is allowed but flagged (§5.3).
- Each entry is priced at the owner's **hourly cost rate**, which comes from the salary of the employee record linked to that login. That gives a real labour cost for every project, plus a report that shows where each salary went.

Time is recorded from the module's timer, from tasks, from projects, from the
calendar, as hours-only day rows, from the timesheet, and from a **Chrome
extension**.

The existing Toggl/Clockify integration (`Employee.timeTrackingProvider`,
`EmployeeTimesheetSummary`, `api/my_employment.php`) stays, but it becomes an
**importer** into the native table (§12).

## 2. Screens (canvas artboards)

The module route is `time-tracking`. It has the tabs
**List · Day · Calendar · Timesheet · Team · Reports**. The "Viewing as"
selector sits on the right of the tab bar: *Me* by default, and managers can also
pick *Whole team* or one person.

| # | Artboard | Where it lives |
|---|---|---|
| 1 | Timer + List view | Tab **List** (default) |
| 2 | Calendar view | Tab **Calendar** (Day / Week / Month) |
| 3 | Timesheet view | Tab **Timesheet** (weekly grid) |
| 4 | Edit entry drawer + project picker | Right drawer, opened from any entry anywhere |
| 5 | Start from a task | Task cards (My calendar / Global tasks) and `TaskEditDrawer` |
| 6 | Project → Time tab | New tab in `ProjectDetailsView`, after **Tasks** |
| 7 | Reports + salary allocation | Tab **Reports** |
| 8 | Settings → Time tracking | New section in `SettingsView` |
| 9 | Mobile timer | The same route at phone width (PWA) |
| 10 | Daily log | Tab **Day**: day strip, hours-only rows, logs grouped by user, Unsorted inbox |
| 11 | Team work & expenses | Tab **Team**: person × week/month matrix of hours and cost |
| 12 | Chrome extension | Module ⋯ menu → "Chrome extension" (also linked from Personal settings), plus the popup's own screens |
| — | Header component | `Header.tsx`: the global running-timer pill |
| — | Sidebar component | `Sidebar.tsx`: the new module icon (`Timer`, teal) |

### Visual mapping (canvas → Tailwind in this repo)

The codebase uses raw palette classes, so keep doing that.

- Module colour: **teal-600** (`#0d9488`). Active sidebar item: `bg-teal-600 text-white shadow-lg shadow-teal-600/30 border border-teal-500/20`, the same as the other modules.
- Primary actions and the Start button: `bg-primary` (`#4f6edb`). Running state and the Stop button: `rose-600`. Billable: `emerald-*`. "Assign project" and Unsorted: `amber-*`. Cost figures in the Team matrix: `violet-700`.
- Cards: `Surface` (rounded-3xl, white, `border-slate-200/80`). Insets: `Surface tone="inset"`.
- Durations and money always use `tabular-nums`.
- Project colour: use the project's own colour if one exists. Otherwise use a stable colour hashed from the project id, from a fixed 8-colour palette. The same project must have the same colour everywhere.
- Type and spacing follow `docs/VIEW-SIZE.md` (`type-page-title`, `type-body`, `type-meta`, `ws-*` breakpoints). Do not copy the px values from the canvas.

## 3. Ownership: whose time is it

- `user_id` (**required**) is the login whose time this is. By default it is the logged-in user who records the entry.
- `recorded_by_user_id` is the login that actually typed it in. It differs from `user_id` only when a manager logs time for someone else (the drawer's **Person** field, shown only with `time_tracking_team`). Every list shows "Recorded by …" on such entries.
- `employee_id` is **resolved, not chosen**. It is the `employees` row whose `userId` equals `user_id`, written onto the entry when it is saved. It supplies the salary for the cost rate.
- **A user with no linked employee can still track time.** Their entries get `employee_id = NULL` and `cost_rate_source = 'none'`, and everywhere shows cost as "no rate — no employee linked" (amber), for example the admin "Peter" in artboards 10 and 11. When an employee is linked later, an admin can re-price (§4.4) to fill in the cost.
- Contractors are `employees` with `kind = 'contractor'`. They log time either through their own login (linked user) or through a manager using the Person field.

## 4. Data model

### 4.1 `time_entries`

Put it in `public/api/schema.php`, so it is covered by `ccrm_schema_fingerprint()`.

| Column | Type | Notes |
|---|---|---|
| `id` | varchar(64) PK | `te-<uuid>` |
| `user_id` | varchar NOT NULL → users.id | **owner** (§3) |
| `recorded_by_user_id` | varchar NOT NULL → users.id | who typed it |
| `employee_id` | varchar NULL → employees.id | resolved from `user_id` when saved |
| `project_id` | varchar NULL | NULL = "Assign project" state (§5.3) |
| `task_id` | varchar NULL | must belong to `project_id` when both are set |
| `description` | varchar(500) | the "notes" of a Day-view row |
| `entry_date` | DATE NOT NULL | local (company timezone) date the time counts for |
| `start_at` | DATETIME NULL | UTC. **NULL for hours-only entries** (Day view, Timesheet) |
| `end_at` | DATETIME NULL | UTC. NULL while running, or for hours-only entries |
| `duration_sec` | INT NULL | required unless running |
| `billable` | TINYINT(1) | |
| `billable_rate` | DECIMAL(10,2) NULL | snapshot |
| `cost_rate` | DECIMAL(10,4) NULL | **snapshot** of the hourly cost rate (§5) |
| `cost_rate_source` | varchar(32) | `monthly` \| `daily` \| `hourly` \| `contractor` \| `none` |
| `cost` | DECIMAL(12,2) NULL | `duration_sec / 3600 × cost_rate` |
| `tags` | JSON | |
| `source` | varchar(16) | `timer` \| `manual` \| `day` \| `calendar` \| `timesheet` \| `extension` \| `activity` \| `toggl` \| `clockify` |
| `origin_type` / `origin_id` | varchar NULL | where it was started from (`task`, `project`, `calendar`, `activity`) |
| `device_id` | varchar NULL | the extension device that created it |
| `external_id` | varchar NULL | Toggl/Clockify id, unique per source |
| `approval_status` | varchar(16) NULL | only with weekly approval |
| `running_guard` | generated `IF(start_at IS NOT NULL AND end_at IS NULL, user_id, NULL)` | **UNIQUE**, so the database allows only one running timer per user |
| `created_at`, `updated_at`, `deleted_at` | | soft delete for Undo and the audit log |

Indexes: `(user_id, entry_date)`, `(project_id, entry_date)`, `(task_id)`, `(employee_id, entry_date)`.

**Hours-only entries** (`start_at IS NULL`) appear in List, Day, Timesheet, Team
and Reports. On the Calendar they appear in an "Untimed" lane above the hour
grid; dragging one into the grid gives it times.

### 4.2 Chrome extension tables

```
time_tracker_pairing_codes(
  code_hash CHAR(64) PK, user_id, expires_at, used_at NULL, created_at)
  -- 8 characters, shown as XXXX-XXXX, valid 10 min, single use, sha256 stored

time_tracker_devices(
  id PK, user_id → users, key_hash CHAR(64) UNIQUE, key_prefix VARCHAR(12),
  name, browser, os, extension_version, created_at, last_used_at, revoked_at NULL)
  -- modelled on the existing `mcp_keys` table: only the hash is stored,
     the full key is returned once to the extension

time_activity(
  id PK, user_id, device_id, domain, page_title VARCHAR(300),
  started_at, ended_at, duration_sec,
  suggested_project_id NULL, status ENUM('unsorted','assigned','dismissed'),
  entry_id NULL, created_at)
  -- the "Unsorted" inbox (§9.3); rows older than N days are purged by the cron
```

### 4.3 Additions to existing entities

- `Task.estimateMinutes?: number | null`
- `Project.hoursBudget?: number | null`, `Project.billableRate?: number | null`
- Project type flag `isInternal: boolean` (default false), used to split internal from client work
- Settings blob `TIME_TRACKING_SETTINGS` (§11), plus per-user `TIME_TRACKING_ACTIVITY_RULES` (the extension's watched sites → suggested projects)

### 4.4 API (`public/api/time_entries.php`, then `npm run sync:backend`)

- `GET ?from&to&userId&projectId&taskId`: list. Without `time_tracking_costs`, the fields `cost_rate`, `cost` and `billable_rate` are **stripped server-side**. Without `time_tracking_team`, `userId` is forced to the caller.
- `GET ?running=1`: the caller's running entry.
- `POST action=start`: in **one transaction**, stop the caller's running entry and insert the new one; return both, for the Undo toast.
- `POST action=stop`: `{id}`.
- `POST` / `PUT` / `DELETE` (soft) for manual, hours-only, calendar and timesheet entries.
- `GET action=team&from&to&bucket=week|month&activeOnly&projectId`: the Team matrix aggregates.
- `GET action=report&…`: Reports aggregates.
- `GET action=unsorted` / `POST action=assign|dismiss`: the activity inbox.
- `POST action=import`: Toggl/Clockify.

`public/api/time_tracker_ext.php` is the **extension API**. It is authenticated by
`Authorization: Bearer <device key>`, never by session cookies. It needs CORS for
the extension origin `chrome-extension://<id>`.

- `POST pair {code, deviceName, browser, os, version}` → `{deviceKey, user, ccrmUrl}`. Rate-limit this per IP.
- `GET running`, `POST start`, `POST stop`, `GET recent`, `GET projects?q=`, `GET tasks?projectId=`
- `POST activity` (batch of captured blocks), `GET unsortedCount`
- Every call updates `last_used_at`. A revoked key returns 401, and the extension then shows the "not paired" screen.

Do **not** put time entries into the `sync.php` blob, and do not add work to the
`?probe=1` path. The web app refreshes the running timer on load, on
`visibilitychange` and after start/stop. The extension polls `running` every 60 s
through `chrome.alarms`.

## 5. Cost rate: salary → hourly cost

### 5.1 Formula

For an entry of user **U** (→ employee **E**) on `entry_date` **D**:

```
monthly    : rate = salaryAmount / basisHours(month of D) × multiplier
daily      : rate = salaryAmount / hoursPerDay            × multiplier
hourly     : rate = salaryAmount                          × multiplier
contractor : rate = salaryAmount (hourly price), no multiplier
no employee linked / no salary / kind 'ledger' : rate NULL, source 'none'
```

`basisHours(month)`:

- **Working days × hours per day** (default): Mon–Fri minus that year's public holidays from settings (prefilled with the SK holidays), × `hoursPerDay` (8). Sept 2026 = 21 × 8 = 168 h. Oct 2026 = 22 × 8 = 176 h.
- **Fixed** hours per month (e.g. 168).

`multiplier` = employer contributions (default **1.352**).

Worked example: Erik, monthly €3,200, October: 3200 / 176 × 1.352 =
**€24.58/h**. A 2:15:00 entry costs **€55.31**.

Put this in **one pure module**, `src/utils/timeCost.ts`, with unit tests for
every salary type, both month bases, holidays and rounding. Mirror it in PHP
(`api/time_cost.php`), with a test that compares the two.

### 5.2 Snapshot

`cost_rate` is written when an entry is stopped or saved, and is never recomputed
silently.

### 5.3 Which salary

Prefer that month's `EmployeeSalary` record when it exists. Otherwise use the
current `Employee.salaryAmount`. (Confirm, see Open questions.)

### 5.4 Re-price a period

Settings → "Re-price a period…" (admin, `HoldToConfirm`): pick a month and
optionally users, and recompute the rate and cost. This also fills in entries
that had no rate (`'none'`) once an employee is linked. It writes an audit log
entry.

### 5.5 Finance: allocation, not a second expense

Salaries are already expenses. Time tracking **creates no financial records**.

- On a project's **Finances** tab, add a computed expense line **"Labour (time tracking)"** (the sum of `cost`) and include it in real profit and in the tab's profit badge.
- Company totals stay unchanged, so nothing is counted twice.
- The Salary allocation report (§10.2) shows client / internal / unallocated per employee.

## 6. The timer

### 6.1 Rules

- **One running timer per user**, enforced by the database. Starting a new one stops the old one and shows an `UndoToast` ("Timer started on *X*. *Y* was stopped at 0:30:00. [Undo]"). The same rule applies across the web app, the mobile PWA and the extension: they all share one running entry.
- Elapsed time is `now − start_at`. Never count ticks.
- The **global header pill** shows on every screen while a timer runs (description, project, elapsed, Stop). With no timer running it is a "▶ Start timer" button.
- The browser tab title gets the prefix `▶ 1:12 ·` while running.
- Auto-stop at the configured time (default 23:59) through the server cron, with a notification to the owner.
- Long-entry warning (default 10 h), and an idle reminder in the PWA and the extension.

### 6.2 Timer bar (artboard 1)

From left to right: description · project chip · task chip · tags · billable (€) ·
elapsed · Start/Stop · the Timer/Manual mini toggle. Manual mode swaps in
start → end, date, duration and **Add**. Typing in the description suggests
recent description + project + task combinations.

### 6.3 Project is required (soft)

You can start without a project. The entry then shows an amber **"Assign
project"** chip, is left out of project cost and counts as unallocated. The
setting "Require a project before Stop" (default off) makes Stop open the picker
instead.

## 7. Entry points (prefill rules)

| Started from | Description | Project | Task | `source` / origin |
|---|---|---|---|---|
| Timer bar / header pill | typed | picked | picked | `timer` |
| **Task** card ▶ / task drawer | task title | `task.relatedProjectId`, else §7.1 | the task | `timer` / `task` |
| **Project** "Start timer on this project" | empty | the project | — | `timer` / `project` |
| List row ▶ Continue | same | same | same | `timer` |
| **Day** view "Add row" | notes | picked (required) | optional | `day` (hours-only) |
| Calendar drag on an empty slot | empty | picker opens | — | `calendar` |
| Calendar rail: drag a task | task title | as for Task | the task | `calendar` |
| Timesheet cell | — | the row's | the row's | `timesheet` (hours-only) |
| **Chrome extension** popup | typed | picked (suggested from the open tab) | optional | `extension` |
| **Unsorted** item → Assign | page title | chosen | optional | `activity` |

### 7.1 A task without a project

1. If the task's lead/client has exactly **one** active project, use it.
2. If it has several, show the popover "Which project is this for?" (artboard 5), with **Create project for <client>** and the checkbox "Save the project on the task" (on by default).
3. If it has none, start without a project.

Use `src/utils/leadClient.ts` for the lead → client resolution. Never match by name.

### 7.2 Task cards and task drawer

Every task card gets ▶ and a tracked-time chip. The running card gets a rose ring
and ■ Stop. `TaskEditDrawer` gets a **Time tracking** section: running state,
tracked / estimate / cost, entries by person, and "+ Add time manually".

### 7.3 Billable rate, in priority order

1. The entry's own rate
2. `Project.billableRate`
3. The client's support contract `hourlyRate` (then `overageRate` once the monthly hours are used up)
4. The price level hourly rate
5. None

Entries on a support-contract project count toward its `hoursUsedThisMonth`.

## 8. Views: List, Calendar, Timesheet, Entry drawer, Project picker

### 8.1 List (artboard 1)

- Stat strip: Today, This week / target, Billable %, Labour cost this week (cost permission only).
- Toolbar: week navigator, an **"Unsorted · N"** chip (only when N > 0; it links to Day → Unsorted), "Viewing as", filter.
- Day cards, newest first. Each row: checkbox · description · task · project or "Assign project" · tags · billable · time range (or "hours only") · duration · cost · hover ▶ / ⋯.
- With "Viewing as: Whole team", each row also gets the owner's avatar and a "Person" column.
- Grouping of identical consecutive entries with a count badge. Bulk bar for selected rows. Running entry pinned at the top of Today.

### 8.2 Calendar (artboard 2)

- Week view by default, 08–20 visible with the full 24 h scrollable. An "Untimed" lane holds the hours-only entries.
- Drag to create (15-minute snap), drag to move, drag the bottom edge to resize, click for a quick popover.
- Running entry with a rose "now" line. Right rail: your tasks, each with ▶ and drag-to-calendar.

### 8.3 Timesheet (artboard 3)

- Rows are project + task, columns Mon–Sun, ending in a **Totals** row (repo rule `project-totals.md`).
- Typing into an empty cell creates an **hours-only** entry for that day. Editing a cell adjusts the last entry of that cell.
- "Copy rows from last week", "+ Add row", and "Submit week" (only with approval on).

### 8.4 Edit entry drawer (artboard 4)

- Description · **Project \*** · Task · Date · Start · End · Duration (start and end are optional, so the entry can stay hours-only) · **Person** (whose time; managers only) · Tags · Billable switch with its rate.
- Cost panel (permission): frozen rate, the formula in plain words, cost, billable value, margin.
- Provenance line: "Recorded by *X* with the *timer / extension / day log* on *date*, started from task *T*".
- Footer: Hold to delete · Duplicate · Cancel · Save. Locked entries open read-only.

### 8.5 Project picker (shared component)

- Search by project name, client or code; results grouped by client; recent first.
- Each option: colour dot, name, meta line (hours, or contract usage), status pill.
- "Show finished" toggle, and **+ Create project "<query>"** with an inline mini form (name, client, project type). Creating requires the projects create permission.

## 9. Views: Day, Team, Unsorted

### 9.1 Day / Daily log (artboard 10)

- **Day strip**: 14 days with arrows to scroll further. Each day shows the weekday, the date, a dot and that day's logged hours for the current scope. The dot is emerald when the day reaches the daily target (`hoursPerDay`; for the whole team, the sum over people), amber when it is under, grey when nothing is logged. Weekends and holidays are muted. Today is the teal pill.
- Day header: the long date (`Intl` in the app language, for example "pondelok 26. októbra 2026" in sk), "Team logged 12:42 · you 4:42 of 8:00", and **Add row**.
- **Add row** opens an inline row: Project \* · Task · Notes · Hours · Billable · Save. Hours accepts `1.5`, `1:30` and `90m`. This creates an **hours-only** entry for that day. `Enter` saves and opens the next empty row.
- **Saved logs grouped by user** (when viewing the team): avatar, name, role badge, rate (or "no rate — no employee linked"), cost, day total. Each row: project · notes · time range or "hours only" · hours · edit / delete on hover.
- **Unsorted** panel on the right (§9.3), personal only.

### 9.2 Team work & expenses (artboard 11)

- Requires `time_tracking_team`. The cost lines require `time_tracking_costs`; without it the matrix shows hours only.
- Filters: "Active projects only" (toggle), project select, Weekly / Monthly, period navigator (8 weeks or 6 months per screen, with "Current"), CSV.
- Rows = people (every user who has entries in the range, plus every active employee even with zero hours): avatar, name, role badge (Admin / Manager / Employee / Contractor from RBAC role + employee kind), current rate and its source.
- Cells: hours (teal, bold), cost (violet), and a thin bar of hours ÷ that period's basis hours (amber under 75 %). Empty cell "—". A whole-week vacation shows "vacation" (from `EmployeeVacation`). The current week column is highlighted.
- Clicking a cell opens a popover with that person's per-project breakdown for the period and "Open entries →" (List view filtered to that person and range).
- Last column **Total**, last row **Totals**. A week that crosses a month boundary is costed by each entry's own frozen rate, never re-derived.

### 9.3 Unsorted inbox (Day view panel, List chip, extension footer)

- Filled only by the extension's **activity capture** (§13.4). The header "Unsorted" counter shown in the reference app maps to this.
- Each item: favicon letter, page title, domain, when, duration, a suggested project (dashed chip; amber "No suggestion — pick a project" when none), **Assign**, and dismiss (✕).
- **Assign** creates a timed entry (`source = 'activity'`, the page title as description) after the project is confirmed or picked, and marks the item `assigned`. Several items can be multi-selected and assigned together.
- Items are visible only to their owner, never to managers. Purged after N days (default 30).

## 10. Reports (artboard 7)

### 10.1 Summary and Detailed

- Filters: period, people, projects, clients, billable, group by.
- Summary: stat cards, hours per working day, share by project, the grouped table with a Totals row.
- Detailed: a flat table. Exports: CSV, and a client PDF (rounded, no cost, billable only).

### 10.2 Salary allocation (admins only)

For a closed month, per employee: loaded salary, rate, tracked hours, a split bar
(client / internal / unallocated), the three costs, and utilisation. Totals row.
Users without an employee record are listed below the table as "Time without
salary data", with their hours.

## 11. Settings → Time tracking (artboard 8)

```ts
interface TimeTrackingSettings {
  hoursBasis: 'workingDays' | 'fixed';
  fixedHoursPerMonth: number;        // 168
  hoursPerDay: number;               // 8 (also the Day strip target)
  employerMultiplier: number;        // 1.352
  publicHolidays: Record<string, string[]>;
  requireProjectToStop: boolean;     // false
  requireTask: boolean;              // false
  billableByDefault: boolean;        // true
  autoStopAt: string | null;         // "23:59"
  longEntryWarnHours: number | null; // 10
  idleReminderMinutes: number | null;// 15
  lockAfterDays: number | null;      // 14
  weeklyApproval: boolean;           // false
  rounding: { minutes: 0 | 5 | 15 | 30; mode: 'nearest' | 'up' };
  extension: { enabled: boolean; activityCaptureAllowed: boolean; unsortedRetentionDays: number }; // true, true, 30
}
```

Rounding applies only in reports and client PDFs. Locking: entries older than
`lockAfterDays`, in a paid payroll month, or approved, are editable only by admins
(audit-logged).

## 12. Toggl / Clockify import

Settings → "Map projects & import": map external projects → CCRM projects and
external users → CCRM **users**, pick a date range, preview, then import. The
import is idempotent through `external_id`, and imported entries are priced
normally. Once the native module is enabled, `EmployeeTimesheetSummary` reads
native entries.

## 13. Chrome extension (artboard 12)

### 13.1 Where the code lives and how it ships

- Source in `extensions/chrome-time-tracker/`: Manifest V3, TypeScript, built with Vite into `extensions/chrome-time-tracker/dist`.
- `npm run build:extension` zips it to `public/downloads/ccrm-time-tracker.zip`. That file is copied into `dist/` by the normal build. The production server has no build step, so the zip is committed like `dist/`.
- The extension version is shown in CCRM next to the download button. A device on an older version than the latest shows "Update available".
- The Chrome Web Store comes later. Until then the setup guide explains "Load unpacked".

### 13.2 Pairing (safer than a permanent token on screen)

1. CCRM → Time tracking → ⋯ → **Chrome extension** shows a **one-time pairing code** (`K7Q4-9MZT`, valid 10 min, single use, with a "New code" button).
2. The extension's first screen asks for the CCRM address and the code, then calls `pair`.
3. The server returns a long-lived **device key** (prefix `ttk_`). The extension keeps it in `chrome.storage.local`. CCRM stores only its hash (the `mcp_keys` pattern).
4. "Paired browsers" lists every device (name, OS, paired date, last sync, Active/Idle) with **Revoke**.

### 13.3 Popup (360 × up to 560 px)

- **Running**: description, project · task, a large elapsed time, Stop, today's total, the last 3 entries with ▶ Continue, a footer with "Open CCRM" and "N unsorted".
- **Idle**: description input, project search (results from `projects?q=`, the **suggested** project first when the active tab matches a watched-site rule), optional task, Start.
- **Not paired**: CCRM address + pairing code + Connect.
- The toolbar icon badge shows the elapsed `h:mm` in rose while running, and nothing when idle. It is updated by an alarm every minute.
- **Offline**: start and stop are queued with client timestamps and sent when back online. The server accepts a client `startedAt`/`stoppedAt` up to 24 h old.
- The extension uses the same API rules: one running timer per user, prefills, and the require-project setting.

### 13.4 Activity capture (opt-in, off by default)

- Requires the optional `tabs` permission, requested only when the user turns it on.
- Only while **no timer is running**: track how long the active tab stays on a watched site (a domain or pattern list per user, each mapped to a suggested project), ignore blocks shorter than N minutes (default 5), and merge consecutive blocks on the same site.
- Store **only** the domain, the page title and the times. Never the full URL path or page content. Upload in batches to `activity` → **Unsorted** inbox (§9.3).
- Admins can disable capture company-wide (`extension.activityCaptureAllowed`).

## 14. Permissions (RBAC)

Add a **Time tracking** section to `PERMISSION_SECTIONS` (`src/utils/permissions.ts`)
and mirror it in `api/permissions.php`. Follow "Adding a permission" in
`docs/db_integration_notes/RBAC_SYSTEM.md`.

- `time_tracking`: access. View = own entries. Edit = create and edit own entries (including through the extension).
- `time_tracking_team`: see others' entries, log time for others, the Team tab, "Viewing as".
- `time_tracking_costs`: cost, rates, margins everywhere (enforced server-side).
- `time_tracking_salary_report`: the salary allocation report.
- Map the route `time-tracking` in `permissionKeyForRoute`. Add the module to the sidebar, `VisibleModulesSettings` and `ModuleSetupWizard` (setup step: hours basis, multiplier, which users track time, extension on/off). Licensing never disables the running module (`.agents/rules/licensing.md`).

## 15. Mobile / PWA (artboard 9)

A large running card, today's entries with 44 px ▶ buttons, and a bottom bar
(Timer · Calendar · Tasks · Add). On a phone the Day view's strip scrolls
horizontally and the quick row stacks into a vertical form.

## 16. Edge cases to handle and test

- Midnight crossings: shown on the start day with a `+1` end marker. DST: durations come from UTC.
- Two clients (for example the web app and the extension) start at once: the unique index rejects one, and the API returns the existing running entry.
- A user without an employee record: entries allowed, cost "no rate", listed separately in the salary report.
- A salary change mid-month: snapshots keep the old entries, and a re-price is offered.
- A revoked extension device keeps its queued offline actions locally, and they are rejected with 401. The popup tells the user to pair again and offers to show the lost actions.
- A deleted or archived project or task: its entries stay, shown greyed out.

## 17. Delivery phases

1. **Core**: schema, `timeCost.ts` + tests, the entries API, timer bar, List, Day (with hours-only rows), header pill, entry drawer, project picker, Settings (cost + rules), RBAC, sidebar.
2. **Entry points**: task ▶ and the task drawer section, project "Start timer" and the project **Time** tab, the Finances "Labour" line.
3. **Calendar + Timesheet**.
4. **Team matrix + Reports + salary allocation**, exports.
5. **Chrome extension**: pairing, devices, popup, badge, offline queue. Then activity capture + Unsorted inbox.
6. **Locking/approval, Toggl import, mobile polish, idle reminder.**

Each phase extends the QA suite (seed entries in the QA dataset; mock
`/api/time_entries.php` and `/api/time_tracker_ext.php`): start → stop → edit →
delete, start-from-task prefill, one running timer, hours-only rows in the Day
view, Team matrix totals, cost hidden without permission, and a user without an
employee record.

## 18. Open questions (assumed defaults; confirm before phase 1)

1. Which salary is authoritative for past months, the month's `EmployeeSalary` record or the current `Employee.salaryAmount`? (Assumed: `EmployeeSalary` when present.)
2. Is the 1.352 multiplier global, or per employee? (Assumed: global.)
3. Should employees see their own cost rate? (Assumed: no.)
4. Should "Require a project before Stop" default to on? (Assumed: off.)
5. Should Toggl be a live sync or a one-way importer? (Assumed: importer.)
6. Should the Chrome extension be distributed as a zip download only, or also through the Chrome Web Store? (Assumed: zip first, store later.)
7. Should activity capture ship at all, or only the timer part of the extension? (Assumed: ship it, opt-in and off by default.)
