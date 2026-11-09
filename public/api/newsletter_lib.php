<?php
/**
 * Newsletter: shared server logic for api/newsletter.php (and, later, the send engine and the
 * public pages): settings (`NEWSLETTER_CONFIG`, docs/NEWSLETTER.md C3), campaign JSON shapes (C4),
 * the e-mail document check (C6) and uploaded images.
 *
 * Pure helpers (config, doc, image names) take no PDO so scripts/test-newsletter.php can run them.
 * Validation failures throw ccrm_newsletter_error; the endpoint turns them into 422 responses.
 */

if (!class_exists('ccrm_newsletter_error')) {
    class ccrm_newsletter_error extends \RuntimeException {
        /** @var string */
        public $errorCode;
        /** @var int */
        public $httpStatus;
        public function __construct(string $errorCode, string $message, int $httpStatus = 422) {
            parent::__construct($message);
            $this->errorCode = $errorCode;
            $this->httpStatus = $httpStatus;
        }
    }
}

if (!function_exists('ccrm_newsletter_default_config')) {

    function ccrm_newsletter_default_theme(): array {
        return [
            'contentWidth' => 600,
            'pageBackground' => '#f1f5f9',
            'contentBackground' => '#ffffff',
            'fontFamily' => 'Arial, Helvetica, sans-serif',
            'textColor' => '#1e293b',
            'linkColor' => '#2563eb',
            'buttonBackground' => '#2563eb',
            'buttonTextColor' => '#ffffff',
        ];
    }

    /** C3 defaults: used when NEWSLETTER_CONFIG is missing and to fill gaps in a stored one. */
    function ccrm_newsletter_default_config(): array {
        return [
            'version' => 1,
            'header' => null,
            'footer' => null,
            'theme' => ccrm_newsletter_default_theme(),
            'sender' => ['fromName' => '', 'replyTo' => ''],
            'sending' => ['batchSize' => 40, 'perHourLimit' => 400, 'testRecipients' => []],
        ];
    }

    function ccrm_newsletter_clamp_int($v, int $min, int $max, int $default): int {
        if (!is_numeric($v)) {
            return $default;
        }
        return max($min, min($max, (int)round((float)$v)));
    }

    /** `#rgb` / `#rrggbb` (any case) -> `#rrggbb`; anything else -> the default. */
    function ccrm_newsletter_color($v, string $default): string {
        if (is_string($v) && preg_match('/^#([0-9a-fA-F]{3})$/', trim($v), $m)) {
            $h = strtolower($m[1]);
            return '#' . $h[0] . $h[0] . $h[1] . $h[1] . $h[2] . $h[2];
        }
        if (is_string($v) && preg_match('/^#[0-9a-fA-F]{6}$/', trim($v))) {
            return strtolower(trim($v));
        }
        return $default;
    }

    /** A font stack is pasted into a style attribute by the renderer: letters, digits, space , ' " - only. */
    function ccrm_newsletter_font_family($v, string $default): string {
        if (!is_string($v)) {
            return $default;
        }
        $v = trim($v);
        if ($v === '' || strlen($v) > 200 || !preg_match('/^[A-Za-z0-9 ,\'"\-]+$/', $v)) {
            return $default;
        }
        return $v;
    }

    /** Single-line text, at most $max characters. */
    function ccrm_newsletter_line($v, int $max): string {
        $s = trim(preg_replace('/[\r\n\t]+/', ' ', is_scalar($v) ? (string)$v : ''));
        return mb_substr($s, 0, $max, 'UTF-8');
    }

    /**
     * An EmailDoc (C6): `{ version: 1, rows: [...] }`. Blocks are not validated here: the server
     * never renders them (B2.2), it stores them for the builder. Returns the doc, or null for null.
     *
     * @throws ccrm_newsletter_error code `invalid_doc` / `doc_too_large`
     */
    function ccrm_newsletter_check_doc($doc, string $what) {
        if ($doc === null) {
            return null;
        }
        if (!is_array($doc) || ($doc['version'] ?? null) !== 1 || !isset($doc['rows']) || !is_array($doc['rows'])
            || ($doc['rows'] !== [] && array_keys($doc['rows']) !== range(0, count($doc['rows']) - 1))) {
            throw new ccrm_newsletter_error('invalid_doc', "The $what is not a valid e-mail document (version 1 with a list of rows).");
        }
        if (count($doc['rows']) > 300) {
            throw new ccrm_newsletter_error('doc_too_large', "The $what has too many rows.");
        }
        $encoded = json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($encoded === false) {
            throw new ccrm_newsletter_error('invalid_doc', "The $what contains text that is not valid UTF-8.");
        }
        if (strlen($encoded) > 2000000) {
            throw new ccrm_newsletter_error('doc_too_large', "The $what is too large.");
        }
        return $doc;
    }

    /** @return string[] valid, unique, lower-cased addresses (max 5 kept by the caller) */
    function ccrm_newsletter_check_address_list($raw, string $errorCode, string $message): array {
        $out = [];
        foreach (is_array($raw) ? $raw : [] as $item) {
            $email = ccrm_newsletter_normalize_email(is_scalar($item) ? (string)$item : '');
            if ($email === '') {
                continue;
            }
            if (!ccrm_newsletter_is_valid_email($email)) {
                throw new ccrm_newsletter_error($errorCode, $message);
            }
            $out[$email] = true;
        }
        return array_keys($out);
    }

    /**
     * Normalise a NEWSLETTER_CONFIG (C3): numbers clamped, colours `#rrggbb`, docs null or
     * version 1, gaps filled from the defaults.
     *
     * $strict (settings_save): an invalid document, reply-to or test recipient throws instead of
     * being dropped. Loading a stored config is lenient so one bad value never locks the module.
     *
     * @throws ccrm_newsletter_error
     */
    function ccrm_newsletter_normalize_config($raw, bool $strict = false): array {
        $cfg = ccrm_newsletter_default_config();
        if (!is_array($raw)) {
            return $cfg;
        }
        foreach (['header', 'footer'] as $slot) {
            try {
                $cfg[$slot] = ccrm_newsletter_check_doc($raw[$slot] ?? null, $slot);
            } catch (ccrm_newsletter_error $e) {
                if ($strict) {
                    throw $e;
                }
                $cfg[$slot] = null;
            }
        }

        $d = ccrm_newsletter_default_theme();
        $t = is_array($raw['theme'] ?? null) ? $raw['theme'] : [];
        $cfg['theme'] = [
            'contentWidth' => ccrm_newsletter_clamp_int($t['contentWidth'] ?? null, 520, 800, $d['contentWidth']),
            'pageBackground' => ccrm_newsletter_color($t['pageBackground'] ?? null, $d['pageBackground']),
            'contentBackground' => ccrm_newsletter_color($t['contentBackground'] ?? null, $d['contentBackground']),
            'fontFamily' => ccrm_newsletter_font_family($t['fontFamily'] ?? null, $d['fontFamily']),
            'textColor' => ccrm_newsletter_color($t['textColor'] ?? null, $d['textColor']),
            'linkColor' => ccrm_newsletter_color($t['linkColor'] ?? null, $d['linkColor']),
            'buttonBackground' => ccrm_newsletter_color($t['buttonBackground'] ?? null, $d['buttonBackground']),
            'buttonTextColor' => ccrm_newsletter_color($t['buttonTextColor'] ?? null, $d['buttonTextColor']),
        ];

        $s = is_array($raw['sender'] ?? null) ? $raw['sender'] : [];
        $replyTo = ccrm_newsletter_normalize_email(ccrm_newsletter_line($s['replyTo'] ?? '', 190));
        if ($replyTo !== '' && !ccrm_newsletter_is_valid_email($replyTo)) {
            if ($strict) {
                throw new ccrm_newsletter_error('invalid_reply_to', 'The reply-to address is not a valid e-mail address.');
            }
            $replyTo = '';
        }
        $cfg['sender'] = ['fromName' => ccrm_newsletter_line($s['fromName'] ?? '', 150), 'replyTo' => $replyTo];

        $x = is_array($raw['sending'] ?? null) ? $raw['sending'] : [];
        try {
            $tests = ccrm_newsletter_check_address_list($x['testRecipients'] ?? [], 'invalid_test_recipient', 'A test recipient is not a valid e-mail address.');
        } catch (ccrm_newsletter_error $e) {
            if ($strict) {
                throw $e;
            }
            $tests = [];
        }
        if (count($tests) > 5) {
            if ($strict) {
                throw new ccrm_newsletter_error('too_many_test_recipients', 'At most 5 test recipients are allowed.');
            }
            $tests = array_slice($tests, 0, 5);
        }
        $cfg['sending'] = [
            'batchSize' => ccrm_newsletter_clamp_int($x['batchSize'] ?? null, 10, 200, 40),
            'perHourLimit' => ccrm_newsletter_clamp_int($x['perHourLimit'] ?? null, 10, 10000, 400),
            'testRecipients' => $tests,
        ];
        return $cfg;
    }

    function ccrm_newsletter_load_config(\PDO $pdo): array {
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'NEWSLETTER_CONFIG'");
            $stmt->execute();
            $raw = $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return ccrm_newsletter_default_config();
        }
        $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
        return ccrm_newsletter_normalize_config($decoded, false);
    }

    function ccrm_newsletter_save_config(\PDO $pdo, array $config): void {
        $json = json_encode($config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $pdo->prepare(
            "INSERT INTO `system_settings` (`key`, `value`) VALUES ('NEWSLETTER_CONFIG', ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)"
        )->execute([$json]);
    }

    /**
     * The system outbound mail profile (Settings > E-mail > Outgoing): which address newsletters
     * are sent from, and whether the profile is complete enough to send at all.
     *
     * @param array $integrations ccrm_load_integrations_config()
     * @return array{senderEmail: string, senderConfigured: bool}
     */
    function ccrm_newsletter_sender_info(array $integrations): array {
        $provider = $integrations['emailProvider'] ?? ($integrations['provider'] ?? 'smtp');
        if ($provider === 'exchange') {
            $configured = ($integrations['exchMailbox'] ?? '') !== '' && ($integrations['exchPassword'] ?? '') !== '';
            $fallback = (string)($integrations['exchMailbox'] ?? '');
        } else {
            $configured = ($integrations['smtpHost'] ?? '') !== '' && (int)($integrations['smtpPort'] ?? 0) > 0;
            $fallback = (string)($integrations['smtpUser'] ?? '');
        }
        $email = trim((string)($integrations['senderEmail'] ?? ''));
        if ($email === '') {
            $email = trim($fallback);
        }
        return ['senderEmail' => $email, 'senderConfigured' => $configured && ccrm_newsletter_is_valid_email(mb_strtolower($email, 'UTF-8'))];
    }

    // -----------------------------------------------------------------------------------
    // Campaign JSON (C4)
    // -----------------------------------------------------------------------------------

    function ccrm_newsletter_iso(?string $utc): ?string {
        if ($utc === null || $utc === '') {
            return null;
        }
        try {
            return (new \DateTimeImmutable($utc, new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s\Z');
        } catch (\Throwable $e) {
            return null;
        }
    }

    function ccrm_newsletter_new_id(): string {
        return 'nlc-' . bin2hex(random_bytes(8));
    }

    function ccrm_newsletter_empty_counts(): array {
        return ['total' => 0, 'queued' => 0, 'sent' => 0, 'failed' => 0, 'skipped' => 0, 'cancelled' => 0, 'unsubscribed' => 0];
    }

    /**
     * Counts (C4) of several campaigns in one query.
     *
     * @param string[] $ids
     * @return array<string, array> campaign id => Counts
     */
    function ccrm_newsletter_counts(\PDO $pdo, array $ids): array {
        $out = [];
        foreach ($ids as $id) {
            $out[$id] = ccrm_newsletter_empty_counts();
        }
        if (!$ids) {
            return $out;
        }
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare(
            "SELECT `campaign_id`, `status`, COUNT(*) AS c, SUM(`unsubscribed_at` IS NOT NULL) AS u
               FROM `newsletter_recipients` WHERE `campaign_id` IN ($marks) GROUP BY `campaign_id`, `status`"
        );
        $stmt->execute(array_values($ids));
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $id = (string)$r['campaign_id'];
            $n = (int)$r['c'];
            $out[$id]['total'] += $n;
            $out[$id]['unsubscribed'] += (int)$r['u'];
            if (isset($out[$id][$r['status']])) {
                $out[$id][$r['status']] += $n;
            }
        }
        return $out;
    }

    function ccrm_newsletter_summary_json(array $row, array $counts): array {
        $audience = json_decode((string)$row['audience_json'], true);
        return [
            'id' => (string)$row['id'],
            'name' => (string)$row['name'],
            'subject' => (string)$row['subject'],
            'status' => (string)$row['status'],
            'audience' => ccrm_newsletter_normalize_audience($audience),
            'counts' => $counts,
            'lastError' => $row['last_error'] !== null && $row['last_error'] !== '' ? (string)$row['last_error'] : null,
            'createdBy' => $row['created_by'] !== null ? (string)$row['created_by'] : null,
            'createdAt' => ccrm_newsletter_iso($row['created_at']),
            'updatedAt' => ccrm_newsletter_iso($row['updated_at']),
            'startedAt' => ccrm_newsletter_iso($row['started_at']),
            'finishedAt' => ccrm_newsletter_iso($row['finished_at']),
        ];
    }

    function ccrm_newsletter_campaign_json(array $row, array $counts): array {
        $body = $row['body_json'] !== null && $row['body_json'] !== '' ? json_decode((string)$row['body_json'], true) : null;
        return ccrm_newsletter_summary_json($row, $counts) + [
            'preheader' => (string)($row['preheader'] ?? ''),
            'fromName' => $row['from_name'] !== null ? (string)$row['from_name'] : null,
            'replyTo' => $row['reply_to'] !== null ? (string)$row['reply_to'] : null,
            'body' => is_array($body) ? $body : null,
            'useHeader' => (bool)(int)$row['use_header'],
            'useFooter' => (bool)(int)$row['use_footer'],
            'htmlSnapshot' => $row['status'] !== 'draft' && $row['html_snapshot'] !== null ? (string)$row['html_snapshot'] : null,
        ];
    }

    /**
     * Validate an `update` patch (draft campaigns only) into column => value. Only known keys are
     * read. A bad value throws `invalid_input`-style 422 errors.
     *
     * @return array<string, mixed>
     * @throws ccrm_newsletter_error
     */
    function ccrm_newsletter_patch_columns(array $patch): array {
        $cols = [];
        if (array_key_exists('name', $patch)) {
            $name = ccrm_newsletter_line($patch['name'], 200);
            if ($name === '') {
                throw new ccrm_newsletter_error('invalid_name', 'The campaign needs a name.');
            }
            $cols['name'] = $name;
        }
        if (array_key_exists('subject', $patch)) {
            $cols['subject'] = ccrm_newsletter_line($patch['subject'], 255);
        }
        if (array_key_exists('preheader', $patch)) {
            $p = ccrm_newsletter_line($patch['preheader'], 255);
            $cols['preheader'] = $p !== '' ? $p : null;
        }
        if (array_key_exists('fromName', $patch)) {
            $f = ccrm_newsletter_line($patch['fromName'], 150);
            $cols['from_name'] = $f !== '' ? $f : null;
        }
        if (array_key_exists('replyTo', $patch)) {
            $r = ccrm_newsletter_normalize_email(ccrm_newsletter_line($patch['replyTo'], 190));
            if ($r !== '' && !ccrm_newsletter_is_valid_email($r)) {
                throw new ccrm_newsletter_error('invalid_reply_to', 'The reply-to address is not a valid e-mail address.');
            }
            $cols['reply_to'] = $r !== '' ? $r : null;
        }
        if (array_key_exists('audience', $patch)) {
            $cols['audience_json'] = json_encode(ccrm_newsletter_normalize_audience($patch['audience']), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        if (array_key_exists('body', $patch)) {
            $doc = ccrm_newsletter_check_doc($patch['body'], 'body');
            $cols['body_json'] = $doc === null ? null : json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        if (array_key_exists('useHeader', $patch)) {
            $cols['use_header'] = !empty($patch['useHeader']) ? 1 : 0;
        }
        if (array_key_exists('useFooter', $patch)) {
            $cols['use_footer'] = !empty($patch['useFooter']) ? 1 : 0;
        }
        return $cols;
    }

    // -----------------------------------------------------------------------------------
    // Uploaded images
    // -----------------------------------------------------------------------------------

    /** Real (sniffed) MIME type -> the only extensions we store. */
    function ccrm_newsletter_image_types(): array {
        return ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'];
    }

    function ccrm_newsletter_image_max_bytes(): int {
        return 5 * 1024 * 1024;
    }

    /** Directory (with trailing slash) of this month's images under the uploads dir. */
    function ccrm_newsletter_image_dir(string $uploadsDir, ?int $now = null): string {
        return rtrim($uploadsDir, '/\\') . '/newsletter/' . gmdate('Y', $now ?? time()) . '/' . gmdate('m', $now ?? time()) . '/';
    }

    /** `<uploads>/newsletter/YYYY/MM/<32 random hex>.<ext>` relative to the uploads dir, or null for an unknown MIME. */
    function ccrm_newsletter_image_relative_path(string $mime, ?int $now = null): ?string {
        $types = ccrm_newsletter_image_types();
        if (!isset($types[$mime])) {
            return null;
        }
        return 'newsletter/' . gmdate('Y', $now ?? time()) . '/' . gmdate('m', $now ?? time()) . '/' . bin2hex(random_bytes(16)) . '.' . $types[$mime];
    }

    /** The last $limit images, newest first. */
    function ccrm_newsletter_list_images(string $uploadsDir, string $baseUrl, int $limit = 200): array {
        $root = rtrim($uploadsDir, '/\\') . '/newsletter/';
        $files = [];
        foreach (ccrm_newsletter_image_types() as $ext) {
            foreach (glob($root . '*/*/*.' . $ext) ?: [] as $path) {
                $files[] = [$path, (int)@filemtime($path)];
            }
        }
        usort($files, fn($a, $b) => $b[1] <=> $a[1] ?: strcmp($a[0], $b[0]));
        $out = [];
        foreach (array_slice($files, 0, $limit) as [$path, $mtime]) {
            $rel = substr(str_replace('\\', '/', $path), strlen(str_replace('\\', '/', $root)));
            $out[] = [
                'url' => rtrim($baseUrl, '/') . '/uploads/newsletter/' . $rel,
                'name' => basename($path),
                'size' => (int)@filesize($path),
                'uploadedAt' => gmdate('Y-m-d\TH:i:s\Z', $mtime),
            ];
        }
        return $out;
    }
}
