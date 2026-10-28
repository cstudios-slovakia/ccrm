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
| `npm run test:qa:pending` | The commits made with a `QA: pending` line, run in one batch | minutes |
| `npm run test:qa:nav` | Shell navigation and header controls | ~1 min |
| `npm run test:qa:crawler` | Per-module deep audit | minutes |
| `npm run test:qa:recorder` | Chrome Recorder replays | ~1 min |
| `npm run test:qa:dark` | Dark-mode legibility on every module | ~30s |
| `npm run test:qa:viewsize` | View size: every module at 390 / 1440 / 1920 / 2560 (text floor, overflow, unused width, truncated controls, aside unchanged); report in `test-results/view-size-report.md` | minutes |
| `npm run test:qa:license` | Licensing banner, settings tab, and that a lapsed licence disables nothing | ~35s |
| `npm run test:qa:headed` | Full run with a visible browser | minutes |
| `npm run test:qa:report` | Open the latest report | — |
| `npm run test:qa:report -- --list` | List saved runs | — |
| `npm run test:qa:report:html` | Playwright traces and video | — |
| `npm run test:qa:typecheck` | Type-check the suite itself | seconds |

**`npm run test:qa` is scoped, not full.** `scripts/qa/run-qa.mjs` diffs the
working tree (and any unpushed commits) against the nearest of `origin/<branch>`
/ `origin/main` / `origin/dev` (fewest commits ahead; `--since` overrides), maps changed files to the test titles that cover them, and runs
only those. It prints the scope and the reason on every run. It escalates to a
full run on its own only when the change touches real harness plumbing —
`playwright.config.ts`, `scripts/qa/`, or the shared fixtures under
`tests/e2e/helpers/`, `globalSetup.ts`, `globalTeardown.ts`. Adding or
editing any spec file — a journey spec like `projectRating.spec.ts`, or one of
the suite-wide `crawler.spec.ts` / `darkmode.spec.ts` / `navigation.spec.ts` —
scopes to that spec's own tests, so `--files tests/e2e/navigation.spec.ts`
re-runs its 2 tests, not all 87.

**A full run is never started by accident.** When the selection would be the
full suite and neither `--full`, `QA_ALLOW_FULL=1` nor `CI` is set, the runner
prints why (the forcing files and the base) and exits with code 3 without
starting a browser. This covers `npm test` too. Agents pass `--files`.

**Exit codes:** `0` passed or nothing to test, `1` defects or failed tests,
`2` not admitted (lock, RAM or port wait timed out), `3` refused a full run.

**`QA: pending`.** A session that cannot get a verdict (exit 2, a cut-off call,
or "skip QA") commits with a `QA: pending` line in the message body.
`npm run test:qa:pending` later runs, in one batch, the files of those commits
since the last passing batch (a marker in the git common dir, shared by every
worktree). Because a commit touching `scripts/qa/` forces the full suite, that
batch then needs `QA_ALLOW_FULL=1 npm run test:qa:pending`.

**Run `npm run test:qa:full` only when a human asks for it.** AI agents should
run `node scripts/qa/run-qa.mjs --files <files they changed>` after finishing a
change and never reach for `:full` on their own just to "be thorough" — that turns a routine change into a
~30-minute run for no extra signal, since the scoped run already covers what
changed. Ask the user first if you think a full run is warranted (e.g. a change
whose blast radius the scoping table can't express).

**Agents: always name your files.** `npm run test:qa` diffs the *whole*
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
- The whole run is capped: **15 minutes scoped, 45 full** (or when the scope
  includes the per-module crawler or dark-mode sweep)
  (`QA_GLOBAL_TIMEOUT_MS`). A run that needs longer is starved, not thorough.
- It gives up after `QA_WAIT_MIN` minutes (default 30) with exit code 2 and
  runs nothing, rather than start a run whose findings would be noise. Agents
  set `QA_WAIT_MIN=10` and commit with `QA: pending` instead of waiting longer.

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
| `QA_ALLOW_FULL` | off | `QA_ALLOW_FULL=1` lets a selection that is the full suite start (the deploy gate sets it; CI needs no switch). |
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

## 5c. The persistence probe: did it actually land in MySQL?

```bash
npm run test:persistence        # needs the local Docker backend on :8086
```

`scripts/probe-persistence.mjs` logs in to the **real** local backend as a
throwaway admin, POSTs to `sync.php`, then GETs and checks that what comes
back is what was sent, under the same keys. It covers creates, edits, named
deletes (including the last-item cases) and the custom-attribute round-trip
for projects: attribute values, file slots and timeline attributes must come
back under the exact attribute ids the client uses.

It exists because the QA suite **mocks** `sync.php`, so the QA suite can
never see a value that the browser sends correctly and the server stores under
one name and reads back under another. That is exactly how project custom
fields "vanished after a hard refresh" in 1.9.82 — the value was in the
database the whole time.

Run it after any change to how `sync.php` (or `api/*.php`) stores or
reads back a field, and after adding a column, a JSON blob or a dynamic table.
It is outside `npm test` for the same reason as 5b: it needs Docker + MySQL.
It cleans up every row and table it created, prefix `ccrm-del-probe-`.

## 5d. The MCP probe: what can an AI key read and write?

```bash
npm run test:mcp        # needs `docker compose up` (containers crm + ccrm-db-1)
```

`scripts/probe-mcp/run.mjs` exercises the MCP gateway (`public/api/mcp*.php`) on
real PHP and MySQL. It **never touches the dev data**: it clones the dev
database into a scratch schema (`ccrm_mcp_probe`), serves a copy of
`public/api` from `/var/www/html/mcpprobe` in the dev web container, seeds
four users (Admin and three roles with nothing / view / edit on every module)
and their keys, and drops the schema and the directory when it finishes.

Three groups of checks, about 130 in all:

1. **Authorization** — which tools each role sees in `tools/list` and may call
   (`-32003` otherwise), that every tool in the source is in the permission
   table, field stripping (`pin`, salaries) without `employees.salaries`,
   `tasks.view_all`, revoked keys, keys older than a password reset, no
   wildcard CORS, no SQL in error messages, and a source scan proving no MCP
   file contains `DELETE FROM`, `TRUNCATE` or `DROP TABLE`.
2. **Parity** — the PHP finance maths against the TypeScript originals on one
   fixture (`scripts/probe-mcp/fixture.mjs`): the overview table
   (`aggregateOverviewTable`, recurring rules included), project billing
   (`projectBilling`, `resolveProjectValue` incl. money attributes), the
   cash-flow forecast (`projectFutureMovements`) and the simplified-table
   equation evaluator. If you change one side of a ported formula, this fails
   until you change the other.
3. **Write paths** — invoices (numbering, net/VAT maths, ledger link, no
   orphan on failure), stock (weighted average cost, no overselling), payroll
   (ledger mirror, paid periods are final), leads (stage guard, history),
   projects (configured statuses, finish date), tasks, vacations.

Run it after any change to `public/api/mcp*.php`, and when a formula it ports
changes (`financialOverviewTable.ts`, `recurringExpenses.ts`,
`futureMovements.ts`, `projectBilling.ts`, `equationEvaluator.ts`). It is
outside `npm test` for the same reason as 5b and 5c: it needs Docker + MySQL.

## 5e. The RBAC probe: does the server really hold the line?

```bash
npm run test:rbac       # needs `docker compose up` (containers crm + ccrm-db-1)
```

`scripts/probe-rbac/run.mjs` proves that **the server** enforces the role
matrix, which the mocked QA suite cannot see. Like 5d it never touches the dev
data: it clones the dev database into a scratch schema, serves a copy of
`public/` from a scratch directory in the dev web container, seeds one user per
role (Admin, Project Manager, Employee, a restricted custom role, a role with
no edit rights, a role with every module off) and drops everything afterwards.
It logs in as each of them and inspects raw response bodies and the database.

Groups of checks, about 190 in all:

1. **R - read scope.** What `sync.php` GET, `my_employment.php`, the private
   document endpoint and the gated AI / search / dashboard / report /
   integration endpoints return per role: no hidden collection, field or row
   appears anywhere in the body (not just in the fields the UI renders), and
   Admin and Project Manager answers match the last unfiltered `sync.php`.
2. **W - write scope.** Forged `sync.php` POSTs and direct endpoint calls leave
   the database unchanged: tasks, leads and clients outside the visible set,
   salaries, PIN, leave approval, role registry, the user link, own-account
   rename / e-mail change, masked time-tracking tokens.
3. **M - migrations.** The Employee role is added once and an existing role of
   that name is left alone; `employees.user_id` is added with its unique index
   and foreign key, twice in a row.
4. **T - orders and tickets** (`T-R`, `T-W`, `T-X`, `T-E`). Four extra roles (`TicketsNothing`, `TicketsView`,
   `TicketsEdit`, `TicketsFull`) against `orders` / `tickets`: what `sync.php` sends (and the raw body
   leaks), what a forged POST can create, change or delete, the ticket data carried by tasks, projects, leads
   and settings, `orders.php` / `tickets.php`, and that the public status board and widget still answer
   without a session. The probe migrates the scratch copy first, because the dev database may predate Mango.
5. **P1 - parity.** TypeScript and PHP permission registries and the Employee
   role map are identical (`src/utils/permissions.test.ts`).

Run it after any change to `permissions.ts` / `permissions.php`,
`read_scope.php`, `sync.php`, `my_employment.php`, `employee_file*.php`,
`upload.php`, or any endpoint that reads CRM data on behalf of a user. It is
outside `npm test` because it needs Docker + MySQL. A new permission is not
done until it has a read check and a write check here (see
`docs/db_integration_notes/RBAC_SYSTEM.md`, "Adding a permission").

### 5f. Passkeys / WebAuthn ceremony tests (`npm run test:passkeys`)

Runs headless verification of WebAuthn options generation, serialization/deserialization, challenge expiration and single-use lifecycle, and AAGUID lookup without requiring a database or browser:

```bash
npm run test:passkeys
```

### 5f-2. Background mail filing (`npm run test:mail-filing`)

`api/mail_filing.php` reads the company mailboxes and every user's mailbox over IMAP and files mail from or to a known customer onto that customer's timeline. The matching rules and the attachment storage rules (storage-name validation, what the client may see of an attachment list) run on their own (`npm run test:mail-filing`, no database, no mail server). The whole job (chunked backlog, new mail, Sent, one message in two mailboxes, the removed-entry tombstone, a mailbox with a wrong password, agreement with the live read) needs a plain-text IMAP server and a scratch database. A throw-away Dovecot on the dev compose network does it; the script appends its own test mail with IMAP APPEND:

```bash
# a Dovecot with users info@test.local, steel@test.local, broken@test.local, all with the password "secret"
docker run -d --name imaptest --network ccrm_default --network-alias imaptest \
  -v <dovecot.conf>:/etc/dovecot/dovecot.conf:ro -v <users>:/etc/dovecot/users:ro dovecot/dovecot:2.3-latest
docker exec -u root imaptest sh -c 'chown vmail:vmail /var/mail && chmod 775 /var/mail'

# run it inside the `crm` container (it has the PHP IMAP extension), against a scratch database
docker cp scripts/test-mail-filing.php crm:/tmp/tmf.php
docker exec -e CCRM_API_DIR=/var/www/html/api \
  -e "CCRM_TEST_DSN=mysql:host=db;dbname=a3_scratch;charset=utf8mb4" -e CCRM_TEST_USER=root -e CCRM_TEST_PASS=<root password> \
  -e CCRM_TEST_IMAP_HOST=imaptest crm php /tmp/tmf.php
```

The Dovecot config is the minimum (`protocols = imap`, `ssl = no`, a passwd-file `passdb`, a static `userdb` for `vmail`, `mail_location = maildir:/var/mail/%n/Maildir`, a `Sent` mailbox with `special_use = \Sent`). The script drops every table of the scratch database, so never point it at real data.

### 5h. AI price-offer template generator (`npm run test:pdf-template`)

`api/generate_pdf_template.php` turns a sample offer PDF into a template. `scripts/test-pdf-template.php` checks, with no database and no OpenAI, the part that makes model output safe to store (enums, hex colours, heading length, the guaranteed block set) and that a client-supplied `pdfUrl` can only ever reach a `custom-template-pdf_*.pdf` inside the uploads directory. It needs PHP, so without a local install run it in the dev container: `docker cp scripts/test-pdf-template.php crm:/tmp/t.php && docker exec -e CCRM_API_DIR=/var/www/html/api crm php /tmp/t.php`. The call to OpenAI itself is only exercised live (needs a key in Settings → AI integration); the browser flow around it (error toast, no template added, rename dialog) is mocked in `tests/e2e/priceOfferInlineEditor.spec.ts`, and the `layout_json` round trip through `sync.php` is in `npm run test:rbac` (checks `T1`–`T6`).

### 5g. Module screenshots (`npm run shots:modules`)

The module setup wizard shows a real screenshot of every module. They are
generated, not drawn:

```bash
npm run shots:modules                       # all modules -> public/module-screenshots/<id>.webp
npm run shots:modules -- --only leads,tasks # a few
```

`scripts/capture-module-screenshots.mjs` starts Vite on the QA port, installs the
**QA fixture's** mocks (`tests/e2e/helpers/fixture.ts` - no PHP, no database, no
real data; the release-notes CMS is mocked inside the script with invented
notes), and photographs each module's landing view in light mode at 1440x900,
cropped to the workspace area at 16:10 and encoded as WebP of at most 150 KB.
It takes the same machine-wide lock as a QA run, so it queues behind one.

It asserts nothing. **Look at every image** it writes - an empty state, a
spinner, a toast or an open popover means re-shooting - and commit the result.
The files ship because Vite copies `public/` into `dist/` and `php ccrm update`
publishes `public/*` to the docroot (`scripts/sync-backend.mjs` only mirrors
files that already have a root counterpart, so these are untouched by it).

Re-run it after a visible redesign of a module; the wizard falls back to an
icon card for any module whose image is missing.

---

## 6. When to run what

| Situation | Run |
|---|---|
| Mid-change, want fast feedback | `npm run test:unit` |
| Touched passkeys (`api/passkeys*.php`) | `npm run test:passkeys` |
| Touched mail filing (`api/mail_filing.php`, `company_mailboxes.php`, the filing part of `mail_broker.php`) | `npm run test:mail-filing`, and with a test IMAP server the whole job (see 5f-2) |
| Touched a specific module's UI | `npm run test:qa:crawler` |
| Touched navigation, the sidebar or the header | `npm run test:qa:nav` |
| Touched licensing (`api/license*.php`, the token format) | `php scripts/test/license-verification.php` |
| Touched how `sync.php`/`api/*.php` stores or reads back a field | `npm run test:persistence` — GET-after-POST against the local Docker backend (see 5c) |
| Touched the MCP gateway (`public/api/mcp*.php`) or a formula it ports | `npm run test:mcp` — roles, field stripping, TS↔PHP parity and write paths on a scratch database (see 5d) |
| Touched permissions, `read_scope.php`, or who may read or write what on the server | `npm run test:rbac` - per-role read and write checks against a scratch database (see 5e) |
| **Finished a feature or a fix** | **`QA_WAIT_MIN=10 node scripts/qa/run-qa.mjs --files <your files>`** — agents always pass `--files`; the automatic diff scopes to everyone's changes |
| QA could not run (exit 2, cut off, told to skip) | commit with a `QA: pending` line; the batch is `npm run test:qa:pending` |
| Another run is live (`Waiting:` printed) | nothing — it queues and starts when the other run ends |
| Changed only pure logic in `src/utils` | `npm run test:unit` is enough; the scoped run adds only the shell tests |
| You want everything run, on purpose | `npm run test:qa:full` — **ask the user first; don't default to this** |
| About to deploy | automatic — `npm run deploy` gates on it (may run the full suite) |
| Opened a PR / pushed to `main` | automatic — GitHub Actions runs it |

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

`.github/workflows/qa.yml` runs `npm run test:unit` and the QA audit on pull
requests and on pushes to `main` (and by hand). It checks out full history and
scopes the audit by event: a PR against `origin/<base branch>`, a push against
the commit before it, and the full suite for a manual run or a push whose
previous commit is unknown (first push, force-push). The full-run guard is off
in CI, so a PR that touches the harness gets the full suite there. It needs no
secrets and no database — the backend is mocked.

CI runs **the same npm scripts you run locally**, so a red build reproduces with
one command on your machine. The workflow also uploads `test-results/runs/` and
`playwright-report/` as downloadable artifacts, so you can read the report and
its screenshots without cloning anything.
