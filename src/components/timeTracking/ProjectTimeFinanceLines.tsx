import { useEffect, useMemo, useState } from "react";
import { EyeOff, RotateCcw } from "lucide-react";
import type { Language } from "../../utils/translations";
import { formatDuration } from "../../utils/timeTracking.ts";
import { getProjectCosts, setProjectCostExclusion, type ProjectCostItem } from "../../utils/timeTrackingApi";

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
  /** Tracked time whose entries have no cost; it is not in `labourCost`. */
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
          {!!unpricedSeconds && (
            <span className="ml-1 text-amber-700" data-testid="project-labour-unpriced">
              ({formatDuration(unpricedSeconds)} {pick(language, "without a cost rate, not included", "bez nákladovej sadzby, nezahrnuté", "költségdíj nélkül, nincs beleszámítva")})
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
  version,
  language,
  onChanged,
}: {
  projectId: string | undefined;
  enabled: boolean;
  canCosts: boolean;
  totalsCost: number | null;
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

  const labourCost = useMemo(() => {
    if (!enabled) return null;
    if (loaded) {
      if (!canCosts && items.some((i) => !i.canSeeCost)) return null;
      const active = items.filter((i) => i.canSeeCost && !i.excluded);
      if (active.some((i) => i.cost == null && i.seconds > 0)) return null;
      return Math.round(active.reduce((sum, i) => sum + (i.cost ?? 0), 0) * 100) / 100;
    }
    return totalsCost;
  }, [enabled, canCosts, totalsCost, loaded, items]);

  const visibleItems = useMemo(
    () => (enabled ? items.filter((i) => i.canSeeCost) : []),
    [enabled, items]
  );

  return { visibleItems, labourCost, toggleExclusion };
}

/** Monthly × employee time-tracking rows inside Direct Project Costs & Materials. */
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
  const payLabelOf = (st: string | null) => {
    if (st === "daily") return "MD";
    if (st === "hourly") return pick(language, "Hourly", "Hodinová", "Óradíj");
    if (st === "monthly") return pick(language, "Monthly", "Mesačná", "Havi");
    return "";
  };
  return (
    <>
      {items.map((item) => {
        const payLabel = payLabelOf(item.salaryType);
        return (
          <tr key={`tt-${item.month}-${item.userId}`} className={`hover:bg-white/80 ${item.excluded ? "opacity-60" : ""}`}>
            <td className="py-2.5 px-3 whitespace-nowrap">{item.month}</td>
            <td className="py-2.5 px-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">{item.userName}</span>
                <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-micro font-bold">
                  {pick(language, "Time tracking", "Evidencia času", "Időkövetés")}
                </span>
              </div>
              <span className="text-micro text-slate-400">
                {formatDuration(item.seconds)}{payLabel ? ` · ${payLabel}` : ""}
              </span>
            </td>
            <td className="py-2.5 px-3 text-right font-normal text-slate-400">—</td>
            <td className={`py-2.5 px-3 text-right font-bold tabular-nums ${item.excluded ? "line-through text-slate-400" : "text-violet-700"}`}>
              {item.cost != null ? money(item.cost) : "—"}
            </td>
            <td className="py-2.5 px-3 text-center">
              {item.excluded ? (
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
        );
      })}
    </>
  );
}
