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

    function ccrm_current_user(): ?array {
        ccrm_start_session();
        if (empty($_SESSION['ccrm_uid'])) {
            return null;
        }
        return [
            'id'    => $_SESSION['ccrm_uid'],
            'role'  => $_SESSION['ccrm_role'] ?? 'viewer',
            'email' => $_SESSION['ccrm_email'] ?? '',
        ];
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
     * Log a PHP exception/error to the error_logs database table.
     */
    function ccrm_log_exception(\Throwable $e): void {
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
            'openAiKey', 'smtpPassword', 'exchClientSecret', 'exchPassword',
            'metaAppSecret', 'metaAccessToken', 'googleClientSecret',
            'googleRefreshToken', 'googleDevToken', 'mariaDbPassword',
            'qdrantApiKey', 'pineconeApiKey',
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
    function ccrm_ai_model(array $config = [], string $default = 'gpt-4o-mini'): string {
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
