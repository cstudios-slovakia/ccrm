<?php
/**
 * Role-based access control — server side.
 *
 * This file is a PORT of src/utils/permissions.ts: the same registry of
 * permission keys, the same sparse-record resolver (stored value, else the
 * legacy keys, else `legacyDefault`), the same meaning of `requires`, and the
 * same rule that the Admin role always resolves to `edit` for every key.
 * Whenever the registry or the resolver changes in one file, change the other
 * in the same commit — the browser and sync.php must agree on what a role may
 * do, or the UI shows a control the server refuses (or the other way round).
 *
 * Values are `edit` | `view` | `nothing`. An `access` permission guards a
 * module tri-state; a `toggle` is on (`edit`) or off (`nothing`) and may
 * require an access permission at a given level (`leads.delete` needs `leads`
 * at `edit`).
 *
 * Roles live as a JSON registry in system_settings `ROLES_RBAC`:
 * [{ name, permissions: { key: value }, defaultNavLayout? }, ...]. The user's
 * `users.role` column holds the role NAME, matched case-insensitively.
 */

require_once __DIR__ . '/auth.php';

if (!function_exists('ccrm_permission_sections')) {

    /** Id of the built-in home dashboard row (HOME_DASHBOARD_ID in src/utils/dashboardWidgets.ts). */
    if (!defined('CCRM_HOME_DASHBOARD_ID')) {
        define('CCRM_HOME_DASHBOARD_ID', '__home__');
    }

    /**
     * Every section of the matrix, transcribed from PERMISSION_SECTIONS in
     * src/utils/permissions.ts. Each permission carries:
     *   key, kind ('access'|'toggle'), legacyDefault, newRoleDefault,
     *   requires (['key' => ..., 'level' => 'view'|'edit'] or null),
     *   legacyKeys (array or null), legacyEdit (array or null).
     */
    function ccrm_permission_sections(): array {
        // Mirrors the access() / toggle() / deleteToggle() helpers of the TS file.
        $access = function (string $key, string $legacyDefault = 'edit', string $newRoleDefault = 'nothing', ?array $legacy = null): array {
            return [
                'key' => $key,
                'kind' => 'access',
                'legacyDefault' => $legacyDefault,
                'newRoleDefault' => $newRoleDefault,
                'requires' => null,
                'legacyKeys' => $legacy['keys'] ?? null,
                'legacyEdit' => $legacy['edit'] ?? null,
            ];
        };
        $toggle = function (string $key, string $legacyDefault, string $newRoleDefault = 'nothing', ?array $requires = null, ?array $legacyKeys = null): array {
            return [
                'key' => $key,
                'kind' => 'toggle',
                'legacyDefault' => $legacyDefault,
                'newRoleDefault' => $newRoleDefault,
                'requires' => $requires,
                'legacyKeys' => $legacyKeys,
                'legacyEdit' => null,
            ];
        };
        $deleteToggle = function (string $moduleKey, string $legacyDefault = 'edit') use ($toggle): array {
            return $toggle($moduleKey . '.delete', $legacyDefault, 'nothing', ['key' => $moduleKey, 'level' => 'edit']);
        };

        return [
            ['id' => 'dashboard', 'permissions' => [
                $access('dashboard', 'edit', 'view'),
                $access('dashboard.custom', 'edit', 'nothing'),
            ]],
            ['id' => 'tasks', 'permissions' => [
                $access('tasks', 'edit', 'nothing', ['keys' => ['tasks.view', 'tasks.create', 'tasks.edit'], 'edit' => ['tasks.create', 'tasks.edit']]),
                // Deleting was already enforced (and off) before the rebuild — keep it so.
                $deleteToggle('tasks', 'nothing'),
                // On for every role until revoked — see resolveTaskViewAll in taskSelectors.
                $toggle('tasks.view_all', 'edit', 'edit', ['key' => 'tasks', 'level' => 'view']),
            ]],
            ['id' => 'leads', 'permissions' => [
                $access('leads', 'edit', 'nothing', ['keys' => ['leads.view', 'leads.create', 'leads.edit'], 'edit' => ['leads.create', 'leads.edit']]),
                $toggle('leads.delete', 'edit', 'nothing', ['key' => 'leads', 'level' => 'edit'], ['leads.delete']),
            ]],
            ['id' => 'clients', 'permissions' => [$access('clients'), $deleteToggle('clients')]],
            ['id' => 'projects', 'permissions' => [$access('projects'), $deleteToggle('projects')]],
            ['id' => 'invoices', 'permissions' => [$access('invoices'), $deleteToggle('invoices')]],
            ['id' => 'warehouse', 'permissions' => [$access('warehouse'), $deleteToggle('warehouse')]],
            ['id' => 'financial', 'permissions' => [$access('financial'), $deleteToggle('financial')]],
            ['id' => 'meetings', 'permissions' => [$access('meetings'), $deleteToggle('meetings')]],
            ['id' => 'files', 'permissions' => [
                $access('files', 'edit', 'nothing', ['keys' => ['files.view', 'files.create'], 'edit' => ['files.create']]),
                $toggle('files.delete', 'edit', 'nothing', ['key' => 'files', 'level' => 'edit'], ['files.delete']),
            ]],
            ['id' => 'email', 'permissions' => [$access('email')]],
            ['id' => 'unified_entries', 'permissions' => [$access('unified_entries'), $deleteToggle('unified_entries')]],
            ['id' => 'automation', 'permissions' => [$access('automation')]],
            ['id' => 'social_media', 'permissions' => [$access('social_media')]],
            ['id' => 'overview', 'permissions' => [$toggle('overview', 'edit', 'nothing')]],
            ['id' => 'updates', 'permissions' => [$toggle('updates', 'edit', 'edit')]],
            ['id' => 'rag_ai', 'permissions' => [$toggle('rag_ai', 'nothing', 'nothing', null, ['rag_view'])]],
            ['id' => 'settings', 'permissions' => [
                $access('general_config', 'nothing'),
                $access('pm_managers', 'nothing'),
                $access('pipeline_stages', 'nothing'),
                $access('traffic_sources', 'nothing'),
                $access('ai_config', 'nothing'),
                $toggle('system_reset', 'nothing'),
                $toggle('nav_edit', 'nothing'),
            ]],
        ];
    }

    /** key => definition, for every permission in every section. Cached per request. */
    function ccrm_permission_defs(): array {
        static $defs = null;
        if ($defs === null) {
            $defs = [];
            foreach (ccrm_permission_sections() as $section) {
                foreach ($section['permissions'] as $def) {
                    $defs[$def['key']] = $def;
                }
            }
        }
        return $defs;
    }

    /** Every defined permission key, in matrix order. */
    function ccrm_all_permission_keys(): array {
        return array_keys(ccrm_permission_defs());
    }

    /** isAdminRoleName(): the Admin role is matched by name, case-insensitively. */
    function ccrm_is_admin_role_name(?string $roleName): bool {
        return strtolower(trim((string)$roleName)) === 'admin';
    }

    /**
     * findRole(): case-insensitive lookup so a stored `admin` and a registry
     * `Admin` still meet. Returns the role record or null.
     */
    function ccrm_find_role(?array $roles, ?string $roleName): ?array {
        $wanted = strtolower(trim((string)$roleName));
        if ($wanted === '' || !is_array($roles)) {
            return null;
        }
        foreach ($roles as $role) {
            if (is_array($role) && strtolower(trim((string)($role['name'] ?? ''))) === $wanted) {
                return $role;
            }
        }
        return null;
    }

    /**
     * The role name to STORE for an incoming label: the registry's own spelling
     * when a role matches case-insensitively, else the trimmed label as given
     * (legacy enum values mapped to their labels), capped to the column width.
     */
    function ccrm_canonical_role_name(?array $roles, ?string $roleName): string {
        $label = ccrm_normalize_role($roleName);
        $found = ccrm_find_role($roles, $label);
        return $found ? ccrm_normalize_role((string)$found['name']) : $label;
    }

    /**
     * The built-in registry used when ROLES_RBAC is missing or empty. One copy
     * for the sync GET (which serves it to clients) and for the resolver here.
     *
     * Project Manager is written out in the new keys so its answers do not
     * depend on legacy defaults: every content module editable, deletion
     * allowed everywhere except tasks, no settings and no RAG.
     */
    function ccrm_fallback_roles(): array {
        return [
            [
                'name' => 'Admin',
                'permissions' => [
                    'general_config' => 'edit',
                    'pm_managers' => 'edit',
                    'pipeline_stages' => 'edit',
                    'traffic_sources' => 'edit',
                    'system_reset' => 'edit',
                    'ai_config' => 'edit',
                    'nav_edit' => 'edit',
                ],
            ],
            [
                'name' => 'Project Manager',
                'permissions' => [
                    'dashboard' => 'edit',
                    'dashboard.custom' => 'edit',
                    'tasks' => 'edit',
                    'tasks.delete' => 'nothing',
                    'tasks.view_all' => 'edit',
                    'leads' => 'edit',
                    'leads.delete' => 'edit',
                    'clients' => 'edit',
                    'clients.delete' => 'edit',
                    'projects' => 'edit',
                    'projects.delete' => 'edit',
                    'invoices' => 'edit',
                    'invoices.delete' => 'edit',
                    'warehouse' => 'edit',
                    'warehouse.delete' => 'edit',
                    'financial' => 'edit',
                    'financial.delete' => 'edit',
                    'meetings' => 'edit',
                    'meetings.delete' => 'edit',
                    'files' => 'edit',
                    'files.delete' => 'edit',
                    'email' => 'edit',
                    'unified_entries' => 'edit',
                    'unified_entries.delete' => 'edit',
                    'automation' => 'edit',
                    'social_media' => 'edit',
                    'overview' => 'edit',
                    'updates' => 'edit',
                    'rag_ai' => 'nothing',
                    'general_config' => 'nothing',
                    'pm_managers' => 'nothing',
                    'pipeline_stages' => 'nothing',
                    'traffic_sources' => 'nothing',
                    'system_reset' => 'nothing',
                    'ai_config' => 'nothing',
                    'nav_edit' => 'nothing',
                ],
            ],
        ];
    }

    /**
     * The role registry: ROLES_RBAC decoded, or the fallback when it is missing,
     * unreadable or empty (an empty registry can only be a stale client push —
     * see the roles.update guard in sync.php).
     */
    function ccrm_load_roles(\PDO $pdo): array {
        $raw = false;
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'ROLES_RBAC' LIMIT 1");
            $stmt->execute();
            $raw = $stmt->fetchColumn();
        } catch (\Throwable $e) {
            $raw = false;
        }
        $roles = ($raw !== false && $raw !== null && $raw !== '') ? json_decode((string)$raw, true) : null;
        if (!is_array($roles) || empty($roles)) {
            return ccrm_fallback_roles();
        }
        return $roles;
    }

    /** isGranted(): a stored value that opens something. */
    function ccrm_permission_granted($value): bool {
        return $value === 'edit' || $value === 'view';
    }

    /** normalizeValue(): the value if it is one of the three, else null. */
    function ccrm_permission_normalize($value): ?string {
        return ($value === 'edit' || $value === 'view' || $value === 'nothing') ? $value : null;
    }

    /**
     * resolvePermissionValue(): one permission of a stored role record — the
     * stored value if present, else whatever the legacy keys say, else the
     * definition's legacy default. Unknown keys resolve to `nothing`.
     */
    function ccrm_resolve_permission_value(?array $permissions, string $key): string {
        $defs = ccrm_permission_defs();
        if (!isset($defs[$key])) {
            return 'nothing';
        }
        $def = $defs[$key];
        $stored = ccrm_permission_normalize($permissions[$key] ?? null);
        if ($stored !== null) {
            return $stored;
        }
        if (!empty($def['legacyKeys']) && $permissions !== null) {
            $present = [];
            foreach ($def['legacyKeys'] as $legacyKey) {
                if (array_key_exists($legacyKey, $permissions)) {
                    $present[] = $legacyKey;
                }
            }
            if ($present) {
                if ($def['kind'] === 'toggle') {
                    foreach ($present as $legacyKey) {
                        if (ccrm_permission_granted($permissions[$legacyKey])) {
                            return 'edit';
                        }
                    }
                    return 'nothing';
                }
                $editKeys = $def['legacyEdit'] ?? [];
                foreach ($present as $legacyKey) {
                    if (in_array($legacyKey, $editKeys, true) && ccrm_permission_granted($permissions[$legacyKey])) {
                        return 'edit';
                    }
                }
                foreach ($present as $legacyKey) {
                    if (ccrm_permission_granted($permissions[$legacyKey])) {
                        return 'view';
                    }
                }
                return 'nothing';
            }
        }
        return $def['legacyDefault'];
    }

    /** resolveRolePermissions(): every defined key, resolved. Null role → everything `nothing`. */
    function ccrm_resolve_role_permissions(?array $role): array {
        $permissions = ($role !== null && isset($role['permissions']) && is_array($role['permissions']))
            ? $role['permissions'] : null;
        $out = [];
        foreach (ccrm_all_permission_keys() as $key) {
            $out[$key] = $role !== null ? ccrm_resolve_permission_value($permissions, $key) : 'nothing';
        }
        return $out;
    }

    /** adminRolePermissions(): the full map the Admin role always has. */
    function ccrm_admin_role_permissions(): array {
        return array_fill_keys(ccrm_all_permission_keys(), 'edit');
    }

    /**
     * The resolved permission map of the user behind a session (the array
     * ccrm_current_user() returns). Admin → every key `edit`; a role the
     * registry does not know → every key `nothing`.
     */
    function ccrm_user_permissions(\PDO $pdo, ?array $sessionUser): array {
        if ($sessionUser === null) {
            return ccrm_resolve_role_permissions(null);
        }
        if (ccrm_is_admin($sessionUser)) {
            return ccrm_admin_role_permissions();
        }
        $role = ccrm_find_role(ccrm_load_roles($pdo), (string)($sessionUser['role'] ?? ''));
        return ccrm_resolve_role_permissions($role);
    }

    /** requirementMet(): the access permission a toggle depends on is at the needed level. */
    function ccrm_perm_requirement_met(array $resolved, array $def): bool {
        if (empty($def['requires'])) {
            return true;
        }
        $v = $resolved[$def['requires']['key']] ?? 'nothing';
        return $def['requires']['level'] === 'edit' ? $v === 'edit' : ($v === 'edit' || $v === 'view');
    }

    /** can(): toggle on, or access at `view` or better — with `requires` honoured. */
    function ccrm_perm_can(array $resolved, string $key): bool {
        $defs = ccrm_permission_defs();
        if (!isset($defs[$key])) {
            return false;
        }
        if (($resolved[$key] ?? 'nothing') === 'nothing') {
            return false;
        }
        return ccrm_perm_requirement_met($resolved, $defs[$key]);
    }

    /** canEdit(): access at `edit` (or a toggle that is on), with `requires` honoured. */
    function ccrm_perm_can_edit(array $resolved, string $key): bool {
        $defs = ccrm_permission_defs();
        if (!isset($defs[$key])) {
            return false;
        }
        if (($resolved[$key] ?? 'nothing') !== 'edit') {
            return false;
        }
        return ccrm_perm_requirement_met($resolved, $defs[$key]);
    }

    /**
     * module(): view/edit/delete for a content module. Delete needs edit plus
     * the `<module>.delete` toggle when one is defined for the module.
     */
    function ccrm_perm_module(array $resolved, string $moduleKey): array {
        $view = ccrm_perm_can($resolved, $moduleKey);
        $edit = ccrm_perm_can_edit($resolved, $moduleKey);
        $deleteKey = $moduleKey . '.delete';
        $defs = ccrm_permission_defs();
        $delete = $edit && (isset($defs[$deleteKey]) ? ccrm_perm_can($resolved, $deleteKey) : true);
        return ['view' => $view, 'edit' => $edit, 'delete' => $delete];
    }
}
