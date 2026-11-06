<?php
/**
 * Payroll month helpers shared by sync.php, the MCP tools, the AI context and the schema
 * migration, so the server has one definition of a payroll month's identity, what it costs
 * ("due") and when it is closed. Client mirrors: src/utils/salaryPeriod.ts, src/utils/payslip.ts.
 *
 * Loaded by schema.php, which is why this file is part of ccrm_schema_fingerprint(): an edit to
 * the migration below must re-run ccrm_apply_schema().
 *
 * Accepts rows in either shape: sync payload (camelCase) or database (snake_case).
 */

if (!function_exists('ccrm_salary_period_key')) {

    /**
     * The canonical period key of a payroll record: `YYYY-MM` for a month, `YYYY-Www` for a week.
     * A key without its year (the `M05` the profile drawer used to write) is rebuilt from the
     * record's year and period number; with `UNIQUE (employee_id, period_key)` it made May of two
     * years collide and overwrite each other.
     */
    function ccrm_salary_period_key(array $row): string {
        $key = (string)($row['periodKey'] ?? $row['period_key'] ?? '');
        if (preg_match('/^\d{4}-(\d{2}|W\d{2})$/', $key)) {
            return $key;
        }
        $year = (int)($row['year'] ?? 0);
        $num = (int)($row['periodNumber'] ?? $row['period_number'] ?? 0);
        if ($year < 1000 || $num < 1) {
            return $key; // nothing to rebuild it from
        }
        $type = (string)($row['periodType'] ?? $row['period_type'] ?? 'monthly');
        return $type === 'weekly' ? sprintf('%04d-W%02d', $year, $num) : sprintf('%04d-%02d', $year, $num);
    }

    /**
     * What a payroll month costs the company and is paid against: Cena práce once the payslip is
     * in, otherwise the gross. Mirror of salaryDue() in src/utils/payslip.ts.
     */
    function ccrm_salary_due(array $row): float {
        $labor = array_key_exists('laborCost', $row) ? $row['laborCost'] : ($row['labor_cost'] ?? null);
        if ($labor !== null && $labor !== '' && is_numeric($labor)) {
            return (float)$labor;
        }
        return (float)($row['totalSalary'] ?? $row['total_salary'] ?? 0);
    }

    /** Paid in full once Vyplatené reaches what is due. Mirror of salaryStatus(). */
    function ccrm_salary_status(float $due, float $paid): string {
        if ($due > 0 && $paid >= $due) return 'paid';
        if ($paid > 0) return 'partially_paid';
        return 'pending';
    }

    /**
     * Two records hold the same employee and month: does the first one survive? The one with more
     * paid out wins, then the more recent edit; a full tie keeps the first (the stored one).
     */
    function ccrm_salary_keep_first(array $a, array $b): bool {
        $pa = (float)($a['totalPaid'] ?? $a['total_paid'] ?? 0);
        $pb = (float)($b['totalPaid'] ?? $b['total_paid'] ?? 0);
        if (abs($pa - $pb) >= 0.005) {
            return $pa > $pb;
        }
        $ta = strtotime((string)($a['updatedAt'] ?? $a['updated_at'] ?? '')) ?: 0;
        $tb = strtotime((string)($b['updatedAt'] ?? $b['updated_at'] ?? '')) ?: 0;
        return $ta >= $tb;
    }

    /** Best-effort audit row; works without auth.php (the CLI migration does not load it). */
    function ccrm_payroll_audit(\PDO $pdo, ?array $actor, string $action, string $detail): void {
        if (function_exists('ccrm_audit_log')) {
            ccrm_audit_log($pdo, $actor, $action, $detail);
            return;
        }
        try {
            $pdo->prepare("INSERT INTO `audit_log` (`actor_id`, `actor_email`, `action`, `detail`, `ip`) VALUES (?, ?, ?, ?, ?)")
                ->execute([$actor['id'] ?? null, $actor['email'] ?? null, $action, $detail, $_SERVER['REMOTE_ADDR'] ?? null]);
        } catch (\Throwable $e) {
            error_log('[ccrm payroll] audit failed: ' . $e->getMessage());
        }
    }

    /**
     * Remove the losing duplicate of a payroll month. Its full row goes to the audit log first, so
     * nothing is lost for good. Its auto expense (`fr-sal-*`) goes too, or the month stays booked
     * twice in Finance, but only when no other salary points at it and it carries no attachment.
     */
    function ccrm_salary_retire_duplicate(\PDO $pdo, array $loser, string $keptId, ?array $actor): void {
        $loserId = (string)($loser['id'] ?? '');
        if ($loserId === '') return;
        ccrm_payroll_audit($pdo, $actor, 'salary.duplicate_merged',
            "Payroll month " . ccrm_salary_period_key($loser) . " of employee " . ($loser['employee_id'] ?? '')
            . " was stored twice; kept {$keptId}, removed {$loserId}: " . json_encode($loser, JSON_UNESCAPED_UNICODE));
        $pdo->prepare("DELETE FROM `employee_salaries` WHERE `id` = ?")->execute([$loserId]);

        $frId = (string)($loser['financial_record_id'] ?? '');
        if ($frId === '' || strpos($frId, 'fr-sal-') !== 0) return;
        $ref = $pdo->prepare("SELECT COUNT(*) FROM `employee_salaries` WHERE `financial_record_id` = ?");
        $ref->execute([$frId]);
        if ((int)$ref->fetchColumn() > 0) return;
        $fr = $pdo->prepare("SELECT * FROM `financial_records` WHERE `id` = ?");
        $fr->execute([$frId]);
        $frRow = $fr->fetch(\PDO::FETCH_ASSOC);
        if (!$frRow) return;
        $attachments = json_decode((string)($frRow['attachments_json'] ?? ''), true);
        if (is_array($attachments) && count($attachments) > 0) {
            ccrm_payroll_audit($pdo, $actor, 'salary.duplicate_expense_kept',
                "Expense {$frId} of removed payroll record {$loserId} has attachments; left in Finance for review");
            return;
        }
        ccrm_payroll_audit($pdo, $actor, 'salary.duplicate_expense_removed',
            "Removed expense {$frId} of removed payroll record {$loserId}: " . json_encode($frRow, JSON_UNESCAPED_UNICODE));
        $pdo->prepare("DELETE FROM `financial_records` WHERE `id` = ?")->execute([$frId]);
    }

    /**
     * One-off data migration: every period key that lacks its year becomes `YYYY-MM` (or `YYYY-Www`).
     * Where the employee already has a record under the canonical key, the two are merged by
     * ccrm_salary_keep_first() instead of one overwriting the other. Idempotent: a second run finds
     * no legacy key. Never throws.
     */
    function ccrm_migrate_salary_period_keys(\PDO $pdo): void {
        try {
            if (!function_exists('ccrm_table_exists') || !ccrm_table_exists($pdo, 'employee_salaries')) return;
            $legacy = $pdo->query("SELECT * FROM `employee_salaries` WHERE `period_key` NOT REGEXP '^[0-9]{4}-([0-9]{2}|W[0-9]{2})$'")
                ->fetchAll(\PDO::FETCH_ASSOC);
            if (!$legacy) return;
            $find = $pdo->prepare("SELECT * FROM `employee_salaries` WHERE `employee_id` = ? AND `period_key` = ? AND `id` <> ?");
            $rekey = $pdo->prepare("UPDATE `employee_salaries` SET `period_key` = ?, `updated_at` = `updated_at` WHERE `id` = ?");
            foreach ($legacy as $row) {
                $key = ccrm_salary_period_key($row);
                if ($key === (string)$row['period_key']) continue; // no year to rebuild it from
                $find->execute([$row['employee_id'], $key, $row['id']]);
                $holder = $find->fetch(\PDO::FETCH_ASSOC);
                if ($holder) {
                    if (ccrm_salary_keep_first($holder, $row)) {
                        ccrm_salary_retire_duplicate($pdo, $row, (string)$holder['id'], null);
                        continue;
                    }
                    ccrm_salary_retire_duplicate($pdo, $holder, (string)$row['id'], null);
                }
                $rekey->execute([$key, $row['id']]);
            }
        } catch (\Throwable $e) {
            error_log('[ccrm schema] salary period key migration skipped: ' . $e->getMessage());
        }
    }

    /**
     * Close every month that is paid today and has no stamp yet (the stamp is new). Idempotent:
     * only rows with `closed_at IS NULL` are touched.
     */
    function ccrm_backfill_salary_closed_at(\PDO $pdo): void {
        try {
            if (!function_exists('ccrm_column_exists') || !ccrm_column_exists($pdo, 'employee_salaries', 'closed_at')) return;
            $pdo->exec("UPDATE `employee_salaries` SET `closed_at` = COALESCE(`payment_date`, `updated_at`, NOW()), `updated_at` = `updated_at`
                        WHERE `status` = 'paid' AND `closed_at` IS NULL");
        } catch (\Throwable $e) {
            error_log('[ccrm schema] salary closed_at backfill skipped: ' . $e->getMessage());
        }
    }
}
