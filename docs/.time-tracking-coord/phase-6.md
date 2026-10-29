# Phase 6 — Locking, approval, Toggl import, mobile, idle reminder

Owner: phase 6 agent. Status: built. QA, version bump, changelog, build and commit skipped by the owner (2026-10-27).

No `docs/.time-tracking-coord/requests/phase-3-to-phase-6.md` was present. Exports below were not renamed.

## Published exports

`src/utils/timeLock.ts`

```ts
isEntryLocked(entry, settings, nowIso): boolean
lockReason(entry, settings, nowIso): "age" | "paid_payroll" | "approved" | null
```

- `entry`: `{ entryDate: string; approvalStatus?: string | null; running?: boolean }`
- `settings`: `{ lockAfterDays: number | null; paidPayrollMonths?: readonly string[]; isAdmin?: boolean }`
- `nowIso`: `YYYY-MM-DD` (a time suffix is ignored)
- Age lock: `lockAfterDays !== null` and calendar age in days **>** `lockAfterDays`. Running entries skip the age rule.
- Paid payroll: `entryDate`'s `YYYY-MM` is in `paidPayrollMonths` (exact month, or a key that starts with `YYYY-MM-` / `YYYY-MMW`).
- Approved: `approvalStatus` is `approved` (any case).
- `isAdmin: true` makes `isEntryLocked` false. `lockReason` still returns the reason.

`src/utils/timeApproval.ts`

```ts
submitWeek(weekStart: string): Promise<void>
weekApprovalState(input: WeekApprovalInput): WeekApprovalState
approvalWeekStart(iso: string): string
```

`submitWeek` POSTs `{ action: "submit_week", weekStart }` to `/api/time_entries.php`.
`weekApprovalState` is pure (no network). Week is Monday–Sunday.
Status: `off` | `empty` | `open` | `approved`. `canSubmit` is true only when the setting is on and the week has at least one unapproved stopped entry.

`src/utils/togglImport.ts`

```ts
togglImportKey(togglId: string | number): { source: "toggl"; externalId: string }
countAlreadyImported(incoming, existingExternalIds): number
```

`src/utils/timesheetSource.ts`

```ts
timesheetSourceSwitch(selected: "toggl" | "ccrm"): { selected, available }
TIMESHEET_SOURCES // always ["toggl", "ccrm"]
```

## Files

- `src/utils/timeLock.ts`, `timeLock.test.ts`
- `src/utils/timeApproval.ts`, `timeApproval.test.ts`
- `src/utils/togglImport.ts`, `togglImport.test.ts`
- `src/utils/timesheetSource.ts`, `timesheetSource.test.ts`
- `src/utils/timeTracking.ts` — optional `TimeEntry.paidPayrollMonth`
- `src/utils/timeTrackingApi.ts` — error sentences: `entry_locked`, `approval_off`, `toggl_not_configured`, `unsupported_provider`
- `src/components/timeTracking/TimeTrackingMobileBar.tsx` — NEW
- `src/components/timeTracking/IdleReminder.tsx` — NEW, mounted from `HeaderTimerPill` (every screen, not only the module)
- `src/components/timeTracking/TogglImportPanel.tsx` — NEW
- `src/components/timeTracking/SubmitWeekButton.tsx` — NEW. Phase 3 mounts this on the Timesheet.
- `src/components/employees/EmployeeCcrmTimesheet.tsx` — NEW
- `src/components/timeTracking/TimeTrackingSettingsPanel.tsx` — only inside `/* PHASE6-SETTINGS */` … `/* END-PHASE6-SETTINGS */`
- `src/components/timeTracking/TimeTrackingView.tsx` — import line 12 and mount line 118 only. See `requests/phase-6-to-phase-3.md`.
- `src/components/timeTracking/TimeDayView.tsx` — phone strip scroll, stacked quick row, `ccrm-time-add-row` listener
- `src/components/timeTracking/EntryRow.tsx` — play control is `min-h-11 min-w-11` on the phone
- `src/components/timeTracking/EntryDrawer.tsx` — locked entries read-only for non-admins; admins still edit, banner says the audit log records it
- `src/components/timeTracking/HeaderTimerPill.tsx` — renders `IdleReminder`
- `src/components/employees/EmployeeTimesheetSummary.tsx` — source switch. Toggl summary kept.
- `public/api/time_entries.php` — lock, `submit_week`, `import` only inside `/* PHASE6-LOCK-START */` … `/* PHASE6-LOCK-END */`
- `public/api/time_tracking_lib.php` — new functions beside `toggl_curl`. The existing client and month summary were not rewritten.

## Schema

No new SQL. C4.1 already has `time_entries.approval_status`. A paid payroll month is `employee_salaries.status = 'paid'` for that employee (`period_key` `YYYY-MM`). No `/* PHASE6-SCHEMA */` block. `/* PHASE5-SCHEMA */` was not edited.

## Tests

`node --test` on the four new test files: 14 pass, 0 fail.

PHP lint (Docker php 8.2): `time_entries.php`, `time_tracking_lib.php` — no syntax errors.

Not run, by the owner's instruction: `npm run test:qa`, Playwright, `npx tsc`, `npm run test:unit` (full suite), `npm run build`.

## Leftovers

- QA, version bump, changelog, `dist/`, git commit, and `npm run sync:backend` were skipped. The repo-root `api/time_tracking_lib.php` copy is therefore stale until someone syncs `public/`.
- `docs/TIME-TRACKING.md` was not edited, so its phase 6 boxes are still open.
- Phase 3 still has to mount `SubmitWeekButton` on the Timesheet (the button and `submitWeek` are ready).
- Stopping a running timer is not refused by the lock, so a timer can always be stopped. Create, update, delete and restore are refused for a non-admin when the row is locked; an admin edit writes `time_entry.lock_override`.
- Clockify import is refused with `unsupported_provider`.
- The idle reminder uses `settings.idleReminderMinutes`, does not run when that is null or when no timer is running, and does not ask for notification permission. If permission is already granted it also calls `sendBrowserNotification`. The in-app banner can be dismissed.
