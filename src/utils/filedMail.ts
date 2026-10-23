/*
  Reading mail the background job filed onto a timeline, and deciding where an
  opened mail is read from: the viewer's own mailbox (live, with HTML and
  attachment downloads) or the stored body (plain text, readable by everyone who
  may see the timeline, whichever mailbox it came from).
*/

export interface FiledMailBody {
  text: string;
  attachments: { name: string; size: number }[];
  mailAccount: string | null;
}

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
  const attachments = Array.isArray(data.email.attachments)
    ? (data.email.attachments as { name?: unknown; size?: unknown }[])
        .filter((a) => a && typeof a.name === "string")
        .map((a) => ({ name: String(a.name), size: Number(a.size) || 0 }))
    : [];
  return { text: String(data.email.text ?? ""), attachments, mailAccount: data.email.mail_account ?? null };
}
