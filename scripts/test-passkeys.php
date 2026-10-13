<?php
declare(strict_types=1);

/**
 * CCRM Passkeys Verification Script
 *
 * Runs headless without an active DB or web server.
 * Exit code 0 on success (prints "OK n checks"), 1 on failure.
 */

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../api/auth.php';
require_once __DIR__ . '/../api/passkeys_lib.php';

use Cose\Algorithms;
use Webauthn\AuthenticatorSelectionCriteria;
use Webauthn\PublicKeyCredential;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialRequestOptions;

$checks = 0;

function assert_test(bool $condition, string $description): void {
    global $checks;
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$description}\n");
        exit(1);
    }
    $checks++;
}

// 1. RP helper tests
$rp = ccrm_passkey_rp('localhost:5173', 'http');
assert_test($rp['id'] === 'localhost', 'RP id strips port');
assert_test($rp['origin'] === 'http://localhost:5173', 'RP origin preserves port and scheme');
assert_test($rp['name'] === 'CCRM', 'RP name is CCRM');

$invalidRpFailed = false;
try {
    ccrm_passkey_rp('invalid host with spaces');
} catch (\Throwable $e) {
    $invalidRpFailed = true;
}
assert_test($invalidRpFailed, 'Invalid host header throws');

// 2. Registration options tests
$user = [
    'id' => 'u-abc123xyz',
    'name' => 'Test User',
    'email' => 'test@example.com',
];
$existingCreds = ['dGVzdC1jcmVkZW50aWFsLWlkLTE', 'dGVzdC1jcmVkZW50aWFsLWlkLTI'];
$regOptions = ccrm_passkey_create_registration_options($user, $existingCreds, $rp);

assert_test(strlen($regOptions->challenge) === 32, 'Registration challenge is 32 bytes');
assert_test($regOptions->user->id === 'u-abc123xyz', 'User handle matches user ID bytes');
assert_test($regOptions->user->name === 'test@example.com', 'User name matches email');
assert_test($regOptions->user->displayName === 'Test User', 'User displayName matches name');
assert_test($regOptions->attestation === PublicKeyCredentialCreationOptions::ATTESTATION_CONVEYANCE_PREFERENCE_NONE, 'Attestation is none');
assert_test(
    $regOptions->authenticatorSelection->residentKey === AuthenticatorSelectionCriteria::RESIDENT_KEY_REQUIREMENT_REQUIRED,
    'Resident key is required'
);
assert_test(
    $regOptions->authenticatorSelection->userVerification === AuthenticatorSelectionCriteria::USER_VERIFICATION_REQUIREMENT_REQUIRED,
    'User verification is required'
);

// Check pubKeyCredParams contains ES256 (-7) and RS256 (-257)
$algs = array_map(fn($p) => $p->alg, $regOptions->pubKeyCredParams);
assert_test(in_array(Algorithms::COSE_ALGORITHM_ES256, $algs, true), 'Params include ES256');
assert_test(in_array(Algorithms::COSE_ALGORITHM_RS256, $algs, true), 'Params include RS256');

// Excluded credentials check
assert_test(count($regOptions->excludeCredentials) === 2, 'Excluded credentials count matches');

// Browser array shape check
$browserArray = CcrmWebAuthn::toBrowserArray($regOptions);
assert_test(is_array($browserArray), 'Browser options normalize to array');
assert_test(isset($browserArray['challenge']), 'Browser options contain challenge');
assert_test(isset($browserArray['rp']['id']), 'Browser options contain rp.id');
assert_test(isset($browserArray['user']['id']), 'Browser options contain user.id');

// 3. Login options tests
$loginOptions = ccrm_passkey_create_request_options($rp);
assert_test(strlen($loginOptions->challenge) === 32, 'Login challenge is 32 bytes');
assert_test($loginOptions->rpId === 'localhost', 'Login rpId matches');
assert_test(count($loginOptions->allowCredentials) === 0, 'Login allowCredentials is empty');
assert_test(
    $loginOptions->userVerification === AuthenticatorSelectionCriteria::USER_VERIFICATION_REQUIREMENT_REQUIRED,
    'Login userVerification is required'
);

$loginBrowserArray = CcrmWebAuthn::toBrowserArray($loginOptions);
assert_test(is_array($loginBrowserArray), 'Login options normalize to array');
assert_test($loginBrowserArray['rpId'] === 'localhost', 'Login browser options rpId is localhost');

// 4. Deserializing malformed credential JSON throws
$garbageCases = [
    'null' => null,
    'empty string' => '',
    'random text' => 'not-even-json',
    'wrong structure' => ['foo' => 'bar'],
    'missing response' => ['id' => 'abc', 'rawId' => 'abc', 'type' => 'public-key'],
    'mismatched id and rawId' => [
        'id' => 'YWJj',
        'rawId' => 'eHl6',
        'type' => 'public-key',
        'response' => ['clientDataJSON' => 'e30', 'authenticatorData' => 'e30', 'signature' => 'e30']
    ],
];
foreach ($garbageCases as $desc => $garbage) {
    $threw = false;
    try {
        ccrm_passkey_deserialize_credential($garbage);
    } catch (\Throwable $e) {
        $threw = true;
    }
    assert_test($threw, "Deserializing {$desc} throws");
}

// 5. Challenge handling & lifecycle tests
$_SESSION = [];
ccrm_passkey_store_challenge('login', $loginOptions);
assert_test(isset($_SESSION['ccrm_pk']), 'Challenge stored in session');
assert_test($_SESSION['ccrm_pk']['purpose'] === 'login', 'Challenge purpose is login');
assert_test($_SESSION['ccrm_pk']['exp'] > time(), 'Challenge has future expiration');

// Challenge consumption: returns options and unsets session key
$consumed = ccrm_passkey_consume_challenge('login', PublicKeyCredentialRequestOptions::class);
assert_test($consumed instanceof PublicKeyCredentialRequestOptions, 'Consumed challenge returns options class');
assert_test(!isset($_SESSION['ccrm_pk']), 'Consumed challenge is unset from session');

// Single-use: consuming again must throw
$threwSecondConsume = false;
try {
    ccrm_passkey_consume_challenge('login', PublicKeyCredentialRequestOptions::class);
} catch (\Throwable $e) {
    $threwSecondConsume = true;
}
assert_test($threwSecondConsume, 'Consuming challenge second time throws');

// Expiration test
$_SESSION['ccrm_pk'] = [
    'purpose' => 'login',
    'uid'     => null,
    'options' => CcrmWebAuthn::serializer()->serialize($loginOptions, 'json'),
    'exp'     => time() - 10, // expired 10 seconds ago
];
$threwExpired = false;
try {
    ccrm_passkey_consume_challenge('login', PublicKeyCredentialRequestOptions::class);
} catch (\Throwable $e) {
    $threwExpired = true;
}
assert_test($threwExpired, 'Expired challenge throws');

// Purpose mismatch test
$_SESSION['ccrm_pk'] = [
    'purpose' => 'login',
    'uid'     => null,
    'options' => CcrmWebAuthn::serializer()->serialize($loginOptions, 'json'),
    'exp'     => time() + 120,
];
$threwMismatchedPurpose = false;
try {
    ccrm_passkey_consume_challenge('register', PublicKeyCredentialCreationOptions::class);
} catch (\Throwable $e) {
    $threwMismatchedPurpose = true;
}
assert_test($threwMismatchedPurpose, 'Mismatched ceremony purpose throws');

// User ID mismatch test for registration
$_SESSION['ccrm_pk'] = [
    'purpose' => 'register',
    'uid'     => 'user-original-id',
    'options' => CcrmWebAuthn::serializer()->serialize($regOptions, 'json'),
    'exp'     => time() + 120,
];
$threwMismatchedUser = false;
try {
    ccrm_passkey_consume_challenge('register', PublicKeyCredentialCreationOptions::class, 'user-attacker-id');
} catch (\Throwable $e) {
    $threwMismatchedUser = true;
}
assert_test($threwMismatchedUser, 'Mismatched user ID for registration challenge throws');

// Valid user ID consumption
$_SESSION['ccrm_pk'] = [
    'purpose' => 'register',
    'uid'     => 'user-valid-id',
    'options' => CcrmWebAuthn::serializer()->serialize($regOptions, 'json'),
    'exp'     => time() + 120,
];
$consumedReg = ccrm_passkey_consume_challenge('register', PublicKeyCredentialCreationOptions::class, 'user-valid-id');
assert_test($consumedReg instanceof PublicKeyCredentialCreationOptions, 'Registration challenge consumed with matching user ID');

// 6. AAGUID lookup tests
assert_test(ccrm_passkey_aaguid_name('08987058-cadc-4b81-b6e1-30de50dcbe96') === 'Windows Hello', 'Windows Hello AAGUID recognized');
assert_test(ccrm_passkey_aaguid_name('ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4') === 'Google Password Manager', 'Google Password Manager AAGUID recognized');
assert_test(ccrm_passkey_aaguid_name('bada5566-a7aa-401f-bd96-45619a55120d') === '1Password', '1Password AAGUID recognized');
assert_test(ccrm_passkey_aaguid_name('d548826e-79b4-db40-a3d8-11116f7e8349') === 'Bitwarden', 'Bitwarden AAGUID recognized');
assert_test(ccrm_passkey_aaguid_name('00000000-0000-0000-0000-000000000000') === null, 'All-zero AAGUID returns null');
assert_test(ccrm_passkey_aaguid_name('ffffffff-ffff-ffff-ffff-ffffffffffff') === null, 'Unknown AAGUID returns null');
assert_test(ccrm_passkey_aaguid_name(null) === null, 'Null AAGUID returns null');

echo "OK {$checks} checks\n";
exit(0);
