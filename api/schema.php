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

require_once __DIR__ . '/employee_name.php';

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
              `role` VARCHAR(100) NOT NULL DEFAULT 'Viewer',
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
              `role` VARCHAR(100) NOT NULL,
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
              `traffic_origin` VARCHAR(50) NULL COMMENT 'Channel that first brought the visitor to the site (facebook, instagram, google, direct, ...) - reported by the web form, not chosen in the CRM',
              `traffic_origin_detail` VARCHAR(255) NULL COMMENT 'Free-text detail for traffic_origin: medium, campaign, referring host, landing page',
              `owner` VARCHAR(100) NOT NULL COMMENT 'Assigned Project Manager Name',
              `division` VARCHAR(100) NULL COMMENT 'Assigned Division (e.g. Cstudios, Cstudios Budapest)',
              `value` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Estimated Opportunity Worth',
              `adjustment` DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'Client Value Adjustment',
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
              `client_id` VARCHAR(50) NULL COMMENT 'The client record (a client-* row) this lead belongs to. Not a foreign key, for the same reason as referral_lead_id; the app falls back to matching by name when it is empty or points at a deleted row',
              `metadata_json` TEXT NULL COMMENT 'Plugin support',
              `vat_validation_result` TEXT NULL,
              `follow_ups` TEXT NULL COMMENT 'JSON map: {stateKey: YYYY-MM-DD} of completed follow-ups',
              `client_category_id` VARCHAR(50) NULL COMMENT 'client_categories.id - not a foreign key, the app clears it when a category is deleted',
              `ticket_allowed_emails` TEXT NULL COMMENT 'JSON array of whitelisted sender emails/domains for support tickets',
              `archived` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Archived from the client register',
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
              `hidden` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'mail entries only: removed from the lead timeline by the user; kept so the mailbox importer does not file it again',
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
              `related_project_id` VARCHAR(50) NULL COMMENT 'Project the task belongs to; NULL when it has none',
              `workflow_id` VARCHAR(50) NULL COMMENT 'Automation that created this task; NULL for hand-made ones',
              `is_locking` TINYINT(1) NOT NULL DEFAULT 0,
              `archived` TINYINT(1) NOT NULL DEFAULT 0,
              `completed_by` VARCHAR(100) NULL COMMENT 'Name of the user who moved the task to a done state; NULL for legacy rows',
              `completed_at` VARCHAR(16) NULL COMMENT 'YYYY-MM-DD HH:MM local completion timestamp; NULL for legacy rows',
              `email_reminders_json` TEXT NULL COMMENT 'Per-user e-mail reminder choice, JSON: user name to morning, 1h or 1d',
              `requires_conclusion` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = the task cannot be completed until conclusion is written',
              `conclusion` TEXT NULL COMMENT 'How the task was finished; written when it is completed',
              `metadata_json` TEXT NULL COMMENT 'Plugin support',
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              FOREIGN KEY (`related_lead_id`) REFERENCES `leads` (`id`) ON DELETE SET NULL,
              INDEX idx_task_status (`status`),
              INDEX idx_task_deadline (`deadline`),
              INDEX idx_task_project (`related_project_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Task Assignees
            "CREATE TABLE IF NOT EXISTS `task_assignees` (
              `task_id` VARCHAR(50) NOT NULL,
              `user_name` VARCHAR(100) NOT NULL,
              PRIMARY KEY (`task_id`, `user_name`),
              FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Task e-mail reminders already sent. One row per task, recipient and
            // the moment the reminder was due, so rescheduling a task earns a new
            // reminder while a repeated cron run never sends the same one twice.
            "CREATE TABLE IF NOT EXISTS `task_reminder_log` (
              `task_id` VARCHAR(50) NOT NULL,
              `user_name` VARCHAR(100) NOT NULL,
              `scheduled_for` VARCHAR(16) NOT NULL COMMENT 'YYYY-MM-DD HH:MM local time the reminder was due',
              `status` VARCHAR(10) NOT NULL DEFAULT 'sent' COMMENT 'sent | failed',
              `error` VARCHAR(500) NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (`task_id`, `user_name`, `scheduled_for`),
              FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Tags
            "CREATE TABLE IF NOT EXISTS `tags` (
              `id` VARCHAR(50) NOT NULL,
              `name` VARCHAR(100) NOT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              UNIQUE KEY `idx_tag_name` (`name`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Task Tags (Relational linking)
            "CREATE TABLE IF NOT EXISTS `task_tags` (
              `task_id` VARCHAR(50) NOT NULL,
              `tag_name` VARCHAR(100) NOT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (`task_id`, `tag_name`),
              INDEX `idx_task_tag_name` (`tag_name`),
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

            // "Remember me" tokens: one row per remembered browser. Only the SHA-256 of
            // the cookie's validator is stored. Kept in step with
            // ccrm_remember_ensure_table() in api/auth.php, which creates it lazily for
            // the auth endpoints that do not load this file. Runs on every schema apply
            // (CREATE TABLE IF NOT EXISTS), so it doubles as the migration for existing databases.
            "CREATE TABLE IF NOT EXISTS `user_remember_tokens` (
              `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
              `user_id` VARCHAR(50) NOT NULL,
              `selector` CHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
              `validator_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'SHA-256 of the validator in the cookie',
              `prev_validator_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'Validator before the last rotation, accepted for a short grace window',
              `rotated_at` DATETIME NULL,
              `created_at` DATETIME NOT NULL,
              `expires_at` DATETIME NOT NULL,
              `last_used_at` DATETIME NULL,
              `user_agent` VARCHAR(255) NULL COMMENT 'For display and audit only',
              PRIMARY KEY (`id`),
              UNIQUE KEY `uniq_remember_selector` (`selector`),
              INDEX `idx_remember_user` (`user_id`),
              INDEX `idx_remember_expires` (`expires_at`)
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
              `has_deadline` TINYINT(1) NOT NULL DEFAULT 0,
              `has_invoice_date` TINYINT(1) NOT NULL DEFAULT 0,
              `deadline_warning_days` INT NOT NULL DEFAULT 0,
              `deadline_required` TINYINT(1) NOT NULL DEFAULT 0,
              `has_files` TINYINT(1) NOT NULL DEFAULT 0,
              `has_tickets` TINYINT(1) NOT NULL DEFAULT 0,
              `file_fields_json` LONGTEXT NULL,
              `timeline_event_types_json` LONGTEXT NULL,
              `timeline_attributes_json` LONGTEXT NULL,
              `list_columns_json` LONGTEXT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Projects (Base common table)
            "CREATE TABLE IF NOT EXISTS `projects` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `project_type_id` VARCHAR(50) NOT NULL,
              `name` VARCHAR(200) NULL,
              `lead_id` VARCHAR(50) NULL,
              `client_id` VARCHAR(50) NULL,
              `status` VARCHAR(50) NOT NULL DEFAULT 'active',
              `division` VARCHAR(100) NULL COMMENT 'Assigned Division (e.g. Cstudios, Cstudios Budapest)',
              `rating` TINYINT NULL COMMENT 'Star Rating 1-5, 0 = not rated, NULL = never set',
              `invoice_date` DATE NULL COMMENT 'Invoice date (shown as Invoice date in the UI)',
              `completion_deadline` DATE NULL COMMENT 'Date the project has to be completed by (shown as Deadline in the UI)',
              `delay_reason` VARCHAR(500) NULL,
              `start_date` DATE NULL,
              `finished_at` DATE NULL,
              `budget` DECIMAL(14,2) NULL,
              `value` DECIMAL(14,2) NULL COMMENT 'Project Contract Value / Invoicable',
              `custom_files_json` LONGTEXT NULL,
              `ticket_widget_enabled` TINYINT(1) NOT NULL DEFAULT 0,
              `ticket_allowed_domains` TEXT NULL COMMENT 'JSON array of whitelisted hostnames',
              `ticket_allowed_emails` TEXT NULL COMMENT 'JSON array of whitelisted sender emails/domains',
              `ticket_public_hash` VARCHAR(64) NULL UNIQUE COMMENT 'Cryptographically random unguessable token for public ticket status URL',
              `ticket_widget_config_json` TEXT NULL COMMENT 'JSON config for floating widget color, position, greeting, language',
              `archived` TINYINT(1) NOT NULL DEFAULT 0,
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

            // Licence held by THIS installation. At most one row, `id` pinned to
            // 1 by the primary key: one install, one licence.
            //
            // `token` is the only authoritative column — a base64url claim plus
            // the vendor's signature over it. Everything beside it is a
            // denormalised copy of what that claim says, kept so the settings
            // screen and ad-hoc SQL can read the licence without verifying a
            // signature. Nothing decides anything from those copies: every read
            // path re-verifies the token (see api/license_client.php), so editing
            // `expires_at` here changes a display value and not the licence.
            "CREATE TABLE IF NOT EXISTS `licenses` (
              `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
              `license_key` VARCHAR(64) NOT NULL,
              `instance_id` VARCHAR(64) NOT NULL COMMENT 'Install this token was issued for',
              `token` TEXT NOT NULL COMMENT 'base64url(claim).base64url(signature) — the authority',
              `status` VARCHAR(20) NOT NULL DEFAULT 'unknown' COMMENT 'Last status the vendor stated',
              `expires_at` DATE NULL,
              `max_users` INT NULL COMMENT 'Seat ceiling, NULL for unlimited',
              `customer` VARCHAR(190) NULL,
              `plan` VARCHAR(60) NULL,
              `issued_at` DATETIME NULL COMMENT 'When the vendor signed this token',
              `activated_by` VARCHAR(50) NULL COMMENT 'users.id of whoever entered the key',
              `activated_at` DATETIME NULL,
              `last_check_at` DATETIME NULL COMMENT 'Last SUCCESSFUL licence-server check',
              `last_attempt_at` DATETIME NULL COMMENT 'Last attempt, successful or not (throttle)',
              `last_error` VARCHAR(255) NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Rate-limit ledger for licence activation attempts. Activation takes
            // a key typed by a human, so it is a guessing surface like a login
            // form; without this an admin session could grind the vendor's key
            // space (and the vendor's server) from inside a customer install.
            "CREATE TABLE IF NOT EXISTS `license_attempts` (
              `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
              `ip` VARCHAR(45) NULL,
              `user_id` VARCHAR(50) NULL,
              `outcome` VARCHAR(30) NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              INDEX `idx_license_attempt_time` (`created_at`),
              INDEX `idx_license_attempt_ip_time` (`ip`, `created_at`)
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
              `default_sell_price` DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
              `avg_purchase_price` DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
              `last_purchase_price` DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              INDEX `idx_item_sku` (`sku`),
              INDEX `idx_item_category` (`category`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Warehouse Stock (Stav zásob podľa skladov)
            "CREATE TABLE IF NOT EXISTS `warehouse_stock` (
              `warehouse_id` VARCHAR(50) NOT NULL,
              `item_id` VARCHAR(50) NOT NULL,
              `quantity` DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
              `reserved_quantity` DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
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
              `initial_quantity` DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
              `current_quantity` DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
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
              `quantity` DECIMAL(15,4) NOT NULL,
              `unit_purchase_price` DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
              `unit_sell_price` DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
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
              `sort_order` INT NOT NULL DEFAULT 0,
              `color` VARCHAR(30) NULL,
              `icon` VARCHAR(50) NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_fc_type (`type`),
              INDEX idx_fc_parent (`parent_id`),
              INDEX idx_fc_level (`level`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Client Categories (3-level customer category tree, the finance tree's shape without a type)
            "CREATE TABLE IF NOT EXISTS `client_categories` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `name` VARCHAR(150) NOT NULL,
              `parent_id` VARCHAR(50) NULL,
              `level` INT NOT NULL DEFAULT 1,
              `sort_order` INT NOT NULL DEFAULT 0,
              `color` VARCHAR(30) NULL,
              `icon` VARCHAR(50) NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_cc_parent (`parent_id`),
              INDEX idx_cc_level (`level`)
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
              `recurring_planned_end_date` DATE NULL COMMENT 'The end date a paused rule really has, restored on resume (a pause stamps recurring_end_date with today)',
              `recurring_amount_history_json` TEXT NULL COMMENT 'Superseded amounts of a recurring rule: [{until, amountPlanned, amountReal}]',
              `recurring_skipped_dates_json` TEXT NULL COMMENT 'Scheduled days a stored movement stands in for, as a JSON list of YYYY-MM-DD days',
              `recurring_source_id` VARCHAR(50) NULL COMMENT 'On a one-off movement: the recurring rule whose charge it replaces',
              `recurring_occurrence_date` DATE NULL COMMENT 'On a one-off movement: the scheduled day it stands in for',
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
              `status` VARCHAR(50) NOT NULL DEFAULT 'draft' COMMENT 'Price offers: a key of OFFER_STATUSES. Proformas and invoices: draft, sent, approved, rejected, invoiced, cancelled',
              `status_changed_at` DATE NULL COMMENT 'Day the status last changed (client-stamped)',
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
              `quantity` DECIMAL(15,4) NOT NULL DEFAULT 1.0000,
              `unit` VARCHAR(20) NOT NULL DEFAULT 'ks',
              `unit_price` DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // MCP Personal API Keys (Prístupové kľúče pre AI agentov)
            "CREATE TABLE IF NOT EXISTS `mcp_keys` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `user_id` VARCHAR(50) NOT NULL,
              `key_hash` VARCHAR(64) NOT NULL UNIQUE,
              `key_prefix` VARCHAR(20) NOT NULL,
              `name` VARCHAR(100) NOT NULL DEFAULT 'Personal AI Assistant',
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `last_used_at` TIMESTAMP NULL,
              `revoked_at` TIMESTAMP NULL,
              INDEX idx_mcp_user (`user_id`),
              INDEX idx_mcp_hash (`key_hash`),
              FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Web Push Subscriptions (Browser & Mobile PWA push endpoints)
            "CREATE TABLE IF NOT EXISTS `push_subscriptions` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `user_id` VARCHAR(50) NULL,
              `user_name` VARCHAR(100) NULL,
              `user_email` VARCHAR(150) NULL,
              `endpoint` TEXT NOT NULL,
              `endpoint_hash` VARCHAR(64) NOT NULL UNIQUE,
              `p256dh` VARCHAR(255) NOT NULL,
              `auth` VARCHAR(255) NOT NULL,
              `user_agent` VARCHAR(255) NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_ps_user_id (`user_id`),
              INDEX idx_ps_user_name (`user_name`),
              INDEX idx_ps_user_email (`user_email`),
              INDEX idx_ps_hash (`endpoint_hash`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Employees (Staff profile, contracts, salary rate, Toggl mapping)
            "CREATE TABLE IF NOT EXISTS `employees` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `name` VARCHAR(150) NOT NULL COMMENT 'Display name: first + last name, or the company / item name',
              `first_name` VARCHAR(100) NULL,
              `last_name` VARCHAR(100) NULL,
              `kind` VARCHAR(20) NOT NULL DEFAULT 'employee' COMMENT 'employee | contractor | ledger',
              `company_id` VARCHAR(32) NULL COMMENT 'IČO of an external supplier',
              `tax_id` VARCHAR(32) NULL COMMENT 'DIČ of an external supplier',
              `vat_id` VARCHAR(32) NULL COMMENT 'IČ DPH of an external supplier',
              `position` VARCHAR(100) NULL COMMENT 'Job title, not the app permission role',
              `department` VARCHAR(100) NULL,
              `user_id` VARCHAR(50) NULL UNIQUE,
              `pin` VARCHAR(50) NULL COMMENT 'Personal identification number / Rodné číslo / Tax ID',
              `email` VARCHAR(150) NULL,
              `phone` VARCHAR(50) NULL,
              `address_street` VARCHAR(255) NULL,
              `address_city` VARCHAR(100) NULL,
              `address_zip` VARCHAR(20) NULL,
              `address_country` VARCHAR(100) NULL DEFAULT 'Slovakia',
              `salary_type` ENUM('monthly', 'daily', 'hourly') NOT NULL DEFAULT 'monthly',
              `salary_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
              `salary_due_day` INT NULL COMMENT 'Payout day of month (1-31) or week (1-7)',
              `vacation_allowances_json` TEXT NULL,
              `time_tracking_provider` VARCHAR(50) NOT NULL DEFAULT 'toggl',
              `time_tracking_user_id` VARCHAR(100) NULL,
              `time_tracking_user_name` VARCHAR(150) NULL,
              `auto_expense` TINYINT(1) NOT NULL DEFAULT 0,
              `expense_category_id` VARCHAR(50) NULL,
              `files_json` LONGTEXT NULL,
              `is_active` TINYINT(1) NOT NULL DEFAULT 1,
              `notes` TEXT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_emp_active (`is_active`),
              INDEX idx_emp_name (`name`),
              CONSTRAINT fk_employees_user_id FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Employee Salaries & Payouts (Monthly / Weekly payroll records)
            "CREATE TABLE IF NOT EXISTS `employee_salaries` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `employee_id` VARCHAR(50) NOT NULL,
              `period_type` ENUM('monthly', 'weekly') NOT NULL DEFAULT 'monthly',
              `period_key` VARCHAR(20) NOT NULL COMMENT 'e.g. 2026-09 or 2026-W39',
              `year` INT NOT NULL,
              `period_number` INT NOT NULL COMMENT 'Month 1-12 or Week 1-53',
              `items_json` TEXT NOT NULL COMMENT 'Array of { categoryId, categoryName, salary, paid }',
              `total_salary` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
              `total_paid` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
              `status` ENUM('pending', 'partially_paid', 'paid') NOT NULL DEFAULT 'pending',
              `due_date` DATE NULL,
              `payment_date` DATE NULL,
              `payment_method` VARCHAR(50) NULL DEFAULT 'bank_transfer',
              `financial_record_id` VARCHAR(50) NULL,
              `note` TEXT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_sal_emp (`employee_id`),
              INDEX idx_sal_period (`period_key`),
              INDEX idx_sal_year (`year`),
              UNIQUE KEY uk_emp_period (`employee_id`, `period_key`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Employee Vacations & Absences
            "CREATE TABLE IF NOT EXISTS `employee_vacations` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `employee_id` VARCHAR(50) NOT NULL,
              `vacation_type_id` VARCHAR(50) NOT NULL,
              `start_date` DATE NOT NULL,
              `end_date` DATE NOT NULL,
              `days_count` DECIMAL(5, 1) NOT NULL DEFAULT 1.0,
              `status` ENUM('requested', 'approved', 'rejected', 'taken', 'pending') NOT NULL DEFAULT 'approved',
              `note` TEXT NULL,
              `approved_by` VARCHAR(100) NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_vac_emp (`employee_id`),
              INDEX idx_vac_dates (`start_date`, `end_date`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Orders (E-shop & Commercial Orders)
            "CREATE TABLE IF NOT EXISTS `orders` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `order_number` VARCHAR(100) NOT NULL UNIQUE,
              `type` ENUM('sales', 'purchase') NOT NULL DEFAULT 'sales' COMMENT 'sales = odberateľská/eshop, purchase = dodávateľská',
              `status` VARCHAR(50) NOT NULL DEFAULT 'new' COMMENT 'Customizable status key from orderStatuses setting',
              `customer_type` ENUM('client', 'guest') NOT NULL DEFAULT 'client' COMMENT 'client = registrovaný lead/klient, guest = nákup bez registrácie',
              `client_id` VARCHAR(50) NULL COMMENT 'References leads.id for registered sales clients',
              `supplier_id` VARCHAR(50) NULL COMMENT 'References suppliers.id for purchase orders',
              `guest_name` VARCHAR(255) NULL,
              `guest_email` VARCHAR(255) NULL,
              `guest_phone` VARCHAR(50) NULL,
              `guest_company` VARCHAR(255) NULL,
              `guest_ico` VARCHAR(50) NULL,
              `guest_dic` VARCHAR(50) NULL,
              `guest_ic_dph` VARCHAR(50) NULL,
              `delivery_recipient` VARCHAR(255) NULL,
              `delivery_street` VARCHAR(255) NULL,
              `delivery_city` VARCHAR(100) NULL,
              `delivery_zip` VARCHAR(20) NULL,
              `delivery_country` VARCHAR(10) NOT NULL DEFAULT 'SK',
              `delivery_phone` VARCHAR(50) NULL,
              `delivery_notes` TEXT NULL,
              `shipping_method` VARCHAR(100) NULL,
              `shipping_pickup_point_id` VARCHAR(100) NULL,
              `shipping_tracking_number` VARCHAR(100) NULL,
              `billing_name` VARCHAR(255) NULL,
              `billing_street` VARCHAR(255) NULL,
              `billing_city` VARCHAR(100) NULL,
              `billing_zip` VARCHAR(20) NULL,
              `billing_country` VARCHAR(10) NOT NULL DEFAULT 'SK',
              `billing_ico` VARCHAR(50) NULL,
              `billing_dic` VARCHAR(50) NULL,
              `billing_ic_dph` VARCHAR(50) NULL,
              `payment_method` VARCHAR(100) NULL,
              `payment_status` ENUM('unpaid', 'paid', 'partially_paid', 'refunded') NOT NULL DEFAULT 'unpaid',
              `paid_at` DATETIME NULL,
              `payment_reference` VARCHAR(100) NULL,
              `invoice_id` VARCHAR(50) NULL,
              `invoice_number` VARCHAR(100) NULL,
              `invoice_issued_at` DATETIME NULL,
              `currency` VARCHAR(10) NOT NULL DEFAULT 'EUR',
              `items_net_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
              `services_net_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
              `total_net_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
              `total_tax_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
              `total_gross_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
              `order_date` DATE NOT NULL,
              `requested_delivery_date` DATE NULL,
              `confirmed_delivery_date` DATE NULL,
              `warehouse_id` VARCHAR(50) NULL,
              `notes` TEXT NULL,
              `customer_note` TEXT NULL,
              `created_by` VARCHAR(100) NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_orders_type_status (`type`, `status`),
              INDEX idx_orders_customer_type (`customer_type`),
              INDEX idx_orders_client (`client_id`),
              INDEX idx_orders_supplier (`supplier_id`),
              INDEX idx_orders_date (`order_date`),
              INDEX idx_orders_payment_status (`payment_status`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Order Items (Products & Additional Services)
            "CREATE TABLE IF NOT EXISTS `order_items` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `order_id` VARCHAR(50) NOT NULL,
              `item_type` ENUM('product', 'service') NOT NULL DEFAULT 'product' COMMENT 'product = skladový tovar, service = doplnková služba',
              `item_id` VARCHAR(50) NULL COMMENT 'References warehouse_items.id for products',
              `sku` VARCHAR(100) NULL,
              `ean` VARCHAR(50) NULL,
              `name` VARCHAR(255) NOT NULL,
              `variant_title` VARCHAR(100) NULL,
              `quantity` DECIMAL(12,2) NOT NULL DEFAULT 1.00,
              `unit` VARCHAR(20) NOT NULL DEFAULT 'ks',
              `unit_price` DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
              `discount_percent` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
              `tax_rate` DECIMAL(5,2) NOT NULL DEFAULT 20.00,
              `total_net_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
              `total_gross_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
              `fulfilled_quantity` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `service_code` VARCHAR(50) NULL,
              `notes` VARCHAR(255) NULL,
              `sort_order` INT NOT NULL DEFAULT 0,
              INDEX idx_order_items_order (`order_id`),
              INDEX idx_order_items_item (`item_id`),
              INDEX idx_order_items_type (`item_type`),
              CONSTRAINT fk_order_items_order FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Support Contracts (SLA Tiers & Monthly Support Hours)
            "CREATE TABLE IF NOT EXISTS `support_contracts` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `client_id` VARCHAR(50) NULL COMMENT 'References leads.id',
              `project_id` VARCHAR(50) NULL COMMENT 'References projects.id',
              `tier` ENUM('basic', 'pro', 'enterprise', 'project_only') NOT NULL DEFAULT 'basic',
              `monthly_hours` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
              `hourly_rate` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
              `sla_response_critical_hours` DECIMAL(5,2) NOT NULL DEFAULT 1.00,
              `sla_response_high_hours` DECIMAL(5,2) NOT NULL DEFAULT 4.00,
              `sla_response_normal_hours` DECIMAL(5,2) NOT NULL DEFAULT 8.00,
              `sla_response_low_hours` DECIMAL(5,2) NOT NULL DEFAULT 24.00,
              `sla_resolve_critical_hours` DECIMAL(6,2) NOT NULL DEFAULT 4.00,
              `sla_resolve_high_hours` DECIMAL(6,2) NOT NULL DEFAULT 16.00,
              `sla_resolve_normal_hours` DECIMAL(6,2) NOT NULL DEFAULT 40.00,
              `sla_resolve_low_hours` DECIMAL(6,2) NOT NULL DEFAULT 120.00,
              `valid_from` DATE NULL,
              `valid_until` DATE NULL,
              `notes` TEXT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX `idx_sc_client` (`client_id`),
              INDEX `idx_sc_project` (`project_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Tickets (Support & Bug Tracking)
            "CREATE TABLE IF NOT EXISTS `tickets` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `ticket_number` VARCHAR(30) NOT NULL UNIQUE COMMENT 'e.g. TCK-000142',
              `title` VARCHAR(500) NOT NULL,
              `description` LONGTEXT NULL,
              `status` VARCHAR(50) NOT NULL DEFAULT 'new' COMMENT 'Customizable status key from TICKET_STATUSES setting',
              `priority` ENUM('critical', 'high', 'normal', 'low') NOT NULL DEFAULT 'normal',
              `type` VARCHAR(50) NOT NULL DEFAULT 'question',
              `source` VARCHAR(50) NOT NULL DEFAULT 'manual',
              `project_id` VARCHAR(50) NULL COMMENT 'References projects.id',
              `client_id` VARCHAR(50) NULL COMMENT 'References leads.id (auto-inherited from project if project has lead_id/client_id)',
              `reporter_name` VARCHAR(200) NULL,
              `reporter_email` VARCHAR(255) NULL,
              `reporter_phone` VARCHAR(50) NULL,
              `assignee_id` VARCHAR(50) NULL COMMENT 'References users.id',
              `assignee_name` VARCHAR(100) NULL COMMENT 'Assignee display name',
              `watchers_json` TEXT NULL COMMENT 'JSON array of user IDs/names',
              `tags_json` TEXT NULL COMMENT 'JSON array of tag strings',
              `metadata_json` LONGTEXT NULL COMMENT 'JSON: widget runtime errors, console logs, URL, userAgent, viewport, AI triage info',
              `attachments_json` LONGTEXT NULL COMMENT 'JSON array of {name, size, path, type}',
              `email_message_id` VARCHAR(255) NULL COMMENT 'RFC Message-ID for email threading',
              `first_response_due_at` DATETIME NULL,
              `first_responded_at` DATETIME NULL,
              `resolve_due_at` DATETIME NULL,
              `sla_paused_at` DATETIME NULL,
              `sla_paused_seconds` INT NOT NULL DEFAULT 0,
              `resolved_at` DATETIME NULL,
              `closed_at` DATETIME NULL,
              `satisfaction_score` TINYINT NULL COMMENT '1-5 CSAT score',
              `satisfaction_comment` TEXT NULL,
              `archived` TINYINT(1) NOT NULL DEFAULT 0,
              `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX `idx_tickets_project` (`project_id`),
              INDEX `idx_tickets_client` (`client_id`),
              INDEX `idx_tickets_status_prio` (`status`, `priority`),
              INDEX `idx_tickets_assignee` (`assignee_id`),
              INDEX `idx_tickets_email_msgid` (`email_message_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Ticket Messages (Public Replies, Internal Notes, System Events)
            "CREATE TABLE IF NOT EXISTS `ticket_messages` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `ticket_id` VARCHAR(50) NOT NULL,
              `author_type` ENUM('client', 'agent', 'system') NOT NULL DEFAULT 'agent',
              `author_user_id` VARCHAR(50) NULL,
              `author_name` VARCHAR(200) NULL,
              `author_email` VARCHAR(255) NULL,
              `is_internal` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = private team note, 0 = public reply',
              `event_type` VARCHAR(50) NULL DEFAULT NULL,
              `body` LONGTEXT NOT NULL,
              `attachments_json` LONGTEXT NULL COMMENT 'JSON array of {name, size, path, type}',
              `email_message_id` VARCHAR(255) NULL,
              `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              INDEX `idx_tm_ticket` (`ticket_id`, `created_at`),
              CONSTRAINT `fk_tm_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Ticket <-> Task Links (Bidirectional synchronization)
            "CREATE TABLE IF NOT EXISTS `ticket_task_links` (
              `ticket_id` VARCHAR(50) NOT NULL,
              `task_id` VARCHAR(50) NOT NULL,
              `sync_mode` ENUM('auto_resolve', 'manual') NOT NULL DEFAULT 'auto_resolve',
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (`ticket_id`, `task_id`),
              INDEX `idx_ttl_task` (`task_id`),
              CONSTRAINT `fk_ttl_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE,
              CONSTRAINT `fk_ttl_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Ticket Time Entries (Billable & Non-billable support hours)
            "CREATE TABLE IF NOT EXISTS `ticket_time_entries` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `ticket_id` VARCHAR(50) NOT NULL,
              `user_id` VARCHAR(50) NULL,
              `user_name` VARCHAR(100) NOT NULL,
              `minutes` INT NOT NULL DEFAULT 0,
              `billable` TINYINT(1) NOT NULL DEFAULT 1,
              `note` VARCHAR(500) NULL,
              `logged_at` DATE NOT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              INDEX `idx_tte_ticket` (`ticket_id`),
              INDEX `idx_tte_logged` (`logged_at`),
              CONSTRAINT `fk_tte_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
        ];
    }

    /**
     * True if $column exists on $table in the current database.
     */
    function ccrm_table_exists(PDO $pdo, string $table): bool {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?");
        $stmt->execute([$table]);
        return (int)$stmt->fetchColumn() > 0;
    }

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
        // Several steps below ALTER `orders`; a database that predates the table
        // would otherwise fatal on the first one.
        ccrm_migrate_orders($pdo);
        // Project contract / invoicable value
        if (!ccrm_column_exists($pdo, 'projects', 'value')) {
            $pdo->exec("ALTER TABLE `projects` ADD COLUMN `value` DECIMAL(14,2) NULL COMMENT 'Project Contract Value / Invoicable' AFTER `budget`");
        }
        // Sessions established before this timestamp are rejected, so a password
        // change can retire every session the old password could reach. NULL means
        // "no password change recorded yet" and lets existing sessions continue.
        if (!ccrm_column_exists($pdo, 'users', 'sessions_valid_from')) {
            $pdo->exec("ALTER TABLE `users` ADD COLUMN `sessions_valid_from` DATETIME NULL AFTER `password_hash`");
        }
        // Finance categories are ordered by hand (drag & drop in the categories
        // tab). Existing rows all start at 0 and keep their alphabetical order.
        if (!ccrm_column_exists($pdo, 'financial_categories', 'sort_order')) {
            $pdo->exec("ALTER TABLE `financial_categories` ADD COLUMN `sort_order` INT NOT NULL DEFAULT 0 AFTER `level`");
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
        // A task can belong to a project and show in that project's Tasks tab.
        // No foreign key: deleting a project clears the link in sync.php
        // instead, so the task itself survives on the Tasks board.
        if (!ccrm_column_exists($pdo, 'tasks', 'related_project_id')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `related_project_id` VARCHAR(50) NULL AFTER `related_lead_id`");
            $pdo->exec("ALTER TABLE `tasks` ADD INDEX idx_task_project (`related_project_id`)");
        }
        if (!ccrm_column_exists($pdo, 'tasks', 'related_ticket_id')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `related_ticket_id` VARCHAR(64) NULL AFTER `related_project_id`");
            $pdo->exec("ALTER TABLE `tasks` ADD INDEX idx_task_ticket (`related_ticket_id`)");
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
        if (!ccrm_column_exists($pdo, 'orders', 'invoice_id')) {
            $pdo->exec("ALTER TABLE `orders` ADD COLUMN `invoice_id` VARCHAR(50) NULL AFTER `payment_reference`");
        }
        if (!ccrm_column_exists($pdo, 'orders', 'invoice_number')) {
            $pdo->exec("ALTER TABLE `orders` ADD COLUMN `invoice_number` VARCHAR(100) NULL AFTER `invoice_id`");
        }
        if (!ccrm_column_exists($pdo, 'orders', 'invoice_issued_at')) {
            $pdo->exec("ALTER TABLE `orders` ADD COLUMN `invoice_issued_at` DATETIME NULL AFTER `invoice_number`");
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
        // A project type can be time-boxed: its projects carry a deadline and the
        // list counts down to it, warning `deadline_warning_days` days ahead.
        // Both default to off, so existing types are untouched.
        if (!ccrm_column_exists($pdo, 'project_types', 'has_deadline')) {
            $pdo->exec("ALTER TABLE `project_types` ADD COLUMN `has_deadline` TINYINT(1) NOT NULL DEFAULT 0 AFTER `has_gantt`");
        }
        // The invoice date is its own switch, apart from the deadline. Types that
        // were time-boxed when it was split off keep showing the date they had.
        if (!ccrm_column_exists($pdo, 'project_types', 'has_invoice_date')) {
            $pdo->exec("ALTER TABLE `project_types` ADD COLUMN `has_invoice_date` TINYINT(1) NOT NULL DEFAULT 0 AFTER `has_deadline`");
            $pdo->exec("UPDATE `project_types` SET `has_invoice_date` = `has_deadline`");
        }
        if (!ccrm_column_exists($pdo, 'project_types', 'deadline_warning_days')) {
            $pdo->exec("ALTER TABLE `project_types` ADD COLUMN `deadline_warning_days` INT NOT NULL DEFAULT 0 AFTER `has_deadline`");
        }
        // Built-in attribute settings: whether the deadline must be filled in, and
        // the "Files" attribute — named document slots (contract, GDPR, ...) whose
        // uploads live in the type's proj_data_ table like any files attribute.
        if (!ccrm_column_exists($pdo, 'project_types', 'deadline_required')) {
            $pdo->exec("ALTER TABLE `project_types` ADD COLUMN `deadline_required` TINYINT(1) NOT NULL DEFAULT 0 AFTER `deadline_warning_days`");
        }
        if (!ccrm_column_exists($pdo, 'project_types', 'has_files')) {
            $pdo->exec("ALTER TABLE `project_types` ADD COLUMN `has_files` TINYINT(1) NOT NULL DEFAULT 0 AFTER `deadline_required`");
        }
        if (!ccrm_column_exists($pdo, 'project_types', 'file_fields_json')) {
            $pdo->exec("ALTER TABLE `project_types` ADD COLUMN `file_fields_json` LONGTEXT NULL AFTER `has_files`");
        }
        // How the projects list is laid out for this type: which columns it
        // shows, in which order, its own attributes included. NULL means the
        // type has never been arranged and reads as the default layout, so
        // every existing type keeps exactly the table it has today.
        if (!ccrm_column_exists($pdo, 'project_types', 'list_columns_json')) {
            $pdo->exec("ALTER TABLE `project_types` ADD COLUMN `list_columns_json` LONGTEXT NULL AFTER `file_fields_json`");
        }
        // Projects had no name of their own — they borrowed the paired lead's,
        // which left an unpaired project unnameable. NULL on every existing row,
        // and projectDisplayName() keeps showing the lead's name for those.
        if (!ccrm_column_exists($pdo, 'projects', 'name')) {
            $pdo->exec("ALTER TABLE `projects` ADD COLUMN `name` VARCHAR(200) NULL AFTER `project_type_id`");
        }
        // 1.11.160: `deadline` was always the date the project is invoiced, which
        // the UI now says out loud - the column follows (data kept). The real
        // "Deadline" is a column of its own, `completion_deadline`.
        if (!ccrm_column_exists($pdo, 'projects', 'invoice_date')) {
            if (ccrm_column_exists($pdo, 'projects', 'deadline')) {
                $pdo->exec("ALTER TABLE `projects` CHANGE COLUMN `deadline` `invoice_date` DATE NULL");
            } else {
                $pdo->exec("ALTER TABLE `projects` ADD COLUMN `invoice_date` DATE NULL AFTER `status`");
            }
        }
        if (!ccrm_column_exists($pdo, 'projects', 'completion_deadline')) {
            $pdo->exec("ALTER TABLE `projects` ADD COLUMN `completion_deadline` DATE NULL AFTER `invoice_date`");
        }
        // A project past its deadline must say why. NULL on every existing row,
        // which is exactly what an unexplained delay looks like to the client.
        if (!ccrm_column_exists($pdo, 'projects', 'delay_reason')) {
            $pdo->exec("ALTER TABLE `projects` ADD COLUMN `delay_reason` VARCHAR(500) NULL AFTER `completion_deadline`");
        }
        // When the project really started and really finished, set by hand. NULL
        // start reads as the creation date on the client; a set finish date
        // outranks the planned deadline everywhere the project is listed.
        if (!ccrm_column_exists($pdo, 'projects', 'start_date')) {
            $pdo->exec("ALTER TABLE `projects` ADD COLUMN `start_date` DATE NULL AFTER `delay_reason`");
        }
        if (!ccrm_column_exists($pdo, 'projects', 'finished_at')) {
            $pdo->exec("ALTER TABLE `projects` ADD COLUMN `finished_at` DATE NULL AFTER `start_date`");
        }
        // What the project may spend. NULL is "no budget set", which the finance
        // tab shows as a prompt to set one rather than as a zero ceiling.
        if (!ccrm_column_exists($pdo, 'projects', 'budget')) {
            $pdo->exec("ALTER TABLE `projects` ADD COLUMN `budget` DECIMAL(14,2) NULL AFTER `delay_reason`");
        }
        // File slots added on one project only, with their uploads, as one JSON
        // list. The type's default slots keep their own columns in proj_data_*.
        if (!ccrm_column_exists($pdo, 'projects', 'custom_files_json')) {
            $pdo->exec("ALTER TABLE `projects` ADD COLUMN `custom_files_json` LONGTEXT NULL AFTER `budget`");
        }
        // 1.9.56: the project's own 1-5 star priority, the same one a lead
        // carries. NULL on every existing row — "never rated", which the client
        // shows as an empty row of stars rather than as one star.
        if (!ccrm_column_exists($pdo, 'projects', 'rating')) {
            $pdo->exec("ALTER TABLE `projects` ADD COLUMN `rating` TINYINT NULL AFTER `status`");
        }
        // 1.11.87: Project archiving from active projects register
        if (!ccrm_column_exists($pdo, 'projects', 'archived')) {
            $pdo->exec("ALTER TABLE `projects` ADD COLUMN `archived` TINYINT(1) NOT NULL DEFAULT 0 AFTER `custom_files_json`");
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
        // Which client record a lead belongs to. Until now that was decided by name
        // alone, so two people of one name shared a client and a rename detached a
        // lead. Existing rows are linked once, right after the column appears, and
        // only where nothing contradicts the match (see lead_client_backfill.php);
        // `php ccrm backfill-clients --dry-run` lists what was left out.
        if (!ccrm_column_exists($pdo, 'leads', 'client_id')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `client_id` VARCHAR(50) NULL AFTER `referral_lead_id`, ADD INDEX idx_lead_client (`client_id`)");
            require_once __DIR__ . '/lead_client_backfill.php';
            $backfill = ccrm_backfill_lead_client_ids($pdo, true);
            error_log(sprintf(
                'CCRM: linked %d lead(s) to their client; %d group(s) left unlinked as ambiguous (php ccrm backfill-clients --dry-run lists them).',
                $backfill['linked'],
                count($backfill['ambiguous_groups'])
            ));
        }
        // 1.9.26: where the visitor came from before they filled in the form
        // (facebook, instagram, google, direct...). Written by api/pipeline.php
        // only; the app shows it and never edits it.
        if (!ccrm_column_exists($pdo, 'leads', 'traffic_origin')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `traffic_origin` VARCHAR(50) NULL AFTER `source`");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'traffic_origin_detail')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `traffic_origin_detail` VARCHAR(255) NULL AFTER `traffic_origin`");
        }
        // 1.9.32: customer categories and archiving in the client register.
        if (!ccrm_column_exists($pdo, 'leads', 'client_category_id')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `client_category_id` VARCHAR(50) NULL");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'archived')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `archived` TINYINT(1) NOT NULL DEFAULT 0");
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
        // A mail entry cannot simply be deleted from a lead's timeline: the next
        // mailbox read would file the message again. Deleting it flags the row
        // instead, and both sync.php and the importer honour the flag.
        if (!ccrm_column_exists($pdo, 'timeline_events', 'hidden')) {
            $pdo->exec("ALTER TABLE `timeline_events` ADD COLUMN `hidden` TINYINT(1) NOT NULL DEFAULT 0 AFTER `transcription`");
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
        // "Notify me by e-mail" on a task: which users asked for a reminder and
        // when. Sent by api/task_reminders.php through the system SMTP profile.
        if (!ccrm_column_exists($pdo, 'tasks', 'email_reminders_json')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `email_reminders_json` TEXT NULL AFTER `completed_at`");
        }
        // "Requires conclusion": a task flagged with it cannot be completed until
        // the person finishing it has written how it went (the conclusion).
        if (!ccrm_column_exists($pdo, 'tasks', 'requires_conclusion')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `requires_conclusion` TINYINT(1) NOT NULL DEFAULT 0 AFTER `email_reminders_json`");
        }
        if (!ccrm_column_exists($pdo, 'tasks', 'conclusion')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `conclusion` TEXT NULL AFTER `requires_conclusion`");
        }
        // A recurring rule is stored as one row, so the reports derive every past
        // charge from the rule itself. Raising the price used to rewrite the months
        // already paid at the old one; the superseded amounts now travel with the
        // rule. Existing rows migrate as NULL, which reads as "always charged what
        // it charges today" — exactly the behaviour they had before.
        if (!ccrm_column_exists($pdo, 'financial_records', 'recurring_amount_history_json')) {
            $pdo->exec("ALTER TABLE `financial_records` ADD COLUMN `recurring_amount_history_json` TEXT NULL AFTER `recurring_end_date`");
        }
        // A pause stamps `recurring_end_date` with today and remembers the end
        // date the rule really had here, so resuming can restore it. The field
        // existed in the app before it had a column: pausing a rule with a
        // planned end and reloading used to make it open-ended on resume.
        if (!ccrm_column_exists($pdo, 'financial_records', 'recurring_planned_end_date')) {
            $pdo->exec("ALTER TABLE `financial_records` ADD COLUMN `recurring_planned_end_date` DATE NULL AFTER `recurring_end_date`");
        }
        // One charge of a recurring rule can be edited on its own: the edit is
        // stored as a one-off movement pointing back at the rule and the day it
        // stands in for, and the rule lists that day among those it no longer
        // charges. Existing rows migrate as NULL: nothing replaced, nothing skipped.
        if (!ccrm_column_exists($pdo, 'financial_records', 'recurring_skipped_dates_json')) {
            $pdo->exec("ALTER TABLE `financial_records` ADD COLUMN `recurring_skipped_dates_json` TEXT NULL AFTER `recurring_amount_history_json`");
        }
        if (!ccrm_column_exists($pdo, 'financial_records', 'recurring_source_id')) {
            $pdo->exec("ALTER TABLE `financial_records` ADD COLUMN `recurring_source_id` VARCHAR(50) NULL AFTER `recurring_skipped_dates_json`");
        }
        if (!ccrm_column_exists($pdo, 'financial_records', 'recurring_occurrence_date')) {
            $pdo->exec("ALTER TABLE `financial_records` ADD COLUMN `recurring_occurrence_date` DATE NULL AFTER `recurring_source_id`");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'division')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `division` VARCHAR(100) NULL AFTER `owner`");
        }
        if (!ccrm_column_exists($pdo, 'leads', 'adjustment')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `adjustment` DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `value`");
        }
        if (!ccrm_column_exists($pdo, 'projects', 'division')) {
            $pdo->exec("ALTER TABLE `projects` ADD COLUMN `division` VARCHAR(100) NULL AFTER `status`");
        }
        // Employees: link to user login
        if (!ccrm_column_exists($pdo, 'employees', 'user_id')) {
            $hasEmp = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees'")->fetchColumn();
            if ($hasEmp > 0) {
                $pdo->exec("ALTER TABLE `employees` ADD COLUMN `user_id` VARCHAR(50) NULL AFTER `name`, ADD UNIQUE INDEX `uq_employees_user_id` (`user_id`), ADD CONSTRAINT `fk_employees_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL");
            }
        }
        ccrm_migrate_employee_identity($pdo);
        ccrm_migrate_employee_company_ids($pdo);
        ccrm_migrate_updated_at_precision($pdo);
        ccrm_migrate_task_states($pdo);
        ccrm_migrate_list_ids($pdo);
        ccrm_migrate_invoice_status_changed_at($pdo);
        ccrm_migrate_invoice_status_varchar($pdo);
        ccrm_migrate_warehouse_item_fields($pdo);
        ccrm_migrate_quantity_precision($pdo);
        ccrm_backfill_task_completion_attribution($pdo);
        ccrm_seed_default_financial_categories($pdo);
        // The ENUM must be widened before anything inserts a 'pending' vacation.
        ccrm_migrate_vacation_status_pending($pdo);
        ccrm_seed_default_employees($pdo);
        ccrm_repair_demo_employee_vacations($pdo);
        ccrm_migrate_user_role_varchar($pdo);
        ccrm_migrate_orders($pdo);
        ccrm_seed_default_warehouses_and_items($pdo);
        ccrm_seed_default_orders($pdo);
        ccrm_seed_default_invoices_and_projects($pdo);
        ccrm_migrate_employee_role_rbac($pdo);
        // Employee documents used to sit in the public uploads directory.
        try {
            require_once __DIR__ . '/employee_files.php';
            ccrm_migrate_employee_files_private($pdo);
        } catch (\Throwable $e) {
            error_log('[ccrm schema] employee document migration skipped: ' . $e->getMessage());
        }
        ccrm_migrate_tickets($pdo);
        ccrm_seed_default_tickets($pdo);
    }

    /**
     * Creates and migrates `orders` and `order_items` tables for e-shop and commercial orders.
     */
    function ccrm_migrate_orders(PDO $pdo): void {
        try {
            $hasOrders = (int)$pdo->query(
                "SELECT COUNT(*) FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'"
            )->fetchColumn() > 0;
            if (!$hasOrders) {
                $statements = ccrm_schema_statements();
                foreach ($statements as $stmt) {
                    if (strpos($stmt, '`orders`') !== false || strpos($stmt, '`order_items`') !== false) {
                        try { $pdo->exec($stmt); } catch (\Throwable $e) {}
                    }
                }
                return;
            }

            $orderCols = [
                'customer_type' => "ALTER TABLE `orders` ADD COLUMN `customer_type` ENUM('client', 'guest') NOT NULL DEFAULT 'client' AFTER `status`",
                'guest_name' => "ALTER TABLE `orders` ADD COLUMN `guest_name` VARCHAR(255) NULL AFTER `supplier_id`",
                'guest_email' => "ALTER TABLE `orders` ADD COLUMN `guest_email` VARCHAR(255) NULL AFTER `guest_name`",
                'guest_phone' => "ALTER TABLE `orders` ADD COLUMN `guest_phone` VARCHAR(50) NULL AFTER `guest_email`",
                'guest_company' => "ALTER TABLE `orders` ADD COLUMN `guest_company` VARCHAR(255) NULL AFTER `guest_phone`",
                'guest_ico' => "ALTER TABLE `orders` ADD COLUMN `guest_ico` VARCHAR(50) NULL AFTER `guest_company`",
                'guest_dic' => "ALTER TABLE `orders` ADD COLUMN `guest_dic` VARCHAR(50) NULL AFTER `guest_ico`",
                'guest_ic_dph' => "ALTER TABLE `orders` ADD COLUMN `guest_ic_dph` VARCHAR(50) NULL AFTER `guest_dic`",
                'delivery_recipient' => "ALTER TABLE `orders` ADD COLUMN `delivery_recipient` VARCHAR(255) NULL AFTER `guest_ic_dph`",
                'delivery_street' => "ALTER TABLE `orders` ADD COLUMN `delivery_street` VARCHAR(255) NULL AFTER `delivery_recipient`",
                'delivery_city' => "ALTER TABLE `orders` ADD COLUMN `delivery_city` VARCHAR(100) NULL AFTER `delivery_street`",
                'delivery_zip' => "ALTER TABLE `orders` ADD COLUMN `delivery_zip` VARCHAR(20) NULL AFTER `delivery_city`",
                'delivery_country' => "ALTER TABLE `orders` ADD COLUMN `delivery_country` VARCHAR(10) NOT NULL DEFAULT 'SK' AFTER `delivery_zip`",
                'delivery_phone' => "ALTER TABLE `orders` ADD COLUMN `delivery_phone` VARCHAR(50) NULL AFTER `delivery_country`",
                'delivery_notes' => "ALTER TABLE `orders` ADD COLUMN `delivery_notes` TEXT NULL AFTER `delivery_phone`",
                'shipping_method' => "ALTER TABLE `orders` ADD COLUMN `shipping_method` VARCHAR(100) NULL AFTER `delivery_notes`",
                'shipping_pickup_point_id' => "ALTER TABLE `orders` ADD COLUMN `shipping_pickup_point_id` VARCHAR(100) NULL AFTER `shipping_method`",
                'shipping_tracking_number' => "ALTER TABLE `orders` ADD COLUMN `shipping_tracking_number` VARCHAR(100) NULL AFTER `shipping_pickup_point_id`",
                'billing_name' => "ALTER TABLE `orders` ADD COLUMN `billing_name` VARCHAR(255) NULL AFTER `shipping_tracking_number`",
                'billing_street' => "ALTER TABLE `orders` ADD COLUMN `billing_street` VARCHAR(255) NULL AFTER `billing_name`",
                'billing_city' => "ALTER TABLE `orders` ADD COLUMN `billing_city` VARCHAR(100) NULL AFTER `billing_street`",
                'billing_zip' => "ALTER TABLE `orders` ADD COLUMN `billing_zip` VARCHAR(20) NULL AFTER `billing_city`",
                'billing_country' => "ALTER TABLE `orders` ADD COLUMN `billing_country` VARCHAR(10) NOT NULL DEFAULT 'SK' AFTER `billing_zip`",
                'billing_ico' => "ALTER TABLE `orders` ADD COLUMN `billing_ico` VARCHAR(50) NULL AFTER `billing_country`",
                'billing_dic' => "ALTER TABLE `orders` ADD COLUMN `billing_dic` VARCHAR(50) NULL AFTER `billing_ico`",
                'billing_ic_dph' => "ALTER TABLE `orders` ADD COLUMN `billing_ic_dph` VARCHAR(50) NULL AFTER `billing_dic`",
                'payment_method' => "ALTER TABLE `orders` ADD COLUMN `payment_method` VARCHAR(100) NULL AFTER `billing_ic_dph`",
                'payment_status' => "ALTER TABLE `orders` ADD COLUMN `payment_status` ENUM('unpaid', 'paid', 'partially_paid', 'refunded') NOT NULL DEFAULT 'unpaid' AFTER `payment_method`",
                'paid_at' => "ALTER TABLE `orders` ADD COLUMN `paid_at` DATETIME NULL AFTER `payment_status`",
                'payment_reference' => "ALTER TABLE `orders` ADD COLUMN `payment_reference` VARCHAR(100) NULL AFTER `paid_at`",
                'items_net_amount' => "ALTER TABLE `orders` ADD COLUMN `items_net_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER `currency`",
                'services_net_amount' => "ALTER TABLE `orders` ADD COLUMN `services_net_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER `items_net_amount`",
                'customer_note' => "ALTER TABLE `orders` ADD COLUMN `customer_note` TEXT NULL AFTER `notes`",
            ];
            foreach ($orderCols as $col => $sql) {
                if (!ccrm_column_exists($pdo, 'orders', $col)) {
                    try { $pdo->exec($sql); } catch (\Throwable $e) {}
                }
            }

            if (ccrm_column_exists($pdo, 'order_items', 'id')) {
                if (!ccrm_column_exists($pdo, 'order_items', 'item_type')) {
                    try { $pdo->exec("ALTER TABLE `order_items` ADD COLUMN `item_type` ENUM('product', 'service') NOT NULL DEFAULT 'product' AFTER `order_id`"); } catch (\Throwable $e) {}
                }
                if (!ccrm_column_exists($pdo, 'order_items', 'ean')) {
                    try { $pdo->exec("ALTER TABLE `order_items` ADD COLUMN `ean` VARCHAR(50) NULL AFTER `sku`"); } catch (\Throwable $e) {}
                }
                if (!ccrm_column_exists($pdo, 'order_items', 'variant_title')) {
                    try { $pdo->exec("ALTER TABLE `order_items` ADD COLUMN `variant_title` VARCHAR(100) NULL AFTER `name`"); } catch (\Throwable $e) {}
                }
                if (!ccrm_column_exists($pdo, 'order_items', 'service_code')) {
                    try { $pdo->exec("ALTER TABLE `order_items` ADD COLUMN `service_code` VARCHAR(50) NULL AFTER `fulfilled_quantity`"); } catch (\Throwable $e) {}
                }
            }
        } catch (\Throwable $e) {
            error_log('[ccrm] ccrm_migrate_orders: ' . $e->getMessage());
        }
    }

    /**
     * Employees: IČO / DIČ / IČ DPH of an external supplier (a company or a sole trader). Only
     * `contractor` rows use them; they are filled from the business register in the employee form.
     */
    function ccrm_migrate_employee_company_ids(PDO $pdo): void {
        try {
            $hasEmp = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees'")->fetchColumn();
            if ($hasEmp === 0 || ccrm_column_exists($pdo, 'employees', 'company_id')) return;

            $pdo->exec("ALTER TABLE `employees`
                ADD COLUMN `company_id` VARCHAR(32) NULL AFTER `kind`,
                ADD COLUMN `tax_id` VARCHAR(32) NULL AFTER `company_id`,
                ADD COLUMN `vat_id` VARCHAR(32) NULL AFTER `tax_id`");
        } catch (\Throwable $e) {
            error_log('[ccrm schema] employee company ids migration skipped: ' . $e->getMessage());
        }
    }

    /**
     * Employees: first/last name, record kind (employee | contractor | ledger), position and department.
     * `name` stays as the display name every other module reads. Existing rows are classified once,
     * when the columns are added: a legal-form suffix makes a contractor, a commission line a ledger
     * item, anything else an employee whose name is split when that is unambiguous.
     */
    function ccrm_migrate_employee_identity(PDO $pdo): void {
        try {
            $hasEmp = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees'")->fetchColumn();
            if ($hasEmp === 0 || ccrm_column_exists($pdo, 'employees', 'kind')) return;

            $pdo->exec("ALTER TABLE `employees`
                ADD COLUMN `first_name` VARCHAR(100) NULL AFTER `name`,
                ADD COLUMN `last_name` VARCHAR(100) NULL AFTER `first_name`,
                ADD COLUMN `kind` VARCHAR(20) NOT NULL DEFAULT 'employee' AFTER `last_name`,
                ADD COLUMN `position` VARCHAR(100) NULL AFTER `kind`,
                ADD COLUMN `department` VARCHAR(100) NULL AFTER `position`");

            $company = '/(\bs\.\s?r\.\s?o\b\.?|\ba\.\s?s\b\.?|\bsro\b|\bspol\b|\bgmbh\b|\bltd\b|\bllc\b|\binc\b|\bkft\b|\bzrt\b)/iu';
            $ledger = '/províz|provis|commission/iu';
            $upd = $pdo->prepare("UPDATE `employees` SET `kind` = ?, `first_name` = ?, `last_name` = ? WHERE `id` = ?");
            foreach ($pdo->query("SELECT `id`, `name` FROM `employees`")->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $name = (string)$row['name'];
                if (preg_match($ledger, $name)) {
                    $upd->execute(['ledger', null, null, $row['id']]);
                } elseif (preg_match($company, $name)) {
                    $upd->execute(['contractor', null, null, $row['id']]);
                } else {
                    $split = ccrm_split_person_name($name);
                    $upd->execute(['employee', $split[0] ?? null, $split[1] ?? null, $row['id']]);
                }
            }
        } catch (\Throwable $e) {
            error_log('[ccrm schema] employee identity migration skipped: ' . $e->getMessage());
        }
    }

    /**
     * `employee_vacations`.`status` never accepted 'pending', yet the client
     * (VacationRequestModal, EmployeeDetailView, mockEmployees.ts) uses it for a
     * request waiting for approval. Saving one failed with "Data truncated for
     * column 'status'", and the demo vacation seed died at its first pending row,
     * leaving most employees without any leave. Widen the ENUM; idempotent.
     */
    function ccrm_migrate_vacation_status_pending(PDO $pdo): void {
        try {
            $columnType = $pdo->query(
                "SELECT COLUMN_TYPE FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_vacations' AND COLUMN_NAME = 'status'"
            )->fetchColumn();
            if (!is_string($columnType) || strpos($columnType, "'pending'") !== false) {
                return; // table not provisioned yet, or already migrated.
            }
            $pdo->exec(
                "ALTER TABLE `employee_vacations` MODIFY COLUMN `status`
                 ENUM('requested', 'approved', 'rejected', 'taken', 'pending') NOT NULL DEFAULT 'approved'"
            );
        } catch (\Throwable $e) {
            error_log('[ccrm schema] vacation status migration skipped: ' . $e->getMessage());
        }
    }

    /**
     * Widen `users.role` (and unused `role_permissions.role`) from the
     * original ENUM('admin','project_manager','viewer') to VARCHAR(100) so a
     * custom role name survives a save. Relabels the three legacy values to
     * the names the registry uses. Idempotent and never throws.
     */
    function ccrm_migrate_user_role_varchar(PDO $pdo): void {
        $widen = function (string $table, string $alter) use ($pdo): void {
            try {
                $type = $pdo->query(
                    "SELECT `DATA_TYPE` FROM `information_schema`.`COLUMNS`
                     WHERE `TABLE_SCHEMA` = DATABASE()
                       AND `TABLE_NAME` = " . $pdo->quote($table) . "
                       AND `COLUMN_NAME` = 'role'"
                )->fetchColumn();
                if ($type === 'enum') {
                    $pdo->exec($alter);
                }
            } catch (\Throwable $e) {
                error_log('[ccrm] ccrm_migrate_user_role_varchar ' . $table . ': ' . $e->getMessage());
            }
        };
        $widen('users', "ALTER TABLE `users` MODIFY COLUMN `role` VARCHAR(100) NOT NULL DEFAULT 'Viewer'");
        $widen('role_permissions', "ALTER TABLE `role_permissions` MODIFY COLUMN `role` VARCHAR(100) NOT NULL");
        try {
            $pdo->exec("UPDATE `users` SET `role` = 'Admin' WHERE `role` = 'admin'");
            $pdo->exec("UPDATE `users` SET `role` = 'Project Manager' WHERE `role` = 'project_manager'");
            $pdo->exec("UPDATE `users` SET `role` = 'Viewer' WHERE `role` = 'viewer'");
        } catch (\Throwable $e) {
            error_log('[ccrm] ccrm_migrate_user_role_varchar relabel: ' . $e->getMessage());
        }
    }

    /**
     * Ensure the native Employee role exists in ROLES_RBAC for existing installs.
     * Idempotent: if a role named 'Employee' already exists, leaves it untouched and logs it.
     */
    function ccrm_migrate_employee_role_rbac(PDO $pdo): void {
        require_once __DIR__ . '/permissions.php';
        try {
            $stmtRoles = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'ROLES_RBAC' LIMIT 1");
            $stmtRoles->execute();
            $rolesRaw = $stmtRoles->fetchColumn();
            if ($rolesRaw !== false && $rolesRaw !== null && trim((string)$rolesRaw) !== '') {
                $rolesList = json_decode((string)$rolesRaw, true);
                if (is_array($rolesList)) {
                    $hasEmp = false;
                    foreach ($rolesList as $r) {
                        if (is_array($r) && strtolower(trim((string)($r['name'] ?? ''))) === 'employee') {
                            $hasEmp = true;
                            break;
                        }
                    }
                    if (!$hasEmp) {
                        $rolesList[] = [
                            'name' => 'Employee',
                            'permissions' => ccrm_employee_role_permissions(),
                        ];
                        $upd = $pdo->prepare("UPDATE `system_settings` SET `value` = ? WHERE `key` = 'ROLES_RBAC'");
                        $upd->execute([json_encode($rolesList)]);
                    } else {
                        error_log("[ccrm] ccrm_migrate_employee_role_rbac: role 'Employee' already exists in ROLES_RBAC, leaving untouched.");
                    }
                }
            }
        } catch (\Throwable $e) {
            error_log('[ccrm schema] employee role migration error: ' . $e->getMessage());
        }
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
     * `invoices_offers`.`status_changed_at`: the client stamps the day a
     * document's status changes; until 1.9.85 it had no column and was lost on
     * the next reload. Idempotent.
     */
    function ccrm_migrate_invoice_status_changed_at(PDO $pdo): void {
        try {
            if (!ccrm_column_exists($pdo, 'invoices_offers', 'status_changed_at')) {
                $pdo->exec("ALTER TABLE `invoices_offers` ADD COLUMN `status_changed_at` DATE NULL AFTER `status`");
            }
        } catch (\Throwable $e) {
            error_log('[ccrm] schema: status_changed_at migration skipped: ' . $e->getMessage());
        }
    }

    /**
     * `invoices_offers`.`status`: an ENUM of six fixed values until 1.12.70, when
     * price offers got a configurable status list (OFFER_STATUSES) and so need to
     * store any key. Widened to VARCHAR(50); the existing values keep their text,
     * so no row is rewritten. Idempotent: only runs while the column is still an ENUM.
     */
    function ccrm_migrate_invoice_status_varchar(PDO $pdo): void {
        try {
            $type = $pdo->query(
                "SELECT `DATA_TYPE` FROM `information_schema`.`COLUMNS`
                 WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'invoices_offers' AND `COLUMN_NAME` = 'status'"
            )->fetchColumn();
            if ($type === 'enum') {
                $pdo->exec("ALTER TABLE `invoices_offers` MODIFY COLUMN `status` VARCHAR(50) NOT NULL DEFAULT 'draft'");
            }
        } catch (\Throwable $e) {
            error_log('[ccrm] schema: invoices_offers.status migration skipped: ' . $e->getMessage());
        }
    }

    /**
     * Richer product data (1.12.71): a VAT rate per item, per-level prices, a
     * package size, an external (ERP / MRP) reference, alternative codes and a
     * weight on `warehouse_items`; the price level a client buys on on `leads`.
     * Every column is nullable, so items and clients that predate this load and
     * save exactly as before. Idempotent: each step checks the live schema first.
     *
     *  - `external_source` + `external_id` are UNIQUE together; MySQL lets several
     *    rows hold NULL in a unique index, so the rule is "unique when both are set"
     *    and a lookup by it is one index probe (what an MRP sync or an import upserts by).
     *  - `alt_codes_json` is a JSON list of codes beside the SKU (supplier code,
     *    manufacturer code), searched with LIKE: a catalogue of a few thousand
     *    items does not need a child table for that.
     *  - `warehouse_item_prices` holds one price per (item, price level) instead of
     *    five fixed columns; the levels themselves are the PRICE_LEVELS setting.
     */
    function ccrm_migrate_warehouse_item_fields(PDO $pdo): void {
        try {
            $hasItems = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_items'")->fetchColumn() > 0;
            if ($hasItems) {
                $columns = [
                    'vat_rate'        => "DECIMAL(5,2) NULL COMMENT 'NULL = use the company default VAT'",
                    'pack_quantity'   => "DECIMAL(15,4) NULL COMMENT 'Units (unit) in one package'",
                    'pack_unit'       => "VARCHAR(30) NULL COMMENT 'Package label, e.g. bal'",
                    'external_source' => "VARCHAR(50) NULL COMMENT 'Outside system the item came from, e.g. mrp'",
                    'external_id'     => "VARCHAR(100) NULL COMMENT 'Id of the item in that system'",
                    'alt_codes_json'  => "TEXT NULL COMMENT 'JSON list of codes beside the SKU'",
                    'weight_kg'       => "DECIMAL(12,3) NULL",
                ];
                foreach ($columns as $name => $definition) {
                    if (!ccrm_column_exists($pdo, 'warehouse_items', $name)) {
                        $pdo->exec("ALTER TABLE `warehouse_items` ADD COLUMN `{$name}` {$definition}");
                    }
                }
                $hasIndex = (int)$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.STATISTICS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_items' AND INDEX_NAME = 'uq_item_external'"
                )->fetchColumn() > 0;
                if (!$hasIndex) {
                    $pdo->exec("ALTER TABLE `warehouse_items` ADD UNIQUE INDEX `uq_item_external` (`external_source`, `external_id`)");
                }
                $priceTable = "CREATE TABLE IF NOT EXISTS `warehouse_item_prices` (
                      `item_id` VARCHAR(50) NOT NULL,
                      `price_level_id` VARCHAR(50) NOT NULL,
                      `price` DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
                      PRIMARY KEY (`item_id`, `price_level_id`),
                      INDEX `idx_item_price_level` (`price_level_id`)%s
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
                try {
                    $pdo->exec(sprintf($priceTable, ",
                      FOREIGN KEY (`item_id`) REFERENCES `warehouse_items` (`id`) ON DELETE CASCADE"));
                } catch (\Throwable $fkError) {
                    // A catalogue table with another collation cannot be referenced. The prices
                    // matter more than the cascade, so create the table without the key; the sync
                    // then removes an item's prices itself when it deletes the item.
                    error_log('[ccrm] schema: warehouse_item_prices created without its foreign key: ' . $fkError->getMessage());
                    $pdo->exec(sprintf($priceTable, ''));
                }
            }
            if (ccrm_table_exists($pdo, 'leads') && !ccrm_column_exists($pdo, 'leads', 'price_level_id')) {
                $pdo->exec("ALTER TABLE `leads` ADD COLUMN `price_level_id` VARCHAR(50) NULL COMMENT 'The price level this client buys on (PRICE_LEVELS setting)'");
            }
        } catch (\Throwable $e) {
            error_log('[ccrm] schema: warehouse item fields migration skipped: ' . $e->getMessage());
        }
    }

    /**
     * Quantities and unit prices are typed with any precision (`step="any"`
     * inputs) but were stored as DECIMAL(12,2): a line of 2.345 m at 0.125 EUR
     * came back as 2.35 × 0.13 after a reload while its total still said 0.29.
     * Widen every such column to four decimals so what was typed is what is
     * stored. Idempotent: a column already at scale 4 is left alone.
     */
    function ccrm_migrate_quantity_precision(PDO $pdo): void {
        $columns = [
            ['invoice_offer_items', 'quantity', 'NOT NULL DEFAULT 1.0000'],
            ['invoice_offer_items', 'unit_price', 'NOT NULL DEFAULT 0.0000'],
            ['warehouse_movement_items', 'quantity', 'NOT NULL'],
            ['warehouse_movement_items', 'unit_purchase_price', 'NOT NULL DEFAULT 0.0000'],
            ['warehouse_movement_items', 'unit_sell_price', 'NOT NULL DEFAULT 0.0000'],
            ['warehouse_stock', 'quantity', 'NOT NULL DEFAULT 0.0000'],
            ['warehouse_stock', 'reserved_quantity', 'NOT NULL DEFAULT 0.0000'],
            ['warehouse_batches', 'initial_quantity', 'NOT NULL DEFAULT 0.0000'],
            ['warehouse_batches', 'current_quantity', 'NOT NULL DEFAULT 0.0000'],
            ['warehouse_items', 'default_sell_price', 'NOT NULL DEFAULT 0.0000'],
            ['warehouse_items', 'last_purchase_price', 'NOT NULL DEFAULT 0.0000'],
        ];
        foreach ($columns as [$table, $column, $tail]) {
            try {
                $st = $pdo->prepare(
                    "SELECT `NUMERIC_SCALE` FROM `information_schema`.`COLUMNS`
                     WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = ? AND `COLUMN_NAME` = ?"
                );
                $st->execute([$table, $column]);
                $scale = $st->fetchColumn();
                if ($scale === false || $scale === null) continue; // table not provisioned yet
                if ((int)$scale >= 4) continue;
                $pdo->exec("ALTER TABLE `{$table}` MODIFY COLUMN `{$column}` DECIMAL(15,4) {$tail}");
            } catch (\Throwable $e) {
                error_log('[ccrm] schema: precision migration skipped for ' . $table . '.' . $column . ': ' . $e->getMessage());
            }
        }

        // Push Subscriptions table for mobile PWA push notifications
        try {
            $hasPushTable = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'push_subscriptions'")->fetchColumn() > 0;
            if (!$hasPushTable) {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `push_subscriptions` (
                  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
                  `user_id` VARCHAR(50) NULL,
                  `user_name` VARCHAR(100) NULL,
                  `user_email` VARCHAR(150) NULL,
                  `endpoint` TEXT NOT NULL,
                  `endpoint_hash` VARCHAR(64) NOT NULL UNIQUE,
                  `p256dh` VARCHAR(255) NOT NULL,
                  `auth` VARCHAR(255) NOT NULL,
                  `user_agent` VARCHAR(255) NULL,
                  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX idx_ps_user_id (`user_id`),
                  INDEX idx_ps_user_name (`user_name`),
                  INDEX idx_ps_user_email (`user_email`),
                  INDEX idx_ps_hash (`endpoint_hash`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
            }
        } catch (\Throwable $e) {
            error_log('[ccrm schema] push_subscriptions migration skipped: ' . $e->getMessage());
        }

        // Employees, Salaries & Vacations module tables and default settings
        try {
            $hasEmp = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees'")->fetchColumn();
            if ($hasEmp === 0) {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `employees` (
                  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
                  `name` VARCHAR(150) NOT NULL COMMENT 'Display name: first + last name, or the company / item name',
                  `first_name` VARCHAR(100) NULL,
                  `last_name` VARCHAR(100) NULL,
                  `kind` VARCHAR(20) NOT NULL DEFAULT 'employee' COMMENT 'employee | contractor | ledger',
                  `company_id` VARCHAR(32) NULL COMMENT 'IČO of an external supplier',
                  `tax_id` VARCHAR(32) NULL COMMENT 'DIČ of an external supplier',
                  `vat_id` VARCHAR(32) NULL COMMENT 'IČ DPH of an external supplier',
                  `position` VARCHAR(100) NULL COMMENT 'Job title, not the app permission role',
                  `department` VARCHAR(100) NULL,
                  `user_id` VARCHAR(50) NULL UNIQUE,
                  `pin` VARCHAR(50) NULL COMMENT 'Personal identification number / Rodné číslo / Tax ID',
                  `email` VARCHAR(150) NULL,
                  `phone` VARCHAR(50) NULL,
                  `address_street` VARCHAR(255) NULL,
                  `address_city` VARCHAR(100) NULL,
                  `address_zip` VARCHAR(20) NULL,
                  `address_country` VARCHAR(100) NULL DEFAULT 'Slovakia',
                  `salary_type` ENUM('monthly', 'daily', 'hourly') NOT NULL DEFAULT 'monthly',
                  `salary_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                  `salary_due_day` INT NULL COMMENT 'Payout day of month (1-31) or week (1-7)',
                  `vacation_allowances_json` TEXT NULL,
                  `time_tracking_provider` VARCHAR(50) NOT NULL DEFAULT 'toggl',
                  `time_tracking_user_id` VARCHAR(100) NULL,
                  `time_tracking_user_name` VARCHAR(150) NULL,
                  `auto_expense` TINYINT(1) NOT NULL DEFAULT 0,
                  `expense_category_id` VARCHAR(50) NULL,
                  `files_json` LONGTEXT NULL,
                  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
                  `notes` TEXT NULL,
                  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX idx_emp_active (`is_active`),
                  INDEX idx_emp_name (`name`),
                  CONSTRAINT fk_employees_user_id FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
            }
            $hasSal = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_salaries'")->fetchColumn();
            if ($hasSal === 0) {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `employee_salaries` (
                  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
                  `employee_id` VARCHAR(50) NOT NULL,
                  `period_type` ENUM('monthly', 'weekly') NOT NULL DEFAULT 'monthly',
                  `period_key` VARCHAR(20) NOT NULL COMMENT 'e.g. 2026-09 or 2026-W39',
                  `year` INT NOT NULL,
                  `period_number` INT NOT NULL COMMENT 'Month 1-12 or Week 1-53',
                  `items_json` TEXT NOT NULL COMMENT 'Array of { categoryId, categoryName, salary, paid }',
                  `total_salary` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                  `total_paid` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                  `status` ENUM('pending', 'partially_paid', 'paid') NOT NULL DEFAULT 'pending',
                  `due_date` DATE NULL,
                  `payment_date` DATE NULL,
                  `payment_method` VARCHAR(50) NULL DEFAULT 'bank_transfer',
                  `financial_record_id` VARCHAR(50) NULL,
                  `note` TEXT NULL,
                  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX idx_sal_emp (`employee_id`),
                  INDEX idx_sal_period (`period_key`),
                  INDEX idx_sal_year (`year`),
                  UNIQUE KEY uk_emp_period (`employee_id`, `period_key`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
            }
            $hasVac = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_vacations'")->fetchColumn();
            if ($hasVac === 0) {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `employee_vacations` (
                  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
                  `employee_id` VARCHAR(50) NOT NULL,
                  `vacation_type_id` VARCHAR(50) NOT NULL,
                  `start_date` DATE NOT NULL,
                  `end_date` DATE NOT NULL,
                  `days_count` DECIMAL(5, 1) NOT NULL DEFAULT 1.0,
                  `status` ENUM('requested', 'approved', 'rejected', 'taken', 'pending') NOT NULL DEFAULT 'approved',
                  `note` TEXT NULL,
                  `approved_by` VARCHAR(100) NULL,
                  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX idx_vac_emp (`employee_id`),
                  INDEX idx_vac_dates (`start_date`, `end_date`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
            }

            // Seed default EMPLOYEE_SETTINGS in system_settings if absent
            $hasSettingsTable = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings'")->fetchColumn();
            if ($hasSettingsTable > 0) {
                $empSet = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'EMPLOYEE_SETTINGS'")->fetchColumn();
                if ($empSet === false || $empSet === null) {
                    $defaultEmpSettings = json_encode([
                        'salaryPeriod' => 'monthly',
                        'defaultSalaryDueDay' => 15,
                        'defaultAutoExpense' => false,
                        'defaultExpenseCategoryId' => 'fc-exp-payroll',
                        'salaryTypes' => [
                            ['id' => 'salary', 'name' => 'Salary / Mzda', 'color' => '#10b981'],
                            ['id' => 'bonus', 'name' => 'Bonus / Odmeny', 'color' => '#f59e0b'],
                            ['id' => 'invoicing', 'name' => 'Invoicing / Živnosť', 'color' => '#6366f1'],
                            ['id' => 'overtime', 'name' => 'Overtime / Nadčasy', 'color' => '#ec4899']
                        ],
                        'vacationTypes' => [
                            ['id' => 'annual', 'name' => 'Annual leave (Dovolenka)', 'isPaid' => true, 'defaultDays' => 25, 'color' => '#0ea5e9'],
                            ['id' => 'worked_days', 'name' => 'Leave for days worked (Náhradné voľno)', 'isPaid' => true, 'defaultDays' => 5, 'color' => '#8b5cf6'],
                            ['id' => 'sick', 'name' => 'Sick leave (PN / OČR)', 'isPaid' => false, 'defaultDays' => 10, 'color' => '#ef4444'],
                            ['id' => 'unpaid', 'name' => 'Unpaid leave (Neplatené voľno)', 'isPaid' => false, 'defaultDays' => 0, 'color' => '#64748b']
                        ],
                        'timeTracking' => [
                            'provider' => 'toggl',
                            'togglApiToken' => '',
                            'togglWorkspaceId' => '',
                            'clockifyApiKey' => '',
                            'clockifyWorkspaceId' => ''
                        ]
                    ], JSON_UNESCAPED_UNICODE);
                    $ins = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('EMPLOYEE_SETTINGS', ?)");
                    $ins->execute([$defaultEmpSettings]);
                }
            }
        } catch (\Throwable $e) {
            error_log('[ccrm schema] employees migration skipped: ' . $e->getMessage());
        }
    }

    /**
     * Freeze the numeric ids that /api/pipeline.php resolves `source_id` and
     * `category_id` against.
     *
     * Until 1.9.19 there was no id to store: the number WAS the item's position
     * in LEAD_SOURCES / LEAD_CATEGORIES, so reordering either list in Settings
     * silently re-pointed every form already live on the customer's website.
     * Seeding from the current order — which is exactly what the positional
     * scheme was handing out right up to this upgrade — makes today's numbers
     * permanent rather than incidental, so no existing integration changes
     * meaning on the way in.
     *
     * Runs once per list: a map that already exists is the operator's, and
     * re-deriving it from the order is the very bug this removes.
     */
    function ccrm_migrate_list_ids(PDO $pdo): void {
        $pairs = [
            'LEAD_SOURCES' => 'LEAD_SOURCE_IDS',
            'LEAD_CATEGORIES' => 'LEAD_CATEGORY_IDS',
        ];
        try {
            $read = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = ?");
            $write = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
            foreach ($pairs as $listKey => $idsKey) {
                $read->execute([$idsKey]);
                $existing = json_decode((string)$read->fetchColumn(), true);
                if (is_array($existing) && $existing) continue; // already seeded

                $read->execute([$listKey]);
                $names = json_decode((string)$read->fetchColumn(), true);
                if (!is_array($names) || !$names) continue; // list not configured yet

                $write->execute([$idsKey, json_encode(ccrm_normalize_list_ids($names, []), JSON_UNESCAPED_UNICODE)]);
            }
        } catch (\Throwable $e) {
            // Never block a sync over this. pipeline.php normalises on the fly
            // from the same list, so an unseeded install still resolves ids —
            // this only makes the answer durable.
            if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
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
                'divisions' => ['Cstudios', 'Cstudios Budapest'],
                'taskStates' => ['New', 'In progress', 'Blocked', 'Done'],
            ],
            'sk' => [
                'leadStates' => ['nový', 'kontaktovaný', 'ponuka odoslaná', 'prijatý', 'zamietnutý'],
                'leadSources' => ['showroom', 'facebook', 'instagram', 'web'],
                'leadCategories' => ['Produkty', 'Služby'],
                'divisions' => ['Cstudios', 'Cstudios Budapest'],
                'taskStates' => ['Nový', 'Prebieha', 'Blokovaný', 'Hotovo'],
            ],
            'hu' => [
                'leadStates' => ['új', 'kapcsolatfelvétel', 'ajánlat elküldve', 'elfogadva', 'elutasítva'],
                'leadSources' => ['bemutatóterem', 'facebook', 'instagram', 'weboldal'],
                'leadCategories' => ['Termékek', 'Szolgáltatások'],
                'divisions' => ['Cstudios', 'Cstudios Budapest'],
                'taskStates' => ['Új', 'Folyamatban', 'Blokkolva', 'Kész'],
            ],
        ];

        return $byLanguage[$language];
    }

    /**
     * Permanent numeric ids for the two operator-editable lists a website form
     * can address by number: LEAD_SOURCES (`source_id`) and LEAD_CATEGORIES
     * (`category_id`) in the /api/pipeline.php payload.
     *
     * Mirror of normalizeListIds in src/utils/listIds.ts — the rules, and why an
     * id may never be derived from a list position, are written out there. Both
     * ends must build the same map from the same inputs, or the settings sync
     * would push the difference back and forth forever.
     */
    function ccrm_normalize_list_ids($names, $saved): array {
        $out = [];
        // A JSON list ([...]) is not a name -> id map; only an object is.
        $isMap = is_array($saved) && (!$saved || array_keys($saved) !== range(0, count($saved) - 1));
        if ($isMap) {
            foreach ($saved as $key => $value) {
                $id = (int)$value;
                if ((string)$key !== '' && $id > 0) {
                    $out[(string)$key] = $id;
                }
            }
        }

        $list = [];
        foreach ((is_array($names) ? $names : []) as $name) {
            if (is_string($name) && $name !== '') $list[] = $name;
        }

        $missing = [];
        foreach ($list as $name) {
            if (!isset($out[$name])) $missing[$name] = true;
        }
        if (!$missing) return $out;

        // Nothing usable stored: reproduce the old positional numbering one last
        // time, so the ids frozen here are the ones live forms already send.
        if (!$out) {
            foreach (array_values($list) as $idx => $name) {
                if (!isset($out[$name])) $out[$name] = $idx + 1;
            }
            return $out;
        }

        $next = max($out) + 1;
        foreach (array_keys($missing) as $name) {
            $out[(string)$name] = $next++;
        }
        return $out;
    }

    /**
     * The list entry an incoming `source_id` / `category_id` names, or null when
     * nothing answers to it.
     *
     * Deliberately walks the live list rather than the id map: an id retired by
     * a deletion stays in the map as a tombstone precisely so it can never be
     * re-issued, and it must not resolve to anything either.
     */
    function ccrm_resolve_list_id(int $id, $names, $savedIds): ?string {
        if ($id <= 0 || !is_array($names)) return null;
        $ids = ccrm_normalize_list_ids($names, $savedIds);
        foreach ($names as $name) {
            if (!is_string($name) || $name === '') continue;
            if (isset($ids[$name]) && (int)$ids[$name] === $id) return $name;
        }
        return null;
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
        $divisions = $lists['divisions'] ?? ['Cstudios', 'Cstudios Budapest'];
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
            'DIVISIONS' => $enc($divisions),
            // Permanent ids for the two lists /api/pipeline.php addresses by
            // number. See ccrm_normalize_list_ids: these must never be derived
            // from list order, or reordering re-points live web forms.
            'LEAD_SOURCE_IDS' => $enc(ccrm_normalize_list_ids($leadSources, [])),
            'LEAD_CATEGORY_IDS' => $enc(ccrm_normalize_list_ids($leadCategories, [])),
            'LEAD_STATE_COLORS' => $enc(array_combine($leadStates, ['#3b82f6', '#0ea5e9', '#6366f1', '#10b981', '#ef4444'])),
            'LEAD_SOURCE_COLORS' => $enc(array_combine($leadSources, ['#10b981', '#3b82f6', '#ec4899', '#8b5cf6'])),
            'LEAD_CATEGORY_COLORS' => $enc(array_combine($leadCategories, ['#f59e0b', '#10b981'])),
            'DIVISION_COLORS' => $enc(['Cstudios' => '#3b82f6', 'Cstudios Budapest' => '#8b5cf6']),
            'LEAD_STAGE_GROUPS' => $enc(array_combine($leadStates, ['new', 'in_progress', 'in_progress', 'closed', 'closed'])),
            'LEAD_STATE_PARENTS' => $enc((object)[]),
            'TASK_STATES' => $enc($taskStates),
            'TASK_STATE_COLORS' => $enc(ccrm_default_task_state_colors($taskStates)),
        ];
    }

    /**
     * The sample 3-level financial category tree seeded into a demo installation
     * (see ccrm_seed_default_financial_categories). Deliberately generic — any
     * small business selling products or services should recognise it — with
     * each name given once per supported language.
     */
    function ccrm_default_financial_categories(string $language): array {
        if (!in_array($language, ['en', 'sk', 'hu'], true)) {
            $language = 'sk';
        }

        // [id, type, parent_id, level, color, icon, [en, sk, hu]]
        $tree = [
            // Incomes
            ['fc-inc-sales', 'income', null, 1, '#10b981', 'Package', ['Sales', 'Predaj', 'Értékesítés']],
            ['fc-inc-sales-products', 'income', 'fc-inc-sales', 2, '#059669', 'Box', ['Products & goods', 'Produkty a tovar', 'Termékek és áruk']],
            ['fc-inc-sales-online', 'income', 'fc-inc-sales', 2, '#34d399', 'Globe', ['E-shop & online sales', 'E-shop a online predaj', 'Webshop és online értékesítés']],
            ['fc-inc-services', 'income', null, 1, '#3b82f6', 'Wrench', ['Services', 'Služby', 'Szolgáltatások']],
            ['fc-inc-svc-projects', 'income', 'fc-inc-services', 2, '#2563eb', 'Briefcase', ['Project work', 'Projektové práce', 'Projektmunkák']],
            ['fc-inc-svc-consulting', 'income', 'fc-inc-services', 2, '#60a5fa', 'UserCheck', ['Consulting', 'Poradenstvo', 'Tanácsadás']],
            ['fc-inc-svc-support', 'income', 'fc-inc-services', 2, '#93c5fd', 'Shield', ['Support & maintenance', 'Podpora a údržba', 'Támogatás és karbantartás']],
            ['fc-inc-recurring', 'income', null, 1, '#0891b2', 'TrendingUp', ['Recurring revenue', 'Opakované príjmy', 'Ismétlődő bevételek']],
            ['fc-inc-rec-subscriptions', 'income', 'fc-inc-recurring', 2, '#06b6d4', 'Circle', ['Subscriptions & retainers', 'Predplatné a paušály', 'Előfizetések és átalánydíjak']],
            ['fc-inc-other', 'income', null, 1, '#8b5cf6', 'Coins', ['Other income', 'Ostatné príjmy', 'Egyéb bevételek']],

            // Expenses
            ['fc-exp-cogs', 'expense', null, 1, '#ef4444', 'Package', ['Goods & materials', 'Nákup tovaru a materiálu', 'Áru- és anyagbeszerzés']],
            ['fc-exp-cogs-goods', 'expense', 'fc-exp-cogs', 2, '#dc2626', 'Box', ['Goods for resale', 'Tovar na predaj', 'Továbbértékesítési áru']],
            ['fc-exp-cogs-materials', 'expense', 'fc-exp-cogs', 2, '#f87171', 'Layers', ['Materials & supplies', 'Materiál a spotrebný tovar', 'Anyagok és fogyóeszközök']],
            ['fc-exp-cogs-shipping', 'expense', 'fc-exp-cogs', 2, '#ea580c', 'Truck', ['Shipping & delivery', 'Doprava a doručenie', 'Szállítás és kiszállítás']],
            ['fc-exp-marketing', 'expense', null, 1, '#f59e0b', 'Megaphone', ['Marketing & advertising', 'Marketing a reklama', 'Marketing és hirdetés']],
            ['fc-exp-mkt-online', 'expense', 'fc-exp-marketing', 2, '#d97706', 'Globe', ['Online advertising', 'Online reklama', 'Online hirdetések']],
            ['fc-exp-mkt-meta', 'expense', 'fc-exp-mkt-online', 3, '#fbbf24', 'Share2', ['Meta (Facebook / Instagram)', 'Meta (Facebook / Instagram)', 'Meta (Facebook / Instagram)']],
            ['fc-exp-mkt-google', 'expense', 'fc-exp-mkt-online', 3, '#f59e0b', 'Search', ['Google Ads', 'Google Ads', 'Google Ads']],
            ['fc-exp-mkt-seo', 'expense', 'fc-exp-mkt-online', 3, '#b45309', 'TrendingUp', ['SEO', 'SEO', 'SEO']],
            ['fc-exp-mkt-creative', 'expense', 'fc-exp-marketing', 2, '#fb923c', 'PenTool', ['Agency, design & content', 'Agentúra, grafika a obsah', 'Ügynökség, grafika és tartalom']],
            ['fc-exp-payroll', 'expense', null, 1, '#8b5cf6', 'Users', ['Payroll & contractors', 'Mzdy a externisti', 'Bérek és alvállalkozók']],
            ['fc-exp-pay-salaries', 'expense', 'fc-exp-payroll', 2, '#7c3aed', 'Briefcase', ['Salaries & contributions', 'Mzdy a odvody', 'Bérek és járulékok']],
            ['fc-exp-pay-contractors', 'expense', 'fc-exp-payroll', 2, '#6d28d9', 'UserCheck', ['Contractors & freelancers', 'Externisti a živnostníci', 'Alvállalkozók és szabadúszók']],
            ['fc-exp-pay-comm', 'expense', 'fc-exp-payroll', 2, '#a78bfa', 'Percent', ['Commissions', 'Provízie', 'Jutalékok']],
            ['fc-exp-overhead', 'expense', null, 1, '#0891b2', 'Building', ['Operations & overhead', 'Prevádzka a réžia', 'Működés és rezsi']],
            ['fc-exp-ovh-rent', 'expense', 'fc-exp-overhead', 2, '#0e7490', 'Home', ['Rent', 'Nájom priestorov', 'Bérleti díj']],
            ['fc-exp-ovh-util', 'expense', 'fc-exp-overhead', 2, '#06b6d4', 'FileText', ['Utilities & telecom', 'Energie a telekomunikácie', 'Rezsi és telekommunikáció']],
            ['fc-exp-ovh-software', 'expense', 'fc-exp-overhead', 2, '#22d3ee', 'Layers', ['Software & subscriptions', 'Softvér a predplatné', 'Szoftverek és előfizetések']],
            ['fc-exp-ovh-travel', 'expense', 'fc-exp-overhead', 2, '#67e8f9', 'Truck', ['Travel', 'Cestovné', 'Utazás']],
            ['fc-exp-admin', 'expense', null, 1, '#64748b', 'FileText', ['Admin & professional services', 'Administratíva a služby', 'Adminisztráció és szakmai szolgáltatások']],
            ['fc-exp-adm-accounting', 'expense', 'fc-exp-admin', 2, '#475569', 'FileText', ['Accounting & legal', 'Účtovníctvo a právne služby', 'Könyvelés és jogi szolgáltatások']],
            ['fc-exp-adm-insurance', 'expense', 'fc-exp-admin', 2, '#94a3b8', 'Shield', ['Insurance', 'Poistenie', 'Biztosítás']],
            ['fc-exp-adm-bank', 'expense', 'fc-exp-admin', 2, '#cbd5e1', 'Coins', ['Bank fees', 'Bankové poplatky', 'Banki díjak']],
            ['fc-exp-adm-taxes', 'expense', 'fc-exp-admin', 2, '#334155', 'Percent', ['Taxes & fees', 'Dane a poplatky', 'Adók és illetékek']],
        ];

        $nameIndex = ['en' => 0, 'sk' => 1, 'hu' => 2][$language];
        return array_map(static function (array $c) use ($nameIndex): array {
            return [
                'id' => $c[0],
                'type' => $c[1],
                'name' => $c[6][$nameIndex],
                'parent_id' => $c[2],
                'level' => $c[3],
                'color' => $c[4],
                'icon' => $c[5],
            ];
        }, $tree);
    }

    /**
     * Seeds the sample financial categories into an empty financial_categories
     * table — demo installations only. They are sample data like the demo leads,
     * so a real installation starts empty and builds its own.
     */
    function ccrm_seed_default_financial_categories(PDO $pdo): void {
        try {
            $hasTable = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'financial_categories'")->fetchColumn();
            if ($hasTable === 0) return;

            $demoMode = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'DEMO_MODE'");
            if (!$demoMode || $demoMode->fetchColumn() !== 'true') return;

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
     * Demo leave records positioned around $now (the install / seed date), so every
     * employee's vacation calendar has entries in the month that opens by default.
     * Mirrors generateDefaultMockVacations() in src/utils/mockEmployees.ts — keep the two in step.
     *
     * @return array<int, array{0:string,1:string,2:string,3:string,4:string,5:int,6:string,7:string,8:?string}>
     *         rows ready for `employee_vacations`: id, employee_id, type, start, end, days, status, note, approved_by
     */
    function ccrm_demo_employee_vacations(\DateTimeImmutable $now): array {
        $today = $now->setTime(0, 0, 0);
        $todayStr = $today->format('Y-m-d');
        $isWeekend = static fn(\DateTimeImmutable $d): bool => (int)$d->format('N') >= 6;
        $spanEnd = static function (\DateTimeImmutable $start, int $workdays) use ($isWeekend): \DateTimeImmutable {
            $out = $start;
            $counted = 1;
            while ($counted < $workdays) {
                $out = $out->modify('+1 day');
                if (!$isWeekend($out)) $counted++;
            }
            return $out;
        };

        // [employee, type, monthOffset, startDay, workdays, note, pending]
        $templates = [
            ['emp-1', 'annual', -4, 12, 4, 'Predĺžený víkend v Tatrách', false],
            ['emp-1', 'doctor', -2, 9, 1, 'Preventívna prehliadka u lekára', false],
            ['emp-1', 'sick', -1, 20, 3, 'Chrípka', false],
            ['emp-1', 'annual', 0, 20, 3, 'Rodinný výlet', false],
            ['emp-1', 'doctor', 0, 6, 1, 'Návšteva zubára', false],
            ['emp-1', 'annual', 2, 22, 5, 'Plánovaná dovolenka', true],
            ['emp-2', 'annual', -3, 6, 5, 'Letná dovolenka', false],
            ['emp-2', 'doctor', -1, 14, 1, 'Kontrola u špecialistu', false],
            ['emp-2', 'sick', 0, 8, 2, 'Nachladnutie', false],
            ['emp-2', 'annual', 0, 27, 2, 'Predĺžený víkend', false],
            ['emp-2', 'annual', 1, 10, 4, 'Rodinná udalosť', false],
            ['emp-2', 'annual', 3, 15, 5, 'Plánovaná dovolenka', true],
            ['emp-3', 'sick', -4, 3, 2, 'Bolesť chrbta', false],
            ['emp-3', 'unpaid', -3, 2, 1, 'Súkromné vybavovanie', false],
            ['emp-3', 'annual', -2, 16, 5, 'Turistika', false],
            ['emp-3', 'annual', -1, 28, 2, 'Predĺžený víkend', false],
            ['emp-3', 'annual', 0, 12, 4, 'Oddych a regenerácia', false],
            ['emp-3', 'doctor', 0, 26, 1, 'Kontrola u lekára', false],
            ['emp-3', 'doctor', 2, 11, 1, 'Očné vyšetrenie', true],
            ['emp-4', 'annual', -3, 20, 5, 'Jesenný oddych', false],
            ['emp-4', 'doctor', -1, 5, 1, 'Preventívna prehliadka', false],
            ['emp-4', 'doctor', 0, 22, 1, 'Návšteva lekára s dieťaťom', false],
            ['emp-4', 'annual', 1, 17, 5, 'Predĺžený víkend a oddych', false],
            ['emp-4', 'annual', 2, 8, 3, 'Plánovaná dovolenka', true],
        ];

        // Anchored first: leave that covers today (on a weekend: the Friday before, so the range spans it).
        $anchor = $today;
        while ($isWeekend($anchor)) $anchor = $anchor->modify('-1 day');
        $drafts = [[
            'emp-4', 'annual', $anchor->format('Y-m-d'), $spanEnd($anchor, 3)->format('Y-m-d'), 3,
            'approved', 'Krátke voľno — dnes mimo kancelárie', 'Vedenie',
        ]];

        $monthFirst = $today->modify('first day of this month');
        foreach ($templates as [$empId, $type, $offset, $startDay, $workdays, $note, $pending]) {
            $first = $monthFirst->modify(sprintf('%+d months', $offset));
            $start = $first->setDate((int)$first->format('Y'), (int)$first->format('n'), $startDay);
            while ($isWeekend($start)) $start = $start->modify('+1 day');
            $startDate = $start->format('Y-m-d');
            $waiting = $pending && $startDate > $todayStr;
            $drafts[] = [
                $empId, $type, $startDate, $spanEnd($start, $workdays)->format('Y-m-d'), $workdays,
                $waiting ? 'pending' : 'approved', $note, $waiting ? null : 'Vedenie',
            ];
        }

        // The calendar paints the first matching record per day, so one employee's leave must not overlap.
        $accepted = [];
        foreach ($drafts as $d) {
            $clash = false;
            foreach ($accepted as $a) {
                if ($a[0] === $d[0] && $d[2] <= $a[3] && $d[3] >= $a[2]) { $clash = true; break; }
            }
            if (!$clash) $accepted[] = $d;
        }

        $rows = [];
        foreach ($accepted as $i => $d) {
            $rows[] = ['vac-demo-' . ($i + 1), $d[0], $d[1], $d[2], $d[3], $d[4], $d[5], $d[6], $d[7]];
        }
        return $rows;
    }

    /**
     * One demo salary row per employee, for the month of $now (the install).
     * Past and future months are not seeded: each row is posted to Finance as a
     * payroll movement and would stay in the history after the sample staff is gone.
     * The month is paid once its payday has arrived.
     * Mirrors generateDefaultMockSalaries() in src/utils/mockEmployees.ts.
     *
     * @param array<int, array> $emps rows in the order used by ccrm_seed_default_employees()
     * @return array<int, array> rows ready for `employee_salaries`
     */
    function ccrm_demo_employee_salaries(array $emps, \DateTimeImmutable $now): array {
        $year = (int)$now->format('Y');
        $m = (int)$now->format('n');
        $nowDay = (int)$now->format('j');
        $rows = [];

        foreach ($emps as $empIdx => $e) {
            $empId = $e[0];
            $base = (float)$e[10];
            $dueDay = (int)($e[11] ?: 15);
            $mStr = str_pad((string)$m, 2, '0', STR_PAD_LEFT);
            $periodKey = "{$year}-{$mStr}";
            $isPaid = $nowDay >= $dueDay - 1;

            $bonus = $m === 6 ? 500.0 : ($m === 12 ? 800.0 : 0.0);
            $overtime = (($empId === 'emp-3' || $empId === 'emp-2') && ($m + $empIdx) % 3 === 0)
                ? (float)(90 + (($m * 37 + $empIdx * 53) % 5) * 30) : 0.0;
            $reimbursement = (($empId === 'emp-1' || $empId === 'emp-4') && ($m + $empIdx) % 4 === 1)
                ? (float)(45 + (($m * 29 + $empIdx * 17) % 4) * 20) : 0.0;

            $lines = [['base', 'Základná mzda', $base]];
            if ($bonus > 0) $lines[] = ['bonus', $m === 6 ? 'Polročné prémie' : 'Ročné prémie', $bonus];
            if ($overtime > 0) $lines[] = ['overtime', 'Nadčasy', $overtime];
            if ($reimbursement > 0) $lines[] = ['reimbursement', 'Cestovné / Diéty', $reimbursement];

            $items = [];
            $total = 0.0;
            foreach ($lines as [$catId, $catName, $amount]) {
                $items[] = ['categoryId' => $catId, 'categoryName' => $catName, 'salary' => $amount, 'paid' => $isPaid ? $amount : 0.0];
                $total += $amount;
            }

            $rows[] = [
                "sal-{$empId}-{$periodKey}",
                $empId,
                'monthly',
                $periodKey,
                $year,
                $m,
                json_encode($items),
                $total,
                $isPaid ? $total : 0.0,
                $isPaid ? 'paid' : 'pending',
                "{$year}-{$mStr}-" . str_pad((string)$dueDay, 2, '0', STR_PAD_LEFT),
                $isPaid ? "{$year}-{$mStr}-" . str_pad((string)($dueDay - 1), 2, '0', STR_PAD_LEFT) : null,
                'bank_transfer',
                $isPaid ? 'Úhrada cez SEPA prevod' : 'Plánovaný náklad mzdy',
            ];
        }
        return $rows;
    }

    /**
     * Seeds sample employees, salaries, and vacation records into empty employee tables
     * — demo installations only. A real installation starts with no staff.
     */
    function ccrm_seed_default_employees(PDO $pdo): void {
        // All-or-nothing: the seed only runs while `employees` is empty, so a
        // half-written seed (employees in, vacations failed) would never be retried.
        // Pure DML, so a transaction is safe here; skip it if the caller opened one.
        $ownTransaction = false;
        try {
            $hasTable = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees'")->fetchColumn();
            if ($hasTable === 0) return;

            $demoMode = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'DEMO_MODE'");
            if (!$demoMode || $demoMode->fetchColumn() !== 'true') return;

            $count = (int)$pdo->query("SELECT COUNT(*) FROM `employees`")->fetchColumn();
            if ($count > 0) return;

            if (!$pdo->inTransaction()) {
                $pdo->beginTransaction();
                $ownTransaction = true;
            }

            // 1. Insert employees
            $insEmp = $pdo->prepare("INSERT INTO `employees` (`id`, `name`, `pin`, `email`, `phone`, `address_street`, `address_city`, `address_zip`, `address_country`, `salary_type`, `salary_amount`, `salary_due_day`, `vacation_allowances_json`, `time_tracking_provider`, `time_tracking_user_id`, `time_tracking_user_name`, `auto_expense`, `expense_category_id`, `is_active`, `notes`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

            $emps = [
                ['emp-1', 'Ing. Michal Kováč', '880415/7231', 'michal.kovac@cstudios.sk', '+421 905 442 811', 'Dunajská 24', 'Bratislava', '811 08', 'Slovakia', 'monthly', 3600.00, 15, json_encode(['annual' => 25, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]), 'toggl', null, null, 1, 'fc-exp-pay-salaries', 1, 'Lead architectural director for enterprise contracts. Authorised chamber architect.'],
                ['emp-2', 'Mgr. Zuzana Horváthová', '925708/6519', 'zuzana.horvath@cstudios.sk', '+421 918 631 904', 'Hlavná 48', 'Trnava', '917 01', 'Slovakia', 'monthly', 2850.00, 15, json_encode(['annual' => 25, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]), 'toggl', null, null, 1, 'fc-exp-pay-salaries', 1, 'Product design lead for CRM, design systems, and client brand identities.'],
                ['emp-3', 'Bc. Peter Varga', '950122/8104', 'peter.varga@cstudios.sk', '+421 944 205 789', 'Štefánikova 12', 'Nitra', '949 01', 'Slovakia', 'monthly', 3100.00, 15, json_encode(['annual' => 20, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]), 'toggl', null, null, 1, 'fc-exp-pay-salaries', 1, 'Core platform architect. Maintains API services, container pipelines and MariaDB cluster.'],
                ['emp-4', 'Kristína Balážová', '975319/7820', 'kristina.balaz@cstudios.sk', '+421 907 334 112', 'Záhradnícka 62', 'Bratislava', '821 08', 'Slovakia', 'monthly', 2200.00, 15, json_encode(['annual' => 22, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]), 'toggl', null, null, 1, 'fc-exp-pay-salaries', 1, 'Manages client contracts, monthly invoicing schedules, office operations and procurement.']
            ];

            foreach ($emps as $e) {
                $insEmp->execute($e);
            }
            $idUpd = $pdo->prepare("UPDATE `employees` SET `first_name` = ?, `last_name` = ?, `position` = ?, `department` = ? WHERE `id` = ?");
            foreach ([
                ['emp-1', 'Ing. Michal', 'Kováč', 'Chief Architect & Project Lead', 'Management'],
                ['emp-2', 'Mgr. Zuzana', 'Horváthová', 'Senior UX/UI & Brand Strategist', 'Marketing'],
                ['emp-3', 'Bc. Peter', 'Varga', 'Full-Stack Engineer & DevOps', 'Development'],
                ['emp-4', 'Kristína', 'Balážová', 'Operations & Account Specialist', 'Sales'],
            ] as $idRow) {
                $idUpd->execute([$idRow[1], $idRow[2], $idRow[3], $idRow[4], $idRow[0]]);
            }

            // 2. Insert salaries for the install month only (paid once payday has arrived)
            $now = new \DateTimeImmutable('now');
            $insSal = $pdo->prepare("INSERT INTO `employee_salaries` (`id`, `employee_id`, `period_type`, `period_key`, `year`, `period_number`, `items_json`, `total_salary`, `total_paid`, `status`, `due_date`, `payment_date`, `payment_method`, `note`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            foreach (ccrm_demo_employee_salaries($emps, $now) as $row) {
                $insSal->execute($row);
            }

            // 3. Insert vacations positioned around today, so the calendar is populated for the install month
            $insVac = $pdo->prepare("INSERT INTO `employee_vacations` (`id`, `employee_id`, `vacation_type_id`, `start_date`, `end_date`, `days_count`, `status`, `note`, `approved_by`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            foreach (ccrm_demo_employee_vacations($now) as $row) {
                $insVac->execute($row);
            }

            if ($ownTransaction) $pdo->commit();
        } catch (\Throwable $e) {
            if ($ownTransaction && $pdo->inTransaction()) $pdo->rollBack();
            error_log('[ccrm schema] employees seed skipped: ' . $e->getMessage());
        }
    }

    /**
     * Seeds demo warehouses, suppliers, warehouse items, initial stock, batches, and movements.
     */
    function ccrm_seed_default_warehouses_and_items(PDO $pdo, string $systemLanguage = 'sk'): void {
        try {
            $hasTable = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouses'")->fetchColumn();
            if ($hasTable === 0) return;

            $demoMode = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'DEMO_MODE'");
            if (!$demoMode || $demoMode->fetchColumn() !== 'true') return;

            $count = (int)$pdo->query("SELECT COUNT(*) FROM `warehouses`")->fetchColumn();
            if ($count > 0) return;

            if (!in_array($systemLanguage, ['en', 'sk', 'hu'], true)) {
                $systemLanguage = 'sk';
                $stmtLang = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'");
                if ($stmtLang && ($val = $stmtLang->fetchColumn()) !== false) {
                    if (in_array($val, ['en', 'sk', 'hu'], true)) {
                        $systemLanguage = $val;
                    }
                }
            }

            // 1. Warehouses
            $whTexts = [
                'sk' => [
                    'wh1_name' => 'Hlavný sklad Bratislava',
                    'wh2_name' => 'Výrobný sklad Trnava',
                ],
                'en' => [
                    'wh1_name' => 'Main Warehouse Bratislava',
                    'wh2_name' => 'Production Warehouse Trnava',
                ],
                'hu' => [
                    'wh1_name' => 'Fő raktár Pozsony',
                    'wh2_name' => 'Gyártási raktár Nagyszombat',
                ],
            ];
            $tWh = $whTexts[$systemLanguage] ?? $whTexts['sk'];

            $warehouses = [
                ['wh-1', $tWh['wh1_name'], 'WH-BA-01', 'Vajnorská 142, 831 04 Bratislava', 'u-' . md5('alex@crm.com'), 1],
                ['wh-2', $tWh['wh2_name'], 'WH-TT-01', 'Zavarská 11, 917 01 Trnava', 'u-' . md5('sam@crm.com'), 0],
            ];
            $insWh = $pdo->prepare("INSERT INTO `warehouses` (`id`, `name`, `code`, `address`, `manager_user_id`, `is_default`) VALUES (?, ?, ?, ?, ?, ?)");
            foreach ($warehouses as $w) {
                $insWh->execute($w);
            }

            // 2. Suppliers
            $suppliers = [
                [
                    'sup-1',
                    'Laminam Slovakia s.r.o.',
                    '48123456',
                    '2120123456',
                    'SK2120123456',
                    'Prievozská 4D',
                    'Bratislava',
                    '821 09',
                    'Slovakia',
                    'objednavky@laminam.sk',
                    '+421 905 111 222',
                    'https://laminam.sk',
                    'SK8902000000001234567890',
                    'SUBA SK BX',
                    14,
                    'Oficiálny distribútor veľkoformátových keramických a quartzových dosiek.',
                    json_encode([
                        ['name' => 'Peter Kováč', 'position' => 'Obchodný riaditeľ', 'phone' => '+421 905 111 222', 'email' => 'kovac@laminam.sk'],
                        ['name' => 'Lucia Vargová', 'position' => 'Zákaznícky servis', 'phone' => '+421 905 111 223', 'email' => 'vargova@laminam.sk']
                    ])
                ],
                [
                    'sup-2',
                    'Stone Import Verona S.r.l.',
                    'IT0987654321',
                    'IT0987654321',
                    'IT0987654321',
                    'Via del Marmo 45',
                    'Verona',
                    '37135',
                    'Italy',
                    'export@stoneverona.it',
                    '+39 045 889 900',
                    'https://stoneverona.it',
                    'IT60X0542811101000000123456',
                    'UNCRITM1VER',
                    30,
                    'Dodávateľ prírodného mramoru, žuly a kvarcitu priamo z talianskych lomov.',
                    json_encode([
                        ['name' => 'Marco Rossi', 'position' => 'Export Area Manager', 'phone' => '+39 340 123 4567', 'email' => 'm.rossi@stoneverona.it']
                    ])
                ],
                [
                    'sup-3',
                    'Mapei Slovensko s.r.o.',
                    '35890123',
                    '2021890123',
                    'SK2021890123',
                    'Nádražná 39',
                    'Ivanka pri Dunaji',
                    '900 28',
                    'Slovakia',
                    'predaj@mapei.sk',
                    '+421 2 4020 4511',
                    'https://mapei.sk',
                    'SK1211000000002621234567',
                    'TATR SK BX',
                    14,
                    'Špičková stavebná chémia, lepidlá triedy S1/S2 a škárovacie hmoty.',
                    json_encode([
                        ['name' => 'Ing. Ján Novotný', 'position' => 'Technický zástupca', 'phone' => '+421 911 333 444', 'email' => 'j.novotny@mapei.sk']
                    ])
                ]
            ];
            $insSup = $pdo->prepare("INSERT INTO `suppliers` (`id`, `name`, `company_id`, `tax_id`, `vat_id`, `street`, `city`, `postal_code`, `country`, `email`, `phone`, `website`, `iban`, `swift`, `payment_due_days`, `notes`, `contacts_json`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            foreach ($suppliers as $s) {
                $insSup->execute($s);
            }

            // 3. Warehouse Items
            $itemTexts = [
                'sk' => [
                    'it1_name' => 'Calacatta Gold Quartz doska 20mm',
                    'it1_desc' => 'Prémiový technický kameň so zlatistým žilkovaním, lesklý povrch, formát 3200x1600mm.',
                    'it1_cat'  => 'Veľkoformátové dosky',
                    'it1_unit' => 'm²',
                    'it2_name' => 'Nero Marquina mramor doska 30mm',
                    'it2_desc' => 'Čierny španielsky mramor s výraznými bielymi žilami, leštený.',
                    'it2_cat'  => 'Prírodný kameň',
                    'it2_unit' => 'm²',
                    'it3_name' => 'Patagonia Quartzite doska 20mm',
                    'it3_desc' => 'Exkluzívny translucentný brazílsky kvarcit s kryštálmi živca a kremeňa.',
                    'it3_cat'  => 'Prírodný kameň',
                    'it3_unit' => 'm²',
                    'it4_name' => 'Keraflex Maxi S1 cementové lepidlo 25kg',
                    'it4_desc' => 'Deformovateľné cementové lepidlo so zníženým vertikálnym sklzom a predĺženou dobou zavädnutia na kamenné dosky.',
                    'it4_cat'  => 'Stavebná chémia',
                    'it4_unit' => 'balenie',
                    'it5_name' => 'Tenax Ager impregnácia a zvýrazňovač farby 1L',
                    'it5_desc' => 'Vysokoúčinná impregnácia s mokrým efektom pre zvýraznenie štruktúry lešteného a matného kameňa.',
                    'it5_cat'  => 'Ošetrenie a údržba',
                    'it5_unit' => 'ks',
                ],
                'en' => [
                    'it1_name' => 'Calacatta Gold Quartz Slab 20mm',
                    'it1_desc' => 'Premium engineered quartz with golden veining, polished finish, format 3200x1600mm.',
                    'it1_cat'  => 'Large Format Slabs',
                    'it1_unit' => 'm²',
                    'it2_name' => 'Nero Marquina Marble Slab 30mm',
                    'it2_desc' => 'Black Spanish marble with distinct white veining, polished.',
                    'it2_cat'  => 'Natural Stone',
                    'it2_unit' => 'm²',
                    'it3_name' => 'Patagonia Quartzite Slab 20mm',
                    'it3_desc' => 'Exclusive translucent Brazilian quartzite with feldspar and quartz crystals.',
                    'it3_cat'  => 'Natural Stone',
                    'it3_unit' => 'm²',
                    'it4_name' => 'Keraflex Maxi S1 Cement Adhesive 25kg',
                    'it4_desc' => 'Deformable cementitious adhesive with no vertical slip and extended open time for stone slabs.',
                    'it4_cat'  => 'Building Chemicals',
                    'it4_unit' => 'pack',
                    'it5_name' => 'Tenax Ager Stone Enhancer & Sealer 1L',
                    'it5_desc' => 'High performance wet-look colour enhancer and sealer for polished and honed stones.',
                    'it5_cat'  => 'Care & Maintenance',
                    'it5_unit' => 'pcs',
                ],
                'hu' => [
                    'it1_name' => 'Calacatta Gold Quartz lap 20mm',
                    'it1_desc' => 'Prémium műkő arany erezettel, polírozott felülettel, 3200x1600mm méretben.',
                    'it1_cat'  => 'Nagyméretű lapok',
                    'it1_unit' => 'm²',
                    'it2_name' => 'Nero Marquina márványlap 30mm',
                    'it2_desc' => 'Fekete spanyol márvány markáns fehér erezettel, polírozva.',
                    'it2_cat'  => 'Természetes kő',
                    'it2_unit' => 'm²',
                    'it3_name' => 'Patagonia Kvarcit lap 20mm',
                    'it3_desc' => 'Exkluzív áttetsző brazil kvarcit földpát és kvarc kristályokkal.',
                    'it3_cat'  => 'Természetes kő',
                    'it3_unit' => 'm²',
                    'it4_name' => 'Keraflex Maxi S1 cementkötésű ragasztó 25kg',
                    'it4_desc' => 'Alakváltozásra képes, lecsúszásmentes, nyújtott nyitott idejű cementkötésű ragasztó kőlapokhoz.',
                    'it4_cat'  => 'Építési vegyi anyagok',
                    'it4_unit' => 'csomag',
                    'it5_name' => 'Tenax Ager színélénkítő kőimpregnáló 1L',
                    'it5_desc' => 'Nagy hatékonyságú színélénkítő nedves hatású impregnáló polírozott és matt kövekhez.',
                    'it5_cat'  => 'Ápolás és karbantartás',
                    'it5_unit' => 'db',
                ],
            ];
            $tIt = $itemTexts[$systemLanguage] ?? $itemTexts['sk'];

            $items = [
                ['item-1', 'SKU-CQ-01', '858800123401', $tIt['it1_name'], $tIt['it1_desc'], $tIt['it1_cat'], $tIt['it1_unit'], 20.00, 80.00, 'A-01-RACK', 0, 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=300&h=300&fit=crop', 185.00, 95.0000, 95.00],
                ['item-2', 'SKU-NM-02', '858800123402', $tIt['it2_name'], $tIt['it2_desc'], $tIt['it2_cat'], $tIt['it2_unit'], 15.00, 50.00, 'A-03-RACK', 0, 'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?w=300&h=300&fit=crop', 210.00, 110.0000, 110.00],
                ['item-3', 'SKU-PQ-03', '858800123403', $tIt['it3_name'], $tIt['it3_desc'], $tIt['it3_cat'], $tIt['it3_unit'], 10.00, 30.00, 'A-05-RACK', 0, 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=300&h=300&fit=crop', 340.00, 190.0000, 190.00],
                ['item-4', 'SKU-MAP-04', '858800123404', $tIt['it4_name'], $tIt['it4_desc'], $tIt['it4_cat'], $tIt['it4_unit'], 30.00, 100.00, 'CHEM-PAL-02', 1, 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=300&h=300&fit=crop', 24.50, 14.2000, 14.20],
                ['item-5', 'SKU-TNX-05', '858800123405', $tIt['it5_name'], $tIt['it5_desc'], $tIt['it5_cat'], $tIt['it5_unit'], 10.00, 40.00, 'CHEM-SHELF-01', 1, 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300&h=300&fit=crop', 42.00, 22.8000, 22.80]
            ];
            $insItem = $pdo->prepare("INSERT INTO `warehouse_items` (`id`, `sku`, `barcode`, `name`, `description`, `category`, `unit`, `min_stock`, `optimal_stock`, `default_location`, `has_expiration`, `image_url`, `default_sell_price`, `avg_purchase_price`, `last_purchase_price`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            foreach ($items as $it) {
                $insItem->execute($it);
            }

            // 4. Stock
            $stock = [
                ['wh-1', 'item-1', 45.00, 12.00, 'A-01-RACK'],
                ['wh-1', 'item-2', 28.00, 0.00, 'A-03-RACK'],
                ['wh-1', 'item-4', 65.00, 10.00, 'CHEM-PAL-02'],
                ['wh-1', 'item-5', 18.00, 0.00, 'CHEM-SHELF-01'],
                ['wh-2', 'item-3', 16.00, 0.00, 'TT-RACK-01'],
                ['wh-2', 'item-4', 20.00, 0.00, 'TT-CHEM-01']
            ];
            $insStock = $pdo->prepare("INSERT INTO `warehouse_stock` (`warehouse_id`, `item_id`, `quantity`, `reserved_quantity`, `location`) VALUES (?, ?, ?, ?, ?)");
            foreach ($stock as $st) {
                $insStock->execute($st);
            }

            // 5. Batches
            $batches = [
                ['bat-1', 'item-4', 'wh-1', 'BAT-2026-001', '2026-11-30', 40.00, 40.00, 14.20],
                ['bat-2', 'item-4', 'wh-1', 'BAT-2025-089', '2026-09-05', 30.00, 25.00, 13.80],
                ['bat-3', 'item-5', 'wh-1', 'BAT-2026-TX1', '2027-06-15', 20.00, 18.00, 22.80]
            ];
            $insBatch = $pdo->prepare("INSERT INTO `warehouse_batches` (`id`, `item_id`, `warehouse_id`, `batch_number`, `expiration_date`, `initial_quantity`, `current_quantity`, `purchase_price`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            foreach ($batches as $b) {
                $insBatch->execute($b);
            }

            // 6. Movements
            $movements = [
                [
                    'mov-1', 'PRI-2026-0001', 'inward', 'confirmed', 'wh-1', null, 'sup-1', null,
                    4275.00, 8325.00, 4050.00, 'Alex',
                    'Príjem dodávky Calacatta Gold dosiek od Laminam SK.',
                    'dodaci_list_laminam_001.pdf', null, '2026-05-02 09:30:00',
                    [
                        ['mvi-1', 'item-1', null, 45.00, 95.00, 185.00, 4275.00, null, 'Dosky v bezchybnom stave, opticky skontrolované.']
                    ]
                ],
                [
                    'mov-2', 'PRI-2026-0002', 'inward', 'confirmed', 'wh-1', null, 'sup-3', null,
                    923.00, 1592.50, 669.50, 'Alex',
                    'Príjem palety Keraflex Maxi S1 z Mapei.',
                    'dl_mapei_9812.pdf', null, '2026-05-04 14:15:00',
                    [
                        ['mvi-2', 'item-4', 'bat-1', 65.00, 14.20, 24.50, 923.00, '2026-11-30', 'Paleta 1/1, šarža BAT-2026-001.']
                    ]
                ],
                [
                    'mov-3', 'VYD-2026-0001', 'outward', 'confirmed', 'wh-1', null, null, 'lead-1',
                    1140.00, 2220.00, 1080.00, 'Alex',
                    'Výdaj materiálu na zákazku kuchynskej dosky pre klienta Ján Novák.',
                    null, null, '2026-05-16 11:00:00',
                    [
                        ['mvi-3', 'item-1', null, 12.00, 95.00, 185.00, 2220.00, null, 'Vydané do výroby na CNC opracovanie.']
                    ]
                ]
            ];

            $insMov = $pdo->prepare("INSERT INTO `warehouse_movements` (`id`, `document_number`, `type`, `status`, `warehouse_id`, `target_warehouse_id`, `supplier_id`, `lead_id`, `total_cost_value`, `total_sell_value`, `total_profit_value`, `created_by`, `note`, `file_name`, `file_path`, `issued_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $insMovItem = $pdo->prepare("INSERT INTO `warehouse_movement_items` (`id`, `movement_id`, `item_id`, `batch_id`, `quantity`, `unit_purchase_price`, `unit_sell_price`, `total_price`, `expiration_date`, `note`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

            foreach ($movements as $m) {
                $itemsList = array_pop($m);
                $insMov->execute($m);
                foreach ($itemsList as $it) {
                    $insMovItem->execute([$it[0], $m[0], $it[1], $it[2], $it[3], $it[4], $it[5], $it[6], $it[7], $it[8]]);
                }
            }
        } catch (\Throwable $e) {
            error_log('[ccrm schema] warehouse seed skipped: ' . $e->getMessage());
        }
    }

    /**
     * Seeds demo sales orders and line items for demo installations.
     */
    function ccrm_seed_default_orders(PDO $pdo, string $systemLanguage = 'sk'): void {
        try {
            $hasTable = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'")->fetchColumn();
            if ($hasTable === 0) return;

            $demoMode = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'DEMO_MODE'");
            if (!$demoMode || $demoMode->fetchColumn() !== 'true') return;

            $count = (int)$pdo->query("SELECT COUNT(*) FROM `orders`")->fetchColumn();
            if ($count > 0) return;

            if (!in_array($systemLanguage, ['en', 'sk', 'hu'], true)) {
                $systemLanguage = 'sk';
                $stmtLang = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'");
                if ($stmtLang && ($val = $stmtLang->fetchColumn()) !== false) {
                    if (in_array($val, ['en', 'sk', 'hu'], true)) {
                        $systemLanguage = $val;
                    }
                }
            }

            $orderTexts = [
                'sk' => [
                    's1_name' => 'Kuriérska preprava DPD',
                    's2_name' => 'SPS Kuriér na adresu',
                    's3_name' => 'Packeta Z-Box výdajné miesto',
                    's4_name' => 'Dobierka príplatok',
                    's5_name' => 'GLS Špeciálna paletová preprava',
                    'it1_name' => 'Calacatta Gold Quartz doska 20mm',
                    'it2_name' => 'Nero Marquina mramor doska 30mm',
                    'it4_name' => 'Keraflex Maxi S1 cementové lepidlo 25kg',
                    'it5_name' => 'Tenax Ager impregnácia a zvýrazňovač farby 1L',
                    'unit_pack' => 'balenie',
                    'unit_pcs' => 'ks',
                    'unit_srv' => 'služba',
                    'ord1_note' => 'Prosím doručiť pred 16:00, zvonček Novák.',
                    'ord2_note' => 'Nechať na recepcii v prípade neprítomnosti.',
                    'ord3_note' => 'Výdajné miesto Z-Box Nitra Mlyny.',
                    'ord4_note' => 'Dodanie s hydraulickým čelom na stavbu.',
                ],
                'en' => [
                    's1_name' => 'DPD Express Courier',
                    's2_name' => 'SPS Courier to Address',
                    's3_name' => 'Packeta Z-Box Pick-up Point',
                    's4_name' => 'Cash on Delivery Surcharge',
                    's5_name' => 'GLS Freight Pallet Transport',
                    'it1_name' => 'Calacatta Gold Quartz Slab 20mm',
                    'it2_name' => 'Nero Marquina Marble Slab 30mm',
                    'it4_name' => 'Keraflex Maxi S1 Cement Adhesive 25kg',
                    'it5_name' => 'Tenax Ager Stone Enhancer & Sealer 1L',
                    'unit_pack' => 'pack',
                    'unit_pcs' => 'pcs',
                    'unit_srv' => 'service',
                    'ord1_note' => 'Please deliver before 16:00, ring bell Novák.',
                    'ord2_note' => 'Leave at reception if absent.',
                    'ord3_note' => 'Pick-up location Z-Box Nitra Mlyny.',
                    'ord4_note' => 'Delivery with hydraulic tail lift to site.',
                ],
                'hu' => [
                    's1_name' => 'DPD futárszolgálat',
                    's2_name' => 'SPS futár házhozszállítás',
                    's3_name' => 'Packeta Z-Box csomagpont',
                    's4_name' => 'Utánvét kezelési díj',
                    's5_name' => 'GLS Speciális raklapos szállítás',
                    'it1_name' => 'Calacatta Gold Quartz lap 20mm',
                    'it2_name' => 'Nero Marquina márványlap 30mm',
                    'it4_name' => 'Keraflex Maxi S1 cementkötésű ragasztó 25kg',
                    'it5_name' => 'Tenax Ager színélénkítő kőimpregnáló 1L',
                    'unit_pack' => 'csomag',
                    'unit_pcs' => 'db',
                    'unit_srv' => 'szolgáltatás',
                    'ord1_note' => 'Kérjük 16:00 előtt szállítani, Novák csengő.',
                    'ord2_note' => 'Távollét esetén a recepción hagyni.',
                    'ord3_note' => 'Z-Box átvevőhely Nyitra Mlyny.',
                    'ord4_note' => 'Szállítás emelőhátfalas teherautóval a helyszínre.',
                ],
            ];
            $t = $orderTexts[$systemLanguage] ?? $orderTexts['sk'];

            $orders = [
                // 1. Order 1 - Client Ján Novák (delivered, paid)
                [
                    'id' => 'ord-demo-1',
                    'order_number' => 'OBJ-2026-0001',
                    'type' => 'sales',
                    'status' => 'delivered',
                    'customer_type' => 'client',
                    'client_id' => 'lead-1',
                    'supplier_id' => null,
                    'guest_name' => null,
                    'guest_email' => null,
                    'guest_phone' => null,
                    'guest_company' => null,
                    'guest_ico' => null,
                    'guest_dic' => null,
                    'guest_ic_dph' => null,
                    'delivery_recipient' => 'Ing. Ján Novák',
                    'delivery_street' => 'Mlynské Nivy 42',
                    'delivery_city' => 'Bratislava',
                    'delivery_zip' => '821 09',
                    'delivery_country' => 'SK',
                    'delivery_phone' => '+421 905 123 456',
                    'delivery_notes' => $t['ord1_note'],
                    'shipping_method' => 'dpd',
                    'shipping_pickup_point_id' => null,
                    'shipping_tracking_number' => '1029384756',
                    'billing_name' => 'Ján Novák s.r.o.',
                    'billing_street' => 'Mlynské Nivy 42',
                    'billing_city' => 'Bratislava',
                    'billing_zip' => '821 09',
                    'billing_country' => 'SK',
                    'billing_ico' => '36123456',
                    'billing_dic' => '2021234567',
                    'billing_ic_dph' => 'SK2021234567',
                    'payment_method' => 'bank_transfer',
                    'payment_status' => 'paid',
                    'paid_at' => '2026-05-16 14:20:00',
                    'payment_reference' => 'OBJ-2026-0001',
                    'currency' => 'EUR',
                    'items_net_amount' => 468.00,
                    'services_net_amount' => 15.00,
                    'total_net_amount' => 483.00,
                    'total_tax_amount' => 96.60,
                    'total_gross_amount' => 579.60,
                    'order_date' => '2026-05-15',
                    'requested_delivery_date' => '2026-05-18',
                    'confirmed_delivery_date' => '2026-05-18',
                    'warehouse_id' => 'wh-1',
                    'notes' => 'Kompletne vybavená objednávka dosiek a lepidla.',
                    'customer_note' => null,
                    'created_by' => 'Sam',
                    'items' => [
                        [
                            'id' => 'oi-demo-1',
                            'item_type' => 'product',
                            'item_id' => 'item-1',
                            'sku' => 'SKU-CQ-01',
                            'ean' => '858800123401',
                            'name' => $t['it1_name'],
                            'variant_title' => '20mm',
                            'quantity' => 2.00,
                            'unit' => 'm²',
                            'unit_price' => 185.0000,
                            'discount_percent' => 0.00,
                            'tax_rate' => 20.00,
                            'total_net_amount' => 370.00,
                            'total_gross_amount' => 444.00,
                            'fulfilled_quantity' => 2.00,
                            'service_code' => null,
                            'notes' => null,
                            'sort_order' => 1,
                        ],
                        [
                            'id' => 'oi-demo-2',
                            'item_type' => 'product',
                            'item_id' => 'item-4',
                            'sku' => 'SKU-MAP-04',
                            'ean' => '858800123404',
                            'name' => $t['it4_name'],
                            'variant_title' => '25kg',
                            'quantity' => 4.00,
                            'unit' => $t['unit_pack'],
                            'unit_price' => 24.5000,
                            'discount_percent' => 0.00,
                            'tax_rate' => 20.00,
                            'total_net_amount' => 98.00,
                            'total_gross_amount' => 117.60,
                            'fulfilled_quantity' => 4.00,
                            'service_code' => null,
                            'notes' => null,
                            'sort_order' => 2,
                        ],
                        [
                            'id' => 'oi-demo-3',
                            'item_type' => 'service',
                            'item_id' => null,
                            'sku' => 'SRV-DPD',
                            'ean' => null,
                            'name' => $t['s1_name'],
                            'variant_title' => null,
                            'quantity' => 1.00,
                            'unit' => $t['unit_srv'],
                            'unit_price' => 15.0000,
                            'discount_percent' => 0.00,
                            'tax_rate' => 20.00,
                            'total_net_amount' => 15.00,
                            'total_gross_amount' => 18.00,
                            'fulfilled_quantity' => 1.00,
                            'service_code' => 'SHIPPING-DPD',
                            'notes' => 'Expresná kuriérska služba DPD s poistením',
                            'sort_order' => 3,
                        ]
                    ]
                ],

                // 2. Order 2 - Client Martina Kováčová (processing, paid)
                [
                    'id' => 'ord-demo-2',
                    'order_number' => 'OBJ-2026-0002',
                    'type' => 'sales',
                    'status' => 'processing',
                    'customer_type' => 'client',
                    'client_id' => 'lead-2',
                    'supplier_id' => null,
                    'guest_name' => null,
                    'guest_email' => null,
                    'guest_phone' => null,
                    'guest_company' => null,
                    'guest_ico' => null,
                    'guest_dic' => null,
                    'guest_ic_dph' => null,
                    'delivery_recipient' => 'Martina Kováčová',
                    'delivery_street' => 'Kukučínova 15',
                    'delivery_city' => 'Trnava',
                    'delivery_zip' => '917 01',
                    'delivery_country' => 'SK',
                    'delivery_phone' => '+421 911 987 654',
                    'delivery_notes' => $t['ord2_note'],
                    'shipping_method' => 'sps',
                    'shipping_pickup_point_id' => null,
                    'shipping_tracking_number' => 'SPS8829104',
                    'billing_name' => 'Martina Kováčová',
                    'billing_street' => 'Kukučínova 15',
                    'billing_city' => 'Trnava',
                    'billing_zip' => '917 01',
                    'billing_country' => 'SK',
                    'billing_ico' => null,
                    'billing_dic' => null,
                    'billing_ic_dph' => null,
                    'payment_method' => 'card',
                    'payment_status' => 'paid',
                    'paid_at' => '2026-05-18 10:15:00',
                    'payment_reference' => 'CARD-984210',
                    'currency' => 'EUR',
                    'items_net_amount' => 133.00,
                    'services_net_amount' => 6.50,
                    'total_net_amount' => 139.50,
                    'total_tax_amount' => 27.90,
                    'total_gross_amount' => 167.40,
                    'order_date' => '2026-05-18',
                    'requested_delivery_date' => '2026-05-21',
                    'confirmed_delivery_date' => '2026-05-21',
                    'warehouse_id' => 'wh-1',
                    'notes' => 'Pripravené na balenie v sklade.',
                    'customer_note' => null,
                    'created_by' => 'Jordan',
                    'items' => [
                        [
                            'id' => 'oi-demo-4',
                            'item_type' => 'product',
                            'item_id' => 'item-5',
                            'sku' => 'SKU-TNX-05',
                            'ean' => '858800123405',
                            'name' => $t['it5_name'],
                            'variant_title' => '1L',
                            'quantity' => 2.00,
                            'unit' => $t['unit_pcs'],
                            'unit_price' => 42.0000,
                            'discount_percent' => 0.00,
                            'tax_rate' => 20.00,
                            'total_net_amount' => 84.00,
                            'total_gross_amount' => 100.80,
                            'fulfilled_quantity' => 0.00,
                            'service_code' => null,
                            'notes' => null,
                            'sort_order' => 1,
                        ],
                        [
                            'id' => 'oi-demo-5',
                            'item_type' => 'product',
                            'item_id' => 'item-4',
                            'sku' => 'SKU-MAP-04',
                            'ean' => '858800123404',
                            'name' => $t['it4_name'],
                            'variant_title' => '25kg',
                            'quantity' => 2.00,
                            'unit' => $t['unit_pack'],
                            'unit_price' => 24.5000,
                            'discount_percent' => 0.00,
                            'tax_rate' => 20.00,
                            'total_net_amount' => 49.00,
                            'total_gross_amount' => 58.80,
                            'fulfilled_quantity' => 0.00,
                            'service_code' => null,
                            'notes' => null,
                            'sort_order' => 2,
                        ],
                        [
                            'id' => 'oi-demo-6',
                            'item_type' => 'service',
                            'item_id' => null,
                            'sku' => 'SRV-SPS',
                            'ean' => null,
                            'name' => $t['s2_name'],
                            'variant_title' => null,
                            'quantity' => 1.00,
                            'unit' => $t['unit_srv'],
                            'unit_price' => 6.5000,
                            'discount_percent' => 0.00,
                            'tax_rate' => 20.00,
                            'total_net_amount' => 6.50,
                            'total_gross_amount' => 7.80,
                            'fulfilled_quantity' => 0.00,
                            'service_code' => 'SHIPPING-SPS',
                            'notes' => 'Doručenie SPS kuriérom priamo domov',
                            'sort_order' => 3,
                        ]
                    ]
                ],

                // 3. Order 3 - Guest Peter Horváth (new, unpaid COD)
                [
                    'id' => 'ord-demo-3',
                    'order_number' => 'OBJ-2026-0003',
                    'type' => 'sales',
                    'status' => 'new',
                    'customer_type' => 'guest',
                    'client_id' => null,
                    'supplier_id' => null,
                    'guest_name' => 'Peter Horváth',
                    'guest_email' => 'peter.horvath@example.com',
                    'guest_phone' => '+421 903 777 888',
                    'guest_company' => null,
                    'guest_ico' => null,
                    'guest_dic' => null,
                    'guest_ic_dph' => null,
                    'delivery_recipient' => 'Peter Horváth',
                    'delivery_street' => 'Hviezdoslavova 8',
                    'delivery_city' => 'Nitra',
                    'delivery_zip' => '949 01',
                    'delivery_country' => 'SK',
                    'delivery_phone' => '+421 903 777 888',
                    'delivery_notes' => $t['ord3_note'],
                    'shipping_method' => 'packeta',
                    'shipping_pickup_point_id' => 'SK-19402',
                    'shipping_tracking_number' => 'Z92817345',
                    'billing_name' => 'Peter Horváth',
                    'billing_street' => 'Hviezdoslavova 8',
                    'billing_city' => 'Nitra',
                    'billing_zip' => '949 01',
                    'billing_country' => 'SK',
                    'billing_ico' => null,
                    'billing_dic' => null,
                    'billing_ic_dph' => null,
                    'payment_method' => 'cod',
                    'payment_status' => 'unpaid',
                    'paid_at' => null,
                    'payment_reference' => null,
                    'currency' => 'EUR',
                    'items_net_amount' => 42.00,
                    'services_net_amount' => 5.40,
                    'total_net_amount' => 47.40,
                    'total_tax_amount' => 9.48,
                    'total_gross_amount' => 56.88,
                    'order_date' => '2026-05-20',
                    'requested_delivery_date' => '2026-05-22',
                    'confirmed_delivery_date' => null,
                    'warehouse_id' => 'wh-1',
                    'notes' => 'E-shop nákup bez registrácie na dobierku do Z-Boxu.',
                    'customer_note' => 'Prosím poslať SMS s kódom hneď po uložení.',
                    'created_by' => 'E-shop Web',
                    'items' => [
                        [
                            'id' => 'oi-demo-7',
                            'item_type' => 'product',
                            'item_id' => 'item-5',
                            'sku' => 'SKU-TNX-05',
                            'ean' => '858800123405',
                            'name' => $t['it5_name'],
                            'variant_title' => '1L',
                            'quantity' => 1.00,
                            'unit' => $t['unit_pcs'],
                            'unit_price' => 42.0000,
                            'discount_percent' => 0.00,
                            'tax_rate' => 20.00,
                            'total_net_amount' => 42.00,
                            'total_gross_amount' => 50.40,
                            'fulfilled_quantity' => 0.00,
                            'service_code' => null,
                            'notes' => null,
                            'sort_order' => 1,
                        ],
                        [
                            'id' => 'oi-demo-8',
                            'item_type' => 'service',
                            'item_id' => null,
                            'sku' => 'SRV-PACKETA',
                            'ean' => null,
                            'name' => $t['s3_name'],
                            'variant_title' => null,
                            'quantity' => 1.00,
                            'unit' => $t['unit_srv'],
                            'unit_price' => 3.9000,
                            'discount_percent' => 0.00,
                            'tax_rate' => 20.00,
                            'total_net_amount' => 3.90,
                            'total_gross_amount' => 4.68,
                            'fulfilled_quantity' => 0.00,
                            'service_code' => 'SHIPPING-PACKETA',
                            'notes' => 'Packeta výdajné miesto / Z-Box',
                            'sort_order' => 2,
                        ],
                        [
                            'id' => 'oi-demo-9',
                            'item_type' => 'service',
                            'item_id' => null,
                            'sku' => 'SRV-COD',
                            'ean' => null,
                            'name' => $t['s4_name'],
                            'variant_title' => null,
                            'quantity' => 1.00,
                            'unit' => $t['unit_srv'],
                            'unit_price' => 1.5000,
                            'discount_percent' => 0.00,
                            'tax_rate' => 20.00,
                            'total_net_amount' => 1.50,
                            'total_gross_amount' => 1.80,
                            'fulfilled_quantity' => 0.00,
                            'service_code' => 'COD-FEE',
                            'notes' => 'Platba pri prevzatí balíka',
                            'sort_order' => 3,
                        ]
                    ]
                ],

                // 4. Order 4 - Client Thomas Müller (shipped, paid)
                [
                    'id' => 'ord-demo-4',
                    'order_number' => 'OBJ-2026-0004',
                    'type' => 'sales',
                    'status' => 'shipped',
                    'customer_type' => 'client',
                    'client_id' => 'lead-3',
                    'supplier_id' => null,
                    'guest_name' => null,
                    'guest_email' => null,
                    'guest_phone' => null,
                    'guest_company' => null,
                    'guest_ico' => null,
                    'guest_dic' => null,
                    'guest_ic_dph' => null,
                    'delivery_recipient' => 'Thomas Müller',
                    'delivery_street' => 'Hauptstrasse 102',
                    'delivery_city' => 'Košice',
                    'delivery_zip' => '040 01',
                    'delivery_country' => 'SK',
                    'delivery_phone' => '+49 172 888 999',
                    'delivery_notes' => $t['ord4_note'],
                    'shipping_method' => 'gls',
                    'shipping_pickup_point_id' => null,
                    'shipping_tracking_number' => 'GLS987654321SK',
                    'billing_name' => 'Thomas Müller GmbH',
                    'billing_street' => 'Hauptstrasse 102',
                    'billing_city' => 'Košice',
                    'billing_zip' => '040 01',
                    'billing_country' => 'SK',
                    'billing_ico' => 'DE98765432',
                    'billing_dic' => '115/908/332',
                    'billing_ic_dph' => null,
                    'payment_method' => 'bank_transfer',
                    'payment_status' => 'paid',
                    'paid_at' => '2026-05-12 11:00:00',
                    'payment_reference' => 'OBJ-2026-0004',
                    'currency' => 'EUR',
                    'items_net_amount' => 1050.00,
                    'services_net_amount' => 85.00,
                    'total_net_amount' => 1135.00,
                    'total_tax_amount' => 227.00,
                    'total_gross_amount' => 1362.00,
                    'order_date' => '2026-05-11',
                    'requested_delivery_date' => '2026-05-15',
                    'confirmed_delivery_date' => '2026-05-15',
                    'warehouse_id' => 'wh-1',
                    'notes' => 'Paletová zásielka mramorových platní na pobočku.',
                    'customer_note' => null,
                    'created_by' => 'Alex',
                    'items' => [
                        [
                            'id' => 'oi-demo-10',
                            'item_type' => 'product',
                            'item_id' => 'item-2',
                            'sku' => 'SKU-NM-02',
                            'ean' => '858800123402',
                            'name' => $t['it2_name'],
                            'variant_title' => '30mm leštený',
                            'quantity' => 5.00,
                            'unit' => 'm²',
                            'unit_price' => 210.0000,
                            'discount_percent' => 0.00,
                            'tax_rate' => 20.00,
                            'total_net_amount' => 1050.00,
                            'total_gross_amount' => 1260.00,
                            'fulfilled_quantity' => 5.00,
                            'service_code' => null,
                            'notes' => 'Zabalené na A-stojane drevenej palety.',
                            'sort_order' => 1,
                        ],
                        [
                            'id' => 'oi-demo-11',
                            'item_type' => 'service',
                            'item_id' => null,
                            'sku' => 'SRV-GLS-PAL',
                            'ean' => null,
                            'name' => $t['s5_name'],
                            'variant_title' => null,
                            'quantity' => 1.00,
                            'unit' => $t['unit_srv'],
                            'unit_price' => 85.0000,
                            'discount_percent' => 0.00,
                            'tax_rate' => 20.00,
                            'total_net_amount' => 85.00,
                            'total_gross_amount' => 102.00,
                            'fulfilled_quantity' => 1.00,
                            'service_code' => 'SHIPPING-CARGO',
                            'notes' => 'Paletová preprava nadrozmerného nákladu.',
                            'sort_order' => 2,
                        ]
                    ]
                ]
            ];

            $insOrd = $pdo->prepare("INSERT INTO `orders` (
                `id`, `order_number`, `type`, `status`, `customer_type`, `client_id`, `supplier_id`,
                `guest_name`, `guest_email`, `guest_phone`, `guest_company`, `guest_ico`, `guest_dic`, `guest_ic_dph`,
                `delivery_recipient`, `delivery_street`, `delivery_city`, `delivery_zip`, `delivery_country`, `delivery_phone`, `delivery_notes`,
                `shipping_method`, `shipping_pickup_point_id`, `shipping_tracking_number`,
                `billing_name`, `billing_street`, `billing_city`, `billing_zip`, `billing_country`, `billing_ico`, `billing_dic`, `billing_ic_dph`,
                `payment_method`, `payment_status`, `paid_at`, `payment_reference`, `currency`,
                `items_net_amount`, `services_net_amount`, `total_net_amount`, `total_tax_amount`, `total_gross_amount`,
                `order_date`, `requested_delivery_date`, `confirmed_delivery_date`, `warehouse_id`, `notes`, `customer_note`, `created_by`
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?
            )");

            $insOi = $pdo->prepare("INSERT INTO `order_items` (
                `id`, `order_id`, `item_type`, `item_id`, `sku`, `ean`, `name`, `variant_title`,
                `quantity`, `unit`, `unit_price`, `discount_percent`, `tax_rate`,
                `total_net_amount`, `total_gross_amount`, `fulfilled_quantity`, `service_code`, `notes`, `sort_order`
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?
            )");

            foreach ($orders as $ord) {
                $items = $ord['items'];
                unset($ord['items']);
                $insOrd->execute([
                    $ord['id'],
                    $ord['order_number'],
                    $ord['type'],
                    $ord['status'],
                    $ord['customer_type'],
                    $ord['client_id'] ?? null,
                    $ord['supplier_id'] ?? null,
                    $ord['guest_name'] ?? null,
                    $ord['guest_email'] ?? null,
                    $ord['guest_phone'] ?? null,
                    $ord['guest_company'] ?? null,
                    $ord['guest_ico'] ?? null,
                    $ord['guest_dic'] ?? null,
                    $ord['guest_ic_dph'] ?? null,
                    $ord['delivery_recipient'] ?? null,
                    $ord['delivery_street'] ?? null,
                    $ord['delivery_city'] ?? null,
                    $ord['delivery_zip'] ?? null,
                    $ord['delivery_country'] ?? 'SK',
                    $ord['delivery_phone'] ?? null,
                    $ord['delivery_notes'] ?? null,
                    $ord['shipping_method'] ?? null,
                    $ord['shipping_pickup_point_id'] ?? null,
                    $ord['shipping_tracking_number'] ?? null,
                    $ord['billing_name'] ?? null,
                    $ord['billing_street'] ?? null,
                    $ord['billing_city'] ?? null,
                    $ord['billing_zip'] ?? null,
                    $ord['billing_country'] ?? 'SK',
                    $ord['billing_ico'] ?? null,
                    $ord['billing_dic'] ?? null,
                    $ord['billing_ic_dph'] ?? null,
                    $ord['payment_method'] ?? null,
                    $ord['payment_status'] ?? 'unpaid',
                    $ord['paid_at'] ?? null,
                    $ord['payment_reference'] ?? null,
                    $ord['currency'] ?? 'EUR',
                    $ord['items_net_amount'] ?? 0.00,
                    $ord['services_net_amount'] ?? 0.00,
                    $ord['total_net_amount'] ?? 0.00,
                    $ord['total_tax_amount'] ?? 0.00,
                    $ord['total_gross_amount'] ?? 0.00,
                    $ord['order_date'],
                    $ord['requested_delivery_date'] ?? null,
                    $ord['confirmed_delivery_date'] ?? null,
                    $ord['warehouse_id'] ?? null,
                    $ord['notes'] ?? null,
                    $ord['customer_note'] ?? null,
                    $ord['created_by'] ?? null,
                ]);

                foreach ($items as $oi) {
                    $insOi->execute([
                        $oi['id'],
                        $ord['id'],
                        $oi['item_type'],
                        $oi['item_id'] ?? null,
                        $oi['sku'] ?? null,
                        $oi['ean'] ?? null,
                        $oi['name'],
                        $oi['variant_title'] ?? null,
                        $oi['quantity'],
                        $oi['unit'],
                        $oi['unit_price'],
                        $oi['discount_percent'] ?? 0.00,
                        $oi['tax_rate'] ?? 20.00,
                        $oi['total_net_amount'],
                        $oi['total_gross_amount'],
                        $oi['fulfilled_quantity'] ?? 0.00,
                        $oi['service_code'] ?? null,
                        $oi['notes'] ?? null,
                        $oi['sort_order'] ?? 0,
                    ]);
                }
            }
        } catch (\Throwable $e) {
            error_log('[ccrm schema] orders seed skipped: ' . $e->getMessage());
        }
    }

    /**
     * Seeds demo project types, projects, and invoices/offers for demo installations.
     */
    function ccrm_seed_default_invoices_and_projects(PDO $pdo, string $systemLanguage = 'sk'): void {
        try {
            $demoMode = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'DEMO_MODE'");
            if (!$demoMode || $demoMode->fetchColumn() !== 'true') return;

            if (!in_array($systemLanguage, ['en', 'sk', 'hu'], true)) {
                $systemLanguage = 'sk';
                $stmtLang = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'");
                if ($stmtLang && ($val = $stmtLang->fetchColumn()) !== false) {
                    if (in_array($val, ['en', 'sk', 'hu'], true)) {
                        $systemLanguage = $val;
                    }
                }
            }

            $projTexts = [
                'sk' => [
                    'pt_name' => 'Zákazková kamenná výroba',
                    'pt_desc' => 'Výroba a montáž kamenných kuchynských dosiek, obkladov a schodov.',
                    'pr1_name' => 'Vila Slavín - Kamenné obklady fasády a interiéru',
                    'pr2_name' => 'Kuchyňa Trnava - Calacatta Quartz doska a zástena',
                    'off_title' => 'Cenová ponuka - Kuchynská doska Calacatta Quartz',
                    'off_subject' => 'Dodávka a opracovanie kamennej kuchynskej dosky s podstavným drezom',
                    'off_greet' => 'Vážený pán Novák, ďakujeme za prejavenú dôveru a záujem o naše služby.',
                    'off_item2' => 'Opracovanie výrezu pre podstavný drez vrátane leštenia hrán',
                    'off_item3' => 'Odborná montáž, lepenie spojov a zameranie Proliner',
                    'inv_title' => 'Faktúra - Calacatta Quartz kuchynská doska',
                    'inv_subject' => 'Fakturácia dodávky kamennej dosky podľa objednávky OBJ-2026-0001',
                    'inv_item1' => 'Calacatta Gold Quartz doska 20mm',
                    'inv_item2' => 'Keraflex Maxi S1 cementové lepidlo 25kg',
                    'inv_item3' => 'Kuriérska preprava DPD',
                    'unit_pack' => 'balenie',
                    'unit_srv' => 'služba',
                ],
                'en' => [
                    'pt_name' => 'Custom Stone Fabrication',
                    'pt_desc' => 'Bespoke manufacturing and installation of stone countertops, cladding and stairs.',
                    'pr1_name' => 'Villa Slavín - Exterior & Interior Stone Cladding',
                    'pr2_name' => 'Kitchen Trnava - Calacatta Quartz Worktop & Backsplash',
                    'off_title' => 'Price Quote - Calacatta Quartz Kitchen Worktop',
                    'off_subject' => 'Supply and fabrication of stone worktop with undermount sink',
                    'off_greet' => 'Dear Mr. Novák, thank you for your confidence in our craftsmanship.',
                    'off_item2' => 'Undermount sink cutout fabrication & edge polishing',
                    'off_item3' => 'Professional installation, joint gluing & Proliner laser templating',
                    'inv_title' => 'Invoice - Calacatta Quartz Kitchen Worktop',
                    'inv_subject' => 'Invoicing delivery of stone worktop per order OBJ-2026-0001',
                    'inv_item1' => 'Calacatta Gold Quartz Slab 20mm',
                    'inv_item2' => 'Keraflex Maxi S1 Cement Adhesive 25kg',
                    'inv_item3' => 'DPD Express Courier',
                    'unit_pack' => 'pack',
                    'unit_srv' => 'service',
                ],
                'hu' => [
                    'pt_name' => 'Egyedi kőmegmunkálás',
                    'pt_desc' => 'Kő konyhapultok, falburkolatok és lépcsők egyedi gyártása és beépítése.',
                    'pr1_name' => 'Slavín Villa - Homlokzati és beltéri kőburkolat',
                    'pr2_name' => 'Nagyszombat Konyha - Calacatta Quartz pult és hátfal',
                    'off_title' => 'Árajánlat - Calacatta Quartz konyhapult',
                    'off_subject' => 'Kő konyhapult szállítása és beépítése alulról épített mosogatóval',
                    'off_greet' => 'Tisztelt Novák Úr, köszönjük megtisztelő bizalmát.',
                    'off_item2' => 'Alulról beépített mosogató kivágása és élpolírozása',
                    'off_item3' => 'Szakszerű beépítés, illesztések ragasztása és Proliner lézeres felmérés',
                    'inv_title' => 'Számla - Calacatta Quartz konyhapult',
                    'inv_subject' => 'Kőlap számlázása az OBJ-2026-0001 megrendelés alapján',
                    'inv_item1' => 'Calacatta Gold Quartz lap 20mm',
                    'inv_item2' => 'Keraflex Maxi S1 cementkötésű ragasztó 25kg',
                    'inv_item3' => 'DPD futárszolgálat',
                    'unit_pack' => 'csomag',
                    'unit_srv' => 'szolgáltatás',
                ],
            ];
            $t = $projTexts[$systemLanguage] ?? $projTexts['sk'];

            // 1. Project Types
            $hasPtTable = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_types'")->fetchColumn();
            if ($hasPtTable > 0) {
                $ptCount = (int)$pdo->query("SELECT COUNT(*) FROM `project_types`")->fetchColumn();
                if ($ptCount === 0) {
                    $insPt = $pdo->prepare("INSERT INTO `project_types` (`id`, `name`, `description`, `icon`, `color`, `attributes_json`, `has_timeline`, `has_gantt`, `has_deadline`, `deadline_warning_days`, `deadline_required`, `has_files`, `has_tickets`) VALUES (?, ?, ?, ?, ?, '[]', 1, 1, 1, 7, 0, 1, 1)");
                    $insPt->execute(['pt_luxury_stone', $t['pt_name'], $t['pt_desc'], 'Boxes', '#10b981']);
                }
            }

            // 2. Projects
            $hasProjTable = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects'")->fetchColumn();
            if ($hasProjTable > 0) {
                $projCount = (int)$pdo->query("SELECT COUNT(*) FROM `projects`")->fetchColumn();
                if ($projCount === 0) {
                    $insProj = $pdo->prepare("INSERT INTO `projects` (`id`, `project_type_id`, `name`, `lead_id`, `client_id`, `status`, `division`, `rating`, `deadline`, `start_date`, `budget`, `value`, `ticket_widget_enabled`, `ticket_allowed_domains`, `ticket_public_hash`, `archived`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0)");
                    $insProj->execute(['proj-vila-slavin', 'pt_luxury_stone', $t['pr1_name'], 'lead-1', 'lead-1', 'active', 'Cstudios', 5, '2026-08-30', '2026-05-15', 6500.00, 12500.00, json_encode(['localhost', '127.0.0.1', 'slavin-residence.sk']), bin2hex(random_bytes(16))]);
                    $insProj->execute(['proj-kuchyna-neolith', 'pt_luxury_stone', $t['pr2_name'], 'lead-2', 'lead-2', 'active', 'Cstudios', 4, '2026-07-15', '2026-05-18', 4200.00, 8400.00, json_encode(['localhost', '127.0.0.1']), bin2hex(random_bytes(16))]);

                    // Project Managers
                    if ((int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_managers'")->fetchColumn() > 0) {
                        $insPm = $pdo->prepare("INSERT INTO `project_managers` (`project_id`, `user_id`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `user_id` = VALUES(`user_id`)");
                        $insPm->execute(['proj-vila-slavin', 'u-' . md5('alex@crm.com')]);
                        $insPm->execute(['proj-kuchyna-neolith', 'u-' . md5('sam@crm.com')]);
                    }
                }
            }

            // 3. Invoices & Offers
            $hasIoTable = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices_offers'")->fetchColumn();
            if ($hasIoTable > 0) {
                $ioCount = (int)$pdo->query("SELECT COUNT(*) FROM `invoices_offers`")->fetchColumn();
                if ($ioCount === 0) {
                    $insIo = $pdo->prepare("INSERT INTO `invoices_offers` (
                        `id`, `document_number`, `type`, `mode`, `lead_id`, `client_id`, `client_name`, `client_email`, `client_phone`,
                        `client_street`, `client_city`, `client_postal_code`, `client_country`, `client_ico`, `client_dic`, `client_icdph`,
                        `title`, `subject`, `location`, `greeting_note`, `subtotal`, `vat_amount`, `total_price`, `currency`,
                        `status`, `status_changed_at`, `issued_at`, `valid_until`, `due_date`, `created_by`
                    ) VALUES (
                        ?, ?, ?, 'default', ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?, ?, ?, 'EUR',
                        ?, ?, ?, ?, ?, ?
                    )");

                    $insIoi = $pdo->prepare("INSERT INTO `invoice_offer_items` (
                        `id`, `invoice_offer_id`, `warehouse_item_id`, `sku`, `name`, `description`, `quantity`, `unit`, `unit_price`, `vat_rate`, `discount_pct`, `total_price`
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

                    // Offer 1: Price Offer for Ján Novák
                    $insIo->execute([
                        'off-demo-1', 'CP-2026-0001', 'price_offer', 'lead-1', 'lead-1', 'Ján Novák', 'novak@example.com', '+421 905 123 456',
                        'Mlynské Nivy 42', 'Bratislava', '821 09', 'Slovakia', '36123456', '2021234567', 'SK2021234567',
                        $t['off_title'], $t['off_subject'], 'Bratislava', $t['off_greet'],
                        3450.00, 690.00, 4140.00,
                        'approved', '2026-05-18', '2026-05-16', '2026-06-16', null, 'Sam'
                    ]);

                    $insIoi->execute(['ioi-demo-1', 'off-demo-1', 'item-1', 'SKU-CQ-01', $t['inv_item1'], 'Prémiová kremenná kompozitná platňa hrúbky 20mm', 2.0000, 'm²', 185.0000, 20.00, 0.00, 444.00]);
                    $insIoi->execute(['ioi-demo-2', 'off-demo-1', null, 'SRV-CUT-SINK', $t['off_item2'], 'CNC rezanie vodným lúčom a ručné brúsenie/leštenie hrany', 1.0000, 'ks', 280.0000, 20.00, 0.00, 336.00]);
                    $insIoi->execute(['ioi-demo-3', 'off-demo-1', null, 'SRV-INSTALL', $t['off_item3'], 'Zameranie, doprava, vynáška, osadenie a chemické kotvenie', 1.0000, 'komplet', 450.0000, 20.00, 0.00, 540.00]);

                    // Invoice 1: Invoice for Ján Novák (OBJ-2026-0001)
                    $insIo->execute([
                        'inv-demo-1', 'FA-2026-0001', 'invoice', 'lead-1', 'lead-1', 'Ján Novák', 'novak@example.com', '+421 905 123 456',
                        'Mlynské Nivy 42', 'Bratislava', '821 09', 'Slovakia', '36123456', '2021234567', 'SK2021234567',
                        $t['inv_title'], $t['inv_subject'], 'Bratislava', null,
                        483.00, 96.60, 579.60,
                        'sent', '2026-05-22', '2026-05-22', null, '2026-06-05', 'Sam'
                    ]);

                    $insIoi->execute(['ioi-demo-4', 'inv-demo-1', 'item-1', 'SKU-CQ-01', $t['inv_item1'], null, 2.0000, 'm²', 185.0000, 20.00, 0.00, 444.00]);
                    $insIoi->execute(['ioi-demo-5', 'inv-demo-1', 'item-4', 'SKU-MAP-04', $t['inv_item2'], null, 4.0000, $t['unit_pack'], 24.5000, 20.00, 0.00, 117.60]);
                    $insIoi->execute(['ioi-demo-6', 'inv-demo-1', null, 'SRV-DPD', $t['inv_item3'], null, 1.0000, $t['unit_srv'], 15.0000, 20.00, 0.00, 18.00]);
                }
            }
        } catch (\Throwable $e) {
            error_log('[ccrm schema] invoices and projects seed skipped: ' . $e->getMessage());
        }
    }

    /**
     * One-time repair for demo installs that already hit the 'pending' ENUM bug:
     * the seed inserted the employees, all salaries and the vacations that came
     * before the first 'pending' one, then died. `employees` was no longer empty,
     * so the seed never retried and those installs keep a calendar with a handful
     * of leave records.
     *
     * Deliberately narrow, because it deletes rows. It acts only when ALL hold:
     *  - DEMO_MODE is 'true' (never a real installation);
     *  - the four seeded employees exist;
     *  - every vacation row is a seeded `vac-demo-N` row nobody has edited
     *    (updated_at = created_at) — a user's own or touched leave is never replaced;
     *  - none of them is 'pending' (a healthy seed always contains some).
     * Salaries and employees were written completely by the failed run, so only
     * vacations are rebuilt. Runs in one transaction and is idempotent: once the
     * pending rows exist the signature no longer matches.
     */
    function ccrm_repair_demo_employee_vacations(PDO $pdo): void {
        $ownTransaction = false;
        try {
            $hasTables = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('employees', 'employee_vacations', 'system_settings')")->fetchColumn();
            if ($hasTables < 3) return;

            $demoMode = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'DEMO_MODE'")->fetchColumn();
            if ($demoMode !== 'true') return;

            $seeded = (int)$pdo->query("SELECT COUNT(*) FROM `employees` WHERE `id` IN ('emp-1', 'emp-2', 'emp-3', 'emp-4')")->fetchColumn();
            if ($seeded < 4) return;

            $total = (int)$pdo->query("SELECT COUNT(*) FROM `employee_vacations`")->fetchColumn();
            if ($total === 0) return;
            $untouchedSeed = (int)$pdo->query(
                "SELECT COUNT(*) FROM `employee_vacations`
                 WHERE `id` REGEXP '^vac-demo-[0-9]+$' AND `updated_at` = `created_at` AND `status` <> 'pending'"
            )->fetchColumn();
            if ($untouchedSeed !== $total) return;

            if (!$pdo->inTransaction()) {
                $pdo->beginTransaction();
                $ownTransaction = true;
            }
            $pdo->exec("DELETE FROM `employee_vacations` WHERE `id` REGEXP '^vac-demo-[0-9]+$'");
            $insVac = $pdo->prepare("INSERT INTO `employee_vacations` (`id`, `employee_id`, `vacation_type_id`, `start_date`, `end_date`, `days_count`, `status`, `note`, `approved_by`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            foreach (ccrm_demo_employee_vacations(new \DateTimeImmutable('now')) as $row) {
                $insVac->execute($row);
            }
            if ($ownTransaction) $pdo->commit();
            error_log('[ccrm schema] demo vacations repaired after the pending-status seed failure');
        } catch (\Throwable $e) {
            if ($ownTransaction && $pdo->inTransaction()) $pdo->rollBack();
            error_log('[ccrm schema] demo vacation repair skipped: ' . $e->getMessage());
        }
    }

    /**
     * Migrates ticket system tables and columns on leads, project_types, and projects.
     */
    function ccrm_migrate_tickets(PDO $pdo, bool $backfillHashes = true): void {
        try {
            if (!ccrm_column_exists($pdo, 'project_types', 'has_tickets')) {
                try { $pdo->exec("ALTER TABLE `project_types` ADD COLUMN `has_tickets` TINYINT(1) NOT NULL DEFAULT 0 AFTER `has_files`"); } catch (\Throwable $e) {}
            }
            if (!ccrm_column_exists($pdo, 'leads', 'ticket_allowed_emails')) {
                try { $pdo->exec("ALTER TABLE `leads` ADD COLUMN `ticket_allowed_emails` TEXT NULL COMMENT 'JSON array of whitelisted sender emails/domains for support tickets' AFTER `client_category_id`"); } catch (\Throwable $e) {}
            }
            $projCols = [
                'ticket_widget_enabled' => "ALTER TABLE `projects` ADD COLUMN `ticket_widget_enabled` TINYINT(1) NOT NULL DEFAULT 0 AFTER `custom_files_json`",
                'ticket_allowed_domains' => "ALTER TABLE `projects` ADD COLUMN `ticket_allowed_domains` TEXT NULL COMMENT 'JSON array of whitelisted hostnames' AFTER `ticket_widget_enabled`",
                'ticket_allowed_emails' => "ALTER TABLE `projects` ADD COLUMN `ticket_allowed_emails` TEXT NULL COMMENT 'JSON array of whitelisted sender emails/domains' AFTER `ticket_allowed_domains`",
                'ticket_public_hash' => "ALTER TABLE `projects` ADD COLUMN `ticket_public_hash` VARCHAR(64) NULL UNIQUE COMMENT 'Cryptographically random unguessable token for public ticket status URL' AFTER `ticket_allowed_emails`",
                'ticket_widget_config_json' => "ALTER TABLE `projects` ADD COLUMN `ticket_widget_config_json` TEXT NULL COMMENT 'JSON config for floating widget color, position, greeting, language' AFTER `ticket_public_hash`",
            ];
            foreach ($projCols as $col => $sql) {
                if (!ccrm_column_exists($pdo, 'projects', $col)) {
                    try { $pdo->exec($sql); } catch (\Throwable $e) {}
                }
            }

            // Backfill ticket_public_hash on projects missing one. Only for trusted callers
            // (schema upgrade, signed-in requests): the public widget and status board call
            // this migration too, and an anonymous request must not write to the database
            // (VULN-08).
            if ($backfillHashes) try {
                $missingHashes = $pdo->query("SELECT `id` FROM `projects` WHERE `ticket_public_hash` IS NULL OR `ticket_public_hash` = ''")->fetchAll(PDO::FETCH_COLUMN);
                if (!empty($missingHashes)) {
                    $updHash = $pdo->prepare("UPDATE `projects` SET `ticket_public_hash` = ? WHERE `id` = ?");
                    foreach ($missingHashes as $pid) {
                        $updHash->execute([bin2hex(random_bytes(16)), $pid]);
                    }
                }
            } catch (\Throwable $e) {}

            // Ensure support_contracts, tickets, ticket_messages, ticket_task_links, ticket_time_entries exist
            $ticketTables = ['support_contracts', 'tickets', 'ticket_messages', 'ticket_task_links', 'ticket_time_entries'];
            $statements = ccrm_schema_statements();
            foreach ($ticketTables as $tbl) {
                $exists = (int)$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = " . $pdo->quote($tbl)
                )->fetchColumn() > 0;
                if (!$exists) {
                    foreach ($statements as $stmt) {
                        if (strpos($stmt, "`{$tbl}`") !== false && strpos($stmt, "CREATE TABLE") !== false) {
                            try { $pdo->exec($stmt); } catch (\Throwable $e) {}
                        }
                    }
                }
            }

            // Ensure event_type column on ticket_messages and VARCHAR(50) on tickets.type / tickets.source
            $hasEventTypeCol = (int)$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket_messages' AND COLUMN_NAME = 'event_type'"
            )->fetchColumn() > 0;
            if (!$hasEventTypeCol) {
                try {
                    $pdo->exec("ALTER TABLE `ticket_messages` ADD COLUMN `event_type` VARCHAR(50) NULL AFTER `is_internal`");
                } catch (\Throwable $e) {}
            }
            try {
                $pdo->exec("ALTER TABLE `tickets` MODIFY COLUMN `type` VARCHAR(50) DEFAULT 'support', MODIFY COLUMN `source` VARCHAR(50) DEFAULT 'manual'");
            } catch (\Throwable $e) {}
            $hasRelatedTicketCol = (int)$pdo->query(
                "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'related_ticket_id'"
            )->fetchColumn() > 0;
            if (!$hasRelatedTicketCol) {
                try {
                    $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `related_ticket_id` VARCHAR(64) NULL AFTER `related_project_id`");
                    $pdo->exec("ALTER TABLE `tasks` ADD INDEX idx_task_ticket (`related_ticket_id`)");
                } catch (\Throwable $e) {}
            }
            try {
                $pdo->exec("UPDATE `tasks` t INNER JOIN `ticket_task_links` tt ON tt.task_id = t.id SET t.related_ticket_id = tt.ticket_id WHERE t.related_ticket_id IS NULL OR t.related_ticket_id = ''");
                $pdo->exec("UPDATE `projects` SET `name` = 'Vila Slavín – Kamenná fasáda a terasa' WHERE `id` = 'proj-vila-slavin' AND (`name` IS NULL OR `name` = '')");
                $pdo->exec("UPDATE `projects` SET `name` = 'Kuchynský ostrov Neolith Calacatta' WHERE `id` = 'proj-kuchyna-neolith' AND (`name` IS NULL OR `name` = '')");
                $pdo->exec("UPDATE `projects` SET `ticket_widget_enabled` = 1, `ticket_allowed_domains` = '[\"localhost\",\"127.0.0.1\",\"slavin-residence.sk\"]' WHERE `id` = 'proj-vila-slavin' AND (`ticket_allowed_domains` IS NULL OR `ticket_allowed_domains` = '' OR `ticket_allowed_domains` = '[]')");
            } catch (\Throwable $e) {}

            // Seed default TICKET_STATUSES and TICKET_SETTINGS if absent
            $hasSettingsTable = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings'")->fetchColumn();
            if ($hasSettingsTable > 0) {
                $tStatuses = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'TICKET_STATUSES'")->fetchColumn();
                if ($tStatuses === false || $tStatuses === null) {
                    $defaultStatuses = json_encode([
                        ['id' => 'new', 'key' => 'new', 'category' => 'new', 'group' => 'new', 'color' => '#0ea5e9', 'isDefault' => true, 'pausesSla' => false, 'isTerminal' => false, 'sortOrder' => 1, 'labelSk' => 'Nový', 'labelEn' => 'New', 'labelHu' => 'Új'],
                        ['id' => 'open', 'key' => 'open', 'category' => 'open', 'group' => 'open', 'color' => '#f59e0b', 'isDefault' => false, 'pausesSla' => false, 'isTerminal' => false, 'sortOrder' => 2, 'labelSk' => 'V riešení', 'labelEn' => 'In Progress', 'labelHu' => 'Folyamatban'],
                        ['id' => 'waiting_client', 'key' => 'waiting_client', 'category' => 'waiting', 'group' => 'waiting', 'color' => '#a855f7', 'isDefault' => false, 'pausesSla' => true, 'isTerminal' => false, 'sortOrder' => 3, 'labelSk' => 'Čaká sa na klienta', 'labelEn' => 'Waiting on Client', 'labelHu' => 'Ügyfélre vár'],
                        ['id' => 'waiting_third_party', 'key' => 'waiting_third_party', 'category' => 'waiting', 'group' => 'waiting', 'color' => '#8b5cf6', 'isDefault' => false, 'pausesSla' => true, 'isTerminal' => false, 'sortOrder' => 4, 'labelSk' => 'Čaká sa na 3. stranu', 'labelEn' => 'Waiting on 3rd Party', 'labelHu' => '3. félre vár'],
                        ['id' => 'scheduled', 'key' => 'scheduled', 'category' => 'open', 'group' => 'open', 'color' => '#6366f1', 'isDefault' => false, 'pausesSla' => false, 'isTerminal' => false, 'sortOrder' => 5, 'labelSk' => 'Naplánované', 'labelEn' => 'Scheduled', 'labelHu' => 'Ütemezve'],
                        ['id' => 'resolved', 'key' => 'resolved', 'category' => 'resolved', 'group' => 'resolved', 'color' => '#10b981', 'isDefault' => false, 'pausesSla' => true, 'isTerminal' => true, 'sortOrder' => 6, 'labelSk' => 'Vyriešený', 'labelEn' => 'Resolved', 'labelHu' => 'Megoldva'],
                        ['id' => 'closed', 'key' => 'closed', 'category' => 'closed', 'group' => 'closed', 'color' => '#64748b', 'isDefault' => false, 'pausesSla' => true, 'isTerminal' => true, 'sortOrder' => 7, 'labelSk' => 'Uzavretý', 'labelEn' => 'Closed', 'labelHu' => 'Lezárva'],
                    ], JSON_UNESCAPED_UNICODE);
                    $ins = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('TICKET_STATUSES', ?)");
                    $ins->execute([$defaultStatuses]);
                }

                $tSettings = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'TICKET_SETTINGS'")->fetchColumn();
                if ($tSettings === false || $tSettings === null) {
                    $defaultSettings = json_encode([
                        'imapEnabled' => false,
                        'imapHost' => '',
                        'imapPort' => 993,
                        'imapEncryption' => 'ssl',
                        'imapUsername' => '',
                        'imapPassword' => '',
                        'imapFolder' => 'INBOX',
                        'supportEmailAddress' => 'support@company.com',
                        'aiRoutingEnabled' => true,
                        'openAiKey' => '',
                        'autoReplyOnCreate' => false,
                        'autoCloseResolvedDays' => 5,
                        'businessHoursStart' => '09:00',
                        'businessHoursEnd' => '17:00',
                        'businessDays' => [1, 2, 3, 4, 5],
                        'slaTargets' => [
                            'critical' => ['responseHours' => 1, 'resolveHours' => 4],
                            'high' => ['responseHours' => 4, 'resolveHours' => 16],
                            'normal' => ['responseHours' => 8, 'resolveHours' => 40],
                            'low' => ['responseHours' => 24, 'resolveHours' => 120],
                        ],
                        'replyTemplates' => [
                            [
                                'id' => 'tpl-ack',
                                'title' => 'Potvrdenie prijatia / Acknowledged',
                                'name' => 'Potvrdenie prijatia / Acknowledged',
                                'subject' => 'Re: {{ticket_number}} - {{ticket_title}}',
                                'body' => "Dobrý deň {{client_name}},\n\nďakujeme za nahlásenie požiadavky ({{ticket_number}}). Náš tím sa jej už venuje a čoskoro Vás budeme informovať o postupe.\n\nS pozdravom,\n{{agent_name}}"
                            ],
                            [
                                'id' => 'tpl-need-info',
                                'title' => 'Doplnenie informácií / Need More Info',
                                'name' => 'Doplnenie informácií / Need More Info',
                                'subject' => 'Re: {{ticket_number}} - Prosba o doplnenie',
                                'body' => "Dobrý deň {{client_name}},\n\npre doriešenie požiadavky {{ticket_number}} by sme potrebovali doplniť nasledovné podrobnosti:\n- \n\nĎakujeme,\n{{agent_name}}"
                            ],
                            [
                                'id' => 'tpl-resolved',
                                'title' => 'Vyriešené / Resolved',
                                'name' => 'Vyriešené / Resolved',
                                'subject' => 'Re: {{ticket_number}} - Vyriešené',
                                'body' => "Dobrý deň {{client_name}},\n\npožiadavka {{ticket_number}} bola vyriešená. Prosím skontrolujte výsledok a v prípade otázok odpovedzte na túto správu.\n\nS pozdravom,\n{{agent_name}}"
                            ],
                        ],
                    ], JSON_UNESCAPED_UNICODE);
                    $ins = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('TICKET_SETTINGS', ?)");
                    $ins->execute([$defaultSettings]);
                } else {
                    $decodedSettings = json_decode((string)$tSettings, true);
                    if (is_array($decodedSettings) && isset($decodedSettings['replyTemplates']) && is_array($decodedSettings['replyTemplates'])) {
                        $changed = false;
                        foreach ($decodedSettings['replyTemplates'] as &$tpl) {
                            if (is_array($tpl) && empty($tpl['title']) && !empty($tpl['name'])) {
                                $tpl['title'] = $tpl['name'];
                                $changed = true;
                            }
                        }
                        unset($tpl);
                        if ($changed) {
                            $upd = $pdo->prepare("UPDATE `system_settings` SET `value` = ? WHERE `key` = 'TICKET_SETTINGS'");
                            $upd->execute([json_encode($decodedSettings, JSON_UNESCAPED_UNICODE)]);
                        }
                    }
                }
            }
        } catch (\Throwable $e) {
            error_log('[ccrm] ccrm_migrate_tickets: ' . $e->getMessage());
        }
    }

    /**
     * Seeds realistic sample tickets, messages, time entries, and support contract on fresh/demo installs.
     */
    function ccrm_seed_default_tickets(PDO $pdo): void {
        try {
            $hasTicketsTable = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tickets'")->fetchColumn();
            if ($hasTicketsTable === 0) return;

            $ticketCount = (int)$pdo->query("SELECT COUNT(*) FROM `tickets`")->fetchColumn();
            if ($ticketCount > 0) return;

            // Ensure demo project type has tickets enabled
            try {
                $pdo->exec("UPDATE `project_types` SET `has_tickets` = 1 WHERE `id` = 'pt_luxury_stone'");
                $pdo->exec("UPDATE `projects` SET `ticket_widget_enabled` = 1, `ticket_allowed_domains` = '[\"localhost\",\"127.0.0.1\",\"slavin-residence.sk\"]' WHERE `id` = 'proj-vila-slavin' AND (`ticket_allowed_domains` IS NULL OR `ticket_allowed_domains` = '')");
            } catch (\Throwable $e) {}

            $language = 'sk';
            try {
                $langRaw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'")->fetchColumn();
                if (is_string($langRaw) && in_array($langRaw, ['sk', 'en', 'hu'], true)) {
                    $language = $langRaw;
                }
            } catch (\Throwable $e) {}

            $texts = [
                'sk' => [
                    't1_title' => 'Chyba pri odosielaní kontaktného formulára na podstránke cenníka',
                    't1_desc' => 'Pri kliknutí na tlačidlo Odoslať dopyt na podstránke /cennik vyskočí v konzole chyba TypeError: Cannot read properties of null (reading \'value\') a formulár sa neodošle.',
                    't1_msg1' => 'Dobrý deň, posielam screenshot a zachytenú chybu z prehliadača. Prosím o urgentnú opravu, beží nám kampaň.',
                    't1_msg2' => 'Príčina identifikovaná v chýbajúcom poli #phone-prefix pri mobilnom zobrazení. Pripravujem opravu.',
                    't2_title' => 'Úprava rozmerov výrezu pre varnú dosku v technickom výkrese',
                    't2_desc' => 'Prosíme o úpravu šírky výrezu v technickej dokumentácii projektu z 560mm na 564mm podľa novej špecifikácie spotrebiča Bora.',
                    't2_msg1' => 'Dobrý deň, v prílohe posielam aktualizovaný technický list spotrebiča. Prosím o potvrdenie zapracovania.',
                    't2_msg2' => 'Dobrý deň pán Novák, výkres sme aktualizovali na 564mm a poslali do výroby.',
                    'sc_notes' => 'Prioritná projektová a webová podpora SLA Pro',
                ],
                'en' => [
                    't1_title' => 'Contact form submission error on pricing subpage',
                    't1_desc' => 'Clicking Submit Inquiry on /pricing throws TypeError: Cannot read properties of null (reading \'value\') and fails to submit.',
                    't1_msg1' => 'Hello, sending screenshot and captured console error from the widget. Please fix urgently as our campaign is live.',
                    't1_msg2' => 'Root cause identified in missing #phone-prefix input on mobile viewport. Deploying fix.',
                    't2_title' => 'Adjust cooktop cutout dimensions in technical drawing',
                    't2_desc' => 'Please update the cutout width in the project CAD specification from 560mm to 564mm per the new Bora appliance sheet.',
                    't2_msg1' => 'Hi team, please confirm once the CAD file is updated.',
                    't2_msg2' => 'Hello Mr. Novák, we updated the CAD drawing to 564mm and forwarded it to CNC production.',
                    'sc_notes' => 'Priority project & web support SLA Pro',
                ],
                'hu' => [
                    't1_title' => 'Hiba a kapcsolatfelvételi űrlap beküldésekor az árlista aloldalon',
                    't1_desc' => 'Az ajánlatkérés gombra kattintva a /arlista oldalon TypeError: Cannot read properties of null (reading \'value\') hiba jelentkezik.',
                    't1_msg1' => 'Üdvözlöm, küldöm a képernyőképet és a konzolhibát. Kérem sürgősen javítsák, mert fut a kampányunk.',
                    't1_msg2' => 'A hibát a mobil nézetben hiányzó #phone-prefix mező okozza. Javítás folyamatban.',
                    't2_title' => 'Főzőlap kivágási méretének módosítása a műszaki rajzon',
                    't2_desc' => 'Kérjük a kivágás szélességének módosítását 560mm-ről 564mm-re az új Bora specifikáció alapján.',
                    't2_msg1' => 'Üdvözlöm, kérem jelezzenek vissza, amint frissült a műszaki rajz.',
                    't2_msg2' => 'Tisztelt Novák Úr, a rajzot frissítettük 564mm-re és továbbítottuk a gyártásnak.',
                    'sc_notes' => 'Kiemelt projekt és webes támogatás SLA Pro',
                ],
            ];
            $tx = $texts[$language] ?? $texts['sk'];

            // Seed support contract
            $insSc = $pdo->prepare("INSERT INTO `support_contracts` (`id`, `client_id`, `project_id`, `tier`, `monthly_hours`, `hourly_rate`, `sla_response_critical_hours`, `sla_response_high_hours`, `sla_response_normal_hours`, `sla_response_low_hours`, `sla_resolve_critical_hours`, `sla_resolve_high_hours`, `sla_resolve_normal_hours`, `sla_resolve_low_hours`, `valid_from`, `valid_until`, `notes`) VALUES (?, ?, ?, 'pro', 10.00, 65.00, 1.00, 4.00, 8.00, 24.00, 4.00, 16.00, 40.00, 120.00, '2026-01-01', '2026-12-31', ?)");
            $insSc->execute(['sc-demo-1', 'lead-1', 'proj-vila-slavin', $tx['sc_notes']]);

            $now = date('Y-m-d H:i:s');
            $respDue1 = date('Y-m-d H:i:s', strtotime('+2 hours'));
            $resDue1 = date('Y-m-d H:i:s', strtotime('+12 hours'));
            $created2 = date('Y-m-d H:i:s', strtotime('-1 day'));
            $respAt2 = date('Y-m-d H:i:s', strtotime('-22 hours'));
            $resAt2 = date('Y-m-d H:i:s', strtotime('-18 hours'));

            $meta1 = json_encode([
                'url' => 'https://slavin-residence.sk/cennik',
                'userAgent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
                'viewport' => '1440x900',
                'origin' => 'https://slavin-residence.sk',
                'errors' => [
                    [
                        'type' => 'onerror',
                        'message' => "Uncaught TypeError: Cannot read properties of null (reading 'value')",
                        'source' => 'https://slavin-residence.sk/assets/form.js:142:29',
                        'timestamp' => date('c', strtotime('-15 minutes'))
                    ]
                ]
            ], JSON_UNESCAPED_UNICODE);

            $insT = $pdo->prepare("INSERT INTO `tickets` (
                `id`, `ticket_number`, `title`, `description`, `status`, `priority`, `type`, `source`,
                `project_id`, `client_id`, `reporter_name`, `reporter_email`, `reporter_phone`,
                `assignee_id`, `assignee_name`, `watchers_json`, `tags_json`, `metadata_json`,
                `first_response_due_at`, `first_responded_at`, `resolve_due_at`, `resolved_at`, `created_at`
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

            $insT->execute([
                'tck-demo-1', 'TCK-000001', $tx['t1_title'], $tx['t1_desc'], 'in_progress', 'high', 'bug', 'widget',
                'proj-vila-slavin', 'lead-1', 'Ján Novák', 'novak@example.com', '+421 905 123 456',
                'u-' . md5('alex@crm.com'), 'Alex', json_encode(['Sam']), json_encode(['widget', 'frontend', 'urgent']), $meta1,
                $respDue1, $now, $resDue1, null, $now
            ]);

            $insT->execute([
                'tck-demo-2', 'TCK-000002', $tx['t2_title'], $tx['t2_desc'], 'resolved', 'normal', 'request', 'email',
                'proj-vila-slavin', 'lead-1', 'Ján Novák', 'novak@example.com', '+421 905 123 456',
                'u-' . md5('sam@crm.com'), 'Sam', json_encode([]), json_encode(['cad', 'výroba']), null,
                date('Y-m-d H:i:s', strtotime('-16 hours')), $respAt2, date('Y-m-d H:i:s', strtotime('+24 hours')), $resAt2, $created2
            ]);

            $insMsg = $pdo->prepare("INSERT INTO `ticket_messages` (`id`, `ticket_id`, `author_type`, `author_user_id`, `author_name`, `author_email`, `is_internal`, `body`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $insMsg->execute(['tmsg-demo-1', 'tck-demo-1', 'client', null, 'Ján Novák', 'novak@example.com', 0, $tx['t1_msg1'], $now]);
            $insMsg->execute(['tmsg-demo-2', 'tck-demo-1', 'agent', 'u-' . md5('alex@crm.com'), 'Alex', 'alex@crm.com', 1, $tx['t1_msg2'], $now]);
            $insMsg->execute(['tmsg-demo-3', 'tck-demo-2', 'client', null, 'Ján Novák', 'novak@example.com', 0, $tx['t2_msg1'], $created2]);
            $insMsg->execute(['tmsg-demo-4', 'tck-demo-2', 'agent', 'u-' . md5('sam@crm.com'), 'Sam', 'sam@crm.com', 0, $tx['t2_msg2'], $resAt2]);

            $insTime = $pdo->prepare("INSERT INTO `ticket_time_entries` (`id`, `ticket_id`, `user_id`, `user_name`, `minutes`, `billable`, `note`, `logged_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $insTime->execute(['ttime-demo-1', 'tck-demo-1', 'u-' . md5('alex@crm.com'), 'Alex', 45, 1, 'Diagnostika chyby formulára cez widget logy', date('Y-m-d')]);
            $insTime->execute(['ttime-demo-2', 'tck-demo-2', 'u-' . md5('sam@crm.com'), 'Sam', 30, 1, 'Úprava CAD výkresu 564mm', date('Y-m-d', strtotime('-1 day'))]);
        } catch (\Throwable $e) {
            error_log('[ccrm schema] tickets seed skipped: ' . $e->getMessage());
        }
    }

    /**
     * Identity of the schema CODE: a hash of every file whose edit can change
     * what ccrm_apply_schema() does. Stored in system_settings once the schema
     * has been applied, so a request can tell "already done for this code".
     */
    function ccrm_schema_fingerprint(): string {
        $parts = [];
        foreach ([__FILE__, __DIR__ . '/employee_name.php', __DIR__ . '/lead_client_backfill.php'] as $file) {
            $parts[] = is_file($file) ? md5_file($file) : '-';
        }
        return md5(implode('|', $parts));
    }

    /**
     * Create all tables (idempotent) and apply in-place migrations.
     *
     * The work is skipped when this database was already brought up to date by
     * the same schema code. sync.php calls this on EVERY request, and the SPA
     * polls it every 5 seconds: ~57 CREATE TABLE IF NOT EXISTS plus the
     * migration checks cost about 2.3s per call on a Docker Desktop database
     * (a plain SELECT is under 1ms), which made every probe slow, stacked the
     * polls on top of each other and wrote a log line per request. Editing
     * schema.php or a file it loads changes the fingerprint and re-runs it once.
     */
    function ccrm_apply_schema(PDO $pdo): void {
        $fingerprint = ccrm_schema_fingerprint();
        if (ccrm_schema_is_current($pdo, $fingerprint)) {
            return;
        }

        // Single-flight. When the fingerprint changes (a deploy, an edit of
        // schema.php) every open tab's poll arrives at once; run side by side
        // their DDL queues on MySQL metadata locks and each request hangs for
        // tens of seconds. One request applies the schema, the others wait here
        // and then find it current.
        $locked = false;
        try {
            $locked = (int)$pdo->query("SELECT GET_LOCK('ccrm_schema_apply', 60)")->fetchColumn() === 1;
            if ($locked && ccrm_schema_is_current($pdo, $fingerprint)) {
                return;
            }

            foreach (ccrm_schema_statements() as $sql) {
                $pdo->exec($sql);
            }
            ccrm_apply_migrations($pdo);

            $mark = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('SCHEMA_FINGERPRINT', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
            $mark->execute([$fingerprint]);
        } finally {
            if ($locked) {
                $pdo->query("SELECT RELEASE_LOCK('ccrm_schema_apply')")->fetchColumn();
            }
        }
    }

    function ccrm_schema_is_current(PDO $pdo, string $fingerprint): bool {
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'SCHEMA_FINGERPRINT'");
            $stmt->execute();
            return $stmt->fetchColumn() === $fingerprint;
        } catch (\Throwable $e) {
            // system_settings does not exist yet (fresh database).
            return false;
        }
    }
}

