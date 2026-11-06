<?php
/**
 * Pure-function checks for task done-ness, recurring after-completion skips and
 * timer workflows (api/task_done.php, api/recurring_tasks.php, api/workflows_engine.php).
 * No database:
 *   php scripts/test-task-automation.php
 * CCRM_API_DIR overrides the folder that holds the api files.
 *
 * The done-rule cases mirror src/utils/taskDoneRuleGuard.test.ts, so the PHP and
 * TypeScript rules cannot drift apart unnoticed.
 */
$api = getenv('CCRM_API_DIR') ?: __DIR__ . '/../public/api';
require_once $api . '/task_done.php';
require_once $api . '/recurring_tasks.php';
require_once $api . '/workflows_engine.php';

$fails = 0;
$check = function (string $name, bool $ok) use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . "\n";
    if (!$ok) { $fails++; }
};

// ── done rule ────────────────────────────────────────────────────────────────
$sk = ['Nový', 'Prebieha', 'Blokovaný', 'Hotovo'];
$check("literal 'done' in any case is done", ccrm_task_status_is_done('done', $sk) && ccrm_task_status_is_done('Done', $sk));
$check('the configured done state (SK "Hotovo") is done', ccrm_task_status_is_done('Hotovo', $sk));
$check('"Blokovaný" is not done', !ccrm_task_status_is_done('Blokovaný', $sk));
$check('no states: only the literal is done', !ccrm_task_status_is_done('Hotovo', []) && ccrm_task_status_is_done('DONE', []));
$check('done state of an empty list is null', ccrm_task_done_state([]) === null);
[$sql, $params] = ccrm_sql_task_not_done($sk, 't.`status`');
$check('not-done SQL excludes the literal and the done state',
    $sql === "(LOWER(t.`status`) <> 'done' AND t.`status` <> ?)" && $params === ['Hotovo']);
[$sql, $params] = ccrm_sql_task_not_done(['To do', 'Done']);
$check('not-done SQL needs no parameter when the done state is the literal', $sql === "(LOWER(`status`) <> 'done')" && $params === []);

// ── recurring: a deleted after-completion occurrence does not come back ───────
// Monthly, completed 2026-01-10, the generated (and then deleted) occurrence was 2026-02-10.
$next = ccrm_recurring_next_after_skip('2026-01-10', '2026-02-10', 1, 'monthly', 'keep');
$check('skip continues one interval after the deleted date', $next === '2026-03-10');
$check('never the deleted date again', $next !== '2026-02-10');
$check('stable: the same inputs give the same date on the next run',
    ccrm_recurring_next_after_skip('2026-01-10', '2026-02-10', 1, 'monthly', 'keep') === $next);
// Daily with "move to the Friday before": Friday 2026-11-06 deleted; Saturday shifts back to Friday.
$next = ccrm_recurring_next_after_skip('2026-11-05', '2026-11-06', 1, 'daily', 'before');
$check('a weekend shift cannot land on the deleted date (' . $next . ')', $next > '2026-11-06');
// A later completion than the deleted date wins.
$check('a later base wins', ccrm_recurring_next_after_skip('2026-03-01', '2026-02-10', 1, 'monthly', 'keep') === '2026-04-01');
$check('no cursor date: counts from the base', ccrm_recurring_next_after_skip('2026-01-10', null, 1, 'monthly', 'keep') === '2026-02-10');

// ── timer workflows ──────────────────────────────────────────────────────────
$now = '2026-11-06 10:00:00';
$check('never fired: due', ccrm_timer_workflow_due(null, null, $now, 60));
$check('queued 30 min ago, never logged (failed before logging): not due',
    !ccrm_timer_workflow_due('2026-11-06 09:30:00', null, $now, 60));
$check('queued 30 min ago, old log (backlog): not due',
    !ccrm_timer_workflow_due('2026-11-06 09:30:00', '2026-11-06 07:00:00', $now, 60));
$check('queued 61 min ago: due', ccrm_timer_workflow_due('2026-11-06 08:59:00', null, $now, 60));
$check('a recent manual run (log only) still resets the clock',
    !ccrm_timer_workflow_due('2026-11-06 07:00:00', '2026-11-06 09:45:00', $now, 60));

echo $fails === 0 ? "\nAll checks passed.\n" : "\n{$fails} check(s) failed.\n";
exit($fails === 0 ? 0 : 1);
