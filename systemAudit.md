# CCRM System & `/ponytail-audit` Report (`v1.12.25-Mango`)

**Date:** 2026-10-15  
**Scope:** Whole-repository audit (`src/`, `api/`, `public/`, `sync.php`, `tests/`, `package.json`)  
**Mode:** Read-only audit — **no source, backend, or test files were modified.**

---

## 1. `/ponytail-audit` (Ranked Biggest Cut First)

`delete:` Complete duplicate PHP backend mirror under `public/` (`public/sync.php` + 56 files in `public/api/*.php` + `public/api/Swarm/*` = ~32,800 lines, 100% byte-identical to root `sync.php` and `api/`). Serve from a single canonical directory or symlink during build/deploy. [`public/sync.php`](file:///Users/erik/Documents/vibe%20coding/crm/public/sync.php), [`public/api/`](file:///Users/erik/Documents/vibe%20coding/crm/public/api)

`delete:` 5 unused 3D/WebGL npm dependencies with 0 live imports in the application (`three`, `@react-three/fiber`, `@react-three/drei`, `shadergradient`, `ogl`). Nothing. [`package.json`](file:///Users/erik/Documents/vibe%20coding/crm/package.json#L20-L43)

`delete:` Dead modal components superseded by screen views (`EmployeeFormModal.tsx` 887L, `EmployeeSettingsModal.tsx` 626L, `UpdateNotesModal.tsx` 162L — 0 callers across `src/`). Nothing. [`src/components/employees/EmployeeFormModal.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/employees/EmployeeFormModal.tsx), [`src/components/employees/EmployeeSettingsModal.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/employees/EmployeeSettingsModal.tsx), [`src/components/UpdateNotesModal.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/UpdateNotesModal.tsx)

`delete:` 3 orphaned PHP endpoints with 0 callers in the frontend or backend (`api/seed_demo_data.php` 553L, `api/ares_cz.php` 102L superseded by `api/company_registry.php`, `api/manifest.php` 60L superseded by `src/utils/pwaManifest.ts`). Nothing. [`api/seed_demo_data.php`](file:///Users/erik/Documents/vibe%20coding/crm/api/seed_demo_data.php), [`api/ares_cz.php`](file:///Users/erik/Documents/vibe%20coding/crm/api/ares_cz.php), [`api/manifest.php`](file:///Users/erik/Documents/vibe%20coding/crm/api/manifest.php)

`delete:` Unreferenced WebGL shader component `LightRays.tsx` (451L), unused SAI translation table `saiTranslations.ts` (166L), unused `FeralSkyGradient.tsx` wrapper (13L), and unused `agentation.d.ts` (35L). Nothing. [`src/components/LightRays.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/LightRays.tsx), [`src/components/sai/saiTranslations.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/sai/saiTranslations.ts), [`src/components/FeralSkyGradient.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/FeralSkyGradient.tsx), [`src/types/agentation.d.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/types/agentation.d.ts)

`native:` `framer-motion` (only 9 callers across 120+ components) used for simple modal fade/scale, dropdowns, and accordion height transitions. Native CSS transitions, `@starting-style`, and `<dialog>`. [`package.json`](file:///Users/erik/Documents/vibe%20coding/crm/package.json#L32), [`src/components/ui/ConfirmDialog.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/ui/ConfirmDialog.tsx), [`src/components/ui/CustomSelect.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/ui/CustomSelect.tsx)

`native:` `@fancyapps/ui` (Fancybox) pulled in for a single image lightbox wrapper (`ZoomableUpdateImage.tsx`). Native HTML `<dialog>` with an `<img>`. [`package.json`](file:///Users/erik/Documents/vibe%20coding/crm/package.json#L17), [`src/components/ZoomableUpdateImage.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/ZoomableUpdateImage.tsx)

`native:` `clsx` + `tailwind-merge` + `cn()` helper (only 23 callers out of 120+ components; 80%+ of the repo already uses template literals). Template literals or `[a, b].filter(Boolean).join(" ")`. [`package.json`](file:///Users/erik/Documents/vibe%20coding/crm/package.json#L28-L41), [`src/utils/cn.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/cn.ts)

`yagni:` `ProjectTasksPanel.tsx` (67L) is a pure pass-through prop wrapper around `EntityTasksPanel` with 1 caller (`ProjectDetailsView.tsx`). Render `<EntityTasksPanel entityType="project" ... />` directly. [`src/components/ProjectTasksPanel.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/ProjectTasksPanel.tsx)

`yagni:` Single-function micro-files with 1–2 callers (`warehousePricing.ts` 14L, `taskApi.ts` 17L, `documentNumbering.ts` 19L, `passwordRules.ts` 23L, `moduleRequirements.ts` 26L, `hash.ts` 27L). Co-locate with their single caller or domain module. [`src/utils/warehousePricing.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/warehousePricing.ts), [`src/utils/taskApi.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/taskApi.ts), [`src/utils/documentNumbering.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/documentNumbering.ts), [`src/utils/passwordRules.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/passwordRules.ts), [`src/utils/moduleRequirements.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/moduleRequirements.ts), [`src/utils/hash.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/hash.ts)

`yagni:` Hardcoded always-true feature flags in `featureFlags.ts` (`SOCIAL_MEDIA_ENABLED = true`, `VIEW_SIZE_ENABLED = true`). Inline or remove dead conditional branches. [`src/utils/featureFlags.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/featureFlags.ts)

`stdlib:` Custom `AbortController` + `setTimeout` wrapper in `fetchWithTimeout.ts` (18L) that also clobbers caller-supplied signals. Use platform `AbortSignal.timeout(ms)` / `AbortSignal.any([init.signal, AbortSignal.timeout(ms)])`. [`src/utils/fetchWithTimeout.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/fetchWithTimeout.ts)

net: -36,332 lines, -9 deps possible.

---

## 2. Security Problems

### 🔴 CRITICAL — Unauthenticated Database Seeding & Overwrite
- **Location:** [`api/seed_demo_data.php`](file:///Users/erik/Documents/vibe%20coding/crm/api/seed_demo_data.php#L1-L553) and [`public/api/seed_demo_data.php`](file:///Users/erik/Documents/vibe%20coding/crm/public/api/seed_demo_data.php#L1-L553)
- **Issue:** Has zero authentication (`ccrm_require_auth()` / `ccrm_require_admin()` are never called) and no `php_sapi_name() === 'cli'` guard. Any anonymous `GET /api/seed_demo_data.php` runs `ccrm_apply_schema($pdo)` and `INSERT ... ON DUPLICATE KEY UPDATE` of 21 demo `financial_categories` (`fcat_01`..`fcat_21`) and 25 demo `financial_records` (`frec_100`..`frec_124`) directly into the production database, and echoes raw PDO exception details on failure (`echo "ERROR: " . $e->getMessage()`).

### 🟠 HIGH — Unauthenticated Public Ticket Enumeration & Unauthorized DB Write via `public_status`
- **Location:** [`api/tickets.php`](file:///Users/erik/Documents/vibe%20coding/crm/api/tickets.php#L533-L570)
- **Issue:** `GET /api/tickets.php?action=public_status&hash=<value>` is public (no session required), does **not** check `ticket_widget_enabled = 1`, and falls back to matching `$hash === $cand['id']` (the predictable project ID, e.g. `project-1`) or `'pub_' . $id . '_status'`.
- **Impact:** Any unauthenticated user who passes a project ID as `hash` will:
  1. Trigger an unauthenticated `UPDATE projects SET ticket_public_hash = ? WHERE id = ?` if `ticket_public_hash` was previously empty ([L562-L564](file:///Users/erik/Documents/vibe%20coding/crm/api/tickets.php#L562-L564)).
  2. Receive all non-archived tickets, descriptions, statuses, and non-internal messages for that project.

### 🟠 HIGH — Spoofable `Origin` / `Referer` Authentication on Ticket Widget API
- **Location:** [`api/ticket_widget.php`](file:///Users/erik/Documents/vibe%20coding/crm/api/ticket_widget.php#L83-L143)
- **Issue:** Domain whitelisting relies solely on the HTTP `Origin` or `Referer` request header (`$_SERVER['HTTP_ORIGIN']` / `$_SERVER['HTTP_REFERER']`) and reflects `Access-Control-Allow-Origin: $originHeader`.
- **Impact:** `Origin` and `Referer` headers are trivially spoofed by any non-browser HTTP client (`curl -H "Origin: https://whitelisted-domain.com"`). Anyone who knows or guesses a project's `projectId` (or public hash) can call `action=list` to dump the 50 most recent tickets and all message threads, or `action=submit` / `action=followup` (when `ticket_allowed_emails` is empty).

### 🟠 HIGH — Stored XSS via Unsanitized `innerHTML` in `BlockEditor.tsx`
- **Location:** [`src/components/BlockEditor.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/BlockEditor.tsx#L65-L69)
- **Issue:** `EditableBlock` assigns `elementRef.current.innerHTML = content` directly inside `useEffect` without any HTML sanitizer (unlike [`TicketRichHtmlEditor.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/tickets/TicketRichHtmlEditor.tsx), which passes HTML through [`sanitizeTicketHtml`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/ticketHtml.ts)).
- **Impact:** Because `BlockEditor` renders shared meeting notes, client/lead notes, and AI-generated content synced across users, any malicious payload (`<img src=x onerror=...>`) stored in a note executes arbitrary JavaScript in every team member's browser session.

### 🟡 MEDIUM — Authenticated Arbitrary Email Relay (`send_email_reply`)
- **Location:** [`api/tickets.php`](file:///Users/erik/Documents/vibe%20coding/crm/api/tickets.php#L700-L730)
- **Issue:** Any authenticated user (with no module-level RBAC check for `tickets`) can `POST /api/tickets.php?action=send_email_reply` with arbitrary `toEmail`, `subject`, and `body`. The handler never verifies that `ticketId` exists or that `toEmail` matches the ticket reporter's email address, turning the support desk SMTP configuration into an open relay for any logged-in account.

### 🟡 MEDIUM — Missing Module-Level RBAC Enforcement in `api/orders.php` & `api/swarm.php`
- **Location:** [`api/orders.php`](file:///Users/erik/Documents/vibe%20coding/crm/api/orders.php#L15), [`api/swarm.php`](file:///Users/erik/Documents/vibe%20coding/crm/api/swarm.php#L18)
- **Issue:** Both endpoints call `ccrm_require_auth()` (checking only that a session exists) without checking `ccrm_user_permissions($pdo, $user)` for the `orders` or `sai` modules.
  - A user whose role has `orders: "none"` can still read all orders, upsert orders, or delete orders via `/api/orders.php`.
  - Any authenticated user can call `/api/swarm.php?action=llm_proxy` to proxy arbitrary prompts through the server's OpenAI API key ([L91-L162](file:///Users/erik/Documents/vibe%20coding/crm/api/swarm.php#L91-L162)) or create/drop `sim*` tables.

### 🟡 MEDIUM — Unbounded Base64 Attachments in Public Ticket Widget
- **Location:** [`api/ticket_widget.php`](file:///Users/erik/Documents/vibe%20coding/crm/api/ticket_widget.php#L238-L246) and [L324-L331](file:///Users/erik/Documents/vibe%20coding/crm/api/ticket_widget.php#L324-L331)
- **Issue:** `action=submit` and `action=followup` accept up to 5 attachment objects containing raw `dataUrl` strings without server-side byte-length caps or MIME validation. Because `tickets.attachments_json` and `ticket_messages.attachments_json` are stored directly in the DB and returned on every full `sync.php` pull, multi-megabyte base64 payloads can bloat `sync.php` responses for all users.

### 🟢 LOW — Raw Database Exception Message Leakage
- **Location:** [`api/swarm.php`](file:///Users/erik/Documents/vibe%20coding/crm/api/swarm.php#L38), [`api/orders.php`](file:///Users/erik/Documents/vibe%20coding/crm/api/orders.php#L35), [`api/time_tracking.php`](file:///Users/erik/Documents/vibe%20coding/crm/api/time_tracking.php#L35), [`api/cron.php`](file:///Users/erik/Documents/vibe%20coding/crm/api/cron.php#L112)
- **Issue:** Catch blocks return `$e->getMessage()` directly in HTTP 500 JSON responses, exposing internal SQL table/column names and query structure.

---

## 3. Errors & Bugs

### 1. Broken SQL Column Names in `api/orders.php` (`convert_guest_to_client`)
- **Location:** [`api/orders.php`](file:///Users/erik/Documents/vibe%20coding/crm/api/orders.php#L147-L166) (and [`public/api/orders.php`](file:///Users/erik/Documents/vibe%20coding/crm/public/api/orders.php#L147-L166))
- **Bug:** `action=convert_guest_to_client` executes:
  ```sql
  INSERT INTO leads (
      id, company, contact_person, email, phone, ico, dic, ic_dph,
      street, city, zip, country, status, created_at
  ) VALUES (...)
  ```
  In [`api/schema.php`](file:///Users/erik/Documents/vibe%20coding/crm/api/schema.php#L164-L202), the `leads` table does **not** have columns `company`, `ico`, `dic`, `ic_dph`, or `zip` — the actual column names are `name`, `company_id`, `tax_id`, `vat_id`, and `postal_code`.
- **Effect:** Converting a guest order to a client via the backend endpoint always throws a fatal PDO `SQLSTATE[42S22]: Column not found: 1054 Unknown column 'company' in 'field list'` (HTTP 500).

### 2. Caller `AbortSignal` Silently Overwritten in `fetchWithTimeout.ts`
- **Location:** [`src/utils/fetchWithTimeout.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/fetchWithTimeout.ts#L6-L17)
- **Bug:** `fetch(input, { ...init, signal: controller.signal })` unconditionally overwrites `init.signal` when `init` is spread before `signal: controller.signal`.
- **Effect:** Callers that pass their own `AbortController.signal` into `fetchWithTimeout` — specifically [`src/utils/companyRegistryApi.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/companyRegistryApi.ts#L36) (`searchCompaniesByQuery` and `lookupCompanyByIco`, used by [`src/hooks/useCompanyLookup.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/hooks/useCompanyLookup.ts)) — cannot abort in-flight type-ahead requests when the user keeps typing.

### 3. Four Stale Playwright E2E Specs Out of Sync with Current UI / Mock Fixture
All 524 unit tests (`npm run test:unit`) and TypeScript checks (`npx tsc --noEmit`) pass, and the QA crawler (`tests/e2e/audit.spec.ts`) passes with 0 findings. However, 4 standalone E2E spec files fail due to recent UI/fixture drift:
1. [`tests/e2e/projectFiles.spec.ts`](file:///Users/erik/Documents/vibe%20coding/crm/tests/e2e/projectFiles.spec.ts#L28-L39) & [`tests/e2e/projectTasks.spec.ts`](file:///Users/erik/Documents/vibe%20coding/crm/tests/e2e/projectTasks.spec.ts#L38): Look up project tabs with `page.locator('main').getByRole('button', { name: TAB })`, whereas [`ProjectDetailsView.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/ProjectDetailsView.tsx) uses [`Tabs.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/layout/Tabs.tsx#L99) which renders `<button role="tab">`.
2. [`tests/e2e/projectStatuses.spec.ts`](file:///Users/erik/Documents/vibe%20coding/crm/tests/e2e/projectStatuses.spec.ts#L88-L117):
   - Part 1 calls `gotoView(page, '#projects')` (which forces a full page reload via `/?qa=N`), but the mock server in [`tests/e2e/helpers/fixture.ts`](file:///Users/erik/Documents/vibe%20coding/crm/tests/e2e/helpers/fixture.ts#L885-L921) only persists pushed `users.metadata_json` and `projectTypes.listColumns` across `GET /sync.php` reloads — not `settings.projectStatuses` or `projects`.
   - Part 2 queries button text `/Označiť zvyšok ako uhradený/`, which was renamed in [`ProjectDetailsView.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/ProjectDetailsView.tsx#L1944) to `Označiť nevyfakturovaný zvyšok ako uhradený`.
3. [`tests/e2e/darkmode.spec.ts`](file:///Users/erik/Documents/vibe%20coding/crm/tests/e2e/darkmode.spec.ts#L364-L365): Navigates to `#clients` and clicks `getByText('Silvia')`, but [`ClientsView.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/ClientsView.tsx#L1147-L1153) only includes records where `id.startsWith('client-')` or `adjustment > 0`. In [`fixture.ts`](file:///Users/erik/Documents/vibe%20coding/crm/tests/e2e/helpers/fixture.ts#L305), Silvia is seeded with `id: 'lead-silvia'` and no `adjustment`, leaving `#clients` empty (`0` clients).

---

## 4. Duplicates & Architectural Bloat

### 1. 100% Duplicated Backend Tree (`api/` vs `public/api/` and `sync.php` vs `public/sync.php`)
- Every single PHP file in the repository exists twice with identical contents (~32,800 duplicated lines):
  - [`sync.php`](file:///Users/erik/Documents/vibe%20coding/crm/sync.php) (5,773 lines) === [`public/sync.php`](file:///Users/erik/Documents/vibe%20coding/crm/public/sync.php) (5,773 lines)
  - 56 files in [`api/*.php`](file:///Users/erik/Documents/vibe%20coding/crm/api) (~27,000 lines) === 56 files in [`public/api/*.php`](file:///Users/erik/Documents/vibe%20coding/crm/public/api) (~27,000 lines)
  - [`api/Swarm/`](file:///Users/erik/Documents/vibe%20coding/crm/api/Swarm) === [`public/api/Swarm/`](file:///Users/erik/Documents/vibe%20coding/crm/public/api/Swarm)
- **Risk:** Any bug fix or security patch applied to `api/` but forgotten in `public/api/` (or vice versa) silently diverges between local dev and production builds.

### 2. Dual Persistence Path for Orders (`api/orders.php` vs `sync.php`)
- [`OrdersView.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/OrdersView.tsx#L168-L194) and [`ClientsView.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/ClientsView.tsx#L2889-L2911) persist order mutations twice: first via `fetch('/api/orders.php')` and immediately after via `updateOrdersAndSync()` (which pushes the entire `orders` array through `sync.php`). Both [`api/orders.php`](file:///Users/erik/Documents/vibe%20coding/crm/api/orders.php#L47-L143) and [`sync.php`](file:///Users/erik/Documents/vibe%20coding/crm/sync.php) maintain separate SQL upsert/delete implementations for `orders` and `order_items`.

### 3. Duplicate Employee Modals vs. Screens
- [`EmployeeFormModal.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/employees/EmployeeFormModal.tsx) (887 lines) duplicates [`EmployeeFormScreen.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/employees/EmployeeFormScreen.tsx) (1,121 lines).
- [`EmployeeSettingsModal.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/employees/EmployeeSettingsModal.tsx) (626 lines) duplicates [`EmployeeSettingsScreen.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/employees/EmployeeSettingsScreen.tsx) (764 lines).
- Only the `*Screen.tsx` variants are imported and used by [`EmployeesView.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/employees/EmployeesView.tsx).

### 4. Duplicated Inline Utilities & Monolithic God-Components
- **Inline Markdown Parser Duplication:** [`ClientsView.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/ClientsView.tsx#L306) defines its own `renderInlineFormatting` helper instead of using [`src/utils/markdown.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/markdown.tsx#L73).
- **Date Parsing & Formatting Duplication:** ISO `YYYY-MM-DD` regex parsing (`/^(\d{4})-(\d{2})-(\d{2})/`) and `DD. MM. YYYY` formatting are re-implemented across [`src/utils/projects.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/projects.ts), [`src/utils/leadSla.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/leadSla.ts), [`src/utils/taskReminders.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/taskReminders.ts), and [`src/utils/localTime.ts`](file:///Users/erik/Documents/vibe%20coding/crm/src/utils/localTime.ts).
- **Monolithic Files (>4,000 lines):**
  - [`src/components/LeadsDatagrid.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/LeadsDatagrid.tsx) — 13,282 lines
  - [`src/components/FinancialManagementView.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/FinancialManagementView.tsx) — 8,189 lines
  - [`src/components/SettingsView.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/SettingsView.tsx) — 8,049 lines
  - [`src/components/ClientsView.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/ClientsView.tsx) — 7,012 lines
  - [`src/components/WarehouseView.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/WarehouseView.tsx) — 6,792 lines
  - [`src/sync.php`](file:///Users/erik/Documents/vibe%20coding/crm/sync.php) — 5,773 lines
  - [`src/components/TicketsView.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/TicketsView.tsx) — 5,042 lines
  - [`src/components/TaskDashboardView.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/TaskDashboardView.tsx) — 4,759 lines
  - [`src/App.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/App.tsx) — 4,492 lines
  - [`src/components/ProjectDetailsView.tsx`](file:///Users/erik/Documents/vibe%20coding/crm/src/components/ProjectDetailsView.tsx) — 4,387 lines

