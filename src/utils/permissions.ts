import type { RolePermission, UserProfile } from "../types";

/**
 * Role-based access control — the single registry of every permission the app
 * enforces, plus the resolver that turns a role record into concrete answers.
 *
 * Two kinds of permission exist:
 *
 * - `access`  — the tri-state `nothing | view | edit` that guards a module and
 *               its data. `view` opens the module read-only; `edit` also allows
 *               creating and changing records.
 * - `toggle`  — a plain on/off switch for a single action (delete, send, ...)
 *               or for a module that has nothing to edit (analytics, updates).
 *               Stored as `edit` (on) or `nothing` (off) so the role blob keeps
 *               one value type. A toggle may `require` an access permission at
 *               a given level — `leads.delete` means nothing for a role that
 *               cannot edit leads — and `can()` honours that dependency.
 *
 * Stored role records are sparse: an absent key resolves to the definition's
 * `legacyDefault` — the behaviour the app had before the key existed, so an
 * upgrade never silently locks a working role out of a module it could use
 * yesterday. A role created in the new matrix starts from `newRoleDefault`
 * (everything off) and is written out in full.
 *
 * The Admin role is not stored in a matrix at all: it always resolves to
 * `edit`/on for every key, on the client and in `sync.php` alike.
 *
 * `api/permissions.php` is a port of the resolver in this file; keep the two in
 * step whenever the registry changes.
 */

export type PermissionValue = "edit" | "view" | "nothing";
export type PermissionKind = "access" | "toggle";
export type AccessLevel = "view" | "edit";

export interface PermissionDef {
  key: string;
  kind: PermissionKind;
  /** Value an existing role resolves to when the key is absent (pre-1.9.45 behaviour). */
  legacyDefault: PermissionValue;
  /** Value a role created in the matrix starts with. */
  newRoleDefault: PermissionValue;
  /** Toggles only: the access permission (and level) this action depends on. */
  requires?: { key: string; level: AccessLevel };
  /**
   * Keys from the pre-1.9.45 matrix folded into this one. For an `access`
   * permission the legacy keys are read as `[view-ish..., edit-ish...]` via
   * `legacyEdit` — any legacy key listed there being granted means `edit`, any
   * other listed key being granted means `view`.
   */
  legacyKeys?: string[];
  /** Subset of `legacyKeys` that used to grant a write, not just a read. */
  legacyEdit?: string[];
}

export interface PermissionSection {
  id: string;
  permissions: PermissionDef[];
}

const access = (
  key: string,
  legacyDefault: PermissionValue = "edit",
  newRoleDefault: PermissionValue = "nothing",
  legacy?: { keys: string[]; edit: string[] },
): PermissionDef => ({
  key,
  kind: "access",
  legacyDefault,
  newRoleDefault,
  legacyKeys: legacy?.keys,
  legacyEdit: legacy?.edit,
});

const toggle = (
  key: string,
  legacyDefault: PermissionValue,
  newRoleDefault: PermissionValue = "nothing",
  requires?: { key: string; level: AccessLevel },
  legacyKeys?: string[],
): PermissionDef => ({ key, kind: "toggle", legacyDefault, newRoleDefault, requires, legacyKeys });

const deleteToggle = (moduleKey: string, legacyDefault: PermissionValue = "edit") =>
  toggle(`${moduleKey}.delete`, legacyDefault, "nothing", { key: moduleKey, level: "edit" });

/**
 * Every section of the matrix, in display order. Section ids double as the
 * sidebar / route ids they protect (see `sectionForRoute`).
 */
export const PERMISSION_SECTIONS: PermissionSection[] = [
  {
    id: "dashboard",
    permissions: [
      access("dashboard", "edit", "view"),
      access("dashboard.custom", "edit", "nothing"),
    ],
  },
  {
    id: "tasks",
    permissions: [
      access("tasks", "edit", "nothing", { keys: ["tasks.view", "tasks.create", "tasks.edit"], edit: ["tasks.create", "tasks.edit"] }),
      // Deleting was already enforced (and off) before the rebuild — keep it so.
      deleteToggle("tasks", "nothing"),
      // On for every role until revoked — see resolveTaskViewAll in taskSelectors.
      toggle("tasks.view_all", "edit", "edit", { key: "tasks", level: "view" }),
    ],
  },
  {
    id: "leads",
    permissions: [
      access("leads", "edit", "nothing", { keys: ["leads.view", "leads.create", "leads.edit"], edit: ["leads.create", "leads.edit"] }),
      toggle("leads.delete", "edit", "nothing", { key: "leads", level: "edit" }, ["leads.delete"]),
    ],
  },
  {
    id: "clients",
    permissions: [access("clients"), deleteToggle("clients")],
  },
  {
    id: "projects",
    permissions: [access("projects"), deleteToggle("projects")],
  },
  {
    id: "invoices",
    permissions: [access("invoices"), deleteToggle("invoices")],
  },
  {
    id: "warehouse",
    permissions: [access("warehouse"), deleteToggle("warehouse")],
  },
  {
    id: "financial",
    permissions: [access("financial"), deleteToggle("financial")],
  },
  {
    id: "meetings",
    permissions: [access("meetings"), deleteToggle("meetings")],
  },
  {
    id: "files",
    permissions: [
      access("files", "edit", "nothing", { keys: ["files.view", "files.create"], edit: ["files.create"] }),
      toggle("files.delete", "edit", "nothing", { key: "files", level: "edit" }, ["files.delete"]),
    ],
  },
  {
    id: "email",
    permissions: [access("email")],
  },
  {
    id: "unified_entries",
    permissions: [access("unified_entries"), deleteToggle("unified_entries")],
  },
  {
    id: "automation",
    permissions: [access("automation")],
  },
  {
    id: "social_media",
    permissions: [access("social_media")],
  },
  {
    id: "overview",
    permissions: [toggle("overview", "edit", "nothing")],
  },
  {
    id: "updates",
    permissions: [toggle("updates", "edit", "edit")],
  },
  {
    id: "rag_ai",
    permissions: [toggle("rag_ai", "nothing", "nothing", undefined, ["rag_view"])],
  },
  {
    id: "settings",
    permissions: [
      access("general_config", "nothing"),
      access("pm_managers", "nothing"),
      access("pipeline_stages", "nothing"),
      access("traffic_sources", "nothing"),
      access("ai_config", "nothing"),
      toggle("system_reset", "nothing"),
      toggle("nav_edit", "nothing"),
    ],
  },
];

/** Keys of the settings section — any of them at `view` or better opens Settings. */
export const SETTINGS_PERMISSION_KEYS = PERMISSION_SECTIONS.find((s) => s.id === "settings")!.permissions.map((p) => p.key);

export const PERMISSION_DEFS: Record<string, PermissionDef> = Object.fromEntries(
  PERMISSION_SECTIONS.flatMap((s) => s.permissions.map((p) => [p.key, p])),
);

export const ALL_PERMISSION_KEYS: string[] = Object.keys(PERMISSION_DEFS);

/** Role names that the matrix will not let anyone delete. */
export const PROTECTED_ROLE_NAMES = ["Admin", "Project Manager"];

export const ADMIN_ROLE_NAME = "Admin";

export const isAdminRoleName = (roleName: string | null | undefined): boolean =>
  (roleName || "").trim().toLowerCase() === "admin";

export const isProtectedRoleName = (roleName: string): boolean =>
  PROTECTED_ROLE_NAMES.some((n) => n.toLowerCase() === roleName.trim().toLowerCase());

/** Case-insensitive lookup so a stored `admin` and a registry `Admin` still meet. */
export const findRole = (roles: RolePermission[] | undefined, roleName: string | null | undefined): RolePermission | undefined => {
  const wanted = (roleName || "").trim().toLowerCase();
  if (!wanted) return undefined;
  return (roles || []).find((r) => (r.name || "").trim().toLowerCase() === wanted);
};

const isGranted = (value: unknown): boolean => value === "edit" || value === "view";

const normalizeValue = (value: unknown): PermissionValue | undefined =>
  value === "edit" || value === "view" || value === "nothing" ? value : undefined;

/**
 * Resolve one permission of a stored role record: the stored value if present,
 * else whatever the legacy keys say, else the definition's legacy default.
 * Unknown keys resolve to `nothing`.
 */
export const resolvePermissionValue = (
  permissions: Record<string, unknown> | undefined,
  key: string,
): PermissionValue => {
  const def = PERMISSION_DEFS[key];
  if (!def) return "nothing";
  const stored = normalizeValue(permissions?.[key]);
  if (stored) return stored;
  if (def.legacyKeys && permissions) {
    const present = def.legacyKeys.filter((k) => Object.prototype.hasOwnProperty.call(permissions, k));
    if (present.length > 0) {
      if (def.kind === "toggle") {
        return present.some((k) => isGranted(permissions[k])) ? "edit" : "nothing";
      }
      const editKeys = def.legacyEdit || [];
      if (present.some((k) => editKeys.includes(k) && isGranted(permissions[k]))) return "edit";
      if (present.some((k) => isGranted(permissions[k]))) return "view";
      return "nothing";
    }
  }
  return def.legacyDefault;
};

/** Every defined key, resolved. `undefined` role → everything `nothing`. */
export const resolveRolePermissions = (role: RolePermission | undefined): Record<string, PermissionValue> => {
  const out: Record<string, PermissionValue> = {};
  for (const key of ALL_PERMISSION_KEYS) {
    out[key] = role ? resolvePermissionValue(role.permissions as Record<string, unknown>, key) : "nothing";
  }
  return out;
};

/** The full map a role created in the matrix starts with. */
export const newRolePermissions = (): Record<string, PermissionValue> =>
  Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, PERMISSION_DEFS[k].newRoleDefault]));

/** The full map the Admin role always has. */
export const adminRolePermissions = (): Record<string, PermissionValue> =>
  Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, "edit"]));

/**
 * Write one value into a role and return the role with every key materialised
 * (legacy keys dropped), so a record touched in the new matrix is never half
 * old, half new.
 */
export const withPermission = (role: RolePermission, key: string, value: PermissionValue): RolePermission => ({
  ...role,
  permissions: { ...resolveRolePermissions(role), [key]: value },
});

/** True when every permission of the section is at its maximum (`edit` / on). */
export const isSectionFullyGranted = (resolved: Record<string, PermissionValue>, section: PermissionSection): boolean =>
  section.permissions.every((p) => resolved[p.key] === "edit");

/** True when every permission of the section is off. */
export const isSectionFullyDenied = (resolved: Record<string, PermissionValue>, section: PermissionSection): boolean =>
  section.permissions.every((p) => resolved[p.key] === "nothing");

/** The role with a whole section switched on (everything `edit`) or off. */
export const withSectionGranted = (role: RolePermission, section: PermissionSection, granted: boolean): RolePermission => {
  const next = resolveRolePermissions(role);
  for (const p of section.permissions) next[p.key] = granted ? "edit" : "nothing";
  return { ...role, permissions: next };
};

/** Read/edit/delete answers for one content module. */
export interface ModuleAccess {
  view: boolean;
  edit: boolean;
  delete: boolean;
}

export const FULL_MODULE_ACCESS: ModuleAccess = { view: true, edit: true, delete: true };
export const NO_MODULE_ACCESS: ModuleAccess = { view: false, edit: false, delete: false };

export interface AccessResolver {
  isAdmin: boolean;
  /** Whether the user's role exists in the registry at all (admins always do). */
  hasKnownRole: boolean;
  /** Resolved value of a key (`edit` for every key when admin). */
  value: (key: string) => PermissionValue;
  /** Toggle on, or access at `view` or better — with `requires` honoured. */
  can: (key: string) => boolean;
  /** Access at `edit` (or toggle on with its requirement met). */
  canEdit: (key: string) => boolean;
  /** view/edit/delete for a module whose access key is `moduleKey`. */
  module: (moduleKey: string) => ModuleAccess;
  /** Any settings category open at `view` or better. */
  hasSettingsAccess: boolean;
  /** Whether the sidebar / router may open a route id (see `sectionForRoute`). */
  canOpenRoute: (routeId: string) => boolean;
}

/**
 * Map a route id (`activeTab` base, before any `/sub` path) to the permission
 * key that guards it. `null` means the route is open to everyone logged in
 * (personal settings). Unknown routes are treated as the tasks board, which is
 * what the router renders for them.
 */
export const permissionKeyForRoute = (routeId: string): string | null => {
  const base = routeId.split("/")[0].split("?")[0];
  if (base === "personal-settings") return null;
  if (base === "settings") return "settings";
  if (base.startsWith("user-")) return "pm_managers";
  if (base.startsWith("dash_")) return "dashboard.custom";
  if (base.startsWith("ue_")) return "unified_entries";
  if (base.startsWith("lead-")) return "leads";
  if (base.startsWith("client-")) return "clients";
  if (base === "" || base === "tasks") return "tasks";
  if (PERMISSION_DEFS[base]) return base;
  return "tasks";
};

const requirementMet = (def: PermissionDef, value: (key: string) => PermissionValue): boolean => {
  if (!def.requires) return true;
  const v = value(def.requires.key);
  return def.requires.level === "edit" ? v === "edit" : v === "edit" || v === "view";
};

export const buildAccess = (user: UserProfile | null | undefined, roles: RolePermission[] | undefined): AccessResolver => {
  const isAdmin = Boolean(user && isAdminRoleName(user.role));
  const role = user ? findRole(roles, user.role) : undefined;
  const resolved = isAdmin ? adminRolePermissions() : resolveRolePermissions(role);
  const value = (key: string): PermissionValue => (isAdmin ? "edit" : resolved[key] || "nothing");

  const can = (key: string): boolean => {
    if (isAdmin) return true;
    const def = PERMISSION_DEFS[key];
    if (!def) return false;
    const v = value(key);
    if (v === "nothing") return false;
    return requirementMet(def, value);
  };

  const canEdit = (key: string): boolean => {
    if (isAdmin) return true;
    const def = PERMISSION_DEFS[key];
    if (!def) return false;
    if (value(key) !== "edit") return false;
    return requirementMet(def, value);
  };

  const module = (moduleKey: string): ModuleAccess => {
    if (isAdmin) return FULL_MODULE_ACCESS;
    const view = can(moduleKey);
    const edit = canEdit(moduleKey);
    const deleteKey = `${moduleKey}.delete`;
    const del = edit && (PERMISSION_DEFS[deleteKey] ? can(deleteKey) : true);
    return { view, edit, delete: del };
  };

  const hasSettingsAccess = isAdmin || SETTINGS_PERMISSION_KEYS.some((k) => can(k));

  const canOpenRoute = (routeId: string): boolean => {
    if (isAdmin) return true;
    const key = permissionKeyForRoute(routeId);
    if (key === null) return true;
    if (key === "settings") return hasSettingsAccess;
    return can(key);
  };

  return {
    isAdmin,
    hasKnownRole: isAdmin || Boolean(role),
    value,
    can,
    canEdit,
    module,
    hasSettingsAccess,
    canOpenRoute,
  };
};

/** The first route the user may open, for a landing page or a denied redirect. */
export const firstAllowedRoute = (accessResolver: AccessResolver): string | null => {
  const candidates = ["dashboard", "tasks", "leads", "clients", "projects", "invoices", "warehouse", "financial", "meetings", "files", "email", "automation", "overview", "updates", "settings", "personal-settings"];
  return candidates.find((r) => accessResolver.canOpenRoute(r)) ?? null;
};
