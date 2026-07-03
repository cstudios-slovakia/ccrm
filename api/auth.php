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

    /**
     * Start (or resume) a hardened session.
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
        return is_array($cfg) ? $cfg : [];
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
        $encoded = json_encode($incoming, JSON_INVALID_UTF8_SUBSTITUTE);
        return $encoded === false ? $incomingJson : $encoded;
    }
}
