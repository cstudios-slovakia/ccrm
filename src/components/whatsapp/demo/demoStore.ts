import type { MessageDirection, MessageKind } from "../api/contract.ts";
import type { DemoDataset } from "./demoDataset.ts";
import { pastShift, zonedInstant } from "./demoTime.ts";

/**
 * The in-memory state of the demo (docs/WHATSAPP-DEMO-MODULE.md B4): built once from the dataset, changed by
 * the router when the person sends, reacts, ticks a task or links a record, gone on reload. Nothing here
 * touches the network, the DOM or the CRM. Ids follow the WAAI loader contract (B5): the conversation id is the
 * chat `ref`, a message id is `<ref>-<message id>`, a task id is `demo-wa-task-<n>`.
 */

/** Where the demo's files live (`demoMedia.ts` serves the real ones; tests pass a stub). */
export interface DemoMedia {
  image(placeholder: string): string;
  audio(): string;
  document(): string;
}

export const DEMO_ACCOUNT_ID = "demo-wa-account";
export const DEFAULT_QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export interface StoredReaction {
  emoji: string;
  /** The reactor's name; null for the user. */
  name: string | null;
  mine: boolean;
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  kind: MessageKind;
  direction: MessageDirection;
  sender: string | null;
  body: string | null;
  media: { url: string; mimeType: string | null; fileName: string | null } | null;
  transcription: string | null;
  sentAt: number;
  editedAt: number | null;
  quotedId: string | null;
  reactions: StoredReaction[];
  taskUpdateId: string | null;
  /** Wall-clock time of the last change, for the `after`/`since` poll. */
  modifiedAt: number;
}

export interface StoredLink {
  type: "lead" | "project";
  id: string;
  source: "auto" | "manual";
}

export interface StoredChat {
  id: string;
  title: string;
  isGroup: boolean;
  phone: string;
  locale: string;
  unread: number;
  messages: StoredMessage[];
  links: StoredLink[];
  summary: { narrative: string; items: { taskId: string | null; text: string }[] };
  /** What this chat adds to the Digest of each window (the dataset's `digest`). */
  digest: Partial<Record<"today" | "d3" | "d7" | "d30", string>>;
}

export interface StoredTask {
  id: string;
  n: number;
  chatId: string;
  title: string;
  description: string;
  assignee: string;
  startAt: number | null;
  dueAt: number | null;
  status: "open" | "completed";
  completedAt: number | null;
  notifiedAt: number | null;
  createdAt: number;
  sourceMessageId: string;
  crmTaskId: string;
}

/** A time of day when the dataset states only a date: noon keeps the calendar day in every time zone. */
const DATE_ONLY_TIME = "12:00";

export const taskIdFor = (n: number) => `demo-wa-task-${n}`;

export class DemoStore {
  readonly chats = new Map<string, StoredChat>();
  readonly tasks: StoredTask[] = [];
  readonly numbers = new Map<string, "registered" | "not_registered">();
  readonly ownerName: string;
  readonly ownerEmail: string;
  readonly ownerPhone: string;
  readonly timeZone: string;
  quickReactions = [...DEFAULT_QUICK_REACTIONS];
  autoDetectSummaryLang = true;
  private readonly deleted: { id: string; at: number }[] = [];
  private readonly clock: () => number;
  private lastStamp = 0;
  private seq = 0;

  constructor(dataset: DemoDataset, media: DemoMedia, clock: () => number = () => Date.now()) {
    this.clock = clock;
    const owner = dataset.crmUsers[dataset.account.ownerCrmUser];
    this.ownerName = owner?.name ?? "";
    this.ownerEmail = owner?.email ?? "";
    this.ownerPhone = dataset.account.phone;
    this.timeZone = dataset.account.timezone;
    // Frozen here: every seeded instant is computed from this one `now`.
    const now = clock();
    const at = (day: number, time: string) => zonedInstant(day, time, this.timeZone, now);

    // A `day: 0` message whose time has not come yet must not sit in the future: move every message back by the
    // same amount so the newest is five minutes old and the order and gaps stay.
    let newest = -Infinity;
    for (const chat of dataset.chats) for (const m of chat.messages) newest = Math.max(newest, at(m.day, m.time));
    const shift = Number.isFinite(newest) ? pastShift(newest, now) : 0;

    for (const chat of dataset.chats) {
      const messages: StoredMessage[] = chat.messages.map((m) => {
        const sentAt = at(m.day, m.time) - shift;
        const mediaOf =
          m.kind === "image"
            ? { url: media.image(m.placeholder ?? "site"), mimeType: m.mime ?? "image/png", fileName: null }
            : m.kind === "audio"
              ? { url: media.audio(), mimeType: m.mime ?? "audio/wav", fileName: null }
              : m.kind === "document"
                ? { url: media.document(), mimeType: m.mime ?? null, fileName: m.fileName ?? null }
                : null;
        return {
          id: `${chat.ref}-${m.id}`,
          conversationId: chat.ref,
          kind: m.kind,
          direction: m.dir,
          sender: m.dir === "in" ? (m.sender ?? chat.title) : null,
          body: m.body,
          media: mediaOf,
          transcription: m.kind === "audio" ? (m.transcription ?? null) : null,
          sentAt,
          editedAt: null,
          quotedId: m.quote ? `${chat.ref}-${m.quote}` : null,
          reactions: (m.reactions ?? []).map((r) => ({ emoji: r.emoji, name: r.by, mine: false })),
          taskUpdateId: null,
          modifiedAt: 0,
        };
      });
      const taskNumbers = new Set(chat.tasks.map((t) => t.n));
      this.chats.set(chat.ref, {
        id: chat.ref,
        title: chat.title,
        isGroup: chat.isGroup,
        phone: chat.phone,
        locale: chat.locale,
        unread: chat.unread,
        messages,
        links: chat.links.map((l) => ({ type: l.entityType, id: l.entityId, source: l.source })),
        digest: { ...chat.digest },
        summary: {
          narrative: chat.summary.narrative,
          items: chat.summary.actionItems.map((i) => ({
            taskId: i.task !== null && taskNumbers.has(i.task) ? taskIdFor(i.task) : null,
            text: i.text,
          })),
        },
      });
      for (const t of chat.tasks) {
        const source = messages.find((m) => m.id === `${chat.ref}-${t.sourceMessage}`);
        this.tasks.push({
          id: taskIdFor(t.n),
          n: t.n,
          chatId: chat.ref,
          title: t.title,
          description: t.description,
          assignee: dataset.crmUsers[t.assignee]?.name ?? "",
          startAt: t.start ? at(t.start.day, DATE_ONLY_TIME) : null,
          dueAt: t.due ? at(t.due.day, t.due.time ?? DATE_ONLY_TIME) : null,
          status: t.status,
          completedAt: t.completed ? at(t.completed.day, t.completed.time) : null,
          notifiedAt: null,
          createdAt: source?.sentAt ?? now,
          sourceMessageId: `${chat.ref}-${t.sourceMessage}`,
          crmTaskId: `demo-whatsapp-${t.n}`,
        });
      }
    }
    for (const n of dataset.numbers) this.numbers.set(n.phone.replace(/\D/g, ""), n.status);
    this.lastStamp = Number.isFinite(newest) ? newest - shift : now;
  }

  /** A strictly increasing instant, so a message sent in the same millisecond still sorts after the last one. */
  stamp(): number {
    this.lastStamp = Math.max(this.clock(), this.lastStamp + 1);
    return this.lastStamp;
  }

  /** Real time, for `server_time` and change tracking (never frozen). */
  wall(): number {
    return Date.now();
  }

  chat(id: string): StoredChat | null {
    return this.chats.get(id) ?? null;
  }

  /** Chats, newest message first. */
  list(): StoredChat[] {
    const last = (c: StoredChat) => c.messages[c.messages.length - 1]?.sentAt ?? 0;
    return [...this.chats.values()].sort((a, b) => last(b) - last(a));
  }

  findMessage(id: string): { chat: StoredChat; message: StoredMessage } | null {
    for (const chat of this.chats.values()) {
      const message = chat.messages.find((m) => m.id === id);
      if (message) return { chat, message };
    }
    return null;
  }

  task(id: string): StoredTask | null {
    return this.tasks.find((t) => t.id === id) ?? null;
  }

  tasksOf(chatId: string): StoredTask[] {
    return this.tasks.filter((t) => t.chatId === chatId);
  }

  completedTaskIds(): string[] {
    return this.tasks.filter((t) => t.status === "completed").map((t) => t.id);
  }

  unread(): { chats: number; messages: number } {
    let chats = 0;
    let messages = 0;
    for (const c of this.chats.values()) {
      if (c.unread > 0) chats += 1;
      messages += c.unread;
    }
    return { chats, messages };
  }

  addMessage(
    chatId: string,
    init: {
      kind?: MessageKind;
      body: string | null;
      media?: StoredMessage["media"];
      quotedId?: string | null;
      taskUpdateId?: string | null;
    },
  ): StoredMessage {
    const chat = this.chats.get(chatId);
    if (!chat) throw new Error(`no chat ${chatId}`);
    this.seq += 1;
    const message: StoredMessage = {
      id: `${chatId}-u${this.seq}`,
      conversationId: chatId,
      kind: init.kind ?? "text",
      direction: "out",
      sender: null,
      body: init.body,
      media: init.media ?? null,
      transcription: null,
      sentAt: this.stamp(),
      editedAt: null,
      quotedId: init.quotedId ?? null,
      reactions: [],
      taskUpdateId: init.taskUpdateId ?? null,
      modifiedAt: this.wall(),
    };
    chat.messages.push(message);
    return message;
  }

  /** The chat of a number, or a new empty one (Start chat from a client or project). */
  openChat(phone: string, title: string): StoredChat {
    const digits = phone.replace(/\D/g, "");
    const existing = [...this.chats.values()].find((c) => c.phone.replace(/\D/g, "") === digits);
    if (existing) return existing;
    const chat: StoredChat = {
      id: `demo-wa-new-${digits}`,
      title,
      isGroup: false,
      phone: digits,
      locale: "en",
      unread: 0,
      messages: [],
      links: [],
      digest: {},
      summary: { narrative: "", items: [] },
    };
    this.chats.set(chat.id, chat);
    return chat;
  }

  markRead(chatId: string): void {
    const chat = this.chats.get(chatId);
    if (chat) chat.unread = 0;
  }

  /** The user's reaction on a message: replaces the previous one; `null` removes it. */
  react(messageId: string, emoji: string | null): StoredMessage | null {
    const hit = this.findMessage(messageId);
    if (!hit) return null;
    hit.message.reactions = hit.message.reactions.filter((r) => !r.mine);
    if (emoji) hit.message.reactions.push({ emoji, name: null, mine: true });
    hit.message.modifiedAt = this.wall();
    return hit.message;
  }

  edit(messageId: string, body: string): StoredMessage | null {
    const hit = this.findMessage(messageId);
    if (!hit) return null;
    hit.message.body = body;
    hit.message.editedAt = this.stamp();
    hit.message.modifiedAt = this.wall();
    return hit.message;
  }

  remove(messageId: string): boolean {
    const hit = this.findMessage(messageId);
    if (!hit) return false;
    hit.chat.messages = hit.chat.messages.filter((m) => m.id !== messageId);
    this.deleted.push({ id: messageId, at: this.wall() });
    return true;
  }

  deletedSince(since: number): string[] {
    return this.deleted.filter((d) => d.at >= since).map((d) => d.id);
  }

  setTaskStatus(taskId: string, status: "open" | "completed"): StoredTask | null {
    const task = this.task(taskId);
    if (!task) return null;
    task.status = status;
    task.completedAt = status === "completed" ? this.stamp() : null;
    return task;
  }

  /** Tasks for the Tasks tab and the Digest: open ones first, then by due date (none last), then by number. */
  allTasks(status: "open" | "completed" | null = null): StoredTask[] {
    const rank = (t: StoredTask) => (t.status === "open" ? 0 : 1);
    return this.tasks
      .filter((t) => status === null || t.status === status)
      .sort((a, b) => rank(a) - rank(b) || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.n - b.n);
  }

  setLink(chatId: string, type: "lead" | "project", id: string, linked: boolean): void {
    const chat = this.chats.get(chatId);
    if (!chat) return;
    chat.links = chat.links.filter((l) => !(l.type === type && l.id === id));
    if (linked) chat.links.push({ type, id, source: "manual" });
  }
}
