import type { RecurringTaskTemplate, Task } from "../types";
import { requestTaskDeletion } from "./taskApi.ts";
import { runUndoable } from "./undoable.ts";
import { reinsertAt, removeByIds } from "./undoableList.ts";
import { singleMessage, undoLabel, type Lang } from "./undoMessages.ts";

const idOf = (task: Task | RecurringTaskTemplate) => task.id;

export function deleteRecurringOccurrenceWithUndo({
  occurrence,
  allTasks,
  setTasks,
  allTemplates,
  setRecurringTasks,
  choice,
  lang,
}: {
  occurrence: Task;
  allTasks: Task[];
  setTasks: (updater: (prev: Task[]) => Task[]) => void;
  allTemplates?: RecurringTaskTemplate[];
  setRecurringTasks?: (updater: (prev: RecurringTaskTemplate[]) => RecurringTaskTemplate[]) => void;
  choice: "only_this" | "all_future";
  lang: Lang;
}): void {
  const templateId = occurrence.recurringSourceId;

  if (choice === "only_this" || !templateId || !setRecurringTasks) {
    // Only delete this occurrence
    const ids = new Set([occurrence.id]);
    const { removed } = removeByIds(allTasks, ids, idOf);

    runUndoable({
      message: singleMessage(lang, "task", "delete", occurrence.title),
      undoLabel: undoLabel(lang),
      deletions: [{ key: "tasks", records: [occurrence] }],
      apply: () => {
        setTasks((prev) => prev.filter((t) => t.id !== occurrence.id));
      },
      revert: () => {
        setTasks((prev) => reinsertAt(prev, removed, idOf));
      },
      failureMessage:
        lang === "sk"
          ? "Úloha nebola odstránená"
          : lang === "hu"
            ? "A feladat nem lett törölve"
            : "Task was not deleted",
      onCommit: async () => {
        await requestTaskDeletion(occurrence.id);
      },
    });
    return;
  }

  // choice === 'all_future': delete occurrence + delete template + clear recurringSourceId on closed history
  const ids = new Set([occurrence.id]);
  const { removed } = removeByIds(allTasks, ids, idOf);
  const matchedTemplate = allTemplates?.find((t) => t.id === templateId) || null;
  const historyOccurrences = allTasks.filter(
    (t) => t.recurringSourceId === templateId && t.id !== occurrence.id
  );

  runUndoable({
    message:
      lang === "sk"
        ? `Séria "${occurrence.title}" bola ukončená`
        : lang === "hu"
          ? `A(z) "${occurrence.title}" sorozat leállítva`
          : `Series "${occurrence.title}" was stopped`,
    undoLabel: undoLabel(lang),
    deletions: [
      { key: "tasks", records: [occurrence] },
      ...(matchedTemplate ? [{ key: "recurringTasks", records: [matchedTemplate] }] : []),
    ],
    apply: () => {
      setTasks((prev) =>
        prev
          .filter((t) => t.id !== occurrence.id)
          .map((t) => (t.recurringSourceId === templateId ? { ...t, recurringSourceId: null } : t))
      );
      setRecurringTasks((prev) => prev.filter((t) => t.id !== templateId));
    },
    revert: () => {
      setTasks((prev) => {
        const reinserted = reinsertAt(prev, removed, idOf);
        return reinserted.map((t) => {
          if (historyOccurrences.some((h) => h.id === t.id)) {
            return { ...t, recurringSourceId: templateId };
          }
          return t;
        });
      });
      if (matchedTemplate) {
        setRecurringTasks((prev) => [matchedTemplate, ...prev.filter((t) => t.id !== templateId)]);
      }
    },
    failureMessage:
      lang === "sk"
        ? "Séria nebola odstránená"
        : lang === "hu"
          ? "A sorozat nem lett törölve"
          : "Series was not deleted",
    onCommit: async () => {
      await requestTaskDeletion(occurrence.id);
    },
  });
}

export function deleteRecurringSeriesWithUndo({
  template,
  allTasks,
  setTasks,
  setRecurringTasks,
  lang,
}: {
  template: RecurringTaskTemplate;
  allTasks: Task[];
  setTasks: (updater: (prev: Task[]) => Task[]) => void;
  setRecurringTasks: (updater: (prev: RecurringTaskTemplate[]) => RecurringTaskTemplate[]) => void;
  lang: Lang;
}): void {
  const openOccurrence = allTasks.find(
    (t) => t.recurringSourceId === template.id && t.status !== "Done" && !t.archived
  );
  const openId = openOccurrence?.id;
  const historyOccurrences = allTasks.filter(
    (t) => t.recurringSourceId === template.id && t.id !== openId
  );

  runUndoable({
    message:
      lang === "sk"
        ? `Séria "${template.title}" bola odstránená`
        : lang === "hu"
          ? `A(z) "${template.title}" sorozat törölve`
          : `Series "${template.title}" was deleted`,
    undoLabel: undoLabel(lang),
    deletions: [
      { key: "recurringTasks", records: [template] },
      ...(openOccurrence ? [{ key: "tasks", records: [openOccurrence] }] : []),
    ],
    apply: () => {
      setTasks((prev) =>
        prev
          .filter((t) => t.id !== openId)
          .map((t) => (t.recurringSourceId === template.id ? { ...t, recurringSourceId: null } : t))
      );
      setRecurringTasks((prev) => prev.filter((t) => t.id !== template.id));
    },
    revert: () => {
      setTasks((prev) => {
        const withOpen = openOccurrence ? [openOccurrence, ...prev] : prev;
        return withOpen.map((t) => {
          if (historyOccurrences.some((h) => h.id === t.id)) {
            return { ...t, recurringSourceId: template.id };
          }
          return t;
        });
      });
      setRecurringTasks((prev) => [template, ...prev.filter((t) => t.id !== template.id)]);
    },
    onCommit: async () => {
      if (openId) {
        await requestTaskDeletion(openId, { tolerateMissing: true });
      }
    },
  });
}

