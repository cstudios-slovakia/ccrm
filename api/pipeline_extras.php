<?php
// Extra fields of a web-form submission for api/pipeline.php.
//
// pipeline.php maps a fixed set of fields onto the lead. A form usually asks
// more than that (project type, area, deadline, an attachment link, ...), and
// the CRM has no custom lead fields, so whatever is left over is kept as
// "Label: value" lines in the lead's interest note and on its timeline.
// Kept in its own file because pipeline.php answers the request at include time
// and so cannot be loaded by a test.

// Payload keys pipeline.php already reads, or that only steer it.
const CCRM_PIPELINE_MAPPED_KEYS = [
    'contact_name', 'company_name', 'message', 'email', 'phone', 'city', 'country',
    'value', 'budget', 'source_id', 'source_ids', 'category_id', 'category_ids',
    'traffic_origin', 'origin', 'traffic_origin_detail', 'origin_detail',
    'idempotency_key', 'event_id', 'field_labels',
];

// Plumbing a form builder adds: anti-spam traps, tokens, secrets.
const CCRM_PIPELINE_TECHNICAL_KEY = '/(token|honeypot|captcha|recaptcha|nonce|csrf|secret|password|api[_-]?key|^hp[_-]?|^_|bot[_-]?field)/i';

const CCRM_PIPELINE_EXTRA_VALUE_MAX = 500;
const CCRM_PIPELINE_EXTRA_TOTAL_MAX = 4000;

/** "area_size" -> "Area size"; a key with no letters is returned as it is. */
function ccrm_pipeline_humanise_key($key) {
    $label = trim(preg_replace('/[\s_\-]+/u', ' ', (string)$key));
    if ($label === '') {
        return '';
    }
    return mb_strtoupper(mb_substr($label, 0, 1, 'UTF-8'), 'UTF-8') . mb_substr($label, 1, null, 'UTF-8');
}

/** One scalar as a single line of text, or '' when it carries nothing. */
function ccrm_pipeline_extra_scalar($value) {
    if (is_bool($value)) {
        return $value ? 'Yes' : '';
    }
    if (!is_scalar($value)) {
        return '';
    }
    $text = trim(preg_replace('/\s+/u', ' ', (string)$value));
    return mb_substr($text, 0, CCRM_PIPELINE_EXTRA_VALUE_MAX, 'UTF-8');
}

/**
 * The submission's unmapped, non-empty answers as ['label' => ..., 'value' => ...]
 * rows in the order the form sent them. A list of scalars (multi-select) is joined
 * with ", "; a nested object is ignored rather than dumped.
 */
function ccrm_pipeline_extra_fields(array $payload) {
    $labels = (isset($payload['field_labels']) && is_array($payload['field_labels'])) ? $payload['field_labels'] : [];
    $rows = [];
    $total = 0;
    foreach ($payload as $key => $raw) {
        $key = (string)$key;
        if (in_array($key, CCRM_PIPELINE_MAPPED_KEYS, true) || preg_match(CCRM_PIPELINE_TECHNICAL_KEY, $key)) {
            continue;
        }
        if (is_array($raw)) {
            if ($raw !== [] && array_keys($raw) !== range(0, count($raw) - 1)) {
                continue; // an object, not a list
            }
            $parts = [];
            foreach ($raw as $item) {
                $part = ccrm_pipeline_extra_scalar($item);
                if ($part !== '') {
                    $parts[] = $part;
                }
            }
            $value = implode(', ', $parts);
        } else {
            $value = ccrm_pipeline_extra_scalar($raw);
        }
        if ($value === '') {
            continue;
        }
        $label = isset($labels[$key]) && is_string($labels[$key]) ? trim($labels[$key]) : '';
        $label = $label !== '' ? mb_substr($label, 0, 80, 'UTF-8') : ccrm_pipeline_humanise_key(mb_substr($key, 0, 80, 'UTF-8'));
        if ($label === '') {
            continue;
        }
        $total += mb_strlen($label, 'UTF-8') + mb_strlen($value, 'UTF-8') + 3;
        if ($total > CCRM_PIPELINE_EXTRA_TOTAL_MAX) {
            break;
        }
        $rows[] = ['label' => $label, 'value' => $value];
    }
    return $rows;
}

/** The rows as text, one "Label: value" per line. */
function ccrm_pipeline_extra_lines(array $payload) {
    return implode("\n", array_map(function ($row) {
        return $row['label'] . ': ' . $row['value'];
    }, ccrm_pipeline_extra_fields($payload)));
}

/** The message followed by the extra lines, with a blank line between them. */
function ccrm_pipeline_with_extras($message, $extraLines) {
    $message = (string)$message;
    if ($extraLines === '') {
        return $message;
    }
    return $message === '' ? $extraLines : $message . "\n\n" . $extraLines;
}
