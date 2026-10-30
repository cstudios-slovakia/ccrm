import assert from "node:assert/strict";
import test from "node:test";
import { settingsRoute, settingsSection, visibleSections } from "./settingsRoute.ts";

test("a settings address opens its section, and a bare or unknown one opens none", () => {
  assert.equal(settingsSection("whatsapp/settings"), null);
  assert.equal(settingsSection("whatsapp/settings/ai"), "ai");
  assert.equal(settingsSection("WhatsApp/Settings/CRM"), "crm");
  assert.equal(settingsSection("whatsapp/settings/nope"), null);
});

test("the ids from before the WAAI layout open the section that now holds them", () => {
  assert.equal(settingsSection("whatsapp/settings/accounts"), "whatsapp");
  assert.equal(settingsSection("whatsapp/settings/invites"), "whatsapp");
  assert.equal(settingsSection("whatsapp/settings/members"), "whatsapp");
  assert.equal(settingsSection("whatsapp/settings/reactions"), "system");
  assert.equal(settingsSection("whatsapp/settings/language"), "system");
  assert.equal(settingsSection("whatsapp/settings/people"), "crm");
  assert.equal(settingsSection("whatsapp/settings/reset"), "account");
});

test("each section has an address that opens it again", () => {
  for (const id of visibleSections(true)) assert.equal(settingsSection(settingsRoute(id)), id);
  assert.equal(settingsRoute(null), "whatsapp/settings");
});

test("a member does not see the AI and CRM sections", () => {
  assert.deepEqual(visibleSections(false), ["system", "whatsapp", "account"]);
  assert.deepEqual(visibleSections(true), ["system", "whatsapp", "ai", "crm", "account"]);
});
