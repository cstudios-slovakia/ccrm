import test from "node:test";
import assert from "node:assert/strict";
import type { Employee, Project, Task } from "../../types/index.ts";
import { buildPeriod } from "./period.ts";
import { computeAssignedTasks, computeThroughput } from "./tasks.ts";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const NOW = new Date(2026, 10, 20, 15, 30); // 20 Nov 2026, 15:30
const STATES = ["To do", "In progress", "Done"];

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({ id, title: id, status: "To do", owner: "", assignedUsers: [], deadline: "2026-12-31", archived: false, ...over }) as unknown as Task;
const employees = [
  { id: "e1", name: "Anna Nová" },
  { id: "e2", name: "Boris" },
] as unknown as Employee[];

test("a task counts once per distinct name; names match employees; overdue honours the deadline time", () => {
  const tasks = [
    task("t1", { owner: "Anna Nová", assignedUsers: ["anna nová", "Boris"], deadline: "2026-11-19" }), // overdue; Anna once, Boris once
    task("t2", { owner: "Boris", deadline: "2026-11-20", deadlineTime: "10:00" }), // overdue (it is 15:30)
    task("t3", { owner: "Boris", deadline: "2026-11-20", deadlineTime: "18:00" }), // not yet
    task("t4", { owner: "Boris", deadline: "2026-11-20" }), // 23:59 default, not yet
    task("t5", { assignedUsers: ["Cyril"], deadline: "2026-11-01" }), // unmatched name keeps itself as id
    task("done", { owner: "Boris", status: "Done", deadline: "2026-11-01" }),
    task("archived", { owner: "Boris", archived: true }),
    task("nobody", {}),
  ];
  const data = computeAssignedTasks({ tasks, employees, taskStates: STATES, today: NOW });
  assert.deepEqual(data.rows, [
    { employeeId: "e2", name: "Boris", open: 4, overdue: 2 },
    { employeeId: "e1", name: "Anna Nová", open: 1, overdue: 1 },
    { employeeId: "Cyril", name: "Cyril", open: 1, overdue: 1 },
  ]);
  assert.equal(data.total, 6);
  assert.equal(data.overdue, 4);
  assert.equal(data.scaleMax, 4);
});

test("empty input", () => {
  assert.deepEqual(computeAssignedTasks({ tasks: [], employees: [], taskStates: STATES, today: NOW }), {
    total: 0,
    overdue: 0,
    rows: [],
    scaleMax: 0,
  });
});

/* ------------------------------------------------------------------ throughput */

const period = buildPeriod("custom", day(2026, 11, 1), day(2026, 11, 20), NOW); // previous: 12-31 Oct... 10 Oct-31 Oct
const projects = [{ id: "pa", name: "Alfa" }, { id: "pb", name: "Beta" }] as unknown as Project[];
const done = (id: string, createdAt: string, completedAt: string, over: Partial<Task> = {}): Task =>
  task(id, { status: "Done", createdAt, completedAt, ...over });

test("average days as a fraction, change against the previous period, fastest projects first", () => {
  const tasks = [
    done("a1", "2026-11-01 08:00", "2026-11-03 08:00", { relatedProjectId: "pa" }), // 2 days
    done("a2", "2026-11-01 08:00", "2026-11-05 08:00", { relatedProjectId: "pa" }), // 4 days -> Alfa 3
    done("b1", "2026-11-10 00:00", "2026-11-10 12:00", { relatedProjectId: "pb" }), // 0.5 days
    done("free", "2026-11-10 00:00", "2026-11-11 00:00"), // 1 day, no project
    done("prev", "2026-10-15 00:00", "2026-10-18 00:00"), // previous period: 3 days
    task("open", { createdAt: "2026-11-01 00:00" }), // not done
    done("nocreated", "", "2026-11-05 00:00"), // cannot be measured
  ];
  const t = computeThroughput({ tasks, projects, taskStates: STATES, period });
  assert.equal(t.averageDays, (2 + 4 + 0.5 + 1) / 4);
  assert.equal(t.deltaDays, (2 + 4 + 0.5 + 1) / 4 - 3);
  assert.deepEqual(t.byProject, [
    { projectId: "pb", name: "Beta", days: 0.5 },
    { projectId: "pa", name: "Alfa", days: 3 },
  ]);
  assert.equal(t.scaleMax, 3);
});

test("nameOf names the projects of byProject; the default stays name, then id", () => {
  const tasks = [done("a1", "2026-11-01 08:00", "2026-11-03 08:00", { relatedProjectId: "pa" })];
  const byName = computeThroughput({ tasks, projects, taskStates: STATES, period, nameOf: (p) => `<${p.id}>` });
  assert.equal(byName.byProject[0].name, "<pa>");
  assert.equal(computeThroughput({ tasks, projects, taskStates: STATES, period }).byProject[0].name, "Alfa");
});

test("byProject keeps the five fastest and scales to the slowest listed", () => {
  const tasks = Array.from({ length: 7 }, (_, i) =>
    done(`t${i}`, "2026-11-01 00:00", `2026-11-${String(2 + i).padStart(2, "0")} 00:00`, { relatedProjectId: `p${i}` }),
  );
  const t = computeThroughput({ tasks, projects: [], taskStates: STATES, period });
  assert.deepEqual(t.byProject.map((p) => [p.projectId, p.days]), [["p0", 1], ["p1", 2], ["p2", 3], ["p3", 4], ["p4", 5]]);
  assert.equal(t.byProject[0].name, "p0"); // unknown project keeps its id
  assert.equal(t.scaleMax, 5);
});

test("period boundary on the completion day: first and last day in, day before and after out", () => {
  const at = (completedAt: string) =>
    computeThroughput({ tasks: [done("x", "2026-10-01 00:00", completedAt)], projects: [], taskStates: STATES, period }).averageDays;
  assert.notEqual(at("2026-11-01 00:00"), null);
  assert.notEqual(at("2026-11-20 23:59"), null);
  assert.equal(at("2026-10-31 23:59"), null);
  assert.equal(at("2026-11-21 00:00"), null);
});

test("empty input, all time and a task completed before it was created", () => {
  const empty = computeThroughput({ tasks: [], projects: [], taskStates: STATES, period });
  assert.deepEqual(empty, { averageDays: null, deltaDays: null, byProject: [], scaleMax: 1 });

  const all = buildPeriod("all", null, null, NOW);
  const t = computeThroughput({ tasks: [done("x", "2026-11-05 00:00", "2026-11-01 00:00"), done("y", "2026-01-01 00:00", "2026-01-03 00:00")], projects: [], taskStates: STATES, period: all });
  assert.equal(t.averageDays, 1); // (0 + 2) / 2
  assert.equal(t.deltaDays, null);
});
