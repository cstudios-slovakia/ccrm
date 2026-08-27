# Testing CCRM

Start here. Two kinds of test live in this repo, and both run from `npm`.

| | Unit tests | QA audit (end-to-end) |
|---|---|---|
| Command | `npm run test:unit` | `npm run test:qa` |
| Runner | `node --test` (no dependencies) | Playwright + Chromium |
| Takes | under a second | a few minutes |
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

The dev server starts automatically. If you already have `npm run dev` running,
it is reused rather than restarted.

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
| `npm run test:qa` | Everything | minutes |
| `npm run test:qa:canary` | Harness self-check (see below) | ~30s |
| `npm run test:qa:nav` | Shell navigation and header controls | ~1 min |
| `npm run test:qa:crawler` | Per-module deep audit | minutes |
| `npm run test:qa:recorder` | Chrome Recorder replays | ~1 min |
| `npm run test:qa:dark` | Dark-mode legibility on every module | ~30s |
| `npm run test:qa:headed` | Full run with a visible browser | minutes |
| `npm run test:qa:report` | Open the latest report | — |
| `npm run test:qa:report -- --list` | List saved runs | — |
| `npm run test:qa:report:html` | Playwright traces and video | — |
| `npm run test:qa:typecheck` | Type-check the suite itself | seconds |

### Environment switches

| Variable | Default | Effect |
|---|---|---|
| `QA_FAIL_ON` | `HIGH` | Severity that fails the run. `CRITICAL`/`HIGH`/`MEDIUM`/`LOW`/`NEVER`. |
| `QA_WORKERS` | `3` (`2` in CI) | Parallel workers. |
| `QA_KEEP_RUNS` | `10` | How many past run folders to keep on disk. |
| `QA_OPEN` | off | `QA_OPEN=1` opens the report automatically when defects are found. |
| `QA_SERVER_LOGS` | off | `QA_SERVER_LOGS=1` un-silences the Vite dev server output. |
| `QA_RECORDING` | — | Replay a single recording file. |
| `BASE_URL` | `http://localhost:5173` | Audit a deployed environment instead of localhost. |

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

**The "latest full" copy.** A filtered run (`npm run test:qa:canary`, or any
`--grep`) overwrites `qa-audit-report.md` but **not**
`qa-audit-report-latest-full.md`. So a quick canary check can never erase your
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

`npm run test:qa:canary` is a self-check on the harness, not on the app. Its two
tests **pass only when they still detect two known product bugs** (the
`Čas termínu` dropdown occlusion, and the client timeline `?tab=` parser).

So in a canary run you will see findings reported while the run says PASSED —
that is correct, and the summary labels them "canary detection(s) - expected".

If you ever fix one of those product bugs, **delete its canary** — do not weaken
the assertion to make it green.

Run the canaries when you have changed the QA suite itself and want to prove it
still catches what it used to.

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

## 6. When to run what

| Situation | Run |
|---|---|
| Mid-change, want fast feedback | `npm run test:unit` |
| Touched a specific module's UI | `npm run test:qa:crawler` |
| Touched navigation, the sidebar or the header | `npm run test:qa:nav` |
| **Finished a feature or a fix** | **`npm run test:qa`** |
| Changed the QA suite itself | `npm run test:qa:canary` |
| About to deploy | automatic — `npm run deploy` gates on it |
| Opened a PR / pushed a branch | automatic — GitHub Actions runs it |

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
