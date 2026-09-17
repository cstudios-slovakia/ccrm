import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PROJECT_SORT,
  nextProjectSort,
  normalizeProjectSort,
  sortProjects,
  type ProjectSortValues,
} from "./projectSort.ts";

type Row = { id: string } & Partial<ProjectSortValues>;

const rows: Row[] = [
  { id: "p1", name: "Roof 10", rating: 3, deadline: "2026-10-01", progress: 40, statusRank: 1 },
  { id: "p2", name: "attic", rating: null, deadline: null, progress: null, statusRank: 0 },
  { id: "p3", name: "Roof 9", rating: 5, deadline: "2026-09-20", progress: 90, statusRank: 1 },
  { id: "p4", name: "", rating: 1, deadline: "2026-12-31", progress: 0, statusRank: 2 },
];

const values = (r: Row): ProjectSortValues => ({
  name: r.name ?? "",
  client: "",
  type: "",
  managers: "",
  rating: r.rating ?? null,
  deadline: r.deadline ?? null,
  progress: r.progress ?? null,
  statusRank: r.statusRank ?? 0,
});

const order = (sorted: Row[]) => sorted.map((r) => r.id);

test("the default order is the stored order", () => {
  assert.deepEqual(order(sortProjects(rows, DEFAULT_PROJECT_SORT, values)), ["p1", "p2", "p3", "p4"]);
});

test("names sort case-insensitively and numerically, empty last", () => {
  assert.deepEqual(order(sortProjects(rows, { key: "name", direction: "asc" }, values)), ["p2", "p3", "p1", "p4"]);
  assert.deepEqual(order(sortProjects(rows, { key: "name", direction: "desc" }, values)), ["p1", "p3", "p2", "p4"]);
});

test("projects without a deadline stay at the bottom in both directions", () => {
  assert.deepEqual(order(sortProjects(rows, { key: "deadline", direction: "asc" }, values)), ["p3", "p1", "p4", "p2"]);
  assert.deepEqual(order(sortProjects(rows, { key: "deadline", direction: "desc" }, values)), ["p4", "p1", "p3", "p2"]);
});

test("zero progress is a value, not an empty one", () => {
  assert.deepEqual(order(sortProjects(rows, { key: "progress", direction: "asc" }, values)), ["p4", "p1", "p3", "p2"]);
});

test("an unrated project sorts last whichever way the stars go", () => {
  assert.deepEqual(order(sortProjects(rows, { key: "rating", direction: "asc" }, values)), ["p4", "p1", "p3", "p2"]);
  assert.deepEqual(order(sortProjects(rows, { key: "rating", direction: "desc" }, values)), ["p3", "p1", "p4", "p2"]);
});

test("status follows the workflow rank and ties keep the stored order", () => {
  assert.deepEqual(order(sortProjects(rows, { key: "status", direction: "asc" }, values)), ["p2", "p1", "p3", "p4"]);
});

test("sorting never mutates the input", () => {
  const copy = rows.slice();
  sortProjects(rows, { key: "name", direction: "desc" }, values);
  assert.deepEqual(rows, copy);
});

test("header clicks cycle ascending, descending, back to the default", () => {
  const asc = nextProjectSort(DEFAULT_PROJECT_SORT, "deadline");
  assert.deepEqual(asc, { key: "deadline", direction: "asc" });
  const desc = nextProjectSort(asc, "deadline");
  assert.deepEqual(desc, { key: "deadline", direction: "desc" });
  assert.deepEqual(nextProjectSort(desc, "deadline"), DEFAULT_PROJECT_SORT);
  assert.deepEqual(nextProjectSort(desc, "name"), { key: "name", direction: "asc" });
});

test("a stored preference is validated", () => {
  assert.deepEqual(normalizeProjectSort({ key: "rating", direction: "desc" }), { key: "rating", direction: "desc" });
  assert.deepEqual(normalizeProjectSort({ key: "deadline", direction: "desc" }), { key: "deadline", direction: "desc" });
  assert.deepEqual(normalizeProjectSort({ key: "bogus", direction: "sideways" }), DEFAULT_PROJECT_SORT);
  assert.deepEqual(normalizeProjectSort(null), DEFAULT_PROJECT_SORT);
});
