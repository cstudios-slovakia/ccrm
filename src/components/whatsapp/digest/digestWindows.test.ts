import assert from "node:assert/strict";
import test from "node:test";
import {
  chatSummaryWindows,
  defaultChatSummaryWindow,
  defaultDigestWindow,
  digestWindowsWithActivity,
  formatMeetingWhen,
  newestMessageAt,
} from "./digestWindows.ts";

const NOW = new Date("2026-10-30T12:00:00Z");

test("only the windows that hold activity are offered, and the page opens on the narrowest", () => {
  assert.deepEqual(digestWindowsWithActivity("2026-10-30T08:00:00Z", NOW), ["today", "d3", "d7", "d30"]);
  assert.deepEqual(digestWindowsWithActivity("2026-10-29T08:00:00Z", NOW), ["d3", "d7", "d30"]);
  assert.deepEqual(digestWindowsWithActivity("2026-10-20T08:00:00Z", NOW), ["d30"]);
  assert.equal(defaultDigestWindow("2026-10-30T08:00:00Z", NOW), "today");
  assert.equal(defaultDigestWindow("2026-10-26T08:00:00Z", NOW), "d7");
});

test("no activity in 30 days, or no chats at all, leaves the widest window", () => {
  assert.deepEqual(digestWindowsWithActivity("2026-01-01T00:00:00Z", NOW), ["d30"]);
  assert.deepEqual(digestWindowsWithActivity(null, NOW), ["d30"]);
});

test("the newest message is taken across the chat list", () => {
  assert.equal(newestMessageAt([]), null);
  assert.equal(
    newestMessageAt([{ last_message_at: "2026-10-01T00:00:00Z" }, { last_message_at: null }, { last_message_at: "2026-10-05T00:00:00Z" }]),
    "2026-10-05T00:00:00Z",
  );
});

test("a relative day-word in a meeting is pinned to the day the message was sent", () => {
  assert.equal(formatMeetingWhen("dnes do 9:00", "sk", "2026-06-07"), "Nedeľa, 7. júna do 9:00");
  assert.equal(formatMeetingWhen("zajtra 14:00", "sk", "2026-06-07").startsWith("Pondelok"), true);
  assert.equal(formatMeetingWhen("tomorrow 2pm", "en", null), "tomorrow 2pm");
  assert.equal(formatMeetingWhen("2026-06-08T10:00:00Z", "en", null).startsWith("Monday"), true);
});

test("a chat's AI view lists the windows with its messages, an older one for a quiet chat, and custom last", () => {
  assert.deepEqual(chatSummaryWindows("2026-10-29T08:00:00Z", NOW), ["d3", "d7", "d30", "custom"]);
  assert.deepEqual(chatSummaryWindows("2026-01-01T00:00:00Z", NOW), ["recent", "custom"]);
  assert.deepEqual(chatSummaryWindows(null, NOW), ["recent", "custom"]);
  assert.equal(defaultChatSummaryWindow("2026-10-30T09:00:00Z", NOW), "today");
  assert.equal(defaultChatSummaryWindow(undefined, NOW), "recent");
});
