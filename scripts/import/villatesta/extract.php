<?php
/**
 * Step 1 of the Villatesta migration: read the OLD CRM database (read-only) and write
 * normalised JSON per entity to out/. Nothing here knows the CCRM schema; load.php does.
 *
 *   php scripts/import/villatesta/extract.php [--host=127.0.0.1] [--port=33061] [--user=root]
 *       [--pass=root] [--db=vcrm_db] [--out=scripts/import/villatesta/out] [--only=users,clients,...]
 *
 * Inside the dev container the old DB is host.docker.internal:33061.
 *
 * Output (all UTF-8 JSON, ids already in their final CCRM form):
 *   users.json  clients.json  leads.json  projects.json  mail.jsonl  products.json
 *   leftovers.json  files.json  extract-report.json / .md
 * Ids are deterministic (client-vt-<org>, lead-vt-<prelead>, proj-vt-<lead>, te-vt-..., whi-vt-<mrp>),
 * so loading twice updates instead of duplicating.
 *
 * Plan: Claude outputs/villatesta-migration/PLAN.md (C0-C8).
 */

require __DIR__ . '/lib.php';

$cli = vt_cli($argv);
$outDir = rtrim((string)($cli['out'] ?? (__DIR__ . '/out')), '/\\');
$only = isset($cli['only']) ? array_filter(array_map('trim', explode(',', (string)$cli['only']))) : [];
$want = fn(string $name) => !$only || in_array($name, $only, true);

$old = new PDO(
    sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $cli['host'] ?? '127.0.0.1', (int)($cli['port'] ?? 33061), $cli['db'] ?? 'vcrm_db'),
    $cli['user'] ?? 'root',
    $cli['pass'] ?? 'root',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);
$old->exec('SET SESSION TRANSACTION READ ONLY');

$report = new VtReport();

function q(string $sql, array $params = []): array {
    global $old;
    $st = $old->prepare($sql);
    $st->execute($params);
    return $st->fetchAll();
}

function group_by(array $rows, string $key): array {
    $out = [];
    foreach ($rows as $r) $out[$r[$key]][] = $r;
    return $out;
}

// ── vocabulary (decisions in PLAN.md B2/B3/B4) ───────────────────────────────

const VT_FALLBACK_SOURCE = 'Pôvodný CRM';
const VT_PLACEHOLDER_ORG = 37; // an auto-created organization with no name, linked to 57 preleads

const VT_PRELEAD_STATE = [
    'not_contacted' => 'Nekontaktovaný',
    'contacting_in_progress' => 'V procese kontaktovania',
    'new_prelead' => 'Nový záujemca',
    'price_offer_in_progress' => 'Cenová ponuka v procese',
    'price_offer_sent' => 'Cenová ponuka odoslaná',
    'disinterest' => 'Nezáujem',
];
const VT_OFFER_STATE = [
    'cp_react' => 'Cenová ponuka v procese',
    'created_from_lead' => 'Cenová ponuka v procese',
    'price_offer_sent' => 'Cenová ponuka odoslaná',
    'offer_sent' => 'Cenová ponuka odoslaná',
    'new' => 'Cenová ponuka odoslaná',
    'revaluation' => 'Precenenie',
    'accepted' => 'Akceptovaná',
    'confirmed' => 'Akceptovaná',
    'cenponukuzarvet' => 'Akceptovaná',
    'rejected' => 'Odmietnutá',
    'new_api' => 'Zrušená',
];
const VT_WON_STATE = 'Akceptovaná';
/** Offer statuses in the CP history that read as a state change (the others are notes, uploads and system rows). */
const VT_OFFER_STATUS_NAMES = [
    'offer_sent' => 'Cenová ponuka odoslaná', 'price_offer_sent' => 'Cenová ponuka odoslaná', 'new' => 'Odoslaná',
    'confirmed' => 'Cenová ponuka akceptovaná', 'accepted' => 'Akceptovaná', 'rejected' => 'Odmietnutá', 'declined' => 'Cenová ponuka odmietnutá',
    'revaluation' => 'Precenenie', 'cp_react' => 'Vypracovanie cenovej ponuky', 'cenponukuzarvet' => 'Cenová ponuka uzavretá',
    'new_api' => 'Zrušená', 'created_from_lead' => 'Vytvorená zo zákazky', 'pending' => 'Čaká', 'concept' => 'V príprave',
    'correction_required' => 'Prepracovanie cenovej ponuky', 'konz' => 'Konzultácia', 'dostret' => 'Dohodnuté stretnutie',
    'ohrtttst' => 'Obhliadka', 'zamerdsklfg' => 'Zameranie', 'zmvybsdfg' => 'Zameranie vybavené', 'offer_sent_pf' => 'Faktúra vystavená',
    'zfvyst' => 'Zálohová faktúra vystavená', 'fakujgskd' => 'Faktúra uhradená', 'zaluhrsdfgh' => 'Zálohová faktúra uhradená', 'invodl' => 'Akceptovaná',
];
const VT_LEAD_STATUS_KEY = [ // zákazka status -> project status key (B4)
    'new' => 'new', 'dohodnute_stretnutie' => 'dohodnute_stretnutie', 'obhliadka' => 'obhliadka', 'konzultacia' => 'konzultacia',
    'zameranie' => 'zameranie', 'vypracovanie_cenovej_ponuky' => 'vypracovanie_cenovej_ponuky', 'canceled' => 'cancelled',
];
const VT_LEAD_STATUS_LABEL = [
    'new' => 'Nová zákazka', 'dohodnute_stretnutie' => 'Dohodnuté stretnutie', 'obhliadka' => 'Obhliadka', 'konzultacia' => 'Konzultácia',
    'zameranie' => 'Zameranie', 'vypracovanie_cenovej_ponuky' => 'Vypracovanie cenovej ponuky', 'canceled' => 'Vylúčený',
];
/** Product type codes (two generations of them) -> the lead categories of B2. */
const VT_CATEGORY = [
    'product_type_1' => ['Strešná krytina'],
    'product_type_2' => ['Individuálne spracovanie'],
    'product_type_3' => ['Dlažba', 'Obklad'],
    'product_type_4' => ['Dlažba', 'Obklad'],
    'product_type_5' => ['Potrebuje poradiť'],
    'type_stresna_krytina' => ['Strešná krytina'],
    'type_obklad' => ['Obklad'],
    'type_dlazba' => ['Dlažba'],
    'type_individualne_spracovanie' => ['Individuálne spracovanie'],
    'type_potrebuje_poradit' => ['Potrebuje poradiť'],
];
/** price_offer__organization_type.code -> client category slug (ids are made in load.php). */
const VT_CLIENT_CATEGORY = [
    'client' => 'klient', 'architect' => 'architekt', 'manufacturer' => 'vyrobca',
    'realizacna_firma_stavebna' => 'realizacna-stavebna', 'realizacna_firma_strecharska' => 'realizacna-strecharska', 'predajca' => 'predajca',
];
const VT_COUNTRY = ['SK' => 'Slovakia', 'HU' => 'Hungary', 'CZ' => 'Czechia', 'AT' => 'Austria', 'PL' => 'Poland', 'DE' => 'Germany'];
const VT_ROLE_BY_USER = [40 => 'Admin', 49 => 'Admin', 46 => 'Administrativa', 47 => 'Administrativa']; // B1; the rest are Predajca

// ── lookups ──────────────────────────────────────────────────────────────────

$optionLabel = [];
foreach (q('SELECT id, param_id, value FROM param__option') as $o) $optionLabel[(int)$o['id']] = (string)$o['value'];
$paramInfo = [];
foreach (q('SELECT id, code, type_code, name FROM param') as $p) $paramInfo[(int)$p['id']] = $p;

/** A raw param value as text: option ids of select / multiselect params become their labels. */
function resolve_param(int $paramId, $raw): ?string {
    global $paramInfo, $optionLabel;
    if ($raw === null || trim((string)$raw) === '') return null;
    $type = $paramInfo[$paramId]['type_code'] ?? 'text';
    if ($type === 'select' && ctype_digit(trim((string)$raw))) {
        return $optionLabel[(int)$raw] ?? null;
    }
    if ($type === 'multiselect') {
        $ids = json_decode((string)$raw, true);
        if (!is_array($ids)) $ids = preg_split('/\s*,\s*/', trim((string)$raw), -1, PREG_SPLIT_NO_EMPTY);
        $labels = array_values(array_filter(array_map(fn($i) => $optionLabel[(int)$i] ?? null, $ids)));
        return $labels ? implode(', ', $labels) : null;
    }
    return vt_text($raw);
}

/** [entityId => [param code => resolved value]] for one *_to_param table. */
function load_params(string $table, string $idCol): array {
    global $paramInfo, $report;
    $out = [];
    foreach (q("SELECT `{$idCol}` AS eid, param_id, value FROM `{$table}`") as $r) {
        $pid = (int)$r['param_id'];
        if (!isset($paramInfo[$pid])) {
            $report->count("params in {$table} of an unknown param (ignored)");
            continue;
        }
        $v = resolve_param($pid, $r['value']);
        if ($v !== null) $out[(int)$r['eid']][$paramInfo[$pid]['code']] = $v;
    }
    return $out;
}

// users and managers
$userRows = q('SELECT id, name, email, password_hash FROM user WHERE superadmin = 0 AND status = 1 ORDER BY id');
$userName = [];
foreach ($userRows as $u) $userName[(int)$u['id']] = vt_clean($u['name']);
$managerUser = []; // price_offer__manager.id -> user name
$managerType = [];
foreach (q('SELECT id, user_id, name, type_code FROM price_offer__manager') as $m) {
    $name = $m['user_id'] && isset($userName[(int)$m['user_id']]) ? $userName[(int)$m['user_id']] : null;
    if ($name === null) { // Tibor has no user_id: take the user of the same name
        foreach ($userName as $uname) {
            if ($uname !== null && mb_strtolower($uname) === mb_strtolower((string)vt_clean($m['name']))) $name = $uname;
        }
    }
    $managerUser[(int)$m['id']] = $name;
    $managerType[(int)$m['id']] = $m['type_code'];
}
function author_of($userId): ?string {
    global $userName;
    return $userId !== null && isset($userName[(int)$userId]) ? $userName[(int)$userId] : null; // user 1 (test super admin) = the system
}
/** User name behind a *_to_manager link set: sales first, else the first. */
function owner_of(array $links): string {
    global $managerUser;
    $pick = null;
    foreach ($links as $l) {
        $n = $managerUser[(int)$l['manager_id']] ?? null;
        if ($n === null) continue;
        if ($l['type_code'] === 'sales') return $n;
        $pick ??= $n;
    }
    return $pick ?? '';
}

// ── files ────────────────────────────────────────────────────────────────────

$filesManifest = [];
/** Registers an old upload and returns its attachment record for attachments_json. */
function register_file(string $kind, array $f): ?array {
    global $filesManifest, $report;
    $src = (string)($f['path'] ?? '');
    if ($src === '') { $report->skip('files', 'no path', "{$kind}-{$f['id']}"); return null; }
    $ext = trim((string)($f['extension'] ?? ''));
    $name = vt_clean($f['custom_file_name'] ?? '') ?? vt_clean($f['file_name'] ?? '') ?? basename($src);
    if ($ext !== '' && strcasecmp(pathinfo($name, PATHINFO_EXTENSION), $ext) !== 0) $name .= '.' . $ext;
    $target = "vt-{$kind}-{$f['id']}_" . vt_safe_name($name);
    $filesManifest["{$kind}-{$f['id']}"] = [
        'key' => "{$kind}-{$f['id']}", 'source' => $src, 'target' => $target, 'name' => $name, 'size' => (int)($f['size'] ?? 0),
    ];
    return ['name' => $name, 'size' => vt_size_label($f['size'] ?? 0), 'path' => '/uploads/' . $target];
}

// ── history -> timeline ──────────────────────────────────────────────────────

/**
 * Turns the Yii activity rows of one record (prelead / offer / zákazka) into timeline entries.
 * A row is a status change when its history code equals its status code; otherwise it is a
 * carrier of a note, a file or a sent mail. A parent row without content of its own
 * ("new_note" above the note, "phone_contact" above the call text) is dropped, because its
 * child holds the content. Returns [entries, skipped-marker-count].
 *
 * $cfg: prefix, statusLabel (code => label), statusTitle, statusContent(callable prev,label,row),
 *       files (file id => record), mails (sent_email_id => entry fields).
 */
function convert_history(array $rows, array $cfg): array {
    usort($rows, fn($a, $b) => $a['id'] <=> $b['id']);
    $byId = [];
    $children = [];
    foreach ($rows as $r) {
        $byId[$r['id']] = $r;
        if ($r['parent_history_id']) $children[$r['parent_history_id']][] = $r['id'];
    }
    $chain = function (array $r) use ($byId): array {
        $codes = [];
        $guard = 0;
        while ($r && $r['parent_history_id'] && isset($byId[$r['parent_history_id']]) && $guard++ < 6) {
            $r = $byId[$r['parent_history_id']];
            $codes[] = $r['status_history_code'];
        }
        return $codes;
    };
    $entries = [];
    $skipped = 0;
    $prev = null;
    foreach ($rows as $r) {
        $code = (string)$r['status_history_code'];
        $ts = $r['date'] ?: $r['created_at'];
        $author = author_of($r['user_id']);
        $id = "te-vt-{$cfg['prefix']}-{$r['id']}";
        $isStatus = $code !== '' && $code === (string)$r['status_code'] && isset($cfg['statusLabel'][$code]);
        if ($isStatus) {
            $label = $cfg['statusLabel'][$code];
            $entries[] = [
                'id' => $id, 'type' => 'status_change', 'timestamp' => $ts, 'title' => $cfg['statusTitle'],
                'content' => ($cfg['statusContent'])($prev, $label, $r), 'author' => $author,
            ];
            $prev = $label;
            continue;
        }
        $text = vt_text($r['note'] ?? null);
        $parents = $chain($r);
        if ($r['sent_email_id'] && isset($cfg['mails'][$r['sent_email_id']])) {
            $m = $cfg['mails'][$r['sent_email_id']];
            $entries[] = [
                'id' => $id, 'type' => 'email', 'timestamp' => $ts, 'title' => $m['subject'], 'content' => $m['content'],
                'author' => $author, 'isOutgoing' => true,
            ];
        } elseif ($r['file_id'] && isset($cfg['files'][$r['file_id']])) {
            $f = $cfg['files'][$r['file_id']];
            $entries[] = [
                'id' => $id, 'type' => 'note', 'timestamp' => $ts, 'title' => 'Súbor: ' . $f['name'], 'content' => null,
                'author' => $author, 'attachments' => [$f],
            ];
        } elseif ($text !== null) {
            $isCall = $code === 'phone_contact' || in_array('phone_contact', $parents, true);
            $entries[] = [
                'id' => $id, 'type' => $isCall ? 'phone' : 'note', 'timestamp' => $ts,
                'title' => $isCall ? 'Telefonický kontakt' : 'Poznámka', 'content' => $text, 'author' => $author,
            ];
        } elseif (in_array($code, ['phone_contact', 'email_contact'], true) && empty($children[$r['id']])) {
            $entries[] = [
                'id' => $id, 'type' => $code === 'phone_contact' ? 'phone' : 'note', 'timestamp' => $ts,
                'title' => $code === 'phone_contact' ? 'Telefonický kontakt' : 'Emailový kontakt', 'content' => null, 'author' => $author,
            ];
        } else {
            $skipped++;
        }
    }
    return [$entries, $skipped];
}

function note_key(string $text): string {
    return md5(mb_strtolower(preg_replace('/\s+/u', ' ', trim($text))));
}

// ── 1. users ─────────────────────────────────────────────────────────────────

$users = [];
foreach ($userRows as $u) {
    $oldId = (int)$u['id'];
    $mgrType = null;
    foreach ($managerUser as $mid => $mname) if ($mname === $userName[$oldId]) $mgrType = $managerType[$mid];
    $role = VT_ROLE_BY_USER[$oldId] ?? ($mgrType === 'admin' ? 'Admin' : ($mgrType === 'management' ? 'Administrativa' : 'Predajca'));
    $users[] = [
        'oldId' => $oldId, 'id' => 'user-vt-' . $oldId, 'name' => $userName[$oldId], 'email' => strtolower(trim($u['email'])),
        'passwordHash' => $u['password_hash'], 'role' => $role,
    ];
}
if ($want('users')) {
    vt_json_write("{$outDir}/users.json", $users);
    $report->set('users', count($users));
    foreach ($users as $u) if (!str_starts_with($u['passwordHash'], '$2y$')) $report->warn('users', "{$u['email']}: password hash is not bcrypt `\$2y\$` - the user must reset it");
}

// The company's own addresses. The old CRM matched mail to a customer by e-mail address, so a customer whose
// contact address is a company mailbox collected all the internal mail (3 such records held 91 % of the filed
// mail). Such an address is never kept as a customer address, and the mail of that record is not imported.
$own = [];
$ownDomains = [];
$userByEmail = [];
foreach ($users as $u) {
    $userByEmail[$u['email']] = $u['name'];
    $ownDomains[substr(strrchr($u['email'], '@'), 1)] = true;
}
foreach (q('SELECT email FROM email_reader__account') as $a) {
    $own[strtolower($a['email'])] = true;
    $ownDomains[substr(strrchr(strtolower($a['email']), '@'), 1)] = true;
}
function is_company_address(?string $email): bool {
    global $ownDomains;
    return $email !== null && $email !== '' && isset($ownDomains[substr((string)strrchr(strtolower($email), '@'), 1)]);
}
$internalOrgs = []; // organization id => its company address

// ── 2. preleads -> leads, offers folded in ───────────────────────────────────

$preleadRows = q('SELECT * FROM prelead ORDER BY id');
$preleadParams = load_params('prelead___prelead_to_param', 'prelead_id');
$preleadManagers = group_by(q('SELECT * FROM prelead___prelead_to_manager ORDER BY id'), 'prelead_id');
$preleadOrgs = group_by(q('SELECT * FROM prelead___prelead_to_organization ORDER BY id'), 'prelead_id');
$preleadHistory = group_by(q('SELECT * FROM prelead__history'), 'prelead_id');
$preleadNotes = group_by(q('SELECT * FROM prelead__note WHERE archived = 0 ORDER BY id'), 'prelead_id');
$preleadFilesRows = group_by(q('SELECT * FROM prelead__file WHERE archived = 0 ORDER BY id'), 'prelead_id');

$orgRows = q('SELECT * FROM price_offer__organization ORDER BY id');
$orgById = [];
foreach ($orgRows as $o) $orgById[(int)$o['id']] = $o;
$orgContact = [];
foreach (q('SELECT * FROM price_offer__organization_contact WHERE archived = 0 ORDER BY `default` DESC, id') as $c) $orgContact[(int)$c['organization_id']] ??= $c;
$orgBilling = [];
foreach (q('SELECT * FROM price_offer__organization_billing_address WHERE archived = 0 ORDER BY `default` DESC, id') as $b) $orgBilling[(int)$b['organization_id']] ??= $b;
$orgDelivery = group_by(q('SELECT * FROM price_offer__organization_delivery_address WHERE archived = 0 ORDER BY id'), 'organization_id');
$orgParams = load_params('price_offer___organization_to_param', 'organization_id');

/** First real organization of a link list (the placeholder and unknown ones are skipped). */
function pick_org(array $links): ?int {
    global $orgById;
    foreach ($links as $l) {
        $id = (int)$l['organization_id'];
        if ($id !== VT_PLACEHOLDER_ORG && isset($orgById[$id]) && vt_clean($orgById[$id]['name']) !== null) return $id;
    }
    return null;
}

// price offers
$offerRows = q('SELECT * FROM price_offer ORDER BY id');
$offerParams = load_params('price_offer___price_offer_to_param', 'price_offer_id');
$offerOrgs = group_by(q('SELECT * FROM price_offer___price_offer_to_organization ORDER BY id'), 'price_offer_id');
$offerHistory = group_by(q('SELECT * FROM price_offer__history'), 'price_offer_id');
$offerNotes = group_by(q('SELECT * FROM price_offer__note WHERE archived = 0 ORDER BY id'), 'price_offer_id');
$offerFilesRows = group_by(q('SELECT * FROM price_offer__file WHERE archived = 0 ORDER BY id'), 'price_offer_id');
$offerByPrelead = [];
foreach ($preleadRows as $p) if ($p['created_price_offer_id']) $offerByPrelead[(int)$p['id']] = (int)$p['created_price_offer_id'];
$offerById = [];
foreach ($offerRows as $o) $offerById[(int)$o['id']] = $o;

// sent mails (history carries sent_email_id -> log)
$sentMails = [];
foreach (q('SELECT s.id, l.`to`, l.subject, l.body, l.created_at FROM prelead__sent_email s JOIN email__log l ON l.id = s.log_id') as $m) {
    $to = '';
    $dec = json_decode((string)$m['to'], true);
    if (is_array($dec)) $to = implode(', ', array_filter(array_map(fn($x) => is_array($x) ? ($x['email'] ?? '') : (string)$x, $dec)));
    $body = vt_html_to_text((string)$m['body']);
    $sentMails[(int)$m['id']] = [
        'subject' => mb_substr(vt_clean($m['subject']) ?? '(Bez predmetu)', 0, 250),
        'content' => 'To: ' . ($to !== '' ? $to : vt_clean($m['to'])) . "\nSubject: " . (vt_clean($m['subject']) ?? '') . "\n\n" . mb_substr($body, 0, 20000),
    ];
}

$source = fn(?string $v) => $v ?? VT_FALLBACK_SOURCE;
$leads = [];
$leadIdByOld = [];
$offerTarget = []; // offer id -> ['lead' => lead-vt-.. | null]

foreach ($preleadRows as $p) {
    $pid = (int)$p['id'];
    $code = vt_clean($p['code']) ?? ('PL' . $pid);
    $par = $preleadParams[$pid] ?? [];
    $leadId = "lead-vt-{$pid}";
    $leadIdByOld[$pid] = $leadId;
    $orgId = pick_org($preleadOrgs[$pid] ?? []);
    $org = $orgId !== null ? $orgById[$orgId] : null;
    $oc = $orgId !== null ? ($orgContact[$orgId] ?? null) : null;

    $contactName = vt_clean($par['contact_name'] ?? null);
    $name = ($org ? vt_clean($org['name']) : null) ?? $contactName ?? vt_clean($par['company'] ?? null) ?? $code;
    $contactPerson = $contactName !== null && mb_strtolower($contactName) !== mb_strtolower($name) ? $contactName : null;
    $email = vt_clean($par['contact_email'] ?? null) ?? ($oc ? vt_clean($oc['email']) : null);
    $phone = vt_clean($par['contact_phone'] ?? null) ?? ($oc ? vt_clean($oc['phone']) : null);
    if (is_company_address($email)) { $report->warn('leads', "{$code}: contact e-mail {$email} is a company address, left empty"); $email = null; }
    if (isset($preleadOrgs[$pid]) && $orgId === null && count($preleadOrgs[$pid]) > 0 && !array_filter($preleadOrgs[$pid], fn($l) => (int)$l['organization_id'] === VT_PLACEHOLDER_ORG)) {
        $report->warn('leads', "{$code}: linked organization is missing or unnamed");
    }

    // type_code is sometimes JSON inside a JSON string
    $types = json_decode((string)$p['type_code'], true);
    if (is_string($types)) $types = json_decode($types, true);
    $categories = [];
    foreach (is_array($types) ? $types : [] as $t) foreach (VT_CATEGORY[$t] ?? [] as $c) $categories[$c] = true;
    foreach (is_array($types) ? $types : [] as $t) if (!isset(VT_CATEGORY[$t])) $report->warn('leads', "{$code}: unknown product type code {$t}");

    $oldStatus = (string)$p['status_code'];
    $status = VT_PRELEAD_STATE[$oldStatus] ?? null;
    if ($status === null) {
        $report->warn('leads', "{$code}: unknown status {$oldStatus}, imported as Nekontaktovaný");
        $status = VT_PRELEAD_STATE['not_contacted'];
    }

    $createdAt = $p['custom_created_at'] ?: substr((string)$p['created_at'], 0, 10);

    $note = [];
    $note[] = 'Pôvodný CRM: ' . $code;
    foreach ([
        'Produkt' => 'product_name', 'Popis produktu' => 'product_description', 'Miesto realizácie' => 'location',
        'Typ projektu' => 'project_type', 'Plocha (m²)' => 'area_size', 'Termín realizácie' => 'deadline',
        'Individuálne spracovanie' => 'custom_processing', 'Detail individuálneho spracovania' => 'custom_processing_detail',
        'Katastrálne územie' => 'cadastral_area', 'Číslo parcely' => 'parcel_number', 'Spoločnosť' => 'company',
    ] as $label => $k) {
        if (isset($par[$k])) $note[] = "{$label}: {$par[$k]}";
    }
    $campaign = $par['referal'] ?? null;
    if ($campaign !== null) $note[] = "Kampaň: {$campaign}";

    // timeline
    $filesById = [];
    foreach ($preleadFilesRows[$pid] ?? [] as $f) {
        $rec = register_file('prelead', $f);
        if ($rec) $filesById[(int)$f['id']] = $rec;
    }
    [$timeline, $skippedMarkers] = convert_history($preleadHistory[$pid] ?? [], [
        'prefix' => 'ph', 'statusLabel' => VT_PRELEAD_STATE, 'statusTitle' => 'Zmena stavu leadu', 'files' => $filesById, 'mails' => $sentMails,
        'statusContent' => fn($prev, $label, $row) => ($prev !== null ? $prev . ' → ' : '') . $label . ($row['history_custom_id'] && isset($offerById[(int)$row['history_custom_id']]) ? ' (' . $offerById[(int)$row['history_custom_id']]['code'] . ')' : ''),
    ]);
    $report->count('prelead history rows without content (markers, updates)', $skippedMarkers);

    // notes from prelead__note that history does not already hold
    $have = [];
    foreach ($timeline as $e) if ($e['content'] !== null && in_array($e['type'], ['note', 'phone'], true)) $have[note_key($e['content'])] = true;
    foreach ($preleadNotes[$pid] ?? [] as $n) {
        $text = vt_text($n['message']);
        if ($text === null || isset($have[note_key($text)])) { $report->count('prelead__note rows already in history'); continue; }
        $have[note_key($text)] = true;
        $timeline[] = ['id' => "te-vt-pn-{$n['id']}", 'type' => 'note', 'timestamp' => $n['created_at'], 'title' => 'Poznámka', 'content' => $text, 'author' => null];
    }
    // history files not tied to a history row (should be none)
    $usedFiles = [];
    foreach ($timeline as $e) foreach ($e['attachments'] ?? [] as $a) $usedFiles[$a['path']] = true;
    foreach ($filesById as $fid => $rec) {
        if (!isset($usedFiles[$rec['path']])) {
            $timeline[] = ['id' => "te-vt-pf-{$fid}", 'type' => 'note', 'timestamp' => $p['updated_at'], 'title' => 'Súbor: ' . $rec['name'], 'content' => null, 'author' => null, 'attachments' => [$rec]];
            $report->count('prelead files without a history row (added to the timeline)');
        }
    }

    // the web form that created it
    $opts = json_decode((string)$p['options'], true);
    if (is_string($opts)) $opts = json_decode($opts, true);
    $form = [];
    foreach (['formName' => 'Formulár', 'form_type' => 'Typ formulára', 'office_reference' => 'Referencia kancelárie', 'attachment' => 'Príloha'] as $k => $label) {
        if (isset($par[$k])) $form[] = "{$label}: {$par[$k]}";
    }
    foreach (['formKey', 'entryId', 'newsletter_optin', 'showroom', 'date', 'time'] as $k) {
        if (is_array($opts) && isset($opts[$k]) && $opts[$k] !== '') $form[] = "{$k}: " . (is_scalar($opts[$k]) ? $opts[$k] : json_encode($opts[$k], JSON_UNESCAPED_UNICODE));
    }
    if ($form) {
        $timeline[] = ['id' => "te-vt-form-{$pid}", 'type' => 'note', 'timestamp' => $p['created_at'], 'title' => 'Webový formulár', 'content' => implode("\n", $form), 'author' => null];
    }

    $leads[$pid] = [
        'id' => $leadId, 'oldId' => $pid, 'code' => $code, 'name' => mb_substr($name, 0, 150), 'clientId' => $orgId !== null ? "client-vt-{$orgId}" : null,
        'status' => $status, 'owner' => owner_of($preleadManagers[$pid] ?? []), 'source' => $source($par['first_contact'] ?? null),
        'trafficOrigin' => null, 'email' => $email, 'phone' => $phone, 'contactPerson' => $contactPerson,
        'createdAt' => $createdAt, 'archived' => (int)$p['archived'] === 1, 'categories' => array_keys($categories),
        'interestNote' => implode("\n", $note), 'timeline' => $timeline, 'offerId' => $offerByPrelead[$pid] ?? null, 'oldStatus' => $oldStatus,
    ];
    $leads[$pid]['trafficOrigin'] = $campaign !== null ? strtolower($campaign) : null;
}

// price offers: fold into their lead (or client record)
$clientOfferTimeline = []; // client oldId -> entries
$orphanOffers = [];
foreach ($offerRows as $o) {
    $oid = (int)$o['id'];
    $ocode = vt_clean($o['code']) ?? ('CP' . $oid);
    $newState = VT_OFFER_STATE[(string)$o['status_code']] ?? null;
    if ($newState === null) $report->warn('offers', "{$ocode}: unknown status {$o['status_code']}");
    $preleadOld = array_search($oid, $offerByPrelead, true);
    $targetLead = $preleadOld !== false ? $leads[$preleadOld] ?? null : null;
    $targetClient = pick_org($offerOrgs[$oid] ?? []);
    if ($targetLead === null && $targetClient === null) {
        $orphanOffers[] = ['code' => $ocode, 'status' => $o['status_code'], 'createdAt' => $o['created_at'], 'history' => count($offerHistory[$oid] ?? [])];
        $report->skip('offers', 'no prelead and no named organization (not imported)', $ocode);
        continue;
    }

    $filesById = [];
    foreach ($offerFilesRows[$oid] ?? [] as $f) {
        $rec = register_file('offer', $f);
        if ($rec) $filesById[(int)$f['id']] = $rec;
    }
    $statusName = VT_OFFER_STATUS_NAMES[(string)$o['status_code']] ?? (string)$o['status_code'];
    $offerEntry = [
        'id' => "te-vt-offer-{$oid}", 'type' => 'offer', 'timestamp' => $o['created_at'], 'title' => 'Cenová ponuka ' . $ocode,
        'content' => implode("\n", array_filter(['Stav: ' . $statusName, $o['order_number'] ? 'Číslo objednávky: ' . $o['order_number'] : null, 'Pôvodný CRM: ' . $ocode])),
        'author' => null, 'attachments' => array_values($filesById),
    ];
    [$hist, $skippedMarkers] = convert_history($offerHistory[$oid] ?? [], [
        'prefix' => 'oh', 'statusLabel' => VT_OFFER_STATUS_NAMES, 'statusTitle' => 'Stav cenovej ponuky', 'files' => [], 'mails' => [],
        'statusContent' => fn($prev, $label, $row) => $ocode . ': ' . $label,
    ]);
    $report->count('offer history rows without content (markers, uploads, updates)', $skippedMarkers);
    // file_upload rows of an offer are folded into the offer entry above
    $hist = array_values(array_filter($hist, fn($e) => !str_starts_with((string)$e['title'], 'Súbor:')));
    foreach ($hist as &$h) if ($h['type'] === 'note' && $h['title'] === 'Poznámka') $h['title'] = 'Poznámka k ' . $ocode;
    unset($h);
    $have = [];
    foreach ($hist as $e) if ($e['content'] !== null) $have[note_key($e['content'])] = true;
    foreach ($offerNotes[$oid] ?? [] as $n) {
        $text = vt_text($n['message']);
        if ($text === null || isset($have[note_key($text)])) { $report->count('price_offer__note rows already in history'); continue; }
        $have[note_key($text)] = true;
        $hist[] = ['id' => "te-vt-on-{$n['id']}", 'type' => 'note', 'timestamp' => $n['created_at'], 'title' => 'Poznámka k ' . $ocode, 'content' => $text, 'author' => null];
    }
    $entries = array_merge([$offerEntry], $hist);

    if ($targetLead !== null) {
        $pidTarget = $targetLead['oldId'];
        $leads[$pidTarget]['timeline'] = array_merge($leads[$pidTarget]['timeline'], $entries);
        $leads[$pidTarget]['offerCode'] = $ocode;
        // the prelead's final state comes from its offer once it got that far
        if ($newState !== null && in_array($leads[$pidTarget]['oldStatus'], ['price_offer_sent', 'price_offer_in_progress'], true)) {
            $leads[$pidTarget]['status'] = $newState;
        } elseif ($newState !== null && $leads[$pidTarget]['status'] !== $newState) {
            $report->warn('offers', "{$ocode}: offer is {$o['status_code']} but lead {$leads[$pidTarget]['code']} stays {$leads[$pidTarget]['status']} (prelead status {$leads[$pidTarget]['oldStatus']})");
        }
        // offer params that differ from the prelead's
        $diff = [];
        $opar = $offerParams[$oid] ?? [];
        $ppar = $preleadParams[$pidTarget] ?? [];
        foreach ([
            'Produkt' => 'product_name', 'Popis produktu' => 'product_description', 'Miesto realizácie' => 'location', 'Typ projektu' => 'project_type',
            'Plocha (m²)' => 'area_size', 'Termín realizácie' => 'deadline', 'Individuálne spracovanie' => 'custom_processing',
            'Detail individuálneho spracovania' => 'custom_processing_detail', 'Katastrálne územie' => 'cadastral_area', 'Číslo parcely' => 'parcel_number',
        ] as $label => $k) {
            if (isset($opar[$k]) && ($ppar[$k] ?? null) !== $opar[$k]) $diff[] = "{$label}: {$opar[$k]}";
        }
        if ($diff) $leads[$pidTarget]['interestNote'] .= "\n\nZ cenovej ponuky:\n" . implode("\n", $diff);
    } else {
        $clientOfferTimeline[$targetClient] = array_merge($clientOfferTimeline[$targetClient] ?? [], $entries);
        $report->count('offers attached to a client record (no prelead)');
    }
    $report->count('offers folded in');
}

// ── 3. organizations -> clients ──────────────────────────────────────────────

$orgHistoryOther = group_by(q("SELECT * FROM price_offer__organization_history WHERE timeline_code IS NULL ORDER BY id"), 'organization_id');
$clients = [];
$leadsByOrg = [];
foreach ($leads as $l) if ($l['clientId']) $leadsByOrg[(int)substr($l['clientId'], strlen('client-vt-'))][] = $l;
$emailsSeen = [];
foreach ($orgRows as $o) {
    $oid = (int)$o['id'];
    $name = vt_clean($o['name']);
    if ($name === null) { $report->skip('clients', 'organization without a name (placeholder)', $oid); continue; }
    $c = $orgContact[$oid] ?? null;
    $b = $orgBilling[$oid] ?? null;
    $isCompany = $b && (int)$b['is_company'] === 1;
    $contactPerson = $c ? vt_clean(trim(($c['first_name'] ?? '') . ' ' . ($c['last_name'] ?? ''))) : null;
    if ($contactPerson !== null && mb_strtolower($contactPerson) === mb_strtolower($name)) $contactPerson = null;
    $email = $c ? vt_clean($c['email']) : null;
    if (is_company_address($email)) {
        $internalOrgs[$oid] = $email;
        $report->warn('clients', "organization {$oid} ({$name}): contact e-mail {$email} is a company address - e-mail left empty and its filed mail not imported");
        $email = null;
    }
    if ($email !== null) {
        $k = strtolower($email);
        if (isset($emailsSeen[$k])) $report->warn('clients', "e-mail {$email} is on organizations {$emailsSeen[$k]} and {$oid}");
        else $emailsSeen[$k] = $oid;
    }
    $types = json_decode((string)$o['type_code'], true);
    if (is_string($types)) $types = json_decode($types, true);
    $category = null;
    $cats = [];
    foreach (is_array($types) ? $types : [] as $t) {
        if (isset(VT_CLIENT_CATEGORY[$t])) $category ??= VT_CLIENT_CATEGORY[$t];
        foreach (VT_CATEGORY[$t] ?? [] as $cn) $cats[$cn] = true;
    }
    foreach (explode(', ', (string)($orgParams[$oid]['product_type'] ?? '')) as $label) {
        foreach (['Strešné krytiny' => 'product_type_1', 'Výroba gresových porcelánových doplnkov' => 'product_type_2', 'Dlažby a obklady interier' => 'product_type_3', 'Dlažby a obklady exterier' => 'product_type_4'] as $l => $code) {
            if ($label === $l) foreach (VT_CATEGORY[$code] as $cn) $cats[$cn] = true;
        }
    }
    $own = $leadsByOrg[$oid] ?? [];
    $owner = $own ? ($own[0]['owner'] ?? '') : '';
    foreach ($own as $l) if (($l['owner'] ?? '') !== '') { $owner = $l['owner']; break; }
    $src = $orgParams[$oid]['first_contact'] ?? ($own[0]['source'] ?? VT_FALLBACK_SOURCE);

    $timeline = $clientOfferTimeline[$oid] ?? [];
    if (isset($internalOrgs[$oid])) {
        $timeline[] = ['id' => "te-vt-ia-{$oid}", 'type' => 'note', 'timestamp' => $o['created_at'], 'title' => 'Firemná adresa v pôvodnom CRM', 'content' => "Kontaktný e-mail tohto záznamu bol firemná adresa {$internalOrgs[$oid]}. Vynechaná, aby sa k zákazníkovi nefilovala firemná pošta.", 'author' => null];
    }
    foreach ($orgHistoryOther[$oid] ?? [] as $h) {
        $timeline[] = ['id' => "te-vt-oc-{$h['id']}", 'type' => 'note', 'timestamp' => $h['date'] ?: $h['created_at'], 'title' => 'Klient založený v pôvodnom CRM', 'content' => null, 'author' => author_of($h['user_id'])];
    }
    foreach ($orgDelivery[$oid] ?? [] as $d) {
        $line = trim(implode(', ', array_filter([trim(($d['address'] ?? '') . ' ' . ($d['building'] ?? '')), trim(($d['zip_code'] ?? '') . ' ' . ($d['city'] ?? '')), $d['country'] ?? ''])), ', ');
        if ($line !== '') $timeline[] = ['id' => "te-vt-da-{$d['id']}", 'type' => 'note', 'timestamp' => $d['created_at'], 'title' => 'Dodacia adresa', 'content' => $line, 'author' => null];
    }

    $country = $b ? vt_clean($b['country']) : null;
    $clients[] = [
        'id' => "client-vt-{$oid}", 'oldId' => $oid, 'name' => mb_substr($name, 0, 150), 'clientType' => $isCompany ? 'business' : 'person',
        'owner' => $owner, 'source' => $src, 'email' => $email, 'phone' => $c ? vt_clean($c['phone']) : null, 'contactPerson' => $contactPerson,
        'companyId' => $b ? vt_clean($b['ico']) : null, 'taxId' => $b ? vt_clean($b['dic']) : null, 'vatId' => $b ? vt_clean($b['icdph']) : null,
        'street' => $b ? vt_clean(trim(($b['address'] ?? '') . ' ' . ($b['building'] ?? ''))) : null,
        'postalCode' => $b ? vt_clean($b['zip_code']) : null, 'city' => $b ? vt_clean($b['city']) : null,
        'country' => $country !== null ? (VT_COUNTRY[strtoupper($country)] ?? $country) : null,
        'createdAt' => substr((string)$o['created_at'], 0, 10), 'archived' => (int)$o['archived'] === 1,
        'clientCategory' => $category, 'categories' => array_keys($cats), 'timeline' => $timeline,
    ];
}
$clientIds = array_flip(array_column($clients, 'id'));
foreach ($leads as &$l) {
    if ($l['clientId'] !== null && !isset($clientIds[$l['clientId']])) { $report->warn('leads', "{$l['code']}: client {$l['clientId']} was not imported"); $l['clientId'] = null; }
}
unset($l);

if ($want('clients')) {
    vt_json_write("{$outDir}/clients.json", $clients);
    $report->set('clients', count($clients));
}
if ($want('leads')) {
    $out = array_map(function ($l) {
        unset($l['offerId'], $l['oldStatus'], $l['offerCode']);
        return $l;
    }, array_values($leads));
    vt_json_write("{$outDir}/leads.json", $out);
    $report->set('leads', count($out));
    $report->set('leads archived', count(array_filter($out, fn($l) => $l['archived'])));
    $report->set('lead timeline entries', array_sum(array_map(fn($l) => count($l['timeline']), $out)));
    $byStatus = [];
    foreach ($out as $l) $byStatus[$l['status']] = ($byStatus[$l['status']] ?? 0) + 1;
    foreach ($byStatus as $s => $n) $report->set("leads in state: {$s}", $n);
}

// ── 4. zákazky -> projects ───────────────────────────────────────────────────

$projects = [];
if ($want('projects')) {
    $leadParams = load_params('lead___lead_to_param', 'lead_id');
    $leadManagers = group_by(q('SELECT * FROM lead___lead_to_manager ORDER BY id'), 'lead_id');
    $leadOrgs = group_by(q('SELECT * FROM lead___lead_to_organization ORDER BY id'), 'lead_id');
    $leadHistory = group_by(q('SELECT * FROM lead__history'), 'lead_id');
    $leadNotes = group_by(q('SELECT * FROM lead__note WHERE archived = 0 ORDER BY id'), 'lead_id');
    $leadFilesRows = [];
    $offerOfLead = [];
    foreach ($offerRows as $o) if ($o['created_lead_id']) $offerOfLead[(int)$o['created_lead_id']] = (int)$o['id'];
    $statusLabels = VT_LEAD_STATUS_LABEL;
    foreach (q('SELECT * FROM lead ORDER BY id') as $z) {
        $zid = (int)$z['id'];
        $par = $leadParams[$zid] ?? [];
        $code = vt_clean($z['code']) ?? ('L' . $zid);
        $orgId = pick_org($leadOrgs[$zid] ?? []);
        $chainLead = null;
        if (isset($offerOfLead[$zid])) {
            $pre = array_search($offerOfLead[$zid], $offerByPrelead, true);
            if ($pre !== false && isset($leads[$pre])) $chainLead = $leads[$pre];
        }
        if ($orgId === null && $chainLead && $chainLead['clientId']) $orgId = (int)substr($chainLead['clientId'], strlen('client-vt-'));
        $display = ($orgId !== null ? vt_clean($orgById[$orgId]['name']) : null) ?? vt_clean($par['contact_name'] ?? null) ?? ($chainLead['name'] ?? null);
        $name = mb_substr(($display !== null ? $display . ' - ' : '') . $code, 0, 200);

        $types = json_decode((string)$z['type_code'], true);
        if (is_string($types)) $types = json_decode($types, true);
        $cats = [];
        foreach (is_array($types) ? $types : [] as $t) foreach (VT_CATEGORY[$t] ?? [] as $cn) $cats[$cn] = true;

        $data = [
            'vt_location' => $par['location'] ?? null, 'vt_contact' => $par['contact_name'] ?? null, 'vt_first_contact' => $par['first_contact'] ?? null,
            'vt_project_type' => $par['project_type'] ?? null, 'vt_area' => isset($par['area_size']) ? $par['area_size'] : null,
            'vt_custom' => $par['custom_processing'] ?? null, 'vt_custom_detail' => $par['custom_processing_detail'] ?? null,
            'vt_deadline' => $par['deadline'] ?? null, 'vt_product' => $par['product_name'] ?? null, 'vt_product_desc' => $par['product_description'] ?? null,
            'vt_cadastral' => $par['cadastral_area'] ?? null, 'vt_parcel' => $par['parcel_number'] ?? null,
            'vt_product_types' => array_keys($cats) ?: null,
        ];
        $data = array_filter($data, fn($v) => $v !== null);

        [$timeline, $skippedMarkers] = convert_history($leadHistory[$zid] ?? [], [
            'prefix' => 'lh', 'statusLabel' => array_intersect_key($statusLabels, array_flip(['new', 'dohodnute_stretnutie', 'obhliadka', 'konzultacia', 'zameranie', 'vypracovanie_cenovej_ponuky', 'canceled'])),
            'statusTitle' => 'Zmena stavu', 'files' => [], 'mails' => [],
            'statusContent' => fn($prev, $label, $row) => ($prev !== null ? $prev . ' → ' : '') . $label,
        ]);
        $report->count('zákazka history rows without content (markers, system rows)', $skippedMarkers);
        $have = [];
        foreach ($timeline as $e) if ($e['content'] !== null) $have[note_key($e['content'])] = true;
        foreach ($leadNotes[$zid] ?? [] as $n) {
            $text = vt_text($n['message']);
            if ($text === null || isset($have[note_key($text)])) continue;
            $timeline[] = ['id' => "te-vt-ln-{$n['id']}", 'type' => 'note', 'timestamp' => $n['created_at'], 'title' => 'Poznámka', 'content' => $text, 'author' => null];
        }
        $managerNames = [];
        foreach ($leadManagers[$zid] ?? [] as $m) if (!empty($managerUser[(int)$m['manager_id']])) $managerNames[$managerUser[(int)$m['manager_id']]] = true;

        $oldStatus = (string)$z['status_code'];
        if (!isset(VT_LEAD_STATUS_KEY[$oldStatus])) $report->warn('projects', "{$code}: unknown status {$oldStatus}");
        $projects[] = [
            'id' => "proj-vt-{$zid}", 'oldId' => $zid, 'code' => $code, 'name' => $name, 'leadId' => $chainLead['id'] ?? null,
            'clientId' => $orgId !== null && isset($clientIds["client-vt-{$orgId}"]) ? "client-vt-{$orgId}" : null,
            'status' => VT_LEAD_STATUS_KEY[$oldStatus] ?? 'new', 'managers' => array_keys($managerNames), 'data' => $data,
            'createdAt' => substr((string)$z['created_at'], 0, 10), 'archived' => (int)$z['archived'] === 1, 'timeline' => $timeline,
        ];
        if ($chainLead === null) $report->count('zákazky without a lead (no offer/prelead chain)');
        if ($orgId === null) $report->count('zákazky without a client');
    }
    vt_json_write("{$outDir}/projects.json", $projects);
    $report->set('projects', count($projects));
}

// ── 5. customer e-mail history ───────────────────────────────────────────────

if ($want('mail')) {
    $skipOrg = array_flip(array_map(fn($c) => $c['oldId'], $clients));
    $mailFile = fopen("{$outDir}/mail.jsonl", 'wb');
    $old->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);
    $stmt = $old->prepare(
        "SELECT h.id AS hid, h.organization_id, h.timeline_code, h.user_id AS huser, e.id AS eid, e.message_id, e.from_email, e.from_name, e.to_emails,
                e.subject, e.body_plain, e.body_html, e.date AS edate, e.direction, ate.folder, ate.uid, acc.imap_username, acc.email AS acc_email,
                (SELECT COUNT(*) FROM email_reader__account_to_email x WHERE x.email_id = e.id) AS links
         FROM price_offer__organization_history h
         JOIN email_reader__email e ON e.id = h.history_custom_id
         JOIN email_reader__account_to_email ate ON ate.id = (SELECT MIN(y.id) FROM email_reader__account_to_email y WHERE y.email_id = e.id)
         JOIN email_reader__account acc ON acc.id = ate.account_id
         WHERE h.timeline_code IN ('email_received', 'email_sent')
         ORDER BY h.id"
    );
    $stmt->execute();
    $senders = [];
    $n = 0;
    while ($m = $stmt->fetch()) {
        $orgId = (int)$m['organization_id'];
        if (!isset($skipOrg[$orgId])) { $report->skip('mail', 'organization was not imported', $m['hid']); continue; }
        if (isset($internalOrgs[$orgId])) { $report->skip('mail', "record's contact address is a company address (internal mail)", $orgId); continue; }
        $plain = (string)$m['body_plain'];
        $body = trim($plain) !== '' ? $plain : vt_html_to_text((string)$m['body_html']);
        $body = str_replace(["\r\n", "\r"], "\n", $body);
        $body = trim((string)preg_replace(["/[ \t]+\n/", "/\n{3,}/"], ["\n", "\n\n"], $body));
        if (trim($plain) === '' && $body !== '') $report->count('mails with an HTML-only body (converted to text)');
        if (mb_strlen($body) > 60000) { $body = mb_substr($body, 0, 60000); $report->count('mails with a body cut at 60000 characters'); }
        $from = strtolower(trim((string)$m['from_email']));
        $fromDomain = substr((string)strrchr($from, '@'), 1);
        $internalSender = $fromDomain !== '' && isset($ownDomains[$fromDomain]);
        $outgoing = $m['direction'] === 'outgoing' || $m['timeline_code'] === 'email_sent' || $internalSender;
        if ($outgoing && $m['timeline_code'] === 'email_received' && $m['direction'] !== 'outgoing') $report->count('mails from a company address, imported as outgoing');
        $toFirst = trim(explode(',', (string)$m['to_emails'])[0] ?? '');
        $subject = vt_clean($m['subject']) ?? '(Bez predmetu)';
        $line = [
            'id' => vt_mail_event_id((string)$m['imap_username'], (string)$m['folder'], (int)$m['uid']),
            'clientId' => "client-vt-{$orgId}", 'timestamp' => $m['edate'], 'title' => mb_substr($subject, 0, 255),
            'content' => 'From: ' . trim((string)$m['from_name']) . ' <' . $from . ">\nTo: <" . $toFirst . ">\nSubject: " . $subject,
            'isOutgoing' => $outgoing, 'author' => $outgoing ? ($userByEmail[$from] ?? author_of($m['huser'])) : null, 'mailAccount' => $m['acc_email'],
            'messageId' => mb_substr(trim((string)$m['message_id']), 0, 255), 'body' => $body,
        ];
        fwrite($mailFile, json_encode($line, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE) . "\n");
        $n++;
        if (!$outgoing && !isset($own[$from])) $senders[$from] = ($senders[$from] ?? 0) + 1;
        if ((int)$m['links'] > 1) $report->count('mails that sit in several mailboxes (first one used)');
    }
    fclose($mailFile);
    $old->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, true);
    arsort($senders);
    $report->set('mail messages', $n);
    $report->note('Top 15 senders of filed mail (newsletters to clean up?): ' . implode('; ', array_map(fn($a, $c) => "{$a} ({$c})", array_keys(array_slice($senders, 0, 15, true)), array_slice($senders, 0, 15, true))));
}

// ── 6. products ──────────────────────────────────────────────────────────────

if ($want('products')) {
    $units = ['-' => 'ks', '' => 'ks', 'box' => 'box', 'ks0' => 'ks'];
    $products = [];
    $seen = [];
    foreach (q('SELECT * FROM product__temp ORDER BY id') as $p) {
        $mrp = trim((string)$p['CISLO']);
        if ($mrp === '' || isset($seen[$mrp])) { $report->skip('products', $mrp === '' ? 'empty CISLO' : 'duplicate CISLO', $mrp ?: $p['id']); continue; }
        $seen[$mrp] = true;
        $codes = [];
        foreach (['KOD', 'KOD1', 'KOD2', 'KOD3'] as $k) {
            $c = vt_clean($p[$k] ?? null);
            if ($c !== null && !in_array($c, $codes, true)) $codes[] = $c;
        }
        $mj = strtolower(trim((string)$p['MJ']));
        $prices = [];
        foreach ([1, 2, 3, 4, 5] as $i) if ((float)$p["CENA{$i}"] > 0) $prices[$i] = (float)$p["CENA{$i}"];
        $products[] = [
            'id' => "whi-vt-{$mrp}", 'sku' => $mrp, 'externalId' => $mrp, 'name' => mb_substr(vt_clean($p['NAZOV']) ?? $mrp, 0, 255),
            'altCodes' => $codes, 'unit' => $units[$mj] ?? $mj, 'vatRate' => $p['SADZBADPH'] !== null ? (float)$p['SADZBADPH'] : null,
            'purchasePrice' => (float)$p['CENAMJ'], 'sellPrice' => (float)$p['CENA1'], 'prices' => $prices,
            'packQuantity' => (float)$p['BALENIE'] > 0 ? (float)$p['BALENIE'] : null, 'description' => vt_text($p['POZNAMKA']),
            'stock' => (float)$p['POCETMJ'], 'reserved' => (float)$p['POCREZMJ'], 'minStock' => (float)$p['MINIMUM'], 'optimalStock' => (float)$p['NORMA'],
            'category' => vt_clean($p['KATEGORY']), 'location' => vt_clean($p['POZICE']), 'manufacturer' => vt_clean($p['MANUFACTURER']),
        ];
        if ($mj === '' ) $report->count('products with no unit (set to ks)');
    }
    vt_json_write("{$outDir}/products.json", $products);
    $report->set('products', count($products));
    $report->set('products with VAT 0 %', count(array_filter($products, fn($p) => $p['vatRate'] !== null && $p['vatRate'] == 0)));
    $report->set('products with stock', count(array_filter($products, fn($p) => $p['stock'] != 0)));
}

// ── 7. leftovers + file manifest ─────────────────────────────────────────────

if ($want('leftovers')) {
    $leftovers = [
        'events' => q('SELECT id, name, date, date_end, completed, archived, description FROM event ORDER BY id'),
        'orphanOffers' => $orphanOffers,
        'bankAccounts' => q('SELECT bank_name, currency, bank_account_no, bank_code, iban, swift FROM admin__bank_account'),
        'companyData' => q('SELECT `key`, `value` FROM admin__company_data'),
        'emailTemplates' => q('SELECT name, language, subject, body FROM email__template'),
        'emailSignatures' => q('SELECT name, `text` FROM email__template_signature'),
        'mailAccounts' => q('SELECT id, name, email, imap_host, imap_port, imap_encryption, imap_username, smtp_host, smtp_port, smtp_encryption, smtp_username, user_id, active FROM email_reader__account'),
    ];
    vt_json_write("{$outDir}/leftovers.json", $leftovers);
    $report->set('events (calendar)', count($leftovers['events']));
    $report->set('offers not imported (no home)', count($orphanOffers));
    if (!$leftovers['companyData']) $report->note('admin__company_data is empty in this dump: the company billing data (PLAN B5) has to be entered by hand.');
    if (!$leftovers['emailTemplates'] && !$leftovers['emailSignatures']) $report->note('No e-mail templates or signatures in the old CRM.');
}
vt_json_write("{$outDir}/files.json", array_values($filesManifest));
$report->set('files in manifest', count($filesManifest));
$report->set('files in manifest, total MB', (int)round(array_sum(array_column($filesManifest, 'size')) / 1048576));

vt_json_write("{$outDir}/extract-report.json", $report->toArray());
file_put_contents("{$outDir}/extract-report.md", $report->toMarkdown('Villatesta extract'));
echo $report->toMarkdown('Villatesta extract');
