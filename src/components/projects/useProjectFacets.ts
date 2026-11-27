import { projectStatusParent } from "../../utils/projectStatusTree";
import { displayEmployeeName } from "../../utils/nameOrder";
import { useCallback, useMemo } from "react";
import type { Lead, Project, ProjectType } from "../../types";
import { useListMultiFilter, usePinnedFilterOptions } from "../../hooks/useListFilter";
import { applyFacets, withCounts, type FacetOption } from "../../utils/facetedFilters";
import {
  defaultProjectStatus,
  openProjectStatuses,
  projectStatusOptions,
  projectStatusOrder,
  type ProjectStatusDef,
} from "../../utils/projects";
import { ratingFacetValues, ratingFilterOptions } from "../../utils/rating";
import { getTranslation } from "../../utils/translations";
import { useUserPref } from "../../utils/userPrefs";

export type ProjectFacetId = "status" | "type" | "division" | "manager" | "employee" | "rating";

/** The manager facet's value for a project nobody manages. */
export const UNASSIGNED_MANAGER = "__unassigned__";

type Translate = (en: string, sk: string, hu: string) => string;

interface Input {
  projects: Project[];
  projectTypes: ProjectType[];
  leads: Lead[];
  projectStatuses: readonly ProjectStatusDef[];
  divisions: string[];
  /** Everyone a project can be filtered to by manager name. */
  managerNames: string[];
  /** Everyone a project can be filtered to by assigned employee name. */
  employeeNames?: string[];
  searchQuery: string;
  overdueOnly: boolean;
  overdueIds: Set<string>;
  archive: "active" | "archived" | "all";
  t: Translate;
  userLanguage: Parameters<typeof getTranslation>[0];
}

/**
 * The projects list's faceted filters: status, type, division, manager and rating are
 * multi-select, and each one's option counts come from the projects the OTHER filters
 * (and search, overdue chip and archive scope) leave. The status selection is the
 * per-user "visible statuses" preference; null still means "the open statuses".
 */
export function useProjectFacets(input: Input) {
  const { projects, projectTypes, leads, projectStatuses, t } = input;
  const [storedStatuses, setStoredStatuses] = useUserPref("projectsVisibleStatuses");
  const [type, setType] = useListMultiFilter("projects.type");
  const [division, setDivision] = useListMultiFilter("projects.division");
  const [manager, setManager] = useListMultiFilter("projects.manager");
  const [employee, setEmployee] = useListMultiFilter("projects.employee");
  const [rating, setRating] = useListMultiFilter("projects.rating");
  const [pinnedStatuses, togglePinnedStatus] = usePinnedFilterOptions("projects.status");

  const allStatuses = useMemo(() => projectStatusOrder(projectStatuses), [projectStatuses]);
  const status = useMemo(
    () => (storedStatuses === null ? openProjectStatuses(projectStatuses) : storedStatuses.filter((s) => allStatuses.includes(s))),
    [storedStatuses, projectStatuses, allStatuses],
  );
  const selection: Record<ProjectFacetId, string[]> = { status, type, division, manager, employee, rating };
  const setters: Record<ProjectFacetId, (v: string[]) => void> = {
    status: setStoredStatuses, type: setType, division: setDivision, manager: setManager, employee: setEmployee, rating: setRating,
  };

  const base = useCallback(
    (p: Project) => {
      if (input.archive !== "all" && Boolean(p.archived) !== (input.archive === "archived")) return false;
      if (input.overdueOnly && !input.overdueIds.has(p.id)) return false;
      const needle = input.searchQuery.toLowerCase();
      if (!needle) return true;
      const lead = leads.find((l) => l.id === p.leadId);
      const pType = projectTypes.find((x) => x.id === p.projectTypeId);
      return (
        // The project's own name is searched alongside the lead's — a project
        // named "Roof replacement" is findable by more than its client.
        (p.name || "").toLowerCase().includes(needle) ||
        (lead?.name || "").toLowerCase().includes(needle) ||
        p.id.toLowerCase().includes(needle) ||
        (pType?.name || "").toLowerCase().includes(needle)
      );
    },
    [input.archive, input.overdueOnly, input.overdueIds, input.searchQuery, leads, projectTypes],
  );

  const defs = useMemo(() => {
    const one = (id: ProjectFacetId, valuesOf: (p: Project) => string[]) => ({ id, valuesOf, selected: selection[id] });
    return [
      // A sub-status also counts as its parent: picking the parent shows (and counts) its sub-statuses too.
      one("status", (p) => {
        const key = p.status || defaultProjectStatus(projectStatuses);
        const parent = projectStatusParent(key, projectStatuses);
        return parent ? [key, parent.key] : [key];
      }),
      one("type", (p) => (p.projectTypeId ? [p.projectTypeId] : [])),
      one("division", (p) => [(p.division || "").toLowerCase() || "none"]),
      one("manager", (p) => (p.managers && p.managers.length > 0 ? p.managers : [UNASSIGNED_MANAGER])),
      one("employee", (p) => (p.employees && p.employees.length > 0 ? p.employees : [UNASSIGNED_MANAGER])),
      one("rating", (p) => ratingFacetValues(p.rating)),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, type, division, manager, employee, rating, projectStatuses]);

  const result = useMemo(() => applyFacets(projects, defs, base), [projects, defs, base]);

  /** A project that passes everything except the status filter — what a status's own totals are made of. */
  const passesOtherThanStatus = useCallback(
    (p: Project) => base(p) && defs.every((d) => d.id === "status" || d.selected.length === 0 || d.valuesOf(p).some((v) => d.selected.includes(v))),
    [base, defs],
  );

  const options = useMemo(() => {
    const c = result.counts;
    const named = (names: string[]) => Array.from(new Set(names.filter(Boolean))).map((n) => ({ value: n, label: displayEmployeeName(n) }));
    const out: Record<ProjectFacetId, FacetOption[]> = {
      status: withCounts(projectStatusOptions(t, projectStatuses), c.status),
      type: withCounts(projectTypes.map((pt) => ({ value: pt.id, label: pt.name })), c.type),
      division: withCounts(
        [{ value: "none", label: getTranslation(input.userLanguage, "filters.no_division") }, ...input.divisions.map((d) => ({ value: d.toLowerCase(), label: d }))],
        c.division,
      ),
      manager: withCounts(
        [...named(input.managerNames), { value: UNASSIGNED_MANAGER, label: t("Unassigned", "Bez manažéra", "Nincs menedzser") }],
        c.manager,
      ),
      employee: withCounts(
        [...named(input.employeeNames ?? []), { value: UNASSIGNED_MANAGER, label: t("Unassigned", "Bez zamestnanca", "Nincs munkatárs") }],
        c.employee,
      ),
      rating: withCounts(ratingFilterOptions(t).filter((o) => o.value !== "all"), c.rating),
    };
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, projectStatuses, projectTypes, input.divisions, input.managerNames, input.employeeNames]);

  return {
    selection,
    setSelection: (id: ProjectFacetId, values: string[]) => setters[id](values),
    options,
    filteredProjects: result.items,
    passesOtherThanStatus,
    pinnedStatuses,
    togglePinnedStatus,
    /** The status dropdown's text while the filter is the untouched default (open statuses only). */
    statusSummary: storedStatuses === null ? t("Active statuses", "Aktívne stavy", "Aktív állapotok") : undefined,
    allLabels: {
      status: t("All statuses", "Všetky stavy", "Minden állapot"),
      type: t("All Types", "Všetky typy", "Minden típus"),
      division: getTranslation(input.userLanguage, "filters.all_divisions"),
      manager: t("All managers", "Všetci manažéri", "Minden menedzser"),
      employee: t("All employees", "Všetci zamestnanci", "Minden munkatárs"),
      rating: t("All ratings", "Všetky hodnotenia", "Minden értékelés"),
    } as Record<ProjectFacetId, string>,
  };
}
