<?php
namespace CCRM;

class Installer {
    /**
     * Recursively copies a directory to another directory.
     */
    public static function copyDir($src, $dst) {
        if (!is_dir($src)) {
            return false;
        }
        if (!is_dir($dst)) {
            if (!mkdir($dst, 0755, true)) {
                return false;
            }
        }
        $dir = opendir($src);
        while (false !== ($file = readdir($dir))) {
            if (($file != '.') && ($file != '..')) {
                if (is_dir($src . '/' . $file)) {
                    self::copyDir($src . '/' . $file, $dst . '/' . $file);
                } else {
                    copy($src . '/' . $file, $dst . '/' . $file);
                }
            }
        }
        closedir($dir);
        return true;
    }

    /**
     * Copies compiled assets from vendor distribution folder to public parent directory.
     */
    public static function publishAssets() {
        $packageDist = dirname(__DIR__) . '/dist';
        
        // Detect if we are in composer vendor context
        if (strpos(__DIR__, 'vendor/cstudios-slovakia/ccrm') !== false || strpos(__DIR__, 'vendor' . DIRECTORY_SEPARATOR . 'cstudios-slovakia') !== false) {
            $projectRoot = dirname(dirname(dirname(dirname(__DIR__))));
        } else {
            // Local development mode: source and destination are the same, do nothing to prevent self-copy/infinite recursion
            return true;
        }
        
        if (is_dir($packageDist)) {
            self::copyDir($packageDist, $projectRoot);
            return true;
        }
        return false;
    }

    /**
     * Connects to host application database and performs structural migrations
     */
    public static function migrateDatabase() {
        // Detect if we are in composer vendor context
        if (strpos(__DIR__, 'vendor/cstudios-slovakia/ccrm') !== false || strpos(__DIR__, 'vendor' . DIRECTORY_SEPARATOR . 'cstudios-slovakia') !== false) {
            $projectRoot = dirname(dirname(dirname(dirname(__DIR__))));
        } else {
            // Local development mode: try to use local config
            $projectRoot = dirname(__DIR__) . '/public';
        }

        $configFile = $projectRoot . '/config.php';
        if (!file_exists($configFile)) {
            return false;
        }

        require_once $configFile;
        if (!function_exists('get_db_connection')) {
            return false;
        }

        try {
            $pdo = get_db_connection();
            
            $queries = [
                "CREATE TABLE IF NOT EXISTS `users` (
                  `id` VARCHAR(50) NOT NULL,
                  `name` VARCHAR(100) NOT NULL,
                  `email` VARCHAR(150) NOT NULL UNIQUE,
                  `password_hash` VARCHAR(255) NOT NULL,
                  `role` ENUM('admin', 'project_manager', 'viewer') NOT NULL DEFAULT 'viewer',
                  `avatar` VARCHAR(255) NULL,
                  `color` VARCHAR(20) NULL,
                  `metadata_json` TEXT NULL,
                  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  PRIMARY KEY (`id`),
                  INDEX idx_user_email (`email`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

                "CREATE TABLE IF NOT EXISTS `permissions` (
                  `id` INT AUTO_INCREMENT PRIMARY KEY,
                  `slug` VARCHAR(100) NOT NULL UNIQUE,
                  `description` VARCHAR(255) NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

                "CREATE TABLE IF NOT EXISTS `role_permissions` (
                  `role` ENUM('admin', 'project_manager', 'viewer') NOT NULL,
                  `permission_slug` VARCHAR(100) NOT NULL,
                  PRIMARY KEY (`role`, `permission_slug`),
                  FOREIGN KEY (`permission_slug`) REFERENCES `permissions` (`slug`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

                "CREATE TABLE IF NOT EXISTS `leads` (
                  `id` VARCHAR(50) NOT NULL,
                  `name` VARCHAR(150) NOT NULL,
                  `city` VARCHAR(100) NULL,
                  `client_type` ENUM('person', 'business', 'partner') NOT NULL DEFAULT 'person',
                  `status` VARCHAR(50) NOT NULL DEFAULT 'new',
                  `source` VARCHAR(50) NOT NULL DEFAULT 'website',
                  `owner` VARCHAR(100) NOT NULL,
                  `value` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                  `rating` INT NOT NULL DEFAULT 3,
                  `phone` VARCHAR(30) NULL,
                  `email` VARCHAR(150) NULL,
                  `company_id` VARCHAR(50) NULL,
                  `tax_id` VARCHAR(50) NULL,
                  `vat_id` VARCHAR(50) NULL,
                  `contact_person` VARCHAR(100) NULL,
                  `website` VARCHAR(255) NULL,
                  `street` VARCHAR(255) NULL,
                  `postal_code` VARCHAR(20) NULL,
                  `country` VARCHAR(100) NULL DEFAULT 'Slovakia',
                  `metadata_json` TEXT NULL,
                  `created_at` DATE NOT NULL,
                  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  PRIMARY KEY (`id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

                "CREATE TABLE IF NOT EXISTS `lead_categories` (
                  `lead_id` VARCHAR(50) NOT NULL,
                  `category_name` VARCHAR(100) NOT NULL,
                  PRIMARY KEY (`lead_id`, `category_name`),
                  FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

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
                  FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

                "CREATE TABLE IF NOT EXISTS `tasks` (
                  `id` VARCHAR(50) NOT NULL,
                  `title` VARCHAR(255) NOT NULL,
                  `description` TEXT NULL,
                  `priority` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
                  `deadline` DATE NOT NULL,
                  `status` ENUM('todo', 'in_progress', 'blocked', 'done') NOT NULL DEFAULT 'todo',
                  `owner` VARCHAR(100) NOT NULL,
                  `related_lead_id` VARCHAR(50) NULL,
                  `is_locking` TINYINT(1) NOT NULL DEFAULT 0,
                  `metadata_json` TEXT NULL,
                  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  PRIMARY KEY (`id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

                "CREATE TABLE IF NOT EXISTS `task_assignees` (
                  `task_id` VARCHAR(50) NOT NULL,
                  `user_name` VARCHAR(100) NOT NULL,
                  PRIMARY KEY (`task_id`, `user_name`),
                  FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

                "CREATE TABLE IF NOT EXISTS `system_settings` (
                  `key` VARCHAR(100) NOT NULL,
                  `value` TEXT NOT NULL,
                  PRIMARY KEY (`key`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

                "CREATE TABLE IF NOT EXISTS `meeting_notes` (
                  id VARCHAR(50) NOT NULL,
                  title VARCHAR(255) NOT NULL,
                  date DATE NOT NULL,
                  lead_id VARCHAR(50) NULL,
                  lead_name VARCHAR(150) NULL,
                  duration INT NOT NULL DEFAULT 0,
                  notes TEXT NULL,
                  ai_summary_json TEXT NULL,
                  summary_generated TINYINT(1) NOT NULL DEFAULT 0,
                  attached_leads_json TEXT NULL,
                  attached_clients_json TEXT NULL,
                  attached_users_json TEXT NULL,
                  archived TINYINT(1) NOT NULL DEFAULT 0,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  PRIMARY KEY (id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

                "CREATE TABLE IF NOT EXISTS `meeting_tasks` (
                  id VARCHAR(50) NOT NULL,
                  meeting_id VARCHAR(50) NOT NULL,
                  title VARCHAR(255) NOT NULL,
                  description TEXT NULL,
                  assigned_user VARCHAR(100) NULL,
                  due_date DATE NULL,
                  priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
                  status ENUM('todo', 'in_progress', 'done') NOT NULL DEFAULT 'todo',
                  PRIMARY KEY (id),
                  FOREIGN KEY (meeting_id) REFERENCES meeting_notes (id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
            ];

            foreach ($queries as $q) {
                $pdo->exec($q);
            }

            // Migration script for meeting_notes archived column
            try {
                $pdo->exec("ALTER TABLE `meeting_notes` ADD COLUMN `archived` TINYINT(1) NOT NULL DEFAULT 0");
            } catch (\Exception $e) {
                // Ignore if it already exists
            }

            return true;
        } catch (\Exception $e) {
            return false;
        }
    }
}
