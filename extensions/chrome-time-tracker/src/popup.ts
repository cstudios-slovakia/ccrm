import "./popup.css";
import { EXTENSION_VERSION, badgeLabel, hostOnly } from "../../../src/utils/timeTrackerRules.ts";
import { TrackerError, trackerCall } from "./client.ts";
import { loadLocal, saveLocal, type QueueItem } from "./storage.ts";

declare const chrome: any;

const app = document.querySelector("#app") as HTMLElement;
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] || ch);

let clock: number | undefined;

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
  const link = `<a href="${esc(ccrmUrl)}/#time-tracking" target="_blank" rel="noreferrer">Open CCRM</a>`;
  const count = unsorted > 0 ? `<span class="amber">${esc(unsorted)} unsorted</span>` : "<span></span>";
  return `<div class="footer">${link}${count}</div>`;
}

function renderPair(error = ""): void {
  app.innerHTML = `
    <div class="stack">
      <h1>Connect CCRM</h1>
      <p class="muted">Enter the address of your CCRM and the one-time code from Time tracking → Settings.</p>
      <label>CCRM address<input id="url" placeholder="https://crm.example.com" autocomplete="url" /></label>
      <label>Pairing code<input id="code" placeholder="K7Q4-9MZT" autocapitalize="characters" /></label>
      ${error ? `<p class="error">${esc(error)}</p>` : ""}
      <button id="connect" class="primary" type="button">Connect</button>
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
    renderPair("Enter a full CCRM address.");
    return;
  }
  const button = app.querySelector("#connect") as HTMLButtonElement;
  button.disabled = true;
  try {
    const granted = await chrome.permissions.request({ origins: [`${url}/*`] });
    if (!granted) {
      renderPair("Chrome needs permission to reach that address.");
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
    const message = codeName === "code_expired" ? "That code has expired. Ask for a new one."
      : codeName === "code_used" ? "That code was already used."
      : codeName === "rate_limited" ? "Too many attempts. Wait and try again."
      : codeName === "extension_disabled" ? "The extension is turned off for this company."
      : codeName === "offline" ? "Could not reach CCRM."
      : "That code was not accepted.";
    renderPair(message);
  }
}

async function showTracker(): Promise<void> {
  const state = await loadLocal();
  if (!state.deviceKey || !state.ccrmUrl) {
    renderPair(state.lost.length ? "This browser is not paired. The actions below were not saved." : "");
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
    if (entry?.running) renderRunning(entry, recent, count.count || 0, rules, state.ccrmUrl);
    else renderIdle(recent, count.count || 0, rules, state.ccrmUrl);
  } catch (error) {
    if (error instanceof TrackerError && error.code === "not_paired") {
      const lost = (await loadLocal()).lost;
      await saveLocal({ deviceKey: "", userName: "", optimistic: null });
      renderPair("This browser was revoked. Pair it again.");
      if (lost.length) renderLost(lost);
      return;
    }
    if (error instanceof TrackerError && error.code === "offline") {
      if (state.optimistic) renderRunning({ running: true, title: state.optimistic.title, projectName: state.optimistic.projectName, startAt: state.optimistic.startedAt, titleSource: "entry" }, { entries: [], todaySeconds: 0 }, 0, { enabled: false }, state.ccrmUrl, true);
      else renderIdle({ entries: [], todaySeconds: 0 }, 0, { enabled: false }, state.ccrmUrl, true);
      return;
    }
    renderPair(error instanceof TrackerError ? error.code : "Could not reach CCRM.");
  }
}

function renderLost(lost: QueueItem[]): void {
  const list = lost.map((item) => `<li>${esc(item.kind)} · ${esc(new Date(item.at).toLocaleString())}</li>`).join("");
  app.insertAdjacentHTML("beforeend", `<div class="amber" style="margin-top:8px"><strong>Not sent</strong><ul>${list}</ul><button id="clear-lost" class="tiny" type="button">Dismiss</button></div>`);
  app.querySelector("#clear-lost")?.addEventListener("click", () => {
    void saveLocal({ lost: [] }).then(() => showTracker());
  });
}

function renderRunning(entry: any, recent: any, unsorted: number, rules: { enabled?: boolean }, ccrmUrl: string, offline = false): void {
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
    <div class="stack">
      ${offline ? `<p class="amber">Offline. Stop will be sent when you are back.</p>` : ""}
      <div>
        <h1>${esc(entry.title || "Running")}</h1>
        <p class="muted">${esc(subtitle || "No project yet")}</p>
      </div>
      <div class="elapsed" id="elapsed">0:00</div>
      <button id="stop" class="stop" type="button">Stop</button>
      <p class="muted">Today <strong id="today"></strong></p>
      ${recentRows(recent.entries || [])}
      ${captureRow(!!rules.enabled)}
      ${footer(unsorted, ccrmUrl)}
    </div>`;
  const todayNode = app.querySelector("#today");
  if (todayNode) todayNode.textContent = badgeLabel(today);
  paint();
  window.clearInterval(clock);
  clock = window.setInterval(paint, 1000);
  app.querySelector("#stop")?.addEventListener("click", () => void stop(entry));
  wireContinue(recent.entries || []);
  wireCapture(!!rules.enabled);
  wireOpen(ccrmUrl);
}

function renderIdle(recent: any, unsorted: number, rules: { enabled?: boolean }, ccrmUrl: string, offline = false): void {
  window.clearInterval(clock);
  app.innerHTML = `
    <div class="stack">
      ${offline ? `<p class="amber">Offline. A start is queued and sent later.</p>` : ""}
      <h1>What are you working on?</h1>
      <label>Title<input id="title" placeholder="Title" /></label>
      <label>Project<input id="project" placeholder="Search projects" /></label>
      <div id="project-list"></div>
      <label>Task<select id="task"><option value="">No task</option></select></label>
      <p id="form-error" class="error" hidden></p>
      <button id="start" class="primary" type="button">Start</button>
      <p class="muted">Today <strong>${esc(badgeLabel(recent.todaySeconds || 0))}</strong></p>
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
  wireContinue(recent.entries || []);
  wireCapture(!!rules.enabled);
  wireOpen(ccrmUrl);
  void suggestFromTab();
}

function recentRows(entries: any[]): string {
  if (!entries.length) return "";
  const rows = entries.slice(0, 3).map((entry, index) => `
    <div class="card spread">
      <span>${esc(entry.title || "Untitled")}<br /><span class="muted">${esc(entry.projectName || "")}</span></span>
      <button class="tiny continue" type="button" data-index="${index}">Continue</button>
    </div>`).join("");
  return `<div class="stack">${rows}</div>`;
}

function captureRow(enabled: boolean): string {
  return `<label class="check"><input id="capture" type="checkbox" ${enabled ? "checked" : ""} /> Remember watched sites while no timer is running</label>`;
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
      `<button class="tiny project" type="button" data-index="${index}" style="margin:2px">${esc(project.suggested ? "Suggested · " : "")}${esc(project.name)}</button>`,
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
    select.innerHTML = `<option value="">No task</option>` + (res.tasks || []).map((task: any) => `<option value="${esc(task.id)}">${esc(task.title)}</option>`).join("");
  } catch {
    select.innerHTML = `<option value="">No task</option>`;
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
      await saveLocal({ deviceKey: "", optimistic: null });
      renderPair("Pair this browser again.");
      return;
    }
    const node = app.querySelector("#form-error") as HTMLElement | null;
    if (node) {
      node.hidden = false;
      node.textContent = error instanceof TrackerError ? error.code : "Could not start.";
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
    if (error instanceof TrackerError && error.code === "project_required") {
      const node = app.querySelector(".stack");
      node?.insertAdjacentHTML("beforeend", `<p class="error">Pick a project in CCRM before stopping, or add one and stop again.</p><label>Project id<input id="stop-project" /></label><button id="stop-retry" class="stop" type="button">Stop</button>`);
      app.querySelector("#stop-retry")?.addEventListener("click", () => {
        body.projectId = (app.querySelector("#stop-project") as HTMLInputElement).value.trim();
        void trackerCall(state.ccrmUrl, state.deviceKey, "POST", "stop", { ...body, stoppedAt: at })
          .then(() => showTracker())
          .catch(() => undefined);
      });
      return;
    }
    if (error instanceof TrackerError && error.code === "not_paired") {
      await saveLocal({ deviceKey: "", optimistic: null, lost: [...state.lost, { id: crypto.randomUUID(), kind: "stop", at, body }] });
      renderPair("Pair this browser again. The stop was kept on this device.");
    }
  }
}

void showTracker();
