import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Filter, Users } from "lucide-react";
import { Surface } from "../layout";
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
import { isoWeekNumber } from "../../utils/isoWeek.ts";
import { MoneyText } from "./MoneyText";
import { WorkedTotal } from "./WorkedLine";
import { RangeNav } from "./RangeNav";
import { RoleBadge } from "./RoleBadge";
import { requestOpenList } from "./ViewingAsContext";
import { initials, useTimeLookups, type TimeDeps } from "./shared";
import { entityAccentStyle } from "../../utils/entityAccent";

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
  /** ISO week label: "W37" / "T37" / "37. hét". */
  const weekLabel = (week: number) => t(`W${week}`, `T${week}`, `${week}. hét`);
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

  const locale = deps.language === "sk" ? "sk-SK" : deps.language === "hu" ? "hu-HU" : "en-GB";
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
      nowMs: tt.nowMs,
      entries: entries.map((e) => ({
        id: e.id,
        running: e.running,
        startAt: e.startAt,
        workedMs: e.workedMs,
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
        <p className="text-body text-gray-500">{t("The team matrix needs the team permission.", "Matica tímu vyžaduje oprávnenie na tím.", "A csapatmátrixhoz csapatjogosultság kell.")}</p>
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
      <div data-testid="team-header"><Surface className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-entity-subtle text-entity-text">
          <Users className="size-5" />
        </span>
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="type-card-title text-gray-900">{t("Team work & expenses", "Práca a náklady tímu", "Csapat munkája és költségei")}</h2>
          <p className="type-meta text-gray-500">
            {kind === "week"
              ? t("Hours and labour cost per person and week.", "Hodiny a náklady práce na osobu a týždeň.", "Órák és munkaerőköltség személyenként és hetente.")
              : t("Hours and labour cost per person and month.", "Hodiny a náklady práce na osobu a mesiac.", "Órák és munkaerőköltség személyenként és havonta.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={activeOnly}
            onClick={() => setActiveOnly(!activeOnly)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-ui font-semibold transition-all active:scale-95 cursor-pointer ${activeOnly ? "border-entity-border bg-entity-subtle text-entity-text" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
          >
            <Filter className="size-4" />
            {t("Active projects only", "Len aktívne projekty", "Csak aktív projektek")}
          </button>
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
          <div className="inline-flex w-fit gap-1 rounded-md bg-gray-100 p-1">
            {(["week", "month"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`h-8 rounded-lg px-3 text-ui font-semibold transition-all active:scale-95 cursor-pointer ${kind === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
              >
                {k === "week" ? t("Weekly", "Týždenne", "Hetente") : t("Monthly", "Mesačne", "Havonta")}
              </button>
            ))}
          </div>
          <RangeNav
            label={kind === "week" ? `${weekLabel(isoWeekNumber(from))} – ${weekLabel(isoWeekNumber(buckets[buckets.length - 1].from))}` : `${monthName(buckets[0].id)} – ${monthName(buckets[buckets.length - 1].id)}`}
            prevLabel={t("Previous", "Predchádzajúce", "Előző")}
            nextLabel={t("Next", "Nasledujúce", "Következő")}
            onPrev={() => (kind === "week" ? setWeekAnchor(shiftWeekAnchor(weekAnchor, -1)) : setMonthAnchor(shiftMonthAnchor(monthAnchor, -1)))}
            onNext={() => (kind === "week" ? setWeekAnchor(shiftWeekAnchor(weekAnchor, 1)) : setMonthAnchor(shiftMonthAnchor(monthAnchor, 1)))}
            resetLabel={t("Current", "Aktuálne", "Aktuális")}
            onReset={
              (kind === "week" ? weekAnchor === weekStart(today) : monthAnchor === today.slice(0, 7))
                ? undefined
                : () => {
                    setWeekAnchor(weekStart(today));
                    setMonthAnchor(today.slice(0, 7));
                  }
            }
          />
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
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-ui font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-95 cursor-pointer"
          >
            <Download className="size-4" />
            CSV
          </button>
        </div>
      </Surface></div>

      <Surface padding="none" className="overflow-x-auto">
        {loading && matrix.rows.length === 0 ? (
          <p className="p-4 text-body text-gray-500">{t("Loading…", "Načítava sa…", "Betöltés…")}</p>
        ) : (
          <table className="w-full border-collapse text-ui">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="sticky left-0 z-10 bg-white px-4 py-3 type-overline text-gray-500">{t("Person", "Osoba", "Személy")}</th>
                {matrix.buckets.map((b) => {
                  const current = today >= b.from && today <= b.to;
                  return (
                    <th key={b.id} className={`min-w-24 px-3 py-3 type-overline ${current ? "bg-entity-subtle text-entity-text" : "text-gray-500"}`}>
                      {kind === "week" ? (
                        <>
                          <span className="block">{weekLabel(isoWeekNumber(b.from))}</span>
                          <span className="block font-normal normal-case">{dayLabel(b.from)} – {dayLabel(b.to)}</span>
                        </>
                      ) : monthName(b.id)}
                    </th>
                  );
                })}
                <th className="min-w-24 px-3 py-3 type-overline text-gray-500">{t("Total", "Spolu", "Összesen")}</th>
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => {
                /** Only employees have a weekly target; contractors and people without an employee record are exempt. */
                const hasTarget = row.employeeId != null && row.badge !== "contractor";
                return (
                <tr key={row.userId} className="border-b border-gray-100 align-top">
                  <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left font-normal">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-micro font-bold text-white" style={{ backgroundColor: row.color }}>
                        {initials(row.name) || "?"}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-gray-900">{row.name}</span>
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
                      <td key={cell.bucketId} className={`px-3 py-3 ${current ? "bg-entity-subtle" : ""}`}>
                        {cell.seconds === 0 && cell.vacation ? (
                          <span className="text-micro font-semibold text-entity-text">{t("vacation", "dovolenka", "szabadság")}</span>
                        ) : cell.seconds === 0 ? (
                          <span className="text-gray-300">—</span>
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
                            className="block w-full rounded-lg text-left transition-colors hover:bg-white/80 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-entity"
                          >
                            <WorkedTotal workedSec={cell.seconds} projectSec={cell.deliveredSeconds} compact />
                            {Object.keys(cell.cost).length > 0 && <MoneyText bag={cell.cost} language={deps.language} tone="cost" className="type-meta" />}
                            {row.employeeId != null && (
                              <span className="mt-1 block h-1 overflow-hidden rounded-full bg-gray-200">
                                <span className={`block h-full rounded-full transition-[width] duration-500 ${hasTarget && ratio < 0.75 ? "bg-amber-500" : "bg-entity-solid"}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                              </span>
                            )}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3">
                    <WorkedTotal workedSec={row.totalSeconds} projectSec={row.totalDeliveredSeconds} compact />
                    <MoneyText bag={row.totalCost} language={deps.language} tone="cost" className="type-meta" />
                  </td>
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold" data-testid="team-totals">
                <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left">{t("Totals", "Súčet", "Végösszeg")}</th>
                {matrix.buckets.map((b, i) => (
                  <td key={b.id} className="px-3 py-3">
                    <WorkedTotal workedSec={matrix.totals.seconds[i]} projectSec={matrix.totals.deliveredSeconds[i]} compact plain />
                    <MoneyText bag={matrix.totals.cost[i]} language={deps.language} tone="cost" className="type-meta" />
                  </td>
                ))}
                <td className="px-3 py-3">
                  <WorkedTotal workedSec={matrix.totals.totalSeconds} projectSec={matrix.totals.totalDeliveredSeconds} compact plain />
                  <MoneyText bag={matrix.totals.totalCost} language={deps.language} tone="cost" className="type-meta" />
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </Surface>

      <div className="grid gap-1 type-meta text-gray-500" data-testid="team-legend">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1 w-6 rounded-full bg-entity-solid" />
            {t("bar = hours vs the working hours of that period", "pruh = hodiny voči pracovným hodinám obdobia", "sáv = órák és az időszak munkaóráinak aránya")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1 w-6 rounded-full bg-amber-500" />
            {t("under 75 % of the working hours — people with an employee record, except contractors; people without one have no bar", "pod 75 % pracovných hodín — osoby so záznamom zamestnanca okrem dodávateľov; osoby bez neho nemajú pruh", "a munkaórák 75 %-a alatt — munkatársi nyilvántartással rendelkező személyek, a vállalkozók kivételével; akinek nincs, annak nincs sávja")}
          </span>
        </p>
        <p>{t("“no rate” = the user has no linked employee or no salary, so cost cannot be calculated.", "„bez sadzby“ = používateľ nemá pripojeného zamestnanca alebo mzdu, takže náklady sa nedajú vypočítať.", "„nincs díj” = a felhasználóhoz nincs munkatárs vagy bér rendelve, ezért a költség nem számolható.")}</p>
      </div>

      {pop && popCell && popRow &&
        createPortal(
          <div
            data-team-pop=""
            className="fixed z-40 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
            style={{ top: pop.top, left: pop.left, ...(entityAccentStyle("time-tracking") as React.CSSProperties) }}
          >
            <p className="type-card-title text-gray-900">{popRow.name}</p>
            <p className="type-meta text-gray-500">{dayLabel(popCell.from)} – {dayLabel(popCell.to)}</p>
            <ul className="mt-2 grid gap-1.5">
              {popCell.projects.length === 0 && <li className="text-ui text-gray-400">—</li>}
              {popCell.projects.map((slice) => (
                <li key={slice.projectId ?? "none"} className="flex items-baseline justify-between gap-2 text-ui">
                  <span className="truncate text-gray-700">{slice.projectId ? lookups.projectName(slice.projectId) : t("Unallocated", "Nepriradené", "Nincs projekt")}</span>
                  <span className="shrink-0 text-right">
                    <span className="block tabular-nums font-semibold text-entity-text">{formatDuration(slice.seconds)}</span>
                    <MoneyText bag={slice.cost} language={deps.language} tone="cost" className="type-meta" />
                  </span>
                </li>
              ))}
            </ul>
            {popCell.basisSeconds > 0 && (
              <p className="mt-2 border-t border-gray-100 pt-2 type-meta tabular-nums text-gray-500" data-testid="team-pop-basis">
                {formatDuration(popCell.seconds)} {t("of", "z", "ennyiből:")} {formatDuration(popCell.basisSeconds)} h · {Math.round((popCell.seconds / popCell.basisSeconds) * 100)} %
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                requestOpenList(pop.userId, popCell.from, popCell.to);
                onNavigate("time-tracking");
                setPop(null);
              }}
              className="mt-3 text-ui font-semibold text-entity-text cursor-pointer hover:underline"
            >
              {t("Open entries →", "Otvoriť záznamy →", "Bejegyzések megnyitása →")}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
};
