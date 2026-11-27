<?php
/**
 * Time tracking v2: the rate card table `time_rate_months` (docs/TIME-TRACKING-V2.md D4.3).
 *
 * One row per employee and month: the monthly hourly cost rate and the inputs it was computed from.
 * Written only by ccrm_tt_rate_for() (time_rate_card.php), never by sync.php, so it needs no column
 * healing there. Idempotent; runs from ccrm_apply_migrations() (also on fresh installs, so it is the
 * table's CREATE TABLE) and is listed in ccrm_schema_fingerprint().
 */

if (!function_exists('ccrm_migrate_time_rate_months')) {
    function ccrm_migrate_time_rate_months(\PDO $pdo): void {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `time_rate_months` (
              `employee_id` VARCHAR(50) NOT NULL,
              `month` CHAR(7) NOT NULL COMMENT 'YYYY-MM',
              `rate` DECIMAL(10,4) NULL COMMENT 'Hourly cost rate of the month (D4.1)',
              `source` VARCHAR(32) NOT NULL DEFAULT 'monthly' COMMENT 'cost_rate_source: monthly | contractor_monthly',
              `salary_type` VARCHAR(20) NULL,
              `salary_amount` DECIMAL(12,2) NULL,
              `working_days` INT NULL COMMENT 'Working days of the month in the person''s country',
              `paid_leave_days` DECIMAL(4,1) NOT NULL DEFAULT 0.0,
              `unpaid_leave_days` DECIMAL(4,1) NOT NULL DEFAULT 0.0,
              `hours_per_day` DECIMAL(4,2) NULL COMMENT 'Effective hours per day (employee, else company)',
              `multiplier` DECIMAL(6,4) NULL,
              `fallback` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = whole month on leave, no-leave basis used',
              `inputs_hash` CHAR(40) NOT NULL COMMENT 'sha1 of the inputs; a different hash on an open month re-prices it',
              `frozen_at` DATETIME NULL COMMENT 'UTC; set when the payroll month closed or the month after ended',
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`employee_id`, `month`),
              INDEX idx_trm_month (`month`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    }
}
