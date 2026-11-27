# Parallel agents

## Decide how to split the work

Apply this at the start of every task.

- **Default: one agent.** Stay single for small tasks (roughly 1-3 files or under ~30 minutes),
  tightly coupled changes, and debugging (one chain of reasoning; a fresh subagent re-reads
  everything and gets no smarter).
- **Delegate reading** when the search is broad (many modules, logs, git history): agent
  `ccrm-explorer` (Haiku, low effort, read-only). It returns conclusions with `file:line`
  references, not file dumps. The orchestrator should not read large files itself just to find
  things.
- **Split editing** only when the parts touch disjoint files (separate modules, or separate
  phases of a phased plan): agent `ccrm-implementer` (Sonnet, medium effort, own worktree), at
  most 3 at once. Raise to high effort for schema/sync changes, flaky tests, money/date logic;
  use low for mechanical edits.
- **Independent review** of a non-trivial diff: agent `ccrm-reviewer` (Sonnet, high effort,
  read-only).
- The **orchestrator** (usually Opus) plans, writes self-contained prompts (goal, files,
  definition of done; see `docs/prompts/_TEMPLATE.md`), merges and verifies. It does not redo
  the subagents' work.
- **Cost:** Sonnet/Haiku tokens weigh less on the plan's limits than Opus, but every subagent
  pays startup context. Delegation only saves usage when the delegated chunk is substantial.

## Rules for fan-out

- Read-only fan-out (audits, searches) is fine.
- Agents that edit use `isolation: worktree`.
- At most **3 editing agents at once** on this machine (16 GB; browser QA and builds exhaust RAM).
- Every edit-agent prompt includes, verbatim:

  > Verify with `npm run check` only. Do not run browser QA, do not push, do not wait for CI. Commit on your worktree branch; the orchestrator merges.

## Merging

The orchestrator merges the agents' branches one by one, then runs `npm run check` and **one**
scoped QA run (`node scripts/qa/run-qa.mjs --files <changed files>`) on the merged result, then
finishes the worktrees (`node scripts/agent/finish-worktree.mjs <name>`). Subagents never run
the QA suite: several browsers at once get killed for low memory.

## Don't babysit CI

After a push, give the run URL and end the turn. Check once when the user returns or asks you to
watch. Never keep re-arming a watch for over an hour without telling the user. Do not fix
pre-existing failures you were not asked to fix; list them in the report instead.
