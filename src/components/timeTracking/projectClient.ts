import type { Lead, Project } from "../../types";
import { isClientRecord } from "../../utils/clientRecord.ts";

/** The client's name for a project: by id (the project's client, or its lead's linked client), never by name. */
export const projectClientName = (projectId: string | null | undefined, projects: readonly Project[], leads: readonly Lead[]): string | null => {
  const project = projectId ? projects.find((p) => p.id === projectId) : undefined;
  if (!project) return null;
  let clientId: string | null = project.clientId || null;
  if (!clientId && project.leadId) {
    const lead = leads.find((l) => l.id === project.leadId);
    if (lead) clientId = isClientRecord(lead) ? (lead.id ?? null) : lead.clientId || null;
  }
  return clientId ? leads.find((l) => l.id === clientId)?.name || null : null;
};
