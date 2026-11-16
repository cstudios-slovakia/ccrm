<?php
/**
 * Checks for "Sign in with Microsoft" (api/graph_oauth.php), over real HTTP: the script
 * builds a throw-away web root with a copy of the api folder, starts PHP's built-in server on
 * it and drives the endpoint the way a browser would (cookies, redirects back from Microsoft).
 * Microsoft itself is replaced by a fake inside that server, so nothing leaves the machine.
 *
 *   CCRM_TEST_DSN="mysql:host=db;dbname=graph_scratch;charset=utf8mb4" CCRM_TEST_USER=root CCRM_TEST_PASS=x \
 *   php scripts/test-graph-oauth.php
 *
 * It needs a SCRATCH MySQL database: every table in it is DROPPED first. Never point it at
 * real data. CCRM_API_DIR overrides the folder that holds the api files.
 */
$api = realpath(getenv('CCRM_API_DIR') ?: __DIR__ . '/../public/api');
$dsn = getenv('CCRM_TEST_DSN');
if (!$dsn) {
    echo "skip (set CCRM_TEST_DSN to a SCRATCH MySQL database to run the sign-in checks)\n";
    exit(0);
}
$dbUser = getenv('CCRM_TEST_USER') ?: 'root';
$dbPass = getenv('CCRM_TEST_PASS') ?: '';

$fails = 0;
$check = function (string $name, bool $ok, string $detail = '') use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . ($ok || $detail === '' ? '' : "  [$detail]") . "\n";
    if (!$ok) { $fails++; }
};

// ── a throw-away web root ─────────────────────────────────────────────────────
$root = sys_get_temp_dir() . '/ccrm-graph-oauth-' . bin2hex(random_bytes(4));
mkdir($root . '/api', 0777, true);
mkdir($root . '/sessions', 0777, true);
$copy = function (string $from, string $to) use (&$copy) {
    foreach (scandir($from) as $f) {
        if ($f === '.' || $f === '..') continue;
        if (is_dir("$from/$f")) { @mkdir("$to/$f"); $copy("$from/$f", "$to/$f"); }
        elseif (substr($f, -4) === '.php') copy("$from/$f", "$to/$f");
    }
};
$copy($api, $root . '/api');
$export = fn($v) => var_export($v, true);
file_put_contents($root . '/config.php', "<?php\ndefine('DB_PASS', " . $export($dbPass) . ");\ndefine('CCRM_SECRET_KEY', 'test-key-for-graph-oauth-checks-only');\n"
    . "define('CCRM_APP_URL', 'http://127.0.0.1:PORT/');\n"
    . "function get_db_connection() { static \$p = null; if (!\$p) { \$p = new PDO(" . $export($dsn) . ", " . $export($dbUser) . ", " . $export($dbPass)
    . ", [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]); } return \$p; }\n");
// Runs before every request: Microsoft is a fake, and /login.php signs a test user in.
file_put_contents($root . '/prepend.php', <<<'PHP'
<?php
ini_set('session.save_path', __DIR__ . '/sessions');
$GLOBALS['ccrm_graph_transport'] = function (string $method, string $url, array $headers, ?string $body) {
    $json = fn(int $s, $d) => ['status' => $s, 'headers' => [], 'body' => json_encode($d)];
    if (strpos($url, 'https://login.microsoftonline.com/') === 0) {
        parse_str((string)$body, $f);
        file_put_contents(__DIR__ . '/token-requests.log', json_encode($f + ['url' => $url]) . "\n", FILE_APPEND);
        if (($f['grant_type'] ?? '') !== 'authorization_code' || strpos((string)($f['code'] ?? ''), 'CODE-') !== 0 || ($f['client_secret'] ?? '') !== 'app-secret') {
            return $json(400, ['error' => 'invalid_grant', 'error_description' => 'bad code']);
        }
        // PKCE: the verifier has to hash to the challenge the fake "saw" (the test passes it along in the code).
        list(, $who, $challenge) = explode('|', $f['code']) + [null, '', ''];
        if (rtrim(strtr(base64_encode(hash('sha256', (string)($f['code_verifier'] ?? ''), true)), '+/', '-_'), '=') !== $challenge) {
            return $json(400, ['error' => 'invalid_grant', 'error_description' => 'PKCE verification failed']);
        }
        return $json(200, ['access_token' => 'AT-' . $who, 'refresh_token' => 'RT-' . $who, 'expires_in' => 3600]);
    }
    $who = '';
    foreach ($headers as $h) if (stripos($h, 'Authorization: Bearer AT-') === 0) $who = substr($h, 25);
    $path = (string)parse_url($url, PHP_URL_PATH);
    if ($path === '/v1.0/me') return $json(200, ['mail' => $who, 'userPrincipalName' => $who]);
    if ($path === '/v1.0/me/mailFolders/inbox') return $json(200, ['id' => 'inbox']);
    if (preg_match('#^/v1.0/users/([^/]+)/mailFolders/inbox$#', $path, $m)) {
        return rawurldecode($m[1]) === 'info@laminam.sk' && $who === 'admin@laminam.sk' ? $json(200, ['id' => 'inbox']) : $json(403, ['error' => ['code' => 'ErrorAccessDenied', 'message' => 'Access is denied.']]);
    }
    return $json(404, ['error' => ['code' => 'NotFound', 'message' => $path]]);
};
if (PHP_SAPI !== 'cli' && strtok($_SERVER['REQUEST_URI'], '?') === '/login.php') {
    require_once __DIR__ . '/api/auth.php';
    ccrm_start_session();
    $_SESSION['ccrm_uid'] = $_GET['id'];
    $_SESSION['ccrm_role'] = $_GET['role'];
    $_SESSION['ccrm_email'] = $_GET['email'];
    $_SESSION['ccrm_checked_at'] = time();
    echo 'ok';
    exit;
}
PHP);
file_put_contents($root . '/login.php', "<?php\n");

// ── the scratch database ──────────────────────────────────────────────────────
define('CCRM_SECRET_KEY', 'test-key-for-graph-oauth-checks-only');
require_once $root . '/api/auth.php';
require_once $root . '/api/schema.php';
$pdo = new PDO($dsn, $dbUser, $dbPass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
if (stripos((string)$pdo->query("SELECT DATABASE()")->fetchColumn(), 'scratch') === false) {
    echo "REFUSING: the database name does not contain \"scratch\". This script drops every table.\n";
    exit(2);
}
foreach ($pdo->query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()")->fetchAll(PDO::FETCH_COLUMN) as $t) {
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    $pdo->exec("DROP TABLE IF EXISTS `$t`");
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
}
ccrm_apply_schema($pdo);
$pdo->exec("DELETE FROM `users`");
$insUser = $pdo->prepare("INSERT INTO `users` (`id`, `email`, `password_hash`, `name`, `role`, `color`, `metadata_json`) VALUES (?, ?, 'x', ?, ?, '#000', ?)");
$insUser->execute(['u-admin', 'admin@crm.test', 'Admin', 'Admin', json_encode(['theme' => 'dark', 'emailSettings' => ['provider' => 'smtp', 'imapHost' => 'imap.old', 'imapPassword' => ccrm_encrypt_secret('old-password'), 'isValidated' => true]])]);
$insUser->execute(['u-jana', 'jana@crm.test', 'Jana', 'Sales', null]);
$pdo->exec("INSERT INTO `company_mailboxes` (`id`, `name`, `address`, `settings_json`, `is_active`) VALUES ('cmb-info', 'Info', 'info@laminam.sk', '{\"provider\":\"microsoft365\"}', 1)");

// ── the server ────────────────────────────────────────────────────────────────
$port = 18000 + random_int(0, 900);
file_put_contents($root . '/config.php', str_replace('PORT', (string)$port, file_get_contents($root . '/config.php')));
$server = proc_open(
    [PHP_BINARY, '-S', '127.0.0.1:' . $port, '-t', $root, '-d', 'auto_prepend_file=' . $root . '/prepend.php', '-d', 'display_errors=0'],
    [0 => ['pipe', 'r'], 1 => ['file', $root . '/server.log', 'a'], 2 => ['file', $root . '/server.log', 'a']],
    $pipes
);
$base = 'http://127.0.0.1:' . $port;
for ($i = 0; $i < 50 && !@fsockopen('127.0.0.1', $port); $i++) usleep(100000);
$cleanup = function () use ($server, $root) {
    @proc_terminate($server);
    $rm = function ($d) use (&$rm) {
        foreach (@scandir($d) ?: [] as $f) { if ($f === '.' || $f === '..') continue; is_dir("$d/$f") ? $rm("$d/$f") : @unlink("$d/$f"); }
        @rmdir($d);
    };
    $rm($root);
};

/** One browser: its own cookie jar. Returns [status, body]. */
$browser = function () use ($base, $root) {
    $jar = $root . '/jar-' . bin2hex(random_bytes(3));
    return function (string $method, string $path, $json = null, array $headers = []) use ($base, $jar) {
        $ch = curl_init($base . $path);
        curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $jar, CURLOPT_COOKIEFILE => $jar, CURLOPT_TIMEOUT => 20]);
        if ($json !== null) { curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($json)); $headers[] = 'Content-Type: application/json'; }
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        $body = (string)curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return [$status, $body];
    };
};
$jsonOf = fn($res) => json_decode($res[1], true) ?: [];
/** What the sign-in window would post to the page that opened it. */
$pageResult = function ($res) {
    return preg_match('/var r=(\{.*?\});/s', $res[1], $m) ? (json_decode($m[1], true) ?: []) : [];
};
$emailSettings = function (string $userId) use ($pdo) {
    $s = $pdo->prepare("SELECT `metadata_json` FROM `users` WHERE `id` = ?");
    $s->execute([$userId]);
    $meta = json_decode((string)$s->fetchColumn(), true);
    return [$meta, ccrm_decrypt_email_settings($meta['emailSettings'] ?? null)];
};
/** Starts a sign-in and returns [state, the "code" Microsoft would hand out for that account]. */
$start = function (callable $http, array $body, string $account) use ($jsonOf) {
    $res = $http('POST', '/api/graph_oauth.php?action=start', $body);
    parse_str((string)parse_url((string)($jsonOf($res)['url'] ?? ''), PHP_URL_QUERY), $q);
    return [$res, $q, 'CODE-|' . $account . '|' . ($q['code_challenge'] ?? '')];
};

try {
    $anon = $browser();
    $check('nobody who is not signed in gets an answer', $anon('GET', '/api/graph_oauth.php?action=status')[0] === 401);
    $check('...and Microsoft\'s answer without a session connects nothing', strpos($anon('GET', '/api/graph_oauth.php?code=x&state=y')[1], '"ok":false') !== false);

    $admin = $browser();
    $admin('GET', '/login.php?id=u-admin&role=Admin&email=' . urlencode('admin@crm.test'));
    $jana = $browser();
    $jana('GET', '/login.php?id=u-jana&role=Sales&email=' . urlencode('jana@crm.test'));

    // the app registration
    $st = $jsonOf($admin('GET', '/api/graph_oauth.php?action=status'));
    $check('before the app is registered, the status says so', ($st['success'] ?? false) === true && $st['configured'] === false && $st['connected'] === false);
    $check('...and a sign-in cannot be started', $admin('POST', '/api/graph_oauth.php?action=start', ['target' => 'user'])[0] === 409);
    $check('only an admin may read or save the app registration',
        $jana('GET', '/api/graph_oauth.php?action=app')[0] === 403 && $jana('POST', '/api/graph_oauth.php?action=save_app', ['clientId' => '1b2c3d4e-0000-1111-2222-333344445555', 'clientSecret' => 's'])[0] === 403);
    $check('a client id that is not one is refused', $admin('POST', '/api/graph_oauth.php?action=save_app', ['clientId' => 'my app', 'clientSecret' => 's'])[0] === 422);
    $check('a registration without a secret is refused', $admin('POST', '/api/graph_oauth.php?action=save_app', ['clientId' => '1b2c3d4e-0000-1111-2222-333344445555', 'clientSecret' => ''])[0] === 422);
    $saved = $admin('POST', '/api/graph_oauth.php?action=save_app', ['clientId' => '1B2C3D4E-0000-1111-2222-333344445555', 'tenantId' => '', 'clientSecret' => 'app-secret']);
    $app = $jsonOf($admin('GET', '/api/graph_oauth.php?action=app'));
    $raw = (string)$pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'MS_GRAPH_APP'")->fetchColumn();
    $check('the registration is saved, its secret encrypted and never sent back',
        $saved[0] === 200 && $app['configured'] === true && $app['clientSecret'] === '********' && $app['clientId'] === '1b2c3d4e-0000-1111-2222-333344445555'
        && strpos($raw, 'app-secret') === false && strpos($raw, 'enc:v1:') !== false && $app['redirectUri'] === $base . '/api/graph_oauth.php', $raw);
    $admin('POST', '/api/graph_oauth.php?action=save_app', ['clientId' => '1b2c3d4e-0000-1111-2222-333344445555', 'tenantId' => '', 'clientSecret' => '********']);
    $check('saving again with the mask keeps the stored secret', strpos((string)json_encode(ccrm_decrypt_config_secrets(json_decode((string)$pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'MS_GRAPH_APP'")->fetchColumn(), true), ['clientSecret'])), 'app-secret') !== false);

    // a personal mailbox
    list($res, $q, $code) = $start($jana, ['target' => 'user'], 'jana@laminam.sk');
    $check('a sign-in starts with a state, a PKCE challenge and this installation\'s redirect address',
        $res[0] === 200 && strlen((string)($q['state'] ?? '')) >= 32 && ($q['code_challenge_method'] ?? '') === 'S256' && ($q['redirect_uri'] ?? '') === $base . '/api/graph_oauth.php'
        && strpos((string)$q['scope'], 'Mail.ReadWrite') !== false && strpos((string)$q['scope'], '.Shared') === false, $res[1]);
    $check('an answer with a state that was never issued connects nothing', ($pageResult($jana('GET', '/api/graph_oauth.php?code=' . urlencode($code) . '&state=' . str_repeat('a', 48)))['ok'] ?? null) === false);
    $check('...and uses the pending request up', ($pageResult($jana('GET', '/api/graph_oauth.php?code=' . urlencode($code) . '&state=' . urlencode($q['state'])))['ok'] ?? null) === false);

    list($res, $q, $code) = $start($jana, ['target' => 'user'], 'jana@laminam.sk');
    $stolen = $pageResult($admin('GET', '/api/graph_oauth.php?code=' . urlencode($code) . '&state=' . urlencode($q['state'])));
    $check('another signed-in user cannot complete somebody else\'s sign-in', ($stolen['ok'] ?? null) === false && $emailSettings('u-admin')[1]['provider'] === 'smtp');
    $done = $pageResult($jana('GET', '/api/graph_oauth.php?code=' . urlencode($code) . '&state=' . urlencode($q['state'])));
    list($meta, $es) = $emailSettings('u-jana');
    $check('the user who started it completes it: the mailbox is connected as the account that signed in',
        ($done['ok'] ?? null) === true && $done['account'] === 'jana@laminam.sk' && $done['type'] === 'ccrm-graph-oauth'
        && $es['provider'] === 'microsoft365' && $es['graphAccount'] === 'jana@laminam.sk' && $es['graphRefreshToken'] === 'RT-jana@laminam.sk' && $es['isValidated'] === true, json_encode($done));
    $check('the tokens are stored encrypted and are not on the page the browser gets',
        strpos((string)$meta['emailSettings']['graphRefreshToken'], 'enc:v1:') === 0 && strpos(json_encode($done), 'RT-') === false && strpos(json_encode($done), 'AT-') === false);
    $check('the same answer cannot be used twice', ($pageResult($jana('GET', '/api/graph_oauth.php?code=' . urlencode($code) . '&state=' . urlencode($q['state'])))['ok'] ?? null) === false);
    $log = array_map(fn($l) => json_decode($l, true), file($root . '/token-requests.log', FILE_IGNORE_NEW_LINES));
    $last = end($log);
    $check('the code is exchanged with the client secret, the PKCE verifier and the same redirect address',
        $last['client_secret'] === 'app-secret' && strlen($last['code_verifier']) >= 43 && $last['redirect_uri'] === $base . '/api/graph_oauth.php' && strpos($last['url'], '/common/oauth2/v2.0/token') !== false);
    $st = $jsonOf($jana('GET', '/api/graph_oauth.php?action=status&live=1'));
    $check('the status then says connected, and the live check agrees', $st['connected'] === true && $st['account'] === 'jana@laminam.sk' && $st['needsReconnect'] === false && !isset($st['error']), json_encode($st));

    // replacing an IMAP mailbox
    list($res, $q, $code) = $start($admin, ['target' => 'user'], 'admin@laminam.sk');
    $admin('GET', '/api/graph_oauth.php?code=' . urlencode($code) . '&state=' . urlencode($q['state']));
    list($meta, $es) = $emailSettings('u-admin');
    $check('signing in replaces an IMAP profile, leaves no password behind and keeps the user\'s other settings',
        $es['provider'] === 'microsoft365' && !isset($es['imapPassword']) && !isset($es['imapHost']) && $meta['theme'] === 'dark');

    // Microsoft says no
    list($res, $q) = $start($jana, ['target' => 'user'], 'jana@laminam.sk');
    $denied = $pageResult($jana('GET', '/api/graph_oauth.php?error=access_denied&error_description=' . urlencode('AADSTS65001: The user or administrator has not consented') . '&state=' . urlencode($q['state'])));
    $check('a tenant that does not allow user consent is told to ask its administrator, and the mailbox stays as it was',
        ($denied['ok'] ?? null) === false && strpos((string)$denied['error'], 'administrator has to approve') !== false && $emailSettings('u-jana')[1]['graphRefreshToken'] === 'RT-jana@laminam.sk', json_encode($denied));

    // a cross-site page cannot start or undo a sign-in
    $check('a request from another site is refused', $jana('POST', '/api/graph_oauth.php?action=disconnect', ['target' => 'user'], ['Sec-Fetch-Site: cross-site'])[0] === 403
        && $emailSettings('u-jana')[1]['graphRefreshToken'] === 'RT-jana@laminam.sk');

    // company mailboxes
    $check('only an admin may connect a company mailbox', $jana('POST', '/api/graph_oauth.php?action=start', ['target' => 'company', 'mailboxId' => 'cmb-info'])[0] === 403
        && $jana('GET', '/api/graph_oauth.php?action=status&mailboxId=cmb-info')[0] === 404);
    list($res, $q, $code) = $start($admin, ['target' => 'company', 'mailboxId' => 'cmb-info'], 'stranger@laminam.sk');
    $check('a company mailbox sign-in also asks for access to shared mailboxes', strpos((string)($q['scope'] ?? ''), 'Mail.ReadWrite.Shared') !== false && strpos((string)$q['scope'], 'Mail.Send.Shared') !== false);
    $no = $pageResult($admin('GET', '/api/graph_oauth.php?code=' . urlencode($code) . '&state=' . urlencode($q['state'])));
    $boxSettings = fn() => ccrm_decrypt_email_settings(json_decode((string)$pdo->query("SELECT `settings_json` FROM `company_mailboxes` WHERE `id` = 'cmb-info'")->fetchColumn(), true));
    $check('an account that cannot open the shared mailbox does not connect it', ($no['ok'] ?? null) === false && strpos((string)$no['error'], 'cannot open the mailbox info@laminam.sk') !== false && empty($boxSettings()['graphRefreshToken']), json_encode($no));
    list($res, $q, $code) = $start($admin, ['target' => 'company', 'mailboxId' => 'cmb-info'], 'admin@laminam.sk');
    $yes = $pageResult($admin('GET', '/api/graph_oauth.php?code=' . urlencode($code) . '&state=' . urlencode($q['state'])));
    $check('an account with access connects it, and the page says which mailbox it was',
        ($yes['ok'] ?? null) === true && $yes['target'] === 'company' && $yes['mailboxId'] === 'cmb-info' && $boxSettings()['graphRefreshToken'] === 'RT-admin@laminam.sk' && $boxSettings()['graphAccount'] === 'admin@laminam.sk', json_encode($yes));
    $st = $jsonOf($admin('GET', '/api/graph_oauth.php?action=status&mailboxId=cmb-info&live=1'));
    $check('...and its status is connected', $st['connected'] === true && $st['account'] === 'admin@laminam.sk' && !isset($st['error']), json_encode($st));
    $audit = (int)$pdo->query("SELECT COUNT(*) FROM `audit_log` WHERE `action` = 'company_mailbox.microsoft_signin'")->fetchColumn();
    $check('...and the audit log has it', $audit === 1);

    // the company mailbox screen (api/company_mailboxes.php)
    $list = array_column($jsonOf($admin('GET', '/api/company_mailboxes.php?action=list'))['mailboxes'] ?? [], null, 'id');
    $check('the mailbox list says it is signed in and as whom, and carries no token',
        ($list['cmb-info']['connected'] ?? null) === true && $list['cmb-info']['account'] === 'admin@laminam.sk' && $list['cmb-info']['settings']['graphRefreshToken'] === '********'
        && !isset($list['cmb-info']['settings']['graphAccessToken']) && strpos(json_encode($list), 'RT-') === false, json_encode($list['cmb-info'] ?? null));
    $resave = $admin('POST', '/api/company_mailboxes.php?action=save', ['id' => 'cmb-info', 'name' => 'Info desk', 'address' => 'info@laminam.sk', 'isActive' => true, 'settings' => ['provider' => 'microsoft365']]);
    $check('saving the mailbox again (a new name) keeps its sign-in', $resave[0] === 200 && $boxSettings()['graphRefreshToken'] === 'RT-admin@laminam.sk' && ($jsonOf($resave)['mailbox']['connected'] ?? null) === true, $resave[1]);
    $check('its connection test goes through Microsoft', ($jsonOf($admin('POST', '/api/company_mailboxes.php?action=test', ['id' => 'cmb-info', 'settings' => ['provider' => 'microsoft365']]))['success'] ?? null) === true);
    $new = $admin('POST', '/api/company_mailboxes.php?action=save', ['name' => 'Orders', 'address' => 'orders@laminam.sk', 'isActive' => true, 'settings' => ['provider' => 'microsoft365']]);
    $newBox = $jsonOf($new)['mailbox'] ?? [];
    $check('a new Microsoft 365 mailbox is saved without a server or a password, not signed in yet',
        $new[0] === 200 && ($newBox['connected'] ?? null) === false && ($newBox['settings']['provider'] ?? '') === 'microsoft365', $new[1]);
    $untested = $jsonOf($admin('POST', '/api/company_mailboxes.php?action=test', ['id' => $newBox['id'] ?? '', 'settings' => ['provider' => 'microsoft365']]));
    $check('...and its test says it has to be signed in first', ($untested['success'] ?? null) === false && strpos((string)($untested['error'] ?? ''), 'not signed in') !== false);
    $imap = $admin('POST', '/api/company_mailboxes.php?action=save', ['name' => 'Old', 'address' => 'old@laminam.sk', 'settings' => ['provider' => 'smtp', 'imapHost' => '127.0.0.1', 'imapPort' => '993', 'imapUsername' => 'u', 'imapPassword' => 'p']]);
    $check('an IMAP mailbox is still validated as before (a private host is refused)', $imap[0] === 422, $imap[1]);

    // signing out
    $admin('POST', '/api/graph_oauth.php?action=disconnect', ['target' => 'company', 'mailboxId' => 'cmb-info']);
    $check('disconnecting a company mailbox forgets its tokens', empty($boxSettings()['graphRefreshToken']) && empty($boxSettings()['graphAccessToken']) && $boxSettings()['provider'] === 'microsoft365');
    $jana('POST', '/api/graph_oauth.php?action=disconnect', ['target' => 'user']);
    $es = $emailSettings('u-jana')[1];
    $st = $jsonOf($jana('GET', '/api/graph_oauth.php?action=status'));
    $check('disconnecting a personal mailbox forgets its tokens and its account', empty($es['graphRefreshToken']) && empty($es['isValidated']) && $st['connected'] === false && $st['needsReconnect'] === false, json_encode($st));
} finally {
    $cleanup();
}

echo $fails === 0 ? "\nall passed\n" : "\n$fails FAILED\n";
exit($fails === 0 ? 0 : 1);
