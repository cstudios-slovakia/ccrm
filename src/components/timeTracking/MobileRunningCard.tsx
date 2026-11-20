import { CheckSquare, Euro } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { clockTime, elapsedSeconds, formatDuration, projectColor } from "../../utils/timeTracking.ts";
import { ClockDigits } from "./ClockDigits";
import { CycleRing } from "./CycleRing";
import { RoundTimerButton, roundButtonClass, roundButtonRadius } from "./RoundTimerButton";
import { projectClientName } from "./projectClient";
import { useTimeLookups, type TimeDeps } from "./shared";

interface Props {
  deps: TimeDeps;
  /** Shows the timer bar's own fields (project, task, billable) under the card. */
  editing: boolean;
  onToggleEdit: () => void;
}

/**
 * Phone only: the single running timer as one big card at the top of the page, in place of the slim
 * timer bar. The chips open the bar's fields so project, task and billable can be changed while it runs.
 */
export function MobileRunningCard({ deps, editing, onToggleEdit }: Props) {
  const { t, primaryRunning: running, running: all, nowMs, stop } = useTimeTracking();
  const lookups = useTimeLookups(deps);
  if (!running || all.length !== 1) return null;
  const task = running.taskId ? lookups.taskById.get(running.taskId) : undefined;
  const project = running.projectId ? lookups.projectName(running.projectId, running.projectName) : "";
  const client = running.projectId ? projectClientName(running.projectId, deps.projects, deps.leads) : null;
  const chip = "inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full px-3 text-ui font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  return (
    <div data-testid="mobile-running-card" className="rounded-3xl border border-rose-200 bg-white p-4 text-center shadow-sm ws-sm:hidden">
      <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 type-overline text-rose-600">
        <span className="size-2 animate-pulse rounded-full bg-rose-600 motion-reduce:animate-none" aria-hidden />
        {t(`Running since ${clockTime(running.startAt)}`, `Beží od ${clockTime(running.startAt)}`, `Fut ${clockTime(running.startAt)} óta`)}
      </span>
      <p className="mt-2 truncate type-card-title text-slate-900" data-testid="mobile-running-title">{running.title || t("No title", "Bez názvu", "Nincs cím")}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={onToggleEdit} aria-expanded={editing} data-testid="mobile-running-project" className={`${chip} bg-slate-100 text-slate-700`} title={client ? `${project} · ${client}` : project}>
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: projectColor(running.projectId) }} />
          <span className="truncate">{project || t("Assign project", "Priradiť projekt", "Projekt hozzárendelése")}</span>
        </button>
        {task && (
          <button type="button" onClick={onToggleEdit} aria-expanded={editing} className={`${chip} bg-slate-100 text-slate-500`} title={task.title}>
            <CheckSquare className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{task.title}</span>
          </button>
        )}
        {running.billable && (
          <button type="button" onClick={onToggleEdit} aria-expanded={editing} className={`${chip} bg-emerald-50 text-emerald-700`}>
            <Euro className="size-3.5 shrink-0" aria-hidden />
            {t("Billable", "Fakturovateľné", "Számlázható")}
          </button>
        )}
      </div>
      <ClockDigits value={formatDuration(elapsedSeconds(running.startAt, nowMs), true)} className="mt-3 text-metric text-slate-900" />
      <div className="mt-3 flex justify-center">
        <CycleRing swap radius={roundButtonRadius("xl")} buttonClass={roundButtonClass("xl")}>
          <RoundTimerButton kind="stop" size="xl" label={t("Stop", "Zastaviť", "Leállítás")} onClick={() => void stop(running.id)} data-testid="mobile-running-stop" />
        </CycleRing>
      </div>
      <p className="mt-2 type-meta text-slate-500">
        {editing
          ? t("Tap a chip again to hide the fields.", "Ďalším ťuknutím na čip polia skryjete.", "Újabb koppintásra a mezők elrejtődnek.")
          : t("Tap the project or task to change them while running.", "Ťuknutím na projekt alebo úlohu ich môžete zmeniť počas behu.", "Koppintson a projektre vagy feladatra, hogy futás közben módosítsa.")}
      </p>
    </div>
  );
}
