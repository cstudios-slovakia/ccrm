/**
 * Which project a task-started timer belongs to, and which tasks the timer bar offers.
 *
 * Tasks are the primary entity: a task points at a project (`relatedProjectId`) or at a
 * lead / client (`relatedLeadId`) resolved via `leadClient.ts`, or neither (unsorted until linked).
 */

import type { Lead, Project, Task, Ticket } from "../types/index.ts";
import { resolveLinkedClient } from "./leadClient.ts";

export interface TaskProjectResolution {
  projectId: string | null;
  candidates: Project[];
}

/**
 * The party a task is for: the task's lead resolved to its client (`leadClient.ts`),
 * or the lead itself when it has no client. Null when the task names nobody.
 */
export const clientForTask = (task: Pick<Task, "relatedLeadId">, leads: Lead[]): Lead | null => {
  if (!task.relatedLeadId) return null;
  const lead = leads.find((l) => l.id === task.relatedLeadId);
  if (!lead) return null;
  return resolveLinkedClient(lead, leads) ?? lead;
};

/**
 * Tasks are primary: only the task's own `relatedProjectId` maps to a project.
 * If a task only has a client (`relatedLeadId`) or neither, it stays unsorted/direct-to-client
 * without blocking or guessing a project.
 */
export const resolveTaskProject = (
  task: Pick<Task, "relatedProjectId" | "relatedLeadId">,
  _projects: Project[] = [],
  _leads: Lead[] = [],
  _isClosed: (project: Project) => boolean = () => false,
): TaskProjectResolution => ({
  projectId: task.relatedProjectId || null,
  candidates: [],
});

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
