import test from "node:test";
import assert from "node:assert/strict";
import { buildAccess, employeeRolePermissions } from "./permissions.ts";
import { employeeRightsFrom } from "./employeeRights.ts";

const rightsFor = (role: string, permissions: Record<string, string>, isAdmin = false) => {
  const user = { id: "u", name: "U", email: "u@x", role: isAdmin ? "Admin" : role } as any;
  return employeeRightsFrom(buildAccess(user, [{ name: role, permissions } as any]));
};

test("the Employee role has no employee-module rights at all", () => {
  const r = rightsFor("Employee", employeeRolePermissions());
  assert.equal(r.view, false);
  assert.equal(r.salaries || r.vacations || r.files || r.personal, false);
  assert.equal(r.canLinkUsers, false);
});

test("directory-only: viewing employees shows no pay, leave, documents or personal data", () => {
  const r = rightsFor("Dir", {
    employees: "view",
    "employees.salaries": "nothing",
    "employees.vacations": "nothing",
    "employees.files": "nothing",
    "employees.personal": "nothing",
  });
  assert.equal(r.view, true);
  assert.equal(r.edit, false);
  assert.equal(r.salaries, false);
  assert.equal(r.vacations, false);
  assert.equal(r.files, false);
  assert.equal(r.personal, false);
});

test("a toggle without the module is off (requirement not met)", () => {
  const r = rightsFor("Odd", { employees: "nothing", "employees.salaries": "edit" });
  assert.equal(r.salaries, false);
});

test("editing a group needs employees = edit as well as the toggle", () => {
  const viewOnly = rightsFor("V", { employees: "view", "employees.salaries": "edit", "employees.vacations": "edit" });
  assert.equal(viewOnly.salaries, true);
  assert.equal(viewOnly.editSalaries, false);
  const editor = rightsFor("E", { employees: "edit", "employees.salaries": "edit", "employees.vacations": "nothing" });
  assert.equal(editor.editSalaries, true);
  assert.equal(editor.vacations, false);
  assert.equal(editor.editVacations, false);
});

test("linking a login needs Admin, or employees and pm_managers at edit", () => {
  assert.equal(rightsFor("HR", { employees: "edit", pm_managers: "view" }).canLinkUsers, false);
  assert.equal(rightsFor("HR", { employees: "edit", pm_managers: "edit" }).canLinkUsers, true);
  assert.equal(rightsFor("x", {}, true).canLinkUsers, true);
});

test("the employee-settings screen needs general_config = edit", () => {
  assert.equal(rightsFor("HR", { employees: "edit", general_config: "view" }).canConfigure, false);
  assert.equal(rightsFor("HR", { employees: "edit", general_config: "edit" }).canConfigure, true);
});

test("Admin has every right", () => {
  const r = rightsFor("x", {}, true);
  assert.ok(Object.values(r).every(Boolean));
});

test("an existing role that predates the toggles keeps seeing everything (legacy default)", () => {
  const r = rightsFor("Old", { employees: "edit" });
  assert.ok(r.salaries && r.vacations && r.files && r.personal && r.editSalaries);
});
