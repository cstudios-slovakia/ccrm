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
                    file_get_contents('php://input') ?: null
                ]);
            }
        } catch (\Throwable $ex) {
            error_log("Failed to log exception to DB: " . $ex->getMessage() . " | Original: " . $e->getMessage());
        }
    }
}
