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
- **Version File**: Update `export const VERSION = "1.8.X-Imbe";` in [`src/utils/version.ts`](file:///c:/Users/peter/Work/Vibe%20coding/ccrm/src/utils/version.ts).
- **Changelog**: Add a structured entry in [`1.8-imbe-changelog.md`](file:///c:/Users/peter/Work/Vibe%20coding/ccrm/1.8-imbe-changelog.md) with date and clear breakdown.
- **Commit Message Suffix**: Append the version tag to commit messages (e.g. `feat(...): description (v1.8.X-Imbe)` or `fix(...): description (v1.8.X-Imbe)`).

### 2. Verification & Build Cleanliness

- Use `npx tsc --noEmit` to verify TypeScript types without generating unwanted `dist/` changes.
- If `npm run build` is run during validation, clean up `dist/` (`git checkout -- dist/ && git clean -fd dist/`) unless explicitly creating a deployment bundle.

### 3. News & Product Updates Management

- **Managed Exclusively via Craft CMS**: All news, release notes, and product update entries must be managed exclusively through Craft CMS (via GraphQL API `entries(section: "updateNotes", site: "*")`).
- **No Hardcoded or Local DB Entries**: News and update entries must NEVER be hardcoded in client source code or stored in the application's local database.
