import { useEffect, useState } from "react";
import { ListChecks, Play, Square, Timer, Wallet } from "lucide-react";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { formatDuration, hoursOf } from "../../utils/timeTracking.ts";
import { formatMoney } from "../../utils/currency";
import type { Language } from "../../utils/translations";
import type { Project } from "../../types";

/**
 * The project's Time tab: start a timer here, the hours budget against what was
 * tracked, and the entries the viewer may see.
 */
export function ProjectTimeTab({
  project,
  language,
  currency,
  onPatch,
}: {
  project: Project;
  language: Language;
  currency: string;
  onPatch: (patch: Partial<Project>) => void;
}) {
  const tt = useTimeTracking();
  const { entries } = useTimeEntries({ projectId: project.id, from: "2000-01-01", to: "2100-01-01" });
  const totals = tt.totals.byProject[project.id];
  const seconds = totals?.seconds ?? entries.reduce((sum, e) => sum + (e.durationSec ?? 0), 0);
  const [budget, setBudget] = useState(project.hoursBudget != null ? String(project.hoursBudget) : "");
  const [rate, setRate] = useState(project.billableRate != null ? String(project.billableRate) : "");
  const [internal, setInternal] = useState(!!project.isInternal);
  useEffect(() => {
    setBudget(project.hoursBudget != null ? String(project.hoursBudget) : "");
    setRate(project.billableRate != null ? String(project.billableRate) : "");
    setInternal(!!project.isInternal);
  }, [project.id, project.hoursBudget, project.billableRate, project.isInternal]);

  const t = tt.t;
  const money = (n: number) => formatMoney(n, currency, language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const runningHere = tt.running?.projectId === project.id && !tt.running.taskId;

  const inputClass = "w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-ui font-semibold text-slate-800 tabular-nums transition-colors duration-150 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";
  const blockClass = "p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3";

  return (
    <div className="space-y-4 text-left" data-testid="project-time-tab">
      {/* Block 1: what was tracked, and the timer */}
      <div className={blockClass}>
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-indigo-600 shrink-0" />
          <span className="text-ui font-bold text-slate-900">{t("Tracked time", "Zaznamenaný čas", "Rögzített idő")}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="type-metric tabular-nums text-slate-900">{formatDuration(seconds)}</div>
            <div className="text-caption font-medium text-slate-500">
              {project.hoursBudget ? t(`${hoursOf(seconds)} of ${project.hoursBudget} h budget`, `${hoursOf(seconds)} z ${project.hoursBudget} h rozpočtu`, `${hoursOf(seconds)} / ${project.hoursBudget} óra keret`) : t("Tracked on this project", "Zaznamenané na projekte", "A projekten rögzítve")}
              {totals?.cost != null ? ` · ${money(totals.cost)}` : ""}
            </div>
          </div>
          {tt.enabled && tt.viewer.canEdit && (
            <button
              type="button"
              data-testid="project-start-timer"
              onClick={() => {
                if (runningHere) void tt.stop();
                else void tt.start({ projectId: project.id, description: null, originType: "project", originId: project.id });
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-ui font-bold shadow-sm transition-all active:scale-95 cursor-pointer ${runningHere ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-primary text-primary-foreground hover:opacity-90"}`}
            >
              {runningHere ? <Square className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
              {runningHere
                ? t("Stop timer", "Zastaviť časovač", "Időzítő leállítása")
                : t("Start timer on this project", "Spustiť časovač na tomto projekte", "Időzítő indítása ezen a projekten")}
            </button>
          )}
        </div>
      </div>

      {/* Block 2: budget and rate */}
      <div className={blockClass}>
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="text-ui font-bold text-slate-900">{t("Budget & rate", "Rozpočet a sadzba", "Keret és díj")}</span>
        </div>
        <div className="grid gap-3 ws-sm:grid-cols-3">
          <label className="grid gap-1 content-start">
            <span className="block type-overline text-slate-400">{t("Hours budget", "Rozpočet hodín", "Órakeret")}</span>
            <input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              onBlur={() => onPatch({ hoursBudget: budget.trim() === "" ? null : Number(budget) })}
              inputMode="decimal"
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 content-start">
            <span className="block type-overline text-slate-400">{t("Billable rate", "Fakturačná sadzba", "Számlázási díj")}</span>
            <input
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              onBlur={() => onPatch({ billableRate: rate.trim() === "" ? null : Number(rate) })}
              inputMode="decimal"
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-2 ws-sm:self-end ws-sm:pb-2 text-ui font-semibold text-slate-700 cursor-pointer">
            <input type="checkbox" checked={internal} onChange={(e) => { setInternal(e.target.checked); onPatch({ isInternal: e.target.checked }); }} />
            {t("Internal project", "Interný projekt", "Belső projekt")}
          </label>
        </div>
      </div>

      {/* Block 3: the entries */}
      <div className={blockClass}>
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-purple-600 shrink-0" />
          <span className="text-ui font-bold text-slate-900">{t("Time entries", "Záznamy času", "Időbejegyzések")}</span>
          {entries.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-micro font-semibold tabular-nums bg-indigo-50 text-indigo-700 border border-indigo-200">{entries.length}</span>
          )}
        </div>
        {entries.length === 0 ? (
          <p className="p-3 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400 text-ui font-semibold">
            {t("No time logged yet.", "Zatiaľ žiadny zaznamenaný čas.", "Még nincs rögzített idő.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui">
                <span className="min-w-0 truncate font-semibold text-slate-800">{e.title || t("Untitled", "Bez názvu", "Névtelen")}</span>
                <span className="shrink-0 tabular-nums font-bold text-slate-600">{e.running ? t("running", "beží", "fut") : formatDuration(e.durationSec)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
