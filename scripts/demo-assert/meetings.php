<?php
/**
 * Assertions for the `meetings` demo module (phase 4D). Format: scripts/demo-assert/company.php.
 */
return [
    'minRows' => [
        'meeting_notes' => 3,
        'meeting_tasks' => 8,
    ],
    'check' => function (DemoFakePdo $db, array $ctx, callable $check): void {
        $users = demo_company_pack($ctx['lang'])['users'];
        $userNames = array_map(static fn($u) => $u['name'], $users);
        $notes = $db->rows('meeting_notes');
        $tasks = $db->rows('meeting_tasks');
        $check('three meetings, 3 + 4 + 1 tasks = 8', count($notes) === 3 && count($tasks) === 8, count($notes) . '/' . count($tasks));

        $byId = [];
        foreach ($notes as $n) $byId[$n['id']] = $n;
        $check('ids are demo-meetings-1..3, tasks demo-meetings-10x', count(array_filter(array_keys($byId), static fn($i) => preg_match('/^demo-meetings-[123]$/', $i))) === 3
            && !array_filter($tasks, static fn($t) => !preg_match('/^demo-meetings-1\d\d$/', $t['id'])));

        $bad = [];
        foreach ($notes as $n) {
            foreach (['transcription', 'automated_notes', 'ai_summary_json', 'notes'] as $col) {
                if (trim((string)$n[$col]) === '') $bad[] = $n['id'] . ' has no ' . $col;
            }
            $sum = json_decode((string)$n['ai_summary_json'], true);
            if (!is_array($sum) || empty($sum['summary']) || empty($sum['topics']) || empty($sum['actionItems']) || !in_array($sum['sentiment'], ['positive', 'neutral', 'negative'], true)) $bad[] = $n['id'] . ': summary JSON incomplete';
            if (!preg_match('/^\[00:00\] /', (string)$n['transcription'])) $bad[] = $n['id'] . ': transcript does not start at 00:00';
            $attached = json_decode((string)$n['attached_users_json'], true);
            if (!is_array($attached) || !$attached || array_diff($attached, $userNames)) $bad[] = $n['id'] . ': attached users are not demo user names';
            if (!(int)$n['summary_generated']) $bad[] = $n['id'] . ': summary_generated is 0';
        }
        $check('every meeting has notes, transcript, minutes and an AI summary (positive/neutral/negative, topics, action items)', !$bad, implode("\n", $bad));

        // The transcript labels speakers with real names and the timestamps never run backwards or past the duration.
        $bad = [];
        foreach ($notes as $n) {
            preg_match_all('/^\[(\d\d):(\d\d)\] ([^:]+): /m', str_replace("\n\n", "\n", (string)$n['transcription']), $mm, PREG_SET_ORDER);
            $prev = -1;
            foreach ($mm as $line) {
                $sec = (int)$line[1] * 60 + (int)$line[2];
                if ($sec < $prev || $sec > (int)$n['duration'] * 60) $bad[] = $n['id'] . ' ' . $line[0];
                $prev = $sec;
            }
            if (count($mm) < 5) $bad[] = $n['id'] . ': fewer than 5 turns';
        }
        $check('transcript timestamps are ordered and inside the duration', !$bad, implode("\n", array_slice($bad, 0, 4)));

        $check('exactly one meeting is archived (the supplier call)', count(array_filter($notes, static fn($n) => (int)$n['archived'] === 1)) === 1);
        $dates = array_map(static fn($n) => (int)floor((strtotime($n['date']) - strtotime(date('Y-m-d'))) / 86400), $notes);
        sort($dates);
        $check('meetings sit at -20, -6 and -2 days', $dates === [-20, -6, -2], json_encode($dates));

        $done = array_filter($tasks, static fn($t) => $t['status'] === 'done');
        $check('tasks: assignees are demo users, the weekly meeting has 4 tasks with one done', !array_filter($tasks, static fn($t) => !in_array($t['assignee_user'] ?? $t['assigned_user'], $userNames, true))
            && count(array_filter($tasks, static fn($t) => $t['meeting_id'] === 'demo-meetings-1')) === 4
            && count(array_filter($tasks, static fn($t) => $t['meeting_id'] === 'demo-meetings-1' && $t['status'] === 'done')) === 1);

        // C6 meeting carries the hotel client and the supplier call a name but no lead row.
        $m2 = $byId['demo-meetings-2'] ?? [];
        $check('the hotel meeting is attached to client C6 (demo-clients-6)', ($m2['lead_id'] ?? null) === 'demo-clients-6' && strpos((string)$m2['attached_clients_json'], 'demo-clients-6') !== false);
        $m3 = $byId['demo-meetings-3'] ?? [];
        $check('the supplier call names the supplier and has no lead id', array_key_exists('lead_id', $m3) && $m3['lead_id'] === null && trim((string)$m3['lead_name']) !== '');
    },
];
