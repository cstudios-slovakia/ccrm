import type { ChatSummaryPreview } from "../api/contract.ts";

export interface RowBullet {
  text: string;
  taskId: string | null;
}

export type RowSummary =
  | { kind: "bullets"; bullets: RowBullet[] } // at least one bullet to show
  | { kind: "all_done" } // there were task bullets and every one is done
  | { kind: "none" }; // no summary, or nothing usable in it

/** Remove inline Markdown markers so a string renders cleanly as plain text (port of WAAI's `stripInlineMarkdown`). */
export function stripInlineMarkdown(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "");
}

/**
 * Split prose into sentences without breaking on the full stop of an ordinal number or a date
 * ("Viktor sa 9. marca pýtal…" is one sentence). A full stop ends a sentence only when it does not follow a
 * digit and the next word starts with a capital letter or a digit; "!" and "?" always end one.
 * Port of WAAI's `splitSentences`.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[!?])\s+|(?<=[^\d\s]\.)\s+(?=[\p{Lu}\d„"“'(])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** What the chat-row summary card shows for a chat: the open bullets of its cached summary (WAAI's `bulletsFrom`). */
export function rowBullets(s: ChatSummaryPreview | undefined, done: ReadonlySet<string>): RowSummary {
  if (!s) return { kind: "none" };
  const first: RowBullet[] = [];
  for (const a of s.action_items) {
    const text = a.text.trim();
    if (text) first.push({ text, taskId: a.task_id });
    if (first.length >= 5) break;
  }
  if (first.length === 0) {
    const bullets = splitSentences(stripInlineMarkdown(s.narrative ?? ""))
      .slice(0, 3)
      .map((text): RowBullet => ({ text, taskId: null }));
    return bullets.length > 0 ? { kind: "bullets", bullets } : { kind: "none" };
  }
  const open = first.filter((b) => !b.taskId || !done.has(b.taskId));
  return open.length > 0 ? { kind: "bullets", bullets: open } : { kind: "all_done" };
}

/** How many bullets the row shows (all of them open); 0 for `none` and `all_done`. */
export function standingCount(r: RowSummary): number {
  return r.kind === "bullets" ? r.bullets.length : 0;
}
