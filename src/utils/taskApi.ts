/**
 * Deletes a task on the server. Deletion never rides on sync — sync.php does not
 * infer it from an omitted task — so the permission check in api/task.php
 * cannot be bypassed by a stale client. Throws when the server refused.
 */
export const requestTaskDeletion = async (
  taskId: string,
  options: { tolerateMissing?: boolean } = {},
): Promise<void> => {
  const response = await fetch("/api/task.php", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: taskId }),
  });
  const result = await response.json().catch(() => ({}));
  // 404 = already gone (created a moment ago and not synced yet, or deleted from
  // another screen): the user's intent is met, so callers may treat it as success.
  if (options.tolerateMissing && response.status === 404) return;
  if (!response.ok || result.success !== true) {
    throw new Error(result.message || "Task deletion failed.");
  }
};
