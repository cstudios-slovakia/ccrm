# Role-based access control (RBAC)

How CCRM decides what a signed-in user may see and change. Rebuilt in
1.9.45; the native Employee role, the HR toggles and **server-side read
enforcement** were added after (see the sections below). The browser no longer
receives data its role may not see.

## Where the truth lives

| Piece | Location |
| --- | --- |
| Permission registry and resolver (client) | `src/utils/permissions.ts` |
| Same registry and resolver (server) | `api/permissions.php` — a port of the file above; change both together (test P1 compares them) |
| Server read scope and projections | `api/read_scope.php`, used by `sync.php`, `my_employment.php` and the gated endpoints |
| Role registry (data) | `system_settings` row `ROLES_RBAC`: JSON array of `{ name, permissions, defaultNavLayout? }` |
| A user's role | `users.role` — the role **name** as it appears in the registry (`VARCHAR(100)`; was an enum until 1.9.45) |
| Settings UI | Settings → Users → *Roles & permissions* tab (`SettingsView.tsx`) |
| App wiring | `buildAccess(currentUser, roles)` in `App.tsx`; the resolver is passed to the sidebar, start menu, header and every view |

## The model

Permissions are grouped into **sections**, one per app module (Dashboard,
Tasks, Leads, Clients, Projects, Invoices & offers, Warehouse, Finance,
Meetings, Files, Mail client, Custom records, Automation, Social media,
Analytics overview, Updates & news, RAG AI assistant, Settings, plus Employees
& payroll and My employment).

Two kinds of permission exist:

- **Access** — `nothing | view | edit`. Guards a module and its records.
  `nothing` hides the module from the sidebar, the start menu, search and the
  router (a direct URL shows the *No access* panel). `view` opens it read-only:
  every control that creates or changes a record is hidden and the handlers
  refuse to run. `edit` allows creating and changing records.
- **Toggle** — on or off. A single action (`leads.delete`, `tasks.view_all`,
  `system_reset`, `nav_edit`) or a module with nothing to edit (`overview`,
  `updates`, `rag_ai`). A toggle can *require* an access permission at a level:
  `leads.delete` is only effective when `leads` is at `edit`. The matrix shows
  such a toggle dimmed until its requirement is met.

Every section has a **section switch** per role in the matrix: it sets every
permission in the section to its maximum (edit / on) or to nothing / off. A
mixed section shows a partial state.

Values are stored as `"edit" | "view" | "nothing"`; a toggle stores `edit` for
on and `nothing` for off, so the role blob keeps one value type.

### Resolution rules

`resolveRolePermissions(role)` returns a full map for every registered key:

1. A stored value wins.
2. Otherwise the legacy keys folded into this permission are read
   (`tasks.view` / `tasks.create` / `tasks.edit` → `tasks`, `files.view` /
   `files.create` → `files`, `rag_view` → `rag_ai`, …).
3. Otherwise the definition's `legacyDefault` applies — the behaviour the app
   had before the key existed. Content modules default to `edit`, settings
   categories to `nothing`, `tasks.delete` to off (it was already enforced).
   This is what keeps an existing installation working after the upgrade: a
   role that only ever had settings keys still opens every module it could
   open yesterday.

A role created in the matrix starts from `newRoleDefault` (everything off
except the home dashboard at `view`, updates on and `tasks.view_all` on) and is
written out in full, so it never depends on legacy defaults.

**Admin** (role name compared case-insensitively) is not resolved from the
matrix at all: it is `edit` / on for everything, on the client and the server.
The Admin column in the matrix is locked.

A user whose role name is not in the registry resolves to **nothing** — they
can open personal settings and log out, and nothing else. The users list marks
such accounts with an *Unknown role* badge so an administrator can reassign
them. Before 1.9.45 the database column was an enum, so every custom role was
silently stored as `viewer`; the schema migration widens the column and
relabels the legacy values (`admin` → `Admin`, `project_manager` →
`Project Manager`, `viewer` → `Viewer`). Accounts that show `Viewer` after the
upgrade are the ones that had lost their custom role and need reassigning.

### Route guard

`permissionKeyForRoute(routeId)` maps a hash route to the key that guards it
(`lead-…` → `leads`, `client-…` → `clients`, `dash_…` → `dashboard.custom`,
`ue_…` → `unified_entries`, `settings…` → any settings key, `user-…` →
`pm_managers`, `sai` → `leads`, `employees` / `employees/me` / `my-employment` → the People section (directory **or** any `self.*` read key),
`personal-settings` → open to everyone). The sidebar and the
start menu hide what the router would refuse; `firstAllowedRoute(access)` picks
the landing page for a denied redirect.

## The native Employee role

`Employee` is a protected role (cannot be deleted or renamed, can be edited). It is written out key by
key in `employeeRolePermissions()` (TS) and `ccrm_employee_role_permissions()` (PHP); a test (P1)
proves the two registries and the Employee map are identical. Defaults: tasks at `edit` with
`tasks.view_all` off (own, created and assigned tasks only), `updates` on, **nothing else** — no
leads, clients, projects, invoices, finance, warehouse, meetings, e-mail, employees or settings. On the
self-service keys it can see its own personal data (read-only), pay, leave (and request leave), documents
and tracked hours. `self.account` is off: it cannot change its own login name or e-mail.

- **New installs** get it from `ccrm_fallback_roles()`; **existing installs** get it appended to
  `ROLES_RBAC` by `ccrm_migrate_employee_role_rbac()` (idempotent; an existing role of that name is left
  untouched — use *Reset to recommended defaults* in the matrix, Admin only, to restore it).
- **A new user defaults to Employee** when the role exists (least privilege).
- Project Manager's fallback map now writes the HR keys out (all on) instead of relying on legacy
  defaults. It still sees every salary by default: that is the owner's decision, not changed here.
- A push of the role registry that omits Admin, Project Manager or Employee keeps the stored record.

## HR toggles and self-service

`employees` is the **directory** (names, work contacts, state). Everything else sits behind a toggle that
requires `employees` ≥ view; with `employees` = edit the toggle also lets the person change that group.

| Key | Group | Fields |
| --- | --- | --- |
| `employees.salaries` | Pay | `salaryType`, `salaryAmount`, `salaryDueDay`, `autoExpense`, `expenseCategoryId`, payroll records |
| `employees.vacations` | Leave | `vacationAllowances`, leave records |
| `employees.files` | Documents | `files` |
| `employees.personal` | Personal | `pin`, `phone`, address, `notes` |

These four have `legacyDefault: edit`, so a role that predates them keeps today's access on upgrade.
The `self.*` keys (`self.profile`, `self.payroll`, `self.vacations`, `self.files`, `self.hours`,
`self.account`) never require `employees` and only ever reach the caller's **own linked row**. Any of the
first five opens the People section (`#employees`, own-data tab). The old address `#my-employment` still lands there.

### Linking a login to an employee

`employees.user_id` (unique, `ON DELETE SET NULL`) links a login to an employee record. It is **never
derived from an e-mail address at runtime**: a user can change their own login e-mail, so a match would
let them attach themselves to someone else's payroll. The picker only *suggests* the e-mail match. Only
Admin, or `employees` = edit together with `pm_managers` = edit, may set or clear it (the server ignores
the field from anyone else and refuses a login that is already linked). No endpoint takes an employee id
from the client to mean "me": `my_employment.php` resolves it from the session.

## Server-side read scope (`sync.php` GET)

`api/read_scope.php` resolves the caller once per request (`ccrm_read_scope`) and projects every
collection. **A collection the caller may not view is sent as an empty value, never omitted** (the client
keeps stale state for a missing key); the response carries
`readScope: { restricted, rowScoped, referenceNames }`. `referenceNames` holds only the display name of a
lead or project a visible row points at, so task cards still show their client.

| Collection | Sent when | Row / field scope |
| --- | --- | --- |
| `leads` | `leads` or `clients` ≥ view | `leads` → non-client rows, `clients` → client rows; mail timeline events need `email` |
| `tasks`, `allTags` | `tasks` ≥ view | without `tasks.view_all`: owner, creator or assignee |
| `users` | always | other users: id, name, e-mail, role, colour, avatar only; own row in full |
| `roles` | always | all with `pm_managers` ≥ view, else the caller's own role |
| `meetingNotes`, `unifiedEntries*`, `projects*`, `warehouse*`, `invoicesOffers`, `clientCategories` | their module ≥ view | — |
| `orders` | `orders` ≥ view | — |
| `tickets`, `supportContracts` | `tickets` ≥ view | — |
| `settings.ticketStatuses`, `settings.ticketSettings` | `tickets` ≥ view | else `null` (the client falls back to its defaults); mailbox / OpenAI secrets always masked |
| `financialRecords`, `financialTrend/Mode/SimplifiedTable` | `financial` ≥ view | salary rows read `Payroll (<period>)` without `employees.salaries` (amounts stay) |
| `employees` | `employees` ≥ view | field groups above; a hidden field is **absent**, never `0` |
| `employeeSalaries` / `employeeVacations` | `employees` ≥ view **and** the toggle | — |
| `employeeSettings` | full (secrets masked) for Admin / `general_config` = edit; lists and defaults for employees ≥ view or any `self.*`; else `null` | time-tracking secrets always masked |
| `settings.companyBillingSettings`, `invoicingIntegrations` | `invoices`, `financial` or `general_config` | else empty |

## Server-side write enforcement (`sync.php` POST)

- **Deletions and edits are limited to the visible set.** An edit to an existing task, lead or client the
  caller was never sent is ignored; so is a named delete of one, and a full-snapshot push never infers a
  deletion outside the visible set. All are reported in `permissionSkipped`.
- **Employees are merged by field group.** A group the caller cannot write keeps its stored columns, so a
  row pushed back after a stripped GET cannot wipe salary, PIN or documents.
- **Payroll** needs `employees` = edit and `employees.salaries`; **leave** needs `employees.vacations`.
  The server decides `approved_by` (the session user when a status becomes `approved` / `rejected`).
- **Employee settings:** a masked Toggl / Clockify token coming back never overwrites the stored one.
- **Users:** the row written must be the session user (matched by resolved id, not payload e-mail).
  Without `self.account` the own name and e-mail are ignored; with it a name another user holds
  (case-insensitive) and a taken e-mail are refused. Task visibility is matched by **name**, so this is
  what stops a rename from taking over a colleague's tasks. The password still updates.
- **Orders and tickets** (`orders`, `tickets`): a collection is written only with edit on its module and
  deleted only with the module's delete toggle (`orders.delete`, `tickets.delete`), named or by omission.
  `view` is read-only. `supportContracts` follow `tickets`. See "Ticket data on other modules" below.
- **Roles / settings:** the registry stays admin-only; the billing blobs are written back only by roles that
  are sent them.
- Self-service writes never go through `sync.php`: they use `my_employment.php`, which writes to the audit log.

## Private employee documents

Contracts and documents are stored in `uploads/private/employees/<32 hex>.<ext>` behind a deny-all guard
(`api/employee_files.php`) and streamed by `api/employee_file.php?employee=&file=` after a check
(`employees` ≥ view **and** `employees.files`, or the caller's own row **and** `self.files`). A file is
found by its id in the employee's `files_json`; a path from the client is never accepted. `upload.php` with
`module=employees` needs `employees` = edit and `employees.files`; `employees` is no longer in the generic
upload list. An idempotent migration moves older public contracts into the private directory; a detached
or removed document is deleted from disk only after the save commits and only if no record references it.

### Ticket data on other modules

Some ticket data is stored on rows that belong to another module and is saved by people who may hold no
`tickets` right. The rule is one flag, `$canEditTickets` in `sync.php` POST (Admin, or `tickets` = edit);
the matching read is `ccrm_can($scope, 'tickets')`.

| Field | Without `tickets` view | `tickets` view | Needs `tickets` edit to change |
| --- | --- | --- | --- |
| task `relatedTicketId` | sent as `null` | sent | yes |
| project `ticketWidgetEnabled`, `ticketAllowedDomains`, `ticketAllowedEmails`, `ticketPublicHash`, `ticketWidgetConfig`, `ticketRetainer` | withheld (`false` / `[]` / `null`); the hash is the key to the public board | sent | yes |
| lead `ticketAllowedEmails` | `[]` | sent | yes |
| `TICKET_STATUSES`, `TICKET_SETTINGS` | `null` | sent | yes, **and** `general_config` = edit |

**Task link decision.** Someone who can edit tasks but not tickets still saves the task normally. The stored
link is kept exactly as it is: the `null` they were sent never erases it, a link they type in is ignored, and
no `ticket_task_links` row is created. The same holds for the project and lead fields (the stored value
stays) and for the settings (the key is skipped without a "lost work" warning). Linking from the ticket
side (`taskLinks` on a ticket) is a ticket edit. Completing a linked task still auto-resolves its ticket
(`sync_mode = auto_resolve`): that is a system consequence of a link someone with `tickets` edit made, not a
ticket write by the task editor.

## Other endpoints

| Endpoint | Gate |
| --- | --- |
| `orders.php` | GET: `orders` ≥ view. POST / DELETE: `orders` = edit; DELETE also needs `orders.delete`; `convert_guest_to_client` also needs `clients` = edit (it creates a lead row). CLI is not gated |
| `tickets.php` | `test_imap`, `poll_imap`, `send_email_reply`: `tickets` = edit. `public_status` is public by design (the unguessable project hash is the credential) |
| `ticket_widget.php` | public by design: gated by the project's widget switch and allowed domains, not by a session |
| `chat_rag.php`, `realtime_session.php` | `rag_ai`; agent management needs `rag_ai` edit; chat history is bound to the session e-mail; every voice write tool needs the owning module's edit (delete: its delete toggle); a client note needs a visible, editable lead / client row |
| context builder (`agent_utils.php`) | built from the caller's read scope: one block per viewable module, HR groups by toggle, salary rows anonymised, mail = the caller's own mailbox, tasks block needs `tasks.view_all` |
| `train_vector.php` | Admin (stricter than Admin / `ai_config`) |
| `universal_search.php` | each source needs its module; leads vs clients by row |
| `dashboard_query.php` | presets need their module (leads/clients by row, tasks narrowed to own without `view_all`); `sql` needs Admin, or `dashboard.custom` = edit and a view of every table's module; indexed mail and `error_logs` are Admin-only |
| `generate_dashboard.php`, `translate_dashboard.php` | `dashboard.custom` = edit |
| `time_tracking.php` | `test_connection`: `general_config` = edit; `fetch_workspace_users`: `general_config` or `employees` = edit; `fetch_employee_hours`: `employees` ≥ view. Own hours: `my_employment.php` |
| `summarize_financial` / `summarize_client_lead` / `summarize_email` / `summarize_meeting` | `financial` / `leads` or `clients` / `email` / `meetings` (view) |
| `transcribe_meeting`, `upload_audio` | `meetings`, `leads` or `clients` (voice notes) — view / edit |
| `transcribe_task` | `tasks` = edit |
| `generate_report` | `leads` or `clients` = edit |
| `generate_pdf_template` | `general_config` = edit (the same gate as saving `aiCustomTemplates`) |
| `idoklad.php`, `superfaktura.php` | `invoices` = edit; `test_connection`: `general_config` or `invoices` = edit |
| `swarm.php` (SAI) | `leads` or `clients` ≥ view; the CRM context sources are filtered by module. SAI has no key of its own: its route follows `leads` |
| `delete_file.php` | `files` delete; the legacy `emp_contract_*` names need `employees` = edit + `employees.files` |
| `api/task.php` (delete) | the existing rule, limited to tasks the caller can see |
| `mcp.php` | leave tools need `employees.vacations`; employee rows are projected by group; PIN / phone search needs `employees.personal`; employee files need `employees.files`; salary finance rows are anonymised. A key reaches only its owner's visible tasks |
| `ares_cz`, `registeruz`, `company_registry`, `validate_vat` | public-registry lookups: open to any signed-in user |

## Adding a permission

1. Add the definition to `PERMISSION_SECTIONS` in `src/utils/permissions.ts`
   (key, kind, `legacyDefault`, `newRoleDefault`, optional `requires`).
2. Mirror it in `ccrm_permission_sections()` in `api/permissions.php` (test P1 fails if they drift).
3. Add its label and description (`settings.rbac.perm.<key>.label` / `.desc`) in EN, SK and HU.
4. Enforce it **on the server**: add the read projection to `sync.php` GET / `read_scope.php`, the write
   rule to `sync.php` POST, and a gate on any endpoint that reads the same data. The UI hiding a control is
   not enforcement.
5. Enforce it in the view: `access.can(key)` / `access.canEdit(key)` / `access.module(key)`.
6. Extend `src/utils/permissions.test.ts` and `scripts/probe-rbac` (`npm run test:rbac`): a read check
   (the data is absent from the response body) and a write check (a forged request leaves the database
   unchanged).

## Verifying it

`npm run test:rbac` clones the dev database into a scratch schema, serves a copy of `public/` from a
scratch directory in the dev web container, logs in as a fixture user per role and asserts, against the raw
response bodies and the database itself, that nothing leaks and nothing is written outside the caller's
scope. Admin and Project Manager are compared live against the last `sync.php` that did no read filtering,
so the probe also proves they did not regress. `npm run test:mcp` covers the MCP gateway. The mocked
browser suite (`tests/e2e/employeeRole.spec.ts`) proves what the UI does with those answers; it cannot prove
the server filters.

## Known limits

- Per-row salary **amounts** stay visible to finance-only roles (finance totals need them); only the
  employee's name is removed.
- Raw-SQL dashboards and some AI context blocks (leads vs clients) are scoped by module, not always row by
  row.
- `settings.integrationsConfig` is sent to every role with its secrets masked (the consumers were not all
  traced, so it was not narrowed).
- Anyone who has `employees` ≥ view still sees every colleague's name, work e-mail and avatar; task
  assignment needs them.
