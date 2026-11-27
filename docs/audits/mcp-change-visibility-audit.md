# MCP change-visibility audit (2026-11-10)

Read-only audit of the MCP gateway (`public/api/mcp.php`, `mcp_ext.php`, `mcp_ext_ops.php`, `mcp_ext_intel.php`,
`mcp_ext_writes.php`), the schema (`public/api/schema.php`) and the write paths in `public/sync.php`, against the question
an assistant polling the app asks: **"what changed since X?"** and **"what is due / overdue in period Y?"**.

The reference for "fixed" is `list_tasks` after `69573649` + `5c8ec919` (v1.13.68 / v1.13.73).

**Scope covered:** all 84 tools. 54 of them read business data, and all 54 are in the matrix (§1b). The other 30 are
write tools; they were checked for question 5 (does a child change move the parent's `updated_at`), see RC3.

**Nothing was fixed.** No repo file other than this report was changed.

### How claims were verified

- **Code:** every cell below points at the SQL or PHP that decides it.
- **Probe:** `npm run test:mcp` ran on 2026-11-10 with 242 passed and 1 failed (the known `get_invoicing_metrics`
  failure, §6). It covers the task change-tracking claims: 11 checks for ISO moments, `updated_from`, `sort_by`, and
  assignee/tag bumps with and without a real change.
- **Scratch-schema experiment** (`ccrm_audit_scratch` on `ccrm-db-1`, built with `CREATE TABLE … LIKE ccrm.*`, then dropped;
  dev data never written). It confirmed five things:
  - Adding a `project_managers` row leaves `projects.updated_at` unchanged.
  - An unchanged `INSERT … ON DUPLICATE KEY UPDATE` of a project leaves `updated_at` unchanged, which is good.
  - Adding an `invoice_offer_items` row leaves `invoices_offers.updated_at` unchanged.
  - Inserting the paid `fr-inv-<id>` ledger movement leaves `invoices_offers.updated_at` unchanged.
  - A real column change does bump it.
- **MySQL time zone on dev:** `@@global.time_zone = SYSTEM`, `@@session.time_zone = SYSTEM`, `@@system_time_zone = UTC`.
  So `NOW()` and `CURDATE()` run in UTC while PHP runs in `Europe/Bratislava` (`public/config.php:5`). Nothing sets the
  session zone (grep for `time_zone` in `public/` finds nothing). The production server's zone was **not verified**.
- **Not verified at runtime:**
  - Sync-path child bumps were verified at the SQL level (the experiment above), not through a real `sync.php` push.
  - The production MySQL zone.
  - Whether existing MCP-written timeline rows really are 1–2 h off on production.

> **Tool-list caching (said once):** adding optional parameters or richer descriptions needs no reconnect, but MCP clients
> cache `tools/list`. A connected assistant only sees new parameters and description text after the connector is
> refreshed, or in a new session. No fix below renames a tool or changes ids, URL, headers or `serverInfo.name`.

---

## 1. Summary

### 1a. By entity

Columns: **Fresh** = the list returns a last-changed moment with an offset. **Filter** = "changed between A and B" with a
time of day. **Sort** = newest-changed first. **Biz dates** = range plus overdue/upcoming on the entity's own dates.
**Child** = a child-row change moves the parent. **History** = when and from what to what a field changed.

✅ yes · ◐ partial · ❌ no · — not applicable

| Entity | Fresh | Filter | Sort | Biz dates | Child | History | Severity |
|---|---|---|---|---|---|---|---|
| Tasks | ✅ | ✅ | ✅ | ◐ buckets, no range | ✅ (comments excluded) | ◐ stored, not listed | **Low** |
| Projects | ❌ | ❌ | ❌ | ◐ returned, not filterable | ❌ | ◐ | **High** |
| Milestones (Gantt + blocking tasks) | ❌ | ❌ | — | ◐ per project only | ❌ | ◐ | Medium |
| Leads | ◐ DATE only | ❌ | ❌ | ❌ | ❌ | ◐ status changes | **High** |
| Clients (profiles) | ◐ DATE only | ❌ | ◐ created only | — | ❌ | ❌ | Medium |
| Contacts | ❌ | ❌ | ❌ | — | — | ❌ (no entity) | Low |
| Invoices / offers | ❌ | ❌ | ❌ | ❌ (no payment state) | ❌ | ◐ status day | **High** |
| Expenses | ❌ | ❌ | ❌ | ◐ issue date only | — | ❌ | Medium |
| Financial movements | ❌ (loaded, dropped) | ❌ | ❌ | ◐ filed date, manual "overdue" | — | ◐ paid_date | **High** |
| Recurring movements | ❌ | ❌ | — | ◐ next charge | — | ◐ stored, not listed | Low |
| Cash-flow forecast / finance summaries | — | — | — | ◐ overdue money dropped | — | — | Medium |
| Inventory items | ❌ (no column) | ❌ | ❌ | — | ❌ | ◐ via movements | Medium |
| Stock movements | ◐ issued_at only | ❌ | ◐ | ◐ whole days | ❌ | ❌ | Medium |
| Batches | ❌ | ❌ | — | ✅ expiry window | — | ❌ | Low |
| Warehouses / suppliers | ❌ | ❌ | ❌ | — | — | ❌ | Low |
| Meetings | ◐ created only, raw | ❌ | ❌ | ◐ lower bound only | ❌ | ❌ | Medium |
| Meeting action items | ❌ (no column) | ❌ | ❌ | ◐ returned, not filterable | ❌ | ❌ | Medium |
| Communications / timeline | ◐ event time only | ❌ | ◐ | — | — | ✅ status entries | **High** (no cross-lead feed) |
| Documents / files | ◐ event time | ❌ | ◐ | ❌ | — | ❌ | Low (plus a permission leak, RC11) |
| Employees | ❌ | ❌ | ❌ | — | — | ❌ | Low |
| Salaries / payroll | ◐ raw | ❌ | ❌ | ◐ returned, not filterable | — | ◐ closed_at | Medium |
| Vacations | ◐ raw | ❌ | ❌ | ◐ year of start only | — | ❌ | Medium |
| Workflows / runs | ◐ raw | ❌ | ◐ | — | — | ✅ run log | Low |
| Unified entries (custom registries) | ❌ | ❌ | ❌ (no ORDER BY) | ❌ due_date not filterable | — | ❌ | Medium |
| Time tracking | not exposed through MCP (no tool reads `time_entries`) | | | | | | n/a (noted) |

### 1b. Every read tool × questions 1–11

**Legend for references:**

| Prefix | File |
|---|---|
| `M` | `public/api/mcp.php` |
| `E` | `mcp_ext.php` |
| `O` | `mcp_ext_ops.php` |
| `I` | `mcp_ext_intel.php` |
| `W` | `mcp_ext_writes.php` |
| `S` | `public/sync.php` |
| `Sc` | `public/api/schema.php` |

**Columns:**

| # | Question |
|---|---|
| 1 | Freshness |
| 2 | Changed-between filter |
| 3 | Newest-changed sort |
| 4 | Business-date range / overdue |
| 5 | Child bump |
| 6 | Field history |
| 7 | Deletes / archives |
| 8 | Derived values |
| 9 | Time zone |
| 10 | Pagination |
| 11 | Permissions |

"raw" means a TIMESTAMP is returned as the naked string MySQL formats in its session zone: no offset, and UTC on dev.

| Tool | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `list_leads` | ◐ `created_at` DATE, no `updated_at` M1498, Sc101-102 | ❌ M482-494 | ❌ fixed `created_at DESC` M1501 | ❌ no date filter, `follow_ups` not returned M1498, Sc97 | ❌ timeline/categories S4818-4836 | ◐ status_change events, per lead only M1613 | ❌ `archived = 0` forced M1475, hard delete S889 | — | ◐ date only | ◐ module filter runs after `LIMIT` → short pages M1508-1510 | ✅ |
| `get_lead` | ◐ raw M1514 | — | — | — | ❌ as above | ◐ last 20 timeline rows M1529 | — | — | ❌ raw; timeline clocks mixed (RC2) | ◐ 20 events, no paging M1529 | ✅ M1524 |
| `list_clients` | ◐ earliest DATE O145; no `updated_at` O151-161 | ❌ M576-591 | ◐ created only W339 | — | ❌ | ❌ | ◐ `include_archived`, not "since" M588 | ✅ total_value as register | ◐ date only | ◐ offset on an in-memory list, ties unstable W342 | ✅ |
| `get_client` | ◐ raw record M1696 | — | — | ◐ project dates returned I362 | ❌ | ❌ | — | ✅ | ❌ raw | ◐ invoices capped at 50 M1710 | ✅ M1702, M1709 |
| `get_client_profile` | ◐ DATE O328 | — | — | — | ❌ | ❌ | ◐ archived flag O328 | ✅ | ◐ | — | ✅ |
| `get_client_dossier` | ◐ DATE I887 | — | — | ◐ "upcoming meetings" are really the last 5, past included I773 vs I951 | ❌ | ◐ last 5 timeline rows I956-965 | — | ✅ | ❌ timeline raw | ◐ tasks 50, docs 100 I935, I918 | ✅ |
| `get_client_invoices` | ❌ I524-533 | ❌ | ❌ issue-date sort I856 | ◐ derived `overdue` filter, per client only, no due range I827 | ❌ payment (verified) | ◐ `paid_date` I527 | ◐ cancelled shown, deletes invisible | ◐ derived; differs from app (prior audit #9) I370-376 | ◐ dates | ◐ 300 cap, no offset I828 | ✅ ledger only with `financial` I830 |
| `list_contacts` | ❌ M1756 | ❌ | ❌ | — | — | ❌ `create_contact` only writes a note M1779 | — | — | — | — | ✅ |
| `get_lead_pipeline_summary` | — | — | — | ◐ SLA breaches = overdue stage O380-385 | — | ◐ `entered_stage` from status_change O367 | — | ✅ | ◐ mixed timeline clocks can shift a day O381 | — | ✅ |
| `list_tasks` | ✅ M1859-1868 | ✅ M1827-1831 | ✅ M1852-1856 | ◐ buckets, no deadline from/to M1832-1847 | ✅ S5381, O427, O456 (comments excluded M680) | ◐ `original_deadline`/`deadline_moves` stored Sc173-174, not listed M1859 | ❌ `archived = 0` forced M1791; hard delete S882-884 | — | ✅ (`completed_at` VARCHAR, no offset Sc161) | ◐ offset; rows that move during `updated_at DESC` paging can be skipped M1852 | ✅ M1821 |
| `get_task` | ✅ M1872 | — | — | ✅ | ✅ | ◐ deadline moves returned (SELECT *) | — | — | ◐ `completed_at` without offset | — | ✅ |
| `list_meeting_tasks` | ❌ no columns Sc269-282 | ❌ | ❌ `due_date ASC` O488 | ◐ returned, no range/overdue O483-491 | ❌ replaced on every meeting save S5559-5565 | ❌ | ❌ replace = hard delete | — | — | ❌ limit, no offset O488 | ✅ |
| `list_projects` | ◐ `created_at` raw, no `updated_at` M1952 | ❌ M785-797 | ❌ `created_at DESC` M1956 | ◐ deadline/invoice/finish returned, no range or overdue M1952 | ❌ managers S4345-4349 (verified), Gantt S4443, milestone tasks M2013 | ◐ `finished_at`, `delay_reason` | ◐ `include_archived` M1946; hard delete S4466-4479 | — | ❌ raw | ❌ no offset, cap 100 M1950 | ✅ |
| `get_project` | ◐ raw M1964 | — | — | ✅ dates + installment due/paid I379-389 | ❌ | ◐ | — | ✅ | ❌ raw | — | ✅ M1979, M1985 |
| `list_milestones` | ❌ Gantt rows have no timestamps S245-253; task rows no `updated_at` I461 | ❌ | — | ◐ deadline + overdue status, per project only I449 | — | ◐ `completed_at` I472 | ◐ `open_only`; deleted rows invisible | ✅ | ◐ | ✅ | ✅ I458 |
| `get_project_billing_summary` | — | — | — | — | — | — | ◐ `include_archived` | ✅ | — | ❌ no offset, cap 100 E868 | ✅ |
| `get_invoicable_summary` | — | — | — | — | — | — | — | ✅ two named bases E958 | — | — | ✅ E897, E924 |
| `list_invoices` | ❌ M2215 | ❌ | ❌ `issued_at DESC`, no tiebreak M2218 | ❌ dates returned, not filterable; **no payment state despite the description** M925 vs M2215 | ❌ items S6376-6380; payment (verified) | ◐ `status_changed_at` DATE, not returned Sc827 | ◐ cancelled filterable; deletes invisible | ❌ no paid/open | ◐ dates | ❌ no offset, cap 100 M2213 | ✅ |
| `get_invoice` | ◐ raw M2226 | — | — | ◐ | ❌ | ◐ `status_changed_at` | — | ❌ no payment (no ledger join) M2225-2237 | ❌ raw | — | ✅ |
| `get_invoicing_metrics` | — | — | — | ◐ year of `issued_at` E1135 | — | — | — | ✅ (probe failure, §6) | — | — | ✅ |
| `list_expenses` | ❌ M2270 | ❌ | ❌ no tiebreak M2273 | ◐ issue date only, unvalidated strings M2254-2261 | — | ❌ | ◐ cancelled; deletes invisible | ◐ raw amounts | ◐ | ❌ no offset M2268 | ✅ M2279-2281 |
| `list_financial_movements` | ❌ `updatedAt` loaded E415, dropped E1048-1056 | ❌ | ❌ filed date E1043 | ◐ filed-date range only; `status=overdue` = manual flag E1025 vs derived I374 | — | ◐ `paid_date` | ◐ | ✅ settled/expected split | ◐ | ✅ offset + `id DESC` E1042-1044 | ✅ E383 |
| `list_recurring_movements` | ❌ | ❌ | — | ◐ `next_charge` E1086 | — | ◐ amount history stored Sc760, loaded E409, not returned E1081-1087 | ◐ `include_paused` | ✅ | ◐ | ✅ unpaged, small | ✅ |
| `get_cash_flow_forecast` | — | — | — | ◐ unpaid movements already past due are **dropped** E1107 | — | — | — | ◐ overdue money missing | ◐ PHP today | ✅ `items_truncated` E1128 | ✅ |
| `get_financial_overview`, `get_financial_summary` | — | — | — | ◐ year | — | — | — | ✅ | ◐ PHP today | — | ✅ |
| `get_financial_simplified_table`, `get_financial_mode` | ❌ `system_settings.updated_at` Sc232 not returned | — | — | — | — | ❌ | — | ✅ | — | — | ✅ |
| `list_inventory_items` | ❌ no `updated_at` column Sc599-619 | ❌ | ❌ by name M2321 | — | ❌ stock/price have no timestamps W627, W642 | ◐ quantity history = movements | ❌ | ✅ | — | ❌ no offset M2311 | ✅ |
| `get_inventory_item` | ◐ `created_at` raw M2329 | — | — | — | ❌ | ❌ | — | ✅ | ❌ raw | — | ✅ |
| `get_warehouse_metrics` | — | — | — | ✅ month (PHP) O508 | — | — | — | ✅ | ✅ | — | ✅ |
| `list_stock_movements` | ◐ `issued_at` DATETIME, no `created_at` O543 | ❌ | ◐ business time, not change time O543 | ◐ whole-day from/to O541-542 | ❌ items replaced S6035; no `updated_at` Sc649-672 | ❌ draft → confirmed untracked | ◐ status; deletes invisible | ✅ | ❌ clock unknown, no offset | ❌ no offset O543 | ✅ |
| `list_batches` | ❌ O554 | ❌ | — | ✅ `expiring_within_days` O550 | — | ❌ | ◐ `include_empty` | — | ◐ `CURDATE()` = UTC O550 | ❌ hard 200, no flag O554 | ✅ |
| `list_meetings` | ◐ `created_at` raw; `updated_at(3)` Sc265 not returned M2428 | ❌ | ❌ `date DESC` M2431 | ◐ lower bound only; `CURDATE()` M2413-2419 | ❌ action items S5559 | ❌ | ❌ `archived = 0` forced M2410 | — | ❌ raw; UTC date | ❌ no offset M2426 | ✅ |
| `get_meeting` | ❌ O469-476 | — | — | ✅ action-item due dates O477 | ❌ | ❌ | ◐ archived flag | — | — | — | ✅ |
| `list_communications` | ◐ `timestamp` = event time, client-stamped M2517 | ❌ no from/to; `lead_id` required M1143-1154 | ◐ no tiebreak M2520 | — | — | ✅ status_change rows | ❌ timeline replaced wholesale on every lead save S4835 | — | ❌ DATETIME mixed: app local vs MCP `NOW()` M2536, S4839 | ❌ no offset, cap 100 M2514 | ✅ M2501-2507 |
| `list_documents` | ◐ event time O669 | ❌ | ◐ | ❌ | — | ❌ | ❌ | — | ❌ | ❌ no offset | ❌ **no module split without `lead_id`** O654-671 |
| `list_files` | ◐ `timestamp` / `uploadedAt` from JSON O678, O712 | ❌ | ◐ | — | — | ❌ | ❌ | — | ❌ | ◐ 200 cap O678 | ◐ lead source has no module split O677-680 |
| `search_entities` | ❌ I698-756 | ❌ | — | ◐ dates returned | — | — | ✅ archived excluded | — | ◐ | ◐ per-section cap I687 | ✅ |
| `list_employees` | ❌ M2603 | ❌ | ❌ by name | — | — | ❌ salary rate overwritten in place | ◐ `active_only` | — | — | ❌ hard 200, no offset M2603 | ✅ M2606 |
| `get_employee` | ◐ raw (SELECT *) M2609 | — | — | — | — | ❌ | ◐ `is_active` | — | ❌ raw | — | ✅ M2615-2626 |
| `list_salaries` | ◐ raw (`es.*`) M2763 | ❌ | ❌ by period M2767 | ◐ due/payment returned, no range | ◐ items in the row | ◐ `closed_at` Sc1061 | ❌ | ✅ | ❌ raw | ❌ hard 500, no offset M2768 | ✅ |
| `get_payroll_summary` | — | — | — | ✅ months | — | — | — | ✅ | — | — | ✅ |
| `list_vacations` | ◐ raw (`ev.*`) M2793 | ❌ | ❌ `start_date DESC` | ◐ year of start only, no overlap range M2787-2789 | — | ❌ approval moment not stored | ❌ hard delete | — | ❌ raw | ◐ no LIMIT at all M2792-2798 | ✅ |
| `get_vacation_balance` | — | — | — | ◐ "on leave today" only; `CURDATE()` O584 | — | — | — | ✅ | ◐ UTC date | — | ✅ |
| `list_workflows` | ◐ `last_run` raw; `workflows.updated_at` Sc530 not returned O614 | ❌ | — | — | — | ✅ run log | — | — | ❌ raw | — | ✅ |
| `get_workflow_runs` | ◐ raw O626 | ❌ | ✅ newest first | — | — | ✅ | — | — | ❌ raw | ◐ limit, no offset O626 | ✅ |
| `get_unified_entry_rows` | ❌ O650 | ❌ | ❌ **no ORDER BY** O650 | ❌ rows carry `due_date`/`warning_days`, not filterable | — | ❌ | ❌ | — | — | ❌ limit, no offset, nondeterministic O650 | ✅ |
| `list_client_categories`, `list_financial_categories`, `list_warehouses`, `list_suppliers`, `list_unified_entries`, `list_team_members` (reference lists) | ❌ (`updated_at` exists for categories Sc701, Sc717, not returned; others `created_at` only; team members raw M2565) | ❌ | ❌ | — | — | ❌ | ◐ `archived` on unified entries O632 | — | ❌ raw where returned | ❌ suppliers no offset O530 | ✅ |

### 1c. The suspected gaps: confirmed or refuted

| Suspicion | Verdict | Evidence |
|---|---|---|
| `list_projects` filters: status, client_id, search, include_archived; no `updated_*`, no deadline range | **Confirmed**, plus: no `offset` at all (silent truncation at 100) | M785-797, M1929-1961, M1950 |
| `list_invoices` filters: type, status, client_id, search; no date range, no `updated_*` | **Confirmed**, plus: no payment state though the description promises it, no `offset` | M924-936, M2188-2223 |
| `list_leads` filters: status, search, owner; no `updated_*`, no date range | **Confirmed**, plus: archived always hidden, and the module filter runs after `LIMIT` | M482-494, M1474-1511 |
| `list_clients` filters: search, city, client_type; no `updated_*` | **Confirmed**: profiles carry no change moment at all | M576-591, O122-164, W324-344 |
| The tables have `updated_at` (projects, financial_records, invoices_offers, leads, time_entries); `leads.created_at` is a DATE; `audit_log` exists | **Confirmed**. Precision differs: `leads`, `tasks`, `meeting_notes` are `TIMESTAMP(3)`, the rest whole seconds (dev DB, information_schema). `time_entries` is not exposed through MCP | Sc101-102, Sc440, Sc772, Sc835, Sc1325, Sc453-463, Sc2628-2650 |
| DB timestamps are UTC vs local in places | **Confirmed and wider**. TIMESTAMP columns are returned in the MySQL session zone (UTC on dev). DATETIME `timeline_events.timestamp` holds browser-local time from the app but `NOW()` (UTC on dev) from MCP. `CURDATE()` is UTC. `time_entries.start_at`/`end_at` are UTC by design (not exposed) | RC2 |

---

## 2. Findings by root cause

Each finding reads as **symptom** (what an AI client would say) → **cause** → **fix** → **effort** / **schema** / **risk**.

### RC1: the change-window helpers exist, but only `list_tasks` uses them

- **Symptom.**
  - "I can tell you which tasks changed since 14:00, but for projects, invoices, leads, clients, payments, meetings,
    employees, salaries and vacations I can only show you the current list. I can't say what changed."
  - "I can't sort projects by last change."
- **Cause.**
  - `mcp_optional_moment`, `mcp_format_moment` and `mcp_task_moments` (E112-145) are general.
  - Only `list_tasks` (M1827-1831, M1868) and `get_task` (M1878) call them.
  - Every other list tool hand-writes its own `WHERE`/`ORDER BY` with whole-day strings, or with nothing at all
    (M1474-1511, M1929-1961, M2188-2223, M2245-2282, M2409-2436, E1023-1058, M2575-2606, M2746-2800).
  - The data is there: `updated_at` exists on projects, invoices_offers, financial_records, leads, meeting_notes,
    employees, employee_salaries and employee_vacations.
- **Fix.** Generalise the task code into one helper in `mcp_ext.php` (§4). Then give each list tool four things:
  - `created_from`/`created_to`/`updated_from`/`updated_to`;
  - `sort_by` (`updated_at` / `created_at` / its business default);
  - `created_at`/`updated_at` in the output as ISO moments;
  - the same description sentence as `list_tasks`.
- **Effort.** M overall: the helper is S, each tool S.
- **Schema.** No, for the eight tables above. See RC-S for the others.
- **Risk.** Low.
  - Read-only SQL.
  - Each tool must keep its scope clause (the `tasks.view_all` scope, the module split, salary anonymisation).
  - A timestamp filter only narrows a query that is already scoped.

### RC2: timestamps leave the server in an unstated zone, and one column holds two clocks

- **Symptom.**
  - "`list_tasks` says a task changed at 14:44+01:00, but `get_project` says the project changed at 13:44:00. I can't
    tell whether those are the same hour."
  - "Your call log shows a call at 09:12 and a note at 10:15, but the note was logged first."
- **Cause.**
  1. **Raw TIMESTAMPs.** `SELECT *` or a raw `created_at`/`updated_at` comes back formatted in the MySQL session zone,
     which is never set (no `time_zone` anywhere in `public/`) and is UTC on dev. Affected:
     - `get_lead` M1514, `get_client` M1696, `get_project` M1964, `get_invoice` M2226, `get_employee` M2609;
     - `list_salaries` M2763, `list_vacations` M2793;
     - `list_projects` M1952, `list_meetings` M2428, `list_team_members` M2565;
     - `list_workflows` O614, `get_workflow_runs` O626, `get_inventory_item` M2329.
  2. **Two clocks in `timeline_events.timestamp` (DATETIME, Sc122).**
     - The app stores the browser's local time (`S4839`, value from the client).
     - MCP stores MySQL `NOW()`, which is UTC on dev: M1615, M1645, M1666, M1781, M1919, M2536, W367.
     - Read by `list_communications`, `get_lead`, `get_client_dossier`, and by `get_lead_pipeline_summary` for stage age (O367).
  3. **`CURDATE()` is the UTC date.** Affected: `list_meetings upcoming_only` M2414, `list_batches` O550,
     `get_vacation_balance` O584. Between midnight and 01:00/02:00 local time, "today" is still yesterday there,
     while `list_tasks` buckets use PHP's date (M1836).
  4. **Never stated.** Only `list_tasks` says which zone its filters use (M679-682).
- **Fix.**
  - (a) Return every TIMESTAMP through `UNIX_TIMESTAMP()` + `mcp_format_moment`, the helper's job.
  - (b) MCP writes DATETIME values from PHP (`date('Y-m-d H:i:s')`), the app's clock, instead of `NOW()`.
  - (c) Bind `mcp_today()` instead of `CURDATE()`.
  - (d) Every description with a date filter states the zone, built by one function.
- **Effort.** S each.
- **Schema.** No.
- **Risk.** Low.
  - (b) only fixes new rows. Older MCP-written rows stay 1–2 h off on a server whose MySQL runs UTC. They carry
    `ev_` ids and an author, but the app's own id scheme was not checked, so cleaning them up is not proposed.
  - The company time zone ROADMAP item would replace the hard-coded `Europe/Bratislava` (`config.php:5`) in all
    descriptions at once. It removes no finding here, but it would make (d) correct for a non-Slovak company.

### RC3: a change in a child table never moves the parent (tasks excepted)

- **Symptom.**
  - "Nobody touched project X since Monday." But a project manager was added today.
  - "Invoice FA-2026-014 hasn't changed." But it was paid this morning.
  - "Lead Y is unchanged." But a call was logged an hour ago.
- **Cause.** Child rows live in their own tables, and MySQL's `ON UPDATE CURRENT_TIMESTAMP` only reacts to the parent's
  own columns. This was verified in the scratch schema. Only tasks were fixed (S5381, O427, O456). The other writers:

  | Child | Parent | App write path | MCP write path |
  |---|---|---|---|
  | project managers | projects | S4345-4349 (delete + insert) | — |
  | Gantt rows (`proj_gantt_*`, no timestamps S245-253) | projects | S4443 | — |
  | blocking milestone task | projects | (task sync) | `create_milestone` M2005-2020 |
  | invoice line items | invoices_offers | S6376-6380 (delete + insert) | `create_invoice` (new row, fine) |
  | payment = `fr-inv-<id>` ledger movement | invoices_offers | S6166 upsert | `update_invoice_status` cancels the movement W526-535 (the invoice's own status moves too, fine) |
  | timeline entries, categories | leads | S4818-4836 (delete + insert) | `log_communication` M2526-2542, `create_contact` M1769-1787, `add_task_comment` M1901-1926 |
  | action items | meeting_notes | S5559-5565 (delete + insert) | — |
  | movement lines | warehouse_movements | S6035 | `adjust_stock` (new row, fine) |

  An unchanged re-save leaves `updated_at` alone (verified). Keep that property.
- **Fix: two kinds of change, two answers.**
  - (a) Children that are **part of the record in the UI** (managers, line items, action items, Gantt rows) bump the
    parent on a real change only, as tasks do. Snapshot the old set, compare with `ccrm_same_name_set`-style
    normalisation (S662-673), then `UPDATE … SET updated_at = CURRENT_TIMESTAMP(3)`.
  - (b) **Related activity** (a payment on the ledger movement, a timeline entry) gets a separate read-time field,
    `last_activity_at = GREATEST(parent.updated_at, MAX(child.updated_at / timestamp))`, plus an
    `activity_from`/`activity_to` filter. Writing these into `updated_at` would mean `sync.php` conflict detection
    (`ccrm_write_would_clobber`, S675) rejects or warns on a lead edited in the app every time a mail is filed.
- **Effort.** (a) S per child (4 sync paths); (b) M (invoice and lead lists).
- **Schema.** No. Gantt rows and action items have no timestamps of their own, so they can only use (a).
- **Risk.**
  - (a) Medium. A bump inside a push makes another open client's `baseSyncedAt` stale for that record: one extra
    conflict check, which is the trade-off already accepted for tasks.
  - (b) Low.
- **Needs a decision** (see §2, "Decisions needed"): which children count as "changing" the parent.

### RC4: business dates come back but cannot be queried as a range or as "overdue"

- **Symptom.**
  - "Which projects are past their deadline?" → "I'd have to read all projects and compare dates myself, and I can only
    see 100."
  - "Which invoices fall due next week, and which are overdue across all clients?" → no tool answers it.
  - "Who is on leave next week?" → only "today".
- **Cause.**
  - **Projects:** `completion_deadline`, `invoice_date` and `finished_at` are returned but not filterable (M1952).
  - **Invoices:** `issued_at` and `due_date` are returned but not filterable (M2215). The payment state is missing entirely (RC5).
  - **Ledger:** `list_financial_movements` filters only on the "filed" date `COALESCE(paid, due, issue)` (E1033-1036).
    Its `status=overdue` matches the stored manual flag only (E1025). MCP elsewhere derives overdue from the due date
    (I374), and the prior audit (#9) found the app counts only the flag.
  - **Expenses:** issue date only, passed unvalidated as strings (M2254-2261).
  - **Meetings:** a lower bound only (M2416).
  - **Vacations:** `YEAR(start_date)` only (M2787-2789); `get_vacation_balance` shows today only (O584).
  - **Not filterable at all:** action items (O488), unified-entry rows (`due_date`, `warning_days`, O650), stock movements (whole days, O541-542).
  - **Milestones:** only per project (I811).
- **Fix.**
  - One date-range helper: `<field>_from`/`<field>_to` on `mcp_optional_date`.
  - One `bucket` helper (overdue / today / tomorrow / upcoming), lifted from M1832-1847, so every entity means the same thing by "overdue".
  - Invoices and ledger rows derive `payment_status` with `mcp_payment_status` (I370-376) and filter on that, not on the stored flag.
  - `list_vacations` gets an overlap range (`start_date <= to AND end_date >= from`).
- **Effort.** M.
- **Schema.** No.
- **Risk.** Low. "Overdue" for money should follow the outcome of prior audit #9; pick one rule for app and MCP.

### RC5: `list_invoices` promises a payment status it does not return

- **Symptom.**
  - "Invoice 2026014 is `invoiced`, so it's settled?" It is unpaid.
  - The document status is not the payment status, and the description says otherwise.
- **Cause.** The description says "with payment status" (M925). The SQL selects only the document's own columns
  (M2215), and `get_invoice` has no ledger join either (M2225-2237). The right join already exists in
  `mcp_scope_invoice_docs` (I490-536): it adds `fr-inv-<id>` status, paid/open amounts, `paid_date` and a derived
  `payment_status`.
- **Fix.** Build `list_invoices` and `get_invoice` on that row shape, add a `payment_status` filter and a due-date range,
  and use `last_activity_at = GREATEST(io.updated_at, fr.updated_at)` for RC3(b).
- **Effort.** S–M.
- **Schema.** No.
- **Risk.** Low. Paid amounts are shown only where `invoices` is viewable today; `get_client_invoices` shows ledger-only
  rows behind `financial` (I830). Keep that split.

### RC6: pagination stops at the first page, sometimes silently

- **Symptom.**
  - "Here are all 100 projects that changed." There were 140.
  - "Page 2 of the leads has 7 rows, so that's everything." It isn't.
- **Cause.**
  - **No `offset`:** `list_projects` M1950, `list_invoices` M2213, `list_expenses` M2268, `list_inventory_items` M2311,
    `list_meetings` M2426, `list_communications` M2514, `list_meeting_tasks` O488, `list_suppliers` O530,
    `list_stock_movements` O543, `get_workflow_runs` O626, `get_unified_entry_rows` O650 (which also has no `ORDER BY`).
  - **Hard caps without a flag:** `list_employees` 200 (M2603), `list_salaries` 500 (M2768), `list_batches` 200 (O554),
    `get_client_invoices` 300 (I828).
  - **Short pages:** `list_leads` filters rows by module after `LIMIT` (M1508-1510).
  - **No tiebreak in the sort:** `issued_at`, `date` and `timestamp` (M2218, M2273, M2431, M2520).
  - **Paging can skip rows:** paging `list_tasks` by `updated_at DESC` with an offset skips a row that changes between pages.
- **Fix.**
  - In the shared helper: `limit` (max 100) + `offset` + `ORDER BY <col> <dir>, id ASC` for every list.
  - Move the lead module split into SQL with `ccrm_lead_scope_sql` (`read_scope.php:405-418`).
  - Document the polling pattern in the description: `sort_by=updated_at` with `sort_order=asc` and `updated_from`
    = the last `updated_at` seen. A keyset on `(updated_at, id)` is better still, and
    `integration_directory.php:106-107` already pages that way.
  - Keep arrays as the return shape and say "fewer rows than `limit` = last page".
- **Effort.** S.
- **Schema.** No.
- **Risk.** Low.

### RC7: deletes are invisible, and archiving hides a row from the tool that should report it

- **Symptom.**
  - "Task X is gone. Was it finished, archived or deleted?" There's no way to know.
  - "No meetings changed." One was archived.
- **Cause.**
  - **Hard deletes everywhere:** the generic delete S873-898, tasks S882-884, projects S4466-4479 (its tasks are
    unlinked), timeline entries replaced wholesale S4835. No tombstone exists (grep for a deletion log finds none).
  - **No audit of business-record deletes:** `sync.php` audits only settings, roles and users (S3432, S3658, S3769,
    S3948, S4020, S4046, S6605).
  - **`archived = 0` forced** in `list_tasks` (M1791), `list_meetings` (M2410) and `list_leads` (M1475), so an archived
    row drops out instead of appearing as changed. Projects and clients already have `include_archived`.
- **Fix.**
  - (a) MCP only, no schema: `include_archived` and an `archived` flag on those three lists. Archiving changes a column,
    so `updated_from` + `include_archived` then reveals it.
  - (b) Deletes need a tombstone table, `deleted_records(entity, entity_id, deleted_at, deleted_by)`, written by the
    generic delete and the project delete, plus a way to read it (a `deleted_since` parameter, or one new read tool).
- **Effort.** (a) S, (b) M.
- **Schema.** (b) yes. It is a new table, not a new column, but it still goes through `schema.php` and
  `entities_overview.md`; no `sync.php` column healing is needed for a table `sync.php` only inserts into.
- **Risk.**
  - (a) Low.
  - (b) Medium: every delete path must write it, and "mass delete" circuit breakers must not be confused with it.
- **Needs a decision.**

### RC8: field history exists in fragments, and MCP exposes few of them

- **Symptom.**
  - "When did project X's deadline move, and from what?" → unknown.
  - "When was invoice Y marked paid?" → the day only, if at all.
  - "How often was this task postponed?" → only by opening each task.
- **Cause.** No change log of business fields. `audit_log` (Sc453-463) holds free text written by MCP writes (M207-215)
  and admin actions; it has no before/after values and no tool reads it. The fragments that do exist:

  | Fragment | Stored | Exposed through MCP |
  |---|---|---|
  | Lead stage changes (from → to, when, author) | `timeline_events` `status_change` | per lead: `get_lead`, `list_communications` |
  | Task first deadline and number of postponements | `original_deadline`, `deadline_moves` Sc173-174 | `get_task` only (not `list_tasks`) |
  | Task completion | `completed_at` / `completed_by` | yes |
  | Invoice status change | `status_changed_at` **DATE**, client-stamped Sc827 | `get_invoice` only |
  | Recurring amount changes | `recurring_amount_history_json` Sc760 | **no** (E1081-1087) |
  | Project finish day, delay reason | `finished_at`, `delay_reason` | yes |
  | Payroll month closed | `closed_at` Sc1061 | `list_salaries` (raw) |
  | Workflow runs | `workflow_logs` | yes |

- **Fix.**
  - Short term (S, no schema): return the fragments that exist: deadline moves in `list_tasks`, `status_changed_at` in
    `list_invoices`, amount history in `list_recurring_movements`, and a cross-lead `status_change` feed (RC9).
  - Long term (L, schema): a field-level change log written server-side. Out of scope to design here (§3).
- **Risk.** Low for the short-term part.

### RC9: there is no "what happened since X" feed across leads and clients

- **Symptom.** "To find calls, mails and stage changes logged since 14:00 I'd have to call `list_communications` once
  for every lead."
- **Cause.** `list_communications` requires `lead_id` (M1152) and has no time filter (M2494-2524). For an assistant
  that polls, this is the most direct way to see activity, and it is closed.
- **Fix.**
  - Make `lead_id` optional, which is still the same tool.
  - Add `from`/`to` on `timestamp` (local time, RC2) and `offset`.
  - Without `lead_id`, join `leads` and apply `ccrm_lead_scope_sql` per row, plus the existing email gate (M2507).
- **Effort.** S–M.
- **Schema.** No.
- **Risk.** Medium (permissions): the per-row module split is required. An unscoped feed would leak client activity to
  a leads-only key, which is exactly the RC11 bug.

### RC10: descriptions that promise what the SQL does not do

- **Symptom.** The assistant trusts a description and gives a wrong answer.
- **Cause.**
  - `list_invoices` "with payment status" (M925 vs M2215, RC5).
  - `get_client_dossier` "upcoming meetings" (I773), but the SQL returns the last 5 by date, past included, as `recent_meetings` (I951).
  - `list_financial_movements` offers `status: overdue` (E801), but it means the manual flag, not "past due" (E1025).
  - `list_tasks` says `updated_at` "moves on any edit to the task" (M680), but an archived task vanishes from the list
    (M1791), so an archive never shows up as a change.
- **Fix.** Correct the text, or the SQL, as part of RC4, RC5 and RC7.
- **Effort.** S.
- **Schema.** No.
- **Risk.** None.

### RC11 (found in passing, not a timestamp issue): `list_documents` skips the lead/client module split

- **Symptom.** A key that can view leads but not clients sees the titles, amounts and file names of documents filed on
  client records.
- **Cause.** `list_documents` is gated on `leads` only (O303). Without `lead_id`, its query has no classifier
  (O654-671). With `lead_id` it checks the record (O657-665). `list_files source=lead` has no check either (O677-680;
  gated on `files`). Every other lead-facing tool applies `mcp_lead_module_visible`.
- **Fix.** Add `ccrm_lead_scope_sql`-style filtering joined on `leads`. RC9 needs the same.
- **Effort.** S.
- **Schema.** No.
- **Risk.** Low.
- **Note.** It is a security fix: worth doing first and separately from the rest.
- Also seen: `mcp_task_scope` matches the caller by name only (M1459-1466), while `ccrm_task_scope_sql` matches name or
  email (`read_scope.php:427-441`). That is narrower (an MCP caller may miss tasks assigned by e-mail), not a leak.

### RC12: derived money totals drop overdue amounts and cannot show when they changed

- **Symptom.**
  - "Cash flow for the next 3 months: €X expected." The €Y already overdue is in no figure the MCP returns.
  - "Did yesterday's payment change the overdue total?" There is no way to tell.
- **Cause.**
  - `get_cash_flow_forecast` drops unpaid movements whose due date is already past (`$date < $start`, E1107).
  - No tool totals overdue receivables across clients: `get_client_invoices` is per client (I825).
  - The summary tools are computed "as of today" (`mcp_today()`), with no period of change. That is inherent, but
    "paid in period" works only through `list_financial_movements status=paid from/to`, because the filed date equals
    `paid_date` once paid (E1034). The client sets `paid_date` (browser clock).
- **Fix.**
  - An `overdue` block in the forecast: unpaid, due before today, with totals.
  - The RC4 ledger ranges (`paid_from`/`paid_to`, `due_from`/`due_to`) so "paid yesterday" and "overdue now" are two
    explicit calls.
  - Keep `as_of` in every summary.
- **Effort.** S–M.
- **Schema.** No.
- **Risk.** Low.
  - Matches the stored-vs-derived rules (`docs/audits/stored-vs-derived-audit.md` Part P2, #4: rule rows are not
    movements; #9: overdue is derived).
  - The MCP finance maths already mirrors the app (`mcp_fin_split`, `mcp_fin_movement_split`, E434-473; probe parity
    section passes).

### RC-S: tables with no change moment at all (schema changes, listed and not decided)

For each of these, `updated_at` (or a bump of the parent, RC3a) is the only way to answer "changed since":

| Table | Today | Needed for | Alternative without schema |
|---|---|---|---|
| `warehouse_items` Sc599-619 | `created_at` only; price and average cost change in place W627 | item / price changes | none (stock changes are visible as movements) |
| `warehouse_movements` Sc649-672 | `issued_at`, `created_at`; draft → confirmed untracked | status changes | none |
| `meeting_tasks` Sc269-282 | nothing; rows deleted and re-inserted on every meeting save S5559 | action-item changes | bump `meeting_notes.updated_at` (RC3a) |
| `warehouse_batches` Sc633-647, `suppliers` Sc575-597 | `created_at` only | edits | none |
| `proj_gantt_*` S245-253, `ue_*` registries | no timestamps | milestone / registry edits | bump the project (RC3a); registries: none |
| `leads.created_at` Sc101 | DATE | "created between 14:00 and 16:00" | none (the time of day was never stored) |
| `invoices_offers.status_changed_at` Sc827 | DATE, client-stamped | "marked sent/cancelled at" | the ledger movement's `updated_at` for payments only |

Each new column follows the **4-place rule** in `.agents/rules/database-schema-and-sync.md`:
1. `CREATE TABLE` in `schema.php`;
2. an idempotent migration in `ccrm_apply_migrations()`;
3. pre-transaction column healing in `sync.php` for every table `sync.php` writes to (all of the above except `ue_*`);
4. `entities_overview.md`, then `npm run sync:backend`.

`ADD COLUMN updated_at TIMESTAMP(3) … ON UPDATE CURRENT_TIMESTAMP(3)` stamps every existing row with the migration time.
That is harmless, but the first poll after deploy will report every row as changed. Say so in the release note.

### Decisions needed (stop-and-ask items)

1. **Schema changes:** RC-S (which tables get `updated_at`), RC7b (tombstone table), RC8 long term (change log).
   None decided here.
2. **Two readings of "changed":**
   - Does a new timeline entry (call, mail, note, comment, stage-change event) count as a change of the lead or client?
     Today, for tasks, a comment does not (M680).
   - Does a payment recorded on an invoice's ledger movement count as a change of the invoice?
   - Do a new milestone task or Gantt row, and a changed project manager, count as a change of the project?
   - For a client profile spanning several records, is "changed" any of its records?

   The recommendation (RC3) is two fields: `updated_at` = the record's own fields, including children shown inside
   the record form; `last_activity_at` = anything attached to it. That answers both readings without making
   `sync.php` conflict checks noisier.

---

## 3. Data gaps vs MCP gaps

### Not stored at all (data gaps): MCP cannot fix these

- **No field-level history for:**
  - project deadline / invoice date / value / status;
  - invoice amounts;
  - lead value or owner;
  - employee salary rate;
  - expense amounts;
  - vacation approval.

  Only the fragments in the RC8 table exist.
- **No record of deletions** for any business entity (hard deletes, no tombstone, no audit row) (RC7).
- **No change moment** on `warehouse_items`, `warehouse_movements`, `meeting_tasks`, `warehouse_batches`, `suppliers`,
  `proj_gantt_*`, `ue_*` rows (RC-S).
- **Time of day missing:** lead creation has no time of day (`leads.created_at` DATE); invoice status changes are
  recorded to the day only (`status_changed_at` DATE, client-stamped).
- **No moment of approval** for a vacation request (`approved_by` only).
- **No contact entity:** `create_contact` writes a timeline note (M1779); `list_contacts` returns the one primary contact (M1756-1767).
- **SuperFaktúra payment state is fetched live and never stored**, so there is no "paid since" for invoices issued there
  (I617-663; prior audit #8).

### Stored but not exposed (MCP gaps): fixable without schema

- **`updated_at` not returned, filtered or sorted** on `projects`, `invoices_offers`, `financial_records` (loaded and
  then dropped, E415 → E1048), `leads`, `meeting_notes`, `employees`, `employee_salaries`, `employee_vacations`,
  `workflows`, the category tables.
- **Business dates returned but not filterable:** project deadline/invoice date, invoice issue/due date, ledger due/paid
  date, meeting date (upper bound), vacation range, action-item and registry due dates.
- **Invoice payment state** (the `fr-inv-<id>` movement) missing from `list_invoices` and `get_invoice`.
- **Existing history not returned:** task `original_deadline`/`deadline_moves` in lists, invoice `status_changed_at`,
  recurring amount history, a cross-lead status-change feed.
- **Archived rows** of tasks, meetings and leads cannot be listed.
- **Overdue receivables** across clients, and overdue money in the cash-flow forecast.
- **`audit_log`** (MCP-originated changes) is not readable. Admin-only would be the natural gate if it is ever exposed.

---

## 4. Proposed fix order

**Build one shared helper first**, from the task implementation, so every tool behaves the same. Put it in
`mcp_ext.php` next to `mcp_optional_moment`:

```php
/**
 * The change window and order every list tool shares.
 * $cols: ['created' => 'p.created_at', 'updated' => 'p.updated_at', 'default_sort' => 'p.created_at DESC', 'id' => 'p.id']
 * Returns [whereFragments[], params[], orderBy, limit, offset].
 */
function mcp_list_window(array $args, array $cols): array { /* created_* / updated_* via mcp_optional_moment,
   compared with UNIX_TIMESTAMP(col); sort_by enum (updated_at | created_at | default) + sort_order; tiebreak on id;
   limit ≤ 100 + offset */ }

/** Every *_ts column (selected as UNIX_TIMESTAMP(...) AS x_ts) becomes x as an ISO 8601 moment. */
function mcp_row_moments(array $row): array { /* generalises mcp_task_moments */ }

/** The one sentence every description appends: filters, sort, zone, offset suffix, paging rule. */
function mcp_window_doc(string $entity): string { /* … date_default_timezone_get() … */ }

/** <field>_from / <field>_to on a DATE column, and the overdue/today/tomorrow/upcoming bucket of M1832-1847. */
function mcp_date_range(array $args, string $field, string $col): array { /* … */ }
```

`list_tasks` is then rewritten onto it, and the probe proves nothing changed for tasks: its 11 checks must stay green.

| # | Step | Root causes | Effort |
|---|---|---|---|
| 0 | `list_documents` / `list_files` module split (security, independent) | RC11 | S |
| 1 | Shared helper + port `list_tasks` onto it | RC1, RC2a/d, RC6 | M |
| 2 | `list_projects`, `list_invoices` (+ ledger join, payment status), `list_leads` (+ SQL module split, `include_archived`), `list_financial_movements` (+ `updated_at`, due/paid ranges, derived overdue) | RC1, RC4, RC5, RC6, RC7a, RC10 | M |
| 3 | `list_communications` without `lead_id` + `from`/`to`; MCP timeline writes use the PHP clock; `CURDATE()` → `mcp_today()` | RC9, RC2b/c | S–M |
| 4 | Remaining business-date ranges and buckets (meetings, vacations overlap, action items, registry rows, expenses validated), forecast `overdue` block | RC4, RC12 | M |
| 5 | After the "changed" decision: child bumps in `sync.php` (managers, invoice items, action items, Gantt) and `last_activity_at` on invoices and leads | RC3 | M |
| 6 | Expose existing history fragments; `include_archived` on tasks and meetings | RC8 (short), RC7a | S |
| 7 | Remaining lists (`list_meetings`, `list_employees`, `list_salaries`, `list_vacations`, `list_stock_movements`, `list_expenses`, `get_*` raw timestamps) | RC1, RC2a, RC6 | M |
| 8 | Schema items once decided (4-place rule each) | RC-S, RC7b, RC8 (long) | M–L |

Steps 1–3 remove four of the five top gaps without a schema change.

---

## 5. Suggested verification

Format: *before → desired*, then a sentence to ask a Claude chat with the connector, then a probe check where one is
possible. The probe already has the pattern for each: `scripts/probe-mcp/run.mjs`, task section,
"updated_from leaves out a task last changed before it".

**RC11 `list_documents` split**
- *Before:* a leads-only key lists documents of `client-*` records. *Desired:* it doesn't.
- **Chat:** with a leads-only key, "List all documents filed this year."
- **Probe:** key with `leads=view`, `clients=nothing` → `list_documents` contains no row whose `lead_id` is a client record.

**Shared helper + `list_projects`**
- *Before:* "I can't tell which projects changed today." *Desired:* `updated_at` with offset per row; `updated_from`
  narrows; `sort_by=updated_at` newest first; `offset` pages past 100.
- **Chat:** "Which projects changed since 9:00 today? Newest first."
- **Probe:**
  - Stamp `projects.updated_at` of P1 an hour ago, edit P2 now; `updated_from=now-5min` → P2 only.
  - Re-saving P1 unchanged → `updated_at` unchanged.
  - 120 seeded projects → offset 100 returns 20.

**`list_invoices` payment status**
- *Before:* an unpaid invoice shows only `status: invoiced`. *Desired:* `payment_status: unpaid|overdue|paid`,
  `paid`, `open`, `paid_date`; `payment_status=overdue` across clients; `due_from`/`due_to`.
- **Chat:** "Which invoices are overdue right now, across all clients, and how much is open?"
- **Probe:** an invoice with `fr-inv-*` pending and `due_date` = yesterday → `overdue`; set the movement paid → `paid`,
  and `last_activity_at` moves while `updated_at` doesn't.

**`list_leads` window + split**
- *Before:* 25-row page shows 18 rows; no change filter. *Desired:* full pages, `updated_from`, `include_archived`.
- **Chat:** "Which leads were edited or archived in the last 2 hours?"
- **Probe:** key with `leads` only → no client row, and page length = `limit` when enough rows exist; archive L1 → listed
  with `include_archived` and `updated_from`.

**`list_financial_movements`**
- *Before:* `status=overdue` misses a pending movement past due. *Desired:* derived overdue filter;
  `paid_from=yesterday&paid_to=yesterday` lists yesterday's payments; `updated_at` returned.
- **Chat:** "What was paid yesterday, and what fell overdue this week?"
- **Probe:** pending movement with `due_date` = 3 days ago → in `overdue`; set paid with `paid_date` = yesterday → in
  the `paid_from` window.

**Cross-lead timeline**
- *Before:* `lead_id` required. *Desired:* `from`/`to` without `lead_id`, scoped per row.
- **Chat:** "What calls, mails and stage changes were logged since 14:00?"
- **Probe:**
  - `log_communication` on L1 → `list_communications {from: now-1min}` includes it.
  - A leads-only key does not see an event on a client record.
  - The returned `timestamp` matches the PHP clock (not MySQL UTC).

**Time zones**
- *Before:* `get_project.updated_at` = naked UTC string on a UTC MySQL. *Desired:* ISO with the CRM offset, equal to
  `FROM_UNIXTIME` of the stored value.
- **Chat:** "When was project X last changed, in my local time?"
- **Probe:** reuse "updated_at is the same moment the database holds, whatever the MySQL time zone" for `get_project`,
  `get_invoice`, `get_lead`.

**Child bumps (after decision)**
- *Before:* adding a manager leaves the project "unchanged". *Desired:* it moves `updated_at`; re-sending the same
  managers does not.
- **Chat:** "Did anything about project X change today?"
- **Probe:** this needs a `sync.php` push, so it belongs in a backend test rather than the MCP probe. The MCP side
  (`create_milestone` if it is chosen to count) is probe-checkable.

**Business-date ranges**
- *Before:* "projects past deadline" needs a full scan. *Desired:* `bucket=overdue` on projects (open status group,
  `completion_deadline < today`).
- **Chat:** "Which active projects are past their deadline, and which are due in the next 14 days?"
- **Probe:** P1 deadline yesterday (open), P2 deadline yesterday (completed), P3 in 10 days → overdue = {P1},
  `deadline_from=today&deadline_to=today+14` = {P3}.

**Forecast overdue**
- *Before:* an unpaid movement due yesterday is in no forecast total. *Desired:* `overdue.total` includes it.
- **Chat:** "How much money is overdue, and what's expected over the next 3 months?"
- **Probe:** a fixture movement due yesterday, pending → `overdue.total` = its amount; `months` excludes it.

---

## 6. Pre-existing failures seen

**`npm run test:mcp`** (2026-11-10, dev containers `crm` + `ccrm-db-1`): `FAILED: 242 passed, 1 failed`.

```
FAIL  get_invoicing_metrics counts invoices only — {"currency":"EUR","offers_value":200038.34,"invoiced_value":27415.62,"offer_win_rate_percent":83,"offers_decided":6,"by_type_and_status":{"price_offer":{"approved":{"count":5,"total":135704.42},"sent"
```

This is the known failure caused by price offers in the cloned dev data. It is listed, not fixed. All 11
task change-tracking checks passed.

No other command was run: no `npm run check`, because no source changed, and no browser QA, per the prompt.
