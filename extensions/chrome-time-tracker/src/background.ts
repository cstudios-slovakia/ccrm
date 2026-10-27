import { badgeLabel, hostOnly, matchingSite, mergeActivityBlocks, ACTIVITY_MERGE_GAP_MS, type ActivityBlock, type WatchedSite } from "../../../src/utils/timeTrackerRules.ts";
import { TrackerError, trackerCall } from "./client.ts";
import { loadLocal, saveLocal, type TrackerLocal } from "./storage.ts";

declare const chrome: any;

const alarmName = "ccrm-tt";

function paint(startedAt: string | null): void {
  if (!startedAt) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }
  const sec = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  chrome.action.setBadgeText({ text: badgeLabel(sec) });
  chrome.action.setBadgeBackgroundColor({ color: "#e11d48" });
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
      if (code === "timestamp_out_of_window" || code === "end_before_start") {
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
      paint(res.entry?.running ? res.entry.startAt : null);
    } catch (error) {
      if (error instanceof TrackerError && error.code === "not_paired") {
        await saveLocal({ deviceKey: "", userName: "", optimistic: null });
        paint(null);
        return;
      }
      paint(state.optimistic?.startedAt ?? null);
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
