import { useEffect, useState } from "react";
import { Play, Plus, Square } from "lucide-react";
import { useProjectStatuses } from "../../hooks/useProjectStatuses";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { isClosedProjectStatus } from "../../utils/projects";
import { clientForTask, resolveTaskProject } from "../../utils/timeLinks.ts";
import { elapsedSeconds, formatDuration } from "../../utils/timeTracking.ts";
import { TimeApiError, timeErrorMessage, updateEntry } from "../../utils/timeTrackingApi.ts";
import type { Lead, Project, Task } from "../../types";
import { readTimeCreate } from "./timeCreateBridge";

/**
 * ▶, the tracked-time chip and an optional Description, in the task drawer's Time tracking section.
 * (Task cards in the lists carry no timer: tracking starts and stops from the task's edit view.)
 * A task with several projects asks which one before the timer starts. The Description is typed
 * before ▶ and travels with the new entry; while the timer runs here the field edits that entry.
 */
export function TaskTimeControls({
  task,
  projects,
  leads,
  onSaveProject,
}: {
  task: Task;
  projects: Project[];
  leads: Lead[];
  /** Writes the chosen project onto the task ("Save the project on the task"). */
  onSaveProject?: (taskId: string, projectId: string) => void;
}) {
  const tt = useTimeTracking();
  const statuses = useProjectStatuses();
  const [ask, setAsk] = useState<Project[] | null>(null);
  const [saveOnTask, setSaveOnTask] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");
  const [note, setNote] = useState("");
  const runningHere = tt.running?.taskId === task.id;
  const runningNote = runningHere ? tt.running?.note ?? "" : null;
  // While the timer runs here the field mirrors the running entry.
  useEffect(() => {
    if (runningNote !== null) setNote(runningNote);
  }, [runningHere, runningNote]);
  if (!tt.enabled || !tt.viewer.canEdit) return null;

  const tracked = (tt.totals.byTask[task.id] ?? 0) + (runningHere ? elapsedSeconds(tt.running?.startAt ?? null, tt.nowMs) : 0);
  const t = tt.t;

  const begin = async (projectId: string | null, remember: boolean) => {
    setAsk(null);
    if (remember && projectId) onSaveProject?.(task.id, projectId);
    const started = await tt.start({
      taskId: task.id,
      projectId,
      description: null,
      note: note.trim() || null,
      originType: "task",
      originId: task.id,
    });
    if (started) setNote("");
  };

  const commitNote = async () => {
    if (!runningHere || !tt.running || note.trim() === (tt.running.note ?? "").trim()) return;
    try {
      await updateEntry(tt.running.id, { note: note.trim() || null });
      tt.bump();
    } catch (e) {
      tt.notify(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
    }
  };

  const onPlay = () => {
    if (runningHere) {
      void tt.stop();
      return;
    }
    const resolved = resolveTaskProject(task, projects, leads, (p) => isClosedProjectStatus(p.status, statuses));
    if (!resolved.projectId && resolved.candidates.length > 1) {
      setAsk(resolved.candidates);
      setSaveOnTask(true);
      setCreating(false);
      setNewName("");
      setNewType(readTimeCreate().projectTypes[0]?.id ?? "");
      return;
    }
    void begin(resolved.projectId, false);
  };

  const party = clientForTask(task, leads);
  const canCreate = !!readTimeCreate().onCreateProject && !!party?.id;
  const createForClient = () => {
    const create = readTimeCreate().onCreateProject;
    const name = newName.trim();
    if (!create || !party?.id || !name || !newType) return;
    const made = create({ name, clientId: party.id, projectTypeId: newType });
    if (made) void begin(made.id, saveOnTask);
  };

  const button = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPlay();
      }}
      data-testid="task-time-start"
      title={runningHere ? t("Stop timer", "Zastaviť časovač", "Időzítő leállítása") : t("Start timer", "Spustiť časovač", "Időzítő indítása")}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-lg transition-all cursor-pointer active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 ${
        runningHere ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-primary text-primary-foreground hover:opacity-90"
      }`}
    >
      {runningHere ? <Square className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
    </button>
  );

  const chip = (
    <span data-testid="task-time-chip" className="inline-flex items-center rounded-md bg-teal-50 px-1.5 py-0.5 type-overline tabular-nums text-teal-800">
      {formatDuration(tracked)}
      {task.estimateMinutes ? <span className="text-teal-600"> / {formatDuration(task.estimateMinutes * 60)}</span> : null}
    </span>
  );

  return (
    <span className="relative flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {button}
      {chip}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => void commitNote()}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (runningHere) (e.currentTarget as HTMLInputElement).blur();
          else onPlay();
        }}
        maxLength={1000}
        placeholder={t("Description (optional)", "Popis (voliteľné)", "Leírás (nem kötelező)")}
        aria-label={t("Description", "Popis", "Leírás")}
        data-testid="task-time-note"
        className="h-9 min-w-40 flex-1 basis-full rounded-xl border border-slate-200 bg-white px-3 text-ui outline-none placeholder:text-slate-400 focus:border-primary"
      />
      {ask && (
        <span
          role="dialog"
          data-testid="task-project-popover"
          className="absolute left-0 top-full z-20 mt-1 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="type-label block text-slate-800">{t("Which project is this for?", "Pre ktorý projekt to je?", "Melyik projekthez tartozik?")}</span>
          <span className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
            {ask.map((p) => (
              <button
                key={p.id}
                type="button"
                data-testid="task-project-option"
                onClick={() => void begin(p.id, saveOnTask)}
                className="rounded-lg px-2 py-1.5 text-left text-ui font-semibold text-slate-700 transition hover:bg-teal-50 cursor-pointer"
              >
                {p.name || p.id}
              </button>
            ))}
          </span>
          <label className="mt-2 flex items-center gap-2 type-meta text-slate-600">
            <input type="checkbox" checked={saveOnTask} onChange={(e) => setSaveOnTask(e.target.checked)} />
            {t("Save the project on the task", "Uložiť projekt na úlohu", "Projekt mentése a feladatra")}
          </label>
          {canCreate && party && !creating && (
            <button
              type="button"
              data-testid="task-create-project"
              onClick={() => {
                setCreating(true);
                setNewType((id) => id || readTimeCreate().projectTypes[0]?.id || "");
              }}
              className="mt-2 inline-flex items-center gap-1.5 text-left text-ui font-semibold text-primary hover:underline cursor-pointer"
            >
              <Plus className="size-4 shrink-0" />
              {t(`Create project for ${party.name}`, `Vytvoriť projekt pre ${party.name}`, `Projekt létrehozása: ${party.name}`)}
            </button>
          )}
          {canCreate && party && creating && (
            <form
              className="mt-2 grid gap-2 rounded-xl bg-slate-50 p-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                createForClient();
              }}
            >
              <span className="type-meta text-slate-600">{party.name}</span>
              <label className="grid gap-1">
                <span className="type-overline text-slate-500">{t("Project name", "Názov projektu", "Projekt neve")}</span>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  data-testid="task-create-project-name"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-ui outline-none focus:border-primary"
                />
              </label>
              <label className="grid gap-1">
                <span className="type-overline text-slate-500">{t("Project type", "Typ projektu", "Projekt típusa")}</span>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-ui"
                >
                  {readTimeCreate().projectTypes.map((pt) => (
                    <option key={pt.id} value={pt.id}>{pt.name}</option>
                  ))}
                </select>
              </label>
              <span className="flex justify-end gap-2">
                <button type="button" onClick={() => setCreating(false)} className="h-9 rounded-lg px-3 text-ui font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer">
                  {t("Cancel", "Zrušiť", "Mégse")}
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim() || !newType}
                  data-testid="task-create-project-submit"
                  className="h-9 rounded-lg bg-primary px-3 text-ui font-semibold text-primary-foreground disabled:opacity-50 cursor-pointer"
                >
                  {t("Create", "Vytvoriť", "Létrehozás")}
                </button>
              </span>
            </form>
          )}
        </span>
      )}
    </span>
  );
}
