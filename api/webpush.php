<?php
/**
 * Web Push Notification Broker (RFC 8291 & RFC 8292).
 *
 * Implements native, zero-dependency Web Push for PWA mobile devices (iOS 16.4+ standalone,
 * Android Chrome/Firefox, Desktop Chrome/Edge/Safari/Firefox).
 *
 * - RFC 8292: VAPID (Voluntary Application Server Identification) using ECDSA P-256 (ES256).
 * - RFC 8291: Message Encryption for Web Push using ECDH P-256 & AES-128-GCM content encoding (RFC 8188).
 */

require_once __DIR__ . '/auth.php';

if (!function_exists('ccrm_base64url_encode')) {
    function ccrm_base64url_encode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}

if (!function_exists('ccrm_base64url_decode')) {
    function ccrm_base64url_decode(string $data): string {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $padLen = 4 - $remainder;
            $data .= str_repeat('=', $padLen);
        }
        return (string)base64_decode(strtr($data, '-_', '+/'));
    }
}

if (!function_exists('ccrm_der_to_jose')) {
    /**
     * Converts an OpenSSL ECDSA ASN.1 DER signature to 64-byte IEEE P1363 (R || S) format for JOSE/JWT.
     */
    function ccrm_der_to_jose(string $der): string {
        $pos = 0;
        if (strlen($der) < 8 || ord($der[$pos++]) !== 0x30) {
            throw new \RuntimeException('Invalid DER signature sequence header');
        }
        $len = ord($der[$pos++]);
        if ($len & 0x80) {
            $n = $len & 0x7f;
            $pos += $n;
        }

        // R coordinate
        if (ord($der[$pos++]) !== 0x02) {
            throw new \RuntimeException('Invalid DER signature: expected integer tag for R');
        }
        $rLen = ord($der[$pos++]);
        $r = substr($der, $pos, $rLen);
        $pos += $rLen;

        // S coordinate
        if (ord($der[$pos++]) !== 0x02) {
            throw new \RuntimeException('Invalid DER signature: expected integer tag for S');
        }
        $sLen = ord($der[$pos++]);
        $s = substr($der, $pos, $sLen);

        $r = ltrim($r, "\x00");
        $s = ltrim($s, "\x00");
        $r = str_pad($r, 32, "\x00", STR_PAD_LEFT);
        $s = str_pad($s, 32, "\x00", STR_PAD_LEFT);

        return $r . $s;
    }
}

if (!function_exists('ccrm_get_or_create_vapid_keys')) {
    /**
     * Retrieves or automatically provisions VAPID ECDSA P-256 keys in system_settings.
     */
    function ccrm_get_or_create_vapid_keys(PDO $pdo): array {
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'VAPID_KEYS'");
            $stmt->execute();
            $raw = $stmt->fetchColumn();
            if ($raw) {
                $decoded = json_decode((string)$raw, true);
                if (is_array($decoded) && !empty($decoded['publicKey']) && !empty($decoded['pem'])) {
                    return $decoded;
                }
            }
        } catch (\Throwable $e) {
            // Proceed to generate
        }

        // Generate ECDSA P-256 (prime256v1 / secp256r1) key pair
        $keyPair = openssl_pkey_new([
            'curve_name' => 'prime256v1',
            'private_key_type' => OPENSSL_KEYTYPE_EC,
        ]);

        if (!$keyPair) {
            throw new \RuntimeException('Failed to generate OpenSSL EC key pair: ' . openssl_error_string());
        }

        $details = openssl_pkey_get_details($keyPair);
        if (!$details || empty($details['ec']['x']) || empty($details['ec']['y']) || empty($details['ec']['d'])) {
            throw new \RuntimeException('Failed to extract EC coordinates from key pair');
        }

        openssl_pkey_export($keyPair, $pem);

        // 65-byte uncompressed public key point: 0x04 || X || Y
        $uncompressedPoint = "\x04" . $details['ec']['x'] . $details['ec']['y'];
        $publicKeyB64 = ccrm_base64url_encode($uncompressedPoint);
        $privateKeyB64 = ccrm_base64url_encode($details['ec']['d']);

        $keys = [
            'publicKey' => $publicKeyB64,
            'privateKey' => $privateKeyB64,
            'pem' => $pem,
            'created_at' => date('Y-m-d H:i:s')
        ];

        try {
            $ins = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('VAPID_KEYS', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
            $ins->execute([json_encode($keys, JSON_UNESCAPED_SLASHES)]);
        } catch (\Throwable $e) {
            error_log('[ccrm webpush] Failed to persist VAPID keys: ' . $e->getMessage());
        }

        return $keys;
    }
}

if (!function_exists('ccrm_create_vapid_jwt')) {
    /**
     * Creates an RFC 8292 ES256 VAPID JWT for a push service origin.
     */
    function ccrm_create_vapid_jwt(string $audience, string $subject, array $vapidKeys): string {
        $header = ['typ' => 'JWT', 'alg' => 'ES256'];
        $claims = [
            'aud' => $audience,
            'exp' => time() + 43200, // 12 hours
            'sub' => $subject,
        ];

        $encodedHeader = ccrm_base64url_encode(json_encode($header, JSON_UNESCAPED_SLASHES));
        $encodedClaims = ccrm_base64url_encode(json_encode($claims, JSON_UNESCAPED_SLASHES));
        $dataToSign = $encodedHeader . '.' . $encodedClaims;

        $privateKeyRes = openssl_pkey_get_private($vapidKeys['pem']);
        if (!$privateKeyRes) {
            throw new \RuntimeException('Failed to load VAPID private key PEM');
        }

        $signatureDer = '';
        if (!openssl_sign($dataToSign, $signatureDer, $privateKeyRes, OPENSSL_ALGO_SHA256)) {
            throw new \RuntimeException('Failed to sign VAPID JWT: ' . openssl_error_string());
        }

        $rawSignature = ccrm_der_to_jose($signatureDer);
        return $dataToSign . '.' . ccrm_base64url_encode($rawSignature);
    }
}

if (!function_exists('ccrm_encrypt_webpush_payload')) {
    /**
     * Encrypts a push payload using RFC 8291 (Message Encryption for Web Push) & RFC 8188 (aes128gcm).
     */
    function ccrm_encrypt_webpush_payload(string $plaintext, string $uaPublicKeyB64, string $uaAuthB64): string {
        $uaPublic = ccrm_base64url_decode($uaPublicKeyB64);
        $uaAuth = ccrm_base64url_decode($uaAuthB64);

        if (strlen($uaPublic) !== 65 || ord($uaPublic[0]) !== 0x04) {
            throw new \InvalidArgumentException('Invalid user agent public key (must be 65-byte uncompressed point)');
        }
        if (strlen($uaAuth) < 16) {
            throw new \InvalidArgumentException('Invalid user agent auth token (must be at least 16 bytes)');
        }

        // Ephemeral application server EC key pair
        $asKey = openssl_pkey_new([
            'curve_name' => 'prime256v1',
            'private_key_type' => OPENSSL_KEYTYPE_EC,
        ]);
        if (!$asKey) {
            throw new \RuntimeException('Failed to create ephemeral EC key');
        }
        $asDetails = openssl_pkey_get_details($asKey);
        $asPublic = "\x04" . $asDetails['ec']['x'] . $asDetails['ec']['y'];

        // Convert User Agent raw point to SPKI PEM for openssl_pkey_derive
        $spkiHeader = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200');
        $uaPublicPem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spkiHeader . $uaPublic), 64, "\n") . "-----END PUBLIC KEY-----\n";
        $uaPubKeyResource = openssl_pkey_get_public($uaPublicPem);
        if (!$uaPubKeyResource) {
            throw new \RuntimeException('Failed to import user agent public key');
        }

        // ECDH shared secret
        $ecdhSecret = openssl_pkey_derive($uaPubKeyResource, $asKey);
        if (!$ecdhSecret) {
            throw new \RuntimeException('Failed to derive ECDH shared secret');
        }

        // RFC 8291 Section 3.4 Key Derivation
        $keyInfo = "WebPush: info\x00" . $uaPublic . $asPublic;
        $prkKey = hash_hmac('sha256', $ecdhSecret, $uaAuth, true);
        $ikm = hash_hmac('sha256', $keyInfo . "\x01", $prkKey, true);

        // RFC 8188 aes128gcm Content-Encoding
        $salt = random_bytes(16);
        $prk = hash_hmac('sha256', $ikm, $salt, true);
        $cek = substr(hash_hmac('sha256', "Content-Encoding: aes128gcm\x00\x01", $prk, true), 0, 16);
        $nonce = substr(hash_hmac('sha256', "Content-Encoding: nonce\x00\x01", $prk, true), 0, 12);

        // Plaintext with RFC 8188 delimiter \x02
        $record = $plaintext . "\x02";
        $tag = '';
        $ciphertext = openssl_encrypt($record, 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);

        // Body: Salt (16) || RecordSize (4, big-endian) || IDLen (1) || KeyID (65) || Ciphertext || Tag (16)
        return $salt . pack('N', 4096) . chr(strlen($asPublic)) . $asPublic . $ciphertext . $tag;
    }
}

if (!function_exists('ccrm_dispatch_webpush')) {
    /**
     * Sends an encrypted Web Push request to an endpoint.
     */
    function ccrm_dispatch_webpush(PDO $pdo, string $endpoint, string $p256dhB64, string $authB64, array $notificationData, array $vapidKeys): array {
        $parts = parse_url($endpoint);
        if (empty($parts['scheme']) || empty($parts['host'])) {
            return ['success' => false, 'status' => 0, 'error' => 'Invalid endpoint URL'];
        }

        $audience = $parts['scheme'] . '://' . $parts['host'] . (!empty($parts['port']) ? ':' . $parts['port'] : '');
        $subject = 'mailto:support@cstudios.sk';

        // Check company email from system_settings if configured
        try {
            $compStmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'COMPANY_BILLING_SETTINGS'");
            $compStmt->execute();
            $compVal = $compStmt->fetchColumn();
            if ($compVal) {
                $compData = json_decode((string)$compVal, true);
                if (!empty($compData['email']) && filter_var($compData['email'], FILTER_VALIDATE_EMAIL)) {
                    $subject = 'mailto:' . $compData['email'];
                }
            }
        } catch (\Throwable $e) {}

        $jwt = ccrm_create_vapid_jwt($audience, $subject, $vapidKeys);
        $payloadJson = json_encode($notificationData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $body = ccrm_encrypt_webpush_payload($payloadJson, $p256dhB64, $authB64);

        $headers = [
            'Content-Type: application/octet-stream',
            'Content-Encoding: aes128gcm',
            'TTL: 86400',
            'Urgency: high',
            'Authorization: vapid t=' . $jwt . ', k=' . $vapidKeys['publicKey'],
            'Crypto-Key: p256ecdsa=' . $vapidKeys['publicKey'],
        ];

        $ch = curl_init($endpoint);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

        $response = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        $success = in_array($status, [200, 201, 202], true);
        $expired = in_array($status, [404, 410], true);

        // Remove defunct/expired subscription
        if ($expired) {
            try {
                $endpointHash = hash('sha256', $endpoint);
                $del = $pdo->prepare("DELETE FROM `push_subscriptions` WHERE `endpoint_hash` = ?");
                $del->execute([$endpointHash]);
            } catch (\Throwable $e) {}
        }

        return [
            'success' => $success,
            'status' => $status,
            'response' => $response,
            'error' => $curlError,
            'expired' => $expired,
        ];
    }
}

if (!function_exists('ccrm_send_push_notification')) {
    /**
     * Broadcasts a push notification to all subscriptions belonging to a user (or all users if null).
     */
    function ccrm_send_push_notification(PDO $pdo, ?string $userNameOrEmail, string $title, string $body, ?string $url = '/#tasks', ?array $extra = []): array {
        try {
            $vapidKeys = ccrm_get_or_create_vapid_keys($pdo);
        } catch (\Throwable $e) {
            error_log('[ccrm webpush] Cannot get VAPID keys: ' . $e->getMessage());
            return ['sent' => 0, 'failed' => 0, 'error' => $e->getMessage()];
        }

        $sql = "SELECT `id`, `endpoint`, `p256dh`, `auth`, `user_name`, `user_email` FROM `push_subscriptions`";
        $params = [];

        if ($userNameOrEmail !== null && trim($userNameOrEmail) !== '') {
            $needle = trim($userNameOrEmail);
            $sql .= " WHERE `user_id` = ? OR `user_name` = ? OR `user_email` = ?";
            $params = [$needle, $needle, $needle];
        }

        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $subscriptions = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            error_log('[ccrm webpush] Subscription query error: ' . $e->getMessage());
            return ['sent' => 0, 'failed' => 0, 'error' => $e->getMessage()];
        }

        if (empty($subscriptions)) {
            return ['sent' => 0, 'failed' => 0, 'message' => 'No active subscriptions for target user'];
        }

        $notificationData = [
            'title' => $title,
            'body' => $body,
            'icon' => '/icon_192.png',
            'badge' => '/favicon.svg',
            'url' => $url ?: '/#tasks',
            'tag' => 'ccrm-' . substr(md5($title . microtime()), 0, 12),
            'timestamp' => time() * 1000,
            'data' => array_merge(['url' => $url ?: '/#tasks'], $extra ?: []),
        ];

        $sentCount = 0;
        $failCount = 0;
        $results = [];

        foreach ($subscriptions as $sub) {
            try {
                $res = ccrm_dispatch_webpush(
                    $pdo,
                    $sub['endpoint'],
                    $sub['p256dh'],
                    $sub['auth'],
                    $notificationData,
                    $vapidKeys
                );
                if ($res['success']) {
                    $sentCount++;
                } else {
                    $failCount++;
                }
                $results[] = [
                    'id' => $sub['id'],
                    'status' => $res['status'],
                    'success' => $res['success'],
                    'expired' => $res['expired'] ?? false,
                ];
            } catch (\Throwable $e) {
                $failCount++;
                error_log('[ccrm webpush] Dispatch failed for ' . $sub['id'] . ': ' . $e->getMessage());
            }
        }

        return [
            'sent' => $sentCount,
            'failed' => $failCount,
            'total' => count($subscriptions),
            'details' => $results,
        ];
    }
}

if (!function_exists('ccrm_send_task_assigned_push_notification')) {
    /**
     * Sends a push notification when a task is created and assigned to users.
     */
    function ccrm_send_task_assigned_push_notification(PDO $pdo, array $task, ?string $authorName = null): void {
        try {
            $candidates = [];
            if (!empty($task['owner'])) {
                $candidates[] = trim((string)$task['owner']);
            }
            if (!empty($task['assignedUsers']) && is_array($task['assignedUsers'])) {
                foreach ($task['assignedUsers'] as $u) {
                    $c = trim((string)$u);
                    if ($c !== '' && !in_array($c, $candidates, true)) {
                        $candidates[] = $c;
                    }
                }
            }

            if (empty($candidates)) return;

            $author = trim((string)($authorName ?: ($task['createdBy'] ?? 'Team')));

            // Fetch system language
            $sysLang = 'sk';
            try {
                $stmtLang = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'");
                if ($stmtLang && ($val = $stmtLang->fetchColumn())) {
                    if (in_array($val, ['en', 'sk', 'hu'], true)) $sysLang = $val;
                }
            } catch (\Throwable $e) {}

            $taskTitle = (string)($task['title'] ?? 'Task');
            $deadline = !empty($task['deadline']) ? (string)$task['deadline'] : '';

            foreach ($candidates as $targetUser) {
                // Don't notify the user who just assigned the task to themselves
                if (strcasecmp($targetUser, $author) === 0) continue;

                // Resolve target user language
                $userLang = $sysLang;
                try {
                    $uStmt = $pdo->prepare("SELECT `metadata_json` FROM `users` WHERE `name` = ? OR `email` = ? LIMIT 1");
                    $uStmt->execute([$targetUser, $targetUser]);
                    $metaRaw = $uStmt->fetchColumn();
                    if ($metaRaw) {
                        $meta = json_decode((string)$metaRaw, true);
                        if (!empty($meta['language']) && in_array($meta['language'], ['en', 'sk', 'hu'], true)) {
                            $userLang = $meta['language'];
                        }
                    }
                } catch (\Throwable $e) {}

                $title = match ($userLang) {
                    'sk' => 'Nová priradená úloha',
                    'hu' => 'Új feladat hozzárendelve',
                    default => 'New Task Assigned',
                };

                $body = match ($userLang) {
                    'sk' => ($author !== '' ? $author . ': ' : '') . $taskTitle . ($deadline ? ' (termín: ' . $deadline . ')' : ''),
                    'hu' => ($author !== '' ? $author . ': ' : '') . $taskTitle . ($deadline ? ' (határidő: ' . $deadline . ')' : ''),
                    default => ($author !== '' ? $author . ': ' : '') . $taskTitle . ($deadline ? ' (due: ' . $deadline . ')' : ''),
                };

                ccrm_send_push_notification(
                    $pdo,
                    $targetUser,
                    $title,
                    $body,
                    '/#tasks',
                    ['taskId' => $task['id'] ?? null, 'type' => 'task_assigned']
                );
            }
        } catch (\Throwable $e) {
            error_log('[ccrm webpush] Task assigned push failed: ' . $e->getMessage());
        }
    }
}

if (!function_exists('ccrm_send_task_completed_push_notification')) {
    /**
     * Sends a push notification when a task is completed to the task creator.
     */
    function ccrm_send_task_completed_push_notification(PDO $pdo, array $task, ?string $completerName = null): void {
        try {
            $creator = trim((string)($task['createdBy'] ?? ''));
            if ($creator === '') return;

            $completer = trim((string)($completerName ?: ($task['completedBy'] ?? 'Someone')));

            // Don't notify the person if they completed their own task
            if (strcasecmp($creator, $completer) === 0) return;

            // Fetch system language
            $sysLang = 'sk';
            try {
                $stmtLang = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'");
                if ($stmtLang && ($val = $stmtLang->fetchColumn())) {
                    if (in_array($val, ['en', 'sk', 'hu'], true)) $sysLang = $val;
                }
            } catch (\Throwable $e) {}

            $userLang = $sysLang;
            try {
                $uStmt = $pdo->prepare("SELECT `metadata_json` FROM `users` WHERE `name` = ? OR `email` = ? LIMIT 1");
                $uStmt->execute([$creator, $creator]);
                $metaRaw = $uStmt->fetchColumn();
                if ($metaRaw) {
                    $meta = json_decode((string)$metaRaw, true);
                    if (!empty($meta['language']) && in_array($meta['language'], ['en', 'sk', 'hu'], true)) {
                        $userLang = $meta['language'];
                    }
                }
            } catch (\Throwable $e) {}

            $taskTitle = (string)($task['title'] ?? 'Task');

            $title = match ($userLang) {
                'sk' => 'Úloha dokončená',
                'hu' => 'Feladat befejezve',
                default => 'Task Completed',
            };

            $body = match ($userLang) {
                'sk' => $completer . ' dokončil(a) úlohu: ' . $taskTitle,
                'hu' => $completer . ' befejezte a feladatot: ' . $taskTitle,
                default => $completer . ' completed task: ' . $taskTitle,
            };

            ccrm_send_push_notification(
                $pdo,
                $creator,
                $title,
                $body,
                '/#tasks',
                ['taskId' => $task['id'] ?? null, 'type' => 'task_completed']
            );
        } catch (\Throwable $e) {
            error_log('[ccrm webpush] Task completed push failed: ' . $e->getMessage());
        }
    }
}
