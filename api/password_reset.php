<?php
/**
 * Self-service password reset over email.
 *
 * This flow is only available when the CRM has a working outbound mail server
 * configured — i.e. at least one user (preferably an admin) has validated SMTP
 * credentials stored in `users.metadata_json -> emailSettings`. That account is
 * used as the system sender. When no such mailbox exists the endpoint reports
 * `available: false` and the UI falls back to "contact your administrator".
 *
 * Actions (action= query param or JSON field):
 *   - status  : { success, available }            — is email reset possible?
 *   - request : { email, lang? } -> generic ok    — emails a reset link (anti-enumeration)
 *   - reset   : { token, password } -> ok/fail    — sets a new password
 *
 * Security:
 *   - Tokens are 256-bit random, single-use, and expire after 1 hour.
 *   - `request` always returns a generic success so callers cannot enumerate
 *     which emails exist.
 *   - New passwords are stored as bcrypt hashes via ccrm_hash_password().
 */
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('GET, POST, OPTIONS');

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'installed' => false, 'message' => 'CRM is not installed yet.']);
    exit;
}
require_once $configFile;

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$input  = json_decode(file_get_contents('php://input'), true) ?: [];
$action = (string)($_GET['action'] ?? $input['action'] ?? 'status');

/** Derive SMTP username/password from an emailSettings array. */
function ccrm_pwreset_get_smtp_credentials(array $settings): array {
    $user = !empty($settings['smtpUsername']) ? $settings['smtpUsername'] : ($settings['username'] ?? '');
    $pass = !empty($settings['smtpPassword']) ? $settings['smtpPassword'] : ($settings['password'] ?? '');
    return [(string)$user, (string)$pass];
}

/**
 * Locate a usable outbound mailbox among all users. Prefers validated configs
 * and admins. Returns the emailSettings array or null if none is usable.
 */
function ccrm_pwreset_find_sender(PDO $pdo): ?array {
    $rows = $pdo->query("SELECT `role`, `metadata_json` FROM `users`")->fetchAll(PDO::FETCH_ASSOC);
    $best = null;
    $bestScore = -1;
    foreach ($rows as $r) {
        $meta = json_decode((string)($r['metadata_json'] ?? ''), true);
        if (!is_array($meta) || empty($meta['emailSettings']) || !is_array($meta['emailSettings'])) {
            continue;
        }
        $es = ccrm_decrypt_email_settings($meta['emailSettings']);
        $provider = $es['provider'] ?? 'smtp';
        $hasHost = !empty($es['smtpHost']) || $provider === 'exchange';
        list($u, $p) = ccrm_pwreset_get_smtp_credentials($es);
        if (!$hasHost || $u === '' || $p === '') {
            continue;
        }
        $score = 0;
        if (!empty($es['isValidated'])) $score += 2;
        if (($r['role'] ?? '') === 'admin') $score += 1;
        if ($score > $bestScore) {
            $bestScore = $score;
            $best = $es;
        }
    }
    return $best;
}

/** Ensure the reset-token table exists (self-migrating, independent of setup). */
function ccrm_pwreset_ensure_table(PDO $pdo): void {
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS `password_resets` (
          `token` VARCHAR(64) NOT NULL,
          `user_id` VARCHAR(50) NOT NULL,
          `expires_at` DATETIME NOT NULL,
          `used` TINYINT(1) NOT NULL DEFAULT 0,
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`token`),
          INDEX `idx_pwreset_user` (`user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

/** Minimal raw-SMTP sender (mirrors mail_broker.php::send_smtp_email). */
function ccrm_pwreset_send_smtp_email(array $settings, string $to, string $subject, string $html): void {
    $host = $settings['smtpHost'] ?? '';
    $port = intval($settings['smtpPort'] ?? 0);

    if (($settings['provider'] ?? '') === 'exchange') {
        $host = 'smtp.office365.com';
        $port = 587;
    }

    list($smtpUser, $smtpPass) = ccrm_pwreset_get_smtp_credentials($settings);

    $sec = $settings['smtpSecure'] ?? 'ssl';
    $secure = ($sec === 'ssl' || $sec === true) ? 'ssl://' : '';
    if ($port === 587 || $sec === 'tls') {
        $secure = '';
    }

    $socket = @fsockopen($secure . $host, $port, $errno, $errstr, 10);
    if (!$socket) {
        throw new Exception("Could not connect to SMTP server: $errstr ($errno)");
    }

    $serverName = $_SERVER['SERVER_NAME'] ?? ($_SERVER['HTTP_HOST'] ?? 'localhost');

    fgets($socket, 515);
    fwrite($socket, "EHLO " . $serverName . "\r\n");
    fgets($socket, 515);

    if ($port === 587 || $sec === 'tls') {
        fwrite($socket, "STARTTLS\r\n");
        fgets($socket, 515);
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new Exception("TLS encryption handshake negotiation failed.");
        }
        fwrite($socket, "EHLO " . $serverName . "\r\n");
        fgets($socket, 515);
    }

    fwrite($socket, "AUTH LOGIN\r\n");
    fgets($socket, 515);
    fwrite($socket, base64_encode($smtpUser) . "\r\n");
    fgets($socket, 515);
    fwrite($socket, base64_encode($smtpPass) . "\r\n");
    $authResponse = fgets($socket, 515);
    if (strpos((string)$authResponse, '235') === false) {
        throw new Exception("SMTP Authentication failed: " . $authResponse);
    }

    fwrite($socket, "MAIL FROM: <" . $smtpUser . ">\r\n");
    fgets($socket, 515);
    fwrite($socket, "RCPT TO: <" . $to . ">\r\n");
    fgets($socket, 515);
    fwrite($socket, "DATA\r\n");
    fgets($socket, 515);

    $headers  = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: <" . $smtpUser . ">\r\n";
    $headers .= "To: <" . $to . ">\r\n";
    $headers .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
    $headers .= "Date: " . date('r') . "\r\n\r\n";

    fwrite($socket, $headers . $html . "\r\n.\r\n");
    fgets($socket, 515);
    fwrite($socket, "QUIT\r\n");
    fclose($socket);
}

// ---------------------------------------------------------------------------

if ($action === 'status') {
    echo json_encode(['success' => true, 'available' => ccrm_pwreset_find_sender($pdo) !== null]);
    exit;
}

if ($action === 'request') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
        exit;
    }

    $email = trim((string)($input['email'] ?? ''));
    $lang  = in_array(($input['lang'] ?? 'en'), ['sk', 'hu', 'en'], true) ? $input['lang'] : 'en';

    // Rate limit reset requests per client IP to prevent mail-bombing a victim
    // and abusing the configured SMTP sender. Fail-open on any throttle error.
    $clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `password_reset_attempts` (
            `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
            `ip` VARCHAR(45) NULL,
            `email` VARCHAR(255) NULL,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_pwreset_ip_time` (`ip`, `created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
        $rl = $pdo->prepare("SELECT COUNT(*) FROM `password_reset_attempts` WHERE `ip` = ? AND `created_at` > (NOW() - INTERVAL 15 MINUTE)");
        $rl->execute([$clientIp]);
        if ((int)$rl->fetchColumn() >= 5) {
            http_response_code(429);
            // Generic body preserves anti-enumeration.
            echo json_encode(['success' => true, 'available' => true]);
            exit;
        }
        $pdo->prepare("INSERT INTO `password_reset_attempts` (`ip`, `email`) VALUES (?, ?)")->execute([$clientIp, $email]);
    } catch (\Throwable $e) {
        // fail open — never block legitimate resets because of a throttle-store error
    }

    $sender = ccrm_pwreset_find_sender($pdo);
    if ($sender === null) {
        // No outbound mailbox configured — caller should show the contact-admin note.
        echo json_encode(['success' => true, 'available' => false]);
        exit;
    }

    if ($email !== '') {
        $stmt = $pdo->prepare("SELECT `id`, `email`, `name` FROM `users` WHERE `email` = ? LIMIT 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user) {
            try {
                ccrm_pwreset_ensure_table($pdo);
                // One active token per user.
                $pdo->prepare("DELETE FROM `password_resets` WHERE `user_id` = ?")->execute([$user['id']]);

                $token = bin2hex(random_bytes(32));
                $ins = $pdo->prepare(
                    "INSERT INTO `password_resets` (`token`, `user_id`, `expires_at`, `used`)
                     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), 0)"
                );
                $ins->execute([$token, $user['id']]);

                $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                $host = $_SERVER['HTTP_HOST'] ?? '';
                $resetLink = $scheme . '://' . $host . '/?reset_token=' . $token;

                $name = htmlspecialchars((string)($user['name'] ?? ''), ENT_QUOTES, 'UTF-8');
                if ($lang === 'sk') {
                    $subject = 'Obnovenie hesla — CCRM';
                    $intro   = 'Dobrý deň' . ($name ? ' ' . $name : '') . ',';
                    $body    = 'prijali sme žiadosť o obnovenie hesla k vášmu účtu CCRM. Pre nastavenie nového hesla kliknite na tlačidlo nižšie. Odkaz je platný 1 hodinu.';
                    $btn     = 'Obnoviť heslo';
                    $ignore  = 'Ak ste o obnovenie hesla nežiadali, tento e-mail môžete ignorovať.';
                } elseif ($lang === 'hu') {
                    $subject = 'Jelszó visszaállítása — CCRM';
                    $intro   = 'Kedves' . ($name ? ' ' . $name : '') . ',';
                    $body    = 'kérelmet kaptunk a CCRM-fiókja jelszavának visszaállítására. Az új jelszó beállításához kattintson az alábbi gombra. A link 1 óráig érvényes.';
                    $btn     = 'Jelszó visszaállítása';
                    $ignore  = 'Ha nem Ön kérte a jelszó visszaállítását, hagyja figyelmen kívül ezt az e-mailt.';
                } else {
                    $subject = 'Password reset — CCRM';
                    $intro   = 'Hello' . ($name ? ' ' . $name : '') . ',';
                    $body    = 'we received a request to reset the password for your CCRM account. Click the button below to set a new password. This link is valid for 1 hour.';
                    $btn     = 'Reset password';
                    $ignore  = 'If you did not request a password reset, you can safely ignore this email.';
                }

                $safeLink = htmlspecialchars($resetLink, ENT_QUOTES, 'UTF-8');
                $html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e293b">'
                    . '<h2 style="font-size:18px;margin:0 0 16px">CCRM</h2>'
                    . '<p style="font-size:14px;margin:0 0 8px">' . $intro . '</p>'
                    . '<p style="font-size:14px;line-height:1.5;margin:0 0 20px">' . $body . '</p>'
                    . '<p style="margin:0 0 20px"><a href="' . $safeLink . '" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px;font-size:14px">' . $btn . '</a></p>'
                    . '<p style="font-size:12px;color:#64748b;line-height:1.5;margin:0 0 8px;word-break:break-all">' . $safeLink . '</p>'
                    . '<p style="font-size:12px;color:#94a3b8;line-height:1.5;margin:16px 0 0">' . $ignore . '</p>'
                    . '</div>';

                ccrm_pwreset_send_smtp_email($sender, (string)$user['email'], $subject, $html);
            } catch (\Throwable $e) {
                // Swallow: never reveal delivery state to the caller.
                error_log('[ccrm password_reset] ' . $e->getMessage());
            }
        }
    }

    // Generic response regardless of whether the email exists / delivery worked.
    echo json_encode(['success' => true, 'available' => true]);
    exit;
}

if ($action === 'reset') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
        exit;
    }

    $token    = trim((string)($input['token'] ?? ''));
    $password = (string)($input['password'] ?? '');

    if ($token === '' || strlen($password) < 8) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'A valid token and a password of at least 8 characters are required.']);
        exit;
    }

    ccrm_pwreset_ensure_table($pdo);

    $stmt = $pdo->prepare("SELECT `user_id` FROM `password_resets` WHERE `token` = ? AND `used` = 0 AND `expires_at` > NOW() LIMIT 1");
    $stmt->execute([$token]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'This reset link is invalid or has expired.']);
        exit;
    }

    $hash = ccrm_hash_password($password);
    $pdo->beginTransaction();
    $pdo->prepare("UPDATE `users` SET `password_hash` = ? WHERE `id` = ?")->execute([$hash, $row['user_id']]);
    // Burn the token (and any siblings) so it cannot be reused.
    $pdo->prepare("DELETE FROM `password_resets` WHERE `user_id` = ?")->execute([$row['user_id']]);
    $pdo->commit();

    ccrm_audit_log($pdo, ['id' => $row['user_id'], 'email' => null], 'password.reset', 'Password reset via email token');

    echo json_encode(['success' => true]);
    exit;
}

http_response_code(400);
echo json_encode(['success' => false, 'message' => 'Unknown action.']);
