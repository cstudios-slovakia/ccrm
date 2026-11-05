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
import { recurringCharges, skipRecurringDate } from "./recurringExpenses.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (value: unknown): value is string => typeof value === "string" && ISO_DATE.test(value);

export const dueChargeId = (ruleId: string, date: string) => `fr-rec-${ruleId}-${date}`;

/** The first day a rule can have charged: its start date, else its own row's day. */
const firstDay = (rule: FinancialRecord): string | null => {
  const from = isIsoDate(rule.recurringStartDate) ? rule.recurringStartDate : rule.issueDate;
  return isIsoDate(from) ? from : null;
};

/** Every charge of the rule on or before today that the schedule still draws. */
const dueCharges = (rule: FinancialRecord, todayIso: string) => {
  const from = firstDay(rule);
  if (!rule.isRecurring || !from || !isIsoDate(todayIso) || from > todayIso) return [];
  return recurringCharges(rule, from, todayIso).filter(({ amount }) => amount > 0);
};

/**
 * One settled movement per due charge that is not stored yet. A charge that has
 * come due is settled money (see `pastRecurringCharges.ts`); its amount is the
 * price in force that day, and the user can still correct it like any single
 * payment.
 */
export function dueChargeMovements(
  rule: FinancialRecord,
  todayIso: string,
  nowIso: string,
  storedIds: ReadonlySet<string> = new Set()
): FinancialRecord[] {
  return dueCharges(rule, todayIso)
    .filter(({ date }) => !storedIds.has(dueChargeId(rule.id, date)))
    .map(({ date, amount }) => ({
      ...rule,
      id: dueChargeId(rule.id, date),
      status: "paid" as const,
      amountPlanned: amount,
      amountReal: amount,
      issueDate: date,
      dueDate: null,
      paidDate: date,
      isRecurring: false,
      recurringFrequency: null,
      recurringConfig: null,
      recurringStartDate: null,
      recurringEndDate: null,
      recurringPlannedEndDate: null,
      recurringAmountHistory: null,
      recurringSkippedDates: null,
      recurringSourceId: rule.id,
      recurringOccurrenceDate: date,
      // The rule's files stay with the rule's own row, not on every payment.
      attachments: [],
      createdAt: nowIso,
      updatedAt: nowIso
    }));
}

/**
 * Writes down every payment that has come due. Returns `records` itself when
 * there is nothing to write, so callers can tell "no change" by identity.
 *
 * A due day whose movement is already stored but which the rule still draws
 * (another session wrote the movement, or a rule edit lost its skipped list) is
 * only added to the skipped list — otherwise the day would count twice.
 */
export function materializeDueCharges(records: FinancialRecord[], todayIso: string, nowIso: string): FinancialRecord[] {
  const storedIds = new Set(records.map((r) => r.id));
  const created: FinancialRecord[] = [];
  const skipsByRule = new Map<string, string[]>();

  for (const rule of records) {
    const due = dueCharges(rule, todayIso);
    if (due.length === 0) continue;
    created.push(...dueChargeMovements(rule, todayIso, nowIso, storedIds));
    skipsByRule.set(rule.id, due.map((c) => c.date));
  }
  if (skipsByRule.size === 0) return records;

  const updated = records.map((r) => {
    const days = skipsByRule.get(r.id);
    if (!days) return r;
    const skipped = days.reduce((list, day) => skipRecurringDate({ recurringSkippedDates: list }, day), r.recurringSkippedDates || []);
    return { ...r, recurringSkippedDates: skipped };
  });
  return [...created, ...updated];
}

/** A payment that outlives its deleted rule as a plain movement. */
export const detachFromRule = (r: FinancialRecord): FinancialRecord => ({
  ...r,
  recurringSourceId: null,
  recurringOccurrenceDate: null
});
