<?php
/**
 * Offline check of the presence push payload builders (api/time_presence_push.php). Nothing is sent.
 * Run:  php scripts/test-time-presence-push.php   (npm run test:time-presence-push)
 */
chdir(dirname(__DIR__));
date_default_timezone_set('Europe/Bratislava');
require_once __DIR__ . '/../public/api/time_presence_push.php';

$fails = 0;
$check = function (string $name, bool $ok, string $detail = '') use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . ($ok ? '' : "  $detail") . "\n";
    if (!$ok) { $fails++; }
};

// 07:50 UTC in November is 08:50 in Bratislava (CET).
$q = ccrm_tt_push_build_question('en', '2026-11-19 07:50:00', ['Website', 'Audit', 'Setup']);
$check('question title', $q['title'] === 'Still working?');
$check('question body names items and time', $q['body'] === "Website +2\nTimers pause at 08:50", json_encode($q['body']));
$check('question tag/renotify/interaction', $q['tag'] === 'tt-presence' && $q['renotify'] === true && $q['requireInteraction'] === true);
$check('question url and kind', $q['data']['url'] === '/#time-tracking' && $q['data']['kind'] === 'tt-presence');
$check('question has no actions', !array_key_exists('actions', $q));
$q1 = ccrm_tt_push_build_question('sk', '2026-11-19 07:50:00', ['Web']);
$check('question sk single', $q1['title'] === 'Stále pracuješ?' && $q1['body'] === "Web\nČasovače sa pozastavia o 08:50");
$q2 = ccrm_tt_push_build_question('hu', '2026-07-01 07:50:00', []);
$check('question hu summer time, no titles', $q2['title'] === 'Még dolgozol?' && $q2['body'] === 'Az időzítők 09:50-kor szünetelnek', json_encode($q2['body']));

foreach (['en' => ['Paused at 08:50', 'Timers stopped at 08:50'], 'sk' => ['Pozastavené o 08:50', 'Časovače zastavené o 08:50'], 'hu' => ['Szüneteltetve: 08:50', 'Időzítők leállítva: 08:50']] as $lang => [$p, $s]) {
    $a = ccrm_tt_push_build_notice('paused', $lang, '2026-11-19 07:50:00');
    $b = ccrm_tt_push_build_notice('stopped', $lang, '2026-11-19 07:50:00');
    $check("paused $lang", $a['title'] === $p, $a['title']);
    $check("stopped $lang", $b['title'] === $s, $b['title']);
}
$a = ccrm_tt_push_build_notice('paused', 'en', '2026-11-19 07:50:00');
$check('notice tag/renotify/no actions', $a['tag'] === 'tt-presence' && $a['renotify'] === true && !array_key_exists('actions', $a) && $a['data']['url'] === '/#time-tracking');

$c = ccrm_tt_push_build_cleared();
$check('cleared is silent data message', $c['silent'] === true && $c['tag'] === 'tt-presence' && $c['data'] === ['kind' => 'tt-presence-cleared'] && !isset($c['title']));

exit($fails ? 1 : 0);
