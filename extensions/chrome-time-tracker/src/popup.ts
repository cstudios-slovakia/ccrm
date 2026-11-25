import "./popup.css";
import { EXTENSION_VERSION, badgeLabel, hostOnly } from "../../../src/utils/timeTrackerRules.ts";
import { TrackerError, trackerCall } from "./client.ts";
import { loadLocal, saveLocal, type ExtensionPrefs, type QueueItem } from "./storage.ts";
import { PRODUCT_NAME, errorMessage, t } from "./i18n.ts";
import { formatClock, formatCountdown, serverOffset, timeOfDay, type PresenceState } from "./presence.ts";

declare const chrome: any;

const app = document.querySelector("#app") as HTMLElement;
const isAlertWindow = app?.dataset?.mode === "alert";
const esc = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] || ch));

let clock: number | undefined;
let questionClock: number | undefined;
let signedInName = "";
let settingsOpen = false;
let startFormExpanded = false;
let editingEntryId: string | null = null;
let startModeChoice: "switch" | "parallel" = "switch";
let activeTab: "time" | "tasks" = "time";
let taskFilter: "mine" | "all" = "mine";
let taskSearch = "";
let panelTasks: any[] = [];
const collapsedBuckets = new Set<string>(["tomorrow", "upcoming"]);
let bucketTouched = false;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

const PLAY = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor"/></svg>`;
const PAUSE = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><rect x="2.2" y="2" width="2.6" height="8" rx="0.8" fill="currentColor"/><rect x="7.2" y="2" width="2.6" height="8" rx="0.8" fill="currentColor"/></svg>`;
const SQUARE = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor"/></svg>`;
const GEAR = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M9.4 1.6a1.4 1.4 0 0 0-2.8 0l-.2.9a5.2 5.2 0 0 0-1.2.7l-.9-.3a1.4 1.4 0 0 0-1.4 2.4l.7.6a5.4 5.4 0 0 0 0 1.4l-.7.6a1.4 1.4 0 0 0 1.4 2.4l.9-.3c.4.3.8.5 1.2.7l.2.9a1.4 1.4 0 0 0 2.8 0l.2-.9c.4-.2.8-.4 1.2-.7l.9.3a1.4 1.4 0 0 0 1.4-2.4l-.7-.6a5.4 5.4 0 0 0 0-1.4l.7-.6a1.4 1.4 0 0 0-1.4-2.4l-.9.3a5.2 5.2 0 0 0-1.2-.7l-.2-.9zM8 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>`;
const EDIT = `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M11.8 2.2a1.4 1.4 0 0 1 2 2L5.7 12.3 2.5 13l.7-3.2 8.6-7.6z"/></svg>`;

interface Capabilities {
  parallelAllowed: boolean;
  maxParallel: number;
  sameProject: string;
  presenceMinutes: number;
}

interface Extras {
  presence: PresenceState | null;
  paused: any[];
  offsetMs: number;
  ccrmUrl: string;
  capabilities: Capabilities;
  testAlertUntil: number | null;
}

const defaultCaps = (): Capabilities => ({
  parallelAllowed: false,
  maxParallel: 4,
  sameProject: "differentTasks",
  presenceMinutes: 50,
});

const noExtras = (ccrmUrl: string): Extras => ({
  presence: null,
  paused: [],
  offsetMs: 0,
  ccrmUrl,
  capabilities: defaultCaps(),
  testAlertUntil: null,
});

function header(todaySeconds: number | null, paired = true): string {
  const today = todaySeconds === null ? "" : `<span class="muted">${esc(t("Today", "Dnes", "Ma"))} ${esc(badgeLabel(todaySeconds))}</span>`;
  const avatar = initials(signedInName) ? `<span class="avatar" title="${esc(signedInName)}">${esc(initials(signedInName))}</span>` : "";
  const gear = paired
    ? `<button id="toggle-settings" class="icon-btn ${settingsOpen ? "active" : ""}" type="button" title="${esc(t("Extension settings", "Nastavenia rozšírenia", "Bővítmény beállítások"))}" aria-label="${esc(t("Settings", "Nastavenia", "Beállítások"))}">${GEAR}</button>`
    : "";
  return `<div class="head"><strong class="brand">${esc(PRODUCT_NAME)}</strong><span class="head-end">${today}${avatar}${gear}</span></div>`;
}

function originOf(input: string): string | null {
  try {
    const url = new URL(input.includes("://") ? input : `https://${input}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function osName(): string {
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown";
}

async function refreshBadge(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: "refresh" });
  } catch {
    /* worker wakes on alarm */
  }
}

async function enqueue(item: Omit<QueueItem, "id">, optimistic: { startedAt: string; title: string; projectName: string; taskTitle: string } | null): Promise<void> {
  const state = await loadLocal();
  await saveLocal({
    queue: [...state.queue, { ...item, id: crypto.randomUUID() }].slice(-50),
    optimistic,
  });
  await refreshBadge();
}

function footer(unsorted: number, ccrmUrl: string): string {
  const link = `<a href="${esc(ccrmUrl)}/#time-tracking" target="_blank" rel="noreferrer">${esc(t(`Open ${PRODUCT_NAME}`, `Otvoriť ${PRODUCT_NAME}`, `${PRODUCT_NAME} megnyitása`))}</a>`;
  const count = unsorted > 0 ? `<span class="unsorted">${esc(unsorted)} ${esc(t("unsorted", "nezaradené", "rendezetlen"))}</span>` : "<span></span>";
  return `<div class="footer">${link}${count}</div>`;
}

function renderPair(error = ""): void {
  window.clearInterval(clock);
  window.clearInterval(questionClock);
  app.innerHTML = `
    ${header(null, false)}
    <div class="body stack">
      <h1>${esc(t(`Connect to ${PRODUCT_NAME}`, `Pripojiť k ${PRODUCT_NAME}`, `Csatlakozás: ${PRODUCT_NAME}`))}</h1>
      <label>${esc(t(`${PRODUCT_NAME} address`, `Adresa ${PRODUCT_NAME}`, `${PRODUCT_NAME} címe`))}
        <div class="row">
          <input id="url" placeholder="https://crm.example.com" autocomplete="url" />
          <button id="use-tab" class="tiny" type="button" title="${esc(t("Use open tab URL", "Použiť URL otvorenej karty", "Aktuális fül címe"))}">${esc(t("Tab", "Karta", "Fül"))}</button>
        </div>
      </label>
      <label>${esc(t("Pairing code", "Párovací kód", "Párosítási kód"))}<input id="code" class="mono" placeholder="K7Q4-9MZT" autocapitalize="characters" /></label>
      ${error ? `<p class="error">${esc(error)}</p>` : ""}
      <button id="connect" class="primary wide" type="button">${esc(t("Connect", "Pripojiť", "Csatlakozás"))}</button>
      <p class="muted">${esc(t(`Get a one-time pairing code in ${PRODUCT_NAME} under Time tracking → Chrome extension (or Settings → Time tracking).`, `Jednorazový párovací kód získate v ${PRODUCT_NAME} v Evidencia času → Rozšírenie Chrome (alebo Nastavenia → Evidencia času).`, `Az egyszer használatos kódot a ${PRODUCT_NAME} Időkövetés → Chrome-bővítmény alatt (vagy a Beállításokban) találja.`))}</p>
    </div>`;
  void loadLocal().then((state) => {
    const url = app.querySelector("#url") as HTMLInputElement;
    if (state.ccrmUrl) url.value = state.ccrmUrl;
  });
  app.querySelector("#use-tab")?.addEventListener("click", async () => {
    try {
      const granted = await chrome.permissions.request({ permissions: ["tabs"] });
      if (!granted) return;
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const origin = originOf(tabs?.[0]?.url || "");
      if (origin) (app.querySelector("#url") as HTMLInputElement).value = origin;
    } catch {
      /* ignore */
    }
  });
  app.querySelector("#connect")?.addEventListener("click", () => void connect());
}

async function connect(): Promise<void> {
  const url = originOf((app.querySelector("#url") as HTMLInputElement).value.trim());
  const code = (app.querySelector("#code") as HTMLInputElement).value.trim();
  if (!url) {
    renderPair(t(`Enter a full ${PRODUCT_NAME} address.`, `Zadajte celú adresu ${PRODUCT_NAME}.`, `Adja meg a ${PRODUCT_NAME} teljes címét.`));
    return;
  }
  const button = app.querySelector("#connect") as HTMLButtonElement;
  button.disabled = true;
  try {
    const granted = await chrome.permissions.request({ origins: [`${url}/*`] });
    if (!granted) {
      renderPair(t("Chrome needs permission to reach that address.", "Chrome potrebuje povolenie na prístup k tejto adrese.", "A Chrome-nak engedély kell a cím eléréséhez."));
      return;
    }
    const paired = await trackerCall(url, "", "POST", "pair", {
      code,
      deviceName: `Chrome on ${osName()}`,
      browser: "Chrome",
      os: osName(),
      version: EXTENSION_VERSION,
    });
    await saveLocal({ ccrmUrl: url, deviceKey: paired.deviceKey, userName: paired.user?.name || "", queue: [], optimistic: null });
    await refreshBadge();
    await showTracker();
  } catch (error) {
    const codeName = error instanceof TrackerError ? error.code : "offline";
    renderPair(errorMessage(codeName === "not_paired" ? "code_invalid" : codeName));
  }
}

async function showTracker(): Promise<void> {
  const state = await loadLocal();
  signedInName = state.userName || "";
  if (state.prefs.defaultStartMode === "parallel") startModeChoice = "parallel";
  if (!state.deviceKey || !state.ccrmUrl) {
    settingsOpen = false;
    renderPair(state.lost.length ? t("This browser is not paired. The actions below were not saved.", "Tento prehliadač nie je spárovaný. Akcie nižšie neboli uložené.", "Ez a böngésző nincs párosítva. Az alábbi műveletek nem lettek mentve.") : "");
    if (state.lost.length) renderLost(state.lost);
    return;
  }

  if (settingsOpen) {
    let rules = { enabled: false };
    try {
      rules = await trackerCall(state.ccrmUrl, state.deviceKey, "GET", "rules");
    } catch {
      /* offline */
    }
    renderSettingsView(state, !!rules.enabled);
    return;
  }

  try {
    const [running, recent, count, rules, myTasksRes] = await Promise.all([
      trackerCall(state.ccrmUrl, state.deviceKey, "GET", "running"),
      trackerCall(state.ccrmUrl, state.deviceKey, "GET", "recent"),
      trackerCall(state.ccrmUrl, state.deviceKey, "GET", "unsortedCount"),
      trackerCall(state.ccrmUrl, state.deviceKey, "GET", "rules"),
      trackerCall(state.ccrmUrl, state.deviceKey, "GET", "myTasks", {}, {}).catch(() => ({ tasks: [] })),
    ]);
    panelTasks = Array.isArray(myTasksRes?.tasks) ? myTasksRes.tasks : [];
    const items: any[] = state.optimistic
      ? [{ id: "", running: true, title: state.optimistic.title, projectName: state.optimistic.projectName, startAt: state.optimistic.startedAt, taskId: state.optimistic.taskTitle ? "local" : null, titleSource: "entry", billable: true }]
      : Array.isArray(running.running) && running.running.length > 0
        ? running.running
        : running.entry?.running
          ? [running.entry]
          : [];

    const caps: Capabilities = running.capabilities && typeof running.capabilities === "object"
      ? {
          parallelAllowed: Boolean(running.capabilities.parallelAllowed),
          maxParallel: Number(running.capabilities.maxParallel) || 4,
          sameProject: String(running.capabilities.sameProject || "differentTasks"),
          presenceMinutes: Number(running.capabilities.presenceMinutes) || 50,
        }
      : defaultCaps();

    if (!caps.parallelAllowed) startModeChoice = "switch";

    const extras: Extras = {
      presence: running.presence && typeof running.presence.phase === "string" ? running.presence : null,
      paused: Array.isArray(running.paused) ? running.paused : [],
      offsetMs: serverOffset(running.serverNow),
      ccrmUrl: state.ccrmUrl,
      capabilities: caps,
      testAlertUntil: state.testAlertUntil,
    };

    renderMainView({
      items,
      workedTodaySeconds: Number(running.workedTodaySeconds ?? recent.todaySeconds ?? 0),
      recent: recent.entries || [],
      unsorted: count.count || 0,
      rulesEnabled: !!rules.enabled,
      ccrmUrl: state.ccrmUrl,
      offline: false,
      extras,
    });
  } catch (error) {
    if (error instanceof TrackerError && error.code === "not_paired") {
      const lost = (await loadLocal()).lost;
      signedInName = "";
      await saveLocal({ deviceKey: "", userName: "", optimistic: null, snapshot: null });
      renderPair(t("This browser was revoked. Pair it again.", "Tomuto prehliadaču bol prístup odobratý. Spárujte ho znova.", "Ennek a böngészőnek a hozzáférését visszavonták. Párosítsa újra."));
      if (lost.length) renderLost(lost);
      return;
    }
    if (error instanceof TrackerError && error.code === "offline") {
      const items = state.optimistic
        ? [{ id: "", running: true, title: state.optimistic.title, projectName: state.optimistic.projectName, startAt: state.optimistic.startedAt, titleSource: "entry", billable: true }]
        : [];
      renderMainView({
        items,
        workedTodaySeconds: 0,
        recent: [],
        unsorted: 0,
        rulesEnabled: false,
        ccrmUrl: state.ccrmUrl,
        offline: true,
        extras: noExtras(state.ccrmUrl),
      });
      return;
    }
    renderPair(error instanceof TrackerError ? errorMessage(error.code) : t(`Could not reach ${PRODUCT_NAME}.`, `${PRODUCT_NAME} nie je dostupný.`, `A ${PRODUCT_NAME} nem érhető el.`));
  }
}

function renderSettingsView(state: Awaited<ReturnType<typeof loadLocal>>, captureEnabled: boolean): void {
  window.clearInterval(clock);
  window.clearInterval(questionClock);
  const { prefs, testAlertUntil, ccrmUrl } = state;
  const testing = Boolean(testAlertUntil && testAlertUntil > Date.now());
  app.innerHTML = `
    ${header(null)}
    <div class="body stack">
      <div class="spread">
        <h1>${esc(t("Extension settings", "Nastavenia rozšírenia", "Bővítmény beállítások"))}</h1>
        <button id="back-tracker" class="tiny" type="button">${esc(t("Back", "Späť", "Vissza"))}</button>
      </div>
      <div class="card stack">
        <span class="section-label">${esc(t("50-minute check-in alert", "50-minútové upozornenie", "50 perces ellenőrzés"))}</span>
        <label class="check"><input id="pref-flash" type="checkbox" ${prefs.flashWindow ? "checked" : ""} /> ${esc(t("Pulse icon & flash Chrome taskbar/dock", "Pulzovať ikonu a blikať okno Chrome", "Ikon és Chrome tálca/dock villogtatása"))}</label>
        <label class="check"><input id="pref-sound" type="checkbox" ${prefs.soundEnabled ? "checked" : ""} /> ${esc(t("Play two-tone chime", "Prehrať zvukový signál", "Hangjelzés lejátszása"))}</label>
        <label>${esc(t("Chime volume", "Hlasitosť signálu", "Hangerő"))}
          <input id="pref-vol" type="range" min="10" max="100" value="${Math.round((prefs.soundVolume ?? 0.7) * 100)}" />
        </label>
        <label class="check"><input id="pref-popout" type="checkbox" ${prefs.autoPopoutAlert ? "checked" : ""} /> ${esc(t("Auto-open mini confirmation window at 50 min", "Automaticky otvoriť mini okno po 50 min", "Mini megerősítő ablak automatikus megnyitása 50 perc után"))}</label>
        <div class="row">
          <button id="test-alert" class="${testing ? "tiny danger wide" : "tiny wide"}" type="button">
            ${testing ? esc(t("Stop pulse test", "Zastaviť test pulzu", "Teszt leállítása")) : esc(t("Test 50-min pulse alert (10s)", "Otestovať 50-min pulz (10s)", "50 perces pulzus teszt (10 mp)"))}
          </button>
        </div>
      </div>

      <div class="card stack">
        <span class="section-label">${esc(t("Timers & Shortcuts", "Časovače a skratky", "Időzítők és billentyűparancsok"))}</span>
        <label>${esc(t("Default when another timer runs", "Predvolené pri bežiacom časovači", "Alapértelmezett mód futó időzítő esetén"))}
          <select id="pref-mode">
            <option value="switch" ${prefs.defaultStartMode === "switch" ? "selected" : ""}>${esc(t("Switch (stop previous)", "Prepnúť (zastaviť predchádzajúci)", "Váltás (előző leállítása)"))}</option>
            <option value="parallel" ${prefs.defaultStartMode === "parallel" ? "selected" : ""}>${esc(t("Run in parallel (if allowed)", "Spustiť paralelne (ak je povolené)", "Párhuzamos indítás (ha engedélyezett)"))}</option>
          </select>
        </label>
        <label class="check"><input id="pref-capture" type="checkbox" ${captureEnabled ? "checked" : ""} /> ${esc(t("Remember watched sites when idle", "Sledovať vybrané stránky bez časovača", "Figyelt oldalak rögzítése üresjáratban"))}</label>
        <p class="muted">${esc(t("Shortcuts: Alt+Shift+T (open), Alt+Shift+S (confirm / pause). Right-click any page to start tracking it.", "Skratky: Alt+Shift+T (otvoriť), Alt+Shift+S (potvrdiť / pozastaviť). Pravým klikom na stránke spustíte meranie.", "Parancsok: Alt+Shift+T (megnyitás), Alt+Shift+S (megerősítés / szünet). Jobb kattintással bármely oldal mérhető."))}</p>
      </div>

      <div class="card stack">
        <span class="section-label">${esc(t("Connection", "Pripojenie", "Kapcsolat"))}</span>
        <div class="muted">${esc(ccrmUrl)} · v${esc(EXTENSION_VERSION)}</div>
        <button id="unpair" class="tiny danger wide" type="button">${esc(t("Disconnect browser", "Odpojiť prehliadač", "Böngésző leválasztása"))}</button>
      </div>
    </div>`;

  app.querySelector("#toggle-settings")?.addEventListener("click", () => {
    settingsOpen = false;
    void showTracker();
  });
  app.querySelector("#back-tracker")?.addEventListener("click", () => {
    settingsOpen = false;
    void showTracker();
  });

  const savePrefs = async (patch: Partial<ExtensionPrefs>) => {
    await saveLocal({ prefs: { ...state.prefs, ...patch } });
    await chrome.runtime.sendMessage({ type: "prefs-updated" }).catch(() => {});
  };

  app.querySelector("#pref-flash")?.addEventListener("change", (e) => void savePrefs({ flashWindow: (e.target as HTMLInputElement).checked }));
  app.querySelector("#pref-sound")?.addEventListener("change", (e) => void savePrefs({ soundEnabled: (e.target as HTMLInputElement).checked }));
  app.querySelector("#pref-vol")?.addEventListener("change", (e) => void savePrefs({ soundVolume: Number((e.target as HTMLInputElement).value) / 100 }));
  app.querySelector("#pref-popout")?.addEventListener("change", (e) => void savePrefs({ autoPopoutAlert: (e.target as HTMLInputElement).checked }));
  app.querySelector("#pref-mode")?.addEventListener("change", (e) => {
    const val = (e.target as HTMLSelectElement).value === "parallel" ? "parallel" : "switch";
    startModeChoice = val;
    void savePrefs({ defaultStartMode: val });
  });
  app.querySelector("#pref-capture")?.addEventListener("change", async (e) => {
    const box = e.target as HTMLInputElement;
    const want = box.checked;
    if (want) {
      const granted = await chrome.permissions.request({ permissions: ["tabs"] });
      if (!granted) {
        box.checked = false;
        return;
      }
    }
    try {
      await trackerCall(state.ccrmUrl, state.deviceKey, "POST", "capture", { enabled: want });
    } catch {
      box.checked = !want;
    }
  });
  app.querySelector("#test-alert")?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: testing ? "stop-test-alert" : "test-alert" });
    await showTracker();
  });
  app.querySelector("#unpair")?.addEventListener("click", async () => {
    await saveLocal({ deviceKey: "", userName: "", queue: [], optimistic: null, snapshot: null, testAlertUntil: null });
    signedInName = "";
    settingsOpen = false;
    await refreshBadge();
    renderPair();
  });
}

function renderLost(lost: QueueItem[]): void {
  const list = lost.map((item) => `<li>${esc(item.kind)} · ${esc(new Date(item.at).toLocaleString())}</li>`).join("");
  app.insertAdjacentHTML("beforeend", `<div class="amber" style="margin-top:8px"><strong>${esc(t("Not sent", "Neodoslané", "Nem elküldve"))}</strong><ul>${list}</ul><button id="clear-lost" class="tiny" type="button">${esc(t("Dismiss", "Zavrieť", "Elvetés"))}</button></div>`);
  app.querySelector("#clear-lost")?.addEventListener("click", () => {
    void saveLocal({ lost: [] }).then(() => showTracker());
  });
}

function renderMainView(opts: {
  items: any[];
  workedTodaySeconds: number;
  recent: any[];
  unsorted: number;
  rulesEnabled: boolean;
  ccrmUrl: string;
  offline: boolean;
  extras: Extras;
}): void {
  const { items, workedTodaySeconds, recent, unsorted, ccrmUrl, offline, extras } = opts;
  const loadedAt = Date.now();
  const runningCount = items.length;
  const showStartForm = runningCount === 0 || startFormExpanded;
  const totalToday = runningCount === 1
    ? workedTodaySeconds + (Number.isFinite(Date.parse(items[0].startAt)) ? Math.max(0, Math.floor((Date.now() - Date.parse(items[0].startAt)) / 1000)) : 0)
    : workedTodaySeconds;

  const singleItem = runningCount === 1 ? items[0] : null;
  const singleSub = singleItem
    ? [singleItem.projectName, singleItem.taskId && singleItem.titleSource !== "entry" ? singleItem.title : ""].filter(Boolean).join(" · ")
    : "";

  const runningHtml = singleItem
    ? `
      <div class="running-band">
        <div class="grow">
          <h1>${esc(singleItem.title || t("Running", "Beží", "Fut"))}</h1>
          <p class="project-line"><span class="dot"></span>${esc(singleSub || t("Unsorted (no project yet)", "Nezaradené (zatiaľ bez projektu)", "Rendezetlen (még nincs projekt)"))}</p>
          <div class="row" style="margin-top:4px">
            <span class="elapsed item-elapsed" data-start="${esc(singleItem.startAt)}" style="margin:0;font-size:28px">0:00:00</span>
            <span class="pill ${singleItem.billable ? "billable-on" : "billable-off"}">${singleItem.billable ? esc(t("Billable", "Fakturovateľné", "Számlázható")) : esc(t("Non-billable", "Nefakturovateľné", "Nem számlázható"))}</span>
          </div>
          ${editingEntryId === singleItem.id ? editFormHtml(singleItem) : ""}
        </div>
        <div class="stack" style="gap:6px">
          <div class="row" style="gap:6px">
            ${singleItem.id ? `<button class="round small pause pause-item" type="button" data-id="${esc(singleItem.id)}" title="${esc(t("Pause", "Pozastaviť", "Szünet"))}">${PAUSE}</button>` : ""}
            <button class="round stop stop-item" type="button" data-id="${esc(singleItem.id || "")}" title="${esc(t("Stop", "Zastaviť", "Leállítás"))}">${SQUARE}</button>
          </div>
          ${singleItem.id ? `<button class="tiny edit-toggle" type="button" data-id="${esc(singleItem.id)}">${EDIT} ${esc(t("Edit", "Upraviť", "Szerk."))}</button>` : ""}
        </div>
      </div>`
    : runningCount > 1
      ? `
        <div class="body stack" style="padding-bottom:0">
          <div class="spread">
            <h1>${esc(runningCount)} ${esc(t("timers running", "bežiacich časovačov", "futó időzítő"))}</h1>
            <span><span class="muted">${esc(t("Worked today", "Odpracované dnes", "Ma dolgozott"))}</span> <strong id="worked">${esc(formatClock(workedTodaySeconds))}</strong></span>
          </div>
          ${items.map((item) => `
            <div class="card">
              <div class="spread">
                <span class="grow">
                  <strong>${esc(item.title || t("Untitled", "Bez názvu", "Névtelen"))}</strong>
                  <br /><span class="muted">${esc(item.projectName || t("Unsorted", "Nezaradené", "Rendezetlen"))}</span>
                </span>
                <span class="item-elapsed" data-start="${esc(item.startAt)}">0:00:00</span>
                <button class="round small soft edit-toggle" type="button" data-id="${esc(item.id)}" title="${esc(t("Edit", "Upraviť", "Szerkesztés"))}">${EDIT}</button>
                <button class="round small pause pause-item" type="button" data-id="${esc(item.id)}" title="${esc(t("Pause", "Pozastaviť", "Szünet"))}">${PAUSE}</button>
                <button class="round small stop stop-item" type="button" data-id="${esc(item.id)}" title="${esc(t("Stop", "Zastaviť", "Leállítás"))}">${SQUARE}</button>
              </div>
              ${editingEntryId === item.id ? editFormHtml(item) : ""}
            </div>`).join("")}
        </div>`
      : "";

  const parallelToggleHtml = runningCount > 0 && extras.capabilities.parallelAllowed
    ? `
      <div class="segmented" role="group" aria-label="${esc(t("Start mode", "Režim spustenia", "Indítási mód"))}">
        <button id="mode-switch" class="seg-btn ${startModeChoice === "switch" ? "active" : ""}" type="button">${esc(t("Switch active", "Prepnúť aktívny", "Aktív cseréje"))}</button>
        <button id="mode-parallel" class="seg-btn ${startModeChoice === "parallel" ? "active" : ""}" type="button">${esc(t("Run in parallel", "Spustiť paralelne", "Párhuzamosan"))}</button>
      </div>`
    : "";

  const startSectionHtml = showStartForm
    ? `
      <div class="card stack" style="background:#f8fafc">
        <div class="spread">
          <span class="section-label">${esc(runningCount > 0 ? t("Start another timer", "Spustiť ďalší časovač", "Új időzítő indítása") : t("What are you working on?", "Na čom pracuješ?", "Min dolgozik?"))}</span>
          ${runningCount > 0 ? `<button id="close-start" class="tiny" type="button">${esc(t("Hide", "Skryť", "Elrejtés"))}</button>` : ""}
        </div>
        ${parallelToggleHtml}
        <input id="title" aria-label="${esc(t("Search my tasks or type description", "Hľadať úlohy alebo napísať popis", "Feladat keresése vagy leírás"))}" placeholder="${esc(t("Search open tasks or type description…", "Hľadať úlohu alebo napísať popis…", "Nyitott feladat keresése vagy leírás…"))}" autocomplete="off" />
        <div id="task-picked" class="muted" hidden></div>
        <div id="task-list" class="picker"></div>
        <input id="project" aria-label="${esc(t("Project (optional)", "Projekt (voliteľné)", "Projekt (opcionális)"))}" placeholder="${esc(t("Filter or attach project (optional)…", "Projekt (voliteľné)…", "Projekt hozzáadása (opcionális)…"))}" autocomplete="off" />
        <div id="project-list" class="picker"></div>
        <p id="form-error" class="error" hidden></p>
        <button id="start" class="primary wide" type="button">${PLAY} ${esc(runningCount > 0 && startModeChoice === "parallel" ? t("Start in parallel", "Spustiť paralelne", "Indítás párhuzamosan") : t("Start timer", "Spustiť časovač", "Időzítő indítása"))}</button>
      </div>`
    : `<button id="open-start" class="tiny wide" type="button">${PLAY} ${esc(t("Start / add another timer", "Spustiť / pridať ďalší časovač", "Új / párhuzamos időzítő indítása"))}</button>`;

  const viewTab = isAlertWindow ? "time" : activeTab;

  app.innerHTML = `
    ${header(totalToday)}
    ${!isAlertWindow ? panelTabsHtml(runningCount) : ""}
    ${checkinProgressHtml(runningCount, extras)}
    ${offline ? `<p class="amber note">${esc(t("Offline. Changes queue until back online.", "Offline. Zmeny sa odošlú po pripojení.", "Offline. A módosítások sorba állnak."))}</p>` : ""}
    <div id="notice" class="notice note"></div>
    ${extrasTop(extras) ? `<div class="body" style="padding-bottom:0">${extrasTop(extras)}</div>` : ""}
    ${viewTab === "tasks"
      ? `${tasksViewHtml(items, ccrmUrl, extras)}`
      : `${runningHtml}
        <div class="body stack">
          ${pausedRows(extras)}
          ${startSectionHtml}
          ${recentRows(recent)}
          ${footer(unsorted, ccrmUrl)}
        </div>`}`;

  const paintClocks = () => {
    const worked = app.querySelector("#worked");
    if (worked) worked.textContent = formatClock(workedTodaySeconds + (Date.now() - loadedAt) / 1000);
    app.querySelectorAll<HTMLElement>(".item-elapsed").forEach((cell) => {
      const started = Date.parse(cell.dataset.start || "");
      if (Number.isFinite(started)) cell.textContent = formatClock((Date.now() + extras.offsetMs - started) / 1000);
    });
  };
  paintClocks();
  window.clearInterval(clock);
  clock = window.setInterval(paintClocks, 1000);

  app.querySelector("#toggle-settings")?.addEventListener("click", () => {
    settingsOpen = true;
    void showTracker();
  });

  app.querySelector("#tab-time")?.addEventListener("click", () => {
    if (activeTab === "time") return;
    activeTab = "time";
    renderMainView(opts);
  });
  app.querySelector("#tab-tasks")?.addEventListener("click", () => {
    if (activeTab === "tasks") return;
    activeTab = "tasks";
    renderMainView(opts);
  });

  app.querySelectorAll<HTMLElement>(".stop-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id || "";
      const item = items.find((it) => String(it.id || "") === id) || items[0];
      if (item) void stop(item);
    });
  });

  app.querySelectorAll<HTMLElement>(".pause-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id || "";
      if (id) void pauseTimer(id);
    });
  });

  app.querySelectorAll<HTMLElement>(".edit-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id || "";
      editingEntryId = editingEntryId === id ? null : id;
      void showTracker();
    });
  });

  app.querySelector("#save-edit")?.addEventListener("click", () => {
    if (!editingEntryId) return;
    const note = (app.querySelector("#edit-note") as HTMLInputElement | null)?.value ?? "";
    const billable = Boolean((app.querySelector("#edit-billable") as HTMLInputElement | null)?.checked);
    const descEl = app.querySelector("#edit-desc") as HTMLInputElement | null;
    void updateRunningEntry(editingEntryId, {
      note,
      billable,
      ...(descEl ? { description: descEl.value.trim() } : {}),
    });
  });

  app.querySelector("#open-start")?.addEventListener("click", () => {
    startFormExpanded = true;
    void showTracker();
  });
  app.querySelector("#close-start")?.addEventListener("click", () => {
    startFormExpanded = false;
    void showTracker();
  });
  app.querySelector("#mode-switch")?.addEventListener("click", () => {
    startModeChoice = "switch";
    void showTracker();
  });
  app.querySelector("#mode-parallel")?.addEventListener("click", () => {
    startModeChoice = "parallel";
    void showTracker();
  });

  if (viewTab === "tasks") {
    wireTasksView(items, ccrmUrl);
  } else {
    if (showStartForm) wireStartForm();
    wireContinue(recent);
  }
  wireExtras(extras);
  wireOpen(ccrmUrl);
}

function panelTabsHtml(runningCount: number): string {
  const mineCount = panelTasks.filter((tk) => tk.mine).length;
  const openCount = panelTasks.length;
  return `
    <div class="panel-tabs" role="tablist" aria-label="${esc(t("Panel section", "Sekcia panela", "Panel szakasz"))}">
      <button id="tab-time" class="panel-tab ${activeTab === "time" ? "active" : ""}" type="button" role="tab" aria-selected="${activeTab === "time"}">
        ${esc(t("Time", "Čas", "Idő"))}
        ${runningCount > 0 ? `<span class="tab-badge">${esc(runningCount)}</span>` : ""}
      </button>
      <button id="tab-tasks" class="panel-tab ${activeTab === "tasks" ? "active" : ""}" type="button" role="tab" aria-selected="${activeTab === "tasks"}">
        ${esc(t("Tasks", "Úlohy", "Feladatok"))}
        ${openCount > 0 ? `<span class="tab-badge">${esc(taskFilter === "mine" ? mineCount : openCount)}</span>` : ""}
      </button>
    </div>`;
}

function filteredPanelTasks(): any[] {
  const q = taskSearch.trim().toLowerCase();
  return panelTasks.filter((tk) => {
    if (taskFilter === "mine" && !tk.mine) return false;
    if (!q) return true;
    return (
      String(tk.title || "").toLowerCase().includes(q) ||
      String(tk.projectName || "").toLowerCase().includes(q) ||
      String(tk.clientName || "").toLowerCase().includes(q) ||
      String(tk.status || "").toLowerCase().includes(q)
    );
  });
}

function localIsoDay(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function taskRowHtml(tk: any, items: any[], ccrmUrl: string, today: string): string {
  const runningItem = items.find((it) => String(it.taskId || "") === String(tk.id || ""));
  const deadline = String(tk.deadline || "");
  const overdue = Boolean(deadline && deadline < today);
  const highPrio = String(tk.priority || "") === "high";
  const subParts = [tk.projectName || tk.clientName, tk.status].filter(Boolean);
  const shortDate = deadline ? deadline.slice(5) : "";
  const subTitle = [tk.projectName, tk.clientName, tk.status, deadline].filter(Boolean).join(" · ");
  return `
    <div class="task-row ${runningItem ? "is-running" : ""}">
      <div class="task-row-main">
        <div class="task-row-title" title="${esc(tk.title || "")}">
          ${highPrio ? `<span class="prio-dot" title="${esc(t("High priority", "Vysoká priorita", "Magas prioritás"))}"></span>` : ""}
          <span class="task-row-title-text">${esc(tk.title || t("Untitled task", "Úloha bez názvu", "Névtelen feladat"))}</span>
        </div>
        <div class="task-row-sub" title="${esc(subTitle)}">
          ${esc(subParts.join(" · "))}${subParts.length && shortDate ? " · " : ""}${shortDate ? `<span class="${overdue ? "overdue-text" : ""}">${esc(shortDate)}</span>` : ""}
        </div>
      </div>
      <div class="task-row-acts">
        ${runningItem
          ? `<span class="item-elapsed" data-start="${esc(runningItem.startAt)}">0:00:00</span>
             <button class="mini-btn stop stop-task-btn" type="button" data-id="${esc(runningItem.id)}" title="${esc(t("Stop", "Zastaviť", "Leállítás"))}">${SQUARE}</button>`
          : `<button class="mini-btn play start-task-btn" type="button" data-task-id="${esc(tk.id)}" data-project-id="${esc(tk.projectId || "")}" data-project-name="${esc(tk.projectName || "")}" data-title="${esc(tk.title || "")}" title="${esc(t("Start timer", "Spustiť časovač", "Időzítő indítása"))}">${PLAY}</button>`}
        <a class="icon-link" href="${esc(ccrmUrl)}/#tasks" target="_blank" rel="noopener" title="${esc(t("Open in CRM", "Otvoriť v CRM", "Megnyitás a CRM-ben"))}">↗</a>
      </div>
    </div>`;
}

function filteredTasksHtml(items: any[], ccrmUrl: string): string {
  const visible = filteredPanelTasks();
  if (!visible.length) {
    return `<p class="muted" style="text-align:center;padding:12px 0">${esc(t("No matching open tasks.", "Žiadne otvorené úlohy.", "Nincs nyitott feladat."))}</p>`;
  }
  const today = localIsoDay(0);
  const tomorrow = localIsoDay(1);
  const buckets: { key: "overdue" | "today" | "tomorrow" | "upcoming"; label: string; rows: any[] }[] = [
    { key: "overdue", label: t("Overdue", "Po termíne", "Lejárt"), rows: [] },
    { key: "today", label: t("Today", "Dnes", "Ma"), rows: [] },
    { key: "tomorrow", label: t("Tomorrow", "Zajtra", "Holnap"), rows: [] },
    { key: "upcoming", label: t("Upcoming", "Nadchádzajúce", "Közelgő"), rows: [] },
  ];
  for (const tk of visible) {
    const deadline = String(tk.deadline || "");
    if (deadline && deadline < today) buckets[0].rows.push(tk);
    else if (deadline === today) buckets[1].rows.push(tk);
    else if (deadline === tomorrow) buckets[2].rows.push(tk);
    else buckets[3].rows.push(tk);
  }
  const nonEmpty = buckets.filter((b) => b.rows.length > 0);
  if (!bucketTouched && buckets[0].rows.length === 0 && buckets[1].rows.length === 0 && nonEmpty.length > 0) {
    collapsedBuckets.delete(nonEmpty[0].key);
  }
  const searching = taskSearch.trim().length > 0;
  return nonEmpty
    .map((bucket) => {
      const expanded = searching || !collapsedBuckets.has(bucket.key);
      return `
        <section class="task-bucket bucket-${bucket.key}">
          <button class="bucket-head" type="button" data-bucket="${bucket.key}" aria-expanded="${expanded}">
            <span class="bucket-head-left">
              <span>${expanded ? "▾" : "▸"}</span>
              <span>${esc(bucket.label)}</span>
            </span>
            <span class="bucket-count">${esc(bucket.rows.length)}</span>
          </button>
          ${expanded ? bucket.rows.map((tk) => taskRowHtml(tk, items, ccrmUrl, today)).join("") : ""}
        </section>`;
    })
    .join("");
}

function tasksViewHtml(items: any[], ccrmUrl: string, extras: Extras): string {
  const modeNote = items.length > 0 && extras.capabilities.parallelAllowed
    ? `<span class="muted">${esc(startModeChoice === "parallel" ? t("Starts in parallel", "Spustí sa paralelne", "Párhuzamos indítás") : t("Switches active timer", "Prepne aktívny časovač", "Aktív időzítő cseréje"))}</span>`
    : "";
  return `
    <div class="body stack">
      <div class="row">
        <input id="panel-task-search" type="search" value="${esc(taskSearch)}" placeholder="${esc(t("Search tasks or projects…", "Hľadať úlohy alebo projekty…", "Feladat vagy projekt keresése…"))}" autocomplete="off" />
        <button id="refresh-tasks" class="tiny" type="button" title="${esc(t("Refresh", "Obnoviť", "Frissítés"))}">↻</button>
      </div>
      <div class="segmented" role="group" aria-label="${esc(t("Task filter", "Filter úloh", "Feladatszűrő"))}">
        <button id="filter-mine" class="seg-btn ${taskFilter === "mine" ? "active" : ""}" type="button">${esc(t("My tasks", "Moje úlohy", "Feladataim"))}</button>
        <button id="filter-all" class="seg-btn ${taskFilter === "all" ? "active" : ""}" type="button">${esc(t("All open", "Všetky otvorené", "Összes nyitott"))}</button>
      </div>
      ${modeNote}
      <div id="tasks-list-body" class="stack">${filteredTasksHtml(items, ccrmUrl)}</div>
    </div>`;
}

function wireTasksView(items: any[], ccrmUrl: string): void {
  const bindTaskCards = () => {
    app.querySelectorAll<HTMLElement>(".bucket-head").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.bucket || "";
        if (!key) return;
        bucketTouched = true;
        if (collapsedBuckets.has(key)) collapsedBuckets.delete(key);
        else collapsedBuckets.add(key);
        const container = app.querySelector("#tasks-list-body");
        if (container) {
          container.innerHTML = filteredTasksHtml(items, ccrmUrl);
          bindTaskCards();
        }
      });
    });
    app.querySelectorAll<HTMLElement>(".start-task-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const taskId = btn.dataset.taskId || "";
        const projectId = btn.dataset.projectId || "";
        const description = btn.dataset.title || "";
        if (!taskId) return;
        void start({
          taskId,
          taskTitle: description,
          projectId,
          projectName: btn.dataset.projectName || "",
          description,
        });
      });
    });
    app.querySelectorAll<HTMLElement>(".stop-task-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id || "";
        const item = items.find((it) => String(it.id || "") === id) || items[0];
        if (item) void stop(item);
      });
    });
  };
  bindTaskCards();

  const searchInput = app.querySelector("#panel-task-search") as HTMLInputElement | null;
  searchInput?.addEventListener("input", () => {
    taskSearch = searchInput.value;
    const container = app.querySelector("#tasks-list-body");
    if (container) {
      container.innerHTML = filteredTasksHtml(items, ccrmUrl);
      bindTaskCards();
    }
  });
  app.querySelector("#filter-mine")?.addEventListener("click", () => {
    taskFilter = "mine";
    void showTracker();
  });
  app.querySelector("#filter-all")?.addEventListener("click", () => {
    taskFilter = "all";
    void showTracker();
  });
  app.querySelector("#refresh-tasks")?.addEventListener("click", () => {
    void showTracker();
  });
}

function editFormHtml(entry: any): string {
  const canRename = !entry.taskId && !entry.ticketId;
  return `
    <div class="edit-drawer">
      ${canRename ? `<input id="edit-desc" value="${esc(entry.title || "")}" placeholder="${esc(t("Description", "Popis", "Leírás"))}" />` : ""}
      <input id="edit-note" value="${esc(entry.note || "")}" placeholder="${esc(t("Add note…", "Pridať poznámku…", "Megjegyzés…"))}" />
      <div class="spread">
        <label class="check"><input id="edit-billable" type="checkbox" ${entry.billable ? "checked" : ""} /> ${esc(t("Billable", "Fakturovateľné", "Számlázható"))}</label>
        <button id="save-edit" class="tiny primary" type="button" style="color:white">${esc(t("Save", "Uložiť", "Mentés"))}</button>
      </div>
    </div>`;
}

function checkinProgressHtml(runningCount: number, extras: Extras): string {
  const p = extras.presence;
  if (!runningCount || !p || p.enabled === false || p.phase !== "tracking" || !p.promptAt) return "";
  const totalMs = (extras.capabilities.presenceMinutes || 50) * 60_000;
  const promptMs = Date.parse(p.promptAt) - extras.offsetMs;
  const leftMs = Math.max(0, promptMs - Date.now());
  const minsLeft = Math.max(1, Math.ceil(leftMs / 60_000));
  const pct = Math.max(5, Math.min(100, Math.round(((totalMs - leftMs) / totalMs) * 100)));
  return `
    <div class="checkin-bar">
      <div class="spread">
        <span>${esc(t("Next presence check-in", "Ďalšia kontrola prítomnosti", "Következő jelenléti ellenőrzés"))}</span>
        <strong>${esc(t(`in ${minsLeft}m`, `o ${minsLeft} min`, `${minsLeft} perc múlva`))}</strong>
      </div>
      <div class="checkin-track"><div class="checkin-fill" style="width:${pct}%"></div></div>
    </div>`;
}

function extrasTop(extras: Extras): string {
  const p = extras.presence;
  const testActive = Boolean(extras.testAlertUntil && extras.testAlertUntil > Date.now());
  if ((p?.phase === "question" && p.enabled !== false) || testActive) {
    const deadlineText = testActive
      ? t("Previewing 50-minute pulse & chime alert.", "Náhľad 50-minútového pulzného upozornenia.", "50 perces pulzus és hangjelzés előnézet.")
      : t(
          `Confirm before ${timeOfDay(p?.deadlineAt)} or running timers will pause.`,
          `Potvrďte do ${timeOfDay(p?.deadlineAt)}, inak sa časovače pozastavia.`,
          `Erősítse meg ${timeOfDay(p?.deadlineAt)}-ig, különben az időzítők leállnak.`
        );
    return `
      <div class="question" role="alert">
        <div class="spread"><strong>${esc(t("Still working?", "Stále pracujete?", "Még dolgozik?"))}</strong><span class="countdown" id="countdown"></span></div>
        <p class="muted" style="margin:0;color:#92400e">${esc(deadlineText)}</p>
        <button id="confirm" class="primary wide" type="button">${esc(testActive ? t("Stop alert preview", "Zastaviť ukážku", "Előnézet leállítása") : t("Still working — keep running", "Áno, pracujem — pokračovať", "Igen, dolgozom — folytatás"))}</button>
      </div>`;
  }
  if (p?.phase === "paused") {
    const how = extras.paused.length ? t("resume below or open app", "obnovte nižšie alebo v aplikácii", "folytassa alább vagy az alkalmazásban") : t("open the app to resume", "obnovte v aplikácii", "folytassa az alkalmazásban");
    return `<div class="paused-banner"><strong>${esc(t(`Paused at ${timeOfDay(p.autoPausedAt)}`, `Pozastavené o ${timeOfDay(p.autoPausedAt)}`, `Szüneteltetve: ${timeOfDay(p.autoPausedAt)}`))}</strong> · ${esc(how)}</div>`;
  }
  return "";
}

function pausedRows(extras: Extras): string {
  if (!extras.paused.length) return "";
  const rows = extras.paused
    .map(
      (item, index) => `
    <div class="card spread">
      <span class="grow">${esc(item.title || t("Untitled", "Bez názvu", "Névtelen"))}<br /><span class="muted">${esc(item.projectName || t("Unsorted", "Nezaradené", "Rendezetlen"))} · ${esc(t(`paused ${timeOfDay(item.pausedAt)}`, `pozastavené ${timeOfDay(item.pausedAt)}`, `szüneteltetve ${timeOfDay(item.pausedAt)}`))}</span></span>
      <button class="round small soft resume-item" type="button" data-index="${index}" aria-label="${esc(t("Resume", "Pokračovať", "Folytatás"))}" title="${esc(t("Resume", "Pokračovať", "Folytatás"))}">${PLAY}</button>
      <button class="round small stop stop-paused" type="button" data-index="${index}" aria-label="${esc(t("Stop", "Zastaviť", "Leállítás"))}" title="${esc(t("Stop", "Zastaviť", "Leállítás"))}">${SQUARE}</button>
    </div>`
    )
    .join("");
  return `<div class="stack"><span class="section-label">${esc(t("Paused", "Pozastavené", "Szüneteltetve"))}</span>${rows}</div>`;
}

function wireExtras(extras: Extras): void {
  window.clearInterval(questionClock);
  const testActive = Boolean(extras.testAlertUntil && extras.testAlertUntil > Date.now());
  const deadline = testActive
    ? (extras.testAlertUntil as number)
    : extras.presence?.deadlineAt
      ? Date.parse(extras.presence.deadlineAt) - extras.offsetMs
      : Number.NaN;
  const node = app.querySelector("#countdown");
  if (node && Number.isFinite(deadline)) {
    const tickDown = () => {
      const left = deadline - Date.now();
      node.textContent = formatCountdown(left);
      if (left <= 0) {
        window.clearInterval(questionClock);
        void refreshBadge().then(() => showTracker());
      }
    };
    tickDown();
    questionClock = window.setInterval(tickDown, 1000);
  }
  app.querySelector("#confirm")?.addEventListener("click", async () => {
    if (testActive) {
      await chrome.runtime.sendMessage({ type: "stop-test-alert" });
      await showTracker();
      return;
    }
    await confirmPresence();
  });
  app.querySelectorAll<HTMLElement>(".resume-item").forEach((button) => {
    button.addEventListener("click", () => {
      const item = extras.paused[Number(button.dataset.index)];
      if (item) void resume(item);
    });
  });
  app.querySelectorAll<HTMLElement>(".stop-paused").forEach((button) => {
    button.addEventListener("click", () => {
      const item = extras.paused[Number(button.dataset.index)];
      if (item) void stop(item);
    });
  });
}

function showNotice(message: string): void {
  const box = app.querySelector("#notice");
  if (box) box.innerHTML = `<p class="error">${esc(message)}</p>`;
}

async function confirmPresence(): Promise<void> {
  const button = app.querySelector("#confirm") as HTMLButtonElement | null;
  if (button) button.disabled = true;
  const state = await loadLocal();
  try {
    await trackerCall(state.ccrmUrl, state.deviceKey, "POST", "confirm");
    if (isAlertWindow) {
      window.close();
      return;
    }
  } catch (error) {
    if (error instanceof TrackerError && error.code === "offline") {
      if (button) button.disabled = false;
      showNotice(t(`Could not reach ${PRODUCT_NAME}. Try again.`, `${PRODUCT_NAME} nie je dostupný. Skúste znova.`, `A ${PRODUCT_NAME} nem érhető el. Próbálja újra.`));
      return;
    }
  }
  await refreshBadge();
  await showTracker();
}

async function pauseTimer(id: string): Promise<void> {
  const state = await loadLocal();
  try {
    await trackerCall(state.ccrmUrl, state.deviceKey, "POST", "pause", { id });
  } catch (error) {
    const code = error instanceof TrackerError ? error.code : "offline";
    showNotice(errorMessage(code));
  }
  await refreshBadge();
  await showTracker();
}

async function updateRunningEntry(id: string, patch: { note?: string; billable?: boolean; description?: string }): Promise<void> {
  const state = await loadLocal();
  try {
    await trackerCall(state.ccrmUrl, state.deviceKey, "POST", "update", { id, ...patch });
    editingEntryId = null;
  } catch (error) {
    const code = error instanceof TrackerError ? error.code : "offline";
    showNotice(errorMessage(code));
  }
  await refreshBadge();
  await showTracker();
}

async function resume(item: any): Promise<void> {
  const state = await loadLocal();
  try {
    await trackerCall(state.ccrmUrl, state.deviceKey, "POST", "resume", { id: item.id, mode: startModeChoice });
  } catch (error) {
    const code = error instanceof TrackerError ? error.code : "offline";
    await refreshBadge();
    await showTracker();
    if (code !== "already_running" && code !== "not_paused") showNotice(errorMessage(code));
    return;
  }
  await refreshBadge();
  await showTracker();
}

function wireStartForm(): void {
  let selectedTaskId = "";
  let selectedTaskTitle = "";
  let selectedProjectId = "";
  let selectedProjectName = "";

  const titleInput = app.querySelector("#title") as HTMLInputElement;
  const projectInput = app.querySelector("#project") as HTMLInputElement;
  const taskPicked = app.querySelector("#task-picked") as HTMLElement;
  const taskList = app.querySelector("#task-list") as HTMLElement;
  const projectList = app.querySelector("#project-list") as HTMLElement;

  const updateTaskBadge = () => {
    if (selectedTaskId) {
      taskPicked.hidden = false;
      taskPicked.innerHTML = `<span class="pill">${esc(t("Task:", "Úloha:", "Feladat:"))} ${esc(selectedTaskTitle)} <button id="clear-task" type="button" style="height:auto;padding:0 4px;background:transparent;color:#4a5a20">×</button></span>`;
      app.querySelector("#clear-task")?.addEventListener("click", () => {
        selectedTaskId = "";
        selectedTaskTitle = "";
        updateTaskBadge();
      });
    } else {
      taskPicked.hidden = true;
      taskPicked.innerHTML = "";
    }
  };

  let taskTimer = 0;
  const loadMyTasks = async (q: string) => {
    const state = await loadLocal();
    if (!state.deviceKey) return;
    try {
      const res = await trackerCall(state.ccrmUrl, state.deviceKey, "GET", "myTasks", {}, { q, ...(selectedProjectId ? { projectId: selectedProjectId } : {}) });
      const tasks: any[] = res.tasks || [];
      if (!tasks.length) {
        taskList.innerHTML = "";
        return;
      }
      taskList.innerHTML = tasks
        .slice(0, 6)
        .map((tk, i) => {
          const sub = [tk.projectName, tk.clientName].filter(Boolean).join(" · ") || t("No project", "Bez projektu", "Nincs projekt");
          return `
            <button class="pick task-pick" type="button" data-idx="${i}">
              <span class="pick-main">
                <span class="pick-title" title="${esc(tk.title)}">${esc(tk.title)}</span>
                <span class="pick-sub" title="${esc(sub)}">${esc(sub)}</span>
              </span>
              ${tk.mine ? `<span class="pill">${esc(t("Mine", "Moja", "Saját"))}</span>` : ""}
            </button>`;
        })
        .join("");
      taskList.querySelectorAll(".task-pick").forEach((btn) => {
        btn.addEventListener("click", () => {
          const tk = tasks[Number((btn as HTMLElement).dataset.idx)];
          if (!tk) return;
          selectedTaskId = tk.id;
          selectedTaskTitle = tk.title;
          titleInput.value = tk.title;
          if (tk.projectId) {
            selectedProjectId = tk.projectId;
            selectedProjectName = tk.projectName || "";
            projectInput.value = selectedProjectName;
          }
          taskList.innerHTML = "";
          updateTaskBadge();
        });
      });
    } catch {
      taskList.innerHTML = "";
    }
  };

  titleInput.addEventListener("focus", () => {
    if (!taskList.innerHTML && !selectedTaskId) void loadMyTasks(titleInput.value.trim());
  });
  titleInput.addEventListener("input", () => {
    if (selectedTaskId && titleInput.value !== selectedTaskTitle) {
      selectedTaskId = "";
      selectedTaskTitle = "";
      updateTaskBadge();
    }
    window.clearTimeout(taskTimer);
    taskTimer = window.setTimeout(() => void loadMyTasks(titleInput.value.trim()), 180);
  });

  let projTimer = 0;
  projectInput.addEventListener("input", () => {
    selectedProjectId = "";
    selectedProjectName = "";
    window.clearTimeout(projTimer);
    projTimer = window.setTimeout(async () => {
      const state = await loadLocal();
      const host = await currentHost();
      try {
        const res = await trackerCall(state.ccrmUrl, state.deviceKey, "GET", "projects", {}, { q: projectInput.value, host });
        const projects: any[] = res.projects || [];
        projectList.innerHTML = projects
          .slice(0, 6)
          .map((p, idx) => `<button class="pick proj-pick" type="button" data-idx="${idx}"><span class="dot"></span><span class="pick-main"><span class="pick-title" title="${esc(p.name)}">${esc(p.name)}</span></span>${p.suggested ? `<span class="muted">${esc(t("suggested", "navrhnuté", "javasolt"))}</span>` : ""}</button>`)
          .join("");
        projectList.querySelectorAll(".proj-pick").forEach((b) => {
          b.addEventListener("click", () => {
            const p = projects[Number((b as HTMLElement).dataset.idx)];
            if (!p) return;
            selectedProjectId = p.id;
            selectedProjectName = p.name;
            projectInput.value = p.name;
            projectList.innerHTML = "";
            void loadMyTasks(titleInput.value.trim());
          });
        });
      } catch {
        projectList.innerHTML = "";
      }
    }, 180);
  });

  app.querySelector("#start")?.addEventListener("click", () => {
    void start({
      description: selectedTaskId ? "" : titleInput.value.trim(),
      projectId: selectedProjectId,
      projectName: selectedProjectName,
      taskId: selectedTaskId,
      taskTitle: selectedTaskTitle,
      mode: startModeChoice,
    });
  });

  void suggestFromTab((id, name) => {
    if (!projectInput.value && !selectedProjectId) {
      selectedProjectId = id;
      selectedProjectName = name;
      projectInput.value = name;
    }
  });
}

function recentRows(entries: any[]): string {
  if (!entries.length) return "";
  const rows = entries
    .slice(0, 5)
    .map(
      (entry, index) => `
    <div class="recent-row">
      <span class="grow"><span class="recent-title">${esc(entry.title || t("Untitled", "Bez názvu", "Névtelen"))}</span><span class="muted">${esc(entry.projectName || "")}</span></span>
      <button class="round small soft continue" type="button" data-index="${index}" aria-label="${esc(t("Continue", "Pokračovať", "Folytatás"))}" title="${esc(t("Continue", "Pokračovať", "Folytatás"))}">${PLAY}</button>
    </div>`
    )
    .join("");
  return `<div class="stack"><span class="section-label">${esc(t("Recent", "Nedávne", "Legutóbbi"))}</span>${rows}</div>`;
}

function wireContinue(entries: any[]): void {
  app.querySelectorAll(".continue").forEach((button) => {
    button.addEventListener("click", () => {
      const entry = entries[Number((button as HTMLElement).dataset.index)];
      if (!entry) return;
      void start({
        description: entry.titleSource === "entry" ? entry.title : "",
        projectId: entry.projectId || "",
        projectName: entry.projectName || "",
        taskId: entry.taskId || "",
        taskTitle: entry.titleSource === "task" ? entry.title : "",
        ticketId: entry.ticketId || "",
        mode: startModeChoice,
      });
    });
  });
}

function wireOpen(ccrmUrl: string): void {
  app.querySelector(".footer a")?.addEventListener("click", (event) => {
    event.preventDefault();
    void chrome.tabs.create({ url: `${ccrmUrl}/#time-tracking` });
  });
}

async function currentHost(): Promise<string> {
  try {
    const granted = await chrome.permissions.contains({ permissions: ["tabs"] });
    if (!granted) return "";
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return hostOnly(tabs?.[0]?.url || "") || "";
  } catch {
    return "";
  }
}

async function suggestFromTab(pick: (id: string, name: string) => void): Promise<void> {
  const host = await currentHost();
  if (!host) return;
  const state = await loadLocal();
  try {
    const res = await trackerCall(state.ccrmUrl, state.deviceKey, "GET", "projects", {}, { q: "", host });
    const suggested = (res.projects || []).find((p: any) => p.suggested);
    if (suggested) pick(suggested.id, suggested.name);
  } catch {
    /* ignore */
  }
}

async function start(input: {
  description: string;
  projectId: string;
  projectName: string;
  taskId: string;
  taskTitle: string;
  ticketId?: string;
  mode?: "switch" | "parallel";
}): Promise<void> {
  const state = await loadLocal();
  const at = new Date().toISOString();
  const mode = input.mode === "parallel" ? "parallel" : "switch";
  const body: Record<string, unknown> = { mode };
  if (input.description) body.description = input.description;
  if (input.projectId) body.projectId = input.projectId;
  if (input.taskId) body.taskId = input.taskId;
  if (input.ticketId) body.ticketId = input.ticketId;
  const optimistic = { startedAt: at, title: input.description || input.taskTitle || t("Running", "Beží", "Fut"), projectName: input.projectName, taskTitle: input.taskTitle };
  if (!navigator.onLine) {
    await enqueue({ kind: "start", at, body }, optimistic);
    startFormExpanded = false;
    await showTracker();
    return;
  }
  try {
    await trackerCall(state.ccrmUrl, state.deviceKey, "POST", "start", { ...body, startedAt: at });
    await saveLocal({ optimistic: null });
    startFormExpanded = false;
    await refreshBadge();
    await showTracker();
  } catch (error) {
    if (error instanceof TrackerError && error.code === "offline") {
      await enqueue({ kind: "start", at, body }, optimistic);
      startFormExpanded = false;
      await showTracker();
      return;
    }
    if (error instanceof TrackerError && error.code === "not_paired") {
      signedInName = "";
      await saveLocal({ deviceKey: "", optimistic: null });
      renderPair(t("Pair this browser again.", "Spárujte tento prehliadač znova.", "Párosítsa újra ezt a böngészőt."));
      return;
    }
    if (error instanceof TrackerError && error.code === "already_running") {
      await saveLocal({ optimistic: null });
      startFormExpanded = false;
      await refreshBadge();
      await showTracker();
      return;
    }
    const node = app.querySelector("#form-error") as HTMLElement | null;
    if (node) {
      node.hidden = false;
      node.textContent = error instanceof TrackerError ? errorMessage(error.code) : t("Could not start.", "Nepodarilo sa spustiť.", "Az indítás nem sikerült.");
    }
  }
}

async function stop(entry: any): Promise<void> {
  const state = await loadLocal();
  const at = new Date().toISOString();
  const body: Record<string, unknown> = {};
  if (entry?.id) body.id = entry.id;
  if (!navigator.onLine) {
    await enqueue({ kind: "stop", at, body }, null);
    await showTracker();
    return;
  }
  try {
    await trackerCall(state.ccrmUrl, state.deviceKey, "POST", "stop", { ...body, stoppedAt: at });
    await saveLocal({ optimistic: null });
    editingEntryId = null;
    await refreshBadge();
    await showTracker();
  } catch (error) {
    if (error instanceof TrackerError && error.code === "offline") {
      await enqueue({ kind: "stop", at, body }, null);
      await showTracker();
      return;
    }
    if (error instanceof TrackerError && error.code === "ambiguous") {
      await saveLocal({ optimistic: null });
      await showTracker();
      return;
    }
    if (error instanceof TrackerError && error.code === "project_required") {
      const node = app.querySelector("#notice");
      if (node) {
        node.innerHTML = `<p class="error">${esc(errorMessage("project_required"))}</p><label>${esc(t("Project id", "ID projektu", "Projekt azonosító"))}<input id="stop-project" /></label><button id="stop-retry" class="stop" type="button">${esc(t("Stop", "Zastaviť", "Leállítás"))}</button>`;
      }
      app.querySelector("#stop-retry")?.addEventListener("click", () => {
        body.projectId = (app.querySelector("#stop-project") as HTMLInputElement).value.trim();
        void trackerCall(state.ccrmUrl, state.deviceKey, "POST", "stop", { ...body, stoppedAt: at })
          .then(() => showTracker())
          .catch(() => undefined);
      });
      return;
    }
    if (error instanceof TrackerError && error.code === "not_paired") {
      signedInName = "";
      await saveLocal({ deviceKey: "", optimistic: null, lost: [...state.lost, { id: crypto.randomUUID(), kind: "stop", at, body }] });
      renderPair(t("Pair this browser again. The stop was kept on this device.", "Spárujte tento prehliadač znova. Zastavenie zostalo uložené v tomto zariadení.", "Párosítsa újra ezt a böngészőt. A leállítás ezen az eszközön maradt."));
      return;
    }
    const failure = error instanceof TrackerError ? error.code : "offline";
    if (failure === "not_found" || failure === "not_running") {
      await saveLocal({ optimistic: null });
      await refreshBadge();
      await showTracker();
    }
    showNotice(errorMessage(failure));
  }
}

document.title = t(`${PRODUCT_NAME} Time Tracker`, `${PRODUCT_NAME} Sledovanie času`, `${PRODUCT_NAME} Időkövetés`);
void showTracker();
