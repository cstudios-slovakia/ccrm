/**
 * Payslip figures on an employee's monthly payroll record (Evidencia výplat).
 *
 * Hrubá mzda = Základná mzda + Iné (the record's items: the `base` item plus any number of custom
 * rows). Cena práce and Na výplatu are typed in by hand from the payslip each month; nothing derives
 * them from the gross salary. Vyplatené is one amount measured against Cena práce, because that is
 * what the employee costs the company, whoever the money goes to (employee, insurers, tax office).
 * Contractors and ledger lines have no payslip, so none of this applies to them.
 */

import type { Employee, EmployeeSalary } from "../types";
import { employeeKind } from "./employeeIdentity.ts";

/** Only a person on the payroll has a payslip; an unknown or missing kind counts as one. */
export function hasPayslip(person: Pick<Employee, "kind"> | null | undefined): boolean {
  return employeeKind(person ?? {}) === "employee";
}

function difference(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) * 100) / 100;
}

/** Odvody zamestnávateľa = Cena práce − Hrubá mzda; null until Cena práce is filled in. */
export function employerLevies(laborCost: number | null | undefined, gross: number | null | undefined): number | null {
  return difference(laborCost, gross);
}

/** Odvody a daň zamestnanca = Hrubá mzda − Na výplatu; null until Na výplatu is filled in. */
export function employeeDeductions(gross: number | null | undefined, netPay: number | null | undefined): number | null {
  return difference(gross, netPay);
}

/**
 * What a payroll record is paid against: Cena práce once it is filled in, otherwise the gross
 * (which is all a contractor's record, or an employee's before the payslip arrives, has).
 */
export function salaryDue(record: Pick<EmployeeSalary, "totalSalary" | "laborCost"> | null | undefined): number {
  if (!record) return 0;
  const { laborCost, totalSalary } = record;
  return laborCost != null && Number.isFinite(laborCost) ? laborCost : Number(totalSalary) || 0;
}

export type SalaryStatus = "pending" | "partially_paid" | "paid";

/** Paid in full once Vyplatené reaches what is due; anything above zero short of it is partial. */
export function salaryStatus(due: number, paid: number): SalaryStatus {
  if (due > 0 && paid >= due) return "paid";
  if (paid > 0) return "partially_paid";
  return "pending";
}

/** Text from a number input → stored value: empty means "not filled in", never 0. */
export function parsePayslipAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
