<?php
/**
 * Demo module `newsletter` (docs/NEWSLETTER.md C15; runs after `clients`, `employees` and `time`).
 *
 * Writes the newsletter story of Lapidea straight into the three tables of C2 and into the
 * `NEWSLETTER_CONFIG` setting (C3); no API code is involved:
 *
 *  - NEWSLETTER_CONFIG: the stone-toned theme of demo_newsletter_theme(), a header with the brand, the footer with the
 *    demo company's address, sender name = brand, reply-to = the company e-mail. It carries
 *    `"demo": true`, which ccrm_newsletter_normalize_config() drops on the first save in Settings; the wipe
 *    (wipe.php) deletes the setting only while that marker is still there, so a configuration the user edited
 *    is never removed.
 *  - Campaign 1 (sent 20 days ago): the spring remnant-slab sale to the "Trade partners & studios" and
 *    "Commercial & developers" client categories (hotels are a sub-category), 5 clients. Four rows sent, one
 *    failed with `550 mailbox unavailable` (suppressed as bounced), one of the sent ones unsubscribed three days
 *    later (suppressed as unsubscribed).
 *  - Campaign 2 (sent 60 days ago): "Caring for your new worktop" to all six clients, all sent.
 *  - Campaign 3 (draft): the sintered-stone collection to all clients plus leads, a finished body. Without the
 *    bounced, unsubscribed and manually suppressed addresses it resolves to 8 queued addresses, so Hold to send
 *    works in the demo (demo mode never sends; the worker marks the rows sent).
 *  - Suppressions: the bounced and the unsubscribed address above and one manual entry (the lost lead L11).
 *
 * Ids: demo-newsletter-<n> (campaigns). The two other tables have no demo id of their own: recipients carry the
 * campaign id in `campaign_id` (the prefix wipe finds them there), suppressions carry it too, except the manual
 * one, which has no campaign and is removed by its e-mail (see demo_newsletter_manual_emails()). Recipient tokens
 * are deterministic (md5 of campaign and address), so a re-seed gives the same links. Returns the rows inserted.
 *
 * The bodies, header and footer are built from the pack's blocks into an EmailDoc (C6, ids added here), and the
 * sent campaigns get html_snapshot / text_snapshot from demo_newsletter_render_html() / _text(): a DEMO
 * APPROXIMATION of the builder's renderEmail(), not a renderer. The real thing is TypeScript and runs in the
 * browser (docs/NEWSLETTER.md B2.2); the server never renders blocks. Merge tags are left unresolved, as in a
 * real snapshot. The doc check of the API (ccrm_newsletter_check_doc) is run on every doc before it is written.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';
require_once dirname(__DIR__) . '/newsletter_lib.php';
require_once dirname(__DIR__) . '/newsletter_audience.php';   // ccrm_newsletter_first_name(), read-only

if (!function_exists('demo_seed_newsletter')) {

    /** Demo e-mail addresses that carry a manual suppression, of every edition (the lost lead L11), for the wipe. */
    function demo_newsletter_manual_emails(?string $lang = null): array {
        $emails = [];
        foreach ($lang !== null ? [$lang] : demo_pack_languages() as $l) {
            $emails[] = strtolower((string)demo_company_pack($l)['clients']['L11']['email']);
        }
        return array_values(array_unique($emails));
    }

    /** Pack blocks -> EmailBlock[] (C6); every block gets an id, optional fields are kept only when the pack sets them. */
    function demo_newsletter_blocks(array $blocks, string $idPrefix): array {
        $out = [];
        foreach ($blocks as $i => $b) {
            $block = ['id' => $idPrefix . 'b' . ($i + 1)] + $b;
            $out[] = $block;
        }
        return $out;
    }

    /** Pack rows -> EmailDoc (C6). */
    function demo_newsletter_doc(array $rows, string $idPrefix): array {
        $docRows = [];
        foreach ($rows as $r => $row) {
            $rowId = $idPrefix . 'r' . ($r + 1);
            $columns = [];
            foreach ($row['columns'] as $c => $blocks) {
                $colId = $rowId . 'c' . ($c + 1);
                $columns[] = ['id' => $colId, 'blocks' => demo_newsletter_blocks($blocks, $colId)];
            }
            $docRow = ['id' => $rowId, 'layout' => $row['layout'], 'columns' => $columns];
            if (($row['background'] ?? '') !== '') {
                $docRow['background'] = $row['background'];
            }
            $docRows[] = $docRow;
        }
        return ['version' => 1, 'rows' => $docRows];
    }

    /** The columns' share of the content width for a layout ('1-2' = a third and two thirds). */
    function demo_newsletter_layout_parts(string $layout): array {
        return array_map('intval', explode('-', $layout));
    }

    /** One block as e-mail HTML (inline styles, table-based). */
    function demo_newsletter_render_block(array $b, array $theme): string {
        $esc = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $align = in_array($b['align'] ?? 'left', ['left', 'center', 'right'], true) ? ($b['align'] ?? 'left') : 'left';
        $font = $esc((string)$theme['fontFamily']);
        $text = (string)$theme['textColor'];
        switch ($b['type']) {
            case 'heading':
                $level = (int)($b['level'] ?? 2);
                $size = [1 => 28, 2 => 22, 3 => 18][$level] ?? 22;
                $color = $b['color'] ?? $text;
                return "<h{$level} style=\"margin:0 0 10px;font-family:{$font};font-size:{$size}px;line-height:1.25;color:{$color};text-align:{$align};\">{$b['html']}</h{$level}>";
            case 'text':
                $size = (int)($b['fontSize'] ?? 16);
                $color = $b['color'] ?? $text;
                return "<div style=\"margin:0 0 10px;font-family:{$font};font-size:{$size}px;line-height:1.5;color:{$color};text-align:{$align};\">{$b['html']}</div>";
            case 'button':
                $bg = $b['background'] ?? $theme['buttonBackground'];
                $fg = $b['color'] ?? $theme['buttonTextColor'];
                return "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td align=\"{$align}\" style=\"padding:6px 0 14px;\">"
                    . "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td bgcolor=\"{$bg}\" style=\"background:{$bg};border-radius:6px;\">"
                    . "<a href=\"" . $esc((string)$b['href']) . "\" style=\"display:inline-block;padding:12px 24px;font-family:{$font};font-size:16px;font-weight:bold;color:{$fg};text-decoration:none;\">" . $esc((string)$b['label']) . "</a>"
                    . "</td></tr></table></td></tr></table>";
            case 'divider':
                $color = $b['color'] ?? '#e2e8f0';
                return "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td style=\"padding:8px 0;\"><div style=\"border-top:1px solid {$color};font-size:0;line-height:0;\">&nbsp;</div></td></tr></table>";
            case 'social':
                $labels = ['facebook' => ['f', '#1877f2'], 'instagram' => ['IG', '#d6249f'], 'linkedin' => ['in', '#0a66c2'], 'x' => ['X', '#111111'],
                    'youtube' => ['&#9654;', '#ff0000'], 'tiktok' => ['TT', '#111111'], 'website' => ['www', '#64748b']];
                $cells = '';
                foreach ($b['items'] as $item) {
                    [$label, $color] = $labels[$item['network']] ?? ['www', '#64748b'];
                    $cells .= "<td style=\"padding:0 4px;\"><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td width=\"28\" height=\"28\" align=\"center\" bgcolor=\"{$color}\" style=\"background:{$color};border-radius:14px;\">"
                        . "<a href=\"" . $esc((string)$item['url']) . "\" style=\"display:block;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;line-height:28px;color:#ffffff;text-decoration:none;\">{$label}</a></td></tr></table></td>";
                }
                return "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td align=\"{$align}\" style=\"padding:6px 0 10px;\"><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr>{$cells}</tr></table></td></tr></table>";
        }
        return '';
    }

    /**
     * A DEMO APPROXIMATION of renderEmail() (src/components/newsletter/builder/renderEmail.ts), not a renderer:
     * header + body + footer as simple table-based HTML with inline styles, merge tags left as written. Only the
     * blocks the demo packs use are handled (heading, text, button, divider, social).
     *
     * @param array[] $docs EmailDoc list in order (header, body, footer; a switched-off one is left out)
     */
    function demo_newsletter_render_html(array $docs, array $theme, string $subject, string $preheader): string {
        $esc = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $width = (int)$theme['contentWidth'];
        $font = $esc((string)$theme['fontFamily']);
        $rows = '';
        foreach ($docs as $doc) {
            foreach ($doc['rows'] as $row) {
                $parts = demo_newsletter_layout_parts((string)$row['layout']);
                $sum = array_sum($parts) ?: 1;
                $cells = '';
                foreach ($row['columns'] as $i => $col) {
                    $w = (int)round($width * ($parts[$i] ?? 1) / $sum);
                    $inner = '';
                    foreach ($col['blocks'] as $block) {
                        $inner .= demo_newsletter_render_block($block, $theme);
                    }
                    $cells .= "<td width=\"{$w}\" valign=\"top\" style=\"padding:0 16px;\">{$inner}</td>";
                }
                $band = $row['background'] ?? $theme['contentBackground'];
                $rows .= "<tr><td bgcolor=\"{$band}\" style=\"background:{$band};padding:16px 0;\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr>{$cells}</tr></table></td></tr>";
            }
        }
        return "<!doctype html>\n<html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" . $esc($subject) . "</title></head>\n"
            . "<body style=\"margin:0;padding:0;background:{$theme['pageBackground']};font-family:{$font};\">\n"
            . "<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;\">" . $esc($preheader) . "</div>\n"
            . "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" bgcolor=\"{$theme['pageBackground']}\"><tr><td align=\"center\" style=\"padding:24px 8px;\">\n"
            . "<table role=\"presentation\" width=\"{$width}\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;max-width:{$width}px;\">\n{$rows}\n</table>\n</td></tr></table>\n</body></html>";
    }

    /** The plain-text counterpart of demo_newsletter_render_html() (links written as `label (url)`). */
    function demo_newsletter_render_text(array $docs, string $preheader): string {
        $plain = static function (string $html): string {
            $html = preg_replace('/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/su', '$2 ($1)', $html);
            $html = preg_replace('/<li[^>]*>/u', "\n- ", $html);
            $html = preg_replace('/<\/(p|div|ol|ul|h[1-6])>|<br\s*\/?>/u', "\n", $html);
            return trim(preg_replace("/\n{3,}/", "\n\n", html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
        };
        $lines = [$preheader, ''];
        foreach ($docs as $doc) {
            foreach ($doc['rows'] as $row) {
                foreach ($row['columns'] as $col) {
                    foreach ($col['blocks'] as $b) {
                        switch ($b['type']) {
                            case 'heading':
                            case 'text':
                                $lines[] = $plain((string)$b['html']);
                                break;
                            case 'button':
                                $lines[] = $b['label'] . ': ' . $b['href'];
                                break;
                            case 'divider':
                                $lines[] = '----';
                                break;
                            case 'social':
                                $lines[] = implode("\n", array_map(static fn(array $i): string => $i['network'] . ': ' . $i['url'], $b['items']));
                                break;
                        }
                        $lines[] = '';
                    }
                }
            }
        }
        return trim(implode("\n", $lines)) . "\n";
    }

    /** The stone-toned theme of the demo (C3 NewsletterTheme); not in the packs because nothing in it is translated. */
    function demo_newsletter_theme(): array {
        return [
            'contentWidth' => 600,
            'pageBackground' => '#efebe6',
            'contentBackground' => '#ffffff',
            'fontFamily' => "Georgia, 'Times New Roman', serif",
            'textColor' => '#2b2724',
            'linkColor' => '#8a6a43',
            'buttonBackground' => '#8a6a43',
            'buttonTextColor' => '#ffffff',
        ];
    }

    /** The stored NEWSLETTER_CONFIG (C3) for the pack, with the `demo` marker the wipe looks for. */
    function demo_newsletter_config(array $pack, array $header, array $footer, string $replyTo): array {
        return [
            'version' => 1,
            'demo' => true,
            'header' => $header,
            'footer' => $footer,
            'theme' => demo_newsletter_theme(),
            'sender' => ['fromName' => (string)$pack['brand'], 'replyTo' => $replyTo],
            'sending' => ['batchSize' => 40, 'perHourLimit' => 400, 'testRecipients' => []],
        ];
    }

    /** One recipient row of the sent campaigns: the client's own contact and e-mail. */
    function demo_newsletter_recipient(string $campaignId, string $clientRef, array $client): array {
        $email = strtolower(trim((string)$client['email']));
        return [
            'campaign_id' => $campaignId,
            'email' => $email,
            'name' => (string)$client['contact'],
            'source' => 'client',
            'lead_id' => demo_ref_id($clientRef),
            'merge_json' => json_encode([
                'name' => (string)$client['contact'],
                'first_name' => ccrm_newsletter_first_name((string)$client['contact']),
                'company' => (string)$client['name'],
                'email' => $email,
            ], JSON_UNESCAPED_UNICODE),
            'token' => md5($campaignId . '|' . $email),
        ];
    }

    function demo_seed_newsletter(PDO $pdo): int {
        foreach (['newsletter_campaigns', 'newsletter_recipients', 'newsletter_suppressions'] as $table) {
            if (!demo_table_exists($pdo, $table)) {
                return 0; // an install that has not created the module's tables yet: nothing to seed into
            }
        }
        $ctx = demo_ctx($pdo);
        $lang = $ctx['lang'];
        $pack = demo_pack($pdo, 'newsletter');
        $company = demo_company_pack($lang);
        $users = demo_users($pdo);
        $brand = (string)$company['brand'];
        $clientsPack = demo_pack($pdo, 'clients');

        // --- Pack text: demo placeholders and the company address --------------------------------------
        $c = $company['company'];
        $address = trim($c['street'] . ', ' . $c['postalCode'] . ' ' . $c['city'] . ', ' . $c['country']);
        $text = static function ($value) use ($address) {
            $walk = static function ($v) use (&$walk, $address) {
                if (is_string($v)) {
                    return demo_text(str_replace('%address%', $address, $v));
                }
                return is_array($v) ? array_map($walk, $v) : $v;
            };
            return $walk($value);
        };
        $pack['brand'] = $brand;
        $theme = demo_newsletter_theme();
        $header = demo_newsletter_doc($text($pack['header']['rows']), 'nh');
        $footer = demo_newsletter_doc($text($pack['footer']['rows']), 'nf');
        $replyTo = (string)$users['sales']['email'];

        // --- Clean own rows (idempotent) ---------------------------------------------------------------
        $pdo->exec("DELETE FROM `newsletter_recipients` WHERE `campaign_id` LIKE 'demo-newsletter-%'");
        $pdo->exec("DELETE FROM `newsletter_campaigns` WHERE `id` LIKE 'demo-newsletter-%'");
        $pdo->exec("DELETE FROM `newsletter_suppressions` WHERE `campaign_id` LIKE 'demo-newsletter-%'");

        // --- Settings -----------------------------------------------------------------------------------
        $config = demo_newsletter_config($pack, $header, $footer, $replyTo);
        $pdo->prepare(
            "INSERT INTO `system_settings` (`key`, `value`) VALUES ('NEWSLETTER_CONFIG', ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)"
        )->execute([json_encode($config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);

        // --- Customer categories: ids as clients.php gives them (101, 102, ... in pack order) -----------
        $catIds = [];
        $n = 100;
        foreach ($clientsPack['categories'] as $key => $_) {
            $catIds[$key] = demo_id('clients', ++$n);
        }
        $audience = static fn(string $mode, array $categoryIds, bool $leads): string => json_encode([
            'clients' => ['mode' => $mode, 'categoryIds' => $categoryIds, 'clientIds' => []],
            'leads' => ['enabled' => $leads, 'statuses' => [], 'interestCategories' => []],
            'employees' => ['enabled' => false],
            'extra' => ['enabled' => false, 'raw' => ''],
        ], JSON_UNESCAPED_UNICODE);

        // --- Campaigns ----------------------------------------------------------------------------------
        // [pack index, status, audience, days ago started (null = draft), recipients, from name, reply-to, created/updated by]
        $plans = [
            1 => ['status' => 'sent', 'audience' => $audience('pick', [$catIds['trade'], $catIds['commercial']], false), 'start' => -20,
                'clients' => ['C1', 'C3', 'C4', 'C5', 'C6'], 'fromName' => $brand, 'replyTo' => $replyTo, 'by' => $users['sales']['name']],
            2 => ['status' => 'sent', 'audience' => $audience('all', [], false), 'start' => -60,
                'clients' => ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'], 'fromName' => null, 'replyTo' => null, 'by' => $users['owner']['name']],
            3 => ['status' => 'draft', 'audience' => $audience('all', [], true), 'start' => null,
                'clients' => [], 'fromName' => null, 'replyTo' => null, 'by' => $users['sales']['name']],
        ];
        $insCampaign = $pdo->prepare(
            "INSERT INTO `newsletter_campaigns` (`id`, `name`, `subject`, `preheader`, `from_name`, `reply_to`, `audience_json`, `body_json`,
                `use_header`, `use_footer`, `html_snapshot`, `text_snapshot`, `status`, `last_error`, `recipients_total`, `created_by`, `updated_by`,
                `created_at`, `updated_at`, `started_at`, `finished_at`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)"
        );
        $insRecipient = $pdo->prepare(
            "INSERT INTO `newsletter_recipients` (`campaign_id`, `email`, `name`, `source`, `lead_id`, `employee_id`, `merge_json`, `token`, `status`,
                `skip_reason`, `attempts`, `next_attempt_at`, `error`, `sent_at`, `unsubscribed_at`)
             VALUES (?, ?, ?, 'client', ?, NULL, ?, ?, ?, NULL, ?, NULL, ?, ?, ?)"
        );
        $rows = 0;
        $bounced = null;
        $unsubscribed = null;   // [email, campaign id, unsubscribed_at]
        foreach ($plans as $index => $plan) {
            $campaign = $text($pack['campaigns'][$index]);
            $campaignId = demo_id('newsletter', $index);
            $body = demo_newsletter_doc($campaign['rows'], 'n' . $index);
            foreach ([['header', $header], ['footer', $footer], ['body ' . $index, $body]] as [$what, $doc]) {
                ccrm_newsletter_check_doc($doc, $what);   // the API's own check: a malformed demo doc fails the seed
            }
            $isDraft = $plan['start'] === null;
            $started = $isDraft ? null : demo_dt($plan['start'], '10:00');
            $count = count($plan['clients']);
            $lastSent = $isDraft ? null : demo_dt($plan['start'], '10:0' . min(9, $count));
            $html = $isDraft ? null : demo_newsletter_render_html([$header, $body, $footer], $theme, (string)$campaign['subject'], (string)$campaign['preheader']);
            $plain = $isDraft ? null : demo_newsletter_render_text([$header, $body, $footer], (string)$campaign['preheader']);
            $insCampaign->execute([
                $campaignId, $campaign['name'], $campaign['subject'], $campaign['preheader'], $plan['fromName'], $plan['replyTo'], $plan['audience'],
                json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $html, $plain, $plan['status'], $count, $plan['by'], $plan['by'],
                demo_dt(($plan['start'] ?? -3) - 2, '15:30'), $isDraft ? demo_dt(-1, '16:45') : $lastSent, $started, $lastSent,
            ]);
            $rows++;

            foreach ($plan['clients'] as $i => $ref) {
                $r = demo_newsletter_recipient($campaignId, $ref, demo_ref($pdo, $ref));
                $sentAt = demo_dt($plan['start'], sprintf('10:%02d:%02d', $i, 5 + 10 * $i));
                $status = 'sent';
                $error = null;
                $unsubAt = null;
                $attempts = 1;
                if ($index === 1 && $ref === 'C5') {          // the bounce
                    $status = 'failed';
                    $error = '550 mailbox unavailable';
                    $sentAt = null;
                    $bounced = [$r['email'], $campaignId, demo_dt($plan['start'], '10:03:30')];
                }
                if ($index === 1 && $ref === 'C4') {          // unsubscribed three days later
                    $unsubAt = demo_dt($plan['start'] + 3, '08:12');
                    $unsubscribed = [$r['email'], $campaignId, $unsubAt];
                }
                $insRecipient->execute([$campaignId, $r['email'], $r['name'], $r['lead_id'], $r['merge_json'], $r['token'], $status, $attempts, $error, $sentAt, $unsubAt]);
                $rows++;
            }
        }

        // --- Suppressions -------------------------------------------------------------------------------
        $manual = demo_ref($pdo, 'L11');
        $manualEmail = strtolower(trim((string)$manual['email']));
        $notes = $text($pack['notes']);
        $pdo->prepare("DELETE FROM `newsletter_suppressions` WHERE `email` IN (?, ?, ?)")
            ->execute([(string)$bounced[0], (string)$unsubscribed[0], $manualEmail]);
        $insSuppression = $pdo->prepare(
            "INSERT INTO `newsletter_suppressions` (`email`, `reason`, `campaign_id`, `note`, `created_by`, `created_at`) VALUES (?, ?, ?, ?, ?, ?)"
        );
        // created_by NULL = the recipient (unsubscribe link) or the worker (bounce); a person only for the manual entry.
        $insSuppression->execute([$bounced[0], 'bounced', $bounced[1], $notes['bounced'], null, $bounced[2]]);
        $insSuppression->execute([$unsubscribed[0], 'unsubscribed', $unsubscribed[1], $notes['unsubscribed'], null, $unsubscribed[2]]);
        $insSuppression->execute([$manualEmail, 'manual', null, $notes['manual'], $users['sales']['name'], demo_dt(-9, '11:20')]);
        $rows += 3;

        return $rows;
    }
}
