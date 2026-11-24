<?php
// File attachments on a web-form submission for api/pipeline.php.
//
// A form that sends files posts multipart/form-data instead of JSON: the usual
// fields as form fields (or the whole JSON object in one `payload` field) and
// one or more files under any field name (`attachments[]`, `file`, `cv`, ...).
// The files are kept in uploads/ and listed on the timeline note the submission
// writes, so they show on the lead like any other attachment.
//
// A file that is refused never costs the lead: it is skipped, the rest of the
// submission is saved, and the note says which file was left out and why.
//
// The endpoint is public (the key sits in the website's page source), so this is
// stricter than the signed-in upload.php: a short allowlist of document and image
// types, nothing a browser would render as a page (html, svg, xml), size limits,
// and a random part in the stored name so a file's URL cannot be guessed.
// Kept in its own file because pipeline.php answers the request at include time
// and so cannot be loaded by a test.

const CCRM_PIPELINE_ATTACHMENT_MAX_FILES = 10;
const CCRM_PIPELINE_ATTACHMENT_MAX_BYTES = 10485760;        // 10 MB per file
const CCRM_PIPELINE_ATTACHMENT_MAX_TOTAL_BYTES = 26214400;  // 25 MB per submission
const CCRM_PIPELINE_ATTACHMENT_EXTENSIONS = [
    'pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'csv',
    'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp',
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif',
    'dwg', 'dxf', 'zip',
];

/** True when the request carries multipart/form-data (a form with files). */
function ccrm_pipeline_is_multipart(string $contentType): bool {
    return stripos($contentType, 'multipart/form-data') !== false;
}

/**
 * The submission fields of a multipart request. A `payload` field holding a JSON
 * object wins (the same object a JSON request would send); otherwise the form
 * fields themselves are the payload. Returns null when `payload` is not JSON.
 */
function ccrm_pipeline_multipart_payload(array $post): ?array {
    if (isset($post['payload']) && is_string($post['payload'])) {
        $decoded = json_decode($post['payload'], true);
        return is_array($decoded) ? $decoded : null;
    }
    return $post;
}

/**
 * Every file in $_FILES as one flat list, whatever the field names and however
 * they are nested (`file`, `files[]`, `attachments[cv]`). An empty file input
 * (UPLOAD_ERR_NO_FILE) is not a file and is left out.
 */
function ccrm_pipeline_collect_uploads(array $files): array {
    $out = [];
    $walk = static function ($name, $type, $tmp, $error, $size) use (&$walk, &$out) {
        if (is_array($name)) {
            foreach ($name as $k => $_) {
                $walk($name[$k], $type[$k] ?? '', $tmp[$k] ?? '', $error[$k] ?? UPLOAD_ERR_NO_FILE, $size[$k] ?? 0);
            }
            return;
        }
        if ((int)$error === UPLOAD_ERR_NO_FILE) {
            return;
        }
        $out[] = [
            'name' => (string)$name,
            'type' => (string)$type,
            'tmp_name' => (string)$tmp,
            'error' => (int)$error,
            'size' => (int)$size,
        ];
    };
    foreach ($files as $field) {
        if (!is_array($field) || !array_key_exists('name', $field)) {
            continue;
        }
        $walk($field['name'], $field['type'] ?? '', $field['tmp_name'] ?? '', $field['error'] ?? UPLOAD_ERR_NO_FILE, $field['size'] ?? 0);
    }
    return $out;
}

/** A file's name as it may be shown back: printable, no path, at most 100 characters. */
function ccrm_pipeline_attachment_label(string $name): string {
    $base = basename(str_replace('\\', '/', $name));
    $clean = trim((string)preg_replace('/[\x00-\x1F\x7F]/u', '', $base));
    return $clean === '' ? '(unnamed)' : mb_substr($clean, 0, 100, 'UTF-8');
}

/**
 * Sorts the files into those that will be kept and those that are skipped.
 * Returns ['files' => [... + 'safe_name'], 'skipped' => [['name' => ..., 'reason' => ...]]].
 * Files are taken in the order sent, so when the count or the total size runs
 * out, the first files are kept and the later ones skipped.
 */
function ccrm_pipeline_validate_uploads(array $uploads): array {
    $valid = [];
    $skipped = [];
    $total = 0;
    foreach ($uploads as $u) {
        $skip = static function (string $reason) use (&$skipped, $u) {
            $skipped[] = ['name' => ccrm_pipeline_attachment_label($u['name']), 'reason' => $reason];
        };
        if ($u['error'] === UPLOAD_ERR_INI_SIZE || $u['error'] === UPLOAD_ERR_FORM_SIZE) {
            $skip('larger than the server accepts');
            continue;
        }
        if ($u['error'] !== UPLOAD_ERR_OK) {
            $skip('did not arrive whole');
            continue;
        }
        if ($u['size'] <= 0) {
            $skip('empty file');
            continue;
        }
        if ($u['size'] > CCRM_PIPELINE_ATTACHMENT_MAX_BYTES) {
            $skip('larger than 10 MB');
            continue;
        }
        $safe = ccrm_safe_upload_name($u['name']);
        $ext = $safe === null ? '' : strtolower(pathinfo($safe, PATHINFO_EXTENSION));
        if ($safe === null || !in_array($ext, CCRM_PIPELINE_ATTACHMENT_EXTENSIONS, true)) {
            $skip('file type not allowed');
            continue;
        }
        if (count($valid) >= CCRM_PIPELINE_ATTACHMENT_MAX_FILES) {
            $skip('more than ' . CCRM_PIPELINE_ATTACHMENT_MAX_FILES . ' files');
            continue;
        }
        if ($total + $u['size'] > CCRM_PIPELINE_ATTACHMENT_MAX_TOTAL_BYTES) {
            $skip('over 25 MB together');
            continue;
        }
        $total += $u['size'];
        $u['safe_name'] = $safe;
        $valid[] = $u;
    }
    return ['files' => $valid, 'skipped' => $skipped];
}

/** "1.5 MB", the way the timeline shows a file's size. */
function ccrm_pipeline_human_size(int $bytes): string {
    if ($bytes >= 1048576) {
        return rtrim(rtrim(number_format($bytes / 1048576, 1, '.', ''), '0'), '.') . ' MB';
    }
    if ($bytes >= 1024) {
        return (string)max(1, (int)round($bytes / 1024)) . ' KB';
    }
    return $bytes . ' B';
}

/**
 * Moves validated files into $dir (with trailing slash) as
 * `<eventId>_<random>_<name>`. Returns
 * ['attachments' => [{name,size,path}], 'stored' => [disk paths], 'skipped' => [{name,reason}]].
 * A file whose bytes do not match its extension, or that cannot be moved, is
 * skipped on its own. $move is move_uploaded_file in production and a copy in tests.
 */
function ccrm_pipeline_store_uploads(array $files, string $eventId, string $dir, ?callable $move = null): array {
    $move = $move ?? 'move_uploaded_file';
    $stored = [];
    $attachments = [];
    $skipped = [];
    foreach ($files as $f) {
        $diskName = $eventId . '_' . bin2hex(random_bytes(4)) . '_' . $f['safe_name'];
        $target = $dir . $diskName;
        if (!$move($f['tmp_name'], $target)) {
            $skipped[] = ['name' => ccrm_pipeline_attachment_label($f['safe_name']), 'reason' => 'could not be saved'];
            continue;
        }
        if (!ccrm_stored_file_matches_extension($target, $f['safe_name'])) {
            @unlink($target);
            $skipped[] = ['name' => ccrm_pipeline_attachment_label($f['safe_name']), 'reason' => 'damaged or not the type its name says'];
            continue;
        }
        $stored[] = $target;
        $attachments[] = [
            'name' => $f['safe_name'],
            'size' => ccrm_pipeline_human_size((int)$f['size']),
            'path' => '/uploads/' . $diskName,
        ];
    }
    return ['attachments' => $attachments, 'stored' => $stored, 'skipped' => $skipped];
}

/** The line the timeline note gets for files that were left out, or '' when none were. */
function ccrm_pipeline_skipped_note(array $skipped): string {
    if (!$skipped) {
        return '';
    }
    $parts = array_map(static function ($s) {
        return $s['name'] . ' (' . $s['reason'] . ')';
    }, $skipped);
    return 'Attachments not saved: ' . implode(', ', $parts);
}

/** Deletes files this request stored, e.g. when the database write after them failed. */
function ccrm_pipeline_remove_stored_paths(array $paths): void {
    foreach ($paths as $p) {
        @unlink($p);
    }
}
