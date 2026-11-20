import { useMemo } from "react";
import { Surface } from "../layout";
import { hoursPerDay, type BuiltReport } from "../../utils/timeReports.ts";
import { formatDuration, hoursOf, projectColor } from "../../utils/timeTracking.ts";
import { Donut } from "./charts/Donut";
import { StackedBars } from "./charts/StackedBars";

type T = (en: string, sk: string, hu: string) => string;

/** "Hours per working day": one stacked bar per working day (and any off-day with entries), billable against the rest. */
export function HoursPerDayCard({ report, days, locale, t }: { report: BuiltReport; days: readonly string[]; locale: string; t: T }) {
  const bars = useMemo(() => {
    const withEntries = new Set(report.lines.map((l) => l.entryDate));
    const list = [...new Set([...days, ...withEntries])].sort();
    return hoursPerDay(report.lines, list).map((d) => ({
      key: d.date,
      label: String(Number(d.date.slice(8))),
      title: new Date(`${d.date}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" }),
      a: d.billableSeconds,
      b: d.otherSeconds,
    }));
  }, [days, locale, report.lines]);
  return (
    <Surface className="min-w-0" >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="type-card-title text-slate-900">{t("Hours per working day", "Hodiny na pracovný deň", "Óra munkanaponként")}</h3>
        {report.perWorkingDaySeconds != null && (
          <span className="type-meta tabular-nums text-slate-500">{t(`avg ${formatDuration(report.perWorkingDaySeconds)} over ${days.length} working days`, `priemer ${formatDuration(report.perWorkingDaySeconds)} za ${days.length} pracovných dní`, `átlag ${formatDuration(report.perWorkingDaySeconds)}, ${days.length} munkanap alatt`)}</span>
        )}
      </div>
      <StackedBars
        className="mt-3"
        bars={bars}
        aLabel={t("Billable", "Fakturovateľné", "Számlázható")}
        bLabel={t("Non-billable", "Nefakturovateľné", "Nem számlázható")}
        ariaLabel={t("Hours per working day, billable and non-billable", "Hodiny na pracovný deň, fakturovateľné a nefakturovateľné", "Óra munkanaponként, számlázható és nem számlázható")}
        formatValue={formatDuration}
        emptyLabel={t("Nothing in this period.", "V tomto období nič.", "Ebben az időszakban semmi.")}
      />
    </Surface>
  );
}

/** "Share by project": donut with the total hours in the middle, legend with colour and percentage. */
export function ShareByProjectCard({ report, projectName, t }: { report: BuiltReport; projectName: (id: string | null) => string; t: T }) {
  return (
    <Surface className="min-w-0">
      <h3 className="type-card-title text-slate-900">{t("Share by project", "Podiel podľa projektu", "Megoszlás projekt szerint")}</h3>
      <Donut
        className="mt-3"
        slices={report.shareByProject.map((s) => ({ key: s.projectId ?? "none", label: projectName(s.projectId), value: s.seconds, color: projectColor(s.projectId) }))}
        centerValue={hoursOf(report.totals.seconds).toFixed(1).replace(/\.0$/, "")}
        centerLabel={t("hours", "hodín", "óra")}
        ariaLabel={t("Share of hours by project", "Podiel hodín podľa projektu", "Az órák megoszlása projekt szerint")}
        otherLabel={t("Other projects", "Ostatné projekty", "Egyéb projektek")}
        emptyLabel={t("Nothing in this period.", "V tomto období nič.", "Ebben az időszakban semmi.")}
      />
    </Surface>
  );
}
