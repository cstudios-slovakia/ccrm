import assert from "node:assert/strict";
import test from "node:test";
import {
  clearLegacyStartMenuLayout,
  normalizeStartMenuLayout,
  readLegacyStartMenuLayout,
  type StartMenuLayout,
} from "./startMenuLayout.ts";

const LAYOUT: StartMenuLayout = {
  groups: [{ id: "operations", name: "Operatíva", iconName: "Briefcase", color: "text-indigo-600 " }],
  groupItems: { operations: ["projects", "leads"] },
  unused: ["social_media"],
};

/* --------------------------------------------------------------- normalise */

test("a never-customised launcher is null, not an empty layout", () => {
  // null is what makes the component fall back to the built-in groups in the
  // interface language, rather than rendering a launcher with no columns.
  assert.equal(normalizeStartMenuLayout(null), null);
  assert.equal(normalizeStartMenuLayout(undefined), null);
  assert.equal(normalizeStartMenuLayout({}), null);
  assert.equal(normalizeStartMenuLayout({ groups: [], groupItems: {}, unused: [] }), null);
  assert.equal(normalizeStartMenuLayout("groups"), null);
  assert.equal(normalizeStartMenuLayout([LAYOUT]), null);
});

test("a stored layout round-trips unchanged", () => {
  assert.deepEqual(normalizeStartMenuLayout(LAYOUT), LAYOUT);
});

test("half a layout is still a layout", () => {
  // Hiding a tile without ever renaming a group stores no groups at all.
  assert.deepEqual(normalizeStartMenuLayout({ unused: ["email"] }), {
    groups: [],
    groupItems: {},
    unused: ["email"],
  });
});

test("junk is dropped rather than carried into the render", () => {
  const normalized = normalizeStartMenuLayout({
    groups: [
      { id: "ok", name: "Fine", isCustom: true },
      { id: "", name: "No id" },
      { name: "Missing id" },
      "operations",
      null,
      { id: "named-after-itself" },
      { id: "typed", name: 7, iconName: 3, color: null, isCustom: "yes" },
    ],
    groupItems: { ok: ["projects", 42, null, ""], empty: [], bogus: "projects" },
    unused: ["email", 7, undefined],
  });

  assert.deepEqual(normalized, {
    groups: [
      { id: "ok", name: "Fine", isCustom: true },
      { id: "named-after-itself", name: "named-after-itself" },
      { id: "typed", name: "typed" },
    ],
    groupItems: { ok: ["projects"] },
    unused: ["email"],
  });
});

/* --------------------------------------------------------------- migration */

/** Minimal Storage stand-in: node has no localStorage unless asked for one. */
function installStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  (globalThis as any).localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
  };
  return store;
}

test("the legacy per-browser layout is read from the signed-in user's key", () => {
  installStorage({ "ccrm_start_menu_groups_v2_user-erik": JSON.stringify(LAYOUT) });
  assert.deepEqual(readLegacyStartMenuLayout("user-erik"), LAYOUT);
  // Another account's copy is not this account's layout.
  assert.equal(readLegacyStartMenuLayout("user-maria"), null);
});

test("a user without a server id falls back to the key the menu wrote", () => {
  installStorage({ "ccrm_start_menu_groups_v2_guest": JSON.stringify(LAYOUT) });
  assert.deepEqual(readLegacyStartMenuLayout(undefined), LAYOUT);
});

test("nothing stored, or unreadable, means nothing to adopt", () => {
  installStorage({ "ccrm_start_menu_groups_v2_user-erik": "{not json" });
  assert.equal(readLegacyStartMenuLayout("user-erik"), null);
  installStorage();
  assert.equal(readLegacyStartMenuLayout("user-erik"), null);
});

test("clearing drops this user's key and the anonymous one, not a colleague's", () => {
  const store = installStorage({
    "ccrm_start_menu_groups_v2_user-erik": "{}",
    "ccrm_start_menu_groups_v2_guest": "{}",
    "ccrm_start_menu_groups_v2_user-maria": "{}",
  });
  clearLegacyStartMenuLayout("user-erik");
  assert.deepEqual([...store.keys()], ["ccrm_start_menu_groups_v2_user-maria"]);
});

test("a browser that refuses storage does not take the app down with it", () => {
  // iOS Safari with "Block All Cookies" throws on a plain read.
  (globalThis as any).localStorage = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
  };
  assert.equal(readLegacyStartMenuLayout("user-erik"), null);
  assert.doesNotThrow(() => clearLegacyStartMenuLayout("user-erik"));
  delete (globalThis as any).localStorage;
});
