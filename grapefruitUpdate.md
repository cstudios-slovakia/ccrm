# CCRM Grapefruit Update Log

Changelog of modifications, integrations, and new features introduced in the Grapefruit version.

---

## 1. Visual & Frontend Experience
- **Animated LightRays Background**: Replaced the 3D shader canvas on the login view with the React Bits `<LightRays>` WebGL component.
- **Left-Origin Fullscreen Layout**: Modified the light rays configuration to be fullscreen (removed the static 1080px wrapper constraint) and originate from the left: `raysOrigin="left"`.

## 2. Docker & Environment Build Fixes
- **Build Entrypoint Cache Resolution**: Resolved a major compilation issue where `index.html` was pointing to a static pre-compiled bundle, causing Vite to bypass the `src/` directory. Restored entry script to `/src/main.tsx` for proper compilation.
- **Explicit Naming**: Added `container_name: crm` under the `web` service in `docker-compose.yml`.
- **Stack Rebuild**: Successfully built the 1800+ React source modules, updated root assets, cleared Buildkit daemon VM I/O errors by resetting services, and re-launched the container as `crm`.

## 3. Branch Merge (`fig-tree-patch` -> `1.6-grapefruit`)
- **Core Update Integration**: Merged all updates and bugfixes from the remote development branch `origin/fig-tree-patch`.
- **Conflict Resolution**:
  - `src/utils/version.ts`: Preserved Grapefruit version `"1.6.0"`.
  - `index.html`: Merged the correct `/src/main.tsx` script entry point.
- **Cleaned Obsolete Files**: Removed old compiled tracking files in `dist/` (which are now git-ignored).

## 4. Custom Dynamic AI Dashboards (Stage 1)
- **Database Schema**: Created the `custom_dashboards` table in `api/schema.php` and `public/api/schema.php` to store names, icons, colors, prompts, and layout JSON configs.
- **Real-Time State Sync**: Modified `sync.php` and `public/sync.php` to include `custom_dashboards` in the sync versioning checksum and real-time state save loop.
- **Secure Pre-defined Query API**: Created `public/api/dashboard_query.php` supporting read-only analytical queries (counts, values, status/source group stats, recent items).
- **AI Completion Generator**: Created `public/api/generate_dashboard.php` which sends user prompts and history to the OpenAI Chat Completion API to get the layout JSON.
- **Type Definitions**: Appended `CustomDashboard` interface definitions to `src/types/index.ts`.
  - Expanded `lucide-react` imports to include dashboard icons (`LineChart`, `PieChart`, `TrendingUp`, `Activity`, `Layers`, `Plus`).
  - Added new state hooks for custom dashboard creation and "+ New Dashboard" creator modal inside `Sidebar.tsx`.
- **Dynamic Dashboard Canvas View**: Created `src/components/DynamicDashboardView.tsx` implementing a responsive 12-column CSS Grid layout, multi-line prompts input with model selector, floating prompt bar in edit mode, safe analytical query calls, and responsive `Chart.js` graphs styled with themed color palettes. Added smart metric formatter that auto-detects and formats single-row, single-column SQL results (like counts, values, averages) into human-readable cards.
- **Application State Wiring**: Bound custom dashboard collections inside `src/App.tsx` state, synchronized edits automatically with backend transactional endpoints, and mapped route tab hashes (e.g., `#dash_`) to the newly built dashboard canvas.
- **Advanced Dynamic Querying API**: Enhanced [dashboard_query.php](file:///Users/erik/Documents/vibe%20coding/crm/public/api/dashboard_query.php) to support a custom `sql` query action. Implemented a strict whitelist-based query security parser that queries the database schema to block access to unauthorized system tables and forbids DDL/write commands.
- **Pre-Prompt Visual & Schema Instructions**: Expanded [generate_dashboard.php](file:///Users/erik/Documents/vibe%20coding/crm/public/api/generate_dashboard.php) system prompts to include columns and structure mappings for all major database tables (`leads`, `tasks`, `meeting_notes`, `meeting_tasks`, `rag_emails`, `email_summaries`, `unified_entries`, and dynamic `ue_*` tables). Instructed the AI model on premium design layouts (12-column grid budgeting, curated theme palettes, semantic widget matching).
- **Compilation & Verification**: Executed production builds cleanly with zero TypeScript compiler errors and published assets. Replaced the model selector dropdowns with clean, purple range slider controls (accent-purple-600) representing simple, smart, and expert power levels without exposing raw model strings. Decoupled the floating prompt input bar from the widgets scroll box using viewport-fixed absolute containment to prevent focusing from scrolling widgets out of view. Prevented background database synchronization ticks from resetting unsaved generated layout changes by utilizing dashboard ID reference ref checks inside state-sync hooks. Resolved custom dashboards disappearing upon tab switching by replacing the un-guaranteed PDO `rowCount()` query checks on `SHOW TABLES` inside `sync.php` and `public/sync.php` with direct, try-catch-wrapped SELECT queries. Integrated a right-side sliding "Dashboard Layout Guide" (UX help drawer) complete with mini CSS graph previews, color semantics guidelines, and grid breakdown rules. Expanded the UX guide to include interactive components (Accordions, Tabs, Progress Goals, Timelines) and advanced graph visualizers (Area, Radar, Scatter, Horizontal Bar). Hided the header Help button outside of active editor mode and linked the edit close button to auto-dismiss the help panel. Added an on-hover dashboard delete button (`Trash2` icon) inside the hidden/inactive navigation sidebar items list to cleanly wipe custom dashboards and update nav states. Incremented minor system version to `"1.6.11"`.
