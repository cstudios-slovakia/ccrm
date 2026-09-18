/**
 * The future half of the movements ledger: money that has not moved yet.
 *
 * The ledger only ever shows what was entered — a recurring rule is a single
 * record, and an invoice issued in August sits in August however far away its
 * due date is. Neither tells you what next month actually costs. This module
 * derives that, by walking every source a future transaction can come from:
 *
 *  - **recurring** — each occurrence a rule charges after today, priced at the
 *    amount in force on that day (see `recurringExpenses.ts`).
 *  - **due** — an unsettled movement with a due date ahead of us: the invoice
 *    issued last week and payable next month, the tax filed and not yet paid.
 *  - **scheduled** — an unsettled movement with no due date that was entered
 *    for a day still ahead of us.
 *
 * A recurring rule never stops charging, so a forecast has to be bounded or it
 * runs forever. Callers ask for one window at a time (`futureWindow`) and widen
 * it a month per click; `hasFutureBeyond` says whether widening would turn
 * anything up, so the offer is only made when there is something to load.
 *
 * Everything is `YYYY-MM-DD` string maths, so a forecast does not shift with
 * the viewer's timezone.
 */

import type { FinancialRecord, FinancialType } from "../types";
import { splitRecordAmounts } from "./financialOverviewTable.ts";
import { recurringCharges, shiftIsoDate } from "./recurringExpenses.ts";

/** Where a forecast row came from — it is what the row's badge names. */
export type FutureMovementSource = "recurring" | "due" | "scheduled";

/** One expected transaction on one day. Not a record: nothing of it is stored. */
export interface FutureMovement {
  /** Stable across re-renders, and distinct from every real record id. */
  id: string;
  /** The rule or record it was derived from, for the title, category and scope. */
  record: FinancialRecord;
  source: FutureMovementSource;
  type: FinancialType;
  /** The day the money is expected to move. */
  date: string;
  /** What is still expected to move on that day — never what has already been paid. */
  amount: number;
}

/** Inclusive date window a forecast covers. `startIso` is the day after today. */
export interface FutureWindow {
  startIso: string;
  endIso: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" && ISO_DATE.test(value);

/**
 * `YYYY-MM-DD` moved by whole months, keeping the day of the month where the
 * target month is long enough — 31 January plus a month is the end of February,
 * not the 3rd of March.
 */
export function addIsoMonths(iso: string, months: number): string {
  if (!isIsoDate(iso)) return iso;
  const [year, month, day] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * The window a forecast of `months` months covers, counted from today.
 *
 * Today itself is excluded: whatever was going to happen today is already in
 * the ledger as a real movement, and showing it twice would double the day.
 */
export function futureWindow(todayIso: string, months: number): FutureWindow {
  const span = Math.max(1, Math.round(months) || 1);
  return { startIso: shiftIsoDate(todayIso, 1), endIso: addIsoMonths(todayIso, span) };
}

/** The window that loading one more month would add, directly after `window`. */
export function nextFutureWindow(todayIso: string, months: number): FutureWindow {
  const span = Math.max(1, Math.round(months) || 1);
  return { startIso: shiftIsoDate(addIsoMonths(todayIso, span), 1), endIso: addIsoMonths(todayIso, span + 1) };
}

/**
 * The day a one-off movement's money is expected: its due date, falling back to
 * the day it was entered for. A movement already paid has no expected day left.
 */
export const expectedPaymentDate = (
  rec: Pick<FinancialRecord, "dueDate" | "issueDate">
): string => rec.dueDate || rec.issueDate || "";

/**
 * Can this record still produce a transaction?
 *
 * `paid` has already moved and `cancelled` never will — everything else, a
 * `partially_paid` invoice included, still owes the difference.
 */
const isOpen = (rec: FinancialRecord): boolean =>
  rec.status !== "paid" && rec.status !== "cancelled";

/**
 * Every transaction expected between `startIso` and `endIso`, inclusive,
 * oldest first.
 *
 * A recurring rule contributes one row per charge; every other record
 * contributes at most one, on the day it is expected to settle, for the part of
 * it that is still outstanding. A paused rule charges nothing past its stop
 * date — an explicit `recurringEndDate`, or, for a rule paused the old way by
 * `status` alone, the day `effectiveRecurringEndDate` reads off it — because
 * `recurringCharges` already stops there; there is no separate `status` guard
 * here, so the forecast can never disagree with the overview table or the
 * cash-flow trend about when a rule stopped.
 */
export function projectFutureMovements(
  records: FinancialRecord[],
  startIso: string,
  endIso: string
): FutureMovement[] {
  if (!isIsoDate(startIso) || !isIsoDate(endIso) || startIso > endIso) return [];

  const out: FutureMovement[] = [];

  records.forEach((rec) => {
    if (rec.isRecurring) {
      recurringCharges(rec, startIso, endIso).forEach(({ date, amount }) => {
        if (amount <= 0) return;
        out.push({
          id: `future:recurring:${rec.id}:${date}`,
          record: rec,
          source: "recurring",
          type: rec.type,
          date,
          amount
        });
      });
      return;
    }

    if (!isOpen(rec)) return;

    const date = expectedPaymentDate(rec);
    if (!isIsoDate(date) || date < startIso || date > endIso) return;

    const { estimated } = splitRecordAmounts(rec);
    if (estimated <= 0) return;

    out.push({
      id: `future:${rec.dueDate ? "due" : "scheduled"}:${rec.id}`,
      record: rec,
      source: rec.dueDate ? "due" : "scheduled",
      type: rec.type,
      date,
      amount: estimated
    });
  });

  out.sort((a, b) => a.date.localeCompare(b.date) || a.record.title.localeCompare(b.record.title));
  return out;
}

/**
 * Records the forecast has taken over.
 *
 * A due or scheduled movement is one record shown on the day it is expected, so
 * the ledger has to stop drawing it on the day it was issued — otherwise the
 * same invoice is counted in August and again in October.
 *
 * A recurring rule is claimed only when one of its charges lands on the rule's
 * own ledger day — a rule starting on 1 October is itself the October charge,
 * and drawing both would show that one payment twice. A rule that started
 * earlier keeps its row; its later charges are extra rows beside it.
 *
 * A movement that
 * has *already* been paid in part is never claimed — the 4 000 € received against a 9 200 €
 * invoice is money in the bank, and it belongs on the day it arrived. Only the
 * outstanding 5 200 € moves forward, so both halves stay visible and neither is
 * counted twice.
 */
export function claimedRecordIds(movements: FutureMovement[]): Set<string> {
  const ids = new Set<string>();
  movements.forEach((m) => {
    if (splitRecordAmounts(m.record).real > 0) return;
    if (m.source === "recurring" && m.date !== (m.record.paidDate || m.record.issueDate)) return;
    ids.add(m.record.id);
  });
  return ids;
}

/**
 * Is there anything left to forecast past a window — i.e. is another month
 * worth offering?
 *
 * `accepts` is the caller's filter bar: offering "load another month" for rows
 * the active filters would then hide is an empty promise, so a row only counts
 * if it would actually be drawn.
 */
export function hasFutureBeyond(
  records: FinancialRecord[],
  todayIso: string,
  months: number,
  accepts: (movement: FutureMovement) => boolean = () => true
): boolean {
  const next = nextFutureWindow(todayIso, months);
  return projectFutureMovements(records, next.startIso, next.endIso).some(accepts);
}

/** Income, expense and net of a set of forecast rows. */
export function futureTotals(movements: FutureMovement[]): {
  income: number;
  expense: number;
  net: number;
} {
  let income = 0;
  let expense = 0;
  movements.forEach((m) => {
    if (m.type === "income") income += m.amount;
    else expense += m.amount;
  });
  return { income, expense, net: income - expense };
}
