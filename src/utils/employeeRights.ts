import type { AccessResolver } from "./permissions";

/**
 * What the signed-in person may do in the Employees module, field group by field group.
 *
 * `employees` alone is the directory (names, work contacts, state). Pay, leave, documents and
 * personal data each sit behind their own toggle; "edit" of a group needs `employees` = edit on
 * top of the toggle. The server enforces the same split (read_scope.php, sync.php); this only
 * decides what the screens show so nobody is offered a control that will be refused or a field
 * the server never sent.
 */
export interface EmployeeRights {
  view: boolean;
  edit: boolean;
  delete: boolean;
  /** Pay rates, payroll matrix and records. */
  salaries: boolean;
  vacations: boolean;
  files: boolean;
  /** PIN, home address, phone, HR notes. */
  personal: boolean;
  editSalaries: boolean;
  editVacations: boolean;
  editFiles: boolean;
  editPersonal: boolean;
  /** Link or unlink a login and an employee record (Admin, or employees + pm_managers = edit). */
  canLinkUsers: boolean;
  /** The employee-settings screen (leave types, pay periods, time-tracking keys). */
  canConfigure: boolean;
}

export const FULL_EMPLOYEE_RIGHTS: EmployeeRights = {
  view: true,
  edit: true,
  delete: true,
  salaries: true,
  vacations: true,
  files: true,
  personal: true,
  editSalaries: true,
  editVacations: true,
  editFiles: true,
  editPersonal: true,
  canLinkUsers: true,
  canConfigure: true,
};

export const employeeRightsFrom = (
  access: Pick<AccessResolver, "isAdmin" | "module" | "can" | "canEdit">
): EmployeeRights => {
  const m = access.module("employees");
  const edit = m.edit;
  const salaries = m.view && access.can("employees.salaries");
  const vacations = m.view && access.can("employees.vacations");
  const files = m.view && access.can("employees.files");
  const personal = m.view && access.can("employees.personal");
  return {
    view: m.view,
    edit,
    delete: m.delete,
    salaries,
    vacations,
    files,
    personal,
    editSalaries: edit && salaries,
    editVacations: edit && vacations,
    editFiles: edit && files,
    editPersonal: edit && personal,
    canLinkUsers: access.isAdmin || (edit && access.canEdit("pm_managers")),
    canConfigure: access.isAdmin || access.canEdit("general_config"),
  };
};
