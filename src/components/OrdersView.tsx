import React, { useState, useMemo, useEffect, useRef } from "react";
import { contactPartsOfPerson } from "../utils/contactName";
import { SectionIcon } from "./icons/SectionIcon";
import { applyOrderFulfillment, buildOrderFulfillmentMovement, planOrderFulfillment } from "../utils/orderFulfillment";
import type { PriceLevel } from "../utils/priceLevels";
import { StickyHScrollbar } from "./ui/StickyHScrollbar";
import { useStickyTableHead } from "../hooks/useStickyTableHead";
import {
  Search,
  Plus,
  Sliders,
  Package,
  FileText,
  FileCheck,
  UserCheck,
  User,
  Truck,
  Copy,
  Check,
  Edit2,
  Trash2,
  CreditCard,
  MapPin,
  Clock,
  AlertCircle,
  X,
  TrendingUp
} from "lucide-react";
import type {
  Order,
  Lead,
  Project,
  WarehouseItem,
  Warehouse,
  WarehouseMovement,
  InvoiceOffer,
  InvoiceOfferItem,
  FinancialRecord,
  TimelineEvent,
  UserProfile,
  PermissionValue,
  CompanyBillingSettings
} from "../types";
import type { Language } from "../utils/translations";
import { useOrderStatuses } from "../hooks/useOrderStatuses";
import {
  orderStatusLabel,
  orderStatusColor,
  calculateOrderTotals,
  buildOrderDraft,
} from "../utils/orders";
import { OrderDetailView } from "./OrderDetailView";
import { getDefaultVatRate } from "../utils/vat";
import { issuedInvoiceStatus, type OfferStatusDef } from "../utils/offerStatuses";
import { isClientRecord } from "../utils/clientRecord";
import { EntityBadge } from "./tremor/EntityBadge";
import { entityAccentStyle } from "../utils/entityAccent";
import { contactDetailsFor, resolveLinkedClient } from "../utils/leadClient";
import { formatMoney } from "../utils/currency";
import { formatDateLocalized, todayLocal, todayLocalPlusDays, nowLocalStamp } from "../utils/localTime";
import { markInvoiceMovementPaid } from "../utils/invoiceFinanceBridge";
import { nextDocumentNumber } from "../utils/documentNumbering";
import { PageHeader, StatGrid, StatTile, EmptyState } from "./layout";
import { CustomSelect } from "./ui/CustomSelect";
import { useOrderFacets } from "./orders/useOrderFacets";
import { FacetedMultiSelect } from "./ui/FacetedMultiSelect";
import { PinnedFilterChips } from "./ui/PinnedFilterChips";
import { PRODUCT_NAME, getSystemTitle } from "../utils/brand";
import { OrderProjectBadge } from "./orders/OrderProjectLink";

import { ResizableTh } from "./ui/ResizableTh";
export interface OrdersViewProps {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  leads: Lead[];
  setLeads?: React.Dispatch<React.SetStateAction<Lead[]>>;
  warehouseItems?: WarehouseItem[];
  /** The configured price levels: a product is priced on the customer's level. */
  priceLevels?: PriceLevel[];
  warehouses?: Warehouse[];
  warehouseMovements?: WarehouseMovement[];
  setWarehouseMovements?: React.Dispatch<React.SetStateAction<WarehouseMovement[]>>;
  invoicesOffers?: InvoiceOffer[];
  setInvoicesOffers?: React.Dispatch<React.SetStateAction<InvoiceOffer[]>>;
  /** Settings → Invoice statuses: an issued invoice starts in the first settled / open one. */
  invoiceStatuses?: OfferStatusDef[];
  financialRecords?: FinancialRecord[];
  setFinancialRecords?: (recs: FinancialRecord[] | ((prev: FinancialRecord[]) => FinancialRecord[])) => void;
  onAddTimelineEvent?: (leadId: string, event: TimelineEvent) => void;
  systemCurrency: string;
  userLanguage: Language;
  currentUser?: UserProfile | null;
  getPermission: (key: string) => PermissionValue;
  onOpenClient?: (clientId: string) => void;
  onOpenSettings?: () => void;
  companyBillingSettings?: CompanyBillingSettings | null;
  initialSelectedOrderId?: string;
  /**
   * Open the editor on a new draft for a customer (`#orders/new?customer=…&from=…`).
   * `key` identifies the request so the draft is built once, not on every sync poll.
   */
  newOrderRequest?: { customerId: string | null; projectId?: string | null; from: string | null; key: string };
  /** Offers the order editor's "Project" field and shows an order's project in the list. */
  projects?: Project[];
}

/** Where a new order may send the user back to: a client or lead page, nothing else. */
const safeReturnRoute = (from: string | null | undefined): string | null =>
  from && /^(clients\/|client-|leads\/|lead-|projects\/|project-)/.test(from) ? from : null;

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  setOrders,
  leads,
  setLeads,
  warehouseMovements = [],
  warehouseItems = [],
  priceLevels = [],
  warehouses = [],
  setWarehouseMovements,
  invoicesOffers = [],
  invoiceStatuses,
  setInvoicesOffers,
  financialRecords: _financialRecords = [],
  setFinancialRecords,
  onAddTimelineEvent,
  systemCurrency,
  userLanguage,
  currentUser,
  getPermission,
  onOpenClient,
  onOpenSettings,
  companyBillingSettings,
  initialSelectedOrderId,
  newOrderRequest,
  projects
}) => {
  const t = (en: string, sk: string, hu: string) =>
    userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  const orderStatuses = useOrderStatuses();
  const canEdit = getPermission("orders") === "edit";
  const canDelete = canEdit && getPermission("orders.delete") === "edit";

  const [tableWrapRef, tableWrapEl] = useStickyTableHead();
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedTrackingId, setCopiedTrackingId] = useState<string | null>(null);

  // Active editing or creating order (separate full-page view)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  // Page a new order came from, and the record its timeline note goes to.
  const [returnRoute, setReturnRoute] = useState<string | null>(null);
  const newOrderOriginRef = useRef<{ orderId: string; originId: string | null } | null>(null);
  const handledNewOrderKeyRef = useRef<string | null>(null);

  // Open a prefilled draft for `#orders/new?customer=<leads row id>`. Built once per
  // request: the 5 s sync poll replaces `orders` and `leads`, and rebuilding the draft
  // then would wipe what the user has typed.
  useEffect(() => {
    if (!newOrderRequest || !canEdit || handledNewOrderKeyRef.current === newOrderRequest.key) return;
    const { customerId, projectId, from, key } = newOrderRequest;
    const origin = customerId ? leads.find(l => l.id === customerId) ?? null : null;
    // The record may simply not have loaded yet; only give up on it once leads exist.
    if (customerId && !origin && leads.length === 0) return;
    handledNewOrderKeyRef.current = key;

    // A client record takes the order itself; a lead hands it to its client when it
    // has one, and otherwise carries it (Order.clientId may reference any leads row).
    const linkedClient = origin && !isClientRecord(origin) ? resolveLinkedClient(origin, leads) : null;
    const attachTo = origin && isClientRecord(origin) ? origin : linkedClient ?? origin;
    const draft = buildOrderDraft({
      attachTo,
      origin,
      contact: origin ? contactDetailsFor(origin, leads, linkedClient) : null,
      statuses: orderStatuses,
      billingSettings: companyBillingSettings,
      currency: systemCurrency,
      existingOrders: orders,
      today: todayLocal(),
    });
    newOrderOriginRef.current = { orderId: draft.id, originId: origin?.id ?? null };
    setReturnRoute(safeReturnRoute(from));
    setEditingOrder(projectId ? { ...draft, projectId } : draft);
  }, [newOrderRequest, canEdit, leads, orders, orderStatuses, companyBillingSettings, systemCurrency]);

  // Auto-open order if requested via deep link / initialSelectedOrderId
  useEffect(() => {
    if (initialSelectedOrderId && initialSelectedOrderId !== "new" && orders.length > 0) {
      const match = orders.find(
        o => o.id === initialSelectedOrderId || o.orderNumber === initialSelectedOrderId
      );
      if (match) {
        // `#orders/<id>?from=<page>`: closing the order goes back to that page (a project's Orders tab).
        setReturnRoute(safeReturnRoute(new URLSearchParams(window.location.hash.split("?")[1] || "").get("from")));
        setEditingOrder(JSON.parse(JSON.stringify(match)));
      }
    }
  }, [initialSelectedOrderId, orders]);

  // Copy tracking number helper
  const handleCopyTracking = (tracking: string, id: string) => {
    navigator.clipboard.writeText(tracking);
    setCopiedTrackingId(id);
    setTimeout(() => setCopiedTrackingId(null), 2000);
  };

  // Convert guest to client
  const handleConvertGuest = async (order: Order) => {
    if (!canEdit || order.customerType !== "guest") return;
    if (!confirm(t(`Convert this guest to a registered ${PRODUCT_NAME} client?`, `Vytvoriť z tohto hosťa nového klienta v ${PRODUCT_NAME}?`, `Létrehozza ebből a vendégből az új ${PRODUCT_NAME} ügyfelet?`))) return;

    try {
      const res = await fetch("/api/orders.php?action=convert_guest_to_client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.id })
      });
      const data = await res.json();
      if (data.success && data.client_id) {
        // Update local order
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, customerType: "client", clientId: data.client_id } : o));
        
        // Add local lead if setLeads available
        if (setLeads) {
          const newLead: Lead = {
            id: data.client_id,
            name: order.billing?.name || order.guest?.company || order.guest?.name || t("New Client", "Nový klient", "Új ügyfél"),
            contactPerson: order.guest?.name || "",
            ...contactPartsOfPerson(order.guest?.name),
            email: order.guest?.email || "",
            phone: order.guest?.phone || "",
            clientType: "business",
            source: "manual",
            owner: currentUser?.name || "",
            value: 0,
            companyId: order.billing?.ico || order.guest?.ico || "",
            taxId: order.billing?.dic || order.guest?.dic || "",
            vatId: order.billing?.icDph || order.guest?.icDph || "",
            address: {
              street: order.billing?.street || order.delivery?.street || "",
              city: order.billing?.city || order.delivery?.city || "",
              postalCode: order.billing?.zip || order.delivery?.zip || "",
              country: order.billing?.country || order.delivery?.country || "SK"
            },
            city: order.billing?.city || order.delivery?.city || "",
            status: "Zákazník",
            createdAt: new Date().toISOString()
          };
          setLeads(prev => [newLead, ...prev]);
        }

        const toast = (window as unknown as { showToast?: (m: string) => void }).showToast;
        toast?.(t("Client created and linked successfully!", "Klient bol úspešne vytvorený a prepojený!", "Az ügyfél sikeresen létrejött és összekapcsolva!"));
      } else {
        alert(data.error || "Failed to convert guest.");
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  // Convert order products into outward warehouse movement
  const handleFulfillWarehouse = (order: Order) => {
    if (!canEdit || !setWarehouseMovements) return;
    const plan = planOrderFulfillment(order, warehouseItems);
    if (plan.lines.length === 0) {
      if (plan.alreadyFulfilled.length > 0 && plan.skippedNonCatalog.length === 0) {
        alert(t("All products of this order have already been issued from the warehouse.", "Všetky produkty tejto objednávky už boli vyskladnené.", "A rendelés összes terméke már ki lett adva a raktárból."));
      } else if (plan.skippedNonCatalog.length > 0) {
        alert(t("The remaining products of this order are not warehouse items, so they cannot be put on a delivery note.", "Zvyšné produkty tejto objednávky nie sú skladové položky, preto ich nemožno vyskladniť.", "A rendelés többi terméke nem raktári tétel, ezért nem adható ki."));
      } else {
        alert(t("This order contains no physical products to fulfill.", "Táto objednávka neobsahuje žiadne fyzické produkty na vyskladnenie.", "Ez a rendelés nem tartalmaz fizikai termékeket."));
      }
      return;
    }
    const warehouseId = order.warehouseId || warehouses[0]?.id || "";
    if (!warehouseId) {
      alert(t("Create a warehouse first.", "Najprv vytvorte sklad.", "Először hozzon létre egy raktárt."));
      return;
    }

    const count = plan.lines.length;
    const skipped = plan.skippedNonCatalog.length;
    const skippedNote = skipped > 0
      ? t(` (${skipped} non-warehouse products are left out)`, ` (${skipped} neskladových produktov sa vynechá)`, ` (${skipped} nem raktári termék kimarad)`)
      : "";
    if (!confirm(t(`Create warehouse delivery note (výdajka) for ${count} products?`, `Vystaviť výdajku zo skladu pre ${count} produktov?`, `Kiállítja a raktári kiadási bizonylatot ${count} termékre?`) + skippedNote)) return;

    const note = `${t("Order fulfillment", "Vyskladnenie k objednávke", "Rendelés teljesítése")}: ${order.orderNumber}`;
    const createdBy = currentUser?.name || "System";
    const now = new Date();
    // The VYD number and the movement id follow what is already on file.
    const movement = buildOrderFulfillmentMovement(order, plan, { existingMovements: warehouseMovements, warehouseId, createdBy, note, now });
    const documentNumber = movement.documentNumber;
    setWarehouseMovements(prev => [movement, ...prev]);
    // What was issued is stored on the order lines, so a second click issues nothing.
    setOrders(prev => prev.map(o => (o.id === order.id ? applyOrderFulfillment(o, plan) : o)));
    const toast = (window as unknown as { showToast?: (m: string) => void }).showToast;
    toast?.(t(`Delivery note ${documentNumber} created!`, `Výdajka ${documentNumber} bola úspešne vytvorená!`, `A(z) ${documentNumber} kiadási bizonylat elkészült!`));
  };

  // Convert order into invoice
  const handleCreateInvoice = async (order: Order) => {
    if (!canEdit || !setInvoicesOffers) return;

    if (order.invoiceNumber) {
      const reconfirm = confirm(
        t(
          `Invoice ${order.invoiceNumber} was already created for order ${order.orderNumber}. Do you want to re-issue / create a new invoice?`,
          `K objednávke ${order.orderNumber} už bola vytvorená faktúra ${order.invoiceNumber}. Želáte si vystaviť novú faktúru?`,
          `A(z) ${order.orderNumber} rendeléshez már kiállították a(z) ${order.invoiceNumber} számlát. Új számlát kíván kiállítani?`
        )
      );
      if (!reconfirm) return;
    } else {
      if (
        !confirm(
          t(
            `Create invoice from order ${order.orderNumber}?`,
            `Vystaviť faktúru z objednávky ${order.orderNumber}?`,
            `Számla kiállítása a(z) ${order.orderNumber} rendelésből?`
          )
        )
      ) {
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const newInvoiceId = `inv_${Date.now()}`;
    // The next number of the invoice series, as MCP issues it (mcp_next_document_number,
    // FA, 3 digits): a random number could collide with one already issued.
    const newInvoiceNumber = nextDocumentNumber(
      invoicesOffers.map((io) => io.documentNumber),
      "FA",
      new Date().getFullYear(),
      3
    );

    // Resolve attached client
    let targetLead = order.clientId ? leads.find(l => l.id === order.clientId) : null;
    if (!targetLead && order.billing?.ico) {
      targetLead = leads.find(l => l.companyId && l.companyId === order.billing?.ico) || null;
    }
    if (!targetLead && order.guest?.email) {
      targetLead = leads.find(
        l => l.email && l.email.toLowerCase() === order.guest?.email?.toLowerCase()
      ) || null;
    }
    if (!targetLead && order.billing?.name) {
      targetLead = leads.find(
        l => l.name && l.name.toLowerCase() === order.billing?.name?.toLowerCase()
      ) || null;
    }

    const targetClientId = targetLead?.id || order.clientId || null;
    const clientName =
      targetLead?.name ||
      order.billing?.name ||
      order.guest?.company ||
      order.guest?.name ||
      "";

    const invItems: InvoiceOfferItem[] = (order.items || []).map(i => ({
      id: `inv_item_${Date.now()}_${Math.random()}`,
      warehouseItemId: i.itemId || null,
      sku: i.sku || null,
      name: i.name + (i.variantTitle ? ` (${i.variantTitle})` : ""),
      quantity: i.quantity,
      unit: i.unit || "ks",
      unitPrice: i.unitPrice,
      vatRate: i.taxRate !== undefined ? i.taxRate : getDefaultVatRate(companyBillingSettings),
      discountPct: i.discountPercent || 0,
      totalPrice: i.totalGrossAmount
    }));

    const newInvoice: InvoiceOffer = {
      id: newInvoiceId,
      documentNumber: newInvoiceNumber,
      title: `${t("Invoice", "Faktúra", "Számla")} ${newInvoiceNumber} — ${order.orderNumber}`,
      subject: `${t("Order", "Objednávka", "Rendelés")} ${order.orderNumber}`,
      type: "invoice",
      mode: "default",
      status: issuedInvoiceStatus(order.paymentStatus === "paid", invoiceStatuses),
      clientId: targetClientId,
      leadId: targetClientId || "",
      clientName,
      clientIco: order.billing?.ico || order.guest?.ico || targetLead?.companyId || undefined,
      clientDic: order.billing?.dic || order.guest?.dic || targetLead?.taxId || undefined,
      clientIcdph: order.billing?.icDph || order.guest?.icDph || targetLead?.vatId || undefined,
      clientStreet: order.billing?.street || order.delivery?.street || targetLead?.address?.street || undefined,
      clientCity: order.billing?.city || order.delivery?.city || targetLead?.city || undefined,
      clientPostalCode: order.billing?.zip || order.delivery?.zip || targetLead?.address?.postalCode || undefined,
      clientCountry: order.billing?.country || order.delivery?.country || "SK",
      currency: order.currency || systemCurrency || "EUR",
      subtotal: order.totalNetAmount,
      vatAmount: order.totalTaxAmount,
      totalPrice: order.totalGrossAmount,
      issuedAt: order.orderDate || todayLocal(),
      dueDate: order.requestedDeliveryDate || todayLocalPlusDays(14),
      items: invItems,
      uspCards: [],
      createdBy: currentUser?.name || null,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    // 1. Add invoice to invoicesOffers (automatically bridges to financialRecords ledger in App.tsx)
    setInvoicesOffers(prev => [newInvoice, ...prev]);

    // 2. If order was already paid, ensure financial record is marked paid
    if (order.paymentStatus === "paid" && setFinancialRecords) {
      const paidAmt = companyBillingSettings?.financeNetMode ? order.totalNetAmount : order.totalGrossAmount;
      setFinancialRecords(prev =>
        markInvoiceMovementPaid(prev, newInvoiceId, paidAmt, order.paidAt || order.orderDate || todayLocal())
      );
    }

    // 3. Mark the order as invoiced
    const updatedOrder: Order = {
      ...order,
      clientId: targetClientId || order.clientId,
      customerType: targetClientId ? "client" : order.customerType,
      invoiceId: newInvoiceId,
      invoiceNumber: newInvoiceNumber,
      invoiceIssuedAt: nowIso,
      updatedAt: nowIso
    };

    setOrders(prev => prev.map(o => (o.id === order.id ? updatedOrder : o)));
    if (editingOrder && editingOrder.id === order.id) {
      setEditingOrder(updatedOrder);
    }

    // The order is persisted by the state sync (setOrders -> sync.php).

    // 4. If a client is attached, add timeline event to client
    if (targetClientId) {
      const timelineEvent: TimelineEvent = {
        id: "ev-" + Math.random().toString(36).slice(2, 11),
        type: "invoice",
        timestamp: nowLocalStamp(),
        title: `${t("Invoice", "Faktúra", "Számla")} ${newInvoiceNumber}`,
        content: t(
          `Invoice ${newInvoiceNumber} issued from order ${order.orderNumber} for ${formatMoney(order.totalGrossAmount, order.currency, userLanguage)}.`,
          `Faktúra ${newInvoiceNumber} vystavená z objednávky ${order.orderNumber} v sume ${formatMoney(order.totalGrossAmount, order.currency, userLanguage)}.`,
          `A(z) ${newInvoiceNumber} számla kiállítva a(z) ${order.orderNumber} rendelésből ${formatMoney(order.totalGrossAmount, order.currency, userLanguage)} összegben.`
        ),
        amount: order.totalGrossAmount,
        author: currentUser?.name || getSystemTitle()
      };

      if (onAddTimelineEvent) {
        onAddTimelineEvent(targetClientId, timelineEvent);
      } else if (setLeads) {
        setLeads(prev =>
          prev.map(l =>
            l.id === targetClientId
              ? { ...l, timeline: [timelineEvent, ...(l.timeline || [])] }
              : l
          )
        );
      }
    }

    const toast = (window as unknown as { showToast?: (m: string) => void }).showToast;
    toast?.(
      t(
        `Invoice ${newInvoice.documentNumber} created and linked!`,
        `Faktúra ${newInvoice.documentNumber} bola úspešne vystavená a priradená!`,
        `A(z) ${newInvoice.documentNumber} számla sikeresen kiállítva és hozzárendelve!`
      )
    );
  };

  // Delete order
  const handleDeleteOrder = async (order: Order) => {
    if (!canDelete) return;
    if (!confirm(t(`Delete order ${order.orderNumber}?`, `Naozaj zmazať objednávku ${order.orderNumber}?`, `Biztosan törli a(z) ${order.orderNumber} rendelést?`))) return;

    try {
      await fetch(`/api/orders.php?id=${encodeURIComponent(order.id)}`, { method: "DELETE" });
      setOrders(prev => prev.filter(o => o.id !== order.id));
      const toast = (window as unknown as { showToast?: (m: string) => void }).showToast;
      toast?.(t("Order deleted.", "Objednávka bola zmazaná.", "Rendelés törölve."));
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  // Change status directly from card dropdown
  const handleChangeStatus = (order: Order, newStatus: string) => {
    if (!canEdit || order.status === newStatus) return;
    const updated = { ...order, status: newStatus };
    setOrders(prev => prev.map(o => o.id === order.id ? updated : o));
  };

  // Status, customer, payment and project: multi-select and faceted (see orders/useOrderFacets.ts).
  const facets = useOrderFacets({ orders, orderStatuses, projects, searchQuery, t, productName: PRODUCT_NAME });
  const filteredOrders = facets.filteredOrders;

  // Key metrics
  const stats = useMemo(() => {
    let totalRevenue = 0;
    let unpaidAmount = 0;
    let unpaidCount = 0;
    let newCount = 0;
    let processingCount = 0;
    let shippedCount = 0;
    let deliveredCount = 0;
    let cancelledCount = 0;

    orders.forEach(o => {
      totalRevenue += o.totalGrossAmount || 0;
      if (o.paymentStatus !== "paid") {
        unpaidAmount += o.totalGrossAmount || 0;
        unpaidCount++;
      }
      const st = orderStatuses.find(s => s.key === o.status);
      if (st?.group === "new") newCount++;
      else if (st?.group === "processing") processingCount++;
      else if (st?.group === "shipped") shippedCount++;
      else if (st?.group === "delivered") deliveredCount++;
      else if (st?.group === "cancelled") cancelledCount++;
    });

    return {
      totalRevenue,
      unpaidAmount,
      unpaidCount,
      newCount,
      processingCount,
      shippedCount,
      deliveredCount,
      cancelledCount,
      totalCount: orders.length
    };
  }, [orders, orderStatuses]);

  const money = (val: number, decimals = 2) =>
    formatMoney(val || 0, systemCurrency, userLanguage, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });

  const orderStatusOptions = useMemo(() => {
    return orderStatuses.map(s => ({
      value: s.key,
      label: orderStatusLabel(s.key, t, orderStatuses),
      color: orderStatusColor(s.key, orderStatuses),
    }));
  }, [orderStatuses, userLanguage]);

  // Open modal for create
  const handleOpenCreate = () => {
    setEditingOrder(buildOrderDraft({
      attachTo: null,
      statuses: orderStatuses,
      billingSettings: companyBillingSettings,
      currency: systemCurrency,
      existingOrders: orders,
      today: todayLocal(),
    }));
  };

  // Open separate view for edit
  const handleOpenEdit = (order: Order) => {
    setEditingOrder(JSON.parse(JSON.stringify(order)));
  };

  // Save order from detail view
  const handleSaveOrder = (orderToSave: Order) => {
    // Recalculate totals
    const totals = calculateOrderTotals(orderToSave.items || []);
    const completeOrder: Order = {
      ...orderToSave,
      ...totals
    };

    const isNew = !orders.some(o => o.id === completeOrder.id);

    setOrders(prev => {
      const exists = prev.some(o => o.id === completeOrder.id);
      if (exists) return prev.map(o => o.id === completeOrder.id ? completeOrder : o);
      return [completeOrder, ...prev];
    });

    // One note, on the record the user started from (else the one the order is attached to).
    const noteTargetId = newOrderOriginRef.current?.orderId === completeOrder.id
      ? newOrderOriginRef.current.originId
      : null;
    const timelineLeadId = noteTargetId || completeOrder.clientId;
    if (isNew && timelineLeadId && onAddTimelineEvent) {
      onAddTimelineEvent(timelineLeadId, {
        id: `event_ord_${Date.now()}`,
        type: "note",
        timestamp: nowLocalStamp(),
        title: t(
          `Order created: ${completeOrder.orderNumber}`,
          `Vytvorená nová objednávka: ${completeOrder.orderNumber}`,
          `Új rendelés létrehozva: ${completeOrder.orderNumber}`
        ),
        content: `${t("Total amount", "Celková suma", "Végösszeg")}: ${formatMoney(completeOrder.totalGrossAmount, completeOrder.currency || systemCurrency || "EUR", userLanguage)} (${(completeOrder.items || []).length} ${t("items", "položiek", "tétel")})`,
        author: currentUser?.name || "System"
      });
    }

    // The order itself is persisted by the state sync (setOrders -> sync.php).
    const toast = (window as unknown as { showToast?: (m: string) => void }).showToast;
    toast?.(t("Order saved successfully!", "Objednávka bola úspešne uložená!", "A rendelés sikeresen elmentve!"));

    if (returnRoute || window.location.hash.startsWith("#orders/new")) {
      leaveEditor();
    } else {
      setEditingOrder(null);
    }
  };

  // Close the editor: back to the page a new order was started from, else the Orders list.
  const leaveEditor = () => {
    const back = returnRoute;
    setEditingOrder(null);
    setReturnRoute(null);
    newOrderOriginRef.current = null;
    if (back) {
      window.location.hash = back;
    } else if (window.location.hash.startsWith("#orders/")) {
      window.location.hash = "orders";
    }
  };

  // When creating or editing an order, show the separate full view matching Leads layout
  if (editingOrder !== null) {
    return (
      <OrderDetailView
        order={editingOrder}
        onSave={handleSaveOrder}
        onClose={leaveEditor}
        onDelete={handleDeleteOrder}
        onConvertGuest={handleConvertGuest}
        onFulfillWarehouse={handleFulfillWarehouse}
        onCreateInvoice={handleCreateInvoice}
        leads={leads}
        setLeads={setLeads}
        warehouseItems={warehouseItems}
        priceLevels={priceLevels}
        warehouses={warehouses}
        orderStatuses={orderStatuses}
        systemCurrency={systemCurrency}
        userLanguage={userLanguage}
        canEdit={canEdit}
        canDelete={canDelete}
        onOpenClient={onOpenClient}
        companyBillingSettings={companyBillingSettings}
        projects={projects}
        backLabel={returnRoute
          ? returnRoute.startsWith("lead")
            ? t("Back to lead", "Späť na lead", "Vissza a leadhez")
            : returnRoute.startsWith("project")
            ? t("Back to project", "Späť na projekt", "Vissza a projekthez")
            : t("Back to client", "Späť na klienta", "Vissza az ügyfélhez")
          : undefined}
      />
    );
  }

  return (
    <div className="space-y-6 pb-16 font-sans animate-fade-in text-left">
      {/* 1. SECTION HEADER & COMMAND BAR */}
      <PageHeader
        icon={<SectionIcon id="orders" />}
        title={t("Orders & Fulfillment", "Objednávky a expedícia", "Rendelések és kiszolgálás")}
        subtitle={t(
          "Manage customer orders, track fulfillment stages, warehouse dispatching and payments.",
          "Správa zákazníckych objednávok, sledovanie stavu expedície, vyskladňovania a platieb.",
          "Vevői rendelések kezelése, teljesítés nyomon követése, raktári kiadás és fizetés."
        )}
        badge={
          !canEdit ? (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-xl text-caption text-amber-800 font-medium">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span>{t("Read-only access", "Iba na čítanie", "Csak olvasható")}</span>
            </div>
          ) : undefined
        }
        actions={
          <>
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-200 hover:border-entity-border text-gray-700 text-ui font-semibold rounded-md shadow-2xs transition-all cursor-pointer"
              >
                <Sliders className="h-4 w-4 text-entity-text" />
                <span>{t("Order settings", "Nastavenia objednávok", "Rendelés beállítások")}</span>
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={handleOpenCreate}
                className="flex items-center gap-2 px-4 py-2 bg-entity-solid hover:bg-entity-solid-hover text-white text-ui font-semibold rounded-md shadow-xs transition-all cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>{t("New order", "Nová objednávka", "Új rendelés")}</span>
              </button>
            )}
          </>
        }
      />

      {/* 2. KPI OVERVIEW STRIP */}
      <StatGrid count={4}>
        <StatTile
          icon={<SectionIcon id="orders" className="h-6 w-6" />}
          tone="bg-entity-subtle text-entity-text"
          label={t("Total orders", "Všetky objednávky", "Összes rendelés")}
          value={String(stats.totalCount)}
          delta={
            stats.newCount > 0
              ? t(`${stats.newCount} new orders`, `${stats.newCount} nových`, `${stats.newCount} új`)
              : undefined
          }
        />
        <StatTile
          icon={<Package className="h-6 w-6" />}
          tone="bg-sky-50 text-sky-600"
          label={t("Awaiting prep", "Na vybavenie", "Feldolgozás alatt")}
          value={String(stats.newCount + stats.processingCount)}
          delta={t("new & in preparation", "nové a v príprave", "új és előkészítés alatt")}
        />
        <StatTile
          icon={<TrendingUp className="h-6 w-6" />}
          tone="bg-emerald-50 text-emerald-600"
          label={t("Total volume", "Celkový obrat", "Összes forgalom")}
          value={money(stats.totalRevenue, 0)}
          delta={t("gross turnover", "obrat s DPH", "bruttó forgalom")}
        />
        <StatTile
          icon={<CreditCard className="h-6 w-6" />}
          tone="bg-amber-50 text-amber-600"
          label={t("Unpaid amount", "Nezaplatené", "Kifizetetlen")}
          value={money(stats.unpaidAmount, 0)}
          delta={
            stats.unpaidCount > 0
              ? t(`${stats.unpaidCount} unpaid orders`, `${stats.unpaidCount} nezaplatených`, `${stats.unpaidCount} kifizetetlen`)
              : t("all settled", "všetko uhradené", "minden rendezve")
          }
        />
      </StatGrid>

      {/* 3. PINNED STATUSES (star in the status dropdown) as one-click chips */}
      <PinnedFilterChips
        options={facets.options.status}
        pinned={facets.pinnedStatuses}
        selected={facets.selection.status}
        onChange={next => facets.setSelection("status", next)}
      />

      {/* 4. SEARCH & FILTERS BAR */}
      <div className="bg-white p-3 ws-sm:p-4 rounded-lg border border-gray-200 shadow-xs flex flex-col ws-xl:flex-row gap-2.5 ws-sm:gap-3 ws-xl:items-center ws-xl:justify-between">
        <div className="relative w-full ws-xl:w-80">
          <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder={t("Search order, client, tracking or city…", "Hľadať objednávku, klienta, trasovanie alebo mesto…", "Rendelés, ügyfél, szám keresése…")}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-9 py-2 bg-white border border-gray-300 rounded-md text-ui text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-entity-ring focus:border-entity-solid transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
              title={t("Clear search", "Zmazať hľadanie", "Keresés törlése")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 ws-sm:grid-cols-4 gap-2 w-full ws-xl:w-auto">
          {(["status", "customerType", "payment", "project"] as const).map(id => (
            <FacetedMultiSelect
              key={id}
              className="h-10 w-full"
              options={facets.options[id]}
              selected={facets.selection[id]}
              onChange={next => facets.setSelection(id, next)}
              allLabel={facets.allLabels[id]}
              pinned={id === "status" ? facets.pinnedStatuses : undefined}
              onTogglePin={id === "status" ? facets.togglePinnedStatus : undefined}
            />
          ))}
        </div>
      </div>

      {/* 5. ORDERS TABLE */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-clip">
        <div ref={tableWrapRef} className="table-page-wrap">
          <table className="w-full text-left text-ui border-collapse min-w-220">
            <thead className="table-page-sticky-head">
              <tr className="bg-gray-50 text-gray-500 type-overline border-b border-gray-200">
                <ResizableTh listKey="orders" colKey="order-no." className="p-4">{t("Order no.", "Číslo objednávky", "Rendelésszám")}</ResizableTh>
                <ResizableTh listKey="orders" colKey="customer" className="p-4">{t("Customer", "Zákazník", "Ügyfél")}</ResizableTh>
                <ResizableTh listKey="orders" colKey="delivery-tracking" className="p-4">{t("Delivery & Tracking", "Doprava a trasovanie", "Szállítás és nyomon követés")}</ResizableTh>
                <ResizableTh listKey="orders" colKey="items" className="p-4">{t("Items", "Položky", "Tételek")}</ResizableTh>
                <ResizableTh listKey="orders" colKey="payment" className="p-4">{t("Payment", "Platba", "Fizetés")}</ResizableTh>
                <ResizableTh listKey="orders" colKey="total-gross" className="p-4 text-right">{t("Total gross", "Celkom s DPH", "Összesen")}</ResizableTh>
                <ResizableTh listKey="orders" colKey="status" className="p-4 text-center">{t("Status", "Stav", "Állapot")}</ResizableTh>
                <th className="p-4 text-right">{t("Actions", "Akcie", "Műveletek")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredOrders.length > 0 ? (
                filteredOrders.map(order => {
                  const statusColor = orderStatusColor(order.status, orderStatuses);
                  const statusName = orderStatusLabel(order.status, t, orderStatuses);
                  const clientMatch = order.clientId ? leads.find(l => l.id === order.clientId) : null;
                  const customerDisplayName = order.customerType === "client"
                    ? (clientMatch?.name || order.billing?.name || t("Registered Client", "Registrovaný klient", "Regisztrált ügyfél"))
                    : (order.guest?.name || order.guest?.company || order.billing?.name || t("Guest Customer", "Hosť", "Vendég vásárló"));
                  const customerEntity = clientMatch && !isClientRecord(clientMatch) ? "leads" : "clients";

                  const productCount = (order.items || []).filter(i => i.itemType === "product").length;
                  const serviceCount = (order.items || []).filter(i => i.itemType === "service").length;
                  const totalItemsCount = (order.items || []).reduce((acc, it) => acc + (it.quantity || 1), 0);

                  return (
                    <tr key={order.id} className="hover:bg-entity-subtle/40 transition-colors">
                      {/* 1. Order no. & date */}
                      <td className="p-4 align-top whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(order)}
                            className="font-mono font-bold text-ui text-entity-text hover:underline cursor-pointer transition-colors text-left"
                            title={t("Open order detail", "Otvoriť detail objednávky", "Rendelés megnyitása")}
                          >
                            {order.orderNumber}
                          </button>
                        </div>
                        <div className="text-caption text-gray-400 font-sans mt-0.5">
                          {formatDateLocalized(order.orderDate, userLanguage)}
                        </div>
                      </td>

                      {/* 2. Customer */}
                      <td className="p-4 align-top">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {order.customerType === "client" ? (
                            <EntityBadge
                              entity={customerEntity}
                              label={customerDisplayName}
                              showIcon
                              onClick={order.clientId && onOpenClient ? () => onOpenClient(order.clientId!) : undefined}
                            />
                          ) : (
                            <span className="font-semibold text-gray-900 truncate max-w-50" title={customerDisplayName}>
                              {customerDisplayName}
                            </span>
                          )}
                        </div>
                        <OrderProjectBadge order={order} projects={projects} leads={leads} language={userLanguage} />
                        <div className="flex items-center gap-1.5 mt-1">
                          {order.customerType === "client" ? (
                            <EntityBadge
                              entity={customerEntity}
                              label={customerEntity === "leads" ? t("Lead", "Lead", "Lead") : t("Client", "Klient", "Ügyfél")}
                              size="sm"
                            />
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-micro font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              <User className="h-3 w-3" />
                              {t("Guest", "Hosť", "Vendég")}
                            </span>
                          )}
                          {order.customerType === "guest" && canEdit && (
                            <button
                              type="button"
                              style={entityAccentStyle("clients")}
                              onClick={() => handleConvertGuest(order)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-micro font-semibold bg-entity-subtle hover:bg-entity-muted text-entity-text border border-entity-border transition-colors cursor-pointer"
                              title={t(`Convert guest to ${PRODUCT_NAME} client`, "Vytvoriť z hosťa klienta", "Vendégből ügyfél")}
                            >
                              <UserCheck className="h-3 w-3" />
                              <span>{t("To client", `+ Do ${PRODUCT_NAME}`, "+ Ügyfél")}</span>
                            </button>
                          )}
                        </div>
                        {order.delivery?.city && (
                          <div className="text-caption text-gray-400 mt-1 flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-gray-400 shrink-0" />
                            <span className="truncate max-w-45">{order.delivery.city}</span>
                          </div>
                        )}
                      </td>

                      {/* 3. Delivery & Tracking */}
                      <td className="p-4 align-top">
                        {order.shippingMethod ? (
                          <div className="flex items-center gap-1.5 text-ui font-medium text-gray-700">
                            <Truck className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                            <span>{order.shippingMethod}</span>
                          </div>
                        ) : (
                          <span className="text-caption text-gray-400">—</span>
                        )}
                        {order.shippingTrackingNumber && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 font-mono text-micro bg-gray-100 px-2 py-0.5 rounded-md text-gray-700 border border-gray-200">
                              <span>{order.shippingTrackingNumber}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyTracking(order.shippingTrackingNumber!, order.id)}
                                className="hover:text-entity-text transition-colors p-0.5 cursor-pointer"
                                title={t("Copy tracking number", "Kopírovať číslo zásielky", "Szám másolása")}
                              >
                                {copiedTrackingId === order.id ? (
                                  <Check className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 4. Items */}
                      <td className="p-4 align-top">
                        <div className="font-semibold text-gray-800">
                          {totalItemsCount} {t("pcs", "ks", "db")}
                        </div>
                        <div className="text-caption text-gray-400 flex items-center gap-1.5 mt-0.5">
                          <span>{productCount} {t("prod.", "prod.", "term.")}</span>
                          <span>•</span>
                          <span>{serviceCount} {t("serv.", "služ.", "szolg.")}</span>
                        </div>
                      </td>

                      {/* 5. Payment */}
                      <td className="p-4 align-top">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {order.paymentStatus === "paid" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-micro font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <Check className="h-3 w-3" />
                              {t("Paid", "Zaplatené", "Fizetve")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-micro font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="h-3 w-3" />
                              {t("Unpaid", "K úhrade", "Fizetésre vár")}
                            </span>
                          )}
                          {order.invoiceNumber && (
                            <EntityBadge
                              entity="invoices"
                              label={order.invoiceNumber}
                              showIcon
                              size="sm"
                            />
                          )}
                        </div>
                        {order.paymentMethod && (
                          <div className="text-caption text-gray-500 mt-1 flex items-center gap-1">
                            <CreditCard className="h-3 w-3 text-gray-400 shrink-0" />
                            <span className="truncate max-w-35">{order.paymentMethod}</span>
                          </div>
                        )}
                      </td>

                      {/* 6. Total gross */}
                      <td className="p-4 align-top text-right whitespace-nowrap">
                        <div className="font-mono font-bold text-gray-900 tabular-nums">
                          {money(order.totalGrossAmount)}
                        </div>
                        <div className="text-caption text-gray-400 font-sans mt-0.5 tabular-nums">
                          {money(order.totalNetAmount)} {t("excl. VAT", "bez DPH", "áfa nélkül")}
                        </div>
                      </td>

                      {/* 7. Status */}
                      <td className="p-4 align-top text-center whitespace-nowrap">
                        {canEdit ? (
                          <CustomSelect
                            size="sm"
                            align="right"
                            value={order.status}
                            onChange={next => handleChangeStatus(order, next)}
                            options={orderStatusOptions}
                            unstyled
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md type-overline border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 shadow-2xs cursor-pointer transition-all"
                            style={{ borderLeftColor: statusColor, borderLeftWidth: "4px" }}
                          />
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md type-overline border border-gray-200 bg-white text-gray-800"
                            style={{ borderLeftColor: statusColor, borderLeftWidth: "4px" }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
                            {statusName}
                          </span>
                        )}
                      </td>

                      {/* 8. Actions */}
                      <td className="p-4 align-top text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            style={entityAccentStyle("warehouse")}
                            onClick={() => handleFulfillWarehouse(order)}
                            disabled={!canEdit}
                            className="p-2 text-gray-500 hover:text-entity-text hover:bg-entity-subtle rounded-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            title={t("Fulfill with warehouse delivery note", "Vyskladniť výdajkou zo skladu", "Kiadás raktárból")}
                          >
                            <Package className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            style={entityAccentStyle("invoices")}
                            onClick={() => handleCreateInvoice(order)}
                            disabled={!canEdit}
                            className={`p-2 rounded-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              order.invoiceNumber
                                ? "text-entity-text bg-entity-subtle hover:bg-entity-muted border border-entity-border shadow-2xs"
                                : "text-gray-500 hover:text-entity-text hover:bg-entity-subtle"
                            }`}
                            title={
                              order.invoiceNumber
                                ? t(`Invoice created: ${order.invoiceNumber}`, `Faktúra vystavená: ${order.invoiceNumber}`, `Számla kiállítva: ${order.invoiceNumber}`)
                                : t("Issue invoice", "Vystaviť faktúru", "Számla kiállítása")
                            }
                          >
                            {order.invoiceNumber ? <FileCheck className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(order)}
                            className="p-2 text-gray-500 hover:text-entity-text hover:bg-entity-subtle rounded-md transition-all cursor-pointer"
                            title={t("Edit order", "Upraviť objednávku", "Rendelés szerkesztése")}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>

                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteOrder(order)}
                              className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all cursor-pointer"
                              title={t("Delete order", "Zmazať objednávku", "Rendelés törlése")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="p-12 text-center">
                    <EmptyState
                      icon={<SectionIcon id="orders" className="h-10 w-10" />}
                      title={t("No orders found", "Žiadne objednávky sa nenašli", "Nem található rendelés")}
                      body={t(
                        "Create a new commercial or e-shop order to begin tracking fulfillment, deliveries and payments.",
                        "Vytvorte novú obchodnú alebo e-shopovú objednávku pre sledovanie prípravy, dopravy a platieb.",
                        "Hozzon létre egy új rendelést a szállítás és a fizetés nyomon követéséhez."
                      )}
                      action={
                        canEdit ? (
                          <button
                            type="button"
                            onClick={handleOpenCreate}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-entity-solid hover:bg-entity-solid-hover text-white text-ui font-semibold rounded-md shadow-xs transition-all cursor-pointer"
                          >
                            <Plus className="h-4 w-4" />
                            <span>{t("New order", "Nová objednávka", "Új rendelés")}</span>
                          </button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <StickyHScrollbar target={tableWrapEl} />
      </div>
    </div>
  );
};
