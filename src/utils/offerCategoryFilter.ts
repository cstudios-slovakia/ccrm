// The price offers list's category filter and the category cell. The tree
// helpers themselves are shared (offerCategories.ts); only what is specific to
// the list lives here.

import type { OfferCategory } from "../types";
import { offerCategoryFilterIds, offerCategoryPath } from "./offerCategories.ts";

/** The filter values that are not a category id. */
export const OFFER_CATEGORY_ALL = "all";
export const OFFER_CATEGORY_NONE = "none";

/** "Services / Web / Redesign" - the text a tooltip and the sort use. */
export const offerCategoryPathLabel = (cats: OfferCategory[], id: string | null | undefined): string =>
  offerCategoryPath(cats, id).map(c => c.name).join(" / ");

/**
 * Whether an offer passes the category filter. "all" lets everything through;
 * "none" keeps offers with no category (or one that no longer exists); a
 * category id keeps offers filed under it or any of its descendants.
 */
export function matchesOfferCategoryFilter(
  offerCategoryId: string | null | undefined,
  filter: string,
  cats: OfferCategory[],
): boolean {
  if (filter === OFFER_CATEGORY_ALL) return true;
  const known = !!offerCategoryId && cats.some(c => c.id === offerCategoryId);
  if (filter === OFFER_CATEGORY_NONE) return !known;
  return known && offerCategoryFilterIds(cats, filter).has(offerCategoryId as string);
}

/** A stored filter that points at a deleted category reads as "all". */
export const isValidOfferCategoryFilter = (filter: string, cats: OfferCategory[]): boolean =>
  filter === OFFER_CATEGORY_ALL || filter === OFFER_CATEGORY_NONE || cats.some(c => c.id === filter);
