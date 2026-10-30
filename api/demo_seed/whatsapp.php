<?php
/**
 * Demo seed module: whatsapp.
 *
 * Contract (see index.php / helpers.php): idempotent — delete this module's own 'demo-%' rows, then insert.
 *
 * Seeds what the WAAI connector leaves behind in CCRM (docs/WAAI-INTEGRATION.md §4.4–§4.6), without needing a
 * running WAAI: the chats' links to clients, leads and projects (auto and manual), the "is it on WhatsApp"
 * answers, the tasks extracted from the chats and the WhatsApp entries on the client timelines. The chats and
 * messages themselves live in WAAI, never in CCRM; they come from the same file, whatsapp_demo.json, via the
 * WAAI loader (docs/WHATSAPP-DEMO-DATA.md).
 *
 * Each row is written the way api/integration_tasks.php and integration_whatsapp.php write it, so the app
 * cannot tell it from a real push (task footer, `external_*` columns, `due_inferred`, timeline titles). No
 * `integration_refs` are written: a real WAAI connected later would push its own tasks next to these.
 *
 * Id plan: 'demo-whatsapp-0' = the placeholder integration client the links hang on (inactive, code
 * 'waai-demo', so the Settings connection for the real 'waai' client is never touched); 1-9 = tasks;
 * 101+ = timeline events. whatsapp_links rows have no string id: they go with their client (ON DELETE
 * CASCADE). whatsapp_numbers is keyed by phone; demo_whatsapp_wipe_numbers() removes the demo ones.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

/** The shared dataset (chats, tasks, numbers). */
function demo_whatsapp_data(): array {
    $raw = file_get_contents(__DIR__ . '/whatsapp_demo.json');
    $data = $raw === false ? null : json_decode($raw, true);
    if (!is_array($data) || !isset($data['chats'])) {
        throw new \RuntimeException('whatsapp_demo.json is missing or invalid.');
    }
    return $data;
}

/** Remove the demo "on WhatsApp" answers; they have no id column, so demo_wipe_by_prefix() cannot find them. */
function demo_whatsapp_wipe_numbers(PDO $pdo): void {
    if (!demo_table_exists($pdo, 'whatsapp_numbers') || !is_file(__DIR__ . '/whatsapp_demo.json')) {
        return;
    }
    $del = $pdo->prepare("DELETE FROM `whatsapp_numbers` WHERE `phone_digits` = ?");
    foreach (demo_whatsapp_data()['numbers'] ?? [] as $n) {
        $del->execute([(string)$n['phone']]);
    }
}

/** The CCRM address chats link back from; empty when the install does not know its own URL. */
function demo_whatsapp_base_url(PDO $pdo): string {
    if (defined('CCRM_APP_URL') && is_string(CCRM_APP_URL) && CCRM_APP_URL !== '') {
        return rtrim(CCRM_APP_URL, '/') . '/';
    }
    $stored = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'APP_BASE_URL'")->fetchColumn();
    return is_string($stored) && preg_match('#^https?://#', $stored) ? rtrim($stored, '/') . '/' : '';
}

/** The lines CCRM appends to a pushed task description (integration_tasks.php: ccrm_int_task_footer). */
function demo_whatsapp_footer(string $lang, string $chat, string $assignee, string $chatUrl): string {
    $labels = [
        'en' => ['WhatsApp chat', 'WhatsApp assignee', 'Open chat'],
        'sk' => ['WhatsApp chat', 'Zodpovedný vo WhatsAppe', 'Otvoriť chat'],
        'hu' => ['WhatsApp-csevegés', 'WhatsApp felelős', 'Csevegés megnyitása'],
    ][$lang];
    $lines = [$labels[0] . ': ' . $chat, $labels[1] . ': ' . $assignee];
    if ($chatUrl !== '') {
        $lines[] = $labels[2] . ': ' . $chatUrl;
    }
    return implode("\n", $lines);
}

/** Title of a connector timeline entry (WAAI crm-sync/timeline.ts: timelineTitle). */
function demo_whatsapp_timeline_title(string $kind, string $taskTitle, string $lang): string {
    $prefix = [
        'task_created' => ['sk' => 'Úloha dohodnutá na WhatsAppe', 'en' => 'Task agreed on WhatsApp', 'hu' => 'WhatsAppon egyeztetett feladat'],
        'task_done' => ['sk' => 'Úloha dokončená na WhatsAppe', 'en' => 'Task completed on WhatsApp', 'hu' => 'WhatsAppon elvégzett feladat'],
    ][$kind][$lang];
    return $prefix . ': ' . $taskTitle;
}

/** Body of a connector timeline entry (WAAI timelineContent): description, then due date, assignee and chat. */
function demo_whatsapp_timeline_content(string $lang, string $description, ?string $dueDate, string $assignee, string $chat): string {
    $parts = [];
    if ($dueDate !== null) {
        $d = new \DateTimeImmutable($dueDate);
        $parts[] = [
            'sk' => 'Do ' . $d->format('j. n.'),
            'en' => 'Due ' . $d->format('j/n'),
            'hu' => 'Határidő: ' . $d->format('n. j.'),
        ][$lang];
    }
    $parts[] = ['sk' => 'zodpovedný: ', 'en' => 'assignee: ', 'hu' => 'felelős: '][$lang] . $assignee;
    $parts[] = [
        'sk' => 'z chatu „' . $chat . '“',
        'en' => 'from chat "' . $chat . '"',
        'hu' => 'a(z) „' . $chat . '“ csevegésből',
    ][$lang];
    $meta = implode(' · ', $parts);
    return $description !== '' ? $description . "\n\n" . $meta : $meta;
}

function demo_seed_whatsapp(PDO $pdo): void {
    foreach (['whatsapp_links', 'whatsapp_numbers', 'integration_clients'] as $table) {
        if (!demo_table_exists($pdo, $table)) {
            return; // an install older than the integration: nothing to seed
        }
    }

    $data = demo_whatsapp_data();
    $lang = demo_lang($pdo);
    $T = static fn(array $byLang): string => demo_t($byLang, $lang);
    $ownerName = (string)$data['account']['ownerCrmUser'];
    $ownerId = demo_user_ids($pdo)[$ownerName] ?? null;
    $states = demo_task_states($pdo);
    $baseUrl = demo_whatsapp_base_url($pdo);
    $clientId = demo_id('whatsapp', 0);

    // --- Clean own rows (links and refs go with the client by FK) ------------------
    $pdo->exec("DELETE FROM `timeline_events` WHERE `id` LIKE 'demo-whatsapp-%'");
    $pdo->exec("DELETE FROM `task_assignees` WHERE `task_id` LIKE 'demo-whatsapp-%'");
    $pdo->exec("DELETE FROM `tasks` WHERE `id` LIKE 'demo-whatsapp-%'");
    $pdo->exec("DELETE FROM `integration_clients` WHERE `id` = " . $pdo->quote($clientId));
    demo_whatsapp_wipe_numbers($pdo);

    // --- Placeholder integration client the links hang on --------------------------
    $pdo->prepare(
        "INSERT INTO `integration_clients` (`id`, `code`, `name`, `is_active`, `scopes`, `allowed_ips`, `owner_user_ids`)
         VALUES (?, 'waai-demo', 'WhatsApp demo data', 0, '[]', '[]', '[]')"
    )->execute([$clientId]);

    // --- A project's contact phone is how WAAI pairs a chat with it ----------------
    if (demo_table_exists($pdo, 'projects')) {
        $setPhone = $pdo->prepare("UPDATE `projects` SET `contact_phone` = ? WHERE `id` = ?");
        foreach ($data['projectContactPhones'] ?? [] as $projectId => $phone) {
            $setPhone->execute([$phone, $projectId]);
        }
    }

    // --- "Is this number on WhatsApp?" answers ------------------------------------
    $insNumber = $pdo->prepare("INSERT INTO `whatsapp_numbers` (`phone_digits`, `status`, `checked_at`) VALUES (?, ?, ?)");
    foreach ($data['numbers'] as $n) {
        $insNumber->execute([$n['phone'], $n['status'], demo_dt((int)$n['checkedDay'], '10:00')]);
    }

    $insLink = $pdo->prepare(
        "INSERT INTO `whatsapp_links` (`client_id`, `conversation_ref`, `entity_type`, `entity_id`, `link_source`, `title`, `is_group`,
            `phone_digits`, `owner_user_id`, `path`, `last_message_at`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $insTask = $pdo->prepare(
        "INSERT INTO `tasks` (`id`, `title`, `description`, `priority`, `start_date`, `deadline`, `deadline_time`, `status`, `owner`, `created_by`,
            `related_lead_id`, `related_project_id`, `is_locking`, `archived`, `completed_by`, `completed_at`,
            `external_source`, `external_url`, `external_meta_json`, `created_at`)
         VALUES (?, ?, ?, 'medium', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 'waai', ?, ?, ?)"
    );
    $insAssignee = $pdo->prepare("INSERT IGNORE INTO `task_assignees` (`task_id`, `user_name`) VALUES (?, ?)");
    $insEvent = $pdo->prepare(
        "INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`, `is_outgoing`, `author`, `external_url`)
         VALUES (?, ?, 'whatsapp', ?, ?, ?, 0, NULL, ?)"
    );
    $seq = 100;

    foreach ($data['chats'] as $chat) {
        $messages = [];
        foreach ($chat['messages'] as $m) {
            $messages[$m['id']] = $m;
        }
        $last = end($chat['messages']);
        $lastAt = demo_dt((int)$last['day'], $last['time']);
        $chatPath = '/c/' . $chat['ref'];

        // Links to the records another module really created.
        $leadId = null;
        foreach ($chat['links'] as $link) {
            $table = $link['entityType'] === 'project' ? 'projects' : 'leads';
            if (!demo_table_exists($pdo, $table) || !demo_row_exists($pdo, $table, $link['entityId'])) {
                continue;
            }
            if ($link['entityType'] === 'lead' && $leadId === null) {
                $leadId = $link['entityId'];
            }
            $insLink->execute([
                $clientId, $chat['ref'], $link['entityType'], $link['entityId'], $link['source'], $chat['title'],
                $chat['isGroup'] ? 1 : 0, $chat['phone'], $ownerId, $chatPath, $lastAt,
            ]);
        }

        foreach ($chat['tasks'] as $t) {
            $src = $messages[$t['sourceMessage']];
            $createdAt = demo_dt((int)$src['day'], $src['time']);
            $taskPath = $chatPath . '?m=' . $chat['ref'] . '-' . $t['sourceMessage'];
            $done = $t['status'] === 'completed';
            $title = $T($t['title']);
            $description = $T($t['description']);

            // A chat that gave no date: today + 7 days, remembered as inferred (api/integration_tasks.php).
            $meta = ['conversation' => $chat['title'], 'is_group' => (bool)$chat['isGroup'], 'assignee_label' => $t['assignee']];
            if ($t['due'] === null) {
                $deadline = demo_d((int)$src['day'] + 7);
                $deadlineTime = null;
                $meta['due_inferred'] = true;
                $meta['inferred_deadline'] = $deadline;
            } else {
                $deadline = demo_d((int)$t['due']['day']);
                $deadlineTime = $t['due']['time'];
            }

            // Only a leadId that exists can be linked (the FK sets NULL otherwise, but the timeline needs it).
            $taskLead = ($t['leadId'] !== null && demo_row_exists($pdo, 'leads', $t['leadId'])) ? $t['leadId'] : null;
            $taskProject = ($t['projectId'] !== null && demo_table_exists($pdo, 'projects') && demo_row_exists($pdo, 'projects', $t['projectId']))
                ? $t['projectId'] : null;

            $id = demo_id('whatsapp', (int)$t['n']);
            $insTask->execute([
                $id, $title,
                $description . "\n\n" . demo_whatsapp_footer($lang, $chat['title'], $t['assignee'], $baseUrl !== '' ? $baseUrl . '#whatsapp' . $taskPath : ''),
                isset($t['start']) ? demo_d((int)$t['start']['day']) : null,
                $deadline, $deadlineTime,
                $done ? $states['done'] : $states['new'],
                $t['assignee'], $ownerName,
                $taskLead, $taskProject,
                $done ? $ownerName : null,
                $done ? substr(demo_dt((int)$t['completed']['day'], $t['completed']['time']), 0, 16) : null,
                $taskPath,
                json_encode($meta, JSON_UNESCAPED_UNICODE),
                $createdAt,
            ]);
            $insAssignee->execute([$id, $t['assignee']]);

            // task_created / task_done on the client's timeline; only for a chat linked to a client or lead.
            if ($taskLead === null) {
                continue;
            }
            $statedDue = $t['due'] === null ? null : $deadline;
            $content = demo_whatsapp_timeline_content($lang, $description, $statedDue, $t['assignee'], $chat['title']);
            $insEvent->execute([
                demo_id('whatsapp', ++$seq), $taskLead, $createdAt,
                demo_whatsapp_timeline_title('task_created', $title, $lang), $content, $taskPath,
            ]);
            if ($done) {
                $insEvent->execute([
                    demo_id('whatsapp', ++$seq), $taskLead, demo_dt((int)$t['completed']['day'], $t['completed']['time']),
                    demo_whatsapp_timeline_title('task_done', $title, $lang), $content, $taskPath,
                ]);
            }
        }

        // Opt-in daily summaries (decision D10).
        foreach ($chat['timeline'] ?? [] as $e) {
            if ($leadId === null) {
                continue;
            }
            $insEvent->execute([
                demo_id('whatsapp', ++$seq), $leadId, demo_dt((int)$e['day'], $e['time']),
                $T($e['title']), $T($e['content']), $chatPath . '?m=' . $chat['ref'] . '-' . $e['message'],
            ]);
        }
    }
}
