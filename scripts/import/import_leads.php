<?php
/**
 * One-off CLI importer: loads leads.json (produced by laminam_xlsx_to_json.py)
 * into the CRM database.
 *
 * Usage (run from the app docroot so config.php resolves):
 *   php scripts/import/import_leads.php /path/to/leads.json [--wipe]
 *
 * --wipe deletes existing business data first (leads, timeline, tasks,
 * meetings, email caches). Users, system settings, permissions and registry
 * definitions are always kept. ALWAYS take a mysqldump backup before --wipe.
 */

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit("CLI only\n");
}

$configPath = getcwd() . '/config.php';
if (!file_exists($configPath)) {
    // Fall back to a config.php two levels up from this script (repo layout)
    $configPath = dirname(__DIR__, 2) . '/config.php';
}
if (!file_exists($configPath)) {
    fwrite(STDERR, "config.php not found - run from the app docroot\n");
    exit(1);
}
require $configPath;

$jsonPath = $argv[1] ?? null;
$wipe = in_array('--wipe', $argv, true);

if (!$jsonPath || !file_exists($jsonPath)) {
    fwrite(STDERR, "Usage: php import_leads.php /path/to/leads.json [--wipe]\n");
    exit(1);
}

$payload = json_decode(file_get_contents($jsonPath), true);
if (!is_array($payload) || !isset($payload['leads'])) {
    fwrite(STDERR, "Invalid JSON payload (expected {\"leads\": [...]})\n");
    exit(1);
}
$leads = $payload['leads'];

$pdo = get_db_connection();
$pdo->beginTransaction();

try {
    if ($wipe) {
        // Children before parents (FK constraints). Keep users, settings,
        // permissions, plugins, unified_entries (registry definitions).
        $wipeTables = [
            'timeline_events', 'lead_categories', 'task_assignees', 'tasks',
            'meeting_tasks', 'meeting_notes', 'email_summaries', 'rag_emails',
            'leads',
        ];
        // Dynamic registry data tables (ue_*) hold business entries too.
        $stmt = $pdo->query("SHOW TABLES LIKE 'ue\\_%'");
        while ($row = $stmt->fetch(PDO::FETCH_NUM)) {
            array_unshift($wipeTables, $row[0]);
        }
        foreach ($wipeTables as $t) {
            $n = $pdo->exec("DELETE FROM `{$t}`");
            echo "wiped {$t}: {$n} rows\n";
        }
    }

    $insLead = $pdo->prepare(
        "INSERT INTO `leads` (`id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value`, `rating`, `phone`, `email`, `country`, `created_at`)
         VALUES (?, ?, ?, 'person', ?, 'import', ?, 0, ?, ?, ?, 'Slovakia', ?)
         ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `city` = VALUES(`city`), `status` = VALUES(`status`), `owner` = VALUES(`owner`), `rating` = VALUES(`rating`), `phone` = VALUES(`phone`), `email` = VALUES(`email`), `created_at` = VALUES(`created_at`)"
    );
    $insEvent = $pdo->prepare(
        "INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE `timestamp` = VALUES(`timestamp`), `title` = VALUES(`title`), `content` = VALUES(`content`)"
    );

    $nLeads = 0;
    $nEvents = 0;
    foreach ($leads as $l) {
        $insLead->execute([
            $l['id'],
            $l['name'],
            $l['city'] ?? '',
            $l['status'] ?? 'new',
            $l['owner'] ?? '',
            $l['rating'] ?? 3,
            $l['phone'] ?? null,
            $l['email'] ?? null,
            $l['createdAt'] ?? date('Y-m-d H:i:s'),
        ]);
        $nLeads++;
        foreach ($l['timeline'] ?? [] as $ev) {
            $insEvent->execute([
                $ev['id'],
                $l['id'],
                $ev['type'] ?? 'note',
                $ev['timestamp'],
                $ev['title'],
                $ev['content'] ?? null,
            ]);
            $nEvents++;
        }
    }

    // Make sure the 'import' source exists in LEAD_SOURCES so the app can
    // filter/color these leads.
    $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'LEAD_SOURCES'");
    $stmt->execute();
    $raw = $stmt->fetchColumn();
    $sources = $raw ? json_decode($raw, true) : [];
    if (is_array($sources) && !in_array('import', $sources, true)) {
        $sources[] = 'import';
        $upd = $pdo->prepare(
            "INSERT INTO `system_settings` (`key`, `value`) VALUES ('LEAD_SOURCES', ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)"
        );
        $upd->execute([json_encode($sources, JSON_UNESCAPED_UNICODE)]);
        echo "added 'import' to LEAD_SOURCES\n";
    }

    $pdo->commit();
    echo "imported {$nLeads} leads, {$nEvents} timeline events\n";
} catch (Throwable $e) {
    $pdo->rollBack();
    fwrite(STDERR, "IMPORT FAILED, rolled back: " . $e->getMessage() . "\n");
    exit(1);
}
