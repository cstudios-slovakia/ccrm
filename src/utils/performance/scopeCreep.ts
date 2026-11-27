/**
 * Scope creep (KPI 7): acceptance criteria added to a project after its scope was approved.
 *
 * Only non-archived projects with an approved scope count. Per project, `original` is the live
 * criteria created at or before the approval and `added` the live criteria created after it whose
 * `createdAt` (a UTC instant, read through `parseAppDate`) falls inside the period's local day bounds;
 * period "all" counts every addition. A removed criterion counts nowhere.
 */

import type { Project } from "../../types/index.ts";
import type { PerformancePeriod, ScopeCreepData } from "../../components/dashboard/performance/types.ts";
import { isAddedAfterApproval, liveCriteria } from "../acceptanceCriteria.ts";
import { isInRange, parseAppDate } from "./period.ts";

export interface ScopeCreepInput {
  projects: readonly Project[];
  period: PerformancePeriod;
  /** The project's display name; defaults to `name`, then the id. */
  nameOf?: (project: Project) => string;
}

const MAX_ROWS = 5;

export const computeScopeCreep = ({ projects, period, nameOf = (p) => p.name?.trim() || p.id }: ScopeCreepInput): ScopeCreepData => {
  let addedInPeriod = 0;
  let originalTotal = 0;
  const rows: ScopeCreepData["rows"] = [];

  for (const project of projects) {
    if (project.archived || !parseAppDate(project.scopeApprovedAt)) continue;
    let original = 0;
    let added = 0;
    for (const criterion of liveCriteria(project.acceptanceCriteria)) {
      if (!isAddedAfterApproval(criterion, project.scopeApprovedAt)) original += 1;
      else if (isInRange(parseAppDate(criterion.createdAt), period.start, period.end)) added += 1;
    }
    originalTotal += original;
    addedInPeriod += added;
    if (added > 0) {
      rows.push({ projectId: project.id, name: nameOf(project), original, added });
    }
  }

  rows.sort((a, b) => b.added - a.added || a.name.localeCompare(b.name));
  const top = rows.slice(0, MAX_ROWS);
  return {
    addedInPeriod,
    originalTotal,
    sharePct: originalTotal > 0 ? (addedInPeriod / originalTotal) * 100 : null,
    rows: top,
    scaleMax: top.reduce((max, row) => Math.max(max, row.original + row.added), 0) || 1,
  };
};
