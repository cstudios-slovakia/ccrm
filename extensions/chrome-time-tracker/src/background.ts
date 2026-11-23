import { badgeLabel, hostOnly, matchingSite, mergeActivityBlocks, ACTIVITY_MERGE_GAP_MS, type ActivityBlock, type WatchedSite } from "../../../src/utils/timeTrackerRules.ts";
import { TrackerError, trackerCall } from "./client.ts";
import { loadLocal, saveLocal, type TrackerLocal } from "./storage.ts";
import { badgeFor, localPhase, snapshotFrom, type IdleState, type PresenceSnapshot } from "./presence.ts";

declare const chrome: any;

const alarmName = "ccrm-tt";
// One-shot alarm at the next presence instant (the question, then the deadline), so the badge turns on time.
const presenceAlarm = "ccrm-tt-presence";

function paint(startedAt: string | null): void {
  if (!startedAt) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }
  const sec = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  chrome.action.setBadgeText({ text: badgeLabel(sec) });
  chrome.action.setBadgeBackgroundColor({ color: "#e11d48" });
}

const elapsedLabel = (startedAt: string) => badgeLabel(Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000)));

/** Paint the badge from the last server answer and the idle state: question "?", paused "II" (TT2 phase 10). */
function paintSnapshot(snapshot: PresenceSnapshot | null, idle: IdleState): void {
  const badge = badgeFor(snapshot, localPhase(snapshot, idle), elapsedLabel);
  chrome.action.setBadgeText({ text: badge.text });
  chrome.action.setBadgeBackgroundColor({ color: badge.color });
}

/** Arm the one-shot alarm at the next of promptAt / deadlineAt that is still ahead (local clock). */
async function armPresenceAlarm(snapshot: PresenceSnapshot | null): Promise<void> {
  await chrome.alarms.clear(presenceAlarm);
  const p = snapshot?.presence;
  if (!p || p.enabled === false || (p.phase !== "tracking" && p.phase !== "question")) return;
  const now = Date.now();
  const next = [p.promptAt, p.deadlineAt]
    .map((iso) => (iso ? Date.parse(iso) - (snapshot?.offsetMs || 0) : Number.NaN))
    .filter((at) => Number.isFinite(at) && at > now)
    .sort((a, b) => a - b)[0];
  if (next !== undefined) await chrome.alarms.create(presenceAlarm, { when: next + 500 });
}

async function idleNow(state: TrackerLocal): Promise<IdleState> {
  try {
    const live = await chrome.idle.queryState(60);
    if (live === "active" || live === "idle" || live === "locked") return live;
  } catch {
    /* no idle permission yet (an old install before the update): keep what was stored */
  }
  return state.idleState || "active";
}

/** Repaint from storage alone, without asking the server (a presence instant or an idle change). */
async function paintLocal(): Promise<void> {
  const state = await loadLocal();
  if (!state.deviceKey) {
    paint(null);
    return;
  }
  if (state.queue.length > 0) {
    paint(state.optimistic?.startedAt ?? null);
    return;
  }
  paintSnapshot(state.snapshot, await idleNow(state));
}

async function flush(state: TrackerLocal): Promise<TrackerLocal> {
  if (!state.deviceKey || state.queue.length === 0) return state;
  const queue = [...state.queue];
  const keep: TrackerLocal["queue"] = [];
  const lost = [...state.lost];
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const body = item.kind === "start" ? { ...item.body, startedAt: item.at } : { ...item.body, stoppedAt: item.at };
    try {
      await trackerCall(state.ccrmUrl, state.deviceKey, "POST", item.kind, body);
    } catch (error) {
      const code = error instanceof TrackerError ? error.code : "offline";
      if (code === "not_paired") {
        return saveLocal({ deviceKey: "", userName: "", queue: [], lost: lost.concat(queue.slice(i)), optimistic: null, openBlock: null });
      }
      if (code === "already_running" && item.kind === "start") continue;
      // ambiguous: a queued stop without an id while several timers run; only the app can tell which.
      if (code === "timestamp_out_of_window" || code === "end_before_start" || code === "ambiguous") {
        lost.push(item);
        continue;
      }
      keep.push(...queue.slice(i));
      break;
    }
  }
  return saveLocal({ queue: keep, lost, optimistic: keep.length ? state.optimistic : null });
}

async function uploadBlocks(state: TrackerLocal, rules: { enabled: boolean; companyAllows: boolean; extensionEnabled: boolean; minMinutes: number; sites: WatchedSite[] }): Promise<void> {
  const raw = state.rawBlocks;
  if (!raw.length || !state.deviceKey) return;
  const now = Date.now();
  const merged = mergeActivityBlocks(raw, rules.minMinutes).filter((block) => matchingSite(block.domain, rules.sites));
  const stale = (block: ActivityBlock) => now - block.endedAt > ACTIVITY_MERGE_GAP_MS;
  if (!rules.enabled || !rules.companyAllows || !rules.extensionEnabled) {
    await saveLocal({ rawBlocks: raw.filter((block) => !stale(block)) });
    return;
  }
  if (!merged.length) {
    await saveLocal({ rawBlocks: raw.filter((block) => !stale(block)) });
    return;
  }
  try {
    await trackerCall(state.ccrmUrl, state.deviceKey, "POST", "activity", {
      blocks: merged.map((block) => ({
        domain: block.domain,
        pageTitle: block.pageTitle,
        startedAt: new Date(block.startedAt).toISOString(),
        endedAt: new Date(block.endedAt).toISOString(),
      })),
    });
    const leftover = raw.filter((block) => {
      const consumed = merged.some((run) => block.domain === run.domain && block.startedAt >= run.startedAt && block.endedAt <= run.endedAt);
      return !consumed && !stale(block);
    });
    await saveLocal({ rawBlocks: leftover });
  } catch (error) {
    if (error instanceof TrackerError && error.code === "not_paired") {
      await saveLocal({ deviceKey: "", userName: "", optimistic: null, openBlock: null });
    }
  }
}

async function sample(): Promise<void> {
  const state = await loadLocal();
  if (!state.deviceKey) return;
  let rules: { enabled: boolean; companyAllows: boolean; extensionEnabled: boolean; minMinutes: number; sites: WatchedSite[] };
  try {
    rules = await trackerCall(state.ccrmUrl, state.deviceKey, "GET", "rules");
  } catch {
    return;
  }
  const running = !!state.optimistic || state.queue.some((item) => item.kind === "start");
  let serverRunning = false;
  if (!running && state.queue.length === 0) {
    try {
      const res = await trackerCall(state.ccrmUrl, state.deviceKey, "GET", "running");
      serverRunning = !!res.entry?.running;
    } catch {
      serverRunning = false;
    }
  }
  const capture = rules.enabled && rules.companyAllows && rules.extensionEnabled && !running && !serverRunning;
  if (!capture) {
    if (state.openBlock) await saveLocal({ openBlock: null });
    return;
  }
  let tab: { url?: string; title?: string } | null = null;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs?.[0] ?? null;
  } catch {
    tab = null;
  }
  const host = tab?.url ? hostOnly(tab.url) : null;
  const watched = host ? matchingSite(host, rules.sites) : null;
  if (!host || !watched) {
    await sealOpen();
    return;
  }
  const title = (tab?.title || "").replace(/[\u0000-\u001f]/g, "").slice(0, 300);
  const open = (await loadLocal()).openBlock;
  if (open && open.domain === host) {
    if (title && title !== open.pageTitle) await saveLocal({ openBlock: { ...open, pageTitle: title } });
    return;
  }
  await sealOpen();
  await saveLocal({ openBlock: { domain: host, pageTitle: title, startedAt: Date.now() } });

  async function sealOpen(): Promise<void> {
    const current = await loadLocal();
    if (!current.openBlock) {
      await uploadBlocks(current, rules);
      return;
    }
    const block: ActivityBlock = { ...current.openBlock, endedAt: Date.now() };
    const next = await saveLocal({ openBlock: null, rawBlocks: [...current.rawBlocks, block].slice(-40) });
    await uploadBlocks(next, rules);
  }
}

async function tick(): Promise<void> {
  let state = await loadLocal();
  if (!state.deviceKey) {
    paint(null);
    return;
  }
  state = await flush(state);
  if (!state.deviceKey) {
    paint(null);
    return;
  }
  if (state.queue.length > 0) {
    paint(state.optimistic?.startedAt ?? null);
  } else {
    try {
      const res = await trackerCall(state.ccrmUrl, state.deviceKey, "GET", "running");
      // Several timers: no single elapsed time fits, so the badge shows how many run (Nx);
      // the question and the pause override both ("?" and "II").
      const snapshot = snapshotFrom(res);
      await saveLocal({ snapshot });
      paintSnapshot(snapshot, await idleNow(state));
      await armPresenceAlarm(snapshot);
    } catch (error) {
      if (error instanceof TrackerError && error.code === "not_paired") {
        await saveLocal({ deviceKey: "", userName: "", optimistic: null });
        paint(null);
        return;
      }
      // Offline: the last answer and the clock (paused past the deadline while idle or locked).
      if (state.optimistic) paint(state.optimistic.startedAt);
      else paintSnapshot(state.snapshot, await idleNow(state));
    }
  }
  await sample();
}

async function ensureAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(alarmName);
  if (!existing) await chrome.alarms.create(alarmName, { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureAlarm().then(tick);
});
chrome.runtime.onStartup.addListener(() => {
  void ensureAlarm().then(tick);
});
chrome.alarms.onAlarm.addListener((alarm: { name: string }) => {
  if (alarm.name === alarmName) void tick();
  if (alarm.name === presenceAlarm) {
    // The question or the deadline is due: repaint at once, then let the server confirm when someone is there.
    void paintLocal().then(async () => {
      const state = await loadLocal();
      if ((await idleNow(state)) === "active") await tick();
    });
  }
});
// TT2 phase 10: locked or idle past the question's deadline shows "paused" locally; back to active, re-read the server.
chrome.idle?.setDetectionInterval?.(60);
chrome.idle?.onStateChanged?.addListener((next: IdleState) => {
  void saveLocal({ idleState: next }).then(() => (next === "active" ? tick() : paintLocal()));
});
chrome.tabs?.onActivated?.addListener(() => {
  void sample();
});
chrome.tabs?.onUpdated?.addListener((_id: number, info: { status?: string }) => {
  if (info.status === "complete") void sample();
});
chrome.runtime.onMessage.addListener((message: { type?: string }, _sender: unknown, sendResponse: (value: unknown) => void) => {
  if (message?.type === "refresh") {
    void tick().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

void ensureAlarm();
