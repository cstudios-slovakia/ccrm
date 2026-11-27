import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOrderFulfillment,
  buildOrderFulfillmentMovement,
  orderFulfillmentMovementId,
  planOrderFulfillment,
} from "./orderFulfillment.ts";
import type { Order, OrderItem, WarehouseItem, WarehouseMovement } from "../types/index.ts";

// Stored-vs-derived audit W3: fulfilling an order is stored once on the order, a
// second click issues nothing, and the document can always be written to the DB.

const line = (over: Partial<OrderItem>): OrderItem => ({
  id: "oi-1",
  orderId: "ord-1",
  itemType: "product",
  itemId: "it-1",
  name: "Chair",
  quantity: 4,
  unit: "ks",
  unitPrice: 50,
  discountPercent: 0,
  taxRate: 20,
  totalNetAmount: 200,
  totalGrossAmount: 240,
  fulfilledQuantity: 0,
  sortOrder: 0,
  ...over,
});

const order = (items: OrderItem[]): Order =>
  ({ id: "ord-1", orderNumber: "OBJ-2026-0007", clientId: "client-1", items, itemsNetAmount: 999 }) as unknown as Order;

const catalog = [
  { id: "it-1", name: "Chair", avgPurchasePrice: 30 },
  { id: "it-2", name: "Table", avgPurchasePrice: 100 },
] as WarehouseItem[];

const opts = (existingMovements: WarehouseMovement[] = []) => ({
  existingMovements,
  warehouseId: "wh-1",
  createdBy: "Anna",
  note: "Order fulfillment: OBJ-2026-0007",
  now: new Date("2026-11-06T10:00:00Z"),
});

test("issues the open quantity of catalogue lines, with cost at WAP", () => {
  const o = order([
    line({}),
    line({ id: "oi-2", itemId: "it-2", name: "Table", quantity: 1, unitPrice: 300, totalNetAmount: 300 }),
    line({ id: "oi-3", itemType: "service", itemId: null, name: "Shipping" }),
  ]);
  const plan = planOrderFulfillment(o, catalog);
  assert.equal(plan.lines.length, 2);
  const mov = buildOrderFulfillmentMovement(o, plan, opts());
  assert.equal(mov.type, "outward");
  assert.equal(mov.totalSellValue, 500); // products only, not the order's itemsNetAmount
  assert.equal(mov.totalCostValue, 4 * 30 + 100);
  assert.equal(mov.totalProfitValue, 500 - 220);
  assert.deepEqual(mov.items.map((i) => [i.itemId, i.quantity, i.unitPurchasePrice]), [
    ["it-1", 4, 30],
    ["it-2", 1, 100],
  ]);
});

test("a second fulfilment of the same order issues nothing", () => {
  const o = order([line({})]);
  const plan = planOrderFulfillment(o, catalog);
  const after = applyOrderFulfillment(o, plan);
  assert.equal(after.items?.[0].fulfilledQuantity, 4);
  const again = planOrderFulfillment(after, catalog);
  assert.equal(again.lines.length, 0);
  assert.equal(again.alreadyFulfilled.length, 1);
});

test("a partly fulfilled line issues only the remainder, priced pro rata", () => {
  const o = order([line({ fulfilledQuantity: 1 })]);
  const plan = planOrderFulfillment(o, catalog);
  assert.equal(plan.lines[0].quantity, 3);
  assert.equal(plan.lines[0].lineSell, 150);
  assert.equal(applyOrderFulfillment(o, plan).items?.[0].fulfilledQuantity, 4);
});

test("a product that is not a warehouse item is left out instead of breaking the save", () => {
  // Falling back to the order line id used to violate the item FOREIGN KEY and
  // roll back the whole sync push.
  const o = order([line({ itemId: null }), line({ id: "oi-2", itemId: "it-deleted" })]);
  const plan = planOrderFulfillment(o, catalog);
  assert.equal(plan.lines.length, 0);
  assert.equal(plan.skippedNonCatalog.length, 2);
});

test("document number follows the VYD sequence and the id is per order", () => {
  const existing = [
    { id: "mov-1", type: "outward", documentNumber: "VYD-2026-0004" },
    { id: "mov-2", type: "inward", documentNumber: "PRI-2026-0009" },
    { id: "mov-ord-ord-1-1", type: "outward", documentNumber: "VYD-2026-0003" },
  ] as WarehouseMovement[];
  const o = order([line({})]);
  const mov = buildOrderFulfillmentMovement(o, planOrderFulfillment(o, catalog), opts(existing));
  assert.equal(mov.documentNumber, "VYD-2026-0005");
  assert.equal(mov.id, "mov-ord-ord-1-2");
  assert.equal(mov.items[0].id, "mov-ord-ord-1-2-1");
  assert.equal(orderFulfillmentMovementId("ord-2", existing), "mov-ord-ord-2-1");
});
