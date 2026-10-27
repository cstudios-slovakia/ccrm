<?php
/**
 * Chrome time tracker (phase 5): pairing, device keys, the extension timer
 * and activity capture.
 *
 * The timer is a row in `time_entries` — the same running_guard as the web
 * app, never a second table. Activity rows store a domain, a page title and
 * times. A full URL path is not stored.
 *
 * Keep the numbers aligned with src/utils/timeTrackerRules.ts:
 * pairing TTL 10 minutes, offline window 24 hours, merge gap 60 seconds,
 * minimum block 5 minutes.
 */

require_once __DIR__ . '/time_entries_lib.php';
require_once __DIR__ . '/read_scope.php';

const CCRM_TT_EXT_VERSION = '1.0.0';
const CCRM_TTX_PAIR_TTL = 600;
const CCRM_TTX_OFFLINE_MS = 86400000;
const CCRM_TTX_MERGE_GAP_MS = 60000;
const CCRM_TTX_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function ccrm_ttx_host(string $input): ?string {
    $raw = trim($input);
    if ($raw === '' || strlen($raw) > 2000) {
        return null;
    }
    if (preg_match('#^[a-z][a-z0-9+.-]*://#i', $raw)) {
        $parts = parse_url($raw);
        if (!is_array($parts) || empty($parts['host'])) {
            return null;
        }
        $raw = (string)$parts['host'];
    }
    $cut = preg_split('#[/?#\s]#', $raw, 2);
    $raw = $cut[0] ?? '';
    $at = strrpos($raw, '@');
    if ($at !== false) {
        $raw = substr($raw, $at + 1);
    }
    $raw = preg_replace('/:\d+$/', '', $raw) ?? '';
    $raw = strtolower(rtrim($raw, '.'));
    if (str_starts_with($raw, 'www.')) {
        $raw = substr($raw, 4);
    }
    if (!preg_match('/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/', $raw)) {
        return null;
    }
    return $raw;
}

function ccrm_ttx_pattern(string $raw): ?string {
    $body = strtolower(trim($raw));
    $wild = str_starts_with($body, '*.');
    if ($wild) {
        $body = substr($body, 2);
    }
    $host = ccrm_ttx_host($body);
    if ($host === null) {
        return null;
    }
    return $wild ? ('*.' . $host) : $host;
}

function ccrm_ttx_site_matches(string $host, string $pattern): bool {
    $left = ccrm_ttx_host($host);
    $body = strtolower(trim($pattern));
    if (str_starts_with($body, '*.')) {
        $body = substr($body, 2);
    }
    $domain = ccrm_ttx_host($body);
    if ($left === null || $domain === null) {
        return false;
    }
    return $left === $domain || str_ends_with($left, '.' . $domain);
}

function ccrm_ttx_code_material(string $raw): ?string {
    $compact = strtoupper(preg_replace('/[^A-Z0-9]/', '', $raw) ?? '');
    if (strlen($compact) !== 8) {
        return null;
    }
    for ($i = 0; $i < 8; $i++) {
        if (!str_contains(CCRM_TTX_ALPHABET, $compact[$i])) {
            return null;
        }
    }
    return $compact;
}

function ccrm_ttx_ms($iso): ?int {
    if (!is_string($iso) || trim($iso) === '') {
        return null;
    }
    try {
        $dt = new \DateTimeImmutable($iso);
    } catch (\Throwable $e) {
        return null;
    }
    return ((int)$dt->format('U')) * 1000 + (int)$dt->format('v');
}

function ccrm_ttx_ms_utc(int $ms): string {
    return gmdate('Y-m-d H:i:s', intdiv($ms, 1000));
}

function ccrm_ttx_iso_utc(?string $utc): ?string {
    return ccrm_tt_iso($utc);
}

/** @return array{ok: bool, code?: string, ms?: int|null} */
function ccrm_ttx_client_instant($iso, int $nowMs): array {
    if ($iso === null || (is_string($iso) && trim($iso) === '')) {
        return ['ok' => true, 'ms' => null];
    }
    if (!is_string($iso)) {
        return ['ok' => false, 'code' => 'bad_timestamp'];
    }
    $ms = ccrm_ttx_ms($iso);
    if ($ms === null) {
        return ['ok' => false, 'code' => 'bad_timestamp'];
    }
    if ($ms > $nowMs || ($nowMs - $ms) > CCRM_TTX_OFFLINE_MS) {
        return ['ok' => false, 'code' => 'timestamp_out_of_window'];
    }
    return ['ok' => true, 'ms' => $ms];
}

function ccrm_ttx_now_ms(): int {
    return (int)floor(microtime(true) * 1000);
}

function ccrm_ttx_public_url(): string {
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $host = (string)($_SERVER['HTTP_HOST'] ?? '');
    return ($https ? 'https' : 'http') . '://' . $host;
}

function ccrm_ttx_user(\PDO $pdo, string $userId): ?array {
    $stmt = $pdo->prepare("SELECT `id`, `name`, `email`, `role` FROM `users` WHERE `id` = ? LIMIT 1");
    $stmt->execute([$userId]);
    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
    return $row ?: null;
}

function ccrm_ttx_extension_on(array $settings): bool {
    return !empty($settings['extension']['enabled']);
}

function ccrm_ttx_capture_allowed(array $settings): bool {
    return !isset($settings['extension']['activityCaptureAllowed']) || !empty($settings['extension']['activityCaptureAllowed']);
}

function ccrm_ttx_rules_key(string $userId): string {
    $key = 'TIME_TRACKING_ACTIVITY_RULES:' . $userId;
    if (strlen($key) <= 100) {
        return $key;
    }
    return 'TT_ACTIVITY:' . hash('sha256', $userId);
}

function ccrm_ttx_default_rules(): array {
    return ['enabled' => false, 'minMinutes' => 5, 'sites' => []];
}

function ccrm_ttx_load_rules(\PDO $pdo, string $userId): array {
    $base = ccrm_ttx_default_rules();
    try {
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = ? LIMIT 1");
        $stmt->execute([ccrm_ttx_rules_key($userId)]);
        $raw = $stmt->fetchColumn();
    } catch (\Throwable $e) {
        return $base;
    }
    if (!is_string($raw) || $raw === '') {
        return $base;
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return $base;
    }
    return ccrm_ttx_sanitize_rules($decoded, $base);
}

function ccrm_ttx_sanitize_rules(array $in, array $base): array {
    $out = $base;
    if (array_key_exists('enabled', $in)) {
        $out['enabled'] = (bool)$in['enabled'];
    }
    if (isset($in['minMinutes'])) {
        $minutes = (int)$in['minMinutes'];
        $out['minMinutes'] = max(1, min(120, $minutes > 0 ? $minutes : (int)$base['minMinutes']));
    }
    if (isset($in['sites']) && is_array($in['sites'])) {
        $sites = [];
        foreach ($in['sites'] as $site) {
            if (!is_array($site) || count($sites) >= 40) {
                continue;
            }
            $pattern = ccrm_ttx_pattern((string)($site['pattern'] ?? ''));
            if ($pattern === null) {
                continue;
            }
            $projectId = ccrm_tt_nullable_id($site['projectId'] ?? null);
            $sites[] = ['pattern' => $pattern, 'projectId' => $projectId];
        }
        $out['sites'] = $sites;
    }
    return $out;
}

function ccrm_ttx_save_rules(\PDO $pdo, string $userId, array $rules): array {
    $clean = ccrm_ttx_sanitize_rules($rules, ccrm_ttx_load_rules($pdo, $userId));
    $stmt = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
    $stmt->execute([ccrm_ttx_rules_key($userId), json_encode($clean, JSON_UNESCAPED_UNICODE)]);
    return $clean;
}

function ccrm_ttx_rules_payload(array $rules, array $settings): array {
    return [
        'enabled' => (bool)$rules['enabled'],
        'companyAllows' => ccrm_ttx_capture_allowed($settings),
        'extensionEnabled' => ccrm_ttx_extension_on($settings),
        'minMinutes' => (int)$rules['minMinutes'],
        'sites' => $rules['sites'],
    ];
}

function ccrm_ttx_suggest(array $rules, string $domain): ?string {
    foreach ($rules['sites'] as $site) {
        if (ccrm_ttx_site_matches($domain, (string)$site['pattern'])) {
            return $site['projectId'] ?? null;
        }
    }
    return null;
}

/** @return array{ok: bool, code?: string, display?: string, expiresAt?: string} */
function ccrm_ttx_issue_code(\PDO $pdo, string $userId): array {
    $chars = '';
    $alphabet = CCRM_TTX_ALPHABET;
    $max = strlen($alphabet) - 1;
    for ($i = 0; $i < 8; $i++) {
        $chars .= $alphabet[random_int(0, $max)];
    }
    $hash = hash('sha256', $chars);
    $expires = gmdate('Y-m-d H:i:s', time() + CCRM_TTX_PAIR_TTL);
    $pdo->beginTransaction();
    try {
        $pdo->prepare("UPDATE `time_tracker_pairing_codes` SET `used_at` = UTC_TIMESTAMP() WHERE `user_id` = ? AND `used_at` IS NULL")->execute([$userId]);
        $pdo->prepare("INSERT INTO `time_tracker_pairing_codes` (`code_hash`, `user_id`, `expires_at`, `created_at`) VALUES (?, ?, ?, UTC_TIMESTAMP())")->execute([$hash, $userId, $expires]);
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
    return [
        'ok' => true,
        'code' => substr($chars, 0, 4) . '-' . substr($chars, 4),
        'expiresAt' => ccrm_tt_iso($expires),
    ];
}

/**
 * Consume a code and insert a device. The plaintext key is returned once.
 *
 * @return array{ok: bool, code?: string, status?: int, deviceKey?: string, deviceId?: string, user?: array}
 */
function ccrm_ttx_pair(\PDO $pdo, string $rawCode, array $meta): array {
    $material = ccrm_ttx_code_material($rawCode);
    if ($material === null) {
        return ['ok' => false, 'code' => 'code_invalid', 'status' => 401];
    }
    $hash = hash('sha256', $material);
    $token = 'ttk_' . bin2hex(random_bytes(32));
    $keyHash = hash('sha256', $token);
    $deviceId = 'ttd-' . bin2hex(random_bytes(8));
    $name = trim((string)($meta['deviceName'] ?? ''));
    if ($name === '') {
        $name = 'Chrome';
    }
    $name = mb_substr($name, 0, 120);
    $browser = mb_substr(trim((string)($meta['browser'] ?? 'Chrome')), 0, 80);
    $os = mb_substr(trim((string)($meta['os'] ?? '')), 0, 80);
    $version = (string)($meta['version'] ?? '');
    if (!preg_match('/^\d+\.\d+\.\d+/', $version)) {
        $version = '';
    }
    $version = mb_substr($version, 0, 32);

    $pdo->beginTransaction();
    try {
        $sel = $pdo->prepare("SELECT `user_id`, `expires_at`, `used_at` FROM `time_tracker_pairing_codes` WHERE `code_hash` = ? FOR UPDATE");
        $sel->execute([$hash]);
        $row = $sel->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            $pdo->rollBack();
            return ['ok' => false, 'code' => 'code_invalid', 'status' => 401];
        }
        if ($row['used_at'] !== null) {
            $pdo->rollBack();
            return ['ok' => false, 'code' => 'code_used', 'status' => 401];
        }
        if (strtotime($row['expires_at'] . ' UTC') <= time()) {
            $pdo->rollBack();
            return ['ok' => false, 'code' => 'code_expired', 'status' => 401];
        }
        $owner = ccrm_ttx_user($pdo, (string)$row['user_id']);
        if (!$owner || !ccrm_can(ccrm_read_scope($pdo, $owner), 'time_tracking', 'edit')) {
            $pdo->rollBack();
            return ['ok' => false, 'code' => 'forbidden', 'status' => 403];
        }
        $pdo->prepare("UPDATE `time_tracker_pairing_codes` SET `used_at` = UTC_TIMESTAMP() WHERE `code_hash` = ?")->execute([$hash]);
        $pdo->prepare(
            "INSERT INTO `time_tracker_devices` (`id`, `user_id`, `key_hash`, `key_prefix`, `name`, `browser`, `os`, `extension_version`, `created_at`, `last_used_at`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())"
        )->execute([
            $deviceId,
            $row['user_id'],
            $keyHash,
            substr($token, 0, 12),
            $name,
            $browser !== '' ? $browser : null,
            $os !== '' ? $os : null,
            $version !== '' ? $version : null,
        ]);
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
    $user = ccrm_ttx_user($pdo, (string)$row['user_id']);
    return [
        'ok' => true,
        'deviceKey' => $token,
        'deviceId' => $deviceId,
        'userId' => (string)$row['user_id'],
        'user' => ['id' => (string)$row['user_id'], 'name' => (string)($user['name'] ?? '')],
    ];
}

/** Active device or null (missing and revoked are the same: not paired). */
function ccrm_ttx_device_by_key(\PDO $pdo, string $token): ?array {
    if (!preg_match('/^ttk_[a-f0-9]{64}$/', $token)) {
        return null;
    }
    $stmt = $pdo->prepare("SELECT * FROM `time_tracker_devices` WHERE `key_hash` = ? LIMIT 1");
    $stmt->execute([hash('sha256', $token)]);
    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$row || $row['revoked_at'] !== null) {
        return null;
    }
    return $row;
}

function ccrm_ttx_touch(\PDO $pdo, string $deviceId, ?string $version): void {
    $version = is_string($version) && preg_match('/^\d+\.\d+\.\d+/', $version) ? mb_substr($version, 0, 32) : null;
    $pdo->prepare("UPDATE `time_tracker_devices` SET `last_used_at` = UTC_TIMESTAMP(), `extension_version` = COALESCE(?, `extension_version`) WHERE `id` = ? AND `revoked_at` IS NULL")
        ->execute([$version, $deviceId]);
}

function ccrm_ttx_device_json(array $row): array {
    $last = $row['last_used_at'] ? strtotime($row['last_used_at'] . ' UTC') : 0;
    $version = (string)($row['extension_version'] ?? '');
    return [
        'id' => $row['id'],
        'name' => $row['name'],
        'browser' => $row['browser'],
        'os' => $row['os'],
        'extensionVersion' => $version !== '' ? $version : null,
        'createdAt' => ccrm_tt_iso($row['created_at']),
        'lastUsedAt' => ccrm_tt_iso($row['last_used_at']),
        'state' => ($last && (time() - $last) < 180) ? 'active' : 'idle',
        'updateAvailable' => $version === '' || version_compare($version, CCRM_TT_EXT_VERSION, '<'),
    ];
}

function ccrm_ttx_list_devices(\PDO $pdo, string $userId): array {
    $stmt = $pdo->prepare("SELECT * FROM `time_tracker_devices` WHERE `user_id` = ? AND `revoked_at` IS NULL ORDER BY `created_at` DESC");
    $stmt->execute([$userId]);
    $out = [];
    foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
        $out[] = ccrm_ttx_device_json($row);
    }
    return $out;
}

function ccrm_ttx_revoke(\PDO $pdo, string $userId, string $deviceId): bool {
    $stmt = $pdo->prepare("UPDATE `time_tracker_devices` SET `revoked_at` = UTC_TIMESTAMP() WHERE `id` = ? AND `user_id` = ? AND `revoked_at` IS NULL");
    $stmt->execute([$deviceId, $userId]);
    return $stmt->rowCount() > 0;
}

function ccrm_ttx_running(\PDO $pdo, string $userId, bool $lock = false): ?array {
    $sql = "SELECT * FROM `time_entries` WHERE `user_id` = ? AND `start_at` IS NOT NULL AND `end_at` IS NULL AND `deleted_at` IS NULL LIMIT 1";
    if ($lock) {
        $sql .= ' FOR UPDATE';
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$userId]);
    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
    return $row ?: null;
}

function ccrm_ttx_viewer(array $scope, string $userId): array {
    return ['userId' => $userId, 'canCosts' => ccrm_can($scope, 'time_tracking_costs')];
}

function ccrm_ttx_entry(\PDO $pdo, string $id, array $viewer): ?array {
    $row = ccrm_tt_fetch_entry($pdo, $id);
    return $row ? ccrm_tt_entry_json($row, $viewer) : null;
}

function ccrm_ttx_check_links(\PDO $pdo, array $scope, array $links, ?string $explicitProject): ?string {
    if ($links['task_id'] !== null && !isset(ccrm_visible_task_ids($pdo, $scope, [$links['task_id']])[$links['task_id']])) {
        return 'task_not_found';
    }
    if ($links['task_id'] === null && $links['ticket_id'] !== null && !ccrm_can($scope, 'tickets')) {
        return 'forbidden_ticket';
    }
    if ($explicitProject !== null && $explicitProject !== ($links['derivedProject'] ?? null) && !ccrm_can($scope, 'projects')) {
        return 'forbidden_project';
    }
    return null;
}

function ccrm_ttx_origin(array $links): ?string {
    if ($links['task_id'] !== null) {
        return 'task';
    }
    if ($links['ticket_id'] !== null) {
        return 'ticket';
    }
    if ($links['project_id'] !== null) {
        return 'project';
    }
    return null;
}

/**
 * Stop the user's running entry and start another, in one transaction.
 * Same rule as time_entries.php action=start.
 *
 * @return array{ok: bool, code?: string, status?: int, entry?: array|null, stopped?: array|null}
 */
function ccrm_ttx_start(\PDO $pdo, array $user, array $device, array $body, array $settings, array $scope): array {
    $userId = (string)$user['id'];
    if (!ccrm_can($scope, 'time_tracking', 'edit')) {
        return ['ok' => false, 'code' => 'forbidden', 'status' => 403];
    }
    $nowMs = ccrm_ttx_now_ms();
    $when = ccrm_ttx_client_instant($body['startedAt'] ?? null, $nowMs);
    if (!$when['ok']) {
        return ['ok' => false, 'code' => $when['code'], 'status' => 422];
    }
    $startUtc = $when['ms'] === null ? ccrm_tt_now_utc() : ccrm_ttx_ms_utc($when['ms']);
    $explicit = ccrm_tt_nullable_id($body['projectId'] ?? null);
    $links = ccrm_tt_resolve_links($pdo, $body);
    if (!$links['ok']) {
        return ['ok' => false, 'code' => $links['code'], 'status' => 422];
    }
    if ($denied = ccrm_ttx_check_links($pdo, $scope, $links, $explicit)) {
        return ['ok' => false, 'code' => $denied, 'status' => $denied === 'task_not_found' ? 422 : 403];
    }
    $billable = array_key_exists('billable', $body) ? (int)(bool)$body['billable'] : (int)$settings['billableByDefault'];
    $employee = ccrm_tt_employee_for_user($pdo, $userId);
    $newId = ccrm_tt_new_id();
    $viewer = ccrm_ttx_viewer($scope, $userId);

    $previous = ccrm_ttx_running($pdo, $userId);
    if ($previous) {
        ccrm_tt_price($pdo, $userId, $previous['entry_date'], null, $settings, true);
    }

    try {
        $pdo->beginTransaction();
        $stopped = null;
        $old = ccrm_ttx_running($pdo, $userId, true);
        if ($old) {
            $endUtc = max($startUtc, $old['start_at']);
            $dur = ccrm_tt_seconds_between($old['start_at'], $endUtc);
            $price = ccrm_tt_price($pdo, $userId, $old['entry_date'], $dur, $settings, false);
            $stoppedRate = $old['billable_rate'] !== null ? $old['billable_rate'] : ccrm_tt_lookup_billable_rate($pdo, $old['project_id'], $old['ticket_id'], (string)$old['entry_date']);
            $pdo->prepare("UPDATE `time_entries` SET `end_at` = ?, `duration_sec` = ?, `employee_id` = ?, `billable_rate` = ?, `cost_rate` = ?, `cost_rate_source` = ?, `cost_rate_basis_days` = ?, `cost` = ? WHERE `id` = ?")
                ->execute([$endUtc, $dur, $price['employee_id'], $stoppedRate, $price['cost_rate'], $price['cost_rate_source'], $price['cost_rate_basis_days'], $price['cost'], $old['id']]);
            $stopped = $old['id'];
        }
        $pdo->prepare(
            "INSERT INTO `time_entries` (`id`, `user_id`, `recorded_by_user_id`, `employee_id`, `project_id`, `task_id`, `ticket_id`, `description`, `title_snapshot`, `entry_date`, `start_at`, `billable`, `tags`, `source`, `origin_type`, `origin_id`, `device_id`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'extension', ?, ?, ?)"
        )->execute([
            $newId, $userId, $userId, $employee['id'] ?? null, $links['project_id'], $links['task_id'], $links['ticket_id'],
            $links['description'], $links['title_snapshot'], ccrm_tt_local_date($startUtc), $startUtc, $billable,
            json_encode(ccrm_tt_clean_tags($body['tags'] ?? []), JSON_UNESCAPED_UNICODE),
            ccrm_ttx_origin($links), ccrm_tt_nullable_id($body['originId'] ?? null) ?? ($links['task_id'] ?? $links['ticket_id'] ?? $links['project_id']),
            $device['id'],
        ]);
        $pdo->commit();
    } catch (\PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ((int)($e->errorInfo[1] ?? 0) === 1062) {
            $row = ccrm_ttx_running($pdo, $userId);
            return ['ok' => false, 'code' => 'already_running', 'status' => 409, 'entry' => $row ? ccrm_ttx_entry($pdo, $row['id'], $viewer) : null];
        }
        throw $e;
    }
    return [
        'ok' => true,
        'entry' => ccrm_ttx_entry($pdo, $newId, $viewer),
        'stopped' => $stopped ? ccrm_ttx_entry($pdo, $stopped, $viewer) : null,
    ];
}

/** @return array{ok: bool, code?: string, status?: int, entry?: array|null} */
function ccrm_ttx_stop(\PDO $pdo, array $user, array $device, array $body, array $settings, array $scope): array {
    $userId = (string)$user['id'];
    if (!ccrm_can($scope, 'time_tracking', 'edit')) {
        return ['ok' => false, 'code' => 'forbidden', 'status' => 403];
    }
    $viewer = ccrm_ttx_viewer($scope, $userId);
    $id = ccrm_tt_nullable_id($body['id'] ?? null);
    if ($id !== null) {
        $stmt = $pdo->prepare("SELECT * FROM `time_entries` WHERE `id` = ? AND `deleted_at` IS NULL LIMIT 1");
        $stmt->execute([$id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: null;
    } else {
        $row = ccrm_ttx_running($pdo, $userId);
    }
    if (!$row || $row['start_at'] === null || (string)$row['user_id'] !== $userId) {
        return ['ok' => false, 'code' => 'not_found', 'status' => 404];
    }
    if ($row['end_at'] !== null) {
        return ['ok' => true, 'entry' => ccrm_ttx_entry($pdo, $row['id'], $viewer)];
    }

    $projectId = $row['project_id'];
    if (!empty($body['projectId'])) {
        $explicit = ccrm_tt_nullable_id($body['projectId']);
        $links = ccrm_tt_resolve_links($pdo, [
            'taskId' => $body['taskId'] ?? $row['task_id'],
            'ticketId' => $row['ticket_id'],
            'projectId' => $explicit,
            'description' => $row['description'],
        ]);
        if (!$links['ok']) {
            return ['ok' => false, 'code' => $links['code'], 'status' => 422];
        }
        if ($denied = ccrm_ttx_check_links($pdo, $scope, $links, $explicit)) {
            return ['ok' => false, 'code' => $denied, 'status' => 403];
        }
        $projectId = $links['project_id'];
    }
    if ($settings['requireProjectToStop'] && $projectId === null && ccrm_can($scope, 'projects')) {
        return ['ok' => false, 'code' => 'project_required', 'status' => 422];
    }
    if ($settings['requireTask'] && $row['task_id'] === null && $row['ticket_id'] === null) {
        return ['ok' => false, 'code' => 'task_required', 'status' => 422];
    }

    $nowMs = ccrm_ttx_now_ms();
    $when = ccrm_ttx_client_instant($body['stoppedAt'] ?? null, $nowMs);
    if (!$when['ok']) {
        return ['ok' => false, 'code' => $when['code'], 'status' => 422];
    }
    if ($when['ms'] === null) {
        $endUtc = ccrm_tt_now_utc();
    } else {
        $startMs = strtotime($row['start_at'] . ' UTC') * 1000;
        if ($when['ms'] < $startMs) {
            return ['ok' => false, 'code' => 'end_before_start', 'status' => 422];
        }
        $endUtc = ccrm_ttx_ms_utc($when['ms']);
    }
    $dur = ccrm_tt_seconds_between($row['start_at'], $endUtc);
    $price = ccrm_tt_price($pdo, $userId, $row['entry_date'], $dur, $settings, true);
    $stoppedRate = $row['billable_rate'] !== null ? $row['billable_rate'] : ccrm_tt_lookup_billable_rate($pdo, $projectId, $row['ticket_id'], (string)$row['entry_date']);
    $pdo->prepare("UPDATE `time_entries` SET `end_at` = ?, `duration_sec` = ?, `project_id` = ?, `employee_id` = ?, `billable_rate` = ?, `cost_rate` = ?, `cost_rate_source` = ?, `cost_rate_basis_days` = ?, `cost` = ?, `device_id` = COALESCE(`device_id`, ?) WHERE `id` = ? AND `end_at` IS NULL")
        ->execute([$endUtc, $dur, $projectId, $price['employee_id'], $stoppedRate, $price['cost_rate'], $price['cost_rate_source'], $price['cost_rate_basis_days'], $price['cost'], $device['id'], $row['id']]);
    return ['ok' => true, 'entry' => ccrm_ttx_entry($pdo, $row['id'], $viewer)];
}

function ccrm_ttx_recent(\PDO $pdo, string $userId, array $viewer): array {
    $stmt = $pdo->prepare(ccrm_tt_entry_select() . " WHERE te.`user_id` = ? AND te.`deleted_at` IS NULL AND te.`end_at` IS NOT NULL ORDER BY te.`end_at` DESC LIMIT 3");
    $stmt->execute([$userId]);
    $entries = [];
    foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
        $entries[] = ccrm_tt_entry_json($row, $viewer);
    }
    $today = ccrm_tt_local_date(ccrm_tt_now_utc());
    $sum = $pdo->prepare("SELECT COALESCE(SUM(`duration_sec`), 0) FROM `time_entries` WHERE `user_id` = ? AND `entry_date` = ? AND `deleted_at` IS NULL AND `end_at` IS NOT NULL");
    $sum->execute([$userId, $today]);
    return ['entries' => $entries, 'todaySeconds' => (int)$sum->fetchColumn()];
}

function ccrm_ttx_search_projects(\PDO $pdo, string $userId, string $q, ?string $host, array $rules): array {
    $q = trim(mb_substr($q, 0, 80));
    $projects = [];
    if ($q === '') {
        $stmt = $pdo->prepare(
            "SELECT p.`id`, p.`name`, l.`name` AS `client_name`
             FROM `time_entries` te
             JOIN `projects` p ON p.`id` = te.`project_id`
             LEFT JOIN `leads` l ON l.`id` = COALESCE(p.`client_id`, p.`lead_id`)
             WHERE te.`user_id` = ? AND te.`deleted_at` IS NULL AND te.`project_id` IS NOT NULL AND p.`archived` = 0
             GROUP BY p.`id`, p.`name`, l.`name`
             ORDER BY MAX(COALESCE(te.`end_at`, te.`start_at`)) DESC
             LIMIT 8"
        );
        $stmt->execute([$userId]);
    } else {
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
        $stmt = $pdo->prepare(
            "SELECT p.`id`, p.`name`, l.`name` AS `client_name`
             FROM `projects` p
             LEFT JOIN `leads` l ON l.`id` = COALESCE(p.`client_id`, p.`lead_id`)
             WHERE p.`archived` = 0 AND (p.`name` LIKE ? OR l.`name` LIKE ?)
             ORDER BY p.`name`
             LIMIT 15"
        );
        $stmt->execute([$like, $like]);
    }
    foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
        $projects[] = [
            'id' => $row['id'],
            'name' => (string)($row['name'] ?? ''),
            'clientName' => $row['client_name'] ?? null,
            'suggested' => false,
        ];
    }
    $suggestedId = null;
    if ($host !== null && $host !== '') {
        $domain = ccrm_ttx_host($host);
        if ($domain !== null) {
            $suggestedId = ccrm_ttx_suggest($rules, $domain);
        }
    }
    if ($suggestedId) {
        $have = false;
        foreach ($projects as $i => $project) {
            if ($project['id'] === $suggestedId) {
                $projects[$i]['suggested'] = true;
                $hit = $projects[$i];
                array_splice($projects, $i, 1);
                array_unshift($projects, $hit);
                $have = true;
                break;
            }
        }
        if (!$have) {
            $one = $pdo->prepare(
                "SELECT p.`id`, p.`name`, l.`name` AS `client_name`
                 FROM `projects` p
                 LEFT JOIN `leads` l ON l.`id` = COALESCE(p.`client_id`, p.`lead_id`)
                 WHERE p.`id` = ? AND p.`archived` = 0 LIMIT 1"
            );
            $one->execute([$suggestedId]);
            $row = $one->fetch(\PDO::FETCH_ASSOC);
            if ($row) {
                array_unshift($projects, [
                    'id' => $row['id'],
                    'name' => (string)($row['name'] ?? ''),
                    'clientName' => $row['client_name'] ?? null,
                    'suggested' => true,
                ]);
            }
        }
    }
    return $projects;
}

function ccrm_ttx_tasks(\PDO $pdo, array $scope, string $projectId): array {
    $stmt = $pdo->prepare("SELECT `id`, `title` FROM `tasks` WHERE `related_project_id` = ? AND `archived` = 0 AND `completed_at` IS NULL ORDER BY `title` LIMIT 40");
    $stmt->execute([$projectId]);
    $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    if (!$rows) {
        return [];
    }
    $visible = ccrm_visible_task_ids($pdo, $scope, array_column($rows, 'id'));
    $out = [];
    foreach ($rows as $row) {
        if (!isset($visible[$row['id']])) {
            continue;
        }
        $out[] = ['id' => $row['id'], 'title' => (string)$row['title']];
    }
    return $out;
}

/**
 * Merge, then keep blocks that match a watched site and clear the minimum.
 * Anything that is not a domain, a title or a pair of times is ignored.
 *
 * @return array{stored: int, skipped: int}
 */
function ccrm_ttx_store_activity(\PDO $pdo, string $userId, string $deviceId, array $blocks, array $rules): array {
    $minMinutes = (int)$rules['minMinutes'];
    $normalized = [];
    foreach (array_slice($blocks, 0, 50) as $block) {
        if (!is_array($block)) {
            continue;
        }
        $domain = ccrm_ttx_host((string)($block['domain'] ?? ''));
        $start = ccrm_ttx_ms(isset($block['startedAt']) ? (string)$block['startedAt'] : null);
        $end = ccrm_ttx_ms(isset($block['endedAt']) ? (string)$block['endedAt'] : null);
        if ($domain === null || $start === null || $end === null || $end < $start) {
            continue;
        }
        $title = trim(preg_replace('/[\x00-\x1f]/', '', (string)($block['pageTitle'] ?? '')) ?? '');
        $normalized[] = [
            'domain' => $domain,
            'pageTitle' => mb_substr($title, 0, 300),
            'startedAt' => $start,
            'endedAt' => $end,
        ];
    }
    usort($normalized, function ($a, $b) {
        return $a['startedAt'] <=> $b['startedAt'] ?: $a['endedAt'] <=> $b['endedAt'];
    });
    $runs = [];
    foreach ($normalized as $block) {
        $prev = $runs ? $runs[count($runs) - 1] : null;
        $consecutive = $prev && $prev['domain'] === $block['domain'] && ($block['startedAt'] - $prev['endedAt']) <= CCRM_TTX_MERGE_GAP_MS;
        if ($prev && $consecutive) {
            $runs[count($runs) - 1]['endedAt'] = max($prev['endedAt'], $block['endedAt']);
            if ($block['pageTitle'] !== '') {
                $runs[count($runs) - 1]['pageTitle'] = $block['pageTitle'];
            }
        } else {
            $runs[] = $block;
        }
    }
    $minMs = max(0, $minMinutes) * 60000;
    $stored = 0;
    $skipped = 0;
    $find = $pdo->prepare("SELECT `id` FROM `time_activity` WHERE `user_id` = ? AND `device_id` = ? AND `domain` = ? AND `started_at` = ? AND `status` = 'unsorted' LIMIT 1");
    $upd = $pdo->prepare("UPDATE `time_activity` SET `ended_at` = ?, `duration_sec` = ?, `page_title` = ?, `suggested_project_id` = ? WHERE `id` = ?");
    $ins = $pdo->prepare(
        "INSERT INTO `time_activity` (`id`, `user_id`, `device_id`, `domain`, `page_title`, `started_at`, `ended_at`, `duration_sec`, `suggested_project_id`, `status`, `created_at`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unsorted', UTC_TIMESTAMP())"
    );
    foreach ($runs as $run) {
        if (($run['endedAt'] - $run['startedAt']) < $minMs) {
            $skipped++;
            continue;
        }
        $suggested = ccrm_ttx_suggest($rules, $run['domain']);
        if ($suggested === null && !ccrm_ttx_domain_watched($rules, $run['domain'])) {
            $skipped++;
            continue;
        }
        $startUtc = ccrm_ttx_ms_utc($run['startedAt']);
        $endUtc = ccrm_ttx_ms_utc($run['endedAt']);
        $duration = max(0, (int)round(($run['endedAt'] - $run['startedAt']) / 1000));
        $find->execute([$userId, $deviceId, $run['domain'], $startUtc]);
        $existing = $find->fetchColumn();
        if ($existing) {
            $upd->execute([$endUtc, $duration, $run['pageTitle'], $suggested, $existing]);
        } else {
            $ins->execute(['ta-' . bin2hex(random_bytes(8)), $userId, $deviceId, $run['domain'], $run['pageTitle'], $startUtc, $endUtc, $duration, $suggested]);
        }
        $stored++;
    }
    return ['stored' => $stored, 'skipped' => $skipped];
}

function ccrm_ttx_domain_watched(array $rules, string $domain): bool {
    foreach ($rules['sites'] as $site) {
        if (ccrm_ttx_site_matches($domain, (string)$site['pattern'])) {
            return true;
        }
    }
    return false;
}

function ccrm_ttx_unsorted_count(\PDO $pdo, string $userId): int {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM `time_activity` WHERE `user_id` = ? AND `status` = 'unsorted'");
    $stmt->execute([$userId]);
    return (int)$stmt->fetchColumn();
}

function ccrm_ttx_unsorted(\PDO $pdo, string $userId): array {
    $stmt = $pdo->prepare(
        "SELECT a.*, p.`name` AS `project_name`
         FROM `time_activity` a
         LEFT JOIN `projects` p ON p.`id` = a.`suggested_project_id`
         WHERE a.`user_id` = ? AND a.`status` = 'unsorted'
         ORDER BY a.`started_at` DESC
         LIMIT 100"
    );
    $stmt->execute([$userId]);
    $items = [];
    foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
        $items[] = [
            'id' => $row['id'],
            'domain' => $row['domain'],
            'pageTitle' => $row['page_title'],
            'startedAt' => ccrm_tt_iso($row['started_at']),
            'endedAt' => ccrm_tt_iso($row['ended_at']),
            'durationSec' => (int)$row['duration_sec'],
            'suggestedProjectId' => $row['suggested_project_id'],
            'suggestedProjectName' => $row['project_name'] ?? null,
        ];
    }
    return ['items' => $items, 'count' => ccrm_ttx_unsorted_count($pdo, $userId)];
}

/** @return array{ok: bool, code?: string, status?: int, assigned?: int, entries?: array} */
function ccrm_ttx_assign(\PDO $pdo, array $user, array $scope, array $ids, ?string $projectId, array $settings): array {
    $userId = (string)$user['id'];
    if (!ccrm_can($scope, 'time_tracking', 'edit')) {
        return ['ok' => false, 'code' => 'forbidden', 'status' => 403];
    }
    $ids = array_values(array_unique(array_filter(array_map(function ($id) {
        return ccrm_tt_nullable_id($id);
    }, array_slice($ids, 0, 50)))));
    if (!$ids || $projectId === null) {
        return ['ok' => false, 'code' => 'project_required', 'status' => 422];
    }
    $links = ccrm_tt_resolve_links($pdo, ['projectId' => $projectId]);
    if (!$links['ok']) {
        return ['ok' => false, 'code' => $links['code'], 'status' => 422];
    }
    if ($denied = ccrm_ttx_check_links($pdo, $scope, $links, $projectId)) {
        return ['ok' => false, 'code' => $denied, 'status' => 403];
    }
    $viewer = ccrm_ttx_viewer($scope, $userId);
    $employee = ccrm_tt_employee_for_user($pdo, $userId);
    $billable = (int)$settings['billableByDefault'];
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $sel = $pdo->prepare("SELECT * FROM `time_activity` WHERE `user_id` = ? AND `status` = 'unsorted' AND `id` IN ($placeholders)");
    $sel->execute(array_merge([$userId], $ids));
    $rows = $sel->fetchAll(\PDO::FETCH_ASSOC);
    if (!$rows) {
        return ['ok' => false, 'code' => 'not_found', 'status' => 404];
    }
    $entries = [];
    $pdo->beginTransaction();
    try {
        foreach ($rows as $row) {
            $newId = ccrm_tt_new_id();
            $title = mb_substr(trim((string)$row['page_title']), 0, 500);
            if ($title === '') {
                $title = (string)$row['domain'];
            }
            $dur = (int)$row['duration_sec'];
            $price = ccrm_tt_price($pdo, $userId, ccrm_tt_local_date($row['started_at']), $dur, $settings, true);
            $rate = ccrm_tt_lookup_billable_rate($pdo, $projectId, null, ccrm_tt_local_date($row['started_at']));
            $pdo->prepare(
                "INSERT INTO `time_entries` (`id`, `user_id`, `recorded_by_user_id`, `employee_id`, `project_id`, `description`, `title_snapshot`, `entry_date`, `start_at`, `end_at`, `duration_sec`, `billable`, `billable_rate`, `cost_rate`, `cost_rate_source`, `cost_rate_basis_days`, `cost`, `tags`, `source`, `origin_type`, `origin_id`, `device_id`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'activity', 'activity', ?, ?)"
            )->execute([
                $newId, $userId, $userId, $employee['id'] ?? null, $projectId, $title, $title,
                ccrm_tt_local_date($row['started_at']), $row['started_at'], $row['ended_at'], $dur, $billable, $rate,
                $price['cost_rate'], $price['cost_rate_source'], $price['cost_rate_basis_days'], $price['cost'],
                $row['id'], $row['device_id'],
            ]);
            $pdo->prepare("UPDATE `time_activity` SET `status` = 'assigned', `entry_id` = ?, `suggested_project_id` = COALESCE(`suggested_project_id`, ?) WHERE `id` = ? AND `status` = 'unsorted'")
                ->execute([$newId, $projectId, $row['id']]);
            $entries[] = ccrm_ttx_entry($pdo, $newId, $viewer);
        }
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
    return ['ok' => true, 'assigned' => count($entries), 'entries' => $entries];
}

function ccrm_ttx_dismiss(\PDO $pdo, string $userId, array $ids): int {
    $ids = array_values(array_filter(array_map(function ($id) {
        return ccrm_tt_nullable_id($id);
    }, array_slice($ids, 0, 50))));
    if (!$ids) {
        return 0;
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("UPDATE `time_activity` SET `status` = 'dismissed' WHERE `user_id` = ? AND `status` = 'unsorted' AND `id` IN ($placeholders)");
    $stmt->execute(array_merge([$userId], $ids));
    return $stmt->rowCount();
}

/** Drop activity older than the company retention. Safe when the table is not there yet. */
function ccrm_tta_purge(\PDO $pdo): array {
    $settings = ccrm_tt_load_settings($pdo);
    $days = (int)($settings['extension']['unsortedRetentionDays'] ?? 30);
    if ($days < 1) {
        $days = 30;
    }
    if ($days > 365) {
        $days = 365;
    }
    $stmt = $pdo->prepare("DELETE FROM `time_activity` WHERE `started_at` < (UTC_TIMESTAMP() - INTERVAL {$days} DAY)");
    $stmt->execute();
    return ['purged' => $stmt->rowCount(), 'days' => $days];
}
