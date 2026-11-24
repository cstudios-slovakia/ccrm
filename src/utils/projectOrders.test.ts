import assert from "node:assert/strict";
import test from "node:test";
import {
  linkableOrders,
  ordersOfProject,
  partitionProjectsForOrder,
  projectCustomerIds,
} from "./projectOrders.ts";

const order = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  orderNumber: `OBJ-${id}`,
  orderDate: "2026-01-01",
  createdAt: "2026-01-01 08:00:00",
  projectId: null as string | null,
  clientId: null as string | null,
  ...over,
});

test("ordersOfProject lists only that project's orders, newest first, with none singled out", () => {
  const orders = [
    order("a", { projectId: "p1", orderDate: "2025-03-01" }),
    order("b", { projectId: "p1", orderDate: "2026-02-01" }),
    order("c", { projectId: "p2", orderDate: "2026-05-01" }),
    order("d", { projectId: "p1", orderDate: "2025-12-31" }),
    order("e"),
  ];
  assert.deepEqual(ordersOfProject(orders, "p1").map((o) => o.id), ["b", "d", "a"]);
  assert.deepEqual(ordersOfProject(orders, "p3"), []);
});

test("ordersOfProject breaks a date tie by creation time", () => {
  const orders = [
    order("a", { projectId: "p1", createdAt: "2026-01-01 08:00:00" }),
    order("b", { projectId: "p1", createdAt: "2026-01-01 09:00:00" }),
  ];
  assert.deepEqual(ordersOfProject(orders, "p1").map((o) => o.id), ["b", "a"]);
});

test("ordersOfProject does not reorder the caller's array", () => {
  const orders = [order("a", { projectId: "p1", orderDate: "2025-01-01" }), order("b", { projectId: "p1", orderDate: "2026-01-01" })];
  ordersOfProject(orders, "p1");
  assert.deepEqual(orders.map((o) => o.id), ["a", "b"]);
});

const leads = [
  { id: "client-1", clientId: null },
  { id: "lead-1", clientId: "client-1" },
  { id: "lead-2", clientId: "client-1" },
  { id: "client-2", clientId: null },
];

test("projectCustomerIds covers the client, the paired lead and the client's other leads", () => {
  assert.deepEqual([...projectCustomerIds({ clientId: "client-1", leadId: null }, leads)].sort(), ["client-1", "lead-1", "lead-2"]);
  assert.deepEqual([...projectCustomerIds({ clientId: null, leadId: "lead-1" }, leads)].sort(), ["client-1", "lead-1", "lead-2"]);
  assert.equal(projectCustomerIds({ clientId: null, leadId: null }, leads).size, 0);
});

test("linkableOrders offers the customer's unlinked orders only", () => {
  const orders = [
    order("a", { clientId: "client-1" }),
    order("b", { clientId: "lead-2", orderDate: "2026-06-01" }),
    order("c", { clientId: "client-1", projectId: "p9" }),
    order("d", { clientId: "client-2" }),
  ];
  const project = { clientId: "client-1", leadId: null };
  assert.deepEqual(linkableOrders(orders, project, leads).map((o) => o.id), ["b", "a"]);
});

test("linkableOrders on a project with no customer offers every unlinked order", () => {
  const orders = [order("a", { clientId: "client-1" }), order("b", { projectId: "p1" }), order("c")];
  assert.deepEqual(linkableOrders(orders, { clientId: null, leadId: null }, leads).map((o) => o.id).sort(), ["a", "c"]);
});

test("partitionProjectsForOrder puts the order's customer's projects first", () => {
  const projects = [
    { id: "p1", clientId: "client-2", leadId: null },
    { id: "p2", clientId: "client-1", leadId: null },
    { id: "p3", clientId: null, leadId: "lead-1" },
  ];
  const { mine, others } = partitionProjectsForOrder(projects, "lead-2", leads);
  assert.deepEqual(mine.map((p) => p.id), ["p2", "p3"]);
  assert.deepEqual(others.map((p) => p.id), ["p1"]);
  assert.deepEqual(partitionProjectsForOrder(projects, null, leads).mine, []);
});
