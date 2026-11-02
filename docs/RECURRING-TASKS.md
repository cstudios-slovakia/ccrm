# Recurring Tasks Module in CCRM

Recurring tasks automate predictable or periodic work (on a schedule or after completion) without creating clutter or duplicate tasks.

---

## 1. Core Principles & Data Model

- **Not a separate entity:** Templates and occurrences live in the `tasks` table.
- **Series Template:** A row in `tasks` with `task_kind = 'recurring'` and recurrence schedule stored in `recurrence_json`. A template holds shared task attributes (title, description, priority, owner, assignees, tags, related lead/project, locking, conclusion, reminders, estimate) and the generation cursor (`lastOccurrence`, `lastOccurrenceId`). Templates are never done, never on the calendar as a real task, and never in regular task lists.
- **Occurrence:** An ordinary task created from the template. It carries `recurring_source_id` (the template ID) and `recurring_occurrence_date` (the scheduled date for which it was created).
- **At most one open occurrence per series:** The generator creates the next occurrence only when the previous one is closed (marked done or archived).
- **No silent skipping:** In schedule mode, if work is late, each period is worked through one by one until the series is caught up.

---

## 2. Recurrence Rules & Options

### Two Repeat Modes

1. **On a schedule** (`mode: "schedule"`): Due on fixed calendar dates ("every month on the 15th", "every 2 weeks on Monday").
2. **After completion** (`mode: "after_completion"`): Clock restarts when the previous task was closed ("3 months after it was last done").

### Schedule Options (`recurrence_json`)

| Field | Values | Description |
|---|---|---|
| `mode` | `schedule` · `after_completion` | Recurrence mode |
| `frequency` | `daily` · `weekly` · `monthly` · `yearly` | Frequency unit |
| `interval` | integer ≥ 1 | Every N days/weeks/months/years |
| `config` | Object | Weekday for weekly; day of month or nth weekday for monthly; month + day for yearly |
| `weekendRule` | `keep` · `before` · `after` | Weekend shift for `deadline`. Occurrence date stays unshifted. |
| `leadDays` | integer 0–365 | Create occurrence N days before due. Default: daily 0, weekly 1, monthly 3, yearly 14 |
| `startsOn` | `YYYY-MM-DD` | Earliest scheduled due date (defaults to today) |
| `endsOn` | `YYYY-MM-DD` \| `null` | Optional upper bound. Nothing scheduled after it. |
| `paused` | boolean | When paused, generator produces nothing. On resume, cursor moves to first date on/after resume day. |
| `lastOccurrence` | `YYYY-MM-DD` \| `null` | Cursor owned exclusively by server generator. |
| `lastOccurrenceId` | string \| `null` | Task ID of newest generated occurrence. |

### Worked Examples (Parity Fixture in `scripts/fixtures/recurring-tasks-cases.json`)

Monthly on the 15th, `leadDays: 3`, schedule mode:

| Situation | Result |
|---|---|
| Series created 1 Nov | Due 15 Nov, created 12 Nov |
| Created 14 Nov | Due 15 Nov, created immediately |
| Created 16 Nov (`startsOn` = today) | Due 15 Dec, created 12 Dec |
| Created 16 Nov with `startsOn` 1 Nov | Due 15 Nov, created immediately (already overdue; warning shown) |
| 15 Nov task closed 10 Nov | Due 15 Dec, created 12 Dec |
| 15 Nov task closed 15 Nov | Due 15 Dec, created 12 Dec |
| 15 Nov task closed 13 Dec | Due 15 Dec, created immediately |
| 15 Nov task closed 20 Dec | Dec task created immediately (overdue since 15 Dec); once closed, Jan task appears 12 Jan |
| 15 Nov task closed 20 Feb | Dec (overdue) → close → Jan (overdue) → close → Feb (overdue) → close → Mar appears 12 Mar |
| 15 Nov task still open on 20 Dec | Nothing; series waits until task is closed |
| 15 Nov task deleted "only this task" on 13 Nov | Due 15 Dec, created 12 Dec; 15 Nov is not recreated |
| Paused 10 Nov, resumed 11 Nov | Nothing lost: 15 Nov task created 12 Nov |
| Paused 10 Nov, resumed 20 Jan | Dec and Jan skipped (by choice); next due 15 Feb, created 12 Feb |
| 15 Nov task reopened after Dec one exists | Two open tasks; generator waits until both are closed |
| Every 2 months on the 15th, `startsOn` 1 Nov | 15 Nov, 15 Jan, 15 Mar |
| Monthly on the 31st | 30 Nov, 31 Dec, 31 Jan, 28 Feb (29 Feb in leap year) |
| Monthly on 15th, `weekendRule: "after"`; 15 May 2027 a Saturday | 15 May → deadline 17 May; occurrence date stays 15 May |
| Daily, `weekendRule: "before"` | Mon–Fri only, no Saturday/Sunday tasks |
| After completion, every 3 months, `leadDays: 14`; closed 1 Nov | Due 1 Feb, created 18 Jan |
| After completion; previous deleted 5 Nov without completion | Due 5 Feb |

---

## 3. Server Generation (`public/api/recurring_tasks.php`)

- Occurrences are generated **only on the server**, never in the browser.
- Generator entry points:
  - `ccrm_maybe_process_recurring_tasks($pdo)`: called throttled (once per minute) by `cron.php` and by `register_shutdown_function` in `sync.php`.
  - `ccrm_process_recurring_tasks($pdo, $onlyTemplateId)`: called unthrottled immediately after a sync commit if a template was created/updated or an occurrence closed/deleted.
- **Idempotency:** A `UNIQUE (recurring_source_id, recurring_occurrence_date)` index and atomic cursor advance protect against concurrent runs.

---

## 4. Deleting & Scopes

When a user deletes a task that belongs to a series (`task.recurringSourceId` is present):
1. **Only this task:** Deletes this task occurrence. The series cursor remains advanced, so the series continues with the next scheduled date (explicit period skip).
2. **This and all future tasks:** Deletes this task and deletes the series template. Tasks already completed remain in history with `recurring_source_id` cleared to `NULL`.

Deleting a series from the **Recurring** tab behaves like "This and all future tasks" and confirms naming the open task it will remove.
Both choices support standard CCRM undo toasts (`deleteRecurringOccurrenceWithUndo` / `deleteRecurringSeriesWithUndo`).

---

## 5. Leak-Proofing Layers

Recurring templates live in the `tasks` table and must never leak to regular task consumers:

1. **Wire Collection Split:** `GET /sync.php` delivers real tasks (`task_kind IS NULL`) under `tasks` and templates (`task_kind = 'recurring'`) under `recurringTasks`.
2. **TypeScript Type Safety:** Client uses `RecurringTaskTemplate` for templates and `Task` for real tasks.
3. **Deletion Scoping in sync.php:**
   - `tasks` omitted-record pruning (`ccrm_delete_omitted`) strictly filters `WHERE task_kind IS NULL`.
   - `recurringTasks` omitted-record pruning strictly filters `WHERE task_kind = 'recurring'`.
4. **Write Guards:** `tasks` writes cannot touch or modify `task_kind`, and other endpoints (`task.php`, `mcp_ext_writes.php`, `integration_tasks.php`, time tracking) refuse template IDs.
5. **Backend Helper:** `ccrm_sql_real_tasks(?string $alias = '')` returns `(\`alias\`.\`task_kind\` IS NULL)` (or backtick-less if no alias).
6. **Guard Test (`src/utils/recurringTaskGuard.test.ts`):** Scans all `public/**/*.php` files for SQL queries touching `tasks`. Fails the build if any query omits `ccrm_sql_real_tasks()` without an explicit comment annotation:
   ```php
   /* recurring-template: <reason why this query handles templates> */
   ```

---

## 6. Calendar Ghost Pills

In Month and Week views of My Tasks calendar:
- Future occurrences of schedule-mode series that do not exist in the database yet are rendered as **ghost pills** (faded, dashed, with Repeat icon, labeled "Planned").
- Computed client-side by pure engine `src/utils/recurringTasks.ts` for the visible range only.
- Never enter task counts, badges, filters, search, or drag-and-drop.
- Toggleable via "Show planned recurring tasks" switch next to calendar scope buttons (persisted via `ccrm_task_show_planned_recurring` cookie).

