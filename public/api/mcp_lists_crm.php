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
// @@END
