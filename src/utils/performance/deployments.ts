/**
 * Deployments (KPI 15): GitHub pushes per project in the period and the time of the last one.
 *
 * The period itself is the server's job (`api/project_pushes.php` takes local-day bounds), so the
 * summary already holds only the period's counts; a project without a push in it has `pushes: 0`
 * and is not listed. `lastPushAt` of a row is that project's latest push of all time (UTC instant,
 * read through `parseAppDate`). A project the caller's list does not contain (an archived one the
 * caller left out, a deleted one) counts nowhere: neither in `total` nor in the rows, so the
 * headline always matches what the rows show. A summary entry whose timestamp cannot be read is
 * skipped as a row but its pushes still count.
 */

import type { Project } from "../../types/index.ts";
import type { DeploymentsData } from "../../components/dashboard/performance/types.ts";
import type { ProjectPushesOverview } from "../projectPushesApi.ts";
import { dayDiff, parseAppDate } from "./period.ts";

export interface DeploymentsInput {
  summary: ProjectPushesOverview;
  projects: readonly Project[];
  /** The one clock of the render pass. */
  now: Date;
  /** The project's display name. */
  nameOf: (project: Project) => string;
  /** A last push more than this many whole local days before `now` is stale. */
  staleDays?: number;
  limit?: number;
}

export const computeDeployments = ({ summary, projects, now, nameOf, staleDays = 14, limit = 5 }: DeploymentsInput): DeploymentsData => {
  const byId = new Map(projects.map((project) => [project.id, project]));
  let total = 0;
  const rows: DeploymentsData["rows"] = [];

  for (const entry of summary.projects) {
    const project = byId.get(entry.projectId);
    if (!project || entry.pushes <= 0) continue;
    total += entry.pushes;
    const lastPushAt = parseAppDate(entry.lastPushAt);
    if (!lastPushAt) continue;
    rows.push({
      projectId: project.id,
      name: nameOf(project),
      pushes: entry.pushes,
      lastPushAt,
      stale: dayDiff(lastPushAt, now) > staleDays,
    });
  }

  rows.sort((a, b) => b.pushes - a.pushes || b.lastPushAt.getTime() - a.lastPushAt.getTime() || a.name.localeCompare(b.name));
  const top = rows.slice(0, Math.max(0, limit));

  const lastProject = summary.lastPush ? byId.get(summary.lastPush.projectId) : undefined;
  const lastPushAt = lastProject ? parseAppDate(summary.lastPush?.pushedAt) : null;

  return {
    total,
    lastPushAt,
    lastPushProject: lastPushAt && lastProject ? nameOf(lastProject) : null,
    rows: top,
    scaleMax: top.reduce((max, row) => Math.max(max, row.pushes), 0) || 1,
  };
};
