import { useCallback, useEffect, useMemo, useState } from "react";
import type { TaskDto, TaskStatusRequest, TaskStatusValue } from "../api/contract.ts";
import { type WaaiClient, WaaiApiError } from "../api/waaiClient.ts";

export type TaskFilter = "open" | "completed" | "all";

export interface UseChatTasksOptions {
  client: WaaiClient;
  conversationId: string;
  active?: boolean;
  initialTasks?: TaskDto[];
}

export interface UseChatTasksReturn {
  tasks: TaskDto[];
  filter: TaskFilter;
  setFilter: (f: TaskFilter) => void;
  loading: boolean;
  error: string | null;
  filteredTasks: TaskDto[];
  openTasks: TaskDto[];
  completedTasks: TaskDto[];
  reload: () => Promise<void>;
  toggleStatus: (taskId: string, nextStatus: TaskStatusValue) => Promise<void>;
  setTasks: React.Dispatch<React.SetStateAction<TaskDto[]>>;
}

export function useChatTasks({
  client,
  conversationId,
  active = true,
  initialTasks,
}: UseChatTasksOptions): UseChatTasksReturn {
  const [tasks, setTasks] = useState<TaskDto[]>(initialTasks ?? []);
  const [filter, setFilter] = useState<TaskFilter>("open");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.get<{ tasks: TaskDto[] }>("/tasks", {
        query: {
          conversationId,
          conversation_id: conversationId,
        },
      });
      setTasks(res.tasks ?? []);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof WaaiApiError ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [client, conversationId]);

  useEffect(() => {
    if (active) {
      void reload();
    }
  }, [active, reload]);

  // If initialTasks changes from outside (e.g. fresh summary), merge or adopt
  useEffect(() => {
    if (initialTasks && initialTasks.length > 0) {
      setTasks((prev) => {
        // If we don't have tasks loaded yet, use initialTasks
        if (prev.length === 0) return initialTasks;
        // Otherwise merge updated tasks from summary
        const map = new Map(prev.map((t) => [t.id, t]));
        for (const t of initialTasks) {
          map.set(t.id, { ...map.get(t.id), ...t });
        }
        return Array.from(map.values());
      });
    }
  }, [initialTasks]);

  const toggleStatus = useCallback(
    async (taskId: string, nextStatus: TaskStatusValue) => {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: nextStatus,
                completed_at: nextStatus === "completed" ? new Date().toISOString() : null,
              }
            : t,
        ),
      );

      try {
        const body: TaskStatusRequest = { status: nextStatus };
        await client.patch<Partial<TaskDto>>(`/tasks/${encodeURIComponent(taskId)}`, body);
      } catch (err) {
        // Revert on error
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: nextStatus === "completed" ? "open" : "completed",
                }
              : t,
          ),
        );
        throw err;
      }
    },
    [client],
  );

  const openTasks = useMemo(() => tasks.filter((t) => t.status === "open"), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((t) => t.status === "completed"), [tasks]);

  const filteredTasks = useMemo(() => {
    if (filter === "open") return openTasks;
    if (filter === "completed") return completedTasks;
    return tasks;
  }, [filter, tasks, openTasks, completedTasks]);

  return {
    tasks,
    filter,
    setFilter,
    loading,
    error,
    filteredTasks,
    openTasks,
    completedTasks,
    reload,
    toggleStatus,
    setTasks,
  };
}
