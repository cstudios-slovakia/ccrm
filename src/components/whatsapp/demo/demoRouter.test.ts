import assert from "node:assert/strict";
import test from "node:test";
import type {
  AskResponse,
  ChatCrmLinks,
  ConversationResponse,
  ConversationsResponse,
  DigestResponse,
  MessageDto,
  MessageSearchResponse,
  MessagesResponse,
  MetaResponse,
  OpenCheckResponse,
  OpenStartResponse,
  PreferencesResponse,
  ReactionResponse,
  SendMessageResponse,
  SummaryLookupResponse,
  TasksResponse,
  TaskDto,
  UnreadResponse,
  WaAccountsResponse,
} from "../api/contract.ts";
import { WaaiApiError, WaaiClient } from "../api/waaiClient.ts";
import { rowBullets } from "../chats/summaryBullets.ts";
import { directory, FIXED_NOW, loadSk, media } from "./demoFixture.ts";
import { createDemoWaai, DEMO_BASE } from "./demoRouter.ts";

const C1 = "demo-wa-c1-site";

/** A client wired to a fresh fake exactly as `useWaaiSession` does it. */
function setup(now = FIXED_NOW) {
  const demo = createDemoWaai({ dataset: loadSk(), edition: "sk", directory, crmUserId: "user-7", now: () => now, media, language: "en" });
  const client = new WaaiClient({ base: DEMO_BASE, fetch: demo.fetch, fetchSsoToken: async () => "demo", isDemo: true });
  return { demo, client };
}

const rejection = async (p: Promise<unknown>): Promise<WaaiApiError> => {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof WaaiApiError, `expected a WaaiApiError, got ${String(e)}`);
    return e;
  }
  throw new Error("expected the call to fail");
};

test("session and meta: a member with one connected demo account, every feature, no standalone", async () => {
  const { client } = setup();
  const session = await client.open();
  assert.ok(session.access_token.startsWith("wam_"));
  assert.equal(session.api_version, 1);
  const meta = await client.get<MetaResponse>("/meta");
  assert.equal(meta.user.role, "member");
  assert.equal(meta.user.crm_user_id, "user-7");
  assert.equal(meta.user.name, "andrej.kollar@lapidea.example");
  assert.equal(meta.standalone_url, null);
  assert.equal(meta.ai_configured, true);
  assert.deepEqual(meta.wa_accounts, [{ id: "demo-wa-account", status: "connected", display_name: "Andrej Kollár" }]);
  assert.ok(meta.features.includes("summary") && meta.features.includes("send"));
  assert.equal(client.isDemo, true);
  await client.signOut();
});

test("the chat list: four chats newest first, unread badges, and the summary cards of C4", async () => {
  const { client } = setup();
  const list = await client.get<ConversationsResponse>("/conversations", { query: { owner: null } });
  assert.deepEqual(list.conversations.map((c) => c.id), [C1, "demo-wa-c6-hotel", "demo-wa-c2-warranty", "demo-wa-l10-architect"]);
  assert.deepEqual(list.conversations.map((c) => c.unread_count), [2, 2, 0, 0]);
  assert.equal(list.has_wa_account, true);
  assert.equal(list.user_name, "Andrej Kollár");
  assert.equal(list.conversations[0]!.avatar_url, null);
  assert.equal(list.conversations[0]!.last_message!.direction, "in");

  const done = new Set(list.completed_task_ids);
  assert.ok(done.has("demo-wa-task-1") && !done.has("demo-wa-task-3"));
  const shown = (id: string) => {
    const r = rowBullets(list.summaries[id], done);
    return r.kind === "bullets" ? r.bullets.length : r.kind;
  };
  // 4 / 2 / 3 / 1 bullets on the rows, as docs/WHATSAPP-DEMO-MODULE.md C4 says.
  assert.deepEqual([C1, "demo-wa-l10-architect", "demo-wa-c6-hotel", "demo-wa-c2-warranty"].map(shown), [4, 2, 3, 1]);
  assert.deepEqual(list.summaries[C1]!.action_items.map((i) => i.task_id), ["demo-wa-task-3", "demo-wa-task-2", "demo-wa-task-1", null, null]);
  assert.equal(list.summaries[C1]!.message_count, 13);

  assert.deepEqual(await client.get<UnreadResponse>("/unread"), { chats: 2, messages: 4 });
});

test("one chat: header, CRM links through the directory (a missing record is left out)", async () => {
  const { client } = setup();
  const chat = await client.get<ConversationResponse>(`/conversations/${C1}`);
  assert.equal(chat.sender_name, "Andrej Kollár");
  assert.equal(chat.detected_locale, "sk");
  assert.equal(chat.is_self_chat, false);
  assert.equal(chat.quick_reactions.length, 6);
  assert.equal(chat.crm_links.supported, true);
  assert.deepEqual(chat.crm_links.links.map((l) => [l.entity_type, l.crm_id, l.name, l.is_client, l.source]), [
    ["lead", "demo-clients-1", "Lapidea Horský park", true, "auto"],
    ["project", "demo-projects-1", "Fasáda Horský park", false, "auto"],
  ]);
  // The hotel chat links to records this directory does not hold.
  const hotel = await client.get<ConversationResponse>("/conversations/demo-wa-c6-hotel");
  assert.deepEqual(hotel.crm_links.links, []);
  const missing = await rejection(client.get("/conversations/nope"));
  assert.equal(missing.status, 404);
});

test("messages: kinds, media, a quoted reply, reactions, and paging", async () => {
  const { client } = setup();
  const all = await client.get<MessagesResponse>(`/conversations/${C1}/messages`, { query: { limit: 50 } });
  assert.equal(all.messages.length, 13);
  assert.equal(all.next_cursor, null);
  assert.ok(Number.isFinite(Date.parse(all.server_time)));
  const byId = new Map(all.messages.map((m) => [m.id, m]));
  const doc = byId.get(`${C1}-m05`)!;
  assert.equal(doc.kind, "document");
  assert.equal(doc.media!.file_name, "Harmonogram montáže – Horský park.pdf");
  assert.equal(byId.get(`${C1}-m07`)!.kind, "image");
  assert.equal(byId.get(`${C1}-m09`)!.quoted!.id, `${C1}-m08`);
  assert.equal(byId.get(`${C1}-m09`)!.quoted!.sender, "Marek Šimko");
  assert.deepEqual(doc.reactions, [{ emoji: "👍", count: 1, mine: false, reactors: [{ name: "Marek Šimko", mine: false }] }]);
  assert.equal(byId.get(`${C1}-m02`)!.sender, null);
  assert.equal(byId.get(`${C1}-m01`)!.direction, "in");

  // The newest page, then the one before it.
  const page = await client.get<MessagesResponse>(`/conversations/${C1}/messages`, { query: { limit: 5 } });
  assert.deepEqual(page.messages.map((m) => m.id), [8, 9, 10, 11, 12].map((n) => `${C1}-m${String(n + 1).padStart(2, "0")}`));
  assert.equal(page.next_cursor, page.messages[0]!.sent_at);
  const older = await client.get<MessagesResponse>(`/conversations/${C1}/messages`, { query: { before: page.next_cursor, limit: 5 } });
  assert.deepEqual(older.messages.map((m) => m.id), [3, 4, 5, 6, 7].map((n) => `${C1}-m${String(n + 1).padStart(2, "0")}`));

  // A deep link reaches back to the linked message even when it is older than the newest page.
  const through = await client.get<MessagesResponse>(`/conversations/${C1}/messages`, { query: { limit: 3, through: `${C1}-m06` } });
  assert.equal(through.messages[0]!.id, `${C1}-m06`);
  assert.equal(through.messages.at(-1)!.id, `${C1}-m13`);
  assert.notEqual(through.next_cursor, null);

  const history = await client.post<{ messages: MessageDto[]; reached_start: boolean }>(`/conversations/${C1}/load-history`, { before: all.messages[0]!.sent_at });
  assert.deepEqual([history.messages.length, history.reached_start], [0, true]);
});

test("the voice note has its transcription and a playable file", async () => {
  const { client } = setup();
  const res = await client.get<MessagesResponse>("/conversations/demo-wa-c6-hotel/messages");
  const voice = res.messages.find((m) => m.kind === "audio")!;
  assert.equal(voice.transcription_status, "done");
  assert.ok(voice.transcription);
  assert.equal(voice.media!.url, "https://demo.test/silence.wav");
  // An absolute address is used as it is, not put behind the module base.
  assert.equal(client.mediaUrl(voice.media!.url), "https://demo.test/silence.wav");
});

test("send: a text message appears as the last outgoing bubble, a quote is kept, empty is refused", async () => {
  const { client } = setup();
  const sent = await client.post<SendMessageResponse>(`/conversations/${C1}/send`, { text: "  Test  ", quoted_message_id: `${C1}-m13` });
  assert.equal(sent.message.body, "Test");
  assert.equal(sent.message.direction, "out");
  assert.equal(sent.message.quoted!.id, `${C1}-m13`);

  const list = await client.get<ConversationsResponse>("/conversations");
  assert.equal(list.conversations[0]!.id, C1);
  assert.equal(list.conversations[0]!.last_message!.body, "Test");
  assert.equal(list.conversations[0]!.last_message!.direction, "out");

  const all = await client.get<MessagesResponse>(`/conversations/${C1}/messages`);
  assert.equal(all.messages.at(-1)!.id, sent.message.id);

  // The 5 s poll finds it with `after`, and nothing else.
  const prev = all.messages.at(-2)!.sent_at;
  const poll = await client.get<MessagesResponse>(`/conversations/${C1}/messages`, { query: { after: prev, since: all.server_time, limit: 100 } });
  assert.deepEqual(poll.messages.map((m) => m.id), [sent.message.id]);

  const empty = await rejection(client.post(`/conversations/${C1}/send`, { text: "   " }));
  assert.equal(empty.status, 400);
  assert.equal(empty.code, "invalid_input");
  assert.equal(empty.message, "empty");
});

test("send: an attachment through a FormData goes through the client, kind from its type", async () => {
  const { client } = setup();
  const form = new FormData();
  form.append("file", new File([new Uint8Array(16)], "foto.png", { type: "image/png" }));
  form.append("text", "Pozrite");
  const image = await client.post<SendMessageResponse>(`/conversations/${C1}/send`, form);
  assert.equal(image.message.kind, "image");
  assert.equal(image.message.body, "Pozrite");
  assert.equal(image.message.media!.file_name, "foto.png");
  assert.equal(image.message.media!.mime_type, "image/png");
  assert.ok(image.message.media!.url.length > 0);

  const voice = new FormData();
  voice.append("file", new File([new Uint8Array(16)], "voice-note.webm", { type: "audio/webm" }));
  voice.append("as_voice", "1");
  assert.equal((await client.post<SendMessageResponse>(`/conversations/${C1}/send`, voice)).message.kind, "audio");

  const pdf = new FormData();
  pdf.append("file", new File([new Uint8Array(16)], "a.pdf", { type: "application/pdf" }));
  assert.equal((await client.post<SendMessageResponse>(`/conversations/${C1}/send`, pdf)).message.kind, "document");
});

test("reactions: set, replace, remove; an odd emoji is refused", async () => {
  const { client } = setup();
  const id = `${C1}-m06`;
  const first = await client.post<ReactionResponse>(`/messages/${id}/reaction`, { emoji: "👍" });
  assert.deepEqual(first.reactions, [{ emoji: "👍", count: 1, mine: true, reactors: [{ name: null, mine: true }] }]);
  const second = await client.post<ReactionResponse>(`/messages/${id}/reaction`, { emoji: "❤️" });
  assert.deepEqual(second.reactions.map((r) => r.emoji), ["❤️"]);
  assert.deepEqual((await client.post<ReactionResponse>(`/messages/${id}/reaction`, { emoji: null })).reactions, []);
  assert.equal((await rejection(client.post(`/messages/${id}/reaction`, { emoji: "" }))).message, "invalid_emoji");
  assert.equal((await rejection(client.post(`/messages/nope/reaction`, { emoji: "👍" }))).status, 404);

  // The message in the chat carries it (a reaction on the contact's own reaction stays too).
  await client.post(`/messages/${C1}-m05/reaction`, { emoji: "👍" });
  const doc = (await client.get<MessagesResponse>(`/conversations/${C1}/messages`)).messages.find((m) => m.id === `${C1}-m05`)!;
  assert.deepEqual(doc.reactions[0], { emoji: "👍", count: 2, mine: true, reactors: [{ name: null, mine: true }, { name: "Marek Šimko", mine: false }] });
});

test("mark-read clears the badge and the unread count", async () => {
  const { client } = setup();
  assert.deepEqual(await client.post(`/conversations/${C1}/mark-read`), { unread_count: 0 });
  assert.deepEqual(await client.get<UnreadResponse>("/unread"), { chats: 1, messages: 2 });
  const list = await client.get<ConversationsResponse>("/conversations");
  assert.equal(list.conversations.find((c) => c.id === C1)!.unread_count, 0);
});

test("edit and delete: a fresh message can be edited, an old one is past the window; delete reports in the poll", async () => {
  const { client } = setup();
  const sent = (await client.post<SendMessageResponse>(`/conversations/${C1}/send`, { text: "typo" })).message;
  const edited = await client.patch<{ id: string; body: string; edited_at: string }>(`/messages/${sent.id}`, { body: "fixed" });
  assert.equal(edited.body, "fixed");
  assert.equal((await rejection(client.patch(`/messages/${C1}-m02`, { body: "x" }))).message, "edit_window_expired");
  assert.equal((await rejection(client.patch(`/messages/${C1}-m01`, { body: "x" }))).message, "not_editable");
  assert.equal((await rejection(client.patch(`/messages/${sent.id}`, { body: "  " }))).message, "empty_body");

  assert.equal((await rejection(client.del(`/messages/${C1}-m01`, { query: { scope: "everyone" } }))).message, "not_revocable");
  const before = await client.get<MessagesResponse>(`/conversations/${C1}/messages`);
  assert.deepEqual(await client.del(`/messages/${sent.id}`, { query: { scope: "everyone" } }), { ok: true });
  const poll = await client.get<MessagesResponse>(`/conversations/${C1}/messages`, { query: { after: before.messages.at(-1)!.sent_at, since: before.server_time } });
  assert.deepEqual(poll.deleted_ids, [sent.id]);
});

test("forward copies a message into another chat of the account", async () => {
  const { client } = setup();
  const targets = await client.get<{ conversations: { id: string; wa_account_id: string }[] }>("/conversations/lite");
  assert.equal(targets.conversations.length, 4);
  assert.ok(targets.conversations.every((c) => c.wa_account_id === "demo-wa-account"));
  await client.post(`/messages/${C1}-m13/forward`, { target_conversation_id: "demo-wa-c2-warranty" });
  const last = (await client.get<MessagesResponse>("/conversations/demo-wa-c2-warranty/messages")).messages.at(-1)!;
  assert.equal(last.direction, "out");
  assert.match(last.body!, /CNC/);
  assert.equal((await rejection(client.post(`/messages/${C1}-m13/forward`, { target_conversation_id: "nope" }))).status, 404);
});

test("search ignores case and accents and finds bodies and transcriptions", async () => {
  const { client } = setup();
  const dosky = await client.get<MessageSearchResponse>("/messages/search", { query: { q: "DOSKY" } });
  assert.ok(dosky.hits.length >= 1);
  assert.ok(dosky.hits.every((h) => /dosky/i.test(h.snippet)));
  assert.ok(dosky.hits.every((h) => h.snippet.length > 0 && h.conversation_title));
  assert.deepEqual([...dosky.hits].map((h) => h.sent_at), [...dosky.hits].map((h) => h.sent_at).sort().reverse());
  const muller = await client.get<MessageSearchResponse>("/messages/search", { query: { q: "muller" } });
  assert.ok(muller.hits.every((h) => h.conversation_id === "demo-wa-l10-architect"));
  assert.ok(muller.hits.length >= 1);
  // Only in the voice note's transcription.
  const spar = await client.get<MessageSearchResponse>("/messages/search", { query: { q: "osvetleni" } });
  assert.ok(spar.hits.some((h) => h.kind === "audio"));
  assert.deepEqual((await client.get<MessageSearchResponse>("/messages/search", { query: { q: "x" } })).hits, []);
  assert.deepEqual((await client.get<MessageSearchResponse>("/messages/search", { query: { q: "zzzzqq" } })).hits, []);
});

test("summary: the cached one for `recent`, the stream answers other windows at once", async () => {
  const { client } = setup();
  const recent = await client.get<SummaryLookupResponse>(`/conversations/${C1}/summary`, { query: { window: "recent" } });
  assert.equal(recent.cached, true);
  assert.equal(recent.summary!.window, "recent");
  assert.match(recent.summary!.narrative, /Marek Šimko/);
  assert.equal(recent.summary!.tasks.length, 3);
  assert.equal(recent.message_count, 13);

  const today = await client.get<SummaryLookupResponse>(`/conversations/${C1}/summary`, { query: { window: "today" } });
  assert.equal(today.cached, false);
  assert.equal(today.summary, null);
  assert.equal(today.message_count, 2);

  const events: { event: string; data: string }[] = [];
  await client.stream(`/conversations/${C1}/summary`, (e) => events.push(e), { method: "POST", body: { window: "today", language: "sk" } });
  assert.deepEqual(events.map((e) => e.event), ["meta", "done"]);
  const done = JSON.parse(events[1]!.data) as { cached: boolean; summary: { window: string; narrative: string } };
  assert.equal(done.cached, true);
  assert.equal(done.summary.window, "today");
  assert.match(done.summary.narrative, /Marek/);

  // A window with no messages says so instead of repeating the chat summary.
  let clock = FIXED_NOW;
  const later = createDemoWaai({ dataset: loadSk(), edition: "sk", directory, crmUserId: "u", now: () => clock, media });
  const d3Empty = new WaaiClient({ base: DEMO_BASE, fetch: later.fetch, fetchSsoToken: async () => "demo" });
  clock += 20 * 86_400_000; // the demo stays open for three weeks: the seeded messages are now old
  const empty: { event: string; data: string }[] = [];
  await d3Empty.stream(`/conversations/${C1}/summary`, (e) => empty.push(e), { method: "POST", body: { window: "d3" } });
  const emptyDone = JSON.parse(empty[1]!.data) as { summary: { id: string | null; tasks: unknown[] } };
  assert.equal(emptyDone.summary.id, null);
  assert.deepEqual(emptyDone.summary.tasks, []);
});

test("chat tasks: dates, the CRM ids, ticking one retires its bullet, a done one cannot be reopened or deleted", async () => {
  const { client } = setup();
  const res = await client.get<{ tasks: TaskDto[] }>("/tasks", { query: { conversationId: C1, conversation_id: C1 } });
  assert.deepEqual(res.tasks.map((t) => t.id), ["demo-wa-task-1", "demo-wa-task-2", "demo-wa-task-3"]);
  const [one, two, three] = res.tasks as [TaskDto, TaskDto, TaskDto];
  assert.equal(one.status, "completed");
  assert.ok(one.completed_at);
  assert.equal(two.due_at, "2026-07-16T10:00:00.000Z");
  assert.equal(three.due_at, null);
  assert.equal(three.crm_task_id, "demo-whatsapp-3");
  assert.equal(three.origin, "waai");
  assert.equal(three.crm_sync_state, "synced");
  assert.equal(three.conversation_title, "Marek Šimko – Horský park");
  assert.equal(three.source_message_id, `${C1}-m13`);

  const ticked = await client.patch<TaskDto>("/tasks/demo-wa-task-3", { status: "completed" });
  assert.equal(ticked.status, "completed");
  assert.ok(ticked.completed_at);
  const list = await client.get<ConversationsResponse>("/conversations");
  assert.ok(list.completed_task_ids.includes("demo-wa-task-3"));
  const row = rowBullets(list.summaries[C1], new Set(list.completed_task_ids));
  assert.equal(row.kind === "bullets" ? row.bullets.length : -1, 3);

  assert.equal((await rejection(client.patch("/tasks/demo-wa-task-3", { status: "open" }))).code, "conflict");
  assert.equal((await rejection(client.del("/tasks/demo-wa-task-2"))).code, "conflict");
  assert.equal((await rejection(client.patch("/tasks/nope", { status: "completed" }))).status, 404);
  assert.equal((await rejection(client.patch("/tasks/demo-wa-task-2", { status: "weird" }))).status, 400);
});

test("a task update is reported into the chat as an outgoing message", async () => {
  const { client } = setup();
  const form = new FormData();
  form.set("client_request_id", "r1");
  form.set("language", "en");
  form.set("items", JSON.stringify([{ task_id: "demo-wa-task-1", notes: "All sent" }]));
  const res = await client.post<{ update: { status: string }; failed_attachments: number; notified_at: string }>(`/conversations/${C1}/task-updates`, form);
  assert.equal(res.update.status, "sent");
  const last = (await client.get<MessagesResponse>(`/conversations/${C1}/messages`)).messages.at(-1)!;
  assert.equal(last.direction, "out");
  assert.ok(last.task_update_id);
  assert.match(last.body!, /All sent/);
  const tasks = await client.get<{ tasks: TaskDto[] }>("/tasks", { query: { conversation_id: C1 } });
  assert.equal(tasks.tasks[0]!.notified_at, res.notified_at);
});

test("CRM links: set, remove, pick from the directory", async () => {
  const { client } = setup();
  const hotel = "demo-wa-c6-hotel";
  const picked = await client.get<{ entities: { crm_id: string; entity_type: string }[] }>("/crm/entities", { query: { conversation_id: hotel, q: "müller" } });
  assert.deepEqual(picked.entities.map((e) => e.crm_id), ["demo-clients-10"]);
  const linked = await client.put<ChatCrmLinks>(`/conversations/${hotel}/crm-links`, { entity_type: "lead", crm_id: "demo-clients-10", linked: true });
  assert.deepEqual(linked.links.map((l) => [l.crm_id, l.source]), [["demo-clients-10", "manual"]]);
  assert.equal((await client.get<ChatCrmLinks>(`/conversations/${hotel}/crm-links`)).links.length, 1);
  assert.deepEqual((await client.put<ChatCrmLinks>(`/conversations/${hotel}/crm-links`, { entity_type: "lead", crm_id: "demo-clients-10", linked: false })).links, []);
  assert.equal((await rejection(client.put(`/conversations/${hotel}/crm-links`, { entity_type: "lead", crm_id: "unknown", linked: true }))).status, 404);
  assert.equal((await rejection(client.put(`/conversations/${hotel}/crm-links`, { entity_type: "x", crm_id: "a", linked: true }))).status, 400);
});

test("open by phone: registered numbers only; an existing chat is reopened, a new one is created and pinned", async () => {
  const { client } = setup();
  assert.deepEqual(await client.post<OpenCheckResponse>("/open/check", { phone: "421903555201" }), { status: "registered" });
  assert.deepEqual(await client.post<OpenCheckResponse>("/open/check", { phone: "+421 915 555 207" }), { status: "not_registered" });
  assert.deepEqual(await client.post<OpenCheckResponse>("/open/check", { phone: "999" }), { status: "not_registered" });

  assert.deepEqual(await client.post<OpenStartResponse>("/open/start", { phone: "421915555207", text: "Hi" }), { ok: false, code: "not_registered" });
  assert.deepEqual(await client.post<OpenStartResponse>("/open/start", { phone: "421905555205", text: " " }), { ok: false, code: "invalid" });
  assert.deepEqual(await client.post<OpenStartResponse>("/open/start", { phone: "+421 903 555 201", text: "Hello" }), { ok: true, conversation_id: C1 });

  const started = await client.post<OpenStartResponse>("/open/start", { phone: "421905555205", text: "Dobrý deň", lead_id: "demo-clients-10", project_id: "demo-projects-1" });
  assert.deepEqual(started, { ok: true, conversation_id: "demo-wa-new-421905555205" });
  const chat = await client.get<ConversationResponse>("/conversations/demo-wa-new-421905555205");
  assert.equal(chat.title, "Müller Architekten");
  assert.deepEqual(chat.crm_links.links.map((l) => l.crm_id).sort(), ["demo-clients-10", "demo-projects-1"]);
  const list = await client.get<ConversationsResponse>("/conversations");
  assert.equal(list.conversations.length, 5);
  assert.equal(list.conversations[0]!.id, "demo-wa-new-421905555205");
});

test("health and resync are calm no-ops", async () => {
  const { client } = setup();
  assert.deepEqual(await client.get("/wa/health"), { ok: true, worker_offline: false, disconnected: [], connecting: [] });
  assert.deepEqual(await client.post("/wa/resync"), { ok: true, synced: 0 });
  const preview = await client.get<{ title: string | null }>("/og-preview", { query: { url: "https://example.com" } });
  assert.equal(preview.title, null);
});

test("what has no demo answer is a calm error; admin routes are forbidden; nothing leaves the browser", async () => {
  const { client } = setup();
  const assist = await rejection(client.post("/chat/text-assist", { text: "x", action: "fix" }));
  assert.deepEqual([assist.status, assist.code, assist.message], [501, "not_implemented", "Not available in the demo."]);
  assert.equal((await rejection(client.get("/admin/members"))).code, "forbidden");
  assert.equal((await rejection(client.put("/admin/ai/provider", { provider: "x" }))).status, 403);
  assert.equal((await rejection(client.get("/something-else"))).code, "not_implemented");
  assert.equal((await rejection(client.get("/digest/audio"))).code, "not_implemented");

  // The router only answers its own prefix and never calls the real fetch.
  const realFetch = globalThis.fetch;
  let leaked = 0;
  globalThis.fetch = (async () => {
    leaked += 1;
    return new Response("{}");
  }) as typeof fetch;
  try {
    const { client: fresh } = setup();
    await fresh.get("/conversations");
    await fresh.post(`/conversations/${C1}/send`, { text: "x" });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(leaked, 0);
});

test("the messages the router words itself follow the language", async () => {
  const demo = createDemoWaai({ dataset: loadSk(), edition: "sk", directory, crmUserId: "u", now: () => FIXED_NOW, media, language: "hu" });
  const client = new WaaiClient({ base: DEMO_BASE, fetch: demo.fetch, fetchSsoToken: async () => "demo", isDemo: true });
  assert.equal((await rejection(client.post("/chat/text-assist", {}))).message, "A demóban nem érhető el.");
});

test("an aborted call throws AbortError like a real fetch", async () => {
  const { demo } = setup();
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(demo.fetch(`${DEMO_BASE}/meta`, { signal: abort.signal }), (e: unknown) => e instanceof DOMException && e.name === "AbortError");
});

test("a bad body is a 400 envelope and a foreign prefix a 404", async () => {
  const { demo } = setup();
  const bad = await demo.fetch(`${DEMO_BASE}/conversations/${C1}/send`, { method: "POST", body: "{not json" });
  assert.equal(bad.status, 400);
  assert.equal(((await bad.json()) as { error: { code: string; request_id: string } }).error.request_id, "demo");
  assert.equal((await demo.fetch("/waai-api/meta")).status, 404);
});

test("a day-0 message in the future is pulled back to five minutes ago in the chat list too", async () => {
  const { client } = setup(Date.parse("2026-07-15T06:00:00Z")); // 08:00 CEST; the newest message is dated 08:43
  const list = await client.get<ConversationsResponse>("/conversations");
  assert.equal(list.conversations[0]!.last_message_at, "2026-07-15T05:55:00.000Z");
});

test("Tasks tab: every task as a HomeTask, open first, filtered by status, ticking one moves it", async () => {
  const { client } = setup();
  const all = await client.get<TasksResponse>("/tasks");
  assert.equal(all.tasks.length, 9);
  assert.equal(all.crm_push_enabled, true);
  const statuses = all.tasks.map((t) => t.status);
  assert.deepEqual(statuses, [...statuses].sort((a, b) => (a === b ? 0 : a === "open" ? -1 : 1)), "open tasks come first");
  const first = all.tasks[0]!;
  assert.equal(first.origin, "waai");
  assert.equal(first.crm_url, `#tasks?task=${first.crm_task_id}`);
  assert.ok(first.conversation_title && first.conversation_id);

  const open = await client.get<TasksResponse>("/tasks", { query: { status: "open" } });
  const completed = await client.get<TasksResponse>("/tasks", { query: { status: "completed" } });
  assert.equal(open.tasks.length + completed.tasks.length, 9);
  assert.ok(open.tasks.every((t) => t.status === "open") && completed.tasks.every((t) => t.status === "completed"));

  await client.patch(`/tasks/${open.tasks[0]!.id}`, { status: "completed" });
  assert.equal((await client.get<TasksResponse>("/tasks", { query: { status: "open" } })).tasks.length, open.tasks.length - 1);

  // Deleting and reopening say why in the language of the module, not with a code.
  const done = completed.tasks[0]!;
  assert.equal((await rejection(client.del(`/tasks/${done.id}`))).message, "This task is synced with the CRM and cannot be changed that way in the demo.");
  assert.equal((await rejection(client.patch(`/tasks/${done.id}`, { status: "open" }))).status, 409);
  assert.equal(((await client.post(`/tasks/${done.id}/crm`, { action: "retry" })) as { ok: boolean }).ok, true);
  assert.equal((await rejection(client.post("/tasks/nope/crm", { action: "retry" }))).status, 404);
});

test("Digest: one bullet per summarized chat, the open tasks, no meetings and no audio", async () => {
  const { client } = setup();
  const digest = await client.post<DigestResponse>("/digest", { window: "d7", regenerate: false, lang: "en" });
  assert.equal(digest.window, "d7");
  assert.equal(digest.cached, true);
  assert.equal(digest.chat_count, 4);
  const bullets = digest.narrative.split("\n");
  assert.equal(bullets.length, 4);
  assert.ok(bullets.every((b) => b.startsWith("- **")), "a markdown list, the chat title in bold");
  assert.ok(digest.tasks.length > 0 && digest.tasks.every((t) => t.status === "open"));
  assert.deepEqual([digest.meetings, digest.has_audio, digest.audio_url, digest.auto_audio], [[], false, null, false]);
  // An odd window falls back; `regenerate` is accepted and changes nothing.
  assert.equal((await client.post<DigestResponse>("/digest", { window: "x", regenerate: true })).window, "d7");
});

test("Ask: citations for the words found, a calm sentence when nothing matches, an empty question is refused", async () => {
  const { client } = setup();
  const hit = await client.post<AskResponse>("/search", { q: "DOSKY", lang: "en" });
  assert.equal(hit.answer, "In the demo, Ask searches the demo chats. These messages match:");
  assert.ok(hit.sources.length >= 1 && hit.sources.length <= 5);
  assert.deepEqual(hit.sources.map((s) => s.index), hit.sources.map((_, i) => i + 1));
  assert.ok(hit.sources.every((s) => s.message_id.startsWith(s.conversation_id) && s.snippet.length > 0));
  const times = hit.sources.map((s) => s.sent_at);
  assert.deepEqual(times, [...times].sort().reverse(), "newest first");

  // Several words: the phrase need not be contiguous.
  const words = hit.sources[0]!.snippet.split(/\s+/).filter((w) => w.length > 3);
  const multi = await client.post<AskResponse>("/search", { q: `${words[words.length - 1]} ${words[0]}` });
  assert.ok(multi.sources.length >= 1);

  const none = await client.post<AskResponse>("/search", { q: "zzzzqqqq" });
  assert.deepEqual(none.sources, []);
  assert.equal(none.answer, "Nothing found in the demo chats. Try another word.");
  assert.equal((await rejection(client.post("/search", { q: "  " }))).status, 400);
});

test("Settings: preferences are kept in memory, quick reactions follow, the demo account is listed, changes are refused calmly", async () => {
  const { client } = setup();
  const prefs = await client.get<PreferencesResponse>("/preferences");
  assert.deepEqual([prefs.auto_detect_summary_lang, prefs.quick_reactions.length, prefs.quick_reaction_count], [true, 6, 6]);

  assert.equal((await client.put<PreferencesResponse>("/preferences", { auto_detect_summary_lang: false })).auto_detect_summary_lang, false);
  assert.equal((await client.get<PreferencesResponse>("/preferences")).auto_detect_summary_lang, false);
  assert.equal((await rejection(client.put("/preferences", { auto_detect_summary_lang: "yes" }))).status, 400);

  await client.put("/preferences/quick-reactions", { emojis: ["🔥", "👍"] });
  assert.deepEqual((await client.get<PreferencesResponse>("/preferences")).quick_reactions, ["🔥", "👍"]);
  assert.deepEqual((await client.get<ConversationResponse>(`/conversations/${C1}`)).quick_reactions, ["🔥", "👍"], "the chat uses them");
  assert.equal((await rejection(client.put("/preferences/quick-reactions", { emojis: [] }))).status, 400);
  assert.equal((await rejection(client.put("/preferences/quick-reactions", { emojis: ["1", "2", "3", "4", "5", "6", "7"] }))).status, 400);
  await client.del("/preferences/quick-reactions");
  assert.equal((await client.get<PreferencesResponse>("/preferences")).quick_reactions.length, 6);

  const { accounts } = await client.get<WaAccountsResponse>("/wa-accounts");
  assert.equal(accounts.length, 1);
  assert.deepEqual([accounts[0]!.id, accounts[0]!.status, accounts[0]!.display_name], ["demo-wa-account", "connected", "Andrej Kollár"]);
  assert.ok(accounts[0]!.phone_number);

  for (const call of [
    () => client.post("/wa-accounts"),
    () => client.post("/wa-accounts/demo-wa-account/disconnect"),
    () => client.del("/wa-accounts/demo-wa-account"),
    () => client.post("/reset-data"),
  ]) {
    const err = await rejection(call());
    assert.deepEqual([err.status, err.code, err.message], [501, "not_implemented", "Not available in the demo."]);
  }
});
