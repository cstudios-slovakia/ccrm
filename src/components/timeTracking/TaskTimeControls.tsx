import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { clockTime, elapsedSeconds, formatDuration } from "../../utils/timeTracking.ts";
import { ClockDigits } from "./ClockDigits";
import { TimeApiError, timeErrorMessage, updateEntry } from "../../utils/timeTrackingApi.ts";
import type { Lead, Project, Task } from "../../types";
import { requestNewTimeEntry } from "./timeCreateBridge";
import { entityAccentStyle } from "../../utils/entityAccent";
import { StatTile } from "../layout/StatGrid";
import { RoundTimerButton } from "./RoundTimerButton";

/**
 * The round Start (or, while the viewer tracks this task, a rose banner with Stop), an optional Description
 * and the Tracked / Estimate tiles, in the task drawer's Time tracking section.
 * (Task cards in the lists carry no timer: tracking starts and stops from the task's edit view.)
 * Tasks are primary: a task with no project/client starts immediately and stays unsorted until attached.
 */
export function TaskTimeControls({
  task,
}: {
  task: Task;
  projects?: Project[];
  leads?: Lead[];
  onSaveProject?: (taskId: string, projectId: string) => void;
}) {
  const tt = useTimeTracking();
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

  const commitNote = async () => {
    if (!runningEntry || note.trim() === (runningEntry.note ?? "").trim()) return;
    try {
      await updateEntry(runningEntry.id, { note: note.trim() || null });
      tt.bump();
    } catch (e) {
      tt.notify(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
    }
  };

  const onPlay = async (anchor: Element) => {
    if (runningEntry) {
      await tt.stop(runningEntry.id);
      return;
    }
    const started = await tt.start(
      {
        taskId: task.id,
        description: null,
        note: note.trim() || null,
        originType: "task",
        originId: task.id,
      },
      { anchor },
    );
    if (started) setNote("");
  };

  const banner = runningHereList.map((e, i) => (
    <span
      key={e.id}
      role="status"
      data-testid="task-time-banner"
      className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2"
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
        value={estimateSec ? <span className="tabular-nums">{formatDuration(estimateSec)}</span> : <span className="text-gray-400">—</span>}
      />
    </span>
  );

  return (
    <span style={entityAccentStyle("time-tracking") as React.CSSProperties} className="grid gap-3" onClick={(e) => e.stopPropagation()}>
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
            else void onPlay(e.currentTarget);
          }}
          maxLength={1000}
          placeholder={t("Description (optional)", "Popis (voliteľné)", "Leírás (nem kötelező)")}
          aria-label={t("Description", "Popis", "Leírás")}
          data-testid="task-time-note"
          className="h-9 min-w-40 flex-1 rounded-md border border-gray-200 bg-white px-3 text-ui outline-none placeholder:text-gray-400 focus:border-entity"
        />
      </span>
      {tiles}
    </span>
  );
}

/** "+ Add time manually" in the task drawer's Time tracking header: a new entry for this task, today. Same gate as the start button. */
export function TaskAddTimeLink({ task }: { task: Task; projects?: Project[]; leads?: Lead[] }) {
  const tt = useTimeTracking();
  if (!tt.enabled || !tt.viewer.canEdit) return null;
  return (
    <button
      type="button"
      style={entityAccentStyle("time-tracking") as React.CSSProperties}
      data-testid="task-add-time"
      onClick={() => {
        requestNewTimeEntry({ taskId: task.id, projectId: task.relatedProjectId || null });
      }}
      className="ml-auto inline-flex items-center gap-1 type-meta font-semibold text-entity-text hover:underline cursor-pointer"
    >
      <Plus className="size-3.5 shrink-0" />
      {tt.t("Add time manually", "Pridať čas ručne", "Idő felvétele kézzel")}
    </button>
  );
}
