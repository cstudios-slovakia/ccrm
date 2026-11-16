<?php
/**
 * Microsoft 365 Graph mail check.
 * Split out of marveen_lib.php (pure move); loaded by it.
 */

// -----------------------------------------------------------------------------
// Zero-dependency Microsoft 365 Graph Mail Check (ported from Szotasz/marveen src/graph-mail.ts)
// -----------------------------------------------------------------------------

if (!function_exists('ccrm_marveen_graph_mail_check')) {
    function ccrm_marveen_graph_mail_check(array $settings, string $address): array {
        $tenantId = trim((string)($settings['graphTenantId'] ?? ''));
        $clientId = trim((string)($settings['graphClientId'] ?? ''));
        $clientSecret = (string)($settings['graphClientSecret'] ?? '');
        $mailbox = trim((string)($address ?: ($settings['imapUsername'] ?? '')));

        if ($tenantId === '' || $clientId === '' || $clientSecret === '' || $mailbox === '') {
            return [
                'ok' => false,
                'error' => 'M365 Graph requires Tenant ID, Client ID, Client Secret, and Mailbox address.',
            ];
        }

        $tokenUrl = 'https://login.microsoftonline.com/' . rawurlencode($tenantId) . '/oauth2/v2.0/token';
        $postBody = http_build_query([
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'scope' => 'https://graph.microsoft.com/.default',
            'grant_type' => 'client_credentials',
        ]);

        $ch = curl_init($tokenUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $postBody,
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);
        $tokRes = curl_exec($ch);
        $tokCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $tokErr = curl_error($ch);
        curl_close($ch);

        if ($tokRes === false) {
            return ['ok' => false, 'error' => 'M365 token request failed: ' . $tokErr];
        }
        $tokJson = json_decode((string)$tokRes, true);
        $accessToken = is_array($tokJson) ? (string)($tokJson['access_token'] ?? '') : '';
        if ($tokCode < 200 || $tokCode >= 300 || $accessToken === '') {
            $desc = is_array($tokJson) ? (string)($tokJson['error_description'] ?? ($tokJson['error'] ?? '')) : '';
            return ['ok' => false, 'error' => 'M365 OAuth rejected (' . $tokCode . '): ' . ($desc ?: 'check Tenant/Client credentials')];
        }

        $mailUrl = 'https://graph.microsoft.com/v1.0/users/' . rawurlencode($mailbox) . '/mailFolders/inbox/messages?$top=1&$select=id,subject';
        $ch2 = curl_init($mailUrl);
        curl_setopt_array($ch2, [
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $accessToken],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);
        $mailRes = curl_exec($ch2);
        $mailCode = (int)curl_getinfo($ch2, CURLINFO_HTTP_CODE);
        curl_close($ch2);

        if ($mailCode >= 200 && $mailCode < 300) {
            return ['ok' => true, 'mode' => 'graph'];
        }
        return ['ok' => false, 'error' => 'M365 Graph mailbox check returned HTTP ' . $mailCode];
    }
}
