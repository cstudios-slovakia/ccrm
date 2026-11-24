import type { TimelineEventType } from "../types";

type Tr = (en: string, sk: string, hu: string) => string;

/** The event types of the project type, or the built-in ones when it defines none. Notes are not one: they have their own tab. */
export function timelineEventTypeOptions(types: TimelineEventType[] | undefined, t: Tr): { value: string; label: string }[] {
  if (types && types.length > 0) return types.map(et => ({ value: et.id, label: et.name }));
  return [
    { value: "phone", label: t("Phone Call", "Telefonát", "Telefonhívás") },
    { value: "email", label: t("Email Dispatch", "Odoslaný e-mail", "E-mail") },
    { value: "appointment", label: t("Meeting / Appointment", "Stretnutie", "Találkozó") },
  ];
}

/**
 * The title an event is saved with: the typed one, else the selected type's label when there are
 * details to log. Empty string = nothing to save (neither a title nor details).
 */
export function resolveTimelineEventTitle(title: string, content: string, typeLabel: string): string {
  const typed = title.trim();
  if (typed) return typed;
  return content.trim() ? typeLabel.trim() : "";
}

export type TimelineEventIssue = { field: string; message: string };

/**
 * What stops "Add event": nothing to log, or a required attribute of the type left empty.
 * `field` is "title" or the attribute id, so the form can show the message under that field.
 */
export function findTimelineEventIssue(
  input: {
    title: string;
    content: string;
    attributes: { id: string; name: string; required?: boolean }[];
    isEmpty: (attrId: string) => boolean;
  },
  t: Tr,
): TimelineEventIssue | null {
  if (!input.title.trim() && !input.content.trim()) {
    return { field: "title", message: t("Enter a title or details for the event.", "Zadajte názov alebo podrobnosti udalosti.", "Adjon meg címet vagy részleteket az eseményhez.") };
  }
  for (const attr of input.attributes) {
    if (attr.required && input.isEmpty(attr.id)) {
      return { field: attr.id, message: `"${attr.name}" ${t("is required.", "je povinné.", "megadása kötelező.")}` };
    }
  }
  return null;
}
