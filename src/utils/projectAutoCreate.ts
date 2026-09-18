import type { Project, ProjectAutoCreateSettings, ProjectType } from "../types";

/** Auto-creation off — the behaviour every installation had before the setting existed. */
export const DEFAULT_PROJECT_AUTO_CREATE: ProjectAutoCreateSettings = {
  enabled: false,
  projectTypeId: "",
  categoryTypes: {},
  assignOwner: true,
};

/**
 * Coerce anything (a stored blob, a sync payload, `undefined`) to a usable
 * config. Mirrors ccrm_normalize_project_auto_create() in api/auth.php — both
 * sides have to agree on what a malformed value means, or the settings-sync
 * signature flip-flops and pushes forever.
 */
export function normalizeProjectAutoCreate(value: unknown): ProjectAutoCreateSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<ProjectAutoCreateSettings>;
  return {
    enabled: raw.enabled === true,
    projectTypeId: typeof raw.projectTypeId === "string" ? raw.projectTypeId.trim() : "",
    categoryTypes: normalizeCategoryTypes(raw.categoryTypes),
    // Assigning the lead's manager is the useful default; only an explicit
    // false turns it off.
    assignOwner: raw.assignOwner !== false,
  };
}

/**
 * The category -> project-type map, cleaned up: entries with a name and a type
 * on both sides, keys written in one fixed order.
 *
 * The sorting is not cosmetic. This blob goes into the settings signature
 * (computeSettingsSig in App.tsx) as JSON, so the same map with its keys in a
 * different order would read as a change and push settings forever. PHP sorts
 * the same map with ksort(), which agrees with this for the ASCII-range keys
 * a category name is made of.
 */
function normalizeCategoryTypes(value: unknown): Record<string, string> {
  const src = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const entries: [string, string][] = [];
  Object.keys(src).forEach((key) => {
    const name = key.trim();
    const raw = src[key];
    const typeId = typeof raw === "string" ? raw.trim() : "";
    if (name !== "" && typeId !== "") entries.push([name, typeId]);
  });
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const out: Record<string, string> = {};
  entries.forEach(([name, typeId]) => {
    out[name] = typeId;
  });
  return out;
}

/**
 * True when a new lead will actually get a project.
 *
 * "Enabled" alone is not enough: the chosen project type may have been deleted
 * since, which leaves the card looking configured while the server quietly
 * creates nothing. The UI says so rather than letting the operator find out by
 * creating a lead.
 */
export function isProjectAutoCreateActive(
  config: ProjectAutoCreateSettings,
  projectTypes: ProjectType[],
): boolean {
  if (!config.enabled) return false;
  const exists = (id: string) => id !== "" && projectTypes.some((pt) => pt.id === id);
  return exists(config.projectTypeId) || Object.values(config.categoryTypes).some(exists);
}

/**
 * The project types a brand-new lead carrying `categories` is given a project
 * of — one per mapped category, in the order the lead lists them, never the
 * same type twice.
 *
 * A lead whose categories are empty, or map to nothing, falls back to the
 * single configured type; when that is empty too, it gets no project at all.
 * Types that have been deleted since they were chosen are dropped here rather
 * than left to fail against the foreign key.
 *
 * Mirrors ccrm_auto_create_project_type_ids() in api/auth.php — the server is
 * what actually creates the projects; this is what lets the UI say what will
 * happen before a lead arrives.
 */
export function autoCreateTypeIdsForLead(
  config: ProjectAutoCreateSettings,
  categories: string[] | undefined,
  projectTypes: ProjectType[],
): string[] {
  if (!config.enabled) return [];
  const known = new Set(projectTypes.map((pt) => pt.id));

  // Category names reach us from a lead row, which may have been written when
  // the category was spelled differently; matching without regard to case
  // costs nothing and saves a silently unmatched lead.
  const byLowerName = new Map<string, string>();
  Object.entries(config.categoryTypes).forEach(([name, typeId]) => {
    byLowerName.set(name.trim().toLowerCase(), typeId);
  });

  const ids: string[] = [];
  (categories || []).forEach((name) => {
    const typeId = byLowerName.get(String(name || "").trim().toLowerCase());
    if (typeId && known.has(typeId) && !ids.includes(typeId)) ids.push(typeId);
  });

  if (ids.length) return ids;
  return known.has(config.projectTypeId) ? [config.projectTypeId] : [];
}

/**
 * The projects paired with a lead, newest first.
 *
 * Projects arrive from the server ordered by creation date descending, so the
 * filter preserves that; the client-side list prepends new projects, which
 * keeps the same order.
 */
export function projectsForLead(projects: Project[], leadId: string): Project[] {
  return projects.filter((p) => p.leadId === leadId);
}

/**
 * Projects that can be paired with a lead from the lead's own card: the ones
 * that belong to nobody yet.
 *
 * A project already paired elsewhere is deliberately not offered — re-pointing
 * it here would silently unpair it from the other lead, which is a decision to
 * make on the project itself, not a side effect of a dropdown.
 */
export function pairableProjects(projects: Project[]): Project[] {
  return projects.filter((p) => !p.leadId);
}
