import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Surface } from "../layout";
import { listEntries } from "../../utils/timeTrackingApi.ts";
import { formatDuration, type TimeEntry } from "../../utils/timeTracking.ts";
import { entryWorkedSeconds, liveWorkedShares } from "../../utils/timeWorked.ts";
import { formatDateLocalized, localeCodeFor } from "../../utils/localTime";
import type { Language } from "../../utils/translations";
import type { Employee } from "../../types";
import { PRODUCT_NAME } from "../../utils/brand";
import { entityAccentStyle } from "../../utils/entityAccent";

interface Props {
  employee: Employee;
  language?: Language;
  t: (en: string, sk: string, hu: string) => string;
}

interface ProjectTag {
  name: string;
  seconds: number;
}

interface DayGroup {
  date: string;
  seconds: number;
  projects: ProjectTag[];
  tags: string[];
}

interface WeekGroup {
  key: string;
  isoWeek: number;
  startDate: string;
  endDate: string;
  seconds: number;
  projects: ProjectTag[];
  tags: string[];
  days: DayGroup[];
}

interface MonthGroup {
  monthKey: string;
  label: string;
  seconds: number;
  projects: ProjectTag[];
  tags: string[];
  weeks: WeekGroup[];
}

/** ISO week number + Monday..Sunday ISO dates for a local YYYY-MM-DD date. */
function isoWeekOf(ymd: string): { isoWeek: number; weekYear: number; monday: string; sunday: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  const mon = new Date(dt);
  mon.setUTCDate(dt.getUTCDate() - dow);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  // ISO week belongs to Thursday's year
  const thu = new Date(mon);
  thu.setUTCDate(mon.getUTCDate() + 3);
  const weekYear = thu.getUTCFullYear();
  const jan4 = new Date(Date.UTC(weekYear, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - jan4Dow);
  const isoWeek = Math.floor((mon.getTime() - week1Mon.getTime()) / (7 * 86_400_000)) + 1;
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { isoWeek, weekYear, monday: iso(mon), sunday: iso(sun) };
}

function monthLabelFor(monthKey: string, language: Language): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  const raw = new Date(y, m - 1, 1).toLocaleDateString(localeCodeFor(language), { month: "long", year: "numeric" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function weekRangeLabel(w: WeekGroup, language: Language): string {
  const from = formatDateLocalized(w.startDate, language, { day: "numeric", month: "short" });
  const to = formatDateLocalized(w.endDate, language, { day: "numeric", month: "short" });
  const prefix =
    language === "hu"
      ? `${w.isoWeek}. hét`
      : language === "sk"
        ? `T${w.isoWeek}`
        : `W${w.isoWeek}`;
  return `${prefix} · ${from} – ${to}`;
}

function sortedProjects(map: Map<string, number>): ProjectTag[] {
  return [...map.entries()]
    .map(([name, seconds]) => ({ name, seconds }))
    .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
}

function TagPills({ projects, tags }: { projects: ProjectTag[]; tags: string[] }) {
  if (projects.length === 0 && tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {projects.map((p) => (
        <span
          key={`p-${p.name}`}
          title={`${p.name}: ${formatDuration(p.seconds)}`}
          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-micro font-semibold bg-entity-subtle text-entity-text border border-entity-border"
        >
          {p.name}
        </span>
      ))}
      {tags.map((tag) => (
        <span
          key={`t-${tag}`}
          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-micro font-medium bg-gray-100 text-gray-600 border border-gray-200"
        >
          #{tag}
        </span>
      ))}
    </div>
  );
}

/** Native time entries for one employee, grouped Month → Week → Day with totals and project/entry tags. */
export function EmployeeCcrmTimesheet({ employee, language = "sk", t }: Props) {
  const brand = PRODUCT_NAME;
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [collapsedWeeks, setCollapsedWeeks] = useState<Record<string, boolean>>({});
  const userId = employee.userId || "";

  useEffect(() => {
    if (!userId) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    setEntries(null);
    setError(false);
    listEntries({ from: "2000-01-01", to: "2100-01-01", userId })
      .then(({ entries: rows }) => {
        if (cancelled) return;
        setEntries(rows.filter((entry) => entry.userId === userId));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const { totalSeconds, months } = useMemo(() => {
    if (!entries || entries.length === 0) return { totalSeconds: 0, months: [] as MonthGroup[] };
    const nowMs = Date.now();
    const live = entries.some((e) => e.running) ? liveWorkedShares(entries, nowMs) : undefined;
    const noProjectLabel = t("No project", "Bez projektu", "Projekt nélkül");

    type DayAcc = { seconds: number; projects: Map<string, number>; tags: Set<string> };
    type WeekAcc = { isoWeek: number; startDate: string; endDate: string; seconds: number; projects: Map<string, number>; tags: Set<string>; days: Map<string, DayAcc> };
    type MonthAcc = { seconds: number; projects: Map<string, number>; tags: Set<string>; weeks: Map<string, WeekAcc> };

    const monthMap = new Map<string, MonthAcc>();
    let grand = 0;

    for (const entry of entries) {
      const date = (entry.entryDate || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const sec = entryWorkedSeconds(entry, nowMs, live);
      grand += sec;

      const monthKey = date.slice(0, 7);
      const { isoWeek, weekYear, monday, sunday } = isoWeekOf(date);
      const weekKey = `${monthKey}|${weekYear}-W${String(isoWeek).padStart(2, "0")}`;
      const projName = (entry.projectName || "").trim() || noProjectLabel;
      const entryTags = Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [];

      let mAcc = monthMap.get(monthKey);
      if (!mAcc) {
        mAcc = { seconds: 0, projects: new Map(), tags: new Set(), weeks: new Map() };
        monthMap.set(monthKey, mAcc);
      }
      mAcc.seconds += sec;
      mAcc.projects.set(projName, (mAcc.projects.get(projName) ?? 0) + sec);
      entryTags.forEach((tg) => mAcc!.tags.add(tg));

      let wAcc = mAcc.weeks.get(weekKey);
      if (!wAcc) {
        wAcc = { isoWeek, startDate: monday, endDate: sunday, seconds: 0, projects: new Map(), tags: new Set(), days: new Map() };
        mAcc.weeks.set(weekKey, wAcc);
      }
      wAcc.seconds += sec;
      wAcc.projects.set(projName, (wAcc.projects.get(projName) ?? 0) + sec);
      entryTags.forEach((tg) => wAcc!.tags.add(tg));

      let dAcc = wAcc.days.get(date);
      if (!dAcc) {
        dAcc = { seconds: 0, projects: new Map(), tags: new Set() };
        wAcc.days.set(date, dAcc);
      }
      dAcc.seconds += sec;
      dAcc.projects.set(projName, (dAcc.projects.get(projName) ?? 0) + sec);
      entryTags.forEach((tg) => dAcc!.tags.add(tg));
    }

    const built: MonthGroup[] = [...monthMap.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([monthKey, mAcc]) => ({
        monthKey,
        label: monthLabelFor(monthKey, language),
        seconds: mAcc.seconds,
        projects: sortedProjects(mAcc.projects),
        tags: [...mAcc.tags].sort(),
        weeks: [...mAcc.weeks.entries()]
          .sort((a, b) => b[1].startDate.localeCompare(a[1].startDate))
          .map(([key, wAcc]) => ({
            key,
            isoWeek: wAcc.isoWeek,
            startDate: wAcc.startDate,
            endDate: wAcc.endDate,
            seconds: wAcc.seconds,
            projects: sortedProjects(wAcc.projects),
            tags: [...wAcc.tags].sort(),
            days: [...wAcc.days.entries()]
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([date, dAcc]) => ({
                date,
                seconds: dAcc.seconds,
                projects: sortedProjects(dAcc.projects),
                tags: [...dAcc.tags].sort(),
              })),
          })),
      }));

    return { totalSeconds: grand, months: built };
  }, [entries, language, t]);

  const isMonthExpanded = (monthKey: string, index: number) =>
    monthKey in expandedMonths ? expandedMonths[monthKey] : index === 0;

  const toggleMonth = (monthKey: string, index: number) => {
    const currently = isMonthExpanded(monthKey, index);
    setExpandedMonths((prev) => ({ ...prev, [monthKey]: !currently }));
  };

  const toggleWeek = (weekKey: string) => {
    setCollapsedWeeks((prev) => ({ ...prev, [weekKey]: !prev[weekKey] }));
  };

  if (!userId) {
    return (
      <Surface>
        <p className="text-body text-gray-500">
          {t(
            `This employee has no ${brand} login, so there is no native time to show.`,
            `Tento zamestnanec nemá prihlásenie do ${brand}, preto nie je čo zobraziť z evidencie času.`,
            `Ennek a munkatársnak nincs ${brand}-belépése, ezért nincs natív rögzített idő.`,
          )}
        </p>
      </Surface>
    );
  }

  return (
    <div style={entityAccentStyle("time-tracking") as React.CSSProperties}>
      <Surface className="space-y-4" data-testid="ccrm-timesheet">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="type-card-title text-gray-900">{t(`${brand} time tracking`, `Evidencia času ${brand}`, `${brand} időkövetés`)}</h3>
          {entries !== null && !error && (
            <span className="text-metric tabular-nums text-entity-text">{formatDuration(totalSeconds)}</span>
          )}
        </div>

        {error ? (
          <p className="text-body text-rose-700">{t("Could not load time entries.", "Záznamy času sa nepodarilo načítať.", "Az időbejegyzéseket nem sikerült betölteni.")}</p>
        ) : entries === null ? (
          <p className="text-body text-gray-500">{t("Loading…", "Načítava sa…", "Betöltés…")}</p>
        ) : months.length === 0 ? (
          <p className="text-body text-gray-500">{t("No time logged yet.", "Zatiaľ nie je zaznamenaný žiadny čas.", "Még nincs rögzített idő.")}</p>
        ) : (
          <div className="space-y-3">
            {months.map((m, idx) => {
              const mOpen = isMonthExpanded(m.monthKey, idx);
              return (
                <div key={m.monthKey} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleMonth(m.monthKey, idx)}
                    aria-expanded={mOpen}
                    className="w-full flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-gray-50/80 hover:bg-gray-100/80 transition-colors cursor-pointer text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      {mOpen ? <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-500 shrink-0" />}
                      <span className="text-ui font-bold text-gray-900">{m.label}</span>
                      <TagPills projects={m.projects} tags={m.tags} />
                    </div>
                    <span className="text-ui font-bold tabular-nums text-entity-text shrink-0">{formatDuration(m.seconds)}</span>
                  </button>

                  {mOpen && (
                    <div className="divide-y divide-gray-100">
                      {m.weeks.map((w) => {
                        const wOpen = !collapsedWeeks[w.key];
                        return (
                          <div key={w.key}>
                            <button
                              type="button"
                              onClick={() => toggleWeek(w.key)}
                              aria-expanded={wOpen}
                              className="w-full flex flex-wrap items-center justify-between gap-2 pl-6 pr-3.5 py-2 bg-gray-50/40 hover:bg-gray-50 transition-colors cursor-pointer text-left"
                            >
                              <div className="flex flex-wrap items-center gap-2 min-w-0">
                                {wOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                                <span className="text-caption font-semibold text-gray-700">{weekRangeLabel(w, language)}</span>
                                <TagPills projects={w.projects} tags={w.tags} />
                              </div>
                              <span className="text-caption font-bold tabular-nums text-gray-800 shrink-0">{formatDuration(w.seconds)}</span>
                            </button>

                            {wOpen && (
                              <ul className="divide-y divide-gray-100">
                                {w.days.map((day) => (
                                  <li key={day.date} className="flex flex-wrap items-center justify-between gap-2 pl-12 pr-3.5 py-2 text-ui">
                                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                                      <span className="tabular-nums text-gray-700 whitespace-nowrap">
                                        {formatDateLocalized(day.date, language, { weekday: "short", day: "numeric", month: "numeric", year: "numeric" })}
                                      </span>
                                      <TagPills projects={day.projects} tags={day.tags} />
                                    </div>
                                    <span className="tabular-nums font-semibold text-gray-900 shrink-0">{formatDuration(day.seconds)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Surface>
    </div>
  );
}
