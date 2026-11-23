<?php
/**
 * Time tracking v2, phase 4 (D5.1, D7.1): several running entries per user.
 *
 * Idempotent:
 *  - `time_entries.uq_te_running` (UNIQUE on `running_guard`) becomes the plain index
 *    `idx_te_running`; the unique key is dropped only while it exists. Serialisation moves to
 *    the per-user lock row in `time_presence` (time_lock.php).
 *  - `running_guard` gets its new COMMENT, only while the stored one differs.
 *  - `time_presence` is created with every column of D7.1 (phase 6 starts using the presence ones).
 * Runs from ccrm_apply_migrations, never from the probe path; listed in ccrm_schema_fingerprint().
 */

if (!function_exists('ccrm_migrate_time_parallel')) {
    function ccrm_migrate_time_parallel(\PDO $pdo): void {
        $comment = 'user_id while running; indexed, several may run (per-user lock in time_presence)';
        $pdo->exec("CREATE TABLE IF NOT EXISTS `time_presence` (
              `user_id` VARCHAR(50) NOT NULL PRIMARY KEY COMMENT 'One row per user; SELECT ... FOR UPDATE serialises timer mutations',
              `anchor_at` DATETIME NULL COMMENT 'UTC; the last answer of the presence cycle, NULL when nothing runs',
              `last_push_at` DATETIME NULL COMMENT 'UTC; the last presence push sent',
              `auto_paused_at` DATETIME NULL COMMENT 'UTC; when the presence engine paused everything',
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        if (!ccrm_table_exists($pdo, 'time_entries') || !ccrm_column_exists($pdo, 'time_entries', 'running_guard')) {
            return;
        }
        if (ccrm_index_exists($pdo, 'time_entries', 'uq_te_running')) {
            $pdo->exec("ALTER TABLE `time_entries` DROP INDEX `uq_te_running`" . (ccrm_index_exists($pdo, 'time_entries', 'idx_te_running') ? '' : ", ADD INDEX `idx_te_running` (`running_guard`)"));
        } elseif (!ccrm_index_exists($pdo, 'time_entries', 'idx_te_running')) {
            $pdo->exec("ALTER TABLE `time_entries` ADD INDEX `idx_te_running` (`running_guard`)");
        }
        $stmt = $pdo->prepare(
            "SELECT COLUMN_COMMENT FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'time_entries' AND COLUMN_NAME = 'running_guard'"
        );
        $stmt->execute();
        if ((string)$stmt->fetchColumn() !== $comment) {
            $pdo->exec("ALTER TABLE `time_entries` MODIFY COLUMN `running_guard` VARCHAR(50) GENERATED ALWAYS AS (IF(`start_at` IS NOT NULL AND `end_at` IS NULL AND `deleted_at` IS NULL, `user_id`, NULL)) STORED COMMENT '{$comment}'");
        }
    }
}
