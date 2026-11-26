import type { Ticket, TicketAttachment } from "../types/index.ts";

const attachmentKey = (att: TicketAttachment): string => {
  const ref = (att.path || att.url || att.dataUrl || "").trim();
  if (ref) return `ref:${ref}`;
  if (att.id) return `id:${att.id}`;
  return `name:${(att.name || "").trim().toLowerCase()}`;
};

/**
 * Merges two TicketAttachment lists, preserving order and deduplicating by
 * storage path / URL / dataUrl / id / name.
 */
export function mergeTicketAttachments(
  existing: readonly TicketAttachment[] | null | undefined,
  incoming: readonly TicketAttachment[] | null | undefined,
): TicketAttachment[] {
  const out: TicketAttachment[] = [];
  const seen = new Set<string>();
  for (const list of [existing, incoming]) {
    if (!list) continue;
    for (const att of list) {
      if (!att) continue;
      const key = attachmentKey(att);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(att);
    }
  }
  return out;
}

/**
 * Collects all attachments belonging to a ticket: its own `ticket.attachments`
 * plus any images/files attached to its timeline messages, deduplicated.
 */
export function collectTicketAttachments(
  ticket: Pick<Ticket, "attachments" | "messages"> | null | undefined,
): TicketAttachment[] {
  if (!ticket) return [];
  const fromMessages: TicketAttachment[] = [];
  for (const msg of ticket.messages || []) {
    if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      fromMessages.push(...msg.attachments);
    }
  }
  return mergeTicketAttachments(ticket.attachments, fromMessages);
}
