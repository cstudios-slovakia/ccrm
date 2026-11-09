<?php
/**
 * Newsletter audience (docs/NEWSLETTER.md C5).
 *
 * Turns a campaign's `Audience` (clients are required, leads / employees / extra addresses are
 * optional additions) into one row per e-mail address. The server decides who receives mail, both
 * for the live count and when sending starts (B2.4), never the browser.
 *
 * Almost everything here is pure so that scripts/test-newsletter.php can run it without a database:
 *
 *   ccrm_newsletter_parse_extra()            pasted text -> addresses ("Name <a@b.c>", , ; new lines)
 *   ccrm_newsletter_first_name()             "Ing. Peter Novák" -> "Peter"
 *   ccrm_newsletter_group_client_profiles()  which lead rows belong to which client
 *   ccrm_newsletter_expand_categories()      chosen client categories + all descendants
 *   ccrm_newsletter_build_rows()             dedupe (client > lead > employee > extra), skips
 *   ccrm_newsletter_audience_preview()       the AudiencePreview shape of a resolved audience
 *
 * Only ccrm_newsletter_collect_candidates() / ccrm_newsletter_resolve_audience() touch the database.
 */

if (!function_exists('ccrm_newsletter_resolve_audience')) {

    /** Source precedence when one address appears several times: the first source wins. */
    function ccrm_newsletter_source_rank(string $source): int {
        $rank = ['client' => 0, 'lead' => 1, 'employee' => 2, 'extra' => 3];
        return $rank[$source] ?? 9;
    }

    function ccrm_newsletter_default_audience(): array {
        return [
            'clients' => ['mode' => 'all', 'categoryIds' => [], 'clientIds' => []],
            'leads' => ['enabled' => false, 'statuses' => [], 'interestCategories' => []],
            'employees' => ['enabled' => false],
            'extra' => ['enabled' => false, 'raw' => ''],
        ];
    }

    /** @return string[] unique, trimmed, non-empty strings (each at most 100 characters) */
    function ccrm_newsletter_string_list($raw, int $max = 500): array {
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $v) {
            if (!is_string($v) && !is_int($v)) {
                continue;
            }
            $s = trim((string)$v);
            if ($s === '' || mb_strlen($s, 'UTF-8') > 100) {
                continue;
            }
            $out[$s] = true;
            if (count($out) >= $max) {
                break;
            }
        }
        return array_map('strval', array_keys($out));
    }

    /** Any decoded JSON -> a well-formed Audience. Never throws. */
    function ccrm_newsletter_normalize_audience($raw): array {
        $a = ccrm_newsletter_default_audience();
        if (!is_array($raw)) {
            return $a;
        }
        $clients = is_array($raw['clients'] ?? null) ? $raw['clients'] : [];
        $a['clients'] = [
            'mode' => (($clients['mode'] ?? 'all') === 'pick') ? 'pick' : 'all',
            'categoryIds' => ccrm_newsletter_string_list($clients['categoryIds'] ?? []),
            'clientIds' => ccrm_newsletter_string_list($clients['clientIds'] ?? []),
        ];
        $leads = is_array($raw['leads'] ?? null) ? $raw['leads'] : [];
        $a['leads'] = [
            'enabled' => !empty($leads['enabled']),
            'statuses' => ccrm_newsletter_string_list($leads['statuses'] ?? []),
            'interestCategories' => ccrm_newsletter_string_list($leads['interestCategories'] ?? []),
        ];
        $employees = is_array($raw['employees'] ?? null) ? $raw['employees'] : [];
        $a['employees'] = ['enabled' => !empty($employees['enabled'])];
        $extra = is_array($raw['extra'] ?? null) ? $raw['extra'] : [];
        $rawText = is_string($extra['raw'] ?? null) ? $extra['raw'] : '';
        $a['extra'] = [
            'enabled' => !empty($extra['enabled']),
            'raw' => mb_substr($rawText, 0, 200000, 'UTF-8'),
        ];
        return $a;
    }

    /**
     * C5: valid when clients.mode is 'all', or 'pick' with at least one category or client.
     * Drafts may be saved while invalid; sending refuses.
     */
    function ccrm_newsletter_audience_valid(array $audience): bool {
        $c = $audience['clients'] ?? [];
        if (($c['mode'] ?? 'all') === 'all') {
            return true;
        }
        return !empty($c['categoryIds']) || !empty($c['clientIds']);
    }

    // -----------------------------------------------------------------------------------
    // Addresses and names
    // -----------------------------------------------------------------------------------

    /** Trim, drop wrapping <>, quotes and a mailto: prefix, lower-case. May still be invalid. */
    function ccrm_newsletter_normalize_email($raw): string {
        $s = trim((string)$raw);
        $s = trim($s, " \t\r\n\"'<>");
        if (stripos($s, 'mailto:') === 0) {
            $s = substr($s, 7);
        }
        return mb_strtolower(trim($s), 'UTF-8');
    }

    function ccrm_newsletter_is_valid_email(string $email): bool {
        return $email !== '' && strlen($email) <= 190 && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    }

    /**
     * Split pasted text into entries on new lines, commas and semicolons, but not inside
     * "double quotes" or <angle brackets> (so `"Novák, Peter" <p@x.sk>` stays one entry).
     *
     * @return string[]
     */
    function ccrm_newsletter_split_extra(string $raw): array {
        $out = [];
        $cur = '';
        $quote = false;
        $angle = false;
        $len = strlen($raw);
        for ($i = 0; $i < $len; $i++) {
            $ch = $raw[$i];
            if ($ch === '"' && !$angle) {
                $quote = !$quote;
            } elseif ($ch === '<' && !$quote) {
                $angle = true;
            } elseif ($ch === '>' && !$quote) {
                $angle = false;
            }
            $isSep = !$quote && !$angle && ($ch === "\n" || $ch === "\r" || $ch === ',' || $ch === ';');
            if ($isSep) {
                if (trim($cur) !== '') {
                    $out[] = trim($cur);
                }
                $cur = '';
                continue;
            }
            $cur .= $ch;
        }
        if (trim($cur) !== '') {
            $out[] = trim($cur);
        }
        return $out;
    }

    /**
     * Pasted text -> [['email' => normalised (maybe invalid), 'name' => ''], ...] in input order.
     * Accepts `a@b.c` and `Name <a@b.c>`. Validity is decided later by ccrm_newsletter_build_rows().
     */
    function ccrm_newsletter_parse_extra(string $raw): array {
        $out = [];
        foreach (ccrm_newsletter_split_extra($raw) as $token) {
            $name = '';
            $addr = $token;
            if (preg_match('/^(.*)<\s*([^<>]*?)\s*>\s*$/su', $token, $m)) {
                $name = trim(trim($m[1]), " \t\"'");
                $addr = $m[2];
            }
            $email = ccrm_newsletter_normalize_email($addr);
            if ($email === '') {
                continue;
            }
            $out[] = ['email' => $email, 'name' => mb_substr($name, 0, 200, 'UTF-8')];
        }
        return $out;
    }

    /** Academic and professional titles that precede a name (Slovak, Czech, Hungarian, English). */
    function ccrm_newsletter_title_words(): array {
        // Safe to strip even without a dot ("Dr Peter").
        $plain = ['ing', 'mgr', 'bc', 'bca', 'mudr', 'mvdr', 'judr', 'phdr', 'rndr', 'paeddr', 'thdr', 'dr', 'prof', 'doc', 'mba', 'phd', 'msc'];
        // Only recognised with a dot ("Art." is a title, "Art" is a first name).
        $dotted = array_merge($plain, ['arch', 'art', 'artd', 'dis', 'csc', 'dipl']);
        return ['plain' => $plain, 'dotted' => $dotted];
    }

    /** True when the token is one or more titles: "Ing.", "dr", "Ing.arch.", "PhD.". */
    function ccrm_newsletter_is_title_token(string $token): bool {
        $t = mb_strtolower(trim($token, " \t,;"), 'UTF-8');
        if ($t === '') {
            return true;
        }
        $words = ccrm_newsletter_title_words();
        $parts = array_values(array_filter(explode('.', $t), fn($p) => $p !== ''));
        if (!$parts) {
            return false;
        }
        $allowed = strpos($t, '.') !== false ? $words['dotted'] : $words['plain'];
        foreach ($parts as $p) {
            if (!in_array($p, $allowed, true)) {
                return false;
            }
        }
        return true;
    }

    /**
     * First name from a person's full name: the first word that is not a title.
     * "Ing. Peter Novák" -> "Peter", "Mgr.Anna Kováčová, PhD." -> "Anna", "Acme s.r.o." -> "Acme".
     * Empty for an empty name or one that is only titles. Works on one script at a time: for names
     * written surname-first the first word is returned as written, nobody can tell them apart.
     */
    function ccrm_newsletter_first_name($fullName): string {
        $name = trim((string)$fullName);
        if ($name === '' || strpos($name, '@') !== false) {
            return '';
        }
        // "Ing.Peter" has no space after the title dot.
        $words = ccrm_newsletter_title_words();
        $alt = implode('|', array_map('preg_quote', $words['dotted']));
        $name = preg_replace('/^(?:\s*(?:' . $alt . ')\.)+(?=\p{L})/iu', '', $name);
        foreach (preg_split('/\s+/u', $name, -1, PREG_SPLIT_NO_EMPTY) as $token) {
            if (ccrm_newsletter_is_title_token($token)) {
                continue;
            }
            return trim($token, " \t,;");
        }
        return '';
    }

    /** The four merge values of C5 step 7 / C9 for one address. */
    function ccrm_newsletter_merge_values(string $name, string $firstName, string $company, string $email): array {
        return ['name' => $name, 'first_name' => $firstName, 'company' => $company, 'email' => $email];
    }

    // -----------------------------------------------------------------------------------
    // Clients and categories
    // -----------------------------------------------------------------------------------

    /** A client is a row with a `client-*` id or a positive adjustment (read_scope.php: ccrm_is_client_record). */
    function ccrm_newsletter_is_client_row(array $row): bool {
        return strpos((string)($row['id'] ?? ''), 'client-') === 0 || (float)($row['adjustment'] ?? 0) > 0;
    }

    /**
     * Which lead rows belong to which client, the way src/utils/leadClient.ts does it: an explicit
     * `client_id` that points at a client row wins; where it is empty (or points at a row that is
     * gone) the lead belongs to the first client of the same name. Archived rows are NOT dropped
     * here, because a row belongs to a profile whether or not it is archived.
     *
     * @param array[] $rows each: id, name, client_id, adjustment (others are passed through)
     * @return array{profiles: array<string, array{client: array, members: array[]}>, memberOf: array<string, string>}
     */
    function ccrm_newsletter_group_client_profiles(array $rows): array {
        $clients = [];
        $byName = [];
        foreach ($rows as $r) {
            $id = (string)($r['id'] ?? '');
            if ($id === '' || $id === 'unassigned-docs' || !ccrm_newsletter_is_client_row($r)) {
                continue;
            }
            $clients[$id] = $r;
            $key = mb_strtolower(trim((string)($r['name'] ?? '')), 'UTF-8');
            if ($key !== '' && !isset($byName[$key])) {
                $byName[$key] = $id;
            }
        }
        $profiles = [];
        $memberOf = [];
        foreach ($clients as $id => $c) {
            $profiles[$id] = ['client' => $c, 'members' => []];
            $memberOf[$id] = $id;
        }
        foreach ($rows as $r) {
            $id = (string)($r['id'] ?? '');
            if ($id === '' || $id === 'unassigned-docs' || isset($clients[$id])) {
                continue;
            }
            $linked = trim((string)($r['client_id'] ?? ''));
            $target = null;
            if ($linked !== '' && isset($clients[$linked])) {
                $target = $linked;
            } else {
                $key = mb_strtolower(trim((string)($r['name'] ?? '')), 'UTF-8');
                if ($key !== '' && isset($byName[$key])) {
                    $target = $byName[$key];
                }
            }
            if ($target !== null) {
                $profiles[$target]['members'][] = $r;
                $memberOf[$id] = $target;
            }
        }
        return ['profiles' => $profiles, 'memberOf' => $memberOf];
    }

    /**
     * The chosen category ids plus every descendant (client_categories.parent_id tree).
     *
     * @param string[] $ids
     * @param array[] $categoryRows each: id, parent_id
     * @return array<string, true> set of ids
     */
    function ccrm_newsletter_expand_categories(array $ids, array $categoryRows): array {
        $children = [];
        foreach ($categoryRows as $c) {
            $parent = (string)($c['parent_id'] ?? '');
            if ($parent !== '') {
                $children[$parent][] = (string)$c['id'];
            }
        }
        $set = [];
        $queue = array_map('strval', $ids);
        while ($queue) {
            $id = array_shift($queue);
            if ($id === '' || isset($set[$id])) {
                continue;
            }
            $set[$id] = true;
            foreach ($children[$id] ?? [] as $child) {
                $queue[] = $child;
            }
        }
        return $set;
    }

    /**
     * The client profiles an audience selects.
     *
     * @param array $grouped result of ccrm_newsletter_group_client_profiles()
     * @param array $clientsPart Audience.clients
     * @param array<string, true> $categorySet expanded category ids (pick mode)
     * @return array<string, array> clientId => profile, in row order; archived clients are left out
     */
    function ccrm_newsletter_select_profiles(array $grouped, array $clientsPart, array $categorySet): array {
        $picked = [];
        if (($clientsPart['mode'] ?? 'all') === 'pick') {
            foreach ($clientsPart['clientIds'] ?? [] as $cid) {
                // A chosen id may be the client or a lead of it: both select the whole profile.
                $target = $grouped['memberOf'][(string)$cid] ?? null;
                if ($target !== null) {
                    $picked[$target] = true;
                }
            }
        }
        $out = [];
        foreach ($grouped['profiles'] as $id => $profile) {
            if (!empty($profile['client']['archived'])) {
                continue;
            }
            if (($clientsPart['mode'] ?? 'all') === 'pick' && !isset($picked[$id])) {
                $inCategory = false;
                foreach (array_merge([$profile['client']], $profile['members']) as $r) {
                    $cat = (string)($r['client_category_id'] ?? '');
                    if ($cat !== '' && isset($categorySet[$cat])) {
                        $inCategory = true;
                        break;
                    }
                }
                if (!$inCategory) {
                    continue;
                }
            }
            $out[$id] = $profile;
        }
        return $out;
    }

    // -----------------------------------------------------------------------------------
    // Candidates -> rows
    // -----------------------------------------------------------------------------------

    /**
     * Name and merge values for one CRM row. A person client with no contact person is the person
     * themselves, so their own name gives the first name; a company never does.
     */
    function ccrm_newsletter_lead_candidate(array $row, string $source, string $company): array {
        $contact = trim((string)($row['contact_person'] ?? ''));
        $own = trim((string)($row['name'] ?? ''));
        $display = $contact !== '' ? $contact : $own;
        $first = ccrm_newsletter_first_name($contact);
        if ($first === '' && $contact === '' && (string)($row['client_type'] ?? '') === 'person') {
            $first = ccrm_newsletter_first_name($own);
        }
        return [
            'source' => $source,
            'email' => (string)($row['email'] ?? ''),
            'name' => $display,
            'lead_id' => (string)($row['id'] ?? ''),
            'employee_id' => null,
            'merge' => ccrm_newsletter_merge_values($display, $first, $company, ''),
        ];
    }

    /** One address per distinct e-mail of a profile's rows, the client record first. */
    function ccrm_newsletter_profile_candidates(array $profile): array {
        $client = $profile['client'];
        $company = trim((string)($client['name'] ?? ''));
        $out = [];
        $hasAddress = false;
        foreach (array_merge([$client], $profile['members']) as $row) {
            if (!empty($row['archived']) || trim((string)($row['email'] ?? '')) === '') {
                continue;
            }
            $hasAddress = true;
            $out[] = ccrm_newsletter_lead_candidate($row, 'client', $company);
        }
        if (!$hasAddress) {
            // Counted as "withoutEmail", never sent.
            $out[] = ['source' => 'client', 'email' => '', 'name' => $company, 'lead_id' => (string)$client['id'], 'employee_id' => null, 'merge' => []];
        }
        return $out;
    }

    /**
     * Dedupe and classify. Precedence client > lead > employee > extra (the first source gives the
     * name and merge values); within a source the input order decides. Invalid addresses and
     * suppressed addresses become `skipped` rows, never sent. An empty address only counts as
     * `withoutEmail`.
     *
     * @param array[] $candidates each: source, email, name, lead_id, employee_id, merge
     * @param array<string, true> $suppressed lower-cased addresses that must not receive newsletters
     * @return array{rows: array[], bySource: array, skipped: array, withoutEmail: int, total: int}
     */
    function ccrm_newsletter_build_rows(array $candidates, array $suppressed): array {
        $indexed = [];
        foreach (array_values($candidates) as $i => $c) {
            $indexed[] = [ccrm_newsletter_source_rank((string)($c['source'] ?? '')), $i, $c];
        }
        usort($indexed, fn($a, $b) => $a[0] <=> $b[0] ?: $a[1] <=> $b[1]);

        $rows = [];
        $seen = [];
        $bySource = ['client' => 0, 'lead' => 0, 'employee' => 0, 'extra' => 0];
        $skipped = ['unsubscribed' => 0, 'invalid' => 0];
        $withoutEmail = 0;
        $total = 0;
        foreach ($indexed as [, , $c]) {
            $email = ccrm_newsletter_normalize_email($c['email'] ?? '');
            if ($email === '') {
                $withoutEmail++;
                continue;
            }
            $email = mb_substr($email, 0, 190, 'UTF-8');
            if (isset($seen[$email])) {
                continue;
            }
            $seen[$email] = true;
            $source = (string)$c['source'];
            $status = 'queued';
            $reason = null;
            if (!ccrm_newsletter_is_valid_email($email)) {
                $status = 'skipped';
                $reason = 'invalid';
            } elseif (isset($suppressed[$email])) {
                $status = 'skipped';
                $reason = 'unsubscribed';
            }
            $merge = is_array($c['merge'] ?? null) ? $c['merge'] : [];
            $merge = ccrm_newsletter_merge_values(
                (string)($merge['name'] ?? $c['name'] ?? ''),
                (string)($merge['first_name'] ?? ''),
                (string)($merge['company'] ?? ''),
                $email
            );
            $name = trim((string)($c['name'] ?? ''));
            $rows[] = [
                'email' => $email,
                'name' => $name !== '' ? $name : null,
                'source' => $source,
                'leadId' => ($c['lead_id'] ?? null) !== null && $c['lead_id'] !== '' ? (string)$c['lead_id'] : null,
                'employeeId' => ($c['employee_id'] ?? null) !== null && $c['employee_id'] !== '' ? (string)$c['employee_id'] : null,
                'merge' => $merge,
                'status' => $status,
                'skipReason' => $reason,
            ];
            if ($status === 'queued') {
                $total++;
                if (isset($bySource[$source])) {
                    $bySource[$source]++;
                }
            } else {
                $skipped[$reason]++;
            }
        }
        return ['rows' => $rows, 'bySource' => $bySource, 'skipped' => $skipped, 'withoutEmail' => $withoutEmail, 'total' => $total];
    }

    /** The AudiencePreview of C4 for a resolved audience (the first 20 queued addresses as sample). */
    function ccrm_newsletter_audience_preview(array $resolved, bool $valid = true): array {
        $sample = [];
        foreach ($resolved['rows'] as $r) {
            if ($r['status'] !== 'queued') {
                continue;
            }
            $sample[] = [
                'email' => $r['email'],
                'name' => (string)($r['name'] ?? ''),
                'source' => $r['source'],
                'merge' => $r['merge'],
            ];
            if (count($sample) >= 20) {
                break;
            }
        }
        return [
            'valid' => $valid,
            'total' => $resolved['total'],
            'bySource' => $resolved['bySource'],
            'skipped' => $resolved['skipped'],
            'withoutEmail' => $resolved['withoutEmail'],
            'sample' => $sample,
        ];
    }

    // -----------------------------------------------------------------------------------
    // Database
    // -----------------------------------------------------------------------------------

    /** @return array<string, true> every suppressed address, lower-cased */
    function ccrm_newsletter_load_suppressed(\PDO $pdo): array {
        $set = [];
        foreach ($pdo->query("SELECT `email` FROM `newsletter_suppressions`")->fetchAll(\PDO::FETCH_COLUMN) as $e) {
            $set[mb_strtolower((string)$e, 'UTF-8')] = true;
        }
        return $set;
    }

    /** All candidate addresses of an audience, in no particular precedence (build_rows orders them). */
    function ccrm_newsletter_collect_candidates(\PDO $pdo, array $audience): array {
        $candidates = [];
        $leadRows = $pdo->query(
            "SELECT `id`, `name`, `email`, `contact_person`, `client_type`, `client_category_id`, `archived`, `status`, `client_id`, `adjustment`
               FROM `leads` ORDER BY `id`"
        )->fetchAll(\PDO::FETCH_ASSOC);
        $grouped = ccrm_newsletter_group_client_profiles($leadRows);

        // 1. Clients (required part)
        $categorySet = [];
        $clientsPart = $audience['clients'];
        if (($clientsPart['mode'] ?? 'all') === 'pick' && $clientsPart['categoryIds']) {
            $cats = $pdo->query("SELECT `id`, `parent_id` FROM `client_categories`")->fetchAll(\PDO::FETCH_ASSOC);
            $categorySet = ccrm_newsletter_expand_categories($clientsPart['categoryIds'], $cats);
        }
        foreach (ccrm_newsletter_select_profiles($grouped, $clientsPart, $categorySet) as $profile) {
            foreach (ccrm_newsletter_profile_candidates($profile) as $c) {
                $candidates[] = $c;
            }
        }

        // 2. Leads: non-archived rows that belong to no client profile
        if (!empty($audience['leads']['enabled'])) {
            $statuses = array_flip($audience['leads']['statuses']);
            $interest = array_map(fn($s) => mb_strtolower($s, 'UTF-8'), $audience['leads']['interestCategories']);
            $interestByLead = [];
            if ($interest) {
                foreach ($pdo->query("SELECT `lead_id`, `category_name` FROM `lead_categories`")->fetchAll(\PDO::FETCH_ASSOC) as $lc) {
                    $interestByLead[(string)$lc['lead_id']][mb_strtolower((string)$lc['category_name'], 'UTF-8')] = true;
                }
            }
            foreach ($leadRows as $row) {
                $id = (string)$row['id'];
                if ($id === 'unassigned-docs' || isset($grouped['memberOf'][$id]) || !empty($row['archived'])) {
                    continue;
                }
                if ($statuses && !isset($statuses[(string)$row['status']])) {
                    continue;
                }
                if ($interest) {
                    $hit = false;
                    foreach ($interest as $cat) {
                        if (isset($interestByLead[$id][$cat])) {
                            $hit = true;
                            break;
                        }
                    }
                    if (!$hit) {
                        continue;
                    }
                }
                $candidates[] = ccrm_newsletter_lead_candidate($row, 'lead', trim((string)$row['name']));
            }
        }

        // 3. Employees: employees and contractors that are still active ("employed")
        if (!empty($audience['employees']['enabled'])) {
            $emps = $pdo->query(
                "SELECT `id`, `name`, `first_name`, `last_name`, `email` FROM `employees`
                  WHERE `kind` IN ('employee', 'contractor') AND `is_active` = 1 ORDER BY `id`"
            )->fetchAll(\PDO::FETCH_ASSOC);
            foreach ($emps as $e) {
                $full = trim(trim((string)$e['first_name']) . ' ' . trim((string)$e['last_name']));
                if ($full === '') {
                    $full = trim((string)$e['name']);
                }
                $first = ccrm_newsletter_first_name((string)$e['first_name'] !== '' ? $e['first_name'] : $full);
                $candidates[] = [
                    'source' => 'employee', 'email' => (string)$e['email'], 'name' => $full,
                    'lead_id' => null, 'employee_id' => (string)$e['id'],
                    'merge' => ccrm_newsletter_merge_values($full, $first, '', ''),
                ];
            }
        }

        // 4. Extra addresses
        if (!empty($audience['extra']['enabled'])) {
            foreach (ccrm_newsletter_parse_extra((string)$audience['extra']['raw']) as $x) {
                $candidates[] = [
                    'source' => 'extra', 'email' => $x['email'], 'name' => $x['name'],
                    'lead_id' => null, 'employee_id' => null,
                    'merge' => ccrm_newsletter_merge_values($x['name'], ccrm_newsletter_first_name($x['name']), '', ''),
                ];
            }
        }
        return $candidates;
    }

    /**
     * C5: the rows of an audience, deduplicated, with suppressed and invalid addresses marked
     * `skipped`. This is what audience_preview shows and what start_send (2A) freezes into
     * `newsletter_recipients`. Each row: email, name, source, leadId, employeeId, merge, status
     * (queued | skipped), skipReason (unsubscribed | invalid | null).
     *
     * @return array{rows: array[], bySource: array, skipped: array, withoutEmail: int, total: int}
     */
    function ccrm_newsletter_resolve_audience(\PDO $pdo, array $audience): array {
        $audience = ccrm_newsletter_normalize_audience($audience);
        return ccrm_newsletter_build_rows(
            ccrm_newsletter_collect_candidates($pdo, $audience),
            ccrm_newsletter_load_suppressed($pdo)
        );
    }
}
