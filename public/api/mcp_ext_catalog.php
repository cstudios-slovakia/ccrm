<?php
/**
 * CCRM MCP Gateway — Workspace Metadata Catalog & Company Registry Tools (WP1)
 *
 * Read-only reference tools giving AI agents exact visibility into configured
 * pipeline stages, statuses, sources, categories, lead custom field schemas,
 * project types & attributes, offer categories, price levels, and SK/CZ
 * company registry + EU VIES VAT lookups.
 *
 * Loaded once via require_once from public/api/mcp.php. Never declares top-level
 * HTTP entrypoints or hard-delete SQL.
 */

function mcp_ext_catalog_permissions(): array {
    return [
        'get_workspace_catalog' => ['any' => ['leads', 'clients', 'tasks', 'projects', 'invoices', 'orders', 'tickets', 'warehouse', 'financial', 'employees', 'meetings']],
        'list_lead_attributes' => ['view' => ['leads']],
        'list_project_types' => ['view' => ['projects']],
        'list_offer_categories' => ['view' => ['invoices']],
        'list_price_levels' => ['any' => ['invoices', 'clients', 'warehouse']],
        'lookup_company_registry' => ['any' => ['leads', 'clients', 'warehouse', 'employees']],
        'get_company_financial_statement' => ['any' => ['leads', 'clients']],
        'validate_eu_vat' => ['any' => ['leads', 'clients', 'invoices']],
    ];
}

function mcp_ext_catalog_tool_definitions(): array {
    return [
        [
            'name' => 'get_workspace_catalog',
            'description' => 'Return configured workspace reference lists filtered by your module permissions: lead_states, lead_stage_groups, lead_state_sla, lead_sources, lead_categories, divisions, task_states, project_statuses, offer_statuses, invoice_statuses, order_statuses, ticket_statuses, system_currency, and system_language.',
            'inputSchema' => ['type' => 'object', 'properties' => (object)[]],
        ],
        [
            'name' => 'list_lead_attributes',
            'description' => 'List configured global Lead custom fields (LEAD_ATTRIBUTES: id, name, type, options, required, requiredOptions) so you can inspect schemas and pass custom_fields on create_lead / update_lead.',
            'inputSchema' => ['type' => 'object', 'properties' => (object)[]],
        ],
        [
            'name' => 'list_project_types',
            'description' => 'List configured Project Types (id, name, color, icon, has_invoice_date, has_completion_deadline, custom attributes schema, default_tasks) so you can pick a valid project_type_id or fill custom project fields.',
            'inputSchema' => ['type' => 'object', 'properties' => (object)[]],
        ],
        [
            'name' => 'list_offer_categories',
            'description' => 'List configured Price Offer categories (offer_categories: id, name, parent_id, level, color, sort_order).',
            'inputSchema' => ['type' => 'object', 'properties' => (object)[]],
        ],
        [
            'name' => 'list_price_levels',
            'description' => 'List configured customer / warehouse Price Levels (id, name, color, sort_order, is_default) used by clients and inventory items.',
            'inputSchema' => ['type' => 'object', 'properties' => (object)[]],
        ],
        [
            'name' => 'lookup_company_registry',
            'description' => 'Search or fetch official company details from the Slovak (RPO + RegisterUZ) or Czech (ARES) business register by query (name/ICO/DIC) or exact ICO. Returns normalized company name, ICO, DIC, IC DPH, street, city, postal_code, legal_form, and active status.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'query' => ['type' => 'string', 'description' => 'Company name, ICO, or DIC (min 2 chars; use ico for exact detail lookup)'],
                    'ico' => ['type' => 'string', 'description' => 'Exact 8-digit company registration number (ICO) for a full detail lookup'],
                    'country' => ['type' => 'string', 'enum' => ['SK', 'CZ'], 'description' => 'Register country: SK (default) or CZ'],
                    'limit' => ['type' => 'integer', 'description' => 'Max search suggestions when using query (default 10, max 15)'],
                ],
            ],
        ],
        [
            'name' => 'get_company_financial_statement',
            'description' => 'Look up a Slovak company in RegisterUZ by ICO and return its accounting unit metadata and recent financial statement IDs / summary.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'ico' => ['type' => 'string', 'description' => 'Slovak 8-digit company ICO'],
                ],
                'required' => ['ico'],
            ],
        ],
        [
            'name' => 'validate_eu_vat',
            'description' => 'Validate an EU VAT ID (e.g. SK2120123456, CZ12345678) against the European Commission VIES REST API. Returns valid boolean, registered company name, and address.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'vat' => ['type' => 'string', 'description' => 'EU VAT identification number including 2-letter country prefix'],
                ],
                'required' => ['vat'],
            ],
        ],
    ];
}

function mcp_ext_catalog_execute(\PDO $pdo, array $user, string $tool, array $args) {
    switch ($tool) {
        case 'get_workspace_catalog':
            return mcp_cat_workspace_catalog($pdo);
        case 'list_lead_attributes':
            return mcp_cat_lead_attributes($pdo);
        case 'list_project_types':
            return mcp_cat_project_types($pdo);
        case 'list_offer_categories':
            return mcp_cat_offer_categories($pdo);
        case 'list_price_levels':
            return mcp_cat_price_levels($pdo);
        case 'lookup_company_registry':
            return mcp_cat_lookup_company($args);
        case 'get_company_financial_statement':
            return mcp_cat_registeruz_statement($args);
        case 'validate_eu_vat':
            return mcp_cat_validate_vat($args);
        default:
            return MCP_NOT_MINE;
    }
}

function mcp_cat_settings_map(\PDO $pdo, array $keys): array {
    if (!$keys) return [];
    $ph = implode(',', array_fill(0, count($keys), '?'));
    $stmt = $pdo->prepare("SELECT `key`, `value` FROM `system_settings` WHERE `key` IN ($ph)");
    $stmt->execute(array_values($keys));
    $out = [];
    foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
        $out[(string)$r['key']] = $r['value'];
    }
    return $out;
}

function mcp_cat_decode_json(?string $raw, $fallback) {
    if ($raw === null || $raw === '') return $fallback;
    $d = json_decode($raw, true);
    return json_last_error() === JSON_ERROR_NONE ? $d : $fallback;
}

function mcp_cat_workspace_catalog(\PDO $pdo): array {
    $s = mcp_cat_settings_map($pdo, [
        'SYSTEM_LANGUAGE', 'SYSTEM_CURRENCY',
        'LEAD_STATES', 'LEAD_STAGE_GROUPS', 'LEAD_STATE_PARENTS', 'LEAD_STATE_SLA',
        'LEAD_SOURCES', 'LEAD_CATEGORIES', 'DIVISIONS',
        'TASK_STATES', 'PROJECT_STATUSES', 'OFFER_STATUSES',
        'INVOICE_STATUSES', 'ORDER_STATUSES', 'TICKET_STATUSES',
    ]);
    $lang = (string)($s['SYSTEM_LANGUAGE'] ?? 'sk');
    $defaults = function_exists('ccrm_default_lists') ? ccrm_default_lists($lang) : ['leadStates' => [], 'leadSources' => [], 'leadCategories' => [], 'divisions' => [], 'taskStates' => []];

    $out = [
        'system_language' => $lang,
        'system_currency' => (string)($s['SYSTEM_CURRENCY'] ?? 'EUR'),
    ];
    if (mcp_can('leads')) {
        $out['lead_states'] = mcp_cat_decode_json($s['LEAD_STATES'] ?? null, $defaults['leadStates'] ?? []);
        $out['lead_stage_groups'] = mcp_cat_decode_json($s['LEAD_STAGE_GROUPS'] ?? null, []);
        $out['lead_state_parents'] = mcp_cat_decode_json($s['LEAD_STATE_PARENTS'] ?? null, []);
        $out['lead_state_sla'] = mcp_cat_decode_json($s['LEAD_STATE_SLA'] ?? null, []);
        $out['lead_sources'] = mcp_cat_decode_json($s['LEAD_SOURCES'] ?? null, $defaults['leadSources'] ?? []);
        $out['lead_categories'] = mcp_cat_decode_json($s['LEAD_CATEGORIES'] ?? null, $defaults['leadCategories'] ?? []);
        $out['divisions'] = mcp_cat_decode_json($s['DIVISIONS'] ?? null, $defaults['divisions'] ?? []);
    }
    if (mcp_can('tasks') || mcp_can('projects')) {
        $out['task_states'] = mcp_cat_decode_json($s['TASK_STATES'] ?? null, $defaults['taskStates'] ?? []);
    }
    if (mcp_can('projects')) {
        $rawPs = mcp_cat_decode_json($s['PROJECT_STATUSES'] ?? null, null);
        $out['project_statuses'] = function_exists('ccrm_normalize_project_statuses') ? ccrm_normalize_project_statuses($rawPs) : ($rawPs ?? []);
    }
    if (mcp_can('invoices')) {
        $rawOs = mcp_cat_decode_json($s['OFFER_STATUSES'] ?? null, null);
        $out['offer_statuses'] = function_exists('ccrm_normalize_offer_statuses') ? ccrm_normalize_offer_statuses($rawOs) : ($rawOs ?? []);
        $rawIs = mcp_cat_decode_json($s['INVOICE_STATUSES'] ?? null, null);
        $out['invoice_statuses'] = function_exists('ccrm_normalize_offer_statuses')
            ? ccrm_normalize_offer_statuses($rawIs, function_exists('ccrm_default_invoice_status_defs') ? ccrm_default_invoice_status_defs() : null)
            : ($rawIs ?? []);
    }
    if (mcp_can('orders')) {
        $out['order_statuses'] = mcp_cat_decode_json($s['ORDER_STATUSES'] ?? null, ['new', 'processing', 'shipped', 'delivered', 'cancelled']);
    }
    if (mcp_can('tickets')) {
        $out['ticket_statuses'] = mcp_cat_decode_json($s['TICKET_STATUSES'] ?? null, ['new', 'in_progress', 'waiting_customer', 'resolved', 'closed']);
    }
    return $out;
}

function mcp_cat_lead_attributes(\PDO $pdo): array {
    $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'LEAD_ATTRIBUTES'")->fetchColumn();
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    if (function_exists('ccrm_normalize_lead_attributes')) {
        return ccrm_normalize_lead_attributes($decoded);
    }
    return is_array($decoded) ? $decoded : [];
}

function mcp_cat_project_types(\PDO $pdo): array {
    $stmt = $pdo->query("SELECT `id`, `name`, `description`, `color`, `icon`, `attributes_json`, `has_timeline`, `has_gantt`, `has_deadline`, `has_invoice_date`, `deadline_warning_days`, `deadline_required`, `has_files`, `has_tickets`, `list_columns_json`, `created_at` FROM `project_types` ORDER BY `name` ASC");
    $out = [];
    foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
        $out[] = [
            'id' => (string)$r['id'],
            'name' => (string)$r['name'],
            'description' => $r['description'] ?? null,
            'color' => $r['color'] ?? '#4f46e5',
            'icon' => $r['icon'] ?? null,
            'has_timeline' => !empty($r['has_timeline']),
            'has_gantt' => !empty($r['has_gantt']),
            'has_deadline' => !empty($r['has_deadline']),
            'has_invoice_date' => !empty($r['has_invoice_date']),
            'deadline_warning_days' => (int)($r['deadline_warning_days'] ?? 0),
            'deadline_required' => !empty($r['deadline_required']),
            'has_files' => !empty($r['has_files']),
            'has_tickets' => !empty($r['has_tickets']),
            'attributes' => mcp_cat_decode_json($r['attributes_json'] ?? null, []),
            'list_columns' => mcp_cat_decode_json($r['list_columns_json'] ?? null, []),
        ];
    }
    return $out;
}

function mcp_cat_offer_categories(\PDO $pdo): array {
    try {
        $stmt = $pdo->query("SELECT `id`, `name`, `parent_id`, `level`, `sort_order`, `color`, `icon` FROM `offer_categories` ORDER BY `sort_order` ASC, `name` ASC");
        return $stmt->fetchAll(\PDO::FETCH_ASSOC);
    } catch (\PDOException $e) {
        if ($e->getCode() === '42S02') return [];
        throw $e;
    }
}

function mcp_cat_price_levels(\PDO $pdo): array {
    $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'PRICE_LEVELS'")->fetchColumn();
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    return function_exists('ccrm_normalize_price_levels') ? ccrm_normalize_price_levels($decoded) : (is_array($decoded) ? $decoded : []);
}

function mcp_cat_http_get(string $url, int $timeout = 10): ?string {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (compatible; CCRM MCP lookup)');
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: application/json']);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ($body !== false && $code === 200) ? (string)$body : null;
}

function mcp_cat_http_post_json(string $url, array $payload, int $timeout = 10): ?string {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (compatible; CCRM MCP lookup)');
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'Accept: application/json']);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ($body !== false && $code === 200) ? (string)$body : null;
}

function mcp_cat_lookup_company(array $args): array {
    $country = strtoupper(trim((string)($args['country'] ?? 'SK')));
    if ($country !== 'CZ') $country = 'SK';
    $ico = preg_replace('/\D+/', '', (string)($args['ico'] ?? ''));
    $query = trim((string)($args['query'] ?? ''));
    $limit = max(1, min(15, (int)($args['limit'] ?? 10)));

    if ($ico === '' && mb_strlen($query) < 2) {
        throw new \InvalidArgumentException('Provide either ico (exact company ID) or query (at least 2 characters).');
    }

    if ($country === 'CZ') {
        if ($ico !== '') {
            $raw = mcp_cat_http_get('https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/' . rawurlencode($ico), 12);
            $d = $raw ? json_decode($raw, true) : null;
            if (!is_array($d) || (empty($d['obchodniJmeno']) && empty($d['ico']))) {
                return ['found' => false, 'country' => 'CZ', 'results' => []];
            }
            $sidlo = is_array($d['sidlo'] ?? null) ? $d['sidlo'] : [];
            $street = trim((string)($sidlo['nazevUlice'] ?? $sidlo['nazevObce'] ?? ''));
            $house = trim((string)($sidlo['cisloDomovni'] ?? ''));
            $orient = trim((string)($sidlo['cisloOrientacni'] ?? ''));
            if ($house !== '' || $orient !== '') $street = trim($street . ' ' . $house . ($orient !== '' ? '/' . $orient : ''));
            $rawDic = trim((string)($d['dic'] ?? ''));
            return [
                'found' => true,
                'country' => 'CZ',
                'detail' => [
                    'name' => trim((string)($d['obchodniJmeno'] ?? '')),
                    'company_id' => (string)($d['ico'] ?? $ico),
                    'tax_id' => strtoupper(substr($rawDic, 0, 2)) === 'CZ' ? substr($rawDic, 2) : $rawDic,
                    'vat_id' => $rawDic !== '' ? strtoupper($rawDic) : '',
                    'street' => $street,
                    'city' => trim((string)($sidlo['nazevObce'] ?? '')),
                    'postal_code' => preg_replace('/\D+/', '', (string)($sidlo['psc'] ?? '')),
                    'active' => empty($d['datumZaniku']),
                    'source' => 'ares',
                ],
            ];
        }
        $digits = preg_replace('/\D+/', '', $query);
        $body = ['pocet' => $limit];
        if ($digits !== '' && preg_match('/^(CZ)?[\s\d]+$/i', $query)) $body['ico'] = [$digits];
        else $body['obchodniJmeno'] = $query;
        $raw = mcp_cat_http_post_json('https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/vyhledat', $body, 10);
        $d = $raw ? json_decode($raw, true) : null;
        $results = [];
        foreach ((array)($d['ekonomickeSubjekty'] ?? []) as $sub) {
            if (!is_array($sub)) continue;
            $rawDic = trim((string)($sub['dic'] ?? ''));
            $results[] = [
                'source' => 'ares',
                'name' => trim((string)($sub['obchodniJmeno'] ?? '')),
                'company_id' => (string)($sub['ico'] ?? ''),
                'tax_id' => strtoupper(substr($rawDic, 0, 2)) === 'CZ' ? substr($rawDic, 2) : $rawDic,
                'city' => trim((string)($sub['sidlo']['nazevObce'] ?? '')),
                'postal_code' => preg_replace('/\D+/', '', (string)($sub['sidlo']['psc'] ?? '')),
                'active' => empty($sub['datumZaniku']),
            ];
        }
        return ['country' => 'CZ', 'results' => array_slice($results, 0, $limit)];
    }

    // Slovakia: RegisterUZ + RPO
    if ($ico !== '') {
        $rpoRaw = mcp_cat_http_get('https://api.statistics.sk/rpo/v1/search?identifier=' . rawurlencode($ico), 10);
        $rpo = $rpoRaw ? json_decode($rpoRaw, true) : null;
        $ent = is_array($rpo['results'][0] ?? null) ? $rpo['results'][0] : null;
        $ruzListRaw = mcp_cat_http_get('https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?ico=' . rawurlencode($ico) . '&zmenene-od=2000-01-01', 10);
        $ruzList = $ruzListRaw ? json_decode($ruzListRaw, true) : null;
        $ruzDetail = null;
        if (!empty($ruzList['id'][0])) {
            $lastId = end($ruzList['id']);
            $dRaw = mcp_cat_http_get('https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=' . rawurlencode((string)$lastId), 10);
            $ruzDetail = $dRaw ? json_decode($dRaw, true) : null;
        }
        if (!$ent && !is_array($ruzDetail)) {
            return ['found' => false, 'country' => 'SK'];
        }
        $name = (string)($ruzDetail['nazovUJ'] ?? $ent['fullNames'][0]['value'] ?? '');
        $dic = (string)($ruzDetail['dic'] ?? '');
        $addr = is_array($ent['addresses'][0] ?? null) ? $ent['addresses'][0] : [];
        return [
            'found' => true,
            'country' => 'SK',
            'detail' => [
                'name' => $name,
                'company_id' => $ico,
                'tax_id' => $dic,
                'vat_id' => $dic !== '' ? 'SK' . $dic : '',
                'street' => (string)($ruzDetail['ulica'] ?? trim(($addr['street'] ?? '') . ' ' . ($addr['buildingNumber'] ?? ''))),
                'city' => (string)($ruzDetail['mesto'] ?? $addr['municipality']['value'] ?? ''),
                'postal_code' => preg_replace('/\D+/', '', (string)($ruzDetail['psc'] ?? $addr['postalCodes'][0] ?? '')),
                'legal_form' => (string)($ent['legalForm']['value'] ?? ''),
                'registeruz_id' => isset($ruzDetail['id']) ? (string)$ruzDetail['id'] : '',
                'active' => ($ruzDetail['stav'] ?? '') !== 'ZMAZANÉ',
            ],
        ];
    }

    $ruzRaw = mcp_cat_http_get('https://www.registeruz.sk/cruz-public/domain/suggestion/search?query=' . rawurlencode($query), 10);
    $ruz = $ruzRaw ? json_decode($ruzRaw, true) : [];
    $results = [];
    foreach ((array)$ruz as $row) {
        if (!is_array($row)) continue;
        $results[] = [
            'source' => 'registeruz',
            'registeruz_id' => (string)($row['id'] ?? ''),
            'name' => trim((string)($row['nazov'] ?? $row['name'] ?? '')),
            'company_id' => (string)($row['ico'] ?? ''),
            'city' => trim((string)($row['mesto'] ?? '')),
        ];
        if (count($results) >= $limit) break;
    }
    return ['country' => 'SK', 'results' => $results];
}

function mcp_cat_registeruz_statement(array $args): array {
    $ico = preg_replace('/\D+/', '', (string)($args['ico'] ?? ''));
    if (strlen($ico) < 6) {
        throw new \InvalidArgumentException('ico must be a valid Slovak company ICO.');
    }
    $listRaw = mcp_cat_http_get('https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?ico=' . rawurlencode($ico) . '&zmenene-od=2000-01-01', 10);
    $list = $listRaw ? json_decode($listRaw, true) : null;
    if (empty($list['id']) || !is_array($list['id'])) {
        return ['found' => false, 'ico' => $ico];
    }
    $unit = null;
    foreach (array_reverse($list['id']) as $id) {
        $raw = mcp_cat_http_get('https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=' . rawurlencode((string)$id), 10);
        $d = $raw ? json_decode($raw, true) : null;
        if (is_array($d) && ($d['stav'] ?? '') !== 'ZMAZANÉ') {
            $unit = $d;
            break;
        }
    }
    if (!$unit) return ['found' => false, 'ico' => $ico];

    $statements = [];
    foreach (array_slice(array_reverse((array)($unit['idUctovnychZavierok'] ?? [])), 0, 5) as $sid) {
        $sRaw = mcp_cat_http_get('https://www.registeruz.sk/cruz-public/api/uctovna-zavierka?id=' . rawurlencode((string)$sid), 10);
        $sData = $sRaw ? json_decode($sRaw, true) : null;
        if (is_array($sData)) {
            $statements[] = [
                'id' => $sData['id'] ?? $sid,
                'period_from' => $sData['obdobieOd'] ?? null,
                'period_to' => $sData['obdobieDo'] ?? null,
                'type' => $sData['typ'] ?? null,
                'report_ids' => $sData['idUctovnychVykazov'] ?? [],
                'pdf_url' => 'https://www.registeruz.sk/cruz-public/domain/financialreport/pdf/' . urlencode((string)$sid),
            ];
        }
    }
    return [
        'found' => true,
        'ico' => $ico,
        'registeruz_id' => $unit['id'] ?? null,
        'name' => $unit['nazovUJ'] ?? null,
        'dic' => $unit['dic'] ?? null,
        'city' => $unit['mesto'] ?? null,
        'statements' => $statements,
    ];
}

function mcp_cat_validate_vat(array $args): array {
    $vat = strtoupper((string)preg_replace('/[^A-Za-z0-9]/', '', (string)($args['vat'] ?? '')));
    if (strlen($vat) < 4) {
        throw new \InvalidArgumentException('vat must include a 2-letter EU country code and VAT digits.');
    }
    $raw = mcp_cat_http_post_json('https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number', [
        'countryCode' => substr($vat, 0, 2),
        'vatNumber' => substr($vat, 2),
    ], 10);
    if ($raw === null) {
        throw new \Exception('Failed to connect to EU VIES VAT validation service.');
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new \Exception('Invalid JSON returned from EU VIES VAT validation service.');
    }
    return [
        'vat' => $vat,
        'country_code' => substr($vat, 0, 2),
        'valid' => (bool)($data['valid'] ?? false),
        'name' => trim((string)($data['name'] ?? '')),
        'address' => trim((string)($data['address'] ?? '')),
        'request_date' => $data['requestDate'] ?? null,
    ];
}
