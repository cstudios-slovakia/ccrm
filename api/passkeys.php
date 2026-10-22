<?php
declare(strict_types=1);

/**
 * WebAuthn (Passkeys) HTTP Endpoint for CCRM.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/passkeys_lib.php';

use ParagonIE\ConstantTime\Base64UrlSafe;
use Webauthn\AuthenticatorAssertionResponse;
use Webauthn\AuthenticatorAttestationResponse;
use Webauthn\CredentialRecord;
use Webauthn\PublicKeyCredential;

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true) ?: [];
$action = (string)($data['action'] ?? '');

// Action 'status' never fails and does not require DB or auth
if ($action === 'status') {
    $available = extension_loaded('openssl') && class_exists(\Webauthn\PublicKeyCredentialCreationOptions::class);
    echo json_encode(['success' => true, 'available' => $available]);
    exit;
}

// Check library availability for all other actions
if (!class_exists(\Webauthn\PublicKeyCredentialCreationOptions::class)) {
    http_response_code(503);
    echo json_encode([
        'success' => false,
        'available' => false,
        'message' => 'Passkeys are not available on this server.',
    ]);
    exit;
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'installed' => false, 'message' => 'CRM is not installed yet.']);
    exit;
}
require_once $configFile;

try {
    $pdo = get_db_connection();
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

ccrm_passkeys_ensure_table($pdo);

$clientIp = $_SERVER['REMOTE_ADDR'] ?? '';

try {
    switch ($action) {
        case 'login_options':
            if (!ccrm_passkey_check_throttle($pdo, $clientIp)) {
                http_response_code(429);
                echo json_encode([
                    'success' => false,
                    'locked' => true,
                    'lock_minutes' => 15,
                    'message' => 'Too many login attempts. Please wait a few minutes and try again.',
                ]);
                exit;
            }

            $rp = ccrm_passkey_rp();
            $options = ccrm_passkey_create_request_options($rp);
            ccrm_passkey_store_challenge('login', $options);

            echo json_encode([
                'success' => true,
                'options' => CcrmWebAuthn::toBrowserArray($options),
            ]);
            exit;

        case 'login_verify':
            if (!ccrm_passkey_check_throttle($pdo, $clientIp)) {
                http_response_code(429);
                echo json_encode([
                    'success' => false,
                    'locked' => true,
                    'lock_minutes' => 15,
                    'message' => 'Too many login attempts. Please wait a few minutes and try again.',
                ]);
                exit;
            }

            $remember = !empty($data['remember']);
            $credData = $data['credential'] ?? null;
            if (!is_array($credData)) {
                throw new \InvalidArgumentException('Missing credential');
            }

            // Challenge must be read and unset first
            $storedOptions = ccrm_passkey_consume_challenge('login', \Webauthn\PublicKeyCredentialRequestOptions::class);
            $rp = ccrm_passkey_rp();

            /** @var PublicKeyCredential $credential */
            $credential = ccrm_passkey_deserialize_credential($credData);
            if (!$credential->response instanceof AuthenticatorAssertionResponse) {
                throw new \InvalidArgumentException('Expected AuthenticatorAssertionResponse');
            }

            $rawId = $credential->rawId;
            $credentialId = Base64UrlSafe::encodeUnpadded($rawId);

            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("SELECT * FROM `user_passkeys` WHERE `credential_id` = ? FOR UPDATE");
                $stmt->execute([$credentialId]);
                $passkeyRow = $stmt->fetch(\PDO::FETCH_ASSOC);

                if (!$passkeyRow) {
                    $pdo->rollBack();
                    ccrm_passkey_record_failure($pdo, $clientIp);
                    http_response_code(401);
                    echo json_encode(['success' => false, 'message' => 'Passkey sign-in failed.']);
                    exit;
                }

                /** @var CredentialRecord $record */
                $record = CcrmWebAuthn::serializer()->deserialize($passkeyRow['credential'], CredentialRecord::class, 'json');

                $validator = CcrmWebAuthn::assertionValidator($rp['origin']);
                $updatedRecord = $validator->check(
                    credentialRecord: $record,
                    authenticatorAssertionResponse: $credential->response,
                    publicKeyCredentialRequestOptions: $storedOptions,
                    host: $rp['id'],
                    userHandle: $record->userHandle,
                );

                $upd = $pdo->prepare("UPDATE `user_passkeys` SET `credential` = ?, `last_used_at` = NOW() WHERE `id` = ?");
                $upd->execute([
                    CcrmWebAuthn::serializer()->serialize($updatedRecord, 'json'),
                    $passkeyRow['id'],
                ]);

                $userStmt = $pdo->prepare("SELECT * FROM `users` WHERE `id` = ? LIMIT 1");
                $userStmt->execute([$passkeyRow['user_id']]);
                $userRow = $userStmt->fetch(\PDO::FETCH_ASSOC);

                if (!$userRow) {
                    $pdo->rollBack();
                    ccrm_passkey_record_failure($pdo, $clientIp);
                    http_response_code(401);
                    echo json_encode(['success' => false, 'message' => 'Passkey sign-in failed.']);
                    exit;
                }

                $pdo->commit();
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }

            ccrm_audit_log($pdo, ['id' => $userRow['id'], 'email' => $userRow['email']], 'passkey.login', $passkeyRow['name']);

            try {
                $pdo->prepare("DELETE FROM `login_attempts` WHERE `ip` = ?")->execute([$clientIp]);
            } catch (\Throwable $e) { /* ignore */ }

            $profile = ccrm_establish_login_session($pdo, $userRow, $remember);
            echo json_encode([
                'success' => true,
                'user' => $profile,
            ]);
            exit;

        case 'list':
            $sessionUser = ccrm_require_auth();
            $stmt = $pdo->prepare("
                SELECT `id`, `name`, `aaguid`,
                       TIMESTAMPDIFF(SECOND, `created_at`, NOW()) AS `created_ago_seconds`,
                       TIMESTAMPDIFF(SECOND, `last_used_at`, NOW()) AS `last_used_ago_seconds`
                FROM `user_passkeys`
                WHERE `user_id` = ?
                ORDER BY `id` DESC
            ");
            $stmt->execute([$sessionUser['id']]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $passkeys = [];
            foreach ($rows as $row) {
                $passkeys[] = [
                    'id' => (int)$row['id'],
                    'name' => $row['name'],
                    'authenticator' => ccrm_passkey_aaguid_name($row['aaguid']),
                    'created_ago_seconds' => $row['created_ago_seconds'] !== null ? (int)$row['created_ago_seconds'] : null,
                    'last_used_ago_seconds' => $row['last_used_ago_seconds'] !== null ? (int)$row['last_used_ago_seconds'] : null,
                ];
            }

            echo json_encode([
                'success' => true,
                'passkeys' => $passkeys,
            ]);
            exit;

        case 'register_options':
            $sessionUser = ccrm_require_auth();
            $password = (string)($data['password'] ?? '');
            // No password is needed right after a password sign-in (the offer shown
            // by the app). Left in the session until register_verify succeeds, so a
            // cancelled OS prompt can be retried.
            $viaSession = $password === '' && ccrm_pw_auth_recent();
            if ($password === '' && !$viaSession) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Password is required.']);
                exit;
            }

            if (!$viaSession) {
                $uStmt = $pdo->prepare("SELECT `password_hash` FROM `users` WHERE `id` = ? LIMIT 1");
                $uStmt->execute([$sessionUser['id']]);
                $storedHash = (string)$uStmt->fetchColumn();

                $ok = false;
                if (ccrm_is_hash($storedHash)) {
                    $ok = password_verify($password, $storedHash);
                } else {
                    $ok = hash_equals($storedHash, $password);
                }

                if (!$ok) {
                    ccrm_passkey_record_failure($pdo, $clientIp, $sessionUser['email'], 'Wrong password while adding a passkey');
                    http_response_code(403);
                    echo json_encode(['success' => false, 'message' => 'Wrong password.']);
                    exit;
                }
            }

            if (!ccrm_passkey_check_throttle($pdo, $clientIp)) {
                http_response_code(429);
                echo json_encode([
                    'success' => false,
                    'locked' => true,
                    'lock_minutes' => 15,
                    'message' => 'Too many login attempts. Please wait a few minutes and try again.',
                ]);
                exit;
            }

            $cStmt = $pdo->prepare("SELECT `credential_id` FROM `user_passkeys` WHERE `user_id` = ?");
            $cStmt->execute([$sessionUser['id']]);
            $existingIds = $cStmt->fetchAll(\PDO::FETCH_COLUMN) ?: [];

            $rp = ccrm_passkey_rp();
            $options = ccrm_passkey_create_registration_options($sessionUser, $existingIds, $rp);
            ccrm_passkey_store_challenge('register', $options, $sessionUser['id']);
            $_SESSION['ccrm_pk']['via'] = $viaSession ? 'session' : 'password';

            echo json_encode([
                'success' => true,
                'options' => CcrmWebAuthn::toBrowserArray($options),
            ]);
            exit;

        case 'register_verify':
            $sessionUser = ccrm_require_auth();
            $name = trim((string)($data['name'] ?? ''));
            if ($name === '' || mb_strlen($name) > 100) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Invalid passkey name.']);
                exit;
            }

            $credData = $data['credential'] ?? null;
            if (!is_array($credData)) {
                throw new \InvalidArgumentException('Missing credential');
            }

            $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM `user_passkeys` WHERE `user_id` = ?");
            $cntStmt->execute([$sessionUser['id']]);
            if ((int)$cntStmt->fetchColumn() >= 10) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Maximum of 10 passkeys reached.']);
                exit;
            }

            // Read before the challenge is consumed (consuming unsets ccrm_pk)
            $confirmedBy = (string)($_SESSION['ccrm_pk']['via'] ?? 'password');
            $storedOptions = ccrm_passkey_consume_challenge('register', \Webauthn\PublicKeyCredentialCreationOptions::class, $sessionUser['id']);
            $rp = ccrm_passkey_rp();

            /** @var PublicKeyCredential $credential */
            $credential = ccrm_passkey_deserialize_credential($credData);
            if (!$credential->response instanceof AuthenticatorAttestationResponse) {
                throw new \InvalidArgumentException('Expected AuthenticatorAttestationResponse');
            }

            $validator = CcrmWebAuthn::attestationValidator($rp['origin']);
            $record = $validator->check(
                authenticatorAttestationResponse: $credential->response,
                publicKeyCredentialCreationOptions: $storedOptions,
                host: $rp['id'],
            );

            $credentialId = Base64UrlSafe::encodeUnpadded($record->publicKeyCredentialId);

            $exStmt = $pdo->prepare("SELECT 1 FROM `user_passkeys` WHERE `credential_id` = ?");
            $exStmt->execute([$credentialId]);
            if ($exStmt->fetchColumn()) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Passkey is already registered.']);
                exit;
            }

            $aaguid = $record->aaguid->toRfc4122();
            if ($aaguid === '00000000-0000-0000-0000-000000000000') {
                $aaguid = null;
            }

            $insStmt = $pdo->prepare("INSERT INTO `user_passkeys` (`user_id`, `name`, `credential_id`, `credential`, `aaguid`) VALUES (?, ?, ?, ?, ?)");
            $insStmt->execute([
                $sessionUser['id'],
                $name,
                $credentialId,
                CcrmWebAuthn::serializer()->serialize($record, 'json'),
                $aaguid,
            ]);

            ccrm_audit_log($pdo, $sessionUser, 'passkey.register', $confirmedBy === 'session' ? $name . ' (confirmed by sign-in)' : $name);
            // The sign-in confirmation is single-use
            unset($_SESSION['ccrm_pw_auth_at']);

            echo json_encode(['success' => true]);
            exit;

        case 'delete':
            $sessionUser = ccrm_require_auth();
            $id = (int)($data['id'] ?? 0);
            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Invalid passkey ID.']);
                exit;
            }

            $nameStmt = $pdo->prepare("SELECT `name` FROM `user_passkeys` WHERE `id` = ? AND `user_id` = ?");
            $nameStmt->execute([$id, $sessionUser['id']]);
            $passkeyName = $nameStmt->fetchColumn();

            $delStmt = $pdo->prepare("DELETE FROM `user_passkeys` WHERE `id` = ? AND `user_id` = ?");
            $delStmt->execute([$id, $sessionUser['id']]);

            if ($passkeyName) {
                ccrm_audit_log($pdo, $sessionUser, 'passkey.delete', (string)$passkeyName);
            }

            echo json_encode(['success' => true]);
            exit;

        default:
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Unknown action.']);
            exit;
    }
} catch (\Throwable $e) {
    if (isset($pdo) && $pdo instanceof \PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    ccrm_log_exception($e);
    if ($action === 'login_verify') {
        ccrm_passkey_record_failure($pdo, $clientIp);
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Passkey sign-in failed.']);
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Passkey verification failed.']);
    }
    exit;
}
