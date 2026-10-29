# Phase 2 — leftover gaps

Status: done for the two gaps the spec allows. Item 3 stopped. QA, version, changelog, build and commit were skipped on purpose.

## Files

- `src/components/timeTracking/TaskTimeControls.tsx` — "Create project for {client}" in the task-card popover, then the same mini form the project picker uses (name, project type). Client is the task's client and is not a free picker.
- `src/components/timeTracking/timeCreateBridge.ts` — new. Holds the create-project callback `ProjectRequestDialog` already receives.
- `src/components/timeTracking/ProjectRequestDialog.tsx` — publishes that callback, project types, currency and language into the bridge.
- `src/components/timeTracking/TaskTimeBreakdown.tsx` — new. Per-person list and cost figure in the task drawer.
- `src/components/TaskEditDrawer.tsx` — mounts the breakdown inside the existing Time tracking section.
- `src/utils/timeLinks.ts` — `clientForTask` (via `leadClient.ts`).
- `src/utils/timeLinks.test.ts`
- `src/utils/taskTimeSummary.ts` — new. Cost figure (B8) and running-timer seconds.
- `src/utils/taskTimeSummary.test.ts` — new.
- `src/utils/timeTrackingApi.ts` — `getTaskPeople`.
- `public/api/time_entries.php` — `GET action=taskPeople` inside `PHASE2-TASK-PEOPLE` markers only. No schema change. **Parent must run `npm run sync:backend`.** This agent did not.

Not edited: `App.tsx` (phase 1 exclusive claim), `useTimeTracking.tsx` (phase 3 read-only), `TicketsView.tsx`, `TimeTrackingView.tsx`, `schema.php`, `docs/TIME-TRACKING.md`.

No requests were addressed to phase 2. `docs/.time-tracking-coord/requests/` does not exist.

## Tests

`node --test src/utils/taskTimeSummary.test.ts src/utils/timeLinks.test.ts` — 12 pass, 0 fail.

`php -l public/api/time_entries.php` — no syntax errors.

QA, `npm run test:unit` and `npx tsc --noEmit` were not run.

## Item 3 — stopped

Lowering a ticket's logged total does **not** write a negative `time_entries` row.

C10.4 says the edit-total shortcut "creates one hours-only correcting entry". It does not say that duration may be negative. Part B never mentions a negative duration. Part C treats `duration_sec` as a span of time (required unless the timer is running; a range that runs backwards is `end_before_start`). `ccrm_te_resolve_time` rejects `durationSec < 0` as `duration_out_of_range`, and the QA mock does the same. Raising the total already writes one positive hours-only entry of the difference (`TicketsView` `handleSaveTotalLoggedTime`, `delta > 0`). A downward correction cannot be a new row without a negative duration, which Part B and Part C do not authorize. Shrinking or deleting existing rows would restore the old "rewrites timeEntries" behaviour C10 replaced. Left as-is.

## Assumptions

- The popover's create action uses the existing `onCreateProject` from `TimeDeps` (projects create permission). The client is fixed to `clientForTask` because C9.1 already knows who the task is for. The mini form still asks for name and project type (C11.7).
- `App.tsx` is claimed by phase 1, so the callback is published from `ProjectRequestDialog`, which already receives it. The dialog renders before the task cards.
- Per-person hours are an aggregate, like `action=totals`: a task's tracked time is not private. The entry list stays forced to the caller without `time_tracking_team` (C4.4). `taskPeople` returns `userId`, `seconds`, and `cost` only.
- Cost follows B8 and the totals rule: the caller's cost is always sent; other people's cost needs `time_tracking_costs`. `cost: null` means no rate. A missing `cost` key means hidden. The headline "Cost" is shown only when every person's cost is a number. Otherwise, if the viewer has their own cost and someone else also logged time, the headline is "Your cost".
- A task the caller cannot view (`ccrm_visible_task_ids`) returns an empty people list.
- Running time is added to that person's hours in the drawer and is not given a cost until the timer stops.
- Phase 6's lock markers in `time_entries.php` were left in place. Do not delete the `PHASE2-TASK-PEOPLE` block.

## Left over

- Item 3, as above.
- QA for phase 2 (and the phase 1 run of `tests/e2e/timeTracking.spec.ts`) was not run.
- Phase 1's module-setup wizard step is still that phase's work.
