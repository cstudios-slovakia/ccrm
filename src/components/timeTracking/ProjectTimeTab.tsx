import { useEffect, useState } from "react";
import { Play } from "lucide-react";
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

  return (
    <div className="flex flex-col gap-4" data-testid="project-time-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="type-metric tabular-nums text-slate-900">{formatDuration(seconds)}</div>
          <div className="type-meta text-slate-500">
            {project.hoursBudget ? t(`${hoursOf(seconds)} of ${project.hoursBudget} h budget`, `${hoursOf(seconds)} z ${project.hoursBudget} h rozpočtu`, `${hoursOf(seconds)} / ${project.hoursBudget} óra keret`) : t("Tracked on this project", "Zaznamenané na projekte", "A projekten rögzítve")}
            {totals?.cost != null ? ` · ${money(totals.cost)}` : ""}
          </div>
        </div>
        {tt.enabled && tt.viewer.canEdit && (
          <button
            type="button"
            data-testid="project-start-timer"
            onClick={() => void tt.start({ projectId: project.id, description: null, originType: "project", originId: project.id })}
            className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-ui font-semibold transition-all active:scale-95 cursor-pointer ${runningHere ? "bg-rose-600 text-white" : "bg-primary text-primary-foreground hover:opacity-90"}`}
          >
            <Play className="size-4 fill-current" />
            {t("Start timer on this project", "Spustiť časovač na tomto projekte", "Időzítő indítása ezen a projekten")}
          </button>
        )}
      </div>

      <div className="grid gap-3 ws-sm:grid-cols-3">
        <label className="grid gap-1">
          <span className="type-label text-slate-600">{t("Hours budget", "Rozpočet hodín", "Órakeret")}</span>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            onBlur={() => onPatch({ hoursBudget: budget.trim() === "" ? null : Number(budget) })}
            inputMode="decimal"
            className="h-10 rounded-xl border border-slate-200 px-3 text-ui tabular-nums outline-none focus:border-primary"
          />
        </label>
        <label className="grid gap-1">
          <span className="type-label text-slate-600">{t("Billable rate", "Fakturačná sadzba", "Számlázási díj")}</span>
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            onBlur={() => onPatch({ billableRate: rate.trim() === "" ? null : Number(rate) })}
            inputMode="decimal"
            className="h-10 rounded-xl border border-slate-200 px-3 text-ui tabular-nums outline-none focus:border-primary"
          />
        </label>
        <label className="flex items-end gap-2 pb-2 type-body text-slate-700">
          <input type="checkbox" checked={internal} onChange={(e) => { setInternal(e.target.checked); onPatch({ isInternal: e.target.checked }); }} />
          {t("Internal project", "Interný projekt", "Belső projekt")}
        </label>
      </div>

      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
        {entries.length === 0 && <li className="px-3 py-4 type-body text-slate-500">{t("No time logged yet.", "Zatiaľ žiadny zaznamenaný čas.", "Még nincs rögzített idő.")}</li>}
        {entries.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-ui">
            <span className="min-w-0 truncate text-slate-800">{e.title || t("Untitled", "Bez názvu", "Névtelen")}</span>
            <span className="shrink-0 tabular-nums text-slate-600">{e.running ? t("running", "beží", "fut") : formatDuration(e.durationSec)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
