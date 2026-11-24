import { useCallback, useMemo } from "react";
import type { ClientCategory } from "../../types";
import { useListMultiFilter } from "../../hooks/useListFilter";
import { applyFacets, withCounts, type FacetOption } from "../../utils/facetedFilters";
import { clientCategoryPath, flattenClientCategories } from "../../utils/clientCategoryTree";

export type ClientFacetId = "type" | "city" | "manager" | "category";

/** The category facet's value for a client filed under no (known) category. */
export const NO_CLIENT_CATEGORY = "__none__";

type Translate = (en: string, sk: string, hu: string) => string;

/** The slice of a client profile the filters read. */
interface FacetClient {
  name: string;
  city: string;
  owner: string;
  clientType: string;
  clientCategoryId?: string | null;
  archived?: boolean;
}

interface Input<C extends FacetClient> {
  clients: C[];
  categories: ClientCategory[];
  managerNames: string[];
  searchQuery: string;
  archive: "active" | "archived";
  t: Translate;
}

/**
 * The clients list's faceted filters (type, city, manager, category): multi-select, and each
 * one's option counts come from the clients the OTHER filters, the search and the archive
 * scope leave. A category also matches the clients filed under its subcategories.
 */
export function useClientFacets<C extends FacetClient>(input: Input<C>) {
  const { clients, categories, t } = input;
  const [type, setType] = useListMultiFilter("clients.type");
  const [city, setCity] = useListMultiFilter("clients.city");
  const [manager, setManager] = useListMultiFilter("clients.manager");
  const [category, setCategory] = useListMultiFilter("clients.category");
  const selection: Record<ClientFacetId, string[]> = { type, city, manager, category };
  const setters: Record<ClientFacetId, (v: string[]) => void> = { type: setType, city: setCity, manager: setManager, category: setCategory };

  const base = useCallback(
    (c: C) => {
      if (input.archive === "archived" ? !c.archived : c.archived) return false;
      const needle = input.searchQuery.toLowerCase();
      return !needle || c.name.toLowerCase().includes(needle) || c.city.toLowerCase().includes(needle) || c.owner.toLowerCase().includes(needle);
    },
    [input.archive, input.searchQuery],
  );

  const defs = useMemo(
    () => [
      { id: "type", valuesOf: (c: C) => [c.clientType], selected: type },
      { id: "city", valuesOf: (c: C) => (c.city ? [c.city.toLowerCase()] : []), selected: city.map((v) => v.toLowerCase()) },
      { id: "manager", valuesOf: (c: C) => (c.owner ? [c.owner.toLowerCase()] : []), selected: manager.map((v) => v.toLowerCase()) },
      {
        id: "category",
        // The client's category and every ancestor: picking a main category finds its subcategories' clients too.
        valuesOf: (c: C) => {
          const known = !!c.clientCategoryId && categories.some((x) => x.id === c.clientCategoryId);
          return known ? clientCategoryPath(categories, c.clientCategoryId).map((x) => x.id) : [NO_CLIENT_CATEGORY];
        },
        selected: category,
      },
    ],
    [type, city, manager, category, categories],
  );

  const result = useMemo(() => applyFacets(clients, defs, base), [clients, defs, base]);

  const options = useMemo(() => {
    const c = result.counts;
    const unique = (values: string[]) =>
      Array.from(new Map(values.filter(Boolean).map((v) => [v.toLowerCase(), v] as const)).values()).sort((a, b) => a.localeCompare(b));
    const out: Record<ClientFacetId, FacetOption[]> = {
      type: withCounts(
        [
          { value: "person", label: t("Person", "Osoba", "Személy") },
          { value: "business", label: t("Business", "Firma", "Cég") },
          { value: "partner", label: t("Partner", "Partner", "Partner") },
        ],
        c.type,
      ),
      city: withCounts(unique(clients.map((x) => x.city)).map((v) => ({ value: v.toLowerCase(), label: v })), c.city),
      manager: withCounts(unique([...input.managerNames, ...clients.map((x) => x.owner)]).map((v) => ({ value: v.toLowerCase(), label: v })), c.manager),
      category: withCounts(
        [
          ...flattenClientCategories(categories).map(({ category: cat, depth }) => ({ value: cat.id, label: cat.name, indent: depth - 1 })),
          { value: NO_CLIENT_CATEGORY, label: t("Without a category", "Bez kategórie", "Kategória nélkül") },
        ],
        c.category,
      ),
    };
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, categories, input.managerNames, clients]);

  return {
    selection,
    setSelection: (id: ClientFacetId, values: string[]) => setters[id](values),
    options,
    filteredClients: result.items,
    allLabels: {
      type: t("All Types", "Všetky typy", "Minden típus"),
      city: t("All cities", "Všetky mestá", "Minden város"),
      manager: t("All managers", "Všetci manažéri", "Minden menedzser"),
      category: t("All categories", "Všetky kategórie", "Minden kategória"),
    } as Record<ClientFacetId, string>,
  };
}
