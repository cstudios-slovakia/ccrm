import { splitPersonName } from "./employeeIdentity.ts";

/**
 * The contact person of a lead or client, typed as first and last name (docs/NEWSLETTER.md C18).
 *
 * `Lead.contactPerson` stays the full name everything else reads (search, offers, orders, tickets).
 * The two parts feed the newsletter's `{{first_name}}`. The rule is the same as
 * ccrm_compose_contact_name() in public/api/contact_name.php: when either part is filled,
 * contactPerson = first + " " + last (given name first, no order by language); when both are empty
 * the current full name is kept.
 */
export interface ContactNameParts {
  firstName: string;
  lastName: string;
}

export interface ContactNameRecord {
  contactPerson?: string;
  contactFirstName?: string;
  contactLastName?: string;
}

/** The full contact name for a pair of parts; `fallback` (the current full name) when both are empty. */
export function composeContactName(first: string, last: string, fallback = ""): string {
  const full = `${first.trim()} ${last.trim()}`.trim();
  return full || fallback.trim();
}

/**
 * What the form shows for a record. Stored parts win. A record saved before the parts existed is split
 * like the server's one-time backfill does; a name that cannot be split safely (one word, a comma, a
 * trailing title) is shown whole in the first field, so nothing vanishes and a person can complete it.
 */
export function contactNameFieldsOf(record?: ContactNameRecord | null): ContactNameParts {
  const first = record?.contactFirstName?.trim() ?? "";
  const last = record?.contactLastName?.trim() ?? "";
  if (first || last) return { firstName: first, lastName: last };
  const person = (record?.contactPerson ?? "").trim();
  if (!person) return { firstName: "", lastName: "" };
  return splitPersonName(person) ?? { firstName: person, lastName: "" };
}

/** The first and last name a register lookup's contact person is split into (null when unsure). */
export function contactNameFromRegistry(person?: string): ContactNameParts | null {
  return splitPersonName(person ?? "");
}

/**
 * The fields to merge into a record when its form is saved. Parts are always sent (an empty string
 * clears one), because a missing key means "no opinion" to the server. Untouched fields return {}: an
 * old record whose name could not be split is not rewritten just because the form was opened.
 */
export function contactNamePatch(
  record: ContactNameRecord | null | undefined,
  fields: ContactNameParts,
): ContactNameRecord {
  const seeded = contactNameFieldsOf(record);
  if (fields.firstName.trim() === seeded.firstName && fields.lastName.trim() === seeded.lastName) return {};
  return {
    contactPerson: composeContactName(fields.firstName, fields.lastName),
    contactFirstName: fields.firstName.trim(),
    contactLastName: fields.lastName.trim(),
  };
}

/** Parts for a record that was given only a full name (a guest order): both empty when unsure. */
export function contactPartsOfPerson(person?: string | null): { contactFirstName: string; contactLastName: string } {
  const parts = splitPersonName(person ?? "");
  return { contactFirstName: parts?.firstName ?? "", contactLastName: parts?.lastName ?? "" };
}
