# Handoff: finish PR #63 (stored-vs-derived audit fixes)

Paste everything below the line into a fresh session (Opus or Sonnet). Repo: `C:\Users\peter\Work\02_Cstudios_Software_Solutions\Other_web_apps\ccrm\ccrm-app`. Read `CLAUDE.md` first.

---

## Situation

PR **#63** (`integration-stored-vs-derived` -> `1.13-nectarine`, https://github.com/cstudios-slovakia/ccrm/pull/63) holds the fixes from `docs/audits/stored-vs-derived-audit.md` (47 findings, five slices: tasks/automation, finance, HR/payroll, warehouse/support, CRM/projects). The audit report and `docs/prompts/*` are **untracked in the main checkout** (not in the PR); read the audit there.

The branch lives in a worktree: `.claude\worktrees\integration` (HEAD = `73614761`). Work there, not in the main checkout. The main checkout has another session's uncommitted `src/App.tsx` / `src/components/FinancialManagementView.tsx` edits and untracked `recurringRuleDeletion.ts` / `recurringExpenses.ts`; do not touch, stash or reset it.

State of the branch (all verified on the combined code):
- `npm run typecheck` and `npm run test:qa:typecheck`: clean. `npm run test:unit`: 1404 pass, 0 fail, 5 skipped.
- PHP lint (docker, `php:8.3-cli`) on all changed `public/**/*.php`: clean. `npm run sync:backend`: root mirrors in sync.
- Commits on top of `origin/1.13-nectarine`: the five fix slices (three merged, two cherry-picked, see step 3), a baseline snapshot commit `66b25211`, a merge of `origin/1.13-nectarine`, and two QA-only commits (`15d785b2` stickyTableHead type fix, `73614761` projectFiles uses `role="tab"`).

## What is left (do in this order)

### 1. Check whether the base moved
`git fetch origin`, then `git merge-base --is-ancestor origin/1.13-nectarine HEAD`. On 2026-11-06 origin was `495ff448` (v1.13.62) and the **user's local** `1.13-nectarine` was a different commit `7d565ef1`, also labelled v1.13.62. If origin moved, merge it into the branch and re-run the checks above. Do not touch the user's local branch.

### 2. Decide what lands: the baseline snapshot commit
Commit `66b25211` ("snapshot uncommitted materializer work") copies the user's **uncommitted** `recurringRuleDeletion.ts` (+ test), `recurringExpenses.ts` (+ test) and their `App.tsx` / `FinancialManagementView.tsx` edits, so the finance fixes could build on them. If the user has since committed that work to `1.13-nectarine`, the merge will conflict or duplicate. Resolve in favour of the user's committed version and keep the finance fixes (`15b01533`, `f1130e4d`, `a6233375`, `cd0d88d6`, `aac63832`). Ask the user only if the two versions of the materializer differ in behaviour.

### 3. Two slices were written against 1.12-mango
Warehouse/support (`7f143c00`) and CRM/projects (`bea9ba97`) were developed and tested on 1.12 code, then cherry-picked with hand-resolved conflicts (`schema.php`, `SettingsView.tsx`, `ProjectSettings.tsx`, `App.tsx`, `ClientsView.tsx`, `OrdersView.tsx`, two test files). Their earlier QA results do not describe 1.13. Review those two diffs once against 1.13 intent. For example, `ccrm_seed_default_tickets` no longer exists in 1.13, so `ccrm_backfill_ticket_resolve_due` is called right after `ccrm_migrate_tickets`.

### 4. Checks that were never run (need a scratch DB, never a real one)
- The PHP scripts the agents added (`scripts/test-task-automation.php` and the payroll/finance ones: `ls scripts/test-*.php`), plus `npm run test:mcp` and `npm run test:persistence` (see `docs/TESTING.md`).
- The combined schema migrations were never run together. Run `ccrm_apply_schema()` on a **fresh** and on a **1.12-shaped** scratch database (docker mysql:8.0 and mariadb:11) and confirm a second run does nothing. New schema: `financial_records.recurring_materialized_through`, `employee_salaries.closed_at` / `closed_by`, and the project-type FK `RESTRICT` migration `ccrm_migrate_project_type_fk_restrict`.
- Local QA is blocked on this machine (16 GB, chronically under 1.5 GB free: the QA gate `QA_MIN_FREE_MB` refuses to start and Claude Code reaps background shells). **Use CI**: the PR runs the scoped QA on every push (15-minute limit, so some of the scoped tests may not run). `gh run list --branch integration-stored-vs-derived`, `gh run view <id> --log-failed`.

### 5. Known red CI tests are pre-existing on `origin/1.13-nectarine`
Verified on CI with throwaway PRs. Do **not** treat these as regressions and do not loosen checks to hide them:
- crawler "Leads / Pipeline": the dropdown "Obľúbené leady vždy ako prvé" does not open (HIGH, fails on base too).
- `whatsappDemo` "Tasks: nine tasks across the four chats..." (expected 8, received 4; fails on base).
- `navigation` "every sidebar nav button opens a working view": lazy views render about 18 characters, a different set each run (flaky).
- `holdToConfirm`: 3-5 of about 17 tests fail per run, different ones each time, on base and on the PR code alike (the hold counts animation frames; CI is slow).
- `projectStatuses` x2 and `projectRating` sort: failed locally and in CI. The CRM agent said `projectStatuses` is in `known-failing.json` (that file exists on 1.12, **not on 1.13**) and `projectRating` passed on re-run. Re-check on base if it matters.

List them in the PR description as pre-existing. Fixing them is optional and separate from this PR (ask the user first). `projectFiles` was fixed here only because it was a trivial stale selector.

### 6. Finish the release the repo's way
Read `.agents/rules/commit-and-versioning.md`, `qa-before-ship.md`, `post-build-cleanup.md`. Order: **test -> bump version -> changelog -> build -> commit**.
- Bump `src/utils/version.ts` once for the whole PR (it says `1.13.62-Nectarine` on the branch; take the next number after whatever is on origin or the user's branch at that moment) and add one changelog entry listing the five slices. Find the 1.13 changelog file.
- `npm run build` rewrites the committed `dist/`. Only run it if the user wants the deployment bundle in this PR (the repo normally uses separate `build: dist for vX` commits). Otherwise skip it and say so.
- Commit trailers: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and the `Claude-Session:` line of your own session.

### 7. Update the PR description
Add the final QA picture (what ran, what is pre-existing red, what could not run), the skipped findings below, and the items that need confirmation. Then tell the user the PR is ready for review. **Do not merge it yourself.**

## Decisions that belong to the product owner (do not guess; list them in the PR)
Skipped on purpose, with audit numbers (each audit part has its own "open questions"):
- **HR:** HR-1 and HR-3 use the audit's *default* rules, so ask the user to confirm them. The month identity is `YYYY-MM`. Collisions keep the record with more paid out, then the newer edit, and the loser is written to `audit_log`. The close is stamped when a month first becomes paid and reopened by an admin. Not done: HR-2 step 2 (effective-dated salary history), HR-4 (payments as rows), HR-7 (leave entitlement per year), HR-9 (billed stamp on time entries), the rest of HR-10 (approver on time entries), the read-only Finance UI of HR-6, and orphaned `fr-sal-*` rows.
- **Finance:** #7 (server-side materialization, needs a PHP port); the UNIQUE key on (rule, day), because the sync upsert-then-delete order would silently merge rows; #8 b-d, #9, #11, #12, and the rest of #10 (Q5-Q8 in the finance part).
- **Warehouse/support:** W1/W4/W5 (the ledger as source of truth, a stock redesign), S2 (closed retainer periods), S4 (SLA breach and pause recording), the rest of S1, W3 stock movement and backfill.
- **Tasks/automation:** whether workflow run logs outlive a deleted workflow, keeping created tasks when a meeting summary is regenerated, findings 6 and 7. Residual: installs that already added a task state *after* "Hotovo" still have the wrong "done" state, because the new Settings rule only prevents it from now on.
- **CRM/projects:** S5-4, S5-7, S5-8, and the status log and Gantt date of S5-6. MCP client grouping (`mcp_client_profiles`, `mcp_client_scope_from`) still groups by name, while the Clients page groups by `client_id`.

## Traps (learned the hard way)
- **Never `git worktree remove --force` a worktree that has a `node_modules` junction.** It deletes through the junction and wipes the main checkout's real `node_modules` (this happened; repaired with `npm install`). The `integration` worktree and the five `agent-*` worktrees (`agent-a070e0acb2e53793c`, `agent-a1b46d36c3e6213ed`, `agent-a69975dcd7a6998f0`, `agent-a8123cfef0fca4419`, `agent-aaba28eb58a367ccd`) each hold such a junction. To clean up: `cmd //c "rmdir <worktree>\node_modules"`, check with `cmd //c "dir /AL <worktree>"` that no `<JUNCTION>` remains, then remove. The `worktree-agent-*` branches are superseded by the PR; delete them only after the PR is merged and the user agrees.
- CI cancels the in-flight run when you push to the same branch (concurrency group). Wait for a run to finish before pushing if you need its result.
- Files here are CRLF; conflict-resolution scripts must handle `\r\n`.
- `git stash` is shared across worktrees; never use it.
- Do not run `npm run build` casually (it rewrites the committed `dist/`); prefer `npx tsc --noEmit` or `npm run typecheck`.
- Throwaway PRs worked well for baseline comparisons: branch off `origin/1.13-nectarine`, touch only the spec or source files you want scoped (scope = changed files vs the PR base), open a draft PR, read `gh run view <id> --log-failed`, then close the PR **and delete the remote branch explicitly** (`git push origin --delete <branch>`). `gh pr close --delete-branch` did not remove the remote branch when a local worktree held it.

## Definition of done
PR #63 is up to date with its base, the version is bumped once with a changelog entry, CI shows only the pre-existing failures listed above (and nothing new), the PR description is current, the user has the open-decisions list, and nothing was merged or deployed.
