---
name: "ccrm-qa-audit"
description: "Automated QA exploration, UI/UX audit, button & form testing, and Chrome DevTools Recorder replay for CCRM"
---

# CCRM QA Audit & Automated Testing Skill

Use this skill when you need to audit, crawl, or automatically test views, buttons, forms, dropdowns, and user interactions across the CCRM web application.

---

## 1. Core Capabilities & Workflows

### A. Full Automated App Crawler (`npm run test:qa`)
Systematically navigates all registered routes and views in the application:
- Dashboard, Leads/Pipeline, Clients Register, Projects, Warehouse, Financial Management, Meeting Room, Files Manager, Email Hub, Automations, System Settings.
- Exercises header buttons, view switchers, and filter pills.
- Validates that every view renders cleanly without 500 errors, blank screens, or unhandled exceptions.

### B. Deep Feature Suites (`npm run test:qa`)
- **Task Dashboard & Modals** (`tests/e2e/task-dashboard.spec.ts`): Verifies "+ New Task" drawer, inputs, priority buttons, and custom deadline time pickers.
- **Client Register & Sub-Tabs** (`tests/e2e/client-register.spec.ts`): Verifies client details navigation, timeline history, attached files, offers, and note tabs.

### C. Chrome DevTools Recorder Replay (`npm run test:qa:recorder`)
- Replays recorded JSON user journeys exported directly from Google Chrome DevTools (`Inspect` -> `Recorder`).
- Can execute custom recording files:
  ```bash
  node scripts/qa/run-recorder.mjs path/to/recording.json [--headed]
  ```

---

## 2. Instructions for AI Agents

Whenever the user asks to "test the app", "audit all buttons", "check for UI errors", or "verify recent changes":

1. **Verify Dev Server is Running**:
   - Ensure `http://localhost:5173` is active (or run `npm run dev` in the background).
2. **Execute the QA Suite**:
   - Run the automated test suite:
     ```powershell
     npm run test:qa
     ```
3. **Inspect Output & Artifacts**:
   - Read the generated report at `test-results/qa-audit-report.md`.
   - Check screenshots in `test-results/screenshots/` if visual defects were flagged.
4. **Diagnose & Report Findings**:
   - Map each failed step to the corresponding component in `src/`.
   - Explain the **Observed Symptom**, **Expected Behavior**, and **Root Cause**.
   - Provide the **Proposed Code Fix** with code references and clear line numbers.
   - Present the structured report to the user without making destructive edits until approved.
