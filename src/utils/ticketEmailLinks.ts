import type { Ticket, TicketLinkedEmail } from "../types";

export interface EmailLike {
  uid?: number | string;
  event_id?: string;
  message_id?: string;
  subject?: string;
  isSent?: boolean;
  date?: string;
  from?: { name?: string; address?: string };
  to?: { name?: string; address?: string };
}

const norm = (v?: string | null): string => (v || "").trim().toLowerCase();

export function getTicketLinkedEmails(ticket: Ticket): TicketLinkedEmail[] {
  const raw = ticket.metadata?.linkedEmails;
  return Array.isArray(raw) ? raw.filter((x): x is TicketLinkedEmail => Boolean(x && typeof x === "object" && (x.uid !== undefined || x.messageId || x.eventId))) : [];
}

export function buildLinkedEmail(
  email: EmailLike,
  opts: { mailboxId?: string; activeFolder?: string; linkedAt?: string } = {},
): TicketLinkedEmail {
  const folder = email.isSent ? "Sent" : (opts.activeFolder || "INBOX");
  const mailboxId = opts.mailboxId || "personal";
  const messageId = (email.message_id || "").trim() || undefined;
  const eventId = (email.event_id || "").trim() || undefined;
  const uid = email.uid ?? "";
  const id = messageId || eventId || `${mailboxId}:${folder}:${uid}`;
  return {
    id,
    uid,
    folder,
    mailboxId,
    eventId,
    messageId,
    subject: (email.subject || "").trim() || "(No Subject)",
    fromName: (email.from?.name || "").trim() || undefined,
    fromAddress: (email.from?.address || "").trim() || undefined,
    date: (email.date || "").trim() || undefined,
    linkedAt: opts.linkedAt || new Date().toISOString(),
  };
}

export function emailMatchesLink(
  email: EmailLike,
  link: TicketLinkedEmail,
  currentMailboxId?: string,
  activeFolder = "INBOX",
): boolean {
  const emailMsgId = norm(email.message_id);
  const linkMsgId = norm(link.messageId);
  if (emailMsgId && linkMsgId && emailMsgId === linkMsgId) return true;

  const emailEventId = norm(email.event_id);
  const linkEventId = norm(link.eventId);
  if (emailEventId && linkEventId && emailEventId === linkEventId) return true;

  if (email.uid !== undefined && email.uid !== "" && String(email.uid) === String(link.uid)) {
    const emailFolder = norm(email.isSent ? "Sent" : activeFolder);
    const linkFolder = norm(link.folder || "INBOX");
    const emailMb = norm(currentMailboxId || "personal");
    const linkMb = norm(link.mailboxId || "personal");
    if (emailFolder === linkFolder && emailMb === linkMb) return true;
  }

  return false;
}

export function findLinkedTicketsForEmails(
  tickets: Ticket[],
  emails: EmailLike[],
  currentMailboxId?: string,
  activeFolder = "INBOX",
): Ticket[] {
  if (!tickets.length || !emails.length) return [];
  const emailMsgIds = new Set(emails.map((e) => norm(e.message_id)).filter(Boolean));
  return tickets.filter((ticket) => {
    if (ticket.emailMessageId && emailMsgIds.has(norm(ticket.emailMessageId))) {
      return true;
    }
    const links = getTicketLinkedEmails(ticket);
    if (!links.length) return false;
    return emails.some((em) => links.some((lnk) => emailMatchesLink(em, lnk, currentMailboxId, activeFolder)));
  });
}

export function linkEmailToTicket(ticket: Ticket, link: TicketLinkedEmail): Ticket {
  const existing = getTicketLinkedEmails(ticket);
  const already = existing.some(
    (item) =>
      item.id === link.id ||
      (norm(item.messageId) && norm(item.messageId) === norm(link.messageId)) ||
      (norm(item.eventId) && norm(item.eventId) === norm(link.eventId)) ||
      (String(item.uid) === String(link.uid) &&
        norm(item.folder || "INBOX") === norm(link.folder || "INBOX") &&
        norm(item.mailboxId || "personal") === norm(link.mailboxId || "personal")),
  );
  if (already) return ticket;
  return {
    ...ticket,
    metadata: {
      ...(ticket.metadata || {}),
      linkedEmails: [link, ...existing],
    },
  };
}

export function unlinkEmailFromTicket(
  ticket: Ticket,
  target: { linkId?: string; emails?: EmailLike[]; mailboxId?: string; activeFolder?: string },
): Ticket {
  const existing = getTicketLinkedEmails(ticket);
  const next = existing.filter((item) => {
    if (target.linkId && item.id === target.linkId) return false;
    if (target.emails?.length) {
      if (target.emails.some((em) => emailMatchesLink(em, item, target.mailboxId, target.activeFolder))) {
        return false;
      }
    }
    return true;
  });
  if (next.length === existing.length) return ticket;
  return {
    ...ticket,
    metadata: {
      ...(ticket.metadata || {}),
      linkedEmails: next,
    },
  };
}

export function buildLinkedEmailHash(link: TicketLinkedEmail): string {
  const params = new URLSearchParams();
  if (link.mailboxId) params.set("channel", link.mailboxId);
  if (link.uid !== undefined && link.uid !== "") params.set("uid", String(link.uid));
  if (link.folder) params.set("folder", link.folder);
  if (link.messageId) params.set("msgid", link.messageId);
  return `email?${params.toString()}`;
}

export function buildTicketHash(ticketId: string): string {
  return `tickets/${encodeURIComponent(ticketId)}`;
}
