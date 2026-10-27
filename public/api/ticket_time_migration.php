<?php
/**
 * Copy legacy ticket time (`ticket_time_entries`) into `time_entries`.
 *
 * Idempotent: a row is copied once, keyed by source `ticket_legacy` and
 * external_id `tte:<id>`. Re-running inserts nothing. The legacy table is kept
 * and no longer written. Runs from ccrm_apply_migrations, never from the probe
 * path (the schema fingerprint skips the work once this code has been applied).
 *
 * A row whose user cannot be resolved is skipped and named in
 * system_settings `TIME_TICKET_MIGRATION_LOG` and the error log. Resolution:
 * the stored user id when it exists, else exactly one case-insensitive match
 * on users.name, else the ticket's assignee.
 */

if (!function_exists('ccrm_migrate_ticket_time_entries')) {
    function ccrm_tt_migration_user(\PDO $pdo, array $row, ?string $assigneeId, array &$log): ?string {
        $uid = trim((string)($row['user_id'] ?? ''));
        if ($uid !== '') {
            $s = $pdo->prepare("SELECT 1 FROM `users` WHERE `id` = ? LIMIT 1");
            $s->execute([$uid]);
            if ($s->fetchColumn()) {
                return $uid;
            }
        }
        $name = trim((string)($row['user_name'] ?? ''));
        if ($name !== '') {
            $s = $pdo->prepare("SELECT `id` FROM `users` WHERE LOWER(`name`) = LOWER(?)");
            $s->execute([$name]);
            $ids = $s->fetchAll(\PDO::FETCH_COLUMN);
            if (count($ids) === 1) {
                $log[] = 'tte:' . $row['id'] . ' matched user by name';
                return (string)$ids[0];
            }
        }
        $assigneeId = trim((string)$assigneeId);
        if ($assigneeId !== '') {
            $s = $pdo->prepare("SELECT 1 FROM `users` WHERE `id` = ? LIMIT 1");
            $s->execute([$assigneeId]);
            if ($s->fetchColumn()) {
                $log[] = 'tte:' . $row['id'] . ' fell back to the ticket assignee';
                return $assigneeId;
            }
        }
        $log[] = 'tte:' . $row['id'] . ' skipped: no user';
        return null;
    }

    function ccrm_migrate_ticket_time_entries(\PDO $pdo): void {
        if (!ccrm_table_exists($pdo, 'ticket_time_entries') || !ccrm_table_exists($pdo, 'time_entries')) {
            return;
        }
        require_once __DIR__ . '/time_entries_lib.php';
        $settings = ccrm_tt_load_settings($pdo);
        $rows = $pdo->query("SELECT * FROM `ticket_time_entries`")->fetchAll(\PDO::FETCH_ASSOC);
        if (!$rows) {
            return;
        }
        $have = [];
        $existing = $pdo->query("SELECT `external_id` FROM `time_entries` WHERE `source` = 'ticket_legacy' AND `external_id` IS NOT NULL");
        while ($id = $existing->fetchColumn()) {
            $have[(string)$id] = true;
        }
        $ticketStmt = $pdo->prepare("SELECT `title`, `project_id`, `client_id`, `assignee_id` FROM `tickets` WHERE `id` = ? LIMIT 1");
        $ins = $pdo->prepare(
            "INSERT INTO `time_entries` (`id`, `user_id`, `recorded_by_user_id`, `employee_id`, `project_id`, `task_id`, `ticket_id`, `description`, `title_snapshot`, `legacy_note`, `entry_date`, `start_at`, `end_at`, `duration_sec`, `billable`, `billable_rate`, `cost_rate`, `cost_rate_source`, `cost_rate_basis_days`, `cost`, `tags`, `source`, `origin_type`, `origin_id`, `external_id`)
             VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, '[]', 'ticket_legacy', 'ticket', ?, ?)"
        );
        $log = [];
        foreach ($rows as $row) {
            $ext = 'tte:' . $row['id'];
            if (isset($have[$ext])) {
                continue;
            }
            $ticketStmt->execute([$row['ticket_id']]);
            $ticket = $ticketStmt->fetch(\PDO::FETCH_ASSOC);
            if (!$ticket) {
                $log[] = $ext . ' skipped: ticket gone';
                continue;
            }
            $userId = ccrm_tt_migration_user($pdo, $row, $ticket['assignee_id'] ?? null, $log);
            if ($userId === null) {
                continue;
            }
            $logged = (string)($row['logged_at'] ?? '');
            $entryDate = preg_match('/^(\d{4}-\d{2}-\d{2})/', $logged, $m) ? $m[1] : gmdate('Y-m-d');
            $minutes = max(0, (int)($row['minutes'] ?? 0));
            $duration = $minutes * 60;
            $links = ccrm_tt_resolve_links($pdo, [
                'ticketId' => $row['ticket_id'],
                'projectId' => $ticket['project_id'] ?: null,
            ]);
            $projectId = ($links['ok'] ?? false) ? $links['project_id'] : ($ticket['project_id'] ?: null);
            // No network: the cache, else the built-in holiday rules inside time_cost.php.
            $price = ccrm_tt_price($pdo, $userId, $entryDate, $duration, $settings, false);
            $rate = ccrm_tt_lookup_billable_rate($pdo, $projectId, (string)$row['ticket_id'], $entryDate);
            $note = isset($row['note']) && trim((string)$row['note']) !== '' ? mb_substr(trim((string)$row['note']), 0, 500) : null;
            $ins->execute([
                ccrm_tt_new_id(),
                $userId,
                $userId,
                $price['employee_id'],
                $projectId,
                $row['ticket_id'],
                mb_substr((string)($ticket['title'] ?? ''), 0, 500),
                $note,
                $entryDate,
                $duration,
                (int)($row['billable'] ?? 1) === 1 ? 1 : 0,
                $rate,
                $price['cost_rate'],
                $price['cost_rate_source'],
                $price['cost_rate_basis_days'],
                $price['cost'],
                $row['ticket_id'],
                $ext,
            ]);
            $have[$ext] = true;
        }
        if ($log) {
            error_log('[ccrm] ticket time migration: ' . implode('; ', $log));
            $prev = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'TIME_TICKET_MIGRATION_LOG'");
            $prev->execute();
            $old = json_decode((string)$prev->fetchColumn(), true);
            $merged = array_values(array_unique(array_merge(is_array($old) ? $old : [], $log)));
            $save = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('TIME_TICKET_MIGRATION_LOG', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
            $save->execute([json_encode($merged, JSON_UNESCAPED_UNICODE)]);
        }
    }
}
