# MCP change visibility: two open questions, analysed in depth

**This is a research and proposal task. Change no code.** The output is a written analysis with a
recommended solution for each question, so the owner can decide. A later task implements the choice.

## Goal
Explain two gaps left after the MCP change-visibility leftovers work (branch
`worktree-mcp-visibility-leftovers`, commits `ac604836`, `872e3e0b`, `f62ea8bf`, `66e65bd9`), compare
the realistic solutions for each, and recommend one. Each recommendation must be small enough to
become one bounded task.

## Context / links
- **Spec:** `docs/audits/mcp-change-visibility-audit.md`; the previous task: `docs/prompts/mcp-change-visibility-leftovers.md`.
- **Milestone bump helper:** `public/api/sync_child_bumps.php` (`ccrm_milestone_snapshot`, `ccrm_milestone_bump`). It compares the stored task row before and after a write and bumps `projects.updated_at` only on a real change of a locking task of that project.
- **Employee change times:** `public/api/mcp_lists_people.php` (`mcp_employee_times_visible`, `mcp_employee_window`, `mcp_employee_refuse_change_times`, `mcp_employee_hide_times`), `mcp_project_employee()` in `public/api/mcp.php`.
- **Recurring tasks:** `public/api/recurring_tasks.php` (the generator inserts task rows around line 572; `isLocking` is copied from the template around line 597). Read tasks only through `ccrm_sql_real_tasks()`: a `tasks` row with `task_kind = 'recurring'` is a template.
- **Rules to respect in any proposal:** the "bump only on a real change" rule (an unchanged re-save must not move `updated_at`, because `ccrm_write_would_clobber` depends on it), the 4-place DB rule in `.agents/rules/database-schema-and-sync.md` for any new column, and the large-file ratchet (`.agents/rules/large-files.md`).

## Question A: employee change times are hidden for too much

**What happens today.** A key that lacks any one of `employees.personal`, `employees.salaries`,
`employees.vacations` or `employees.files` gets no `updated_at` on `list_employees` / `get_employee`,
and is refused `updated_from`, `updated_to` and `sort_by=updated_at`. The reason: all four field
groups live in the `employees` row, so editing any of them moves `employees.updated_at`, and a limited
key could learn *when* a hidden field (a raise, a PIN, a document) changed.

**The cost.** The same `updated_at` also moves for fields the limited key can see (name, position,
department, kind, `is_active`, the app-login link, company ids). Such a key cannot ask "which
employees changed since Monday", even for changes it is allowed to read.

**Investigate and answer:**
1. List every code path that writes `employees` and which columns each touches: `sync.php` (the employee upsert and `employee_salaries`, `employee_vacations`), `api/employee_files.php`, `api/my_employment.php`, MCP `update_employee`, `schema.php` migrations. For each, say whether it moves `employees.updated_at` and whether the changed column belongs to one of the four groups.
2. Do salary and leave child rows (`employee_salaries`, `employee_vacations`) move the parent `employees.updated_at`? If not, say so: it decides whether the visible-field time could be derived per group.
3. How often will a limited key actually be affected? Say what the real roles do (Admin, Project Manager, the default roles in the code): which of them lack at least one of the four groups today?
4. Compare these options, with the leak each leaves, the schema change each needs, the sync/clobber risk and the effort:
   - **A1. Keep the current rule** (all-or-nothing). Cost: limited keys lose a feature.
   - **A2. A second timestamp**, for example `employees.profile_updated_at`, moved only when a non-hidden column changes. It needs a column (4-place rule) and a write-time check in every writer.
   - **A3. Compute the visible-field time at read time** from a stored hash or snapshot of the visible columns. Say whether a cheap, correct version exists, or whether it needs a column anyway.
   - **A4. Per-group stamps**, one column per group, so each key sees the newest stamp among the groups it may read. State the column count and the writer changes.
   - **A5. Anything better you find.**
5. For the winner, give the exact files and functions to change, the migration and column-healing steps if any, the probe checks to add, and the leak that remains (if any). Say whether it must be one commit or several.

## Question B: a recurring-task instance that is a milestone does not bump its project

**What happens today.** The milestone bump covers the sync push, the named delete, `task.php` delete
and MCP `update_task` / `complete_task`. The recurring-task generator inserts occurrence rows through
its own SQL in `recurring_tasks.php`, and an occurrence copies `is_locking` and `related_project_id`
from its template. If a template is locking and linked to a project, each new occurrence is a milestone
of that project, but creating it does not move `projects.updated_at`.

**Investigate and answer:**
1. Can a template really be locking and linked to a project? Check the UI (task form and recurring settings), `sync.php`'s template upsert and the generator. If the UI never allows it, say so and say whether the API or MCP can still produce one. If it can never happen, the answer may be "no fix needed, guard it instead".
2. If it can happen, list every place an occurrence is created, completed, edited, archived or deleted outside the paths already covered: the generator (`ccrm_maybe_process_recurring_tasks`, the cron path), the "trigger on completion" path in `sync.php` (`$recurringTemplatesToProcess`), and anything else. Mark which of them already go through `ccrm_milestone_bump`.
3. Should an occurrence count as a project milestone for the project's change time at all? A new occurrence every week would move the project every week. Argue both sides from how the project form and the MCP milestone tools (`list_milestones`, `create_milestone`, `get_project`) treat occurrences. Check whether `list_milestones` returns occurrences today.
4. Compare these options with effort and risk:
   - **B1. Do nothing**, and document that recurring occurrences are not milestones for change times.
   - **B2. Call `ccrm_milestone_snapshot` / `ccrm_milestone_bump` in the generator** around its insert.
   - **B3. Forbid `is_locking` on a template** (validation in the app and in `sync.php`), so the case cannot arise.
   - **B4. Anything better you find.**
5. For the winner, give the exact files and lines, the probe check to add (`scripts/probe-persistence.mjs` or `scripts/probe-mcp/run.mjs`), and what happens to templates that already hold `is_locking = 1` in production data (a one-off count query to write, not to run on production).

## Out of scope
- Any code change, schema change, version bump, build, deploy or push. Write the analysis only.
- Running the probes against a worktree (the docker stack mounts only the main checkout) or creating scratch databases on the docker MySQL.
- Fixing the stale container name in `scripts/probe-persistence.mjs`.
- Questions other than A and B. If you find a third gap, list it under "Other findings" and stop there.

## Definition of done
- [ ] One file `docs/analysis/mcp-change-visibility-open-questions.md` (create the folder if missing) with a section per question: **Findings** (with `file:line` references), **Options** (a table: option, leak or gap left, schema change, risk, effort), **Recommendation**, **Implementation plan** (files, steps, probe checks, commit split).
- [ ] Every claim about code cites a file and line you actually read. A claim you could not verify is marked "unverified".
- [ ] A short "Decisions the owner must make" list at the top, at most five items, each answerable yes/no or by picking an option letter.
- [ ] A changelog fragment is **not** needed (no behavior change). Commit only the analysis file, on the worktree branch; not pushed.

## Pre-existing failures
- `npm run test:mcp`: 525 passed, 1 failed (`get_invoicing_metrics counts invoices only`, price offers in the cloned dev data). Known; do not fix.
- `npm run test:persistence` fails at once on a stale container name (`crm-19-jackfruit`, port 8086); the dev stack is `crm` on 8085. Known; do not fix.

## Stop and ask when
- Answering needs production data you cannot read from the repo or the dev database.
- Two reasonable readings of "should an occurrence be a milestone" give different product behavior and the code does not settle it. Present both and say which you recommend, but do not pick silently.
- A recommended option needs a schema change: say so plainly and still finish the analysis.

## Report format
Under 300 words: the two recommendations in one sentence each, the decisions the owner must make,
the path of the analysis file, commits (hash + subject), what you could not verify.

Session rules: this task only writes one analysis file, but it still changes a repo file, so work in your own worktree (`EnterWorktree`). Run plain git commands one at a time; compound git commands are refused in a worktree session. End commit messages with the Co-Authored-By / Claude-Session lines your session gives you.

> Verify with `npm run check` only. Do not run browser QA, do not push, do not wait for CI. Commit on your worktree branch; the orchestrator merges.
