/**
 * The order of a contact person's given name and surname, by the system language (Settings → language).
 *
 * Hungarian writes the surname first ("Kovács János"); every other supported language writes the given
 * name first ("Michal Kováč"). Contact names of leads and clients are composed from their two parts and
 * stored as one string (`contactPerson`, search and documents read it), so the order is one company-wide
 * rule, not each viewer's own language. Mirrors ccrm_contact_surname_first() / ccrm_join_name_parts() /
 * ccrm_split_person_name_ordered() in public/api/contact_name.php.
 *
 * Employee names are not affected: `employees.name` is the key other records point at.
 */
import { splitPersonName } from "./employeeIdentity.ts";

let surnameFirst = false;

/** Set once the system language is known (App). */
export function setNameOrderLanguage(lang?: string | null): void {
  surnameFirst = isSurnameFirstLanguage(lang);
}

export function isSurnameFirstLanguage(lang?: string | null): boolean {
  return (lang ?? "").trim().toLowerCase() === "hu";
}

export function isSurnameFirst(): boolean {
  return surnameFirst;
}

/** The full name of two parts in the system's order. */
export function joinNameParts(first: string, last: string, surnameFirstOrder = surnameFirst): string {
  const a = first.trim();
  const b = last.trim();
  return (surnameFirstOrder ? `${b} ${a}` : `${a} ${b}`).trim();
}

/**
 * Splits a full name into given name and surname in the system's order; null when a guess would be wrong.
 * Given-name-first is splitPersonName(). Surname-first takes leading titles plus the first word as the
 * surname ("Dr. Kovács János" → surname "Dr. Kovács", given "János"), with the same refusals: a comma,
 * a single word, a trailing title.
 */
export function splitNameOrdered(name: string, surnameFirstOrder = surnameFirst): { firstName: string; lastName: string } | null {
  if (!surnameFirstOrder) return splitPersonName(name);
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean || clean.includes(",")) return null;
  const parts = clean.split(" ");
  if (parts.length < 2 || parts[parts.length - 1].endsWith(".")) return null;
  const surnameEnd = parts.findIndex((p) => !p.endsWith("."));
  if (surnameEnd < 0 || surnameEnd >= parts.length - 1) return null;
  return { lastName: parts.slice(0, surnameEnd + 1).join(" "), firstName: parts.slice(surnameEnd + 1).join(" ") };
}
