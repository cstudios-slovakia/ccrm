import assert from "node:assert/strict";
import test from "node:test";
import {
  crmHashForRecord,
  embedFrameUrl,
  embedOrigin,
  parseWaaiMessage,
  routeFromWaaiPath,
  safeWaaiPath,
  unreadLabel,
  waaiPathFromRoute,
} from "./waaiEmbed.ts";

test("safeWaaiPath allows only the pages WAAI may be sent to", () => {
  for (const ok of ["/", "/digest", "/tasks", "/search", "/settings", "/c/ckx8abc", "/c/ckx8abc?m=ckm2_9", "/open?phone=421905123456", "/open?phone=421905123456&lead=client-12", "/open?phone=421905123456&project=project-9"]) {
    assert.equal(safeWaaiPath(ok), ok);
  }
  for (const bad of ["", "//evil.example", "https://evil.example", "javascript:alert(1)", "/api/auth/signout", "/settings/crm", "/c/", "/c/a/b", "/c/ok?x=1", "/open?phone=12", "/open?phone=421905123456&other=1", "/u/someone", "\\evil", "/c/" + "a".repeat(65), 42, null, undefined]) {
    assert.equal(safeWaaiPath(bad), null, String(bad));
  }
});

test("a CRM address becomes a WAAI path and back", () => {
  assert.equal(waaiPathFromRoute("whatsapp", new URLSearchParams()), "/");
  assert.equal(waaiPathFromRoute("whatsapp/c/abc", new URLSearchParams("m=xyz")), "/c/abc?m=xyz");
  assert.equal(waaiPathFromRoute("whatsapp/open", new URLSearchParams("phone=421905123456&lead=client-1")), "/open?phone=421905123456&lead=client-1");
  assert.equal(waaiPathFromRoute("whatsapp/digest", new URLSearchParams()), "/digest");
  assert.equal(waaiPathFromRoute("whatsapp/../x", new URLSearchParams()), "/");
  assert.equal(waaiPathFromRoute("whatsapp/c/abc", new URLSearchParams("evil=1")), "/");

  assert.equal(routeFromWaaiPath("/"), "whatsapp");
  assert.equal(routeFromWaaiPath("/c/abc?m=xyz"), "whatsapp/c/abc?m=xyz");
  assert.equal(routeFromWaaiPath("/tasks"), "whatsapp/tasks");
  assert.equal(routeFromWaaiPath("/not/allowed"), null);
});

test("the frame address carries a checked next path", () => {
  assert.equal(embedFrameUrl("https://wa.example.sk/", "/c/abc"), "https://wa.example.sk/embed/sso?next=%2Fc%2Fabc");
  assert.equal(embedFrameUrl("https://wa.example.sk", "//evil.example"), "https://wa.example.sk/embed/sso?next=%2F");
});

test("embedOrigin reduces an address to its origin", () => {
  assert.equal(embedOrigin("https://wa.example.sk/some/path"), "https://wa.example.sk");
  assert.equal(embedOrigin("http://localhost:3000"), "http://localhost:3000");
  assert.equal(embedOrigin("javascript:alert(1)"), null);
  assert.equal(embedOrigin("wa.example.sk"), null);
  assert.equal(embedOrigin(null), null);
});

test("parseWaaiMessage believes only well-formed messages of ours", () => {
  assert.deepEqual(parseWaaiMessage({ type: "waai:ready", authed: true, userCrmId: "user-1" }), { type: "waai:ready", authed: true, userCrmId: "user-1" });
  assert.deepEqual(parseWaaiMessage({ type: "waai:ready" }), { type: "waai:ready", authed: false, userCrmId: null });
  assert.deepEqual(parseWaaiMessage({ type: "waai:route", path: "/c/abc", title: "Marek" }), { type: "waai:route", path: "/c/abc", title: "Marek" });
  assert.equal(parseWaaiMessage({ type: "waai:route", path: "/evil" }), null);
  assert.deepEqual(parseWaaiMessage({ type: "waai:unread", chats: 3 }), { type: "waai:unread", chats: 3 });
  assert.equal(parseWaaiMessage({ type: "waai:unread", chats: -1 }), null);
  assert.equal(parseWaaiMessage({ type: "waai:unread", chats: "3" }), null);
  assert.deepEqual(parseWaaiMessage({ type: "waai:open-crm", kind: "lead", id: "client-12" }), { type: "waai:open-crm", kind: "lead", id: "client-12" });
  assert.equal(parseWaaiMessage({ type: "waai:open-crm", kind: "invoice", id: "x" }), null);
  assert.equal(parseWaaiMessage({ type: "waai:open-crm", kind: "lead", id: "a b" }), null);
  assert.deepEqual(parseWaaiMessage({ type: "waai:error", code: "not_linked" }), { type: "waai:error", code: "not_linked" });
  assert.equal(parseWaaiMessage({ type: "waai:error", code: "<script>" }), null);
  assert.equal(parseWaaiMessage({ type: "something:else" }), null);
  assert.equal(parseWaaiMessage("waai:ready"), null);
  assert.equal(parseWaaiMessage(null), null);
});

test("an Open in CRM request lands on the right record", () => {
  const leads = [
    { id: "client-12", name: "Novák & syn" },
    { id: "lead-7", name: "Kováč" },
    { id: "lead-8", name: "Tóth", adjustment: 1200 },
  ];
  const find = (id: string) => leads.find((l) => l.id === id);
  assert.equal(crmHashForRecord("lead", "client-12", find), "client-Nov%C3%A1k%20%26%20syn");
  assert.equal(crmHashForRecord("lead", "lead-7", find), "lead-lead-7");
  assert.equal(crmHashForRecord("lead", "lead-8", find), "client-T%C3%B3th");
  assert.equal(crmHashForRecord("lead", "lead-gone", find), "lead-lead-gone");
  assert.equal(crmHashForRecord("project", "project-9", find), "projects/project-9");
  assert.equal(crmHashForRecord("task", "tsk_ab12", find), "tasks?task=tsk_ab12");
});

test("unreadLabel", () => {
  assert.equal(unreadLabel(0), "");
  assert.equal(unreadLabel(7), "7");
  assert.equal(unreadLabel(100), "99+");
});
