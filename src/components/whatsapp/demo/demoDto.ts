import type {
  ChatCrmLinks,
  ChatListItem,
  ChatSummaryPreview,
  ConversationResponse,
  HomeTask,
  MessageDto,
  QuotedMessage,
  ReactionGroup,
  SummaryDto,
  SummaryWindowKey,
  TaskDto,
} from "../api/contract.ts";
import { crmHashForRecord } from "../lib/routes.ts";
import type { DemoDirectory } from "./demoDataset.ts";
import type { DemoStore, StoredChat, StoredMessage, StoredTask } from "./demoStore.ts";

/**
 * The demo store as the module API's shapes (`api/contract.ts`), so `tsc` catches a wrong field. Pure: the
 * router calls these and wraps the result in a `Response`.
 */

export const iso = (ms: number): string => new Date(ms).toISOString();

/** One group per emoji; the user's own reaction first, then the most recent reactor. */
export function reactionGroups(m: StoredMessage): ReactionGroup[] {
  const order: string[] = [];
  for (const r of m.reactions) if (!order.includes(r.emoji)) order.push(r.emoji);
  return order.map((emoji) => {
    const own = m.reactions.filter((r) => r.emoji === emoji);
    const sorted = [...own].reverse().sort((a, b) => Number(b.mine) - Number(a.mine));
    return {
      emoji,
      count: own.length,
      mine: own.some((r) => r.mine),
      reactors: sorted.map((r) => ({ name: r.mine ? null : r.name, mine: r.mine })),
    };
  });
}

function quotedDto(store: DemoStore, id: string | null): QuotedMessage | null {
  if (!id) return null;
  const hit = store.findMessage(id);
  if (!hit) return null;
  const q = hit.message;
  return { id: q.id, kind: q.kind, body: q.body, transcription: q.transcription, sender: q.sender, direction: q.direction };
}

export function messageDto(store: DemoStore, m: StoredMessage): MessageDto {
  return {
    id: m.id,
    conversation_id: m.conversationId,
    kind: m.kind,
    direction: m.direction,
    sender: m.sender,
    sender_avatar_url: null,
    body: m.body,
    translation_note: null,
    media: m.media ? { url: m.media.url, mime_type: m.media.mimeType, file_name: m.media.fileName } : null,
    transcription: m.transcription,
    transcription_status: m.kind === "audio" && m.transcription ? "done" : null,
    sent_at: iso(m.sentAt),
    edited_at: m.editedAt === null ? null : iso(m.editedAt),
    quoted: quotedDto(store, m.quotedId),
    task_update_id: m.taskUpdateId,
    reactions: reactionGroups(m),
  };
}

export function taskDto(store: DemoStore, t: StoredTask): TaskDto {
  const chat = store.chat(t.chatId);
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    assignee: t.assignee,
    assignee_contact_id: null,
    start_at: t.startAt === null ? null : iso(t.startAt),
    due_at: t.dueAt === null ? null : iso(t.dueAt),
    status: t.status,
    completed_at: t.completedAt === null ? null : iso(t.completedAt),
    notified_at: t.notifiedAt === null ? null : iso(t.notifiedAt),
    created_at: iso(t.createdAt),
    conversation_id: t.chatId,
    source_message_id: t.sourceMessageId,
    conversation_title: chat?.title ?? null,
    is_group: chat?.isGroup ?? false,
    origin: "waai",
    crm_sync_state: "synced",
    crm_state: t.status === "completed" ? "done" : "todo",
    crm_error: null,
    crm_task_id: t.crmTaskId,
    // As a real, synced task: a done one cannot be reopened and none can be deleted.
    crm_linked: true,
    attachments: [],
  };
}

/** A task as the Tasks tab and the Digest list it: the chat task plus the CRM address of its task row. */
export function homeTaskDto(store: DemoStore, t: StoredTask): HomeTask {
  return { ...taskDto(store, t), crm_url: `#${crmHashForRecord("task", t.crmTaskId, () => undefined)}` };
}

const lastOf = (chat: StoredChat): StoredMessage | undefined => chat.messages[chat.messages.length - 1];

export function chatListItem(store: DemoStore, chat: StoredChat): ChatListItem {
  const last = lastOf(chat);
  return {
    id: chat.id,
    title: chat.title,
    is_group: chat.isGroup,
    owner_email: store.ownerEmail,
    avatar_url: null,
    unread_count: chat.unread,
    last_message_at: iso(last?.sentAt ?? store.stamp()),
    last_message: last ? { kind: last.kind, body: last.body, sender: last.sender, direction: last.direction } : null,
  };
}

/** The cached "recent" summary under a chat row; none for a chat without a narrative or action items. */
export function summaryPreview(chat: StoredChat): ChatSummaryPreview | null {
  const s = chat.summary;
  if (!s.narrative && s.items.length === 0) return null;
  const last = lastOf(chat);
  return {
    action_items: s.items.map((i) => ({ text: i.text, task_id: i.taskId })),
    narrative: s.narrative,
    message_count: chat.messages.length,
    created_at: iso(last?.sentAt ?? 0),
  };
}

export function crmLinks(chat: StoredChat, directory: DemoDirectory): ChatCrmLinks {
  const links: ChatCrmLinks["links"] = [];
  for (const l of chat.links) {
    // A record the CRM no longer has (the demo was wiped) is left out.
    const rec = directory.get(l.type, l.id);
    if (rec) links.push({ entity_type: l.type, crm_id: l.id, name: rec.name, is_client: rec.isClient, url: null, source: l.source });
  }
  return { supported: true, links, ambiguous: null };
}

export function conversationDto(store: DemoStore, chat: StoredChat, directory: DemoDirectory): ConversationResponse {
  const last = lastOf(chat);
  return {
    id: chat.id,
    title: chat.title,
    is_group: chat.isGroup,
    avatar_url: null,
    last_message_at: last ? iso(last.sentAt) : null,
    detected_locale: chat.locale,
    sender_name: store.ownerName,
    is_self_chat: false,
    unread_count: chat.unread,
    quick_reactions: store.quickReactions,
    crm_links: crmLinks(chat, directory),
  };
}

const DAY_MS = 86_400_000;

/** The start of a summary window (ms), given the frozen clock; `null` = no lower bound (`recent`). */
export function windowStart(key: SummaryWindowKey, now: number, timeZone: string): number | null {
  switch (key) {
    case "today": {
      // Midnight in the account's zone: the wall clock of `now` minus the part of the day that has passed.
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(now));
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
      return now - ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000;
    }
    case "d3":
      return now - 3 * DAY_MS;
    case "d7":
      return now - 7 * DAY_MS;
    case "d30":
      return now - 30 * DAY_MS;
    default:
      return null;
  }
}

/** The chat's summary as the panel shows it: the cached narrative and the chat's tasks. */
export function summaryDto(
  store: DemoStore,
  chat: StoredChat,
  window: SummaryWindowKey,
  range: { from: number; to: number; messageCount: number },
): SummaryDto {
  const last = lastOf(chat);
  return {
    id: `demo-summary-${chat.id}`,
    window,
    from_at: iso(range.from),
    to_at: iso(range.to),
    message_count: range.messageCount,
    narrative: chat.summary.narrative,
    model: "demo",
    created_at: iso(last?.sentAt ?? range.to),
    tasks: store.tasksOf(chat.id).map((t) => taskDto(store, t)),
    audio_url: null,
  };
}
