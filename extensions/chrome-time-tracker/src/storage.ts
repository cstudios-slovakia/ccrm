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
});

export async function loadLocal(): Promise<TrackerLocal> {
  const bag = await chrome.storage.local.get(KEY);
  const stored = bag[KEY];
  return { ...emptyLocal(), ...(stored && typeof stored === "object" ? (stored as TrackerLocal) : {}) };
}

export async function saveLocal(patch: Partial<TrackerLocal>): Promise<TrackerLocal> {
  const next = { ...(await loadLocal()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}
