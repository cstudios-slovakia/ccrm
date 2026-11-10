<?php
/**
 * MCP tool list_deleted_records: which records were deleted since X.
 *
 * Reads the `deleted_records` tombstones that sync.php writes (api/deleted_records.php). Closes
 * RC7b of docs/audits/mcp-change-visibility-audit.md: a deleted record vanishes from every list
 * tool, and nothing else tells "deleted" from "never existed".
 *
 * Visibility follows the list tool of the same record: a row is returned only when the key's owner
 * may view that record's module (see mcp_deleted_entity_rules()). The filter runs in SQL, so a page
 * is full. This file never deletes anything: it only reads.
 */

/**
 * The entity names the tool shows, with what the key's owner must be able to view to see them.
 * 'clients' is not a table: it is the `leads` rows whose tombstone says they were client records.
 *
 * @return array<string,string[]> entity => module keys that must ALL be viewable
 */
function mcp_deleted_entity_rules(): array {
    return [
        'leads' => ['leads'],
        'clients' => ['clients'],
        // list_tasks scopes rows to the caller's own tasks without tasks.view_all; the assignees of a deleted
        // task are gone, so a tombstone cannot be judged per row and needs the view-all permission.
        'tasks' => ['tasks', 'tasks.view_all'],
        'meeting_notes' => ['meetings'],
        'projects' => ['projects'],
        'invoices_offers' => ['invoices'],
        'financial_records' => ['financial'],
        'employees' => ['employees'],
        'employee_salaries' => ['employees', 'employees.salaries'],
        'employee_vacations' => ['employees', 'employees.vacations'],
        'warehouse_items' => ['warehouse'],
        'warehouse_batches' => ['warehouse'],
        'warehouse_movements' => ['warehouse'],
        'suppliers' => ['warehouse'],
        'warehouses' => ['warehouse'],
    ];
}

/** SQL condition on `deleted_records` for one entity name (a table, or the virtual 'clients'). */
function mcp_deleted_entity_sql(string $entity): string {
    $client = "extra LIKE '%\"client\":true%'";
    if ($entity === 'clients') return "(entity = 'leads' AND $client)";
    if ($entity === 'leads') return "(entity = 'leads' AND (extra IS NULL OR extra NOT LIKE '%\"client\":true%'))";
    return "(entity = '" . str_replace("'", '', $entity) . "')";
}

function mcp_deleted_tool_definitions(): array {
    return [
        [
            'name' => 'list_deleted_records',
            'description' => 'List records that were deleted: one row per deleted record with entity, entity_id, label (the name or title it had), deleted_at (ISO 8601 moment with the '
                . KOPERNIQ_PRODUCT_NAME . ' time-zone offset) and deleted_by (the user). Entities: ' . implode(', ', array_keys(mcp_deleted_entity_rules()))
                . ' (clients are leads-table records that were client records; invoices_offers covers invoices and price offers). You only see the deletions of records whose module you may view '
                . '(tasks: only with the permission to view all tasks). Archiving is not a deletion, and neither is replacing the child rows of a record when it is saved (timeline entries, action items, '
                . 'line items, Gantt rows, managers). Oldest first by default, so a poller can page safely: use deleted_from = the last deleted_at you saw with sort_order asc; a row at that very second can '
                . 'repeat, so skip entity + entity_id pairs you already have. Deletions are only recorded from the version that added this tool on; earlier deletions are not known. '
                . mcp_zone_note() . ' Pages: limit + offset; fewer rows than limit means the last page.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'entity' => ['type' => 'string', 'enum' => array_keys(mcp_deleted_entity_rules()), 'description' => 'Only this kind of record'],
                'deleted_from' => ['type' => 'string', 'description' => 'Deleted at or after: YYYY-MM-DD or YYYY-MM-DD HH:MM'],
                'deleted_to' => ['type' => 'string', 'description' => 'Deleted before: YYYY-MM-DD HH:MM (exclusive), or YYYY-MM-DD for up to the end of that day'],
                'sort_order' => ['type' => 'string', 'enum' => ['asc', 'desc'], 'description' => 'By deleted_at: asc (default, oldest first) or desc'],
                'limit' => ['type' => 'integer', 'description' => 'Rows per page (default 50, max 100)'],
                'offset' => ['type' => 'integer', 'description' => 'Rows to skip (default 0)'],
            ]],
        ],
    ];
}

/**
 * The tool is visible to a key that may view at least one module with deletions to show; which rows it
 * then returns is decided per entity in mcp_list_deleted_records().
 */
function mcp_deleted_permissions(): array {
    $modules = [];
    foreach (mcp_deleted_entity_rules() as $keys) $modules[$keys[0]] = true;
    return ['list_deleted_records' => ['any' => array_keys($modules)]];
}

function mcp_deleted_execute(\PDO $pdo, array $user, string $tool, array $args) {
    if ($tool === 'list_deleted_records') return mcp_list_deleted_records($pdo, $args);
    return MCP_NOT_MINE;
}

function mcp_list_deleted_records(\PDO $pdo, array $args): array {
    $rules = mcp_deleted_entity_rules();
    $entity = mcp_enum($args, 'entity', array_keys($rules));
    $order = mcp_enum($args, 'sort_order', ['asc', 'desc'], 'asc');
    $limit = mcp_limit($args, 50, 100);
    $offset = max(0, (int)($args['offset'] ?? 0));

    $where = [];
    $params = [];
    foreach (['deleted_from' => ['>=', false], 'deleted_to' => ['<', true]] as $key => [$op, $upper]) {
        $ts = mcp_optional_moment($args, $key, $upper);
        if ($ts !== null) { $where[] = "UNIX_TIMESTAMP(deleted_at) $op ?"; $params[] = $ts; }
    }

    // Only entities whose module the key's owner may view; an explicit entity narrows it further.
    $visible = [];
    foreach ($rules as $name => $keys) {
        foreach ($keys as $k) {
            if (!mcp_can($k)) continue 2;
        }
        if ($entity === null || $entity === $name) $visible[] = mcp_deleted_entity_sql($name);
    }
    if (!$visible) return [];
    $where[] = '(' . implode(' OR ', $visible) . ')';

    $dir = strtoupper($order);
    $sql = 'SELECT entity, entity_id, label, deleted_by, extra, ' . mcp_moment_select('deleted_at', 'deleted_at') . ' FROM deleted_records WHERE '
        . implode(' AND ', $where) . " ORDER BY deleted_at $dir, id $dir LIMIT $limit OFFSET $offset";
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
    } catch (\PDOException $e) {
        // The table is created by the schema step on the next app request; until then nothing was recorded.
        if ($e->getCode() === '42S02') return [];
        throw $e;
    }

    $out = [];
    foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
        $isClient = $r['entity'] === 'leads' && strpos((string)$r['extra'], '"client":true') !== false;
        $row = mcp_row_moments([
            'entity' => $isClient ? 'clients' : $r['entity'],
            'entity_id' => $r['entity_id'],
            'label' => $r['label'],
            'deleted_at__ts' => $r['deleted_at__ts'],
            'deleted_by' => $r['deleted_by'],
        ]);
        $out[] = $row;
    }
    return $out;
}
