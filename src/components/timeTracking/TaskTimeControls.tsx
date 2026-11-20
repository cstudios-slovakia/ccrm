import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useProjectStatuses } from "../../hooks/useProjectStatuses";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { isClosedProjectStatus, projectStatusColor, projectStatusLabel } from "../../utils/projects";
import { clientForTask, resolveTaskProject } from "../../utils/timeLinks.ts";
import { clockTime, elapsedSeconds, formatDuration } from "../../utils/timeTracking.ts";
import { ClockDigits } from "./ClockDigits";
import { TimeApiError, timeErrorMessage, updateEntry } from "../../utils/timeTrackingApi.ts";
import type { Lead, Project, Task } from "../../types";
import { readTimeCreate, requestNewTimeEntry } from "./timeCreateBridge";
import { CustomSelect } from "../ui/CustomSelect";
import { StatTile } from "../layout/StatGrid";
import { RoundTimerButton } from "./RoundTimerButton";

/**
 * The round Start (or, while the viewer tracks this task, a rose banner with Stop), an optional Description
 * and the Tracked / Estimate tiles, in the task drawer's Time tracking section.
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
  // "Running" means this task is in the running set (D5.4).
  const runningHereList = tt.running.filter((e) => e.taskId === task.id);
  const runningEntry = runningHereList[0] ?? null;
  const runningHere = runningEntry !== null;
  const runningNote = runningEntry ? runningEntry.note ?? "" : null;
  // While the timer runs here the field mirrors the running entry.
  useEffect(() => {
    if (runningNote !== null) setNote(runningNote);
  }, [runningHere, runningNote]);
  if (!tt.enabled || !tt.viewer.canEdit) return null;

  const tracked = (tt.totals.byTask[task.id] ?? 0) + runningHereList.reduce((sum, e) => sum + elapsedSeconds(e.startAt, tt.nowMs), 0);
  const estimateSec = task.estimateMinutes && task.estimateMinutes > 0 ? task.estimateMinutes * 60 : null;
  const t = tt.t;

  const begin = async (projectId: string | null, remember: boolean, anchor?: Element | null) => {
    setAsk(null);
    if (remember && projectId) onSaveProject?.(task.id, projectId);
    const started = await tt.start({
      taskId: task.id,
      projectId,
      description: null,
      note: note.trim() || null,
      originType: "task",
      originId: task.id,
    }, { anchor });
    if (started) setNote("");
  };

  const commitNote = async () => {
    if (!runningEntry || note.trim() === (runningEntry.note ?? "").trim()) return;
    try {
      await updateEntry(runningEntry.id, { note: note.trim() || null });
      tt.bump();
    } catch (e) {
      tt.notify(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
    }
  };

  const onPlay = (anchor: Element) => {
    if (runningEntry) {
      void tt.stop(runningEntry.id);
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
    void begin(resolved.projectId, false, anchor);
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

  const banner = runningHereList.map((e, i) => (
    <span
      key={e.id}
      role="status"
      data-testid="task-time-banner"
      className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2"
    >
      <RoundTimerButton
        kind="stop"
        size="md"
        label={t("Stop timer", "Zastaviť časovač", "Időzítő leállítása")}
        data-testid={i === 0 ? "task-time-start" : "task-time-stop"}
        onClick={() => void tt.stop(e.id)}
      />
      <span className="grid min-w-0">
        <span className="type-label text-rose-800">
          {t("You are tracking this task", "Sledujete čas na tejto úlohe", "Ezen a feladaton követi az időt")} · {t("Started", "Začiatok", "Kezdés")} <span className="tabular-nums">{clockTime(e.startAt)}</span>
        </span>
        {e.title && e.title !== task.title && <span className="type-meta truncate text-rose-700">{e.title}</span>}
      </span>
    </span>
  ));

  const over = estimateSec !== null && tracked > estimateSec;
  const tiles = (
    <span className="grid grid-cols-2 gap-3">
      <StatTile
        label={t("Tracked", "Sledované", "Rögzített")}
        value={<span data-testid="task-time-chip" className="tabular-nums"><ClockDigits value={formatDuration(tracked)} /></span>}
        progress={estimateSec ? { value: (tracked / estimateSec) * 100, label: t("Tracked of estimate", "Sledované z odhadu", "Rögzített a becslésből") } : undefined}
        delta={
          estimateSec
            ? over
              ? <span className="text-rose-600">{t(`+${formatDuration(tracked - estimateSec)} over`, `+${formatDuration(tracked - estimateSec)} navyše`, `+${formatDuration(tracked - estimateSec)} túllépés`)}</span>
              : t(`${formatDuration(estimateSec - tracked)} left`, `zostáva ${formatDuration(estimateSec - tracked)}`, `${formatDuration(estimateSec - tracked)} maradt`)
            : undefined
        }
      />
      <StatTile
        label={t("Estimate", "Odhad", "Becslés")}
        value={estimateSec ? <span className="tabular-nums">{formatDuration(estimateSec)}</span> : <span className="text-slate-400">—</span>}
      />
    </span>
  );

  return (
    <span className="grid gap-3" onClick={(e) => e.stopPropagation()}>
      {banner}
      <span className="relative flex items-center gap-2">
        {!runningHere && (
          <RoundTimerButton
            kind="start"
            size="md"
            label={t("Start timer", "Spustiť časovač", "Időzítő indítása")}
            data-testid="task-time-start"
            onClick={(e) => {
              e.stopPropagation();
              onPlay(e.currentTarget);
            }}
          />
        )}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => void commitNote()}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (runningHere) (e.currentTarget as HTMLInputElement).blur();
            else onPlay(e.currentTarget);
          }}
          maxLength={1000}
          placeholder={t("Description (optional)", "Popis (voliteľné)", "Leírás (nem kötelező)")}
          aria-label={t("Description", "Popis", "Leírás")}
          data-testid="task-time-note"
          className="h-9 min-w-40 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-ui outline-none placeholder:text-slate-400 focus:border-primary"
        />
      {ask && (
        <span
          role="dialog"
          data-testid="task-project-popover"
          className="absolute left-0 top-full z-20 mt-1 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="type-label block text-slate-800">{t("Which project is this for?", "Pre ktorý projekt to je?", "Melyik projekthez tartozik?")}</span>
          {party && (
            <span className="type-meta mt-1 block text-slate-500">
              {t(
                `The task has no project, and ${party.name} has ${ask.length}. Pick one${onSaveProject ? " — it can also be saved on the task" : ""}.`,
                `Úloha nemá projekt a ${party.name} ich má ${ask.length}. Vyberte jeden${onSaveProject ? " — možno ho uložiť aj na úlohu" : ""}.`,
                `A feladatnak nincs projektje, ${party.name} ügyfélnek ${ask.length} van. Válasszon egyet${onSaveProject ? " — a feladatra is elmenthető" : ""}.`,
              )}
            </span>
          )}
          <span className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
            {ask.map((p) => (
              <button
                key={p.id}
                type="button"
                data-testid="task-project-option"
                onClick={() => void begin(p.id, saveOnTask)}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-ui font-semibold text-slate-700 transition hover:bg-teal-50 cursor-pointer"
              >
                <span className="min-w-0 truncate">{p.name || p.id}</span>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-micro font-semibold" style={{ color: projectStatusColor(p.status, statuses), backgroundColor: `${projectStatusColor(p.status, statuses)}1a` }}>
                  {projectStatusLabel(p.status, t, statuses)}
                </span>
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
                <CustomSelect
                  searchable
                  size="sm"
                  value={newType}
                  onChange={setNewType}
                  searchPlaceholder={t("Search project type…", "Hľadať typ projektu…", "Projekttípus keresése…")}
                  options={readTimeCreate().projectTypes.map((pt) => ({ value: pt.id, label: pt.name }))}
                />
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
      {tiles}
    </span>
  );
}

/** "+ Add time manually" in the task drawer's Time tracking header: a new entry for this task, today. Same gate as the start button. */
export function TaskAddTimeLink({ task, projects, leads }: { task: Task; projects: Project[]; leads: Lead[] }) {
  const tt = useTimeTracking();
  const statuses = useProjectStatuses();
  if (!tt.enabled || !tt.viewer.canEdit) return null;
  return (
    <button
      type="button"
      data-testid="task-add-time"
      onClick={() => {
        const resolved = resolveTaskProject(task, projects, leads, (p) => isClosedProjectStatus(p.status, statuses));
        requestNewTimeEntry({ taskId: task.id, projectId: resolved.projectId });
      }}
      className="ml-auto inline-flex items-center gap-1 type-meta font-semibold text-primary hover:underline cursor-pointer"
    >
      <Plus className="size-3.5 shrink-0" />
      {tt.t("Add time manually", "Pridať čas ručne", "Idő felvétele kézzel")}
    </button>
  );
}
