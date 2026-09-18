# Audit prompt — state the app keeps in the browser instead of the database

Hand this whole file to the agent. It is a **prompt**, not a report: the agent's job is
to produce the report.

**Baseline for the numbers quoted below:** `2e1d31e` plus the working-tree fix that moved
the finance trend anchors into `system_settings.FINANCIAL_TREND`.

---

## The defect class

A user changes something. It lands in `localStorage`, `sessionStorage`, a React ref, or a
module-level variable — and never reaches `sync.php`. On the screen in front of them it
looks saved. It is invisible to every colleague, to every other device, and to the same
person in a different browser, and it disappears when site data is cleared.

The worked example, and the reason this audit exists:

> `FinancialManagementView.tsx` stored the manual weekly bank-balance anchors — the
> figures the whole 18-week projection curve is computed from — in
> `localStorage.crm_financial_weekly_bank_balances`. Whoever reconciled a week against
> the bank statement saw one chart; everybody else saw a different one, built from a
> hardcoded 48500 starting balance. The starting balance was read from
> `crm_financial_current_bank_balance`, a key **nothing in the codebase ever wrote**, so
> it was a constant masquerading as a setting.
>
> It survived a year because it is per *browser*, not per *account*: log out and back in
> as a colleague in the same Chrome profile and the bug is invisible.

Reproduced and fixed; see `tests/e2e/financialTrendShared.spec.ts` for the shape of a
test that pins it.

## The decision rule

For every piece of state you find, ask **"if two people looked at this, must they see
the same thing?"**

| Answer | Home | How, in this codebase |
|---|---|---|
| Yes — it is a fact about the business | Shared dataset | An entity in the sync payload, or a `system_settings` key. `financialTrend` in `sync.php` is the smallest worked example of the latter. |
| No, but it should follow the person to another device | The user's row | `users.metadata_json.preferences` via `useUserPref(...)` — see `src/utils/userPrefs.ts` |
| No, and it is meaningless on another device | Browser storage — **and this needs a comment saying why** | `localStorage`, always through `utils/safeStorage.ts` |

The third row is narrow, and every current member of it earns its place for a stated
reason. **Do not report these as findings** — but do check each one still holds:

- `crm_language` (`App.tsx`, `utils/translations.ts`) — a mirror. `ErrorBoundary`
  renders outside the React tree and outside auth, so it cannot reach
  `metadata_json.language`. The DB copy is authoritative.
- `crm_user_theme` / theme mode (`utils/theme.ts`) — a mirror. The pre-paint script in
  `index.html` must pick a palette before the bundle loads, or every reload flashes the
  default theme. The DB copy is authoritative.
- `crm_current_user_rbac` (`sessionStorage`) — a per-tab cache of the signed-in profile,
  derived from the DB, deliberately not shared between tabs.
- The licence-notice dismissal in `utils/license.ts` — deliberately session-scoped; the
  durable "never show again" is `licenseNoticeSuppressed` in the DB-backed prefs.
- The chunk-error reload rate-limit (`App.tsx`) — ephemeral by definition.
- `localStorage.clear()` in `PersonalSettingsView.tsx` — a reset action the user asks for.

A mirror is only legitimate when **the DB copy is authoritative and the local copy is
rewritten from it**. A local copy that is the only copy is a finding, however well
commented.

## Where to look

Do not stop at grepping `localStorage`. The bug is "state with no route to the server",
and browser storage is only its most visible form.

1. **Browser storage.** `grep -rn "localStorage\|sessionStorage" src/`. At the baseline
   the only keys left in `src/` outside the permitted list above are:
   - `crm_financial_projection_months` (`FinancialManagementView.tsx`) — the trend
     chart's forecast horizon. A per-user view preference sitting in the wrong one of the
     three homes; belongs in `useUserPref`. *(In flight in another session at the time of
     writing — check whether it is still there, and coordinate before editing that file.)*
   - the Start Menu's custom groups and layout (`StartMenu.tsx`) — the user's own
     arrangement of the launcher, per browser only, so it does not follow them to a
     second machine. Belongs in `useUserPref`. Note the contrast: the default landing
     page and the sidebar nav layout for the *same* menu are already DB-backed
     (`App.tsx`, around the `handleSaveUserLayout` comment), so this is an inconsistency
     within one feature, not a considered choice.
2. **State that never reaches the payload.** Take the `payload` object literal in
   `pushStateToServer` (`src/App.tsx`) as the definition of "what gets saved". Then walk
   every `useState` in `src/App.tsx` and ask which of them a user can change and which
   of those appear in that object. Anything a user edits that is absent is a finding.
3. **Component-local state that looks like data.** A `useState` inside a view whose
   value is a business figure, a mapping, a threshold or an ordering — not an open/closed
   flag, a hover index or a form draft. The finance anchors lived exactly here.
4. **Write paths that stop at the client.** Somewhere a handler builds the new value and
   then… nothing. Look for setters that are never followed by a sync call or a prop that
   leads to one. Compare against `updateFinancialRecordsAndSync` / `updateFinancialTrendAndSync`
   in `App.tsx`, which are what a correct write looks like here.
5. **Server-side counterparts.** For every candidate, check `public/sync.php` really
   round-trips it: present in the POST handler **and** in the GET response. A field the
   server writes but never returns reverts on the next pull, which reads as the same
   symptom. `docs/audits/sync-roundtrip-audit-2026-09-16.md` is the prior art for that
   half and lists the traps.
6. **Permission-gated silence.** `sync.php` wraps each collection in
   `$ccrm_skip_writes($module, $collection)`. A user without edit rights on the module
   has their write **silently dropped** — HTTP 200, `error_log` only. The client keeps
   showing it until the next GET. Report any UI that offers an edit whose server write
   is gated by a permission the UI does not itself check. (The fix for the finance
   anchors also hid the Calibrate button for read-only users, for exactly this reason.)

## Rules of engagement

- **Read-only. Change no product code.** The output is a report.
- **This worktree is shared with other concurrent sessions.** `git status` will show
  files modified by work that is not yours. Never revert, stage, commit or "tidy" a hunk
  you did not write, and check `git status` again before touching any file.
- **Never send a POST to a real `sync.php`.** To reproduce something, drive the QA
  harness: `npm run test:qa` mocks the backend and seeds its own data. See
  `docs/TESTING.md`, and `tests/e2e/financialTrendShared.spec.ts` for how to stand up a
  mock backend that *remembers* a write so a second browser context can read it back —
  that two-profile setup is what actually proves the class of bug.
- Verify every claim against `src/` and `public/sync.php`. Read the comment before you
  report the line: several of these keys were already argued about and the reasoning is
  written down next to them.

## What to produce

`docs/audits/client-side-persistence-audit-<YYYY-MM-DD>.md`, in the style of
`sync-roundtrip-audit-2026-09-16.md`:

- A summary table first: **what the user changes → where it is stored → who else can see
  it → which of the three homes it belongs in**.
- Then one section per finding, as **observed symptom → root cause → proposed fix**,
  grouped by root cause. One missing payload key can surface as several broken screens;
  report it once.
- Severity by blast radius: shared business data stranded in a browser is the top of the
  scale; a per-user preference that merely fails to follow someone to a second device is
  the bottom. Say which it is, and say plainly when something is a real bug that no user
  would ever notice.
- State what you checked and found clean. A list of the places this class of bug *isn't*
  is worth as much as the findings, and it is what makes the next audit cheap.
