# GEELY SYSTEM CRM System Context File

This file serves as the primary source of truth for subsequent development sessions, detailing the architectural stack, state persistence, design systems, and hosting credentials.

---

## 1. Project Architecture

*   **Frontend Stack**: React 19 (compiled via Vite) + TypeScript + Tailwind CSS.
*   **Backend Roadmap**: **Laravel** (Backend integration will be implemented in the next phase).
*   **State Management**: Fully client-side state managed in the root [App.tsx](file:///Users/erik/Documents/vibe%20coding/crm/src/App.tsx) and reactively synchronized to `localStorage` under the `crm_*` keys.
*   **Data Seeding**: Seeding, loading, resetting, and saving logic is isolated in [mockData.ts](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/mockData.ts). On initial load, a high-fidelity dataset is populated (leads, appointments, tasks, campaigns, time records, employee folders, custom forms).
*   **Dynamic Branding & Preferences**: The system brand name is configurable inside the Settings tab, defaulting to `"GEELY SYSTEM"`, which dynamically re-brands all sidebar labels, header metadata, and document generator templates. State is saved inside `localStorage.getItem("crm_system_name")`.

---

## 2. Design System & Styling Stack

*   **Primary Theme**: Airy Light-Mode Pastel Gradient (baby-blue to lavender and peach-orange) active by default.
*   **Font families**: `Outfit` (Headings, statistics) and `Inter` (Body layout, labels, cards).
*   **Glassmorphism**: `.glass-panel` utilizes a `backdrop-blur(20px)` filter coupled with highly translucent borders (`rgba(255, 255, 255, 0.6)`) and soft white backgrounds.
*   **Floating Elements**: Floating white vertical collapsible sidebar, floating custom AI "Dianai Companion" chat bubble, and custom right-aligned rounded KPI card capsules matching the Geely design.
*   **Animations**: Native CSS transitions using `@starting-style` and `transition-behavior: allow-discrete` to achieve smooth entry/exit fade-and-scale animations for dialog popups and slide-over drawers without Javascript libraries.
*   **Icons**: Lucide React.
*   **Charts**: Custom, lightweight, responsive SVG containers with glow filters, avoiding version conflicts or rendering lag from heavy third-party plotting dependencies.

---

## 3. Core Workspace Modules

1.  **Command Dashboard**: executive KPI cards, interactive SVG ROI outlays, and today's schedule summaries.
2.  **Sales Pipeline**: Columns representing the sales funnel stages (Lead, Contacted, Proposal, Negotiating, Won, Lost), quick move triggers, and details inspection sheets with dynamic comment flows.
3.  **Document Generator**: Form customizable proposal/quote/contract templates, auto-replacing contact name/worth/date variables, live A4 print rendering preview.
4.  **Booking Calendar**: Dynamic May 2026 scheduling grid, pending/confirmed meeting slot managers, and 2-way calendar sync simulation switches (Google Calendar & Outlook).
5.  **Channel ROI**: Spends vs. Revenue conversion matrix table logging outlays and calculating Customer Acquisition Costs (CAC).
6.  **Dynamic Forms**: Interactive form editor fields, live HTML/CSS copy-paste embed code generator, simulated submissions trigger (auto-submitting test responses pushes a brand-new lead to the Sales Pipeline Kanban board!).
7.  **Newsletter Modules**: Targeted list segments campaigns dispatches and analytics open/click reports.
8.  **Task Manager**: Multi-stage (Todo, In Progress, Blocked, Done) boards, PM assignees, and priority trackers.
9.  **Time Tracker**: active stopwatch timer widget, manually logged sessions sheet, and project ratio charts.
10. **HR Registry**: Employee folders list, leaf/vacation calendar approval flow.

---

## 4. Hosting & Deployment Credentials

*   **Deployment Endpoint**: `crm.laminam.sk` (and/or `laminam.sk/sub/crm/`)
*   **Temporary Server SSH**:
    *   **Host**: `uid154715@shell.r5.websupport.sk`
    *   **Port**: `25009`
    *   **Password**: `4d9ced823d`
*   **Database Config (For Laravel phase)**:
    *   **Address**: `db.r5.websupport.sk`
    *   **Port**: `3306`
    *   **Database Name**: `Dg1SeyNV`
    *   **Login**: `JQLZ4I98`
    *   **Password**: `[2.^~8L])EdPgu|Fc1*}`

---

## 5. Development Gotchas

*   **TypeScript Custom Elements**: Custom popover attributes (`popover`, `popovertarget`) are supported natively in React 19, but are declared using lowercase strings in TypeScript.
*   **Dynamic Data Seeding**: If the database states appear corrupted or need cleaning during testing, tap the user's avatar in the top right header to invoke the "Reset Mockup Database" utility, which resets `localStorage` and triggers HMR hot-reloads.
*   **Database Interconnection Docs**: An extensive directory of persistence documentation has been created at `docs/db_integration_notes/` detailing schema DDLs, REST API JSON schemas, offline synchronizations, RBAC matrices, and package wizards.
*   **Lead Detail Timeline**: The Leads details slideout card features a responsive chevrons state bar at its top edge reflecting in-progress form values, expanding from 4px to 20px on hover to render clear stage text labels (white on colored active, dark on inactive slate, no text shadows).
