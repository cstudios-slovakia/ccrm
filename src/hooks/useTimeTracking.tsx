import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  builtinHolidays,
  makeHolidayCalendar,
  overridesFor,
  type HolidayCalendar,
  type HolidayCountry,
  type HolidayDay,
  type HolidayOverride,
} from "../utils/holidays.ts";
import {
  DEFAULT_TIME_TRACKING_SETTINGS,
  elapsedSeconds,
  formatDuration,
  makeT,
  type TFn,
  type TimeEntry,
  type TimeTrackingSettings,
} from "../utils/timeTracking.ts";
import {
  TimeApiError,
  getHolidays,
  EMPTY_TIME_TOTALS,
  getRunning,
  getSettings,
  getTotals,
  startTimer,
  stopTimer,
  timeErrorMessage,
  undoStart,
  type EntryInput,
  type TimeTotals,
  type TimeViewer,
} from "../utils/timeTrackingApi.ts";

/**
 * The state every part of the app shares about time tracking: the one running timer
 * (header pill, tab title, module), the settings and the working calendar.
 *
 * Entries themselves are not held here — each view loads the range it shows and
 * refetches when `version` changes.
 */
export interface TimeTrackingContextValue {
  /** The signed-in user may use the module at all. */
  enabled: boolean;
  ready: boolean;
  t: TFn;
  settings: TimeTrackingSettings;
  viewer: TimeViewer;
  userId: string | null;
  /** The calendar country of the signed-in user (employee override, else the company's). */
  workCountry: HolidayCountry;
  defaultCountry: HolidayCountry;
  running: TimeEntry | null;
  nowMs: number;
  /** Tracked seconds per task, ticket and project. Reloaded with `version`. */
  totals: TimeTotals;
  /** Bumped by every change; views refetch on it. */
  version: number;
  bump: () => void;
  start: (input?: EntryInput) => Promise<TimeEntry | null>;
  /** Stops the running timer; resolves null when the user cancelled the "pick a project" step. */
  stop: () => Promise<TimeEntry | null>;
  /** Public holidays of a country; the built-in rules until the server answered. */
  calendarFor: (country: HolidayCountry, overrides?: HolidayOverride[]) => HolidayCalendar;
  ensureHolidayYears: (country: HolidayCountry, years: number[]) => void;
  /** True when a year came back from the built-in rules because the API was unreachable. */
  holidaysFallback: boolean;
  reloadSettings: () => Promise<void>;
  setSettingsLocal: (s: TimeTrackingSettings) => void;
  /** Raised by the module when the "pick a project" step is needed (rendered by the provider's owner). */
  projectRequest: { resolve: (projectId: string | null | undefined) => void } | null;
  notify: (message: string, variant?: "error" | "warning") => void;
}

const NOOP = async () => null;
const Ctx = createContext<TimeTrackingContextValue>({
  enabled: false,
  ready: false,
  t: makeT("en"),
  settings: DEFAULT_TIME_TRACKING_SETTINGS,
  viewer: { canEdit: false, canTeam: false, canCosts: false },
  userId: null,
  workCountry: "SK",
  defaultCountry: "SK",
  running: null,
  totals: EMPTY_TIME_TOTALS,
  nowMs: Date.now(),
  version: 0,
  bump: () => {},
  start: NOOP,
  stop: NOOP,
  calendarFor: (c) => makeHolidayCalendar(c, builtinHolidays(c, new Date().getFullYear())),
  ensureHolidayYears: () => {},
  holidaysFallback: false,
  reloadSettings: async () => {},
  setSettingsLocal: () => {},
  projectRequest: null,
  notify: () => {},
});

export const useTimeTracking = (): TimeTrackingContextValue => useContext(Ctx);

const notifyToast = (message: string, variant?: "error" | "warning") => {
  if (typeof window !== "undefined") window.showToast?.(message, variant);
};

export function TimeTrackingProvider({
  enabled,
  language,
  userId,
  children,
}: {
  enabled: boolean;
  language: string;
  userId: string | null;
  children: ReactNode;
}) {
  const t = useMemo(() => makeT(language), [language]);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<TimeTrackingSettings>(DEFAULT_TIME_TRACKING_SETTINGS);
  const [viewer, setViewer] = useState<TimeViewer>({ canEdit: false, canTeam: false, canCosts: false });
  const [workCountry, setWorkCountry] = useState<HolidayCountry>("SK");
  const [defaultCountry, setDefaultCountry] = useState<HolidayCountry>("SK");
  const [running, setRunning] = useState<TimeEntry | null>(null);
  const [totals, setTotals] = useState<TimeTotals>(EMPTY_TIME_TOTALS);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [version, setVersion] = useState(0);
  const [projectRequest, setProjectRequest] = useState<TimeTrackingContextValue["projectRequest"]>(null);
  const [holidayYears, setHolidayYears] = useState<Record<string, { days: HolidayDay[]; fallback: boolean }>>({});
  const requestedYears = useRef(new Set<string>());
  const runningRef = useRef<TimeEntry | null>(null);
  runningRef.current = running;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const reloadSettings = useCallback(async () => {
    try {
      const res = await getSettings();
      setSettings({ ...DEFAULT_TIME_TRACKING_SETTINGS, ...res.settings });
      setViewer(res.viewer);
      setWorkCountry(res.me.workCountry);
      setDefaultCountry(res.defaultCountry);
    } catch {
      /* the module shows its own empty state; defaults stay */
    }
  }, []);

  const refreshTotals = useCallback(async () => {
    try {
      setTotals(await getTotals());
    } catch {
      /* chips stay at what they last showed */
    }
  }, []);

  const refreshRunning = useCallback(async () => {
    try {
      setRunning(await getRunning());
    } catch {
      /* keep what we have */
    }
  }, []);

  // Load once per sign-in, then keep the running timer fresh on focus (it can be started elsewhere).
  useEffect(() => {
    if (!enabled || !userId) {
      setReady(false);
      setRunning(null);
      return;
    }
    let cancelled = false;
    (async () => {
      await Promise.all([reloadSettings(), refreshRunning(), refreshTotals()]);
      if (!cancelled) setReady(true);
    })();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshRunning();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, userId, reloadSettings, refreshRunning, refreshTotals]);

  // Any change (an edit, a rename of the linked task, another view's save) may have touched the running entry.
  useEffect(() => {
    if (enabled && userId && version > 0) {
      void refreshRunning();
      void refreshTotals();
    }
  }, [version, enabled, userId, refreshRunning, refreshTotals]);

  // Elapsed time is now minus start: the clock only re-renders, it never counts.
  useEffect(() => {
    if (!running) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running?.id]);

  // The browser tab shows the timer: "▶ 1:12 · CCRM".
  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = document.title.replace(/^▶ \d+:\d{2} · /, "");
    if (!running) {
      if (document.title !== base) document.title = base;
      return;
    }
    const mins = Math.floor(elapsedSeconds(running.startAt, nowMs) / 60);
    document.title = `▶ ${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")} · ${base}`;
  }, [running, nowMs]);

  const ensureHolidayYears = useCallback(
    (country: HolidayCountry, years: number[]) => {
      if (!enabled) return;
      for (const year of years) {
        const key = `${country}-${year}`;
        if (requestedYears.current.has(key)) continue;
        requestedYears.current.add(key);
        getHolidays(country, year)
          .then((res) => setHolidayYears((prev) => ({ ...prev, [key]: { days: res.days, fallback: res.fallback } })))
          .catch(() => {
            requestedYears.current.delete(key);
          });
      }
    },
    [enabled],
  );

  const calendarFor = useCallback(
    (country: HolidayCountry, overrides?: HolidayOverride[]): HolidayCalendar => {
      const thisYear = new Date().getFullYear();
      const days: HolidayDay[] = [];
      const years = new Set<number>([thisYear - 1, thisYear, thisYear + 1]);
      for (const key of Object.keys(holidayYears)) if (key.startsWith(`${country}-`)) years.add(Number(key.slice(3)));
      for (const year of years) {
        const loaded = holidayYears[`${country}-${year}`];
        days.push(...(loaded ? loaded.days : builtinHolidays(country, year)));
      }
      return makeHolidayCalendar(country, days, overrides ?? overridesFor(settings.holidayOverrides, country));
    },
    [holidayYears, settings.holidayOverrides],
  );

  const holidaysFallback = useMemo(() => Object.values(holidayYears).some((y) => y.fallback), [holidayYears]);

  const askProject = useCallback(
    () =>
      new Promise<string | null | undefined>((resolve) => {
        setProjectRequest({
          resolve: (id) => {
            setProjectRequest(null);
            resolve(id);
          },
        });
      }),
    [],
  );

  const fail = useCallback(
    (e: unknown) => {
      const code = e instanceof TimeApiError ? e.code : "save_failed";
      notifyToast(timeErrorMessage(code, t), "error");
    },
    [t],
  );

  const start = useCallback(
    async (input: EntryInput = {}): Promise<TimeEntry | null> => {
      try {
        const { entry, stopped } = await startTimer({ billable: settingsRef.current.billableByDefault, ...input });
        setRunning(entry);
        bump();
        if (stopped && typeof window !== "undefined" && window.showUndoToast) {
          const was = formatDuration(stopped.durationSec, true);
          window.showUndoToast({
            message: t(
              `Timer started on “${entry.title || "…"}”. “${stopped.title || "…"}” was stopped at ${was}.`,
              `Časovač spustený na „${entry.title || "…"}“. „${stopped.title || "…"}“ bol zastavený na ${was}.`,
              `Időzítő indítva: „${entry.title || "…"}”. „${stopped.title || "…"}” leállítva: ${was}.`,
            ),
            undoLabel: t("Undo", "Späť", "Visszavonás"),
            onUndo: () => {
              void undoStart(entry.id, stopped.id)
                .then((reopened) => {
                  setRunning(reopened);
                  bump();
                })
                .catch(fail);
            },
            onCommit: () => {},
          });
        }
        return entry;
      } catch (e) {
        if (e instanceof TimeApiError && e.code === "already_running" && e.entry) {
          setRunning(e.entry);
          notifyToast(timeErrorMessage("already_running", t), "warning");
          return e.entry;
        }
        fail(e);
        return null;
      }
    },
    [bump, fail, t],
  );

  const stop = useCallback(async (): Promise<TimeEntry | null> => {
    const current = runningRef.current;
    if (!current) return null;
    try {
      let stopped: TimeEntry;
      try {
        stopped = await stopTimer({ id: current.id });
      } catch (e) {
        if (e instanceof TimeApiError && e.code === "project_required") {
          // "Require a project before Stop": open the picker instead of failing.
          const projectId = await askProject();
          if (!projectId) return null;
          stopped = await stopTimer({ id: current.id, projectId });
        } else {
          throw e;
        }
      }
      setRunning(null);
      bump();
      return stopped;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [askProject, bump, fail]);

  const value: TimeTrackingContextValue = {
    enabled,
    ready,
    t,
    settings,
    viewer,
    userId,
    workCountry,
    defaultCountry,
    running,
    totals,
    nowMs,
    version,
    bump,
    start,
    stop,
    calendarFor,
    ensureHolidayYears,
    holidaysFallback,
    reloadSettings,
    setSettingsLocal: setSettings,
    projectRequest,
    notify: notifyToast,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
