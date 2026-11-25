import type { ActivityBlock } from "../../../src/utils/timeTrackerRules.ts";
import type { IdleState, PresenceSnapshot } from "./presence.ts";

declare const chrome: { storage: { local: { get: (key: string) => Promise<Record<string, unknown>>; set: (items: Record<string, unknown>) => Promise<void> } } };

export interface QueueItem {
  id: string;
  kind: "start" | "stop";
  at: string;
  body: Record<string, unknown>;
}

export interface OptimisticTimer {
  startedAt: string;
  title: string;
  projectName: string;
  taskTitle: string;
}

export interface ExtensionPrefs {
  soundEnabled: boolean;
  soundVolume: number;
  flashWindow: boolean;
  autoPopoutAlert: boolean;
  defaultStartMode: "ask" | "switch" | "parallel";
}

export const DEFAULT_EXTENSION_PREFS: ExtensionPrefs = {
  soundEnabled: true,
  soundVolume: 0.7,
  flashWindow: true,
  autoPopoutAlert: false,
  defaultStartMode: "switch",
};

export interface TrackerLocal {
  ccrmUrl: string;
  deviceKey: string;
  userName: string;
  queue: QueueItem[];
  lost: QueueItem[];
  rawBlocks: ActivityBlock[];
  openBlock: { domain: string; pageTitle: string; startedAt: number } | null;
  optimistic: OptimisticTimer | null;
  /** The last `running` answer, for the badge between polls and while offline (TT2 phase 10). */
  snapshot: PresenceSnapshot | null;
  /** chrome.idle state: past the deadline while idle or locked, "paused" is shown locally. */
  idleState: IdleState;
  prefs: ExtensionPrefs;
  /** Non-null while user previews the 50-minute pulse alert from extension settings. */
  testAlertUntil: number | null;
  /** Question cycle key for which the auto-popout window was already opened once. */
  popoutShownForAnchor: string | null;
}

const KEY = "ccrmTimeTracker";

export const emptyLocal = (): TrackerLocal => ({
  ccrmUrl: "",
  deviceKey: "",
  userName: "",
  queue: [],
  lost: [],
  rawBlocks: [],
  openBlock: null,
  optimistic: null,
  snapshot: null,
  idleState: "active",
  prefs: { ...DEFAULT_EXTENSION_PREFS },
  testAlertUntil: null,
  popoutShownForAnchor: null,
});

export async function loadLocal(): Promise<TrackerLocal> {
  const bag = await chrome.storage.local.get(KEY);
  const stored = bag[KEY] && typeof bag[KEY] === "object" ? (bag[KEY] as Partial<TrackerLocal>) : {};
  const defaults = emptyLocal();
  return {
    ...defaults,
    ...stored,
    prefs: { ...DEFAULT_EXTENSION_PREFS, ...(stored.prefs && typeof stored.prefs === "object" ? stored.prefs : {}) },
  };
}

export async function saveLocal(patch: Partial<TrackerLocal>): Promise<TrackerLocal> {
  const curr = await loadLocal();
  const next: TrackerLocal = {
    ...curr,
    ...patch,
    prefs: patch.prefs ? { ...curr.prefs, ...patch.prefs } : curr.prefs,
  };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}
