# Phase 6 → phase 3

`TimeTrackingView.tsx` is yours. Keep these two additions when you add Calendar and Timesheet. Do not remove them, and do not remove any `extraTabs` / Calendar / Timesheet imports you add.

## 1. Import (line 12)

```tsx
import { TimeTrackingMobileBar } from "./TimeTrackingMobileBar";
```

It sits after the `TimerBar` import.

## 2. Mount (line 118, just before `</Page>`)

```tsx
      <TimeTrackingMobileBar onNavigate={onNavigate} />
```

The bar is phone-only (`ws-sm:hidden`). Calendar goes to `time-tracking/calendar`. Add dispatches `window` event `ccrm-time-add-row` and navigates to `time-tracking/day`.

## 3. Day view (phase 6 mobile polish — do not revert)

`TimeDayView.tsx`:

- Lines 71–75: `useEffect` listening for `ccrm-time-add-row` calls `setAdding(true)`.
- Line 133: day strip is `flex w-full min-w-0 … overflow-x-auto` so the phone strip scrolls sideways.
- Line 190: the quick row is `flex flex-col … ws-sm:flex-row` (stacks on a phone).
- Line 235: the hours field is `w-full ws-sm:w-24`.

## 4. Submit week

Mount `SubmitWeekButton` on the Timesheet when you build it:

```tsx
import { SubmitWeekButton } from "./SubmitWeekButton";

<SubmitWeekButton weekStart={monday} entries={weekEntries} userId={userId} />
```

It renders nothing while `weeklyApproval` is off. `submitWeek` and `weekApprovalState` stay in `src/utils/timeApproval.ts`. `isEntryLocked` and `lockReason` stay in `src/utils/timeLock.ts`. Do not delete or rename them.
