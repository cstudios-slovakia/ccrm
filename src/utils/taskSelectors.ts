import type { Task, UserProfile } from "../types";

export type TaskAccess = {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
};

export const isTaskAssignedTo = (task: Task, userName: string): boolean =>
  Boolean(
    userName &&
      Array.isArray(task.assignedUsers) &&
      task.assignedUsers.includes(userName),
  );

export const isTaskCreatedBy = (task: Task, userName: string): boolean =>
  Boolean(task.createdBy && userName && task.createdBy === userName);

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
