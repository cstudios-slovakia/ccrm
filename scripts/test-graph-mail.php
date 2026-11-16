<?php
/**
 * Checks for Microsoft 365 mailboxes (api/graph_client.php, graph_mail.php, graph_filing.php).
 * Microsoft is never contacted: a small fake of Graph and of the token endpoint stands in for
 * the network ($GLOBALS['ccrm_graph_transport']), and the real code runs against it.
 *
 *   php scripts/test-graph-mail.php        names, ids, the token store and the mailbox actions (SQLite in memory)
 *
 *   CCRM_TEST_DSN="mysql:host=db;dbname=graph_scratch;charset=utf8mb4" CCRM_TEST_USER=root CCRM_TEST_PASS=x \
 *   php scripts/test-graph-mail.php        also the whole filing job, in a SCRATCH MySQL database
 *
 * The database part creates the whole schema in the scratch database and DROPS every table in
 * it first: never point it at real data. CCRM_API_DIR overrides the folder that holds the api
 * files (for running inside the dev container, see docs/TESTING.md).
 */
if (!defined('CCRM_SECRET_KEY')) {
    define('CCRM_SECRET_KEY', 'test-key-for-graph-mail-checks-only');
}
$api = getenv('CCRM_API_DIR') ?: __DIR__ . '/../public/api';
require_once $api . '/auth.php';
require_once $api . '/mail_filing.php';
require_once $api . '/graph_filing.php';

$fails = 0;
$check = function (string $name, bool $ok, string $detail = '') use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . ($ok || $detail === '' ? '' : "  [$detail]") . "\n";
    if (!$ok) { $fails++; }
};

// ── a fake Microsoft ──────────────────────────────────────────────────────────
/**
 * Mailboxes by Graph base ('/me' for whoever's token is used, '/users/<address>'), each
 * ['inbox' => [messages], 'sentitems' => [messages]]. A message: id, seq (order of arrival),
 * received (unix), from, to[], cc[], subject, body, messageId, attachments [{id, name, bytes, inline?}].
 */
$fake = (object)[
    'boxes' => [], 'seq' => 0, 'tokenError' => null, 'tokenCalls' => 0, 'calls' => [], 'pageSize' => 2,
    'sent' => [], 'patched' => [], 'moved' => [], 'expired401' => 0, 'accounts' => [],
];
$addMessage = function (string $token, string $folder, array $m) use ($fake) {
    $fake->seq++;
    $m += ['id' => 'MSG-' . str_pad((string)$fake->seq, 4, '0', STR_PAD_LEFT) . str_repeat('x', 120), 'seq' => $fake->seq, 'received' => time(),
        'to' => [], 'cc' => [], 'subject' => 'Subject ' . $fake->seq, 'body' => 'body ' . $fake->seq, 'messageId' => '<m' . $fake->seq . '@x>', 'attachments' => [], 'isRead' => false];
    $fake->boxes[$token][$folder][] = $m;
    return $m['id'];
};
$person = fn($a) => ['emailAddress' => ['name' => ucfirst(strstr($a, '@', true)), 'address' => $a]];
$asGraph = function (array $m, bool $withBody = false) use ($person) {
    $out = [
        'id' => $m['id'], 'subject' => $m['subject'], 'from' => $person($m['from']),
        'toRecipients' => array_map($person, $m['to']), 'ccRecipients' => array_map($person, $m['cc']),
        'receivedDateTime' => gmdate('Y-m-d\TH:i:s\Z', $m['received']), 'sentDateTime' => gmdate('Y-m-d\TH:i:s\Z', $m['received']),
        'isRead' => $m['isRead'], 'isDraft' => false, 'internetMessageId' => $m['messageId'],
        'bodyPreview' => mb_substr($m['body'], 0, 255), 'hasAttachments' => count(array_filter($m['attachments'], fn($a) => empty($a['inline']))) > 0,
    ];
    if ($withBody) $out['body'] = ['contentType' => 'text', 'content' => $m['body']];
    return $out;
};
$GLOBALS['ccrm_graph_transport'] = function (string $method, string $url, array $headers, ?string $body) use ($fake, $asGraph) {
    $json = fn(int $status, $data, array $h = []) => ['status' => $status, 'headers' => $h, 'body' => is_string($data) ? $data : json_encode($data)];
    $fake->calls[] = $method . ' ' . $url;
    if (strpos($url, CCRM_GRAPH_LOGIN) === 0) {
        $fake->tokenCalls++;
        parse_str((string)$body, $form);
        if ($fake->tokenError) return $json(400, ['error' => $fake->tokenError, 'error_description' => 'AADSTS… test']);
        // The access token names the account, so the fake knows whose '/me' a request means.
        $who = preg_replace('/^(RT|CODE)-/', '', (string)($form['refresh_token'] ?? ($form['code'] ?? '')));
        return $json(200, ['access_token' => 'AT-' . $who . '-' . $fake->tokenCalls, 'refresh_token' => 'RT-' . $who, 'expires_in' => 3600]);
    }
    $auth = '';
    foreach ($headers as $h) if (stripos($h, 'Authorization: Bearer ') === 0) $auth = substr($h, 22);
    if ($fake->expired401 > 0) { $fake->expired401--; return $json(401, ['error' => ['code' => 'InvalidAuthenticationToken', 'message' => 'expired']]); }
    if (!preg_match('/^AT-(.+)-\d+$/', $auth, $am)) return $json(401, ['error' => ['code' => 'InvalidAuthenticationToken', 'message' => 'no token']]);
    $who = $am[1];

    $parts = parse_url($url);
    $path = substr($parts['path'], strlen('/v1.0'));
    parse_str($parts['query'] ?? '', $q);
    if (preg_match('#^/users/([^/]+)(/.*)$#', $path, $um)) {
        $box = rawurldecode($um[1]);
        $path = $um[2];
        if (!in_array($box, $fake->accounts[$who] ?? [], true)) return $json(403, ['error' => ['code' => 'ErrorAccessDenied', 'message' => 'Access is denied.']]);
    } elseif (strpos($path, '/me') === 0) {
        $box = $who;
        $path = substr($path, 3);
        if ($path === '' || $path === false) return $json(200, ['mail' => $who, 'userPrincipalName' => $who]);
    } else {
        return $json(404, ['error' => ['code' => 'BadRequest', 'message' => 'unknown path']]);
    }
    $folders = $fake->boxes[$box] ?? ['inbox' => [], 'sentitems' => []];
    $find = function (string $id) use ($fake, $box) {
        foreach ($fake->boxes[$box] ?? [] as $folder => $list) foreach ($list as $i => $m) if ($m['id'] === $id) return [$folder, $i, $m];
        return null;
    };
    $filterTimes = function (string $filter): array {
        $ge = null; $le = null;
        if (preg_match('/receivedDateTime ge (\S+)/', $filter, $x)) $ge = strtotime($x[1]);
        if (preg_match('/receivedDateTime le (\S+)/', $filter, $x)) $le = strtotime($x[1]);
        return [$ge, $le];
    };

    // delta: /mailFolders/{f}/messages/delta
    if ($method === 'GET' && preg_match('#^/mailFolders/([^/]+)/messages/delta$#', $path, $fm)) {
        $list = $folders[$fm[1]] ?? [];
        if (isset($q['$deltatoken']) || isset($q['$skiptoken'])) {
            if (($q['$deltatoken'] ?? '') === 'GONE') return $json(410, ['error' => ['code' => 'SyncStateNotFound', 'message' => 'gone']]);
            list($sinceSeq, $ge, $offset) = array_map('intval', explode(':', (string)($q['$deltatoken'] ?? $q['$skiptoken'])) + [0, 0, 0]);
        } else {
            list($geTime) = $filterTimes((string)($q['$filter'] ?? ''));
            $sinceSeq = 0; $ge = (int)$geTime; $offset = 0;
        }
        $hits = array_values(array_filter($list, fn($m) => $m['seq'] > $sinceSeq && $m['received'] >= $ge));
        usort($hits, fn($a, $b) => $a['seq'] <=> $b['seq']);
        $page = array_slice($hits, $offset, $fake->pageSize);
        $base = CCRM_GRAPH_BASE . ($box === $who ? '/me' : '/users/' . rawurlencode($box)) . '/mailFolders/' . $fm[1] . '/messages/delta';
        $res = ['value' => array_map(fn($m) => $asGraph($m), $page)];
        if ($offset + count($page) < count($hits)) {
            $res['@odata.nextLink'] = $base . '?$skiptoken=' . $sinceSeq . ':' . $ge . ':' . ($offset + count($page));
        } else {
            $res['@odata.deltaLink'] = $base . '?$deltatoken=' . $fake->seq . ':' . $ge . ':0';
        }
        return $json(200, $res);
    }
    // a folder's listing: /mailFolders/{f}/messages
    if ($method === 'GET' && preg_match('#^/mailFolders/([^/]+)/messages$#', $path, $fm)) {
        $list = $folders[$fm[1]] ?? [];
        list($ge, $le) = $filterTimes((string)($q['$filter'] ?? ''));
        if (isset($q['$search']) && preg_match('/participants:([^"]+)/', $q['$search'], $s)) {
            $list = array_filter($list, fn($m) => $m['from'] === $s[1] || in_array($s[1], $m['to'], true) || in_array($s[1], $m['cc'], true));
        }
        if (strpos((string)($q['$filter'] ?? ''), 'isRead eq false') !== false) $list = array_filter($list, fn($m) => !$m['isRead']);
        $hits = array_values(array_filter($list, fn($m) => ($ge === null || $m['received'] >= $ge) && ($le === null || $m['received'] <= $le)));
        usort($hits, fn($a, $b) => [$b['received'], $b['seq']] <=> [$a['received'], $a['seq']]);
        $skip = (int)($q['$skip'] ?? 0);
        $top = min((int)($q['$top'] ?? 10), isset($q['$orderby']) && !isset($q['$count']) ? $fake->pageSize : 1000);
        $page = array_slice($hits, $skip, $top);
        $res = ['value' => array_map(fn($m) => $asGraph($m, strpos((string)($q['$select'] ?? ''), 'body') !== false), $page)];
        if (isset($q['$count'])) $res['@odata.count'] = count($hits);
        if ($skip + count($page) < count($hits) && !isset($q['$count']) && !isset($q['$search'])) {
            $next = $q; $next['$skip'] = $skip + count($page);
            $res['@odata.nextLink'] = CCRM_GRAPH_BASE . ($box === $who ? '/me' : '/users/' . rawurlencode($box)) . '/mailFolders/' . $fm[1] . '/messages?' . http_build_query($next);
        }
        return $json(200, $res);
    }
    if ($method === 'GET' && preg_match('#^/mailFolders/([^/]+)$#', $path, $fm)) {
        $list = $folders[$fm[1]] ?? [];
        return $json(200, ['id' => $fm[1], 'unreadItemCount' => count(array_filter($list, fn($m) => !$m['isRead'])), 'totalItemCount' => count($list)]);
    }
    if ($method === 'GET' && $path === '/mailFolders') {
        return $json(200, ['value' => [['id' => 'inbox', 'displayName' => 'Inbox'], ['id' => 'sentitems', 'displayName' => 'Sent Items']]]);
    }
    // lookup by Message-ID, or a new draft
    if ($path === '/messages') {
        if ($method === 'POST') {
            $draft = json_decode((string)$body, true);
            $fake->drafts[$box][] = $draft;
            return $json(201, ['id' => 'DRAFT-' . count($fake->drafts[$box]), 'internetMessageId' => '<sent-' . count($fake->drafts[$box]) . '@graph>']);
        }
        if (preg_match("/internetMessageId eq '(.*)'$/", (string)($q['$filter'] ?? ''), $x)) {
            $want = str_replace("''", "'", $x[1]);
            foreach ($folders as $list) foreach ($list as $m) if ($m['messageId'] === $want) return $json(200, ['value' => [['id' => $m['id']]]]);
            return $json(200, ['value' => []]);
        }
    }
    if (preg_match('#^/messages/([^/]+)(/.*)?$#', $path, $mm)) {
        $id = rawurldecode($mm[1]);
        $rest = $mm[2] ?? '';
        if (strpos($id, 'DRAFT-') === 0) {
            if ($method === 'POST' && $rest === '/send') { $fake->sent[] = $fake->drafts[$box][(int)substr($id, 6) - 1]; return $json(202, ''); }
            if ($method === 'DELETE') return $json(204, '');
        }
        $hit = $find($id);
        if (!$hit) return $json(404, ['error' => ['code' => 'ErrorItemNotFound', 'message' => 'not found']]);
        list($folder, $i, $m) = $hit;
        if ($method === 'GET' && $rest === '') return $json(200, ['id' => $id, 'isRead' => $m['isRead'], 'hasAttachments' => (bool)$m['attachments'], 'body' => ['contentType' => 'text', 'content' => $m['body']]]);
        if ($method === 'PATCH' && $rest === '') {
            $patch = json_decode((string)$body, true);
            $fake->boxes[$box][$folder][$i]['isRead'] = !empty($patch['isRead']);
            $fake->patched[] = $id;
            return $json(200, ['id' => $id, 'isRead' => !empty($patch['isRead'])]);
        }
        if ($method === 'POST' && $rest === '/move') { $fake->moved[] = $id; array_splice($fake->boxes[$box][$folder], $i, 1); return $json(201, ['id' => $id]); }
        if ($method === 'GET' && $rest === '/attachments') {
            return $json(200, ['value' => array_map(fn($a) => ['@odata.type' => '#microsoft.graph.fileAttachment', 'id' => $a['id'], 'name' => $a['name'],
                'size' => strlen($a['bytes']), 'contentType' => !empty($a['inline']) ? 'image/png' : 'application/octet-stream', 'isInline' => !empty($a['inline'])], $m['attachments'])]);
        }
        if ($method === 'GET' && preg_match('#^/attachments/([^/]+)/\$value$#', $rest, $at)) {
            foreach ($m['attachments'] as $a) if ($a['id'] === rawurldecode($at[1])) return $json(200, $a['bytes']);
            return $json(404, ['error' => ['code' => 'ErrorItemNotFound', 'message' => 'no attachment']]);
        }
    }
    return $json(400, ['error' => ['code' => 'BadRequest', 'message' => 'the fake does not know ' . $method . ' ' . $path]]);
};

// ── names and ids (no database) ───────────────────────────────────────────────
$check('the folder names the client uses map onto Graph\'s well-known folders',
    ccrm_graph_folder('INBOX') === 'inbox' && ccrm_graph_folder('Sent') === 'sentitems' && ccrm_graph_folder('Sent Items') === 'sentitems' && ccrm_graph_folder('Trash') === 'deleteditems');
$check('...and back to the labels the rest of the app stores', ccrm_graph_folder_label('inbox') === 'INBOX' && ccrm_graph_folder_label('sentitems') === 'Sent');
$longId = 'AAkALgAAAAAAHYQDEapmEc2byACqAC-EWg0A' . str_repeat('Ab_-', 30) . '=';
$eid = ccrm_graph_event_id('Jana@Laminam.SK', $longId);
$check('a timeline id fits the column, starts with "email-" and does not depend on the case of the address',
    strlen($eid) <= 50 && strpos($eid, 'email-g-') === 0 && $eid === ccrm_graph_event_id('jana@laminam.sk', $longId) && $eid !== ccrm_graph_event_id('other@laminam.sk', $longId));
$check('the tail of a timeline id is recognised, a Graph id and an IMAP uid are not',
    ccrm_graph_is_event_hash(substr($eid, 8)) && !ccrm_graph_is_event_hash($longId) && !ccrm_graph_is_event_hash('133'));
$check('an IMAP uid is its own summary key, a long Graph id is hashed to fit', ccrm_mail_uid_key('133') === '133' && strlen(ccrm_mail_uid_key($longId)) === 41 && ccrm_mail_uid_key($longId) === ccrm_mail_uid_key($longId));
$check('mail is outgoing when the mailbox sent it: by its own address anywhere, and by Sent Items even from an alias',
    ccrm_graph_is_outgoing(['a@x.sk'], 'A@x.sk', 'INBOX') && ccrm_graph_is_outgoing(['a@x.sk'], 'alias@x.sk', 'Sent') && !ccrm_graph_is_outgoing(['a@x.sk'], 'customer@y.sk', 'INBOX'));
$check('addresses are read out of Graph recipients, lower-cased, without blanks',
    ccrm_graph_addresses([['emailAddress' => ['name' => 'A', 'address' => 'A@X.sk']], ['emailAddress' => ['name' => 'no address']], 'junk']) === ['a@x.sk']);
$check('an HTML body becomes readable text', ccrm_graph_html_to_text('<html><head><style>p{}</style></head><body><p>Dobr&yacute; de&#328;</p><div>druh&yacute;</div></body></html>') === "Dobrý deň\ndruhý");
$check('only a real application id counts as one',
    ccrm_graph_is_guid('1b2c3d4e-0000-1111-2222-333344445555') && !ccrm_graph_is_guid('00000000-0000-0000-0000-000000000000') && !ccrm_graph_is_guid('x') && !ccrm_graph_is_guid(null));
$check('a missing or placeholder tenant means "any organisation"',
    ccrm_graph_tenant('') === 'common' && ccrm_graph_tenant('00000000-0000-0000-0000-000000000000') === 'common' && ccrm_graph_tenant('laminam.onmicrosoft.com') === 'laminam.onmicrosoft.com' && ccrm_graph_tenant('a/b') === 'common');
$check('the PKCE challenge is the one from RFC 7636', ccrm_graph_pkce_challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk') === 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
$appCfg = ['clientId' => '1b2c3d4e-0000-1111-2222-333344445555', 'tenant' => 'common', 'clientSecret' => 's'];
parse_str((string)parse_url(ccrm_graph_authorize_url($appCfg, 'https://crm.test/api/graph_oauth.php', 'st', 'ch', CCRM_GRAPH_SCOPES, 'a@x.sk'), PHP_URL_QUERY), $authQ);
$check('the sign-in address asks for a code with PKCE, offline access and the mail scopes, and never carries the secret',
    $authQ['response_type'] === 'code' && $authQ['code_challenge_method'] === 'S256' && $authQ['state'] === 'st' && $authQ['redirect_uri'] === 'https://crm.test/api/graph_oauth.php'
    && strpos($authQ['scope'], 'offline_access') !== false && strpos($authQ['scope'], 'Mail.Send') !== false && $authQ['login_hint'] === 'a@x.sk' && !isset($authQ['client_secret']));
$refused = false;
try { ccrm_graph_http('GET', 'https://evil.example/v1.0/me'); } catch (CcrmGraphException $e) { $refused = true; }
$check('no request ever leaves for a host that is not Microsoft', $refused);

// ── the token store and the mailbox actions (SQLite in memory) ────────────────
$lite = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$lite->exec("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, metadata_json TEXT)");
$lite->exec("CREATE TABLE system_settings (`key` TEXT PRIMARY KEY, `value` TEXT)");
$lite->exec("CREATE TABLE company_mailboxes (id TEXT PRIMARY KEY, address TEXT, settings_json TEXT)");
$lite->exec("CREATE TABLE timeline_events (id TEXT PRIMARY KEY, type TEXT, mail_message_id TEXT)");
$check('without an app registration there is none', ccrm_graph_app_config($lite) === []);
$lite->prepare("INSERT INTO system_settings VALUES ('INTEGRATIONS_CONFIG', ?)")->execute([json_encode(['exchClientId' => '9f9f9f9f-0000-1111-2222-333344445555', 'exchTenantId' => '', 'exchClientSecret' => ccrm_encrypt_secret('old-secret')])]);
$check('the Exchange app details of the outgoing mail settings are honoured', (ccrm_graph_app_config($lite)['source'] ?? '') === 'integrations' && ccrm_graph_app_config($lite)['clientSecret'] === 'old-secret');
$lite->prepare("INSERT INTO system_settings VALUES ('MS_GRAPH_APP', ?)")->execute([json_encode(['clientId' => '1B2C3D4E-0000-1111-2222-333344445555', 'tenantId' => '', 'clientSecret' => ccrm_encrypt_secret('app-secret')])]);
$cfg = ccrm_graph_app_config($lite);
$check('our own app registration wins, with its secret decrypted', $cfg['source'] === 'own' && $cfg['clientSecret'] === 'app-secret' && $cfg['clientId'] === '1b2c3d4e-0000-1111-2222-333344445555' && $cfg['tenant'] === 'common');

$jana = 'jana@laminam.sk';
$lite->prepare("INSERT INTO users VALUES ('u-1', 'jana@crm.test', 'Jana', ?)")->execute([json_encode(['theme' => 'dark', 'emailSettings' => ['provider' => 'smtp', 'imapHost' => 'old.host', 'imapPassword' => ccrm_encrypt_secret('old-password'), 'isValidated' => true]])]);
ccrm_graph_store_profile($lite, 'user', 'u-1', ['provider' => 'microsoft365', 'graphAccount' => $jana, 'graphRefreshToken' => 'RT-' . $jana, 'graphAccessToken' => '', 'isValidated' => true], true);
$storedMeta = json_decode($lite->query("SELECT metadata_json FROM users WHERE id = 'u-1'")->fetchColumn(), true);
$check('a sign-in replaces the old IMAP profile (no password left behind) and keeps the rest of the user\'s settings',
    $storedMeta['theme'] === 'dark' && !isset($storedMeta['emailSettings']['imapPassword']) && !isset($storedMeta['emailSettings']['imapHost']) && $storedMeta['emailSettings']['provider'] === 'microsoft365');
$check('the refresh token is stored encrypted', strpos($storedMeta['emailSettings']['graphRefreshToken'], 'enc:v1:') === 0 && strpos(json_encode($storedMeta), 'RT-' . $jana) === false);
$masked = json_decode(ccrm_mask_user_metadata(json_encode($storedMeta)), true);
$check('...and reaches the browser only as a mask', $masked['emailSettings']['graphRefreshToken'] === CCRM_SECRET_MASK && $masked['emailSettings']['graphAccount'] === $jana);
$clientPush = $masked; unset($clientPush['emailSettings']['graphAccessToken']);
$merged = json_decode(ccrm_merge_user_metadata(json_encode($clientPush), json_encode($storedMeta)), true);
$check('a sync from the browser (mask, or the key left out) keeps the stored tokens', ccrm_decrypt_email_settings($merged['emailSettings'])['graphRefreshToken'] === 'RT-' . $jana);

$load = fn() => ccrm_decrypt_email_settings(json_decode($lite->query("SELECT metadata_json FROM users WHERE id = 'u-1'")->fetchColumn(), true)['emailSettings']);
$mb = ccrm_graph_mailbox($lite, 'user', 'u-1', $load());
$check('a mailbox opened by its own sign-in is "/me"', $mb->base === '/me' && $mb->address === $jana && ccrm_graph_is_connected($mb->settings));
$shared = ccrm_graph_mailbox($lite, 'company', 'cmb-x', ['provider' => 'microsoft365', 'graphAccount' => $jana], 'Info@Laminam.sk');
$check('a shared mailbox opened by somebody else\'s sign-in is addressed by its own address', $shared->base === '/users/info%40laminam.sk' && $shared->address === 'info@laminam.sk');

$t1 = ccrm_graph_access_token($mb);
$check('the first call gets an access token with the refresh token', $t1 === 'AT-' . $jana . '-1' && $fake->tokenCalls === 1);
$check('...which is cached, encrypted, and used again without asking Microsoft', ccrm_graph_access_token(ccrm_graph_mailbox($lite, 'user', 'u-1', $load())) === $t1 && $fake->tokenCalls === 1
    && strpos(json_decode($lite->query("SELECT metadata_json FROM users WHERE id = 'u-1'")->fetchColumn(), true)['emailSettings']['graphAccessToken'], 'enc:v1:') === 0);

// the mailbox as the mail screen uses it
$now = time();
$idA = $addMessage($jana, 'inbox', ['from' => 'novak@cust.sk', 'to' => [$jana], 'subject' => 'Dopyt', 'body' => 'Dobrý deň, prosím ponuku.', 'received' => $now - 300,
    'attachments' => [['id' => 'ATT-1' . str_repeat('y', 150), 'name' => 'dopyt.pdf', 'bytes' => "%PDF-1.4\nx\n%%EOF\n"], ['id' => 'ATT-2', 'name' => 'logo.png', 'bytes' => 'png', 'inline' => true]]]);
$idB = $addMessage($jana, 'inbox', ['from' => 'spam@random.sk', 'to' => [$jana], 'subject' => '', 'received' => $now - 200, 'isRead' => true]);
$idC = $addMessage($jana, 'sentitems', ['from' => $jana, 'to' => ['novak@cust.sk'], 'subject' => 'Re: Dopyt', 'received' => $now - 100]);

$detail = ccrm_graph_email_detail($mb, $idA);
$check('a message opens with its body and its real attachments, the picture inside the body left out',
    $detail['uid'] === $idA && $detail['text'] === 'Dobrý deň, prosím ponuku.' && $detail['seen'] === false && count($detail['attachments']) === 1
    && $detail['attachments'][0]['name'] === 'dopyt.pdf' && $detail['attachments'][0]['type'] === 'pdf' && !isset($detail['attachments'][0]['inline_image']));
$check('an attachment is downloaded byte for byte', ccrm_graph_attachment_bytes($mb, $idA, $detail['attachments'][0]['part_num']) === "%PDF-1.4\nx\n%%EOF\n");
$check('opening a message does not mark it read', $fake->patched === []);
$check('marking it read reports the flag Microsoft holds afterwards', ccrm_graph_set_seen($mb, $idA, true) === true && $fake->patched === [$idA]);
$sentResult = ccrm_graph_send($mb, 'Novák <novak@cust.sk>; second@cust.sk', 'Ponuka', '<p>V prílohe</p>');
$check('a message is sent as a draft that is then sent, and its Message-ID comes back',
    count($fake->sent) === 1 && $fake->sent[0]['subject'] === 'Ponuka' && $fake->sent[0]['body']['contentType'] === 'HTML'
    && array_column(array_column($fake->sent[0]['toRecipients'], 'emailAddress'), 'address') === ['novak@cust.sk', 'second@cust.sk']
    && $sentResult === ['message_id' => '<sent-1@graph>', 'filed_to_sent' => true]);
$badRecipient = false;
try { ccrm_graph_send($mb, 'not an address', 's', 'b'); } catch (CcrmGraphException $e) { $badRecipient = true; }
$check('a recipient that is not an address is refused before anything is sent', $badRecipient && count($fake->sent) === 1);
$gone = false;
try { ccrm_graph_email_detail($mb, 'MSG-does-not-exist'); } catch (CcrmGraphException $e) { $gone = $e->status === 404 && strpos($e->getMessage(), 'no longer') !== false; }
$check('a message that is gone says so', $gone);
$lite->prepare("INSERT INTO timeline_events VALUES (?, 'email', ?)")->execute([ccrm_graph_event_id($jana, $idC), '<m3@x>']);
$check('the tail of a timeline id is resolved back to the message through its Message-ID', ccrm_graph_resolve_id($mb, substr(ccrm_graph_event_id($jana, $idC), 8)) === $idC);
ccrm_graph_delete($mb, $idB);
$check('deleting moves the message to Deleted Items', $fake->moved === [$idB]);
$check('the connection test answers like the IMAP one', ccrm_graph_test($mb) === ['success' => true]);

// an access token Microsoft no longer accepts is renewed once, quietly
$fake->expired401 = 1;
$callsBefore = $fake->tokenCalls;
$check('a refused access token is renewed and the call repeated', ccrm_graph_test($mb) === ['success' => true] && $fake->tokenCalls === $callsBefore + 1);

// a company mailbox signed in by somebody without access to it
$fake->accounts[$jana] = [];
$lite->prepare("INSERT INTO company_mailboxes VALUES ('cmb-x', 'info@laminam.sk', ?)")->execute([json_encode(['provider' => 'microsoft365'])]);
$shared = ccrm_graph_mailbox($lite, 'company', 'cmb-x', ['provider' => 'microsoft365', 'graphAccount' => $jana, 'graphRefreshToken' => 'RT-' . $jana], 'info@laminam.sk');
$denied = ccrm_graph_test($shared);
$check('a shared mailbox the signed-in account cannot open is reported as refused, not as "sign in again"', $denied['success'] === false && empty($denied['reconnect']) && strpos($denied['error'], 'refused access') !== false);
$check('...and its tokens were stored on the company mailbox, encrypted',
    strpos((string)json_decode($lite->query("SELECT settings_json FROM company_mailboxes WHERE id = 'cmb-x'")->fetchColumn(), true)['graphAccessToken'], 'enc:v1:') === 0);

// revoked consent / expired sign-in
$fake->tokenError = 'invalid_grant';
$expired = ccrm_graph_mailbox($lite, 'user', 'u-1', array_merge($load(), ['graphAccessToken' => '']));
$result = ccrm_graph_test($expired);
$check('a revoked or expired sign-in is reported as "sign in again", with a message for the owner',
    $result['success'] === false && !empty($result['reconnect']) && strpos($result['error'], 'Sign in with Microsoft again') !== false);
$after = $load();
$check('...the dead refresh token is dropped, so the mailbox shows as needing a new sign-in', ($after['graphRefreshToken'] ?? '') === '' && !ccrm_graph_is_connected($after) && $after['graphAccount'] === $jana);
$calls = $fake->tokenCalls;
ccrm_graph_test(ccrm_graph_mailbox($lite, 'user', 'u-1', $load()));
$check('...and Microsoft is not asked again until the owner signs in', $fake->tokenCalls === $calls);
$fake->tokenError = 'invalid_client';
$keep = ccrm_graph_mailbox($lite, 'company', 'cmb-x', ['provider' => 'microsoft365', 'graphAccount' => $jana, 'graphRefreshToken' => 'RT-' . $jana], 'info@laminam.sk');
$result = ccrm_graph_test($keep);
$check('an expired client secret is the administrator\'s problem and does not throw the sign-ins away', $result['success'] === false && empty($result['reconnect']) && $keep->settings['graphRefreshToken'] === 'RT-' . $jana);
$fake->tokenError = null;

$dsn = getenv('CCRM_TEST_DSN');
if (!$dsn) {
    echo "skip the filing job (set CCRM_TEST_DSN to a SCRATCH MySQL database to run it)\n";
    echo $fails === 0 ? "\nall passed\n" : "\n$fails FAILED\n";
    exit($fails === 0 ? 0 : 1);
}

// ── the filing job, in a scratch MySQL database ───────────────────────────────
require_once $api . '/schema.php';
$pdo = new PDO($dsn, getenv('CCRM_TEST_USER') ?: 'root', getenv('CCRM_TEST_PASS') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$GLOBALS['pdo'] = $pdo;
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
$check('the schema has the delta link column', ccrm_column_exists($pdo, 'mail_sync_state', 'delta_link'));
$pdo->exec("ALTER TABLE `mail_sync_state` DROP COLUMN `delta_link`");
$pdo->exec("DELETE FROM `leads`");
$pdo->exec("DELETE FROM `users`");
$pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('MS_GRAPH_APP', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
    ->execute([json_encode(['clientId' => '1b2c3d4e-0000-1111-2222-333344445555', 'tenantId' => '', 'clientSecret' => ccrm_encrypt_secret('app-secret')])]);

$lead = $pdo->prepare("INSERT INTO `leads` (`id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value`, `rating`, `phone`, `email`, `created_at`, `archived`, `ticket_allowed_emails`) VALUES (?, ?, '', ?, 'new', 'web', 'x', 0, 3, '', ?, ?, ?, ?)");
$lead->execute(['lead-novak', 'Novák', 'person', 'novak@cust.sk', '2026-02-01', 0, null]);
$lead->execute(['client-firma', 'Firma', 'business', 'office@firma.sk', '2026-01-01', 0, json_encode(['jana@firma.sk'])]);

$fake->boxes = []; $fake->seq = 0; $fake->pageSize = 2;
$info = 'info@laminam.sk';
$peter = 'peter@laminam.sk';
$fake->accounts[$peter] = [$info]; // Peter has full access to the shared mailbox
$graphProfile = fn(string $account, bool $signedIn = true) => ccrm_encrypt_config_secrets(
    ['provider' => 'microsoft365', 'graphAccount' => $account, 'graphRefreshToken' => $signedIn ? 'RT-' . $account : '', 'isValidated' => true], ccrm_email_secret_keys());
$box = $pdo->prepare("INSERT INTO `company_mailboxes` (`id`, `name`, `address`, `settings_json`, `is_active`, `backfill_since`) VALUES (?, ?, ?, ?, 1, ?)");
$box->execute(['cmb-info', 'Info', $info, json_encode($graphProfile($peter)), date('Y-m-d', $now - 30 * 86400)]);
$user = $pdo->prepare("INSERT INTO `users` (`id`, `email`, `password_hash`, `name`, `role`, `color`, `metadata_json`) VALUES (?, ?, 'x', ?, 'Admin', '#000', ?)");
$user->execute(['u-peter', 'peter@crm.test', 'Peter', json_encode(['emailSettings' => $graphProfile($peter)])]);
$user->execute(['u-lost', 'lost@crm.test', 'Lost', json_encode(['emailSettings' => $graphProfile('lost@laminam.sk', false)])]);
$user->execute(['u-none', 'none@crm.test', 'None', null]);

$sources = array_column(ccrm_mail_filing_sources($pdo), null, 'key');
$check('Microsoft 365 mailboxes are sources of the job, on the Graph backend, including one that has to sign in again',
    ($sources['c:cmb-info']['backend'] ?? '') === 'graph' && ($sources['u:u-peter']['backend'] ?? '') === 'graph' && ($sources['u:u-lost']['backend'] ?? '') === 'graph' && !isset($sources['u:u-none']));

// what is already in the shared mailbox when it is connected: the backlog
$day = 86400;
$old1 = $addMessage($info, 'inbox', ['from' => 'novak@cust.sk', 'to' => [$info], 'subject' => 'Backlog 1', 'body' => 'oldest customer mail', 'received' => $now - 10 * $day, 'messageId' => '<old1@x>']);
$old2 = $addMessage($info, 'inbox', ['from' => 'jana@firma.sk', 'to' => [$info], 'subject' => 'Backlog 2', 'received' => $now - 8 * $day, 'messageId' => '<old2@x>']);
$old3 = $addMessage($info, 'inbox', ['from' => 'nobody@random.sk', 'to' => [$info], 'subject' => 'Not a customer', 'received' => $now - 7 * $day]);
$old4 = $addMessage($info, 'inbox', ['from' => 'novak@cust.sk', 'to' => [$info], 'subject' => 'Backlog 4', 'received' => $now - 2 * $day, 'messageId' => '<old4@x>']);
$ancient = $addMessage($info, 'inbox', ['from' => 'novak@cust.sk', 'to' => [$info], 'subject' => 'Ancient', 'received' => $now - 400 * $day, 'messageId' => '<anc@x>']);
$sentOld = $addMessage($info, 'sentitems', ['from' => $info, 'to' => ['novak@cust.sk'], 'subject' => 'Our answer', 'body' => 'we replied', 'received' => $now - 9 * $day, 'messageId' => '<sent1@x>']);

$eid = fn(string $id, string $address = 'info@laminam.sk') => ccrm_graph_event_id($address, $id);
$count = fn($where = '1=1', $params = []) => (function () use ($pdo, $where, $params) {
    $s = $pdo->prepare("SELECT COUNT(*) FROM `timeline_events` WHERE `type` = 'email' AND $where");
    $s->execute($params);
    return (int)$s->fetchColumn();
})();
$te = fn(string $id) => (function () use ($pdo, $id) {
    $s = $pdo->prepare("SELECT * FROM `timeline_events` WHERE `id` = ?");
    $s->execute([$id]);
    return $s->fetch();
})();

$r = ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-info', 'max_messages' => 2]);
$check('the first run is bounded by its message budget', $r['ran'] === true && ($r['seen'] ?? 0) <= 2 && ($r['errors'] ?? 0) === 0, json_encode($r));
$check('the missing delta link column was added by the job itself', ccrm_column_exists($pdo, 'mail_sync_state', 'delta_link'));
$check('the backlog is caught up newest first', $count("`id` = ?", [$eid($old4)]) === 1 && $count("`id` = ?", [$eid($old1)]) === 0);
for ($i = 0; $i < 8; $i++) ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-info', 'max_messages' => 2]);
$check('further runs finish the backlog', $count("`id` = ?", [$eid($old1)]) === 1 && $count("`id` = ?", [$eid($old2)]) === 1);
$check('mail from nobody we know is not filed', $count("`id` = ?", [$eid($old3)]) === 0);
$check('mail before the mailbox\'s cut-off date is not filed', $count("`id` = ?", [$eid($ancient)]) === 0);
$st = $pdo->query("SELECT * FROM `mail_sync_state` WHERE `mailbox_key` = 'c:cmb-info' AND `folder` = 'INBOX'")->fetch();
$check('the folder state is marked as Graph state, the backlog done and the delta link kept',
    (int)$st['uid_validity'] === CCRM_GRAPH_STATE_MARK && (int)$st['backfill_done'] === 1 && strpos((string)$st['delta_link'], '$deltatoken=') !== false && $st['last_error'] === null, json_encode($st));
$row = $te($eid($old1));
$check('a filed message carries the mailbox label, no personal owner, the header lines and its date',
    $row['lead_id'] === 'lead-novak' && $row['mail_account'] === 'Info' && $row['mail_owner'] === null && (int)$row['mail_has_body'] === 1 && (int)$row['is_outgoing'] === 0
    && strpos($row['content'], 'Subject: Backlog 1') !== false && $row['mail_message_id'] === '<old1@x>' && strpos($row['timestamp'], date('Y-m-d', $now - 10 * $day)) === 0, json_encode($row));
$body = $pdo->prepare("SELECT `body` FROM `filed_mail_bodies` WHERE `event_id` = ?");
$body->execute([$eid($old1)]);
$check('a readable body is stored for it', trim((string)$body->fetchColumn()) === 'oldest customer mail');
$check('a contact address files the message on the client record that lists it', ($te($eid($old2))['lead_id'] ?? '') === 'client-firma');
$sentRow = $te($eid($sentOld));
$check('mail we sent is filed as outgoing, from Sent Items', $sentRow && (int)$sentRow['is_outgoing'] === 1 && $sentRow['lead_id'] === 'lead-novak', json_encode($sentRow));

// new mail after the first run
$new1 = $addMessage($info, 'inbox', ['from' => 'novak@cust.sk', 'to' => [$info], 'subject' => 'New mail', 'body' => 'arrived later', 'received' => time(), 'messageId' => '<new1@x>']);
$r = ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-info']);
$check('new mail is filed on the next run, through the delta query', $count("`id` = ?", [$eid($new1)]) === 1 && (int)$r['filed'] === 1, json_encode($r));
$r = ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-info']);
$check('a run with nothing new looks at nothing', (int)$r['seen'] === 0, json_encode($r));

// new mail is not held up by a backlog
$pdo->exec("INSERT INTO `company_mailboxes` (`id`, `name`, `address`, `settings_json`, `is_active`) VALUES ('cmb-big', 'Big', 'big@laminam.sk', " . $pdo->quote(json_encode($graphProfile('big@laminam.sk'))) . ", 1)");
$big = 'big@laminam.sk';
for ($i = 0; $i < 9; $i++) $addMessage($big, 'inbox', ['from' => 'novak@cust.sk', 'to' => [$big], 'subject' => 'Old ' . $i, 'received' => $now - (20 + $i) * $day, 'messageId' => '<big' . $i . '@x>']);
ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-big', 'max_messages' => 2]);
$bigNew = $addMessage($big, 'inbox', ['from' => 'novak@cust.sk', 'to' => [$big], 'subject' => 'Urgent', 'received' => time(), 'messageId' => '<bignew@x>']);
ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-big', 'max_messages' => 2]);
$bigState = $pdo->query("SELECT `backfill_done` FROM `mail_sync_state` WHERE `mailbox_key` = 'c:cmb-big' AND `folder` = 'INBOX'")->fetchColumn();
$check('new mail is filed before the rest of a long backlog', $count("`id` = ?", [$eid($bigNew, $big)]) === 1 && (int)$bigState === 0);

// one message in two mailboxes is filed once
$both = $addMessage($info, 'inbox', ['from' => 'novak@cust.sk', 'to' => [$info, $peter], 'subject' => 'Both', 'received' => time(), 'messageId' => '<both@x>']);
ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-info']);
$addMessage($peter, 'inbox', ['from' => 'novak@cust.sk', 'to' => [$info, $peter], 'subject' => 'Both', 'received' => time(), 'messageId' => '<both@x>']);
for ($i = 0; $i < 3; $i++) ccrm_run_mail_filing($pdo, ['only' => 'u:u-peter']);
$check('one message in two mailboxes is on the timeline once', $count("`mail_message_id` = ?", ['<both@x>']) === 1);
$own = $addMessage($peter, 'inbox', ['from' => 'jana@firma.sk', 'to' => [$peter], 'subject' => 'For Peter', 'received' => time(), 'messageId' => '<peter1@x>']);
ccrm_run_mail_filing($pdo, ['only' => 'u:u-peter']);
$mine = $te($eid($own, $peter));
$check('a personal mailbox files under its owner\'s login', $mine && $mine['mail_owner'] === 'peter@crm.test' && $mine['mail_account'] === $peter, json_encode($mine));

// a removed entry stays removed
$pdo->prepare("UPDATE `timeline_events` SET `hidden` = 1 WHERE `id` = ?")->execute([$eid($old1)]);
$pdo->exec("DELETE FROM `mail_sync_state` WHERE `mailbox_key` = 'c:cmb-info'");
for ($i = 0; $i < 12; $i++) ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-info', 'max_messages' => 5]);
$hidden = $pdo->prepare("SELECT `hidden` FROM `timeline_events` WHERE `id` = ?");
$hidden->execute([$eid($old1)]);
$check('a removed entry stays removed when the mailbox is read again, and nothing is filed twice', (int)$hidden->fetchColumn() === 1 && $count("`id` = ?", [$eid($old1)]) === 1 && $count("`mail_message_id` = ?", ['<old4@x>']) === 1);

// attachments
$pdfBytes = "%PDF-1.4\n" . str_repeat("1 0 obj << /Type /Catalog >> endobj\n", 3) . "%%EOF\n";
$att = $addMessage($info, 'inbox', ['from' => 'novak@cust.sk', 'to' => [$info], 'subject' => 'With files', 'body' => 'see attached', 'received' => time(), 'messageId' => '<att@x>', 'attachments' => [
    ['id' => 'A1', 'name' => 'ponuka.pdf', 'bytes' => $pdfBytes], ['id' => 'A2', 'name' => 'shell.php', 'bytes' => '<?php echo 1;'],
    ['id' => 'A3', 'name' => 'broken.pdf', 'bytes' => 'not a pdf'], ['id' => 'A4', 'name' => 'logo.png', 'bytes' => 'x', 'inline' => true],
]]);
ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-info']);
$attRow = $pdo->prepare("SELECT `attachments_json` FROM `filed_mail_bodies` WHERE `event_id` = ?");
$attRow->execute([$eid($att)]);
$byName = array_column(json_decode((string)$attRow->fetchColumn(), true) ?: [], null, 'name');
$keptPath = ccrm_mail_attachment_path($byName['ponuka.pdf']['key'] ?? null);
$check('a normal attachment is kept on disk, byte for byte', $keptPath !== null && file_get_contents($keptPath) === $pdfBytes, json_encode($byName));
$check('an executable type, damaged bytes and a picture inside the body are listed but never kept',
    isset($byName['shell.php'], $byName['broken.pdf'], $byName['logo.png']) && !isset($byName['shell.php']['key']) && !isset($byName['broken.pdf']['key']) && !isset($byName['logo.png']['key']));
$firstKey = $byName['ponuka.pdf']['key'] ?? '';
$pdo->exec("DELETE FROM `mail_sync_state` WHERE `mailbox_key` = 'c:cmb-info'");
for ($i = 0; $i < 12; $i++) ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-info', 'max_messages' => 5]);
$attRow->execute([$eid($att)]);
$again = array_column(json_decode((string)$attRow->fetchColumn(), true) ?: [], null, 'name');
$check('reading the message again keeps the same file instead of storing a second copy', ($again['ponuka.pdf']['key'] ?? '') === $firstKey && $firstKey !== '');
ccrm_mail_purge_filed($pdo, $eid($att));

// the live read agrees with the job
$GLOBALS['userEmail'] = 'peter@crm.test';
$rowsBefore = $count();
$mbPeter = ccrm_graph_mailbox($pdo, 'user', 'u-peter', ccrm_decrypt_email_settings(json_decode($pdo->query("SELECT `metadata_json` FROM `users` WHERE `id` = 'u-peter'")->fetchColumn(), true)['emailSettings']));
$list = ccrm_graph_emails($mbPeter, 'INBOX', 1, 25, 'all', null, 'peter@crm.test');
$live = array_column($list['emails'], null, 'uid');
$check('the live read of a mailbox the job has read files nothing twice and hands the client the same timeline id',
    $count() === $rowsBefore && isset($live[$own]) && $live[$own]['event_id'] === $eid($own, $peter), $count() . ' vs ' . $rowsBefore);
$check('...keeps the body the job stored', (int)($te($eid($own, $peter))['mail_has_body'] ?? 0) === 1);
$check('...marks a message that is already on the timeline from another mailbox', count(array_filter($list['emails'], fn($e) => $e['subject'] === 'Both' && !empty($e['timeline_hidden']))) === 1);
$check('...and answers in the shape the mail screen expects',
    $list['pagination']['total'] === count($list['emails']) && $list['pagination']['unseen'] >= 1 && $live[$own]['from']['address'] === 'jana@firma.sk' && $live[$own]['is_outgoing'] === false && $live[$own]['message_id'] === '<peter1@x>');
$search = ccrm_graph_emails($mbPeter, 'INBOX', 1, 25, 'all', 'jana@firma.sk', 'peter@crm.test');
$check('a search by address lists only that correspondent\'s mail', count($search['emails']) === 1 && $search['emails'][0]['uid'] === $own);

// a sign-in that ran out breaks only its own mailbox
$r = ccrm_run_mail_filing($pdo, ['max_messages' => 50]);
$lostState = $pdo->query("SELECT `last_error` FROM `mail_sync_state` WHERE `mailbox_key` = 'u:u-lost' AND `folder` = 'INBOX'")->fetchColumn();
$check('a mailbox that has to sign in again is recorded with the reason, once', is_string($lostState) && strpos($lostState, 'Sign in with Microsoft again') !== false && count($r['mailboxes']['u:u-lost']['errors'] ?? []) === 1, json_encode($r['mailboxes']['u:u-lost'] ?? null));
$ok = $pdo->query("SELECT `last_success_at`, `last_error` FROM `company_mailboxes` WHERE `id` = 'cmb-info'")->fetch();
$check('...and the healthy mailboxes were still read', $ok['last_success_at'] !== null && $ok['last_error'] === null && isset($r['mailboxes']['c:cmb-info']));
$fake->tokenError = 'invalid_grant';
$pdo->exec("UPDATE `company_mailboxes` SET `settings_json` = " . $pdo->quote(json_encode($graphProfile($peter))) . " WHERE `id` = 'cmb-info'");
$r = ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-info']);
$err = $pdo->query("SELECT `last_error` FROM `company_mailboxes` WHERE `id` = 'cmb-info'")->fetchColumn();
$storedBox = ccrm_company_mailbox_settings($pdo->query("SELECT * FROM `company_mailboxes` WHERE `id` = 'cmb-info'")->fetch());
$check('revoked consent on a company mailbox shows on the mailbox and clears its sign-in', is_string($err) && strpos($err, 'Sign in with Microsoft again') !== false && ($storedBox['graphRefreshToken'] ?? '') === '', (string)$err);
$fake->tokenError = null;

// Graph forgets a delta link
$pdo->exec("UPDATE `company_mailboxes` SET `settings_json` = " . $pdo->quote(json_encode($graphProfile($peter))) . " WHERE `id` = 'cmb-info'");
ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-info']);
$pdo->exec("UPDATE `mail_sync_state` SET `delta_link` = '" . CCRM_GRAPH_BASE . "/users/info%40laminam.sk/mailFolders/inbox/messages/delta?\$deltatoken=GONE' WHERE `mailbox_key` = 'c:cmb-info' AND `folder` = 'INBOX'");
$late = $addMessage($info, 'inbox', ['from' => 'novak@cust.sk', 'to' => [$info], 'subject' => 'After the reset', 'received' => time(), 'messageId' => '<late@x>']);
$r1 = ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-info']);
$r2 = ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-info']);
$check('a delta link Microsoft no longer knows is started over without an error, and nothing is lost', ($r1['errors'] ?? 1) === 0 && $count("`id` = ?", [$eid($late)]) === 1, json_encode([$r1, $r2]));

// switching a mailbox between IMAP and Microsoft 365 starts its state over
$pdo->exec("UPDATE `mail_sync_state` SET `uid_validity` = 1700000000, `last_uid` = 5123, `backfill_upper_uid` = 1, `backfill_done` = 1, `delta_link` = NULL WHERE `mailbox_key` = 'c:cmb-info' AND `folder` = 'INBOX'");
ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-info', 'max_messages' => 1]);
$st = $pdo->query("SELECT * FROM `mail_sync_state` WHERE `mailbox_key` = 'c:cmb-info' AND `folder` = 'INBOX'")->fetch();
$check('state left by IMAP is not read as Graph state', (int)$st['uid_validity'] === CCRM_GRAPH_STATE_MARK && (int)$st['last_uid'] > 1700000000 && (int)$st['backfill_done'] === 0, json_encode($st));

echo $fails === 0 ? "\nall passed\n" : "\n$fails FAILED\n";
exit($fails === 0 ? 0 : 1);
