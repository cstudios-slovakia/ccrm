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

### `lead_categories`
Junction table mapping leads to business categories.
* `lead_id` VARCHAR(50)
* `category` VARCHAR(100) (e.g., Kitchen Countertops, Flooring Tiles)
* Primary Key: (`lead_id`, `category`)

### `timeline_events`
Interaction history logged against leads (emails, call logs, meetings).
* `id` VARCHAR(50) [PK]
* `lead_id` VARCHAR(50)
* `type` VARCHAR(50) (e.g., note, phone, email, offer, appointment)
* `timestamp` DATETIME
* `title` VARCHAR(255)
* `content` TEXT
* `author` VARCHAR(100) (CRM user whose action produced the entry; NULL for entries nobody triggered here — incoming mail, public-form inquiries, imports — and for rows written before the column existed)
* `created_at` TIMESTAMP

---

## 3. Tasks & Team Management

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
* `owner` VARCHAR(100) (primary assignee; empty when unassigned)
* `created_by` VARCHAR(100) (immutable creator name; nullable for legacy rows)
* `related_lead_id` VARCHAR(50)
* `is_locking` TINYINT(1)
* `archived` TINYINT(1)
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP

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
* `timeline_event_types_json` LONGTEXT
* `timeline_attributes_json` LONGTEXT
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP

### `projects`
Individual instances of active project lifecycles.
* `id` VARCHAR(50) [PK]
* `project_type_id` VARCHAR(50)
* `lead_id` VARCHAR(50)
* `client_id` VARCHAR(50)
* `status` VARCHAR(50) (active, completed, archived)
* `created_at` TIMESTAMP
* `updated_at` TIMESTAMP

### `project_managers`
Junction table mapping project managers to projects.
* `project_id` VARCHAR(50)
* `user_id` VARCHAR(50)
* Primary Key: (`project_id`, `user_id`)

### Dynamic Tables (Per Project Type)
Each custom project type with ID `{safeId}` generates three tables:
1. `proj_data_{safeId}`: Stores values for custom attributes (`attr_{attributeId}`).
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
* `key` VARCHAR(100) [PK] (e.g. INTEGRATIONS_CONFIG, SYSTEM_NAME, SYSTEM_LANGUAGE)
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
* `created_at` TIMESTAMP

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

