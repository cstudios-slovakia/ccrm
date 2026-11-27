// Ordering for the price offers list. "default" keeps the incoming order, which
// is newest issued first, so nothing changes until someone picks another key.
// An offer with no value for the key sorts last, whichever way you sort.

export type OfferSortKey = "default" | "number" | "client" | "amount" | "status" | "category" | "validUntil";
export type OfferSortDirection = "asc" | "desc";

export interface OfferSort {
  key: OfferSortKey;
  direction: OfferSortDirection;
}

export const DEFAULT_OFFER_SORT: OfferSort = { key: "default", direction: "asc" };

export const OFFER_SORT_KEYS: readonly OfferSortKey[] = ["default", "number", "client", "amount", "status", "category", "validUntil"];

/** A stored preference comes back untyped; anything unrecognised is the default. */
export function normalizeOfferSort(value: unknown): OfferSort {
  const v = value as Partial<OfferSort> | null | undefined;
  const key = OFFER_SORT_KEYS.includes(v?.key as OfferSortKey) ? (v!.key as OfferSortKey) : "default";
  return { key, direction: v?.direction === "desc" ? "desc" : "asc" };
}

/** What the sort compares for one offer. */
export interface OfferSortValues {
  number: string;
  client: string;
  amount: number | null;
  /** Position of the status in the configured order. */
  statusRank: number;
  /** The category's full path text, "" when the offer has none. */
  category: string;
  /** "YYYY-MM-DD" or null. */
  validUntil: string | null;
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
const isEmpty = (v: string | number | null) => v === null || v === "";

function valueFor(values: OfferSortValues, key: OfferSortKey): string | number | null {
  if (key === "default") return null;
  if (key === "status") return values.statusRank;
  return values[key];
}

/** Sorts a copy of `items`. Ties and the "default" key keep the incoming order; empty values go last in both directions. */
export function sortOffers<T>(items: T[], sort: OfferSort, valuesOf: (item: T) => OfferSortValues): T[] {
  if (sort.key === "default") return items.slice();
  const sign = sort.direction === "desc" ? -1 : 1;
  return items
    .map((item, index) => ({ item, index, value: valueFor(valuesOf(item), sort.key) }))
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
    .map(row => row.item);
}
