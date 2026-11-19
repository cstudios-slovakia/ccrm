<?php
/**
 * CCRM MCP: the live timer tools (get_running_timer, start_timer, stop_timer), parallel-aware
 * (docs/TIME-TRACKING-V2.md D5.3, D5.6). They mirror POST start / stop of time_entries.php:
 *
 *   - Several entries of one user may run (mode 'parallel', behind the company setting and the
 *     `time_tracking_parallel` permission). Every mutation takes the per-user lock (time_lock.php):
 *     ccrm_tt_lock_prepare() before the transaction, ccrm_tt_lock_user() as its first statement.
 *   - The identical target never runs twice (A4.4): starting what already runs changes nothing and
 *     answers success:false, code 'already_running', with the running entry (not an MCP error).
 *   - Refusals of a parallel start are MCP errors naming the code: parallel_disabled,
 *     parallel_forbidden, parallel_limit, same_project (D5.3 order).
 *
 * Included by mcp_ext_modules.php; the dispatcher there calls these functions.
 */

require_once __DIR__ . '/time_entries_lib.php';
require_once __DIR__ . '/time_settle.php';
require_once __DIR__ . '/time_lock.php';
require_once __DIR__ . '/time_parallel.php';

/** JSON of the given entry ids, in that order (missing ones skipped). */
function mcp_timer_json_list(\PDO $pdo, array $ids, array $viewer): array {
    $out = [];
    foreach ($ids as $id) {
        $row = ccrm_tt_fetch_entry($pdo, (string)$id);
        if ($row) {
            $out[] = ccrm_tt_entry_json($row, $viewer);
        }
    }
    return $out;
}

/** The user's running entries as JSON, oldest start first. */
function mcp_timer_running_json(\PDO $pdo, string $uid, array $viewer): array {
    $stmt = $pdo->prepare(ccrm_tt_entry_select() . " WHERE te.`running_guard` = ? ORDER BY te.`start_at` ASC, te.`id` ASC");
    $stmt->execute([$uid]);
    return array_map(fn($r) => ccrm_tt_entry_json($r, $viewer), $stmt->fetchAll(\PDO::FETCH_ASSOC));
}

/** One line per running entry, for error texts the model reads. */
function mcp_timer_describe(array $rows): string {
    $parts = [];
    foreach ($rows as $r) {
        $title = trim((string)($r['title_snapshot'] ?? '')) !== '' ? (string)$r['title_snapshot'] : (string)($r['description'] ?? '');
        $parts[] = "{$r['id']} (" . ($title !== '' ? $title : 'untitled') . ", started {$r['start_at']} UTC)";
    }
    return implode('; ', $parts);
}

/**
 * End one running row at $endUtc: duration (capped at 24 h, as MCP always did), frozen cost
 * rate, billable rate, and the given link / note overrides. Inside the transaction, under the lock;
 * a row another client stopped meanwhile is left as it is.
 */
function mcp_timer_close_row(\PDO $pdo, string $uid, array $row, string $endUtc, array $settings, ?array $links = null, $note = null, bool $setNote = false): void {
    $endUtc = max($endUtc, (string)$row['start_at']);
    $dur = min(86400, ccrm_tt_seconds_between($row['start_at'], $endUtc));
    $projectId = $links !== null ? $links['project_id'] : $row['project_id'];
    $ticketId = $links !== null ? $links['ticket_id'] : $row['ticket_id'];
    $pricing = ccrm_tt_price($pdo, $uid, $row['entry_date'], $dur, $settings, false);
    $billRate = !empty($row['billable'])
        ? ($row['billable_rate'] !== null ? (float)$row['billable_rate'] : ccrm_tt_lookup_billable_rate($pdo, $projectId, $ticketId, $row['entry_date']))
        : null;
    $pdo->prepare(
        "UPDATE time_entries
         SET task_id = ?, project_id = ?, title_snapshot = ?, description = ?, note = ?,
             end_at = ?, duration_sec = ?, employee_id = ?, cost_rate = ?, cost_rate_source = ?,
             cost_rate_basis_days = ?, billable_rate = ?
         WHERE id = ? AND end_at IS NULL"
    )->execute([
        $links !== null ? $links['task_id'] : $row['task_id'],
        $projectId,
        $links !== null ? $links['title_snapshot'] : $row['title_snapshot'],
        $links !== null ? $links['description'] : $row['description'],
        $setNote ? $note : $row['note'],
        $endUtc, $dur, $pricing['employee_id'], $pricing['cost_rate'], $pricing['cost_rate_source'],
        $pricing['cost_rate_basis_days'], $billRate, $row['id'],
    ]);
}

/** get_running_timer: {running: first|null (old clients), timers: Entry[], paused: []}. */
function mcp_timer_get_running(\PDO $pdo, string $uid, array $viewer): array {
    $timers = mcp_timer_running_json($pdo, $uid, $viewer);
    return ['running' => $timers[0] ?? null, 'timers' => $timers, 'paused' => []];
}

/** start_timer with mode 'switch' (default: stop every running entry) or 'parallel' (stop nothing). */
function mcp_timer_start(\PDO $pdo, array $user, string $uid, array $args, array $viewer, callable $checkLinkAccess): array {
    $mode = mcp_enum($args, 'mode', ['switch', 'parallel'], 'switch');
    $settings = ccrm_tt_load_settings($pdo);
    $links = ccrm_tt_resolve_links($pdo, [
        'taskId' => $args['task_id'] ?? null,
        'ticketId' => $args['ticket_id'] ?? null,
        'projectId' => $args['project_id'] ?? null,
        'description' => $args['description'] ?? null,
    ]);
    if (!$links['ok']) {
        throw new \InvalidArgumentException("Invalid timer link: {$links['code']}");
    }
    $checkLinkAccess($links);

    $nowUtc = ccrm_tt_now_utc();
    $today = ccrm_tt_local_date($nowUtc);
    $billable = array_key_exists('billable', $args) ? ($args['billable'] ? 1 : 0) : (!empty($settings['defaultBillable']) ? 1 : 0);
    $note = isset($args['note']) ? ccrm_tt_clean_note($args['note']) : null;
    $pricing = ccrm_tt_price($pdo, $uid, $today, null, $settings, true);
    $billRate = $billable ? ccrm_tt_lookup_billable_rate($pdo, $links['project_id'], $links['ticket_id'], $today) : null;
    $id = ccrm_tt_new_id();
    $canParallel = mcp_can('time_tracking_parallel');

    // Warm the holiday cache for the entries a switch may stop: no network inside the transaction.
    if ($mode === 'switch') {
        foreach (ccrm_tt_running_rows($pdo, $uid) as $prev) {
            ccrm_tt_price($pdo, $uid, $prev['entry_date'], null, $settings, true);
        }
    }

    ccrm_tt_lock_prepare($pdo, $uid);
    $result = mcp_tx($pdo, function () use ($pdo, $uid, $mode, $links, $settings, $canParallel, $nowUtc, $today, $id, $note, $billable, $billRate, $pricing) {
        ccrm_tt_lock_user($pdo, $uid);
        $runningRows = ccrm_tt_running_rows($pdo, $uid, true);
        $stopped = [];
        if ($mode === 'parallel') {
            $refusal = ccrm_tt_parallel_refusal($runningRows, $links, ccrm_tt_parallel_settings($settings), $canParallel);
            if ($refusal !== null) {
                return ['refusal' => $refusal];
            }
        } else {
            if ($same = ccrm_tt_identical_running($runningRows, $links)) {
                return ['refusal' => ['code' => 'already_running', 'entryId' => (string)$same['id']]];
            }
            foreach ($runningRows as $old) {
                mcp_timer_close_row($pdo, $uid, $old, $nowUtc, $settings);
                $stopped[] = $old;
            }
        }
        $pdo->prepare(
            "INSERT INTO time_entries
                (id, user_id, recorded_by_user_id, employee_id, project_id, task_id, ticket_id,
                 description, title_snapshot, note, entry_date, start_at, end_at, duration_sec,
                 billable, billable_rate, cost_rate, cost_rate_source, cost_rate_basis_days, tags, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, ?, '[]', 'timer')"
        )->execute([
            $id, $uid, $uid, $pricing['employee_id'], $links['project_id'], $links['task_id'], $links['ticket_id'],
            $links['description'], $links['title_snapshot'], $note, $today, $nowUtc,
            $billable, $billRate, $pricing['cost_rate'], $pricing['cost_rate_source'], $pricing['cost_rate_basis_days'],
        ]);
        // The stopped rows ran until now, so they cover the stopped intervals; the new one starts now.
        ccrm_tt_settle_rows($pdo, array_merge($stopped, [['id' => $id, 'user_id' => $uid, 'start_at' => $nowUtc, 'end_at' => null, 'entry_date' => $today]]));
        return ['stopped' => $stopped];
    });

    if (isset($result['refusal'])) {
        $r = $result['refusal'];
        if ($r['code'] === 'already_running') {
            $row = ccrm_tt_fetch_entry($pdo, $r['entryId']);
            return [
                'success' => false,
                'code' => 'already_running',
                'message' => 'This target is already running for you; nothing was started or stopped.',
                'entry' => $row ? ccrm_tt_entry_json($row, $viewer) : ['id' => $r['entryId']],
            ];
        }
        $why = [
            'parallel_disabled' => 'parallel tracking is turned off in the company time tracking settings',
            'parallel_forbidden' => 'your role lacks the time_tracking_parallel permission',
            'parallel_limit' => 'the limit of ' . ($r['maxParallel'] ?? '?') . ' timers running at once is reached',
            'same_project' => 'another timer of the same project is running' . (isset($r['entryId']) ? " (entry {$r['entryId']})" : '') . ' and the company setting does not allow that for this target',
        ][$r['code']] ?? 'refused';
        throw new \InvalidArgumentException("Cannot start a parallel timer ({$r['code']}): {$why}. Use mode \"switch\" to stop the running timers instead.");
    }

    $stoppedIds = array_map(fn($r) => (string)$r['id'], $result['stopped']);
    mcp_audit($pdo, $user, 'timer_start', "Started timer {$id}" . ($mode === 'parallel' ? ' (parallel)' : '') . ($stoppedIds ? ' (stopped ' . implode(', ', $stoppedIds) . ')' : ''));
    $row = ccrm_tt_fetch_entry($pdo, $id);
    return [
        'success' => true,
        'mode' => $mode,
        'stopped_previous_id' => $stoppedIds[0] ?? null, // old clients: the (first) stopped entry
        'stopped_ids' => $stoppedIds,
        'entry' => $row ? ccrm_tt_entry_json($row, $viewer) : ['id' => $id],
    ];
}

/** stop_timer {entry_id?, all?, description?, note?, project_id?, task_id?}. */
function mcp_timer_stop(\PDO $pdo, array $user, string $uid, array $args, array $viewer): array {
    $settings = ccrm_tt_load_settings($pdo);
    $entryId = isset($args['entry_id']) && trim((string)$args['entry_id']) !== '' ? trim((string)$args['entry_id']) : null;
    $all = $entryId === null && !empty($args['all']);

    if ($entryId !== null) {
        $s = $pdo->prepare("SELECT * FROM time_entries WHERE id = ? AND deleted_at IS NULL");
        $s->execute([$entryId]);
        $row = $s->fetch(\PDO::FETCH_ASSOC) ?: null;
        if (!$row || $row['start_at'] === null || (string)$row['user_id'] !== $uid) {
            throw new \InvalidArgumentException("No timer of yours found with entry_id {$entryId}.");
        }
        if ($row['end_at'] !== null) {
            // Already stopped (another client, a repeated call): idempotent.
            $done = ccrm_tt_fetch_entry($pdo, $entryId);
            return ['success' => true, 'already_stopped' => true, 'entry' => $done ? ccrm_tt_entry_json($done, $viewer) : ['id' => $entryId], 'stopped_ids' => []];
        }
        $rows = [$row];
    } else {
        $rows = ccrm_tt_running_rows($pdo, $uid);
        if ($all && !$rows) {
            return ['success' => true, 'entry' => null, 'stopped' => [], 'stopped_ids' => []];
        }
        if (!$rows) {
            throw new \InvalidArgumentException('No running timer found for the current user.');
        }
        if (!$all && count($rows) > 1) {
            throw new \InvalidArgumentException('Several timers are running: pass entry_id or all. Running: ' . mcp_timer_describe($rows));
        }
    }

    // One item: the overrides (and "require a project / task") apply to it, as before. All: each item is checked as it is.
    $links = null;
    $note = null;
    $setNote = false;
    if (!$all) {
        $row = $rows[0];
        $links = ccrm_tt_resolve_links($pdo, [
            'taskId' => array_key_exists('task_id', $args) ? $args['task_id'] : $row['task_id'],
            'ticketId' => $row['ticket_id'],
            'projectId' => array_key_exists('project_id', $args) ? $args['project_id'] : $row['project_id'],
            'description' => array_key_exists('description', $args) ? $args['description'] : $row['description'],
        ]);
        if (!$links['ok']) {
            throw new \InvalidArgumentException("Invalid timer link: {$links['code']}");
        }
        if (!empty($settings['requireProjectToStop']) && empty($links['project_id'])) {
            throw new \InvalidArgumentException('Workspace settings require a project_id before stopping a timer.');
        }
        if (!empty($settings['requireTask']) && empty($links['task_id'])) {
            throw new \InvalidArgumentException('Workspace settings require a task_id before stopping a timer.');
        }
        if (array_key_exists('note', $args)) {
            $note = ccrm_tt_clean_note($args['note']);
            $setNote = true;
        }
    } else {
        $needProject = [];
        $needTask = [];
        foreach ($rows as $r) {
            if (!empty($settings['requireProjectToStop']) && empty($r['project_id'])) {
                $needProject[] = $r;
            }
            if (!empty($settings['requireTask']) && empty($r['task_id'])) {
                $needTask[] = $r;
            }
        }
        if ($needProject) {
            throw new \InvalidArgumentException('Workspace settings require a project before stopping a timer; nothing was stopped. Stop these one by one with entry_id and project_id: ' . mcp_timer_describe($needProject));
        }
        if ($needTask) {
            throw new \InvalidArgumentException('Workspace settings require a task before stopping a timer; nothing was stopped. Stop these one by one with entry_id and task_id: ' . mcp_timer_describe($needTask));
        }
    }

    foreach ($rows as $r) {
        ccrm_tt_price($pdo, $uid, $r['entry_date'], null, $settings, true); // warm the holiday cache
    }
    $nowUtc = ccrm_tt_now_utc();
    ccrm_tt_lock_prepare($pdo, $uid);
    mcp_tx($pdo, function () use ($pdo, $uid, $rows, $nowUtc, $settings, $links, $note, $setNote) {
        ccrm_tt_lock_user($pdo, $uid);
        foreach ($rows as $r) {
            mcp_timer_close_row($pdo, $uid, $r, $nowUtc, $settings, $links, $note, $setNote);
        }
        ccrm_tt_settle_rows($pdo, $rows); // running until now: covers the stopped intervals
    });

    $ids = array_map(fn($r) => (string)$r['id'], $rows);
    mcp_audit($pdo, $user, 'timer_stop', 'Stopped timer' . (count($ids) > 1 ? 's ' : ' ') . implode(', ', $ids));
    $stopped = mcp_timer_json_list($pdo, $ids, $viewer);
    $out = ['success' => true, 'entry' => $stopped[0] ?? ['id' => $ids[0]], 'stopped_ids' => $ids];
    if ($all) {
        $out['stopped'] = $stopped;
    }
    return $out;
}
