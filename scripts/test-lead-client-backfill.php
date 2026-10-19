<?php
/**
 * Offline checks for the pure planner in api/lead_client_backfill.php. No database.
 * Run:  php scripts/test-lead-client-backfill.php
 */
chdir(dirname(__DIR__));
require_once __DIR__ . '/../public/api/lead_client_backfill.php';

$fails = 0;
$check = function (string $name, bool $ok) use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . "\n";
    if (!$ok) { $fails++; }
};
$row = fn($id, $name, $email = '', $phone = '', $clientId = null) =>
    ['id' => $id, 'name' => $name, 'email' => $email, 'phone' => $phone, 'client_id' => $clientId];

// the plain case, case and whitespace insensitive
$plan = ccrm_plan_lead_client_links([
    $row('client-1', 'Peter Novák', 'peter@example.com'),
    $row('lead-1', '  peter novák ', 'peter@example.com'),
]);
$check('a lead is linked to the one client of that name', $plan['links'] === ['lead-1' => 'client-1']);

// a lead with no email still links when the client has one
$plan = ccrm_plan_lead_client_links([$row('client-1', 'A', 'a@x.sk'), $row('lead-1', 'A')]);
$check('a lead without an e-mail links to a client that has one', $plan['links'] === ['lead-1' => 'client-1']);

// a different email is a different person
$plan = ccrm_plan_lead_client_links([
    $row('client-1', 'Peter Novák', 'peter@example.com'),
    $row('lead-1', 'Peter Novák', 'peter@example.com'),
    $row('lead-2', 'Peter Novák', 'someone.else@example.com'),
]);
$check('only the lead with the matching e-mail is linked', $plan['links'] === ['lead-1' => 'client-1']);
$check('the other one is reported with the reason',
    count($plan['ambiguous']) === 1 && $plan['ambiguous'][0]['lead_ids'] === ['lead-2']
    && strpos($plan['ambiguous'][0]['reason'], 'e-mail') !== false);

// client has no e-mail, the leads disagree: nobody can be linked
$plan = ccrm_plan_lead_client_links([
    $row('client-1', 'Peter Novák'),
    $row('lead-1', 'Peter Novák', 'one@example.com'),
    $row('lead-2', 'Peter Novák', 'two@example.com'),
]);
$check('look-alike leads under a client without an e-mail are not linked', $plan['links'] === []);
$check('and are reported together', count($plan['ambiguous']) === 1 && count($plan['ambiguous'][0]['lead_ids']) === 2);

// the same lead twice with the same email is fine
$plan = ccrm_plan_lead_client_links([
    $row('client-1', 'Peter Novák'),
    $row('lead-1', 'Peter Novák', 'one@example.com'),
    $row('lead-2', 'Peter Novák', 'ONE@example.com'),
]);
$check('repeat deals from the same e-mail all link', count($plan['links']) === 2);

// phone numbers compare by their last nine digits
$plan = ccrm_plan_lead_client_links([
    $row('client-1', 'Peter Novák', '', '+421 900 111 222'),
    $row('lead-1', 'Peter Novák', '', '0900 111 222'),
    $row('lead-2', 'Peter Novák', '', '+421 911 999 888'),
]);
$check('national and international forms of a number match', isset($plan['links']['lead-1']) && !isset($plan['links']['lead-2']));
$check('a different phone number is reported', strpos($plan['ambiguous'][0]['reason'], 'phone') !== false);

// two clients of the same name
$plan = ccrm_plan_lead_client_links([
    $row('client-1', 'Peter Novák'), $row('client-2', 'Peter Novák'), $row('lead-1', 'Peter Novák'),
]);
$check('two clients of one name leave the lead unlinked', $plan['links'] === []);
$check('and are reported with both client ids', $plan['ambiguous'][0]['client_ids'] === ['client-1', 'client-2']);

// the rest
$plan = ccrm_plan_lead_client_links([
    $row('lead-1', 'Nobody'),
    $row('lead-2', 'Linked', '', '', 'client-9'),
    $row('client-9', 'Linked'),
    $row('unassigned-docs', 'Unassigned'),
    $row('lead-3', ''),
]);
$check('a lead with no client of that name is counted, not reported', $plan['noClient'] === 1 && $plan['ambiguous'] === []);
$check('an already linked lead is left alone', $plan['already'] === 1 && $plan['links'] === []);
$check('client rows, the synthetic bucket and nameless rows are never linked', count($plan['links']) === 0);

echo $fails === 0 ? "\nAll passed.\n" : "\n$fails FAILED.\n";
exit($fails === 0 ? 0 : 1);
