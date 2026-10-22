import type { CompanyBillingSettings, Lead, Order, OrderItem } from "../types";
import { getDefaultPaymentMethod } from "./payment.ts";
import { getAvailableShippingMethods } from "./shipping.ts";

export type OrderStatusGroup = "new" | "processing" | "shipped" | "delivered" | "cancelled";

export const ORDER_STATUS_GROUPS: readonly OrderStatusGroup[] = [
  "new",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

export interface OrderStatusDef {
  key: string;
  label?: string; // Custom label, or falls back to built-in translation
  color: string;
  group: OrderStatusGroup;
  isTerminal?: boolean; // True for delivered or cancelled
}

export const NEW_ORDER_STATUS_COLOR = "#6366f1";

/** Built-in status translations (EN / SK / HU) */
export const BUILTIN_ORDER_STATUS_LABELS: Record<string, [string, string, string]> = {
  new: ["New Order", "Nová objednávka", "Új rendelés"],
  awaiting_payment: ["Awaiting Payment", "Čaká na úhradu", "Fizetésre vár"],
  processing: ["Processing", "Pripravuje sa", "Feldolgozás alatt"],
  in_packing: ["In Packing", "Balí sa", "Csomagolás alatt"],
  ready_to_ship: ["Ready to Ship", "Pripravená na expedíciu", "Szállításra kész"],
  shipped: ["Shipped", "Odoslaná / V preprave", "Kiszállítva / Úton"],
  delivered: ["Delivered", "Doručená / Vybavená", "Kézbesítve / Teljesítve"],
  cancelled: ["Cancelled", "Stornovaná", "Törölve"],
  returned: ["Returned / Claim", "Vrátená / Reklamácia", "Visszaküldve / Reklamáció"],
};

/** Default e-shop order statuses */
export const DEFAULT_ORDER_STATUS_DEFS: readonly OrderStatusDef[] = [
  { key: "new", color: "#0ea5e9", group: "new" },
  { key: "awaiting_payment", color: "#f59e0b", group: "new" },
  { key: "processing", color: "#8b5cf6", group: "processing" },
  { key: "in_packing", color: "#a855f7", group: "processing" },
  { key: "ready_to_ship", color: "#06b6d4", group: "processing" },
  { key: "shipped", color: "#3b82f6", group: "shipped" },
  { key: "delivered", color: "#10b981", group: "delivered", isTerminal: true },
  { key: "cancelled", color: "#f43f5e", group: "cancelled", isTerminal: true },
  { key: "returned", color: "#ef4444", group: "cancelled", isTerminal: true },
];

export const defaultOrderStatus = (defs: readonly OrderStatusDef[] = DEFAULT_ORDER_STATUS_DEFS): string =>
  defs.find((d) => d.group === "new")?.key ?? "new";

export const orderStatusLabel = (
  key: string,
  t: (en: string, sk: string, hu: string) => string,
  defs: readonly OrderStatusDef[] = DEFAULT_ORDER_STATUS_DEFS
): string => {
  const match = defs.find((d) => d.key === key);
  if (match?.label?.trim()) return match.label.trim();
  const builtin = BUILTIN_ORDER_STATUS_LABELS[key];
  if (builtin) return t(builtin[0], builtin[1], builtin[2]);
  return key;
};

export const orderStatusColor = (
  key: string,
  defs: readonly OrderStatusDef[] = DEFAULT_ORDER_STATUS_DEFS
): string => defs.find((d) => d.key === key)?.color ?? "#94a3b8";

export const isTerminalOrderStatus = (
  key: string,
  defs: readonly OrderStatusDef[] = DEFAULT_ORDER_STATUS_DEFS
): boolean => {
  const match = defs.find((d) => d.key === key);
  return match?.isTerminal ?? (match?.group === "delivered" || match?.group === "cancelled");
};

export const normalizeOrderStatusDefs = (raw: unknown): OrderStatusDef[] => {
  const defaults = () => DEFAULT_ORDER_STATUS_DEFS.map((d) => ({ ...d }));
  if (!Array.isArray(raw)) return defaults();
  const seen = new Set<string>();
  const out: OrderStatusDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const key = String(rec.key ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const builtin = DEFAULT_ORDER_STATUS_DEFS.find((d) => d.key === key);
    const color =
      typeof rec.color === "string" && /^#[0-9a-f]{6}$/i.test(rec.color)
        ? rec.color
        : builtin?.color ?? "#6366f1";
    const group = (ORDER_STATUS_GROUPS as readonly string[]).includes(String(rec.group))
      ? (rec.group as OrderStatusGroup)
      : builtin?.group ?? "processing";
    const label = String(rec.label ?? "").trim();
    const isTerminal = Boolean(rec.isTerminal ?? builtin?.isTerminal ?? false);
    out.push({ key, color, group, isTerminal, ...(label ? { label } : {}) });
  }
  if (!out.some((d) => d.group === "new")) return defaults();
  return ORDER_STATUS_GROUPS.flatMap((g) => out.filter((d) => d.group === g));
};

const round2 = (val: number): number => Math.round((val + Number.EPSILON) * 100) / 100;

export interface OrderItemTotals {
  totalNetAmount: number;
  totalGrossAmount: number;
}

export const calculateOrderItemTotals = (
  item: Pick<OrderItem, "quantity" | "unitPrice" | "discountPercent" | "taxRate">
): OrderItemTotals => {
  const qty = Number(item.quantity) || 0;
  const price = Number(item.unitPrice) || 0;
  const disc = Number(item.discountPercent) || 0;
  const tax = Number(item.taxRate) || 0;

  const netBeforeDisc = qty * price;
  const net = netBeforeDisc * (1 - disc / 100);
  const gross = net * (1 + tax / 100);

  return {
    totalNetAmount: round2(net),
    totalGrossAmount: round2(gross),
  };
};

export interface OrderTotals {
  itemsNetAmount: number;
  servicesNetAmount: number;
  totalNetAmount: number;
  totalTaxAmount: number;
  totalGrossAmount: number;
}

export const calculateOrderTotals = (
  items: Array<Pick<OrderItem, "itemType" | "quantity" | "unitPrice" | "discountPercent" | "taxRate">> = []
): OrderTotals => {
  let itemsNetAmount = 0;
  let servicesNetAmount = 0;
  let totalTaxAmount = 0;

  for (const it of items) {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.unitPrice) || 0;
    const disc = Number(it.discountPercent) || 0;
    const tax = Number(it.taxRate) || 0;

    const net = qty * price * (1 - disc / 100);
    const taxAmt = net * (tax / 100);

    if (it.itemType === "service") {
      servicesNetAmount += net;
    } else {
      itemsNetAmount += net;
    }
    totalTaxAmount += taxAmt;
  }

  const roundedItems = round2(itemsNetAmount);
  const roundedServices = round2(servicesNetAmount);
  const totalNet = round2(roundedItems + roundedServices);
  const roundedTax = round2(totalTaxAmount);
  const totalGross = round2(totalNet + roundedTax);

  return {
    itemsNetAmount: roundedItems,
    servicesNetAmount: roundedServices,
    totalNetAmount: totalNet,
    totalTaxAmount: roundedTax,
    totalGrossAmount: totalGross,
  };
};

export const generateOrderNumber = (prefix = "OBJ", sequence = 1, date = new Date()): string => {
  const year = date.getFullYear();
  const seqStr = String(sequence).padStart(4, "0");
  return `${prefix}-${year}-${seqStr}`;
};

/**
 * The next free order number for the year of `date`. Counts up from the highest
 * number already issued that year rather than from how many orders exist: deleting
 * an order used to make `orders.length + 1` land on a number that was still taken,
 * and `orders.order_number` is UNIQUE, so the second save was rejected.
 */
export const nextOrderNumber = (
  existing: ReadonlyArray<Pick<Order, "orderNumber">>,
  prefix = "OBJ",
  date = new Date()
): string => {
  const pattern = new RegExp(`^${prefix}-${date.getFullYear()}-(\\d+)$`);
  let highest = 0;
  for (const { orderNumber } of existing) {
    const seq = Number(pattern.exec(orderNumber || "")?.[1]);
    if (seq > highest) highest = seq;
  }
  return generateOrderNumber(prefix, highest + 1, date);
};

export interface BuildOrderDraftOptions {
  /** Record the order is attached to (becomes `clientId`). Null gives the empty draft. */
  attachTo: Lead | null;
  /** The lead or client the user started from; fills fields the attached record leaves empty. */
  origin?: Lead | null;
  /** Recipient and phone to put on the delivery address. */
  contact?: { phone: string; contactPerson: string } | null;
  statuses: readonly OrderStatusDef[];
  billingSettings?: CompanyBillingSettings | null;
  currency: string;
  /** Orders that already exist, so the new number cannot repeat one. */
  existingOrders: ReadonlyArray<Pick<Order, "orderNumber">>;
  /** YYYY-MM-DD. Injected so the result is deterministic. */
  today: string;
  id?: string;
}

/** A new, unsaved sales order, prefilled from the customer it is attached to. */
export const buildOrderDraft = (opts: BuildOrderDraftOptions): Order => {
  const { attachTo, origin, contact } = opts;
  const first = (...values: Array<string | null | undefined>): string =>
    values.find((v) => typeof v === "string" && v.trim() !== "") ?? "";

  const name = first(attachTo?.name, origin?.name);
  const street = first(attachTo?.address?.street, origin?.address?.street);
  const city = first(attachTo?.city, attachTo?.address?.city, origin?.city, origin?.address?.city);
  const zip = first(attachTo?.address?.postalCode, origin?.address?.postalCode);
  const country = first(attachTo?.address?.country, origin?.address?.country) || "SK";

  const order: Order = {
    id: opts.id ?? `ord_${Date.now()}`,
    orderNumber: nextOrderNumber(opts.existingOrders, "OBJ", new Date(`${opts.today}T00:00:00`)),
    type: "sales",
    status: defaultOrderStatus(opts.statuses),
    customerType: "client",
    clientId: attachTo?.id ?? null,
    delivery: {
      recipient: attachTo
        ? first(contact?.contactPerson, attachTo.contactPerson, origin?.contactPerson, name)
        : "",
      street,
      city,
      zip,
      country,
      phone: attachTo ? first(contact?.phone, attachTo.phone, origin?.phone) : "",
    },
    billing: {
      name,
      street,
      city,
      zip,
      country,
      ...(attachTo
        ? {
            ico: first(attachTo.companyId, origin?.companyId),
            dic: first(attachTo.taxId, origin?.taxId),
            icDph: first(attachTo.vatId, origin?.vatId),
          }
        : {}),
    },
    paymentMethod: getDefaultPaymentMethod(opts.billingSettings),
    paymentStatus: "unpaid",
    currency: opts.currency || "EUR",
    itemsNetAmount: 0,
    servicesNetAmount: 0,
    totalNetAmount: 0,
    totalTaxAmount: 0,
    totalGrossAmount: 0,
    orderDate: opts.today,
    items: [],
  };
  if (attachTo) order.shippingMethod = getAvailableShippingMethods(opts.billingSettings)[0] || "Kuriér";
  return order;
};

export const formatCarrierTrackingUrl = (carrier?: string, trackingNumber?: string): string | null => {
  if (!trackingNumber?.trim()) return null;
  const num = encodeURIComponent(trackingNumber.trim());
  const c = (carrier || "").toLowerCase();
  if (c.includes("dpd")) {
    return `https://tracking.dpd.de/status/sk_SK/parcel/${num}`;
  }
  if (c.includes("packeta") || c.includes("zásielkovňa") || c.includes("zasielkovna")) {
    return `https://tracking.packeta.com/sk/?id=${num}`;
  }
  if (c.includes("gls")) {
    return `https://gls-group.eu/SK/sk/sledovanie-zasielok?match=${num}`;
  }
  if (c.includes("sps") || c.includes("slovak parcel")) {
    return `https://www.sps-sro.sk/sk/sledovanie-zasielky.html?parcel=${num}`;
  }
  if (c.includes("posta") || c.includes("pošta")) {
    return `https://sledovanie.posta.sk/${num}`;
  }
  return null;
};
