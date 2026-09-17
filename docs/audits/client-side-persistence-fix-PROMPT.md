# Fix prompt — move browser-only state into its proper home

Hand this whole file to the agent. It is the companion to
[`client-side-persistence-audit-PROMPT.md`](client-side-persistence-audit-PROMPT.md):
that one finds the defects, this one fixes them.

**Read first:** the audit report the other prompt produced
(`docs/audits/client-side-persistence-audit-<date>.md`), if it exists. If it does not,
the work list below stands on its own — it was taken from a real inventory of `src/` and
is accurate as of `2e1d31e` plus the finance-trend fix.

---

## The reference implementation

**Read the finance-trend fix before writing anything.** It is the worked example of both
halves of this work, and copying its shape is the point — not inventing a second way to
do the same thing.

- Shared workspace data → `src/utils/financialTrend.ts`, the `financialTrend` key in
  `pushStateToServer` (`src/App.tsx`), and `ccrm_normalize_financial_trend()` +
  the `FINANCIAL_TREND` read/write in `public/sync.php`.
- Per-user preference → `financialTrendMode` in `src/utils/userPrefs.ts`, consumed with
  `useUserPref("financialTrendMode")`. `financialProjectionMonths` is a second, smaller
  example of exactly this.
- The test that proves it → `tests/e2e/financialTrendShared.spec.ts`.

## The three homes

Every item you move lands in one of these. Decide which **before** you touch code, and
say so in the commit message.

1. **Shared dataset** — two people must see the same thing. An entity in the sync
   payload, or a `system_settings` key.
2. **The user's row** — per person, but must follow them to another device.
   `users.metadata_json.preferences` via `useUserPref`. No backend change needed:
   `metadata_json` is an opaque blob that `sync.php` passes through untouched.
3. **Browser storage** — genuinely meaningless on another device. Rare, and every
   member needs a comment saying why.

The rule the audit turns on: **a local copy is fine when the DB copy is authoritative
and the local one is rewritten from it. A local copy that is the only copy is a bug.**
`crm_language` and the theme keys are legitimate mirrors (`ErrorBoundary` renders
outside auth; `index.html` must paint before the bundle loads) — leave them alone.

## The work list

At the time of writing, one illegitimate key is left in `src/`. Re-run the inventory
before you start, because other sessions are working in this repo:

```bash
grep -rn "localStorage.getItem\|localStorage.setItem" --include=*.ts --include=*.tsx src/
```

### 1. Start Menu groups and layout — `src/components/StartMenu.tsx`

**Symptom.** The user rearranges the launcher — custom groups, which items sit in each,
which are hidden. It survives a reload and is gone on their second machine, and gone
again whenever the browser clears site data.

**Root cause.** `localStorage`, at `StartMenu.tsx:136-190`, under
`` `ccrm_start_menu_groups_v2_${currentUser?.id || "guest"}` ``. That key is the tell:
whoever wrote it knew the layout was per-user — they namespaced it by user id — and put
it in the one home that cannot deliver that. Note the inconsistency inside a single
feature: the default landing page and the sidebar nav layout for the same menu are
**already** DB-backed (`handleSaveUserLayout` in `src/App.tsx`).

**Home:** the user's row. Add one preference holding the whole blob
(`{ groups, groupItems, unused }`), typed against the existing `MenuGroup`, and replace
the load/persist/reset trio with `useUserPref`.

**Watch for:**
- The `guest` branch. Nobody is logged in on the login screen and there is no row to
  write to; `setUserPref` already keeps anonymous changes in memory for the session.
  Do not invent a second code path for it.
- The reset action must clear the preference, not remove a key.
- `defaultGroups` is derived from `systemLanguage` and rebuilt by `useMemo`. A stored
  layout has to survive a language change — check what happens to stored group names
  when the interface language is switched, and say in the report what you found. Do not
  silently change that behaviour while moving the storage.

### 2. Anything the audit report adds

Same treatment, same order of operations. If the report lists a finding whose home is
**shared data**, that one needs a `sync.php` change and is the higher-risk half — do it
on its own, not batched with preference moves.

## For every item you move

1. **Migrate what is already there.** An existing install has this data in the browser
   right now and moving the storage must not throw it away. Copy the finance-trend
   migration: read the legacy key once, adopt it **only when the destination is empty**
   (so a second browser's stale copy cannot overwrite what a colleague already saved),
   then clear the legacy key so it cannot fire twice. For a preference, add the key to
   `LEGACY_PREF_KEYS` and `readLegacyPrefs` in `utils/userPrefs.ts` and let the existing
   one-shot migration in `App.tsx` do it.
2. **Check the permission gate, for shared data only.** `sync.php` wraps each collection
   in `$ccrm_skip_writes($module, $collection)`, which drops a write **silently** —
   HTTP 200, `error_log` only — for a user without edit rights. If you add a shared-data
   write, gate it on the module the data belongs to, and hide the control in the UI for
   users who cannot save. Offering an edit that silently reaches nobody is the same class
   of bug as the one you are fixing. Preferences need none of this: everyone may edit
   their own row.
3. **`public/sync.php` is the source; the repo root copy is output.** Edit `public/`,
   then run `npm run sync:backend`. Never edit the root copy directly — see the comment
   at the top of `scripts/sync-backend.mjs` for what a one-sided edit does to deploys.
4. **Round-trip it, don't just write it.** A field written on POST but missing from the
   GET response reverts on the next pull and reads as the same symptom. Check both ends.
5. **Test it with two browser profiles.** Copy `tests/e2e/financialTrendShared.spec.ts`:
   a route handler that *remembers* the write, a second `browser.newContext()`, and an
   assertion that the second profile's own `localStorage` is empty. One browser proves
   nothing — the bug is invisible within a single profile, which is exactly why it
   survived a year. For a preference, the equivalent is a mock that persists the users
   entity.
6. **Delete the old key.** Leaving a dead `localStorage.getItem` behind is how
   `crm_financial_current_bank_balance` became a constant pretending to be a setting:
   read by the app, written by nothing, for a year.

## Rules of engagement

- **This worktree is shared with other concurrent sessions.** `git status` will show
  files you did not touch, and the file you are editing may gain hunks mid-task.
  Re-check `git status` before every commit; stage your own paths explicitly by name;
  never `git add -A`; never revert, amend or "tidy" a hunk you did not write.
- **`src/utils/version.ts` and the changelog are contended.** Another session may be
  mid-release with a bump already sitting uncommitted. Check `git diff src/utils/version.ts`
  before bumping, and if someone else owns the next number, commit source-only and say so
  rather than fighting over it.
- **Verify with `npx tsc -b --force`**, not `npm run build` — the build rewrites the
  committed `dist/`. See `.agents/rules/post-build-cleanup.md`.
- `npm run test:unit` for the fast pass; scope the QA audit to what you changed
  (`npm run test:qa:module Financial`) rather than running the full sweep over other
  sessions' half-finished work. `docs/TESTING.md` is the source of truth.
- Never make a finding disappear by loosening a check.

## What to produce

One commit per item moved, each naming the home it went to and the migration it carries.
Then a short note back: what moved, what you migrated, what you tested with two profiles,
and anything you found and deliberately left alone — with the reason, so the next person
does not have to re-derive it.
