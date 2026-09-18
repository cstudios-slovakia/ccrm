import assert from "node:assert/strict";
import test from "node:test";
import { isOutgoingMail, mergeLeadTimeline, withTimelineEvent } from "./mailTimeline.ts";

test("the server's verdict wins over the CRM login", () => {
  // Logged in as alex@crm.com, mailbox is peter@company.sk.
  const sent = { is_outgoing: true, from: { address: "peter@company.sk" } };
  const received = { is_outgoing: false, from: { address: "alex@crm.com" } };
  assert.equal(isOutgoingMail(sent, "alex@crm.com"), true);
  assert.equal(isOutgoingMail(received, "alex@crm.com"), false);
});

test("an older backend without is_outgoing falls back to the login address", () => {
  assert.equal(isOutgoingMail({ from: { address: "Me@X.sk " } }, "me@x.sk"), true);
  assert.equal(isOutgoingMail({ from: { address: "them@y.sk" } }, "me@x.sk"), false);
  assert.equal(isOutgoingMail({ from: {} }, ""), false);
  assert.equal(isOutgoingMail(undefined, undefined), false);
});

const ev = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  timestamp: "2026-09-01 10:00",
  title: `t-${id}`,
  content: `c-${id}`,
  ...over,
});

test("a stored edit to a mail entry survives the live mailbox copy", () => {
  const stored = [ev("note-1"), ev("email-a", { timestamp: "2026-08-30 09:00", title: "fixed" })];
  const live = [ev("email-a", { seen: true }), ev("email-b")];
  const merged = mergeLeadTimeline(stored, live);
  assert.deepEqual(merged.map((e) => e.id), ["note-1", "email-a", "email-b"]);
  const a = merged.find((e) => e.id === "email-a")!;
  assert.equal(a.timestamp, "2026-08-30 09:00");
  assert.equal(a.title, "fixed");
  assert.equal((a as any).seen, true);
});

test("a hidden mail entry stays out even while the mailbox still lists it", () => {
  const stored = [ev("email-a", { hidden: true }), ev("email-c", { hidden: true })];
  const live = [ev("email-a")];
  assert.deepEqual(mergeLeadTimeline(stored, live), []);
});

test("withTimelineEvent patches in place, or appends an event it does not carry", () => {
  const tl = [ev("a"), ev("b")];
  assert.equal(withTimelineEvent(tl, ev("b"), { title: "x" })[1].title, "x");
  const appended = withTimelineEvent(tl, ev("email-z"), { hidden: true });
  assert.equal(appended.length, 3);
  assert.equal((appended[2] as any).hidden, true);
});
