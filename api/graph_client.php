<?php
/**
 * Microsoft Graph plumbing for Exchange Online (Microsoft 365) mailboxes.
 *
 * Microsoft switched off password logins for IMAP / POP / SMTP in Exchange Online, and PHP's
 * imap_open() cannot do OAuth, so such a mailbox is read and written through Graph instead:
 * a second mail backend beside the IMAP one (mail_broker.php). This file is the part both the
 * interactive mailbox (graph_mail.php) and the background job (graph_filing.php) share:
 *
 *  - the app registration (client id, tenant, secret) an admin enters once,
 *  - the token store: a refresh token per mailbox, encrypted like a mailbox password, and a
 *    cached access token that is renewed on the server when it runs out,
 *  - one request function that adds the token, retries a throttled call once and turns
 *    Graph's errors into two kinds of exception (below).
 *
 * A mailbox profile with `provider = microsoft365` lives where an IMAP profile does: a user's
 * `metadata_json.emailSettings`, or `company_mailboxes.settings_json`. Its fields:
 *   graphAccount       the address that signed in (not a secret)
 *   graphRefreshToken  secret; EMPTY means "sign in again" (expired or revoked consent)
 *   graphAccessToken   secret; JSON {"t": token, "exp": unix time}
 *
 * Nothing here ever connects anywhere but graph.microsoft.com and login.microsoftonline.com.
 */

require_once __DIR__ . '/auth.php';

const CCRM_GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const CCRM_GRAPH_LOGIN = 'https://login.microsoftonline.com';
/** What a personal mailbox asks for. */
const CCRM_GRAPH_SCOPES = 'offline_access User.Read Mail.ReadWrite Mail.Send';
/** Added for a company mailbox, which may be a shared mailbox the signed-in admin has access to. */
const CCRM_GRAPH_SHARED_SCOPES = 'Mail.ReadWrite.Shared Mail.Send.Shared';

/**
 * The sign-in is no longer usable (expired, revoked consent, password change) and only the
 * mailbox's owner can fix it. The message is written for that person.
 */
class CcrmGraphReconnectException extends \Exception {
}

/** Any other Graph failure; `status` is the HTTP status (0 = no answer), `graphCode` Graph's own code. */
class CcrmGraphException extends \Exception {
    public int $status = 0;
    public string $graphCode = '';

    public function __construct(string $message, int $status = 0, string $graphCode = '') {
        parent::__construct($message);
        $this->status = $status;
        $this->graphCode = $graphCode;
    }
}

function ccrm_graph_reconnect_message(): string {
    return 'The Microsoft 365 sign-in for this mailbox has expired or was revoked. Sign in with Microsoft again in the e-mail settings to reconnect it.';
}

// ── the app registration ──────────────────────────────────────────────────────

function ccrm_graph_is_guid($value): bool {
    return is_string($value)
        && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $value) === 1
        && trim($value, '0-') !== '';
}

/** A tenant as it goes into the login URL: a tenant id, a verified domain, or `common`. */
function ccrm_graph_tenant($value): string {
    $value = trim((string)$value);
    if ($value === '' || trim($value, '0-') === '' || !preg_match('/^[A-Za-z0-9][A-Za-z0-9.\-]{0,190}$/', $value)) {
        return 'common';
    }
    return $value;
}

/** The stored registration as saved by an admin (secret decrypted), or [] when there is none. */
function ccrm_graph_app_stored(\PDO $pdo): array {
    try {
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'MS_GRAPH_APP'");
        $stmt->execute();
        $raw = $stmt->fetchColumn();
    } catch (\Throwable $e) {
        return [];
    }
    $cfg = is_string($raw) ? json_decode($raw, true) : null;
    return is_array($cfg) ? ccrm_decrypt_config_secrets($cfg, ['clientSecret']) : [];
}

/**
 * The app registration in use: ['clientId', 'tenant', 'clientSecret', 'source'], or [] when
 * none is complete. Our own setting wins; an install that already filled in the OAuth fields
 * of the Exchange outbound profile (Settings → Integrations) is honoured as a fallback.
 */
function ccrm_graph_app_config(\PDO $pdo): array {
    $own = ccrm_graph_app_stored($pdo);
    if (ccrm_graph_is_guid($own['clientId'] ?? null) && ($own['clientSecret'] ?? '') !== '') {
        return [
            'clientId' => strtolower($own['clientId']), 'tenant' => ccrm_graph_tenant($own['tenantId'] ?? ''),
            'clientSecret' => (string)$own['clientSecret'], 'source' => 'own',
        ];
    }
    $integrations = ccrm_load_integrations_config($pdo);
    if (ccrm_graph_is_guid($integrations['exchClientId'] ?? null) && ($integrations['exchClientSecret'] ?? '') !== ''
        && ($integrations['exchClientSecret'] ?? '') !== CCRM_SECRET_MASK) {
        return [
            'clientId' => strtolower($integrations['exchClientId']), 'tenant' => ccrm_graph_tenant($integrations['exchTenantId'] ?? ''),
            'clientSecret' => (string)$integrations['exchClientSecret'], 'source' => 'integrations',
        ];
    }
    return [];
}

/** Where Microsoft sends the browser back to. It has to be registered on the app, character for character. */
function ccrm_graph_redirect_uri(\PDO $pdo): string {
    return ccrm_app_base_url($pdo) . 'api/graph_oauth.php';
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

/**
 * One HTTPS request to Microsoft. Returns ['status' => int, 'headers' => [lower-case name => value],
 * 'body' => string]; status 0 means no answer at all. `$GLOBALS['ccrm_graph_transport']` replaces
 * the network in tests (scripts/test-graph-mail.php).
 */
function ccrm_graph_http(string $method, string $url, array $headers = [], ?string $body = null, int $timeout = 30): array {
    if (strpos($url, CCRM_GRAPH_BASE . '/') !== 0 && strpos($url, CCRM_GRAPH_LOGIN . '/') !== 0) {
        throw new CcrmGraphException('Refusing to call a host that is not Microsoft Graph.');
    }
    if (isset($GLOBALS['ccrm_graph_transport']) && is_callable($GLOBALS['ccrm_graph_transport'])) {
        return ($GLOBALS['ccrm_graph_transport'])($method, $url, $headers, $body);
    }
    if (!function_exists('curl_init')) {
        throw new CcrmGraphException('The PHP cURL extension is not available on this server, so Microsoft 365 mailboxes cannot be reached.');
    }
    $responseHeaders = [];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$responseHeaders) {
            $parts = explode(':', $line, 2);
            if (count($parts) === 2) {
                $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
            }
            return strlen($line);
        },
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    $out = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return ['status' => $out === false ? 0 : $status, 'headers' => $responseHeaders, 'body' => $out === false ? '' : (string)$out];
}

/** A call to the token endpoint. Returns ['ok' => bool, 'status' => int, 'data' => array]. */
function ccrm_graph_token_request(array $app, array $fields): array {
    $fields = ['client_id' => $app['clientId'], 'client_secret' => $app['clientSecret']] + $fields;
    $res = ccrm_graph_http(
        'POST',
        CCRM_GRAPH_LOGIN . '/' . rawurlencode($app['tenant']) . '/oauth2/v2.0/token',
        ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json'],
        http_build_query($fields, '', '&', PHP_QUERY_RFC3986)
    );
    $data = json_decode($res['body'], true);
    $data = is_array($data) ? $data : [];
    return ['ok' => $res['status'] === 200 && !empty($data['access_token']), 'status' => $res['status'], 'data' => $data];
}

/** The address of Microsoft's sign-in page for one authorization request (code flow with PKCE). */
function ccrm_graph_authorize_url(array $app, string $redirectUri, string $state, string $codeChallenge, string $scopes, string $loginHint = ''): string {
    $query = [
        'client_id' => $app['clientId'],
        'response_type' => 'code',
        'redirect_uri' => $redirectUri,
        'response_mode' => 'query',
        'scope' => $scopes,
        'state' => $state,
        'code_challenge' => $codeChallenge,
        'code_challenge_method' => 'S256',
        'prompt' => 'select_account',
    ];
    if ($loginHint !== '') {
        $query['login_hint'] = $loginHint;
    }
    return CCRM_GRAPH_LOGIN . '/' . rawurlencode($app['tenant']) . '/oauth2/v2.0/authorize?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
}

/** The PKCE challenge of a verifier: base64url(sha256(verifier)), no padding. */
function ccrm_graph_pkce_challenge(string $verifier): string {
    return rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
}

// ── a mailbox and its tokens ──────────────────────────────────────────────────

/** One Graph mailbox: whose tokens are used, where they are stored, and which mailbox they open. */
final class CcrmGraphMailbox {
    public \PDO $pdo;
    /** 'user' (users.metadata_json) or 'company' (company_mailboxes.settings_json). */
    public string $kind;
    public string $id;
    /** The decrypted profile; kept current as tokens are renewed. */
    public array $settings;
    /** The mailbox's own address, lower-case. */
    public string $address;
    /** '/me', or '/users/<address>' for a shared mailbox opened by somebody else's sign-in. */
    public string $base;
}

function ccrm_graph_mailbox(\PDO $pdo, string $kind, string $id, array $settings, string $address = ''): CcrmGraphMailbox {
    $account = strtolower(trim((string)($settings['graphAccount'] ?? '')));
    $address = strtolower(trim($address));
    $mb = new CcrmGraphMailbox();
    $mb->pdo = $pdo;
    $mb->kind = $kind;
    $mb->id = $id;
    $mb->settings = $settings;
    $mb->address = $address !== '' ? $address : $account;
    $mb->base = ($address === '' || $address === $account) ? '/me' : '/users/' . rawurlencode($address);
    return $mb;
}

/**
 * Writes token fields into a mailbox's stored profile, encrypted, leaving everything else in
 * the profile as it is. `$patch` may carry graphRefreshToken, graphAccessToken, graphAccount,
 * provider and isValidated; `$replace = true` drops the rest of the old profile (a mailbox
 * that was IMAP before must not keep its password).
 */
function ccrm_graph_store_profile(\PDO $pdo, string $kind, string $id, array $patch, bool $replace = false): void {
    $secretKeys = ['graphRefreshToken', 'graphAccessToken'];
    foreach ($secretKeys as $k) {
        if (isset($patch[$k]) && is_string($patch[$k]) && $patch[$k] !== '') {
            $patch[$k] = ccrm_encrypt_secret($patch[$k]);
        }
    }
    if ($kind === 'company') {
        $stmt = $pdo->prepare("SELECT `settings_json` FROM `company_mailboxes` WHERE `id` = ?");
        $stmt->execute([$id]);
        $raw = $stmt->fetchColumn();
        if ($raw === false) {
            return;
        }
        $old = json_decode((string)$raw, true);
        $new = array_merge($replace || !is_array($old) ? [] : $old, $patch);
        $pdo->prepare("UPDATE `company_mailboxes` SET `settings_json` = ? WHERE `id` = ?")
            ->execute([json_encode($new, JSON_UNESCAPED_UNICODE), $id]);
        return;
    }
    $stmt = $pdo->prepare("SELECT `metadata_json` FROM `users` WHERE `id` = ?");
    $stmt->execute([$id]);
    $raw = $stmt->fetchColumn();
    if ($raw === false) {
        return;
    }
    $meta = json_decode((string)$raw, true);
    $meta = is_array($meta) ? $meta : [];
    $old = (isset($meta['emailSettings']) && is_array($meta['emailSettings'])) ? $meta['emailSettings'] : [];
    $meta['emailSettings'] = array_merge($replace ? [] : $old, $patch);
    $encoded = json_encode($meta, JSON_INVALID_UTF8_SUBSTITUTE);
    if ($encoded !== false) {
        $pdo->prepare("UPDATE `users` SET `metadata_json` = ? WHERE `id` = ?")->execute([$encoded, $id]);
    }
}

/** Is this profile a signed-in Microsoft 365 mailbox (as opposed to one that has to sign in again)? */
function ccrm_graph_is_connected($settings): bool {
    return is_array($settings) && ($settings['provider'] ?? '') === 'microsoft365' && ($settings['graphRefreshToken'] ?? '') !== '';
}

/**
 * A valid access token for the mailbox, renewed with its refresh token when the cached one
 * is about to run out. Throws CcrmGraphReconnectException when the owner has to sign in again;
 * that state is stored (the refresh token is cleared), so it is reported instead of retried.
 */
function ccrm_graph_access_token(CcrmGraphMailbox $mb, bool $forceRefresh = false): string {
    $cached = json_decode((string)($mb->settings['graphAccessToken'] ?? ''), true);
    if (!$forceRefresh && is_array($cached) && !empty($cached['t']) && (int)($cached['exp'] ?? 0) > time() + 120) {
        return (string)$cached['t'];
    }
    $refresh = (string)($mb->settings['graphRefreshToken'] ?? '');
    if ($refresh === '') {
        throw new CcrmGraphReconnectException(ccrm_graph_reconnect_message());
    }
    $app = ccrm_graph_app_config($mb->pdo);
    if (!$app) {
        throw new CcrmGraphException('The Microsoft 365 app registration is missing. An administrator has to enter it in Settings before Microsoft 365 mailboxes can be used.');
    }
    $res = ccrm_graph_token_request($app, ['grant_type' => 'refresh_token', 'refresh_token' => $refresh]);
    if (!$res['ok']) {
        $error = (string)($res['data']['error'] ?? '');
        if (in_array($error, ['invalid_grant', 'interaction_required', 'consent_required', 'login_required'], true)) {
            $mb->settings['graphRefreshToken'] = '';
            $mb->settings['graphAccessToken'] = '';
            ccrm_graph_store_profile($mb->pdo, $mb->kind, $mb->id, ['graphRefreshToken' => '', 'graphAccessToken' => '']);
            throw new CcrmGraphReconnectException(ccrm_graph_reconnect_message());
        }
        if ($error === 'invalid_client' || $error === 'unauthorized_client') {
            throw new CcrmGraphException('Microsoft rejected the app registration (its client secret may have expired). An administrator has to update it in Settings.', $res['status'], $error);
        }
        throw new CcrmGraphException('Microsoft 365 sign-in service did not answer (' . ($res['status'] ?: 'no connection') . '). It will be tried again.', $res['status'], $error);
    }
    $token = (string)$res['data']['access_token'];
    $patch = ['graphAccessToken' => json_encode(['t' => $token, 'exp' => time() + max(60, (int)($res['data']['expires_in'] ?? 3600))])];
    if (!empty($res['data']['refresh_token'])) {
        $patch['graphRefreshToken'] = (string)$res['data']['refresh_token'];
    }
    $mb->settings = array_merge($mb->settings, $patch);
    ccrm_graph_store_profile($mb->pdo, $mb->kind, $mb->id, $patch);
    return $token;
}

/**
 * One Graph call for a mailbox. `$path` is relative to the mailbox ('/messages/…'), or a whole
 * Graph URL (a nextLink / deltaLink handed back by an earlier call). `$json` is sent as the body.
 * `$opts`: 'prefer' => extra Prefer values, 'raw' => true to get the body as bytes, 'timeout'.
 * Returns the decoded answer ([] when there is none). Ids are always the immutable ones, so a
 * message keeps its id when it is moved to another folder.
 */
function ccrm_graph_request(CcrmGraphMailbox $mb, string $method, string $path, array $query = [], $json = null, array $opts = []) {
    if (strpos($path, 'https://') === 0) {
        $url = $path;
    } else {
        $url = CCRM_GRAPH_BASE . $mb->base . $path;
    }
    if ($query) {
        $url .= (strpos($url, '?') === false ? '?' : '&') . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    }
    $prefer = array_merge(['IdType="ImmutableId"'], $opts['prefer'] ?? []);
    $body = $json === null ? null : json_encode($json, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $attempt = 0;
    $refreshed = false;
    while (true) {
        $attempt++;
        $headers = [
            'Authorization: Bearer ' . ccrm_graph_access_token($mb, $refreshed),
            'Accept: ' . (!empty($opts['raw']) ? '*/*' : 'application/json'),
            'Prefer: ' . implode(', ', $prefer),
        ];
        if ($body !== null) {
            $headers[] = 'Content-Type: application/json';
        }
        $res = ccrm_graph_http($method, $url, $headers, $body, (int)($opts['timeout'] ?? 30));
        $status = (int)$res['status'];

        if ($status >= 200 && $status < 300) {
            if (!empty($opts['raw'])) {
                return $res['body'];
            }
            $data = $res['body'] === '' ? [] : json_decode($res['body'], true);
            return is_array($data) ? $data : [];
        }
        // The cached token was refused: renew it once before giving up on the sign-in.
        if ($status === 401 && !$refreshed) {
            $refreshed = true;
            continue;
        }
        // Throttled or briefly unavailable: wait as told, once, when that is a short wait.
        $retryAfter = (int)($res['headers']['retry-after'] ?? 0);
        if (in_array($status, [429, 503, 504], true) && $attempt === 1 && $retryAfter >= 0 && $retryAfter <= 5) {
            if (!isset($GLOBALS['ccrm_graph_transport'])) {
                sleep(max(1, $retryAfter));
            }
            continue;
        }
        $err = json_decode($res['body'], true);
        $code = is_array($err) ? (string)($err['error']['code'] ?? '') : '';
        $detail = is_array($err) ? trim((string)($err['error']['message'] ?? '')) : '';
        if ($status === 401) {
            throw new CcrmGraphReconnectException(ccrm_graph_reconnect_message());
        }
        if ($status === 0) {
            throw new CcrmGraphException('Microsoft 365 could not be reached.', 0);
        }
        if ($status === 404) {
            throw new CcrmGraphException('This message is no longer in the mailbox (it may have been moved or deleted).', 404, $code);
        }
        if ($status === 403) {
            throw new CcrmGraphException('Microsoft 365 refused access to this mailbox' . ($detail !== '' ? ': ' . $detail : '.'), 403, $code);
        }
        if ($status === 429) {
            throw new CcrmGraphException('Microsoft 365 is limiting requests for this mailbox right now. Try again in a moment.', 429, $code);
        }
        throw new CcrmGraphException('Microsoft 365 request failed (' . $status . ($code !== '' ? ' ' . $code : '') . ')' . ($detail !== '' ? ': ' . $detail : '.'), $status, $code);
    }
}
