import type { Order, OrderItem, WarehouseItem, WarehouseMovement, WarehouseMovementItem } from "../types/index.ts";
import { nextDocumentNumber } from "./documentNumbering.ts";

// "Fulfil with warehouse delivery note" on an order (OrdersView and ClientsView).
//
// It used to build the movement inline in both views, with a random VYD number
// (can collide with the UNIQUE sequential numbers), cost 0, a fallback to the order
// line id for non-catalogue products (a FOREIGN KEY violation that rolled back the
// whole sync push), and no record on the order, so every click issued another
// document. This keeps one copy and stores what was fulfilled on the order lines.
//
// Stock is still not changed here: who moves `warehouse_stock` for a movement is
// the open ledger redesign (stored-vs-derived audit W1), and whether fulfilment
// should always issue stock is an open product question.

export interface OrderFulfillmentLine {
  orderItem: OrderItem;
  itemId: string;
  quantity: number;
  unitCost: number;
  unitSell: number;
  lineSell: number;
}

export interface OrderFulfillmentPlan {
  lines: OrderFulfillmentLine[];
  /** Product lines with no catalogue item; they cannot be put on a warehouse document. */
  skippedNonCatalog: OrderItem[];
  /** Product lines whose whole quantity was already fulfilled. */
  alreadyFulfilled: OrderItem[];
}

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

/** What is still to be issued for an order: quantity minus fulfilledQuantity, per catalogue line. */
export const planOrderFulfillment = (
  order: Order,
  warehouseItems: readonly WarehouseItem[],
): OrderFulfillmentPlan => {
  const catalog = new Map(warehouseItems.map((w) => [w.id, w]));
  const plan: OrderFulfillmentPlan = { lines: [], skippedNonCatalog: [], alreadyFulfilled: [] };
  for (const item of order.items || []) {
    if (item.itemType !== "product" || !(Number(item.quantity) > 0)) continue;
    const ordered = Number(item.quantity) || 0;
    const remaining = round4(ordered - (Number(item.fulfilledQuantity) || 0));
    if (remaining <= 0) {
      plan.alreadyFulfilled.push(item);
      continue;
    }
    const catalogItem = item.itemId ? catalog.get(item.itemId) : undefined;
    if (!catalogItem) {
      plan.skippedNonCatalog.push(item);
      continue;
    }
    const lineNet = Number(item.totalNetAmount);
    const lineSell = Number.isFinite(lineNet) && ordered > 0
      ? round4((lineNet * remaining) / ordered)
      : round4(remaining * (Number(item.unitPrice) || 0));
    plan.lines.push({
      orderItem: item,
      itemId: catalogItem.id,
      quantity: remaining,
      unitCost: Number(catalogItem.avgPurchasePrice) || 0,
      unitSell: Number(item.unitPrice) || 0,
      lineSell,
    });
  }
  return plan;
};

/** Movement ids for an order's fulfilments: `mov-ord-<orderId>-<seq>`. */
export const orderFulfillmentMovementId = (
  orderId: string,
  existingMovements: readonly Pick<WarehouseMovement, "id">[],
): string => {
  const prefix = `mov-ord-${orderId}-`;
  let seq = 0;
  for (const m of existingMovements) {
    if (!m.id.startsWith(prefix)) continue;
    const n = parseInt(m.id.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > seq) seq = n;
  }
  return `${prefix}${seq + 1}`;
};

export const buildOrderFulfillmentMovement = (
  order: Order,
  plan: OrderFulfillmentPlan,
  opts: {
    existingMovements: readonly WarehouseMovement[];
    warehouseId: string;
    createdBy: string;
    note: string;
    now?: Date;
  },
): WarehouseMovement => {
  const now = opts.now ?? new Date();
  const id = orderFulfillmentMovementId(order.id, opts.existingMovements);
  const documentNumber = nextDocumentNumber(
    opts.existingMovements.filter((m) => m.type === "outward").map((m) => m.documentNumber),
    "VYD",
    now.getFullYear(),
  );
  let totalCost = 0;
  let totalSell = 0;
  const items: WarehouseMovementItem[] = plan.lines.map((line, idx) => {
    totalCost += line.quantity * line.unitCost;
    totalSell += line.lineSell;
    return {
      id: `${id}-${idx + 1}`,
      movementId: id,
      itemId: line.itemId,
      batchId: null,
      quantity: line.quantity,
      unitPurchasePrice: line.unitCost,
      unitSellPrice: line.unitSell,
      totalPrice: line.lineSell,
      expirationDate: null,
      note: line.orderItem.name,
    };
  });
  totalCost = round4(totalCost);
  totalSell = round4(totalSell);
  return {
    id,
    documentNumber,
    type: "outward",
    status: "confirmed",
    warehouseId: opts.warehouseId,
    targetWarehouseId: null,
    supplierId: null,
    leadId: order.clientId || null,
    totalCostValue: totalCost,
    totalSellValue: totalSell,
    totalProfitValue: round4(totalSell - totalCost),
    createdBy: opts.createdBy,
    note: opts.note,
    fileName: null,
    filePath: null,
    issuedAt: now.toISOString().split("T")[0],
    createdAt: now.toISOString(),
    items,
  };
};

/** The order with fulfilledQuantity raised by what the plan issues. */
export const applyOrderFulfillment = (order: Order, plan: OrderFulfillmentPlan): Order => {
  const issued = new Map(plan.lines.map((l) => [l.orderItem.id, l.quantity]));
  if (issued.size === 0) return order;
  return {
    ...order,
    items: (order.items || []).map((item) =>
      issued.has(item.id)
        ? { ...item, fulfilledQuantity: round4((Number(item.fulfilledQuantity) || 0) + (issued.get(item.id) as number)) }
        : item,
    ),
  };
};
