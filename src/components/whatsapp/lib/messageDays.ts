/**
 * Day separators for a conversation: which messages share a calendar day, and what the separator says.
 * Pure functions; `now` and the locale are parameters so the output is testable. The timeline is oldest
 * first, as the API pages it.
 */

export interface DayLabels {
  today: string;
  yesterday: string;
}

/** A message as far as the timeline is concerned. */
export interface Timed {
  id: string;
  /** ISO timestamp. */
  sent_at: string;
}

export type TimelineItem<M extends Timed> =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; key: string; message: M };

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** "Today", "Yesterday", else "Tuesday, 14 October" in the viewer's locale. */
export function dayLabel(date: Date | string | number, labels: DayLabels, locale?: string, now: Date = new Date()): string {
  const d = new Date(date);
  if (dayKey(d) === dayKey(now)) return labels.today;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return labels.yesterday;
  return d.toLocaleDateString(locale, { weekday: "long", day: "2-digit", month: "long" });
}

/** The clock time under a bubble, without seconds. */
export function messageTime(date: Date | string | number, locale?: string): string {
  return new Date(date).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/**
 * The messages with a separator before the first one of each day. Messages with an unreadable
 * timestamp are kept, without a separator of their own.
 */
export function withDaySeparators<M extends Timed>(
  messages: readonly M[],
  labels: DayLabels,
  locale?: string,
  now: Date = new Date(),
): TimelineItem<M>[] {
  const out: TimelineItem<M>[] = [];
  let current: string | null = null;
  for (const message of messages) {
    const d = new Date(message.sent_at);
    if (!Number.isNaN(d.getTime())) {
      const key = dayKey(d);
      if (key !== current) {
        current = key;
        out.push({ kind: "day", key: `day-${key}`, label: dayLabel(d, labels, locale, now) });
      }
    }
    out.push({ kind: "message", key: message.id, message });
  }
  return out;
}

/** The stamp on a chat row: the time today, "Yesterday", the weekday within a week, else day and month. */
export function rowStamp(date: Date | string | number, labels: DayLabels, locale?: string, now: Date = new Date()): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  if (dayKey(d) === dayKey(now)) return messageTime(d, locale);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return labels.yesterday;
  if (now.getTime() - d.getTime() < 6 * 24 * 3600 * 1000) return d.toLocaleDateString(locale, { weekday: "short" });
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short" });
}
