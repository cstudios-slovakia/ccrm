<?php
/**
 * Time tracking v2: `time_entries.worked_ms` and the wider `cost`.
 *
 * Idempotent. The column is added once and the backfill runs only in that
 * same pass (worked_ms = duration_sec * 1000 for every CLOSED entry; a running
 * entry, start_at set and end_at NULL, stays NULL until ccrm_tt_settle() writes
 * it). `cost` is widened to DECIMAL(14,4) only while its type differs; values
 * are kept. Runs from ccrm_apply_migrations, never from the probe path; listed
 * in ccrm_schema_fingerprint().
 */

if (!function_exists('ccrm_migrate_time_worked_ms')) {
    function ccrm_migrate_time_worked_ms(\PDO $pdo): void {
        if (!ccrm_table_exists($pdo, 'time_entries')) {
            return;
        }
        if (!ccrm_column_exists($pdo, 'time_entries', 'worked_ms')) {
            $pdo->exec("ALTER TABLE `time_entries` ADD COLUMN `worked_ms` INT UNSIGNED NULL COMMENT 'Share of the person''s real clock time (ms); NULL while running. Written only by ccrm_tt_settle()' AFTER `duration_sec`");
            $pdo->exec("UPDATE `time_entries` SET `worked_ms` = `duration_sec` * 1000
                        WHERE `worked_ms` IS NULL AND `duration_sec` IS NOT NULL
                          AND (`end_at` IS NOT NULL OR `start_at` IS NULL)");
        }
        $stmt = $pdo->prepare(
            "SELECT COLUMN_TYPE FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'time_entries' AND COLUMN_NAME = 'cost'"
        );
        $stmt->execute();
        $type = strtolower((string)$stmt->fetchColumn());
        if ($type !== '' && $type !== 'decimal(14,4)') {
            $pdo->exec("ALTER TABLE `time_entries` MODIFY COLUMN `cost` DECIMAL(14,4) NULL");
        }
    }
}
