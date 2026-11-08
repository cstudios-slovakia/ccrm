---
description: Every agent session that changes repo files works in its own git worktree
---

# Agent worktrees

Several sessions share one checkout; edits and `git` state collide. A session that changes files
works in its own worktree and merges back at the end. The user never manages worktrees.

## Tasks that change repo files

1. First call `EnterWorktree` with a short, task-derived name (`fix-invoice-total`, not `work`).
2. The PostToolUse hook links `node_modules`. If it did not run: `node scripts/agent/link-deps.mjs`.
   Never `npm install` in a worktree. `node_modules` is a junction to the main checkout's one.
3. Work and commit there, with a changelog fragment (see [`commit-and-versioning.md`](./commit-and-versioning.md)).
   Do not bump the version in a worktree unless the task is a build.
4. Before finishing: `git rebase <integration branch>` (the branch checked out in the main checkout),
   run `npm run check`, then the scoped QA from [`qa-before-ship.md`](./qa-before-ship.md).
5. `ExitWorktree(action: "keep")`. This returns the session to the main checkout.
6. From the main checkout: `node scripts/agent/finish-worktree.mjs <name>`. It aborts on uncommitted
   changes, rebases when needed, fast-forwards the integration branch, removes the junction and the
   worktree, and deletes the branch. Report the merged commits it prints. `--dry-run` previews.

Never merge with `git -C <main>` from inside the worktree session; Claude Code blocks it.
Never `git worktree remove --force` while `node_modules` is still a junction: it once wiped the real
`node_modules`. The finish script removes the junction first; do the same by hand (`rmdir node_modules`).

## Read-only tasks

Questions, analysis and reviews stay in the main checkout. Never edit the main checkout directly
unless the user says to.

## Subagents with `isolation: "worktree"`

The orchestrator owns them: after the subagent reports, run `finish-worktree.mjs` for each, one at a
time, from the main checkout. A subagent never merges itself.

## Probes and the dev stack see only the main checkout

`npm run test:persistence`, `test:mcp`, `test:rbac` and the docker dev stack (it mounts the main
checkout, including the gitignored `config.php`) never see a worktree. Run them after
`finish-worktree.mjs`, from the main checkout. Unit tests, `npm run check` and the scoped QA run
fine inside a worktree.

## Leftovers

`node scripts/agent/list-worktrees.mjs` lists every worktree with ahead/behind, dirty count and age.
For a merged or abandoned one: `node scripts/agent/finish-worktree.mjs <name> --no-merge`
(refuses with unmerged commits; `--discard` throws them away on purpose).
Worktrees outside `.claude/worktrees/` (for example another session's PR worktree in a temp dir)
are not yours: the scripts refuse them, and you never pass `--external` unless the user says so.

The first `npm run check` in a new worktree is cold (~45 s; the tsc cache is per checkout and
can't be copied across the `node_modules` junction), then ~3 s warm.

`node scripts/agent/test-worktree-scripts.mjs` tests all of this in a throwaway repo.
