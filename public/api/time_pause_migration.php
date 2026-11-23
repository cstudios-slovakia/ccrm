<?php
/**
 * Time tracking v2, phase 6 (D6): pause markers and how an entry ended.
 *
 * Idempotent: each column of `time_entries` is added only while it is missing.
 *   paused_at     set = the item is paused and can be resumed (the marker)
 *   pause_reason  manual | status | presence (kept after the marker is cleared: history)
 *   resume_until  the pause expires after this; NULL = the day's autoStopAt (C17)
 *   continues_id  on a resumed entry: the entry it continues (C8)
 *   end_reason    user | switch | status | presence | auto_stop; NULL while running, paused or resumed
 * Not written by sync.php (no column healing). Runs from ccrm_apply_migrations, never from the
 * probe path; listed in ccrm_schema_fingerprint().
 */

if (!function_exists('ccrm_migrate_time_pause')) {
    function ccrm_migrate_time_pause(\PDO $pdo): void {
        if (!ccrm_table_exists($pdo, 'time_entries')) {
            return;
        }
        $columns = [
            'paused_at' => "DATETIME NULL COMMENT 'UTC; set = paused and resumable (D6)' AFTER `end_at`",
            'pause_reason' => "VARCHAR(16) NULL COMMENT 'manual | status | presence' AFTER `paused_at`",
            'resume_until' => "DATETIME NULL COMMENT 'UTC; the pause expires after this, NULL = the day''s autoStopAt' AFTER `pause_reason`",
            'continues_id' => "VARCHAR(64) NULL COMMENT 'The entry this one resumed' AFTER `resume_until`",
            'end_reason' => "VARCHAR(16) NULL COMMENT 'user | switch | status | presence | auto_stop' AFTER `continues_id`",
        ];
        foreach ($columns as $name => $ddl) {
            if (!ccrm_column_exists($pdo, 'time_entries', $name)) {
                $pdo->exec("ALTER TABLE `time_entries` ADD COLUMN `{$name}` {$ddl}");
            }
        }
    }
}
