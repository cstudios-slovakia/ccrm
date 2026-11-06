---
description: What "make a build" means — an all-or-nothing checklist; no step is skipped unless the user explicitly says so
---

# "Make a build"

"Make a build", "do a build", "build it", "ship a build" and "prepare a build" all mean
**this whole checklist, in this order**. It is not "run `npm run build`".

## The one rule about skipping

**An agent never skips, shortens or reorders a step on its own judgment.** Not because
the change looks small, the tests look slow, the tree looks messy or another session
is running. A step is skipped only when the user's *current* message names it
("skip QA", "don't commit", "no cleanup"). "Make a build" alone skips nothing, and a
permission given for an earlier build does not carry over.

Two outcomes are defined by the other rules and are **not** skips, but each must be
reported: QA that could not start (exit 2, RAM) is committed with `QA: pending`
([`qa-before-ship.md`](./qa-before-ship.md)); a step that *fails* stops the build
(see "When a step fails").

If a step cannot be done and no rule defines the fallback, **stop and ask**. Do not
improvise a substitute.

## The checklist

1. **Look at the working tree first.** `git status --short` and `git diff --stat`, then
   `git diff` per file. Sort every change into a group (one concern each). Other
   sessions share this checkout: stage only your hunks, never `git stash`, never
   `git checkout --`/`reset` over work you did not write
   (see the shared-checkout notes in memory).
2. **Commit all pending source work, in logical groups, before the build commit.**
   One commit per concern, each with its own version bump and changelog entry
   ([`commit-and-versioning.md`](./commit-and-versioning.md)), unless the changes are
   not app code (docs, scripts), which get an unversioned `chore:` commit. A
   build is never made from source that git does not hold: `dist/` must be
   reproducible from the commits. If a change is not yours and not clearly
   anyone's, ask who owns it; do not leave it dirty and build over it silently.
3. **Test** — in this order, each in the foreground, output to a log file, read:
   - `npm run typecheck`
   - `npm run test:unit`
   - `node scripts/qa/run-qa.mjs --files <files changed since the last build>`
     (never plain `npm run test:qa`, never `--full` on your own)
   - the focused suite from the table in `qa-before-ship.md` when the change touches
     `sync.php`, `api/*.php`, the MCP gateway or permissions
     (`test:persistence`, `test:mcp`, `test:rbac`)
   - `php -l` for every changed PHP file (docker, see the shared-checkout notes)
   A red result is fixed or reported, never worked around, never a loosened check.
4. **Backend mirror.** If anything under `public/` changed: `npm run sync:backend`.
   If a DB column was added: the 4-place rule in
   [`database-schema-and-sync.md`](./database-schema-and-sync.md).
5. **Bump the version and write the changelog entry** for the build commit, in the same
   command as the commit (read `version.ts` from `git show HEAD:` and the highest
   `### v` header in the changelog in that command, so a concurrent session cannot
   collide with the number).
6. **Build.** `npm run build` (this is the one place `dist/` is meant to change; it
   overrides the restore rule in [`post-build-cleanup.md`](./post-build-cleanup.md)).
7. **Commit the bundle** (`dist/` plus `version.ts` and the changelog), message suffixed
   with the version tag and, if QA did not run, a `QA: pending` line.
8. **Clean up — only if the user asked for it** ("and remove leftovers"). Then: delete
   only what is provably unreferenced, list what you left alone and why. Never delete
   ignored scratch folders, worktrees or files you cannot show are dead without asking.
9. **Verify the end state.** `git status --short` must be empty (or list exactly the
   files that belong to other sessions, named in the report). Confirm `HEAD` holds the
   bundle and the version tag.

## Not part of a build

`npm run deploy`, `git push`, opening a PR, publishing release notes. They are
outward-facing: only when the user asks for them by name.

## The report

End with a table, one row per step 1–9, each marked **done**, **skipped (user said so:
"<quote>")**, **pending (defined fallback)** or **failed**, with the evidence: the
commit hashes, the test counts, the QA verdict or the reason it did not start. A row
without evidence is a row that did not happen. Never write "build done" while any
row is not done.

## When a step fails

Stop. Do not continue to the next step, do not commit the bundle. Report the symptom,
the root cause and the proposed fix, and wait. The only exception is a failure that
already exists on `HEAD` and is unrelated to your change: say so with proof (the
failing file is untouched by the diff), fix it if the fix is trivial and safe, or report
it, and continue only if the user allows.
