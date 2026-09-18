<?php
/**
 * CCRM licensing client — shared, OUTPUT-FREE library.
 *
 * Every consumer of the licence (the HTTP endpoint api/license.php, the seat
 * check in sync.php, and the `php ccrm update` gate) goes through this file, so
 * the rules can never drift between them.
 *
 * ---------------------------------------------------------------------------
 * Trust model
 * ---------------------------------------------------------------------------
 * The licence server (a Craft CMS channel + module, see docs/licensing/) never
 * simply "says yes". It returns a SIGNED TOKEN:
 *
 *     token = base64url(claimJson) "." base64url(signature)
 *
 * and the signature covers the ASCII bytes of the FIRST SEGMENT — the encoded
 * claim, not the decoded object. Signing the encoding rather than the object
 * removes every canonicalisation question: there is exactly one byte string to
 * verify, and it is the one we received.
 *
 * The matching PUBLIC key is compiled into this file (CCRM_LICENSE_PUBLIC_KEY).
 * Consequences that matter:
 *
 *  - A hijacked DNS entry, a proxy that terminates TLS, or a licence server
 *    replaced wholesale cannot mint a licence: none of them hold the private key.
 *  - Neither can anyone with write access to the CCRM database. The stored token
 *    is re-verified from scratch on EVERY read (ccrm_license_load), so editing
 *    `licenses`.`expires_at` by hand changes a display column and nothing else —
 *    the authority is the claim inside the signature.
 *  - Conversely, the token is safe to cache. When the licence server is down the
 *    last verified claim keeps its authority, which is what makes an outage at
 *    the vendor invisible to the customer.
 *
 * Three further replay defences, because a signed token is a bearer object:
 *
 *  - Instance binding: the claim names the install (`instance`) it was issued
 *    for, so a colleague's token pasted into a second install is rejected.
 *  - Nonce: an online check sends a fresh nonce that the server must echo inside
 *    the claim, so a network attacker cannot answer with a recording of last
 *    year's still-valid response.
 *  - Monotonic issuance: a token is accepted only if its `issuedAt` is at least
 *    as new as the stored one, so nobody can roll an install back to a claim
 *    that was valid before the licence lapsed.
 *
 * ---------------------------------------------------------------------------
 * What a lapsed licence does and does not do
 * ---------------------------------------------------------------------------
 * NOTHING in the running application is disabled by an expired, missing, or even
 * revoked licence. The CRM keeps working exactly as before. The licence gates
 * one thing — `php ccrm update`, i.e. receiving new versions — and drives one
 * informational banner ahead of the expiry date. That is deliberate: this is a
 * customer's operational database, and no licensing decision (including a bug in
 * this file) is allowed to stand between them and their own data.
 */

if (!function_exists('ccrm_license_public_keys')) {

    // -----------------------------------------------------------------------
    // Configuration
    //
    // Each of these may be overridden per install by define()ing it in
    // config.php, which is loaded before this file everywhere it is used.
    // -----------------------------------------------------------------------

    /** Licence server endpoint (the Craft module route). */
    if (!defined('CCRM_LICENSE_ENDPOINT')) {
        define('CCRM_LICENSE_ENDPOINT', 'https://ccrm.softwaresolutions.sk/ccrm-license/validate');
    }

    /**
     * Public key(s) that may sign a licence claim, whitespace/comma separated so
     * a key can be rotated by publishing the new one alongside the old for one
     * release. Two accepted forms:
     *
     *   ed25519:<base64 of the 32 raw public-key bytes>
     *   -----BEGIN PUBLIC KEY----- ... -----END PUBLIC KEY-----  (RSA, >= 2048 bit)
     *
     * EMPTY BY DEFAULT — see docs/licensing/README.md. Until a real key is
     * compiled in, the product is "licensing not configured": the banner never
     * appears, the settings section says so plainly, and `php ccrm update` warns
     * but proceeds. A shipped product must have this filled in.
     */
    if (!defined('CCRM_LICENSE_PUBLIC_KEY')) {
        define('CCRM_LICENSE_PUBLIC_KEY', 'ed25519:recX+VRYjFX66vADkf/FxV7RqsHvMl1Vt44rETD/Q8w=');
    }

    /** Product discriminator, so a token minted for another product is refused. */
    if (!defined('CCRM_LICENSE_PRODUCT')) {
        define('CCRM_LICENSE_PRODUCT', 'ccrm');
    }

    /** Seconds allowed for one licence-server round trip. */
    if (!defined('CCRM_LICENSE_HTTP_TIMEOUT')) {
        define('CCRM_LICENSE_HTTP_TIMEOUT', 12);
    }

    /** How often a healthy licence silently re-checks with the server. */
    if (!defined('CCRM_LICENSE_REFRESH_HOURS')) {
        define('CCRM_LICENSE_REFRESH_HOURS', 12);
    }

    /** Minimum gap between two FAILED attempts, so an outage is not hammered. */
    if (!defined('CCRM_LICENSE_RETRY_MINUTES')) {
        define('CCRM_LICENSE_RETRY_MINUTES', 20);
    }

    /** Fallback warn window when the claim carries no `warnDays` of its own. */
    if (!defined('CCRM_LICENSE_WARN_DAYS')) {
        define('CCRM_LICENSE_WARN_DAYS', 30);
    }

    /**
     * How long a verified claim keeps its authority over `php ccrm update` while
     * the licence server cannot be reached. Never affects the running app.
     */
    if (!defined('CCRM_LICENSE_OFFLINE_DAYS')) {
        define('CCRM_LICENSE_OFFLINE_DAYS', 30);
    }

    /** Claim format this build understands. */
    if (!defined('CCRM_LICENSE_CLAIM_VERSION')) {
        define('CCRM_LICENSE_CLAIM_VERSION', 1);
    }

    // -----------------------------------------------------------------------
    // Encoding helpers
    // -----------------------------------------------------------------------

    function ccrm_license_b64url_encode(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    /**
     * Strict base64url decode. Strict on purpose: a permissive decoder lets a
     * caller present several encodings of the same bytes, and any of them would
     * then satisfy a signature that was computed over just one of them.
     */
    function ccrm_license_b64url_decode(string $encoded): ?string
    {
        if ($encoded === '' || !preg_match('/^[A-Za-z0-9_-]+$/', $encoded)) {
            return null;
        }
        $padded = strtr($encoded, '-_', '+/');
        $remainder = strlen($padded) % 4;
        if ($remainder === 1) {
            return null; // never a valid base64 length
        }
        if ($remainder > 0) {
            $padded .= str_repeat('=', 4 - $remainder);
        }
        $decoded = base64_decode($padded, true);
        return $decoded === false ? null : $decoded;
    }

    /** Constant-time comparison that also refuses non-strings. */
    function ccrm_license_equals($a, $b): bool
    {
        if (!is_string($a) || !is_string($b)) {
            return false;
        }
        return hash_equals($a, $b);
    }

    // -----------------------------------------------------------------------
    // Key handling
    // -----------------------------------------------------------------------

    /**
     * Parse CCRM_LICENSE_PUBLIC_KEY into a list of usable verifiers.
     *
     * Returns [['alg' => 'ed25519'|'rs256', 'key' => <raw bytes|PEM>], ...],
     * empty when licensing is not configured or when every configured key is
     * unusable on this PHP build (an Ed25519 key with no sodium, say).
     */
    function ccrm_license_public_keys(): array
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        $raw = trim((string) CCRM_LICENSE_PUBLIC_KEY);
        $keys = [];
        if ($raw === '') {
            return $cached = $keys;
        }

        // PEM blocks contain newlines and are extracted whole; everything left
        // over is one-line `ed25519:` entries separated by commas or whitespace.
        if (preg_match_all('/-----BEGIN PUBLIC KEY-----.*?-----END PUBLIC KEY-----/s', $raw, $pems)) {
            foreach ($pems[0] as $pem) {
                $keys[] = ['alg' => 'rs256', 'key' => $pem];
            }
            $raw = preg_replace('/-----BEGIN PUBLIC KEY-----.*?-----END PUBLIC KEY-----/s', ' ', $raw);
        }
        foreach (preg_split('/[\s,]+/', (string) $raw, -1, PREG_SPLIT_NO_EMPTY) as $entry) {
            if (stripos($entry, 'ed25519:') === 0) {
                $entry = substr($entry, strlen('ed25519:'));
            }
            $bytes = base64_decode(strtr($entry, '-_', '+/'), true);
            if ($bytes !== false && strlen($bytes) === 32) {
                $keys[] = ['alg' => 'ed25519', 'key' => $bytes];
            } else {
                error_log('[ccrm licence] ignoring unparseable public key entry');
            }
        }

        // Drop verifiers this PHP build cannot actually run, so "configured"
        // never means "configured with a key we will silently fail on".
        $usable = array_values(array_filter($keys, static function (array $k): bool {
            if ($k['alg'] === 'ed25519') {
                return function_exists('sodium_crypto_sign_verify_detached');
            }
            return function_exists('openssl_verify');
        }));
        if (count($usable) !== count($keys)) {
            error_log('[ccrm licence] a configured public key needs an extension this PHP build lacks (sodium/openssl)');
        }
        return $cached = $usable;
    }

    /** True once a usable signing key is compiled in, i.e. licensing is live. */
    function ccrm_license_is_configured(): bool
    {
        return ccrm_license_public_keys() !== [];
    }

    /**
     * Verify $signature over $signedBytes against every configured public key.
     *
     * The algorithm comes from the CONFIGURED key, never from the token — a
     * token that may pick its own algorithm is a token that may pick "none".
     * The claim's `alg` only selects which configured keys are eligible; it can
     * never introduce one.
     */
    function ccrm_license_verify_signature(string $signedBytes, string $signature, string $alg): bool
    {
        foreach (ccrm_license_public_keys() as $entry) {
            if ($entry['alg'] !== $alg) {
                continue;
            }
            $ok = false;
            try {
                if ($alg === 'ed25519') {
                    if (strlen($signature) !== 64) {
                        continue;
                    }
                    $ok = sodium_crypto_sign_verify_detached($signature, $signedBytes, $entry['key']);
                } else {
                    $pub = openssl_pkey_get_public($entry['key']);
                    if ($pub === false) {
                        continue;
                    }
                    $ok = (openssl_verify($signedBytes, $signature, $pub, OPENSSL_ALGO_SHA256) === 1);
                }
            } catch (\Throwable $e) {
                $ok = false;
            }
            if ($ok) {
                return true;
            }
        }
        return false;
    }

    // -----------------------------------------------------------------------
    // Token parsing
    // -----------------------------------------------------------------------

    /**
     * Decode and cryptographically verify a licence token.
     *
     * Returns the claim array, or null when the token is malformed, not signed
     * by a key we trust, for another product, or in a claim format this build
     * does not understand. It does NOT check instance binding, expiry or nonce:
     * those are policy, and belong to the caller that knows what it is comparing
     * against (ccrm_license_accept_token / ccrm_license_load).
     */
    function ccrm_license_parse_token(?string $token): ?array
    {
        if (!is_string($token) || $token === '' || !ccrm_license_is_configured()) {
            return null;
        }
        $parts = explode('.', trim($token));
        if (count($parts) !== 2) {
            return null;
        }
        [$claimSegment, $signatureSegment] = $parts;
        $claimJson = ccrm_license_b64url_decode($claimSegment);
        $signature = ccrm_license_b64url_decode($signatureSegment);
        if ($claimJson === null || $signature === null) {
            return null;
        }
        $claim = json_decode($claimJson, true);
        if (!is_array($claim)) {
            return null;
        }
        $alg = isset($claim['alg']) && is_string($claim['alg']) ? strtolower($claim['alg']) : '';
        if ($alg !== 'ed25519' && $alg !== 'rs256') {
            return null;
        }
        // Signed bytes are the ENCODED claim, exactly as received.
        if (!ccrm_license_verify_signature($claimSegment, $signature, $alg)) {
            return null;
        }
        if ((int) ($claim['v'] ?? 0) !== (int) CCRM_LICENSE_CLAIM_VERSION) {
            return null;
        }
        if (!ccrm_license_equals((string) ($claim['product'] ?? ''), (string) CCRM_LICENSE_PRODUCT)) {
            return null;
        }
        if (!isset($claim['key'], $claim['instance']) || !is_string($claim['key']) || !is_string($claim['instance'])) {
            return null;
        }
        return $claim;
    }

    // -----------------------------------------------------------------------
    // Install identity
    // -----------------------------------------------------------------------

    /**
     * Stable, opaque identifier for THIS installation, minted once and kept in
     * system_settings. It lets the licence server bind a key to an install (and
     * so notice the same key activated on ten of them) without the app ever
     * sending anything about the customer's data.
     *
     * Deliberately not derived from the hostname or the database name: those
     * change on a domain move or a restore, and a licence that breaks when a
     * customer migrates their server is a support ticket, not a control.
     *
     * Returns '' when the id cannot be resolved; callers treat that as "cannot
     * check right now" rather than inventing one.
     */
    function ccrm_license_instance_id(\PDO $pdo): string
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        try {
            $existing = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'LICENSE_INSTANCE_ID'")->fetchColumn();
            if (is_string($existing) && preg_match('/^[a-f0-9]{32}$/', $existing)) {
                return $cached = $existing;
            }
            $generated = bin2hex(random_bytes(16));
            // INSERT IGNORE, not REPLACE: two concurrent first requests must end
            // up agreeing on one id rather than each overwriting the other's.
            $pdo->prepare("INSERT IGNORE INTO `system_settings` (`key`, `value`) VALUES ('LICENSE_INSTANCE_ID', ?)")
                ->execute([$generated]);
            $stored = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'LICENSE_INSTANCE_ID'")->fetchColumn();
            return $cached = (is_string($stored) && $stored !== '' ? $stored : $generated);
        } catch (\Throwable $e) {
            error_log('[ccrm licence] could not resolve instance id: ' . $e->getMessage());
            // Not cached: a transient DB error must not pin a throwaway id for
            // the life of the process and then send it to the licence server.
            return '';
        }
    }

    /** Version string of this build, read from the file the SPA exports it from. */
    function ccrm_license_app_version(): string
    {
        foreach ([dirname(__DIR__, 2) . '/src/utils/version.ts', dirname(__DIR__) . '/src/utils/version.ts'] as $file) {
            if (is_file($file)) {
                $content = @file_get_contents($file);
                if ($content && preg_match('/VERSION\s*=\s*["\']([^"\']+)["\']/', $content, $m)) {
                    return $m[1];
                }
            }
        }
        return 'unknown';
    }

    // -----------------------------------------------------------------------
    // Licence key format
    // -----------------------------------------------------------------------

    /**
     * Canonicalise a key the way a human actually pastes one: any case, any
     * separators, stray spaces from a copied email. Returns '' when nothing
     * usable is left.
     *
     * The canonical form is CCRM-XXXX-XXXX-XXXX-XXXX, but any 12–64 character
     * alphanumeric run is accepted and merely upper-cased, so an older or
     * differently shaped key from the vendor still activates.
     */
    function ccrm_license_normalize_key(?string $raw): string
    {
        $value = strtoupper(trim((string) $raw));
        $value = preg_replace('/[^A-Z0-9]/', '', $value);
        if (!is_string($value) || strlen($value) < 12 || strlen($value) > 64) {
            return '';
        }
        // Re-hyphenate the canonical 20-character CCRM shape for display/storage.
        if (strpos($value, 'CCRM') === 0 && strlen($value) === 20) {
            return 'CCRM-' . implode('-', str_split(substr($value, 4), 4));
        }
        return $value;
    }

    /** Key with its middle hidden, for anyone allowed to see it but not copy it. */
    function ccrm_license_mask_key(?string $key): string
    {
        $key = (string) $key;
        if ($key === '') {
            return '';
        }
        if (strlen($key) <= 11) {
            return str_repeat('*', strlen($key));
        }
        return substr($key, 0, 5) . str_repeat('*', 8) . substr($key, -4);
    }

    // -----------------------------------------------------------------------
    // Persistence
    //
    // The `licenses` table holds AT MOST ONE row (`id` is fixed to 1): one
    // install, one licence. Every column except `token` is a denormalised copy
    // of what the token says, kept only so the settings screen and SQL queries
    // can read it without a crypto verification — never trusted for a decision.
    // -----------------------------------------------------------------------

    /** Raw stored row, or null when nothing has ever been activated. */
    function ccrm_license_row(\PDO $pdo): ?array
    {
        try {
            $stmt = $pdo->query("SELECT * FROM `licenses` WHERE `id` = 1 LIMIT 1");
            $row = $stmt ? $stmt->fetch(\PDO::FETCH_ASSOC) : false;
            return is_array($row) ? $row : null;
        } catch (\Throwable $e) {
            error_log('[ccrm licence] could not read the licence row: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Load and RE-VERIFY the stored licence.
     *
     * Returns ['claim' => array, 'row' => array] when the stored token is
     * genuinely signed for this product, this install and the stored key;
     * ['claim' => null, 'row' => array|null] otherwise. Every decision downstream
     * reads `claim`, never the row's columns — which is what makes hand-editing
     * the table pointless.
     */
    function ccrm_license_load(\PDO $pdo): array
    {
        $row = ccrm_license_row($pdo);
        if ($row === null) {
            return ['claim' => null, 'row' => null];
        }
        $claim = ccrm_license_parse_token($row['token'] ?? null);
        if ($claim === null) {
            return ['claim' => null, 'row' => $row];
        }
        // Bind the claim to this install and to the key the row says it is for.
        // A token lifted from another CCRM database verifies cryptographically —
        // it really was signed by the vendor — and is still not this install's.
        $instanceId = ccrm_license_instance_id($pdo);
        if ($instanceId === '' || !ccrm_license_equals($claim['instance'], $instanceId)) {
            return ['claim' => null, 'row' => $row];
        }
        if (!ccrm_license_equals($claim['key'], (string) ($row['license_key'] ?? ''))) {
            return ['claim' => null, 'row' => $row];
        }
        return ['claim' => $claim, 'row' => $row];
    }

    /** ISO date (Y-m-d) from a claim field, or null when absent/unparseable. */
    function ccrm_license_claim_date(?array $claim, string $field): ?string
    {
        if (!$claim || empty($claim[$field]) || !is_string($claim[$field])) {
            return null;
        }
        $ts = strtotime($claim[$field]);
        return $ts === false ? null : date('Y-m-d', $ts);
    }

    /** Unix timestamp from a claim field, or null. */
    function ccrm_license_claim_time(?array $claim, string $field): ?int
    {
        if (!$claim || empty($claim[$field]) || !is_string($claim[$field])) {
            return null;
        }
        $ts = strtotime($claim[$field]);
        return $ts === false ? null : $ts;
    }

    /**
     * Store a token that has already passed ccrm_license_accept_token().
     *
     * Writes the token plus its denormalised columns in one statement, so a
     * reader can never see a row whose columns describe a different token than
     * the one stored beside them.
     */
    function ccrm_license_store(\PDO $pdo, string $token, array $claim, ?string $actorUserId): void
    {
        // activated_by / activated_at record the FIRST activation of THIS key. A
        // routine background re-check must not rewrite them to whoever happened
        // to be logged in when it ran — so they are resolved here, in PHP, rather
        // than with a self-referencing expression in ON DUPLICATE KEY UPDATE
        // (where `license_key` has already been reassigned by the time a later
        // assignment could compare against it).
        $existing = ccrm_license_row($pdo);
        $sameKey = $existing !== null
            && (string) ($existing['license_key'] ?? '') === (string) $claim['key'];
        $activatedBy = $sameKey ? ($existing['activated_by'] ?? null) : $actorUserId;
        $activatedAt = $sameKey ? ($existing['activated_at'] ?? null) : null; // null -> NOW()

        $sql = "INSERT INTO `licenses`
                  (`id`, `license_key`, `instance_id`, `token`, `status`, `expires_at`, `max_users`,
                   `customer`, `plan`, `issued_at`, `activated_by`, `activated_at`,
                   `last_check_at`, `last_attempt_at`, `last_error`)
                VALUES
                  (1, :key, :instance, :token, :status, :expires, :maxUsers,
                   :customer, :plan, :issued, :actor, COALESCE(:activatedAt, NOW()),
                   NOW(), NOW(), NULL)
                ON DUPLICATE KEY UPDATE
                  `license_key`     = VALUES(`license_key`),
                  `instance_id`     = VALUES(`instance_id`),
                  `token`           = VALUES(`token`),
                  `status`          = VALUES(`status`),
                  `expires_at`      = VALUES(`expires_at`),
                  `max_users`       = VALUES(`max_users`),
                  `customer`        = VALUES(`customer`),
                  `plan`            = VALUES(`plan`),
                  `issued_at`       = VALUES(`issued_at`),
                  `activated_by`    = VALUES(`activated_by`),
                  `activated_at`    = VALUES(`activated_at`),
                  `last_check_at`   = NOW(),
                  `last_attempt_at` = NOW(),
                  `last_error`      = NULL";
        $issuedAt = ccrm_license_claim_time($claim, 'issuedAt');
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':key' => (string) $claim['key'],
            ':instance' => (string) $claim['instance'],
            ':token' => $token,
            ':status' => substr((string) ($claim['status'] ?? 'unknown'), 0, 20),
            ':expires' => ccrm_license_claim_date($claim, 'expiresAt'),
            ':maxUsers' => isset($claim['maxUsers']) && $claim['maxUsers'] !== null ? (int) $claim['maxUsers'] : null,
            ':customer' => isset($claim['customer']) ? substr((string) $claim['customer'], 0, 190) : null,
            ':plan' => isset($claim['plan']) ? substr((string) $claim['plan'], 0, 60) : null,
            ':issued' => $issuedAt !== null ? date('Y-m-d H:i:s', $issuedAt) : null,
            ':actor' => $activatedBy !== null && $activatedBy !== '' ? substr((string) $activatedBy, 0, 50) : null,
            ':activatedAt' => $activatedAt !== null && $activatedAt !== '' ? (string) $activatedAt : null,
        ]);
    }

    /** Record that a check was attempted and failed, without touching the token. */
    function ccrm_license_note_failure(\PDO $pdo, string $error): void
    {
        try {
            $pdo->prepare("UPDATE `licenses` SET `last_attempt_at` = NOW(), `last_error` = ? WHERE `id` = 1")
                ->execute([substr($error, 0, 250)]);
        } catch (\Throwable $e) {
            error_log('[ccrm licence] could not record a check failure: ' . $e->getMessage());
        }
    }

    // -----------------------------------------------------------------------
    // Accepting a token
    // -----------------------------------------------------------------------

    /**
     * Full policy check on an incoming token, then store it.
     *
     * $expectedKey    the key the user typed (activation) or the stored key (re-check).
     * $expectedNonce  the nonce we sent, or null for an offline import.
     *
     * Returns ['ok' => true, 'claim' => array] or ['ok' => false, 'error' => code].
     * Error codes are stable identifiers the UI localises; they are never shown raw.
     */
    function ccrm_license_accept_token(
        \PDO $pdo,
        string $token,
        ?string $expectedKey,
        ?string $expectedNonce,
        ?string $actorUserId
    ): array {
        $claim = ccrm_license_parse_token($token);
        if ($claim === null) {
            return ['ok' => false, 'error' => 'bad_signature'];
        }

        $instanceId = ccrm_license_instance_id($pdo);
        if ($instanceId === '') {
            return ['ok' => false, 'error' => 'instance_unavailable'];
        }
        if (!ccrm_license_equals($claim['instance'], $instanceId)) {
            return ['ok' => false, 'error' => 'wrong_instance'];
        }
        if ($expectedKey !== null && !ccrm_license_equals($claim['key'], $expectedKey)) {
            return ['ok' => false, 'error' => 'key_mismatch'];
        }
        if ($expectedNonce !== null && !ccrm_license_equals((string) ($claim['nonce'] ?? ''), $expectedNonce)) {
            // The server answered, the signature is good — but this is not an
            // answer to the question we just asked. That is a replayed recording.
            return ['ok' => false, 'error' => 'replayed_response'];
        }

        // Monotonic issuance. Only enforced for the SAME key: activating a
        // different (e.g. renewed, freshly issued) key legitimately starts over.
        $existing = ccrm_license_load($pdo);
        if ($existing['claim'] !== null && ccrm_license_equals($existing['claim']['key'], $claim['key'])) {
            $storedIssued = ccrm_license_claim_time($existing['claim'], 'issuedAt');
            $incomingIssued = ccrm_license_claim_time($claim, 'issuedAt');
            if ($storedIssued !== null && $incomingIssued !== null && $incomingIssued < $storedIssued) {
                return ['ok' => false, 'error' => 'stale_token'];
            }
        }

        try {
            ccrm_license_store($pdo, $token, $claim, $actorUserId);
        } catch (\Throwable $e) {
            error_log('[ccrm licence] could not store the licence: ' . $e->getMessage());
            return ['ok' => false, 'error' => 'store_failed'];
        }
        return ['ok' => true, 'claim' => $claim];
    }

    // -----------------------------------------------------------------------
    // Talking to the licence server
    // -----------------------------------------------------------------------

    /**
     * One request to the licence server.
     *
     * Returns ['ok' => true, 'token' => string] on success, or
     * ['ok' => false, 'error' => code, 'detail' => string] otherwise.
     *
     * TLS verification is ON and not configurable: the whole point of the signed
     * token is that we do not have to trust the transport, but there is no reason
     * to hand a network attacker the request either.
     */
    function ccrm_license_request(string $action, array $fields): array
    {
        if (!function_exists('curl_init')) {
            return ['ok' => false, 'error' => 'no_curl', 'detail' => 'PHP curl extension missing'];
        }
        $endpoint = (string) CCRM_LICENSE_ENDPOINT;
        if ($endpoint === '' || stripos($endpoint, 'https://') !== 0) {
            return ['ok' => false, 'error' => 'bad_endpoint', 'detail' => 'Licence endpoint must be an https URL'];
        }

        $body = json_encode(array_merge($fields, [
            'action' => $action,
            'product' => (string) CCRM_LICENSE_PRODUCT,
            'claimV' => (int) CCRM_LICENSE_CLAIM_VERSION,
        ]), JSON_UNESCAPED_SLASHES);

        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_TIMEOUT => (int) CCRM_LICENSE_HTTP_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => min(8, (int) CCRM_LICENSE_HTTP_TIMEOUT),
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            // A licence endpoint that redirects is a misconfiguration, and
            // following one is how a POST body ends up somewhere unintended.
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_USERAGENT => 'CCRM/' . ccrm_license_app_version(),
        ]);
        $response = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        return ccrm_license_parse_server_response($httpCode, $response, $curlError);
    }

    /**
     * Turn one raw HTTP answer into the result shape the callers expect.
     *
     * Split out from ccrm_license_request() so it can be exercised directly:
     * everything that decides what the licence server "said" lives here, and the
     * function above is left with nothing but the curl call.
     *
     * $response is false/'' when the request never completed.
     */
    function ccrm_license_parse_server_response(int $httpCode, $response, string $curlError = ''): array
    {
        if ($response === false || $response === null || $response === '') {
            return ['ok' => false, 'error' => 'unreachable', 'detail' => $curlError ?: ('HTTP ' . $httpCode)];
        }
        // Cap what we parse: a compromised or confused endpoint should not be
        // able to feed json_decode an unbounded body.
        if (strlen($response) > 65536) {
            return ['ok' => false, 'error' => 'bad_response', 'detail' => 'Response too large'];
        }
        $data = json_decode($response, true);
        if (!is_array($data)) {
            return ['ok' => false, 'error' => 'bad_response', 'detail' => 'HTTP ' . $httpCode . ': malformed JSON'];
        }
        if (empty($data['success'])) {
            $code = isset($data['error']) && is_string($data['error']) ? $data['error'] : 'rejected';
            // Restrict to a known vocabulary so a hostile endpoint cannot inject
            // an arbitrary status string into our own state machine.
            $known = ['unknown_key', 'revoked', 'suspended', 'expired', 'instance_limit', 'rate_limited', 'rejected'];
            if (!in_array($code, $known, true)) {
                $code = 'rejected';
            }
            return ['ok' => false, 'error' => $code, 'detail' => 'HTTP ' . $httpCode];
        }
        // A 2xx with `success: true` is still not a licence. Only a token is.
        if (!isset($data['token']) || !is_string($data['token']) || $data['token'] === '') {
            return ['ok' => false, 'error' => 'bad_response', 'detail' => 'No token in response'];
        }
        return ['ok' => true, 'token' => $data['token']];
    }

    /** Fields every licence request carries. */
    function ccrm_license_request_context(\PDO $pdo, string $key, string $nonce): array
    {
        return [
            'key' => $key,
            'instance' => ccrm_license_instance_id($pdo),
            'host' => substr((string) ($_SERVER['HTTP_HOST'] ?? php_uname('n')), 0, 190),
            'version' => ccrm_license_app_version(),
            'seatsUsed' => ccrm_license_seats_used($pdo),
            'nonce' => $nonce,
        ];
    }

    /**
     * Activate a licence key against the server and store the resulting token.
     * Returns ['ok' => bool, 'error' => code|null].
     */
    function ccrm_license_activate(\PDO $pdo, string $rawKey, ?string $actorUserId): array
    {
        if (!ccrm_license_is_configured()) {
            return ['ok' => false, 'error' => 'not_configured'];
        }
        $key = ccrm_license_normalize_key($rawKey);
        if ($key === '') {
            return ['ok' => false, 'error' => 'malformed_key'];
        }
        if (ccrm_license_instance_id($pdo) === '') {
            return ['ok' => false, 'error' => 'instance_unavailable'];
        }
        $nonce = bin2hex(random_bytes(16));
        $result = ccrm_license_request('activate', ccrm_license_request_context($pdo, $key, $nonce));
        if (!$result['ok']) {
            ccrm_license_note_failure($pdo, $result['error'] . ': ' . ($result['detail'] ?? ''));
            return ['ok' => false, 'error' => $result['error']];
        }
        $accepted = ccrm_license_accept_token($pdo, $result['token'], $key, $nonce, $actorUserId);
        if (!$accepted['ok']) {
            ccrm_license_note_failure($pdo, 'activate rejected: ' . $accepted['error']);
            return ['ok' => false, 'error' => $accepted['error']];
        }
        return ['ok' => true, 'error' => null];
    }

    /**
     * Import a token issued out of band (vendor portal, email) — the offline
     * path for an install that cannot reach the licence server at all.
     *
     * Safe precisely because it goes through the same verification: the token is
     * still signed, still bound to this instance, and still cannot be older than
     * the one already stored.
     */
    function ccrm_license_import_token(\PDO $pdo, string $token, ?string $actorUserId): array
    {
        if (!ccrm_license_is_configured()) {
            return ['ok' => false, 'error' => 'not_configured'];
        }
        $accepted = ccrm_license_accept_token($pdo, trim($token), null, null, $actorUserId);
        return $accepted['ok']
            ? ['ok' => true, 'error' => null]
            : ['ok' => false, 'error' => $accepted['error']];
    }

    /**
     * Re-check the stored licence with the server.
     *
     * $force skips the throttle (used by an explicit "check now" button and by
     * `php ccrm update`). Otherwise a check only happens when the last successful
     * one is older than CCRM_LICENSE_REFRESH_HOURS, and a failed one is not
     * retried for CCRM_LICENSE_RETRY_MINUTES.
     *
     * Returns ['ok' => bool, 'error' => code|null, 'skipped' => bool].
     */
    function ccrm_license_refresh(\PDO $pdo, bool $force = false): array
    {
        if (!ccrm_license_is_configured()) {
            return ['ok' => false, 'error' => 'not_configured', 'skipped' => true];
        }
        $row = ccrm_license_row($pdo);
        if ($row === null || ($row['license_key'] ?? '') === '') {
            return ['ok' => false, 'error' => 'no_license', 'skipped' => true];
        }

        if (!$force) {
            // Claim the right to make this request atomically, so N concurrent
            // requests produce ONE call to the licence server rather than N.
            $claimed = $pdo->prepare(
                "UPDATE `licenses`
                    SET `last_attempt_at` = NOW()
                  WHERE `id` = 1
                    AND (`last_attempt_at` IS NULL
                         OR `last_attempt_at` < (NOW() - INTERVAL ? MINUTE))
                    AND (`last_check_at` IS NULL
                         OR `last_check_at` < (NOW() - INTERVAL ? HOUR))"
            );
            $claimed->execute([(int) CCRM_LICENSE_RETRY_MINUTES, (int) CCRM_LICENSE_REFRESH_HOURS]);
            if ($claimed->rowCount() === 0) {
                return ['ok' => false, 'error' => null, 'skipped' => true];
            }
        }

        $key = (string) $row['license_key'];
        $nonce = bin2hex(random_bytes(16));
        $result = ccrm_license_request('validate', ccrm_license_request_context($pdo, $key, $nonce));
        if (!$result['ok']) {
            ccrm_license_note_failure($pdo, $result['error'] . ': ' . ($result['detail'] ?? ''));
            return ['ok' => false, 'error' => $result['error'], 'skipped' => false];
        }
        $accepted = ccrm_license_accept_token($pdo, $result['token'], $key, $nonce, null);
        if (!$accepted['ok']) {
            ccrm_license_note_failure($pdo, 'validate rejected: ' . $accepted['error']);
            return ['ok' => false, 'error' => $accepted['error'], 'skipped' => false];
        }
        return ['ok' => true, 'error' => null, 'skipped' => false];
    }

    /** Forget the stored licence (admin action). The app keeps working. */
    function ccrm_license_remove(\PDO $pdo): void
    {
        $pdo->exec("DELETE FROM `licenses` WHERE `id` = 1");
    }

    // -----------------------------------------------------------------------
    // Seats
    // -----------------------------------------------------------------------

    /** How many user accounts exist right now. */
    function ccrm_license_seats_used(\PDO $pdo): int
    {
        try {
            return (int) $pdo->query("SELECT COUNT(*) FROM `users`")->fetchColumn();
        } catch (\Throwable $e) {
            return 0;
        }
    }

    /**
     * Seat ceiling from the VERIFIED claim, or null when there is none.
     *
     * An expired licence keeps its seat count: expiry is about updates, not about
     * shrinking a customer's team. No licence at all means no ceiling — an
     * unlicensed install must not be locked out of managing its own users.
     */
    function ccrm_license_seat_limit(\PDO $pdo): ?int
    {
        $loaded = ccrm_license_load($pdo);
        if ($loaded['claim'] === null) {
            return null;
        }
        $status = (string) ($loaded['claim']['status'] ?? '');
        if ($status === 'revoked') {
            return null; // a revoked licence stops carrying terms of any kind
        }
        $max = $loaded['claim']['maxUsers'] ?? null;
        if ($max === null || !is_numeric($max)) {
            return null;
        }
        $max = (int) $max;
        return $max > 0 ? $max : null;
    }

    /**
     * May this install create $count more user accounts?
     *
     * Existing accounts are NEVER touched, disabled or hidden when a licence is
     * downgraded — being over the limit only blocks adding more.
     */
    function ccrm_license_can_add_users(\PDO $pdo, int $count = 1): bool
    {
        $limit = ccrm_license_seat_limit($pdo);
        if ($limit === null) {
            return true;
        }
        return (ccrm_license_seats_used($pdo) + max(0, $count)) <= $limit;
    }

    // -----------------------------------------------------------------------
    // The state machine
    // -----------------------------------------------------------------------

    /**
     * Everything anyone needs to know about the licence, in one array.
     *
     * `status` is one of:
     *   unconfigured  no signing key compiled in — the product is not licensed at all
     *   none          configured, but this install has never activated a key
     *   invalid       a licence is stored but its token does not verify for this install
     *   revoked       the vendor withdrew it
     *   suspended     the vendor paused it (unpaid invoice, dispute)
     *   expired       past its expiry date
     *   expiring      valid, but inside the warning window
     *   active        valid, nothing to say
     *
     * Dates are compared against the DATABASE clock, the same one-clock rule the
     * rest of the app follows: PHP here is pinned to Europe/Bratislava while
     * MySQL commonly runs UTC, and mixing the two silently shifts an expiry by a
     * day at exactly the moment it matters.
     */
    function ccrm_license_state(\PDO $pdo): array
    {
        $today = null;
        try {
            $today = $pdo->query("SELECT CURDATE()")->fetchColumn();
        } catch (\Throwable $e) {
            $today = null;
        }
        if (!is_string($today) || $today === '') {
            $today = date('Y-m-d');
        }

        $state = [
            'configured' => ccrm_license_is_configured(),
            'status' => 'unconfigured',
            'valid' => false,
            'keyMasked' => '',
            'expiresAt' => null,
            'daysRemaining' => null,
            'warnDays' => (int) CCRM_LICENSE_WARN_DAYS,
            'maxUsers' => null,
            'seatsUsed' => ccrm_license_seats_used($pdo),
            'customer' => null,
            'plan' => null,
            'activatedAt' => null,
            'lastCheckAt' => null,
            'lastAttemptAt' => null,
            'lastError' => null,
            'offlineDays' => null,
            'updatesAllowed' => true,
            'updatesBlockedReason' => null,
        ];

        if (!$state['configured']) {
            // Licensing was never switched on for this build. Say so honestly and
            // gate nothing: an unconfigured product must behave like the product.
            return $state;
        }

        $loaded = ccrm_license_load($pdo);
        $row = $loaded['row'];
        $claim = $loaded['claim'];

        if ($row === null || ($row['license_key'] ?? '') === '') {
            $state['status'] = 'none';
            $state['updatesAllowed'] = false;
            $state['updatesBlockedReason'] = 'none';
            return $state;
        }

        $state['keyMasked'] = ccrm_license_mask_key((string) $row['license_key']);
        $state['activatedAt'] = $row['activated_at'] ?? null;
        $state['lastCheckAt'] = $row['last_check_at'] ?? null;
        $state['lastAttemptAt'] = $row['last_attempt_at'] ?? null;
        $state['lastError'] = $row['last_error'] ?? null;

        if ($claim === null) {
            // A row exists but its token does not verify: hand-edited, restored
            // from another install's backup, or signed by a key we no longer
            // trust. Never silently treated as valid.
            $state['status'] = 'invalid';
            $state['updatesAllowed'] = false;
            $state['updatesBlockedReason'] = 'invalid';
            return $state;
        }

        $state['customer'] = isset($claim['customer']) ? (string) $claim['customer'] : null;
        $state['plan'] = isset($claim['plan']) ? (string) $claim['plan'] : null;
        $state['maxUsers'] = ccrm_license_seat_limit($pdo);
        if (isset($claim['warnDays']) && is_numeric($claim['warnDays']) && (int) $claim['warnDays'] > 0) {
            $state['warnDays'] = (int) $claim['warnDays'];
        }

        $expiresAt = ccrm_license_claim_date($claim, 'expiresAt');
        $state['expiresAt'] = $expiresAt;
        if ($expiresAt !== null) {
            $state['daysRemaining'] = (int) floor(
                (strtotime($expiresAt . ' 00:00:00') - strtotime($today . ' 00:00:00')) / 86400
            );
        }

        // How long we have been unable to confirm with the server. Measured from
        // the last SUCCESSFUL check; a string of failures does not count as contact.
        $lastCheck = isset($row['last_check_at']) ? strtotime((string) $row['last_check_at']) : false;
        if ($lastCheck !== false) {
            $state['offlineDays'] = max(0, (int) floor((time() - $lastCheck) / 86400));
        }

        $claimStatus = strtolower((string) ($claim['status'] ?? 'active'));
        if ($claimStatus === 'revoked' || $claimStatus === 'suspended') {
            $state['status'] = $claimStatus;
            $state['updatesAllowed'] = false;
            $state['updatesBlockedReason'] = $claimStatus;
            return $state;
        }

        if ($expiresAt !== null && $state['daysRemaining'] !== null && $state['daysRemaining'] < 0) {
            $state['status'] = 'expired';
            $state['updatesAllowed'] = false;
            $state['updatesBlockedReason'] = 'expired';
            return $state;
        }

        $state['valid'] = true;
        $state['status'] = ($state['daysRemaining'] !== null && $state['daysRemaining'] <= $state['warnDays'])
            ? 'expiring'
            : 'active';

        // A valid licence that has not been confirmed in a very long time stops
        // authorising updates, so a revocation cannot be dodged by unplugging the
        // network. The app itself is never affected by this — only `ccrm update`.
        if ($state['offlineDays'] !== null && $state['offlineDays'] > (int) CCRM_LICENSE_OFFLINE_DAYS) {
            $state['updatesAllowed'] = false;
            $state['updatesBlockedReason'] = 'stale_check';
        }

        return $state;
    }

    /**
     * The `php ccrm update` gate.
     *
     * Forces one fresh check first (an update is rare and deliberate, so the
     * round trip is worth it), then answers from the resulting state.
     * Returns ['allowed' => bool, 'reason' => code|null, 'state' => array].
     */
    function ccrm_license_gate_update(\PDO $pdo): array
    {
        if (!ccrm_license_is_configured()) {
            return ['allowed' => true, 'reason' => 'not_configured', 'state' => ccrm_license_state($pdo)];
        }
        // Best effort: a failure here leaves the cached claim in charge, which is
        // exactly what the offline window is for.
        try {
            ccrm_license_refresh($pdo, true);
        } catch (\Throwable $e) {
            error_log('[ccrm licence] update-gate refresh failed: ' . $e->getMessage());
        }
        $state = ccrm_license_state($pdo);
        return [
            'allowed' => (bool) $state['updatesAllowed'],
            'reason' => $state['updatesBlockedReason'],
            'state' => $state,
        ];
    }
}
