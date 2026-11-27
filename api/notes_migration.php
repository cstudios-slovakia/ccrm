<?php
/**
 * Notes as their own entity (table `notes`, endpoint api/notes.php).
 *
 * A note used to be a timeline event of type `note`: a lead's in `timeline_events`, a project's in
 * `proj_timeline_<typeId>`. This migration copies the notes people wrote by hand into `notes` and turns
 * each original entry into a `note_activity` trace ("Note added" + a short snippet), so the timeline keeps
 * a record of it while the note itself is managed only from the Notes tab.
 *
 * Idempotent and safe to run twice: the note id is derived from the event id (`note-<event id>`) and written
 * with INSERT IGNORE, and only entries still of type `note` are converted, so a second run finds nothing
 * (or, after a stale client wrote an old note entry back, converts just that entry without touching the
 * note, which may have been edited since).
 *
 * What is NOT a note and stays untouched: lead entries with a `task_id` (task comments written by the MCP
 * tool), and every lead `note` entry whose title is not the one the lead log form wrote ("Internal Note
 * Added" and its translations) - public-form inquiries, "Lead Created via Public API", WhatsApp pushes and
 * the like are system entries that merely reuse the type.
 *
 * Runs from ccrm_apply_migrations, never from the probe path; listed in ccrm_schema_fingerprint().
 * Not written by sync.php (no column healing); api/notes.php heals the table itself.
 */

if (!function_exists('ccrm_notes_lead_titles')) {
    /** Titles the lead log form gave a hand-written note, keyed by language. */
    function ccrm_notes_lead_titles(): array {
        return ['en' => 'Internal Note Added', 'sk' => 'Pridaná interná poznámka', 'hu' => 'Belső jegyzet hozzáadva'];
    }
}

if (!function_exists('ccrm_notes_project_labels')) {
    /** Titles a project note got when only details were typed: the label of the built-in "Internal note" type. */
    function ccrm_notes_project_labels(): array {
        return ['en' => 'internal note', 'sk' => 'interná poznámka', 'hu' => 'belső jegyzet'];
    }
}

if (!function_exists('ccrm_notes_activity_title')) {
    /** The title of a trace entry, in the language the original entry was written in. */
    function ccrm_notes_activity_title(string $action, string $lang): string {
        $titles = [
            'added' => ['en' => 'Note added', 'sk' => 'Poznámka pridaná', 'hu' => 'Jegyzet hozzáadva'],
            'edited' => ['en' => 'Note edited', 'sk' => 'Poznámka upravená', 'hu' => 'Jegyzet módosítva'],
            'deleted' => ['en' => 'Note deleted', 'sk' => 'Poznámka zmazaná', 'hu' => 'Jegyzet törölve'],
        ];
        return $titles[$action][$lang] ?? $titles[$action]['en'];
    }
}

if (!function_exists('ccrm_notes_plain_text')) {
    /**
     * The text of an old rich note. The lead log form saved a note as a JSON list of editor blocks
     * (`[{"id":..,"type":"todo","content":"<b>..</b>","checked":true}, ..]`); anything else is plain text
     * and is returned as it is. Tags are stripped, entities decoded, checklist and list blocks keep a
     * marker so they stay readable as plain text.
     */
    function ccrm_notes_plain_text(?string $raw): string {
        $raw = (string) $raw;
        $trimmed = ltrim($raw);
        if ($trimmed === '' || $trimmed[0] !== '[') {
            return trim($raw);
        }
        $blocks = json_decode($trimmed, true);
        if (!is_array($blocks)) {
            return trim($raw);
        }
        $lines = [];
        foreach ($blocks as $block) {
            if (!is_array($block)) {
                continue;
            }
            $text = html_entity_decode(strip_tags((string) ($block['content'] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $type = (string) ($block['type'] ?? 'paragraph');
            if ($type === 'todo') {
                $text = (!empty($block['checked']) ? '[x] ' : '[ ] ') . $text;
            } elseif ($type === 'bullet') {
                $text = '- ' . $text;
            }
            $lines[] = $text;
        }
        return trim(implode("\n", $lines));
    }
}

if (!function_exists('ccrm_notes_snippet')) {
    /** One line of at most 80 characters, for the trace entry. */
    function ccrm_notes_snippet(string $text, int $max = 80): string {
        $line = trim((string) preg_replace('/\s+/u', ' ', $text));
        if (mb_strlen($line, 'UTF-8') <= $max) {
            return $line;
        }
        return rtrim(mb_substr($line, 0, $max - 1, 'UTF-8')) . '…';
    }
}

if (!function_exists('ccrm_notes_lead_content')) {
    /** The note text of an old lead note entry: its blocks as text, plus a transcript the blocks do not hold. */
    function ccrm_notes_lead_content(?string $content, ?string $transcription): string {
        $text = ccrm_notes_plain_text($content);
        $transcript = trim((string) $transcription);
        if ($transcript !== '' && mb_strpos($text, $transcript, 0, 'UTF-8') === false) {
            $text = trim($text . "\n\n" . $transcript);
        }
        return $text;
    }
}

if (!function_exists('ccrm_notes_project_content')) {
    /** The note text of an old project note entry: its title on top, unless that is just the type's own label. */
    function ccrm_notes_project_content(?string $title, ?string $content): string {
        $title = trim((string) $title);
        $body = trim((string) $content);
        $isLabel = in_array(mb_strtolower($title, 'UTF-8'), ccrm_notes_project_labels(), true);
        if ($title === '' || $isLabel) {
            return $body;
        }
        return $body === '' ? $title : $title . "\n" . $body;
    }
}

if (!function_exists('ccrm_notes_ensure_table')) {
    /** Creates `notes` when it is missing, from the same statement schema.php holds. Cheap when it exists. */
    function ccrm_notes_ensure_table(\PDO $pdo): void {
        if (ccrm_table_exists($pdo, 'notes')) {
            return;
        }
        foreach (ccrm_schema_statements() as $statement) {
            if (strpos(ltrim($statement), 'CREATE TABLE IF NOT EXISTS `notes` (') === 0) {
                $pdo->exec($statement);
                return;
            }
        }
    }
}

if (!function_exists('ccrm_migrate_notes')) {
    function ccrm_migrate_notes(\PDO $pdo): void {
        ccrm_notes_ensure_table($pdo);
        if (!ccrm_table_exists($pdo, 'notes')) {
            return;
        }
        $insert = $pdo->prepare(
            "INSERT IGNORE INTO `notes` (`id`, `entity_type`, `entity_id`, `content`, `author`, `audio_file`, `created_at`, `updated_at`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        );

        // A failure here must not stop the rest of the schema from being applied: log it, the next run retries.
        try {
            ccrm_notes_migrate_leads($pdo, $insert);
            ccrm_notes_migrate_projects($pdo, $insert);
        } catch (\Throwable $e) {
            error_log('[ccrm schema] notes migration failed: ' . $e->getMessage());
        }
    }
}

if (!function_exists('ccrm_notes_migrate_leads')) {
    /** Leads: the timeline entries the log form wrote as a note. */
    function ccrm_notes_migrate_leads(\PDO $pdo, \PDOStatement $insert): void {
        if (ccrm_table_exists($pdo, 'timeline_events') && ccrm_column_exists($pdo, 'timeline_events', 'task_id')) {
            $titles = array_values(ccrm_notes_lead_titles());
            $marks = implode(', ', array_fill(0, count($titles), '?'));
            $select = $pdo->prepare(
                "SELECT `id`, `lead_id`, `timestamp`, `title`, `content`, `author`, `audio_file`, `transcription`
                 FROM `timeline_events` WHERE `type` = 'note' AND `task_id` IS NULL AND `title` IN ({$marks})"
            );
            $select->execute($titles);
            $convert = $pdo->prepare("UPDATE `timeline_events` SET `type` = 'note_activity', `title` = ?, `content` = ? WHERE `id` = ?");
            foreach ($select->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                $lang = (string) (array_search($row['title'], ccrm_notes_lead_titles(), true) ?: 'en');
                $text = ccrm_notes_lead_content($row['content'], $row['transcription']);
                $audio = trim((string) $row['audio_file']);
                if ($text !== '' || $audio !== '') {
                    $insert->execute([
                        'note-' . $row['id'], 'lead', $row['lead_id'], $text,
                        trim((string) $row['author']) !== '' ? $row['author'] : null,
                        $audio !== '' ? $audio : null, $row['timestamp'], $row['timestamp'],
                    ]);
                }
                $convert->execute([ccrm_notes_activity_title('added', $lang), ccrm_notes_snippet($text), $row['id']]);
            }
        }
    }
}

if (!function_exists('ccrm_notes_migrate_projects')) {
    /** Projects: every `note` entry of every project type's timeline. */
    function ccrm_notes_migrate_projects(\PDO $pdo, \PDOStatement $insert): void {
        $tables = $pdo->query(
            "SELECT TABLE_NAME FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'proj\\_timeline\\_%'"
        )->fetchAll(\PDO::FETCH_COLUMN);
        foreach ($tables as $table) {
            if (!preg_match('/^proj_timeline_[a-z0-9_]+$/', (string) $table)) {
                continue;
            }
            $select = $pdo->query(
                "SELECT `id`, `project_id`, `timestamp`, `title`, `content` FROM `{$table}`
                 WHERE `type` = 'note' AND (`event_type` IS NULL OR `event_type` = '')"
            );
            $convert = $pdo->prepare("UPDATE `{$table}` SET `type` = 'note_activity', `title` = ?, `content` = ? WHERE `id` = ?");
            foreach ($select->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                $lang = (string) (array_search(mb_strtolower((string) $row['title'], 'UTF-8'), ccrm_notes_project_labels(), true) ?: 'en');
                $text = ccrm_notes_project_content($row['title'], $row['content']);
                if ($text !== '') {
                    $insert->execute(['note-' . $row['id'], 'project', $row['project_id'], $text, null, null, $row['timestamp'], $row['timestamp']]);
                }
                $convert->execute([ccrm_notes_activity_title('added', $lang), ccrm_notes_snippet($text), $row['id']]);
            }
        }
    }
}
