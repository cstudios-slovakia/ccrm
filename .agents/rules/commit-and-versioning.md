---
description: Commit after every significant change and bump app version on every build
---

# Commit & Version Bump Protocol

## 1. Commit After Every Significant Change
- Always create atomic, clean git commits after completing any significant feature, bug fix, refactor, or UI polish.
- Do not let uncommitted work accumulate across multiple unrelated tasks.

## 2. Version Bumping Rule ("One Build = One Version Bump")
- Every significant change, new build, or release milestone requires bumping the application version.
- **Single Source of Truth**: Update `export const VERSION = "1.13.X-Nectarine";` in [`src/utils/version.ts`](../../src/utils/version.ts).
- **Changelog**: Add a structured entry to [`1.13-nectarine-changelog.md`](../../1.13-nectarine-changelog.md) with date `(YYYY-MM-DD)` and bulleted breakdown of user-facing changes, bug fixes, and architectural additions.
- **Commit Message Suffix**: Suffix the commit message with the version tag, e.g.:
  `feat(module): description of feature (v1.13.X-Nectarine)` or `fix(module): description of fix (v1.13.X-Nectarine)`.

## 3. A build

"Make a build" is the full checklist in [`make-a-build.md`](./make-a-build.md); nothing in it may be skipped unless the user says so.
