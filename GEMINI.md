# CCRM Agent Memory & Workspace Rules

## Core Guidelines & Workflow

### 1. Commit & Version Bumping Protocol
- **Commit After Every Significant Change**: Make atomic, clean git commits after completing each feature, fix, or significant modification.
- **One Build = One Version Bump**: Every significant change, new build, or release milestone requires bumping the application version.
- **Version File**: Update `export const VERSION = "1.10.X-Kiwi";` in [`src/utils/version.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/version.ts).
- **Changelog**: Add a structured entry in [`1.10-kiwi-changelog.md`](file:///Users/erik/Documents/vibe%20coding/crm/1.10-kiwi-changelog.md) with date and clear breakdown.
- **Commit Message Suffix**: Append the version tag to commit messages (e.g. `feat(...): description (v1.10.X-Kiwi)` or `fix(...): description (v1.10.X-Kiwi)`).

### 2. Verification & Build Cleanliness
- Use `npx tsc --noEmit` to verify TypeScript types without generating unwanted `dist/` changes.
- If `npm run build` is run during validation, clean up `dist/` (`git checkout -- dist/ && git clean -fd dist/`) unless explicitly creating a deployment bundle.
