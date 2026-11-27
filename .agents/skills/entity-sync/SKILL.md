---
name: "entity-sync"
description: "Syncs database entity changes to schema.php, sync.php column healing, and entities_overview.md"
---

# Entity Sync Skill

This skill enforces database schema, migration, column-healing, and documentation integrity in this workspace.

## Context
The CCRM workspace uses a central database overview document at `entities_overview.md`.
All database table structures and dynamic schema details are declared programmatically in `public/api/schema.php` (`api/schema.php`) and `public/sync.php` (`sync.php`).

## Instructions for Agents (The 4-Place Rule)
Whenever you create a new database table or add/alter columns on an existing table, you MUST immediately complete all 4 steps in the same commit:

1. **`CREATE TABLE IF NOT EXISTS` in `public/api/schema.php`** (`ccrm_schema_statements()`): include the new table or column so fresh installs have it from the start.
2. **Idempotent migration in `public/api/schema.php`** (`ccrm_apply_migrations()`): add an `if (ccrm_table_exists(...) && !ccrm_column_exists(...)) ALTER TABLE ...` step before any backfill/seed step that uses the column. If you `require_once` a new helper file, guard its functions with `if (!function_exists(...))` and add the file to `ccrm_schema_fingerprint()`.
3. **Pre-transaction column healing in `public/sync.php`**: if `sync.php` names the column in an `INSERT` or `UPDATE`, add a `!ccrm_column_exists($pdo, ...)` check and `ALTER TABLE` right **before** `$pdo->beginTransaction()` (never inside the transaction, as DDL triggers an implicit MySQL commit). Run `npm run sync:backend` so root `sync.php` and `api/schema.php` are mirrored.
4. **Update `entities_overview.md`**: document the new table/column names, types, nullability, descriptions, and relations.

Full reference: [`.agents/rules/database-schema-and-sync.md`](../../rules/database-schema-and-sync.md).
