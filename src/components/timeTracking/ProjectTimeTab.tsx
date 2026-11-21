import { useEffect, useState } from "react";
import { ListChecks, Play, Plus, Square, Timer, Wallet } from "lucide-react";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { requestNewTimeEntry } from "./timeCreateBridge";
import { clockTime, formatDuration, hoursOf } from "../../utils/timeTracking.ts";
import { formatMoney } from "../../utils/currency";
import { localeCodeFor } from "../../utils/localTime";
import type { Language } from "../../utils/translations";
import type { Project, UserProfile } from "../../types";
import { entityAccentStyle } from "../../utils/entityAccent";

/**
 * The project's Time tab: start a timer here, the hours budget against what was
 * tracked, and the entries the viewer may see: the whole team's with
 * time_tracking_team, otherwise their own. Entries imported from Toggl carry a badge.
 */
export function ProjectTimeTab({
  project,
  language,
  currency,
  users,
  onPatch,
}: {
  project: Project;
  language: Language;
  currency: string;
  users: UserProfile[];
  onPatch: (patch: Partial<Project>) => void;
}) {
  const tt = useTimeTracking();
  const { entries } = useTimeEntries({
    projectId: project.id,
    from: "2000-01-01",
    to: "2100-01-01",
    ...(tt.viewer.canTeam ? { userId: "all" } : {}),
  });
  /** Someone else's entry names its person; the viewer's own stay unlabelled. */
  const personOf = (userId: string) =>
    userId && userId !== tt.userId ? users.find((u) => u.id === userId)?.name || tt.t("Unknown", "Neznámy", "Ismeretlen") : "";
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
  const dateLabel = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(localeCodeFor(language), { day: "numeric", month: "numeric", year: "numeric" });
  };
  const money = (n: number) => formatMoney(n, currency, language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const runningHere = tt.running?.projectId === project.id && !tt.running.taskId;

  const inputClass = "w-full px-3 py-2 rounded-md border border-gray-200 bg-white text-ui font-semibold text-gray-800 tabular-nums transition-colors duration-150 focus:outline-none focus:border-entity focus:ring-2 focus:ring-entity-ring";
  const blockClass = "p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-3";

  return (
    <div className="space-y-4 text-left" data-testid="project-time-tab">
      {/* Block 1: what was tracked, and the timer */}
      <div className={blockClass} style={entityAccentStyle("time-tracking") as React.CSSProperties}>
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-entity-text shrink-0" />
          <span className="text-ui font-bold text-gray-900">{t("Tracked time", "Zaznamenaný čas", "Rögzített idő")}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="type-metric tabular-nums text-gray-900">{formatDuration(seconds)}</div>
            <div className="text-caption font-medium text-gray-500">
              {project.hoursBudget ? t(`${hoursOf(seconds)} of ${project.hoursBudget} h budget`, `${hoursOf(seconds)} z ${project.hoursBudget} h rozpočtu`, `${hoursOf(seconds)} / ${project.hoursBudget} óra keret`) : t("Tracked on this project", "Zaznamenané na projekte", "A projekten rögzítve")}
              {totals?.cost != null ? ` · ${money(totals.cost)}` : ""}
            </div>
          </div>
          {tt.enabled && tt.viewer.canEdit && (
            <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="project-add-time"
              onClick={() => requestNewTimeEntry({ projectId: project.id })}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-ui font-bold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="size-4" />
              {t("Add time", "Pridať čas", "Idő felvétele")}
            </button>
            <button
              type="button"
              data-testid="project-start-timer"
              onClick={() => {
                if (runningHere) void tt.stop();
                else void tt.start({ projectId: project.id, description: null, originType: "project", originId: project.id });
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-ui font-bold shadow-2xs transition-all active:scale-95 cursor-pointer ${runningHere ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-entity-solid hover:bg-entity-solid-hover text-white"}`}
            >
              {runningHere ? <Square className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
              {runningHere
                ? t("Stop timer", "Zastaviť časovač", "Időzítő leállítása")
                : t("Start timer on this project", "Spustiť časovač na tomto projekte", "Időzítő indítása ezen a projekten")}
            </button>
            </div>
          )}
        </div>
      </div>

      {/* Block 2: budget and rate */}
      <div className={blockClass}>
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="text-ui font-bold text-gray-900">{t("Budget & rate", "Rozpočet a sadzba", "Keret és díj")}</span>
        </div>
        <div className="grid gap-3 ws-sm:grid-cols-3">
          <label className="grid gap-1 content-start">
            <span className="block type-overline text-gray-400">{t("Hours budget", "Rozpočet hodín", "Órakeret")}</span>
            <input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              onBlur={() => onPatch({ hoursBudget: budget.trim() === "" ? null : Number(budget) })}
              inputMode="decimal"
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 content-start">
            <span className="block type-overline text-gray-400">{t("Billable rate", "Fakturačná sadzba", "Számlázási díj")}</span>
            <input
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              onBlur={() => onPatch({ billableRate: rate.trim() === "" ? null : Number(rate) })}
              inputMode="decimal"
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-2 ws-sm:self-end ws-sm:pb-2 text-ui font-semibold text-gray-700 cursor-pointer">
            <input type="checkbox" checked={internal} onChange={(e) => { setInternal(e.target.checked); onPatch({ isInternal: e.target.checked }); }} />
            {t("Internal project", "Interný projekt", "Belső projekt")}
          </label>
        </div>
      </div>

      {/* Block 3: the entries */}
      <div className={blockClass} style={entityAccentStyle("time-tracking") as React.CSSProperties}>
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-entity-text shrink-0" />
          <span className="text-ui font-bold text-gray-900">{t("Time entries", "Záznamy času", "Időbejegyzések")}</span>
          {entries.length > 0 && (
            <span className="px-2 py-0.5 rounded-md text-micro font-semibold tabular-nums bg-entity-subtle text-entity-text border border-entity-border">{entries.length}</span>
          )}
        </div>
        {entries.length === 0 ? (
          <p className="p-3 border-2 border-dashed border-gray-200 rounded-lg text-center text-gray-400 text-ui font-semibold">
            {t("No time logged yet.", "Zatiaľ žiadny zaznamenaný čas.", "Még nincs rögzített idő.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => {
              const span = e.startAt ? `${clockTime(e.startAt)}${e.endAt ? `–${clockTime(e.endAt)}` : ""}` : "";
              return (
                <li key={e.id} data-testid="project-time-entry" className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-white border border-gray-200 text-ui">
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate font-semibold text-gray-800">{e.title || e.note || t("No description", "Bez popisu", "Nincs leírás")}</span>
                      {e.source === "toggl" && (
                        <span
                          data-testid="project-time-entry-toggl"
                          title={t("Imported from Toggl", "Importované z Toggl", "Togglból importálva")}
                          className="shrink-0 px-1.5 py-px rounded-md text-micro font-bold bg-rose-50 text-rose-700 border border-rose-200"
                        >
                          Toggl
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-caption font-medium text-gray-500 tabular-nums">
                      {dateLabel(e.entryDate)}
                      {span ? ` · ${span}` : ""}
                      {personOf(e.userId) ? ` · ${personOf(e.userId)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums font-bold text-gray-600">
                    {e.running ? t("running", "beží", "fut") : formatDuration(e.durationSec, (e.durationSec ?? 0) > 0 && (e.durationSec ?? 0) < 60)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
