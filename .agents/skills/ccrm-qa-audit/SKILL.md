---
name: "ccrm-qa-audit"
description: "Automated browser QA for CCRM: autonomous UI crawler that proves every action produces its expected result, plus Chrome DevTools Recorder replay. Use when asked to test the app, audit buttons/forms/dropdowns, hunt for UI regressions, or verify recent changes."
---

# CCRM Automated QA Audit

Drives the real app in a real browser and reports every action whose **actual**
result differed from its **expected** result, with a proposed fix.

This is **not** "click every pixel". Coverage is a declared ladder (below). If a
surface is not on the ladder, it is a suite gap, not a silent pass.

---

## 1. Running it

```powershell
npm run test:qa:setup     # once per machine — downloads the Chromium build
npm run test:qa           # only the tests covering what you changed
npm run test:qa:full      # the whole audit — ask for this on purpose
```

**`npm run test:qa` is scoped, not full.** It asks git what changed, maps those
files to the tests covering them (`scripts/qa/run-qa.mjs`), and runs only those.
Editing `EmailView.tsx` runs one test instead of fourteen. Editing `App.tsx`,
`src/utils/` or anything under `src/components/ui/` cannot be attributed to one
module, so it runs the shell tests — navigation, header, recordings — rather
than the whole crawler. Changing the harness itself (`tests/e2e/`,
`playwright.config.ts`, `scripts/qa/`) escalates to a full run, since the code
choosing the subset is the code that changed. Changing only PHP or docs runs
nothing and starts no browser at all.

A scoped run is a filter, never a verdict on the rest of the app. Before a
release, a deploy, or any "is everything still fine?" question, run
`npm run test:qa:full`.

`node scripts/qa/run-qa.mjs --files src/components/EmailView.tsx -- --list`
prints what a given change would run, without opening a browser.

The dev server starts automatically (`reuseExistingServer` is on, so an already
running `npm run dev` is reused). A full run takes a few minutes.

| Command | Scope |
|---|---|
| `npm run test:qa` | **Only what changed** (see above) |
| `npm run test:qa:full` | Everything (updates `qa-audit-report-latest-full.md`) |
| `npm run test:qa:module Warehouse` | One named module |
| `npm run test:qa:nav` | Shell navigation and header controls only |
| `npm run test:qa:crawler` | Per-module deep audit only |
| `npm run test:qa:recorder` | Chrome Recorder replays only |
| `npm run test:qa:headed` | Same as full, with a visible browser |
| `npm run test:qa:report` | Open `test-results/qa-audit-report.md` |
| `npm run test:qa:report:html` | Playwright traces / video |
| `npm run test:qa:typecheck` | Type-check the suite itself |

Environment switches:

- `QA_FAIL_ON=CRITICAL|HIGH|MEDIUM|LOW|NEVER` — severity that fails the run (default `HIGH`).
- `QA_WORKERS=n` — parallel workers (default 2).
- `QA_MAX_CORES=n` — hard CPU ceiling; browsers are pinned to `n` cores (default: half the machine, `0` disables).
- `QA_VIDEO=1` — record video. Off by default: playwright records *every* test to
  keep the ones that fail, one `ffmpeg` per worker, and traces already show what
  a defect looked like.
- `QA_RECORDING=path.json` — replay a single recording.
- `BASE_URL=…` — audit a deployed environment instead of localhost.

**A defect fails the run.** Findings at `QA_FAIL_ON` or above throw in the test
that found them (except canaries, which *pass* when they find their known bug).
A green full run means nothing at HIGH or above was found.

Canaries are inverted: they **fail the harness** if the known bug is missed.
Do not fix Čas termínu or the Silvia `?tab=` parser to make canaries green.
If those product bugs are fixed, **delete the canary**.

---

## 2. Output

- `test-results/qa-audit-report.md` — this run: summary table, then one block per
  defect with action / expected / actual / evidence / **proposed fix** / screenshot.
- `test-results/qa-audit-report-latest-full.md` — last **full** `npm run test:qa`.
  A Clients-only re-run overwrites the current file but not this copy.
- `test-results/qa-history/` — timestamped copies of previous reports.
- `test-results/qa-findings.json` — the same data for tooling.
- `test-results/screenshots/` — captured at the moment each defect was observed.
- `playwright-report/` — traces and video for failed tests (`npm run test:qa:report:html`).

Defect IDs are stable across runs (derived from module + target + action +
category), so `DDOC-9992FBC0` refers to the same defect tomorrow.

---

## 3. Coverage map

Every full run must exercise these surfaces. Anything else is out of scope
until it is added here.

| Layer | What is clicked | Spec |
|---|---|---|
| Shell | Every sidebar nav button (by click, not by URL). Re-clicking the open item is a no-op. | `navigation.spec.ts` |
| Header | Every header control; something visible must happen (panel, overlay, or view change). | `navigation.spec.ts` |
| Module landing | Each crawled hash: content rendered, no error screen, no blank view. | `crawler.spec.ts` |
| Tabs | Every tab strip on the landing view, including the already-open tab (this app rewrites `?tab=` on re-click). | `crawler.spec.ts` |
| First-row detail | First register row → detail view → its sub-tabs → `#record?tab=` deep link. | `crawler.spec.ts` (`drilldown`) |
| Create form | Labeled create buttons (header + main) before Plus-icon-only. Fill every field. **Every** dropdown in the form (no cap). Submit. | `crawler.spec.ts` |
| Edit drawer | One edit control per module (pencil / "Upraviť"). Dropdowns inside, no submit. | `crawler.spec.ts` |
| Page filters | Filter / status dropdowns on the landing view, capped (they mutate the view). | `crawler.spec.ts` |
| Known bugs | Čas termínu occlusion; Silvia timeline `?tab=` error screen. | `canary.spec.ts` |
| Pinned journeys | Chrome Recorder JSON in `tests/recordings/`. | `recorder.spec.ts` |

`#dashboard` and `#tasks` are the same view. Only `#dashboard` is crawled;
navigation still clicks both sidebar items.

Modules crawled: Dashboard, Leads, Clients, Projects, Warehouse, Financial,
Meetings, Files, Email, Automation, Updates, Settings.

---

## 4. What each check asserts

Every check is written as an expectation, never as a bare symptom.

**Dropdowns** get the deepest treatment, because "looks opened but it's not
visible" is the bug class this suite was built for. For each one: does the
panel mount, does it have real dimensions, is it painted, is it inside the
viewport, is any part of it covered by another layer, is it cropped by an
overflow ancestor, does it have options, and does choosing one apply it.
Geometry is only read after the enter animation has settled.

Occlusion is diagnosed by resolving **both** the panel and the covering element
to their nearest *stacking context* (`tests/e2e/helpers/diagnostics.ts`), so the
report names the layer whose z-index has to change rather than whichever button
happened to be under the probe point.

`INTERACTION_FAILED` at **LOW** after a sticky search/filter bar intercepts a
click is a harness scroll artefact. `UNCAUGHT_EXCEPTION` from `shadergradient`
(and other `node_modules` throws) is **LOW** third-party noise. Do not treat
those as product defects.

---

## 5. Chrome DevTools Recorder

Recording and crawling do different jobs. The crawler **discovers** bugs nobody
thought to look for. A recording **pins** a known journey so it can be re-checked
cheaply forever — and lets a non-engineer contribute a test case without writing
code.

To add one:

1. Chrome → DevTools → ⋮ → More tools → **Recorder** → *Create a new recording*.
2. Perform the journey, stop, then **Export** → *JSON*.
3. Save it into `tests/recordings/`.
4. `npm run test:qa:recorder`.

Target controls **by field label**, not by "first listbox". The bundled
`add-task-deadline-time.json` starts on the dashboard, fills every create-task
field, and clicks **Čas termínu** by its label.

Real Chrome exports are supported, including all of Chrome's selector dialects
(`aria/`, `text/`, `pierce/`, `xpath/`, plain CSS) and step types (`navigate`,
`click`, `doubleClick`, `hover`, `change`, `keyDown`/`keyUp`, `scroll`,
`waitForElement`, `waitForExpression`, `setViewport`). Recorded absolute URLs are
rewritten onto the base URL under test.

Replays are not just selector checks: after **every** step the runner re-applies
the error-screen and dropdown-visibility analysis.

---

## 6. Test data

The suite never touches a real backend. `tests/e2e/helpers/fixture.ts` mocks
`/sync.php`, `/api/*` and `/upload.php` and seeds a full dataset — clients,
leads, tasks, projects, warehouse items, movements, invoices, documents — so
every register has rows and every detail view is reachable. Writes are
acknowledged and discarded, which is why the crawler is free to submit forms.

Two things to know when editing it:

- `installed: true` is **mandatory**. `App.tsx` gates `applyServerData()` behind
  that flag, so a payload without it leaves every collection empty and the whole
  suite silently audits empty states.
- If a module reports `VIEW_RENDERED_EMPTY` for its register, add a record for it
  here rather than accepting the gap.

---

## 7. Instructions for AI agents

When asked to test the app, audit buttons, or check for UI errors:

0. **Pick the scope deliberately, and say which you ran.** `npm run test:qa`
   covers what changed and is the right answer for "does my change work?".
   `npm run test:qa:full` is for "is the whole app still fine?" — a release, a
   deploy, or an explicit request for a full audit.

   A full run drives parallel Chromium instances; measured on a 12-core machine
   it took 87% of the CPU for several minutes and made the desktop unusable. Do
   not start one to check a one-module edit, and do not start one unprompted
   after every change. If you think a full run is warranted and the user did not
   ask for one, say so and let them decide.

1. Run `npm run test:qa` (add `npm run test:qa:setup` first if Chromium is missing).
2. Read `test-results/qa-audit-report.md` — start with the summary table.
   If this was a partial run, also read `qa-audit-report-latest-full.md`.
3. For each defect, open the screenshot and trace the finding to the component in
   `src/`. The report's proposed fix is a starting hypothesis, not a verdict:
   confirm it against the source before acting.
4. Report back as **observed symptom → root cause → proposed fix**, grouped by
   root cause rather than by defect, since one cause usually produces several
   findings (a single z-index mismatch surfaces as every dropdown in that drawer).
5. Distinguish app defects from suite gaps. `INTERACTION_FAILED` at LOW severity
   and `VIEW_RENDERED_EMPTY` on a register usually mean the harness needs work,
   not the app. Third-party `shadergradient` throws are LOW noise.
6. Do not "fix" a defect by loosening the check.
7. Do not fix Čas termínu or the client `?tab=` parser unless the user asked to
   fix those product bugs. They are oracles for the canaries.
