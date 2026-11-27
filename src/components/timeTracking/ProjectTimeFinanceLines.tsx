import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, EyeOff, RotateCcw } from "lucide-react";
import type { Language } from "../../utils/translations";
import { formatDuration } from "../../utils/timeTracking.ts";
import { getProjectCosts, setProjectCostExclusion, type ProjectCostItem } from "../../utils/timeTrackingApi";
import { summarizeProjectLabourCosts } from "../../utils/projectTimeLabour";

export { summarizeProjectLabourCosts };

const pick = (language: Language, en: string, sk: string, hu: string) => (language === "sk" ? sk : language === "hu" ? hu : en);

/**
 * Two information lines under the project's Costs card. "Labour" is the sum of the stored entry cost
 * (each person's worked time x their hourly cost). "Billable work" is tracked hours x billable rate (C13);
 * it is shown for reference only and is never added to Invoicable, income or any total (D3.4).
 */
export function ProjectTimeFinanceLines({
  language,
  money,
  labourCost,
  unpricedSeconds,
  billableValue,
  billableComplete,
}: {
  language: Language;
  money: (v: number) => string;
  labourCost: number | null;
  unpricedSeconds?: number;
  billableValue: number | null | undefined;
  billableComplete: boolean | undefined;
}) {
  return (
    <>
      {labourCost != null && (
        <div
          className="mt-1 type-meta text-violet-700"
          data-testid="project-labour-line"
          title={pick(language, "Cost of tracked time (each person's worked time × their hourly cost)", "Náklad sledovaného času (odpracovaný čas každého × jeho hodinový náklad)", "A követett idő költsége (mindenki ledolgozott ideje × órás költsége)")}
        >
          {pick(language, "Labour (time tracking)", "Práca (evidencia času)", "Munka (időkövetés)")}: {money(labourCost)}
          {unpricedSeconds != null && unpricedSeconds > 0 && (
            <span className="ml-1 text-amber-700" data-testid="project-labour-unpriced">
              ({pick(language, `incomplete: ${formatDuration(unpricedSeconds)} unpriced`, `neúplné: ${formatDuration(unpricedSeconds)} bez sadzby`, `hiányos: ${formatDuration(unpricedSeconds)} díj nélkül`)})
            </span>
          )}
        </div>
      )}
      {billableValue != null && (
        <div
          className="mt-1 type-meta text-gray-600"
          data-testid="project-billable-work-line"
          title={pick(language, "Tracked hours × billable rate. Information only: does not change Invoicable or income.", "Sledované hodiny × fakturačná sadzba. Len informatívne: nemení Fakturovateľné ani príjem.", "Követett órák × számlázási díj. Csak tájékoztató: nem módosítja a Számlázhatót és a bevételt.")}
        >
          {pick(language, "Billable work (time tracking)", "Fakturovateľná práca (sledovanie času)", "Számlázható munka (időkövetés)")}: {money(billableValue)}
          {billableComplete === false && (
            <span className="ml-1 text-amber-700">({pick(language, "incomplete: some entries have no rate", "neúplné: niektoré záznamy nemajú sadzbu", "hiányos: egyes bejegyzéseknek nincs díja")})</span>
          )}
        </div>
      )}
    </>
  );
}

/** Loads monthly × employee time-tracking costs for one project and toggles per-item exclusions. */
export function useProjectTimeCosts({
  projectId,
  enabled,
  canCosts,
  totalsCost,
  totalsUnpricedSeconds = 0,
  version,
  language,
  onChanged,
}: {
  projectId: string | undefined;
  enabled: boolean;
  canCosts: boolean;
  totalsCost: number | null;
  totalsUnpricedSeconds?: number;
  version: number;
  language: Language;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<ProjectCostItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || !projectId) {
      setItems([]);
      setLoaded(false);
      return;
    }
    let cancelled = false;
    getProjectCosts(projectId)
      .then((next) => {
        if (!cancelled) {
          setItems(next);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setLoaded(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, projectId, version]);

  const toggleExclusion = async (item: ProjectCostItem) => {
    if (!projectId) return;
    const nextExcluded = !item.excluded;
    setItems((prev) =>
      prev.map((row) =>
        row.userId === item.userId && row.month === item.month ? { ...row, excluded: nextExcluded } : row
      )
    );
    try {
      await setProjectCostExclusion({
        projectId,
        userId: item.userId,
        month: item.month,
        excluded: nextExcluded,
      });
      onChanged();
    } catch {
      setItems((prev) =>
        prev.map((row) =>
          row.userId === item.userId && row.month === item.month ? { ...row, excluded: item.excluded } : row
        )
      );
      window.showToast?.(
        pick(language, "Failed to update cost exclusion", "Nepodarilo sa uložiť vylúčenie nákladu", "Nem sikerült menteni a költség kizárását"),
        "error"
      );
    }
  };

  const { labourCost, unpricedSeconds } = useMemo(() => {
    if (!enabled) return { labourCost: null, unpricedSeconds: 0 };
    if (loaded) return summarizeProjectLabourCosts(items, canCosts);
    return { labourCost: totalsCost, unpricedSeconds: totalsCost != null ? totalsUnpricedSeconds : 0 };
  }, [enabled, canCosts, totalsCost, totalsUnpricedSeconds, loaded, items]);

  const visibleItems = useMemo(
    () => (enabled ? items.filter((i) => i.canSeeCost) : []),
    [enabled, items]
  );

  return { visibleItems, labourCost, unpricedSeconds, toggleExclusion };
}

/** Employee-grouped time-tracking rows inside Direct Project Costs & Materials, expandable by month. */
export function ProjectTimeCostRows({
  items,
  language,
  money,
  canToggle,
  onToggle,
}: {
  items: ProjectCostItem[];
  language: Language;
  money: (v: number) => string;
  canToggle: boolean;
  onToggle: (item: ProjectCostItem) => void;
}) {
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});
  const toggleExpand = (userId: string) =>
    setExpandedUsers((prev) => ({ ...prev, [userId]: !prev[userId] }));

  const payLabelOf = (st: string | null) => {
    if (st === "daily") return "MD";
    if (st === "hourly") return pick(language, "Hourly", "Hodinová", "Óradíj");
    if (st === "monthly") return pick(language, "Monthly", "Mesačná", "Havi");
    return "";
  };

  const groups = useMemo(() => {
    const map = new Map<string, ProjectCostItem[]>();
    for (const item of items) {
      const list = map.get(item.userId) ?? [];
      list.push(item);
      map.set(item.userId, list);
    }
    return [...map.entries()].map(([userId, months]) => {
      const sorted = [...months].sort((a, b) => b.month.localeCompare(a.month));
      const totalSeconds = sorted.reduce((s, r) => s + r.seconds, 0);
      const activeRows = sorted.filter((r) => !r.excluded);
      const excludedCount = sorted.length - activeRows.length;
      const allExcluded = activeRows.length === 0;
      const activeHasPriced = activeRows.some((r) => r.cost != null);
      const activeCost = activeHasPriced
        ? Math.round(activeRows.reduce((s, r) => s + (r.cost ?? 0), 0) * 100) / 100
        : null;
      const fullHasPriced = sorted.some((r) => r.cost != null);
      const fullCost = fullHasPriced
        ? Math.round(sorted.reduce((s, r) => s + (r.cost ?? 0), 0) * 100) / 100
        : null;
      const newest = sorted[0]?.month ?? "";
      const oldest = sorted[sorted.length - 1]?.month ?? "";
      return {
        userId,
        userName: sorted[0]?.userName ?? userId,
        salaryType: sorted[0]?.salaryType ?? null,
        months: sorted,
        dateLabel: sorted.length > 1 ? `${oldest} – ${newest}` : newest,
        totalSeconds,
        activeCost,
        fullCost,
        excludedCount,
        allExcluded,
      };
    });
  }, [items]);

  return (
    <>
      {groups.map((g) => {
        const payLabel = payLabelOf(g.salaryType);
        const isSingle = g.months.length === 1;
        const singleItem = isSingle ? g.months[0] : null;
        const expanded = !!expandedUsers[g.userId];
        const displayCost = g.allExcluded ? g.fullCost : g.activeCost;

        return (
          <Fragment key={`tt-user-${g.userId}`}>
            <tr className={`hover:bg-white/80 ${g.allExcluded ? "opacity-60" : ""}`}>
              <td className="py-2.5 px-3 whitespace-nowrap">
                {isSingle ? (
                  g.dateLabel
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleExpand(g.userId)}
                    className="inline-flex items-center gap-1 text-slate-700 hover:text-violet-700 cursor-pointer"
                    aria-expanded={expanded}
                    title={expanded
                      ? pick(language, "Collapse months", "Zbaliť mesiace", "Hónapok összecsukása")
                      : pick(language, "Expand by month", "Rozbaliť podľa mesiacov", "Kibontás hónapokra")}
                  >
                    {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                    <span>{g.dateLabel}</span>
                  </button>
                )}
              </td>
              <td className="py-2.5 px-3">
                <div className="flex items-center gap-2">
                  {!isSingle && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(g.userId)}
                      className="font-bold text-slate-900 hover:text-violet-700 cursor-pointer text-left"
                    >
                      {g.userName}
                    </button>
                  )}
                  {isSingle && <span className="font-bold text-slate-900">{g.userName}</span>}
                  <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-micro font-bold">
                    {pick(language, "Time tracking", "Evidencia času", "Időkövetés")}
                  </span>
                  {!isSingle && (
                    <span className="text-micro text-slate-400">
                      ({g.months.length} {pick(language, "months", "mes.", "hó")})
                    </span>
                  )}
                </div>
                <span className="text-micro text-slate-400">
                  {formatDuration(g.totalSeconds)}{payLabel ? ` · ${payLabel}` : ""}
                  {!g.allExcluded && g.excludedCount > 0 && (
                    <> · {g.excludedCount} {pick(language, "excluded", "vylúčené", "kizárva")}</>
                  )}
                </span>
              </td>
              <td className="py-2.5 px-3 text-right font-normal text-slate-400">—</td>
              <td className={`py-2.5 px-3 text-right font-bold tabular-nums ${g.allExcluded ? "line-through text-slate-400" : "text-violet-700"}`}>
                {displayCost != null ? money(displayCost) : "—"}
              </td>
              <td className="py-2.5 px-3 text-center">
                {g.allExcluded ? (
                  <span className="inline-flex px-2 py-0.5 rounded-full border border-slate-300 bg-slate-100 text-slate-600 text-micro font-bold">
                    {pick(language, "Excluded", "Vylúčené", "Kizárva")}
                  </span>
                ) : (
                  <span className="inline-flex px-2 py-0.5 rounded-full border border-violet-200 bg-violet-50 text-violet-700 text-micro font-bold">
                    {pick(language, "Time tracking", "Evidencia času", "Időkövetés")}
                  </span>
                )}
              </td>
              <td className="py-2.5 px-3 text-right">
                {isSingle && singleItem && canToggle ? (
                  <button
                    type="button"
                    onClick={() => onToggle(singleItem)}
                    title={singleItem.excluded
                      ? pick(language, "Include in project costs", "Zahrnúť do nákladov projektu", "Visszavétel a projektköltségekbe")
                      : pick(language, "Exclude from project costs (fixed agreement)", "Vylúčiť z nákladov projektu (fixná dohoda)", "Kizárás a projektköltségekből (fix megállapodás)")}
                    className="p-1 text-slate-400 hover:text-violet-600 rounded cursor-pointer"
                  >
                    {singleItem.excluded ? <RotateCcw className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                ) : !isSingle ? (
                  <button
                    type="button"
                    onClick={() => toggleExpand(g.userId)}
                    title={expanded
                      ? pick(language, "Collapse months", "Zbaliť mesiace", "Hónapok összecsukása")
                      : pick(language, "Expand by month", "Rozbaliť podľa mesiacov", "Kibontás hónapokra")}
                    className="p-1 text-slate-400 hover:text-violet-600 rounded cursor-pointer"
                  >
                    {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                ) : null}
              </td>
            </tr>

            {!isSingle && expanded && g.months.map((item) => (
              <tr key={`tt-${item.month}-${item.userId}`} className={`bg-violet-50/40 hover:bg-violet-50/70 ${item.excluded ? "opacity-60" : ""}`}>
                <td className="py-2 pl-8 pr-3 whitespace-nowrap text-slate-600">{item.month}</td>
                <td className="py-2 px-3 text-slate-600">
                  <span className="text-micro text-slate-500">
                    {formatDuration(item.seconds)}{payLabel ? ` · ${payLabel}` : ""}
                  </span>
                </td>
                <td className="py-2 px-3 text-right font-normal text-slate-400">—</td>
                <td className={`py-2 px-3 text-right font-semibold tabular-nums ${item.excluded ? "line-through text-slate-400" : "text-violet-700"}`}>
                  {item.cost != null ? money(item.cost) : "—"}
                </td>
                <td className="py-2 px-3 text-center">
                  {item.excluded ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full border border-slate-300 bg-slate-100 text-slate-600 text-micro font-bold">
                      {pick(language, "Excluded", "Vylúčené", "Kizárva")}
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-0.5 rounded-full border border-violet-200 bg-white text-violet-700 text-micro font-bold">
                      {pick(language, "Included", "Zahrnuté", "Beleszámítva")}
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 text-right">
                  {canToggle && (
                    <button
                      type="button"
                      onClick={() => onToggle(item)}
                      title={item.excluded
                        ? pick(language, "Include in project costs", "Zahrnúť do nákladov projektu", "Visszavétel a projektköltségekbe")
                        : pick(language, "Exclude from project costs (fixed agreement)", "Vylúčiť z nákladov projektu (fixná dohoda)", "Kizárás a projektköltségekből (fix megállapodás)")}
                      className="p-1 text-slate-400 hover:text-violet-600 rounded cursor-pointer"
                    >
                      {item.excluded ? <RotateCcw className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}
