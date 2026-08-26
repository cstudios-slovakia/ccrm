# Chrome DevTools Recorder Guide for CCRM

The Chrome DevTools Recorder allows you to record user journeys directly in Google Chrome and export them for automated regression testing in CCRM.

---

## 1. How to Record a User Journey in Chrome

1. Open Google Chrome and navigate to the local CCRM app: `http://localhost:5173`.
2. Open Chrome DevTools (`F12` or `Ctrl + Shift + I` / `Cmd + Option + I`).
3. Click the **Recorder** tab in DevTools (if not visible, click the `+` or `⋮` icon -> `More tools` -> `Recorder`).
4. Click **Create a new recording**.
5. Name your recording (e.g. `create-lead-flow` or `task-creation-check`).
6. Click **Start recording** at the bottom.
7. Perform the user actions in the app:
   - Click buttons
   - Fill inputs
   - Open dropdowns or modals
   - Switch tabs
8. Click **End recording**.

---

## 2. How to Export the Recording

1. In the Recorder panel header, click the **Export** icon (downward arrow).
2. Choose **JSON**.
3. Save the exported `.json` file into the `tests/recordings/` folder (e.g. `tests/recordings/my-flow.json`).

---

## 3. How to Run the Recorded Flow

Run the recorded flow through the CCRM automated runner:

```bash
# Run in background headless mode (fast)
node scripts/qa/run-recorder.mjs tests/recordings/my-flow.json

# Run in visual headed mode (watch Chrome execute live)
node scripts/qa/run-recorder.mjs tests/recordings/my-flow.json --headed
```
