import { useEffect, useMemo, useState } from "react";
import { Download, ListChecks, Play, Plus, Square, Wallet } from "lucide-react";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { requestEditTimeEntry, requestNewTimeEntry } from "./timeCreateBridge";
import { clockTime, entrySeconds, formatDuration, todayIso } from "../../utils/timeTracking.ts";
import { localeCodeFor } from "../../utils/localTime";
import { projectPeriodRange, timeByTask, type ProjectPeriod } from "../../utils/projectTimeStats.ts";
import { buildReport, reportCsv, roundDurationSec } from "../../utils/timeReports.ts";
import { entryWorkedSeconds, liveWorkedShares } from "../../utils/timeWorked.ts";
import type { Language } from "../../utils/translations";
import type { Project, Task, UserProfile } from "../../types";
import { entityAccentStyle } from "../../utils/entityAccent";
import { Switch } from "../ui/Switch";
import { ProjectBlockHeader, ProjectTimeOverview, projectBlockClass } from "./ProjectTimeOverview";

/**
 * The project's Time tab: the period and its CSV, the figures (tiles, hours per week, by task, by
 * employee), then the timer, the entries the viewer may see (the whole team's with
 * time_tracking_team, otherwise their own; Toggl imports carry a badge) and the budget and rate.
 */
export function ProjectTimeTab({
  project,
  language,
  currency,
  users,
  tasks = [],
  onPatch,
}: {
  project: Project;
  language: Language;
  currency: string;
  users: UserProfile[];
  tasks?: Task[];
  onPatch: (patch: Partial<Project>) => void;
}) {
  const tt = useTimeTracking();
  const { entries: allEntries } = useTimeEntries({
    projectId: project.id,
    from: "2000-01-01",
    to: "2100-01-01",
    ...(tt.viewer.canTeam ? { userId: "all" } : {}),
  });
  const t = tt.t;
  const today = todayIso();
  const [period, setPeriod] = useState<ProjectPeriod>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const range = useMemo(() => projectPeriodRange(period, today, customFrom, customTo), [period, today, customFrom, customTo]);
  const entries = useMemo(() => (range.invalid ? [] : allEntries.filter((e) => e.entryDate >= range.from && e.entryDate <= range.to)), [allEntries, range]);
  // The clock only matters while a timer runs; otherwise the figures must not recompute every second.
  const liveNow = entries.some((e) => e.running) ? tt.nowMs : 0;

  /** Someone else's entry names its person; the viewer's own stay unlabelled. */
  const personOf = (userId: string) =>
    userId && userId !== tt.userId ? users.find((u) => u.id === userId)?.name || t("Unknown", "Neznámy", "Ismeretlen") : "";
  const totals = tt.totals.byProject[project.id];
  // The stored total leaves running entries out; add them so the budget agrees with the Tracked tile.
  const runningSeconds = allEntries.reduce((sum, e) => sum + (e.running ? entrySeconds(e, tt.nowMs) : 0), 0);
  const allSeconds = (totals?.seconds ?? allEntries.reduce((sum, e) => sum + (e.durationSec ?? 0), 0)) + runningSeconds;
  const canCosts = tt.viewer.canCosts;

  // The same report the Reports page builds, so rounding, cost gating, billable value and the comparable-lines margin agree.
  const report = useMemo(() => {
    const shares = entries.some((e) => e.running) ? liveWorkedShares(entries, liveNow) : undefined;
    return buildReport({
      entries: entries.map((e) => ({
        id: e.id,
        userId: e.userId,
        projectId: e.projectId,
        clientId: null,
        entryDate: e.entryDate,
        title: e.title,
        durationSec: entrySeconds(e, liveNow),
        workedSec: entryWorkedSeconds(e, liveNow, shares),
        billable: e.billable,
        cost: e.cost,
        currency,
        billableRate: e.billableRate,
        internal: !!project.isInternal,
      })),
      filters: { from: range.from, to: range.to, userId: null, projectId: null, clientId: null, billable: "all", groupBy: "person" },
      rounding: tt.settings.rounding,
      viewerUserId: tt.userId || "",
      canCosts,
      currency,
      workingDays: 0,
    });
  }, [entries, liveNow, tt.settings.rounding, tt.userId, canCosts, currency, project.isInternal, range]);

  const taskRows = useMemo(
    () =>
      timeByTask(
        entries.map((e) => ({ taskId: e.taskId, title: e.title || e.note || "", seconds: roundDurationSec(entrySeconds(e, liveNow), tt.settings.rounding) })),
        (id) => tasks.find((tk) => tk.id === id),
      ),
    [entries, tasks, liveNow, tt.settings.rounding],
  );

  const exportCsv = () => {
    // Own cost is visible to everyone, but the tab shows no cost without the permission, so the export has none either.
    const exported = canCosts ? report : { ...report, lines: report.lines.map((l) => ({ ...l, cost: {} })), totals: { ...report.totals, cost: {} } };
    const text = reportCsv(
      exported,
      "detailed",
      {
        group: t("Group", "Skupina", "Csoport"),
        date: t("Date", "Dátum", "Dátum"),
        person: t("Person", "Osoba", "Személy"),
        project: t("Project", "Projekt", "Projekt"),
        title: t("Title", "Názov", "Cím"),
        hours: t("Hours", "Hodiny", "Órák"),
        billable: t("Billable", "Fakturovateľné", "Számlázható"),
        cost: t("Cost", "Náklady", "Költség"),
        total: t("Totals", "Spolu", "Összesen"),
        workedHours: t("Worked hours", "Odpracované hodiny", "Ledolgozott órák"),
        leverage: t("Leverage", "Násobok", "Szorzó"),
      },
      { group: (key) => key, person: (id) => users.find((u) => u.id === id)?.name || id, project: () => project.name || project.id },
    );
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "project-time.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const [budget, setBudget] = useState(project.hoursBudget != null ? String(project.hoursBudget) : "");
  const [rate, setRate] = useState(project.billableRate != null ? String(project.billableRate) : "");
  const [internal, setInternal] = useState(!!project.isInternal);
  useEffect(() => {
    setBudget(project.hoursBudget != null ? String(project.hoursBudget) : "");
    setRate(project.billableRate != null ? String(project.billableRate) : "");
    setInternal(!!project.isInternal);
  }, [project.id, project.hoursBudget, project.billableRate, project.isInternal]);

  const dateLabel = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(localeCodeFor(language), { day: "numeric", month: "numeric", year: "numeric" });
  };
  // A timer on the project itself (not on one of its tasks) is in the running set.
  const runningHere = tt.running.find((e) => e.projectId === project.id && !e.taskId && !e.ticketId) ?? null;

  const inputClass = "w-full px-3 py-2 rounded-md border border-gray-200 bg-white text-ui font-semibold text-gray-800 tabular-nums transition-colors duration-150 focus:outline-none focus:border-entity focus:ring-2 focus:ring-entity-ring";
  const periods: { id: ProjectPeriod; label: string }[] = [
    { id: "all", label: t("All time", "Celé obdobie", "Teljes időszak") },
    { id: "thisMonth", label: t("This month", "Tento mesiac", "Ez a hónap") },
    { id: "lastMonth", label: t("Last month", "Minulý mesiac", "Előző hónap") },
    { id: "custom", label: t("Custom…", "Vlastné…", "Egyéni…") },
  ];
  const dateInput = "h-9 rounded-md border border-gray-200 bg-white px-2 text-ui text-gray-800";

  return (
    <div className="space-y-4 text-left" data-testid="project-time-tab">
      {/* Period and export */}
      <div className="flex flex-wrap items-center gap-2" data-testid="project-time-period">
        <div className="inline-flex w-fit flex-wrap gap-1 rounded-md bg-gray-100 p-1">
          {periods.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={`h-8 rounded-lg px-3 text-ui font-semibold transition-all active:scale-95 cursor-pointer ${period === p.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label={t("From", "Od", "Ettől")} className={dateInput} />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label={t("To", "Do", "Eddig")} className={dateInput} />
          </>
        )}
        {range.invalid && <span role="alert" className="type-meta text-rose-600">{t("End is before start", "Koniec je pred začiatkom", "A vége a kezdet előtt van")}</span>}
        <button
          type="button"
          data-testid="project-time-export"
          disabled={report.lines.length === 0}
          onClick={exportCsv}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-ui font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          <Download className="size-4" />
          {t("Export CSV", "Exportovať CSV", "CSV exportálása")}
        </button>
      </div>

      <ProjectTimeOverview
        report={report}
        range={range}
        today={today}
        taskRows={taskRows}
        project={project}
        budgetSeconds={allSeconds}
        allTime={period === "all"}
        users={users}
        language={language}
        canCosts={canCosts}
        t={t}
      />

      {/* The entries, and the timer */}
      <div className={projectBlockClass} style={entityAccentStyle("time-tracking") as React.CSSProperties}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ProjectBlockHeader
            icon={<ListChecks className="h-4 w-4 text-entity-text shrink-0" />}
            title={t("Time entries", "Záznamy času", "Időbejegyzések")}
            extra={entries.length > 0 ? <span className="px-2 py-0.5 rounded-md text-micro font-semibold tabular-nums bg-entity-subtle text-entity-text border border-entity-border">{entries.length}</span> : null}
          />
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
                onClick={(ev) => {
                  if (runningHere) void tt.stop(runningHere.id);
                  else void tt.start({ projectId: project.id, description: null, originType: "project", originId: project.id }, { anchor: ev.currentTarget });
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
        {entries.length === 0 ? (
          <p className="p-3 border-2 border-dashed border-gray-200 rounded-lg text-center text-gray-400 text-ui font-semibold">
            {allEntries.length === 0 ? t("No time logged yet.", "Zatiaľ žiadny zaznamenaný čas.", "Még nincs rögzített idő.") : t("No time in this period.", "V tomto období nie je žiadny čas.", "Ebben az időszakban nincs rögzített idő.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => {
              const span = e.startAt ? `${clockTime(e.startAt)}${e.endAt ? `–${clockTime(e.endAt)}` : ""}` : "";
              return (
                <li
                  key={e.id}
                  data-testid="project-time-entry"
                  onClick={() => requestEditTimeEntry(e)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      requestEditTimeEntry(e);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-white border border-gray-200 hover:border-entity-border hover:bg-gray-50 transition-colors cursor-pointer text-ui"
                >
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

      {/* Budget and rate */}
      <div className={projectBlockClass}>
        <ProjectBlockHeader icon={<Wallet className="h-4 w-4 text-emerald-600 shrink-0" />} title={t("Budget & rate", "Rozpočet a sadzba", "Keret és díj")} />
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
            <Switch
              checked={internal}
              onChange={(next) => {
                setInternal(next);
                onPatch({ isInternal: next });
              }}
            />
            {t("Internal project", "Interný projekt", "Belső projekt")}
          </label>
        </div>
      </div>
    </div>
  );
}
