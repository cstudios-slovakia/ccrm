import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Surface } from "../../layout";
import type { WaaiClient } from "../api/waaiClient.ts";
import { WaaiApiError } from "../api/waaiClient.ts";
import { primaryButton, secondaryButton } from "../StateCard";
import { homeCopy } from "./copy";
import { selectAll, toggleSelected } from "./taskSelection";
import type { HomeTask, TasksResponse } from "./types";

type Filter = "all" | "open" | "completed";

export const TasksTab = ({
  client,
  language,
  onOpenRecord,
}: {
  client: WaaiClient;
  language: string;
  onOpenRecord: (kind: "lead" | "project" | "task", id: string) => void;
}) => {
  const t = homeCopy(language);
  const [filter, setFilter] = useState<Filter>("open");
  const [tasks, setTasks] = useState<HomeTask[]>([]);
  const [push, setPush] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const page = await client.get<TasksResponse>("/tasks", { query: filter === "all" ? {} : { status: filter } });
      setTasks(page.tasks);
      setPush(page.crm_push_enabled);
    } catch (err) {
      setError(err instanceof WaaiApiError ? err.message : t.failed);
    } finally {
      setBusy(false);
    }
  }, [client, filter, t.failed]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (ids: string[], action: "done" | "delete" | "crm") => {
    setBusy(true);
    setError(null);
    try {
      for (const id of ids) {
        if (action === "done") await client.patch(`/tasks/${id}`, { status: "completed" });
        else if (action === "delete") await client.del(`/tasks/${id}`);
        else await client.post(`/tasks/${id}/crm`, { action: "retry" });
      }
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err instanceof WaaiApiError ? err.message : t.failed);
      setBusy(false);
    }
  };

  const ids = tasks.map((task) => task.id);

  return (
    <Surface className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["open", "completed", "all"] as const).map((key) => (
          <button key={key} type="button" className={key === filter ? primaryButton : secondaryButton} onClick={() => setFilter(key)}>
            {t.tasks.filters[key]}
          </button>
        ))}
        <button type="button" className={secondaryButton} onClick={() => { setSelecting((v) => !v); setSelected(new Set()); }}>{t.tasks.select}</button>
      </div>
      {selecting ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="type-meta flex items-center gap-2 text-slate-600">
            <input type="checkbox" checked={ids.length > 0 && selected.size === ids.length} onChange={(e) => setSelected(selectAll(ids, e.target.checked))} />
            {t.tasks.select}
          </label>
          <button type="button" className={secondaryButton} disabled={selected.size === 0 || busy} onClick={() => void run([...selected], "done")}>{t.tasks.done}</button>
          <button type="button" className={secondaryButton} disabled={selected.size === 0 || busy} onClick={() => void run([...selected], "delete")}>{t.tasks.remove}</button>
        </div>
      ) : null}
      {busy && tasks.length === 0 ? <p className="type-body flex items-center gap-2 text-slate-500"><Loader2 className="size-4 animate-spin" />{t.loading}</p> : null}
      {error ? <p className="type-body text-rose-600">{error}</p> : null}
      {tasks.length === 0 && !busy ? <p className="type-body text-slate-500">{t.empty}</p> : null}
      <ul className="flex flex-col divide-y divide-slate-100">
        {tasks.map((task) => (
          <li key={task.id} className="flex flex-wrap items-start gap-3 py-3">
            {selecting ? (
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.has(task.id)}
                onChange={(e) => setSelected((cur) => toggleSelected(cur, task.id, e.target.checked))}
              />
            ) : (
              <input
                type="checkbox"
                className="mt-1"
                checked={task.status === "completed"}
                disabled={task.crm_linked && task.status === "completed"}
                onChange={(e) => void client.patch(`/tasks/${task.id}`, { status: e.target.checked ? "completed" : "open" }).then(() => load())}
                aria-label={t.tasks.done}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="type-body font-semibold text-slate-800">{task.title}</p>
              <p className="type-meta text-slate-500">
                {[task.assignee, task.conversation_title, task.due_at?.slice(0, 10)].filter(Boolean).join(" · ")}
              </p>
              {task.crm_error ? <p className="type-meta text-rose-600">{task.crm_error}</p> : null}
              {task.crm_linked ? <p className="type-meta text-slate-400">{t.tasks.linked}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {task.conversation_id ? (
                <a className={secondaryButton} href={`#whatsapp/c/${task.conversation_id}`}>{t.tasks.openChat}</a>
              ) : null}
              {task.crm_task_id ? (
                <button type="button" className={secondaryButton} onClick={() => onOpenRecord("task", task.crm_task_id!)}>{t.tasks.openCrm}</button>
              ) : null}
              {push && task.origin === "waai" && task.crm_sync_state !== "synced" ? (
                <button type="button" className={secondaryButton} onClick={() => void run([task.id], "crm")}>{t.tasks.send}</button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Surface>
  );
};
