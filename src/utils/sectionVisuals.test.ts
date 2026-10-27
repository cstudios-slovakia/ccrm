import assert from "node:assert/strict";
import test from "node:test";
import { SECTION_PALETTE } from "./sectionPalette.ts";

test("related sections share one group", () => {
  const pair = (a: string, b: string) => {
    const left = SECTION_PALETTE[a as keyof typeof SECTION_PALETTE];
    const right = SECTION_PALETTE[b as keyof typeof SECTION_PALETTE];
    assert.ok(left && right);
    assert.equal(left.group, right.group, `${a} and ${b}`);
  };
  pair("warehouse", "orders");
  pair("invoices", "financial");
  pair("rag_ai", "sai");
  pair("rag_ai", "automation");
  pair("meetings", "tasks");
  pair("tasks", "time-tracking");
  pair("leads", "clients");
  pair("clients", "employees");
  pair("projects", "tickets");
  pair("email", "social_media");
  pair("files", "updates");
  pair("dashboard", "overview");
});

test("orders is a sales-order list, not a shopping cart", () => {
  const orders = SECTION_PALETTE.orders;
  assert.equal(orders.glyph, "ClipboardList");
  assert.equal(orders.group, SECTION_PALETTE.warehouse.group);
});
