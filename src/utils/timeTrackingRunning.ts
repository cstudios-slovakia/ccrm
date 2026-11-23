/**
 * Time tracking v2 (D5.3, D5.4, C3–C5): pure rules for the running set in the browser.
 *
 *   isRunningTarget(running, target)   does an entry in the running set already track this target?
 *   resolveStartMode(input)            what a Start does while something runs: plain / switch / parallel / ask
 *   sameRunningIds(a, b)               did the running set change (by entry id, order ignored)?
 *
 * The identical-target rule mirrors `ccrm_tt_same_target()` in `public/api/time_parallel.php`:
 * same task; else (no task) same ticket; else a free-text entry on the same project with the same title.
 */

import type { StartWhileRunning, TimeEntry, TimeTrackingSettings } from "./timeTracking.ts";

/** What a Start points at. `title` is the free-text title of an unlinked entry. */
export interface RunningTarget {
  taskId?: string | null;
  ticketId?: string | null;
  projectId?: string | null;
  title?: string | null;
}

const norm = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

type RunningLike = Pick<TimeEntry, "taskId" | "ticketId" | "projectId" | "description" | "title">;

/** Does this running entry track the target (the server's identical-target rule)? */
export const isSameTarget = (entry: RunningLike, target: RunningTarget): boolean => {
  const task = norm(target.taskId);
  if (task) return norm(entry.taskId) === task;
  const ticket = norm(target.ticketId);
  if (ticket) return !norm(entry.taskId) && norm(entry.ticketId) === ticket;
  return (
    !norm(entry.taskId) &&
    !norm(entry.ticketId) &&
    norm(entry.projectId) === norm(target.projectId) &&
    norm(entry.description ?? entry.title) === norm(target.title)
  );
};

/** "Running" means *this* target is in the running set (D5.4, last bullet). */
export const isRunningTarget = (running: readonly RunningLike[], target: RunningTarget): boolean =>
  running.some((entry) => isSameTarget(entry, target));

/**
 * - `plain`: nothing runs; a start without a mode.
 * - `switch`: stop everything that runs and start this.
 * - `parallel`: start this next to what runs.
 * - `ask`: show the "Switch to this / Run in parallel" popover.
 */
export type StartModeResolution = "plain" | "switch" | "parallel" | "ask";

export interface StartModeInput {
  runningCount: number;
  preference: StartWhileRunning;
  parallel: Pick<TimeTrackingSettings["parallel"], "enabled">;
  /** The target already runs: a start can only end in "already running", never a second copy. */
  targetRunning?: boolean;
  /** A mode the caller already chose (the popover's answer, a "Switch instead?" retry). */
  forced?: "switch" | "parallel" | null;
}

/**
 * The mode of a start (C3: parallel is always deliberate). With the company's parallel tracking off
 * there is nothing to choose: a start switches, as it always did. Whether this user may run in
 * parallel is the server's call; a refusal comes back as `parallel_forbidden`.
 */
export const resolveStartMode = ({ runningCount, preference, parallel, targetRunning, forced }: StartModeInput): StartModeResolution => {
  if (runningCount <= 0) return "plain";
  if (forced) return forced;
  if (targetRunning || !parallel.enabled) return "switch";
  if (preference === "switch" || preference === "parallel") return preference;
  return "ask";
};

/** True when both sets hold the same entry ids. */
export const sameRunningIds = (a: readonly Pick<TimeEntry, "id">[], b: readonly Pick<TimeEntry, "id">[]): boolean => {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((e) => e.id));
  return b.every((e) => ids.has(e.id));
};
