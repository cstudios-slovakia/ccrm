<?php
/**
 * Acceptance criteria and the scope approval of a project (`projects.acceptance_criteria_json`,
 * `scope_approved_at`, `scope_approved_by`). Criteria added after the approval are scope creep; the
 * dashboard's "Scope creep" widget counts them. The browser-side rules live in
 * src/utils/acceptanceCriteria.ts.
 *
 * The audit trail belongs to the server: who added or removed a criterion and when, and who approved the
 * scope and when, come from the server's clock and the session user, never from the client's word. The
 * client's own stamps are provisional until its next pull. sync.php writes through
 * ccrm_scope_resolve_write(); the merge rules are the pure functions below. No DDL here.
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
     * A criteria list as a clean list of {id, title, done, createdAt, createdBy, removedAt, removedBy}.
     * Entries without an id or a title and repeated ids are dropped; a removed criterion stays (soft
     * removal). A `createdAt` that is missing or unreadable stays null: reading never invents a time.
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
                'createdAt' => ccrm_scope_iso_utc($c['createdAt'] ?? null),
                'createdBy' => ccrm_scope_name($c['createdBy'] ?? null),
                'removedAt' => ccrm_scope_iso_utc($c['removedAt'] ?? null),
                'removedBy' => ccrm_scope_name($c['removedBy'] ?? null),
            ];
            if (count($out) >= 500) break;
        }
        return $out;
    }
}

if (!function_exists('ccrm_scope_criteria_decode')) {
    /** `projects.acceptance_criteria_json` as a clean list (empty when NULL or unreadable). */
    function ccrm_scope_criteria_decode($json): array {
        $list = is_string($json) && $json !== '' ? json_decode($json, true) : null;
        return is_array($list) ? ccrm_scope_criteria_clean($list) : [];
    }
}

if (!function_exists('ccrm_scope_merge_criteria')) {
    /**
     * The criteria to store: the client's list merged into the stored one. Pure.
     *  - An id that is not stored yet is new: `createdAt` is `$nowIso`, `createdBy` is `$user`; the
     *    client's values for those two are ignored.
     *  - A stored criterion keeps its `createdAt` and `createdBy`; `title` and `done` come from the client.
     *  - Removal: a client `removedAt` on a criterion stored as live stamps `removedAt` = `$nowIso` and
     *    `removedBy` = `$user`. A criterion stored as removed stays exactly as stored (a stale client
     *    cannot bring it back or change it).
     *  - A stored criterion the client's list lacks is kept as stored: a stale tab cannot delete it,
     *    deletion is only the soft removal above.
     *  - Order: the stored order first, then the new criteria in the client's order (at most 500 in all).
     * `$stored` and `$client` are criteria lists as decoded from JSON; both are cleaned first.
     */
    function ccrm_scope_merge_criteria(array $stored, array $client, string $nowIso, ?string $user): array {
        $stored = ccrm_scope_criteria_clean($stored);
        $client = ccrm_scope_criteria_clean($client);
        $user = ccrm_scope_name($user);
        $clientById = [];
        foreach ($client as $c) $clientById[$c['id']] = $c;

        $out = [];
        $known = [];
        foreach ($stored as $s) {
            $known[$s['id']] = true;
            $c = $clientById[$s['id']] ?? null;
            if ($c !== null && $s['removedAt'] === null) {
                $s['title'] = $c['title'];
                $s['done'] = $c['done'];
                if ($c['removedAt'] !== null) {
                    $s['removedAt'] = $nowIso;
                    $s['removedBy'] = $user;
                }
            }
            $out[] = $s;
        }
        foreach ($client as $c) {
            if (isset($known[$c['id']])) continue;
            $c['createdAt'] = $nowIso;
            $c['createdBy'] = $user;
            $removed = $c['removedAt'] !== null;
            $c['removedAt'] = $removed ? $nowIso : null;
            $c['removedBy'] = $removed ? $user : null;
            $out[] = $c;
        }
        return array_slice($out, 0, 500);
    }
}

if (!function_exists('ccrm_scope_merge_approval')) {
    /**
     * The approval to store, as [UTC ISO instant|null, name|null]. Pure. `$clientAt` is the value the
     * client sent for `scopeApprovedAt` (the key is present).
     *  - Client null or "": the approval is withdrawn, both are cleared.
     *  - Stored not set, client set: approved now by `$user` (`$nowIso`); the client's instant and name
     *    are ignored.
     *  - Both set: the stored approval stays.
     */
    function ccrm_scope_merge_approval(?string $storedAt, ?string $storedBy, $clientAt, string $nowIso, ?string $user): array {
        if ($clientAt === null || (is_string($clientAt) && trim($clientAt) === '')) return [null, null];
        if ($storedAt !== null) return [$storedAt, $storedBy];
        return [$nowIso, ccrm_scope_name($user)];
    }
}

if (!function_exists('ccrm_scope_resolve_write')) {
    /**
     * What the projects upsert writes for one project payload `$p`: the merge rules above applied to the
     * stored row (read inside the caller's transaction). A key the payload omits changes nothing:
     * `criteriaSent` / `scopeSent` are the 0/1 flags for `IF(? = 1, VALUES(col), col)`. `scopeApprovedBy`
     * is never taken from the client. Returns criteria (JSON text or null), at (DATETIME UTC or null),
     * by, criteriaSent, scopeSent. Needs the three columns to exist (healed above the transaction).
     */
    function ccrm_scope_resolve_write(\PDO $pdo, string $projectId, array $p, ?string $user): array {
        $criteriaSent = array_key_exists('acceptanceCriteria', $p) && is_array($p['acceptanceCriteria']);
        $scopeSent = array_key_exists('scopeApprovedAt', $p);
        $out = ['criteria' => null, 'at' => null, 'by' => null, 'criteriaSent' => $criteriaSent ? 1 : 0, 'scopeSent' => $scopeSent ? 1 : 0];
        if (!$criteriaSent && !$scopeSent) return $out;

        $stmt = $pdo->prepare("SELECT `acceptance_criteria_json`, `scope_approved_at`, `scope_approved_by` FROM `projects` WHERE `id` = ? LIMIT 1");
        $stmt->execute([$projectId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];
        $nowIso = gmdate('Y-m-d\TH:i:s\Z');

        if ($criteriaSent) {
            $merged = ccrm_scope_merge_criteria(ccrm_scope_criteria_decode($row['acceptance_criteria_json'] ?? null), $p['acceptanceCriteria'], $nowIso, $user);
            $out['criteria'] = $merged ? json_encode($merged, JSON_UNESCAPED_UNICODE) : null;
        }
        if ($scopeSent) {
            [$at, $by] = ccrm_scope_merge_approval(ccrm_scope_ts_from_db($row['scope_approved_at'] ?? null), ccrm_scope_name($row['scope_approved_by'] ?? null), $p['scopeApprovedAt'], $nowIso, $user);
            $out['at'] = ccrm_scope_ts_to_db($at);
            $out['by'] = $by;
        }
        return $out;
    }
}
