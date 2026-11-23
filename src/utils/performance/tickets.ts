/**
 * Podpora: tickets received in the period by status category, and first-response time.
 *
 * Ticket timestamps are server stamps without a zone ("2026-11-20 10:00:00"), which the app reads
 * as UTC (see `evaluateTicketSla`); they are converted to local time before any day or week
 * comparison (`parseUtcStamp`).
 */

import type { Ticket, TicketStatusCategory, TicketStatusDef } from "../../types/index.ts";
import type { PerformancePeriod, ResponseTimeData, TicketCategoryKey, TicketsByStatusData } from "../../components/dashboard/performance/types.ts";
import { addDays, endOfDay, isInRange, isoWeekNumber, parseUtcStamp, startOfDay, startOfIsoWeek } from "./period.ts";

export const TICKET_CATEGORY_ORDER: readonly TicketCategoryKey[] = ["new", "open", "waiting", "resolved", "closed"];

const isCategory = (value: string): value is TicketStatusCategory => (TICKET_CATEGORY_ORDER as readonly string[]).includes(value);

/** A ticket's status category through the status definitions; an unknown status counts as open. */
const categoryOf = (ticket: Ticket, defs: readonly TicketStatusDef[]): TicketCategoryKey => {
  const def = defs.find((s) => s.id === ticket.status || s.key === ticket.status);
  const raw = def?.category ?? def?.group ?? (isCategory(ticket.status) ? ticket.status : "open");
  return isCategory(raw) ? raw : "open";
};

export interface TicketsByStatusInput {
  tickets: readonly Ticket[];
  ticketStatuses: readonly TicketStatusDef[];
  period: PerformancePeriod;
}

export const computeTicketsByStatus = ({ tickets, ticketStatuses, period }: TicketsByStatusInput): TicketsByStatusData => {
  const counts: Record<TicketCategoryKey, number> = { new: 0, open: 0, waiting: 0, resolved: 0, closed: 0 };
  let total = 0;
  for (const ticket of tickets) {
    if (!isInRange(parseUtcStamp(ticket.createdAt), period.start, period.end)) continue;
    counts[categoryOf(ticket, ticketStatuses)] += 1;
    total += 1;
  }
  return {
    total,
    open: counts.new + counts.open + counts.waiting,
    categories: TICKET_CATEGORY_ORDER.map((category) => ({
      category,
      count: counts[category],
      sharePct: total > 0 ? (counts[category] / total) * 100 : null,
    })),
  };
};

/**
 * The default "met the first-response limit" test: the first response came no later than the due
 * time the server stamped on the ticket (which already accounts for business hours and paused
 * time). Null when the ticket has no due time, so it is left out of the percentage.
 */
export const firstResponseWithinSla = (ticket: Ticket): boolean | null => {
  const due = parseUtcStamp(ticket.slaFirstResponseDueAt || ticket.firstResponseDueAt);
  const responded = parseUtcStamp(ticket.slaFirstRespondedAt || ticket.firstRespondedAt);
  if (!due || !responded) return null;
  return responded.getTime() <= due.getTime();
};

export interface ResponseTimeInput {
  tickets: readonly Ticket[];
  period: PerformancePeriod;
  today: Date;
  /** The first-response limit of the installation, in ms; passed through for the bar. */
  slaMs: number | null;
  /** True / false when the ticket's first response met / missed its limit, null when nothing is tracked for it. */
  isWithinSla: (ticket: Ticket) => boolean | null;
}

/** Milliseconds from creation to first response for tickets created inside the range that were answered. */
const answeredIn = (tickets: readonly Ticket[], start: Date | null, end: Date | null) => {
  const out: { ticket: Ticket; ms: number }[] = [];
  for (const ticket of tickets) {
    const created = parseUtcStamp(ticket.createdAt);
    if (!created || !isInRange(created, start, end)) continue;
    const responded = parseUtcStamp(ticket.slaFirstRespondedAt || ticket.firstRespondedAt);
    if (!responded) continue;
    out.push({ ticket, ms: Math.max(0, responded.getTime() - created.getTime()) });
  }
  return out;
};

const mean = (values: readonly number[]): number | null =>
  values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

export const computeResponseTime = ({ tickets, period, today, slaMs, isWithinSla }: ResponseTimeInput): ResponseTimeData => {
  const answered = answeredIn(tickets, period.start, period.end);
  const averageMs = mean(answered.map((a) => a.ms));

  let deltaMs: number | null = null;
  if (period.previousStart && period.previousEnd && averageMs !== null) {
    const previous = mean(answeredIn(tickets, period.previousStart, period.previousEnd).map((a) => a.ms));
    if (previous !== null) deltaMs = averageMs - previous;
  }

  let tracked = 0;
  let within = 0;
  for (const { ticket } of answered) {
    const verdict = isWithinSla(ticket);
    if (verdict === null) continue;
    tracked += 1;
    if (verdict) within += 1;
  }

  // The four ISO weeks ending with the week of the earlier of the period end and today.
  const reference = period.end && period.end.getTime() < today.getTime() ? period.end : today;
  const lastMonday = startOfIsoWeek(reference);
  const weeks = [-3, -2, -1, 0].map((offset) => {
    const monday = addDays(lastMonday, offset * 7);
    const sunday = endOfDay(addDays(monday, 6));
    return {
      isoWeek: isoWeekNumber(monday),
      averageMs: mean(answeredIn(tickets, startOfDay(monday), sunday).map((a) => a.ms)),
    };
  });

  return { averageMs, deltaMs, withinSlaPct: tracked > 0 ? (within / tracked) * 100 : null, slaMs, weeks };
};
