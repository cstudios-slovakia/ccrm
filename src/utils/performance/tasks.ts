/**
 * Tím a úlohy: open tasks per assignee, and how long finished tasks took.
 * Both read real tasks only: recurring templates are a separate list and never reach here.
 */

import type { Employee, Project, Task } from "../../types/index.ts";
import type { AssignedTasksData, PerformancePeriod, ThroughputData } from "../../components/dashboard/performance/types.ts";
import { isDoneTaskState, isTaskOverdue, localStampStr } from "../projectTasks.ts";
import { isInRange, parseAppDate } from "./period.ts";
import { niceCeil } from "./scale.ts";

const DAY_MS = 86_400_000;

const nameKey = (name: string): string => name.trim().toLowerCase();

export interface AssignedTasksInput {
  tasks: readonly Task[];
  employees: readonly Employee[];
  taskStates: string[];
  today: Date;
}

/** Employees by lower-cased name; the first one wins when two share a name. */
export const indexEmployeesByName = (employees: readonly Employee[]): Map<string, Employee> => {
  const byName = new Map<string, Employee>();
  for (const e of employees) {
    const key = nameKey(e.name || "");
    if (key && !byName.has(key)) byName.set(key, e);
  }
  return byName;
};

/**
 * The people a task belongs to: one entry for every distinct name among `owner` and `assignedUsers`.
 * A name is matched to an employee by `Employee.name` (case-insensitive); an unmatched name keeps
 * itself as the id. A task nobody is assigned to has none.
 */
export const taskPeople = (task: Task, employeeByName: ReadonlyMap<string, Employee>): { employeeId: string; name: string }[] => {
  const people: { employeeId: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const raw of [task.owner, ...(task.assignedUsers ?? [])]) {
    const name = (raw ?? "").trim();
    if (!name || seen.has(nameKey(name))) continue;
    seen.add(nameKey(name));
    const employee = employeeByName.get(nameKey(name));
    people.push({ employeeId: employee?.id ?? name, name: employee?.name || name });
  }
  return people;
};

/**
 * Open tasks (not done, not archived) per person. A task counts once for every person of
 * `taskPeople`. Overdue honours `deadlineTime` through `isTaskOverdue`. The period does not apply.
 */
export const computeAssignedTasks = ({ tasks, employees, taskStates, today }: AssignedTasksInput): AssignedTasksData => {
  const employeeByName = indexEmployeesByName(employees);
  const nowStamp = localStampStr(today);
  const rows = new Map<string, { employeeId: string; name: string; open: number; overdue: number }>();

  for (const task of tasks) {
    if (task.archived || isDoneTaskState(task.status, taskStates)) continue;
    const overdue = isTaskOverdue(task, taskStates, nowStamp);

    for (const { employeeId, name } of taskPeople(task, employeeByName)) {
      const row = rows.get(employeeId) ?? { employeeId, name, open: 0, overdue: 0 };
      row.open += 1;
      if (overdue) row.overdue += 1;
      rows.set(employeeId, row);
    }
  }

  const sorted = [...rows.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  return {
    total: sorted.reduce((sum, r) => sum + r.open, 0),
    overdue: sorted.reduce((sum, r) => sum + r.overdue, 0),
    rows: sorted,
    scaleMax: sorted[0]?.open ?? 0,
  };
};

export interface ThroughputInput {
  tasks: readonly Task[];
  projects: readonly Project[];
  taskStates: string[];
  period: PerformancePeriod;
  /** The project's display name; defaults to `name`, then the id. */
  nameOf?: (project: Project) => string;
}

/** Days from creation to completion of the done tasks completed in the range, with the project each belongs to. */
const finishedIn = (tasks: readonly Task[], taskStates: string[], start: Date | null, end: Date | null) => {
  const out: { days: number; projectId: string | undefined }[] = [];
  for (const task of tasks) {
    if (!isDoneTaskState(task.status, taskStates)) continue;
    const completed = parseAppDate(task.completedAt);
    const created = parseAppDate(task.createdAt);
    if (!completed || !created || !isInRange(completed, start, end)) continue;
    out.push({ days: Math.max(0, (completed.getTime() - created.getTime()) / DAY_MS), projectId: task.relatedProjectId || undefined });
  }
  return out;
};

const mean = (values: readonly number[]): number | null =>
  values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

/**
 * Average time from creating a task to finishing it, for tasks completed in the period (days as a
 * fraction), the change against the previous period, and the fastest projects.
 */
export const computeThroughput = ({
  tasks,
  projects,
  taskStates,
  period,
  nameOf = (p) => p.name?.trim() || p.id,
}: ThroughputInput): ThroughputData => {
  const current = finishedIn(tasks, taskStates, period.start, period.end);
  const averageDays = mean(current.map((t) => t.days));

  let deltaDays: number | null = null;
  if (period.previousStart && period.previousEnd && averageDays !== null) {
    const previous = mean(finishedIn(tasks, taskStates, period.previousStart, period.previousEnd).map((t) => t.days));
    if (previous !== null) deltaDays = averageDays - previous;
  }

  const projectName = new Map(projects.map((p) => [p.id, nameOf(p)]));
  const perProject = new Map<string, number[]>();
  for (const { days, projectId } of current) {
    if (!projectId) continue;
    const list = perProject.get(projectId);
    if (list) list.push(days);
    else perProject.set(projectId, [days]);
  }
  const byProject = [...perProject.entries()]
    .map(([projectId, days]) => ({ projectId, name: projectName.get(projectId) ?? projectId, days: mean(days) ?? 0 }))
    .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name))
    .slice(0, 5);

  return {
    averageDays,
    deltaDays,
    byProject,
    scaleMax: niceCeil(byProject.reduce((max, p) => Math.max(max, p.days), 0)),
  };
};
