<?php
/**
 * Machine API v1 — chat links and WhatsApp number checks (docs/WAAI-INTEGRATION.md §4.1, §4.4).
 * Required by integration.php after integration_tasks.php (it uses the audit helper and the user directory).
 *
 * WAAI decides which chat belongs to which client/lead/project; CCRM stores the answer and displays it.
 * Chat titles, phone digits and deep-link paths only — never message text.
 */

if (!function_exists('ccrm_int_handle_whatsapp_links_put')) {

    define('CCRM_INT_LINKS_MAX', 50);
    define('CCRM_INT_NUMBERS_MAX', 500);

    /** An ISO 8601 instant as local `Y-m-d H:i:s`, or null. Unlike task dates there is no window: a chat may be years old. */
    function ccrm_int_parse_instant($value, string $field): ?string {
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/D', $value)) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', [$field => 'Must be an ISO 8601 timestamp with a time zone.']);
        }
        try {
            return (new \DateTimeImmutable($value))->setTimezone(ccrm_int_local_zone())->format('Y-m-d H:i:s');
        } catch (\Throwable $e) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', [$field => 'Not a valid timestamp.']);
        }
    }

    /** Phone digits as WAAI normalises them (country code included), or null. */
    function ccrm_int_parse_phone_digits($value, string $field): ?string {
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_string($value) || !preg_match('/^\d{5,20}$/D', $value)) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', [$field => 'Must be 5 to 20 digits, country code included.']);
        }
        return $value;
    }

    /**
     * PUT /whatsapp/links/{conversationRef} — replaces the whole link set of one WAAI conversation.
     * An empty `links` list removes every link. A link to a lead or project that no longer exists is
     * left out and reported in `ignored`, so one deleted record cannot keep a conversation from syncing.
     *
     * @return array{0: int, 1: array}
     */
    function ccrm_int_handle_whatsapp_links_put(\PDO $pdo, array $client, array $req): array {
        $ref = (string)($req['params'][0] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/D', $ref)) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', ['conversation_ref' => 'Must match [A-Za-z0-9_-]{1,64}.']);
        }
        $body = ccrm_int_json_object($req['raw']);

        $title = ccrm_int_clean_text($body['title'] ?? '', 'title', 255);
        $isGroup = $body['is_group'] ?? false;
        if (!is_bool($isGroup)) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', ['is_group' => 'Must be a boolean.']);
        }
        $phone = ccrm_int_parse_phone_digits($body['phone'] ?? null, 'phone');
        $path = $body['path'] ?? null;
        if (!is_string($path) || !preg_match('#^/c/[A-Za-z0-9_-]{1,64}$#D', $path)) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', ['path' => 'Must be a chat path such as /c/<id>.']);
        }
        $lastMessage = ccrm_int_parse_instant($body['last_message_at'] ?? null, 'last_message_at');

        $ownerId = $body['owner_id'] ?? null;
        if ($ownerId !== null) {
            $dir = ccrm_int_user_directory($pdo);
            $ownerId = ccrm_int_task_user($ownerId, 'owner_id', $dir);
        }

        $links = $body['links'] ?? null;
        if (!is_array($links) || !array_is_list($links) || count($links) > CCRM_INT_LINKS_MAX) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', ['links' => 'Must be a list of at most ' . CCRM_INT_LINKS_MAX . ' links.']);
        }
        $wanted = [];   // "type:id" => source
        foreach ($links as $i => $link) {
            $type = is_array($link) ? ($link['entity_type'] ?? null) : null;
            $id = is_array($link) ? ($link['entity_id'] ?? null) : null;
            $source = is_array($link) ? ($link['source'] ?? 'auto') : null;
            if (!in_array($type, ['lead', 'project'], true) || !is_string($id) || !preg_match('/^[A-Za-z0-9_-]{1,50}$/D', $id) || !in_array($source, ['auto', 'manual'], true)) {
                ccrm_int_fail(422, 'validation_failed', 'Validation failed.', ["links.{$i}" => 'Needs entity_type (lead|project), entity_id and source (auto|manual).']);
            }
            // A manual link beats an auto one for the same entity.
            if (($wanted["{$type}:{$id}"] ?? 'auto') !== 'manual') {
                $wanted["{$type}:{$id}"] = $source;
            }
        }

        $ignored = [];
        $keep = [];
        foreach ($wanted as $key => $source) {
            [$type, $id] = explode(':', $key, 2);
            $exists = $pdo->prepare($type === 'lead' ? "SELECT 1 FROM `leads` WHERE `id` = ?" : "SELECT 1 FROM `projects` WHERE `id` = ?");
            $exists->execute([$id]);
            if ($exists->fetchColumn()) {
                $keep[] = [$type, $id, $source];
            } else {
                $ignored[] = ['entity_type' => $type, 'entity_id' => $id];
            }
        }

        $pdo->beginTransaction();
        try {
            $before = $pdo->prepare("SELECT `entity_type`, `entity_id`, `link_source`, `title`, `is_group`, `phone_digits`, `owner_user_id`, `path`, `last_message_at` FROM `whatsapp_links` WHERE `conversation_ref` = ? AND `client_id` = ? FOR UPDATE");
            $before->execute([$ref, $client['id']]);
            $had = $before->fetchAll(\PDO::FETCH_ASSOC);

            $upsert = $pdo->prepare(
                "INSERT INTO `whatsapp_links` (`client_id`, `conversation_ref`, `entity_type`, `entity_id`, `link_source`, `title`, `is_group`, `phone_digits`, `owner_user_id`, `path`, `last_message_at`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE `link_source` = VALUES(`link_source`), `title` = VALUES(`title`), `is_group` = VALUES(`is_group`),
                   `phone_digits` = VALUES(`phone_digits`), `owner_user_id` = VALUES(`owner_user_id`), `path` = VALUES(`path`), `last_message_at` = VALUES(`last_message_at`)"
            );
            $kept = [];
            foreach ($keep as [$type, $id, $source]) {
                $upsert->execute([$client['id'], $ref, $type, $id, $source, $title, $isGroup ? 1 : 0, $phone, $ownerId, $path, $lastMessage]);
                $kept["{$type}:{$id}"] = true;
            }
            $del = $pdo->prepare("DELETE FROM `whatsapp_links` WHERE `conversation_ref` = ? AND `client_id` = ? AND `entity_type` = ? AND `entity_id` = ?");
            foreach ($had as $h) {
                if (!isset($kept["{$h['entity_type']}:{$h['entity_id']}"])) {
                    $del->execute([$ref, $client['id'], $h['entity_type'], $h['entity_id']]);
                }
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        ccrm_int_audit($pdo, $client, 'integration_whatsapp_links', 'set ' . $ref . ' n=' . count($keep));
        return [200, [
            'conversation_ref' => $ref,
            'links' => array_map(static fn(array $l): array => ['entity_type' => $l[0], 'entity_id' => $l[1], 'source' => $l[2]], $keep),
            'ignored' => $ignored,
        ]];
    }

    /** DELETE /whatsapp/links/{conversationRef} — the conversation is gone in WAAI. Idempotent. */
    function ccrm_int_handle_whatsapp_links_delete(\PDO $pdo, array $client, array $req): array {
        $ref = (string)($req['params'][0] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/D', $ref)) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', ['conversation_ref' => 'Must match [A-Za-z0-9_-]{1,64}.']);
        }
        $stmt = $pdo->prepare("DELETE FROM `whatsapp_links` WHERE `conversation_ref` = ? AND `client_id` = ?");
        $stmt->execute([$ref, $client['id']]);
        if ($stmt->rowCount() > 0) {
            ccrm_int_audit($pdo, $client, 'integration_whatsapp_links', 'delete ' . $ref . ' n=' . $stmt->rowCount());
        }
        return [200, ['conversation_ref' => $ref, 'deleted' => $stmt->rowCount()]];
    }

    /** PUT /whatsapp/numbers — WAAI's answers to "is this number on WhatsApp?" (a batch of up to 500). */
    function ccrm_int_handle_whatsapp_numbers_put(\PDO $pdo, array $client, array $req): array {
        $body = ccrm_int_json_object($req['raw']);
        $items = $body['items'] ?? null;
        if (!is_array($items) || !array_is_list($items) || count($items) > CCRM_INT_NUMBERS_MAX) {
            ccrm_int_fail(422, 'validation_failed', 'Validation failed.', ['items' => 'Must be a list of at most ' . CCRM_INT_NUMBERS_MAX . ' items.']);
        }
        $rows = [];
        foreach ($items as $i => $item) {
            if (!is_array($item)) {
                ccrm_int_fail(422, 'validation_failed', 'Validation failed.', ["items.{$i}" => 'Must be an object.']);
            }
            $phone = ccrm_int_parse_phone_digits($item['phone'] ?? null, "items.{$i}.phone");
            $status = $item['status'] ?? null;
            if ($phone === null || !in_array($status, ['registered', 'not_registered'], true)) {
                ccrm_int_fail(422, 'validation_failed', 'Validation failed.', ["items.{$i}" => 'Needs phone (digits) and status (registered|not_registered).']);
            }
            $checkedAt = ccrm_int_parse_instant($item['checked_at'] ?? null, "items.{$i}.checked_at") ?? date('Y-m-d H:i:s');
            $rows[$phone] = [$status, $checkedAt];   // the last entry for a number wins
        }

        $pdo->beginTransaction();
        try {
            $upsert = $pdo->prepare(
                "INSERT INTO `whatsapp_numbers` (`phone_digits`, `status`, `checked_at`) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE `status` = IF(VALUES(`checked_at`) >= `checked_at`, VALUES(`status`), `status`),
                   `checked_at` = GREATEST(`checked_at`, VALUES(`checked_at`))"
            );
            foreach ($rows as $phone => [$status, $checkedAt]) {
                $upsert->execute([(string)$phone, $status, $checkedAt]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        return [200, ['stored' => count($rows)]];
    }
}
