import type { Task, TaskSettings, UserProfile } from "../types";
import { isDoneTaskState } from "./projectTasks.ts";
import { isAdminRoleName } from "./permissions.ts";

/** On by default: offerConclusion is true, and conclusion required by default is false. */
export const DEFAULT_TASK_SETTINGS: TaskSettings = {
  offerConclusion: true,
  defaultRequiresConclusion: false,
};

/**
 * Coerce anything (a stored blob, a sync payload, `undefined`) to a usable
 * config. Mirrors ccrm_normalize_task_settings() in api/auth.php — both sides
 * have to agree on what a malformed value means, or the settings-sync signature
 * flip-flops and pushes forever.
 */
export function normalizeTaskSettings(value: unknown): TaskSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<TaskSettings>;
  return {
    offerConclusion: !("offerConclusion" in raw) || raw.offerConclusion === true,
    defaultRequiresConclusion: raw.defaultRequiresConclusion === true,
  };
}

/** A written conclusion: anything other than blank space. */
export const hasConclusion = (task: Pick<Task, "conclusion">): boolean =>
  typeof task.conclusion === "string" && task.conclusion.trim() !== "";

/**
 * True when moving `task` to `nextStatus` would finish a task that asked for a
 * conclusion and has none yet. Every place that can move a task to a done state
 * asks this before it does, so the rule lives in one spot.
 */
export const needsConclusionToFinish = (
  task: Pick<Task, "status" | "requiresConclusion" | "conclusion">,
  nextStatus: string,
  taskStates: string[],
): boolean =>
  task.requiresConclusion === true &&
  !hasConclusion(task) &&
  isDoneTaskState(nextStatus, taskStates) &&
  !isDoneTaskState(task.status, taskStates);

/** The conclusion as stored: trimmed, and absent rather than empty. */
export const cleanConclusion = (text: string): string | undefined => {
  const trimmed = text.trim();
  return trimmed === "" ? undefined : trimmed;
};

/** `tasks.conclusion` is TEXT, but a runaway paste should not bloat every sync pull. */
export const CONCLUSION_MAX = 5000;

/**
 * Who may remove the "Requires conclusion" requirement from an existing task:
 * only the task's creator or an Admin.
 *
 * Unticking is restricted so assignees cannot bypass the requirement to write
 * a conclusion before finishing the task.
 */
export const canUntickConclusion = (
  task: Pick<Task, "createdBy" | "requiresConclusion">,
  user: Pick<UserProfile, "name" | "role"> | undefined,
): boolean => {
  // If the stored task did not require a conclusion, unticking is not restricted.
  if (!task.requiresConclusion) return true;
  if (!user) return false;
  if (isAdminRoleName(user.role)) return true;
  return Boolean(
    task.createdBy &&
      user.name &&
      task.createdBy.trim().toLowerCase() === user.name.trim().toLowerCase(),
  );
};
