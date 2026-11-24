import { useCallback, useMemo } from "react";
import type { Ticket, TicketStatusDefinition } from "../../types";
import { useListMultiFilter, usePinnedFilterOptions } from "../../hooks/useListFilter";
import { applyFacets, withCounts, type FacetOption } from "../../utils/facetedFilters";
import { evaluateTicketSla, isClosedTicketStatus } from "../../utils/tickets";

export type TicketFacetId = "status" | "priority" | "project" | "assignee";
export type TicketKpiBucket = "all_open" | "unassigned" | "waiting_client" | "sla_risk" | "resolved" | "all";

/** The assignee facet's value for a ticket nobody works on. */
export const UNASSIGNED_AGENT = "__unassigned__";

interface Input {
  tickets: Ticket[];
  ticketStatuses: TicketStatusDefinition[];
  statusOptions: { value: string; label: string; color?: string }[];
  priorityOptions: { value: string; label: string }[];
  projectOptions: { value: string; label: string }[];
  agentOptions: { value: string; label: string }[];
  unassignedLabel: string;
  archiveScope: "active" | "archived";
  kpiBucket: TicketKpiBucket;
  viewMode: "table" | "board";
  /** The search box (ticket number, subject, reporter, project, client). */
  matchesSearch: (ticket: Ticket) => boolean;
}

/**
 * The tickets list's faceted filters: status, priority, project and assignee are multi-select, and
 * each option's count comes from the tickets the OTHER filters (plus search and archive scope) leave.
 *
 * KPI cards: a card is a preset for "no status picked". While the status selection is empty the
 * card's bucket narrows the list (and the other filters' counts); picking any status suspends the
 * bucket, and clicking a card clears the status selection again. The status dropdown's own counts
 * ignore the bucket, otherwise "Open" would show every closed status as 0.
 */
export function useTicketFacets(input: Input) {
  const { tickets, ticketStatuses, kpiBucket, viewMode, archiveScope } = input;
  const [status, setStatus] = useListMultiFilter("tickets.status");
  const [priority, setPriority] = useListMultiFilter("tickets.priority");
  const [project, setProject] = useListMultiFilter("tickets.project");
  const [assignee, setAssignee] = useListMultiFilter("tickets.assignee");
  const [pinnedStatuses, togglePinnedStatus] = usePinnedFilterOptions("tickets.status");

  const selection: Record<TicketFacetId, string[]> = { status, priority, project, assignee };
  const setters: Record<TicketFacetId, (v: string[]) => void> = {
    status: setStatus, priority: setPriority, project: setProject, assignee: setAssignee,
  };

  const inBucket = useCallback(
    (tk: Ticket) => {
      const closed = isClosedTicketStatus(tk.status, ticketStatuses);
      // In board mode every status column shows, closed ones included, on the default bucket.
      if (kpiBucket === "all_open") return !closed || viewMode === "board";
      if (kpiBucket === "unassigned") return !closed && !(tk.assignedUsers && tk.assignedUsers.length > 0);
      if (kpiBucket === "waiting_client") return tk.status === "waiting_client";
      if (kpiBucket === "sla_risk") {
        const sla = evaluateTicketSla(tk, ticketStatuses);
        return sla.state === "warning" || sla.state === "breached";
      }
      if (kpiBucket === "resolved") return closed || viewMode === "board";
      return true;
    },
    [kpiBucket, viewMode, ticketStatuses],
  );

  const result = useMemo(() => {
    const valuesOf: Record<TicketFacetId, (tk: Ticket) => string[]> = {
      status: (tk) => (tk.status ? [tk.status] : []),
      priority: (tk) => (tk.priority ? [tk.priority] : []),
      project: (tk) => (tk.projectId ? [tk.projectId] : []),
      assignee: (tk) => (tk.assignedUsers && tk.assignedUsers.length > 0 ? tk.assignedUsers : [UNASSIGNED_AGENT]),
    };
    const defs = (Object.keys(valuesOf) as TicketFacetId[]).map((id) => ({ id, valuesOf: valuesOf[id], selected: selection[id] }));
    const scope = (tk: Ticket) => {
      const isArch = Boolean(tk.archived || tk.isArchived);
      return isArch === (archiveScope === "archived") && input.matchesSearch(tk);
    };
    const bucketActive = status.length === 0 && archiveScope === "active";
    const counted = applyFacets(tickets, defs, (tk) => scope(tk) && (!bucketActive || inBucket(tk)));
    // Status counts ignore the bucket (see above); without a bucket the one pass serves both.
    const statusCounts: Map<string, number> | undefined = bucketActive ? applyFacets(tickets, defs, scope).counts.status : counted.counts.status;
    const items = [...counted.items].sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""));
    const counts: Record<string, Map<string, number> | undefined> = { ...counted.counts, status: statusCounts };
    return { items, counts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, status, priority, project, assignee, archiveScope, inBucket, input.matchesSearch]);

  const options = useMemo(() => {
    const c = result.counts;
    const out: Record<TicketFacetId, FacetOption[]> = {
      status: withCounts(input.statusOptions, c.status),
      priority: withCounts(input.priorityOptions, c.priority),
      project: withCounts(input.projectOptions, c.project),
      assignee: withCounts([{ value: UNASSIGNED_AGENT, label: input.unassignedLabel }, ...input.agentOptions], c.assignee),
    };
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, input.statusOptions, input.priorityOptions, input.projectOptions, input.agentOptions]);

  return {
    selection,
    setSelection: (id: TicketFacetId, values: string[]) => setters[id](values),
    options,
    filteredTickets: result.items,
    pinnedStatuses,
    togglePinnedStatus,
  };
}
