# MCP change visibility: three leftovers

## Goal
Close the three small gaps left after the MCP change-visibility work (branch `1.13-nectarine`, commits after `61f3adb3`):
1. A change to a project's milestone task moves the project's `updated_at`.
2. SuperFaktúra invoices follow the same overdue rule as every other money tool.
3. A key without the employee field permissions can no longer learn *when* hidden employee fields changed.

## Context / links
- **Spec:** `docs/audits/mcp-change-visibility-audit.md` (RC3 child bumps, RC4/RC12 overdue money, RC11-style permission care).
- **Shared window:** `public/api/mcp_window.php` (`mcp_list_window`, `mcp_window_props`, `mcp_window_doc`, `mcp_moment_select`, `mcp_row_moments`).
- **Child-bump helpers:** `public/api/sync_child_bumps.php`, called from `public/sync.php`. The rule: bump only on a real change, after the parent's own upsert. An unchanged re-save leaves `updated_at` alone, because `ccrm_write_would_clobber` conflict detection depends on that.
- **Overdue rule:** `public/api/mcp_ext_intel.php`: `mcp_overdue_rule_text()`, `mcp_dated_before_today()`, `mcp_is_overdue()`, `mcp_overdue_date_sql()`, `mcp_payment_status()`.
  - The rule: an amount is overdue when it is unpaid **and** (its stored status is overdue **or** `COALESCE(due_date, issue_date)` is before `mcp_today()`).
- **Employee field split:** `mcp_project_employee()` in `public/api/mcp.php` (around line 1270) strips these column groups:
  - `employees.personal`, `employees.salaries`, `employees.vacations`, `employees.files`.
  - They all live in the `employees` row itself, so editing any of them moves `employees.updated_at`.
- **Employee tools:** `mcp_list_employees()` / `mcp_get_employee()` in `public/api/mcp_lists_people.php`, with `MCP_EMPLOYEE_WINDOW`.
- **Probes:**
  - `scripts/probe-mcp/run.mjs` (`npm run test:mcp`; functions `changeSyncChecks`, `changeReviewFixChecks`, `changePeopleChecks`).
  - `scripts/probe-persistence.mjs` (`changeVisibilityChecks`, sync.php pushes).

## Scope

### 1. Milestone task changes bump the project
- **How it works today:** a project's milestone is a normal `tasks` row with `is_locking = 1` and `related_project_id = <project>`. MCP `create_milestone` already bumps `projects.updated_at`. A milestone task created, edited or deleted through the app does not.
- **The change:** bump `projects.updated_at = CURRENT_TIMESTAMP` (the column has whole seconds) when a push really changes a locking task of that project. That covers:
  - a locking task inserted, deleted or edited (title, deadline, status, archived, completed);
  - a task becoming locking or no longer locking;
  - a locking task moving to another project, which bumps **both** the old and the new project.
- **Where:**
  - the task upsert in `public/sync.php` (the `INSERT INTO tasks … ON DUPLICATE KEY UPDATE`, around line 5091);
  - the task branch of `ccrm_delete_omitted`;
  - the task delete endpoint `public/api/task.php`;
  - the MCP task writes that can change a locking task (`update_task`, `complete_task`; find them with grep).
- **Detecting a real change:**
  - Use the upsert's affected-row count (1 = insert, 2 = changed, 0 = unchanged). First check that PDO is not connected with `MYSQL_ATTR_FOUND_ROWS`, which would make an unchanged row report 1.
  - Where that is not available, compare a snapshot taken before the write. Put the helper in `public/api/sync_child_bumps.php`, next to the others.
- **What must not happen:** a non-locking task must never bump its project, or every task edit would look like a project change.

### 2. SuperFaktúra rows use the shared overdue rule
- **Where:** in `mcp_ext_intel.php`, the SuperFaktúra row builder used by `get_client_invoices` (around line 705-725) computes `payment_status` itself: code 99, or `due < today` with something still open, and no issue-date fallback.
- **The change:**
  - Derive overdue through the shared helpers, so a row with no due date falls back to its issue date (`created`).
  - SuperFaktúra's own status 99 counts as "stored status is overdue".
  - Paid (code 3) and partially paid keep their meaning. Partially paid *and* past due is overdue, as for local rows.
- Update the `get_client_invoices` description so it no longer limits the shared rule to Invoicing and ledger rows.
- You cannot reach SuperFaktúra from a test. Extract the status mapping into a small pure function and test it from the probe through a PHP snippet, the way the probe's `phpFile`/docker helpers run PHP, or say why that is not possible.

### 3. Employee change times respect the field permissions
**Decision (orchestrator):** if the key lacks **any** of `employees.personal`, `employees.salaries`, `employees.vacations` or `employees.files`, then for `list_employees` and `get_employee`:
- omit `updated_at` from the output;
- refuse `updated_from` / `updated_to` / `sort_by=updated_at` with a clear message ("this key cannot see every employee field, so change times are not available");
- keep `created_at`, and leave `list_deleted_records` alone.

A key with all four keeps everything. Say this in both tool descriptions.

Do the check in one helper in `mcp_lists_people.php`. Remember that `mcp_list_window()` reads the args itself: either strip the `updated_*` args and the sort before calling it, or pass a window constant without `updated`. The second is cleaner, because `mcp_window_props()` then advertises the right parameters. Note, however, that tool definitions are built per request, so check how `mcp_tool_permissions` / definitions see the caller before relying on it.

If you find that `updated_at` can also move for a reason that matters to a key without these permissions (for example a name or position change), list it in your report. Do not widen the decision on your own.

## Out of scope
- Any other MCP tool, the shared helpers in `mcp_window.php` and `mcp_ext.php` (add new helpers next to their callers), `get_invoicing_metrics`.
- Schema changes. None is needed; stop and ask if you think one is.
- Field-level change history, tombstones, the forecast `months`.
- Version bump, build, deploy, push.
- Fixing the stale container name in `scripts/probe-persistence.mjs` (see below).

## Definition of done
- [ ] All three items are implemented, each in its own commit with a changelog fragment `changelog.d/2026-11-10-<slug>.md`. The format is in `changelog.d/README.md`. Do not end a fragment name in `-prompt.md`: that pattern is gitignored.
- [ ] `public/` is edited, then `npm run sync:backend` is run (it mirrors to the repo root).
- [ ] `php -l` is clean on every changed PHP file. In Git Bash: `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)":/app -w /app php:8.2-cli php -l <file>`. A `*/` inside a docblock ends the comment.
- [ ] `npm run check` passes. The file-size ratchet must hold: `public/sync.php` is listed in `scripts/agent/file-size-baseline.json`, so put new code in `sync_child_bumps.php`.
- [ ] Probe checks are written:
  - Item 1:
    - in `scripts/probe-persistence.mjs` `changeVisibilityChecks`: a pushed edit of a locking task bumps its project, an unchanged re-push does not, and an edit of a non-locking task does not;
    - plus an MCP `update_task` check in `scripts/probe-mcp/run.mjs`.
  - Item 2: the status mapping.
  - Item 3: a key without `employees.salaries` gets no `updated_at` and a refusal for `updated_from`, while a full key still gets both. The authorization section of `run.mjs` shows how limited probe keys are made.
- [ ] Probe rules: add checks in a new function `changeLeftoverChecks()` placed after `changeReviewFixChecks()` and called from main; do not change existing checks; seed with your own id prefix and delete what you insert. You cannot run the probes from a worktree (the docker stack mounts only the main checkout); the orchestrator runs them after merging. Do not create scratch databases on the docker MySQL.
- [ ] Committed on the worktree branch; not pushed.

## Pre-existing failures
- `npm run test:mcp`: 525 passed, 1 failed. The failure is `get_invoicing_metrics counts invoices only`, caused by price offers in the cloned dev data. It is known; do not fix it.
- `npm run test:persistence` fails immediately with a `docker cp … crm-19-jackfruit` error: the script hard-codes an old container name and port 8086. The dev stack is `crm` on 8085. A copy with the name replaced, run with `CCRM_PROBE_URL=http://127.0.0.1:8085`, passed 95 of 95 on 2026-11-10. Leave the script's target as it is.

## Stop and ask when
- Item 1 would need to bump a project from a path where you cannot tell a real change from a re-save.
- Item 3's decision would hide something a key with all four permissions needs, or it conflicts with how tool definitions are built.
- A fix needs a file or helper listed in Out of scope.
- A check fails for a reason unrelated to your change.

## Report format
Under 300 words:
- commits (hash + subject);
- for item 1, how a real change is detected on each path;
- for item 2, the status mapping table;
- for item 3, which outputs and params change for a limited key;
- the checks you ran, with results;
- pre-existing failures seen (not fixed);
- open questions.

Session rules: work in your own worktree (`EnterWorktree`, or `isolation: worktree` when spawned). Run plain git commands one at a time; compound git commands are refused in a worktree session. End commit messages with the Co-Authored-By / Claude-Session lines your session gives you.

> Verify with `npm run check` only. Do not run browser QA, do not push, do not wait for CI. Commit on your worktree branch; the orchestrator merges.
