<?php
declare(strict_types=1);

/**
 * One "reopened" path for tasks: ccrm_task_record_reopen() (public/api/task_done.php) is the only writer of
 * tasks.reopens_json AND tasks.reopened_count, so the two always agree. Proves that a reopening through sync (the
 * project-breakdown hook sync.php calls), through MCP (update_task: a status UPDATE, then the writer) and through
 * the writer directly all end with reopened_count == count(reopens_json); that a first completion does not count;
 * that a row from before the log (a count, no timestamps) keeps its total; and that no other code increments the
 * counter on tasks (static check on the sources).
 *
 * The static checks always run. The database part needs a scratch database:
 *   CCRM_TEST_DSN="mysql:host=...;dbname=scratch" CCRM_TEST_USER=root CCRM_TEST_PASS=x php scripts/test-task-reopen.php
 * (it creates and drops its own `tasks` table, so never point it at real data).
 *
 * Exit code 0 on success, 1 on failure.
 */

chdir(dirname(__DIR__));
require_once __DIR__ . '/../public/api/schema.php'; // the helpers project_breakdown_migrations.php calls (ccrm_column_exists, ...)
require_once __DIR__ . '/../public/api/task_done.php';
require_once __DIR__ . '/../public/api/project_breakdown_migrations.php';

$fails = 0;
$check = function (string $name, bool $ok, string $detail = '') use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . ($ok ? '' : "  $detail") . "\n";
    if (!$ok) { $fails++; }
};

// ---- static: nobody else increments tasks.reopened_count
$strip = fn(string $src) => preg_replace('~/\*.*?\*/|//[^\n]*~s', '', $src);
foreach (['public/sync.php', 'public/api/mcp_ext_writes.php', 'public/api/project_breakdown_migrations.php', 'public/api/integration_tasks.php'] as $file) {
    $src = (string)file_get_contents(__DIR__ . '/../' . $file);
    $lines = array_filter(explode("\n", $strip($src)), fn($l) => preg_match('/reopened_count`?\s*=\s*`?reopened_count`?\s*\+\s*1/', $l) && stripos($l, 'tickets') === false);
    $check("$file does not increment tasks.reopened_count itself", count($lines) === 0, implode(' | ', array_map('trim', $lines)));
}
$sync = (string)file_get_contents(__DIR__ . '/../public/sync.php');
$check('sync calls the hook that records a reopening', strpos($sync, 'ccrm_stamp_task_breakdown_transition($pdo, (string)$taskId') !== false);
$check('sync derives reopenedCount from the column and the log', strpos($sync, "ccrm_task_reopened_total(\$row['reopened_count']") !== false);

// ---- pure helpers
$check('a reopened total is the larger of the column and the log',
    ccrm_task_reopened_total(3, null) === 3 && ccrm_task_reopened_total(0, '[{"at":"2026-01-01T00:00:00Z","by":null}]') === 1
    && ccrm_task_reopened_total(1, '[{"at":"a","by":null},{"at":"b","by":null}]') === 2 && ccrm_task_reopened_total(null, null) === 0);

// ---- database
$dsn = getenv('CCRM_TEST_DSN');
if (!$dsn) {
    echo "skip database checks (set CCRM_TEST_DSN to run them against a scratch database)\n";
    echo $fails === 0 ? "\nall passed\n" : "\n$fails FAILED\n";
    exit($fails === 0 ? 0 : 1);
}
$pdo = new PDO($dsn, getenv('CCRM_TEST_USER') ?: 'root', getenv('CCRM_TEST_PASS') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$pdo->exec("DROP TABLE IF EXISTS `tasks`");
$pdo->exec("CREATE TABLE `tasks` (
    `id` VARCHAR(50) NOT NULL PRIMARY KEY,
    `status` VARCHAR(50) NOT NULL DEFAULT 'todo',
    `task_kind` VARCHAR(20) NULL,
    `completed_by` VARCHAR(100) NULL,
    `first_started_at` DATETIME NULL,
    `reopened_count` INT NOT NULL DEFAULT 0,
    `reopens_json` TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
try {
    $states = ['todo', 'in_progress', 'done'];
    $isDone = fn(string $s) => ccrm_task_status_is_done($s, $states);
    $row = fn(string $id) => $pdo->query("SELECT `reopened_count`, `reopens_json`, `first_started_at` FROM `tasks` WHERE `id` = " . $pdo->quote($id))->fetch();
    $log = fn(string $id) => ccrm_task_reopens_decode($row($id)['reopens_json']);
    $agree = function (string $id, int $n) use ($row, $log): bool {
        $r = $row($id);
        return (int)$r['reopened_count'] === $n && count($log($id)) === $n;
    };
    $insert = $pdo->prepare("INSERT INTO `tasks` (`id`, `status`, `task_kind`, `reopened_count`, `reopens_json`) VALUES (?, ?, ?, ?, ?)");

    // sync: what sync.php does for a saved task (the status is already written, then the hook runs)
    $syncSave = function (string $id, ?string $old, string $new, string $by = 'Anna') use ($pdo, $isDone, $states) {
        $pdo->prepare("UPDATE `tasks` SET `status` = ? WHERE `id` = ?")->execute([$new, $id]);
        ccrm_stamp_task_breakdown_transition($pdo, $id, $new, $old, $isDone($new), $old !== null && $isDone($old), $states, $by);
    };
    $insert->execute(['s1', 'todo', null, 0, null]);
    $syncSave('s1', 'todo', 'in_progress');
    $check('sync: starting a task is not a reopening', $agree('s1', 0));
    $syncSave('s1', 'in_progress', 'done');
    $check('sync: the first completion does not count', $agree('s1', 0));
    $syncSave('s1', 'done', 'in_progress');
    $check('sync: reopening a finished task is counted once, in column and log', $agree('s1', 1) && $log('s1')[0]['by'] === 'Anna');
    $syncSave('s1', 'in_progress', 'done');
    $syncSave('s1', 'done', 'todo', 'Bela');
    $check('sync: a second reopening is the second record', $agree('s1', 2) && $log('s1')[1]['by'] === 'Bela');
    $syncSave('s1', 'todo', 'todo');
    $check('sync: saving an open task again does not count', $agree('s1', 2));
    $syncSave('s1', null, 'todo');
    $check('sync: a new task (no previous status) does not count', $agree('s1', 2));
    $check('sync: the first-started stamp still works', $row('s1')['first_started_at'] !== null);

    // MCP: update_task writes the status in its UPDATE, then calls the writer when ccrm_task_is_reopened() says so
    $mcpSave = function (string $id, string $old, string $new, string $by = 'Mcp user') use ($pdo, $states) {
        $pdo->beginTransaction();
        $pdo->prepare("UPDATE `tasks` SET `status` = ? WHERE `id` = ?")->execute([$new, $id]);
        if (ccrm_task_is_reopened(['status' => $old], $new, $states)) ccrm_task_record_reopen($pdo, $id, $by);
        $pdo->commit();
    };
    $insert->execute(['m1', 'done', null, 0, null]);
    $mcpSave('m1', 'done', 'in_progress');
    $check('mcp: reopening is counted once, in column and log', $agree('m1', 1) && $log('m1')[0]['by'] === 'Mcp user');
    $mcpSave('m1', 'in_progress', 'done');
    $check('mcp: a first completion does not count', $agree('m1', 1));

    // old rows: a count, no timestamps
    $insert->execute(['o1', 'done', null, 3, null]);
    $check('legacy: the total of a row with a count and no log is still its count', ccrm_task_reopened_total($row('o1')['reopened_count'], $row('o1')['reopens_json']) === 3);
    $syncSave('o1', 'done', 'todo');
    $r = $row('o1');
    $check('legacy: the next reopening goes from the old total to 4 and logs one entry', (int)$r['reopened_count'] === 4 && count($log('o1')) === 1);
    $check('legacy: the reported total is the counter', ccrm_task_reopened_total($r['reopened_count'], $r['reopens_json']) === 4);

    // a series template is never counted
    $insert->execute(['t1', 'done', 'recurring', 0, null]);
    $check('a recurring template is refused', ccrm_task_record_reopen($pdo, 't1', 'Anna') === false && $agree('t1', 0));

    // the log is capped at 300 entries but the counter keeps counting
    $big = json_encode(array_map(fn($i) => ['at' => '2026-01-01T00:00:00Z', 'by' => null], range(1, 300)));
    $insert->execute(['c1', 'done', null, 300, $big]);
    ccrm_task_record_reopen($pdo, 'c1', null);
    $check('the log keeps the newest 300 and the counter keeps counting', (int)$row('c1')['reopened_count'] === 301 && count($log('c1')) === 300);
} finally {
    $pdo->exec("DROP TABLE IF EXISTS `tasks`");
}

echo $fails === 0 ? "\nall passed\n" : "\n$fails FAILED\n";
exit($fails === 0 ? 0 : 1);
