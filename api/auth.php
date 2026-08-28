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

    /** Lifetime (seconds) of a "remember me" session — 30 days. */
    if (!defined('CCRM_REMEMBER_LIFETIME')) {
        define('CCRM_REMEMBER_LIFETIME', 60 * 60 * 24 * 30);
    }

    /**
     * Start (or resume) a hardened session.
     *
     * When $remember is true (or the non-sensitive CCRM_REMEMBER marker cookie
     * is present from a previous "remember me" login) the session cookie and the
     * server-side garbage-collection window are extended to CCRM_REMEMBER_LIFETIME
     * so the user stays signed in across browser restarts. Otherwise the session
     * is a normal browser-session cookie that dies when the browser closes.
     */
    function ccrm_start_session(?bool $remember = null): void {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        if ($remember === null) {
            $remember = (($_COOKIE['CCRM_REMEMBER'] ?? '') === '1');
        }
        $lifetime = $remember ? CCRM_REMEMBER_LIFETIME : 0;
        if ($remember) {
            // Keep the server-side session file alive for the whole window.
            @ini_set('session.gc_maxlifetime', (string)CCRM_REMEMBER_LIFETIME);
        }
        session_set_cookie_params([
            'lifetime' => $lifetime,
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

    /** Drop the current session entirely (used when it is no longer valid). */
    function ccrm_destroy_session(): void {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        @session_destroy();
    }

    function ccrm_current_user(): ?array {
        ccrm_start_session();
        if (empty($_SESSION['ccrm_uid'])) {
            return null;
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
                        ccrm_destroy_session();
                        return null;
                    }
                    if (!empty($row['session_retired'])) {
                        ccrm_destroy_session();
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
            'role'  => $_SESSION['ccrm_role'] ?? 'viewer',
            'email' => $_SESSION['ccrm_email'] ?? '',
        ];
    }

    /**
     * Retire every session issued before now for a user — call after any password
     * change. Safe to call when the column is missing on an un-migrated database.
     */
    function ccrm_invalidate_user_sessions(\PDO $pdo, string $userId): void {
        try {
            $pdo->prepare("UPDATE `users` SET `sessions_valid_from` = NOW() WHERE `id` = ?")
                ->execute([$userId]);
        } catch (\Throwable $e) {
            error_log('[ccrm auth] could not invalidate sessions for ' . $userId . ': ' . $e->getMessage());
        }
    }

    /**
     * Require an authenticated session, else emit 401 and stop.
     */
    function ccrm_require_auth(): array {
        $user = ccrm_current_user();
        if ($user === null) {
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
        if (($user['role'] ?? '') !== 'admin') {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Administrator privileges required.']);
            exit;
        }
        return $user;
    }

    /**
     * Normalize a free-form role label ("Admin", "Project Manager", ...) to the
     * canonical DB enum value.
     */
    function ccrm_normalize_role(?string $role): string {
        $r = strtolower(str_replace(' ', '_', trim((string)$role)));
        return in_array($r, ['admin', 'project_manager', 'viewer'], true) ? $r : 'viewer';
    }

    /** Map a DB enum role back to the label the frontend expects. */
    function ccrm_role_label(string $dbRole): string {
        switch ($dbRole) {
            case 'admin':           return 'Admin';
            case 'project_manager': return 'Project Manager';
            default:                return 'Viewer';
        }
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
                "SELECT `name` FROM `users` ORDER BY (`role` = 'admin') DESC, `name` ASC LIMIT 1"
            );
            $name = $stmt ? $stmt->fetchColumn() : false;
            $cached = ($name !== false && $name !== null) ? (string)$name : '';
        } catch (\Throwable $e) {
            $cached = '';
        }
        return $cached;
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
                    $_SERVER['REQUEST_URI'] ?? null,
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
     * unchanged. On any failure the plaintext is returned rather than lost.
     */
    function ccrm_encrypt_secret(string $plain): string {
        if ($plain === '' || $plain === CCRM_SECRET_MASK || strncmp($plain, 'enc:v1:', 7) === 0) {
            return $plain;
        }
        try {
            $iv  = random_bytes(12);
            $tag = '';
            $ct  = openssl_encrypt($plain, 'aes-256-gcm', ccrm_secret_key(), OPENSSL_RAW_DATA, $iv, $tag);
            if ($ct === false) {
                return $plain;
            }
            return 'enc:v1:' . base64_encode($iv . $tag . $ct);
        } catch (\Throwable $e) {
            return $plain;
        }
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
        } catch (\Throwable $e) {
            error_log('[ccrm audit_log] ' . $e->getMessage());
        }
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
     * Resolve the OpenAI chat model to use, from the admin-configured
     * INTEGRATIONS_CONFIG, falling back to a sane default. Centralised so the
     * default is not scattered as a literal across every AI endpoint.
     */
    function ccrm_ai_model(array $config = [], string $default = 'gpt-5.6-luna'): string {
        $m = $config['aiModel'] ?? ($config['openAiModel'] ?? '');
        return (is_string($m) && $m !== '') ? $m : $default;
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
}
