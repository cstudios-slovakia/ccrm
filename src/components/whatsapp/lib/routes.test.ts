import assert from "node:assert/strict";
import test from "node:test";
import { routeForTab, tabFromRoute, WA_TABS } from "./routes.ts";

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
