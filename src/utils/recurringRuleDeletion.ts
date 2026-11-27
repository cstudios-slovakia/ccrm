/**
 * Recurring rules: saving each payment when its day arrives.
 *
 * A rule is ONE stored record. Its payments used to be derived from the
 * schedule every time they were read, so a past payment existed nowhere in the
 * database — delete the rule, or change its schedule, and the history changed or
 * vanished with it. Now every charge on or before today is written down as a
 * movement of its own (`materializeDueCharges`); only the future stays
 * calculated (`futureMovements.ts`).
 *
 * The storing reuses the stand-in machinery edited single charges already use
 * (see `FinancialRecord.recurringSourceId`): the movement carries the day, and
 * the rule lists the day in `recurringSkippedDates` so the schedule no longer
 * draws it. Every reader (ledger, overview table, trend, forecast) therefore
 * keeps working unchanged.
 *
 * The movement id is derived from rule and day, so two sessions that both
 * notice a payment is due write the SAME row, and sync merges them instead of
 * duplicating it (the same trick `invoiceFinanceBridge` uses).
 *
 * A payment the user deletes stays deleted: its day remains in the rule's
 * skipped list, so it is not written again.
 */

import type { FinancialRecord } from "../types";
import { recurringOwnRowCharge } from "./financialOverviewTable.ts";
import { recurringCharges, skipRecurringDate } from "./recurringExpenses.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (value: unknown): value is string => typeof value === "string" && ISO_DATE.test(value);

export const dueChargeId = (ruleId: string, date: string) => `fr-rec-${ruleId}-${date}`;

/** The (rule, day) pair a stored movement stands in for, as one lookup key. */
const pairKey = (ruleId: string, date: string) => `pair:${ruleId}|${date}`;

/**
 * Everything that marks a charge as already stored: every record id, plus the
 * (rule, day) pair of every movement standing in for a rule's charge.
 *
 * The id alone is not enough. A charge edited by hand (`handleSaveOccurrence`)
 * gets a random id, and a rule saved by older code lost its skipped list, so
 * the schedule draws that day again. Matching on the pair recognises the
 * hand-edited movement and never writes a second payment for its day.
 */
export function storedChargeKeys(records: readonly FinancialRecord[]): Set<string> {
  const keys = new Set<string>();
  for (const r of records) {
    keys.add(r.id);
    if (r.recurringSourceId && isIsoDate(r.recurringOccurrenceDate)) {
      keys.add(pairKey(r.recurringSourceId, r.recurringOccurrenceDate));
    }
  }
  return keys;
}

const isStored = (stored: ReadonlySet<string>, ruleId: string, date: string) =>
  stored.has(dueChargeId(ruleId, date)) || stored.has(pairKey(ruleId, date));

/** The first day a rule can have charged: its start date, else its own row's day. */
const firstDay = (rule: FinancialRecord): string | null => {
  const from = isIsoDate(rule.recurringStartDate) ? rule.recurringStartDate : rule.issueDate;
  return isIsoDate(from) ? from : null;
};

/**
 * Every charge of the rule on or before today that the schedule still draws.
 * `recurringCharges` starts after `recurringMaterializedThrough`, so a day the
 * materializer has already passed is never drawn again.
 */
const dueCharges = (rule: FinancialRecord, todayIso: string) => {
  const from = firstDay(rule);
  if (!rule.isRecurring || !from || !isIsoDate(todayIso) || from > todayIso) return [];
  return recurringCharges(rule, from, todayIso).filter(({ amount }) => amount > 0);
};

/**
 * Whether the run must move the rule's watermark up to today. Only a rule that
 * has started: before its first day there is nothing to remember, and a rule
 * whose start is later moved into the past then writes that history as a new
 * rule does.
 */
const watermarkBehind = (rule: FinancialRecord, todayIso: string) => {
  const from = firstDay(rule);
  if (!rule.isRecurring || !from || !isIsoDate(todayIso) || from > todayIso) return false;
  const through = rule.recurringMaterializedThrough;
  return !isIsoDate(through) || through < todayIso;
};

/**
 * A payment that lives only on the rule's own row: an older rule entered as
 * "paid on 18 December, charges on the 1st" (see `recurringOwnRowCharge`). It
 * is money actually paid, so it is stored like any due charge, or deleting the
 * rule would delete it. Only money paid on or before today counts; a row that
 * merely plans a charge is not a payment.
 */
const ownRowPayment = (rule: FinancialRecord, todayIso: string) => {
  if (!rule.isRecurring || !isIsoDate(todayIso)) return null;
  const own = recurringOwnRowCharge(rule);
  if (!own || own.real <= 0 || own.date > todayIso) return null;
  return own;
};

/**
 * One settled movement per due charge that is not stored yet. A charge that has
 * come due is settled money (see `pastRecurringCharges.ts`); its amount is the
 * price in force that day, and the user can still correct it like any single
 * payment.
 *
 * A payment recorded on the rule's own row (`ownRowPayment`) comes first, kept
 * as it was entered: its own status, amounts and dates.
 *
 * `stored` is `storedChargeKeys(records)`. A plain set of ids still works, but
 * then a hand-edited movement with a random id is not recognised.
 */
export function dueChargeMovements(
  rule: FinancialRecord,
  todayIso: string,
  nowIso: string,
  stored: ReadonlySet<string> = new Set()
): FinancialRecord[] {
  const asMovement = (date: string): FinancialRecord => ({
    ...rule,
    id: dueChargeId(rule.id, date),
    isRecurring: false,
    recurringFrequency: null,
    recurringConfig: null,
    recurringStartDate: null,
    recurringEndDate: null,
    recurringPlannedEndDate: null,
    recurringAmountHistory: null,
    recurringSkippedDates: null,
    recurringMaterializedThrough: null,
    recurringSourceId: rule.id,
    recurringOccurrenceDate: date,
    // The rule's files stay with the rule's own row, not on every payment.
    attachments: [],
    createdAt: nowIso,
    updatedAt: nowIso
  });

  const own = ownRowPayment(rule, todayIso);
  const ownMovement = own && !isStored(stored, rule.id, own.date) ? [asMovement(own.date)] : [];

  const charges = dueCharges(rule, todayIso)
    .filter(({ date }) => !isStored(stored, rule.id, date))
    .map(({ date, amount }) => ({
      ...asMovement(date),
      status: "paid" as const,
      amountPlanned: amount,
      amountReal: amount,
      issueDate: date,
      dueDate: null,
      paidDate: date
    }));
  return [...ownMovement, ...charges];
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((d, i) => d === b[i]);

/**
 * Writes down every payment that has come due. Returns `records` itself when
 * there is nothing to write, so callers can tell "no change" by identity.
 *
 * A due day whose movement is already stored but which the rule still draws
 * (another session wrote the movement, a charge was edited by hand under a
 * random id, or a rule edit lost its skipped list) is only added to the
 * skipped list, otherwise the day would count twice. For the same reason the
 * day of every movement standing in for a charge goes back on its rule's
 * skipped list, future days included.
 *
 * A payment held only on the rule's own row is stored too, and the row then
 * becomes a plain template: planned, dated on its first payment.
 *
 * Every started rule's `recurringMaterializedThrough` moves up to today, also
 * on a day nothing is due and while the rule is paused. Days up to it are never
 * drawn again, so a schedule edit or a resume cannot write past payments
 * (finance audit #1, #2). This touches each rule once a day.
 */
export function materializeDueCharges(records: FinancialRecord[], todayIso: string, nowIso: string): FinancialRecord[] {
  const stored = storedChargeKeys(records);
  const created: FinancialRecord[] = [];
  const skipsByRule = new Map<string, Set<string>>();
  const ownRowStored = new Set<string>();
  const advance = new Set(records.filter((r) => watermarkBehind(r, todayIso)).map((r) => r.id));
  const addSkip = (ruleId: string, day: string) => {
    const days = skipsByRule.get(ruleId) ?? new Set<string>();
    days.add(day);
    skipsByRule.set(ruleId, days);
  };

  const ruleIds = new Set(records.filter((r) => r.isRecurring).map((r) => r.id));
  for (const r of records) {
    if (r.recurringSourceId && ruleIds.has(r.recurringSourceId) && isIsoDate(r.recurringOccurrenceDate)) {
      addSkip(r.recurringSourceId, r.recurringOccurrenceDate);
    }
  }

  for (const rule of records) {
    if (!rule.isRecurring) continue;
    const own = ownRowPayment(rule, todayIso);
    if (own) {
      addSkip(rule.id, own.date);
      ownRowStored.add(rule.id);
    }
    for (const { date } of dueCharges(rule, todayIso)) addSkip(rule.id, date);
    created.push(...dueChargeMovements(rule, todayIso, nowIso, stored));
  }

  let changed = created.length > 0;
  const updated = records.map((r) => {
    const days = skipsByRule.get(r.id);
    if (!days && !ownRowStored.has(r.id) && !advance.has(r.id)) return r;
    let next = r;
    if (advance.has(r.id)) next = { ...next, recurringMaterializedThrough: todayIso };
    if (days) {
      const before = (r.recurringSkippedDates || []).filter(isIsoDate);
      const skipped = [...days].reduce((list, day) => skipRecurringDate({ recurringSkippedDates: list }, day), before);
      if (!sameList(skipped, r.recurringSkippedDates || [])) next = { ...next, recurringSkippedDates: skipped };
    }
    if (ownRowStored.has(r.id)) {
      // The payment now lives in its own movement; the row only describes the rule.
      next = {
        ...next,
        status: "planned",
        issueDate: isIsoDate(r.recurringStartDate) ? r.recurringStartDate : r.issueDate,
        dueDate: null,
        paidDate: null
      };
    }
    if (next !== r) changed = true;
    return next;
  });
  return changed ? [...created, ...updated] : records;
}

/** A payment that outlives its deleted rule as a plain movement. */
export const detachFromRule = (r: FinancialRecord): FinancialRecord => ({
  ...r,
  recurringSourceId: null,
  recurringOccurrenceDate: null
});
