<?php
/**
 * ClickUp integration library (Settings -> Integrations -> ClickUp, project list mapping,
 * read-only task/subtask mirror, webhook handler, and cron fallback).
 *
 * Included by api/schema.php, sync.php, api/clickup.php, api/clickup_webhook.php, and api/cron.php.
 * Every function is wrapped in function_exists() so multiple includes remain safe.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/task_done.php';
require_once __DIR__ . '/project_breakdown_migrations.php';

if (!function_exists('ccrm_migrate_clickup')) {

    define('CCRM_CLICKUP_API_BASE', 'https://api.clickup.com/api/v2');
    define('CCRM_CLICKUP_CONFIG_KEY', 'CLICKUP_CONFIG');
    define('CCRM_CLICKUP_CRON_THROTTLE', 300);
    define('CCRM_CLICKUP_HIERARCHY_TTL', 60);

    // ------------------------------------------------------------------ Schema & column healing

    function ccrm_migrate_clickup(\PDO $pdo): void {
        if (ccrm_table_exists($pdo, 'projects') && !ccrm_column_exists($pdo, 'projects', 'clickup_lists_json')) {
            $pdo->exec("ALTER TABLE `projects` ADD COLUMN `clickup_lists_json` TEXT NULL COMMENT 'JSON array of linked ClickUp lists [{id,name,folderName,spaceName}]'");
        }
        if (ccrm_table_exists($pdo, 'tasks')) {
            if (!ccrm_column_exists($pdo, 'tasks', 'parent_task_id')) {
                $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `parent_task_id` VARCHAR(50) NULL COMMENT 'Parent task id for external subtasks (e.g. ClickUp)'");
            }
            $idx = $pdo->prepare("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'idx_task_parent' LIMIT 1");
            $idx->execute();
            if (!$idx->fetchColumn()) {
                $pdo->exec("ALTER TABLE `tasks` ADD INDEX idx_task_parent (`parent_task_id`)");
            }
        }
    }

    /** Pre-transaction healing called from sync.php before beginTransaction(). */
    function ccrm_heal_clickup_columns(\PDO $pdo): void {
        ccrm_migrate_clickup($pdo);
    }

    // ------------------------------------------------------------------ JSON & payload helpers

    /** @return list<array{id:string,name:string,folderName:?string,spaceName:?string}> */
    function ccrm_decode_clickup_lists(?string $raw): array {
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return [];
        }
        $out = [];
        $seen = [];
        foreach ($decoded as $item) {
            if (!is_array($item)) {
                continue;
            }
            $id = trim((string)($item['id'] ?? ''));
            $name = trim((string)($item['name'] ?? ''));
            if ($id === '' || strlen($id) > 64 || isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;
            $folder = isset($item['folderName']) && is_string($item['folderName']) ? trim($item['folderName']) : '';
            $space = isset($item['spaceName']) && is_string($item['spaceName']) ? trim($item['spaceName']) : '';
            $out[] = [
                'id' => $id,
                'name' => mb_substr($name !== '' ? $name : $id, 0, 200),
                'folderName' => $folder !== '' ? mb_substr($folder, 0, 200) : null,
                'spaceName' => $space !== '' ? mb_substr($space, 0, 200) : null,
            ];
        }
        return $out;
    }

    function ccrm_encode_clickup_lists($lists): ?string {
        if (!is_array($lists)) {
            return null;
        }
        $normalized = ccrm_decode_clickup_lists(json_encode($lists, JSON_UNESCAPED_UNICODE));
        return $normalized !== [] ? json_encode($normalized, JSON_UNESCAPED_UNICODE) : null;
    }

    function ccrm_decode_clickup_task_meta(?string $source, ?string $raw): ?array {
        if ($source !== 'clickup' || !is_string($raw) || trim($raw) === '') {
            return null;
        }
        $meta = json_decode($raw, true);
        if (!is_array($meta) || empty($meta['clickupId'])) {
            return null;
        }
        $out = [
            'clickupId' => (string)$meta['clickupId'],
            'listId' => (string)($meta['listId'] ?? ''),
        ];
        if (!empty($meta['listName']) && is_string($meta['listName'])) {
            $out['listName'] = $meta['listName'];
        }
        if (!empty($meta['statusName']) && is_string($meta['statusName'])) {
            $out['statusName'] = $meta['statusName'];
        }
        if (!empty($meta['statusColor']) && is_string($meta['statusColor'])) {
            $out['statusColor'] = $meta['statusColor'];
        }
        return $out;
    }

    // ------------------------------------------------------------------ Encrypted config storage

    function ccrm_clickup_default_config(): array {
        return [
            'enabled' => false,
            'apiToken' => '',
            'teamId' => '',
            'teamName' => '',
            'webhookId' => null,
            'webhookSecret' => '',
            'lastSyncAt' => null,
            'lastSyncError' => null,
        ];
    }

    function ccrm_clickup_load_config(\PDO $pdo, bool $decrypt = true): array {
        $defaults = ccrm_clickup_default_config();
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = ? LIMIT 1");
            $stmt->execute([CCRM_CLICKUP_CONFIG_KEY]);
            $raw = $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return $defaults;
        }
        if (!is_string($raw) || trim($raw) === '') {
            return $defaults;
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return $defaults;
        }
        $cfg = array_merge($defaults, $decoded);
        $cfg['enabled'] = !empty($cfg['enabled']);
        $cfg['apiToken'] = is_string($cfg['apiToken']) ? $cfg['apiToken'] : '';
        $cfg['teamId'] = is_string($cfg['teamId']) ? $cfg['teamId'] : '';
        $cfg['teamName'] = is_string($cfg['teamName']) ? $cfg['teamName'] : '';
        $cfg['webhookId'] = (!empty($cfg['webhookId']) && is_string($cfg['webhookId'])) ? $cfg['webhookId'] : null;
        $cfg['webhookSecret'] = is_string($cfg['webhookSecret']) ? $cfg['webhookSecret'] : '';
        $cfg['lastSyncAt'] = (!empty($cfg['lastSyncAt']) && is_string($cfg['lastSyncAt'])) ? $cfg['lastSyncAt'] : null;
        $cfg['lastSyncError'] = (!empty($cfg['lastSyncError']) && is_string($cfg['lastSyncError'])) ? $cfg['lastSyncError'] : null;
        if ($decrypt) {
            foreach (['apiToken', 'webhookSecret'] as $field) {
                if ($cfg[$field] !== '') {
                    $plain = ccrm_decrypt_secret($cfg[$field]);
                    $cfg[$field] = strncmp($plain, 'enc:v1:', 7) === 0 ? '' : $plain;
                }
            }
        }
        return $cfg;
    }

    function ccrm_clickup_write_config(\PDO $pdo, array $cfg): void {
        $toStore = $cfg;
        foreach (['apiToken', 'webhookSecret'] as $field) {
            $val = trim((string)($toStore[$field] ?? ''));
            $toStore[$field] = $val !== '' ? ccrm_encrypt_secret($val) : '';
        }
        $json = json_encode($toStore, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $stmt = $pdo->prepare(
            "INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)"
        );
        $stmt->execute([CCRM_CLICKUP_CONFIG_KEY, $json]);
    }

    function ccrm_clickup_mask_config(array $cfg): array {
        $hasToken = trim((string)($cfg['apiToken'] ?? '')) !== '';
        return [
            'enabled' => !empty($cfg['enabled']),
            'hasToken' => $hasToken,
            'apiToken' => $hasToken ? CCRM_SECRET_MASK : '',
            'teamId' => (string)($cfg['teamId'] ?? ''),
            'teamName' => (string)($cfg['teamName'] ?? ''),
            'webhookActive' => !empty($cfg['webhookId']) && trim((string)($cfg['webhookSecret'] ?? '')) !== '',
            'lastSyncAt' => $cfg['lastSyncAt'] ?? null,
            'lastSyncError' => $cfg['lastSyncError'] ?? null,
        ];
    }

    function ccrm_clickup_save_config(\PDO $pdo, array $patch): array {
        $current = ccrm_clickup_load_config($pdo, true);
        if (array_key_exists('enabled', $patch)) {
            $current['enabled'] = !empty($patch['enabled']);
        }
        if (!empty($patch['clearToken'])) {
            $current['apiToken'] = '';
        } elseif (array_key_exists('apiToken', $patch)) {
            $inToken = trim((string)$patch['apiToken']);
            if ($inToken !== '' && $inToken !== CCRM_SECRET_MASK) {
                $current['apiToken'] = $inToken;
            }
        }
        if (array_key_exists('teamId', $patch)) {
            $current['teamId'] = trim((string)$patch['teamId']);
        }
        if (array_key_exists('teamName', $patch)) {
            $current['teamName'] = mb_substr(trim((string)$patch['teamName']), 0, 200);
        }
        ccrm_clickup_write_config($pdo, $current);
        return $current;
    }

    function ccrm_clickup_is_connected(\PDO $pdo): bool {
        $cfg = ccrm_clickup_load_config($pdo, true);
        return !empty($cfg['enabled']) && trim((string)$cfg['apiToken']) !== '' && trim((string)$cfg['teamId']) !== '';
    }

    // ------------------------------------------------------------------ ClickUp API v2 HTTP Client

    function ccrm_clickup_request(string $method, string $path, string $token, ?array $body = null): array {
        $token = trim($token);
        if ($token === '') {
            return ['ok' => false, 'status' => 400, 'data' => null, 'error' => 'No ClickUp API token configured.'];
        }
        if (!function_exists('curl_init')) {
            return ['ok' => false, 'status' => 500, 'data' => null, 'error' => 'PHP cURL extension is not available.'];
        }
        $url = CCRM_CLICKUP_API_BASE . $path;
        $ch = curl_init($url);
        $headers = [
            'Authorization: ' . $token,
            'Accept: application/json',
            'Content-Type: application/json',
        ];
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_HTTPHEADER => $headers,
        ];
        if ($body !== null) {
            $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        if (PHP_VERSION_ID < 80500) {
            @curl_close($ch);
        }
        if ($err !== '' || $raw === false) {
            return ['ok' => false, 'status' => 0, 'data' => null, 'error' => 'Connection error: ' . ($err ?: 'empty response')];
        }
        $decoded = json_decode((string)$raw, true);
        if ($status >= 200 && $status < 300) {
            return ['ok' => true, 'status' => $status, 'data' => is_array($decoded) ? $decoded : [], 'error' => null];
        }
        $msg = is_array($decoded) ? ($decoded['err'] ?? $decoded['message'] ?? $decoded['error'] ?? ('HTTP ' . $status)) : ('HTTP ' . $status);
        return ['ok' => false, 'status' => $status, 'data' => is_array($decoded) ? $decoded : null, 'error' => (string)$msg];
    }

    function ccrm_clickup_test_token(string $token): array {
        $userRes = ccrm_clickup_request('GET', '/user', $token);
        if (!$userRes['ok']) {
            return ['ok' => false, 'error' => $userRes['error'] ?: 'Authentication failed.'];
        }
        $teamsRes = ccrm_clickup_request('GET', '/team', $token);
        if (!$teamsRes['ok']) {
            return ['ok' => false, 'error' => $teamsRes['error'] ?: 'Failed to load ClickUp workspaces.'];
        }
        $u = is_array($userRes['data']['user'] ?? null) ? $userRes['data']['user'] : [];
        $teams = [];
        foreach (($teamsRes['data']['teams'] ?? []) as $t) {
            if (!is_array($t) || empty($t['id'])) {
                continue;
            }
            $teams[] = [
                'id' => (string)$t['id'],
                'name' => (string)($t['name'] ?? $t['id']),
            ];
        }
        return [
            'ok' => true,
            'user' => [
                'id' => isset($u['id']) ? (string)$u['id'] : '',
                'username' => (string)($u['username'] ?? ''),
                'email' => (string)($u['email'] ?? ''),
            ],
            'teams' => $teams,
        ];
    }

    function ccrm_clickup_hierarchy_cache_file(string $teamId): string {
        return rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'ccrm-clickup-hierarchy-' . md5(__DIR__ . '|' . $teamId) . '.json';
    }

    function ccrm_clickup_fetch_hierarchy(\PDO $pdo, bool $forceRefresh = false): array {
        $cfg = ccrm_clickup_load_config($pdo, true);
        if (empty($cfg['enabled']) || trim((string)$cfg['apiToken']) === '' || trim((string)$cfg['teamId']) === '') {
            return ['ok' => false, 'error' => 'ClickUp is not connected or workspace is not selected.', 'spaces' => []];
        }
        $teamId = trim((string)$cfg['teamId']);
        $token = trim((string)$cfg['apiToken']);
        $cacheFile = ccrm_clickup_hierarchy_cache_file($teamId);

        if (!$forceRefresh && is_file($cacheFile)) {
            $age = time() - (int)@filemtime($cacheFile);
            if ($age >= 0 && $age < CCRM_CLICKUP_HIERARCHY_TTL) {
                $cached = json_decode((string)@file_get_contents($cacheFile), true);
                if (is_array($cached) && isset($cached['spaces'])) {
                    return ['ok' => true, 'spaces' => $cached['spaces'], 'cached' => true];
                }
            }
        }

        $spacesRes = ccrm_clickup_request('GET', '/team/' . rawurlencode($teamId) . '/space?archived=false', $token);
        if (!$spacesRes['ok']) {
            return ['ok' => false, 'error' => $spacesRes['error'] ?: 'Failed to load ClickUp spaces.', 'spaces' => []];
        }

        $spaces = [];
        foreach (($spacesRes['data']['spaces'] ?? []) as $sp) {
            if (!is_array($sp) || empty($sp['id'])) {
                continue;
            }
            $spaceId = (string)$sp['id'];
            $spaceName = (string)($sp['name'] ?? $spaceId);

            $folders = [];
            $foldersRes = ccrm_clickup_request('GET', '/space/' . rawurlencode($spaceId) . '/folder?archived=false', $token);
            if ($foldersRes['ok']) {
                foreach (($foldersRes['data']['folders'] ?? []) as $fl) {
                    if (!is_array($fl) || empty($fl['id'])) {
                        continue;
                    }
                    $folderLists = [];
                    foreach (($fl['lists'] ?? []) as $lst) {
                        if (!is_array($lst) || empty($lst['id'])) {
                            continue;
                        }
                        $folderLists[] = [
                            'id' => (string)$lst['id'],
                            'name' => (string)($lst['name'] ?? $lst['id']),
                            'taskCount' => isset($lst['task_count']) ? (int)$lst['task_count'] : null,
                        ];
                    }
                    if ($folderLists !== []) {
                        $folders[] = [
                            'id' => (string)$fl['id'],
                            'name' => (string)($fl['name'] ?? $fl['id']),
                            'lists' => $folderLists,
                        ];
                    }
                }
            }

            $folderlessLists = [];
            $listsRes = ccrm_clickup_request('GET', '/space/' . rawurlencode($spaceId) . '/list?archived=false', $token);
            if ($listsRes['ok']) {
                foreach (($listsRes['data']['lists'] ?? []) as $lst) {
                    if (!is_array($lst) || empty($lst['id'])) {
                        continue;
                    }
                    $folderlessLists[] = [
                        'id' => (string)$lst['id'],
                        'name' => (string)($lst['name'] ?? $lst['id']),
                        'taskCount' => isset($lst['task_count']) ? (int)$lst['task_count'] : null,
                    ];
                }
            }

            if ($folders !== [] || $folderlessLists !== []) {
                $spaces[] = [
                    'id' => $spaceId,
                    'name' => $spaceName,
                    'folders' => $folders,
                    'lists' => $folderlessLists,
                ];
            }
        }

        @file_put_contents($cacheFile, json_encode(['spaces' => $spaces], JSON_UNESCAPED_UNICODE));
        return ['ok' => true, 'spaces' => $spaces, 'cached' => false];
    }

    // ------------------------------------------------------------------ Webhook management

    function ccrm_clickup_public_webhook_url(\PDO $pdo): ?string {
        $base = function_exists('ccrm_app_base_url') ? ccrm_app_base_url($pdo, false) : '';
        if ($base === '' && function_exists('ccrm_app_base_url')) {
            $base = ccrm_app_base_url($pdo, true);
        }
        $base = rtrim((string)$base, '/');
        if ($base === '' || stripos($base, 'https://') !== 0) {
            return null;
        }
        $host = strtolower((string)(parse_url($base, PHP_URL_HOST) ?? ''));
        if ($host === '' || $host === 'localhost' || $host === '127.0.0.1' || str_ends_with($host, '.local')) {
            return null;
        }
        return $base . '/api/clickup_webhook.php';
    }

    function ccrm_clickup_delete_webhook(\PDO $pdo, array $cfg): array {
        $token = trim((string)($cfg['apiToken'] ?? ''));
        $webhookId = trim((string)($cfg['webhookId'] ?? ''));
        if ($token !== '' && $webhookId !== '') {
            ccrm_clickup_request('DELETE', '/webhook/' . rawurlencode($webhookId), $token);
        }
        $cfg['webhookId'] = null;
        $cfg['webhookSecret'] = '';
        ccrm_clickup_write_config($pdo, $cfg);
        return $cfg;
    }

    function ccrm_clickup_ensure_webhook(\PDO $pdo, array $cfg): array {
        if (empty($cfg['enabled']) || trim((string)$cfg['apiToken']) === '' || trim((string)$cfg['teamId']) === '') {
            if (!empty($cfg['webhookId'])) {
                $cfg = ccrm_clickup_delete_webhook($pdo, $cfg);
            }
            return ['registered' => false, 'reason' => 'not_connected', 'cfg' => $cfg];
        }
        $endpoint = ccrm_clickup_public_webhook_url($pdo);
        if ($endpoint === null) {
            return ['registered' => false, 'reason' => 'local_url', 'cfg' => $cfg];
        }

        $token = trim((string)$cfg['apiToken']);
        $teamId = trim((string)$cfg['teamId']);
        $events = [
            'taskCreated',
            'taskUpdated',
            'taskDeleted',
            'taskStatusUpdated',
            'taskAssigneeUpdated',
            'taskDueDateUpdated',
            'taskMoved',
        ];

        // Check existing webhook in this ClickUp workspace
        $existingRes = ccrm_clickup_request('GET', '/team/' . rawurlencode($teamId) . '/webhook', $token);
        if ($existingRes['ok']) {
            foreach (($existingRes['data']['webhooks'] ?? []) as $wh) {
                if (!is_array($wh)) {
                    continue;
                }
                if ((string)($wh['endpoint'] ?? '') === $endpoint && !empty($wh['id'])) {
                    if (!empty($cfg['webhookId']) && (string)$wh['id'] === (string)$cfg['webhookId'] && !empty($cfg['webhookSecret'])) {
                        return ['registered' => true, 'reason' => 'existing', 'cfg' => $cfg];
                    }
                    // Recreate cleanly if our stored secret is missing so ClickUp returns the signing secret
                    ccrm_clickup_request('DELETE', '/webhook/' . rawurlencode((string)$wh['id']), $token);
                }
            }
        }

        $createRes = ccrm_clickup_request('POST', '/team/' . rawurlencode($teamId) . '/webhook', $token, [
            'endpoint' => $endpoint,
            'events' => $events,
        ]);
        if (!$createRes['ok']) {
            return ['registered' => false, 'reason' => $createRes['error'] ?: 'webhook_failed', 'cfg' => $cfg];
        }
        $wh = is_array($createRes['data']['webhook'] ?? null) ? $createRes['data']['webhook'] : $createRes['data'];
        $whId = trim((string)($wh['id'] ?? $createRes['data']['id'] ?? ''));
        $whSecret = trim((string)($wh['secret'] ?? ''));
        if ($whId !== '' && $whSecret !== '') {
            $cfg['webhookId'] = $whId;
            $cfg['webhookSecret'] = $whSecret;
            ccrm_clickup_write_config($pdo, $cfg);
            return ['registered' => true, 'reason' => 'created', 'cfg' => $cfg];
        }
        return ['registered' => false, 'reason' => 'missing_secret', 'cfg' => $cfg];
    }

    // ------------------------------------------------------------------ Task mapping & sync engine

    function ccrm_clickup_task_id(string $projectId, string $clickupId): string {
        return 'cu-' . substr(sha1($projectId . ':' . $clickupId), 0, 20);
    }

    function ccrm_clickup_map_status(array $cuStatus, array $taskStates): string {
        $rawName = trim((string)($cuStatus['status'] ?? ''));
        $rawType = strtolower(trim((string)($cuStatus['type'] ?? '')));
        foreach ($taskStates as $st) {
            if ($rawName !== '' && strcasecmp((string)$st, $rawName) === 0) {
                return (string)$st;
            }
        }
        if ($rawType === 'closed' || $rawType === 'done') {
            return ccrm_task_done_state($taskStates) ?? 'done';
        }
        $first = $taskStates !== [] ? (string)$taskStates[0] : 'todo';
        if ($rawType === 'open' || (int)($cuStatus['orderindex'] ?? 0) === 0) {
            return $first;
        }
        if (count($taskStates) >= 3) {
            return (string)$taskStates[1];
        }
        return $first;
    }

    function ccrm_clickup_map_priority($cuPriority): string {
        if (!is_array($cuPriority)) {
            return 'medium';
        }
        $pName = strtolower(trim((string)($cuPriority['priority'] ?? '')));
        $pId = (string)($cuPriority['id'] ?? $cuPriority['orderindex'] ?? '');
        if ($pId === '1' || $pId === '2' || $pName === 'urgent' || $pName === 'high') {
            return 'high';
        }
        if ($pId === '4' || $pName === 'low') {
            return 'low';
        }
        return 'medium';
    }

    /** @return array{byEmail: array<string,string>, byName: array<string,?string>} */
    function ccrm_clickup_user_lookup(\PDO $pdo): array {
        $byEmail = [];
        $byName = [];
        $namesByUserId = [];

        foreach ($pdo->query("SELECT `id`, `name`, `email` FROM `users` ORDER BY `id`")->fetchAll(\PDO::FETCH_ASSOC) as $u) {
            $id = (string)$u['id'];
            $name = trim((string)$u['name']);
            $email = strtolower(trim((string)($u['email'] ?? '')));
            if ($name === '') {
                continue;
            }
            $namesByUserId[$id] = $name;
            if ($email !== '' && !isset($byEmail[$email])) {
                $byEmail[$email] = $name;
            }
            $key = mb_strtolower($name);
            $byName[$key] = array_key_exists($key, $byName) ? null : $name;
        }

        try {
            $empRows = $pdo->query("SELECT `user_id`, `email`, `name` FROM `employees` WHERE `email` IS NOT NULL AND `email` <> ''")->fetchAll(\PDO::FETCH_ASSOC);
            foreach ($empRows as $emp) {
                $email = strtolower(trim((string)$emp['email']));
                if ($email === '' || isset($byEmail[$email])) {
                    continue;
                }
                $uid = trim((string)($emp['user_id'] ?? ''));
                if ($uid !== '' && isset($namesByUserId[$uid])) {
                    $byEmail[$email] = $namesByUserId[$uid];
                    continue;
                }
                $eKey = mb_strtolower(trim((string)($emp['name'] ?? '')));
                if ($eKey !== '' && !empty($byName[$eKey])) {
                    $byEmail[$email] = $byName[$eKey];
                }
            }
        } catch (\Throwable $e) {
            // Optional fallback if employees table lacks column
        }

        return ['byEmail' => $byEmail, 'byName' => $byName];
    }

    function ccrm_clickup_resolve_assignees(array $cuAssignees, array $lookup): array {
        $resolved = [];
        foreach ($cuAssignees as $a) {
            if (!is_array($a)) {
                continue;
            }
            $email = strtolower(trim((string)($a['email'] ?? '')));
            $username = mb_strtolower(trim((string)($a['username'] ?? '')));
            $match = null;
            if ($email !== '' && isset($lookup['byEmail'][$email])) {
                $match = $lookup['byEmail'][$email];
            } elseif ($username !== '' && !empty($lookup['byName'][$username])) {
                $match = $lookup['byName'][$username];
            }
            if ($match !== null && !in_array($match, $resolved, true)) {
                $resolved[] = $match;
            }
        }
        return $resolved;
    }

    function ccrm_clickup_ms_to_local_date($ms, ?\DateTimeZone $tz = null): ?string {
        if ($ms === null || $ms === '' || !is_numeric($ms)) {
            return null;
        }
        $sec = (int)floor(((float)$ms) / 1000);
        if ($sec <= 0) {
            return null;
        }
        $tz = $tz ?? new \DateTimeZone(date_default_timezone_get());
        return (new \DateTimeImmutable('@' . $sec))->setTimezone($tz)->format('Y-m-d');
    }

    function ccrm_clickup_ms_to_local_stamp($ms, ?\DateTimeZone $tz = null): ?string {
        if ($ms === null || $ms === '' || !is_numeric($ms)) {
            return null;
        }
        $sec = (int)floor(((float)$ms) / 1000);
        if ($sec <= 0) {
            return null;
        }
        $tz = $tz ?? new \DateTimeZone(date_default_timezone_get());
        return (new \DateTimeImmutable('@' . $sec))->setTimezone($tz)->format('Y-m-d H:i');
    }

    function ccrm_clickup_ms_to_local_time($ms, ?\DateTimeZone $tz = null): ?string {
        if ($ms === null || $ms === '' || !is_numeric($ms)) {
            return null;
        }
        $sec = (int)floor(((float)$ms) / 1000);
        if ($sec <= 0) {
            return null;
        }
        $tz = $tz ?? new \DateTimeZone(date_default_timezone_get());
        return (new \DateTimeImmutable('@' . $sec))->setTimezone($tz)->format('H:i');
    }

    function ccrm_clickup_prune_project_tasks(\PDO $pdo, string $projectId): int {
        $stmt = $pdo->prepare(
            "DELETE FROM `tasks` WHERE `related_project_id` = ? AND `external_source` = 'clickup' AND " . ccrm_sql_real_tasks()
        );
        $stmt->execute([$projectId]);
        return $stmt->rowCount();
    }

    function ccrm_clickup_record_sync_status(\PDO $pdo, array $cfg, ?string $error, bool $touchWhenUnchanged = true): void {
        $nowIso = gmdate('Y-m-d\TH:i:s\Z');
        $prevError = $cfg['lastSyncError'] ?? null;
        if (!$touchWhenUnchanged && $error === $prevError) {
            return;
        }
        $cfg['lastSyncAt'] = $nowIso;
        $cfg['lastSyncError'] = $error !== null ? mb_substr($error, 0, 500) : null;
        ccrm_clickup_write_config($pdo, $cfg);
    }

    function ccrm_clickup_sync_project(\PDO $pdo, string $projectId, bool $touchStatusWhenUnchanged = true): array {
        $projStmt = $pdo->prepare(
            "SELECT `id`, `lead_id`, `client_id`, `completion_deadline`, `clickup_lists_json` FROM `projects` WHERE `id` = ? LIMIT 1"
        );
        $projStmt->execute([$projectId]);
        $project = $projStmt->fetch(\PDO::FETCH_ASSOC);
        if (!$project) {
            return ['ok' => false, 'synced' => 0, 'pruned' => 0, 'error' => 'Project not found.'];
        }

        $lists = ccrm_decode_clickup_lists($project['clickup_lists_json'] ?? null);
        $cfg = ccrm_clickup_load_config($pdo, true);
        if (empty($cfg['enabled']) || trim((string)$cfg['apiToken']) === '' || trim((string)$cfg['teamId']) === '' || $lists === []) {
            $pruned = ccrm_clickup_prune_project_tasks($pdo, $projectId);
            return ['ok' => true, 'synced' => 0, 'pruned' => $pruned, 'error' => null];
        }

        $token = trim((string)$cfg['apiToken']);
        $listNameMap = [];
        $rawTasksByCuId = [];

        foreach ($lists as $listRef) {
            $listId = $listRef['id'];
            $listNameMap[$listId] = $listRef['name'];
            for ($page = 0; $page < 20; $page++) {
                $res = ccrm_clickup_request(
                    'GET',
                    '/list/' . rawurlencode($listId) . '/task?subtasks=true&include_closed=true&page=' . $page,
                    $token
                );
                if (!$res['ok']) {
                    $err = 'ClickUp sync error for list ' . ($listRef['name'] ?: $listId) . ': ' . ($res['error'] ?: 'HTTP ' . $res['status']);
                    ccrm_clickup_record_sync_status($pdo, $cfg, $err);
                    return ['ok' => false, 'synced' => 0, 'pruned' => 0, 'error' => $err];
                }
                $batch = $res['data']['tasks'] ?? [];
                if (!is_array($batch) || $batch === []) {
                    break;
                }
                foreach ($batch as $t) {
                    if (!is_array($t) || empty($t['id'])) {
                        continue;
                    }
                    $cuId = (string)$t['id'];
                    if (!isset($rawTasksByCuId[$cuId])) {
                        $t['_ccrmListId'] = $listId;
                        $t['_ccrmListName'] = (string)($t['list']['name'] ?? $listRef['name'] ?? $listId);
                        $rawTasksByCuId[$cuId] = $t;
                    }
                }
                if (!empty($res['data']['last_page']) || count($batch) < 100) {
                    break;
                }
            }
        }

        // Verify paired lead id exists so the FK `tasks.related_lead_id -> leads.id` never fails.
        $verifiedLeadId = null;
        $candidateLeadId = trim((string)($project['lead_id'] ?: ($project['client_id'] ?? '')));
        if ($candidateLeadId !== '') {
            $chkLead = $pdo->prepare("SELECT `id` FROM `leads` WHERE `id` = ? LIMIT 1");
            $chkLead->execute([$candidateLeadId]);
            $foundLead = $chkLead->fetchColumn();
            if (is_string($foundLead) && $foundLead !== '') {
                $verifiedLeadId = $foundLead;
            }
        }

        $taskStates = ccrm_task_states_setting($pdo);
        $lookup = ccrm_clickup_user_lookup($pdo);
        $tz = new \DateTimeZone(date_default_timezone_get());
        $todayStr = (new \DateTimeImmutable('now', $tz))->format('Y-m-d');
        $projDeadline = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($project['completion_deadline'] ?? ''))
            ? (string)$project['completion_deadline']
            : null;

        // Snapshot existing ClickUp tasks for this project to compute breakdown transitions cleanly
        $existingRows = [];
        $exStmt = $pdo->prepare(
            "SELECT `id`, `status`, `completed_at` FROM `tasks` WHERE `related_project_id` = ? AND `external_source` = 'clickup' AND " . ccrm_sql_real_tasks()
        );
        $exStmt->execute([$projectId]);
        foreach ($exStmt->fetchAll(\PDO::FETCH_ASSOC) as $er) {
            $existingRows[(string)$er['id']] = $er;
        }

        $upsertStmt = $pdo->prepare(
            "/* recurring-template: clickup external task sync */ INSERT INTO `tasks`
             (`id`, `title`, `description`, `priority`, `start_date`, `deadline`, `deadline_time`, `status`, `owner`, `created_by`,
              `related_lead_id`, `related_project_id`, `parent_task_id`, `is_locking`, `archived`, `completed_by`, `completed_at`,
              `estimate_minutes`, `original_deadline`, `external_source`, `external_url`, `external_meta_json`, `task_kind`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ClickUp', ?, ?, ?, 0, 0, ?, ?, ?, ?, 'clickup', ?, ?, NULL)
             ON DUPLICATE KEY UPDATE
              `title` = VALUES(`title`),
              `description` = VALUES(`description`),
              `priority` = VALUES(`priority`),
              `start_date` = VALUES(`start_date`),
              `original_deadline` = IF(VALUES(`deadline`) > `deadline` AND `original_deadline` IS NULL, `deadline`, `original_deadline`),
              `deadline_moves` = `deadline_moves` + IF(VALUES(`deadline`) > `deadline`, 1, 0),
              `deadline` = VALUES(`deadline`),
              `deadline_time` = VALUES(`deadline_time`),
              `status` = VALUES(`status`),
              `owner` = VALUES(`owner`),
              `related_lead_id` = VALUES(`related_lead_id`),
              `related_project_id` = VALUES(`related_project_id`),
              `parent_task_id` = VALUES(`parent_task_id`),
              `archived` = 0,
              `completed_by` = VALUES(`completed_by`),
              `completed_at` = VALUES(`completed_at`),
              `estimate_minutes` = VALUES(`estimate_minutes`),
              `external_source` = 'clickup',
              `external_url` = VALUES(`external_url`),
              `external_meta_json` = VALUES(`external_meta_json`),
              `task_kind` = NULL"
        );
        $delAss = $pdo->prepare("DELETE FROM `task_assignees` WHERE `task_id` = ?");
        $insAss = $pdo->prepare("INSERT IGNORE INTO `task_assignees` (`task_id`, `user_name`) VALUES (?, ?)");
        $delTags = $pdo->prepare("DELETE FROM `task_tags` WHERE `task_id` = ?");
        $insTagDef = $pdo->prepare("INSERT IGNORE INTO `tags` (`id`, `name`) VALUES (?, ?)");
        $insTaskTag = $pdo->prepare("INSERT IGNORE INTO `task_tags` (`task_id`, `tag_name`) VALUES (?, ?)");

        $syncedIds = [];
        $pdo->beginTransaction();
        try {
            foreach ($rawTasksByCuId as $cuId => $cu) {
                $localId = ccrm_clickup_task_id($projectId, $cuId);
                $syncedIds[] = $localId;

                $title = trim((string)($cu['name'] ?? ''));
                if ($title === '') {
                    $title = 'ClickUp task ' . $cuId;
                }
                $title = mb_substr($title, 0, 255);

                $desc = trim((string)($cu['text_content'] ?? $cu['description'] ?? ''));
                $priority = ccrm_clickup_map_priority($cu['priority'] ?? null);
                $startDate = ccrm_clickup_ms_to_local_date($cu['start_date'] ?? null, $tz);
                $dueDate = ccrm_clickup_ms_to_local_date($cu['due_date'] ?? null, $tz);
                $dueInferred = $dueDate === null;
                $deadline = $dueDate ?? $projDeadline ?? ccrm_clickup_ms_to_local_date($cu['date_created'] ?? null, $tz) ?? $todayStr;
                $deadlineTime = ($dueDate !== null && !empty($cu['due_date_time']))
                    ? ccrm_clickup_ms_to_local_time($cu['due_date'] ?? null, $tz)
                    : null;

                $cuStatus = is_array($cu['status'] ?? null) ? $cu['status'] : [];
                $status = ccrm_clickup_map_status($cuStatus, $taskStates);
                $isDone = ccrm_task_status_is_done($status, $taskStates);

                $assignees = ccrm_clickup_resolve_assignees(is_array($cu['assignees'] ?? null) ? $cu['assignees'] : [], $lookup);
                $owner = $assignees[0] ?? '';

                $completedAt = null;
                $completedBy = null;
                if ($isDone) {
                    $completedAt = ccrm_clickup_ms_to_local_stamp($cu['date_closed'] ?? null, $tz)
                        ?? (!empty($existingRows[$localId]['completed_at']) ? (string)$existingRows[$localId]['completed_at'] : (new \DateTimeImmutable('now', $tz))->format('Y-m-d H:i'));
                    $completedBy = $owner !== '' ? $owner : 'ClickUp';
                }

                $estimateMinutes = (isset($cu['time_estimate']) && is_numeric($cu['time_estimate']) && (float)$cu['time_estimate'] > 0)
                    ? max(1, (int)round(((float)$cu['time_estimate']) / 60000))
                    : null;

                $parentCuId = (!empty($cu['parent']) && is_string($cu['parent']) && isset($rawTasksByCuId[$cu['parent']]))
                    ? (string)$cu['parent']
                    : null;
                $parentLocalId = $parentCuId !== null ? ccrm_clickup_task_id($projectId, $parentCuId) : null;

                $extUrl = is_string($cu['url'] ?? null) && preg_match('#^https?://#i', $cu['url'])
                    ? mb_substr($cu['url'], 0, 255)
                    : ('https://app.clickup.com/t/' . $cuId);

                $metaJson = json_encode([
                    'clickupId' => $cuId,
                    'listId' => (string)($cu['_ccrmListId'] ?? ''),
                    'listName' => (string)($cu['_ccrmListName'] ?? ''),
                    'statusName' => trim((string)($cuStatus['status'] ?? '')),
                    'statusColor' => trim((string)($cuStatus['color'] ?? '')),
                    'due_inferred' => $dueInferred,
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

                $upsertStmt->execute([
                    $localId,
                    $title,
                    $desc,
                    $priority,
                    $startDate,
                    $deadline,
                    $deadlineTime,
                    $status,
                    $owner,
                    $verifiedLeadId,
                    $projectId,
                    $parentLocalId,
                    $completedBy,
                    $completedAt,
                    $estimateMinutes,
                    $deadline,
                    $extUrl,
                    $metaJson,
                ]);

                $oldRow = $existingRows[$localId] ?? null;
                $oldStatus = $oldRow ? (string)($oldRow['status'] ?? '') : null;
                $wasClosed = $oldRow !== null && (ccrm_task_status_is_done($oldStatus, $taskStates) || !empty($oldRow['completed_at']));
                ccrm_stamp_task_breakdown_transition($pdo, $localId, $status, $oldStatus, $isDone, $wasClosed, $taskStates, 'ClickUp');

                $delAss->execute([$localId]);
                foreach ($assignees as $uName) {
                    $insAss->execute([$localId, $uName]);
                }

                $delTags->execute([$localId]);
                if (is_array($cu['tags'] ?? null)) {
                    foreach ($cu['tags'] as $tg) {
                        $tName = is_array($tg) ? ltrim(trim((string)($tg['name'] ?? '')), '#') : '';
                        if ($tName === '') {
                            continue;
                        }
                        $tId = 'tag-' . substr(md5(strtolower($tName)), 0, 16);
                        $insTagDef->execute([$tId, $tName]);
                        $insTaskTag->execute([$localId, $tName]);
                    }
                }
            }

            $pruned = 0;
            if ($syncedIds === []) {
                $pruned = ccrm_clickup_prune_project_tasks($pdo, $projectId);
            } else {
                $staleIds = array_values(array_diff(array_keys($existingRows), $syncedIds));
                if ($staleIds !== []) {
                    $placeholders = implode(',', array_fill(0, count($staleIds), '?'));
                    $delStale = $pdo->prepare(
                        "DELETE FROM `tasks` WHERE `related_project_id` = ? AND `external_source` = 'clickup' AND " . ccrm_sql_real_tasks() . " AND `id` IN ({$placeholders})"
                    );
                    $delStale->execute(array_merge([$projectId], $staleIds));
                    $pruned = $delStale->rowCount();
                }
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            $err = 'Failed writing ClickUp tasks: ' . $e->getMessage();
            ccrm_clickup_record_sync_status($pdo, $cfg, $err);
            return ['ok' => false, 'synced' => 0, 'pruned' => 0, 'error' => $err];
        }

        ccrm_clickup_record_sync_status($pdo, $cfg, null, $touchStatusWhenUnchanged || $pruned > 0);
        return ['ok' => true, 'synced' => count($syncedIds), 'pruned' => $pruned, 'error' => null];
    }

    function ccrm_clickup_status_counts(\PDO $pdo): array {
        $linkedProjects = 0;
        $syncedTasks = 0;
        try {
            $linkedProjects = (int)$pdo->query(
                "SELECT COUNT(*) FROM `projects`
                  WHERE `clickup_lists_json` IS NOT NULL
                    AND `clickup_lists_json` <> ''
                    AND `clickup_lists_json` <> '[]'"
            )->fetchColumn();
        } catch (\Throwable $e) {}
        try {
            $syncedTasks = (int)$pdo->query(
                "SELECT COUNT(*) FROM `tasks` WHERE `external_source` = 'clickup' AND " . ccrm_sql_real_tasks()
            )->fetchColumn();
        } catch (\Throwable $e) {}
        return ['linkedProjectsCount' => $linkedProjects, 'syncedTasksCount' => $syncedTasks];
    }

    /** Resolves which CCRM project IDs should re-sync for a verified ClickUp webhook payload. */
    function ccrm_clickup_projects_for_webhook(\PDO $pdo, array $cfg, array $payload): array {
        $listIds = [];
        $pushListId = static function ($v) use (&$listIds): void {
            if (is_string($v) || is_int($v)) {
                $s = trim((string)$v);
                if ($s !== '' && strlen($s) <= 64 && !in_array($s, $listIds, true)) {
                    $listIds[] = $s;
                }
            }
        };
        if (!empty($payload['list_id'])) {
            $pushListId($payload['list_id']);
        }
        if (is_array($payload['history_items'] ?? null)) {
            foreach ($payload['history_items'] as $hi) {
                if (!is_array($hi)) {
                    continue;
                }
                if (($hi['parent_id'] ?? null) && (string)($hi['parent_type'] ?? '') === '6') {
                    $pushListId($hi['parent_id']);
                }
                if (is_array($hi['before'] ?? null) && !empty($hi['before']['id']) && ($hi['field'] ?? '') === 'list') {
                    $pushListId($hi['before']['id']);
                }
                if (is_array($hi['after'] ?? null) && !empty($hi['after']['id']) && ($hi['field'] ?? '') === 'list') {
                    $pushListId($hi['after']['id']);
                }
            }
        }

        $taskCuId = (!empty($payload['task_id']) && is_string($payload['task_id'])) ? trim($payload['task_id']) : '';
        if ($listIds === [] && $taskCuId !== '' && trim((string)($cfg['apiToken'] ?? '')) !== '') {
            $taskRes = ccrm_clickup_request('GET', '/task/' . rawurlencode($taskCuId), (string)$cfg['apiToken']);
            if ($taskRes['ok'] && !empty($taskRes['data']['list']['id'])) {
                $pushListId($taskRes['data']['list']['id']);
            }
        }

        $matchedProjects = [];
        $rows = $pdo->query(
            "SELECT `id`, `clickup_lists_json` FROM `projects`
              WHERE IFNULL(`archived`, 0) = 0
                AND `clickup_lists_json` IS NOT NULL
                AND `clickup_lists_json` <> ''
                AND `clickup_lists_json` <> '[]'"
        )->fetchAll(\PDO::FETCH_ASSOC) ?: [];

        foreach ($rows as $row) {
            $pid = (string)$row['id'];
            $projLists = ccrm_decode_clickup_lists($row['clickup_lists_json'] ?? null);
            foreach ($projLists as $pl) {
                if (in_array($pl['id'], $listIds, true)) {
                    $matchedProjects[$pid] = true;
                    break;
                }
            }
        }

        if ($taskCuId !== '') {
            $stmt = $pdo->prepare(
                "SELECT DISTINCT `related_project_id` FROM `tasks`
                  WHERE `external_source` = 'clickup'
                    AND `related_project_id` IS NOT NULL
                    AND " . ccrm_sql_real_tasks() . "
                    AND `external_meta_json` LIKE ?"
            );
            $stmt->execute(['%"clickupId":"' . addcslashes($taskCuId, '%_\\') . '"%']);
            foreach ($stmt->fetchAll(\PDO::FETCH_COLUMN) as $pid) {
                if (is_string($pid) && $pid !== '') {
                    $matchedProjects[$pid] = true;
                }
            }
        }

        return array_keys($matchedProjects);
    }

    function ccrm_clickup_sync_all_projects(\PDO $pdo, bool $touchStatusWhenUnchanged = true): array {
        $cfg = ccrm_clickup_load_config($pdo, true);
        if (empty($cfg['enabled']) || trim((string)$cfg['apiToken']) === '' || trim((string)$cfg['teamId']) === '') {
            return ['ok' => false, 'projects' => 0, 'synced' => 0, 'pruned' => 0, 'errors' => ['ClickUp is not connected.']];
        }
        $rows = $pdo->query(
            "SELECT `id` FROM `projects`
              WHERE IFNULL(`archived`, 0) = 0
                AND `clickup_lists_json` IS NOT NULL
                AND `clickup_lists_json` <> ''
                AND `clickup_lists_json` <> '[]'"
        )->fetchAll(\PDO::FETCH_COLUMN) ?: [];

        $projects = 0;
        $synced = 0;
        $pruned = 0;
        $errors = [];
        foreach ($rows as $pid) {
            $res = ccrm_clickup_sync_project($pdo, (string)$pid, $touchStatusWhenUnchanged);
            $projects++;
            $synced += (int)($res['synced'] ?? 0);
            $pruned += (int)($res['pruned'] ?? 0);
            if (!empty($res['error'])) {
                $errors[] = (string)$pid . ': ' . $res['error'];
            }
        }
        return ['ok' => $errors === [], 'projects' => $projects, 'synced' => $synced, 'pruned' => $pruned, 'errors' => $errors];
    }

    function ccrm_clickup_cron_tick(\PDO $pdo): array {
        if (!ccrm_table_exists($pdo, 'projects') || !ccrm_column_exists($pdo, 'projects', 'clickup_lists_json')) {
            return ['ran' => false, 'reason' => 'schema_not_ready'];
        }
        if (!ccrm_clickup_is_connected($pdo)) {
            return ['ran' => false, 'reason' => 'not_connected'];
        }
        $stampFile = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'ccrm-clickup-cron-' . md5(__DIR__) . '.stamp';
        $fh = @fopen($stampFile, 'c+');
        if (!$fh || !flock($fh, LOCK_EX | LOCK_NB)) {
            if ($fh) {
                fclose($fh);
            }
            return ['ran' => false, 'reason' => 'locked'];
        }
        try {
            $last = (int)stream_get_contents($fh);
            if ($last > 0 && (time() - $last) < CCRM_CLICKUP_CRON_THROTTLE) {
                return ['ran' => false, 'reason' => 'throttled'];
            }
            ftruncate($fh, 0);
            rewind($fh);
            fwrite($fh, (string)time());
            fflush($fh);
            $res = ccrm_clickup_sync_all_projects($pdo, false);
            return array_merge(['ran' => true], $res);
        } finally {
            flock($fh, LOCK_UN);
            fclose($fh);
        }
    }
}
