# Role-based access control (RBAC)

How CCRM decides what a signed-in user may see and change. Rebuilt in
1.9.45; the earlier version of this document described a design that was never
implemented.

## Where the truth lives

| Piece | Location |
| --- | --- |
| Permission registry and resolver (client) | `src/utils/permissions.ts` |
| Same registry and resolver (server) | `api/permissions.php` — a port of the file above; change both together |
| Role registry (data) | `system_settings` row `ROLES_RBAC`: JSON array of `{ name, permissions, defaultNavLayout? }` |
| A user's role | `users.role` — the role **name** as it appears in the registry (`VARCHAR(100)`; was an enum until 1.9.45) |
| Settings UI | Settings → Users → *Roles & permissions* tab (`SettingsView.tsx`) |
| App wiring | `buildAccess(currentUser, roles)` in `App.tsx`; the resolver is passed to the sidebar, start menu, header and every view |

## The model

Permissions are grouped into **sections**, one per app module (Dashboard,
Tasks, Leads, Clients, Projects, Invoices & offers, Warehouse, Finance,
Meetings, Files, Mail client, Custom records, Automation, Social media,
Analytics overview, Updates & news, RAG AI assistant, Settings).

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
`pm_managers`, `personal-settings` → open to everyone). The sidebar and the
start menu hide what the router would refuse; `firstAllowedRoute(access)` picks
the landing page for a denied redirect.

## Server-side enforcement

The UI hides controls; `sync.php` is the backstop. On every POST it resolves the
caller's permissions once and, per collection, requires `edit` on the owning
module. A collection the caller may not edit is neither written nor pruned by
delete-by-omission; where the module's delete toggle is off, writes go through
but deletions are skipped. Skipped collections are listed in the response as
`permissionSkipped` and logged. The role registry and global settings stay
admin-only. `upload.php` requires `edit` on at least one content module.

GET responses are **not** filtered by permission: modules reference each
other's records (a project shows its client, an invoice its items), so hiding a
collection from the payload would break views the user is allowed to open.
Hiding data at the API level is a possible follow-up, not something the UI
relies on.

## Adding a permission

1. Add the definition to `PERMISSION_SECTIONS` in `src/utils/permissions.ts`
   (key, kind, `legacyDefault`, `newRoleDefault`, optional `requires`).
2. Mirror it in `ccrm_permission_sections()` in `api/permissions.php`.
3. Add its label and description to the matrix in `SettingsView.tsx`.
4. Enforce it: `access.can(key)` / `access.canEdit(key)` /
   `access.module(key)` in the view, and the collection mapping in `sync.php`
   if it guards synced data.
5. Extend `src/utils/permissions.test.ts`.
