import type { Lead, Project, ProjectAttribute, ProjectType } from "../types";
import { buildProjectDataFromLead } from "./leadAttributes.ts";

/**
 * The project a lead becomes ("Convert to project"): named after the lead, its phone and e-mail carried
 * over as the project's contact, its division and rating kept, the lead's owner as manager, and the custom fields copied by
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
    division: (lead.division || "").trim() || null,
    ...(leadRating(lead) ? { rating: leadRating(lead) } : {}),
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
 * The lead's rating as a project can hold it: a real 1-5, else 0. A lead is born at three stars but a
 * project starts unrated, so nothing but a genuine rating is carried over.
 */
function leadRating(lead: Pick<Lead, "rating">): number {
  const r = lead.rating;
  return typeof r === "number" && Number.isFinite(r) && r >= 1 ? Math.min(5, Math.round(r)) : 0;
}

/**
 * The project's contact phone, e-mail, division and rating after it is paired with a lead: an empty one
 * is filled from the lead, one somebody already set is never overwritten (a rating of 0 or none counts as
 * empty, same as "" for the text fields). Returns the same object when nothing changes.
 */
export function fillEmptyFromLead<P extends Pick<Project, "contactPhone" | "contactEmail" | "division" | "rating">>(
  project: P,
  lead: Pick<Lead, "phone" | "email" | "division" | "rating"> | null | undefined,
): P {
  if (!lead) return project;
  const phone = (lead.phone || "").trim();
  const email = (lead.email || "").trim();
  const division = (lead.division || "").trim();
  const rating = leadRating(lead);
  const fillPhone = !(project.contactPhone || "").trim() && phone;
  const fillEmail = !(project.contactEmail || "").trim() && email;
  const fillDivision = !(project.division || "").trim() && division;
  const fillRating = !project.rating && rating;
  if (!fillPhone && !fillEmail && !fillDivision && !fillRating) return project;
  return {
    ...project,
    ...(fillPhone ? { contactPhone: phone } : {}),
    ...(fillEmail ? { contactEmail: email } : {}),
    ...(fillDivision ? { division } : {}),
    ...(fillRating ? { rating } : {}),
  };
}
