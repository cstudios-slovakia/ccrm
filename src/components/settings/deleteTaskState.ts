// Settings → Projects → Task states: deleting one status, with undo. Moved out of SettingsView.tsx
// (size-capped) so the status's colour and timer action (TT2 D10.1) cascade in one place.

import type React from "react";
import { isDoneMarkerState } from "../../utils/projectTasks";
import { removeTimerActionKey, type TaskStateTimerActions } from "../../utils/taskStateTimerActions";
import { runUndoable } from "../../utils/undoable";
import { reinsertAt } from "../../utils/undoableList";
import { singleMessage, undoLabel, type Lang } from "../../utils/undoMessages";

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

export interface DeleteTaskStateArgs {
  state: string;
  taskStates: string[];
  taskStateColors: Record<string, string>;
  taskStateTimerActions: TaskStateTimerActions;
  setTaskStates: Setter<string[]>;
  setTaskStateColors: Setter<Record<string, string>>;
  setTaskStateTimerActions: Setter<TaskStateTimerActions>;
  lang: Lang;
  t: (en: string, sk: string, hu: string) => string;
}

const toast = (msg: string) => (window as any).showToast(msg);

/** Refuses the only status and the done marker; otherwise deletes the status, its colour and its timer action, undoably. */
export function deleteTaskState(a: DeleteTaskStateArgs): void {
  const { state, taskStates } = a;
  if (taskStates.length <= 1) {
    toast(a.lang === "sk" ? "Pre správne fungovanie je potrebný aspoň jeden stav úlohy!" : "At least one task state is required!");
    return;
  }
  // The last state is what marks a task done. Deleting it would make the state before it "done"
  // and reopen every finished task, so it can only be renamed.
  if (isDoneMarkerState(state, taskStates)) {
    toast(a.t(
      "This state marks tasks as done. Rename it instead of deleting it.",
      "Tento stav označuje úlohy ako hotové. Namiesto vymazania ho premenujte.",
      "Ez az állapot jelöli a feladatokat késznek. Törlés helyett nevezze át."
    ));
    return;
  }
  const index = taskStates.indexOf(state);
  const color = a.taskStateColors[state];
  const action = a.taskStateTimerActions[state];
  runUndoable({
    message: singleMessage(a.lang, "status", "delete", state),
    undoLabel: undoLabel(a.lang),
    apply: () => {
      a.setTaskStates(taskStates.filter((s) => s !== state));
      a.setTaskStateColors((prev) => {
        const next = { ...prev };
        delete next[state];
        return next;
      });
      a.setTaskStateTimerActions((prev) => removeTimerActionKey(prev, state));
    },
    revert: () => {
      a.setTaskStates((prev) => (prev.includes(state) ? prev : reinsertAt(prev, [{ item: state, index }], (s) => s)));
      if (color !== undefined) a.setTaskStateColors((prev) => ({ ...prev, [state]: color }));
      if (action) a.setTaskStateTimerActions((prev) => ({ ...prev, [state]: action }));
    },
  });
}
