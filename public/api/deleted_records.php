<?php
/**
 * Deletion tombstones (`deleted_records`): "which records were deleted since X?".
 *
 * Why: sync.php deletes business records with a plain DELETE, so an assistant polling the app
 * saw a record vanish without any way to tell it from "never existed"
 * (docs/audits/mcp-change-visibility-audit.md, RC7b). One row per record that really went:
 * entity (the table), id, the name it had, who deleted it and when.
 *
 * Written through ccrm_record_deleted() by sync.php's generic delete (ccrm_delete_omitted) and
 * project delete, the task delete endpoint (api/task.php), the voice assistant's delete_project
 * (api/realtime_session.php) and the undo of the client-row migration
 * (api/adjustment_client_migration.php). A new hard delete of a business record calls it too.
 * Never written for:
 * - a delete the mass-delete circuit breaker refused (nothing was deleted, and the row count
 *   check runs on the DELETE itself);
 * - rows rewritten wholesale as part of a parent's save (timeline entries, action items, line
 *   items, Gantt rows, managers): those are child rewrites, not deletions of a record.
 *
 * Read by the MCP tool list_deleted_records (api/mcp_deleted.php).
 *
 * The write is FAIL-SOFT. sync.php heals the table before its transaction opens, but a worker
 * running a cached schema.php during a deploy can still reach a database without it; a missing
 * table, or any other error here, is logged and swallowed, so a push never answers 500 because
 * a tombstone could not be written. (A failed single INSERT does not abort the transaction.)
 */

if (!function_exists('ccrm_deleted_entities')) {
    /**
     * The tables that leave a tombstone, with the SQL expression of the name the row is
     * remembered by. The entity written is the table name.
     *
     * @return array<string,string> table => label expression (NULL when the row has no name)
     */
    function ccrm_deleted_entities(): array {
        return [
            'leads' => '`name`',
            'tasks' => '`title`',
            'meeting_notes' => '`title`',
            'projects' => '`name`',
            'invoices_offers' => "COALESCE(NULLIF(`document_number`, ''), `title`)",
            'financial_records' => '`title`',
            'employees' => '`name`',
            'employee_salaries' => '`period_key`',
            'employee_vacations' => 'NULL',
            'warehouse_items' => '`name`',
            'warehouse_batches' => '`batch_number`',
            'warehouse_movements' => '`document_number`',
            'suppliers' => '`name`',
            'warehouses' => '`name`',
        ];
    }
}

if (!function_exists('ccrm_deleted_snapshot')) {
    /**
     * What a tombstone needs from a row that is about to be deleted: its label, and for a
     * `leads` row whether it is a client record (a `client-*` id or adjustment > 0, the
     * rule of mcp_is_client_record), so the leads/clients module split can apply on read.
     * Null when the table leaves no tombstone, the row is not there or the read fails.
     *
     * @return array{label:?string,extra:?string}|null
     */
    function ccrm_deleted_snapshot(PDO $pdo, string $table, string $id): ?array {
        $entities = ccrm_deleted_entities();
        if (!isset($entities[$table])) return null;
        try {
            $isLead = $table === 'leads';
            $stmt = $pdo->prepare('SELECT ' . $entities[$table] . ' AS `label`' . ($isLead ? ', IFNULL(`adjustment`, 0) AS `adjustment`' : '') . " FROM `{$table}` WHERE `id` = ? LIMIT 1");
            $stmt->execute([$id]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) return null;
            $extra = $isLead
                ? json_encode(['client' => strpos($id, 'client-') === 0 || (float)$row['adjustment'] > 0])
                : null;
            return ['label' => $row['label'] === null ? null : mb_substr((string)$row['label'], 0, 255), 'extra' => $extra];
        } catch (\Throwable $e) {
            error_log('[ccrm] tombstone snapshot of ' . $table . ' skipped: ' . $e->getMessage());
            return null;
        }
    }
}

if (!function_exists('ccrm_record_deleted')) {
    /**
     * Write one tombstone for a record that was deleted (call it only after the DELETE
     * affected a row). $by defaults to the signed-in user's name that sync.php resolved.
     * Fail-soft, see the file header.
     *
     * @param array{label:?string,extra:?string}|null $snap from ccrm_deleted_snapshot()
     */
    function ccrm_record_deleted(PDO $pdo, string $table, string $id, ?array $snap, ?string $by = null): void {
        try {
            $by = $by ?? (string)($GLOBALS['sessionUserName'] ?? '');
            $pdo->prepare('INSERT INTO `deleted_records` (`entity`, `entity_id`, `deleted_by`, `label`, `extra`) VALUES (?, ?, ?, ?, ?)')
                ->execute([$table, mb_substr($id, 0, 191), $by === '' ? null : mb_substr($by, 0, 255), $snap['label'] ?? null, $snap['extra'] ?? null]);
        } catch (\Throwable $e) {
            error_log('[ccrm] tombstone for ' . $table . ' ' . $id . ' not written: ' . $e->getMessage());
        }
    }
}
