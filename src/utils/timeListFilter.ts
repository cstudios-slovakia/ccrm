import type { TimeEntry } from "./timeTracking.ts";

/** The key of "No project" in `ListFilter.projects`. */
export const NO_PROJECT = "__none__";

export type BillableFilter = "any" | "billable" | "not-billable";

/** The List tab's browser-side filter. Empty sets and "any" mean no restriction. */
export interface ListFilter {
  projects: string[];
  billable: BillableFilter;
  tags: string[];
}

export const EMPTY_LIST_FILTER: ListFilter = { projects: [], billable: "any", tags: [] };

/** How many criteria are set (the badge on the filter button). */
export const activeFilterCount = (f: ListFilter): number => (f.projects.length > 0 ? 1 : 0) + (f.billable !== "any" ? 1 : 0) + (f.tags.length > 0 ? 1 : 0);

export const isFilterActive = (f: ListFilter): boolean => activeFilterCount(f) > 0;

const projectKey = (e: Pick<TimeEntry, "projectId">): string => e.projectId || NO_PROJECT;

/** The entries that match every set criterion; the same array when no filter is set. */
export const applyListFilter = (entries: readonly TimeEntry[], f: ListFilter): readonly TimeEntry[] => {
  if (!isFilterActive(f)) return entries;
  return entries.filter((e) => {
    if (f.projects.length > 0 && !f.projects.includes(projectKey(e))) return false;
    if (f.billable === "billable" && !e.billable) return false;
    if (f.billable === "not-billable" && e.billable) return false;
    if (f.tags.length > 0 && !f.tags.some((tag) => (e.tags ?? []).includes(tag))) return false;
    return true;
  });
};

/** The projects present in the entries (by name) and whether any entry has none; for the Project options. */
export const filterOptions = (entries: readonly TimeEntry[]): { projects: { id: string; name: string }[]; hasNoProject: boolean; tags: string[] } => {
  const projects = new Map<string, string>();
  const tags = new Set<string>();
  let hasNoProject = false;
  for (const e of entries) {
    if (e.projectId) projects.set(e.projectId, e.projectName || e.projectId);
    else hasNoProject = true;
    for (const tag of e.tags ?? []) tags.add(tag);
  }
  return {
    projects: [...projects].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    hasNoProject,
    tags: [...tags].sort((a, b) => a.localeCompare(b)),
  };
};

/** Toggle a value in a list (returns a new list). */
export const toggleIn = (list: readonly string[], value: string): string[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
