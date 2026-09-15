// Ordering for the projects list. Kept apart from the view so the rules —
// especially "a project with no value sorts last, whichever way you sort" —
// are the same in the table, the cards, and the tests.

export type ProjectSortKey = "default" | "name" | "client" | "type" | "managers" | "deadline" | "progress" | "status";
export type ProjectSortDirection = "asc" | "desc";

export interface ProjectSort {
  key: ProjectSortKey;
  direction: ProjectSortDirection;
}

/** The order projects are stored in: newest first, as they are created. */
export const DEFAULT_PROJECT_SORT: ProjectSort = { key: "default", direction: "asc" };

export const PROJECT_SORT_KEYS: readonly ProjectSortKey[] = [
  "default",
  "name",
  "client",
  "type",
  "managers",
  "deadline",
  "progress",
  "status",
];

/** A stored preference comes back from the database untyped; anything unrecognised is the default. */
export function normalizeProjectSort(value: unknown): ProjectSort {
  const v = value as Partial<ProjectSort> | null | undefined;
  const key = PROJECT_SORT_KEYS.includes(v?.key as ProjectSortKey) ? (v!.key as ProjectSortKey) : "default";
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
  /** "YYYY-MM-DD", or null when the project has none (or its type has no deadlines). */
  deadline: string | null;
  /** 0-100, or null when the project has no roadmap. */
  progress: number | null;
  /** Position of the status in the workflow order. */
  statusRank: number;
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

const isEmpty = (v: string | number | null) => v === null || v === "";

/**
 * Sorts a copy of `items`. Ties, and the "default" key, keep the incoming order.
 * Empty values always go last, in both directions.
 */
export function sortProjects<T>(items: T[], sort: ProjectSort, valuesOf: (item: T) => ProjectSortValues): T[] {
  if (sort.key === "default") return items.slice();
  const key = sort.key === "status" ? "statusRank" : sort.key;
  const sign = sort.direction === "desc" ? -1 : 1;

  return items
    .map((item, index) => ({ item, index, value: valuesOf(item)[key] }))
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
