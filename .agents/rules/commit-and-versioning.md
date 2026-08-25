---
description: Commit after every significant change and bump app version on every build
---

# Commit & Version Bump Protocol

## 1. Commit After Every Significant Change
- Always create atomic, clean git commits after completing any significant feature, bug fix, refactor, or UI polish.
- Do not let uncommitted work accumulate across multiple unrelated tasks.

## 2. Version Bumping Rule ("One Build = One Version Bump")
- Every significant change, new build, or release milestone requires bumping the application version.
- **Single Source of Truth**: Update `export const VERSION = "1.8.X-Imbe";` in [`src/utils/version.ts`](file:///c:/Users/peter/Work/Vibe%20coding/ccrm/src/utils/version.ts).
- **Changelog**: Add a structured entry to [`1.8-imbe-changelog.md`](file:///c:/Users/peter/Work/Vibe%20coding/ccrm/1.8-imbe-changelog.md) with date `(YYYY-MM-DD)` and bulleted breakdown of user-facing changes, bug fixes, and architectural additions.
- **Commit Message Suffix**: Suffix the commit message with the version tag, e.g.:
  `feat(module): description of feature (v1.8.X-Imbe)` or `fix(module): description of fix (v1.8.X-Imbe)`.
