<?php
/**
 * Child rows that move their parent's `updated_at` (sync.php).
 *
 * Why: a record's form shows child rows (project managers, Gantt rows, invoice line items,
 * meeting action items, stock movement lines). sync.php rewrites each set with
 * DELETE + INSERT, and MySQL's `ON UPDATE CURRENT_TIMESTAMP` reacts only to the parent's own
 * columns, so a changed child set left the parent "unchanged" for the MCP change window
 * (docs/audits/mcp-change-visibility-audit.md, RC3a).
 *
 * The rule, copied from the task assignee/tag bump in sync.php: bump only on a REAL change.
 * An unchanged re-save must leave `updated_at` alone, because ccrm_write_would_clobber()
 * reads it as "another client edited this row since you last polled".
 *
 * Usage, around the DELETE + INSERT of one set:
 *   $before = ccrm_child_snapshot($pdo, 'managers', $projId);
 *   ... delete, insert ...
 *   ccrm_child_bump($pdo, 'managers', $projId, $before);
 * The set is re-read from the database after the insert, so the comparison sees what was
 * stored (the column types and collation settle formats), never what the payload claimed.
 * The bump runs after the parent's own upsert, which is also after sync.php's conflict check
 * for that row, so it can neither be undone by that upsert nor conflict the same push.
 *
 * Timeline entries and payments do not move `updated_at` (decision of 2026-11-10); the MCP
 * lists expose them as `last_activity_at`.
 */

if (!function_exists('ccrm_child_set')) {
    /**
     * The descriptor of one child set: parent table, child table, the column that points to the
     * parent, the columns whose values count as "the content" (the row id never does: a client
     * that mints a fresh id on every save must not look like an edit), and whether letter case
     * is ignored (ids that live in a case-insensitive key).
     *
     * @return array{parent:string,table:string,key:string,cols:string[],fold:bool,precision:int}
     */
    function ccrm_child_set(string $kind, ?string $table = null): array {
        switch ($kind) {
            case 'managers':
                return ['parent' => 'projects', 'table' => 'project_managers', 'key' => 'project_id', 'cols' => ['user_id'], 'fold' => true, 'precision' => 0];
            case 'gantt':
                return ['parent' => 'projects', 'table' => (string)$table, 'key' => 'project_id', 'cols' => ['title', 'contact_id', 'start_date', 'end_date', 'progress'], 'fold' => false, 'precision' => 0];
            case 'invoice_items':
                return ['parent' => 'invoices_offers', 'table' => 'invoice_offer_items', 'key' => 'invoice_offer_id', 'cols' => ['warehouse_item_id', 'sku', 'name', 'description', 'quantity', 'unit', 'unit_price', 'vat_rate', 'discount_pct', 'total_price'], 'fold' => false, 'precision' => 0];
            case 'meeting_tasks':
                return ['parent' => 'meeting_notes', 'table' => 'meeting_tasks', 'key' => 'meeting_id', 'cols' => ['title', 'description', 'start_date', 'assigned_user', 'due_date', 'priority', 'status'], 'fold' => false, 'precision' => 3];
            case 'movement_items':
                return ['parent' => 'warehouse_movements', 'table' => 'warehouse_movement_items', 'key' => 'movement_id', 'cols' => ['item_id', 'batch_id', 'quantity', 'unit_purchase_price', 'unit_sell_price', 'total_price', 'expiration_date', 'note'], 'fold' => false, 'precision' => 3];
        }
        throw new \InvalidArgumentException("Unknown child set '{$kind}'.");
    }
}

if (!function_exists('ccrm_child_snapshot')) {
    /**
     * The content of one parent's child set as a sorted list of canonical row strings, or null
     * when it cannot be read (then nothing is compared and nothing is bumped). Never throws:
     * a failed read must not abort the push it is part of.
     *
     * @return string[]|null
     */
    function ccrm_child_snapshot(PDO $pdo, string $kind, string $parentId, ?string $table = null): ?array {
        try {
            $set = ccrm_child_set($kind, $table);
            $cols = implode(', ', array_map(fn($c) => "`{$c}`", $set['cols']));
            $stmt = $pdo->prepare("SELECT {$cols} FROM `{$set['table']}` WHERE `{$set['key']}` = ?");
            $stmt->execute([$parentId]);
            $rows = [];
            foreach ($stmt->fetchAll(PDO::FETCH_NUM) as $r) {
                $r = array_map(function ($v) use ($set) {
                    if ($v === null) return null;
                    $v = trim((string)$v);
                    return $set['fold'] ? mb_strtolower($v) : $v;
                }, $r);
                $rows[] = json_encode($r, JSON_UNESCAPED_UNICODE);
            }
            sort($rows, SORT_STRING);
            return $rows;
        } catch (\Throwable $e) {
            error_log('[ccrm] child snapshot of ' . $kind . ' skipped: ' . $e->getMessage());
            return null;
        }
    }
}

if (!function_exists('ccrm_child_bump')) {
    /**
     * Re-read the set and, when it differs from $before, set the parent's `updated_at` to now.
     * `precision` is the parent column's fractional digits (whole seconds on projects and
     * invoices_offers, milliseconds on the tables that carry the conflict guard).
     * Returns true when the parent was bumped.
     */
    function ccrm_child_bump(PDO $pdo, string $kind, string $parentId, ?array $before, ?string $table = null): bool {
        if ($before === null) return false;
        $after = ccrm_child_snapshot($pdo, $kind, $parentId, $table);
        if ($after === null || $after === $before) return false;
        try {
            $set = ccrm_child_set($kind, $table);
            $now = $set['precision'] > 0 ? 'CURRENT_TIMESTAMP(' . (int)$set['precision'] . ')' : 'CURRENT_TIMESTAMP';
            $pdo->prepare("UPDATE `{$set['parent']}` SET `updated_at` = {$now} WHERE `id` = ?")->execute([$parentId]);
            return true;
        } catch (\Throwable $e) {
            error_log('[ccrm] child bump of ' . $kind . ' skipped: ' . $e->getMessage());
            return false;
        }
    }
}
