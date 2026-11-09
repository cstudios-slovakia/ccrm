# CCRM — working notes for AI agents

React + TypeScript + Vite SPA with a PHP/MySQL backend. Start with
[`README.md`](README.md) for setup and deployment.

## Testing — read this before you claim something works

**[`docs/TESTING.md`](docs/TESTING.md) is the single source of truth.**

```bash
npm run check         # THE verification: app + QA type-check, unit tests, backend mirror,
                      # undefined-symbol audit (~15 s warm; --fast skips unit tests)
npm run test:unit     # node --test over src/**/*.test.ts and scripts/**/*.test.mjs
node scripts/qa/run-qa.mjs --files <files>   # scoped browser QA (see below)
```

A `Stop` hook runs `npm run check` when you finish with changed source and sends you back on
failure (`CCRM_STOP_CHECK=0` disables it). The audit's known findings are baselined in
`scripts/agent/undefined-symbols-baseline.json`; a new one fails.

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

## "Make a build" is a checklist, not a command

When the user says "make a build" (or "do a build", "build it"), follow
[`.agents/rules/make-a-build.md`](.agents/rules/make-a-build.md) **completely**: look at the
working tree, commit all pending source work in logical groups, test, collect the changelog
fragments (one version bump), build, commit, verify, and end with the per-step report. **No step is skipped unless the
user names it in the same message.** A build made from source that git does not hold is
broken, and "I only ran typecheck" is a skipped step.

## Workflow rules

These live in `.agents/rules/` and apply to every change:

- [`docs/BRANDING.md`](docs/BRANDING.md) — **two names, never mixed**: the product (Koperniq,
  `PRODUCT_NAME` / `KOPERNIQ_PRODUCT_NAME`) and the company's own system title (Settings → System
  title). Never write either as a literal in a visible string, and never call the product "CRM".
  The command line is `php kprnq`; `php ccrm` only forwards.
- [`agent-worktrees.md`](.agents/rules/agent-worktrees.md) — **any task that changes repo
  files runs in its own worktree**: call `EnterWorktree` first, commit there, `ExitWorktree`
  (keep), then `node scripts/agent/finish-worktree.mjs <name>` from the main checkout. Read-only
  tasks stay in the main checkout.
- [`parallel-agents.md`](.agents/rules/parallel-agents.md) — default to one agent; delegate
  broad searches to `ccrm-explorer`, disjoint edits to `ccrm-implementer` (max 3), reviews to
  `ccrm-reviewer`; no browser QA in subagents; don't babysit CI.
- [`large-files.md`](.agents/rules/large-files.md) — files in
  `scripts/agent/file-size-baseline.json` must not grow; put new pieces in a new module.

- [`make-a-build.md`](.agents/rules/make-a-build.md) — the full "make a build" checklist;
  nothing in it is skippable without the user saying so.
- [`qa-before-ship.md`](.agents/rules/qa-before-ship.md) — run the audit when a
  feature or fix is finished, before the build commit.
- [`commit-and-versioning.md`](.agents/rules/commit-and-versioning.md) — commit
  after every significant change; each commit adds a changelog fragment in `changelog.d/`
  and **never** bumps `src/utils/version.ts`. Only a build runs
  `node scripts/release/collect-changelog.mjs` (one bump, one changelog section) and only the
  build commit carries the version tag.
- [`post-build-cleanup.md`](.agents/rules/post-build-cleanup.md) — verify with
  `npm run check`, not `npm run build`; if you ran `npm run build`, restore
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

> **tree check → commit pending work (with fragments) → test (`npm run check` + scoped QA) → collect changelog (bumps version) → build → commit → verify**

## Tasks

`/task <ClickUp link or pasted text>` runs one bounded task end to end
([`.agents/skills/ccrm-task`](.agents/skills/ccrm-task/SKILL.md)). Handoff prompts for other agents
start from [`docs/prompts/_TEMPLATE.md`](docs/prompts/_TEMPLATE.md): every one has a Definition of
done and says to list pre-existing failures, not fix them.

`npm run deploy` re-runs the tests and refuses to ship if they fail
(`DEPLOY_SKIP_QA=1` overrides, and means shipping unverified).

## Time tracking module

Built in phases from ONE file, [`docs/TIME-TRACKING.md`](docs/TIME-TRACKING.md): status table,
decisions, per-phase checklists, spec. When asked to "make phase N", follow its Part A.

## Demo mode rebuild

Planned in phases in ONE file, [`docs/DEMO-MODE.md`](docs/DEMO-MODE.md): analysis, decisions,
the demo company's story, per-phase checklists and which phases run in parallel. When asked to
"make demo phase N", follow its Part A.

## WhatsApp demo module

Planned in phases in ONE file, [`docs/WHATSAPP-DEMO-MODULE.md`](docs/WHATSAPP-DEMO-MODULE.md): demo
chats in the browser without WAAI, plus the chat-row summary card. When asked to "make wa-demo phase N",
follow its Part A.

## Things that will bite you

- `npm run build` rewrites `dist/`, which is committed. Use `npm run check`
  to verify without touching it.
- **`npm run dev` does not type-check.** Vite only strips types, so a missing variable or
  import (`ReferenceError: brand is not defined`) stays silent until that component renders,
  often only in one flow such as switching users. After any edit that touches many files
  (a rename, a rebrand, a mechanical find-and-replace) run `npm run check` before
  telling the user it works; it reports an unused import and an undefined name alike.
- The root `tsconfig.json` checks nothing on its own — `npm run check` (or `tsc -b` in
  `npm run build`) is what actually type-checks `src/` and the QA suite.
- **Worktrees on this machine:** symlinks need admin rights (no Developer Mode), so a
  worktree's `node_modules` is a junction made by `scripts/agent/link-deps.mjs` (a hook runs it
  after `EnterWorktree`). Never `npm install` in a worktree, and never
  `git worktree remove --force` while the junction exists: it once wiped the real
  `node_modules`. `finish-worktree.mjs` unlinks first and verifies.
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
- Settings is one registry, not a list of tabs: categories, sections, permissions, search
  keywords and the old `#settings/<id>` redirects all live in
  `src/components/settings/settingsRegistry.ts`. Adding a section is a registry entry,
  three translations (`translations.settingsNav.ts`) and a case in `renderSection`;
  see [`docs/SETTINGS.md`](docs/SETTINGS.md). Scrolling lists in Settings use
  `ScrollFade`, never a visible scrollbar.
- The backend source is `public/`; the repo-root copies (`sync.php`, `api/`) are
  mirrored by `npm run sync:backend`. Edit `public/`, then sync.
- The production server has **no build step**. The compiled frontend is built
  locally and committed to `dist/`, then published by `php kprnq update`.
- A `tasks` row with `task_kind = 'recurring'` is a template; read tasks through `ccrm_sql_real_tasks()`. The guard test enforces it.
