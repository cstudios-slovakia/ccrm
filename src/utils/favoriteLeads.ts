/**
 * "Show favorite leads always as first": lifts the user's favorite leads out of their
 * normal groups into one group of their own, placed first.
 *
 * Works on the groups the leads screen already built (by state, by PM, a plain
 * sorted list, or the kanban columns), so everything that was applied to them —
 * search, filters, visible states, the current sort — has already happened. A
 * favorite is *moved*, never copied: the same lead in two groups would double
 * its selection, inline-edit and React key.
 */

/** Reserved group key. Not a possible state name, so it never clashes with one. */
export const FAVORITES_GROUP = "__favorites__";

/** rose-500; the group and its rows tint with it. */
export const FAVORITES_COLOR = "#f43f5e";

interface LeadGroup {
  state: string;
  colorOverride?: string;
  leads: { id: string }[];
}

/**
 * @param dropEmpty drop groups the move left empty. A state group or kanban
 *   column stays (an empty stage is information), a PM or "all leads" group goes.
 */
export function pinFavoriteLeads<G extends LeadGroup>(
  groups: G[],
  isFavorite: (id: string) => boolean,
  dropEmpty: boolean,
): G[] {
  const pinned = groups.flatMap((g) => g.leads.filter((l) => isFavorite(l.id)));
  if (pinned.length === 0) return groups;

  const ids = new Set(pinned.map((l) => l.id));
  const rest = groups
    .map((g) => ({ ...g, leads: g.leads.filter((l) => !ids.has(l.id)) }))
    .filter((g) => !dropEmpty || g.leads.length > 0);

  const favorites = {
    state: FAVORITES_GROUP,
    colorOverride: FAVORITES_COLOR,
    leads: pinned,
  } as G;
  return [favorites, ...rest];
}
