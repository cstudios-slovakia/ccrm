# Testing & QA — developer guide

How to check that a change works before you commit it, and what to do with what
the checks report.

Two layers live in this repo. They answer different questions and are run by
different commands:

| Layer | Question it answers | Command | Lives in |
|---|---|---|---|
| **Unit tests** | Is this pure function's logic correct? | `npm run test:unit` | `src/**/*.test.ts` |
| **Browser QA audit** | Does the real UI actually do what a user expects? | `npm run test:qa` | `tests/e2e/` |

**There is no CI.** Nothing runs any of this for you on push — running it is part
of finishing a change. The one thing that *is* enforced automatically is the
TypeScript build (`npm run build`), because a type error breaks the bundle.

---

## 1. Quick start

```powershell
npm install
npm run test:qa:setup      # once per machine — downloads the Chromium build
```

Then, from a clean checkout, the check you run after a change:

```powershell
npm run test:unit          # seconds, no browser
npm run test:qa            # only the browser tests covering what you changed
```

`npm run test:qa` starts the dev server itself if one is not already running, so
you do not need `npm run dev` in another window (an existing one on `:5173` is
reused). Nothing touches a real backend or a real database — see
[§6 Test data](#6-test-data).

---

## 2. The loop for a normal change

1. Make the change.
2. `npm run test:unit` — instant, and it is the only thing covering task
   permission/visibility logic.
3. `npm run test:qa` — scoped: it asks git what changed and runs only the
   browser tests covering those files. Editing `EmailView.tsx` runs one test
   instead of fourteen.
4. If it reports defects, read `test-results/qa-audit-report.md`
   (`npm run test:qa:report` opens it). See [§5 Reading the report](#5-reading-the-report).
5. `npm run build` — the real typecheck. (`tsc -p tsconfig.json` at the root is
   a no-op; only `npm run build` runs `tsc -b` over `src/`.)
6. Commit.

**Before a release or a deploy**, or whenever the question is "is the whole app
still fine?", run the full audit instead:

```powershell
npm run test:qa:full
```

A scoped run is a filter, never a verdict on the rest of the app.

> ⚠️ A full run drives parallel Chromium instances and takes several minutes. It
> is CPU-capped (see [§7](#7-environment-switches)) but it is still the heaviest
> thing in this repo. Don't start one to check a one-module edit.

---

## 3. Command reference

| Command | What it runs |
|---|---|
| `npm run test:unit` | Node's built-in test runner over `src/**/*.test.ts` |
| `npm run test:qa` | **Only the browser tests covering what changed** |
| `npm run test:qa:full` | The whole audit (and refreshes `qa-audit-report-latest-full.md`) |
| `npm run test:qa:module Warehouse` | One named module |
| `npm run test:qa:nav` | Shell navigation and header controls only |
| `npm run test:qa:crawler` | Per-module deep audit only |
| `npm run test:qa:recorder` | Chrome Recorder replays only |
| `npm run test:qa:headed` | The full suite with a visible browser, one worker |
| `npm run test:qa:report` | Open the markdown report for the last run |
| `npm run test:qa:report:html` | Open Playwright's report — traces and video |
| `npm run test:qa:setup` | Install the Chromium build Playwright drives |
| `npm run test:qa:typecheck` | Type-check the QA suite itself (`tsconfig.qa.json`) |

Anything after `--` is forwarded to Playwright untouched:

```powershell
node scripts/qa/run-qa.mjs --full -- --grep "Warehouse"
```

---

## 4. How the scoping works

`scripts/qa/run-qa.mjs` decides what to run:

1. It collects changed files — working tree, plus everything not yet pushed
   (diffed against `origin/<branch>`, falling back to `origin/dev`, then
   `origin/main`).
2. It maps each file to the test titles covering it, via the `RULES` table at
   the top of that script.
3. It runs only those tests, at below-normal OS priority and on a capped number
   of cores.

The shape of the mapping:

| You edited | What runs |
|---|---|
| One module's view (`src/components/WarehouseView.tsx`) | That module's crawler test |
| The shell (`App.tsx`, `Sidebar`, `Header`, `src/utils/`, `src/components/ui/`) | The shell tests — navigation, header, recordings — not all twelve modules |
| A recording in `tests/recordings/` | The recorder replays |
| The harness itself (`tests/e2e/`, `playwright.config.ts`, `scripts/qa/`) | **Everything.** The code that picks the subset is the code that changed |
| Only PHP, or only docs | Nothing. No browser is started |

To ask what a given change *would* run, without opening a browser:

```powershell
node scripts/qa/run-qa.mjs --files src/components/EmailView.tsx -- --list
```

**If you add a new module or view, add a rule for it.** A file matching no rule
is silently not covered by a scoped run — it only gets audited on
`npm run test:qa:full`. See [§8](#8-adding-coverage).

---

## 5. Reading the report

Every run writes to `test-results/` (git-ignored):

| File | What it is |
|---|---|
| `qa-audit-report.md` | **This run.** Summary table, then one block per defect: action / expected / actual / evidence / proposed fix / screenshot |
| `qa-audit-report-latest-full.md` | The last **full** run. A scoped re-run overwrites the file above but never this one |
| `qa-findings.json` | The same data, for tooling |
| `qa-history/` | Timestamped copies of previous reports |
| `screenshots/` | Captured at the moment each defect was observed |
| `../playwright-report/` | Traces and video for failed tests |

A summary also prints in the terminal at the end of every run, so you do not
have to open a file to know whether it was clean.

### Findings are expectations, not symptoms

Each finding says what the crawler did, what should have happened, and what did.
Defect IDs are stable across runs — derived from module + target + action +
category — so `DDOC-9992FBC0` refers to the same defect tomorrow.

The ID prefix tells you the class:

| Prefix | Category | Meaning |
|---|---|---|
| `DDNO` | `DROPDOWN_DID_NOT_OPEN` | The panel never mounted |
| `DDIV` | `DROPDOWN_OPENED_BUT_INVISIBLE` | It mounted with no real size, unpainted, or outside the viewport |
| `DDOC` | `DROPDOWN_OCCLUDED` | Another layer covers it |
| `DDNS` | `DROPDOWN_NOT_SELECTABLE` | It has options, but choosing one doesn't apply |
| `NAV0` / `NAVW` | `NAVIGATION_DID_NOTHING` / `_WRONG_RESULT` | A nav click did nothing, or landed somewhere else |
| `TABW` | `TAB_SWITCH_WRONG_RESULT` | A tab click didn't produce that tab |
| `ERRS` | `ERROR_SCREEN` | An error boundary rendered |
| `BLNK` | `VIEW_RENDERED_EMPTY` | The view mounted with no content |
| `INTF` | `INTERACTION_FAILED` | The click could not be delivered |
| `FLDF` / `SUBW` | `FORM_FIELD_NOT_FILLABLE` / `FORM_SUBMIT_WRONG_RESULT` | A form field or submit misbehaved |
| `MODC` | `MODAL_WOULD_NOT_CLOSE` | A modal stayed open |
| `CONS` / `EXCP` | `CONSOLE_ERROR` / `UNCAUGHT_EXCEPTION` | Runtime noise picked up while acting |

### What is a defect and what is harness noise

Not everything the report lists is an app bug:

- **`INTERACTION_FAILED` at LOW**, after a sticky search/filter bar intercepted a
  click, is a harness scroll artefact.
- **`UNCAUGHT_EXCEPTION` from `shadergradient`** (or anything else thrown inside
  `node_modules`) is third-party noise, reported at LOW.
- **`VIEW_RENDERED_EMPTY` on a register** usually means the fixture has no rows
  for that module — a suite gap. Fix it by adding data to the fixture, not by
  accepting the gap.

The proposed fix in the report is a starting hypothesis, not a verdict. Confirm
it against the source before acting on it.

**Never "fix" a defect by loosening the check.**

### What fails a run

Findings at `QA_FAIL_ON` severity or above throw in the test that found them, so
a run that discovers a real bug exits non-zero instead of printing "12 passed".
The default is `HIGH`. A green full run means nothing at HIGH or above was found.

---

## 6. Test data

The suite never touches a real backend. `tests/e2e/helpers/fixture.ts` mocks
`/sync.php`, `/api/*` and `/upload.php` and seeds a full dataset — clients,
leads, tasks, projects, warehouse items, movements, invoices, documents — so
every register has rows and every detail view is reachable. Writes are
acknowledged and discarded, which is why the crawler is free to submit forms.

Two things to know before editing it:

- `installed: true` is **mandatory** in the payload. `App.tsx` gates
  `applyServerData()` behind that flag, so a payload without it leaves every
  collection empty and the whole suite silently audits empty states.
- If a module reports `VIEW_RENDERED_EMPTY` for its register, add a record for
  it here.

---

## 7. Environment switches

| Variable | Default | Effect |
|---|---|---|
| `QA_FAIL_ON` | `HIGH` | Severity that fails the run. `CRITICAL`\|`HIGH`\|`MEDIUM`\|`LOW`\|`NEVER` |
| `QA_WORKERS` | 2 | Parallel workers. One worker is one Chromium instance |
| `QA_MAX_CORES` | half the machine | Hard CPU ceiling — browsers are pinned to this many cores. `0` disables the cap |
| `QA_VIDEO` | off | `1` records video. Off by default: Playwright must record *every* test to keep the failures, one `ffmpeg` per worker, and traces already show what a defect looked like |
| `QA_RETRIES` | 0 | Playwright retries |
| `QA_RECORDING` | — | Replay a single recording file |
| `BASE_URL` | `http://localhost:5173` | Audit a deployed environment instead of localhost |

```powershell
$env:QA_FAIL_ON = 'MEDIUM'; npm run test:qa:full
```

---

## 8. Adding coverage

### A new module

1. Add it to `MODULES` in `tests/e2e/crawler.spec.ts` (`name`, `hash`, and
   `drilldown: true` if its rows open a detail view).
2. Add a rule to `RULES` in `scripts/qa/run-qa.mjs` mapping its source files to
   that test title — otherwise a scoped run will never pick it up.
3. Make sure `tests/e2e/helpers/fixture.ts` seeds rows for it, or its register
   will report `VIEW_RENDERED_EMPTY`.
4. Add the row to the coverage map in
   `.agents/skills/ccrm-qa-audit/SKILL.md` if it introduces a new *kind* of
   surface rather than another instance of an existing one.

### A recorded user journey

The crawler **discovers** bugs nobody thought to look for. A recording **pins** a
known journey so it can be re-checked cheaply forever — and it lets a
non-engineer contribute a test case without writing code.

1. Chrome → DevTools → ⋮ → More tools → **Recorder** → *Create a new recording*.
2. Perform the journey against `http://localhost:5173`, then stop.
3. **Export** → *JSON*, save it into `tests/recordings/`.
4. `npm run test:qa:recorder`, or one file at a time:
   ```powershell
   node scripts/qa/run-recorder.mjs tests/recordings/my-flow.json --headed
   ```

Target controls **by their field label**, not by "the first listbox" — labels
survive layout changes, ordinals do not. Chrome's full selector vocabulary is
supported (`aria/`, `text/`, `pierce/`, `xpath/`, plain CSS), as are all its step
types, and recorded absolute URLs are rewritten onto the base URL under test.

Replays are not just selector checks: after **every** step the runner re-applies
the error-screen and dropdown-visibility analysis.

Longer walkthrough: [`.agents/skills/ccrm-qa-audit/references/chrome-recorder.md`](../.agents/skills/ccrm-qa-audit/references/chrome-recorder.md).

### A unit test

Anything that is pure logic — permission checks, selectors, formatting — belongs
in a `*.test.ts` next to the module it tests, using Node's built-in runner:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { canEditTask } from './taskSelectors.ts';

test('edit access is scoped to administrators, assignees, and creators', () => {
  assert.equal(canEditTask(task, admin), true);
});
```

`npm run test:unit` picks it up automatically. Note the `.ts` extension in the
import — Node strips the types and needs the real filename.

---

## 9. Troubleshooting

**"Nothing changed that this suite covers"** — the scoped runner found no
changed file matching a rule. Correct if you only touched PHP or docs; if you
edited a component, its rule is missing (§4).

**Every module reports empty registers** — the fixture payload lost
`installed: true` (§6).

**The run says a dropdown is occluded and you can't reproduce it by hand** —
open the trace: `npm run test:qa:report:html`. Occlusion is diagnosed by
resolving both the panel and the covering element to their nearest *stacking
context*, so the report names the layer whose `z-index` has to change, not
whichever button happened to sit under the probe point.

**The audit makes the machine unusable** — lower `QA_MAX_CORES`, or run scoped
instead of full. Measured on a 12-core machine, an uncapped full run took 87% of
the CPU.

**A `vite` process is still burning a core after the run** — the runner sweeps
these on exit, but the QA server is identifiable by its port: it is started with
`--port 5273 --strictPort`, never the `:5173` you develop on.

**The browser is missing** — `npm run test:qa:setup`.

---

## 10. Known gaps

Honest list, so nobody assumes more coverage than exists:

- **No CI.** Everything here is run by hand.
- **No self-check.** The suite used to carry "canaries" — inverted tests that
  *passed* when they found a known product bug, and failed the harness if they
  missed it. Both underlying bugs were fixed and `canary.spec.ts` was deleted
  (commit `636914c`), which is the documented rule, but it leaves the harness
  with nothing proving it can still see a defect. A new canary should be seeded
  against the next known bug.
- **Unit coverage is one file.** `src/utils/taskSelectors.test.ts` is the only
  one. Most logic is only exercised through the browser.
- **Backend is not tested.** No PHP test suite exists; `api/` is only exercised
  indirectly, and the QA suite mocks it away entirely.
- **`#dashboard` and `#tasks` are the same view**, so only `#dashboard` is
  crawled. Navigation still clicks both sidebar items.

---

## 11. Where things live

```
tests/
  e2e/
    crawler.spec.ts        one test per module — the deep audit
    navigation.spec.ts     sidebar and header
    recorder.spec.ts       replays every tests/recordings/*.json
    globalSetup.ts         archives the previous report, clears findings
    globalTeardown.ts      merges worker findings, writes the report, prints the summary
    helpers/
      fixture.ts           the mocked backend and its seed data
      appDriver.ts         session start, navigation, overlay handling
      uiExplorer.ts        the crawler — what gets clicked and what is asserted
      diagnostics.ts       dropdown geometry, occlusion, stacking contexts
      reportCollector.ts   findings, severities, IDs, markdown generation
      gate.ts              which severity fails the run
      chromeRecording.ts   Chrome Recorder JSON → Playwright actions
  recordings/              exported Chrome DevTools Recorder journeys
scripts/qa/
  run-qa.mjs               scope selection, CPU capping, orphan cleanup
  run-recorder.mjs         replay a single recording
  open-report.mjs          open the markdown report
playwright.config.ts       timeouts, workers, viewport, dev server
tsconfig.qa.json           type-checks the suite
.agents/skills/ccrm-qa-audit/
  SKILL.md                 the coverage contract + rules for AI agents
  references/chrome-recorder.md
```

**Related:** [`.agents/skills/ccrm-qa-audit/SKILL.md`](../.agents/skills/ccrm-qa-audit/SKILL.md)
is the machine-facing companion to this document. It declares the coverage
ladder — every surface a full run must exercise — and the rules an AI agent must
follow when it is asked to test the app. Keep the two in step: if you change what
the suite covers, both need the edit.
