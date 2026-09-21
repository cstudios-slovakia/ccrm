---
description: Run the QA audit when a feature or fix is finished, before committing the build
---

# Test Before You Ship

Full guide: [`docs/TESTING.md`](../../docs/TESTING.md).

## 1. The rule

When a feature, fix or UI change is **finished**, run the audit before the
version bump and the build commit:

```bash
npm run test:unit     # seconds
npm run test:qa       # minutes - drives the real app in a browser
```

This slots into the existing protocol from
[`commit-and-versioning.md`](./commit-and-versioning.md) as the step before it:

> test -> bump `src/utils/version.ts` -> changelog entry -> build -> commit

Nothing here needs Docker, PHP or a database. The suite mocks `/sync.php`,
`/api/*` and `/upload.php` and seeds its own data, so it never touches a real
backend and is safe to run at any time.

## 2. During development, not just at the end

| You changed | Run |
|---|---|
| Pure logic in `src/utils` | `npm run test:unit` |
| One module's UI | `npm run test:qa:crawler` |
| Sidebar, header or routing | `npm run test:qa:nav` |
| How `sync.php` or `api/*.php` stores or reads back a field | `npm run test:persistence` — the QA suite mocks the backend and cannot see a value saved under one key and read back under another (TESTING.md 5c) |
| Anything else, finished | `npm run test:qa` — it scopes itself to what changed |

`npm run test:qa` is **not** a full run by default: it diffs against
`origin/<branch>`/`dev`/`main` and only runs the tests that cover what changed,
usually seconds to a couple of minutes. It only escalates itself when the
change touches real harness plumbing (`scripts/qa/`, `playwright.config.ts`,
`tests/e2e/helpers/`, or the suite-wide `crawler`/`darkmode`/`navigation`
specs) — adding an ordinary new journey spec for the feature you just built
does not trigger that.

**Never run `npm run test:qa:full` on your own initiative.** It's a ~30-minute
run reserved for a human asking for it explicitly. If you think a change's
blast radius genuinely needs more than the scoped run covers, say so and ask
before running it.

## 2b. One run at a time, and only your own scope

Several sessions share this machine and often this checkout. Every one of them
following this rule at once is what overloaded it: 2.5 GB per run, three runs,
0.2 GB free, half-hour runs that reported nothing. `scripts/qa/run-qa.mjs` now
enforces the fix mechanically, and the rules that go with it are:

- **If it prints `Waiting: …`, wait.** It queues behind the other run (or low
  memory) and starts by itself. Never kill the other run, never sweep processes
  by port, never set another `QA_PORT` to run beside it.
- **Never start a QA run as a background task.** A backgrounded shell task
  that gets cut off kills the run halfway and leaves nothing useful. Run it in
  the foreground and read the verdict.
- **In a shared worktree, name your files:**
  `node scripts/qa/run-qa.mjs --files <files you changed>` or
  `npm run test:qa:module <Module>`. Plain `npm run test:qa` diffs the whole
  working tree, so its scope is every session's changes, not yours.
- **Pure logic needs no browser.** A change confined to `src/utils` is covered
  by `npm run test:unit`; the scoped run would only add the shell tests.
- **Do not pipe the runner through `tail` or `head`.** The output then only
  appears when the run ends, so you cannot see `Waiting:`, the scope line
  (`Scope: FULL SUITE` means stop and reconsider) or progress. Redirect to a
  log file and read it instead.
- A run that hits its time cap (15 min scoped, 45 full) or reports defects
  while other runs were live is **load, not evidence** — re-run it alone
  before touching product code.

## 3. It also runs without you

- `npm run deploy` runs the gate first and **aborts the deploy** if it fails.
  `DEPLOY_SKIP_QA=1` is the hotfix escape hatch — it means shipping unverified.
- GitHub Actions (`.github/workflows/qa.yml`) runs it on every push and PR.

CI runs the same npm scripts, so a red build always reproduces locally with one
command.

## 4. Reading the result

The verdict prints in the terminal as soon as the run ends. Every run is saved
whole under `test-results/runs/<timestamp>-<kind>/` — report, findings JSON and
that run's screenshots together — with the latest also at
`test-results/qa-audit-report.md`.

```bash
npm run test:qa:report              # open the latest report
npm run test:qa:report -- --list    # what runs are saved and what they found
```

## 5. Do not game the suite

- Never make a finding disappear by loosening the check.
- A canary **passes when it still detects** its known product bug. If that bug
  is genuinely fixed, delete the canary rather than weakening it. There are
  none at present — the two that pinned `Čas termínu` occlusion and the client
  timeline `?tab=` parser went when those bugs were fixed.
- `INTERACTION_FAILED` at LOW, `VIEW_RENDERED_EMPTY` on a register, and
  `node_modules` throws (`shadergradient`) are usually suite gaps or third-party
  noise, not product defects.
