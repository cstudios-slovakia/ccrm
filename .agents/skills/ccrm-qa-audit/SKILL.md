---
name: "ccrm-qa-audit"
description: "Automated QA exploration, UI/UX audit, button & form testing, and Chrome DevTools Recorder replay for CCRM"
---

# CCRM QA Audit & Automated Testing Skill

Use this skill when you need to audit, crawl, or automatically test views, buttons, forms, dropdowns, and user interactions across the CCRM web application.

---

## 1. Core Capabilities & Architecture

### A. Deep Autonomous UI/UX Crawler (`npm run test:qa`)
Systematically crawls all 12 registered application views in ~50 seconds without hardcoded defect scripts:
- **12 Views Tested**: Dashboard, Leads / Pipeline, Clients Register, Projects, Warehouse, Financial Management, Meeting Room, Files Manager, Email Hub, Automation, Update Notes, System Settings.
- **Dynamic Occlusion Detection (`UIExplorer.auditDropdownOcclusion`)**: Uses real browser geometry and `document.elementFromPoint(x, y)` to dynamically detect visual occlusion bugs (e.g. dropdown listboxes rendered behind modal bodies, drawers, or backdrop layers due to z-index mismatches).
- **Sub-Tab & Route Auditing (`UIExplorer.auditSubTabs` & `auditTableRows`)**: Intercepts sub-tabs, filter pills, and direct URL query routing.
- **Modal & Drawer Action Auditing (`UIExplorer.auditModalsAndDrawers`)**: Discovers action triggers (+ Nový, Pridať, Filter, calendar cells), tests controls in opened drawers, and cleanly dismisses them.
- **Empirical Failure Logging**: Emits clean diagnostics (defect category, symptoms, bounding box dimensions, occluding layer tags, and screenshots) to `test-results/qa-audit-report.md`.

### B. Chrome DevTools Recorder Replay (`npm run test:qa:recorder`)
- Replays recorded JSON user journeys exported directly from Google Chrome DevTools (`Inspect` -> `Recorder`).
- Can execute custom recording files:
  ```bash
  node scripts/qa/run-recorder.mjs path/to/recording.json [--headed]
  ```

---

## 2. Instructions for AI Agents

Whenever the user asks to "test the app", "audit all buttons", "check for UI errors", or "verify recent changes":

1. **Verify Dev Server is Running**:
   - Ensure `http://localhost:5173` is active (or let Playwright launch it automatically).
2. **Execute the QA Suite**:
   - Run the automated test suite:
     ```powershell
     npm run test:qa
     ```
3. **Inspect Output & Artifacts**:
   - Read the generated report at `test-results/qa-audit-report.md`.
   - Check screenshots in `test-results/screenshots/` for visual occlusions or error banners.
4. **Diagnose & Author Solutions**:
   - Trace the empirical findings from the report back to the source component in `src/`.
   - Explain the **Observed Symptom**, **Root Cause**, and **Proposed Solution**.
   - Present findings and fix options cleanly to the user.
