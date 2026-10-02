import type { Lead, Project } from "../types";
import { isClientRecord } from "./clientRecord";
import { isClosedLeadState } from "./leadSla";

/**
 * Ids the task form's "Link to Lead / Client" picker leaves out.
 *
 * A pipeline lead is no longer worth a new task once it has been dealt with:
 * it already has a client (a client record carries its name), it is closed
 * (success or fail), or a project was made from it. Clients themselves always
 * stay, and so does `keepId` — the record a task is already linked to must keep
 * showing its name.
 */
export const staleLeadIdsForTasks = (
  leads: Lead[],
  projects: Project[],
  leadStageGroups: Record<string, string> = {},
  leadStateParents: Record<string, string> = {},
  keepId?: string,
): string[] => {
  const nameKey = (name?: string) => (name || "").trim().toLowerCase();
  const clientNames = new Set(leads.filter(isClientRecord).map((l) => nameKey(l.name)));
  const projectLeadIds = new Set(projects.map((p) => p.leadId).filter(Boolean).map(String));

  return leads
    .filter((l) => {
      if (isClientRecord(l) || (keepId && String(l.id) === String(keepId))) return false;
      return (
        clientNames.has(nameKey(l.name)) ||
        isClosedLeadState(l.status, leadStageGroups, leadStateParents) ||
        projectLeadIds.has(String(l.id))
      );
    })
    .map((l) => l.id);
};
