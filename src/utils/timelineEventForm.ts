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
 * The title an event is saved with. Nothing on the form is required, so it falls back in order: the typed
 * name, the selected event type's name, then the first line of the details.
 */
export function resolveTimelineEventTitle(title: string, content: string, typeLabel: string): string {
  const typed = title.trim();
  if (typed) return typed;
  if (typeLabel.trim()) return typeLabel.trim();
  const firstLine = content.trim().split(/\r?\n/, 1)[0].trim();
  return firstLine.length > 80 ? `${firstLine.slice(0, 79).trimEnd()}…` : firstLine;
}

export type TimelineEventIssue = { field: string; message: string };

/**
 * What stops "Add event": only a required attribute of a custom event type left empty (an admin marked it
 * required in the project type). Name and details are optional; see resolveTimelineEventTitle.
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
  for (const attr of input.attributes) {
    if (attr.required && input.isEmpty(attr.id)) {
      return { field: attr.id, message: `"${attr.name}" ${t("is required.", "je povinné.", "megadása kötelező.")}` };
    }
  }
  return null;
}
