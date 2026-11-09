import { splitPersonName } from "./employeeIdentity.ts";

/**
 * The contact person of a lead or client, typed as first and last name (docs/NEWSLETTER.md C18, B1.7).
 *
 * `Lead.contactPerson` stays the full name everything else reads (search, offers, orders, tickets).
 * The two parts feed the newsletter's `{{first_name}}`. The rule is the same as
 * ccrm_compose_contact_name() in public/api/contact_name.php: when either part is filled,
 * contactPerson = first + " " + last (given name first, no order by language); when both are empty
 * the current full name is kept.
 *
 * A record of type `person` is different: the parts are the person's OWN first and last name ("Name for
 * greetings"). `name` is never recomposed (client grouping depends on it) and `contactPerson` is left
 * as it is, normally empty.
 */
export interface ContactNameParts {
  firstName: string;
  lastName: string;
}

export interface ContactNameRecord {
  name?: string;
  clientType?: string;
  contactPerson?: string;
  contactFirstName?: string;
  contactLastName?: string;
}

/**
 * The full contact name for a pair of parts; `fallback` (the current full name) when both are empty.
 * A person record (`isPerson`) never gets one composed: the fallback is returned as it is.
 */
export function composeContactName(first: string, last: string, fallback = "", isPerson = false): string {
  if (isPerson) return fallback.trim();
  const full = `${first.trim()} ${last.trim()}`.trim();
  return full || fallback.trim();
}

const NONE: ContactNameParts = { firstName: "", lastName: "" };

/**
 * What the form shows for a record, as a business contact or (`asPerson`) as the person's own name, and
 * whether it is only a suggestion. Stored parts win. Otherwise: a business shows its old full name split
 * like the server's one-time backfill does (a name that cannot be split safely is shown whole in the
 * first field, so nothing vanishes); a person shows `name` split the same way, or nothing when unsure.
 * A suggestion is not saved unless the user edits it.
 *
 * The stored parts mean what the record's stored type says. Switching a business to a person drops them
 * when they are the old contact person's (they compose to `contactPerson`) and keeps any others;
 * switching a person to a business shows the old contact person instead of the person's own name.
 */
function seedOf(record: ContactNameRecord | null | undefined, asPerson: boolean): { parts: ContactNameParts; suggested: boolean } {
  const first = record?.contactFirstName?.trim() ?? "";
  const last = record?.contactLastName?.trim() ?? "";
  const contact = (record?.contactPerson ?? "").trim();
  const storedAsPerson = record?.clientType === "person";
  const stored = first || last ? { firstName: first, lastName: last } : null;
  if (stored && storedAsPerson === asPerson) return { parts: stored, suggested: false };
  if (stored && asPerson && composeContactName(first, last) !== contact) return { parts: stored, suggested: false };
  if (asPerson) {
    return { parts: splitPersonName((record?.name ?? "").trim()) ?? NONE, suggested: true };
  }
  if (!contact) return { parts: NONE, suggested: true };
  return { parts: splitPersonName(contact) ?? { firstName: contact, lastName: "" }, suggested: true };
}

/** What the form shows for a record; see seedOf. `asPerson` defaults to the record's own type. */
export function contactNameFieldsOf(record?: ContactNameRecord | null, asPerson = record?.clientType === "person"): ContactNameParts {
  return seedOf(record, asPerson).parts;
}

/**
 * The first and last name of a record's `name`, for a person form's fields while nothing is typed
 * (a suggestion, never saved on its own). Empty when the name cannot be split safely.
 */
export function contactNameSuggestion(name?: string): ContactNameParts {
  return splitPersonName((name ?? "").trim()) ?? NONE;
}

/**
 * What a NEW record's person form shows and saves: the typed parts, or the split of `name` while
 * nothing is typed. Showing and saving the same thing keeps the form honest.
 */
export function contactNameShown(typed: ContactNameParts, name: string | undefined, asPerson: boolean): ContactNameParts {
  return asPerson && !typed.firstName.trim() && !typed.lastName.trim() ? contactNameSuggestion(name) : typed;
}

/** The first and last name a register lookup's contact person is split into (null when unsure). */
export function contactNameFromRegistry(person?: string): ContactNameParts | null {
  return splitPersonName(person ?? "");
}

/**
 * The fields to merge into a record when its form is saved. Parts are always sent (an empty string
 * clears one), because a missing key means "no opinion" to the server. Untouched fields return {}: an
 * old record whose name could not be split is not rewritten just because the form was opened.
 *
 * `asPerson` is the type the record is saved as. A business also sends the composed `contactPerson`; a
 * person sends the parts only, `contactPerson` stays as it is. When the type changed, the parts are sent
 * even if the form is untouched (the stored ones meant something else); a mere suggestion is sent empty.
 * `name` is the name the record is saved with: a person who is renamed with untouched fields gets the
 * new name split again, when the stored parts were only ever that split (never typed).
 */
export function contactNamePatch(
  record: ContactNameRecord | null | undefined,
  fields: ContactNameParts,
  asPerson = record?.clientType === "person",
  name?: string,
): Pick<ContactNameRecord, "contactPerson" | "contactFirstName" | "contactLastName"> {
  const seeded = seedOf(record, asPerson);
  const first = fields.firstName.trim();
  const last = fields.lastName.trim();
  const edited = first !== seeded.parts.firstName || last !== seeded.parts.lastName;
  const typeChanged = !!record && (record.clientType === "person") !== asPerson;
  let parts = { firstName: first, lastName: last };
  if (!edited) {
    const oldName = (record?.name ?? "").trim();
    const renamed = asPerson && !typeChanged && !!record && name !== undefined && name.trim() !== oldName;
    if (renamed && (seeded.suggested || composeContactName(first, last) === oldName)) {
      // Never typed (empty, or still the split of the old name): follow the new name.
      const next = contactNameSuggestion(name);
      if (next.firstName === first && next.lastName === last) return {};
      parts = next;
    } else if (typeChanged) {
      if (seeded.suggested) parts = { firstName: "", lastName: "" };
    } else {
      return {};
    }
  }
  return {
    ...(asPerson || !edited ? {} : { contactPerson: composeContactName(parts.firstName, parts.lastName) }),
    contactFirstName: parts.firstName,
    contactLastName: parts.lastName,
  };
}

/** Parts for a record that was given only a full name (a guest order): both empty when unsure. */
export function contactPartsOfPerson(person?: string | null): { contactFirstName: string; contactLastName: string } {
  const parts = splitPersonName(person ?? "");
  return { contactFirstName: parts?.firstName ?? "", contactLastName: parts?.lastName ?? "" };
}
