import assert from "node:assert/strict";
import test from "node:test";
import {
  chatHref,
  linksForLead,
  linksForProject,
  normalizePhoneDigits,
  orderLinks,
  parseWhatsAppData,
  resolveWhatsAppState,
  sameWhatsAppData,
  startChatHref,
  type WhatsAppLink,
} from "./whatsappLinks.ts";

const link = (conversationRef: string, entityType: "lead" | "project", entityId: string, extra: Partial<WhatsAppLink> = {}): WhatsAppLink => ({
  conversationRef,
  entityType,
  entityId,
  source: "auto",
  title: conversationRef,
  isGroup: false,
  phone: null,
  ownerUserId: "u1",
  path: `/c/${conversationRef}`,
  lastMessageAt: null,
  ...extra,
});

const client = { id: "client-1", name: "Novák s.r.o.", adjustment: 1 };
const lead = { id: "lead-1", name: "Peter Novák", clientId: "client-1" };
const sibling = { id: "lead-2", name: "Eva Nováková", clientId: "client-1" };
const stranger = { id: "lead-3", name: "Iný" };
const leads = [client, lead, sibling, stranger];

test("phone numbers typed the way people type them become digits with the country code", () => {
  assert.equal(normalizePhoneDigits("0905 123 456", "Slovakia"), "421905123456");
  assert.equal(normalizePhoneDigits("+421 (0)905 123 456"), "421905123456");
  assert.equal(normalizePhoneDigits("00421905123456"), "421905123456");
  assert.equal(normalizePhoneDigits("06 30 123 4567", "Hungary"), "36301234567");
  assert.equal(normalizePhoneDigits("0905 123 456", "Czechia"), "420905123456");
});

test("a number that is too short, empty or missing is not a phone", () => {
  assert.equal(normalizePhoneDigits("12345"), null);
  assert.equal(normalizePhoneDigits("  "), null);
  assert.equal(normalizePhoneDigits(null), null);
  assert.equal(normalizePhoneDigits("call me"), null);
});

test("a lead sees its own chat, its client's chat and a sibling lead's chat, once each", () => {
  const links = [
    link("a", "lead", "lead-1"),
    link("b", "lead", "client-1"),
    link("c", "lead", "lead-2"),
    link("a", "lead", "client-1"),
    link("d", "lead", "lead-3"),
  ];
  assert.deepEqual(linksForLead("lead-1", links, leads).map((l) => l.conversationRef), ["a", "b", "c"]);
});

test("a lead without a client sees only its own chats", () => {
  const links = [link("a", "lead", "lead-3"), link("b", "lead", "client-1")];
  assert.deepEqual(linksForLead("lead-3", links, leads).map((l) => l.conversationRef), ["a"]);
});

test("a project sees its own chats, its client's, a contact attribute's and a chat on its contact phone", () => {
  const links = [
    link("own", "project", "p1"),
    link("client", "lead", "client-1"),
    link("contact", "lead", "lead-3"),
    link("phone", "lead", "lead-9", { phone: "421905555555" }),
    link("other-project", "project", "p2"),
    link("group", "lead", "lead-9", { phone: "421905555555", isGroup: true }),
  ];
  const project = { id: "p1", leadId: "lead-1", contactPhone: "0905 555 555" };
  assert.deepEqual(
    linksForProject(project, links, leads, ["lead-3"]).map((l) => l.conversationRef),
    ["own", "client", "contact", "phone"],
  );
});

test("a project with nothing paired and no contact phone has no chats", () => {
  assert.deepEqual(linksForProject({ id: "p1" }, [link("x", "lead", "lead-1")], leads), []);
});

test("the viewer's own chats come first, then the newest", () => {
  const ordered = orderLinks(
    [
      link("theirs-new", "lead", "x", { ownerUserId: "u2", lastMessageAt: "2026-10-29 10:00:00" }),
      link("mine-old", "lead", "x", { lastMessageAt: "2026-10-01 10:00:00" }),
      link("mine-new", "lead", "x", { lastMessageAt: "2026-10-20 10:00:00" }),
    ],
    "u1",
  );
  assert.deepEqual(ordered.map((l) => l.conversationRef), ["mine-new", "mine-old", "theirs-new"]);
});

test("a paired chat wins; otherwise a usable number offers to start one; a known non-WhatsApp number offers nothing", () => {
  const chat = [link("a", "lead", "lead-1")];
  assert.equal(resolveWhatsAppState(chat, null, null, []).state, "chat");
  assert.deepEqual(resolveWhatsAppState([], "0905 123 456", "Slovakia", []), { state: "start", phone: "421905123456" });
  assert.equal(resolveWhatsAppState([], "", null, []).state, "none");
  assert.equal(resolveWhatsAppState([], "12", null, []).state, "none");
  const numbers = [{ phone: "421905123456", status: "not_registered" as const, checkedAt: null }];
  assert.equal(resolveWhatsAppState([], "0905 123 456", "Slovakia", numbers).state, "none");
  const registered = [{ phone: "421905123456", status: "registered" as const, checkedAt: null }];
  assert.equal(resolveWhatsAppState([], "0905 123 456", "Slovakia", registered).state, "start");
});

test("hrefs: a chat keeps its message query, a start link carries the phone and the record", () => {
  assert.equal(chatHref("/c/abc?m=def"), "#whatsapp/c/abc?m=def");
  assert.equal(startChatHref("421905123456", { leadId: "lead-1" }), "#whatsapp/open?phone=421905123456&lead=lead-1");
  assert.equal(startChatHref("421905123456", { projectId: "p1", leadId: "lead-1" }), "#whatsapp/open?phone=421905123456&project=p1");
});

test("parsing drops malformed rows instead of throwing, and tells an unchanged poll apart", () => {
  const data = parseWhatsAppData(
    [{ conversationRef: "a", entityType: "lead", entityId: "l1", path: "/c/a", title: "Marek", isGroup: false, source: "manual" }, { entityType: "lead" }, null, { conversationRef: "b", entityType: "deal", entityId: "x", path: "/c/b" }],
    [{ phone: "421905", status: "registered", checkedAt: "2026-10-29 10:00:00" }, { phone: "1", status: "maybe" }],
  );
  assert.equal(data.links.length, 1);
  assert.equal(data.links[0].source, "manual");
  assert.equal(data.numbers.length, 1);
  assert.deepEqual(parseWhatsAppData(undefined, "nope"), { links: [], numbers: [] });
  assert.equal(sameWhatsAppData(data, parseWhatsAppData(
    [{ conversationRef: "a", entityType: "lead", entityId: "l1", path: "/c/a", title: "Marek", isGroup: false, source: "manual" }],
    [{ phone: "421905", status: "registered", checkedAt: "2026-10-29 10:00:00" }],
  )), true);
});
