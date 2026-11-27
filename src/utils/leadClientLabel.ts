/**
 * The small client name shown under a lead's name in the leads list.
 *
 * A lead's name is whatever the lead was filed under: the company, or the person when
 * the web form sent no company (api/pipeline.php). Two leads can therefore read the
 * same in the list while belonging to different clients. The label is shown only where
 * it tells the reader something:
 * - the lead's client has a different name than the lead, or
 * - another lead with the same name belongs to a different client.
 * A lead named exactly like its only client gets no label, so the list is not doubled.
 * A lead with no client yet shows its own e-mail instead (when it has one).
 * Several leads with the same name and the same client look identical even so; when they
 * came from different people, each also shows its sender (contact person, else e-mail),
 * after the client name if that is shown ("Novák s.r.o. · Ján Novák").
 * Client records themselves never get one.
 *
 * Which client a lead belongs to follows `resolveLinkedClient` (utils/leadClient.ts):
 * the `clientId` link first, the same-name client as the fallback. It is re-done here
 * with lookup maps because this runs over the whole list on every change.
 */
import { isClientRecord } from "./clientRecord.ts";
import type { LeadLike } from "./leadClient.ts";

const nameKey = (name?: string): string => (name || "").trim().toLowerCase();

/** Lead id -> client name (or, unlinked, e-mail) to show under it. No useful label: absent. */
export const leadClientLabels = <T extends LeadLike>(all: T[]): Map<string, string> => {
  const byId = new Map<string, T>();
  const clientByName = new Map<string, T>();
  for (const l of all) {
    if (l.id && !byId.has(l.id)) byId.set(l.id, l);
    const key = nameKey(l.name);
    if (key && isClientRecord(l) && !clientByName.has(key)) clientByName.set(key, l);
  }

  const resolved: Array<{ lead: T; client: T }> = [];
  // Lead name -> the distinct clients leads of that name belong to.
  const clientsByName = new Map<string, Set<string>>();
  const labels = new Map<string, string>();
  for (const lead of all) {
    if (!lead.id || isClientRecord(lead)) continue;
    const key = nameKey(lead.name);
    const client = (lead.clientId && byId.get(lead.clientId)) || (key ? clientByName.get(key) : undefined);
    if (!client?.id || client.id === lead.id) {
      // No client yet: the lead's own e-mail is what tells same-name leads apart.
      const email = (lead.email || "").trim();
      if (email) labels.set(lead.id, email);
      continue;
    }
    resolved.push({ lead, client });
    if (!clientsByName.has(key)) clientsByName.set(key, new Set());
    clientsByName.get(key)!.add(client.id);
  }

  // Same name + same client -> the distinct senders among those leads.
  const pairKey = (lead: T, client: T): string => `${nameKey(lead.name)}\u0000${client.id}`;
  const sendersByPair = new Map<string, Set<string>>();
  for (const { lead, client } of resolved) {
    const k = pairKey(lead, client);
    if (!sendersByPair.has(k)) sendersByPair.set(k, new Set());
    sendersByPair.get(k)!.add(nameKey(senderOf(lead)));
  }

  for (const { lead, client } of resolved) {
    const clientName = (client.name || "").trim();
    const key = nameKey(lead.name);
    const differs = !!clientName && nameKey(clientName) !== key;
    const ambiguous = !!clientName && (clientsByName.get(key)?.size || 0) > 1;
    // Several leads of one name and one client, sent by different people: say who.
    const sender = (sendersByPair.get(pairKey(lead, client))?.size || 0) > 1 ? senderOf(lead) : "";
    const parts = [differs || ambiguous ? clientName : "", sender].filter(Boolean);
    if (parts.length) labels.set(lead.id!, parts.join(" · "));
  }
  return labels;
};

/** Who a lead came from: its contact person, else its e-mail. */
const senderOf = (lead: LeadLike): string => {
  const person =
    (lead.contactPerson || "").trim() ||
    [lead.contactFirstName, lead.contactLastName].map((s) => (s || "").trim()).filter(Boolean).join(" ");
  return person || (lead.email || "").trim();
};
