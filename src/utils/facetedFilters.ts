/**
 * Faceted filtering for list screens: every filter dropdown shows how many rows
 * each of its options would give with ALL THE OTHER filters applied, so picking
 * "Contacted" in one dropdown leaves the manager dropdown listing only managers
 * who really have contacted leads.
 *
 * Generic on purpose (leads and projects use it today, other lists later): a
 * facet is "which values does a row carry" plus "which values are selected".
 */

export interface FacetDef<T> {
  id: string;
  /** Every value this row can be filed under for the facet (a lead's stage and its parent stage, a rating and "4 stars and up"). */
  valuesOf: (item: T) => string[];
  /** Selected values. Empty means the facet filters nothing. */
  selected: string[];
}

export interface FacetResult<T> {
  /** Rows that pass the base filter and every facet. */
  items: T[];
  /** Per facet: option value -> rows it would give with every other facet applied. */
  counts: Record<string, Map<string, number>>;
}

/**
 * @param base Filters that are not facets (search box, favourites, date range). They apply to every count too.
 */
export function applyFacets<T>(items: readonly T[], facets: readonly FacetDef<T>[], base?: (item: T) => boolean): FacetResult<T> {
  const counts: Record<string, Map<string, number>> = {};
  facets.forEach((f) => {
    counts[f.id] = new Map();
  });
  const selectedSets = facets.map((f) => new Set(f.selected));
  const out: T[] = [];

  for (const item of items) {
    if (base && !base(item)) continue;
    const values = facets.map((f) => f.valuesOf(item));
    // The facets this row fails. A row failing none is a result; a row failing
    // exactly one still counts for that facet's options (the others agree with it).
    const failing: number[] = [];
    for (let i = 0; i < facets.length && failing.length < 2; i++) {
      const sel = selectedSets[i];
      if (sel.size > 0 && !values[i].some((v) => sel.has(v))) failing.push(i);
    }
    if (failing.length > 1) continue;
    if (failing.length === 0) out.push(item);
    const countFor = (i: number) => {
      const map = counts[facets[i].id];
      new Set(values[i]).forEach((v) => map.set(v, (map.get(v) ?? 0) + 1));
    };
    if (failing.length === 0) facets.forEach((_, i) => countFor(i));
    else countFor(failing[0]);
  }
  return { items: out, counts };
}

/** What a facet dropdown needs to draw one row. */
export interface FacetOption {
  value: string;
  label: string;
  /** Rows this option would give right now. */
  count: number;
  /** Nesting level (a lead sub-stage under its stage). */
  indent?: number;
  /** Dot colour. */
  color?: string;
}

/**
 * Orders options for display: those that still match first, the ones the current
 * selection rules out (count 0) after them, selected ones always with the
 * matching group. A nested list (any indent) keeps its own order, because
 * sorting would pull a sub-stage away from its parent.
 */
export function orderFacetOptions(options: readonly FacetOption[], selected: readonly string[]): FacetOption[] {
  if (options.some((o) => o.indent)) return [...options];
  const sel = new Set(selected);
  const live = (o: FacetOption) => o.count > 0 || sel.has(o.value);
  return [...options.filter(live), ...options.filter((o) => !live(o))];
}

/** Adds the count of each option from a facet's count map. */
export function withCounts<O extends { value: string }>(options: readonly O[], counts: Map<string, number> | undefined): (O & { count: number })[] {
  return options.map((o) => ({ ...o, count: counts?.get(o.value) ?? 0 }));
}

/** A stored filter from before multi-select: "all" or a single string; now a list. */
export function toSelectionArray(stored: unknown): string[] {
  if (Array.isArray(stored)) return stored.filter((v): v is string => typeof v === "string");
  if (typeof stored === "string" && stored !== "" && stored !== "all") return [stored];
  return [];
}
