<?php
/**
 * Time tracking: when is an entry locked (age past lockAfterDays, a closed payroll month, an
 * approved week)? Shared by time_entries.php (refusing edits), the MCP tools and ccrm_tt_settle()
 * (which never silently rewrites the worked time or cost of a locked entry, docs/TIME-TRACKING-V2.md D3.3).
 */

require_once __DIR__ . '/payroll_lib.php';
require_once __DIR__ . '/time_entries_lib.php';
require_once __DIR__ . '/time_settle.php';

if (!function_exists('ccrm_te_lock_reason_of')) {

    /**
     * Calendar age in days of an entry date against a company-timezone today.
     * Mirrors entryAgeDays() in src/utils/timeLock.ts (strictly greater than lockAfterDays locks).
     */
    function ccrm_te_age_days(string $entryDate, string $today): ?int {
        $a = \DateTimeImmutable::createFromFormat('!Y-m-d', substr($entryDate, 0, 10));
        $b = \DateTimeImmutable::createFromFormat('!Y-m-d', substr($today, 0, 10));
        if (!$a || !$b || $a->format('Y-m-d') !== substr($entryDate, 0, 10) || $b->format('Y-m-d') !== substr($today, 0, 10)) {
            return null;
        }
        return (int)$a->diff($b)->format('%r%a');
    }

    /** True when a paid salary period key covers this entry's YYYY-MM. */
    function ccrm_te_month_is_paid(string $entryDate, array $keys): bool {
        $month = substr($entryDate, 0, 7);
        if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
            return false;
        }
        foreach ($keys as $key) {
            $key = (string)$key;
            if ($key === $month || str_starts_with($key, $month . '-') || str_starts_with($key, $month . 'W')) {
                return true;
            }
        }
        return false;
    }

    /**
     * SQL condition for a closed payroll month. The close is a recorded fact (`closed_at`, stamped when
     * the month was first paid in full), so a later edit that makes it partially paid again does not
     * unlock its entries. Before the column exists the live status is the only signal.
     */
    function ccrm_te_closed_sql(\PDO $pdo): string {
        static $sql = null;
        if ($sql === null) {
            $sql = ccrm_column_exists($pdo, 'employee_salaries', 'closed_at') ? '`closed_at` IS NOT NULL' : "`status` = 'paid'";
        }
        return $sql;
    }

    /** Closed payroll period keys for one employee. A missing table does not lock anyone. */
    function ccrm_te_paid_keys(\PDO $pdo, ?string $employeeId): array {
        if ($employeeId === null || $employeeId === '') {
            return [];
        }
        try {
            $stmt = $pdo->prepare("SELECT `period_key`, `period_type`, `year`, `period_number` FROM `employee_salaries` WHERE `employee_id` = ? AND " . ccrm_te_closed_sql($pdo));
            $stmt->execute([$employeeId]);
            // A legacy key without its year (`M05`) is rebuilt, so the right year locks
            return array_map('ccrm_salary_period_key', $stmt->fetchAll(\PDO::FETCH_ASSOC));
        } catch (\Throwable $e) {
            return [];
        }
    }

    /**
     * Why a stored (or about-to-be-written) row is locked: age, paid payroll month, or approved.
     * A running timer skips the age rule. Null means a non-admin may still edit it.
     */
    function ccrm_te_lock_reason_of(\PDO $pdo, array $row, array $settings, string $today): ?string {
        $running = !empty($row['start_at']) && empty($row['end_at']);
        $lockAfter = $settings['lockAfterDays'] ?? null;
        if (!$running && $lockAfter !== null) {
            $age = ccrm_te_age_days((string)($row['entry_date'] ?? ''), $today);
            if ($age !== null && $age > (int)$lockAfter) {
                return 'age';
            }
        }
        $employeeId = $row['employee_id'] ?? null;
        if (($employeeId === null || $employeeId === '') && !empty($row['user_id'])) {
            $emp = ccrm_tt_employee_for_user($pdo, (string)$row['user_id']);
            $employeeId = $emp['id'] ?? null;
        }
        if (ccrm_te_month_is_paid((string)($row['entry_date'] ?? ''), ccrm_te_paid_keys($pdo, $employeeId !== null ? (string)$employeeId : null))) {
            return 'paid_payroll';
        }
        if (strtolower(trim((string)($row['approval_status'] ?? ''))) === 'approved') {
            return 'approved';
        }
        return null;
    }

    /** ccrm_te_lock_reason_of() for a stored row, with today's date and the saved settings (used by settle). */
    function ccrm_tt_row_lock_reason(\PDO $pdo, array $row): ?string {
        static $settings = null;
        $settings ??= ccrm_tt_load_settings($pdo);
        return ccrm_te_lock_reason_of($pdo, $row, $settings, ccrm_tt_local_date(ccrm_tt_now_utc()));
    }

    /**
     * D3.3: creating, moving, deleting or restoring an entry changes the worked time and cost of the
     * entries it overlaps, so a locked neighbour refuses it for non-admins like editing that entry.
     * $intervals are [startUtc, endUtc|null] pairs of $userId (the old AND the new interval; a null end
     * means running until now; a null start is hours-only, which overlaps nothing). $excludeId is the
     * entry itself (the caller checks its own lock).
     *
     * Returns null when nothing is locked, or for an admin (the override goes to the audit log); else
     * ['id' => neighbour id, 'reason' => 'age'|'paid_payroll'|'approved'] for the caller to refuse.
     */
    function ccrm_te_refuse_locked_neighbours(\PDO $pdo, ?array $sessionUser, string $userId, array $intervals, array $settings, ?string $excludeId = null): ?array {
        if ($userId === '') {
            return null;
        }
        $today = ccrm_tt_local_date(ccrm_tt_now_utc());
        foreach ($intervals as $iv) {
            $start = $iv[0] ?? null;
            $end = $iv[1] ?? null;
            if ($start === null || $start === '') {
                continue;
            }
            foreach (ccrm_tt_overlapping_entries($pdo, $userId, (string)$start, ($end === null || $end === '') ? null : (string)$end, $excludeId) as $row) {
                $reason = ccrm_te_lock_reason_of($pdo, $row, $settings, $today);
                if ($reason === null) {
                    continue;
                }
                if (ccrm_is_admin($sessionUser)) {
                    ccrm_audit_log($pdo, $sessionUser, 'time_entry.lock_override', "Admin changed time next to locked time entry {$row['id']} ({$reason})");
                    return null;
                }
                return ['id' => (string)$row['id'], 'reason' => $reason];
            }
        }
        return null;
    }
}
