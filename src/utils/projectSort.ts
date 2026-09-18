// Ordering for the projects list. Kept apart from the view so the rules —
// especially "a project with no value sorts last, whichever way you sort" —
// are the same in the table, the cards, and the tests.

export type BuiltinProjectSortKey = "default" | "name" | "client" | "type" | "managers" | "rating" | "deadline" | "progress" | "status";

/**
 * A column to order by: one of the built-in ones, or `attr:<attributeId>` for a
 * custom attribute a project type has put in its list. An attribute column
 * carries a sort arrow like every other header, so it has to be sortable by the
 * same route — see ProjectSortValues.attributes.
 */
export type ProjectSortKey = BuiltinProjectSortKey | `attr:${string}`;
export type ProjectSortDirection = "asc" | "desc";

export interface ProjectSort {
  key: ProjectSortKey;
  direction: ProjectSortDirection;
}

/** The order projects are stored in: newest first, as they are created. */
export const DEFAULT_PROJECT_SORT: ProjectSort = { key: "default", direction: "asc" };

export const PROJECT_SORT_KEYS: readonly BuiltinProjectSortKey[] = [
  "default",
  "name",
  "client",
  "type",
  "managers",
  "rating",
  "deadline",
  "progress",
  "status",
];

/** True for `attr:<something>` — an attribute column's key, whose id cannot be checked here. */
export const isAttributeSortKey = (key: string): key is `attr:${string}` =>
  key.startsWith("attr:") && key.length > "attr:".length;

/** A stored preference comes back from the database untyped; anything unrecognised is the default. */
export function normalizeProjectSort(value: unknown): ProjectSort {
  const v = value as Partial<ProjectSort> | null | undefined;
  const raw = v?.key;
  // An attribute key names an attribute of one project type, which this module
  // cannot see; the view drops the sort if the column is not on screen.
  const key: ProjectSortKey =
    typeof raw === "string" && (PROJECT_SORT_KEYS.includes(raw as BuiltinProjectSortKey) || isAttributeSortKey(raw))
      ? (raw as ProjectSortKey)
      : "default";
  const direction = v?.direction === "desc" ? "desc" : "asc";
  return { key, direction };
}

/**
 * What a click on a column header does: a new column starts ascending, the
 * active one flips, and a third click on a descending column returns to the
 * stored order — so the default is always one header away.
 */
export function nextProjectSort(current: ProjectSort, key: ProjectSortKey): ProjectSort {
  if (key === "default" || current.key !== key) return { key, direction: "asc" };
  if (current.direction === "asc") return { key, direction: "desc" };
  return DEFAULT_PROJECT_SORT;
}

/** Everything the sort needs to know about a project that the project itself does not carry. */
export interface ProjectSortValues {
  name: string;
  client: string;
  type: string;
  managers: string;
  /**
   * 1-5 stars, or null when nobody has rated the project. Unrated is an absent
   * value rather than a zero, so an unrated project sorts to the bottom in both
   * directions instead of pretending to be the least important one.
   */
  rating: number | null;
  /** "YYYY-MM-DD", or null when the project has none (or its type has no deadlines). */
  deadline: string | null;
  /** 0-100, or null when the project has no roadmap. */
  progress: number | null;
  /** Position of the status in the workflow order. */
  statusRank: number;
  /**
   * Comparable values for the custom attribute columns, keyed by the column's
   * own `attr:<attributeId>`. Absent for a project of a type that does not
   * carry the attribute, which reads as no value and sorts last — exactly what
   * a blank cell should do.
   */
  attributes?: Record<string, string | number | null>;
}

/** The one value the sort compares, whichever kind of column it is ordering by. */
function sortValueFor(values: ProjectSortValues, key: ProjectSortKey): string | number | null {
  if (isAttributeSortKey(key)) return values.attributes?.[key] ?? null;
  if (key === "status") return values.statusRank;
  if (key === "default") return null;
  return values[key];
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

const isEmpty = (v: string | number | null) => v === null || v === "";

/**
 * Sorts a copy of `items`. Ties, and the "default" key, keep the incoming order.
 * Empty values always go last, in both directions.
 */
export function sortProjects<T>(items: T[], sort: ProjectSort, valuesOf: (item: T) => ProjectSortValues): T[] {
  if (sort.key === "default") return items.slice();
  const sign = sort.direction === "desc" ? -1 : 1;

  return items
    .map((item, index) => ({ item, index, value: sortValueFor(valuesOf(item), sort.key) }))
    .sort((a, b) => {
      const aEmpty = isEmpty(a.value);
      const bEmpty = isEmpty(b.value);
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.index - b.index : aEmpty ? 1 : -1;
      const cmp =
        typeof a.value === "number" && typeof b.value === "number"
          ? a.value - b.value
          : collator.compare(String(a.value), String(b.value));
      return cmp !== 0 ? cmp * sign : a.index - b.index;
    })
    .map((row) => row.item);
}
