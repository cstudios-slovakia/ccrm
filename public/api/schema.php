<?php
/**
 * CCRM database schema — SINGLE SOURCE OF TRUTH.
 *
 * Every component that creates or migrates the database (the installation
 * wizard `api/setup.php`, the live sync endpoint `sync.php`, and the Composer
 * `CCRM\Installer`) includes THIS file so the DDL can never drift between them.
 *
 * - ccrm_schema_statements(): ordered list of idempotent CREATE TABLE statements.
 * - ccrm_apply_schema($pdo):  runs the CREATE statements then in-place migrations.
 * - ccrm_apply_migrations($pdo): idempotent ALTERs for databases created by
 *   older versions (checks information_schema instead of relying on try/catch).
 */

if (!function_exists('ccrm_schema_statements')) {

    function ccrm_schema_statements(): array {
        return [
            // Users
            "CREATE TABLE IF NOT EXISTS `users` (
              `id` VARCHAR(50) NOT NULL,
              `name` VARCHAR(100) NOT NULL,
              `email` VARCHAR(150) NOT NULL UNIQUE,
              `password_hash` VARCHAR(255) NOT NULL,
              `sessions_valid_from` DATETIME NULL COMMENT 'Sessions issued before this are rejected (set on password change)',
              `role` ENUM('admin', 'project_manager', 'viewer') NOT NULL DEFAULT 'viewer',
              `avatar` VARCHAR(255) NULL,
              `color` VARCHAR(20) NULL,
              `metadata_json` TEXT NULL COMMENT 'Plugin support',
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              INDEX idx_user_email (`email`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Permissions
            "CREATE TABLE IF NOT EXISTS `permissions` (
              `id` INT AUTO_INCREMENT PRIMARY KEY,
              `slug` VARCHAR(100) NOT NULL UNIQUE,
              `description` VARCHAR(255) NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Role Permissions
            "CREATE TABLE IF NOT EXISTS `role_permissions` (
              `role` ENUM('admin', 'project_manager', 'viewer') NOT NULL,
              `permission_slug` VARCHAR(100) NOT NULL,
              PRIMARY KEY (`role`, `permission_slug`),
              FOREIGN KEY (`permission_slug`) REFERENCES `permissions` (`slug`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Leads
            "CREATE TABLE IF NOT EXISTS `leads` (
              `id` VARCHAR(50) NOT NULL,
              `name` VARCHAR(150) NOT NULL COMMENT 'Client/Company Name',
              `city` VARCHAR(100) NULL,
              `client_type` ENUM('person', 'business', 'partner') NOT NULL DEFAULT 'person',
              `status` VARCHAR(50) NOT NULL DEFAULT 'new' COMMENT 'Active Pipeline State',
              `source` VARCHAR(50) NOT NULL DEFAULT 'website' COMMENT 'Marketing Source',
              `owner` VARCHAR(100) NOT NULL COMMENT 'Assigned Project Manager Name',
              `value` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Estimated Opportunity Worth',
              `rating` INT NOT NULL DEFAULT 3 COMMENT 'Star Rating 1-5',
              `phone` VARCHAR(30) NULL,
              `email` VARCHAR(150) NULL,
              `company_id` VARCHAR(50) NULL COMMENT 'ICO',
              `tax_id` VARCHAR(50) NULL COMMENT 'DIC',
              `vat_id` VARCHAR(50) NULL COMMENT 'IC DPH',
              `contact_person` VARCHAR(100) NULL,
              `website` VARCHAR(255) NULL,
              `street` VARCHAR(255) NULL,
              `postal_code` VARCHAR(20) NULL,
              `country` VARCHAR(100) NULL DEFAULT 'Slovakia',
              `ai_summary` TEXT NULL,
              `ai_summary_fingerprint` TEXT NULL,
              `interest_note` TEXT NULL COMMENT 'What the client is interested in / the problem to solve',
              `referral_lead_id` VARCHAR(50) NULL COMMENT 'Lead/client who referred this one. Deliberately NOT a foreign key: a sync payload can carry the referring lead after this one, and deleting the referrer must not delete or block this lead',
              `metadata_json` TEXT NULL COMMENT 'Plugin support',
              `vat_validation_result` TEXT NULL,
              `follow_ups` TEXT NULL COMMENT 'JSON map: {stateKey: YYYY-MM-DD} of completed follow-ups',
              `created_at` DATE NOT NULL,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              INDEX idx_lead_status (`status`),
              INDEX idx_lead_owner (`owner`),
              INDEX idx_lead_created (`created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Lead Categories Link
            "CREATE TABLE IF NOT EXISTS `lead_categories` (
              `lead_id` VARCHAR(50) NOT NULL,
              `category_name` VARCHAR(100) NOT NULL,
              PRIMARY KEY (`lead_id`, `category_name`),
              FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Timeline Events
            "CREATE TABLE IF NOT EXISTS `timeline_events` (
              `id` VARCHAR(50) NOT NULL,
              `lead_id` VARCHAR(50) NOT NULL,
              `type` ENUM('phone', 'email', 'note', 'offer', 'appointment', 'order', 'proforma_invoice', 'advance_receipt', 'invoice', 'delivery_note', 'status_change') NOT NULL DEFAULT 'note',
              `timestamp` DATETIME NOT NULL,
              `title` VARCHAR(255) NOT NULL,
              `content` TEXT NULL,
              `amount` DECIMAL(12,2) NULL,
              `file_name` VARCHAR(255) NULL,
              `file_size` VARCHAR(50) NULL,
              `file_type` ENUM('offer', 'contract', 'invoice') NULL,
              `attachments_json` TEXT NULL COMMENT 'JSON array of {name,size,path} — an event can carry several documents',
              `extra_time` VARCHAR(10) NULL,
              `is_outgoing` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'email events only: 1 = we sent it, 0 = the client did',
              `author` VARCHAR(100) NULL COMMENT 'CRM user whose action produced this entry. NULL for entries nobody triggered here (incoming mail, public-form inquiries, imports)',
              `audio_file` VARCHAR(255) NULL COMMENT 'Voice note recorded onto the timeline: the path api/upload_audio.php stored the recording at',
              `transcription` TEXT NULL COMMENT 'Speech-to-text transcript of `audio_file`, produced by api/transcribe_meeting.php',
              PRIMARY KEY (`id`),
              FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
              INDEX idx_event_timestamp (`timestamp`),
              INDEX idx_event_type (`type`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Tasks
            "CREATE TABLE IF NOT EXISTS `tasks` (
              `id` VARCHAR(50) NOT NULL,
              `title` VARCHAR(255) NOT NULL,
              `description` TEXT NULL,
              `priority` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
              `start_date` DATE NULL,
              `deadline` DATE NOT NULL,
              `deadline_time` VARCHAR(5) NULL COMMENT 'HH:MM deadline/overdue time',
              `status` VARCHAR(50) NOT NULL DEFAULT 'todo' COMMENT 'User-customizable task state',
              `owner` VARCHAR(100) NOT NULL COMMENT 'Primary assignee name; empty when unassigned',
              `created_by` VARCHAR(100) NULL COMMENT 'Immutable task creator name; NULL for legacy rows',
              `related_lead_id` VARCHAR(50) NULL,
              `workflow_id` VARCHAR(50) NULL COMMENT 'Automation that created this task; NULL for hand-made ones',
              `is_locking` TINYINT(1) NOT NULL DEFAULT 0,
              `archived` TINYINT(1) NOT NULL DEFAULT 0,
              `completed_by` VARCHAR(100) NULL COMMENT 'Name of the user who moved the task to a done state; NULL for legacy rows',
              `completed_at` VARCHAR(16) NULL COMMENT 'YYYY-MM-DD HH:MM local completion timestamp; NULL for legacy rows',
              `metadata_json` TEXT NULL COMMENT 'Plugin support',
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              FOREIGN KEY (`related_lead_id`) REFERENCES `leads` (`id`) ON DELETE SET NULL,
              INDEX idx_task_status (`status`),
              INDEX idx_task_deadline (`deadline`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Task Assignees
            "CREATE TABLE IF NOT EXISTS `task_assignees` (
              `task_id` VARCHAR(50) NOT NULL,
              `user_name` VARCHAR(100) NOT NULL,
              PRIMARY KEY (`task_id`, `user_name`),
              FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // System Settings
            "CREATE TABLE IF NOT EXISTS `system_settings` (
              `key` VARCHAR(100) NOT NULL,
              `value` TEXT NOT NULL,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`key`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Plugins registry (extensibility)
            "CREATE TABLE IF NOT EXISTS `plugins` (
              `id` VARCHAR(50) NOT NULL,
              `name` VARCHAR(100) NOT NULL,
              `is_active` TINYINT(1) DEFAULT 1,
              `config_json` TEXT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Meeting Notes
            "CREATE TABLE IF NOT EXISTS `meeting_notes` (
              `id` VARCHAR(50) NOT NULL,
              `title` VARCHAR(255) NOT NULL,
              `date` DATE NOT NULL,
              `lead_id` VARCHAR(50) NULL,
              `lead_name` VARCHAR(150) NULL,
              `duration` INT NOT NULL DEFAULT 0,
              `notes` TEXT NULL,
              `ai_summary_json` TEXT NULL,
              `summary_generated` TINYINT(1) NOT NULL DEFAULT 0,
              `attached_leads_json` TEXT NULL,
              `attached_clients_json` TEXT NULL,
              `attached_users_json` TEXT NULL,
              `archived` TINYINT(1) NOT NULL DEFAULT 0,
              `audio_file` VARCHAR(255) NULL,
              `transcription` LONGTEXT NULL,
              `automated_notes` LONGTEXT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
            // Meeting Tasks
            "CREATE TABLE IF NOT EXISTS `meeting_tasks` (
              `id` VARCHAR(50) NOT NULL,
              `meeting_id` VARCHAR(50) NOT NULL,
              `title` VARCHAR(255) NOT NULL,
              `description` TEXT NULL,
              `start_date` DATE NULL,
              `assigned_user` VARCHAR(100) NULL,
              `due_date` DATE NULL,
              `priority` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
              `status` ENUM('todo', 'in_progress', 'done') NOT NULL DEFAULT 'todo',
              PRIMARY KEY (`id`),
              FOREIGN KEY (`meeting_id`) REFERENCES `meeting_notes` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Email Summaries
            "CREATE TABLE IF NOT EXISTS `email_summaries` (
              `user_email` VARCHAR(150) NOT NULL,
              `folder` VARCHAR(100) NOT NULL,
              `email_uid` VARCHAR(150) NOT NULL,
              `summary` TEXT NOT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`user_email`, `folder`, `email_uid`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // RAG Emails Cache
            "CREATE TABLE IF NOT EXISTS `rag_emails` (
              `user_email` VARCHAR(150) NOT NULL,
              `folder` VARCHAR(100) NOT NULL,
              `email_uid` VARCHAR(150) NOT NULL,
              `subject` VARCHAR(255) NOT NULL,
              `sender` VARCHAR(255) NOT NULL,
              `recipient` VARCHAR(255) NOT NULL,
              `body` LONGTEXT NOT NULL,
              `received_at` DATETIME NOT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (`user_email`, `folder`, `email_uid`),
              INDEX idx_rag_email_received (`received_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Unified Universal Entries Config Registry
            "CREATE TABLE IF NOT EXISTS `unified_entries` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `name` VARCHAR(100) NOT NULL,
              `entry_name` VARCHAR(100) NULL,
              `folder_name` VARCHAR(100) NULL,
              `icon` VARCHAR(50) NOT NULL,
              `color` VARCHAR(20) NOT NULL,
              `modules_json` TEXT NOT NULL,
              `folder_modules_json` TEXT NULL,
              `folders_enabled` TINYINT(1) NOT NULL DEFAULT 0,
              `show_folder_summary` TINYINT(1) NOT NULL DEFAULT 0,
              `warning_days` INT NOT NULL DEFAULT 0,
              `archived` TINYINT(1) NOT NULL DEFAULT 0,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Error Logs for Exception Tracking
            "CREATE TABLE IF NOT EXISTS `error_logs` (
              `id` INT AUTO_INCREMENT PRIMARY KEY,
              `message` TEXT NOT NULL,
              `file` VARCHAR(255) NULL,
              `line` INT NULL,
              `trace` LONGTEXT NULL,
              `request_uri` VARCHAR(255) NULL,
              `request_method` VARCHAR(10) NULL,
              `payload` LONGTEXT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            "CREATE TABLE IF NOT EXISTS `password_resets` (
              `token` VARCHAR(64) NOT NULL,
              `user_id` VARCHAR(50) NOT NULL,
              `expires_at` DATETIME NOT NULL,
              `used` TINYINT(1) NOT NULL DEFAULT 0,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (`token`),
              INDEX `idx_pwreset_user` (`user_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Custom Dynamic Dashboards
            "CREATE TABLE IF NOT EXISTS `custom_dashboards` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `name` VARCHAR(100) NOT NULL,
              `icon` VARCHAR(50) NOT NULL,
              `color` VARCHAR(20) NOT NULL,
              `prompts_json` LONGTEXT NOT NULL,
              `layout_json` LONGTEXT NOT NULL,
              `active_model` VARCHAR(50) NOT NULL,
              `archived` TINYINT(1) NOT NULL DEFAULT 0,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Project Types (Metadata for dynamic tables)
            "CREATE TABLE IF NOT EXISTS `project_types` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `name` VARCHAR(100) NOT NULL,
              `description` TEXT NULL,
              `icon` VARCHAR(50) NOT NULL,
              `color` VARCHAR(20) NOT NULL,
              `attributes_json` LONGTEXT NOT NULL,
              `has_timeline` TINYINT(1) NOT NULL DEFAULT 0,
              `has_gantt` TINYINT(1) NOT NULL DEFAULT 0,
              `timeline_event_types_json` LONGTEXT NULL,
              `timeline_attributes_json` LONGTEXT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Projects (Base common table)
            "CREATE TABLE IF NOT EXISTS `projects` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `project_type_id` VARCHAR(50) NOT NULL,
              `lead_id` VARCHAR(50) NULL,
              `client_id` VARCHAR(50) NULL,
              `status` VARCHAR(50) NOT NULL DEFAULT 'active',
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              FOREIGN KEY (`project_type_id`) REFERENCES `project_types` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Project Managers (Junction table)
            "CREATE TABLE IF NOT EXISTS `project_managers` (
              `project_id` VARCHAR(50) NOT NULL,
              `user_id` VARCHAR(50) NOT NULL,
              PRIMARY KEY (`project_id`, `user_id`),
              FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Audit trail for privileged / financial actions (see ccrm_audit_log).
            "CREATE TABLE IF NOT EXISTS `audit_log` (
              `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
              `actor_id` VARCHAR(50) NULL,
              `actor_email` VARCHAR(255) NULL,
              `action` VARCHAR(100) NOT NULL,
              `detail` TEXT NULL,
              `ip` VARCHAR(45) NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              INDEX `idx_audit_time` (`created_at`),
              INDEX `idx_audit_action` (`action`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Rate-limit ledger for password-reset requests (per IP/email).
            "CREATE TABLE IF NOT EXISTS `password_reset_attempts` (
              `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
              `ip` VARCHAR(45) NULL,
              `email` VARCHAR(255) NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              INDEX `idx_pwreset_ip_time` (`ip`, `created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Workflow Definitions
            "CREATE TABLE IF NOT EXISTS `workflows` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `name` VARCHAR(150) NOT NULL,
              `description` TEXT NULL,
              `is_active` TINYINT(1) NOT NULL DEFAULT 1,
              `trigger_type` VARCHAR(50) NOT NULL,
              `trigger_config_json` TEXT NULL,
              `nodes_json` LONGTEXT NOT NULL,
              `edges_json` LONGTEXT NOT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX `idx_wf_trigger` (`trigger_type`),
              INDEX `idx_wf_active` (`is_active`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Workflow Queue (Event Bus)
            "CREATE TABLE IF NOT EXISTS `workflow_queue` (
              `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
              `workflow_id` VARCHAR(50) NOT NULL,
              `trigger_event_type` VARCHAR(50) NOT NULL,
              `payload_json` LONGTEXT NOT NULL,
              `status` ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
              `error_message` TEXT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `processed_at` DATETIME NULL,
              INDEX `idx_wfq_status` (`status`),
              INDEX `idx_wfq_workflow` (`workflow_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Workflow Execution Logs
            "CREATE TABLE IF NOT EXISTS `workflow_logs` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `workflow_id` VARCHAR(50) NOT NULL,
              `queue_id` BIGINT NULL,
              `status` ENUM('success', 'failed', 'running') NOT NULL DEFAULT 'running',
              `execution_time_ms` INT NOT NULL DEFAULT 0,
              `trigger_event` VARCHAR(50) NULL,
              `execution_log_json` LONGTEXT NOT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              INDEX `idx_wfl_workflow` (`workflow_id`),
              INDEX `idx_wfl_created` (`created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Warehouses (Multi-warehouse support)
            "CREATE TABLE IF NOT EXISTS `warehouses` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `name` VARCHAR(150) NOT NULL,
              `code` VARCHAR(50) NOT NULL UNIQUE,
              `address` VARCHAR(255) NULL,
              `manager_user_id` VARCHAR(50) NULL,
              `is_default` TINYINT(1) NOT NULL DEFAULT 0,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Suppliers (Dodávatelia)
            "CREATE TABLE IF NOT EXISTS `suppliers` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `name` VARCHAR(255) NOT NULL,
              `company_id` VARCHAR(50) NULL,
              `tax_id` VARCHAR(50) NULL,
              `vat_id` VARCHAR(50) NULL,
              `street` VARCHAR(255) NULL,
              `city` VARCHAR(100) NULL,
              `postal_code` VARCHAR(20) NULL,
              `country` VARCHAR(100) NULL DEFAULT 'Slovakia',
              `email` VARCHAR(150) NULL,
              `phone` VARCHAR(50) NULL,
              `website` VARCHAR(255) NULL,
              `iban` VARCHAR(50) NULL,
              `swift` VARCHAR(20) NULL,
              `payment_due_days` INT NOT NULL DEFAULT 14,
              `notes` TEXT NULL,
              `contacts_json` TEXT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              INDEX `idx_supplier_name` (`name`),
              INDEX `idx_supplier_ico` (`company_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Warehouse Items (Katalóg tovaru a materiálu)
            "CREATE TABLE IF NOT EXISTS `warehouse_items` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `sku` VARCHAR(100) NOT NULL UNIQUE,
              `barcode` VARCHAR(100) NULL,
              `name` VARCHAR(255) NOT NULL,
              `description` TEXT NULL,
              `category` VARCHAR(100) NULL,
              `unit` VARCHAR(20) NOT NULL DEFAULT 'ks',
              `min_stock` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `optimal_stock` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `default_location` VARCHAR(100) NULL,
              `has_expiration` TINYINT(1) NOT NULL DEFAULT 0,
              `image_url` VARCHAR(500) NULL,
              `default_sell_price` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `avg_purchase_price` DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
              `last_purchase_price` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              INDEX `idx_item_sku` (`sku`),
              INDEX `idx_item_category` (`category`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Warehouse Stock (Stav zásob podľa skladov)
            "CREATE TABLE IF NOT EXISTS `warehouse_stock` (
              `warehouse_id` VARCHAR(50) NOT NULL,
              `item_id` VARCHAR(50) NOT NULL,
              `quantity` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `reserved_quantity` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `location` VARCHAR(100) NULL,
              PRIMARY KEY (`warehouse_id`, `item_id`),
              FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE CASCADE,
              FOREIGN KEY (`item_id`) REFERENCES `warehouse_items` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Warehouse Batches & Expiry (Šarže a exspirácie)
            "CREATE TABLE IF NOT EXISTS `warehouse_batches` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `item_id` VARCHAR(50) NOT NULL,
              `warehouse_id` VARCHAR(50) NOT NULL,
              `batch_number` VARCHAR(100) NOT NULL,
              `expiration_date` DATE NOT NULL,
              `initial_quantity` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `current_quantity` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `purchase_price` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (`item_id`) REFERENCES `warehouse_items` (`id`) ON DELETE CASCADE,
              FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE CASCADE,
              INDEX `idx_batch_exp` (`expiration_date`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Warehouse Movements (Pohybové doklady - Príjemka, Výdajka, Prevodka, Inventúra)
            "CREATE TABLE IF NOT EXISTS `warehouse_movements` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `document_number` VARCHAR(100) NOT NULL UNIQUE,
              `type` ENUM('inward', 'outward', 'transfer', 'adjustment') NOT NULL,
              `status` ENUM('draft', 'confirmed', 'cancelled') NOT NULL DEFAULT 'confirmed',
              `warehouse_id` VARCHAR(50) NOT NULL,
              `target_warehouse_id` VARCHAR(50) NULL,
              `supplier_id` VARCHAR(50) NULL,
              `lead_id` VARCHAR(50) NULL,
              `total_cost_value` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
              `total_sell_value` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
              `total_profit_value` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
              `created_by` VARCHAR(100) NOT NULL,
              `note` TEXT NULL,
              `file_name` VARCHAR(255) NULL,
              `file_path` VARCHAR(500) NULL,
              `issued_at` DATETIME NOT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE RESTRICT,
              INDEX `idx_mov_doc` (`document_number`),
              INDEX `idx_mov_type` (`type`),
              INDEX `idx_mov_lead` (`lead_id`),
              INDEX `idx_mov_issued` (`issued_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Warehouse Movement Items (Položky pohybového dokladu)
            "CREATE TABLE IF NOT EXISTS `warehouse_movement_items` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `movement_id` VARCHAR(50) NOT NULL,
              `item_id` VARCHAR(50) NOT NULL,
              `batch_id` VARCHAR(50) NULL,
              `quantity` DECIMAL(12,2) NOT NULL,
              `unit_purchase_price` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `unit_sell_price` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `total_price` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
              `expiration_date` DATE NULL,
              `note` VARCHAR(255) NULL,
              FOREIGN KEY (`movement_id`) REFERENCES `warehouse_movements` (`id`) ON DELETE CASCADE,
              FOREIGN KEY (`item_id`) REFERENCES `warehouse_items` (`id`) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Financial Categories (3-level hierarchical category tree for Incomes and Expenses)
            "CREATE TABLE IF NOT EXISTS `financial_categories` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `type` ENUM('income', 'expense') NOT NULL,
              `name` VARCHAR(150) NOT NULL,
              `parent_id` VARCHAR(50) NULL,
              `level` INT NOT NULL DEFAULT 1,
              `color` VARCHAR(30) NULL,
              `icon` VARCHAR(50) NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_fc_type (`type`),
              INDEX idx_fc_parent (`parent_id`),
              INDEX idx_fc_level (`level`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Financial Records (Incomes, Invoices, Expenses, Recurring and Single movements)
            "CREATE TABLE IF NOT EXISTS `financial_records` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `type` ENUM('income', 'expense') NOT NULL,
              `subtype` VARCHAR(50) NOT NULL DEFAULT 'regular' COMMENT 'invoice, expense, tax, salary, material, overhead',
              `title` VARCHAR(255) NOT NULL,
              `description` TEXT NULL,
              `category_id` VARCHAR(50) NULL,
              `category_path` VARCHAR(255) NULL COMMENT 'Hierarchical breadcrumb e.g. Level1 > Level2 > Level3',
              `amount_planned` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
              `amount_real` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
              `currency` VARCHAR(10) NOT NULL DEFAULT 'EUR',
              `status` ENUM('planned', 'pending', 'paid', 'partially_paid', 'overdue', 'cancelled') NOT NULL DEFAULT 'planned',
              `issue_date` DATE NOT NULL COMMENT 'Date invoice issued or expense scheduled',
              `due_date` DATE NULL COMMENT 'Due date for settlement',
              `paid_date` DATE NULL COMMENT 'Actual payment date if settled',
              `payment_method` VARCHAR(50) NULL,
              `is_recurring` TINYINT(1) NOT NULL DEFAULT 0,
              `recurring_frequency` ENUM('weekly', 'monthly', 'yearly') NULL,
              `recurring_config_json` TEXT NULL,
              `recurring_start_date` DATE NULL,
              `recurring_end_date` DATE NULL,
              `project_id` VARCHAR(50) NULL COMMENT 'NULL for Global company-wide record, or linked project ID',
              `client_id` VARCHAR(50) NULL COMMENT 'NULL for Global company-wide record, or linked client ID',
              `invoice_number` VARCHAR(100) NULL,
              `tax_rate` DECIMAL(5,2) NOT NULL DEFAULT 20.00,
              `attachments_json` TEXT NULL,
              `created_by` VARCHAR(100) NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_fr_type (`type`),
              INDEX idx_fr_status (`status`),
              INDEX idx_fr_issue_date (`issue_date`),
              INDEX idx_fr_due_date (`due_date`),
              INDEX idx_fr_project (`project_id`),
              INDEX idx_fr_client (`client_id`),
              INDEX idx_fr_recurring (`is_recurring`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Invoices & Price Offers (Cenové ponuky a Faktúry)
            "CREATE TABLE IF NOT EXISTS `invoices_offers` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `document_number` VARCHAR(100) NOT NULL,
              `type` ENUM('price_offer', 'proforma', 'invoice') NOT NULL DEFAULT 'price_offer',
              `mode` ENUM('default', 'custom', 'external') NOT NULL DEFAULT 'default',
              `external_provider` VARCHAR(50) NULL,
              `external_id` VARCHAR(100) NULL,
              `external_pdf_url` VARCHAR(500) NULL,
              `lead_id` VARCHAR(50) NOT NULL,
              `client_id` VARCHAR(50) NULL,
              `client_name` VARCHAR(150) NOT NULL,
              `client_email` VARCHAR(150) NULL,
              `client_phone` VARCHAR(50) NULL,
              `client_street` VARCHAR(255) NULL,
              `client_city` VARCHAR(100) NULL,
              `client_postal_code` VARCHAR(20) NULL,
              `client_country` VARCHAR(100) NULL DEFAULT 'Slovakia',
              `client_ico` VARCHAR(50) NULL,
              `client_dic` VARCHAR(50) NULL,
              `client_icdph` VARCHAR(50) NULL,
              `title` VARCHAR(255) NOT NULL,
              `subject` VARCHAR(255) NOT NULL,
              `location` VARCHAR(100) NULL,
              `greeting_note` TEXT NULL,
              `intro_note` TEXT NULL,
              `usp_cards_json` TEXT NULL,
              `reassurance_note` TEXT NULL,
              `subtotal` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
              `vat_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
              `total_price` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
              `price_range_min` DECIMAL(15,2) NULL,
              `price_range_max` DECIMAL(15,2) NULL,
              `currency` VARCHAR(10) NOT NULL DEFAULT 'EUR',
              `duration_text` VARCHAR(100) NULL,
              `start_date_text` VARCHAR(100) NULL,
              `warranty_text` VARCHAR(100) NULL,
              `next_steps_note` TEXT NULL,
              `closing_note` TEXT NULL,
              `sign_off_team` VARCHAR(150) NULL,
              `custom_template_id` VARCHAR(50) NULL,
              `custom_template_style_json` TEXT NULL,
              `status` ENUM('draft', 'sent', 'approved', 'rejected', 'invoiced', 'cancelled') NOT NULL DEFAULT 'draft',
              `issued_at` DATE NOT NULL,
              `valid_until` DATE NULL,
              `due_date` DATE NULL,
              `file_name` VARCHAR(255) NULL,
              `file_path` VARCHAR(500) NULL,
              `created_by` VARCHAR(100) NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_io_doc (`document_number`),
              INDEX idx_io_type (`type`),
              INDEX idx_io_lead (`lead_id`),
              INDEX idx_io_status (`status`),
              INDEX idx_io_issued (`issued_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Invoice & Offer Items (Položky cenovej ponuky / faktúry)
            "CREATE TABLE IF NOT EXISTS `invoice_offer_items` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `invoice_offer_id` VARCHAR(50) NOT NULL,
              `warehouse_item_id` VARCHAR(50) NULL,
              `sku` VARCHAR(100) NULL,
              `name` VARCHAR(255) NOT NULL,
              `description` TEXT NULL,
              `quantity` DECIMAL(12,2) NOT NULL DEFAULT 1.00,
              `unit` VARCHAR(20) NOT NULL DEFAULT 'ks',
              `unit_price` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `vat_rate` DECIMAL(5,2) NOT NULL DEFAULT 20.00,
              `discount_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
              `total_price` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
              FOREIGN KEY (`invoice_offer_id`) REFERENCES `invoices_offers` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // AI Custom PDF Templates (Uložené vygenerované šablóny)
            "CREATE TABLE IF NOT EXISTS `ai_custom_templates` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `name` VARCHAR(150) NOT NULL,
              `description` TEXT NULL,
              `source_pdf_url` VARCHAR(500) NULL,
              `source_pdf_name` VARCHAR(255) NULL,
              `colors_json` TEXT NOT NULL,
              `typography_json` TEXT NOT NULL,
              `sections_order_json` TEXT NOT NULL,
              `custom_banner_text` TEXT NULL,
              `badge_style` VARCHAR(50) NOT NULL DEFAULT 'rounded',
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
        ];
    }

    /**
     * True if $column exists on $table in the current database.
     */
    function ccrm_column_exists(PDO $pdo, string $table, string $column): bool {
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?"
        );
        $stmt->execute([$table, $column]);
        return (int)$stmt->fetchColumn() > 0;
    }

    /**
     * Idempotent migrations for databases created by older CCRM versions.
     * Each step checks the live schema before mutating it, so it is safe to
     * run on every install/update without relying on try/catch swallowing.
     */
    function ccrm_apply_migrations(PDO $pdo): void {
        // Sessions established before this timestamp are rejected, so a password
        // change can retire every session the old password could reach. NULL means
        // "no password change recorded yet" and lets existing sessions continue.
        if (!ccrm_column_exists($pdo, 'users', 'sessions_valid_from')) {
            $pdo->exec("ALTER TABLE `users` ADD COLUMN `sessions_valid_from` DATETIME NULL AFTER `password_hash`");
        }
        // `archived` was added to meeting_notes after the initial release.
        if (!ccrm_column_exists($pdo, 'meeting_notes', 'archived')) {
            $pdo->exec("ALTER TABLE `meeting_notes` ADD COLUMN `archived` TINYINT(1) NOT NULL DEFAULT 0");
        }
        if (!ccrm_column_exists($pdo, 'tasks', 'start_date')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `start_date` DATE NULL AFTER `priority`");
        }
        // Lets the workflow engine tell "this follow-up already exists" from a
        // similar task somebody typed by hand, so re-entering a trigger status
        // does not stack duplicate follow-ups.
        if (!ccrm_column_exists($pdo, 'tasks', 'workflow_id')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `workflow_id` VARCHAR(50) NULL AFTER `related_lead_id`");
        }
        if (!ccrm_column_exists($pdo, 'meeting_tasks', 'start_date')) {
            $pdo->exec("ALTER TABLE `meeting_tasks` ADD COLUMN `start_date` DATE NULL AFTER `description`");
        }
        if (!ccrm_column_exists($pdo, 'meeting_notes', 'audio_file')) {
            $pdo->exec("ALTER TABLE `meeting_notes` ADD COLUMN `audio_file` VARCHAR(255) NULL AFTER `archived`");
        }
        if (!ccrm_column_exists($pdo, 'meeting_notes', 'transcription')) {
            $pdo->exec("ALTER TABLE `meeting_notes` ADD COLUMN `transcription` LONGTEXT NULL AFTER `audio_file`");
        }
        if (!ccrm_column_exists($pdo, 'meeting_notes', 'automated_notes')) {
            $pdo->exec("ALTER TABLE `meeting_notes` ADD COLUMN `automated_notes` LONGTEXT NULL AFTER `transcription`");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'ai_summary')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `ai_summary` TEXT NULL AFTER `country`");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'ai_summary_fingerprint')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `ai_summary_fingerprint` TEXT NULL AFTER `ai_summary`");
        }
        if (!ccrm_column_exists($pdo, 'unified_entries', 'entry_name')) {
            $pdo->exec("ALTER TABLE `unified_entries` ADD COLUMN `entry_name` VARCHAR(100) NULL AFTER `name`");
        }
        if (!ccrm_column_exists($pdo, 'unified_entries', 'folder_name')) {
            $pdo->exec("ALTER TABLE `unified_entries` ADD COLUMN `folder_name` VARCHAR(100) NULL AFTER `entry_name`");
        }
        if (!ccrm_column_exists($pdo, 'unified_entries', 'folder_modules_json')) {
            $pdo->exec("ALTER TABLE `unified_entries` ADD COLUMN `folder_modules_json` TEXT NULL AFTER `modules_json`");
        }
        if (!ccrm_column_exists($pdo, 'unified_entries', 'show_folder_summary')) {
            $pdo->exec("ALTER TABLE `unified_entries` ADD COLUMN `show_folder_summary` TINYINT(1) NOT NULL DEFAULT 0");
        }
        if (!ccrm_column_exists($pdo, 'unified_entries', 'warning_days')) {
            $pdo->exec("ALTER TABLE `unified_entries` ADD COLUMN `warning_days` INT NOT NULL DEFAULT 0");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'establishment_date')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `establishment_date` VARCHAR(50) NULL");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'legal_form')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `legal_form` VARCHAR(100) NULL");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'sk_nace')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `sk_nace` VARCHAR(50) NULL");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'organization_size')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `organization_size` VARCHAR(50) NULL");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'ownership_type')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `ownership_type` VARCHAR(50) NULL");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'data_source')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `data_source` VARCHAR(50) NULL");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'dissolution_date')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `dissolution_date` VARCHAR(50) NULL");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'region')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `region` VARCHAR(100) NULL");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'district')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `district` VARCHAR(100) NULL");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'financial_summary')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `financial_summary` LONGTEXT NULL");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'vat_validation_result')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `vat_validation_result` TEXT NULL");
        }
        if (!ccrm_column_exists($pdo, 'project_types', 'timeline_event_types_json')) {
            $pdo->exec("ALTER TABLE `project_types` ADD COLUMN `timeline_event_types_json` LONGTEXT NULL");
        }
        if (!ccrm_column_exists($pdo, 'project_types', 'timeline_attributes_json')) {
            $pdo->exec("ALTER TABLE `project_types` ADD COLUMN `timeline_attributes_json` LONGTEXT NULL");
        }
        if (!ccrm_column_exists($pdo, 'tasks', 'deadline_time')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `deadline_time` VARCHAR(5) NULL AFTER `deadline`");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'follow_ups')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `follow_ups` TEXT NULL");
        }
        // Free-text "what does the client want / what problem are we solving"
        // captured when the lead is created.
        if (!ccrm_column_exists($pdo, 'leads', 'interest_note')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `interest_note` TEXT NULL AFTER `ai_summary_fingerprint`");
        }
        // Which lead/client referred this one. The picker has existed in the UI
        // since the interest note shipped, but there was no column behind it, so
        // every referral looked saved and then vanished on the next poll.
        if (!ccrm_column_exists($pdo, 'leads', 'referral_lead_id')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `referral_lead_id` VARCHAR(50) NULL AFTER `interest_note`");
        }
        // Business-document timeline events (order, proforma invoice, advance
        // receipt, invoice, delivery note). MySQL silently truncates an unknown
        // ENUM value to '' (and errors out under strict mode), so the column has
        // to learn the new names before the client can push them.
        ccrm_migrate_timeline_event_types($pdo);
        // Several documents per timeline event (e.g. a batch of advance invoices).
        if (!ccrm_column_exists($pdo, 'timeline_events', 'attachments_json')) {
            $pdo->exec("ALTER TABLE `timeline_events` ADD COLUMN `attachments_json` TEXT NULL AFTER `file_type`");
        }
        // Mail-derived timeline events remember their direction. Without it every
        // message auto-filed from the mailbox — including the ones we sent from
        // the Sent folder — rendered with the "Incoming" badge.
        if (!ccrm_column_exists($pdo, 'timeline_events', 'is_outgoing')) {
            $pdo->exec("ALTER TABLE `timeline_events` ADD COLUMN `is_outgoing` TINYINT(1) NOT NULL DEFAULT 0 AFTER `extra_time`");
        }
        // Who did it. Every entry a person produced — a logged note, a sent mail,
        // a pipeline move — names the user behind it, so the history reads as
        // "who did what, when". Left NULL for entries nobody triggered here
        // (incoming mail, public-form inquiries) and for every event written
        // before the column existed; those simply render without a name.
        if (!ccrm_column_exists($pdo, 'timeline_events', 'author')) {
            $pdo->exec("ALTER TABLE `timeline_events` ADD COLUMN `author` VARCHAR(100) NULL AFTER `is_outgoing`");
        }
        // Voice notes logged straight onto a lead's timeline. api/upload_audio.php
        // stores the recording and hands back its path, but the timeline had
        // nowhere to keep that path: it only ever lived in the client's memory, so
        // the player appeared right after recording and then vanished the moment
        // the timeline was re-read from the DB.
        if (!ccrm_column_exists($pdo, 'timeline_events', 'audio_file')) {
            $pdo->exec("ALTER TABLE `timeline_events` ADD COLUMN `audio_file` VARCHAR(255) NULL AFTER `author`");
        }
        if (!ccrm_column_exists($pdo, 'timeline_events', 'transcription')) {
            $pdo->exec("ALTER TABLE `timeline_events` ADD COLUMN `transcription` TEXT NULL AFTER `audio_file`");
        }
        // `tasks`.`status` was originally a fixed ENUM, but task states are
        // user-customizable free text (see Settings > task states / taskStates
        // in App.tsx), same as `leads`.`status`. A custom state name that
        // doesn't match the old enum list (e.g. default "New") gets silently
        // truncated by MySQL, which errors out under strict mode. Widen it to
        // match the leads.status pattern.
        $statusType = $pdo->query(
            "SELECT DATA_TYPE FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'status'"
        )->fetchColumn();
        if ($statusType === 'enum') {
            $pdo->exec("ALTER TABLE `tasks` MODIFY COLUMN `status` VARCHAR(50) NOT NULL DEFAULT 'todo'");
        }
        if (!ccrm_column_exists($pdo, 'tasks', 'archived')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `archived` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_locking`");
        }
        if (!ccrm_column_exists($pdo, 'tasks', 'created_by')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `created_by` VARCHAR(100) NULL AFTER `owner`");
            // Before created_by existed, owner represented the assigned PM. Preserve
            // that responsibility in the junction table without pretending it was
            // reliable creator history.
            $pdo->exec(
                "INSERT IGNORE INTO `task_assignees` (`task_id`, `user_name`)
                 SELECT `id`, `owner` FROM `tasks` WHERE `owner` <> ''"
            );
        }
        // Completion attribution. Both fields used to live only in client memory, so
        // every sync round-trip dropped them and the archive rendered "Unknown" with
        // the deadline standing in for the completion time.
        if (!ccrm_column_exists($pdo, 'tasks', 'completed_by')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `completed_by` VARCHAR(100) NULL AFTER `archived`");
        }
        if (!ccrm_column_exists($pdo, 'tasks', 'completed_at')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `completed_at` VARCHAR(16) NULL AFTER `completed_by`");
        }
        ccrm_migrate_updated_at_precision($pdo);
        ccrm_migrate_task_states($pdo);
        ccrm_backfill_task_completion_attribution($pdo);
        ccrm_seed_default_financial_categories($pdo);
    }

    /**
     * Widen `timeline_events`.`type` so it accepts the event types added after
     * the initial release: the business documents, and `status_change` — the
     * entry a lead writes for itself whenever it moves to another pipeline
     * state. Idempotent: the ALTER only runs when one of the new names is
     * missing from the live ENUM definition.
     */
    function ccrm_migrate_timeline_event_types(PDO $pdo): void {
        $columnType = $pdo->query(
            "SELECT COLUMN_TYPE FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'timeline_events' AND COLUMN_NAME = 'type'"
        )->fetchColumn();
        if ($columnType === false || $columnType === null) {
            return; // timeline_events not provisioned yet — CREATE TABLE covers it.
        }
        $required = ['order', 'proforma_invoice', 'advance_receipt', 'invoice', 'delivery_note', 'status_change'];
        foreach ($required as $value) {
            if (strpos($columnType, "'" . $value . "'") === false) {
                $pdo->exec(
                    "ALTER TABLE `timeline_events` MODIFY COLUMN `type`
                     ENUM('phone', 'email', 'note', 'offer', 'appointment', 'order', 'proforma_invoice', 'advance_receipt', 'invoice', 'delivery_note', 'status_change')
                     NOT NULL DEFAULT 'note'"
                );
                return;
            }
        }
    }

    /**
     * Give `updated_at` millisecond precision on the tables sync.php version-checks.
     *
     * sync.php compares a row's updated_at against the client's baseSyncedAt to
     * decide whether an incoming write would revert an edit it never saw. At whole-
     * second precision — the MySQL default — two users saving inside the same second
     * produce identical timestamps, the check cannot tell them apart, and the later
     * push silently overwrites the earlier one. Milliseconds shrink that blind spot
     * from one second to roughly one millisecond.
     *
     * Cheap and non-destructive: TIMESTAMP → TIMESTAMP(3) only widens the stored
     * value, existing rows keep their time with .000 appended.
     */
    function ccrm_migrate_updated_at_precision(PDO $pdo): void {
        foreach (['leads', 'tasks', 'meeting_notes'] as $table) {
            try {
                $row = $pdo->query(
                    "SELECT `DATETIME_PRECISION` FROM `information_schema`.`COLUMNS`
                     WHERE `TABLE_SCHEMA` = DATABASE()
                       AND `TABLE_NAME` = " . $pdo->quote($table) . "
                       AND `COLUMN_NAME` = 'updated_at'"
                )->fetch(PDO::FETCH_ASSOC);
                if (!$row || (int) ($row['DATETIME_PRECISION'] ?? 0) >= 3) {
                    continue;
                }
                $pdo->exec(
                    "ALTER TABLE `{$table}` MODIFY `updated_at`
                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)"
                );
            } catch (\Throwable $e) {
                // A server too old for fractional seconds keeps whole-second
                // precision; sync.php's guard still works, just with the wider
                // same-second window. Never block the sync over this.
                if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
            }
        }
    }

    /**
     * Task states used to exist only as hardcoded English defaults in the
     * frontend — they were never seeded, so an installation in Slovak/Hungarian
     * still showed "New / In progress / Blocked / Done" in grey. Seed them once,
     * in the language the CRM was installed in, and carry existing task records
     * over to the localised labels so nothing loses its column on the board.
     */
    function ccrm_migrate_task_states(PDO $pdo): void {
        try {
            $existing = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'TASK_STATES'")->fetchColumn();
        } catch (\Throwable $e) {
            return; // system_settings not provisioned yet — nothing to migrate.
        }
        $decoded = is_string($existing) ? json_decode($existing, true) : null;
        if (is_array($decoded) && $decoded) {
            return; // Already configured by the operator; never touch their labels.
        }

        $language = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'")->fetchColumn();
        $lists = ccrm_default_lists(is_string($language) ? $language : 'sk');
        $taskStates = $lists['taskStates'];

        $insSet = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
        $insSet->execute(['TASK_STATES', json_encode($taskStates, JSON_UNESCAPED_UNICODE)]);
        $insSet->execute(['TASK_STATE_COLORS', json_encode(ccrm_default_task_state_colors($taskStates), JSON_UNESCAPED_UNICODE)]);

        // Every label a task could be carrying before this migration: the English
        // defaults the frontend shipped with, plus the legacy pre-1.0 slugs.
        $legacyByPosition = [
            0 => ['New', 'todo'],
            1 => ['In progress', 'in_progress'],
            2 => ['Blocked', 'blocked'],
            3 => ['Done', 'done'],
        ];
        $rename = $pdo->prepare("UPDATE `tasks` SET `status` = ? WHERE `status` = ?");
        foreach ($legacyByPosition as $index => $legacyLabels) {
            if (!isset($taskStates[$index])) continue;
            foreach ($legacyLabels as $legacy) {
                if ($legacy === $taskStates[$index]) continue;
                $rename->execute([$taskStates[$index], $legacy]);
            }
        }
    }

    /**
     * One-time, best-effort attribution for tasks completed before `completed_by`
     * was persisted (everything archived up to 1.6.41 shows "Unknown").
     *
     * The real completer was never recorded, so this is an ESTIMATE, not history.
     * It picks the most defensible name available, in order:
     *   1. `created_by` — who opened the task (NULL on pre-1.5 rows, which is why
     *      it cannot be the only source).
     *   2. `owner` — the primary assignee.
     *   3. any row in `task_assignees` — a secondary assignee.
     * Rows with none of the three keep NULL and go on rendering the neutral label.
     *
     * `completed_at` is deliberately NOT invented. That leaves backfilled rows as
     * the only ones with a completer but no timestamp, which is the signal the
     * archive uses to mark the name as estimated rather than recorded.
     *
     * Guarded by a settings marker so it runs exactly once: a task legitimately
     * reopened and left unfinished must not be re-stamped on the next sync.
     */
    function ccrm_backfill_task_completion_attribution(PDO $pdo): void {
        try {
            $done = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'TASK_COMPLETED_BY_BACKFILL'")->fetchColumn();
            if ($done !== false) {
                return; // Already run on this install.
            }

            // "Done" mirrors the frontend's isDoneState(): the literal 'done', or
            // whatever the operator named the last state in their own list.
            $statesRaw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'TASK_STATES'")->fetchColumn();
            $states = is_string($statesRaw) ? json_decode($statesRaw, true) : null;
            $lastState = (is_array($states) && $states) ? (string)end($states) : null;

            // COALESCE over the three candidate names; NULLIF keeps empty strings
            // from winning over a populated lower-priority column.
            $candidate = "COALESCE(NULLIF(t.`created_by`, ''), NULLIF(t.`owner`, ''), NULLIF(a.`user_name`, ''))";
            $sql =
                "UPDATE `tasks` t
                 LEFT JOIN (
                     SELECT `task_id`, MIN(`user_name`) AS `user_name`
                     FROM `task_assignees` GROUP BY `task_id`
                 ) a ON a.`task_id` = t.`id`
                 SET t.`completed_by` = $candidate
                 WHERE t.`completed_by` IS NULL
                   AND (LOWER(t.`status`) = 'done'" . ($lastState !== null ? " OR t.`status` = ?" : "") . ")
                   AND $candidate IS NOT NULL";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($lastState !== null ? [$lastState] : []);

            $mark = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
            $mark->execute(['TASK_COMPLETED_BY_BACKFILL', (string)$stmt->rowCount()]);
        } catch (\Throwable $e) {
            // Never block a sync over a cosmetic backfill.
            error_log('[ccrm schema] completed_by backfill skipped: ' . $e->getMessage());
        }
    }

    /**
     * Default, language-aware seed values for the customisable lists in
     * `system_settings`.
     *
     * These are PERSISTED values — they end up stored on lead and task records as
     * plain strings — so they must be written in the language chosen during
     * installation rather than translated at render time.
     */
    function ccrm_default_lists(string $language): array {
        if (!in_array($language, ['en', 'sk', 'hu'], true)) {
            $language = 'sk';
        }

        $byLanguage = [
            'en' => [
                'leadStates' => ['new', 'contacted', 'offer sent', 'accepted', 'rejected'],
                'leadSources' => ['showroom', 'facebook', 'instagram', 'website'],
                'leadCategories' => ['Products', 'Services'],
                'taskStates' => ['New', 'In progress', 'Blocked', 'Done'],
            ],
            'sk' => [
                'leadStates' => ['nový', 'kontaktovaný', 'ponuka odoslaná', 'prijatý', 'zamietnutý'],
                'leadSources' => ['showroom', 'facebook', 'instagram', 'web'],
                'leadCategories' => ['Produkty', 'Služby'],
                'taskStates' => ['Nový', 'Prebieha', 'Blokovaný', 'Hotovo'],
            ],
            'hu' => [
                'leadStates' => ['új', 'kapcsolatfelvétel', 'ajánlat elküldve', 'elfogadva', 'elutasítva'],
                'leadSources' => ['bemutatóterem', 'facebook', 'instagram', 'weboldal'],
                'leadCategories' => ['Termékek', 'Szolgáltatások'],
                'taskStates' => ['Új', 'Folyamatban', 'Blokkolva', 'Kész'],
            ],
        ];

        return $byLanguage[$language];
    }

    /**
     * Colour map for task states. Blue → amber → red → green reads as a natural
     * workflow; states beyond the fourth cycle through the same palette.
     */
    function ccrm_default_task_state_colors(array $taskStates): array {
        $palette = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#0ea5e9', '#ec4899', '#14b8a6'];
        $colors = [];
        foreach (array_values($taskStates) as $i => $state) {
            $colors[(string)$state] = $palette[$i % count($palette)];
        }
        return $colors;
    }

    /**
     * The full set of `system_settings` rows a fresh installation starts with,
     * seeded in the installation language. Shared by the setup wizard and the
     * "wipe demo data + reset configuration" reset so the two can never drift.
     */
    function ccrm_default_settings_for_language(string $language): array {
        if (!in_array($language, ['en', 'sk', 'hu'], true)) {
            $language = 'sk';
        }
        $lists = ccrm_default_lists($language);

        $leadStates = $lists['leadStates'];
        $leadSources = $lists['leadSources'];
        $leadCategories = $lists['leadCategories'];
        $taskStates = $lists['taskStates'];

        $enc = static function ($value): string {
            return json_encode($value, JSON_UNESCAPED_UNICODE);
        };

        return [
            'SYSTEM_NAME' => 'CCRM',
            'SYSTEM_LANGUAGE' => $language,
            'LEAD_STATES' => $enc($leadStates),
            'LEAD_SOURCES' => $enc($leadSources),
            'LEAD_CATEGORIES' => $enc($leadCategories),
            'LEAD_STATE_COLORS' => $enc(array_combine($leadStates, ['#3b82f6', '#0ea5e9', '#6366f1', '#10b981', '#ef4444'])),
            'LEAD_SOURCE_COLORS' => $enc(array_combine($leadSources, ['#10b981', '#3b82f6', '#ec4899', '#8b5cf6'])),
            'LEAD_CATEGORY_COLORS' => $enc(array_combine($leadCategories, ['#f59e0b', '#10b981'])),
            'LEAD_STAGE_GROUPS' => $enc(array_combine($leadStates, ['new', 'in_progress', 'in_progress', 'closed', 'closed'])),
            'LEAD_STATE_PARENTS' => $enc((object)[]),
            'TASK_STATES' => $enc($taskStates),
            'TASK_STATE_COLORS' => $enc(ccrm_default_task_state_colors($taskStates)),
        ];
    }

    /**
     * Seed default 3-level financial categories hierarchy for Incomes and Expenses.
     */
    function ccrm_default_financial_categories(string $language): array {
        if (!in_array($language, ['en', 'sk', 'hu'], true)) {
            $language = 'sk';
        }

        if ($language === 'en') {
            return [
                // Incomes (Level 1)
                ['id' => 'fc-inc-sales', 'type' => 'income', 'name' => 'Sales of Goods & Materials', 'parent_id' => null, 'level' => 1, 'color' => '#10b981', 'icon' => 'Package'],
                ['id' => 'fc-inc-slabs', 'type' => 'income', 'name' => 'Laminam Ceramic Slabs', 'parent_id' => 'fc-inc-sales', 'level' => 2, 'color' => '#059669', 'icon' => 'Layers'],
                ['id' => 'fc-inc-slabs-3', 'type' => 'income', 'name' => 'LAM 3+ (approx 80 €/m²)', 'parent_id' => 'fc-inc-slabs', 'level' => 3, 'color' => '#34d399', 'icon' => 'Circle'],
                ['id' => 'fc-inc-slabs-5', 'type' => 'income', 'name' => 'LAM 5+ (approx 90 €/m²)', 'parent_id' => 'fc-inc-slabs', 'level' => 3, 'color' => '#10b981', 'icon' => 'Circle'],
                ['id' => 'fc-inc-slabs-12', 'type' => 'income', 'name' => 'LAM 12+ (approx 250 €/m²)', 'parent_id' => 'fc-inc-slabs', 'level' => 3, 'color' => '#047857', 'icon' => 'Circle'],
                ['id' => 'fc-inc-supplements', 'type' => 'income', 'name' => 'Adhesives & Accessories', 'parent_id' => 'fc-inc-sales', 'level' => 2, 'color' => '#6ee7b7', 'icon' => 'Box'],
                ['id' => 'fc-inc-services', 'type' => 'income', 'name' => 'Installation & Realization Services', 'parent_id' => null, 'level' => 1, 'color' => '#3b82f6', 'icon' => 'Wrench'],
                ['id' => 'fc-inc-assembly', 'type' => 'income', 'name' => 'Assembly & Tiling Works', 'parent_id' => 'fc-inc-services', 'level' => 2, 'color' => '#2563eb', 'icon' => 'Hammer'],
                ['id' => 'fc-inc-logistics', 'type' => 'income', 'name' => 'Transport & Crane Logistics', 'parent_id' => 'fc-inc-services', 'level' => 2, 'color' => '#60a5fa', 'icon' => 'Truck'],
                ['id' => 'fc-inc-other', 'type' => 'income', 'name' => 'Other Financial Incomes', 'parent_id' => null, 'level' => 1, 'color' => '#8b5cf6', 'icon' => 'Coins'],

                // Expenses (Level 1)
                ['id' => 'fc-exp-cogs', 'type' => 'expense', 'name' => 'COGS - Direct Material Purchases (ELÁBÉ)', 'parent_id' => null, 'level' => 1, 'color' => '#ef4444', 'icon' => 'Package'],
                ['id' => 'fc-exp-mat-lam', 'type' => 'expense', 'name' => 'Laminam Material Purchase (Italy)', 'parent_id' => 'fc-exp-cogs', 'level' => 2, 'color' => '#dc2626', 'icon' => 'Layers'],
                ['id' => 'fc-exp-mat-lam3', 'type' => 'expense', 'name' => 'Material LAM 3+', 'parent_id' => 'fc-exp-mat-lam', 'level' => 3, 'color' => '#f87171', 'icon' => 'Circle'],
                ['id' => 'fc-exp-mat-lam5', 'type' => 'expense', 'name' => 'Material LAM 5+', 'parent_id' => 'fc-exp-mat-lam', 'level' => 3, 'color' => '#ef4444', 'icon' => 'Circle'],
                ['id' => 'fc-exp-mat-lam12', 'type' => 'expense', 'name' => 'Material LAM 12+', 'parent_id' => 'fc-exp-mat-lam', 'level' => 3, 'color' => '#b91c1c', 'icon' => 'Circle'],
                ['id' => 'fc-exp-mat-pack', 'type' => 'expense', 'name' => 'Packaging & Pallets', 'parent_id' => 'fc-exp-cogs', 'level' => 2, 'color' => '#fca5a5', 'icon' => 'Box'],
                ['id' => 'fc-exp-freight', 'type' => 'expense', 'name' => 'International Freight & Transport', 'parent_id' => 'fc-exp-cogs', 'level' => 2, 'color' => '#ea580c', 'icon' => 'Truck'],
                ['id' => 'fc-exp-marketing', 'type' => 'expense', 'name' => 'Marketing & Advertising', 'parent_id' => null, 'level' => 1, 'color' => '#f59e0b', 'icon' => 'Megaphone'],
                ['id' => 'fc-exp-mkt-online', 'type' => 'expense', 'name' => 'Online Ads & Performance', 'parent_id' => 'fc-exp-marketing', 'level' => 2, 'color' => '#d97706', 'icon' => 'Globe'],
                ['id' => 'fc-exp-mkt-meta', 'type' => 'expense', 'name' => 'Meta FB / IG Ads', 'parent_id' => 'fc-exp-mkt-online', 'level' => 3, 'color' => '#fbbf24', 'icon' => 'Share2'],
                ['id' => 'fc-exp-mkt-google', 'type' => 'expense', 'name' => 'Google Ads', 'parent_id' => 'fc-exp-mkt-online', 'level' => 3, 'color' => '#f59e0b', 'icon' => 'Search'],
                ['id' => 'fc-exp-mkt-seo', 'type' => 'expense', 'name' => 'SEO Optimization', 'parent_id' => 'fc-exp-mkt-online', 'level' => 3, 'color' => '#b45309', 'icon' => 'TrendingUp'],
                ['id' => 'fc-exp-mkt-creative', 'type' => 'expense', 'name' => 'Agency, Graphic & Copywriting', 'parent_id' => 'fc-exp-marketing', 'level' => 2, 'color' => '#fb923c', 'icon' => 'PenTool'],
                ['id' => 'fc-exp-payroll', 'type' => 'expense', 'name' => 'Payroll & Subcontractors', 'parent_id' => null, 'level' => 1, 'color' => '#8b5cf6', 'icon' => 'Users'],
                ['id' => 'fc-exp-pay-exec', 'type' => 'expense', 'name' => 'Executive & Management Salary', 'parent_id' => 'fc-exp-payroll', 'level' => 2, 'color' => '#7c3aed', 'icon' => 'Briefcase'],
                ['id' => 'fc-exp-pay-staff', 'type' => 'expense', 'name' => 'Staff & Assemblers Payroll', 'parent_id' => 'fc-exp-payroll', 'level' => 2, 'color' => '#6d28d9', 'icon' => 'UserCheck'],
                ['id' => 'fc-exp-pay-comm', 'type' => 'expense', 'name' => 'Sales & Partner Commissions', 'parent_id' => 'fc-exp-payroll', 'level' => 2, 'color' => '#a78bfa', 'icon' => 'Percent'],
                ['id' => 'fc-exp-overhead', 'type' => 'expense', 'name' => 'Overhead, Facility & Rent', 'parent_id' => null, 'level' => 1, 'color' => '#0891b2', 'icon' => 'Building'],
                ['id' => 'fc-exp-ovh-rent', 'type' => 'expense', 'name' => 'Showroom & Warehouse Rent', 'parent_id' => 'fc-exp-overhead', 'level' => 2, 'color' => '#0e7490', 'icon' => 'Home'],
                ['id' => 'fc-exp-ovh-util', 'type' => 'expense', 'name' => 'Utilities & Office Accounting', 'parent_id' => 'fc-exp-overhead', 'level' => 2, 'color' => '#06b6d4', 'icon' => 'FileText'],
                ['id' => 'fc-exp-ovh-sec', 'type' => 'expense', 'name' => 'Security & Insurance', 'parent_id' => 'fc-exp-overhead', 'level' => 2, 'color' => '#67e8f9', 'icon' => 'Shield']
            ];
        }

        if ($language === 'hu') {
            return [
                // Incomes (Level 1)
                ['id' => 'fc-inc-sales', 'type' => 'income', 'name' => 'Termék- és anyagértékesítés', 'parent_id' => null, 'level' => 1, 'color' => '#10b981', 'icon' => 'Package'],
                ['id' => 'fc-inc-slabs', 'type' => 'income', 'name' => 'Laminam kerámia lapok', 'parent_id' => 'fc-inc-sales', 'level' => 2, 'color' => '#059669', 'icon' => 'Layers'],
                ['id' => 'fc-inc-slabs-3', 'type' => 'income', 'name' => 'LAM 3+ (kb. 80 €/m²)', 'parent_id' => 'fc-inc-slabs', 'level' => 3, 'color' => '#34d399', 'icon' => 'Circle'],
                ['id' => 'fc-inc-slabs-5', 'type' => 'income', 'name' => 'LAM 5+ (kb. 90 €/m²)', 'parent_id' => 'fc-inc-slabs', 'level' => 3, 'color' => '#10b981', 'icon' => 'Circle'],
                ['id' => 'fc-inc-slabs-12', 'type' => 'income', 'name' => 'LAM 12+ (kb. 250 €/m²)', 'parent_id' => 'fc-inc-slabs', 'level' => 3, 'color' => '#047857', 'icon' => 'Circle'],
                ['id' => 'fc-inc-supplements', 'type' => 'income', 'name' => 'Kiegészítő anyagok és ragasztók', 'parent_id' => 'fc-inc-sales', 'level' => 2, 'color' => '#6ee7b7', 'icon' => 'Box'],
                ['id' => 'fc-inc-services', 'type' => 'income', 'name' => 'Szolgáltatások és kivitelezés', 'parent_id' => null, 'level' => 1, 'color' => '#3b82f6', 'icon' => 'Wrench'],
                ['id' => 'fc-inc-assembly', 'type' => 'income', 'name' => 'Beépítés és burkolási munkák', 'parent_id' => 'fc-inc-services', 'level' => 2, 'color' => '#2563eb', 'icon' => 'Hammer'],
                ['id' => 'fc-inc-logistics', 'type' => 'income', 'name' => 'Szállítás és logisztika', 'parent_id' => 'fc-inc-services', 'level' => 2, 'color' => '#60a5fa', 'icon' => 'Truck'],
                ['id' => 'fc-inc-other', 'type' => 'income', 'name' => 'Egyéb bevételek', 'parent_id' => null, 'level' => 1, 'color' => '#8b5cf6', 'icon' => 'Coins'],

                // Expenses (Level 1)
                ['id' => 'fc-exp-cogs', 'type' => 'expense', 'name' => 'ELÁBÉ - Közvetlen anyagbeszerzés', 'parent_id' => null, 'level' => 1, 'color' => '#ef4444', 'icon' => 'Package'],
                ['id' => 'fc-exp-mat-lam', 'type' => 'expense', 'name' => 'Laminam anyagbeszerzés (Olaszország)', 'parent_id' => 'fc-exp-cogs', 'level' => 2, 'color' => '#dc2626', 'icon' => 'Layers'],
                ['id' => 'fc-exp-mat-lam3', 'type' => 'expense', 'name' => 'Anyag LAM 3+', 'parent_id' => 'fc-exp-mat-lam', 'level' => 3, 'color' => '#f87171', 'icon' => 'Circle'],
                ['id' => 'fc-exp-mat-lam5', 'type' => 'expense', 'name' => 'Anyag LAM 5+', 'parent_id' => 'fc-exp-mat-lam', 'level' => 3, 'color' => '#ef4444', 'icon' => 'Circle'],
                ['id' => 'fc-exp-mat-lam12', 'type' => 'expense', 'name' => 'Anyag LAM 12+', 'parent_id' => 'fc-exp-mat-lam', 'level' => 3, 'color' => '#b91c1c', 'icon' => 'Circle'],
                ['id' => 'fc-exp-mat-pack', 'type' => 'expense', 'name' => 'Raklapok és csomagolóanyag', 'parent_id' => 'fc-exp-cogs', 'level' => 2, 'color' => '#fca5a5', 'icon' => 'Box'],
                ['id' => 'fc-exp-freight', 'type' => 'expense', 'name' => 'Fuvar és kamionos szállítás', 'parent_id' => 'fc-exp-cogs', 'level' => 2, 'color' => '#ea580c', 'icon' => 'Truck'],
                ['id' => 'fc-exp-marketing', 'type' => 'expense', 'name' => 'Marketing és hirdetés', 'parent_id' => null, 'level' => 1, 'color' => '#f59e0b', 'icon' => 'Megaphone'],
                ['id' => 'fc-exp-mkt-online', 'type' => 'expense', 'name' => 'Online hirdetések', 'parent_id' => 'fc-exp-marketing', 'level' => 2, 'color' => '#d97706', 'icon' => 'Globe'],
                ['id' => 'fc-exp-mkt-meta', 'type' => 'expense', 'name' => 'Meta FB / IG hirdetés', 'parent_id' => 'fc-exp-mkt-online', 'level' => 3, 'color' => '#fbbf24', 'icon' => 'Share2'],
                ['id' => 'fc-exp-mkt-google', 'type' => 'expense', 'name' => 'Google Ads', 'parent_id' => 'fc-exp-mkt-online', 'level' => 3, 'color' => '#f59e0b', 'icon' => 'Search'],
                ['id' => 'fc-exp-mkt-seo', 'type' => 'expense', 'name' => 'SEO optimalizáció', 'parent_id' => 'fc-exp-mkt-online', 'level' => 3, 'color' => '#b45309', 'icon' => 'TrendingUp'],
                ['id' => 'fc-exp-mkt-creative', 'type' => 'expense', 'name' => 'Ügynökség, grafika és szövegírás', 'parent_id' => 'fc-exp-marketing', 'level' => 2, 'color' => '#fb923c', 'icon' => 'PenTool'],
                ['id' => 'fc-exp-payroll', 'type' => 'expense', 'name' => 'Munkabér és jutalékok', 'parent_id' => null, 'level' => 1, 'color' => '#8b5cf6', 'icon' => 'Users'],
                ['id' => 'fc-exp-pay-exec', 'type' => 'expense', 'name' => 'Vezér bére', 'parent_id' => 'fc-exp-payroll', 'level' => 2, 'color' => '#7c3aed', 'icon' => 'Briefcase'],
                ['id' => 'fc-exp-pay-staff', 'type' => 'expense', 'name' => 'Munkatársak és szerelők bére', 'parent_id' => 'fc-exp-payroll', 'level' => 2, 'color' => '#6d28d9', 'icon' => 'UserCheck'],
                ['id' => 'fc-exp-pay-comm', 'type' => 'expense', 'name' => 'Értékesítési jutalékok és partnerek', 'parent_id' => 'fc-exp-payroll', 'level' => 2, 'color' => '#a78bfa', 'icon' => 'Percent'],
                ['id' => 'fc-exp-overhead', 'type' => 'expense', 'name' => 'Rezsi és bérleti díj', 'parent_id' => null, 'level' => 1, 'color' => '#0891b2', 'icon' => 'Building'],
                ['id' => 'fc-exp-ovh-rent', 'type' => 'expense', 'name' => 'Showroom és raktár bérleti díj', 'parent_id' => 'fc-exp-overhead', 'level' => 2, 'color' => '#0e7490', 'icon' => 'Home'],
                ['id' => 'fc-exp-ovh-util', 'type' => 'expense', 'name' => 'Irodai rezsi, utazás és könyvelés', 'parent_id' => 'fc-exp-overhead', 'level' => 2, 'color' => '#06b6d4', 'icon' => 'FileText'],
                ['id' => 'fc-exp-ovh-sec', 'type' => 'expense', 'name' => 'Biztonsági szolgálat és biztosítás', 'parent_id' => 'fc-exp-overhead', 'level' => 2, 'color' => '#67e8f9', 'icon' => 'Shield']
            ];
        }

        // Slovak (default)
        return [
            // Incomes (Level 1)
            ['id' => 'fc-inc-sales', 'type' => 'income', 'name' => 'Predaj tovaru a materiálu', 'parent_id' => null, 'level' => 1, 'color' => '#10b981', 'icon' => 'Package'],
            ['id' => 'fc-inc-slabs', 'type' => 'income', 'name' => 'Laminam keramické dosky', 'parent_id' => 'fc-inc-sales', 'level' => 2, 'color' => '#059669', 'icon' => 'Layers'],
            ['id' => 'fc-inc-slabs-3', 'type' => 'income', 'name' => 'Dosky LAM 3+ (cca 80 €/m²)', 'parent_id' => 'fc-inc-slabs', 'level' => 3, 'color' => '#34d399', 'icon' => 'Circle'],
            ['id' => 'fc-inc-slabs-5', 'type' => 'income', 'name' => 'Dosky LAM 5+ (cca 90 €/m²)', 'parent_id' => 'fc-inc-slabs', 'level' => 3, 'color' => '#10b981', 'icon' => 'Circle'],
            ['id' => 'fc-inc-slabs-12', 'type' => 'income', 'name' => 'Dosky LAM 12+ (cca 250 €/m²)', 'parent_id' => 'fc-inc-slabs', 'level' => 3, 'color' => '#047857', 'icon' => 'Circle'],
            ['id' => 'fc-inc-supplements', 'type' => 'income', 'name' => 'Doplnkový materiál a lepidlá', 'parent_id' => 'fc-inc-sales', 'level' => 2, 'color' => '#6ee7b7', 'icon' => 'Box'],
            ['id' => 'fc-inc-services', 'type' => 'income', 'name' => 'Služby a realizácie', 'parent_id' => null, 'level' => 1, 'color' => '#3b82f6', 'icon' => 'Wrench'],
            ['id' => 'fc-inc-assembly', 'type' => 'income', 'name' => 'Montážne a obkladačské práce', 'parent_id' => 'fc-inc-services', 'level' => 2, 'color' => '#2563eb', 'icon' => 'Hammer'],
            ['id' => 'fc-inc-logistics', 'type' => 'income', 'name' => 'Doprava a logistika', 'parent_id' => 'fc-inc-services', 'level' => 2, 'color' => '#60a5fa', 'icon' => 'Truck'],
            ['id' => 'fc-inc-other', 'type' => 'income', 'name' => 'Ostatné príjmy', 'parent_id' => null, 'level' => 1, 'color' => '#8b5cf6', 'icon' => 'Coins'],

            // Expenses (Level 1)
            ['id' => 'fc-exp-cogs', 'type' => 'expense', 'name' => 'ELÁBÉ - Priamy nákup tovaru a materiálu', 'parent_id' => null, 'level' => 1, 'color' => '#ef4444', 'icon' => 'Package'],
            ['id' => 'fc-exp-mat-lam', 'type' => 'expense', 'name' => 'Nákup materiálu Laminam (Taliansko)', 'parent_id' => 'fc-exp-cogs', 'level' => 2, 'color' => '#dc2626', 'icon' => 'Layers'],
            ['id' => 'fc-exp-mat-lam3', 'type' => 'expense', 'name' => 'Materiál LAM 3+', 'parent_id' => 'fc-exp-mat-lam', 'level' => 3, 'color' => '#f87171', 'icon' => 'Circle'],
            ['id' => 'fc-exp-mat-lam5', 'type' => 'expense', 'name' => 'Materiál LAM 5+', 'parent_id' => 'fc-exp-mat-lam', 'level' => 3, 'color' => '#ef4444', 'icon' => 'Circle'],
            ['id' => 'fc-exp-mat-lam12', 'type' => 'expense', 'name' => 'Materiál LAM 12+', 'parent_id' => 'fc-exp-mat-lam', 'level' => 3, 'color' => '#b91c1c', 'icon' => 'Circle'],
            ['id' => 'fc-exp-mat-pack', 'type' => 'expense', 'name' => 'Palety a obalový materiál', 'parent_id' => 'fc-exp-cogs', 'level' => 2, 'color' => '#fca5a5', 'icon' => 'Box'],
            ['id' => 'fc-exp-freight', 'type' => 'expense', 'name' => 'Kamiónová preprava a clo', 'parent_id' => 'fc-exp-cogs', 'level' => 2, 'color' => '#ea580c', 'icon' => 'Truck'],
            ['id' => 'fc-exp-marketing', 'type' => 'expense', 'name' => 'Marketing a reklama', 'parent_id' => null, 'level' => 1, 'color' => '#f59e0b', 'icon' => 'Megaphone'],
            ['id' => 'fc-exp-mkt-online', 'type' => 'expense', 'name' => 'Online reklama a výkon', 'parent_id' => 'fc-exp-marketing', 'level' => 2, 'color' => '#d97706', 'icon' => 'Globe'],
            ['id' => 'fc-exp-mkt-meta', 'type' => 'expense', 'name' => 'Meta FB / IG reklama', 'parent_id' => 'fc-exp-mkt-online', 'level' => 3, 'color' => '#fbbf24', 'icon' => 'Share2'],
            ['id' => 'fc-exp-mkt-google', 'type' => 'expense', 'name' => 'Google Ads', 'parent_id' => 'fc-exp-mkt-online', 'level' => 3, 'color' => '#f59e0b', 'icon' => 'Search'],
            ['id' => 'fc-exp-mkt-seo', 'type' => 'expense', 'name' => 'SEO optimalizácia webu', 'parent_id' => 'fc-exp-mkt-online', 'level' => 3, 'color' => '#b45309', 'icon' => 'TrendingUp'],
            ['id' => 'fc-exp-mkt-creative', 'type' => 'expense', 'name' => 'Agentúra, grafika a copywriting', 'parent_id' => 'fc-exp-marketing', 'level' => 2, 'color' => '#fb923c', 'icon' => 'PenTool'],
            ['id' => 'fc-exp-payroll', 'type' => 'expense', 'name' => 'Mzdové náklady a provízie', 'parent_id' => null, 'level' => 1, 'color' => '#8b5cf6', 'icon' => 'Users'],
            ['id' => 'fc-exp-pay-exec', 'type' => 'expense', 'name' => 'Vedenie a manažment (Vezér bére)', 'parent_id' => 'fc-exp-payroll', 'level' => 2, 'color' => '#7c3aed', 'icon' => 'Briefcase'],
            ['id' => 'fc-exp-pay-staff', 'type' => 'expense', 'name' => 'Montážnici, technici a skladníci', 'parent_id' => 'fc-exp-payroll', 'level' => 2, 'color' => '#6d28d9', 'icon' => 'UserCheck'],
            ['id' => 'fc-exp-pay-comm', 'type' => 'expense', 'name' => 'Provízie architektom a predajcom', 'parent_id' => 'fc-exp-payroll', 'level' => 2, 'color' => '#a78bfa', 'icon' => 'Percent'],
            ['id' => 'fc-exp-overhead', 'type' => 'expense', 'name' => 'Prevádzková réžia a priestory', 'parent_id' => null, 'level' => 1, 'color' => '#0891b2', 'icon' => 'Building'],
            ['id' => 'fc-exp-ovh-rent', 'type' => 'expense', 'name' => 'Nájom showroomu a skladu', 'parent_id' => 'fc-exp-overhead', 'level' => 2, 'color' => '#0e7490', 'icon' => 'Home'],
            ['id' => 'fc-exp-ovh-util', 'type' => 'expense', 'name' => 'Energie, cestovné a účtovníctvo', 'parent_id' => 'fc-exp-overhead', 'level' => 2, 'color' => '#06b6d4', 'icon' => 'FileText'],
            ['id' => 'fc-exp-ovh-sec', 'type' => 'expense', 'name' => 'Bezpečnostná služba a poistenie', 'parent_id' => 'fc-exp-overhead', 'level' => 2, 'color' => '#67e8f9', 'icon' => 'Shield']
        ];
    }

    /**
     * Seeds default financial categories into financial_categories table if table exists and is empty.
     */
    function ccrm_seed_default_financial_categories(PDO $pdo): void {
        try {
            $hasTable = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'financial_categories'")->fetchColumn();
            if ($hasTable === 0) return;

            $count = (int)$pdo->query("SELECT COUNT(*) FROM `financial_categories`")->fetchColumn();
            if ($count > 0) return;

            $systemLanguage = 'sk';
            $stmtLang = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'");
            if ($stmtLang && ($val = $stmtLang->fetchColumn()) !== false) {
                if (in_array($val, ['en', 'sk', 'hu'], true)) {
                    $systemLanguage = $val;
                }
            }

            $categories = ccrm_default_financial_categories($systemLanguage);
            $ins = $pdo->prepare("INSERT INTO `financial_categories` (`id`, `type`, `name`, `parent_id`, `level`, `color`, `icon`) VALUES (?, ?, ?, ?, ?, ?, ?)");
            foreach ($categories as $c) {
                $ins->execute([$c['id'], $c['type'], $c['name'], $c['parent_id'], $c['level'], $c['color'], $c['icon']]);
            }
        } catch (\Throwable $e) {
            error_log('[ccrm schema] financial categories seed skipped: ' . $e->getMessage());
        }
    }

    /**
     * Create all tables (idempotent) and apply in-place migrations.
     */
    function ccrm_apply_schema(PDO $pdo): void {
        foreach (ccrm_schema_statements() as $sql) {
            $pdo->exec($sql);
        }
        ccrm_apply_migrations($pdo);
    }
}

