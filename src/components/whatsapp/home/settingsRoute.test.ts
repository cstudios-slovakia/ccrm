import assert from "node:assert/strict";
import test from "node:test";
import { settingsRoute, settingsSection } from "./settingsRoute.ts";

test("a settings address opens its section, and a bare one opens accounts", () => {
  assert.equal(settingsSection("whatsapp/settings"), "accounts");
  assert.equal(settingsSection("whatsapp/settings/ai"), "ai");
  assert.equal(settingsSection("whatsapp/settings/people"), "people");
  assert.equal(settingsSection("WhatsApp/Settings/CRM"), "crm");
  assert.equal(settingsSection("whatsapp/settings/nope"), "accounts");
});

test("each section has an address that opens it again", () => {
  assert.equal(settingsSection(settingsRoute("invites")), "invites");
  assert.equal(settingsRoute("accounts"), "whatsapp/settings");
});
