// CCRM Tasks Background Service Worker (Manifest V3)

chrome.runtime.onInstalled.addListener(() => {
  // Create context menu for creating tasks from highlighted text
  chrome.contextMenus.create({
    id: "ccrm-create-task-from-selection",
    title: "Create CCRM Task from selection",
    contexts: ["selection"]
  });

  // Set default CCRM base URL if not already configured
  chrome.storage.local.get(["ccrmBaseUrl"], (result) => {
    if (!result.ccrmBaseUrl) {
      chrome.storage.local.set({ ccrmBaseUrl: "http://localhost:5173" });
    }
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "ccrm-create-task-from-selection") {
    const selectedText = encodeURIComponent(info.selectionText || "");
    chrome.storage.local.get(["ccrmBaseUrl"], (result) => {
      const baseUrl = result.ccrmBaseUrl || "http://localhost:5173";
      const targetUrl = `${baseUrl}/#tasks?newTask=${selectedText}`;
      chrome.tabs.create({ url: targetUrl });
    });
  }
});
