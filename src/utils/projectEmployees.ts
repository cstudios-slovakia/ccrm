import type { Employee } from "../types";
import { employeeKind } from "./employeeIdentity";

/**
 * The people a project's "Employees" can be: Employees-module records of type Employee (not an external
 * contractor or a payroll-only line), by name, the same kind of id `Project.employees` stores. Used by the
 * project detail's picker and the projects list's Employees filter.
 */
export function projectEmployeeCandidates(employees: ReadonlyArray<Employee> | null | undefined): Employee[] {
  const seen = new Set<string>();
  return (employees ?? []).filter((e) => {
    const name = (e.name || "").trim();
    if (!name || employeeKind(e) !== "employee" || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}
