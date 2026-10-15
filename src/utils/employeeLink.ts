import type { Employee, RolePermission, UserProfile } from "../types";
import { findRole, isAdminRoleName, resolveRolePermissions } from "./permissions.ts";

// Linking a login to an employee record (employees.user_id). The link is chosen by a person,
// never derived from an e-mail address at runtime; an e-mail match is only a SUGGESTION the
// picker offers (a user can change their own login e-mail, so trusting a match would let them
// attach themselves to someone else's payroll).

const norm = (value: string | null | undefined): string => String(value ?? "").trim().toLowerCase();

/** The employee record linked to this login, if any. */
export const linkedEmployeeOf = (employees: Employee[], userId: string | null | undefined): Employee | undefined =>
  userId ? employees.find((e) => e.userId === userId) : undefined;

/** Ids of logins already linked to a record other than `exceptEmployeeId`. One login maps to at most one employee. */
export const loginsLinkedElsewhere = (employees: Employee[], exceptEmployeeId?: string | null): Set<string> => {
  const taken = new Set<string>();
  for (const e of employees) {
    if (e.userId && e.id !== exceptEmployeeId) taken.add(e.userId);
  }
  return taken;
};

/**
 * The login whose e-mail equals the employee's, if it is free to link. A suggestion only: the
 * caller shows it and an authorised person confirms. Null when the e-mail is blank, matches
 * nobody, or the match is already linked to another employee.
 */
export const suggestUserForEmployee = (
  users: UserProfile[],
  employees: Employee[],
  employeeId: string | null | undefined,
  employeeEmail: string | null | undefined
): UserProfile | null => {
  const email = norm(employeeEmail);
  if (!email) return null;
  const taken = loginsLinkedElsewhere(employees, employeeId);
  return users.find((u) => norm(u.email) === email && !(u.id && taken.has(u.id))) ?? null;
};

/**
 * Would a login with this role see EVERY employee (the whole directory)? True for Admin and for any
 * role with the employees module at view or better. Used to warn before linking such a login, because
 * the person would then see all colleagues in the Employees module, not only their own record.
 */
export const roleSeesEveryEmployee = (roles: RolePermission[] | undefined, roleName: string | null | undefined): boolean => {
  if (isAdminRoleName(roleName)) return true;
  const role = findRole(roles, roleName);
  if (!role) return false;
  const value = resolveRolePermissions(role).employees;
  return value === "view" || value === "edit";
};
