import type { Employee } from "../types";

/**
 * Who a staff record is: a person on the payroll, an outside company, or a payroll-only line
 * such as commission. Mirrors CCRM_EMPLOYEE_KINDS in public/api/employee_name.php.
 *
 * `Employee.name` stays the display name every other module reads. A person's is
 * "first last"; a contractor's or ledger item's is the single name field.
 */
export type EmployeeKind = "employee" | "contractor" | "ledger";

export const EMPLOYEE_KINDS: EmployeeKind[] = ["employee", "contractor", "ledger"];

export interface EmployeeIdentity {
  kind: EmployeeKind;
  firstName: string;
  lastName: string;
  /** Company / item name; only used when kind is not "employee". */
  name: string;
  position: string;
  department: string;
}

export function employeeKind(emp: Pick<Employee, "kind">): EmployeeKind {
  return emp.kind && EMPLOYEE_KINDS.includes(emp.kind) ? emp.kind : "employee";
}

/**
 * A person saved before the name was split has only the display name. The edit form seeds from it so
 * the name does not vanish: "first last" is split on the last word, a single word (a nickname such as
 * "András") is the first name and the surname is left to fill in.
 */
function legacyPersonName(name: string | undefined): { firstName: string; lastName: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

export function identityOf(emp?: Employee | null): EmployeeIdentity {
  const kind = emp ? employeeKind(emp) : "employee";
  const legacy = emp && kind === "employee" && !emp.firstName?.trim() && !emp.lastName?.trim() ? legacyPersonName(emp.name) : null;
  return {
    kind,
    firstName: legacy?.firstName ?? emp?.firstName ?? "",
    lastName: legacy?.lastName ?? emp?.lastName ?? "",
    name: kind === "employee" ? "" : emp?.name ?? "",
    position: emp?.position ?? "",
    department: emp?.department ?? "",
  };
}

/** The display name for an identity, the same rule the server applies when it saves. */
export function composeName(i: Pick<EmployeeIdentity, "kind" | "firstName" | "lastName" | "name">): string {
  if (i.kind === "employee") return `${i.firstName.trim()} ${i.lastName.trim()}`.trim();
  return i.name.trim();
}

/** True when the identity is complete: first and last name for a person, a name for the rest. */
export function identityComplete(i: EmployeeIdentity): boolean {
  return i.kind === "employee" ? !!i.firstName.trim() && !!i.lastName.trim() : !!i.name.trim();
}

/** The fields to merge into an Employee when saving. Empty position / department are cleared. */
export function identityFields(i: EmployeeIdentity): Pick<Employee, "name" | "firstName" | "lastName" | "kind" | "position" | "department"> {
  const person = i.kind === "employee";
  return {
    name: composeName(i),
    firstName: person ? i.firstName.trim() : null,
    lastName: person ? i.lastName.trim() : null,
    kind: i.kind,
    position: i.position.trim() || null,
    department: i.department.trim() || null,
  };
}

/** A person whose record still lacks a surname (a nickname such as "Tomi"). */
export function needsFullName(emp: Employee): boolean {
  return employeeKind(emp) === "employee" && !(emp.firstName?.trim() && emp.lastName?.trim());
}

/** Suggested job titles and departments, offered next to the values already used in the roster. */
export const DEFAULT_POSITIONS: Record<"en" | "sk" | "hu", string[]> = {
  en: ["Developer", "Designer", "PPC specialist", "Account manager", "Telemarketing"],
  sk: ["Programátor", "Grafik", "PPC špecialista", "Account manažér", "Telemarketing"],
  hu: ["Programozó", "Grafikus", "PPC szakértő", "Account menedzser", "Telemarketing"],
};
export const DEFAULT_DEPARTMENTS: Record<"en" | "sk" | "hu", string[]> = {
  en: ["Development", "Marketing", "Management", "Sales"],
  sk: ["Vývoj", "Marketing", "Manažment", "Obchod"],
  hu: ["Fejlesztés", "Marketing", "Vezetés", "Értékesítés"],
};

/** Values already used in the roster first (most used first), then the defaults not yet present. */
export function fieldSuggestions(employees: Employee[], field: "position" | "department", defaults: string[]): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const e of employees) {
    const v = e[field]?.trim();
    if (!v) continue;
    const key = v.toLocaleLowerCase();
    const hit = counts.get(key);
    if (hit) hit.n += 1;
    else counts.set(key, { label: v, n: 1 });
  }
  const used = [...counts.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).map((c) => c.label);
  const seen = new Set(used.map((v) => v.toLocaleLowerCase()));
  return [...used, ...defaults.filter((d) => !seen.has(d.toLocaleLowerCase()))];
}
