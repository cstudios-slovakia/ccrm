/**
 * Client for `api/time_entries.php` and `api/holidays.php`.
 *
 * Time entries never ride the sync.php blob: they have their own endpoint, their own
 * permission checks (own time / team / costs) and their own conflict rule (one running
 * timer per user). Errors cross the wire as stable codes; `timeErrorMessage` turns one
 * into a sentence in the UI language.
 */

import type { HolidayDay, HolidayCountry } from "./holidays.ts";
import type { TaskPersonTime } from "./taskTimeSummary.ts";
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

export interface TimeTotals {
  byTask: Record<string, number>;
  byTicket: Record<string, number>;
  byProject: Record<string, { seconds: number; cost: number | null }>;
}

export const EMPTY_TIME_TOTALS: TimeTotals = { byTask: {}, byTicket: {}, byProject: {} };

/** Tracked seconds per task, ticket and project. Cost is present only when the caller may see every contributor's cost. */
export const getTotals = async (): Promise<TimeTotals> => {
  const body = await get({ action: "totals" });
  return {
    byTask: body.byTask && typeof body.byTask === "object" ? body.byTask : {},
    byTicket: body.byTicket && typeof body.byTicket === "object" ? body.byTicket : {},
    byProject: body.byProject && typeof body.byProject === "object" ? body.byProject : {},
  };
};

/** Hours per person on one task. `cost` is present only when the viewer may see it (B8). */
export const getTaskPeople = async (taskId: string): Promise<TaskPersonTime[]> => {
  const body = await get({ action: "taskPeople", taskId });
  const rows = Array.isArray(body.people) ? body.people : [];
  return rows.flatMap((raw: unknown): TaskPersonTime[] => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as { userId?: unknown; seconds?: unknown; cost?: unknown };
    const userId = typeof r.userId === "string" ? r.userId : "";
    if (!userId) return [];
    const person: TaskPersonTime = { userId, seconds: Number(r.seconds) || 0 };
    if ("cost" in r) person.cost = typeof r.cost === "number" ? r.cost : null;
    return [person];
  });
};

export interface UsageEntry {
  id: string;
  projectId: string | null;
  ticketId: string | null;
  taskId: string | null;
  billable: boolean;
  entryDate: string;
  durationSec: number;
}

/** Billable-capable rows of a project, for the retainer total. Requires tickets.time. */
export const listProjectUsage = async (projectId: string): Promise<UsageEntry[]> => {
  const body = await get({ action: "usage", projectId });
  return (body.entries ?? []) as UsageEntry[];
};

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
    case "entry_locked":
      return t("This entry is locked. Only an admin can change it.", "Tento záznam je zamknutý. Zmeniť ho môže len administrátor.", "Ez a bejegyzés zárolt. Csak adminisztrátor módosíthatja.");
    case "approval_off":
      return t("Weekly approval is turned off.", "Týždenné schvaľovanie je vypnuté.", "A heti jóváhagyás ki van kapcsolva.");
    case "toggl_not_configured":
      return t("Toggl is not configured. Add the token under Employees → Settings.", "Toggl nie je nastavený. Token pridajte v Zamestnanci → Nastavenia.", "A Toggl nincs beállítva. A tokent a Munkatársak → Beállítások alatt adja meg.");
    case "unsupported_provider":
      return t("Clockify import is not available.", "Import z Clockify nie je k dispozícii.", "A Clockify import nem érhető el.");
    case "not_paired":
      return t("This browser is not paired. Enter a new code.", "Tento prehliadač nie je spárovaný. Zadajte nový kód.", "Ez a böngésző nincs párosítva. Adjon meg egy új kódot.");
    case "code_invalid":
      return t("That pairing code is not valid.", "Tento párovací kód nie je platný.", "Ez a párosító kód érvénytelen.");
    case "code_expired":
      return t("That pairing code has expired. Ask for a new one.", "Platnosť párovacieho kódu vypršala. Požiadajte o nový.", "A párosító kód lejárt. Kérjen újat.");
    case "code_used":
      return t("That pairing code was already used.", "Tento párovací kód už bol použitý.", "Ezt a párosító kódot már felhasználták.");
    case "rate_limited":
      return t("Too many attempts. Wait a few minutes and try again.", "Príliš veľa pokusov. Počkajte pár minút a skúste znova.", "Túl sok próbálkozás. Várjon pár percet, és próbálja újra.");
    case "extension_disabled":
      return t("The Chrome extension is turned off for this company.", "Rozšírenie Chrome je pre túto firmu vypnuté.", "A Chrome-bővítmény ennél a cégnél ki van kapcsolva.");
    case "capture_disabled":
      return t("Activity capture is off.", "Zaznamenávanie aktivity je vypnuté.", "A tevékenység rögzítése ki van kapcsolva.");
    case "timestamp_out_of_window":
      return t("That time is more than 24 hours off.", "Tento čas sa líši o viac ako 24 hodín.", "Ez az időpont több mint 24 órával tér el.");
    default:
      return t("Could not save the time entry.", "Záznam času sa nepodarilo uložiť.", "Az időbejegyzést nem sikerült menteni.");
  }
};
