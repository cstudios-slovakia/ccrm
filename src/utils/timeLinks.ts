/**
 * Which project a task-started timer belongs to, and which tasks the timer bar offers.
 *
 * A task points at a project (`relatedProjectId`) or only at a lead / client
 * (`relatedLeadId`). Clients and leads are one table, so the client of a lead is
 * resolved with `leadClient.ts` — never by comparing names.
 */

import type { Lead, Project, Task } from "../types/index.ts";
import { resolveLinkedClient } from "./leadClient.ts";

export interface TaskProjectResolution {
  /** The one project to use, when there is exactly one. */
  projectId: string | null;
  /** The candidates when there are several: the caller asks "Which project is this for?". */
  candidates: Project[];
}

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
