import test from "node:test";
import assert from "node:assert/strict";
import { failedChecks, reviewChecklist, sendBlock, type ReviewInput } from "./reviewChecklist.ts";
import { formatDuration, minutesLeft, shouldPoll } from "./sendProgress.ts";

const ok: ReviewInput = { recipientCount: 10, audienceValid: true, subject: "Hi", senderConfigured: true, warnings: [] };
const warn = (code: string, level: "error" | "warning" = "error") => ({ level, code, message: { en: "", sk: "", hu: "" } });

test("a complete campaign passes every check", () => {
  assert.deepEqual(failedChecks(reviewChecklist(ok)), []);
  assert.equal(sendBlock(reviewChecklist(ok), true), null);
});

test("each missing piece fails its own check", () => {
  assert.deepEqual(failedChecks(reviewChecklist({ ...ok, recipientCount: 0 })), ["recipients"]);
  assert.deepEqual(failedChecks(reviewChecklist({ ...ok, recipientCount: null })), ["recipients"]);
  assert.deepEqual(failedChecks(reviewChecklist({ ...ok, audienceValid: false })), ["recipients"]);
  assert.deepEqual(failedChecks(reviewChecklist({ ...ok, subject: "   " })), ["subject"]);
  assert.deepEqual(failedChecks(reviewChecklist({ ...ok, senderConfigured: false })), ["sender"]);
});

test("a missing unsubscribe link fails only the unsubscribe check; other errors fail render", () => {
  assert.deepEqual(failedChecks(reviewChecklist({ ...ok, warnings: [warn("missing_unsubscribe")] })), ["unsubscribe"]);
  assert.deepEqual(failedChecks(reviewChecklist({ ...ok, warnings: [warn("dangerous_url")] })), ["render"]);
  assert.deepEqual(failedChecks(reviewChecklist({ ...ok, warnings: [warn("image_no_alt", "warning")] })), []);
});

test("the permission is reported before a failed check", () => {
  assert.equal(sendBlock(reviewChecklist({ ...ok, subject: "" }), false), "permission");
  assert.equal(sendBlock(reviewChecklist({ ...ok, subject: "" }), true), "subject");
});

test("time left comes from the queue and the hourly limit", () => {
  assert.equal(minutesLeft({ queued: 0 }, 400), null);
  assert.equal(minutesLeft({ queued: 200 }, 400), 30);
  assert.equal(minutesLeft({ queued: 1 }, 400), 1);
  assert.equal(minutesLeft({ queued: 10 }, 0), null);
});

test("durations read in minutes, then hours", () => {
  const t = (en: string) => en;
  assert.equal(formatDuration(12, t), "about 12 min");
  assert.equal(formatDuration(130, t), "about 2 h 10 min");
  assert.equal(formatDuration(120, t), "about 2 h");
});

test("polling needs a sending campaign and a visible tab", () => {
  assert.equal(shouldPoll("sending", "visible"), true);
  assert.equal(shouldPoll("sending", "hidden"), false);
  assert.equal(shouldPoll("paused", "visible"), false);
});
