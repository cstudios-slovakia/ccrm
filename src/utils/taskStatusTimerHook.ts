/**
 * Time tracking v2, phase 8 (D10.2): the hand-off from App's `updateTasksAndSync` (the UI write path
 * for tasks, so only the signed-in user's own edits) to the status → timer rule. App sits outside
 * the TimeTrackingProvider, so it reports here and `TaskStatusTimerBridge` (inside the provider)
 * listens. Remote changes from sync or the poll never pass through `updateTasksAndSync`, so they
 * never reach the rule.
 */
import type { Task } from "../types/index.ts";

type Listener = (before: readonly Task[], after: readonly Task[]) => void;

let listener: Listener | null = null;
/**
 * `setTasks` updaters run twice under React StrictMode with the same previous array: each previous
 * array is handled once. Every real update has a different previous array.
 */
const handled = new WeakSet<readonly Task[]>();

/** Called by `updateTasksAndSync` with the tasks before and after a local edit. */
export const reportLocalTaskEdit = (before: readonly Task[], after: readonly Task[]): void => {
  if (!listener || before === after || handled.has(before)) return;
  handled.add(before);
  const run = listener;
  // Out of the state updater: the actions open popovers, call the API and show toasts.
  setTimeout(() => run(before, after), 0);
};

/** Registers the one listener; returns the unregister function. */
export const listenLocalTaskEdits = (next: Listener): (() => void) => {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
};
