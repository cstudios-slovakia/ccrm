// What the server withheld from this session's last sync GET (sync.php `readScope`).
//
// A collection the caller may not read arrives as an EMPTY array, never omitted
// (an omitted key would leave the previous role's data on screen). `restricted`
// names those collections so a view can tell "empty because nothing exists" from
// "empty because you may not see it"; `rowScoped` names collections that arrive
// filtered to the caller's own rows (tasks without tasks.view_all, leads when only
// one of leads/clients is readable).

export type ReadScope = {
  restricted: string[];
  rowScoped: string[];
  /** Display names only, for records a visible row points at but the caller may not open. */
  referenceNames: {
    leads: Record<string, string>;
    projects: Record<string, string>;
  };
};

export const EMPTY_READ_SCOPE: ReadScope = {
  restricted: [],
  rowScoped: [],
  referenceNames: { leads: {}, projects: {} },
};

const asStringMap = (value: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [id, name] of Object.entries(value as Record<string, unknown>)) {
      if (typeof name === "string") out[id] = name;
    }
  }
  return out;
};

/** Normalise whatever the server sent. An older server sends nothing: that is "no restriction". */
export const parseReadScope = (raw: unknown): ReadScope => {
  if (!raw || typeof raw !== "object") return EMPTY_READ_SCOPE;
  const r = raw as Record<string, any>;
  const names = (r.referenceNames ?? {}) as Record<string, unknown>;
  return {
    restricted: Array.isArray(r.restricted) ? r.restricted.filter((k: unknown) => typeof k === "string") : [],
    rowScoped: Array.isArray(r.rowScoped) ? r.rowScoped.filter((k: unknown) => typeof k === "string") : [],
    referenceNames: { leads: asStringMap(names.leads), projects: asStringMap(names.projects) },
  };
};

export const isRestricted = (scope: ReadScope, collection: string): boolean =>
  scope.restricted.includes(collection);

export const referenceLeadName = (scope: ReadScope, leadId: string | number | null | undefined): string | undefined =>
  leadId == null || leadId === "" ? undefined : scope.referenceNames.leads[String(leadId)];

export const referenceProjectName = (scope: ReadScope, projectId: string | number | null | undefined): string | undefined =>
  projectId == null || projectId === "" ? undefined : scope.referenceNames.projects[String(projectId)];

/** Keep React from re-rendering every consumer when a poll returns an identical scope. */
export const sameReadScope = (a: ReadScope, b: ReadScope): boolean => JSON.stringify(a) === JSON.stringify(b);
