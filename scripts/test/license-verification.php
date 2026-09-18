<?php
/**
 * Verification suite for the licensing backend (api/license_client.php).
 *
 *     php scripts/test/license-verification.php
 *
 * Deliberately NOT part of `npm test`. The QA audit's contract is "no Docker, no
 * PHP, no database required" (docs/TESTING.md), and wiring a PHP + MySQL suite
 * into the deploy gate would break that on any machine without both. Run this by
 * hand when you touch licensing, and after any change to the token format.
 *
 * Two halves:
 *
 *  - CRYPTO AND PROTOCOL — no database needed, always runs. Signature
 *    verification in both supported algorithms, the whole rejection vocabulary,
 *    and how a licence-server answer is read.
 *  - STATE AND STORAGE — needs MySQL. Point it at a THROWAWAY database:
 *
 *        CCRM_LICENSE_TEST_DSN="mysql:host=127.0.0.1;port=3308;dbname=ccrm_license_test;charset=utf8mb4" \
 *        CCRM_LICENSE_TEST_USER=root CCRM_LICENSE_TEST_PASS=secret \
 *        php scripts/test/license-verification.php
 *
 *    It DROPS AND RECREATES `licenses`, `license_attempts`, `system_settings`
 *    and `users` in that database. Never aim it at anything real; it refuses a
 *    database whose name does not contain "test".
 *
 * Ed25519 needs ext-sodium and RSA needs ext-openssl; whichever is missing is
 * reported as skipped rather than failed, because a PHP build without one is a
 * legitimate deployment target for the other.
 */

if (PHP_SAPI !== 'cli') {
    exit("Run this from the command line.\n");
}

$root = dirname(__DIR__, 2);

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

$counts = ['pass' => 0, 'fail' => 0, 'skip' => 0];

function section(string $title): void {
    echo PHP_EOL . '== ' . $title . ' ==' . PHP_EOL;
}

function check(string $label, bool $ok): void {
    global $counts;
    $counts[$ok ? 'pass' : 'fail']++;
    echo ($ok ? '  ok   ' : '  FAIL ') . $label . PHP_EOL;
}

function skip(string $label, string $why): void {
    global $counts;
    $counts['skip']++;
    echo '  skip ' . $label . ' (' . $why . ')' . PHP_EOL;
}

// ---------------------------------------------------------------------------
// Keys
//
// The suite generates its own throwaway keypairs, so it never needs — and must
// never be given — the real signing key.
// ---------------------------------------------------------------------------

$haveSodium = function_exists('sodium_crypto_sign_keypair');
$haveOpenssl = function_exists('openssl_pkey_new');

$publicKeyEntries = [];
$signers = [];

if ($haveSodium) {
    $pairA = sodium_crypto_sign_keypair();
    $pairB = sodium_crypto_sign_keypair();   // a second trusted key: rotation
    $pairUntrusted = sodium_crypto_sign_keypair();
    $publicKeyEntries[] = 'ed25519:' . base64_encode(sodium_crypto_sign_publickey($pairA));
    $publicKeyEntries[] = 'ed25519:' . base64_encode(sodium_crypto_sign_publickey($pairB));
    $signers['ed25519'] = static function (string $segment) use ($pairA): string {
        return sodium_crypto_sign_detached($segment, sodium_crypto_sign_secretkey($pairA));
    };
    $signers['ed25519_rotated'] = static function (string $segment) use ($pairB): string {
        return sodium_crypto_sign_detached($segment, sodium_crypto_sign_secretkey($pairB));
    };
    $signers['ed25519_untrusted'] = static function (string $segment) use ($pairUntrusted): string {
        return sodium_crypto_sign_detached($segment, sodium_crypto_sign_secretkey($pairUntrusted));
    };
}

$rsaPrivate = null;
$rsaUntrustedPrivate = null;
if ($haveOpenssl) {
    $rsa = @openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
    $rsaOther = @openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
    if ($rsa !== false && $rsaOther !== false) {
        openssl_pkey_export($rsa, $rsaPrivate);
        openssl_pkey_export($rsaOther, $rsaUntrustedPrivate);
        $publicKeyEntries[] = openssl_pkey_get_details($rsa)['key'];
        $signers['rs256'] = static function (string $segment) use (&$rsaPrivate): string {
            $signature = '';
            openssl_sign($segment, $signature, $rsaPrivate, OPENSSL_ALGO_SHA256);
            return $signature;
        };
        $signers['rs256_untrusted'] = static function (string $segment) use (&$rsaUntrustedPrivate): string {
            $signature = '';
            openssl_sign($segment, $signature, $rsaUntrustedPrivate, OPENSSL_ALGO_SHA256);
            return $signature;
        };
    } else {
        // Typical on Windows PHP builds, which ship without an openssl.cnf.
        $haveOpenssl = false;
    }
}

if ($publicKeyEntries === []) {
    exit("Neither ext-sodium nor a usable ext-openssl is available; nothing to test.\n");
}

define('CCRM_LICENSE_PUBLIC_KEY', implode(', ', $publicKeyEntries));
define('CCRM_LICENSE_ENDPOINT', 'https://127.0.0.1:1/never-contacted');

require_once $root . '/api/license_client.php';

/** Build a signed token from a claim, using one of the generated signers. */
function mint(array $claim, string $signerName): string {
    global $signers;
    $segment = ccrm_license_b64url_encode(json_encode($claim, JSON_UNESCAPED_SLASHES));
    return $segment . '.' . ccrm_license_b64url_encode($signers[$signerName]($segment));
}

// ---------------------------------------------------------------------------
// Crypto and protocol — no database
// ---------------------------------------------------------------------------

section('configuration');
check('licensing reports as configured', ccrm_license_is_configured());
check('every configured key parsed', count(ccrm_license_public_keys()) === count($publicKeyEntries));

section('key normalisation');
check('lowercase and stray separators normalise',
    ccrm_license_normalize_key(' ccrm aaaa-bbbb cccc dddd ') === 'CCRM-AAAA-BBBB-CCCC-DDDD');
check('a canonical key is unchanged',
    ccrm_license_normalize_key('CCRM-AAAA-BBBB-CCCC-DDDD') === 'CCRM-AAAA-BBBB-CCCC-DDDD');
check('too short is rejected', ccrm_license_normalize_key('CCRM-1') === '');
check('too long is rejected', ccrm_license_normalize_key(str_repeat('A', 65)) === '');
check('a non-CCRM key is accepted, upper-cased',
    ccrm_license_normalize_key('abc123def456') === 'ABC123DEF456');
check('the mask keeps the ends and hides the middle',
    ccrm_license_mask_key('CCRM-AAAA-BBBB-CCCC-DDDD') === 'CCRM-********DDDD');
check('a short key is masked entirely', ccrm_license_mask_key('SHORT') === '*****');

$instance = str_repeat('a', 32);
$claimFor = static function (string $alg, array $overrides = []) use ($instance): array {
    return array_merge([
        'v' => 1, 'alg' => $alg, 'product' => 'ccrm',
        'key' => 'CCRM-AAAA-BBBB-CCCC-DDDD', 'instance' => $instance,
        'status' => 'active', 'issuedAt' => gmdate('c'),
        'expiresAt' => gmdate('Y-m-d', strtotime('+300 days')),
        'maxUsers' => 5, 'customer' => 'Test s.r.o.', 'plan' => 'standard',
        'warnDays' => 30, 'nonce' => 'n1',
    ], $overrides);
};

foreach (['ed25519', 'rs256'] as $alg) {
    section("signature verification ($alg)");
    if (!isset($signers[$alg])) {
        skip("$alg suite", $alg === 'ed25519' ? 'ext-sodium unavailable' : 'ext-openssl unusable');
        continue;
    }

    check('a well-formed token verifies',
        ccrm_license_parse_token(mint($claimFor($alg), $alg)) !== null);
    check('a token signed by an untrusted key is refused',
        ccrm_license_parse_token(mint($claimFor($alg), $alg . '_untrusted')) === null);

    // The signature covers the ENCODED claim, so re-encoding an edited claim
    // against the original signature must fail.
    $token = mint($claimFor($alg), $alg);
    [$segment, $signature] = explode('.', $token);
    $edited = json_decode(ccrm_license_b64url_decode($segment), true);
    $edited['expiresAt'] = gmdate('Y-m-d', strtotime('+9000 days'));
    $edited['maxUsers'] = 9999;
    check('a claim edited after signing is refused',
        ccrm_license_parse_token(ccrm_license_b64url_encode(json_encode($edited, JSON_UNESCAPED_SLASHES)) . '.' . $signature) === null);
    check('a random signature of the right shape is refused',
        ccrm_license_parse_token($segment . '.' . ccrm_license_b64url_encode(random_bytes(strlen(ccrm_license_b64url_decode($signature))))) === null);
    check('a truncated signature is refused',
        ccrm_license_parse_token($segment . '.' . substr($signature, 0, 20)) === null);

    check('another product is refused',
        ccrm_license_parse_token(mint($claimFor($alg, ['product' => 'other']), $alg)) === null);
    check('an unknown claim version is refused',
        ccrm_license_parse_token(mint($claimFor($alg, ['v' => 99]), $alg)) === null);
    check('alg "none" is refused',
        ccrm_license_parse_token(mint($claimFor($alg, ['alg' => 'none']), $alg)) === null);
    check('a claim with no key or instance is refused',
        ccrm_license_parse_token(mint(['v' => 1, 'alg' => $alg, 'product' => 'ccrm'], $alg)) === null);

    // Algorithm confusion: the claim must not be able to select a verifier the
    // signature was not produced with.
    $other = $alg === 'ed25519' ? 'rs256' : 'ed25519';
    if (isset($signers[$other])) {
        check("a claim labelled $other over an $alg signature is refused",
            ccrm_license_parse_token(mint($claimFor($other), $alg)) === null);
    }
}

if (isset($signers['ed25519_rotated'])) {
    section('key rotation');
    check('the previous key still verifies',
        ccrm_license_parse_token(mint($claimFor('ed25519'), 'ed25519')) !== null);
    check('the new key verifies too',
        ccrm_license_parse_token(mint($claimFor('ed25519'), 'ed25519_rotated')) !== null);
}

section('malformed tokens');
foreach ([
    'an empty token'               => '',
    'a token with no dot'          => 'nodot',
    'a token with two dots'        => 'a.b.c',
    'non-base64url characters'     => '!!!.???',
    'an empty claim segment'       => '.abc',
    'an empty signature segment'   => 'abc.',
    'an impossible base64 length'  => 'AAAAA.AAAAA',
] as $label => $token) {
    check($label . ' is refused', ccrm_license_parse_token($token) === null);
}

section('licence-server response handling');
$parse = static fn(int $code, $body, string $err = '') => ccrm_license_parse_server_response($code, $body, $err);
check('a token is taken from a successful answer',
    $parse(200, '{"success":true,"token":"abc.def"}') === ['ok' => true, 'token' => 'abc.def']);
check('success with no token is not a licence', $parse(200, '{"success":true}')['error'] === 'bad_response');
check('success with an empty token is not a licence', $parse(200, '{"success":true,"token":""}')['error'] === 'bad_response');
check('success with a non-string token is not a licence', $parse(200, '{"success":true,"token":{"a":1}}')['error'] === 'bad_response');
check('a dropped connection reads as unreachable', $parse(0, false, 'Connection refused')['error'] === 'unreachable');
check('an empty body reads as unreachable', $parse(200, '')['error'] === 'unreachable');
check('a non-JSON body reads as bad_response', $parse(502, '<html>Bad Gateway</html>')['error'] === 'bad_response');
check('a bare JSON scalar is not an answer', $parse(200, '"yes"')['error'] === 'bad_response');
check('an unbounded body is refused before parsing',
    $parse(200, '{"success":true,"token":"' . str_repeat('x', 70000) . '"}')['detail'] === 'Response too large');
foreach (['unknown_key', 'revoked', 'suspended', 'expired', 'instance_limit', 'rate_limited'] as $code) {
    check("the server may say $code", $parse(403, json_encode(['success' => false, 'error' => $code]))['error'] === $code);
}
check('an invented error code collapses to rejected',
    $parse(403, '{"success":false,"error":"please_disable_the_seat_limit"}')['error'] === 'rejected');
check('a non-string error code collapses to rejected', $parse(403, '{"success":false,"error":["x"]}')['error'] === 'rejected');
check('a missing error code collapses to rejected', $parse(403, '{"success":false}')['error'] === 'rejected');

// ---------------------------------------------------------------------------
// State and storage — needs MySQL
// ---------------------------------------------------------------------------

$dsn = getenv('CCRM_LICENSE_TEST_DSN') ?: '';
if ($dsn === '') {
    section('state and storage');
    skip('database-backed suite', 'set CCRM_LICENSE_TEST_DSN to run it');
} elseif (!preg_match('/dbname=[^;]*test/i', $dsn)) {
    section('state and storage');
    skip('database-backed suite', 'refusing a DSN whose database name does not contain "test"');
} else {
    $pdo = new PDO($dsn, getenv('CCRM_LICENSE_TEST_USER') ?: 'root', getenv('CCRM_LICENSE_TEST_PASS') ?: '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    foreach (['licenses', 'license_attempts', 'system_settings', 'users'] as $table) {
        $pdo->exec("DROP TABLE IF EXISTS `$table`");
    }
    require_once $root . '/api/schema.php';
    foreach (ccrm_schema_statements() as $sql) {
        // Only the tables this suite touches: the rest drag in foreign keys.
        if (preg_match('/CREATE TABLE IF NOT EXISTS `(licenses|license_attempts|system_settings|users)`/', $sql)) {
            $pdo->exec($sql);
        }
    }
    $pdo->exec("INSERT INTO `users` (`id`,`name`,`email`,`password_hash`,`role`,`created_at`) VALUES
        ('u1','A','a@example.com','x','admin',NOW()), ('u2','B','b@example.com','x','viewer',NOW())");

    $alg = isset($signers['ed25519']) ? 'ed25519' : 'rs256';
    $liveInstance = ccrm_license_instance_id($pdo);
    $KEY = 'CCRM-AAAA-BBBB-CCCC-DDDD';
    $tick = 0;
    /** Claim bound to the REAL instance id this database just minted. */
    $bound = static function (array $overrides = []) use ($alg, $liveInstance, $KEY, &$tick): array {
        $tick++;
        return array_merge([
            'v' => 1, 'alg' => $alg, 'product' => 'ccrm', 'key' => $KEY,
            'instance' => $liveInstance, 'status' => 'active',
            // Each successive token must be newer, or the monotonic guard
            // (correctly) refuses it.
            'issuedAt' => gmdate('c', time() + $tick),
            'expiresAt' => gmdate('Y-m-d', strtotime('+300 days')),
            'maxUsers' => 5, 'customer' => 'Test s.r.o.', 'plan' => 'standard',
            'warnDays' => 30, 'nonce' => 'n' . $tick,
        ], $overrides);
    };

    section('install identity');
    check('the instance id is 32 hex characters', (bool) preg_match('/^[a-f0-9]{32}$/', $liveInstance));
    check('it is stable across calls', $liveInstance === ccrm_license_instance_id($pdo));

    section('accepting a token');
    $claim = $bound();
    $accepted = ccrm_license_accept_token($pdo, mint($claim, $alg), $KEY, $claim['nonce'], 'u1');
    check('a good token is accepted', $accepted['ok'] === true);
    check('and stored', (ccrm_license_row($pdo)['license_key'] ?? '') === $KEY);
    check('with a record of who entered it', (ccrm_license_row($pdo)['activated_by'] ?? '') === 'u1');

    $c = $bound(['nonce' => 'not-the-one-we-sent']);
    check('a replayed response is refused',
        ccrm_license_accept_token($pdo, mint($c, $alg), $KEY, 'the-one-we-sent', 'u1')['error'] === 'replayed_response');
    $c = $bound(['instance' => str_repeat('f', 32)]);
    check('a token for another install is refused',
        ccrm_license_accept_token($pdo, mint($c, $alg), $KEY, null, 'u1')['error'] === 'wrong_instance');
    $c = $bound(['key' => 'CCRM-ZZZZ-ZZZZ-ZZZZ-ZZZZ']);
    check('a token for another key is refused',
        ccrm_license_accept_token($pdo, mint($c, $alg), $KEY, null, 'u1')['error'] === 'key_mismatch');
    $c = $bound(['issuedAt' => gmdate('c', strtotime('-10 days'))]);
    check('an older token for the same key is refused',
        ccrm_license_accept_token($pdo, mint($c, $alg), $KEY, null, 'u1')['error'] === 'stale_token');

    section('a hand-edited database changes nothing');
    $pdo->exec("UPDATE `licenses` SET `expires_at` = '2099-01-01', `max_users` = 9999 WHERE `id` = 1");
    $state = ccrm_license_state($pdo);
    check('an edited expiry is ignored', $state['expiresAt'] !== '2099-01-01');
    check('an edited seat count is ignored', $state['maxUsers'] === 5);
    $pdo->exec("UPDATE `licenses` SET `token` = CONCAT(`token`, 'x') WHERE `id` = 1");
    $state = ccrm_license_state($pdo);
    check('a mangled token reads as invalid', $state['status'] === 'invalid');
    check('and stops authorising updates', $state['updatesAllowed'] === false);

    section('the state machine');
    foreach ([
        ['active',    ['expiresAt' => gmdate('Y-m-d', strtotime('+300 days'))], true],
        ['expiring',  ['expiresAt' => gmdate('Y-m-d', strtotime('+10 days'))],  true],
        ['expiring',  ['expiresAt' => gmdate('Y-m-d')],                          true],
        ['expired',   ['expiresAt' => gmdate('Y-m-d', strtotime('-1 day'))],     false],
        ['revoked',   ['status' => 'revoked'],                                   false],
        ['suspended', ['status' => 'suspended'],                                 false],
    ] as [$expected, $overrides, $updatesAllowed]) {
        $c = $bound($overrides);
        $accepted = ccrm_license_accept_token($pdo, mint($c, $alg), $KEY, $c['nonce'], 'u1');
        $state = ccrm_license_state($pdo);
        check("$expected", $accepted['ok'] && $state['status'] === $expected);
        check("  updates " . ($updatesAllowed ? 'allowed' : 'blocked'), $state['updatesAllowed'] === $updatesAllowed);
    }

    section('an unconfirmed but unexpired licence');
    $c = $bound();
    ccrm_license_accept_token($pdo, mint($c, $alg), $KEY, $c['nonce'], 'u1');
    $pdo->exec("UPDATE `licenses` SET `last_check_at` = (NOW() - INTERVAL 400 DAY) WHERE `id` = 1");
    $state = ccrm_license_state($pdo);
    check('is still valid for the application', $state['valid'] === true);
    check('but no longer authorises updates',
        $state['updatesAllowed'] === false && $state['updatesBlockedReason'] === 'stale_check');

    section('seats');
    $pdo->exec("UPDATE `licenses` SET `last_check_at` = NOW() WHERE `id` = 1");
    check('the ceiling comes from the claim', ccrm_license_seat_limit($pdo) === 5);
    check('2 of 5 seats are used', ccrm_license_seats_used($pdo) === 2);
    check('there is room for 3 more', ccrm_license_can_add_users($pdo, 3) === true);
    check('but not for 4 more', ccrm_license_can_add_users($pdo, 4) === false);
    $pdo->exec("INSERT INTO `users` (`id`,`name`,`email`,`password_hash`,`role`,`created_at`) VALUES
        ('u3','C','c@example.com','x','viewer',NOW()),
        ('u4','D','d@example.com','x','viewer',NOW()),
        ('u5','E','e@example.com','x','viewer',NOW())");
    check('at the ceiling, one more is refused', ccrm_license_can_add_users($pdo, 1) === false);
    check('and nobody already there is removed', ccrm_license_seats_used($pdo) === 5);
    $c = $bound(['status' => 'revoked']);
    ccrm_license_accept_token($pdo, mint($c, $alg), $KEY, $c['nonce'], 'u1');
    check('a revoked licence stops imposing a seat limit', ccrm_license_seat_limit($pdo) === null);

    section('no licence at all');
    ccrm_license_remove($pdo);
    $state = ccrm_license_state($pdo);
    check('reads as none', $state['status'] === 'none');
    check('blocks updates', $state['updatesAllowed'] === false);
    check('imposes no seat limit', ccrm_license_seat_limit($pdo) === null);
    check('so the team can still be managed', ccrm_license_can_add_users($pdo, 100) === true);
}

// ---------------------------------------------------------------------------

echo PHP_EOL;
printf("%d passed, %d failed, %d skipped\n", $counts['pass'], $counts['fail'], $counts['skip']);
exit($counts['fail'] === 0 ? 0 : 1);
