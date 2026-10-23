/*
  Reading mail the background job filed onto a timeline, and deciding where an
  opened mail is read from: the viewer's own mailbox (live, with HTML and
  attachment downloads) or the stored body (plain text, readable by everyone who
  may see the timeline, whichever mailbox it came from).
*/

export interface FiledMailAttachment {
  name: string;
  size: number;
  /** The file was kept on the server and can be opened; otherwise only its name is known. */
  stored: boolean;
  /** Position in the message's attachment list: how the server addresses it. */
  index: number;
}

export interface FiledMailBody {
  text: string;
  attachments: FiledMailAttachment[];
  mailAccount: string | null;
}

/** Where a kept attachment is streamed from (after the server's e-mail permission check). */
export const filedMailAttachmentUrl = (eventId: string, index: number, download = false): string =>
  `/api/mail_broker.php?action=get_filed_mail_attachment&id=${encodeURIComponent(eventId)}&n=${index}${download ? "&download=1" : ""}`;

/** The entry is the viewer's own mail: opening it can use their mailbox. */
export const isOwnMailbox = (event: { mailOwner?: string | null }, viewerEmail: string | null | undefined): boolean =>
  !!event.mailOwner && !!viewerEmail && event.mailOwner.trim().toLowerCase() === viewerEmail.trim().toLowerCase();

/**
 * Where to open a timeline mail from. A mail that has a stored body and is not in the
 * viewer's own mailbox can only be read from the store; everything else keeps reading live,
 * as it always did (including entries from before mailboxes were recorded).
 */
export const shouldReadStoredBody = (
  event: { hasStoredBody?: boolean; mailOwner?: string | null },
  viewerEmail: string | null | undefined,
): boolean => !!event.hasStoredBody && !isOwnMailbox(event, viewerEmail);

export async function fetchFiledMail(eventId: string): Promise<FiledMailBody> {
  const res = await fetch(`/api/mail_broker.php?action=get_filed_mail&id=${encodeURIComponent(eventId)}`);
  let data: { success?: boolean; error?: string; email?: { text?: string; attachments?: unknown; mail_account?: string | null } } | null = null;
  try {
    data = await res.json();
  } catch {
    /* handled below */
  }
  if (!res.ok || !data?.success || !data.email) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  // The index is taken before anything is dropped: it is the entry's position on the server.
  const attachments: FiledMailAttachment[] = Array.isArray(data.email.attachments)
    ? (data.email.attachments as { name?: unknown; size?: unknown; stored?: unknown }[])
        .map((a, index) => ({ a, index }))
        .filter(({ a }) => a && typeof a.name === "string" && a.name !== "")
        .map(({ a, index }) => ({ name: String(a.name), size: Number(a.size) || 0, stored: a.stored === true, index }))
    : [];
  return { text: String(data.email.text ?? ""), attachments, mailAccount: data.email.mail_account ?? null };
}
