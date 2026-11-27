import assert from "node:assert/strict";
import test from "node:test";
import { applyFacets, orderFacetOptions, toSelectionArray, withCounts } from "./facetedFilters.ts";

interface Lead { id: string; status: string; owner: string; parent?: string }

const leads: Lead[] = [
  { id: "1", status: "new", owner: "anna" },
  { id: "2", status: "contacted", owner: "anna" },
  { id: "3", status: "contacted", owner: "boris" },
  { id: "4", status: "won", owner: "carl" },
  { id: "5", status: "call", owner: "carl", parent: "contacted" },
];

const status = (selected: string[]) => ({
  id: "status",
  valuesOf: (l: Lead) => (l.parent ? [l.status, l.parent] : [l.status]),
  selected,
});
const owner = (selected: string[]) => ({ id: "owner", valuesOf: (l: Lead) => [l.owner], selected });

test("no selection filters nothing and counts everything", () => {
  const r = applyFacets(leads, [status([]), owner([])]);
  assert.equal(r.items.length, 5);
  assert.equal(r.counts.owner.get("anna"), 2);
  assert.equal(r.counts.status.get("contacted"), 3); // two own + one sub-stage
});

test("an option's count ignores its own facet but respects the others", () => {
  const r = applyFacets(leads, [status(["contacted"]), owner([])]);
  assert.deepEqual(r.items.map((l) => l.id), ["2", "3", "5"]);
  assert.equal(r.counts.owner.get("anna"), 1);
  assert.equal(r.counts.owner.get("boris"), 1);
  assert.equal(r.counts.owner.get("carl"), 1);
  // the status facet ignores its own selection
  assert.equal(r.counts.status.get("won"), 1);
});

test("two facets: the other facet narrows this one's counts", () => {
  const r = applyFacets(leads, [status(["contacted"]), owner(["anna"])]);
  assert.deepEqual(r.items.map((l) => l.id), ["2"]);
  assert.equal(r.counts.owner.get("boris"), 1); // owner counts see status=contacted only
  assert.equal(r.counts.owner.get("carl"), 1);
  assert.equal(r.counts.status.get("new"), 1); // status counts see owner=anna only
  assert.equal(r.counts.status.get("won"), undefined);
});

test("multi-select is a union within a facet", () => {
  const r = applyFacets(leads, [status(["new", "won"]), owner([])]);
  assert.deepEqual(r.items.map((l) => l.id), ["1", "4"]);
});

test("base filter applies to results and counts", () => {
  const r = applyFacets(leads, [status([]), owner([])], (l) => l.owner !== "carl");
  assert.equal(r.items.length, 3);
  assert.equal(r.counts.owner.get("carl"), undefined);
});

test("ordering puts non-matching options last but keeps selected ones up", () => {
  const options = withCounts(
    [{ value: "a", label: "A" }, { value: "b", label: "B" }, { value: "c", label: "C" }, { value: "d", label: "D" }],
    new Map([["b", 2], ["d", 1]]),
  );
  assert.deepEqual(orderFacetOptions(options, ["a"]).map((o) => o.value), ["a", "b", "d", "c"]);
  assert.deepEqual(orderFacetOptions(options, []).map((o) => o.value), ["b", "d", "a", "c"]);
});

test("a nested list keeps its order", () => {
  const options = [
    { value: "p", label: "P", count: 0 },
    { value: "c", label: "C", count: 3, indent: 1 },
  ];
  assert.deepEqual(orderFacetOptions(options, []).map((o) => o.value), ["p", "c"]);
});

test("old single-string filters migrate to arrays", () => {
  assert.deepEqual(toSelectionArray("all"), []);
  assert.deepEqual(toSelectionArray("contacted"), ["contacted"]);
  assert.deepEqual(toSelectionArray(["a", 3, "b"]), ["a", "b"]);
  assert.deepEqual(toSelectionArray(undefined), []);
});
