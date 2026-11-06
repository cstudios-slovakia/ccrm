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

/** How a record takes part when the Clients page saves a profile. */
export type ProfileRole = "client" | "linked" | "sibling" | "other";

/**
 * Who a profile save of `clientName` may touch.
 * - client: a client record of that name (explicit `client-*` row or adjustment > 0)
 * - linked: a lead whose `clientId` points at one of those records
 * - sibling: a same-name lead with no usable link; it keeps receiving the update
 * - other: everything else, including a same-name lead linked to a different client
 */
export const profileRoleFor = <T extends LeadLike>(lead: T, all: T[], clientName: string): ProfileRole => {
  const key = nameKey(clientName);
  const sameName = nameKey(lead.name) === key;
  if (sameName && isClientRecord(lead)) return "client";
  const clientIds = new Set(all.filter((l) => nameKey(l.name) === key && isClientRecord(l)).map((l) => l.id));
  if (lead.clientId && clientIds.has(lead.clientId)) return "linked";
  if (!sameName) return "other";
  return isLinkedById(lead, all) ? "other" : "sibling";
};

const CONTACT_FIELDS = ["phone", "email", "contactPerson"] as const;

/**
 * Applies a client profile to the records it belongs to (see `profileRoleFor`).
 * A lead linked by id keeps its own name and contact details: those are per lead,
 * and the client card already falls back to the client's values when they are empty.
 *
 * The client value `adjustment` is one amount per client and lives on the client
 * row only. Copying it onto a linked lead made that lead a client of its own
 * (`isClientRecord` reads `adjustment > 0`) and counted the amount twice in the
 * register. So a linked lead, and a same-name sibling of a profile that has a
 * client row, never receive it; a copy left there by an earlier save (the same
 * amount the client row held) is reset to 0. Only a profile with no client row at
 * all still writes it to its same-name leads: one of them has to carry it.
 */
export const applyClientProfile = <T extends LeadLike>(
  all: T[],
  clientName: string,
  patch: Partial<T> & { name: string },
): T[] => {
  const key = nameKey(clientName);
  const clientRows = all.filter((l) => nameKey(l.name) === key && isClientRecord(l));
  const writesAdjustment = "adjustment" in patch;
  // The amounts the client row(s) held before this save: a non-client row carrying
  // exactly one of them is a copy an earlier save made, not a value of its own.
  const copiedAdjustments = new Set(
    clientRows.map((l) => Number(l.adjustment) || 0).filter((n) => n !== 0),
  );
  const withoutAdjustment = (lead: T, own: Partial<T>): T => {
    if (!writesAdjustment) return { ...lead, ...own };
    const rest: Partial<T> = { ...own };
    delete rest.adjustment;
    const next: T = { ...lead, ...rest };
    return copiedAdjustments.has(Number(lead.adjustment) || 0) ? { ...next, adjustment: 0 } : next;
  };
  return all.map((lead) => {
    const role = profileRoleFor(lead, all, clientName);
    if (role === "other") return lead;
    if (role === "client") return { ...lead, ...patch };
    if (role === "sibling") {
      return clientRows.length === 0 ? { ...lead, ...patch } : withoutAdjustment(lead, patch);
    }
    const own: Partial<T> = { ...patch };
    for (const f of CONTACT_FIELDS) delete own[f];
    // Renaming the client renames leads that carried its name; a differently named lead keeps its own.
    if (nameKey(lead.name) !== nameKey(clientName)) delete own.name;
    return withoutAdjustment(lead, own);
  });
};

/**
 * Which Clients-page profile each record belongs to.
 *
 * The register used to group by name only, so a lead linked to its client by
 * `clientId` under another name was missing from that client's value, timeline,
 * categories, tickets and documents, and renaming a lead moved it between
 * clients. Now:
 * - a lead whose `clientId` points at an existing row joins that row's profile,
 *   whatever its own name;
 * - every other record falls back to its name, exactly as before.
 *
 * Same-name client records still share one profile (as they always did), so the
 * key of a name that has a client record is the first such record's id; a name
 * without one keys by the name itself. `anchorId` is that client record, the row
 * the profile takes its name and details from, or undefined for a name-only group.
 */
export interface ClientProfileGroup {
  key: string;
  anchorId?: string;
}

export const clientProfileGroups = <T extends LeadLike>(all: T[]): Map<T, ClientProfileGroup> => {
  const byId = new Map<string, T>();
  const firstClientByName = new Map<string, T>();
  for (const l of all) {
    if (l.id && !byId.has(l.id)) byId.set(l.id, l);
    const k = nameKey(l.name);
    if (k && isClientRecord(l) && !firstClientByName.has(k)) firstClientByName.set(k, l);
  }
  const groupForName = (name?: string): ClientProfileGroup => {
    const k = nameKey(name);
    const anchor = firstClientByName.get(k);
    return anchor ? { key: `client:${anchor.id}`, anchorId: anchor.id } : { key: `name:${k}` };
  };
  const out = new Map<T, ClientProfileGroup>();
  for (const l of all) {
    const linked = l.clientId ? byId.get(l.clientId) : undefined;
    out.set(l, groupForName(linked ? linked.name : l.name));
  }
  return out;
};
