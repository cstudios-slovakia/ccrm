/**
 * The past half of a recurring rule in the movements ledger: the charges it
 * has already made.
 *
 * A recurring rule is stored as ONE record, so the ledger used to draw it as a
 * single row on its own date, while the overview table and the cash-flow trend
 * count every charge its schedule makes. A rent running since June was 500 € in
 * each of June to September in the table, and 500 € in June alone in the
 * ledger. This module derives the missing rows: one per scheduled charge from
 * the rule's start up to and including today, each priced at the amount in
 * force on its own date (see `recurringExpenses.ts`).
 *
 * Today belongs to this side. The forecast overlay (`futureMovements.ts`)
 * starts tomorrow, so every charge is drawn on exactly one side of today.
 *
 * A charge that has come due is settled money whatever the rule's current
 * status says. That is how the overview table reads it (audit F2/F2b): a
 * pause stamps `recurringEndDate`, which stops the schedule there and leaves
 * every charge on or before it standing.
 *
 * The rule's own row is the one record behind all these charges, and it is
 * drawn once, in whichever of three ways the table would count it
 * (`recurringOwnRowCharge`):
 *
 *  - **before the schedule** (no charge on or before its day): the row is the
 *    rule's first payment. It stays and counts, split by its own status, and
 *    the charges after it are extra rows beside it.
 *  - **on a charge date**: that day is one payment. The charge row stands in
 *    for the rule's row (`claimedIds`), so it is drawn once and counted once,
 *    as the settled charge the table counts.
 *  - **after a charge, on a day the schedule does not charge**: the table does
 *    not count the row as money, because the charge before it already paid
 *    for that period. The ledger keeps it on screen, because it is still the
 *    rule you edit, pause or delete, but it adds nothing to its month's totals
 *    (`uncountedIds`).
 *
 * A day listed in the rule's `recurringSkippedDates` is one a stored one-off
 * movement stands in for (the user edited that single charge): the schedule
 * draws nothing on it, and if it is the rule's own day, the rule row is
 * claimed by that movement just as a charge would claim it.
 *
 * Only past charges decide the last two cases. A rule row dated ahead of
 * today with no charge behind it keeps counting as it always has, and the
 * forecast overlay settles it against the future charges.
 *
 * Everything is `YYYY-MM-DD` string maths, so the charges do not shift with the
 * viewer's timezone.
 */

import type { FinancialRecord, FinancialType } from "../types";
import { overviewRecordDate, splitRecordAmounts } from "./financialOverviewTable.ts";
import { isRecurringDateSkipped, recurringCharges, recurringOccurrences } from "./recurringExpenses.ts";

/** One charge a recurring rule has already made. Not a record: nothing of it is stored. */
export interface PastRecurringCharge {
  /** Stable across re-renders, and distinct from every record id and every forecast id. */
  id: string;
  /** The rule that charged it, for the title, category, scope and the way back to the rule. */
  record: FinancialRecord;
  type: FinancialType;
  /** The day the schedule charged. */
  date: string;
  /** What the charge was worth on that day. It has happened, so all of it is real. */
  amount: number;
}

export interface PastRecurringLedger {
  /** Every charge from each rule's start up to and including today, oldest first. */
  charges: PastRecurringCharge[];
  /** Rule rows that a charge on the same day stands in for: not drawn, the charge is. */
  claimedIds: Set<string>;
  /** Rule rows still drawn as the rule itself, but adding no money: a charge before them covers it. */
  uncountedIds: Set<string>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" && ISO_DATE.test(value);

/**
 * Every charge the recurring rules in `records` have made up to and including
 * `todayIso`, and how each rule's own row sits among them.
 *
 * Claims are made against the whole list, not against the rows a filter
 * leaves on screen. Whether a rule's row is its first payment or only the rule
 * is a fact about the data, and a filter that hides the June charge must not
 * turn the June row back into a second June payment.
 */
export function projectPastRecurringCharges(
  records: FinancialRecord[],
  todayIso: string
): PastRecurringLedger {
  const charges: PastRecurringCharge[] = [];
  const claimedIds = new Set<string>();
  const uncountedIds = new Set<string>();
  if (!isIsoDate(todayIso)) return { charges, claimedIds, uncountedIds };

  records.forEach((rec) => {
    if (!rec.isRecurring) return;

    const ownDate = overviewRecordDate(rec);
    // A rule without a start date has, to the schedule, always been running.
    // The ledger cannot list charges back to year one, so it starts at the
    // rule's own row, the first day the rule is known to have existed.
    const from = isIsoDate(rec.recurringStartDate) ? rec.recurringStartDate : ownDate;
    if (!isIsoDate(from) || from > todayIso) return;

    const drawn = new Set<string>();
    recurringCharges(rec, from, todayIso).forEach(({ date, amount }) => {
      if (amount <= 0) return;
      drawn.add(date);
      charges.push({ id: `past:recurring:${rec.id}:${date}`, record: rec, type: rec.type, date, amount });
    });

    if (!isIsoDate(ownDate)) return;
    // A stored movement stands in for the rule's own payment on that day (the
    // user edited that one charge): the movement is drawn, the rule row is not.
    if (drawn.has(ownDate) || isRecurringDateSkipped(rec, ownDate)) {
      claimedIds.add(rec.id);
      return;
    }
    // The same test `recurringOwnRowCharge` applies: has the schedule charged
    // on or before the row's own day? A zero-value charge counts here too, as
    // it does in the table. That row stays visible because it has no charge
    // row to stand in for it.
    const lastPast = ownDate < todayIso ? ownDate : todayIso;
    if (recurringOccurrences(rec, from, lastPast).length > 0) uncountedIds.add(rec.id);
  });

  charges.sort((a, b) => a.date.localeCompare(b.date) || a.record.title.localeCompare(b.record.title));
  return { charges, claimedIds, uncountedIds };
}

/**
 * What a stored record adds to its month in the ledger once the past charges
 * are drawn: nothing for a rule row that a charge before it already covers,
 * its own settled / expected split otherwise. A claimed row is not drawn at
 * all, so callers skip `claimedIds` before asking.
 */
export function ledgerRecordSplit(
  rec: FinancialRecord,
  ledger: Pick<PastRecurringLedger, "uncountedIds">
): { real: number; estimated: number } {
  return ledger.uncountedIds.has(rec.id) ? { real: 0, estimated: 0 } : splitRecordAmounts(rec);
}
