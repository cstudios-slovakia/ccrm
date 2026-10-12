// CCRM Tasks Popup Controller

const DEFAULT_URL = "http://localhost:5173";

const iframe = document.getElementById("tasksIframe");
const btnSidePanel = document.getElementById("btnSidePanel");
const btnOpenTab = document.getElementById("btnOpenTab");
const btnReload = document.getElementById("btnReload");
const btnSettings = document.getElementById("btnSettings");
const btnCloseSettings = document.getElementById("btnCloseSettings");
const btnCancelSettings = document.getElementById("btnCancelSettings");
const btnSaveSettings = document.getElementById("btnSaveSettings");
const btnRetry = document.getElementById("btnRetry");
const btnConfigure = document.getElementById("btnConfigure");

const settingsModal = document.getElementById("settingsModal");
const urlInput = document.getElementById("urlInput");
const offlineState = document.getElementById("offlineState");
const offlineDesc = document.getElementById("offlineDesc");

let currentBaseUrl = DEFAULT_URL;

// Load configured URL and initialize iframe
function init() {
  chrome.storage.local.get(["ccrmBaseUrl"], (result) => {
    currentBaseUrl = result.ccrmBaseUrl || DEFAULT_URL;
    urlInput.value = currentBaseUrl;
    loadIframe(currentBaseUrl);
  });
}

function getEmbedUrl(base) {
  // Normalize base URL (strip trailing slashes)
  const cleanBase = base.replace(/\/+$/, "");
  return `${cleanBase}/#tasks?embed=tasks`;
}

function loadIframe(base) {
  offlineState.classList.remove("active");
  const targetUrl = getEmbedUrl(base);
  iframe.src = targetUrl;

  // Set timeout to detect failed connection
  const checkTimer = setTimeout(() => {
    // If iframe couldn't connect, notify user
    try {
      fetch(base, { mode: "no-cors" }).catch(() => {
        showOfflineState(base);
      });
    } catch {
      showOfflineState(base);
    }
  }, 4000);

  iframe.onload = () => {
    clearTimeout(checkTimer);
    offlineState.classList.remove("active");
  };

  iframe.onerror = () => {
    clearTimeout(checkTimer);
    showOfflineState(base);
  };
}

function showOfflineState(url) {
  offlineDesc.textContent = `Could not reach CCRM at ${url}. Please verify that CCRM is running or configure the server URL.`;
  offlineState.classList.add("active");
}

// Side Panel Button
btnSidePanel.addEventListener("click", async () => {
  if (chrome.sidePanel && chrome.sidePanel.open) {
    try {
      const windowObj = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: windowObj.id });
      window.close(); // Close popup once sidepanel opens
    } catch (e) {
      console.warn("Could not open side panel:", e);
      // Fallback: open sidepanel page in a tab or window
      chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html") });
    }
  } else {
    chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html") });
  }
});

// Open full CCRM tab
btnOpenTab.addEventListener("click", () => {
  const cleanBase = currentBaseUrl.replace(/\/+$/, "");
  chrome.tabs.create({ url: `${cleanBase}/#tasks` });
});

// Reload
btnReload.addEventListener("click", () => {
  loadIframe(currentBaseUrl);
});

// Settings Modal controls
function openSettings() {
  urlInput.value = currentBaseUrl;
  settingsModal.classList.add("active");
}

function closeSettings() {
  settingsModal.classList.remove("active");
}

btnSettings.addEventListener("click", openSettings);
btnConfigure.addEventListener("click", openSettings);
btnCloseSettings.addEventListener("click", closeSettings);
btnCancelSettings.addEventListener("click", closeSettings);

// Preset clicks
document.querySelectorAll(".preset-pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    urlInput.value = btn.getAttribute("data-url");
  });
});

// Save settings
btnSaveSettings.addEventListener("click", () => {
  let val = (urlInput.value || "").trim();
  if (!val) val = DEFAULT_URL;
  if (!/^https?:\/\//i.test(val)) {
    val = "http://" + val;
  }
  currentBaseUrl = val;
  chrome.storage.local.set({ ccrmBaseUrl: val }, () => {
    closeSettings();
    loadIframe(val);
  });
});

btnRetry.addEventListener("click", () => {
  loadIframe(currentBaseUrl);
});

// Start
init();
