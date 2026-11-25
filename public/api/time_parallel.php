<?php
/**
 * Time tracking v2 (D5.2, D5.3, C3–C5): the rules for running several timers at once.
 *
 *   ccrm_tt_parallel_settings($settings)            {enabled, maxParallel, sameProject} with defaults
 *   ccrm_tt_same_target($row, $links)               the identical target (same task, else ticket, else project + title)
 *   ccrm_tt_identical_running($rows, $links)        the running row that already tracks the target, or null
 *   ccrm_tt_parallel_refusal($rows, $links, $p, $canParallel)   null or the 409 code of a parallel start
 *   ccrm_tt_parallel_room($settings, $canParallel, $runningCount) may one more entry run beside these?
 *
 * Pure functions: no database. The permission (`time_tracking_parallel`) is passed in by the caller.
 */

if (!function_exists('ccrm_tt_parallel_settings')) {

    /** The `parallel` settings block; until the settings sanitizer knows it, parallel is off (the safe default, C4). */
    function ccrm_tt_parallel_settings(array $settings): array {
        $p = is_array($settings['parallel'] ?? null) ? $settings['parallel'] : [];
        $max = is_numeric($p['maxParallel'] ?? null) ? (int)$p['maxParallel'] : 4;
        $same = in_array($p['sameProject'] ?? null, ['differentTasks', 'never', 'always'], true) ? $p['sameProject'] : 'differentTasks';
        return [
            'enabled' => !empty($p['enabled']),
            'maxParallel' => max(1, min(20, $max)),
            'sameProject' => $same,
        ];
    }

    function ccrm_tt_norm_id($v): string {
        return trim((string)($v ?? ''));
    }

    /**
     * Does the running row track the target a start asks for? Same task; else (no task) same ticket;
     * else (free text) a row without task or ticket on the same project with the same title.
     */
    function ccrm_tt_same_target(array $row, array $links): bool {
        $task = ccrm_tt_norm_id($links['task_id'] ?? null);
        if ($task !== '') {
            return ccrm_tt_norm_id($row['task_id'] ?? null) === $task;
        }
        $ticket = ccrm_tt_norm_id($links['ticket_id'] ?? null);
        if ($ticket !== '') {
            return ccrm_tt_norm_id($row['task_id'] ?? null) === '' && ccrm_tt_norm_id($row['ticket_id'] ?? null) === $ticket;
        }
        return ccrm_tt_norm_id($row['task_id'] ?? null) === ''
            && ccrm_tt_norm_id($row['ticket_id'] ?? null) === ''
            && ccrm_tt_norm_id($row['project_id'] ?? null) === ccrm_tt_norm_id($links['project_id'] ?? null)
            && ccrm_tt_norm_id($row['description'] ?? null) === ccrm_tt_norm_id($links['description'] ?? null);
    }

    function ccrm_tt_identical_running(array $rows, array $links): ?array {
        foreach ($rows as $row) {
            if (ccrm_tt_same_target($row, $links)) {
                return $row;
            }
        }
        return null;
    }

    /**
     * Why a start with mode 'parallel' is refused, in the order of D5.3, or null when it may run:
     * ['code' => ..., 'entryId' => the running row it collides with (same_project, already_running)].
     * Nothing running = nothing to run beside: never refused here.
     * `same_project` ignores a row that is the identical target: that one answers `already_running`.
     */
    function ccrm_tt_parallel_refusal(array $rows, array $links, array $parallel, bool $canParallel): ?array {
        if (!$rows) {
            return null;
        }
        if (!$parallel['enabled']) {
            return ['code' => 'parallel_disabled'];
        }
        if (!$canParallel) {
            return ['code' => 'parallel_forbidden'];
        }
        if (count($rows) >= $parallel['maxParallel']) {
            return ['code' => 'parallel_limit', 'maxParallel' => $parallel['maxParallel']];
        }
        $project = ccrm_tt_norm_id($links['derivedProject'] ?? ($links['project_id'] ?? null));
        if ($project !== '' && $parallel['sameProject'] !== 'always') {
            $newLinked = ccrm_tt_norm_id($links['task_id'] ?? null) !== '' || ccrm_tt_norm_id($links['ticket_id'] ?? null) !== '';
            foreach ($rows as $row) {
                $rowProject = ccrm_tt_norm_id($row['eff_project_id'] ?? ($row['project_id'] ?? null));
                if ($rowProject !== $project || ccrm_tt_same_target($row, $links)) {
                    continue;
                }
                $rowLinked = ccrm_tt_norm_id($row['task_id'] ?? null) !== '' || ccrm_tt_norm_id($row['ticket_id'] ?? null) !== '';
                // differentTasks: both linked and not the same target (checked above) = allowed.
                if ($parallel['sameProject'] === 'never' || !$newLinked || !$rowLinked) {
                    return ['code' => 'same_project', 'entryId' => (string)$row['id']];
                }
            }
        }
        if ($hit = ccrm_tt_identical_running($rows, $links)) {
            return ['code' => 'already_running', 'entryId' => (string)$hit['id']];
        }
        return null;
    }

    /** May one more entry run beside $runningCount others (restore of a running entry, hand-over to an owner)? */
    function ccrm_tt_parallel_room(array $settings, bool $canParallel, int $runningCount): bool {
        if ($runningCount === 0) {
            return true;
        }
        $p = ccrm_tt_parallel_settings($settings);
        return $p['enabled'] && $canParallel && $runningCount < $p['maxParallel'];
    }
}
