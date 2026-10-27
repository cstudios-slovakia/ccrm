/**
 * The task drawer's time section: who has logged time, and which cost figure
 * the viewer may see.
 *
 * Hours are not private (the task chip already sums every person). Cost follows
 * B8: the server sends `cost` on the viewer's own rows always, and on other
 * people's rows only with time_tracking_costs. A missing `cost` key means hidden.
 * `cost: null` means the time is visible but has no rate. A partial sum is never
 * presented as the task's labour cost.
 */

export interface TaskPersonTime {
  userId: string;
  seconds: number;
  /** Omitted when the viewer may not see this person's cost. Null when there is no rate. */
  cost?: number | null;
}

export interface TaskCostFigure {
  /** Sum when every person's cost is a number. Null when anyone is hidden or unrated. */
  total: number | null;
  /** The signed-in user's own cost, when the server sent a number. */
  own: number | null;
  /** The viewer has rows on this task and at least one of them has no rate. */
  ownUnrated: boolean;
}

export const taskCostFigure = (people: readonly TaskPersonTime[], viewerId: string | null): TaskCostFigure => {
  const ownRow = viewerId ? people.find((p) => p.userId === viewerId) : undefined;
  const own = ownRow && typeof ownRow.cost === "number" ? Math.round(ownRow.cost * 100) / 100 : null;
  const ownUnrated = !!ownRow && "cost" in ownRow && ownRow.cost === null;
  const complete = people.length > 0 && people.every((p) => typeof p.cost === "number");
  if (!complete) return { total: null, own, ownUnrated };
  let cents = 0;
  for (const p of people) cents += Math.round((p.cost as number) * 100);
  return { total: cents / 100, own, ownUnrated };
};

/**
 * Adds the running timer's elapsed seconds onto that person's row. Does not
 * invent a cost for time that has not been priced yet, and does not change
 * `people`.
 */
export const withRunningSeconds = (
  people: readonly TaskPersonTime[],
  running: { userId: string; seconds: number } | null,
): TaskPersonTime[] => {
  const next = people.map((p) => ({ ...p }));
  if (!running?.userId) return next;
  const row = next.find((p) => p.userId === running.userId);
  const extra = Math.max(0, Math.round(running.seconds));
  if (row) row.seconds += extra;
  else next.push({ userId: running.userId, seconds: extra });
  return next;
};
