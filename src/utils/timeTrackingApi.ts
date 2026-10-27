/**
 * Client for `api/time_entries.php` and `api/holidays.php`.
 *
 * Time entries never ride the sync.php blob: they have their own endpoint, their own
 * permission checks (own time / team / costs) and their own conflict rule (one running
 * timer per user). Errors cross the wire as stable codes; `timeErrorMessage` turns one
 * into a sentence in the UI language.
 */

import type { HolidayDay, HolidayCountry } from "./holidays.ts";
import type { TimeEntry, TimeTrackingSettings } from "./timeTracking.ts";

export class TimeApiError extends Error {
  readonly code: string;
  readonly status: number;
  /** For `already_running`: the entry that is running. */
  readonly entry?: TimeEntry | null;
  constructor(code: string, status: number, entry?: TimeEntry | null) {
    super(code);
    this.code = code;
    this.status = status;
    this.entry = entry;
  }
}

export interface TimeViewer {
  userId?: string;
  canEdit: boolean;
  canTeam: boolean;
  canCosts: boolean;
}

export interface TimeSettingsResponse {
  settings: TimeTrackingSettings;
  /** The company's own calendar country (COMPANY_BILLING_SETTINGS.country mapped to SK/HU, else SK). */
  defaultCountry: HolidayCountry;
  me: { userId: string; employeeId: string | null; workCountry: HolidayCountry };
  viewer: TimeViewer;
}

export interface EntryInput {
  userId?: string;
  projectId?: string | null;
  taskId?: string | null;
  ticketId?: string | null;
  /** The entry's own text; ignored by the server for a linked entry. */
  description?: string | null;
  entryDate?: string;
  startAt?: string | null;
  endAt?: string | null;
  durationSec?: number | null;
  billable?: boolean;
  billableRate?: number | null;
  tags?: string[];
  source?: string;
  originType?: string | null;
  originId?: string | null;
}

const ENDPOINT = "/api/time_entries.php";

const parse = async (res: Response): Promise<any> => {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok || !body || body.success !== true) {
    throw new TimeApiError(body?.code || (res.status === 401 ? "signed_out" : "save_failed"), res.status, body?.entry ?? null);
  }
  return body;
};

const post = async (action: string, payload: Record<string, unknown> = {}): Promise<any> =>
  parse(
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    }),
  );

const get = async (query: Record<string, string | undefined>): Promise<any> => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") qs.set(k, v);
  return parse(await fetch(`${ENDPOINT}?${qs.toString()}`, { headers: { Accept: "application/json" } }));
};

export interface ListParams {
  from?: string;
  to?: string;
  /** Omitted = me; a user id or "all" needs time_tracking_team. */
  userId?: string;
  projectId?: string;
  taskId?: string;
  ticketId?: string;
}

export const listEntries = async (params: ListParams = {}): Promise<{ entries: TimeEntry[]; viewer: TimeViewer }> => {
  const body = await get({ ...params });
  return { entries: body.entries as TimeEntry[], viewer: body.viewer as TimeViewer };
};

export const getRunning = async (): Promise<TimeEntry | null> => ((await get({ running: "1" })).entry as TimeEntry | null) ?? null;

export const getSettings = async (): Promise<TimeSettingsResponse> => {
  const body = await get({ action: "settings" });
  return { settings: body.settings, defaultCountry: body.defaultCountry, me: body.me, viewer: body.viewer };
};

export const saveSettings = async (settings: Partial<TimeTrackingSettings>): Promise<TimeTrackingSettings> =>
  (await post("settings", { settings })).settings as TimeTrackingSettings;

export const startTimer = async (input: EntryInput): Promise<{ entry: TimeEntry; stopped: TimeEntry | null }> => {
  const body = await post("start", input as Record<string, unknown>);
  return { entry: body.entry, stopped: body.stopped ?? null };
};

export const stopTimer = async (opts: { id?: string; projectId?: string | null } = {}): Promise<TimeEntry> =>
  (await post("stop", opts)).entry as TimeEntry;

export const undoStart = async (newId: string, stoppedId?: string | null): Promise<TimeEntry | null> =>
  ((await post("undo_start", { newId, stoppedId })).entry as TimeEntry | null) ?? null;

export const createEntry = async (input: EntryInput): Promise<TimeEntry> =>
  (await post("create", input as Record<string, unknown>)).entry as TimeEntry;

export const updateEntry = async (id: string, patch: EntryInput): Promise<TimeEntry> =>
  (await post("update", { id, ...(patch as Record<string, unknown>) })).entry as TimeEntry;

export const deleteEntry = async (id: string): Promise<void> => {
  await post("delete", { id });
};

export const restoreEntry = async (id: string): Promise<TimeEntry> => (await post("restore", { id })).entry as TimeEntry;

/** Admin: recompute the frozen rate and cost of every entry in a period (fills entries that had no rate). */
export const repriceEntries = async (from: string, to: string, userIds?: string[]): Promise<{ repriced: number }> => {
  const body = await post("reprice", { from, to, userIds });
  return { repriced: Number(body.repriced) || 0 };
};

export interface HolidaysResponse {
  country: HolidayCountry;
  year: number;
  days: HolidayDay[];
  /** The API could not be reached and nothing was cached: these are the built-in rules. */
  fallback: boolean;
}

export const getHolidays = async (country: HolidayCountry, year: number): Promise<HolidaysResponse> => {
  const res = await fetch(`/api/holidays.php?country=${country}&year=${year}`, { headers: { Accept: "application/json" } });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.success !== true) throw new TimeApiError(body?.code || "holidays_unavailable", res.status);
  return { country, year, days: body.days as HolidayDay[], fallback: !!body.fallback };
};

/** One sentence per error code, in the UI language. */
export const timeErrorMessage = (code: string, t: (en: string, sk: string, hu: string) => string): string => {
  switch (code) {
    case "forbidden":
      return t("You do not have permission to do this.", "Na toto nemáte oprávnenie.", "Ehhez nincs jogosultsága.");
    case "forbidden_project":
      return t("You cannot pick a project directly. Start from a task instead.", "Projekt nemôžete vybrať priamo. Začnite z úlohy.", "Projektet nem választhat közvetlenül. Indítson egy feladatból.");
    case "forbidden_ticket":
      return t("You do not have access to tickets.", "Nemáte prístup k tiketom.", "Nincs hozzáférése a jegyekhez.");
    case "task_not_found":
      return t("That task is not available.", "Táto úloha nie je dostupná.", "Ez a feladat nem érhető el.");
    case "ticket_not_found":
      return t("That ticket no longer exists.", "Tento tiket už neexistuje.", "Ez a jegy már nem létezik.");
    case "project_not_found":
      return t("That project no longer exists.", "Tento projekt už neexistuje.", "Ez a projekt már nem létezik.");
    case "task_project_mismatch":
      return t("This task belongs to another project.", "Táto úloha patrí k inému projektu.", "Ez a feladat egy másik projekthez tartozik.");
    case "project_required":
      return t("Pick a project before stopping the timer.", "Pred zastavením časovača vyberte projekt.", "A leállítás előtt válasszon projektet.");
    case "task_required":
      return t("Pick a task before stopping the timer.", "Pred zastavením časovača vyberte úlohu.", "A leállítás előtt válasszon feladatot.");
    case "already_running":
      return t("A timer is already running.", "Časovač už beží.", "Már fut egy időzítő.");
    case "end_before_start":
      return t("The end is before the start.", "Koniec je pred začiatkom.", "A vég a kezdet előtt van.");
    case "duration_required":
      return t("Enter an end time or a duration.", "Zadajte koniec alebo trvanie.", "Adjon meg végidőt vagy időtartamot.");
    case "duration_out_of_range":
      return t("An entry can be at most 24 hours.", "Záznam môže mať najviac 24 hodín.", "Egy bejegyzés legfeljebb 24 órás lehet.");
    case "bad_time":
      return t("That time is not valid.", "Tento čas nie je platný.", "Ez az időpont érvénytelen.");
    case "not_found":
      return t("This entry no longer exists.", "Tento záznam už neexistuje.", "Ez a bejegyzés már nem létezik.");
    case "signed_out":
      return t("You have been signed out. Sign in again.", "Boli ste odhlásení. Prihláste sa znova.", "Kijelentkezett. Jelentkezzen be újra.");
    default:
      return t("Could not save the time entry.", "Záznam času sa nepodarilo uložiť.", "Az időbejegyzést nem sikerült menteni.");
  }
};
