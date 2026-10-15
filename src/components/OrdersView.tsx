import React, { useState, useMemo, useEffect } from "react";
import {
  ShoppingCart,
  Search,
  Plus,
  Sliders,
  Package,
  FileText,
  FileCheck,
  UserCheck,
  User,
  Truck,
  ExternalLink,
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
  generateOrderNumber,
  defaultOrderStatus,
} from "../utils/orders";
import { OrderDetailView } from "./OrderDetailView";
import { getDefaultVatRate } from "../utils/vat";
import { getDefaultPaymentMethod } from "../utils/payment";
import { formatMoney } from "../utils/currency";
import { formatDateLocalized, todayLocal, todayLocalPlusDays, nowLocalStamp } from "../utils/localTime";
import { invoiceMovementId } from "../utils/invoiceFinanceBridge";
import { PageHeader, StatGrid, StatTile, Tabs, EmptyState } from "./layout";
import { CustomSelect } from "./ui/CustomSelect";

export interface OrdersViewProps {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  leads: Lead[];
  setLeads?: React.Dispatch<React.SetStateAction<Lead[]>>;
  warehouseItems?: WarehouseItem[];
  warehouses?: Warehouse[];
  setWarehouseMovements?: React.Dispatch<React.SetStateAction<WarehouseMovement[]>>;
  invoicesOffers?: InvoiceOffer[];
  setInvoicesOffers?: React.Dispatch<React.SetStateAction<InvoiceOffer[]>>;
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
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  setOrders,
  leads,
  setLeads,
  warehouseItems = [],
  warehouses = [],
  setWarehouseMovements,
  invoicesOffers: _invoicesOffers = [],
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
  initialSelectedOrderId
}) => {
  const t = (en: string, sk: string, hu: string) =>
    userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  const orderStatuses = useOrderStatuses();
  const canEdit = getPermission("orders") === "edit";
  const canDelete = canEdit && getPermission("orders.delete") === "edit";

  const [activeGroupFilter, setActiveGroupFilter] = useState<string>("all");
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedTrackingId, setCopiedTrackingId] = useState<string | null>(null);

  // Active editing or creating order (separate full-page view)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  // Auto-open order if requested via deep link / initialSelectedOrderId
  useEffect(() => {
    if (initialSelectedOrderId && orders.length > 0) {
      const match = orders.find(
        o => o.id === initialSelectedOrderId || o.orderNumber === initialSelectedOrderId
      );
      if (match) {
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
    if (!confirm(t("Convert this guest to a registered CRM client?", "Vytvoriť z tohto hosťa nového klienta v CRM?", "Létrehozza ebből a vendégből az új CRM ügyfelet?"))) return;

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
    const physicalItems = (order.items || []).filter(i => i.itemType === "product" && i.quantity > 0);
    if (physicalItems.length === 0) {
      alert(t("This order contains no physical products to fulfill.", "Táto objednávka neobsahuje žiadne fyzické produkty na vyskladnenie.", "Ez a rendelés nem tartalmaz fizikai termékeket."));
      return;
    }

    if (!confirm(t(`Create warehouse delivery note (výdajka) for ${physicalItems.length} products?`, `Vystaviť výdajku zo skladu pre ${physicalItems.length} produktov?`, `Kiállítja a raktári kiadási bizonylatot ${physicalItems.length} termékre?`))) return;

    const warehouseId = order.warehouseId || (warehouses[0]?.id ?? "wh-default");
    const newMovement: WarehouseMovement = {
      id: `mov_${Date.now()}`,
      documentNumber: `VYD-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      type: "outward",
      status: "confirmed",
      warehouseId,
      leadId: order.clientId || undefined,
      totalCostValue: 0,
      totalSellValue: order.itemsNetAmount,
      totalProfitValue: 0,
      createdBy: currentUser?.name || "System",
      note: `${t("Order fulfillment", "Vyskladnenie k objednávke", "Rendelés teljesítése")}: ${order.orderNumber}`,
      issuedAt: new Date().toISOString().split("T")[0],
      createdAt: new Date().toISOString(),
      items: physicalItems.map(item => ({
        id: `mov_item_${Date.now()}_${Math.random()}`,
        itemId: item.itemId || item.id,
        quantity: item.quantity,
        unitPurchasePrice: 0,
        unitSellPrice: item.unitPrice,
        totalPrice: item.totalNetAmount,
        note: item.name
      }))
    };

    setWarehouseMovements(prev => [newMovement, ...prev]);
    const toast = (window as unknown as { showToast?: (m: string) => void }).showToast;
    toast?.(t(`Delivery note ${newMovement.documentNumber} created!`, `Výdajka ${newMovement.documentNumber} bola úspešne vytvorená!`, `A(z) ${newMovement.documentNumber} kiadási bizonylat elkészült!`));
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
    const newInvoiceNumber = `FA-${new Date().getFullYear()}-${String(
      Math.floor(Math.random() * 9000) + 1000
    )}`;

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
      status: order.paymentStatus === "paid" ? "invoiced" : "sent",
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
      const recId = invoiceMovementId(newInvoiceId);
      setFinancialRecords(prev =>
        prev.map(r =>
          r.id === recId
            ? {
                ...r,
                status: "paid",
                amountReal: order.totalGrossAmount,
                paidDate: order.paidAt || order.orderDate || todayLocal()
              }
            : r
        )
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

    // Persist order update to server
    try {
      await fetch("/api/orders.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedOrder)
      });
    } catch (e) {
      console.error("Failed to sync updated order to /api/orders.php", e);
    }

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
        author: currentUser?.name || "CCRM"
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
  const handleChangeStatus = async (order: Order, newStatus: string) => {
    if (!canEdit || order.status === newStatus) return;
    const updated = { ...order, status: newStatus };
    setOrders(prev => prev.map(o => o.id === order.id ? updated : o));
    try {
      await fetch("/api/orders.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      });
    } catch (e) {
      console.error("Failed to sync order status update", e);
    }
  };

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Group filter
      if (activeGroupFilter !== "all") {
        const def = orderStatuses.find(s => s.key === order.status);
        if (!def || def.group !== activeGroupFilter) return false;
      }

      // Customer filter
      if (customerTypeFilter === "client" && order.customerType !== "client") return false;
      if (customerTypeFilter === "guest" && order.customerType !== "guest") return false;

      // Payment filter
      if (paymentStatusFilter === "paid" && order.paymentStatus !== "paid") return false;
      if (paymentStatusFilter === "unpaid" && order.paymentStatus === "paid") return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const num = (order.orderNumber || "").toLowerCase();
        const clientName = (order.billing?.name || order.guest?.name || order.guest?.company || "").toLowerCase();
        const email = (order.guest?.email || "").toLowerCase();
        const phone = (order.guest?.phone || order.delivery?.phone || "").toLowerCase();
        const tracking = (order.shippingTrackingNumber || "").toLowerCase();
        const city = (order.delivery?.city || "").toLowerCase();

        const fullStr = `${num} ${clientName} ${email} ${phone} ${tracking} ${city}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (!fullStr.includes(q)) return false;
      }

      return true;
    });
  }, [orders, activeGroupFilter, customerTypeFilter, paymentStatusFilter, searchQuery, orderStatuses]);

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
      label: (
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
          <span>{orderStatusLabel(s.key, t, orderStatuses)}</span>
        </span>
      ),
      searchText: orderStatusLabel(s.key, t, orderStatuses)
    }));
  }, [orderStatuses, userLanguage]);

  // Open modal for create
  const handleOpenCreate = () => {
    const newOrd: Order = {
      id: `ord_${Date.now()}`,
      orderNumber: generateOrderNumber("OBJ", orders.length + 1),
      type: "sales",
      status: defaultOrderStatus(orderStatuses),
      customerType: "client",
      clientId: null,
      delivery: {
        recipient: "",
        street: "",
        city: "",
        zip: "",
        country: "SK",
        phone: ""
      },
      billing: {
        name: "",
        street: "",
        city: "",
        zip: "",
        country: "SK"
      },
      paymentMethod: getDefaultPaymentMethod(companyBillingSettings),
      paymentStatus: "unpaid",
      currency: systemCurrency || "EUR",
      itemsNetAmount: 0,
      servicesNetAmount: 0,
      totalNetAmount: 0,
      totalTaxAmount: 0,
      totalGrossAmount: 0,
      orderDate: new Date().toISOString().split("T")[0],
      items: []
    };
    setEditingOrder(newOrd);
  };

  // Open separate view for edit
  const handleOpenEdit = (order: Order) => {
    setEditingOrder(JSON.parse(JSON.stringify(order)));
  };

  // Save order from detail view
  const handleSaveOrder = async (orderToSave: Order) => {
    // Recalculate totals
    const totals = calculateOrderTotals(orderToSave.items || []);
    const completeOrder: Order = {
      ...orderToSave,
      ...totals
    };

    setOrders(prev => {
      const exists = prev.some(o => o.id === completeOrder.id);
      if (exists) return prev.map(o => o.id === completeOrder.id ? completeOrder : o);
      return [completeOrder, ...prev];
    });

    setEditingOrder(null);

    try {
      await fetch("/api/orders.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completeOrder)
      });
      const toast = (window as unknown as { showToast?: (m: string) => void }).showToast;
      toast?.(t("Order saved successfully!", "Objednávka bola úspešne uložená!", "A rendelés sikeresen elmentve!"));
    } catch (e) {
      console.error("Failed to save order to backend", e);
    }
  };

  // When creating or editing an order, show the separate full view matching Leads layout
  if (editingOrder !== null) {
    return (
      <OrderDetailView
        order={editingOrder}
        onSave={handleSaveOrder}
        onClose={() => {
          setEditingOrder(null);
          if (window.location.hash.startsWith("#orders/")) {
            window.location.hash = "orders";
          }
        }}
        onDelete={handleDeleteOrder}
        onConvertGuest={handleConvertGuest}
        onFulfillWarehouse={handleFulfillWarehouse}
        onCreateInvoice={handleCreateInvoice}
        leads={leads}
        setLeads={setLeads}
        warehouseItems={warehouseItems}
        warehouses={warehouses}
        orderStatuses={orderStatuses}
        systemCurrency={systemCurrency}
        userLanguage={userLanguage}
        canEdit={canEdit}
        canDelete={canDelete}
        onOpenClient={onOpenClient}
        companyBillingSettings={companyBillingSettings}
      />
    );
  }

  return (
    <div className="space-y-6 pb-16 font-sans animate-fade-in text-left">
      {/* 1. SECTION HEADER & COMMAND BAR */}
      <PageHeader
        icon={<ShoppingCart className="h-6 w-6 text-indigo-600" />}
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
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 text-ui font-semibold rounded-2xl shadow-sm transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              >
                <Sliders className="h-4 w-4 text-indigo-500" />
                <span>{t("Order settings", "Nastavenia objednávok", "Rendelés beállítások")}</span>
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={handleOpenCreate}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-ui font-semibold rounded-2xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
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
          icon={<ShoppingCart className="h-6 w-6" />}
          tone="bg-indigo-50 text-indigo-600"
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

      {/* 3. LIFECYCLE TABS */}
      <Tabs
        value={activeGroupFilter}
        onChange={setActiveGroupFilter}
        items={[
          { key: "all", label: t("All orders", "Všetky objednávky", "Minden rendelés"), count: orders.length },
          { key: "new", label: t("New", "Nové", "Új"), count: stats.newCount },
          { key: "processing", label: t("Processing", "Príprava", "Feldolgozás"), count: stats.processingCount },
          { key: "shipped", label: t("Shipped", "V preprave", "Úton"), count: stats.shippedCount },
          { key: "delivered", label: t("Delivered", "Doručené", "Kézbesítve"), count: stats.deliveredCount },
          { key: "cancelled", label: t("Cancelled", "Storno", "Törölve"), count: stats.cancelledCount }
        ]}
      />

      {/* 4. SEARCH & FILTERS BAR */}
      <div className="bg-white p-3 ws-sm:p-4 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col ws-xl:flex-row gap-2.5 ws-sm:gap-3 ws-xl:items-center ws-xl:justify-between">
        <div className="relative w-full ws-xl:w-80">
          <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder={t("Search order, client, tracking or city…", "Hľadať objednávku, klienta, trasovanie alebo mesto…", "Rendelés, ügyfél, szám keresése…")}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-ui text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              title={t("Clear search", "Zmazať hľadanie", "Keresés törlése")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-2 w-full ws-xl:w-auto">
          <CustomSelect
            size="sm"
            value={customerTypeFilter}
            onChange={setCustomerTypeFilter}
            className="w-full"
            options={[
              { value: "all", label: t("All customers", "Všetci zákazníci", "Minden vevő") },
              { value: "client", label: t("Registered clients only", "Iba klienti CRM", "Csak CRM ügyfelek") },
              { value: "guest", label: t("Guests only (E-shop)", "Iba hostia (E-shop)", "Csak vendég vásárlók") }
            ]}
          />
          <CustomSelect
            size="sm"
            value={paymentStatusFilter}
            onChange={setPaymentStatusFilter}
            className="w-full"
            options={[
              { value: "all", label: t("All payments", "Všetky platby", "Minden fizetés") },
              { value: "paid", label: t("Paid only", "Iba zaplatené", "Csak fizetett") },
              { value: "unpaid", label: t("Unpaid only", "Iba nezaplatené", "Csak kifizetetlen") }
            ]}
          />
        </div>
      </div>

      {/* 5. ORDERS TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-ui border-collapse min-w-220">
            <thead>
              <tr className="bg-slate-50 text-slate-500 type-overline border-b border-slate-200">
                <th className="p-4">{t("Order no.", "Číslo objednávky", "Rendelésszám")}</th>
                <th className="p-4">{t("Customer", "Zákazník", "Ügyfél")}</th>
                <th className="p-4">{t("Delivery & Tracking", "Doprava a trasovanie", "Szállítás és nyomon követés")}</th>
                <th className="p-4">{t("Items", "Položky", "Tételek")}</th>
                <th className="p-4">{t("Payment", "Platba", "Fizetés")}</th>
                <th className="p-4 text-right">{t("Total gross", "Celkom s DPH", "Összesen")}</th>
                <th className="p-4 text-center">{t("Status", "Stav", "Állapot")}</th>
                <th className="p-4 text-right">{t("Actions", "Akcie", "Műveletek")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length > 0 ? (
                filteredOrders.map(order => {
                  const statusColor = orderStatusColor(order.status, orderStatuses);
                  const statusName = orderStatusLabel(order.status, t, orderStatuses);
                  const clientMatch = order.clientId ? leads.find(l => l.id === order.clientId) : null;
                  const customerDisplayName = order.customerType === "client"
                    ? (clientMatch?.name || order.billing?.name || t("Registered Client", "Registrovaný klient", "Regisztrált ügyfél"))
                    : (order.guest?.name || order.guest?.company || order.billing?.name || t("Guest Customer", "Hosť", "Vendég vásárló"));

                  const productCount = (order.items || []).filter(i => i.itemType === "product").length;
                  const serviceCount = (order.items || []).filter(i => i.itemType === "service").length;
                  const totalItemsCount = (order.items || []).reduce((acc, it) => acc + (it.quantity || 1), 0);

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* 1. Order no. & date */}
                      <td className="p-4 align-top whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(order)}
                            className="font-mono font-bold text-ui text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer transition-colors text-left"
                            title={t("Open order detail", "Otvoriť detail objednávky", "Rendelés megnyitása")}
                          >
                            {order.orderNumber}
                          </button>
                        </div>
                        <div className="text-caption text-slate-400 font-sans mt-0.5">
                          {formatDateLocalized(order.orderDate, userLanguage)}
                        </div>
                      </td>

                      {/* 2. Customer */}
                      <td className="p-4 align-top">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900 truncate max-w-50" title={customerDisplayName}>
                            {customerDisplayName}
                          </span>
                          {order.customerType === "client" && order.clientId && onOpenClient && (
                            <button
                              type="button"
                              onClick={() => onOpenClient(order.clientId!)}
                              className="text-slate-400 hover:text-indigo-600 p-0.5 rounded transition-colors cursor-pointer"
                              title={t("View client in CRM", "Zobraziť klienta v CRM", "Ügyfél megtekintése")}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {order.customerType === "client" ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-micro font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <UserCheck className="h-3 w-3" />
                              {t("Client", "Klient", "Ügyfél")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-micro font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <User className="h-3 w-3" />
                              {t("Guest", "Hosť", "Vendég")}
                            </span>
                          )}
                          {order.customerType === "guest" && canEdit && (
                            <button
                              type="button"
                              onClick={() => handleConvertGuest(order)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-micro font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors cursor-pointer"
                              title={t("Convert guest to CRM client", "Vytvoriť z hosťa klienta", "Vendégből ügyfél")}
                            >
                              <UserCheck className="h-3 w-3" />
                              <span>{t("To client", "+ Do CRM", "+ Ügyfél")}</span>
                            </button>
                          )}
                        </div>
                        {order.delivery?.city && (
                          <div className="text-caption text-slate-400 mt-1 flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-45">{order.delivery.city}</span>
                          </div>
                        )}
                      </td>

                      {/* 3. Delivery & Tracking */}
                      <td className="p-4 align-top">
                        {order.shippingMethod ? (
                          <div className="flex items-center gap-1.5 text-ui font-medium text-slate-700">
                            <Truck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span>{order.shippingMethod}</span>
                          </div>
                        ) : (
                          <span className="text-caption text-slate-400">—</span>
                        )}
                        {order.shippingTrackingNumber && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 font-mono text-micro bg-slate-100 px-2 py-0.5 rounded-md text-slate-700 border border-slate-200">
                              <span>{order.shippingTrackingNumber}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyTracking(order.shippingTrackingNumber!, order.id)}
                                className="hover:text-indigo-600 transition-colors p-0.5 cursor-pointer"
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
                        <div className="font-semibold text-slate-800">
                          {totalItemsCount} {t("pcs", "ks", "db")}
                        </div>
                        <div className="text-caption text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span>{productCount} {t("prod.", "prod.", "term.")}</span>
                          <span>•</span>
                          <span>{serviceCount} {t("serv.", "služ.", "szolg.")}</span>
                        </div>
                      </td>

                      {/* 5. Payment */}
                      <td className="p-4 align-top">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {order.paymentStatus === "paid" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <Check className="h-3 w-3" />
                              {t("Paid", "Zaplatené", "Fizetve")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="h-3 w-3" />
                              {t("Unpaid", "K úhrade", "Fizetésre vár")}
                            </span>
                          )}
                          {order.invoiceNumber && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-mono"
                              title={t("Invoice created", "Faktúra vystavená", "Számla kiállítva")}
                            >
                              <FileCheck className="h-3 w-3 text-emerald-600" />
                              {order.invoiceNumber}
                            </span>
                          )}
                        </div>
                        {order.paymentMethod && (
                          <div className="text-caption text-slate-500 mt-1 flex items-center gap-1">
                            <CreditCard className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-35">{order.paymentMethod}</span>
                          </div>
                        )}
                      </td>

                      {/* 6. Total gross */}
                      <td className="p-4 align-top text-right whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-900">
                          {money(order.totalGrossAmount)}
                        </div>
                        <div className="text-caption text-slate-400 font-sans mt-0.5">
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
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full type-overline border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 shadow-sm cursor-pointer transition-all hover:brightness-95"
                            style={{ borderLeftColor: statusColor, borderLeftWidth: "4px" }}
                          />
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full type-overline border border-slate-200 bg-white text-slate-800"
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
                            onClick={() => handleFulfillWarehouse(order)}
                            disabled={!canEdit}
                            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            title={t("Fulfill with warehouse delivery note", "Vyskladniť výdajkou zo skladu", "Kiadás raktárból")}
                          >
                            <Package className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCreateInvoice(order)}
                            disabled={!canEdit}
                            className={`p-2 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              order.invoiceNumber
                                ? "text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100 border border-emerald-200/70 shadow-xs"
                                : "text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
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
                            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer"
                            title={t("Edit order", "Upraviť objednávku", "Rendelés szerkesztése")}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>

                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteOrder(order)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
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
                      icon={<ShoppingCart className="h-10 w-10 text-slate-300" />}
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
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-ui font-semibold rounded-2xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
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
      </div>
    </div>
  );
};
