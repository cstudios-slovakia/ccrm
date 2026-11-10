<?php
/**
 * The change window, paging, moments and date ranges every MCP list tool shares.
 *
 * Why: an assistant polling the app asks "what changed since X?" and "what is due or
 * overdue in period Y?". Each list tool answers both the same way through these helpers,
 * so "updated_from", "sort_by=updated_at", "overdue" and "offset" mean one thing everywhere.
 * See docs/audits/mcp-change-visibility-audit.md (RC1, RC2, RC4, RC6).
 *
 * Rules every caller keeps:
 * - Moments are compared with UNIX_TIMESTAMP(column) and returned through
 *   mcp_row_moments(), never as the raw column: a TIMESTAMP comes back in the MySQL
 *   session zone, which is not set (UTC on a server), while PHP runs in the app zone.
 * - A window only narrows a query that is already scoped (permissions, module split).
 * - DATETIME columns that hold app-local wall time (timeline_events.timestamp) are
 *   written with mcp_now_local(), never MySQL NOW(), and filtered with mcp_local_range().
 * - "Today" is mcp_today() (PHP, app zone), never CURDATE() (MySQL zone).
 */

/** Wall-clock "now" in the app's time zone, for DATETIME columns the app also writes in local time. */
function mcp_now_local(): string { return date('Y-m-d H:i:s'); }

/** The window of list_tasks: the reference every other list follows. */
const MCP_TASK_WINDOW = [
    'created' => 'created_at', 'updated' => 'updated_at', 'id' => 'id',
    'sorts' => ['deadline' => ['deadline', 'ASC', 'priority DESC']], 'default_sort' => 'deadline',
];

/** "Europe/Bratislava": the zone every time filter is read in and every moment is returned in. */
function mcp_zone(): string { return date_default_timezone_get(); }

/** The sentence a description appends when it takes time-of-day filters. */
function mcp_zone_note(): string {
    return 'Time filters take YYYY-MM-DD or YYYY-MM-DD HH:MM in ' . KOPERNIQ_PRODUCT_NAME . ' local time (' . mcp_zone() . '); '
        . 'if the user is in another time zone, append their offset (2026-11-06 14:22+05:00) or convert first.';
}

/** "UNIX_TIMESTAMP(p.updated_at) AS updated_at__ts": pair it with mcp_row_moments(). */
function mcp_moment_select(string $col, string $as): string {
    return "UNIX_TIMESTAMP($col) AS {$as}__ts";
}

/**
 * Every "<name>__ts" key (a UNIX_TIMESTAMP value) becomes "<name>" as an ISO 8601 moment
 * with the app's offset (2026-11-06T14:44:12+01:00), or null.
 */
function mcp_row_moments(array $row): array {
    foreach ($row as $k => $v) {
        if (is_string($k) && str_ends_with($k, '__ts')) {
            $row[substr($k, 0, -4)] = mcp_format_moment($v);
            unset($row[$k]);
        }
    }
    return $row;
}

/**
 * The change window and order of one list.
 *
 * $cols:
 *   'created'       => 'p.created_at' | null   TIMESTAMP column, enables created_from/created_to and sort_by=created_at
 *   'updated'       => 'p.updated_at' | null   TIMESTAMP column, enables updated_from/updated_to and sort_by=updated_at
 *   'id'            => 'p.id'                  tiebreak, always last, ascending
 *   'sorts'         => ['deadline' => ['p.completion_deadline', 'ASC', 'p.priority DESC'], ...]
 *                      business sorts: [expression, default direction, optional extra order terms]
 *   'default_sort'  => 'deadline'              a key of 'sorts', or 'updated_at' / 'created_at'
 *   'default_limit' => 50, 'max_limit' => 100
 *
 * sort_order (asc|desc) overrides the primary direction; created_at/updated_at default to
 * newest first. Rows that change while an assistant pages by updated_at ASC move to the
 * end, so a poller never skips one.
 *
 * @return array{where: string[], params: array, order: string, limit: int, offset: int, tail: string}
 *   'tail' is "ORDER BY ... LIMIT n OFFSET m", ready to append after the WHERE clause.
 */
function mcp_list_window(array $args, array $cols): array {
    $where = [];
    $params = [];
    $bounds = [];
    if (!empty($cols['created'])) {
        $bounds[] = ['created_from', $cols['created'], '>=', false];
        $bounds[] = ['created_to', $cols['created'], '<', true];
    }
    if (!empty($cols['updated'])) {
        $bounds[] = ['updated_from', $cols['updated'], '>=', false];
        $bounds[] = ['updated_to', $cols['updated'], '<', true];
    }
    foreach ($bounds as [$key, $col, $op, $upper]) {
        $ts = mcp_optional_moment($args, $key, $upper);
        if ($ts !== null) { $where[] = "UNIX_TIMESTAMP($col) $op ?"; $params[] = $ts; }
    }
    foreach (['created_from', 'created_to', 'updated_from', 'updated_to'] as $key) {
        $kind = substr($key, 0, 7);
        if (isset($args[$key]) && $args[$key] !== '' && empty($cols[$kind])) {
            throw new \InvalidArgumentException("'{$key}' is not available here: these records store no {$kind} moment.");
        }
    }

    $sorts = mcp_window_sorts($cols);
    $sortKey = mcp_enum($args, 'sort_by', array_keys($sorts), $cols['default_sort'] ?? array_key_first($sorts));
    [$expr, $dir, $extra] = $sorts[$sortKey] + [2 => null];
    $order = mcp_enum($args, 'sort_order', ['asc', 'desc']);
    if ($order !== null) $dir = strtoupper($order);
    $orderBy = "$expr $dir" . ($extra ? ", $extra" : '') . ', ' . ($cols['id'] ?? 'id') . ' ASC';

    $limit = mcp_limit($args, (int)($cols['default_limit'] ?? 50), (int)($cols['max_limit'] ?? 100));
    $offset = max(0, (int)($args['offset'] ?? 0));
    return [
        'where' => $where,
        'params' => $params,
        'order' => $orderBy,
        'limit' => $limit,
        'offset' => $offset,
        'tail' => "ORDER BY $orderBy LIMIT $limit OFFSET $offset",
    ];
}

/** The sort_by choices of a window: its business sorts, then updated_at / created_at where they exist. */
function mcp_window_sorts(array $cols): array {
    $sorts = $cols['sorts'] ?? [];
    if (!empty($cols['updated'])) $sorts['updated_at'] = [$cols['updated'], 'DESC'];
    if (!empty($cols['created'])) $sorts['created_at'] = [$cols['created'], 'DESC'];
    if (!$sorts) $sorts['id'] = [$cols['id'] ?? 'id', 'ASC'];
    return $sorts;
}

/**
 * The inputSchema properties a window adds: created_from/_to, updated_from/_to (where the columns exist),
 * sort_by, sort_order, limit, offset. Merge them into the tool's own properties:
 * 'properties' => ['status' => [...]] + mcp_window_props($cols).
 */
function mcp_window_props(array $cols): array {
    $props = [];
    if (!empty($cols['created'])) {
        $props['created_from'] = ['type' => 'string', 'description' => 'Created at or after: YYYY-MM-DD or YYYY-MM-DD HH:MM'];
        $props['created_to'] = ['type' => 'string', 'description' => 'Created before: YYYY-MM-DD HH:MM (exclusive), or YYYY-MM-DD for up to the end of that day'];
    }
    if (!empty($cols['updated'])) {
        $props['updated_from'] = ['type' => 'string', 'description' => 'Last changed at or after: YYYY-MM-DD or YYYY-MM-DD HH:MM'];
        $props['updated_to'] = ['type' => 'string', 'description' => 'Last changed before: YYYY-MM-DD HH:MM (exclusive), or YYYY-MM-DD for up to the end of that day'];
    }
    $sorts = mcp_window_sorts($cols);
    $default = $cols['default_sort'] ?? array_key_first($sorts);
    $props['sort_by'] = ['type' => 'string', 'enum' => array_keys($sorts), 'description' => "Order of the rows (default: $default). updated_at / created_at: newest first unless sort_order=asc"];
    $props['sort_order'] = ['type' => 'string', 'enum' => ['asc', 'desc'], 'description' => 'Reverse or force the direction of sort_by'];
    $max = (int)($cols['max_limit'] ?? 100);
    $props['limit'] = ['type' => 'integer', 'description' => 'Max rows (default ' . (int)($cols['default_limit'] ?? 50) . ", at most $max)"];
    $props['offset'] = ['type' => 'integer', 'description' => 'Rows to skip, for the next page'];
    return $props;
}

/**
 * The sentence a list description appends: what the moments mean, how to ask "what changed",
 * how to poll, the zone, and the paging rule. $what names the rows ("projects").
 */
function mcp_window_doc(string $what, array $cols): string {
    $s = '';
    if (!empty($cols['updated']) || !empty($cols['created'])) {
        $fields = implode(' and ', array_filter([!empty($cols['created']) ? 'created_at' : null, !empty($cols['updated']) ? 'updated_at' : null]));
        $s .= "Each of the $what carries $fields as an ISO 8601 moment with the " . KOPERNIQ_PRODUCT_NAME . ' time-zone offset. ';
    }
    if (!empty($cols['updated'])) {
        $s .= 'To find what changed in a period use updated_from/updated_to with sort_by=updated_at; to poll, use sort_by=updated_at, '
            . 'sort_order=asc and updated_from = the last updated_at you saw. ';
    }
    if (!empty($cols['updated']) || !empty($cols['created'])) $s .= mcp_zone_note() . ' ';
    $s .= 'Pages: limit + offset; fewer rows than limit means the last page.';
    return $s;
}

/**
 * <field>_from / <field>_to on a DATE (or DATE-valued) column, both inclusive.
 * @return array{0: string[], 1: array} [where fragments, params]
 */
function mcp_date_range(array $args, string $field, string $col): array {
    $where = [];
    $params = [];
    $from = mcp_optional_date($args, "{$field}_from");
    $to = mcp_optional_date($args, "{$field}_to");
    if ($from !== null && $to !== null && $from > $to) {
        throw new \InvalidArgumentException("'{$field}_from' is after '{$field}_to'.");
    }
    if ($from !== null) { $where[] = "$col >= ?"; $params[] = $from; }
    if ($to !== null) { $where[] = "$col <= ?"; $params[] = $to; }
    return [$where, $params];
}

/** inputSchema properties for mcp_date_range(): "<field>_from" / "<field>_to". $label: "Due date". */
function mcp_date_range_props(string $field, string $label): array {
    return [
        "{$field}_from" => ['type' => 'string', 'description' => "$label on or after (YYYY-MM-DD)"],
        "{$field}_to" => ['type' => 'string', 'description' => "$label on or before (YYYY-MM-DD)"],
    ];
}

/**
 * $fromKey / $toKey on a DATETIME column that holds app-local wall time
 * (timeline_events.timestamp). Same input rules as mcp_optional_moment: lower bound
 * inclusive, upper exclusive with a time, whole-day with a bare date.
 * @return array{0: string[], 1: array}
 */
function mcp_local_range(array $args, string $fromKey, string $toKey, string $col): array {
    $where = [];
    $params = [];
    $from = mcp_optional_moment($args, $fromKey, false);
    $to = mcp_optional_moment($args, $toKey, true);
    if ($from !== null) { $where[] = "$col >= ?"; $params[] = date('Y-m-d H:i:s', $from); }
    if ($to !== null) { $where[] = "$col < ?"; $params[] = date('Y-m-d H:i:s', $to); }
    return [$where, $params];
}

/**
 * The time buckets of the task panel, for any dated entity: overdue / today / tomorrow /
 * upcoming (later than tomorrow), plus done when $open is given.
 *
 * $col:      the DATE column ('p.completion_deadline').
 * $open:     [sql, params] that is true for a row still open (not finished / paid / closed);
 *            overdue, today, tomorrow and upcoming only count open rows. null = every row counts.
 * $timeExpr: an 'HH:MM' expression for the time on the due day ("COALESCE(NULLIF(deadline_time, ''), '23:59')");
 *            with it, a row due today becomes overdue once that time has passed. null = whole days.
 * A row with no date never falls into a dated bucket.
 *
 * @return array{0: string[], 1: array}
 */
function mcp_date_bucket(?string $bucket, string $col, ?array $open = null, ?string $timeExpr = null): array {
    if ($bucket === null || $bucket === '') return [[], []];
    $where = [];
    $params = [];
    $today = mcp_today();
    $tomorrow = mcp_iso_shift($today, 1);
    if ($bucket === 'done') {
        if ($open === null) throw new \InvalidArgumentException("bucket 'done' is not available here.");
        return [["NOT ({$open[0]})"], $open[1]];
    }
    if ($open !== null) { $where[] = "({$open[0]})"; $params = array_merge($params, $open[1]); }
    $where[] = "$col IS NOT NULL AND $col <> ''";
    $now = date('H:i');
    switch ($bucket) {
        case 'overdue':
            if ($timeExpr) { $where[] = "($col < ? OR ($col = ? AND $timeExpr < ?))"; array_push($params, $today, $today, $now); }
            else { $where[] = "$col < ?"; $params[] = $today; }
            break;
        case 'today':
            if ($timeExpr) { $where[] = "$col = ? AND $timeExpr >= ?"; array_push($params, $today, $now); }
            else { $where[] = "$col = ?"; $params[] = $today; }
            break;
        case 'tomorrow':
            $where[] = "$col = ?"; $params[] = $tomorrow;
            break;
        case 'upcoming':
            $where[] = "$col > ?"; $params[] = $tomorrow;
            break;
        default:
            throw new \InvalidArgumentException("'bucket' must be one of: overdue, today, tomorrow, upcoming" . ($open !== null ? ', done' : '') . '.');
    }
    return [$where, $params];
}

/** inputSchema property for mcp_date_bucket(). $what: "deadline". */
function mcp_bucket_prop(string $what, bool $withDone = true): array {
    $enum = ['overdue', 'today', 'tomorrow', 'upcoming'];
    if ($withDone) $enum[] = 'done';
    return ['bucket' => ['type' => 'string', 'enum' => $enum,
        'description' => "Time bucket on the $what, as in the task panel: overdue (open and past it), today, tomorrow, upcoming (later than tomorrow)" . ($withDone ? ', done' : '') . '. "Today" is the ' . KOPERNIQ_PRODUCT_NAME . ' date (' . mcp_zone() . ').']];
}
