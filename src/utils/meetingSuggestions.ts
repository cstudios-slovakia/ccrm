import type { Task } from "../types";

/*
  A meeting's task suggestion (`meeting_tasks`) becomes a real task when someone
  assigns it. The real task's id is derived from the suggestion's id, so the link
  is stored in the task row itself: no extra column, and a double click or two
  open tabs converge on one task instead of two.

  The "Created" badge used to be `!!assignedUser`, which lied whenever an
  assignee was set without a task being created (the details drawer did exactly
  that). It now asks whether the task actually exists.
*/

/** The id of the task created from a meeting suggestion. */
export const meetingSuggestionTaskId = (suggestionId: string): string => `task-mt-${suggestionId}`;

/**
 * True when the task created from this suggestion exists. Suggestions converted
 * before the id was derived (tasks named `task-ai-<timestamp>`) are matched on
 * title and assignee, best effort.
 */
export const isSuggestionConverted = (
  suggestion: { id: string; title: string; assignedUser?: string },
  tasks: Pick<Task, "id" | "title" | "owner" | "assignedUsers">[],
): boolean => {
  const linkedId = meetingSuggestionTaskId(suggestion.id);
  if (tasks.some((task) => task.id === linkedId)) return true;
  const assignee = suggestion.assignedUser || "";
  if (!assignee) return false;
  return tasks.some(
    (task) =>
      task.id.startsWith("task-ai-") &&
      task.title === suggestion.title &&
      (task.owner === assignee || (task.assignedUsers || []).includes(assignee)),
  );
};
