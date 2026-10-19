/**
 * Which client a lead belongs to.
 *
 * Leads and clients share one list. A lead used to be tied to its client by name
 * alone, which breaks as soon as two people share a name or a lead is renamed.
 * `Lead.clientId` is the real link; the name match stays as a fallback for leads
 * that predate it, until the backfill has linked them.
 */
import { isClientRecord } from "./clientRecord.ts";

export interface LeadLike {
  id?: string;
  name?: string;
  adjustment?: number;
  clientId?: string | null;
  phone?: string;
  email?: string;
  contactPerson?: string;
}

const nameKey = (name?: string): string => (name || "").trim().toLowerCase();

/** The client record this lead is linked to, or null when it has none. */
export const resolveLinkedClient = <T extends LeadLike>(lead: T, all: T[]): T | null => {
  // An explicit link wins even when the names differ. If it points at a row that is
  // gone, fall through to the name match rather than showing "no client".
  if (lead.clientId) {
    const linked = all.find((l) => l.id === lead.clientId);
    if (linked) return linked;
  }
  const key = nameKey(lead.name);
  if (!key) return null;
  return all.find((l) => nameKey(l.name) === key && isClientRecord(l)) || null;
};

/** True when the link comes from `clientId`, not from the name fallback. */
export const isLinkedById = <T extends LeadLike>(lead: T, all: T[]): boolean =>
  !!lead.clientId && all.some((l) => l.id === lead.clientId);

/**
 * Phone, e-mail and contact person to show for a lead. The lead's own values win.
 * A lead linked by id only borrows from its own client: a look-alike lead with the
 * same name is a different person and must never lend its number. Unlinked leads
 * keep the old behaviour of borrowing from same-name siblings.
 */
export const contactDetailsFor = <T extends LeadLike>(
  lead: T,
  all: T[],
  client: T | null,
): { phone: string; email: string; contactPerson: string } => {
  const siblings = isLinkedById(lead, all)
    ? []
    : all.filter((l) => nameKey(l.name) === nameKey(lead.name));
  const pick = (field: "phone" | "email" | "contactPerson"): string =>
    lead[field] || siblings.find((l) => l[field])?.[field] || client?.[field] || "";
  return { phone: pick("phone"), email: pick("email"), contactPerson: pick("contactPerson") };
};
