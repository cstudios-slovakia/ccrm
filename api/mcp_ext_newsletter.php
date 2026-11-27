<?php
/**
 * CCRM MCP Server Extensions — Newsletter (Option A: Safe Draft & Test Mode)
 *
 * Covers newsletter campaign CRUD, soft-archive/restore, audience preview,
 * recipients, suppressions, contact delivery status, and test e-mail sending
 * (`create_newsletter_test_send`). Live bulk `start_send` / mass-dispatch stays
 * disabled via MCP under Option A. Included by mcp.php.
 */

require_once __DIR__ . '/newsletter_lib.php';
require_once __DIR__ . '/newsletter_audience.php';
require_once __DIR__ . '/newsletter_send.php';

/**
 * Permissions for Newsletter MCP tools, merged into mcp_tool_permissions().
 */
function mcp_ext_newsletter_permissions(): array {
    return [
        'list_newsletter_campaigns'     => ['view' => ['newsletter']],
        'get_newsletter_campaign'       => ['view' => ['newsletter']],
        'list_newsletter_recipients'    => ['view' => ['newsletter']],
        'preview_newsletter_audience'   => ['view' => ['newsletter']],
        'list_newsletter_suppressions'  => ['view' => ['newsletter']],
        'get_newsletter_contact_status' => ['view' => ['newsletter']],
        'create_newsletter_campaign'    => ['edit' => ['newsletter']],
        'update_newsletter_campaign'    => ['edit' => ['newsletter']],
        'add_newsletter_suppression'    => ['edit' => ['newsletter']],
        'create_newsletter_test_send'   => ['edit' => ['newsletter'], 'view' => ['newsletter_send']],
    ];
}

/**
 * Tool definitions for Newsletter MCP tools, merged into mcp_get_tool_definitions().
 * Each block places `'name'` directly above `'description'`.
 */
function mcp_get_newsletter_tool_definitions(): array {
    return [
        [
            'name' => 'list_newsletter_campaigns',
            'description' => 'List newsletter campaigns with delivery counts, audience summary, status, and optional soft-deleted filter.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'status' => ['type' => 'string', 'enum' => ['draft', 'sending', 'paused', 'sent', 'cancelled'], 'description' => 'Filter by campaign status'],
                    'search' => ['type' => 'string', 'description' => 'Case-insensitive substring match against name or subject'],
                    'include_archived' => ['type' => 'boolean', 'description' => 'Include soft-deleted campaigns (default false)'],
                    'limit' => ['type' => 'integer', 'description' => 'Max campaigns to return (default 50, max 200)'],
                    'offset' => ['type' => 'integer', 'description' => 'Pagination offset (default 0)'],
                    'created_from' => ['type' => 'string', 'description' => 'Created at >= ISO timestamp'],
                    'created_to' => ['type' => 'string', 'description' => 'Created at <= ISO timestamp'],
                    'updated_from' => ['type' => 'string', 'description' => 'Updated at >= ISO timestamp'],
                    'updated_to' => ['type' => 'string', 'description' => 'Updated at <= ISO timestamp'],
                ],
            ],
        ],
        [
            'name' => 'get_newsletter_campaign',
            'description' => 'Get a single newsletter campaign by ID, including full audience configuration, builder document, and delivery counts.',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['id'],
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Campaign ID'],
                    'include_archived' => ['type' => 'boolean', 'description' => 'Allow fetching a soft-deleted campaign (default false)'],
                ],
            ],
        ],
        [
            'name' => 'list_newsletter_recipients',
            'description' => 'List resolved recipients and delivery statuses for a newsletter campaign.',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['id'],
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Campaign ID'],
                    'status' => ['type' => 'string', 'enum' => ['queued', 'sent', 'failed', 'skipped', 'cancelled'], 'description' => 'Filter by recipient status'],
                    'q' => ['type' => 'string', 'description' => 'Substring filter on recipient email or name'],
                    'limit' => ['type' => 'integer', 'description' => 'Max recipients to return (default 50, max 200)'],
                    'offset' => ['type' => 'integer', 'description' => 'Pagination offset (default 0)'],
                ],
            ],
        ],
        [
            'name' => 'preview_newsletter_audience',
            'description' => 'Resolve a newsletter audience configuration against CRM clients, leads, employees, extra addresses, and suppressions without sending anything.',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['audience'],
                'properties' => [
                    'audience' => [
                        'type' => 'object',
                        'description' => 'Audience object: { clients: { mode: all|pick, categoryIds, clientIds }, leads?: { enabled, statuses, interestCategories }, employees?: { enabled }, extra?: { enabled, raw } }',
                    ],
                ],
            ],
        ],
        [
            'name' => 'list_newsletter_suppressions',
            'description' => 'List unsubscribed or manually suppressed e-mail addresses blocked from newsletter delivery.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'q' => ['type' => 'string', 'description' => 'Substring filter on email or note'],
                    'limit' => ['type' => 'integer', 'description' => 'Max rows to return (default 50, max 200)'],
                    'offset' => ['type' => 'integer', 'description' => 'Pagination offset (default 0)'],
                ],
            ],
        ],
        [
            'name' => 'get_newsletter_contact_status',
            'description' => 'Check newsletter suppression state and last 5 delivered campaigns for up to 50 e-mail addresses.',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['emails'],
                'properties' => [
                    'emails' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'List of up to 50 e-mail addresses'],
                ],
            ],
        ],
        [
            'name' => 'create_newsletter_campaign',
            'description' => 'Create a new draft newsletter campaign with optional subject, sender overrides, audience, and builder document.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'name' => ['type' => 'string', 'description' => 'Internal campaign name (defaults to timestamped draft name)'],
                    'subject' => ['type' => 'string', 'description' => 'E-mail subject line'],
                    'preheader' => ['type' => 'string', 'description' => 'Inbox preview text'],
                    'fromName' => ['type' => 'string', 'description' => 'Optional sender display name override'],
                    'replyTo' => ['type' => 'string', 'description' => 'Optional reply-to e-mail address'],
                    'audience' => ['type' => 'object', 'description' => 'Optional audience configuration'],
                    'body' => ['type' => 'object', 'description' => 'Optional EmailDoc { version: 1, rows: [...] }'],
                    'useHeader' => ['type' => 'boolean', 'description' => 'Include shared header block (default true)'],
                    'useFooter' => ['type' => 'boolean', 'description' => 'Include shared footer block (default true)'],
                ],
            ],
        ],
        [
            'name' => 'update_newsletter_campaign',
            'description' => 'Update a draft newsletter campaign (name, subject, preheader, fromName, replyTo, audience, body, useHeader, useFooter) or toggle archived=true/false (soft-delete/restore).',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['id'],
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Campaign ID'],
                    'name' => ['type' => 'string', 'description' => 'Updated name (draft only)'],
                    'subject' => ['type' => 'string', 'description' => 'Updated subject (draft only)'],
                    'preheader' => ['type' => 'string', 'description' => 'Updated preheader (draft only)'],
                    'fromName' => ['type' => 'string', 'description' => 'Updated sender display name (draft only)'],
                    'replyTo' => ['type' => 'string', 'description' => 'Updated reply-to address (draft only)'],
                    'audience' => ['type' => 'object', 'description' => 'Updated audience object (draft only)'],
                    'body' => ['type' => 'object', 'description' => 'Updated EmailDoc object (draft only)'],
                    'useHeader' => ['type' => 'boolean', 'description' => 'Include shared header (draft only)'],
                    'useFooter' => ['type' => 'boolean', 'description' => 'Include shared footer (draft only)'],
                    'archived' => ['type' => 'boolean', 'description' => 'Set true to soft-delete (deleted_at) or false to restore'],
                ],
            ],
        ],
        [
            'name' => 'add_newsletter_suppression',
            'description' => 'Add one or more e-mail addresses to the newsletter suppression list so future campaigns skip them.',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['emails'],
                'properties' => [
                    'emails' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Up to 2000 e-mail addresses to suppress'],
                    'note' => ['type' => 'string', 'description' => 'Optional reason/note'],
                ],
            ],
        ],
        [
            'name' => 'create_newsletter_test_send',
            'description' => 'Send a [Test] e-mail for a newsletter campaign to 1-5 explicit test recipients (safe test mode only; requires newsletter edit + newsletter_send; live bulk send is intentionally blocked).',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['id', 'to'],
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Campaign ID'],
                    'to' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => '1 to 5 recipient e-mail addresses'],
                    'subject' => ['type' => 'string', 'description' => 'Subject line override (defaults to campaign subject)'],
                    'html' => ['type' => 'string', 'description' => 'Rendered HTML body (defaults to campaign html_snapshot if present)'],
                    'text' => ['type' => 'string', 'description' => 'Optional plain-text fallback (auto-derived from HTML when omitted)'],
                    'sample' => ['type' => 'object', 'description' => 'Optional merge-tag sample object ({ name, company, email, ... })'],
                ],
            ],
        ],
    ];
}

function mcp_nl_actor_name(array $user): string {
    $raw = trim((string)($user['name'] ?? $user['email'] ?? $user['id'] ?? 'MCP'));
    return mb_substr($raw !== '' ? $raw : 'MCP', 0, 50, 'UTF-8');
}

function mcp_nl_like(string $q): string {
    return '%' . addcslashes($q, '\\%_') . '%';
}

function mcp_nl_load_row(\PDO $pdo, string $id, bool $includeArchived = false, bool $lock = false): array {
    $sql = "SELECT * FROM `newsletter_campaigns` WHERE `id` = ?";
    if (!$includeArchived) {
        $sql .= " AND `deleted_at` IS NULL";
    }
    $sql .= " LIMIT 1" . ($lock ? ' FOR UPDATE' : '');
    $st = $pdo->prepare($sql);
    $st->execute([$id]);
    $row = $st->fetch(\PDO::FETCH_ASSOC);
    if (!$row) {
        throw new \InvalidArgumentException("Newsletter campaign not found: {$id}");
    }
    return $row;
}

/**
 * Execute a Newsletter MCP tool. Returns MCP_NOT_MINE if `$tool` is not handled here.
 */
function mcp_ext_newsletter_execute(\PDO $pdo, array $user, string $tool, array $args): mixed {
    $perms = mcp_ext_newsletter_permissions();
    if (!array_key_exists($tool, $perms)) {
        return MCP_NOT_MINE;
    }

    switch ($tool) {
        case 'list_newsletter_campaigns': {
            $where = [];
            $params = [];
            if (empty($args['include_archived'])) {
                $where[] = '`deleted_at` IS NULL';
            }
            if (!empty($args['status'])) {
                $status = mcp_enum($args, 'status', ['draft', 'sending', 'paused', 'sent', 'cancelled']);
                $where[] = '`status` = ?';
                $params[] = $status;
            }
            $search = trim((string)($args['search'] ?? ''));
            if ($search !== '') {
                $where[] = "(`name` LIKE ? ESCAPE '\\\\' OR `subject` LIKE ? ESCAPE '\\\\')";
                $like = mcp_nl_like($search);
                $params[] = $like;
                $params[] = $like;
            }
            $win = mcp_list_window($args, [
                'created' => 'created_at',
                'updated' => 'updated_at',
                'id' => 'id',
                'sorts' => ['updated_at' => ['updated_at', 'DESC', 'id DESC']],
                'default_sort' => 'updated_at',
                'default_limit' => 50,
                'max_limit' => 200,
            ]);
            $where = array_merge($where ?: ['1=1'], $win['where']);
            $params = array_merge($params, $win['params']);
            $st = $pdo->prepare("SELECT * FROM `newsletter_campaigns` WHERE " . implode(' AND ', $where) . ' ' . $win['tail']);
            $st->execute($params);
            $rows = $st->fetchAll(\PDO::FETCH_ASSOC);
            $ids = [];
            foreach ($rows as $r) {
                if (($r['status'] ?? '') !== 'draft') {
                    $ids[] = (string)$r['id'];
                }
            }
            $counts = ccrm_newsletter_counts($pdo, $ids);
            $out = [];
            foreach ($rows as $r) {
                $item = ccrm_newsletter_summary_json($r, $counts[(string)$r['id']] ?? ccrm_newsletter_empty_counts());
                $item['archived'] = $r['deleted_at'] !== null;
                $out[] = $item;
            }
            return $out;
        }

        case 'get_newsletter_campaign': {
            $id = mcp_require_string($args, 'id');
            $row = mcp_nl_load_row($pdo, $id, !empty($args['include_archived']));
            $counts = ccrm_newsletter_counts($pdo, [$id]);
            $out = ccrm_newsletter_campaign_json($row, $counts[$id] ?? ccrm_newsletter_empty_counts());
            $out['archived'] = $row['deleted_at'] !== null;
            return $out;
        }

        case 'list_newsletter_recipients': {
            $id = mcp_require_string($args, 'id');
            $row = mcp_nl_load_row($pdo, $id, true);
            $limit = mcp_limit($args, 50, 200);
            $offset = max(0, (int)($args['offset'] ?? 0));
            $where = ['`campaign_id` = ?'];
            $params = [(string)$row['id']];
            if (!empty($args['status'])) {
                $status = mcp_enum($args, 'status', ['queued', 'sent', 'failed', 'skipped', 'cancelled']);
                $where[] = '`status` = ?';
                $params[] = $status;
            }
            $q = trim((string)($args['q'] ?? ''));
            if ($q !== '') {
                $where[] = "(`email` LIKE ? ESCAPE '\\\\' OR `name` LIKE ? ESCAPE '\\\\')";
                $like = mcp_nl_like($q);
                $params[] = $like;
                $params[] = $like;
            }
            $sqlWhere = implode(' AND ', $where);
            $cnt = $pdo->prepare("SELECT COUNT(*) FROM `newsletter_recipients` WHERE {$sqlWhere}");
            $cnt->execute($params);
            $total = (int)$cnt->fetchColumn();
            $st = $pdo->prepare(
                "SELECT `id`, `email`, `name`, `source`, `lead_id`, `employee_id`, `status`, `skip_reason`, `error`, `sent_at`, `unsubscribed_at`
                   FROM `newsletter_recipients`
                  WHERE {$sqlWhere}
                  ORDER BY `id` ASC
                  LIMIT {$limit} OFFSET {$offset}"
            );
            $st->execute($params);
            $rows = [];
            foreach ($st->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $rows[] = [
                    'id' => (int)$r['id'],
                    'email' => (string)$r['email'],
                    'name' => $r['name'] !== null ? (string)$r['name'] : null,
                    'source' => (string)$r['source'],
                    'leadId' => $r['lead_id'] !== null ? (string)$r['lead_id'] : null,
                    'employeeId' => $r['employee_id'] !== null ? (string)$r['employee_id'] : null,
                    'status' => (string)$r['status'],
                    'skipReason' => $r['skip_reason'] !== null ? (string)$r['skip_reason'] : null,
                    'error' => $r['error'] !== null ? (string)$r['error'] : null,
                    'sentAt' => ccrm_newsletter_iso($r['sent_at']),
                    'unsubscribedAt' => ccrm_newsletter_iso($r['unsubscribed_at']),
                ];
            }
            return ['rows' => $rows, 'total' => $total];
        }

        case 'preview_newsletter_audience': {
            if (!isset($args['audience']) || !is_array($args['audience'])) {
                throw new \InvalidArgumentException('audience object is required.');
            }
            $audience = ccrm_newsletter_normalize_audience($args['audience']);
            $valid = ccrm_newsletter_audience_valid($audience);
            $resolved = $valid
                ? ccrm_newsletter_resolve_audience($pdo, $audience)
                : ['rows' => [], 'bySource' => ['client' => 0, 'lead' => 0, 'employee' => 0, 'extra' => 0], 'skipped' => ['unsubscribed' => 0, 'invalid' => 0], 'withoutEmail' => 0, 'total' => 0];
            return ccrm_newsletter_audience_preview($resolved, $valid);
        }

        case 'list_newsletter_suppressions': {
            $limit = mcp_limit($args, 50, 200);
            $offset = max(0, (int)($args['offset'] ?? 0));
            $where = '';
            $params = [];
            $q = trim((string)($args['q'] ?? ''));
            if ($q !== '') {
                $where = "WHERE (s.`email` LIKE ? ESCAPE '\\\\' OR s.`note` LIKE ? ESCAPE '\\\\')";
                $like = mcp_nl_like($q);
                $params = [$like, $like];
            }
            $cnt = $pdo->prepare("SELECT COUNT(*) FROM `newsletter_suppressions` s {$where}");
            $cnt->execute($params);
            $total = (int)$cnt->fetchColumn();
            $st = $pdo->prepare(
                "SELECT s.`email`, s.`reason`, s.`campaign_id`, c.`name` AS campaign_name, s.`note`, s.`created_by`, s.`created_at`
                   FROM `newsletter_suppressions` s
                   LEFT JOIN `newsletter_campaigns` c ON c.`id` = s.`campaign_id`
                   {$where}
                  ORDER BY s.`created_at` DESC, s.`email` ASC
                  LIMIT {$limit} OFFSET {$offset}"
            );
            $st->execute($params);
            $rows = [];
            foreach ($st->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $rows[] = [
                    'email' => (string)$r['email'],
                    'reason' => (string)$r['reason'],
                    'campaignId' => $r['campaign_id'] !== null ? (string)$r['campaign_id'] : null,
                    'campaignName' => $r['campaign_name'] !== null ? (string)$r['campaign_name'] : null,
                    'note' => $r['note'] !== null ? (string)$r['note'] : null,
                    'createdBy' => $r['created_by'] !== null ? (string)$r['created_by'] : null,
                    'createdAt' => ccrm_newsletter_iso($r['created_at']),
                ];
            }
            return ['rows' => $rows, 'total' => $total];
        }

        case 'get_newsletter_contact_status': {
            $raw = $args['emails'] ?? null;
            if (!is_array($raw) || empty($raw)) {
                throw new \InvalidArgumentException('emails array is required.');
            }
            $emails = [];
            foreach ($raw as $e) {
                $n = ccrm_newsletter_normalize_email(is_string($e) ? $e : '');
                if (ccrm_newsletter_is_valid_email($n)) {
                    $emails[$n] = true;
                }
                if (count($emails) >= 50) break;
            }
            $out = [];
            $sup = $pdo->prepare("SELECT `created_at`, `campaign_id` FROM `newsletter_suppressions` WHERE `email` = ? LIMIT 1");
            $st = $pdo->prepare(
                "SELECT c.`id`, c.`name`, r.`sent_at` FROM `newsletter_recipients` r
                   JOIN `newsletter_campaigns` c ON c.`id` = r.`campaign_id` AND c.`deleted_at` IS NULL
                  WHERE r.`email` = ? AND r.`status` = 'sent'
                  ORDER BY r.`sent_at` DESC LIMIT 5"
            );
            foreach (array_keys($emails) as $email) {
                $entry = ['campaigns' => []];
                $sup->execute([$email]);
                if ($row = $sup->fetch(\PDO::FETCH_ASSOC)) {
                    $entry['unsubscribed'] = [
                        'at' => ccrm_newsletter_iso($row['created_at']),
                        'campaignId' => (string)($row['campaign_id'] ?? ''),
                    ];
                }
                $st->execute([$email]);
                foreach ($st->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                    $entry['campaigns'][] = [
                        'id' => (string)$r['id'],
                        'name' => (string)$r['name'],
                        'sentAt' => ccrm_newsletter_iso($r['sent_at']),
                    ];
                }
                $out[$email] = $entry;
            }
            return ['contacts' => $out];
        }

        case 'create_newsletter_campaign': {
            $name = ccrm_newsletter_line($args['name'] ?? '', 200);
            if ($name === '') {
                $name = 'Campaign ' . gmdate('Y-m-d H:i');
            }
            $patchInput = [];
            foreach (['subject', 'preheader', 'fromName', 'replyTo', 'audience', 'body', 'useHeader', 'useFooter'] as $k) {
                if (array_key_exists($k, $args)) {
                    $patchInput[$k] = $args[$k];
                }
            }
            try {
                $cols = ccrm_newsletter_patch_columns($patchInput);
            } catch (ccrm_newsletter_error $e) {
                throw new \InvalidArgumentException($e->getMessage());
            }
            $id = ccrm_newsletter_new_id();
            $now = gmdate('Y-m-d H:i:s');
            $actor = mcp_nl_actor_name($user);
            $pdo->prepare(
                "INSERT INTO `newsletter_campaigns`
                    (`id`, `name`, `subject`, `preheader`, `from_name`, `reply_to`, `audience_json`, `body_json`, `use_header`, `use_footer`, `created_by`, `updated_by`, `created_at`, `updated_at`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )->execute([
                $id,
                $name,
                $cols['subject'] ?? '',
                $cols['preheader'] ?? null,
                $cols['from_name'] ?? null,
                $cols['reply_to'] ?? null,
                $cols['audience_json'] ?? json_encode(ccrm_newsletter_default_audience(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                $cols['body_json'] ?? null,
                $cols['use_header'] ?? 1,
                $cols['use_footer'] ?? 1,
                $actor,
                $actor,
                $now,
                $now,
            ]);
            mcp_audit($pdo, $user, 'newsletter_campaign_create', "Created draft campaign '{$name}' ({$id})");
            $row = mcp_nl_load_row($pdo, $id, true);
            $out = ccrm_newsletter_campaign_json($row, ccrm_newsletter_empty_counts());
            $out['archived'] = false;
            return ['success' => true, 'campaign' => $out];
        }

        case 'update_newsletter_campaign': {
            $id = mcp_require_string($args, 'id');
            $patchInput = [];
            foreach (['name', 'subject', 'preheader', 'fromName', 'replyTo', 'audience', 'body', 'useHeader', 'useFooter'] as $k) {
                if (array_key_exists($k, $args)) {
                    $patchInput[$k] = $args[$k];
                }
            }
            $hasArchive = array_key_exists('archived', $args);
            if (empty($patchInput) && !$hasArchive) {
                throw new \InvalidArgumentException('No update fields provided.');
            }
            try {
                $cols = !empty($patchInput) ? ccrm_newsletter_patch_columns($patchInput) : [];
            } catch (ccrm_newsletter_error $e) {
                throw new \InvalidArgumentException($e->getMessage());
            }

            $actor = mcp_nl_actor_name($user);
            $now = gmdate('Y-m-d H:i:s');
            $row = mcp_tx($pdo, function () use ($pdo, $id, $cols, $hasArchive, $args, $actor, $now) {
                $existing = mcp_nl_load_row($pdo, $id, $hasArchive, true);
                if (!empty($cols) && ($existing['status'] ?? '') !== 'draft') {
                    throw new \InvalidArgumentException('Only draft campaigns can be edited (content/audience fields locked).');
                }
                if ($hasArchive && !empty($args['archived']) && ($existing['status'] ?? '') === 'sending') {
                    throw new \InvalidArgumentException('A campaign that is sending cannot be archived.');
                }
                $updateCols = $cols;
                if ($hasArchive) {
                    $updateCols['deleted_at'] = !empty($args['archived']) ? ($existing['deleted_at'] ?? $now) : null;
                }
                $updateCols['updated_at'] = $now;
                $updateCols['updated_by'] = $actor;
                $sets = implode(', ', array_map(fn($c) => "`{$c}` = ?", array_keys($updateCols)));
                $pdo->prepare("UPDATE `newsletter_campaigns` SET {$sets} WHERE `id` = ?")
                    ->execute(array_merge(array_values($updateCols), [$id]));
                return mcp_nl_load_row($pdo, $id, true);
            });

            $counts = ccrm_newsletter_counts($pdo, [$id]);
            $out = ccrm_newsletter_campaign_json($row, $counts[$id] ?? ccrm_newsletter_empty_counts());
            $out['archived'] = $row['deleted_at'] !== null;
            mcp_audit($pdo, $user, $hasArchive ? (!empty($args['archived']) ? 'newsletter_campaign_archive' : 'newsletter_campaign_restore') : 'newsletter_campaign_update', "Updated newsletter campaign {$id}");
            return ['success' => true, 'archived' => $out['archived'], 'campaign' => $out];
        }

        case 'add_newsletter_suppression': {
            $emails = $args['emails'] ?? null;
            if (!is_array($emails) || empty($emails)) {
                throw new \InvalidArgumentException('emails array is required.');
            }
            if (count($emails) > 2000) {
                throw new \InvalidArgumentException('At most 2000 addresses may be added at once.');
            }
            $note = ccrm_newsletter_line($args['note'] ?? '', 255);
            $actor = mcp_nl_actor_name($user);
            $now = gmdate('Y-m-d H:i:s');
            $stmt = $pdo->prepare(
                "INSERT IGNORE INTO `newsletter_suppressions` (`email`, `reason`, `campaign_id`, `note`, `created_by`, `created_at`)
                 VALUES (?, 'manual', NULL, ?, ?, ?)"
            );
            $added = 0;
            $invalid = [];
            $seen = [];
            foreach ($emails as $e) {
                $email = ccrm_newsletter_normalize_email(is_scalar($e) ? (string)$e : '');
                if ($email === '' || isset($seen[$email])) continue;
                $seen[$email] = true;
                if (!ccrm_newsletter_is_valid_email($email)) {
                    if (count($invalid) < 50) $invalid[] = $email;
                    continue;
                }
                $stmt->execute([$email, $note !== '' ? $note : null, $actor, $now]);
                $added += $stmt->rowCount();
            }
            mcp_audit($pdo, $user, 'newsletter_suppression_add', "Added {$added} newsletter suppression(s)");
            return ['success' => true, 'added' => $added, 'invalid' => $invalid];
        }

        case 'create_newsletter_test_send': {
            $id = mcp_require_string($args, 'id');
            $row = mcp_nl_load_row($pdo, $id, false);
            $subject = ccrm_newsletter_line($args['subject'] ?? ($row['subject'] ?? ''), 255);
            $html = $args['html'] ?? ($row['html_snapshot'] ?? '');
            $text = is_string($args['text'] ?? null) ? $args['text'] : '';
            if (!is_string($html) || trim($html) === '') {
                throw new \InvalidArgumentException('Rendered html (or an existing html_snapshot on the campaign) is required for test send.');
            }
            $to = $args['to'] ?? null;
            if (!is_array($to) || empty($to)) {
                throw new \InvalidArgumentException('to array of 1-5 recipient e-mails is required.');
            }
            try {
                $res = ccrm_newsletter_send_test(
                    $pdo,
                    [
                        'id' => $id,
                        'subject' => $subject,
                        'html' => $html,
                        'text' => $text,
                        'to' => $to,
                        'sample' => $args['sample'] ?? null,
                    ],
                    mcp_nl_actor_name($user),
                    trim((string)($user['email'] ?? ''))
                );
            } catch (ccrm_newsletter_error $e) {
                throw new \InvalidArgumentException($e->getMessage());
            }
            mcp_audit($pdo, $user, 'newsletter_test_send', "Sent test email for campaign {$id} to " . implode(', ', $to));
            return ['success' => true] + $res;
        }

        default:
            return MCP_NOT_MINE;
    }
}
