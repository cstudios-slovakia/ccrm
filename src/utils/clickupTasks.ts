import type { Task } from "../types";

export interface GroupedTaskRow {
  task: Task;
  subtasks: Task[];
  /** Shown when a subtask belongs to another completion bucket than its parent (e.g. open subtask under closed parent). */
  orphanParentTitle?: string;
}

/** True when a task is mirrored from ClickUp (read-only task mirror; excludes #tasks lists). */
export const isClickUpTask = (task: Pick<Task, "externalSource">): boolean =>
  task.externalSource === "clickup";

/** Filters ClickUp tasks out of main task lists & overdue badges while leaving every other surface intact. */
export const excludeClickUpTasks = <T extends Pick<Task, "externalSource">>(tasks: readonly T[]): T[] =>
  tasks.filter((task) => !isClickUpTask(task));

/**
 * Nests subtasks (`parentTaskId`) beneath their parent within the same bucket.
 * If a subtask's parent sits in another bucket (e.g. closed parent, open subtask),
 * it stays visible at top level of `bucketTasks` with `orphanParentTitle` set.
 */
export const groupTasksWithSubtasks = (
  bucketTasks: readonly Task[],
  allEntityTasks: readonly Task[] = bucketTasks,
): GroupedTaskRow[] => {
  const bucketIds = new Set(bucketTasks.map((t) => t.id));
  const allById = new Map(allEntityTasks.map((t) => [t.id, t]));
  const subtasksByParent = new Map<string, Task[]>();

  for (const task of bucketTasks) {
    const pid = task.parentTaskId;
    if (pid && bucketIds.has(pid)) {
      const list = subtasksByParent.get(pid);
      if (list) list.push(task);
      else subtasksByParent.set(pid, [task]);
    }
  }

  const out: GroupedTaskRow[] = [];
  for (const task of bucketTasks) {
    const pid = task.parentTaskId;
    if (pid && bucketIds.has(pid)) {
      continue;
    }
    const parent = pid ? allById.get(pid) : undefined;
    out.push({
      task,
      subtasks: subtasksByParent.get(task.id) ?? [],
      orphanParentTitle: parent ? parent.title : undefined,
    });
  }
  return out;
};
