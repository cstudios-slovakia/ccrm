/**
 * Deletes a task on the server. Deletion never rides on sync — sync.php does not
 * infer it from an omitted task — so the permission check in api/task.php
 * cannot be bypassed by a stale client. Throws when the server refused.
 */
export const requestTaskDeletion = async (taskId: string): Promise<void> => {
  const response = await fetch("/api/task.php", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: taskId }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true) {
    throw new Error(result.message || "Task deletion failed.");
  }
};
