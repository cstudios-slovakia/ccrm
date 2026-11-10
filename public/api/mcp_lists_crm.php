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
    foreach (['status' => 'l.status', 'owner' => 'l.owner'] as $key => $col) {
        if (!empty($args[$key])) { $where[] = "$col = ?"; $params[] = $args[$key]; }
    }
    if (!empty($args['search'])) {
        $term = '%' . $args['search'] . '%';
        $where[] = '(l.name LIKE ? OR l.email LIKE ? OR l.phone LIKE ? OR l.city LIKE ?)';
        array_push($params, $term, $term, $term, $term);
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
        'SELECT l.id, l.name, l.city, l.client_type, l.status, l.source, l.owner, l.division, l.value, l.adjustment, l.rating, l.phone, l.email, l.contact_person, l.created_at, l.archived, '
        . mcp_moment_select('l.updated_at', 'updated_at')
        . ' FROM leads l WHERE ' . ($where ? implode(' AND ', $where) : '1 = 1') . ' ' . $win['tail']
    );
    $stmt->execute($params);
    $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    $latest = mcp_timeline_latest($pdo, array_column($rows, 'id'));
    return array_map(function ($l) use ($pdo, $latest) {
        $l['last_activity_at__ts'] = mcp_last_activity_ts($l['updated_at__ts'], [$l['id']], $latest);
        $l['archived'] = (int)$l['archived'] === 1;
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
// list_contacts
// ============================================================================

function mcp_list_contacts(\PDO $pdo, array $args): array {
    $stmt = $pdo->prepare('SELECT id, name, adjustment, contact_person, email, phone, ' . mcp_moment_select('updated_at', 'updated_at') . ' FROM leads WHERE id = ?');
    $stmt->execute([$args['client_id']]);
    $lead = $stmt->fetch(\PDO::FETCH_ASSOC);
    // The record's kind needs its module, as everywhere else (the answer for "not readable" is the answer for "not there").
    if (!$lead || !mcp_lead_module_visible($lead)) return [];
    $rows = [[
        'name' => $lead['contact_person'] ?: $lead['name'],
        'email' => $lead['email'],
        'phone' => $lead['phone'],
        'role' => 'Primary Contact',
        'updated_at' => mcp_format_moment($lead['updated_at__ts']),
    ]];
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

function mcp_list_tasks(\PDO $pdo, array $user, array $args): array {
    $where = []; $params = [];
    if (empty($args['include_archived'])) $where[] = 'archived = 0';
    foreach (['status' => 'status', 'priority' => 'priority', 'owner' => 'owner', 'project_id' => 'related_project_id', 'client_id' => 'related_lead_id'] as $key => $col) {
        if (!empty($args[$key])) { $where[] = "$col = ?"; $params[] = $args[$key]; }
    }
    if (!empty($args['search'])) {
        $term = '%' . $args['search'] . '%';
        $where[] = '(title LIKE ? OR description LIKE ?)';
        array_push($params, $term, $term);
    }
    [$scopeSql, $scopeParams] = mcp_task_scope($user);
    if ($scopeSql !== '') { $where[] = $scopeSql; $params = array_merge($params, $scopeParams); }
    // The shared window (mcp_window.php): created_*/updated_*, sort_by/sort_order, limit/offset.
    $win = mcp_list_window($args, MCP_TASK_WINDOW);
    $bucket = mcp_enum($args, 'bucket', ['overdue', 'today', 'tomorrow', 'upcoming', 'done']);
    [$bWhere, $bParams] = $bucket ? mcp_date_bucket($bucket, 'deadline', mcp_open_task_sql($pdo), "COALESCE(NULLIF(deadline_time, ''), '23:59')") : [[], []];
    [$dWhere, $dParams] = mcp_date_range($args, 'deadline', 'deadline');
    $where = array_merge($where, $win['where'], $bWhere, $dWhere, [ccrm_sql_real_tasks()]);
    $params = array_merge($params, $win['params'], $bParams, $dParams);
    $stmt = $pdo->prepare(
        'SELECT id, title, description, priority, deadline, deadline_time, original_deadline, deadline_moves, status, owner, created_by, related_lead_id, related_project_id,
                completed_by, completed_at, archived, ' . mcp_moment_select('created_at', 'created_at') . ', ' . mcp_moment_select('updated_at', 'updated_at')
        . ' FROM tasks WHERE ' . implode(' AND ', $where) . ' ' . $win['tail']
    );
    $stmt->execute($params);
    return array_map(function ($t) {
        $t['archived'] = (int)$t['archived'] === 1;
        $t['deadline_moves'] = (int)$t['deadline_moves'];
        $t['completed_at_iso'] = mcp_local_iso($t['completed_at']);
        return mcp_row_moments($t);
    }, $stmt->fetchAll(\PDO::FETCH_ASSOC));
}

function mcp_get_task(\PDO $pdo, array $user, array $args): array {
    [$scopeSql, $scopeParams] = mcp_task_scope($user);
    $stmt = $pdo->prepare('SELECT *, UNIX_TIMESTAMP(created_at) AS created_ts, UNIX_TIMESTAMP(updated_at) AS updated_ts FROM tasks WHERE id = ? AND ' . ccrm_sql_real_tasks() . ($scopeSql !== '' ? " AND $scopeSql" : ''));
    $stmt->execute(array_merge([$args['id']], $scopeParams));
    $task = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$task) throw new \Exception('Task not found with ID: ' . $args['id']);
    $task = mcp_task_moments($task);
    // completed_at is a local "YYYY-MM-DD HH:MM" string; the same moment with the offset sits beside it.
    $task['completed_at_iso'] = mcp_local_iso($task['completed_at'] ?? null);
    $as = $pdo->prepare('SELECT user_name FROM task_assignees WHERE task_id = ?');
    $as->execute([$args['id']]);
    $task['assignees'] = $as->fetchAll(\PDO::FETCH_COLUMN);
    $tg = $pdo->prepare('SELECT tag_name FROM task_tags WHERE task_id = ?');
    $tg->execute([$args['id']]);
    $task['tags'] = $tg->fetchAll(\PDO::FETCH_COLUMN);
    return $task;
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
                    'search' => $s('Search across lead name, email, phone, city'),
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
                . mcp_window_doc('clients', MCP_CLIENT_WINDOW),
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'search' => $s('Search by client name, email, ICO, phone'),
                    'city' => $s('Filter by city'),
                    'client_type' => $s('Filter by client type: business, person, partner'),
                    'include_archived' => ['type' => 'boolean', 'description' => 'Include archived clients (default false)'],
                ] + mcp_window_props(MCP_CLIENT_WINDOW),
            ],
        ],
        'get_client' => [
            'name' => 'get_client',
            'description' => 'Get a client record with the projects and invoicing documents of the whole client: every record sharing its name (as the Clients register shows it), plus unlinked projects named for it (linked_by = name_match). Projects carry the resolved contract value, status group, invoice date (invoice_date), deadline (completion_deadline) and url; documents carry payment status. updated_at is an ISO moment with the offset. For one-call context use get_client_dossier.',
            'inputSchema' => ['type' => 'object', 'properties' => ['id' => $s('The client ID')], 'required' => ['id']],
        ],
        'list_contacts' => [
            'name' => 'list_contacts',
            'description' => 'List contacts associated with a specific client: its primary contact (contact person, email, phone). updated_at is the last change of the record the contact is stored on, as an ISO moment. Contacts added with create_contact are timeline notes and are not listed here. Pages: limit + offset.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'client_id' => $s('Client ID'),
                    'limit' => ['type' => 'integer', 'description' => 'Max rows (default 50, at most 100)'],
                    'offset' => ['type' => 'integer', 'description' => 'Rows to skip, for the next page'],
                ],
                'required' => ['client_id'],
            ],
        ],
        'list_tasks' => [
            'name' => 'list_tasks',
            'description' => 'List and filter tasks across projects, clients, and team members. '
                . 'updated_at moves on any edit to the task, including its assignees and tags, and when it is archived or restored; comments are on the linked client timeline and do not count. '
                . 'Archived tasks are left out unless include_archived=true (each row says archived), so an archive can be found with include_archived + updated_from. '
                . 'deadline_from/deadline_to take a deadline range (inclusive dates); original_deadline is the deadline the task was first given and deadline_moves how many times it was pushed later. '
                . 'completed_at is a local "YYYY-MM-DD HH:MM" string; completed_at_iso is the same moment with the offset. '
                . mcp_window_doc('tasks', MCP_TASK_WINDOW),
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'status' => $s('Filter by a configured task status'),
                    'priority' => $s('Filter by priority: low, medium, high'),
                    'owner' => $s('Filter by assignee name'),
                    'project_id' => $s('Filter by related project ID'),
                    'client_id' => $s('Filter by related client ID'),
                    'search' => $s('Search task titles and descriptions'),
                    'include_archived' => ['type' => 'boolean', 'description' => 'Also list archived tasks (default false)'],
                ] + mcp_bucket_prop('deadline') + mcp_date_range_props('deadline', 'Deadline') + mcp_window_props(MCP_TASK_WINDOW),
            ],
        ],
        'get_task' => [
            'name' => 'get_task',
            'description' => 'Retrieve full task details, assignees, and tags. created_at and updated_at are ISO moments with the offset; completed_at is a local "YYYY-MM-DD HH:MM" string and completed_at_iso the same moment with the offset; original_deadline and deadline_moves show how often the deadline was pushed.',
            'inputSchema' => ['type' => 'object', 'properties' => ['id' => $s('Task ID')], 'required' => ['id']],
        ],
        'list_meetings' => [
            'name' => 'list_meetings',
            'description' => 'Query scheduled client meetings and meeting notes. date is the meeting day: filter it with date_from/date_to (inclusive), start_date (same as date_from) or upcoming_only (today onward, in ' . mcp_zone() . '). '
                . 'Archived meetings are left out unless include_archived=true (each row says archived). Each meeting carries created_at and updated_at. '
                . mcp_window_doc('meetings', MCP_MEETING_WINDOW),
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
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
