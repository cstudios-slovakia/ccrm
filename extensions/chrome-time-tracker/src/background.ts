import { badgeLabel, hostOnly, matchingSite, mergeActivityBlocks, ACTIVITY_MERGE_GAP_MS, type ActivityBlock, type WatchedSite } from "../../../src/utils/timeTrackerRules.ts";
import { TrackerError, trackerCall } from "./client.ts";
import { loadLocal, saveLocal, type TrackerLocal } from "./storage.ts";
import { alertFrameBadge, badgeFor, iconSetFor, localPhase, snapshotFrom, type IdleState, type PresenceSnapshot } from "./presence.ts";
import { PRODUCT_NAME, t } from "./i18n.ts";

declare const chrome: any;

const alarmName = "ccrm-tt";
// One-shot alarm at the next presence instant (the question, then the deadline), so the badge turns on time.
const presenceAlarm = "ccrm-tt-presence";
const testAlertAlarm = "ccrm-tt-test-end";
const QUESTION_NOTIFICATION_ID = "ccrm-presence-question";
const FEEDBACK_NOTIFICATION_ID = "ccrm-action-feedback";
const CONTEXT_MENU_START_ID = "ccrm-start-page";

let creatingOffscreen: Promise<void> | null = null;

async function hasOffscreenDocument(): Promise<boolean> {
  if (!chrome.runtime?.getContexts) return false;
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL("offscreen.html")],
    });
    return Array.isArray(contexts) && contexts.length > 0;
  } catch {
    return false;
  }
}

async function ensureOffscreenDocument(): Promise<boolean> {
  if (!chrome.offscreen?.createDocument) return false;
  if (await hasOffscreenDocument()) return true;
  if (creatingOffscreen) {
    await creatingOffscreen;
    return hasOffscreenDocument();
  }
  creatingOffscreen = (async () => {
    try {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Drive the 50-minute timer check-in pulse and two-tone chime alert.",
      });
    } catch {
      // Ignore if already created concurrently
    } finally {
      creatingOffscreen = null;
    }
  })();
  await creatingOffscreen;
  return hasOffscreenDocument();
}

async function closeOffscreenDocument(): Promise<void> {
  if (!chrome.offscreen?.closeDocument) return;
  try {
    await chrome.runtime.sendMessage({ type: "offscreen-alert-stop" });
  } catch {
    // Ignore when offscreen is not running
  }
  if (await hasOffscreenDocument()) {
    try {
      await chrome.offscreen.closeDocument();
    } catch {
      // Ignore close race
    }
  }
}

async function setWindowAttention(active: boolean): Promise<void> {
  if (!chrome.windows?.getAll || !chrome.windows?.update) return;
  try {
    const windows = await chrome.windows.getAll({ windowTypes: ["normal", "popup"] });
    for (const win of windows || []) {
      if (win?.id) {
        await chrome.windows.update(win.id, { drawAttention: active }).catch(() => {});
      }
    }
  } catch {
    // Ignore window attention errors
  }
}

async function showFeedbackNotification(title: string, message: string): Promise<void> {
  if (!chrome.notifications?.create) return;
  try {
    await chrome.notifications.create(FEEDBACK_NOTIFICATION_ID, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/running-128.png"),
      title,
      message,
      priority: 1,
    });
    window.setTimeout?.(() => {
      void chrome.notifications?.clear?.(FEEDBACK_NOTIFICATION_ID);
    }, 4500);
  } catch {
    // Notifications disabled or unavailable
  }
}

async function configureSidePanel(): Promise<void> {
  try {
    await chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
  } catch {
    // Ignore on Chrome versions without sidePanel
  }
}

async function openConfirmationWidget(): Promise<void> {
  try {
    const windows = await chrome.windows.getAll({ populate: false, windowTypes: ["normal"] });
    const focused = (windows || []).find((w: any) => w.focused) || (windows || [])[0];
    if (focused?.id) {
      await chrome.windows.update(focused.id, { focused: true }).catch(() => {});
      if (chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ windowId: focused.id });
        return;
      }
    }
  } catch {
    // Fall back to floating confirmation mini-window if sidePanel.open cannot run without a user gesture
  }
  await openAlertMiniWindow();
}

async function openAlertMiniWindow(): Promise<void> {
  if (!chrome.windows?.create) return;
  const alertUrl = chrome.runtime.getURL("alert.html");
  try {
    const existing = await chrome.windows.getAll({ populate: true, windowTypes: ["popup"] });
    const match = (existing || []).find((w: any) =>
      (w.tabs || []).some((tab: any) => String(tab.url || "").startsWith(alertUrl))
    );
    if (match?.id) {
      await chrome.windows.update(match.id, { focused: true, drawAttention: true });
      return;
    }
    await chrome.windows.create({
      url: alertUrl,
      type: "popup",
      width: 390,
      height: 460,
      focused: true,
    });
  } catch {
    // Ignore window creation failure
  }
}

function paint(startedAt: string | null): void {
  if (!startedAt) {
    chrome.action.setBadgeText({ text: "" });
    void chrome.action.setIcon?.({ path: iconSetFor("icon") });
    return;
  }
  const sec = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  chrome.action.setBadgeText({ text: badgeLabel(sec) });
  chrome.action.setBadgeBackgroundColor({ color: "#e11d48" });
  void chrome.action.setIcon?.({ path: iconSetFor("running") });
}

const elapsedLabel = (startedAt: string) => badgeLabel(Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000)));

/** Paint the badge & toolbar icon from the last server answer and idle state. */
function paintSnapshot(snapshot: PresenceSnapshot | null, idle: IdleState): void {
  const phase = localPhase(snapshot, idle);
  const badge = badgeFor(snapshot, phase, elapsedLabel);
  chrome.action.setBadgeText({ text: badge.text });
  chrome.action.setBadgeBackgroundColor({ color: badge.color });
  if (phase === "question") {
    void chrome.action.setIcon?.({ path: iconSetFor("alert-0") });
  } else if ((snapshot?.count || 0) > 0 && phase === "tracking") {
    void chrome.action.setIcon?.({ path: iconSetFor("running") });
  } else {
    void chrome.action.setIcon?.({ path: iconSetFor("icon") });
  }
}

async function syncQuestionAlert(state: TrackerLocal, idle: IdleState): Promise<void> {
  const testActive = Boolean(state.testAlertUntil && state.testAlertUntil > Date.now());
  const phase = localPhase(state.snapshot, idle);
  const questionActive = testActive || (phase === "question" && state.snapshot?.presence?.enabled !== false);

  if (!questionActive) {
    await closeOffscreenDocument();
    if (chrome.notifications?.clear) {
      await chrome.notifications.clear(QUESTION_NOTIFICATION_ID).catch(() => {});
    }
    await setWindowAttention(false);
    if (state.testAlertUntil && state.testAlertUntil <= Date.now()) {
      await saveLocal({ testAlertUntil: null });
    }
    return;
  }

  const deadlineIso = state.snapshot?.presence?.deadlineAt;
  const deadlineMs = testActive
    ? (state.testAlertUntil as number)
    : deadlineIso
      ? Date.parse(deadlineIso) - (state.snapshot?.offsetMs || 0)
      : 0;

  if (chrome.notifications?.create) {
    const timeNote = deadlineMs > Date.now()
      ? t(
          `Confirm in ${PRODUCT_NAME} widget before ${new Date(deadlineMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} or timers will auto-pause.`,
          `Potvrďte v miniaplikácii ${PRODUCT_NAME} do ${new Date(deadlineMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}, inak sa časovače pozastavia.`,
          `Erősítse meg a ${PRODUCT_NAME} ablakban ${new Date(deadlineMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}-ig, különben az időzítők szünetelnek.`
        )
      : t(
          `Confirm in the ${PRODUCT_NAME} timer widget that you are still working.`,
          `Potvrďte v časovači ${PRODUCT_NAME}, že stále pracujete.`,
          `Erősítse meg a ${PRODUCT_NAME} időzítőben, hogy még dolgozik.`
        );
    await chrome.notifications.create(QUESTION_NOTIFICATION_ID, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/alert-2-128.png"),
      title: t("Still working? (50-min check-in)", "Stále pracujete? (50-min kontrola)", "Még dolgozik? (50 perces ellenőrzés)"),
      message: timeNote,
      priority: 2,
      requireInteraction: true,
    }).catch(() => {});
  }

  if (state.prefs.flashWindow) {
    await setWindowAttention(true);
  }

  const anchorKey = testActive ? "test" : String(state.snapshot?.presence?.anchorAt || state.snapshot?.presence?.promptAt || "active");
  if (!testActive && state.prefs.autoPopoutAlert && state.popoutShownForAnchor !== anchorKey) {
    await saveLocal({ popoutShownForAnchor: anchorKey });
    await openAlertMiniWindow();
  }

  const ready = await ensureOffscreenDocument();
  if (ready) {
    await chrome.runtime.sendMessage({
      type: "offscreen-alert-start",
      deadlineAtMs: deadlineMs,
      soundEnabled: state.prefs.soundEnabled,
      soundVolume: state.prefs.soundVolume,
      playNow: true,
    }).catch(() => {});
  }
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
  const idle = await idleNow(state);
  if (!state.deviceKey) {
    paint(null);
    await syncQuestionAlert(state, idle);
    return;
  }
  if (state.queue.length > 0) {
    paint(state.optimistic?.startedAt ?? null);
    await syncQuestionAlert(state, idle);
    return;
  }
  paintSnapshot(state.snapshot, idle);
  await syncQuestionAlert(state, idle);
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
  const idle = await idleNow(state);
  if (!state.deviceKey) {
    paint(null);
    await syncQuestionAlert(state, idle);
    return;
  }
  state = await flush(state);
  if (!state.deviceKey) {
    paint(null);
    await syncQuestionAlert(state, idle);
    return;
  }
  if (state.queue.length > 0) {
    paint(state.optimistic?.startedAt ?? null);
    await syncQuestionAlert(state, idle);
  } else {
    try {
      const res = await trackerCall(state.ccrmUrl, state.deviceKey, "GET", "running");
      const snapshot = snapshotFrom(res);
      const nextState = await saveLocal({ snapshot });
      paintSnapshot(snapshot, idle);
      await armPresenceAlarm(snapshot);
      await syncQuestionAlert(nextState, idle);
    } catch (error) {
      if (error instanceof TrackerError && error.code === "not_paired") {
        const nextState = await saveLocal({ deviceKey: "", userName: "", optimistic: null, snapshot: null });
        paint(null);
        await syncQuestionAlert(nextState, idle);
        return;
      }
      // Offline: the last answer and the clock (paused past the deadline while idle or locked).
      if (state.optimistic) paint(state.optimistic.startedAt);
      else paintSnapshot(state.snapshot, idle);
      await syncQuestionAlert(state, idle);
    }
  }
  await sample();
}

function registerContextMenus(): void {
  if (!chrome.contextMenus?.removeAll || !chrome.contextMenus?.create) return;
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: CONTEXT_MENU_START_ID,
        title: t(`Start ${PRODUCT_NAME} timer for this page`, `Spustiť ${PRODUCT_NAME} časovač pre túto stránku`, `${PRODUCT_NAME} időzítő indítása ehhez az oldalhoz`),
        contexts: ["page", "selection"],
      });
    });
  } catch {
    // Ignore context menu errors
  }
}

async function ensureAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(alarmName);
  if (!existing) await chrome.alarms.create(alarmName, { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(() => {
  void configureSidePanel();
  registerContextMenus();
  void ensureAlarm().then(tick);
});
chrome.runtime.onStartup.addListener(() => {
  void configureSidePanel();
  registerContextMenus();
  void ensureAlarm().then(tick);
});
chrome.alarms.onAlarm.addListener((alarm: { name: string }) => {
  if (alarm.name === alarmName) void tick();
  if (alarm.name === testAlertAlarm) {
    void saveLocal({ testAlertUntil: null }).then(() => paintLocal());
  }
  if (alarm.name === presenceAlarm) {
    // The question or the deadline is due: repaint + start pulsing at once, then confirm with server.
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

// TT2 Decision C9: clicking notification focuses Chrome and opens the timer widget so developer clicks "Still working".
chrome.notifications?.onClicked?.addListener((notificationId: string) => {
  if (notificationId === QUESTION_NOTIFICATION_ID) {
    void openConfirmationWidget();
  }
});

chrome.contextMenus?.onClicked?.addListener(async (info: any, tab: any) => {
  if (info?.menuItemId !== CONTEXT_MENU_START_ID) return;
  const state = await loadLocal();
  if (!state.deviceKey || !state.ccrmUrl) {
    await openConfirmationWidget();
    return;
  }
  const host = tab?.url ? hostOnly(tab.url) : "";
  const description = String(info?.selectionText || tab?.title || host || t("Page work", "Práca na stránke", "Oldalon végzett munka")).trim().slice(0, 200);
  let projectId = "";
  let projectName = "";
  if (host) {
    try {
      const res = await trackerCall(state.ccrmUrl, state.deviceKey, "GET", "projects", {}, { host });
      const suggested = (res.projects || []).find((p: any) => p.suggested);
      if (suggested) {
        projectId = suggested.id;
        projectName = suggested.name;
      }
    } catch {
      // Optional project lookup
    }
  }
  try {
    const mode = state.prefs.defaultStartMode === "parallel" ? "parallel" : "switch";
    await trackerCall(state.ccrmUrl, state.deviceKey, "POST", "start", {
      description,
      ...(projectId ? { projectId } : {}),
      startedAt: new Date().toISOString(),
      mode,
    });
    await tick();
    await showFeedbackNotification(
      t("Timer started", "Časovač spustený", "Időzítő elindítva"),
      projectName ? `${description} · ${projectName}` : description
    );
  } catch (error) {
    const msg = error instanceof TrackerError ? error.code : "offline";
    await showFeedbackNotification(t("Could not start timer", "Časovač sa nepodarilo spustiť", "Az időzítő indítása sikertelen"), msg);
  }
});

chrome.commands?.onCommand?.addListener(async (command: string) => {
  if (command !== "quick-confirm-or-toggle") return;
  const state = await loadLocal();
  if (!state.deviceKey || !state.ccrmUrl) {
    await openConfirmationWidget();
    return;
  }
  const phase = localPhase(state.snapshot, await idleNow(state));
  if (phase === "question") {
    try {
      await trackerCall(state.ccrmUrl, state.deviceKey, "POST", "confirm", {});
      await tick();
      await showFeedbackNotification(
        t("Check-in confirmed", "Prítomnosť potvrdená", "Munka megerősítve"),
        t("Your timers keep running for another 50 minutes.", "Vaše časovače bežia ďalších 50 minút.", "Az időzítők további 50 percig futnak.")
      );
    } catch {
      await openConfirmationWidget();
    }
    return;
  }
  if ((state.snapshot?.count || 0) > 0) {
    try {
      await trackerCall(state.ccrmUrl, state.deviceKey, "POST", "pause", { all: true });
      await tick();
      await showFeedbackNotification(
        t("Timer paused", "Časovač pozastavený", "Időzítő szüneteltetve"),
        t("Use the extension popup to resume.", "Na pokračovanie použite rozšírenie.", "A folytatáshoz használja a bővítményt.")
      );
    } catch {
      await openConfirmationWidget();
    }
    return;
  }
  await openConfirmationWidget();
});

chrome.runtime.onMessage.addListener((message: any, _sender: unknown, sendResponse: (value: unknown) => void) => {
  if (message?.type === "refresh") {
    void saveLocal({ testAlertUntil: null }).then(() => tick()).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "pulse-frame") {
    void (async () => {
      const state = await loadLocal();
      const idle = await idleNow(state);
      const testActive = Boolean(state.testAlertUntil && state.testAlertUntil > Date.now());
      const phase = localPhase(state.snapshot, idle);
      if (!testActive && phase !== "question") {
        await syncQuestionAlert(state, idle);
        sendResponse({ ok: false });
        return;
      }
      const deadlineMs = testActive
        ? (state.testAlertUntil as number)
        : state.snapshot?.presence?.deadlineAt
          ? Date.parse(state.snapshot.presence.deadlineAt) - (state.snapshot.offsetMs || 0)
          : Number.NaN;
      const remainingMs = Number.isFinite(deadlineMs) ? Math.max(0, deadlineMs - Date.now()) : null;
      const badge = alertFrameBadge(Number(message.frame) || 0, remainingMs);
      chrome.action.setBadgeText({ text: badge.text });
      chrome.action.setBadgeBackgroundColor({ color: badge.color });
      void chrome.action.setIcon?.({ path: iconSetFor(badge.iconPrefix) });
      if (message.reAttention && state.prefs.flashWindow) {
        await setWindowAttention(true);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (message?.type === "test-alert") {
    void (async () => {
      const until = Date.now() + 10_000;
      await chrome.alarms.clear(testAlertAlarm);
      await chrome.alarms.create(testAlertAlarm, { when: until });
      await saveLocal({ testAlertUntil: until });
      await paintLocal();
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (message?.type === "stop-test-alert") {
    void (async () => {
      await chrome.alarms.clear(testAlertAlarm);
      await saveLocal({ testAlertUntil: null });
      await paintLocal();
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (message?.type === "prefs-updated") {
    void paintLocal().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

void configureSidePanel();
void ensureAlarm();
