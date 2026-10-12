import type { Task } from "../types";
import { isOnPersonalDashboard } from "./taskSelectors.ts";
import { isDoneTaskState, isTaskOverdue, localDateStr, localStampStr } from "./projectTasks.ts";

export interface TaskBadgeCounts {
  missed: number;
  today: number;
  total: number;
}

/**
 * The number on the installed app's icon: tasks on the user's own board that are
 * Missed or due Today. Same rule as the Missed / Today buckets in My Tasks
 * (assigned to or created by the user, not archived, not done) — minus the
 * on-screen filters, because a badge must not change with a filter someone left on.
 */
export const countBadgeTasks = (
  tasks: Task[],
  userName: string,
  taskStates: string[],
  now: Date = new Date(),
): TaskBadgeCounts => {
  const todayStr = localDateStr(now);
  const stamp = localStampStr(now);
  let missed = 0;
  let today = 0;
  for (const task of tasks) {
    if (task.archived) continue;
    if (!isOnPersonalDashboard(task, userName)) continue;
    if (isDoneTaskState(task.status, taskStates)) continue;
    if (isTaskOverdue(task, taskStates, stamp)) missed++;
    else if (task.deadline === todayStr) today++;
  }
  return { missed, today, total: missed + today };
};
