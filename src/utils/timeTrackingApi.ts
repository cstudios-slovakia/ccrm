/**
 * Client for `api/time_entries.php` and `api/holidays.php`.
 *
 * Time entries never ride the sync.php blob: they have their own endpoint, their own
 * permission checks (own time / team / costs) and their own conflict rules (several running
 * timers per user only when parallel tracking is on, D5.3). Errors cross the wire as stable codes; `timeErrorMessage` turns one
 * into a sentence in the UI language.
 */

import type { HolidayDay, HolidayCountry } from "./holidays.ts";
import type { TaskPersonTime } from "./taskTimeSummary.ts";
import type { StartWhileRunning, TimeEntry, TimeTrackingSettings } from "./timeTracking.ts";
import type { RateCard } from "./timeCost.ts";
import type { PresenceSoundPrefs } from "./presenceSound.ts";

export class TimeApiError extends Error {
  readonly code: string;
  readonly status: number;
  /** For `already_running` / `same_project`: the running entry it collides with. */
  readonly entry?: TimeEntry | null;
  /** The rest of the error body (`maxParallel` of `parallel_limit`, `running` of `ambiguous`, `ids` of a stop-all refusal). */
  readonly details: Record<string, unknown>;
  constructor(code: string, status: number, entry?: TimeEntry | null, details: Record<string, unknown> = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.entry = entry;
    this.details = details;
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
  me: { userId: string; employeeId: string | null; workCountry: HolidayCountry; startWhileRunning: StartWhileRunning; presenceSound?: PresenceSoundPrefs };
  viewer: TimeViewer;
}

export interface EntryInput {
  userId?: string;
  projectId?: string | null;
  taskId?: string | null;
  ticketId?: string | null;
  /** The entry's own text; ignored by the server for a linked entry. */
  description?: string | null;
  /** The Description of the work; kept on linked entries too. */
  note?: string | null;
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
    throw new TimeApiError(
      body?.code || (res.status === 401 ? "signed_out" : "save_failed"),
      res.status,
      body?.entry ?? null,
      body && typeof body === "object" ? (body as Record<string, unknown>) : {},
    );
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
  byProject: Record<string, { seconds: number; workedMs?: number; cost: number | null; /** Hours x billable rate (information only); null without time_tracking_costs. */ billableValue?: number | null; billableComplete?: boolean }>;
  /** Worked milliseconds per user per entry date (overlaps counted once). */
  workedByUserDay?: Record<string, Record<string, number>>;
}

export const EMPTY_TIME_TOTALS: TimeTotals = { byTask: {}, byTicket: {}, byProject: {} };

/** Tracked seconds per task, ticket and project. Cost is present only when the caller may see every contributor's cost. */
export const getTotals = async (): Promise<TimeTotals> => {
  const body = await get({ action: "totals" });
  return {
    byTask: body.byTask && typeof body.byTask === "object" ? body.byTask : {},
    byTicket: body.byTicket && typeof body.byTicket === "object" ? body.byTicket : {},
    byProject: body.byProject && typeof body.byProject === "object" ? body.byProject : {},
    workedByUserDay: body.workedByUserDay && typeof body.workedByUserDay === "object" ? body.workedByUserDay : {},
  };
};

/** The rate card of one person-month (own, or anyone's with time_tracking_costs); null when there is none. */
export const getRateCard = async (employeeId: string, month: string): Promise<RateCard | null> => {
  const body = await get({ action: "rateCard", employeeId, month });
  return body.rateCard && typeof body.rateCard === "object" ? (body.rateCard as RateCard) : null;
};

export interface OverlapMonth { month: string; entries: number; users: number }

/** Per month (YYYY-MM): closed timed entries that overlap another entry of the same user. Admin / general_config only. */
export const getOverlaps = async (from: string, to: string): Promise<OverlapMonth[]> => {
  const body = await get({ action: "overlaps", from, to });
  return Array.isArray(body.months) ? body.months : [];
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

/** Where the caller's presence cycle stands (TT2 D7.1). Derived on the server; instants are ISO strings. */
export type TimePresencePhase = "idle" | "tracking" | "question" | "paused";

export interface TimePresence {
  /** Presence checks are on for the company. */
  enabled: boolean;
  /** The last answer (start, resume, confirm, ...); null while nothing runs. */
  anchorAt: string | null;
  /** When the question is asked (anchor + promptAfterMinutes). */
  promptAt: string | null;
  /** No answer by then: every running item ends at promptAt and is paused. */
  deadlineAt: string | null;
  phase: TimePresencePhase;
  /** The deadline of the automatic pause, while its pause can still be resumed. */
  autoPausedAt: string | null;
  /** Resume is possible until then (the automatic pause's resume window). */
  resumeUntil: string | null;
}

const isoOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** A presence object from the server, or null for an old server / a malformed body. */
export const parsePresence = (v: unknown): TimePresence | null => {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const phase = r.phase === "tracking" || r.phase === "question" || r.phase === "paused" ? r.phase : "idle";
  return {
    enabled: r.enabled !== false,
    anchorAt: isoOrNull(r.anchorAt),
    promptAt: isoOrNull(r.promptAt),
    deadlineAt: isoOrNull(r.deadlineAt),
    phase,
    autoPausedAt: isoOrNull(r.autoPausedAt),
    resumeUntil: isoOrNull(r.resumeUntil),
  };
};

/**
 * D7.4: answer the presence question ("still working"). Resolves the new state (the cycle restarts now).
 * After the deadline the server answers 409 `paused` (`TimeApiError.details.presence` has the state).
 */
export const confirmPresence = async (): Promise<TimePresence | null> => parsePresence((await post("confirm")).presence);

export interface RunningState {
  /** Every running entry, oldest start first. */
  running: TimeEntry[];
  paused: TimeEntry[];
  /** The presence engine's state (D7.1); null from an old server. */
  presence: TimePresence | null;
  /** The server's clock at the answer (ISO), null from an old server. */
  serverNow: string | null;
}

const entryList = (v: unknown): TimeEntry[] => (Array.isArray(v) ? (v.filter((e) => e && typeof e === "object") as TimeEntry[]) : []);

/** The running set. An old server answers only `entry`: that becomes a set of one. */
export const getRunningState = async (): Promise<RunningState> => {
  const body = await get({ running: "1" });
  const running = Array.isArray(body.running) ? entryList(body.running) : body.entry ? [body.entry as TimeEntry] : [];
  return {
    running,
    paused: entryList(body.paused),
    presence: parsePresence(body.presence),
    serverNow: typeof body.serverNow === "string" ? body.serverNow : null,
  };
};

/** The first running entry (single-timer callers). */
export const getRunning = async (): Promise<TimeEntry | null> => (await getRunningState()).running[0] ?? null;

export const getSettings = async (): Promise<TimeSettingsResponse> => {
  const body = await get({ action: "settings" });
  return { settings: body.settings, defaultCountry: body.defaultCountry, me: body.me, viewer: body.viewer };
};

export interface TimePrefs {
  startWhileRunning: StartWhileRunning;
  presenceSound?: PresenceSoundPrefs;
}

export const getPrefs = async (): Promise<TimePrefs> => (await get({ action: "prefs" })) as TimePrefs;

export const savePrefs = async (startWhileRunning: StartWhileRunning): Promise<TimePrefs> =>
  (await post("prefs", { startWhileRunning })) as TimePrefs;

/** The presence sound (volume, mute, which chime); the server keeps the other preference as it is. */
export const savePresenceSoundPref = async (presenceSound: PresenceSoundPrefs): Promise<TimePrefs> =>
  (await post("prefs", { presenceSound })) as TimePrefs;

export const saveSettings = async (settings: Partial<TimeTrackingSettings>): Promise<TimeTrackingSettings> =>
  (await post("settings", { settings })).settings as TimeTrackingSettings;

/** `switch` stops every running entry first (the default, and what an old server always does); `parallel` stops nothing. */
export type StartMode = "switch" | "parallel";

export interface StartResult {
  entry: TimeEntry;
  /** The first stopped entry (old servers send only this). */
  stopped: TimeEntry | null;
  /** Every entry the start stopped. */
  stoppedAll: TimeEntry[];
  mode: StartMode;
  /** A switch to a target that already runs among several: `entry` is that running one, nothing stopped. */
  alreadyRunning: boolean;
}

export const startTimer = async (input: EntryInput, mode?: StartMode): Promise<StartResult> => {
  const body = await post("start", { ...(input as Record<string, unknown>), ...(mode ? { mode } : {}) });
  const stopped = (body.stopped as TimeEntry | null) ?? null;
  return {
    entry: body.entry,
    stopped,
    stoppedAll: Array.isArray(body.stoppedAll) ? entryList(body.stoppedAll) : stopped ? [stopped] : [],
    mode: body.mode === "parallel" ? "parallel" : "switch",
    alreadyRunning: body.alreadyRunning === true,
  };
};

/** Stops one entry; without `id` the single running one (409 `ambiguous` while several run). */
/** `reason: 'status'`: fired by a task status change (D10.2), the entry records end_reason 'status'. */
export const stopTimer = async (opts: { id?: string; projectId?: string | null; reason?: "status" } = {}): Promise<TimeEntry> =>
  (await post("stop", opts)).entry as TimeEntry;

/** Stops every running entry of the caller; resolves the stopped ones (empty when nothing ran). */
export const stopAllTimers = async (): Promise<TimeEntry[]> => {
  const body = await post("stop", { all: true });
  return Array.isArray(body.stoppedAll) ? entryList(body.stoppedAll) : body.entry ? [body.entry as TimeEntry] : [];
};

/** The Undo of a start: drops the new entry and reopens every entry it stopped. */
export const undoStart = async (newId: string, stoppedIds: string[] = []): Promise<{ entry: TimeEntry | null; reopened: TimeEntry[] }> => {
  // `stoppedId` keeps an old server (one timer) reopening the one it stopped.
  const body = await post("undo_start", { newId, stoppedIds, stoppedId: stoppedIds[0] ?? null });
  const entry = (body.entry as TimeEntry | null) ?? null;
  return { entry, reopened: Array.isArray(body.reopened) ? entryList(body.reopened) : entry ? [entry] : [] };
};

/** D6: pause one running item (`id`) or every one (`all`). The entries end now and keep a resumable marker. */
export const pauseEntries = async (opts: ({ id: string } | { all: true }) & { reason?: "status" }): Promise<TimeEntry[]> =>
  ((await post("pause", opts)).paused as TimeEntry[] | undefined) ?? [];

export interface ResumeResult {
  /** The first new running entry (or the already-running identical one). */
  entry: TimeEntry | null;
  /** The new running entries, one per resumed item (`continuesId` = the paused entry). */
  entries: TimeEntry[];
  /** Ids of the paused entries that were resumed: the Undo is `undoStart(entry.id)` with `stoppedAll`'s ids. */
  resumed: string[];
  /** Running items a switch stopped to make room. */
  stoppedAll: TimeEntry[];
  /** Paused items that could not run together and stay paused. */
  skipped: string[];
  expired: string[];
}

/** D6, C8: resume a paused item (`id`) or every one (`all`); 409 `pause_expired` when the pause ran out. */
export const resumeEntries = async (
  opts: ({ id: string } | { all: true }) & { mode?: "auto" | "switch" | "parallel" },
): Promise<ResumeResult> => {
  const body = await post("resume", opts);
  return {
    entry: body.entry ?? null,
    entries: body.entries ?? [],
    resumed: body.resumed ?? [],
    stoppedAll: body.stoppedAll ?? [],
    skipped: body.skipped ?? [],
    expired: body.expired ?? [],
  };
};

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

/** One sentence per error code, in the UI language. `details` is the error body (`TimeApiError.details`). */
export const timeErrorMessage = (
  code: string,
  t: (en: string, sk: string, hu: string) => string,
  details: Record<string, unknown> = {},
): string => {
  switch (code) {
    case "parallel_disabled":
      return t("Parallel timers are turned off for this company.", "Paralelné časovače sú pre túto firmu vypnuté.", "A párhuzamos időzítők ennél a cégnél ki vannak kapcsolva.");
    case "parallel_forbidden":
      return t("You are not allowed to run timers in parallel.", "Nemáte oprávnenie spúšťať časovače paralelne.", "Nincs jogosultsága párhuzamos időzítők futtatására.");
    case "parallel_limit": {
      const max = Number(details.maxParallel);
      return Number.isFinite(max) && max > 0
        ? t(`At most ${max} timers can run at once. Stop one first.`, `Naraz môže bežať najviac ${max} časovačov. Najprv jeden zastavte.`, `Egyszerre legfeljebb ${max} időzítő futhat. Előbb állítson le egyet.`)
        : t("No more timers can run at once. Stop one first.", "Naraz už nemôže bežať viac časovačov. Najprv jeden zastavte.", "Egyszerre nem futhat több időzítő. Előbb állítson le egyet.");
    }
    case "same_project":
      return t("A timer on this project is already running. In parallel, one project runs only on different tasks.", "Na tomto projekte už beží časovač. Paralelne môže jeden projekt bežať len na rôznych úlohách.", "Ezen a projekten már fut egy időzítő. Párhuzamosan egy projekt csak különböző feladatokon futhat.");
    case "ambiguous":
      return t("Several timers are running. Pick the one to stop.", "Beží viac časovačov. Vyberte, ktorý zastaviť.", "Több időzítő fut. Válassza ki, melyiket állítja le.");
    case "bad_mode":
      return t("The app is out of date. Reload the page and try again.", "Aplikácia je zastaraná. Obnovte stránku a skúste znova.", "Az alkalmazás elavult. Töltse újra az oldalt, és próbálja újra.");
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
    case "pause_expired":
      return t("This pause has expired. Start a new timer.", "Táto prestávka vypršala. Spustite nový časovač.", "Ez a szünet lejárt. Indítson új időzítőt.");
    case "not_paused":
      return t("This entry is not paused.", "Tento záznam nie je pozastavený.", "Ez a bejegyzés nincs szüneteltetve.");
    case "not_running":
      return t("This timer is no longer running.", "Tento časovač už nebeží.", "Ez az időzítő már nem fut.");
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
    case "range_too_long":
      return t("That period is too long for one import. Pick at most a year.", "Toto obdobie je na jeden import príliš dlhé. Vyberte najviac rok.", "Ez az időszak túl hosszú egy importhoz. Legfeljebb egy évet válasszon.");
    case "bad_range":
      return t("Check the dates: the start must not be after the end.", "Skontrolujte dátumy: začiatok nesmie byť po konci.", "Ellenőrizze a dátumokat: a kezdet nem lehet a vég után.");
    case "toggl_unavailable":
      return t("Toggl did not answer. Wait a minute and try again; entries imported so far stay.", "Toggl neodpovedal. Počkajte minútu a skúste znova; doteraz importované záznamy zostávajú.", "A Toggl nem válaszolt. Várjon egy percet, és próbálja újra; az eddig importált bejegyzések megmaradnak.");
    case "bad_request":
      return t("The request was not valid. Reload the page and try again.", "Požiadavka nebola platná. Obnovte stránku a skúste znova.", "A kérés érvénytelen. Töltse újra az oldalt, és próbálja újra.");
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
