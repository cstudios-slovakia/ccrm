<?php
/**
 * Packs and refs.
 *
 * A pack is a file packs/<lang>/<module>.php that does `return [ ... ];` - plain data, no
 * logic. The same module has one pack per language with an identical shape. The company
 * pack (packs/<lang>/company.php) holds the cast every other pack points at by ref.
 *
 *   demo_pack($pdo, 'tasks')        the pack of the install's language (throws if missing)
 *   demo_pack_for('hu', 'tasks')    the same for an explicit language (tests, no database)
 *   demo_company_pack('hu')         shortcut for demo_pack_for('hu', 'company')
 *   demo_ref($pdo, 'C1')            the cast record (a plain array, with 'ref' and 'id' added)
 *   demo_ref_for('hu', 'C1')        the same without a database
 *   demo_ref_id('C1')               the row id, 'demo-clients-1' - owns the id map (C3)
 *
 * Refs (C3): C1-C6 clients, L7-L11 leads (both rows of `leads`), P1-P5 projects, PT the
 * project type, E1-E6 employees, I1-I8 items, S1-S3 suppliers, W1-W2 warehouses, and the
 * three login roles owner / pm / sales (users; ids 'u-' . md5(lowercase e-mail)).
 */
require_once __DIR__ . '/context.php';
require_once __DIR__ . '/helpers.php';

if (!function_exists('demo_pack_for')) {

    /** Languages a pack exists for. */
    function demo_pack_languages(): array {
        return ['sk', 'hu', 'en'];
    }

    function demo_pack_path(string $lang, string $module): string {
        if (!in_array($lang, demo_pack_languages(), true)) {
            throw new \InvalidArgumentException("demo pack: unknown language '{$lang}'");
        }
        if (!preg_match('/^[a-z][a-z0-9_]*$/', $module)) {
            throw new \InvalidArgumentException("demo pack: bad module name '{$module}'");
        }
        return __DIR__ . '/packs/' . $lang . '/' . $module . '.php';
    }

    /** Does packs/<lang>/<module>.php exist? */
    function demo_pack_exists(string $lang, string $module): bool {
        return is_file(demo_pack_path($lang, $module));
    }

    /** Load a pack for an explicit language. A missing or non-array pack throws. */
    function demo_pack_for(string $lang, string $module): array {
        static $cache = [];
        $key = $lang . '/' . $module;
        if (isset($cache[$key])) {
            return $cache[$key];
        }
        $path = demo_pack_path($lang, $module);
        if (!is_file($path)) {
            throw new \RuntimeException("demo pack missing: packs/{$lang}/{$module}.php");
        }
        $data = require $path;
        if (!is_array($data)) {
            throw new \RuntimeException("demo pack packs/{$lang}/{$module}.php must `return [...]`");
        }
        return $cache[$key] = $data;
    }

    /** The pack of the install's language. */
    function demo_pack(PDO $pdo, string $module): array {
        return demo_pack_for(demo_ctx($pdo)['lang'], $module);
    }

    function demo_company_pack(string $lang): array {
        return demo_pack_for($lang, 'company');
    }

    /** What a ref is: 'client' | 'lead' | 'project' | 'projectType' | 'employee' | 'item' | 'supplier' | 'warehouse' | 'user', or null. */
    function demo_ref_kind(string $ref): ?string {
        if ($ref === 'PT') {
            return 'projectType';
        }
        if (in_array($ref, demo_user_roles(), true)) {
            return 'user';
        }
        if (!preg_match('/^([A-Z]{1,2})(\d+)$/', $ref, $m)) {
            return null;
        }
        $n = (int)$m[2];
        switch ($m[1]) {
            case 'C': return $n >= 1 && $n <= 6 ? 'client' : null;
            case 'L': return $n >= 7 && $n <= 11 ? 'lead' : null;
            case 'P': return $n >= 1 && $n <= 5 ? 'project' : null;
            case 'E': return $n >= 1 && $n <= 6 ? 'employee' : null;
            case 'I': return $n >= 1 && $n <= 8 ? 'item' : null;
            case 'S': return $n >= 1 && $n <= 3 ? 'supplier' : null;
            case 'W': return $n >= 1 && $n <= 2 ? 'warehouse' : null;
        }
        return null;
    }

    /** True for a ref the id map knows (a project type is the bare ref 'PT'). */
    function demo_ref_valid(string $ref): bool {
        return demo_ref_kind($ref) !== null;
    }

    /**
     * The row id of a ref (C3). Pure for everything but the three logins, whose id comes
     * from the edition's login e-mail and therefore needs the context.
     */
    function demo_ref_id(string $ref): string {
        $kind = demo_ref_kind($ref);
        if ($kind === null) {
            throw new \InvalidArgumentException("demo ref: unknown ref '{$ref}'");
        }
        if ($kind === 'projectType') {
            return 'demo-projects-0';
        }
        if ($kind === 'user') {
            $user = demo_company_pack(demo_ctx_current()['lang'])['users'][$ref] ?? null;
            if (!$user) {
                throw new \RuntimeException("demo ref: no user '{$ref}' in the company pack");
            }
            return demo_user_id_for_email((string)$user['email']);
        }
        $n = (int)substr($ref, strcspn($ref, '0123456789'));
        switch ($kind) {
            case 'client':
            case 'lead':     return 'demo-clients-' . $n;
            case 'project':  return 'demo-projects-' . $n;
            case 'employee': return 'demo-employees-' . $n;
            case 'item':     return 'demo-warehouse-' . (100 + $n);
            case 'supplier': return 'demo-warehouse-' . (200 + $n);
            case 'warehouse': return 'demo-warehouse-' . $n;
        }
        throw new \LogicException('demo ref: unreachable');
    }

    /** Where the company pack keeps each kind of record. */
    function demo_ref_section(string $kind): string {
        return [
            'client' => 'clients', 'lead' => 'clients', 'project' => 'projects',
            'employee' => 'employees', 'item' => 'items', 'supplier' => 'suppliers',
            'warehouse' => 'warehouses', 'user' => 'users',
        ][$kind];
    }

    /** The cast record of a ref for an explicit language, with 'ref' and 'id' added. */
    function demo_ref_for(string $lang, string $ref): array {
        $kind = demo_ref_kind($ref);
        if ($kind === null) {
            throw new \InvalidArgumentException("demo ref: unknown ref '{$ref}'");
        }
        if ($kind === 'projectType') {
            throw new \RuntimeException("demo ref: 'PT' has an id (demo-projects-0) but no cast record - the project type is defined by the projects pack");
        }
        $section = demo_ref_section($kind);
        $record = demo_company_pack($lang)[$section][$ref] ?? null;
        if (!is_array($record)) {
            throw new \RuntimeException("demo ref: '{$ref}' is not in packs/{$lang}/company.php ({$section})");
        }
        $id = $kind === 'user'
            ? demo_user_id_for_email((string)$record['email'])
            : demo_ref_id($ref);
        return $record + ['ref' => $ref, 'id' => $id];
    }

    /** The cast record of a ref in the install's language. */
    function demo_ref(PDO $pdo, string $ref): array {
        return demo_ref_for(demo_ctx($pdo)['lang'], $ref);
    }
}
