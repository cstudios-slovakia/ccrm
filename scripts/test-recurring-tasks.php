<?php
declare(strict_types=1);

/**
 * Offline and integration checks for recurring tasks:
 * - Date maths and schedule calculations against scripts/fixtures/recurring-tasks-cases.json
 * - Shift cursor on resume (Rule 9)
 * - After-completion mode (Rule 7)
 * - Weekend rules
 *
 * Run: php scripts/test-recurring-tasks.php
 */

chdir(dirname(__DIR__));
require_once __DIR__ . '/../public/api/recurring_tasks.php';

$fails = 0;
$checks = 0;
$check = function (string $name, bool $ok, string $detail = '') use (&$fails, &$checks) {
    $checks++;
    echo ($ok ? "ok   " : "FAIL ") . $name . ($ok ? '' : "  $detail") . "\n";
    if (!$ok) {
        $fails++;
    }
};

$fixtures = json_decode((string)file_get_contents(__DIR__ . '/fixtures/recurring-tasks-cases.json'), true);

// 1. Schedule cases
foreach ($fixtures['scheduleCases'] as $case) {
    $rec = $case['recurrence'];
    $name = $case['name'];

    if (isset($case['sequence'])) {
        foreach ($case['sequence'] as $stepIdx => $step) {
            $cursor = $step['cursor'];
            $expected = $step['scheduledDate'];
            $got = ccrm_recurring_next_occurrence($rec, $cursor);
            $check("{$name} (step {$stepIdx})", $got === $expected, "cursor={$cursor} expected={$expected} got={$got}");
        }
    } elseif (isset($case['expect'])) {
        $cursor = $case['cursor'] ?? null;
        $expected = $case['expect'];
        $gotScheduled = ccrm_recurring_next_occurrence($rec, $cursor);
        $check("{$name} scheduledDate", $gotScheduled === $expected['scheduledDate'], "expected={$expected['scheduledDate']} got={$gotScheduled}");

        $shifted = ccrm_recurring_shift_deadline($gotScheduled, $rec['weekendRule'] ?? 'keep', $rec['frequency'] ?? 'monthly');
        $check("{$name} deadline", $shifted === $expected['deadline'], "expected={$expected['deadline']} got={$shifted}");

        $start = ccrm_recurring_start_date($shifted, (int)($rec['leadDays'] ?? 0));
        $check("{$name} startDate", $start === $expected['startDate'], "expected={$expected['startDate']} got={$start}");
    }
}

// 2. Pause/Resume cases
foreach ($fixtures['pauseResumeCases'] as $case) {
    $rec = $case['recurrence'];
    $name = $case['name'];
    $resumeDate = $case['resumeDate'];
    $expectedDue = $case['expectNextDue'];

    $shiftedCursor = ccrm_recurring_shift_cursor_on_resume($rec, $resumeDate);
    $nextOcc = ccrm_recurring_next_occurrence($rec, $shiftedCursor);
    $due = ccrm_recurring_shift_deadline($nextOcc, $rec['weekendRule'] ?? 'keep', $rec['frequency'] ?? 'monthly');
    $check("{$name} resume next due", $due === $expectedDue, "resumeDate={$resumeDate} expectedDue={$expectedDue} got={$due} (cursor={$shiftedCursor})");
}

// 3. After-completion cases
foreach ($fixtures['afterCompletionCases'] as $case) {
    $name = $case['name'];
    $deadline = ccrm_recurring_next_after_completion(
        $case['completedDate'],
        (int)$case['interval'],
        $case['frequency'],
        $case['weekendRule']
    );
    $start = ccrm_recurring_start_date($deadline, (int)$case['leadDays']);
    $check("{$name} deadline", $deadline === $case['expectDeadline'], "expected={$case['expectDeadline']} got={$deadline}");
    $check("{$name} startDate", $start === $case['expectStartDate'], "expected={$case['expectStartDate']} got={$start}");
}

// 4. SQL real tasks helper check
$check("ccrm_sql_real_tasks with alias", ccrm_sql_real_tasks('t') === "(`t`.`task_kind` IS NULL)");
$check("ccrm_sql_real_tasks without alias", ccrm_sql_real_tasks('') === "(`task_kind` IS NULL)");

echo "\nCompleted {$checks} checks, {$fails} failures.\n";
if ($fails > 0) {
    exit(1);
}
