import "./popup.css";
import { EXTENSION_VERSION, badgeLabel, hostOnly } from "../../../src/utils/timeTrackerRules.ts";
import { TrackerError, trackerCall } from "./client.ts";
import { loadLocal, saveLocal, type QueueItem } from "./storage.ts";
import { PRODUCT_NAME, errorMessage, t } from "./i18n.ts";
import { formatClock, formatCountdown, serverOffset, timeOfDay, type PresenceState } from "./presence.ts";

declare const chrome: any;

const app = document.querySelector("#app") as HTMLElement;
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] || ch);

let clock: number | undefined;
let questionClock: number | undefined;
let signedInName = "";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
const PLAY = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor"/></svg>`;
const SQUARE = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor"/></svg>`;

/** The popup header: product name, worked time today, and the person's initials. */
function header(todaySeconds: number | null): string {
  const today = todaySeconds === null ? "" : `<span class="muted">${esc(t("Today", "Dnes", "Ma"))} ${esc(badgeLabel(todaySeconds))}</span>`;
  const avatar = initials(signedInName) ? `<span class="avatar" title="${esc(signedInName)}">${esc(initials(signedInName))}</span>` : "";
  return `<div class="head"><strong class="brand">${esc(PRODUCT_NAME)}</strong><span class="head-end">${today}${avatar}</span></div>`;
}

/** What the `running` answer adds since phase 10: the presence state and the paused items. */
interface Extras {
  presence: PresenceState | null;
  paused: any[];
  offsetMs: number;
  ccrmUrl: string;
}
const noExtras = (ccrmUrl: string): Extras => ({ presence: null, paused: [], offsetMs: 0, ccrmUrl });

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
    /* the worker wakes on the next alarm */
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
  app.innerHTML = `
    ${header(null)}
    <div class="body stack">
      <h1>${esc(t(`Connect to ${PRODUCT_NAME}`, `Pripojiť k ${PRODUCT_NAME}`, `Csatlakozás: ${PRODUCT_NAME}`))}</h1>
      <label>${esc(t(`${PRODUCT_NAME} address`, `Adresa ${PRODUCT_NAME}`, `${PRODUCT_NAME} címe`))}<input id="url" placeholder="https://crm.example.com" autocomplete="url" /></label>
      <label>${esc(t("Pairing code", "Párovací kód", "Párosítási kód"))}<input id="code" class="mono" placeholder="K7Q4-9MZT" autocapitalize="characters" /></label>
      ${error ? `<p class="error">${esc(error)}</p>` : ""}
      <button id="connect" class="primary wide" type="button">${esc(t("Connect", "Pripojiť", "Csatlakozás"))}</button>
      <p class="muted">${esc(t(`Use the address you open ${PRODUCT_NAME} at. Get a one-time code in ${PRODUCT_NAME} under Settings → Projects & tasks → Time tracking → Chrome extension.`, `Použite adresu, na ktorej otvárate ${PRODUCT_NAME}. Jednorazový kód získate v ${PRODUCT_NAME} v Nastavenia → Projekty a úlohy → Evidencia času → Rozšírenie Chrome.`, `Használja azt a címet, amelyen a ${PRODUCT_NAME} megnyílik. Az egyszeri kódot a ${PRODUCT_NAME} Beállítások → Projektek és feladatok → Időkövetés → Chrome-bővítmény részében kapja meg.`))}</p>
    </div>`;
  void loadLocal().then((state) => {
    const url = app.querySelector("#url") as HTMLInputElement;
    if (state.ccrmUrl) url.value = state.ccrmUrl;
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
    const message = errorMessage(codeName === "not_paired" ? "code_invalid" : codeName);
    renderPair(message);
  }
}

async function showTracker(): Promise<void> {
  const state = await loadLocal();
  signedInName = state.userName || "";
  if (!state.deviceKey || !state.ccrmUrl) {
    renderPair(state.lost.length ? t("This browser is not paired. The actions below were not saved.", "Tento prehliadač nie je spárovaný. Akcie nižšie neboli uložené.", "Ez a böngésző nincs párosítva. Az alábbi műveletek nem lettek mentve.") : "");
    if (state.lost.length) renderLost(state.lost);
    return;
  }
  try {
    const [running, recent, count, rules] = await Promise.all([
      trackerCall(state.ccrmUrl, state.deviceKey, "GET", "running"),
      trackerCall(state.ccrmUrl, state.deviceKey, "GET", "recent"),
      trackerCall(state.ccrmUrl, state.deviceKey, "GET", "unsortedCount"),
      trackerCall(state.ccrmUrl, state.deviceKey, "GET", "rules"),
    ]);
    const entry = state.optimistic
      ? { running: true, title: state.optimistic.title, projectName: state.optimistic.projectName, startAt: state.optimistic.startedAt, taskId: state.optimistic.taskTitle ? "local" : null, titleSource: "entry" }
      : running.entry;
    const extras: Extras = {
      presence: running.presence && typeof running.presence.phase === "string" ? running.presence : null,
      paused: Array.isArray(running.paused) ? running.paused : [],
      offsetMs: serverOffset(running.serverNow),
      ccrmUrl: state.ccrmUrl,
    };
    // Several timers run (started in the app): the container lists them, each with its own Stop,
    // under the worked clock. Start stays a switch (TT2 D5.6, phase 10).
    if (!state.optimistic && (running.count || 0) > 1) renderMany(running, count.count || 0, rules, state.ccrmUrl, extras);
    else if (entry?.running) renderRunning(entry, recent, count.count || 0, rules, state.ccrmUrl, false, state.optimistic ? noExtras(state.ccrmUrl) : extras);
    else renderIdle(recent, count.count || 0, rules, state.ccrmUrl, false, extras);
  } catch (error) {
    if (error instanceof TrackerError && error.code === "not_paired") {
      const lost = (await loadLocal()).lost;
      signedInName = "";
      await saveLocal({ deviceKey: "", userName: "", optimistic: null });
      renderPair(t("This browser was revoked. Pair it again.", "Tomuto prehliadaču bol prístup odobratý. Spárujte ho znova.", "Ennek a böngészőnek a hozzáférését visszavonták. Párosítsa újra."));
      if (lost.length) renderLost(lost);
      return;
    }
    if (error instanceof TrackerError && error.code === "offline") {
      if (state.optimistic) renderRunning({ running: true, title: state.optimistic.title, projectName: state.optimistic.projectName, startAt: state.optimistic.startedAt, titleSource: "entry" }, { entries: [], todaySeconds: 0 }, 0, { enabled: false }, state.ccrmUrl, true);
      else renderIdle({ entries: [], todaySeconds: 0 }, 0, { enabled: false }, state.ccrmUrl, true);
      return;
    }
    renderPair(error instanceof TrackerError ? errorMessage(error.code) : t(`Could not reach ${PRODUCT_NAME}.`, `${PRODUCT_NAME} nie je dostupný.`, `A ${PRODUCT_NAME} nem érhető el.`));
  }
}

function renderLost(lost: QueueItem[]): void {
  const list = lost.map((item) => `<li>${esc(item.kind)} · ${esc(new Date(item.at).toLocaleString())}</li>`).join("");
  app.insertAdjacentHTML("beforeend", `<div class="amber" style="margin-top:8px"><strong>${esc(t("Not sent", "Neodoslané", "Nem elküldve"))}</strong><ul>${list}</ul><button id="clear-lost" class="tiny" type="button">${esc(t("Dismiss", "Zavrieť", "Elvetés"))}</button></div>`);
  app.querySelector("#clear-lost")?.addEventListener("click", () => {
    void saveLocal({ lost: [] }).then(() => showTracker());
  });
}

function renderRunning(entry: any, recent: any, unsorted: number, rules: { enabled?: boolean }, ccrmUrl: string, offline = false, extras: Extras = noExtras(ccrmUrl)): void {
  const started = Date.parse(entry.startAt);
  const paint = () => {
    const node = app.querySelector("#elapsed");
    if (!node || !Number.isFinite(started)) return;
    const sec = Math.max(0, Math.floor((Date.now() - started) / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    node.textContent = `${h}:${String(m).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  };
  const subtitle = [entry.projectName, entry.taskId && entry.titleSource !== "entry" ? entry.title : ""].filter(Boolean).join(" · ");
  const today = (recent.todaySeconds || 0) + (Number.isFinite(started) ? Math.max(0, Math.floor((Date.now() - started) / 1000)) : 0);
  app.innerHTML = `
    ${header(today)}
    ${offline ? `<p class="amber note">${esc(t("Offline. Stop will be sent when you are back.", "Offline. Zastavenie sa odošle po obnovení pripojenia.", "Offline. A leállítás a kapcsolat visszatértekor kerül elküldésre."))}</p>` : ""}
    <div class="body stack">${extrasTop(extras)}</div>
    <div class="running-band">
      <div class="grow">
        <h1>${esc(entry.title || t("Running", "Beží", "Fut"))}</h1>
        <p class="project-line"><span class="dot"></span>${esc(subtitle || t("No project yet", "Zatiaľ bez projektu", "Még nincs projekt"))}</p>
        <div class="elapsed" id="elapsed">0:00</div>
      </div>
      <button id="stop" class="round stop" type="button" aria-label="${esc(t("Stop", "Zastaviť", "Leállítás"))}" title="${esc(t("Stop", "Zastaviť", "Leállítás"))}">${SQUARE}</button>
    </div>
    <div id="notice" class="notice"></div>
    <div class="body stack">
      ${pausedRows(extras)}
      ${recentRows(recent.entries || [])}
      ${captureRow(!!rules.enabled)}
      ${footer(unsorted, ccrmUrl)}
    </div>`;
  paint();
  window.clearInterval(clock);
  clock = window.setInterval(paint, 1000);
  app.querySelector("#stop")?.addEventListener("click", () => void stop(entry));
  wireExtras(extras);
  wireContinue(recent.entries || []);
  wireCapture(!!rules.enabled);
  wireOpen(ccrmUrl);
}

function renderMany(running: { count?: number; workedTodaySeconds?: number; running?: any[] }, unsorted: number, rules: { enabled?: boolean }, ccrmUrl: string, extras: Extras): void {
  const loadedAt = Date.now();
  const base = Number(running.workedTodaySeconds) || 0;
  const items = Array.isArray(running.running) ? running.running : [];
  // The union of the running intervals grows one second per second, however many run.
  const paint = () => {
    const node = app.querySelector("#worked");
    if (node) node.textContent = formatClock(base + (Date.now() - loadedAt) / 1000);
    app.querySelectorAll<HTMLElement>(".item-elapsed").forEach((cell) => {
      const started = Date.parse(cell.dataset.start || "");
      if (Number.isFinite(started)) cell.textContent = formatClock((Date.now() + extras.offsetMs - started) / 1000);
    });
  };
  const rows = items.map((item, index) => `
    <div class="card spread">
      <span class="grow">${esc(item.title || t("Untitled", "Bez názvu", "Névtelen"))}<br /><span class="muted">${esc(item.projectName || t("No project", "Bez projektu", "Nincs projekt"))}</span></span>
      <span class="item-elapsed" data-start="${esc(item.startAt)}">0:00:00</span>
      <button class="round small stop stop-item" type="button" data-index="${index}" aria-label="${esc(t("Stop", "Zastaviť", "Leállítás"))} ${esc(item.title || t("timer", "časovač", "időzítő"))}" title="${esc(t("Stop", "Zastaviť", "Leállítás"))}">${SQUARE}</button>
    </div>`).join("");
  app.innerHTML = `
    ${header(base)}
    <div id="notice" class="notice"></div>
    <div class="body stack">
      ${extrasTop(extras)}
      <div class="spread">
        <h1>${esc(running.count || items.length)} ${esc(t("timers running", "bežiacich časovačov", "futó időzítő"))}</h1>
        <span><span class="muted">${esc(t("Worked today", "Odpracované dnes", "Ma dolgozott"))}</span> <strong id="worked">0:00:00</strong></span>
      </div>
      <div class="stack">${rows}</div>
      ${pausedRows(extras)}
      <button id="open-app" class="ghost" type="button">${esc(t("Open the app", "Otvoriť aplikáciu", "Az alkalmazás megnyitása"))}</button>
      ${captureRow(!!rules.enabled)}
      ${footer(unsorted, ccrmUrl)}
    </div>`;
  paint();
  window.clearInterval(clock);
  clock = window.setInterval(paint, 1000);
  app.querySelectorAll<HTMLElement>(".stop-item").forEach((button) => {
    button.addEventListener("click", () => {
      const item = items[Number(button.dataset.index)];
      if (item) void stop(item);
    });
  });
  app.querySelector("#open-app")?.addEventListener("click", () => {
    void chrome.tabs.create({ url: `${ccrmUrl}/#time-tracking` });
  });
  wireExtras(extras);
  wireCapture(!!rules.enabled);
  wireOpen(ccrmUrl);
}

/** The question banner (Still working? + countdown) or the paused banner, above the timers. */
function extrasTop(extras: Extras): string {
  const p = extras.presence;
  if (p?.phase === "question" && p.enabled !== false) {
    return `
      <div class="question" role="alert">
        <div class="spread"><strong>${esc(t("Still working?", "Stále pracuješ?", "Még dolgozol?"))}</strong><span class="countdown" id="countdown"></span></div>
        <p class="muted">${esc(t(`Without an answer the timers pause at ${timeOfDay(p.deadlineAt)}.`, `Bez odpovede sa časovače o ${timeOfDay(p.deadlineAt)} pozastavia.`, `Válasz nélkül az időzítők ${timeOfDay(p.deadlineAt)}-kor szünetelnek.`))}</p>
        <button id="confirm" class="primary" type="button">${esc(t("Still working", "Pracujem", "Dolgozom"))}</button>
      </div>`;
  }
  if (p?.phase === "paused") {
    const how = extras.paused.length ? t("resume below or open the app", "obnovte nižšie alebo otvorte aplikáciu", "folytassa alább vagy nyissa meg az alkalmazást") : t("open the app to resume", "obnovte v aplikácii", "folytassa az alkalmazásban");
    return `<div class="paused-banner"><strong>${esc(t(`Paused at ${timeOfDay(p.autoPausedAt)}`, `Pozastavené o ${timeOfDay(p.autoPausedAt)}`, `Szüneteltetve: ${timeOfDay(p.autoPausedAt)}`))}</strong> · ${how}</div>`;
  }
  return "";
}

/** The paused items, each with Resume and Stop. */
function pausedRows(extras: Extras): string {
  if (!extras.paused.length) return "";
  const rows = extras.paused.map((item, index) => `
    <div class="card spread">
      <span class="grow">${esc(item.title || t("Untitled", "Bez názvu", "Névtelen"))}<br /><span class="muted">${esc(item.projectName || t("No project", "Bez projektu", "Nincs projekt"))} · ${esc(t(`paused ${timeOfDay(item.pausedAt)}`, `pozastavené ${timeOfDay(item.pausedAt)}`, `szüneteltetve ${timeOfDay(item.pausedAt)}`))}</span></span>
      <button class="round small soft resume-item" type="button" data-index="${index}" aria-label="${esc(t("Resume", "Pokračovať", "Folytatás"))}" title="${esc(t("Resume", "Pokračovať", "Folytatás"))}">${PLAY}</button>
      <button class="round small stop stop-paused" type="button" data-index="${index}" aria-label="${esc(t("Stop", "Zastaviť", "Leállítás"))}" title="${esc(t("Stop", "Zastaviť", "Leállítás"))}">${SQUARE}</button>
    </div>`).join("");
  return `<div class="stack"><span class="section-label">${esc(t("Paused", "Pozastavené", "Szüneteltetve"))}</span>${rows}</div>`;
}

function wireExtras(extras: Extras): void {
  window.clearInterval(questionClock);
  const p = extras.presence;
  const node = app.querySelector("#countdown");
  const deadline = p?.deadlineAt ? Date.parse(p.deadlineAt) : Number.NaN;
  if (node && Number.isFinite(deadline)) {
    const tickDown = () => {
      const left = deadline - (Date.now() + extras.offsetMs);
      node.textContent = formatCountdown(left);
      if (left <= 0) {
        // The deadline passed: the server has paused the timers; read it again.
        window.clearInterval(questionClock);
        void refreshBadge().then(() => showTracker());
      }
    };
    tickDown();
    questionClock = window.setInterval(tickDown, 1000);
  }
  app.querySelector("#confirm")?.addEventListener("click", () => void confirmPresence());
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
  const box = app.querySelector("#notice") ?? app.querySelector(".stack");
  if (box) box.innerHTML = `<p class="error">${esc(message)}</p>`;
}

/** "Still working" (D7.4): only before the deadline; after it the server answers 409 paused. */
async function confirmPresence(): Promise<void> {
  const button = app.querySelector("#confirm") as HTMLButtonElement | null;
  if (button) button.disabled = true;
  const state = await loadLocal();
  try {
    await trackerCall(state.ccrmUrl, state.deviceKey, "POST", "confirm");
  } catch (error) {
    if (error instanceof TrackerError && error.code === "offline") {
      if (button) button.disabled = false;
      showNotice(t(`Could not reach ${PRODUCT_NAME}. Try again.`, `${PRODUCT_NAME} nie je dostupný. Skúste znova.`, `A ${PRODUCT_NAME} nem érhető el. Próbálja újra.`));
      return;
    }
    /* paused or not_running: the repaint below shows what the server decided */
  }
  await refreshBadge();
  await showTracker();
}

/** Resume one paused item: a switch, like Start (the others stop). */
async function resume(item: any): Promise<void> {
  const state = await loadLocal();
  try {
    await trackerCall(state.ccrmUrl, state.deviceKey, "POST", "resume", { id: item.id });
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

function renderIdle(recent: any, unsorted: number, rules: { enabled?: boolean }, ccrmUrl: string, offline = false, extras: Extras = noExtras(ccrmUrl)): void {
  window.clearInterval(clock);
  app.innerHTML = `
    ${header(recent.todaySeconds || 0)}
    <div id="notice" class="notice"></div>
    <div class="body stack">
      ${offline ? `<p class="amber note">${esc(t("Offline. A start is queued and sent later.", "Offline. Spustenie sa odošle neskôr.", "Offline. Az indítás később kerül elküldésre."))}</p>` : ""}
      ${extrasTop(extras)}
      ${pausedRows(extras)}
      <h1>${esc(t("What are you working on?", "Na čom pracuješ?", "Min dolgozik?"))}</h1>
      <input id="title" aria-label="${esc(t("Title", "Názov", "Cím"))}" placeholder="${esc(t("What are you working on?", "Na čom pracuješ?", "Min dolgozik?"))}" />
      <input id="project" aria-label="${esc(t("Project", "Projekt", "Projekt"))}" placeholder="${esc(t("Search projects", "Hľadať projekty", "Projektek keresése"))}" autocomplete="off" />
      <div id="project-list" class="picker"></div>
      <label>${esc(t("Task", "Úloha", "Feladat"))}<select id="task"><option value="">${esc(t("No task", "Bez úlohy", "Nincs feladat"))}</option></select></label>
      <p id="form-error" class="error" hidden></p>
      <button id="start" class="primary wide" type="button">${PLAY} ${esc(t("Start timer", "Spustiť časovač", "Időzítő indítása"))}</button>
      ${recentRows(recent.entries || [])}
      ${captureRow(!!rules.enabled)}
      ${footer(unsorted, ccrmUrl)}
    </div>`;
  let projectId = "";
  let projectName = "";
  const input = app.querySelector("#project") as HTMLInputElement;
  let timer = 0;
  input.addEventListener("input", () => {
    projectId = "";
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void searchProjects(input.value, (id, name) => {
      projectId = id;
      projectName = name;
      input.value = name;
      void loadTasks(id);
    }), 200);
  });
  app.querySelector("#start")?.addEventListener("click", () => void start({
    description: (app.querySelector("#title") as HTMLInputElement).value.trim(),
    projectId,
    projectName,
    taskId: (app.querySelector("#task") as HTMLSelectElement).value,
    taskTitle: (app.querySelector("#task") as HTMLSelectElement).selectedOptions[0]?.textContent || "",
  }));
  wireExtras(extras);
  wireContinue(recent.entries || []);
  wireCapture(!!rules.enabled);
  wireOpen(ccrmUrl);
  void suggestFromTab();
}

function recentRows(entries: any[]): string {
  if (!entries.length) return "";
  const rows = entries.slice(0, 3).map((entry, index) => `
    <div class="recent-row">
      <span class="grow"><span class="recent-title">${esc(entry.title || t("Untitled", "Bez názvu", "Névtelen"))}</span><span class="muted">${esc(entry.projectName || "")}</span></span>
      <button class="round small soft continue" type="button" data-index="${index}" aria-label="${esc(t("Continue", "Pokračovať", "Folytatás"))}" title="${esc(t("Continue", "Pokračovať", "Folytatás"))}">${PLAY}</button>
    </div>`).join("");
  return `<div class="stack"><span class="section-label">${esc(t("Recent", "Nedávne", "Legutóbbi"))}</span>${rows}</div>`;
}

function captureRow(enabled: boolean): string {
  return `<label class="check"><input id="capture" type="checkbox" ${enabled ? "checked" : ""} /> ${esc(t("Remember watched sites while no timer is running", "Pamätať si sledované stránky, kým nebeží časovač", "Figyelt oldalak megjegyzése, amíg nem fut időzítő"))}</label>`;
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
      });
    });
  });
}

function wireCapture(enabled: boolean): void {
  const box = app.querySelector("#capture") as HTMLInputElement | null;
  if (!box) return;
  box.checked = enabled;
  box.addEventListener("change", async () => {
    const want = box.checked;
    if (want) {
      const granted = await chrome.permissions.request({ permissions: ["tabs"] });
      if (!granted) {
        box.checked = false;
        return;
      }
    }
    const state = await loadLocal();
    try {
      await trackerCall(state.ccrmUrl, state.deviceKey, "POST", "capture", { enabled: want });
    } catch {
      box.checked = !want;
    }
  });
}

function wireOpen(ccrmUrl: string): void {
  app.querySelector(".footer a")?.addEventListener("click", (event) => {
    event.preventDefault();
    void chrome.tabs.create({ url: `${ccrmUrl}/#time-tracking` });
  });
}

async function searchProjects(q: string, pick: (id: string, name: string) => void): Promise<void> {
  const state = await loadLocal();
  const host = await currentHost();
  try {
    const res = await trackerCall(state.ccrmUrl, state.deviceKey, "GET", "projects", {}, { q, host: host || "" });
    const list = app.querySelector("#project-list");
    if (!list) return;
    const projects = res.projects || [];
    list.innerHTML = projects.slice(0, 6).map((project: any, index: number) =>
      `<button class="pick project" type="button" data-index="${index}"><span class="dot"></span><span class="grow">${esc(project.name)}</span>${project.suggested ? `<span class="muted">${esc(t("suggested", "navrhnuté", "javasolt"))}</span>` : ""}</button>`,
    ).join("");
    list.querySelectorAll(".project").forEach((button) => {
      button.addEventListener("click", () => {
        const project = projects[Number((button as HTMLElement).dataset.index)];
        if (project) pick(project.id, project.name);
        list.innerHTML = "";
      });
    });
  } catch {
    /* search can fail quietly while the title is still typed */
  }
}

async function loadTasks(projectId: string): Promise<void> {
  const select = app.querySelector("#task") as HTMLSelectElement | null;
  if (!select || !projectId) return;
  const state = await loadLocal();
  try {
    const res = await trackerCall(state.ccrmUrl, state.deviceKey, "GET", "tasks", {}, { projectId });
    select.innerHTML = `<option value="">${esc(t("No task", "Bez úlohy", "Nincs feladat"))}</option>` + (res.tasks || []).map((task: any) => `<option value="${esc(task.id)}">${esc(task.title)}</option>`).join("");
  } catch {
    select.innerHTML = `<option value="">${esc(t("No task", "Bez úlohy", "Nincs feladat"))}</option>`;
  }
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

async function suggestFromTab(): Promise<void> {
  const host = await currentHost();
  if (!host) return;
  await searchProjects("", (id, name) => {
    const input = app.querySelector("#project") as HTMLInputElement | null;
    if (input && !input.value) {
      input.value = name;
      void loadTasks(id);
    }
  });
}

async function start(input: { description: string; projectId: string; projectName: string; taskId: string; taskTitle: string; ticketId?: string }): Promise<void> {
  const state = await loadLocal();
  const at = new Date().toISOString();
  const body: Record<string, unknown> = {};
  if (input.description) body.description = input.description;
  if (input.projectId) body.projectId = input.projectId;
  if (input.taskId) body.taskId = input.taskId;
  if (input.ticketId) body.ticketId = input.ticketId;
  const optimistic = { startedAt: at, title: input.description || input.taskTitle || "Running", projectName: input.projectName, taskTitle: input.taskTitle };
  if (!navigator.onLine) {
    await enqueue({ kind: "start", at, body }, optimistic);
    await showTracker();
    return;
  }
  try {
    await trackerCall(state.ccrmUrl, state.deviceKey, "POST", "start", { ...body, startedAt: at });
    await saveLocal({ optimistic: null });
    await refreshBadge();
    await showTracker();
  } catch (error) {
    if (error instanceof TrackerError && error.code === "offline") {
      await enqueue({ kind: "start", at, body }, optimistic);
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
      // That exact work is already running (another tab or device started it): show it.
      await saveLocal({ optimistic: null });
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
    await refreshBadge();
    await showTracker();
  } catch (error) {
    if (error instanceof TrackerError && (error.code === "offline")) {
      await enqueue({ kind: "stop", at, body }, null);
      await showTracker();
      return;
    }
    if (error instanceof TrackerError && error.code === "ambiguous") {
      // Several timers run and this one had no id: repaint, which shows "N timers running".
      await saveLocal({ optimistic: null });
      await showTracker();
      return;
    }
    if (error instanceof TrackerError && error.code === "project_required") {
      const node = app.querySelector("#notice") ?? app.querySelector(".stack");
      if (node) node.innerHTML = (`<p class="error">${esc(errorMessage("project_required"))}</p><label>${esc(t("Project id", "ID projektu", "Projekt azonosító"))}<input id="stop-project" /></label><button id="stop-retry" class="stop" type="button">${esc(t("Stop", "Zastaviť", "Leállítás"))}</button>`);
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
