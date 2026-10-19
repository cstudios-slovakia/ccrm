<?php
/**
 * Gives a client that exists only through `adjustment > 0` a real `client-*` row.
 *
 * Until now such a client was a lead row whose adjustment happened to be positive: no
 * client row to point `leads.client_id` at. This creates the row, moves the adjustment
 * onto it, and links the lead and its safe same-name leads to it by `client_id`.
 *
 * The Clients register groups by name and counts the first non-zero adjustment of a name
 * once, so a move (never a copy) leaves every total as it was. Every write is checked
 * against that: the register total of the name is computed before and after, and a
 * mismatch rolls that client back.
 *
 * Which names are left alone, and reported instead:
 *  - the name already has a `client-*` row (nothing to create);
 *  - the rows of that name carry different adjustments, or a negative one: the register
 *    and the MCP pick "the first non-zero" in different orders, so a person must say which;
 *  - the lead already has a `client_id`, or the link rules of lead_client_backfill.php
 *    refuse it (another e-mail or phone under the same name).
 *
 * Reversible: every migrated client is recorded in `client_adjustment_migration`, and
 * ccrm_undo_adjustment_clients() puts the adjustment back and removes the row, unless the
 * row has been used since (notes, tasks, projects, invoices...), which is then reported.
 *
 * - ccrm_plan_adjustment_clients($rows): pure, no database. Used by the tests.
 * - ccrm_migrate_adjustment_clients($pdo, $apply) / ccrm_undo_adjustment_clients($pdo, $apply)
 *
 * Run by hand:  php ccrm adjustment-clients [--apply] [--undo]   (no --apply = dry run).
 * Never runs on its own: it changes records, so it is a decision, not a schema step.
 */

require_once __DIR__ . '/lead_client_backfill.php';

if (!function_exists('ccrm_plan_adjustment_clients')) {

    /** Columns copied from the lead onto the new client row. Absent columns are skipped. */
    function ccrm_adjustment_copy_columns(): array {
        return [
            'name', 'city', 'street', 'postal_code', 'country', 'phone', 'email', 'contact_person',
            'company_id', 'tax_id', 'vat_id', 'website', 'client_type', 'status', 'source', 'owner',
            'division', 'rating', 'client_category_id', 'legal_form', 'sk_nace', 'establishment_date',
            'organization_size', 'ownership_type', 'data_source', 'dissolution_date', 'region',
            'district', 'archived',
        ];
    }

    /** Deterministic, so a second run cannot create a second row for the same lead. */
    function ccrm_adjustment_client_id(string $leadId): string {
        $id = 'client-adj-' . $leadId;
        return strlen($id) <= 50 ? $id : 'client-adj-' . substr(sha1($leadId), 0, 20);
    }

    /** What the Clients register shows for one name: sum of values + the first non-zero adjustment. */
    function ccrm_register_total(array $rows): float {
        $total = 0.0;
        $adjustment = 0.0;
        foreach ($rows as $r) {
            $total += (float)($r['value'] ?? 0);
            if ($adjustment == 0.0 && (float)($r['adjustment'] ?? 0) != 0.0) $adjustment = (float)$r['adjustment'];
        }
        return round($total + $adjustment, 2);
    }

    /**
     * @param array $rows each: id, name, email, phone, client_id, adjustment, created_at
     * @return array{entries: array, unresolved: array, has_client_row: int}
     */
    function ccrm_plan_adjustment_clients(array $rows): array {
        $groups = [];
        foreach ($rows as $r) {
            $id = (string)($r['id'] ?? '');
            $key = ccrm_backfill_name_key($r['name'] ?? '');
            if ($id === '' || $id === 'unassigned-docs' || $key === '') continue;
            $groups[$key][] = $r;
        }
        $taken = array_flip(array_map(fn($r) => (string)$r['id'], $rows));

        $entries = [];
        $unresolved = [];
        $hasClientRow = 0;
        foreach ($groups as $group) {
            $holders = array_values(array_filter($group, fn($r) => (float)($r['adjustment'] ?? 0) != 0.0));
            if (!$holders) continue;
            $name = trim((string)$group[0]['name']);
            $holderIds = array_map(fn($r) => (string)$r['id'], $holders);
            $skip = function (string $reason) use (&$unresolved, $name, $holderIds) {
                $unresolved[] = ['name' => $name, 'reason' => $reason, 'lead_ids' => $holderIds];
            };

            foreach ($group as $r) {
                if (strpos((string)$r['id'], 'client-') === 0) { $hasClientRow++; continue 2; }
            }
            $values = array_unique(array_map(fn($r) => number_format((float)$r['adjustment'], 2, '.', ''), $holders));
            if (count($values) > 1) { $skip('the records of this name carry different adjustments (' . implode(', ', $values) . ')'); continue; }
            if ((float)$values[0] < 0) { $skip('the adjustment is negative'); continue; }
            foreach ($holders as $h) {
                if (trim((string)($h['client_id'] ?? '')) !== '') { $skip('a record is already linked to ' . $h['client_id']); continue 2; }
            }

            usort($holders, fn($a, $b) => [(string)($a['created_at'] ?? ''), (string)$a['id']] <=> [(string)($b['created_at'] ?? ''), (string)$b['id']]);
            $source = $holders[0];
            $newId = ccrm_adjustment_client_id((string)$source['id']);
            if (isset($taken[$newId])) { $skip("the id $newId is already in use"); continue; }

            // The new client stands in for its source lead; the existing rules decide who else belongs to it.
            $candidate = ['id' => $newId, 'name' => $source['name'], 'email' => $source['email'] ?? '', 'phone' => $source['phone'] ?? '', 'client_id' => null];
            $link = ccrm_plan_lead_client_links(array_merge([$candidate], $group));
            if (!isset($link['links'][(string)$source['id']])) {
                $skip($link['ambiguous'] ? $link['ambiguous'][0]['reason'] : 'the lead cannot be linked safely');
                continue;
            }

            $moved = array_values(array_filter($holderIds, fn($id) => isset($link['links'][$id])));
            $entries[] = [
                'client_id' => $newId,
                'name' => $name,
                'source_id' => (string)$source['id'],
                'adjustment' => round((float)$values[0], 2),
                'moved_from' => $moved,
                'link_ids' => array_keys($link['links']),
                'left_unlinked' => $link['ambiguous'],
            ];
        }
        return ['entries' => $entries, 'unresolved' => $unresolved, 'has_client_row' => $hasClientRow];
    }

    function ccrm_adjustment_ensure_log(PDO $pdo): void {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `client_adjustment_migration` (
            `client_id` VARCHAR(50) NOT NULL,
            `name` VARCHAR(150) NOT NULL,
            `adjustment` DECIMAL(14,2) NOT NULL,
            `moved_from` TEXT NOT NULL COMMENT 'JSON: lead ids the adjustment was taken from',
            `linked_ids` TEXT NOT NULL COMMENT 'JSON: lead ids given this client_id',
            `migrated_at` DATETIME NOT NULL,
            PRIMARY KEY (`client_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    }

    function ccrm_adjustment_name_rows(PDO $pdo, string $name): array {
        $st = $pdo->prepare("SELECT * FROM `leads` WHERE LOWER(TRIM(`name`)) = ? ORDER BY `id`");
        $st->execute([ccrm_backfill_name_key($name)]);
        return $st->fetchAll(PDO::FETCH_ASSOC);
    }

    function ccrm_migrate_adjustment_clients(PDO $pdo, bool $apply = false): array {
        $rows = $pdo->query("SELECT `id`, `name`, `email`, `phone`, `client_id`, `adjustment`, `created_at` FROM `leads`")->fetchAll(PDO::FETCH_ASSOC);
        $plan = ccrm_plan_adjustment_clients($rows);
        $done = [];
        $failed = [];

        if ($apply && $plan['entries']) {
            ccrm_adjustment_ensure_log($pdo);
            foreach ($plan['entries'] as $e) {
                try {
                    $pdo->beginTransaction();
                    $before = ccrm_adjustment_name_rows($pdo, $e['name']);
                    $byId = [];
                    foreach ($before as $r) $byId[$r['id']] = $r;
                    $source = $byId[$e['source_id']] ?? null;
                    // The plan was read a moment ago; do not act on a row someone has changed since.
                    foreach ($e['moved_from'] as $id) {
                        if (!isset($byId[$id]) || round((float)$byId[$id]['adjustment'], 2) !== $e['adjustment'] || trim((string)$byId[$id]['client_id']) !== '') {
                            throw new RuntimeException("lead $id changed since the plan was made");
                        }
                    }
                    $cols = array_values(array_filter(ccrm_adjustment_copy_columns(), fn($c) => array_key_exists($c, $source)));
                    $cols = array_merge(['id', 'value', 'adjustment', 'created_at'], $cols);
                    $vals = array_merge([$e['client_id'], 0, $e['adjustment'], $source['created_at']], array_map(fn($c) => $source[$c], array_slice($cols, 4)));
                    $pdo->prepare("INSERT INTO `leads` (`" . implode('`,`', $cols) . "`) VALUES (" . implode(',', array_fill(0, count($cols), '?')) . ")")->execute($vals);

                    // The leads the adjustment leaves change in a way other open browsers must see, so their
                    // updated_at moves (a stale push of them is then refused as a conflict, not applied).
                    $mv = $pdo->prepare("UPDATE `leads` SET `adjustment` = 0, `client_id` = ? WHERE `id` = ?");
                    foreach ($e['moved_from'] as $id) $mv->execute([$e['client_id'], $id]);
                    $ln = $pdo->prepare("UPDATE `leads` SET `client_id` = ?, `updated_at` = `updated_at` WHERE `id` = ? AND (`client_id` IS NULL OR `client_id` = '')");
                    foreach (array_diff($e['link_ids'], $e['moved_from']) as $id) $ln->execute([$e['client_id'], $id]);

                    $pdo->prepare("INSERT INTO `client_adjustment_migration` (`client_id`, `name`, `adjustment`, `moved_from`, `linked_ids`, `migrated_at`) VALUES (?,?,?,?,?,NOW())")
                        ->execute([$e['client_id'], $e['name'], $e['adjustment'], json_encode($e['moved_from']), json_encode(array_values($e['link_ids']))]);

                    $was = ccrm_register_total($before);
                    $now = ccrm_register_total(ccrm_adjustment_name_rows($pdo, $e['name']));
                    if (abs($was - $now) > 0.004) throw new RuntimeException("register total would change from $was to $now");
                    $pdo->commit();
                    $done[] = ['client_id' => $e['client_id'], 'name' => $e['name'], 'total' => $now];
                } catch (Throwable $ex) {
                    if ($pdo->inTransaction()) $pdo->rollBack();
                    $failed[] = ['name' => $e['name'], 'reason' => $ex->getMessage()];
                }
            }
        }

        return [
            'applied' => $apply,
            'planned' => $plan['entries'],
            'created' => $done,
            'failed' => $failed,
            'unresolved' => $plan['unresolved'],
            'names_with_client_row' => $plan['has_client_row'],
            'ran_at' => date('c'),
        ];
    }

    /** Rows that point at the migrated client for a reason other than this migration. */
    function ccrm_adjustment_dependents(PDO $pdo, string $clientId, array $linkedIds): array {
        $found = [];
        $count = function (string $sql, array $args) use ($pdo): int {
            try { $st = $pdo->prepare($sql); $st->execute($args); return (int)$st->fetchColumn(); }
            catch (Throwable $e) { return 0; } // table or column absent on this installation
        };
        foreach ([
            ['timeline_events', 'lead_id'], ['tasks', 'related_lead_id'], ['tasks', 'client_id'],
            ['projects', 'lead_id'], ['projects', 'client_id'], ['invoices', 'lead_id'], ['invoices', 'client_id'],
            ['warehouse_movements', 'lead_id'], ['leads', 'referral_lead_id'],
        ] as [$table, $col]) {
            $n = $count("SELECT COUNT(*) FROM `$table` WHERE `$col` = ?", [$clientId]);
            if ($n) $found[] = "$table.$col ($n)";
        }
        $in = $linkedIds ? implode(',', array_fill(0, count($linkedIds), '?')) : "''";
        $n = $count("SELECT COUNT(*) FROM `leads` WHERE `client_id` = ? AND `id` NOT IN ($in)", array_merge([$clientId], $linkedIds));
        if ($n) $found[] = "leads.client_id ($n)";
        return $found;
    }

    function ccrm_undo_adjustment_clients(PDO $pdo, bool $apply = false): array {
        ccrm_adjustment_ensure_log($pdo);
        $log = $pdo->query("SELECT * FROM `client_adjustment_migration` ORDER BY `migrated_at`")->fetchAll(PDO::FETCH_ASSOC);
        $restored = [];
        $kept = [];
        foreach ($log as $l) {
            $clientId = $l['client_id'];
            $moved = json_decode($l['moved_from'], true) ?: [];
            $linked = json_decode($l['linked_ids'], true) ?: [];
            $st = $pdo->prepare("SELECT * FROM `leads` WHERE `id` = ?");
            $st->execute([$clientId]);
            $client = $st->fetch(PDO::FETCH_ASSOC);
            if (!$client) {
                // Already gone (deleted in the app): only the record of the move is left.
                if ($apply) $pdo->prepare("DELETE FROM `client_adjustment_migration` WHERE `client_id` = ?")->execute([$clientId]);
                $kept[] = ['client_id' => $clientId, 'name' => $l['name'], 'reason' => 'the client row no longer exists; the log entry is dropped, adjustments are not restored'];
                continue;
            }
            $deps = ccrm_adjustment_dependents($pdo, $clientId, $linked);
            if ($deps) { $kept[] = ['client_id' => $clientId, 'name' => $l['name'], 'reason' => 'in use: ' . implode(', ', $deps)]; continue; }
            if (!$moved) { $kept[] = ['client_id' => $clientId, 'name' => $l['name'], 'reason' => 'no source lead recorded']; continue; }

            // Whatever the adjustment is now (it may have been edited on the client) goes back.
            $adjustment = round((float)$client['adjustment'], 2);
            if ($apply) {
                try {
                    $pdo->beginTransaction();
                    $before = ccrm_adjustment_name_rows($pdo, $l['name']);
                    $pdo->prepare("UPDATE `leads` SET `adjustment` = ?, `client_id` = NULL WHERE `id` = ?")->execute([$adjustment, $moved[0]]);
                    $rest = $pdo->prepare("UPDATE `leads` SET `client_id` = NULL, `updated_at` = `updated_at` WHERE `id` = ? AND `client_id` = ?");
                    foreach (array_diff($linked, [$moved[0]]) as $id) $rest->execute([$id, $clientId]);
                    $pdo->prepare("DELETE FROM `leads` WHERE `id` = ?")->execute([$clientId]);
                    $pdo->prepare("DELETE FROM `client_adjustment_migration` WHERE `client_id` = ?")->execute([$clientId]);
                    $was = ccrm_register_total($before);
                    $now = ccrm_register_total(ccrm_adjustment_name_rows($pdo, $l['name']));
                    if (abs($was - $now) > 0.004) throw new RuntimeException("register total would change from $was to $now");
                    $pdo->commit();
                } catch (Throwable $ex) {
                    if ($pdo->inTransaction()) $pdo->rollBack();
                    $kept[] = ['client_id' => $clientId, 'name' => $l['name'], 'reason' => $ex->getMessage()];
                    continue;
                }
            }
            $restored[] = ['client_id' => $clientId, 'name' => $l['name'], 'adjustment' => $adjustment, 'restored_to' => $moved[0]];
        }
        return ['applied' => $apply, 'restored' => $restored, 'kept' => $kept, 'ran_at' => date('c')];
    }
}
