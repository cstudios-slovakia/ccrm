<?php
/**
 * Block-document rules for a reconstructed price-offer PDF.
 *
 * The TypeScript copy is `src/utils/offerDocument.ts`. There is no shared
 * runtime — a change here has to be made there too. This file has no request
 * side effects; generate_pdf_template.php and sync.php both load it.
 */

const CCRM_OFFER_CATALOG = [
    'company.name', 'company.subtitle', 'company.logo', 'company.street', 'company.city',
    'company.postalCode', 'company.country', 'company.companyId', 'company.taxId', 'company.vatId',
    'company.email', 'company.phone', 'company.phoneSecondary', 'company.website', 'company.iban',
    'company.swift', 'company.bankName', 'company.socialProof',
    'offer.documentNumber', 'offer.title', 'offer.subject', 'offer.location', 'offer.issuedAt',
    'offer.validUntil', 'offer.clientName', 'offer.clientEmail', 'offer.clientPhone', 'offer.clientStreet',
    'offer.clientCity', 'offer.clientPostalCode', 'offer.clientCountry', 'offer.clientIco', 'offer.clientDic',
    'offer.clientIcdph', 'offer.greetingNote', 'offer.introNote', 'offer.reassuranceNote', 'offer.nextStepsNote',
    'offer.closingNote', 'offer.signOffTeam', 'offer.durationText', 'offer.startDateText', 'offer.warrantyText',
];

const CCRM_OFFER_SYNTHETIC = ['offer.items', 'offer.totals', 'offer.uspCards'];
const CCRM_OFFER_ITEM_COLUMNS = ['name', 'description', 'quantity', 'unit', 'unitPrice', 'vatRate', 'discountPct', 'totalPrice'];
const CCRM_OFFER_DEFAULT_COLUMNS = ['name', 'quantity', 'unit', 'unitPrice', 'totalPrice'];
const CCRM_OFFER_MAX_BLOCKS = 80;
const CCRM_OFFER_MAX_DEPTH = 4;
const CCRM_OFFER_MAX_CUSTOM = 24;

function ccrm_offer_opt_color($value): ?string {
    if (!is_string($value)) return null;
    $v = trim($value);
    if (!preg_match('/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $v)) return null;
    if (strlen($v) === 4) {
        $v = '#' . $v[1] . $v[1] . $v[2] . $v[2] . $v[3] . $v[3];
    }
    return strtolower($v);
}

function ccrm_offer_one($value, array $allowed): ?string {
    return (is_string($value) && in_array($value, $allowed, true)) ? $value : null;
}

function ccrm_offer_style($raw): ?array {
    if (!is_array($raw) || array_is_list($raw)) return null;
    $out = [];
    foreach (['color', 'background', 'borderColor'] as $key) {
        if (!array_key_exists($key, $raw)) continue;
        $color = ccrm_offer_opt_color($raw[$key]);
        if ($color !== null) $out[$key] = $color;
    }
    $enums = [
        'fontSize' => ['sm', 'md', 'lg', 'xl', 'title'],
        'weight' => ['regular', 'medium', 'bold'],
        'align' => ['left', 'center', 'right'],
        'radius' => ['none', 'sm', 'md', 'pill'],
        'border' => ['none', 'left', 'all'],
    ];
    foreach ($enums as $key => $allowed) {
        $picked = ccrm_offer_one($raw[$key] ?? null, $allowed);
        if ($picked !== null) $out[$key] = $picked;
    }
    return $out === [] ? null : $out;
}

function ccrm_offer_one_line($value, int $max = 90): string {
    if (!is_string($value)) return '';
    $v = preg_replace('/<[^>]*>/', '', $value) ?? '';
    $v = preg_replace('/[\x00-\x1f\x7f\s]+/u', ' ', $v) ?? '';
    return mb_substr(trim($v), 0, $max);
}

function ccrm_offer_plain_text($value, int $max): string {
    if (!is_string($value)) return '';
    $v = preg_replace('/<[^>]*>/', '', $value) ?? '';
    $v = preg_replace('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', '', $v) ?? '';
    return mb_substr(trim($v), 0, $max);
}

function ccrm_offer_count_raw($value): int {
    if (!is_array($value)) return 0;
    if (array_is_list($value)) {
        $n = 0;
        foreach ($value as $item) $n += ccrm_offer_count_raw($item);
        return $n;
    }
    if (!isset($value['type']) || !is_string($value['type'])) return 0;
    $n = 1;
    if ($value['type'] === 'stack') $n += ccrm_offer_count_raw($value['children'] ?? null);
    elseif ($value['type'] === 'columns') $n += ccrm_offer_count_raw($value['columns'] ?? null);
    return $n;
}

function ccrm_offer_with_style(array $block, ?array $style): array {
    if ($style !== null) $block['style'] = $style;
    return $block;
}

function ccrm_offer_accept($node, int $depth, bool $inColumn, array &$ctx): ?array {
    if ($depth > CCRM_OFFER_MAX_DEPTH || !is_array($node) || array_is_list($node) || !isset($node['type']) || !is_string($node['type'])) {
        return null;
    }
    $style = ccrm_offer_style($node['style'] ?? null);
    switch ($node['type']) {
        case 'text':
            $text = ccrm_offer_plain_text($node['text'] ?? null, 2000);
            if ($text === '') return null;
            return ccrm_offer_with_style(['type' => 'text', 'text' => $text], $style);
        case 'field':
            $fieldId = $node['fieldId'] ?? null;
            if (!is_string($fieldId) || !in_array($fieldId, CCRM_OFFER_CATALOG, true)) return null;
            $block = ['type' => 'field', 'fieldId' => $fieldId];
            $label = ccrm_offer_one_line($node['label'] ?? null);
            if ($label !== '') $block['label'] = $label;
            return ccrm_offer_with_style($block, $style);
        case 'customField':
            $key = $node['key'] ?? null;
            if (!is_string($key) || !preg_match('/^[a-z][a-z0-9_]{0,39}$/', $key)) return null;
            if (!isset($ctx['keys'][$key])) {
                if (count($ctx['keys']) >= CCRM_OFFER_MAX_CUSTOM) return null;
                $label = ccrm_offer_one_line($node['label'] ?? null);
                $ctx['keys'][$key] = true;
                $ctx['customFields'][] = ['key' => $key, 'label' => $label !== '' ? $label : $key];
            }
            $label = $key;
            foreach ($ctx['customFields'] as $field) {
                if ($field['key'] === $key) { $label = $field['label']; break; }
            }
            return ccrm_offer_with_style(['type' => 'customField', 'key' => $key, 'label' => $label], $style);
        case 'itemsTable':
            if ($ctx['items']) return null;
            $ctx['items'] = true;
            $picked = [];
            if (isset($node['columns']) && is_array($node['columns'])) {
                foreach ($node['columns'] as $col) {
                    if (is_string($col) && in_array($col, CCRM_OFFER_ITEM_COLUMNS, true) && !in_array($col, $picked, true)) {
                        $picked[] = $col;
                    }
                }
            }
            return ccrm_offer_with_style([
                'type' => 'itemsTable',
                'columns' => $picked !== [] ? $picked : CCRM_OFFER_DEFAULT_COLUMNS,
            ], $style);
        case 'totals':
            if ($ctx['totals']) return null;
            $flags = [];
            foreach (['subtotal', 'vat', 'total', 'priceRange'] as $flag) {
                if (($node[$flag] ?? null) === true) $flags[$flag] = true;
            }
            if ($flags === []) return null;
            $ctx['totals'] = true;
            return ccrm_offer_with_style(array_merge(['type' => 'totals'], $flags), $style);
        case 'uspCards':
            if ($ctx['usp']) return null;
            $ctx['usp'] = true;
            return ccrm_offer_with_style(['type' => 'uspCards'], $style);
        case 'divider':
            return ccrm_offer_with_style(['type' => 'divider'], $style);
        case 'spacer':
            return ['type' => 'spacer'];
        case 'stack':
            if (!isset($node['children']) || !is_array($node['children']) || !array_is_list($node['children'])) return null;
            $children = [];
            foreach ($node['children'] as $child) {
                $kept = ccrm_offer_accept($child, $depth + 1, $inColumn, $ctx);
                if ($kept !== null) $children[] = $kept;
            }
            if ($children === []) return null;
            return ccrm_offer_with_style(['type' => 'stack', 'children' => $children], $style);
        case 'columns':
            if ($inColumn || !isset($node['columns']) || !is_array($node['columns']) || !array_is_list($node['columns'])) return null;
            if (count($node['columns']) < 2 || count($node['columns']) > 3) return null;
            $columns = [];
            foreach ($node['columns'] as $col) {
                if (!is_array($col) || !array_is_list($col)) continue;
                $kids = [];
                foreach ($col as $child) {
                    $kept = ccrm_offer_accept($child, $depth + 1, true, $ctx);
                    if ($kept !== null) $kids[] = $kept;
                }
                if ($kids !== []) $columns[] = $kids;
            }
            if (count($columns) < 2 || count($columns) > 3) return null;
            return ccrm_offer_with_style(['type' => 'columns', 'columns' => $columns], $style);
        default:
            return null;
    }
}

function ccrm_offer_stamp(array $nodes): array {
    $n = 1;
    $walk = function (array $block) use (&$walk, &$n): array {
        $block['id'] = 'b' . ($n++);
        if (($block['type'] ?? '') === 'stack') {
            $block['children'] = array_map($walk, $block['children']);
        } elseif (($block['type'] ?? '') === 'columns') {
            $block['columns'] = array_map(fn($col) => array_map($walk, $col), $block['columns']);
        }
        return $block;
    };
    return array_map($walk, $nodes);
}

/** @return array|null blocks + customFields, or null when the payload is unusable */
function ccrm_offer_document_normalize($raw): ?array {
    if (!is_array($raw) || array_is_list($raw) || !isset($raw['blocks']) || !is_array($raw['blocks']) || !array_is_list($raw['blocks'])) {
        return null;
    }
    if (ccrm_offer_count_raw($raw['blocks']) > CCRM_OFFER_MAX_BLOCKS) return null;
    $ctx = ['items' => false, 'totals' => false, 'usp' => false, 'keys' => [], 'customFields' => []];
    if (isset($raw['customFields']) && is_array($raw['customFields'])) {
        foreach ($raw['customFields'] as $entry) {
            if (!is_array($entry) || array_is_list($entry)) continue;
            $key = $entry['key'] ?? null;
            if (!is_string($key) || !preg_match('/^[a-z][a-z0-9_]{0,39}$/', $key)) continue;
            if (isset($ctx['keys'][$key]) || count($ctx['keys']) >= CCRM_OFFER_MAX_CUSTOM) continue;
            $ctx['keys'][$key] = true;
            $label = ccrm_offer_one_line($entry['label'] ?? null);
            $ctx['customFields'][] = ['key' => $key, 'label' => $label !== '' ? $label : $key];
        }
    }
    $blocks = [];
    foreach ($raw['blocks'] as $block) {
        $kept = ccrm_offer_accept($block, 1, false, $ctx);
        if ($kept !== null) $blocks[] = $kept;
    }
    if ($blocks === []) return null;
    $stamped = ccrm_offer_stamp($blocks);
    if (ccrm_offer_count_raw($stamped) > CCRM_OFFER_MAX_BLOCKS) return null;
    return ['blocks' => $stamped, 'customFields' => $ctx['customFields']];
}

function ccrm_offer_document_diff(?array $doc): array {
    $used = [];
    $walk = function (array $blocks) use (&$walk, &$used): void {
        foreach ($blocks as $block) {
            if (!is_array($block)) continue;
            if (($block['type'] ?? '') === 'field' && isset($block['fieldId'])) $used[$block['fieldId']] = true;
            elseif (($block['type'] ?? '') === 'itemsTable') $used['offer.items'] = true;
            elseif (($block['type'] ?? '') === 'totals') $used['offer.totals'] = true;
            elseif (($block['type'] ?? '') === 'uspCards') $used['offer.uspCards'] = true;
            elseif (($block['type'] ?? '') === 'stack') $walk($block['children'] ?? []);
            elseif (($block['type'] ?? '') === 'columns') {
                foreach ($block['columns'] ?? [] as $col) $walk($col);
            }
        }
    };
    if (is_array($doc)) $walk($doc['blocks'] ?? []);
    $missing = [];
    foreach (array_merge(CCRM_OFFER_CATALOG, CCRM_OFFER_SYNTHETIC) as $id) {
        if (!isset($used[$id])) $missing[] = $id;
    }
    return ['missing' => $missing, 'extracted' => is_array($doc) ? ($doc['customFields'] ?? []) : []];
}

/** Cap 24 keys, 500 characters, strings only. A JSON string or an array are both accepted. */
function ccrm_offer_custom_field_values($raw): array {
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        $raw = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($raw) || array_is_list($raw)) return [];
    $out = [];
    foreach ($raw as $key => $value) {
        if (count($out) >= CCRM_OFFER_MAX_CUSTOM) break;
        if (!is_string($key) || !preg_match('/^[a-z][a-z0-9_]{0,39}$/', $key)) continue;
        if (!is_string($value)) continue;
        $out[$key] = mb_substr($value, 0, 500);
    }
    return $out;
}
