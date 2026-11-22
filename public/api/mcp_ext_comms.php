<?php
/**
 * CCRM MCP Server Extensions — Mail Reading, WhatsApp Links, Custom Dashboards,
 * Marketing ROI, AI Usage, Social Read & Admin-Only Diagnostics.
 *
 * Enforces Option A (safe read-only email / social access; zero live email dispatch,
 * zero secret/credential exposure) and admin-only diagnostics (`list_audit_logs`,
 * `list_error_logs`, `get_vector_index_status`). Included by mcp.php.
 */

require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/newsletter_lib.php';

/**
 * Permissions for comms, analytics & diagnostic MCP tools, merged into mcp_tool_permissions().
 */
function mcp_ext_comms_permissions(): array {
    return [
        // Email read (Option A)
        'list_mail_accounts'      => ['view' => ['email']],
        'list_emails'             => ['view' => ['email']],
        'get_email'               => ['view' => ['email']],
        // WhatsApp links
        'list_whatsapp_links'     => ['view' => ['whatsapp']],
        'set_whatsapp_link'       => ['edit' => ['whatsapp']],
        // Custom dashboards
        'list_custom_dashboards'  => ['view' => ['dashboard.custom']],
        'get_custom_dashboard'    => ['view' => ['dashboard.custom']],
        'update_custom_dashboard' => ['edit' => ['dashboard.custom']],
        // Marketing ROI & AI usage
        'get_marketing_roi'       => ['any' => ['overview', 'general_config']],
        'set_marketing_roi'       => ['edit' => ['general_config']],
        'get_ai_usage_summary'    => ['view' => ['ai_config']],
        // Social Media (Zernio read-only)
        'list_social_accounts'    => ['view' => ['social_media']],
        'list_social_posts'       => ['view' => ['social_media']],
        'get_social_analytics'    => ['view' => ['social_media']],
        // Admin-only diagnostic read tools
        'list_audit_logs'         => ['admin' => true],
        'list_error_logs'         => ['admin' => true],
        'get_vector_index_status' => ['admin' => true],
    ];
}

/**
 * Tool definitions for comms, analytics & diagnostic MCP tools.
 * Each entry places `'name'` immediately before `'description'`.
 */
function mcp_get_comms_tool_definitions(): array {
    return [
        [
            'name' => 'list_mail_accounts',
            'description' => 'List mailbox accounts accessible to the caller (own personal email profile status + active company mailboxes without credentials or secrets).',
            'inputSchema' => ['type' => 'object', 'properties' => new \stdClass()],
        ],
        [
            'name' => 'list_emails',
            'description' => 'Read cached/synced email envelopes (subject, sender, recipient, date, folder, preview) for the caller\'s own mailbox (u:<email>) or a company mailbox (c:<id>). Option A read-only; no send tool.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'mailbox_key' => ['type' => 'string', 'description' => 'Mailbox key (e.g. u:user@example.com or c:<company_mailbox_id>); omit for caller mailbox and company mailboxes'],
                    'folder' => ['type' => 'string', 'description' => 'Folder name filter (e.g. INBOX, Sent)'],
                    'is_outgoing' => ['type' => 'boolean', 'description' => 'Filter incoming (false) vs outgoing (true)'],
                    'q' => ['type' => 'string', 'description' => 'Substring search across subject, from_name, from_address, to_address, preview'],
                    'limit' => ['type' => 'integer', 'description' => 'Max rows to return (default 50, max 200)'],
                    'offset' => ['type' => 'integer', 'description' => 'Pagination offset (default 0)'],
                ],
            ],
        ],
        [
            'name' => 'get_email',
            'description' => 'Fetch a single cached email envelope plus its filed body, attachments metadata, and AI summary (if cached) by event_id or (mailbox_key + uid [+ folder]).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'event_id' => ['type' => 'string', 'description' => 'Timeline event ID linked to mail_envelopes'],
                    'mailbox_key' => ['type' => 'string', 'description' => 'Mailbox key (required with uid)'],
                    'uid' => ['type' => 'integer', 'description' => 'Mailbox UID (use with mailbox_key)'],
                    'folder' => ['type' => 'string', 'description' => 'Optional folder name when uid exists in multiple folders'],
                ],
            ],
        ],
        [
            'name' => 'list_whatsapp_links',
            'description' => 'List WhatsApp conversation-to-CRM links (leads or projects mapped to WhatsApp chats).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'entity_type' => ['type' => 'string', 'enum' => ['lead', 'project'], 'description' => 'Filter by linked entity type'],
                    'entity_id' => ['type' => 'string', 'description' => 'Filter by linked lead or project ID'],
                    'conversation_ref' => ['type' => 'string', 'description' => 'Filter by WhatsApp conversation reference'],
                    'limit' => ['type' => 'integer', 'description' => 'Max rows to return (default 50, max 200)'],
                    'offset' => ['type' => 'integer', 'description' => 'Pagination offset (default 0)'],
                ],
            ],
        ],
        [
            'name' => 'set_whatsapp_link',
            'description' => 'Create or update a WhatsApp conversation link to an existing CRM lead or project.',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['conversation_ref', 'entity_type', 'entity_id'],
                'properties' => [
                    'conversation_ref' => ['type' => 'string', 'description' => 'WhatsApp conversation reference ID'],
                    'entity_type' => ['type' => 'string', 'enum' => ['lead', 'project'], 'description' => 'Linked CRM entity type'],
                    'entity_id' => ['type' => 'string', 'description' => 'Target lead or project ID'],
                    'client_id' => ['type' => 'string', 'description' => 'Integration client ID (defaults to active WhatsApp connector client)'],
                    'source' => ['type' => 'string', 'enum' => ['auto', 'manual'], 'description' => 'Link source (default manual)'],
                    'title' => ['type' => 'string', 'description' => 'Optional display title (defaults to entity name)'],
                    'is_group' => ['type' => 'boolean', 'description' => 'Whether chat is a group conversation'],
                    'phone' => ['type' => 'string', 'description' => 'Optional digits-only phone identifier'],
                    'path' => ['type' => 'string', 'description' => 'Optional chat path (defaults to /c/<conversation_ref>)'],
                    'last_message_at' => ['type' => 'string', 'description' => 'Optional ISO timestamp of latest message'],
                ],
            ],
        ],
        [
            'name' => 'list_custom_dashboards',
            'description' => 'List custom BI dashboards configured in the workspace.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'include_archived' => ['type' => 'boolean', 'description' => 'Include archived dashboards (default false)'],
                    'limit' => ['type' => 'integer', 'description' => 'Max rows to return (default 50, max 200)'],
                    'offset' => ['type' => 'integer', 'description' => 'Pagination offset (default 0)'],
                ],
            ],
        ],
        [
            'name' => 'get_custom_dashboard',
            'description' => 'Get a custom BI dashboard by ID including its prompts and layout configuration.',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['id'],
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Custom dashboard ID'],
                ],
            ],
        ],
        [
            'name' => 'update_custom_dashboard',
            'description' => 'Update a custom BI dashboard (name, icon, color, prompts, layout, active_model) or toggle archived=true/false.',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['id'],
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Custom dashboard ID'],
                    'name' => ['type' => 'string'],
                    'icon' => ['type' => 'string'],
                    'color' => ['type' => 'string'],
                    'active_model' => ['type' => 'string'],
                    'prompts' => ['type' => 'array', 'items' => ['type' => 'object'], 'description' => 'Replacement prompts JSON array'],
                    'layout' => ['type' => 'object', 'description' => 'Replacement layout configuration'],
                    'archived' => ['type' => 'boolean', 'description' => 'Set true to archive or false to restore'],
                ],
            ],
        ],
        [
            'name' => 'get_marketing_roi',
            'description' => 'Get Marketing ROI attribution configuration and (when permitted) sent newsletter campaign touchpoints.',
            'inputSchema' => ['type' => 'object', 'properties' => new \stdClass()],
        ],
        [
            'name' => 'set_marketing_roi',
            'description' => 'Update Marketing ROI configuration (cost category IDs, source-to-channel mapping, newsletter attribution window days).',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['config'],
                'properties' => [
                    'config' => [
                        'type' => 'object',
                        'description' => '{ newsletterCostCategoryIds?: string[], socialCostCategoryIds?: string[], sourceChannels?: Record<string, "social"|"meta_ads"|"google_ads">, newsletterWindowDays?: number }',
                    ],
                ],
            ],
        ],
        [
            'name' => 'get_ai_usage_summary',
            'description' => 'Get monthly AI token and audio usage breakdown from the ai_usage ledger (requires ai_config permission).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'month' => ['type' => 'string', 'description' => 'Month YYYY-MM (defaults to current month)'],
                ],
            ],
        ],
        [
            'name' => 'list_social_accounts',
            'description' => 'List connected social media accounts via the stored Zernio integration (read-only; never exposes the Zernio API key).',
            'inputSchema' => ['type' => 'object', 'properties' => new \stdClass()],
        ],
        [
            'name' => 'list_social_posts',
            'description' => 'List published and scheduled social media posts from Zernio (both Zernio-created and external sources).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'limit' => ['type' => 'integer', 'description' => 'Max posts per Zernio source query (default 50, max 100)'],
                ],
            ],
        ],
        [
            'name' => 'get_social_analytics',
            'description' => 'Fetch social media engagement and performance analytics from the connected Zernio account.',
            'inputSchema' => ['type' => 'object', 'properties' => new \stdClass()],
        ],
        [
            'name' => 'list_audit_logs',
            'description' => 'Admin-only: inspect security and MCP audit trail rows with optional action prefix, actor email, and date range filters.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'action_prefix' => ['type' => 'string', 'description' => 'Filter by action prefix (e.g. mcp_ or auth.)'],
                    'actor' => ['type' => 'string', 'description' => 'Substring match against actor_email'],
                    'from' => ['type' => 'string', 'description' => 'Start date YYYY-MM-DD'],
                    'to' => ['type' => 'string', 'description' => 'End date YYYY-MM-DD'],
                    'limit' => ['type' => 'integer', 'description' => 'Max rows to return (default 50, max 200)'],
                    'offset' => ['type' => 'integer', 'description' => 'Pagination offset (default 0)'],
                ],
            ],
        ],
        [
            'name' => 'list_error_logs',
            'description' => 'Admin-only: inspect captured server exception rows in error_logs with optional search and date range filters.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'search' => ['type' => 'string', 'description' => 'Substring filter on message, file, or request_uri'],
                    'from' => ['type' => 'string', 'description' => 'Start date YYYY-MM-DD'],
                    'to' => ['type' => 'string', 'description' => 'End date YYYY-MM-DD'],
                    'limit' => ['type' => 'integer', 'description' => 'Max rows to return (default 50, max 200)'],
                    'offset' => ['type' => 'integer', 'description' => 'Pagination offset (default 0)'],
                ],
            ],
        ],
        [
            'name' => 'get_vector_index_status',
            'description' => 'Admin-only: read-only status and item counts of CRM entities indexed or queued for semantic vector search.',
            'inputSchema' => ['type' => 'object', 'properties' => new \stdClass()],
        ],
    ];
}

function mcp_comms_like(string $q): string {
    return '%' . addcslashes($q, '\\%_') . '%';
}

function mcp_comms_normalize_marketing_roi($raw): array {
    $src = is_array($raw) ? $raw : [];
    $ids = static function ($list): array {
        if (!is_array($list)) return [];
        $out = [];
        foreach ($list as $v) {
            if (is_string($v) && trim($v) !== '' && !in_array(trim($v), $out, true)) {
                $out[] = trim($v);
            }
        }
        return $out;
    };
    $channels = [];
    if (isset($src['sourceChannels']) && is_array($src['sourceChannels'])) {
        foreach ($src['sourceChannels'] as $source => $channel) {
            $key = mb_strtolower(trim((string)$source), 'UTF-8');
            if ($key !== '' && in_array($channel, ['social', 'meta_ads', 'google_ads'], true)) {
                $channels[$key] = $channel;
            }
        }
    }
    $days = isset($src['newsletterWindowDays']) && is_numeric($src['newsletterWindowDays'])
        ? (int)round((float)$src['newsletterWindowDays'])
        : 30;
    return [
        'newsletterCostCategoryIds' => $ids($src['newsletterCostCategoryIds'] ?? []),
        'socialCostCategoryIds' => $ids($src['socialCostCategoryIds'] ?? []),
        'sourceChannels' => (object)$channels,
        'newsletterWindowDays' => $days >= 1 ? min(365, $days) : 30,
    ];
}

function mcp_comms_zernio_get(\PDO $pdo, string $path, int $timeout = 10): array {
    $integrations = function_exists('ccrm_load_integrations_config') ? ccrm_load_integrations_config($pdo) : [];
    $apiKey = trim((string)($integrations['zernioApiKey'] ?? ''));
    if ($apiKey === '' || (defined('CCRM_SECRET_MASK') && $apiKey === CCRM_SECRET_MASK)) {
        throw new \InvalidArgumentException('No Zernio API key is configured in Workspace Integrations.');
    }
    $ch = curl_init('https://zernio.com/api/v1/' . ltrim($path, '/'));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
            'Accept: application/json',
        ],
    ]);
    $response = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);
    if ($curlErr !== '') {
        throw new \RuntimeException('Zernio request failed: ' . $curlErr);
    }
    $decoded = is_string($response) ? json_decode($response, true) : null;
    if ($httpCode < 200 || $httpCode >= 300) {
        $msg = is_array($decoded) ? ($decoded['message'] ?? $decoded['error'] ?? "HTTP {$httpCode}") : "HTTP {$httpCode}";
        throw new \RuntimeException('Zernio API error: ' . $msg);
    }
    return is_array($decoded) ? $decoded : [];
}

function mcp_comms_accessible_mailbox_keys(\PDO $pdo, array $user): array {
    $keys = [];
    $email = strtolower(trim((string)($user['email'] ?? '')));
    if ($email !== '') {
        $keys[] = 'u:' . $email;
    }
    foreach ($pdo->query("SELECT `id` FROM `company_mailboxes` WHERE `is_active` = 1")->fetchAll(\PDO::FETCH_COLUMN) as $cid) {
        $keys[] = 'c:' . (string)$cid;
    }
    return array_values(array_unique($keys));
}

function mcp_comms_assert_mailbox_allowed(\PDO $pdo, array $user, string $mailboxKey): void {
    if (!empty($GLOBALS['mcp_is_admin'])) {
        return;
    }
    $allowed = mcp_comms_accessible_mailbox_keys($pdo, $user);
    if (!in_array(strtolower($mailboxKey), array_map('strtolower', $allowed), true)) {
        throw new \InvalidArgumentException("Mailbox is not accessible to the caller: {$mailboxKey}");
    }
}

/**
 * Execute a comms, analytics, or admin-diagnostic MCP tool.
 */
function mcp_ext_comms_execute(\PDO $pdo, array $user, string $tool, array $args): mixed {
    $perms = mcp_ext_comms_permissions();
    if (!array_key_exists($tool, $perms)) {
        return MCP_NOT_MINE;
    }

    switch ($tool) {
        case 'list_mail_accounts': {
            $accounts = [];
            $uSt = $pdo->prepare("SELECT `metadata_json` FROM `users` WHERE `id` = ? LIMIT 1");
            $uSt->execute([(string)($user['id'] ?? '')]);
            $metaRaw = $uSt->fetchColumn();
            $meta = is_string($metaRaw) ? (json_decode($metaRaw, true) ?: []) : [];
            $emailCfg = is_array($meta['emailSettings'] ?? null) ? $meta['emailSettings'] : [];
            $uEmail = trim((string)($emailCfg['fromEmail'] ?? $emailCfg['email'] ?? $emailCfg['username'] ?? $user['email'] ?? ''));
            if ($uEmail !== '' || !empty($emailCfg['provider'])) {
                $accounts[] = [
                    'mailbox_key' => 'u:' . strtolower(trim((string)($user['email'] ?? $uEmail))),
                    'type' => 'personal',
                    'name' => (string)($user['name'] ?? $uEmail),
                    'address' => $uEmail,
                    'provider' => (string)($emailCfg['provider'] ?? ''),
                    'configured' => !empty($emailCfg['provider']) || !empty($emailCfg['imapHost']) || !empty($emailCfg['smtpHost']),
                    'is_active' => true,
                ];
            }
            $rows = $pdo->query(
                "SELECT `id`, `name`, `address`, `is_active`, `owner_user_id`, `backfill_since`, `last_run_at`, `last_success_at`, `last_error`, `created_at`, `updated_at`
                   FROM `company_mailboxes` ORDER BY `name` ASC"
            )->fetchAll(\PDO::FETCH_ASSOC);
            foreach ($rows as $r) {
                $accounts[] = [
                    'mailbox_key' => 'c:' . (string)$r['id'],
                    'type' => 'company',
                    'id' => (string)$r['id'],
                    'name' => (string)$r['name'],
                    'address' => (string)$r['address'],
                    'is_active' => (bool)(int)$r['is_active'],
                    'owner_user_id' => $r['owner_user_id'],
                    'backfill_since' => $r['backfill_since'],
                    'last_run_at' => ccrm_newsletter_iso($r['last_run_at']),
                    'last_success_at' => ccrm_newsletter_iso($r['last_success_at']),
                    'last_error' => $r['last_error'],
                ];
            }
            return ['accounts' => $accounts];
        }

        case 'list_emails': {
            $limit = mcp_limit($args, 50, 200);
            $offset = max(0, (int)($args['offset'] ?? 0));
            $where = [];
            $params = [];
            $mb = trim((string)($args['mailbox_key'] ?? ''));
            if ($mb !== '') {
                mcp_comms_assert_mailbox_allowed($pdo, $user, $mb);
                $where[] = '`mailbox_key` = ?';
                $params[] = $mb;
            } elseif (empty($GLOBALS['mcp_is_admin'])) {
                $keys = mcp_comms_accessible_mailbox_keys($pdo, $user);
                if (empty($keys)) {
                    return ['emails' => [], 'count' => 0];
                }
                $ph = implode(',', array_fill(0, count($keys), '?'));
                $where[] = "`mailbox_key` IN ({$ph})";
                $params = array_merge($params, $keys);
            }
            if (!empty($args['folder'])) {
                $where[] = '`folder` = ?';
                $params[] = trim((string)$args['folder']);
            }
            if (array_key_exists('is_outgoing', $args)) {
                $where[] = '`is_outgoing` = ?';
                $params[] = !empty($args['is_outgoing']) ? 1 : 0;
            }
            $q = trim((string)($args['q'] ?? ''));
            if ($q !== '') {
                $like = mcp_comms_like($q);
                $where[] = "(`subject` LIKE ? ESCAPE '\\\\' OR `from_address` LIKE ? ESCAPE '\\\\' OR `from_name` LIKE ? ESCAPE '\\\\' OR `to_address` LIKE ? ESCAPE '\\\\' OR `preview` LIKE ? ESCAPE '\\\\')";
                array_push($params, $like, $like, $like, $like, $like);
            }
            $sqlWhere = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
            $st = $pdo->prepare(
                "SELECT `mailbox_key`, `folder`, `uid`, `event_id`, `subject`, `from_name`, `from_address`, `to_name`, `to_address`,
                        `email_date`, `is_outgoing`, `seen`, `size`, `message_id`, `preview`, `attachment_count`
                   FROM `mail_envelopes`
                   {$sqlWhere}
                  ORDER BY `email_date` DESC, `uid` DESC
                  LIMIT {$limit} OFFSET {$offset}"
            );
            $st->execute($params);
            $rows = array_map(static function (array $r): array {
                return [
                    'mailbox_key' => (string)$r['mailbox_key'],
                    'folder' => (string)$r['folder'],
                    'uid' => (int)$r['uid'],
                    'event_id' => (string)$r['event_id'],
                    'subject' => (string)$r['subject'],
                    'from_name' => (string)$r['from_name'],
                    'from_address' => (string)$r['from_address'],
                    'to_name' => (string)$r['to_name'],
                    'to_address' => (string)$r['to_address'],
                    'email_date' => ccrm_newsletter_iso($r['email_date']),
                    'is_outgoing' => (bool)(int)$r['is_outgoing'],
                    'seen' => (bool)(int)$r['seen'],
                    'size' => (int)$r['size'],
                    'message_id' => (string)$r['message_id'],
                    'preview' => (string)$r['preview'],
                    'attachment_count' => (int)$r['attachment_count'],
                ];
            }, $st->fetchAll(\PDO::FETCH_ASSOC));
            return ['emails' => $rows, 'count' => count($rows)];
        }

        case 'get_email': {
            $eventId = trim((string)($args['event_id'] ?? ''));
            $mb = trim((string)($args['mailbox_key'] ?? ''));
            $uid = isset($args['uid']) ? (int)$args['uid'] : 0;
            $folder = trim((string)($args['folder'] ?? ''));
            $env = null;
            if ($eventId !== '') {
                $st = $pdo->prepare("SELECT * FROM `mail_envelopes` WHERE `event_id` = ? LIMIT 1");
                $st->execute([$eventId]);
                $env = $st->fetch(\PDO::FETCH_ASSOC) ?: null;
                if ($env) {
                    mcp_comms_assert_mailbox_allowed($pdo, $user, (string)$env['mailbox_key']);
                }
            } elseif ($mb !== '' && $uid > 0) {
                mcp_comms_assert_mailbox_allowed($pdo, $user, $mb);
                if ($folder !== '') {
                    $st = $pdo->prepare("SELECT * FROM `mail_envelopes` WHERE `mailbox_key` = ? AND `folder` = ? AND `uid` = ? LIMIT 1");
                    $st->execute([$mb, $folder, $uid]);
                } else {
                    $st = $pdo->prepare("SELECT * FROM `mail_envelopes` WHERE `mailbox_key` = ? AND `uid` = ? LIMIT 1");
                    $st->execute([$mb, $uid]);
                }
                $env = $st->fetch(\PDO::FETCH_ASSOC) ?: null;
            } else {
                throw new \InvalidArgumentException('Provide either event_id or (mailbox_key + uid).');
            }
            if (!$env && $eventId === '') {
                throw new \InvalidArgumentException('Cached email envelope not found.');
            }
            $eid = $env ? (string)$env['event_id'] : $eventId;
            $bodyText = null;
            $attachments = [];
            if ($eid !== '') {
                $bSt = $pdo->prepare("SELECT `body`, `attachments_json` FROM `filed_mail_bodies` WHERE `event_id` = ? LIMIT 1");
                $bSt->execute([$eid]);
                if ($bRow = $bSt->fetch(\PDO::FETCH_ASSOC)) {
                    $bodyText = $bRow['body'];
                    $att = is_string($bRow['attachments_json'] ?? null) ? json_decode($bRow['attachments_json'], true) : [];
                    $attachments = is_array($att) ? $att : [];
                } elseif (!$env) {
                    $teSt = $pdo->prepare("SELECT `id`, `title`, `description`, `timestamp`, `meta_json` FROM `timeline_events` WHERE `id` = ? LIMIT 1");
                    $teSt->execute([$eid]);
                    if ($te = $teSt->fetch(\PDO::FETCH_ASSOC)) {
                        $bodyText = $te['description'];
                        $env = ['event_id' => $eid, 'subject' => $te['title'], 'email_date' => $te['timestamp']];
                    }
                }
            }
            if (!$env) {
                throw new \InvalidArgumentException("Email not found for event_id: {$eventId}");
            }
            $summary = null;
            if (!empty($env['uid']) && !empty($env['folder'])) {
                $lookupEmail = (string)($user['email'] ?? '');
                if (isset($env['mailbox_key']) && str_starts_with((string)$env['mailbox_key'], 'u:')) {
                    $lookupEmail = substr((string)$env['mailbox_key'], 2);
                }
                if ($lookupEmail !== '') {
                    $sumSt = $pdo->prepare("SELECT `summary` FROM `email_summaries` WHERE `user_email` = ? AND `folder` = ? AND `email_uid` = ? LIMIT 1");
                    $sumSt->execute([$lookupEmail, (string)$env['folder'], (string)$env['uid']]);
                    $summary = $sumSt->fetchColumn() ?: null;
                    if ($bodyText === null) {
                        $ragSt = $pdo->prepare("SELECT `body` FROM `rag_emails` WHERE `user_email` = ? AND `folder` = ? AND `email_uid` = ? LIMIT 1");
                        $ragSt->execute([$lookupEmail, (string)$env['folder'], (string)$env['uid']]);
                        $bodyText = $ragSt->fetchColumn() ?: null;
                    }
                }
            }
            return [
                'mailbox_key' => $env['mailbox_key'] ?? null,
                'folder' => $env['folder'] ?? null,
                'uid' => isset($env['uid']) ? (int)$env['uid'] : null,
                'event_id' => $eid !== '' ? $eid : null,
                'subject' => (string)($env['subject'] ?? ''),
                'from_name' => (string)($env['from_name'] ?? ''),
                'from_address' => (string)($env['from_address'] ?? ''),
                'to_name' => (string)($env['to_name'] ?? ''),
                'to_address' => (string)($env['to_address'] ?? ''),
                'email_date' => ccrm_newsletter_iso($env['email_date'] ?? null),
                'is_outgoing' => isset($env['is_outgoing']) ? (bool)(int)$env['is_outgoing'] : null,
                'preview' => (string)($env['preview'] ?? ''),
                'body' => $bodyText,
                'summary' => $summary,
                'attachments' => $attachments,
            ];
        }

        case 'list_whatsapp_links': {
            $limit = mcp_limit($args, 50, 200);
            $offset = max(0, (int)($args['offset'] ?? 0));
            $where = ['1=1'];
            $params = [];
            if (!empty($args['entity_type'])) {
                $where[] = '`entity_type` = ?';
                $params[] = mcp_enum($args, 'entity_type', ['lead', 'project']);
            }
            if (!empty($args['entity_id'])) {
                $where[] = '`entity_id` = ?';
                $params[] = trim((string)$args['entity_id']);
            }
            if (!empty($args['conversation_ref'])) {
                $where[] = '`conversation_ref` = ?';
                $params[] = trim((string)$args['conversation_ref']);
            }
            $st = $pdo->prepare(
                "SELECT `id`, `client_id`, `conversation_ref`, `entity_type`, `entity_id`, `link_source`, `title`,
                        `is_group`, `phone_digits`, `owner_user_id`, `path`, `last_message_at`, `updated_at`
                   FROM `whatsapp_links`
                  WHERE " . implode(' AND ', $where) . "
                  ORDER BY `updated_at` DESC
                  LIMIT {$limit} OFFSET {$offset}"
            );
            $st->execute($params);
            return array_map(static fn($r) => [
                'id' => (int)$r['id'],
                'client_id' => (string)$r['client_id'],
                'conversation_ref' => (string)$r['conversation_ref'],
                'entity_type' => (string)$r['entity_type'],
                'entity_id' => (string)$r['entity_id'],
                'source' => (string)$r['link_source'],
                'title' => (string)$r['title'],
                'is_group' => (bool)(int)$r['is_group'],
                'phone' => $r['phone_digits'],
                'owner_user_id' => $r['owner_user_id'],
                'path' => (string)$r['path'],
                'last_message_at' => ccrm_newsletter_iso($r['last_message_at']),
                'updated_at' => ccrm_newsletter_iso($r['updated_at']),
            ], $st->fetchAll(\PDO::FETCH_ASSOC));
        }

        case 'set_whatsapp_link': {
            $ref = mcp_require_string($args, 'conversation_ref');
            $entityType = mcp_enum($args, 'entity_type', ['lead', 'project']);
            $entityId = mcp_require_string($args, 'entity_id');
            $chk = $pdo->prepare($entityType === 'lead' ? "SELECT `name` FROM `leads` WHERE `id` = ? LIMIT 1" : "SELECT `name` FROM `projects` WHERE `id` = ? LIMIT 1");
            $chk->execute([$entityId]);
            $entityName = $chk->fetchColumn();
            if ($entityName === false) {
                throw new \InvalidArgumentException("Target {$entityType} not found: {$entityId}");
            }
            $clientId = trim((string)($args['client_id'] ?? ''));
            if ($clientId === '') {
                $clientId = (string)($pdo->query("SELECT `id` FROM `integration_clients` ORDER BY `id` ASC LIMIT 1")->fetchColumn() ?: 'default');
            }
            $source = mcp_enum($args, 'source', ['auto', 'manual'], 'manual');
            $title = trim((string)($args['title'] ?? '')) ?: ((string)$entityName ?: $ref);
            $isGroup = !empty($args['is_group']) ? 1 : 0;
            $phoneRaw = preg_replace('/\D+/', '', (string)($args['phone'] ?? ''));
            $phone = $phoneRaw !== '' ? mb_substr($phoneRaw, 0, 20) : null;
            $path = trim((string)($args['path'] ?? '')) ?: ('/c/' . $ref);
            $lastMsgAt = !empty($args['last_message_at']) ? mcp_optional_moment($args, 'last_message_at') : null;
            $lastMsgDb = $lastMsgAt !== null ? gmdate('Y-m-d H:i:s', $lastMsgAt) : null;

            $pdo->prepare(
                "INSERT INTO `whatsapp_links` (`client_id`, `conversation_ref`, `entity_type`, `entity_id`, `link_source`, `title`, `is_group`, `phone_digits`, `owner_user_id`, `path`, `last_message_at`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                  `link_source` = VALUES(`link_source`),
                  `title` = VALUES(`title`),
                  `is_group` = VALUES(`is_group`),
                  `phone_digits` = VALUES(`phone_digits`),
                  `owner_user_id` = VALUES(`owner_user_id`),
                  `path` = VALUES(`path`),
                  `last_message_at` = COALESCE(VALUES(`last_message_at`), `last_message_at`)"
            )->execute([$clientId, $ref, $entityType, $entityId, $source, $title, $isGroup, $phone, (string)($user['id'] ?? ''), $path, $lastMsgDb]);
            mcp_audit($pdo, $user, 'whatsapp_link_set', "Linked WhatsApp '{$ref}' to {$entityType}:{$entityId}");
            return [
                'success' => true,
                'client_id' => $clientId,
                'conversation_ref' => $ref,
                'entity_type' => $entityType,
                'entity_id' => $entityId,
                'source' => $source,
                'title' => $title,
                'path' => $path,
            ];
        }

        case 'list_custom_dashboards': {
            $limit = mcp_limit($args, 50, 200);
            $offset = max(0, (int)($args['offset'] ?? 0));
            $where = empty($args['include_archived']) ? 'WHERE `archived` = 0' : '';
            $rows = $pdo->query(
                "SELECT `id`, `name`, `icon`, `color`, `active_model`, `archived`, `created_at`
                   FROM `custom_dashboards` {$where} ORDER BY `created_at` DESC LIMIT {$limit} OFFSET {$offset}"
            )->fetchAll(\PDO::FETCH_ASSOC);
            return array_map(static fn($r) => [
                'id' => (string)$r['id'],
                'name' => (string)$r['name'],
                'icon' => (string)$r['icon'],
                'color' => (string)$r['color'],
                'active_model' => (string)$r['active_model'],
                'archived' => (bool)(int)$r['archived'],
                'created_at' => ccrm_newsletter_iso($r['created_at']),
            ], $rows);
        }

        case 'get_custom_dashboard': {
            $id = mcp_require_string($args, 'id');
            $st = $pdo->prepare("SELECT * FROM `custom_dashboards` WHERE `id` = ? LIMIT 1");
            $st->execute([$id]);
            $r = $st->fetch(\PDO::FETCH_ASSOC);
            if (!$r) {
                throw new \InvalidArgumentException("Custom dashboard not found: {$id}");
            }
            return [
                'id' => (string)$r['id'],
                'name' => (string)$r['name'],
                'icon' => (string)$r['icon'],
                'color' => (string)$r['color'],
                'active_model' => (string)$r['active_model'],
                'archived' => (bool)(int)$r['archived'],
                'prompts' => json_decode((string)$r['prompts_json'], true) ?: [],
                'layout' => json_decode((string)$r['layout_json'], true) ?: new \stdClass(),
                'created_at' => ccrm_newsletter_iso($r['created_at']),
            ];
        }

        case 'update_custom_dashboard': {
            $id = mcp_require_string($args, 'id');
            $st = $pdo->prepare("SELECT `id` FROM `custom_dashboards` WHERE `id` = ? LIMIT 1");
            $st->execute([$id]);
            if (!$st->fetchColumn()) {
                throw new \InvalidArgumentException("Custom dashboard not found: {$id}");
            }
            $sets = [];
            $params = [];
            foreach (['name', 'icon', 'color', 'active_model'] as $col) {
                if (array_key_exists($col, $args)) {
                    $sets[] = "`{$col}` = ?";
                    $params[] = trim((string)$args[$col]);
                }
            }
            if (array_key_exists('prompts', $args)) {
                $sets[] = '`prompts_json` = ?';
                $params[] = json_encode($args['prompts'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
            if (array_key_exists('layout', $args)) {
                $sets[] = '`layout_json` = ?';
                $params[] = json_encode($args['layout'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
            if (array_key_exists('archived', $args)) {
                $sets[] = '`archived` = ?';
                $params[] = !empty($args['archived']) ? 1 : 0;
            }
            if (empty($sets)) {
                throw new \InvalidArgumentException('No update fields provided.');
            }
            $params[] = $id;
            $pdo->prepare("UPDATE `custom_dashboards` SET " . implode(', ', $sets) . " WHERE `id` = ?")->execute($params);
            mcp_audit($pdo, $user, 'custom_dashboard_update', "Updated custom dashboard {$id}");
            return ['success' => true] + mcp_ext_comms_execute($pdo, $user, 'get_custom_dashboard', ['id' => $id]);
        }

        case 'get_marketing_roi': {
            $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'MARKETING_ROI_CONFIG'")->fetchColumn();
            $config = mcp_comms_normalize_marketing_roi(is_string($raw) && $raw !== '' ? json_decode($raw, true) : null);
            $newsletter = null;
            if (mcp_can('newsletter')) {
                $campaigns = $pdo->query(
                    "SELECT `id`, `name` FROM `newsletter_campaigns` WHERE `deleted_at` IS NULL AND `status` IN ('sending', 'paused', 'sent', 'cancelled')"
                )->fetchAll(\PDO::FETCH_ASSOC);
                $byId = [];
                foreach ($campaigns as $c) {
                    $byId[(string)$c['id']] = ['id' => (string)$c['id'], 'name' => (string)$c['name'], 'sentAt' => null, 'recipients' => []];
                }
                if ($byId) {
                    $rSt = $pdo->query("SELECT `campaign_id`, `lead_id`, `email`, `sent_at` FROM `newsletter_recipients` WHERE `status` = 'sent' AND `sent_at` IS NOT NULL ORDER BY `sent_at`");
                    while ($r = $rSt->fetch(\PDO::FETCH_ASSOC)) {
                        $cid = (string)$r['campaign_id'];
                        if (!isset($byId[$cid])) continue;
                        $sentAt = ccrm_newsletter_iso($r['sent_at']);
                        if ($sentAt === null) continue;
                        if ($byId[$cid]['sentAt'] === null) $byId[$cid]['sentAt'] = $sentAt;
                        $byId[$cid]['recipients'][] = [$r['lead_id'] ?: null, (string)$r['email'], $sentAt];
                    }
                    $newsletter = array_values(array_filter($byId, static fn($c) => $c['sentAt'] !== null));
                } else {
                    $newsletter = [];
                }
            }
            return ['config' => $config, 'newsletter' => $newsletter];
        }

        case 'set_marketing_roi': {
            if (!isset($args['config']) || !is_array($args['config'])) {
                throw new \InvalidArgumentException('config object is required.');
            }
            $config = mcp_comms_normalize_marketing_roi($args['config']);
            $pdo->prepare(
                "INSERT INTO `system_settings` (`key`, `value`) VALUES ('MARKETING_ROI_CONFIG', ?)
                 ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)"
            )->execute([json_encode($config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
            mcp_audit($pdo, $user, 'marketing_roi_update', 'Updated MARKETING_ROI_CONFIG');
            return ['success' => true, 'config' => $config];
        }

        case 'get_ai_usage_summary': {
            $month = trim((string)($args['month'] ?? date('Y-m')));
            if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) {
                throw new \InvalidArgumentException('month must use YYYY-MM format.');
            }
            $start = $month . '-01 00:00:00';
            $end = date('Y-m-d H:i:s', strtotime($start . ' +1 month'));
            if (function_exists('ccrm_ai_usage_ensure')) {
                ccrm_ai_usage_ensure($pdo);
            }
            $st = $pdo->prepare(
                "SELECT `feature`, `model`, SUM(`input_tokens`) AS input_tokens, SUM(`cached_input_tokens`) AS cached_input_tokens,
                        SUM(`output_tokens`) AS output_tokens, SUM(`input_audio_tokens`) AS input_audio_tokens,
                        SUM(`output_audio_tokens`) AS output_audio_tokens, SUM(`audio_seconds`) AS audio_seconds, COUNT(*) AS calls
                   FROM `ai_usage`
                  WHERE `created_at` >= ? AND `created_at` < ?
                  GROUP BY `feature`, `model`"
            );
            $st->execute([$start, $end]);
            $rows = array_map(static fn($r) => [
                'feature' => (string)$r['feature'],
                'model' => (string)$r['model'],
                'calls' => (int)$r['calls'],
                'inputTokens' => (int)$r['input_tokens'],
                'cachedInputTokens' => (int)$r['cached_input_tokens'],
                'outputTokens' => (int)$r['output_tokens'],
                'inputAudioTokens' => (int)$r['input_audio_tokens'],
                'outputAudioTokens' => (int)$r['output_audio_tokens'],
                'audioSeconds' => (float)$r['audio_seconds'],
            ], $st->fetchAll(\PDO::FETCH_ASSOC));
            $months = $pdo->query("SELECT DISTINCT DATE_FORMAT(`created_at`, '%Y-%m') AS ym FROM `ai_usage` ORDER BY ym DESC")->fetchAll(\PDO::FETCH_COLUMN);
            return ['month' => $month, 'months' => array_values(array_filter($months, 'is_string')), 'rows' => $rows];
        }

        case 'list_social_accounts': {
            $res = mcp_comms_zernio_get($pdo, 'accounts');
            $accounts = $res['accounts'] ?? $res['data'] ?? $res;
            return ['accounts' => is_array($accounts) ? $accounts : []];
        }

        case 'list_social_posts': {
            $limit = mcp_limit($args, 50, 100);
            $allPosts = [];
            $seenIds = [];
            foreach (['zernio', 'external'] as $src) {
                $res = mcp_comms_zernio_get($pdo, "posts?source={$src}&limit={$limit}");
                $items = $res['posts'] ?? $res['data'] ?? $res['results'] ?? [];
                if (is_array($items)) {
                    foreach ($items as $it) {
                        if (!is_array($it)) continue;
                        $pid = $it['_id'] ?? $it['id'] ?? null;
                        if ($pid && !isset($seenIds[$pid])) {
                            $seenIds[$pid] = true;
                            $allPosts[] = $it;
                        } elseif (!$pid) {
                            $allPosts[] = $it;
                        }
                    }
                }
            }
            return ['posts' => $allPosts, 'count' => count($allPosts)];
        }

        case 'get_social_analytics': {
            return ['analytics' => mcp_comms_zernio_get($pdo, 'analytics', 12)];
        }

        case 'list_audit_logs': {
            $limit = mcp_limit($args, 50, 200);
            $offset = max(0, (int)($args['offset'] ?? 0));
            $where = [];
            $params = [];
            $prefix = trim((string)($args['action_prefix'] ?? ''));
            if ($prefix !== '') {
                $where[] = "`action` LIKE ? ESCAPE '\\\\'";
                $params[] = addcslashes($prefix, '%_\\') . '%';
            }
            $actor = trim((string)($args['actor'] ?? ''));
            if ($actor !== '') {
                $where[] = "`actor_email` LIKE ? ESCAPE '\\\\'";
                $params[] = mcp_comms_like($actor);
            }
            $from = mcp_optional_date($args, 'from');
            if ($from !== null) {
                $where[] = '`created_at` >= ?';
                $params[] = $from . ' 00:00:00';
            }
            $to = mcp_optional_date($args, 'to');
            if ($to !== null) {
                $where[] = '`created_at` <= ?';
                $params[] = $to . ' 23:59:59';
            }
            $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
            $st = $pdo->prepare(
                "SELECT `id`, `created_at`, `actor_id`, `actor_email`, `action`, `detail`, `ip`
                   FROM `audit_log` {$whereSql} ORDER BY `id` DESC LIMIT {$limit} OFFSET {$offset}"
            );
            $st->execute($params);
            return array_map(static fn($r) => [
                'id' => (int)$r['id'],
                'created_at' => (string)$r['created_at'],
                'actor_id' => $r['actor_id'],
                'actor_email' => $r['actor_email'],
                'action' => (string)$r['action'],
                'detail' => $r['detail'],
                'ip' => $r['ip'],
            ], $st->fetchAll(\PDO::FETCH_ASSOC));
        }

        case 'list_error_logs': {
            $limit = mcp_limit($args, 50, 200);
            $offset = max(0, (int)($args['offset'] ?? 0));
            $where = [];
            $params = [];
            $search = trim((string)($args['search'] ?? ''));
            if ($search !== '') {
                $like = mcp_comms_like($search);
                $where[] = "(`message` LIKE ? ESCAPE '\\\\' OR `file` LIKE ? ESCAPE '\\\\' OR `request_uri` LIKE ? ESCAPE '\\\\')";
                array_push($params, $like, $like, $like);
            }
            $from = mcp_optional_date($args, 'from');
            if ($from !== null) {
                $where[] = '`created_at` >= ?';
                $params[] = $from . ' 00:00:00';
            }
            $to = mcp_optional_date($args, 'to');
            if ($to !== null) {
                $where[] = '`created_at` <= ?';
                $params[] = $to . ' 23:59:59';
            }
            $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
            $st = $pdo->prepare(
                "SELECT `id`, `message`, `file`, `line`, `request_uri`, `request_method`, `created_at`
                   FROM `error_logs` {$whereSql} ORDER BY `id` DESC LIMIT {$limit} OFFSET {$offset}"
            );
            $st->execute($params);
            return array_map(static fn($r) => [
                'id' => (int)$r['id'],
                'message' => (string)$r['message'],
                'file' => $r['file'],
                'line' => $r['line'] !== null ? (int)$r['line'] : null,
                'request_uri' => $r['request_uri'],
                'request_method' => $r['request_method'],
                'created_at' => (string)$r['created_at'],
            ], $st->fetchAll(\PDO::FETCH_ASSOC));
        }

        case 'get_vector_index_status': {
            $leads = (int)$pdo->query("SELECT COUNT(*) FROM `leads`")->fetchColumn();
            $clients = (int)$pdo->query("SELECT COUNT(DISTINCT `name`) FROM `leads` WHERE `name` IS NOT NULL AND TRIM(`name`) != ''")->fetchColumn();
            $emails = (int)$pdo->query("SELECT COUNT(*) FROM `timeline_events` WHERE `type` = 'email'")->fetchColumn();
            $chats = (int)$pdo->query("SELECT COUNT(*) FROM `timeline_events` WHERE `type` = 'note'")->fetchColumn();
            $documents = (int)$pdo->query("SELECT COUNT(*) FROM `timeline_events` WHERE `type` = 'offer'")->fetchColumn();
            $meetings = ccrm_table_exists($pdo, 'meeting_notes')
                ? (int)$pdo->query("SELECT COUNT(*) FROM `meeting_notes` WHERE (`archived` = 0 OR `archived` IS NULL)")->fetchColumn()
                : 0;
            $products = ccrm_table_exists($pdo, 'warehouse_items')
                ? (int)$pdo->query("SELECT COUNT(*) FROM `warehouse_items`")->fetchColumn()
                : 0;
            $unified = 0;
            if (ccrm_table_exists($pdo, 'unified_entries')) {
                foreach ($pdo->query("SELECT `id` FROM `unified_entries` WHERE `archived` = 0")->fetchAll(\PDO::FETCH_COLUMN) as $rid) {
                    $safe = preg_replace('/[^a-z0-9_]/', '', strtolower((string)$rid));
                    if ($safe !== '' && ccrm_table_exists($pdo, 'ue_' . $safe)) {
                        try {
                            $unified += (int)$pdo->query("SELECT COUNT(*) FROM `ue_{$safe}`")->fetchColumn();
                        } catch (\Throwable $e) {}
                    }
                }
            }
            $employees = ccrm_table_exists($pdo, 'employees') ? (int)$pdo->query("SELECT COUNT(*) FROM `employees` WHERE `is_active` = 1")->fetchColumn() : 0;
            $salaries = ccrm_table_exists($pdo, 'employee_salaries') ? (int)$pdo->query("SELECT COUNT(*) FROM `employee_salaries`")->fetchColumn() : 0;
            $vacations = ccrm_table_exists($pdo, 'employee_vacations') ? (int)$pdo->query("SELECT COUNT(*) FROM `employee_vacations`")->fetchColumn() : 0;
            $integrations = function_exists('ccrm_load_integrations_config') ? ccrm_load_integrations_config($pdo) : [];
            return [
                'vector_db' => (string)($integrations['vectorDb'] ?? 'none'),
                'counts' => [
                    'leads' => $leads,
                    'clients' => $clients,
                    'emails' => $emails,
                    'chats' => $chats,
                    'meeting_notes' => $meetings,
                    'documents' => $documents,
                    'unified_entries' => $unified,
                    'products' => $products,
                    'employees' => $employees,
                    'salaries' => $salaries,
                    'vacations' => $vacations,
                    'total_items' => $leads + $clients + $emails + $chats + $meetings + $documents + $unified + $products + $employees + $salaries + $vacations,
                ],
            ];
        }

        default:
            return MCP_NOT_MINE;
    }
}
