<?php
/**
 * "Sign in with Microsoft" for Exchange Online (Microsoft 365) mailboxes.
 *
 *   GET  ?action=status[&mailboxId=]   is the app registered, and is this mailbox signed in
 *                                      (the caller's own mailbox, or a company mailbox for an admin);
 *                                      &live=1 also asks Graph whether the sign-in still works
 *   POST ?action=start                 {target: 'user' | 'company', mailboxId?} -> {url} of Microsoft's sign-in page
 *   GET  ?code=…&state=…               Microsoft sends the browser back here (this address, without a query,
 *                                      is the redirect URI registered on the app)
 *   POST ?action=disconnect            {target, mailboxId?}: forget the sign-in
 *   GET  ?action=app                   admin: the app registration (the secret is never sent back)
 *   POST ?action=save_app              admin: {clientId, tenantId, clientSecret}; a masked or blank secret keeps the stored one
 *
 * The flow is the OAuth 2.0 authorization code flow with PKCE. `state` and the PKCE verifier
 * live in the PHP session of the user who started it, so the answer can only be completed by
 * that same signed-in user, once, within ten minutes. The tokens never reach the browser.
 */
require_once __DIR__ . '/brand.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/graph_client.php';

ccrm_send_cors('GET, POST, OPTIONS');

const CCRM_GRAPH_OAUTH_TTL = 600;

function ccrm_graph_oauth_json(array $payload, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode($payload);
    exit;
}

/**
 * The page the sign-in window ends on. It tells the window that opened it what happened and
 * closes itself; opened as a whole page instead (the pop-up was blocked), it goes back to the app.
 */
function ccrm_graph_oauth_page(array $result, string $appUrl, string $lang): void {
    $text = [
        'en' => ['ok' => 'The mailbox is connected. You can close this window.', 'fail' => 'The mailbox could not be connected.', 'back' => 'Back to the application'],
        'sk' => ['ok' => 'Schránka je pripojená. Toto okno môžete zavrieť.', 'fail' => 'Schránku sa nepodarilo pripojiť.', 'back' => 'Späť do aplikácie'],
        'hu' => ['ok' => 'A postafiók csatlakoztatva. Ezt az ablakot bezárhatja.', 'fail' => 'A postafiókot nem sikerült csatlakoztatni.', 'back' => 'Vissza az alkalmazáshoz'],
    ][in_array($lang, ['sk', 'hu'], true) ? $lang : 'en'];
    $flags = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT;
    $esc = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    http_response_code(200);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header('Referrer-Policy: no-referrer');
    echo '<!doctype html><html lang="' . $esc($lang) . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<title>' . $esc(KOPERNIQ_PRODUCT_NAME) . '</title>'
        . '<style>body{font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;color:#1e293b}'
        . 'main{max-width:420px;padding:32px;text-align:center}h1{font-size:18px;margin:0 0 12px}p{font-size:14px;line-height:1.5;margin:0 0 16px;color:#475569}a{color:#4f46e5;font-weight:600}</style></head><body><main>'
        . '<h1>' . $esc(!empty($result['ok']) ? $text['ok'] : $text['fail']) . '</h1>'
        . (empty($result['ok']) && !empty($result['error']) ? '<p>' . $esc($result['error']) . '</p>' : '')
        . ($appUrl !== '' ? '<p><a href="' . $esc($appUrl) . '">' . $esc($text['back']) . '</a></p>' : '')
        . '</main><script>(function(){var r=' . json_encode(['type' => 'ccrm-graph-oauth'] + $result, $flags) . ';'
        . 'try{if(window.opener&&!window.opener.closed){window.opener.postMessage(r,window.location.origin);window.close();return;}}catch(e){}'
        . ($appUrl !== '' && !empty($result['ok']) ? 'window.location.replace(' . json_encode($appUrl, $flags) . ');' : '')
        . '})();</script></body></html>';
    exit;
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    ccrm_graph_oauth_json(['success' => false, 'error' => (KOPERNIQ_PRODUCT_NAME . ' is not installed yet.')], 503);
}
require_once $configFile;

$isCallback = isset($_GET['state']) && (isset($_GET['code']) || isset($_GET['error']));
if (!$isCallback) {
    header('Content-Type: application/json');
}
$user = ccrm_current_user();
if ($user === null) {
    if ($isCallback) {
        ccrm_graph_oauth_page(['ok' => false, 'error' => 'You are no longer signed in to the application. Sign in and connect the mailbox again.'], '', 'en');
    }
    ccrm_require_auth();
}
if (!$isCallback && ccrm_is_cross_site_mutation()) {
    ccrm_graph_oauth_json(['success' => false, 'error' => 'Cross-origin request blocked.'], 403);
}

try {
    $pdo = get_db_connection();
} catch (\Throwable $e) {
    if ($isCallback) {
        ccrm_graph_oauth_page(['ok' => false, 'error' => 'Database connection failed.'], '', 'en');
    }
    ccrm_graph_oauth_json(['success' => false, 'error' => 'Database connection failed.'], 500);
}

$isAdmin = ccrm_is_admin($user);
$userRow = null;
$stmt = $pdo->prepare("SELECT `id`, `email`, `metadata_json` FROM `users` WHERE `id` = ?");
$stmt->execute([(string)($user['id'] ?? '')]);
$userRow = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
if (!$userRow) {
    if ($isCallback) {
        ccrm_graph_oauth_page(['ok' => false, 'error' => 'User not found.'], '', 'en');
    }
    ccrm_graph_oauth_json(['success' => false, 'error' => 'User not found.'], 404);
}

/** The stored profile of the caller's own mailbox, decrypted. */
$ownSettings = function () use ($userRow): array {
    $meta = json_decode((string)($userRow['metadata_json'] ?? ''), true);
    return ccrm_decrypt_email_settings(is_array($meta) ? ($meta['emailSettings'] ?? null) : null);
};
/** A company mailbox row, or null. Only an admin may name one. */
$companyRow = function (string $id) use ($pdo, $isAdmin): ?array {
    if (!$isAdmin || $id === '') {
        return null;
    }
    try {
        $q = $pdo->prepare("SELECT * FROM `company_mailboxes` WHERE `id` = ?");
        $q->execute([$id]);
        return $q->fetch(PDO::FETCH_ASSOC) ?: null;
    } catch (\Throwable $e) {
        return null;
    }
};
$companySettings = function (array $row): array {
    $decoded = json_decode((string)($row['settings_json'] ?? ''), true);
    return ccrm_decrypt_email_settings(is_array($decoded) ? $decoded : []);
};

// ── Microsoft sends the browser back ──────────────────────────────────────────
if ($isCallback) {
    $lang = 'en';
    try {
        $l = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'")->fetchColumn();
        $lang = is_string($l) && $l !== '' ? $l : 'en';
    } catch (\Throwable $e) {
    }
    $appUrl = ccrm_app_base_url($pdo);

    ccrm_start_session();
    $pending = $_SESSION['ccrm_graph_oauth'] ?? null;
    $state = (string)$_GET['state'];
    $stateMatches = is_array($pending) && hash_equals((string)($pending['state'] ?? ''), $state);
    // Single use once it is the answer to this request. An answer with another state (a stray or
    // hostile link) must not cancel a sign-in that is open in another window.
    if ($stateMatches || (is_array($pending) && (int)($pending['started'] ?? 0) < time() - CCRM_GRAPH_OAUTH_TTL)) {
        unset($_SESSION['ccrm_graph_oauth']);
    }
    if (!$stateMatches
        || (int)($pending['started'] ?? 0) < time() - CCRM_GRAPH_OAUTH_TTL || (string)($pending['user'] ?? '') !== (string)$userRow['id']) {
        ccrm_graph_oauth_page(['ok' => false, 'error' => 'This sign-in request has expired or was already used. Start it again from the e-mail settings.'], $appUrl, $lang);
    }
    $result = ['target' => $pending['target'], 'mailboxId' => $pending['mailboxId'] ?? ''];
    $fail = function (string $message) use ($result, $appUrl, $lang): void {
        ccrm_graph_oauth_page($result + ['ok' => false, 'error' => $message], $appUrl, $lang);
    };

    if (isset($_GET['error'])) {
        $code = (string)$_GET['error'];
        $description = trim(preg_replace('/\s+/', ' ', (string)($_GET['error_description'] ?? '')));
        if ($code === 'access_denied' && stripos($description, 'AADSTS65004') !== false) {
            $fail('The sign-in was cancelled.');
        }
        $needsAdmin = stripos($description, 'AADSTS65001') !== false || stripos($description, 'AADSTS90094') !== false || $code === 'consent_required';
        $fail($needsAdmin
            ? 'Your Microsoft 365 administrator has to approve this application for your organisation first.'
            : 'Microsoft did not complete the sign-in' . ($description !== '' ? ': ' . mb_substr($description, 0, 300, 'UTF-8') : ' (' . $code . ').'));
    }

    $app = ccrm_graph_app_config($pdo);
    if (!$app) {
        $fail('The Microsoft 365 app registration is missing.');
    }
    $token = ccrm_graph_token_request($app, [
        'grant_type' => 'authorization_code',
        'code' => (string)$_GET['code'],
        'redirect_uri' => (string)$pending['redirect'],
        'code_verifier' => (string)$pending['verifier'],
    ]);
    if (!$token['ok'] || empty($token['data']['refresh_token'])) {
        if (function_exists('ccrm_log_exception')) {
            ccrm_log_exception(new \RuntimeException('Graph token exchange failed: ' . ($token['data']['error'] ?? $token['status']) . ' ' . ($token['data']['error_description'] ?? '')));
        }
        $fail($token['ok']
            ? 'Microsoft did not grant offline access, so the mailbox could not stay connected.'
            : 'Microsoft refused to complete the sign-in (' . (string)($token['data']['error'] ?? $token['status']) . '). An administrator should check the app registration.');
    }

    // Who signed in.
    $me = ccrm_graph_http('GET', CCRM_GRAPH_BASE . '/me?%24select=mail,userPrincipalName', [
        'Authorization: Bearer ' . $token['data']['access_token'], 'Accept: application/json',
    ]);
    $profile = json_decode($me['body'], true);
    $account = strtolower(trim((string)(is_array($profile) ? ($profile['mail'] ?? '') ?: ($profile['userPrincipalName'] ?? '') : '')));
    if ($me['status'] !== 200 || $account === '') {
        $fail('The signed-in Microsoft account could not be read.');
    }

    $patch = [
        'provider' => 'microsoft365',
        'graphAccount' => $account,
        'graphRefreshToken' => (string)$token['data']['refresh_token'],
        'graphAccessToken' => json_encode(['t' => (string)$token['data']['access_token'], 'exp' => time() + max(60, (int)($token['data']['expires_in'] ?? 3600))]),
        'isValidated' => true,
    ];

    if ($pending['target'] === 'company') {
        $row = $companyRow((string)($pending['mailboxId'] ?? ''));
        if (!$row) {
            $fail('The company mailbox no longer exists.');
        }
        // The signed-in account has to be able to open that mailbox: its own, or a shared one it has access to.
        $probe = ccrm_graph_mailbox($pdo, 'company', (string)$row['id'], $patch, (string)$row['address']);
        try {
            ccrm_graph_request($probe, 'GET', '/mailFolders/inbox', ['$select' => 'id']);
        } catch (\Throwable $e) {
            $fail($account . ' cannot open the mailbox ' . $row['address'] . '. Sign in as that mailbox, or as someone with full access to it.');
        }
        unset($patch['isValidated']);
        $before = strtolower(trim((string)($companySettings($row)['graphAccount'] ?? '')));
        ccrm_graph_store_profile($pdo, 'company', (string)$row['id'], $patch, true);
        // The filing state (a delta link) belongs to the sign-in it was made with.
        if ($before !== $account) {
            $pdo->prepare("DELETE FROM `mail_sync_state` WHERE `mailbox_key` = ?")->execute(['c:' . $row['id']]);
        }
        $pdo->prepare("UPDATE `company_mailboxes` SET `last_error` = NULL WHERE `id` = ?")->execute([$row['id']]);
        ccrm_audit_log($pdo, $user, 'company_mailbox.microsoft_signin', 'Company mailbox ' . $row['address'] . ' signed in with Microsoft as ' . $account);
    } else {
        // A mailbox that was IMAP before must not keep its password beside the tokens.
        $before = strtolower(trim((string)($ownSettings()['graphAccount'] ?? '')));
        ccrm_graph_store_profile($pdo, 'user', (string)$userRow['id'], $patch, true);
        // Another account is another mailbox: its filing state (a delta link) starts over.
        if ($before !== $account) {
            try {
                $pdo->prepare("DELETE FROM `mail_sync_state` WHERE `mailbox_key` = ?")->execute(['u:' . $userRow['id']]);
            } catch (\Throwable $e) {
                // no filing state yet
            }
        }
    }
    ccrm_graph_oauth_page($result + ['ok' => true, 'account' => $account], $appUrl, $lang);
}

// ── everything else is JSON ───────────────────────────────────────────────────
$action = (string)($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$input = $method === 'POST' ? json_decode((string)file_get_contents('php://input'), true) : [];
if (!is_array($input)) {
    $input = [];
}

try {
    $app = ccrm_graph_app_config($pdo);

    if ($method === 'GET' && $action === 'status') {
        $mailboxId = trim((string)($_GET['mailboxId'] ?? ''));
        if ($mailboxId !== '') {
            $row = $companyRow($mailboxId);
            if (!$row) {
                ccrm_graph_oauth_json(['success' => false, 'error' => 'Mailbox not found.'], 404);
            }
            $settings = $companySettings($row);
            $mailbox = ccrm_graph_mailbox($pdo, 'company', (string)$row['id'], $settings, (string)$row['address']);
        } else {
            $settings = $ownSettings();
            $mailbox = ccrm_graph_mailbox($pdo, 'user', (string)$userRow['id'], $settings);
        }
        $isGraph = ($settings['provider'] ?? '') === 'microsoft365';
        $connected = ccrm_graph_is_connected($settings);
        $out = [
            'success' => true,
            'configured' => (bool)$app,
            'connected' => $connected,
            'account' => $isGraph ? (string)($settings['graphAccount'] ?? '') : '',
            // Signed in once, and the sign-in ran out or was revoked.
            'needsReconnect' => $isGraph && !$connected && (string)($settings['graphAccount'] ?? '') !== '',
        ];
        if ($connected && !empty($_GET['live'])) {
            require_once __DIR__ . '/mail_broker.php';
            require_once __DIR__ . '/graph_mail.php';
            $test = ccrm_graph_test($mailbox);
            if (!$test['success']) {
                $out['error'] = $test['error'];
                if (!empty($test['reconnect'])) {
                    $out['connected'] = false;
                    $out['needsReconnect'] = true;
                }
            }
        }
        ccrm_graph_oauth_json($out);
    }

    if ($method === 'GET' && $action === 'app') {
        if (!$isAdmin) {
            ccrm_graph_oauth_json(['success' => false, 'error' => 'Administrator privileges required.'], 403);
        }
        $own = ccrm_graph_app_stored($pdo);
        ccrm_graph_oauth_json([
            'success' => true,
            'clientId' => (string)($own['clientId'] ?? ''),
            'tenantId' => (string)($own['tenantId'] ?? ''),
            'clientSecret' => ($own['clientSecret'] ?? '') !== '' ? CCRM_SECRET_MASK : '',
            'configured' => (bool)$app,
            // 'integrations' = taken from the Exchange fields of the outbound mail profile.
            'source' => $app['source'] ?? null,
            'redirectUri' => ccrm_graph_redirect_uri($pdo),
        ]);
    }

    if ($method !== 'POST') {
        ccrm_graph_oauth_json(['success' => false, 'error' => 'Method not allowed.'], 405);
    }

    if ($action === 'save_app') {
        if (!$isAdmin) {
            ccrm_graph_oauth_json(['success' => false, 'error' => 'Administrator privileges required.'], 403);
        }
        $clientId = strtolower(trim((string)($input['clientId'] ?? '')));
        $tenantId = trim((string)($input['tenantId'] ?? ''));
        $secret = (string)($input['clientSecret'] ?? '');
        $own = ccrm_graph_app_stored($pdo);
        if ($secret === '' || $secret === CCRM_SECRET_MASK) {
            $secret = (string)($own['clientSecret'] ?? '');
        }
        if ($clientId === '' && $tenantId === '' && trim((string)($input['clientSecret'] ?? '')) === '') {
            $pdo->prepare("DELETE FROM `system_settings` WHERE `key` = 'MS_GRAPH_APP'")->execute();
            ccrm_audit_log($pdo, $user, 'microsoft_app.clear', 'Microsoft 365 app registration removed');
            ccrm_graph_oauth_json(['success' => true, 'configured' => (bool)ccrm_graph_app_config($pdo)]);
        }
        if (!ccrm_graph_is_guid($clientId)) {
            ccrm_graph_oauth_json(['success' => false, 'error' => 'The application (client) ID has to be the ID Microsoft shows for the app, for example 1b2c3d4e-0000-1111-2222-333344445555.'], 422);
        }
        if ($tenantId !== '' && ccrm_graph_tenant($tenantId) !== $tenantId) {
            ccrm_graph_oauth_json(['success' => false, 'error' => 'The directory (tenant) ID is not valid. Leave it empty for an app that accepts accounts of any organisation.'], 422);
        }
        if ($secret === '') {
            ccrm_graph_oauth_json(['success' => false, 'error' => 'The client secret is required.'], 422);
        }
        $value = json_encode(['clientId' => $clientId, 'tenantId' => $tenantId, 'clientSecret' => ccrm_encrypt_secret($secret)]);
        $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('MS_GRAPH_APP', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")->execute([$value]);
        ccrm_audit_log($pdo, $user, 'microsoft_app.save', 'Microsoft 365 app registration saved (client ' . $clientId . ')');
        ccrm_graph_oauth_json(['success' => true, 'configured' => true]);
    }

    $target = (($input['target'] ?? 'user') === 'company') ? 'company' : 'user';
    $mailboxId = trim((string)($input['mailboxId'] ?? ''));
    $row = null;
    if ($target === 'company') {
        $row = $companyRow($mailboxId);
        if (!$row) {
            ccrm_graph_oauth_json(['success' => false, 'error' => $isAdmin ? 'Mailbox not found.' : 'Administrator privileges required.'], $isAdmin ? 404 : 403);
        }
    }

    if ($action === 'start') {
        if (!$app) {
            ccrm_graph_oauth_json(['success' => false, 'error' => 'The Microsoft 365 app registration is missing. An administrator has to enter it in Settings first.'], 409);
        }
        $redirect = ccrm_graph_redirect_uri($pdo);
        $state = bin2hex(random_bytes(24));
        $verifier = rtrim(strtr(base64_encode(random_bytes(48)), '+/', '-_'), '=');
        ccrm_start_session();
        $_SESSION['ccrm_graph_oauth'] = [
            'state' => $state, 'verifier' => $verifier, 'redirect' => $redirect, 'started' => time(),
            'user' => (string)$userRow['id'], 'target' => $target, 'mailboxId' => $target === 'company' ? (string)$row['id'] : '',
        ];
        $scopes = CCRM_GRAPH_SCOPES;
        $hint = '';
        if ($target === 'company') {
            $scopes .= ' ' . CCRM_GRAPH_SHARED_SCOPES;
        } else {
            $hint = (string)($ownSettings()['graphAccount'] ?? '');
        }
        ccrm_graph_oauth_json([
            'success' => true,
            'url' => ccrm_graph_authorize_url($app, $redirect, $state, ccrm_graph_pkce_challenge($verifier), $scopes, $hint),
            // So the page can tell "signed in just now" from "was signed in all along".
            'connected' => ccrm_graph_is_connected($target === 'company' ? $companySettings($row) : $ownSettings()),
        ]);
    }

    if ($action === 'disconnect') {
        if ($target === 'company') {
            ccrm_graph_store_profile($pdo, 'company', (string)$row['id'], ['graphRefreshToken' => '', 'graphAccessToken' => '', 'graphAccount' => '']);
            ccrm_audit_log($pdo, $user, 'company_mailbox.microsoft_signout', 'Company mailbox ' . $row['address'] . ' signed out of Microsoft');
        } else {
            ccrm_graph_store_profile($pdo, 'user', (string)$userRow['id'], ['graphRefreshToken' => '', 'graphAccessToken' => '', 'graphAccount' => '', 'isValidated' => false]);
        }
        ccrm_graph_oauth_json(['success' => true]);
    }

    ccrm_graph_oauth_json(['success' => false, 'error' => 'Unknown action.'], 400);
} catch (\Throwable $e) {
    if (function_exists('ccrm_log_exception')) {
        ccrm_log_exception($e);
    }
    ccrm_graph_oauth_json(['success' => false, 'error' => 'The request failed.'], 500);
}
