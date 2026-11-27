# MCP change-visibility audit (read-only)

## Goal
Find every place where an AI client connected through the MCP gateway cannot answer
**"what changed since X?"** or **"what is due / overdue in period Y?"**, even though the
app stores the information. Produce a ranked gap report. **Do not fix anything in this task.**

## Why this audit exists
A colleague's assistant polls CCRM every 2 hours. In ClickUp it saw which tasks changed at 14:44.
In CCRM it said it could only spot *new* tasks, because `list_tasks` returned no `updated_at`,
had no "changed since" filter, took whole-day dates only, and an assignee/tag change did not move
`updated_at`. That was fixed in v1.13.68 (commit `69573649`, follow-up `5c8ec919`) — read that
commit first, it is the reference for what "fixed" looks like:

- the list tool returns `created_at` / `updated_at` (and completion fields) as ISO 8601 with an offset,
  read via `UNIX_TIMESTAMP()` so the MySQL session time zone does not matter;
- `updated_from` / `updated_to` and `created_from` / `created_to` accept `YYYY-MM-DD` or `YYYY-MM-DD HH:MM`;
- `sort_by` offers `updated_at` / `created_at`;
- a real change in a child table (assignees, tags) bumps the parent's `updated_at`; an unchanged re-save does not;
- the tool description tells the client how to ask for a time window and which time zone applies.

## What is already suspected (verify, do not trust)
First look suggests the same gap exists elsewhere. Confirm or refute each:

- `list_projects` filters: status, client_id, search, include_archived. No `updated_*`, no deadline range.
- `list_invoices` filters: type, status, client_id, search. No date range at all, no `updated_*`.
- `list_leads` filters: status, search, owner. No `updated_*`, no date range.
- `list_clients` filters: search, city, client_type. No `updated_*`.
- The tables have the columns: `projects.updated_at`, `financial_records.updated_at`,
  `invoices_offers.updated_at`, `leads.updated_at` (but `leads.created_at` is a DATE, not a timestamp),
  `time_entries.updated_at`. There is also an `audit_log` table.
- Memory note: DB timestamps are UTC vs local in places (`time_entries`) — check each entity.

## Scope
Backend MCP gateway: `public/api/mcp.php`, `mcp_ext.php`, `mcp_ext_ops.php`, `mcp_ext_intel.php`,
`mcp_ext_writes.php`, plus the schema (`public/api/schema.php`) and the write paths in
`public/sync.php`. (Repo-root `api/` copies are mirrors; ignore them.)

Cover **every** tool that lists or reads business data, not only the four above. At minimum:
tasks, projects, milestones, leads, clients, contacts, invoices/offers, expenses,
financial movements and recurring movements, cash-flow forecast, inventory/stock movements/batches,
meetings, communications, employees, salaries, vacations, workflows and runs, documents/files,
unified entries, time tracking (if exposed).

## Questions to answer for each entity
1. **Freshness:** does the list tool return a last-changed timestamp? Created timestamp? In ISO 8601
   with offset, independent of MySQL session zone?
2. **Filter:** can the client ask "changed between A and B" with time of day, not only a date?
3. **Sort:** can it list newest-changed first?
4. **Business dates:** can the client filter by the entity's own dates — project deadline / finish date /
   invoice date / due date / payment date / task deadline / lead follow-up — as a range, and see
   overdue vs upcoming? Does it return those dates?
5. **Child-table changes:** when a child row changes (project managers, milestones, invoice items,
   payments, task assignees/tags, contact links, stock lines), does the parent's `updated_at` move?
   Check both write paths: the app (`sync.php`) **and** the MCP write tools. Does an unchanged re-save
   leave `updated_at` alone? (It must — `updated_at` also guards `sync.php` conflict detection.)
6. **History:** if a *specific field* changed (deadline moved, status changed, amount edited, invoice
   marked paid), is there any record of **when** and **from what to what**? Look at `audit_log`,
   `timeline_events`, status-history tables. Is any of it readable through MCP? If not, say whether
   the app stores it at all (a gap in MCP is different from a gap in the data).
7. **Deletes and archives:** can a client learn that something was deleted or archived since X?
   (Tools never delete rows; check soft-delete/archive flags and whether `include_archived` combined with a
   time filter can reveal it.)
8. **Derived values:** totals, balances and "due" amounts that the app computes — does the MCP compute
   the same way (see `docs/audits/stored-vs-derived-audit.md`), and can a client see the period in which
   they changed (e.g. a payment recorded yesterday changing an overdue total)?
9. **Time zones:** which clock stamped the value (server vs browser)? Is it returned with an offset?
   Is the tool description explicit about the zone for filters?
10. **Pagination:** with a changed-since query on a busy table, can the client page through all results
    (`limit` / `offset`, stable sort)? Is there a hard cap that silently truncates?
11. **Permissions:** do the new/needed filters respect the same per-role field stripping and scope
    (`tasks.view_all`, view vs edit) as the existing tools — no leaking of rows or fields through a timestamp filter?

## Method
- Start by listing every read tool with its input schema and its SQL. Build a matrix:
  rows = tools, columns = questions 1–11, cells = yes / no / partial + `file:line`.
- Prove claims against the code, not the tool descriptions. A description that promises a filter the SQL
  does not implement is a finding on its own.
- Where a claim depends on runtime behaviour (does `updated_at` really move on a child-row change?), use
  the MCP probe (`npm run test:mcp`, needs Docker containers `crm` and `ccrm-db-1`). It works on a scratch copy
  of the dev database and never touches dev data. The probe has a known unrelated failure
  (`get_invoicing_metrics`, caused by price offers in the cloned data) — list it, do not fix it.
- Delegate broad searches to `ccrm-explorer`. Do **not** run browser QA. Do not edit repo files except the report.
- Do not change tool names, ids, URL, headers or `serverInfo.name`: the user must never need to reconnect
  or re-add the MCP connector. Adding optional parameters and richer description text is fine; note that clients
  cache the tool list and only see new parameters after a reconnect — flag this in the report, once.

## Out of scope
- Implementing any fix, version bump, build, deploy, or schema change.
- A company time zone setting (already a ROADMAP item) — only note where it would remove a finding.
- The public REST/sync API (not MCP).

## Deliverable
Write `docs/audits/mcp-change-visibility-audit.md` (do not commit it; the orchestrator decides):

1. **Summary table** — one row per entity: freshness / filter / sort / business-date range / child-bump /
   history, each ✅ ❌ or ◐, plus severity.
2. **Findings grouped by root cause** (one missing helper can explain many tools). Each finding:
   observed symptom (what an AI client would say it cannot do) → root cause with `file:line` →
   proposed fix → effort (S/M/L) → whether it needs a schema change (if yes, note the 4-place rule in
   `.agents/rules/database-schema-and-sync.md`) → risk.
3. **Data gaps vs MCP gaps** — things the app does not store at all (e.g. no history of deadline changes),
   kept separate from things stored but not exposed.
4. **Proposed fix order**, with a suggestion to build one shared helper (timestamp formatting + filter parsing +
   `sort_by`) from the task implementation so every tool behaves the same, instead of ten variations.
5. **Suggested verification** for each fix, in the style: *before result → desired result*, runnable by the user
   through a Claude chat with the connector (a sentence to ask) and, where possible, as a probe check.
6. **Pre-existing failures seen** (command, output) — listed, not fixed.

## Definition of done
- [ ] Every read tool in the gateway appears in the matrix, with a `file:line` per cell that is not "yes".
- [ ] Each of the suspected gaps above is marked confirmed / refuted with evidence.
- [ ] Findings are grouped by root cause, each with symptom → cause → fix.
- [ ] Anything claimed about runtime behaviour was either run through the probe or marked "not verified".
- [ ] No repo file other than the report changed (`git status` shows only the report).
- [ ] No fix applied, no version bump.

## Pre-existing failures
- `npm run test:mcp` → `get_invoicing_metrics` fails on cloned dev data containing price offers. Unrelated.

## Stop and ask when
- A finding would need a schema change — list it, do not decide.
- Two reasonable readings of "changed" give different results (e.g. does a comment count as a change to a task?
  today it does not — see the `list_tasks` description).
- The probe cannot run (Docker down) — report which claims stay unverified rather than guessing.

## Report format (chat)
Under 300 words: how many tools audited, the top 5 gaps by severity, the report path, what was not verified.
