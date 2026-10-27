/**
 * Which project a task-started timer belongs to, and which tasks the timer bar offers.
 *
 * A task points at a project (`relatedProjectId`) or only at a lead / client
 * (`relatedLeadId`). Clients and leads are one table, so the client of a lead is
 * resolved with `leadClient.ts` — never by comparing names.
 */

import type { Lead, Project, Task, Ticket } from "../types/index.ts";
import { resolveLinkedClient } from "./leadClient.ts";

export interface TaskProjectResolution {
  /** The one project to use, when there is exactly one. */
  projectId: string | null;
  /** The candidates when there are several: the caller asks "Which project is this for?". */
  candidates: Project[];
}

/**
 * The party a task-started timer is for: the task's lead resolved to its client
 * (`leadClient.ts`), or the lead itself when it has no client. Null when the
 * task names nobody. The popover's "Create project for …" uses this — never a
 * name comparison of its own.
 */
export const clientForTask = (task: Pick<Task, "relatedLeadId">, leads: Lead[]): Lead | null => {
  if (!task.relatedLeadId) return null;
  const lead = leads.find((l) => l.id === task.relatedLeadId);
  if (!lead) return null;
  return resolveLinkedClient(lead, leads) ?? lead;
};

/** The client record a project belongs to (its own link, else via its paired lead). */
const clientIdOfProject = (p: Pick<Project, "clientId" | "leadId">, leads: Lead[]): string | null => {
  if (p.clientId) return p.clientId;
  if (!p.leadId) return null;
  const lead = leads.find((l) => l.id === p.leadId);
  if (!lead) return p.leadId;
  return resolveLinkedClient(lead, leads)?.id ?? lead.id;
};

/**
 * §7.1: a task with a project uses it. A task with only a lead/client uses that client's single
 * active project; with several the caller must ask; with none the timer starts without one.
 */
export const resolveTaskProject = (
  task: Pick<Task, "relatedProjectId" | "relatedLeadId">,
  projects: Project[],
  leads: Lead[],
  isClosed: (project: Project) => boolean,
): TaskProjectResolution => {
  if (task.relatedProjectId) return { projectId: task.relatedProjectId, candidates: [] };
  if (!task.relatedLeadId) return { projectId: null, candidates: [] };
  const lead = leads.find((l) => l.id === task.relatedLeadId);
  const clientId = lead ? resolveLinkedClient(lead, leads)?.id ?? lead.id : task.relatedLeadId;
  const candidates = projects.filter((p) => !p.archived && !isClosed(p) && clientIdOfProject(p, leads) === clientId);
  return candidates.length === 1 ? { projectId: candidates[0].id, candidates } : { projectId: null, candidates };
};

/** Open tasks whose title contains the typed text, best matches first; the timer bar's autocomplete. */
export const matchOpenTasks = (
  tasks: Task[],
  query: string,
  isDone: (task: Task) => boolean,
  limit = 6,
): Task[] => {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return tasks
    .filter((t) => !t.archived && !isDone(t) && t.title.toLowerCase().includes(q))
    .sort((a, b) => Number(b.title.toLowerCase().startsWith(q)) - Number(a.title.toLowerCase().startsWith(q)) || a.title.localeCompare(b.title))
    .slice(0, limit);
};

const ticketTitle = (ticket: Ticket): string => (ticket.title || ticket.subject || "").trim();

/** Open tickets whose title contains the typed text. The timer bar offers them beside tasks. */
export const matchOpenTickets = (tickets: Ticket[], query: string, isClosed: (ticket: Ticket) => boolean, limit = 6): Ticket[] => {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return tickets
    .filter((ticket) => !ticket.archived && !ticket.isArchived && !isClosed(ticket) && ticketTitle(ticket).toLowerCase().includes(q))
    .sort((a, b) => Number(ticketTitle(b).toLowerCase().startsWith(q)) - Number(ticketTitle(a).toLowerCase().startsWith(q)) || ticketTitle(a).localeCompare(ticketTitle(b)))
    .slice(0, limit);
};
