import type { ReactNode } from "react";
import { Surface } from "../layout";
import { formatMoney } from "../../utils/currency";
import { type BuiltReport, type Margin, type ReportGroupBy } from "../../utils/timeReports.ts";
import { formatDuration } from "../../utils/timeTracking.ts";
import type { Language } from "../../utils/translations";
import { MoneyText } from "./MoneyText";
import { ProjectLabel } from "./ProjectLabel";

type T = (en: string, sk: string, hu: string) => string;

const partialNote = (t: T) =>
  t(
    "Approximate: entries without a cost and entries that overlapped another timer are left out of the margin.",
    "Približne: záznamy bez nákladu a záznamy, ktoré sa prekrývali s iným časovačom, sa do marže nezapočítavajú.",
    "Hozzávetőleges: a költség nélküli és a másik időzítővel átfedő bejegyzések nincsenek benne az árrésben.",
  );

/** Margin: emerald when positive, rose when negative, "—" where there is no comparable billable value, "≈" when lines were left out. */
export function MarginText({ margin, language, t }: { margin: Margin | null; language: Language; t: T }) {
  if (!margin) return <span className="tabular-nums text-slate-300">—</span>;
  return (
    <span className="tabular-nums font-semibold" title={margin.partial ? partialNote(t) : undefined}>
      {margin.partial ? "≈ " : ""}
      {Object.keys(margin.amount).sort().map((code, i) => (
        <span key={code} className={margin.amount[code] < 0 ? "text-rose-600" : "text-emerald-700"}>
          {i > 0 ? " · " : ""}
          {formatMoney(margin.amount[code], code, language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ))}
    </span>
  );
}

const th = "px-4 py-3 type-overline text-slate-500";
const thr = `${th} text-right`;
const td = "px-4 py-2.5 text-right tabular-nums";

export function groupTitle(by: ReportGroupBy, t: T): string {
  if (by === "project") return t("By project", "Podľa projektu", "Projekt szerint");
  if (by === "person") return t("By person", "Podľa osoby", "Személy szerint");
  if (by === "client") return t("By client", "Podľa klienta", "Ügyfél szerint");
  if (by === "day") return t("By day", "Podľa dňa", "Nap szerint");
  return t("By title", "Podľa názvu", "Cím szerint");
}

function columnHead(by: ReportGroupBy, t: T): string {
  if (by === "project") return t("Project", "Projekt", "Projekt");
  if (by === "person") return t("Person", "Osoba", "Személy");
  if (by === "client") return t("Client", "Klient", "Ügyfél");
  if (by === "day") return t("Day", "Deň", "Nap");
  return t("Title", "Názov", "Cím");
}

/** The report's grouped table: hours, worked (when it differs), billable hours, billable value, labour cost and margin. */
export function ReportSummaryTable({
  report,
  groupBy,
  groupLabel,
  clientOfProject,
  showValue,
  showCost,
  language,
  t,
}: {
  report: BuiltReport;
  groupBy: ReportGroupBy;
  groupLabel: (key: string) => string;
  clientOfProject: (projectId: string | null) => string | null;
  /** Billable value and margin columns: only for viewers who may see costs. */
  showValue: boolean;
  showCost: boolean;
  language: Language;
  t: T;
}) {
  const both = report.showsWorked;
  const cell = (node: ReactNode) => <td className={td}>{node}</td>;
  return (
    <Surface padding="none" className="overflow-x-auto" >
      <h3 className="type-card-title px-4 pt-4 text-slate-900">{groupTitle(groupBy, t)}</h3>
      <table className="mt-2 w-full border-collapse text-ui">
        <thead>
          <tr className="border-b border-slate-100 text-left">
            <th className={th}>{columnHead(groupBy, t)}</th>
            <th className={thr}>{both ? t("Delivered", "Dodané", "Leszállított") : t("Hours", "Hodiny", "Órák")}</th>
            {both && <th className={thr}>{t("Worked", "Odpracované", "Ledolgozott")}</th>}
            <th className={thr}>{t("Billable h", "Fakt. hodiny", "Számlázható ó")}</th>
            {showValue && <th className={thr}>{t("Billable value", "Fakt. hodnota", "Számlázható érték")}</th>}
            {showCost && <th className={thr}>{t("Labour cost", "Náklady na prácu", "Munkaköltség")}</th>}
            {showValue && <th className={thr}>{t("Margin", "Marža", "Árrés")}</th>}
          </tr>
        </thead>
        <tbody>
          {report.groups.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-6 text-body text-slate-500">{t("Nothing in this period.", "V tomto období nič.", "Ebben az időszakban semmi.")}</td></tr>
          )}
          {report.groups.map((g) => (
            <tr key={g.key || "empty"} className="border-b border-slate-100">
              <td className="px-4 py-2.5 font-semibold text-slate-900">
                {groupBy === "project" && g.key ? (
                  <span className="flex min-w-0 items-baseline gap-2">
                    <ProjectLabel projectId={g.key} name={groupLabel(g.key)} compact />
                    {clientOfProject(g.key) && <span className="truncate type-meta font-normal text-slate-500">{clientOfProject(g.key)}</span>}
                  </span>
                ) : (
                  groupLabel(g.key)
                )}
              </td>
              {cell(<span className="font-semibold text-slate-900">{formatDuration(g.seconds)}</span>)}
              {both && cell(formatDuration(g.workedSeconds))}
              {cell(<span className="text-slate-600">{formatDuration(g.billableSeconds)}</span>)}
              {showValue && cell(<MoneyText bag={g.billableValue} language={language} />)}
              {showCost && cell(<MoneyText bag={g.cost} language={language} />)}
              {showValue && cell(<MarginText margin={g.margin} language={language} t={t} />)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-semibold">
            <td className="px-4 py-3 type-overline text-slate-500">{t("Totals", "Spolu", "Összesen")}</td>
            <td className={`${td} py-3 text-slate-900`}>{formatDuration(report.totals.seconds)}</td>
            {both && <td className={`${td} py-3`}>{formatDuration(report.totals.workedSeconds)}</td>}
            <td className={`${td} py-3`}>{formatDuration(report.totals.billableSeconds)}</td>
            {showValue && <td className={`${td} py-3`}><MoneyText bag={report.totals.billableValue} language={language} /></td>}
            {showCost && <td className={`${td} py-3`}><MoneyText bag={report.totals.cost} language={language} /></td>}
            {showValue && <td className={`${td} py-3`}><MarginText margin={report.totals.margin} language={language} t={t} /></td>}
          </tr>
        </tfoot>
      </table>
      {showValue && (report.totals.margin?.partial || report.groups.some((g) => g.margin?.partial)) && <p className="px-4 pb-3 type-meta text-slate-500">≈ {partialNote(t)}</p>}
    </Surface>
  );
}
