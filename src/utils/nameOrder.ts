/**
 * The order of a person's given name and surname, by the system language (Settings → language).
 *
 * Hungarian writes the surname first ("Kovács János"); every other supported language writes the given
 * name first ("Michal Kováč"). Contact names of leads and clients, employee names and agency workers are
 * composed from their two parts and stored as one string (search and documents read it), so the order is
 * one company-wide rule, not each viewer's own language. Mirrors ccrm_contact_surname_first() /
 * ccrm_join_name_parts() / ccrm_split_person_name_ordered() / ccrm_compose_keyed_person_name() in
 * public/api/contact_name.php.
 *
 * `employees.name` is the key other records point at (task owners, project managers and time tracking
 * match it by name) and nothing renames those references. A stored employee name is therefore never
 * rewritten when the language changes: composeKeyedPersonName() keeps the order a name was written in,
 * and only a NEW record gets the system's order.
 */

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
 * Splits "Michal Kováč" / "Ing. Michal Kováč" into given name and surname; titles stay with the given
 * name. Null when a guess would be wrong (one word, a comma suffix, a trailing title): a nickname or an
 * odd name is completed by a person, never invented. Mirrors ccrm_split_person_name() in
 * public/api/employee_name.php.
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

/**
 * The full name of a person record whose name other records point at (an employee). A new record gets
 * the system's order. A stored one keeps its name while its two parts are unchanged (in either order),
 * and when a part is edited the name is rewritten in the order it was written in before, so changing
 * the company language never renames anybody by itself. `previous` is null for a new record; when the
 * stored name cannot be matched to the stored parts either, the system's order is used.
 * Mirrors ccrm_compose_keyed_person_name() in public/api/contact_name.php.
 */
export function composeKeyedPersonName(
  first: string,
  last: string,
  previous?: { name?: string | null; firstName?: string | null; lastName?: string | null } | null,
  surnameFirstOrder = surnameFirst
): string {
  const prevName = (previous?.name ?? "").trim();
  if (!prevName) return joinNameParts(first, last, surnameFirstOrder);
  const given = joinNameParts(first, last, false);
  const surname = joinNameParts(first, last, true);
  if (prevName === given || prevName === surname) return prevName;
  const prevGiven = joinNameParts(previous?.firstName ?? "", previous?.lastName ?? "", false);
  const prevSurname = joinNameParts(previous?.firstName ?? "", previous?.lastName ?? "", true);
  if (prevGiven !== prevSurname) {
    if (prevName === prevSurname) return surname;
    if (prevName === prevGiven) return given;
  }
  return joinNameParts(first, last, surnameFirstOrder);
}
