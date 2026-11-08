---
description: Commit after every significant change with a changelog fragment; the version is bumped once, by the build
---

# Commit & Changelog Fragment Protocol

## 1. Commit After Every Significant Change
- Always create atomic, clean git commits after completing any significant feature, bug fix, refactor, or UI polish.
- Do not let uncommitted work accumulate across multiple unrelated tasks.

## 2. Changelog fragments, no version bump per commit
- A feature or fix commit **never** edits [`src/utils/version.ts`](../../src/utils/version.ts) or
  [`1.13-nectarine-changelog.md`](../../1.13-nectarine-changelog.md), and its message has **no version suffix**
  (`feat(module): description of feature`).
- Instead it adds one fragment, `changelog.d/<YYYY-MM-DD>-<slug>.md`, holding the bullet(s) exactly as they
  will appear in the changelog (`- **Title** (\`files\`): text`, optional `- **Tests**: ...`). Format, naming
  and an example: [`changelog.d/README.md`](../../changelog.d/README.md).
- Changes that are not app code (docs, scripts, rules) get an unversioned `chore:`/`docs:` commit and no fragment,
  unless the user will notice them.
- Fix a fragment later by editing its file; it is only text until a build collects it.

## 3. A build ("One Build = One Version Bump")
- "Make a build" is the full checklist in [`make-a-build.md`](./make-a-build.md); nothing in it may be skipped unless the user says so.
- The build runs `node scripts/release/collect-changelog.mjs`: it bumps the patch number in `version.ts` once
  (codename kept), writes one `### v<new> (<date>)` section into the active changelog, deletes the consumed
  fragments and prints the new version. The build commit message is suffixed with that tag, e.g.
  `build: bundle for speaker-name carry-over (v1.13.86-Nectarine)`.
- Only the build commit changes `version.ts` and the changelog. Never run `increment-version.js` (removed) or edit
  the version by hand.
