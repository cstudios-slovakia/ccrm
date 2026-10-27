---
description: Run the QA audit when a feature or fix is finished, before committing the build
---

# Test Before You Ship

Full guide: [`docs/TESTING.md`](../../docs/TESTING.md).

## 1. The rule

When a feature, fix or UI change is **finished**, before the version bump and
the build commit:

1. Type-check and run the unit tests:
   ```bash
   npx tsc -p tsconfig.app.json --noEmit
   npm run test:unit
   ```
2. Run QA on **your own files only**, never plain `npm run test:qa`. Redirect the
   output to a log file and read it (no `tail`/`head` pipes):
   ```bash
   QA_WAIT_MIN=10 node scripts/qa/run-qa.mjs --files <files you changed> > qa.log 2>&1
   ```
3. Act on the exit code:
   - **0** - commit as usual.
   - **1** - findings. Triage and fix under the rules in section 5: never loosen
     a check; a run that hit its cap or ran under load is load, not evidence.
   - **2** (not admitted within 10 min), **or** the shell tool cut the call off
     before a verdict, **or** the user said to skip QA - commit anyway with a
     line `QA: pending` in the commit message body (above the co-author
     trailers), and tell the user in the reply.
   - **3** (refused a full run) - `--files` was missing; re-run with it. Run the
     full suite only when the user asks.
4. Pending work is covered later in one batch: `npm run test:qa:pending` (the
   user runs it when the sessions are done) or CI on the PR.

This slots into [`commit-and-versioning.md`](./commit-and-versioning.md) as the
step before it:

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
| The MCP gateway (`public/api/mcp*.php`) or a formula it ports (`financialOverviewTable`, `recurringExpenses`, `futureMovements`, `projectBilling`, `equationEvaluator`) | `npm run test:mcp` — which tools a key may call, field stripping, TypeScript↔PHP parity and write paths against a scratch database (TESTING.md 5d) |
| Permissions, the role matrix, `read_scope.php`, `sync.php` filtering, or any endpoint that reads CRM data for a user | `npm run test:rbac` - per-role read and write checks on the real server against a scratch database; the mocked QA suite cannot see server-side leaks (TESTING.md 5e) |
| Anything else, finished | `node scripts/qa/run-qa.mjs --files <files you changed>` |

The runner maps your files to the tests that cover them, usually seconds to a
couple of minutes. If the selection would be the full suite (you touched
`scripts/qa/`, `playwright.config.ts` or `tests/e2e/helpers/`, or named no
files on a branch far from its base) it refuses with exit code 3 instead of
starting.

**Never run `npm run test:qa:full` on your own initiative.** It's a ~30-minute
run reserved for a human asking for it explicitly. If you think a change's
blast radius genuinely needs more than the scoped run covers, say so and ask
before running it.

## 2b. One run at a time, and only your own scope

Several sessions share this machine and often this checkout. Every one of them
following this rule at once is what overloaded it, so `scripts/qa/run-qa.mjs`
admits one run at a time. The rules that go with it:

- **If it prints `Waiting: ...`, wait** - up to the 10 minutes `QA_WAIT_MIN=10`
  allows, then see exit code 2 above. Never kill the other run, never sweep
  processes by port, never set another `QA_PORT` to run beside it.
- **Never start a QA run as a background task.** A backgrounded shell task that
  gets cut off kills the run halfway. Run it in the foreground and read the
  verdict.
- **Name your files** (`--files`). Plain `npm run test:qa` diffs the whole
  working tree, so its scope is every session's changes, not yours.
- **Pure logic needs no browser.** A change confined to `src/utils` is covered by
  `npm run test:unit`; the scoped run would only add the shell tests.
- **Do not pipe the runner through `tail` or `head`.** The output then only
  appears when the run ends, so you cannot see `Waiting:`, the scope line
  (`Scope: FULL SUITE` means stop and reconsider) or progress.
- A run that hits its time cap (15 min scoped, 45 full) or reports defects while
  other runs were live is **load, not evidence** - re-run it alone before
  touching product code.

## 3. It also runs without you

- `npm run deploy` runs the gate first and **aborts the deploy** if it fails.
  `DEPLOY_SKIP_QA=1` is the hotfix escape hatch — it means shipping unverified.
- GitHub Actions (`.github/workflows/qa.yml`) runs it on PRs and on pushes to
  `main`, scoped against the PR base or the previous commit.

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
