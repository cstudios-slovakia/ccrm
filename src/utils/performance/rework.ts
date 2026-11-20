/**
 * Rework: how often a finished task has to be reopened. Reads `Task.reopens`, the log the server
 * keeps (one `{ at, by }` per reopening, `at` a UTC instant). Reopenings made before the log
 * existed are not in it, so the figures start at zero and fill as tasks are reopened.
 *
 * A reopening is compared with the period as the instant it names, through `parseAppDate`, against
 * the local day bounds of the period. Archived tasks count like any other.
 */

import type { Employee, Project, Task } from "../../types/index.ts";
import type { PerformancePeriod, ReworkCountData, ReworkRatioData } from "../../components/dashboard/performance/types.ts";
import { isDoneTaskState } from "../projectTasks.ts";
import { isInRange, parseAppDate } from "./period.ts";
import { niceCeil } from "./scale.ts";
import { indexEmployeesByName, taskPeople } from "./tasks.ts";

/** How many of the task's reopenings fall inside the period. */
const reopeningsIn = (task: Task, period: PerformancePeriod): number => {
  let count = 0;
  for (const reopening of task.reopens ?? []) {
    if (isInRange(parseAppDate(reopening?.at), period.start, period.end)) count += 1;
  }
  return count;
};

export interface ReworkRatioInput {
  tasks: readonly Task[];
  employees: readonly Employee[];
  taskStates: string[];
  period: PerformancePeriod;
}

/**
 * Share of the tasks completed in the period that were reopened in it. A task counts as completed
 * in the period when it is done now with `completedAt` inside it, or when it was reopened inside it
 * (it had been completed before that). Per person a task counts once for each of its people
 * (`taskPeople`); only people with at least one counted task get a row, highest ratio first.
 */
export const computeReworkRatio = ({ tasks, employees, taskStates, period }: ReworkRatioInput): ReworkRatioData => {
  const employeeByName = indexEmployeesByName(employees);
  const rows = new Map<string, { employeeId: string; name: string; reopened: number; completed: number }>();
  let reopened = 0;
  let completed = 0;

  for (const task of tasks) {
    const wasReopened = reopeningsIn(task, period) > 0;
    const completedInPeriod =
      isDoneTaskState(task.status, taskStates) && isInRange(parseAppDate(task.completedAt), period.start, period.end);
    if (!wasReopened && !completedInPeriod) continue;

    completed += 1;
    if (wasReopened) reopened += 1;
    for (const { employeeId, name } of taskPeople(task, employeeByName)) {
      const row = rows.get(employeeId) ?? { employeeId, name, reopened: 0, completed: 0 };
      row.completed += 1;
      if (wasReopened) row.reopened += 1;
      rows.set(employeeId, row);
    }
  }

  const sorted = [...rows.values()]
    .map((row) => ({ ...row, ratePct: (row.reopened / row.completed) * 100 }))
    .sort((a, b) => b.ratePct - a.ratePct || b.reopened - a.reopened || a.name.localeCompare(b.name));

  return {
    ratePct: completed > 0 ? (reopened / completed) * 100 : null,
    reopened,
    completed,
    rows: sorted,
    scaleMax: niceCeil(sorted[0]?.ratePct ?? 0),
  };
};

export interface ReworkCountInput {
  tasks: readonly Task[];
  projects: readonly Project[];
  period: PerformancePeriod;
  /** The project's display name; defaults to `name`, then the id. */
  nameOf?: (project: Project) => string;
}

/**
 * Average reopenings per task that was reopened in the period (reopenings in the period divided by
 * the distinct tasks they belong to), and the same average for the five projects with the highest
 * one. Only tasks with a project count towards a project.
 */
export const computeReworkCount = ({
  tasks,
  projects,
  period,
  nameOf = (p) => p.name?.trim() || p.id,
}: ReworkCountInput): ReworkCountData => {
  let reopenings = 0;
  let reopenedTasks = 0;
  const perProject = new Map<string, { reopenings: number; tasks: number }>();

  for (const task of tasks) {
    const count = reopeningsIn(task, period);
    if (count === 0) continue;
    reopenings += count;
    reopenedTasks += 1;
    const projectId = task.relatedProjectId || "";
    if (!projectId) continue;
    const entry = perProject.get(projectId) ?? { reopenings: 0, tasks: 0 };
    entry.reopenings += count;
    entry.tasks += 1;
    perProject.set(projectId, entry);
  }

  const projectName = new Map(projects.map((p) => [p.id, nameOf(p)]));
  const byProject = [...perProject.entries()]
    .map(([projectId, e]) => ({ projectId, name: projectName.get(projectId) ?? projectId, average: e.reopenings / e.tasks }))
    .sort((a, b) => b.average - a.average || a.name.localeCompare(b.name))
    .slice(0, 5);

  return {
    average: reopenedTasks > 0 ? reopenings / reopenedTasks : null,
    byProject,
    scaleMax: niceCeil(byProject[0]?.average ?? 0),
  };
};
