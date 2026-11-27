import { useCallback, useEffect, useMemo } from "react";
import type { Lead, ProjectAttribute, UserProfile } from "../../types";
import { projectEmployeeUserNames, projectManagerUserNames } from "../../utils/projectEmployees";
import { useListMultiFilter, usePinnedFilterOptions } from "../../hooks/useListFilter";
import { applyFacets, withCounts, type FacetOption } from "../../utils/facetedFilters";
import { leadMatchesCustomFieldQuery } from "../../utils/leadAttributes";
import { parseAppHash } from "../../utils/hash";
import { ratingFacetValues, ratingFilterOptions } from "../../utils/rating";
import { getTranslation } from "../../utils/translations";

export type LeadFacetId = "state" | "owner" | "employees" | "source" | "division" | "type" | "city" | "rating";
const FACET_IDS: LeadFacetId[] = ["state", "owner", "employees", "source", "division", "type", "city", "rating"];

type Translate = (en: string, sk: string, hu: string) => string;

interface Input {
  /** The pipeline leads the grid shows (client-register rows already left out). */
  leads: Lead[];
  leadStates: string[];
  leadStateParents: Record<string, string>;
  stateColor: (state: string) => string;
  leadSources: string[];
  divisions: string[];
  /** Users: the manager filter offers the Project Managers, the employees filter everyone else (plus names already on leads). */
  users: UserProfile[];
  leadAttributes: ProjectAttribute[];
  resolveContactName: (id: string) => string | null | undefined;
  searchQuery: string;
  favoritesOnly: boolean;
  isFavorite: (id: string) => boolean;
  archive: "active" | "archived" | "all";
  offerPreset: string;
  offerStart: Date | null;
  offerEnd: Date | null;
  t: Translate;
  systemLanguage: Parameters<typeof getTranslation>[0];
}

/** Pipeline stage from `#leads?status=`, or "" on any other route. */
function leadStatusFromHash(): string {
  if (typeof window === "undefined") return "";
  const { route, params } = parseAppHash(window.location.hash);
  if (route !== "leads") return "";
  return (params.get("status") || "").trim().toLowerCase();
}

const lower = (v: string | undefined | null) => (v || "").trim().toLowerCase();

/** Did the lead's latest offer fall inside the chosen range? A lead that never had an offer does not. */
function offerInRange(lead: Lead, start: Date | null, end: Date | null): boolean {
  const offers = (lead.timeline || []).filter((e) => e.type === "offer" && e.timestamp);
  if (offers.length === 0) return false;
  const latest = offers.reduce((a, b) => (new Date(b.timestamp) > new Date(a.timestamp) ? b : a));
  const at = new Date(latest.timestamp);
  if (start && at < new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0)) return false;
  if (end && at > new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999)) return false;
  return true;
}

/**
 * The leads list's faceted filters: stage, manager, type, division, source, city and
 * rating are multi-select, and each one's option counts come from the leads the OTHER
 * filters (and the search, favourites, archive and offer-date range) leave. Also owns the
 * `#leads?status=` link between the stage filter and the address bar.
 */
export function useLeadFacets(input: Input) {
  const { leads, leadStates, leadStateParents, t, systemLanguage } = input;
  const [state, setState] = useListMultiFilter("leads.state");
  const [owner, setOwner] = useListMultiFilter("leads.owner");
  const [employees, setEmployees] = useListMultiFilter("leads.employees");
  const [source, setSource] = useListMultiFilter("leads.source");
  const [division, setDivision] = useListMultiFilter("leads.division");
  const [type, setType] = useListMultiFilter("leads.type");
  const [city, setCity] = useListMultiFilter("leads.city");
  const [rating, setRating] = useListMultiFilter("leads.rating");
  const [pinnedStates, togglePinnedState] = usePinnedFilterOptions("leads.state");
  const selection = { state, owner, employees, source, division, type, city, rating };
  const setters: Record<LeadFacetId, (v: string[]) => void> = {
    state: setState, owner: setOwner, employees: setEmployees, source: setSource, division: setDivision, type: setType, city: setCity, rating: setRating,
  };

  // A link from the dashboard (`#leads?status=new`) wins over the remembered stage; a
  // hash with no status says nothing about the stage (closing a lead lands on plain
  // `#leads`), so it leaves the filter alone.
  useEffect(() => {
    const fromHash = leadStatusFromHash();
    if (fromHash) setState([fromHash]);
    const apply = () => {
      const status = leadStatusFromHash();
      if (status) setState([status]);
    };
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const { route, params } = parseAppHash(window.location.hash);
    if (route !== "leads") return;
    const current = (params.get("status") || "").trim().toLowerCase();
    // The address bar carries one stage; with several selected it carries none.
    const next = state.length === 1 ? state[0].trim().toLowerCase() : "";
    if (current === next) return;
    if (next) params.set("status", next);
    else params.delete("status");
    const qs = params.toString();
    // replaceState: the filter is not a navigation, so it adds no Back entry.
    window.history.replaceState(null, "", `#${qs ? `leads?${qs}` : "leads"}`);
  }, [state]);

  const base = useCallback(
    (lead: Lead) => {
      if (input.favoritesOnly && !input.isFavorite(lead.id)) return false;
      if (input.archive === "archived" ? !lead.archived : input.archive === "active" ? !!lead.archived : false) return false;
      if (input.offerPreset !== "All Time" && (input.offerStart || input.offerEnd) && !offerInRange(lead, input.offerStart, input.offerEnd)) return false;
      const q = input.searchQuery.toLowerCase();
      return (
        (lead.name || "").toLowerCase().includes(q) ||
        (lead.city || "").toLowerCase().includes(q) ||
        (lead.owner || "").toLowerCase().includes(q) ||
        (lead.assignedEmployees || []).some((n) => n.toLowerCase().includes(q)) ||
        (lead.email || "").toLowerCase().includes(q) ||
        (lead.phone || "").toLowerCase().includes(q) ||
        leadMatchesCustomFieldQuery(lead, input.leadAttributes, q, (id) => input.resolveContactName(id) || "")
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input.favoritesOnly, input.isFavorite, input.archive, input.offerPreset, input.offerStart, input.offerEnd, input.searchQuery, input.leadAttributes, input.resolveContactName],
  );

  const result = useMemo(() => {
    const one = (id: LeadFacetId, valuesOf: (l: Lead) => string[]) => ({ id, valuesOf, selected: selection[id] });
    return applyFacets(
      leads,
      [
        one("state", (l) => {
          const s = lower(l.status);
          const parent = leadStateParents[s];
          return parent ? [s, lower(parent)] : [s];
        }),
        one("owner", (l) => [lower(l.owner)].filter(Boolean)),
        one("employees", (l) => (l.assignedEmployees || []).map(lower).filter(Boolean)),
        one("source", (l) => [lower(l.source)].filter(Boolean)),
        one("division", (l) => [lower(l.division) || "none"]),
        one("type", (l) => [lower(l.clientType)].filter(Boolean)),
        one("city", (l) => [lower(l.city)].filter(Boolean)),
        one("rating", (l) => ratingFacetValues(l.rating)),
      ],
      base,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, leadStateParents, base, state, owner, employees, source, division, type, city, rating]);

  const options = useMemo(() => {
    const counts = result.counts;
    const named = (values: string[]) => {
      const seen = new Map<string, string>();
      values.forEach((v) => {
        const key = lower(v);
        if (key && !seen.has(key)) seen.set(key, v.trim());
      });
      return Array.from(seen, ([value, label]) => ({ value, label }));
    };
    // Stages with their sub-stages nested under them, in the order they are configured.
    const stateRows: { value: string; label: string; color: string; indent: number }[] = [];
    const placed = new Set<string>();
    const place = (s: string, indent: number) => {
      stateRows.push({ value: s.toLowerCase(), label: s, color: input.stateColor(s), indent });
      placed.add(s);
    };
    leadStates
      .filter((s) => !leadStateParents[s.toLowerCase()])
      .forEach((main) => {
        place(main, 0);
        leadStates.filter((s) => leadStateParents[s.toLowerCase()] === main.toLowerCase()).forEach((sub) => place(sub, 1));
      });
    leadStates.filter((s) => !placed.has(s)).forEach((s) => place(s, 1));
    const out: Record<LeadFacetId, FacetOption[]> = {
      state: withCounts(stateRows, counts.state),
      owner: withCounts(named([...projectManagerUserNames(input.users), ...leads.map((l) => l.owner || "")]), counts.owner),
      employees: withCounts(named([...projectEmployeeUserNames(input.users), ...leads.flatMap((l) => l.assignedEmployees || [])]), counts.employees),
      source: withCounts(named(input.leadSources), counts.source),
      division: withCounts(
        [{ value: "none", label: getTranslation(systemLanguage, "filters.no_division") }, ...named(input.divisions)],
        counts.division,
      ),
      type: withCounts(
        [
          { value: "person", label: t("Private Person", "Súkromná osoba", "Magánszemély") },
          { value: "business", label: t("Company / Business", "Firma / Podnikanie", "Cég / Vállalkozás") },
          { value: "partner", label: t("Dealer Partner", "Obchodný partner", "Kereskedő partner") },
        ],
        counts.type,
      ),
      city: withCounts(named(leads.map((l) => l.city || "")), counts.city),
      rating: withCounts(ratingFilterOptions(t).filter((o) => o.value !== "all"), counts.rating),
    };
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, leads, leadStates, leadStateParents, input.users, input.leadSources, input.divisions, input.stateColor, systemLanguage]);

  /** Stages the kanban columns / list groups show: the selected ones (with their parent), else every main stage. */
  const resolvedVisibleStates = useMemo(() => {
    if (state.length > 0) {
      return Array.from(new Set(state.flatMap((s) => (leadStateParents[s] ? [leadStateParents[s].toLowerCase(), s] : [s]))));
    }
    return leadStates.filter((s) => !leadStateParents[s.toLowerCase()]).map((s) => s.toLowerCase());
  }, [state, leadStates, leadStateParents]);

  const processedLeads = useMemo(
    () => [...result.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [result.items],
  );
  const isActive = (id: LeadFacetId) => selection[id].length > 0;
  const clearFacets = () => FACET_IDS.forEach((id) => setters[id]([]));

  return {
    selection,
    setSelection: (id: LeadFacetId, values: string[]) => setters[id](values),
    options,
    processedLeads,
    resolvedVisibleStates,
    pinnedStates,
    togglePinnedState,
    isActive,
    anyActive: FACET_IDS.some(isActive),
    clearFacets,
    allLabels: {
      state: t("All Stages", "Všetky fázy", "Minden fázis"),
      owner: getTranslation(systemLanguage, "leads.filter.manager"),
      employees: t("All employees", "Všetci zamestnanci", "Minden munkatárs"),
      source: getTranslation(systemLanguage, "leads.filter.source"),
      division: getTranslation(systemLanguage, "filters.all_divisions"),
      type: getTranslation(systemLanguage, "leads.filter.type"),
      city: getTranslation(systemLanguage, "clients.filter.city"),
      rating: t("All ratings", "Všetky hodnotenia", "Minden értékelés"),
    } as Record<LeadFacetId, string>,
  };
}
