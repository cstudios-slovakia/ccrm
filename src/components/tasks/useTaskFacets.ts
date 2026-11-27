import type { Lead, Project, Task } from "../../types";
import { useListMultiFilter, usePinnedFilterOptions } from "../../hooks/useListFilter";
import { applyFacets, withCounts, type FacetOption } from "../../utils/facetedFilters";

export type TaskFacetId = "client" | "project" | "assignee" | "assigner" | "priority" | "state";

/** The facets every section of the Tasks screen shares; priority and state exist on Global Tasks only. */
const SHARED: TaskFacetId[] = ["client", "project", "assignee", "assigner"];
const GLOBAL_ONLY: TaskFacetId[] = ["priority", "state"];

const valuesOf: Record<TaskFacetId, (task: Task) => string[]> = {
  client: (task) => (task.relatedLeadId ? [String(task.relatedLeadId)] : []),
  project: (task) => (task.relatedProjectId ? [String(task.relatedProjectId)] : []),
  assignee: (task) => (task.assignedUsers || []).filter(Boolean),
  assigner: (task) => (task.createdBy ? [task.createdBy] : []),
  priority: (task) => (task.priority ? [task.priority] : []),
  state: (task) => (task.status ? [task.status] : []),
};

/**
 * The Tasks screen's multi-select filters (client, project, assignee, assigner, and on Global
 * Tasks priority and state). The selections persist per user; an empty list filters nothing.
 * `matchesShared` is what every section applies, `matchesGlobal` adds priority and state.
 */
export function useTaskFacetSelection() {
  const [client, setClient] = useListMultiFilter("tasks.client");
  const [project, setProject] = useListMultiFilter("tasks.project");
  const [assignee, setAssignee] = useListMultiFilter("tasks.assignee");
  const [assigner, setAssigner] = useListMultiFilter("tasks.assigner");
  const [priority, setPriority] = useListMultiFilter("tasks.globalPriority");
  const [state, setState] = useListMultiFilter("tasks.globalState");
  const [pinnedStates, togglePinnedState] = usePinnedFilterOptions("tasks.state");

  const selection: Record<TaskFacetId, string[]> = { client, project, assignee, assigner, priority, state };
  const setters: Record<TaskFacetId, (v: string[]) => void> = {
    client: setClient, project: setProject, assignee: setAssignee, assigner: setAssigner, priority: setPriority, state: setState,
  };
  const passes = (task: Task, ids: TaskFacetId[]) =>
    ids.every((id) => selection[id].length === 0 || valuesOf[id](task).some((v) => selection[id].includes(v)));

  return {
    selection,
    set: (id: TaskFacetId, values: string[]) => setters[id](values),
    /** Click-to-filter on a badge: add the value, or remove it when it is already selected. */
    toggle: (id: TaskFacetId, value: string) =>
      setters[id](selection[id].includes(value) ? selection[id].filter((v) => v !== value) : [...selection[id], value]),
    matchesShared: (task: Task) => passes(task, SHARED),
    matchesGlobal: (task: Task) => passes(task, [...SHARED, ...GLOBAL_ONLY]),
    pinnedStates,
    togglePinnedState,
  };
}

export interface TaskFacetContext {
  leads: Lead[];
  projects: Project[];
  /** Project label, so the option reads like everywhere else in the app. */
  projectLabel: (project: Project) => string;
  userNames: string[];
  stateOptions: { value: string; label: string }[];
  priorityOptions: { value: string; label: string }[];
  /** Global Tasks only: priority and state also narrow the other facets' counts. */
  global: boolean;
}

/**
 * Options and counts for every facet over `scope` (the section's tasks before any facet is
 * applied): each option's count is what picking it would leave with the OTHER facets applied.
 */
export function taskFacetOptions(
  scope: readonly Task[],
  selection: Record<TaskFacetId, string[]>,
  ctx: TaskFacetContext,
): Record<TaskFacetId, FacetOption[]> {
  const ids = ctx.global ? [...SHARED, ...GLOBAL_ONLY] : SHARED;
  const { counts } = applyFacets(
    scope,
    ids.map((id) => ({ id, valuesOf: valuesOf[id], selected: selection[id] })),
  );
  const named = (names: string[]) => Array.from(new Set(names.filter(Boolean))).map((n) => ({ value: n, label: n }));
  const leadIds = new Set(scope.map((t) => String(t.relatedLeadId ?? "")).filter(Boolean));
  selection.client.forEach((id) => leadIds.add(id));
  const projectIds = new Set(scope.map((t) => String(t.relatedProjectId ?? "")).filter(Boolean));
  selection.project.forEach((id) => projectIds.add(id));
  const assigners = Array.from(new Set([...(scope.map((t) => t.createdBy).filter(Boolean) as string[]), ...ctx.userNames]));
  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
  return {
    client: withCounts(
      ctx.leads.filter((l) => leadIds.has(String(l.id))).map((l) => ({ value: String(l.id), label: l.name || String(l.id) })).sort(byLabel),
      counts.client,
    ),
    project: withCounts(
      ctx.projects.filter((p) => projectIds.has(String(p.id))).map((p) => ({ value: String(p.id), label: ctx.projectLabel(p) })).sort(byLabel),
      counts.project,
    ),
    assignee: withCounts(named(ctx.userNames), counts.assignee),
    assigner: withCounts(named(assigners).sort(byLabel), counts.assigner),
    priority: withCounts(ctx.priorityOptions, counts.priority),
    state: withCounts(ctx.stateOptions, counts.state),
  };
}
