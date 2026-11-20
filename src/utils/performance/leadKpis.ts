/**
 * Lead KPIs of the KPI strip: Obrat, Konverzia lead -> klient, Priemerná hodnota zákazky.
 *
 * `computeLeadKpis` is the formula `Dashboard.tsx` has used for these cards (`filteredLeads`,
 * `wonLeads`, `activePipelineLeads`, `totalRevenue`, `leadToClientConversion`, `averageDealValue`),
 * moved here so the tab and the old cards cannot drift apart:
 *
 * - a lead counts when it is not archived, is not the `unassigned-docs` row and its `createdAt`
 *   lies in the range (end of day inclusive);
 * - "won" is `isClosedLeadState` (note: that is every closed phase of the pipeline settings);
 * - the pipeline is every counted lead whose phase group is not "closed" (a phase with no group
 *   counts as "in_progress");
 * - conversion = won / pipeline x 100; average deal = revenue / won.
 */

import type { Lead } from "../../types/index.ts";
import type { KpiStripData, PerformancePeriod } from "../../components/dashboard/performance/types.ts";
import { isClosedLeadState } from "../leadSla.ts";
import { endOfDay, isInRange, parseAppDate, startOfDay } from "./period.ts";

export interface LeadKpiRange {
  start: Date | null;
  end: Date | null;
}

export interface LeadKpiResult {
  /** Sum of the value of the won leads. */
  revenue: number;
  wonCount: number;
  /** Leads in the open pipeline: the figure the conversion divides by. */
  openCount: number;
  /** wonCount / openCount x 100; null when the pipeline is empty. */
  conversionPct: number | null;
  /** revenue / wonCount; null without a won lead. */
  averageDeal: number | null;
}

export const computeLeadKpis = (
  leads: readonly Lead[],
  range: LeadKpiRange,
  leadStageGroups: Record<string, string>,
  leadStateParents: Record<string, string>,
): LeadKpiResult => {
  const start = range.start ? startOfDay(range.start) : null;
  const end = range.end ? endOfDay(range.end) : null;

  let revenue = 0;
  let wonCount = 0;
  let openCount = 0;

  for (const lead of leads) {
    if (lead.id === "unassigned-docs" || lead.archived) continue;
    if (!lead.createdAt) continue;
    if (!isInRange(parseAppDate(lead.createdAt), start, end)) continue;

    if (isClosedLeadState(lead.status, leadStageGroups, leadStateParents)) {
      wonCount += 1;
      revenue += Number(lead.value) || 0;
    }

    const statusLower = (lead.status || "").toLowerCase();
    const parentStatus = leadStateParents[statusLower];
    const targetStatus = parentStatus ? parentStatus.toLowerCase() : statusLower;
    const group = leadStageGroups[targetStatus] || "in_progress";
    if (group !== "closed") openCount += 1;
  }

  return {
    revenue,
    wonCount,
    openCount,
    conversionPct: openCount > 0 ? (wonCount / openCount) * 100 : null,
    averageDeal: wonCount > 0 ? revenue / wonCount : null,
  };
};

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
  return {
    revenue: { value: current.revenue, deltaPct: prev ? pctChange(current.revenue, prev.revenue) : null },
    leadConversion: {
      ratePct: current.conversionPct,
      converted: current.wonCount,
      total: current.openCount,
      deltaPp:
        prev && current.conversionPct !== null && prev.conversionPct !== null ? current.conversionPct - prev.conversionPct : null,
    },
    offerSuccess,
    averageDeal: {
      value: current.averageDeal,
      deals: current.wonCount,
      deltaPct: prev && current.averageDeal !== null ? pctChange(current.averageDeal, prev.averageDeal) : null,
    },
  };
};
