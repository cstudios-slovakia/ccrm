import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Surface } from "../layout";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { formatMoney } from "../../utils/currency";
import { resolveWorkCountry } from "../../utils/holidays.ts";
import { costRateTooltip } from "../../utils/timeCost.ts";
import {
  buildSalaryReport,
  lastClosedMonth,
  monthRange,
  salaryCsv,
} from "../../utils/timeReports.ts";
import { entrySeconds, formatDuration, todayIso } from "../../utils/timeTracking.ts";
import { shiftMonthAnchor } from "../../utils/timeTeam.ts";
import { MoneyText } from "./MoneyText";
import type { TimeDeps } from "./shared";

/** Where each salary went in a month that has already closed. Admins with time_tracking_salary_report. */
export function TimeSalaryReport({ deps }: { deps: TimeDeps }) {
  const tt = useTimeTracking();
  const { t, viewer, settings } = tt;
  const [month, setMonth] = useState(() => lastClosedMonth(todayIso()));
  const range = monthRange(month);
  const { entries, loading } = useTimeEntries({ from: range.from, to: range.to, userId: viewer.canTeam ? "all" : undefined });
  const clock = entries.some((e) => e.running) ? tt.nowMs : 0;
  const closed = lastClosedMonth(todayIso());
  const locale = deps.language === "sk" ? "sk-SK" : deps.language === "hu" ? "hu-HU" : "en-US";
  const [y, m] = month.split("-").map(Number);
  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const moneyStr = (n: number) => formatMoney(n, deps.currency, deps.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const report = useMemo(() => {
    const employeeByUser = new Map(deps.employees.filter((e) => e.userId).map((e) => [e.userId as string, e]));
    const ids = new Set<string>([...deps.users.map((u) => u.id).filter(Boolean) as string[], ...employeeByUser.keys()]);
    return buildSalaryReport({
      entries: entries.map((e) => ({
        userId: e.userId,
        projectId: e.projectId,
        entryDate: e.entryDate,
        durationSec: entrySeconds(e, clock),
        cost: e.cost,
        currency: deps.currency,
      })),
      people: [...ids].map((id) => {
        const user = deps.users.find((u) => u.id === id);
        const employee = employeeByUser.get(id);
        return {
          userId: id,
          name: user?.name || employee?.name || id,
          employeeId: employee?.id ?? null,
          active: !!employee && employee.isActive !== false,
          kind: employee?.kind ?? null,
          salaryType: employee?.salaryType ?? null,
          salaryAmount: employee?.salaryAmount ?? null,
          workCountry: resolveWorkCountry(employee?.workCountry, tt.defaultCountry),
        };
      }),
      projects: deps.projects.map((p) => ({
        id: p.id,
        isInternal:
          p.isInternal === true ||
          deps.projectTypes.some((tp) => tp.id === p.projectTypeId && (tp as { isInternal?: boolean }).isInternal === true),
      })),
      from: range.from,
      to: range.to,
      viewerUserId: tt.userId || "",
      canCosts: viewer.canCosts,
      currency: deps.currency,
      settings,
      monthWorkingDays: (country, year, mo) => tt.calendarFor(country).workingDaysInMonth(year, mo),
    });
  }, [clock, deps, entries, range.from, range.to, settings, tt.calendarFor, tt.defaultCountry, tt.userId, viewer.canCosts]);

  const bar = (client: number, internal: number, unallocated: number) => {
    const total = client + internal + unallocated;
    const w = (n: number) => (total > 0 ? (n / total) * 100 : 0);
    return (
      <span className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <span className="h-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${w(client)}%` }} />
        <span className="h-full bg-teal-700 transition-[width] duration-500" style={{ width: `${w(internal)}%` }} />
        <span className="h-full bg-amber-400 transition-[width] duration-500" style={{ width: `${w(unallocated)}%` }} />
      </span>
    );
  };

  return (
    <div className="grid gap-4" data-testid="salary-report">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label={t("Previous month", "Predchádzajúci mesiac", "Előző hónap")} onClick={() => setMonth(shiftMonthAnchor(month, -1, 1))} className="inline-flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-all hover:text-slate-900 active:scale-95 cursor-pointer">
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-40 text-center text-ui font-semibold capitalize text-slate-800">{monthLabel}</span>
        <button type="button" aria-label={t("Next month", "Nasledujúci mesiac", "Következő hónap")} disabled={month >= closed} onClick={() => setMonth(shiftMonthAnchor(month, 1, 1))} className="inline-flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-all hover:text-slate-900 active:scale-95 cursor-pointer disabled:opacity-40">
          <ChevronRight className="size-4" />
        </button>
        <button
          type="button"
          onClick={() =>
            downloadText(
              `salary-${month}.csv`,
              salaryCsv(report, {
                person: t("Person", "Osoba", "Személy"),
                salary: t("Salary", "Mzda", "Bér"),
                rate: t("Rate", "Sadzba", "Díj"),
                hours: t("Hours", "Hodiny", "Órák"),
                client: t("Client", "Klient", "Ügyfél"),
                internal: t("Internal", "Interné", "Belső"),
                unallocated: t("Unallocated", "Nepriradené", "Nincs projekt"),
                utilisation: t("Utilisation", "Využitie", "Kihasználtság"),
                total: t("Totals", "Spolu", "Összesen"),
                without: t("Time without salary data", "Čas bez údajov o mzde", "Idő béradat nélkül"),
              }),
            )
          }
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-ui font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-95 cursor-pointer"
        >
          <Download className="size-4" />
          CSV
        </button>
      </div>
      <p className="type-meta text-slate-500">
        {t(
          "Salary is the employee's base pay for the month. Bonuses are not included.",
          "Mzda je základná mesačná mzda zamestnanca. Prémie sa nezapočítavajú.",
          "A bér a munkatárs havi alapbére. A prémium nincs benne.",
        )}
      </p>
      <div className="flex flex-wrap gap-3 type-meta text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-500" />{t("Client", "Klient", "Ügyfél")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-teal-700" />{t("Internal", "Interné", "Belső")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-400" />{t("Unallocated", "Nepriradené", "Nincs projekt")}</span>
      </div>
      <Surface padding="none" className="overflow-x-auto">
        {loading && report.rows.length === 0 ? (
          <p className="p-4 text-body text-slate-500">{t("Loading…", "Načítava sa…", "Betöltés…")}</p>
        ) : (
          <table className="w-full border-collapse text-ui">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                {[
                  t("Person", "Osoba", "Személy"),
                  t("Salary", "Mzda", "Bér"),
                  t("Rate", "Sadzba", "Díj"),
                  t("Hours", "Hodiny", "Órák"),
                  t("Split", "Rozdelenie", "Megoszlás"),
                  t("Client", "Klient", "Ügyfél"),
                  t("Internal", "Interné", "Belső"),
                  t("Unallocated", "Nepriradené", "Nincs projekt"),
                  t("Utilisation", "Využitie", "Kihasználtság"),
                ].map((h) => (
                  <th key={h} className="px-3 py-3 type-overline text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => {
                const employee = deps.employees.find((e) => e.id === row.employeeId);
                const country = resolveWorkCountry(employee?.workCountry, tt.defaultCountry);
                const util = row.utilisation == null ? null : Math.round(row.utilisation * 100);
                return (
                  <tr key={row.userId} className="border-b border-slate-100">
                    <td className="px-3 py-3 font-semibold text-slate-900">{row.name}</td>
                    <td className="px-3 py-3 tabular-nums">{row.loadedSalary == null ? "—" : moneyStr(row.loadedSalary)}</td>
                    <td className="px-3 py-3 tabular-nums text-violet-700" title={costRateTooltip(row.rate, { t, money: moneyStr, monthLabel, country })}>
                      {row.rate.rate == null ? "—" : `${moneyStr(row.rate.rate)}/h`}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-teal-700">{formatDuration(row.trackedSeconds)}</td>
                    <td className="min-w-28 px-3 py-3">{bar(row.clientSeconds, row.internalSeconds, row.unallocatedSeconds)}</td>
                    <td className="px-3 py-3"><MoneyText bag={row.clientCost} language={deps.language} /></td>
                    <td className="px-3 py-3"><MoneyText bag={row.internalCost} language={deps.language} /></td>
                    <td className="px-3 py-3"><MoneyText bag={row.unallocatedCost} language={deps.language} /></td>
                    <td className={`px-3 py-3 tabular-nums ${util != null && util < 75 ? "text-amber-700" : "text-slate-800"}`}>{util == null ? "—" : `${util} %`}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td className="px-3 py-3">{t("Totals", "Spolu", "Összesen")}</td>
                <td className="px-3 py-3"><MoneyText bag={report.totals.loadedSalary} language={deps.language} tone="plain" /></td>
                <td />
                <td className="px-3 py-3 tabular-nums text-teal-700">{formatDuration(report.totals.trackedSeconds)}</td>
                <td />
                <td className="px-3 py-3"><MoneyText bag={report.totals.clientCost} language={deps.language} /></td>
                <td className="px-3 py-3"><MoneyText bag={report.totals.internalCost} language={deps.language} /></td>
                <td className="px-3 py-3"><MoneyText bag={report.totals.unallocatedCost} language={deps.language} /></td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </Surface>

      <Surface>
        <h3 className="type-card-title text-slate-900">{t("Time without salary data", "Čas bez údajov o mzde", "Idő béradat nélkül")}</h3>
        <p className="mt-1 type-meta text-slate-500">{t("These people tracked time and have no employee record, so there is no salary to split.", "Títo ľudia zaznamenali čas a nemajú kartu zamestnanca, takže mzdu nie je podľa čoho rozdeliť.", "Ezek az emberek rögzítettek időt, de nincs munkatársi lapjuk, ezért a bért nincs miből felosztani.")}</p>
        {report.withoutSalary.length === 0 ? (
          <p className="mt-3 text-ui text-slate-400" data-testid="salary-without">{t("None this month.", "Tento mesiac nikto.", "Ebben a hónapban senki.")}</p>
        ) : (
          <ul className="mt-3 grid gap-2" data-testid="salary-without">
            {report.withoutSalary.map((row) => (
              <li key={row.userId} className="flex flex-wrap items-baseline justify-between gap-2 text-ui">
                <span className="font-semibold text-slate-900">{row.name}</span>
                <span className="tabular-nums text-teal-700">{formatDuration(row.seconds)}</span>
                <MoneyText bag={row.cost} language={deps.language} />
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}

const downloadText = (filename: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
