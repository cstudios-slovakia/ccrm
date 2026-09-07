<?php
/**
 * Unified company registry lookup for CCRM.
 *
 * One endpoint behind every "type a name or IČO and let the form fill itself"
 * field in the app. It merges the two Slovak public registers, because neither
 * one alone is enough:
 *
 *   - RPO (api.statistics.sk) covers BOTH companies (Obchodný register / orsr.sk)
 *     and sole traders (Živnostenský register / zrsr.sk), and is the only source
 *     with a readable legal form, the statutory body and the address history.
 *     It does not publish DIČ.
 *   - RegisterUZ (registeruz.sk) publishes DIČ, the statistical codes (SK NACE,
 *     region, district, organisation size) and the accounting-statement ids the
 *     client detail panel links to. It only knows entities that file accounts,
 *     so freelancers are largely missing from it.
 *
 * Czech lookups go to ARES, same as before.
 *
 * Actions:
 *   ?action=suggest&query=<name|IČO|DIČ>&country=SK|CZ
 *       -> { success: true, results: [suggestion] }
 *   ?action=detail&source=rpo|ruz|ares&id=<id>&ico=<ico>&country=SK|CZ
 *       -> { success: true, ...details }
 *
 * Both responses are normalised: callers never see the raw register payloads.
 */

require_once __DIR__ . '/auth.php';

const CCRM_REGISTRY_SUGGEST_TTL = 21600;   // 6 h — names and IČO barely move
const CCRM_REGISTRY_DETAIL_TTL  = 86400;   // 24 h
const CCRM_REGISTRY_MAX_RESULTS = 15;
const CCRM_REGISTRY_UA = 'Mozilla/5.0 (compatible; CCRM company lookup)';

header('Content-Type: application/json; charset=utf-8');
ccrm_send_cors('GET, OPTIONS');

if (php_sapi_name() !== 'cli') {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
        exit;
    }
    ccrm_require_auth();
}

$action  = $_GET['action'] ?? '';
$country = ccrm_registry_country($_GET['country'] ?? 'SK');

if ($action === 'suggest') {
    $query = trim((string)($_GET['query'] ?? ''));
    if (mb_strlen($query) < 3) {
        echo ccrm_json(['success' => true, 'results' => []]);
        exit;
    }

    $cacheKey = 'suggest-' . $country . '-' . mb_strtolower($query);
    $cached = ccrm_registry_cache_get($cacheKey, CCRM_REGISTRY_SUGGEST_TTL);
    if ($cached !== null) {
        echo $cached;
        exit;
    }

    $results = $country === 'CZ' ? ccrm_cz_suggest($query) : ccrm_sk_suggest($query);

    $payload = ccrm_json(['success' => true, 'results' => $results]);
    if ($results) ccrm_registry_cache_put($cacheKey, $payload);
    echo $payload;
    exit;
}

if ($action === 'detail') {
    $source = (string)($_GET['source'] ?? '');
    $id     = trim((string)($_GET['id'] ?? ''));
    $ico    = ccrm_digits($_GET['ico'] ?? '');

    if ($id === '' && $ico === '') {
        http_response_code(400);
        echo ccrm_json(['success' => false, 'message' => 'Missing id or ico parameter']);
        exit;
    }

    $cacheKey = 'detail-' . $country . '-' . $source . '-' . $id . '-' . $ico;
    $cached = ccrm_registry_cache_get($cacheKey, CCRM_REGISTRY_DETAIL_TTL);
    if ($cached !== null) {
        echo $cached;
        exit;
    }

    $details = $country === 'CZ'
        ? ccrm_cz_detail($id !== '' ? $id : $ico)
        : ccrm_sk_detail($source, $id, $ico);

    if ($details === null) {
        http_response_code(404);
        echo ccrm_json(['success' => false, 'message' => 'Company not found in registry']);
        exit;
    }

    $payload = ccrm_json(['success' => true] + $details);
    ccrm_registry_cache_put($cacheKey, $payload);
    echo $payload;
    exit;
}

http_response_code(400);
echo ccrm_json(['success' => false, 'message' => 'Invalid action']);
exit;

// --------------------------------------------------------------------------
// Slovakia — RPO + RegisterUZ
// --------------------------------------------------------------------------

/**
 * Suggestions for a Slovak query. Both registers are queried in parallel and
 * merged on IČO, so an entity shows up once carrying whatever each source knows
 * (RPO: address, legal form, which register it sits in; RegisterUZ: DIČ and the
 * id the financial-statement panel needs).
 */
function ccrm_sk_suggest(string $query): array {
    $digits = ccrm_digits($query);
    $isIdentifier = $digits !== '' && preg_match('/^(SK)?[\s\d]+$/i', $query) === 1;

    $requests = [
        'ruz' => 'https://www.registeruz.sk/cruz-public/domain/suggestion/search?query='
            . rawurlencode($isIdentifier ? $digits : $query),
    ];

    if (!$isIdentifier) {
        $requests['rpo'] = 'https://api.statistics.sk/rpo/v1/search?fullName=' . rawurlencode($query) . '&onlyActive=true';
    } elseif (strlen($digits) <= 8) {
        // 8-digit IČO. A 10-digit DIČ only RegisterUZ can resolve.
        $requests['rpo'] = 'https://api.statistics.sk/rpo/v1/search?identifier=' . rawurlencode($digits);
    }

    $responses = ccrm_fetch_parallel($requests, 9);

    /** @var array<string, array> $byIco */
    $byIco = [];
    $extras = [];

    foreach (ccrm_rpo_results($responses['rpo'] ?? null) as $entity) {
        if (!is_array($entity)) continue;
        $suggestion = ccrm_rpo_suggestion($entity);
        if ($suggestion === null) continue;
        if ($suggestion['companyId'] !== '') {
            $byIco[$suggestion['companyId']] = $suggestion;
        } else {
            $extras[] = $suggestion;
        }
    }

    foreach (ccrm_ruz_suggestions($responses['ruz'] ?? null) as $item) {
        $ico = $item['companyId'];
        if ($ico !== '' && isset($byIco[$ico])) {
            // RPO wins on identity; RegisterUZ contributes DIČ and its own id.
            if ($item['taxId'] !== '') $byIco[$ico]['taxId'] = $item['taxId'];
            $byIco[$ico]['registerUzId'] = $item['registerUzId'];
            continue;
        }
        if ($ico !== '') {
            $byIco[$ico] = $item;
        } else {
            $extras[] = $item;
        }
    }

    $results = array_values($byIco);
    foreach ($extras as $extra) $results[] = $extra;

    ccrm_rank_suggestions($results, $query, $digits);

    return array_slice($results, 0, CCRM_REGISTRY_MAX_RESULTS);
}

/**
 * Full details for one Slovak entity. Whichever register the suggestion came
 * from, the other one is asked too, so the caller always gets the richest record
 * the two can produce for that IČO.
 */
function ccrm_sk_detail(string $source, string $id, string $ico): ?array {
    $rpo = null;
    $ruz = null;

    if ($source === 'rpo' && $id !== '') {
        $rpo = ccrm_json_decode(ccrm_fetch('https://api.statistics.sk/rpo/v1/entity/' . rawurlencode($id), 12));
        if (!is_array($rpo) || !isset($rpo['id'])) $rpo = null;
        if ($ico === '') $ico = ccrm_rpo_ico($rpo);
    } elseif ($source === 'ruz' && $id !== '') {
        $ruz = ccrm_json_decode(ccrm_fetch('https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=' . rawurlencode($id), 12));
        if (!is_array($ruz) || (!isset($ruz['ico']) && !isset($ruz['nazovUJ']))) $ruz = null;
        if ($ico === '' && is_array($ruz)) $ico = ccrm_digits($ruz['ico'] ?? '');
    }

    // Fill in whatever is still missing, by IČO.
    if ($ico !== '' && ($rpo === null || $ruz === null)) {
        $missing = [];
        if ($rpo === null) $missing['rpo'] = 'https://api.statistics.sk/rpo/v1/search?identifier=' . rawurlencode($ico);
        if ($ruz === null) $missing['ruz'] = 'https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?ico=' . rawurlencode($ico) . '&zmenene-od=2000-01-01';

        $responses = ccrm_fetch_parallel($missing, 12);

        if ($rpo === null) {
            $entities = ccrm_rpo_results($responses['rpo'] ?? null);
            $found = isset($entities[0]) && is_array($entities[0]) ? $entities[0] : null;
            if ($found !== null && isset($found['id'])) {
                // The search payload omits activities and statutory bodies.
                $full = ccrm_json_decode(ccrm_fetch('https://api.statistics.sk/rpo/v1/entity/' . rawurlencode((string)$found['id']), 12));
                $rpo = (is_array($full) && isset($full['id'])) ? $full : $found;
            }
        }
        if ($ruz === null) {
            $ruz = ccrm_ruz_by_ico($responses['ruz'] ?? null);
        }
    }

    if (!is_array($rpo) && !is_array($ruz)) return null;

    return ccrm_sk_normalise(is_array($rpo) ? $rpo : null, is_array($ruz) ? $ruz : null, $ico);
}

/** Walks the RegisterUZ id list for an IČO and returns the first live record. */
function ccrm_ruz_by_ico(?string $listJson): ?array {
    $list = ccrm_json_decode($listJson);
    if (!is_array($list) || empty($list['id']) || !is_array($list['id'])) return null;

    foreach (array_reverse($list['id']) as $id) {
        $detail = ccrm_json_decode(ccrm_fetch('https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=' . rawurlencode((string)$id), 10));
        if (!is_array($detail)) continue;
        if (($detail['stav'] ?? '') === 'ZMAZANÉ') continue;
        if (isset($detail['nazovUJ']) || isset($detail['ico'])) return $detail;
    }
    return null;
}

/** Merges an RPO entity and a RegisterUZ record into the normalised shape. */
function ccrm_sk_normalise(?array $rpo, ?array $ruz, string $ico): array {
    $address = $rpo ? ccrm_rpo_current($rpo['addresses'] ?? []) : null;

    $name = $rpo ? ccrm_rpo_value(ccrm_rpo_current($rpo['fullNames'] ?? [])) : '';
    if ($name === '') $name = trim((string)($ruz['nazovUJ'] ?? ''));

    $taxId = ccrm_digits($ruz['dic'] ?? '');
    if ($ico === '') $ico = $rpo ? ccrm_rpo_ico($rpo) : ccrm_digits($ruz['ico'] ?? '');

    $street = $address ? ccrm_rpo_street($address) : trim((string)($ruz['ulica'] ?? ''));
    $city = $address ? trim((string)($address['municipality']['value'] ?? '')) : '';
    if ($city === '') $city = trim((string)($ruz['mesto'] ?? ''));
    $postal = $address ? ccrm_digits($address['postalCodes'][0] ?? '') : ccrm_digits($ruz['psc'] ?? '');

    $legalForm = $rpo ? trim((string)(ccrm_rpo_current($rpo['legalForms'] ?? [])['value']['value'] ?? '')) : '';
    if ($legalForm === '') $legalForm = trim((string)($ruz['pravnaForma'] ?? ''));

    $termination = $rpo ? trim((string)($rpo['termination'] ?? '')) : trim((string)($ruz['datumZrusenia'] ?? ''));

    return [
        'country'            => 'Slovakia',
        'countryCode'        => 'SK',
        'name'               => $name,
        'companyId'          => $ico,
        'taxId'              => $taxId,
        'vatId'              => $taxId !== '' ? 'SK' . $taxId : '',
        'street'             => $street,
        'city'               => $city,
        'postalCode'         => $postal,
        'region'             => trim((string)($ruz['kraj'] ?? '')),
        'district'           => $address
            ? trim((string)($address['district']['value'] ?? ''))
            : trim((string)($ruz['okres'] ?? '')),
        'legalForm'          => $legalForm,
        'legalFormCode'      => trim((string)($ruz['pravnaForma'] ?? '')),
        'establishmentDate'  => $rpo
            ? trim((string)($rpo['establishment'] ?? ''))
            : trim((string)($ruz['datumZalozenia'] ?? '')),
        'dissolutionDate'    => $termination,
        'skNace'             => trim((string)($ruz['skNace'] ?? '')),
        'organizationSize'   => trim((string)($ruz['velkostOrganizacie'] ?? '')),
        'ownershipType'      => trim((string)($ruz['druhVlastnictva'] ?? '')),
        'dataSource'         => trim((string)($ruz['zdrojDat'] ?? '')),
        'register'           => $rpo ? ccrm_rpo_register($rpo) : 'other',
        'registerLabel'      => $rpo ? trim((string)($rpo['sourceRegister']['value']['value'] ?? '')) : '',
        'registrationNumber' => $rpo ? ccrm_rpo_value(ccrm_rpo_current($rpo['sourceRegister']['registrationNumbers'] ?? [])) : '',
        'registrationOffice' => $rpo ? ccrm_rpo_value(ccrm_rpo_current($rpo['sourceRegister']['registrationOffices'] ?? [])) : '',
        'contactPerson'      => $rpo ? ccrm_rpo_contact_person($rpo) : '',
        'mainActivity'       => $rpo ? trim((string)($rpo['statisticalCodes']['mainActivity']['value'] ?? '')) : '',
        'activities'         => $rpo ? ccrm_rpo_activities($rpo) : [],
        'rpoId'              => $rpo ? (string)($rpo['id'] ?? '') : '',
        'registerUzId'       => $ruz ? (string)($ruz['id'] ?? '') : '',
        'active'             => $termination === '',
    ];
}

// --------------------------------------------------------------------------
// RPO helpers
// --------------------------------------------------------------------------

function ccrm_rpo_results(?string $json): array {
    $data = ccrm_json_decode($json);
    if (!is_array($data) || empty($data['results']) || !is_array($data['results'])) return [];
    return $data['results'];
}

/**
 * Picks the currently valid item out of an RPO history array (name, address,
 * legal form, …): the open-ended entry with the latest validFrom, and only if
 * there is none, the most recently closed one.
 */
function ccrm_rpo_current(array $items): ?array {
    $open = null;
    $closed = null;

    foreach ($items as $item) {
        if (!is_array($item)) continue;
        if (empty($item['validTo'])) {
            if ($open === null || (string)($item['validFrom'] ?? '') >= (string)($open['validFrom'] ?? '')) {
                $open = $item;
            }
        } elseif ($closed === null || (string)($item['validTo'] ?? '') > (string)($closed['validTo'] ?? '')) {
            $closed = $item;
        }
    }

    return $open ?? $closed;
}

function ccrm_rpo_value(?array $item): string {
    return $item === null ? '' : trim((string)($item['value'] ?? ''));
}

function ccrm_rpo_ico(?array $entity): string {
    if (!is_array($entity)) return '';
    return ccrm_digits(ccrm_rpo_value(ccrm_rpo_current($entity['identifiers'] ?? [])));
}

/** "SNP 951/16", "Einsteinova 24" — the way a Slovak address is written. */
function ccrm_rpo_street(array $address): string {
    $street = trim((string)($address['street'] ?? ''));
    if ($street === '') $street = trim((string)($address['municipality']['value'] ?? ''));

    $reg = trim((string)($address['regNumber'] ?? ''));
    if ($reg === '0') $reg = '';
    $building = trim((string)($address['buildingNumber'] ?? ''));

    if ($reg !== '' && $building !== '') return trim($street . ' ' . $reg . '/' . $building);
    if ($building !== '') return trim($street . ' ' . $building);
    if ($reg !== '') return trim($street . ' ' . $reg);
    return $street;
}

/** orsr = Obchodný register, zrsr = Živnostenský register (sole traders). */
function ccrm_rpo_register(array $entity): string {
    $code = (string)($entity['sourceRegister']['value']['code'] ?? '');
    if ($code === '1') return 'orsr';
    if ($code === '2') return 'zrsr';
    return 'other';
}

function ccrm_rpo_contact_person(array $entity): string {
    foreach ($entity['statutoryBodies'] ?? [] as $body) {
        if (!is_array($body) || !empty($body['validTo'])) continue;
        $person = $body['personName'] ?? null;
        if (!is_array($person)) continue;
        $given = implode(' ', array_filter((array)($person['givenNames'] ?? [])));
        $family = implode(' ', array_filter((array)($person['familyNames'] ?? [])));
        $full = trim($given . ' ' . $family);
        if ($full !== '') return $full;
    }
    return '';
}

function ccrm_rpo_activities(array $entity): array {
    $out = [];
    foreach ($entity['activities'] ?? [] as $activity) {
        if (!is_array($activity) || !empty($activity['validTo'])) continue;
        $text = trim((string)($activity['economicActivityDescription'] ?? ''));
        if ($text !== '') $out[] = $text;
    }
    return array_slice($out, 0, 30);
}

function ccrm_rpo_suggestion(array $entity): ?array {
    $name = ccrm_rpo_value(ccrm_rpo_current($entity['fullNames'] ?? []));
    $ico = ccrm_rpo_ico($entity);
    if ($name === '' && $ico === '') return null;

    $address = ccrm_rpo_current($entity['addresses'] ?? []);

    return [
        'source'       => 'rpo',
        'id'           => (string)($entity['id'] ?? ''),
        'registerUzId' => '',
        'name'         => $name,
        'companyId'    => $ico,
        'taxId'        => '',
        'street'       => $address ? ccrm_rpo_street($address) : '',
        'city'         => $address ? trim((string)($address['municipality']['value'] ?? '')) : '',
        'postalCode'   => $address ? ccrm_digits($address['postalCodes'][0] ?? '') : '',
        'register'     => ccrm_rpo_register($entity),
        'active'       => empty($entity['termination']),
    ];
}

// --------------------------------------------------------------------------
// RegisterUZ helpers
// --------------------------------------------------------------------------

function ccrm_ruz_suggestions(?string $json): array {
    $data = ccrm_json_decode($json);
    if (!is_array($data)) return [];

    $out = [];
    foreach ($data as $item) {
        if (!is_array($item)) continue;
        $name = ccrm_strip_html((string)($item['entityName'] ?? ''));
        $ico = ccrm_digits(ccrm_strip_html((string)($item['entNumber'] ?? '')));
        if ($name === '' && $ico === '') continue;

        $out[] = [
            'source'       => 'ruz',
            'id'           => (string)($item['id'] ?? ''),
            'registerUzId' => (string)($item['id'] ?? ''),
            'name'         => $name,
            'companyId'    => $ico,
            'taxId'        => ccrm_digits(ccrm_strip_html((string)($item['taxNumber'] ?? ''))),
            'street'       => '',
            'city'         => '',
            'postalCode'   => '',
            'register'     => 'other',
            'active'       => true,
        ];
    }
    return $out;
}

// --------------------------------------------------------------------------
// Czechia — ARES
// --------------------------------------------------------------------------

function ccrm_cz_suggest(string $query): array {
    $digits = ccrm_digits($query);
    $body = ['pocet' => CCRM_REGISTRY_MAX_RESULTS];
    if ($digits !== '' && preg_match('/^(CZ)?[\s\d]+$/i', $query) === 1) {
        $body['ico'] = [$digits];
    } else {
        $body['obchodniJmeno'] = $query;
    }

    $data = ccrm_json_decode(ccrm_post_json('https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/vyhledat', $body, 10));
    if (!is_array($data) || empty($data['ekonomickeSubjekty']) || !is_array($data['ekonomickeSubjekty'])) return [];

    $out = [];
    foreach ($data['ekonomickeSubjekty'] as $sub) {
        if (!is_array($sub)) continue;
        $out[] = [
            'source'       => 'ares',
            'id'           => (string)($sub['ico'] ?? ''),
            'registerUzId' => '',
            'name'         => trim((string)($sub['obchodniJmeno'] ?? '')),
            'companyId'    => (string)($sub['ico'] ?? ''),
            'taxId'        => ccrm_cz_tax_id((string)($sub['dic'] ?? '')),
            'street'       => '',
            'city'         => trim((string)($sub['sidlo']['nazevObce'] ?? '')),
            'postalCode'   => ccrm_digits((string)($sub['sidlo']['psc'] ?? '')),
            'register'     => 'ares',
            'active'       => empty($sub['datumZaniku']),
        ];
    }
    return $out;
}

function ccrm_cz_detail(string $ico): ?array {
    $ico = ccrm_digits($ico);
    if ($ico === '') return null;

    $data = ccrm_json_decode(ccrm_fetch('https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/' . rawurlencode($ico), 12));
    if (!is_array($data) || (empty($data['obchodniJmeno']) && empty($data['ico']))) return null;

    $sidlo = is_array($data['sidlo'] ?? null) ? $data['sidlo'] : [];
    $street = trim((string)($sidlo['nazevUlice'] ?? $sidlo['nazevCastiObce'] ?? $sidlo['nazevObce'] ?? ''));
    $house = trim((string)($sidlo['cisloDomovni'] ?? ''));
    $orient = trim((string)($sidlo['cisloOrientacni'] ?? ''));
    if ($house !== '' || $orient !== '') {
        $street = trim($street . ' ' . $house . ($orient !== '' ? '/' . $orient : ''));
    }
    if ($street === '' && !empty($data['textovaAdresa'])) $street = trim((string)$data['textovaAdresa']);

    $rawDic = trim((string)($data['dic'] ?? ''));

    return [
        'country'            => 'Czech Republic',
        'countryCode'        => 'CZ',
        'name'               => trim((string)($data['obchodniJmeno'] ?? '')),
        'companyId'          => (string)($data['ico'] ?? $ico),
        'taxId'              => ccrm_cz_tax_id($rawDic),
        'vatId'              => $rawDic !== '' ? strtoupper($rawDic) : '',
        'street'             => $street,
        'city'               => trim((string)($sidlo['nazevObce'] ?? '')),
        'postalCode'         => ccrm_digits((string)($sidlo['psc'] ?? '')),
        'region'             => trim((string)($sidlo['nazevKraje'] ?? '')),
        'district'           => trim((string)($sidlo['nazevOkresu'] ?? '')),
        'legalForm'          => trim((string)($data['pravniForma'] ?? '')),
        'legalFormCode'      => trim((string)($data['pravniForma'] ?? '')),
        'establishmentDate'  => trim((string)($data['datumVzniku'] ?? '')),
        'dissolutionDate'    => trim((string)($data['datumZaniku'] ?? '')),
        'skNace'             => is_array($data['czNace'] ?? null) ? (string)($data['czNace'][0] ?? '') : '',
        'organizationSize'   => '',
        'ownershipType'      => '',
        'dataSource'         => 'ARES',
        'register'           => 'ares',
        'registerLabel'      => 'ARES',
        'registrationNumber' => '',
        'registrationOffice' => '',
        'contactPerson'      => '',
        'mainActivity'       => '',
        'activities'         => [],
        'rpoId'              => '',
        'registerUzId'       => '',
        'active'             => empty($data['datumZaniku']),
    ];
}

function ccrm_cz_tax_id(string $dic): string {
    return strtoupper(substr($dic, 0, 2)) === 'CZ' ? substr($dic, 2) : $dic;
}

// --------------------------------------------------------------------------
// Ranking, cache and HTTP plumbing
// --------------------------------------------------------------------------

/**
 * Puts the row the user most likely meant on top: an exact IČO/DIČ hit, then a
 * name that starts with what was typed, then one that merely contains it, with
 * dissolved entities pushed to the bottom.
 */
function ccrm_rank_suggestions(array &$results, string $query, string $digits): void {
    $needle = ccrm_fold($query);

    $score = static function (array $item) use ($needle, $digits): int {
        $s = 0;
        if ($digits !== '' && ($item['companyId'] === $digits || $item['taxId'] === $digits)) $s -= 100;
        $name = ccrm_fold((string)$item['name']);
        if ($needle !== '' && $name === $needle) $s -= 60;
        elseif ($needle !== '' && strpos($name, $needle) === 0) $s -= 30;
        elseif ($needle !== '' && strpos($name, $needle) !== false) $s -= 10;
        if (empty($item['active'])) $s += 50;
        if ($item['companyId'] === '') $s += 5;
        return $s;
    };

    usort($results, static function (array $a, array $b) use ($score) {
        $diff = $score($a) - $score($b);
        if ($diff !== 0) return $diff;
        return strcmp(ccrm_fold((string)$a['name']), ccrm_fold((string)$b['name']));
    });
}

/** Lowercase and strip diacritics, so "Novák" matches a typed "novak". */
function ccrm_fold(string $value): string {
    $value = mb_strtolower(trim($value), 'UTF-8');
    $map = [
        'á'=>'a','ä'=>'a','č'=>'c','ď'=>'d','é'=>'e','ě'=>'e','í'=>'i','ĺ'=>'l','ľ'=>'l','ň'=>'n',
        'ó'=>'o','ô'=>'o','ř'=>'r','ŕ'=>'r','š'=>'s','ť'=>'t','ú'=>'u','ů'=>'u','ý'=>'y','ž'=>'z',
    ];
    return strtr($value, $map);
}

function ccrm_digits($value): string {
    return (string)preg_replace('/\D+/', '', (string)$value);
}

function ccrm_strip_html(string $html): string {
    return trim(html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
}

function ccrm_json(array $data): string {
    return (string)json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function ccrm_json_decode(?string $json) {
    if ($json === null || $json === '') return null;
    $data = json_decode($json, true);
    return json_last_error() === JSON_ERROR_NONE ? $data : null;
}

/** Normalises "Slovakia"/"sk"/"Czechia"/"Czech Republic" to SK or CZ. */
function ccrm_registry_country(string $value): string {
    $value = strtolower(trim($value));
    if ($value === 'cz' || strpos($value, 'czech') === 0 || $value === 'cesko' || $value === 'česko') return 'CZ';
    return 'SK';
}

function ccrm_registry_cache_dir(): ?string {
    $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ccrm-company-registry';
    if (!is_dir($dir) && !@mkdir($dir, 0777, true) && !is_dir($dir)) return null;
    return $dir;
}

function ccrm_registry_cache_get(string $key, int $ttl): ?string {
    $dir = ccrm_registry_cache_dir();
    if ($dir === null) return null;
    $file = $dir . DIRECTORY_SEPARATOR . md5($key) . '.json';
    if (!is_file($file) || (time() - (int)@filemtime($file)) > $ttl) return null;
    $data = @file_get_contents($file);
    return ($data === false || $data === '') ? null : $data;
}

function ccrm_registry_cache_put(string $key, string $payload): void {
    $dir = ccrm_registry_cache_dir();
    if ($dir === null) return;
    @file_put_contents($dir . DIRECTORY_SEPARATOR . md5($key) . '.json', $payload, LOCK_EX);

    // Occasional sweep, so the directory cannot grow without bound.
    if (mt_rand(1, 50) === 1) {
        foreach ((array)@glob($dir . DIRECTORY_SEPARATOR . '*.json') as $stale) {
            if ((time() - (int)@filemtime($stale)) > CCRM_REGISTRY_DETAIL_TTL) @unlink($stale);
        }
    }
}

function ccrm_fetch(string $url, int $timeout): ?string {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_USERAGENT, CCRM_REGISTRY_UA);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: application/json']);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ($body === false || (int)$code !== 200) ? null : (string)$body;
}

/**
 * Runs several GETs at once — a name lookup hits both registers, and RPO alone
 * can take a few seconds, so doing them in sequence would double the wait. A
 * source that fails or times out simply contributes nothing.
 *
 * @param array<string,string> $urls
 * @return array<string,?string>
 */
function ccrm_fetch_parallel(array $urls, int $timeout): array {
    if (!$urls) return [];
    if (count($urls) === 1) {
        $key = (string)array_key_first($urls);
        return [$key => ccrm_fetch($urls[$key], $timeout)];
    }

    $multi = curl_multi_init();
    $handles = [];
    foreach ($urls as $key => $url) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_USERAGENT, CCRM_REGISTRY_UA);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: application/json']);
        curl_multi_add_handle($multi, $ch);
        $handles[$key] = $ch;
    }

    $running = null;
    do {
        curl_multi_exec($multi, $running);
        if ($running) curl_multi_select($multi, 0.5);
    } while ($running > 0);

    $out = [];
    foreach ($handles as $key => $ch) {
        $body = curl_multi_getcontent($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $out[$key] = ($body === false || $body === null || (int)$code !== 200) ? null : (string)$body;
        curl_multi_remove_handle($multi, $ch);
        curl_close($ch);
    }
    curl_multi_close($multi);

    return $out;
}

function ccrm_post_json(string $url, array $body, int $timeout): ?string {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'Accept: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_USERAGENT, CCRM_REGISTRY_UA);
    $out = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ($out === false || (int)$code !== 200) ? null : (string)$out;
}
