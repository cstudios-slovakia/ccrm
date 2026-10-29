<?php
/**
 * Machine API v1 — tasks (docs/WAAI-INTEGRATION.md §4.1, §4.5). Required by integration.php.
 *
 *   PUT  /tasks/external/{externalId}   push: create or update a WAAI-origin task (three-way merge)
 *   GET  /tasks/feed                    changed tasks in the client's feed scope, keyset paged
 *   POST /tasks/lookup                  current state of up to 200 tasks by id or external id
 *   POST /tasks/{id}/complete           complete a task in the feed scope (idempotent)
 *
 * CCRM tasks name people, not ids (`tasks.owner`, `created_by`, `completed_by`, `task_assignees.user_name`),
 * so this file translates user ids <-> names on the way in and out; a name that matches no single user is
 * dropped, never guessed. Writes go straight to the tables, like the MCP tools do (mcp_ext_writes.php):
 * workflows, assignment e-mails and ticket auto-resolve are not fired for them (decision D9). Every write
 * sets `updated_at`, so sync.php's omission and clobber guards protect it from a stale client.
 */

if (!function_exists('ccrm_int_handle_task_push')) {

    define('CCRM_INT_TASK_MAX_ASSIGNEES', 20);
    define('CCRM_INT_TASK_MAX_FEED', 100);
    define('CCRM_INT_TASK_MAX_LOOKUP', 200);
    /** `tasks` columns plus `_ts`, the form every query here selects. */
    define('CCRM_INT_TASK_COLUMNS', "t.*, FLOOR(UNIX_TIMESTAMP(t.`updated_at`)) AS `_ts`");

    // ------------------------------------------------------------------ settings, users

    /** The configured task states in order: first = a new task, last = done. */
    function ccrm_int_task_states(\PDO $pdo): array {
        $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'TASK_STATES'")->fetchColumn();
        $states = is_string($raw) ? json_decode($raw, true) : null;
        return is_array($states) ? array_values(array_map('strval', $states)) : [];
    }

    function ccrm_int_task_is_done(string $status, array $states): bool {
        return strtolower($status) === 'done' || ($states !== [] && $status === (string)end($states));
    }

    function ccrm_int_task_done_state(array $states): string {
        return $states !== [] ? (string)end($states) : 'done';
    }

    function ccrm_int_task_initial_state(array $states): string {
        return $states !== [] ? (string)$states[0] : 'todo';
    }

    /**
     * Users by id and by name. A name shared by two users maps to nobody (null): the stored name
     * cannot tell them apart, so it must not be guessed.
     *
     * @return array{names: array<string, string>, ids: array<string, ?string>}
     */
    function ccrm_int_user_directory(\PDO $pdo): array {
        $names = [];
        $ids = [];
        foreach ($pdo->query("SELECT `id`, `name` FROM `users` ORDER BY `id`")->fetchAll(\PDO::FETCH_ASSOC) as $u) {
            $id = (string)$u['id'];
            $name = (string)$u['name'];
            $names[$id] = $name;
            $key = mb_strtolower(trim($name));
            $ids[$key] = array_key_exists($key, $ids) ? null : $id;
        }
        return ['names' => $names, 'ids' => $ids];
    }

    function ccrm_int_user_id_for_name(array $dir, ?string $name): ?string {
        $key = mb_strtolower(trim((string)$name));
        return $key === '' ? null : ($dir['ids'][$key] ?? null);
    }

    /** The app language the footer and timeline titles are written in: en, sk or hu. */
    function ccrm_int_language(\PDO $pdo): string {
        $v = strtolower(trim((string)$pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'")->fetchColumn()));
        return in_array($v, ['en', 'sk', 'hu'], true) ? $v : 'sk';
    }

    /** Base URL of this CCRM for links (config pin, else the last sign-in's URL), with a trailing slash, or ''. */
    function ccrm_int_base_url(\PDO $pdo): string {
        if (defined('CCRM_APP_URL') && is_string(CCRM_APP_URL) && CCRM_APP_URL !== '') {
            return rtrim(CCRM_APP_URL, '/') . '/';
        }
        $stored = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'APP_BASE_URL'")->fetchColumn();
        return is_string($stored) && preg_match('#^https?://#', $stored) ? rtrim($stored, '/') . '/' : '';
    }

    // ------------------------------------------------------------------ dates

    function ccrm_int_local_zone(): \DateTimeZone {
        return new \DateTimeZone(date_default_timezone_get());
    }

    /**
     * A deadline from `{at, all_day}`: the local date, and the local HH:MM unless it is an all-day deadline.
     *
     * @return array{date: string, time: ?string}|null
     */
    function ccrm_int_parse_due($due, string $field = 'due', ?int $now = null): ?array {
        if ($due === null) {
            return null;
        }
        if (!is_array($due) || !is_string($due['at'] ?? null) || (isset($due['all_day']) && !is_bool($due['all_day']))) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', [$field => 'Must be an object with an ISO 8601 "at" and a boolean "all_day".']);
        }
        $local = ccrm_int_parse_iso($due['at'], $field, $now)->setTimezone(ccrm_int_local_zone());
        return ['date' => $local->format('Y-m-d'), 'time' => !empty($due['all_day']) ? null : $local->format('H:i')];
    }

    /** A start date from an ISO date or date-time: the local date, or null when absent. */
    function ccrm_int_parse_start($value, string $field = 'start', ?int $now = null): ?string {
        if ($value === null || $value === '') {
            return null;
        }
        return ccrm_int_parse_iso($value, $field, $now)->setTimezone(ccrm_int_local_zone())->format('Y-m-d');
    }

    /** `deadline` + `deadline_time` as ISO 8601 with the offset of that day (23:59 when there is no time). */
    function ccrm_int_due_to_iso(string $deadline, ?string $time): string {
        $hasTime = $time !== null && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/D', $time) === 1;
        $dt = \DateTimeImmutable::createFromFormat('Y-m-d H:i', $deadline . ' ' . ($hasTime ? $time : '23:59'), ccrm_int_local_zone());
        return $dt ? $dt->format('c') : $deadline;
    }

    /** Today plus `$days` in the app time zone, for a task whose chat gave no date. */
    function ccrm_int_default_deadline(int $days, ?int $now = null): string {
        return (new \DateTimeImmutable('@' . ($now ?? time())))->setTimezone(ccrm_int_local_zone())->modify('+' . max(0, $days) . ' days')->format('Y-m-d');
    }

    // ------------------------------------------------------------------ description footer

    /**
     * The lines CCRM appends to a pushed description: chat, WhatsApp assignee and a link back into the chat.
     * Built here (never taken from the payload) so a payload cannot inject its own URL.
     */
    function ccrm_int_task_footer(string $lang, array $ctx, string $chatUrl): string {
        $labels = [
            'en' => ['chat' => 'WhatsApp chat', 'assignee' => 'WhatsApp assignee', 'open' => 'Open chat'],
            'sk' => ['chat' => 'WhatsApp chat', 'assignee' => 'Zodpovedný vo WhatsAppe', 'open' => 'Otvoriť chat'],
            'hu' => ['chat' => 'WhatsApp-csevegés', 'assignee' => 'WhatsApp felelős', 'open' => 'Csevegés megnyitása'],
        ][$lang] ?? null;
        $labels = $labels ?? ['chat' => 'WhatsApp chat', 'assignee' => 'WhatsApp assignee', 'open' => 'Open chat'];
        $lines = [];
        if (($ctx['conversation'] ?? '') !== '') {
            $lines[] = $labels['chat'] . ': ' . $ctx['conversation'];
        }
        if (($ctx['assignee_label'] ?? '') !== '') {
            $lines[] = $labels['assignee'] . ': ' . $ctx['assignee_label'];
        }
        if ($chatUrl !== '') {
            $lines[] = $labels['open'] . ': ' . $chatUrl;
        }
        return implode("\n", $lines);
    }

    function ccrm_int_task_compose_description(string $text, string $footer): string {
        return $footer === '' ? $text : $text . ($text !== '' ? "\n\n" : '') . $footer;
    }

    /** The WAAI path of a chat (or one message in it), or a 422. */
    function ccrm_int_parse_chat_path($value, string $field): ?string {
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_string($value) || !preg_match('#^/c/[A-Za-z0-9_-]{1,64}(\?m=[A-Za-z0-9_-]{1,64})?$#D', $value)) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', [$field => 'Must be a chat path such as /c/<id> or /c/<id>?m=<id>.']);
        }
        return $value;
    }

    // ------------------------------------------------------------------ push: parse

    /** Looks one user id up in the directory (a string or an integer), or 422. */
    function ccrm_int_task_user($value, string $field, array $dir): string {
        if (!(is_string($value) || is_int($value)) || !isset($dir['names'][(string)$value])) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', [$field => 'Contains an unknown user.']);
        }
        return (string)$value;
    }

    function ccrm_int_task_row_exists(\PDO $pdo, string $table, $id, string $field): string {
        if (!is_string($id) || $id === '' || strlen($id) > 50) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', [$field => 'Must be an id string.']);
        }
        $stmt = $pdo->prepare("SELECT 1 FROM `{$table}` WHERE `id` = ? LIMIT 1");
        $stmt->execute([$id]);
        if (!$stmt->fetchColumn()) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', [$field => 'No such record.']);
        }
        return $id;
    }

    /**
     * Validates and normalises a push body (docs/WAAI-INTEGRATION.md §4.1). Everything refused here is a
     * 422 before any row is touched.
     *
     * @return array<string, mixed>
     */
    function ccrm_int_task_parse_push(\PDO $pdo, array $client, array $p, array $dir, ?int $now = null): array {
        $bad = static fn(string $field, string $why) => ccrm_int_fail(422, 'validation_failed', 'Validation failed.', [$field => $why]);

        $revision = $p['revision'] ?? null;
        if (!is_int($revision) || $revision <= 0) {
            $bad('revision', 'Must be a positive integer.');
        }
        $title = ccrm_int_clean_text($p['title'] ?? null, 'title', 255, false, true);
        $description = ccrm_int_clean_text($p['description'] ?? null, 'description', 5000, true);

        $status = $p['status'] ?? 'open';
        if (!in_array($status, ['open', 'completed'], true)) {
            $bad('status', 'Must be "open" or "completed".');
        }

        $ownerId = ccrm_int_task_user($p['owner_id'] ?? null, 'owner_id', $dir);
        if (!in_array($ownerId, $client['owner_user_ids'], true)) {
            $bad('owner_id', 'Is not an owner configured for this client.');
        }

        $rawAssignees = $p['assignee_ids'] ?? [];
        if (!is_array($rawAssignees) || !array_is_list($rawAssignees) || count($rawAssignees) > CCRM_INT_TASK_MAX_ASSIGNEES) {
            $bad('assignee_ids', 'Must be a list of at most ' . CCRM_INT_TASK_MAX_ASSIGNEES . ' user ids.');
        }
        $assigneeIds = [];
        foreach ($rawAssignees as $a) {
            $assigneeIds[] = ccrm_int_task_user($a, 'assignee_ids', $dir);
        }
        $assigneeIds = array_values(array_unique($assigneeIds));
        if ($assigneeIds === []) {
            $assigneeIds = [$ownerId];
        }

        $ctx = is_array($p['context'] ?? null) ? $p['context'] : [];
        $context = [
            'conversation' => ccrm_int_clean_text($ctx['conversation'] ?? null, 'context.conversation', 255),
            'is_group' => !empty($ctx['is_group']),
            'assignee_label' => ccrm_int_clean_text($ctx['assignee_label'] ?? null, 'context.assignee_label', 255),
            'path' => ccrm_int_parse_chat_path($ctx['path'] ?? null, 'context.path'),
        ];
        // `start` is a top-level field; the all-inclusive-crm payload carried it in `context`.
        $start = ccrm_int_parse_start(array_key_exists('start', $p) ? $p['start'] : ($ctx['start'] ?? null), 'start', $now);

        $incoming = [
            'revision' => $revision,
            'title' => $title,
            'description' => $description,
            'status' => $status,
            'owner_id' => $ownerId,
            'assignee_ids' => $assigneeIds,
            'due' => ccrm_int_parse_due($p['due'] ?? null, 'due', $now),
            'start' => $start,
            'context' => $context,
            'has_lead' => array_key_exists('lead_id', $p),
            'has_project' => array_key_exists('project_id', $p),
            'lead_id' => null,
            'project_id' => null,
        ];
        if ($incoming['has_lead'] && $p['lead_id'] !== null) {
            $incoming['lead_id'] = ccrm_int_task_row_exists($pdo, 'leads', $p['lead_id'], 'lead_id');
        }
        if ($incoming['has_project'] && $p['project_id'] !== null) {
            $incoming['project_id'] = ccrm_int_task_row_exists($pdo, 'projects', $p['project_id'], 'project_id');
        }
        return $incoming;
    }

    // ------------------------------------------------------------------ serializer

    /** @return array<string, mixed>|null */
    function ccrm_int_task_meta($raw): ?array {
        $meta = json_decode((string)$raw, true);
        return is_array($meta) ? $meta : null;
    }

    /**
     * One task as the API shows it. `$row` is a `tasks` row plus `_ts` (unix seconds of `updated_at`),
     * `$ref` the client's `integration_refs` row for it, if any.
     *
     * @return array<string, mixed>
     */
    function ccrm_int_task_serialize(array $row, array $assigneeNames, ?array $ref, array $dir, array $states, string $baseUrl): array {
        $names = [];
        foreach (array_merge([(string)$row['owner']], $assigneeNames) as $n) {
            if (trim((string)$n) !== '' && !in_array($n, $names, true)) {
                $names[] = $n;
            }
        }
        $assigneeIds = [];
        foreach ($names as $n) {
            $id = ccrm_int_user_id_for_name($dir, $n);
            if ($id !== null && !in_array($id, $assigneeIds, true)) {
                $assigneeIds[] = $id;
            }
        }
        $status = (string)$row['status'];
        return [
            'id' => (string)$row['id'],
            'url' => $baseUrl . '#tasks?task=' . rawurlencode((string)$row['id']),
            'origin' => $ref !== null ? 'waai' : 'crm',
            'external_id' => $ref !== null ? (string)$ref['external_id'] : null,
            'title' => (string)$row['title'],
            'description' => (string)($row['description'] ?? ''),
            'state' => ['code' => $status, 'label' => $status],
            'done' => ccrm_int_task_is_done($status, $states),
            'due' => ['at' => ccrm_int_due_to_iso((string)$row['deadline'], $row['deadline_time'] ?? null), 'all_day' => ($row['deadline_time'] ?? null) === null],
            'created_by' => ccrm_int_user_id_for_name($dir, $row['created_by'] ?? null),
            'assignee_ids' => $assigneeIds,
            'is_automation' => ($row['workflow_id'] ?? null) !== null,
            'updated_at' => (int)$row['_ts'],
            'lead_id' => $row['related_lead_id'] ?? null,
            'project_id' => $row['related_project_id'] ?? null,
            'start' => $row['start_date'] ?? null,
        ];
    }

    /**
     * Serialises task rows for this client: assignees and refs are read in two batched queries.
     *
     * @param list<array> $rows
     * @return list<array<string, mixed>>
     */
    function ccrm_int_task_serialize_rows(\PDO $pdo, array $client, array $rows): array {
        if ($rows === []) {
            return [];
        }
        $ids = array_map(static fn(array $r): string => (string)$r['id'], $rows);
        $in = implode(',', array_fill(0, count($ids), '?'));

        $assignees = [];
        $stmt = $pdo->prepare("SELECT `task_id`, `user_name` FROM `task_assignees` WHERE `task_id` IN ({$in}) ORDER BY `user_name`");
        $stmt->execute($ids);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $a) {
            $assignees[$a['task_id']][] = $a['user_name'];
        }
        $refs = [];
        $stmt = $pdo->prepare("SELECT * FROM `integration_refs` WHERE `client_id` = ? AND `kind` = 'task' AND `local_id` IN ({$in})");
        $stmt->execute(array_merge([$client['id']], $ids));
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $refs[$r['local_id']] = $r;
        }

        $dir = ccrm_int_user_directory($pdo);
        $states = ccrm_int_task_states($pdo);
        $base = ccrm_int_base_url($pdo);
        return array_map(
            static fn(array $r): array => ccrm_int_task_serialize($r, $assignees[$r['id']] ?? [], $refs[$r['id']] ?? null, $dir, $states, $base),
            $rows
        );
    }

    // ------------------------------------------------------------------ scope

    /**
     * SQL (alias `t`) and parameters for the tasks this client may see through the feed: those of its
     * owners (`feed_scope = owners`) or all of them, minus tasks another API client pushed.
     *
     * @return array{0: string, 1: list<string>}
     */
    function ccrm_int_task_scope(array $client, array $dir): array {
        $where = ["NOT EXISTS (SELECT 1 FROM `integration_refs` xr WHERE xr.`kind` = 'task' AND xr.`local_id` = t.`id` AND xr.`client_id` <> ?)"];
        $params = [$client['id']];
        if ($client['feed_scope'] === 'owners') {
            $names = [];
            foreach ($client['owner_user_ids'] as $id) {
                if (isset($dir['names'][$id])) {
                    $names[] = $dir['names'][$id];
                }
            }
            if ($names === []) {
                return ['0 = 1', []];
            }
            $in = implode(',', array_fill(0, count($names), '?'));
            $where[] = "(t.`owner` IN ({$in}) OR t.`created_by` IN ({$in}) OR EXISTS (SELECT 1 FROM `task_assignees` fa WHERE fa.`task_id` = t.`id` AND fa.`user_name` IN ({$in})))";
            $params = array_merge($params, $names, $names, $names);
        }
        return [implode(' AND ', $where), $params];
    }

    // ------------------------------------------------------------------ audit

    /** Best-effort audit row: ids only, never text from the other system. */
    function ccrm_int_audit(\PDO $pdo, array $client, string $action, string $detail): void {
        try {
            $pdo->prepare("INSERT INTO `audit_log` (`actor_id`, `actor_email`, `action`, `detail`, `ip`) VALUES (NULL, ?, ?, ?, ?)")
                ->execute(['integration:' . $client['code'], $action, $detail, substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45)]);
        } catch (\Throwable $e) {
            error_log('[ccrm integration] audit failed: ' . get_class($e));
        }
    }

    // ------------------------------------------------------------------ push

    /** Replaces the assignee list of a task (names). */
    function ccrm_int_task_write_assignees(\PDO $pdo, string $taskId, array $names): void {
        $pdo->prepare("DELETE FROM `task_assignees` WHERE `task_id` = ?")->execute([$taskId]);
        $ins = $pdo->prepare("INSERT IGNORE INTO `task_assignees` (`task_id`, `user_name`) VALUES (?, ?)");
        foreach (array_values(array_unique($names)) as $n) {
            $ins->execute([$taskId, $n]);
        }
    }

    /** A completion needs a conclusion when the task asks for one (the rule of src/utils/taskConclusion.ts). */
    function ccrm_int_task_require_conclusion(array $row, string $incoming): void {
        if ((int)($row['requires_conclusion'] ?? 0) === 1 && trim((string)($row['conclusion'] ?? '')) === '' && trim($incoming) === '') {
            ccrm_int_fail(422, 'completion_refused', 'This task requires a conclusion before it can be completed.');
        }
    }

    /**
     * PUT /tasks/external/{externalId}. One transaction: lock or create the ref, refuse a deleted or stale
     * push, then create the task or merge the fields the chat changed since the last applied snapshot.
     */
    function ccrm_int_handle_task_push(\PDO $pdo, array $client, array $req): array {
        $externalId = (string)($req['params'][0] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/D', $externalId)) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', ['externalId' => 'Must match [A-Za-z0-9_-]{8,64}.']);
        }
        $payload = ccrm_int_json_object($req['raw']);
        $dir = ccrm_int_user_directory($pdo);
        $states = ccrm_int_task_states($pdo);
        $in = ccrm_int_task_parse_push($pdo, $client, $payload, $dir);

        $ownerName = $dir['names'][$in['owner_id']];
        $assigneeNames = array_map(static fn(string $id): string => $dir['names'][$id], $in['assignee_ids']);
        $base = ccrm_int_base_url($pdo);
        $chatUrl = $base !== '' && $in['context']['path'] !== null ? $base . '#whatsapp' . $in['context']['path'] : '';
        $description = ccrm_int_task_compose_description($in['description'], ccrm_int_task_footer(ccrm_int_language($pdo), $in['context'], $chatUrl));

        $composed = [
            'title' => $in['title'],
            'description' => $description,
            'due' => $in['due'],
            'start' => $in['start'],
            'assignee_ids' => $in['assignee_ids'],
            'status' => $in['status'],
        ];
        if ($in['has_lead']) {
            $composed['lead_id'] = $in['lead_id'];
        }
        if ($in['has_project']) {
            $composed['project_id'] = $in['project_id'];
        }
        $meta = [
            'conversation' => $in['context']['conversation'],
            'is_group' => $in['context']['is_group'],
            'assignee_label' => $in['context']['assignee_label'],
        ];

        $pdo->beginTransaction();
        try {
            $pdo->prepare("INSERT IGNORE INTO `integration_refs` (`client_id`, `kind`, `external_id`, `revision`) VALUES (?, 'task', ?, 0)")
                ->execute([$client['id'], $externalId]);
            $stmt = $pdo->prepare("SELECT * FROM `integration_refs` WHERE `client_id` = ? AND `kind` = 'task' AND `external_id` = ? FOR UPDATE");
            $stmt->execute([$client['id'], $externalId]);
            $ref = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$ref) {
                throw new \RuntimeException('Cannot lock the external reference.');
            }

            $row = null;
            if ($ref['local_id'] !== null) {
                $stmt = $pdo->prepare("SELECT " . CCRM_INT_TASK_COLUMNS . " FROM `tasks` t WHERE t.`id` = ? FOR UPDATE");
                $stmt->execute([$ref['local_id']]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: null;
                if ($row === null) {
                    // The ref outlives the task: a CCRM user deleted it. Never recreate what was deleted.
                    ccrm_int_fail(410, 'gone', 'The task was deleted in CCRM.');
                }
            }

            $created = false;
            $applied = [];
            if ($row !== null && $in['revision'] <= (int)$ref['revision']) {
                $stale = true;
            } else {
                $stale = false;
                if ($row === null) {
                    $row = ccrm_int_task_create($pdo, $client, $in, $composed, $meta, $ownerName, $assigneeNames, $states);
                    $applied = array_keys($composed);
                    $created = true;
                } else {
                    $applied = ccrm_int_task_merge($pdo, $row, json_decode((string)$ref['applied_snapshot'], true) ?: [], $composed, $in, $meta, $ownerName, $assigneeNames, $states);
                }
                $pdo->prepare("UPDATE `integration_refs` SET `local_id` = ?, `revision` = ?, `applied_snapshot` = ? WHERE `id` = ?")
                    ->execute([$row['id'], $in['revision'], json_encode($composed, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $ref['id']]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        if (!$stale) {
            ccrm_int_audit($pdo, $client, 'integration_task_push', ($created ? 'create ' : 'update ') . $row['id'] . ' ext=' . $externalId);
        }
        $stmt = $pdo->prepare("SELECT " . CCRM_INT_TASK_COLUMNS . " FROM `tasks` t WHERE t.`id` = ?");
        $stmt->execute([$row['id']]);
        $fresh = ccrm_int_task_serialize_rows($pdo, $client, [$stmt->fetch(\PDO::FETCH_ASSOC)])[0];
        return [$created ? 201 : 200, $fresh + ['stale' => $stale, 'applied' => $applied]];
    }

    /**
     * Inserts the task for a first push. A chat that gave no date gets today + the client's default and is
     * remembered as such (`due_inferred`), so the UI can say the date was not stated.
     *
     * @return array the new row (id only is needed by the caller)
     */
    function ccrm_int_task_create(\PDO $pdo, array $client, array $in, array $composed, array $meta, string $ownerName, array $assigneeNames, array $states): array {
        $id = 'tsk_' . bin2hex(random_bytes(8));
        $due = $in['due'];
        if ($due === null) {
            $due = ['date' => ccrm_int_default_deadline($client['default_deadline_days']), 'time' => null];
            $meta['due_inferred'] = true;
            $meta['inferred_deadline'] = $due['date'];
        }
        $done = $in['status'] === 'completed';
        $pdo->prepare(
            "INSERT INTO `tasks` (`id`, `title`, `description`, `priority`, `start_date`, `deadline`, `deadline_time`, `status`, `owner`, `created_by`,
                                  `related_lead_id`, `related_project_id`, `completed_by`, `completed_at`, `external_source`, `external_url`, `external_meta_json`)
             VALUES (?, ?, ?, 'medium', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )->execute([
            $id, $composed['title'], $composed['description'], $in['start'], $due['date'], $due['time'],
            $done ? ccrm_int_task_done_state($states) : ccrm_int_task_initial_state($states),
            $assigneeNames[0], $ownerName,
            $in['lead_id'], $in['project_id'],
            $done ? $ownerName : null, $done ? date('Y-m-d H:i') : null,
            $client['code'], $in['context']['path'], json_encode($meta, JSON_UNESCAPED_UNICODE),
        ]);
        ccrm_int_task_write_assignees($pdo, $id, $assigneeNames);
        return ['id' => $id];
    }

    /**
     * Applies the fields the chat changed since the snapshot, so a CCRM user's edit survives until the chat
     * changes the same field again. A task that is done in CCRM is final. Returns the applied field names.
     *
     * @return list<string>
     */
    function ccrm_int_task_merge(\PDO $pdo, array $row, array $snapshot, array $composed, array $in, array $meta, string $ownerName, array $assigneeNames, array $states): array {
        $changed = [];
        foreach ($composed as $field => $value) {
            if (!array_key_exists($field, $snapshot) || $snapshot[$field] !== $value) {
                $changed[] = $field;
            }
        }
        $isDone = ccrm_int_task_is_done((string)$row['status'], $states);

        $sets = [];
        $params = [];
        $applied = [];
        $set = static function (string $column, $value) use (&$sets, &$params): void {
            $sets[] = "`{$column}` = ?";
            $params[] = $value;
        };
        $oldMeta = ccrm_int_task_meta($row['external_meta_json'] ?? null) ?? [];
        $newMeta = array_merge($oldMeta, $meta);

        if (!$isDone) {
            foreach ($changed as $field) {
                switch ($field) {
                    case 'title':
                        $set('title', $composed['title']);
                        break;
                    case 'description':
                        $set('description', $composed['description']);
                        break;
                    case 'due':
                        // A date taken away in the chat leaves the deadline as it is: a task always has one.
                        if ($composed['due'] === null) {
                            continue 2;
                        }
                        $set('deadline', $composed['due']['date']);
                        $set('deadline_time', $composed['due']['time']);
                        unset($newMeta['due_inferred'], $newMeta['inferred_deadline']);
                        break;
                    case 'start':
                        $set('start_date', $composed['start']);
                        break;
                    case 'assignee_ids':
                        $set('owner', $assigneeNames[0]);
                        break;
                    case 'status':
                        // Only completion is applied: `open` never moves a task between states or reopens it.
                        if ($composed['status'] !== 'completed') {
                            continue 2;
                        }
                        ccrm_int_task_require_conclusion($row, '');
                        $set('status', ccrm_int_task_done_state($states));
                        $set('completed_by', $ownerName);
                        $set('completed_at', date('Y-m-d H:i'));
                        break;
                    case 'lead_id':
                        $set('related_lead_id', $composed['lead_id']);
                        break;
                    case 'project_id':
                        $set('related_project_id', $composed['project_id']);
                        break;
                }
                $applied[] = $field;
            }
            if (in_array('assignee_ids', $applied, true)) {
                ccrm_int_task_write_assignees($pdo, (string)$row['id'], $assigneeNames);
            }
        }
        // Server-owned columns follow the chat; they are only written when they differ.
        $metaJson = json_encode($newMeta, JSON_UNESCAPED_UNICODE);
        if (!$isDone && $metaJson !== (string)($row['external_meta_json'] ?? '')) {
            $set('external_meta_json', $metaJson);
        }
        if (!$isDone && $in['context']['path'] !== null && $in['context']['path'] !== ($row['external_url'] ?? null)) {
            $set('external_url', $in['context']['path']);
        }
        if ($sets !== [] || in_array('assignee_ids', $applied, true)) {
            $sets[] = '`updated_at` = NOW(3)';
            $params[] = (string)$row['id'];
            $pdo->prepare("UPDATE `tasks` SET " . implode(', ', $sets) . " WHERE `id` = ?")->execute($params);
        }
        return $applied;
    }

    // ------------------------------------------------------------------ feed, lookup

    /** A non-negative integer query parameter, or the default when absent; 422 otherwise. */
    function ccrm_int_query_int(array $query, string $name, int $default, int $min, ?int $max = null): int {
        $v = $query[$name] ?? null;
        if ($v === null || $v === '') {
            return $default;
        }
        if (!is_string($v) || !ctype_digit($v) || strlen($v) > 12 || (int)$v < $min || ($max !== null && (int)$v > $max)) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', [$name => 'Must be an integer' . ($max !== null ? " between {$min} and {$max}" : '') . '.']);
        }
        return (int)$v;
    }

    /** GET /tasks/feed — keyset page ordered by (updated_at in whole seconds, id). */
    function ccrm_int_handle_task_feed(\PDO $pdo, array $client, array $req): array {
        $q = $req['query'];
        $since = ccrm_int_query_int($q, 'updated_since', 0, 0);
        $limit = ccrm_int_query_int($q, 'limit', 50, 1, CCRM_INT_TASK_MAX_FEED);
        $afterId = $q['after_id'] ?? '';
        if (!is_string($afterId) || !preg_match('/^[A-Za-z0-9_-]{0,50}$/D', $afterId)) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', ['after_id' => 'Must be a task id.']);
        }
        $openOnly = filter_var($q['open_only'] ?? false, FILTER_VALIDATE_BOOLEAN);

        $dir = ccrm_int_user_directory($pdo);
        [$scope, $params] = ccrm_int_task_scope($client, $dir);
        $sec = "FLOOR(UNIX_TIMESTAMP(t.`updated_at`))";
        $where = [$scope];
        if ($since > 0) {
            // Lets MySQL use an index on updated_at before the exact whole-second comparison.
            $where[] = "t.`updated_at` >= FROM_UNIXTIME(CAST(? AS UNSIGNED))";
            $params[] = (string)$since;
        }
        $where[] = "({$sec} > ? OR ({$sec} = ? AND t.`id` > ?))";
        array_push($params, $since, $since, $afterId);
        if ($openOnly) {
            $states = ccrm_int_task_states($pdo);
            $where[] = "LOWER(t.`status`) <> 'done'";
            if ($states !== []) {
                $where[] = "t.`status` <> ?";
                $params[] = (string)end($states);
            }
        }

        $stmt = $pdo->prepare(
            "SELECT " . CCRM_INT_TASK_COLUMNS . " FROM `tasks` t WHERE " . implode(' AND ', $where)
            . " ORDER BY `_ts` ASC, t.`id` ASC LIMIT " . ($limit + 1)
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $hasMore = count($rows) > $limit;
        $rows = array_slice($rows, 0, $limit);
        $last = $rows !== [] ? end($rows) : null;

        return [200, [
            'items' => ccrm_int_task_serialize_rows($pdo, $client, $rows),
            'next' => ['updated_since' => $last !== null ? (int)$last['_ts'] : $since, 'after_id' => $last !== null ? (string)$last['id'] : $afterId],
            'has_more' => $hasMore,
        ]];
    }

    /** POST /tasks/lookup — tasks the client may not see are reported exactly like missing ones. */
    function ccrm_int_handle_task_lookup(\PDO $pdo, array $client, array $req): array {
        $body = ccrm_int_json_object($req['raw']);
        $taskIds = $body['task_ids'] ?? [];
        $externalIds = $body['external_ids'] ?? [];
        if (!is_array($taskIds) || !array_is_list($taskIds) || !is_array($externalIds) || !array_is_list($externalIds)) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', ['task_ids' => 'task_ids and external_ids must be lists.']);
        }
        foreach ($taskIds as $id) {
            if (!is_string($id) || !preg_match('/^[A-Za-z0-9_-]{1,50}$/D', $id)) {
                ccrm_int_fail(422, 'validation_failed', 'Validation failed.', ['task_ids' => 'Must be task id strings.']);
            }
        }
        foreach ($externalIds as $id) {
            if (!is_string($id) || !preg_match('/^[A-Za-z0-9_-]{8,64}$/D', $id)) {
                ccrm_int_fail(422, 'validation_failed', 'Validation failed.', ['external_ids' => 'Must match [A-Za-z0-9_-]{8,64}.']);
            }
        }
        $taskIds = array_values(array_unique($taskIds));
        $externalIds = array_values(array_unique($externalIds));
        if (count($taskIds) + count($externalIds) > CCRM_INT_TASK_MAX_LOOKUP) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', ['task_ids' => 'At most ' . CCRM_INT_TASK_MAX_LOOKUP . ' ids per request.']);
        }

        $canPush = ccrm_int_has_scope($client, 'tasks:push');
        $canPull = ccrm_int_has_scope($client, 'tasks:pull');
        $dir = ccrm_int_user_directory($pdo);
        $found = [];       // id => row
        $notFoundTasks = [];
        $notFoundExternal = [];
        $deleted = [];

        $fetch = static function (array $ids, ?string $scopeSql, array $scopeParams) use ($pdo): array {
            $in = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $pdo->prepare("SELECT " . CCRM_INT_TASK_COLUMNS . " FROM `tasks` t WHERE t.`id` IN ({$in})" . ($scopeSql !== null ? " AND {$scopeSql}" : ''));
            $stmt->execute(array_merge($ids, $scopeParams));
            $out = [];
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $out[(string)$r['id']] = $r;
            }
            return $out;
        };

        if ($taskIds !== []) {
            $visible = [];
            if ($canPull) {
                [$scopeSql, $scopeParams] = ccrm_int_task_scope($client, $dir);
                $visible = $fetch($taskIds, $scopeSql, $scopeParams);
            }
            $remaining = array_values(array_diff($taskIds, array_keys($visible)));
            if ($canPush && $remaining !== []) {
                $in = implode(',', array_fill(0, count($remaining), '?'));
                $stmt = $pdo->prepare("SELECT `local_id` FROM `integration_refs` WHERE `client_id` = ? AND `kind` = 'task' AND `local_id` IN ({$in})");
                $stmt->execute(array_merge([$client['id']], $remaining));
                $own = $stmt->fetchAll(\PDO::FETCH_COLUMN);
                if ($own !== []) {
                    $visible += $fetch(array_map('strval', $own), null, []);
                }
            }
            foreach ($taskIds as $id) {
                if (isset($visible[$id])) {
                    $found[$id] = $visible[$id];
                } else {
                    $notFoundTasks[] = $id;
                }
            }
        }

        if ($externalIds !== []) {
            $refs = [];
            if ($canPush) {
                $in = implode(',', array_fill(0, count($externalIds), '?'));
                $stmt = $pdo->prepare("SELECT * FROM `integration_refs` WHERE `client_id` = ? AND `kind` = 'task' AND `external_id` IN ({$in})");
                $stmt->execute(array_merge([$client['id']], $externalIds));
                foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                    $refs[$r['external_id']] = $r;
                }
            }
            $local = [];
            foreach ($refs as $r) {
                if ($r['local_id'] !== null) {
                    $local[] = (string)$r['local_id'];
                }
            }
            $rows = $local !== [] ? $fetch($local, null, []) : [];
            foreach ($externalIds as $ext) {
                $ref = $refs[$ext] ?? null;
                if ($ref === null) {
                    $notFoundExternal[] = $ext;
                } elseif ($ref['local_id'] === null || !isset($rows[(string)$ref['local_id']])) {
                    // A ref that outlived its task, or one whose first push never committed.
                    $deleted[] = $ext;
                } else {
                    $found[(string)$ref['local_id']] = $rows[(string)$ref['local_id']];
                }
            }
        }

        return [200, [
            'items' => ccrm_int_task_serialize_rows($pdo, $client, array_values($found)),
            'deleted' => ['external_ids' => $deleted],
            'not_found' => ['task_ids' => $notFoundTasks, 'external_ids' => $notFoundExternal],
        ]];
    }

    // ------------------------------------------------------------------ complete

    /**
     * POST /tasks/{id}/complete — completes a task in the client's feed scope. Repeating the call is safe.
     * The body is optional: `{conclusion?, user_id?}` (the CCRM user the completion is attributed to; the
     * client's first owner when absent).
     */
    function ccrm_int_handle_task_complete(\PDO $pdo, array $client, array $req): array {
        $id = (string)($req['params'][0] ?? '');
        $body = $req['raw'] !== '' ? ccrm_int_json_object($req['raw']) : [];
        $conclusion = ccrm_int_clean_text($body['conclusion'] ?? null, 'conclusion', 5000, true);
        $dir = ccrm_int_user_directory($pdo);
        $states = ccrm_int_task_states($pdo);
        if (array_key_exists('user_id', $body)) {
            $byName = $dir['names'][ccrm_int_task_user($body['user_id'], 'user_id', $dir)];
        } else {
            $byName = $dir['names'][$client['owner_user_ids'][0] ?? ''] ?? null;
        }

        [$scopeSql, $scopeParams] = ccrm_int_task_scope($client, $dir);
        $pdo->beginTransaction();
        try {
            $row = null;
            if (preg_match('/^[A-Za-z0-9_-]{1,50}$/D', $id)) {
                $stmt = $pdo->prepare("SELECT " . CCRM_INT_TASK_COLUMNS . " FROM `tasks` t WHERE t.`id` = ? AND {$scopeSql} FOR UPDATE");
                $stmt->execute(array_merge([$id], $scopeParams));
                $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: null;
            }
            if ($row === null) {
                ccrm_int_fail(404, 'not_found', 'No such task.');
            }
            if (!ccrm_int_task_is_done((string)$row['status'], $states)) {
                ccrm_int_task_require_conclusion($row, $conclusion);
                $pdo->prepare(
                    "UPDATE `tasks` SET `status` = ?, `completed_by` = ?, `completed_at` = ?, `conclusion` = COALESCE(?, `conclusion`), `updated_at` = NOW(3) WHERE `id` = ?"
                )->execute([ccrm_int_task_done_state($states), $byName, date('Y-m-d H:i'), $conclusion === '' ? null : $conclusion, $id]);
                $completedNow = true;
            } else {
                $completedNow = false;
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        if ($completedNow) {
            ccrm_int_audit($pdo, $client, 'integration_task_complete', 'complete ' . $id);
        }
        $stmt = $pdo->prepare("SELECT " . CCRM_INT_TASK_COLUMNS . " FROM `tasks` t WHERE t.`id` = ?");
        $stmt->execute([$id]);
        return [200, ccrm_int_task_serialize_rows($pdo, $client, [$stmt->fetch(\PDO::FETCH_ASSOC)])[0]];
    }
}
