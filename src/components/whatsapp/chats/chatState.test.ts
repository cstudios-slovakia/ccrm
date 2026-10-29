import assert from "node:assert/strict";
import test from "node:test";
import type { ChatListItem, MessageDto } from "../api/contract.ts";
import { filterChats, fold, mergeNewer, newestSentAt, oldestSentAt, prependOlder, previewLine } from "./chatState.ts";

const msg = (id: string, sent: string, body = id): MessageDto => ({
  id,
  conversation_id: "c1",
  kind: "text",
  direction: "in",
  sender: null,
  sender_avatar_url: null,
  body,
  translation_note: null,
  media: null,
  transcription: null,
  transcription_status: null,
  sent_at: `2026-10-29T${sent}:00.000Z`,
  edited_at: null,
  quoted: null,
  task_update_id: null,
  reactions: [],
});
const ids = (ms: MessageDto[]) => ms.map((m) => m.id).join(",");

test("a poll adds new messages at the end and keeps the order", () => {
  const out = mergeNewer([msg("a", "10:00"), msg("b", "10:01")], [msg("c", "10:02")]);
  assert.equal(ids(out), "a,b,c");
});

test("a message we already hold is replaced, not duplicated (edit, reaction)", () => {
  const out = mergeNewer([msg("a", "10:00", "old")], [msg("a", "10:00", "edited")]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.body, "edited");
});

test("an edited message older than the window that we do not hold is not added", () => {
  // The server also returns rows older than `after`; if we never loaded them they stay unloaded.
  const out = mergeNewer([msg("b", "10:05")], [msg("old", "09:00", "edited")]);
  assert.equal(ids(out), "b");
});

test("removed ids disappear, even when the same answer carries them", () => {
  const out = mergeNewer([msg("a", "10:00"), msg("b", "10:01")], [msg("b", "10:01")], ["a", "b"]);
  assert.equal(out.length, 0);
});

test("an older page goes above, without duplicates", () => {
  const out = prependOlder([msg("c", "10:02"), msg("d", "10:03")], [msg("a", "10:00"), msg("b", "10:01"), msg("c", "10:02", "again")]);
  assert.equal(ids(out), "a,b,c,d");
  assert.equal(out[2]!.body, "c");
});

test("equal timestamps order by id, so a page boundary is stable", () => {
  assert.equal(ids(prependOlder([msg("z", "10:00")], [msg("m", "10:00")])), "m,z");
});

test("cursors", () => {
  const list = [msg("a", "10:00"), msg("b", "10:05")];
  assert.equal(oldestSentAt(list), "2026-10-29T10:00:00.000Z");
  assert.equal(newestSentAt(list), "2026-10-29T10:05:00.000Z");
  assert.equal(newestSentAt([]), null);
  assert.equal(oldestSentAt([]), null);
});

const chat = (title: string, body: string | null): ChatListItem => ({
  id: title,
  title,
  is_group: false,
  owner_email: "p@x.sk",
  avatar_url: null,
  unread_count: 0,
  last_message_at: "2026-10-29T10:00:00.000Z",
  last_message: body === null ? null : { kind: "text", body, sender: null, direction: "in" },
});

test("search ignores case and accents and wants every word", () => {
  const chats = [chat("Eva Nováková", "stretnutie zajtra"), chat("Peter", "ahoj"), chat("Dodávateľ", null)];
  assert.equal(fold("Stretnútie"), "stretnutie");
  assert.deepEqual(filterChats(chats, "NOVAKOVA").map((c) => c.title), ["Eva Nováková"]);
  assert.deepEqual(filterChats(chats, "eva zajtra").map((c) => c.title), ["Eva Nováková"]);
  assert.deepEqual(filterChats(chats, "eva ahoj"), []);
  assert.equal(filterChats(chats, "  ").length, 3);
});

const labels = { you: "You", photo: "Photo", video: "Video", voice: "Voice message", document: "Document", sticker: "Sticker", attachment: "Attachment" };

test("the preview line names the sender where it matters", () => {
  assert.equal(previewLine(null, false, labels), "");
  assert.equal(previewLine({ kind: "text", body: "hi", sender: "Eva", direction: "in" }, false, labels), "hi");
  assert.equal(previewLine({ kind: "text", body: "hi", sender: "Eva", direction: "in" }, true, labels), "Eva: hi");
  assert.equal(previewLine({ kind: "text", body: "ok", sender: null, direction: "out" }, true, labels), "You: ok");
  assert.equal(previewLine({ kind: "audio", body: null, sender: "Eva", direction: "in" }, false, labels), "Voice message");
  assert.equal(previewLine({ kind: "image", body: "look", sender: null, direction: "out" }, false, labels), "You: look");
  assert.equal(previewLine({ kind: "image", body: null, sender: null, direction: "out" }, false, labels), "You: Photo");
  assert.equal(previewLine({ kind: "document", body: "Faktúra.pdf", sender: null, direction: "in" }, false, labels), "Faktúra.pdf");
});
