# Changelog fragments

A feature or fix commit does **not** bump `src/utils/version.ts` and does **not** edit
`1.13-nectarine-changelog.md`. It adds one file here instead. "Make a build" runs
`node scripts/release/collect-changelog.mjs`, which reads every fragment, bumps the patch
number once, writes ONE `### v<new> (<date>)` section into the active changelog, and deletes
the fragments it consumed. Two sessions can never collide on a version number.

## Naming

`changelog.d/<YYYY-MM-DD>-<slug>.md`, for example `2026-11-08-speaker-names.md`.
The date is the day you write it; the slug is lowercase letters, digits and dashes.
Fragments are collected in filename order. This `README.md` is ignored.

## Content

The bullet(s) exactly as they should appear in the changelog, in the existing style. No
`###` heading (the collector writes it), no version number.

```markdown
- **Speaker names carry over to the transcript** (`src/utils/liveTranscript.ts`, `MeetingRoomView.tsx`): renaming a speaker in the Focus helper now renames it in the official transcript too.
- **Tests**: `liveTranscript.test.ts` (`liveSpeakerTimeline`: merged turns, null when nothing carries over).
```

Rules: start with `- `; continuation or nested lines are indented by two spaces; one concern
per fragment (a commit may add several); LF or CRLF both work.

## Commands

```bash
node scripts/release/collect-changelog.mjs --dry-run   # show the section, write nothing
node scripts/release/collect-changelog.mjs             # what "make a build" runs
node scripts/release/collect-changelog.mjs --date 2026-11-08
node scripts/release/collect-changelog.mjs --allow-empty   # rebuild with no fragments
```

With no fragments the collector exits 1 unless `--allow-empty` is given. The last line it
prints on stdout is the new version. Rules: `.agents/rules/commit-and-versioning.md` and
`.agents/rules/make-a-build.md`.
