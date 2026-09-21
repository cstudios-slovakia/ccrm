import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PROJECT_SORT,
  isAttributeSortKey,
  newestFirst,
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

test("an attribute column's key survives being stored, a bare prefix does not", () => {
  // This module cannot check that the attribute exists — the view drops the
  // sort when the column is not on screen.
  assert.deepEqual(normalizeProjectSort({ key: "attr:a1", direction: "desc" }), { key: "attr:a1", direction: "desc" });
  assert.deepEqual(normalizeProjectSort({ key: "attr:", direction: "asc" }), DEFAULT_PROJECT_SORT);
  assert.equal(isAttributeSortKey("attr:a1"), true);
  assert.equal(isAttributeSortKey("status"), false);
});

test("an attribute column sorts by its own values, blanks last", () => {
  const attrRows = [
    { id: "p1", attributes: { "attr:a1": 20 } },
    { id: "p2", attributes: {} },
    { id: "p3", attributes: { "attr:a1": 5 } },
  ];
  const attrValues = (r: (typeof attrRows)[number]): ProjectSortValues => ({
    ...values({ id: r.id }),
    attributes: r.attributes,
  });

  assert.deepEqual(
    sortProjects(attrRows, { key: "attr:a1", direction: "asc" }, attrValues).map(r => r.id),
    ["p3", "p1", "p2"],
  );
  assert.deepEqual(
    sortProjects(attrRows, { key: "attr:a1", direction: "desc" }, attrValues).map(r => r.id),
    ["p1", "p3", "p2"],
  );
});

test("a project of a type without the attribute sorts as a blank, not a crash", () => {
  // `attributes` is absent entirely for a row of another project type.
  const mixed = [{ id: "p1" }, { id: "p2", attributes: { "attr:a1": "x" } }];
  const mixedValues = (r: (typeof mixed)[number]): ProjectSortValues => ({
    ...values({ id: r.id }),
    attributes: (r as any).attributes,
  });
  assert.deepEqual(
    sortProjects(mixed, { key: "attr:a1", direction: "asc" }, mixedValues).map(r => r.id),
    ["p2", "p1"],
  );
});

test("newestFirst orders by creation date, whatever order the list arrives in", () => {
  const projects = [
    { id: "old", createdAt: "2026-01-01 10:00:00" },
    { id: "new", createdAt: "2026-09-01 08:30:00" },
    { id: "mid", createdAt: "2026-05-15 12:00:00" },
  ];
  assert.deepEqual(newestFirst(projects).map((p) => p.id), ["new", "mid", "old"]);
});

test("newestFirst puts a project not yet synced (no createdAt) on top and keeps ties in place", () => {
  const projects = [
    { id: "a", createdAt: "2026-03-01 10:00:00" },
    { id: "fresh1" },
    { id: "b", createdAt: "2026-03-01 10:00:00" },
    { id: "fresh2", createdAt: null },
  ];
  assert.deepEqual(newestFirst(projects).map((p) => p.id), ["fresh1", "fresh2", "a", "b"]);
});

test("newestFirst sorts a copy", () => {
  const projects = [{ id: "old", createdAt: "2026-01-01 00:00:00" }, { id: "new", createdAt: "2026-02-01 00:00:00" }];
  newestFirst(projects);
  assert.deepEqual(projects.map((p) => p.id), ["old", "new"]);
});
