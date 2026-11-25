import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Surface } from "../layout";
import { listEntries } from "../../utils/timeTrackingApi.ts";
import { formatDuration, projectColor, type TimeEntry } from "../../utils/timeTracking.ts";
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
  key: string;
  projectId: string | null;
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

function sortedProjects(map: Map<string, ProjectTag>): ProjectTag[] {
  return [...map.values()].sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
}

function addProjectSec(map: Map<string, ProjectTag>, projectId: string | null, name: string, sec: number) {
  const key = projectId || `__none__:${name}`;
  const prev = map.get(key);
  if (prev) prev.seconds += sec;
  else map.set(key, { key, projectId, name, seconds: sec });
}

function TagPills({
  projects,
  tags,
  activeTag,
  onToggleTag,
  t,
}: {
  projects: ProjectTag[];
  tags: string[];
  activeTag: string | null;
  onToggleTag: (tag: string) => void;
  t: (en: string, sk: string, hu: string) => string;
}) {
  if (projects.length === 0 && tags.length === 0) return <div className="flex-1 min-w-0" />;
  return (
    <div
      className="flex flex-nowrap items-center gap-1.5 min-w-0 flex-1 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {projects.map((p) => {
        const color = projectColor(p.projectId);
        const pillStyle = p.projectId
          ? { backgroundColor: `${color}14`, borderColor: `${color}45`, color }
          : undefined;
        const baseCls =
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-micro font-semibold border shrink-0 whitespace-nowrap transition-opacity";
        const content = (
          <>
            <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span>{p.name}</span>
          </>
        );
        if (p.projectId) {
          return (
            <a
              key={`p-${p.key}`}
              href={`#projects/${encodeURIComponent(p.projectId)}`}
              title={`${p.name}: ${formatDuration(p.seconds)} · ${t("Open project", "Otvoriť projekt", "Projekt megnyitása")}`}
              style={pillStyle}
              className={`${baseCls} hover:opacity-80 cursor-pointer`}
            >
              {content}
            </a>
          );
        }
        return (
          <span
            key={`p-${p.key}`}
            title={`${p.name}: ${formatDuration(p.seconds)}`}
            className={`${baseCls} bg-gray-100 text-gray-500 border-gray-200`}
          >
            {content}
          </span>
        );
      })}
      {tags.map((tag) => {
        const color = projectColor(`tag:${tag}`);
        const isActive = activeTag === tag;
        return (
          <button
            key={`t-${tag}`}
            type="button"
            onClick={() => onToggleTag(tag)}
            title={
              isActive
                ? t("Clear tag filter", "Zrušiť filter štítku", "Címkeszűrő törlése")
                : t(`Filter by #${tag}`, `Filtrovať podľa #${tag}`, `Szűrés: #${tag}`)
            }
            style={
              isActive
                ? { backgroundColor: color, borderColor: color, color: "#ffffff" }
                : { backgroundColor: `${color}12`, borderColor: `${color}38`, color }
            }
            className="inline-flex items-center px-1.5 py-0.5 rounded-md text-micro font-medium border shrink-0 whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity"
          >
            #{tag}
          </button>
        );
      })}
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
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const userId = employee.userId || "";
  const toggleTagFilter = (tag: string) => setActiveTag((prev) => (prev === tag ? null : tag));

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

    type DayAcc = { seconds: number; projects: Map<string, ProjectTag>; tags: Set<string> };
    type WeekAcc = { isoWeek: number; startDate: string; endDate: string; seconds: number; projects: Map<string, ProjectTag>; tags: Set<string>; days: Map<string, DayAcc> };
    type MonthAcc = { seconds: number; projects: Map<string, ProjectTag>; tags: Set<string>; weeks: Map<string, WeekAcc> };

    const monthMap = new Map<string, MonthAcc>();
    let grand = 0;

    for (const entry of entries) {
      const date = (entry.entryDate || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const entryTags = Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [];
      if (activeTag && !entryTags.includes(activeTag)) continue;
      const sec = entryWorkedSeconds(entry, nowMs, live);
      grand += sec;

      const monthKey = date.slice(0, 7);
      const { isoWeek, weekYear, monday, sunday } = isoWeekOf(date);
      const weekKey = `${monthKey}|${weekYear}-W${String(isoWeek).padStart(2, "0")}`;
      const projId = entry.projectId || null;
      const projName = (entry.projectName || "").trim() || noProjectLabel;

      let mAcc = monthMap.get(monthKey);
      if (!mAcc) {
        mAcc = { seconds: 0, projects: new Map(), tags: new Set(), weeks: new Map() };
        monthMap.set(monthKey, mAcc);
      }
      mAcc.seconds += sec;
      addProjectSec(mAcc.projects, projId, projName, sec);
      entryTags.forEach((tg) => mAcc!.tags.add(tg));

      let wAcc = mAcc.weeks.get(weekKey);
      if (!wAcc) {
        wAcc = { isoWeek, startDate: monday, endDate: sunday, seconds: 0, projects: new Map(), tags: new Set(), days: new Map() };
        mAcc.weeks.set(weekKey, wAcc);
      }
      wAcc.seconds += sec;
      addProjectSec(wAcc.projects, projId, projName, sec);
      entryTags.forEach((tg) => wAcc!.tags.add(tg));

      let dAcc = wAcc.days.get(date);
      if (!dAcc) {
        dAcc = { seconds: 0, projects: new Map(), tags: new Set() };
        wAcc.days.set(date, dAcc);
      }
      dAcc.seconds += sec;
      addProjectSec(dAcc.projects, projId, projName, sec);
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
  }, [entries, activeTag, language, t]);

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
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="type-card-title text-gray-900 truncate">{t(`${brand} time tracking`, `Evidencia času ${brand}`, `${brand} időkövetés`)}</h3>
            {activeTag && (
              <button
                type="button"
                onClick={() => setActiveTag(null)}
                style={{ backgroundColor: projectColor(`tag:${activeTag}`), color: "#ffffff" }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-semibold cursor-pointer hover:opacity-85 shrink-0"
              >
                <span>#{activeTag}</span>
                <X className="size-3" />
              </button>
            )}
          </div>
          {entries !== null && !error && (
            <span className="text-metric tabular-nums text-entity-text shrink-0">{formatDuration(totalSeconds)}</span>
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
                  <div
                    onClick={() => toggleMonth(m.monthKey, idx)}
                    className="w-full flex flex-nowrap items-center gap-2.5 px-3.5 py-2.5 bg-gray-50/80 hover:bg-gray-100/80 transition-colors cursor-pointer"
                  >
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleMonth(m.monthKey, idx); }}
                      aria-expanded={mOpen}
                      className="inline-flex items-center gap-2 shrink-0 whitespace-nowrap cursor-pointer text-left"
                    >
                      {mOpen ? <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-500 shrink-0" />}
                      <span className="text-ui font-bold text-gray-900">{m.label}</span>
                    </button>
                    <TagPills projects={m.projects} tags={m.tags} activeTag={activeTag} onToggleTag={toggleTagFilter} t={t} />
                    <span className="text-ui font-bold tabular-nums text-entity-text shrink-0 whitespace-nowrap">{formatDuration(m.seconds)}</span>
                  </div>

                  {mOpen && (
                    <div className="divide-y divide-gray-100">
                      {m.weeks.map((w) => {
                        const wOpen = !collapsedWeeks[w.key];
                        return (
                          <div key={w.key}>
                            <div
                              onClick={() => toggleWeek(w.key)}
                              className="w-full flex flex-nowrap items-center gap-2.5 pl-6 pr-3.5 py-2 bg-gray-50/40 hover:bg-gray-50 transition-colors cursor-pointer"
                            >
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleWeek(w.key); }}
                                aria-expanded={wOpen}
                                className="inline-flex items-center gap-2 shrink-0 whitespace-nowrap cursor-pointer text-left"
                              >
                                {wOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                                <span className="text-caption font-semibold text-gray-700">{weekRangeLabel(w, language)}</span>
                              </button>
                              <TagPills projects={w.projects} tags={w.tags} activeTag={activeTag} onToggleTag={toggleTagFilter} t={t} />
                              <span className="text-caption font-bold tabular-nums text-gray-800 shrink-0 whitespace-nowrap">{formatDuration(w.seconds)}</span>
                            </div>

                            {wOpen && (
                              <ul className="divide-y divide-gray-100">
                                {w.days.map((day) => (
                                  <li key={day.date} className="flex flex-nowrap items-center gap-2.5 pl-12 pr-3.5 py-2 text-ui">
                                    <span className="tabular-nums text-gray-700 shrink-0 whitespace-nowrap">
                                      {formatDateLocalized(day.date, language, { weekday: "short", day: "numeric", month: "numeric", year: "numeric" })}
                                    </span>
                                    <TagPills projects={day.projects} tags={day.tags} activeTag={activeTag} onToggleTag={toggleTagFilter} t={t} />
                                    <span className="tabular-nums font-semibold text-gray-900 shrink-0 whitespace-nowrap">{formatDuration(day.seconds)}</span>
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
