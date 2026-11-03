import {
  API_VERSION,
  EDIT_WINDOW_MS,
  MAX_MESSAGE_CHARS,
  MAX_SEND_FILE_BYTES,
  type ApiErrorCode,
  type AskCitation,
  type AskResponse,
  type ConversationsResponse,
  type CrmEntitiesResponse,
  type DigestResponse,
  type DigestWindow,
  type EditMessageResponse,
  type ForwardTargetsResponse,
  type LinkPreviewResponse,
  type LoadHistoryResponse,
  type MarkReadResponse,
  type MessageKind,
  type MessageSearchHitDto,
  type MessageSearchResponse,
  type MessagesResponse,
  type MetaResponse,
  type ModuleFeature,
  type OkResponse,
  type OpenCheckResponse,
  type OpenStartResponse,
  type PreferencesResponse,
  type ReactionResponse,
  type ResyncResponse,
  type SendMessageResponse,
  type SessionResponse,
  type SummaryLookupResponse,
  type SummaryStreamEvent,
  type SummaryWindowKey,
  type TasksResponse,
  type TaskUpdateItem,
  type TaskUpdateResponse,
  type UnreadResponse,
  type WaAccountsResponse,
  type WaHealthResponse,
} from "../api/contract.ts";
import { buildTaskUpdateText } from "../chats/panel/taskUpdateMessage.ts";
import type { DemoDataset, DemoDirectory, DemoEdition } from "./demoDataset.ts";
import {
  chatListItem,
  conversationDto,
  crmLinks,
  homeTaskDto,
  iso,
  messageDto,
  reactionGroups,
  summaryDto,
  summaryPreview,
  taskDto,
  windowStart,
} from "./demoDto.ts";
import { DEFAULT_QUICK_REACTIONS, DEMO_ACCOUNT_ID, DemoStore, type DemoMedia, type StoredChat, type StoredMessage } from "./demoStore.ts";

/**
 * The fake WAAI (docs/WHATSAPP-DEMO-MODULE.md B2, C5): the module API implemented as a `fetch` function that
 * is handed to the ordinary `WaaiClient`, so all UI code stays as it is. Nothing here is sent anywhere. Every
 * answer is built from the types in `api/contract.ts`; what the CRM does not need answers `501 not_implemented`.
 */

/** Never fetched for real; only a prefix to strip. */
export const DEMO_BASE = "/waai-demo";

export interface DemoWaaiInput {
  dataset: DemoDataset;
  edition: DemoEdition;
  directory: DemoDirectory;
  crmUserId: string;
  /** Milliseconds; replaceable for tests. */
  now?: () => number;
  /** The files behind images, voice notes and documents (`demoMedia.ts`). */
  media?: DemoMedia;
  /** The language of the few sentences the router words itself. */
  language?: string;
}

export interface DemoWaai {
  fetch: typeof fetch;
  store: DemoStore;
}

const FEATURES: ModuleFeature[] = [
  "session",
  "meta",
  "unread",
  "media",
  "chats",
  "messages",
  "wa_health",
  "link_preview",
  "send",
  "message_ops",
  "text_assist",
  "open_by_phone",
  "summary",
  "chat_tasks",
  "task_updates",
  "crm_links",
  "digest",
  "tasks",
  "ask",
  "preferences",
  "wa_accounts",
  "settings",
];

const TEXT = {
  en: {
    notInDemo: "Not available in the demo.",
    emptyWindow: "No messages in this period.",
    linkedTask: "This task is synced with the CRM and cannot be changed that way in the demo.",
    askIntro: "In the demo, Ask searches the demo chats. These messages match:",
    askNothing: "Nothing found in the demo chats. Try another word.",
  },
  sk: {
    notInDemo: "V ukážke nie je dostupné.",
    emptyWindow: "V tomto období nie sú žiadne správy.",
    linkedTask: "Táto úloha je synchronizovaná s CRM a v ukážke sa takto zmeniť nedá.",
    askIntro: "V ukážke Opýtať sa prehľadáva ukážkové konverzácie. Tieto správy sedia:",
    askNothing: "V ukážkových konverzáciách sa nič nenašlo. Skúste iné slovo.",
  },
  hu: {
    notInDemo: "A demóban nem érhető el.",
    emptyWindow: "Ebben az időszakban nincs üzenet.",
    linkedTask: "Ez a feladat szinkronban van a CRM-mel, a demóban így nem módosítható.",
    askIntro: "A demóban a Kérdezz a minta beszélgetésekben keres. Ezek az üzenetek egyeznek:",
    askNothing: "A minta beszélgetésekben nem található semmi. Próbálj másik szót.",
  },
} as const;

const STUB_MEDIA: DemoMedia = {
  image: (placeholder) => `https://demo.invalid/media/${placeholder}.svg`,
  audio: () => "https://demo.invalid/media/silence.wav",
  document: () => "https://demo.invalid/media/document.txt",
};

/** Lower case without accents, so "dosky" finds "Dosky" and "Muller" finds "Müller". */
const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const digitsOf = (s: unknown): string => String(s ?? "").replace(/\D/g, "");

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fail = (status: number, code: ApiErrorCode, message: string): Response =>
  json({ error: { code, message, request_id: "demo" } }, status);

const noContent = (): Response => new Response(null, { status: 204 });

const sse = (events: SummaryStreamEvent[]): Response =>
  new Response(events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join(""), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });

interface Ctx {
  query: URLSearchParams;
  /** The capture groups of the route, decoded. */
  params: string[];
  /** Parsed JSON, a `FormData`, or undefined. */
  body: unknown;
}

type Handler = (c: Ctx) => Response | Promise<Response>;

const asRecord = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !(v instanceof FormData) ? (v as Record<string, unknown>) : {});

const kindOfFile = (type: string, asVoice: boolean): MessageKind =>
  asVoice ? "audio" : type.startsWith("image/") ? "image" : type.startsWith("audio/") ? "audio" : type.startsWith("video/") ? "video" : "document";

function objectUrl(file: Blob): string {
  try {
    return typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : "";
  } catch {
    return "";
  }
}

export function createDemoWaai(input: DemoWaaiInput): DemoWaai {
  const nowMs = () => input.now?.() ?? Date.now();
  const store = new DemoStore(input.dataset, input.media ?? STUB_MEDIA, nowMs);
  const text = TEXT[(input.language as keyof typeof TEXT) ?? "en"] ?? TEXT.en;
  const directory = input.directory;
  const user: MetaResponse["user"] = { id: "demo-user", role: "member", name: store.ownerEmail, crm_user_id: input.crmUserId };

  const withChat = (id: string, fn: (chat: StoredChat) => Response | Promise<Response>): Response | Promise<Response> => {
    const chat = store.chat(id);
    return chat ? fn(chat) : fail(404, "not_found", "chat");
  };

  /** Messages of a summary window, and the range it covers. */
  const windowOf = (chat: StoredChat, key: SummaryWindowKey, q: URLSearchParams) => {
    const now = nowMs();
    const from = key === "custom" ? Date.parse(q.get("from") ?? q.get("from_at") ?? "") : windowStart(key, now, store.timeZone);
    const to = key === "custom" ? Date.parse(q.get("to") ?? q.get("to_at") ?? "") : now;
    const lo = Number.isFinite(from) && from !== null ? from : -Infinity;
    const hi = Number.isFinite(to) ? to : Infinity;
    const inside = chat.messages.filter((m) => m.sentAt >= lo && m.sentAt <= hi);
    const first = inside[0]?.sentAt ?? chat.messages[0]?.sentAt ?? now;
    const last = inside[inside.length - 1]?.sentAt ?? now;
    return { count: inside.length, from: Number.isFinite(lo) ? lo : first, to: Number.isFinite(hi) && key !== "recent" ? hi : last };
  };

  const windowKey = (raw: string | null): SummaryWindowKey =>
    raw === "today" || raw === "d3" || raw === "d7" || raw === "d30" || raw === "custom" ? raw : "recent";

  const summaryFor = (chat: StoredChat, key: SummaryWindowKey, q: URLSearchParams) => {
    const w = windowOf(chat, key, q);
    const dto = summaryDto(store, chat, key, { from: w.from, to: w.to, messageCount: w.count });
    if (w.count === 0) {
      dto.id = null;
      dto.narrative = text.emptyWindow;
      dto.tasks = [];
    }
    return { dto, count: w.count };
  };

  /** Messages whose body or transcription contains the phrase, newest first. With `allWords`, a phrase with no hit falls back to all its words. */
  const findMessages = (phrase: string, allWords: boolean) => {
    const needle = fold(phrase.trim());
    const words = needle.split(/\s+/).filter(Boolean);
    const scan = (terms: string[]) => {
      const found: { chat: StoredChat; m: StoredMessage }[] = [];
      if (terms.length === 0) return found;
      for (const chat of store.chats.values()) {
        for (const m of chat.messages) {
          const haystack = fold([m.body, m.transcription].filter((x): x is string => !!x).join("\n"));
          if (terms.every((w) => haystack.includes(w))) found.push({ chat, m });
        }
      }
      return found.sort((a, b) => b.m.sentAt - a.m.sentAt);
    };
    const exact = scan([needle]);
    return exact.length > 0 || !allWords || words.length < 2 ? exact : scan(words);
  };
  const snippetOf = (m: StoredMessage): string => {
    const snippet = (m.body ?? m.transcription ?? "").trim();
    return snippet.length > 160 ? `${snippet.slice(0, 157)}…` : snippet;
  };

  let updateSeq = 0;
  const routes: [RegExp, RegExp, Handler][] = [];
  const on = (method: string, pattern: string, handler: Handler) => {
    routes.push([new RegExp(`^(?:${method})$`), new RegExp(`^${pattern}$`), handler]);
  };

  // ---- session, meta, health ------------------------------------------------------------------------------
  on("POST", "/session", () => {
    const body: SessionResponse = { access_token: "wam_demo", expires_in: 86_400, user, api_version: API_VERSION };
    return json(body);
  });
  on("DELETE", "/session", () => noContent());
  on("GET", "/meta", () => {
    const body: MetaResponse = {
      api_version: API_VERSION,
      features: FEATURES,
      user,
      ai_configured: true,
      standalone_url: null,
      wa_accounts: [{ id: DEMO_ACCOUNT_ID, status: "connected", display_name: store.ownerName }],
    };
    return json(body);
  });
  on("GET", "/unread", () => json(store.unread() satisfies UnreadResponse));
  on("GET", "/wa/health", () => json({ ok: true, worker_offline: false, disconnected: [], connecting: [] } satisfies WaHealthResponse));
  on("POST", "/wa/resync", () => json({ ok: true, synced: 0 } satisfies ResyncResponse));
  on("GET", "/og-preview", ({ query }) =>
    json({ title: null, description: null, image: null, site_name: null, url: query.get("url") ?? "" } satisfies LinkPreviewResponse),
  );

  // ---- the chat list and one chat -------------------------------------------------------------------------
  on("GET", "/conversations", () => {
    const chats = store.list();
    const summaries: ConversationsResponse["summaries"] = {};
    for (const chat of chats) {
      const preview = summaryPreview(chat);
      if (preview) summaries[chat.id] = preview;
    }
    const reported = new Set(Object.values(summaries).flatMap((s) => s.action_items.map((i) => i.task_id)));
    const body: ConversationsResponse = {
      conversations: chats.map((c) => chatListItem(store, c)),
      summaries,
      completed_task_ids: store.completedTaskIds().filter((id) => reported.has(id)),
      ai_configured: true,
      has_wa_account: true,
      user_name: store.ownerName,
      user_avatar_url: null,
    };
    return json(body);
  });
  on("GET", "/conversations/lite", () => {
    const body: ForwardTargetsResponse = {
      conversations: store.list().map((c) => ({ id: c.id, title: c.title, is_group: c.isGroup, avatar_url: null, wa_account_id: DEMO_ACCOUNT_ID })),
    };
    return json(body);
  });
  on("GET", "/conversations/([^/]+)", ({ params }) => withChat(params[0]!, (chat) => json(conversationDto(store, chat, directory))));

  // ---- messages -------------------------------------------------------------------------------------------
  on("GET", "/conversations/([^/]+)/messages", ({ params, query }) =>
    withChat(params[0]!, (chat) => {
      const limit = Math.min(100, Math.max(1, Number(query.get("limit")) || 50));
      const serverTime = iso(store.wall());
      const after = query.get("after");
      if (after) {
        const t = Date.parse(after);
        const since = Date.parse(query.get("since") ?? "");
        const changed = chat.messages.filter((m) => m.sentAt > t || (Number.isFinite(since) && m.modifiedAt >= since));
        const body: MessagesResponse = {
          messages: changed.slice(0, limit).map((m) => messageDto(store, m)),
          deleted_ids: Number.isFinite(since) ? store.deletedSince(since) : [],
          server_time: serverTime,
        };
        return json(body);
      }
      const before = Date.parse(query.get("before") ?? "");
      const pool = Number.isFinite(before) ? chat.messages.filter((m) => m.sentAt < before) : chat.messages;
      const through = query.get("through");
      const throughAt = through ? pool.findIndex((m) => m.id === through) : -1;
      const start = Math.max(0, Math.min(pool.length - limit, throughAt >= 0 ? throughAt : pool.length));
      const page = pool.slice(start);
      const body: MessagesResponse = {
        messages: page.map((m) => messageDto(store, m)),
        next_cursor: start > 0 && page[0] ? iso(page[0].sentAt) : null,
        server_time: serverTime,
      };
      return json(body);
    }),
  );
  on("POST", "/conversations/([^/]+)/load-history", ({ params }) =>
    withChat(params[0]!, () => json({ messages: [], next_cursor: null, reached_start: true } satisfies LoadHistoryResponse)),
  );
  on("POST", "/conversations/([^/]+)/mark-read", ({ params }) =>
    withChat(params[0]!, (chat) => {
      store.markRead(chat.id);
      return json({ unread_count: 0 } satisfies MarkReadResponse);
    }),
  );
  on("POST", "/conversations/([^/]+)/send", ({ params, body }) =>
    withChat(params[0]!, (chat) => {
      let message = "";
      let quotedRaw: unknown = null;
      let file: Blob | null = null;
      let asVoice = false;
      if (body instanceof FormData) {
        message = String(body.get("text") ?? "");
        quotedRaw = body.get("quoted_message_id");
        const f = body.get("file");
        file = f instanceof Blob ? f : null;
        asVoice = body.get("as_voice") === "1";
      } else {
        const b = asRecord(body);
        message = typeof b.text === "string" ? b.text : "";
        quotedRaw = b.quoted_message_id;
      }
      const trimmed = message.trim();
      if (!trimmed && !file) return fail(400, "invalid_input", "empty");
      if (trimmed.length > MAX_MESSAGE_CHARS) return fail(400, "invalid_input", "too_long");
      if (file && file.size > MAX_SEND_FILE_BYTES) return fail(413, "payload_too_large", "too_large");
      const quotedId = typeof quotedRaw === "string" && chat.messages.some((m) => m.id === quotedRaw) ? quotedRaw : null;
      const created = store.addMessage(chat.id, {
        kind: file ? kindOfFile(file.type, asVoice) : "text",
        body: trimmed || null,
        quotedId,
        media: file ? { url: objectUrl(file), mimeType: file.type || null, fileName: file instanceof File ? file.name : null } : null,
      });
      return json({ message: messageDto(store, created) } satisfies SendMessageResponse);
    }),
  );

  // ---- one message ----------------------------------------------------------------------------------------
  on("POST", "/messages/([^/]+)/reaction", ({ params, body }) => {
    const emoji = asRecord(body).emoji;
    if (emoji !== null && (typeof emoji !== "string" || emoji.length === 0 || emoji.length > 16)) return fail(400, "invalid_input", "invalid_emoji");
    const updated = store.react(params[0]!, emoji as string | null);
    return updated ? json({ reactions: reactionGroups(updated) } satisfies ReactionResponse) : fail(404, "not_found", "message");
  });
  on("PATCH", "/messages/([^/]+)", ({ params, body }) => {
    const hit = store.findMessage(params[0]!);
    if (!hit) return fail(404, "not_found", "message");
    const next = typeof asRecord(body).body === "string" ? (asRecord(body).body as string).trim() : "";
    if (hit.message.direction !== "out" || hit.message.kind !== "text") return fail(400, "invalid_input", "not_editable");
    if (!next) return fail(400, "invalid_input", "empty_body");
    if (nowMs() - hit.message.sentAt > EDIT_WINDOW_MS) return fail(409, "conflict", "edit_window_expired");
    const updated = store.edit(hit.message.id, next)!;
    return json({ id: updated.id, body: next, edited_at: iso(updated.editedAt ?? updated.sentAt), translation_note: null } satisfies EditMessageResponse);
  });
  on("DELETE", "/messages/([^/]+)", ({ params, query }) => {
    const hit = store.findMessage(params[0]!);
    if (!hit) return fail(404, "not_found", "message");
    if (query.get("scope") === "everyone" && hit.message.direction !== "out") return fail(400, "invalid_input", "not_revocable");
    store.remove(hit.message.id);
    return json({ ok: true } satisfies OkResponse);
  });
  on("POST", "/messages/([^/]+)/forward", ({ params, body }) => {
    const hit = store.findMessage(params[0]!);
    if (!hit) return fail(404, "not_found", "message");
    const target = store.chat(String(asRecord(body).target_conversation_id ?? ""));
    if (!target) return fail(404, "not_found", "target_not_found");
    store.addMessage(target.id, { kind: hit.message.kind, body: hit.message.body, media: hit.message.media });
    return json({ ok: true } satisfies OkResponse);
  });
  on("GET", "/messages/search", ({ query }) => {
    const q = query.get("q") ?? "";
    if (fold(q.trim()).length < 2) return json({ hits: [], next_cursor: null } satisfies MessageSearchResponse);
    const hits: MessageSearchHitDto[] = findMessages(q, false)
      .slice(0, 50)
      .map(({ chat, m }) => ({
        message_id: m.id,
        conversation_id: chat.id,
        conversation_title: chat.title,
        avatar_url: null,
        is_group: chat.isGroup,
        kind: m.kind,
        direction: m.direction,
        sender: m.sender,
        snippet: snippetOf(m),
        sent_at: iso(m.sentAt),
      }));
    return json({ hits, next_cursor: null } satisfies MessageSearchResponse);
  });

  // ---- summary, tasks, CRM links --------------------------------------------------------------------------
  on("GET", "/conversations/([^/]+)/summary", ({ params, query }) =>
    withChat(params[0]!, (chat) => {
      const key = windowKey(query.get("window"));
      if (key === "recent") {
        const { dto, count } = summaryFor(chat, key, query);
        return json({ cached: true, message_count: count, summary: dto } satisfies SummaryLookupResponse);
      }
      // Other windows are not cached: the panel then asks for the stream below, which answers at once.
      return json({ cached: false, message_count: windowOf(chat, key, query).count, summary: null } satisfies SummaryLookupResponse);
    }),
  );
  on("POST", "/conversations/([^/]+)/summary", ({ params, body }) =>
    withChat(params[0]!, (chat) => {
      const b = asRecord(body);
      const key = windowKey(typeof b.window === "string" ? b.window : null);
      const q = new URLSearchParams();
      if (typeof b.from_at === "string") q.set("from", b.from_at);
      if (typeof b.to_at === "string") q.set("to", b.to_at);
      const { dto, count } = summaryFor(chat, key, q);
      // No real generation: the cached summary comes back as if it had just been written.
      return sse([
        { event: "meta", data: { message_count: count, window: key, from_at: dto.from_at, to_at: dto.to_at } },
        { event: "done", data: { cached: true, summary: dto } },
      ]);
    }),
  );
  on("GET", "/conversations/([^/]+)/crm-links", ({ params }) => withChat(params[0]!, (chat) => json(crmLinks(chat, directory))));
  on("PUT", "/conversations/([^/]+)/crm-links", ({ params, body }) =>
    withChat(params[0]!, (chat) => {
      const b = asRecord(body);
      const type = b.entity_type;
      const id = b.crm_id;
      if ((type !== "lead" && type !== "project") || typeof id !== "string" || typeof b.linked !== "boolean") return fail(400, "invalid_input", "invalid_input");
      if (b.linked && !directory.get(type, id)) return fail(404, "not_found", "entity");
      store.setLink(chat.id, type, id, b.linked);
      return json(crmLinks(chat, directory));
    }),
  );
  on("GET", "/crm/entities", ({ query }) => json({ entities: directory.search(query.get("q") ?? "") } satisfies CrmEntitiesResponse));
  on("GET", "/tasks", ({ query }) => {
    const conversation = query.get("conversation_id") ?? query.get("conversationId") ?? query.get("conversation");
    if (conversation) return json({ tasks: store.tasksOf(conversation).map((t) => taskDto(store, t)) });
    // The Tasks tab: every task of the account, filtered by `status` when it sends one.
    const status = query.get("status");
    const body: TasksResponse = {
      tasks: store.allTasks(status === "open" || status === "completed" ? status : null).map((t) => homeTaskDto(store, t)),
      crm_push_enabled: true,
    };
    return json(body);
  });
  // The CRM task already exists (that is what `crm_task_id` is): "send to CRM" has nothing left to do.
  on("POST", "/tasks/([^/]+)/crm", ({ params }) => (store.task(params[0]!) ? json({ ok: true } satisfies OkResponse) : fail(404, "not_found", "task")));
  on("PATCH", "/tasks/([^/]+)", ({ params, body }) => {
    const task = store.task(params[0]!);
    if (!task) return fail(404, "not_found", "task");
    const status = asRecord(body).status;
    if (status !== "open" && status !== "completed") return fail(400, "invalid_input", "invalid_input");
    // As in WAAI: a task that is linked to a CRM task cannot be reopened once it is done.
    if (task.status === "completed" && status === "open") return fail(409, "conflict", text.linkedTask);
    return json(taskDto(store, store.setTaskStatus(task.id, status)!));
  });
  on("DELETE", "/tasks/([^/]+)", ({ params }) => (store.task(params[0]!) ? fail(409, "conflict", text.linkedTask) : fail(404, "not_found", "task")));
  on("POST", "/conversations/([^/]+)/task-updates", ({ params, body }) =>
    withChat(params[0]!, (chat) => {
      if (!(body instanceof FormData)) return fail(400, "bad_request", "form");
      let items: TaskUpdateItem[] = [];
      try {
        const parsed: unknown = JSON.parse(String(body.get("items") ?? "[]"));
        if (Array.isArray(parsed)) items = parsed as TaskUpdateItem[];
      } catch {
        return fail(400, "bad_request", "items");
      }
      const tasks = items.map((i) => ({ item: i, task: store.task(i.task_id) })).filter((x) => x.task && x.task.chatId === chat.id);
      if (tasks.length === 0) return fail(400, "invalid_input", "invalid_input");
      const lang = String(body.get("language") ?? "en");
      const files = body.getAll("file").length;
      const message = store.addMessage(chat.id, {
        body: buildTaskUpdateText({
          language: lang === "sk" || lang === "hu" ? lang : "en",
          senderName: store.ownerName,
          items: tasks.map(({ item, task }) => ({ title: task!.title, notes: item.notes ?? null })),
          attachmentCount: files,
        }),
        taskUpdateId: `demo-task-update-${(updateSeq += 1)}`,
      });
      for (const { task } of tasks) task!.notifiedAt = message.sentAt;
      return json({ update: { id: message.taskUpdateId ?? "demo", status: "sent", error: null }, failed_attachments: 0, notified_at: iso(message.sentAt) } satisfies TaskUpdateResponse);
    }),
  );

  // ---- open by phone --------------------------------------------------------------------------------------
  on("POST", "/open/check", ({ body }) => {
    const status = store.numbers.get(digitsOf(asRecord(body).phone));
    return json((status === "registered" ? { status: "registered" } : { status: "not_registered" }) satisfies OpenCheckResponse);
  });
  on("POST", "/open/start", ({ body }) => {
    const b = asRecord(body);
    const phone = digitsOf(b.phone);
    const message = typeof b.text === "string" ? b.text.trim() : "";
    if (!phone || !message) return json({ ok: false, code: "invalid" } satisfies OpenStartResponse);
    if (store.numbers.get(phone) !== "registered") return json({ ok: false, code: "not_registered" } satisfies OpenStartResponse);
    const leadId = typeof b.lead_id === "string" ? b.lead_id : null;
    const projectId = typeof b.project_id === "string" ? b.project_id : null;
    const named = (leadId && directory.get("lead", leadId)) || (projectId && directory.get("project", projectId)) || null;
    const chat = store.openChat(phone, named ? named.name : `+${phone}`);
    if (leadId && directory.get("lead", leadId) && !chat.links.some((l) => l.type === "lead" && l.id === leadId)) store.setLink(chat.id, "lead", leadId, true);
    if (projectId && directory.get("project", projectId) && !chat.links.some((l) => l.type === "project" && l.id === projectId)) store.setLink(chat.id, "project", projectId, true);
    store.addMessage(chat.id, { body: message });
    return json({ ok: true, conversation_id: chat.id } satisfies OpenStartResponse);
  });

  // ---- Digest, Ask, Preferences, Accounts ----------------------------------------------------------------
  on("POST", "/digest", ({ body }) => {
    const asked = asRecord(body).window;
    const window: DigestWindow = asked === "today" || asked === "d3" || asked === "d7" || asked === "d30" ? asked : "d7";
    // No generation: one bullet per chat from the summary it already has, and the tasks that are still open.
    const chats = store.list().filter((c) => c.summary.narrative.trim());
    const narrative = chats.map((c) => `- **${c.title}**: ${c.summary.narrative.replace(/\s+/g, " ").trim()}`).join("\n");
    const out: DigestResponse = {
      id: `demo-digest-${window}`,
      window,
      cached: true,
      chat_count: chats.length,
      narrative,
      tasks: store.allTasks("open").map((t) => homeTaskDto(store, t)),
      meetings: [],
      has_audio: false,
      audio_url: null,
      auto_audio: false,
      created_at: iso(nowMs()),
    };
    return json(out);
  });
  on("GET", "/digest/audio", () => fail(501, "not_implemented", text.notInDemo));

  on("POST", "/search", ({ body }) => {
    const q = typeof asRecord(body).q === "string" ? (asRecord(body).q as string).trim() : "";
    if (!q) return fail(400, "invalid_input", "empty");
    const sources: AskCitation[] = findMessages(q, true)
      .slice(0, 5)
      .map(({ chat, m }, i) => ({
        index: i + 1,
        message_id: m.id,
        conversation_id: chat.id,
        conversation_title: chat.title,
        is_group: chat.isGroup,
        sender: m.sender,
        snippet: snippetOf(m),
        sent_at: iso(m.sentAt),
      }));
    return json({ answer: sources.length > 0 ? text.askIntro : text.askNothing, sources } satisfies AskResponse);
  });

  const preferences = (): PreferencesResponse => ({
    auto_detect_summary_lang: store.autoDetectSummaryLang,
    quick_reactions: store.quickReactions,
    quick_reaction_count: DEFAULT_QUICK_REACTIONS.length,
  });
  on("GET", "/preferences", () => json(preferences()));
  on("PUT", "/preferences", ({ body }) => {
    const flag = asRecord(body).auto_detect_summary_lang;
    if (typeof flag !== "boolean") return fail(400, "invalid_input", "invalid_input");
    store.autoDetectSummaryLang = flag;
    return json(preferences());
  });
  on("PUT", "/preferences/quick-reactions", ({ body }) => {
    const emojis = asRecord(body).emojis;
    const ok = Array.isArray(emojis) && emojis.length >= 1 && emojis.length <= DEFAULT_QUICK_REACTIONS.length && emojis.every((e) => typeof e === "string" && e.length > 0 && e.length <= 16);
    if (!ok) return fail(400, "invalid_input", "invalid_input");
    store.quickReactions = [...(emojis as string[])];
    return json(preferences());
  });
  on("DELETE", "/preferences/quick-reactions", () => {
    store.quickReactions = [...DEFAULT_QUICK_REACTIONS];
    return json(preferences());
  });

  on("GET", "/wa-accounts", () =>
    json({
      accounts: [
        {
          id: DEMO_ACCOUNT_ID,
          status: "connected",
          display_name: store.ownerName,
          phone_number: store.ownerPhone,
          last_error: null,
          owner_email: store.ownerEmail,
          owner_user_id: null,
        },
      ],
    } satisfies WaAccountsResponse),
  );
  // Linking, disconnecting, removing an account and wiping the data would change a real WhatsApp account (B6).
  on("(?:POST|PUT|PATCH|DELETE)", "/wa-accounts(?:/.*)?", () => fail(501, "not_implemented", text.notInDemo));
  on("POST", "/reset-data", () => fail(501, "not_implemented", text.notInDemo));

  // ---- no sensible demo answer ----------------------------------------------------------------------------
  on("POST", "/chat/text-assist", () => fail(501, "not_implemented", text.notInDemo));
  on("(?:GET|POST|PUT|PATCH|DELETE)", "/admin(?:/.*)?", () => fail(403, "forbidden", text.notInDemo));

  const demoFetch = async (resource: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    // Settle on the microtask queue, never on a timer: the fake answers as soon as the caller awaits it.
    await Promise.resolve();
    const raw = typeof resource === "string" ? resource : resource instanceof URL ? resource.href : resource.url;
    const url = new URL(raw, "http://demo.invalid");
    if (!url.pathname.startsWith(DEMO_BASE)) return fail(404, "route_not_found", "route");
    const path = url.pathname.slice(DEMO_BASE.length) || "/";
    const method = (init?.method ?? "GET").toUpperCase();

    let body: unknown;
    const rawBody = init?.body;
    if (typeof rawBody === "string") {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return fail(400, "bad_request", "json");
      }
    } else if (rawBody instanceof FormData) {
      body = rawBody;
    }

    for (const [methods, pattern, handler] of routes) {
      if (!methods.test(method)) continue;
      const hit = pattern.exec(path);
      if (!hit) continue;
      const params = hit.slice(1).map((p) => (p === undefined ? "" : decodeURIComponent(p)));
      const result = await handler({ query: url.searchParams, params, body });
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return result;
    }
    return fail(501, "not_implemented", text.notInDemo);
  };

  return { fetch: demoFetch as typeof fetch, store };
}
