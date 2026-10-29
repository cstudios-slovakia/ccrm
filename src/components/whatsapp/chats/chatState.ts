/**
 * How a conversation's message list changes as pages and polls arrive. Pure functions: the hooks only
 * call them, so the rules (no duplicates, edits replace, deletions drop, always oldest first) are tested
 * without a browser.
 */

import type { ChatListItem, MessageDto } from "../api/contract.ts";

const byTime = (a: MessageDto, b: MessageDto) =>
  a.sent_at < b.sent_at ? -1 : a.sent_at > b.sent_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Messages keyed by id, the later copy of an id winning, oldest first. */
function unique(messages: readonly MessageDto[]): MessageDto[] {
  const byId = new Map<string, MessageDto>();
  for (const m of messages) byId.set(m.id, m);
  return [...byId.values()].sort(byTime);
}

/**
 * A poll answer (`after` mode): new messages are added, a message we already hold is replaced by the fresh
 * copy (an edit, a reaction), and the ids WAAI reports as removed disappear.
 */
export function mergeNewer(current: readonly MessageDto[], incoming: readonly MessageDto[], deletedIds: readonly string[] = []): MessageDto[] {
  const gone = new Set(deletedIds);
  const known = new Set(current.map((m) => m.id));
  const newest = newestSentAt(current) ?? "";
  const fresh = incoming.filter((m) => !gone.has(m.id));
  const replaced = current.filter((m) => !gone.has(m.id)).map((m) => fresh.find((f) => f.id === m.id) ?? m);
  // The poll also returns edited or reacted-to rows older than `after`. Those matter only when we already
  // show them; adding one we never loaded would leave a hole in the timeline.
  return unique([...replaced, ...fresh.filter((m) => !known.has(m.id) && m.sent_at >= newest)]);
}

/** An older page above what we hold. Same id twice keeps the copy we already have on screen. */
export function prependOlder(current: readonly MessageDto[], older: readonly MessageDto[]): MessageDto[] {
  return unique([...older, ...current]);
}

/** The `after` cursor for the next poll: the newest message we hold. */
export function newestSentAt(messages: readonly MessageDto[]): string | null {
  return messages.length === 0 ? null : messages[messages.length - 1]!.sent_at;
}

/** The `before` cursor for loading older messages: the oldest message we hold. */
export function oldestSentAt(messages: readonly MessageDto[]): string | null {
  return messages.length === 0 ? null : messages[0]!.sent_at;
}

/** Lower case, accents removed: "stretnutie" finds "stretnútie". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** The chats whose title or last message contains every word of `query`. */
export function filterChats(chats: readonly ChatListItem[], query: string): ChatListItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...chats];
  return chats.filter((c) => {
    const hay = fold(`${c.title} ${c.last_message?.body ?? ""}`);
    return words.every((w) => hay.includes(w));
  });
}

/** What a chat row shows as its last line: "You: hi", "Eva: hi" in a group, or a word for non-text. */
export function previewLine(
  last: ChatListItem["last_message"],
  isGroup: boolean,
  labels: { you: string; photo: string; video: string; voice: string; document: string; sticker: string; attachment: string },
): string {
  if (!last) return "";
  const text = last.body?.trim();
  const kindLabel = {
    text: "",
    image: labels.photo,
    video: labels.video,
    audio: labels.voice,
    document: labels.document,
    sticker: labels.sticker,
    other: labels.attachment,
  }[last.kind];
  const content = text && last.kind !== "document" ? text : last.kind === "document" && text ? text : kindLabel;
  if (last.direction === "out") return `${labels.you}: ${content}`;
  return isGroup && last.sender ? `${last.sender}: ${content}` : content;
}
