<?php
/**
 * Acceptance criteria and the scope approval of a project (`projects.acceptance_criteria_json`,
 * `scope_approved_at`, `scope_approved_by`). Criteria added after the approval are scope creep; the
 * dashboard's "Scope creep" widget counts them. The rules live in src/utils/acceptanceCriteria.ts.
 *
 * Pure helpers only: sync.php decides when to write (a client that omits a key leaves the stored
 * value alone) and reads the columns back through these. No DDL here.
 */

if (!function_exists('ccrm_scope_iso_utc')) {
    /** Any parseable instant as a UTC ISO 8601 string with `Z`, or null when empty or unreadable. */
    function ccrm_scope_iso_utc($value): ?string {
        if (!is_string($value) || trim($value) === '') return null;
        try {
            $dt = new \DateTimeImmutable(trim($value), new \DateTimeZone('UTC'));
        } catch (\Throwable $e) {
            return null;
        }
        return $dt->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    }
}

if (!function_exists('ccrm_scope_ts_to_db')) {
    /** A UTC ISO instant as the DATETIME (UTC) the column stores, or null. */
    function ccrm_scope_ts_to_db($value): ?string {
        $iso = ccrm_scope_iso_utc($value);
        return $iso === null ? null : str_replace(['T', 'Z'], [' ', ''], $iso);
    }
}

if (!function_exists('ccrm_scope_ts_from_db')) {
    /** A stored DATETIME (UTC) as a UTC ISO string with `Z`, or null. */
    function ccrm_scope_ts_from_db($value): ?string {
        return is_string($value) && $value !== '' ? ccrm_scope_iso_utc($value . ' UTC') : null;
    }
}

if (!function_exists('ccrm_scope_name')) {
    /** A user name as stored: control characters removed, at most 100 characters, null when empty. */
    function ccrm_scope_name($value): ?string {
        if (!is_string($value)) return null;
        $name = trim((string)preg_replace('/[\x00-\x1F\x7F]/u', '', $value));
        return $name === '' ? null : mb_substr($name, 0, 100);
    }
}

if (!function_exists('ccrm_scope_criteria_clean')) {
    /**
     * The client's criteria list as a clean list of {id, title, done, createdAt, createdBy, removedAt,
     * removedBy}. Entries without an id or a title are dropped; a removed criterion stays (soft removal).
     */
    function ccrm_scope_criteria_clean(array $raw): array {
        $out = [];
        $seen = [];
        foreach ($raw as $c) {
            if (!is_array($c)) continue;
            $id = isset($c['id']) && (is_string($c['id']) || is_int($c['id'])) ? mb_substr(trim((string)$c['id']), 0, 64) : '';
            $title = isset($c['title']) && is_string($c['title']) ? mb_substr(trim($c['title']), 0, 300) : '';
            if ($id === '' || $title === '' || isset($seen[$id])) continue;
            $seen[$id] = true;
            $out[] = [
                'id' => $id,
                'title' => $title,
                'done' => !empty($c['done']),
                'createdAt' => ccrm_scope_iso_utc($c['createdAt'] ?? null) ?? gmdate('Y-m-d\TH:i:s\Z'),
                'createdBy' => ccrm_scope_name($c['createdBy'] ?? null),
                'removedAt' => ccrm_scope_iso_utc($c['removedAt'] ?? null),
                'removedBy' => ccrm_scope_name($c['removedBy'] ?? null),
            ];
            if (count($out) >= 500) break;
        }
        return $out;
    }
}

if (!function_exists('ccrm_scope_criteria_encode')) {
    /** The criteria column value for a client list: JSON text, or null for an empty list. */
    function ccrm_scope_criteria_encode(array $raw): ?string {
        $clean = ccrm_scope_criteria_clean($raw);
        return $clean ? json_encode($clean, JSON_UNESCAPED_UNICODE) : null;
    }
}

if (!function_exists('ccrm_scope_criteria_decode')) {
    /** `projects.acceptance_criteria_json` as a clean list (empty when NULL or unreadable). */
    function ccrm_scope_criteria_decode($json): array {
        $list = is_string($json) && $json !== '' ? json_decode($json, true) : null;
        return is_array($list) ? ccrm_scope_criteria_clean($list) : [];
    }
}
