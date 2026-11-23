/**
 * Lead KPIs of the KPI strip: Obrat, Konverzia lead -> klient, Priemerná hodnota zákazky.
 *
 * `computeLeadKpis` is what `Dashboard.tsx` does for its own cards: the date filter of
 * `filteredLeads` (not archived, not the `unassigned-docs` row, `createdAt` in the range, end of
 * day inclusive), then `leadKpis` of `dashboardMetrics.ts` over the pipeline leads (a client
 * record is not a lead; "won" is a winning closed stage, never a lost one). The counting itself
 * lives there and is reused, not copied.
 */

import type { Lead } from "../../types/index.ts";
import type { KpiStripData, PerformancePeriod } from "../../components/dashboard/performance/types.ts";
import { isPipelineLead, leadKpis, type LeadKpis } from "../dashboardMetrics.ts";
import { endOfDay, isInRange, parseAppDate, startOfDay } from "./period.ts";

export type LeadKpiResult = LeadKpis;

export interface LeadKpiRange {
  start: Date | null;
  end: Date | null;
}

export const computeLeadKpis = (
  leads: readonly Lead[],
  range: LeadKpiRange,
  leadStageGroups: Record<string, string>,
  leadStateParents: Record<string, string>,
): LeadKpiResult => {
  const start = range.start ? startOfDay(range.start) : null;
  const end = range.end ? endOfDay(range.end) : null;

  const filtered = leads.filter((lead) => {
    if (lead.id === "unassigned-docs" || lead.archived) return false;
    if (!lead.createdAt) return false;
    return isInRange(parseAppDate(lead.createdAt), start, end);
  });
  return leadKpis(filtered.filter(isPipelineLead), leadStageGroups, leadStateParents);
};

/** conversionPct is 0 for an empty pipeline in `leadKpis`; the strip wants null there. */
const rateOf = (k: LeadKpiResult): number | null => (k.total > 0 ? k.conversionPct : null);
const averageOf = (k: LeadKpiResult): number | null => (k.won.count > 0 ? k.won.value / k.won.count : null);

const pctChange = (current: number, previous: number | null | undefined): number | null =>
  previous === null || previous === undefined || previous === 0 ? null : ((current - previous) / previous) * 100;

export interface KpiStripInput {
  current: LeadKpiResult;
  /** The previous period's figures; null for "all time" or when there is none. */
  previous: LeadKpiResult | null;
  offerSuccess: KpiStripData["offerSuccess"];
  /** Optional: a period of preset "all" never carries deltas, whatever `previous` holds. */
  period?: Pick<PerformancePeriod, "preset">;
}

export const buildKpiStrip = ({ current, previous, offerSuccess, period }: KpiStripInput): KpiStripData => {
  const prev = period?.preset === "all" ? null : previous;
  const rate = rateOf(current);
  const prevRate = prev ? rateOf(prev) : null;
  const average = averageOf(current);
  return {
    revenue: { value: current.won.value, deltaPct: prev ? pctChange(current.won.value, prev.won.value) : null },
    leadConversion: {
      ratePct: rate,
      converted: current.won.count,
      total: current.total,
      deltaPp: rate !== null && prevRate !== null ? rate - prevRate : null,
    },
    offerSuccess,
    averageDeal: {
      value: average,
      deals: current.won.count,
      deltaPct: prev && average !== null ? pctChange(average, averageOf(prev)) : null,
    },
  };
};
