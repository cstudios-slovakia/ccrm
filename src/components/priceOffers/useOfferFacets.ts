import { useCallback, useMemo } from "react";
import type { InvoiceOffer, OfferCategory } from "../../types";
import { useListMultiFilter, usePinnedFilterOptions } from "../../hooks/useListFilter";
import { applyFacets, withCounts, type FacetOption } from "../../utils/facetedFilters";
import { OFFER_CATEGORY_NONE } from "../../utils/offerCategoryFilter";
import { flattenClientCategories, clientCategoryPath } from "../../utils/clientCategoryTree";
import { offerStatusOptions, type OfferStatusDef } from "../../utils/offerStatuses";

export type OfferFacetId = "status" | "mode" | "category";

type Translate = (en: string, sk: string, hu: string) => string;

interface Input {
  offers: InvoiceOffer[];
  offerStatuses: OfferStatusDef[];
  offerCategories: OfferCategory[];
  searchQuery: string;
  t: Translate;
}

/**
 * The price offers list's faceted filters (status, format, category): multi-select, and each
 * one's option counts come from the offers the OTHER filters and the search leave. The status
 * filter can pin options as chips above the list. A category also matches its subcategories.
 */
export function useOfferFacets(input: Input) {
  const { offers, offerStatuses, offerCategories, t } = input;
  const [status, setStatus] = useListMultiFilter("priceOffers.status");
  const [mode, setMode] = useListMultiFilter("priceOffers.mode");
  const [category, setCategory] = useListMultiFilter("priceOffers.category");
  const [pinnedStatuses, togglePinnedStatus] = usePinnedFilterOptions("priceOffers.status");
  const selection: Record<OfferFacetId, string[]> = { status, mode, category };
  const setters: Record<OfferFacetId, (v: string[]) => void> = { status: setStatus, mode: setMode, category: setCategory };

  const base = useCallback(
    (io: InvoiceOffer) => {
      const q = input.searchQuery.trim().toLowerCase();
      return (
        !q ||
        (io.clientName || "").toLowerCase().includes(q) ||
        (io.documentNumber || "").toLowerCase().includes(q) ||
        (io.title || "").toLowerCase().includes(q) ||
        (io.subject || "").toLowerCase().includes(q)
      );
    },
    [input.searchQuery],
  );

  const defs = useMemo(
    () => [
      { id: "status", valuesOf: (o: InvoiceOffer) => [o.status], selected: status },
      { id: "mode", valuesOf: (o: InvoiceOffer) => (o.mode ? [o.mode] : []), selected: mode },
      {
        id: "category",
        // The offer's category and every ancestor, so a main category finds its subcategories' offers.
        valuesOf: (o: InvoiceOffer) => {
          const known = !!o.categoryId && offerCategories.some((c) => c.id === o.categoryId);
          return known ? clientCategoryPath(offerCategories, o.categoryId).map((c) => c.id) : [OFFER_CATEGORY_NONE];
        },
        selected: category,
      },
    ],
    [status, mode, category, offerCategories],
  );

  const result = useMemo(() => applyFacets(offers, defs, base), [offers, defs, base]);

  const options = useMemo(() => {
    const c = result.counts;
    const out: Record<OfferFacetId, FacetOption[]> = {
      status: withCounts(offerStatusOptions(t, offerStatuses), c.status),
      mode: withCounts(
        [
          { value: "default", label: t("Standard template", "Štandardná šablóna", "Alap sablon") },
          { value: "custom", label: t("AI template", "AI šablóna", "AI sablon") },
          { value: "external", label: "SuperFaktúra / iDoklad" },
        ],
        c.mode,
      ),
      category: withCounts(
        [
          ...flattenClientCategories(offerCategories).map(({ category: cat, depth }) => ({ value: cat.id, label: cat.name, indent: depth - 1 })),
          { value: OFFER_CATEGORY_NONE, label: t("Without category", "Bez kategórie", "Kategória nélkül") },
        ],
        c.category,
      ),
    };
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, offerStatuses, offerCategories]);

  return {
    selection,
    setSelection: (id: OfferFacetId, values: string[]) => setters[id](values),
    options,
    filteredOffers: result.items,
    pinnedStatuses,
    togglePinnedStatus,
    allLabels: {
      status: t("All statuses", "Všetky stavy", "Minden állapot"),
      mode: t("All formats", "Všetky formáty", "Minden formátum"),
      category: t("All categories", "Všetky kategórie", "Minden kategória"),
    } as Record<OfferFacetId, string>,
  };
}
