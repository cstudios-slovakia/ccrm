# Time tracking v2: parallel tracking, auto-pause, status-driven timers

This is the **only** document for the second generation of the Time Tracking module. It holds
the analysis, the decisions, the specification and the phases. The first generation is
[`TIME-TRACKING.md`](TIME-TRACKING.md); where the two disagree, **this file wins** (the list of
what it replaces is in D12).

> **To start work, tell a coding agent:** `make tt2 phase 1` (or another number from A3).
> The agent reads this file and follows Part A.

Three features, one foundation:

1. **Parallel tracking.** A person supervises AI agents on several projects at once. Each
   project receives the full time; the person's own working time and cost are counted once.
2. **Auto-pause.** A running timer asks "still working?" after 50 minutes. No answer in 10
   minutes pauses it; no answer in another 10 minutes stops it.
3. **Status-driven timers.** Each task status can start, pause or stop the timer.

Written 2026-11-19 against `1.13-nectarine` at `3e3a0efe`. File and line references were
checked on that commit; search by symbol if they moved.

---

# Part A. How to work with this file

## A1. The protocol for "make tt2 phase N"

1. **Read this whole file**, then `CLAUDE.md`, `docs/TESTING.md`, `docs/VIEW-SIZE.md`,
   everything in `.agents/rules/`, and the parts of `docs/TIME-TRACKING.md` your phase names.
2. **Check the status table (A3).** Every phase in "Needs" must be ✅ and merged into the
   integration branch. If it is not, stop and tell the user. If phase N is already ✅, stop.
3. **Check the decisions your phase uses (Part C).** A decision marked ✅ is final. A decision
   still marked 🟡 is the proposed default: build with it, and say in your report that you did.
   Never re-ask a ✅ decision. If the code contradicts a decision or a number here, **stop and
   tell the user**; do not change a fixture to make a test pass.
4. **You are the orchestrator of this phase; you do not build it alone.** Build only the
   checklist of phase N (Part E); Part D is the spec. How to split and delegate the work is A1b.
5. **Test the merged result:** `npm run check`, then **one** scoped QA run
   `node scripts/qa/run-qa.mjs --files <changed files>`, plus the phase's own tests. PHP is
   linted through Docker when it is not installed:
   `docker run --rm -v <dir>:/app -w /app php:8.2-cli php -l <file>`. The server probe
   `npm run test:time-tracking` sees only the main checkout: run it after the merge.
6. **Commit** with a changelog fragment in `changelog.d/` (never name it `*-prompt.md`, that
   pattern is gitignored). No version bump and no `dist/` build unless the user asks for a build.
7. **Update this file in the same commit:** tick the boxes, fill the status row, write what you
   deferred under the phase's **Left over** line, add what you learned to **Findings (A4)**.
   ✅ only when every box is ticked and the tests are green; otherwise 🟡 with what is missing.
8. **Report:** what was built, which subagents did which package (and on which model), test
   results (with the output of anything that failed), what you assumed or deferred,
   pre-existing failures you saw (listed, not fixed). **Stop.** Do not start the next phase.

## A1b. Orchestration: parallel subagents on your own model or a lower one

The session that receives "make tt2 phase N" plans, delegates, merges and verifies. It writes
code itself only for the integration between packages and for small fixes after the merge.

1. **Split the phase into work packages whose files do not overlap.** Each phase in Part E has a
   **Work packages** line with a suggested split and its order. Adjust it if the code says
   otherwise; never give two agents the same file.
2. **Search before you split.** Send broad "where is X, who calls Y" questions to `ccrm-explorer`
   agents in parallel instead of reading large files yourself.
3. **One self-contained prompt per package,** built from `docs/prompts/_TEMPLATE.md`: the goal,
   the exact files, the sections of this file to read (name them: "read D2 and D3.3"), the
   decisions that apply, the definition of done, what is out of scope. A subagent knows only what
   the prompt says. Every editing prompt ends with this sentence, verbatim:

   > Verify with `npm run check` only. Do not run browser QA, do not push, do not wait for CI. Commit on your worktree branch; the orchestrator merges.

4. **Run the packages as parallel subagents, each in its own worktree** (`ccrm-implementer`, or
   a general agent with `isolation: worktree`). **Model: your own or a lower one, never a higher
   one.** Use your own model for money, date, schema and concurrency logic and for anything that
   two languages must compute identically. Use a lower model for mechanical work: translations,
   wiring a new field through types, test scaffolding, mock updates.
5. **At most three editing agents at once on this machine, counted across every open session.**
   If other phase sessions are running, use fewer. A package marked **first** is merged before
   the others start, because they build on its shape (a schema, an API contract, a provider).
6. **Review before merging.** Every non-trivial diff gets an independent `ccrm-reviewer` on your
   own model or a lower one, given the diff and the spec sections, not your opinion of it. Fix
   what it confirms.
7. **Merge one package at a time** from the main checkout
   (`node scripts/agent/finish-worktree.mjs <name>`), in the order of the Work packages line.
   After the last merge run step 5 of A1 yourself. Subagents never run browser QA.
8. **Stay single** for a package that is small or tightly coupled; a fresh agent re-reads
   everything and is not faster. Say so in the report.

## A2. Rules for every phase

- **Backend:** edit `public/` only, then `npm run sync:backend`.
- **Schema:** `time_entries` is not written by `sync.php`, so the pre-transaction healing step
  of the 4-place rule does not apply to it. The other places do: `CREATE TABLE` in `schema.php`,
  an idempotent migration in `ccrm_apply_migrations()`, `entities_overview.md` (it has no
  `time_entries` section today: phase 1 writes one). A column on a table that `sync.php` **does**
  write (`employees`, `tasks`) needs all four places.
- **Never** put DDL or per-request work on the `?probe=1` path, and never put time entries into
  the `sync.php` blob.
- **Size-capped files** (`scripts/agent/file-size-baseline.json`) must not grow: `sync.php`,
  `schema.php`, `App.tsx`, `SettingsView.tsx`, `TaskDashboardView.tsx`. New logic goes into a new
  module; the capped file gets a call, and you trim elsewhere if the count still rises.
- **Two languages, one result.** Every formula that exists in TypeScript and PHP runs the same
  JSON fixtures in both (the pattern of `timeCost.ts` / `time_cost.php` /
  `scripts/fixtures/time-cost-cases.json`).
- **UI:** existing primitives, `t(en, sk, hu)` for every string, raw Tailwind palette classes
  (this repo has no semantic colour tokens), sizes from `docs/VIEW-SIZE.md`. Every new
  interactive element has hover, press and focus feedback, and honours `prefers-reduced-motion`.
- **Old clients exist.** A cached PWA tab and an installed Chrome extension keep calling the old
  API shape. Every response keeps the old fields next to the new ones (D5.6).
- Licensing never disables the running module.

## A3. Status and order

Legend: ⬜ not started · 🟡 built, not finished (see Left over) · ✅ done

| # | Phase | Needs | Status | Commit | Date |
|---|---|---|---|---|---|
| 1 | Foundation, server: allocation engine, worked time, one pricing path | — | ✅ | `1936c4dc` | 2026-11-19 |
| 2 | Foundation, client: worked time in every personal sum | 1 | ✅ | `264ebee5` | 2026-11-19 |
| 3 | Leave-aware monthly rate and the rate card | 1 | ✅ | `f89a5610` | 2026-11-19 |
| 4 | Parallel timers, server and API | 1 | ✅ | `fda1a127` | 2026-11-19 |
| 5 | Parallel timers, UI (the container) | 2, 4 | ⬜ | | |
| 6 | Pause and the presence engine, server | 4 | ⬜ | | |
| 7 | Presence UI: ring, prompt, sound, push actions | 5, 6 | ⬜ | | |
| 8 | Task status actions | 5, 6 | ⬜ | | |
| 9 | Reports, project finances, exports, demo data, MCP summary | 2, 3 | ⬜ | | |
| 10 | Chrome extension and mobile | 7 | ⬜ | | |

**Waves.** Phases of one wave do not depend on each other. Each phase session fans out into
subagents (A1b), and the limit of three editing agents is for the whole machine: run the phases
of a wave one after another, or two at a time with a smaller fan-out each.

```
wave 1:  1
wave 2:  2 ∥ 3 ∥ 4
wave 3:  5 ∥ 6 ∥ 9
wave 4:  7 ∥ 8
wave 5:  10
```

Inside a wave, merge the lower number first; the others rebase. Files two phases of one wave
both touch (keep the edits small there): wave 2 `EntryDrawer.tsx`, `timeTrackingApi.ts`;
wave 3 `mcp_ext_modules.php`, `useTimeTracking.tsx`; wave 4 `useTimeTracking.tsx`.

Phase 1 is the only phase with no user-visible feature. It is also the one that must not be
rushed: every later number is a sum over what it writes.

## A4. Findings in existing code

Symptom → root cause → proposed fix. Fixed only in the phase named.

1. **Overlapping entries are priced twice today.** Two manual, calendar or imported entries of
   one person that overlap each cost their full duration, so a salary can be allocated above
   100 %. No overlap rule exists in `time_entries.php`, `time_tracker_lib.php` or the importer.
   Fix: phase 1 (allocation). History: decision C16.
2. **`autoStopAt` does nothing.** The setting is stored and editable
   (`time_entries_lib.php:32`, `TimeTrackingSettingsPanel.tsx:280`) but `cron.php` has no
   time-entry code. A forgotten timer runs to the 24 h cap. Fix: phase 6.
3. **`longEntryWarnHours` does nothing** (only the settings input reads it). Fix: removed from the
   UI in phase 7; presence replaces it.
4. **REST and MCP disagree on Start.** REST refuses to start the target that already runs
   (`time_entries.php:963`); MCP `start_timer` does not (`mcp_ext_modules.php:811`) and can cut
   one block of work into many entries. Fix: phase 4.
5. **The Team matrix prices with today's rate,** not the entry's frozen rate
   (`timeTeam.ts:318`). Fix: phase 9 (reads the rate card).
6. **A part-time person's monthly salary is divided by full-time hours.** `hoursPerDay` is one
   company-wide number; `employees` has no contracted hours. Decision C10.
7. **Tracked hours never become money on the revenue side.** `invoicable` is project value minus
   income records (`projectBilling.ts:75`); billable value is computed only for display
   (`EntryDrawer.tsx:207`) and in one MCP tool; entries have no "invoiced" mark. Decision C13.
8. **No server test covers the one-timer rule, the MCP timer tools or the extension endpoints.**
   Phase 4 starts with the tests.
9. **Three status writers skip the server's status-change hook:** MCP `update_task` /
   `complete_task` (`mcp_ext_writes.php:232`) and WAAI (`integration_tasks.php:668`, `:882`)
   write SQL directly; only the UI blob path reaches `sync.php:5069`. Phase 8 covers the MCP
   tools, because they act as a known user. The WAAI writers have no acting person, so they
   fire no timer action (C14).
10. **The idle reminder sees one browser page only** (`IdleReminder.tsx`) and has no server side.
    Replaced in phase 7.
11. **The dev container drops the `Authorization` header** for `api/time_tracker_ext.php`
    (`public/.htaccess` forwards it only for `api/v1`), so the extension's Bearer key never
    reaches PHP there and every device call answers 401 `not_paired`. The probe forwards it in
    its scratch copy (`SetEnvIf Authorization`). Proposed fix (not made): the same `SetEnvIf`
    line in `public/.htaccess`. Found in phase 4 (probe T14).
12. **Pre-existing probe failures** (identical on the untouched `e321ff33`): T5 "an Employee who
    cannot pick a project is not blocked by require a project" and "stopping twice is
    idempotent" — Erik works on `proj-tt-1` through a task, so he *can* pick a project and the
    stop is refused. Not fixed.
13. **The probe was date-bound**: its T2 fixtures (May/Oct 2026) fell behind `lockAfterDays` and
    the probe crashed before T5. Its setup now turns the age lock off in the scratch database.
14. **Never merge while a browser QA run is in progress:** the QA dev server serves the main
    checkout live, a merge reloads the page mid-test and fails unrelated specs (seen in phase 1:
    two time-tracking specs failed, then passed 32/32 on a stable tree).

15. **The probe's fetch reused sockets Apache had closed** (KeepAliveTimeout 5 s) after a long
    `docker exec` pause, failing with "other side closed" before PHP saw the request. The probe
    retries exactly that failure once.
16. **A paused free-text timer can be stopped without a project** (pause skips "require a
    project"; stopping a paused item adds no time). The UI may still ask; noted, not changed.
17. **The extension's own stop and the MCP stop do not set `end_reason` yet** (phase 6a covered
    REST); to be routed through `ccrm_tt_end_entries()` in phase 6.
---

# Part B. Review of the owner's proposal

## B1. What is right and stays

- **Full hours to every project, one working time for the person.** This is the correct split,
  and it has a clean mathematical form (D2) that makes every total reconcile.
- **Cost pro rata by the number of parallel projects.** Right, with one refinement: the number
  changes during the session, so the split is per stretch of time, not per entry (B2.1).
- **The container** in the timer and the calendar, with items added and removed while it runs.
- **Hours always end in a project and client.** The existing link rules already do this
  (task → project, ticket → project, the "Which project is this for?" popover).
- **Resume after a pause is a new entry.** This is the best model, not a compromise: an entry
  stays one unbroken interval, so the calendar, the split and the cost stay simple (D6).
- **A dropdown per task status.** Statuses are user-defined, so a per-status mapping is the only
  design that survives renames and additions.
- **50 / 10 / 10 minutes.** Kept as defaults; they become settings.

## B2. Gaps and what this plan does about them

**Money and time**

1. **"Divide by the number of projects" is not enough.** If project C joins 30 minutes after A
   and B, A is split by two and then by three. The split is computed per stretch between any two
   start or stop moments (D2).
2. **3 × €3.33 is €9.99, not €10.** Splitting in whole seconds and rounding each cost to cents
   loses money on every parallel hour. Time is split in integer milliseconds with the remainder
   handed out deterministically, so the shares add up **exactly**; cost keeps four decimals and
   is rounded once, in the total (D2, D3).
3. **Two numbers are needed everywhere, not only in finance.** Daily and weekly targets, the
   day-strip dots, the Team matrix, utilisation, week approval, the salary report and the
   extension's "today" all add durations today. With parallel work each would show 6 hours for a
   2-hour morning. Every sum is assigned to one of two measures (D9).
4. **The problem exists already.** Overlapping manual entries double the cost today (A4.1). The
   foundation fixes a present bug, not only a future feature.
5. **Leave in the divisor reverses an earlier decision,** and it makes the rate move. The first
   plan said vacation does not reduce working days (TIME-TRACKING C6.6) and that a rate is
   "never recomputed silently" (C7.5). Leave is often booked after hours were tracked, so the
   month's rate must be provisional, re-priced when its inputs change, and frozen when the month
   closes (D4).
6. **Paid and unpaid leave push in opposite directions.** Paid leave: same salary, fewer hours,
   higher rate. Unpaid leave: salary and hours fall together, the rate does not move. Sick leave
   follows the flag on its leave type (D4.2).
7. **"Tracked hours are invoicable" has no path today.** Nothing turns hours into an invoicable
   amount and nothing marks hours as invoiced (A4.7). This plan shows the billable value of time
   on the project; generating invoices from time is a separate project (C13, Part F).
8. **Company finance must not count labour twice.** Payroll already enters the company's
   expenses as salary records. Project labour is an allocation of that same money. The two never
   go into one total (D3.4, unchanged from the first plan).
9. **Hours-only entries cannot be parallel.** A Day or Timesheet row has no start and end, so it
   cannot overlap anything. Parallel work is recorded with timed entries (C15).

**Parallel tracking**

10. **Accidental parallel tracking is accidental over-billing.** Today a second Start replaces the
    first. If it silently added instead, a forgotten timer would bill a second client. Parallel
    is always a deliberate choice, has a cap, and is a permission (C3, C4).
11. **The same project twice.** Three agents on three tasks of one project would bill that client
    three hours per hour. Allowed for different tasks by default, switchable (C5).
12. **Everything assumes one timer:** a database unique key, about ten SQL sites, the React
    provider, the header pill, the tab title, the task button, the Chrome extension and three MCP
    tools (D5).

**Auto-pause**

13. **One question per person, not per entry.** Three timers started at 9:00, 9:10 and 9:20 would
    ask three times an hour. Presence is a fact about the person: one cycle per user covers every
    running timer (C6).
14. **The browser cannot enforce it.** The case auto-pause exists for is the closed laptop. A
    hidden tab's timers are throttled, a sleeping machine runs nothing. The server owns the
    cycle and computes the pause moment from timestamps, so the result is the same whether the
    cron, another device or the next page load notices first (D7).
15. **Which minutes are kept is undefined.** When nobody answers, does the entry end at the
    question (minute 50) or at the pause (minute 60)? (C7)
16. **Sound has hard limits.** A page may only play audio after the user has clicked in it; two
    open tabs would play a chorus; a service worker cannot play audio at all. One tab is elected
    to play; when no tab is open, the operating system's notification sound, repeated every
    minute, is the sound (D8.3, D8.4).
17. **Working away from the screen.** A two-hour client meeting is work with nobody at the
    keyboard, and a running timer would be paused during it. The owner's rule: the timer is for
    work at the computer; a meeting or a call is recorded as a regular manual entry. There is no
    way to answer in advance or from a notification (C9).
18. **It is an accuracy tool, not a control.** Manual entries exist, so auto-pause cannot prevent
    dishonest tracking; it prevents forgotten timers, which matter more now that one forgotten
    hour can bill three clients. Entries it ended are marked, so a pattern is visible (D6).

**Statuses**

19. **Whose timer?** A manager moving someone's task to "In progress" must not start a timer for
    a person who may not be there. Every status action touches only the timer of the person who
    changed the status (C14, D10.2).
20. **Bulk edits and automations.** Ten tasks set to "In progress" at once must not start ten
    timers. Status writes from MCP and WAAI bypass the hook the UI path reaches (A4.9).
21. **Statuses are identified by name.** The list is one JSON array (`TASK_STATES`); renaming a
    status cascades into tasks. The action map has to follow the same cascade (D10.1).

---

# Part C. Decisions

✅ = confirmed by the owner. 🟡 = proposed default, waiting for the owner. **All of them were
confirmed on 2026-11-19**; C9 and C14 were changed by the owner on that day. Most are settings,
so a later change of mind is a setting change, not a rebuild.

| # | St. | Decision | Used by |
|---|---|---|---|
| C1 | ✅ | Each parallel project receives the **full** tracked time (billing, budgets, retainers). The person's working time and cost count each real minute **once**, split equally between the entries running in that minute. | 1 |
| C2 | ✅ | A monthly salary's hourly cost is derived from the days the person can actually work that month: working days minus public holidays minus leave. Replaces TIME-TRACKING C6.6. | 3 |
| C3 | ✅ | **Parallel is always deliberate.** A second Start while something runs asks "Switch" or "Run in parallel" (remembered per user: ask / switch / parallel). It never adds silently. | 4, 5 |
| C4 | ✅ | Parallel tracking is off until a company turns it on, is a role permission (`time_tracking_parallel`), and has a cap `maxParallel` (default 4). | 4 |
| C5 | ✅ | The same project may run in parallel only for **different tasks or tickets** (setting `sameProject`: `differentTasks` \| `never` \| `always`). The identical target never runs twice. | 4 |
| C6 | ✅ | **One presence cycle per user,** not per entry. Any deliberate timer action (start, resume, stop one of several, edit a running entry) counts as an answer and restarts the 50 minutes. | 6, 7 |
| C7 | ✅ | When nobody answers, the entries end at **the moment of the question** (minute 50). The unanswered ten minutes are not kept. Setting `trimTo`: `prompt` \| `deadline`. | 6 |
| C8 | ✅ | After a pause, resuming starts a **new entry from that moment** (the owner's rule). There is no "I was working the whole time" button; a manual edit remains possible and is audit-logged like any edit. | 6, 7 |
| C9 | ✅ | **No answering in advance and no answering from a notification** (owner, 2026-11-19). There is no "don't ask for N minutes", and the push notification has no buttons: it only alerts, and a click opens the app. The question is answered in the app's own dialog, nowhere else. A meeting or a phone call away from the computer is recorded as a regular manual entry, not with a running timer. Still 🟡 inside this decision: the dialog is also shown when the app is open on a phone (a person may track from the phone app). | 6, 7 |
| C10 | ✅ | Part-time people: add `employees.hours_per_day` (NULL = the company's `hoursPerDay`). It scales the monthly divisor and the daily target. | 3 |
| C11 | ✅ | Leave that counts: `employee_vacations` rows with status `approved` or `taken`. A leave type with `isPaid: true` raises the rate; `isPaid: false` (default for sick and unpaid leave) leaves it unchanged. No partial sick-pay model. | 3 |
| C12 | ✅ | A month's rate is **provisional while the month is open** and is re-priced automatically when salary, leave or holidays change. The month closes when its payroll record is closed, else at the end of the following month. After that only the admin "Re-price a period" changes it. Replaces TIME-TRACKING C7.5. | 3 |
| C13 | ✅ | The project Finances tab gains an information line "Billable work (time tracking)" = Σ project time × billable rate. It does **not** change `invoicable` or any income figure. Invoicing from time is not in this plan. | 9 |
| C14 | ✅ | **Every status action applies only to the person who changed the status** (owner, 2026-11-19). Start, pause and stop touch that person's own timer on the task and nobody else's. A colleague's timer on the same task keeps running when someone else sets the task to Done; the presence question is what catches it if it was forgotten. **Start** fires only on a single-task change and only when that person is an assignee or the task has none. One-way only: starting a timer never changes a status. | 8 |
| C15 | ✅ | Hours-only entries (Day, Timesheet) are never parallel: their worked time equals their duration. | 1 |
| C16 | ✅ | **History is not rewritten.** The migration sets worked time = duration for existing entries, so no closed month changes. Settings shows how many existing entries overlap, and the admin "Re-price a period" re-allocates a chosen period. | 1 |
| C17 | ✅ | A manual or status pause stays paused until the day's `autoStopAt`; an automatic pause expires after the 10-minute resume window. | 6 |
| C18 | ✅ | Sound: a two-tone chime (the existing synthesised one), every 20 s in the first five minutes of the question, every 8 s in the last five. It stops when the pause happens. Each person has a volume control and may mute; the notification and the dialog cannot be turned off. The final sound is the owner's pick in phase 7. | 7 |

---

# Part D. Specification

## D1. Vocabulary

| Term | Stored as | Meaning | Answers |
|---|---|---|---|
| **Project time** | `duration_sec` | The length of the entry. | How much work did this project, client, task or ticket receive? |
| **Worked time** | `worked_ms` | The entry's share of the person's real clock time. | How long did this person work? What did it cost? |
| **Leverage** | derived | Project time ÷ worked time over a period. | How much parallel work was there? (1.0 = none) |
| **Timer item** | an entry | A running entry, or a paused one waiting to be resumed. | |
| **Running set** | derived | All timer items of one user. Drawn as the **container**. | |
| **Presence cycle** | `time_presence` | The 50 + 10 minutes since the person last answered. | |

The one sentence to remember: **bill project time, pay and measure worked time.** A person who
never tracks in parallel has worked time = project time on every entry and sees no change.

## D2. The allocation engine

Pure functions: `src/utils/timeAllocation.ts` and `public/api/time_allocation.php`, both running
`scripts/fixtures/time-allocation-cases.json`. No database, no clock: the caller passes entries.

**Input.** The timed entries of **one user**: `{ id, startMs, endMs }` with
`endMs = startMs + duration_sec × 1000`. A running entry has no end: the caller passes the end of
the window being settled (server) or "now" (live display). Deleted and hours-only entries are
not passed.

**Algorithm.**

1. Collect every start and end, sort them, drop duplicates. Two neighbours bound one **stretch**.
2. For each stretch with `n ≥ 1` active entries and length `len` ms: every active entry gets
   `floor(len / n)`. The remainder `len mod n` is handed out 1 ms each to the first entries in the
   order (`startMs` ascending, then `id` ascending).
3. `worked_ms(entry)` = the sum of its shares.

**Invariants** (they are tests, in both languages):

- I1. Σ `worked_ms` of all entries = the length of the union of their intervals. Exactly.
- I2. An entry that overlaps nothing: `worked_ms = duration_sec × 1000`.
- I3. `worked_ms ≤ duration_sec × 1000`, and `> 0` for any entry with a duration.
- I4. The result does not depend on the order of the input.

**Worked examples** (they are fixtures):

- *The brief.* Rate €10/h. A, B, C all 09:00–11:00. Project time 2:00 each (6:00 delivered).
  Worked 0:40 each (2:00 in total). Cost €6.6667 each, €20.00 in total: €3.33 per project hour.
- *Staggered.* A 09:00–11:00, B 09:30–10:30, C 10:00–10:30. Stretches: 09:00–09:30 A alone;
  09:30–10:00 A, B; 10:00–10:30 A, B, C; 10:30–11:00 A alone. Worked: A 30 + 15 + 10 + 30 = 85 min,
  B 15 + 10 = 25 min, C 10 min; total 120 min = the union. Project time 120 + 60 + 30 = 210 min.
  Leverage 1.75.
- *Remainder.* Three entries over the same 100 s: 33 334, 33 333 and 33 333 ms. The entry with
  the lowest id gets the extra millisecond.
- *Billing.* Billable rate €60/h on each of the three projects of the first example: €120 each,
  €360 of billable work from two worked hours that cost €20.

**Hours-only entries** have no interval: `worked_ms = duration_sec × 1000` (C15).

## D3. Schema, pricing and the one write path

### D3.1 Columns (phase 1)

| Column | Type | Notes |
|---|---|---|
| `time_entries.worked_ms` | INT UNSIGNED NULL | NULL while running. Written only by `ccrm_tt_settle()`. |
| `time_entries.cost` | DECIMAL(14,4) (was 12,2) | `worked_ms / 3 600 000 × cost_rate`, four decimals. |

Migration: `worked_ms = duration_sec × 1000` for every closed entry (C16). `cost` keeps its
values. TypeScript: `TimeEntry.workedMs`.

### D3.2 Cost

`cost = round4(worked_ms / 3 600 000 × cost_rate)`. A total is the sum of four-decimal costs,
rounded to cents **once**, at the end. Nothing rounds an entry's cost to cents before summing
(today `ccrm_tc_entry_cost` rounds to two decimals; that changes).

Billable value is unchanged in meaning: `duration_sec / 3600 × billable_rate`. Parallel work
does not reduce it.

### D3.3 `ccrm_tt_settle()`: the only code that writes worked time and cost

New module `public/api/time_settle.php`:
`ccrm_tt_settle(PDO $pdo, string $userId, string $fromUtc, string $toUtc): void`

1. `S1` = the user's closed, timed, not-deleted entries that intersect `[from, to]`.
2. Inputs = all the user's timed, not-deleted entries (running ones included) that intersect the
   span of `S1`.
3. Run the engine; for each entry in `S1` set `worked_ms`; price it (frozen `cost_rate`, or the
   month's rate when it has none); write only rows whose values changed.
4. Hours-only entries are priced by the same function with `worked_ms = duration_sec × 1000`.

Every writer calls it **inside its own transaction**, after its change, with `[from, to]` = the
union of the entry's old and new interval: create, update, stop, delete, restore, undo, import,
activity assignment, the extension, the MCP tools, the legacy ticket migration, the demo seed.
About sixteen SQL sites compute a cost today (`time_entries.php` ≈ 8, `mcp_ext_modules.php` 4,
`time_tracker_lib.php` 3, `ticket_time_migration.php` 1); after phase 1 none of them does.

**Locks.** Settling can change the worked time of a neighbour. Creating or moving an entry so
that it overlaps a **locked** entry of the same user (approved, paid month, older than
`lockAfterDays`) is refused for non-admins, the same way editing the locked entry is
(`ccrm_te_refuse_locked` gains the neighbours).

### D3.4 What does not change

- Time tracking creates no financial records. Company totals never include project labour.
- The employer multiplier, the cost-rate table for daily and hourly pay, the billable-rate
  priority, cost visibility (own cost always, others' with `time_tracking_costs`).
- An entry's cost uses the rate of the month of its `entry_date`, also when it crosses midnight.

## D4. The monthly rate (phase 3)

### D4.1 Formula

For an entry in month M, for a person paid monthly:

```
WD = working days of M in the person's country        (existing: Mon–Fri − holidays ± overrides)
PL = paid leave days in M      UL = unpaid leave days in M      (D4.2)
H  = the person's hours per day (employees.hours_per_day, else settings.hoursPerDay)

monthCost      = salary × (WD − UL) / WD × multiplier     (multiplier only for kind = employee)
availableHours = (WD − UL − PL) × H
rate           = round4(monthCost / availableHours)
```

With `hoursBasis: 'fixed'`: `availableHours = fixedHoursPerMonth × (WD − UL − PL) / WD`.
If `availableHours ≤ 0` (a whole month on leave, yet time was tracked): fall back to
`WD × H`, and mark the rate card row `fallback`.
Daily and hourly pay are unchanged.

**Examples** (fixtures; Erik, €3 200 monthly, multiplier 1.352, SK, May 2026 = 20 working days):

| Case | monthCost | Hours | Rate |
|---|---|---|---|
| No leave | 4 326.40 | 160 | **€27.04** (as today) |
| 3 days annual leave (paid) | 4 326.40 | 136 | **€31.8118** |
| 2 days unpaid leave | 3 893.76 | 144 | **€27.04** (unchanged) |
| 3 paid + 2 unpaid | 3 893.76 | 120 | **€32.4480** |

### D4.2 Counting leave days

One pure function in both languages (`leaveDaysInMonth`): from `employee_vacations` rows with
status `approved` or `taken` (C11), cut each row to month M, count only working days of the same
calendar as `WD`. A row whose `days_count` is smaller than the working days of its range (a half
day) is scaled: each working day weighs `days_count ÷ working days in the range`, at most 1. The
leave type's `isPaid` decides PL or UL.

### D4.3 The rate card

New table `time_rate_months`: one row per employee and month. It is the rate history the app
does not have today, and the explanation shown in the drawer.

```
time_rate_months(
  employee_id VARCHAR(50), month CHAR(7),                 -- PK
  rate DECIMAL(10,4), source VARCHAR(32),
  salary_type, salary_amount, working_days, paid_leave_days DECIMAL(4,1),
  unpaid_leave_days DECIMAL(4,1), hours_per_day DECIMAL(4,2), multiplier DECIMAL(6,4),
  fallback TINYINT(1), inputs_hash CHAR(40), frozen_at DATETIME NULL, updated_at)
```

`ccrm_tt_rate_for($pdo, $employeeId, $month)` computes the inputs and their hash. No row, or a
different hash on an open month: upsert the row, re-price that employee's entries of the month
(`cost_rate`, `cost` from `worked_ms`), write one audit-log line. A frozen month is returned as
stored. It is called when any entry of the month is priced, and once a day from `cron.php` for
the current and the previous month (this catches leave booked after the last entry). Never from
`sync.php`, never from the probe.

A month freezes when its `employee_salaries` record is closed, else at the end of the following
month (C12). The admin "Re-price a period" recomputes frozen months and now also re-allocates
worked time (C16).

`time_entries.cost_rate_basis_days` stays; the drawer reads the rest from the rate card:
"€3 200 ÷ (20 − 3 leave) days ÷ 8 h × 1.352 = €31.81/h (May 2026, SK, provisional)".

## D5. Parallel timers (phases 4 and 5)

### D5.1 The database guard

`uq_te_running` (UNIQUE on `running_guard`) becomes a plain index: several entries of one user
may run. Serialisation moves to one row per user: every timer mutation starts with
`SELECT … FROM time_presence WHERE user_id = ? FOR UPDATE` (the row is created with
`INSERT IGNORE`). Phase 4 creates `time_presence` with all its columns (D7.1); phase 6 starts
using the presence ones.

### D5.2 Settings and permission

```ts
parallel: { enabled: boolean;                       // false (C4)
            maxParallel: number;                    // 4
            sameProject: 'differentTasks' | 'never' | 'always' }   // C5
```

RBAC toggle `time_tracking_parallel` (needs `time_tracking` ≥ edit; follow "Adding a permission"
in `docs/db_integration_notes/RBAC_SYSTEM.md`). Per-user preference `startWhileRunning`:
`ask | switch | parallel` (default `ask`), stored next to the user's other time-tracking
preferences.

### D5.3 API (`public/api/time_entries.php`)

| Call | Behaviour |
|---|---|
| `POST start { …, mode }` | `mode: 'switch'` (default): stop **every** running item, start the new one: exactly today's behaviour for one timer. `mode: 'parallel'`: stop nothing. Refused with 409: `parallel_disabled`, `parallel_forbidden` (permission), `parallel_limit`, `same_project`, `already_running` (identical target: same task, else same ticket, else same project and title). |
| `POST stop { id }` / `{ all: true }` | Without `id`: the single running item, as today; with several running, 409 `ambiguous`. |
| `POST undo_start` | Removes the started entry and reopens every entry that the start stopped. |
| `GET ?running=1` | `{ running: Entry[], paused: Entry[], presence, serverNow, entry }`: `entry` is the first running item, kept for old clients (D5.6). |
| `GET action=totals` | Adds worked sums: per user and day, and per project (`workedMs` next to `seconds`). |

Every list response carries `workedMs` on each entry.

### D5.4 The container in the timer bar and the header

- **One item running:** the bar and the pill look as they do today.
- **Start while something runs** (bar, task ▶, project, list ▶ Continue): by the user's
  preference; with `ask`, a small popover "Switch to this" / "Run in parallel (2 running)".
- **Two or more items:** the bar becomes a container. One row per item: colour dot · title ·
  project · that item's elapsed time · Pause · Stop. Footer: "+ Add timer" (the normal bar
  inputs) · "Worked 0:42 · Delivered 1:58" · Pause all · Stop all.
- **Header pill** with several items: the first title and "+2", the worked clock of the current
  stretch, and the cycle ring (D8.1). Its button opens the container; it does not stop
  everything with one click.
- **Tab title:** `▶ 0:42 · ∥3 · <title>`.
- **Provider:** `useTimeTracking` holds `running: TimeEntry[]`, `paused: TimeEntry[]` and
  `presence`. A `primaryRunning` selector keeps single-timer callers small.
- Task card and drawer: "running" means *this task* is in the running set.

### D5.5 The container in the views

A **cluster** is a group of timed entries of one person connected by overlap (the columns
`layoutOverlaps` in `timeCalendar.ts` already computes). No table stores it: it is derived, so
an overlap created by a manual edit or an import is shown the same honest way.

- **Calendar:** a cluster of two or more is drawn inside one frame with a header chip
  "∥ 3 · worked 2:24" (the owner's mock-up). Items sit in lanes as today. Moving or resizing an
  item re-settles the cluster.
- **List and Day:** the cluster's rows share a bordered group with the same header. A row shows
  its project time; under it, muted, "0:40 of your time" when the two differ.
- **Entry drawer:** "Your time: 0:40 of 2:00 · in parallel with B, C 09:00–11:00" above the cost
  formula.
- **Day and week totals:** "Worked 2:00 · Delivered 6:00" when they differ, one number when equal.

### D5.6 Other clients

- **Chrome extension** (`time_tracker_ext.php`, `time_tracker_lib.php`): stays single-timer.
  Start = `switch`. With several running it shows "3 timers running, open the app" and the
  worked clock. Phase 4 makes the endpoints safe; phase 10 gives it the container.
- **MCP:** `get_running_timer` returns `timers: []` plus the old single fields; `stop_timer`
  takes `entry_id` or `all`; `start_timer` takes `mode` and gains the identical-target guard
  (A4.4); `get_time_tracking_summary` returns worked next to project hours for `group_by=user`.
- **Old cached tabs** keep reading `entry` and keep sending `start` without `mode` (= switch).

## D6. Pause

A pause **closes the entry** and leaves a marker; resuming creates a **new** entry. No entry
ever has a hole in it.

| Column (phase 6) | Type | Notes |
|---|---|---|
| `paused_at` | DATETIME NULL | Set = this item is paused and can be resumed. |
| `pause_reason` | VARCHAR(16) NULL | `manual` \| `status` \| `presence` |
| `resume_until` | DATETIME NULL | After this the pause expires (the marker is cleared). NULL = the day's `autoStopAt` (C17). |
| `continues_id` | VARCHAR(64) NULL | On the new entry: the entry it resumed. |
| `end_reason` | VARCHAR(16) NULL | How the entry ended: `user` \| `switch` \| `status` \| `presence` \| `auto_stop`. Shown in the drawer's provenance line and in reports. |

- `POST pause { id | all }`: end the entry now, settle, set the marker.
- `POST resume { id | all }`: clear the marker; insert a running entry with the same project,
  task, ticket, title, description, billable flag and tags, `continues_id` = the old entry.
- `POST stop` on a paused item clears the marker.
- A paused item is an ordinary closed entry in every sum. Three states for the UI:
  **ongoing** (`end_at` NULL), **paused** (`paused_at` set), **stopped** (neither).

## D7. The presence engine (phase 6)

### D7.1 State

```
time_presence(
  user_id VARCHAR(50) PRIMARY KEY,
  anchor_at DATETIME NULL,        -- the last answer; NULL when nothing runs
  last_push_at DATETIME NULL, auto_paused_at DATETIME NULL, updated_at)
```

Settings:

```ts
presence: { enabled: boolean;              // true
            promptAfterMinutes: number;    // 50
            confirmWindowMinutes: number;  // 10
            resumeWindowMinutes: number;   // 10
            trimTo: 'prompt' | 'deadline' } // 'prompt' (C7)
```

Derived, never stored: `promptAt = anchor_at + promptAfter`,
`deadlineAt = promptAt + confirmWindow`.

### D7.2 Timeline (defaults)

```
0 ─────────────── 50 ───────── 60 ───────── 70
   tracking        question     paused       stopped
                   sound, push  "Resume?"    (pause expired)
answer in 50–60  → the cycle restarts at 0; no time is lost
no answer at 60  → every running item ends at minute 50 (C7) and is marked paused
resume in 60–70  → new entries start at the moment of resuming (C8)
nothing by 70    → the pause markers are cleared; the entries are simply stopped
```

### D7.3 `ccrm_tt_presence_settle($pdo, $userId, $now)`

New module `public/api/time_presence_lib.php`. Under the per-user lock (D5.1):

1. Running items exist and `now ≥ deadlineAt`: end each at `promptAt` (or `deadlineAt` with
   `trimTo: 'deadline'`), never before its own start; `end_reason = 'presence'`,
   `paused_at = deadlineAt`, `pause_reason = 'presence'`,
   `resume_until = deadlineAt + resumeWindow`; settle; `anchor_at = NULL`.
2. Paused items with `resume_until < now`: clear the marker.
3. `autoStopAt`: a running item past the company-timezone auto-stop time ends at that time,
   `end_reason = 'auto_stop'` (this finally implements the old setting, A4.2).

**Lazy and exact.** It runs at the top of every time-tracking API call for the caller, and from
`cron.php` every minute for every user with a timer item. Because the end time is computed from
`anchor_at`, not observed, the result is identical whichever runs first, and it is correct on a
server whose cron is not configured (there only the server push is missing; Settings warns when
the cron has not run for five minutes).

### D7.4 Answers

- `POST confirm` (session, in `time_entries.php`): allowed while `now < deadlineAt`;
  `anchor_at = now`. After the deadline: 409 `paused` with the state; the UI offers Resume.
- There is no other way to answer: no snooze, no notification button, no token link (C9).
- Start, resume, stopping one of several, editing a running entry: `anchor_at = now` (C6).
- The first Start after an empty running set sets `anchor_at`.

### D7.5 Push

`cron.php`, each minute, for users in the question window: one push per minute (the repeat makes
the operating system play its sound again), `tag: 'tt-presence'`, `renotify`, `requireInteraction`.
After the automatic pause: one push "Paused at 09:50". After expiry: one push "Timers stopped
at 09:50".

- New sender `ccrm_send_push_to_user_id()` in `webpush.php` (the existing one targets a name or
  an e-mail).
- **The notification only alerts (C9).** It has no action buttons and carries no token. A click
  opens or focuses the app on the time-tracking page, where the person answers in the dialog
  while signed in. No session-less endpoint exists for answering.
- On every answer the server sends a silent push "cleared" so other devices close the
  notification and stop the sound.

## D8. Presence in the browser (phase 7)

### D8.1 The ring

One component `CycleRing` drawn around the Stop button of the header pill, the timer bar and the
mobile bar, all reading the provider's single clock (`nowMs`, corrected by `serverNow`).

| Phase | Ring | Button |
|---|---|---|
| Tracking (0–50) | fills clockwise, rose, `(now − anchor) ÷ 60 min` | Stop |
| Question (50–60) | the last sixth pulses amber | "Still working?" (confirm) |
| Paused | empty, dashed amber | Resume (pause icon) |

With `prefers-reduced-motion` nothing pulses; the colour change alone carries the state.

### D8.2 The question

A modal `role="alertdialog"` in every open tab: the running items, the countdown to the pause,
**Still working** (default, Enter), Pause, Stop all. Nothing else answers it (C9). Answering in one tab
closes it in all (the existing `BroadcastChannel`). Tab title: `⏰ 9:12 · Still working?`, then
`⏸ Paused · …`. After the pause the dialog becomes "Paused at 09:50 · Resume / Stop".

### D8.3 Sound

- Web Audio, synthesised (`playNotificationChime` is the base); the pattern is C18.
- The audio context is created or resumed inside the click on Start, Resume and Still working, so
  the browser allows the later sound.
- **One tab plays.** The tab holding the Web Lock `ccrm-tt-presence-sound` plays; the others stay
  silent (fallback without Web Locks: an election over the `BroadcastChannel`).
- Per-user volume and mute in Personal settings (C18).

### D8.4 The service worker (`public/sw.js`)

The presence notification has no actions (C9). A click opens or focuses the app at
`#time-tracking`, as notification clicks do today; opening the app answers nothing, the person
still has to press **Still working** in the dialog. The worker gains one thing: on the silent
"cleared" push it closes the open `tt-presence` notification and tells the open pages. The
pass-through `fetch` handler stays as it is (no caching, `docs/PWA.md`).

### D8.5 Removed

`IdleReminder.tsx`, `idleReminderMinutes` and `longEntryWarnHours` leave the UI. The server
sanitizer still accepts the old keys.

## D9. Which sum uses which measure

Rule: **anything about a person uses worked time; anything about a project, client, task or
ticket uses project time; cost always comes from worked time.** Where both are equal, the UI
shows one number, as today.

| Worked time | Project time |
|---|---|
| "Today", "This week / target", day-strip dots (`totalSeconds`, `timeTracking.ts:214`) | `totals.byProject / byTask / byTicket` seconds (`time_entries.php:328`) |
| Team matrix hours and basis bars (`timeTeam.ts:291`) | Task tracked vs estimate (`TaskTimeControls`, `taskTimeSummary.ts`) |
| Salary report buckets and utilisation (`timeReports.ts:393`) | Project hours budget (`ProjectTimeTab.tsx`) |
| `snapshotSalaryRate` weights (`timeReports.ts:365`) | Retainer and contract usage (`time_entries_lib.php:333`, `tickets.ts:820`) |
| Week approval totals (`timeApproval.ts`) | Ticket logged minutes (`sync.php:2273`) |
| Extension `todaySeconds` (`time_tracker_lib.php:597`) | Timesheet cells (`timeTimesheet.ts:108`) |
| `EmployeeCcrmTimesheet` | Reports by project and client, client PDF and CSV |
| MCP summary `group_by=user` | MCP summary `group_by=project`, billable value |
| Every `cost` | — |

The Timesheet's Totals row sums project time and gains a second row "Worked". Reports show both
and the leverage. "Billable %" stays project time ÷ project time.

## D10. Task status actions (phase 8)

### D10.1 Storage and settings

New `system_settings` key `TASK_STATE_TIMER_ACTIONS`: `{ [statusName]: 'start' | 'pause' | 'stop' }`
(a missing name = no action). It travels with `TASK_STATES` and `TASK_STATE_COLORS`
(`sync.php:1182`, `:3385`, `:3433`, `:3455`) and follows the same rename cascade and delete guard
(`SettingsView.tsx:912`, `:957`, `:5961`).

Settings → Projects → Task states (`projects/taskstates`): each status row gets a dropdown
"Timer: — / Start / Pause / Stop". Nothing is mapped on an existing installation; a hint offers
one click for the usual mapping (the status named like "In progress" → Start, the last status →
Stop). The dropdown is a new component file; `SettingsView.tsx` must not grow.

### D10.2 What fires, for whom

Pure function `timerActionForStatusChange(oldStatus, newStatus, map)` in
`src/utils/taskStatusTimer.ts` (and its PHP twin): an action only when the status really changes.

**In the browser,** one place: `updateTasksAndSync` (`App.tsx:1971`) compares the tasks before
and after and hands the changed ones to the module. For the **current user**:

| Action | Rule |
|---|---|
| start | Only when exactly one task changed in that update (never on a bulk edit), the user is an assignee or the task has none, the task is not a recurring template, and the user may track time. Uses the task ▶ start path: same project rules, same "Which project?" popover, the user's `startWhileRunning` preference, an Undo toast. |
| pause | Pauses the user's running item on that task, if there is one. |
| stop | Stops the user's running or paused item on that task. "Require a project" applies as for a manual Stop. |

Pause and stop also apply on a bulk edit: they only ever end the user's own items. Each sets
`end_reason = 'status'`.

**Nobody else's timer is touched (C14).** If Marek sets a task to Done while Jana's timer runs
on it, Jana's timer keeps running. No notification is sent.

**On the server,** only for the MCP tools, where no browser runs the rule above:
`ccrm_tt_task_status_changed($pdo, $taskId, $newStatus, $actorUserId)` in
`public/api/time_status_lib.php`, called from MCP `update_task` and `complete_task` with the
user the MCP key belongs to. It applies **pause and stop only**, to **that user's** item on the
task, idempotent, never blocked by "require a project". The server **never starts** a timer: a
start needs a person at a screen. `sync.php` gets no call (the browser already acted for the
person who made the change), and the WAAI writers get none (they have no acting person).

## D11. Edge cases every phase keeps in mind

- Midnight and month crossings: an entry belongs to its `entry_date` for rate and for daily sums.
- DST: all arithmetic is in UTC milliseconds.
- A stop arrives after the automatic pause already ended the entry: the stop is a no-op, the
  response carries the real end time.
- Two devices answer at once: the per-user lock makes one win; the other reads the new state.
- A device with a wrong clock: countdowns use `serverNow`, never the local time alone.
- A user without an employee: worked time is still computed; cost stays "no rate".
- A deleted project, task or ticket under a running or paused item: the item keeps running; the
  title greys out as today.
- Soft delete and restore of one entry of a cluster re-settles the cluster.
- The legacy rule "an entry is at most 24 h" stays, per entry.

## D12. What this file replaces in `TIME-TRACKING.md`

| There | Now |
|---|---|
| C4.1 `running_guard` UNIQUE, "one running timer per user" | D5.1 |
| C6.6 "vacation and sick days do not reduce working days" | D4 (C2, C11) |
| C7.1 the monthly rows of the cost table | D4.1 |
| C7.5 "never recomputed silently" | D4.3 (C12) |
| C8.1 one timer, auto-stop, long-entry warning, idle reminder | D5, D7, D8.5 |
| C13 `autoStopAt` (kept), `longEntryWarnHours`, `idleReminderMinutes` (removed) | D7.1, D8.5 |

Everything else there stands, including decisions B1–B17.

---

# Part E. Phases

Each phase: build the checklist, run the tests, update A3. File names are the expected homes;
keep to the size-cap rule when a named file is capped.

### Phase 1. Foundation, server

Spec: D2, D3. Decisions: C1, C15, C16.

**Work packages:** (a) the engine in TypeScript and PHP with the fixtures and both test
runners ∥ (b) schema, migration and the `entities_overview.md` section. Then **(c)**
`time_settle.php` and every write site, **one agent, your own model** (the sites are coupled;
do not split them) ∥ (d) the guard test and the probe cases, written against D3.3. Last: (e)
the API fields and the Settings count.

- [x] `src/utils/timeAllocation.ts` + tests; `public/api/time_allocation.php`;
      `scripts/fixtures/time-allocation-cases.json` (the four examples of D2, the invariants,
      a running entry, a 5-entry random case checked against I1); `scripts/test-time-allocation.php`
      wired like `test:time-cost`
- [x] Schema: `worked_ms`, `cost` widened; migration backfill (C16); `entities_overview.md`
      gets a `time_entries` section
- [x] `public/api/time_settle.php` with `ccrm_tt_settle()`; `time_cost.php` / `timeCost.ts`
      cost from `worked_ms`, four decimals; fixtures extended
- [x] Every write site calls `ccrm_tt_settle()` and stops computing cost itself (list in D3.3);
      a grep-based guard test fails when a new site writes `cost` or `worked_ms` directly
- [x] Lock rule for overlapping a locked neighbour (D3.3)
- [x] API: `workedMs` on entries; `totals` returns worked sums (D5.3, last row)
- [x] Settings: a read-only count "N existing entries overlap" per month; "Re-price a period"
      also re-allocates
- [x] Server probe (`scripts/probe-time-tracking/run.mjs`): two overlapping manual entries cost
      the same as one; delete one and the other returns to full cost; sums reconcile to the cent
- [x] `npm run sync:backend`

**Left over:** none. Notes from the build:
- Built on branch `css-main` (the owner moved TT2 off `1.13-nectarine` on 2026-11-19).
- Settle never rewrites a **locked** row (approved week, paid month, older than `lockAfterDays`):
  it stays an engine input but keeps its stored values; only the admin "Re-price a period"
  (`force`) rewrites it. Exempt: rows the caller itself wrote, and rows never settled
  (`worked_ms` NULL, e.g. imported). The refusal (`entry_locked`, 403) covers REST create,
  update, delete, restore and MCP log/update over the old **and** the new interval; activity
  assignment, the extension, back-dated starts and imports rely on the settle rule instead.
- Settle reads timed rows by `entry_date` (window − 2 days … + 1 day, index `idx_te_user_date`):
  an entry whose typed `entry_date` is far from its real start is invisible to its neighbours'
  settle (it is still settled itself).
- `time_settle.php` / `time_allocation.php` are required by `ticket_time_migration.php` but not
  in `ccrm_schema_fingerprint()` (schema.php is capped; their edits never need a migration re-run).
- New API: `workedMs` on every entry; `totals.byProject[id].workedMs`, `totals.workedByUserDay`;
  `GET action=overlaps&from=YYYY-MM&to=YYYY-MM`.

### Phase 2. Foundation, client

Spec: D9, D5.5 (totals only). Needs 1.

**Work packages:** **first** (a) the type and the helpers in `timeTracking.ts` with their
tests. Then (b) List, Day, the drawer line and the approval totals ∥ (c) Team, Reports and the
salary report utilities ∥ (d) Timesheet, the QA mock and the e2e case.

- [x] `TimeEntry.workedMs`; helpers `entryWorkedSeconds`, `totalWorkedSeconds`, `leverage` in
      `timeTracking.ts` (a running entry's live share comes from `timeAllocation.ts`)
- [x] Every row of the left column of D9 switched to worked time; unit tests per helper
- [x] Day and week totals show "Worked · Delivered" when they differ; one number when equal
- [x] Entry drawer: the "Your time" line (D5.5)
- [x] Timesheet: the second totals row "Worked"
- [x] QA mock (`tests/e2e/helpers/timeTrackingMock.ts`) returns `workedMs`; e2e: two overlapping
      seeded entries show 1:00 worked and 2:00 delivered in the day total

**Left over:** none. Notes from the build:
- Week approval (`timeApproval.ts`, `SubmitWeekButton`) shows counts and status only, no time
  totals, so it had nothing to switch.
- The drawer's "in parallel with" line fetches the entry's day for its user (one extra list
  request per drawer open).
- One component renders "Worked · Delivered": `WorkedTotal` in `WorkedLine.tsx`.
- The e2e (`tests/e2e/timeTrackingWorked.spec.ts`) asserts 3:15 worked / 4:15 delivered: the
  seed already holds 2:15 of Erik's time today, on top of the 1:00 / 2:00 overlap.

### Phase 3. Leave-aware monthly rate and the rate card

Spec: D4. Decisions: C2, C10, C11, C12. Needs 1.

**Work packages:** (a) `leaveDaysInMonth` and the formula in both languages with fixtures,
**your own model** ∥ (b) `employees.hours_per_day` through all four places and the employee
form. Then (c) the rate card table, `ccrm_tt_rate_for()`, the cron pass, the freeze rule and
re-pricing. Last: (d) the drawer and tooltip text, the Settings text, the probe case.

- [x] `leaveDaysInMonth` in TypeScript and PHP + fixtures (a leave crossing a month end, a half
      day, a leave over a public holiday, pending and rejected rows ignored)
- [x] The formula of D4.1 in `timeCost.ts` / `time_cost.php`; the four Erik fixtures; the
      existing fixtures still pass (no leave = today's numbers)
- [x] `employees.hours_per_day` (C10): **all four places** of the database rule, the employee
      form, the sync mapping
- [x] Table `time_rate_months`; `ccrm_tt_rate_for()`; pricing reads it; the daily cron pass;
      the freeze rule; audit-log lines
- [x] "Re-price a period" recomputes frozen months
- [x] Entry drawer and Team tooltip explain the rate from the rate card, with "provisional"
- [x] Settings → Time tracking: the text under "hours basis" explains leave; no new switch
- [x] Server probe: book leave after tracking → the month's entries are re-priced once; a closed
      payroll month is not

**Left over:** none. Notes from the build:
- Leave days are summed exactly and rounded once to 0.1 (half up), so a rate can be recomputed
  from the DECIMAL(4,1) values the rate card stores.
- A leave type counts as paid only with `isPaid === true` in `EMPLOYEE_SETTINGS.vacationTypes`;
  a type without the flag (e.g. `doctor`, shipped with `isPaid: null`) counts as unpaid.
  Unknown type ids fall back to the shipped defaults (annual, worked_days paid).
- Daily pay divides by the person's own hours per day (C10 read for daily pay too).
- The automatic re-pricing settles with `ownIds`, never `force` (force would rewrite locked
  neighbours); only the admin "Re-price a period" forces and recomputes frozen months.
- Daily and hourly persons get no rate-card row (their rate does not depend on the month).
- Read API: `GET action=rateCard&employeeId=&month=` (own, or `time_tracking_costs`); never writes.
- The probe uses the previous and the current month (always open: a month freezes at month+2),
  so it no longer depends on the date. The SK/HU calendar difference is proven offline in
  `test-time-cost.php` (Oct 2026: 22 vs 21).

### Phase 4. Parallel timers, server and API

Spec: D5.1–D5.3, D5.6. Decisions: C3, C4, C5. Needs 1.

**Work packages:** **first** (a) the probe tests for today's behaviour. Then **(b)** the
schema, the per-user lock and the REST actions in `time_entries.php`, **one agent, your own
model**. Then (c) the extension endpoints ∥ (d) the MCP tools ∥ (e) settings, the RBAC key
with its labels and the per-user preference.

- [x] **First** the missing tests for today's behaviour (A4.8): single start/stop/undo over REST,
      the extension endpoints and the MCP tools, in the server probe
- [x] Schema: `uq_te_running` → plain index; table `time_presence` (all columns of D7.1)
- [x] The per-user lock in every timer mutation
- [x] `start` with `mode`, the refusals of D5.3, `stop { id | all }`, `undo_start` for several
- [x] `GET ?running=1` in the new shape with the legacy `entry`
- [x] Settings `parallel`, RBAC `time_tracking_parallel` (en/sk/hu labels), the per-user
      preference
- [x] Extension endpoints and MCP tools made parallel-safe (D5.6); MCP `start_timer` gets the
      identical-target guard
- [x] Probe: two parallel starts; the cap; the same-project rule; a race of two starts; `switch`
      with three running stops three

**Left over:** none. Notes from the build:
- C4's permission is the **owner's**: a parallel start / restore / hand-over for X needs X's role
  to allow it (an admin owner bypasses), also when a manager acts for X.
- Lock: `INSERT IGNORE` into `time_presence` before the transaction, `SELECT … FOR UPDATE` on that
  row as the transaction's **first** statement; running rows are then read without `FOR UPDATE`
  (a gap lock on the non-unique `idx_te_running` could deadlock two users).
- A switch-start of a target that already runs among others stops the others and answers 200 with
  `alreadyRunning: true`; with only that one running it is still 409 `already_running`.
- `undo_start` reopens only entries the undone start actually stopped (their `end_at` = its
  `start_at`), only when the start still exists, and only if they fit (else 409 `conflict`).
- A `same_project` check skips the identical target (that answers `already_running`); a target
  without a project is not checked by the same-project rule.
- Per-user preference store: `system_settings` key `TIME_TRACKING_PREFS:<userId>`.
- Extension popup strings for "N timers running" are English only (the extension has no i18n);
  phase 10 can add it.

### Phase 5. Parallel timers, UI

Spec: D5.4, D5.5. Needs 2, 4.

**Work packages:** **first** (a) the provider (`running[]`, `paused[]`, `primaryRunning`), the
API client and the QA mock. Then (b) timer bar container, header pill, tab title, mobile bar ∥
(c) Calendar frame and the List and Day groups ∥ (d) task, ticket and project start buttons,
the two settings blocks. Last: the e2e cases.

- [ ] Provider: `running[]`, `paused[]`, `primaryRunning`; start with the preference and the
      "Switch / Run in parallel" popover
- [ ] Timer bar container; header pill for several items; tab title; mobile bar
- [ ] Calendar cluster frame; List and Day cluster groups
- [ ] Task card, task drawer, ticket and project start buttons read the running set
- [ ] Settings → Time tracking: the Parallel block; Personal settings: the preference
- [ ] e2e: start two in parallel, the day total shows worked and delivered, stop one, the
      calendar draws the frame; with parallel off a second start switches as before

**Left over:**

### Phase 6. Pause and the presence engine, server

Spec: D6, D7. Decisions: C6, C7, C8, C9, C17. Needs 4.

**Work packages:** **first** (a) the schema and `pause` / `resume` in the API. Then **(b)**
`time_presence_lib.php` with settle, confirm and the anchor rules, **your own model** ∥ (c) the
push sender and the three pushes in `webpush.php`. Then (d) the `cron.php` pass and
`autoStopAt` ∥ (e) the settings and the probe with the controllable clock.

- [ ] Schema: the five columns of D6
- [ ] `pause`, `resume`, `stop` on a paused item; the three states in the API
- [ ] `time_presence_lib.php`: settle (D7.3), confirm, the anchor rules (D7.4)
- [ ] `cron.php`: the per-minute pass, `autoStopAt` enforced (A4.2), the cron-age warning value
- [ ] `webpush.php`: `ccrm_send_push_to_user_id()`, the three pushes (no action buttons, no
      token, C9), the silent "cleared"
- [ ] Settings `presence` (server sanitizer + defaults)
- [ ] Probe with a controllable clock: answer at minute 55 → nothing lost; no answer → entries
      end at minute 50 and are paused; resume at 65 → a new entry from 65; nothing by 70 →
      stopped; lazy settle and cron give the same rows; a confirm without a session is refused

**Left over:**

### Phase 7. Presence UI

Spec: D8. Decisions: C9, C18. Needs 5, 6.

**Work packages:** **first** (a) `presence` in the provider and the phase selector. Then (b)
`CycleRing` on the three buttons, the dialog and the tab title ∥ (c) the sound, the one-tab
lock and the Personal settings controls ∥ (d) `sw.js`, the Settings block, removing the idle
reminder. Last: the e2e cases.

- [ ] `CycleRing` on the three Stop buttons; the pause and resume states
- [ ] The question dialog, cross-tab close, tab title
- [ ] Sound: pattern, audio unlock, the one-tab lock, volume and mute in Personal settings;
      **the owner picks the sound** from two or three candidates before the phase closes
- [ ] `sw.js`: close the notification on "cleared"; the click only opens the app (D8.4)
- [ ] Settings → Time tracking: the Presence block and the cron warning
- [ ] `IdleReminder` and the two dead settings removed from the UI
- [ ] e2e (mocked clock): ring fills, dialog appears at 50, confirm restarts, no answer shows the
      paused state, resume starts a new entry; two tabs → one dialog action closes both

**Left over:**

### Phase 8. Task status actions

Spec: D10. Decision: C14. Needs 5, 6.

**Work packages:** (a) the settings key, its sync mapping, the rename cascade and the dropdown
component ∥ (b) the pure function in both languages with fixtures, the hook in
`updateTasksAndSync` and the toast ∥ (c) `time_status_lib.php`, the two MCP calls and the
probe case. Last: the e2e cases.

- [ ] `TASK_STATE_TIMER_ACTIONS`: defaults, sync mapping, rename cascade, delete
- [ ] The dropdown in Task states (new component) and the one-click suggestion
- [ ] `taskStatusTimer.ts` + PHP twin + shared fixtures
- [ ] The hook in `updateTasksAndSync`; start, pause, stop for the current user; Undo toast
- [ ] `time_status_lib.php`; calls from MCP `update_task` / `complete_task` only (no `sync.php`
      call, no WAAI call, no push)
- [ ] e2e: status → Start starts the timer on the task; → Pause pauses; → Stop stops; a bulk
      change starts nothing; renaming a status keeps its action; another person's running
      timer on the task is untouched
- [ ] Probe: MCP `complete_task` stops the caller's own timer on that task and leaves another
      user's timer on it running

**Left over:**

### Phase 9. Reports, project finances, exports, demo, MCP summary

Spec: D9, C13. Needs 2, 3.

**Work packages:** (a) Reports, CSV, the salary report and the Team matrix rate ∥ (b) project
Finances, `totals.billableValue` and the MCP summary ∥ (c) demo data and its assert script.
Last: the notes in `TIME-TRACKING.md`.

- [ ] Reports: worked and delivered columns, leverage, filter "parallel only"; CSV carries both;
      the client PDF stays project time only
- [ ] Salary report: buckets by worked time; the Team matrix prices with the rate card (A4.5)
- [ ] Project Finances: "Billable work (time tracking)" (C13); "Labour" already follows worked
      cost through phase 1: verify, and state it in the tooltip
- [ ] `totals` adds `billableValue` per project; MCP `get_time_tracking_summary` adds worked
- [ ] Demo data: one person with a parallel morning; `scripts/demo-assert/time.php` updated (it
      assumes no overlaps today)
- [ ] `docs/TIME-TRACKING.md`: a note at each replaced section pointing here

**Left over:**

### Phase 10. Chrome extension and mobile

Needs 7.

**Work packages:** (a) the extension (popup, badge, `chrome.idle`, the zip) ∥ (b) the mobile
container and the ring on the bottom bar.

- [ ] Extension popup: the running set, per-item stop, the question with **Still working**
      inside the popup (no notification buttons, C9), the badge in the question and paused states
- [ ] `chrome.idle`: when the system is locked or idle past the question, do not wait for the
      deadline to show "paused" locally (the server stays the judge)
- [ ] Mobile: the container as a bottom sheet, 44 px targets, the ring on the bottom bar
- [ ] Extension zip rebuilt (`npm run build:extension`)

**Left over:**

---

# Part F. Not in this plan

Named so that nobody builds them by accident, and so the owner can order them later.

- **Invoicing from time:** invoice lines generated from billable entries, an "invoiced" mark on
  entries, feeding `invoicable` for time-and-materials projects.
- **Payroll true-up:** re-pricing a closed month from the payslip's real labour cost
  (`employee_salaries.labor_cost`) instead of salary × multiplier.
- **Partial sick pay:** an "employer pays %" on a leave type.
- **Parallel hours-only entries:** a "counted as" field on Day and Timesheet rows.
- **Offline answers:** accepting a "still working" recorded while the device had no connection.
- **Timer → status:** starting a timer moves the task to a chosen status.
- **A workflow-engine action** "start / stop timer" in Automation.
- **Per-client opt-out** from parallel billing.
