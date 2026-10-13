import type { Task } from "../types";
import { requestTaskDeletion } from "./taskApi.ts";
import { runUndoable } from "./undoable.ts";
import { pickFields, reinsertAt, removeByIds, restoreFields } from "./undoableList.ts";
import { bulkMessage, singleMessage, undoLabel, type Lang } from "./undoMessages.ts";

type SetTasks = (updater: (prev: Task[]) => Task[]) => void;

const ARCHIVE_FIELDS = ["archived"] as const;

const idOf = (task: Task) => task.id;

/**
 * Archives tasks now (strategy A) with one Undo for the lot. The snapshot holds
 * the exact previous `archived` value, so Undo leaves each task byte-identical.
 */
export function archiveTasksWithUndo({
  targets,
  setTasks,
  lang,
}: {
  targets: Task[];
  setTasks: SetTasks;
  lang: Lang;
}): void {
  if (targets.length === 0) return;
  const ids = new Set(targets.map(idOf));
  const snapshots = new Map(targets.map((task) => [task.id, pickFields(task, ARCHIVE_FIELDS)]));
  runUndoable({
    message:
      targets.length === 1
        ? singleMessage(lang, "task", "archive", targets[0].title)
        : bulkMessage(lang, "task", "archive", targets.length),
    undoLabel: undoLabel(lang),
    apply: () => setTasks((prev) => prev.map((task) => (ids.has(task.id) ? { ...task, archived: true } : task))),
    revert: () =>
      setTasks((prev) =>
        prev.map((task) =>
          ids.has(task.id) ? restoreFields(task, snapshots.get(task.id) ?? {}, ARCHIVE_FIELDS) : task
        )
      ),
  });
}

/**
 * Deletes tasks (strategy B + C). Tasks are not deleted through sync — the server
 * ignores omissions — but through `/api/task.php`, so the call is deferred to
 * commit. Until then the tasks are hidden locally and kept out of server pulls
 * (the pending-deletion registry), and Undo puts them back at their old index.
 *
 * `allTasks` is the full list the targets sit in, used for their original index.
 * Tasks the server refuses to delete come back with an error toast.
 */
export function deleteTasksWithUndo({
  allTasks,
  targets,
  setTasks,
  lang,
  onApplied,
  tolerateMissing = false,
}: {
  allTasks: Task[];
  targets: Task[];
  setTasks: SetTasks;
  lang: Lang;
  /** Runs right after the tasks left state — e.g. to clear a selection. */
  onApplied?: () => void;
  /** Treat a 404 from the server as "already deleted". */
  tolerateMissing?: boolean;
}): void {
  if (targets.length === 0) return;
  const ids = new Set(targets.map(idOf));
  const { removed } = removeByIds(allTasks, ids, idOf);
  runUndoable({
    message:
      targets.length === 1
        ? singleMessage(lang, "task", "delete", targets[0].title)
        : bulkMessage(lang, "task", "delete", targets.length),
    undoLabel: undoLabel(lang),
    deletions: [{ key: "tasks", records: targets }],
    apply: () => {
      setTasks((prev) => prev.filter((task) => !ids.has(task.id)));
      onApplied?.();
    },
    revert: () => setTasks((prev) => reinsertAt(prev, removed, idOf)),
    failureMessage:
      lang === "sk"
        ? "Úloha nebola odstránená"
        : lang === "hu"
          ? "A feladat nem lett törölve"
          : "Task was not deleted",
    onCommit: async () => {
      const results = await Promise.allSettled(targets.map((task) => requestTaskDeletion(task.id, { tolerateMissing })));
      const failed = results.flatMap((r, i) => (r.status === "rejected" ? [{ task: targets[i], reason: r.reason }] : []));
      if (failed.length === 0) return;
      // Everything failed: let runUndoable roll the whole action back.
      if (failed.length === targets.length) throw failed[0].reason;
      // Some failed: bring back just those, the rest are gone for good.
      const failedIds = new Set(failed.map((f) => f.task.id));
      setTasks((prev) =>
        reinsertAt(prev, removed.filter((r) => failedIds.has(r.item.id)), idOf)
      );
      const reason = failed[0].reason instanceof Error ? failed[0].reason.message : "";
      const head =
        lang === "sk"
          ? `${failed.length} úloh sa nepodarilo odstrániť`
          : lang === "hu"
            ? `${failed.length} feladatot nem sikerült törölni`
            : `${failed.length} tasks could not be deleted`;
      window.showToast?.(reason ? `${head} — ${reason}` : head, "error");
    },
  });
}
