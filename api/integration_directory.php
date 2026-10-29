<?php
/**
 * Machine API v1 — people and the client/project directory
 * (docs/WAAI-INTEGRATION.md §4.1). Required by integration.php.
 */

if (!function_exists('ccrm_int_handle_users')) {

    /**
     * GET /users: every CCRM user (the users table has no "inactive" state — a user who cannot log in is
     * deleted). `phone` is the raw phone of the linked employee, or null; WAAI normalises it.
     *
     * @return array{0: int, 1: array}
     */
    function ccrm_int_handle_users(\PDO $pdo, array $client, array $req): array {
        $rows = $pdo->query(
            "SELECT u.`id`, u.`name`, u.`email`, e.`phone`
               FROM `users` u
               LEFT JOIN `employees` e ON e.`user_id` = u.`id`
              ORDER BY u.`id`"
        )->fetchAll(\PDO::FETCH_ASSOC);

        return [200, ['users' => array_map(static function (array $u): array {
            $phone = trim((string)($u['phone'] ?? ''));
            return [
                'id' => (string)$u['id'],
                'name' => (string)$u['name'],
                'email' => (string)$u['email'],
                'phone' => $phone !== '' ? $phone : null,
            ];
        }, $rows)]];
    }
}

if (!function_exists('ccrm_int_handle_directory')) {

    define('CCRM_INT_DIRECTORY_MAX', 200);

    /** A lead row is a client when its id starts with `client-` or it carries a value adjustment (src/utils/clientRecord.ts). */
    function ccrm_int_is_client_row(array $lead): bool {
        return strpos((string)$lead['id'], 'client-') === 0 || (float)($lead['adjustment'] ?? 0) > 0;
    }

    /** Lead ids stored in a project's "contact" attributes, keyed by project id. */
    function ccrm_int_project_contacts(\PDO $pdo, array $projects): array {
        $byType = [];
        foreach ($projects as $p) {
            $byType[$p['project_type_id']][] = $p['id'];
        }
        $out = [];
        foreach ($byType as $typeId => $projectIds) {
            $stmt = $pdo->prepare("SELECT `attributes_json` FROM `project_types` WHERE `id` = ?");
            $stmt->execute([$typeId]);
            $attrs = json_decode((string)$stmt->fetchColumn(), true);
            $columns = [];
            foreach (is_array($attrs) ? $attrs : [] as $a) {
                if (is_array($a) && ($a['type'] ?? '') === 'contact' && isset($a['id'])) {
                    $columns[] = 'attr_' . preg_replace('/[^a-z0-9_]/', '', strtolower((string)$a['id']));
                }
            }
            if ($columns === []) {
                continue;
            }
            $table = 'proj_data_' . preg_replace('/[^a-z0-9_]/', '', strtolower((string)$typeId));
            $select = implode(', ', array_map(static fn(string $c): string => "`{$c}`", $columns));
            $marks = implode(',', array_fill(0, count($projectIds), '?'));
            try {
                $rows = $pdo->prepare("SELECT `project_id`, {$select} FROM `{$table}` WHERE `project_id` IN ({$marks})");
                $rows->execute($projectIds);
                foreach ($rows->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                    $pid = $row['project_id'];
                    unset($row['project_id']);
                    foreach ($row as $stored) {
                        // One lead id, or (older data) a JSON list of them.
                        $decoded = is_string($stored) && ($stored[0] ?? '') === '[' ? json_decode($stored, true) : $stored;
                        foreach (is_array($decoded) ? $decoded : [$decoded] as $leadId) {
                            if (is_string($leadId) && $leadId !== '' && !in_array($leadId, $out[$pid] ?? [], true)) {
                                $out[$pid][] = $leadId;
                            }
                        }
                    }
                }
            } catch (\PDOException $e) {
                // The type's data table or a column is not there (yet): no contacts for its projects.
            }
        }
        return $out;
    }

    /**
     * GET /directory — leads/clients and projects in one keyset-paged list ordered by
     * (updated_at in whole seconds, "<type>:<id>"). Names, phones and ids only; no financial data.
     *
     * @return array{0: int, 1: array}
     */
    function ccrm_int_handle_directory(\PDO $pdo, array $client, array $req): array {
        $q = $req['query'];
        $since = ccrm_int_query_int($q, 'updated_since', 0, 0);
        $limit = ccrm_int_query_int($q, 'limit', 100, 1, CCRM_INT_DIRECTORY_MAX);
        $afterId = $q['after_id'] ?? '';
        if (!is_string($afterId) || !preg_match('/^(?:(?:lead|project):[A-Za-z0-9_-]{1,50})?$/D', $afterId)) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', ['after_id' => 'Must look like lead:<id> or project:<id>.']);
        }

        $branch = static fn(string $kind, string $table, string $alias): string =>
            "SELECT '{$kind}' AS kind, {$alias}.`id` AS id, FLOOR(UNIX_TIMESTAMP({$alias}.`updated_at`)) AS ts FROM `{$table}` {$alias}"
            . ($since > 0 ? " WHERE {$alias}.`updated_at` >= FROM_UNIXTIME(CAST(? AS UNSIGNED))" : '');
        $params = $since > 0 ? [(string)$since, (string)$since] : [];
        $key = "CONCAT(k.kind, ':', k.id) COLLATE utf8mb4_bin";
        $stmt = $pdo->prepare(
            "SELECT k.kind, k.id, k.ts FROM (" . $branch('lead', 'leads', 'l') . " UNION ALL " . $branch('project', 'projects', 'p') . ") k"
            . " WHERE (k.ts > ? OR (k.ts = ? AND {$key} > ?)) ORDER BY k.ts ASC, {$key} ASC LIMIT " . ($limit + 1)
        );
        $stmt->execute(array_merge($params, [$since, $since, $afterId]));
        $keys = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $hasMore = count($keys) > $limit;
        $keys = array_slice($keys, 0, $limit);

        $ids = ['lead' => [], 'project' => []];
        foreach ($keys as $k) {
            $ids[$k['kind']][] = $k['id'];
        }
        $leads = [];
        if ($ids['lead'] !== []) {
            $marks = implode(',', array_fill(0, count($ids['lead']), '?'));
            $st = $pdo->prepare("SELECT `id`, `name`, `phone`, `country`, `client_id`, `adjustment`, `archived`, `updated_at` FROM `leads` WHERE `id` IN ({$marks})");
            $st->execute($ids['lead']);
            foreach ($st->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $leads[$r['id']] = $r;
            }
        }
        $projects = [];
        if ($ids['project'] !== []) {
            $marks = implode(',', array_fill(0, count($ids['project']), '?'));
            $st = $pdo->prepare("SELECT `id`, `project_type_id`, `name`, `lead_id`, `client_id`, `status`, `contact_phone`, `archived`, `updated_at` FROM `projects` WHERE `id` IN ({$marks})");
            $st->execute($ids['project']);
            foreach ($st->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $projects[$r['id']] = $r;
            }
        }
        $contacts = ccrm_int_project_contacts($pdo, array_values($projects));
        $base = ccrm_int_base_url($pdo);
        $iso = static fn($v): ?string => $v ? (new \DateTimeImmutable((string)$v, ccrm_int_local_zone()))->format('c') : null;
        $nz = static fn($v): ?string => ($v = trim((string)($v ?? ''))) !== '' ? $v : null;

        $items = [];
        foreach ($keys as $k) {
            if ($k['kind'] === 'lead') {
                $r = $leads[$k['id']] ?? null;
                if ($r === null) {
                    continue;   // deleted between the two queries
                }
                $isClient = ccrm_int_is_client_row($r);
                $items[] = [
                    'type' => 'lead',
                    'id' => (string)$r['id'],
                    'name' => (string)$r['name'],
                    'is_client' => $isClient,
                    'client_id' => $nz($r['client_id']),
                    'phone' => $nz($r['phone']),
                    'country' => $nz($r['country']),
                    'archived' => (int)$r['archived'] === 1,
                    'updated_at' => $iso($r['updated_at']),
                    'url' => $base === '' ? null : $base . '#' . ($isClient ? 'clients' : 'leads') . '/' . rawurlencode((string)$r['id']),
                ];
            } else {
                $r = $projects[$k['id']] ?? null;
                if ($r === null) {
                    continue;
                }
                $items[] = [
                    'type' => 'project',
                    'id' => (string)$r['id'],
                    'name' => (string)($r['name'] ?? ''),
                    'client_id' => $nz($r['client_id']),
                    'lead_id' => $nz($r['lead_id']),
                    'contact_phone' => $nz($r['contact_phone']),
                    'contact_lead_ids' => $contacts[$r['id']] ?? [],
                    'status' => (string)$r['status'],
                    'archived' => (int)$r['archived'] === 1,
                    'updated_at' => $iso($r['updated_at']),
                    'url' => $base === '' ? null : $base . '#projects/' . rawurlencode((string)$r['id']),
                ];
            }
        }
        $last = $keys !== [] ? end($keys) : null;

        return [200, [
            'items' => $items,
            'next' => [
                'updated_since' => $last !== null ? (int)$last['ts'] : $since,
                'after_id' => $last !== null ? $last['kind'] . ':' . $last['id'] : $afterId,
            ],
            'has_more' => $hasMore,
        ]];
    }
}
