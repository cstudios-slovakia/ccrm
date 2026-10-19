<?php
/**
 * Links existing leads to their client record by `leads.client_id`.
 *
 * Leads used to belong to a client by name alone. `client_id` is the real link; this
 * fills it in for the rows that predate it. It is deliberately conservative: a name
 * is not an identity, so a lead is only linked when nothing contradicts it, and
 * everything that does is left unlinked and reported for a person to decide.
 *
 * What counts as a client here is the explicit `client-*` row. A lead that is a
 * client only through a positive adjustment keeps resolving by name in the app.
 *
 * - ccrm_plan_lead_client_links($rows): pure, no database. Used by the tests.
 * - ccrm_backfill_lead_client_ids($pdo, $apply): reads the table, writes the links.
 *
 * Run by hand with  php ccrm backfill-clients [--dry-run]  and once automatically
 * when the column is first created (api/schema.php).
 */

if (!function_exists('ccrm_plan_lead_client_links')) {

    function ccrm_backfill_name_key($name): string {
        return mb_strtolower(trim((string)$name), 'UTF-8');
    }

    function ccrm_backfill_email_key($email): string {
        return mb_strtolower(trim((string)$email), 'UTF-8');
    }

    /** Last nine digits, so +421 900 111 222 and 0900 111 222 are the same number. */
    function ccrm_backfill_phone_key($phone): string {
        $digits = preg_replace('/\D+/', '', (string)$phone);
        return strlen($digits) >= 6 ? substr($digits, -9) : '';
    }

    /**
     * Lead ids that cannot be linked safely, given the client's value for one
     * identifying field and each lead's own value ('' = none).
     *
     * When the client has a value, a lead with a different one is someone else.
     * When the client has none, the leads can still disagree between themselves,
     * and then there is no telling whose client it is, so nobody is linked.
     */
    function ccrm_backfill_conflicts(string $clientValue, array $leadValues): array {
        if ($clientValue !== '') {
            $bad = [];
            foreach ($leadValues as $id => $value) {
                if ($value !== '' && $value !== $clientValue) $bad[] = $id;
            }
            return $bad;
        }
        $distinct = array_unique(array_filter($leadValues, fn($v) => $v !== ''));
        return count($distinct) >= 2 ? array_keys($leadValues) : [];
    }

    /**
     * @param array $rows each: id, name, email, phone, client_id
     * @return array{links: array<string,string>, already: int, noClient: int, ambiguous: array}
     */
    function ccrm_plan_lead_client_links(array $rows): array {
        $clientsByName = [];
        $leadsByName = [];
        $already = 0;
        foreach ($rows as $r) {
            $id = (string)($r['id'] ?? '');
            $key = ccrm_backfill_name_key($r['name'] ?? '');
            if ($id === '' || $id === 'unassigned-docs' || $key === '') continue;
            if (strpos($id, 'client-') === 0) {
                $clientsByName[$key][] = $r;
                continue;
            }
            if (trim((string)($r['client_id'] ?? '')) !== '') { $already++; continue; }
            $leadsByName[$key][] = $r;
        }

        $links = [];
        $ambiguous = [];
        $noClient = 0;
        foreach ($leadsByName as $key => $leads) {
            $clients = $clientsByName[$key] ?? [];
            $leadIds = array_map(fn($l) => (string)$l['id'], $leads);
            $name = trim((string)$leads[0]['name']);

            if (count($clients) === 0) { $noClient += count($leads); continue; }
            if (count($clients) > 1) {
                $ambiguous[] = [
                    'name' => $name,
                    'reason' => 'several clients share this name',
                    'client_ids' => array_map(fn($c) => (string)$c['id'], $clients),
                    'lead_ids' => $leadIds,
                ];
                continue;
            }

            $client = $clients[0];
            $unsafe = [];
            foreach ([
                'different e-mail addresses under one name' => ['ccrm_backfill_email_key', 'email'],
                'different phone numbers under one name' => ['ccrm_backfill_phone_key', 'phone'],
            ] as $reason => [$normalize, $field]) {
                $values = [];
                foreach ($leads as $l) $values[(string)$l['id']] = $normalize($l[$field] ?? '');
                foreach (ccrm_backfill_conflicts($normalize($client[$field] ?? ''), $values) as $badId) {
                    $unsafe[$badId][] = $reason;
                }
            }

            $byReason = [];
            foreach ($leads as $l) {
                $lid = (string)$l['id'];
                if (isset($unsafe[$lid])) {
                    $byReason[implode('; ', array_unique($unsafe[$lid]))][] = $lid;
                } else {
                    $links[$lid] = (string)$client['id'];
                }
            }
            foreach ($byReason as $reason => $ids) {
                $ambiguous[] = [
                    'name' => $name,
                    'reason' => $reason,
                    'client_ids' => [(string)$client['id']],
                    'lead_ids' => $ids,
                ];
            }
        }

        return ['links' => $links, 'already' => $already, 'noClient' => $noClient, 'ambiguous' => $ambiguous];
    }

    /**
     * Write the links. `updated_at` is left alone on purpose: bumping it would make
     * every open browser's next push of these leads look like a sync conflict.
     */
    function ccrm_backfill_lead_client_ids(PDO $pdo, bool $apply = true): array {
        $rows = $pdo->query("SELECT `id`, `name`, `email`, `phone`, `client_id` FROM `leads`")->fetchAll(PDO::FETCH_ASSOC);
        $plan = ccrm_plan_lead_client_links($rows);

        if ($apply && $plan['links']) {
            $upd = $pdo->prepare("UPDATE `leads` SET `client_id` = ?, `updated_at` = `updated_at` WHERE `id` = ? AND (`client_id` IS NULL OR `client_id` = '')");
            foreach ($plan['links'] as $leadId => $clientId) {
                $upd->execute([$clientId, $leadId]);
            }
        }

        return [
            'applied' => $apply,
            'linked' => count($plan['links']),
            'already_linked' => $plan['already'],
            'no_client_with_that_name' => $plan['noClient'],
            'ambiguous_groups' => $plan['ambiguous'],
            'ran_at' => date('c'),
        ];
    }
}
