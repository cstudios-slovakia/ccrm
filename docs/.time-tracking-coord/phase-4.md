# Phase 4 — Team, Reports, salary allocation, exports

Owner: phase 4 agent. Status: built (QA, version bump, build and commit skipped by the owner).

Phase 3 already mounts `extraTimeTrackingTabs`, `ViewingAsProvider`, `ViewingAsSelect`,
and the `ccrm-time-tab` listener in `TimeTrackingView.tsx`. Phase 4 did not edit that file.

Team and Reports are computed on the client from the time-entries list
(`useTimeEntries` / `GET time_entries.php`). Each entry already carries its
frozen `cost`, so a week that crosses a month is the sum of those costs.
No `action=team` / `action=report` PHP was added: C4.4's payload is the list.
Cost of other people is dropped again in `visibleEntryCost` (B8), not only in CSS.

## Contract

`extraTimeTrackingTabs` items:

```ts
{
  id: 'team' | 'reports';
  /** Call with the module's `t`. */
  label: (t: (en: string, sk: string, hu: string) => string) => string;
  render: (props: { deps: TimeDeps; onNavigate: (route: string) => void }) => ReactNode;
}
```

`ViewingAsContext` value (when `ViewingAsProvider` is mounted):

```ts
{ mode: 'me' | 'team' | 'user'; userId: string | null; setMode; setUserId }
```

`useViewingAs()` reads that. List and Day call `useViewingAsOptional()` and, when no
provider is mounted, still honour the `scope` prop (`me` / `all` / user id) so the
existing select in `TimeTrackingView` keeps working. Whole team (`mode === 'team'`
or `scope === 'all'`) shows the person column and day-group avatars.

`requestOpenList(userId, from, to)` filters List to that person and range and
dispatches `window` event `ccrm-time-tab` with `detail: "list"`.

## File claim (exclusive)

Do not edit these. Do not replace `extraTabs.tsx` with an empty array.

- `src/components/timeTracking/extraTabs.tsx` — CONTENT owned here
- `src/components/timeTracking/ViewingAsContext.tsx` — NEW
- `src/components/timeTracking/ViewingAsSelect.tsx` — NEW
- `src/components/timeTracking/TimeTeamView.tsx` — NEW
- `src/components/timeTracking/TimeReportsView.tsx` — NEW
- `src/components/timeTracking/TimeSalaryReport.tsx` — NEW
- `src/components/timeTracking/MoneyText.tsx` — NEW
- `src/components/timeTracking/RoleBadge.tsx` — NEW
- `src/utils/timeTeam.ts` — NEW
- `src/utils/timeTeam.test.ts` — NEW
- `src/utils/timeReports.ts` — NEW
- `src/utils/timeReports.test.ts` — NEW
- `src/components/timeTracking/TimeListView.tsx` — ONLY inside `/* PHASE4-VIEWING-AS */` … `/* END-PHASE4-VIEWING-AS */`
- `src/components/timeTracking/TimeDayView.tsx` — ONLY inside those markers
- `docs/.time-tracking-coord/phase-4.md`
- `docs/.time-tracking-coord/requests/phase-4-to-phase-3.md`

## Additive (do not revert the two new fields)

- `src/components/timeTracking/shared.tsx` — optional `TimeDeps.vacations`, `TimeDeps.canSalaryReport`
- `src/App.tsx` — those two fields on the `timeDeps` object only

## Not touched

`TimeTrackingView` calendar/timesheet body, extension files, `timeLock.ts`,
`timeApproval.ts`, `ModuleSetupWizard`, `EmployeeTimesheetSummary`,
`docs/TIME-TRACKING.md`, `scripts/fixtures/time-cost-cases.json`,
`/* PHASE6-LOCK */` regions. `public/api/time_entries.php` was not edited.
`npm run sync:backend` was not run.

## Asked of phase 3

`TimeTrackingView.tsx` already imports `extraTimeTrackingTabs`, wraps the screen in
`ViewingAsProvider`, renders `ViewingAsSelect`, and listens for `ccrm-time-tab`.
Do not revert that. See `requests/phase-4-to-phase-3.md`.

## Left over

- QA (`npm run test:qa`, Playwright, `tests/e2e`) skipped by the owner.
- Version bump, changelog, `npm run build`, `dist/` and git commit skipped by the owner.
- No `action=team` / `action=report` in `time_entries.php`. The list payload is enough.
- `npm run sync:backend` was not run.
