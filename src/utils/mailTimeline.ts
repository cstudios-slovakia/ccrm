/**
 * Whether a message listed by mail_broker.php was sent by this mailbox.
 *
 * The server decides it (`is_outgoing`) against the mailbox's own address. The
 * client used to compare From: with the CRM login instead, which is a different
 * address whenever someone signs in as alex@crm.com but reads peter@company.sk —
 * then every mail they sent was badged as incoming. The login comparison stays
 * only as a fallback for a backend that predates `is_outgoing`.
 */
export function isOutgoingMail(
  mail: { is_outgoing?: unknown; from?: { address?: string } } | null | undefined,
  loginEmail: string | null | undefined,
): boolean {
  if (typeof mail?.is_outgoing === "boolean") return mail.is_outgoing;
  const from = mail?.from?.address?.trim().toLowerCase();
  const login = loginEmail?.trim().toLowerCase();
  return !!from && from === login;
}

type MergeableEvent = {
  id: string;
  timestamp: string;
  title: string;
  content: string;
  hidden?: boolean;
};

/**
 * A lead's stored timeline merged with the messages just read from the mailbox.
 *
 * The live copy of a message used to replace the stored row outright, so a date
 * or title the user corrected on the timeline never showed while the mailbox was
 * connected. The stored row now supplies what the user may edit; the live copy
 * supplies the rest (read state, direction). A stored row flagged `hidden` was
 * deleted by the user and keeps its live copy out too.
 */
export function mergeLeadTimeline<T extends MergeableEvent>(stored: T[], live: T[]): T[] {
  const storedById = new Map(stored.map((e) => [e.id, e]));
  const liveIds = new Set(live.map((e) => e.id));
  const merged: T[] = stored.filter((e) => !e.hidden && !liveIds.has(e.id));
  for (const mail of live) {
    const kept = storedById.get(mail.id);
    if (kept?.hidden) continue;
    merged.push(
      kept
        ? { ...mail, timestamp: kept.timestamp, title: kept.title, content: kept.content }
        : mail,
    );
  }
  return merged;
}

/**
 * The timeline with `event` replaced by `patch` applied to it — appended first if
 * the timeline does not carry it yet. A message read live from the mailbox is on
 * screen before the lead's stored timeline is reloaded, and an edit to it would
 * otherwise have nothing to land on and silently vanish.
 */
export function withTimelineEvent<T extends { id: string }>(
  timeline: T[],
  event: T,
  patch: Partial<T>,
): T[] {
  return timeline.some((e) => e.id === event.id)
    ? timeline.map((e) => (e.id === event.id ? { ...e, ...patch } : e))
    : [...timeline, { ...event, ...patch }];
}
