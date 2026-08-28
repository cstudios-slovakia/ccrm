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

1. Run `npm run test:qa`.
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
- [`semantic-color-tokens.md`](.agents/rules/semantic-color-tokens.md) — new
  markup uses `bg-card` / `text-foreground` / `border-border`, not `bg-white` /
  `text-slate-800` / `border-slate-200`. The palette classes already in the
  codebase are held together by a PostCSS pass; do not add more.

The order when finishing a change:

> **test → bump version → changelog → build → commit**

`npm run deploy` re-runs the tests and refuses to ship if they fail
(`DEPLOY_SKIP_QA=1` overrides, and means shipping unverified).

## Things that will bite you

- `npm run build` rewrites `dist/`, which is committed. Use `npx tsc --noEmit`
  to type-check without touching it.
- The root `tsconfig.json` checks nothing on its own — `npm run build` (`tsc -b`)
  is what actually type-checks `src/`.
- The production server has **no build step**. The compiled frontend is built
  locally and committed to `dist/`, then published by `php ccrm update`.
