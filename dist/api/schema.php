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
              `metadata_json` TEXT NULL COMMENT 'Plugin support',
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
              `type` ENUM('phone', 'email', 'note', 'offer', 'appointment') NOT NULL DEFAULT 'note',
              `timestamp` DATETIME NOT NULL,
              `title` VARCHAR(255) NOT NULL,
              `content` TEXT NULL,
              `amount` DECIMAL(12,2) NULL,
              `file_name` VARCHAR(255) NULL,
              `file_size` VARCHAR(50) NULL,
              `file_type` ENUM('offer', 'contract', 'invoice') NULL,
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
              `deadline` DATE NOT NULL,
              `status` ENUM('todo', 'in_progress', 'blocked', 'done') NOT NULL DEFAULT 'todo',
              `owner` VARCHAR(100) NOT NULL COMMENT 'Assigned Project Manager Name',
              `related_lead_id` VARCHAR(50) NULL,
              `is_locking` TINYINT(1) NOT NULL DEFAULT 0,
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
              `assigned_user` VARCHAR(100) NULL,
              `due_date` DATE NULL,
              `priority` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
              `status` ENUM('todo', 'in_progress', 'done') NOT NULL DEFAULT 'todo',
              PRIMARY KEY (`id`),
              FOREIGN KEY (`meeting_id`) REFERENCES `meeting_notes` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
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
        // `archived` was added to meeting_notes after the initial release.
        if (!ccrm_column_exists($pdo, 'meeting_notes', 'archived')) {
            $pdo->exec("ALTER TABLE `meeting_notes` ADD COLUMN `archived` TINYINT(1) NOT NULL DEFAULT 0");
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
