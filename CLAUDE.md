# CCRM — working notes for AI agents

React + TypeScript + Vite SPA with a PHP/MySQL backend. Start with
[`README.md`](README.md) for setup and deployment.

## Testing — read this before you claim something works

**[`docs/TESTING.md`](docs/TESTING.md) is the single source of truth.**

```bash
npm run test:unit     # fast: node --test over src/**/*.test.ts
npm run test:qa       # the QA audit: drives the real app in Chromium
npm test              # both
```

First time on a machine: `npm run test:qa:setup` (downloads Chromium).

The QA suite mocks `/sync.php`, `/api/*` and `/upload.php` and seeds its own
dataset — **no Docker, no PHP, no database required**, and it never touches real
data. It runs on its own port (5273), so it will not collide with, or silently
audit, a dev server from another worktree.

When asked to test the app, audit the UI, or verify a change:

1. Run `node scripts/qa/run-qa.mjs --files <files you changed>` (never plain
   `npm run test:qa`; a full run needs `--full` and is refused otherwise).
2. Read `test-results/qa-audit-report.md` — summary table first. Every run is
   also saved whole in `test-results/runs/<timestamp>-<kind>/`.
3. Report as **observed symptom → root cause → proposed fix**, grouped by root
   cause. One z-index mistake surfaces as every dropdown in a drawer.
4. The report's "proposed fix" is a hypothesis — confirm it against `src/`.
5. Never make a finding disappear by loosening a check.

Deep detail on coverage, categories and severity lives in
[`.agents/skills/ccrm-qa-audit/SKILL.md`](.agents/skills/ccrm-qa-audit/SKILL.md).

## Workflow rules

These live in `.agents/rules/` and apply to every change:

- [`qa-before-ship.md`](.agents/rules/qa-before-ship.md) — run the audit when a
  feature or fix is finished, before the build commit.
- [`commit-and-versioning.md`](.agents/rules/commit-and-versioning.md) — commit
  after every significant change; one build = one version bump in
  `src/utils/version.ts` plus a changelog entry; suffix the commit message with
  the version tag.
- [`post-build-cleanup.md`](.agents/rules/post-build-cleanup.md) — prefer
  `npx tsc --noEmit` for verification; if you ran `npm run build`, restore
  `dist/` unless you are deliberately committing a deployment bundle.
- [`news-craft-cms.md`](.agents/rules/news-craft-cms.md) — news and update notes
  come from Craft CMS only, never hardcoded or in the local database.
- [`view-size.md`](.agents/rules/view-size.md) — type, spacing and layout
  follow the per-device View size; ruleset in
  [`docs/VIEW-SIZE.md`](docs/VIEW-SIZE.md).
- [`project-totals.md`](.agents/rules/project-totals.md) — the projects list ends
  in a Totals row; a new countable column is registered in
  `SUMMABLE_PROJECT_COLUMNS` so it is totalled automatically.
- [`licensing.md`](.agents/rules/licensing.md) — a licence gates updates and
  nothing else; never let one disable part of the running app.
- [`database-schema-and-sync.md`](.agents/rules/database-schema-and-sync.md) —
  **4-place rule for every new DB column**: add to `CREATE TABLE` in
  `schema.php`, add an idempotent migration in `ccrm_apply_migrations()`, add
  **pre-transaction column healing** in `sync.php` (above `beginTransaction()`),
  update `entities_overview.md`, and run `npm run sync:backend`.

The order when finishing a change:

> **test → bump version → changelog → build → commit**

`npm run deploy` re-runs the tests and refuses to ship if they fail
(`DEPLOY_SKIP_QA=1` overrides, and means shipping unverified).

## Things that will bite you

- `npm run build` rewrites `dist/`, which is committed. Use `npx tsc --noEmit`
  to type-check without touching it.
- The root `tsconfig.json` checks nothing on its own — `npm run build` (`tsc -b`)
  is what actually type-checks `src/`.
- Clients and leads are **one table**: a client is a `leads` row with a `client-*`
  id (or `adjustment > 0`). `leads.client_id` is the link from a lead to its
  client; where it is empty the app still falls back to matching by name. Use
  `src/utils/leadClient.ts` instead of comparing names, and see the ROADMAP item
  "Clients and leads are still one table" before touching client grouping.
- `sync.php` calls `ccrm_apply_schema()` on **every** request, including the 5s
  `?probe=1` poll. It is gated by a fingerprint of `api/schema.php`,
  `employee_name.php` and `lead_client_backfill.php` (`ccrm_schema_fingerprint()`),
  so an unchanged schema costs one SELECT instead of ~2.3s of DDL. Keep schema and
  migration code inside those files; if a migration `require`s another file, add
  it to the fingerprint or edits to it will never re-run. Never put per-request
  work into a migration, and never call DDL from the poll path.
- **Adding a column to a table `sync.php` writes to without column healing causes
  production 500s (`Unknown column '...' in 'INSERT INTO'`)**: a worker running
  a cached `schema.php` during deploy can stamp `SCHEMA_FINGERPRINT` before the
  migration runs, causing `ccrm_apply_schema()` to skip itself on subsequent
  requests. Every new column written in `sync.php` **must** also be healed via
  `if (!ccrm_column_exists(...)) ALTER TABLE ...` right **before**
  `$pdo->beginTransaction()` in `public/sync.php` (never inside the transaction
  — MySQL implicitly commits on DDL). See
  [`.agents/rules/database-schema-and-sync.md`](.agents/rules/database-schema-and-sync.md).
- The backend source is `public/`; the repo-root copies (`sync.php`, `api/`) are
  mirrored by `npm run sync:backend`. Edit `public/`, then sync.
- The production server has **no build step**. The compiled frontend is built
  locally and committed to `dist/`, then published by `php ccrm update`.
