/**
 * "Termíny projektov": active projects by how close their completion deadline is.
 * Counters cover every active project that has a deadline; the list shows the nearest few.
 */

import type { Project } from "../../types/index.ts";
import type { DeadlineRow, DeadlineTone, DeadlinesData } from "../../components/dashboard/performance/types.ts";
import { dayDiff, parseAppDate, startOfDay } from "./period.ts";

export interface DeadlinesInput {
  projects: readonly Project[];
  /** The project-status rule of the installation (`openProjectStatuses`): is this project still being worked on? */
  isActive: (project: Project) => boolean;
  clientNameOf: (project: Project) => string;
  today: Date;
  /** A deadline up to this many days ahead (today included) is "soon". Default 14. */
  soonDays?: number;
  /** Rows listed. Default 7. */
  limit?: number;
  /** The project's display name; defaults to `name`, then the id. */
  nameOf?: (project: Project) => string;
}

export const computeDeadlines = ({
  projects,
  isActive,
  clientNameOf,
  today,
  soonDays = 14,
  limit = 7,
  nameOf = (p) => p.name?.trim() || p.id,
}: DeadlinesInput): DeadlinesData => {
  const todayStart = startOfDay(today);
  const counts: Record<DeadlineTone, number> = { overdue: 0, soon: 0, later: 0 };
  const rows: DeadlineRow[] = [];

  for (const project of projects) {
    if (project.archived || !isActive(project)) continue;
    const deadline = parseAppDate(project.completionDeadline);
    if (!deadline) continue;

    const daysFromToday = dayDiff(todayStart, deadline);
    const tone: DeadlineTone = daysFromToday < 0 ? "overdue" : daysFromToday <= soonDays ? "soon" : "later";
    counts[tone] += 1;
    rows.push({ projectId: project.id, name: nameOf(project), clientName: clientNameOf(project), deadline, daysFromToday, tone });
  }

  rows.sort((a, b) => a.deadline.getTime() - b.deadline.getTime() || a.name.localeCompare(b.name));
  return { ...counts, rows: rows.slice(0, Math.max(0, limit)) };
};
