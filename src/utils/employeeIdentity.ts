import type { Employee } from "../types";
import type { CompanyDetails } from "./companyRegistry";

/**
 * Who a staff record is: a person on the payroll, an outside company, or a payroll-only line
 * such as commission. Mirrors CCRM_EMPLOYEE_KINDS in public/api/employee_name.php.
 *
 * `Employee.name` stays the display name every other module reads. A person's is
 * "first last"; a contractor's or ledger item's is the single name field. A contractor is any
 * external supplier, a company or a sole trader (živnostník): it keeps a contact person's name
 * beside the trade name, and the IČO / DIČ / IČ DPH the business register can fill in.
 */
export type EmployeeKind = "employee" | "contractor" | "ledger";

export const EMPLOYEE_KINDS: EmployeeKind[] = ["employee", "contractor", "ledger"];

export interface EmployeeIdentity {
  kind: EmployeeKind;
  /** A person's name; for a contractor the contact person (a sole trader is their own). */
  firstName: string;
  lastName: string;
  /** Company / trade / item name; only used when kind is not "employee". */
  name: string;
  /** Register numbers of an external supplier (company or sole trader); empty for the other kinds. */
  companyId: string;
  taxId: string;
  vatId: string;
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
    companyId: kind === "contractor" ? emp?.companyId ?? "" : "",
    taxId: kind === "contractor" ? emp?.taxId ?? "" : "",
    vatId: kind === "contractor" ? emp?.vatId ?? "" : "",
    position: emp?.position ?? "",
    department: emp?.department ?? "",
  };
}

/** A contractor is an external supplier: a company or a sole trader (živnostník). */
export const isSupplier = (kind: EmployeeKind): boolean => kind === "contractor";

/** Kinds that carry a person's name: an employee, or the contact person of an external supplier. */
export const hasPersonName = (kind: EmployeeKind): boolean => kind !== "ledger";

/** The display name for an identity, the same rule the server applies when it saves. */
export function composeName(i: Pick<EmployeeIdentity, "kind" | "firstName" | "lastName" | "name">): string {
  if (i.kind === "employee") return `${i.firstName.trim()} ${i.lastName.trim()}`.trim();
  return i.name.trim();
}

/** True when the identity is complete: first and last name for a person, a name for the rest. */
export function identityComplete(i: EmployeeIdentity): boolean {
  return i.kind === "employee" ? !!i.firstName.trim() && !!i.lastName.trim() : !!i.name.trim();
}

/** The fields to merge into an Employee when saving. Empty position / department / register numbers are cleared. */
export function identityFields(
  i: EmployeeIdentity
): Pick<Employee, "name" | "firstName" | "lastName" | "kind" | "companyId" | "taxId" | "vatId" | "position" | "department"> {
  const named = hasPersonName(i.kind);
  const supplier = isSupplier(i.kind);
  return {
    name: composeName(i),
    firstName: named ? i.firstName.trim() || null : null,
    lastName: named ? i.lastName.trim() || null : null,
    kind: i.kind,
    companyId: supplier ? i.companyId.trim() || null : null,
    taxId: supplier ? i.taxId.trim() || null : null,
    vatId: supplier ? i.vatId.trim() || null : null,
    position: i.position.trim() || null,
    department: i.department.trim() || null,
  };
}

/**
 * Splits a register's contact person ("Ing. Michal Kováč") into first and last name; titles stay
 * with the first name. Null when a guess would be wrong (one word, a comma suffix, a trailing
 * title). Mirrors ccrm_split_person_name() in public/api/employee_name.php.
 */
export function splitPersonName(name: string): { firstName: string; lastName: string } | null {
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean || clean.includes(",")) return null;
  const parts = clean.split(" ");
  if (parts.length < 2) return null;
  const lastName = parts[parts.length - 1];
  if (lastName.endsWith(".")) return null;
  const given = parts.slice(0, -1);
  if (!given.some((p) => !p.endsWith("."))) return null;
  return { firstName: given.join(" "), lastName };
}

/**
 * What a register lookup fills into an external supplier: the trade name and the three numbers
 * always (when the register has them), the contact person only while that is still empty, so a
 * lookup never overwrites a name somebody typed.
 */
export function identityFromCompany(
  current: EmployeeIdentity,
  details: Pick<CompanyDetails, "name" | "companyId" | "taxId" | "vatId" | "contactPerson">
): Partial<EmployeeIdentity> {
  const patch: Partial<EmployeeIdentity> = {
    name: details.name || current.name,
    companyId: details.companyId || current.companyId,
    taxId: details.taxId || current.taxId,
    vatId: details.vatId || current.vatId,
  };
  if (!current.firstName.trim() && !current.lastName.trim()) {
    const person = splitPersonName(details.contactPerson || "");
    if (person) Object.assign(patch, person);
  }
  return patch;
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
