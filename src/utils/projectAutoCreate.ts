import type { Project, ProjectAutoCreateSettings, ProjectType } from "../types";

/** Auto-creation off — the behaviour every installation had before the setting existed. */
export const DEFAULT_PROJECT_AUTO_CREATE: ProjectAutoCreateSettings = {
  enabled: false,
  projectTypeId: "",
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
    // Assigning the lead's manager is the useful default; only an explicit
    // false turns it off.
    assignOwner: raw.assignOwner !== false,
  };
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
  return (
    config.enabled &&
    config.projectTypeId !== "" &&
    projectTypes.some((pt) => pt.id === config.projectTypeId)
  );
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
