<?php
/**
 * Lint the demo packs (public/api/demo_seed/packs/{sk,hu,en}/<module>.php). No database.
 * Run:  php scripts/test-demo-packs.php   (npm run test:demo-packs)
 *
 * Enforces docs/DEMO-MODE.md C2 and C6 on EVERY pack module it finds:
 *   - the file is data only: `return [...]`, no calls, requires, variables, conditionals
 *   - sk/hu/en have the same files, keys, list lengths, value types and numbers
 *   - no Slovak letters in hu/en, no ő/ű in sk/en, no s.r.o./Kft./Inc. words in the wrong
 *     edition, phone prefixes +421 / +36 / +1 (a record with '_foreign' => true is exempt)
 *   - a text over 25 characters identical in all three editions is "untranslated"
 *     (URLs, e-mail addresses and SKU-like codes are exempt)
 *   - keys named client/project/item/supplier/warehouse/employee/user/owner/assignee(s)/users
 *     hold valid refs that exist in the company pack
 *   - every placeholder in every string resolves, for all four seed combinations
 *     (sk/EUR, hu/HUF, hu/EUR, en/USD)
 *   - fictional contact data (B12): e-mail and URL hosts end in .example; IBANs have a valid
 *     mod-97 checksum; Slovak/Hungarian company IDs pass their own checksums
 *
 * The lint functions are pure and reused by scripts/test-demo-seed.php, which applies the same
 * leakage rules to the rows a seed run wrote. `--self-test` is also run on every normal run: it
 * builds a deliberately broken hu pack in memory and fails if the lint does NOT notice it.
 */

if (!function_exists('demo_lint_run')) {

    $demoSeedDir = dirname(__DIR__) . '/public/api/demo_seed';
    require_once $demoSeedDir . '/helpers.php';

    /** The seed combinations the tests cover (language, currency). */
    function demo_lint_combos(): array {
        return [['sk', 'EUR'], ['hu', 'HUF'], ['hu', 'EUR'], ['en', 'USD']];
    }

    /** Keys whose values are refs (string or list of strings). */
    function demo_lint_ref_keys(): array {
        return ['client', 'project', 'item', 'supplier', 'warehouse', 'employee', 'user', 'owner', 'assignee', 'assignees', 'users'];
    }

    function demo_lint_pack_modules(): array {
        $modules = [];
        foreach (['sk', 'hu', 'en'] as $lang) {
            foreach (glob(dirname(__DIR__) . "/public/api/demo_seed/packs/{$lang}/*.php") ?: [] as $f) {
                $modules[basename($f, '.php')] = true;
            }
        }
        $names = array_keys($modules);
        sort($names);
        return $names;
    }

    /** Every scalar leaf: [['path' => 'clients.C1.name', 'value' => ..., 'foreign' => bool, 'key' => 'name']]. */
    function demo_lint_leaves(array $data, string $path = '', bool $foreign = false): array {
        $out = [];
        if (!array_is_list($data) && ($data['_foreign'] ?? false) === true) {
            $foreign = true;
        }
        foreach ($data as $k => $v) {
            $p = $path === '' ? (string)$k : $path . '.' . $k;
            if (is_array($v)) {
                $out = array_merge($out, demo_lint_leaves($v, $p, $foreign));
            } else {
                $out[] = ['path' => $p, 'value' => $v, 'foreign' => $foreign, 'key' => (string)$k];
            }
        }
        return $out;
    }

    function demo_lint_kind($v): string {
        if (is_string($v)) return 'string';
        if (is_int($v) || is_float($v)) return 'number';
        if (is_bool($v)) return 'bool';
        if ($v === null) return 'null';
        return 'array';
    }

    /** Compare shape of $b to reference $a (same keys, list lengths, kinds, numbers). */
    function demo_lint_shape($a, $b, string $path, string $la, string $lb, array &$errors): void {
        $ka = demo_lint_kind($a);
        $kb = demo_lint_kind($b);
        if ($ka !== $kb) {
            $errors[] = "{$path}: {$la} is {$ka} but {$lb} is {$kb}";
            return;
        }
        if ($ka === 'number') {
            if ((float)$a !== (float)$b) $errors[] = "{$path}: number differs ({$la} {$a} vs {$lb} {$b}) - only strings may differ";
            return;
        }
        if ($ka === 'bool') {
            if ($a !== $b) $errors[] = "{$path}: flag differs ({$la} vs {$lb})";
            return;
        }
        if ($ka !== 'array') return;
        if (array_is_list($a) !== array_is_list($b)) {
            $errors[] = "{$path}: {$la} is a " . (array_is_list($a) ? 'list' : 'map') . " but {$lb} is a " . (array_is_list($b) ? 'list' : 'map');
            return;
        }
        if (array_is_list($a)) {
            if (count($a) !== count($b)) $errors[] = "{$path}: list length differs ({$la} " . count($a) . " vs {$lb} " . count($b) . ')';
            foreach (array_intersect_key($a, $b) as $i => $v) demo_lint_shape($v, $b[$i], "{$path}[{$i}]", $la, $lb, $errors);
            return;
        }
        foreach (array_diff_key($a, $b) as $k => $_) $errors[] = "{$path}.{$k}: key present in {$la}, missing in {$lb}";
        foreach (array_diff_key($b, $a) as $k => $_) $errors[] = "{$path}.{$k}: extra key in {$lb}, not in {$la}";
        foreach (array_intersect_key($a, $b) as $k => $v) demo_lint_shape($v, $b[$k], $path === '' ? (string)$k : "{$path}.{$k}", $la, $lb, $errors);
    }

    /** Why this text does not belong in the edition $lang (C6), or null. */
    function demo_lint_leakage(string $lang, string $text): ?string {
        if ($lang !== 'sk' && preg_match('/[ľĺŕťďňôä]/iu', $text, $m)) {
            return "Slovak letter '{$m[0]}' in a {$lang} text";
        }
        if ($lang !== 'hu' && preg_match('/[őű]/iu', $text, $m)) {
            return "Hungarian letter '{$m[0]}' in a {$lang} text";
        }
        $words = [
            'sk' => ['Kft.' => '/(?<![\p{L}])Kft\./u', 'Zrt.' => '/(?<![\p{L}])Zrt\./u', 'Bt.' => '/(?<![\p{L}])Bt\./u', 'Inc.' => '/(?<![\p{L}])Inc\./u', 'LLC' => '/(?<![\p{L}])LLC(?![\p{L}])/u'],
            'hu' => ['s.r.o.' => '/(?<![\p{L}\d])s\.\s?r\.\s?o\./iu', 'a.s.' => '/(?<![\p{L}\d.])a\.s\.(?![\p{L}])/u', 'Ing.' => '/(?<![\p{L}])Ing\./u', 'Mgr.' => '/(?<![\p{L}])Mgr\./u', 'Bc.' => '/(?<![\p{L}])Bc\./u', 'Inc.' => '/(?<![\p{L}])Inc\./u', 'LLC' => '/(?<![\p{L}])LLC(?![\p{L}])/u'],
            'en' => ['s.r.o.' => '/(?<![\p{L}\d])s\.\s?r\.\s?o\./iu', 'a.s.' => '/(?<![\p{L}\d.])a\.s\.(?![\p{L}])/u', 'Ing.' => '/(?<![\p{L}])Ing\./u', 'Mgr.' => '/(?<![\p{L}])Mgr\./u', 'Bc.' => '/(?<![\p{L}])Bc\./u', 'Kft.' => '/(?<![\p{L}])Kft\./u', 'Zrt.' => '/(?<![\p{L}])Zrt\./u', 'Bt.' => '/(?<![\p{L}])Bt\./u'],
        ][$lang] ?? [];
        foreach ($words as $label => $re) {
            if (preg_match($re, $text)) return "'{$label}' does not belong in a {$lang} text";
        }
        return null;
    }

    function demo_lint_phone_prefix(string $lang): string {
        return ['sk' => '+421', 'hu' => '+36', 'en' => '+1'][$lang];
    }

    /** Texts that are legitimately identical in every edition. */
    function demo_lint_untranslated_exempt(string $text): bool {
        return (bool)(preg_match('#^https?://#i', $text)
            || preg_match('/^[^\s@]+@[^\s@]+\.[a-z]+$/i', $text)
            || preg_match('/^[A-Z0-9][A-Z0-9 ._\/+-]*$/', $text)         // SKU / code (no lower-case letters)
            || preg_match('/^[\p{N}\s+().\/-]+$/u', $text));              // numbers, phones
    }

    /** Valid ISO 13616 mod-97 IBAN? */
    function demo_lint_iban_valid(string $iban): bool {
        $iban = strtoupper(str_replace(' ', '', $iban));
        $len = ['SK' => 24, 'HU' => 28, 'IT' => 27, 'CZ' => 24, 'DE' => 22, 'AT' => 20];
        if (!preg_match('/^[A-Z]{2}\d{2}[A-Z0-9]+$/', $iban)) return false;
        if (isset($len[substr($iban, 0, 2)]) && strlen($iban) !== $len[substr($iban, 0, 2)]) return false;
        $s = substr($iban, 4) . substr($iban, 0, 4);
        $n = '';
        foreach (str_split($s) as $c) $n .= ctype_alpha($c) ? (string)(ord($c) - 55) : $c;
        $rem = 0;
        foreach (str_split($n, 7) as $chunk) $rem = (int)($rem . $chunk) % 97;
        return $rem === 1;
    }

    /** Slovak IČO (mod 11), DIČ (10 digits divisible by 11), Hungarian adószám (check digit). */
    function demo_lint_id_valid(string $kind, string $value): bool {
        $digits = preg_replace('/\D/', '', $value);
        switch ($kind) {
            case 'sk-ico':
                if (strlen($digits) !== 8) return false;
                $s = 0;
                for ($i = 0; $i < 7; $i++) $s += (int)$digits[$i] * (8 - $i);
                $c = 11 - $s % 11;
                $c = $c === 10 ? 0 : ($c === 11 ? 1 : $c);
                return $c === (int)$digits[7];
            case 'sk-dic':
                return strlen($digits) === 10 && (int)$digits[0] === 2 && (int)$digits % 11 === 0;
            case 'hu-ado':
                if (!preg_match('/^(\d{8})-([1-5])-(\d{2})$/', $value, $m)) return false;
                $w = [9, 7, 3, 1, 9, 7, 3];
                $s = 0;
                for ($i = 0; $i < 7; $i++) $s += (int)$m[1][$i] * $w[$i];
                return (10 - $s % 10) % 10 === (int)$m[1][7];
            case 'us-ein':
                return (bool)preg_match('/^\d{2}-\d{7}$/', $value);
        }
        return true;
    }

    /** Static check of a pack file: `return [...]` of plain data only. @return string[] problems */
    function demo_lint_static(string $file): array {
        $problems = [];
        $tokens = token_get_all((string)file_get_contents($file));
        $prev = null;
        $seenReturn = false;
        $bad = [T_VARIABLE, T_INCLUDE, T_INCLUDE_ONCE, T_REQUIRE, T_REQUIRE_ONCE, T_IF, T_ELSE, T_ELSEIF, T_SWITCH, T_MATCH, T_FUNCTION, T_FN, T_NEW,
            T_DOUBLE_COLON, T_OBJECT_OPERATOR, T_NULLSAFE_OBJECT_OPERATOR, T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES, T_COALESCE, T_ECHO, T_EXIT, T_FOREACH, T_FOR, T_WHILE, T_CLASS, T_INLINE_HTML];
        foreach ($tokens as $tok) {
            if (is_array($tok)) {
                [$id, $text, $line] = $tok;
                if (in_array($id, [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT, T_OPEN_TAG], true)) continue;
                if (in_array($id, $bad, true)) {
                    $problems[] = "line {$line}: not plain data ({$text})";
                } elseif ($id === T_STRING && !in_array(strtolower($text), ['true', 'false', 'null'], true)) {
                    $problems[] = "line {$line}: bare word or function call '{$text}' - packs hold literals only";
                } elseif ($id === T_NAME_QUALIFIED || $id === T_NAME_FULLY_QUALIFIED) {
                    $problems[] = "line {$line}: name '{$text}' - packs hold literals only";
                } elseif ($id === T_RETURN) {
                    $seenReturn = true;
                } elseif (!$seenReturn) {
                    $problems[] = "line {$line}: expected `return [...]` first, found '{$text}'";
                }
                $prev = $id;
            } else {
                if (trim($tok) === '') continue;
                if ($tok === '(' && $prev !== T_ARRAY) {
                    $problems[] = "a '(' that is not array( - a call or an expression";
                }
                if ($tok === '?') $problems[] = "a '?' - conditional expressions are not allowed";
                $prev = $tok;
            }
        }
        if (!$seenReturn) $problems[] = 'no return statement';
        return array_values(array_unique($problems));
    }

    /**
     * Lint one module's three packs. $packs = ['sk' => [...], 'hu' => [...], 'en' => [...]] (already loaded).
     * Returns a flat list of error strings (empty = clean). Pure: no DB, no context needed except for
     * placeholder resolution, which $resolve (callable lang,currency,text => string) provides.
     */
    function demo_lint_module(string $module, array $packs, ?callable $resolve = null): array {
        $errors = [];
        $E = static function (string $lang, string $msg) use ($module, &$errors): void {
            $errors[] = "[{$module}/{$lang}] {$msg}";
        };

        // 1. parity against sk
        foreach (['hu', 'en'] as $lang) {
            $shape = [];
            demo_lint_shape($packs['sk'], $packs[$lang], '', 'sk', $lang, $shape);
            foreach ($shape as $m) $E($lang, 'shape: ' . $m);
        }

        // 2. leakage, phones, B12 hosts, ids - per language, outside foreign records
        $leavesBy = [];
        foreach (['sk', 'hu', 'en'] as $lang) {
            $leavesBy[$lang] = demo_lint_leaves($packs[$lang]);
            foreach ($leavesBy[$lang] as $leaf) {
                $v = $leaf['value'];
                if (!is_string($v) || $v === '') continue;
                if (!$leaf['foreign']) {
                    if (($why = demo_lint_leakage($lang, $v)) !== null) $E($lang, "{$leaf['path']}: {$why}");
                    if (preg_match('/phone/i', $leaf['key']) && $v[0] === '+' && strpos($v, demo_lint_phone_prefix($lang)) !== 0) {
                        $E($lang, "{$leaf['path']}: phone '{$v}' does not start with " . demo_lint_phone_prefix($lang));
                    }
                }
                // B12: fictional contact data everywhere, foreign records included.
                if (preg_match('/^[^\s@{}]+@([^\s@{}]+)$/', $v, $m) && !preg_match('/\.example$/i', $m[1])) {
                    $E($lang, "{$leaf['path']}: e-mail '{$v}' must end in .example (B12)");
                }
                if (preg_match('#^https?://([^/\s]+)#i', $v, $m) && !preg_match('/\.example$/i', $m[1])) {
                    $E($lang, "{$leaf['path']}: URL host '{$m[1]}' must end in .example (B12)");
                }
                if ($leaf['key'] === 'iban' && !demo_lint_iban_valid($v)) {
                    $E($lang, "{$leaf['path']}: IBAN '{$v}' fails the mod-97 checksum");
                }
            }
        }

        // 3. untranslated: > 25 chars identical in all three, outside foreign records
        $by = [];
        foreach (['sk', 'hu', 'en'] as $lang) {
            foreach ($leavesBy[$lang] as $leaf) $by[$leaf['path']][$lang] = $leaf;
        }
        foreach ($by as $path => $set) {
            if (count($set) < 3) continue;
            $v = $set['sk']['value'];
            if (!is_string($v) || mb_strlen($v) <= 25) continue;
            if ($set['sk']['foreign'] || $set['hu']['foreign'] || $set['en']['foreign']) continue;
            if ($v === $set['hu']['value'] && $v === $set['en']['value'] && !demo_lint_untranslated_exempt($v)) {
                $errors[] = "[{$module}] {$path}: untranslated - the same text in sk, hu and en";
            }
        }

        // 4. refs
        foreach (['sk', 'hu', 'en'] as $lang) {
            foreach ($leavesBy[$lang] as $leaf) {
                // A list element ('assignees.0') takes the key of its list.
                $segments = explode('.', $leaf['path']);
                $key = array_pop($segments);
                if (ctype_digit($key) && $segments) $key = array_pop($segments);
                $isRefKey = in_array($key, demo_lint_ref_keys(), true);
                if (!$isRefKey || $leaf['value'] === null) continue;
                $ref = $leaf['value'];
                if (!is_string($ref) || !demo_ref_valid($ref)) {
                    $E($lang, "{$leaf['path']}: '" . (is_scalar($ref) ? $ref : gettype($ref)) . "' is not a valid ref (C1-C6, L7-L11, P1-P5, PT, E1-E6, I1-I8, S1-S3, W1-W2, owner, pm, sales)");
                    continue;
                }
                if ($ref !== 'PT') {
                    try {
                        demo_ref_for($lang, $ref);
                    } catch (\Throwable $e) {
                        $E($lang, "{$leaf['path']}: ref '{$ref}' has no record in the company pack");
                    }
                }
            }
        }

        // 5. placeholders resolve in every combination
        if ($resolve !== null) {
            foreach (demo_lint_combos() as [$lang, $currency]) {
                foreach ($leavesBy[$lang] as $leaf) {
                    if (!is_string($leaf['value']) || strpos($leaf['value'], '{') === false) continue;
                    try {
                        $out = $resolve($lang, $currency, $leaf['value']);
                        if (preg_match('/\{[a-z]+(:[^}]*)?\}/', $out)) {
                            $E($lang, "{$leaf['path']}: placeholder left unresolved ({$lang}/{$currency}): {$out}");
                        }
                    } catch (\Throwable $e) {
                        $E($lang, "{$leaf['path']}: {$e->getMessage()} ({$lang}/{$currency})");
                    }
                }
            }
        }

        // 6. the company pack's own contract
        if ($module === 'company') {
            foreach (demo_lint_company($packs) as $m) $errors[] = "[company] {$m}";
        }
        return array_values(array_unique($errors));
    }

    /** Structure and identity rules specific to packs/<lang>/company.php. */
    function demo_lint_company(array $packs): array {
        $errors = [];
        $expect = [
            'users' => ['owner', 'pm', 'sales'],
            'employees' => ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'],
            'clients' => ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'L7', 'L8', 'L9', 'L10', 'L11'],
            'projects' => ['P1', 'P2', 'P3', 'P4', 'P5'],
            'items' => ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8'],
            'suppliers' => ['S1', 'S2', 'S3'],
            'warehouses' => ['W1', 'W2'],
        ];
        foreach (['sk', 'hu', 'en'] as $lang) {
            $p = $packs[$lang];
            foreach (['brand', 'company', 'billing', 'divisions'] as $k) {
                if (!isset($p[$k])) $errors[] = "{$lang}: missing section '{$k}'";
            }
            foreach ($expect as $section => $keys) {
                $have = array_keys($p[$section] ?? []);
                if ($have !== $keys) $errors[] = "{$lang}: {$section} must be exactly [" . implode(',', $keys) . '], found [' . implode(',', $have) . ']';
            }
            if (count($p['divisions'] ?? []) !== 2) $errors[] = "{$lang}: exactly two divisions (D1)";
            $emails = [];
            foreach ($p['users'] ?? [] as $role => $u) {
                $e = strtolower((string)$u['email']);
                if (!preg_match('/^[a-z.]+@lapidea\.example$/', $e)) $errors[] = "{$lang}: login e-mail of {$role} must be ascii first.last@lapidea.example, found '{$u['email']}'";
                $emails[] = $e;
                if (!in_array($u['role'], ['admin', 'project_manager'], true)) $errors[] = "{$lang}: users.{$role}.role must be admin or project_manager";
            }
            if (($p['users']['owner']['role'] ?? '') !== 'admin') $errors[] = "{$lang}: owner must be the admin";
            foreach ($p['employees'] ?? [] as $ref => $e) {
                $emails[] = strtolower((string)$e['email']);
                if ($e['user'] !== null && ($p['users'][$e['user']]['email'] ?? null) !== $e['email']) $errors[] = "{$lang}: employee {$ref} claims login '{$e['user']}' but the e-mail differs";
            }
            // The three logins and E1-E3 share addresses on purpose: six distinct people in all.
            if (count(array_unique($emails)) !== 6) $errors[] = "{$lang}: expected 6 distinct staff e-mails, found " . count(array_unique($emails));
            foreach ($p['projects'] ?? [] as $ref => $pr) {
                if (!isset($p['clients'][$pr['client'] ?? ''])) $errors[] = "{$lang}: project {$ref} points at unknown client '" . ($pr['client'] ?? '') . "'";
            }
            // identity checksums of the company itself and of non-foreign records of this edition
            $records = ['company' => $p['company']];
            foreach (['clients', 'suppliers'] as $sec) {
                foreach ($p[$sec] ?? [] as $ref => $r) if (empty($r['_foreign'])) $records["{$sec}.{$ref}"] = $r;
            }
            foreach ($records as $label => $r) {
                if ($lang === 'sk') {
                    if (($r['companyId'] ?? '') !== '' && !demo_lint_id_valid('sk-ico', $r['companyId'])) $errors[] = "sk: {$label}.companyId '{$r['companyId']}' fails the IČO checksum";
                    if (($r['taxId'] ?? '') !== '' && !demo_lint_id_valid('sk-dic', $r['taxId'])) $errors[] = "sk: {$label}.taxId '{$r['taxId']}' is not a valid DIČ";
                    if (($r['vatId'] ?? '') !== '' && $r['vatId'] !== 'SK' . $r['taxId']) $errors[] = "sk: {$label}.vatId must be SK + taxId";
                } elseif ($lang === 'hu') {
                    if (($r['taxId'] ?? '') !== '' && !demo_lint_id_valid('hu-ado', $r['taxId'])) $errors[] = "hu: {$label}.taxId '{$r['taxId']}' fails the adószám checksum";
                    if (($r['vatId'] ?? '') !== '' && $r['vatId'] !== 'HU' . substr($r['taxId'], 0, 8)) $errors[] = "hu: {$label}.vatId must be HU + the first 8 digits of taxId";
                } else {
                    if (($r['companyId'] ?? '') !== '' && !demo_lint_id_valid('us-ein', $r['companyId'])) $errors[] = "en: {$label}.companyId '{$r['companyId']}' is not an EIN (NN-NNNNNNN)";
                    if (($r['vatId'] ?? '') !== '') $errors[] = "en: {$label}.vatId must be empty - the US edition has no VAT ID (B11)";
                }
            }
            if ($lang === 'en' && ($p['company']['iban'] ?? 'x') !== '') $errors[] = 'en: company.iban must be empty (US: routing number in swift, B11)';
        }
        return $errors;
    }

    /** Load a pack the way the seed does (a failure becomes an error string). */
    function demo_lint_load(string $lang, string $module, array &$errors): ?array {
        $file = dirname(__DIR__) . "/public/api/demo_seed/packs/{$lang}/{$module}.php";
        if (!is_file($file)) {
            $errors[] = "[{$module}/{$lang}] pack file is missing: packs/{$lang}/{$module}.php (every module needs sk, hu and en)";
            return null;
        }
        foreach (demo_lint_static($file) as $p) $errors[] = "[{$module}/{$lang}] {$p}";
        try {
            return demo_pack_for($lang, $module);
        } catch (\Throwable $e) {
            $errors[] = "[{$module}/{$lang}] {$e->getMessage()}";
            return null;
        }
    }

    /** The placeholder resolver used by the tests: a forced context, no database. */
    function demo_lint_resolver(): callable {
        return static function (string $lang, string $currency, string $text): string {
            demo_ctx_force($lang, $currency);
            return demo_text($text);
        };
    }

    /** Run the lint over every pack module; returns [errors, modules]. */
    function demo_lint_run(): array {
        $errors = [];
        $modules = demo_lint_pack_modules();
        foreach ($modules as $module) {
            $packs = [];
            foreach (['sk', 'hu', 'en'] as $lang) {
                $p = demo_lint_load($lang, $module, $errors);
                if ($p !== null) $packs[$lang] = $p;
            }
            if (count($packs) === 3) {
                foreach (demo_lint_module($module, $packs, demo_lint_resolver()) as $e) $errors[] = $e;
            }
        }
        return [array_values(array_unique($errors)), $modules];
    }

    /**
     * The lint must notice a broken pack. Builds one in memory (an extra key, a shorter list,
     * a Slovak letter, a Kft. in sk, a different number, a bad ref, an unresolved placeholder)
     * and returns the checks it failed to catch.
     */
    function demo_lint_self_test(): array {
        $e = [];
        $packs = [];
        foreach (['sk', 'hu', 'en'] as $lang) $packs[$lang] = demo_pack_for($lang, 'company');
        $clean = demo_lint_module('company', $packs, demo_lint_resolver());
        if ($clean) $e[] = 'self-test needs a clean company pack first: ' . $clean[0];

        $cases = [
            'an extra key in hu' => static function (array $p): array { $p['hu']['company']['unexpected'] = 'x'; return $p; },
            'a shorter list in hu' => static function (array $p): array { array_pop($p['hu']['billing']['usp']); return $p; },
            'a different number in hu' => static function (array $p): array { $p['hu']['clients']['C1']['valueEur'] = 24601; return $p; },
            'a Slovak letter in hu' => static function (array $p): array { $p['hu']['company']['subtitle'] = 'Kő a méretre ľ'; return $p; },
            'a Kft. in the sk pack' => static function (array $p): array { $p['sk']['clients']['C3']['name'] = 'KuchyneLine Kft.'; return $p; },
            'a +421 phone in hu' => static function (array $p): array { $p['hu']['company']['phone'] = '+421 2 5557 0142'; return $p; },
            'an unknown ref' => static function (array $p): array { $p['en']['projects']['P1']['client'] = 'C9'; return $p; },
            'an unresolved placeholder' => static function (array $p): array { $p['sk']['billing']['nextSteps'] = 'Pozri {nothing:here}'; return $p; },
            'a real e-mail domain' => static function (array $p): array { $p['en']['company']['email'] = 'info@gmail.com'; return $p; },
            'a bad IBAN checksum' => static function (array $p): array { $p['sk']['company']['iban'] = 'SK50 9980 0000 1943 8207 1656'; return $p; },
        ];
        foreach ($cases as $label => $break) {
            if (!demo_lint_module('company', $break($packs), demo_lint_resolver())) {
                $e[] = "the lint did not notice: {$label}";
            }
        }
        return $e;
    }
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------
if (PHP_SAPI === 'cli' && isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    [$errors, $modules] = demo_lint_run();
    echo 'Pack modules: ' . ($modules ? implode(', ', $modules) : '(none)') . "\n";
    foreach ($modules as $m) {
        $mine = array_filter($errors, static fn(string $e): bool => strpos($e, "[{$m}") === 0);
        echo ($mine ? 'FAIL ' : 'ok   ') . $m . ' (' . count($mine) . " problem(s))\n";
    }
    foreach ($errors as $e) echo "  - {$e}\n";

    $selfFails = [];
    if (!$errors) {
        $selfFails = demo_lint_self_test();
        echo ($selfFails ? 'FAIL ' : 'ok   ') . "lint self-test (a deliberately broken hu pack is rejected)\n";
        foreach ($selfFails as $f) echo "  - {$f}\n";
    }
    $bad = count($errors) + count($selfFails);
    echo $bad === 0 ? "\nAll pack checks passed.\n" : "\n{$bad} pack problem(s).\n";
    exit($bad === 0 ? 0 : 1);
}
