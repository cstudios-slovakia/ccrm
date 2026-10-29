/**
 * Pure rules for messages the user is writing, reacting to or editing before WAAI has confirmed them
 * (docs/WAAI-NATIVE-MODULE.md §5, Phase 3). The hooks only call these, so the rules are tested without a
 * browser: what an optimistic bubble looks like, how it is replaced by the stored message, how a reaction
 * or an edit changes a message, and which messages the user may still edit.
 */

import type { MessageDto, MessageKind, QuotedMessage, ReactionGroup } from "../../api/contract.ts";
import { EDIT_WINDOW_MS } from "../../api/contract.ts";
import { prependOlder } from "../chatState.ts";

/** Ids of messages that exist only in this browser until the send is confirmed. */
export const LOCAL_PREFIX = "local-";

export const isLocalId = (id: string): boolean => id.startsWith(LOCAL_PREFIX);

/** The bubble state of a message that is not (yet) stored. */
export interface LocalState {
  state: "sending" | "failed";
  /** 0..1 while an attachment uploads; null when there is nothing to measure. */
  progress: number | null;
  /** The reason WAAI gave, or `network`. */
  error: string | null;
}

export function kindFromMime(mime: string, asVoice: boolean): MessageKind {
  if (asVoice) return "audio";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

export interface LocalMessageInput {
  id: string;
  conversationId: string;
  text: string;
  file: { name: string; type: string } | null;
  asVoice: boolean;
  /** The message being replied to, as its quote preview. */
  quoted: QuotedMessage | null;
  /** The untranslated draft. */
  draftText: string | null;
  /** The address of a local preview of the attachment (an object URL), shown while it uploads. */
  previewUrl: string | null;
  now: Date;
}

/** The bubble shown the moment the user presses send. */
export function buildLocalMessage(i: LocalMessageInput): MessageDto {
  const kind: MessageKind = i.file ? kindFromMime(i.file.type, i.asVoice) : "text";
  const fileName = kind === "document" ? i.file?.name || null : null;
  return {
    id: i.id,
    conversation_id: i.conversationId,
    kind,
    direction: "out",
    sender: null,
    sender_avatar_url: null,
    // An uncaptioned document shows its file name, as the stored message will.
    body: i.text || fileName,
    translation_note: i.draftText && i.draftText !== i.text ? i.draftText : null,
    media: i.file ? { url: i.previewUrl ?? "", mime_type: i.file.type || null, file_name: fileName } : null,
    transcription: null,
    transcription_status: null,
    sent_at: i.now.toISOString(),
    edited_at: null,
    quoted: i.quoted,
    task_update_id: null,
    reactions: [],
  };
}

/** A quote preview of a message, for the reply bar and the optimistic bubble. */
export function toQuote(m: MessageDto): QuotedMessage {
  return { id: m.id, kind: m.kind, body: m.body, transcription: m.transcription, sender: m.sender, direction: m.direction };
}

/**
 * The stored message replaces its local bubble. The poll may already have brought the stored copy in
 * (the provider's echo is quick): then the local bubble just goes. The optimistic quote is kept when the
 * stored message came back without one.
 */
export function settleLocal(list: readonly MessageDto[], localId: string, stored: MessageDto): MessageDto[] {
  const local = list.find((m) => m.id === localId);
  const merged = !stored.quoted && local?.quoted ? { ...stored, quoted: local.quoted } : stored;
  return prependOlder(
    list.filter((m) => m.id !== localId),
    [merged],
  );
}

export const without = (list: readonly MessageDto[], id: string): MessageDto[] => list.filter((m) => m.id !== id);

export function patchMessage(list: readonly MessageDto[], id: string, patch: Partial<MessageDto>): MessageDto[] {
  return list.map((m) => (m.id === id ? { ...m, ...patch } : m));
}

/** The user's current reaction to a message, if any. */
export const ownReaction = (groups: readonly ReactionGroup[]): string | null => groups.find((g) => g.mine)?.emoji ?? null;

/**
 * `groups` with the user's reaction set to `emoji`, or removed when it is null: the one-reaction-per-person
 * rule WAAI applies, so the optimistic state and the confirmed one agree.
 */
export function withOwnReaction(groups: readonly ReactionGroup[], emoji: string | null): ReactionGroup[] {
  const others = groups
    .map((g) => (g.mine ? { ...g, count: g.count - 1, mine: false, reactors: g.reactors.filter((r) => !r.mine) } : g))
    .filter((g) => g.count > 0);
  if (!emoji) return others;
  const me = { name: null, mine: true };
  if (!others.some((g) => g.emoji === emoji)) return [...others, { emoji, count: 1, mine: true, reactors: [me] }];
  return others.map((g) => (g.emoji === emoji ? { ...g, count: g.count + 1, mine: true, reactors: [me, ...g.reactors] } : g));
}

/** The next reaction when the user picks `picked`: picking the one they already have takes it back. */
export const nextReaction = (groups: readonly ReactionGroup[], picked: string): string | null =>
  ownReaction(groups) === picked ? null : picked;

/**
 * May the user still edit this message? Their own, sent less than 15 minutes ago, plain text or media with
 * a caption of their own; not a "tasks done" card and not one that is still sending. (WAAI checks the same
 * again; this only decides whether to offer the action.)
 */
export function isEditable(m: MessageDto, now: number = Date.now()): boolean {
  if (m.direction !== "out" || isLocalId(m.id) || m.task_update_id) return false;
  const sent = Date.parse(m.sent_at);
  if (Number.isNaN(sent) || now - sent >= EDIT_WINDOW_MS) return false;
  if (m.kind === "text") return true;
  if (m.kind === "image" || m.kind === "video") return Boolean(m.body?.trim());
  if (m.kind === "document") {
    const caption = m.body?.trim();
    // An uncaptioned document has its file name in `body`, which is not a caption.
    return Boolean(caption) && caption !== m.media?.file_name?.trim();
  }
  return false;
}

/** The text a "copy" action puts on the clipboard. */
export const copyableText = (m: Pick<MessageDto, "body" | "transcription">): string => (m.body ?? m.transcription ?? "").trim();
