# Audit: saves the server accepts and then drops

**Date:** 2026-10-26 · **Build read:** `1.12.80-Mango` · **Scope:** read-only. No product code was changed.

The hunt is the class fixed for divisions in 1.12.80: the screen accepts the edit, `POST /sync.php` returns HTTP 200, and the next read does not have the value. Nothing is said, because `permissionSkipped` stays empty.

Round trips ran against the local `crm` container on `http://127.0.0.1:8085` (`ccrm-db-1`). `public/sync.php` and the mounted root `sync.php` are the same file (as are `public/api` and `api/`, 93 PHP files), so `npm run sync:backend` was not required. The QA suite was not used: it mocks `sync.php` and cannot see this class. Throwaway users, the throwaway role, the throwaway employee, the salary and its expense were deleted afterwards. `system_settings` was snapshotted before the settings probes and compared after the restore: no key differed, and `DIVISIONS` no longer contains the probe value.

---

## 1. Summary

| Finding | Severity | Round trip | Who loses the edit | Where |
|---|---|---|---|---|
| Order statuses are never stored | high | yes | Every role, Admin included | `src/App.tsx:1403`, `public/sync.php:3175` |
| Ticket statuses and mailbox settings are dropped unless the role may edit tickets | high | yes | `general_config` = edit and `tickets` is not edit | `public/sync.php:3169`, `src/components/SettingsView.tsx:3896` |
| User and role edits from “Manage users” are ignored | high | yes | A non-Admin role with `pm_managers` = edit | `public/sync.php:3351`, `public/sync.php:3490` |
| Several refusal tags never become a warning, and the client treats them as saved | medium | yes | Anyone who hits a taken name, a taken email, an out-of-scope row, or a refused employee link | `src/App.tsx:1574` |
| Moving a salary to another month leaves the linked expense on the old date | medium | yes | Anyone who may edit salaries | `public/sync.php:5902` |

---

## 2. Findings

### A. A settings field the server never reads

#### A1 — Settings → Orders → statuses disappear after reload

**Observed symptom.** Add or rename an order status. The list updates. Reload, and the built-in nine statuses are back. No toast.

**Root cause.** The orders screen is editable with `general_config` = edit (`SettingsView.tsx:3904-3914`). The client puts `orderStatuses` on `settings` (`App.tsx:1403`) and, on the way back, replaces local state with `normalizeOrderStatusDefs(s.orderStatuses)` (`App.tsx:2969-2971`). A missing value becomes the built-in list (`src/utils/orders.ts:79-81`).

The POST handler’s `$settingsList` (`public/sync.php:3175-3268`) has no `ORDER_STATUSES`. The GET settings object (`public/sync.php:2746-2781`) does not return `orderStatuses` either. The key is not refused by the allowlist, so it never reaches the “differs from stored” check and `permissionSkipped` stays empty. Offer statuses and invoice statuses, on the same settings area, are stored. Order statuses are not.

**Proposed fix.** Store `ORDER_STATUSES` the same way as `OFFER_STATUSES`: omitted means unchanged, included in the `general_config` allowlist, and returned on GET. This does not grant the screen to anyone new. The screen already edits it.

**Round trip** (throwaway Admin, one settings POST, `syncProtocol: 2`):

```json
{
  "postStatus": 200,
  "permissionSkipped": [],
  "getHasKey": false,
  "getValue": null,
  "dbKey": null
}
```

`system_settings` had no `ORDER_STATUSES` row after the POST. The same Admin, in the same session, added a division and the next GET returned it (`"Cstudios"`, `"Cstudios Budapest"`, `"Probe Division"`), with `permissionSkipped: []`. The probe can save a settings key. This one is not a key.

A role with `general_config` = edit and `traffic_sources` = nothing then tried to remove that division. HTTP 200, `permissionSkipped: ["settings:DIVISIONS"]`, and the division was still there on the next GET. The reporting path works for a key that is on the allowlist and already stored. Divisions themselves are fixed.

---

### B. The allowlist says yes, and an earlier gate throws the value away

#### B1 — Settings → Tickets does not save for a settings admin who cannot edit tickets

**Observed symptom.** A role that may edit general settings, and may only view tickets, opens Settings → Tickets, adds a status or changes the mailbox “from” name, and sees it stick. After reload it is gone. No toast.

**Root cause.** The tab’s edit control is `getPermission("general_config") === "edit"` (`SettingsView.tsx:3884-3896`). The allowlist already hands `TICKET_STATUSES` and `TICKET_SETTINGS` to that same permission (`public/sync.php:3273-3279`).

Before the allowlist runs, the value is thrown away unless `$canEditTickets` (`public/sync.php:3169-3172` and `3256-3258`). `$canEditTickets` is Admin or `tickets` = edit (`public/sync.php:2841`). For anyone else `TICKET_STATUSES` becomes `null`, and a null settings value is skipped with no tag (`public/sync.php:3316-3318`). `TICKET_SETTINGS` is left as the previously stored JSON and written back unchanged, which is the same silence.

That flag exists so a person saving a project or a lead does not overwrite ticket columns they were never shown (`public/sync.php:2836-2840`). It is the wrong gate for the settings screen.

**Proposed fix.** When the writer has `general_config` = edit, persist these two settings keys. The allowlist and the screen already say that role may edit them. Keep `$canEditTickets` on the ticket columns that ride along on projects, leads and tasks. The alternative, if ticket configuration should stay inside the tickets module, is to disable the tab unless `tickets` = edit and to emit `settings:TICKET_STATUSES` / `settings:TICKET_SETTINGS` when a push differs. Do not leave the screen editable and the write null.

**Round trip.** Throwaway role `Gate Probe`: `general_config` = edit, `tickets` = view, not Admin. It could read the real status list and `fromName: "Support Desk"`.

```json
{
  "who": "editor general_config=edit tickets=view",
  "postStatus": 200,
  "permissionSkipped": [],
  "statusSaved": false,
  "fromNameBefore": "Support Desk",
  "fromNameAfter": "Support Desk"
}
```

The same payload from the throwaway Admin did save. Both values were restored with the settings snapshot afterwards.

```json
{
  "who": "admin control",
  "postStatus": 200,
  "permissionSkipped": [],
  "statusSaved": true,
  "fromNameAfter": "Probe hold mailbox"
}
```

---

### C. The users screen and the server disagree about who an administrator is

#### C1 — “Manage users” cannot rename a colleague or save a role

**Observed symptom.** A custom role with `pm_managers` = edit opens Settings → Users and Settings → Roles, edits a colleague’s name or adds a role, and the screen keeps the change. Reload restores the previous users and the previous role registry. No toast.

The built-in Project Manager does not have this permission (`public/api/permissions.php:247` sets `pm_managers` to `nothing`). Any role the matrix grants “Manage users” does. The users and roles tabs are shown and edited on that permission (`SettingsView.tsx:4121`, `4519`, `4585`, and the handlers at `2555`, `2611`, `2671`).

**Root cause.** The server treats other people’s accounts and the role registry as Admin-only, on purpose, so a non-admin cannot promote anyone (`public/sync.php:2802-2806`, `3488-3497`).

- Roles are written only inside `if ($isAdmin && …)` (`public/sync.php:3351`). A non-admin push never enters the block and never adds a tag.
- Another user’s row hits `if (!$isAdmin && !$isSelf) continue;` (`public/sync.php:3490-3491`) with no tag.

`$isAdmin` is the role name `Admin` (`public/api/auth.php:639-640`), not `pm_managers`. HTTP 200, `permissionSkipped: []`. The delta baseline then advances, so the edit is not retried.

**Proposed fix.** Do not let `pm_managers` write users or roles. That permission would be able to assign the Admin role, which is what the server is refusing. Gate the Users and Roles editors on the Admin role, matching the server, and when a non-admin push actually changes another user or the registry, add `users` and `roles` to `permissionSkipped` so the client warns and keeps the old baseline.

**Round trip.** `Gate Probe` had `pm_managers` = edit and was not named Admin.

Rename of a second throwaway user:

```json
{
  "postStatus": 200,
  "permissionSkipped": [],
  "users": [
    { "id": "u-gate-victim", "name": "Probe Victim", "email": "ccrm-gate-victim@local.test", "role": "Employee" }
  ]
}
```

The posted name was `Probe Victim Renamed`. The stored name stayed `Probe Victim`.

Adding a role named `Should Not Land`:

```json
{
  "postStatus": 200,
  "permissionSkipped": [],
  "unchanged": true,
  "landed": false
}
```

---

### D. The client only understands some refusal tags

#### D1 — A refused rename looks saved

**Observed symptom.** Change your own login name to a colleague’s name (Personal settings, which `self.account` = edit allows). The new name stays on screen. Nothing warns. Refresh shows the old name.

**Root cause.** The server keeps the stored name and reports it (`public/sync.php:3524-3527`):

```json
{
  "postStatus": 200,
  "permissionSkipped": ["users:nameTaken"],
  "users": [
    { "id": "u-gate-editor", "name": "Probe Editor", "email": "ccrm-gate-editor@local.test" }
  ]
}
```

The posted name was `Probe Victim`. The row stayed `Probe Editor`.

The client’s warning filter (`App.tsx:1600-1618`) keeps a tag only when it is `settings:…` or the name of a collection on the payload (`leads`, `users`, `leads:clients`, `customDashboards:home`, plus a `:delete` suffix). `users:nameTaken` is looked up as a payload key that does not exist, so it is dropped. The baseline loop (`App.tsx:1574-1595`) holds the previous baseline only when the tag is exactly the collection name. `users:nameTaken` is not `users`, so the new baseline is stored and the rename is not sent again.

The same hole covers every tag the server emits that is not a collection name:

| Tag | When | Reachable from the UI |
|---|---|---|
| `users:nameTaken` | Own name matches another account | Yes, with `self.account` = edit |
| `users:emailTaken` | Own email matches another account | Yes, same screen |
| `users:account` | Name or email sent without `self.account` | The personal-settings fields are locked, so not from that screen today |
| `leads:outside-scope` | A lead or client row outside the caller’s set | Only a stale or forged payload |
| `tasks:outside-scope` | A task outside the caller’s set | Only a stale or forged payload |
| `employees:userId` | Linking a login that is missing or already linked | Yes, for a role that may edit employees and `pm_managers` |

**Proposed fix.** Teach the client those suffixes, warn, and do not advance the baseline for the collection (for a single row, keep that id on the previous baseline). A tag the client does not recognise should be treated as unsaved, not as success.

---

### E. A column written on insert and ignored on the next edit

#### E1 — A salary moved to April is still an expense in March

**Observed symptom.** Open a payroll cell, change its month, save. The salary row shows the new month. The linked finance expense keeps the original issue date. The title on that expense does update, so the row can read “April” and be dated 1 March. No error.

**Root cause.** The salary drawer keeps the existing salary id and `financialRecordId` and sends the new period (`SalaryCellDrawer.tsx:211-217`). The server recomputes the expense’s issue date from that period (`public/sync.php:5952`) and binds it on the INSERT (`5906`). The `ON DUPLICATE KEY UPDATE` list (`5902-5911`) updates title, amounts, status and due date, and does not mention `issue_date`. `type`, `subtype`, `currency` and `created_by` are insert-only as well. Currency is hardcoded to `EUR` in the VALUES clause. Leaving `created_by` alone is right. Leaving `issue_date` alone is not: the server has just calculated a new one and then discarded it.

**Proposed fix.** Put `issue_date` on the UPDATE list of this upsert. It is the date the same statement already computed.

**Round trip** (throwaway Admin, throwaway employee, one salary id, then deleted):

```text
march  {"salary":{"period_key":"2026-03","period_number":3,"financial_record_id":"fr-sal-sal-gate-probe"},
        "expense":{"issue_date":"2026-03-01","title":"Salary: Gate Probe (2026-03)"}}
april  {"salary":{"period_key":"2026-04","period_number":4,"financial_record_id":"fr-sal-sal-gate-probe"},
        "expense":{"issue_date":"2026-03-01","title":"Salary: Gate Probe (2026-04)"}}
```

Both POSTs were HTTP 200. The salary moved to April. The expense date stayed 1 March.

The other upserts in `public/sync.php` were diffed the same way. Insert-only columns that are not a later edit:

- `tasks.created_by` and `orders.created_by` — set when the row is created, not edited afterwards.
- `tickets.created_at` — the opened time. Message `created_at` and message `body` are on their UPDATE list.
- `leads.financial_summary` — documented as server-owned (`public/sync.php:4118-4122`).
- Child rows (task assignees, meeting tasks, order lines, offer lines) are deleted and inserted again, so they have no UPDATE list and an edit does replace them.

`ccrm_leads_are_identical` now compares timeline `timestamp` and `author`, `vat_validation_result`, `hidden` and `is_outgoing`. The September 2026 misses in that function are not still there.

---

## 3. Checked and fine

- **Settings allowlist.** Every key in `$settingsList` sits on at least one of `general_config`, `pipeline_stages`, `traffic_sources`, `ai_config`. `DIVISIONS` and `DIVISION_COLORS` are on `traffic_sources` (`public/sync.php:3300-3304`). An Admin save of a new division persisted. A role without `traffic_sources` was refused with `settings:DIVISIONS` and the stored list was kept.
- **Settings the client sends that the server stores elsewhere.** `financialMode` and `financialSimplifiedTable` are duplicated inside `settings` and also sent as top-level keys. The top-level keys are what the server writes (`public/sync.php:5518-5528`), behind `financial` = edit, which is also what the finance settings tab checks.
- **`customLabels`.** GET returns it. The client does not send it, and there is no editor. The server treats a missing key as unchanged (`public/sync.php:3263-3268`), so an unrelated save does not wipe it.
- **Pipeline, sources, project statuses, offer and invoice statuses, price levels, task settings, billing, integrations, employee settings.** The screen permission and the server permission match: `pipeline_stages`, `traffic_sources`, `general_config`, `ai_config`, `financial`. Employee settings stay behind `general_config` on both sides (`employeeRights.ts` `canConfigure`, `public/sync.php:6060`).
- **Own name without `self.account`.** Personal settings locks the fields. The server would tag `users:account`. That tag is still dropped by the client (finding D1); the screen itself does not offer the edit.
- **Workflow saves** (`AutomationView.tsx:1465-1476`) read `success` and toast the server message. `workflows.php` answers 403 `{success:false}` without `automation` = edit.
- **Upload** checks `res.ok` and surfaces `error` (`WarehouseView.tsx:849-851`). `upload.php` requires a session and an editable module before it stores a file.
- **Lead identity check** covers the fields the lead upsert writes, including the timeline timestamp and author that the September audit found missing.

---

## 4. Not confirmed by a round trip

- **Order delete ignores the response.** `OrdersView.tsx:474-477` and `ClientsView.tsx:1723-1728` remove the order locally and toast success without reading status or body. `orders.php` returns 403 when `orders.delete` is missing, and the button is hidden unless that same permission is edit, so a normal click is not refused. A 403 from any other cause would still look deleted until the next sync. Not provoked.
- **Warehouse stock and batch failures are logged and skipped** (`public/sync.php:5250-5252`, `5278-5280`) inside an HTTP 200. That drops a row only when the INSERT throws. Not provoked.
- **A project payload with no `projectTypeId` is `continue`d with no tag** (`public/sync.php:3788`). The create flow sets a type before save. Not provoked.
- **Salary expense currency** is hardcoded `EUR` on insert and is not on the UPDATE list. Not probed as its own case. The issue date on that same statement was probed (E1).
