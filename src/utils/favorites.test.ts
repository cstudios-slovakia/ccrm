import { test } from "node:test";
import assert from "node:assert/strict";
import { isColorDark, getFavoriteTypeLabel, DEFAULT_ENTITY_COLORS } from "./favorites.ts";

test("isColorDark calculates luminance accurately", () => {
  // Dark colors
  assert.equal(isColorDark("#000000"), true);
  assert.equal(isColorDark("#1e293b"), true);
  assert.equal(isColorDark("#3b82f6"), true); // Standard blue
  assert.equal(isColorDark("#6366f1"), true); // Indigo
  assert.equal(isColorDark("#10b981"), true); // Emerald

  // Light colors
  assert.equal(isColorDark("#ffffff"), false);
  assert.equal(isColorDark("#f8fafc"), false);
  assert.equal(isColorDark("#fef08a"), false); // Light yellow
  assert.equal(isColorDark("#e2e8f0"), false); // Slate 200

  // Shorthand hex
  assert.equal(isColorDark("#000"), true);
  assert.equal(isColorDark("#fff"), false);

  // Invalid/empty values
  assert.equal(isColorDark(""), false);
  assert.equal(isColorDark(undefined), false);
  assert.equal(isColorDark("invalid"), false);
});

test("getFavoriteTypeLabel returns appropriate localized strings", () => {
  // English
  assert.equal(getFavoriteTypeLabel("project", "en"), "Project");
  assert.equal(getFavoriteTypeLabel("client", "en"), "Client");
  assert.equal(getFavoriteTypeLabel("lead", "en"), "Lead");
  assert.equal(getFavoriteTypeLabel("entry", "en"), "Entity");

  // Slovak
  assert.equal(getFavoriteTypeLabel("project", "sk"), "Projekt");
  assert.equal(getFavoriteTypeLabel("client", "sk"), "Klient");
  assert.equal(getFavoriteTypeLabel("lead", "sk"), "Lead");
  assert.equal(getFavoriteTypeLabel("entry", "sk"), "Entita");

  // Hungarian
  assert.equal(getFavoriteTypeLabel("project", "hu"), "Projekt");
  assert.equal(getFavoriteTypeLabel("client", "hu"), "Ügyfél");
  assert.equal(getFavoriteTypeLabel("lead", "hu"), "Érdeklődő");
  assert.equal(getFavoriteTypeLabel("entry", "hu"), "Entitás");
});

test("DEFAULT_ENTITY_COLORS defines valid color presets for each entity type", () => {
  assert.ok(DEFAULT_ENTITY_COLORS.project.startsWith("#"));
  assert.ok(DEFAULT_ENTITY_COLORS.client.startsWith("#"));
  assert.ok(DEFAULT_ENTITY_COLORS.lead.startsWith("#"));
  assert.ok(DEFAULT_ENTITY_COLORS.entry.startsWith("#"));
});
