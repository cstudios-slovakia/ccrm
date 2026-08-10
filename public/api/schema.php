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
              `type` ENUM('phone', 'email', 'note', 'offer', 'appointment', 'order', 'proforma_invoice', 'advance_receipt', 'invoice', 'delivery_note') NOT NULL DEFAULT 'note',
              `timestamp` DATETIME NOT NULL,
              `title` VARCHAR(255) NOT NULL,
              `content` TEXT NULL,
              `amount` DECIMAL(12,2) NULL,
              `file_name` VARCHAR(255) NULL,
              `file_size` VARCHAR(50) NULL,
              `file_type` ENUM('offer', 'contract', 'invoice') NULL,
              `attachments_json` TEXT NULL COMMENT 'JSON array of {name,size,path} — an event can carry several documents',
              `extra_time` VARCHAR(10) NULL,
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
    }

    /**
     * Widen `timeline_events`.`type` so it accepts the business-document event
     * types added after the initial release. Idempotent: the ALTER only runs
     * when one of the new names is missing from the live ENUM definition.
     */
    function ccrm_migrate_timeline_event_types(PDO $pdo): void {
        $columnType = $pdo->query(
            "SELECT COLUMN_TYPE FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'timeline_events' AND COLUMN_NAME = 'type'"
        )->fetchColumn();
        if ($columnType === false || $columnType === null) {
            return; // timeline_events not provisioned yet — CREATE TABLE covers it.
        }
        $required = ['order', 'proforma_invoice', 'advance_receipt', 'invoice', 'delivery_note'];
        foreach ($required as $value) {
            if (strpos($columnType, "'" . $value . "'") === false) {
                $pdo->exec(
                    "ALTER TABLE `timeline_events` MODIFY COLUMN `type`
                     ENUM('phone', 'email', 'note', 'offer', 'appointment', 'order', 'proforma_invoice', 'advance_receipt', 'invoice', 'delivery_note')
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
     * Create all tables (idempotent) and apply in-place migrations.
     */
    function ccrm_apply_schema(PDO $pdo): void {
        foreach (ccrm_schema_statements() as $sql) {
            $pdo->exec($sql);
        }
        ccrm_apply_migrations($pdo);
    }
}
