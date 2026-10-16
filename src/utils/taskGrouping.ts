import type { Task } from "../types";

/**
 * How the task lists are laid out. `due` is the original layout — time buckets
 * (Overdue / Today / Tomorrow / Upcoming / Done). `created` drops the buckets
 * and shows one flat list ordered by {@link TaskSort}.
 */
export type TaskGroupBy = "due" | "created";

export type TaskSort =
  | "newest"
  | "oldest"
  | "dueSoonest"
  | "dueLatest"
  | "priority"
  | "title";

export const TASK_GROUP_BY_VALUES: readonly TaskGroupBy[] = ["due", "created"];
export const TASK_SORT_VALUES: readonly TaskSort[] = [
  "newest",
  "oldest",
  "dueSoonest",
  "dueLatest",
  "priority",
  "title",
];

export const DEFAULT_TASK_GROUP_BY: TaskGroupBy = "due";
export const DEFAULT_TASK_SORT: TaskSort = "newest";

export const TASK_GROUP_BY_STORAGE_KEY = "ccrm_task_group_by";
export const TASK_SORT_STORAGE_KEY = "ccrm_task_sort";

/** A stored value that is not (or no longer) a valid choice falls back to the default. */
export const parseTaskGroupBy = (raw: unknown): TaskGroupBy =>
  TASK_GROUP_BY_VALUES.find((v) => v === raw) ?? DEFAULT_TASK_GROUP_BY;

export const parseTaskSort = (raw: unknown): TaskSort =>
  TASK_SORT_VALUES.find((v) => v === raw) ?? DEFAULT_TASK_SORT;

/**
 * `createdAt` comes from the database as "YYYY-MM-DD HH:MM:SS"; an ISO string
 * has a "T" instead of the space. Normalising it keeps a plain string compare
 * chronological. A task with no stamp yet was created in this session and has
 * not been round-tripped through the server, so it counts as the newest.
 */
const createdStamp = (task: Task): string | null => {
  const raw = task.createdAt;
  return raw ? String(raw).replace("T", " ") : null;
};

const byCreated = (a: Task, b: Task): number => {
  const sa = createdStamp(a);
  const sb = createdStamp(b);
  if (sa === null && sb === null) return 0; // keep the arrival order
  if (sa === null) return 1; // a is newer
  if (sb === null) return -1;
  return sa.localeCompare(sb);
};

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

const byDueSoonest = (a: Task, b: Task): number => {
  const date = (a.deadline || "9999-12-31").localeCompare(b.deadline || "9999-12-31");
  if (date !== 0) return date;
  return (a.deadlineTime || "23:59").localeCompare(b.deadlineTime || "23:59");
};

/** Comparator for the flat list. Ties always fall back to the title so the order is stable. */
export const compareTasks = (sort: TaskSort): ((a: Task, b: Task) => number) => {
  const withTitle = (primary: (a: Task, b: Task) => number) => (a: Task, b: Task) =>
    primary(a, b) || a.title.localeCompare(b.title);
  switch (sort) {
    case "oldest":
      // Not a reversed `newest`: two unstamped tasks must keep their arrival order in both directions.
      return (a, b) => byCreated(a, b) || (createdStamp(a) === null && createdStamp(b) === null ? 0 : a.title.localeCompare(b.title));
    case "dueSoonest":
      return withTitle(byDueSoonest);
    case "dueLatest":
      return withTitle((a, b) => byDueSoonest(b, a));
    case "priority":
      return withTitle(
        (a, b) =>
          (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) || byDueSoonest(a, b),
      );
    case "title":
      return (a, b) => a.title.localeCompare(b.title);
    case "newest":
    default:
      return (a, b) =>
        byCreated(b, a) || (createdStamp(a) === null && createdStamp(b) === null ? 0 : a.title.localeCompare(b.title));
  }
};

/** A sorted copy; the input is left alone. */
export const sortTasks = (tasks: readonly Task[], sort: TaskSort): Task[] =>
  [...tasks].sort(compareTasks(sort));
