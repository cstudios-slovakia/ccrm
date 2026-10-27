import { useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { StatGrid, StatTile, Surface, Toolbar } from "../layout";
import { CustomSelect } from "../ui/CustomSelect";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { isClientRecord } from "../../utils/clientRecord.ts";
import {
  buildReport,
  clientPdfRows,
  clientReportHtml,
  reportCsv,
  type BillableFilter,
  type ReportGroupBy,
} from "../../utils/timeReports.ts";
import { entrySeconds, formatDuration, hoursOf, todayIso, type TimeEntry } from "../../utils/timeTracking.ts";
import { MoneyText } from "./MoneyText";
import { TimeSalaryReport } from "./TimeSalaryReport";
import { useTimeLookups, type TimeDeps } from "./shared";
import type { Lead, Project } from "../../types";

type Mode = "summary" | "detailed" | "salary";

const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const monthEnd = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(last).padStart(2, "0")}`;
};

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
  const [from, setFrom] = useState(() => monthStart(today));
  const [to, setTo] = useState(() => monthEnd(today));
  const [userId, setUserId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  const [billable, setBillable] = useState<BillableFilter>("all");
  const [groupBy, setGroupBy] = useState<ReportGroupBy>("title");

  const { entries, loading } = useTimeEntries({ from, to, userId: viewer.canTeam ? "all" : undefined });
  const clock = entries.some((e) => e.running) ? tt.nowMs : 0;
  const locale = deps.language === "sk" ? "sk-SK" : deps.language === "hu" ? "hu-HU" : "en-US";

  const clients = useMemo(() => {
    const ids = new Set<string>();
    for (const p of deps.projects) {
      const id = clientIdOf(p, deps.leads);
      if (id) ids.add(id);
    }
    return [...ids].map((id) => ({ id, name: deps.leads.find((l) => l.id === id)?.name || id })).sort((a, b) => a.name.localeCompare(b.name));
  }, [deps.leads, deps.projects]);

  const report = useMemo(() => {
    const clientByProject = new Map(deps.projects.map((p) => [p.id, clientIdOf(p, deps.leads)]));
    const workingDays = tt.calendarFor(tt.workCountry).workingDaysInRange(from, to);
    return buildReport({
      entries: entries.map((e: TimeEntry) => ({
        id: e.id,
        userId: e.userId,
        projectId: e.projectId,
        clientId: e.projectId ? clientByProject.get(e.projectId) ?? null : null,
        entryDate: e.entryDate,
        title: e.title,
        durationSec: entrySeconds(e, clock),
        billable: e.billable,
        cost: e.cost,
        currency: deps.currency,
      })),
      filters: {
        from,
        to,
        userId: userId || null,
        projectId: projectId || null,
        clientId: clientId || null,
        billable,
        groupBy,
      },
      rounding: settings.rounding,
      viewerUserId: tt.userId || "",
      canCosts: viewer.canCosts,
      currency: deps.currency,
      workingDays,
    });
  }, [billable, clientId, clock, deps, entries, from, groupBy, projectId, settings.rounding, to, tt.calendarFor, tt.userId, tt.workCountry, userId, viewer.canCosts]);

  const personName = (id: string) => deps.users.find((u) => u.id === id)?.name || id;
  const projectName = (id: string | null) => (id ? lookups.projectName(id) : t("Unallocated", "Nepriradené", "Nincs projekt"));
  const clientName = (id: string | null) => (id ? clients.find((c) => c.id === id)?.name || id : t("No client", "Bez klienta", "Nincs ügyfél"));
  const groupLabel = (key: string) => {
    if (groupBy === "project") return projectName(key || null);
    if (groupBy === "person") return personName(key);
    if (groupBy === "client") return clientName(key || null);
    if (groupBy === "day") return new Date(`${key}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
    return key || t("(no title)", "(bez názvu)", "(nincs cím)");
  };

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
      },
      { group: groupLabel, person: personName, project: projectName },
    );
    downloadText("time-report.csv", text, "text/csv;charset=utf-8");
  };

  const billablePct = report.totals.seconds > 0 ? Math.round((report.totals.billableSeconds / report.totals.seconds) * 100) : null;

  if (mode === "salary") {
    return (
      <div className="grid gap-4">
        <ModeSwitch mode={mode} setMode={setMode} salary={!!deps.canSalaryReport} t={t} />
        <TimeSalaryReport deps={deps} />
      </div>
    );
  }

  const hasCost = Object.keys(report.totals.cost).length > 0;

  return (
    <div className="grid gap-4" data-testid={mode === "detailed" ? "reports-detailed" : "reports-summary"}>
      <ModeSwitch mode={mode} setMode={setMode} salary={!!deps.canSalaryReport} t={t} />
      <Toolbar
        filters={
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("From", "Od", "Ettől")} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-ui" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("To", "Do", "Eddig")} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-ui" />
            {viewer.canTeam && (
              <CustomSelect
                size="sm"
                fitLabel
                value={userId}
                onChange={setUserId}
                options={[{ value: "", label: t("All people", "Všetci", "Mindenki") }, ...deps.users.filter((u) => u.id).map((u) => ({ value: u.id as string, label: u.name }))]}
              />
            )}
            <CustomSelect
              size="sm"
              fitLabel
              value={projectId}
              onChange={setProjectId}
              options={[{ value: "", label: t("All projects", "Všetky projekty", "Minden projekt") }, ...deps.projects.map((p) => ({ value: p.id, label: lookups.projectName(p.id) }))]}
            />
            <CustomSelect
              size="sm"
              fitLabel
              value={clientId}
              onChange={setClientId}
              options={[{ value: "", label: t("All clients", "Všetci klienti", "Minden ügyfél") }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
            />
            <CustomSelect
              size="sm"
              fitLabel
              value={billable}
              onChange={(v) => setBillable(v as BillableFilter)}
              options={[
                { value: "all", label: t("Billable and not", "Fakturovateľné aj nie", "Számlázható és nem") },
                { value: "yes", label: t("Billable", "Fakturovateľné", "Számlázható") },
                { value: "no", label: t("Non-billable", "Nefakturovateľné", "Nem számlázható") },
              ]}
            />
            {mode === "summary" && (
              <CustomSelect
                size="sm"
                fitLabel
                value={groupBy}
                onChange={(v) => setGroupBy(v as ReportGroupBy)}
                options={[
                  { value: "title", label: t("Group by title", "Zoskupiť podľa názvu", "Csoportosítás cím szerint") },
                  { value: "project", label: t("Group by project", "Zoskupiť podľa projektu", "Csoportosítás projekt szerint") },
                  { value: "person", label: t("Group by person", "Zoskupiť podľa osoby", "Csoportosítás személy szerint") },
                  { value: "client", label: t("Group by client", "Zoskupiť podľa klienta", "Csoportosítás ügyfél szerint") },
                  { value: "day", label: t("Group by day", "Zoskupiť podľa dňa", "Csoportosítás nap szerint") },
                ]}
              />
            )}
          </>
        }
        primary={
          <span className="flex gap-2">
            <button type="button" onClick={exportCsv} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-ui font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-95 cursor-pointer">
              <Download className="size-4" />
              CSV
            </button>
            <button type="button" onClick={openPdf} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-600 px-3 text-ui font-semibold text-white transition-all hover:bg-teal-700 active:scale-95 cursor-pointer">
              <FileText className="size-4" />
              {t("Client PDF", "PDF pre klienta", "Ügyfél PDF")}
            </button>
          </span>
        }
      />

      {loading && report.lines.length === 0 ? (
        <p className="text-body text-slate-500">{t("Loading…", "Načítava sa…", "Betöltés…")}</p>
      ) : mode === "summary" ? (
        <>
          <StatGrid count={hasCost ? 4 : 3}>
            <StatTile label={t("Hours", "Hodiny", "Órák")} value={<span className="tabular-nums">{formatDuration(report.totals.seconds)}</span>} />
            <StatTile label={t("Billable", "Fakturovateľné", "Számlázható")} value={<span className="tabular-nums">{billablePct == null ? "—" : `${billablePct} %`}</span>} />
            <StatTile
              label={t("Hours per working day", "Hodiny na pracovný deň", "Óra munkanaponként")}
              value={<span className="tabular-nums">{report.perWorkingDaySeconds == null ? "—" : formatDuration(report.perWorkingDaySeconds)}</span>}
            />
            {hasCost && <StatTile label={t("Labour cost", "Náklady na prácu", "Munkaköltség")} value={<MoneyText bag={report.totals.cost} language={deps.language} />} />}
          </StatGrid>
          <Surface>
            <h3 className="type-card-title text-slate-900">{t("Share by project", "Podiel podľa projektu", "Megoszlás projekt szerint")}</h3>
            <ul className="mt-3 grid gap-2">
              {report.shareByProject.length === 0 && <li className="text-ui text-slate-400">{t("Nothing in this period.", "V tomto období nič.", "Ebben az időszakban semmi.")}</li>}
              {report.shareByProject.map((share) => (
                <li key={share.projectId ?? "none"} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-ui text-slate-800">{projectName(share.projectId)}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-teal-600 transition-[width] duration-500" style={{ width: `${Math.round(share.ratio * 100)}%` }} />
                    </span>
                  </span>
                  <span className="tabular-nums text-ui font-semibold text-teal-700">{formatDuration(share.seconds)}</span>
                </li>
              ))}
            </ul>
          </Surface>
          <Surface padding="none" className="overflow-x-auto">
            <table className="w-full border-collapse text-ui">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-4 py-3 type-overline text-slate-500">{t("Group", "Skupina", "Csoport")}</th>
                  <th className="px-4 py-3 type-overline text-slate-500">{t("Hours", "Hodiny", "Órák")}</th>
                  <th className="px-4 py-3 type-overline text-slate-500">{t("Billable", "Fakturovateľné", "Számlázható")}</th>
                  {hasCost && <th className="px-4 py-3 type-overline text-slate-500">{t("Cost", "Náklady", "Költség")}</th>}
                </tr>
              </thead>
              <tbody>
                {report.groups.map((g) => (
                  <tr key={g.key || "empty"} className="border-b border-slate-100">
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{groupLabel(g.key)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-teal-700">{formatDuration(g.seconds)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatDuration(g.billableSeconds)}</td>
                    {hasCost && <td className="px-4 py-2.5"><MoneyText bag={g.cost} language={deps.language} /></td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-4 py-3">{t("Totals", "Spolu", "Összesen")}</td>
                  <td className="px-4 py-3 tabular-nums text-teal-700">{formatDuration(report.totals.seconds)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatDuration(report.totals.billableSeconds)}</td>
                  {hasCost && <td className="px-4 py-3"><MoneyText bag={report.totals.cost} language={deps.language} /></td>}
                </tr>
              </tfoot>
            </table>
          </Surface>
        </>
      ) : (
        <Surface padding="none" className="overflow-x-auto">
          <table className="w-full border-collapse text-ui">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="px-4 py-3 type-overline text-slate-500">{t("Date", "Dátum", "Dátum")}</th>
                {viewer.canTeam && <th className="px-4 py-3 type-overline text-slate-500">{t("Person", "Osoba", "Személy")}</th>}
                <th className="px-4 py-3 type-overline text-slate-500">{t("Project", "Projekt", "Projekt")}</th>
                <th className="px-4 py-3 type-overline text-slate-500">{t("Title", "Názov", "Cím")}</th>
                <th className="px-4 py-3 type-overline text-slate-500">{t("Hours", "Hodiny", "Órák")}</th>
                {hasCost && <th className="px-4 py-3 type-overline text-slate-500">{t("Cost", "Náklady", "Költség")}</th>}
              </tr>
            </thead>
            <tbody>
              {report.lines.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-body text-slate-500">{t("Nothing in this period.", "V tomto období nič.", "Ebben az időszakban semmi.")}</td></tr>
              )}
              {report.lines.map((line) => (
                <tr key={line.id} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 tabular-nums text-slate-600">{line.entryDate}</td>
                  {viewer.canTeam && <td className="px-4 py-2.5">{personName(line.userId)}</td>}
                  <td className="px-4 py-2.5">{projectName(line.projectId)}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">{line.title || t("(no title)", "(bez názvu)", "(nincs cím)")}</td>
                  <td className="px-4 py-2.5 tabular-nums text-teal-700">{formatDuration(line.seconds)}</td>
                  {hasCost && <td className="px-4 py-2.5"><MoneyText bag={line.cost} language={deps.language} /></td>}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-3">{t("Totals", "Spolu", "Összesen")}</td>
                {viewer.canTeam && <td />}
                <td />
                <td />
                <td className="px-4 py-3 tabular-nums text-teal-700">{formatDuration(report.totals.seconds)}</td>
                {hasCost && <td className="px-4 py-3"><MoneyText bag={report.totals.cost} language={deps.language} /></td>}
              </tr>
            </tfoot>
          </table>
        </Surface>
      )}
    </div>
  );
}

function ModeSwitch({ mode, setMode, salary, t }: { mode: Mode; setMode: (m: Mode) => void; salary: boolean; t: (en: string, sk: string, hu: string) => string }) {
  const item = (id: Mode, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setMode(id)}
      className={`h-9 rounded-xl px-3 text-ui font-semibold transition-all active:scale-95 cursor-pointer ${mode === id ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap gap-1">
      {item("summary", t("Summary", "Súhrn", "Összegzés"))}
      {item("detailed", t("Detailed", "Podrobné", "Részletes"))}
      {salary && item("salary", t("Salary allocation", "Rozdelenie mzdy", "Bérfelosztás"))}
    </div>
  );
}
