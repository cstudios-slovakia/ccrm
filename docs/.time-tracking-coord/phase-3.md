# Phase 3 — Calendar and Timesheet

Owner: phase 3 agent. Status: built, QA skipped by the owner (2026-10-27).

`docs/TIME-TRACKING.md` was not edited (this run was told not to). Phases 1–2 were still 🟡; the owner said to build phase 3 anyway.

## File claim (exclusive)

- `src/components/timeTracking/TimeTrackingView.tsx` — Calendar and Timesheet tabs; List and Day kept
- `src/components/timeTracking/TimeCalendarView.tsx` — NEW
- `src/components/timeTracking/TimeTimesheetView.tsx` — NEW
- `src/utils/timeCalendar.ts` — NEW
- `src/utils/timeCalendar.test.ts` — NEW
- `src/utils/timeTimesheet.ts` — NEW
- `src/utils/timeTimesheet.test.ts` — NEW

No `src/hooks/useTimeCalendar.ts`. Views use `useTimeEntries` and `useTimeTracking`.

## Checklist

- [x] Calendar tab (Day / Week / Month): drag to create, move, resize, Untimed lane, running entry with a now line, task rail with drag-to-calendar. Week default, 08:00–20:00 first screen, full 24 h scroll, 15-minute snap, click popover.
- [x] Timesheet tab: weekly grid, rows = project + task, Mon–Sun, Totals row, hours-only entries from empty cells, editing a cell adjusts the last entry, "Copy rows from last week", "+ Add row".
- [x] Holidays: all-day band and tinted day column on the Calendar; tinted Timesheet column headers with the holiday name. Person's work country (B3), names from `holidayName`. Holiday data was not rewritten.
- [x] Unit tests for the snap / move / resize / midnight / DST / timesheet maths.
- [ ] QA and e2e — skipped. The owner said not to run `npm run test:qa`, Playwright, or edit `tests/e2e`.

## Tests

`node --test --experimental-strip-types src/utils/timeCalendar.test.ts src/utils/timeTimesheet.test.ts`

14 pass, 0 fail. Full unit suite and `tsc` were not run (other phases are editing the tree).

## Contracts honoured

- `extraTimeTrackingTabs` is imported from `./extraTabs` and rendered after Calendar and Timesheet. Phase 4 had already filled Team and Reports (`label(t)`, `render({ deps, onNavigate })`). The array was not replaced.
- `ViewingAsProvider` wraps the page. `ViewingAsSelect` replaces the old inline `<select>`. List, Day, Calendar and Timesheet still receive `scope`: context `team` is `"all"`, `user` is that user id, `me` is `"me"`.
- `ccrm-time-tab` selects List, Day, Calendar, Timesheet, or an extra tab, and the route is followed when it changes.
- `TimeTrackingMobileBar` (phase 6) stays mounted just before `</Page>`.
- Submit week is phase 6's `SubmitWeekButton` (`weekStart`, `entries`, `userId`). It calls `submitWeek` and renders nothing while `weeklyApproval` is off. No stub and no second button.
- Move, resize, and timesheet edits call `isEntryLocked(entry, { lockAfterDays, isAdmin }, today)`. `isAdmin` is `isAdminRoleName` of the signed-in user. No stub: phase 6 already exported `isEntryLocked(entry, settings, nowIso)` and `submitWeek(weekStart)`.
- No `phase-3-to-phase-6.md`. The published names already match.

## Left over

- QA / e2e for "a holiday shows in the Calendar and the Timesheet header" and "hours-only entry in the Untimed lane" were not run.
- The status row in `docs/TIME-TRACKING.md` is still ⬜. This run was told not to edit that file, and not to bump the version, changelog, `dist/`, or commit.
- Paid-payroll months are not on `TimeDeps`, so the client lock check here is age (`lockAfterDays`) and `approvalStatus === approved`. A paid payroll month is not locked in these two views until that list is passed into `isEntryLocked`.
- Month view has no hour grid. A click opens the one-hour popover (09:00). Dragging a block onto another day moves it. The bottom edge resizes in 15-minute steps. Drag-to-create and edge resize on an hour grid are the Day and Week views.

## Assumptions

- The number typed into a timesheet cell is the new total. The last non-running entry absorbs the difference; earlier entries stay. A total smaller than those earlier entries is refused. An empty cell creates one hours-only entry (`source: "timesheet"`, no start).
- "Copy rows from last week" copies project + task pairs that are missing this week. It does not copy the hours.
- A running entry can be moved on its start day (the end stays "now"). It is not resized and not moved onto another day.
- Midnight crossings stay on the start day with a `+N` end marker. Duration is `endUtc - startUtc`, then capped at 24 h to match the API.
- Holidays and extra days off are tinted. A plain weekend is muted and is not given the holiday band.
- "Viewing as: whole team" uses the viewer's work country for the one calendar. One other person uses that person's `workCountry`, else the company country.
- The browser timezone is the company timezone, the same rule the rest of the module already uses.
