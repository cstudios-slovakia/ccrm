# Testing CCRM

Start here. Two kinds of test live in this repo, and both run from `npm`.

| | Unit tests | QA audit (end-to-end) |
|---|---|---|
| Command | `npm run test:unit` | `npm run test:qa` |
| Runner | `node --test` (no dependencies) | Playwright + Chromium |
| Takes | under a second | seconds–minutes (scoped to what changed) |
| Covers | pure logic in `src/**/*.test.ts` | the real app in a real browser |
| Needs | nothing | `npm run test:qa:setup` once per machine |

`npm test` runs both.

> **You do not need Docker, PHP or MySQL to run any test.** The QA suite mocks
> `/sync.php`, `/api/*` and `/upload.php` and seeds its own dataset, so it runs
> against the Vite dev server alone. That is also why it is safe: it never
> touches a real database.

---

## 1. First-time setup

```bash
npm install
npm run test:qa:setup     # once per machine - downloads the Chromium build
```

Then, any time you want:

```bash
npm run test:qa
```

The dev server starts automatically on port **5273** - not the 5173 you develop
on, so a run always audits *this* checkout. Set `QA_REUSE_SERVER=1` to reuse a
server you already have on that port.

---

## 2. What the QA audit actually does

It drives the app like a user and reports **every action whose actual result
differed from its expected result**, with a screenshot and a proposed fix.

It is not a snapshot test and not "click every pixel". Coverage is a declared
ladder — shell navigation, header controls, every module landing view, tab
strips, first-row drill-down, create forms (every field, every dropdown),
edit drawers, page filters, plus pinned user journeys. The full map lives in
[`.agents/skills/ccrm-qa-audit/SKILL.md`](../.agents/skills/ccrm-qa-audit/SKILL.md),
which is also the file AI agents read when you ask them to test the app.

**A defect fails the run.** Anything at `QA_FAIL_ON` severity or above (default
`HIGH`) throws in the test that found it. A green run means nothing serious was
found — not that nothing was checked.

### Commands

| Command | Scope | Roughly |
|---|---|---|
| `npm run test:qa` | **Scoped** — only the tests covering what git says changed (see below) | seconds–minutes |
| `npm run test:qa:full` | Everything, on purpose | ~30 min |
| `npm run test:qa:nav` | Shell navigation and header controls | ~1 min |
| `npm run test:qa:crawler` | Per-module deep audit | minutes |
| `npm run test:qa:recorder` | Chrome Recorder replays | ~1 min |
| `npm run test:qa:dark` | Dark-mode legibility on every module | ~30s |
| `npm run test:qa:license` | Licensing banner, settings tab, and that a lapsed licence disables nothing | ~35s |
| `npm run test:qa:headed` | Full run with a visible browser | minutes |
| `npm run test:qa:report` | Open the latest report | — |
| `npm run test:qa:report -- --list` | List saved runs | — |
| `npm run test:qa:report:html` | Playwright traces and video | — |
| `npm run test:qa:typecheck` | Type-check the suite itself | seconds |

**`npm run test:qa` is scoped, not full.** `scripts/qa/run-qa.mjs` diffs the
working tree (and any unpushed commits) against `origin/<branch>` / `origin/dev`
/ `origin/main`, maps changed files to the test titles that cover them, and runs
only those. It prints the scope and the reason on every run. It escalates to a
full run on its own only when the change touches real harness plumbing —
`playwright.config.ts`, `scripts/qa/`, or the shared fixtures under
`tests/e2e/helpers/` (plus `crawler.spec.ts` / `darkmode.spec.ts` /
`navigation.spec.ts`, which are suite-wide by nature). Adding or editing an
ordinary standalone journey spec (`projectRating.spec.ts`,
`financialTrendShared.spec.ts`, ...) does **not** force a full run — it scopes
to that spec's own tests instead.

**Run `npm run test:qa:full` only when a human asks for it.** AI agents should
default to plain `npm run test:qa` after finishing a change and never reach for
`:full` on their own just to "be thorough" — that turns a routine change into a
~30-minute run for no extra signal, since the scoped run already covers what
changed. Ask the user first if you think a full run is warranted (e.g. a change
whose blast radius the scoping table can't express).

**In a shared worktree, name your files.** `npm run test:qa` diffs the *whole*
working tree, so when several sessions edit the same checkout its scope is
everyone's changes, not yours. `node scripts/qa/run-qa.mjs --files <your files>`
(or `npm run test:qa:module <Module>`) keeps the run to what you touched.

### One run per machine

A run is a Chromium per worker plus its own dev server - about 2.5 GB - and
several sessions following the same "test when finished" rule used to start
two or three of them at once on a 16 GB machine. Nothing failed outright; runs
simply crawled for half an hour, reported nothing, or reported defects that
vanished on a quiet machine. So `scripts/qa/run-qa.mjs` now admits one run at a
time:

- It takes a **machine-wide lock** (`%TEMP%\ccrm-qa-run.lock`, shared by every
  worktree and every session). A second run prints `Waiting: another QA run is
  live: PID …` and starts when the first one ends - usually within minutes.
- It waits until at least **1.5 GB of RAM is free** (`QA_MIN_FREE_MB`), and until
  its port is not held by a server it did not start.
- It runs **1 worker** unless at least 4 GB is free, then 2. `QA_WORKERS`
  overrides.
- The whole run is capped: **15 minutes scoped, 45 full**
  (`QA_GLOBAL_TIMEOUT_MS`). A run that needs longer is starved, not thorough.
- It gives up after `QA_WAIT_MIN` minutes (default 30) with exit code 2 and
  runs nothing, rather than start a run whose findings would be noise.

When you see `Waiting:`, wait. Do not kill the other run, do not sweep
processes by port, and do not take a different `QA_PORT` to squeeze in beside
it - that is the overload the lock exists to prevent. On exit or Ctrl+C the
runner kills its own process tree, so nothing is left behind to sweep.

### Environment switches

| Variable | Default | Effect |
|---|---|---|
| `QA_FAIL_ON` | `HIGH` | Severity that fails the run. `CRITICAL`/`HIGH`/`MEDIUM`/`LOW`/`NEVER`. |
| `QA_WORKERS` | `1`, or `2` when ≥ 4 GB RAM is free | Parallel workers; one is one Chromium. Never more than 2 by default. |
| `QA_MIN_FREE_MB` | `1536` (`0` in CI) | Free RAM a run waits for before starting. |
| `QA_WAIT_MIN` | `30` | How long to queue behind another run, low memory or a busy port before giving up. |
| `QA_GLOBAL_TIMEOUT_MS` | 15 min scoped, 45 min full | Ceiling on the whole run. |
| `QA_MAX_CORES` | half the machine | Hard CPU ceiling; browsers are pinned to that many cores. `0` disables. |
| `QA_VIDEO` | off | `QA_VIDEO=1` records video (one `ffmpeg` per worker). Traces already show failures. |
| `QA_PORT` | `5273` | Port of the dev server the run starts. |
| `QA_REUSE_SERVER` | off | `QA_REUSE_SERVER=1` reuses a server already on `QA_PORT` instead of starting one. |
| `QA_KEEP_RUNS` | `10` | How many past run folders to keep on disk. |
| `QA_OPEN` | off | `QA_OPEN=1` opens the report automatically when defects are found. |
| `QA_SERVER_LOGS` | off | `QA_SERVER_LOGS=1` un-silences the Vite dev server output. |
| `QA_RECORDING` | — | Replay a single recording file. |
| `BASE_URL` | — | Audit a deployed environment instead; no local dev server is started. |

---

## 3. Where results go

Every run gets **its own folder**. Nothing is silently overwritten, and old runs
are pruned so the directory cannot grow forever.

```
test-results/
  qa-audit-report.md                  <- the latest run, always here
  qa-findings.json                    <- the same data, for tooling
  qa-audit-report-latest-full.md      <- the last COMPLETE run (see note)
  runs/
    2026-08-27_22-09-43-full/         <- one folder per run, newest kept
      report.md                       <- self-contained: links resolve inside
      findings.json
      screenshots/                    <- only this run's evidence
      findings/                       <- per-worker scratch the report is merged from
    2026-08-27_21-40-12-partial/
      ...
  artifacts/                          <- Playwright traces and video
playwright-report/                    <- Playwright HTML report
```

A run folder is self-contained: its `report.md` links to `screenshots/…`
relative to that folder, so you can zip a folder, attach it to a ticket or
download it from CI and every screenshot still resolves.

Folders older than `QA_KEEP_RUNS` are deleted at the start of the next run.
The whole `test-results/` and `playwright-report/` trees are git-ignored.

**The "latest full" copy.** A filtered run (`npm run test:qa:nav`, or any
`--grep`) overwrites `qa-audit-report.md` but **not**
`qa-audit-report-latest-full.md`. So a quick scoped check can never erase your
last complete audit.

### Reading the result

The verdict prints in your terminal the moment the run ends — `RESULT: PASSED`
or `RESULT: FAILED`, the counts by severity, the top findings with expected vs
actual, and the path to the full report. You do not need to go looking for it.

To reopen it later:

```bash
npm run test:qa:report              # opens the latest report
npm run test:qa:report -- --list    # what runs are saved, and what they found
npm run test:qa:report:html         # traces and video for failed tests
```

Defect IDs are stable across runs (derived from module + target + action +
category), so `DDOC-9992FBC0` refers to the same defect tomorrow. That is what
makes "is this the same bug or a new one?" answerable.

---

## 4. Canaries: why a "failing" bug can be a passing test

A canary is a self-check on the harness, not on the app: it **passes only while
it still detects a known product bug**. That inverts the usual reading — you see
a finding reported while the run says PASSED, and the summary labels it
"canary detection(s) - expected".

**There are no canaries right now.** The two that existed pinned the
`Čas termínu` dropdown occlusion and the client timeline `?tab=` parser; both
product bugs were fixed, so both canaries were deleted, which is the rule: when
the bug is gone, delete its canary rather than weakening the assertion to make
it green.

The mechanism is still in place for the next one — `assertKnownBugDetected()`
in `tests/e2e/helpers/gate.ts`, and any finding whose module is prefixed
`Canary:` is scored as expected rather than as a defect. Add a canary when you
want proof the suite still catches a class of bug it used to.

---

## 5. Adding a test

### A user journey, with no code (Chrome Recorder)

Anyone can contribute one of these — it needs no TypeScript.

1. Chrome → DevTools → ⋮ → More tools → **Recorder** → *Create a new recording*.
2. Perform the journey in the app, stop, then **Export** → *JSON*.
3. Save it into `tests/recordings/`.
4. `npm run test:qa:recorder`.

Target controls **by their field label**, not by position. Full guide:
[`.agents/skills/ccrm-qa-audit/references/chrome-recorder.md`](../.agents/skills/ccrm-qa-audit/references/chrome-recorder.md).

### A unit test

Drop a `*.test.ts` next to the module in `src/`, using `node:test` and
`node:assert/strict` — see `src/utils/taskSelectors.test.ts`. No config needed;
`npm run test:unit` picks it up automatically.

### A new crawled surface

Add it to the coverage ladder in the QA skill file, then to
`tests/e2e/crawler.spec.ts`. If a surface is not on the ladder, it is a suite
gap — not a silent pass.

### Test data

The suite seeds its own dataset in `tests/e2e/helpers/fixture.ts`. Two things to
know before editing it:

- `installed: true` is **mandatory**. `App.tsx` gates `applyServerData()` behind
  that flag, so a payload without it leaves every collection empty and the whole
  suite silently audits empty states.
- If a module reports `VIEW_RENDERED_EMPTY` for its register, add a record for it
  here rather than accepting the gap.

---

## 5b. The one suite that is not in `npm test`

`scripts/test/license-verification.php` covers the licensing backend: signature
verification in both supported algorithms, every way a token can be refused, how
a licence-server answer is read, the state machine, and the seat ceiling.

It is deliberately **outside** `npm test`. This suite's contract is "no Docker,
no PHP, no database required", and a PHP + MySQL lane inside the deploy gate
would break that on any machine without both.

```bash
php scripts/test/license-verification.php          # crypto + protocol only
CCRM_LICENSE_TEST_DSN="mysql:host=127.0.0.1;port=3308;dbname=ccrm_license_test;charset=utf8mb4" \
CCRM_LICENSE_TEST_USER=root CCRM_LICENSE_TEST_PASS=… \
  php scripts/test/license-verification.php        # + state and storage
```

It **drops and recreates** four tables in the database you point it at, and
refuses a DSN whose database name does not contain `test`. Run it after any
change to `api/license_client.php`, and after any change to the token format on
either side (see [licensing/README.md](licensing/README.md)).

The pure decision layer in front of it — when the banner appears, how a
dismissal is keyed, the seat arithmetic — is in `src/utils/license.test.ts` and
*is* part of `npm run test:unit`.

---

## 6. When to run what

| Situation | Run |
|---|---|
| Mid-change, want fast feedback | `npm run test:unit` |
| Touched a specific module's UI | `npm run test:qa:crawler` |
| Touched navigation, the sidebar or the header | `npm run test:qa:nav` |
| Touched licensing (`api/license*.php`, the token format) | `php scripts/test/license-verification.php` |
| **Finished a feature or a fix** | **`npm run test:qa`** (scoped automatically) |
| Several sessions share this checkout | `node scripts/qa/run-qa.mjs --files <your files>` — the automatic diff would scope to everyone's changes |
| Another run is live (`Waiting:` printed) | nothing — it queues and starts when the other run ends |
| Changed only pure logic in `src/utils` | `npm run test:unit` is enough; the scoped run adds only the shell tests |
| You want everything run, on purpose | `npm run test:qa:full` — **ask the user first; don't default to this** |
| About to deploy | automatic — `npm run deploy` gates on it (scoped) |
| Opened a PR / pushed a branch | automatic — GitHub Actions runs it (scoped) |

---

## 7. Triaging a finding

1. Read `test-results/qa-audit-report.md`, starting with the summary table.
2. Open the screenshot for the defect and trace it to the component in `src/`.
3. The report's **proposed fix** is a hypothesis, not a verdict — confirm it
   against the source before acting.
4. Group by root cause, not by finding. One z-index mistake surfaces as every
   dropdown in that drawer.
5. Some findings are suite gaps, not app bugs:
   - `INTERACTION_FAILED` at **LOW** after a sticky search bar intercepted a
     click is a harness scroll artefact.
   - `UNCAUGHT_EXCEPTION` from `shadergradient` or other `node_modules` throws is
     **LOW** third-party noise.
   - `VIEW_RENDERED_EMPTY` on a register usually means the fixture lacks data.
6. Never "fix" a defect by loosening the check.

---

## 8. CI

`.github/workflows/qa.yml` runs `npm run test:unit` and `npm run test:qa` on
every push and pull request. It needs no secrets and no database — the backend
is mocked.

CI runs **the same npm scripts you run locally**, so a red build reproduces with
one command on your machine. The workflow also uploads `test-results/runs/` and
`playwright-report/` as downloadable artifacts, so you can read the report and
its screenshots without cloning anything.
