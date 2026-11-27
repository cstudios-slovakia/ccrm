// Settings → Projects → Task states: which timer action a status triggers
// (TT2 D10.1). Stored as `TASK_STATE_TIMER_ACTIONS`, a map { statusName: action };
// a missing name means no action. PHP twin: ccrm_normalize_task_state_timer_actions().

import { configuredDoneTaskState } from "./projectTasks.ts";

export type TimerAction = "start" | "pause" | "stop";
export type TaskStateTimerActions = Record<string, TimerAction>;

export const TIMER_ACTIONS: readonly TimerAction[] = ["start", "pause", "stop"];

const isAction = (v: unknown): v is TimerAction => typeof v === "string" && (TIMER_ACTIONS as readonly string[]).includes(v);

/** Keeps only valid actions; with `states`, also drops names that are not a configured status. */
export function sanitizeTimerActions(raw: unknown, states?: readonly string[]): TaskStateTimerActions {
  const out: TaskStateTimerActions = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [name, action] of Object.entries(raw as Record<string, unknown>)) {
    if (!isAction(action)) continue;
    if (states && !states.includes(name)) continue;
    out[name] = action;
  }
  return out;
}

/** Renaming a status moves its action to the new name. */
export function renameTimerActionKey(map: TaskStateTimerActions, oldName: string, newName: string): TaskStateTimerActions {
  if (!(oldName in map)) return map;
  const next = { ...map, [newName]: map[oldName] };
  delete next[oldName];
  return next;
}

/** Deleting a status removes its action. */
export function removeTimerActionKey(map: TaskStateTimerActions, name: string): TaskStateTimerActions {
  if (!(name in map)) return map;
  const next = { ...map };
  delete next[name];
  return next;
}

const IN_PROGRESS_NAMES = ["in progress", "rozpracované", "rozpracovane", "v riešení", "v riesenie", "folyamatban"];

/** The usual mapping: the "In progress" status starts the timer, the last status stops it. */
export function suggestTimerActions(states: readonly string[]): TaskStateTimerActions {
  const out: TaskStateTimerActions = {};
  const start = states.find((s) => IN_PROGRESS_NAMES.includes(s.trim().toLowerCase()));
  if (start) out[start] = "start";
  const last = configuredDoneTaskState([...states]);
  if (last !== undefined && last !== start) out[last] = "stop";
  return out;
}
