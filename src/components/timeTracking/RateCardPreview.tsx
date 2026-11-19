import { useMemo } from "react";
import { overridesFor, resolveWorkCountry, type HolidayCountry } from "../../utils/holidays.ts";
import { computeCostRate } from "../../utils/timeCost.ts";
import type { TFn, TimeTrackingSettings } from "../../utils/timeTracking.ts";
import type { Employee } from "../../types";
import type { useTimeTracking } from "../../hooks/useTimeTracking";

const MAX_ROWS = 8;

/**
 * Per-employee preview of the cost rate for the current month, from the unsaved settings
 * (same `computeCostRate` as the entries). Read-only; shows nothing without employees.
 */
export function RateCardPreview({
  t,
  employees,
  draft,
  tt,
  money,
  locale,
}: {
  t: TFn;
  employees: Employee[] | undefined;
  draft: TimeTrackingSettings;
  tt: ReturnType<typeof useTimeTracking>;
  money: (n: number) => string;
  locale: string;
}) {
  const now = new Date();
  const rows = useMemo(() => {
    const list = (employees ?? []).filter((e) => (e.kind ?? "employee") !== "ledger" && e.isActive !== false && !!e.userId && Number(e.salaryAmount) > 0);
    return list.map((e) => {
      const country = resolveWorkCountry(e.workCountry ?? null, tt.defaultCountry) as HolidayCountry;
      const days = tt.calendarFor(country, overridesFor(draft.holidayOverrides, country)).workingDaysInMonth(now.getFullYear(), now.getMonth() + 1);
      const r = computeCostRate({ kind: e.kind ?? "employee", salaryType: e.salaryType ?? null, salaryAmount: e.salaryAmount ?? null }, days, draft);
      return { e, r, country };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, draft, tt.calendarFor, tt.defaultCountry]);

  if (rows.length === 0) return null;

  const per = (type?: string | null) => (type === "daily" ? t("day", "deň", "nap") : type === "hourly" ? t("h", "h", "óra") : t("month", "mesiac", "hó"));
  const calc = (row: (typeof rows)[number]) => {
    const { r, e } = row;
    if (r.rate === null) return "—";
    const parts: string[] = [];
    if (r.basisDays !== null) parts.push(`${r.basisDays} ${t("working days", "pracovných dní", "munkanap")}`);
    if (r.basisHours !== null && r.basisDays === null) parts.push(`${r.basisHours} h`);
    if (r.multiplier !== 1) parts.push(`× ${r.multiplier}`);
    return parts.length ? parts.join(" · ") : t("hourly, as entered", "hodinová, ako je zadaná", "óradíj, ahogy meg van adva");
  };
  const monthName = now.toLocaleDateString(locale, { month: "long", year: "numeric" });

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200" data-testid="tt-rate-preview">
      <p className="type-overline px-3 pt-3 text-slate-500">
        {t("Preview", "Náhľad", "Előnézet")} · {monthName}
      </p>
      <table className="w-full text-ui">
        <thead>
          <tr className="text-left type-label text-slate-500">
            <th className="px-3 py-2 font-semibold">{t("Employee", "Zamestnanec", "Munkatárs")}</th>
            <th className="px-3 py-2 font-semibold">{t("Salary", "Mzda", "Fizetés")}</th>
            <th className="px-3 py-2 font-semibold">{t("Calculation", "Výpočet", "Számítás")}</th>
            <th className="px-3 py-2 text-right font-semibold">{t("Cost rate", "Nákladová sadzba", "Költségdíj")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.slice(0, MAX_ROWS).map((row) => (
            <tr key={row.e.id}>
              <td className="px-3 py-2 font-semibold text-slate-800">{row.e.name}</td>
              <td className="px-3 py-2 tabular-nums text-slate-600">
                {money(Number(row.e.salaryAmount))} / {per(row.e.salaryType)}
              </td>
              <td className="px-3 py-2 text-slate-500">{calc(row)}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800">{row.r.rate !== null ? `${money(row.r.rate)}/h` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > MAX_ROWS && (
        <p className="px-3 pb-2 type-meta text-slate-500">{t(`+${rows.length - MAX_ROWS} more`, `+${rows.length - MAX_ROWS} ďalších`, `+${rows.length - MAX_ROWS} további`)}</p>
      )}
    </div>
  );
}
