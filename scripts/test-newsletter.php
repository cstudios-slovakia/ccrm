<?php
/**
 * Offline checks for the Newsletter backend core (api/newsletter_audience.php, api/newsletter_lib.php).
 * No database, no web server. Run:  php scripts/test-newsletter.php   (npm run test:newsletter)
 *
 * The send engine (2A) adds its own sections: merge-tag parity, MIME builder, unsubscribe idempotency.
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

echo $fails === 0 ? "\nAll newsletter checks passed.\n" : "\n$fails newsletter check(s) FAILED.\n";
exit($fails === 0 ? 0 : 1);
