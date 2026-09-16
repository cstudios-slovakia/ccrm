import type { Task } from "../types";

/** A task in a done state: "done" by name, or the last configured state. */
export const isDoneTaskState = (status: string, taskStates: string[]): boolean =>
  (status || "").toLowerCase() === "done" ||
  (taskStates.length > 0 && status === taskStates[taskStates.length - 1]);

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
