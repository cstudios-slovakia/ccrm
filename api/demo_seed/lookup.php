<?php
/**
 * Read-only lookups shared by the demo seed modules in api/demo_seed/.
 *
 * Lead states, task states and project statuses are free text that the
 * operator can rename (and that the installer translates per language), so a
 * seeder never hardcodes "accepted" — it asks the instance what its won state
 * is called. Everything here only reads; nothing writes to the database.
 */
require_once __DIR__ . '/helpers.php';

if (!function_exists('demo_setting_list')) {

    /** A JSON list of strings out of system_settings, or [] when it is missing. */
    function demo_setting_list(PDO $pdo, string $key): array {
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = ?");
            $stmt->execute([$key]);
            $raw = $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return [];
        }
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        return is_array($decoded) ? array_values(array_filter($decoded, 'is_string')) : [];
    }

    /**
     * The entry of $list whose name contains one of $needles, else the one at
     * $fallbackIndex (negative counts from the end). '' for an empty list.
     */
    function demo_pick(array $list, array $needles, int $fallbackIndex): string {
        foreach ($needles as $needle) {
            foreach ($list as $entry) {
                if (mb_stripos($entry, $needle) !== false) {
                    return $entry;
                }
            }
        }
        if (!$list) {
            return '';
        }
        if ($fallbackIndex < 0) {
            $fallbackIndex = max(0, count($list) + $fallbackIndex);
        }
        return $list[min($fallbackIndex, count($list) - 1)];
    }

    /** This instance's default list (states, sources, categories) when settings hold none. */
    function demo_default_list(PDO $pdo, string $name): array {
        if (!function_exists('ccrm_default_lists')) {
            require_once dirname(__DIR__) . '/schema.php';
        }
        $lists = ccrm_default_lists(demo_lang($pdo));
        return $lists[$name] ?? [];
    }

    /** ['new' => …, 'contacted' => …, 'offer' => …, 'won' => …, 'lost' => …] in this instance's wording. */
    function demo_lead_states(PDO $pdo): array {
        $list = demo_setting_list($pdo, 'LEAD_STATES') ?: demo_default_list($pdo, 'leadStates');
        return [
            'new'       => demo_pick($list, ['new', 'nov', 'új'], 0),
            'contacted' => demo_pick($list, ['contact', 'kontakt', 'kapcsolat'], 1),
            'offer'     => demo_pick($list, ['offer', 'ponuk', 'ajánlat'], 2),
            'won'       => demo_pick($list, ['accept', 'prijat', 'elfogad', 'won', 'vyhr'], -2),
            'lost'      => demo_pick($list, ['reject', 'zamiet', 'elutas', 'lost'], -1),
        ];
    }

    /** Lead sources in order; the demo install ships four. */
    function demo_lead_sources(PDO $pdo): array {
        $list = demo_setting_list($pdo, 'LEAD_SOURCES') ?: demo_default_list($pdo, 'leadSources');
        return $list ?: ['website'];
    }

    /** Lead categories in order (the demo install ships "Products" and "Services"). */
    function demo_lead_categories(PDO $pdo): array {
        return demo_setting_list($pdo, 'LEAD_CATEGORIES') ?: demo_default_list($pdo, 'leadCategories');
    }

    /** ['new' => …, 'progress' => …, 'blocked' => …, 'done' => …]: the configured task states by role. */
    function demo_task_states(PDO $pdo): array {
        $list = demo_setting_list($pdo, 'TASK_STATES') ?: demo_default_list($pdo, 'taskStates');
        return [
            'new'      => $list[0] ?? 'todo',
            'progress' => $list[1] ?? ($list[0] ?? 'todo'),
            'blocked'  => $list[2] ?? ($list[1] ?? ($list[0] ?? 'todo')),
            'done'     => $list ? $list[count($list) - 1] : 'done',
        ];
    }

    /** Divisions in order ('Cstudios', 'Cstudios Budapest' on a stock install). */
    function demo_divisions(PDO $pdo): array {
        return demo_setting_list($pdo, 'DIVISIONS') ?: ['Cstudios', 'Cstudios Budapest'];
    }

    /** True if $table exists in the current database. */
    function demo_table_exists(PDO $pdo, string $table): bool {
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?"
        );
        $stmt->execute([$table]);
        return (int)$stmt->fetchColumn() > 0;
    }

    /** True if the row exists — used to link only to records another module really created. */
    function demo_row_exists(PDO $pdo, string $table, string $id): bool {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM `{$table}` WHERE `id` = ?");
        $stmt->execute([$id]);
        return (int)$stmt->fetchColumn() > 0;
    }
}
