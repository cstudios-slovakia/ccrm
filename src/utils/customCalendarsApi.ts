import type { CustomCalendar, CustomCalendarEvent } from "../types";

const ENDPOINT = "/api/custom_calendars.php";

export interface CustomCalendarsPayload {
  calendars: CustomCalendar[];
  events: CustomCalendarEvent[];
}

export async function fetchCustomCalendars(from?: string, to?: string): Promise<CustomCalendarsPayload> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  const res = await fetch(qs ? `${ENDPOINT}?${qs}` : ENDPOINT, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch custom calendars (${res.status})`);
  }
  const data = await res.json();
  return {
    calendars: Array.isArray(data?.calendars) ? data.calendars : [],
    events: Array.isArray(data?.events) ? data.events : [],
  };
}

export async function saveCustomCalendar(input: {
  id?: string;
  name: string;
  color: string;
  description?: string | null;
}): Promise<CustomCalendar> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save_calendar", ...input }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.calendar) {
    throw new Error(data?.error || `Failed to save custom calendar (${res.status})`);
  }
  return data.calendar as CustomCalendar;
}

export async function deleteCustomCalendar(id: string): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete_calendar", id }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Failed to delete custom calendar (${res.status})`);
  }
}

export async function saveCustomCalendarEvent(input: {
  id?: string;
  calendarId: string;
  title: string;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
  color?: string | null;
  owner?: string | null;
  relatedLeadId?: string | null;
  relatedProjectId?: string | null;
}): Promise<CustomCalendarEvent> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save_event", ...input }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.event) {
    throw new Error(data?.error || `Failed to save event (${res.status})`);
  }
  return data.event as CustomCalendarEvent;
}

export async function deleteCustomCalendarEvent(id: string): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete_event", id }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Failed to delete event (${res.status})`);
  }
}

const toMinutes = (hhmm?: string | null): number | null => {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Finds existing events on the same custom calendar that overlap the candidate
 * date/time range (for Meeting Room / resource double-booking warnings).
 */
export function findOverlappingCustomEvents(
  events: CustomCalendarEvent[],
  candidate: {
    id?: string;
    calendarId: string;
    startDate: string;
    endDate: string;
    startTime?: string | null;
    endTime?: string | null;
  }
): CustomCalendarEvent[] {
  const cStart = candidate.startDate;
  const cEnd = candidate.endDate >= candidate.startDate ? candidate.endDate : candidate.startDate;
  const cStartMin = toMinutes(candidate.startTime);
  const cEndMin = toMinutes(candidate.endTime) ?? (cStartMin !== null ? cStartMin + 60 : null);

  return events.filter((ev) => {
    if (ev.calendarId !== candidate.calendarId) return false;
    if (candidate.id && ev.id === candidate.id) return false;
    const evEnd = ev.endDate >= ev.startDate ? ev.endDate : ev.startDate;
    if (ev.startDate > cEnd || evEnd < cStart) return false;

    // Multi-day or all-day events overlap any event on the intersecting dates.
    if (cStartMin === null || cEndMin === null) return true;
    const evStartMin = toMinutes(ev.startTime);
    const evEndMin = toMinutes(ev.endTime) ?? (evStartMin !== null ? evStartMin + 60 : null);
    if (evStartMin === null || evEndMin === null) return true;

    // If either event spans multiple days, dates already overlap.
    if (cStart !== cEnd || ev.startDate !== evEnd) return true;
    return cStartMin < evEndMin && cEndMin > evStartMin;
  });
}
