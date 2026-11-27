<?php
/**
 * Demo seed module: meetings (the AI meeting room).
 *
 * Three meetings from packs/<lang>/meetings.php (docs/DEMO-MODE.md C11): the weekly
 * production and sales meeting, the client meeting with the hotel, and the archived
 * supplier call - each with a speaker-labelled transcript, an AI summary, automated
 * minutes and extracted tasks.
 *
 * Code only; every string is in the pack. `audio_file` stays empty: there is no recording
 * to play, and MeetingRoomView shows a "demo recording - no audio" notice for demo- ids.
 * Users and task assignees are stored by display name, as the app stores them.
 */
require_once __DIR__ . '/helpers.php';

function demo_seed_meetings(PDO $pdo): int {
    $pack = demo_pack($pdo, 'meetings');
    $users = demo_users($pdo);

    // meeting_tasks cascade on meeting_notes; delete them explicitly anyway.
    $pdo->exec("DELETE FROM `meeting_tasks` WHERE `id` LIKE 'demo-%' OR `meeting_id` LIKE 'demo-%'");
    $pdo->exec("DELETE FROM `meeting_notes` WHERE `id` LIKE 'demo-%'");

    $insM = $pdo->prepare(
        "INSERT INTO `meeting_notes` (`id`, `title`, `date`, `lead_id`, `lead_name`, `duration`, `notes`, `ai_summary_json`, `summary_generated`,
            `attached_leads_json`, `attached_clients_json`, `attached_users_json`, `archived`, `transcription`, `automated_notes`, `created_at`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)"
    );
    $insT = $pdo->prepare(
        "INSERT INTO `meeting_tasks` (`id`, `meeting_id`, `title`, `description`, `start_date`, `assigned_user`, `due_date`, `priority`, `status`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    $rows = 0;
    $taskN = 0;
    foreach ($pack['meetings'] as $m) {
        $id = demo_id('meetings', (int)$m['n']);
        $leadId = $m['lead'] !== null ? demo_ref_id($m['lead']) : null;
        $leadName = null;
        if ($m['lead'] !== null) {
            $leadName = (string)demo_ref($pdo, $m['lead'])['name'];
        } elseif (!empty($m['supplier'])) {
            $leadName = (string)demo_ref($pdo, $m['supplier'])['name'];
        }

        $blocks = [];
        foreach ($m['notes'] as $i => [$type, $content]) {
            $blocks[] = ['id' => 'b-m' . $m['n'] . '-' . $i, 'type' => $type, 'content' => demo_meetings_fill($pdo, $content)];
        }
        $summary = demo_meetings_fill_deep($pdo, $m['summary']);

        $insM->execute([
            $id,
            demo_meetings_fill($pdo, $m['title']),
            demo_d((int)$m['day']),
            $leadId,
            $leadName,
            (int)$m['duration'],
            json_encode($blocks, JSON_UNESCAPED_UNICODE),
            json_encode($summary, JSON_UNESCAPED_UNICODE),
            json_encode([], JSON_UNESCAPED_UNICODE),
            json_encode(array_map('demo_ref_id', $m['clients'])),
            json_encode(array_map(static fn(string $r): string => (string)$users[$r]['name'], $m['users']), JSON_UNESCAPED_UNICODE),
            !empty($m['archived']) ? 1 : 0,
            demo_meetings_transcript($pdo, $m['transcript'], (int)$m['duration']),
            demo_meetings_fill($pdo, $m['minutes']),
            demo_d((int)$m['day']) . ' 17:00:00',
        ]);
        $rows++;

        foreach ($m['tasks'] as $t) {
            $taskN++;
            $insT->execute([
                demo_id('meetings', 100 + $taskN),
                $id,
                demo_meetings_fill($pdo, $t['title']),
                demo_meetings_fill($pdo, $t['description']),
                demo_d((int)$t['startDay']),
                (string)$users[$t['assignee']]['name'],
                demo_d((int)$t['dueDay']),
                $t['priority'],
                $t['status'],
            ]);
            $rows++;
        }
    }
    return $rows;
}

/**
 * "[mm:ss] Speaker: text" blocks, the shape transcribe_meeting.php writes. The timestamps
 * follow how long each turn takes to say, spread over (duration - 1) minutes.
 */
function demo_meetings_transcript(PDO $pdo, array $turns, int $durationMin): string {
    $texts = [];
    foreach ($turns as [$speaker, $text]) {
        $texts[] = [demo_meetings_speaker($pdo, $speaker), demo_meetings_fill($pdo, $text)];
    }
    $total = max(1, array_sum(array_map(static fn(array $t): int => mb_strlen($t[1]), $texts)));
    $out = [];
    $elapsed = 0;
    foreach ($texts as [$who, $text]) {
        $sec = (int)round($elapsed / $total * max(1, $durationMin - 1) * 60);
        $out[] = sprintf('[%02d:%02d] %s: %s', intdiv($sec, 60), $sec % 60, $who, $text);
        $elapsed += mb_strlen($text);
    }
    return implode("\n\n", $out);
}

/** A speaker is a login role (owner / pm / sales) or a cast ref (a client contact, a supplier contact). */
function demo_meetings_speaker(PDO $pdo, string $ref): string {
    $users = demo_users($pdo);
    if (isset($users[$ref])) {
        return (string)$users[$ref]['name'];
    }
    $rec = demo_ref($pdo, $ref);
    return (string)($rec['contact'] ?? $rec['name']);
}

/**
 * demo_text() plus the module-local `[[contact:REF]]` / `[[name:REF]]`, which read a cast
 * record demo_text() has no placeholder for (a supplier's contact).
 */
function demo_meetings_fill(PDO $pdo, string $s): string {
    $s = preg_replace_callback('/\[\[(name|contact):([A-Z]\d+)\]\]/', static function (array $m) use ($pdo): string {
        $rec = demo_ref($pdo, $m[2]);
        return (string)($m[1] === 'contact' ? ($rec['contact'] ?? $rec['name']) : $rec['name']);
    }, $s);
    return demo_text($s);
}

function demo_meetings_fill_deep(PDO $pdo, $value) {
    if (is_string($value)) {
        return demo_meetings_fill($pdo, $value);
    }
    if (is_array($value)) {
        return array_map(static fn($v) => demo_meetings_fill_deep($pdo, $v), $value);
    }
    return $value;
}
