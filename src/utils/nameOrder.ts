/**
 * Display-only order of a person's given name and surname, by the viewer's app language.
 *
 * Hungarian writes the surname first ("Kovács János"); every other supported language writes the given
 * name first ("Michal Kováč"). Nothing here changes stored data: a name kept in one field is shown as it
 * was typed, and a name stored as "first last" composed from its two parts (a lead's contact person, an
 * employee) is only turned around on screen. Each user sees their own language's order.
 */

let surnameFirst = false;
let employeeParts = new Map<string, { first: string; last: string }>();

/** Set from the language on screen (App, every render). */
export function setNameOrderLanguage(lang?: string | null): void {
  surnameFirst = isSurnameFirstLanguage(lang);
}

export function isSurnameFirstLanguage(lang?: string | null): boolean {
  return (lang ?? "").trim().toLowerCase() === "hu";
}

export function isSurnameFirst(): boolean {
  return surnameFirst;
}

const squash = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * The name to show for a stored full name and its two parts. When the stored name is exactly the parts
 * in either order (or empty), it is shown in the viewer's order; anything typed differently, or a name
 * without both parts, is shown as stored.
 */
export function displayPersonName(
  stored: string | null | undefined,
  first: string | null | undefined,
  last: string | null | undefined,
  surnameFirstOrder = surnameFirst
): string {
  const name = squash(stored);
  const a = squash(first);
  const b = squash(last);
  if (!a || !b) return name || a || b;
  const given = `${a} ${b}`;
  const surname = `${b} ${a}`;
  if (name && name !== given && name !== surname) return name;
  return surnameFirstOrder ? surname : given;
}

/** A lead's / client's contact person on screen. */
export function displayContactPerson(
  lead: { contactPerson?: string | null; contactFirstName?: string | null; contactLastName?: string | null } | null | undefined
): string {
  if (!lead) return "";
  return displayPersonName(lead.contactPerson, lead.contactFirstName, lead.contactLastName);
}

/**
 * Remembers the employees whose stored name is composed from their two parts, so a bare employee name
 * (a project manager, a task owner, a team member: records point at employees by name) can be shown in
 * the viewer's order too. Called from App with the employee list.
 */
export function setNameOrderEmployees(
  employees: ReadonlyArray<{ name?: string | null; firstName?: string | null; lastName?: string | null }> | null | undefined
): void {
  const next = new Map<string, { first: string; last: string }>();
  for (const e of employees ?? []) {
    const name = squash(e.name);
    const first = squash(e.firstName);
    const last = squash(e.lastName);
    if (name && first && last && (name === `${first} ${last}` || name === `${last} ${first}`)) next.set(name, { first, last });
  }
  employeeParts = next;
}

/** An employee's (or a user's) name on screen: turned around only when it is an employee's composed name. */
export function displayEmployeeName(name: string | null | undefined, surnameFirstOrder = surnameFirst): string {
  const parts = employeeParts.get(squash(name));
  if (!parts) return name ?? "";
  return surnameFirstOrder ? `${parts.last} ${parts.first}` : `${parts.first} ${parts.last}`;
}
