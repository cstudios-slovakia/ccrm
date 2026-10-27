import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import test from "node:test";
import type { RolePermission, UserProfile } from "../types";
import {
  ALL_PERMISSION_KEYS,
  EMPLOYEE_ROLE_NAME,
  PERMISSION_DEFS,
  PERMISSION_SECTIONS,
  PROTECTED_ROLE_NAMES,
  buildAccess,
  employeeRolePermissions,
  findRole,
  firstAllowedRoute,
  isProtectedRoleName,
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
  assert.equal(a.canOpenRoute("settings/system/reset"), true);
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
  assert.equal(some.canOpenRoute("settings/leads/stages"), true);
  const danger = buildAccess(user("R"), [{ name: "R", permissions: { ...newRolePermissions(), system_reset: "edit" } }]);
  assert.equal(danger.hasSettingsAccess, true);
});

test("routes map to their guarding key", () => {
  assert.equal(permissionKeyForRoute("dash_abc"), "dashboard.custom");
  assert.equal(permissionKeyForRoute("ue_xyz/folder"), "unified_entries");
  assert.equal(permissionKeyForRoute("client-Acme"), "clients");
  assert.equal(permissionKeyForRoute("user-Ann"), "pm_managers");
  assert.equal(permissionKeyForRoute("projects?id=1"), "projects");
  assert.equal(permissionKeyForRoute("projects/123"), "projects");
  assert.equal(permissionKeyForRoute("project-123"), "projects");
  assert.equal(permissionKeyForRoute("my-employment"), "people");
  assert.equal(permissionKeyForRoute("employees/me"), "people");
  assert.equal(permissionKeyForRoute("employees"), "people");
  assert.equal(permissionKeyForRoute("personal-settings"), null);
  assert.equal(permissionKeyForRoute(""), "tasks");
  assert.equal(permissionKeyForRoute("something-else"), "tasks");
});

test("legacy role keeps today's effective access and resolves new keys' legacy defaults", () => {
  const resolved = resolveRolePermissions(legacyPm);
  // Existing keys keep access
  assert.equal(resolved.employees, "edit");
  assert.equal(resolved["employees.salaries"], "edit");
  // New employee toggles default to edit for legacy roles so HR isn't locked out
  assert.equal(resolved["employees.vacations"], "edit");
  assert.equal(resolved["employees.files"], "edit");
  assert.equal(resolved["employees.personal"], "edit");
  // Self-service keys default to nothing, except self.account which is edit
  assert.equal(resolved["self.account"], "edit");
  assert.equal(resolved["self.profile"], "nothing");
  assert.equal(resolved["self.payroll"], "nothing");
  assert.equal(resolved["self.vacations"], "nothing");
  assert.equal(resolved["self.files"], "nothing");
  assert.equal(resolved["self.hours"], "nothing");
});

test("Employee defaults match prompt specification key-by-key", () => {
  const defs = employeeRolePermissions();
  assert.deepEqual(Object.keys(defs).sort(), [...ALL_PERMISSION_KEYS].sort());
  // Tasks
  assert.equal(defs.tasks, "edit");
  assert.equal(defs["tasks.delete"], "nothing");
  assert.equal(defs["tasks.view_all"], "nothing");
  // No company data
  assert.equal(defs.dashboard, "nothing");
  assert.equal(defs["dashboard.custom"], "nothing");
  assert.equal(defs.leads, "nothing");
  assert.equal(defs.clients, "nothing");
  assert.equal(defs.projects, "nothing");
  assert.equal(defs.invoices, "nothing");
  assert.equal(defs.warehouse, "nothing");
  assert.equal(defs.financial, "nothing");
  assert.equal(defs.employees, "nothing");
  assert.equal(defs["employees.delete"], "nothing");
  assert.equal(defs["employees.salaries"], "nothing");
  assert.equal(defs["employees.vacations"], "nothing");
  assert.equal(defs["employees.files"], "nothing");
  assert.equal(defs["employees.personal"], "nothing");
  assert.equal(defs.meetings, "nothing");
  assert.equal(defs.files, "nothing");
  assert.equal(defs.email, "nothing");
  assert.equal(defs.unified_entries, "nothing");
  assert.equal(defs.automation, "nothing");
  assert.equal(defs.social_media, "nothing");
  assert.equal(defs.overview, "nothing");
  assert.equal(defs.updates, "edit");
  assert.equal(defs.rag_ai, "nothing");
  assert.equal(defs.general_config, "nothing");
  assert.equal(defs.pm_managers, "nothing");
  // Self service
  assert.equal(defs["self.account"], "nothing");
  assert.equal(defs["self.profile"], "view");
  assert.equal(defs["self.payroll"], "edit");
  assert.equal(defs["self.vacations"], "edit");
  assert.equal(defs["self.files"], "edit");
  assert.equal(defs["self.hours"], "edit");
});

test("buildAccess for Employee role grants only allowed self and task abilities", () => {
  const empRole: RolePermission = { name: EMPLOYEE_ROLE_NAME, permissions: employeeRolePermissions() };
  const a = buildAccess(user("Employee"), [empRole]);
  assert.equal(a.isAdmin, false);
  assert.equal(a.hasKnownRole, true);
  // Tasks
  assert.equal(a.can("tasks"), true);
  assert.equal(a.canEdit("tasks"), true);
  assert.equal(a.can("tasks.delete"), false);
  assert.equal(a.can("tasks.view_all"), false);
  assert.deepEqual(a.module("tasks"), { view: true, edit: true, delete: false });
  // Employees module company-wide is locked
  assert.equal(a.can("employees"), false);
  assert.equal(a.can("employees.salaries"), false);
  assert.equal(a.can("employees.vacations"), false);
  assert.equal(a.can("employees.files"), false);
  assert.equal(a.can("employees.personal"), false);
  assert.deepEqual(a.module("employees"), { view: false, edit: false, delete: false });
  // Self service
  assert.equal(a.can("self.profile"), true);
  assert.equal(a.canEdit("self.profile"), false);
  assert.equal(a.can("self.payroll"), true);
  assert.equal(a.can("self.vacations"), true);
  assert.equal(a.canEdit("self.vacations"), true);
  assert.equal(a.can("self.files"), true);
  assert.equal(a.can("self.hours"), true);
  assert.equal(a.can("self.account"), false);
  // Routes: People opens for the self-service tab even though the directory is locked
  assert.equal(a.canOpenRoute("my-employment"), true);
  assert.equal(a.canOpenRoute("tasks"), true);
  assert.equal(a.canOpenRoute("employees"), true);
  assert.equal(a.canOpenRoute("employees/me"), true);
  assert.equal(a.hasSelfServiceAccess, true);
  assert.equal(a.canOpenRoute("leads"), false);
  assert.equal(firstAllowedRoute(a), "tasks");
});

test("canOpenRoute('employees') opens for each self.* key, and for the directory alone", () => {
  const selfKeys = ["self.profile", "self.payroll", "self.vacations", "self.files", "self.hours"] as const;
  for (const k of selfKeys) {
    const role: RolePermission = {
      name: "SingleKey",
      permissions: { ...newRolePermissions(), [k]: k === "self.profile" ? "view" : "edit" },
    };
    const a = buildAccess(user("SingleKey"), [role]);
    assert.equal(a.canOpenRoute("employees"), true, `should open with ${k}`);
    assert.equal(a.canOpenRoute("my-employment"), true, `old address should open with ${k}`);
  }

  // With none of the 5 self keys and no directory access
  const roleNone: RolePermission = {
    name: "NoSelf",
    permissions: { ...newRolePermissions(), "self.account": "edit" },
  };
  const aNone = buildAccess(user("NoSelf"), [roleNone]);
  assert.equal(aNone.canOpenRoute("employees"), false);
  assert.equal(aNone.canOpenRoute("my-employment"), false);

  // The directory alone (no self.* key) still opens the section
  const roleDir: RolePermission = {
    name: "DirOnly",
    permissions: { ...newRolePermissions(), employees: "view" },
  };
  const aDir = buildAccess(user("DirOnly"), [roleDir]);
  assert.equal(aDir.canOpenRoute("employees"), true);
  assert.equal(aDir.hasSelfServiceAccess, false);
});

test("Employee is a protected role and cannot be deleted", () => {
  assert.ok(PROTECTED_ROLE_NAMES.includes("Employee"));
  assert.equal(isProtectedRoleName("Employee"), true);
  assert.equal(isProtectedRoleName("employee"), true);
  assert.equal(isProtectedRoleName("EMPLOYEE"), true);
  assert.equal(isProtectedRoleName("Admin"), true);
  assert.equal(isProtectedRoleName("Project Manager"), true);
  assert.equal(isProtectedRoleName("Viewer"), false);
});

test("P1: PHP registry equals TS registry", () => {
  const phpOutput = execSync(
    'php -r "require \'public/api/permissions.php\'; echo json_encode([\'sections\' => ccrm_permission_sections(), \'employee\' => ccrm_employee_role_permissions()]);"',
    { encoding: "utf8" }
  );
  const php = JSON.parse(phpOutput);

  // Compare sections structure: keys, kinds, defaults, requires
  const tsSections = PERMISSION_SECTIONS.map((s) => ({
    id: s.id,
    permissions: s.permissions.map((p) => ({
      key: p.key,
      kind: p.kind,
      legacyDefault: p.legacyDefault,
      newRoleDefault: p.newRoleDefault,
      requires: p.requires ?? null,
      legacyKeys: p.legacyKeys ?? null,
      legacyEdit: p.legacyEdit ?? null,
    })),
  }));

  assert.deepEqual(php.sections, tsSections, "PHP permission sections match TS");
  assert.deepEqual(php.employee, employeeRolePermissions(), "PHP Employee permissions match TS");
});


test("SAI follows leads: a role with no sales access is not offered it, and it is not open to everyone", () => {
  assert.equal(permissionKeyForRoute("sai"), "leads");
  const employee = buildAccess({ id: "u", name: "U", email: "u@x", role: "Employee" } as any, [
    { name: "Employee", permissions: employeeRolePermissions() } as any,
  ]);
  assert.equal(employee.canOpenRoute("sai"), false);
  assert.equal(employee.canOpenRoute("tasks"), true);
});

test("time tracking: everyone who may use the module tracks their own time; team, costs and the salary report are opt-in", () => {
  const sectionKeys = PERMISSION_SECTIONS.find((sec) => sec.id === "time_tracking")!.permissions.map((p) => p.key);
  assert.deepEqual(sectionKeys, ["time_tracking", "time_tracking_team", "time_tracking_costs", "time_tracking_salary_report"]);
  // A role stored before the module existed: tracks own time, sees nothing of anyone else's.
  const legacy = resolveRolePermissions({ name: "Old", permissions: {} });
  assert.equal(legacy.time_tracking, "edit");
  assert.equal(legacy.time_tracking_team, "nothing");
  assert.equal(legacy.time_tracking_costs, "nothing");
  assert.equal(legacy.time_tracking_salary_report, "nothing");
  // A role created in the matrix starts with the whole section off.
  const fresh = newRolePermissions();
  assert.equal(fresh.time_tracking, "nothing");
  // The Employee role tracks own time only.
  const emp = employeeRolePermissions();
  assert.equal(emp.time_tracking, "edit");
  assert.equal(emp.time_tracking_team, "nothing");
  assert.equal(emp.time_tracking_costs, "nothing");
});

test("time tracking: team and costs mean nothing without the module, and the route maps to the module key", () => {
  const role: RolePermission = { name: "R", permissions: { ...newRolePermissions(), time_tracking: "nothing", time_tracking_team: "edit", time_tracking_costs: "edit" } };
  const a = buildAccess(user("R"), [role]);
  assert.equal(a.can("time_tracking_team"), false);
  assert.equal(a.can("time_tracking_costs"), false);
  assert.equal(a.canOpenRoute("time-tracking"), false);
  const viewer: RolePermission = { name: "V", permissions: { ...newRolePermissions(), time_tracking: "view", time_tracking_costs: "edit" } };
  const b = buildAccess(user("V"), [viewer]);
  assert.equal(b.canOpenRoute("time-tracking"), true);
  assert.equal(b.canOpenRoute("time-tracking/day"), true);
  assert.equal(b.canEdit("time_tracking"), false);
  assert.equal(b.can("time_tracking_costs"), true);
  assert.equal(permissionKeyForRoute("time-tracking/day"), "time_tracking");
});
