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
  type StartWhileRunning,
  type TFn,
  type TimeEntry,
  type TimeTrackingSettings,
} from "../utils/timeTracking.ts";
import {
  TimeApiError,
  confirmPresence,
  getHolidays,
  EMPTY_TIME_TOTALS,
  getRunningState,
  getSettings,
  getTotals,
  pauseEntries,
  resumeEntries,
  savePrefs,
  startTimer,
  stopAllTimers,
  stopTimer,
  timeErrorMessage,
  undoStart,
  type EntryInput,
  type RunningState,
  type StartMode,
  type TimePresence,
  type TimeTotals,
  type TimeViewer,
} from "../utils/timeTrackingApi.ts";
import { isRunningTarget as runningHas, resolveStartMode, sameRunningIds, type RunningTarget } from "../utils/timeTrackingRunning.ts";
import { stripTimerTitle, workedClockSeconds } from "../utils/timeContainer.ts";
import { presenceTabTitle } from "../utils/timePresenceUi.ts";
import { IDLE_PRESENCE_VIEW, nextPresenceBoundary, presenceView as derivePresenceView, type PresenceView } from "../utils/timePresence.ts";
import { StartModePopover } from "../components/timeTracking/StartModePopover.tsx";

export interface StartOptions {
  /** The control that was clicked: the "Switch / Run in parallel" popover opens next to it (default: the focused element). */
  anchor?: Element | DOMRect | null;
  /** Skip the preference: the caller already chose. */
  mode?: StartMode;
  /** An Undo toast with this text even when nothing was stopped (a status-driven start, D10.2). */
  notice?: (entry: TimeEntry) => string;
}

/** Options of a stop or pause; `reason: 'status'` = fired by a task status change (D10.2). */
export interface EndOptions {
  reason?: "status";
}

/**
 * The state every part of the app shares about time tracking: the running set (header pill, tab
 * title, module), the settings and the working calendar.
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
  /** Every running entry of the signed-in user, oldest start first (D5.4). */
  running: TimeEntry[];
  /** Paused entries (phase 6/7 fills it; empty until then). */
  paused: TimeEntry[];
  /** The presence engine's state, as the server last sent it (D7.1); replaced on every running-set read. */
  presence: TimePresence | null;
  /** The presence cycle at `nowMs`, derived locally (phase, ring, countdowns): what every presence UI reads (D8.1). */
  presenceView: PresenceView;
  /**
   * D7.4 "Still working": restarts the cycle now. Resolves the new state; after the deadline the
   * server has paused the timers, so this re-reads the running set and resolves the paused state.
   * Resolves null when nothing runs or the answer failed.
   */
  confirm: () => Promise<TimePresence | null>;
  /** Server clock minus this browser's clock, from the last running-set answer (0 until known). */
  serverOffsetMs: number;
  /** The first running entry, or null: what single-timer UI shows. */
  primaryRunning: TimeEntry | null;
  /** Is this task / ticket / free-text target in the running set (the server's identical-target rule)? */
  isRunningTarget: (target: RunningTarget) => boolean;
  /** What a Start does while something runs: the user's preference (D5.2). */
  startWhileRunning: StartWhileRunning;
  saveStartWhileRunning: (pref: StartWhileRunning) => Promise<void>;
  /** The shared clock: this browser's time corrected by `serverOffsetMs`; ticks each second while a timer runs or a presence state is open. */
  nowMs: number;
  /** Tracked seconds per task, ticket and project. Reloaded with `version`. */
  totals: TimeTotals;
  /** Bumped by every change; views refetch on it. */
  version: number;
  bump: () => void;
  /** Starts a timer; while something runs, by `startWhileRunning` (may ask). Resolves null when cancelled or refused. */
  start: (input?: EntryInput, opts?: StartOptions) => Promise<TimeEntry | null>;
  /**
   * Stops one running entry (`id`), or the only one when `id` is omitted. Resolves null when the
   * user cancelled the "pick a project" step or the stop failed (the running set is then re-read).
   */
  stop: (id?: string, opts?: EndOptions) => Promise<TimeEntry | null>;
  /** Stops every running entry; resolves the stopped ones, or null when cancelled or failed. */
  stopAll: () => Promise<TimeEntry[] | null>;
  /** Pauses one running entry (`id`), or the only one when omitted; resolves false when nothing was paused. */
  pause: (id?: string, opts?: EndOptions) => Promise<boolean>;
  pauseAll: () => Promise<boolean>;
  /** Resumes one paused entry (`id`), or the only one when omitted: a new running entry continues it. */
  resume: (id?: string) => Promise<boolean>;
  resumeAll: () => Promise<boolean>;
  /** Public holidays of a country; the built-in rules until the server answered. */
  calendarFor: (country: HolidayCountry, overrides?: HolidayOverride[]) => HolidayCalendar;
  ensureHolidayYears: (country: HolidayCountry, years: number[]) => void;
  /** True when a year came back from the built-in rules because the API was unreachable. */
  holidaysFallback: boolean;
  reloadSettings: () => Promise<void>;
  setSettingsLocal: (s: TimeTrackingSettings) => void;
  /** Raised by the module when the "pick a project" step is needed (rendered by the provider's owner). */
  projectRequest: { resolve: (projectId: string | null | undefined) => void; purpose?: "start" | "stop" } | null;
  /** Opens that dialog for a start (a status-driven start on a task with several projects, D10.2). */
  requestProject: (purpose: "start" | "stop") => Promise<string | null | undefined>;
  notify: (message: string, variant?: "error" | "warning") => void;
}

const NOOP = async () => null;
/** How often a visible page re-reads the running set (one indexed SELECT on the server). */
const RUNNING_POLL_MS = 30_000;
const Ctx = createContext<TimeTrackingContextValue>({
  enabled: false,
  ready: false,
  t: makeT("en"),
  settings: DEFAULT_TIME_TRACKING_SETTINGS,
  viewer: { canEdit: false, canTeam: false, canCosts: false },
  userId: null,
  workCountry: "SK",
  defaultCountry: "SK",
  running: [],
  paused: [],
  presence: null,
  presenceView: IDLE_PRESENCE_VIEW,
  confirm: async () => null,
  serverOffsetMs: 0,
  primaryRunning: null,
  isRunningTarget: () => false,
  startWhileRunning: "ask",
  saveStartWhileRunning: async () => {},
  totals: EMPTY_TIME_TOTALS,
  nowMs: Date.now(),
  version: 0,
  bump: () => {},
  start: NOOP,
  stop: NOOP,
  stopAll: NOOP,
  pause: async () => false,
  pauseAll: async () => false,
  resume: async () => false,
  resumeAll: async () => false,
  calendarFor: (c) => makeHolidayCalendar(c, builtinHolidays(c, new Date().getFullYear())),
  ensureHolidayYears: () => {},
  holidaysFallback: false,
  reloadSettings: async () => {},
  setSettingsLocal: () => {},
  projectRequest: null,
  requestProject: async () => null,
  notify: () => {},
});

export const useTimeTracking = (): TimeTrackingContextValue => useContext(Ctx);

const notifyToast = (message: string, variant?: "error" | "warning") => {
  if (typeof window !== "undefined") window.showToast?.(message, variant);
};

const NO_ENTRIES: TimeEntry[] = [];

/** The open "Switch / Run in parallel" question. */
interface ModeRequest {
  id: number;
  variant: "ask" | "fallback";
  anchor: DOMRect | null;
  runningCount: number;
  message?: string;
  resolve: (choice: { mode: StartMode; remember: boolean } | null) => void;
}

/**
 * A tab-channel message: the running set travels with timer changes so other tabs update at once;
 * a presence answer carries the new state so every tab closes its question (D8.2).
 */
type ChannelMessage = "changed" | { type: "changed"; running?: TimeEntry[] } | { type: "presence"; presence: TimePresence | null };

const rectOf = (anchor: Element | DOMRect | null | undefined): DOMRect | null => {
  if (!anchor) return null;
  if (typeof DOMRect !== "undefined" && anchor instanceof DOMRect) return anchor;
  if (typeof Element !== "undefined" && anchor instanceof Element && anchor !== document.body) return anchor.getBoundingClientRect();
  return null;
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
  const [running, setRunning] = useState<TimeEntry[]>(NO_ENTRIES);
  const [paused, setPaused] = useState<TimeEntry[]>(NO_ENTRIES);
  const [presence, setPresence] = useState<TimePresence | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const offsetRef = useRef(0);
  offsetRef.current = serverOffsetMs;
  const [startWhileRunning, setStartWhileRunning] = useState<StartWhileRunning>("ask");
  const [modeRequest, setModeRequest] = useState<ModeRequest | null>(null);
  const modeRequestRef = useRef<ModeRequest | null>(null);
  const modeRequestSeq = useRef(0);
  const [totals, setTotals] = useState<TimeTotals>(EMPTY_TIME_TOTALS);
  const [nowMs, setNowMs] = useState(() => Date.now());
  /** The browser clock corrected by the server's (D11: a wrong device clock never moves a countdown). */
  const clock = useCallback(() => Date.now() + offsetRef.current, []);
  const [version, setVersion] = useState(0);
  const [projectRequest, setProjectRequest] = useState<TimeTrackingContextValue["projectRequest"]>(null);
  const [holidayYears, setHolidayYears] = useState<Record<string, { days: HolidayDay[]; fallback: boolean }>>({});
  const requestedYears = useRef(new Set<string>());
  const runningRef = useRef<TimeEntry[]>(running);
  const pausedRef = useRef<TimeEntry[]>(paused);
  pausedRef.current = paused;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const prefRef = useRef(startWhileRunning);
  prefRef.current = startWhileRunning;

  /** The running set changes here only, so the ref is current before React re-renders. */
  const applyRunning = useCallback((next: TimeEntry[]) => {
    runningRef.current = next;
    setRunning(next);
  }, []);

  // Other tabs of this browser hear about every change, so none keeps offering "Start" on a timer
  // that is already running (a click there would stop it and start a new, separate entry).
  const channelRef = useRef<BroadcastChannel | null>(null);
  const post = useCallback((message: ChannelMessage) => {
    try {
      channelRef.current?.postMessage(message);
    } catch {
      /* the channel closed with the page */
    }
  }, []);
  const bump = useCallback(() => {
    setVersion((v) => v + 1);
    post("changed");
  }, [post]);
  /** After a start or stop: the other tabs get the new running set with the message. */
  const bumpTimers = useCallback(() => {
    setVersion((v) => v + 1);
    post({ type: "changed", running: runningRef.current });
  }, [post]);

  useEffect(() => {
    if (!enabled || !userId || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`ccrm-time-tracking:${userId}`);
    channel.onmessage = (e: MessageEvent<ChannelMessage>) => {
      const data = e.data;
      if (data && typeof data === "object" && data.type === "presence") {
        // Answered in another tab: the cycle restarted there; nothing else changed.
        setPresence(data.presence);
        return;
      }
      if (data && typeof data === "object" && Array.isArray(data.running)) applyRunning(data.running);
      setVersion((v) => v + 1);
    };
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, [enabled, userId, applyRunning]);

  const reloadSettings = useCallback(async () => {
    try {
      const res = await getSettings();
      setSettings({ ...DEFAULT_TIME_TRACKING_SETTINGS, ...res.settings });
      setViewer(res.viewer);
      setWorkCountry(res.me.workCountry);
      setDefaultCountry(res.defaultCountry);
      const pref = res.me.startWhileRunning;
      setStartWhileRunning(pref === "switch" || pref === "parallel" ? pref : "ask");
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

  const refreshRunning = useCallback(async (): Promise<RunningState | null> => {
    try {
      const sentAt = Date.now();
      const next = await getRunningState();
      // Started or stopped somewhere this page never heard from (another device, an agent):
      // the lists and totals are out of date too, so let every view refetch.
      if (!sameRunningIds(next.running, runningRef.current)) setVersion((v) => v + 1);
      applyRunning(next.running);
      setPaused(next.paused.length ? next.paused : NO_ENTRIES);
      setPresence(next.presence);
      const server = next.serverNow ? Date.parse(next.serverNow) : NaN;
      // The answer's midpoint is the best guess of when the server read its clock.
      if (Number.isFinite(server)) {
        offsetRef.current = Math.round(server - (sentAt + Date.now()) / 2);
        setServerOffsetMs(offsetRef.current);
        setNowMs(Date.now() + offsetRef.current);
      }
      return next;
    } catch {
      /* keep what we have */
      return null;
    }
  }, [applyRunning]);

  // Load once per sign-in, then keep the running set fresh on focus (it can be started elsewhere).
  useEffect(() => {
    if (!enabled || !userId) {
      setReady(false);
      applyRunning(NO_ENTRIES);
      setPaused(NO_ENTRIES);
      setPresence(null);
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
    // Two windows side by side never become "visible" again; focusing one must still refresh it.
    const onFocus = () => void refreshRunning();
    // Another device or browser cannot reach the tab channel: re-read the running set while the page is shown.
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshRunning();
    }, RUNNING_POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, userId, reloadSettings, refreshRunning, refreshTotals, applyRunning]);

  // Any change (an edit, a rename of the linked task, another view's save) may have touched a running entry.
  useEffect(() => {
    if (enabled && userId && version > 0) {
      void refreshRunning();
      void refreshTotals();
    }
  }, [version, enabled, userId, refreshRunning, refreshTotals]);

  const primaryRunning = running[0] ?? null;
  const runningKey = running.map((e) => e.id).join(",");

  // Elapsed time and the presence countdowns are now minus an instant: the clock only re-renders,
  // it never counts. It ticks while a timer runs or a paused state can still be resumed; idle, it rests.
  const presenceOpen = presence?.phase === "paused" || presence?.phase === "question";
  const ticking = !!runningKey || presenceOpen;
  useEffect(() => {
    if (!ticking) return;
    setNowMs(clock());
    const id = window.setInterval(() => setNowMs(clock()), 1000);
    return () => window.clearInterval(id);
  }, [ticking, clock]);

  // At the deadline the server pauses every timer (D7.3), at the end of the resume window it drops
  // the markers: ask it right then instead of waiting for the next poll ("pausing…" until it answers).
  const boundary = nextPresenceBoundary(presence);
  useEffect(() => {
    if (!enabled || !userId || boundary === null) return;
    // A little after the instant, so the server's own clock has passed it too.
    const wait = Math.max(0, boundary - clock()) + 750;
    const id = window.setTimeout(() => void refreshRunning(), Math.min(wait, 2 ** 31 - 1));
    return () => window.clearTimeout(id);
  }, [boundary, enabled, userId, clock, refreshRunning]);

  const presenceView = useMemo(() => derivePresenceView(presence, nowMs), [presence, nowMs]);

  // The browser tab shows the timer: "▶ 1:12:05 · CCRM". The prefix pattern also strips the
  // older "▶ 1:12 · " form, in case a title was set before this version loaded.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = stripTimerTitle(document.title);
    if (!primaryRunning && presenceView.phase !== "paused") {
      if (document.title !== base) document.title = base;
      return;
    }
    // One item: its own elapsed time. Several: the worked clock of the stretch and "∥N" (D5.4).
    const seconds = !primaryRunning ? 0 : running.length > 1 ? workedClockSeconds(running, nowMs) : elapsedSeconds(primaryRunning.startAt, nowMs);
    const next = presenceTabTitle({
      base,
      phase: presenceView.phase,
      runningCount: running.length,
      workedSec: seconds,
      secondsToPause: presenceView.secondsToPause,
      questionLabel: t("Still working?", "Stále pracuješ?", "Még dolgozol?"),
      pausedLabel: t("Paused", "Pozastavené", "Szüneteltetve"),
    });
    if (document.title !== next) document.title = next;
  }, [primaryRunning, running, nowMs, presenceView, t]);

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
    (purpose: "start" | "stop" = "stop") =>
      new Promise<string | null | undefined>((resolve) => {
        setProjectRequest({
          purpose,
          resolve: (id) => {
            setProjectRequest(null);
            resolve(id);
          },
        });
      }),
    [],
  );

  /** Opens the "Switch / Run in parallel" popover; resolves the choice, or null when cancelled. */
  const askMode = useCallback(
    (req: Omit<ModeRequest, "resolve" | "id">) =>
      new Promise<{ mode: StartMode; remember: boolean } | null>((resolve) => {
        modeRequestRef.current?.resolve(null); // a newer click replaces an unanswered question
        const request: ModeRequest = {
          ...req,
          id: ++modeRequestSeq.current,
          resolve: (choice) => {
            // Only the open question closes the popover; a late answer never closes a newer one.
            if (modeRequestRef.current === request) {
              modeRequestRef.current = null;
              setModeRequest(null);
            }
            resolve(choice);
          },
        };
        modeRequestRef.current = request;
        setModeRequest(request);
      }),
    [],
  );

  const fail = useCallback(
    (e: unknown) => {
      const code = e instanceof TimeApiError ? e.code : "save_failed";
      notifyToast(timeErrorMessage(code, t, e instanceof TimeApiError ? e.details : {}), "error");
    },
    [t],
  );

  const saveStartWhileRunning = useCallback(
    async (pref: StartWhileRunning) => {
      const before = prefRef.current;
      setStartWhileRunning(pref);
      try {
        const res = await savePrefs(pref);
        setStartWhileRunning(res.startWhileRunning ?? pref);
      } catch (e) {
        setStartWhileRunning(before);
        fail(e);
      }
    },
    [fail],
  );

  const warnAlreadyRunning = useCallback(
    (entry: TimeEntry) => {
      const title = entry.title;
      const since = formatDuration(elapsedSeconds(entry.startAt, Date.now()));
      notifyToast(
        title
          ? t(`The timer is already running on “${title}” (${since}).`, `Časovač už beží na „${title}“ (${since}).`, `Az időzítő már fut: „${title}” (${since}).`)
          : t(`The timer is already running (${since}).`, `Časovač už beží (${since}).`, `Az időzítő már fut (${since}).`),
        "warning",
      );
    },
    [t],
  );

  /** "Timer started on X. Y was stopped at 0:42." with Undo, which reopens every stopped entry. */
  const offerUndo = useCallback(
    (entry: TimeEntry, stopped: TimeEntry[], notice?: (entry: TimeEntry) => string) => {
      if ((!stopped.length && !notice) || typeof window === "undefined" || !window.showUndoToast) return;
      const name = entry.title || "…";
      let message: string;
      if (!stopped.length && notice) {
        message = notice(entry);
      } else if (stopped.length === 1) {
        const was = formatDuration(stopped[0].durationSec, true);
        const old = stopped[0].title || "…";
        message = t(
          `Timer started on “${name}”. “${old}” was stopped at ${was}.`,
          `Časovač spustený na „${name}“. „${old}“ bol zastavený na ${was}.`,
          `Időzítő indítva: „${name}”. „${old}” leállítva: ${was}.`,
        );
      } else {
        const n = stopped.length;
        message = t(
          `Timer started on “${name}”. ${n} timers were stopped.`,
          `Časovač spustený na „${name}“. Zastavené časovače: ${n}.`,
          `Időzítő indítva: „${name}”. ${n} időzítő leállítva.`,
        );
      }
      window.showUndoToast({
        message,
        undoLabel: t("Undo", "Späť", "Visszavonás"),
        onUndo: () => {
          void undoStart(
            entry.id,
            stopped.map((s) => s.id),
          )
            .then(({ reopened }) => {
              applyRunning(reopened);
              bumpTimers();
            })
            .catch(fail);
        },
        onCommit: () => {},
      });
    },
    [applyRunning, bumpTimers, fail, t],
  );

  const runStart = useCallback(
    async (input: EntryInput, mode: StartMode | undefined, anchor: DOMRect | null, notice?: StartOptions["notice"]): Promise<TimeEntry | null> => {
      try {
        const res = await startTimer({ billable: settingsRef.current.billableByDefault, ...input }, mode);
        if (res.alreadyRunning) {
          // A switch to what already runs among several: nothing changed on the server.
          if (!runningRef.current.some((e) => e.id === res.entry.id)) applyRunning([...runningRef.current, res.entry]);
          bumpTimers();
          warnAlreadyRunning(res.entry);
          return res.entry;
        }
        const stoppedIds = new Set(res.stoppedAll.map((e) => e.id));
        applyRunning(
          res.mode === "parallel"
            ? [...runningRef.current.filter((e) => e.id !== res.entry.id && !stoppedIds.has(e.id)), res.entry]
            : [res.entry],
        );
        bumpTimers();
        offerUndo(res.entry, res.stoppedAll, notice);
        return res.entry;
      } catch (e) {
        if (e instanceof TimeApiError && e.code === "already_running" && e.entry) {
          // The server refuses a start of what is already running (this screen was out of date).
          const entry = e.entry;
          if (!runningRef.current.some((r) => r.id === entry.id)) applyRunning([...runningRef.current, entry]);
          bumpTimers();
          warnAlreadyRunning(entry);
          return entry;
        }
        if (mode === "parallel" && e instanceof TimeApiError && (e.code === "parallel_disabled" || e.code === "parallel_forbidden")) {
          // This screen's settings were stale, or the role lacks the permission: offer the switch instead.
          if (e.code === "parallel_disabled") void reloadSettings();
          const choice = await askMode({
            variant: "fallback",
            anchor,
            runningCount: runningRef.current.length,
            message: timeErrorMessage(e.code, t, e.details),
          });
          return choice ? runStart(input, "switch", anchor, notice) : null;
        }
        if (e instanceof TimeApiError && (e.code === "same_project" || e.code === "parallel_limit")) void refreshRunning();
        fail(e);
        return null;
      }
    },
    [applyRunning, askMode, bumpTimers, fail, offerUndo, refreshRunning, reloadSettings, t, warnAlreadyRunning],
  );

  const start = useCallback(
    async (input: EntryInput = {}, opts: StartOptions = {}): Promise<TimeEntry | null> => {
      const anchor = rectOf(opts.anchor !== undefined ? opts.anchor : typeof document !== "undefined" ? document.activeElement : null);
      const current = runningRef.current;
      const target: RunningTarget = { taskId: input.taskId, ticketId: input.ticketId, projectId: input.projectId, title: input.description };
      let resolved = resolveStartMode({
        runningCount: current.length,
        preference: prefRef.current,
        parallel: settingsRef.current.parallel ?? DEFAULT_TIME_TRACKING_SETTINGS.parallel,
        targetRunning: runningHas(current, target),
        forced: opts.mode ?? null,
      });
      if (resolved === "ask") {
        const choice = await askMode({ variant: "ask", anchor, runningCount: current.length });
        if (!choice) return null;
        if (choice.remember) void saveStartWhileRunning(choice.mode);
        resolved = choice.mode;
      }
      return runStart(input, resolved === "plain" ? undefined : resolved, anchor, opts.notice);
    },
    [askMode, runStart, saveStartWhileRunning],
  );

  /** A stop the server could not match (gone, or several running): show why and re-read the set. */
  const failStop = useCallback(
    (e: unknown) => {
      if (e instanceof TimeApiError && (e.code === "ambiguous" || e.code === "not_found")) void refreshRunning();
      fail(e);
    },
    [fail, refreshRunning],
  );

  const stop = useCallback(
    async (id?: string, opts: EndOptions = {}): Promise<TimeEntry | null> => {
      const current = runningRef.current;
      if (!id && !current.length) return null;
      const targetId = id ?? (current.length === 1 ? current[0].id : undefined);
      const reason = opts.reason ? { reason: opts.reason } : {};
      try {
        let stopped: TimeEntry;
        try {
          stopped = await stopTimer({ ...(targetId ? { id: targetId } : {}), ...reason });
        } catch (e) {
          if (e instanceof TimeApiError && e.code === "project_required") {
            // "Require a project before Stop": open the picker instead of failing.
            const projectId = await askProject();
            if (!projectId) return null;
            stopped = await stopTimer({ ...(targetId ? { id: targetId } : {}), projectId, ...reason });
          } else {
            throw e;
          }
        }
        applyRunning(runningRef.current.filter((e) => e.id !== stopped.id));
        // A paused item lost its marker: the paused list changed on the server too.
        if (pausedRef.current.some((e) => e.id === stopped.id)) void refreshRunning();
        bumpTimers();
        return stopped;
      } catch (e) {
        failStop(e);
        return null;
      }
    },
    [applyRunning, askProject, bumpTimers, failStop, refreshRunning],
  );

  const stopAll = useCallback(async (): Promise<TimeEntry[] | null> => {
    try {
      let stopped: TimeEntry[];
      try {
        stopped = await stopAllTimers();
      } catch (e) {
        const ids = e instanceof TimeApiError && e.code === "project_required" && Array.isArray(e.details.ids) ? (e.details.ids as unknown[]).map(String) : null;
        if (!ids) throw e;
        // Nothing stops while an item needs a project: pick one per item, stop those, then the rest.
        const done: TimeEntry[] = [];
        for (const id of ids) {
          const projectId = await askProject();
          if (!projectId) {
            if (done.length) {
              applyRunning(runningRef.current.filter((r) => !done.some((d) => d.id === r.id)));
              bumpTimers();
            }
            return null;
          }
          done.push(await stopTimer({ id, projectId }));
        }
        stopped = [...done, ...(await stopAllTimers())];
      }
      applyRunning(NO_ENTRIES);
      bumpTimers();
      return stopped;
    } catch (e) {
      failStop(e);
      void refreshRunning();
      return null;
    }
  }, [applyRunning, askProject, bumpTimers, failStop, refreshRunning]);

  /** Pause and resume change both lists on the server: re-read them instead of guessing. */
  const afterPauseChange = useCallback(async () => {
    await refreshRunning();
    bumpTimers();
  }, [bumpTimers, refreshRunning]);

  const pause = useCallback(
    async (id?: string, opts: EndOptions = {}): Promise<boolean> => {
      const targetId = id ?? (runningRef.current.length === 1 ? runningRef.current[0].id : undefined);
      if (!targetId) return false;
      try {
        const done = await pauseEntries({ id: targetId, ...(opts.reason ? { reason: opts.reason } : {}) });
        await afterPauseChange();
        return done.length > 0;
      } catch (e) {
        fail(e);
        void refreshRunning();
        return false;
      }
    },
    [afterPauseChange, fail, refreshRunning],
  );

  const pauseAll = useCallback(async (): Promise<boolean> => {
    if (!runningRef.current.length) return false;
    try {
      const done = await pauseEntries({ all: true });
      await afterPauseChange();
      return done.length > 0;
    } catch (e) {
      fail(e);
      void refreshRunning();
      return false;
    }
  }, [afterPauseChange, fail, refreshRunning]);

  const resume = useCallback(
    async (id?: string): Promise<boolean> => {
      const targetId = id ?? (pausedRef.current.length === 1 ? pausedRef.current[0].id : undefined);
      if (!targetId) return false;
      try {
        const res = await resumeEntries({ id: targetId });
        await afterPauseChange();
        return res.entries.length > 0;
      } catch (e) {
        fail(e);
        void refreshRunning();
        return false;
      }
    },
    [afterPauseChange, fail, refreshRunning],
  );

  const resumeAll = useCallback(async (): Promise<boolean> => {
    if (!pausedRef.current.length) return false;
    try {
      const res = await resumeEntries({ all: true });
      await afterPauseChange();
      return res.entries.length > 0;
    } catch (e) {
      fail(e);
      void refreshRunning();
      return false;
    }
  }, [afterPauseChange, fail, refreshRunning]);

  const confirm = useCallback(async (): Promise<TimePresence | null> => {
    try {
      const next = await confirmPresence();
      setPresence(next);
      post({ type: "presence", presence: next });
      return next;
    } catch (e) {
      if (e instanceof TimeApiError && (e.code === "paused" || e.code === "not_running")) {
        // Too late (the timers were paused at the deadline) or nothing runs any more: show the real state.
        const state = await refreshRunning();
        bumpTimers();
        return e.code === "paused" ? (state?.presence ?? null) : null;
      }
      fail(e);
      return null;
    }
  }, [bumpTimers, fail, post, refreshRunning]);

  const isRunningTarget = useCallback((target: RunningTarget) => runningHas(running, target), [running]);

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
    paused,
    presence,
    presenceView,
    confirm,
    serverOffsetMs,
    primaryRunning,
    isRunningTarget,
    startWhileRunning,
    saveStartWhileRunning,
    totals,
    nowMs,
    version,
    bump,
    start,
    stop,
    stopAll,
    pause,
    pauseAll,
    resume,
    resumeAll,
    calendarFor,
    ensureHolidayYears,
    holidaysFallback,
    reloadSettings,
    setSettingsLocal: setSettings,
    projectRequest,
    requestProject: askProject,
    notify: notifyToast,
  };
  return (
    <Ctx.Provider value={value}>
      {children}
      {modeRequest && (
        <StartModePopover
          key={modeRequest.id}
          anchor={modeRequest.anchor}
          variant={modeRequest.variant}
          runningCount={modeRequest.runningCount}
          parallelEnabled={!!settings.parallel?.enabled}
          message={modeRequest.message}
          t={t}
          onChoose={(mode, remember) => modeRequest.resolve({ mode, remember })}
          onCancel={() => modeRequest.resolve(null)}
        />
      )}
    </Ctx.Provider>
  );
}
