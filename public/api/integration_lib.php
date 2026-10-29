<?php
/**
 * Machine API v1 — shared helpers (docs/WAAI-INTEGRATION.md §4.1).
 *
 * Used by integration.php (the token-authenticated front controller) and
 * integration_admin.php (the session-authenticated management endpoint).
 *
 * Nothing here starts a PHP session or sets a cookie: the machine API is
 * sessionless by design.
 */

if (!class_exists('CcrmIntApiException')) {
    /** A failure that is rendered as the API's JSON error envelope. */
    class CcrmIntApiException extends \RuntimeException {
        public int $status;
        public string $errorCode;
        /** @var array<string, string> */
        public array $fields;
        /** @var array<string, string> */
        public array $headers;

        public function __construct(int $status, string $errorCode, string $message, array $fields = [], array $headers = []) {
            parent::__construct($message);
            $this->status = $status;
            $this->errorCode = $errorCode;
            $this->fields = $fields;
            $this->headers = $headers;
        }
    }
}

if (!function_exists('ccrm_int_fail')) {

    /** Requests per token and minute before the API answers 429. */
    if (!defined('CCRM_INT_RATE_LIMIT_PER_MINUTE')) {
        define('CCRM_INT_RATE_LIMIT_PER_MINUTE', 300);
    }
    /** Largest request body the API reads (bytes). */
    if (!defined('CCRM_INT_MAX_BODY_BYTES')) {
        define('CCRM_INT_MAX_BODY_BYTES', 65536);
    }
    /** `last_used_at` is refreshed at most this often per token (seconds). */
    if (!defined('CCRM_INT_USAGE_INTERVAL')) {
        define('CCRM_INT_USAGE_INTERVAL', 60);
    }

    function ccrm_int_fail(int $status, string $code, string $message, array $fields = [], array $headers = []): never {
        throw new CcrmIntApiException($status, $code, $message, $fields, $headers);
    }

    /** Every scope a token's client can be granted. A route names the one it needs. */
    function ccrm_int_scopes(): array {
        return ['users:read', 'directory:read', 'tasks:push', 'tasks:pull', 'whatsapp:links', 'timeline:push'];
    }

    // ------------------------------------------------------------------ tokens

    function ccrm_int_token_hash(string $plain): string {
        return hash('sha256', $plain);
    }

    /**
     * Generates a token `ccrm_int_<prefix>_<secret>` (prefix 12 hex chars, secret 64 hex chars =
     * 256 bits), stores its sha256 and returns the plaintext. The plaintext is not recoverable
     * afterwards: show it once.
     *
     * @return array{id: string, prefix: string, token: string}
     */
    function ccrm_int_token_issue(\PDO $pdo, string $clientId, ?string $expiresAt): array {
        $prefix = bin2hex(random_bytes(6));
        $token  = 'ccrm_int_' . $prefix . '_' . bin2hex(random_bytes(32));
        $id     = 'intt_' . bin2hex(random_bytes(8));
        $pdo->prepare(
            "INSERT INTO `integration_tokens` (`id`, `client_id`, `prefix`, `token_hash`, `expires_at`) VALUES (?, ?, ?, ?, ?)"
        )->execute([$id, $clientId, $prefix, ccrm_int_token_hash($token), $expiresAt]);
        return ['id' => $id, 'prefix' => $prefix, 'token' => $token];
    }

    /** True once `expires_at` (stored in the app time zone) has passed. */
    function ccrm_int_token_expired(?string $expiresAt): bool {
        if ($expiresAt === null || $expiresAt === '') {
            return false;
        }
        $ts = strtotime($expiresAt);
        return $ts !== false && $ts <= time();
    }

    /**
     * Finds the usable token for a plaintext value: looked up by prefix, hash compared in constant
     * time, not revoked, not expired, client active. Returns [tokenRow, clientView] or null.
     *
     * @return array{0: array, 1: array}|null
     */
    function ccrm_int_token_find(\PDO $pdo, string $plain): ?array {
        if (!preg_match('/^ccrm_int_([0-9a-f]{12})_[0-9a-f]{64}$/', $plain, $m)) {
            return null;
        }
        $stmt = $pdo->prepare("SELECT * FROM `integration_tokens` WHERE `prefix` = ? LIMIT 1");
        $stmt->execute([$m[1]]);
        $token = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$token || !hash_equals((string)$token['token_hash'], ccrm_int_token_hash($plain))) {
            return null;
        }
        if ($token['revoked_at'] !== null || ccrm_int_token_expired($token['expires_at'])) {
            return null;
        }
        $stmt = $pdo->prepare("SELECT * FROM `integration_clients` WHERE `id` = ? LIMIT 1");
        $stmt->execute([$token['client_id']]);
        $client = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$client || !(int)$client['is_active']) {
            return null;
        }
        return [$token, ccrm_int_client_view($client)];
    }

    /** The Authorization header, however the web server hands it over. */
    function ccrm_int_auth_header(): string {
        foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $key) {
            $v = trim((string)($_SERVER[$key] ?? ''));
            if ($v !== '') {
                return $v;
            }
        }
        if (function_exists('getallheaders')) {
            foreach (getallheaders() as $name => $value) {
                if (strcasecmp((string)$name, 'Authorization') === 0) {
                    return trim((string)$value);
                }
            }
        }
        return '';
    }

    /**
     * Authenticates the request. Only the Authorization header is read: never the query string or
     * the body, which end up in logs.
     *
     * @return array{0: array, 1: array} [tokenRow, clientView]
     */
    function ccrm_int_authenticate(\PDO $pdo): array {
        $challenge = ['WWW-Authenticate' => 'Bearer'];
        if (!preg_match('/^Bearer ([A-Za-z0-9_]{1,200})$/i', ccrm_int_auth_header(), $m)) {
            ccrm_int_fail(401, 'unauthorized', 'Missing or malformed bearer token.', [], $challenge);
        }
        $found = ccrm_int_token_find($pdo, $m[1]);
        if ($found === null) {
            ccrm_int_fail(401, 'unauthorized', 'Invalid, revoked or expired token.', [], $challenge);
        }
        return $found;
    }

    // ------------------------------------------------------------------ client

    /** Decodes a JSON TEXT column into a list of strings. */
    function ccrm_int_json_list($raw): array {
        $data = json_decode((string)$raw, true);
        if (!is_array($data)) {
            return [];
        }
        return array_values(array_filter(array_map('strval', $data), static fn(string $v): bool => $v !== ''));
    }

    /**
     * The WhatsApp module's own settings, kept in `settings_json` (docs/WAAI-NATIVE-MODULE.md §4.1):
     * `module_ui` = native | embedded (which interface the module shows), `module_transport` = proxy | direct
     * (how the browser reaches WAAI: through this CRM's /waai-api path, or at WAAI's own address).
     * Anything missing or unknown reads as the default, so a row written before these existed keeps working.
     *
     * @return array{module_ui: string, module_transport: string}
     */
    function ccrm_int_module_settings(array $row): array {
        $s = json_decode((string)($row['settings_json'] ?? ''), true);
        $s = is_array($s) ? $s : [];
        return [
            'module_ui' => ($s['module_ui'] ?? '') === 'native' ? 'native' : 'embedded',
            'module_transport' => ($s['module_transport'] ?? '') === 'direct' ? 'direct' : 'proxy',
        ];
    }

    /** A client row as the rest of the API uses it: JSON columns decoded, flags as booleans. */
    function ccrm_int_client_view(array $row): array {
        return ccrm_int_module_settings($row) + [
            'id' => (string)$row['id'],
            'code' => (string)$row['code'],
            'name' => (string)$row['name'],
            'is_active' => (bool)(int)$row['is_active'],
            'scopes' => ccrm_int_json_list($row['scopes']),
            'allowed_ips' => ccrm_int_json_list($row['allowed_ips']),
            'require_direct' => (bool)(int)$row['require_direct'],
            'owner_user_ids' => ccrm_int_json_list($row['owner_user_ids']),
            'feed_scope' => (string)$row['feed_scope'] === 'all' ? 'all' : 'owners',
            'embed_url' => $row['embed_url'] !== null && $row['embed_url'] !== '' ? (string)$row['embed_url'] : null,
            'has_sso_secret' => !empty($row['sso_secret']),
            'default_deadline_days' => (int)$row['default_deadline_days'],
        ];
    }

    function ccrm_int_has_scope(array $client, string $scope): bool {
        return in_array($scope, $client['scopes'], true);
    }

    /** @param string|string[]|null $required null = any valid token; an array = any one of them */
    function ccrm_int_check_scope(array $client, $required): void {
        if ($required === null) {
            return;
        }
        $any = (array)$required;
        foreach ($any as $scope) {
            if (ccrm_int_has_scope($client, $scope)) {
                return;
            }
        }
        ccrm_int_fail(403, 'forbidden_scope', 'The token lacks the required scope: ' . $any[0]);
    }

    // ------------------------------------------------------------------ network

    /** True when `$ip` is inside `$range` (a single address or a CIDR block, IPv4 or IPv6). */
    function ccrm_int_ip_in_range(string $ip, string $range): bool {
        $addr = @inet_pton($ip);
        if ($addr === false) {
            return false;
        }
        $parts = explode('/', $range, 2);
        $base = @inet_pton($parts[0]);
        if ($base === false || strlen($base) !== strlen($addr)) {
            // An IPv4-mapped IPv6 peer (::ffff:10.0.0.1) against an IPv4 range.
            if ($base !== false && strlen($addr) === 16 && strlen($base) === 4 && strncmp($addr, str_repeat("\0", 10) . "\xff\xff", 12) === 0) {
                $addr = substr($addr, 12);
            } else {
                return false;
            }
        }
        $bits = strlen($base) * 8;
        $prefix = isset($parts[1]) ? $parts[1] : (string)$bits;
        if (!ctype_digit($prefix) || (int)$prefix > $bits) {
            return false;
        }
        $prefix = (int)$prefix;
        $bytes = intdiv($prefix, 8);
        if ($bytes > 0 && strncmp($addr, $base, $bytes) !== 0) {
            return false;
        }
        $rest = $prefix % 8;
        if ($rest === 0) {
            return true;
        }
        $mask = (0xFF << (8 - $rest)) & 0xFF;
        return (ord($addr[$bytes]) & $mask) === (ord($base[$bytes]) & $mask);
    }

    /** True when `$value` is an IP address or a valid CIDR block. */
    function ccrm_int_valid_ip_range(string $value): bool {
        $parts = explode('/', $value, 2);
        $bin = @inet_pton($parts[0]);
        if ($bin === false) {
            return false;
        }
        if (!isset($parts[1])) {
            return true;
        }
        return ctype_digit($parts[1]) && (int)$parts[1] <= strlen($bin) * 8;
    }

    /**
     * Network check. `allowed_ips` is matched against the raw socket address, never a
     * proxy-supplied one; `require_direct` refuses any request that went through a proxy.
     */
    function ccrm_int_check_network(array $client): void {
        if ($client['require_direct']) {
            foreach (['HTTP_X_FORWARDED_FOR', 'HTTP_FORWARDED', 'HTTP_X_REAL_IP', 'HTTP_X_FORWARDED_PROTO', 'HTTP_X_FORWARDED_HOST'] as $key) {
                if (!empty($_SERVER[$key])) {
                    ccrm_int_fail(403, 'forbidden_network', 'Requests through a proxy are not allowed for this client.');
                }
            }
        }
        if ($client['allowed_ips'] === []) {
            return;
        }
        $remote = (string)($_SERVER['REMOTE_ADDR'] ?? '');
        foreach ($client['allowed_ips'] as $range) {
            if ($remote !== '' && ccrm_int_ip_in_range($remote, $range)) {
                return;
            }
        }
        ccrm_int_fail(403, 'forbidden_network', 'This address is not allowed for this client.');
    }

    // ------------------------------------------------------------------ rate limit, usage

    /**
     * Counts this request in the token's current one-minute window and answers 429 past the cap.
     * One atomic upsert: parallel requests cannot read the same count, so no advisory lock is needed.
     */
    function ccrm_int_rate_limit(\PDO $pdo, string $prefix, ?int $now = null): void {
        $now = $now ?? time();
        $window = intdiv($now, 60) * 60;
        $pdo->prepare(
            "INSERT INTO `integration_rate` (`token_prefix`, `window_start`, `hits`) VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE `hits` = `hits` + 1"
        )->execute([$prefix, $window]);
        $stmt = $pdo->prepare("SELECT `hits` FROM `integration_rate` WHERE `token_prefix` = ? AND `window_start` = ?");
        $stmt->execute([$prefix, $window]);
        $hits = (int)$stmt->fetchColumn();
        if (random_int(1, 100) === 1) {
            $pdo->prepare("DELETE FROM `integration_rate` WHERE `window_start` < ?")->execute([$window - 600]);
        }
        if ($hits > CCRM_INT_RATE_LIMIT_PER_MINUTE) {
            ccrm_int_fail(429, 'rate_limited', 'Too many requests.', [], ['Retry-After' => (string)max(1, $window + 60 - $now)]);
        }
    }

    /** Remembers when and from where a token was last used (at most once a minute per token). */
    function ccrm_int_record_usage(\PDO $pdo, array $token): void {
        $last = $token['last_used_at'] !== null ? strtotime((string)$token['last_used_at']) : false;
        if ($last !== false && time() - $last < CCRM_INT_USAGE_INTERVAL) {
            return;
        }
        $pdo->prepare("UPDATE `integration_tokens` SET `last_used_at` = ?, `last_used_ip` = ? WHERE `id` = ?")
            ->execute([date('Y-m-d H:i:s'), substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45), $token['id']]);
    }

    // ------------------------------------------------------------------ request body

    /**
     * The request body, or '' when there is none. Refuses a body above 64 KB (413) and any body that is
     * not JSON (415). The read is capped, so an oversized chunked upload is never held in memory.
     */
    function ccrm_int_read_body(): string {
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > CCRM_INT_MAX_BODY_BYTES) {
            ccrm_int_fail(413, 'payload_too_large', 'Request body exceeds 64 KB.');
        }
        $raw = (string)file_get_contents('php://input', false, null, 0, CCRM_INT_MAX_BODY_BYTES + 1);
        if ($raw === '') {
            return '';
        }
        if (strlen($raw) > CCRM_INT_MAX_BODY_BYTES) {
            ccrm_int_fail(413, 'payload_too_large', 'Request body exceeds 64 KB.');
        }
        if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) {
            ccrm_int_fail(415, 'unsupported_media_type', 'Content-Type must be application/json.');
        }
        return $raw;
    }

    /** The decoded JSON object of a request body; malformed JSON or a non-object is a 400. */
    function ccrm_int_json_object(string $raw): array {
        if ($raw === '') {
            ccrm_int_fail(400, 'invalid_json', 'A JSON body is required.');
        }
        $data = json_decode($raw, true);
        if (!is_array($data) || ($data !== [] && array_is_list($data))) {
            ccrm_int_fail(400, 'invalid_json', 'The body must be a JSON object.');
        }
        return $data;
    }

    // ------------------------------------------------------------------ input cleaning

    /**
     * Removes control characters (NUL, escapes, …) and invisible formatting characters such as bidi
     * overrides, BOM and soft hyphens. The zero-width (non-)joiners stay: emoji sequences (family,
     * flags) and Persian / Indic scripts need them. Newlines survive in multiline mode.
     */
    function ccrm_int_strip_invisible(string $text, bool $multiline = false): string {
        $text = mb_scrub($text, 'UTF-8');
        // Control, surrogate, private-use and unassigned code points; a lone one becomes a space in a single line.
        $text = preg_replace(
            $multiline ? '/[^\P{Cc}\n]+|[\p{Cs}\p{Co}\p{Cn}]+/u' : '/[\p{Cc}\p{Cs}\p{Co}\p{Cn}]+/u',
            $multiline ? '' : ' ',
            $text
        );
        // Format characters (Cf) except ZWNJ U+200C and ZWJ U+200D.
        return (string)preg_replace('/(?:(?![\x{200C}\x{200D}])\p{Cf})+/u', '', (string)$text);
    }

    /**
     * Cleans free text received from the other system: no markup, no control characters, bounded
     * length. Never rendered as HTML anywhere in CCRM.
     *
     * @throws CcrmIntApiException 422 when the text is not a string, empty (if required) or too long
     */
    function ccrm_int_clean_text($value, string $field, int $maxLength, bool $multiline = false, bool $required = false): string {
        if ($value !== null && !is_string($value)) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', [$field => 'Must be a string.']);
        }
        $text = html_entity_decode(strip_tags((string)$value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        // Entities may decode into markup, so strip again.
        $text = strip_tags($text);
        $text = str_replace(["\r\n", "\r"], "\n", $text);
        $text = ccrm_int_strip_invisible($text, $multiline);
        if ($multiline) {
            $text = (string)preg_replace('/[ \t]+/u', ' ', $text);
            $text = (string)preg_replace('/ ?\n ?/u', "\n", $text);
            $text = (string)preg_replace('/\n{3,}/', "\n\n", $text);
        } else {
            $text = (string)preg_replace('/\s+/u', ' ', $text);
        }
        $text = trim($text);
        if ($required && $text === '') {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', [$field => 'Must not be empty.']);
        }
        if (mb_strlen($text) > $maxLength) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', [$field => "Must be at most {$maxLength} characters."]);
        }
        return $text;
    }

    /**
     * Strict ISO 8601: `2026-10-05` or `2026-10-05T12:00[:00[.fff]]` followed by `Z` or `±HH:MM`. Words such
     * as "tomorrow" are refused. A date without a time is midnight in the app time zone. Dates more than a
     * year back or five years ahead are refused.
     *
     * @throws CcrmIntApiException 422
     */
    function ccrm_int_parse_iso($value, string $field, ?int $now = null): \DateTimeImmutable {
        $bad = static fn(string $why) => ccrm_int_fail(422, 'validation_failed', 'Validation failed.', [$field => $why]);
        if (!is_string($value)) {
            $bad('Must be an ISO 8601 date or date-time string.');
        }
        $zone = new \DateTimeZone(date_default_timezone_get());
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $m)) {
            if (!checkdate((int)$m[2], (int)$m[3], (int)$m[1])) {
                $bad('Not a real calendar date.');
            }
            $dt = new \DateTimeImmutable($value . ' 00:00:00', $zone);
        } elseif (preg_match('/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,6})?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/', $value, $m)) {
            if (!checkdate((int)$m[2], (int)$m[3], (int)$m[1])) {
                $bad('Not a real calendar date.');
            }
            try {
                $dt = new \DateTimeImmutable($value);
            } catch (\Throwable $e) {
                $bad('Must be an ISO 8601 date or date-time string.');
            }
        } else {
            $bad('Must be an ISO 8601 date or date-time string.');
        }
        $now = $now ?? time();
        if ($dt->getTimestamp() < strtotime('-1 year', $now) || $dt->getTimestamp() > strtotime('+5 years', $now)) {
            $bad('Must be within 1 year back and 5 years ahead.');
        }
        return $dt;
    }
}
