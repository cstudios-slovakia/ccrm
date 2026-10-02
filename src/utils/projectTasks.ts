import type { Task } from "../types";

/** A task in a done state: "done" by name, or the last configured state. */
export const isDoneTaskState = (status: string, taskStates: string[]): boolean =>
  (status || "").toLowerCase() === "done" ||
  (taskStates.length > 0 && status === taskStates[taskStates.length - 1]);

/**
 * A task is overdue once its deadline (date + optional time, defaulting to
 * 23:59) is in the past relative to `nowStamp` ("YYYY-MM-DD HH:MM", from
 * `nowLocalStamp()`) — never for a task already in a done state.
 */
export const isTaskOverdue = (
  task: Pick<Task, "status" | "deadline" | "deadlineTime">,
  taskStates: string[],
  nowStamp: string
): boolean => {
  if (isDoneTaskState(task.status, taskStates)) return false;
  if (!task.deadline) return false;

  const [currentDateStr, currentTimeStr] = nowStamp.split(" ");
  if (task.deadline < currentDateStr) return true;
  if (task.deadline === currentDateStr) {
    const limitTime = task.deadlineTime || "23:59";
    return (currentTimeStr || "00:00") > limitTime;
  }
  return false;
};

/** Local "YYYY-MM-DD" — deadlines are plain local dates, never UTC. */
export const localDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Local "YYYY-MM-DD HH:MM", the shape `completedAt` is stored in. */
export const localStampStr = (d: Date): string =>
  `${localDateStr(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// A list marker someone pasted along with the line: "- ", "* ", "• ", "1. ",
// "2) ", or a checkbox "[ ] " / "[x] ". Only the marker goes, never the text.
const LIST_MARKER = /^(?:[-*•–]\s+|\d{1,3}[.)]\s+)?(?:\[[ xX]?\]\s+)?/;

// `tasks.title` is VARCHAR(255); a longer title would fail the whole sync write.
const TITLE_MAX = 255;

/**
 * The quick-add box in a project's Tasks tab takes one task per line, so a
 * pasted list becomes that many tasks. Blank lines and list markers are
 * dropped; the result is the titles in the order they were written.
 */
export const parseTaskLines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(LIST_MARKER, "").trim().slice(0, TITLE_MAX))
    .filter((line) => line !== "");

/** What a quick-added task takes from the form around the box. */
export type ProjectTaskDefaults = {
  projectId: string;
  status: string;
  deadline: string;
  deadlineTime: string;
  assignee: string;
  createdBy: string;
  startDate: string;
};

/**
 * Turns the typed lines into tasks. Ids carry a per-batch index so a pasted
 * list created within the same millisecond does not collide on one id.
 */
export const buildProjectTasks = (
  titles: string[],
  defaults: ProjectTaskDefaults,
  now: number = Date.now(),
): Task[] =>
  titles.map((title, i) => ({
    id: `task-${now}-${i}`,
    title,
    description: "",
    status: defaults.status,
    priority: "medium",
    startDate: defaults.startDate || undefined,
    deadline: defaults.deadline,
    deadlineTime: defaults.deadlineTime || undefined,
    owner: defaults.assignee,
    createdBy: defaults.createdBy,
    createdAt: localStampStr(new Date(now)),
    assignedUsers: defaults.assignee ? [defaults.assignee] : [],
    relatedProjectId: defaults.projectId,
  }));

/**
 * A project's tasks as its Tasks tab lists them: the open ones by deadline
 * (then time), and the finished or archived ones apart, most recent first.
 */
export const splitProjectTasks = (
  tasks: Task[],
  projectId: string,
  taskStates: string[],
): { open: Task[]; finished: Task[] } => {
  const own = tasks.filter((task) => task.relatedProjectId === projectId);
  const due = (task: Task) => `${task.deadline || "9999-99-99"} ${task.deadlineTime || "23:59"}`;
  const open = own
    .filter((task) => !task.archived && !isDoneTaskState(task.status, taskStates))
    .sort((a, b) => due(a).localeCompare(due(b)));
  const finished = own
    .filter((task) => task.archived || isDoneTaskState(task.status, taskStates))
    .sort((a, b) => (b.completedAt || b.deadline || "").localeCompare(a.completedAt || a.deadline || ""));
  return { open, finished };
};

/**
 * The task with its done flag flipped. Finishing records who and when, the same
 * way the Tasks board does; reopening sends it back to the first state and
 * clears the attribution, which sync.php then clears on the server too.
 */
export const toggleTaskDone = (
  task: Task,
  taskStates: string[],
  userName: string,
  now: Date = new Date(),
): Task => {
  if (isDoneTaskState(task.status, taskStates)) {
    return { ...task, status: taskStates[0] || "New", completedBy: undefined, completedAt: undefined };
  }
  const doneState =
    taskStates.find((st) => st.toLowerCase() === "done") || taskStates[taskStates.length - 1] || "Done";
  return { ...task, status: doneState, completedBy: userName || undefined, completedAt: localStampStr(now) };
};

export type TaskDateFilter =
  | "all"
  | "last_week"
  | "last_month"
  | "last_quarter"
  | "last_year_to_date"
  | "custom";

export type TaskDateBasis = "due" | "created";

export interface TaskDateRange {
  start: string | null;
  end: string | null;
}

/**
 * Safely extracts or infers the creation date (YYYY-MM-DD) of a task.
 * 1. Checks `task.createdAt` (from MariaDB created_at or client stamp)
 * 2. Checks `task.id` timestamp pattern (`task-${timestamp}`)
 * 3. Falls back to `task.startDate` or `task.deadline`, then today's date.
 */
export const getTaskCreationDate = (
  task: Pick<Task, "deadline"> & Partial<Pick<Task, "createdAt" | "id" | "startDate">>,
): string => {
  if (task.createdAt) {
    const s = task.createdAt.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  }
  if (task.id) {
    const match = task.id.match(/^task-(?:ai-)?(\d{10,13})/);
    if (match) {
      let ts = parseInt(match[1], 10);
      if (ts < 10000000000) ts *= 1000;
      if (ts > 1000000000000 && ts < 3000000000000) {
        return localDateStr(new Date(ts));
      }
    }
  }
  if (task.startDate && /^\d{4}-\d{2}-\d{2}$/.test(task.startDate.slice(0, 10))) {
    return task.startDate.slice(0, 10);
  }
  if (task.deadline && /^\d{4}-\d{2}-\d{2}$/.test(task.deadline.slice(0, 10))) {
    return task.deadline.slice(0, 10);
  }
  return localDateStr(new Date());
};

/**
 * Computes ISO date bounds [start, end] for preset filter options.
 * When filter is 'all' or 'custom' with no bounds, returns null bounds.
 */
export const computeTaskDateRange = (
  filter: TaskDateFilter,
  now: Date = new Date(),
): TaskDateRange => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (filter === "all") {
    return { start: null, end: null };
  }

  if (filter === "last_week") {
    const day = now.getDay();
    // Monday of this week offset: (0 is Sun -> -6, 1 is Mon -> 0, 2 is Tue -> -1, etc.)
    const diffToThisMonday = day === 0 ? -6 : 1 - day;
    const lastMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToThisMonday - 7);
    const lastSunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToThisMonday - 1);
    return { start: toIso(lastMonday), end: toIso(lastSunday) };
  }

  if (filter === "last_month") {
    // 1st of last month:
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    // Last day of last month (0th day of current month):
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: toIso(start), end: toIso(end) };
  }

  if (filter === "last_quarter") {
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const lastQuarterStartMonth = (currentQuarter - 1) * 3;
    const start = new Date(now.getFullYear(), lastQuarterStartMonth, 1);
    const end = new Date(now.getFullYear(), lastQuarterStartMonth + 3, 0);
    return { start: toIso(start), end: toIso(end) };
  }

  if (filter === "last_year_to_date") {
    // From Jan 1 of previous year to today
    const start = new Date(now.getFullYear() - 1, 0, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start: toIso(start), end: toIso(end) };
  }

  return { start: null, end: null };
};

/**
 * Checks whether a task falls within the specified date filter range.
 * When dateBasis === "due": matches if deadline, completedAt, or startDate falls within [start, end].
 * When dateBasis === "created": matches if task creation date falls within [start, end].
 * If filter is 'all', always returns true.
 */
export const isTaskInDateRange = (
  task: Pick<Task, "deadline"> & Partial<Pick<Task, "completedAt" | "startDate" | "createdAt" | "id">>,
  filter: TaskDateFilter,
  customStart?: string,
  customEnd?: string,
  now: Date = new Date(),
  dateBasis: TaskDateBasis = "due",
): boolean => {
  if (filter === "all") return true;

  let start: string | null = null;
  let end: string | null = null;

  if (filter === "custom") {
    start = customStart ? customStart.slice(0, 10) : null;
    end = customEnd ? customEnd.slice(0, 10) : null;
  } else {
    const range = computeTaskDateRange(filter, now);
    start = range.start;
    end = range.end;
  }

  // If no date bounds are specified in custom filter, show all
  if (!start && !end) return true;

  if (dateBasis === "created") {
    const createdDate = getTaskCreationDate(task);
    if (!createdDate) return false;
    if (start && createdDate < start) return false;
    if (end && createdDate > end) return false;
    return true;
  }

  const dates: string[] = [];
  if (task.deadline) {
    const d = task.deadline.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dates.push(d);
  }
  if (task.completedAt) {
    const comp = task.completedAt.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(comp)) dates.push(comp);
  }
  if (task.startDate) {
    const sDate = task.startDate.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(sDate)) dates.push(sDate);
  }

  // If the task has no recognized date fields, exclude it when a date filter is active
  if (dates.length === 0) return false;

  return dates.some((d) => {
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
};

/**
 * Filters and splits tasks into open and finished buckets based on date interval.
 * Supports dateBasis = "due" (sorted by deadline) or "created" (sorted newest created first).
 */
export const splitFilteredTasks = (
  tasks: Task[],
  taskStates: string[],
  filter: TaskDateFilter = "all",
  customStart?: string,
  customEnd?: string,
  now: Date = new Date(),
  dateBasis: TaskDateBasis = "due",
): { open: Task[]; finished: Task[]; allFiltered: Task[]; totalCount: number } => {
  const filtered = tasks.filter((t) => isTaskInDateRange(t, filter, customStart, customEnd, now, dateBasis));

  if (dateBasis === "created") {
    const createdKey = (task: Task) => task.createdAt || getTaskCreationDate(task);
    const open = filtered
      .filter((task) => !task.archived && !isDoneTaskState(task.status, taskStates))
      .sort((a, b) => createdKey(b).localeCompare(createdKey(a)));
    const finished = filtered
      .filter((task) => task.archived || isDoneTaskState(task.status, taskStates))
      .sort((a, b) => createdKey(b).localeCompare(createdKey(a)));
    return { open, finished, allFiltered: filtered, totalCount: filtered.length };
  }

  const due = (task: Task) => `${task.deadline || "9999-99-99"} ${task.deadlineTime || "23:59"}`;
  const open = filtered
    .filter((task) => !task.archived && !isDoneTaskState(task.status, taskStates))
    .sort((a, b) => due(a).localeCompare(due(b)));
  const finished = filtered
    .filter((task) => task.archived || isDoneTaskState(task.status, taskStates))
    .sort((a, b) => (b.completedAt || b.deadline || "").localeCompare(a.completedAt || a.deadline || ""));
  return { open, finished, allFiltered: filtered, totalCount: filtered.length };
};

