import assert from "node:assert/strict";
import test from "node:test";
import type { MessageDto, QuotedMessage, ReactionGroup } from "../../api/contract.ts";
import { EDIT_WINDOW_MS } from "../../api/contract.ts";
import {
  buildLocalMessage,
  copyableText,
  isEditable,
  isLocalId,
  kindFromMime,
  LOCAL_PREFIX,
  nextReaction,
  ownReaction,
  patchMessage,
  settleLocal,
  toQuote,
  withOwnReaction,
  without,
} from "./optimistic.ts";

const sampleMsg = (overrides: Partial<MessageDto> = {}): MessageDto => ({
  id: "msg-123",
  conversation_id: "conv-1",
  kind: "text",
  direction: "out",
  sender: null,
  sender_avatar_url: null,
  body: "Hello world",
  translation_note: null,
  media: null,
  transcription: null,
  transcription_status: null,
  sent_at: new Date().toISOString(),
  edited_at: null,
  quoted: null,
  task_update_id: null,
  reactions: [],
  ...overrides,
});

test("isLocalId identifies local- prefixed ids", () => {
  assert.equal(isLocalId(`${LOCAL_PREFIX}abc-123`), true);
  assert.equal(isLocalId("msg-123"), false);
  assert.equal(isLocalId(""), false);
});

test("kindFromMime maps mimes to message kinds", () => {
  assert.equal(kindFromMime("audio/webm", true), "audio");
  assert.equal(kindFromMime("image/png", false), "image");
  assert.equal(kindFromMime("image/jpeg", false), "image");
  assert.equal(kindFromMime("video/mp4", false), "video");
  assert.equal(kindFromMime("audio/ogg", false), "audio");
  assert.equal(kindFromMime("application/pdf", false), "document");
  assert.equal(kindFromMime("application/zip", false), "document");
});

test("buildLocalMessage creates an optimistic message dto", () => {
  const quote: QuotedMessage = {
    id: "q-1",
    kind: "text",
    body: "Original",
    transcription: null,
    sender: "Alice",
    direction: "in",
  };
  const now = new Date("2026-10-30T10:00:00Z");

  const msg = buildLocalMessage({
    id: "local-456",
    conversationId: "conv-1",
    text: "Here is the photo",
    file: { name: "pic.jpg", type: "image/jpeg" },
    asVoice: false,
    quoted: quote,
    draftText: null,
    previewUrl: "blob:preview-123",
    now,
  });

  assert.equal(msg.id, "local-456");
  assert.equal(msg.conversation_id, "conv-1");
  assert.equal(msg.kind, "image");
  assert.equal(msg.direction, "out");
  assert.equal(msg.body, "Here is the photo");
  assert.equal(msg.media?.url, "blob:preview-123");
  assert.equal(msg.media?.mime_type, "image/jpeg");
  assert.equal(msg.quoted?.id, "q-1");
  assert.equal(msg.sent_at, now.toISOString());
});

test("toQuote strips message down to quote preview", () => {
  const m = sampleMsg({ id: "msg-99", body: "Important note", transcription: null, sender: "Bob", direction: "in" });
  const quote = toQuote(m);
  assert.deepEqual(quote, {
    id: "msg-99",
    kind: "text",
    body: "Important note",
    transcription: null,
    sender: "Bob",
    direction: "in",
  });
});

test("settleLocal replaces local bubble and preserves quote if server dropped it", () => {
  const quote: QuotedMessage = { id: "q-1", kind: "text", body: "Quoted", transcription: null, sender: null, direction: "in" };
  const local = sampleMsg({ id: "local-1", quoted: quote });
  const server = sampleMsg({ id: "server-real-id", quoted: null });

  const list = [local];
  const settled = settleLocal(list, "local-1", server);

  assert.equal(settled.length, 1);
  assert.equal(settled[0]!.id, "server-real-id");
  assert.equal(settled[0]!.quoted?.id, "q-1"); // quote preserved!
});

test("without and patchMessage manipulate list safely", () => {
  const m1 = sampleMsg({ id: "m1", body: "First" });
  const m2 = sampleMsg({ id: "m2", body: "Second" });

  const filtered = without([m1, m2], "m1");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]!.id, "m2");

  const patched = patchMessage([m1, m2], "m2", { body: "Updated" });
  assert.equal(patched[1]!.body, "Updated");
});

test("ownReaction, withOwnReaction and nextReaction follow single reaction per user rule", () => {
  const emptyGroups: ReactionGroup[] = [];
  assert.equal(ownReaction(emptyGroups), null);

  // Add initial reaction
  const withThumbs = withOwnReaction(emptyGroups, "👍");
  assert.equal(ownReaction(withThumbs), "👍");
  assert.equal(withThumbs[0]?.count, 1);
  assert.equal(withThumbs[0]?.mine, true);

  // Switch to heart
  const withHeart = withOwnReaction(withThumbs, "❤️");
  assert.equal(ownReaction(withHeart), "❤️");
  assert.equal(withHeart.find((g) => g.emoji === "👍"), undefined); // previous reaction removed
  assert.equal(withHeart.find((g) => g.emoji === "❤️")?.count, 1);

  // Remove reaction
  const withoutReaction = withOwnReaction(withHeart, null);
  assert.equal(ownReaction(withoutReaction), null);
  assert.equal(withoutReaction.length, 0);

  // nextReaction toggles: clicking current emoji removes it
  assert.equal(nextReaction(withHeart, "❤️"), null);
  assert.equal(nextReaction(withHeart, "👍"), "👍");
});

test("isEditable permits editing own messages within the 15-minute window", () => {
  const now = 1730000000000;
  const recentTime = new Date(now - 5 * 60 * 1000).toISOString(); // 5 min ago
  const oldTime = new Date(now - (EDIT_WINDOW_MS + 1000)).toISOString(); // 15 min 1 sec ago

  // incoming cannot be edited
  assert.equal(isEditable(sampleMsg({ direction: "in", sent_at: recentTime }), now), false);

  // local unsent cannot be edited
  assert.equal(isEditable(sampleMsg({ id: "local-123", sent_at: recentTime }), now), false);

  // task updates cannot be edited
  assert.equal(isEditable(sampleMsg({ task_update_id: "tu-1", sent_at: recentTime }), now), false);

  // expired messages cannot be edited
  assert.equal(isEditable(sampleMsg({ sent_at: oldTime }), now), false);

  // recent text message can be edited
  assert.equal(isEditable(sampleMsg({ kind: "text", sent_at: recentTime }), now), true);

  // recent image with caption can be edited
  assert.equal(isEditable(sampleMsg({ kind: "image", body: "Check this out", sent_at: recentTime }), now), true);

  // recent image without caption cannot be edited
  assert.equal(isEditable(sampleMsg({ kind: "image", body: "", sent_at: recentTime }), now), false);

  // document whose body is merely the file name cannot be edited
  assert.equal(
    isEditable(
      sampleMsg({
        kind: "document",
        body: "invoice.pdf",
        media: { url: "", mime_type: "application/pdf", file_name: "invoice.pdf" },
        sent_at: recentTime,
      }),
      now,
    ),
    false,
  );

  // document with user caption can be edited
  assert.equal(
    isEditable(
      sampleMsg({
        kind: "document",
        body: "Final signed version",
        media: { url: "", mime_type: "application/pdf", file_name: "invoice.pdf" },
        sent_at: recentTime,
      }),
      now,
    ),
    true,
  );
});

test("copyableText returns body or transcription", () => {
  assert.equal(copyableText({ body: "  Some text  ", transcription: null }), "Some text");
  assert.equal(copyableText({ body: null, transcription: "  Audio transcript  " }), "Audio transcript");
  assert.equal(copyableText({ body: null, transcription: null }), "");
});
