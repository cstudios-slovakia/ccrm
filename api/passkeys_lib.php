<?php
declare(strict_types=1);

/**
 * WebAuthn (Passkeys) library wiring and domain helpers for CCRM.
 */

// Load autoloader if webauthn-lib is not yet in scope
if (!class_exists(\Webauthn\PublicKeyCredentialCreationOptions::class)) {
    foreach ([
        __DIR__ . '/../vendor/autoload.php',
        __DIR__ . '/../../vendor/autoload.php',
        dirname(__DIR__) . '/vendor/autoload.php',
        dirname(__DIR__, 2) . '/vendor/autoload.php',
        '/var/www/html/vendor/autoload.php',
    ] as $autoloadPath) {
        if (file_exists($autoloadPath)) {
            require_once $autoloadPath;
            break;
        }
    }
}

use Cose\Algorithms;
use ParagonIE\ConstantTime\Base64UrlSafe;
use Symfony\Component\Serializer\Normalizer\AbstractObjectNormalizer;
use Symfony\Component\Serializer\Normalizer\NormalizerInterface;
use Symfony\Component\Serializer\SerializerInterface;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AttestationStatement\NoneAttestationStatementSupport;
use Webauthn\AuthenticatorAssertionResponse;
use Webauthn\AuthenticatorAssertionResponseValidator;
use Webauthn\AuthenticatorAttestationResponse;
use Webauthn\AuthenticatorAttestationResponseValidator;
use Webauthn\AuthenticatorSelectionCriteria;
use Webauthn\CeremonyStep\CeremonyStepManagerFactory;
use Webauthn\CredentialRecord;
use Webauthn\Denormalizer\WebauthnSerializerFactory;
use Webauthn\PublicKeyCredential;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialDescriptor;
use Webauthn\PublicKeyCredentialParameters;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialUserEntity;

/** Known AAGUID mapping ported from passkey-authenticator-aaguids */
const CCRM_AAGUIDS = [
    // Google
    'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4' => 'Google Password Manager',
    // Chrome / Chromium
    'adce0002-35bc-c60a-648b-0b25f1f05503' => 'Chrome on Mac',
    'b5397666-4885-aa6b-cebf-e52262a439a2' => 'Chromium Browser',
    // Windows Hello
    '08987058-cadc-4b81-b6e1-30de50dcbe96' => 'Windows Hello',
    '9ddd1817-af5a-4672-a2b9-3e3dd95000a9' => 'Windows Hello',
    '6028b017-b1d4-4c02-b4b3-afcdafc96bb2' => 'Windows Hello',
    // Apple / iCloud
    'dd4ec289-e01d-41c9-bb89-70fa845d4bf2' => 'iCloud Keychain (Managed)',
    'fbfc3007-154e-4ecc-8c0b-6e020557d7bd' => 'Apple Passwords',
    // Password Managers
    'bada5566-a7aa-401f-bd96-45619a55120d' => '1Password',
    'd548826e-79b4-db40-a3d8-11116f7e8349' => 'Bitwarden',
    '531126d6-e717-415c-9320-3d9aa6981239' => 'Dashlane',
    '0ea242b4-43c4-4a1b-8b17-dd6d0b6baec6' => 'Keeper',
    'b84e4048-15dc-4dd0-8640-f4f60813c8af' => 'NordPass',
    '50726f74-6f6e-5061-7373-50726f746f6e' => 'Proton Pass',
    '771b48fd-d3d4-4f74-9232-fc157ab0507a' => 'Edge on Mac',
    '53414d53-554e-4700-0000-000000000000' => 'Samsung Pass',
    'eaecdef2-1c31-5634-8639-f1cbd9c00a08' => 'KeePassDX',
    'fdb141b2-5d84-443e-8a35-4698c205a502' => 'KeePassXC',
];

/**
 * Return friendly authenticator name for an AAGUID string, or null.
 */
function ccrm_passkey_aaguid_name(?string $aaguid): ?string {
    if (!$aaguid || $aaguid === '00000000-0000-0000-0000-000000000000') {
        return null;
    }
    return CCRM_AAGUIDS[strtolower($aaguid)] ?? null;
}

/**
 * Resolves RP information (id, origin, name).
 */
function ccrm_passkey_rp(?string $overrideHost = null, ?string $overrideScheme = null): array {
    $host = $overrideHost ?? (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    if ($host === '' || !preg_match('/^[A-Za-z0-9.\-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](:\d{1,5})?$/', $host)) {
        throw new \RuntimeException('Invalid HTTP host');
    }
    $hostLower = strtolower($host);
    // Strip port for RP ID
    $parts = explode(':', $hostLower);
    $id = $parts[0];
    if (str_starts_with($hostLower, '[') && ($pos = strrpos($hostLower, ']:')) !== false) {
        $id = substr($hostLower, 0, $pos + 1);
    }

    if ($overrideScheme !== null) {
        $scheme = $overrideScheme;
    } else {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $scheme = $https ? 'https' : 'http';
    }
    $origin = $scheme . '://' . $hostLower;

    return [
        'id' => $id,
        'origin' => $origin,
        'name' => 'CCRM',
    ];
}

/**
 * Static cache for WebAuthn serializer and ceremony validators.
 */
final class CcrmWebAuthn {
    private static ?SerializerInterface $serializer = null;
    private static ?AttestationStatementSupportManager $attestationSupportManager = null;

    public static function attestationSupportManager(): AttestationStatementSupportManager {
        if (!self::$attestationSupportManager instanceof AttestationStatementSupportManager) {
            self::$attestationSupportManager = AttestationStatementSupportManager::create();
            self::$attestationSupportManager->add(NoneAttestationStatementSupport::create());
        }
        return self::$attestationSupportManager;
    }

    public static function serializer(): SerializerInterface {
        if (!self::$serializer instanceof SerializerInterface) {
            self::$serializer = (new WebauthnSerializerFactory(
                self::attestationSupportManager()
            ))->create();
        }
        return self::$serializer;
    }

    public static function ceremonyStepManagerFactory(string $origin): CeremonyStepManagerFactory {
        $factory = new CeremonyStepManagerFactory();
        // Allow HTTP for localhost in development and QA test suite
        $factory->setSecuredRelyingPartyId(['localhost']);
        $factory->setAllowedOrigins([$origin]);
        $factory->setAttestationStatementSupportManager(self::attestationSupportManager());
        return $factory;
    }

    public static function attestationValidator(string $origin): AuthenticatorAttestationResponseValidator {
        return AuthenticatorAttestationResponseValidator::create(
            self::ceremonyStepManagerFactory($origin)->creationCeremony()
        );
    }

    public static function assertionValidator(string $origin): AuthenticatorAssertionResponseValidator {
        return AuthenticatorAssertionResponseValidator::create(
            self::ceremonyStepManagerFactory($origin)->requestCeremony()
        );
    }

    /**
     * Normalize WebAuthn options to a browser-facing array.
     */
    public static function toBrowserArray(mixed $data): array {
        $serializer = self::serializer();
        assert($serializer instanceof NormalizerInterface);
        $normalized = $serializer->normalize($data, 'json', [
            AbstractObjectNormalizer::SKIP_NULL_VALUES => true,
        ]);
        if (!is_array($normalized)) {
            throw new \UnexpectedValueException('Serialized WebAuthn data must normalize to an array.');
        }
        return $normalized;
    }

    public static function flush(): void {
        self::$serializer = null;
        self::$attestationSupportManager = null;
    }
}

/**
 * Ensure user_passkeys table exists.
 */
function ccrm_passkeys_ensure_table(\PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `user_passkeys` (
      `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      `user_id` VARCHAR(50) NOT NULL,
      `name` VARCHAR(100) NOT NULL,
      `credential_id` VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'base64url, unpadded',
      `credential` LONGTEXT NOT NULL COMMENT 'JSON of Webauthn\\\\CredentialRecord (public key, counter, user handle, ...)',
      `aaguid` CHAR(36) NULL,
      `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      `last_used_at` TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (`id`),
      UNIQUE KEY `uniq_passkey_cred` (`credential_id`),
      INDEX `idx_passkey_user` (`user_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
}

/**
 * Check rate limiting for passkey operations using login_attempts table.
 */
function ccrm_passkey_check_throttle(\PDO $pdo, string $clientIp): bool {
    if (!defined('CCRM_LOGIN_MAX_ATTEMPTS')) {
        define('CCRM_LOGIN_MAX_ATTEMPTS', 20);
    }
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `login_attempts` (
            `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
            `ip` VARCHAR(45) NULL,
            `email` VARCHAR(255) NULL,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_ip_time` (`ip`, `created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        if (random_int(1, 20) === 1) {
            $pdo->exec("DELETE FROM `login_attempts` WHERE `created_at` < (NOW() - INTERVAL 1 DAY)");
        }
        $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM `login_attempts` WHERE `ip` = ? AND `created_at` > (NOW() - INTERVAL 15 MINUTE)");
        $cntStmt->execute([$clientIp]);
        $recentFailures = (int)$cntStmt->fetchColumn();
        return ($recentFailures < CCRM_LOGIN_MAX_ATTEMPTS);
    } catch (\Throwable $e) {
        return true; // Fail-open
    }
}

/**
 * Record a failure in login_attempts.
 */
function ccrm_passkey_record_failure(\PDO $pdo, string $clientIp, ?string $email = null): void {
    try {
        $pdo->prepare("INSERT INTO `login_attempts` (`ip`, `email`) VALUES (?, ?)")->execute([$clientIp, $email]);
    } catch (\Throwable $e) { /* ignore */ }
}

/**
 * Build PublicKeyCredentialCreationOptions for registration.
 *
 * @param array $user ['id' => ..., 'name' => ..., 'email' => ...]
 * @param string[] $existingCredentialIds Array of unpadded base64url credential ids
 */
function ccrm_passkey_create_registration_options(array $user, array $existingCredentialIds, array $rp): PublicKeyCredentialCreationOptions {
    $rpEntity = PublicKeyCredentialRpEntity::create(
        name: $rp['name'],
        id: $rp['id'],
    );

    $userEntity = PublicKeyCredentialUserEntity::create(
        name: $user['email'],
        id: (string)$user['id'], // Raw bytes of the users.id string (<= 50 bytes)
        displayName: $user['name'] ?: $user['email'],
    );

    $pubKeyCredParams = [
        PublicKeyCredentialParameters::create(PublicKeyCredentialDescriptor::CREDENTIAL_TYPE_PUBLIC_KEY, Algorithms::COSE_ALGORITHM_ES256),
        PublicKeyCredentialParameters::create(PublicKeyCredentialDescriptor::CREDENTIAL_TYPE_PUBLIC_KEY, Algorithms::COSE_ALGORITHM_RS256),
    ];

    $authSelection = AuthenticatorSelectionCriteria::create(
        authenticatorAttachment: AuthenticatorSelectionCriteria::AUTHENTICATOR_ATTACHMENT_NO_PREFERENCE,
        userVerification: AuthenticatorSelectionCriteria::USER_VERIFICATION_REQUIREMENT_REQUIRED,
        residentKey: AuthenticatorSelectionCriteria::RESIDENT_KEY_REQUIREMENT_REQUIRED,
    );

    $excluded = [];
    foreach ($existingCredentialIds as $cId) {
        $excluded[] = PublicKeyCredentialDescriptor::create(
            PublicKeyCredentialDescriptor::CREDENTIAL_TYPE_PUBLIC_KEY,
            Base64UrlSafe::decodeNoPadding($cId)
        );
    }

    return PublicKeyCredentialCreationOptions::create(
        rp: $rpEntity,
        user: $userEntity,
        challenge: random_bytes(32),
        pubKeyCredParams: $pubKeyCredParams,
        authenticatorSelection: $authSelection,
        attestation: PublicKeyCredentialCreationOptions::ATTESTATION_CONVEYANCE_PREFERENCE_NONE,
        excludeCredentials: $excluded,
        timeout: 60000,
        // Chrome and Edge go straight to Windows Hello / Touch ID instead of the
        // phone-or-USB menu. Registration only: a login passkey may live on a phone.
        hints: ['client-device'],
    );
}

/**
 * Build PublicKeyCredentialRequestOptions for login.
 */
function ccrm_passkey_create_request_options(array $rp): PublicKeyCredentialRequestOptions {
    return PublicKeyCredentialRequestOptions::create(
        challenge: random_bytes(32),
        rpId: $rp['id'],
        allowCredentials: [],
        userVerification: AuthenticatorSelectionCriteria::USER_VERIFICATION_REQUIREMENT_REQUIRED,
        timeout: 60000,
    );
}

/** How long after a password sign-in a passkey may be added without the password. */
const CCRM_PW_AUTH_WINDOW_SECONDS = 300;

/**
 * True when this session was opened by a password sign-in no more than
 * CCRM_PW_AUTH_WINDOW_SECONDS ago (login.php sets ccrm_pw_auth_at).
 */
function ccrm_pw_auth_recent(): bool {
    ccrm_start_session();
    $at = $_SESSION['ccrm_pw_auth_at'] ?? null;
    if (!is_int($at)) {
        return false;
    }
    $age = time() - $at;
    return $age >= 0 && $age <= CCRM_PW_AUTH_WINDOW_SECONDS;
}

/**
 * Store a challenge into the PHP session.
 */
function ccrm_passkey_store_challenge(string $purpose, mixed $options, ?string $userId = null): void {
    ccrm_start_session();
    $_SESSION['ccrm_pk'] = [
        'purpose' => $purpose,
        'uid'     => $userId,
        'options' => CcrmWebAuthn::serializer()->serialize($options, 'json'),
        'exp'     => time() + 120,
    ];
}

/**
 * Retrieve and consume (unset) challenge from session.
 */
function ccrm_passkey_consume_challenge(string $expectedPurpose, string $expectedClass, ?string $expectedUserId = null): mixed {
    ccrm_start_session();
    $data = $_SESSION['ccrm_pk'] ?? null;
    unset($_SESSION['ccrm_pk']);

    if (!is_array($data)) {
        throw new \RuntimeException('No passkey challenge found in session.');
    }
    if (($data['exp'] ?? 0) < time()) {
        throw new \RuntimeException('Passkey challenge expired.');
    }
    if (($data['purpose'] ?? '') !== $expectedPurpose) {
        throw new \RuntimeException('Mismatched passkey ceremony purpose.');
    }
    if ($expectedPurpose === 'register') {
        if ($expectedUserId === null || ($data['uid'] ?? '') !== $expectedUserId) {
            throw new \RuntimeException('Passkey user mismatch.');
        }
    }

    return CcrmWebAuthn::serializer()->deserialize($data['options'], $expectedClass, 'json');
}

/**
 * Deserialize and validate credential array to PublicKeyCredential.
 */
function ccrm_passkey_deserialize_credential(mixed $credData): PublicKeyCredential {
    if (!is_array($credData) || empty($credData) || !isset($credData['response']) || !is_array($credData['response'])) {
        throw new \InvalidArgumentException('Invalid credential payload');
    }
    $credential = CcrmWebAuthn::serializer()->denormalize($credData, PublicKeyCredential::class, 'json');
    if (!$credential instanceof PublicKeyCredential) {
        throw new \InvalidArgumentException('Failed to denormalize PublicKeyCredential');
    }
    return $credential;
}
