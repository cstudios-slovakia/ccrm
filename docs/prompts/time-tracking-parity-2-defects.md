# Time tracking design parity, pass 2: fix the known defects

> **DONE (2026-11-24), merged into `1.14-orange`; do not run this prompt again.** Defect 1 was a real defect and
> is fixed (`c0bebc20`, `7cc50ec6`). Defect 2 predates the pass (since phase 1) and is fixed (`c0bebc20`).
> Defect 3: both `projectStatuses` tests were out-of-date tests, not app bugs; fixed in the test and the QA mock
> (`a69e3b01`) and removed from `scripts/qa/known-failing.json`. Root causes and details:
> `docs/TIME-TRACKING-DESIGN-PARITY.md`, "Defects left after pass 2: resolved". The text below is the original
> task, kept as a record.

## Goal
Three defects were noted at the end of design-parity pass 2 and left unfixed. When this task is done,
each one is either fixed and covered by a test, or shown with evidence not to be a defect.

## Context / links
- The pass: `docs/TIME-TRACKING-DESIGN-PARITY.md`, part "Pass 2". Branch `1.14-orange` (the main
  checkout). Nothing of the pass is pushed.
- Review page with the screenshots:
  https://claude.ai/artifact/Nw7ptoiMgUg4LFDhsVPQSW (image "New: Manual entry refused (Require a task)"
  shows defects 1 and 2).
- Rules that apply: `.agents/rules/agent-worktrees.md`, `.agents/rules/parallel-agents.md`,
  `.agents/rules/commit-and-versioning.md`, `.agents/rules/view-size.md`, `docs/BRANDING.md`.
  Strings are `t(en, sk, hu)`.

## Scope

### Defect 1: the Task field says "optional" while a task is required
- **Seen:** in the new-entry drawer, opened after a manual entry was refused by "Require a task", the
  Task field was labelled "Task · optional" ("Úloha · voliteľné").
- **What is known:** `src/components/timeTracking/EntryDrawer.tsx` (about line 333) already hides
  "· optional" when `tt.settings.requireTask` is true. In the screenshot the rule had been switched on
  through a direct API call, so the settings held by the page were probably stale. **This may be a
  capture artefact, not a defect.**
- **Do:**
  1. Reproduce it the way a user would: switch the rule on in Settings → Projects & tasks → Time
     tracking, save, then add a manual entry without a task. Check the label.
  2. If the label is right in that flow, look at the stale case: the server answers 422 `task_required`
     while the page still believes the rule is off (an admin switched it on in another session). The
     recovery in `src/components/timeTracking/timeCreateBridge.ts` (`recoverTaskRequired`) opens the
     drawer; at that moment the page knows the rule is on. Make the drawer show the field as required in
     that case too, for example by refreshing the time-tracking settings when `task_required` comes back.
     Keep the change small.
  3. When the rule is on, the Task field should read as required in the same way the Project field
     does (look at how "Projekt *" is drawn and match it). A ticket also satisfies the rule, so the
     wording must not claim that only a task will do.
- If step 1 shows a real defect, fix that first.

### Defect 2: the Duration field runs past the right edge of the entry drawer
- **Seen:** at 1440 px width, in the row Date / Start / End / Duration of the new-entry drawer, the
  Duration field is cut off by the right edge of the drawer.
- **Do:** find out whether this is older than the pass (compare with `fb2f9ab7^`) and say so in the
  report. Fix it either way: the four fields must fit inside the drawer at every View size and at the
  drawer's narrowest width, without a horizontal scrollbar. Check the edit drawer of an existing entry
  as well; it shares the row.

### Defect 3: two failing `projectStatuses` tests
Both are older than the pass and registered in `scripts/qa/known-failing.json`:
- `projectStatuses.spec.ts` › "statuses are added, renamed and removed in settings, and the projects
  list follows": the projects list still shows the five built-in statuses after the settings edits.
- `projectStatuses.spec.ts` › "one click settles the rest of the value as a paid income row": the
  button "Označiť zvyšok ako uhradený" is not found on the finances of `project-1`.

**Do:** for each test find the root cause first, then decide: the app is wrong (fix the app) or the test
is out of date (fix the test). Use `git log` on the spec and on the components it drives to see which
side changed. If the app's current behaviour was a deliberate change, the test is out of date. If you
cannot tell which behaviour is intended, stop and ask; do not guess. When a test passes again, remove
its entry from `scripts/qa/known-failing.json`.

This defect is outside the time-tracking module. Do it as its own worktree and its own commits, separate
from defects 1 and 2.

## Out of scope
- The 5,000-entry limit of the report endpoint: the owner does not count it as a defect.
- Any other restyling or canvas work; anything the owner declined in the Owner answers table.
- The other entries of `scripts/qa/known-failing.json`.
- The test and probe runs of `docs/prompts/time-tracking-parity-2-verify.md`.
- Schema changes, build, version bump, deploy, push.

## How to work
- One worktree per fix group (defects 1 and 2 together, defect 3 alone): `EnterWorktree`, commit there,
  `ExitWorktree` (keep), then `node scripts/agent/finish-worktree.mjs <name>` from the main checkout.
  Never `npm install` in a worktree.
- Have an independent `ccrm-reviewer` read each diff before the merge.
- Browser tests are run only by you, the orchestrator, never by a subagent. The machine is short of
  memory: set `QA_WAIT_MIN=45`, run in the background with the output in a file, and after a killed run
  check port 5273 for processes your run left behind. Never touch the owner's dev server on port 5180.

## Definition of done
- [ ] Defect 1: reproduced or shown to be a capture artefact, with the steps; the Task field reads as
      required whenever the drawer opens because of `task_required`; a browser test covers it
- [ ] Defect 2: the four fields fit at 1440 px and at phone width; stated whether it predates the pass
- [ ] Defect 3: each test either passes and is removed from `known-failing.json`, or a question is put
      to the owner with the two readings
- [ ] `npm run check` passes in each worktree
- [ ] Scoped QA once per fix group: `node scripts/qa/run-qa.mjs --files <changed files>`
- [ ] A changelog fragment in `changelog.d/` per commit; `src/utils/version.ts` untouched
- [ ] Merged into `1.14-orange` with `finish-worktree.mjs`; not pushed; no leftover worktrees,
      branches or processes of yours

## Pre-existing failures
- The remaining entries of `scripts/qa/known-failing.json`. List any you see; do not fix them.

## Stop and ask when
- Defect 3 needs a decision about which behaviour is intended.
- A fix needs a schema or sync change, or more than a small change to a shared component.
- A check fails for a reason unrelated to your change.

## Report format
Under 300 words: per defect, what it was (root cause), what changed, commits (hash + subject), checks
run with results, anything still unverified, open questions.
