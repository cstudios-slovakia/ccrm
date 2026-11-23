import test from "node:test";
import assert from "node:assert/strict";
import type { StatusStatGroup } from "../../components/GroupedStatusValueEquationStats.tsx";
import { buildInvoicingData } from "./invoicing.ts";

const item = (key: string, value: number, count: number, color = "#3b82f6") => ({ key, name: key.toUpperCase(), value, count, color });
const groups = [
  { id: "leads", name: "Pipeline", items: [item("new", 1000, 4), item("offer", 3000, 2), item("negotiation", 6000, 1)] },
  { id: "projects", name: "Projects", items: [item("active", 8000, 3), item("review", 2000, 1)] },
] as unknown as StatusStatGroup[];

test("totals, counts and shares with nothing excluded", () => {
  const d = buildInvoicingData(groups, []);
  assert.equal(d.pipeline.total, 10000);
  assert.equal(d.projects.total, 10000);
  assert.equal(d.total, 20000);
  assert.equal(d.pipeline.itemCount, 7);
  assert.equal(d.projects.itemCount, 4);
  assert.equal(d.itemCount, 11);
  assert.deepEqual([d.pipeline.includedStatuses, d.pipeline.totalStatuses], [3, 3]);
  assert.equal(d.pipelineSharePct, 50);
  assert.equal(d.projectsSharePct, 50);
});

test("an excluded status stays listed but leaves every sum (key format group:status)", () => {
  const d = buildInvoicingData(groups, ["leads:negotiation", "projects:review"]);
  assert.equal(d.pipeline.total, 4000);
  assert.equal(d.projects.total, 8000);
  assert.equal(d.pipeline.itemCount, 6);
  assert.equal(d.projects.itemCount, 3);
  assert.deepEqual([d.pipeline.includedStatuses, d.pipeline.totalStatuses], [2, 3]);
  assert.equal(d.pipeline.rows.length, 3);
  const row = d.pipeline.rows.find((r) => r.id === "leads:negotiation")!;
  assert.deepEqual([row.included, row.value, row.count, row.label, row.color], [false, 6000, 1, "NEGOTIATION", "#3b82f6"]);
  assert.equal(d.total, 12000);
  assert.ok(Math.abs(d.pipelineSharePct! - (4000 / 12000) * 100) < 1e-9);
});

test("row ids are the full exclusion keys, so equal status keys of two groups stay apart", () => {
  const shared = [
    { id: "leads", name: "Pipeline", items: [item("new", 100, 1)] },
    { id: "projects", name: "Projects", items: [item("new", 900, 2)] },
  ] as unknown as StatusStatGroup[];
  const d = buildInvoicingData(shared, ["projects:new"]);
  assert.deepEqual([d.pipeline.rows[0].id, d.projects.rows[0].id], ["leads:new", "projects:new"]);
  assert.deepEqual([d.pipeline.rows[0].included, d.projects.rows[0].included], [true, false]);
});

test("a key of the other group does not exclude", () => {
  assert.equal(buildInvoicingData(groups, ["projects:new"]).pipeline.total, 10000);
});

test("zero total: no shares; missing groups are empty with zeros", () => {
  const d = buildInvoicingData([], []);
  assert.equal(d.total, 0);
  assert.equal(d.itemCount, 0);
  assert.equal(d.pipelineSharePct, null);
  assert.equal(d.projectsSharePct, null);
  assert.deepEqual(d.pipeline, { rows: [], itemCount: 0, includedStatuses: 0, totalStatuses: 0, total: 0 });

  const allOff = buildInvoicingData(groups, ["leads:new", "leads:offer", "leads:negotiation", "projects:active", "projects:review"]);
  assert.equal(allOff.total, 0);
  assert.equal(allOff.pipelineSharePct, null);
  assert.equal(allOff.pipeline.includedStatuses, 0);
});

test("only one group present", () => {
  const d = buildInvoicingData([groups[1]], []);
  assert.equal(d.pipeline.total, 0);
  assert.equal(d.pipelineSharePct, 0);
  assert.equal(d.projectsSharePct, 100);
});
