<?php
/**
 * CCRM MCP gateway — client and project intelligence: tolerant search, client / project linkage,
 * project financials, a client's invoices (local and SuperFaktúra), milestones, the client dossier,
 * and links into the web app.
 *
 * Required by mcp.php. Functions and constants only: nothing here runs on include. Read tools
 * only: nothing in this file writes.
 *
 * A "client" here is what the Clients register shows: every `leads` record carrying the same
 * name, one of them usually the client-* record (mcp_client_profiles groups the same way).
 * Projects hang off whichever of those records they were paired with, which is why looking a
 * client up by one record id used to find no projects.
 */

// ============================================================================
// Links into the web app  (src/utils/clientRecord.ts recordHref, App.tsx routes)
// ============================================================================

/** "https://crm.example.sk/" — CCRM_APP_URL, else the last sign-in URL, else this request. */
function mcp_app_base(\PDO $pdo): string {
    static $base = null;
    if ($base === null) {
        $base = function_exists('ccrm_app_base_url') ? (string)ccrm_app_base_url($pdo) : '';
        if ($base !== '' && substr($base, -1) !== '/') $base .= '/';
    }
    return $base;
}

/** isClientRecord: an explicit client-* record, or a confirmed positive value adjustment. */
function mcp_is_client_record(array $r): bool {
    return strpos((string)($r['id'] ?? ''), 'client-') === 0 || (float)($r['adjustment'] ?? 0) > 0;
}

/** Clients are routed by name, leads by id — the two routes the app serves. */
function mcp_record_url(\PDO $pdo, array $r): string {
    return mcp_is_client_record($r)
        ? mcp_client_url($pdo, (string)$r['name'])
        : mcp_app_base($pdo) . '#lead-' . rawurlencode((string)$r['id']);
}

function mcp_client_url(\PDO $pdo, string $name): string {
    return mcp_app_base($pdo) . '#client-' . rawurlencode(trim($name));
}

function mcp_project_url(\PDO $pdo, string $id): string {
    return mcp_app_base($pdo) . '#projects/' . rawurlencode($id);
}

// ============================================================================
// Text matching
// ============================================================================

const MCP_FOLD_MAP = [
    'á' => 'a', 'ä' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'å' => 'a', 'ā' => 'a', 'ą' => 'a',
    'č' => 'c', 'ć' => 'c', 'ç' => 'c', 'ď' => 'd', 'đ' => 'd',
    'é' => 'e', 'ě' => 'e', 'ë' => 'e', 'è' => 'e', 'ê' => 'e', 'ē' => 'e', 'ę' => 'e',
    'í' => 'i', 'ï' => 'i', 'ì' => 'i', 'î' => 'i', 'ĺ' => 'l', 'ľ' => 'l', 'ł' => 'l',
    'ň' => 'n', 'ń' => 'n', 'ñ' => 'n',
    'ó' => 'o', 'ô' => 'o', 'ö' => 'o', 'ő' => 'o', 'ò' => 'o', 'õ' => 'o', 'ø' => 'o',
    'ŕ' => 'r', 'ř' => 'r', 'š' => 's', 'ś' => 's', 'ş' => 's', 'ß' => 'ss', 'ť' => 't', 'ţ' => 't',
    'ú' => 'u', 'ů' => 'u', 'ü' => 'u', 'ű' => 'u', 'ù' => 'u', 'û' => 'u', 'ý' => 'y', 'ÿ' => 'y',
    'ž' => 'z', 'ź' => 'z', 'ż' => 'z',
];

/** Lower case without diacritics: "Kávička Žilina" → "kavicka zilina". */
function mcp_fold(string $s): string {
    $s = mb_strtolower(trim($s), 'UTF-8');
    if (class_exists('Normalizer')) {
        $d = \Normalizer::normalize($s, \Normalizer::FORM_D);
        if (is_string($d)) return (string)preg_replace('/\p{Mn}+/u', '', $d);
    }
    return strtr($s, MCP_FOLD_MAP);
}

/** Folded, letters and digits only: "Villa-Testa s.r.o." → "villatestasro". */
function mcp_compact(string $s): string {
    return (string)preg_replace('/[^\p{L}\p{N}]+/u', '', mcp_fold($s));
}

/** The words of a query: split on whitespace, de-duplicated case-insensitively, at most 8. */
function mcp_query_tokens(string $q): array {
    $out = [];
    foreach (preg_split('/\s+/u', trim($q), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $t) {
        $k = mb_strtolower($t, 'UTF-8');
        if (!isset($out[$k])) $out[$k] = $t;
    }
    return array_slice(array_values($out), 0, 8);
}

/** A LIKE pattern that matches $s anywhere, with the caller's % and _ taken literally. */
function mcp_like(string $s): string {
    return '%' . addcslashes($s, '%_\\') . '%';
}

/** SQL for a column with spaces and common punctuation removed. */
function mcp_sql_compact(string $column): string {
    $e = "COALESCE({$column}, '')";
    foreach ([' ', '-', '.', ',', '_', '/', '&', "''"] as $ch) {
        $e = "REPLACE({$e}, '{$ch}', '')";
    }
    return $e;
}

/**
 * WHERE fragment: every token appears in at least one of $columns. The tables use
 * utf8mb4_unicode_ci, so LIKE is already case- and accent-insensitive ("kavicka" finds
 * "Kávička"). With $compactColumn, a row whose column — spaces and punctuation removed —
 * contains the whole query run together also matches, so "villatesta" finds "Villa Testa".
 * The token rule covers the other direction: "villa testa" finds "Villatesta".
 *
 * @return array{0: string, 1: array}
 */
function mcp_token_where(array $columns, array $tokens, ?string $compactColumn = null, string $query = ''): array {
    $and = []; $params = [];
    foreach ($tokens as $t) {
        $and[] = '(' . implode(' OR ', array_map(fn($c) => "{$c} LIKE ?", $columns)) . ')';
        foreach ($columns as $_) $params[] = mcp_like($t);
    }
    $sql = $and ? '(' . implode(' AND ', $and) . ')' : '1=0';
    $compact = mcp_compact($query);
    if ($compactColumn !== null && mb_strlen($compact) >= 3) {
        $sql = "({$sql} OR " . mcp_sql_compact($compactColumn) . " LIKE ?)";
        $params[] = mcp_like($compact);
    }
    return [$sql, $params];
}

/**
 * Does a project's own name name this client? Equal (ignoring case, accents, spaces and
 * punctuation), or the client name followed by a separator: "Villatesta – e-shop".
 */
function mcp_project_named_for(string $projectName, string $clientName): bool {
    $p = mcp_fold($projectName); $c = mcp_fold($clientName);
    if ($p === '' || mb_strlen($c) < 3) return false;
    if ($p === $c || mcp_compact($projectName) === mcp_compact($clientName)) return true;
    if (strpos($p, $c) !== 0) return false;
    return preg_match('/^[\p{L}\p{N}]/u', mb_substr($p, mb_strlen($c))) !== 1;
}

// ============================================================================
// Clients
// ============================================================================

/**
 * A record and every record sharing its name: the unit the Clients register shows as one client.
 * `base` is the client-* record when there is one, else the record asked for.
 *
 * @return array{record: array, base: array, records: array[], ids: string[], name: string, is_client: bool}
 */
function mcp_client_scope_from(\PDO $pdo, array $rec): array {
    $name = trim((string)$rec['name']);
    $stmt = $pdo->prepare("SELECT * FROM leads WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id <> 'unassigned-docs' ORDER BY created_at ASC, id ASC");
    $stmt->execute([$name]);
    // The collation also equates accents ("Cafe" = "Café"); the register groups on the exact lower-cased name.
    $key = mb_strtolower($name, 'UTF-8');
    $records = array_values(array_filter($stmt->fetchAll(\PDO::FETCH_ASSOC), fn($r) => mb_strtolower(trim((string)$r['name']), 'UTF-8') === $key));
    if (!$records) $records = [$rec];
    $base = $rec; $isClient = false;
    foreach ($records as $r) { if (mcp_is_client_record($r)) $isClient = true; }
    foreach ($records as $r) { if (strpos($r['id'], 'client-') === 0) { $base = $r; break; } }
    return ['record' => $rec, 'base' => $base, 'records' => $records, 'ids' => array_column($records, 'id'), 'name' => $name, 'is_client' => $isClient];
}

function mcp_client_scope(\PDO $pdo, string $id): ?array {
    if ($id === '' || $id === 'unassigned-docs') return null;
    $stmt = $pdo->prepare("SELECT * FROM leads WHERE id = ?");
    $stmt->execute([$id]);
    $rec = $stmt->fetch(\PDO::FETCH_ASSOC);
    return $rec ? mcp_client_scope_from($pdo, $rec) : null;
}

/** The base record's value of $field, else the first non-empty one among the client's records. */
function mcp_scope_field(array $scope, string $field) {
    $v = $scope['base'][$field] ?? null;
    if ($v !== null && $v !== '') return $v;
    foreach ($scope['records'] as $r) {
        if (($r[$field] ?? null) !== null && $r[$field] !== '') return $r[$field];
    }
    return null;
}

function mcp_scope_url(\PDO $pdo, array $scope): string {
    return $scope['is_client'] ? mcp_client_url($pdo, $scope['name']) : mcp_record_url($pdo, $scope['record']);
}

function mcp_client_summary(\PDO $pdo, array $scope, ?string $linkedBy = null): array {
    $out = [
        'id' => $scope['base']['id'], 'name' => $scope['name'], 'kind' => $scope['is_client'] ? 'client' : 'lead',
        'email' => mcp_scope_field($scope, 'email'), 'phone' => mcp_scope_field($scope, 'phone'),
        'contact_person' => mcp_scope_field($scope, 'contact_person'), 'company_id' => mcp_scope_field($scope, 'company_id'),
        'record_ids' => $scope['ids'], 'url' => mcp_scope_url($pdo, $scope),
    ];
    if ($linkedBy !== null) $out['linked_by'] = $linkedBy;
    return $out;
}

/**
 * A client from what the caller has: a record id, an IČO, or a name (exact first, then every
 * word of it). Several different clients matching a name is an error that lists them.
 */
function mcp_resolve_client(\PDO $pdo, string $identifier): array {
    $identifier = trim($identifier);
    if ($identifier === '') throw new \InvalidArgumentException("'identifier' is required.");
    if ($scope = mcp_client_scope($pdo, $identifier)) return $scope;

    $order = "ORDER BY (id LIKE 'client-%') DESC, archived ASC, created_at ASC";
    $compactId = preg_replace('/\s+/', '', $identifier);
    if (preg_match('/^\d{6,10}$/', $compactId)) {
        $stmt = $pdo->prepare("SELECT * FROM leads WHERE REPLACE(company_id, ' ', '') = ? AND id <> 'unassigned-docs' {$order} LIMIT 1");
        $stmt->execute([$compactId]);
        if ($rec = $stmt->fetch(\PDO::FETCH_ASSOC)) return mcp_client_scope_from($pdo, $rec);
    }
    $stmt = $pdo->prepare("SELECT * FROM leads WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id <> 'unassigned-docs' {$order} LIMIT 1");
    $stmt->execute([$identifier]);
    if ($rec = $stmt->fetch(\PDO::FETCH_ASSOC)) return mcp_client_scope_from($pdo, $rec);

    [$w, $p] = mcp_token_where(['name', 'company_id', 'tax_id', 'vat_id', 'email'], mcp_query_tokens($identifier), 'name', $identifier);
    $stmt = $pdo->prepare("SELECT * FROM leads WHERE {$w} AND id <> 'unassigned-docs' {$order} LIMIT 50");
    $stmt->execute($p);
    $groups = [];
    foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
        $k = mb_strtolower(trim((string)$r['name']), 'UTF-8');
        $groups[$k]['rows'][] = $r;
        $groups[$k]['client'] = ($groups[$k]['client'] ?? false) || mcp_is_client_record($r);
    }
    if (!$groups) throw new \Exception("No client or lead matches '{$identifier}'.");
    if (count($groups) > 1) {
        $clients = array_filter($groups, fn($g) => $g['client']);
        if (count($clients) === 1) $groups = $clients;
    }
    if (count($groups) > 1) {
        $names = array_map(fn($g) => $g['rows'][0]['name'] . ' (' . $g['rows'][0]['id'] . ')', array_slice(array_values($groups), 0, 10));
        throw new \Exception("Several clients match '{$identifier}': " . implode('; ', $names) . '. Pass one of the ids.');
    }
    return mcp_client_scope_from($pdo, array_values($groups)[0]['rows'][0]);
}

// ============================================================================
// Projects
// ============================================================================

/** Projects whose client_id and lead_id point at no record (both empty, or the record is gone). */
function mcp_unlinked_projects(\PDO $pdo): array {
    static $rows = null;
    if ($rows === null) {
        $rows = $pdo->query(
            "SELECT p.* FROM projects p
             WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = p.client_id)
               AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = p.lead_id)"
        )->fetchAll(\PDO::FETCH_ASSOC);
    }
    return $rows;
}

/**
 * A client's projects: paired with any of its records through client_id or lead_id, plus unlinked
 * projects named for it. Each carries `_linked_by` (client_id / lead_id / name_match).
 */
function mcp_scope_projects(\PDO $pdo, array $scope): array {
    $ids = $scope['ids'];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("SELECT * FROM projects WHERE client_id IN ($ph) OR lead_id IN ($ph) ORDER BY created_at DESC");
    $stmt->execute(array_merge($ids, $ids));
    $out = [];
    foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $p) {
        $p['_linked_by'] = in_array((string)$p['client_id'], $ids, true) ? 'client_id' : 'lead_id';
        $out[$p['id']] = $p;
    }
    foreach (mcp_unlinked_projects($pdo) as $p) {
        if (!isset($out[$p['id']]) && mcp_project_named_for((string)$p['name'], $scope['name'])) {
            $p['_linked_by'] = 'name_match';
            $out[$p['id']] = $p;
        }
    }
    return array_values($out);
}

/**
 * The client a project belongs to: its client_id record, else its paired lead, else the record
 * whose name the project carries (client records first, then the longest name).
 *
 * @return array{scope: array, linked_by: string}|null
 */
function mcp_project_client(\PDO $pdo, array $p): ?array {
    foreach (['client_id', 'lead_id'] as $col) {
        if (empty($p[$col])) continue;
        $scope = mcp_client_scope($pdo, (string)$p[$col]);
        if ($scope) return ['scope' => $scope, 'linked_by' => $col];
    }
    $name = trim((string)($p['name'] ?? ''));
    if ($name === '') return null;
    static $all = null;
    if ($all === null) {
        $all = $pdo->query("SELECT id, name, adjustment FROM leads WHERE id <> 'unassigned-docs'")->fetchAll(\PDO::FETCH_ASSOC);
    }
    $best = null;
    foreach ($all as $r) {
        if (!mcp_project_named_for($name, (string)$r['name'])) continue;
        $rank = [mcp_is_client_record($r) ? 1 : 0, mb_strlen((string)$r['name'])];
        if ($best === null || $rank > $best[0]) $best = [$rank, $r['id']];
    }
    if ($best === null) return null;
    $scope = mcp_client_scope($pdo, $best[1]);
    return $scope ? ['scope' => $scope, 'linked_by' => 'name_match'] : null;
}

/** status key => group (new / in_progress / completed / cancelled) */
function mcp_project_status_groups(\PDO $pdo): array {
    $out = [];
    foreach (ccrm_project_status_defs($pdo) as $d) { $out[$d['key']] = $d['group']; }
    return $out;
}

/** One project as a list row: resolved contract value, status group, deadline and link. */
function mcp_project_row(\PDO $pdo, array $p, array &$ctx, array $groups): array {
    $row = [
        'id' => $p['id'], 'name' => $p['name'] ?: null, 'status' => $p['status'],
        'status_group' => $groups[$p['status']] ?? null,
        'value' => mcp_project_value($pdo, $p, $ctx), 'budget' => $p['budget'] === null ? null : (float)$p['budget'],
        'start_date' => $p['start_date'], 'deadline' => $p['deadline'], 'finished_at' => $p['finished_at'],
        'archived' => (int)$p['archived'] === 1, 'url' => mcp_project_url($pdo, (string)$p['id']),
    ];
    if (isset($p['_linked_by'])) $row['linked_by'] = $p['_linked_by'];
    return $row;
}

/** paid / partially_paid / unpaid / overdue / planned / cancelled, from a movement's status and split. */
function mcp_payment_status(string $status, float $settled, float $expected, ?string $due, string $today): string {
    if ($status === 'cancelled') return 'cancelled';
    if ($status === 'paid' || ($expected <= 0.0 && $settled > 0.0)) return 'paid';
    if ($status === 'planned') return 'planned';
    if ($status === 'overdue' || (mcp_iso_ok($due) && $due < $today)) return 'overdue';
    return $settled > 0.0 ? 'partially_paid' : 'unpaid';
}

/** One income movement of a project, as an installment of its payment schedule. */
function mcp_installment_row(array $r, string $today): array {
    [$settled, $expected] = mcp_fin_split($r);
    return [
        'id' => $r['id'], 'title' => $r['title'], 'invoice_number' => $r['invoiceNumber'],
        'issue_date' => $r['issueDate'], 'due_date' => $r['dueDate'], 'paid_date' => $r['paidDate'],
        'amount' => mcp_round2($r['amountPlanned'] != 0.0 ? $r['amountPlanned'] : $r['amountReal']),
        'paid' => mcp_round2($settled), 'open' => mcp_round2($expected), 'currency' => $r['currency'],
        'status' => $r['status'],
        'payment_status' => mcp_payment_status((string)$r['status'], $settled, $expected, $r['dueDate'] ?: $r['issueDate'], $today),
        'is_recurring' => !empty($r['isRecurring']),
    ];
}

/**
 * Contract value, invoiced, paid and still-billable figures of a project (projectBilling.ts, the
 * project page billing block) and its payment schedule: every income movement filed on it.
 */
function mcp_project_financials(\PDO $pdo, array $p, array &$ctx): array {
    $records = mcp_income_by_project($pdo, [(string)$p['id']])[$p['id']] ?? [];
    $b = mcp_project_billing(mcp_project_value($pdo, $p, $ctx), $records);
    $today = mcp_today();
    $schedule = array_map(fn($r) => mcp_installment_row($r, $today), $records);
    usort($schedule, fn($a, $b) => [$a['due_date'] ?: $a['issue_date'], $a['id']] <=> [$b['due_date'] ?: $b['issue_date'], $b['id']]);
    $plannedOpen = 0.0;
    foreach ($schedule as $s) { if ($s['status'] === 'planned') $plannedOpen += $s['open']; }
    return [
        'currency' => mcp_currency($pdo),
        'contract_value' => $b['value'],
        'invoiced_total' => $b['invoiced'],
        'paid_total' => $b['received'],
        'outstanding_invoiced' => $b['invoiced_open'],
        'remaining_billable' => $b['not_invoiced'],
        'still_to_be_paid' => $b['still_to_be_paid'],
        'over_invoiced' => $b['over_invoiced'],
        'planned_not_issued' => mcp_round2($plannedOpen),
        'installment_based' => count($schedule) > 1,
        'installments' => $schedule,
        'basis' => 'As on the project page: invoiced_total counts every income movement filed on the project (issued or planned, cancelled excluded); planned_not_issued is the part of it still only planned. remaining_billable = max(0, contract_value − invoiced_total). contract_value is the first positive of the project value, the project type\'s money attributes, the paired lead value.',
    ];
}

/**
 * A project's milestones: its Gantt rows (the project page timeline) and its blocking tasks
 * (what create_milestone writes). Tasks follow the caller's task visibility.
 */
function mcp_project_milestones(\PDO $pdo, array $user, array $p): array {
    static $tables = [];
    $today = mcp_today();
    $out = [];
    $table = 'proj_gantt_' . preg_replace('/[^a-z0-9_]/', '', strtolower((string)$p['project_type_id']));
    if (!isset($tables[$table])) {
        $tables[$table] = $pdo->query("SHOW TABLES LIKE " . $pdo->quote($table))->rowCount() > 0;
    }
    if ($tables[$table]) {
        $stmt = $pdo->prepare("SELECT id, title, contact_id, start_date, end_date, progress FROM `{$table}` WHERE project_id = ? ORDER BY end_date ASC, start_date ASC");
        $stmt->execute([$p['id']]);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $g) {
            $progress = (int)$g['progress'];
            $status = $progress >= 100 ? 'done' : ((mcp_iso_ok($g['end_date']) && $g['end_date'] < $today) ? 'overdue' : ($progress > 0 ? 'in_progress' : 'not_started'));
            $out[] = [
                'id' => $g['id'], 'source' => 'gantt', 'title' => $g['title'], 'start_date' => $g['start_date'],
                'deadline' => $g['end_date'], 'priority' => null, 'status' => $status, 'done' => $progress >= 100,
                'progress' => $progress, 'owner' => null, 'contact_id' => $g['contact_id'] ?: null, 'deliverable' => null,
            ];
        }
    }
    if (mcp_can('tasks')) {
        [$scopeSql, $scopeParams] = mcp_task_scope($user);
        $taskStates = mcp_config_json($pdo, 'TASK_STATES', []);
        $stmt = $pdo->prepare(
            "SELECT id, title, description, priority, start_date, deadline, status, owner, completed_at, related_lead_id
             FROM tasks WHERE related_project_id = ? AND is_locking = 1 AND archived = 0" . ($scopeSql !== '' ? " AND $scopeSql" : '') . "
             ORDER BY deadline ASC"
        );
        $stmt->execute(array_merge([$p['id']], $scopeParams));
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $t) {
            $desc = trim((string)$t['description']);
            $out[] = [
                'id' => $t['id'], 'source' => 'task', 'title' => $t['title'], 'start_date' => $t['start_date'] ?: null,
                'deadline' => $t['deadline'], 'priority' => $t['priority'], 'status' => $t['status'],
                'done' => mcp_done_task_state((string)$t['status'], is_array($taskStates) ? $taskStates : []),
                'progress' => null, 'owner' => $t['owner'], 'completed_at' => $t['completed_at'] ?: null,
                'contact_id' => $t['related_lead_id'] ?: null,
                'deliverable' => ($desc === '' || $desc === 'Project Milestone') ? null : $desc,
            ];
        }
    }
    usort($out, fn($a, $b) => [$a['deadline'] ?? '9999', $a['title']] <=> [$b['deadline'] ?? '9999', $b['title']]);
    return $out;
}

// ============================================================================
// Invoices of a client
// ============================================================================

/**
 * Documents issued to a client in the Invoicing module, matched by any of its record ids or its
 * IČO, with the payment state of the ledger movement the app keeps for every invoice (fr-inv-<id>).
 */
function mcp_scope_invoice_docs(\PDO $pdo, array $scope, bool $withOffers = true, int $limit = 100): array {
    $ids = $scope['ids'];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $where = "(io.client_id IN ($ph) OR io.lead_id IN ($ph)";
    $params = array_merge($ids, $ids);
    $ico = preg_replace('/\s+/', '', (string)mcp_scope_field($scope, 'company_id'));
    if ($ico !== '') { $where .= " OR REPLACE(io.client_ico, ' ', '') = ?"; $params[] = $ico; }
    $where .= ')';
    if (!$withOffers) $where .= " AND io.type IN ('invoice', 'proforma')";
    $stmt = $pdo->prepare(
        "SELECT io.id, io.document_number, io.type, io.mode, io.external_provider, io.external_id, io.title, io.client_name,
                io.subtotal, io.vat_amount, io.total_price, io.currency, io.status, io.issued_at, io.due_date,
                fr.status AS fr_status, fr.amount_planned AS fr_planned, fr.amount_real AS fr_real, fr.paid_date AS fr_paid_date, fr.project_id AS fr_project_id
         FROM invoices_offers io LEFT JOIN financial_records fr ON fr.id = CONCAT('fr-inv-', io.id)
         WHERE {$where} ORDER BY io.issued_at DESC, io.document_number DESC LIMIT " . (int)$limit
    );
    $stmt->execute($params);
    $today = mcp_today();
    $out = [];
    foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $d) {
        $total = (float)$d['total_price'];
        $settled = 0.0; $expected = 0.0; $payment = null;
        if ($d['type'] !== 'price_offer') {
            if ($d['fr_status'] !== null) {
                [$settled, $expected] = mcp_fin_split(['status' => $d['fr_status'], 'amountPlanned' => (float)$d['fr_planned'], 'amountReal' => (float)$d['fr_real'], 'isRecurring' => false]);
                $payment = mcp_payment_status((string)$d['fr_status'], $settled, $expected, $d['due_date'], $today);
            } elseif ($d['status'] === 'cancelled') {
                $payment = 'cancelled';
            } else {
                // No ledger movement (entered before the bridge, or removed): only the due date says anything.
                $expected = $total;
                $payment = mcp_payment_status($d['status'] === 'draft' ? 'planned' : 'pending', 0.0, $total, $d['due_date'], $today);
            }
        }
        $out[] = [
            'source' => 'invoicing', 'id' => $d['id'], 'type' => $d['type'], 'document_number' => $d['document_number'],
            'variable_symbol' => null, 'title' => $d['title'], 'issue_date' => $d['issued_at'], 'due_date' => $d['due_date'],
            'paid_date' => $d['fr_paid_date'] ?: null,
            'subtotal' => mcp_round2($d['subtotal']), 'vat_amount' => mcp_round2($d['vat_amount']), 'amount' => mcp_round2($total),
            'paid' => mcp_round2($settled), 'open' => mcp_round2($expected), 'currency' => $d['currency'],
            'document_status' => $d['status'], 'payment_status' => $payment,
            'project_id' => $d['fr_project_id'] ?: null,
            'external_provider' => $d['external_provider'] ?: null, 'external_id' => $d['external_id'] ?: null,
        ];
    }
    return $out;
}

/**
 * Income movements of a client in the ledger that are not already an Invoicing document: invoices
 * entered by hand and planned installments, on the client's records or on its projects.
 */
function mcp_scope_ledger_income(\PDO $pdo, array $scope, array $projectIds, array $skipIds, array $skipNumbers): array {
    $ids = $scope['ids'];
    $where = 'client_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
    $params = $ids;
    if ($projectIds) {
        $where .= ' OR project_id IN (' . implode(',', array_fill(0, count($projectIds), '?')) . ')';
        $params = array_merge($params, $projectIds);
    }
    $today = mcp_today();
    $skipNumbers = array_flip(array_map(fn($n) => mb_strtolower(trim((string)$n), 'UTF-8'), array_filter($skipNumbers)));
    $out = [];
    foreach (mcp_fin_load($pdo, "type = 'income' AND is_recurring = 0 AND ($where)", $params, 'COALESCE(due_date, issue_date) DESC, id DESC', 300) as $r) {
        if (isset($skipIds[$r['id']])) continue;
        if ($r['invoiceNumber'] && isset($skipNumbers[mb_strtolower(trim($r['invoiceNumber']), 'UTF-8')])) continue;
        $row = mcp_installment_row($r, $today);
        $out[] = [
            'source' => 'ledger', 'id' => $r['id'], 'type' => $r['invoiceNumber'] ? 'invoice' : 'planned_payment',
            'document_number' => $r['invoiceNumber'], 'variable_symbol' => null, 'title' => $r['title'],
            'issue_date' => $r['issueDate'], 'due_date' => $r['dueDate'], 'paid_date' => $r['paidDate'],
            'amount' => $row['amount'], 'paid' => $row['paid'], 'open' => $row['open'], 'currency' => $r['currency'],
            'document_status' => $r['status'], 'payment_status' => $row['payment_status'], 'project_id' => $r['projectId'],
        ];
    }
    return $out;
}

// ---------------------------------------------------------------------------
// SuperFaktúra (read only). The credentials are read here to make the call and are never returned.
// ---------------------------------------------------------------------------

/** The stored SuperFaktúra connection, or null when it is not enabled and complete. */
function mcp_sf_config(\PDO $pdo): ?array {
    $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INVOICING_INTEGRATIONS'");
    $stmt->execute();
    $cfg = json_decode((string)$stmt->fetchColumn(), true);
    if (!is_array($cfg)) return null;
    if (function_exists('ccrm_decrypt_invoicing_secrets')) $cfg = ccrm_decrypt_invoicing_secrets($cfg);
    $sf = $cfg['superfaktura'] ?? null;
    if (!is_array($sf) || empty($sf['enabled']) || trim((string)($sf['email'] ?? '')) === '' || trim((string)($sf['apiKey'] ?? '')) === '') return null;
    return [
        'base' => !empty($sf['sandbox']) ? 'https://sandbox.superfaktura.sk' : 'https://m.superfaktura.sk',
        'auth' => 'SFAPI email=' . urlencode(trim((string)$sf['email'])) . '&apikey=' . urlencode(trim((string)$sf['apiKey']))
            . (trim((string)($sf['companyId'] ?? '')) !== '' ? '&company_id=' . urlencode(trim((string)$sf['companyId'])) : ''),
    ];
}

function mcp_sf_get(array $sf, string $path): array {
    $ch = curl_init($sf['base'] . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_HTTPHEADER => ['Authorization: ' . $sf['auth'], 'Accept: application/json'],
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($body === false || $err !== '') throw new \RuntimeException('SuperFaktúra is unreachable.');
    $json = json_decode((string)$body, true);
    if ($code !== 200 || !is_array($json)) {
        $msg = is_array($json) ? ($json['error_message'] ?? $json['message'] ?? null) : null;
        throw new \RuntimeException('SuperFaktúra answered HTTP ' . $code . (is_string($msg) ? ': ' . $msg : '.'));
    }
    return $json;
}

/** The rows of a SuperFaktúra list response, with or without listinfo. */
function mcp_sf_items(array $json): array {
    $items = $json['items'] ?? $json;
    return is_array($items) ? array_values(array_filter($items, 'is_array')) : [];
}

/**
 * The client's invoices in SuperFaktúra: the SuperFaktúra client is found by IČO, else by name,
 * then its invoices are listed. Never throws: failures come back in `error`.
 */
function mcp_sf_client_invoices(\PDO $pdo, array $scope): array {
    $sf = mcp_sf_config($pdo);
    if ($sf === null) return ['enabled' => false, 'invoices' => []];
    $ico = preg_replace('/\s+/', '', (string)mcp_scope_field($scope, 'company_id'));
    try {
        $term = $ico !== '' ? $ico : $scope['name'];
        $clients = mcp_sf_items(mcp_sf_get($sf, '/clients/index.json/listinfo:1/per_page:50/search:' . rawurlencode(base64_encode($term))));
        $match = null;
        foreach ($clients as $c) {
            $c = $c['Client'] ?? $c;
            $sameIco = $ico !== '' && preg_replace('/\s+/', '', (string)($c['ico'] ?? '')) === $ico;
            $sameName = mcp_compact((string)($c['name'] ?? '')) === mcp_compact($scope['name']);
            if ($sameIco || ($ico === '' && $sameName)) { $match = $c; break; }
        }
        if ($match === null || empty($match['id'])) {
            return ['enabled' => true, 'matched_client' => null, 'invoices' => [], 'note' => 'No SuperFaktúra client with ' . ($ico !== '' ? "IČO {$ico}" : "the name {$scope['name']}") . '.'];
        }
        $rows = mcp_sf_items(mcp_sf_get($sf, '/invoices/index.json/listinfo:1/per_page:100/page:1/client_id:' . rawurlencode((string)$match['id'])));
        $today = mcp_today();
        $out = [];
        foreach ($rows as $item) {
            $inv = $item['Invoice'] ?? $item;
            $amount = (float)($inv['amount'] ?? 0);
            $paid = (float)($inv['amount_paid'] ?? 0);
            $due = isset($inv['due']) ? substr((string)$inv['due'], 0, 10) : null;
            $code = (int)($inv['status'] ?? 0);   // 1 issued, 2 partially paid, 3 paid, 99 overdue
            $payment = $code === 3 ? 'paid'
                : ($code === 99 || (mcp_iso_ok($due) && $due < $today && $paid < $amount) ? 'overdue'
                : ($code === 2 || ($paid > 0 && $paid < $amount) ? 'partially_paid' : 'unpaid'));
            $out[] = [
                'source' => 'superfaktura', 'id' => (string)($inv['id'] ?? ''), 'type' => $inv['type'] ?? 'regular',
                'document_number' => $inv['invoice_no_formatted'] ?? ($inv['invoice_no'] ?? null),
                'variable_symbol' => isset($inv['variable']) && $inv['variable'] !== '' ? (string)$inv['variable'] : null,
                'title' => $inv['name'] ?? null,
                'issue_date' => isset($inv['created']) ? substr((string)$inv['created'], 0, 10) : null, 'due_date' => $due,
                'paid_date' => !empty($inv['paydate']) ? substr((string)$inv['paydate'], 0, 10) : null,
                'amount' => mcp_round2($amount), 'paid' => mcp_round2($paid), 'open' => mcp_round2(max(0.0, $amount - $paid)),
                'currency' => $inv['invoice_currency'] ?? ($inv['currency'] ?? mcp_currency($pdo)),
                'document_status' => (string)$code, 'payment_status' => $payment,
            ];
        }
        return ['enabled' => true, 'matched_client' => ['id' => (string)$match['id'], 'name' => $match['name'] ?? null, 'ico' => $match['ico'] ?? null], 'invoices' => $out];
    } catch (\Throwable $e) {
        error_log('[mcp] SuperFaktura lookup failed: ' . $e->getMessage());
        return ['enabled' => true, 'invoices' => [], 'error' => $e instanceof \RuntimeException ? $e->getMessage() : 'SuperFaktúra lookup failed.'];
    }
}

/** Sums of the invoices that count as money asked for: invoices and ledger rows, not offers, plans or cancellations. */
function mcp_invoice_totals(array $rows): array {
    $t = ['invoiced' => 0.0, 'paid' => 0.0, 'open' => 0.0, 'overdue' => 0.0, 'count' => 0];
    foreach ($rows as $r) {
        if (in_array($r['type'], ['price_offer', 'planned_payment', 'cancel', 'estimate'], true)) continue;
        if (in_array($r['payment_status'], ['cancelled', 'planned', null], true)) continue;
        $t['count']++;
        $t['invoiced'] += $r['amount']; $t['paid'] += $r['paid']; $t['open'] += $r['open'];
        if ($r['payment_status'] === 'overdue') $t['overdue'] += $r['open'];
    }
    foreach (['invoiced', 'paid', 'open', 'overdue'] as $k) $t[$k] = mcp_round2($t[$k]);
    return $t;
}

// ============================================================================
// Search
// ============================================================================

function mcp_search_entities(\PDO $pdo, array $user, array $args): array {
    $query = mcp_require_string($args, 'query');
    $tokens = mcp_query_tokens($query);
    $types = is_array($args['entity_types'] ?? null) ? $args['entity_types'] : ['leads', 'clients', 'tasks', 'projects', 'invoices', 'warehouse'];
    $limit = min(max(1, (int)($args['limit'] ?? 15)), 50);
    $results = [];

    $wantLeads = in_array('leads', $types, true) && mcp_can('leads');
    $wantClients = in_array('clients', $types, true) && mcp_can('clients');
    if ($wantLeads || $wantClients) {
        [$w, $p] = mcp_token_where(
            ['name', 'email', 'phone', 'company_id', 'tax_id', 'vat_id', 'contact_person', 'interest_note', 'city', 'website'],
            $tokens, 'name', $query
        );
        $stmt = $pdo->prepare(
            "SELECT id, name, email, phone, city, status, client_type, value, adjustment, company_id, tax_id, contact_person, owner
             FROM leads
             WHERE {$w} AND archived = 0 AND id <> 'unassigned-docs'
             ORDER BY CASE WHEN LOWER(TRIM(name)) = LOWER(TRIM(?)) THEN 0 WHEN name LIKE ? THEN 1 ELSE 2 END,
                      (id LIKE 'client-%') DESC, name ASC
             LIMIT " . ($limit * 3)
        );
        $stmt->execute(array_merge($p, [$query, addcslashes($tokens[0] ?? '', '%_\\') . '%']));
        $rows = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $kind = mcp_is_client_record($r) ? 'client' : 'lead';
            if (($kind === 'client' && !$wantClients) || ($kind === 'lead' && !$wantLeads)) continue;
            $r['kind'] = $kind;
            $r['url'] = mcp_record_url($pdo, $r);
            unset($r['adjustment']);
            $rows[] = $r;
            if (count($rows) >= $limit) break;
        }
        $results['leads_and_clients'] = $rows;
    }

    if (in_array('tasks', $types, true) && mcp_can('tasks')) {
        [$w, $p] = mcp_token_where(['title', 'description'], $tokens);
        [$scopeSql, $scopeParams] = mcp_task_scope($user);
        $stmt = $pdo->prepare(
            "SELECT id, title, priority, deadline, status, owner, related_lead_id, related_project_id
             FROM tasks WHERE {$w} AND archived = 0" . ($scopeSql !== '' ? " AND $scopeSql" : '') . "
             ORDER BY deadline DESC LIMIT {$limit}"
        );
        $stmt->execute(array_merge($p, $scopeParams));
        $results['tasks'] = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    }

    if (in_array('projects', $types, true) && mcp_can('projects')) {
        [$w, $p] = mcp_token_where(['p.name', 'l.name', 'c.name'], $tokens, 'p.name', $query);
        $stmt = $pdo->prepare(
            "SELECT p.id, p.name, p.status, p.value, p.budget, p.deadline, p.lead_id, p.client_id, COALESCE(c.name, l.name) AS client_name
             FROM projects p
             LEFT JOIN leads l ON l.id = p.lead_id
             LEFT JOIN leads c ON c.id = p.client_id
             WHERE {$w} ORDER BY p.archived ASC, p.created_at DESC LIMIT {$limit}"
        );
        $stmt->execute($p);
        $results['projects'] = array_map(fn($r) => $r + ['url' => mcp_project_url($pdo, (string)$r['id'])], $stmt->fetchAll(\PDO::FETCH_ASSOC));
    }

    if (in_array('invoices', $types, true) && mcp_can('invoices')) {
        [$w, $p] = mcp_token_where(['document_number', 'client_name', 'title', 'client_ico'], $tokens, 'client_name', $query);
        $stmt = $pdo->prepare(
            "SELECT id, document_number, type, client_id, lead_id, client_name, title, total_price, currency, status, issued_at, due_date
             FROM invoices_offers WHERE {$w} ORDER BY issued_at DESC LIMIT {$limit}"
        );
        $stmt->execute($p);
        $results['invoices'] = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    }

    if (in_array('warehouse', $types, true) && mcp_can('warehouse')) {
        [$w, $p] = mcp_token_where(['name', 'sku', 'barcode'], $tokens);
        $stmt = $pdo->prepare("SELECT id, sku, name, category, default_sell_price FROM warehouse_items WHERE {$w} ORDER BY name ASC LIMIT {$limit}");
        $stmt->execute($p);
        $results['warehouse_items'] = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    }

    return $results;
}

// ============================================================================
// Definitions & permissions
// ============================================================================

function mcp_ext_intel_tool_definitions(): array {
    $client = ['type' => 'string', 'description' => 'Client record id, IČO, or client name (case- and accent-insensitive; every word must match)'];
    return [
        [
            'name' => 'get_client_dossier',
            'description' => 'Everything about one client in a single call: profile (contacts, IČO/DIČ/IČ DPH, source, owner, notes), every project (active and past, with value, status and deadline), a financial summary (contracted, invoiced, paid, outstanding, still billable), open tasks and milestones, upcoming meetings and the last 5 timeline entries. Sections the key may not see are left out.',
            'inputSchema' => ['type' => 'object', 'properties' => ['identifier' => $client], 'required' => ['identifier']],
        ],
        [
            'name' => 'get_client_invoices',
            'description' => 'All invoices of a client with number, variable symbol (SuperFaktúra only), issue and due date, amount, paid and open amount, currency and payment status (paid, partially_paid, unpaid, overdue, planned, cancelled). Combines the Invoicing module, invoices and planned installments in the finance ledger (on the client or its projects), and — when the SuperFaktúra integration is enabled — the invoices SuperFaktúra holds for the client (found by IČO, else by name). Works in either finance mode.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'identifier' => $client,
                'payment_status' => ['type' => 'string', 'enum' => ['paid', 'partially_paid', 'unpaid', 'overdue', 'planned', 'cancelled'], 'description' => 'Only invoices in this payment status'],
                'include_superfaktura' => ['type' => 'boolean', 'description' => 'Ask SuperFaktúra too (default true when the integration is enabled)'],
                'include_offers' => ['type' => 'boolean', 'description' => 'Also list price offers (default false)'],
            ], 'required' => ['identifier']],
        ],
        [
            'name' => 'list_milestones',
            'description' => 'Milestones of a project: the rows of its Gantt timeline (start, end, progress) and its blocking milestone tasks (what create_milestone adds: deadline, priority, status, owner). Each has a status and a done flag.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'project_id' => ['type' => 'string', 'description' => 'Project ID'],
                'open_only' => ['type' => 'boolean', 'description' => 'Leave out finished milestones (default false)'],
            ], 'required' => ['project_id']],
        ],
    ];
}

function mcp_ext_intel_permissions(): array {
    return [
        'get_client_dossier' => ['view' => ['clients']],
        'get_client_invoices' => ['view' => ['invoices']],
        'list_milestones' => ['view' => ['projects']],
    ];
}

// ============================================================================
// Handlers
// ============================================================================

function mcp_ext_intel_execute(\PDO $pdo, array $user, string $tool, array $args) {
    switch ($tool) {
        case 'list_milestones': {
            $id = mcp_require_string($args, 'project_id');
            $stmt = $pdo->prepare("SELECT * FROM projects WHERE id = ?");
            $stmt->execute([$id]);
            $p = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$p) throw new \Exception("Project not found with ID: {$id}");
            $rows = mcp_project_milestones($pdo, $user, $p);
            if (!empty($args['open_only'])) $rows = array_values(array_filter($rows, fn($m) => !$m['done']));
            return [
                'project' => ['id' => $p['id'], 'name' => $p['name'], 'status' => $p['status'], 'deadline' => $p['deadline'], 'url' => mcp_project_url($pdo, (string)$p['id'])],
                'milestones' => $rows,
            ];
        }

        case 'get_client_invoices': {
            $scope = mcp_resolve_client($pdo, (string)($args['identifier'] ?? $args['client_id'] ?? ''));
            $filter = mcp_enum($args, 'payment_status', ['paid', 'partially_paid', 'unpaid', 'overdue', 'planned', 'cancelled']);
            $docs = mcp_scope_invoice_docs($pdo, $scope, !empty($args['include_offers']), 300);
            $rows = $docs;
            if (mcp_can('financial')) {
                $projectIds = array_map(fn($p) => (string)$p['id'], mcp_scope_projects($pdo, $scope));
                $skipIds = [];
                foreach ($docs as $d) $skipIds['fr-inv-' . $d['id']] = true;
                $rows = array_merge($rows, mcp_scope_ledger_income($pdo, $scope, $projectIds, $skipIds, array_column($docs, 'document_number')));
            }
            $sfOut = ['enabled' => false];
            if (!array_key_exists('include_superfaktura', $args) || !empty($args['include_superfaktura'])) {
                $sf = mcp_sf_client_invoices($pdo, $scope);
                $sfOut = array_diff_key($sf, ['invoices' => true]);
                // An invoice issued from the CRM to SuperFaktúra is listed once: the local row gains the variable symbol.
                $byNumber = [];
                foreach ($rows as $i => $r) { if ($r['document_number']) $byNumber[mb_strtolower(trim($r['document_number']), 'UTF-8')] = $i; }
                $added = 0;
                foreach ($sf['invoices'] as $s) {
                    $k = $s['document_number'] ? mb_strtolower(trim($s['document_number']), 'UTF-8') : null;
                    if ($k !== null && isset($byNumber[$k])) {
                        $rows[$byNumber[$k]]['variable_symbol'] = $s['variable_symbol'];
                        $rows[$byNumber[$k]]['superfaktura_payment_status'] = $s['payment_status'];
                        continue;
                    }
                    $rows[] = $s; $added++;
                }
                $sfOut['invoices_added'] = $added;
            }
            if ($filter !== null) $rows = array_values(array_filter($rows, fn($r) => $r['payment_status'] === $filter));
            usort($rows, fn($a, $b) => [$b['issue_date'] ?? '', $b['document_number'] ?? ''] <=> [$a['issue_date'] ?? '', $a['document_number'] ?? '']);
            return [
                'client' => mcp_client_summary($pdo, $scope),
                'currency' => mcp_currency($pdo),
                'totals' => mcp_invoice_totals($rows),
                'invoices' => $rows,
                'superfaktura' => $sfOut,
                'sources' => array_values(array_filter(['invoicing', mcp_can('financial') ? 'ledger' : null, !empty($sfOut['enabled']) ? 'superfaktura' : null])),
            ];
        }

        case 'get_client_dossier': {
            $scope = mcp_resolve_client($pdo, (string)($args['identifier'] ?? ''));
            $ids = $scope['ids'];
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $b = $scope['base'];

            $contacts = [];
            foreach ($scope['records'] as $r) {
                $c = ['name' => $r['contact_person'] ?: null, 'email' => $r['email'] ?: null, 'phone' => $r['phone'] ?: null];
                if (array_filter($c)) $contacts[strtolower(implode('|', $c))] = $c;
            }
            $out = [
                'profile' => mcp_client_summary($pdo, $scope) + [
                    'client_type' => $b['client_type'], 'owner' => mcp_scope_field($scope, 'owner'), 'source' => mcp_scope_field($scope, 'source'),
                    'tax_id' => mcp_scope_field($scope, 'tax_id'), 'vat_id' => mcp_scope_field($scope, 'vat_id'),
                    'website' => mcp_scope_field($scope, 'website'),
                    'address' => ['street' => mcp_scope_field($scope, 'street'), 'city' => mcp_scope_field($scope, 'city'), 'postal_code' => mcp_scope_field($scope, 'postal_code'), 'country' => mcp_scope_field($scope, 'country')],
                    'contacts' => array_values($contacts),
                    'interest_note' => mcp_scope_field($scope, 'interest_note'),
                    'ai_summary' => mcp_scope_field($scope, 'ai_summary'),
                    'created_at' => min(array_column($scope['records'], 'created_at')),
                    'records' => array_map(fn($r) => ['id' => $r['id'], 'kind' => mcp_is_client_record($r) ? 'client' : 'lead', 'status' => $r['status'], 'value' => mcp_round2($r['value']), 'owner' => $r['owner'], 'archived' => (int)$r['archived'] === 1, 'url' => mcp_record_url($pdo, $r)], $scope['records']),
                ],
            ];

            $projects = mcp_can('projects') ? mcp_scope_projects($pdo, $scope) : [];
            if (mcp_can('projects')) {
                $ctx = mcp_projects_ctx();
                $groups = mcp_project_status_groups($pdo);
                $rows = [];
                $fin = ['contract_value' => 0.0, 'invoiced_total' => 0.0, 'paid_total' => 0.0, 'outstanding_invoiced' => 0.0, 'remaining_billable' => 0.0, 'over_invoiced' => 0.0];
                foreach ($projects as $p) {
                    $row = mcp_project_row($pdo, $p, $ctx, $groups);
                    if (mcp_can('financial')) {
                        $f = mcp_project_financials($pdo, $p, $ctx);
                        $row['financials'] = array_intersect_key($f, $fin + ['installment_based' => true]);
                        foreach ($fin as $k => $_) $fin[$k] += $f[$k];
                    }
                    $rows[] = $row;
                }
                $isActive = fn($r) => !in_array($r['status_group'], ['completed', 'cancelled'], true) && !$r['archived'];
                $out['projects'] = [
                    'active' => array_values(array_filter($rows, $isActive)),
                    'past' => array_values(array_filter($rows, fn($r) => !$isActive($r))),
                ];
                if (mcp_can('financial')) {
                    $out['financial_summary'] = ['currency' => mcp_currency($pdo)] + array_map('mcp_round2', $fin)
                        + ['pipeline_value' => mcp_round2(array_sum(array_map(fn($r) => mcp_is_client_record($r) ? 0 : (float)$r['value'], $scope['records'])))];
                }
            }
            if (mcp_can('invoices')) {
                $docs = mcp_scope_invoice_docs($pdo, $scope, true, 100);
                $out['financial_summary']['invoices'] = mcp_invoice_totals($docs) + ['currency' => mcp_currency($pdo)];
                $out['financial_summary']['offers'] = ['count' => count(array_filter($docs, fn($d) => $d['type'] === 'price_offer')), 'total' => mcp_round2(array_sum(array_map(fn($d) => $d['type'] === 'price_offer' && $d['document_status'] !== 'cancelled' ? $d['amount'] : 0, $docs)))];
                $out['latest_documents'] = array_slice($docs, 0, 5);
            }
            if (isset($out['financial_summary'])) {
                $out['financial_summary']['basis'] = 'contract_value … over_invoiced sum the client\'s projects as on each project page (invoiced = issued or planned income movements). invoices sums the Invoicing documents. Use get_client_invoices for each invoice, including SuperFaktúra.';
            }

            if (mcp_can('tasks')) {
                [$openSql, $openParams] = mcp_open_task_sql($pdo);
                [$scopeSql, $scopeParams] = mcp_task_scope($user);
                $pids = array_map(fn($p) => (string)$p['id'], $projects);
                $rel = "related_lead_id IN ($ph)" . ($pids ? ' OR related_project_id IN (' . implode(',', array_fill(0, count($pids), '?')) . ')' : '');
                $stmt = $pdo->prepare(
                    "SELECT id, title, priority, deadline, deadline_time, status, owner, is_locking, related_lead_id, related_project_id
                     FROM tasks WHERE ($rel) AND archived = 0 AND {$openSql}" . ($scopeSql !== '' ? " AND $scopeSql" : '') . "
                     ORDER BY deadline ASC LIMIT 50"
                );
                $stmt->execute(array_merge($ids, $pids, $openParams, $scopeParams));
                $out['open_tasks'] = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            }
            if (mcp_can('projects')) {
                $ms = [];
                foreach ($projects as $p) {
                    foreach (mcp_project_milestones($pdo, $user, $p) as $m) {
                        if (!$m['done']) $ms[] = ['project_id' => $p['id'], 'project_name' => $p['name']] + $m;
                    }
                }
                usort($ms, fn($a, $b) => ($a['deadline'] ?? '9999') <=> ($b['deadline'] ?? '9999'));
                $out['open_milestones'] = $ms;
            }
            if (mcp_can('meetings')) {
                $stmt = $pdo->prepare("SELECT id, title, date, duration FROM meeting_notes WHERE lead_id IN ($ph) AND archived = 0 ORDER BY date DESC LIMIT 5");
                $stmt->execute($ids);
                $out['recent_meetings'] = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            }

            $stmt = $pdo->prepare(
                "SELECT id, lead_id, type, timestamp, title, content, amount, author, is_outgoing FROM timeline_events
                 WHERE lead_id IN ($ph) AND hidden = 0" . (mcp_can('email') ? '' : " AND type <> 'email'") . "
                 ORDER BY timestamp DESC LIMIT 5"
            );
            $stmt->execute($ids);
            $out['latest_timeline'] = array_map(function ($e) {
                if ($e['content'] !== null && mb_strlen($e['content']) > 1500) $e['content'] = mb_substr($e['content'], 0, 1500) . '…';
                return $e;
            }, $stmt->fetchAll(\PDO::FETCH_ASSOC));
            return $out;
        }
    }
    return MCP_NOT_MINE;
}
