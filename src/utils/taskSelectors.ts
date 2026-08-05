import type { Task, UserProfile } from "../types";

export type TaskAccess = {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  /** Whether Global Tasks shows the whole team's workload or only your own. */
  viewAll: boolean;
};

/** RBAC slug behind the team-wide Global Tasks board. */
export const TASK_VIEW_ALL_SLUG = "tasks.view_all";

/**
 * Who may see the whole team's workload in Global Tasks.
 *
 * Team-wide visibility is the default for every role: a shared board is only
 * useful when everybody can read it, and until 1.6.48 the check was hardcoded
 * to the Admin role, so every other user opened Global Tasks and found a single
 * column — their own. A workspace that wants the old behaviour back sets
 * `tasks.view_all` to "nothing" for that role in Settings → Roles & RBAC; an
 * absent value keeps the default, so existing role records need no migration.
 */
export const resolveTaskViewAll = (
  permissions: Record<string, string | undefined> | undefined,
  isAdmin: boolean,
): boolean => {
  if (isAdmin) return true;
  const value = permissions?.[TASK_VIEW_ALL_SLUG];
  if (value === undefined || value === null || value === "") return true;
  return value === "edit" || value === "view";
};

export const isTaskAssignedTo = (task: Task, userName: string): boolean =>
  Boolean(
    userName &&
      Array.isArray(task.assignedUsers) &&
      task.assignedUsers.includes(userName),
  );

/**
 * The assignee list is the only thing that puts a task on a calendar (see
 * isTaskAssignedTo), so a task assigned to a name that belongs to no registered
 * user is invisible to everyone — including the person who created it. Resolve
 * to the closest name that is a real user: the preferred one, else whoever is
 * creating the task.
 */
export const resolveAssigneeName = (
  preferred: string | undefined,
  currentUserName: string | undefined,
  knownUsers: string[],
): string => {
  const isKnown = (name?: string) => Boolean(name && knownUsers.includes(name));
  if (isKnown(preferred)) return preferred as string;
  if (isKnown(currentUserName)) return currentUserName as string;
  return currentUserName || knownUsers[0] || "";
};

export const isTaskCreatedBy = (task: Task, userName: string): boolean =>
  Boolean(task.createdBy && userName && task.createdBy === userName);

/**
 * Membership of a user's personal dashboard — the calendar and the
 * overdue/today/upcoming buckets. A task qualifies when it is assigned to them,
 * or when they created it for somebody else and still have to follow it up.
 *
 * Assignment used to be the only rule. Tasks created from a lead profile take
 * the lead's owner as their assignee, so everything a non-owner scheduled there
 * — a gate task, a booked appointment — landed in no calendar its author could
 * reach, while still showing on the lead itself.
 */
export const isOnPersonalDashboard = (task: Task, userName: string): boolean =>
  isTaskAssignedTo(task, userName) || isTaskCreatedBy(task, userName);

export const isActiveTask = (
  task: Task,
  isDoneState: (status: string) => boolean,
): boolean => !task.archived && !isDoneState(task.status);

export const canViewTask = (
  task: Task,
  user: UserProfile | undefined,
  canSeeAllTasks: boolean,
): boolean =>
  Boolean(user && (canSeeAllTasks || isTaskAssignedTo(task, user.name)));

export const canEditTask = (
  task: Task,
  user: UserProfile | undefined,
  access: TaskAccess,
): boolean =>
  Boolean(
    user &&
      access.edit &&
      (user.role.toLowerCase() === "admin" ||
        isTaskAssignedTo(task, user.name) ||
        isTaskCreatedBy(task, user.name)),
  );

export const canDeleteTask = (
  task: Task,
  user: UserProfile | undefined,
  access: TaskAccess,
): boolean =>
  Boolean(
    user &&
      (user.role.toLowerCase() === "admin" ||
        access.delete ||
        isTaskCreatedBy(task, user.name) ||
        (!task.createdBy && isTaskAssignedTo(task, user.name))),
  );
