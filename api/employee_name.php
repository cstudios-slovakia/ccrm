<?php
/**
 * Employee identity helpers shared by the schema migration, sync and the MCP tools.
 *
 * employees.name stays the one display name every other module reads (payroll, vacations,
 * time tracking, AI context). It is derived: "first last" for a person, the single name
 * field for a contractor or ledger item.
 */

/** Record kinds: a person on the payroll, an outside company, or a payroll-only line such as commission. */
const CCRM_EMPLOYEE_KINDS = ['employee', 'contractor', 'ledger'];

function ccrm_compose_employee_name(string $kind, ?string $first, ?string $last, string $name): string {
    if ($kind === 'employee') {
        $full = trim(trim((string)$first) . ' ' . trim((string)$last));
        if ($full !== '') return $full;
    }
    return trim($name);
}

/**
 * Split "Michal Kováč" / "Ing. Michal Kováč" into [first, last]; titles stay with the first name.
 * Returns null when a guess would be wrong (one word, a comma suffix, a trailing title):
 * a nickname or an odd name is completed by a person, never invented.
 *
 * @return array{0:string,1:string}|null
 */
function ccrm_split_person_name(string $name): ?array {
    $name = trim((string)preg_replace('/\s+/u', ' ', $name));
    if ($name === '' || strpos($name, ',') !== false) return null;
    $parts = explode(' ', $name);
    if (count($parts) < 2) return null;
    $last = array_pop($parts);
    if (substr($last, -1) === '.') return null;
    $given = array_filter($parts, static fn($p) => substr($p, -1) !== '.');
    if (!$given) return null;
    return [implode(' ', $parts), $last];
}
