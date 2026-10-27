<?php
/**
 * Shared authentication / authorization helpers for CCRM PHP endpoints.
 *
 * Security model:
 *  - Passwords are stored as bcrypt hashes (password_hash) — never plain text.
 *  - Login is verified SERVER-SIDE (api/login.php) and establishes a PHP session.
 *  - Mutating endpoints (sync POST, upload, wipe) require a valid session;
 *    destructive ones additionally require the admin role.
 *  - Endpoints are same-origin only: no wildcard `Access-Control-Allow-Origin`.
 */

// Production error hardening: never render PHP warnings/notices/stack traces
// into the HTTP response (they leak DSNs, paths and schema). Errors are still
// captured in the server log and, for exceptions, the `error_logs` table.
@ini_set('display_errors', '0');
@ini_set('log_errors', '1');
error_reporting(E_ALL);

if (!function_exists('ccrm_send_cors')) {

    /**
     * Same-origin CORS headers. We only ever reflect the request's own origin,
     * so the API is not readable by arbitrary third-party sites.
     */
    function ccrm_send_cors(string $methods = 'GET, POST, OPTIONS'): void {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $host   = $_SERVER['HTTP_HOST'] ?? '';
        // Reflect the origin only when it matches the host serving this script.
        if ($origin !== '' && $host !== '' && parse_url($origin, PHP_URL_HOST) === $host) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Access-Control-Allow-Credentials: true');
            header('Vary: Origin');
        }
        header('Access-Control-Allow-Methods: ' . $methods);
        header('Access-Control-Allow-Headers: Content-Type');
        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
            http_response_code(204);
            exit(0);
        }
    }

    /** Lifetime (seconds) of a "remember me" token — 30 days. */
    if (!defined('CCRM_REMEMBER_LIFETIME')) {
        define('CCRM_REMEMBER_LIFETIME', 60 * 60 * 24 * 30);
    }

    /**
     * Seconds a validator that was just rotated away is still accepted. On boot
     * the SPA fires several requests in parallel, all carrying the same cookie;
     * whichever is served first rotates it and the others must not log the user
     * out for presenting the value they were sent with.
     */
    if (!defined('CCRM_REMEMBER_GRACE_SECONDS')) {
        define('CCRM_REMEMBER_GRACE_SECONDS', 60);
    }

    /**
     * Start (or resume) a hardened session.
     *
     * The session cookie is a plain browser-session cookie: it dies when the
     * browser closes. "Remember me" is NOT a long-lived PHP session. PHP deletes
     * session files after session.gc_maxlifetime (24 minutes by default, applied
     * by Debian's sessionclean cron and by any other request that happens to run
     * GC), and an ini_set() only holds for the request that makes it, so a 30-day
     * cookie ended up pointing at a file that was long gone. A remembered login is
     * a separate token (ccrm_remember_restore) that re-creates the session.
     */
    function ccrm_start_session(): void {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'httponly' => true,
            'samesite' => 'Lax',
            'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        ]);
        session_name('CCRMSESSID');
        @session_start();
    }

    /** How often (seconds) a live session re-checks its role against the database. */
    if (!defined('CCRM_SESSION_REVALIDATE_SECONDS')) {
        define('CCRM_SESSION_REVALIDATE_SECONDS', 60);
    }

    /**
     * Best-effort PDO for the auth helpers themselves, without forcing every
     * caller to have already required config.php.
     */
    function ccrm_auth_pdo(): ?\PDO {
        // config.php assigns $pdo/$db_connection_error at top level and
        // get_db_connection() reads them via `global`. Including it from inside a
        // function without these declarations would bind them to THIS function's
        // scope, and because the include is require_once, the later top-level
        // include in the calling endpoint becomes a no-op — leaving the global
        // $pdo null and every subsequent get_db_connection() throwing.
        global $pdo, $db_connection_error;

        if (!function_exists('get_db_connection')) {
            $configFile = dirname(__DIR__) . '/config.php';
            if (!file_exists($configFile)) {
                $configFile = dirname(__DIR__) . '/public/config.php';
            }
            if (!file_exists($configFile)) {
                return null;
            }
            require_once $configFile;
        }
        if (!function_exists('get_db_connection')) {
            return null;
        }
        try {
            return get_db_connection();
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Drop the current session entirely (used when it is no longer valid).
     *
     * The remembered login goes with it: the next request would otherwise find
     * the token, rebuild the very session that was just retired (account deleted,
     * password changed) and make the retirement a no-op. Pass the connection to
     * delete the token row as well; without one only the cookie is cleared.
     */
    function ccrm_destroy_session(?\PDO $pdo = null): void {
        if ($pdo !== null) {
            ccrm_remember_delete_presented($pdo);
        }
        ccrm_remember_clear_cookie();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        @session_destroy();
    }

    /** Cookie that carries the persistent "remember me" token: `<selector>:<validator>`. */
    if (!defined('CCRM_REMEMBER_COOKIE')) {
        define('CCRM_REMEMBER_COOKIE', 'CCRM_REMEMBER');
    }

    /**
     * The table behind "remember me": one row per remembered browser.
     *
     * The cookie holds a random selector (the lookup key) and a random validator.
     * Only the SHA-256 of the validator is stored, so a database leak does not
     * hand out usable cookies. Every restore rotates the validator; the previous
     * hash is kept for CCRM_REMEMBER_GRACE_SECONDS (see that constant).
     *
     * Also declared in api/schema.php; keep the two in step. Created lazily here
     * because the auth endpoints do not always load schema.php (the same way
     * ccrm_passkeys_ensure_table does it). A no-op inside a transaction: DDL
     * commits implicitly in MySQL.
     */
    function ccrm_remember_ensure_table(\PDO $pdo): void {
        static $done = false;
        if ($done || $pdo->inTransaction()) {
            return;
        }
        $pdo->exec("CREATE TABLE IF NOT EXISTS `user_remember_tokens` (
          `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          `user_id` VARCHAR(50) NOT NULL,
          `selector` CHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          `validator_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'SHA-256 of the validator in the cookie',
          `prev_validator_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'Validator before the last rotation, accepted for a short grace window',
          `rotated_at` DATETIME NULL,
          `created_at` DATETIME NOT NULL,
          `expires_at` DATETIME NOT NULL,
          `last_used_at` DATETIME NULL,
          `user_agent` VARCHAR(255) NULL COMMENT 'For display and audit only',
          PRIMARY KEY (`id`),
          UNIQUE KEY `uniq_remember_selector` (`selector`),
          INDEX `idx_remember_user` (`user_id`),
          INDEX `idx_remember_expires` (`expires_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
        $done = true;
    }

    /** Attributes the remember cookie is set (and cleared) with; they must match or the browser keeps the old one. */
    function ccrm_remember_cookie_options(int $expires): array {
        return [
            'expires'  => $expires,
            'path'     => '/',
            'httponly' => true,
            'samesite' => 'Lax',
            'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        ];
    }

    function ccrm_remember_set_cookie(string $selector, string $validator): void {
        $value = $selector . ':' . $validator;
        setcookie(CCRM_REMEMBER_COOKIE, $value, ccrm_remember_cookie_options(time() + CCRM_REMEMBER_LIFETIME));
        $_COOKIE[CCRM_REMEMBER_COOKIE] = $value; // later code in this request sees the new value
    }

    /** Remove the remember cookie from the browser, if it sent one (the legacy `1` marker included). */
    function ccrm_remember_clear_cookie(): void {
        if (!isset($_COOKIE[CCRM_REMEMBER_COOKIE])) {
            return;
        }
        setcookie(CCRM_REMEMBER_COOKIE, '', ccrm_remember_cookie_options(time() - 42000));
        unset($_COOKIE[CCRM_REMEMBER_COOKIE]);
    }

    /**
     * The selector and validator the browser sent, or null when there is no
     * well-formed token. The old implementation set the cookie to `1`; that and
     * anything else malformed counts as no token.
     */
    function ccrm_remember_presented(): ?array {
        $raw = $_COOKIE[CCRM_REMEMBER_COOKIE] ?? '';
        if (!is_string($raw) || !preg_match('/^([a-f0-9]{24}):([a-f0-9]{64})$/', $raw, $m)) {
            return null;
        }
        return ['selector' => $m[1], 'validator' => $m[2]];
    }

    /** Delete the row of the token this browser presented. Best-effort, and safe inside a transaction. */
    function ccrm_remember_delete_presented(\PDO $pdo): void {
        $presented = ccrm_remember_presented();
        if ($presented === null) {
            return;
        }
        try {
            $pdo->prepare("DELETE FROM `user_remember_tokens` WHERE `selector` = ?")->execute([$presented['selector']]);
        } catch (\Throwable $e) {
            // No table yet means no token to delete.
        }
    }

    /**
     * Delete every remembered login of a user (password change, account removal).
     * Never runs DDL, so it is safe inside the sync transaction.
     */
    function ccrm_remember_revoke_user(\PDO $pdo, string $userId): void {
        try {
            $pdo->prepare("DELETE FROM `user_remember_tokens` WHERE `user_id` = ?")->execute([$userId]);
        } catch (\Throwable $e) {
            // Table missing: nothing was ever remembered.
        }
    }

    /**
     * Remember this browser: insert a token row and set the cookie. A failure is
     * logged and swallowed — the login itself has already succeeded and must not
     * be undone by the convenience feature.
     */
    function ccrm_remember_issue(\PDO $pdo, string $userId): void {
        try {
            ccrm_remember_ensure_table($pdo);
            // A fresh login replaces whatever token this browser held.
            ccrm_remember_delete_presented($pdo);

            $selector  = bin2hex(random_bytes(12));
            $validator = bin2hex(random_bytes(32));
            $agent = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
            $agent = function_exists('mb_substr') ? mb_substr($agent, 0, 255) : substr($agent, 0, 255);
            // Dates come from the DB clock, like every other comparison on them.
            $pdo->prepare(
                "INSERT INTO `user_remember_tokens`
                   (`user_id`, `selector`, `validator_hash`, `created_at`, `expires_at`, `last_used_at`, `user_agent`)
                 VALUES (?, ?, ?, NOW(), NOW() + INTERVAL ? SECOND, NOW(), ?)"
            )->execute([$userId, $selector, hash('sha256', $validator), CCRM_REMEMBER_LIFETIME, $agent !== '' ? $agent : null]);
            $pdo->exec("DELETE FROM `user_remember_tokens` WHERE `expires_at` < NOW()");

            ccrm_remember_set_cookie($selector, $validator);
        } catch (\Throwable $e) {
            error_log('[ccrm auth] could not issue a remember-me token: ' . $e->getMessage());
        }
    }

    /**
     * Sign the browser back in from its remember cookie. Returns true when a
     * session was established. Called by ccrm_current_user() only when the PHP
     * session holds no login.
     *
     * Why a request is refused is never reported to the caller: every failure
     * is the same "not signed in".
     */
    function ccrm_remember_restore(): bool {
        $presented = ccrm_remember_presented();
        if ($presented === null) {
            ccrm_remember_clear_cookie(); // legacy `1` or garbage
            return false;
        }
        $pdo = ccrm_auth_pdo();
        if ($pdo === null) {
            return false;
        }

        try {
            // Expiry, grace window and "retired by a password change" are all
            // decided by the database against its own clock (PHP is pinned to
            // another timezone than MySQL, see ccrm_current_user()).
            $stmt = $pdo->prepare(
                "SELECT t.`id`, t.`user_id`, t.`validator_hash`, t.`prev_validator_hash`,
                        (t.`expires_at` <= NOW()) AS `expired`,
                        (t.`rotated_at` IS NOT NULL AND t.`rotated_at` >= NOW() - INTERVAL ? SECOND) AS `in_grace`,
                        (u.`id` IS NULL) AS `no_user`,
                        (u.`sessions_valid_from` IS NOT NULL AND u.`sessions_valid_from` > t.`created_at`) AS `retired`
                   FROM `user_remember_tokens` t
                   LEFT JOIN `users` u ON u.`id` = t.`user_id`
                  WHERE t.`selector` = ? LIMIT 1"
            );
            $stmt->execute([CCRM_REMEMBER_GRACE_SECONDS, $presented['selector']]);
            $token = $stmt->fetch(\PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            // Table missing or database down. Fail closed: never sign anyone in on an error.
            return false;
        }

        $drop = function () use ($pdo, $presented): void {
            try {
                $pdo->prepare("DELETE FROM `user_remember_tokens` WHERE `selector` = ?")->execute([$presented['selector']]);
            } catch (\Throwable $e) { /* best-effort */ }
            ccrm_remember_clear_cookie();
        };

        if (!$token) {
            ccrm_remember_clear_cookie();
            return false;
        }

        $hash = hash('sha256', $presented['validator']);
        $isCurrent  = hash_equals((string)$token['validator_hash'], $hash);
        $isPrevious = !$isCurrent && !empty($token['in_grace']) && $token['prev_validator_hash'] !== null
            && hash_equals((string)$token['prev_validator_hash'], $hash);
        if (!$isCurrent && !$isPrevious) {
            // The selector exists but the validator is wrong, and not merely the one
            // we rotated away a moment ago: the cookie was copied, or this is a stale
            // copy of it. Burn this token only — wiping all of the user's tokens would
            // let one stale tab log out every device.
            $drop();
            ccrm_audit_log($pdo, ['id' => $token['user_id'], 'email' => null], 'auth.remember_reject', 'Remember-me token presented with a wrong validator');
            return false;
        }
        if (!empty($token['expired']) || !empty($token['no_user']) || !empty($token['retired'])) {
            $drop();
            return false;
        }

        try {
            $userStmt = $pdo->prepare("SELECT * FROM `users` WHERE `id` = ? LIMIT 1");
            $userStmt->execute([$token['user_id']]);
            $user = $userStmt->fetch(\PDO::FETCH_ASSOC);
            if (!$user) {
                $drop();
                return false;
            }

            ccrm_begin_session($pdo, $user);

            // Rotate once per burst: a value that was only just rotated in is
            // accepted as it is. The compare-and-swap in the WHERE makes a request
            // that lost the race to a parallel one leave the cookie alone — the
            // winner's Set-Cookie is the value that is actually stored.
            $rotated = false;
            if ($isCurrent && empty($token['in_grace'])) {
                $newValidator = bin2hex(random_bytes(32));
                $upd = $pdo->prepare(
                    "UPDATE `user_remember_tokens`
                        SET `prev_validator_hash` = `validator_hash`, `validator_hash` = ?,
                            `rotated_at` = NOW(), `expires_at` = NOW() + INTERVAL ? SECOND, `last_used_at` = NOW()
                      WHERE `id` = ? AND `validator_hash` = ?"
                );
                $upd->execute([hash('sha256', $newValidator), CCRM_REMEMBER_LIFETIME, $token['id'], $token['validator_hash']]);
                if ($upd->rowCount() === 1) {
                    ccrm_remember_set_cookie($presented['selector'], $newValidator);
                    $rotated = true;
                }
            }
            if ($rotated) {
                ccrm_audit_log($pdo, ['id' => $user['id'], 'email' => $user['email']], 'auth.remember_restore');
            } else {
                $pdo->prepare("UPDATE `user_remember_tokens` SET `last_used_at` = NOW() WHERE `id` = ?")->execute([$token['id']]);
            }
            return true;
        } catch (\Throwable $e) {
            error_log('[ccrm auth] remember-me restore failed: ' . $e->getMessage());
            // If the session was already opened, take it back: an error must not leave a half-built login behind.
            $_SESSION = [];
            return false;
        }
    }

    /**
     * Put a users row into the PHP session: the part every way of signing in
     * shares (password, passkey, password reset, remember-me restore).
     */
    function ccrm_begin_session(\PDO $pdo, array $row): void {
        ccrm_start_session();
        session_regenerate_id(true);
        // Only a password sign-in earns the "recently confirmed by password" marker,
        // and login.php sets it after this call. Clearing it here keeps a passkey or
        // password-reset sign-in from inheriting one left over from an earlier login.
        unset($_SESSION['ccrm_pw_auth_at']);
        $_SESSION['ccrm_uid']   = $row['id'];
        $_SESSION['ccrm_role']  = $row['role'];
        $_SESSION['ccrm_email'] = $row['email'];
        // When this session was issued, so a later password change can retire it. Taken
        // from the DB clock (not PHP's) because it is compared against the DB-written
        // users.sessions_valid_from — see ccrm_current_user(). ccrm_checked_at is a local
        // monotonic-enough marker for the revalidation interval only, never compared to
        // a DB timestamp.
        try {
            $_SESSION['ccrm_issued_at'] = $pdo->query("SELECT NOW()")->fetchColumn() ?: null;
        } catch (\Throwable $e) {
            $_SESSION['ccrm_issued_at'] = null;
        }
        $_SESSION['ccrm_checked_at'] = time();
    }

    /** Open the authenticated session for a users row and return the profile array login.php answers with. */
    function ccrm_establish_login_session(\PDO $pdo, array $row, bool $remember): array {
        // The first administrator sign-in on a fresh install may record the address
        // mailed links should use. It never replaces one already stored, and a
        // CCRM_APP_URL pin is left untouched (see ccrm_remember_app_url).
        ccrm_remember_app_url($pdo, $row);

        ccrm_begin_session($pdo, $row);

        // "Remember me" is a persistent token that re-creates the session after the
        // browser was closed. Logging in without it forgets any token this browser held.
        if ($remember) {
            ccrm_remember_issue($pdo, (string)$row['id']);
        } else {
            ccrm_remember_delete_presented($pdo);
            ccrm_remember_clear_cookie();
        }

        return [
            'name'          => $row['name'],
            'email'         => $row['email'],
            'role'          => ccrm_role_label($row['role']),
            'color'         => $row['color'] ?? '#3b82f6',
            'avatar'        => $row['avatar'] ?? null,
            'activityLog'   => [],
            // Secrets stay server-side: mask the mailbox password like the sync GET.
            'metadata_json' => ccrm_mask_user_metadata($row['metadata_json'] ?? null),
        ];
    }

    /**
     * True when this is a state-changing request that the browser says (or its
     * Origin header shows) came from another origin. SameSite=Lax does not cover
     * a sibling subdomain, and endpoints that read php://input never insisted on
     * a JSON content type, so a cross-origin form post could still ride the
     * session cookie. A browser's own Sec-Fetch-Site / Origin cannot be forged by
     * the page that triggers the request, so they are the check.
     *
     * Requests carrying neither header (curl, the MCP gateway, cron) are not
     * browser requests and are left alone — no cookie is being ridden there.
     */
    function ccrm_is_cross_site_mutation(): bool {
        $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            return false;
        }

        $fetchSite = strtolower(trim((string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '')));
        if ($fetchSite === 'same-origin' || $fetchSite === 'none') {
            return false;
        }
        if ($fetchSite !== '') {
            return true; // same-site (e.g. a sibling subdomain) or cross-site
        }

        $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
        if ($origin === '') {
            return false;
        }
        $o = parse_url($origin);
        if (!is_array($o) || empty($o['host'])) {
            return true; // "null" origin or garbage
        }
        $scheme   = strtolower((string)($o['scheme'] ?? 'http'));
        $default  = $scheme === 'https' ? 443 : 80;
        $oHost    = strtolower(trim((string)$o['host'], '[]'));
        $oPort    = (int)($o['port'] ?? $default);

        $hostHeader = strtolower(trim((string)($_SERVER['HTTP_HOST'] ?? '')));
        $h = $hostHeader !== '' ? parse_url('//' . $hostHeader) : false;
        if (is_array($h) && !empty($h['host'])
            && strtolower(trim((string)$h['host'], '[]')) === $oHost
            && (int)($h['port'] ?? $default) === $oPort) {
            return false;
        }

        // An operator who pinned the public URL (CCRM_APP_URL) may sit behind a
        // proxy that rewrites Host; that pinned host is equally trusted.
        if (defined('CCRM_APP_URL') && is_string(CCRM_APP_URL) && CCRM_APP_URL !== '') {
            $a = parse_url(CCRM_APP_URL);
            if (is_array($a) && !empty($a['host'])) {
                $aDefault = strtolower((string)($a['scheme'] ?? 'http')) === 'https' ? 443 : 80;
                if (strtolower(trim((string)$a['host'], '[]')) === $oHost
                    && (int)($a['port'] ?? $aDefault) === $oPort) {
                    return false;
                }
            }
        }
        return true;
    }

    function ccrm_current_user(): ?array {
        ccrm_start_session();
        // A cross-origin write is never allowed to use the session cookie, and the
        // remember-me cookie is no different: check before it can rebuild a session.
        if (ccrm_is_cross_site_mutation()) {
            return null;
        }
        if (empty($_SESSION['ccrm_uid'])) {
            // No login in the PHP session (browser restarted, or the file was
            // collected): a remembered browser signs itself back in here.
            if (!ccrm_remember_restore()) {
                return null;
            }
        }

        // The role was copied into the session at login and never re-read, so a
        // demotion or a deleted account only took effect once the user happened to
        // log out — up to 30 days later with "remember me". Re-check periodically
        // against the database, which is the authority.
        $now = time();
        $lastCheck = (int)($_SESSION['ccrm_checked_at'] ?? 0);
        if ($now - $lastCheck >= CCRM_SESSION_REVALIDATE_SECONDS) {
            $pdo = ccrm_auth_pdo();
            if ($pdo !== null) {
                try {
                    // A password change (self-service reset or an admin setting a new
                    // one) stamps sessions_valid_from, which retires every session
                    // established before it. Without this, whoever prompted the reset
                    // by compromising the account kept their session afterwards.
                    //
                    // The comparison is done BY THE DATABASE against the session's
                    // stored issue time, which is itself a DB-clock value captured at
                    // login. Comparing a MySQL DATETIME against PHP's time() silently
                    // comes out wrong whenever the two disagree on timezone (PHP is
                    // pinned to Europe/Bratislava here, MySQL runs UTC), which is the
                    // same one-clock rule sync.php's baseSyncedAt already follows.
                    // A session with no recorded issue time (established before this
                    // field existed) counts as too old: a password change must never
                    // leave a session standing just because we cannot date it.
                    $issuedAt = $_SESSION['ccrm_issued_at'] ?? null;
                    $stmt = $pdo->prepare(
                        "SELECT `role`, `email`,
                                (`sessions_valid_from` IS NOT NULL
                                 AND (? IS NULL OR `sessions_valid_from` > ?)) AS `session_retired`
                           FROM `users` WHERE `id` = ? LIMIT 1"
                    );
                    $stmt->execute([$issuedAt, $issuedAt, $_SESSION['ccrm_uid']]);
                    $row = $stmt->fetch(\PDO::FETCH_ASSOC);

                    if (!$row) {
                        // Account deleted — the session must not outlive it.
                        ccrm_destroy_session($pdo);
                        return null;
                    }
                    if (!empty($row['session_retired'])) {
                        ccrm_destroy_session($pdo);
                        return null;
                    }

                    $_SESSION['ccrm_role']  = $row['role'];
                    $_SESSION['ccrm_email'] = $row['email'];
                    $_SESSION['ccrm_checked_at'] = $now;
                } catch (\Throwable $e) {
                    // Fail open on an infrastructure error rather than logging
                    // everyone out; the next request retries the check.
                    error_log('[ccrm auth] session revalidation failed: ' . $e->getMessage());
                }
            }
        }

        return [
            'id'    => $_SESSION['ccrm_uid'],
            'role'  => $_SESSION['ccrm_role'] ?? 'Viewer',
            'email' => $_SESSION['ccrm_email'] ?? '',
        ];
    }

    /**
     * Retire every session issued before now for a user — call after any password
     * change. Safe to call when the column is missing on an un-migrated database.
     * Remembered logins go too: they would otherwise sign the old password's
     * holder straight back in.
     */
    function ccrm_invalidate_user_sessions(\PDO $pdo, string $userId): void {
        try {
            $pdo->prepare("UPDATE `users` SET `sessions_valid_from` = NOW() WHERE `id` = ?")
                ->execute([$userId]);
        } catch (\Throwable $e) {
            error_log('[ccrm auth] could not invalidate sessions for ' . $userId . ': ' . $e->getMessage());
        }
        ccrm_remember_revoke_user($pdo, $userId);
    }

    /**
     * Require an authenticated session, else emit 401 and stop.
     */
    function ccrm_require_auth(): array {
        $user = ccrm_current_user();
        if ($user === null) {
            if (ccrm_is_cross_site_mutation()) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Cross-origin request blocked.']);
                exit;
            }
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Authentication required.']);
            exit;
        }
        return $user;
    }

    /**
     * Require an authenticated admin session, else emit 401/403 and stop.
     */
    function ccrm_require_admin(): array {
        $user = ccrm_require_auth();
        if (!ccrm_is_admin($user)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Administrator privileges required.']);
            exit;
        }
        return $user;
    }

    /**
     * True when the session (or user row) is the Admin role. Compared
     * case-insensitively on the trimmed name so a stored `admin` and a
     * registry `Admin` both count.
     */
    function ccrm_is_admin(?array $user): bool {
        return strtolower(trim((string)($user['role'] ?? ''))) === 'admin';
    }

    /**
     * Normalize a free-form role label for storage. Legacy enum values map to
     * their display names; any other trimmed name (capped at 100 chars) is kept
     * as given; empty becomes Viewer.
     */
    function ccrm_normalize_role(?string $role): string {
        $label = trim((string)$role);
        if ($label === '') {
            return 'Viewer';
        }
        $folded = strtolower(str_replace(' ', '_', $label));
        if ($folded === 'admin') return 'Admin';
        if ($folded === 'project_manager') return 'Project Manager';
        if ($folded === 'viewer') return 'Viewer';
        if (function_exists('mb_substr')) {
            return mb_substr($label, 0, 100);
        }
        return substr($label, 0, 100);
    }

    /**
     * Map a stored role back to the label the frontend expects. Same mapping
     * as ccrm_normalize_role (identity for any name that is not a legacy enum).
     */
    function ccrm_role_label(string $dbRole): string {
        return ccrm_normalize_role($dbRole);
    }

    /**
     * Resolve the fallback owner / project-manager name for records that are
     * created without an explicit owner (e.g. external webhook leads, or sync
     * payloads that omit an owner). Returns the primary administrator's name,
     * falling back to the first registered user, and finally to an empty
     * string. This deliberately avoids hardcoding any demo account name (such
     * as "Tomi"), which would otherwise be stamped onto real installations.
     */
    function ccrm_default_owner(\PDO $pdo): string {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        try {
            $stmt = $pdo->query(
                "SELECT `name` FROM `users` ORDER BY (LOWER(TRIM(`role`)) = 'admin') DESC, `name` ASC LIMIT 1"
            );
            $name = $stmt ? $stmt->fetchColumn() : false;
            $cached = ($name !== false && $name !== null) ? (string)$name : '';
        } catch (\Throwable $e) {
            $cached = '';
        }
        return $cached;
    }

    /**
     * Normalize a lead auto-assignment config blob to its canonical shape.
     *
     *   mode   'off'      — no auto-assignment (the historical behaviour)
     *          'selected' — the pool is `users`, in the order the admin listed
     *          'all'      — the pool is every registered user, ordered by name
     *   users  ordered pool for mode 'selected'
     *   rotate always true — one lead has one assignee; several people in the
     *          pool take turns. Kept on the blob so the stored shape stays
     *          stable across clients.
     *
     * Applied to both the stored value and anything a client pushes, so a
     * malformed blob can never reach the assignment logic.
     */
    function ccrm_normalize_lead_assignment($cfg): array {
        if (!is_array($cfg)) {
            $cfg = [];
        }
        $mode = $cfg['mode'] ?? 'off';
        if (!in_array($mode, ['off', 'selected', 'all'], true)) {
            $mode = 'off';
        }
        $users = [];
        if (isset($cfg['users']) && is_array($cfg['users'])) {
            foreach ($cfg['users'] as $u) {
                $u = trim((string)$u);
                if ($u !== '' && !in_array($u, $users, true)) {
                    $users[] = $u;
                }
            }
        }
        return [
            'mode'   => $mode,
            'users'  => $users,
            'rotate' => true,
        ];
    }

    /** The stored lead auto-assignment config, normalized. Cached per request. */
    function ccrm_lead_assignment_config(\PDO $pdo): array {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        $raw = false;
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'LEAD_ASSIGNMENT'");
            $stmt->execute();
            $raw = $stmt->fetchColumn();
        } catch (\Throwable $e) {
            $raw = false;
        }
        $decoded = ($raw !== false && $raw !== null && $raw !== '') ? json_decode((string)$raw, true) : null;
        $cached = ccrm_normalize_lead_assignment($decoded);
        return $cached;
    }

    /**
     * The ordered list of users new leads are handed out to. Empty when
     * auto-assignment is off, or when nothing in the configured selection
     * matches a user who still exists — a deleted colleague silently drops out
     * of the rotation instead of stranding leads on a name nobody answers to.
     */
    function ccrm_lead_assignment_pool(\PDO $pdo): array {
        $cfg = ccrm_lead_assignment_config($pdo);
        if ($cfg['mode'] === 'off') {
            return [];
        }
        try {
            $stmt = $pdo->query("SELECT `name` FROM `users` ORDER BY `name` ASC");
            $names = $stmt ? $stmt->fetchAll(\PDO::FETCH_COLUMN) : [];
        } catch (\Throwable $e) {
            return [];
        }
        $all = [];
        foreach ($names as $n) {
            $n = trim((string)$n);
            if ($n !== '') {
                $all[] = $n;
            }
        }
        if ($cfg['mode'] === 'all') {
            return $all;
        }
        // 'selected': keep the admin's chosen order, drop names that no longer exist.
        $byLower = [];
        foreach ($all as $n) {
            $byLower[mb_strtolower($n)] = $n;
        }
        $pool = [];
        foreach ($cfg['users'] as $u) {
            $key = mb_strtolower($u);
            if (isset($byLower[$key])) {
                $pool[] = $byLower[$key];
            }
        }
        return $pool;
    }

    /**
     * Pick the owner for a brand-new lead that arrived without one.
     *
     * Returns '' when auto-assignment is not configured, so every caller keeps
     * whatever fallback it had before rather than silently gaining one.
     *
     * The round-robin cursor stores the NAME handed out last, not an index: an
     * index would quietly point at a different person the moment the pool is
     * reordered or a colleague leaves. It is server-owned — clients never push
     * it — and is written inside the caller's transaction, so a sync that rolls
     * back does not burn a slot in the rotation.
     */
    function ccrm_auto_assign_owner(\PDO $pdo): string {
        $pool = ccrm_lead_assignment_pool($pdo);
        if (!$pool) {
            return '';
        }

        // Read the cursor once per request, then keep advancing it in memory so a
        // sync carrying several new leads spreads them instead of handing every
        // one of them to the same person.
        static $cursor = null;
        if ($cursor === null) {
            $cursor = '';
            try {
                $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'LEAD_ASSIGNMENT_CURSOR'");
                $stmt->execute();
                $stored = $stmt->fetchColumn();
                if ($stored !== false && $stored !== null) {
                    $cursor = (string)$stored;
                }
            } catch (\Throwable $e) {
                // No cursor readable — start at the top of the pool.
            }
        }

        $idx = -1;
        foreach ($pool as $i => $name) {
            if (mb_strtolower($name) === mb_strtolower($cursor)) {
                $idx = $i;
                break;
            }
        }
        $next = $pool[($idx + 1) % count($pool)];
        $cursor = $next;

        try {
            $pdo->prepare(
                "INSERT INTO `system_settings` (`key`, `value`) VALUES ('LEAD_ASSIGNMENT_CURSOR', ?)
                 ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)"
            )->execute([$next]);
        } catch (\Throwable $e) {
            // The in-memory cursor still advances for the rest of this request.
        }

        return $next;
    }

    /**
     * The five statuses every installation starts with, before anyone opens the
     * editor in Settings → Project settings. Mirrors DEFAULT_PROJECT_STATUS_DEFS
     * in src/utils/projects.ts.
     *
     * A function rather than a `const`: this whole block is inside a
     * function_exists() guard, and PHP refuses to declare a top-level const in a
     * conditional block.
     */
    function ccrm_default_project_status_defs(): array {
        return [
            ['key' => 'new', 'color' => '#0ea5e9', 'group' => 'new'],
            ['key' => 'active', 'color' => '#a855f7', 'group' => 'in_progress'],
            ['key' => 'on_hold', 'color' => '#f59e0b', 'group' => 'in_progress'],
            ['key' => 'completed', 'color' => '#10b981', 'group' => 'completed'],
            ['key' => 'cancelled', 'color' => '#f43f5e', 'group' => 'cancelled'],
        ];
    }

    /**
     * A stored project-status list, cleaned up the same way
     * normalizeProjectStatusDefs() does it in src/utils/projects.ts: unique
     * non-empty keys, a known group, a hex colour, kept in group order — and the
     * built-ins whenever the list is unreadable or has no open status left for a
     * new project to start in.
     */
    function ccrm_normalize_project_statuses($raw): array {
        $groups = ['new', 'in_progress', 'completed', 'cancelled'];
        $defaults = ccrm_default_project_status_defs();
        if (!is_array($raw)) {
            return $defaults;
        }
        $builtins = [];
        foreach ($defaults as $d) {
            $builtins[$d['key']] = $d;
        }
        $seen = [];
        $out = [];
        foreach ($raw as $item) {
            if (!is_array($item)) continue;
            $key = trim((string)($item['key'] ?? ''));
            if ($key === '' || mb_strlen($key) > 50 || isset($seen[$key])) continue;
            $seen[$key] = true;
            $builtin = $builtins[$key] ?? null;
            $color = (string)($item['color'] ?? '');
            $color = preg_match('/^#[0-9a-f]{6}$/i', $color) ? strtolower($color) : ($builtin['color'] ?? '#6366f1');
            $group = in_array($item['group'] ?? null, $groups, true) ? $item['group'] : ($builtin['group'] ?? 'in_progress');
            $label = trim((string)($item['label'] ?? ''));
            $def = ['key' => $key];
            if ($label !== '') $def['label'] = $label;
            $def['color'] = $color;
            $def['group'] = $group;
            $out[] = $def;
        }
        $hasOpen = false;
        foreach ($out as $d) {
            if ($d['group'] === 'new' || $d['group'] === 'in_progress') { $hasOpen = true; break; }
        }
        if (!$hasOpen) {
            return $defaults;
        }
        $ordered = [];
        foreach ($groups as $g) {
            foreach ($out as $d) {
                if ($d['group'] === $g) $ordered[] = $d;
            }
        }
        return $ordered;
    }

    /** The configured project statuses, read once per request. */
    function ccrm_project_status_defs(?\PDO $pdo = null): array {
        static $cached = null;
        if ($pdo === null) {
            return $cached ?? ccrm_default_project_status_defs();
        }
        if ($cached !== null) {
            return $cached;
        }
        $raw = false;
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'PROJECT_STATUSES'");
            $stmt->execute();
            $raw = $stmt->fetchColumn();
        } catch (\Throwable $e) {
            $raw = false;
        }
        $decoded = ($raw !== false && $raw !== null && $raw !== '') ? json_decode((string)$raw, true) : null;
        $cached = ccrm_normalize_project_statuses($decoded);
        return $cached;
    }

    /**
     * The status keys a project may be in, in the order the UI offers them —
     * anything else reaching the `projects` table (from a workflow action, say)
     * would render as a raw string on a card nothing can filter by. Pass the
     * connection to get the list configured in settings; without it, the
     * built-ins (or whatever this request already read).
     */
    function ccrm_project_statuses(?\PDO $pdo = null): array {
        return array_column(ccrm_project_status_defs($pdo), 'key');
    }

    /** Where a new project starts: the first status of the "new" group, else the first open one. */
    function ccrm_default_project_status(?\PDO $pdo = null): string {
        $defs = ccrm_project_status_defs($pdo);
        foreach ($defs as $d) {
            if ($d['group'] === 'new') return $d['key'];
        }
        foreach ($defs as $d) {
            if ($d['group'] === 'in_progress') return $d['key'];
        }
        return $defs[0]['key'] ?? 'new';
    }

    /** The group a status key belongs to, or null for one the list does not know. */
    function ccrm_project_status_group(string $status, ?\PDO $pdo = null): ?string {
        foreach (ccrm_project_status_defs($pdo) as $d) {
            if ($d['key'] === $status) return $d['group'];
        }
        return null;
    }

    /**
     * The statuses every installation starts with for a price offer, before
     * anyone opens Price offers → Settings → Offer statuses. Mirrors
     * DEFAULT_OFFER_STATUS_DEFS in src/utils/offerStatuses.ts. `invoiced` is
     * legacy: kept so offers that carry it keep their meaning (won), but it is
     * no longer offered as a choice.
     */
    function ccrm_default_offer_status_defs(): array {
        return [
            ['key' => 'draft', 'color' => '#64748b', 'group' => 'draft'],
            ['key' => 'sent', 'color' => '#3b82f6', 'group' => 'open'],
            ['key' => 'approved', 'color' => '#10b981', 'group' => 'won'],
            ['key' => 'invoiced', 'color' => '#10b981', 'group' => 'won', 'legacy' => true],
            ['key' => 'rejected', 'color' => '#f43f5e', 'group' => 'lost'],
            ['key' => 'cancelled', 'color' => '#f43f5e', 'group' => 'cancelled'],
        ];
    }

    /**
     * The statuses every installation starts with for a proforma or an invoice
     * (they share one list). Mirrors DEFAULT_INVOICE_STATUS_DEFS in
     * src/utils/offerStatuses.ts. Unlike for an offer, `invoiced` is a real,
     * selectable status here (it is what a paid order's invoice starts in).
     */
    function ccrm_default_invoice_status_defs(): array {
        return [
            ['key' => 'draft', 'color' => '#64748b', 'group' => 'draft'],
            ['key' => 'sent', 'color' => '#3b82f6', 'group' => 'open'],
            ['key' => 'invoiced', 'color' => '#10b981', 'group' => 'won'],
            ['key' => 'approved', 'color' => '#10b981', 'group' => 'won'],
            ['key' => 'rejected', 'color' => '#f43f5e', 'group' => 'lost'],
            ['key' => 'cancelled', 'color' => '#f43f5e', 'group' => 'cancelled'],
        ];
    }

    /**
     * The JSON to store for a settings list or map the client sent, or null (keep
     * what is stored) when it did not send one. Saving settings must never empty a
     * list just because the request left it out: a script, an old browser tab or an
     * API client posting `settings` without `leadStates` used to wipe the pipeline
     * stages, which hides every lead. `$allowEmpty` false also refuses an empty
     * list, for the lists nothing can work without (stages, task states).
     */
    function ccrm_settings_list_value(array $s, string $key, bool $allowEmpty): ?string {
        if (!array_key_exists($key, $s) || !is_array($s[$key])) return null;
        if (!$allowEmpty && count($s[$key]) === 0) return null;
        return json_encode($s[$key]);
    }

    /**
     * A stored status list (offers, or proformas and invoices), cleaned up the same
     * way normalizeOfferStatusDefs() does it in src/utils/offerStatuses.ts: unique
     * non-empty keys, a known group, a hex colour, kept in group order — and the
     * built-ins (`$defaults`, the offer ones unless given) whenever the list is
     * unreadable or has no (non-legacy) draft status for a new document to start in.
     */
    function ccrm_normalize_offer_statuses($raw, ?array $defaults = null): array {
        $groups = ['draft', 'open', 'won', 'lost', 'cancelled'];
        $defaults = $defaults ?? ccrm_default_offer_status_defs();
        if (!is_array($raw)) {
            return $defaults;
        }
        $builtins = [];
        foreach ($defaults as $d) {
            $builtins[$d['key']] = $d;
        }
        $seen = [];
        $out = [];
        foreach ($raw as $item) {
            if (!is_array($item)) continue;
            $key = trim((string)($item['key'] ?? ''));
            if ($key === '' || mb_strlen($key) > 50 || isset($seen[$key])) continue;
            $seen[$key] = true;
            $builtin = $builtins[$key] ?? null;
            $color = (string)($item['color'] ?? '');
            $color = preg_match('/^#[0-9a-f]{6}$/i', $color) ? strtolower($color) : ($builtin['color'] ?? '#6366f1');
            $group = in_array($item['group'] ?? null, $groups, true) ? $item['group'] : ($builtin['group'] ?? 'open');
            $label = trim((string)($item['label'] ?? ''));
            $def = ['key' => $key];
            if ($label !== '') $def['label'] = $label;
            $def['color'] = $color;
            $def['group'] = $group;
            if (($item['legacy'] ?? null) === true || !empty($builtin['legacy'])) $def['legacy'] = true;
            $out[] = $def;
        }
        $hasDraft = false;
        foreach ($out as $d) {
            if ($d['group'] === 'draft' && empty($d['legacy'])) { $hasDraft = true; break; }
        }
        if (!$hasDraft) {
            return $defaults;
        }
        $ordered = [];
        foreach ($groups as $g) {
            foreach ($out as $d) {
                if ($d['group'] === $g) $ordered[] = $d;
            }
        }
        return $ordered;
    }

    /** The configured price-offer statuses, read once per request. */
    function ccrm_offer_status_defs(?\PDO $pdo = null): array {
        static $cached = null;
        if ($pdo === null) {
            return $cached ?? ccrm_default_offer_status_defs();
        }
        if ($cached !== null) {
            return $cached;
        }
        $raw = false;
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'OFFER_STATUSES'");
            $stmt->execute();
            $raw = $stmt->fetchColumn();
        } catch (\Throwable $e) {
            $raw = false;
        }
        $decoded = ($raw !== false && $raw !== null && $raw !== '') ? json_decode((string)$raw, true) : null;
        $cached = ccrm_normalize_offer_statuses($decoded);
        return $cached;
    }

    /** The stored proforma / invoice statuses (Price offers → Settings), read once per request. */
    function ccrm_invoice_status_defs(?\PDO $pdo = null): array {
        static $cached = null;
        if ($pdo === null) {
            return $cached ?? ccrm_default_invoice_status_defs();
        }
        if ($cached !== null) {
            return $cached;
        }
        $raw = false;
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INVOICE_STATUSES'");
            $stmt->execute();
            $raw = $stmt->fetchColumn();
        } catch (\Throwable $e) {
            $raw = false;
        }
        $decoded = ($raw !== false && $raw !== null && $raw !== '') ? json_decode((string)$raw, true) : null;
        $cached = ccrm_normalize_offer_statuses($decoded, ccrm_default_invoice_status_defs());
        return $cached;
    }

    /** The group a proforma / invoice status belongs to, or null for a key the list does not know. */
    function ccrm_invoice_status_group(string $status, ?\PDO $pdo = null): ?string {
        foreach (ccrm_invoice_status_defs($pdo) as $d) {
            if ($d['key'] === $status) return $d['group'];
        }
        return null;
    }

    /** The group a price-offer status belongs to, or null for a key the list does not know. */
    function ccrm_offer_status_group(string $status, ?\PDO $pdo = null): ?string {
        foreach (ccrm_offer_status_defs($pdo) as $d) {
            if ($d['key'] === $status) return $d['group'];
        }
        return null;
    }

    /** The first (non-legacy) status of a group, e.g. what an automatic "approve" sets. */
    function ccrm_offer_status_in_group(string $group, ?\PDO $pdo = null): ?string {
        $fallback = null;
        foreach (ccrm_offer_status_defs($pdo) as $d) {
            if ($d['group'] !== $group) continue;
            if (empty($d['legacy'])) return $d['key'];
            $fallback = $fallback ?? $d['key'];
        }
        return $fallback;
    }

    /**
     * The company's default VAT rate (Settings → Billing): what a line or a finance
     * record starts with when nothing says otherwise. Mirrors getDefaultVatRate() in
     * src/utils/vat.ts, so 23 (the app's standard rate) until one is set. Read once per request.
     */
    function ccrm_default_vat_rate(?\PDO $pdo): float {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        $cached = 23.0;
        if ($pdo !== null) {
            try {
                $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'COMPANY_BILLING_SETTINGS'");
                $stmt->execute();
                $settings = json_decode((string)$stmt->fetchColumn(), true);
                $rate = is_array($settings) ? ($settings['defaultVatRate'] ?? null) : null;
                // 0 % is a real choice (a company that is not a VAT payer), so only a missing or out-of-range value falls back.
                if (is_numeric($rate) && $rate >= 0 && $rate <= 100) {
                    $cached = round((float)$rate, 2);
                }
            } catch (\Throwable $e) {
                // keep the standard rate
            }
        }
        return $cached;
    }

    /**
     * A stored price-level list (Settings → Price levels), cleaned up the same way
     * normalizePriceLevels() does it in src/utils/warehousePricing.ts: unique
     * non-empty ids, a trimmed non-empty name (unique ignoring case). Unreadable
     * input is an empty list — an installation that never opened the editor has no levels.
     */
    function ccrm_normalize_price_levels($raw): array {
        if (!is_array($raw)) return [];
        $ids = [];
        $names = [];
        $out = [];
        foreach ($raw as $item) {
            if (!is_array($item)) continue;
            $id = trim((string)($item['id'] ?? ''));
            $name = mb_substr(trim((string)($item['name'] ?? '')), 0, 60);
            $nameKey = mb_strtolower($name);
            if ($id === '' || mb_strlen($id) > 50 || $name === '' || isset($ids[$id]) || isset($names[$nameKey])) continue;
            $ids[$id] = true;
            $names[$nameKey] = true;
            $out[] = ['id' => $id, 'name' => $name];
        }
        return $out;
    }

    /** The configured price levels, read once per request. */
    function ccrm_price_levels(?\PDO $pdo = null): array {
        static $cached = null;
        if ($pdo === null) {
            return $cached ?? [];
        }
        if ($cached !== null) {
            return $cached;
        }
        $raw = false;
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'PRICE_LEVELS'");
            $stmt->execute();
            $raw = $stmt->fetchColumn();
        } catch (\Throwable $e) {
            $raw = false;
        }
        $decoded = ($raw !== false && $raw !== null && $raw !== '') ? json_decode((string)$raw, true) : null;
        $cached = ccrm_normalize_price_levels($decoded);
        return $cached;
    }

    /**
     * The unit sell price of an item for a customer on `$levelId`: that level's
     * price when the level still exists and the item has a positive price on it,
     * else the item's default sell price. Mirrors resolveSellPrice() in
     * src/utils/warehousePricing.ts. `$levelPrices` is [level id => price].
     */
    function ccrm_resolve_sell_price(float $defaultSellPrice, array $levelPrices, ?string $levelId, array $levels): float {
        if ($levelId !== null && $levelId !== '') {
            foreach ($levels as $l) {
                if ($l['id'] === $levelId) {
                    $price = (float)($levelPrices[$levelId] ?? 0);
                    if ($price > 0) return $price;
                    break;
                }
            }
        }
        return $defaultSellPrice;
    }

    /**
     * Normalize an automatic-project-creation config blob to its canonical shape.
     *
     *   enabled        false — no project is created (the historical behaviour)
     *   projectTypeId  the type a lead no category rule matched is given
     *   categoryTypes  interest category name -> the type a lead in it is given
     *   assignOwner    put the lead's project manager on the project
     *
     * Applied to both the stored value and anything a client pushes, so a
     * malformed blob can never reach the creation logic.
     */
    function ccrm_normalize_project_auto_create($cfg): array {
        if (!is_array($cfg)) {
            $cfg = [];
        }

        // Category -> project type, keeping only entries with both halves.
        // Sorted because the client folds this blob into its settings
        // signature as JSON: the same map with its keys in another order
        // would read as a change and push settings forever. See
        // normalizeProjectAutoCreate in src/utils/projectAutoCreate.ts, which
        // sorts identically.
        $categoryTypes = [];
        $rawMap = $cfg['categoryTypes'] ?? null;
        if (is_array($rawMap)) {
            foreach ($rawMap as $name => $typeId) {
                $name = trim((string)$name);
                $typeId = is_string($typeId) ? trim($typeId) : '';
                if ($name !== '' && $typeId !== '') {
                    $categoryTypes[$name] = $typeId;
                }
            }
            ksort($categoryTypes);
        }

        return [
            'enabled' => ($cfg['enabled'] ?? false) === true,
            'projectTypeId' => trim((string)($cfg['projectTypeId'] ?? '')),
            // Left as a PHP array: an empty one encodes as [] rather than {},
            // which normalizeProjectAutoCreate() on the client already reads
            // as "no entries".
            'categoryTypes' => $categoryTypes,
            // Assigning the lead's manager is the useful default; only an
            // explicit false turns it off.
            'assignOwner' => !array_key_exists('assignOwner', $cfg) || (bool)$cfg['assignOwner'],
        ];
    }

    /**
     * Settings → Tasks, normalized. Mirrors normalizeTaskSettings in
     * src/utils/taskConclusion.ts: the client compares this blob against its own
     * to decide whether settings changed, so both sides have to agree on what a
     * malformed value means.
     *
     *   offerConclusion           true — the "Requires conclusion" checkbox is offered
     *                             when a task is created (on by default)
     *   defaultRequiresConclusion true — the checkbox is checked by default on new tasks
     */
    function ccrm_normalize_task_settings($cfg): array {
        if (!is_array($cfg)) {
            $cfg = [];
        }
        return [
            'offerConclusion'           => !array_key_exists('offerConclusion', $cfg) || (bool)$cfg['offerConclusion'],
            'defaultRequiresConclusion' => ($cfg['defaultRequiresConclusion'] ?? false) === true,
        ];
    }

    /**
     * Per-phase SLA limits, normalized: lowercased state name -> whole positive
     * days. Mirrors normalizeLeadStateSla in src/utils/leadSla.ts, key sorting
     * included — the client compares this blob against its own to decide whether
     * settings actually changed, and two spellings of the same map would make it
     * push settings forever.
     */
    function ccrm_normalize_lead_state_sla($map): array {
        if (!is_array($map)) {
            return [];
        }
        $out = [];
        foreach ($map as $state => $days) {
            $key = strtolower(trim((string)$state));
            $n = (int)$days;
            if ($key === '' || $n <= 0) {
                continue;
            }
            $out[$key] = min($n, 3650);
        }
        ksort($out);
        return $out;
    }

    /** The stored automatic-project-creation config, normalized. Cached per request. */
    function ccrm_project_auto_create_config(\PDO $pdo): array {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        $raw = false;
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'PROJECT_AUTO_CREATE'");
            $stmt->execute();
            $raw = $stmt->fetchColumn();
        } catch (\Throwable $e) {
            $raw = false;
        }
        $decoded = ($raw !== false && $raw !== null && $raw !== '') ? json_decode((string)$raw, true) : null;
        $cached = ccrm_normalize_project_auto_create($decoded);
        return $cached;
    }

    /**
     * The interest categories a lead carries, as stored.
     *
     * Only reached when a caller has none to hand: sync.php writes
     * `lead_categories` after the lead row, so it passes its own list instead
     * of asking for one that is not there yet.
     */
    function ccrm_lead_category_names(\PDO $pdo, string $leadId): array {
        try {
            $stmt = $pdo->prepare("SELECT `category_name` FROM `lead_categories` WHERE `lead_id` = ?");
            $stmt->execute([$leadId]);
            $names = [];
            foreach ($stmt->fetchAll(\PDO::FETCH_COLUMN) as $name) {
                $name = trim((string)$name);
                if ($name !== '') {
                    $names[] = $name;
                }
            }
            return $names;
        } catch (\Throwable $e) {
            return [];
        }
    }

    /**
     * The project types a lead carrying $categories should be given a project
     * of — one per mapped category, in the order the lead lists them, never
     * the same type twice.
     *
     * A lead whose categories are empty, or map to nothing, falls back to the
     * single configured type; when that is empty too, it gets nothing.
     *
     * Mirrors autoCreateTypeIdsForLead() in src/utils/projectAutoCreate.ts,
     * which is what the settings card uses to say what will happen.
     */
    function ccrm_auto_create_project_type_ids(array $cfg, array $categories): array {
        // Category names reach us from a lead row, which may have been written
        // when the category was spelled differently; matching without regard to
        // case costs nothing and saves a silently unmatched lead. mbstring is
        // not guaranteed on every host, and without it a name with diacritics
        // simply has to match exactly.
        $fold = function ($value): string {
            $value = trim((string)$value);
            return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
        };

        $byLowerName = [];
        foreach (((array)($cfg['categoryTypes'] ?? [])) as $name => $typeId) {
            $key = $fold($name);
            if ($key !== '' && is_string($typeId) && trim($typeId) !== '') {
                $byLowerName[$key] = trim($typeId);
            }
        }

        $ids = [];
        foreach ($categories as $name) {
            $key = $fold($name);
            if ($key !== '' && isset($byLowerName[$key]) && !in_array($byLowerName[$key], $ids, true)) {
                $ids[] = $byLowerName[$key];
            }
        }

        if ($ids) {
            return $ids;
        }
        $fallback = trim((string)($cfg['projectTypeId'] ?? ''));
        return $fallback !== '' ? [$fallback] : [];
    }

    /**
     * Create the projects a brand-new lead is paired with, if the operator
     * asked for any (Projects → Settings → automatic project creation).
     *
     * Which types those are depends on the lead's interest categories: each
     * mapped category contributes one project, and a lead that matches none
     * falls back to the single configured type. $categories may be passed in by
     * a caller that has not written `lead_categories` yet (sync.php); leave it
     * null to read what is stored.
     *
     * Returns the created projects in the shape the client holds them in — an
     * empty list when nothing was created, because the feature is off, no type
     * applies, the configured types have since been deleted, or this lead
     * already has a project of every type it would get.
     *
     * Made server-side, and from one function, for the same reasons as
     * ccrm_auto_assign_owner(): it has to cover leads that never pass through
     * the app at all (the public web-form webhook, workflow create_lead
     * actions), and two devices syncing the same new lead must not each produce
     * their own project for it.
     *
     * Creation skips any type this lead already has a project of. That makes
     * the call idempotent, so a retried sync — or a lead re-pushed by an older
     * client that thinks it is new — cannot pile up duplicates.
     *
     * PROJECT-AUTO-CREATE-DISABLED (v1.9.29): nothing calls this any more —
     * the calls in sync.php, api/pipeline.php and api/workflows_engine.php are
     * commented out, and the settings card is hidden. Kept intact for rollback.
     */
    function ccrm_auto_create_project_for_lead(\PDO $pdo, string $leadId, string $ownerName = '', ?array $categories = null): array {
        $cfg = ccrm_project_auto_create_config($pdo);
        if (!$cfg['enabled'] || $leadId === '') {
            return [];
        }

        $created = [];
        try {
            $names = $categories === null ? ccrm_lead_category_names($pdo, $leadId) : $categories;
            $typeIds = ccrm_auto_create_project_type_ids($cfg, $names);
            if (!$typeIds) {
                return [];
            }

            $typeStmt = $pdo->prepare("SELECT `id` FROM `project_types` WHERE `id` = ?");
            $existing = $pdo->prepare("SELECT `id` FROM `projects` WHERE `lead_id` = ? AND `project_type_id` = ? LIMIT 1");
            // Every project starts in the first status of the "new" group,
            // however it was created. Nothing promotes it: which lead status
            // makes a project active differs per installation, so that belongs
            // in a workflow ("Lead status changed" -> "Change project status"),
            // not in this insert.
            $startStatus = ccrm_default_project_status($pdo);
            $insProject = $pdo->prepare(
                "INSERT INTO `projects` (`id`, `project_type_id`, `lead_id`, `client_id`, `status`)
                 VALUES (?, ?, ?, ?, ?)"
            );
            $insManager = $pdo->prepare("INSERT IGNORE INTO `project_managers` (`project_id`, `user_id`) VALUES (?, ?)");
            $ownerName = trim($ownerName);

            foreach ($typeIds as $typeId) {
                // A configured type may have been deleted since it was chosen.
                // Creating against a missing type would violate the projects ->
                // project_types foreign key and abort the whole sync transaction.
                $typeStmt->execute([$typeId]);
                if ($typeStmt->fetchColumn() === false) {
                    continue;
                }

                $existing->execute([$leadId, $typeId]);
                if ($existing->fetchColumn() !== false) {
                    continue;
                }

                $projectId = 'proj-' . sprintf('%04x%04x', mt_rand(0, 0xffff), mt_rand(0, 0xffff));
                $insProject->execute([$projectId, $typeId, $leadId, $leadId, $startStatus]);

                $managers = [];
                if ($cfg['assignOwner'] && $ownerName !== '') {
                    $insManager->execute([$projectId, $ownerName]);
                    $managers[] = $ownerName;
                }

                // The per-type attribute row. Optional — sync.php's GET falls back to
                // empty data when it is missing — so a type whose table has not been
                // built yet must not take the project down with it.
                try {
                    $dataTable = 'proj_data_' . preg_replace('/[^a-z0-9_]/', '', strtolower($typeId));
                    if ($pdo->query("SHOW TABLES LIKE " . $pdo->quote($dataTable))->rowCount() > 0) {
                        $pdo->prepare("INSERT IGNORE INTO `{$dataTable}` (`id`, `project_id`) VALUES (?, ?)")
                            ->execute([$projectId, $projectId]);
                    }
                } catch (\Throwable $e) {
                    // Attributes stay empty; the project itself is already saved.
                }

                $created[] = [
                    'id' => $projectId,
                    'projectTypeId' => $typeId,
                    // No name and no dates: an auto-created project reads as its
                    // paired lead until someone names it (projectDisplayName), and
                    // only its manager knows when it is actually due.
                    'name' => '',
                    'invoiceDate' => null,
                    'leadId' => $leadId,
                    'clientId' => $leadId,
                    'status' => 'new',
                    'managers' => $managers,
                    'data' => (object)[],
                    'timeline' => [],
                    'gantt' => [],
                ];
            }
        } catch (\Throwable $e) {
            // A lead is worth more than the projects that would have accompanied
            // it: never let this take down the insert that triggered it. Whatever
            // was created before the failure is real, so it is still returned.
            return $created;
        }

        return $created;
    }

    /** True if the given string already looks like a bcrypt/argon hash. */
    function ccrm_is_hash(string $value): bool {
        return (bool)preg_match('/^\$(2[aby]|argon2(id|i|d))\$/', $value);
    }

    /**
     * Produce a storable password hash for an incoming value.
     * Already-hashed values are passed through unchanged.
     */
    function ccrm_hash_password(string $plain): string {
        return ccrm_is_hash($plain) ? $plain : password_hash($plain, PASSWORD_DEFAULT);
    }

    /**
     * Extensions that must never be written into the web-served uploads/ folder.
     *
     * uploads/ sits inside the document root, so a file the server is willing to
     * execute there is remote code execution for anyone who can reach an upload
     * endpoint. Every write path (browser upload, meeting audio, saved IMAP
     * attachment) funnels through ccrm_safe_upload_name() below rather than
     * keeping its own divergent list.
     */
    function ccrm_blocked_upload_extensions(): array {
        return [
            'php', 'phtml', 'php3', 'php4', 'php5', 'php6', 'php7', 'php8', 'phps',
            'pht', 'phar', 'inc', 'cgi', 'pl', 'py', 'rb', 'asp', 'aspx', 'jsp',
            'jspx', 'sh', 'bash', 'shtml', 'htaccess', 'htpasswd', 'ini', 'svg',
            'xhtml', 'hta',
        ];
    }

    /**
     * Turn a caller-supplied filename into one that is always safe to write into
     * uploads/, or return null when it cannot be made safe.
     *
     * Rejects on EVERY extension present, not just the last one: `shell.php.jpg`
     * is executed as PHP by any Apache that still has the legacy multi-extension
     * AddHandler behaviour, so trusting `pathinfo(..., EXTENSION)` alone is not
     * enough. Also strips directory components and NUL bytes so the result can
     * never escape the uploads root.
     */
    function ccrm_safe_upload_name(string $name): ?string {
        // Kill NUL bytes and any path component before anything else.
        $name = str_replace("\0", '', $name);
        $name = str_replace('\\', '/', $name);
        $name = basename($name);
        // Leading dots would produce hidden files such as `.htaccess`.
        $name = ltrim($name, '.');
        if ($name === '' || $name === '.' || $name === '..') {
            return null;
        }
        // Collapse anything outside a conservative charset so the stored name can
        // never carry shell/URL metacharacters into later processing.
        $name = preg_replace('/[^A-Za-z0-9._\- ]+/', '_', $name);
        if (!is_string($name) || $name === '') {
            return null;
        }
        $blocked = ccrm_blocked_upload_extensions();
        foreach (explode('.', $name) as $i => $segment) {
            if ($i === 0) {
                continue; // the base name, not an extension
            }
            if (in_array(strtolower($segment), $blocked, true)) {
                return null;
            }
        }
        // Keep well clear of filesystem name limits once the event-id prefix is added.
        if (strlen($name) > 180) {
            $ext = pathinfo($name, PATHINFO_EXTENSION);
            $name = substr($name, 0, 180 - strlen($ext) - 1) . ($ext !== '' ? '.' . $ext : '');
        }
        return $name;
    }

    /**
     * Cheap sanity check that a file just written into uploads/ really is the
     * format its name claims.
     *
     * Only the head of the file is read, and only formats with an unambiguous
     * magic number are judged. The point is to catch bytes that were truncated
     * mid-transfer or never decoded at all: those store without complaint and
     * only surface much later, when the preview pane shows the browser's black
     * "could not load document" pane instead of the document.
     */
    function ccrm_stored_file_matches_extension(string $path, string $fileName): bool {
        $signatures = [
            'pdf'  => ['%PDF-'],
            'png'  => ["\x89PNG\r\n\x1a\n"],
            'jpg'  => ["\xFF\xD8\xFF"],
            'jpeg' => ["\xFF\xD8\xFF"],
            'gif'  => ['GIF87a', 'GIF89a'],
            'zip'  => ["PK\x03\x04"],
            'docx' => ["PK\x03\x04"],
            'xlsx' => ["PK\x03\x04"],
            'pptx' => ["PK\x03\x04"],
        ];
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        if (!isset($signatures[$ext])) {
            return true; // nothing reliable to check against
        }
        $head = @file_get_contents($path, false, null, 0, 1024);
        if ($head === false || $head === '') {
            return false;
        }
        $matched = false;
        foreach ($signatures[$ext] as $signature) {
            // Searched rather than anchored at byte 0: a PDF header may legally sit
            // a little way into the file, and being permissive here only ever means
            // accepting a file we could not disprove.
            if (strpos($head, $signature) !== false) {
                $matched = true;
                break;
            }
        }
        if (!$matched) {
            return false;
        }

        // A PDF that lost its tail still carries a valid header, so the signature
        // alone cannot tell a whole document from a half-transferred one — and a
        // half-transferred one is precisely what renders as a black pane. Every
        // PDF ends with %%EOF, which the spec puts in the last 1024 bytes.
        if ($ext === 'pdf') {
            $size = @filesize($path);
            if ($size === false || $size < 32) {
                return false;
            }
            $tailLength = min($size, 4096);
            $tail = @file_get_contents($path, false, null, $size - $tailLength, $tailLength);
            return is_string($tail) && strpos($tail, '%%EOF') !== false;
        }

        return true;
    }

    /**
     * First line of the generated uploads/.htaccess.
     *
     * BUMP THE VERSION whenever ccrm_uploads_guard_contents() changes: an instance
     * that already has a guard file only replaces it when this marker is missing
     * from it. Without that, a fix to the guard would never reach the instances
     * that need it, because uploads/ is gitignored and the file was already there.
     */
    function ccrm_uploads_guard_marker(): string {
        return '# Generated by CCRM — do not remove. Guard version: 2';
    }

    /**
     * Absolute path to uploads/, created on demand and hardened so the web server
     * refuses to execute anything inside it.
     *
     * The repo-root .htaccess carries the same rule, but uploads/ is gitignored on
     * every instance and operators do move the docroot, so the guard is written
     * next to the data as well. Returns the path WITH a trailing slash.
     */
    function ccrm_uploads_dir(): string {
        $dir = dirname(__DIR__) . '/uploads/';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        if (is_dir($dir)) {
            $guard = $dir . '.htaccess';
            $existing = @file_get_contents($guard);
            if ($existing === false || strpos($existing, ccrm_uploads_guard_marker()) === false) {
                @file_put_contents($guard, ccrm_uploads_guard_contents());
            }
        }
        return $dir;
    }

    /**
     * The guard that makes uploads/ inert. See ccrm_uploads_guard_marker().
     */
    function ccrm_uploads_guard_contents(): string {
        return ccrm_uploads_guard_marker() . "\n" . <<<'HTACCESS'
# uploads/ holds attacker-influenced bytes (browser uploads, meeting audio, IMAP
# attachments). Nothing in here may ever be executed by the web server.

# Uploads are user DATA, so the docroot's documentation/config blocklist (which
# hides *.md, *.txt, *.yml, *.sql ... from the repo root) must not apply here —
# it made every uploaded .txt attachment answer 403 instead of downloading.
# Re-grant everything first, then deny the executable types below; for a given
# file the LAST matching section wins.
<Files "*">
    <IfModule mod_authz_core.c>
        Require all granted
    </IfModule>
    <IfModule !mod_authz_core.c>
        Order allow,deny
        Allow from all
    </IfModule>
</Files>

php_flag engine off
<IfModule mod_php.c>
    php_flag engine off
</IfModule>
<IfModule mod_php7.c>
    php_flag engine off
</IfModule>
<IfModule mod_php8.c>
    php_flag engine off
</IfModule>
<FilesMatch "\.(php|phtml|php[0-9]|phps|pht|phar|inc|cgi|pl|py|rb|asp|aspx|jsp|sh|shtml|htaccess|ini)$">
    <IfModule mod_authz_core.c>
        Require all denied
    </IfModule>
    <IfModule !mod_authz_core.c>
        Order allow,deny
        Deny from all
    </IfModule>
</FilesMatch>
# Never let the browser sniff an upload into an executable/active type, and never
# let one run script in the app's origin if it is opened directly.
<IfModule mod_headers.c>
    Header always set X-Content-Type-Options "nosniff"
    Header always set Content-Security-Policy "default-src 'none'; sandbox"
</IfModule>

# ...except for the formats the browser renders with a built-in viewer.
# `sandbox` puts the response in an opaque origin with scripting disabled, which
# is the context Chrome's PDF viewer and Firefox's pdf.js themselves run in;
# current Chrome copes, but this is a documented source of PDFs that download
# instead of opening, or open blank, across browsers and versions. The policy
# buys nothing for these types either way: none of them can run script in the
# app's origin, and the nosniff header above still pins each one to its declared
# Content-Type. Anything NOT listed here (.html and friends) keeps the lockdown.
<FilesMatch "(?i)\.(pdf|png|jpe?g|gif|webp|bmp|tiff?|heic|heif|ico|txt|csv|rtf|docx?|xlsx?|pptx?|odt|ods|odp|zip|mp3|m4a|wav|ogg|oga|mp4|m4v|mov|webm)$">
    <IfModule mod_headers.c>
        Header always unset Content-Security-Policy
    </IfModule>
</FilesMatch>
HTACCESS;
    }

    /**
     * Log a PHP exception/error to the error_logs database table.
     */
    function ccrm_log_exception(\Throwable $e): void {
        // See ccrm_auth_pdo(): config.php must be included into global scope or the
        // caller's own require_once of it silently becomes a no-op.
        global $pdo, $db_connection_error;

        try {
            if (!function_exists('get_db_connection')) {
                $configFile = dirname(__DIR__) . '/config.php';
                if (!file_exists($configFile)) {
                    $configFile = dirname(__DIR__) . '/public/config.php';
                }
                if (file_exists($configFile)) {
                    require_once $configFile;
                }
            }
            if (function_exists('get_db_connection')) {
                $pdo = get_db_connection();
                // Ensure table exists (runs ccrm_apply_schema if not already done, but usually it is)
                $stmt = $pdo->prepare("INSERT INTO `error_logs` (`message`, `file`, `line`, `trace`, `request_uri`, `request_method`, `payload`) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([
                    $e->getMessage(),
                    $e->getFile(),
                    $e->getLine(),
                    $e->getTraceAsString(),
                    ccrm_redact_uri($_SERVER['REQUEST_URI'] ?? null),
                    $_SERVER['REQUEST_METHOD'] ?? null,
                    ccrm_redact_payload(file_get_contents('php://input') ?: null)
                ]);
            }
        } catch (\Throwable $ex) {
            error_log("Failed to log exception to DB: " . $ex->getMessage() . " | Original: " . $e->getMessage());
        }
    }

    /**
     * Write-only secret handling.
     *
     * The sync GET must never send real secret values (API keys, passwords,
     * OAuth secrets) to the browser: it emits a fixed mask instead. On save, a
     * field still equal to the mask means "unchanged", so the value already
     * stored in the DB is kept rather than being overwritten with the mask.
     * A real inbound value — including '' to deliberately clear — overwrites it.
     */
    if (!defined('CCRM_SECRET_MASK')) {
        define('CCRM_SECRET_MASK', '********');
    }

    /**
     * Derive the 32-byte symmetric key used to encrypt secrets at rest.
     *
     * Prefers an explicit CCRM_SECRET_KEY from config.php (written by the
     * installer). Falls back to a key derived from the DB credentials so
     * existing installs get encryption without regenerating config.php. Either
     * way the key material lives ONLY in the config file, never in the DB — so a
     * DB-only compromise cannot decrypt the stored secrets.
     */
    function ccrm_secret_key(): string {
        if (!defined('DB_PASS') && !defined('CCRM_SECRET_KEY')) {
            $possibleConfigs = [
                __DIR__ . '/../config.php',
                __DIR__ . '/../../config.php',
                dirname(__DIR__) . '/config.php',
                dirname(dirname(__DIR__)) . '/config.php',
                '/var/www/html/config.php'
            ];
            foreach ($possibleConfigs as $cfgFile) {
                if (file_exists($cfgFile)) {
                    @require_once $cfgFile;
                    break;
                }
            }
        }
        if (defined('CCRM_SECRET_KEY') && CCRM_SECRET_KEY !== '') {
            return hash('sha256', (string)CCRM_SECRET_KEY, true);
        }
        $material = (defined('DB_PASS') ? DB_PASS : '') . '|'
                  . (defined('DB_NAME') ? DB_NAME : '') . '|'
                  . (defined('DB_USER') ? DB_USER : '') . '|ccrm-secret-v1';
        return hash('sha256', $material, true);
    }

    /**
     * Encrypt a single secret value (AES-256-GCM). Returns an `enc:v1:` prefixed
     * token. Empty strings, already-encrypted values and the mask pass through
     * unchanged. Fails CLOSED: if encryption is impossible this throws, because
     * ccrm_decrypt_secret() treats any value without the prefix as legacy
     * plaintext, so a silent fallback would store the secret in the clear.
     *
     * @throws \RuntimeException when the value cannot be encrypted
     */
    function ccrm_encrypt_secret(string $plain): string {
        if ($plain === '' || $plain === CCRM_SECRET_MASK || strncmp($plain, 'enc:v1:', 7) === 0) {
            return $plain;
        }
        try {
            $iv  = random_bytes(12);
            $tag = '';
            $ct  = openssl_encrypt($plain, 'aes-256-gcm', ccrm_secret_key(), OPENSSL_RAW_DATA, $iv, $tag);
        } catch (\Throwable $e) {
            error_log('[ccrm secrets] encryption failed: ' . $e->getMessage());
            throw new \RuntimeException('Could not encrypt a secret value; refusing to store it in plain text.', 0, $e);
        }
        if ($ct === false) {
            error_log('[ccrm secrets] openssl_encrypt returned false');
            throw new \RuntimeException('Could not encrypt a secret value; refusing to store it in plain text.');
        }
        return 'enc:v1:' . base64_encode($iv . $tag . $ct);
    }

    /**
     * Decrypt a value produced by ccrm_encrypt_secret(). Legacy plaintext values
     * (no `enc:v1:` prefix) are returned unchanged, so this is safe to apply to
     * data written before encryption was introduced.
     */
    function ccrm_decrypt_secret(string $stored): string {
        if (strncmp($stored, 'enc:v1:', 7) !== 0) {
            return $stored;
        }
        $raw = base64_decode(substr($stored, 7), true);
        if ($raw === false || strlen($raw) < 29) {
            return $stored;
        }
        $iv  = substr($raw, 0, 12);
        $tag = substr($raw, 12, 16);
        $ct  = substr($raw, 28);
        $pt  = openssl_decrypt($ct, 'aes-256-gcm', ccrm_secret_key(), OPENSSL_RAW_DATA, $iv, $tag);
        return $pt === false ? '' : $pt;
    }

    /** Encrypt every named secret key in an assoc array (for storage). */
    function ccrm_encrypt_config_secrets(array $config, array $secretKeys): array {
        foreach ($secretKeys as $k) {
            if (isset($config[$k]) && is_string($config[$k]) && $config[$k] !== '') {
                $config[$k] = ccrm_encrypt_secret($config[$k]);
            }
        }
        return $config;
    }

    /** Decrypt every named secret key in an assoc array (after loading). */
    function ccrm_decrypt_config_secrets(array $config, array $secretKeys): array {
        foreach ($secretKeys as $k) {
            if (isset($config[$k]) && is_string($config[$k]) && $config[$k] !== '') {
                $config[$k] = ccrm_decrypt_secret($config[$k]);
            }
        }
        return $config;
    }

    /**
     * Return a user's emailSettings array with its secret fields decrypted,
     * ready for server-side use (IMAP/SMTP login). Accepts the raw array as
     * stored in metadata_json. Safe on legacy plaintext.
     */
    function ccrm_decrypt_email_settings($settings): array {
        if (!is_array($settings)) {
            return [];
        }
        return ccrm_decrypt_config_secrets($settings, ccrm_email_secret_keys());
    }

    /**
     * Append a privileged-action entry to the tamper-evident audit_log table.
     * Best-effort: a logging failure must never abort the underlying action.
     */
    function ccrm_audit_log(\PDO $pdo, ?array $actor, string $action, ?string $detail = null): void {
        try {
            // DDL causes an implicit COMMIT in MySQL, so never run CREATE TABLE
            // while a transaction is open (e.g. inside the sync POST). The table
            // is normally provisioned up-front by ccrm_apply_schema(); this lazy
            // create only covers callers that run outside a transaction.
            if (!$pdo->inTransaction()) {
                $pdo->exec(
                    "CREATE TABLE IF NOT EXISTS `audit_log` (
                      `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
                      `actor_id` VARCHAR(50) NULL,
                      `actor_email` VARCHAR(255) NULL,
                      `action` VARCHAR(100) NOT NULL,
                      `detail` TEXT NULL,
                      `ip` VARCHAR(45) NULL,
                      `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                      INDEX `idx_audit_time` (`created_at`),
                      INDEX `idx_audit_action` (`action`)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
                );
            }
            $stmt = $pdo->prepare(
                "INSERT INTO `audit_log` (`actor_id`, `actor_email`, `action`, `detail`, `ip`)
                 VALUES (?, ?, ?, ?, ?)"
            );
            $stmt->execute([
                $actor['id'] ?? null,
                $actor['email'] ?? null,
                $action,
                $detail,
                $_SERVER['REMOTE_ADDR'] ?? null,
            ]);
            ccrm_queue_security_alert($pdo, $action, $actor, $detail);
        } catch (\Throwable $e) {
            error_log('[ccrm audit_log] ' . $e->getMessage());
        }
    }

    /**
     * Audit actions that tell the administrators as they happen, not only when
     * somebody opens the audit log. Value = push notification title.
     */
    function ccrm_security_alert_actions(): array {
        return [
            'auth.lockout'     => 'Login lockout',
            'user.role_change' => 'User role changed',
            'user.delete'      => 'User removed',
            'generate_mcp_key' => 'MCP API key created',
            'api_key.reset'    => 'Lead intake API key reset',
            'error_logs.clear' => 'Error logs cleared',
        ];
    }

    /**
     * Web Push to every administrator for a security-relevant audit event.
     *
     * Runs after the response is sent: the push goes out over the network and
     * several callers hold an open database transaction. A burst of lockouts
     * (a brute-force run) sends one alert per ten minutes, not one per attempt.
     */
    function ccrm_queue_security_alert(\PDO $pdo, string $action, ?array $actor, ?string $detail): void {
        $titles = ccrm_security_alert_actions();
        if (!isset($titles[$action])) return;

        $who = (string)($actor['email'] ?? '');
        $body = trim(($who !== '' ? $who . ': ' : '') . (string)$detail);
        $body = mb_substr($body !== '' ? $body : $action, 0, 140);

        register_shutdown_function(static function () use ($pdo, $action, $titles, $body): void {
            try {
                if (function_exists('fastcgi_finish_request')) {
                    @fastcgi_finish_request();
                }
                if ($action === 'auth.lockout') {
                    $recent = $pdo->prepare(
                        "SELECT COUNT(*) FROM `audit_log` WHERE `action` = ? AND `created_at` > (NOW() - INTERVAL 10 MINUTE)"
                    );
                    $recent->execute([$action]);
                    if ((int)$recent->fetchColumn() > 1) return;
                }
                require_once __DIR__ . '/webpush.php';
                $admins = $pdo->query(
                    "SELECT `email` FROM `users` WHERE LOWER(TRIM(`role`)) = 'admin' AND `email` <> ''"
                )->fetchAll(\PDO::FETCH_COLUMN);
                foreach ($admins as $email) {
                    ccrm_send_push_notification($pdo, (string)$email, '🔐 ' . $titles[$action], $body, '/#settings/audit');
                }
            } catch (\Throwable $e) {
                error_log('[ccrm security alert] ' . $e->getMessage());
            }
        });
    }

    /** System-level integration secrets (system_settings.INTEGRATIONS_CONFIG). */
    function ccrm_integration_secret_keys(): array {
        return [
            'openAiKey', 'anthropicKey', 'geminiKey',
            'smtpPassword', 'exchClientSecret', 'exchPassword',
            'metaAppSecret', 'metaAccessToken', 'googleClientSecret',
            'googleRefreshToken', 'googleDevToken', 'mariaDbPassword',
            'qdrantApiKey', 'pineconeApiKey', 'zernioApiKey',
        ];
    }

    /** Per-user email secrets (users.metadata_json -> emailSettings). */
    function ccrm_email_secret_keys(): array {
        return ['imapPassword', 'smtpPassword', 'password'];
    }

    /**
     * Secret fields inside INVOICING_INTEGRATIONS, per provider. Unlike
     * INTEGRATIONS_CONFIG these live one level down (`superfaktura.apiKey`,
     * `idoklad.clientSecret`), so they need their own walk rather than the flat
     * ccrm_*_config_secrets helpers.
     */
    function ccrm_invoicing_secret_map(): array {
        return [
            'superfaktura' => ['apiKey'],
            'idoklad' => ['clientSecret'],
        ];
    }

    /** Apply $fn to every provider secret in an INVOICING_INTEGRATIONS array. */
    function ccrm_walk_invoicing_secrets($config, callable $fn): array {
        if (!is_array($config)) {
            return [];
        }
        foreach (ccrm_invoicing_secret_map() as $provider => $keys) {
            if (!isset($config[$provider]) || !is_array($config[$provider])) {
                continue;
            }
            foreach ($keys as $k) {
                if (isset($config[$provider][$k]) && is_string($config[$provider][$k]) && $config[$provider][$k] !== '') {
                    $config[$provider][$k] = $fn($config[$provider][$k]);
                }
            }
        }
        return $config;
    }

    /** Encrypt accounting-connector secrets before they are persisted. */
    function ccrm_encrypt_invoicing_secrets($config): array {
        return ccrm_walk_invoicing_secrets($config, 'ccrm_encrypt_secret');
    }

    /** Decrypt accounting-connector secrets for server-side use. */
    function ccrm_decrypt_invoicing_secrets($config): array {
        return ccrm_walk_invoicing_secrets($config, 'ccrm_decrypt_secret');
    }

    /**
     * Replace accounting-connector secrets with the mask before the config is
     * sent to a browser. Every authenticated user receives the settings blob on
     * sync, so unmasked keys here handed the company's SuperFaktúra / iDoklad
     * credentials to every account in the CRM, whatever their role.
     */
    function ccrm_mask_invoicing_secrets($config): array {
        return ccrm_walk_invoicing_secrets($config, function () { return CCRM_SECRET_MASK; });
    }

    /**
     * Merge an inbound INVOICING_INTEGRATIONS over the stored one, keeping any
     * provider secret the client left masked or omitted.
     */
    function ccrm_merge_invoicing_secrets($incoming, $existing): array {
        if (!is_array($incoming)) {
            return is_array($existing) ? $existing : [];
        }
        if (!is_array($existing)) {
            $existing = [];
        }
        foreach (ccrm_invoicing_secret_map() as $provider => $keys) {
            if (!isset($incoming[$provider]) || !is_array($incoming[$provider])) {
                continue;
            }
            foreach ($keys as $k) {
                $inbound = $incoming[$provider][$k] ?? null;
                $hasReal = is_string($inbound) && $inbound !== '' && $inbound !== CCRM_SECRET_MASK;
                if ($hasReal) {
                    continue;
                }
                // An explicit empty string clears the secret — the same contract
                // as ccrm_merge_secrets() for the AI/mail keys. Only the mask (or
                // an absent key) means "keep what is stored"; treating '' as
                // "keep" made a cleared connector key reappear after a reload.
                if ($inbound === '') {
                    unset($incoming[$provider][$k]);
                    continue;
                }
                if (isset($existing[$provider][$k])) {
                    $incoming[$provider][$k] = $existing[$provider][$k];
                } else {
                    unset($incoming[$provider][$k]);
                }
            }
        }
        return $incoming;
    }

    /**
     * iDoklad country id for a free-text country name. iDoklad is a Czech
     * service whose id 2 is Slovakia and 1 is Czechia; anything unrecognised
     * falls back to Slovakia, which is where this CRM is deployed.
     */
    function ccrm_idoklad_country_id($country): int {
        $c = mb_strtolower(trim((string)$country));
        if ($c === '') {
            return 2;
        }
        $czech = ['cz', 'czechia', 'czech republic', 'česko', 'česká republika', 'ceska republika', 'cesko'];
        foreach ($czech as $needle) {
            if ($c === $needle) {
                return 1;
            }
        }
        return 2;
    }

    /**
     * Persist a base64 PDF returned by an accounting API under /uploads and hand
     * back its public path, so the CRM can link the official document instead of
     * only storing its remote id. Returns null when the payload is unusable.
     */
    function ccrm_store_external_pdf($base64, string $baseName): ?string {
        if (!is_string($base64) || $base64 === '') {
            return null;
        }
        $binary = base64_decode($base64, true);
        // A valid PDF starts with %PDF-; anything else is an error page or JSON.
        if ($binary === false || strncmp($binary, '%PDF-', 5) !== 0) {
            return null;
        }
        // ccrm_uploads_dir() also (re)installs the .htaccess guard that keeps
        // uploads/ inert, so never write there by hand.
        $dir = ccrm_uploads_dir();
        if (!is_dir($dir)) {
            return null;
        }
        $safeBase = preg_replace('/[^A-Za-z0-9._-]/', '', $baseName) ?: 'document';
        $fileName = $safeBase . '-' . bin2hex(random_bytes(4)) . '.pdf';
        if (@file_put_contents($dir . $fileName, $binary) === false) {
            return null;
        }
        return '/uploads/' . $fileName;
    }

    /**
     * Older model ids stored on live installs, and the current id they become.
     * Same tier, same or lower price (OpenAI list, Oct 2026). Keep this in step
     * with LEGACY_MODELS in src/utils/aiModels.ts — the schema migration rewrites
     * rows with these keys.
     *
     * @return array<string, string>
     */
    function ccrm_ai_model_upgrades(): array {
        return [
            'gpt-5.6-luna' => 'gpt-6-luna',
            'gpt-4o-mini' => 'gpt-6-luna',
            'gpt-5.6-terra' => 'gpt-6.1-terra',
            'gpt-4o' => 'gpt-6.1-terra',
            'gpt-5.6-sol' => 'gpt-6.1-sol',
            'claude-3-5-sonnet-20241022' => 'claude-sonnet-5-5',
        ];
    }

    /**
     * Rewrite a stored model id. An empty value becomes $fallback; an id this
     * app does not recognise is returned unchanged (a hand-set custom model).
     */
    function ccrm_ai_upgrade_model($model, string $fallback): string {
        if (!is_string($model) || trim($model) === '') {
            return $fallback;
        }
        $model = trim($model);
        $map = ccrm_ai_model_upgrades();
        return $map[$model] ?? $model;
    }

    /**
     * Resolve the OpenAI chat model to use, from the admin-configured
     * INTEGRATIONS_CONFIG, falling back to a sane default. Centralised so the
     * default is not scattered as a literal across every AI endpoint.
     * A stored older id is rewritten (see ccrm_ai_model_upgrades()).
     */
    function ccrm_ai_model(array $config = [], string $default = 'gpt-6-luna'): string {
        $m = $config['aiModel'] ?? ($config['openAiModel'] ?? '');
        return ccrm_ai_upgrade_model(is_string($m) ? $m : '', $default);
    }

    /**
     * The model a dashboard AI endpoint should use. The editor offers a slider over
     * these three, so a client may pick one of them; anything else (a high-cost
     * model it was never offered, an old stored name) falls back to the model the
     * administrator configured, instead of being forwarded to OpenAI as typed.
     */
    function ccrm_ai_requested_model(array $config, $requested): string {
        $configured = ccrm_ai_model($config, 'gpt-6.1-terra');
        $requested = ccrm_ai_upgrade_model(is_string($requested) ? $requested : '', $configured);
        $allowed = ['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol', $configured];
        return in_array($requested, $allowed, true) ? $requested : $configured;
    }

    /**
     * Sliding-window rate limit kept in the database (fixed ledger table, created
     * on first use). Records a hit and returns false while the caller is under
     * `$max` hits in the last `$windowSeconds`; returns true — without recording —
     * once they are over. Fails OPEN: a broken ledger must never lock out real
     * traffic.
     */
    function ccrm_rate_limit_exceeded(\PDO $pdo, string $bucket, string $subject, int $max, int $windowSeconds): bool {
        try {
            if (!$pdo->inTransaction()) {
                $pdo->exec(
                    "CREATE TABLE IF NOT EXISTS `rate_limits` (
                      `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
                      `bucket` VARCHAR(50) NOT NULL,
                      `subject` VARCHAR(64) NOT NULL,
                      `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                      INDEX `idx_rate_window` (`bucket`, `subject`, `created_at`)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
                );
            }
            if (random_int(1, 50) === 1) {
                $pdo->exec("DELETE FROM `rate_limits` WHERE `created_at` < (NOW() - INTERVAL 1 DAY)");
            }
            $subject = substr($subject, 0, 64);
            $count = $pdo->prepare(
                "SELECT COUNT(*) FROM `rate_limits`
                  WHERE `bucket` = ? AND `subject` = ? AND `created_at` > (NOW() - INTERVAL " . (int)$windowSeconds . " SECOND)"
            );
            $count->execute([$bucket, $subject]);
            if ((int)$count->fetchColumn() >= $max) {
                return true;
            }
            $pdo->prepare("INSERT INTO `rate_limits` (`bucket`, `subject`) VALUES (?, ?)")->execute([$bucket, $subject]);
            return false;
        } catch (\Throwable $e) {
            error_log('[ccrm rate limit] ' . $e->getMessage());
            return false;
        }
    }

    /**
     * OpenAI's reasoning-model families (o1, o3, o4, gpt-5 and gpt-6) reject any
     * 'temperature' value other than the default (1) — sending 0.2/0.3/0.4
     * fails with "Unsupported value: 'temperature' does not support X".
     * Only include the param for models that actually accept it.
     */
    function ccrm_ai_model_supports_temperature(string $model): bool {
        return !preg_match('/^(o[1-9]|gpt-[5-9])/i', trim($model));
    }

    /**
     * Blank the value of secret-looking query parameters (?token=, ?key=, ?api_key=
     * ...) in a request URI before it is written to error_logs, so a bearer token
     * sent in a URL does not survive in the table.
     */
    function ccrm_redact_uri($uri) {
        if (!is_string($uri) || $uri === '' || strpos($uri, '?') === false) {
            return $uri;
        }
        return preg_replace(
            '/([?&][^=&#]*(?:token|key|secret|pass|auth)[^=&#]*=)[^&#]*/i',
            '$1[REDACTED]',
            $uri
        );
    }

    /**
     * Redact secret-looking fields from a raw request body before it is stored
     * in the error log (readable by admins). Only rewrites JSON bodies; anything
     * whose key looks like a password/secret/token/api key becomes [REDACTED].
     */
    function ccrm_redact_payload($raw) {
        if (!is_string($raw) || $raw === '') {
            return $raw;
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            return $raw;
        }
        $redactor = function (&$node) use (&$redactor) {
            foreach ($node as $key => &$val) {
                if (is_array($val)) {
                    $redactor($val);
                } elseif (is_string($key) && preg_match('/pass|secret|token|api[_-]?key|openaikey/i', $key)) {
                    $val = '[REDACTED]';
                }
            }
            unset($val);
        };
        $redactor($data);
        $encoded = json_encode($data, JSON_INVALID_UTF8_SUBSTITUTE);
        return $encoded === false ? '[unserializable payload]' : $encoded;
    }

    /**
     * Outbound-connection guard (SSRF). The connection testers (IMAP/SMTP/vector
     * database) and Web Push dispatch connect to a host a user typed in. Without
     * a check they map the internal network, reach cloud metadata
     * (169.254.169.254) and talk to loopback services.
     *
     * Operators who legitimately run their mail server or vector store on a
     * private address opt in with `define('CCRM_ALLOW_PRIVATE_HOSTS', true);` in
     * config.php (or the CCRM_ALLOW_PRIVATE_HOSTS=1 environment variable).
     */
    function ccrm_private_hosts_allowed(): bool {
        if (defined('CCRM_ALLOW_PRIVATE_HOSTS') && CCRM_ALLOW_PRIVATE_HOSTS) {
            return true;
        }
        $env = getenv('CCRM_ALLOW_PRIVATE_HOSTS');
        return $env !== false && in_array(strtolower(trim($env)), ['1', 'true', 'yes'], true);
    }

    /** True for a public, routable address (IPv4-mapped IPv6 is judged as its IPv4). */
    function ccrm_ip_is_public(string $ip): bool {
        if (stripos($ip, '::ffff:') === 0
            && filter_var(substr($ip, 7), FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false) {
            $ip = substr($ip, 7);
        }
        return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false
            && !ccrm_ip_is_never_allowed($ip);
    }

    /**
     * Addresses no outbound connection of ours should ever reach, even where
     * private networks are fine (the vector database tester): link-local — which
     * includes the cloud metadata service at 169.254.169.254 — "this network",
     * unspecified, multicast and reserved ranges.
     */
    function ccrm_ip_is_never_allowed(string $ip): bool {
        if (stripos($ip, '::ffff:') === 0
            && filter_var(substr($ip, 7), FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false) {
            $ip = substr($ip, 7);
        }
        $bin = @inet_pton($ip);
        if ($bin === false) {
            return true;
        }
        if (strlen($bin) === 4) {
            $a = ord($bin[0]);
            $b = ord($bin[1]);
            return $a === 0 || ($a === 169 && $b === 254) || $a >= 224;
        }
        if ($bin === str_repeat("\0", 16)) {
            return true; // ::
        }
        $first = ord($bin[0]);
        $second = ord($bin[1]);
        return $first === 0xff || ($first === 0xfe && ($second & 0xC0) === 0x80);
    }

    /**
     * Like ccrm_assert_public_host() but private and loopback addresses ARE
     * allowed: a vector database is normally a sidecar or an internal server.
     * Only the never-allowed ranges above are refused.
     *
     * @throws \InvalidArgumentException
     */
    function ccrm_assert_not_special_host(string $host): void {
        $host = trim($host, '[] ');
        if ($host === '' || preg_match('/[\s\/\\\\@#?;]/', $host)) {
            throw new \InvalidArgumentException('Invalid host name.');
        }
        $ips = ccrm_resolve_host_ips($host);
        if (!$ips) {
            throw new \InvalidArgumentException('Unable to resolve host.');
        }
        foreach ($ips as $ip) {
            if (ccrm_ip_is_never_allowed($ip)) {
                throw new \InvalidArgumentException('Connections to link-local or reserved addresses are not allowed.');
            }
        }
    }

    /** Every IPv4/IPv6 address a host name (or literal) resolves to. */
    function ccrm_resolve_host_ips(string $host): array {
        $host = trim($host, '[] ');
        if ($host === '') {
            return [];
        }
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return [$host];
        }
        $ips = [];
        $v4 = @gethostbynamel($host);
        if (is_array($v4)) {
            $ips = $v4;
        }
        $v6 = @dns_get_record($host, DNS_AAAA);
        if (is_array($v6)) {
            foreach ($v6 as $rec) {
                if (!empty($rec['ipv6'])) {
                    $ips[] = $rec['ipv6'];
                }
            }
        }
        return array_values(array_unique($ips));
    }

    /**
     * Refuse a host that does not resolve, or that resolves to any private,
     * loopback, link-local or otherwise reserved address.
     *
     * @throws \InvalidArgumentException
     */
    function ccrm_assert_public_host(string $host): void {
        $host = trim(preg_replace('#^(ssl|tls|tcp)://#i', '', trim($host)), '[] ');
        if ($host === '' || preg_match('/[\s\/\\\\@#?]/', $host)) {
            throw new \InvalidArgumentException('Invalid host name.');
        }
        if (ccrm_private_hosts_allowed()) {
            return;
        }
        $ips = ccrm_resolve_host_ips($host);
        if (!$ips) {
            throw new \InvalidArgumentException('Unable to resolve host.');
        }
        foreach ($ips as $ip) {
            if (!ccrm_ip_is_public($ip)) {
                throw new \InvalidArgumentException(
                    'Connections to internal, loopback or link-local addresses are not allowed.'
                );
            }
        }
    }

    /**
     * Same, for a mail server: the host must be public (see above) AND the port
     * one of the standard mail ports, so the tester cannot be used as a generic
     * port scanner.
     *
     * @throws \InvalidArgumentException
     */
    function ccrm_validate_external_mail_target(string $host, int $port, array $allowedPorts = [143, 993, 110, 995, 25, 465, 587, 2525]): void {
        if (!in_array($port, $allowedPorts, true)) {
            throw new \InvalidArgumentException('Port is not a standard mail port.');
        }
        ccrm_assert_public_host($host);
    }

    /** Load the stored INTEGRATIONS_CONFIG as an assoc array (server-side use). */
    function ccrm_load_integrations_config(\PDO $pdo): array {
        try {
            $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'")->fetchColumn();
        } catch (\Throwable $e) {
            return [];
        }
        if ($raw === false || $raw === null) {
            return [];
        }
        $cfg = json_decode($raw, true);
        if (!is_array($cfg)) {
            return [];
        }
        return ccrm_decrypt_config_secrets($cfg, ccrm_integration_secret_keys());
    }

    /**
     * Base URL of the CRM as the current request reached it, e.g.
     * "https://crm.example.sk/". Built from the Host header, which the client
     * controls — never put it in an e-mail on its own; see ccrm_app_base_url().
     */
    function ccrm_request_base_url(): string {
        $host = (string)($_SERVER['HTTP_HOST'] ?? '');
        if ($host === '' || !preg_match('/^[A-Za-z0-9.\-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](:\d{1,5})?$/', $host)) {
            return '';
        }
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $path = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
        $path = preg_replace('#/(api|public)$#', '', rtrim($path, '/'));
        return ($https ? 'https' : 'http') . '://' . strtolower($host) . $path . '/';
    }

    /**
     * Record the base URL the first administrator signed in through, and only
     * then. The Host header is client-controlled and the stored value is what
     * password-reset links use when config.php has no CCRM_APP_URL, so:
     *  - a non-admin never writes it,
     *  - a value that is already stored is never replaced (an admin login
     *    through a proxied Host must not move existing reset links),
     *  - when CCRM_APP_URL is set, nothing is written at all. That constant
     *    already wins in ccrm_app_base_url(); leaving a second copy in the
     *    database would become the authority the moment the constant was removed.
     */
    function ccrm_remember_app_url(\PDO $pdo, ?array $user = null): void {
        if (defined('CCRM_APP_URL') && is_string(CCRM_APP_URL) && CCRM_APP_URL !== '') return;
        if (strtolower(trim((string)($user['role'] ?? ''))) !== 'admin') return;
        $url = ccrm_request_base_url();
        if ($url === '') return;
        try {
            $cur = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'APP_BASE_URL'");
            $cur->execute();
            $stored = $cur->fetchColumn();
            if (is_string($stored) && trim($stored) !== '') return;
            if ($stored === false) {
                $pdo->prepare("INSERT IGNORE INTO `system_settings` (`key`, `value`) VALUES ('APP_BASE_URL', ?)")
                    ->execute([$url]);
                return;
            }
            // A blank row (NULL or '') may be filled once. A concurrent login
            // that already wrote a real URL is left alone.
            $pdo->prepare("UPDATE `system_settings` SET `value` = ? WHERE `key` = 'APP_BASE_URL' AND (`value` IS NULL OR `value` = '')")
                ->execute([$url]);
        } catch (\Throwable $e) { /* best effort — links fall back to the request */ }
    }

    /**
     * Base URL for links in outgoing e-mail: `CCRM_APP_URL` from config.php when
     * the operator set one, else the URL of the last successful sign-in, else
     * the current request (a fresh install nobody has signed in to yet).
     * Anonymous callers such as the password-reset request must not decide the
     * host a mailed link points at — that is how a reset token gets delivered to
     * an attacker's server. Callers that run on an anonymous request pass
     * $allowRequestFallback = false so that last step is skipped for them.
     */
    function ccrm_app_base_url(\PDO $pdo, bool $allowRequestFallback = true): string {
        if (defined('CCRM_APP_URL') && is_string(CCRM_APP_URL) && CCRM_APP_URL !== '') {
            return rtrim(CCRM_APP_URL, '/') . '/';
        }
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'APP_BASE_URL'");
            $stmt->execute();
            $stored = $stmt->fetchColumn();
            if (is_string($stored) && preg_match('#^https?://#', $stored)) {
                return $stored;
            }
        } catch (\Throwable $e) { /* fall through */ }
        return $allowRequestFallback ? ccrm_request_base_url() : '';
    }

    /** Replace every non-empty secret value with the mask (outbound). */
    function ccrm_mask_secrets(array $config, array $secretKeys): array {
        foreach ($secretKeys as $k) {
            if (isset($config[$k]) && $config[$k] !== '') {
                $config[$k] = CCRM_SECRET_MASK;
            }
        }
        return $config;
    }

    /**
     * Merge an inbound config over the stored one, preserving secrets the client
     * left masked or omitted.
     */
    function ccrm_merge_secrets(array $incoming, array $existing, array $secretKeys): array {
        foreach ($secretKeys as $k) {
            $hasRealIncoming = array_key_exists($k, $incoming) && $incoming[$k] !== CCRM_SECRET_MASK;
            if (!$hasRealIncoming) {
                if (array_key_exists($k, $existing)) {
                    $incoming[$k] = $existing[$k];
                } else {
                    unset($incoming[$k]);
                }
            }
        }
        return $incoming;
    }

    /** Mask email secrets inside a user's metadata_json string (outbound). */
    function ccrm_mask_user_metadata($metaJson) {
        if (!is_string($metaJson) || $metaJson === '') {
            return $metaJson;
        }
        $meta = json_decode($metaJson, true);
        if (!is_array($meta) || !isset($meta['emailSettings']) || !is_array($meta['emailSettings'])) {
            return $metaJson;
        }
        $meta['emailSettings'] = ccrm_mask_secrets($meta['emailSettings'], ccrm_email_secret_keys());
        $encoded = json_encode($meta, JSON_INVALID_UTF8_SUBSTITUTE);
        return $encoded === false ? $metaJson : $encoded;
    }

    /**
     * Merge masked email secrets in an inbound metadata_json against the stored
     * one, so a save that left the password masked keeps the stored password.
     */
    function ccrm_merge_user_metadata($incomingJson, $existingJson) {
        if (!is_string($incomingJson) || $incomingJson === '') {
            return $incomingJson;
        }
        $incoming = json_decode($incomingJson, true);
        if (!is_array($incoming) || !isset($incoming['emailSettings']) || !is_array($incoming['emailSettings'])) {
            return $incomingJson;
        }
        $existing = is_string($existingJson) && $existingJson !== '' ? json_decode($existingJson, true) : [];
        $existingEmail = (is_array($existing) && isset($existing['emailSettings']) && is_array($existing['emailSettings']))
            ? $existing['emailSettings'] : [];
        $incoming['emailSettings'] = ccrm_merge_secrets($incoming['emailSettings'], $existingEmail, ccrm_email_secret_keys());
        // Encrypt mailbox secrets at rest. Values preserved from the stored copy
        // are already encrypted (ccrm_encrypt_secret is a no-op on them); only a
        // freshly supplied plaintext password gets encrypted here.
        $incoming['emailSettings'] = ccrm_encrypt_config_secrets($incoming['emailSettings'], ccrm_email_secret_keys());
        $encoded = json_encode($incoming, JSON_INVALID_UTF8_SUBSTITUTE);
        return $encoded === false ? $incomingJson : $encoded;
    }

    /**
     * Ledger of tokens (and transcription minutes) each AI feature actually consumed.
     * Created here as well as in schema.php so a call that lands before the next
     * sync still records. Never throws: a broken ledger must not fail the feature.
     */
    function ccrm_ai_usage_ensure(\PDO $pdo): void {
        static $ready = false;
        if ($ready || $pdo->inTransaction()) {
            return;
        }
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS `ai_usage` (
              `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
              `feature` VARCHAR(64) NOT NULL,
              `model` VARCHAR(80) NOT NULL,
              `input_tokens` INT UNSIGNED NOT NULL DEFAULT 0,
              `cached_input_tokens` INT UNSIGNED NOT NULL DEFAULT 0,
              `output_tokens` INT UNSIGNED NOT NULL DEFAULT 0,
              `input_audio_tokens` INT UNSIGNED NOT NULL DEFAULT 0,
              `output_audio_tokens` INT UNSIGNED NOT NULL DEFAULT 0,
              `audio_seconds` DECIMAL(10,2) NOT NULL DEFAULT 0,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              INDEX `idx_ai_usage_created` (`created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $ready = true;
    }

    /**
     * One successful provider call. Token fields are already split: input is
     * uncached text, cached input is separate, audio tokens are separate, and
     * audio_seconds is file or live transcription billed by the minute.
     */
    function ccrm_ai_record_usage(
        \PDO $pdo,
        string $feature,
        string $model,
        int $inputTokens,
        int $outputTokens,
        int $cachedInputTokens = 0,
        int $inputAudioTokens = 0,
        int $outputAudioTokens = 0,
        float $audioSeconds = 0
    ): void {
        try {
            $feature = strtolower(preg_replace('/[^a-z0-9_]/i', '', $feature) ?? '');
            $feature = substr($feature !== '' ? $feature : 'unknown', 0, 64);
            $model = trim($model);
            if (str_starts_with($model, 'models/')) {
                $model = substr($model, 7);
            }
            $model = substr($model !== '' ? $model : 'unknown', 0, 80);
            $clamp = static function (int $n): int {
                return max(0, min($n, 50000000));
            };
            $inputTokens = $clamp($inputTokens);
            $outputTokens = $clamp($outputTokens);
            $cachedInputTokens = $clamp($cachedInputTokens);
            $inputAudioTokens = $clamp($inputAudioTokens);
            $outputAudioTokens = $clamp($outputAudioTokens);
            if ($audioSeconds < 0 || $audioSeconds > 14400) {
                $audioSeconds = 0;
            }
            if ($inputTokens + $outputTokens + $cachedInputTokens + $inputAudioTokens + $outputAudioTokens === 0 && $audioSeconds <= 0) {
                return;
            }
            ccrm_ai_usage_ensure($pdo);
            $pdo->prepare(
                "INSERT INTO `ai_usage`
                  (`feature`, `model`, `input_tokens`, `cached_input_tokens`, `output_tokens`, `input_audio_tokens`, `output_audio_tokens`, `audio_seconds`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            )->execute([
                $feature,
                $model,
                $inputTokens,
                $cachedInputTokens,
                $outputTokens,
                $inputAudioTokens,
                $outputAudioTokens,
                round($audioSeconds, 2),
            ]);
        } catch (\Throwable $e) {
            error_log('[ccrm ai usage] ' . $e->getMessage());
        }
    }

    /**
     * Read a chat, embeddings, Anthropic or Gemini JSON body and store its usage.
     * $fallbackModel is the id we sent when the body does not echo one.
     */
    function ccrm_ai_capture_usage(\PDO $pdo, string $feature, $decoded, string $fallbackModel = ''): void {
        if (!is_array($decoded)) {
            return;
        }
        $model = '';
        if (isset($decoded['model']) && is_string($decoded['model'])) {
            $model = $decoded['model'];
        } elseif (isset($decoded['modelVersion']) && is_string($decoded['modelVersion'])) {
            $model = $decoded['modelVersion'];
        }
        if (trim($model) === '') {
            $model = $fallbackModel;
        }
        $usage = null;
        if (isset($decoded['usage']) && is_array($decoded['usage'])) {
            $usage = $decoded['usage'];
        } elseif (isset($decoded['usageMetadata']) && is_array($decoded['usageMetadata'])) {
            $usage = $decoded['usageMetadata'];
        }
        if ($usage === null) {
            return;
        }
        $input = (int)($usage['prompt_tokens'] ?? $usage['input_tokens'] ?? $usage['promptTokenCount'] ?? 0);
        $output = (int)($usage['completion_tokens'] ?? $usage['output_tokens'] ?? $usage['candidatesTokenCount'] ?? 0);
        $output += (int)($usage['thoughtsTokenCount'] ?? 0);
        $cached = (int)($usage['prompt_tokens_details']['cached_tokens']
            ?? $usage['input_token_details']['cached_tokens']
            ?? $usage['cachedContentTokenCount']
            ?? 0);
        $inAudio = (int)($usage['prompt_tokens_details']['audio_tokens'] ?? $usage['input_token_details']['audio_tokens'] ?? 0);
        $outAudio = (int)($usage['completion_tokens_details']['audio_tokens'] ?? $usage['output_token_details']['audio_tokens'] ?? 0);
        if (isset($usage['input_token_details']['text_tokens']) || $inAudio > 0) {
            $input = isset($usage['input_token_details']['text_tokens'])
                ? (int)$usage['input_token_details']['text_tokens']
                : max(0, $input - $inAudio);
        }
        if (isset($usage['output_token_details']['text_tokens']) || $outAudio > 0) {
            $output = isset($usage['output_token_details']['text_tokens'])
                ? (int)$usage['output_token_details']['text_tokens']
                : max(0, $output - $outAudio);
        }
        if ($cached > 0) {
            $input = max(0, $input - $cached);
        }
        $seconds = 0.0;
        if (isset($usage['seconds']) && is_numeric($usage['seconds'])) {
            $seconds = (float)$usage['seconds'];
        }
        ccrm_ai_record_usage($pdo, $feature, $model, $input, $output, $cached, $inAudio, $outAudio, $seconds);
    }

    /** Seconds the transcription body itself reports, or 0. */
    function ccrm_ai_provider_audio_seconds($decoded): float {
        if (!is_array($decoded)) {
            return 0;
        }
        $usage = (isset($decoded['usage']) && is_array($decoded['usage'])) ? $decoded['usage'] : [];
        $seconds = $usage['seconds'] ?? ($decoded['duration'] ?? null);
        if (!is_numeric($seconds)) {
            return 0;
        }
        $n = (float)$seconds;
        return ($n > 0 && $n <= 14400) ? $n : 0;
    }

    /** A duration the browser measured, capped so a bad value cannot dominate the month. */
    function ccrm_ai_posted_audio_seconds($posted): float {
        if (!is_numeric($posted)) {
            return 0;
        }
        $n = (float)$posted;
        return ($n > 0 && $n <= 14400) ? $n : 0;
    }

    /** WAV header, then ffprobe when the shell allows it. 0 when neither can tell. */
    function ccrm_ai_probe_audio_seconds(string $path): float {
        $fh = @fopen($path, 'rb');
        if ($fh) {
            $riff = fread($fh, 12);
            if (strlen($riff) === 12 && substr($riff, 0, 4) === 'RIFF' && substr($riff, 8, 4) === 'WAVE') {
                $rate = 0;
                $align = 0;
                while (!feof($fh)) {
                    $chunk = fread($fh, 8);
                    if (strlen($chunk) < 8) {
                        break;
                    }
                    $id = substr($chunk, 0, 4);
                    $size = unpack('V', substr($chunk, 4, 4))[1];
                    if ($id === 'fmt ' && $size >= 16) {
                        $fmt = fread($fh, $size);
                        $rate = unpack('V', substr($fmt, 4, 4))[1];
                        $align = unpack('v', substr($fmt, 12, 2))[1];
                    } elseif ($id === 'data' && $rate > 0 && $align > 0) {
                        fclose($fh);
                        return $size / ($rate * $align);
                    } else {
                        fseek($fh, $size + ($size % 2), SEEK_CUR);
                    }
                }
            }
            fclose($fh);
        }
        if (!function_exists('exec')) {
            return 0;
        }
        $disabled = array_map('trim', explode(',', (string)ini_get('disable_functions')));
        if (in_array('exec', $disabled, true)) {
            return 0;
        }
        $out = [];
        $code = 1;
        @exec('ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 ' . escapeshellarg($path), $out, $code);
        if ($code !== 0) {
            return 0;
        }
        $n = (float)trim((string)($out[0] ?? ''));
        return ($n > 0 && $n <= 14400) ? $n : 0;
    }

    /**
     * Billable audio length: the provider's own seconds, then the file, then
     * the duration the browser sent with the upload.
     */
    function ccrm_ai_resolve_audio_seconds($decoded, string $path, $posted): float {
        $fromProvider = ccrm_ai_provider_audio_seconds($decoded);
        if ($fromProvider > 0) {
            return $fromProvider;
        }
        if ($path !== '' && is_file($path)) {
            $probed = ccrm_ai_probe_audio_seconds($path);
            if ($probed > 0) {
                return $probed;
            }
        }
        return ccrm_ai_posted_audio_seconds($posted);
    }
}

// ccrm_is_admin / ccrm_normalize_role exist when the port of permissions.ts
// is included. require_once is safe against the circular include.
require_once __DIR__ . '/permissions.php';
