<?php
/**
 * MCP list tools rebuilt on the shared window (mcp_window.php), area: crm.
 * See docs/audits/mcp-change-visibility-audit.md. Filled by the change-visibility work packages.
 */

// ============================================================================
// Scope helpers (the module split and the task scope, as the app's reads apply them)
// ============================================================================

/** The caller's scope in the shape read_scope.php expects, so ccrm_lead_scope_sql() fits MCP. */
function mcp_read_scope(array $user): array {
    return [
        'isAdmin' => !empty($GLOBALS['mcp_is_admin']),
        'permissions' => $GLOBALS['mcp_perms'] ?? [],
        'sessionUserName' => (string)($user['name'] ?? ''),
        'sessionUserEmail' => (string)($user['email'] ?? ''),
    ];
}

/**
 * SQL limiting a `leads` alias to the rows this key may read (leads vs clients), or '' when nothing is excluded.
 * Put it in the WHERE of a join, never filter after LIMIT: a page must be full and must not carry rows of the other kind.
 */
function mcp_lead_scope_sql(array $user, string $alias): string {
    return ccrm_lead_scope_sql(mcp_read_scope($user), $alias);
}

/**
 * Tasks the caller may see without tasks.view_all: owner, creator or assignee, by name or e-mail
 * (the same rule as ccrm_task_scope_sql). Returns [sqlFragment, params] to AND onto a query on `tasks` (alias optional).
 */
function mcp_task_scope_for(array $user, string $alias = ''): array {
    if (mcp_can('tasks.view_all')) return ['', []];
    $a = $alias === '' ? '' : $alias . '.';
    $names = array_values(array_unique(array_filter([trim((string)($user['name'] ?? '')), trim((string)($user['email'] ?? ''))], fn($v) => $v !== '')));
    if (!$names) return ['0 = 1', []];
    $in = implode(',', array_fill(0, count($names), '?'));
    return [
        "({$a}owner IN ($in) OR {$a}created_by IN ($in) OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = {$a}id AND ta.user_name IN ($in)))",
        array_merge($names, $names, $names),
    ];
}

/** A DATETIME that holds app-local wall time (timeline_events.timestamp) as an ISO 8601 moment with the app's offset. */
function mcp_local_iso($local): ?string {
    if ($local === null || $local === '') return null;
    $t = strtotime((string)$local);
    return $t === false ? null : date('c', $t);
}

/** Each row's 'timestamp' (local wall time, kept as is) also as 'timestamp_iso'. */
function mcp_rows_timestamp_iso(array $rows): array {
    foreach ($rows as &$r) { $r['timestamp_iso'] = mcp_local_iso($r['timestamp'] ?? null); }
    unset($r);
    return $rows;
}

// ============================================================================
// list_documents / list_files  (RC11: the leads/clients module split, in SQL)
// ============================================================================

/** Documents filed on lead/client timelines. Rows of the kind this key may not read (leads vs clients) never leave SQL. */
function mcp_list_documents(\PDO $pdo, array $user, array $args): array {
    $where = ["te.type IN ('offer','order','proforma_invoice','advance_receipt','invoice','delivery_note')", 'te.hidden = 0'];
    $params = [];
    if (!empty($args['lead_id'])) {
        // The documents belong to the record the caller names: the module split applies to it, with the same not-found answer.
        $where[] = 'te.lead_id = ?';
        $params[] = (string)$args['lead_id'];
        $leadStmt = $pdo->prepare('SELECT id, adjustment FROM leads WHERE id = ?');
        $leadStmt->execute([(string)$args['lead_id']]);
        $leadRow = $leadStmt->fetch(\PDO::FETCH_ASSOC);
        if ($leadRow && !mcp_lead_module_visible($leadRow)) {
            throw new \Exception('Lead not found with ID: ' . (string)$args['lead_id']);
        }
    }
    // Without lead_id the whole table is read: the split has to be in the query (orphan rows have no record and are not shown).
    $scope = mcp_lead_scope_sql($user, 'l');
    if ($scope !== '') $where[] = $scope;
    $t = mcp_enum($args, 'type', ['offer', 'order', 'proforma_invoice', 'advance_receipt', 'invoice', 'delivery_note']);
    if ($t) { $where[] = 'te.type = ?'; $params[] = $t; }
    $limit = mcp_limit($args);
    $offset = max(0, (int)($args['offset'] ?? 0));
    $stmt = $pdo->prepare(
        'SELECT te.id, te.lead_id, te.type, te.timestamp, te.title, te.amount, te.file_name, te.file_type, te.author
         FROM timeline_events te LEFT JOIN leads l ON l.id = te.lead_id
         WHERE ' . implode(' AND ', $where) . " ORDER BY te.timestamp DESC, te.id ASC LIMIT $limit OFFSET $offset"
    );
    $stmt->execute($params);
    return mcp_rows_timestamp_iso($stmt->fetchAll(\PDO::FETCH_ASSOC));
}

/** File metadata of a lead/client timeline, behind the same module split and e-mail gate as the timeline itself. */
function mcp_list_lead_files(\PDO $pdo, array $user, array $args, string $id): array {
    $where = ['te.lead_id = ?', 'te.hidden = 0', 'te.file_name IS NOT NULL', "te.file_name <> ''"];
    $params = [$id];
    $scope = mcp_lead_scope_sql($user, 'l');
    if ($scope !== '') $where[] = $scope;
    if (!mcp_can('email')) $where[] = "te.type <> 'email'";
    $limit = mcp_limit($args, 200, 200);
    $offset = max(0, (int)($args['offset'] ?? 0));
    $stmt = $pdo->prepare(
        'SELECT te.id, te.type, te.title, te.timestamp, te.file_name, te.file_type, te.file_size
         FROM timeline_events te LEFT JOIN leads l ON l.id = te.lead_id
         WHERE ' . implode(' AND ', $where) . " ORDER BY te.timestamp DESC, te.id ASC LIMIT $limit OFFSET $offset"
    );
    $stmt->execute($params);
    return mcp_rows_timestamp_iso($stmt->fetchAll(\PDO::FETCH_ASSOC));
}

// ============================================================================
// Activity: timeline entries next to the record's own updated_at (RC3b)
// ============================================================================
//
// Decision: a timeline entry (call, note, mail, stage-change event) does NOT move leads.updated_at, because the
// app's conflict check on sync.php reads it. It shows in last_activity_at and the activity_from/activity_to filter.

/** Newest visible timeline entry per record, as Unix seconds: [lead_id => ts]. The DATETIME holds app-local wall time. */
function mcp_timeline_latest(\PDO $pdo, array $leadIds): array {
    $out = [];
    $gate = mcp_can('email') ? '' : " AND type <> 'email'";
    $ids = array_values(array_unique(array_map('strval', $leadIds)));
    foreach (array_chunk($ids, 500) as $chunk) {
        $st = $pdo->prepare('SELECT lead_id, MAX(timestamp) AS m FROM timeline_events WHERE lead_id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ") AND hidden = 0{$gate} GROUP BY lead_id");
        $st->execute($chunk);
        foreach ($st->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $t = strtotime((string)$r['m']);
            if ($t !== false) $out[(string)$r['lead_id']] = $t;
        }
    }
    return $out;
}

/** The later of the record's own change and its newest timeline entry; null when neither is known. */
function mcp_last_activity_ts($updatedTs, array $leadIds, array $latest) {
    $c = [];
    if ($updatedTs !== null && $updatedTs !== '') $c[] = (float)$updatedTs;
    foreach ($leadIds as $id) { if (isset($latest[(string)$id])) $c[] = (float)$latest[(string)$id]; }
    return $c ? max($c) : null;
}

/**
 * activity_from / activity_to: leads with a change of their own (updated_at) or a visible timeline entry inside the window.
 * The timeline side compares app-local wall time; updated_at compares as a Unix moment.
 * @return array{0: string[], 1: array}
 */
function mcp_lead_activity_where(array $args, string $alias = 'l'): array {
    $from = mcp_optional_moment($args, 'activity_from', false);
    $to = mcp_optional_moment($args, 'activity_to', true);
    if ($from === null && $to === null) return [[], []];
    $own = []; $ownP = [];
    if ($from !== null) { $own[] = "UNIX_TIMESTAMP($alias.updated_at) >= ?"; $ownP[] = $from; }
    if ($to !== null) { $own[] = "UNIX_TIMESTAMP($alias.updated_at) < ?"; $ownP[] = $to; }
    [$tl, $tlP] = mcp_local_range($args, 'activity_from', 'activity_to', 'te.timestamp');
    $gate = mcp_can('email') ? '' : " AND te.type <> 'email'";
    $sql = '((' . implode(' AND ', $own) . ") OR EXISTS (SELECT 1 FROM timeline_events te WHERE te.lead_id = $alias.id AND te.hidden = 0{$gate} AND " . implode(' AND ', $tl) . '))';
    return [[$sql], array_merge($ownP, $tlP)];
}

/** One row's TIMESTAMP columns as ISO moments, for a get_ tool that returns a SELECT * row: ['updated_at' => '2026-...+01:00']. */
function mcp_moments_of(\PDO $pdo, string $table, string $id, array $cols): array {
    $sel = implode(', ', array_map(fn($c) => mcp_moment_select($c, $c), $cols));
    $st = $pdo->prepare("SELECT $sel FROM $table WHERE id = ?");
    $st->execute([$id]);
    $row = $st->fetch(\PDO::FETCH_ASSOC);
    return $row ? mcp_row_moments($row) : array_fill_keys($cols, null);
}

// ============================================================================
// list_leads / get_lead  (RC1, RC3b, RC6, RC7a)
// ============================================================================

/** updated_at (TIMESTAMP) gets the window; leads.created_at is a DATE and takes created_from/created_to as a date range instead. */
const MCP_LEAD_WINDOW = [
    'updated' => 'l.updated_at', 'id' => 'l.id',
    'sorts' => ['created_at' => ['l.created_at', 'DESC']], 'default_sort' => 'created_at', 'default_limit' => 25,
];

function mcp_list_leads(\PDO $pdo, array $user, array $args): array {
    $where = []; $params = [];
    if (empty($args['include_archived'])) $where[] = 'l.archived = 0';
    foreach (['status' => 'l.status', 'owner' => 'l.owner', 'division' => 'l.division', 'source' => 'l.source'] as $key => $col) {
        if (!empty($args[$key])) { $where[] = "$col = ?"; $params[] = $args[$key]; }
    }
    if (!empty($args['search'])) {
        $term = '%' . $args['search'] . '%';
        $where[] = '(l.name LIKE ? OR l.email LIKE ? OR l.phone LIKE ? OR l.city LIKE ? OR l.company_id LIKE ? OR l.contact_person LIKE ?)';
        array_push($params, $term, $term, $term, $term, $term, $term);
    }
    // The leads/clients module split, in SQL, so a page is full and holds no row of the other kind.
    $scope = mcp_lead_scope_sql($user, 'l');
    if ($scope !== '') $where[] = $scope;

    // created_at is a DATE: the moment window must not see created_from/created_to.
    $winArgs = $args;
    unset($winArgs['created_from'], $winArgs['created_to']);
    $win = mcp_list_window($winArgs, MCP_LEAD_WINDOW);
    [$cw, $cp] = mcp_date_range($args, 'created', 'l.created_at');
    [$aw, $ap] = mcp_lead_activity_where($args, 'l');
    $where = array_merge($where, $win['where'], $cw, $aw);
    $params = array_merge($params, $win['params'], $cp, $ap);

    $stmt = $pdo->prepare(
        'SELECT l.id, l.name, l.city, l.client_type, l.status, l.source, l.owner, l.division, l.value, l.adjustment, l.rating, l.phone, l.email, l.contact_person, l.contact_first_name, l.contact_last_name, l.company_id, l.tax_id, l.vat_id, l.website, l.client_id, l.price_level_id, l.custom_fields_json, l.created_at, l.archived, '
        . mcp_moment_select('l.updated_at', 'updated_at')
        . ' FROM leads l WHERE ' . ($where ? implode(' AND ', $where) : '1 = 1') . ' ' . $win['tail']
    );
    $stmt->execute($params);
    $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    $latest = mcp_timeline_latest($pdo, array_column($rows, 'id'));
    return array_map(function ($l) use ($pdo, $latest) {
        $l['last_activity_at__ts'] = mcp_last_activity_ts($l['updated_at__ts'], [$l['id']], $latest);
        $l['archived'] = (int)$l['archived'] === 1;
        $l = function_exists('mcp_crm_plus_decode_lead_custom_fields') ? mcp_crm_plus_decode_lead_custom_fields($l) : $l;
        return mcp_row_moments($l) + ['url' => mcp_record_url($pdo, $l)];
    }, $rows);
}

function mcp_get_lead(\PDO $pdo, array $user, array $args): array {
    $stmt = $pdo->prepare('SELECT *, ' . mcp_moment_select('updated_at', 'updated_at') . ' FROM leads WHERE id = ?');
    $stmt->execute([$args['id']]);
    $lead = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$lead) throw new \Exception('Lead not found with ID: ' . $args['id']);
    // A client-classified row needs the clients module, a pipeline lead the leads module: the rule the list applies.
    // The not-found message is reused so the split cannot be used to probe for record existence.
    if (!mcp_lead_module_visible($lead)) throw new \Exception('Lead not found with ID: ' . $args['id']);

    $updatedTs = $lead['updated_at__ts'];
    $lead = mcp_row_moments($lead);
    if (function_exists('mcp_crm_plus_decode_lead_custom_fields')) {
        $lead = mcp_crm_plus_decode_lead_custom_fields($lead);
    }
    $evStmt = $pdo->prepare('SELECT id, type, timestamp, title, content, amount, author FROM timeline_events WHERE lead_id = ? AND hidden = 0' . (mcp_can('email') ? '' : " AND type <> 'email'") . ' ORDER BY timestamp DESC, id ASC LIMIT 20');
    $evStmt->execute([$args['id']]);
    $lead['timeline_events'] = mcp_rows_timestamp_iso($evStmt->fetchAll(\PDO::FETCH_ASSOC));
    $newest = $lead['timeline_events'] ? strtotime((string)$lead['timeline_events'][0]['timestamp']) : false;
    $lead['last_activity_at'] = mcp_format_moment(mcp_last_activity_ts($updatedTs, [(string)$args['id']], $newest === false ? [] : [(string)$args['id'] => $newest]));
    $lead['url'] = mcp_record_url($pdo, $lead);
    return $lead;
}

// ============================================================================
// list_clients / get_client_profile helpers  (a profile spans several `leads` records)
// ============================================================================

/** The window of list_clients (profiles are built and sorted in PHP; this only feeds the shared props and description). */
const MCP_CLIENT_WINDOW = [
    'updated' => 'updated_at', 'id' => 'id',
    'sorts' => ['name' => ['name', 'ASC'], 'created_at' => ['created_at', 'ASC'], 'value' => ['total_value', 'ASC']], 'default_sort' => 'name',
];

/**
 * The inputSchema properties of list_clients: the shared window props, with the sort_by text corrected for
 * this list (the shared text says created_at starts with the newest; here it ascends, as it always did).
 */
function mcp_client_window_props(): array {
    $props = mcp_window_props(MCP_CLIENT_WINDOW);
    $props['sort_by']['description'] = 'Order of the rows (default: name). name, value and created_at ascend (created_at: oldest client first); updated_at starts with the newest. sort_order=asc|desc reverses or forces the direction';
    return $props;
}

/** Sets last_activity_at__ts on each profile: its newest record change or timeline entry across all its records. */
function mcp_profiles_activity(\PDO $pdo, array $profiles): array {
    $latest = mcp_timeline_latest($pdo, array_merge(...array_column($profiles, 'lead_ids')));
    foreach ($profiles as &$p) {
        $p['last_activity_at__ts'] = mcp_last_activity_ts($p['updated_at__ts'] ?? null, $p['lead_ids'], $latest);
    }
    unset($p);
    return $profiles;
}

// ============================================================================
// Client contacts table & function-tag helpers (`client_contacts`)
// ============================================================================

function mcp_ensure_contact_tags_column(\PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $tbl = $pdo->query("SHOW TABLES LIKE 'client_contacts'")->fetchAll(\PDO::FETCH_ASSOC);
    if (!$tbl) {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `client_contacts` (
          `id` VARCHAR(64) NOT NULL PRIMARY KEY,
          `company_client_id` VARCHAR(50) NULL COMMENT 'leads.id of parent company client (NULL = standalone personal contact)',
          `name` VARCHAR(150) NOT NULL,
          `first_name` VARCHAR(100) NULL,
          `last_name` VARCHAR(100) NULL,
          `email` VARCHAR(255) NULL,
          `phone` VARCHAR(64) NULL,
          `contact_role` VARCHAR(120) NULL COMMENT 'Summary function string (e.g. CEO, Billing)',
          `contact_tags` TEXT NULL COMMENT 'JSON array of contact function tags',
          `notes` TEXT NULL,
          `archived` TINYINT(1) NOT NULL DEFAULT 0,
          `created_at` DATE NOT NULL,
          `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX `idx_cc_company` (`company_client_id`),
          INDEX `idx_cc_email` (`email`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    }
    $done = true;
}

function mcp_encode_contact_tags($tagsInput, ?string $roleFallback = null): array {
    $rawList = [];
    if (is_array($tagsInput)) {
        $rawList = $tagsInput;
    } elseif (is_string($tagsInput) && trim($tagsInput) !== '') {
        $rawList = explode(',', $tagsInput);
    } elseif ($roleFallback !== null && trim($roleFallback) !== '') {
        $rawList = explode(',', $roleFallback);
    }
    $seen = [];
    $clean = [];
    foreach ($rawList as $item) {
        $v = trim((string)$item);
        if ($v === '') continue;
        $k = mb_strtolower($v, 'UTF-8');
        if (isset($seen[$k])) continue;
        $seen[$k] = true;
        $clean[] = $v;
    }
    return [
        'tags' => $clean,
        'json' => $clean ? json_encode($clean, JSON_UNESCAPED_UNICODE) : null,
        'summary' => $clean ? mb_substr(implode(', ', $clean), 0, 120, 'UTF-8') : null,
    ];
}

function mcp_contact_tags_from_row(array $row): array {
    $raw = $row['contact_tags'] ?? null;
    if (is_string($raw) && trim($raw) !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $enc = mcp_encode_contact_tags($decoded);
            if ($enc['tags']) return $enc['tags'];
        }
    } elseif (is_array($raw) && $raw) {
        $enc = mcp_encode_contact_tags($raw);
        if ($enc['tags']) return $enc['tags'];
    }
    $role = trim((string)($row['contact_role'] ?? ''));
    if ($role === '' || strcasecmp($role, 'Contact') === 0) return [];
    return mcp_encode_contact_tags(null, $role)['tags'];
}

// ============================================================================
// list_contacts
// ============================================================================

function mcp_list_contacts(\PDO $pdo, array $args): array {
    mcp_ensure_contact_tags_column($pdo);
    $clientId = trim((string)($args['client_id'] ?? ''));
    $includeArchived = !empty($args['include_archived']);
    $filterTags = [];
    if (!empty($args['tag'])) $filterTags[] = mb_strtolower(trim((string)$args['tag']), 'UTF-8');
    if (!empty($args['tags']) && is_array($args['tags'])) {
        foreach ($args['tags'] as $t) {
            $s = mb_strtolower(trim((string)$t), 'UTF-8');
            if ($s !== '') $filterTags[] = $s;
        }
    }
    $filterTags = array_values(array_unique(array_filter($filterTags)));
    $search = mb_strtolower(trim((string)($args['search'] ?? '')), 'UTF-8');

    $matches = static function (array $item) use ($filterTags, $search): bool {
        if ($filterTags) {
            $itemTags = array_map(fn($x) => mb_strtolower((string)$x, 'UTF-8'), $item['function_tags'] ?? []);
            if (!array_intersect($filterTags, $itemTags)) return false;
        }
        if ($search !== '') {
            $hay = mb_strtolower(implode(' ', [
                (string)($item['name'] ?? ''),
                (string)($item['company_name'] ?? ''),
                (string)($item['email'] ?? ''),
                (string)($item['phone'] ?? ''),
                (string)($item['role'] ?? ''),
                implode(' ', $item['function_tags'] ?? []),
            ]), 'UTF-8');
            if (mb_strpos($hay, $search, 0, 'UTF-8') === false) return false;
        }
        return true;
    };

    $rows = [];
    if ($clientId !== '') {
        $scope = mcp_client_scope($pdo, $clientId);
        if (!$scope || !mcp_lead_module_visible($scope['record'])) return [];
        $lead = $scope['record'];
        $companyName = (string)$lead['name'];
        $rows[] = [
            'id' => $lead['id'],
            'is_primary' => true,
            'company_client_id' => $lead['id'],
            'company_name' => $companyName,
            'name' => $lead['contact_person'] ?: $lead['name'],
            'email' => $lead['email'],
            'phone' => $lead['phone'],
            'role' => 'Primary Contact',
            'function_tags' => mcp_contact_tags_from_row($lead),
            'updated_at' => mcp_format_moment(isset($lead['updated_at']) ? strtotime((string)$lead['updated_at']) : null),
        ];
        $archSql = $includeArchived ? '' : ' AND archived = 0';
        $scopeIds = $scope['ids'] ?: [$clientId];
        $in = implode(',', array_fill(0, count($scopeIds), '?'));
        $linked = $pdo->prepare(
            'SELECT id, company_client_id, name, first_name, last_name, contact_role, contact_tags, email, phone, notes, archived, '
            . mcp_moment_select('updated_at', 'updated_at')
            . " FROM `client_contacts` WHERE company_client_id IN ({$in}){$archSql} ORDER BY name ASC, id ASC"
        );
        $linked->execute($scopeIds);
        foreach ($linked->fetchAll(\PDO::FETCH_ASSOC) as $c) {
            $tags = mcp_contact_tags_from_row($c);
            $rows[] = [
                'id' => $c['id'],
                'is_primary' => false,
                'company_client_id' => $c['company_client_id'],
                'company_name' => $companyName,
                'name' => $c['name'],
                'first_name' => $c['first_name'],
                'last_name' => $c['last_name'],
                'email' => $c['email'],
                'phone' => $c['phone'],
                'role' => $c['contact_role'] ?: ($tags ? implode(', ', $tags) : 'Contact'),
                'function_tags' => $tags,
                'notes' => $c['notes'],
                'archived' => !empty($c['archived']),
                'updated_at' => mcp_format_moment($c['updated_at__ts']),
            ];
        }
    } else {
        if (!mcp_can('clients')) return [];
        $archSql = $includeArchived ? '' : ' WHERE c.archived = 0';
        $stmt = $pdo->query(
            'SELECT c.id, c.company_client_id, c.name, c.first_name, c.last_name, '
            . 'c.contact_role, c.contact_tags, c.email, c.phone, c.notes, c.archived, '
            . 'p.name AS company_name, '
            . mcp_moment_select('c.updated_at', 'updated_at')
            . " FROM `client_contacts` c LEFT JOIN `leads` p ON p.id = c.company_client_id"
            . $archSql
            . " ORDER BY p.name ASC, c.name ASC, c.id ASC"
        );
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $c) {
            $tags = mcp_contact_tags_from_row($c);
            $rows[] = [
                'id' => $c['id'],
                'is_primary' => false,
                'company_client_id' => $c['company_client_id'] ?: null,
                'company_name' => $c['company_name'] ?? null,
                'name' => $c['name'],
                'first_name' => $c['first_name'],
                'last_name' => $c['last_name'],
                'email' => $c['email'],
                'phone' => $c['phone'],
                'role' => $c['contact_role'] ?: ($tags ? implode(', ', $tags) : 'Contact'),
                'function_tags' => $tags,
                'notes' => $c['notes'],
                'archived' => !empty($c['archived']),
                'updated_at' => mcp_format_moment($c['updated_at__ts']),
            ];
        }
    }

    if ($filterTags || $search !== '') {
        $rows = array_values(array_filter($rows, $matches));
    }
    return array_slice($rows, max(0, (int)($args['offset'] ?? 0)), mcp_limit($args));
}

// ============================================================================
// list_communications  (RC9, RC6, RC2): the cross-record feed, scoped per row
// ============================================================================

function mcp_list_communications(\PDO $pdo, array $user, array $args): array {
    $where = ['te.hidden = 0'];
    $params = [];
    $leadId = trim((string)($args['lead_id'] ?? ''));
    if ($leadId !== '') {
        // The lead/client the timeline belongs to must be readable by this key (module split), not just the leads module in general.
        $leadStmt = $pdo->prepare('SELECT id, adjustment FROM leads WHERE id = ?');
        $leadStmt->execute([$leadId]);
        $leadRow = $leadStmt->fetch(\PDO::FETCH_ASSOC);
        if ($leadRow && !mcp_lead_module_visible($leadRow)) throw new \Exception("Lead not found with ID: {$leadId}");
        $where[] = 'te.lead_id = ?';
        $params[] = $leadId;
    }
    // Without lead_id the feed crosses every record: each row is held to the module split, or a leads-only key would read client activity.
    $scope = mcp_lead_scope_sql($user, 'l');
    if ($scope !== '') $where[] = $scope;
    // Mail bodies belong to the mailbox module: callers without it do not see email events.
    if (!mcp_can('email')) $where[] = "te.type <> 'email'";
    if (!empty($args['type'])) { $where[] = 'te.type = ?'; $params[] = $args['type']; }
    [$rw, $rp] = mcp_local_range($args, 'from', 'to', 'te.timestamp');
    $where = array_merge($where, $rw);
    $params = array_merge($params, $rp);

    $dir = strtoupper(mcp_enum($args, 'sort_order', ['asc', 'desc'], 'desc'));
    $limit = mcp_limit($args);
    $offset = max(0, (int)($args['offset'] ?? 0));
    $stmt = $pdo->prepare(
        'SELECT te.id, te.lead_id, l.name AS lead_name, te.type, te.timestamp, te.title, te.content, te.amount, te.is_outgoing, te.author
         FROM timeline_events te LEFT JOIN leads l ON l.id = te.lead_id
         WHERE ' . implode(' AND ', $where) . " ORDER BY te.timestamp $dir, te.id ASC LIMIT $limit OFFSET $offset"
    );
    $stmt->execute($params);
    return mcp_rows_timestamp_iso($stmt->fetchAll(\PDO::FETCH_ASSOC));
}

// ============================================================================
// list_meetings  (RC1, RC2c, RC4, RC6, RC7a)
// ============================================================================

const MCP_MEETING_WINDOW = [
    'created' => 'created_at', 'updated' => 'updated_at', 'id' => 'id',
    'sorts' => ['date' => ['date', 'DESC']], 'default_sort' => 'date',
];

function mcp_list_meetings(\PDO $pdo, array $args): array {
    $where = []; $params = [];
    if (empty($args['include_archived'])) $where[] = 'archived = 0';
    if (!empty($args['upcoming_only'])) { $where[] = 'date >= ?'; $params[] = mcp_today(); }
    $start = mcp_optional_date($args, 'start_date');
    if ($start !== null) { $where[] = 'date >= ?'; $params[] = $start; }
    if (!empty($args['lead_id'])) {
        $lid = trim((string)$args['lead_id']);
        $where[] = '(lead_id = ? OR attached_leads_json LIKE ? OR attached_clients_json LIKE ?)';
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $lid) . '%';
        array_push($params, $lid, $like, $like);
    }
    if (!empty($args['search'])) {
        $where[] = '(title LIKE ? OR notes LIKE ?)';
        array_push($params, '%' . $args['search'] . '%', '%' . $args['search'] . '%');
    }
    $win = mcp_list_window($args, MCP_MEETING_WINDOW);
    [$dw, $dp] = mcp_date_range($args, 'date', 'date');
    $where = array_merge($where, $win['where'], $dw);
    $params = array_merge($params, $win['params'], $dp);
    $stmt = $pdo->prepare(
        'SELECT id, title, date, duration, lead_id, lead_name, notes, archived, '
        . mcp_moment_select('created_at', 'created_at') . ', ' . mcp_moment_select('updated_at', 'updated_at')
        . ' FROM meeting_notes WHERE ' . ($where ? implode(' AND ', $where) : '1 = 1') . ' ' . $win['tail']
    );
    $stmt->execute($params);
    return array_map(function ($m) { $m['archived'] = (int)$m['archived'] === 1; return mcp_row_moments($m); }, $stmt->fetchAll(\PDO::FETCH_ASSOC));
}

/** Action items of meetings: a due-date range, a bucket on the due date (open = not done), paging and a stable order. */
function mcp_list_meeting_tasks(\PDO $pdo, array $args): array {
    $where = ['1 = 1']; $params = [];
    if (!empty($args['meeting_id'])) { $where[] = 'mt.meeting_id = ?'; $params[] = (string)$args['meeting_id']; }
    $st = mcp_enum($args, 'status', ['todo', 'in_progress', 'done']);
    if ($st) { $where[] = 'mt.status = ?'; $params[] = $st; }
    [$rw, $rp] = mcp_date_range($args, 'due', 'mt.due_date');
    [$bw, $bp] = mcp_date_bucket(mcp_enum($args, 'bucket', ['overdue', 'today', 'tomorrow', 'upcoming', 'done']), 'mt.due_date', ["mt.status <> 'done'", []]);
    $where = array_merge($where, $rw, $bw);
    $params = array_merge($params, $rp, $bp);
    $limit = mcp_limit($args);
    $offset = max(0, (int)($args['offset'] ?? 0));
    $stmt = $pdo->prepare(
        'SELECT mt.id, mt.meeting_id, m.title AS meeting_title, mt.title, mt.assigned_user, mt.due_date, mt.priority, mt.status
         FROM meeting_tasks mt LEFT JOIN meeting_notes m ON m.id = mt.meeting_id
         WHERE ' . implode(' AND ', $where) . " ORDER BY mt.due_date ASC, mt.id ASC LIMIT $limit OFFSET $offset"
    );
    $stmt->execute($params);
    return $stmt->fetchAll(\PDO::FETCH_ASSOC);
}

// ============================================================================
// list_tasks / get_task  (RC7a, RC4, RC8, RC10): the reference list, plus archives, a deadline range and deadline history
// ============================================================================

// ----------------------------------------------------------------------------
// Task activity: comments and tracked time next to the task's own updated_at
// ----------------------------------------------------------------------------
//
// Same decision as for leads (mcp_last_activity_ts): a comment or a time entry does NOT move tasks.updated_at,
// because sync.php's conflict check reads it and an old browser tab would then look stale. They show in
// last_activity_at and in the activity_from/activity_to filter instead.
//  - comments: timeline_events.task_id (written by add_task_comment); DATETIME holding app-local wall time.
//  - time entries: time_entries.task_id; read through the TIMESTAMP updated_at (start_at/end_at are UTC DATETIMEs).
//    They count only for a key that may see them: everyone's with time_tracking_team, else the key owner's own.

/**
 * timeline_events.task_id must exist before a task query or add_task_comment touches it. During a rollout a worker can
 * still hold the previous schema.php and skip the migration, so heal it here (once per request, never inside a transaction),
 * as sync.php does for its own columns.
 */
function mcp_ensure_task_link(\PDO $pdo): void {
    static $done = false;
    if ($done) return;
    require_once __DIR__ . '/timeline_task_link.php';
    if (!ccrm_column_exists($pdo, 'timeline_events', 'task_id')) ccrm_migrate_timeline_task_link($pdo);
    $done = true;
}

/** [sql, params] limiting time_entries rows (alias $alias) to the ones this key may see. */
function mcp_task_time_scope(array $user, string $alias = 'x'): array {
    if (!mcp_can('time_tracking')) return ['0 = 1', []];
    if (mcp_can('time_tracking_team')) return ['1 = 1', []];
    return ["$alias.user_id = ?", [(string)($user['id'] ?? '')]];
}

/** Newest comment or visible time entry per task, as Unix seconds: [task_id => ts]. */
function mcp_task_activity_latest(\PDO $pdo, array $user, array $taskIds): array {
    $out = [];
    [$timeSql, $timeParams] = mcp_task_time_scope($user, 'x');
    $ids = array_values(array_unique(array_map('strval', $taskIds)));
    foreach (array_chunk($ids, 500) as $chunk) {
        $in = implode(',', array_fill(0, count($chunk), '?'));
        $c = $pdo->prepare("SELECT task_id, MAX(timestamp) AS m FROM timeline_events WHERE task_id IN ($in) AND hidden = 0 GROUP BY task_id");
        $c->execute($chunk);
        foreach ($c->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $t = strtotime((string)$r['m']);
            if ($t !== false) $out[(string)$r['task_id']] = max($out[(string)$r['task_id']] ?? 0, $t);
        }
        $e = $pdo->prepare("SELECT x.task_id, MAX(UNIX_TIMESTAMP(x.updated_at)) AS m FROM time_entries x WHERE x.task_id IN ($in) AND x.deleted_at IS NULL AND $timeSql GROUP BY x.task_id");
        $e->execute(array_merge($chunk, $timeParams));
        foreach ($e->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            if ($r['m'] !== null) $out[(string)$r['task_id']] = max($out[(string)$r['task_id']] ?? 0, (int)$r['m']);
        }
    }
    return $out;
}

/**
 * activity_from / activity_to: tasks with a change of their own (updated_at), a comment or a visible time entry inside the window.
 * The comment side compares app-local wall time; updated_at and time entries compare as Unix moments.
 * @return array{0: string[], 1: array}
 */
function mcp_task_activity_where(array $args, array $user, string $alias = 'tasks'): array {
    $from = mcp_optional_moment($args, 'activity_from', false);
    $to = mcp_optional_moment($args, 'activity_to', true);
    if ($from === null && $to === null) return [[], []];
    $own = []; $ownP = []; $time = []; $timeP = [];
    if ($from !== null) { $own[] = "UNIX_TIMESTAMP($alias.updated_at) >= ?"; $ownP[] = $from; $time[] = 'UNIX_TIMESTAMP(x.updated_at) >= ?'; $timeP[] = $from; }
    if ($to !== null) { $own[] = "UNIX_TIMESTAMP($alias.updated_at) < ?"; $ownP[] = $to; $time[] = 'UNIX_TIMESTAMP(x.updated_at) < ?'; $timeP[] = $to; }
    [$tl, $tlP] = mcp_local_range($args, 'activity_from', 'activity_to', 'te.timestamp');
    [$timeSql, $timeScopeP] = mcp_task_time_scope($user, 'x');
    $sql = '((' . implode(' AND ', $own) . ")"
        . " OR EXISTS (SELECT 1 FROM timeline_events te WHERE te.task_id = $alias.id AND te.hidden = 0 AND " . implode(' AND ', $tl) . ')'
        . " OR EXISTS (SELECT 1 FROM time_entries x WHERE x.task_id = $alias.id AND x.deleted_at IS NULL AND $timeSql AND " . implode(' AND ', $time) . '))';
    return [[$sql], array_merge($ownP, $tlP, $timeScopeP, $timeP)];
}

/**
 * Load non-deleted task chat & activity items from `task_activities` in chronological order.
 * Returns [messages, hasMore]. Tolerates unmigrated databases by healing `task_activities` first.
 */
function mcp_read_task_chat(\PDO $pdo, string $taskId, string $kind = 'all', int $limit = 50, ?int $beforeId = null, ?int $afterId = null): array {
    require_once __DIR__ . '/task_activity_lib.php';
    ccrm_migrate_task_activities($pdo);
    $limit = max(1, min(100, $limit));
    $where = ['`task_id` = ?', '`deleted_at` IS NULL'];
    $params = [$taskId];
    if ($kind === 'comment' || $kind === 'state_change') {
        $where[] = '`kind` = ?';
        $params[] = $kind;
    }
    if ($afterId !== null && $afterId > 0) {
        $where[] = '`id` > ?';
        $params[] = $afterId;
        $order = 'ASC';
    } else {
        if ($beforeId !== null && $beforeId > 0) {
            $where[] = '`id` < ?';
            $params[] = $beforeId;
        }
        $order = 'DESC';
    }
    $fetch = $limit + 1;
    $sql = "SELECT `id`, `kind`, `event_type`, `author_name`, `body`, `meta_json`, `reactions_json`, `created_at`, `updated_at`
              FROM `task_activities`
             WHERE " . implode(' AND ', $where) . "
             ORDER BY `id` {$order}
             LIMIT {$fetch}";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
    $hasMore = count($rows) > $limit;
    if ($hasMore) {
        $rows = array_slice($rows, 0, $limit);
    }
    if ($order === 'DESC') {
        $rows = array_reverse($rows);
    }
    $messages = array_map(static function (array $r): array {
        $meta = (!empty($r['meta_json']) && is_string($r['meta_json'])) ? json_decode($r['meta_json'], true) : null;
        $rx = ccrm_normalize_reaction_map($r['reactions_json'] ?? null);
        $created = (string)($r['created_at'] ?? '');
        return [
            'id' => (int)$r['id'],
            'kind' => (string)$r['kind'],
            'event_type' => $r['event_type'] !== null ? (string)$r['event_type'] : null,
            'author_name' => (string)($r['author_name'] ?? ''),
            'body' => $r['body'] !== null ? (string)$r['body'] : '',
            'meta' => is_array($meta) ? $meta : null,
            'reactions' => !empty($rx) ? $rx : (object)[],
            'created_at' => $created,
            'created_at_iso' => mcp_local_iso($created !== '' ? substr($created, 0, 19) : null),
        ];
    }, $rows);
    return [$messages, $hasMore];
}

function mcp_list_tasks(\PDO $pdo, array $user, array $args): array {
    mcp_ensure_task_link($pdo);
    require_once __DIR__ . '/task_activity_lib.php';
    ccrm_migrate_task_activities($pdo);
    require_once __DIR__ . '/task_files_lib.php';
    ccrm_migrate_task_files($pdo);
    $where = []; $params = [];
    if (empty($args['include_archived'])) $where[] = 'archived = 0';
    foreach (['status' => 'status', 'priority' => 'priority', 'owner' => 'owner', 'project_id' => 'related_project_id', 'client_id' => 'related_lead_id'] as $key => $col) {
        if (!empty($args[$key])) { $where[] = "$col = ?"; $params[] = $args[$key]; }
    }
    if (array_key_exists('has_conclusion', $args)) {
        $want = filter_var($args['has_conclusion'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($want === null) throw new \InvalidArgumentException("'has_conclusion' must be true or false.");
        $where[] = $want
            ? "(conclusion IS NOT NULL AND TRIM(conclusion) <> '')"
            : "(conclusion IS NULL OR TRIM(conclusion) = '')";
    }
    if (!empty($args['search'])) {
        $term = '%' . $args['search'] . '%';
        $where[] = '(title LIKE ? OR description LIKE ? OR conclusion LIKE ?)';
        array_push($params, $term, $term, $term);
    }
    [$scopeSql, $scopeParams] = mcp_task_scope($user);
    if ($scopeSql !== '') { $where[] = $scopeSql; $params = array_merge($params, $scopeParams); }
    // The shared window (mcp_window.php): created_*/updated_*, sort_by/sort_order, limit/offset.
    $win = mcp_list_window($args, MCP_TASK_WINDOW);
    $bucket = mcp_enum($args, 'bucket', ['overdue', 'today', 'tomorrow', 'upcoming', 'done']);
    [$bWhere, $bParams] = $bucket ? mcp_date_bucket($bucket, 'deadline', mcp_open_task_sql($pdo), "COALESCE(NULLIF(deadline_time, ''), '23:59')") : [[], []];
    [$dWhere, $dParams] = mcp_date_range($args, 'deadline', 'deadline');
    [$aWhere, $aParams] = mcp_task_activity_where($args, $user, 'tasks');
    $where = array_merge($where, $win['where'], $bWhere, $dWhere, $aWhere, [ccrm_sql_real_tasks()]);
    $params = array_merge($params, $win['params'], $bParams, $dParams, $aParams);
    $stmt = $pdo->prepare(
        'SELECT id, title, description, priority, deadline, deadline_time, original_deadline, deadline_moves, status, owner, created_by, related_lead_id, related_project_id,
                completed_by, completed_at, requires_conclusion, conclusion, comment_count, file_count, archived, ' . (ccrm_tasks_have_category($pdo) ? 'category, ' : '') . mcp_moment_select('created_at', 'created_at') . ', ' . mcp_moment_select('updated_at', 'updated_at')
        . ' FROM tasks /* recurring-template: where holds ccrm_sql_real_tasks */ WHERE ' . implode(' AND ', $where) . ' ' . $win['tail']
    );
    $stmt->execute($params);
    $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    $latest = mcp_task_activity_latest($pdo, $user, array_column($rows, 'id'));
    return array_map(function ($t) use ($latest) {
        $t['archived'] = (int)$t['archived'] === 1;
        $t['requires_conclusion'] = (int)($t['requires_conclusion'] ?? 0) === 1;
        $t['conclusion'] = $t['conclusion'] ?? null;
        $t['comment_count'] = (int)($t['comment_count'] ?? 0);
        $t['file_count'] = (int)($t['file_count'] ?? 0);
        $t['category'] = $t['category'] ?? null; // null too on a database not migrated yet
        $t['deadline_moves'] = (int)$t['deadline_moves'];
        $t['completed_at_iso'] = mcp_local_iso($t['completed_at']);
        $t['last_activity_at__ts'] = mcp_last_activity_ts($t['updated_at__ts'], [(string)$t['id']], $latest);
        return mcp_row_moments($t);
    }, $rows);
}

function mcp_get_task(\PDO $pdo, array $user, array $args): array {
    mcp_ensure_task_link($pdo);
    [$scopeSql, $scopeParams] = mcp_task_scope($user);
    $stmt = $pdo->prepare('SELECT *, UNIX_TIMESTAMP(created_at) AS created_ts, UNIX_TIMESTAMP(updated_at) AS updated_ts FROM tasks WHERE id = ? AND ' . ccrm_sql_real_tasks() . ($scopeSql !== '' ? " AND $scopeSql" : ''));
    $stmt->execute(array_merge([$args['id']], $scopeParams));
    $task = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$task) throw new \Exception('Task not found with ID: ' . $args['id']);
    // last_activity_at needs the raw updated_ts, which mcp_task_moments removes.
    $latest = mcp_task_activity_latest($pdo, $user, [(string)$args['id']]);
    $lastActivityTs = mcp_last_activity_ts($task['updated_ts'], [(string)$args['id']], $latest);
    $task = mcp_task_moments($task);
    $task['requires_conclusion'] = (int)($task['requires_conclusion'] ?? 0) === 1;
    $task['conclusion'] = $task['conclusion'] ?? null;
    $task['comment_count'] = (int)($task['comment_count'] ?? 0);
    $task['file_count'] = (int)($task['file_count'] ?? 0);
    $task['category'] = $task['category'] ?? null; // "bug" or null; null too on a database not migrated yet
    $task['last_activity_at'] = mcp_format_moment($lastActivityTs);
    // completed_at is a local "YYYY-MM-DD HH:MM" string; the same moment with the offset sits beside it.
    $task['completed_at_iso'] = mcp_local_iso($task['completed_at'] ?? null);
    $as = $pdo->prepare('SELECT user_name FROM task_assignees WHERE task_id = ?');
    $as->execute([$args['id']]);
    $task['assignees'] = $as->fetchAll(\PDO::FETCH_COLUMN);
    $tg = $pdo->prepare('SELECT tag_name FROM task_tags WHERE task_id = ?');
    $tg->execute([$args['id']]);
    $task['tags'] = $tg->fetchAll(\PDO::FETCH_COLUMN);
    [$chat, $chatHasMore] = mcp_read_task_chat($pdo, (string)$args['id'], 'all', 50);
    $task['chat'] = $chat;
    $task['chat_has_more'] = $chatHasMore;
    require_once __DIR__ . '/task_files_lib.php';
    ccrm_migrate_task_files($pdo);
    $tfStmt = $pdo->prepare("SELECT * FROM `task_files` WHERE `task_id` = ? AND `deleted_at` IS NULL ORDER BY `created_at` DESC, `id` DESC LIMIT 200");
    $tfStmt->execute([(string)$args['id']]);
    $task['files'] = array_map('ccrm_task_file_to_json', $tfStmt->fetchAll(\PDO::FETCH_ASSOC) ?: []);
    return $task;
}

function mcp_get_task_chat(\PDO $pdo, array $user, array $args): array {
    mcp_ensure_task_link($pdo);
    $taskId = mcp_require_string($args, 'task_id');
    [$scopeSql, $scopeParams] = mcp_task_scope($user);
    $stmt = $pdo->prepare('SELECT id, title, status, requires_conclusion, conclusion, comment_count FROM tasks WHERE id = ? AND ' . ccrm_sql_real_tasks() . ($scopeSql !== '' ? " AND $scopeSql" : ''));
    $stmt->execute(array_merge([$taskId], $scopeParams));
    $task = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$task) throw new \Exception('Task not found with ID: ' . $taskId);

    $kind = mcp_enum($args, 'kind', ['all', 'comment', 'state_change'], 'all');
    $limit = isset($args['limit']) ? (int)$args['limit'] : 50;
    $beforeId = isset($args['before_id']) && is_numeric($args['before_id']) ? (int)$args['before_id'] : null;
    $afterId = isset($args['after_id']) && is_numeric($args['after_id']) ? (int)$args['after_id'] : null;

    [$messages, $hasMore] = mcp_read_task_chat($pdo, $taskId, $kind, $limit, $beforeId, $afterId);

    $tlStmt = $pdo->prepare(
        'SELECT id, timestamp, title, content, author FROM timeline_events WHERE task_id = ? AND hidden = 0 ORDER BY timestamp ASC LIMIT 50'
    );
    $tlStmt->execute([$taskId]);
    $timelineComments = array_map(static function (array $r): array {
        return [
            'id' => (string)$r['id'],
            'author' => (string)($r['author'] ?? ''),
            'title' => (string)($r['title'] ?? ''),
            'content' => (string)($r['content'] ?? ''),
            'timestamp' => (string)($r['timestamp'] ?? ''),
            'timestamp_iso' => mcp_local_iso($r['timestamp'] ?? null),
        ];
    }, $tlStmt->fetchAll(\PDO::FETCH_ASSOC) ?: []);

    return [
        'task_id' => (string)$task['id'],
        'task_title' => (string)$task['title'],
        'status' => (string)$task['status'],
        'requires_conclusion' => (int)($task['requires_conclusion'] ?? 0) === 1,
        'conclusion' => $task['conclusion'] ?? null,
        'comment_count' => (int)($task['comment_count'] ?? 0),
        'messages' => $messages,
        'has_more' => $hasMore,
        'timeline_comments' => $timelineComments,
    ];
}

// ============================================================================
// Tool definitions (kept here so mcp.php does not grow): mcp_crm_defs()['list_leads'] etc.
// ============================================================================

/** The sentence about timeline timestamps: which clock they hold and how to read them. */
function mcp_timeline_zone_note(): string {
    return 'timestamp is the time the app stored for the entry, in ' . KOPERNIQ_PRODUCT_NAME . ' local time (' . mcp_zone() . '), as entered; timestamp_iso is the same moment with the time-zone offset.';
}

function mcp_crm_defs(): array {
    $s = fn(string $d) => ['type' => 'string', 'description' => $d];
    $zone = mcp_zone_note();
    return [
        'list_leads' => [
            'name' => 'list_leads',
            'description' => 'List and filter sales leads and pipeline opportunities. Only records of the kind your key may read (leads or clients) are listed, in full pages; archived ones only with include_archived=true (each row says archived). '
                . 'created_at is the creation DATE (no time of day was ever stored): filter it with created_from/created_to (YYYY-MM-DD, both inclusive). '
                . 'updated_at moves when the lead record itself changes (edited, stage moved, archived, restored); a new timeline entry (call, note, mail) does NOT move it. '
                . 'last_activity_at is the later of updated_at and the newest timeline entry of the lead (an appointment entered for a future time counts at that time); '
                . 'activity_from/activity_to select leads with a record change or a timeline entry inside that window. '
                . mcp_window_doc('leads', MCP_LEAD_WINDOW),
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'status' => $s('Filter by status: new, contacted, proposal_sent, negotiation, won, lost'),
                    'division' => $s('Filter by division'),
                    'source' => $s('Filter by lead source'),
                    'search' => $s('Search across lead name, email, phone, city, ICO, contact person'),
                    'owner' => $s('Filter by assigned owner/manager name'),
                    'include_archived' => ['type' => 'boolean', 'description' => 'Also list archived leads (default false)'],
                    'activity_from' => $s('Record changed or timeline entry at or after: YYYY-MM-DD or YYYY-MM-DD HH:MM'),
                    'activity_to' => $s('Record changed or timeline entry before: YYYY-MM-DD HH:MM (exclusive), or YYYY-MM-DD for up to the end of that day'),
                ] + mcp_date_range_props('created', 'Created (date)') + mcp_window_props(MCP_LEAD_WINDOW),
            ],
        ],
        'get_lead' => [
            'name' => 'get_lead',
            'description' => 'Get full details of a specific lead by ID, including recent timeline events and notes. updated_at is an ISO moment with the offset; created_at is the creation date. '
                . 'last_activity_at is the later of updated_at and the newest timeline entry. Each of the (up to 20, newest first) timeline_events carries timestamp and timestamp_iso: ' . mcp_timeline_zone_note(),
            'inputSchema' => ['type' => 'object', 'properties' => ['id' => $s('The lead ID')], 'required' => ['id']],
        ],
        'list_clients' => [
            'name' => 'list_clients',
            'description' => 'List clients as the Clients register shows them: one profile per client name (records with the same name are combined; total_value = sum of their lead values plus the client value adjustment). Pipeline leads are not clients. '
                . 'A profile spans several records: its updated_at is the newest updated_at of its records, and last_activity_at is the later of that and the newest timeline entry of any of them. created_at is the earliest creation date. '
                . 'Order: sort_by=name (default), value and created_at ascend (created_at lists the oldest client first), updated_at starts with the newest; sort_order reverses it. '
                . mcp_window_doc('clients', MCP_CLIENT_WINDOW),
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'search' => $s('Search by client name, email, ICO, phone'),
                    'city' => $s('Filter by city'),
                    'client_type' => $s('Filter by client type: business, person, partner'),
                    'include_archived' => ['type' => 'boolean', 'description' => 'Include archived clients (default false)'],
                ] + mcp_client_window_props(),
            ],
        ],
        'get_client' => [
            'name' => 'get_client',
            'description' => 'Get a client record with the projects and invoicing documents of the whole client: every record sharing its name (as the Clients register shows it), plus unlinked projects named for it (linked_by = name_match). Projects carry the resolved contract value, status group, invoice date (invoice_date), deadline (completion_deadline) and url; documents carry payment status. updated_at is an ISO moment with the offset. For one-call context use get_client_dossier.',
            'inputSchema' => ['type' => 'object', 'properties' => ['id' => $s('The client ID')], 'required' => ['id']],
        ],
        'list_contacts' => [
            'name' => 'list_contacts',
            'description' => 'List company contacts with name, phone, email, company, and function_tags. Pass client_id for one company (primary + linked contacts), or omit client_id to list/datamine contacts across all companies; filter by tag / tags or search. updated_at is an ISO moment. Pages: limit + offset.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'client_id' => $s('Optional client/company ID; omit to list contacts across all companies'),
                    'tag' => $s('Filter by a single function tag (case-insensitive, e.g. "CEO" or "Billing")'),
                    'tags' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Filter by any of these function tags (case-insensitive)'],
                    'search' => $s('Search across contact name, company name, email, phone, and function tags'),
                    'include_archived' => ['type' => 'boolean', 'description' => 'Include archived contacts (default false)'],
                    'limit' => ['type' => 'integer', 'description' => 'Max rows (default 50, at most 100)'],
                    'offset' => ['type' => 'integer', 'description' => 'Rows to skip, for the next page'],
                ],
            ],
        ],
        'list_tasks' => [
            'name' => 'list_tasks',
            'description' => 'List and filter tasks across projects, clients, and team members (including closed tasks with bucket="done"). '
                . 'Each row includes requires_conclusion (bool), conclusion (completion note or null), comment_count (task chat messages), and file_count (attached task files). '
                . 'updated_at moves on any edit to the task, including its assignees and tags, and when it is archived or restored; comments and tracked time do not move it. '
                . 'last_activity_at is the later of updated_at, the newest comment added with add_task_comment and the newest time entry on the task (time entries count only if your key may see them); '
                . 'activity_from/activity_to select tasks with an edit, a comment or a time entry inside that window, so use them for "what happened on tasks since X" and updated_from/updated_to for "which tasks were edited". '
                . 'Comments written before this field existed count only where one task of the client has that title. '
                . 'Archived tasks are left out unless include_archived=true (each row says archived), so an archive can be found with include_archived + updated_from. '
                . 'deadline_from/deadline_to take a deadline range (inclusive dates); original_deadline is the deadline the task was first given and deadline_moves how many times it was pushed later. '
                . 'completed_at is a local "YYYY-MM-DD HH:MM" string; completed_at_iso is the same moment with the offset. category is "bug" for a task marked as a Bug, otherwise null. '
                . mcp_window_doc('tasks', MCP_TASK_WINDOW),
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'status' => $s('Filter by a configured task status'),
                    'priority' => $s('Filter by priority: low, medium, high'),
                    'owner' => $s('Filter by assignee name'),
                    'project_id' => $s('Filter by related project ID'),
                    'client_id' => $s('Filter by related client ID'),
                    'search' => $s('Search task titles, descriptions, and conclusions'),
                    'has_conclusion' => ['type' => 'boolean', 'description' => 'true = only tasks with a non-empty conclusion; false = only tasks without a conclusion'],
                    'include_archived' => ['type' => 'boolean', 'description' => 'Also list archived tasks (default false)'],
                    'activity_from' => $s('Edited, commented or time tracked at or after: YYYY-MM-DD or YYYY-MM-DD HH:MM'),
                    'activity_to' => $s('Edited, commented or time tracked before: YYYY-MM-DD HH:MM (exclusive), or YYYY-MM-DD for up to the end of that day'),
                ] + mcp_bucket_prop('deadline') + mcp_date_range_props('deadline', 'Deadline') + mcp_window_props(MCP_TASK_WINDOW),
            ],
        ],
        'get_task' => [
            'name' => 'get_task',
            'description' => 'Retrieve full task details, assignees, tags, conclusion (requires_conclusion + conclusion), attached files (files, file_count), and recent task chat/activity messages (chat, chat_has_more, comment_count). created_at and updated_at are ISO moments with the offset; last_activity_at is the later of updated_at, the newest comment and the newest time entry you may see; completed_at is a local "YYYY-MM-DD HH:MM" string and completed_at_iso the same moment with the offset; original_deadline and deadline_moves show how often the deadline was pushed; category is "bug" for a task marked as a Bug, otherwise null.',
            'inputSchema' => ['type' => 'object', 'properties' => ['id' => $s('Task ID')], 'required' => ['id']],
        ],
        'get_task_chat' => [
            'name' => 'get_task_chat',
            'description' => 'Read the chat messages and activity history on a task (from task_activities), along with the task\'s conclusion and any legacy timeline comments. Supports pagination via before_id / after_id and filtering by kind ("all", "comment", or "state_change").',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'task_id' => $s('Task ID'),
                    'kind' => $s('Filter entries: "all" (default), "comment" (chat messages only), or "state_change" (status/field audit events)'),
                    'limit' => ['type' => 'integer', 'description' => 'Max messages to return (default 50, max 100)'],
                    'before_id' => ['type' => 'integer', 'description' => 'Return older messages with id < before_id'],
                    'after_id' => ['type' => 'integer', 'description' => 'Return newer messages with id > after_id'],
                ],
                'required' => ['task_id'],
            ],
        ],
        'list_meetings' => [
            'name' => 'list_meetings',
            'description' => 'Query scheduled client meetings and meeting notes. date is the meeting day: filter it with date_from/date_to (inclusive), start_date (same as date_from) or upcoming_only (today onward, in ' . mcp_zone() . '). '
                . 'Archived meetings are left out unless include_archived=true (each row says archived). Each meeting carries created_at and updated_at. '
                . mcp_window_doc('meetings', MCP_MEETING_WINDOW),
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'lead_id' => $s('Filter by linked lead or client ID'),
                    'upcoming_only' => ['type' => 'boolean', 'description' => 'Only meetings dated today or later'],
                    'start_date' => $s('From date (YYYY-MM-DD)'),
                    'search' => $s('Search meeting title or notes'),
                    'include_archived' => ['type' => 'boolean', 'description' => 'Also list archived meetings (default false)'],
                ] + mcp_date_range_props('date', 'Meeting date') + mcp_window_props(MCP_MEETING_WINDOW),
            ],
        ],
        'list_communications' => [
            'name' => 'list_communications',
            'description' => 'List interaction history (calls, emails, notes, stage changes) of one lead or client, or, without lead_id, the activity feed across every lead and client your key may read (each row names its lead_name). '
                . mcp_timeline_zone_note() . ' Filter with from/to on timestamp: ' . $zone . ' '
                . 'from is inclusive and to is exclusive when it carries a time, so the entry you saw last comes back once: to poll, call with sort_order=asc and from = the last timestamp you saw, and skip rows with ids you already have. '
                . 'Default order: newest first. Pages: limit + offset; fewer rows than limit means the last page.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'lead_id' => $s('Lead or client ID; leave out for the feed across all records'),
                    'type' => $s('Filter by event type: phone, email, note, appointment, status_change'),
                    'from' => $s('Timestamp at or after: YYYY-MM-DD or YYYY-MM-DD HH:MM'),
                    'to' => $s('Timestamp before: YYYY-MM-DD HH:MM (exclusive), or YYYY-MM-DD for up to the end of that day'),
                    'sort_order' => ['type' => 'string', 'enum' => ['asc', 'desc'], 'description' => 'Order by timestamp (default desc, newest first)'],
                    'limit' => ['type' => 'integer', 'description' => 'Max rows (default 50, at most 100)'],
                    'offset' => ['type' => 'integer', 'description' => 'Rows to skip, for the next page'],
                ],
            ],
        ],
    ];
}
