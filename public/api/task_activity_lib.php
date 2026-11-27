<?php
/**
 * Shared Task Activity, Reactions & Audit Diff Library.
 *
 * Isolates heavy comment streams and uploaded image paths from sync.php's
 * 5-second global poll while maintaining lightweight denormalized badges
 * (`tasks.comment_count`, `tasks.reactions_json`) without extra JOINs.
 *
 * All functions are guarded with function_exists() so dual-path loaders
 * (public/api vs api or update scripts) never trigger fatal redeclarations.
 */

if (!function_exists('ccrm_migrate_task_activities')) {
    function ccrm_migrate_task_activities(PDO $pdo): void {
        try {
            if (!ccrm_table_exists($pdo, 'task_activities')) {
                $pdo->exec(
                    "CREATE TABLE IF NOT EXISTS `task_activities` (
                      `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                      `task_id` VARCHAR(50) NOT NULL,
                      `kind` ENUM('comment', 'state_change') NOT NULL DEFAULT 'comment',
                      `event_type` VARCHAR(32) NULL,
                      `author_name` VARCHAR(100) NOT NULL DEFAULT '',
                      `body` TEXT NULL,
                      `meta_json` TEXT NULL,
                      `reactions_json` VARCHAR(1000) NULL,
                      `deleted_at` DATETIME NULL,
                      `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                      `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                      INDEX `idx_ta_task_id` (`task_id`, `id`),
                      INDEX `idx_ta_task_updated` (`task_id`, `updated_at`)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
                );
            }
            if (ccrm_table_exists($pdo, 'tasks')) {
                if (!ccrm_column_exists($pdo, 'tasks', 'comment_count')) {
                    $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `comment_count` INT UNSIGNED NOT NULL DEFAULT 0");
                }
                if (!ccrm_column_exists($pdo, 'tasks', 'reactions_json')) {
                    $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `reactions_json` VARCHAR(1000) NULL");
                }
            }
        } catch (\Throwable $e) {
            error_log('[ccrm schema] task_activities migration skipped: ' . $e->getMessage());
        }
    }
}

if (!function_exists('ccrm_normalize_reaction_map')) {
    /**
     * Normalize decoded reactions JSON to `array<string, list<string>>`.
     *
     * @return array<string, list<string>>
     */
    function ccrm_normalize_reaction_map($raw): array {
        if (is_string($raw) && $raw !== '') {
            $raw = json_decode($raw, true);
        }
        if (!is_array($raw)) {
            return [];
        }
        $clean = [];
        foreach ($raw as $emoji => $users) {
            if (!is_string($emoji) || !is_array($users)) {
                continue;
            }
            $e = trim($emoji);
            if ($e === '' || mb_strlen($e, 'UTF-8') > 16 || preg_match('/[\x00-\x1F\x7F\r\n\t ]/u', $e)) {
                continue;
            }
            $list = [];
            foreach ($users as $u) {
                $name = trim((string)$u);
                if ($name !== '' && !in_array($name, $list, true)) {
                    $list[] = $name;
                }
            }
            if (!empty($list)) {
                $clean[$e] = $list;
            }
        }
        return $clean;
    }
}

if (!function_exists('ccrm_toggle_reaction_map')) {
    /**
     * Toggle a user's emoji reaction in a JSON map string.
     * Enforces bounded distinct emojis (max 12) and VARCHAR(1000) byte limit.
     *
     * @return array{json: ?string, map: array<string, list<string>>}
     */
    function ccrm_toggle_reaction_map(?string $rawJson, string $emoji, string $userName): array {
        $e = trim($emoji);
        if ($e === '' || mb_strlen($e, 'UTF-8') > 16 || preg_match('/[\x00-\x1F\x7F\r\n\t ]/u', $e)) {
            throw new \InvalidArgumentException('Invalid emoji reaction.');
        }
        $actor = trim($userName);
        if ($actor === '') {
            throw new \InvalidArgumentException('Invalid user name.');
        }

        $map = ccrm_normalize_reaction_map($rawJson);
        $current = $map[$e] ?? [];
        if (in_array($actor, $current, true)) {
            $next = array_values(array_filter($current, static fn($u) => $u !== $actor));
            if (empty($next)) {
                unset($map[$e]);
            } else {
                $map[$e] = $next;
            }
        } else {
            if (!isset($map[$e]) && count($map) >= 12) {
                throw new \InvalidArgumentException('Maximum 12 reaction types per item reached.');
            }
            $current[] = $actor;
            $map[$e] = $current;
        }

        if (empty($map)) {
            return ['json' => null, 'map' => []];
        }
        $encoded = json_encode($map, JSON_UNESCAPED_UNICODE);
        if ($encoded === false || strlen($encoded) > 950) {
            throw new \InvalidArgumentException('Reaction list limit reached.');
        }
        return ['json' => $encoded, 'map' => $map];
    }
}

if (!function_exists('ccrm_record_task_created')) {
    function ccrm_record_task_created(PDO $pdo, string $taskId, ?string $actorName): void {
        if ($taskId === '') return;
        try {
            $actor = trim((string)$actorName);
            $pdo->prepare(
                "INSERT INTO `task_activities` (`task_id`, `kind`, `event_type`, `author_name`, `meta_json`)
                 VALUES (?, 'state_change', 'created', ?, '{}')"
            )->execute([$taskId, mb_substr($actor, 0, 100, 'UTF-8')]);
        } catch (\Throwable $e) {
            error_log('[ccrm task_activity] record_created failed: ' . $e->getMessage());
        }
    }
}

if (!function_exists('ccrm_record_task_changes')) {
    /**
     * Compare key task fields before vs after a save and batch-insert state_change
     * audit rows in a single INSERT query. Writes nothing when nothing changed.
     */
    function ccrm_record_task_changes(PDO $pdo, string $taskId, array $before, array $after, ?string $actorName): void {
        if ($taskId === '') return;
        try {
            $events = [];

            $oldStatus = trim((string)($before['status'] ?? ''));
            $newStatus = trim((string)($after['status'] ?? ''));
            if ($oldStatus !== '' && $newStatus !== '' && $oldStatus !== $newStatus) {
                $events[] = ['status', ['from' => $oldStatus, 'to' => $newStatus]];
            }

            $oldPrio = trim((string)($before['priority'] ?? ''));
            $newPrio = trim((string)($after['priority'] ?? ''));
            if ($oldPrio !== '' && $newPrio !== '' && $oldPrio !== $newPrio) {
                $events[] = ['priority', ['from' => $oldPrio, 'to' => $newPrio]];
            }

            $oldDead = substr(trim((string)($before['deadline'] ?? '')), 0, 10);
            $newDead = substr(trim((string)($after['deadline'] ?? '')), 0, 10);
            if ($oldDead !== '' && $newDead !== '' && $oldDead !== $newDead) {
                $events[] = ['deadline', ['from' => $oldDead, 'to' => $newDead, 'postponed' => ($newDead > $oldDead)]];
            }

            if (array_key_exists('assignees', $before) && array_key_exists('assignees', $after)) {
                $norm = static function ($list): array {
                    if (!is_array($list)) return [];
                    $out = [];
                    foreach ($list as $n) {
                        $t = trim((string)$n);
                        if ($t !== '' && !in_array($t, $out, true)) $out[] = $t;
                    }
                    return $out;
                };
                $oldAss = $norm($before['assignees']);
                $newAss = $norm($after['assignees']);
                $added = array_values(array_diff($newAss, $oldAss));
                $removed = array_values(array_diff($oldAss, $newAss));
                if (!empty($added) || !empty($removed)) {
                    $events[] = ['assignees', ['added' => $added, 'removed' => $removed]];
                }
            }

            if (array_key_exists('archived', $before) && array_key_exists('archived', $after)) {
                $oldArch = !empty($before['archived']);
                $newArch = !empty($after['archived']);
                if ($oldArch !== $newArch) {
                    $events[] = ['archived', ['archived' => $newArch]];
                }
            }

            if (array_key_exists('conclusion', $after)) {
                $oldConc = trim((string)($before['conclusion'] ?? ''));
                $newConc = trim((string)($after['conclusion'] ?? ''));
                if ($newConc !== '' && $oldConc !== $newConc) {
                    $events[] = ['conclusion', ['text' => mb_substr($newConc, 0, 240, 'UTF-8')]];
                }
            }

            if (empty($events)) {
                return;
            }

            $actor = mb_substr(trim((string)$actorName), 0, 100, 'UTF-8');
            $placeholders = [];
            $params = [];
            foreach ($events as [$evType, $meta]) {
                $placeholders[] = "(?, 'state_change', ?, ?, ?)";
                $params[] = $taskId;
                $params[] = $evType;
                $params[] = $actor;
                $params[] = json_encode($meta, JSON_UNESCAPED_UNICODE) ?: '{}';
            }

            $sql = "INSERT INTO `task_activities` (`task_id`, `kind`, `event_type`, `author_name`, `meta_json`) VALUES "
                 . implode(', ', $placeholders);
            $pdo->prepare($sql)->execute($params);
        } catch (\Throwable $e) {
            error_log('[ccrm task_activity] record_changes failed: ' . $e->getMessage());
        }
    }
}

if (!function_exists('ccrm_extract_task_upload_paths')) {
    /**
     * Extract validated relative task-chat upload paths (`YYYY-MM/ta_<hex>.<ext>`)
     * from a `task_activities.meta_json` payload so path traversal is impossible.
     *
     * @return string[]
     */
    function ccrm_extract_task_upload_paths(?string $metaJson): array {
        if (!is_string($metaJson) || $metaJson === '') return [];
        $meta = json_decode($metaJson, true);
        if (!is_array($meta) || empty($meta['images']) || !is_array($meta['images'])) {
            return [];
        }
        $paths = [];
        foreach ($meta['images'] as $img) {
            if (!is_array($img) || empty($img['url']) || !is_string($img['url'])) continue;
            if (preg_match('#^/uploads/tasks/(\d{4}-\d{2}/ta_[a-f0-9]{16}\.(?:png|jpe?g|webp|gif))$#i', $img['url'], $m)) {
                $paths[] = $m[1];
            }
        }
        return $paths;
    }
}

if (!function_exists('ccrm_unlink_task_activity_files')) {
    /** @param string[] $relPaths */
    function ccrm_unlink_task_activity_files(array $relPaths): void {
        if (empty($relPaths) || !function_exists('ccrm_uploads_dir')) return;
        $baseDir = ccrm_uploads_dir() . 'tasks/';
        foreach (array_unique($relPaths) as $rel) {
            if (!preg_match('#^\d{4}-\d{2}/ta_[a-f0-9]{16}\.(?:png|jpe?g|webp|gif)$#i', $rel)) {
                continue;
            }
            $full = $baseDir . $rel;
            if (is_file($full)) {
                @unlink($full);
            }
        }
    }
}

if (!function_exists('ccrm_delete_task_activities')) {
    /**
     * Remove all task_activities rows and uploaded chat images for deleted tasks.
     * @param string[] $taskIds
     */
    function ccrm_delete_task_activities(PDO $pdo, array $taskIds): void {
        $ids = array_values(array_unique(array_filter(array_map('strval', $taskIds), static fn($v) => trim($v) !== '')));
        if (empty($ids)) return;
        try {
            if (!ccrm_table_exists($pdo, 'task_activities')) return;
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $pdo->prepare("SELECT `meta_json` FROM `task_activities` WHERE `task_id` IN ({$ph}) AND `meta_json` IS NOT NULL");
            $stmt->execute($ids);
            $relPaths = [];
            while ($raw = $stmt->fetchColumn()) {
                foreach (ccrm_extract_task_upload_paths(is_string($raw) ? $raw : null) as $p) {
                    $relPaths[] = $p;
                }
            }
            $pdo->prepare("DELETE FROM `task_activities` WHERE `task_id` IN ({$ph})")->execute($ids);
            ccrm_unlink_task_activity_files($relPaths);
        } catch (\Throwable $e) {
            error_log('[ccrm task_activity] delete_task_activities skipped: ' . $e->getMessage());
        }
    }
}

if (!function_exists('ccrm_notify_task_comment')) {
    /**
     * Notify task participants via Web Push (assignees + creator, excluding author)
     * and notify explicitly @mentioned users via email + push (fail-soft).
     */
    function ccrm_notify_task_comment(PDO $pdo, string $taskId, string $authorName, string $body, array $images = []): void {
        try {
            $tStmt = $pdo->prepare(
                "SELECT `id`, `title`, `owner`, `created_by`
                   FROM `tasks`
                  WHERE `id` = ? AND " . ccrm_sql_real_tasks() . "
                  LIMIT 1"
            );
            $tStmt->execute([$taskId]);
            $taskRow = $tStmt->fetch(PDO::FETCH_ASSOC);
            if (!$taskRow) return;

            $assStmt = $pdo->prepare("SELECT `user_name` FROM `task_assignees` WHERE `task_id` = ?");
            $assStmt->execute([$taskId]);
            $assignees = $assStmt->fetchAll(PDO::FETCH_COLUMN) ?: [];

            $sysLang = 'sk';
            try {
                $lVal = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'")->fetchColumn();
                if (is_string($lVal) && in_array($lVal, ['en', 'sk', 'hu'], true)) {
                    $sysLang = $lVal;
                }
            } catch (\Throwable $e) {}

            $usersByLower = [];
            foreach ($pdo->query("SELECT `name`, `email`, `metadata_json` FROM `users`") as $u) {
                $name = trim((string)$u['name']);
                if ($name === '') continue;
                $meta = json_decode((string)($u['metadata_json'] ?? ''), true);
                $lang = (is_array($meta) && !empty($meta['language']) && in_array($meta['language'], ['en', 'sk', 'hu'], true))
                    ? $meta['language']
                    : $sysLang;
                $usersByLower[mb_strtolower($name, 'UTF-8')] = [
                    'name' => $name,
                    'email' => trim((string)$u['email']),
                    'lang' => $lang,
                ];
            }

            // Detect @Name mentions cleanly against known user names.
            $mentioned = [];
            if ($body !== '') {
                $bodyLower = mb_strtolower($body, 'UTF-8');
                foreach ($usersByLower as $uLower => $info) {
                    if ($uLower === mb_strtolower($authorName, 'UTF-8')) continue;
                    $needle = '@' . $uLower;
                    $pos = mb_strpos($bodyLower, $needle, 0, 'UTF-8');
                    if ($pos !== false) {
                        $afterIdx = $pos + mb_strlen($needle, 'UTF-8');
                        $nextChar = mb_substr($bodyLower, $afterIdx, 1, 'UTF-8');
                        if ($nextChar === '' || preg_match('/[\s.,:;!?)\]]/u', $nextChar)) {
                            $mentioned[$uLower] = $info;
                        }
                    }
                }
            }

            $participantKeys = [];
            foreach (array_merge([$taskRow['owner'] ?? '', $taskRow['created_by'] ?? ''], $assignees) as $cand) {
                $c = trim((string)$cand);
                if ($c === '' || strcasecmp($c, $authorName) === 0) continue;
                $participantKeys[mb_strtolower($c, 'UTF-8')] = $c;
            }
            foreach ($mentioned as $uLower => $info) {
                $participantKeys[$uLower] = $info['name'];
            }

            $preview = trim($body);
            if ($preview === '' && !empty($images)) {
                $preview = '[Image]';
            } elseif (mb_strlen($preview, 'UTF-8') > 120) {
                $preview = mb_substr($preview, 0, 117, 'UTF-8') . '…';
            }

            if (!empty($participantKeys)) {
                require_once __DIR__ . '/webpush.php';
                foreach ($participantKeys as $uLower => $targetName) {
                    $uLang = $usersByLower[$uLower]['lang'] ?? $sysLang;
                    $title = match ($uLang) {
                        'sk' => 'Nový komentár k úlohe: ' . (string)$taskRow['title'],
                        'hu' => 'Új hozzászólás a feladathoz: ' . (string)$taskRow['title'],
                        default => 'New comment on task: ' . (string)$taskRow['title'],
                    };
                    $pushBody = ($authorName !== '' ? $authorName . ': ' : '') . $preview;
                    ccrm_send_push_notification(
                        $pdo,
                        $targetName,
                        $title,
                        $pushBody,
                        '/#tasks',
                        ['taskId' => $taskId, 'type' => 'task_comment']
                    );
                }
            }

            if (!empty($mentioned)) {
                require_once __DIR__ . '/mail_broker.php';
                $config = ccrm_load_integrations_config($pdo);
                if (ccrm_system_mail_configured($config)) {
                    $appUrl = function_exists('ccrm_app_base_url') ? ccrm_app_base_url($pdo) : '';
                    $esc = static fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
                    foreach ($mentioned as $recipient) {
                        if (!filter_var($recipient['email'], FILTER_VALIDATE_EMAIL)) continue;
                        $lang = $recipient['lang'] ?? $sysLang;
                        $tr = static fn(string $en, string $sk, string $hu) => $lang === 'sk' ? $sk : ($lang === 'hu' ? $hu : $en);
                        $subject = $tr('Mentioned in task', 'Zmienka v úlohe', 'Említés a feladatban') . ': ' . (string)$taskRow['title'];
                        $html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1e293b;border:1px solid #e2e8f0;border-radius:12px">'
                            . '<p style="font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#4f46e5;font-weight:bold;margin:0 0 8px">'
                            . $esc($tr('Task Comment Mention', 'Zmienka v komentári úlohy', 'Említés feladat-hozzászólásban')) . '</p>'
                            . '<h2 style="font-size:20px;margin:0 0 12px;color:#0f172a">' . $esc($taskRow['title']) . '</h2>'
                            . '<p style="font-size:14px;color:#475569;margin:0 0 12px"><strong>' . $esc($authorName) . '</strong> '
                            . $esc($tr('mentioned you in a task comment:', 'vás označil(a) v komentári k úlohe:', 'megemlített téged egy feladat hozzászólásában:')) . '</p>'
                            . '<div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0;margin:0 0 16px;font-size:14px;line-height:1.5">'
                            . nl2br($esc($body)) . '</div>';
                        if ($appUrl !== '') {
                            $html .= '<p style="margin:0"><a href="' . $esc($appUrl) . '#tasks" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:bold">'
                                . $esc($tr('Open Tasks', 'Otvoriť úlohy', 'Feladatok megnyitása')) . '</a></p>';
                        }
                        $html .= '</div>';
                        ccrm_send_system_mail($config, $recipient['email'], $subject, $html);
                    }
                }
            }
        } catch (\Throwable $e) {
            error_log('[ccrm task_activity] comment notify failed: ' . $e->getMessage());
        }
    }
}
