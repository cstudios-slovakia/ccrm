import type { Lead, Project, ProjectAttribute, ProjectType } from "../types";
import { buildProjectDataFromLead } from "./leadAttributes.ts";

/**
 * The project a lead becomes ("Convert to project"): named after the lead, its phone and e-mail carried
 * over as the project's contact, the lead's owner as manager, and the custom fields copied by
 * `buildProjectDataFromLead`. Pure: the caller supplies the id and the starting status.
 */
export function buildProjectFromLead(
  lead: Lead,
  type: Pick<ProjectType, "id" | "attributes">,
  leadAttributes: readonly ProjectAttribute[],
  opts: { id: string; status: string; defaultCurrency?: string },
): Project {
  return {
    id: opts.id,
    projectTypeId: type.id,
    name: (lead.name || "").trim(),
    leadId: lead.id,
    clientId: lead.id,
    status: opts.status,
    managers: lead.owner ? [lead.owner] : [],
    contactPhone: (lead.phone || "").trim() || null,
    contactEmail: (lead.email || "").trim() || null,
    data: buildProjectDataFromLead(lead, leadAttributes, type.attributes || [], opts.defaultCurrency),
    timeline: [],
    gantt: [],
    archived: false,
  };
}

/**
 * The project's contact phone and e-mail after it is paired with a lead: an empty one is filled from the
 * lead, one somebody already typed is never overwritten. Returns the same object when nothing changes.
 */
export function fillEmptyContactFromLead<P extends Pick<Project, "contactPhone" | "contactEmail">>(
  project: P,
  lead: Pick<Lead, "phone" | "email"> | null | undefined,
): P {
  if (!lead) return project;
  const phone = (lead.phone || "").trim();
  const email = (lead.email || "").trim();
  const fillPhone = !(project.contactPhone || "").trim() && phone;
  const fillEmail = !(project.contactEmail || "").trim() && email;
  if (!fillPhone && !fillEmail) return project;
  return {
    ...project,
    ...(fillPhone ? { contactPhone: phone } : {}),
    ...(fillEmail ? { contactEmail: email } : {}),
  };
}
