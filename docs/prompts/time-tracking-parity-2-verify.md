# Time tracking design parity, pass 2: finish the browser and backend tests

## Goal
The work of design-parity pass 2 is merged into `1.14-orange`, but it was never tested as a whole. When
this task is done, the browser tests and the server probe have run on the current `1.14-orange`, every
failure is explained, and `docs/TIME-TRACKING-DESIGN-PARITY.md` says truthfully what was and was not
checked.

This is a testing task. You fix only what is listed under Scope.

## Context / links
- The pass and all its decisions: `docs/TIME-TRACKING-DESIGN-PARITY.md`, part "Pass 2" (audit, owner
  answers, Done log, "Checks and QA (pass 2)").
- Testing rules: `docs/TESTING.md`, `.agents/rules/qa-before-ship.md`, `.agents/rules/parallel-agents.md`.
- Commits of the pass, all in `1.14-orange`:
  - packages F and P1 to P11: `fb2f9ab7` .. `56dad0a8`
  - Calendar popover label (Q8): `96b1ba56`, `09c366bb`
  - Timesheet Cost column (Q10): `a7599dc9`, `486e60a9`
  - List filter (Q2): `76e51b81`, `c41bd1e7`, `3b43dd11`
  - Reports drill-down (Q18): `0c7c32c3`, `49dfc49f`, `c1f0edcb`
  - "Require a task" on manual entries (Q29): `74f6c5a8`, `f9b34bf9`, `9d9b6ef8`, `2b5b4580`, `0ce41cf0`
  - Contractors box in Settings (Q24): `cd51b752`
- What has run so far:
  - `npm run check` was green in every worktree before its merge. It was not repeated on `1.14-orange`
    after the last merges.
  - One scoped QA run after package P8 (`56dad0a8`): 113 passed, 2 failed (both pre-existing, see below),
    27 did not run because the run hit its 900 s limit. Those 27 were run later: 109 passed, 0 failed.
  - `tests/e2e/timeTracking.spec.ts` ran on the Q29 branch: all passed after one test-only fix.
  - **Never run:** the server probe `npm run test:time-tracking` (its section T25 covers Q29). The changed
    PHP only passed `php -l`.
  - **Never run together:** the browser tests on a branch that holds all six later additions.

## Scope

### 1. `npm run check` on `1.14-orange`
Run it in the main checkout (read-only, no worktree needed). It must pass before anything else.

### 2. Browser tests (scoped QA)
- List the files the pass changed:
  `git log --format= --name-only fb2f9ab7^..0ce41cf0 -- src extensions tests/e2e | sort -u`, plus the
  files of `cd51b752`. Leave out `.zip` files.
- Run `node scripts/qa/run-qa.mjs --files <those files>`. Never plain `npm run test:qa`.
- The run has a 900 s limit and the list is long (about 150 files). If the run stops at the limit, run
  the spec files that did not run in a second scoped run. Do not raise the limit and do not skip them.
- Machine facts that will get in the way:
  - The laptop is short of memory. QA waits until 1536 MB is free; set `QA_WAIT_MIN=45` so it waits
    instead of giving up. Run it in the background with the output in a file.
  - Only one QA server may run at a time (port 5273, lock file `%TEMP%/ccrm-qa-run.lock`). Another
    session's QA started at the same time crashes every test with React "useRef of null". If you see
    that, wait and run again; it is not a finding.
  - A run killed by low memory leaves its Vite and Playwright processes behind and blocks port 5273.
    After any killed run check the port and stop **only the processes your run started**, by exact PID
    (in Git Bash: `taskkill //PID <pid> //T //F`).
  - Never stop, restart or reuse the owner's dev server on port 5180.
- Read `test-results/qa-audit-report.md`, summary table first.

### 3. Server probe
- `npm run test:time-tracking` (`scripts/probe-time-tracking/run.mjs`). It runs the real PHP against a
  scratch database (`ccrm_tt_probe`) and a scratch copy of `public/` inside the dev containers `crm` and
  `ccrm-db-1`. It does not touch dev data. Read the file header before you run it.
- It needs the dev containers. If they are not running, stop and ask; do not start or restart the stack
  yourself.
- Section T25 is the new one. Report its result separately.
- Known noise, not regressions (check each against the evidence before you rely on it):
  - "other side closed" after many requests: Apache keep-alive, older than this pass.
  - A date-bound failure in T2: database times are UTC, the probe compares against local time near
    midnight.
- Also run `npm run test:unit` if `npm run check` did not already (it does, unless run with `--fast`).

### 4. Failures
Report every failure as **observed symptom → root cause → proposed fix**, grouped by root cause, and say
whether the pass caused it (name the commit) or it is older (show that it fails before `fb2f9ab7` or is
listed in `scripts/qa/known-failing.json`).

You may fix, in your own worktree, only:
- a mistake in a test written by this pass (the test is wrong, the app is right);
- a clear regression caused by one of the commits listed above, when the fix is small and has one
  reasonable reading.

Have an independent `ccrm-reviewer` look at any app fix before you merge it. Everything else is reported,
not fixed. Never make a failure disappear by loosening a check.

### 5. Correct the document
In `docs/TIME-TRACKING-DESIGN-PARITY.md`, part "Pass 2" (in a worktree, with a changelog fragment):
- Rewrite "Checks and QA (pass 2)" from what you actually ran: date, commit, numbers, failures. Remove the
  sentence that 27 tests "are still to be run".
- Done log: some commit hashes are stale after rebases. Replace them with the hashes listed above where
  they differ (verify each with `git log`).
- The C2 text about the sidebar colour still describes the old intention. The owner's answer to Q30 is
  "keep rust"; make the text say so.
- "Still open after this pass": Q24 is done; the remaining items are the two rows with no data behind
  them (E4, E11).

## Out of scope
- New features, restyling, anything the owner declined (see the Owner answers table).
- The 5,000-entry limit of the report endpoint: known, not a defect.
- The defects handled by `docs/prompts/time-tracking-parity-2-defects.md` (entry drawer label and width,
  the two `projectStatuses` tests). **Already merged (2026-11-24)**: just test on top of it.
- Build, version bump, deploy, push, porting to another branch.
- Real phone and the real Chrome extension popup: you cannot check these. List them for the owner as
  manual checks, with what to look at.

## Definition of done
- [ ] `npm run check` passes on `1.14-orange`
- [ ] Scoped QA has covered every spec the changed files select; no spec left "did not run"
- [ ] `npm run test:time-tracking` has run; T25 result stated
- [ ] Every failure explained as symptom → root cause → proposed fix, with "caused by the pass" or
      "older" and the evidence
- [ ] "Checks and QA (pass 2)" and the other four document corrections are committed with a changelog
      fragment and merged with `node scripts/agent/finish-worktree.mjs <name>`; not pushed
- [ ] No leftover processes on port 5273, no leftover lock file, no temporary files of yours

## Pre-existing failures
Do not fix these here.
- ~~`projectStatuses.spec.ts` › "statuses are added, renamed and removed in settings, and the projects list
  follows" and › "one click settles the rest of the value as a paid income row"~~: **fixed 2026-11-24
  (`a69e3b01`, out-of-date tests) and removed from `scripts/qa/known-failing.json`. They should pass; if one
  fails now, it is a new regression.**
- The other entries of `scripts/qa/known-failing.json`.
- The probe noise listed in Scope 3.

## Stop and ask when
- The dev containers are not running, or the probe would touch anything but its own scratch database and
  directory.
- A failure needs a behaviour decision (two reasonable readings).
- A fix would be larger than a few lines or would touch a module outside time tracking.
- Memory stays too low for QA for more than 45 minutes.

## Report format
Under 400 words: what ran (command, commit, numbers), failures grouped by root cause, what you fixed
(hash + subject), what is still unverified, the manual checks left for the owner.
