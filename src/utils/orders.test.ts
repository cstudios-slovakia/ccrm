import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ORDER_STATUS_DEFS,
  defaultOrderStatus,
  orderStatusLabel,
  orderStatusColor,
  isTerminalOrderStatus,
  normalizeOrderStatusDefs,
  calculateOrderItemTotals,
  calculateOrderTotals,
  generateOrderNumber,
  type OrderStatusDef,
} from "./orders.ts";

test("normalizeOrderStatusDefs handles defaults and malformed data", () => {
  assert.equal(normalizeOrderStatusDefs(null).length, DEFAULT_ORDER_STATUS_DEFS.length);
  assert.equal(normalizeOrderStatusDefs("bad").length, DEFAULT_ORDER_STATUS_DEFS.length);
  assert.equal(normalizeOrderStatusDefs([]).length, DEFAULT_ORDER_STATUS_DEFS.length); // no "new" group -> fallback

  const custom: OrderStatusDef[] = [
    { key: "new", color: "#123456", group: "new", label: "Brand New" },
    { key: "in_transit", color: "#654321", group: "shipped" },
  ];
  const normalized = normalizeOrderStatusDefs(custom);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].key, "new");
  assert.equal(normalized[0].label, "Brand New");
  assert.equal(normalized[1].group, "shipped");
});

test("orderStatusLabel handles custom label, builtin translation, and fallback", () => {
  const t = (en: string, sk: string, hu: string) => sk;
  assert.equal(orderStatusLabel("new", t), "Nová objednávka");
  assert.equal(orderStatusLabel("shipped", t), "Odoslaná / V preprave");

  const customDefs: OrderStatusDef[] = [
    { key: "custom_pack", label: "Zabalené v bublinkách", color: "#ffffff", group: "processing" },
  ];
  assert.equal(orderStatusLabel("custom_pack", t, customDefs), "Zabalené v bublinkách");
  assert.equal(orderStatusLabel("unknown_code", t, customDefs), "unknown_code");
});

test("defaultOrderStatus returns first new status", () => {
  assert.equal(defaultOrderStatus(), "new");
  const customDefs: OrderStatusDef[] = [
    { key: "created", color: "#111111", group: "new" },
  ];
  assert.equal(defaultOrderStatus(customDefs), "created");
});

test("isTerminalOrderStatus identifies delivered and cancelled statuses", () => {
  assert.equal(isTerminalOrderStatus("delivered"), true);
  assert.equal(isTerminalOrderStatus("cancelled"), true);
  assert.equal(isTerminalOrderStatus("returned"), true);
  assert.equal(isTerminalOrderStatus("new"), false);
  assert.equal(isTerminalOrderStatus("processing"), false);
});

test("calculateOrderItemTotals computes net and gross correctly with discounts", () => {
  const item = {
    quantity: 2,
    unitPrice: 100,
    discountPercent: 10,
    taxRate: 20,
  };
  const totals = calculateOrderItemTotals(item);
  // Net = 2 * 100 * 0.9 = 180
  // Gross = 180 * 1.2 = 216
  assert.equal(totals.totalNetAmount, 180);
  assert.equal(totals.totalGrossAmount, 216);
});

test("calculateOrderTotals differentiates products vs services and sums VAT", () => {
  const items = [
    {
      itemType: "product" as const,
      quantity: 3,
      unitPrice: 50, // 150 net
      discountPercent: 0,
      taxRate: 20, // 30 tax
    },
    {
      itemType: "service" as const, // e.g. Shipping / Delivery
      quantity: 1,
      unitPrice: 10, // 10 net
      discountPercent: 0,
      taxRate: 20, // 2 tax
    },
  ];

  const totals = calculateOrderTotals(items);
  assert.equal(totals.itemsNetAmount, 150);
  assert.equal(totals.servicesNetAmount, 10);
  assert.equal(totals.totalNetAmount, 160);
  assert.equal(totals.totalTaxAmount, 32);
  assert.equal(totals.totalGrossAmount, 192);
});

test("generateOrderNumber creates standard formatted identifiers", () => {
  const num = generateOrderNumber("OBJ", 42, new Date("2026-05-15"));
  assert.equal(num, "OBJ-2026-0042");
});
