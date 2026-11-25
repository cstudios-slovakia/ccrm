import type { ProjectCostItem } from "./timeTrackingApi.ts";

/**
 * Sums all known (non-excluded, priced) labour costs and counts active unpriced seconds separately.
 * Returns `labourCost: null` only when cost visibility is withheld for at least one contributor.
 */
export function summarizeProjectLabourCosts(
  items: readonly ProjectCostItem[],
  canCosts: boolean,
): { labourCost: number | null; unpricedSeconds: number } {
  if (!canCosts && items.some((i) => !i.canSeeCost)) {
    return { labourCost: null, unpricedSeconds: 0 };
  }
  const active = items.filter((i) => i.canSeeCost && !i.excluded);
  const labourCost = Math.round(active.reduce((sum, i) => sum + (i.cost ?? 0), 0) * 100) / 100;
  const unpricedSeconds = active.reduce(
    (sum, i) => sum + (i.unpricedSeconds ?? (i.cost == null && i.seconds > 0 ? i.seconds : 0)),
    0,
  );
  return { labourCost, unpricedSeconds };
}
