import type { ProjectStatusDef, ProjectStatusGroup } from "./projects.ts";

/*
  ── PROJECT STATUS TREE ─────────────────────────────────

  A project status can sit under another one, the way a lead state can sit
  under a main state (the client's "Goods partly delivered 1…5" under "Goods
  delivered"). The link is `ProjectStatusDef.parent`, the key of the parent,
  stored inside the same PROJECT_STATUSES list — no column of its own.

  The rules, mirrored by ccrm_normalize_project_statuses() in api/auth.php:
    · one level only — a parent is itself a top-level status;
    · a sub-status always belongs to its parent's group (so it stamps the
      finish date, or stops the deadline, exactly like its parent does);
    · a sub-status is listed directly under its parent.
  A parent that is missing, is the status itself, or is itself a sub-status
  is dropped, which turns the status back into a top-level one.
*/

type Def = ProjectStatusDef;

/** A status and how deep it sits: 0 for a top-level status, 1 for a sub-status. */
export interface ProjectStatusRow {
  def: Def;
  depth: 0 | 1;
}

/** The parent each status really has once the broken links are dropped (key -> parent key). */
const effectiveParents = (defs: readonly Def[]): Map<string, string> => {
  const keys = new Set(defs.map((d) => d.key));
  const linked = new Map<string, string>();
  defs.forEach((d) => {
    const parent = d.parent ? String(d.parent).trim() : "";
    if (parent && parent !== d.key && keys.has(parent)) linked.set(d.key, parent);
  });
  // A parent that has a parent of its own would make a second level (or a loop): none of that survives.
  const out = new Map<string, string>();
  linked.forEach((parent, key) => {
    if (!linked.has(parent)) out.set(key, parent);
  });
  return out;
};

/**
 * The list in tree order — every top-level status followed by its sub-statuses,
 * otherwise in the order given. Does not regroup: see `arrangeProjectStatuses`.
 */
export const flattenProjectStatuses = (defs: readonly Def[]): ProjectStatusRow[] => {
  const parents = effectiveParents(defs);
  const out: ProjectStatusRow[] = [];
  defs.forEach((d) => {
    if (parents.has(d.key)) return;
    out.push({ def: d, depth: 0 });
    defs.forEach((child) => {
      if (parents.get(child.key) === d.key) out.push({ def: child, depth: 1 });
    });
  });
  return out;
};

/**
 * A list made consistent: broken parents dropped, every sub-status in its
 * parent's group, then ordered by group (in `groupOrder`) and tree.
 */
export const arrangeProjectStatuses = (defs: readonly Def[], groupOrder: readonly ProjectStatusGroup[]): Def[] => {
  const parents = effectiveParents(defs);
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const cleaned = defs.map((d): Def => {
    const rest: Def = { ...d };
    delete rest.parent;
    const parent = parents.get(d.key);
    return parent ? { ...rest, group: byKey.get(parent)!.group, parent } : rest;
  });
  return groupOrder.flatMap((g) => flattenProjectStatuses(cleaned.filter((d) => d.group === g)).map((r) => r.def));
};

/** The sub-statuses of `key`, in list order. */
export const projectStatusChildren = (key: string, defs: readonly Def[]): Def[] => {
  const parents = effectiveParents(defs);
  return defs.filter((d) => parents.get(d.key) === key);
};

/** The status `key` sits under, or undefined for a top-level (or unknown) one. */
export const projectStatusParent = (key: string | undefined | null, defs: readonly Def[]): Def | undefined => {
  const parentKey = effectiveParents(defs).get(String(key ?? "").trim());
  return parentKey ? defs.find((d) => d.key === parentKey) : undefined;
};

/** 1 for a sub-status, else 0. */
export const projectStatusDepth = (key: string | undefined | null, defs: readonly Def[]): 0 | 1 =>
  effectiveParents(defs).has(String(key ?? "").trim()) ? 1 : 0;

/** A status's own key and the keys of its sub-statuses: what filtering by the parent matches. */
export const projectStatusFamily = (key: string, defs: readonly Def[]): string[] => [
  key,
  ...projectStatusChildren(key, defs).map((d) => d.key),
];
