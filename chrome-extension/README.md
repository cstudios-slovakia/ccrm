# CCRM Tasks — Chrome Browser Extension

Official Chrome browser extension for CCRM that brings your tasks dashboard, voice task recording, and task status management directly into your daily web browsing workflow.

---

## Features

- **Full Task Dashboard Inside Chrome**:
  - View Missed, Today, and Upcoming task buckets.
  - Interactive status toggles & drag-and-drop status changes.
  - Real-time sync with CCRM.
- **Voice Task Recording**:
  - Record task memos with one click using your microphone.
  - Automatically transcribed and parsed via CCRM's AI engine (`transcribe_task.php`).
- **Filter by Assigner & Assignee**:
  - Filter tasks by who assigned them to you (the person who created the task).
  - Filter by project, client, or tag with removable chips.
- **Side Panel & Popup Modes**:
  - **Side Panel**: Dock CCRM Tasks on the right side of Chrome while browsing any website or web application.
  - **Popup**: Click the extension icon in the Chrome toolbar for quick access.
- **Highlight-to-Task Context Menu**:
  - Select any text on any web page, right-click, and choose **"Create CCRM Task from selection"**.
- **Configurable CCRM URL**:
  - Works with local development (`http://localhost:5173`) or remote production instances.

---

## Installation Guide (Chrome Developer Mode)

1. Open Google Chrome.
2. Navigate to `chrome://extensions/` in the address bar.
3. Turn on the **Developer mode** toggle in the top right corner.
4. Click the **Load unpacked** button in the top left corner.
5. Select the `chrome-extension` directory located in the CCRM project root:
   ```
   path/to/ccrm-app/chrome-extension
   ```
6. The **CCRM Tasks** extension is now installed!
7. *(Recommended)* Click the puzzle piece icon in the Chrome toolbar and pin **CCRM Tasks** for one-click access.

---

## Configuration & Usage

### 1. Setting Your CCRM URL
By default, the extension points to `http://localhost:5173`.
To change it:
- Click the extension icon.
- Click the **Settings (gear)** icon in the top right.
- Enter your CCRM Base URL (e.g., `https://crm.yourcompany.com` or `http://localhost:5173`).
- Click **Save & Connect**.

### 2. Docking in Chrome Side Panel
- Click the extension icon and click **"Side Panel"**.
- The task board opens persistently on the side of your browser, allowing you to manage tasks while reading emails, reviewing client proposals, or browsing other tools.

### 3. Voice Task Recording
- Click the microphone icon in the voice task action bar.
- Speak your task (e.g. *"Call Peter tomorrow at 2 PM regarding the new office lease"*).
- Stop recording — CCRM automatically transcribes and schedules the task!
