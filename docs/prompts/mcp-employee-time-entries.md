# MCP: an Employee can read and edit their own time entries

## Goal
A user with the **Employee** role can, through their own MCP token, list their time entries and
set each entry's name and description (the records on `/#time-tracking`). This is so an agent
can fill them in automatically at the end of every day. Today the colleague's token is refused
with "no access to time-tracking records".

## Context / links
- Source: a colleague's message (Slovak). Erik asked them and Barnabáš to connect their workflow
  so agents fill in **name** and **description** of their Time Tracking entries at the end of each
  day. Their MCP token (role Employee) on `https://crm.softwaresolutions.sk` answered that they have
  no access to the time-tracking records.
- The tools **already exist** (checked on `1.14-orange`, 2026-11-23):
  - `list_time_entries` (`view: time_tracking`), `update_time_entry` and `log_time_entry`
    (`edit: time_tracking`), defined in `public/api/mcp_ext_modules.php:25-34`, handlers at
    `:705` and `:936`. Own entries need no `time_tracking_team`.
  - Gate: `mcp_tool_allowed()` in `public/api/mcp.php:219`. A refusal reads
    `Forbidden: this key may not call <tool>.` (`mcp.php:443`). Permissions come from
    `ccrm_user_permissions($pdo, $sessionUser)` (`mcp.php:144`), i.e. the token user's role.
  - On paper the code already allows it, so the cause is probably one of these:
    1. **Production runs an older version** whose MCP has no time tools, or has a different permission map.
       Compare the deployed version with the commits that added them (`git log -- public/api/mcp_ext_modules.php`).
    2. **The Employee role on production** has `time_tracking` only at view level, or not at all
       (the UI may still show the page through another path), or misses a sub-key.
    3. **The token's permissions are computed differently from the web session's.** For example
       `ccrm_user_permissions` reads role defaults that predate the `time_tracking` keys, so the
       web UI allows something MCP refuses.
    4. **The colleague called a different tool or a tool name that doesn't exist** (e.g. a generic update tool), or
       the client cached an old `tools/list`.
- **Field mapping:** "name" is the entry's `description` (its title) and "description" is its
  `note` ("Description of the work"). For a task- or ticket-linked entry the title is the
  task's/ticket's and the server ignores `description` (`time_entries.php` header). Check that
  `update_time_entry`'s tool descriptions say this clearly enough for an agent.
- Related: the "CSS Koperniq" MCP connector in Claude Code points at the same production
  instance and lists these tools. Use it only to read, never to write real entries.

## Scope
1. **Diagnose first, before you change code.** Reproduce with an Employee-role token. Get the
   colleague's exact error and tool name from the user, or use a test Employee user on the dev
   stack (`crm` container, :8085). Find out which of causes 1-4 applies, with evidence (request,
   response, role permissions JSON).
2. Fix the actual cause:
   - Code bug → fix it in `public/`, then `npm run sync:backend`.
   - Missing role permission on production → **do not change production data**. Tell the user
     exactly which permission to turn on, in Settings → Roles, for which role.
   - Old deployment → say so. The fix is a build/deploy, which the user runs.
3. If the tool descriptions are unclear about name vs. note or linked entries, sharpen them in
   `mcp_ext_modules.php`.
4. Add MCP probe coverage. An Employee token can `list_time_entries` (own only), can
   `update_time_entry` its own entry's `description`/`note`, and is refused for another user's entry.
   See `scripts/` for the existing MCP probe (`npm run test:mcp`).

## Out of scope
- Building the end-of-day agent workflow itself.
- Changing who may edit other people's entries (`time_tracking_team` stays as is).
- Any change to real production data or roles; version bump; deploy.

## Definition of done
- [ ] Root cause stated with evidence (one of 1-4, or another one).
- [ ] An Employee token on the dev stack lists its own entries and updates `description` and `note` of its own entry via MCP; another user's entry is refused.
- [ ] `npm run check`
- [ ] MCP probe passes with the new cases (`npm run test:mcp`, from the main checkout after merge, against the dev stack)
- [ ] Changelog fragment in `changelog.d/` (if code changed)
- [ ] Committed on the worktree branch; not pushed
- [ ] Short note for the user: what the colleague must do (new token? role permission? wait for deploy?)

## Pre-existing failures
- MCP/RBAC probes against :8085 can die after ~100 requests with "other side closed". This is pre-existing (keep-alive), not a regression.

## Stop and ask when
- The fix needs a production role or data change. Report it; don't do it.
- The cause is only an old deployment (nothing to change in code).
- The colleague's exact error message or tool name is needed and not available.
- Two reasonable readings of "name" and "description" give different behavior.

## Report format
Under 300 words: root cause with evidence, what changed, commits (hash + subject), checks run
with results, what the colleague needs to do, open questions.

> Verify with `npm run check` only. Do not run browser QA, do not push, do not wait for CI. Commit on your worktree branch; the orchestrator merges.
