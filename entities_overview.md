# CCRM Entities Overview

This file serves as a comprehensive reference of the CCRM database schema. When adding or modifying database tables, columns, or types (e.g., in `api/schema.php` or `sync.php`), update this document accordingly.

---

## 1. System & Authentication

### `users`
Stores user profile information and credentials.
* `id` VARCHAR(50) [PK]
* `email` VARCHAR(255) [UNIQUE]
* `password_hash` VARCHAR(255)
* `name` VARCHAR(100)
* `role` VARCHAR(50) (e.g., administrator, project manager, viewer)
* `color` VARCHAR(20)
* `avatar` VARCHAR(255)
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP

Fresh and demo installations seed SYSTEM_LANGUAGE, LEAD_STATES, LEAD_STATE_COLORS, and LEAD_STAGE_GROUPS together. Pipeline-stage labels use the language selected in the installer (en, sk, or hu).
* `metadata_json` LONGTEXT (e.g., user preferences, email connection status)

### `permissions`
Registry of available system action permissions.
* `id` VARCHAR(50) [PK]
* `name` VARCHAR(100)
* `description` TEXT
* `category` VARCHAR(50)
* `created_at` TIMESTAMP

### `role_permissions`
Maps permission levels to user roles.
* `role` VARCHAR(50)
* `permission_id` VARCHAR(50)
* `level` VARCHAR(20) (e.g., edit, view, none)
* Primary Key: (`role`, `permission_id`)

### `password_resets`
* `email` VARCHAR(255) [PK]
* `token` VARCHAR(255)
* `created_at` TIMESTAMP

### `password_reset_attempts`
* `ip` VARCHAR(45)
* `created_at` TIMESTAMP

### `user_remember_tokens`
One row per browser that ticked "Remember me" on the login screen. The `CCRM_REMEMBER` cookie holds `<selector>:<validator>`; the PHP session itself is an ordinary browser-session cookie and this token rebuilds it after the browser was closed. Created by `ccrm_apply_schema()` and, for endpoints that do not load it, lazily by `ccrm_remember_ensure_table()` in `api/auth.php`. All dates are database-clock values.
* `id` BIGINT UNSIGNED [PK, AUTO_INCREMENT]
* `user_id` VARCHAR(50) (the `users.id` it signs in; no foreign key. Rows are removed by `ccrm_remember_revoke_user()` on password change and user deletion, and a row whose user is gone is rejected on use)
* `selector` CHAR(24) [UNIQUE] (random lookup key, hex)
* `validator_hash` CHAR(64) (SHA-256 of the validator in the cookie; the validator itself is never stored)
* `prev_validator_hash` CHAR(64) [NULLable] (validator before the last rotation; still accepted for 60 s so parallel requests carrying the old cookie are not treated as theft)
* `rotated_at` DATETIME [NULLable] (last rotation; every restore rotates the validator)
* `created_at` DATETIME (a token older than `users.sessions_valid_from` is rejected)
* `expires_at` DATETIME (30 days, pushed forward on each rotation)
* `last_used_at` DATETIME [NULLable]
* `user_agent` VARCHAR(255) [NULLable] (display / audit only)
* Indexes: `selector` (unique), `user_id`, `expires_at`

---

## 2. Customer Relations Management (CRM)

### `leads`
Main table representing potential deals, customers, and client accounts.
* `id` VARCHAR(50) [PK]
* `name` VARCHAR(255) (e.g. client name, company name)
* `phone` VARCHAR(50)
* `email` VARCHAR(255)
* `city` VARCHAR(100)
* `status` VARCHAR(50) (e.g. new, contacted, offer sent, accepted, rejected)
* `source` VARCHAR(50) (e.g. showroom, website, referral)
* `owner` VARCHAR(100) (assigned project manager)
* `division` VARCHAR(100) (assigned business division, e.g. Cstudios, Cstudios Budapest)
* `rating` INT (1-5 star score)
* `value` DECIMAL(15, 2) (financial deal value)
* `notes` TEXT
* `client_type` VARCHAR(50) (e.g. person, business, partner)
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP
* `street` VARCHAR(255)
* `zip` VARCHAR(20)
* `ico` VARCHAR(50)
* `dic` VARCHAR(50)
* `ic_dph` VARCHAR(50)
* `archived` TINYINT
* `country` VARCHAR(100)
* `company_id` VARCHAR(50)
* `legal_form` VARCHAR(255)
* `sk_nace` VARCHAR(255)
* `organization_size` VARCHAR(100)
* `establishment_date` DATE
* `dissolution_date` DATE
* `region` VARCHAR(100)
* `district` VARCHAR(100)
* `data_source` VARCHAR(100)
* `ownership_type` VARCHAR(50)
* `ticket_allowed_emails` TEXT [NULLable] (JSON array of whitelisted sender emails/domains for support tickets)
* `client_id` VARCHAR(50) [NULLable, indexed] (the client record - a `client-*` row of this table - the lead belongs to; not a foreign key. NULL = not linked, the app then falls back to matching by name)
* `price_level_id` VARCHAR(50) [NULLable] (the price level - an `id` of the `PRICE_LEVELS` setting - this client buys on; NULL = the items' default sell prices)
* `contact_person` VARCHAR(100)
* `contact_first_name` VARCHAR(100) [NULLable] (the contact person's first name as typed; synced as `contactFirstName`. `{{first_name}}` of the newsletter reads this, never `contact_person`. Rule shared by `composeContactName()` and `ccrm_compose_contact_name()`: when either part is filled, `contact_person` = first + ' ' + last; both empty keeps `contact_person`. Rows that predate the column were split once by `ccrm_backfill_contact_names()`, flag `CONTACT_NAME_BACKFILL` in `system_settings`)
* `contact_last_name` VARCHAR(100) [NULLable] (the contact person's last name as typed; synced as `contactLastName`)
  * **For `client_type = 'person'` both columns are the person's OWN first and last name** ("Name for greetings", `{{first_name}}`); `name` is not recomposed and `contact_person` is not composed from them (normally empty). Existing person records with an empty `contact_person` were split from `name` once by `ccrm_backfill_person_names()`, flag `PERSON_NAME_BACKFILL` in `system_settings`

### `client_adjustment_migration`
Written only by `php kprnq adjustment-clients --apply` (created on first use, not by the schema). One row per client row that command created from an adjustment-only client; `--undo` reads it to put the adjustment back.
* `client_id` VARCHAR(50) [PK] (the `client-adj-*` row created in `leads`)
* `name` VARCHAR(150)
* `adjustment` DECIMAL(14,2) (the amount that was moved onto the client row)
* `moved_from` TEXT (JSON: lead ids the adjustment was taken from)
* `linked_ids` TEXT (JSON: lead ids given this `client_id`)
* `migrated_at` DATETIME

### `lead_categories`
Junction table mapping leads to business categories.
* `lead_id` VARCHAR(50)
* `category` VARCHAR(100) (e.g., Kitchen Countertops, Flooring Tiles)
* Primary Key: (`lead_id`, `category`)

### `timeline_events`
Interaction history logged against leads (emails, call logs, meetings).
* `id` VARCHAR(50) [PK]
* `lead_id` VARCHAR(50)
* `type` VARCHAR(50) (e.g., note, phone, email, offer, appointment, status_change, whatsapp)
* `timestamp` DATETIME
* `title` VARCHAR(255)
* `content` TEXT
* `author` VARCHAR(100) (CRM user whose action produced the entry; NULL for entries nobody triggered here — incoming mail, public-form inquiries, imports — and for rows written before the column existed)
* `external_url` VARCHAR(255) [NULLable] (deep link path into the external system, e.g. /c/<id>?m=<id>)
* `created_at` TIMESTAMP

---

## 3. Tasks & Team Management

Mail the background job filed (api/mail_filing.php) and the live read share these columns on `type = 'email'` rows:
* `mail_account` VARCHAR(150) [NULLable] (label of the mailbox the message was read from, e.g. `Info`)
* `mail_owner` VARCHAR(255) [NULLable] (login e-mail of the user whose personal mailbox it is; NULL for a company mailbox)
* `mail_has_body` TINYINT(1) (a readable body is stored in `filed_mail_bodies`)
* `mail_message_id` VARCHAR(255) [NULLable] (RFC 5322 Message-ID, so one mail in two mailboxes is filed once; indexed with `lead_id` as `idx_te_mail_msgid`)

### `tasks`
General system and operational tasks.
* `id` VARCHAR(50) [PK]
* `title` VARCHAR(255)
* `description` TEXT
* `status` VARCHAR(50) (e.g., todo, in_progress, blocked, done)
* `priority` VARCHAR(20) (low, medium, high)
* `start_date` DATE
* `deadline` DATE
* `deadline_time` VARCHAR(5) (HH:MM)
* `original_deadline` DATE [NULLable] (the deadline the task was first given; set on creation, or pinned to the previous date at the first postponement of an older row; written only by the sync upsert, never by a client)
* `deadline_moves` INT NOT NULL DEFAULT 0 (how many times the deadline was pushed to a later date; incremented by the sync upsert)
* `owner` VARCHAR(100) (primary assignee; empty when unassigned)
* `created_by` VARCHAR(100) (immutable creator name; nullable for legacy rows)
* `related_lead_id` VARCHAR(50)
* `is_locking` TINYINT(1)
* `archived` TINYINT(1)
* `external_source` VARCHAR(20) [NULLable] (integration client code that pushed the task, e.g. waai; server-only, never written by a client save)
* `external_url` VARCHAR(255) [NULLable] (path of the source chat in that system, e.g. /c/<id>)
* `external_meta_json` TEXT [NULLable] (chat title, WhatsApp assignee label, `due_inferred` + `inferred_deadline` when the chat gave no date)
* `task_kind` VARCHAR(20) [NULLable] (`NULL` = normal task, `'recurring'` = series template; indexed as `idx_task_kind`)
* `recurrence_json` TEXT [NULLable] (Template only: `{mode, frequency, interval, config, weekendRule, leadDays, startsOn, endsOn, paused, lastOccurrence, lastOccurrenceId}`)
* `recurring_source_id` VARCHAR(50) [NULLable] (Occurrence only: template id; indexed as `idx_task_recurring_source`)
* `recurring_occurrence_date` DATE [NULLable] (Occurrence only: the unshifted scheduled date; `(recurring_source_id, recurring_occurrence_date)` unique)
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP(3) (indexed as `idx_task_updated`; the machine API's feed pages by it)

### `task_assignees`
Junction table mapping users to tasks.
* `task_id` VARCHAR(50)
* `user_name` VARCHAR(100)
* Primary Key: (`task_id`, `user_name`)
* `task_id` references `tasks.id` with cascading deletion.

---

## 4. Meetings & Notes

### `meeting_notes`
Agendas, records, and AI-summaries of voice calls or in-person meetings.
* `id` VARCHAR(50) [PK]
* `title` VARCHAR(255)
* `date` DATE
* `lead_id` VARCHAR(50)
* `lead_name` VARCHAR(255)
* `duration` INT (in minutes)
* `notes` TEXT
* `attached_leads_json` TEXT
* `attached_clients_json` TEXT
* `attached_users_json` TEXT
* `archived` TINYINT
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP

### `meeting_tasks`
Action items generated from meetings.
* `id` VARCHAR(50) [PK]
* `meeting_id` VARCHAR(50)
* `title` VARCHAR(255)
* `description` TEXT
* `due_date` DATE
* `status` VARCHAR(50)
* `priority` VARCHAR(20)
* `assigned_user` VARCHAR(255)
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP

Link to the real task: assigning a suggestion creates a `tasks` row with id `task-mt-<meeting_tasks.id>`
(`src/utils/meetingSuggestions.ts`). The "Created" badge checks that this task exists; `assigned_user` alone
does not mean a task was created. Suggestions converted before this convention (`task-ai-<timestamp>` ids) are
matched on title and assignee.

---

## 5. Communications & Email Cache

### `rag_emails`
Cached copies of synchronised email threads.
* `user_email` VARCHAR(255)
* `folder` VARCHAR(50) (e.g. INBOX, SENT)
* `email_uid` INT
* `subject` VARCHAR(255)
* `sender` VARCHAR(255)
* `recipient` VARCHAR(255)
* `body` LONGTEXT
* `received_at` DATETIME
* Primary Key: (`user_email`, `folder`, `email_uid`)

### `email_summaries`
AI-generated summaries of email threads.
* `user_email` VARCHAR(255)
* `folder` VARCHAR(50)
* `email_uid` INT
* `summary` TEXT
* `created_at` TIMESTAMP
* Primary Key: (`user_email`, `folder`, `email_uid`)

---

### `company_mailboxes`
Shared IMAP / SMTP mailboxes an admin defines (Settings → E-mail → Company mailboxes), read by the background job.
* `id` VARCHAR(50) [PK] (`cmb-…`)
* `name` VARCHAR(150), `address` VARCHAR(255) [UNIQUE]
* `settings_json` MEDIUMTEXT (the IMAP / SMTP profile in the shape of a user's `emailSettings`; `imapPassword` / `smtpPassword` encrypted `enc:v1:`; never sent to the browser)
* `is_active` TINYINT(1), `owner_user_id` VARCHAR(50) [NULLable] (optional person it belongs to)
* `backfill_since` DATE [NULLable] (mail older than this is not filed; NULL = everything)
* `last_run_at`, `last_success_at` DATETIME [NULLable], `last_error` TEXT [NULLable] (what an admin sees when a mailbox cannot be read)
* `created_at`, `updated_at` TIMESTAMP

### `mail_sync_state`
Where the filing job stopped, per mailbox and folder, so a run is incremental.
* `mailbox_key` VARCHAR(100) + `folder` VARCHAR(190) [PK] (`c:<company mailbox id>` or `u:<user id>`)
* `uid_validity` BIGINT [NULLable] (a changed value means the server renumbered the folder: the state is reset)
* `last_uid` BIGINT (high-water mark: everything above it is new)
* `backfill_upper_uid` BIGINT [NULLable], `backfill_done` TINYINT(1) (the newest-first catch-up of mail that was already there; the next chunk is everything below the first)
* `filed_count` INT, `last_run_at` DATETIME, `last_error` TEXT [NULLable]

### `filed_mail_bodies`
The readable plain-text body of a filed message, apart from `timeline_events` because the sync reads that whole table on every load. Read on demand through `mail_broker.php?action=get_filed_mail` by anyone who may see e-mail on a timeline.
* `event_id` VARCHAR(50) [PK] (= `timeline_events.id`)
* `body` MEDIUMTEXT, `attachments_json` TEXT (JSON list `[{ name, size, part, key? }]`; `key` is the random storage name of the file kept under `uploads/private/mail/` (behind a deny-all guard, streamed by `mail_broker.php?action=get_filed_mail_attachment` after the e-mail permission check). An entry without `key` was not kept: too big, a blocked type, an embedded image. The client never receives `key`)
* `created_at` TIMESTAMP

## 6. Projects & Lifecycles

### `project_types`
Common blueprints / templates defining dynamic attributes and configurations.
* `id` VARCHAR(50) [PK]
* `name` VARCHAR(100)
* `description` TEXT
* `icon` VARCHAR(50)
* `color` VARCHAR(20)
* `attributes_json` LONGTEXT (metadata for custom project fields)
* `has_timeline` TINYINT
* `has_gantt` TINYINT
* `has_tickets` TINYINT(1) (Enables Tickets & Support Widget for projects of this type)
* `timeline_event_types_json` LONGTEXT
* `timeline_attributes_json` LONGTEXT
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP

### `projects`
Individual instances of active project lifecycles.
* `id` VARCHAR(50) [PK]
* `project_type_id` VARCHAR(50) (FK to `project_types.id`, **ON DELETE RESTRICT**: a type that still has projects, archived ones included, cannot be deleted. `sync.php` refuses such a delete and reports it in `deleteBlocked.project_types`; installs created with the old CASCADE rule are converted by `ccrm_migrate_project_type_fk_restrict()`)
* `lead_id` VARCHAR(50)
* `client_id` VARCHAR(50)
* `division` VARCHAR(100) (assigned business division)
* `status` VARCHAR(50) (active, completed, archived)
* `ticket_widget_enabled` TINYINT(1)
* `ticket_allowed_domains` TEXT [NULLable] (JSON array of whitelisted hostnames)
* `ticket_allowed_emails` TEXT [NULLable] (JSON array of whitelisted sender emails/domains)
* `ticket_public_hash` VARCHAR(64) [UNIQUE] (Random token for public `#public-tickets/<hash>` status page)
* `ticket_widget_config_json` TEXT [NULLable] (JSON config for floating widget color, position, greeting, language)
* `contact_phone` VARCHAR(50) [NULLable] (phone of the project contact as typed; WAAI pairs WhatsApp chats to the project by it; written by the app's save only when the payload carries `contactPhone`)
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP [INDEX `idx_project_updated`, for the machine API's directory paging]

### `project_managers`
Junction table mapping project managers to projects.
* `project_id` VARCHAR(50)
* `user_id` VARCHAR(50)
* Primary Key: (`project_id`, `user_id`)

### Dynamic Tables (Per Project Type)
Each custom project type with ID `{safeId}` generates three tables:
1. `proj_data_{safeId}`: Stores values for custom attributes (`attr_{attributeId}`). Columns are only ever added: removing an attribute or file slot from the type keeps its column and the values in it (they are just no longer shown), the same for timeline attribute columns in `proj_timeline_{safeId}`. The three tables are dropped only when their type is deleted, which requires the type to have no projects.
2. `proj_timeline_{safeId}`: Chronological notes/events relating to the project.
3. `proj_gantt_{safeId}`: Tasks and dates for Gantt rendering (`id`, `project_id`, `title`, `contact_id`, `start_date`, `end_date`, `progress`).

---

## 7. Storage, Integrations, and Diagnostics

### `unified_entries`
Metadata registry for custom file/folder structures.
* `id` VARCHAR(50) [PK]
* `name` VARCHAR(100)
* `entry_name` VARCHAR(100)
* `folder_name` VARCHAR(100)
* `icon` VARCHAR(50)
* `color` VARCHAR(20)
* `created_at` TIMESTAMP

### `custom_dashboards`
Saved AI-generated dashboard configurations.
* `id` VARCHAR(50) [PK]
* `name` VARCHAR(100)
* `icon` VARCHAR(50)
* `color` VARCHAR(20)
* `prompt` TEXT
* `layout_json` LONGTEXT
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP

### `system_settings`
Global system configurations.
* `key` VARCHAR(100) [PK] (e.g. INTEGRATIONS_CONFIG, SYSTEM_NAME, SYSTEM_LANGUAGE, NEWSLETTER_CONFIG: see section 12)
* `value` LONGTEXT
* `updated_at` TIMESTAMP

### `plugins`
Installed feature extensions.
* `id` VARCHAR(50) [PK]
* `name` VARCHAR(100)
* `version` VARCHAR(20)
* `enabled` TINYINT
* `config_json` TEXT
* `created_at` TIMESTAMP

### `error_logs`
System-wide error and diagnostic logging.
* `id` BIGINT AUTO_INCREMENT [PK]
* `message` TEXT
* `file` VARCHAR(255)
* `line` INT
* `trace` LONGTEXT
* `request_uri` VARCHAR(255)
* `request_method` VARCHAR(10)
* `payload` LONGTEXT
* `created_at` TIMESTAMP

### `audit_log`
Security and privilege tracking log.
* `id` BIGINT AUTO_INCREMENT [PK]
* `actor_id` VARCHAR(50)
* `actor_email` VARCHAR(255)
* `action` VARCHAR(100)
* `detail` TEXT
* `created_at` TIMESTAMP

### `integration_clients`
One external system allowed to use the machine API (`/api/v1`, today only `waai`). JSON-valued columns are TEXT holding JSON.
* `id` VARCHAR(50) [PK]
* `code` VARCHAR(50) [UNIQUE] (e.g. waai)
* `name` VARCHAR(100)
* `is_active` TINYINT(1)
* `scopes` TEXT (JSON list: users:read, directory:read, tasks:push, tasks:pull, whatsapp:links, timeline:push)
* `allowed_ips` TEXT (JSON list of addresses / CIDR blocks; empty = any)
* `require_direct` TINYINT(1) (refuse requests that went through a proxy)
* `owner_user_ids` TEXT (JSON list of user ids: who `owner_id` may name, and whose tasks the feed returns)
* `feed_scope` ENUM('owners','all')
* `embed_url` VARCHAR(255) [NULLable] (origin of the embedded WhatsApp view)
* `sso_secret` VARCHAR(255) [NULLable] (encrypted)
* `default_deadline_days` INT (deadline given to a pushed task whose chat stated none)
* `settings_json` TEXT [NULLable]
* `created_at`, `updated_at` TIMESTAMP

### `integration_tokens`
API tokens; only the sha256 is stored, the plaintext is shown once. Several per client so a rotation can overlap.
* `id` VARCHAR(50) [PK]
* `client_id` VARCHAR(50) (references `integration_clients.id`, cascading deletion)
* `prefix` VARCHAR(12) [UNIQUE]
* `token_hash` CHAR(64)
* `expires_at`, `revoked_at`, `last_used_at` DATETIME [NULLable]
* `last_used_ip` VARCHAR(45) [NULLable]
* `created_at` TIMESTAMP

### `integration_refs`
External id ↔ local row, plus the values last applied from the external system (three-way merge).
* `id` BIGINT AUTO_INCREMENT [PK]
* `client_id` VARCHAR(50) (references `integration_clients.id`, cascading deletion)
* `kind` ENUM('task','timeline')
* `external_id` VARCHAR(64)
* `local_id` VARCHAR(50) [NULLable] (the `tasks.id`; no foreign key: a ref whose row is gone means "deleted in CCRM")
* `revision` BIGINT (the sender's revision; an older one is ignored)
* `applied_snapshot` TEXT [NULLable] (JSON)
* `created_at`, `updated_at` TIMESTAMP
* Unique: (`client_id`, `kind`, `external_id`)

### `integration_rate`
Per-token request counter, one row per minute.
* `token_prefix` VARCHAR(12), `window_start` INT [PK together]
* `hits` INT

### `whatsapp_links`
Chats WAAI has paired with a client/lead or a project. Written only by `PUT/DELETE /api/v1/whatsapp/links/{ref}`, never by `sync.php`; returned by the sync GET to users with the `whatsapp` permission.
* `id` BIGINT AUTO_INCREMENT [PK]
* `client_id` VARCHAR(50) (references `integration_clients.id`, cascading deletion)
* `conversation_ref` VARCHAR(64) (WAAI's conversation id)
* `entity_type` ENUM('lead','project'), `entity_id` VARCHAR(50) (no foreign key: a deleted record must not be blocked by a link)
* `link_source` ENUM('auto','manual')
* `title` VARCHAR(255), `is_group` TINYINT(1), `phone_digits` VARCHAR(20) [NULLable], `owner_user_id` VARCHAR(50) [NULLable] (the CCRM user who owns the WhatsApp account)
* `path` VARCHAR(255) (`/c/<id>`), `last_message_at` DATETIME [NULLable], `updated_at` TIMESTAMP(3)
* Unique: (`conversation_ref`, `entity_type`, `entity_id`); index (`entity_type`, `entity_id`)

### `whatsapp_numbers`
WAAI's answers to "is this number on WhatsApp?" (checked on click only).
* `phone_digits` VARCHAR(20) [PK]
* `status` ENUM('registered','not_registered'), `checked_at` DATETIME, `updated_at` TIMESTAMP(3)

---

## 8. Warehouse & Inventory Management

### `warehouses`
Multi-warehouse storage locations and branches.
* `id` VARCHAR(50) [PK]
* `name` VARCHAR(150) (e.g. Hlavný sklad Bratislava)
* `code` VARCHAR(50) [UNIQUE] (e.g. WH-BA-01)
* `address` VARCHAR(255)
* `manager_user_id` VARCHAR(50)
* `is_default` TINYINT(1)
* `created_at` TIMESTAMP

### `suppliers`
B2B material and goods suppliers with invoicing data.
* `id` VARCHAR(50) [PK]
* `name` VARCHAR(255)
* `company_id` VARCHAR(50) (IČO)
* `tax_id` VARCHAR(50) (DIČ)
* `vat_id` VARCHAR(50) (IČ DPH)
* `street` VARCHAR(255)
* `city` VARCHAR(100)
* `postal_code` VARCHAR(20)
* `country` VARCHAR(100)
* `email` VARCHAR(150)
* `phone` VARCHAR(50)
* `website` VARCHAR(255)
* `iban` VARCHAR(50)
* `swift` VARCHAR(20)
* `payment_due_days` INT
* `notes` TEXT
* `contacts_json` TEXT (Array of contact persons: name, phone, email, position)
* `created_at` TIMESTAMP

### `warehouse_items`
Master catalog of goods, products, raw materials, and supplies.
* `id` VARCHAR(50) [PK]
* `sku` VARCHAR(100) [UNIQUE]
* `barcode` VARCHAR(100) (EAN/QR)
* `name` VARCHAR(255)
* `description` TEXT
* `category` VARCHAR(100)
* `unit` VARCHAR(20) (ks, m², bm, m³, kg, l, balenie)
* `min_stock` DECIMAL(12,2)
* `optimal_stock` DECIMAL(12,2)
* `default_location` VARCHAR(100) (Rack/Shelf/Position)
* `has_expiration` TINYINT(1) (Enables batch & lot tracking)
* `image_url` VARCHAR(500)
* `default_sell_price` DECIMAL(12,2)
* `avg_purchase_price` DECIMAL(12,4) (Weighted average purchase price - WAP)
* `last_purchase_price` DECIMAL(12,2)
* `vat_rate` DECIMAL(5,2) [NULLable] (VAT of this item in percent; NULL = use the company default from the billing settings. Prefilled on offer, order and invoice lines, still editable per line)
* `pack_quantity` DECIMAL(15,4) [NULLable] (Units of `unit` in one package, e.g. 1.44 m²) and `pack_unit` VARCHAR(30) [NULLable] (package label, e.g. `bal`)
* `external_source` VARCHAR(50) + `external_id` VARCHAR(100) [NULLable] (The record in an outside system, e.g. `mrp` / `39`. UNIQUE together as `uq_item_external`, so a lookup is one index probe and two items never claim one external record; several items may have neither. Read-only in the UI: what an ERP / MRP sync or an import upserts by)
* `alt_codes_json` TEXT [NULLable] (JSON list of codes beside the SKU: supplier code, manufacturer code. Searched wherever items are searched: warehouse list, item pickers, universal search, MCP)
* `weight_kg` DECIMAL(12,3) [NULLable]
* `created_at` TIMESTAMP

### `warehouse_item_prices`
One price per item and price level; `warehouse_items.default_sell_price` stays the base / fallback. A zero or missing price means "not set".
* `item_id` VARCHAR(50) [PK part, FK to `warehouse_items.id`, ON DELETE CASCADE]
* `price_level_id` VARCHAR(50) [PK part] (An `id` of the `PRICE_LEVELS` setting)
* `price` DECIMAL(15,4)

The `PRICE_LEVELS` setting (in `system_settings`, edited in Settings → Invoicing → Price levels) is a JSON list of `{id, name}` in display order, normalized by `ccrm_normalize_price_levels()` (PHP) and `normalizePriceLevels()` (`src/utils/priceLevels.ts`). `leads.price_level_id` VARCHAR(50) [NULLable] is the level a client buys on; picking an item for that client uses the level's price and falls back to `default_sell_price` (`resolveSellPrice()`, `ccrm_resolve_sell_price()`).

### `warehouse_stock`
Current inventory balances partitioned per warehouse location.
* `warehouse_id` VARCHAR(50)
* `item_id` VARCHAR(50)
* `quantity` DECIMAL(12,2) (Physical stock on hand)
* `reserved_quantity` DECIMAL(12,2) (Reserved for active client deals)
* `location` VARCHAR(100)
* Primary Key: (`warehouse_id`, `item_id`)

### `warehouse_batches`
Lot and expiration date tracking for perishable or batch-controlled goods.
* `id` VARCHAR(50) [PK]
* `item_id` VARCHAR(50)
* `warehouse_id` VARCHAR(50)
* `batch_number` VARCHAR(100)
* `expiration_date` DATE
* `initial_quantity` DECIMAL(12,2)
* `current_quantity` DECIMAL(12,2)
* `purchase_price` DECIMAL(12,2)
* `created_at` TIMESTAMP

### `warehouse_movements`
Stock transaction documents (Receipts, Issues, Transfers, Adjustments).
* `id` VARCHAR(50) [PK]
* `document_number` VARCHAR(100) [UNIQUE] (e.g. PRI-2026-0001, VYD-2026-0001)
* `type` ENUM('inward', 'outward', 'transfer', 'adjustment')
* `status` ENUM('draft', 'confirmed', 'cancelled')
* `warehouse_id` VARCHAR(50)
* `target_warehouse_id` VARCHAR(50) (Used for transfers)
* `supplier_id` VARCHAR(50) (Used for inward receipts)
* `lead_id` VARCHAR(50) (Used for outward client issues)
* `total_cost_value` DECIMAL(15,2)
* `total_sell_value` DECIMAL(15,2)
* `total_profit_value` DECIMAL(15,2)
* `created_by` VARCHAR(100) (Author CRM user)
* `note` TEXT
* `file_name` VARCHAR(255)
* `file_path` VARCHAR(500)
* `issued_at` DATETIME
* `created_at` TIMESTAMP

### `warehouse_movement_items`
Individual line items attached to a movement document.
* `id` VARCHAR(50) [PK]
* `movement_id` VARCHAR(50)
* `item_id` VARCHAR(50)
* `batch_id` VARCHAR(50)
* `quantity` DECIMAL(12,2)
* `unit_purchase_price` DECIMAL(12,2)
* `unit_sell_price` DECIMAL(12,2)
* `total_price` DECIMAL(15,2)
* `expiration_date` DATE
* `note` VARCHAR(255)

---

## 9. Financial Management & Invoicing

### `financial_categories`
3-level hierarchical category tree tracking income and expense classifications separately.
* `id` VARCHAR(50) [PK] (e.g. `fc-inc-sales`, `fc-exp-cogs`)
* `type` ENUM('income', 'expense')
* `name` VARCHAR(150) (e.g. Laminam Ceramic Slabs, Marketing, Online Ads)
* `parent_id` VARCHAR(50) [NULLable FK to `financial_categories.id`]
* `level` INT (1 = Root/Main category, 2 = Subcategory, 3 = Sub-subcategory)
* `color` VARCHAR(30) (Hex code for UI badges)
* `icon` VARCHAR(50) (Lucide icon name)
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP

### `offer_categories`
3-level price-offer category tree: the same shape as the customer category tree (`client_categories`) without a type split, kept as its own list so offers are filed independently of the finance and customer trees. Synced as `offerCategories`, gated by the `invoices` permission. Edited in Settings → Offers & invoicing → Offer categories; an offer carries one in `invoices_offers.category_id`.
* `id` VARCHAR(50) [PK] (e.g. `oc-1731000000000-ab3de`)
* `name` VARCHAR(150)
* `parent_id` VARCHAR(50) [NULLable, `offer_categories.id` of the parent; NULL = main category. Not a foreign key]
* `level` INT (1 = Root/Main category, 2 = Subcategory, 3 = Sub-subcategory)
* `sort_order` INT (Position among the siblings under the same parent, lowest first; set by drag & drop)
* `color` VARCHAR(30) [NULLable] (Hex code; a subcategory without one inherits its parent's)
* `icon` VARCHAR(50) [NULLable] (Lucide icon name)
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP

### `financial_records`
Core financial movement records representing current and planned/future incomes, invoices, and expenses (single and recurring).
* `id` VARCHAR(50) [PK] (e.g. `fr-2026-0001`)
* `type` ENUM('income', 'expense')
* `subtype` VARCHAR(50) (e.g. `invoice`, `expense`, `tax`, `salary`, `material`, `overhead`)
* `title` VARCHAR(255)
* `description` TEXT
* `category_id` VARCHAR(50) (References `financial_categories.id`)
* `category_path` VARCHAR(255) (Pre-calculated breadcrumb path for quick filtering)
* `amount_planned` DECIMAL(15,2) (Planned / budgeted amount)
* `amount_real` DECIMAL(15,2) (Actual / realized transaction amount)
* `currency` VARCHAR(10) (Default `EUR`)
* `status` ENUM('planned', 'pending', 'paid', 'partially_paid', 'overdue', 'cancelled')
* `issue_date` DATE (Date invoice issued or expense scheduled)
* `due_date` DATE (Settlement due date)
* `paid_date` DATE (Date funds cleared)
* `payment_method` VARCHAR(50) (e.g. bank_transfer, card, cash, credit)
* `is_recurring` TINYINT(1) (1 = Recurring rule active, 0 = Single transaction)
* `recurring_frequency` ENUM('weekly', 'monthly', 'yearly')
* `recurring_config_json` TEXT (Recurrence rule configuration: `dayOfWeek`, `dayOfMonth`, `weekOfMonth`, `month`, optional `interval` — every N weeks/months/years, counted from `recurring_start_date`)
* `recurring_start_date` DATE
* `recurring_end_date` DATE
* `recurring_planned_end_date` DATE [NULLable] (The end date a paused rule really has, restored on resume; a pause stamps `recurring_end_date` with today)
* `recurring_amount_history_json` TEXT [NULLable] (Superseded amounts of a recurring rule: `[{until, amountPlanned, amountReal}]`)
* `recurring_skipped_dates_json` TEXT [NULLable] (Scheduled days a stored movement stands in for, as a JSON list of `YYYY-MM-DD` days)
* `recurring_source_id` VARCHAR(50) [NULLable] (On a one-off movement: the recurring rule whose charge it replaces or stores; materialized charges have the id `fr-rec-<rule>-<day>`)
* `recurring_occurrence_date` DATE [NULLable] (On a one-off movement: the scheduled day it stands in for)
* `recurring_materialized_through` DATE [NULLable] (On a recurring rule: every charge on or before this day is a stored movement or deliberately absent (deleted, or a paused day). Advanced to today by the client materializer (`src/utils/recurringRuleDeletion.ts`) on every run; schedule readers (`recurringCharges`, `mcp_rec_charges`) draw only after it, so a schedule edit or a resume changes only the future. Never moves back: `sync.php` keeps the greater of the stored and incoming value. NULL until the first run.)
* `project_id` VARCHAR(50) [NULLable, links to `projects.id`; NULL means Global company-wide record]
* `client_id` VARCHAR(50) [NULLable, links to `leads.id` / client; NULL means Global company-wide record]
* `invoice_number` VARCHAR(100) (e.g. `FA-2026-0001`)
* `tax_rate` DECIMAL(5,2) (VAT rate, default 20.00)
* `attachments_json` TEXT (JSON list of receipt/invoice file attachments)
* `created_by` VARCHAR(100) (Author user)
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP

### `invoices_offers`
Price offers, proformas and invoices in one table (`type`), with their line items in `invoice_offer_items`. Only the columns that carry rules are listed here; see `api/schema.php` for the rest.
* `id` VARCHAR(50) [PK]
* `document_number` VARCHAR(100) (e.g. `CP-2026-001` for an offer, `FA-2026-001` for an invoice)
* `type` ENUM('price_offer', 'proforma', 'invoice')
* `status` VARCHAR(50) (was an ENUM until 1.12.70). For a **price offer** it is a key of the configurable `OFFER_STATUSES` setting (Price offers → Settings → Offer statuses); code reasons about the status's *group* (`draft`, `open`, `won`, `lost`, `cancelled`), never the key. Proformas and invoices keep the fixed built-ins `draft`, `sent`, `approved`, `rejected`, `invoiced`, `cancelled`. An unknown key must still render (raw, neutral badge).
* `status_changed_at` DATE [NULLable] (Day the status last changed, client-stamped)
* `category_id` VARCHAR(50) [NULLable] (References `offer_categories.id`; the category a price offer is filed under, NULL = none. Not a foreign key: deleting a category (with its subtree) makes the app set `category_id` to NULL on its offers and push them alongside. A client that sends no `categoryId` leaves the stored value untouched)

The `OFFER_STATUSES` setting (in `system_settings`) is a JSON list of `{key, label?, color, group, legacy?}`, normalized by `ccrm_normalize_offer_statuses()` (PHP) and `normalizeOfferStatusDefs()` (`src/utils/offerStatuses.ts`). Unset means the six built-ins; `invoiced` is built in as a `legacy` status (won, kept for offers that carry it, not offered in a picker).

---

## 10. Human Resources & Employees

### `employees`
Staff profiles, compensation baseline, Toggl Track integration mapping, and employment contracts/documents.
* `id` VARCHAR(50) [PK] (e.g. `emp-1727650000000-abcd`)
* `name` VARCHAR(150) (Display name every other module reads: `first_name` + `last_name` for a person, the single company / item name for a contractor or ledger item. Derived on save by `ccrm_compose_employee_name()`)
* `first_name` VARCHAR(100) [NULLable] (Person's first name; titles such as `Ing.` may stay with it. NULL on a legacy record still named by a nickname. On a `contractor` it is the optional contact person, a sole trader's own name)
* `last_name` VARCHAR(100) [NULLable] (Person's surname; the contact person's on a `contractor`)
* `kind` VARCHAR(20) (Default `employee`: `employee` = a person on the payroll, `contractor` = an external supplier, a company or a sole trader (živnostník), `ledger` = a payroll-only accounting line such as commission. A `ledger` row has no first / last name)
* `company_id` VARCHAR(32) [NULLable] (IČO of a `contractor`, filled from the Slovak / Czech business register; NULL for the other kinds)
* `tax_id` VARCHAR(32) [NULLable] (DIČ of a `contractor`)
* `vat_id` VARCHAR(32) [NULLable] (IČ DPH of a `contractor`)
* `position` VARCHAR(100) [NULLable] (Job title, free text with suggestions: programmer, designer, PPC specialist... Not the app permission role, which lives on the linked `users.role`)
* `department` VARCHAR(100) [NULLable] (Department / team, free text with suggestions: Development, Marketing, Management, Sales)
* `pin` VARCHAR(50) [NULLable] (Personal identification number / Rodné číslo / Tax ID)
* `email` VARCHAR(150) [NULLable]
* `phone` VARCHAR(50) [NULLable]
* `address_street` VARCHAR(255) [NULLable]
* `address_city` VARCHAR(100) [NULLable]
* `address_zip` VARCHAR(20) [NULLable]
* `address_country` VARCHAR(100) (Default `Slovakia`)
* `salary_type` ENUM('monthly', 'daily', 'hourly') (Default `monthly`)
* `salary_amount` DECIMAL(12, 2) (Base compensation rate)
* `salary_due_day` INT [NULLable] (Individual payout day of month 1-31 or week 1-7; defaults to global setting if NULL)
* `vacation_allowances_json` TEXT [NULLable] (JSON map of allowance days per vacation type, e.g. `{"annual":25,"sick":10,"doctor":7}`)
* `time_tracking_provider` VARCHAR(50) (Default `toggl`)
* `time_tracking_user_id` VARCHAR(100) [NULLable] (Toggl user ID)
* `time_tracking_user_name` VARCHAR(150) [NULLable] (Toggl user name / email for display)
* `auto_expense` TINYINT(1) (1 = Automatically create/link record in `financial_records`, 0 = Disabled)
* `expense_category_id` VARCHAR(50) [NULLable] (Target expense category in `financial_categories`)
* `files_json` LONGTEXT [NULLable] (JSON array of employee attachments/contracts `[{ id, name, url, size, uploadedAt }]` stored under `/uploads/employees/`)
* `is_active` TINYINT(1) (1 = Active staff, 0 = Inactive / Archived)
* `notes` TEXT [NULLable]
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP

### `employee_salaries`
Periodic payroll statements (monthly or weekly) tracking multi-category salary breakdowns, payments, and financial expense linkage.
* `id` VARCHAR(50) [PK] (e.g. `sal-1727650000000-efgh`)
* `employee_id` VARCHAR(50) (References `employees.id`)
* `period_type` ENUM('monthly', 'weekly') (Default `monthly`)
* `period_key` VARCHAR(20) (Period key, always built from `year` and `period_number`: `2026-09` or `2026-W39`. `UNIQUE (employee_id, period_key)`. Keys without a year (`M05`, written by the profile drawer before 1.13) are rekeyed by `ccrm_migrate_salary_period_keys()` and normalised by `sync.php` on write; when two records hold one month the one with more paid out (then the newer edit) is kept and the other is written to `audit_log` in full. Helpers: `api/payroll_lib.php`, `src/utils/salaryPeriod.ts`)
* `year` INT
* `period_number` INT (Month 1-12 or Week 1-53)
* `items_json` TEXT (JSON array of category line items `[{ categoryId, categoryName, salary, paid }]`)
* `total_salary` DECIMAL(12, 2) (Total gross compensation for the period; on an employee's record this is Hrubá mzda = Základná mzda (the `base` item) + Iné (every other item))
* `total_paid` DECIMAL(12, 2) (Total amount paid out so far. Status and the auto-expense measure it against `labor_cost` when filled in, otherwise against `total_salary`; on an employee's record it is one amount for the month, the item rows carry no paid value)
* `labor_cost` DECIMAL(12, 2) [NULLable] (Cena práce from the month's payslip, typed in by hand; employees only, NULL for contractors and ledger lines. When set, it is the auto-expense's planned amount instead of `total_salary`)
* `net_pay` DECIMAL(12, 2) [NULLable] (Na výplatu from the payslip, typed in by hand; employees only. Not stored, computed in the UI: Odvody zamestnávateľa = `labor_cost − total_salary`, Odvody a daň zamestnanca = `total_salary − net_pay`)
* `status` ENUM('pending', 'partially_paid', 'paid') (Mapped to `financial_records.status`: pending = planned, paid = paid, partially_paid = partially_paid. Re-derived on every save from `total_paid` vs `ccrm_salary_due()`, so it is the live state, not the close; the time-entry lock reads `closed_at`)
* `due_date` DATE [NULLable] (Calculated salary due date based on period and salaryDueDay)
* `payment_date` DATE [NULLable] (Date of actual payment settlement)
* `payment_method` VARCHAR(50) (Default `bank_transfer`)
* `financial_record_id` VARCHAR(50) [NULLable] (Linked `financial_records.id` for automatic expense tracking. The `fr-sal-*` expense takes its amounts, status and dates from this row on every save; its title, description and category are set when it is created only)
* `note` TEXT [NULLable]
* `closed_at` DATETIME [NULLable] (The month was closed: stamped server-side (`sync.php`, MCP `record_salary_payout`) the first time the status becomes `paid`; kept when a later edit makes it partially paid again. Locks the month's time entries (`time_entries.php` `ccrm_te_paid_keys`, `src/utils/timeLock.ts`). Cleared only by an admin's reopen: the client sends `reopenClosedAt` = the stamp being reopened, and the server clears it only while it still matches, with an `audit_log` row `salary.reopen`. Backfilled from `payment_date` for months already paid)
* `closed_by` VARCHAR(255) [NULLable] (Email of the session whose save closed the month)
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP

### `employee_vacations`
Employee leave and absence logs (holidays, doctor visits, sick leave, unpaid time off) with day count tracking and approval workflow.
* `id` VARCHAR(50) [PK] (e.g. `vac-1727650000000-ijkl`)
* `employee_id` VARCHAR(50) (References `employees.id`)
* `vacation_type_id` VARCHAR(50) (References vacation type from system/employee settings, e.g. `annual`, `sick`, `doctor`, `unpaid`)
* `start_date` DATE (Leave start date)
* `end_date` DATE (Leave end date)
* `days_count` DECIMAL(5, 1) (Calculated working days excluding weekends)
* `status` ENUM('requested', 'approved', 'rejected', 'taken') (Approval status)
* `note` TEXT [NULLable]
* `approved_by` VARCHAR(100) [NULLable] (Email of the session that approved or rejected it, stamped by `sync.php` on the transition. Kept when approved leave moves to `taken`; NULL for any other status)
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP

---

## 11. Support & Ticket Management

### `support_contracts`
SLA tiers and monthly support hour allocations per client/project.
* `id` VARCHAR(50) [PK]
* `client_id` VARCHAR(50) [NULLable] (References `leads.id`)
* `project_id` VARCHAR(50) [NULLable] (References `projects.id`)
* `tier` ENUM('basic', 'pro', 'enterprise', 'project_only')
* `monthly_hours` DECIMAL(6,2)
* `hourly_rate` DECIMAL(10,2)
* `sla_response_critical_hours` DECIMAL(5,2)
* `sla_response_high_hours` DECIMAL(5,2)
* `sla_response_normal_hours` DECIMAL(5,2)
* `sla_response_low_hours` DECIMAL(5,2)
* `sla_resolve_critical_hours` DECIMAL(6,2)
* `sla_resolve_high_hours` DECIMAL(6,2)
* `sla_resolve_normal_hours` DECIMAL(6,2)
* `sla_resolve_low_hours` DECIMAL(6,2)
* `valid_from` DATE [NULLable]
* `valid_until` DATE [NULLable]
* `notes` TEXT [NULLable]
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP

### `tickets`
Support tickets, bug reports, and client inquiries attached to projects and clients.
* `id` VARCHAR(50) [PK]
* `ticket_number` VARCHAR(30) [UNIQUE] (e.g. `TCK-000001`)
* `title` VARCHAR(500)
* `description` LONGTEXT [NULLable]
* `status` VARCHAR(50) (Customizable status key from `TICKET_STATUSES` setting)
* `priority` ENUM('critical', 'high', 'normal', 'low')
* `type` ENUM('bug', 'question', 'request', 'incident', 'billing')
* `source` ENUM('email', 'widget', 'manual', 'phone')
* `project_id` VARCHAR(50) [NULLable] (References `projects.id`)
* `client_id` VARCHAR(50) [NULLable] (References `leads.id`)
* `reporter_name` VARCHAR(200) [NULLable]
* `reporter_email` VARCHAR(255) [NULLable]
* `reporter_phone` VARCHAR(50) [NULLable]
* `assignee_id` VARCHAR(50) [NULLable]
* `assignee_name` VARCHAR(100) [NULLable]
* `watchers_json` TEXT [NULLable]
* `tags_json` TEXT [NULLable]
* `metadata_json` LONGTEXT [NULLable] (Widget runtime errors, console logs, URL, userAgent, viewport, AI triage info)
* `attachments_json` LONGTEXT [NULLable]
* `email_message_id` VARCHAR(255) [NULLable]
* `first_response_due_at` DATETIME [NULLable]
* `first_responded_at` DATETIME [NULLable]
* `resolve_due_at` DATETIME [NULLable]
* `sla_paused_at` DATETIME [NULLable]
* `sla_paused_seconds` INT
* `resolved_at` DATETIME [NULLable]
* `closed_at` DATETIME [NULLable]
* `satisfaction_score` TINYINT [NULLable]
* `satisfaction_comment` TEXT [NULLable]
* `archived` TINYINT(1)
* `created_at` DATETIME
* `updated_at` TIMESTAMP

### `ticket_messages`
Public replies, internal team notes, and system events on a ticket.
* `id` VARCHAR(50) [PK]
* `ticket_id` VARCHAR(50) (References `tickets.id` ON DELETE CASCADE)
* `author_type` ENUM('client', 'agent', 'system')
* `author_user_id` VARCHAR(50) [NULLable]
* `author_name` VARCHAR(200) [NULLable]
* `author_email` VARCHAR(255) [NULLable]
* `is_internal` TINYINT(1) (1 = private team note, 0 = public reply)
* `body` LONGTEXT
* `attachments_json` LONGTEXT [NULLable]
* `email_message_id` VARCHAR(255) [NULLable]
* `created_at` DATETIME

### `ticket_task_links`
Bidirectional links between tickets and operational tasks.
* `ticket_id` VARCHAR(50)
* `task_id` VARCHAR(50)
* `sync_mode` ENUM('auto_resolve', 'manual')
* `created_at` TIMESTAMP
* Primary Key: (`ticket_id`, `task_id`)

### `ticket_time_entries`
Logged support hours (billable and non-billable) against a ticket.
* `id` VARCHAR(50) [PK]
* `ticket_id` VARCHAR(50) (References `tickets.id` ON DELETE CASCADE)
* `user_id` VARCHAR(50) [NULLable]
* `user_name` VARCHAR(100)
* `minutes` INT
* `billable` TINYINT(1)
* `note` VARCHAR(500) [NULLable]
* `logged_at` DATE
* `created_at` TIMESTAMP

---

## 12. Newsletter

Spec: `docs/NEWSLETTER.md`. These tables are written only by `api/newsletter*.php`, never by `sync.php` (so the `sync.php` column-healing rule does not apply) and they are not part of the sync blob. No foreign keys. Times are UTC `DATETIME`. A later `ALTER` goes into a `ccrm_migrate_newsletter()` migration.

### `newsletter_campaigns`
One e-mail campaign. Only a `draft` is editable. Deleted campaigns are soft-deleted (`deleted_at`).
* `id` VARCHAR(64) [PK] (`nlc-<random hex>`)
* `name` VARCHAR(200) (internal name)
* `subject` VARCHAR(255)
* `preheader` VARCHAR(255) [NULLable]
* `from_name` VARCHAR(150) [NULLable] (NULL = `NEWSLETTER_CONFIG.sender.fromName`)
* `reply_to` VARCHAR(190) [NULLable] (NULL = `NEWSLETTER_CONFIG.sender.replyTo`)
* `audience_json` TEXT (the `Audience` of C5: clients required, leads / employees / extra optional)
* `body_json` MEDIUMTEXT [NULLable] (the `EmailDoc` of C6)
* `use_header` TINYINT(1) / `use_footer` TINYINT(1) (default 1: show the global header / footer)
* `html_snapshot` MEDIUMTEXT [NULLable] / `text_snapshot` MEDIUMTEXT [NULLable] (rendered by the browser at `start_send`, merge tags unresolved)
* `status` VARCHAR(16) (`draft` | `sending` | `paused` | `sent` | `cancelled`)
* `last_error` VARCHAR(500) [NULLable]
* `recipients_total` INT (queued rows at `start_send`)
* `created_by` VARCHAR(50) [NULLable] / `updated_by` VARCHAR(50) [NULLable] (the user's display name)
* `created_at`, `updated_at` DATETIME; `started_at`, `finished_at`, `deleted_at` DATETIME [NULLable]
* Indexes: `idx_nlc_status` (`status`), `idx_nlc_list` (`deleted_at`, `updated_at`)

### `newsletter_recipients`
One row per address of one campaign, frozen when sending starts. Doubles as the send queue.
* `id` BIGINT UNSIGNED [PK, AUTO_INCREMENT]
* `campaign_id` VARCHAR(64) (References `newsletter_campaigns.id`, no foreign key)
* `email` VARCHAR(190) (lower-cased, trimmed)
* `name` VARCHAR(255) [NULLable]
* `source` VARCHAR(16) (`client` | `lead` | `employee` | `extra`; on a duplicate address the first source wins: client > lead > employee > extra)
* `lead_id` VARCHAR(50) [NULLable], `employee_id` VARCHAR(50) [NULLable]
* `merge_json` TEXT [NULLable] (merge values `name`, `first_name`, `company`, `email` frozen at `start_send`)
* `token` CHAR(32) (`bin2hex(random_bytes(16))`, used by the unsubscribe and view-online links)
* `status` VARCHAR(16) (`queued` | `sent` | `failed` | `skipped` | `cancelled`)
* `skip_reason` VARCHAR(32) [NULLable] (`unsubscribed` | `invalid`)
* `attempts` TINYINT, `next_attempt_at` DATETIME [NULLable], `error` VARCHAR(500) [NULLable]
* `sent_at` DATETIME [NULLable], `unsubscribed_at` DATETIME [NULLable] (set when the person used this campaign's unsubscribe link)
* Unique: (`campaign_id`, `email`), `token`. Indexes: `idx_nlr_queue` (`campaign_id`, `status`, `next_attempt_at`), `idx_nlr_sent_at`, `idx_nlr_email`

### `newsletter_suppressions`
The one global opt-out list. Every send skips these addresses.
* `email` VARCHAR(190) [PK] (lower-cased)
* `reason` VARCHAR(16) (`unsubscribed` | `bounced` | `manual`)
* `campaign_id` VARCHAR(64) [NULLable] (the campaign whose link was used)
* `note` VARCHAR(255) [NULLable]
* `created_by` VARCHAR(50) [NULLable] (NULL = the recipient via the unsubscribe link, or the worker)
* `created_at` DATETIME

### `system_settings` key `NEWSLETTER_CONFIG`
JSON (C3), read and written only by `api/newsletter.php` (`settings_get` / `settings_save`); a missing key means the defaults.
`{ version: 1, header: EmailDoc | null, footer: EmailDoc | null, theme: { contentWidth 520..800, pageBackground, contentBackground, fontFamily, textColor, linkColor, buttonBackground, buttonTextColor }, sender: { fromName, replyTo }, sending: { batchSize 10..200 (40), perHourLimit 10..10000 (400), testRecipients: string[] (max 5) } }`.
`header` / `footer` `null` = the built-in default for the company and language. Uploaded images are plain files under `<uploads>/newsletter/YYYY/MM/<random hex>.<ext>` (no table).
