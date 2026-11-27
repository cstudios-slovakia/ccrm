import type { UserProfile } from "../types";

/** The built-in Project Manager role (a protected role name, see PROTECTED_ROLE_NAMES), any letter case. */
export const isProjectManagerRole = (role: string | null | undefined): boolean =>
  (role || "").trim().toLowerCase() === "project manager";

const uniqueNames = (users: ReadonlyArray<UserProfile>): string[] =>
  Array.from(new Set(users.map((u) => (u.name || "").trim()).filter(Boolean)));

/** Users with the Project Manager role: the projects list's PM filter. */
export const projectManagerUserNames = (users: ReadonlyArray<UserProfile> | null | undefined): string[] =>
  uniqueNames((users ?? []).filter((u) => isProjectManagerRole(u.role)));

/**
 * Options for a Project Manager picker: the users with the role, plus the saved name when it is not one
 * (data from before the rule, or a user whose role changed), so it never silently disappears.
 */
export const projectManagerPickerNames = (users: ReadonlyArray<UserProfile> | null | undefined, current?: string | null): string[] => {
  const names = projectManagerUserNames(users);
  const saved = (current || "").trim();
  return saved && saved.toLowerCase() !== "unassigned" && !names.includes(saved) ? [...names, saved] : names;
};

/**
 * Everyone who is not a Project Manager counts as an employee for a project's "Employees" (an employee,
 * a contractor or an admin alike): the project detail's picker and the projects list's Employees filter.
 * Stored by user name, the same kind of id as `Project.managers`.
 */
export const projectEmployeeUserNames = (users: ReadonlyArray<UserProfile> | null | undefined): string[] =>
  uniqueNames((users ?? []).filter((u) => !isProjectManagerRole(u.role)));
