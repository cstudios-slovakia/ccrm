# <Task title>

## Goal
One or two sentences: what should be true when this is done.

## Context / links
- ClickUp / WhatsApp source:
- Relevant files, docs, earlier commits:

## Scope
- What to change (files, behavior).

## Out of scope
- What not to touch (other modules, refactors, version bump, deploy).

## Definition of done
Exact checks. Done means these pass, nothing more.
- [ ] `npm run check`
- [ ] Scoped QA: `node scripts/qa/run-qa.mjs --files <files>` (orchestrator only, once)
- [ ] Manual checks: <what to click / observe>
- [ ] Changelog fragment in `changelog.d/`
- [ ] Committed on the worktree branch; not pushed

## Pre-existing failures
List known failures with evidence (command, output, commit). Do not fix them unless in scope.
- none known / <test name: evidence>

## Stop and ask when
- The goal needs a schema/sync change not listed above.
- A fix would need to touch files in Out of scope.
- Two reasonable readings of the task give different behavior.
- A check fails for a reason unrelated to your change.

## Report format
Under 300 words: summary of what changed, commits (hash + subject), checks run with results,
pre-existing failures seen (not fixed), open questions.

> Verify with `npm run check` only. Do not run browser QA, do not push, do not wait for CI. Commit on your worktree branch; the orchestrator merges.
