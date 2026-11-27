import assert from "node:assert/strict";
import test from "node:test";
import { FIXED_NOW, loadSk, media } from "./demoFixture.ts";
import { DemoStore, taskIdFor } from "./demoStore.ts";
import { NEWEST_AGE_MS } from "./demoTime.ts";

const build = (now = FIXED_NOW) => new DemoStore(loadSk(), media, () => now);

test("ids follow the WAAI loader contract: ref, <ref>-<message id>, demo-wa-task-<n>", () => {
  const store = build();
  assert.deepEqual([...store.chats.keys()], ["demo-wa-c1-site", "demo-wa-l10-architect", "demo-wa-c6-hotel", "demo-wa-c2-warranty"]);
  const c1 = store.chat("demo-wa-c1-site")!;
  assert.equal(c1.messages[0]!.id, "demo-wa-c1-site-m01");
  assert.equal(c1.messages.find((m) => m.id === "demo-wa-c1-site-m09")!.quotedId, "demo-wa-c1-site-m08");
  assert.deepEqual(store.tasks.map((t) => t.id), [1, 2, 3, 4, 5, 6, 7, 8, 9].map(taskIdFor));
  assert.equal(store.task("demo-wa-task-3")!.crmTaskId, "demo-whatsapp-3");
  assert.equal(store.task("demo-wa-task-3")!.sourceMessageId, "demo-wa-c1-site-m13");
});

test("summary bullets name the task ids of their own chat, or null", () => {
  const items = build().chat("demo-wa-c1-site")!.summary.items;
  assert.deepEqual(items.map((i) => i.taskId), ["demo-wa-task-3", "demo-wa-task-2", "demo-wa-task-1", null, null]);
});

test("seeded instants come from the day offset and the zoned time", () => {
  const store = build();
  const m13 = store.chat("demo-wa-c1-site")!.messages.find((m) => m.id === "demo-wa-c1-site-m13")!;
  assert.equal(new Date(m13.sentAt).toISOString(), "2026-07-15T06:43:00.000Z"); // 08:43 CEST
  const m01 = store.chat("demo-wa-c1-site")!.messages[0]!;
  assert.equal(new Date(m01.sentAt).toISOString(), "2026-07-11T07:12:00.000Z");
});

test("a message whose time has not come yet pulls every message back: newest five minutes old, gaps kept", () => {
  const early = Date.parse("2026-07-15T06:00:00Z"); // 08:00 CEST, the newest message is at 08:43
  const shifted = build(early);
  const plain = build();
  const newest = (s: DemoStore) => Math.max(...s.list().flatMap((c) => c.messages.map((m) => m.sentAt)));
  assert.equal(newest(shifted), early - NEWEST_AGE_MS);
  const gap = (s: DemoStore) => s.chat("demo-wa-c1-site")!.messages[12]!.sentAt - s.chat("demo-wa-c1-site")!.messages[0]!.sentAt;
  assert.equal(gap(shifted), gap(plain));
  // Task dates are not shifted.
  assert.equal(shifted.task("demo-wa-task-5")!.dueAt, plain.task("demo-wa-task-5")!.dueAt);
});

test("task dates: stated time, date-only at noon, none", () => {
  const store = build();
  assert.equal(new Date(store.task("demo-wa-task-5")!.dueAt!).toISOString(), "2026-07-21T10:00:00.000Z"); // day 6, 12:00 CEST
  assert.equal(new Date(store.task("demo-wa-task-2")!.dueAt!).toISOString(), "2026-07-16T10:00:00.000Z"); // day 1, no time -> noon
  assert.equal(store.task("demo-wa-task-3")!.dueAt, null);
  assert.equal(store.task("demo-wa-task-3")!.startAt, null);
  assert.ok(store.task("demo-wa-task-5")!.startAt !== null);
  assert.ok(store.task("demo-wa-task-1")!.completedAt !== null);
  assert.equal(store.task("demo-wa-task-2")!.assignee, "Andrej Kollár");
});

test("chats list newest first and unread counts come from the dataset", () => {
  const store = build();
  assert.deepEqual(store.list().map((c) => c.id), ["demo-wa-c1-site", "demo-wa-c6-hotel", "demo-wa-c2-warranty", "demo-wa-l10-architect"]);
  assert.deepEqual(store.unread(), { chats: 2, messages: 4 });
  store.markRead("demo-wa-c1-site");
  assert.deepEqual(store.unread(), { chats: 1, messages: 2 });
});

test("sending appends an outgoing message after the newest one, strictly increasing", () => {
  const store = build();
  const before = store.chat("demo-wa-c1-site")!.messages.length;
  const a = store.addMessage("demo-wa-c1-site", { body: "one" });
  const b = store.addMessage("demo-wa-c1-site", { body: "two" });
  assert.equal(store.chat("demo-wa-c1-site")!.messages.length, before + 2);
  assert.equal(a.direction, "out");
  assert.ok(b.sentAt > a.sentAt);
  assert.notEqual(a.id, b.id);
});

test("one reaction per user: a new one replaces the old, null removes it", () => {
  const store = build();
  const id = "demo-wa-c1-site-m06";
  store.react(id, "👍");
  store.react(id, "❤️");
  assert.deepEqual(store.findMessage(id)!.message.reactions.filter((r) => r.mine).map((r) => r.emoji), ["❤️"]);
  store.react(id, null);
  assert.equal(store.findMessage(id)!.message.reactions.some((r) => r.mine), false);
  // The contact's own reaction is untouched.
  assert.equal(store.findMessage("demo-wa-c1-site-m05")!.message.reactions[0]!.name, "Marek Šimko");
});

test("ticking a task changes the completed list; links toggle; openChat is idempotent", () => {
  const store = build();
  assert.deepEqual(store.completedTaskIds().sort(), ["demo-wa-task-1", "demo-wa-task-4", "demo-wa-task-6", "demo-wa-task-8"]);
  store.setTaskStatus("demo-wa-task-3", "completed");
  assert.ok(store.completedTaskIds().includes("demo-wa-task-3"));

  store.setLink("demo-wa-c1-site", "lead", "demo-clients-10", true);
  assert.equal(store.chat("demo-wa-c1-site")!.links.find((l) => l.id === "demo-clients-10")!.source, "manual");
  store.setLink("demo-wa-c1-site", "lead", "demo-clients-10", false);
  assert.equal(store.chat("demo-wa-c1-site")!.links.some((l) => l.id === "demo-clients-10"), false);

  const a = store.openChat("+421 905 555 205", "Property manager");
  const b = store.openChat("421905555205", "Other");
  assert.equal(a, b);
  assert.equal(store.openChat("+421 903 555 201", "x").id, "demo-wa-c1-site");
});

test("media of a message comes from the media resolver", () => {
  const store = build();
  const c1 = store.chat("demo-wa-c1-site")!;
  assert.equal(c1.messages.find((m) => m.id.endsWith("m07"))!.media!.url, "https://demo.test/slabs.svg");
  const doc = c1.messages.find((m) => m.id.endsWith("m05"))!;
  assert.equal(doc.media!.fileName, "Harmonogram montáže – Horský park.pdf");
  assert.equal(doc.media!.mimeType, "application/pdf");
  const voice = store.chat("demo-wa-c6-hotel")!.messages.find((m) => m.kind === "audio")!;
  assert.equal(voice.media!.url, "https://demo.test/silence.wav");
  assert.ok(voice.transcription!.length > 0);
});
