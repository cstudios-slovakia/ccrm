# Time Tracking: implementation plan (for approval)

Status: **waiting for approval. No code has been written.**
Inputs: `docs/prompts/time-tracking-implementation.md` (wins), `docs/prompts/time-tracking-module.md` (brief).
Extra instruction from the user: **keep the existing external tracking connectors (Toggl).** See section 1.

---

## 0. Needs your decision before phase 1

### 0.1 STOP: the September 2026 fixture is wrong for Slovakia

The prompt says: if the API or an official source disagrees with the fixtures, stop and tell you. They do.

| Source | 15 Sept 2026 (SK) | 1 Sept 2026 (SK) | Sept 2026 working days |
|---|---|---|---|
| Brief / prompt fixture | day off | working day | **21** |
| Nager.Date `/PublicHolidays/2026/SK` | `Observance`, so not counted | `Observance`, so not counted | **22** |
| Consolidated law 241/1993 (slov-lex, wording from 1 Nov 2025), new § 4b | "V roku 2026 nie sú sviatky uvedené v § 2 ods. 2 písm. e) a j) dňami pracovného pokoja." Letter e) is 15 Sept, so **not a rest day** | working day (a state holiday, not a rest day; commentaries agree) | **22** |

The API and the law agree with each other. Only the fixture is off. September 2026 has 22 weekdays and no rest day, so it equals October 2026 (22). Consequences:

- **The "Sept vs Oct differ" example and QA check cannot use September.** At 22 days both months give the same €24.58/h.
- **DECIDED (user, with a calendar screenshot):** the "rate differs by month" example and QA check use **May 2026 = 20 working days** (1 May off; 8 May is a working day) vs **June 2026 = 22**. Erik, monthly €3,200: May = 3200 / 20 / 8 × 1.352 = **€27.04/h**; June = **€24.58/h**. Oct 2026 stays at 22 days (€24.58/h) for the main worked example. The screenshot also confirms 8 May 2026 is a working day (§ 4b, letter j). Note: by my count August 2026 has 21 weekdays (not 22), so August would also have worked; May/June is simply the better-verified pair.
- Also note: Nager marks **8 May 2026** `Observance` too. This also matches § 4b (letter j). So 8 May 2026 is a working day in SK.

I only read § 2 ods. 2 and § 4b of the consolidated text. I did not read § 2 ods. 1, so the 1 Sept status rests on Nager plus a commentary. I will cross-check it in phase 1 before it goes into a test.

**Status: decided, May vs June 2026.**

### 0.2 Hungary: the API does not cover the decrees, and one 2026 date looks missing

- Nager HU 2026 returns only the statutory holidays. It contains **no** áthelyezett pihenőnap or ledolgozós szombat.
- It also has **no 24 Dec 2026**. A pénzcentrum article says Dec 24 became a public holiday (so Dec 12 no longer needs to be worked). I could not confirm that against an official text.
- Dates reported by the press for 2026 (not verified against the decree):
  - Fri 2 Jan off, worked on Sat 10 Jan.
  - Fri 21 Aug off, worked on Sat 8 Aug.
  - Dec: either (Thu 24 Dec off, Sat 12 Dec worked) or Dec 24 a plain holiday with no Saturday. The source contradicts itself.
- I searched and **found no free machine-readable source** for these decrees. The official source is the NGM decree on the working-time arrangement, published in Magyar Közlöny / njt.hu. Plan: Settings → Time tracking → "Overrides" gets manual entry, with a note and a link to njt.hu. **I will not invent dates.** The built-in fallback will carry only dates I can verify. Today that is the statutory holidays, and Dec 24 only after I confirm it.
- **Oct 2026 HU = 21 working days** (22 weekdays, 23 Oct is a Friday holiday, no October shifts). This matches your fixture.

**Status: confirmed by the user.** HU decree days are manual overrides only. The built-in list will not contain Dec 24 2026 until I verify it against the official text; I will flag it if I cannot.

### 0.3 Holidays follow the work country, never the UI language

Confirmed. The UI language only chooses the **name** of a holiday (via the `en/sk/hu` map). **Which days are holidays** depends only on the country of the person's calendar: `Employee.workCountry`, else the company country. A Slovak-language user with `workCountry = 'HU'` sees Hungarian holidays, with names shown in Slovak. A test covers this (language switch must not change the holiday set or the working-day count).

---

## 1. Existing external connectors stay (Toggl / Clockify)

You asked to keep them. What exists today, and what this plan does with it:

| Existing piece | Plan |
|---|---|
| `public/api/time_tracking.php` (`test_connection`, `fetch_workspace_users`, `fetch_employee_hours`) | **Untouched.** Same actions, same permission gates. |
| `public/api/time_tracking_lib.php` (`toggl_curl`, `ccrm_time_tracking_month_hours`, stored-settings readers) | **Untouched**, and **reused** by the phase 6 importer (no second Toggl client). |
| `public/api/my_employment.php` (self-service hours) | **Untouched.** |
| `employees.time_tracking_provider / _user_id / _user_name`, `Employee.timeTracking*` | **Untouched.** They also serve as the default user mapping for the importer. |
| `EMPLOYEE_SETTINGS.timeTracking` (`provider`, `togglApiToken`, `togglWorkspaceId`, `clockify*`) | **Untouched.** Settings → Time tracking only *links* to it ("External time tracker"). |
| `EmployeeTimesheetSummary.tsx` (Toggl-based hours calendar) | Keeps reading Toggl. Phase 6 adds a switch "Source: Toggl / CCRM time tracking" in this summary. No automatic switch, so nothing changes by itself. |

Two facts I found:

- Only **Toggl** is implemented. `provider === 'clockify'` returns "Unsupported provider" and the Clockify settings fields are placeholders. I keep that as is. Clockify import is not built unless you ask (it is optional in phase 6).
- The importer (phase 6, brief section 12) writes `source = 'toggl'`, `external_id = <toggl id>`, idempotent. It does not remove or replace the Toggl summary, so turning on the native module never hides Toggl data.

**Double counting guard:** imported rows and Toggl-summary hours describe the same work. The summary switch above is per view and explicit, and the importer shows "N entries already imported" in its preview.

---

## 2. Findings in existing code (symptom → root cause → proposed fix)

These affect the plan. I do not fix anything outside a phase's scope.

1. **Ticket → contract link is not persisted.**
   - Symptom: `ticket.contractId` and `SupportContract.hoursUsedThisMonth` vanish after a reload.
   - Root cause: the `tickets` table has no `contract_id`. The `sync.php` GET never emits `contractId`. It sends `usedHours: 0.0` for every contract. `hoursUsedThisMonth` is only React state bumped in `TicketsView.tsx:1089-1103`. `support_contracts` also has no `reset_day`.
   - Fix (in this plan, phase 2): contract usage is **derived** from `time_entries`. The contract is resolved as in `resolveProjectRetainer` (ticket → project → contract by `project_id`, else client → contract by `client_id`). No new `tickets.contract_id` column. The prompt's "ticket's contract" wording is satisfied by this resolution. **Question Q-C below.**
2. **`ticket.billable` is hardcoded `true`** in the `sync.php` GET (`'billable' => true`, line ~2475) and there is no `tickets.billable` column. The prompt says billable defaults to `ticket.billable`. In practice that is always true until a column exists. Proposal: keep default `true` (no column). Mention only.
3. **Delete-not-in-payload on ticket time** (`sync.php` 6687-6692) means a stale PWA tab that has the ticket without an entry deletes server entries. This is the exact hazard the prompt wants removed. The migration plus ignoring `timeEntries` fixes it.
4. **No dedicated name → user helper exists.** The prompt says "the existing name→user helpers". I found none besides ad-hoc `users` queries in `auth.php`. I will add one small helper next to the migration: case-insensitive exact match on `users.name`, accepted only when exactly one user matches.

---

## 3. Schema (all in `public/api/schema.php`, covered by the fingerprint)

The ticket-time migration lives in `schema.php` itself, so **no fingerprint change is needed**. If I split it into a new file, I add that file to `ccrm_schema_fingerprint()`.

### 3.1 `time_entries`

Brief section 4.1 with these changes from the prompt:

| Column | Type | Notes |
|---|---|---|
| `id` | varchar(64) PK | `te-<uuid>` |
| `user_id` | varchar(50) NOT NULL | owner |
| `recorded_by_user_id` | varchar(50) NOT NULL | who typed it |
| `employee_id` | varchar(50) NULL | resolved from `user_id` on save |
| `project_id` | varchar(50) NULL | NULL = "Assign project" |
| `task_id` | varchar(50) NULL | |
| **`ticket_id`** | varchar(50) NULL, index `(ticket_id)` | new, prompt section 4 |
| `description` | varchar(500) NULL | the title **only** for unlinked entries (no task, no ticket). NULL when linked. |
| **`title_snapshot`** | varchar(500) NULL | written on every save, never shown while the task or ticket exists, never editable |
| **`legacy_note`** | varchar(500) NULL | read-only; migrated ticket-time notes |
| `entry_date` | DATE NOT NULL | company-timezone date |
| `start_at`, `end_at` | DATETIME NULL | UTC; NULL for hours-only |
| `duration_sec` | INT NULL | |
| `billable` | TINYINT(1) | |
| `billable_rate` | DECIMAL(10,2) NULL | snapshot |
| `cost_rate` | DECIMAL(10,4) NULL | snapshot |
| `cost_rate_source` | varchar(32) | `monthly \| daily \| hourly \| contractor_hourly \| contractor_daily \| contractor_monthly \| none` |
| **`cost_rate_basis_days`** | TINYINT NULL | the month's working days used (NULL for hourly and for `none`) |
| `cost` | DECIMAL(12,2) NULL | `duration_sec / 3600 × cost_rate` |
| `tags` | JSON | |
| `source` | varchar(16) | `timer \| manual \| day \| calendar \| timesheet \| extension \| activity \| toggl \| clockify \| ticket_legacy` |
| `origin_type`, `origin_id` | varchar NULL | `origin_type` gains `'ticket'` |
| `device_id`, `external_id` | varchar NULL | `external_id` is unique per source; migrated rows use `tte:<id>` |
| `approval_status` | varchar(16) NULL | |
| `running_guard` | generated, UNIQUE | one running timer per user |
| `created_at`, `updated_at`, `deleted_at` | | soft delete |

Indexes: `(user_id, entry_date)`, `(project_id, entry_date)`, `(task_id)`, `(ticket_id)`, `(employee_id, entry_date)`, unique `(source, external_id)`.

There is no foreign key to `tasks`/`tickets`/`projects`. Entries must survive deletion of the item (greyed out, `title_snapshot` shown).

### 3.2 Other tables

- `public_holidays(country CHAR(2), date DATE, local_name, name_en, source ENUM('api','builtin','manual'), fetched_at, PK(country,date))`, as in the prompt.
- `time_tracker_pairing_codes`, `time_tracker_devices`, `time_activity`: brief section 4.2 unchanged (phase 5).
- Settings blob `TIME_TRACKING_SETTINGS` in `system_settings`; per-user `TIME_TRACKING_ACTIVITY_RULES`.
- `employees.work_country CHAR(2) NULL` (SK|HU) for `Employee.workCountry`. **Q-W below.** It touches sync mapping and the employee form.
- `tasks.estimate_minutes INT NULL`; `projects.hours_budget`, `projects.billable_rate` (DECIMAL NULL), `projects.is_internal TINYINT(1) DEFAULT 0` (brief section 4.3).
- `ticket_time_entries` is **kept** (never dropped).

### 3.3 `TimeTrackingSettings`

Brief section 11 with `publicHolidays` replaced by:

```ts
holidayOverrides: Record<'SK' | 'HU', Record<string /* year */, Array<{
  date: string;                     // YYYY-MM-DD
  kind: 'extraDayOff' | 'extraWorkingDay';
  name: string;
}>>>;
```

Company default country comes from `CompanyProfile.country` (SK/HU, else SK). Per-employee override is `Employee.workCountry`.

### 3.4 Ticket-time migration (idempotent, prompt section 4)

1. For each `ticket_time_entries` row without a `time_entries` row with `external_id = 'tte:<id>'`, insert:
   - `user_id` = `user_id` if it exists in `users`, else a unique case-insensitive match of `user_name` (helper from finding 4), else the ticket's `assignee_id`. Anything resolved by fallback is written to the migration log (`error_log` + a `system_settings` key `TIME_TICKET_MIGRATION_LOG`).
   - `ticket_id`, `project_id` (via the ticket, then the section 4 resolution), `entry_date = logged_at`, hours-only (`start_at` NULL), `duration_sec = minutes × 60`, `billable`, `legacy_note = note`, `description` NULL, `title_snapshot` = ticket title, `source = 'ticket_legacy'`.
   - Priced normally (needs `timeCost`, so the pricing step is a PHP port of `timeCost.ts`; the migration calls `time_cost.php`).
2. Re-running inserts nothing (`external_id` unique).
3. Runs inside `ccrm_apply_migrations`, never on the `?probe=1` path (the fingerprint gate already guarantees that).
4. Pricing during a migration must not call the network. Working days for the cost come from the cache table, else the built-in rules ported to PHP (`holidays` builtin in `time_cost.php`).

---

## 4. API surface

All edited in `public/`, then `npm run sync:backend`. PHP is linted through Docker.

### `public/api/time_entries.php` (session auth)

Brief section 4.4, plus:

- Every entry returns resolved `title` and `titleSource: 'task' | 'ticket' | 'entry'` (server joins `tasks.title` / `tickets.title`; the ticket "subject" is the `title` column) and `titleDeleted: bool` (greyed fallback from `title_snapshot`).
- Filters: `from`, `to`, `userId`, `projectId`, `taskId`, `ticketId`, `running`.
- Without `time_tracking_costs`, `cost_rate`, `cost`, `billable_rate`, `cost_rate_basis_days` and `cost_rate_source` are stripped server-side. Without `time_tracking_team`, `userId` is forced to the caller.
- Cost visibility: the owner always sees cost fields of their own entries; others' need `time_tracking_costs` (section 9, item 3).
- Ticket reads: `ticketId` requires the new `tickets.time` toggle (section 9, A-T).
- Writing `tasks.title`, `tickets.title` is **never** done here. Renaming goes through the existing frontend save paths (`TaskEditDrawer` → `onSave`; ticket save → `updateSelectedTicket`), as the prompt requires.
- Link resolution on save: task → fills `ticket_id` from `tasks.related_ticket_id` (or a `ticket_task_links` row), then project; ticket-only → project via `ticket.project_id`, else contract project, else client rule (brief 7.1). Also writes `title_snapshot`.
- Linking a standalone entry to a task or ticket drops its description; the client asks first when it differs (prompt section 1).

### `public/api/holidays.php` (session auth, read)

- `GET ?country=SK|HU&year=YYYY` returns `{days:[{date,localName,nameEn,names:{en,sk,hu},kind,source}], fallback:bool}`.
- Fetch on first need: `https://date.nager.at/api/v3/PublicHolidays/{year}/{SK|HU}`, 5 s timeout, `https` only, no redirects, peer verification on, `ccrm_assert_public_host('date.nager.at')` as the DNS guard from `auth.php` (the egress convention; `ares_cz.php` is a bare `curl`, so I follow the stricter `auth.php` one). Keep `global === true` and `types` containing `Public`.
- Cached in `public_holidays`. Refresh monthly for current + next year from `api/cron.php` (the server cron entry), once a month via a `system_settings` timestamp. Never from `sync.php` or migrations.
- Nager's response shape was checked on 2026-10-26 for SK and HU: `date, localName, name, countryCode, fixed, global, counties, launchYear, types`.

### `public/api/time_cost.php`

PHP mirror of `src/utils/timeCost.ts` (pure, takes `workingDays` as input). A shared fixtures JSON is run by both a node test and a PHP test (via Docker).

### `public/api/time_tracker_ext.php` (phase 5)

Brief section 4.4: `pair`, `running`, `start`, `stop`, `recent`, `projects`, `tasks`, `activity`, `unsortedCount`. Bearer device key, CORS for `chrome-extension://<id>`. The extension shows linked titles read-only. Linked entries come back with the resolved `title`.

### Changes to existing endpoints

- `sync.php`: see section 6.
- `permissions.php` / `permissions.ts`: the four `time_tracking*` keys.
- `cron.php`: holiday refresh, auto-stop at `autoStopAt`, unsorted purge.

---

## 5. Frontend / utils

- `src/utils/timeCost.ts` (+ tests). Input: entry, employee, month working days, settings. Output: `{rate, source, basisDays, cost}`. Includes the plain-words explanation string builder.
- `src/utils/holidays.ts` (+ tests). Fixed-date and Easter-based SK/HU holidays, the `en/sk/hu` name map keyed by country + rule, `workingDays(month, country, overrides, holidays)`.
- `src/utils/timeTitle.ts`: resolve the title and the "can rename?" state for an entry.
- Module, tabs, entry drawer, timer bar, header pill, project picker, Settings section: brief section 2. Strings via `t(en, sk, hu)`, raw palette classes (this codebase uses them throughout, so I keep that convention), View-size rules.
- Renaming a linked entry: calls the same save path as `TaskEditDrawer`'s `onSave`, so conflict handling, audit and permission checks apply. When the user cannot edit the task, the field is read-only with a tooltip. Hint text: "Renames the task" / "Renames the ticket".

---

## 6. Ticket time: every place that reads or writes it today, and the change

| Place | Today | After |
|---|---|---|
| `sync.php:2407-2424` | loads all `ticket_time_entries`, builds `timeEntries` | removed; `timeEntries` is `[]` |
| `sync.php:2434-2438, 2476` | `loggedMinutes` = sum of those rows | `loggedMinutes` = sum of `time_entries.duration_sec` per `ticket_id` (one grouped query). It stays a derived number so old clients still show a total |
| `sync.php:2487` | serves `timeEntries` | serves `[]` |
| `sync.php:6533-6541` | `upsertTimeEntry` prepared statement | removed |
| `sync.php:6666-6693` | upserts payload entries and **deletes the rest** | removed; incoming `timeEntries` is ignored (an old cached PWA cannot delete or duplicate anything) |
| `sync.php:6702` | cascade delete of a deleted ticket's time rows | stays for the legacy table. `time_entries` rows are **not** deleted; they grey out via `title_snapshot` |
| `schema.php:1128` | table `ticket_time_entries` | kept, no longer written |
| `schema.php:4175, 4424` | ensure list, demo seed | ensure list kept; the demo seed also writes the two sample entries into `time_entries` |
| `TicketsView.tsx:1070-1113` (Log time) | appends to `ticket.timeEntries`, bumps `loggedMinutes`, bumps `hoursUsedThisMonth` | POST a native entry (`ticketId`); list refetches; no client bumps |
| `TicketsView.tsx:1115-1181` (admin edit total) | rewrites `timeEntries` | admin adjusts the real entries (edit drawer); the "edit total" shortcut creates one correcting entry (hours-only) |
| `TicketsView.tsx:1183-1232` (edit/delete entry) | mutates `timeEntries` | PUT / DELETE (soft) on `time_entries.php` |
| `TicketsView.tsx:2631, 2647, 3154-3262, 3471, 3868, 4027-4040` | count / timeline / list from `timeEntries` | read from the ticket's native entries (hook `useTicketTimeEntries(ticketId)`) |
| `TicketsView.tsx:1089-1103, 1271, 5121` | `hoursUsedThisMonth` client counter | derived from entries via `computeProjectRetainerUsage` |
| `tickets.ts:733-754` `computeProjectRetainerUsage` | sums `ticket.timeEntries` / `loggedMinutes` | takes native entries (billable only, within `[periodStart, nextResetDate)`); each entry is a single row, so an entry linked to both a task and a ticket counts once |
| `types/index.ts:1560-1632` | `TicketTimeEntry`, `timeEntries`, `hoursUsedThisMonth` | kept as deprecated optional fields; documented as derived |
| `ProjectTicketsPanel.tsx:293,311`, `TicketsView.tsx:769` | create tickets with `timeEntries: []` | unchanged (harmless) |
| `tickets.test.ts:163`, `scripts/probe-rbac/run.mjs:752`, `scripts/capture-module-screenshots.mjs:273` | fixtures with `timeEntries` | updated with the retainer change |
| Ticket detail UI | none | ▶ Start timer, "running" state, tracked / billable totals |

Rate for ticket entries: brief section 7.3, resolving the contract as in finding 1.

---

## 7. Holidays: use in the app

- Day strip (muted, name in tooltip), Calendar (all-day band and tinted cell), Timesheet column headers, Team matrix basis hours and utilisation, List day-card header ("State holiday"), and the weekly target (excludes holidays and counts extra working days). Logging time on a holiday is never blocked.
- Name shown: `localName` when the UI language matches the holiday's country, else English. The `en/sk/hu` map for ~15 SK and ~12 HU rules is used first; Nager names are the fallback.
- Amber note in Settings when the built-in list is in use because the API was unreachable and nothing was cached.
- QA suite: `/api/holidays.php` is mocked from the built-in rules.

---

## 8. Cost table

Implemented exactly as in prompt section 3 (the table is the spec). Worked examples become unit tests:

- Erik, monthly €3,200, Oct 2026 SK: 22 days → €145.45/man-day → €18.18/h → ×1.352 = **€24.58/h**; 2:15:00 = **€55.31**.
- Same salary, Oct 2026 HU: 21 days → 3200 / 21 / 8 × 1.352 = **€25.75/h**.
- Different-month example (decided): **May 2026 SK = 20 days → €27.04/h vs June 2026 SK = 22 days → €24.58/h**. (September is out, see 0.1.)
- Freelancer hourly €20 → €20.00/h, no multiplier. Company man-day €160 → €20.00/h. Employee hourly €12 → €16.22/h. No employee → `none`, cost NULL.

Mirrored in PHP with a cross-language fixtures test.

---

## 9. Answers: brief section 18 and the three plan questions

All items below are **decided by the user** unless marked otherwise.

1. **Salary source for past months:** `Employee.salaryAmount` for v1. `EmployeeSalary` is a payroll period record whose `items` mix base pay with bonus / commission categories (no "base" flag), so `totalSalary` would inflate the hourly cost. A per-month override can come later. The user confirmed this reflects real expenses.
2. **Multiplier:** global for now.
3. **Employees see their own rate:** **yes.** Rule: an entry's cost fields (`cost_rate`, `cost`, `cost_rate_source`, `cost_rate_basis_days`) are returned to its **owner** (`user_id` = caller) always. For other people's entries they need `time_tracking_costs`. `billable_rate` and margins stay behind `time_tracking_costs`. Server-enforced.
4. **Require project before Stop:** default **on** (`requireProjectToStop: true`).
5. **Toggl:** importer, built on the existing connector (section 1).
6. **Extension distribution:** zip first.
7. **Activity capture:** ship, opt-in, off by default.

**Q-W: `Employee.workCountry` ('SK' | 'HU' | null):** **approved.** Changes Employees: type, `employees.work_country`, employee form, sync mapping. The country drives the holiday set, never the UI language (0.3).

**Q-N: own note on a task / ticket entry:** default **no**. Only migrated ticket notes survive, read-only in `legacy_note`.

**Q-C: ticket → contract (resolved by me, no decision needed).** "Contract id" is only the internal link between a ticket and the client's support contract (retainer). It is not saved today (finding 1). The plan finds the contract automatically from the ticket's project, else its client, as the retainer code already does, so **no new field and nothing for users to set**.

**A-T: who sees ticket time (decided).**
- Visible to admins, project managers, and any role that is given it. **Not visible to clients by default**, and never to non-employee surfaces (ticket widget, public ticket token).
- New toggle permission `tickets.time` (requires `tickets` ≥ view; default on for Admin and Project Manager, off for new roles). It is added to `PERMISSION_SECTIONS`, mirrored in `permissions.php`, with labels in EN/SK/HU. `time_entries.php?ticketId=` checks it server-side. Users with `time_tracking_team` can always see entries through the Team views.
- Setting `TimeTrackingSettings.ticketTimeVisibleToClients: boolean` (default **false**). Today no client-facing surface shows ticket time (`ticket_widget.php` has no time data). The setting is stored and enforced in the endpoint that would serve it, so turning it on later needs no schema change. I will not build a client-facing time view in this scope.

---

## 10. Phases

Each phase ends with: `npx tsc --noEmit`, `npm run test:unit`, scoped `npm run test:qa` (named files, foreground, waiting if the runner queues), then version bump → changelog → build → commit with the version tag. Only my own hunks are staged (shared checkout; no stash, no `git add -A`). `dist/` is rebuilt only if no one else has uncommitted frontend work.

1. **Core + holidays + cost.** Schema (all tables above except the extension ones), `timeCost.ts`/`.php`, `holidays.ts`, `holidays.php` + cron refresh, `time_entries.php`, timer bar, List, Day (hours-only), header pill, entry drawer, project picker, Settings (cost, rules, holidays, overrides), RBAC, sidebar, module wizard step. Title rule (section 1 of the prompt) is built in from the start.
2. **Entry points + tickets.** Task ▶ and drawer section, project start and the Time tab, Finances "Labour (time tracking)" line, ticket linking, the migration, `sync.php` changes, `TicketsView` rewrite, retainer derivation.
3. **Calendar + Timesheet.**
4. **Team matrix + Reports + salary allocation + exports (CSV, client PDF).**
5. **Chrome extension** (pairing, devices, popup, badge, offline queue), then activity capture and the Unsorted inbox.
6. **Locking / approval, Toggl importer (on the existing connector), summary source switch, mobile polish, idle reminder.**

QA additions (seed data and mocks for `/api/time_entries.php`, `/api/holidays.php`, `/api/time_tracker_ext.php`):

- renaming a linked entry renames the task, and the ticket;
- a holiday shows in the Day strip and the Calendar and lowers the weekly target;
- a monthly employee's rate differs between May (20 days, €27.04/h) and June 2026 (22 days, €24.58/h);
- switching the UI language does not change the holiday set (section 0.3);
- a freelancer's flat rate;
- logging time on a ticket counts once toward the contract;
- cost of **other people's** entries is hidden without `time_tracking_costs`, while an employee still sees their own rate and cost;
- ticket time is hidden without `tickets.time`.

Plus the brief's journey checks (start → stop → edit → delete, prefill from a task, one running timer, hours-only rows, Team totals, user without an employee record).

---

## 11. What I am waiting for

All questions are answered. Only a plain **"go"** to start phase 1.
Open item I carry myself: verify HU 24 Dec 2026 and SK 1 Sept against the official texts in phase 1.
