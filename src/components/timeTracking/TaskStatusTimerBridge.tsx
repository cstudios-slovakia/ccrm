import { useEffect, useRef } from "react";
import { useTimeTracking, type TimeTrackingContextValue } from "../../hooks/useTimeTracking";
import { useTimeLookups, type TimeDeps } from "./shared";
import { planStatusTimerActions } from "../../utils/taskStatusTimer.ts";
import { listenLocalTaskEdits } from "../../utils/taskStatusTimerHook.ts";
import type { Task } from "../../types";

/**
 * Time tracking v2, phase 8 (D10.2, C14): when the signed-in user changes a task's status in this
 * browser, the mapped action runs on THEIR OWN timer on that task; nobody else's is touched.
 * App reports its local task edits (`reportLocalTaskEdit` in `updateTasksAndSync`); this component
 * sits inside the TimeTrackingProvider and runs the plan through it:
 *  - start: the task ▶ path (same project rules, "Which project?", the start-while-running
 *    preference or popover, Undo toast)
 *  - pause: pauses the running item, `pause_reason` 'status'; Undo resumes it
 *  - stop:  stops the running or paused item, `end_reason` 'status'; "require a project" applies
 * Renders nothing.
 */
export function TaskStatusTimerBridge({ deps, actions }: { deps: TimeDeps; actions?: unknown }) {
  const tt = useTimeTracking();
  const lookups = useTimeLookups(deps);
  const latest = useRef({ tt, lookups, deps, actions });
  latest.current = { tt, lookups, deps, actions };

  useEffect(
    () =>
      listenLocalTaskEdits((before, after) => {
        const { tt, lookups, deps, actions } = latest.current;
        void runStatusTimerActions(tt, lookups.resolveTaskProject, deps, actions, before, after);
      }),
    [],
  );
  return null;
}

async function runStatusTimerActions(
  tt: TimeTrackingContextValue,
  _resolveTaskProject: ReturnType<typeof useTimeLookups>["resolveTaskProject"],
  deps: TimeDeps,
  actions: unknown,
  before: readonly Task[],
  after: readonly Task[],
): Promise<void> {
  // Refresh time totals and open time views whenever a task's project, client, or title changes.
  const beforeById = new Map(before.map((x) => [x.id, x]));
  const linkChanged = after.some((next) => {
    const prev = beforeById.get(next.id);
    if (!prev) return false;
    return (
      (prev.relatedProjectId ?? null) !== (next.relatedProjectId ?? null) ||
      (prev.relatedLeadId ?? null) !== (next.relatedLeadId ?? null) ||
      prev.title !== next.title
    );
  });
  if (linkChanged && typeof window !== "undefined") {
    window.setTimeout(() => tt.bump(), 600);
  }

  const plan = planStatusTimerActions({
    before,
    after,
    map: actions ?? {},
    userId: tt.userId,
    userName: (deps.currentUser.name || "").trim(),
    running: tt.running,
    paused: tt.paused,
    canTrack: tt.enabled && tt.viewer.canEdit,
  });
  const { t } = tt;
  const byId = new Map(after.map((x) => [x.id, x]));
  for (const step of plan) {
    const task = byId.get(step.taskId);
    if (!task) continue;
    const name = task.title || "…";
    if (step.action === "start") {
      await tt.start(
        { taskId: task.id, projectId: task.relatedProjectId || null, description: null, originType: "task", originId: task.id },
        {
          anchor: null,
          notice: () => t(`Timer started for “${name}”.`, `Časovač spustený pre „${name}“.`, `Időzítő elindítva: „${name}”.`),
        },
      );
    } else if (step.action === "pause" && step.entryId) {
      const entryId = step.entryId;
      if (!(await tt.pause(entryId, { reason: "status" }))) continue;
      const message = t(`Timer paused for “${name}”.`, `Časovač pozastavený pre „${name}“.`, `Időzítő szüneteltetve: „${name}”.`);
      if (typeof window !== "undefined" && window.showUndoToast) {
        window.showUndoToast({
          message,
          undoLabel: t("Undo", "Späť", "Visszavonás"),
          onUndo: () => void tt.resume(entryId),
          onCommit: () => {},
        });
      } else {
        tt.notify(message);
      }
    } else if (step.action === "stop" && step.entryId) {
      if (await tt.stop(step.entryId, { reason: "status" })) {
        tt.notify(t(`Timer stopped for “${name}”.`, `Časovač zastavený pre „${name}“.`, `Időzítő leállítva: „${name}”.`));
      }
    }
  }
}
