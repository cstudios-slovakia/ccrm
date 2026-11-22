import type { TaskActivityItem, TaskChatImage } from "../types";

const ENDPOINT = "/api/task_activity.php";

export interface TaskActivityPageResponse {
  items: TaskActivityItem[];
  hasMore: boolean;
  cursorUpdated: string;
  commentCount: number;
  taskReactions: Record<string, string[]>;
}

async function readJsonSafe(res: Response): Promise<Record<string, any>> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchTaskActivities(
  taskId: string,
  opts?: {
    limit?: number;
    beforeId?: number;
    afterId?: number;
    sinceUpdated?: string;
    signal?: AbortSignal;
  }
): Promise<TaskActivityPageResponse> {
  const params = new URLSearchParams();
  params.set("taskId", taskId);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.beforeId !== undefined) params.set("beforeId", String(opts.beforeId));
  if (opts?.afterId !== undefined) params.set("afterId", String(opts.afterId));
  if (opts?.sinceUpdated) params.set("sinceUpdated", opts.sinceUpdated);

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
    signal: opts?.signal,
  });
  const data = await readJsonSafe(res);
  return {
    items: Array.isArray(data.items) ? data.items : [],
    hasMore: Boolean(data.hasMore),
    cursorUpdated: typeof data.cursorUpdated === "string" ? data.cursorUpdated : "1970-01-01 00:00:00.000",
    commentCount: typeof data.commentCount === "number" ? data.commentCount : 0,
    taskReactions:
      data.taskReactions && typeof data.taskReactions === "object" && !Array.isArray(data.taskReactions)
        ? data.taskReactions
        : {},
  };
}

export async function uploadTaskChatImage(taskId: string, file: File): Promise<TaskChatImage> {
  const form = new FormData();
  form.append("action", "upload_image");
  form.append("taskId", taskId);
  form.append("file", file);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = await readJsonSafe(res);
  if (!data.image || typeof data.image.url !== "string") {
    throw new Error("Server did not return uploaded image metadata.");
  }
  return data.image as TaskChatImage;
}

export async function postTaskComment(
  taskId: string,
  payload: { body: string; images?: TaskChatImage[] }
): Promise<{ item: TaskActivityItem; commentCount: number }> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "post_comment",
      taskId,
      body: payload.body,
      images: payload.images || [],
    }),
  });
  const data = await readJsonSafe(res);
  return {
    item: data.item as TaskActivityItem,
    commentCount: typeof data.commentCount === "number" ? data.commentCount : 0,
  };
}

export async function editTaskComment(
  taskId: string,
  activityId: number,
  body: string
): Promise<TaskActivityItem> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "edit_comment",
      taskId,
      activityId,
      body,
    }),
  });
  const data = await readJsonSafe(res);
  return data.item as TaskActivityItem;
}

export async function deleteTaskComment(
  taskId: string,
  activityId: number
): Promise<{ deletedId: number; commentCount: number }> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "delete_comment",
      taskId,
      activityId,
    }),
  });
  const data = await readJsonSafe(res);
  return {
    deletedId: Number(data.deletedId ?? activityId),
    commentCount: typeof data.commentCount === "number" ? data.commentCount : 0,
  };
}

export async function toggleTaskMessageReaction(
  taskId: string,
  activityId: number,
  emoji: string
): Promise<Record<string, string[]>> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "toggle_message_reaction",
      taskId,
      activityId,
      emoji,
    }),
  });
  const data = await readJsonSafe(res);
  return data.reactions && typeof data.reactions === "object" ? data.reactions : {};
}

export async function toggleTaskReaction(
  taskId: string,
  emoji: string
): Promise<Record<string, string[]>> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "toggle_task_reaction",
      taskId,
      emoji,
    }),
  });
  const data = await readJsonSafe(res);
  return data.taskReactions && typeof data.taskReactions === "object" ? data.taskReactions : {};
}
