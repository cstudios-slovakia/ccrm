<?php
/**
 * Sync write-guard helpers: delete-by-omission circuit breaker, stale-write detection,
 * and the small comparison helpers they use. Moved verbatim out of sync.php.
 */

/**
 * Delete rows the client removed — either by omitting them from a v1 snapshot
 * or by naming them in a v2 `deleted` list.
 *
 * For delete-by-omission, never remove a row that changed after the client's
 * last sync ($baseSyncedAt). Otherwise a stale snapshot would wipe records
 * another user created in the meantime. Named (v2) deletions skip that clock
 * check: the client listed the id on purpose, including a row it created a
 * moment earlier whose updated_at is newer than the previous GET.
 *
 * $baseSyncedAt is the DB clock value captured in the GET the client synced
 * from. Null (legacy client) falls back to an unconditional delete.
 *
 * $table is only ever a trusted, sanitized name (fixed table names or the
 * already-validated ue_<id>), never raw user input.
 */
// Mass-deletion circuit breaker thresholds (see ccrm_delete_omitted). A single
// sync may never delete-by-omission ALL remaining rows of a table, nor a large
// FRACTION of them at once: that is the signature of a client that logged in
// with empty/stale state and pushed an empty collection (the 2026-07-06 and the
// 2026-07-10 users-table data-loss incidents). MIN_ROWS keeps everyday small
// deletions on ordinary tables flowing; access-critical tables (users) run in
// $strict mode where that floor is dropped so even an N-1 wipe is blocked.
// Tunable if a deployment legitimately needs large bulk deletes through sync.
if (!defined('CCRM_MASS_DELETE_MIN_ROWS')) define('CCRM_MASS_DELETE_MIN_ROWS', 5);
if (!defined('CCRM_MASS_DELETE_FRACTION')) define('CCRM_MASS_DELETE_FRACTION', 0.5);

/**
 * The write-side counterpart of ccrm_delete_omitted: true when the stored row
 * changed AFTER the snapshot this client is pushing from, meaning the payload
 * carries a copy of the row the client never saw.
 *
 * This matters because the pre-v2 client re-sends every record on every save. So
 * a user who edits one lead also re-submits their stale copy of every other lead,
 * and the upsert (which has no version check of its own) silently reverts any edit
 * another user made since that client last polled. Skipping the row instead keeps
 * the newer data; the stale client picks it up on its next poll.
 *
 * Resolution is one second — updated_at is a plain TIMESTAMP and $baseSyncedAt
 * comes from NOW(), neither carrying a fractional part — matching the precision
 * ccrm_delete_omitted already relies on. Two edits inside the same second remain
 * last-write-wins. A null $baseSyncedAt (legacy client that never sent one) keeps
 * the old unconditional-write behaviour.
 */
/**
 * True when two lists of names (task assignees, task tags) hold the same set.
 * Order, duplicates, surrounding spaces and letter case are ignored, matching
 * the case-insensitive primary keys of task_assignees and task_tags.
 */
function ccrm_same_name_set(array $a, array $b): bool {
    $norm = function (array $list): array {
        $out = [];
        foreach ($list as $v) {
            $k = mb_strtolower(trim((string)$v));
            if ($k !== '') $out[$k] = true;
        }
        ksort($out);
        return array_keys($out);
    };
    return $norm($a) === $norm($b);
}

function ccrm_write_would_clobber(?array $dbRow, ?string $baseSyncedAt): bool {
    if ($dbRow === null || $baseSyncedAt === null) {
        return false;
    }
    $updatedAt = $dbRow['updated_at'] ?? null;
    if (!is_string($updatedAt) || $updatedAt === '') {
        return false;
    }
    $rowTime = ccrm_ts_to_micro($updatedAt);
    $baseTime = ccrm_ts_to_micro($baseSyncedAt);
    if ($rowTime === null || $baseTime === null) {
        return false;
    }
    return $rowTime > $baseTime;
}

/**
 * Parse a MySQL DATETIME/TIMESTAMP string to a float epoch, KEEPING the fractional
 * part. strtotime() alone silently truncates to whole seconds, which would throw
 * away exactly the millisecond precision the conflict guard depends on (see
 * ccrm_migrate_updated_at_precision) and reopen the same-second clobber window.
 *
 * Accepts both 'Y-m-d H:i:s' (pre-migration rows, older clients' baseSyncedAt) and
 * 'Y-m-d H:i:s.uuu' (NOW(3) and TIMESTAMP(3) columns).
 */
function ccrm_ts_to_micro(string $ts): ?float {
    $ts = trim($ts);
    if ($ts === '') {
        return null;
    }
    if (!preg_match('/^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$/', $ts, $m)) {
        return null;
    }
    $seconds = strtotime(str_replace('T', ' ', $m[1]));
    if ($seconds === false) {
        return null;
    }
    return ((float) $seconds) + (isset($m[2]) ? (float) ('0.' . $m[2]) : 0.0);
}

/**
 * True while a pushed task still carries the deadline CCRM filled in because the chat gave none
 * (external_meta_json.due_inferred): a user moving the deadline makes it a stated one.
 */
function ccrm_task_due_inferred(array $row): bool {
    $meta = json_decode((string)($row['external_meta_json'] ?? ''), true);
    return is_array($meta) && !empty($meta['due_inferred'])
        && ($meta['inferred_deadline'] ?? null) === ($row['deadline'] ?? null)
        && ($row['deadline_time'] ?? null) === null;
}

/**
 * The DB clock the client echoes back as baseSyncedAt. NOW(3) is preferred so
 * the concurrency guard can tell two writes in the same second apart; hosts
 * that reject fractional-second NOW() fall back to whole seconds. Always a
 * string (or null) so json_encode + the client's `typeof === "string"` check
 * agree — some PDO builds otherwise hand back a DateTime that becomes `{}`.
 */
function ccrm_db_clock(PDO $pdo): ?string {
    foreach (['SELECT NOW(3)', 'SELECT NOW()'] as $sql) {
        try {
            $value = $pdo->query($sql)->fetchColumn();
            if ($value !== false && $value !== null && $value !== '') {
                return (string) $value;
            }
        } catch (\Throwable $e) {
            continue;
        }
    }
    return null;
}

/**
 * Ids a protocol-v2 client explicitly asked to delete for one entity.
 *
 * v1 clients never reach this: their deletions are inferred from whatever is
 * missing out of a complete snapshot, which is why a v1 payload must always carry
 * every record and why the mass-delete circuit breaker has to exist at all. v2
 * states deletions outright, so an absent section means "unchanged" and an empty
 * push deletes nothing.
 */
function ccrm_explicit_deleted_ids(array $deleted, string $entity): array {
    $ids = $deleted[$entity] ?? [];
    if (!is_array($ids)) {
        return [];
    }
    $out = [];
    foreach ($ids as $id) {
        if (is_string($id) || is_int($id)) {
            $id = (string) $id;
            if ($id !== '') {
                $out[] = $id;
            }
        }
    }
    return array_values(array_unique($out));
}

/**
 * The mass-deletion circuit breaker, on its own so every delete-by-omission site
 * can use it — not just ccrm_delete_omitted().
 *
 * Returns the ids that may safely be deleted: either the full list, or an empty
 * one when the request looks like an empty/stale client push. Tables whose
 * deletion is irreversible (project_types DROPs its dynamic data tables) pass
 * $strict so even an N-1 wipe is refused.
 */
function ccrm_filter_mass_delete(PDO $pdo, string $table, array $toDelete, bool $strict = false, bool $explicit = false, ?string $taskKind = null): array {
    if (empty($toDelete)) {
        return [];
    }

    // Refuse to delete-by-omission a large share of a table in one request. An
    // empty/stale client push makes array_diff() mark most or all rows for
    // deletion; without this guard that silently wipes the table (leads cascade
    // to categories + timeline). Ordinary small deletions — the real use case —
    // stay below the threshold and pass through untouched. When tripped we keep
    // the data and log instead of destroying it; the client re-pulls the rows on
    // its next GET.
    $deleteCount = count($toDelete);
    try {
        if ($table === 'tasks') {
            if ($taskKind === 'recurring') {
                $serverTotal = (int) $pdo->query("SELECT COUNT(*) FROM `tasks` WHERE `task_kind` = 'recurring'")->fetchColumn(); /* recurring-template: template count */
            } else {
                $serverTotal = (int) $pdo->query("SELECT COUNT(*) FROM `tasks` WHERE " . ccrm_sql_real_tasks())->fetchColumn();
            }
        } else {
            $serverTotal = (int) $pdo->query("SELECT COUNT(*) FROM `{$table}`")->fetchColumn();
        }
    } catch (\Throwable $e) {
        // Cannot size the table, so cannot prove the delete is safe. Keep the data.
        error_log('[ccrm] BLOCKED delete-by-omission on `' . $table . '`: row count failed — ' . $e->getMessage());
        return [];
    }

    // (a) Never delete EVERY remaining row of a table by OMISSION — that is only
    //     ever an empty/stale push, never a legitimate edit. Applies to every
    //     table regardless of size, so even a 1- or 2-row table can't be emptied.
    //     $explicit marks a delta-sync deletion the client NAMED in its `deleted`
    //     list. That is recorded user intent, not an inferred omission -- and the
    //     incident this guard was written for was omission, not naming. Such a
    //     delete may empty an ordinary table, so removing the only price offer you
    //     have actually sticks instead of silently reappearing on the next sync.
    //     $strict tables (users, project_types) are never emptied either way, and
    //     rule (b) below still caps how much one request may remove.
    $wouldEmptyTable = ($serverTotal > 0 && $deleteCount >= $serverTotal)
        && (!$explicit || $strict);

    // (b) Refuse to delete a large FRACTION of a table in one request. Ordinary
    //     data tables keep a small absolute-row floor so everyday little
    //     deletions still pass. In $strict mode — access-critical or irreversible
    //     tables such as `users` and `project_types`, where the sync may keep the
    //     calling account so a full wipe tops out at N-1 rows and never reaches
    //     100% — the floor drops to 1, so the 4-of-5 users wipe that slipped under
    //     the row floor is now caught.
    $minRows = $strict ? 1 : CCRM_MASS_DELETE_MIN_ROWS;
    $massFraction = ($serverTotal > 0
        && $deleteCount >= $minRows
        && ($deleteCount / $serverTotal) >= CCRM_MASS_DELETE_FRACTION);

    // Named (v2) deletions skip the fraction cap the same way they skip the
    // empty-table rule: the client listed the ids. Omission still cannot wipe
    // half a table in one push. $strict tables (users, project_types) keep the
    // empty-table block even when named, so the last project type cannot DROP
    // its data tables through a single-item delete.
    if ($wouldEmptyTable || ($massFraction && !$explicit)) {
        error_log(sprintf(
            '[ccrm] BLOCKED delete-by-omission on `%s`: %d of %d rows (%.0f%%%s%s) — likely an empty/stale client push; no rows deleted.',
            $table, $deleteCount, $serverTotal, 100 * $deleteCount / max(1, $serverTotal), $strict ? ', strict' : '', $explicit ? ', named' : ''
        ));
        $GLOBALS['ccrm_delete_blocked'] = $GLOBALS['ccrm_delete_blocked'] ?? [];
        $GLOBALS['ccrm_delete_blocked'][$table] = array_values($toDelete);
        return [];
    }

    return $toDelete;
}

function ccrm_delete_omitted(PDO $pdo, string $table, array $idsToDelete, ?string $baseSyncedAt, array $skipIds = [], bool $strict = false, bool $explicit = false, ?string $taskKind = null): void {
    if (empty($idsToDelete)) {
        return;
    }

    // Resolve the rows this sync would actually remove (excluding protected ids
    // such as the session user).
    $toDelete = [];
    foreach ($idsToDelete as $id) {
        if (!in_array($id, $skipIds, true)) {
            $toDelete[] = $id;
        }
    }

    $toDelete = ccrm_filter_mass_delete($pdo, $table, $toDelete, $strict, $explicit, $taskKind);
    if (empty($toDelete)) {
        return;
    }

    if ($table === 'tasks') {
        if ($taskKind === 'recurring') {
            if ($baseSyncedAt !== null && !$explicit) {
                $stmt = $pdo->prepare("DELETE FROM `tasks` WHERE `id` = ? AND `task_kind` = 'recurring' AND `updated_at` <= ?"); /* recurring-template: template deletion */
            } else {
                $stmt = $pdo->prepare("DELETE FROM `tasks` WHERE `id` = ? AND `task_kind` = 'recurring'"); /* recurring-template: template deletion */
            }
        } else {
            if ($baseSyncedAt !== null && !$explicit) {
                $stmt = $pdo->prepare("DELETE FROM `tasks` WHERE `id` = ? AND " . ccrm_sql_real_tasks() . " AND `updated_at` <= ?");
            } else {
                $stmt = $pdo->prepare("DELETE FROM `tasks` WHERE `id` = ? AND " . ccrm_sql_real_tasks());
            }
        }
    } else {
        if ($baseSyncedAt !== null && !$explicit) {
            $stmt = $pdo->prepare("DELETE FROM `{$table}` WHERE `id` = ? AND `updated_at` <= ?");
        } else {
            $stmt = $pdo->prepare("DELETE FROM `{$table}` WHERE `id` = ?");
        }
    }
    foreach ($toDelete as $id) {
        // Tombstone (deleted_records): the label is read first, written only if a row went.
        $tomb = ($table === 'tasks' && $taskKind === 'recurring') ? null : ccrm_deleted_snapshot($pdo, $table, (string)$id);
        if ($baseSyncedAt !== null && !$explicit) {
            $stmt->execute([$id, $baseSyncedAt]);
        } else {
            $stmt->execute([$id]);
        }
        if ($tomb !== null && $stmt->rowCount() > 0) ccrm_record_deleted($pdo, $table, (string)$id, $tomb);
    }
}

