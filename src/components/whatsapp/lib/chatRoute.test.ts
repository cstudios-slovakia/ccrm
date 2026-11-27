import assert from "node:assert/strict";
import test from "node:test";
import { parseWhatsAppRoute, whatsAppHash, whatsAppRouteTarget, type WhatsAppRoute } from "./chatRoute.ts";

const q = (s: string) => new URLSearchParams(s);
const home = { view: "chats", userId: null, conversationId: null, messageId: null } as const;

test("a bare #whatsapp is the chat list", () => {
  assert.deepEqual(parseWhatsAppRoute("whatsapp"), home);
  assert.deepEqual(parseWhatsAppRoute("whatsapp/"), home);
});

test("chip and task-footer addresses keep working", () => {
  assert.deepEqual(parseWhatsAppRoute("whatsapp/c/cm9abc"), { ...home, conversationId: "cm9abc" });
  assert.deepEqual(parseWhatsAppRoute("whatsapp/c/cm9abc", q("m=msg_1")), {
    ...home,
    conversationId: "cm9abc",
    messageId: "msg_1",
  });
});

test("an admin's view of a member's chats", () => {
  assert.deepEqual(parseWhatsAppRoute("whatsapp/u/user1"), { ...home, userId: "user1" });
  assert.deepEqual(parseWhatsAppRoute("whatsapp/u/user1/c/c2", q("m=m9")), {
    view: "chats",
    userId: "user1",
    conversationId: "c2",
    messageId: "m9",
  });
});

test("the tabs and settings sections", () => {
  for (const view of ["digest", "tasks", "search"] as const) {
    assert.deepEqual(parseWhatsAppRoute(`whatsapp/${view}`), { view });
  }
  assert.deepEqual(parseWhatsAppRoute("whatsapp/settings"), { view: "settings", section: null });
  assert.deepEqual(parseWhatsAppRoute("whatsapp/settings/ai"), { view: "settings", section: "ai" });
});

test("open by phone takes a lead or a project, never both", () => {
  assert.deepEqual(parseWhatsAppRoute("whatsapp/open", q("phone=421900123456&lead=lead-1")), {
    view: "open",
    phone: "421900123456",
    leadId: "lead-1",
    projectId: null,
  });
  assert.deepEqual(parseWhatsAppRoute("whatsapp/open", q("phone=421900123456&project=p1")), {
    view: "open",
    phone: "421900123456",
    leadId: null,
    projectId: "p1",
  });
  assert.deepEqual(parseWhatsAppRoute("whatsapp/open", q("phone=421900123456&lead=l&project=p")), {
    view: "open",
    phone: "421900123456",
    leadId: "l",
    projectId: null,
  });
});

test("anything malformed falls back to the chat list instead of reaching WAAI", () => {
  for (const [route, params] of [
    ["whatsapp/c/../../etc", ""],
    ["whatsapp/c/a b", ""],
    ["whatsapp/c/" + "x".repeat(65), ""],
    ["whatsapp/c/ok/extra", ""],
    ["whatsapp/u/", ""],
    ["whatsapp/nonsense", ""],
    ["whatsapp/open", "phone=12"],
    ["whatsapp/open", "phone=abc"],
    ["tasks", ""],
  ] as const) {
    assert.deepEqual(parseWhatsAppRoute(route, q(params)), home, `${route}?${params}`);
  }
  // A bad `m` only loses the deep link, not the chat.
  assert.deepEqual(parseWhatsAppRoute("whatsapp/c/c1", q("m=<script>")), { ...home, conversationId: "c1" });
  assert.deepEqual(parseWhatsAppRoute("whatsapp/settings/../x"), { view: "settings", section: null });
});

test("build and parse are inverse", () => {
  const routes: WhatsAppRoute[] = [
    home,
    { ...home, conversationId: "c1" },
    { ...home, conversationId: "c1", messageId: "m1" },
    { ...home, userId: "u1" },
    { view: "chats", userId: "u1", conversationId: "c1", messageId: "m1" },
    { view: "digest" },
    { view: "tasks" },
    { view: "search" },
    { view: "settings", section: null },
    { view: "settings", section: "crm-bridge" },
    { view: "open", phone: "421900123456", leadId: "l1", projectId: null },
    { view: "open", phone: "421900123456", leadId: null, projectId: "p1" },
  ];
  for (const r of routes) {
    const { route, query } = whatsAppRouteTarget(r);
    assert.deepEqual(parseWhatsAppRoute(route, q(query)), r, whatsAppHash(r));
  }
});

test("hashes are what the chips already use", () => {
  assert.equal(whatsAppHash({ ...home, conversationId: "c1", messageId: "m1" }), "#whatsapp/c/c1?m=m1");
  assert.equal(whatsAppHash(home), "#whatsapp");
  assert.equal(whatsAppHash({ view: "digest" }), "#whatsapp/digest");
});
