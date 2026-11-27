import test from "node:test";
import assert from "node:assert/strict";
import type { Employee, Project, Task } from "../../types/index.ts";
import { buildPeriod } from "./period.ts";
import { computeReworkCount, computeReworkRatio } from "./rework.ts";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const NOW = new Date(2026, 10, 20, 15, 30);
const STATES = ["To do", "In progress", "Done"];
const period = buildPeriod("custom", day(2026, 11, 1), day(2026, 11, 20), NOW); // 1 Nov 00:00 - 20 Nov 23:59:59.999 local
const ALL = buildPeriod("all", null, null, NOW);

/** The UTC instant ("...Z") of a local wall-clock time, so the tests hold in any time zone. */
const utc = (y: number, m: number, d: number, hh: number, mm = 0): string => new Date(y, m - 1, d, hh, mm).toISOString();

const reopen = (at: string, by: string | null = "Anna Nová") => ({ at, by });
const task = (id: string, over: Partial<Task> = {}): Task =>
  ({ id, title: id, status: "To do", owner: "", assignedUsers: [], deadline: "2026-12-31", archived: false, ...over }) as unknown as Task;
const employees = [
  { id: "e1", name: "Anna Nová" },
  { id: "e2", name: "Boris" },
] as unknown as Employee[];
const projects = [{ id: "pa", name: "Alfa" }, { id: "pb", name: "Beta" }] as unknown as Project[];

/* ------------------------------------------------------------------ ratio */

test("empty input: nothing completed, no ratio, no rows", () => {
  const data = computeReworkRatio({ tasks: [], employees: [], taskStates: STATES, period });
  assert.deepEqual(data, { ratePct: null, reopened: 0, completed: 0, rows: [], scaleMax: 1 });
});

test("zero denominator: tasks outside the period never divide by zero", () => {
  const tasks = [
    task("old", { status: "Done", owner: "Boris", completedAt: "2026-10-05 10:00" }),
    task("open", { owner: "Boris" }),
    task("old-reopen", { owner: "Boris", reopens: [reopen(utc(2026, 10, 5, 10))] }),
  ];
  const data = computeReworkRatio({ tasks, employees, taskStates: STATES, period });
  assert.equal(data.ratePct, null);
  assert.equal(data.completed, 0);
  assert.deepEqual(data.rows, []);
});

test("ratio per employee: done in the period plus reopened in the period, highest ratio first", () => {
  const tasks = [
    task("a1", { status: "Done", owner: "Anna Nová", completedAt: "2026-11-05 09:00" }),
    task("a2", { status: "Done", owner: "Anna Nová", completedAt: "2026-11-06 09:00", reopens: [reopen(utc(2026, 11, 7, 8))] }),
    task("b1", { status: "Done", owner: "Boris", completedAt: "2026-11-08 09:00" }),
    task("b2", { status: "Done", owner: "Boris", completedAt: "2026-11-09 09:00" }),
    task("b3", { status: "Done", owner: "Boris", completedAt: "2026-11-10 09:00" }),
    task("b4", { owner: "Boris", reopens: [reopen(utc(2026, 11, 11, 8))] }), // open now, reopened in the period
  ];
  const data = computeReworkRatio({ tasks, employees, taskStates: STATES, period });
  assert.equal(data.completed, 6);
  assert.equal(data.reopened, 2);
  assert.equal(data.ratePct, (2 / 6) * 100);
  assert.deepEqual(
    data.rows.map((r) => [r.name, r.reopened, r.completed]),
    [["Anna Nová", 1, 2], ["Boris", 1, 4]],
  );
  assert.equal(data.rows[0]?.ratePct, 50);
  assert.equal(data.rows[1]?.ratePct, 25);
  assert.equal(data.scaleMax, 50); // niceCeil(50)
});

test("period boundary: 23:30 local on the last day is in, 00:30 the next day is out", () => {
  const inside = utc(2026, 11, 20, 23, 30);
  const outside = utc(2026, 11, 21, 0, 30);
  assert.match(inside, /Z$/);
  const tasks = [
    task("in", { owner: "Boris", reopens: [reopen(inside)] }),
    task("out", { owner: "Boris", reopens: [reopen(outside)] }),
  ];
  const data = computeReworkRatio({ tasks, employees, taskStates: STATES, period });
  assert.equal(data.completed, 1);
  assert.equal(data.reopened, 1);
  assert.equal(computeReworkCount({ tasks, projects, period }).average, 1);
});

test("a task reopened twice counts once; one reopened in the period but completed before it also counts", () => {
  const tasks = [
    task("twice", { status: "Done", owner: "Boris", completedAt: "2026-11-12 10:00", reopens: [reopen(utc(2026, 11, 10, 8)), reopen(utc(2026, 11, 12, 8))] }),
    task("before", { owner: "Boris", reopens: [reopen(utc(2026, 10, 1, 8)), reopen(utc(2026, 11, 3, 8))] }), // first one outside, second inside
  ];
  const data = computeReworkRatio({ tasks, employees, taskStates: STATES, period });
  assert.equal(data.completed, 2);
  assert.equal(data.reopened, 2);
  assert.equal(data.ratePct, 100);
  assert.deepEqual(data.rows, [{ employeeId: "e2", name: "Boris", reopened: 2, completed: 2, ratePct: 100 }]);
});

test("a multi-assignee task counts once for each distinct name, matched to employees", () => {
  const tasks = [
    task("team", {
      status: "Done",
      owner: "Anna Nová",
      assignedUsers: ["anna nová", "Boris", "Cyril"],
      completedAt: "2026-11-05 09:00",
      reopens: [reopen(utc(2026, 11, 6, 8))],
    }),
  ];
  const data = computeReworkRatio({ tasks, employees, taskStates: STATES, period });
  assert.equal(data.completed, 1); // the task itself counts once
  assert.deepEqual(
    data.rows.map((r) => [r.employeeId, r.reopened, r.completed]).sort(),
    [["Cyril", 1, 1], ["e1", 1, 1], ["e2", 1, 1]],
  );
});

test("archived tasks count; period all has no bounds", () => {
  const tasks = [
    task("arch", { archived: true, status: "Done", owner: "Boris", completedAt: "2020-01-01 10:00", reopens: [reopen("2020-01-02T08:00:00Z")] }),
  ];
  const data = computeReworkRatio({ tasks, employees, taskStates: STATES, period: ALL });
  assert.equal(data.completed, 1);
  assert.equal(data.reopened, 1);
});

/* ------------------------------------------------------------------ count */

test("count: empty input", () => {
  assert.deepEqual(computeReworkCount({ tasks: [], projects: [], period }), { average: null, byProject: [], scaleMax: 1 });
});

test("count: nameOf names the projects; the default stays name, then id", () => {
  const tasks = [task("t1", { relatedProjectId: "pa", reopens: [reopen(utc(2026, 11, 2, 8))] })];
  assert.equal(computeReworkCount({ tasks, projects, period, nameOf: (p) => `<${p.id}>` }).byProject[0].name, "<pa>");
  assert.equal(computeReworkCount({ tasks, projects, period }).byProject[0].name, "Alfa");
});

test("count: reopenings in the period over distinct reopened tasks, by project, highest first", () => {
  const tasks = [
    task("t1", { relatedProjectId: "pa", reopens: [reopen(utc(2026, 11, 2, 8)), reopen(utc(2026, 11, 4, 8)), reopen(utc(2026, 11, 6, 8))] }), // 3
    task("t2", { relatedProjectId: "pa", reopens: [reopen(utc(2026, 11, 3, 8)), reopen(utc(2026, 9, 3, 8))] }), // 1 in the period
    task("t3", { relatedProjectId: "pb", reopens: [reopen(utc(2026, 11, 3, 8)), reopen(utc(2026, 11, 5, 8))] }), // 2
    task("t4", { reopens: [reopen(utc(2026, 11, 9, 8))] }), // no project: in the overall average only
    task("t5", { relatedProjectId: "pb", reopens: [reopen(utc(2026, 8, 3, 8))] }), // outside
    task("t6", { relatedProjectId: "pb" }), // never reopened
  ];
  const data = computeReworkCount({ tasks, projects, period });
  assert.equal(data.average, 7 / 4);
  assert.deepEqual(data.byProject, [
    { projectId: "pa", name: "Alfa", average: 2 }, // (3 + 1) / 2 tasks; ties by name
    { projectId: "pb", name: "Beta", average: 2 },
  ]);
  assert.equal(data.scaleMax, 2);
});

test("count: at most five projects", () => {
  const many = Array.from({ length: 7 }, (_, i) =>
    task(`t${i}`, { relatedProjectId: `p${i}`, reopens: [reopen(utc(2026, 11, 2, 8))] }),
  );
  const data = computeReworkCount({ tasks: many, projects: [], period });
  assert.equal(data.byProject.length, 5);
  assert.equal(data.byProject[0]?.name, "p0"); // unknown project keeps its id as name
});
