---
name: task
description: "Implement one task from ClickUp (link or ID) or pasted text (e.g. WhatsApp) in an isolated worktree, with bounded 'done', then report back. Use only when the user runs /task."
disable-model-invocation: true
argument-hint: "<ClickUp task link or ID> | <pasted task text>"
---

# /task: one task, bounded, in a worktree

Input: `$ARGUMENTS`, either a ClickUp task URL/ID or pasted text.

## 1. Understand
- ClickUp: read the task with the ClickUp MCP tools (`clickup_get_task`, `clickup_get_task_comments`,
  and download image attachments with `clickup_download_task_attachment` and look at them). Load the
  tools with ToolSearch first if they are deferred.
- Pasted text: use it as is.
- Restate in a few lines: **goal**, **acceptance criteria**, **out of scope**. Ask the user only on
  blocking ambiguity (two readings give different behavior); otherwise state your assumption and go.
- "Done" is exactly the acceptance criteria plus `npm run check`. Do not fix pre-existing failures;
  list them in the report.

## 2. Work
Follow [`.agents/rules/agent-worktrees.md`](../../rules/agent-worktrees.md):
EnterWorktree, work, commit with a changelog fragment in `changelog.d/`, `npm run check`, scoped QA
(`node scripts/qa/run-qa.mjs --files <changed files>`, one run), ExitWorktree (keep), then
`node scripts/agent/finish-worktree.mjs <name>`.

Also follow [`.agents/rules/large-files.md`](../../rules/large-files.md) (new pieces go in new
modules) and [`.agents/rules/parallel-agents.md`](../../rules/parallel-agents.md) (default to one agent).

## 3. Report
- Summary of what changed and the commit list (hash + subject), checks run, pre-existing failures seen.
- ClickUp source: post a comment on the task with what changed (`clickup_create_task_comment`).
  Change the task status only if the user asked.
- Never push or deploy unless the user asked.
