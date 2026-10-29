# Phase 1 — leftover: module setup wizard step

Owner: phase 1 agent. Status: done (this leftover only).

Phase 1 was already built. This agent added only the unchecked setup step (C16). No other phase 1 work. No phases 2–6. `docs/TIME-TRACKING.md` was not edited (parent merges status).

No requests were addressed to phase 1 (`docs/.time-tracking-coord/requests/` does not exist). Phase 2, 3 and 6 claims were read before editing. None of them own these files. Phase 2 noted `App.tsx` as phase 1's claim and stayed out of it.

## What was built

A **Time tracking** setup section inside the existing module wizard (`data-testid="time-tracking-setup"`). It is not a second page: Confirm still closes the wizard in one click.

The section sits at the top of the wizard body **only while the Time tracking card is switched on**. Switching the card off hides it and Confirm does not write time-tracking settings or roles.

Fields:

1. **Hours basis** — `workingDays` (then hours per day, default 8) or `fixed` (then hours per month, default 168).
2. **Employer multiplier** — default 1.352, with a live example: monthly €3,200 over 22 working days (or the fixed hour count) × multiplier. The rate comes from `computeCostRate`. At the defaults it is €24.5818/h, shown as €24.58/h.
3. **Who tracks time** — a checkbox per workspace user, passed in from `App.tsx`.
   - Administrators are checked and locked (the Admin role always has every permission).
   - Everyone else starts checked when their role's resolved `time_tracking` is `edit` (the legacy default for existing roles).
   - Tracking is a role permission, so checking one person checks every person with the same role. The section says so.
   - Confirm calls `onTrackingRoles` → `updateRolesAndSync` only when that choice actually changes a role. A plain Confirm does not rewrite roles.
4. **Chrome extension** — on/off for `extension.enabled` only. Activity capture and the retention days are not sent, so the server keeps whatever is stored.

The step loads current settings with `getSettings` when the dialog opens. Confirm calls `saveSettings` only with fields the admin changed. Reopening the wizard from Visible Modules and pressing Confirm does not reset hours basis, the multiplier or the extension. A failed save shows an error toast and still applies the module list.

## Files changed

- `src/components/ModuleSetupWizard.tsx` — the setup section
- `src/utils/timeTrackingWizard.ts` — new, pure draft / role / settings-patch helpers
- `src/utils/timeTrackingWizard.test.ts` — new
- `src/App.tsx` — only the `<ModuleSetupWizard>` props `users`, `roles`, `onTrackingRoles`
- `docs/.time-tracking-coord/phase-1.md` — this note

Not touched: TimeTrackingView, time_entries.php, schema.php, TimeTrackingSettingsPanel, extension code, module catalog (the card was already there).

## Tests

`node --test src/utils/timeTrackingWizard.test.ts` — 10 pass, 0 fail.

Not run (owner will QA and ship): `npm run test:unit`, `npx tsc --noEmit`, `npm run test:qa`, Playwright, version bump, changelog, `npm run build`, commit.

## Checklist

- [x] Setup section renders when time tracking is on, hides when it is off
- [x] Hours basis, multiplier with live example, which users track time, extension on/off
- [x] Unit tests on `src/utils/timeTrackingWizard.test.ts` only
- [x] Re-read phase claims and requests before finishing — nothing to fulfil

## Left over (still the owner's, not this step)

- `npm run test:qa` for `tests/e2e/timeTracking.spec.ts` (and the module wizard spec, which was not run here)
- Build commit on `1.13-nectarine` (`dist/`)

## Assumptions

- "Which users track time" is the role permission `time_tracking` at **edit**. There is no per-user permission. People who share a role move together. A mixed checklist (some of a role on, some off) does not write that role. The Admin role is never written.
- Turning a role off writes `time_tracking: "nothing"` through `withPermission`, which materialises that role's full permission map. Effective values other than `time_tracking` stay what they already resolved to. This happens only when the admin actually changes the checklist.
- The step is a section on the module page, not a second wizard page, so the existing module-wizard spec can still close the dialog with one click on Confirm. An unchanged Confirm does not call `saveSettings`.
- The extension switch is `extension.enabled` only. Activity capture stays as stored (phase 5). The example month is a fixed 22 working days (C7.2), not the live holiday calendar.
