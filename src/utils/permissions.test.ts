import assert from "node:assert/strict";
import test from "node:test";
import type { RolePermission, UserProfile } from "../types";
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_DEFS,
  PERMISSION_SECTIONS,
  buildAccess,
  findRole,
  firstAllowedRoute,
  isSectionFullyDenied,
  isSectionFullyGranted,
  newRolePermissions,
  permissionKeyForRoute,
  resolvePermissionValue,
  resolveRolePermissions,
  withPermission,
  withSectionGranted,
} from "./permissions.ts";

const user = (role: string): UserProfile => ({ name: "U", email: "u@example.com", role, color: "#000" });

const legacyPm: RolePermission = {
  name: "Project Manager",
  permissions: {
    general_config: "nothing",
    pm_managers: "nothing",
    pipeline_stages: "nothing",
    traffic_sources: "nothing",
    system_reset: "nothing",
    ai_config: "nothing",
    nav_edit: "nothing",
  },
};

test("registry: every key is unique and every toggle requirement points at a defined access key", () => {
  const keys = PERMISSION_SECTIONS.flatMap((s) => s.permissions.map((p) => p.key));
  assert.equal(new Set(keys).size, keys.length);
  for (const def of Object.values(PERMISSION_DEFS)) {
    if (def.requires) {
      assert.equal(PERMISSION_DEFS[def.requires.key]?.kind, "access", `${def.key} requires ${def.requires.key}`);
    }
    if (def.kind === "toggle") {
      assert.notEqual(def.legacyDefault, "view");
      assert.notEqual(def.newRoleDefault, "view");
    }
  }
});

test("legacy role keeps the content access it had before the rebuild", () => {
  const resolved = resolveRolePermissions(legacyPm);
  assert.equal(resolved.leads, "edit");
  assert.equal(resolved.clients, "edit");
  assert.equal(resolved.tasks, "edit");
  assert.equal(resolved["tasks.delete"], "nothing");
  assert.equal(resolved["tasks.view_all"], "edit");
  assert.equal(resolved.general_config, "nothing");
  assert.equal(resolved.rag_ai, "nothing");
  assert.equal(resolved.system_reset, "nothing");
});

test("legacy split keys fold into the new access level", () => {
  const perms = { "tasks.view": "view", "tasks.create": "nothing", "tasks.edit": "nothing" } as const;
  assert.equal(resolvePermissionValue(perms, "tasks"), "view");
  assert.equal(resolvePermissionValue({ "tasks.view": "view", "tasks.edit": "edit" }, "tasks"), "edit");
  assert.equal(resolvePermissionValue({ "tasks.view": "nothing" }, "tasks"), "nothing");
  assert.equal(resolvePermissionValue({ "files.view": "view" }, "files"), "view");
  assert.equal(resolvePermissionValue({ "files.view": "view", "files.create": "edit" }, "files"), "edit");
  assert.equal(resolvePermissionValue({ rag_view: "view" }, "rag_ai"), "edit");
  assert.equal(resolvePermissionValue({ rag_view: "nothing" }, "rag_ai"), "nothing");
});

test("a stored value wins over legacy keys and defaults", () => {
  assert.equal(resolvePermissionValue({ tasks: "view", "tasks.edit": "edit" }, "tasks"), "view");
  assert.equal(resolvePermissionValue({ leads: "nothing" }, "leads"), "nothing");
  assert.equal(resolvePermissionValue({}, "unknown.key"), "nothing");
});

test("new role starts locked down and materialises every key", () => {
  const perms = newRolePermissions();
  assert.deepEqual(Object.keys(perms).sort(), [...ALL_PERMISSION_KEYS].sort());
  assert.equal(perms.leads, "nothing");
  assert.equal(perms.dashboard, "view");
  assert.equal(perms.updates, "edit");
  assert.equal(perms["tasks.view_all"], "edit");
});

test("withPermission drops legacy keys and keeps the rest resolved", () => {
  const role: RolePermission = { name: "Sales", permissions: { "leads.view": "view", "tasks.edit": "edit" } };
  const next = withPermission(role, "clients", "view");
  assert.equal(next.permissions.clients, "view");
  assert.equal(next.permissions.leads, "view");
  assert.equal(next.permissions.tasks, "edit");
  assert.equal("leads.view" in next.permissions, false);
});

test("section switch grants and denies the whole section", () => {
  const section = PERMISSION_SECTIONS.find((s) => s.id === "leads")!;
  const role: RolePermission = { name: "Sales", permissions: newRolePermissions() };
  const on = withSectionGranted(role, section, true);
  assert.equal(isSectionFullyGranted(resolveRolePermissions(on), section), true);
  const off = withSectionGranted(on, section, false);
  assert.equal(isSectionFullyDenied(resolveRolePermissions(off), section), true);
  assert.equal(isSectionFullyGranted(resolveRolePermissions(off), section), false);
});

test("admin can do everything, even with no role record", () => {
  const a = buildAccess(user("admin"), []);
  assert.equal(a.isAdmin, true);
  assert.equal(a.hasKnownRole, true);
  assert.equal(a.can("system_reset"), true);
  assert.equal(a.canEdit("leads"), true);
  assert.deepEqual(a.module("leads"), { view: true, edit: true, delete: true });
  assert.equal(a.canOpenRoute("settings/danger"), true);
});

test("unknown role gets nothing", () => {
  const a = buildAccess(user("Viewer"), [legacyPm]);
  assert.equal(a.hasKnownRole, false);
  assert.equal(a.can("leads"), false);
  assert.equal(a.can("dashboard"), false);
  assert.equal(a.hasSettingsAccess, false);
  assert.equal(a.canOpenRoute("leads"), false);
  assert.equal(a.canOpenRoute("personal-settings"), true);
  assert.equal(firstAllowedRoute(a), "personal-settings");
});

test("role lookup is case-insensitive", () => {
  assert.equal(findRole([legacyPm], "project manager")?.name, "Project Manager");
  assert.equal(buildAccess(user("PROJECT MANAGER"), [legacyPm]).can("leads"), true);
});

test("view access opens a module read-only and blocks its toggles", () => {
  const role: RolePermission = { name: "Reader", permissions: { ...newRolePermissions(), leads: "view", "leads.delete": "edit" } };
  const a = buildAccess(user("Reader"), [role]);
  assert.deepEqual(a.module("leads"), { view: true, edit: false, delete: false });
  assert.equal(a.can("leads.delete"), false, "delete requires edit on leads");
  assert.equal(a.canOpenRoute("lead-123"), true);
  assert.equal(a.canOpenRoute("clients"), false);
});

test("edit access without the delete toggle", () => {
  const role: RolePermission = { name: "Editor", permissions: { ...newRolePermissions(), leads: "edit", "leads.delete": "nothing" } };
  const a = buildAccess(user("Editor"), [role]);
  assert.deepEqual(a.module("leads"), { view: true, edit: true, delete: false });
  const withDelete = buildAccess(user("Editor"), [withPermission(role, "leads.delete", "edit")]);
  assert.equal(withDelete.module("leads").delete, true);
});

test("tasks.view_all is off when the role cannot see tasks at all", () => {
  const role: RolePermission = { name: "R", permissions: { ...newRolePermissions(), tasks: "nothing", "tasks.view_all": "edit" } };
  assert.equal(buildAccess(user("R"), [role]).can("tasks.view_all"), false);
});

test("settings access opens on any settings category", () => {
  const none = buildAccess(user("R"), [{ name: "R", permissions: newRolePermissions() }]);
  assert.equal(none.hasSettingsAccess, false);
  assert.equal(none.canOpenRoute("settings"), false);
  const some = buildAccess(user("R"), [{ name: "R", permissions: { ...newRolePermissions(), pipeline_stages: "view" } }]);
  assert.equal(some.hasSettingsAccess, true);
  assert.equal(some.canOpenRoute("settings/states"), true);
  const danger = buildAccess(user("R"), [{ name: "R", permissions: { ...newRolePermissions(), system_reset: "edit" } }]);
  assert.equal(danger.hasSettingsAccess, true);
});

test("routes map to their guarding key", () => {
  assert.equal(permissionKeyForRoute("dash_abc"), "dashboard.custom");
  assert.equal(permissionKeyForRoute("ue_xyz/folder"), "unified_entries");
  assert.equal(permissionKeyForRoute("client-Acme"), "clients");
  assert.equal(permissionKeyForRoute("user-Ann"), "pm_managers");
  assert.equal(permissionKeyForRoute("projects?id=1"), "projects");
  assert.equal(permissionKeyForRoute("personal-settings"), null);
  assert.equal(permissionKeyForRoute(""), "tasks");
  assert.equal(permissionKeyForRoute("something-else"), "tasks");
});
