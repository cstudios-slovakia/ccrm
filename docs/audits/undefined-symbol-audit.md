# Undefined-symbol audit (part 1 of 2: scan and triage)

- **Date:** 2026-11-05
- **Branch / commit:** `1.13-nectarine` at `1196e540` (v1.13.56-Nectarine)
- **Prompt:** `docs/prompts/undefined-symbol-audit-1-opus.md`
- **Fixes are applied by part 2:** `docs/prompts/undefined-symbol-audit-2-sonnet.md`, working only from this file.
- **Scanner:** `scripts/audit-undefined-symbols.mjs` (CLI) on top of `scripts/lib/php-symbol-audit.mjs` and
  `scripts/lib/sql-audit.mjs` (pure functions), plus `scripts/lib/php-builtins.json` (PHP built-ins from the `crm`
  container). See §7.

Nothing in `public/`, `src/`, the mirrors or `dist/` was changed. Nothing was committed.

---

## 0. Results in brief

**Real production bugs (fix these first):**

| ID | Where | What the user sees |
|---|---|---|
| A-01 | `public/api/tickets.php:48,172` | Calls `ccrm_decrypt_settings_secrets()`, which has never existed. The `Error` is swallowed, so **every server-side read of Ticket settings returns the defaults**: cron never polls the support mailbox, "Poll now" reports "IMAP credentials are not configured", e-mail replies to tickets report "Support SMTP is not configured", AI routing gets no key. Broken since v1.12.15 (`7404c831`). |
| A-02 | `public/api/tickets.php:380` | Calls `parse_email_structure()`, which has never existed. It cannot run today because A-01 makes polling bail out first. **Fixing A-01 on its own turns this into a fatal error on the first polled e-mail.** Ship A-01 and A-02 together. |
| F-01 | `public/api/agent_utils.php:674-682` | The AI assistant's "Tasks & Kanban" context query selects `tasks.due_date`, `assigned_to`, `lead_id` and `project_id`. None of these columns exist. The `PDOException` is swallowed, so **the AI chat, voice agent and autonomous agents never see any tasks**. Broken since v1.10.33 (`9c560057`). |
| F-02 | `public/sync.php` (before line 3301) | The `ai_custom_templates.layout_json` healing from `fbeedd81` ("saving no longer fails with Unknown column layout_json") is on `main`/`1.12-mango` but **never reached `1.13-nectarine`**, and `document_json` (added 2026-10-27) was never healed either. During a deploy window on an install that is missing the column, every save that carries templates fails with HTTP 500. |
| G-01 | `src/components/{ClientsView,FinancialManagementView,ProjectDetailsView}.tsx` | Read `window.ccrmCurrentUser`, which nothing ever assigns. Records created there are stored with **`createdBy = "Admin"`** instead of the real author. |

**Everything else is latent.** The code works today only because every current caller happens to load the defining
file first: 113 such uses in 16 files (A-03…A-13). Each one is the same kind of bug as `ed884d4a` and `80a0a76c`,
waiting for a new caller.

**Checked and clean:** every PHP file parses on PHP 8.2 (227 files, D). The root mirror matches `public/` (B). No CLI
flow loads one file from two trees (C). No DDL is reachable inside a transaction (F-04). No migration touches a table
before creating it (F-05). The frontend type-check is clean, with no `@ts-ignore`, no `@ts-nocheck` and no value-import
cycles (G).

---

## 1. Entry points

The source of truth is `public/`. The root copies (`api/`, `sync.php`, `upload.php`) and `dist/` are mirrors. A require
into them is folded onto `public/` by the scanner. **Mirror check (2026-11-05):** every committed `public/**/*.php` blob
equals its root copy, except `public/dump_schema.php`, which is intentionally not mirrored (`scripts/sync-backend.mjs`
line 41). The local `dist/` PHP files are byte-identical to `public/` (they are gitignored and refreshed by `ccrm update`).

### 1.1 HTTP entry points (files with top-level code that run when requested)

`public/sync.php`, `public/upload.php`, `public/dump_schema.php` (public/ only), and these `public/api/` files:

`agent_utils.php`¹, `ai_usage.php`, `ares_cz.php`, `audit_log.php`, `auth.php`², `chat_rag.php`, `company_mailboxes.php`,
`company_registry.php`, `cron.php`³, `cron_agents.php`, `dashboard_query.php`, `delete_file.php`, `demo_reseed.php`¹,
`employee_file.php`, `error_logs.php`, `generate_dashboard.php`, `generate_pdf_template.php`, `generate_report.php`,
`holidays.php`, `idoklad.php`, `integration.php` (also `/api/v1/*` via `.htaccess`), `integration_admin.php`,
`license.php`, `login.php`, `logout.php`, `mail_broker.php`¹, `manifest.php` (also `/manifest.json` via `.htaccess`),
`mcp.php`, `mcp_keys.php`, `my_employment.php`, `orders.php`, `passkeys.php`, `passkeys_lib.php`², `password_reset.php`,
`pipeline.php`, `push_subscription.php`, `realtime_session.php`, `registeruz.php`, `seed_demo_data.php` (CLI-only, 403
over HTTP), `setup.php`, `summarize_client_lead.php`, `summarize_email.php`, `summarize_financial.php`,
`summarize_meeting.php`, `superfaktura.php`, `swarm.php`, `task.php`, `tickets.php`¹, `ticket_widget.php`,
`time_entries.php`, `time_tracker_ext.php`, `time_tracking.php`, `train_vector.php`, `transcribe_meeting.php`,
`transcribe_task.php`, `translate_dashboard.php`, `universal_search.php`, `upload_audio.php`, `validate_vat.php`,
`validate_vector.php`, `waai_demo.php`, `waai_sso.php`, `wipe_demo.php`, `workflows.php`, `workflows_engine.php`¹,
`zernio.php`.

¹ A library that also serves requests: it returns early unless it is the requested script (`basename($_SERVER['SCRIPT_FILENAME'])`
check or `CCRM_DEMO_RESEED_LIB`). Top-level functions are still declared when it is required from elsewhere (PHP binds
unconditional top-level functions at compile time).
² Only runs harmless top-level code (`ini_set`, the autoload search) when loaded.
³ Run every minute by `deploy/vps/cron-tick.sh` (an HTTP GET with the cron token).

### 1.2 CLI entry points

- `ccrm` (repo root). Every library is loaded inside a function, from the first of `api/`, `dist/api/`, `public/api/`
  that has it:
  - `update`: `ccrm_cli_pdo()` loads `config.php` and `{dir}/license_client.php` **before** `git pull`. After publish,
    `ccrm_migrate()` loads `vendor/autoload.php`, `config.php` and `dist/api/schema.php` (falling back to
    `public/api/schema.php`). Also `src-php/Installer.php`.
  - `migrate`: `ccrm_migrate()` as above.
  - `demo:seed`: `{dir}/schema.php` and `{dir}/demo_reseed.php` (with `CCRM_DEMO_RESEED_LIB`).
  - `backfill-clients`: `{dir}/lead_client_backfill.php`. `adjustment-clients`: `{dir}/adjustment_client_migration.php`.
  - `license`: `license_client.php` via `ccrm_cli_pdo()`.
- `public/api/seed_demo_data.php` (CLI only).
- `src-php/Installer.php` / `src-php/ComposerPlugin.php`: Composer plugin path (`migrateDatabase()` loads
  `{package}/dist/api/schema.php`).
- `scripts/*.php`: developer test harnesses and seeders (`test-*.php`, `seed_demo_*.php`, `scripts/import/villatesta/*`,
  `scripts/demo-assert/*`). They are not deployed (`.htaccess` blocks `scripts/`) and are reported separately (§4.1).

### 1.3 Libraries required by more than one entry point

`auth.php` (82 includers), `config.php` (68), `schema.php` (38), `read_scope.php` (37), `demo_seed/helpers.php` (23),
`demo_seed/lookup.php` (14), `holidays_lib.php` (8), `mail_broker.php` (8), `employee_files.php` (7), `agent_utils.php`
(6), `recurring_tasks.php` (5), `demo_mailbox.php` (5), `lead_client_backfill.php`, `webpush.php`, `mail_filing.php`,
`workflows_engine.php`, `time_cost.php`, `integration_lib.php`, `license_client.php` (4 each), `permissions.php`,
`vector_index.php`, `task_reminders.php`, `SwarmManager.php`, `integration_tasks.php`, `mail_attachments.php`,
`time_tracking_lib.php`, `demo_reseed.php`, `time_entries_lib.php`, `vendor/autoload.php` (3 each), and `tickets.php`,
`time_tracker_lib.php`, `offer_document.php`, `passkeys_lib.php`, `pipeline_extras.php`, `employee_name.php`,
`demo_seed/{index,wipe,context,packs,leave}.php`, `warehouse_item_fields.php`, `adjustment_client_migration.php` (2 each).

### 1.4 Frontend

`src/**/*.ts(x)` (500 files, bundled by Vite, type-checked by `tsc -p tsconfig.app.json`). The only non-bundled browser
JS is `public/sw.js`. `scripts/*.mjs` are developer tools.

---

## 2. Summary

| Class | Scope scanned | Raw hits | Confirmed | False positives |
|---|---|---|---|---|
| A. Function/class/constant not loaded on every path | 226 PHP files (`public/` 177, `ccrm`, `src-php/` 4, `scripts/` 44) | 248 symbol×file groups (615 uses) | **113 groups in 16 files** → 13 findings (A-01…A-13). 2 broken today, 111 latent | 135 groups (§4.1) |
| B. Wrong or fragile require paths | 226 files; 359 requires | 8 unresolved, 7 hard config requires, 2 absolute paths, 1 unmirrored file | 1 (B-01, needs judgement) | 11 (§4.2) |
| C. Redeclaration from two paths | 81 files declare outside a guard; 24 of them are libraries with includers | 24 | 0 bugs today. 1 prevention item (C-01, needs judgement) | 0 |
| D. Parse errors / stale `require_once` in the CLI | 227 files linted (`php:8.2-cli`) | 0 lint errors. 1 file loaded before `git pull` | 0 | 0 |
| E. Globals and implicit state | 8 globals, 4 optional config constants, `$_SESSION` users | 12 | 0 | 12 (all guarded, §4.3) |
| F. SQL names, healing, DDL in transactions, migration order | 86 tables; all literal SQL in `public/` | 4 unknown columns, 1 unknown table, 15 DDL-in-tx, 0 order, 0 FK, 177 unhealed | **F-01 (4 columns, 1 query), F-02 (2 columns)**. 65 unhealed columns need judgement (F-03) | 1 table + 15 DDL-in-tx (§4.4) |
| G. Frontend identifiers undefined at runtime | 500 TS files, 1 SW file | 0 tsc errors, 0 ts-ignore/nocheck, 25 dynamic imports (all typed), 0 cycles, 11 `window.*` globals | **2 (G-01 bug, G-02 dead code)** | 0 |
| H. Same shape, new class | — | 1 | 1 (H-01, needs judgement) | 0 |

How these are counted: a "group" is one symbol in one file, however many lines use it. "Confirmed" means I read the call
site and the definition and the finding is real, either broken today or latent (works only because of who calls it).

---

## 3. Confirmed findings, grouped by root cause

Order of work for part 2 (dependencies are noted per item):

1. A-01 + A-02 together (one commit).
2. F-01, F-02, G-01, G-02.
3. A-03 … A-11, A-13 (mechanical `require_once` additions, all verified safe below).
4. Items marked `needs judgement` only after the owner decides (§3.6).
5. The guard test (§5) last, so it starts green.

Re-run `node scripts/audit-undefined-symbols.mjs --sql` after the fixes. Expected result: `broken` and `conditional`
contain only the allowlisted false positives (§4.1). `latent` contains only A-12 (mcp.php helpers) if the allowlist
route is chosen. `Tables or columns that exist nowhere` is 0.

### 3.1 Root cause: the called function never existed

#### A-01 — `ccrm_decrypt_settings_secrets()` does not exist (certain)

- **Use:** `public/api/tickets.php:48` (`ccrm_load_ticket_settings()`) and `:172` (`ccrm_resolve_ticket_openai_key()`).
- **Definition:** none. The intended function is `ccrm_decrypt_config_secrets(array $config, array $secretKeys): array`
  at `public/api/auth.php:1920`, which `tickets.php` already loads (line 3).
- **Symptom:** always, since v1.12.15 (`7404c831`). Both calls sit in `try { … } catch (\Throwable $e) {}`, so the
  `Error` is swallowed and `ccrm_load_ticket_settings()` returns `$defaults`:
  - cron (`api/cron.php:124` → `ccrm_poll_ticket_imap($pdo, false)`) returns "IMAP polling is disabled" every minute, so
    support e-mail never becomes tickets;
  - Tickets › "Poll now" (`tickets.php?action=poll_imap`) answers "IMAP credentials are not configured.";
  - replying to a ticket by e-mail (`send_email_reply`) answers "Support SMTP is not configured in Ticket Settings.";
  - "Test IMAP" with the password field left blank tests an empty password;
  - AI ticket routing never finds an OpenAI key (neither the ticket one nor the `INTEGRATIONS_CONFIG` fallback).
  The Settings screen itself still shows the saved values (it reads them through `sync.php`), which is why this went
  unnoticed.
- **Fix:** in `public/api/tickets.php`, replace `ccrm_decrypt_settings_secrets(` with `ccrm_decrypt_config_secrets(` on
  lines 48 and 172. The arguments already match. **Must ship with A-02.**

#### A-02 — `parse_email_structure()` does not exist (certain)

- **Use:** `public/api/tickets.php:380` in `ccrm_poll_ticket_imap()`.
- **Definition:** none. `mail_broker.php` (already required at `tickets.php:4`) has
  `fetch_email_body_text($imapStream, $msgNo)` at `public/api/mail_broker.php:1581`. It returns the plain-text body
  (HTML stripped as a fallback) and reads with `FT_PEEK`.
- **Symptom:** not reachable today (A-01 stops polling earlier). Once A-01 is fixed: `Call to undefined function
  parse_email_structure()` on the first unseen e-mail. Cron logs it through `ccrm_log_exception`, and "Poll now" returns
  HTTP 500.
- **Fix:** in `public/api/tickets.php`, replace lines 375-382:
  ```php
          // Fetch body using mail_broker helper
          $structure = @imap_fetchstructure($inbox, (int)$uid, FT_UID);
          $bodies = ['html' => '', 'plain' => ''];
          $attachments = [];
          if ($structure) {
              parse_email_structure($inbox, (int)$uid, $structure, '', $bodies, $attachments);
          }
          $bodyText = trim($bodies['plain'] !== '' ? $bodies['plain'] : strip_tags($bodies['html']));
  ```
  with:
  ```php
          // Plain-text body (HTML stripped as a fallback), read with FT_PEEK. $msgNo is from line 350.
          $bodyText = trim(fetch_email_body_text($inbox, (int)$msgNo));
  ```
  Keep the `if ($bodyText === '') { … imap_body … }` fallback that follows. `$attachments` was never used afterwards.

### 3.2 Root cause: SQL names that do not exist, or exist only after a migration that may not have run

#### F-01 — Tasks query in the AI context uses four non-existent columns (certain)

- **Use:** `public/api/agent_utils.php:674-682` in `build_comprehensive_crm_rag_context()`:
  `t.due_date`, `t.assigned_to`, `t.lead_id`, `t.project_id`.
- **Definition:** `tasks` (`public/api/schema.php`, CREATE TABLE ~line 140) has `deadline`, `owner`, `related_lead_id`,
  `related_project_id`. None of the four names was ever a `tasks` column.
- **Symptom:** always, since v1.10.33 (`9c560057`). `$pdo->query()` throws, `catch (\Exception $ex) {}` swallows it, and
  the "TASKS & KANBAN" block is missing from every AI context: RAG chat (`chat_rag.php:331`), voice agent
  (`realtime_session.php:159,810`) and the autonomous agents (`agent_utils.php:1459,1467`). The assistant answers
  questions about tasks as if there were none.
- **Fix:** in the query string at `agent_utils.php:674-682`, alias the real columns to the names the PHP below already
  reads (`$tsk['due_date']`, `$tsk['assigned_to']`), so nothing else changes:
  ```sql
  SELECT t.`id`, t.`title`, t.`description`, t.`status`, t.`priority`,
         t.`deadline` AS `due_date`, t.`owner` AS `assigned_to`,
         l.`name` as `lead_name`, p.`name` as `project_name`
  FROM `tasks` t
  LEFT JOIN `leads` l ON t.`related_lead_id` = l.`id`
  LEFT JOIN `projects` p ON t.`related_project_id` = p.`id`
  ```
  (`WHERE`, `ORDER BY` and `LIMIT` stay as they are; `archived`, `created_at`, `status` and `priority` exist.)

#### F-02 — `ai_custom_templates.layout_json` / `document_json` not healed in `sync.php` (certain)

- **Use:** `public/sync.php:6136` (template upsert, inside the transaction opened at line 3301) writes `layout_json`
  and `document_json`.
- **Definition:** CREATE TABLE `public/api/schema.php:374` (fresh installs). Migrations at `schema.php:1533-1534`
  (`layout_json`) and `1538-1539` (`document_json`, `LONGTEXT NULL AFTER layout_json`, added 2026-10-27).
- **Root cause:** `fbeedd81` (v1.12.86-Mango) added the pre-transaction healing for `layout_json` on `1.12-mango`/`main`.
  It is **not an ancestor of `1.13-nectarine`** (`git merge-base --is-ancestor fbeedd81 HEAD` fails), and
  `git cherry HEAD origin/main` shows it as the only unported backend fix. `document_json` was never healed anywhere.
  `.agents/rules/database-schema-and-sync.md` cites `layout_json` as an example of the healing pattern, which is no longer
  true on this branch.
- **Symptom:** only in a deploy window where `SCHEMA_FINGERPRINT` was stamped without the migration (the scenario in
  CLAUDE.md). Every save that carries `aiCustomTemplates` (any full save by an admin) returns HTTP 500 `Unknown column
  'document_json' in 'INSERT INTO'`.
- **Fix:** in `public/sync.php`, immediately above `$pdo->beginTransaction();` (line 3301) and after the other healing
  blocks, add:
  ```php
          // Template upsert below names layout_json and document_json (ported from fbeedd81).
          if (isset($payload['aiCustomTemplates']) && is_array($payload['aiCustomTemplates']) && !$ccrm_skip_writes('general_config', 'aiCustomTemplates')) {
              if (!ccrm_column_exists($pdo, 'ai_custom_templates', 'layout_json')) {
                  $pdo->exec("ALTER TABLE `ai_custom_templates` ADD COLUMN `layout_json` TEXT NULL AFTER `badge_style`");
              }
              if (!ccrm_column_exists($pdo, 'ai_custom_templates', 'document_json')) {
                  $pdo->exec("ALTER TABLE `ai_custom_templates` ADD COLUMN `document_json` LONGTEXT NULL AFTER `layout_json`");
              }
          }
  ```
  Then `npm run sync:backend`. No new column, so `entities_overview.md` does not change.

#### F-03 — 177 migrated columns that `sync.php` writes without healing (needs judgement)

`node scripts/audit-undefined-symbols.mjs --sql` lists every column that `sync.php` writes, that a `schema.php`
migration added (`ALTER … ADD`), and that `sync.php` does not heal before `beginTransaction()`. Dated with `git blame`
on the migration line:
- **0** were added after the healing rule was written (`.agents/rules/database-schema-and-sync.md`, `58e88123`,
  2026-10-29). The rule is being followed for new work. F-02 is the exception: the healing was lost in a branch merge.
- **65** were added in October 2026, before the rule. Mostly the `orders`/`order_items` guest and delivery columns
  (2026-10-12), plus `employees.*` (2026-10-20/21), `tasks.estimate_minutes`, `invoices_offers.custom_fields_json`
  (2026-10-27), `leads.client_id`, `leads.price_level_id`, `projects.ticket_*` and `tasks.related_ticket_id`.
- **112** are older.

Decide: (a) heal the 65 October columns in `sync.php` now, or (b) record all 177 as a grandfathered baseline and
enforce healing only for columns added from now on (§5, rule G7). What decides it: whether any production install could
still be on a pre-October schema without `php ccrm update` having run. `ccrm_migrate()` clears the fingerprint and
re-runs every migration on each update, so an install that has been updated since 2026-10-28 has them all. I recommend
(b).

### 3.3 Root cause: a library relies on its caller to load what it uses

The rule from the prompt: every PHP file must itself `require_once` the file that defines each project function it uses.
All targets below are side-effect-free libraries, or endpoints that return early when they are not the requested script.
For each one I checked three things: no top-level require cycle (a cycle through `require_once` is a no-op anyway,
because a file being included is already in `get_included_files()`); no top-level output, `exit`, connection or session
start; and that the target is safe to load from a second place (same directory, so `require_once` dedupes, including in
the `ccrm` CLI, which loads every library from one `{dir}`).

Severity for every item in this section: **latent.** It works today because every current includer loads the definition
first. It breaks the first time a new endpoint, cron job or CLI command includes the file directly, which is exactly what
happened in `ed884d4a` (`read_scope.php`) and `80a0a76c` (`sync.php`).

#### A-03 — `task_reminders.php` uses `ccrm_sql_real_tasks()` (certain)

- **Use:** `public/api/task_reminders.php:190` (`ccrm_process_task_reminders()`).
- **Definition:** `public/api/recurring_tasks.php:23` (guarded; also `schema.php:1396`).
- **Loaded today by:** `cron.php:4`, `sync.php:17` and `recurring_tasks.php:592` (inside a function), all of which load
  `recurring_tasks.php`.
- **Fix:** after `public/api/task_reminders.php:21` add `require_once __DIR__ . '/recurring_tasks.php';`.
  No cycle: `recurring_tasks.php` requires `task_reminders.php` only inside `ccrm_process_recurring_tasks()` (line 592).

#### A-04 — `time_entries_lib.php` uses `ccrm_table_exists()` and `ccrm_sql_real_tasks()` (certain)

- **Use:** `public/api/time_entries_lib.php:351,355` (`ccrm_tt_one_client_project()` → `ccrm_table_exists`, defined
  `schema.php:1388`) and `:410,490` (`ccrm_tt_resolve_links()` → `ccrm_sql_real_tasks`, defined `recurring_tasks.php:23`).
- **Loaded today by:** `time_entries.php:34` (has `schema.php` and `read_scope.php`→`recurring_tasks.php`),
  `time_tracker_lib.php:15` (includers `cron.php`, `time_tracker_ext.php`, both load schema and read_scope) and
  `ticket_time_migration.php:56` (inside `schema.php`'s migration).
- **Fix:** after `public/api/time_entries_lib.php:17` add:
  ```php
  require_once __DIR__ . '/schema.php';          // ccrm_table_exists()
  require_once __DIR__ . '/recurring_tasks.php'; // ccrm_sql_real_tasks()
  ```
  Safe from the migration path too: there, `schema.php` is already loaded from the same directory, so `require_once` is
  a no-op. The file is `include`d (not `include_once`) by `ticket_time_migration.php` on purpose (`c2e6facb`). Its own
  functions are already guarded, so including it twice is fine.

#### A-05 — `mail_attachments.php` uses three `mail_broker.php` helpers (certain)

- **Use:** `public/api/mail_attachments.php:105` `get_attachments_from_structure` (def `mail_broker.php:1451`), `:119`
  `find_structure_part` (def `:1561`), `:127` `decode_imap_body` (def `:1131`), all in `ccrm_mail_keep_attachments()`.
- **Loaded today by:** `mail_broker.php:178,199` (it is mail_broker), `mail_filing.php:41` (requires mail_broker), and
  `sync.php:4713` (gets mail_broker through `task_reminders.php:21`).
- **Fix:** after `public/api/mail_attachments.php:22` add `require_once __DIR__ . '/mail_broker.php';`.
  Safe: `mail_broker.php` requires `auth.php` (line 3), then `return`s at line 12 unless it is the requested script. When
  it *is* the requested script, `require_once` of it is a no-op. Its own `require_once 'mail_attachments.php'` calls sit
  inside request branches after that return.

#### A-06 — `demo_mailbox.php` has no requires at all (certain)

- **Use:** `public/api/demo_mailbox.php:154,290` `ccrm_mail_event_id` (def `mail_broker.php:651`); `:548,561`
  `ccrm_safe_upload_name` (def `auth.php:1583`); `:567` `ccrm_uploads_dir` (def `auth.php:1697`).
- **Loaded today by:** `mail_broker.php:273` (the only caller of `ccrm_demo_mailbox_list_entry` / `…_handle`),
  `demo_seed/email.php:20`, `demo_seed/wipe.php:285,344`, `mail_filing.php:327` and `summarize_email.php:89`.
  These five other includers only call functions that need nothing.
- **Fix:** insert at `public/api/demo_mailbox.php:22` (after the docblock, before
  `const CCRM_DEMO_MAIL_HOST`):
  ```php
  require_once __DIR__ . '/auth.php';        // ccrm_safe_upload_name(), ccrm_uploads_dir()
  require_once __DIR__ . '/mail_broker.php'; // ccrm_mail_event_id()
  ```
  Same safety argument as A-05. Also safe in `php ccrm demo:seed`: there `SCRIPT_FILENAME` is `ccrm`, so mail_broker
  returns after declaring its functions.

#### A-07 — `passkeys_lib.php` uses `ccrm_start_session()` (certain)

- **Use:** `public/api/passkeys_lib.php:334,347,360` (def `auth.php:69`).
- **Loaded today by:** `passkeys.php:9` (which loads `auth.php` first) and `scripts/test-passkeys.php`.
- **Fix:** insert `require_once __DIR__ . '/auth.php';` at `public/api/passkeys_lib.php:8` (after
  `declare(strict_types=1);` on line 2, before the autoload block at line 9). The `use` statements further down stay
  valid, because a top-level `require_once` may come before them.

#### A-08 — `Swarm/SwarmManager.php` uses `ccrm_ai_upgrade_model()` (certain)

- **Use:** `public/api/Swarm/SwarmManager.php:313` (`getResumeState()`); def `auth.php:2215`.
- **Loaded today by:** `swarm.php:39` (has `auth.php`; the only caller of `getResumeState()`, at `swarm.php:388`) and
  `demo_seed/sai.php:23`. The demo seeder (including `php ccrm demo:seed`, which does not load `auth.php`) never calls
  `getResumeState()`.
- **Fix:** after `use Exception;` (`SwarmManager.php:5`) add `require_once dirname(__DIR__) . '/auth.php';`.
  The call is unqualified inside `namespace CCRM\Swarm`, so PHP falls back to the global function, which is correct.

#### A-09 — `demo_seed/leave.php` uses `ccrm_default_settings_for_language()` (certain)

- **Use:** `public/api/demo_seed/leave.php:138`; def `schema.php:3137`.
- **Loaded today by:** `wipe_demo.php:15` (which loads `schema.php` at line 14).
- **Fix:** after `public/api/demo_seed/leave.php:30` add `require_once dirname(__DIR__) . '/schema.php';`.
  `demo_seed/finance.php:42` and `lookup.php:51` already load it lazily, so this is the same dependency made
  unconditional.

#### A-10 — `integration_*` sub-modules rely on `integration.php`'s load order (certain)

- **Uses** (definitions in `integration_lib.php` / `integration_tasks.php` / `recurring_tasks.php`):
  - `integration_tasks.php`: `ccrm_int_fail` (17 lines, def `integration_lib.php:47`), `ccrm_int_parse_iso` (`:416`),
    `ccrm_int_clean_text` (`:383`), `ccrm_int_json_object` (`:347`), `ccrm_int_has_scope` (`:198`),
    `ccrm_sql_real_tasks` (lines 493, 529, 660, 693, 761, 867, 877, 893; def `recurring_tasks.php:23`).
  - `integration_directory.php`: `ccrm_int_fail` (102), `ccrm_int_query_int` (98-99, def `integration_tasks.php:668`),
    `ccrm_int_base_url` (142, `:107`), `ccrm_int_local_zone` (143, `:117`).
  - `integration_whatsapp.php`: `ccrm_int_fail`, `ccrm_int_json_object`, `ccrm_int_clean_text` (integration_lib), and
    `ccrm_int_local_zone`, `ccrm_int_user_directory` (`:52`), `ccrm_int_task_user` (`:201`), `ccrm_int_audit` (`:408`),
    `ccrm_int_task_row_exists` (`:208`), `ccrm_int_parse_chat_path` (`:188`), `ccrm_int_message` (`:80`)
    (integration_tasks).
- **Loaded today by:** `integration.php:32-37` (schema, lib, directory, tasks, whatsapp, ai, in that order). The test
  harness `scripts/test-integration-lib.php` loads only lib and tasks.
- **Fix:** add above the first `if (!function_exists(` of each file:
  - `public/api/integration_tasks.php` (before line 17):
    ```php
    require_once __DIR__ . '/integration_lib.php';
    require_once __DIR__ . '/recurring_tasks.php'; // ccrm_sql_real_tasks()
    ```
  - `public/api/integration_directory.php` (before line 7) and `public/api/integration_whatsapp.php` (before line 10):
    ```php
    require_once __DIR__ . '/integration_lib.php';
    require_once __DIR__ . '/integration_tasks.php';
    ```
  All three targets are guarded libraries without top-level code.

#### A-11 — `mcp_ext*.php` rely on `mcp.php`'s load order for each other and for shared libraries (certain)

`mcp.php:30-35` loads `auth.php`, `read_scope.php`, `mcp_ext.php`, `mcp_ext_ops.php`, `mcp_ext_writes.php`,
`mcp_ext_intel.php`. The four `mcp_ext*` files have no requires at all, and they call into each other in every
direction:

| File | Uses from | Examples (line → def) |
|---|---|---|
| `mcp_ext.php` | `mcp_ext_intel.php`, `read_scope.php`, `auth.php` | `mcp_is_client_record` 135→intel:31; `ccrm_is_salary_finance_row` 306→read_scope:444; `ccrm_anonymise_salary_finance_row` 307→:452; `ccrm_project_status_defs` 786,835→auth:924; `ccrm_offer_status_group` 1054→auth:1130 |
| `mcp_ext_ops.php` | `mcp_ext.php` (12 fns + `MCP_NOT_MINE`), `mcp_ext_intel.php`, `recurring_tasks.php` | `mcp_round2`, `mcp_config_json`, `mcp_require_string`, `mcp_enum`, `mcp_limit`…; `mcp_client_url` 331→intel:42; `ccrm_sql_real_tasks` 85,336,413,441 |
| `mcp_ext_writes.php` | `mcp_ext.php` (17 fns), `mcp_ext_ops.php`, `mcp_ext_intel.php`, `auth.php` (8 status/VAT helpers), `recurring_tasks.php` | `mcp_tx`, `mcp_number`, `mcp_new_id`…; `mcp_client_profiles` 317→ops:126; `ccrm_default_vat_rate` 372,455→auth:1153; `ccrm_sql_real_tasks` 235,280,299,306 |
| `mcp_ext_intel.php` | `mcp_ext.php` (15 fns + `MCP_NOT_MINE`), `mcp_ext_ops.php`, `auth.php`, `recurring_tasks.php` | `mcp_round2`, `mcp_today`, `mcp_currency`…; `mcp_done_task_state` 459→ops:15; `mcp_open_task_sql` 916→ops:21; `ccrm_sql_real_tasks` 450,712,922 |

- **Fix:** insert after each file's docblock (before the first statement: `mcp_ext.php:24`, `mcp_ext_ops.php:15`,
  `mcp_ext_writes.php:23`, `mcp_ext_intel.php:21`):
  - `mcp_ext.php`:
    ```php
    require_once __DIR__ . '/auth.php';
    require_once __DIR__ . '/read_scope.php';
    require_once __DIR__ . '/mcp_ext_intel.php';
    ```
  - `mcp_ext_ops.php`:
    ```php
    require_once __DIR__ . '/recurring_tasks.php';
    require_once __DIR__ . '/mcp_ext.php';
    require_once __DIR__ . '/mcp_ext_intel.php';
    ```
  - `mcp_ext_writes.php`:
    ```php
    require_once __DIR__ . '/auth.php';
    require_once __DIR__ . '/recurring_tasks.php';
    require_once __DIR__ . '/mcp_ext.php';
    require_once __DIR__ . '/mcp_ext_ops.php';
    require_once __DIR__ . '/mcp_ext_intel.php';
    ```
  - `mcp_ext_intel.php`:
    ```php
    require_once __DIR__ . '/auth.php';
    require_once __DIR__ . '/recurring_tasks.php';
    require_once __DIR__ . '/mcp_ext.php';
    require_once __DIR__ . '/mcp_ext_ops.php';
    ```
  The mutual requires form a cycle. That is harmless here: all four files contain only function declarations and
  top-level `const`s that are read inside functions only, and a `require_once` of a file that is still loading is a
  no-op. The files are unguarded (C-01), but they are only ever loaded from one directory.
- **Not covered by this fix:** `mcp_can`, `mcp_audit` and `mcp_task_scope` (defined in `mcp.php` itself). See A-12.

#### A-12 — `mcp_ext*.php` use `mcp.php`'s request-scoped helpers (needs judgement)

- **Uses:** `mcp_can` (def `mcp.php:187`) in `mcp_ext.php` (136, 306, 807, 834), `mcp_ext_ops.php` (333, 340, 345, 683),
  `mcp_ext_writes.php` (801) and `mcp_ext_intel.php` (18 lines). `mcp_audit` (def `mcp.php:206`) in `mcp_ext_ops.php`
  (429, 454) and `mcp_ext_writes.php` (11 lines). `mcp_task_scope` (def `mcp.php:1445`) in ops (335, 412, 440), writes
  (234, 298) and intel (446, 709, 917).
- **Why the obvious fix is wrong:** `mcp.php` is the endpoint. Requiring it from a sub-module would run the whole MCP
  request. `mcp_can` also reads the globals `$mcp_perms` / `$mcp_is_admin` that `mcp.php:129-130` sets per request.
- **Options:** (a) allowlist: declare `mcp_ext*.php` sub-modules of `mcp.php` that may use exactly these helpers, and
  have the guard test assert they are required only by `mcp.php` (rule G3 in §5); or (b) move `mcp_can`, `mcp_can_edit`,
  `mcp_audit` and `mcp_task_scope`, plus the two globals, into a new `mcp_lib.php` that `mcp.php` and the sub-modules
  both require.
- **What decides it:** whether anything other than `mcp.php` will ever load these modules. **Recommendation:** (a).
  It changes no behaviour and the guard test keeps it honest.

#### A-13 — `ticket_time_migration.php` uses `ccrm_table_exists()` (certain)

- **Use:** `public/api/ticket_time_migration.php:50` (twice); def `schema.php:1388`.
- **Loaded today by:** `schema.php:2079` only (inside `ccrm_migrate_time_tracking()`).
- **Fix:** add `require_once __DIR__ . '/schema.php';` after `<?php` (line 1). The cycle with `schema.php` is a no-op.
  Side effect to expect: this file is part of `ccrm_schema_fingerprint()` (`schema.php:3420`), so editing it makes every
  install re-apply the schema once after deploy. That is idempotent and the normal cost of a schema-file change.

### 3.4 Frontend

#### G-01 — `window.ccrmCurrentUser` is read but never assigned (certain)

- **Uses:** `src/components/ClientsView.tsx:1979`, `src/components/FinancialManagementView.tsx:3905,4026`,
  `src/components/ProjectDetailsView.tsx:920,1001`, each as `(window as any).ccrmCurrentUser?.email || "Admin"`.
- **Definition:** none, anywhere, ever (`git log -S"ccrmCurrentUser ="` is empty). `tsc` cannot see it because of the
  `as any`.
- **Symptom:** always. An invoice created from a client's detail (ClientsView), a financial record created or edited
  without an existing author (FinancialManagementView), and the project-detail invoice and record forms are all saved
  with `createdBy: "Admin"`. The server would fill in the real author (`sync.php:5966` `$fr['createdBy'] ?? $sessionEmail`,
  `:6095` for invoices), but only when the field is absent.
- **Fix:** stop sending a fake author and let the server stamp the session user. In all five places replace
  `(window as any).ccrmCurrentUser?.email || "Admin"` with `undefined`, keeping any existing value first
  (e.g. `FinancialManagementView.tsx:3905` becomes `createdBy: existing?.createdBy || undefined`).
  `JSON.stringify` drops `undefined`, so the server's `?? $sessionEmail` applies. Alternative where a `currentUser` prop
  exists (`ClientsView` line 145, `ProjectDetailsView` line 119): `currentUser?.email`. `FinancialManagementView` has no
  such prop, so `undefined` is the uniform fix.

#### G-02 — `window._latestTranscription` is read but never assigned (certain, dead code)

- **Uses:** `src/components/ClientsView.tsx:2739,2928-2929`, `src/components/LeadsDatagrid.tsx:3667-3668,3769-3770`.
- **Definition:** none, ever. Transcriptions are embedded into the note's content instead (`LeadsDatagrid.tsx:1633-1640`).
- **Symptom:** none visible. `newEvent.transcription` is always `undefined`.
- **Fix:** delete the reads, the deletes and the `transcription:` property that depends on them. No behaviour change.

### 3.5 Class H (new): the same class defined in two files, one of them autoloadable

#### H-01 — stale `CCRM\Swarm` classes in `src-php/Swarm/` (needs judgement)

- `src-php/Swarm/SwarmManager.php` and `src-php/Swarm/CrmContextExtractor.php` declare the same classes as
  `public/api/Swarm/*.php` (namespace `CCRM\Swarm`). The `src-php` copies are older: no `created_by` ownership column,
  no healing. `composer.json` maps `"CCRM\\": "src-php/"`, so once `vendor/autoload.php` is loaded (passkeys, the CLI),
  any reference to `CCRM\Swarm\SwarmManager` *before* `public/api/Swarm/SwarmManager.php` is required autoloads the stale
  copy. A later `require_once` of the public copy then fails with `Cannot declare class CCRM\Swarm\SwarmManager`.
- **Today:** latent. `swarm.php:39-40` and `demo_seed/sai.php:23` require the public copies before any use.
- **Options:** delete `src-php/Swarm/` (nothing in the repo references those paths), or exclude it from the PSR-4 map.
- **What decides it:** whether the Composer-package distribution needs `CCRM\Swarm` via autoload. Nothing in the repo
  shows that it does.

### 3.6 Items that need judgement (summary)

| ID | Decision needed | Recommendation |
|---|---|---|
| A-12 | Allowlist `mcp_ext*.php` as sub-modules of `mcp.php`, or extract `mcp_lib.php` | Allowlist, plus guard rule G3 |
| F-03 | Heal the 65 October columns now, or baseline all 177 and enforce only new ones | Baseline, plus rule G7 |
| B-01 | Make the five hard `require_once …/config.php` endpoints use the standard lookup (root, then `public/`, else 503) | Yes, low priority |
| C-01 | Wrap the 24 unguarded libraries in `function_exists` guards now (prevention), or only when a second load path appears | Guard only `read_scope.php`, `recurring_tasks.php` (partly guarded), `task_reminders.php`, `mail_filing.php`, `mail_attachments.php`, `demo_mailbox.php` and `agent_utils.php` (reachable from `php ccrm demo:seed`); enforce rule G5 for the CLI-reachable set |
| H-01 | Delete `src-php/Swarm/` | Delete, after confirming the Composer package does not need it |
| Passkeys | `passkeys.php`/`passkeys_lib.php` fatal with "Class not found" if `vendor/autoload.php` is missing | Leave as is (composer install is part of every deploy); allowlist |

### 3.7 Other classes: findings with no bug

- **B-01 (needs judgement, low):** `error_logs.php:3`, `integration_admin.php:15`, `mcp_keys.php:11`, `waai_demo.php:15`
  and `waai_sso.php:16` do a hard `require_once dirname(__DIR__)|__DIR__/../config.php`. Every other endpoint looks in
  the app root, then `public/`, and answers 503 if neither exists (`auth.php:100-111`; `setup.php:72-77` documents that
  config may live in either place). Symptom: on an install whose `config.php` sits in `public/`, and before install,
  these five endpoints die with a PHP fatal (500) instead of working or answering 503. Fix: copy the
  `$configFile = dirname(__DIR__) . '/config.php'; if (!file_exists($configFile)) $configFile = dirname(__DIR__) . '/public/config.php'; if (!file_exists($configFile)) { http_response_code(503); …; exit; } require_once $configFile;`
  pattern from `license.php:26-35`.
- **C:** no `Cannot redeclare` is possible today. `php ccrm update` loads only `{dir}/license_client.php` (requires
  nothing) before `git pull`. After publish it loads only `dist/api/…`. The two sets do not overlap, and
  `license_client.php` is not re-required later. `demo:seed`, `backfill-clients` and `adjustment-clients` load
  everything from one `{dir}`. Note for the future: a **guarded** file loaded from two trees does not fatal, it silently
  keeps the *first* (older) definitions. Never add a `require` to `license_client.php`.
- **D:** `php -l` on all 227 PHP files (`public/`, `src-php/`, `scripts/`, `ccrm`) in `php:8.2-cli`: 0 errors. The only
  file the CLI compiles before `git pull` is `license_client.php`, and nothing re-requires it after the pull, so the
  `c2e6facb` trap (a failed compile remembered by `require_once`) cannot happen today.
- **E:** `$pdo`/`$db_connection_error` are read through `global` only in functions that load config themselves
  (`ccrm_auth_pdo`, `ccrm_log_exception`, `demo_reseed_http`). `mail_broker.php`'s `$GLOBALS['pdo']` and
  `$GLOBALS['userEmail']` are `isset()`-checked, and `fetch_imap_emails()` has one caller (`mail_broker.php:296`).
  `$mcp_perms`/`$mcp_is_admin` stay within mcp (see A-12). `$ccrm_delete_blocked` stays within sync.php, and
  `$ccrm_vec_warnings` within vector_index.php. Optional config constants (`CCRM_SECRET_KEY`, `CCRM_APP_URL`,
  `CCRM_ALLOW_PRIVATE_HOSTS`, `CCRM_MCP_ALLOW_QUERY_TOKEN`) are always behind `defined()`. Every file that reads
  `$_SESSION` starts the session through `auth.php`.
- **F-04 DDL in a transaction:** 0. The 15 raw hits were `ccrm_audit_log()` and `ccrm_trigger_workflow()` called
  inside the sync transaction. Both run their DDL only under `if (!$pdo->inTransaction())` (`auth.php:1951`,
  `workflows_engine.php:696`). `setup.php` seeds after its commit.
- **F-05 migration order / F-06 forward foreign keys:** 0. The check inlines every helper `ccrm_apply_migrations()`
  calls, in order. Proven on a fixture (§7.3). It cannot reproduce `b8f9569c`: at `b8f9569c~1` `orders` was already in
  the base `CREATE TABLE` list, so the static order was correct, and that fix guarded a runtime path.
- **Lazily created tables:** `user_passkeys`, `login_attempts`, `rate_limits`, `webhook_events`, `demo_mail_messages`,
  `swarm_simulations`, `client_adjustment_migration`, and the RAG database's `chat_history`/`rag_*` are created by their
  own code, not by `schema.php`. Every reader either calls the ensure function first, checks `SHOW TABLES`, or catches
  the error (e.g. `sync.php:3928` deleting passkeys). Not a bug. Listed so nobody "fixes" it by accident.
- **G (rest):** `npm run typecheck` 0 errors. No `@ts-nocheck`, `@ts-ignore` or `@ts-expect-error` in `src/` (outside
  tests). The excluded `demoFixture.ts` is imported only by tests. All dynamic imports are type-checked: the 23 lazy
  views in `App.tsx:182-204` (`then(m => ({ default: m.X }))`), `lazy(() => import('./dev/UiGallery.tsx'))` in
  `main.tsx:22` and a JSON import in `EmojiPicker.tsx:67`. 0 cycles in the value-import graph (500 files). `declare module`
  shims exist only for `agentation` and `ogl`, which are real dependencies. Other `window.*` globals (`showToast`,
  `showUndoToast`, `ccrmFlushSync`, `previewFile`, `__draggedModuleId`, `leads`, `lastRecordedAudio*`) are all assigned
  in `App.tsx` or their component.

---

## 4. False positives (for the guard test's allowlist)

### 4.1 Class A

| Pattern | Groups | Why it is safe | Allowlist rule |
|---|---|---|---|
| `scripts/**` (test harnesses, seeders, `demo-assert/*`, Villatesta import) | 102 | Not deployed. They load the app through variable paths the scanner does not resolve (`$apiDir . '/auth.php'`, `$root . '/api/…'`, `$demoSeedDir . '/helpers.php'`, `require $f` loops in `test-demo-seed.php`) | Scan `public/`, `ccrm` and `src-php/` only. Treat `scripts/` as informational |
| `ccrm:122,124,193` (`ccrm_apply_schema`, `demo_reseed_cli`, `ccrm_undo_adjustment_clients`) | 3 | Loaded by a `foreach ([api, dist/api, public/api]) if (file_exists) require` search loop. The function exits if nothing loaded (`$loaded` / a sibling `function_exists` check) | `file: ccrm` + loaded through a dynamic `{dir}` require in the same function |
| `src-php/ComposerPlugin.php` `Composer\Plugin\PluginInterface`, `Composer\EventDispatcher\EventSubscriberInterface`, `Composer\Script\ScriptEvents` | 3 | Provided by Composer itself when it runs the plugin | Namespace prefix `Composer\` in `src-php/ComposerPlugin.php` |
| `src-php/ComposerPlugin.php` `CCRM\Installer` | 1 | PSR-4 autoload (`CCRM\` → `src-php/`) inside Composer | Classes under `CCRM\` that exist in `src-php/` |
| `passkeys.php` / `passkeys_lib.php` `Webauthn\…`, `Cose\…`, `ParagonIE\…`, `Symfony\…` | 25 | `passkeys_lib.php:9-21` loads `vendor/autoload.php` from a list of candidate paths when the classes are missing. A missing vendor dir is a broken deploy, not a load-order bug | Classes under a Composer PSR-4 prefix (read from `composer.lock`), used in a file whose require graph contains `vendor/autoload.php` |
| `seed_demo_data.php:39` `get_db_connection` | 1 | CLI-only. Loads config through an `if/elseif file_exists` pair with a Docker fallback | `file_exists`-guarded config load in a CLI-only file |

Patterns the scanner already recognises as safe (they never reach the report): `if (function_exists('x')) { x(); }`,
`function_exists('x') && x()`, `function_exists('x') ? x() : …`, `if (!function_exists('x')) { return …; }` followed by
`x()`; a require earlier in the same block (lazy loading); a require inside `if (!function_exists(…))` or
`if (file_exists(…))` (it counts for the enclosing block); a require inside a same-file helper called earlier in the same
block (`ccrm_cli_pdo()` → `ccrm_license_*`); top-level functions in a file that `return`s early.

### 4.2 Class B

- 8 unresolved requires, all intentional: `demo_seed/index.php:283` (`require_once $file` over the module list),
  `demo_seed/packs.php:56` (`$data = require $path`, a data file), and the rest in `scripts/` (`$schemaFile`,
  `$seedFile`, `$f`, `$demoSeedDir`).
- `seed_demo_data.php:27,33` and `passkeys_lib.php:15`: absolute `/var/www/html/…` paths, always as a `file_exists`
  fallback after a `__DIR__` path. Docker-only. Harmless.
- `public/dump_schema.php` not mirrored to the root. Intentional (`sync-backend.mjs:41`).

### 4.3 Class E

All 12 raw items in §3.7 E are guarded (`defined()`, `isset($GLOBALS…)`, `global` together with a local config load).

### 4.4 Class F

- `generate_dashboard.php:66`: table `query`. Prompt text sent to the AI ("…FROM query"), not SQL. Allowlisted in
  `SQL_IGNORE_TABLES`.
- 15 DDL-in-transaction hits that are behind `if (!$pdo->inTransaction())`. The check now recognises that guard, so
  they no longer appear.
- 134 "column outside schema.php" notes on the lazily created tables in §3.7. Informational only. Do not enforce.

---

## 5. Proposed guard-test rules (part 2)

Shape: a `node --test` file under `src/` (so `npm run test:unit` and CI run it, with no PHP needed) that imports
`runAudit()` / `runSqlAudit()` from `scripts/audit-undefined-symbols.mjs` and asserts the following. The CI runner has
Node only, which is why the scanner is pure JS.

**Reliable enough to fail CI:**

| # | Rule | Today after part 2 fixes |
|---|---|---|
| G1 | No class A finding of severity `broken` in `public/`, `ccrm` or `src-php/` (a name that exists nowhere), except the `Composer\` prefix in `src-php/ComposerPlugin.php` | 0 |
| G2 | No class A finding of *any* severity in `public/` outside the allowlist (§4.1 and A-12). **Severity must not be used as a filter:** at `80a0a76c~1` the real bug showed as `conditional` (§7.3) | 0 |
| G3 | `mcp_ext*.php` are required only by `mcp.php` and each other (keeps A-12's allowlist honest) | holds |
| G4 | Literal SQL in `public/` names no table or column that is missing from the schema model (`unknown-table`, `unknown-column`), except `SQL_IGNORE_TABLES` | 0 after F-01 |
| G5 | Every file reachable from `schema.php`'s or `license_client.php`'s require graph declares functions/classes only inside a `function_exists`/`class_exists` guard (the files `php ccrm update` loads from two trees) | holds (currently only `config.php`, which is generated and excluded) |
| G6 | No DDL, direct or through a project function, between `beginTransaction()` and `commit()`/`rollBack()` in the same function, unless behind `!$pdo->inTransaction()` | 0 |
| G7 | Every column `sync.php` writes that a `schema.php` migration adds is healed before `beginTransaction()`, **or** is in a frozen baseline list committed with the test (the 177 of F-03, minus whatever part 2 heals) | after F-02: baseline 175 |
| G8 | No migration touches a table before the migration that creates it. No base `CREATE TABLE` has a foreign key to a later table | 0 |
| G9 | Every `(window as any).X` / `window.X` that `src/` reads is assigned somewhere in `src/` (a regex check, separate from the PHP scanner) | 0 after G-01/G-02 |

**Too noisy to enforce, keep as a report:**

- Severity triage (`broken-via-entry` / `conditional` / `latent`): useful to read, but its "maybe" status
  over-approximates (every conditional require in an entry point's graph counts).
- `column-outside-schema` (lazily created tables).
- `scripts/**` findings.
- Unguarded declarations outside the CLI-reachable set (C-01): 81 files, mostly entry points that are only ever the
  main script.

**Needs a CI change (recommend, not blocking):** `php -l` on every file. The runner has no PHP. Add
`shivammathur/setup-php@v2` with PHP 8.2 and run
`find public src-php -name '*.php' -not -path '*/uploads/*' -print0 | xargs -0 -n1 php -l && php -l ccrm`.
This is the only check that catches `c2e6facb` (a parse error in a file that the CLI then caches).

---

## 6. Out of scope / deferred

- **Merging `main` into `1.13-nectarine`:** 56 commits on `main` are not on this branch. Only one backend PHP fix is
  unported (`fbeedd81`, folded into F-02). The rest are QA/test fixes or were cherry-picked under new hashes
  (`f122128d`, `e6805822`, `5d9d9fec`). Whether to merge is a release decision.
- **F-03's 65 October columns:** see §3.2. Needs the owner's call on install age.
- **Verifying F-02 against a real database:** reproducing the 500 needs a database with the column dropped and the
  fingerprint stamped. Not done (no real database was touched).
- **`passkeys` without vendor:** a missing vendor dir means a broken deploy, so a friendlier message is a product
  choice, not a load-order fix.
- **Runtime order inside a request** (e.g. a function defined in `sync.php` after the line that first calls it during
  top-level execution): PHP hoists unconditional top-level functions, so this only matters for *conditional*
  definitions. The scanner reports conditional definitions as definitions. I found none being called before their
  condition runs, but this was not proven exhaustively.
- **`scripts/**` correctness:** their variable require paths make them invisible to the scanner. Their own test runs
  cover them.

---

## 7. Scanner usage

### 7.1 Files

| File | Role |
|---|---|
| `scripts/audit-undefined-symbols.mjs` | CLI and `runAudit()` / `runSqlAudit()` / `triage()` (importable) |
| `scripts/lib/php-symbol-audit.mjs` | PHP lexer and per-file analysis: `tokenize`, `analyzeFile`, `buildIndex`, `findUndefinedUses`, `findUnguardedDeclarations`, `resolveRequirePath`, `isUnconditional` |
| `scripts/lib/sql-audit.mjs` | Class F: `buildSchemaModel`, `sqlReferences`, `findSqlNameIssues`, `findDdlInTransactions`, `findUnhealedSyncColumns`, `findMigrationOrder`, `findForwardForeignKeys` |
| `scripts/lib/php-builtins.json` | Built-in functions, classes and constants of PHP 8.2.33 in the `crm` container (extensions: Core, ctype, curl, date, dom, fileinfo, filter, hash, iconv, imap, json, libxml, mbstring, mysqlnd, openssl, pcre, PDO, pdo_mysql, pdo_sqlite, Phar, posix, random, readline, Reflection, session, SimpleXML, sodium, SPL, sqlite3, standard, tokenizer, xml, xmlreader, xmlwriter, Zend OPcache, zip, zlib). Refresh with `--refresh-builtins`. If production adds an extension (gd, intl, bcmath…), its functions would show up as `broken` until refreshed |

No PHP binary and no Docker are needed to run it. A full scan takes about 1 s on the working tree, and about 10 s with
`--rev` (one `git show` per file).

### 7.2 Commands and output

```bash
node scripts/audit-undefined-symbols.mjs                  # class A grouped by severity
node scripts/audit-undefined-symbols.mjs --sql            # + class F
node scripts/audit-undefined-symbols.mjs --requires       # + unresolved and conditional requires (class B)
node scripts/audit-undefined-symbols.mjs --unguarded      # + unguarded declarations (class C)
node scripts/audit-undefined-symbols.mjs --via            # + the entry points behind every finding
node scripts/audit-undefined-symbols.mjs --rev <commit>   # scan any revision, never touching the checkout
node scripts/audit-undefined-symbols.mjs --only tickets.php,read_scope.php
node scripts/audit-undefined-symbols.mjs --json out.json  # findings, unguarded files, unresolved requires
```

Output lines look like this:

```
## broken (5) — defined nowhere in the project and not a PHP built-in
  public/api/tickets.php:48,172  function ccrm_decrypt_settings_secrets in ccrm_load_ticket_settings()
## conditional (39) — the definition is loaded only on some paths of the entry points that reach the use
  public/api/task_reminders.php:190  function ccrm_sql_real_tasks in ccrm_process_task_reminders() — defined in public/api/recurring_tasks.php:23, public/api/schema.php:1396
      via: public/api/demo_reseed.php [maybe], public/api/mail_broker.php [maybe], … (+48 ok)
### Tables or columns that exist nowhere (4)
  public/api/agent_utils.php:674  unknown-column tasks.due_date in build_comprehensive_crm_rag_context()
```

Severity: `broken` = defined nowhere. `broken-via-entry` = some entry point can never load it. `conditional` = an entry
point loads it only on some paths. `latent` = every current entry point loads it first. All four violate the rule. The
severity only says how lucky the code currently is.

How it decides "loaded": a definition counts if it is in the file itself, in the file's **unconditional top-level
require closure** (requires inside `if (!function_exists)` guards and `if (file_exists)` checks count; requires inside
functions, branches, `try` or loops do not), in a require earlier in an enclosing block, or behind a
`function_exists` check. Requires into `api/`, `dist/` and `/var/www/html/` are folded onto `public/`. `config.php` is
synthesised from the setup wizard's template (it is not in git). `vendor/autoload.php` defines every class under a
`composer.lock` PSR-4 prefix.

### 7.3 Proof that it catches the known bugs

```
$ node scripts/audit-undefined-symbols.mjs --rev 80a0a76c~1 --only sync.php
Undefined-symbol audit — 80a0a76c~1 — 226 PHP files, 9806 ms
## conditional (2) — the definition is loaded only on some paths of the entry points that reach the use
  public/sync.php:6297,6303,6341  function ccrm_employee_file_key — defined in public/api/employee_files.php:152 — this file loads it only inside if block (line 2929) (line 4710)
      via: public/sync.php [maybe]
  public/sync.php:7083  function ccrm_employee_private_gc — defined in public/api/employee_files.php:134 — this file loads it only inside if block (line 2929) (line 4710)
      via: public/sync.php [maybe]

$ node scripts/audit-undefined-symbols.mjs --rev ed884d4a~1 --only read_scope.php,dashboard_query.php
Undefined-symbol audit — ed884d4a~1 — 225 PHP files, 9718 ms
## broken-via-entry (2) — an entry point reaches the use with no way to load the definition
  public/api/dashboard_query.php:426,433,549  function ccrm_sql_real_tasks — defined in public/api/recurring_tasks.php:23, public/api/schema.php:1394
      via: public/api/dashboard_query.php [missing]
  public/api/read_scope.php:488  function ccrm_sql_real_tasks in ccrm_visible_task_ids() — defined in public/api/recurring_tasks.php:23, public/api/schema.php:1394
      via: public/api/agent_utils.php [missing], public/api/ai_usage.php [missing], public/api/chat_rag.php [missing], …
```

At `80a0a76c~1` the severity is `conditional`, not `broken`: `schema.php` *does* load `employee_files.php`, but only
inside a migration, which is exactly the mechanism of that bug. G2 must therefore fail on every severity.

Class F checks against synthetic fixtures (an `ALTER` before its migration's `CREATE`, a forward foreign key, DDL and a
DDL-running helper inside a transaction, an `inTransaction()`-guarded `CREATE`, and an aliased join). All are detected,
and the guarded one is not reported. Run the same fixtures in the part 2 guard test.

### 7.4 Known limits

- The lexer is not PHP's tokenizer. It handles heredoc/nowdoc, `?>` inside `//` comments, `#[` attributes, braceless
  `if`, `else if`, closures, `use` imports and namespaces. It does not evaluate expressions, so a require path built from
  a variable is reported as unresolved unless it matches a known pattern (`$configFile`, `$schemaFile`,
  `__DIR__ . $dir . '/x.php'`, `*autoload*`).
- Inter-procedural loading is followed only one level, within the same file.
- SQL: only string literals are checked. A table or column list assembled at runtime (`{$table}`, `implode($cols)`) is
  skipped. Columns added by `foreach` over a literal array before `ALTER … ADD COLUMN \`{$name}\`` are recognised.
- Constants: only `UPPER_CASE` bare identifiers are checked. Lower-case bare names are type hints, labels or named
  arguments.
