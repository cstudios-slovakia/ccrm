<?php
/**
 * Assertions for the `newsletter` demo module (docs/NEWSLETTER.md C15). Format: header of
 * public/api/demo_seed/index.php, worked example: scripts/demo-assert/company.php.
 *
 * Every EmailDoc is checked with the API's own check (ccrm_newsletter_check_doc) plus the C6 shape rules the
 * server does not enforce (block types of the demo, merge tags, the two links the footer must carry), the stored
 * NEWSLETTER_CONFIG goes through the strict normaliser, and the recipient / suppression rows are checked against
 * each other (counts, timestamps, tokens, who is suppressed and why).
 */
require_once dirname(__DIR__, 2) . '/public/api/newsletter_lib.php';
require_once dirname(__DIR__, 2) . '/public/api/newsletter_audience.php';

return [
    'minRows' => [
        'newsletter_campaigns' => 3,
        'newsletter_recipients' => 11,
        'newsletter_suppressions' => 3,
    ],
    // newsletter_recipients.id is an AUTO_INCREMENT number, not a demo- id.
    'idAllow' => [
        'newsletter_recipients' => '/^\d+$/',
    ],
    'check' => function (DemoFakePdo $db, array $ctx, callable $check): void {
        $lang = $ctx['lang'];
        $campaigns = [];
        foreach ($db->rows('newsletter_campaigns') as $r) $campaigns[$r['id']] = $r;
        $recipients = $db->rows('newsletter_recipients');
        $suppressions = [];
        foreach ($db->rows('newsletter_suppressions') as $r) $suppressions[$r['email']] = $r;
        $config = json_decode((string)($db->settings()['NEWSLETTER_CONFIG'] ?? 'null'), true);

        $check('three campaigns: demo-newsletter-1 and -2 sent, -3 a draft',
            array_keys($campaigns) === ['demo-newsletter-1', 'demo-newsletter-2', 'demo-newsletter-3']
            && $campaigns['demo-newsletter-1']['status'] === 'sent' && $campaigns['demo-newsletter-2']['status'] === 'sent'
            && $campaigns['demo-newsletter-3']['status'] === 'draft', json_encode(array_keys($campaigns)));

        // --- EmailDoc validity (C6) ----------------------------------------------------------------------
        $allowedTypes = ['text', 'heading', 'button', 'divider', 'social'];
        $docErrors = [];
        $docs = ['header' => $config['header'] ?? null, 'footer' => $config['footer'] ?? null];
        foreach ($campaigns as $id => $c) $docs['body ' . $id] = json_decode((string)$c['body_json'], true);
        $usedTypes = [];
        $tagSets = [];
        foreach ($docs as $name => $doc) {
            try {
                ccrm_newsletter_check_doc($doc, $name);
            } catch (\Throwable $e) {
                $docErrors[] = "{$name}: " . $e->getMessage();
                continue;
            }
            $ids = [];
            $layouts = ['1' => 1, '1-1' => 2, '1-2' => 2, '2-1' => 2, '1-1-1' => 3];
            foreach ($doc['rows'] as $row) {
                if (!isset($layouts[$row['layout'] ?? ''])) { $docErrors[] = "{$name}: unknown layout"; continue; }
                if (count($row['columns']) !== $layouts[$row['layout']]) $docErrors[] = "{$name}: row {$row['id']} has the wrong number of columns for {$row['layout']}";
                $ids[] = $row['id'];
                foreach ($row['columns'] as $col) {
                    $ids[] = $col['id'];
                    foreach ($col['blocks'] as $b) {
                        $ids[] = $b['id'];
                        $usedTypes[$b['type']] = true;
                        if (!in_array($b['type'], $allowedTypes, true)) $docErrors[] = "{$name}: block type {$b['type']} is not allowed in the demo";
                        if ($b['type'] === 'heading' && !in_array($b['level'], [1, 2, 3], true)) $docErrors[] = "{$name}: bad heading level";
                        if ($b['type'] === 'button' && !preg_match('#^https?://#', (string)$b['href'])) $docErrors[] = "{$name}: button href is not absolute";
                        if (in_array($b['type'], ['text', 'heading'], true) && $b['html'] === '') $docErrors[] = "{$name}: empty text";
                    }
                }
            }
            if (count($ids) !== count(array_unique($ids))) $docErrors[] = "{$name}: ids are not unique";
            $tagSets[$name] = json_encode($doc, JSON_UNESCAPED_UNICODE);
        }
        $check('header, footer and the three bodies are valid EmailDoc JSON (the API doc check + C6 shape)', !$docErrors && count($docs) === 5, implode("\n", $docErrors));
        $check('the demo uses only text, heading, button, divider and social blocks, and all five at least once',
            count($usedTypes) === 5, implode(',', array_keys($usedTypes)));
        $check('the footer carries {{unsubscribe_url}} and {{view_online_url}}',
            strpos($tagSets['footer'] ?? '', '{{unsubscribe_url}}') !== false && strpos($tagSets['footer'] ?? '', '{{view_online_url}}') !== false);
        $check('no placeholder of the demo or the pack is left in a doc (only {{merge_tags}})',
            !preg_match('/%address%|\{[a-z]+(:[^{}]*)?\}/', implode('', $tagSets)));
        $check('bodies greet with {{first_name|...}} and the footer address is the demo company\'s',
            strpos($tagSets['body demo-newsletter-1'] ?? '', '{{first_name|') !== false
            && strpos($tagSets['footer'] ?? '', demo_company_pack($lang)['company']['street']) !== false);

        // --- NEWSLETTER_CONFIG (C3) ----------------------------------------------------------------------
        $strictOk = true;
        $detail = '';
        try {
            $norm = ccrm_newsletter_normalize_config($config, true);
            $strictOk = $norm['theme'] === demo_newsletter_theme() && $norm['header'] !== null && $norm['footer'] !== null
                && $norm['sender']['fromName'] === demo_company_pack($lang)['brand'];
        } catch (\Throwable $e) {
            $strictOk = false;
            $detail = $e->getMessage();
        }
        $check('NEWSLETTER_CONFIG passes the strict normaliser and keeps the demo theme, header, footer and brand as sender',
            $strictOk && ($config['demo'] ?? null) === true && ($config['version'] ?? null) === 1, $detail);

        // --- sent campaigns -----------------------------------------------------------------------------
        $byCampaign = [];
        foreach ($recipients as $r) $byCampaign[$r['campaign_id']][] = $r;
        $problems = [];
        foreach (['demo-newsletter-1' => 5, 'demo-newsletter-2' => 6] as $id => $total) {
            $c = $campaigns[$id];
            $rows = $byCampaign[$id] ?? [];
            if ((int)$c['recipients_total'] !== $total || count($rows) !== $total) $problems[] = "{$id}: recipients_total {$c['recipients_total']} / rows " . count($rows);
            if (!$c['html_snapshot'] || !$c['text_snapshot']) $problems[] = "{$id}: no snapshot";
            elseif (strpos($c['html_snapshot'], '{{unsubscribe_url}}') === false || strpos($c['text_snapshot'], '{{unsubscribe_url}}') === false) $problems[] = "{$id}: snapshot lost the unsubscribe tag";
            elseif (stripos($c['html_snapshot'], 'CRM') !== false || stripos($c['html_snapshot'], 'Koperniq') !== false) $problems[] = "{$id}: the product name is in the e-mail";
            if (!$c['started_at'] || !$c['finished_at'] || $c['finished_at'] < $c['started_at']) $problems[] = "{$id}: started/finished";
            foreach ($rows as $r) {
                if ($r['sent_at'] !== null && ($r['sent_at'] < $c['started_at'] || $r['sent_at'] > $c['finished_at'])) $problems[] = "{$id}: {$r['email']} sent outside the run";
                if (!preg_match('/^[0-9a-f]{32}$/', (string)$r['token'])) $problems[] = "{$id}: bad token";
                if (!filter_var($r['email'], FILTER_VALIDATE_EMAIL) || $r['email'] !== strtolower($r['email'])) $problems[] = "{$id}: bad address {$r['email']}";
                $mv = json_decode((string)$r['merge_json'], true);
                if (!is_array($mv) || array_keys($mv) !== ['name', 'first_name', 'company', 'email']) $problems[] = "{$id}: merge_json of {$r['email']}";
            }
        }
        $tokens = array_column($recipients, 'token');
        $check('both sent campaigns: totals, snapshots (unsubscribe tag, no product name), timestamps, tokens, merge values are consistent',
            !$problems && count($tokens) === count(array_unique($tokens)), implode("\n", $problems));

        $one = $byCampaign['demo-newsletter-1'] ?? [];
        $failed = array_values(array_filter($one, static fn($r) => $r['status'] === 'failed'));
        $unsub = array_values(array_filter($one, static fn($r) => $r['unsubscribed_at'] !== null));
        $check('campaign 1: one failed row (550 mailbox unavailable, suppressed as bounced), one unsubscribed row (suppressed as unsubscribed), the rest sent',
            count($failed) === 1 && $failed[0]['error'] === '550 mailbox unavailable' && $failed[0]['sent_at'] === null
            && ($suppressions[$failed[0]['email'] ?? '']['reason'] ?? '') === 'bounced'
            && count($unsub) === 1 && ($suppressions[$unsub[0]['email'] ?? '']['reason'] ?? '') === 'unsubscribed'
            && $suppressions[$unsub[0]['email']]['created_at'] === $unsub[0]['unsubscribed_at']
            && count(array_filter($one, static fn($r) => $r['status'] === 'sent')) === 4, json_encode($one));
        $check('campaign 2: all six clients, all sent', count(array_filter($byCampaign['demo-newsletter-2'] ?? [], static fn($r) => $r['status'] === 'sent')) === 6);

        // The audience of campaign 1: the client categories chosen are real ones of the demo and cover exactly its clients.
        $aud = json_decode((string)$campaigns['demo-newsletter-1']['audience_json'], true);
        $catIds = array_column($db->rows('client_categories'), 'id');
        $check('campaign 1 targets existing client categories (trade partners / studios and commercial)',
            ($aud['clients']['mode'] ?? '') === 'pick' && count($aud['clients']['categoryIds']) === 2 && !array_diff($aud['clients']['categoryIds'], $catIds),
            json_encode([$aud, $catIds]));

        // --- suppressions --------------------------------------------------------------------------------
        $reasons = array_count_values(array_column($suppressions, 'reason'));
        $manual = array_values(array_filter($suppressions, static fn($s) => $s['reason'] === 'manual'));
        $check('three suppressions: bounced, unsubscribed and one manual entry made by a person (no campaign)',
            count($suppressions) === 3 && ($reasons['bounced'] ?? 0) === 1 && ($reasons['unsubscribed'] ?? 0) === 1 && ($reasons['manual'] ?? 0) === 1
            && $manual[0]['campaign_id'] === null && $manual[0]['created_by'] !== null
            && $manual[0]['email'] === strtolower(demo_ref_for($lang, 'L11')['email']), json_encode($suppressions));

        // --- the draft (campaign 3) -----------------------------------------------------------------------
        $draft = $campaigns['demo-newsletter-3'];
        $draftAud = json_decode((string)$draft['audience_json'], true);
        $addresses = [];
        foreach (['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] as $ref) $addresses[strtolower(demo_ref_for($lang, $ref)['email'])] = true;
        if (!empty($draftAud['leads']['enabled'])) foreach (['L7', 'L8', 'L9', 'L10', 'L11'] as $ref) $addresses[strtolower(demo_ref_for($lang, $ref)['email'])] = true;
        $queued = array_diff(array_keys($addresses), array_keys($suppressions));
        $check('the draft is a finished body for clients + leads, has no snapshot, and 8 addresses stay after the suppressed ones, so Hold to send works',
            ($draftAud['clients']['mode'] ?? '') === 'all' && ($draftAud['leads']['enabled'] ?? false) === true
            && $draft['html_snapshot'] === null && $draft['started_at'] === null && (int)$draft['recipients_total'] === 0
            && !isset($byCampaign['demo-newsletter-3']) && count($queued) === 8, 'queued: ' . count($queued));
    },
];
