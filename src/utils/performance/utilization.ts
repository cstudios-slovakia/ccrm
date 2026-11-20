/**
 * "Utilizácia · čas na bugoch" (KPI 2): per person and for the whole team, worked time on tasks of
 * category Bug ÷ all worked time in the period.
 *
 * Worked time is the entry's `workedMs` (see `labour.ts`); a running entry counts for nothing yet.
 * An entry is "on a bug" when its `taskId` belongs to a task whose `category` is Bug.
 */

import type { Employee, Task } from "../../types/index.ts";
import type { TimeEntry } from "../timeTracking.ts";
import type { PerformancePeriod, UtilizationData } from "../../components/dashboard/performance/types.ts";
import { isBugCategory } from "../taskCategory.ts";
import { entryInPeriod, entryWorkedMs } from "./labour.ts";

export interface UtilizationInput {
  entries: readonly TimeEntry[];
  tasks: readonly Pick<Task, "id" | "category">[];
  employees: readonly Pick<Employee, "id" | "userId" | "name">[];
  period: PerformancePeriod;
}

export const computeUtilization = ({ entries, tasks, employees, period }: UtilizationInput): UtilizationData => {
  const bugTaskIds = new Set<string>();
  for (const task of tasks) if (isBugCategory(task.category)) bugTaskIds.add(task.id);

  const byEmployeeId = new Map<string, Pick<Employee, "id" | "userId" | "name">>();
  const byUserId = new Map<string, Pick<Employee, "id" | "userId" | "name">>();
  for (const employee of employees) {
    byEmployeeId.set(employee.id, employee);
    if (employee.userId) byUserId.set(employee.userId, employee);
  }

  const people = new Map<string, { employeeId: string; name: string; bugMs: number; totalMs: number }>();
  let bugMs = 0;
  let totalMs = 0;

  for (const entry of entries) {
    if (!entryInPeriod(entry, period)) continue;
    const worked = entryWorkedMs(entry);
    if (worked <= 0) continue;

    const employee =
      (entry.employeeId ? byEmployeeId.get(entry.employeeId) : undefined) ?? (entry.userId ? byUserId.get(entry.userId) : undefined);
    // Someone the roster does not know still counts for the team, under their own id.
    const employeeId = employee?.id ?? entry.employeeId ?? entry.userId;
    if (!employeeId) continue;

    const bug = Boolean(entry.taskId) && bugTaskIds.has(entry.taskId as string);
    let person = people.get(employeeId);
    if (!person) {
      person = { employeeId, name: employee?.name?.trim() || employeeId, bugMs: 0, totalMs: 0 };
      people.set(employeeId, person);
    }
    person.totalMs += worked;
    totalMs += worked;
    if (bug) {
      person.bugMs += worked;
      bugMs += worked;
    }
  }

  const rows = [...people.values()]
    .map((person) => ({ ...person, sharePct: (person.bugMs / person.totalMs) * 100 }))
    .sort((a, b) => b.sharePct - a.sharePct || b.bugMs - a.bugMs || a.name.localeCompare(b.name));

  return { bugMs, totalMs, sharePct: totalMs > 0 ? (bugMs / totalMs) * 100 : null, rows };
};
