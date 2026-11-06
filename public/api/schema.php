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
require_once __DIR__ . '/payroll_lib.php';

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
              `task_kind` VARCHAR(20) NULL COMMENT 'NULL = normal task, recurring = series template',
              `recurrence_json` TEXT NULL COMMENT 'Template only: recurrence schedule config and cursor',
              `recurring_source_id` VARCHAR(50) NULL COMMENT 'Occurrence only: template id',
              `recurring_occurrence_date` DATE NULL COMMENT 'Occurrence only: the unshifted scheduled date',
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
              `division` VARCHAR(100) NULL COMMENT 'Assigned Division (e.g. Head office, Branch Budapest)',
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
              `task_kind` VARCHAR(20) NULL COMMENT 'NULL = normal task, recurring = series template',
              `recurrence_json` TEXT NULL COMMENT 'Template only: recurrence schedule config and cursor',
              `recurring_source_id` VARCHAR(50) NULL COMMENT 'Occurrence only: template id',
              `recurring_occurrence_date` DATE NULL COMMENT 'Occurrence only: the unshifted scheduled date',
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
              `type` ENUM('phone', 'email', 'note', 'offer', 'appointment', 'order', 'proforma_invoice', 'advance_receipt', 'invoice', 'delivery_note', 'status_change', 'whatsapp') NOT NULL DEFAULT 'note',
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
              `external_url` VARCHAR(255) NULL COMMENT 'Deep link path into the external system (e.g. /c/xyz?m=abc)',
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
              `external_source` VARCHAR(20) NULL COMMENT 'Integration client code that pushed this task (waai)',
              `external_url` VARCHAR(255) NULL COMMENT 'Path of the source chat in the external system',
              `external_meta_json` TEXT NULL COMMENT 'Chat title, assignee label, due_inferred flag',
              `metadata_json` TEXT NULL COMMENT 'Plugin support',
              `task_kind` VARCHAR(20) NULL COMMENT 'NULL = normal task, recurring = series template',
              `recurrence_json` TEXT NULL COMMENT 'Template only: recurrence schedule config and cursor',
              `recurring_source_id` VARCHAR(50) NULL COMMENT 'Occurrence only: template id',
              `recurring_occurrence_date` DATE NULL COMMENT 'Occurrence only: the unshifted scheduled date',
              `original_deadline` DATE NULL COMMENT 'Deadline the task was first given; set when it is created or first postponed',
              `deadline_moves` INT NOT NULL DEFAULT 0 COMMENT 'How many times the deadline was pushed to a later date',
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              FOREIGN KEY (`related_lead_id`) REFERENCES `leads` (`id`) ON DELETE SET NULL,
              INDEX idx_task_status (`status`),
              INDEX idx_task_deadline (`deadline`),
              INDEX idx_task_project (`related_project_id`),
              INDEX idx_task_kind (`task_kind`),
              INDEX idx_task_recurring_source (`recurring_source_id`),
              UNIQUE KEY uq_recurring_occurrence (`recurring_source_id`, `recurring_occurrence_date`)
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

            // Projects (Base common table). The project type FK is RESTRICT, not
            // CASCADE: a type is a template, and deleting a template must never
            // take the projects made from it along with it. Existing installs are
            // converted by ccrm_migrate_project_type_fk_restrict().
            "CREATE TABLE IF NOT EXISTS `projects` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `project_type_id` VARCHAR(50) NOT NULL,
              `name` VARCHAR(200) NULL,
              `lead_id` VARCHAR(50) NULL,
              `client_id` VARCHAR(50) NULL,
              `status` VARCHAR(50) NOT NULL DEFAULT 'active',
              `division` VARCHAR(100) NULL COMMENT 'Assigned Division (e.g. Head office, Branch Budapest)',
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
              `hours_budget` DECIMAL(8,2) NULL COMMENT 'Hours the project is expected to take',
              `billable_rate` DECIMAL(10,2) NULL COMMENT 'Default billable hourly rate for time entries',
              `is_internal` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Internal work: excluded from client billing',
              `contact_phone` VARCHAR(50) NULL COMMENT 'Phone of the project contact; WhatsApp chats are paired to the project by it',
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              FOREIGN KEY (`project_type_id`) REFERENCES `project_types` (`id`) ON DELETE RESTRICT
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
              `recurring_materialized_through` DATE NULL COMMENT 'Recurring rule: every charge on or before this day is stored or deliberately absent; the schedule only draws after it',
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
              `custom_fields_json` TEXT NULL,
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
              `status` VARCHAR(50) NOT NULL DEFAULT 'draft' COMMENT 'Price offers: a key of OFFER_STATUSES. Proformas and invoices: a key of INVOICE_STATUSES (built-ins: draft, sent, invoiced, approved, rejected, cancelled)',
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

            // Machine API (/api/v1, docs/WAAI-INTEGRATION.md §4.1): one row per external
            // system (today only 'waai'). The JSON-valued columns are TEXT holding JSON,
            // which MySQL and MariaDB both accept.
            "CREATE TABLE IF NOT EXISTS `integration_clients` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `code` VARCHAR(50) NOT NULL UNIQUE,
              `name` VARCHAR(100) NOT NULL,
              `is_active` TINYINT(1) NOT NULL DEFAULT 1,
              `scopes` TEXT NOT NULL,
              `allowed_ips` TEXT NOT NULL,
              `require_direct` TINYINT(1) NOT NULL DEFAULT 0,
              `owner_user_ids` TEXT NOT NULL,
              `feed_scope` ENUM('owners','all') NOT NULL DEFAULT 'owners',
              `embed_url` VARCHAR(255) NULL,
              `sso_secret` VARCHAR(255) NULL COMMENT 'enc:v1: (ccrm_encrypt_secret)',
              `default_deadline_days` INT NOT NULL DEFAULT 7,
              `settings_json` TEXT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Several tokens per client so a rotation can overlap. Only sha256 is stored.
            "CREATE TABLE IF NOT EXISTS `integration_tokens` (
              `id` VARCHAR(50) NOT NULL PRIMARY KEY,
              `client_id` VARCHAR(50) NOT NULL,
              `prefix` VARCHAR(12) NOT NULL UNIQUE,
              `token_hash` CHAR(64) NOT NULL,
              `expires_at` DATETIME NULL,
              `revoked_at` DATETIME NULL,
              `last_used_at` DATETIME NULL,
              `last_used_ip` VARCHAR(45) NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              INDEX idx_int_token_client (`client_id`),
              FOREIGN KEY (`client_id`) REFERENCES `integration_clients` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // External id <-> local row, plus the last values applied from the external
            // side (three-way merge). No FK on local_id: tasks are hard-deleted by sync.php,
            // and a ref whose row is gone is how "deleted in CCRM" is recognised.
            "CREATE TABLE IF NOT EXISTS `integration_refs` (
              `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
              `client_id` VARCHAR(50) NOT NULL,
              `kind` ENUM('task','timeline') NOT NULL,
              `external_id` VARCHAR(64) NOT NULL,
              `local_id` VARCHAR(50) NULL,
              `revision` BIGINT NOT NULL DEFAULT 0,
              `applied_snapshot` TEXT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              UNIQUE KEY uq_int_ref (`client_id`, `kind`, `external_id`),
              INDEX idx_int_ref_local (`local_id`),
              FOREIGN KEY (`client_id`) REFERENCES `integration_clients` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Per-token request counter, one row per minute window.
            "CREATE TABLE IF NOT EXISTS `integration_rate` (
              `token_prefix` VARCHAR(12) NOT NULL,
              `window_start` INT NOT NULL,
              `hits` INT NOT NULL DEFAULT 0,
              PRIMARY KEY (`token_prefix`, `window_start`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Chats WAAI has paired with a lead/client or a project (docs/WAAI-INTEGRATION.md §4.2, §4.4).
            // One row per (conversation, entity); the chat's title, phone and path repeat on each row so
            // the table reads without a join. Written only by PUT/DELETE /api/v1/whatsapp/links, never by
            // sync.php. No FK on entity_id: a deleted lead or project must not be blocked by a link, and
            // WAAI replaces the whole set on its next push.
            "CREATE TABLE IF NOT EXISTS `whatsapp_links` (
              `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
              `client_id` VARCHAR(50) NOT NULL,
              `conversation_ref` VARCHAR(64) NOT NULL,
              `entity_type` ENUM('lead','project') NOT NULL,
              `entity_id` VARCHAR(50) NOT NULL,
              `link_source` ENUM('auto','manual') NOT NULL DEFAULT 'auto',
              `title` VARCHAR(255) NOT NULL DEFAULT '',
              `is_group` TINYINT(1) NOT NULL DEFAULT 0,
              `phone_digits` VARCHAR(20) NULL,
              `owner_user_id` VARCHAR(50) NULL COMMENT 'CCRM user who owns the WhatsApp account',
              `path` VARCHAR(255) NOT NULL,
              `last_message_at` DATETIME NULL,
              `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
              UNIQUE KEY uq_wa_link (`conversation_ref`, `entity_type`, `entity_id`),
              INDEX idx_wa_link_entity (`entity_type`, `entity_id`),
              FOREIGN KEY (`client_id`) REFERENCES `integration_clients` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Result of WAAI's on-demand "is this number on WhatsApp?" check (decision D6).
            "CREATE TABLE IF NOT EXISTS `whatsapp_numbers` (
              `phone_digits` VARCHAR(20) NOT NULL PRIMARY KEY,
              `status` ENUM('registered','not_registered') NOT NULL,
              `checked_at` DATETIME NOT NULL,
              `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
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
              `labor_cost` DECIMAL(12, 2) NULL COMMENT 'Cena práce from the payslip, typed by hand; employees only',
              `net_pay` DECIMAL(12, 2) NULL COMMENT 'Na výplatu from the payslip, typed by hand; employees only',
              `status` ENUM('pending', 'partially_paid', 'paid') NOT NULL DEFAULT 'pending',
              `due_date` DATE NULL,
              `payment_date` DATE NULL,
              `payment_method` VARCHAR(50) NULL DEFAULT 'bank_transfer',
              `financial_record_id` VARCHAR(50) NULL,
              `note` TEXT NULL,
              `closed_at` DATETIME NULL COMMENT 'Month closed: stamped when first paid in full; locks its time entries; cleared only by an admin reopen',
              `closed_by` VARCHAR(255) NULL COMMENT 'Who saved the record that closed the month',
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Time tracking: one row per stretch of work, owned by the login that did it.
            // No foreign keys on purpose: an entry must outlive its task, ticket, project
            // and even its user (shown greyed out, `title_snapshot` keeps a readable title).
            "CREATE TABLE IF NOT EXISTS `time_entries` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `user_id` VARCHAR(50) NOT NULL COMMENT 'Owner: the login whose time this is',
              `recorded_by_user_id` VARCHAR(50) NOT NULL COMMENT 'Who typed it in; differs from user_id when a manager logs time for someone',
              `employee_id` VARCHAR(50) NULL COMMENT 'Resolved from user_id when saved; supplies the salary for the cost rate',
              `project_id` VARCHAR(50) NULL COMMENT 'NULL = Assign project state',
              `task_id` VARCHAR(50) NULL,
              `ticket_id` VARCHAR(50) NULL,
              `description` VARCHAR(500) NULL COMMENT 'The title ONLY for entries with no task and no ticket; NULL when linked',
              `title_snapshot` VARCHAR(500) NULL COMMENT 'Written on every save; never shown while the task/ticket exists, never editable',
              `legacy_note` VARCHAR(500) NULL COMMENT 'Read-only note migrated from ticket_time_entries',
              `note` VARCHAR(1000) NULL COMMENT 'The Description the person typed; allowed on linked entries too',
              `entry_date` DATE NOT NULL COMMENT 'Company-timezone date the time counts for',
              `start_at` DATETIME NULL COMMENT 'UTC; NULL for hours-only entries',
              `end_at` DATETIME NULL COMMENT 'UTC; NULL while running or hours-only',
              `duration_sec` INT NULL,
              `billable` TINYINT(1) NOT NULL DEFAULT 1,
              `billable_rate` DECIMAL(10,2) NULL,
              `cost_rate` DECIMAL(10,4) NULL COMMENT 'Snapshot of the hourly cost rate',
              `cost_rate_source` VARCHAR(32) NOT NULL DEFAULT 'none' COMMENT 'monthly | daily | hourly | contractor_hourly | contractor_daily | contractor_monthly | none',
              `cost_rate_basis_days` TINYINT NULL COMMENT 'Working days of the month the rate was divided by',
              `cost` DECIMAL(12,2) NULL,
              `tags` TEXT NULL COMMENT 'JSON array of strings',
              `source` VARCHAR(16) NOT NULL DEFAULT 'manual' COMMENT 'timer | manual | day | calendar | timesheet | extension | activity | toggl | clockify | ticket_legacy',
              `origin_type` VARCHAR(16) NULL COMMENT 'task | ticket | project | calendar | activity',
              `origin_id` VARCHAR(64) NULL,
              `device_id` VARCHAR(64) NULL,
              `external_id` VARCHAR(100) NULL COMMENT 'Toggl/Clockify id, or tte:<id> for migrated ticket time',
              `approval_status` VARCHAR(16) NULL,
              `running_guard` VARCHAR(50) GENERATED ALWAYS AS (IF(`start_at` IS NOT NULL AND `end_at` IS NULL AND `deleted_at` IS NULL, `user_id`, NULL)) STORED COMMENT 'UNIQUE: one running timer per user',
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              `deleted_at` DATETIME NULL,
              UNIQUE KEY `uq_te_running` (`running_guard`),
              UNIQUE KEY `uq_te_external` (`source`, `external_id`),
              INDEX `idx_te_user_date` (`user_id`, `entry_date`),
              INDEX `idx_te_project_date` (`project_id`, `entry_date`),
              INDEX `idx_te_task` (`task_id`),
              INDEX `idx_te_ticket` (`ticket_id`),
              INDEX `idx_te_employee_date` (`employee_id`, `entry_date`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            /* PHASE5-SCHEMA-START */
            "CREATE TABLE IF NOT EXISTS `time_tracker_pairing_codes` (
              `code_hash` CHAR(64) NOT NULL,
              `user_id` VARCHAR(50) NOT NULL,
              `expires_at` DATETIME NOT NULL,
              `used_at` DATETIME NULL,
              `created_at` DATETIME NOT NULL,
              PRIMARY KEY (`code_hash`),
              INDEX `idx_ttpc_user` (`user_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            "CREATE TABLE IF NOT EXISTS `time_tracker_devices` (
              `id` VARCHAR(64) NOT NULL,
              `user_id` VARCHAR(50) NOT NULL,
              `key_hash` CHAR(64) NOT NULL,
              `key_prefix` VARCHAR(12) NOT NULL,
              `name` VARCHAR(120) NOT NULL,
              `browser` VARCHAR(80) NULL,
              `os` VARCHAR(80) NULL,
              `extension_version` VARCHAR(32) NULL,
              `created_at` DATETIME NOT NULL,
              `last_used_at` DATETIME NULL,
              `revoked_at` DATETIME NULL,
              PRIMARY KEY (`id`),
              UNIQUE KEY `uq_ttd_key` (`key_hash`),
              INDEX `idx_ttd_user` (`user_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            "CREATE TABLE IF NOT EXISTS `time_activity` (
              `id` VARCHAR(64) NOT NULL,
              `user_id` VARCHAR(50) NOT NULL,
              `device_id` VARCHAR(64) NOT NULL,
              `domain` VARCHAR(253) NOT NULL,
              `page_title` VARCHAR(300) NOT NULL,
              `started_at` DATETIME NOT NULL,
              `ended_at` DATETIME NOT NULL,
              `duration_sec` INT NOT NULL,
              `suggested_project_id` VARCHAR(50) NULL,
              `status` ENUM('unsorted','assigned','dismissed') NOT NULL DEFAULT 'unsorted',
              `entry_id` VARCHAR(64) NULL,
              `created_at` DATETIME NOT NULL,
              PRIMARY KEY (`id`),
              INDEX `idx_tta_user_status` (`user_id`, `status`),
              INDEX `idx_tta_started` (`started_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
            /* PHASE5-SCHEMA-END */

            // Public holidays of Slovakia and Hungary, cached from Nager.Date (api/holidays.php).
            // Only days of work rest are stored. `manual` rows are reserved; overrides live in the settings blob.
            "CREATE TABLE IF NOT EXISTS `public_holidays` (
              `country` CHAR(2) NOT NULL,
              `date` DATE NOT NULL,
              `local_name` VARCHAR(200) NOT NULL,
              `name_en` VARCHAR(200) NOT NULL,
              `source` ENUM('api', 'builtin', 'manual') NOT NULL DEFAULT 'api',
              `fetched_at` DATETIME NOT NULL,
              PRIMARY KEY (`country`, `date`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // Tokens and transcription minutes each AI feature consumed. Priced in the app
            // from the model list (src/utils/aiModels.ts); this table stores the counts.
            "CREATE TABLE IF NOT EXISTS `ai_usage` (
              `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
              `feature` VARCHAR(64) NOT NULL,
              `model` VARCHAR(80) NOT NULL,
              `input_tokens` INT UNSIGNED NOT NULL DEFAULT 0,
              `cached_input_tokens` INT UNSIGNED NOT NULL DEFAULT 0,
              `output_tokens` INT UNSIGNED NOT NULL DEFAULT 0,
              `input_audio_tokens` INT UNSIGNED NOT NULL DEFAULT 0,
              `output_audio_tokens` INT UNSIGNED NOT NULL DEFAULT 0,
              `audio_seconds` DECIMAL(10,2) NOT NULL DEFAULT 0,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              INDEX `idx_ai_usage_created` (`created_at`)
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

    // Also defined (guarded) in recurring_tasks.php, which read_scope.php loads before this file.
    if (!function_exists('ccrm_sql_real_tasks')) {
        function ccrm_sql_real_tasks(string $alias = ''): string {
            $alias = trim($alias);
            if ($alias !== '') {
                $a = trim($alias, '`.');
                return "(`{$a}`.`task_kind` IS NULL)";
            }
            return "(`task_kind` IS NULL)";
        }
    }

    function ccrm_index_exists(PDO $pdo, string $table, string $index): bool {
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?"
        );
        $stmt->execute([$table, $index]);
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
     * Turns the `projects.project_type_id` foreign key from ON DELETE CASCADE
     * into ON DELETE RESTRICT, so deleting a project type can never delete the
     * projects made from it. sync.php refuses such a delete before it gets
     * here; this is the database-level backstop for every other writer.
     *
     * Idempotent: does nothing once no CASCADE rule remains. Two statements,
     * not one: MySQL only drops and adds a foreign key in one ALTER with
     * ALGORITHM=INPLACE, which it refuses while foreign_key_checks is on. If
     * the ADD fails (orphaned rows on an install that somehow lost the FK),
     * the table is left without the key, which still cascades nothing.
     */
    function ccrm_migrate_project_type_fk_restrict(PDO $pdo): void {
        if (!ccrm_table_exists($pdo, 'projects') || !ccrm_table_exists($pdo, 'project_types')) {
            return;
        }
        $stmt = $pdo->query(
            "SELECT `CONSTRAINT_NAME` FROM information_schema.REFERENTIAL_CONSTRAINTS
             WHERE `CONSTRAINT_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'projects'
               AND `REFERENCED_TABLE_NAME` = 'project_types' AND `DELETE_RULE` = 'CASCADE'"
        );
        $names = $stmt ? $stmt->fetchAll(PDO::FETCH_COLUMN) : [];
        foreach ($names as $name) {
            $safe = preg_replace('/[^A-Za-z0-9_]/', '', (string)$name);
            if ($safe === '') continue;
            $pdo->exec("ALTER TABLE `projects` DROP FOREIGN KEY `{$safe}`");
            try {
                $pdo->exec("ALTER TABLE `projects` ADD CONSTRAINT `{$safe}` FOREIGN KEY (`project_type_id`) REFERENCES `project_types` (`id`) ON DELETE RESTRICT");
            } catch (\Throwable $e) {
                error_log('[ccrm] projects.project_type_id FK not re-added as RESTRICT: ' . $e->getMessage());
            }
        }
    }

    /**
     * Idempotent migrations for databases created by older CCRM versions.
     * Each step checks the live schema before mutating it, so it is safe to
     * run on every install/update without relying on try/catch swallowing.
     */
    /**
     * Point stored AI model ids at the current same-tier models. Idempotent:
     * a row that already holds a current id is left alone, and a second run
     * finds nothing to rewrite. Runs on the next schema apply after deploy, which
     * sync.php does on the first request, so existing installs pick this up
     * without a manual step.
     */
    function ccrm_migrate_recurring_tasks(PDO $pdo): void {
        if (!ccrm_table_exists($pdo, 'tasks')) {
            return;
        }
        if (!ccrm_column_exists($pdo, 'tasks', 'task_kind')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `task_kind` VARCHAR(20) NULL COMMENT 'NULL = normal task, recurring = series template'");
        }
        if (!ccrm_column_exists($pdo, 'tasks', 'recurrence_json')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `recurrence_json` TEXT NULL COMMENT 'Template only: recurrence schedule config and cursor'");
        }
        if (!ccrm_column_exists($pdo, 'tasks', 'recurring_source_id')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `recurring_source_id` VARCHAR(50) NULL COMMENT 'Occurrence only: template id'");
        }
        if (!ccrm_column_exists($pdo, 'tasks', 'recurring_occurrence_date')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `recurring_occurrence_date` DATE NULL COMMENT 'Occurrence only: the unshifted scheduled date'");
        }
        if (!ccrm_index_exists($pdo, 'tasks', 'idx_task_kind')) {
            try { $pdo->exec("ALTER TABLE `tasks` ADD INDEX `idx_task_kind` (`task_kind`)"); } catch (\Throwable $e) {}
        }
        if (!ccrm_index_exists($pdo, 'tasks', 'idx_task_recurring_source')) {
            try { $pdo->exec("ALTER TABLE `tasks` ADD INDEX `idx_task_recurring_source` (`recurring_source_id`)"); } catch (\Throwable $e) {}
        }
        if (!ccrm_index_exists($pdo, 'tasks', 'uq_recurring_occurrence')) {
            try { $pdo->exec("ALTER TABLE `tasks` ADD UNIQUE KEY `uq_recurring_occurrence` (`recurring_source_id`, `recurring_occurrence_date`)"); } catch (\Throwable $e) {}
        }
    }

    function ccrm_migrate_ai_models(PDO $pdo): void {
        if (!function_exists('ccrm_ai_model_upgrades')) {
            require_once __DIR__ . '/auth.php';
        }
        $map = ccrm_ai_model_upgrades();
        try {
            if (ccrm_table_exists($pdo, 'custom_dashboards')) {
                $dash = $pdo->prepare("UPDATE `custom_dashboards` SET `active_model` = ? WHERE `active_model` = ?");
                foreach ($map as $from => $to) {
                    if (strpos($from, 'gpt-') === 0 || strpos($from, 'claude-') === 0) {
                        $dash->execute([$to, $from]);
                    }
                }
                // Demo dashboards were saved with a Gemini id this picker never sent to OpenAI.
                $dash->execute(['gpt-6.1-terra', 'gemini-2.5-flash']);
            }
            if (ccrm_table_exists($pdo, 'swarm_simulations')) {
                $rows = $pdo->query("SELECT `id`, `checkpoint_state` FROM `swarm_simulations` WHERE `checkpoint_state` IS NOT NULL AND `checkpoint_state` <> ''");
                $upd = $pdo->prepare("UPDATE `swarm_simulations` SET `checkpoint_state` = ? WHERE `id` = ?");
                foreach ($rows as $row) {
                    $state = json_decode((string)$row['checkpoint_state'], true);
                    if (!is_array($state) || !isset($state['model_name']) || !is_string($state['model_name'])) {
                        continue;
                    }
                    $next = $map[$state['model_name']] ?? null;
                    if ($next === null || $next === $state['model_name']) {
                        continue;
                    }
                    $state['model_name'] = $next;
                    $encoded = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
                    if ($encoded !== false) {
                        $upd->execute([$encoded, $row['id']]);
                    }
                }
            }
            $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'")->fetchColumn();
            if (is_string($raw) && $raw !== '') {
                $cfg = json_decode($raw, true);
                if (is_array($cfg)) {
                    $changed = false;
                    foreach (['aiModel', 'openAiModel'] as $key) {
                        if (isset($cfg[$key]) && is_string($cfg[$key]) && isset($map[$cfg[$key]])) {
                            $cfg[$key] = $map[$cfg[$key]];
                            $changed = true;
                        }
                    }
                    if ($changed) {
                        $encoded = json_encode($cfg, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
                        if ($encoded !== false) {
                            $pdo->prepare("UPDATE `system_settings` SET `value` = ? WHERE `key` = 'INTEGRATIONS_CONFIG'")->execute([$encoded]);
                        }
                    }
                }
            }
        } catch (\Throwable $e) {
            error_log('[ccrm schema] ai model migration skipped: ' . $e->getMessage());
        }
    }

    function ccrm_apply_migrations(PDO $pdo): void {
        // Several steps below ALTER `orders`; a database that predates the table
        // would otherwise fatal on the first one.
        ccrm_migrate_orders($pdo);
        // Project contract / invoicable value
        if (!ccrm_column_exists($pdo, 'projects', 'value')) {
            $pdo->exec("ALTER TABLE `projects` ADD COLUMN `value` DECIMAL(14,2) NULL COMMENT 'Project Contract Value / Invoicable' AFTER `budget`");
        }
        // AI price-offer templates: the look read from the sample PDF (header, table,
        // card and banner variants, font, section headings). NULL on a template
        // generated before the variants existed, which keeps its original look.
        if (ccrm_table_exists($pdo, 'ai_custom_templates') && !ccrm_column_exists($pdo, 'ai_custom_templates', 'layout_json')) {
            $pdo->exec("ALTER TABLE `ai_custom_templates` ADD COLUMN `layout_json` TEXT NULL AFTER `badge_style`");
        }
        // The reconstructed block document. NULL on a template that is still a
        // colour skin of the Signum document (see src/utils/offerDocument.ts).
        if (ccrm_table_exists($pdo, 'ai_custom_templates') && !ccrm_column_exists($pdo, 'ai_custom_templates', 'document_json')) {
            $pdo->exec("ALTER TABLE `ai_custom_templates` ADD COLUMN `document_json` LONGTEXT NULL AFTER `layout_json`");
        }
        if (ccrm_table_exists($pdo, 'invoices_offers') && !ccrm_column_exists($pdo, 'invoices_offers', 'custom_fields_json')) {
            $pdo->exec("ALTER TABLE `invoices_offers` ADD COLUMN `custom_fields_json` TEXT NULL AFTER `usp_cards_json`");
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
        // Deleting a project type used to CASCADE to every project of that type
        // (and from there to its managers, data, timeline and Gantt rows). The
        // type is a template; its projects are history and must survive it.
        ccrm_migrate_project_type_fk_restrict($pdo);
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
                 SELECT `id`, `owner` FROM `tasks` WHERE `owner` <> ''" /* recurring-template: schema and migrations */
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
        // How far a recurring rule's payments are stored (recurringRuleDeletion.ts).
        // Existing rules migrate as NULL on purpose: no rule has been materialized
        // yet, and a watermark set from a hand-edited stand-in's day would hide the
        // un-stored charges before it. The first client run sets it.
        if (!ccrm_column_exists($pdo, 'financial_records', 'recurring_materialized_through')) {
            $pdo->exec("ALTER TABLE `financial_records` ADD COLUMN `recurring_materialized_through` DATE NULL COMMENT 'Recurring rule: every charge on or before this day is stored or deliberately absent; the schedule only draws after it' AFTER `recurring_occurrence_date`");
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
        // Payroll records: the payslip's labour cost and net pay, typed in each month
        if (ccrm_table_exists($pdo, 'employee_salaries') && !ccrm_column_exists($pdo, 'employee_salaries', 'labor_cost')) {
            $pdo->exec("ALTER TABLE `employee_salaries` ADD COLUMN `labor_cost` DECIMAL(12, 2) NULL COMMENT 'Cena práce from the payslip, typed by hand; employees only' AFTER `total_paid`");
        }
        if (ccrm_table_exists($pdo, 'employee_salaries') && !ccrm_column_exists($pdo, 'employee_salaries', 'net_pay')) {
            $pdo->exec("ALTER TABLE `employee_salaries` ADD COLUMN `net_pay` DECIMAL(12, 2) NULL COMMENT 'Na výplatu from the payslip, typed by hand; employees only' AFTER `labor_cost`");
        }
        // Payroll records: the month's close is a recorded fact, not re-derived from the live status
        if (ccrm_table_exists($pdo, 'employee_salaries') && !ccrm_column_exists($pdo, 'employee_salaries', 'closed_at')) {
            $pdo->exec("ALTER TABLE `employee_salaries` ADD COLUMN `closed_at` DATETIME NULL COMMENT 'Month closed: stamped when first paid in full; locks its time entries; cleared only by an admin reopen' AFTER `note`");
        }
        if (ccrm_table_exists($pdo, 'employee_salaries') && !ccrm_column_exists($pdo, 'employee_salaries', 'closed_by')) {
            $pdo->exec("ALTER TABLE `employee_salaries` ADD COLUMN `closed_by` VARCHAR(255) NULL COMMENT 'Who saved the record that closed the month' AFTER `closed_at`");
        }
        // Period keys without a year (`M05`) collided across years on uk_emp_period: rekey and merge.
        // Before the closed_at backfill, so the merged survivor is the row that gets stamped.
        ccrm_migrate_salary_period_keys($pdo);
        ccrm_backfill_salary_closed_at($pdo);
        ccrm_migrate_employee_identity($pdo);
        ccrm_migrate_employee_company_ids($pdo);
        ccrm_migrate_updated_at_precision($pdo);
        ccrm_migrate_task_states($pdo);
        ccrm_migrate_list_ids($pdo);
        ccrm_migrate_invoice_status_changed_at($pdo);
        ccrm_migrate_invoice_status_varchar($pdo);
        ccrm_migrate_warehouse_item_fields($pdo);
        ccrm_migrate_mail_filing($pdo);
        ccrm_migrate_quantity_precision($pdo);
        ccrm_backfill_task_completion_attribution($pdo);
        // The ENUM must be widened before anything inserts a 'pending' vacation.
        ccrm_migrate_vacation_status_pending($pdo);
        ccrm_migrate_user_role_varchar($pdo);
        ccrm_migrate_orders($pdo);
        ccrm_migrate_employee_role_rbac($pdo);
        // Employee documents used to sit in the public uploads directory.
        try {
            require_once __DIR__ . '/employee_files.php';
            ccrm_migrate_employee_files_private($pdo);
        } catch (\Throwable $e) {
            error_log('[ccrm schema] employee document migration skipped: ' . $e->getMessage());
        }
        ccrm_migrate_tickets($pdo);
        ccrm_backfill_ticket_resolve_due($pdo);
        ccrm_migrate_time_tracking($pdo);
        ccrm_migrate_integration_tasks($pdo);
        ccrm_migrate_integration_directory($pdo);
        ccrm_migrate_integration_timeline($pdo);
        // Exact copies only. A distinct note, offer, time, amount or file is kept.
        ccrm_dedupe_exact_timeline_events($pdo);
        ccrm_migrate_ai_models($pdo);
        ccrm_migrate_recurring_tasks($pdo);
    }

    /**
     * Time tracking additions to existing tables. The `time_entries` and
     * `public_holidays` tables themselves are in ccrm_schema_statements().
     *
     * `employees.work_country` (SK | HU | NULL): whose public-holiday calendar a
     * person works by. NULL means the company default. It decides which days are
     * working days for the monthly cost rate; it is never derived from the UI language.
     */
    /**
     * Columns for tasks pushed in by an external system over the machine API (docs/WAAI-INTEGRATION.md
     * §4.2). Server-only: sync.php's task upsert names its columns, so they survive any client save.
     *
     * `external_source` = integration client code ('waai'), `external_url` = the path of the source chat
     * in that system, `external_meta_json` = chat title and whether the deadline was inferred.
     */
    function ccrm_migrate_integration_tasks(PDO $pdo): void {
        if (!ccrm_table_exists($pdo, 'tasks')) {
            return;
        }
        if (!ccrm_column_exists($pdo, 'tasks', 'external_source')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `external_source` VARCHAR(20) NULL COMMENT 'Integration client code that pushed this task (waai)'");
        }
        if (!ccrm_column_exists($pdo, 'tasks', 'external_url')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `external_url` VARCHAR(255) NULL COMMENT 'Path of the source chat in the external system'");
        }
        if (!ccrm_column_exists($pdo, 'tasks', 'external_meta_json')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `external_meta_json` TEXT NULL COMMENT 'Chat title, assignee label, due_inferred'");
        }
        // The machine API's feed pages by updated_at.
        $idx = $pdo->prepare("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'idx_task_updated' LIMIT 1");
        $idx->execute();
        if (!$idx->fetchColumn()) {
            $pdo->exec("ALTER TABLE `tasks` ADD INDEX idx_task_updated (`updated_at`)");
        }
    }

    /**
     * Directory additions for the machine API (docs/WAAI-INTEGRATION.md §4.2): the phone a project's
     * WhatsApp chat is paired by, and the indexes `GET /directory` pages by (`updated_at`, id).
     */
    function ccrm_migrate_integration_directory(PDO $pdo): void {
        if (ccrm_table_exists($pdo, 'projects') && !ccrm_column_exists($pdo, 'projects', 'contact_phone')) {
            $pdo->exec("ALTER TABLE `projects` ADD COLUMN `contact_phone` VARCHAR(50) NULL COMMENT 'Phone of the project contact; WhatsApp chats are paired to the project by it'");
        }
        foreach (['leads' => 'idx_lead_updated', 'projects' => 'idx_project_updated'] as $table => $name) {
            if (!ccrm_table_exists($pdo, $table)) {
                continue;
            }
            $idx = $pdo->prepare("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1");
            $idx->execute([$table, $name]);
            if (!$idx->fetchColumn()) {
                $pdo->exec("ALTER TABLE `{$table}` ADD INDEX {$name} (`updated_at`)");
            }
        }
    }

    /**
     * Timeline additions for the machine API (docs/WAAI-INTEGRATION.md §4.2, §4.6):
     * deep-link path back into the external system (WAAI chat).
     */
    function ccrm_migrate_integration_timeline(PDO $pdo): void {
        if (ccrm_table_exists($pdo, 'timeline_events') && !ccrm_column_exists($pdo, 'timeline_events', 'external_url')) {
            $pdo->exec("ALTER TABLE `timeline_events` ADD COLUMN `external_url` VARCHAR(255) NULL COMMENT 'Deep link path into the external system'");
        }
    }

    function ccrm_migrate_time_tracking(PDO $pdo): void {
        if (ccrm_table_exists($pdo, 'employees') && !ccrm_column_exists($pdo, 'employees', 'work_country')) {
            $pdo->exec("ALTER TABLE `employees` ADD COLUMN `work_country` CHAR(2) NULL COMMENT 'SK | HU; NULL = company default' AFTER `address_country`");
        }
        if (ccrm_table_exists($pdo, 'tasks') && !ccrm_column_exists($pdo, 'tasks', 'estimate_minutes')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `estimate_minutes` INT NULL COMMENT 'Expected minutes; the task drawer compares it with tracked time'");
        }
        if (ccrm_table_exists($pdo, 'tasks') && !ccrm_column_exists($pdo, 'tasks', 'original_deadline')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `original_deadline` DATE NULL COMMENT 'Deadline the task was first given; set when it is created or first postponed'");
        }
        if (ccrm_table_exists($pdo, 'tasks') && !ccrm_column_exists($pdo, 'tasks', 'deadline_moves')) {
            $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `deadline_moves` INT NOT NULL DEFAULT 0 COMMENT 'How many times the deadline was pushed to a later date'");
        }
        if (ccrm_table_exists($pdo, 'projects') && !ccrm_column_exists($pdo, 'projects', 'hours_budget')) {
            $pdo->exec("ALTER TABLE `projects` ADD COLUMN `hours_budget` DECIMAL(8,2) NULL COMMENT 'Hours the project is expected to take'");
        }
        if (ccrm_table_exists($pdo, 'projects') && !ccrm_column_exists($pdo, 'projects', 'billable_rate')) {
            $pdo->exec("ALTER TABLE `projects` ADD COLUMN `billable_rate` DECIMAL(10,2) NULL COMMENT 'Default billable hourly rate for time entries'");
        }
        if (ccrm_table_exists($pdo, 'projects') && !ccrm_column_exists($pdo, 'projects', 'is_internal')) {
            $pdo->exec("ALTER TABLE `projects` ADD COLUMN `is_internal` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Internal work: excluded from client billing'");
        }
        // Ticket time is visible to Admin always, and to Project Manager unless someone turned it off.
        try {
            $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'ROLES_RBAC' LIMIT 1")->fetchColumn();
            $roles = is_string($raw) ? json_decode($raw, true) : null;
            if (is_array($roles)) {
                $changed = false;
                foreach ($roles as &$role) {
                    if (!is_array($role) || strtolower(trim((string)($role['name'] ?? ''))) !== 'project manager') {
                        continue;
                    }
                    if (!isset($role['permissions']) || !is_array($role['permissions'])) {
                        $role['permissions'] = [];
                    }
                    if (!array_key_exists('tickets.time', $role['permissions'])) {
                        $role['permissions']['tickets.time'] = 'edit';
                        $changed = true;
                    }
                }
                unset($role);
                if ($changed) {
                    $upd = $pdo->prepare("UPDATE `system_settings` SET `value` = ? WHERE `key` = 'ROLES_RBAC'");
                    $upd->execute([json_encode($roles, JSON_UNESCAPED_UNICODE)]);
                }
            }
        } catch (\Throwable $e) {
            error_log('[ccrm schema] tickets.time grant skipped: ' . $e->getMessage());
        }
        if (ccrm_table_exists($pdo, 'time_entries') && !ccrm_column_exists($pdo, 'time_entries', 'note')) {
            $pdo->exec("ALTER TABLE `time_entries` ADD COLUMN `note` VARCHAR(1000) NULL COMMENT 'The Description the person typed; allowed on linked entries too' AFTER `legacy_note`");
        }
        require_once __DIR__ . '/ticket_time_migration.php';
        ccrm_migrate_ticket_time_entries($pdo);
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
     * (VacationRequestModal, EmployeeDetailView) uses it for a request waiting for
     * approval. Saving one failed with "Data truncated for column 'status'" (and the
     * demo leave seed died at its first pending row). Widen the ENUM; idempotent.
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
     * Drop timeline rows that are exact copies of another row on the same lead.
     *
     * The duplicate-key handler in sync.php used to mint a new id and insert
     * again, so one imported note became thousands of identical rows. The row
     * that is kept is the original id when one is present (anything that is
     * not the `ev-<uniqid>-<nnnn>` shape that handler minted). A blank amount
     * and a numeric zero compare equal, because the import stored NULL and the
     * cloned row stored 0 for the same offer. Different text, time, amount or
     * attachment stays.
     *
     * Idempotent: a second run finds nothing to delete. Runs on every schema
     * apply so a copy that appears later is still collapsed on the next deploy.
     */
    function ccrm_dedupe_exact_timeline_events(PDO $pdo): void {
        if (!ccrm_table_exists($pdo, 'timeline_events')) {
            return;
        }
        try {
            $optional = [];
            foreach (['mail_account', 'mail_owner', 'mail_has_body', 'mail_message_id'] as $col) {
                if (ccrm_column_exists($pdo, 'timeline_events', $col)) {
                    $optional[] = $col;
                }
            }
            $fields = array_merge(
                ['lead_id', 'type', 'timestamp', 'title', 'content', 'amount', 'file_name', 'file_size', 'file_type', 'attachments_json', 'extra_time', 'is_outgoing', 'author', 'audio_file', 'transcription', 'hidden'],
                $optional
            );
            $present = [];
            foreach ($fields as $field) {
                if (ccrm_column_exists($pdo, 'timeline_events', $field)) {
                    $present[] = $field;
                }
            }
            $sql = 'SELECT `id`, `' . implode('`, `', $present) . '` FROM `timeline_events`';
            $rows = $pdo->query($sql);
            if ($rows === false) {
                return;
            }
            $groups = [];
            while ($row = $rows->fetch(PDO::FETCH_ASSOC)) {
                $id = (string)$row['id'];
                unset($row['id']);
                $norm = [];
                foreach ($row as $field => $value) {
                    if ($value === null) {
                        $norm[$field] = null;
                    } elseif (is_string($value) && trim($value) === '') {
                        $norm[$field] = null;
                    } elseif ($field === 'amount') {
                        $norm[$field] = is_numeric($value) && (float)$value == 0.0 ? null : (is_numeric($value) ? (string)(0 + $value) : (string)$value);
                    } elseif ($field === 'hidden' || $field === 'is_outgoing' || $field === 'mail_has_body') {
                        $norm[$field] = (string)(int)$value;
                    } else {
                        $norm[$field] = (string)$value;
                    }
                }
                $encoded = json_encode($norm, JSON_UNESCAPED_UNICODE);
                if ($encoded === false) {
                    $encoded = serialize($norm);
                }
                $groups[$row['lead_id'] . "\n" . hash('sha256', $encoded)][] = $id;
            }
            $drop = [];
            foreach ($groups as $ids) {
                if (count($ids) < 2) {
                    continue;
                }
                usort($ids, 'ccrm_timeline_dedupe_prefer');
                for ($i = 1, $n = count($ids); $i < $n; $i++) {
                    $drop[] = $ids[$i];
                }
            }
            if (!$drop) {
                return;
            }
            $del = $pdo->prepare('DELETE FROM `timeline_events` WHERE `id` = ?');
            $pdo->beginTransaction();
            try {
                foreach ($drop as $id) {
                    $del->execute([$id]);
                }
                $pdo->commit();
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
            error_log('[ccrm schema] removed ' . count($drop) . ' exact duplicate timeline event(s); one copy of each distinct event was kept.');
        } catch (\Throwable $e) {
            error_log('[ccrm schema] timeline dedupe failed: ' . $e->getMessage());
            throw $e;
        }
    }

    /** Prefer the original event id over a clone minted by the old duplicate-key retry. */
    function ccrm_timeline_dedupe_prefer(string $a, string $b): int {
        $rank = static function (string $id): int {
            return preg_match('/^ev-[0-9a-f]{13}-\d{4}$/i', $id) ? 1 : 0;
        };
        $byRank = $rank($a) <=> $rank($b);
        return $byRank !== 0 ? $byRank : strcmp($a, $b);
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
        $required = ['order', 'proforma_invoice', 'advance_receipt', 'invoice', 'delivery_note', 'status_change', 'whatsapp'];
        foreach ($required as $value) {
            if (strpos($columnType, "'" . $value . "'") === false) {
                $pdo->exec(
                    "ALTER TABLE `timeline_events` MODIFY COLUMN `type`
                     ENUM('phone', 'email', 'note', 'offer', 'appointment', 'order', 'proforma_invoice', 'advance_receipt', 'invoice', 'delivery_note', 'status_change', 'whatsapp')
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
        // The client's price level goes first and in its own try: it is the column
        // the lead sync writes on every save, so a failure in the catalogue steps
        // below (the schema is then marked current and never retried) must not
        // leave `leads` without it.
        try {
            if (ccrm_table_exists($pdo, 'leads') && !ccrm_column_exists($pdo, 'leads', 'price_level_id')) {
                $pdo->exec("ALTER TABLE `leads` ADD COLUMN `price_level_id` VARCHAR(50) NULL COMMENT 'The price level this client buys on (PRICE_LEVELS setting)'");
            }
        } catch (\Throwable $e) {
            error_log('[ccrm] schema: leads.price_level_id migration skipped: ' . $e->getMessage());
        }
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
        } catch (\Throwable $e) {
            error_log('[ccrm] schema: warehouse item fields migration skipped: ' . $e->getMessage());
        }
    }

    /**
     * Company mailboxes and background mail filing (1.12.72).
     *
     *  - `company_mailboxes`: shared mailboxes an admin defines (info@, steel@, ...),
     *    optionally with an owner. The whole IMAP / SMTP profile sits in `settings_json`
     *    in the same shape (and with the same encrypted secrets) as a user's
     *    `emailSettings`, so the mail_broker.php helpers read it unchanged.
     *  - `mail_sync_state`: one row per mailbox and folder, so a filing run is
     *    incremental: `last_uid` is the high-water mark of what the live read has seen,
     *    `backfill_upper_uid` / `backfill_done` track the newest-first catch-up of the
     *    mail that was already there. `uid_validity` resets both when the server
     *    renumbers a folder.
     *  - `filed_mail_bodies`: the readable plain-text body (and attachment names) of a
     *    filed message, kept apart from `timeline_events` because the sync reads that
     *    whole table on every load.
     *  - `timeline_events.mail_account` / `mail_owner` / `mail_has_body` /
     *    `mail_message_id`: which mailbox a message came from (a label), whose personal
     *    mailbox that is (so only they read it live), whether a stored body exists, and
     *    the Message-ID that stops one mail in two mailboxes being filed twice.
     * Idempotent: every step checks the live schema first.
     */
    function ccrm_migrate_mail_filing(PDO $pdo): void {
        try {
            $pdo->exec(
                "CREATE TABLE IF NOT EXISTS `company_mailboxes` (
                  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
                  `name` VARCHAR(150) NOT NULL,
                  `address` VARCHAR(255) NOT NULL,
                  `settings_json` MEDIUMTEXT NOT NULL COMMENT 'IMAP / SMTP profile, secrets encrypted (enc:v1:)',
                  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
                  `owner_user_id` VARCHAR(50) NULL COMMENT 'Optional person this mailbox belongs to',
                  `backfill_since` DATE NULL COMMENT 'Do not file mail older than this; NULL = everything',
                  `last_run_at` DATETIME NULL,
                  `last_success_at` DATETIME NULL,
                  `last_error` TEXT NULL,
                  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  UNIQUE INDEX `uq_company_mailbox_address` (`address`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
            $pdo->exec(
                "CREATE TABLE IF NOT EXISTS `mail_sync_state` (
                  `mailbox_key` VARCHAR(100) NOT NULL COMMENT 'c:<company mailbox id> or u:<user id>',
                  `folder` VARCHAR(190) NOT NULL,
                  `uid_validity` BIGINT NULL,
                  `last_uid` BIGINT NOT NULL DEFAULT 0,
                  `backfill_upper_uid` BIGINT NULL COMMENT 'The next backfill chunk is everything below this UID',
                  `backfill_done` TINYINT(1) NOT NULL DEFAULT 0,
                  `filed_count` INT NOT NULL DEFAULT 0,
                  `last_run_at` DATETIME NULL,
                  `last_error` TEXT NULL,
                  PRIMARY KEY (`mailbox_key`, `folder`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
            $pdo->exec(
                "CREATE TABLE IF NOT EXISTS `filed_mail_bodies` (
                  `event_id` VARCHAR(50) NOT NULL PRIMARY KEY,
                  `body` MEDIUMTEXT NULL,
                  `attachments_json` TEXT NULL COMMENT 'JSON array of {name,size,part,key?}; key names the file kept under uploads/private/mail/ (api/mail_attachments.php)',
                  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
            if (ccrm_table_exists($pdo, 'timeline_events')) {
                $columns = [
                    'mail_account'    => "VARCHAR(150) NULL COMMENT 'Label of the mailbox the message was read from'",
                    'mail_owner'      => "VARCHAR(255) NULL COMMENT 'Login e-mail of the user whose personal mailbox it is; NULL for a company mailbox'",
                    'mail_has_body'   => "TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'A readable body is stored in filed_mail_bodies'",
                    'mail_message_id' => "VARCHAR(255) NULL COMMENT 'RFC 5322 Message-ID, to file one mail once'",
                ];
                foreach ($columns as $name => $definition) {
                    if (!ccrm_column_exists($pdo, 'timeline_events', $name)) {
                        $pdo->exec("ALTER TABLE `timeline_events` ADD COLUMN `{$name}` {$definition}");
                    }
                }
                $hasIndex = (int)$pdo->query(
                    "SELECT COUNT(*) FROM information_schema.STATISTICS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'timeline_events' AND INDEX_NAME = 'idx_te_mail_msgid'"
                )->fetchColumn() > 0;
                if (!$hasIndex) {
                    $pdo->exec("ALTER TABLE `timeline_events` ADD INDEX `idx_te_mail_msgid` (`lead_id`, `mail_message_id`(100))");
                }
            }
        } catch (\Throwable $e) {
            error_log('[ccrm] schema: mail filing migration skipped: ' . $e->getMessage());
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
                  `labor_cost` DECIMAL(12, 2) NULL COMMENT 'Cena práce from the payslip, typed by hand; employees only',
                  `net_pay` DECIMAL(12, 2) NULL COMMENT 'Na výplatu from the payslip, typed by hand; employees only',
                  `status` ENUM('pending', 'partially_paid', 'paid') NOT NULL DEFAULT 'pending',
                  `due_date` DATE NULL,
                  `payment_date` DATE NULL,
                  `payment_method` VARCHAR(50) NULL DEFAULT 'bank_transfer',
                  `financial_record_id` VARCHAR(50) NULL,
                  `note` TEXT NULL,
                  `closed_at` DATETIME NULL COMMENT 'Month closed: stamped when first paid in full; locks its time entries; cleared only by an admin reopen',
                  `closed_by` VARCHAR(255) NULL COMMENT 'Who saved the record that closed the month',
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
        $rename = $pdo->prepare("UPDATE `tasks` SET `status` = ? WHERE `status` = ?"); /* recurring-template: schema and migrations */
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
                "UPDATE `tasks` t /* recurring-template: schema and migrations */
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
                'divisions' => [],
                'taskStates' => ['New', 'In progress', 'Blocked', 'Done'],
            ],
            'sk' => [
                'leadStates' => ['nový', 'kontaktovaný', 'ponuka odoslaná', 'prijatý', 'zamietnutý'],
                'leadSources' => ['showroom', 'facebook', 'instagram', 'web'],
                'leadCategories' => ['Produkty', 'Služby'],
                'divisions' => [],
                'taskStates' => ['Nový', 'Prebieha', 'Blokovaný', 'Hotovo'],
            ],
            'hu' => [
                'leadStates' => ['új', 'kapcsolatfelvétel', 'ajánlat elküldve', 'elfogadva', 'elutasítva'],
                'leadSources' => ['bemutatóterem', 'facebook', 'instagram', 'weboldal'],
                'leadCategories' => ['Termékek', 'Szolgáltatások'],
                'divisions' => [],
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
        $divisions = $lists['divisions'] ?? [];
        $taskStates = $lists['taskStates'];

        $enc = static function ($value): string {
            return json_encode($value, JSON_UNESCAPED_UNICODE);
        };

        return [
            'SYSTEM_NAME' => '', // no custom name: the client shows Koperniq
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
            'DIVISION_COLORS' => $enc((object)[]),
            'LEAD_STAGE_GROUPS' => $enc(array_combine($leadStates, ['new', 'in_progress', 'in_progress', 'closed', 'closed'])),
            'LEAD_STATE_PARENTS' => $enc((object)[]),
            'TASK_STATES' => $enc($taskStates),
            'TASK_STATE_COLORS' => $enc(ccrm_default_task_state_colors($taskStates)),
        ];
    }

    /**
     * The sample 3-level financial category tree the demo `finance` module writes
     * into an empty financial_categories table (api/demo_seed/finance.php). A real
     * installation starts empty. Deliberately generic — any
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
     * Restores `tickets.resolve_due_at` lost by the sync key mismatch: tickets created
     * in the Tickets view sent `resolutionDueAt`, which sync.php did not read, so the
     * resolution SLA was stored as NULL. Recomputed as created_at + the priority's
     * resolution target, with the same precedence as ccrm_compute_ticket_sla():
     * the project's or client's support contract hours, then TICKET_SETTINGS
     * (`resolutionMins` or `resolveHours`), then the built-in default.
     *
     * Only manual tickets are touched (the widget and e-mail paths always stored a
     * value) and only where the column is NULL, so it is idempotent. Pauses were never
     * recorded, so none are added. created_at is used in whatever clock it was written.
     */
    function ccrm_backfill_ticket_resolve_due(PDO $pdo): void {
        try {
            if (!ccrm_table_exists($pdo, 'tickets') || !ccrm_column_exists($pdo, 'tickets', 'resolve_due_at')) return;
            $rows = $pdo->query(
                "SELECT `id`, `priority`, `project_id`, `client_id`, `created_at` FROM `tickets`
                 WHERE `resolve_due_at` IS NULL AND `source` = 'manual' AND `created_at` IS NOT NULL"
            )->fetchAll(PDO::FETCH_ASSOC);
            if (empty($rows)) return;

            $defaults = ['critical' => 240, 'high' => 480, 'normal' => 1440, 'low' => 2880];
            $targetMins = $defaults;
            if (ccrm_table_exists($pdo, 'system_settings')) {
                $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'TICKET_SETTINGS' LIMIT 1")->fetchColumn();
                $decoded = $raw ? json_decode((string)$raw, true) : null;
                if (is_array($decoded) && isset($decoded['slaTargets']) && is_array($decoded['slaTargets'])) {
                    foreach ($defaults as $prio => $def) {
                        $t = $decoded['slaTargets'][$prio] ?? null;
                        if (!is_array($t)) continue;
                        if (isset($t['resolutionMins']) && (float)$t['resolutionMins'] > 0) {
                            $targetMins[$prio] = (int)round((float)$t['resolutionMins']);
                        } elseif (isset($t['resolveHours']) && (float)$t['resolveHours'] > 0) {
                            $targetMins[$prio] = (int)round(((float)$t['resolveHours']) * 60);
                        }
                    }
                }
            }

            $contracts = [];
            if (ccrm_table_exists($pdo, 'support_contracts')) {
                $contracts = $pdo->query("SELECT * FROM `support_contracts` ORDER BY `created_at` ASC")->fetchAll(PDO::FETCH_ASSOC) ?: [];
            }

            $upd = $pdo->prepare("UPDATE `tickets` SET `resolve_due_at` = ? WHERE `id` = ? AND `resolve_due_at` IS NULL");
            foreach ($rows as $r) {
                $prio = isset($targetMins[$r['priority'] ?? '']) ? (string)$r['priority'] : 'normal';
                $mins = $targetMins[$prio];
                foreach ($contracts as $sc) {
                    $matches = (!empty($r['project_id']) && ($sc['project_id'] ?? null) === $r['project_id'])
                        || (!empty($r['client_id']) && ($sc['client_id'] ?? null) === $r['client_id']);
                    if (!$matches) continue;
                    $hours = (float)($sc['sla_resolve_' . $prio . '_hours'] ?? 0);
                    if ($hours > 0) $mins = (int)round($hours * 60);
                    break;
                }
                $createdTs = strtotime((string)$r['created_at']);
                if ($createdTs === false) continue;
                $upd->execute([date('Y-m-d H:i:s', $createdTs + $mins * 60), $r['id']]);
            }
        } catch (\Throwable $e) {
            error_log('[ccrm] ccrm_backfill_ticket_resolve_due: ' . $e->getMessage());
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
                $pdo->exec("UPDATE `tasks` t INNER JOIN `ticket_task_links` tt ON tt.task_id = t.id SET t.related_ticket_id = tt.ticket_id WHERE t.related_ticket_id IS NULL OR t.related_ticket_id = ''"); /* recurring-template: schema and migrations */
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
     * Identity of the schema CODE: a hash of every file whose edit can change
     * what ccrm_apply_schema() does. Stored in system_settings once the schema
     * has been applied, so a request can tell "already done for this code".
     */
    function ccrm_schema_fingerprint(): string {
        $parts = [];
        foreach ([__FILE__, __DIR__ . '/employee_name.php', __DIR__ . '/lead_client_backfill.php', __DIR__ . '/ticket_time_migration.php', __DIR__ . '/payroll_lib.php'] as $file) {
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

