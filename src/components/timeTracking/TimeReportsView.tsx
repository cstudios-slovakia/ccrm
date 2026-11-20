import { useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { StatGrid, StatTile, Surface } from "../layout";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { addDays } from "../../utils/holidays.ts";
import { isClientRecord } from "../../utils/clientRecord.ts";
import {
  buildReport,
  clientPdfRows,
  defaultThenBy,
  clientReportHtml,
  reportCsv,
  type BillableFilter,
  periodRange,
  type ReportGroupBy,
  type ReportPeriod,
  TIME_ENTRIES_SERVER_LIMIT,
} from "../../utils/timeReports.ts";
import { entrySeconds, formatDuration, hoursOf, todayIso, type TimeEntry } from "../../utils/timeTracking.ts";
import { entryWorkedSeconds, liveWorkedShares } from "../../utils/timeWorked.ts";
import { MoneyText } from "./MoneyText";
import { HoursPerDayCard, ShareByProjectCard } from "./ReportCharts";
import { FilterChip, GroupByChip, ModeSwitch, PeriodChip, ReportFilterCard, ToggleChip, TruncatedNotice, type ReportMode } from "./ReportFilters";
import { dimensionLabel, ReportSummaryTable } from "./ReportSummaryTable";
import { TimeToolbarSlot } from "./TimeToolbarSlot";
import { TimeSalaryReport } from "./TimeSalaryReport";
import { useTimeLookups, type TimeDeps } from "./shared";
import { formatMoney } from "../../utils/currency";
import type { Lead, Project } from "../../types";

type Mode = ReportMode;

/** The chart draws at most this many bars; a longer range shows its first days and says so. */
const CHART_DAY_CAP = 62;

const clientIdOf = (project: Project, leads: Lead[]): string | null => {
  if (project.clientId) return project.clientId;
  if (!project.leadId) return null;
  const lead = leads.find((l) => l.id === project.leadId);
  if (!lead) return null;
  if (isClientRecord(lead)) return lead.id ?? null;
  return lead.clientId || null;
};

const downloadText = (filename: string, text: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/** Summary and detailed reports. Rounding applies here and in the client PDF only. */
export function TimeReportsView({ deps }: { deps: TimeDeps }) {
  const tt = useTimeTracking();
  const { t, viewer, settings } = tt;
  const lookups = useTimeLookups(deps);
  const today = todayIso();
  const [mode, setMode] = useState<Mode>("summary");
  const [period, setPeriodState] = useState<ReportPeriod>("thisMonth");
  const preset = periodRange(period, today);
  const [customFrom, setFrom] = useState(today);
  const [customTo, setTo] = useState(today);
  const from = preset?.from ?? customFrom;
  const to = preset?.to ?? customTo;
  const setPeriod = (p: ReportPeriod) => {
    if (p === "custom") {
      setFrom(from);
      setTo(to);
    }
    setPeriodState(p);
  };
  const [userId, setUserId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  const [billable, setBillable] = useState<BillableFilter>("all");
  const [groupBy, setGroupBy] = useState<ReportGroupBy>("project");
  const [parallelOnly, setParallelOnly] = useState(false);
  // Second grouping level for the drill-down: null = the default for the first level, "none" = off.
  const [thenChoice, setThenChoice] = useState<ReportGroupBy | "none" | null>(null);
  const thenBy: ReportGroupBy | "none" = thenChoice && thenChoice !== groupBy ? thenChoice : defaultThenBy(groupBy);
  // Open rows belong to the filters they were opened under; any change drops them.
  const openSignature = JSON.stringify([from, to, userId, projectId, clientId, billable, groupBy, thenBy, parallelOnly]);
  const [openState, setOpenState] = useState<{ sig: string; keys: string[] }>({ sig: "", keys: [] });
  const openKeys = useMemo(() => new Set(openState.sig === openSignature ? openState.keys : []), [openState, openSignature]);
  const toggleOpen = (key: string) => setOpenState({ sig: openSignature, keys: openKeys.has(key) ? [...openKeys].filter((k) => k !== key) : [...openKeys, key] });

  const { entries, loading } = useTimeEntries({ from, to, userId: viewer.canTeam ? "all" : undefined });
  const clock = entries.some((e) => e.running) ? tt.nowMs : 0;
  const locale = deps.language === "sk" ? "sk-SK" : deps.language === "hu" ? "hu-HU" : "en-GB";

  const clients = useMemo(() => {
    const ids = new Set<string>();
    for (const p of deps.projects) {
      const id = clientIdOf(p, deps.leads);
      if (id) ids.add(id);
    }
    return [...ids].map((id) => ({ id, name: deps.leads.find((l) => l.id === id)?.name || id })).sort((a, b) => a.name.localeCompare(b.name));
  }, [deps.leads, deps.projects]);

  const workingDayList = useMemo(() => {
    const cal = tt.calendarFor(tt.workCountry);
    const days: string[] = [];
    for (let d = from; d <= to && days.length < CHART_DAY_CAP; d = addDays(d, 1)) if (cal.isWorkingDay(d)) days.push(d);
    return days;
  }, [from, to, tt.calendarFor, tt.workCountry]);
  const workingDays = useMemo(() => tt.calendarFor(tt.workCountry).workingDaysInRange(from, to), [from, to, tt.calendarFor, tt.workCountry]);

  const internalProjects = useMemo(
    () =>
      new Set(
        deps.projects
          .filter((p) => p.isInternal === true || deps.projectTypes.some((tp) => tp.id === p.projectTypeId && (tp as { isInternal?: boolean }).isInternal === true))
          .map((p) => p.id),
      ),
    [deps.projectTypes, deps.projects],
  );

  const report = useMemo(() => {
    const clientByProject = new Map(deps.projects.map((p) => [p.id, clientIdOf(p, deps.leads)]));
    const nowMs = clock || tt.nowMs;
    const shares = entries.some((e) => e.running) ? liveWorkedShares(entries, nowMs) : undefined;
    return buildReport({
      entries: entries.map((e: TimeEntry) => ({
        id: e.id,
        userId: e.userId,
        projectId: e.projectId,
        clientId: e.projectId ? clientByProject.get(e.projectId) ?? null : null,
        entryDate: e.entryDate,
        title: e.title,
        durationSec: entrySeconds(e, clock),
        workedSec: entryWorkedSeconds(e, nowMs, shares),
        billable: e.billable,
        cost: e.cost,
        currency: deps.currency,
        billableRate: e.billableRate,
        internal: e.projectId ? internalProjects.has(e.projectId) : false,
      })),
      filters: {
        from,
        to,
        userId: userId || null,
        projectId: projectId || null,
        clientId: clientId || null,
        billable,
        groupBy,
        parallelOnly,
      },
      rounding: settings.rounding,
      viewerUserId: tt.userId || "",
      canCosts: viewer.canCosts,
      currency: deps.currency,
      workingDays,
    });
  }, [billable, clientId, clock, deps, entries, from, groupBy, internalProjects, parallelOnly, projectId, tt.nowMs, settings.rounding, to, tt.userId, userId, viewer.canCosts, workingDays]);

  const personName = (id: string) => deps.users.find((u) => u.id === id)?.name || id;
  const projectName = (id: string | null) => (id ? lookups.projectName(id) : t("Unallocated", "Nepriradené", "Nincs projekt"));
  const clientName = (id: string | null) => (id ? clients.find((c) => c.id === id)?.name || id : t("No client", "Bez klienta", "Nincs ügyfél"));
  const clientOfProject = (id: string | null) => {
    const project = id ? deps.projects.find((p) => p.id === id) : null;
    const cid = project ? clientIdOf(project, deps.leads) : null;
    return cid ? clientName(cid) : null;
  };
  const labelFor = (by: ReportGroupBy, key: string) => {
    if (by === "project") return projectName(key || null);
    if (by === "person") return personName(key);
    if (by === "client") return clientName(key || null);
    if (by === "day") return new Date(`${key}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
    return key || t("(no title)", "(bez názvu)", "(nincs cím)");
  };
  const groupLabel = (key: string) => labelFor(groupBy, key);

  const openPdf = () => {
    const rows = clientPdfRows(report, { person: personName, project: projectName });
    const total = hoursOf(report.lines.filter((l) => l.billable).reduce((s, l) => s + l.seconds, 0)).toFixed(2);
    const html = clientReportHtml({
      title: t("Time report", "Report času", "Időjelentés"),
      period: `${from} – ${to}`,
      rows,
      totalHours: total,
      labels: {
        date: t("Date", "Dátum", "Dátum"),
        person: t("Person", "Osoba", "Személy"),
        project: t("Project", "Projekt", "Projekt"),
        title: t("Title", "Názov", "Cím"),
        hours: t("Hours", "Hodiny", "Órák"),
        total: t("Totals", "Spolu", "Összesen"),
        billableOnly: t("Billable time only", "Len fakturovateľný čas", "Csak számlázható idő"),
      },
    });
    const w = window.open("", "_blank");
    if (!w) {
      downloadText("time-report.html", html, "text/html");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const exportCsv = () => {
    const text = reportCsv(
      report,
      mode === "detailed" ? "detailed" : "summary",
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
      { group: groupLabel, person: personName, project: projectName },
    );
    downloadText("time-report.csv", text, "text/csv;charset=utf-8");
  };

  const billablePct = report.totals.seconds > 0 ? Math.round((report.totals.billableSeconds / report.totals.seconds) * 100) : null;
  const peopleCount = new Set(report.lines.map((l) => l.userId)).size;
  const hasCost = Object.keys(report.totals.cost).length > 0;
  const showValue = viewer.canCosts;
  const both = report.showsWorked;
  const truncated = entries.length >= TIME_ENTRIES_SERVER_LIMIT;
  const salaryAllowed = !!deps.canSalaryReport;
  const modeSwitch = <ModeSwitch mode={mode} setMode={setMode} salary={salaryAllowed} t={t} />;

  if (mode === "salary") {
    return (
      <div className="grid gap-4">
        <ReportFilterCard chips={null} modeSwitch={modeSwitch} />
        <TimeSalaryReport deps={deps} />
      </div>
    );
  }

  const moneyText = (bag: Record<string, number>) =>
    Object.keys(bag)
      .sort()
      .map((code) => formatMoney(bag[code], code, deps.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
      .join(" · ");
  const split = report.totals.costSplit;
  const hasInternal = Object.keys(split.internal).length > 0;
  const splitParts = [
    hasInternal ? `+ ${moneyText(split.internal)} ${t("internal", "interné", "belső")}` : "",
    Object.keys(split.unallocated).length ? `${hasInternal ? "" : "+ "}${moneyText(split.unallocated)} ${t("unallocated", "nepriradené", "nincs projekt")}` : "",
  ].filter(Boolean);
  const th = "px-4 py-3 type-overline text-slate-500";
  const thr = `${th} text-right`;
  const tdn = "px-4 py-2.5 text-right tabular-nums";
  const emptyText = t("Nothing in this period.", "V tomto období nič.", "Ebben az időszakban semmi.");
  const userCount = deps.users.filter((u) => u.id).length;

  return (
    <div className="grid gap-4" data-testid={mode === "detailed" ? "reports-detailed" : "reports-summary"}>
      <TimeToolbarSlot>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={exportCsv} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-ui font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-95 cursor-pointer">
            <Download className="size-4" />
            CSV
          </button>
          <button type="button" onClick={openPdf} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-ui font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-95 cursor-pointer">
            <FileText className="size-4" />
            {t("PDF for client", "PDF pre klienta", "PDF az ügyfélnek")}
          </button>
        </span>
      </TimeToolbarSlot>
      <ReportFilterCard
        modeSwitch={modeSwitch}
        chips={
          <>
            <PeriodChip t={t} period={period} setPeriod={setPeriod} from={from} to={to} setFrom={setFrom} setTo={setTo} />
            {viewer.canTeam && (
              <FilterChip
                label={t("Employees", "Zamestnanci", "Munkatársak")}
                value={userId}
                onChange={setUserId}
                options={[{ value: "", label: t(`All (${userCount})`, `Všetci (${userCount})`, `Mind (${userCount})`) }, ...deps.users.filter((u) => u.id).map((u) => ({ value: u.id as string, label: u.name }))]}
              />
            )}
            <FilterChip
              label={t("Projects", "Projekty", "Projektek")}
              value={projectId}
              onChange={setProjectId}
              options={[{ value: "", label: t("All", "Všetky", "Mind") }, ...deps.projects.map((p) => ({ value: p.id, label: lookups.projectName(p.id) }))]}
            />
            <FilterChip
              label={t("Clients", "Klienti", "Ügyfelek")}
              value={clientId}
              onChange={setClientId}
              options={[{ value: "", label: t("All", "Všetci", "Mind") }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
            />
            <FilterChip
              label={t("Billable", "Fakturovateľné", "Számlázható")}
              value={billable}
              onChange={(v) => setBillable(v as BillableFilter)}
              options={[
                { value: "all", label: t("Any", "Všetko", "Bármely") },
                { value: "yes", label: t("Billable", "Fakturovateľné", "Számlázható") },
                { value: "no", label: t("Non-billable", "Nefakturovateľné", "Nem számlázható") },
              ]}
            />
            {mode === "summary" && (
              <GroupByChip
                label={t("Group by", "Zoskupiť podľa", "Csoportosítás")}
                first={groupBy}
                then={thenBy}
                onFirst={(v) => {
                  setGroupBy(v as ReportGroupBy);
                  if (thenChoice === v) setThenChoice(null);
                }}
                onThen={(v) => setThenChoice(v as ReportGroupBy | "none")}
                firstOptions={[
                  { value: "project", label: t("Project", "Projekt", "Projekt") },
                  { value: "title", label: t("Title", "Názov", "Cím") },
                  { value: "person", label: t("Person", "Osoba", "Személy") },
                  { value: "client", label: t("Client", "Klient", "Ügyfél") },
                  { value: "day", label: t("Day", "Deň", "Nap") },
                ]}
                thenOptions={[
                  ...(["person", "title", "project", "client", "day"] as ReportGroupBy[]).filter((d) => d !== groupBy).map((d) => ({ value: d, label: dimensionLabel(d, t) })),
                  { value: "none", label: t("None", "Žiadne", "Nincs") },
                ]}
              />
            )}
            <ToggleChip pressed={parallelOnly} onClick={() => setParallelOnly((v) => !v)}>
              {t("Parallel only", "Len paralelné", "Csak párhuzamos")}
            </ToggleChip>
          </>
        }
      />

      {truncated && <TruncatedNotice t={t} />}
      {loading && report.lines.length === 0 ? (
        <p className="text-body text-slate-500">{t("Loading…", "Načítava sa…", "Betöltés…")}</p>
      ) : mode === "summary" ? (
        <>
          <StatGrid count={2 + (both ? 1 : 0) + (showValue ? 1 : 0) + (hasCost ? 1 : 0)}>
            <StatTile label={both ? t("Delivered", "Dodané", "Leszállított") : t("Tracked", "Sledované", "Rögzített")} value={<span className="tabular-nums">{formatDuration(report.totals.seconds)}</span>} delta={t(`${peopleCount} people · ${workingDays} working days`, `${peopleCount} ľudí · ${workingDays} pracovných dní`, `${peopleCount} fő · ${workingDays} munkanap`)} />
            {both && (
              <StatTile
                label={t("Worked", "Odpracované", "Ledolgozott")}
                delta={t("Parallel timers counted once", "Paralelné časovače sa rátajú raz", "A párhuzamos időzítők egyszer számítanak")}
                value={
                  <span className="tabular-nums">
                    {formatDuration(report.totals.workedSeconds)}
                    {report.leverage != null && <span className="type-meta font-normal text-slate-500"> ×{report.leverage.toFixed(2)}</span>}
                  </span>
                }
              />
            )}
            <StatTile
              label={t("Billable", "Fakturovateľné", "Számlázható")}
              value={<span className="tabular-nums">{formatDuration(report.totals.billableSeconds)}</span>}
              delta={billablePct == null ? undefined : t(`${billablePct} % of tracked`, `${billablePct} % zo sledovaného`, `${billablePct} % a rögzítettből`)}
            />
            {showValue && (
              <StatTile
                label={t("Billable value", "Fakturovateľná hodnota", "Számlázható érték")}
                value={<MoneyText bag={report.totals.billableValue} language={deps.language} />}
                delta={t("at project hourly rates", "podľa hodinových sadzieb projektov", "a projektek óradíja szerint")}
              />
            )}
            {hasCost && (
              <StatTile
                label={t("Labour cost · client work", "Náklady na prácu · klientska práca", "Munkaköltség · ügyfélmunka")}
                value={Object.keys(split.client).length ? <MoneyText bag={split.client} language={deps.language} /> : <MoneyText bag={{ [deps.currency || "EUR"]: 0 }} language={deps.language} />}
                delta={splitParts.length ? splitParts.join(" · ") : t(`${report.lines.length} entries`, `${report.lines.length} záznamov`, `${report.lines.length} bejegyzés`)}
              />
            )}
          </StatGrid>
          <div className="grid gap-4 ws-lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <HoursPerDayCard report={report} days={workingDayList} totalDays={workingDays} locale={locale} t={t} />
            <ShareByProjectCard report={report} projectName={projectName} locale={locale} t={t} />
          </div>
          <ReportSummaryTable
            report={report}
            groupBy={groupBy}
            groupLabel={groupLabel}
            clientOfProject={clientOfProject}
            showValue={showValue}
            showCost={hasCost}
            language={deps.language}
            t={t}
            thenBy={thenBy === "none" ? null : thenBy}
            childLabel={(key) => labelFor(thenBy === "none" ? groupBy : thenBy, key)}
            openKeys={openKeys}
            onToggle={toggleOpen}
          />
          {salaryAllowed && <TimeSalaryReport deps={deps} />}
        </>
      ) : (
        <Surface padding="none" className="overflow-x-auto">
          <h3 className="type-card-title px-4 pt-4 text-slate-900">{t("Entries", "Záznamy", "Bejegyzések")}</h3>
          <table className="mt-2 w-full border-collapse text-ui">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className={th}>{t("Date", "Dátum", "Dátum")}</th>
                {viewer.canTeam && <th className={th}>{t("Person", "Osoba", "Személy")}</th>}
                <th className={th}>{t("Project", "Projekt", "Projekt")}</th>
                <th className={th}>{t("Title", "Názov", "Cím")}</th>
                <th className={thr}>{both ? t("Delivered", "Dodané", "Leszállított") : t("Hours", "Hodiny", "Órák")}</th>
                {both && <th className={thr}>{t("Worked", "Odpracované", "Ledolgozott")}</th>}
                {hasCost && <th className={thr}>{t("Labour cost", "Náklady na prácu", "Munkaköltség")}</th>}
              </tr>
            </thead>
            <tbody>
              {report.lines.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-body text-slate-500">{emptyText}</td></tr>
              )}
              {report.lines.map((line) => (
                <tr key={line.id} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 tabular-nums text-slate-600">{line.entryDate}</td>
                  {viewer.canTeam && <td className="px-4 py-2.5">{personName(line.userId)}</td>}
                  <td className="px-4 py-2.5">{projectName(line.projectId)}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">{line.title || t("(no title)", "(bez názvu)", "(nincs cím)")}</td>
                  <td className={`${tdn} font-semibold text-slate-900`}>{formatDuration(line.seconds)}</td>
                  {both && <td className={tdn}>{formatDuration(line.workedSeconds)}</td>}
                  {hasCost && <td className={tdn}><MoneyText bag={line.cost} language={deps.language} /></td>}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-3 type-overline text-slate-500">{t("Totals", "Spolu", "Összesen")}</td>
                {viewer.canTeam && <td />}
                <td />
                <td />
                <td className={`${tdn} py-3 text-slate-900`}>{formatDuration(report.totals.seconds)}</td>
                {both && <td className={`${tdn} py-3`}>{formatDuration(report.totals.workedSeconds)}</td>}
                {hasCost && <td className={`${tdn} py-3`}><MoneyText bag={report.totals.cost} language={deps.language} /></td>}
              </tr>
            </tfoot>
          </table>
        </Surface>
      )}
    </div>
  );
}
