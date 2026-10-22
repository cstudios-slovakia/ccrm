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
  nextOrderNumber,
  buildOrderDraft,
  type OrderStatusDef,
} from "./orders.ts";
import type { Lead } from "../types";

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

const lead = (over: Partial<Lead>): Lead => ({
  id: "lead-1",
  name: "Acme",
  city: "",
  clientType: "business",
  status: "new",
  source: "manual",
  owner: "",
  value: 0,
  createdAt: "2026-01-01",
  ...over,
});

const draftBase = {
  statuses: DEFAULT_ORDER_STATUS_DEFS,
  currency: "EUR",
  existingOrders: [],
  today: "2026-05-15",
  id: "ord_test",
};

test("nextOrderNumber continues after the highest number, not after the count", () => {
  const d = new Date("2026-05-15T00:00:00");
  assert.equal(nextOrderNumber([], "OBJ", d), "OBJ-2026-0001");
  // 0002 was deleted: three orders remain, but 0004 is the highest in use.
  const afterDelete = [{ orderNumber: "OBJ-2026-0001" }, { orderNumber: "OBJ-2026-0003" }, { orderNumber: "OBJ-2026-0004" }];
  assert.equal(nextOrderNumber(afterDelete, "OBJ", d), "OBJ-2026-0005");
  // Other years, other prefixes and free-form numbers do not count.
  const noise = [{ orderNumber: "OBJ-2025-0090" }, { orderNumber: "FAK-2026-0050" }, { orderNumber: "custom" }, { orderNumber: "" }];
  assert.equal(nextOrderNumber(noise, "OBJ", d), "OBJ-2026-0001");
});

test("buildOrderDraft without a customer is the empty draft", () => {
  const o = buildOrderDraft({ ...draftBase, attachTo: null });
  assert.equal(o.id, "ord_test");
  assert.equal(o.orderNumber, "OBJ-2026-0001");
  assert.equal(o.clientId, null);
  assert.equal(o.customerType, "client");
  assert.equal(o.status, "new");
  assert.equal(o.orderDate, "2026-05-15");
  assert.deepEqual(o.delivery, { recipient: "", street: "", city: "", zip: "", country: "SK", phone: "" });
  assert.deepEqual(o.billing, { name: "", street: "", city: "", zip: "", country: "SK" });
  assert.equal(o.shippingMethod, undefined);
  assert.deepEqual(o.items, []);
});

test("buildOrderDraft maps a client record onto billing and delivery", () => {
  const client = lead({
    id: "client-1",
    name: "Acme s.r.o.",
    city: "Nitra",
    contactPerson: "Jana Nováková",
    phone: "+421900111222",
    companyId: "12345678",
    taxId: "2020202020",
    vatId: "SK2020202020",
    address: { street: "Hlavná 1", city: "Ignored", postalCode: "94901", country: "" },
  });
  const o = buildOrderDraft({
    ...draftBase,
    attachTo: client,
    origin: client,
    contact: { phone: client.phone!, contactPerson: client.contactPerson! },
    existingOrders: [{ orderNumber: "OBJ-2026-0007" }],
  });
  assert.equal(o.clientId, "client-1");
  assert.equal(o.orderNumber, "OBJ-2026-0008");
  assert.deepEqual(o.billing, {
    name: "Acme s.r.o.",
    street: "Hlavná 1",
    city: "Nitra",
    zip: "94901",
    country: "SK",
    ico: "12345678",
    dic: "2020202020",
    icDph: "SK2020202020",
  });
  assert.deepEqual(o.delivery, {
    recipient: "Jana Nováková",
    street: "Hlavná 1",
    city: "Nitra",
    zip: "94901",
    country: "SK",
    phone: "+421900111222",
  });
  assert.equal(o.shippingMethod, "DPD Kuriér");
});

test("buildOrderDraft attaches a lead without a client to the lead itself", () => {
  const l = lead({ id: "lead-9", name: "Solo Lead", city: "Žilina", phone: "+421911", contactPerson: "Peter" });
  const o = buildOrderDraft({ ...draftBase, attachTo: l, origin: l, contact: { phone: "+421911", contactPerson: "Peter" } });
  assert.equal(o.clientId, "lead-9");
  assert.equal(o.billing.name, "Solo Lead");
  assert.equal(o.billing.city, "Žilina");
  assert.equal(o.delivery.recipient, "Peter");
  assert.equal(o.delivery.phone, "+421911");
});

test("buildOrderDraft: a lead linked to a client under another name bills the client", () => {
  const client = lead({ id: "client-5", name: "Holding a.s.", address: { street: "Dlhá 5", city: "Trnava", postalCode: "91701", country: "CZ" }, companyId: "999" });
  const l = lead({ id: "lead-5", name: "Holding - project", clientId: "client-5", contactPerson: "Eva", phone: "+421905" });
  const o = buildOrderDraft({ ...draftBase, attachTo: client, origin: l, contact: { phone: "+421905", contactPerson: "Eva" } });
  assert.equal(o.clientId, "client-5");
  assert.equal(o.billing.name, "Holding a.s.");
  assert.equal(o.billing.country, "CZ");
  assert.equal(o.billing.ico, "999");
  assert.equal(o.delivery.recipient, "Eva");
  assert.equal(o.delivery.phone, "+421905");
});

test("buildOrderDraft fills a client's empty fields from the origin lead", () => {
  const client = lead({ id: "client-6", name: "Bare Client" });
  const l = lead({
    id: "lead-6",
    name: "Bare Client",
    city: "Prešov",
    companyId: "55",
    taxId: "66",
    vatId: "SK66",
    address: { street: "Krátka 2", city: "", postalCode: "08001", country: "SK" },
  });
  const o = buildOrderDraft({ ...draftBase, attachTo: client, origin: l });
  assert.equal(o.billing.street, "Krátka 2");
  assert.equal(o.billing.city, "Prešov");
  assert.equal(o.billing.zip, "08001");
  assert.equal(o.billing.ico, "55");
  assert.equal(o.billing.dic, "66");
  assert.equal(o.billing.icDph, "SK66");
  // No contact details anywhere: the recipient falls back to the customer name.
  assert.equal(o.delivery.recipient, "Bare Client");
  assert.equal(o.delivery.phone, "");
});
