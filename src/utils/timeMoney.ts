import { withoutHiddenCost } from "./timeTeam.ts";

/**
 * Pay that does not move with tracked hours: an employee on a fixed monthly salary (or a daily rate)
 * earns the same however long the timer ran, so a labour-cost figure on their own time means nothing
 * to them. Contractors (`contractor_*`) and hourly pay do depend on tracked hours.
 * The entry carries the source its cost was frozen with, so no employee record is needed here.
 */
const FIXED_PAY_SOURCES: ReadonlySet<string> = new Set(["monthly", "daily"]);

export const isFixedPayEntry = (entry: { costRateSource?: string | null }): boolean =>
  !!entry.costRateSource && FIXED_PAY_SOURCES.has(entry.costRateSource);

/**
 * The viewer's own fixed-pay entries lose every money field. People with the costs permission keep
 * everything (an admin browsing an employee's time still sees the sums), and so do entries of other
 * people, which `withoutHiddenCost` already handles for viewers without the permission.
 */
export const withoutFixedPayMoney = <T extends { userId: string; costRateSource?: string | null }>(
  entry: T,
  viewerUserId: string,
  canCosts: boolean,
): T => {
  if (canCosts || entry.userId !== viewerUserId || !isFixedPayEntry(entry)) return entry;
  // Same viewer as the owner, so `withoutHiddenCost` would keep everything: strip as for a stranger.
  return withoutHiddenCost(entry, `not-${viewerUserId}`, false);
};

/** `withoutFixedPayMoney` over a list; the same array when nothing changed (stable for memo and effects). */
export const withoutFixedPayMoneyList = <T extends { userId: string; costRateSource?: string | null }>(
  entries: readonly T[],
  viewerUserId: string,
  canCosts: boolean,
): readonly T[] => {
  if (canCosts) return entries;
  let changed = false;
  const next = entries.map((e) => {
    const out = withoutFixedPayMoney(e, viewerUserId, canCosts);
    if (out !== e) changed = true;
    return out;
  });
  return changed ? next : entries;
};
