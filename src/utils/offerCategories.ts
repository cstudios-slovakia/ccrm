import type { InvoiceOffer } from "../types";

// Price-offer categories are the same tree as the customer categories (up to
// three levels, a colour, a hand-set position among siblings), so the tree
// helpers are the ones in clientCategoryTree.ts — an OfferCategory and a
// ClientCategory have the same shape. Re-exported under offer names so a
// caller reads as what it means. What is specific to offers lives here: how
// many offers sit under each category, and un-filing offers when a category
// is deleted.

export {
  MAX_CLIENT_CATEGORY_DEPTH as MAX_OFFER_CATEGORY_DEPTH,
  clientCategoryChildren as offerCategoryChildren,
  clientCategoryColor as offerCategoryColor,
  clientCategoryDescendantIds as offerCategoryDescendantIds,
  clientCategoryFilterIds as offerCategoryFilterIds,
  clientCategoryPath as offerCategoryPath,
  flattenClientCategories as flattenOfferCategories,
} from "./clientCategoryTree.ts";

/** Offers filed directly under each category id (not their subtrees). */
export function offerCountsByCategory(offers: Pick<InvoiceOffer, "categoryId">[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const offer of offers) {
    if (offer.categoryId) counts[offer.categoryId] = (counts[offer.categoryId] || 0) + 1;
  }
  return counts;
}

/** How an offer was filed before it was un-filed, so Undo can file it back exactly. */
export interface OfferFiling {
  categoryId: string;
  updatedAt?: string;
}

/**
 * Takes every offer filed under one of `ids` out of its category and stamps it
 * updated (so the sync carries it). Returns the same array when nothing was
 * filed there, and the previous filing of each changed offer.
 */
export function unfileOffers<T extends Pick<InvoiceOffer, "id" | "categoryId" | "updatedAt">>(
  offers: T[],
  ids: ReadonlySet<string>,
  stamp: string,
): { offers: T[]; filed: Map<string, OfferFiling> } {
  const filed = new Map<string, OfferFiling>();
  const next = offers.map((offer) => {
    if (!offer.categoryId || !ids.has(offer.categoryId)) return offer;
    filed.set(offer.id, { categoryId: offer.categoryId, updatedAt: offer.updatedAt });
    return { ...offer, categoryId: null, updatedAt: stamp };
  });
  return { offers: filed.size ? next : offers, filed };
}

/** Undo of `unfileOffers`: an offer still without a category goes back where it was, with its old stamp. */
export function refileOffers<T extends Pick<InvoiceOffer, "id" | "categoryId" | "updatedAt">>(
  offers: T[],
  filed: ReadonlyMap<string, OfferFiling>,
): T[] {
  if (filed.size === 0) return offers;
  return offers.map((offer) => {
    const was = filed.get(offer.id);
    if (!was || offer.categoryId) return offer;
    const back: T = { ...offer, categoryId: was.categoryId };
    if (was.updatedAt === undefined) delete back.updatedAt;
    else back.updatedAt = was.updatedAt;
    return back;
  });
}
