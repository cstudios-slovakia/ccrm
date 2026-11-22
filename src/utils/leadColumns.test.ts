import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUILTIN_LEAD_COLUMNS,
  DEFAULT_HIDDEN_LEAD_COLUMNS,
  LOCKED_LEAD_COLUMN,
  attributeColumnKey,
  resolveLeadColumns,
  toStoredLeadColumns,
  moveLeadColumn,
} from "./leadColumns.ts";
import type { ProjectAttribute } from "../types/index.ts";

describe("leadColumns", () => {
  it("defaults to all built-in columns visible with client leading", () => {
    const cols = resolveLeadColumns(null);
    assert.equal(cols.length, BUILTIN_LEAD_COLUMNS.length);
    assert.equal(cols[0].key, LOCKED_LEAD_COLUMN);
    assert.equal(cols[0].visible, true);
    for (const c of cols) {
      assert.equal(c.visible, !DEFAULT_HIDDEN_LEAD_COLUMNS.includes(c.key as any));
    }
  });

  it("offers Division but keeps it off until someone switches it on", () => {
    assert.ok(BUILTIN_LEAD_COLUMNS.includes("division"));
    const fresh = resolveLeadColumns(null);
    assert.equal(fresh.find(c => c.key === "division")?.visible, false);
    const legacy = resolveLeadColumns([{ key: "client", visible: true }, { key: "city", visible: true }]);
    assert.equal(legacy.find(c => c.key === "division")?.visible, false);
    const on = resolveLeadColumns([{ key: "client", visible: true }, { key: "division", visible: true }]);
    assert.equal(on.find(c => c.key === "division")?.visible, true);
  });

  it("preserves custom visibility while keeping locked client column visible", () => {
    const cols = resolveLeadColumns([
      { key: "client", visible: false },
      { key: "city", visible: false },
      { key: "value", visible: true },
    ]);
    assert.equal(cols[0].key, "client");
    assert.equal(cols[0].visible, true);

    const cityCol = cols.find(c => c.key === "city");
    assert.equal(cityCol?.visible, false);

    assert.equal(cols.length, BUILTIN_LEAD_COLUMNS.length);
  });

  it("moves columns relatively but protects the locked column", () => {
    const cols = resolveLeadColumns(null);
    const noMove = moveLeadColumn(cols, "client", "city", "after");
    assert.deepEqual(noMove, cols);

    const moved = moveLeadColumn(cols, "city", "value", "after");
    const cityIdx = moved.findIndex(c => c.key === "city");
    const valueIdx = moved.findIndex(c => c.key === "value");
    assert.equal(cityIdx, valueIdx + 1);
  });

  it("appends new custom attributes hidden, keeps saved visibility, and drops removed attributes", () => {
    const attrs: ProjectAttribute[] = [
      { id: "lattr_1", name: "Roof Area", type: "number", required: false },
      { id: "lattr_2", name: "Segment", type: "select", required: false, options: ["B2B"] },
    ];
    const k1 = attributeColumnKey("lattr_1");
    const k2 = attributeColumnKey("lattr_2");

    // Brand new layout -> both custom attributes off by default
    const fresh = resolveLeadColumns(null, attrs);
    assert.equal(fresh.find(c => c.key === k1)?.visible, false);
    assert.equal(fresh.find(c => c.key === k1)?.attribute?.name, "Roof Area");
    assert.equal(fresh.find(c => c.key === k2)?.visible, false);

    // Saved layout with k1 enabled and stale removed attribute k_gone
    const saved = [
      { key: "client", visible: true },
      { key: k1, visible: true },
      { key: attributeColumnKey("gone"), visible: true },
    ];
    const reconciled = resolveLeadColumns(saved, attrs);
    assert.equal(reconciled.some(c => c.key === attributeColumnKey("gone")), false);
    assert.equal(reconciled.find(c => c.key === k1)?.visible, true);
    assert.equal(reconciled.find(c => c.key === k2)?.visible, false);

    // Reordering a custom attribute column works
    const reordered = moveLeadColumn(reconciled, k1, "city", "after");
    assert.equal(reordered.findIndex(c => c.key === k1), reordered.findIndex(c => c.key === "city") + 1);
  });

  it("serializes to stored format", () => {
    const cols = resolveLeadColumns(null);
    const stored = toStoredLeadColumns(cols);
    assert.equal(stored.length, cols.length);
    assert.equal(stored[0].key, "client");
    assert.equal(stored[0].visible, true);
  });
});
