import { useMemo, type ReactNode } from "react";
import { BarChart3, ListChecks, Users } from "lucide-react";
import { StatGrid, StatTile } from "../layout/StatGrid";
import { formatMoney } from "../../utils/currency";
import { budgetUsedPercent, weeklyByPerson, type TaskTimeRow } from "../../utils/projectTimeStats.ts";
import type { BuiltReport } from "../../utils/timeReports.ts";
import type { MoneyByCurrency } from "../../utils/timeTeam.ts";
import { formatDuration, hoursOf } from "../../utils/timeTracking.ts";
import { localeCodeFor } from "../../utils/localTime";
import type { Language } from "../../utils/translations";
import type { Project, UserProfile } from "../../types";
import { BarRow } from "./charts/BarRow";
import { SegmentBars } from "./charts/SegmentBars";
import { MarginText } from "./ReportSummaryTable";

type T = (en: string, sk: string, hu: string) => string;

export const projectBlockClass = "p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3";
// Person colours for the weekly bars: five people, then everyone else in slate.
const PEOPLE_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#8b5cf6", "#ec4899"];
const OTHERS_COLOR = "#94a3b8";

export function ProjectBlockHeader({ icon, title, extra }: { icon: ReactNode; title: string; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-ui font-bold text-slate-900">{title}</span>
      {extra}
    </div>
  );
}

/**
 * The project Time tab's figures for the chosen period: five tiles, hours per week by person, time by
 * task and a by-employee table. Cost, billable value and margin only for viewers with the costs permission.
 */
export function ProjectTimeOverview({
  report,
  range,
  today,
  taskRows,
  project,
  budgetSeconds,
  allTime,
  users,
  language,
  canCosts,
  t,
}: {
  report: BuiltReport;
  range: { from: string; to: string };
  today: string;
  taskRows: TaskTimeRow[];
  project: Project;
  /** Everything tracked on the project, whatever the period: the budget is for the whole project. */
  budgetSeconds: number;
  allTime: boolean;
  users: UserProfile[];
  language: Language;
  canCosts: boolean;
  t: T;
}) {
  const money = (bag: MoneyByCurrency): string => {
    const codes = Object.keys(bag).sort();
    return codes.length ? codes.map((c) => formatMoney(bag[c], c, language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).join(" · ") : "—";
  };
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name || t("Unknown", "Neznámy", "Ismeretlen");
  const locale = localeCodeFor(language);
  const weekly = useMemo(() => weeklyByPerson(report.lines, range, today), [report.lines, range, today]);
  const shown = weekly.people.slice(0, PEOPLE_COLORS.length);
  const series = [
    ...shown.map((p, i) => ({ key: p.userId, label: nameOf(p.userId), color: PEOPLE_COLORS[i] })),
    ...(weekly.people.length > shown.length ? [{ key: "__others", label: t("Others", "Ostatní", "Egyéb"), color: OTHERS_COLOR }] : []),
  ];
  const shownIds = new Set(shown.map((p) => p.userId));
  const bars = weekly.weeks.map((w) => {
    const values: Record<string, number> = {};
    for (const [id, sec] of Object.entries(w.byUser)) {
      const key = shownIds.has(id) ? id : "__others";
      values[key] = (values[key] ?? 0) + sec;
    }
    const d = new Date(`${w.start}T00:00:00`);
    const label = d.toLocaleDateString(locale, { day: "numeric", month: "numeric" });
    return { key: w.start, label, title: t(`Week of ${label}`, `Týždeň od ${label}`, `${label} héten`), values };
  });

  const budgetPct = budgetUsedPercent(budgetSeconds, project.hoursBudget);
  const hasCost = Object.keys(report.totals.cost).length > 0;
  const hasValue = Object.keys(report.totals.billableValue).length > 0;
  const people = new Set(report.lines.map((l) => l.userId)).size;
  const maxTaskSec = Math.max(1, ...taskRows.map((r) => r.seconds));

  return (
    <>
      <StatGrid count={canCosts ? 5 : 2}>
        <StatTile
          label={t("Tracked", "Sledované", "Rögzített")}
          value={<span className="tabular-nums">{formatDuration(report.totals.seconds)}</span>}
          delta={t(`${people} people · ${report.lines.length} entries`, `${people} ľudí · ${report.lines.length} záznamov`, `${people} fő · ${report.lines.length} bejegyzés`)}
        />
        {canCosts && <StatTile label={t("Labour cost", "Náklady na prácu", "Munkaköltség")} value={<span className="tabular-nums">{hasCost ? money(report.totals.cost) : "—"}</span>} />}
        {canCosts && <StatTile label={t("Billable value", "Fakturovateľná hodnota", "Számlázható érték")} value={<span className="tabular-nums">{hasValue ? money(report.totals.billableValue) : "—"}</span>} />}
        {budgetPct != null ? (
          <StatTile
            label={t("Hours budget", "Rozpočet hodín", "Órakeret")}
            value={<span className="tabular-nums">{budgetPct} %</span>}
            progress={{ value: budgetPct, label: t("Hours budget used", "Využitý rozpočet hodín", "Felhasznált órakeret") }}
            delta={t(
              `${hoursOf(budgetSeconds)} of ${project.hoursBudget} h${allTime ? "" : " · all time"}`,
              `${hoursOf(budgetSeconds)} z ${project.hoursBudget} h${allTime ? "" : " · celkovo"}`,
              `${hoursOf(budgetSeconds)} / ${project.hoursBudget} óra${allTime ? "" : " · összesen"}`,
            )}
          />
        ) : (
          <StatTile label={t("Hours budget", "Rozpočet hodín", "Órakeret")} value={<span className="text-slate-400">{t("No budget", "Bez rozpočtu", "Nincs keret")}</span>} />
        )}
        {canCosts && (
          <StatTile
            label={t("Time margin", "Marža z času", "Idő árrés")}
            value={<MarginText margin={report.totals.margin} language={language} t={t} />}
          />
        )}
      </StatGrid>

      <div className={projectBlockClass} data-testid="project-time-weekly">
        <ProjectBlockHeader icon={<BarChart3 className="h-4 w-4 text-indigo-600 shrink-0" />} title={t("Hours per week", "Hodiny podľa týždňa", "Órák hetente")}
          extra={<span className="type-meta text-slate-500">{bars.length === 1 ? t("1 week", "1 týždeň", "1 hét") : t(`Last ${bars.length} weeks`, `Posledných ${bars.length} týždňov`, `Utolsó ${bars.length} hét`)}</span>}
        />
        <SegmentBars
          bars={bars}
          series={series}
          ariaLabel={t("Hours per week by person", "Hodiny podľa týždňa a osoby", "Heti órák személyenként")}
          formatValue={(v) => formatDuration(v)}
          emptyLabel={t("No time in this period.", "V tomto období nie je žiadny čas.", "Ebben az időszakban nincs rögzített idő.")}
        />
      </div>

      <div className={projectBlockClass} data-testid="project-time-by-task">
        <ProjectBlockHeader icon={<ListChecks className="h-4 w-4 text-teal-600 shrink-0" />} title={t("By task", "Podľa úlohy", "Feladatonként")} />
        {taskRows.length === 0 ? (
          <p className="py-4 text-center text-ui text-slate-400">{t("No time in this period.", "V tomto období nie je žiadny čas.", "Ebben az időszakban nincs rögzített idő.")}</p>
        ) : (
          <div className="grid gap-3">
            {taskRows.map((r) => {
              const pct = r.estimateSec ? Math.round((r.seconds / r.estimateSec) * 100) : null;
              return (
                <BarRow
                  key={r.taskId || "__none"}
                  label={r.taskId ? r.title : t("Not on a task", "Mimo úlohy", "Feladat nélkül")}
                  ratio={r.estimateSec ? r.seconds / r.estimateSec : r.seconds / maxTaskSec}
                  color={r.estimateSec ? undefined : OTHERS_COLOR}
                  value={
                    r.estimateSec
                      ? t(`${formatDuration(r.seconds)} of ${formatDuration(r.estimateSec)} · ${pct} %`, `${formatDuration(r.seconds)} z ${formatDuration(r.estimateSec)} · ${pct} %`, `${formatDuration(r.seconds)} / ${formatDuration(r.estimateSec)} · ${pct} %`)
                      : formatDuration(r.seconds)
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      <div className={projectBlockClass} data-testid="project-time-by-employee">
        <ProjectBlockHeader icon={<Users className="h-4 w-4 text-purple-600 shrink-0" />} title={t("By employee", "Podľa zamestnanca", "Munkatársanként")} />
        {report.groups.length === 0 ? (
          <p className="py-4 text-center text-ui text-slate-400">{t("No time in this period.", "V tomto období nie je žiadny čas.", "Ebben az időszakban nincs rögzített idő.")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-ui">
              <thead>
                <tr className="text-left type-overline text-slate-500">
                  <th className="px-3 py-2 font-semibold">{t("Person", "Osoba", "Személy")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Hours", "Hodiny", "Órák")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("Billable", "Fakturovateľné", "Számlázható")}</th>
                  {canCosts && <th className="px-3 py-2 text-right font-semibold">{t("Labour cost", "Náklady na prácu", "Munkaköltség")}</th>}
                  {canCosts && <th className="px-3 py-2 text-right font-semibold">{t("Billable value", "Fakturovateľná hodnota", "Számlázható érték")}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.groups.map((g) => (
                  <tr key={g.key} data-testid="project-time-employee-row">
                    <td className="px-3 py-2 font-semibold text-slate-800">{nameOf(g.key)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatDuration(g.seconds)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatDuration(g.billableSeconds)}</td>
                    {canCosts && <td className="px-3 py-2 text-right tabular-nums text-slate-700">{Object.keys(g.cost).length ? money(g.cost) : "—"}</td>}
                    {canCosts && <td className="px-3 py-2 text-right tabular-nums text-slate-700">{Object.keys(g.billableValue).length ? money(g.billableValue) : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
