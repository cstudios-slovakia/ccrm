/**
 * Identity of a payroll record (`employee_salaries`): one record per employee and period.
 *
 * The period key is always built from the year and the period number: `YYYY-MM` for a month,
 * `YYYY-Www` for a week. The server's `UNIQUE (employee_id, period_key)` relies on it, and so do the
 * Salaries matrix lookup, the MCP tools, the demo seed and the time-entry lock. A key without a year
 * (the old `M05` the profile drawer wrote) made May of two years collide on that unique key.
 * The PHP mirror is `ccrm_salary_period_key()` in `public/api/schema.php`.
 *
 * A payroll month is closed once it is first paid in full (`closedAt`, stamped by the server). The
 * time-entry lock reads that stamp, not the live status, so a later payslip edit cannot reopen it.
 */

import type { EmployeeSalary } from "../types";

const CANONICAL_KEY = /^\d{4}-(\d{2}|W\d{2})$/;

/** True for a key that carries its year: `2026-05` or `2026-W19`. */
export function isCanonicalSalaryPeriodKey(key: string | null | undefined): boolean {
  return typeof key === "string" && CANONICAL_KEY.test(key);
}

/** `YYYY-MM` for a month, `YYYY-Www` for a week. */
export function salaryPeriodKey(year: number, periodNumber: number, periodType: "monthly" | "weekly" = "monthly"): string {
  const nn = String(Math.trunc(periodNumber)).padStart(2, "0");
  return periodType === "weekly" ? `${year}-W${nn}` : `${year}-${nn}`;
}

/**
 * The key a stored record should have. A canonical key is kept as it is; anything else (`M05`) is
 * rebuilt from the record's year and period number, which are the facts.
 */
export function canonicalSalaryPeriodKey(
  record: Pick<EmployeeSalary, "periodKey" | "year" | "periodNumber"> & { periodType?: EmployeeSalary["periodType"] }
): string {
  if (isCanonicalSalaryPeriodKey(record.periodKey)) return record.periodKey;
  return salaryPeriodKey(Number(record.year), Number(record.periodNumber), record.periodType === "weekly" ? "weekly" : "monthly");
}

/**
 * The other record that already holds this employee's period, if any. Saving a second record for the
 * same period would collide with it on the server's unique key.
 */
export function salaryRecordForPeriod(
  salaries: readonly EmployeeSalary[] | null | undefined,
  employeeId: string,
  periodKey: string,
  exceptId?: string | null
): EmployeeSalary | undefined {
  return (salaries ?? []).find(
    (s) => s.employeeId === employeeId && s.id !== exceptId && canonicalSalaryPeriodKey(s) === periodKey
  );
}

/**
 * Whether the payroll month is closed for the time-entry lock. `closedAt` is the recorded fact; a
 * record from a server that does not send it yet (undefined) falls back to the live status.
 */
export function isPayrollPeriodClosed(record: { status?: string | null; closedAt?: string | null }): boolean {
  if (record.closedAt === undefined) return record.status === "paid";
  return record.closedAt !== null && record.closedAt !== "";
}
