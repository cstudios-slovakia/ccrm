/**
 * When a time entry is locked.
 *
 * Locked means a non-admin cannot edit or delete it. An admin can, and the server
 * writes an audit-log row for that override. Three independent reasons, first match:
 * the entry is older than `lockAfterDays`, its month is a paid payroll month, or it
 * was approved. A null `lockAfterDays` turns the age rule off. A running timer is
 * never locked by age (it is still today's work).
 *
 * No fetching. `paidPayrollMonths` is `YYYY-MM` (and weekly `YYYY-Www` keys the
 * caller already resolved). `isAdmin` is the viewer's bypass, not a property of
 * the entry — `lockReason` still names the lock so the drawer can say why.
 */

export interface LockableEntry {
  /** YYYY-MM-DD, company timezone. */
  entryDate: string;
  approvalStatus?: string | null;
  running?: boolean;
}

export interface LockSettings {
  /** Null disables the age lock. An entry is locked when its age in days is greater than this. */
  lockAfterDays: number | null;
  /** Months (YYYY-MM) or payroll period keys whose salary was paid for this entry's owner. */
  paidPayrollMonths?: readonly string[];
  /** Admin may edit a locked entry. The entry is still locked for everyone else. */
  isAdmin?: boolean;
}

export type LockReasonCode = "age" | "paid_payroll" | "approved";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Whole calendar days from `entryDate` to `nowIso`. Negative when the entry is in the future. */
export const entryAgeDays = (entryDate: string, nowIso: string): number | null => {
  const a = ISO_DATE.exec(entryDate);
  const b = ISO_DATE.exec(nowIso);
  if (!a || !b) return null;
  const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
  const ms = utc(Number(b[1]), Number(b[2]), Number(b[3])) - utc(Number(a[1]), Number(a[2]), Number(a[3]));
  return Math.round(ms / 86_400_000);
};

/** `YYYY-MM` of an entry date, for the payroll-month check. */
export const entryMonthKey = (entryDate: string): string | null => {
  const m = ISO_DATE.exec(entryDate);
  return m ? `${m[1]}-${m[2]}` : null;
};

const approved = (status: string | null | undefined): boolean =>
  typeof status === "string" && status.trim().toLowerCase() === "approved";

const inPaidPayroll = (entry: LockableEntry, settings: LockSettings): boolean => {
  const months = settings.paidPayrollMonths;
  if (!months || months.length === 0) return false;
  const month = entryMonthKey(entry.entryDate);
  if (!month) return false;
  return months.some((key) => key === month || key.startsWith(`${month}-`) || key.startsWith(`${month}W`));
};

/**
 * Why the entry is locked, or null when a non-admin may still edit it.
 * Ignores `isAdmin`: the reason is about the entry, the bypass is about the viewer.
 */
export const lockReason = (entry: LockableEntry, settings: LockSettings, nowIso: string): LockReasonCode | null => {
  if (!entry.running && settings.lockAfterDays !== null && settings.lockAfterDays !== undefined) {
    const age = entryAgeDays(entry.entryDate, nowIso);
    if (age !== null && age > settings.lockAfterDays) return "age";
  }
  if (inPaidPayroll(entry, settings)) return "paid_payroll";
  if (approved(entry.approvalStatus)) return "approved";
  return null;
};

/** True when this viewer must not edit the entry. Admins bypass every reason. */
export const isEntryLocked = (entry: LockableEntry, settings: LockSettings, nowIso: string): boolean => {
  if (settings.isAdmin) return false;
  return lockReason(entry, settings, nowIso) !== null;
};

/** A payroll row, as far as the lock needs to see it. `status === "paid"` is a lock. */
export interface PayrollPeriod {
  employeeId: string;
  periodKey: string;
  status: string;
}

export interface PayrollPerson {
  id: string;
  userId?: string | null;
}

/**
 * Paid period keys for one entry owner. Monthly keys are `YYYY-MM`; a weekly
 * key is passed through for `inPaidPayroll` to match. Pending and partially
 * paid months are not locks. `stampedMonths` are months the time-entry API
 * already flagged (`paidPayrollMonth`) when this client cannot see salaries.
 */
export const paidMonthsForOwner = (
  salaries: readonly PayrollPeriod[] | null | undefined,
  employees: readonly PayrollPerson[] | null | undefined,
  owner: { userId?: string | null; employeeId?: string | null },
  stampedMonths?: readonly string[],
): string[] => {
  const employeeId =
    owner.employeeId ||
    (owner.userId ? employees?.find((person) => person.userId === owner.userId)?.id : null) ||
    null;
  const keys: string[] = [];
  const add = (key: string | null | undefined) => {
    if (!key || keys.includes(key)) return;
    keys.push(key);
  };
  if (employeeId && salaries) {
    for (const row of salaries) {
      if (row.employeeId === employeeId && row.status === "paid") add(row.periodKey);
    }
  }
  for (const month of stampedMonths ?? []) add(month);
  return keys;
};
