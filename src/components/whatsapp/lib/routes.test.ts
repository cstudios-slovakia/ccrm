import assert from "node:assert/strict";
import test from "node:test";
import { crmHashForRecord, routeForTab, tabFromRoute, unreadLabel, WA_TABS } from "./routes.ts";

test("every address that exists today opens the tab it belongs to", () => {
  const cases: [string, string][] = [
    ["whatsapp", "chats"],
    ["whatsapp/c/ckx8abc", "chats"],
    ["whatsapp/u/usr_1", "chats"],
    ["whatsapp/u/usr_1/c/ckx8abc", "chats"],
    ["whatsapp/open", "chats"],
    ["whatsapp/digest", "digest"],
    ["whatsapp/tasks", "tasks"],
    ["whatsapp/search", "ask"],
    ["whatsapp/settings", "settings"],
    ["whatsapp/settings/ai", "settings"],
    ["WhatsApp/Digest", "digest"],
  ];
  for (const [route, tab] of cases) assert.equal(tabFromRoute(route), tab, route);
});

test("an unknown section falls back to the chat list", () => {
  assert.equal(tabFromRoute("whatsapp/nope"), "chats");
  assert.equal(tabFromRoute(""), "chats");
});

test("a tab opens an address that leads back to the same tab", () => {
  for (const tab of WA_TABS) assert.equal(tabFromRoute(routeForTab(tab)), tab, tab);
  assert.equal(routeForTab("chats"), "whatsapp");
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
