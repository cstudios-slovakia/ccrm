<?php
declare(strict_types=1);

/**
 * Headless checks for the pure helpers of the machine API (public/api/integration_lib.php):
 * IP ranges, input cleaning and ISO 8601 parsing. No database, no web server.
 *
 *   php scripts/test-integration-lib.php          (npm run test:integration runs it in the dev container)
 *
 * Exit code 0 on success (prints "OK n checks"), 1 on failure.
 */

date_default_timezone_set('Europe/Bratislava');
require_once __DIR__ . '/../public/api/integration_lib.php';
require_once __DIR__ . '/../public/api/integration_tasks.php';

$checks = 0;
function check(bool $ok, string $description): void {
    global $checks;
    if (!$ok) {
        fwrite(STDERR, "FAIL: {$description}\n");
        exit(1);
    }
    $checks++;
}

/** The error code and field a call is refused with, or null when it succeeds. */
function refused(callable $fn): ?string {
    try {
        $fn();
    } catch (CcrmIntApiException $e) {
        return $e->status . ':' . $e->errorCode . ':' . implode(',', array_keys($e->fields));
    }
    return null;
}

// ---- IP ranges
check(ccrm_int_ip_in_range('172.18.0.1', '172.18.0.1'), 'a single address matches itself');
check(!ccrm_int_ip_in_range('172.18.0.2', '172.18.0.1'), 'a single address does not match another');
check(ccrm_int_ip_in_range('172.31.250.10', '172.31.250.0/24'), 'a /24 contains its hosts');
check(!ccrm_int_ip_in_range('172.31.251.10', '172.31.250.0/24'), 'a /24 excludes the next network');
check(ccrm_int_ip_in_range('10.200.3.4', '10.0.0.0/8'), 'a /8 contains its hosts');
check(ccrm_int_ip_in_range('192.168.1.130', '192.168.1.128/25'), 'a /25 upper half matches');
check(!ccrm_int_ip_in_range('192.168.1.127', '192.168.1.128/25'), 'a /25 lower half is excluded');
check(ccrm_int_ip_in_range('203.0.113.9', '0.0.0.0/0'), '/0 matches everything');
check(ccrm_int_ip_in_range('2001:db8::1', '2001:db8::/32'), 'an IPv6 /32 contains its hosts');
check(!ccrm_int_ip_in_range('2001:db9::1', '2001:db8::/32'), 'an IPv6 /32 excludes other networks');
check(ccrm_int_ip_in_range('::ffff:10.0.0.7', '10.0.0.0/24'), 'an IPv4-mapped IPv6 peer matches an IPv4 range');
check(!ccrm_int_ip_in_range('10.0.0.7', '2001:db8::/32'), 'IPv4 never matches an IPv6 range');
check(!ccrm_int_ip_in_range('not-an-ip', '10.0.0.0/8'), 'garbage never matches');
check(!ccrm_int_ip_in_range('10.0.0.1', '10.0.0.0/33'), 'an impossible prefix never matches');
check(ccrm_int_valid_ip_range('10.0.0.0/8') && ccrm_int_valid_ip_range('185.111.88.70') && ccrm_int_valid_ip_range('2001:db8::/32'), 'valid ranges are accepted');
check(!ccrm_int_valid_ip_range('10.0.0.0/33') && !ccrm_int_valid_ip_range('10.0.0.0/x') && !ccrm_int_valid_ip_range('example.com') && !ccrm_int_valid_ip_range(''), 'invalid ranges are refused');

// ---- tokens
check(ccrm_int_token_hash('abc') === hash('sha256', 'abc'), 'tokens are stored as sha256');
check(!ccrm_int_token_expired(null) && !ccrm_int_token_expired(''), 'no expiry never expires');
check(ccrm_int_token_expired(date('Y-m-d H:i:s', time() - 5)) && !ccrm_int_token_expired(date('Y-m-d H:i:s', time() + 3600)), 'expiry compares against now');

// ---- scopes
$client = ['scopes' => ['users:read', 'tasks:pull']];
check(ccrm_int_has_scope($client, 'users:read') && !ccrm_int_has_scope($client, 'tasks:push'), 'scope membership');
check(refused(fn() => ccrm_int_check_scope($client, null)) === null, 'a route without a scope accepts any token');
check(refused(fn() => ccrm_int_check_scope($client, ['tasks:push', 'tasks:pull'])) === null, 'any one of several scopes is enough');
check(refused(fn() => ccrm_int_check_scope($client, 'tasks:push')) === '403:forbidden_scope:', 'a missing scope is a 403');

// ---- text cleaning
check(ccrm_int_clean_text('  Hello   <b>world</b>  ', 'title', 255) === 'Hello world', 'tags are stripped and spaces collapsed');
check(ccrm_int_clean_text('a &lt;script&gt;x&lt;/script&gt; b', 'title', 255) === 'a x b', 'entities that decode into markup are stripped too');
check(ccrm_int_clean_text("a\x00b\x07c", 'title', 255) === 'ab c', 'NUL is dropped (strip_tags), other control characters become a space');
check(ccrm_int_clean_text("a\u{202E}b\u{FEFF}c\u{00AD}d", 'title', 255) === 'abcd', 'bidi overrides, BOM and soft hyphens are removed');
check(ccrm_int_clean_text("👨\u{200D}👩\u{200D}👧", 'title', 255) === "👨\u{200D}👩\u{200D}👧", 'zero-width joiners are kept (emoji sequences)');
check(ccrm_int_clean_text("می\u{200C}خواهم", 'title', 255) === "می\u{200C}خواهم", 'zero-width non-joiners are kept (Persian)');
check(ccrm_int_clean_text("one\r\ntwo\n\n\n\nthree", 'description', 5000, true) === "one\ntwo\n\nthree", 'multiline keeps paragraphs, collapses blank runs');
check(ccrm_int_clean_text("a\nb", 'title', 255) === 'a b', 'a single line folds newlines');
check(ccrm_int_clean_text(null, 'description', 5000, true) === '', 'null is an empty string');
check(refused(fn() => ccrm_int_clean_text('', 'title', 255, false, true)) === '422:validation_failed:title', 'a required text must not be empty');
check(refused(fn() => ccrm_int_clean_text('<i></i>', 'title', 255, false, true)) === '422:validation_failed:title', 'markup only counts as empty');
check(refused(fn() => ccrm_int_clean_text(str_repeat('x', 256), 'title', 255)) === '422:validation_failed:title', 'too long is refused');
check(refused(fn() => ccrm_int_clean_text(12, 'title', 255)) === '422:validation_failed:title', 'a number is not a string');
check(ccrm_int_clean_text(str_repeat('š', 255), 'title', 255) === str_repeat('š', 255), 'the length cap counts characters, not bytes');

// ---- ISO 8601
$now = strtotime('2026-10-29 12:00:00');
$d = ccrm_int_parse_iso('2026-11-01', 'due', $now);
check($d->format('Y-m-d H:i') === '2026-11-01 00:00' && $d->getTimezone()->getName() === 'Europe/Bratislava', 'a date is midnight in the app time zone');
$d = ccrm_int_parse_iso('2026-10-02T23:59:00+02:00', 'due', strtotime('2026-09-30'));
check($d->format('c') === '2026-10-02T23:59:00+02:00', 'an offset date-time keeps its instant');
$d = ccrm_int_parse_iso('2026-10-02T21:59:00Z', 'due', strtotime('2026-09-30'));
check($d->getTimestamp() === strtotime('2026-10-02T23:59:00+02:00'), 'Z means UTC');
check(ccrm_int_parse_iso('2026-10-02T12:00:00.250+02:00', 'due', strtotime('2026-09-30')) instanceof DateTimeImmutable, 'fractional seconds are accepted');
check(ccrm_int_parse_iso('2026-10-02T12:00+02:00', 'due', strtotime('2026-09-30')) instanceof DateTimeImmutable, 'seconds are optional');
foreach (['tomorrow', '2026-10-5', '2026/10/05', '2026-02-30', '2026-13-01', '2026-10-05T25:00:00+02:00', '2026-10-05T12:00:00', '2026-10-05 12:00:00+02:00', ''] as $bad) {
    check(refused(fn() => ccrm_int_parse_iso($bad, 'due', $now)) === '422:validation_failed:due', "refused: {$bad}");
}
check(refused(fn() => ccrm_int_parse_iso(1730190000, 'due', $now)) === '422:validation_failed:due', 'a number is refused');
check(refused(fn() => ccrm_int_parse_iso('2025-10-28', 'due', $now)) === '422:validation_failed:due', 'more than a year back is refused');
check(ccrm_int_parse_iso('2025-10-30', 'due', $now) instanceof DateTimeImmutable, 'just under a year back is fine');
check(refused(fn() => ccrm_int_parse_iso('2031-10-30', 'due', $now)) === '422:validation_failed:due', 'more than five years ahead is refused');
check(ccrm_int_parse_iso('2031-10-28', 'due', $now) instanceof DateTimeImmutable, 'just under five years ahead is fine');
// The conversion around the autumn DST change (2026-10-25 03:00 -> 02:00 in Europe/Bratislava).
$before = ccrm_int_parse_iso('2026-10-24T23:59:00+02:00', 'due', strtotime('2026-10-01'));
$after = ccrm_int_parse_iso('2026-10-26T23:59:00+01:00', 'due', strtotime('2026-10-01'));
check($before->setTimezone(new DateTimeZone('Europe/Bratislava'))->format('H:i') === '23:59' && $after->setTimezone(new DateTimeZone('Europe/Bratislava'))->format('H:i') === '23:59', 'the local time survives the DST change');

// ---- request body
check(ccrm_int_json_object('{"a":1}') === ['a' => 1], 'an object decodes');
check(ccrm_int_json_object('{}') === [], 'an empty object is allowed');
foreach (['', '[1,2]', '"x"', '{bad', 'null'] as $bad) {
    check(refused(fn() => ccrm_int_json_object($bad)) === '400:invalid_json:', 'refused body: ' . var_export($bad, true));
}

// ---- task deadlines (integration_tasks.php)
$now = strtotime('2026-10-29 12:00:00');
check(ccrm_int_parse_due(null) === null, 'no due is null');
check(ccrm_int_parse_due(['at' => '2026-11-03T23:59:00+01:00', 'all_day' => true], 'due', $now) === ['date' => '2026-11-03', 'time' => null], 'an all-day deadline has a date and no time');
check(ccrm_int_parse_due(['at' => '2026-11-03T08:30:00+01:00', 'all_day' => false], 'due', $now) === ['date' => '2026-11-03', 'time' => '08:30'], 'a timed deadline keeps its local HH:MM');
check(ccrm_int_parse_due(['at' => '2026-11-03T08:30:00+01:00'], 'due', $now) === ['date' => '2026-11-03', 'time' => '08:30'], 'all_day defaults to false');
check(ccrm_int_parse_due(['at' => '2026-11-03T22:59:00Z', 'all_day' => true], 'due', $now) === ['date' => '2026-11-03', 'time' => null], 'UTC 22:59 is the same local day (CET)');
check(ccrm_int_parse_due(['at' => '2026-11-03T23:30:00Z', 'all_day' => true], 'due', $now) === ['date' => '2026-11-04', 'time' => null], 'UTC 23:30 is already the next local day');
check(ccrm_int_parse_due(['at' => '2026-11-03'], 'due', $now) === ['date' => '2026-11-03', 'time' => '00:00'], 'a bare date is midnight local');
// Spring forward 2027-03-28: 02:00 CET jumps to 03:00 CEST.
check(ccrm_int_parse_due(['at' => '2027-03-28T00:30:00Z'], 'due', $now) === ['date' => '2027-03-28', 'time' => '01:30'], 'UTC 00:30 is 01:30 CET before the change');
check(ccrm_int_parse_due(['at' => '2027-03-28T01:30:00Z'], 'due', $now) === ['date' => '2027-03-28', 'time' => '03:30'], 'UTC 01:30 is 03:30 CEST after the change');
check(ccrm_int_parse_due(['at' => '2027-03-27T22:59:00Z', 'all_day' => true], 'due', $now) === ['date' => '2027-03-27', 'time' => null], 'a day before the change');
foreach ([['at' => 5], ['nope' => 1], 'tomorrow', ['at' => 'tomorrow'], ['at' => '2026-11-03', 'all_day' => 'yes']] as $bad) {
    check(refused(fn() => ccrm_int_parse_due($bad, 'due', $now)) === '422:validation_failed:due', 'refused due: ' . json_encode($bad));
}
check(ccrm_int_parse_start(null) === null && ccrm_int_parse_start('') === null, 'no start is null');
check(ccrm_int_parse_start('2026-11-05T00:00:00+01:00', 'start', $now) === '2026-11-05', 'a start is the local date');
check(refused(fn() => ccrm_int_parse_start('soon', 'start', $now)) === '422:validation_failed:start', 'a start must be ISO 8601');
check(ccrm_int_due_to_iso('2026-11-03', null) === '2026-11-03T23:59:00+01:00', 'no time means 23:59 local, offset of that day');
check(ccrm_int_due_to_iso('2026-10-24', '08:30') === '2026-10-24T08:30:00+02:00', 'summer time offset');
check(ccrm_int_due_to_iso('2026-10-26', '08:30') === '2026-10-26T08:30:00+01:00', 'winter time offset after the change');
check(ccrm_int_default_deadline(7, strtotime('2026-10-29 12:00:00')) === '2026-11-05', 'default deadline is today + N days');
check(ccrm_int_default_deadline(0, strtotime('2026-10-29 23:30:00')) === '2026-10-29', 'zero days is today');
check(ccrm_int_default_deadline(7, strtotime('2026-10-29 23:30:00 UTC')) === '2026-11-06', 'the day is the local one (UTC 23:30 is already tomorrow in Bratislava)');

// ---- task states
$states = ['todo', 'in_progress', 'review', 'finished'];
check(ccrm_int_task_is_done('finished', $states) && ccrm_int_task_is_done('Done', $states) && !ccrm_int_task_is_done('review', $states), 'the last state and "done" are done');
check(ccrm_int_task_is_done('done', []) && !ccrm_int_task_is_done('todo', []), 'without configured states only "done" is done');
check(ccrm_int_task_initial_state($states) === 'todo' && ccrm_int_task_done_state($states) === 'finished', 'first state is new, last is done');
check(ccrm_int_task_initial_state([]) === 'todo' && ccrm_int_task_done_state([]) === 'done', 'defaults without configured states');

// ---- people
$dir = ['names' => ['u1' => 'Anna', 'u2' => 'Boris', 'u3' => 'boris'], 'ids' => ['anna' => 'u1', 'boris' => null]];
check(ccrm_int_user_id_for_name($dir, ' ANNA ') === 'u1', 'a name resolves case-insensitively');
check(ccrm_int_user_id_for_name($dir, 'Boris') === null, 'a name shared by two users resolves to nobody');
check(ccrm_int_user_id_for_name($dir, 'Nobody') === null && ccrm_int_user_id_for_name($dir, null) === null && ccrm_int_user_id_for_name($dir, '') === null, 'unknown and empty names resolve to nobody');
check(ccrm_int_task_user(7, 'owner_id', ['names' => ['7' => 'Seven']]) === '7', 'a numeric id is accepted as a string');
check(refused(fn() => ccrm_int_task_user('zzz', 'owner_id', $dir)) === '422:validation_failed:owner_id', 'an unknown user is refused');
check(refused(fn() => ccrm_int_task_user(['u1'], 'owner_id', $dir)) === '422:validation_failed:owner_id', 'a non-scalar user is refused');

// ---- chat paths and the description footer
check(ccrm_int_parse_chat_path('/c/ckx8_a-B', 'p') === '/c/ckx8_a-B' && ccrm_int_parse_chat_path('/c/ckx8?m=ckm2', 'p') === '/c/ckx8?m=ckm2' && ccrm_int_parse_chat_path(null, 'p') === null && ccrm_int_parse_chat_path('', 'p') === null, 'chat paths');
foreach (['//evil.example/c/x', 'https://evil.example/c/x', '/c/x?m=a&b=c', '/c/', '/tasks', '/c/x/y', '/c/x#frag', "/c/x\n", '/c/' . str_repeat('a', 65)] as $bad) {
    check(refused(fn() => ccrm_int_parse_chat_path($bad, 'context.path')) === '422:validation_failed:context.path', 'refused path: ' . json_encode($bad));
}
$ctx = ['conversation' => 'Marek Novák', 'assignee_label' => 'Marek'];
check(ccrm_int_task_footer('en', $ctx, 'https://crm.test/#whatsapp/c/x') === "WhatsApp chat: Marek Novák\nWhatsApp assignee: Marek\nOpen chat: https://crm.test/#whatsapp/c/x", 'footer (en)');
check(str_contains(ccrm_int_task_footer('sk', $ctx, ''), 'Zodpovedný vo WhatsAppe: Marek') && !str_contains(ccrm_int_task_footer('sk', $ctx, ''), 'Otvoriť'), 'footer (sk) has no link line without a URL');
check(str_contains(ccrm_int_task_footer('hu', $ctx, 'u'), 'Csevegés megnyitása: u'), 'footer (hu)');
check(ccrm_int_task_footer('en', ['conversation' => '', 'assignee_label' => ''], '') === '', 'an empty context has no footer');
check(ccrm_int_task_compose_description('Text', 'Footer') === "Text\n\nFooter" && ccrm_int_task_compose_description('', 'Footer') === 'Footer' && ccrm_int_task_compose_description('Text', '') === 'Text', 'description + footer');

echo "OK {$checks} checks\n";
