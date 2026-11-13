# Agency & Workforce Leasing Module — Master Specification & Phased Plan

> **One file owns this module.** Every status row, design decision, data contract,
> and per-phase checklist lives here. Future agents building or extending the
> `agency` module read this file first.

---

## Part A — Status & Working Rules

### Status Table

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Contacts-to-Companies, DB schema + RBAC + Opt-in toggle, Customizable Settings & Schema (`REYES_ANGELA_DELA_CRUZ` default), Dedicated Private API/Files, Candidates Pipeline & Worker Detail (`#agency/worker/<id>`) with Timeline | `[x]` Done |
| Phase 2 | Host Workplaces, Placements & Transfers, Rented Employees Directory (`#agency/workers`), Company Detail Rented Employees Tab | `[x]` Done |
| Phase 3 | Tasks & Tickets Attachment (`tasks.related_agency_worker_id`, `tickets.agency_worker_id`), Pickers & Profile Tabs, Compliance Renewal Tasks | `[x]` Done |
| Phase 4 | Work Schedule Grid (`#agency/schedule`) with Customizable Shift Presets, National Holidays & Sick Leave, Payments & Client Billing Matrix (`#agency/payments`) + `FinancialRecord` Auto-Expense Sync | `[x]` Done |
| Phase 5 | Complete Agency MCP Tool Suite, Universal Search, E2E + Unit QA Suite, Release Prep | `[x]` Done |

### Rules for Implementing Phases

1. Follow [`CLAUDE.md`](../CLAUDE.md): obey the 4-place column rule (`schema.php` CREATE TABLE, `schema.php` migration, `sync.php` pre-transaction healing, `entities_overview.md`) whenever adding columns to `leads`, `tasks`, `recurring_task_templates`, or `tickets`.
2. **Never store rented employees as Contacts (`leads`)**: `agency_workers` is a separate permanent entity. `leads.company_client_id` + `leads.contact_role` are exclusively for client-side HR/site contacts (`clientType === "person"`) linked to external companies.
3. **Never add `agency_*` tables to `sync.php` or `?probe=1`**. Agency state lives behind `public/api/agency.php` and private files live behind `public/api/agency_file.php` in `uploads/private/agency/`.
4. Keep Settings clean: reuse `<SectionCard>` and register under Settings → Work (`settingsRegistry.ts` + `translations.settingsNav.ts`).
5. Respect `viewSizeGuard.test.ts` typography and layout tokens (`text-micro`, `text-caption`, `text-ui`, `text-body`, `text-title`, `text-heading`, `text-display`, `text-metric`, `type-overline`, `ws-sm:`/`ws-md:`/`ws-lg:`).

---

## Part B — Final Design Decisions

1. **Permanent Entity (`agency_workers`)**: One permanent profile per person across recruitment stages and company placements. Moving a worker between companies creates/updates rows in `agency_placements` and preserves full history.
2. **Default + Customizable Schema**: Default profile schema matches `REYES_ANGELA_DELA_CRUZ` (`applicant`, `passport`, `permit`, `stayWork`, `addresses`, `family`) and powers both fresh installs and demo seeding. Admins customize visible sections, required fields, and custom fields in **Settings → Agency & Leasing**.
3. **Dedicated Shareable URL (`#agency/worker/<id>`) & Chronological Timeline**: Worker detail renders a full lifecycle timeline (`stage_change`, `contact`, `placement`, `sick_leave`, `compliance`, `note`, `work_log`). Worked-day (`work_log`) entries render visually compact/smaller than major lifecycle events.
4. **Customizable Shifts, National Holidays & Sick Leave**: Shift presets (code, label, start/end times, paid hours, billable multiplier, color) are configured in Settings. Schedule cells display national public holidays (`api/holidays.php` / `src/utils/holidays.ts`) and support `sick` status + `sick_note` logging (`sick_leave` timeline event).
5. **Opt-In Default**: Disabled by default on both fresh installs and existing DBs (`INTEGRATIONS_CONFIG.disabledModules` includes `"agency"`).

---

## Part C — Database & API Contract

### New Tables (`public/api/schema.php`)
- `agency_workers`: permanent worker record (`id`, `worker_code`, `full_name`, `preferred_name`, `email`, `phone`, `stage_id`, `worker_status` [`candidate` | `rented` | `bench` | `archived`], `nationality`, `date_of_birth`, `profile_json`, `skills_json`, `notes`, `default_pay_rate`, `default_bill_rate`, `currency`, `assigned_recruiter`, `created_by`, `created_at`, `updated_at`).
- `agency_workplaces`: external company worksites (`id`, `company_client_id`, `name`, `address`, `contact_lead_id`, `default_shift_code`, `notes`, `active`).
- `agency_placements`: placement history (`id`, `worker_id`, `company_client_id`, `workplace_id`, `contact_lead_id`, `job_role`, `status` [`planned` | `active` | `completed` | `terminated`], `start_date`, `end_date`, `pay_rate`, `pay_rate_type` [`hourly` | `monthly`], `bill_rate`, `bill_rate_type`, `currency`, `notes`, `created_at`).
- `agency_worker_checklists`: customizable compliance items (`id`, `worker_id`, `item_key`, `label`, `status` [`pending` | `submitted` | `verified` | `expired`], `expires_at`, `note`, `file_id`, `sort_order`).
- `agency_worker_files`: private files metadata (`id`, `worker_id`, `category`, `checklist_item_id`, `file_name`, `mime_type`, `size_bytes`, `storage_name`, `uploaded_by`, `created_at`) stored in `uploads/private/agency/`.
- `agency_timeline_events`: audit & activity feed (`id`, `worker_id`, `event_type` [`stage_change` | `contact` | `placement` | `sick_leave` | `compliance` | `note` | `work_log`], `title`, `description`, `meta_json`, `occurred_at`, `created_by`, `created_at`).
- `agency_shifts`: daily shift & absence entries (`id`, `worker_id`, `placement_id`, `company_client_id`, `workplace_id`, `work_date`, `shift_template_id`, `shift_label`, `start_time`, `end_time`, `hours`, `overtime_hours`, `status` [`scheduled` | `worked` | `sick` | `absent` | `holiday`], `sick_note`, `notes`, `created_by`, `updated_at`).
- `agency_payments`: worker payroll & client billing period records (`id`, `worker_id`, `placement_id`, `company_client_id`, `period_ym`, `regular_hours`, `overtime_hours`, `sick_days`, `base_pay`, `items_json`, `gross_pay`, `deductions_total`, `net_pay`, `paid_amount`, `billable_total`, `currency`, `status` [`draft` | `approved` | `paid`], `paid_at`, `financial_record_id`, `notes`, `updated_at`).

### Modified Core Tables (4-Place Rule)
- `leads`: `company_client_id VARCHAR(100) NULL`, `contact_role VARCHAR(120) NULL`
- `tasks` & `recurring_task_templates`: `related_agency_worker_id VARCHAR(100) NULL`
- `tickets`: `agency_worker_id VARCHAR(100) NULL`

### Dedicated Endpoints
- `GET/POST public/api/agency.php` (`action` dispatcher: `bootstrap`, `worker_detail`, `save_worker`, `delete_worker`, `save_checklist`, `save_timeline_event`, `save_workplace`, `save_placement`, `save_shifts`, `calculate_payment`, `save_payment`, `create_client_billing_record`, `save_settings`).
- `GET public/api/agency_file.php?id=...` (streams `uploads/private/agency/*`, gated by `agency`, and `agency.personal` for ID/passport/permit docs).
- `POST public/upload.php` (`module=agency` stores into `uploads/private/agency/` and inserts `agency_worker_files`).
- `public/api/mcp_ext_agency.php` wired into `public/api/mcp.php`, plus `public/api/universal_search.php`.

---

## Part D — Per-Phase Checklists

### Phase 1 — Schema, Contacts-to-Companies, Opt-In Gate, Settings & Candidates Pipeline
- [x] `leads.company_client_id` + `leads.contact_role` (4-place rule) + `ClientsView.tsx` Attached Contacts UI
- [x] `agency_*` tables & opt-in default (`disabledModules: ['agency']` + `AGENCY_DEFAULT_DISABLED_V1`)
- [x] RBAC (`agency`, `agency.delete`, `agency.personal`, `agency.payments`) in `permissions.ts` & `permissions.php`
- [x] Navigation, visuals & routing (`#agency`, `#agency/candidates`, `#agency/worker/<id>`, `#agency/workers`, `#agency/schedule`, `#agency/payments`)
- [x] Dedicated backend (`agency_lib.php`, `agency.php`, `agency_file.php`, `upload.php` `module=agency`)
- [x] Settings (`settingsRegistry.ts`, `translations.settingsNav.ts`, `AgencySettingsSection.tsx`) with customizable stages, checklists, shift templates, holiday country, and `REYES_ANGELA_DELA_CRUZ` profile schema editor
- [x] Candidates Pipeline (Table + Kanban) & `AgencyWorkerDetailView.tsx` (Overview, Timeline with compact `work_log`, Customizable Personal & Family form, Checklist & Private Docs)

### Phase 2 — Placements, Rented Employees Directory & Company Detail Tab
- [x] Host Workplaces CRUD & Placements/Transfers workflow in `AgencyWorkerDetailView.tsx` (logging `placement` timeline events)
- [x] Rented Employees Directory (`#agency/workers` — `RentedEmployeesView.tsx`)
- [x] Business/Partner Company Detail **Rented Employees** tab (`ClientCompanyAgencyTab.tsx` inside `ClientsView.tsx`)

### Phase 3 — Tasks & Support Tickets Attachment
- [x] `tasks.related_agency_worker_id` + `recurring_task_templates.related_agency_worker_id` + `tickets.agency_worker_id` (4-place rule + `sync.php` RBAC preservation + `referenceNames.agencyWorkers`)
- [x] `AgencyWorkerSelect.tsx` & `EntityTasksPanel.tsx` `"agency_worker"` support
- [x] `TaskEditDrawer.tsx`, `QuickTaskModal.tsx`, `TaskDashboardView.tsx`, `TicketsView.tsx` integration
- [x] Worker Detail **Tasks** & **Tickets** tabs + compliance renewal task shortcut

### Phase 4 — Work Schedule, Holidays, Sick Leave & Payments + Client Billing
- [x] `AgencyScheduleView.tsx` (`#agency/schedule`) with Company/Workplace × Worker Week/Month grid, national holidays (`api/holidays.php` / `holidays.ts`), customizable shift templates, sick leave (`sick` + `sick_note`), bulk Mon–Fri fill, copy previous week, paid-period lock
- [x] Single-worker Schedule tab in `AgencyWorkerDetailView.tsx`
- [x] `AgencyPaymentsView.tsx` + `AgencyPaymentDrawer.tsx` (`#agency/payments`, gated by `agency.payments`) with 1-click Calculate from Shifts, earnings/deductions, `FinancialRecord` auto-expense sync, and Client Billing margin summary

### Phase 5 — MCP Suite, Universal Search, QA Audit & Release
- [x] `public/api/mcp_ext_agency.php` wired into `public/api/mcp.php`
- [x] `public/api/universal_search.php` `agency_workers` search
- [x] Unit tests + Playwright E2E suite (`tests/e2e/helpers/agencyMock.ts`, `tests/e2e/agencyModule.spec.ts`)
- [x] Full checks (`sync:backend`, `check:backend`, `php -l`, `tsc --noEmit`, `typecheck`, `test:qa:typecheck`, `test:unit`, `test:demo-packs`, `test:demo-seed`, `test:demo-wipe`, Playwright QA audit)
- [x] Version bump, changelog, clean build & atomic commit
