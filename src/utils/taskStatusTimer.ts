/**
 * Time tracking v2, phase 8 (D10.2, C14): which timer action a task status change triggers, and
 * for whom. Pure; the PHP twin of `timerActionForStatusChange` is
 * `ccrm_tt_timer_action_for_status_change()` in public/api/time_status_rule.php, and both run the
 * shared fixtures in scripts/fixtures/task-status-timer-cases.json.
 */
import type { Task } from "../types/index.ts";

export type StatusTimerAction = "start" | "pause" | "stop";
export type StatusTimerMap = Record<string, StatusTimerAction>;

const ACTIONS: ReadonlySet<string> = new Set(["start", "pause", "stop"]);

/** Accepts whatever the settings hold (missing, wrong shape) and keeps only valid entries. */
export const normalizeStatusTimerMap = (raw: unknown): StatusTimerMap => {
  const out: StatusTimerMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [name, action] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof action === "string" && ACTIONS.has(action)) out[name] = action as StatusTimerAction;
  }
  return out;
};

/** The mapped action of the new status, only when the status really changed; else null. */
export const timerActionForStatusChange = (
  oldStatus: string | null | undefined,
  newStatus: string | null | undefined,
  map: unknown,
): StatusTimerAction | null => {
  const before = typeof oldStatus === "string" ? oldStatus.trim() : "";
  const after = typeof newStatus === "string" ? newStatus.trim() : "";
  if (after === "" || before === after) return null;
  const actions = normalizeStatusTimerMap(map);
  return Object.prototype.hasOwnProperty.call(actions, after) ? actions[after] : null;
};

/** The part of a time entry the plan needs (a `TimeEntry` fits). */
export interface StatusTimerEntry {
  id: string;
  taskId: string | null;
}

export interface PlannedStatusTimerAction {
  taskId: string;
  action: StatusTimerAction;
  /** The user's own entry it acts on (pause, stop); absent for a start. */
  entryId?: string;
}

/** A recurring template is never a real task (`task_kind = 'recurring'`, see ccrm_sql_real_tasks). */
const isRecurringTemplate = (task: Task): boolean => (task as { taskKind?: unknown }).taskKind === "recurring";

/** The user is an assignee, or the task has nobody assigned. Assignees are names. */
const mayStartOn = (task: Task, userName: string): boolean => {
  const assignees = [...(Array.isArray(task.assignedUsers) ? task.assignedUsers : []), task.owner].filter(
    (n): n is string => typeof n === "string" && n.trim() !== "",
  );
  return assignees.length === 0 || (userName !== "" && assignees.includes(userName));
};

/**
 * D10.2 for the current user only (C14): compares the tasks before and after one local update and
 * lists the timer actions to run. Start only when exactly one task changed in the update, the user
 * is an assignee or the task has none, the task is not a recurring template and `canTrack`; it is
 * skipped when the task already runs. Pause takes the user's running item on the task, stop the
 * running or (else) paused one; both also apply on a bulk edit. Nobody else's timer is ever named:
 * `running` and `paused` are the signed-in user's own lists.
 */
export const planStatusTimerActions = (input: {
  before: readonly Task[];
  after: readonly Task[];
  map: unknown;
  userId: string | null;
  userName: string;
  running: readonly StatusTimerEntry[];
  paused: readonly StatusTimerEntry[];
  canTrack: boolean;
}): PlannedStatusTimerAction[] => {
  const map = normalizeStatusTimerMap(input.map);
  if (!input.userId || !input.canTrack || Object.keys(map).length === 0) return [];
  const beforeById = new Map(input.before.map((t) => [t.id, t]));
  // "Changed in that update": a task that is new, or whose content differs (a writer that rebuilds
  // every row object must not turn a single edit into a bulk one).
  const changed = input.after.filter((t) => {
    const prev = beforeById.get(t.id);
    return prev !== t && (!prev || JSON.stringify(prev) !== JSON.stringify(t));
  });
  const single = changed.length === 1;
  const plan: PlannedStatusTimerAction[] = [];
  for (const task of changed) {
    const prev = beforeById.get(task.id);
    if (!prev || isRecurringTemplate(task)) continue;
    const action = timerActionForStatusChange(prev.status, task.status, map);
    if (!action) continue;
    const runningItem = input.running.find((e) => e.taskId === task.id);
    if (action === "start") {
      if (single && !runningItem && mayStartOn(task, input.userName)) plan.push({ taskId: task.id, action });
    } else if (action === "pause") {
      if (runningItem) plan.push({ taskId: task.id, action, entryId: runningItem.id });
    } else {
      const item = runningItem ?? input.paused.find((e) => e.taskId === task.id);
      if (item) plan.push({ taskId: task.id, action, entryId: item.id });
    }
  }
  return plan;
};
