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

echo "OK {$checks} checks\n";
