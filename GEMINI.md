# CCRM Agent Memory & Workspace Rules

## Core Guidelines & Workflow

### 0. Test Before You Ship

- **Run the QA audit when a feature or fix is finished**, before the version bump
  and build commit: `npm run test:unit` then `npm run test:qa`.
- Full guide: [`docs/TESTING.md`](docs/TESTING.md). Deep reference:
  [`.agents/skills/ccrm-qa-audit/SKILL.md`](.agents/skills/ccrm-qa-audit/SKILL.md).
- No Docker, PHP or database needed - the suite mocks the backend and seeds its
  own data, so it never touches real records.
- Results are saved per run in `test-results/runs/<timestamp>-<kind>/`; the
  latest is always `test-results/qa-audit-report.md`.
- `npm run deploy` re-runs the gate and aborts the deploy if it fails.
- Never make a finding disappear by loosening the check.

The order when finishing a change: **test -> bump version -> changelog -> build
-> commit**.

### 1. Commit & Version Bumping Protocol

- **Commit After Every Significant Change**: Make atomic, clean git commits after completing each feature, fix, or significant modification.
- **One Build = One Version Bump**: Every significant change, new build, or release milestone requires bumping the application version.
- **Version File**: Update `export const VERSION = "1.12.X-Mango";` in [`src/utils/version.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/version.ts).
- **Changelog**: Add a structured entry in [`1.12-mango-changelog.md`](file:///Users/erik/Documents/vibe%20coding/crm/1.12-mango-changelog.md) with date and clear breakdown.
- **Commit Message Suffix**: Append the version tag to commit messages (e.g. `feat(...): description (v1.12.X-Mango)` or `fix(...): description (v1.12.X-Mango)`).

### 2. Verification & Build Cleanliness

- Use `npx tsc --noEmit` to verify TypeScript types without generating unwanted `dist/` changes.
- If `npm run build` is run during validation, clean up `dist/` (`git checkout -- dist/ && git clean -fd dist/`) unless explicitly creating a deployment bundle.

### 3. News & Product Updates Management

- **Managed Exclusively via Craft CMS**: All news, release notes, and product update entries must be managed exclusively through Craft CMS (via GraphQL API `entries(section: "updateNotes", site: "*")`).
- **No Hardcoded or Local DB Entries**: News and update entries must NEVER be hardcoded in client source code or stored in the application's local database.

### 4. Projects List - Totals Row

- The projects list (table view) ends with a **Totals** row. It sums every visible column declared in `SUMMABLE_PROJECT_COLUMNS` in [`src/utils/projectColumns.ts`](src/utils/projectColumns.ts) - today `value` and `invoicable`.
- **When you add a countable column or field** (an amount, quantity, hours, a count - anything where a total means something): add one line to `SUMMABLE_PROJECT_COLUMNS` saying how a project feeds it, and add a case to `src/utils/projectColumns.test.ts`. `ProjectsView.tsx` does not need to change.
- Money is summed per currency, never across currencies. Do not register columns where a total is meaningless (dates, ratings, percentages, text).
- Full rule: [`.agents/rules/project-totals.md`](.agents/rules/project-totals.md).

### 5. Database Schema, Migrations & `sync.php` Column Healing

- **The 4-Place Rule for New Columns**: Whenever you add a column to a table written by `sync.php` (or queried by name in `api/*.php`), you **must** update all 4 places in the same commit:
  1. `CREATE TABLE IF NOT EXISTS` in `public/api/schema.php` (`ccrm_schema_statements()`).
  2. Idempotent migration (`if (ccrm_table_exists(...) && !ccrm_column_exists(...)) ALTER TABLE ...`) in `ccrm_apply_migrations()` in `public/api/schema.php` — placed *before* any backfill/seed step that touches the column.
  3. **Pre-transaction column healing in `public/sync.php`** right *before* `$pdo->beginTransaction()` (same pattern as `projects.value`, `projects.contact_phone`, `ai_custom_templates.layout_json`). Because `ccrm_apply_schema()` skips itself once `SCHEMA_FINGERPRINT` matches, a worker with a stale OPcache during deploy can stamp the marker without adding the column — without healing in `sync.php`, every save fails with HTTP 500 (`Unknown column '...' in 'INSERT INTO'`).
  4. Document the column in [`entities_overview.md`](entities_overview.md).
- **Never Run DDL Inside a Transaction**: `ALTER TABLE` / `CREATE TABLE` causes an implicit MySQL commit. All column healing in `sync.php` must stay above `$pdo->beginTransaction()`.
- **Included Migration Helpers**: Any file `require_once`d by `schema.php` must wrap its functions in `if (!function_exists('...'))` and be added to `ccrm_schema_fingerprint()`. Any standalone `api/*.php` endpoint calling `schema.php` helpers must `require_once __DIR__ . '/schema.php';`.
- **Mirror Backend Copies**: Always run `npm run sync:backend` so root `sync.php` and `api/*` match `public/sync.php` and `public/api/*`.
- Full rule: [`.agents/rules/database-schema-and-sync.md`](.agents/rules/database-schema-and-sync.md).

### 6. Audio Notification When Prompt Is Done

- **Play Sound on Completion**: Whenever a user prompt/task is finished, play an audible macOS notification sound (e.g. `afplay /System/Library/Sounds/Glass.aiff`) so the user knows the work is done.

