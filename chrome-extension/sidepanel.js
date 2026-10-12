// CCRM Tasks Side Panel Controller

const DEFAULT_URL = "http://localhost:5173";

const iframe = document.getElementById("tasksIframe");
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

function init() {
  chrome.storage.local.get(["ccrmBaseUrl"], (result) => {
    currentBaseUrl = result.ccrmBaseUrl || DEFAULT_URL;
    urlInput.value = currentBaseUrl;
    loadIframe(currentBaseUrl);
  });
}

function getEmbedUrl(base) {
  const cleanBase = base.replace(/\/+$/, "");
  return `${cleanBase}/#tasks?embed=tasks`;
}

function loadIframe(base) {
  offlineState.classList.remove("active");
  const targetUrl = getEmbedUrl(base);
  iframe.src = targetUrl;

  const checkTimer = setTimeout(() => {
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
  offlineDesc.textContent = `Could not reach CCRM at ${url}.`;
  offlineState.classList.add("active");
}

btnOpenTab.addEventListener("click", () => {
  const cleanBase = currentBaseUrl.replace(/\/+$/, "");
  chrome.tabs.create({ url: `${cleanBase}/#tasks` });
});

btnReload.addEventListener("click", () => {
  loadIframe(currentBaseUrl);
});

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

document.querySelectorAll(".preset-pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    urlInput.value = btn.getAttribute("data-url");
  });
});

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

init();
