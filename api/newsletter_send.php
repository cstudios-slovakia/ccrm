<?php
/**
 * Newsletter sending engine (docs/NEWSLETTER.md C10): start_send, send_test, pause / resume /
 * cancel and the queue worker ccrm_newsletter_tick(). api/newsletter.php has the thin action
 * handlers; api/cron.php calls the worker. Never called from sync.php.
 *
 * Errors are thrown as ccrm_newsletter_error (the endpoint turns them into the HTTP status + code):
 *   409 not_draft, wrong_status
 *   422 empty_subject, sender_not_configured, missing_unsubscribe, data_url_image, dangerous_url,
 *       html_too_large, no_recipients, invalid_audience, no_test_recipients, invalid_test_recipient,
 *       too_many_test_recipients, base_url_unknown
 *   502 smtp_failed (send_test only; the SMTP server's reply or the connection error)
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/brand.php';
require_once __DIR__ . '/newsletter_audience.php';
require_once __DIR__ . '/newsletter_lib.php';
require_once __DIR__ . '/newsletter_merge.php';
require_once __DIR__ . '/newsletter_mailer.php';

if (!defined('CCRM_NEWSLETTER_MAX_HTML_BYTES')) {
    define('CCRM_NEWSLETTER_MAX_HTML_BYTES', 1048576);
    define('CCRM_NEWSLETTER_MAX_ATTEMPTS', 3);
}

if (!function_exists('ccrm_newsletter_tick')) {

    // -----------------------------------------------------------------------------------
    // Validation (pure)
    // -----------------------------------------------------------------------------------

    /** An attribute value as a browser reads it: entities decoded, control characters and spaces dropped, lower-cased. */
    function ccrm_newsletter_url_scheme_text(string $value): string {
        return strtolower(preg_replace('/[\x00-\x20]+/', '', html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8')));
    }

    /**
     * The checks of C10 that depend only on the rendered e-mail. Defence in depth behind the
     * renderer (builder/renderEmail.ts): an `html` block is the author's own markup.
     *
     * @throws ccrm_newsletter_error missing_unsubscribe | data_url_image | dangerous_url | html_too_large
     */
    function ccrm_newsletter_check_send_html(string $html, string $text): void {
        if (strlen($html) > CCRM_NEWSLETTER_MAX_HTML_BYTES || strlen($text) > CCRM_NEWSLETTER_MAX_HTML_BYTES) {
            throw new ccrm_newsletter_error('html_too_large', 'The e-mail is larger than 1 MB.');
        }
        if (!in_array('unsubscribe_url', ccrm_newsletter_tag_names($html), true)) {
            throw new ccrm_newsletter_error('missing_unsubscribe', 'Every newsletter must contain an unsubscribe link ({{unsubscribe_url}}).');
        }
        if (preg_match('/url\(\s*["\']?\s*data:/i', $html)) {
            throw new ccrm_newsletter_error('data_url_image', 'Images must be uploaded; embedded (data:) images are not allowed.');
        }
        $dangerous = false;
        if (preg_match_all('/\b(href|src)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+))/i', $html, $all, PREG_SET_ORDER)) {
            foreach ($all as $m) {
                $url = ccrm_newsletter_url_scheme_text(($m[2] ?? '') !== '' ? $m[2] : (($m[3] ?? '') !== '' ? $m[3] : ($m[4] ?? '')));
                if (strtolower($m[1]) === 'src' && strncmp($url, 'data:', 5) === 0) {
                    throw new ccrm_newsletter_error('data_url_image', 'Images must be uploaded; embedded (data:) images are not allowed.');
                }
                if (strtolower($m[1]) === 'href' && preg_match('/^(javascript|vbscript|data):/', $url)) {
                    $dangerous = true;
                }
            }
        }
        if ($dangerous) {
            throw new ccrm_newsletter_error('dangerous_url', 'A link uses a javascript:, vbscript: or data: address.');
        }
    }

    /** Plain text from HTML, only when the browser sent none. */
    function ccrm_newsletter_text_from_html(string $html): string {
        $t = preg_replace('#<(style|script|head)\b.*?</\1>#is', '', $html);
        $t = preg_replace('#<br\s*/?>|</(p|div|tr|h[1-6]|li)>#i', "\n", (string)$t);
        return trim(html_entity_decode(strip_tags((string)$t), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }

    // -----------------------------------------------------------------------------------
    // Context
    // -----------------------------------------------------------------------------------

    /** The company's own name for From / {{sender_company}}: the company profile, else the system title, else ''. Never the product name. */
    function ccrm_newsletter_company_name(\PDO $pdo): string {
        try {
            $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'COMPANY_BILLING_SETTINGS'")->fetchColumn();
            $data = is_string($raw) ? json_decode($raw, true) : null;
            $name = is_array($data) ? trim((string)($data['companyName'] ?? '')) : '';
            if ($name !== '') {
                return $name;
            }
        } catch (\Throwable $e) {
        }
        return function_exists('kprnq_system_title_override') ? kprnq_system_title_override($pdo) : '';
    }

    /** The campaign row (not soft-deleted), or a 404; $lock = SELECT ... FOR UPDATE inside a transaction. */
    function ccrm_newsletter_find_campaign(\PDO $pdo, $id, bool $lock = false): array {
        $id = is_string($id) ? trim($id) : '';
        if ($id === '') {
            throw new ccrm_newsletter_error('invalid_input', 'id is required.', 400);
        }
        $stmt = $pdo->prepare("SELECT * FROM `newsletter_campaigns` WHERE `id` = ? AND `deleted_at` IS NULL LIMIT 1" . ($lock ? ' FOR UPDATE' : ''));
        $stmt->execute([$id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            throw new ccrm_newsletter_error('not_found', 'Campaign not found.', 404);
        }
        return $row;
    }

    /** From name, Reply-To: campaign, else settings, else the company name (From only). */
    function ccrm_newsletter_sender_fields(array $row, array $config, string $company): array {
        $fromName = trim((string)($row['from_name'] ?? ''));
        if ($fromName === '') {
            $fromName = trim((string)$config['sender']['fromName']);
        }
        if ($fromName === '') {
            $fromName = $company;
        }
        $replyTo = trim((string)($row['reply_to'] ?? ''));
        if ($replyTo === '') {
            $replyTo = trim((string)$config['sender']['replyTo']);
        }
        return ['fromName' => $fromName, 'replyTo' => $replyTo];
    }

    // -----------------------------------------------------------------------------------
    // start_send
    // -----------------------------------------------------------------------------------

    /**
     * Draft -> sending (C10): validates, freezes the audience into recipient rows and stores the
     * snapshot, all in one transaction with the campaign row locked.
     *
     * @throws ccrm_newsletter_error
     */
    function ccrm_newsletter_start_send(\PDO $pdo, array $body, string $userName): string {
        $html = $body['html'] ?? null;
        $text = $body['text'] ?? '';
        if (!is_string($html) || trim($html) === '' || !is_string($text)) {
            throw new ccrm_newsletter_error('invalid_input', 'html and text are required.', 400);
        }
        $demo = ccrm_newsletter_is_demo($pdo);
        $pdo->beginTransaction();
        try {
            $row = ccrm_newsletter_find_campaign($pdo, $body['id'] ?? '', true);
            if ($row['status'] !== 'draft') {
                throw new ccrm_newsletter_error('not_draft', 'Only a draft can be sent.', 409);
            }
            if (trim((string)$row['subject']) === '') {
                throw new ccrm_newsletter_error('empty_subject', 'The campaign needs a subject.');
            }
            if (!$demo) {
                if (!ccrm_newsletter_sender_info(ccrm_load_integrations_config($pdo))['senderConfigured']) {
                    throw new ccrm_newsletter_error('sender_not_configured', 'The outgoing mail server is not set up (Settings > E-mail > Outgoing).');
                }
                if (ccrm_app_base_url($pdo) === '') {
                    throw new ccrm_newsletter_error('base_url_unknown', 'The address of this installation is not known, so unsubscribe links cannot be built.');
                }
            }
            ccrm_newsletter_check_send_html($html, $text);
            $audience = ccrm_newsletter_normalize_audience(json_decode((string)$row['audience_json'], true));
            if (!ccrm_newsletter_audience_valid($audience)) {
                throw new ccrm_newsletter_error('invalid_audience', 'The audience is not valid.');
            }
            $resolved = ccrm_newsletter_resolve_audience($pdo, $audience);
            if ($resolved['total'] < 1) {
                throw new ccrm_newsletter_error('no_recipients', 'The audience has no address to send to.');
            }

            $chunks = array_chunk($resolved['rows'], 100);
            foreach ($chunks as $chunk) {
                $marks = implode(',', array_fill(0, count($chunk), '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'));
                $args = [];
                foreach ($chunk as $r) {
                    array_push($args,
                        (string)$row['id'], $r['email'], $r['name'] !== null ? mb_substr($r['name'], 0, 255, 'UTF-8') : null, $r['source'],
                        $r['leadId'], $r['employeeId'], json_encode($r['merge'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                        bin2hex(random_bytes(16)), $r['status'], $r['skipReason']);
                }
                $pdo->prepare(
                    "INSERT INTO `newsletter_recipients` (`campaign_id`, `email`, `name`, `source`, `lead_id`, `employee_id`, `merge_json`, `token`, `status`, `skip_reason`)
                     VALUES $marks"
                )->execute($args);
            }
            $now = gmdate('Y-m-d H:i:s');
            $switch = $pdo->prepare(
                "UPDATE `newsletter_campaigns`
                    SET `status` = 'sending', `html_snapshot` = ?, `text_snapshot` = ?, `recipients_total` = ?, `started_at` = ?,
                        `finished_at` = NULL, `last_error` = NULL, `updated_at` = ?, `updated_by` = ?
                  WHERE `id` = ? AND `status` = 'draft'"
            );
            $switch->execute([$html, $text, $resolved['total'], $now, $now, mb_substr($userName, 0, 50, 'UTF-8'), $row['id']]);
            if ($switch->rowCount() !== 1) {
                throw new ccrm_newsletter_error('not_draft', 'Only a draft can be sent.', 409);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        return (string)$row['id'];
    }

    // -----------------------------------------------------------------------------------
    // pause / resume / cancel
    // -----------------------------------------------------------------------------------

    /** Allowed source statuses per action. */
    function ccrm_newsletter_transitions(): array {
        return ['pause' => ['sending'], 'resume' => ['paused'], 'cancel' => ['sending', 'paused']];
    }

    /** @throws ccrm_newsletter_error wrong_status (409) */
    function ccrm_newsletter_transition(\PDO $pdo, string $action, $id, string $userName): string {
        $allowed = ccrm_newsletter_transitions()[$action] ?? null;
        if ($allowed === null) {
            throw new ccrm_newsletter_error('unknown_action', 'Unknown action.', 400);
        }
        $pdo->beginTransaction();
        try {
            $row = ccrm_newsletter_find_campaign($pdo, $id, true);
            if (!in_array($row['status'], $allowed, true)) {
                throw new ccrm_newsletter_error('wrong_status', 'This campaign is ' . $row['status'] . ', so it cannot be ' . ($action === 'pause' ? 'paused' : ($action === 'resume' ? 'resumed' : 'cancelled')) . '.', 409);
            }
            $now = gmdate('Y-m-d H:i:s');
            $by = mb_substr($userName, 0, 50, 'UTF-8');
            if ($action === 'pause') {
                $sql = "UPDATE `newsletter_campaigns` SET `status` = 'paused', `updated_at` = ?, `updated_by` = ? WHERE `id` = ?";
            } elseif ($action === 'resume') {
                $sql = "UPDATE `newsletter_campaigns` SET `status` = 'sending', `last_error` = NULL, `updated_at` = ?, `updated_by` = ? WHERE `id` = ?";
            } else {
                $pdo->prepare("UPDATE `newsletter_recipients` SET `status` = 'cancelled' WHERE `campaign_id` = ? AND `status` = 'queued'")->execute([$row['id']]);
                $sql = "UPDATE `newsletter_campaigns` SET `status` = 'cancelled', `finished_at` = '$now', `updated_at` = ?, `updated_by` = ? WHERE `id` = ?";
            }
            $pdo->prepare($sql)->execute([$now, $by, $row['id']]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        return (string)$row['id'];
    }

    // -----------------------------------------------------------------------------------
    // send_test
    // -----------------------------------------------------------------------------------

    /** Merge values of a test e-mail: the campaign audience's address `sample: { source, id }`, else the sending user. */
    function ccrm_newsletter_test_merge(\PDO $pdo, array $row, $sample, string $userName, string $userEmail): array {
        if (is_array($sample) && isset($sample['source'], $sample['id']) && is_string($sample['source']) && is_scalar($sample['id'])) {
            $audience = ccrm_newsletter_normalize_audience(json_decode((string)$row['audience_json'], true));
            if (ccrm_newsletter_audience_valid($audience)) {
                $id = (string)$sample['id'];
                foreach (ccrm_newsletter_resolve_audience($pdo, $audience)['rows'] as $r) {
                    if ($r['source'] === $sample['source']
                        && ($r['leadId'] === $id || $r['employeeId'] === $id || $r['email'] === ccrm_newsletter_normalize_email($id))) {
                        return $r['merge'];
                    }
                }
            }
        }
        return ccrm_newsletter_merge_values($userName, ccrm_newsletter_first_name($userName), '', $userEmail);
    }

    /**
     * Send the e-mail to up to 5 test addresses (token `test` in both links).
     *
     * @return array{sent: int, demo: bool}
     * @throws ccrm_newsletter_error
     */
    function ccrm_newsletter_send_test(\PDO $pdo, array $body, string $userName, string $userEmail): array {
        $row = ccrm_newsletter_find_campaign($pdo, $body['id'] ?? '');
        $subject = ccrm_newsletter_line($body['subject'] ?? '', 255);
        $html = $body['html'] ?? null;
        $text = $body['text'] ?? '';
        if (!is_string($html) || trim($html) === '' || !is_string($text)) {
            throw new ccrm_newsletter_error('invalid_input', 'html and text are required.', 400);
        }
        if ($subject === '') {
            throw new ccrm_newsletter_error('empty_subject', 'The e-mail needs a subject.');
        }
        $to = is_array($body['to'] ?? null) ? $body['to'] : [];
        if (count($to) > 5) {
            throw new ccrm_newsletter_error('too_many_test_recipients', 'At most 5 test recipients are allowed.');
        }
        $to = ccrm_newsletter_check_address_list($to, 'invalid_test_recipient', 'A test recipient is not a valid e-mail address.');
        if (!$to) {
            throw new ccrm_newsletter_error('no_test_recipients', 'Add at least one test recipient.');
        }
        if (strlen($html) > CCRM_NEWSLETTER_MAX_HTML_BYTES || strlen($text) > CCRM_NEWSLETTER_MAX_HTML_BYTES) {
            throw new ccrm_newsletter_error('html_too_large', 'The e-mail is larger than 1 MB.');
        }
        if (ccrm_newsletter_is_demo($pdo)) {
            return ['sent' => 0, 'demo' => true];
        }
        $integrations = ccrm_load_integrations_config($pdo);
        if (!ccrm_newsletter_sender_info($integrations)['senderConfigured']) {
            throw new ccrm_newsletter_error('sender_not_configured', 'The outgoing mail server is not set up (Settings > E-mail > Outgoing).');
        }
        $base = ccrm_app_base_url($pdo);
        if ($base === '') {
            throw new ccrm_newsletter_error('base_url_unknown', 'The address of this installation is not known, so links cannot be built.');
        }
        $config = ccrm_newsletter_load_config($pdo);
        $company = ccrm_newsletter_company_name($pdo);
        $sender = ccrm_newsletter_sender_fields($row, $config, $company);
        $merge = ccrm_newsletter_test_merge($pdo, $row, $body['sample'] ?? null, $userName, $userEmail);
        if ($text === '') {
            $text = ccrm_newsletter_text_from_html($html);
        }

        $smtp = new ccrm_newsletter_smtp();
        $sent = 0;
        try {
            $profile = ccrm_newsletter_smtp::profile($integrations, (string)($_SERVER['SERVER_NAME'] ?? 'localhost'));
            $smtp->open($profile);
            foreach ($to as $address) {
                $m = $merge;
                if (trim((string)($m['email'] ?? '')) === '') {
                    $m['email'] = $address;
                }
                $values = ccrm_newsletter_values_for($m, '', 'test', $base, $company);
                $message = ccrm_newsletter_build_message([
                    'fromEmail' => $profile['from'], 'fromName' => $sender['fromName'], 'toEmail' => $address, 'toName' => '',
                    'replyTo' => $sender['replyTo'],
                    'subject' => '[Test] ' . ccrm_newsletter_substitute($subject, $values, 'text', 'send'),
                    'text' => ccrm_newsletter_substitute($text, $values, 'text', 'send'),
                    'html' => ccrm_newsletter_substitute($html, $values, 'html', 'send'),
                    'messageId' => ccrm_newsletter_message_id((string)$row['id'], 'test', $profile['from']),
                    'unsubscribeUrl' => $values['unsubscribe_url'], 'campaignId' => (string)$row['id'],
                ]);
                $smtp->send($profile['from'], $address, $message);
                $sent++;
            }
        } catch (ccrm_newsletter_smtp_error $e) {
            throw new ccrm_newsletter_error('smtp_failed', mb_substr($e->getMessage(), 0, 500, 'UTF-8'), 502);
        } finally {
            $smtp->close();
        }
        return ['sent' => $sent, 'demo' => false];
    }

    // -----------------------------------------------------------------------------------
    // Worker
    // -----------------------------------------------------------------------------------

    function ccrm_newsletter_pause_with_error(\PDO $pdo, string $campaignId, string $error): void {
        $pdo->prepare(
            "UPDATE `newsletter_campaigns` SET `status` = 'paused', `last_error` = ?, `updated_at` = ? WHERE `id` = ? AND `status` = 'sending'"
        )->execute([mb_substr($error, 0, 500, 'UTF-8'), gmdate('Y-m-d H:i:s'), $campaignId]);
    }

    /** Still `sending` and not deleted? (pause / cancel / delete can happen during a batch). */
    function ccrm_newsletter_still_sending(\PDO $pdo, string $campaignId): bool {
        $stmt = $pdo->prepare("SELECT 1 FROM `newsletter_campaigns` WHERE `id` = ? AND `status` = 'sending' AND `deleted_at` IS NULL");
        $stmt->execute([$campaignId]);
        return (bool)$stmt->fetchColumn();
    }

    /** A queued row failed for good. */
    function ccrm_newsletter_row_failed(\PDO $pdo, $rowId, int $attempts, string $error): void {
        $pdo->prepare("UPDATE `newsletter_recipients` SET `status` = 'failed', `attempts` = ?, `next_attempt_at` = NULL, `error` = ? WHERE `id` = ?")
            ->execute([$attempts, mb_substr($error, 0, 500, 'UTF-8'), $rowId]);
    }

    /**
     * Process one batch of the oldest `sending` campaign (C10).
     *
     * @param int $budgetSec wall-clock budget (cron 20, the browser's tick 8)
     * @param string|null $baseUrl links base; null = the stored one (no request fallback: cron has no real Host)
     * @return array{worker: string} busy | throttled | idle | ran
     */
    function ccrm_newsletter_tick(\PDO $pdo, int $budgetSec = 20, ?string $baseUrl = null): array {
        $started = microtime(true);
        $find = "SELECT * FROM `newsletter_campaigns` WHERE `status` = 'sending' AND `deleted_at` IS NULL ORDER BY `started_at`, `id` LIMIT 1";
        if (!$pdo->query($find)->fetch(\PDO::FETCH_ASSOC)) {
            return ['worker' => 'idle'];
        }
        if ((int)$pdo->query("SELECT GET_LOCK('ccrm_newsletter_worker', 0)")->fetchColumn() !== 1) {
            return ['worker' => 'busy'];
        }
        @set_time_limit($budgetSec + 45);
        try {
            // Re-read under the lock: another worker may have just finished or paused it.
            $campaign = $pdo->query($find)->fetch(\PDO::FETCH_ASSOC);
            if (!$campaign) {
                return ['worker' => 'idle'];
            }
            return ccrm_newsletter_run_batch($pdo, $campaign, $budgetSec, $started, $baseUrl);
        } finally {
            try {
                $pdo->query("SELECT RELEASE_LOCK('ccrm_newsletter_worker')");
            } catch (\Throwable $e) {
            }
        }
    }

    function ccrm_newsletter_run_batch(\PDO $pdo, array $campaign, int $budgetSec, float $started, ?string $baseUrl): array {
        $id = (string)$campaign['id'];
        $config = ccrm_newsletter_load_config($pdo);
        $recent = $pdo->prepare("SELECT COUNT(*) FROM `newsletter_recipients` WHERE `sent_at` >= ?");
        $recent->execute([gmdate('Y-m-d H:i:s', time() - 3600)]);
        $allowance = $config['sending']['perHourLimit'] - (int)$recent->fetchColumn();
        if ($allowance <= 0) {
            return ['worker' => 'throttled'];
        }
        $now = gmdate('Y-m-d H:i:s');
        $limit = max(1, min($config['sending']['batchSize'], $allowance));
        $stmt = $pdo->prepare(
            "SELECT * FROM `newsletter_recipients`
              WHERE `campaign_id` = ? AND `status` = 'queued' AND (`next_attempt_at` IS NULL OR `next_attempt_at` <= ?)
              ORDER BY `id` LIMIT $limit"
        );
        $stmt->execute([$id, $now]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        $demo = ccrm_newsletter_is_demo($pdo);
        $worked = false;
        if ($rows) {
            $worked = true;
            ccrm_newsletter_send_rows($pdo, $campaign, $config, $rows, $demo, $budgetSec, $started, $baseUrl);
        }
        // Queue empty -> the campaign is done (also covers an audience that was all skipped).
        $left = $pdo->prepare("SELECT COUNT(*) FROM `newsletter_recipients` WHERE `campaign_id` = ? AND `status` = 'queued'");
        $left->execute([$id]);
        if ((int)$left->fetchColumn() === 0) {
            $now = gmdate('Y-m-d H:i:s');
            $pdo->prepare("UPDATE `newsletter_campaigns` SET `status` = 'sent', `finished_at` = ?, `updated_at` = ? WHERE `id` = ? AND `status` = 'sending'")
                ->execute([$now, $now, $id]);
            $worked = true;
        }
        return ['worker' => $worked ? 'ran' : 'idle'];
    }

    function ccrm_newsletter_send_rows(\PDO $pdo, array $campaign, array $config, array $rows, bool $demo, int $budgetSec, float $started, ?string $baseUrl): void {
        $id = (string)$campaign['id'];
        $company = ccrm_newsletter_company_name($pdo);
        $sender = ccrm_newsletter_sender_fields($campaign, $config, $company);
        $integrations = [];
        $profile = null;
        if (!$demo) {
            $integrations = ccrm_load_integrations_config($pdo);
            if (!ccrm_newsletter_sender_info($integrations)['senderConfigured']) {
                ccrm_newsletter_pause_with_error($pdo, $id, 'The outgoing mail server is not set up (Settings > E-mail > Outgoing).');
                return;
            }
            if ($baseUrl === null) {
                $baseUrl = ccrm_app_base_url($pdo, false);
            }
            if ($baseUrl === '') {
                ccrm_newsletter_pause_with_error($pdo, $id, 'The address of this installation is not known, so unsubscribe links cannot be built.');
                return;
            }
        }
        $baseUrl = (string)$baseUrl;

        // Addresses that unsubscribed after the campaign started must not get the next batch.
        $emails = array_map(fn($r) => (string)$r['email'], $rows);
        $suppressed = [];
        $sup = $pdo->prepare("SELECT `email` FROM `newsletter_suppressions` WHERE `email` IN (" . implode(',', array_fill(0, count($emails), '?')) . ")");
        $sup->execute($emails);
        foreach ($sup->fetchAll(\PDO::FETCH_COLUMN) as $e) {
            $suppressed[mb_strtolower((string)$e, 'UTF-8')] = true;
        }

        $subjectTpl = (string)$campaign['subject'];
        $htmlTpl = (string)$campaign['html_snapshot'];
        $textTpl = (string)$campaign['text_snapshot'];
        if ($textTpl === '') {
            $textTpl = ccrm_newsletter_text_from_html($htmlTpl);
        }
        $smtp = null;
        $opened = false;
        $consecutiveTransient = 0;
        try {
            foreach ($rows as $r) {
                if (microtime(true) - $started >= $budgetSec || !ccrm_newsletter_still_sending($pdo, $id)) {
                    break;
                }
                if (isset($suppressed[mb_strtolower((string)$r['email'], 'UTF-8')])) {
                    $pdo->prepare("UPDATE `newsletter_recipients` SET `status` = 'skipped', `skip_reason` = 'unsubscribed', `next_attempt_at` = NULL WHERE `id` = ? AND `status` = 'queued'")
                        ->execute([$r['id']]);
                    continue;
                }
                $merge = json_decode((string)$r['merge_json'], true);
                $values = ccrm_newsletter_values_for(is_array($merge) ? $merge : [], (string)$r['email'], (string)$r['token'], $baseUrl, $company);
                if ($demo) {
                    $pdo->prepare("UPDATE `newsletter_recipients` SET `status` = 'sent', `sent_at` = ?, `error` = NULL, `next_attempt_at` = NULL WHERE `id` = ?")
                        ->execute([gmdate('Y-m-d H:i:s'), $r['id']]);
                    continue;
                }
                try {
                    if ($smtp === null) {
                        $smtp = new ccrm_newsletter_smtp();
                        $profile = ccrm_newsletter_smtp::profile($integrations, (string)($_SERVER['SERVER_NAME'] ?? 'localhost'));
                        $smtp->open($profile);
                        $opened = true;
                    }
                    $message = ccrm_newsletter_build_message([
                        'fromEmail' => $profile['from'], 'fromName' => $sender['fromName'], 'toEmail' => (string)$r['email'], 'toName' => (string)($r['name'] ?? ''),
                        'replyTo' => $sender['replyTo'],
                        'subject' => ccrm_newsletter_substitute($subjectTpl, $values, 'text', 'send'),
                        'text' => ccrm_newsletter_substitute($textTpl, $values, 'text', 'send'),
                        'html' => ccrm_newsletter_substitute($htmlTpl, $values, 'html', 'send'),
                        'messageId' => ccrm_newsletter_message_id($id, (string)$r['id'], $profile['from']),
                        'unsubscribeUrl' => $values['unsubscribe_url'], 'campaignId' => $id,
                    ]);
                    $smtp->send($profile['from'], (string)$r['email'], $message);
                    // Marked sent right after the server accepted it (at-least-once).
                    $pdo->prepare("UPDATE `newsletter_recipients` SET `status` = 'sent', `sent_at` = ?, `error` = NULL, `next_attempt_at` = NULL WHERE `id` = ?")
                        ->execute([gmdate('Y-m-d H:i:s'), $r['id']]);
                    $consecutiveTransient = 0;
                } catch (ccrm_newsletter_smtp_error $e) {
                    if (!$opened) {
                        // The session never opened (incomplete profile, no connection, login refused).
                        ccrm_newsletter_pause_with_error($pdo, $id, $e->getMessage());
                        return;
                    }
                    $stop = ccrm_newsletter_handle_smtp_error($pdo, $id, $r, $e, $consecutiveTransient);
                    if ($stop) {
                        return;
                    }
                }
            }
        } finally {
            if ($smtp !== null) {
                $smtp->close();
            }
        }
    }

    /**
     * Book one SMTP failure for a row (C10 step 4/5). Returns true when the batch must end.
     */
    function ccrm_newsletter_handle_smtp_error(\PDO $pdo, string $campaignId, array $r, ccrm_newsletter_smtp_error $e, int &$consecutiveTransient): bool {
        // Login or sender problems affect every message: pause the campaign, rows untouched.
        if ($e->stage === 'auth' || ($e->stage === 'mail' && !$e->isTransient())) {
            ccrm_newsletter_pause_with_error($pdo, $campaignId, $e->getMessage());
            return true;
        }
        $attempts = (int)$r['attempts'] + 1;
        if ($e->isTransient()) {
            $consecutiveTransient++;
            if ($attempts >= CCRM_NEWSLETTER_MAX_ATTEMPTS) {
                ccrm_newsletter_row_failed($pdo, $r['id'], $attempts, $e->getMessage());
            } else {
                $pdo->prepare("UPDATE `newsletter_recipients` SET `attempts` = ?, `next_attempt_at` = ?, `error` = ? WHERE `id` = ?")
                    ->execute([$attempts, gmdate('Y-m-d H:i:s', time() + 300 * $attempts), mb_substr($e->getMessage(), 0, 500, 'UTF-8'), $r['id']]);
            }
            // A dropped connection ends the batch; so do three transient errors in a row.
            return $e->dropped || $consecutiveTransient >= 3;
        }
        ccrm_newsletter_row_failed($pdo, $r['id'], $attempts, $e->getMessage());
        if ($e->isHardBounce()) {
            $pdo->prepare(
                "INSERT IGNORE INTO `newsletter_suppressions` (`email`, `reason`, `campaign_id`, `note`, `created_by`, `created_at`) VALUES (?, 'bounced', ?, ?, NULL, ?)"
            )->execute([mb_strtolower((string)$r['email'], 'UTF-8'), $campaignId, mb_substr($e->getMessage(), 0, 255, 'UTF-8'), gmdate('Y-m-d H:i:s')]);
        }
        return false;
    }

    /** The CampaignProgress of C4 for a campaign id, or null. */
    function ccrm_newsletter_progress(\PDO $pdo, string $id): ?array {
        $stmt = $pdo->prepare("SELECT `id`, `status`, `last_error`, `finished_at` FROM `newsletter_campaigns` WHERE `id` = ? AND `deleted_at` IS NULL");
        $stmt->execute([$id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }
        return [
            'id' => (string)$row['id'],
            'status' => (string)$row['status'],
            'counts' => ccrm_newsletter_counts($pdo, [$id])[$id],
            'lastError' => $row['last_error'] !== null && $row['last_error'] !== '' ? (string)$row['last_error'] : null,
            'finishedAt' => ccrm_newsletter_iso($row['finished_at']),
        ];
    }
}
