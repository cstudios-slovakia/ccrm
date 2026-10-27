import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Surface, Toolbar } from "../layout";
import { CustomSelect } from "../ui/CustomSelect";
import { useProjectStatuses } from "../../hooks/useProjectStatuses";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { formatMoney } from "../../utils/currency";
import { resolveWorkCountry } from "../../utils/holidays.ts";
import { isClosedProjectStatus } from "../../utils/projects";
import { costRateTooltip, type CostRateSource } from "../../utils/timeCost.ts";
import {
  MONTH_COLUMNS,
  WEEK_COLUMNS,
  buildTeamMatrix,
  shiftMonthAnchor,
  shiftWeekAnchor,
  teamMatrixCsv,
  weekBuckets,
  monthBuckets,
  type TeamMatrix,
} from "../../utils/timeTeam.ts";
import { entrySeconds, formatDuration, todayIso, weekStart, type TFn } from "../../utils/timeTracking.ts";
import { viewSizeScale } from "../../utils/viewSize";
import { MoneyText } from "./MoneyText";
import { RoleBadge } from "./RoleBadge";
import { requestOpenList } from "./ViewingAsContext";
import { initials, useTimeLookups, type TimeDeps } from "./shared";

const sourceLabel = (source: CostRateSource, t: TFn): string => {
  switch (source) {
    case "monthly":
      return t("monthly salary", "mesačná mzda", "havi bér");
    case "daily":
      return t("daily rate", "denná sadzba", "napi díj");
    case "hourly":
      return t("hourly rate", "hodinová sadzba", "óradíj");
    case "contractor_hourly":
      return t("contractor, hourly", "dodávateľ, hodinovo", "vállalkozó, óradíj");
    case "contractor_daily":
      return t("contractor, daily", "dodávateľ, denne", "vállalkozó, napi");
    case "contractor_monthly":
      return t("contractor, monthly", "dodávateľ, mesačne", "vállalkozó, havi");
    default:
      return t("no rate", "bez sadzby", "nincs díj");
  }
};

const downloadText = (filename: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/** People × week or month. Hours in teal, cost in violet, basis under 75% in amber. */
export function TimeTeamView({ deps, onNavigate }: { deps: TimeDeps; onNavigate: (route: string) => void }) {
  const tt = useTimeTracking();
  const { t, viewer, settings, nowMs } = tt;
  const lookups = useTimeLookups(deps);
  const statuses = useProjectStatuses();
  const [kind, setKind] = useState<"week" | "month">("week");
  const [weekAnchor, setWeekAnchor] = useState(() => weekStart(todayIso()));
  const [monthAnchor, setMonthAnchor] = useState(() => todayIso().slice(0, 7));
  const [activeOnly, setActiveOnly] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [pop, setPop] = useState<{ userId: string; bucketId: string; top: number; left: number } | null>(null);

  const buckets = useMemo(
    () => (kind === "week" ? weekBuckets(weekAnchor, WEEK_COLUMNS) : monthBuckets(monthAnchor, MONTH_COLUMNS)),
    [kind, weekAnchor, monthAnchor],
  );
  const from = buckets[0].from;
  const to = buckets[buckets.length - 1].to;
  const { entries, loading } = useTimeEntries({ from, to, userId: viewer.canTeam ? "all" : undefined });
  const clock = entries.some((e) => e.running) ? nowMs : 0;

  useEffect(() => {
    const years = [...new Set(buckets.flatMap((b) => [Number(b.from.slice(0, 4)), Number(b.to.slice(0, 4))]))];
    tt.ensureHolidayYears("SK", years);
    tt.ensureHolidayYears("HU", years);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, tt.enabled]);

  const locale = deps.language === "sk" ? "sk-SK" : deps.language === "hu" ? "hu-HU" : "en-US";
  const monthName = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, { month: "short", year: "numeric", timeZone: "UTC" });
  };
  const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const moneyStr = (n: number, code = deps.currency) => formatMoney(n, code, deps.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const matrix: TeamMatrix = useMemo(() => {
    const people = new Map<string, ReturnType<typeof lookups.userById.get>>();
    for (const u of deps.users) if (u.id) people.set(u.id, u);
    const employeeByUser = new Map(deps.employees.filter((e) => e.userId).map((e) => [e.userId as string, e]));
    const ids = new Set<string>([...people.keys(), ...employeeByUser.keys()]);
    return buildTeamMatrix({
      entries: entries.map((e) => ({
        userId: e.userId,
        projectId: e.projectId,
        entryDate: e.entryDate,
        durationSec: entrySeconds(e, clock),
        cost: e.cost,
        currency: deps.currency,
        costRate: e.costRate,
        costRateSource: e.costRateSource,
        costRateBasisDays: e.costRateBasisDays,
      })),
      people: [...ids].map((id) => {
        const user = people.get(id);
        const employee = employeeByUser.get(id);
        return {
          userId: id,
          name: user?.name || employee?.name || id,
          roleName: user?.role || "",
          kind: employee?.kind ?? null,
          employeeId: employee?.id ?? null,
          active: !!employee && employee.isActive !== false,
          workCountry: resolveWorkCountry(employee?.workCountry, tt.defaultCountry),
          salaryType: employee?.salaryType ?? null,
          salaryAmount: employee?.salaryAmount ?? null,
          color: user?.color || "#64748b",
        };
      }),
      projects: deps.projects.map((p) => ({ id: p.id, active: !p.archived && !isClosedProjectStatus(p.status, statuses) })),
      vacations: (deps.vacations ?? []).map((v) => ({ employeeId: v.employeeId, startDate: v.startDate, endDate: v.endDate, status: v.status })),
      buckets,
      viewerUserId: tt.userId || "",
      canCosts: viewer.canCosts,
      currency: deps.currency,
      settings,
      today: todayIso(),
      bucketKind: kind,
      activeOnly,
      projectId: projectId || null,
      isWorkingDay: (country, iso) => tt.calendarFor(country).isWorkingDay(iso),
      monthWorkingDays: (country, year, month) => tt.calendarFor(country).workingDaysInMonth(year, month),
    });
    // calendarFor identity changes with the holiday cache; the range effect refetches years.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOnly, buckets, clock, deps, entries, kind, projectId, settings, statuses, tt.defaultCountry, tt.userId, viewer.canCosts]);

  useEffect(() => {
    if (!pop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPop(null);
    };
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("[data-team-cell], [data-team-pop]")) return;
      setPop(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [pop]);

  if (!viewer.canTeam) {
    return (
      <Surface>
        <p className="text-body text-slate-500">{t("The team matrix needs the team permission.", "Matica tímu vyžaduje oprávnenie na tím.", "A csapatmátrixhoz csapatjogosultság kell.")}</p>
      </Surface>
    );
  }

  const today = todayIso();
  const popCell = pop ? matrix.rows.find((r) => r.userId === pop.userId)?.cells.find((c) => c.bucketId === pop.bucketId) : null;
  const popRow = pop ? matrix.rows.find((r) => r.userId === pop.userId) : null;
  const panelWidth = 18 * 16 * viewSizeScale();

  const rateTip = (rate: NonNullable<TeamMatrix["rows"][number]["rate"]>, month: string, country: string) =>
    costRateTooltip(rate, { t, money: (n) => moneyStr(n), monthLabel: monthName(month), country });

  return (
    <div className="grid gap-4" data-testid="team-matrix">
      <Toolbar
        filters={
          <>
            <CustomSelect
              size="sm"
              fitLabel
              value={projectId}
              onChange={setProjectId}
              options={[
                { value: "", label: t("All projects", "Všetky projekty", "Minden projekt") },
                ...deps.projects.map((p) => ({ value: p.id, label: lookups.projectName(p.id) })),
              ]}
            />
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-ui text-slate-700">
              <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} className="size-4 accent-teal-600" />
              {t("Active projects only", "Len aktívne projekty", "Csak aktív projektek")}
            </label>
          </>
        }
        trailing={
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setKind("week")} className={`h-9 rounded-xl px-3 text-ui font-semibold transition-all active:scale-95 cursor-pointer ${kind === "week" ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {t("Weekly", "Týždenne", "Hetente")}
            </button>
            <button type="button" onClick={() => setKind("month")} className={`h-9 rounded-xl px-3 text-ui font-semibold transition-all active:scale-95 cursor-pointer ${kind === "month" ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {t("Monthly", "Mesačne", "Havonta")}
            </button>
          </div>
        }
        primary={
          <button
            type="button"
            onClick={() =>
              downloadText(
                "team-time.csv",
                teamMatrixCsv(
                  matrix,
                  {
                    person: t("Person", "Osoba", "Személy"),
                    role: t("Role", "Rola", "Szerep"),
                    rate: t("Rate", "Sadzba", "Díj"),
                    hours: t("Hours", "Hodiny", "Órák"),
                    cost: t("Cost", "Náklady", "Költség"),
                    total: t("Total", "Spolu", "Összesen"),
                  },
                  (badge) => (badge === "admin" ? "Admin" : badge === "manager" ? "Manager" : badge === "contractor" ? "Contractor" : "Employee"),
                ),
              )
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-ui font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-95 cursor-pointer"
          >
            <Download className="size-4" />
            CSV
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label={t("Previous", "Predchádzajúce", "Előző")}
          onClick={() => (kind === "week" ? setWeekAnchor(shiftWeekAnchor(weekAnchor, -1)) : setMonthAnchor(shiftMonthAnchor(monthAnchor, -1)))}
          className="inline-flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-all hover:text-slate-900 active:scale-95 cursor-pointer"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-40 text-center text-ui font-semibold text-slate-800">
          {kind === "week" ? `${dayLabel(from)} – ${dayLabel(to)}` : `${monthName(buckets[0].id)} – ${monthName(buckets[buckets.length - 1].id)}`}
        </span>
        <button
          type="button"
          aria-label={t("Next", "Nasledujúce", "Következő")}
          onClick={() => (kind === "week" ? setWeekAnchor(shiftWeekAnchor(weekAnchor, 1)) : setMonthAnchor(shiftMonthAnchor(monthAnchor, 1)))}
          className="inline-flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-all hover:text-slate-900 active:scale-95 cursor-pointer"
        >
          <ChevronRight className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setWeekAnchor(weekStart(today));
            setMonthAnchor(today.slice(0, 7));
          }}
          className="h-9 rounded-xl px-3 text-ui font-semibold text-primary transition-all hover:bg-slate-100 active:scale-95 cursor-pointer"
        >
          {t("Current", "Aktuálne", "Aktuális")}
        </button>
      </div>

      <Surface padding="none" className="overflow-x-auto">
        {loading && matrix.rows.length === 0 ? (
          <p className="p-4 text-body text-slate-500">{t("Loading…", "Načítava sa…", "Betöltés…")}</p>
        ) : (
          <table className="w-full border-collapse text-ui">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="sticky left-0 z-10 bg-white px-4 py-3 type-overline text-slate-500">{t("Person", "Osoba", "Személy")}</th>
                {matrix.buckets.map((b) => {
                  const current = today >= b.from && today <= b.to;
                  return (
                    <th key={b.id} className={`min-w-24 px-3 py-3 type-overline ${current ? "bg-teal-50 text-teal-800" : "text-slate-500"}`}>
                      {kind === "week" ? dayLabel(b.from) : monthName(b.id)}
                    </th>
                  );
                })}
                <th className="min-w-24 px-3 py-3 type-overline text-slate-500">{t("Total", "Spolu", "Összesen")}</th>
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.userId} className="border-b border-slate-100 align-top">
                  <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left font-normal">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-micro font-bold text-white" style={{ backgroundColor: row.color }}>
                        {initials(row.name) || "?"}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-900">{row.name}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <RoleBadge badge={row.badge} t={t} />
                          {row.showRate && row.rate?.rate != null && (
                            <span
                              className="type-meta tabular-nums text-violet-700"
                              title={rateTip(row.rate, today.slice(0, 7), resolveWorkCountry(deps.employees.find((e) => e.userId === row.userId)?.workCountry, tt.defaultCountry))}
                            >
                              {moneyStr(row.rate.rate)}/h · {sourceLabel(row.rate.source, t)}
                            </span>
                          )}
                          {row.showRate && row.rate?.rate == null && (
                            <span className="type-meta text-amber-700">
                              {row.noEmployee
                                ? t("no rate — no employee linked", "bez sadzby — nie je pripojený zamestnanec", "nincs díj — nincs munkatárs hozzárendelve")
                                : t("No rate", "Bez sadzby", "Nincs díj")}
                            </span>
                          )}
                        </span>
                      </span>
                    </div>
                  </th>
                  {row.cells.map((cell) => {
                    const current = today >= cell.from && today <= cell.to;
                    const ratio = cell.basisSeconds > 0 ? cell.seconds / cell.basisSeconds : 0;
                    const tip = cell.rates.map((note) => rateTip(note.rate, note.month, note.country)).join(" · ");
                    return (
                      <td key={cell.bucketId} className={`px-3 py-3 ${current ? "bg-teal-50/70" : ""}`}>
                        {cell.seconds === 0 && cell.vacation ? (
                          <span className="text-micro font-semibold text-slate-500">{t("vacation", "dovolenka", "szabadság")}</span>
                        ) : cell.seconds === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <button
                            type="button"
                            data-team-cell=""
                            title={tip || undefined}
                            onClick={(e) => {
                              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                              const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8));
                              setPop((prev) => (prev?.userId === row.userId && prev.bucketId === cell.bucketId ? null : { userId: row.userId, bucketId: cell.bucketId, top: rect.bottom + 6, left }));
                            }}
                            className="block w-full rounded-lg text-left transition-colors hover:bg-white/80 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
                          >
                            <span className="block font-bold tabular-nums text-teal-700">{formatDuration(cell.seconds)}</span>
                            {Object.keys(cell.cost).length > 0 && <MoneyText bag={cell.cost} language={deps.language} className="type-meta" />}
                            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-200">
                              <span className={`block h-full rounded-full transition-[width] duration-500 ${ratio < 0.75 ? "bg-amber-500" : "bg-teal-600"}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                            </span>
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3">
                    <span className="block font-bold tabular-nums text-teal-700">{formatDuration(row.totalSeconds)}</span>
                    <MoneyText bag={row.totalCost} language={deps.language} className="type-meta" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold" data-testid="team-totals">
                <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left">{t("Totals", "Spolu", "Összesen")}</th>
                {matrix.buckets.map((b, i) => (
                  <td key={b.id} className="px-3 py-3">
                    <span className="block tabular-nums text-teal-700">{formatDuration(matrix.totals.seconds[i])}</span>
                    <MoneyText bag={matrix.totals.cost[i]} language={deps.language} className="type-meta" />
                  </td>
                ))}
                <td className="px-3 py-3">
                  <span className="block tabular-nums text-teal-700">{formatDuration(matrix.totals.totalSeconds)}</span>
                  <MoneyText bag={matrix.totals.totalCost} language={deps.language} className="type-meta" />
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </Surface>

      {pop && popCell && popRow &&
        createPortal(
          <div
            data-team-pop=""
            className="fixed z-40 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
            style={{ top: pop.top, left: pop.left }}
          >
            <p className="type-card-title text-slate-900">{popRow.name}</p>
            <p className="type-meta text-slate-500">{dayLabel(popCell.from)} – {dayLabel(popCell.to)}</p>
            <ul className="mt-2 grid gap-1.5">
              {popCell.projects.length === 0 && <li className="text-ui text-slate-400">—</li>}
              {popCell.projects.map((slice) => (
                <li key={slice.projectId ?? "none"} className="flex items-baseline justify-between gap-2 text-ui">
                  <span className="truncate text-slate-700">{slice.projectId ? lookups.projectName(slice.projectId) : t("Unallocated", "Nepriradené", "Nincs projekt")}</span>
                  <span className="shrink-0 text-right">
                    <span className="block tabular-nums font-semibold text-teal-700">{formatDuration(slice.seconds)}</span>
                    <MoneyText bag={slice.cost} language={deps.language} className="type-meta" />
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                requestOpenList(pop.userId, popCell.from, popCell.to);
                onNavigate("time-tracking");
                setPop(null);
              }}
              className="mt-3 text-ui font-semibold text-primary cursor-pointer hover:underline"
            >
              {t("Open entries →", "Otvoriť záznamy →", "Bejegyzések megnyitása →")}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
};
