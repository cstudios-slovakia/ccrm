<?php
/**
 * Offline checks for the Newsletter backend core (api/newsletter_audience.php, api/newsletter_lib.php).
 * No database, no web server. Run:  php scripts/test-newsletter.php   (npm run test:newsletter)
 *
 * Package 2A adds the last part: merge-tag parity (44 shared fixtures), MIME builder, SMTP client against a scripted
 * server, send validation and the pure parts of the public pages.
 */
chdir(dirname(__DIR__));
require_once __DIR__ . '/../public/api/newsletter_audience.php';
require_once __DIR__ . '/../public/api/newsletter_lib.php';

$fails = 0;
$check = function (string $name, bool $ok) use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . "\n";
    if (!$ok) { $fails++; }
};
$same = function (string $name, $actual, $expected) use ($check) {
    $check($name, $actual === $expected);
    if ($actual !== $expected) {
        echo "       expected " . json_encode($expected, JSON_UNESCAPED_UNICODE) . "\n       actual   " . json_encode($actual, JSON_UNESCAPED_UNICODE) . "\n";
    }
};

// ---- extra addresses --------------------------------------------------------------------
$emails = fn(array $parsed) => array_map(fn($p) => $p['email'], $parsed);

$same('plain address', $emails(ccrm_newsletter_parse_extra('a@b.sk')), ['a@b.sk']);
$same('commas, semicolons and new lines separate',
    $emails(ccrm_newsletter_parse_extra("a@b.sk, c@d.sk;e@f.sk\nG@H.SK\r\n\r\n i@j.sk ")),
    ['a@b.sk', 'c@d.sk', 'e@f.sk', 'g@h.sk', 'i@j.sk']);
$p = ccrm_newsletter_parse_extra('Peter Novák <Peter@Example.com>');
$same('Name <address> gives name and lower-cased address', [$p[0]['name'], $p[0]['email']], ['Peter Novák', 'peter@example.com']);
$p = ccrm_newsletter_parse_extra('"Novák, Peter" <p@x.sk>, b@x.sk');
$same('a comma inside quotes does not split', [count($p), $p[0]['name'], $p[0]['email'], $p[1]['email']], [2, 'Novák, Peter', 'p@x.sk', 'b@x.sk']);
$same('empty input', ccrm_newsletter_parse_extra(" \n ;, "), []);
$same('mailto: and wrapping brackets are removed', $emails(ccrm_newsletter_parse_extra('mailto:A@B.SK, <c@d.sk>')), ['a@b.sk', 'c@d.sk']);
$same('invalid text is kept for the skip count', $emails(ccrm_newsletter_parse_extra('not-an-address, ok@x.sk')), ['not-an-address', 'ok@x.sk']);

// ---- first name ------------------------------------------------------------------------
$same('title stripped: Ing. Peter Novák', ccrm_newsletter_first_name('Ing. Peter Novák'), 'Peter');
$same('several titles', ccrm_newsletter_first_name('Prof. MUDr. Anna Kováčová, PhD.'), 'Anna');
$same('title without a space', ccrm_newsletter_first_name('Mgr.Jozef Mak'), 'Jozef');
$same('compound title Ing.arch.', ccrm_newsletter_first_name('Ing.arch. Zoltán Nagy'), 'Zoltán');
$same('title without a dot', ccrm_newsletter_first_name('Dr Eva Szabó'), 'Eva');
$same('lower-case dr.', ccrm_newsletter_first_name('dr. Péter Kiss'), 'Péter');
$same('JUDr. PhDr. RNDr. Bc.', [
    ccrm_newsletter_first_name('JUDr. Marta Horváthová'),
    ccrm_newsletter_first_name('PhDr. Ivan Tóth'),
    ccrm_newsletter_first_name('RNDr. Lucia Varga'),
    ccrm_newsletter_first_name('Bc. Tomáš Farkas'),
], ['Marta', 'Ivan', 'Lucia', 'Tomáš']);
$same('a first name that looks like a title word is kept', ccrm_newsletter_first_name('Art Novák'), 'Art');
$same('plain name', ccrm_newsletter_first_name('Peter Novák'), 'Peter');
$same('one word', ccrm_newsletter_first_name('Peter'), 'Peter');
$same('empty', ccrm_newsletter_first_name('   '), '');
$same('only titles', ccrm_newsletter_first_name('Ing. PhD.'), '');
$same('an e-mail address is not a name', ccrm_newsletter_first_name('peter@example.com'), '');

// ---- dedupe, precedence, skips ---------------------------------------------------------
$cand = fn($source, $email, $name = '', $first = '', $company = '', $extra = []) => $extra + [
    'source' => $source, 'email' => $email, 'name' => $name, 'lead_id' => null, 'employee_id' => null,
    'merge' => ['name' => $name, 'first_name' => $first, 'company' => $company],
];
$byEmail = function (array $built) {
    $m = [];
    foreach ($built['rows'] as $r) { $m[$r['email']] = $r; }
    return $m;
};

// listed in the "wrong" order on purpose: precedence is client > lead > employee > extra
$built = ccrm_newsletter_build_rows([
    $cand('extra', 'same@x.sk', 'Extra Name'),
    $cand('employee', 'SAME@x.sk', 'Employee Name', 'Employee', '', ['employee_id' => 'emp-1']),
    $cand('lead', ' same@x.sk ', 'Lead Name', 'Lead', 'Lead Co', ['lead_id' => 'lead-1']),
    $cand('client', 'same@x.sk', 'Client Name', 'Client', 'Client Co', ['lead_id' => 'client-1']),
    $cand('extra', 'only-extra@x.sk', 'Only Extra'),
], []);
$rows = $byEmail($built);
$same('one row per address', count($built['rows']), 2);
$same('the client wins the duplicate', [$rows['same@x.sk']['source'], $rows['same@x.sk']['name'], $rows['same@x.sk']['leadId']], ['client', 'Client Name', 'client-1']);
$same('and keeps the client merge values', $rows['same@x.sk']['merge'], ['name' => 'Client Name', 'first_name' => 'Client', 'company' => 'Client Co', 'email' => 'same@x.sk']);
$same('counted once, under the winning source', $built['bySource'], ['client' => 1, 'lead' => 0, 'employee' => 0, 'extra' => 1]);
$same('total counts queued addresses', $built['total'], 2);

$built = ccrm_newsletter_build_rows([
    $cand('employee', 'e@x.sk'), $cand('lead', 'e@x.sk'),
], []);
$same('lead beats employee', $built['rows'][0]['source'], 'lead');
$built = ccrm_newsletter_build_rows([$cand('extra', 'e@x.sk'), $cand('employee', 'e@x.sk')], []);
$same('employee beats extra', $built['rows'][0]['source'], 'employee');
$built = ccrm_newsletter_build_rows([$cand('client', 'first@x.sk', 'A'), $cand('client', 'FIRST@x.sk', 'B')], []);
$same('inside one source the first one wins', [count($built['rows']), $built['rows'][0]['name']], [1, 'A']);

// suppressions, invalid addresses, rows without an address
$built = ccrm_newsletter_build_rows([
    $cand('client', 'ok@x.sk'),
    $cand('client', 'Gone@x.sk'),
    $cand('extra', 'gone@x.sk'),
    $cand('extra', 'not-an-address'),
    $cand('lead', ''),
    $cand('lead', '   '),
    $cand('employee', 'no spaces@x.sk'),
], ['gone@x.sk' => true]);
$rows = $byEmail($built);
$same('a suppressed address is skipped as unsubscribed', [$rows['gone@x.sk']['status'], $rows['gone@x.sk']['skipReason']], ['skipped', 'unsubscribed']);
$same('an invalid address is skipped as invalid', [$rows['not-an-address']['status'], $rows['not-an-address']['skipReason']], ['skipped', 'invalid']);
$same('an address with a space is invalid', $rows['no spaces@x.sk']['skipReason'], 'invalid');
$same('a good address is queued', [$rows['ok@x.sk']['status'], $rows['ok@x.sk']['skipReason']], ['queued', null]);
$same('skips are counted by reason', $built['skipped'], ['unsubscribed' => 1, 'invalid' => 2]);
$same('rows without an address are only counted', $built['withoutEmail'], 2);
$same('total is only the queued rows', $built['total'], 1);
$same('a skipped row is never counted under a source', array_sum($built['bySource']), 1);
$same('the same suppressed address is one skip, not two', count(array_filter($built['rows'], fn($r) => $r['email'] === 'gone@x.sk')), 1);

$preview = ccrm_newsletter_audience_preview(ccrm_newsletter_build_rows(
    array_map(fn($i) => $cand('extra', "p$i@x.sk", "P $i"), range(1, 30)), []
));
$same('preview sample is the first 20 queued rows', [$preview['total'], count($preview['sample']), $preview['sample'][0]['email']], [30, 20, 'p1@x.sk']);
$check('preview has every field of AudiencePreview',
    array_keys($preview) === ['valid', 'total', 'bySource', 'skipped', 'withoutEmail', 'sample']);

// ---- client profiles, categories -------------------------------------------------------
$lead = fn($id, $name, $clientId = null, $adj = 0, $extra = []) => $extra + [
    'id' => $id, 'name' => $name, 'client_id' => $clientId, 'adjustment' => $adj, 'archived' => 0,
];
$g = ccrm_newsletter_group_client_profiles([
    $lead('client-1', 'Acme'),
    $lead('client-2', 'Beta'),
    $lead('l-linked', 'Whatever', 'client-2'),            // explicit client_id wins over the name
    $lead('l-byname', '  ACME '),                         // no client_id: name fallback
    $lead('l-dangling', 'Beta', 'client-gone'),           // points at a deleted row: name fallback
    $lead('l-free', 'Nobody'),                            // belongs to no client
    $lead('lead-adj', 'Gamma', null, 50.0),               // a client through its adjustment
    $lead('l-gamma', 'Gamma'),
    $lead('unassigned-docs', 'Acme'),                     // the system row is ignored
]);
$members = fn($id) => array_map(fn($r) => $r['id'], $g['profiles'][$id]['members']);
$same('explicit client_id', in_array('l-linked', $members('client-2'), true), true);
$same('name fallback is case and space insensitive', $members('client-1'), ['l-byname']);
$same('a dangling client_id falls back to the name', in_array('l-dangling', $members('client-2'), true), true);
$same('a free lead is in no profile', isset($g['memberOf']['l-free']), false);
$same('adjustment > 0 makes a client', [isset($g['profiles']['lead-adj']), $members('lead-adj')], [true, ['l-gamma']]);
$same('the system row is ignored', isset($g['memberOf']['unassigned-docs']), false);
$same('a client belongs to itself', $g['memberOf']['client-1'], 'client-1');

$cats = [
    ['id' => 'c-root', 'parent_id' => null], ['id' => 'c-a', 'parent_id' => 'c-root'],
    ['id' => 'c-a1', 'parent_id' => 'c-a'], ['id' => 'c-b', 'parent_id' => 'c-root'],
    ['id' => 'c-loop1', 'parent_id' => 'c-loop2'], ['id' => 'c-loop2', 'parent_id' => 'c-loop1'],
];
$same('a category brings its descendants', array_keys(ccrm_newsletter_expand_categories(['c-a'], $cats)), ['c-a', 'c-a1']);
$same('a root brings the whole tree', array_keys(ccrm_newsletter_expand_categories(['c-root'], $cats)), ['c-root', 'c-a', 'c-b', 'c-a1']);
$check('a parent loop terminates', count(ccrm_newsletter_expand_categories(['c-loop1'], $cats)) === 2);

$profiles = ccrm_newsletter_group_client_profiles([
    $lead('client-1', 'Acme', null, 0, ['client_category_id' => 'c-a1']),
    $lead('client-2', 'Beta', null, 0, ['client_category_id' => 'c-b']),
    $lead('client-3', 'Old', null, 0, ['client_category_id' => 'c-a1', 'archived' => 1]),
    $lead('client-4', 'Delta'),
    $lead('l-1', 'Delta contact', 'client-4', 0, ['client_category_id' => 'c-a']),
]);
$ids = fn($sel) => array_keys($sel);
$same('mode all: every client that is not archived',
    $ids(ccrm_newsletter_select_profiles($profiles, ['mode' => 'all', 'categoryIds' => [], 'clientIds' => []], [])),
    ['client-1', 'client-2', 'client-4']);
$same('mode pick, category: its descendants count, archived clients do not',
    $ids(ccrm_newsletter_select_profiles($profiles, ['mode' => 'pick', 'categoryIds' => ['c-a'], 'clientIds' => []], ccrm_newsletter_expand_categories(['c-a'], $cats))),
    ['client-1', 'client-4']);
$same('mode pick, client: chosen by id, also through a lead of it',
    $ids(ccrm_newsletter_select_profiles($profiles, ['mode' => 'pick', 'categoryIds' => [], 'clientIds' => ['client-2', 'l-1']], [])),
    ['client-2', 'client-4']);

// profile addresses: the client first, archived rows out, one "withoutEmail" when nothing is left
$profile = ccrm_newsletter_group_client_profiles([
    $lead('client-1', 'Acme', null, 0, ['email' => 'info@acme.sk', 'contact_person' => 'Ing. Peter Novák']),
    $lead('l-1', 'Acme', 'client-1', 0, ['email' => 'INFO@acme.sk']),
    $lead('l-2', 'Acme', 'client-1', 0, ['email' => 'sales@acme.sk', 'contact_person' => 'Mgr. Eva Kováčová']),
    $lead('l-3', 'Acme', 'client-1', 0, ['email' => 'old@acme.sk', 'archived' => 1]),
])['profiles']['client-1'];
$built = ccrm_newsletter_build_rows(ccrm_newsletter_profile_candidates($profile), []);
$rows = $byEmail($built);
$same('a profile gives every distinct e-mail of its rows', array_keys($rows), ['info@acme.sk', 'sales@acme.sk']);
$same('names, first names and company', [
    $rows['info@acme.sk']['name'], $rows['info@acme.sk']['merge']['first_name'], $rows['info@acme.sk']['merge']['company'],
    $rows['sales@acme.sk']['name'], $rows['sales@acme.sk']['merge']['first_name'],
], ['Ing. Peter Novák', 'Peter', 'Acme', 'Mgr. Eva Kováčová', 'Eva']);
$none = ccrm_newsletter_group_client_profiles([$lead('client-9', 'Silent'), $lead('l-9', 'Silent', 'client-9', 0, ['archived' => 1, 'email' => 'x@y.sk'])])['profiles']['client-9'];
$built = ccrm_newsletter_build_rows(ccrm_newsletter_profile_candidates($none), []);
$same('a client with no usable address is counted, not sent', [$built['total'], $built['withoutEmail']], [0, 1]);
$c = ccrm_newsletter_lead_candidate(['id' => 'x', 'name' => 'Ing. Jana Malá', 'email' => 'j@x.sk', 'client_type' => 'person'], 'client', 'Ing. Jana Malá');
$same('a person client without a contact person gives its own first name', $c['merge']['first_name'], 'Jana');
$c = ccrm_newsletter_lead_candidate(['id' => 'x', 'name' => 'Acme s.r.o.', 'email' => 'j@x.sk', 'client_type' => 'business'], 'client', 'Acme s.r.o.');
$same('a company never does', $c['merge']['first_name'], '');

// ---- audience shape --------------------------------------------------------------------
$a = ccrm_newsletter_normalize_audience(null);
$same('default audience: all clients, nothing else', [$a['clients']['mode'], $a['leads']['enabled'], $a['employees']['enabled'], $a['extra']['enabled']], ['all', false, false, false]);
$same('default audience is valid', ccrm_newsletter_audience_valid($a), true);
$a = ccrm_newsletter_normalize_audience(['clients' => ['mode' => 'pick', 'categoryIds' => [], 'clientIds' => []]]);
$same('pick with nothing chosen is not valid', ccrm_newsletter_audience_valid($a), false);
$a = ccrm_newsletter_normalize_audience(['clients' => ['mode' => 'pick', 'categoryIds' => ['c-1', 'c-1', '', 5]]]);
$same('pick with a category is valid; ids are cleaned', [ccrm_newsletter_audience_valid($a), $a['clients']['categoryIds']], [true, ['c-1', '5']]);
$a = ccrm_newsletter_normalize_audience(['clients' => ['mode' => 'weird'], 'leads' => 'x', 'extra' => ['enabled' => 1, 'raw' => 42]]);
$same('garbage degrades to the defaults', [$a['clients']['mode'], $a['leads']['enabled'], $a['extra']['enabled'], $a['extra']['raw']], ['all', false, true, '']);

// ---- settings (C3) ---------------------------------------------------------------------
$def = ccrm_newsletter_default_config();
$same('missing config gives the defaults', ccrm_newsletter_normalize_config(null), $def);
$same('defaults: C3 numbers', [$def['sending']['batchSize'], $def['sending']['perHourLimit'], $def['sending']['testRecipients'], $def['theme']['contentWidth']], [40, 400, [], 600]);
$cfg = ccrm_newsletter_normalize_config([
    'theme' => ['contentWidth' => 99999, 'pageBackground' => '#ABC', 'textColor' => 'red', 'linkColor' => '#112233', 'fontFamily' => 'x;}</style>'],
    'sending' => ['batchSize' => 1, 'perHourLimit' => 'lots', 'testRecipients' => ['A@B.sk']],
    'sender' => ['fromName' => "Acme\nSales", 'replyTo' => 'Reply@Acme.sk'],
], true);
$same('numbers are clamped', [$cfg['theme']['contentWidth'], $cfg['sending']['batchSize'], $cfg['sending']['perHourLimit']], [800, 10, 400]);
$same('colours become #rrggbb, bad ones the default', [$cfg['theme']['pageBackground'], $cfg['theme']['textColor'], $cfg['theme']['linkColor']], ['#aabbcc', '#1e293b', '#112233']);
$same('a font stack with markup falls back', $cfg['theme']['fontFamily'], 'Arial, Helvetica, sans-serif');
$same('sender and test recipients are cleaned', [$cfg['sender'], $cfg['sending']['testRecipients']], [['fromName' => 'Acme Sales', 'replyTo' => 'reply@acme.sk'], ['a@b.sk']]);

$throws = function (callable $fn): ?string {
    try { $fn(); } catch (ccrm_newsletter_error $e) { return $e->errorCode; }
    return null;
};
$doc = ['version' => 1, 'rows' => []];
$same('a version 1 document is accepted', ccrm_newsletter_normalize_config(['header' => $doc, 'footer' => $doc], true)['header'], $doc);
$same('version 2 is refused on save', $throws(fn() => ccrm_newsletter_normalize_config(['footer' => ['version' => 2, 'rows' => []]], true)), 'invalid_doc');
$same('a document without rows is refused on save', $throws(fn() => ccrm_newsletter_normalize_config(['header' => ['version' => 1]], true)), 'invalid_doc');
$same('rows must be a list', $throws(fn() => ccrm_newsletter_check_doc(['version' => 1, 'rows' => ['a' => 1]], 'body')), 'invalid_doc');
$same('a stored bad document is dropped when loading', ccrm_newsletter_normalize_config(['header' => ['version' => 9]], false)['header'], null);
$same('a bad reply-to is refused on save', $throws(fn() => ccrm_newsletter_normalize_config(['sender' => ['replyTo' => 'nope']], true)), 'invalid_reply_to');
$same('a bad test recipient is refused on save', $throws(fn() => ccrm_newsletter_normalize_config(['sending' => ['testRecipients' => ['nope']]], true)), 'invalid_test_recipient');
$same('more than five test recipients are refused on save',
    $throws(fn() => ccrm_newsletter_normalize_config(['sending' => ['testRecipients' => ['a@x.sk', 'b@x.sk', 'c@x.sk', 'd@x.sk', 'e@x.sk', 'f@x.sk']]], true)),
    'too_many_test_recipients');

$same('sender: address from the profile, falls back to the SMTP user',
    ccrm_newsletter_sender_info(['smtpHost' => 'smtp.x.sk', 'smtpPort' => 465, 'smtpUser' => 'info@x.sk']),
    ['senderEmail' => 'info@x.sk', 'senderConfigured' => true]);
$same('sender: an explicit sender address wins',
    ccrm_newsletter_sender_info(['smtpHost' => 'h', 'smtpPort' => 25, 'smtpUser' => 'u@x.sk', 'senderEmail' => 'News@X.sk'])['senderEmail'], 'News@X.sk');
$same('sender: no SMTP host is not configured', ccrm_newsletter_sender_info(['smtpUser' => 'info@x.sk'])['senderConfigured'], false);

// ---- campaign patch (C4 update) --------------------------------------------------------
$cols = ccrm_newsletter_patch_columns([
    'name' => '  Spring   ', 'subject' => "Hello\nthere", 'preheader' => '', 'fromName' => 'Acme', 'replyTo' => 'R@X.sk',
    'audience' => ['clients' => ['mode' => 'all']], 'body' => $doc, 'useHeader' => false, 'useFooter' => 1, 'status' => 'sent', 'id' => 'hack',
]);
$same('patch: known keys only, cleaned', [
    $cols['name'], $cols['subject'], $cols['preheader'], $cols['from_name'], $cols['reply_to'], $cols['use_header'], $cols['use_footer'],
    isset($cols['status']), isset($cols['id']), json_decode($cols['body_json'], true),
], ['Spring', 'Hello there', null, 'Acme', 'r@x.sk', 0, 1, false, false, $doc]);
$same('patch: an empty name is refused', $throws(fn() => ccrm_newsletter_patch_columns(['name' => ' '])), 'invalid_name');
$same('patch: a bad reply-to is refused', $throws(fn() => ccrm_newsletter_patch_columns(['replyTo' => 'x'])), 'invalid_reply_to');
$same('patch: null body clears it', ccrm_newsletter_patch_columns(['body' => null]), ['body_json' => null]);

// ---- images ----------------------------------------------------------------------------
$t = mktime(12, 0, 0, 3, 5, 2027);
$rel = ccrm_newsletter_image_relative_path('image/png', $t);
$check('image path: newsletter/YYYY/MM/<32 hex>.png', (bool)preg_match('#^newsletter/2027/03/[0-9a-f]{32}\.png$#', (string)$rel));
$same('image: only the four real types', [
    ccrm_newsletter_image_relative_path('image/svg+xml'), ccrm_newsletter_image_relative_path('text/x-php'),
    ccrm_newsletter_image_relative_path('image/jpeg') !== null, ccrm_newsletter_image_relative_path('image/gif') !== null, ccrm_newsletter_image_relative_path('image/webp') !== null,
], [null, null, true, true, true]);
$check('image names are random', $rel !== ccrm_newsletter_image_relative_path('image/png', $t));
$same('image dir', ccrm_newsletter_image_dir('/var/www/uploads/', $t), '/var/www/uploads/newsletter/2027/03/');

$tmp = sys_get_temp_dir() . '/nl-test-' . bin2hex(random_bytes(4));
@mkdir($tmp . '/newsletter/2027/03', 0775, true);
foreach (['aaa.png' => 1000, 'bbb.jpg' => 2000, 'ccc.php' => 3000] as $f => $mt) {
    file_put_contents($tmp . '/newsletter/2027/03/' . $f, 'x');
    touch($tmp . '/newsletter/2027/03/' . $f, $mt);
}
$listed = ccrm_newsletter_list_images($tmp, 'https://crm.example.sk/', 200);
$same('images list: newest first, images only, absolute urls',
    array_map(fn($i) => $i['url'], $listed),
    ['https://crm.example.sk/uploads/newsletter/2027/03/bbb.jpg', 'https://crm.example.sk/uploads/newsletter/2027/03/aaa.png']);
$same('images list: limit', count(ccrm_newsletter_list_images($tmp, 'https://x/', 1)), 1);
array_map('unlink', glob($tmp . '/newsletter/2027/03/*'));
@rmdir($tmp . '/newsletter/2027/03'); @rmdir($tmp . '/newsletter/2027'); @rmdir($tmp . '/newsletter'); @rmdir($tmp);

// =========================================================================================
// Package 2A: merge tags, MIME builder, SMTP client, send validation, public pages (pure parts)
// =========================================================================================
require_once __DIR__ . '/../public/api/newsletter_merge.php';
require_once __DIR__ . '/../public/api/newsletter_mailer.php';
require_once __DIR__ . '/../public/api/newsletter_send.php';
require_once __DIR__ . '/../public/api/newsletter_public.php';

// ---- merge tags: every case of the shared fixture (the TypeScript test runs the same file) ----
$fixtures = json_decode((string)file_get_contents(__DIR__ . '/../src/components/newsletter/builder/mergeTags.fixtures.json'), true);
$check('merge fixtures: the file has 44 cases', is_array($fixtures) && count($fixtures) === 44);
foreach (is_array($fixtures) ? $fixtures : [] as $f) {
    $same('merge: ' . $f['name'], ccrm_newsletter_substitute($f['template'], $f['values'], $f['context'], $f['mode']), $f['expected']);
}
$same('merge: tag names in order of first use', ccrm_newsletter_tag_names('{{b}} {{a|x}} {{ b }} {{c}}'), ['b', 'a', 'c']);
$v = ccrm_newsletter_values_for(['name' => 'Jana', 'first_name' => 'Jana', 'company' => 'Acme', 'email' => 'old@x.sk'], 'jana@x.sk', str_repeat('a', 32), 'https://crm.x.sk/', 'Acme s.r.o.', 2027);
$same('merge values: eight tags with token URLs', [$v['unsubscribe_url'], $v['view_online_url'], $v['sender_company'], $v['current_year'], $v['email']], [
    'https://crm.x.sk/api/newsletter_public.php?a=unsubscribe&t=' . str_repeat('a', 32),
    'https://crm.x.sk/api/newsletter_public.php?a=view&t=' . str_repeat('a', 32), 'Acme s.r.o.', '2027', 'jana@x.sk']);

// ---- quoted-printable ----------------------------------------------------------------------
$long = str_repeat('Dlhý riadok s diakritikou čšž ', 30) . "\n.dot line\nspace at end \n=sign\n";
$qp = ccrm_newsletter_qp_encode($long);
$lines = explode("\r\n", $qp);
$check('qp: every line is at most 76 characters', max(array_map('strlen', $lines)) <= 76);
$check('qp: only CRLF line ends', strpos(str_replace("\r\n", '', $qp), "\n") === false && strpos(str_replace("\r\n", '', $qp), "\r") === false);
$same('qp: decodes back to the original', str_replace("\r\n", "\n", quoted_printable_decode($qp)), $long);
$same('qp: trailing space and = are encoded', [strpos($qp, "space at end=20") !== false, strpos($qp, '=3Dsign') !== false], [true, true]);
$same('qp: ASCII stays readable', ccrm_newsletter_qp_encode("Hello, world!"), 'Hello, world!');
$edge = str_repeat('a', 74) . 'č';
$check('qp: an encoded octet is never split across lines', max(array_map('strlen', explode("\r\n", ccrm_newsletter_qp_encode($edge)))) <= 76
    && quoted_printable_decode(ccrm_newsletter_qp_encode($edge)) === $edge);

// ---- headers: RFC 2047 subject and display names ---------------------------------------------
$same('subject: short ASCII is left alone', ccrm_newsletter_encode_header_text('Spring offer'), 'Spring offer');
$subject = 'Jarná ponuka: žiarovky, čipy a ďalšie novinky pre našich skvelých zákazníkov 🎉';
$enc = ccrm_newsletter_encode_header_text($subject);
$check('subject: non-ASCII is B-encoded UTF-8', strpos($enc, '=?UTF-8?B?') === 0);
$check('subject: every encoded word is at most 75 characters', max(array_map('strlen', explode("\r\n ", $enc))) <= 75);
$same('subject: decodes back', iconv_mime_decode('Subject: ' . $enc, 0, 'UTF-8'), 'Subject: ' . $subject);
$same('subject: line breaks cannot inject a header', strpos(ccrm_newsletter_encode_header_text("Hi\r\nBcc: x@y.sk"), "\n"), false);
$same('address: quoted ASCII name', ccrm_newsletter_address_header('Acme "Best" s.r.o.', 'a@b.sk'), '"Acme \\"Best\\" s.r.o." <a@b.sk>');
$check('address: non-ASCII name is encoded', strpos(ccrm_newsletter_address_header('Jožko Mrkvička', 'a@b.sk'), '=?UTF-8?B?') === 0);
$same('address: no name', ccrm_newsletter_address_header('', 'a@b.sk'), '<a@b.sk>');
$check('message id: shape', (bool)preg_match('/^<nl\.nlc-abc\.42\.[0-9a-f]{12}@example\.sk>$/', ccrm_newsletter_message_id('nlc-abc', '42', 'news@example.sk')));

// ---- the whole message ----------------------------------------------------------------------------
$html = "<html><body><p>Ahoj Jana, žiarovky!</p>\n<p>.</p>\n.leading dot\n<a href=\"https://crm.x.sk/api/newsletter_public.php?a=unsubscribe&amp;t=abc\">Odhlásiť</a></body></html>";
$msg = ccrm_newsletter_build_message([
    'fromEmail' => 'news@example.sk', 'fromName' => 'Acme s.r.o.', 'toEmail' => 'jana@x.sk', 'toName' => 'Jana Nováková', 'replyTo' => 'reply@example.sk',
    'subject' => 'Jarná ponuka', 'text' => "Ahoj Jana\n.\nOdhlásiť: https://crm.x.sk/u", 'html' => $html,
    'messageId' => '<nl.nlc-abc.42.0123456789ab@example.sk>', 'unsubscribeUrl' => 'https://crm.x.sk/api/newsletter_public.php?a=unsubscribe&t=abc',
    'campaignId' => 'nlc-abc', 'date' => 'Mon, 09 Nov 2026 10:00:00 +0000', 'boundary' => 'BOUNDARY',
]);
[$head, $bodyPart] = explode("\r\n\r\n", $msg, 2);
$headers = [];
foreach (explode("\r\n", $head) as $line) {
    $headers[strtolower(strstr($line, ':', true))] = ltrim(substr(strstr($line, ':'), 1));
}
$check('message: only CRLF line ends', strpos(str_replace("\r\n", '', $msg), "\n") === false);
$same('message: From, To, Reply-To, Date', [$headers['from'], $headers['to'] !== '' && strpos($headers['to'], '<jana@x.sk>') !== false, $headers['reply-to'], $headers['date']],
    ['"Acme s.r.o." <news@example.sk>', true, '<reply@example.sk>', 'Mon, 09 Nov 2026 10:00:00 +0000']);
$same('message: List-Unsubscribe and one-click', [$headers['list-unsubscribe'], $headers['list-unsubscribe-post']],
    ['<https://crm.x.sk/api/newsletter_public.php?a=unsubscribe&t=abc>', 'List-Unsubscribe=One-Click']);
$same('message: Message-ID, MIME-Version, campaign', [$headers['message-id'], $headers['mime-version'], $headers['x-newsletter-campaign']],
    ['<nl.nlc-abc.42.0123456789ab@example.sk>', '1.0', 'nlc-abc']);
$same('message: the subject is RFC 2047 encoded', [strpos($headers['subject'], '=?UTF-8?B?') === 0, iconv_mime_decode('Subject: ' . $headers['subject'], 0, 'UTF-8')], [true, 'Subject: Jarná ponuka']);
$check('message: multipart/alternative with the boundary', strpos($headers['content-type'], 'multipart/alternative; boundary="BOUNDARY"') === 0);
$parts = explode('--BOUNDARY', $bodyPart);
$check('message: text/plain first, then text/html, then the closing boundary', count($parts) === 4 && strpos($parts[1], 'text/plain') !== false
    && strpos($parts[2], 'text/html') !== false && trim($parts[3]) === '--');
$partBody = fn(string $p) => explode("\r\n\r\n", $p, 2)[1] ?? '';
$same('message: the html part decodes to the html', rtrim(quoted_printable_decode($partBody($parts[2])), "\r\n"), str_replace("\n", "\r\n", $html));
$check('message: both parts are quoted-printable UTF-8', substr_count($msg, "Content-Transfer-Encoding: quoted-printable") === 2 && substr_count($msg, 'charset=UTF-8') === 2);
$check('message: every line is at most 998 characters (RFC 5322)', max(array_map('strlen', explode("\r\n", $msg))) <= 998);
$stuffed = ccrm_newsletter_dot_stuff($msg);
$check('dot-stuffing: no line starts with a single dot', !preg_match('/^\.(?!\.)/m', $stuffed) && strpos($stuffed, "\r\n..\r\n") !== false);
$same('dot-stuffing: only the leading dot is doubled', ccrm_newsletter_dot_stuff(".a\n..b\nc.d\r\n."), "..a\r\n...b\r\nc.d\r\n..");
$same('dot-stuffing: it can be undone', preg_replace('/^\.\./m', '.', $stuffed), $msg);

// ---- SMTP: profile and a scripted session ------------------------------------------------------------
$prof = fn(array $c) => ccrm_newsletter_smtp::profile($c, 'crm.example.sk');
$ssl = $prof(['smtpHost' => 'smtp.x.sk', 'smtpPort' => 465, 'smtpUser' => 'u@x.sk', 'smtpPassword' => 'pw', 'smtpSecure' => 'ssl']);
$same('smtp profile: port 465 is implicit SSL, sender falls back to the user', [$ssl['secure'], $ssl['from'], $ssl['auth']], ['ssl', 'u@x.sk', true]);
$same('smtp profile: port 587 is STARTTLS', $prof(['smtpHost' => 'h', 'smtpPort' => 587, 'smtpUser' => 'u', 'smtpPassword' => 'p', 'smtpSecure' => 'ssl', 'senderEmail' => 'n@x.sk'])['secure'], 'starttls');
$same('smtp profile: explicit tls is STARTTLS, explicit none is plain', [
    $prof(['smtpHost' => 'h', 'smtpPort' => 25, 'smtpUser' => 'u', 'smtpPassword' => 'p', 'smtpSecure' => 'tls'])['secure'],
    $prof(['smtpHost' => 'h', 'smtpPort' => 25, 'smtpSecure' => 'none', 'smtpAuth' => false])['secure'],
], ['starttls', 'none']);
$ex = $prof(['emailProvider' => 'exchange', 'exchMailbox' => 'me@corp.com', 'exchPassword' => 'pw']);
$same('smtp profile: Exchange uses Office 365 on 587', [$ex['host'], $ex['port'], $ex['secure'], $ex['user'], $ex['from']], ['smtp.office365.com', 587, 'starttls', 'me@corp.com', 'me@corp.com']);
$stageOf = function (callable $fn): ?string {
    try { $fn(); } catch (ccrm_newsletter_smtp_error $e) { return $e->stage; }
    return null;
};
$same('smtp profile: no host is refused', $stageOf(fn() => $prof(['smtpPort' => 25])), 'connect');
$same('smtp profile: auth without a password is refused', $stageOf(fn() => $prof(['smtpHost' => 'h', 'smtpPort' => 25, 'smtpUser' => 'u'])), 'auth');

if (!class_exists('NlScriptStream')) {
    /**
     * A stream wrapper that plays a server script, one whole reply per read, and records what the client wrote.
     * (PHP drops a read/write stream's read buffer on every write, so replies must arrive one at a time, each
     * one fully consumed by the client's fgets loop before it writes again, as a real server's replies do.)
     */
    class NlScriptStream {
        public static $queue = [];
        public static $written = '';
        public $context;
        public function stream_open($path, $mode, $options, &$opened) { return true; }
        public function stream_read($count) { return (string)array_shift(self::$queue); }
        public function stream_eof() { return !self::$queue; }
        public function stream_write($d) { self::$written .= $d; return strlen($d); }
        public function stream_set_option($o, $a, $b) { return false; }
        public function stream_stat() { return []; }
        public function stream_close() {}
    }
    stream_wrapper_register('nlscript', 'NlScriptStream');
}
/** Runs $fn(smtp) against a scripted server; returns what the client wrote. */
$session = function (string $script, array $profile, callable $fn): string {
    preg_match_all('/(?:\d{3}-[^\n]*\n)*\d{3} [^\n]*\n/', $script, $replies);   // "250-a" lines continue, "250 b" ends a reply
    NlScriptStream::$queue = $replies[0];
    NlScriptStream::$written = '';
    $smtp = new ccrm_newsletter_smtp();
    $smtp->attach(fopen('nlscript://s', 'r+'));
    $smtp->handshake($profile);
    $fn($smtp);
    return NlScriptStream::$written;
};
$plain = ['host' => 'h', 'port' => 25, 'secure' => 'none', 'user' => '', 'pass' => '', 'auth' => false, 'from' => 'news@example.sk', 'serverName' => 'crm.example.sk'];
$hello = "220 mail ready\r\n250-mail\r\n250-PIPELINING\r\n250 8BITMIME\r\n";
$written = $session($hello . "250 ok\r\n250 ok\r\n354 go on\r\n250 queued\r\n", $plain, fn($s) => $s->send('news@example.sk', 'jana@x.sk', "Subject: x\r\n\r\n.dot\r\nbody"));
$check('smtp: a normal message goes through MAIL, RCPT, DATA and ends with CRLF.CRLF',
    strpos($written, "EHLO crm.example.sk\r\n") === 0 && strpos($written, "MAIL FROM:<news@example.sk>\r\n") !== false
    && strpos($written, "RCPT TO:<jana@x.sk>\r\n") !== false && strpos($written, "\r\nDATA\r\n") !== false
    && strpos($written, "\r\n..dot\r\n") !== false && substr($written, -5) === "\r\n.\r\n");
$authProfile = ['auth' => true, 'user' => 'u@x.sk', 'pass' => 'secret-pw'] + $plain;
$caught = null;
try {
    $session($hello . "334 VXNlcm5hbWU6\r\n334 UGFzc3dvcmQ6\r\n535 5.7.8 Authentication failed\r\n", $authProfile, fn($s) => null);
} catch (ccrm_newsletter_smtp_error $e) { $caught = $e; }
$same('smtp: a refused login is stage auth with the server reply and no password', [$caught->stage, $caught->smtpCode, $caught->getMessage()], ['auth', 535, '535 5.7.8 Authentication failed']);
$caught = null;
$written = '';
try {
    $session($hello . "250 ok\r\n550 5.1.1 No such user\r\n250 reset\r\n", $plain, fn($s) => $s->send('news@example.sk', 'gone@x.sk', 'Subject: x'));
} catch (ccrm_newsletter_smtp_error $e) { $caught = $e; $written = NlScriptStream::$written; }
$same('smtp: 550 on RCPT is a hard bounce, permanent, and the session is reset', [$caught->stage, $caught->smtpCode, $caught->isHardBounce(), $caught->isTransient(), strpos($written, "RSET\r\n") !== false], ['rcpt', 550, true, false, true]);
$caught = null;
try {
    $session($hello . "250 ok\r\n450 4.2.1 Mailbox busy\r\n250 reset\r\n", $plain, fn($s) => $s->send('news@example.sk', 'busy@x.sk', 'Subject: x'));
} catch (ccrm_newsletter_smtp_error $e) { $caught = $e; }
$same('smtp: 450 on RCPT is transient, not a bounce', [$caught->isTransient(), $caught->isHardBounce(), $caught->dropped], [true, false, false]);
$caught = null;
try {
    $session($hello . "250 ok\r\n250 ok\r\n354 go\r\n554 5.7.1 Rejected as spam\r\n250 reset\r\n", $plain, fn($s) => $s->send('news@example.sk', 'a@x.sk', 'Subject: x'));
} catch (ccrm_newsletter_smtp_error $e) { $caught = $e; }
$same('smtp: a rejected body is permanent but never a bounce', [$caught->stage, $caught->isTransient(), $caught->isHardBounce()], ['body', false, false]);
$caught = null;
try {
    $session($hello . "250 ok\r\n", $plain, fn($s) => $s->send('news@example.sk', 'a@x.sk', 'Subject: x'));
} catch (ccrm_newsletter_smtp_error $e) { $caught = $e; }
$same('smtp: a dropped connection is transient and marked dropped', [$caught->dropped, $caught->isTransient()], [true, true]);
$caught = null;
try {
    $session($hello . "421 4.3.2 Service shutting down\r\n", $plain, fn($s) => $s->send('news@example.sk', 'a@x.sk', 'Subject: x'));
} catch (ccrm_newsletter_smtp_error $e) { $caught = $e; }
$same('smtp: 421 closes the channel', [$caught->smtpCode, $caught->dropped], [421, true]);

// ---- start_send validation (pure part) ---------------------------------------------------------------
$goodHtml = '<html><body><p>Hi</p><a href="{{unsubscribe_url}}">Unsubscribe</a><a href="https://x.sk/?a=1&amp;b=2">x</a><a href="mailto:a@x.sk">m</a><img src="https://x.sk/a.png"></body></html>';
$sendCode = fn(string $h, string $t = 'text') => $throws(fn() => ccrm_newsletter_check_send_html($h, $t));
$same('send check: a good e-mail passes', $sendCode($goodHtml), null);
$same('send check: the unsubscribe tag with a fallback or spaces counts', $sendCode('<a href="{{ unsubscribe_url | x }}">u</a>'), null);
$same('send check: no unsubscribe link', $sendCode('<p>Hi</p>'), 'missing_unsubscribe');
$same('send check: a different tag is not enough', $sendCode('<a href="{{view_online_url}}">v</a>'), 'missing_unsubscribe');
$same('send check: data: image src', $sendCode($goodHtml . '<img src="data:image/png;base64,AAAA">'), 'data_url_image');
$same('send check: data: image, upper case and spaces', $sendCode($goodHtml . "<IMG SRC = ' DATA:image/png;base64,AAAA'>"), 'data_url_image');
$same('send check: css url(data:)', $sendCode($goodHtml . '<div style="background:url(data:image/png;base64,AA)">'), 'data_url_image');
$same('send check: javascript: href', $sendCode($goodHtml . '<a href="javascript:alert(1)">x</a>'), 'dangerous_url');
$same('send check: entity-obfuscated javascript:', $sendCode($goodHtml . '<a href="jav&#x61;script&colon;alert(1)">x</a>'), 'dangerous_url');
$same('send check: tab inside the scheme', $sendCode($goodHtml . "<a href=\"java\tscript:alert(1)\">x</a>"), 'dangerous_url');
$same('send check: vbscript: and data: href', [$sendCode($goodHtml . '<a href=vbscript:x>x</a>'), $sendCode($goodHtml . '<a href="data:text/html,hi">x</a>')], ['dangerous_url', 'dangerous_url']);
$same('send check: text that merely mentions javascript: is fine', $sendCode($goodHtml . '<p>javascript: is a scheme</p>'), null);
$same('send check: an html part over 1 MB', $sendCode($goodHtml . str_repeat('x', 1048577)), 'html_too_large');
$same('send check: a text part over 1 MB', $sendCode($goodHtml, str_repeat('x', 1048577)), 'html_too_large');
$same('text from html: tags, entities and styles', ccrm_newsletter_text_from_html('<style>p{}</style><p>A &amp; B</p><p>C<br>D</p>'), "A & B\nC\nD");
$same('transitions: who may pause, resume, cancel', ccrm_newsletter_transitions(), ['pause' => ['sending'], 'resume' => ['paused'], 'cancel' => ['sending', 'paused']]);
$cfg = ccrm_newsletter_default_config();
$cfg['sender'] = ['fromName' => 'Settings Name', 'replyTo' => 'set@x.sk'];
$same('sender fields: campaign beats settings beats company', [
    ccrm_newsletter_sender_fields(['from_name' => 'Campaign', 'reply_to' => 'c@x.sk'], $cfg, 'Company'),
    ccrm_newsletter_sender_fields(['from_name' => null, 'reply_to' => null], $cfg, 'Company'),
    ccrm_newsletter_sender_fields(['from_name' => '', 'reply_to' => ''], ccrm_newsletter_default_config(), 'Company'),
], [['fromName' => 'Campaign', 'replyTo' => 'c@x.sk'], ['fromName' => 'Settings Name', 'replyTo' => 'set@x.sk'], ['fromName' => 'Company', 'replyTo' => '']]);

// ---- public pages (pure parts) ---------------------------------------------------------------------------
$same('mask: first character and the domain', [ccrm_newsletter_mask_email('jana@example.com'), ccrm_newsletter_mask_email('Ľuboš@x.sk'), ccrm_newsletter_mask_email('nope')],
    ['j•••@example.com', 'Ľ•••@x.sk', '•••']);
$same('token kinds', [ccrm_newsletter_token_kind('test'), ccrm_newsletter_token_kind(str_repeat('a1', 16)), ccrm_newsletter_token_kind(str_repeat('A1', 16)),
    ccrm_newsletter_token_kind('abc'), ccrm_newsletter_token_kind(null), ccrm_newsletter_token_kind(['x'])], ['test', 'token', 'invalid', 'invalid', 'invalid', 'invalid']);
$same('one-click: form field or raw body', [
    ccrm_newsletter_is_one_click(['List-Unsubscribe' => 'One-Click'], ''), ccrm_newsletter_is_one_click([], "List-Unsubscribe=One-Click\r\n"),
    ccrm_newsletter_is_one_click([], ''), ccrm_newsletter_is_one_click(['List-Unsubscribe' => 'yes'], 'x=1'),
], [true, true, false, false]);
$same('language: anything else is the system default', [ccrm_newsletter_public_lang('en'), ccrm_newsletter_public_lang('hu'), ccrm_newsletter_public_lang('de'), ccrm_newsletter_public_lang(false)], ['en', 'hu', 'sk', 'sk']);
$allLangs = true;
foreach (ccrm_newsletter_public_strings() as $texts) {
    foreach (['en', 'sk', 'hu'] as $l) {
        $allLangs = $allLangs && isset($texts[$l]) && $texts[$l] !== '';
    }
}
$check('public pages: every text exists in en, sk and hu', $allLangs);
$page = ccrm_newsletter_public_page('en', 'Title <x>', '<p>' . ccrm_newsletter_public_text('ask', 'en', 'Acme <b>&</b> s.r.o.') . '</p>', 'Acme <b>&</b> s.r.o.');
$check('public pages: the company name is escaped and shown', strpos($page, '<b>') === false && strpos($page, 'Acme &lt;b&gt;&amp;&lt;/b&gt; s.r.o.') !== false);
$check('public pages: without a company the page says "this sender", never the product name',
    strpos(ccrm_newsletter_public_text('ask', 'en'), 'this sender') !== false && stripos($page . ccrm_newsletter_public_text('ask', 'en'), KOPERNIQ_PRODUCT_NAME) === false);
$same('public pages: the title is escaped once', strpos($page, '<title>Title &lt;x&gt;</title>') !== false, true);

echo $fails === 0 ? "\nAll newsletter checks passed.\n" : "\n$fails newsletter check(s) FAILED.\n";
exit($fails === 0 ? 0 : 1);
