import React, { useState, useMemo } from "react";
import {
  ShoppingCart,
  Search,
  Plus,
  Filter,
  Package,
  FileText,
  UserCheck,
  User,
  Truck,
  ExternalLink,
  Copy,
  Check,
  Edit2,
  Trash2,
  Calendar,
  CreditCard,
  MapPin,
  Clock,
  ChevronDown,
  Building,
  Phone,
  Mail,
  AlertCircle,
  FileCheck,
  X,
  Layers,
  Wrench,
  Coins,
  ArrowRight
} from "lucide-react";
import type {
  Order,
  OrderItem,
  OrderItemType,
  OrderType,
  CustomerType,
  OrderPaymentStatus,
  Lead,
  WarehouseItem,
  Warehouse,
  WarehouseMovement,
  InvoiceOffer,
  InvoiceOfferItem,
  UserProfile,
  PermissionValue
} from "../types";
import type { Language } from "../utils/translations";
import { useOrderStatuses } from "../hooks/useOrderStatuses";
import {
  orderStatusLabel,
  orderStatusColor,
  calculateOrderItemTotals,
  calculateOrderTotals,
  generateOrderNumber,
  defaultOrderStatus,
  type OrderStatusDef,
} from "../utils/orders";

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
  systemCurrency: string;
  userLanguage: Language;
  currentUser?: UserProfile | null;
  getPermission: (key: string) => PermissionValue;
  onOpenClient?: (clientId: string) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  setOrders,
  leads,
  setLeads,
  warehouseItems = [],
  warehouses = [],
  setWarehouseMovements,
  invoicesOffers = [],
  setInvoicesOffers,
  systemCurrency,
  userLanguage,
  currentUser,
  getPermission,
  onOpenClient
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

  // Edit / Create Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

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
            company: order.billing?.name || order.guest?.company || order.guest?.name || t("New Client", "Nový klient", "Új ügyfél"),
            contactPerson: order.guest?.name || "",
            email: order.guest?.email || "",
            phone: order.guest?.phone || "",
            ico: order.billing?.ico || order.guest?.ico || "",
            dic: order.billing?.dic || order.guest?.dic || "",
            icDph: order.billing?.icDph || order.guest?.icDph || "",
            street: order.billing?.street || order.delivery?.street || "",
            city: order.billing?.city || order.delivery?.city || "",
            postalCode: order.billing?.zip || order.delivery?.zip || "",
            country: order.billing?.country || order.delivery?.country || "SK",
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
  const handleCreateInvoice = (order: Order) => {
    if (!canEdit || !setInvoicesOffers) return;
    if (!confirm(t(`Create invoice from order ${order.orderNumber}?`, `Vystaviť faktúru z objednávky ${order.orderNumber}?`, `Számla kiállítása a(z) ${order.orderNumber} rendelésből?`))) return;

    const invItems: InvoiceOfferItem[] = (order.items || []).map(i => ({
      id: `inv_item_${Date.now()}_${Math.random()}`,
      warehouseItemId: i.itemId || null,
      sku: i.sku || null,
      name: i.name + (i.variantTitle ? ` (${i.variantTitle})` : ""),
      quantity: i.quantity,
      unit: i.unit || "ks",
      unitPrice: i.unitPrice,
      vatRate: i.taxRate || 20,
      discountPct: i.discountPercent || 0,
      totalPrice: i.totalGrossAmount
    }));

    const clientName = order.customerType === "client"
      ? (leads.find(l => l.id === order.clientId)?.name || order.billing?.name || "")
      : (order.billing?.name || order.guest?.company || order.guest?.name || "");

    const newInvoice: InvoiceOffer = {
      id: `inv_${Date.now()}`,
      documentNumber: `FA-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      type: "invoice",
      mode: "default",
      status: order.paymentStatus === "paid" ? "invoiced" : "sent",
      leadId: order.clientId || undefined,
      clientName,
      clientIco: order.billing?.ico || order.guest?.ico || undefined,
      clientDic: order.billing?.dic || order.guest?.dic || undefined,
      clientIcDph: order.billing?.icDph || order.guest?.icDph || undefined,
      clientStreet: order.billing?.street || order.delivery?.street || undefined,
      clientCity: order.billing?.city || order.delivery?.city || undefined,
      clientZip: order.billing?.zip || order.delivery?.zip || undefined,
      clientCountry: order.billing?.country || order.delivery?.country || "SK",
      currency: order.currency || systemCurrency || "EUR",
      totalNet: order.totalNetAmount,
      totalTax: order.totalTaxAmount,
      totalGross: order.totalGrossAmount,
      issueDate: order.orderDate || new Date().toISOString().split("T")[0],
      dueDate: order.requestedDeliveryDate || new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      paymentMethod: order.paymentMethod === "Dobierka" ? "cod" : "bank_transfer",
      variableSymbol: order.paymentReference || order.orderNumber.replace(/[^0-9]/g, ""),
      items: invItems,
      createdAt: new Date().toISOString()
    };

    setInvoicesOffers(prev => [newInvoice, ...prev]);
    const toast = (window as unknown as { showToast?: (m: string) => void }).showToast;
    toast?.(t(`Invoice ${newInvoice.documentNumber} created!`, `Faktúra ${newInvoice.documentNumber} bola úspešne vytvorená!`, `A(z) ${newInvoice.documentNumber} számla elkészült!`));
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
    let newCount = 0;
    let processingCount = 0;

    orders.forEach(o => {
      totalRevenue += o.totalGrossAmount || 0;
      if (o.paymentStatus !== "paid") {
        unpaidAmount += o.totalGrossAmount || 0;
      }
      const st = orderStatuses.find(s => s.key === o.status);
      if (st?.group === "new") newCount++;
      if (st?.group === "processing") processingCount++;
    });

    return { totalRevenue, unpaidAmount, newCount, processingCount, totalCount: orders.length };
  }, [orders, orderStatuses]);

  // Open modal for create
  const handleOpenCreate = () => {
    const newOrd: Order = {
      id: `ord_${Date.now()}`,
      orderNumber: generateOrderNumber("OBJ", orders.length + 1),
      type: "sales",
      status: defaultOrderStatus(orderStatuses),
      customerType: "client",
      clientId: leads[0]?.id || null,
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
      paymentMethod: "Prevod na účet",
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
    setIsModalOpen(true);
  };

  // Open modal for edit
  const handleOpenEdit = (order: Order) => {
    setEditingOrder(JSON.parse(JSON.stringify(order)));
    setIsModalOpen(true);
  };

  // Save order from modal
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

    setIsModalOpen(false);
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

  return (
    <div className="space-y-6 text-left">
      {/* Top Banner / Metrics Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/90 shadow-glass flex items-center justify-between">
          <div>
            <div className="text-micro font-bold text-slate-400 uppercase tracking-wider">
              {t("Total Orders", "Všetky objednávky", "Összes rendelés")}
            </div>
            <div className="text-metric font-bold font-heading text-slate-900 mt-1">
              {stats.totalCount}
            </div>
          </div>
          <div className="h-11 w-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <ShoppingCart className="h-5 w-5" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/90 shadow-glass flex items-center justify-between">
          <div>
            <div className="text-micro font-bold text-slate-400 uppercase tracking-wider">
              {t("Awaiting Prep", "Nové & Pripravuje sa", "Új & Feldolgozás")}
            </div>
            <div className="text-metric font-bold font-heading text-sky-600 mt-1">
              {stats.newCount + stats.processingCount}
            </div>
          </div>
          <div className="h-11 w-11 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
            <Package className="h-5 w-5" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/90 shadow-glass flex items-center justify-between">
          <div>
            <div className="text-micro font-bold text-slate-400 uppercase tracking-wider">
              {t("Total Value", "Celkový obrat", "Összes forgalom")}
            </div>
            <div className="text-metric font-bold font-heading text-emerald-600 mt-1">
              {stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {systemCurrency}
            </div>
          </div>
          <div className="h-11 w-11 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Coins className="h-5 w-5" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/90 shadow-glass flex items-center justify-between">
          <div>
            <div className="text-micro font-bold text-slate-400 uppercase tracking-wider">
              {t("Unpaid Amount", "Nezaplatené", "Kifizetetlen")}
            </div>
            <div className="text-metric font-bold font-heading text-amber-600 mt-1">
              {stats.unpaidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {systemCurrency}
            </div>
          </div>
          <div className="h-11 w-11 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <CreditCard className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Main Control Toolbar */}
      <div className="glass-panel p-4 rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Status Lifecycle Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          {[
            { id: "all", label: t("All", "Všetky", "Mind") },
            { id: "new", label: t("New", "Nové", "Új") },
            { id: "processing", label: t("Processing", "Príprava", "Feldolgozás") },
            { id: "shipped", label: t("Shipped", "V preprave", "Úton") },
            { id: "delivered", label: t("Delivered", "Doručené", "Kézbesítve") },
            { id: "cancelled", label: t("Cancelled", "Storno", "Törölve") },
          ].map(tab => {
            const isActive = activeGroupFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveGroupFilter(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-ui font-semibold transition-all ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search & Actions */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          <div className="relative min-w-55 flex-1 sm:flex-initial">
            <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t("Search orders, customer, tracking...", "Hľadať objednávku, klienta, trasovanie...", "Keresés rendelésekben...")}
              className="w-full pl-9 pr-3.5 py-1.5 text-ui bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Customer filter */}
          <select
            value={customerTypeFilter}
            onChange={e => setCustomerTypeFilter(e.target.value)}
            className="px-2.5 py-1.5 text-ui bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
          >
            <option value="all">{t("All Customers", "Všetci zákazníci", "Minden vevő")}</option>
            <option value="client">{t("Registered Clients", "Iba klienti CRM", "Csak CRM ügyfelek")}</option>
            <option value="guest">{t("Guests Only", "Iba hostia (E-shop)", "Csak vendég vásárlók")}</option>
          </select>

          {/* Payment filter */}
          <select
            value={paymentStatusFilter}
            onChange={e => setPaymentStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-ui bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
          >
            <option value="all">{t("All Payments", "Všetky platby", "Minden fizetés")}</option>
            <option value="paid">{t("Paid", "Zaplatené", "Fizetve")}</option>
            <option value="unpaid">{t("Unpaid", "Nezaplatené", "Fizetésre vár")}</option>
          </select>

          {canEdit && (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-ui font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              {t("New Order", "Nová objednávka", "Új rendelés")}
            </button>
          )}
        </div>
      </div>

      {/* Orders List / Table */}
      {filteredOrders.length === 0 ? (
        <div className="glass-panel p-12 text-center rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-3">
          <div className="h-14 w-14 rounded-3xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <ShoppingCart className="h-7 w-7" />
          </div>
          <h4 className="text-title-sm font-bold font-heading text-slate-800">
            {t("No orders found", "Žiadne objednávky sa nenašli", "Nem található rendelés")}
          </h4>
          <p className="text-caption text-slate-500 max-w-sm mx-auto">
            {t("Create a new commercial or e-shop order to begin tracking fulfillment, deliveries and payments.", "Vytvorte novú obchodnú alebo e-shopovú objednávku pre sledovanie prípravy, dopravy a platieb.", "Hozzon létre egy új rendelést a szállítás és a fizetés nyomon követéséhez.")}
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-ui font-semibold"
            >
              <Plus className="h-4 w-4" />
              {t("Create first order", "Vytvoriť prvú objednávku", "Első rendelés létrehozása")}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map(order => {
            const statusColor = orderStatusColor(order.status, orderStatuses);
            const statusName = orderStatusLabel(order.status, t, orderStatuses);
            const clientMatch = order.clientId ? leads.find(l => l.id === order.clientId) : null;
            const customerDisplayName = order.customerType === "client"
              ? (clientMatch?.name || order.billing?.name || t("Registered Client", "Registrovaný klient", "Regisztrált ügyfél"))
              : (order.guest?.name || order.guest?.company || order.billing?.name || t("Guest Customer", "Hosť", "Vendég vásárló"));

            const productCount = (order.items || []).filter(i => i.itemType === "product").length;
            const serviceCount = (order.items || []).filter(i => i.itemType === "service").length;

            return (
              <div
                key={order.id}
                className="glass-panel p-4.5 rounded-2xl border border-white/60 bg-white/95 shadow-glass hover:shadow-md transition-all flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between"
              >
                {/* 1. Order Info & Customer */}
                <div className="flex items-start gap-3.5 min-w-65">
                  <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-600 font-mono text-micro font-bold border border-slate-200">
                    <ShoppingCart className="h-4.5 w-4.5 text-indigo-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-ui text-slate-900">
                        {order.orderNumber}
                      </span>
                      <span className="text-micro text-slate-400 font-mono">
                        {order.orderDate}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mt-0.5">
                      {order.customerType === "client" ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-micro font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <UserCheck className="h-3 w-3" />
                          {t("Client", "Klient", "Ügyfél")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-micro font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <User className="h-3 w-3" />
                          {t("Guest", "Hosť", "Vendég")}
                        </span>
                      )}

                      <span className="text-ui font-semibold text-slate-800 truncate max-w-45">
                        {customerDisplayName}
                      </span>

                      {order.customerType === "client" && order.clientId && onOpenClient && (
                        <button
                          type="button"
                          onClick={() => onOpenClient(order.clientId!)}
                          className="text-slate-400 hover:text-indigo-600 p-0.5 rounded transition-colors"
                          title={t("View client detail", "Zobraziť detail klienta", "Ügyfél megtekintése")}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {order.customerType === "guest" && canEdit && (
                        <button
                          type="button"
                          onClick={() => handleConvertGuest(order)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-micro font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors ml-1"
                          title={t("Convert guest to CRM client account", "Vytvoriť z hosťa klienta", "Vendégből ügyfél")}
                        >
                          <UserCheck className="h-3 w-3" />
                          {t("To client", "+ Do CRM", "+ Ügyfél")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Delivery & Address Block */}
                <div className="flex-1 min-w-50 text-caption space-y-0.5 text-slate-600">
                  <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                    <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">
                      {order.delivery?.city ? `${order.delivery.street || ""}, ${order.delivery.city}` : t("No address specified", "Bez dodacej adresy", "Nincs szállítási cím")}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-micro text-slate-500">
                    {order.shippingMethod && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                        <Truck className="h-3 w-3" />
                        {order.shippingMethod}
                      </span>
                    )}
                    {order.shippingTrackingNumber && (
                      <span className="inline-flex items-center gap-1 font-mono text-micro bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 border border-slate-200">
                        {order.shippingTrackingNumber}
                        <button
                          type="button"
                          onClick={() => handleCopyTracking(order.shippingTrackingNumber!, order.id)}
                          className="hover:text-indigo-600"
                          title={t("Copy tracking number", "Kopírovať číslo zásielky", "Szám másolása")}
                        >
                          {copiedTrackingId === order.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </span>
                    )}
                  </div>
                </div>

                {/* 3. Items & Financial Totals */}
                <div className="min-w-40 text-right">
                  <div className="text-ui font-bold font-heading text-slate-900">
                    {order.totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency || systemCurrency}
                  </div>
                  <div className="text-micro text-slate-400 mt-0.5 flex items-center justify-end gap-1.5">
                    <span>{productCount} {t("prod.", "prod.", "term.")}</span>
                    <span>•</span>
                    <span>{serviceCount} {t("serv.", "služ.", "szolg.")}</span>
                  </div>
                  <div className="mt-1">
                    {order.paymentStatus === "paid" ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-micro font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {t("Paid", "Zaplatené", "Fizetve")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-micro font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        {t("Unpaid", "Čaká na platbu", "Fizetésre vár")}
                      </span>
                    )}
                  </div>
                </div>

                {/* 4. Status Badge & Quick Change */}
                <div className="min-w-38 flex items-center gap-1.5">
                  <div className="relative w-full">
                    <select
                      value={order.status}
                      onChange={e => handleChangeStatus(order, e.target.value)}
                      disabled={!canEdit}
                      className="w-full text-ui font-semibold py-1 px-2.5 rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none cursor-pointer pr-7 appearance-none"
                      style={{ borderLeftColor: statusColor, borderLeftWidth: "4px" }}
                    >
                      {orderStatuses.map(s => (
                        <option key={s.key} value={s.key}>
                          {orderStatusLabel(s.key, t, orderStatuses)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* 5. Action Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleFulfillWarehouse(order)}
                    disabled={!canEdit}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
                    title={t("Fulfill with warehouse delivery note", "Vyskladniť výdajkou zo skladu", "Kiadás raktárból")}
                  >
                    <Package className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCreateInvoice(order)}
                    disabled={!canEdit}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-slate-100 transition-colors"
                    title={t("Issue invoice", "Vystaviť faktúru", "Számla kiállítása")}
                  >
                    <FileText className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(order)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                    title={t("Edit order", "Upraviť objednávku", "Rendelés szerkesztése")}
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeleteOrder(order)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title={t("Delete order", "Zmazať objednávku", "Rendelés törlése")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT ORDER MODAL */}
      {isModalOpen && editingOrder && (
        <OrderEditModal
          order={editingOrder}
          onSave={handleSaveOrder}
          onClose={() => {
            setIsModalOpen(false);
            setEditingOrder(null);
          }}
          leads={leads}
          warehouseItems={warehouseItems}
          warehouses={warehouses}
          orderStatuses={orderStatuses}
          systemCurrency={systemCurrency}
          userLanguage={userLanguage}
          canEdit={canEdit}
        />
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   ORDER CREATE / EDIT MODAL COMPONENT
───────────────────────────────────────────────────────────── */

interface OrderEditModalProps {
  order: Order;
  onSave: (order: Order) => void;
  onClose: () => void;
  leads: Lead[];
  warehouseItems: WarehouseItem[];
  warehouses: Warehouse[];
  orderStatuses: readonly OrderStatusDef[];
  systemCurrency: string;
  userLanguage: Language;
  canEdit: boolean;
}

const OrderEditModal: React.FC<OrderEditModalProps> = ({
  order,
  onSave,
  onClose,
  leads,
  warehouseItems,
  warehouses,
  orderStatuses,
  systemCurrency,
  userLanguage,
  canEdit,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  const [formData, setFormData] = useState<Order>(order);
  const [activeTab, setActiveTab] = useState<"items" | "delivery" | "billing" | "notes">("items");

  // Recalculate totals whenever items change
  const handleItemChange = (index: number, patch: Partial<OrderItem>) => {
    const nextItems = [...(formData.items || [])];
    const target = { ...nextItems[index], ...patch };
    const { totalNetAmount, totalGrossAmount } = calculateOrderItemTotals(target);
    nextItems[index] = { ...target, totalNetAmount, totalGrossAmount };
    const totals = calculateOrderTotals(nextItems);
    setFormData(prev => ({ ...prev, items: nextItems, ...totals }));
  };

  const handleAddItem = (type: OrderItemType = "product", preset?: Partial<OrderItem>) => {
    const newItem: OrderItem = {
      id: `item_${Date.now()}_${Math.random()}`,
      orderId: formData.id,
      itemType: type,
      name: preset?.name || (type === "product" ? t("New Product", "Nový produkt", "Új termék") : t("Service / Delivery", "Služba / Doprava", "Szolgáltatás")),
      quantity: preset?.quantity || 1,
      unit: preset?.unit || "ks",
      unitPrice: preset?.unitPrice || 0,
      discountPercent: 0,
      taxRate: 20,
      totalNetAmount: 0,
      totalGrossAmount: 0,
      fulfilledQuantity: 0,
      sortOrder: (formData.items || []).length,
      ...preset
    };
    const { totalNetAmount, totalGrossAmount } = calculateOrderItemTotals(newItem);
    newItem.totalNetAmount = totalNetAmount;
    newItem.totalGrossAmount = totalGrossAmount;

    const nextItems = [...(formData.items || []), newItem];
    const totals = calculateOrderTotals(nextItems);
    setFormData(prev => ({ ...prev, items: nextItems, ...totals }));
  };

  const handleRemoveItem = (index: number) => {
    const nextItems = (formData.items || []).filter((_, i) => i !== index);
    const totals = calculateOrderTotals(nextItems);
    setFormData(prev => ({ ...prev, items: nextItems, ...totals }));
  };

  // Quick add from warehouse
  const handleAddFromWarehouse = (whItemId: string) => {
    const wh = warehouseItems.find(w => w.id === whItemId);
    if (!wh) return;
    handleAddItem("product", {
      itemId: wh.id,
      sku: wh.sku,
      ean: wh.ean,
      name: wh.name,
      unit: wh.unit || "ks",
      unitPrice: wh.salePrice || 0,
      taxRate: wh.vatRate || 20
    });
  };

  // Sync client profile to delivery & billing addresses
  const handleSelectClient = (clientId: string) => {
    const client = leads.find(l => l.id === clientId);
    if (!client) {
      setFormData(prev => ({ ...prev, clientId: null }));
      return;
    }
    setFormData(prev => ({
      ...prev,
      clientId,
      delivery: {
        ...prev.delivery,
        recipient: client.contactPerson || client.name,
        street: client.street || prev.delivery?.street,
        city: client.city || prev.delivery?.city,
        zip: client.postalCode || prev.delivery?.zip,
        country: client.country || prev.delivery?.country || "SK",
        phone: client.phone || prev.delivery?.phone
      },
      billing: {
        ...prev.billing,
        name: client.company || client.name,
        street: client.street || prev.billing?.street,
        city: client.city || prev.billing?.city,
        zip: client.postalCode || prev.billing?.zip,
        country: client.country || prev.billing?.country || "SK",
        ico: client.ico || prev.billing?.ico,
        dic: client.dic || prev.billing?.dic,
        icDph: client.icDph || prev.billing?.icDph
      }
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-left animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-title-sm font-bold font-heading text-slate-900 flex items-center gap-2">
                <span>{formData.orderNumber || t("Order", "Objednávka", "Rendelés")}</span>
                <span className="text-caption font-normal text-slate-400">
                  ({formData.customerType === "client" ? t("CRM Client", "Klient", "Ügyfél") : t("Guest Order", "Hosť", "Vendég")})
                </span>
              </h3>
              <p className="text-micro text-slate-500">
                {t("Configure customer attachment, shipping addresses, products & services", "Nastavte priradenie zákazníka, adresu doručenia, tovar a doplnkové služby", "Ügyfél, szállítás és tételek beállítása")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Top Control Bar: Customer Mode & Status */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          {/* Customer type toggle */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/60">
            <button
              type="button"
              onClick={() => setFormData(p => ({ ...p, customerType: "client" }))}
              className={`px-3 py-1 text-ui font-semibold rounded-lg transition-all ${
                formData.customerType === "client"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t("CRM Client", "Registrovaný klient", "CRM Ügyfél")}
            </button>
            <button
              type="button"
              onClick={() => setFormData(p => ({ ...p, customerType: "guest" }))}
              className={`px-3 py-1 text-ui font-semibold rounded-lg transition-all ${
                formData.customerType === "guest"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t("Guest / E-Shop", "Nákup bez registrácie (Hosť)", "Vendég")}
            </button>
          </div>

          {/* Status & Date */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-micro font-bold text-slate-500 uppercase">{t("Status", "Stav", "Állapot")}:</span>
              <select
                value={formData.status}
                onChange={e => setFormData(p => ({ ...p, status: e.target.value }))}
                className="text-ui font-semibold py-1 px-2.5 rounded-xl border border-slate-200 bg-white"
              >
                {orderStatuses.map(s => (
                  <option key={s.key} value={s.key}>
                    {orderStatusLabel(s.key, t, orderStatuses)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-micro font-bold text-slate-500 uppercase">{t("Date", "Dátum", "Dátum")}:</span>
              <input
                type="date"
                value={formData.orderDate}
                onChange={e => setFormData(p => ({ ...p, orderDate: e.target.value }))}
                className="text-ui py-1 px-2 border border-slate-200 rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-100 flex items-center gap-4 bg-slate-50/40">
          {[
            { id: "items", label: t("Line Items", "Položky & Služby", "Tételek & Szolgáltatások"), count: (formData.items || []).length },
            { id: "delivery", label: t("Delivery & Shipping", "Dodacia adresa & Doprava", "Szállítás & Cím") },
            { id: "billing", label: t("Billing & Payment", "Fakturácia & Platba", "Számlázás & Fizetés") },
            { id: "notes", label: t("Notes", "Poznámky", "Megjegyzések") },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 text-ui font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className="px-1.5 py-0.2 rounded-full text-micro bg-slate-200 text-slate-700">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: LINE ITEMS */}
          {activeTab === "items" && (
            <div className="space-y-6">
              {/* Quick Add Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
                <div className="flex items-center gap-2">
                  <span className="text-caption font-bold text-slate-700">{t("Add from warehouse:", "Pridať zo skladu:", "Raktárból:")}</span>
                  <select
                    onChange={e => {
                      if (e.target.value) {
                        handleAddFromWarehouse(e.target.value);
                        e.target.value = "";
                      }
                    }}
                    className="text-ui py-1.5 px-3 bg-white border border-slate-200 rounded-xl"
                  >
                    <option value="">{t("-- Select warehouse product --", "-- Vybrať produkt zo skladu --", "-- Termék kiválasztása --")}</option>
                    {warehouseItems.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.sku || "no-sku"}) - {item.salePrice || 0} {systemCurrency}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddItem("product")}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-ui font-semibold border border-indigo-200 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("Custom Product", "+ Vlastný tovar", "+ Termék")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddItem("service", { name: t("Shipping Courier", "Doprava kuriér", "Futár szállítás"), unitPrice: 3.90, taxRate: 20 })}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-xl text-ui font-semibold border border-sky-200 transition-colors"
                  >
                    <Truck className="h-3.5 w-3.5" />
                    {t("+ Shipping", "+ Doprava", "+ Szállítás")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddItem("service", { name: t("Cash on delivery (COD)", "Dobierka", "Utánvét"), unitPrice: 1.50, taxRate: 20 })}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-ui font-semibold border border-amber-200 transition-colors"
                  >
                    <Coins className="h-3.5 w-3.5" />
                    {t("+ COD", "+ Dobierka", "+ Utánvét")}
                  </button>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-inner">
                <table className="w-full text-left text-ui border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 select-none">
                      <th className="py-2.5 px-3 w-10">#</th>
                      <th className="py-2.5 px-3">{t("Item name", "Názov položky", "Tétel")}</th>
                      <th className="py-2.5 px-3 w-24">{t("Type", "Typ", "Típus")}</th>
                      <th className="py-2.5 px-3 w-20 text-right">{t("Qty", "Množstvo", "Menny.")}</th>
                      <th className="py-2.5 px-3 w-16">{t("Unit", "Jedn.", "M.egys.")}</th>
                      <th className="py-2.5 px-3 w-24 text-right">{t("Price (net)", "Cena bez DPH", "Ár")}</th>
                      <th className="py-2.5 px-3 w-16 text-right">{t("VAT %", "DPH %", "ÁFA %")}</th>
                      <th className="py-2.5 px-3 w-28 text-right">{t("Total gross", "Spolu s DPH", "Bruttó")}</th>
                      <th className="py-2.5 px-3 w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(formData.items || []).length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">
                          {t("No items in order. Use the buttons above to add products or services.", "Objednávka nemá žiadne položky. Použite tlačidlá vyššie.", "Nincsenek tételek a rendelésben.")}
                        </td>
                      </tr>
                    ) : (
                      (formData.items || []).map((item, idx) => (
                        <tr key={item.id || idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-mono text-slate-400">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={item.name}
                              onChange={e => handleItemChange(idx, { name: e.target.value })}
                              placeholder={t("Product or service title...", "Názov...", "Megnevezés...")}
                              className="w-full px-2 py-1 border border-slate-200 rounded-lg text-ui"
                            />
                            {item.variantTitle && (
                              <span className="text-micro text-slate-400 ml-1">({item.variantTitle})</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <select
                              value={item.itemType}
                              onChange={e => handleItemChange(idx, { itemType: e.target.value as OrderItemType })}
                              className="w-full px-1.5 py-1 border border-slate-200 rounded-lg text-caption"
                            >
                              <option value="product">{t("Product", "Tovar", "Termék")}</option>
                              <option value="service">{t("Service", "Služba", "Szolgáltatás")}</option>
                            </select>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min="0.01"
                              step="any"
                              value={item.quantity}
                              onChange={e => handleItemChange(idx, { quantity: parseFloat(e.target.value) || 0 })}
                              className="w-full text-right px-2 py-1 border border-slate-200 rounded-lg text-ui font-mono"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={item.unit}
                              onChange={e => handleItemChange(idx, { unit: e.target.value })}
                              className="w-full px-2 py-1 border border-slate-200 rounded-lg text-ui text-center"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={e => handleItemChange(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                              className="w-full text-right px-2 py-1 border border-slate-200 rounded-lg text-ui font-mono"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={item.taxRate}
                              onChange={e => handleItemChange(idx, { taxRate: parseFloat(e.target.value) || 0 })}
                              className="w-full text-right px-2 py-1 border border-slate-200 rounded-lg text-ui font-mono"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                            {item.totalGrossAmount.toFixed(2)} {formData.currency}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            >
                              <Trash2 className="h-4 w-4 mx-auto" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Financial Totals Breakdown Card */}
              <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-6 text-caption text-slate-600">
                  <div>
                    <span className="text-slate-400 block text-micro uppercase">{t("Goods Net", "Tovar bez DPH", "Termékek nettó")}:</span>
                    <span className="font-mono font-semibold">{formData.itemsNetAmount.toFixed(2)} {formData.currency}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-micro uppercase">{t("Services Net", "Služby bez DPH", "Szolgáltatások nettó")}:</span>
                    <span className="font-mono font-semibold">{formData.servicesNetAmount.toFixed(2)} {formData.currency}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-micro uppercase">{t("Total VAT", "DPH celkom", "ÁFA összesen")}:</span>
                    <span className="font-mono font-semibold">{formData.totalTaxAmount.toFixed(2)} {formData.currency}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-micro font-bold text-slate-400 uppercase tracking-wider">
                    {t("Total Amount to Pay", "K úhrade spolu", "Fizetendő összeg")}
                  </div>
                  <div className="text-title font-bold font-mono text-indigo-600">
                    {formData.totalGrossAmount.toFixed(2)} {formData.currency}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DELIVERY & SHIPPING */}
          {activeTab === "delivery" && (
            <div className="space-y-6">
              {/* Customer Selector for Client Mode */}
              {formData.customerType === "client" ? (
                <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100 space-y-2">
                  <label className="text-caption font-bold text-slate-700 block">
                    {t("Select Registered CRM Client:", "Vybrať registrovaného klienta z CRM:", "CRM Ügyfél kiválasztása:")}
                  </label>
                  <select
                    value={formData.clientId || ""}
                    onChange={e => handleSelectClient(e.target.value)}
                    className="w-full text-ui py-2 px-3 bg-white border border-slate-200 rounded-xl"
                  >
                    <option value="">{t("-- Select client --", "-- Vybrať klienta --", "-- Válasszon ügyfelet --")}</option>
                    {leads.map(lead => (
                      <option key={lead.id} value={lead.id}>
                        {lead.name} {lead.company ? `(${lead.company})` : ""} - {lead.city || ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                /* Guest Customer Details */
                <div className="p-4 bg-amber-50/40 rounded-2xl border border-amber-100 space-y-3">
                  <h4 className="text-caption font-bold text-amber-900 uppercase tracking-wider">
                    {t("Guest Customer Details (No Registration)", "Údaje hosťa (Nákup bez registrácie)", "Vendég adatai")}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-ui">
                    <div>
                      <label className="text-micro font-bold text-slate-500 block mb-1">{t("Name & Surname", "Meno a priezvisko", "Név")}</label>
                      <input
                        type="text"
                        value={formData.guest?.name || ""}
                        onChange={e => setFormData(p => ({ ...p, guest: { ...p.guest, name: e.target.value } }))}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-micro font-bold text-slate-500 block mb-1">{t("Email", "E-mail", "E-mail")}</label>
                      <input
                        type="email"
                        value={formData.guest?.email || ""}
                        onChange={e => setFormData(p => ({ ...p, guest: { ...p.guest, email: e.target.value } }))}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-micro font-bold text-slate-500 block mb-1">{t("Phone", "Telefón", "Telefonszám")}</label>
                      <input
                        type="tel"
                        value={formData.guest?.phone || ""}
                        onChange={e => setFormData(p => ({ ...p, guest: { ...p.guest, phone: e.target.value } }))}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Delivery Address Form */}
              <div className="space-y-4">
                <h4 className="text-caption font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <MapPin className="h-4 w-4 text-indigo-500" />
                  {t("Shipping & Delivery Address", "Dodacia adresa pre kuriéra", "Szállítási cím")}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-ui">
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("Recipient / Contact person", "Meno príjemcu / Kontakt", "Címzett")}</label>
                    <input
                      type="text"
                      value={formData.delivery?.recipient || ""}
                      onChange={e => setFormData(p => ({ ...p, delivery: { ...p.delivery, recipient: e.target.value } }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("Street & Number", "Ulica a číslo", "Utca, házszám")}</label>
                    <input
                      type="text"
                      value={formData.delivery?.street || ""}
                      onChange={e => setFormData(p => ({ ...p, delivery: { ...p.delivery, street: e.target.value } }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("City", "Mesto", "Város")}</label>
                    <input
                      type="text"
                      value={formData.delivery?.city || ""}
                      onChange={e => setFormData(p => ({ ...p, delivery: { ...p.delivery, city: e.target.value } }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("Postal Code / ZIP", "PSČ", "Irányítószám")}</label>
                    <input
                      type="text"
                      value={formData.delivery?.zip || ""}
                      onChange={e => setFormData(p => ({ ...p, delivery: { ...p.delivery, zip: e.target.value } }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("Country", "Krajina", "Ország")}</label>
                    <input
                      type="text"
                      value={formData.delivery?.country || "SK"}
                      onChange={e => setFormData(p => ({ ...p, delivery: { ...p.delivery, country: e.target.value } }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("Delivery Phone", "Telefón pre kuriéra", "Telefonszám a futárnak")}</label>
                    <input
                      type="tel"
                      value={formData.delivery?.phone || ""}
                      onChange={e => setFormData(p => ({ ...p, delivery: { ...p.delivery, phone: e.target.value } }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                {/* Shipping Method & Tracking */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-ui pt-2">
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("Shipping Carrier / Method", "Spôsob dopravy", "Szállítási mód")}</label>
                    <input
                      type="text"
                      placeholder="e.g. DPD Kuriér / Packeta"
                      value={formData.shippingMethod || ""}
                      onChange={e => setFormData(p => ({ ...p, shippingMethod: e.target.value }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("Tracking Number", "Číslo zásielky / Trasovanie", "Csomagszám")}</label>
                    <input
                      type="text"
                      value={formData.shippingTrackingNumber || ""}
                      onChange={e => setFormData(p => ({ ...p, shippingTrackingNumber: e.target.value }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("Pickup Point ID / Z-Box", "Kód odberného miesta / Z-Box", "Csomagpont ID")}</label>
                    <input
                      type="text"
                      value={formData.shippingPickupPointId || ""}
                      onChange={e => setFormData(p => ({ ...p, shippingPickupPointId: e.target.value }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BILLING & PAYMENT */}
          {activeTab === "billing" && (
            <div className="space-y-6">
              <div className="space-y-4">
                <h4 className="text-caption font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <CreditCard className="h-4 w-4 text-emerald-500" />
                  {t("Payment Configuration", "Platobné informácie", "Fizetési adatok")}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-ui">
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("Payment Method", "Spôsob platby", "Fizetési mód")}</label>
                    <select
                      value={formData.paymentMethod || "Prevod na účet"}
                      onChange={e => setFormData(p => ({ ...p, paymentMethod: e.target.value }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white"
                    >
                      <option value="Prevod na účet">{t("Bank Transfer", "Prevod na účet", "Banki átutalás")}</option>
                      <option value="Dobierka">{t("Cash on Delivery (COD)", "Dobierka", "Utánvét")}</option>
                      <option value="Platobná karta">{t("Credit / Debit Card", "Platobná karta online", "Bankkártya")}</option>
                      <option value="Hotovosť">{t("Cash", "Hotovosť", "Készpénz")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("Payment Status", "Stav úhrady", "Fizetési állapot")}</label>
                    <select
                      value={formData.paymentStatus}
                      onChange={e => setFormData(p => ({ ...p, paymentStatus: e.target.value as OrderPaymentStatus }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white font-semibold"
                    >
                      <option value="unpaid">{t("Unpaid", "Nezaplatené (Čaká na úhradu)", "Kifizetetlen")}</option>
                      <option value="paid">{t("Paid", "Zaplatené", "Fizetve")}</option>
                      <option value="partially_paid">{t("Partially Paid", "Čiastočne uhradené", "Részben fizetve")}</option>
                      <option value="refunded">{t("Refunded", "Vrátená platba", "Visszatérítve")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("Variable Symbol / Payment Ref", "Variabilný symbol", "Közlemény / VS")}</label>
                    <input
                      type="text"
                      value={formData.paymentReference || ""}
                      onChange={e => setFormData(p => ({ ...p, paymentReference: e.target.value }))}
                      placeholder={formData.orderNumber.replace(/[^0-9]/g, "")}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Billing Address */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="text-caption font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Building className="h-4 w-4 text-indigo-500" />
                    {t("Billing Address", "Fakturačné údaje", "Számlázási cím")}
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(p => ({
                        ...p,
                        billing: {
                          ...p.billing,
                          name: p.delivery?.recipient || p.guest?.name || "",
                          street: p.delivery?.street,
                          city: p.delivery?.city,
                          zip: p.delivery?.zip,
                          country: p.delivery?.country || "SK"
                        }
                      }));
                    }}
                    className="text-micro font-bold text-indigo-600 hover:text-indigo-700"
                  >
                    {t("Copy from delivery address", "Kopírovať z dodacej adresy", "Másolás a szállítási címből")}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-ui">
                  <div className="sm:col-span-2">
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("Company / Full Name", "Názov firmy / Celé meno", "Cégnév / Név")}</label>
                    <input
                      type="text"
                      value={formData.billing?.name || ""}
                      onChange={e => setFormData(p => ({ ...p, billing: { ...p.billing, name: e.target.value } }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("IČO", "IČO", "Cégjegyzékszám")}</label>
                    <input
                      type="text"
                      value={formData.billing?.ico || ""}
                      onChange={e => setFormData(p => ({ ...p, billing: { ...p.billing, ico: e.target.value } }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("DIČ", "DIČ", "Adószám")}</label>
                    <input
                      type="text"
                      value={formData.billing?.dic || ""}
                      onChange={e => setFormData(p => ({ ...p, billing: { ...p.billing, dic: e.target.value } }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("IČ DPH", "IČ DPH", "Közösségi adószám")}</label>
                    <input
                      type="text"
                      value={formData.billing?.icDph || ""}
                      onChange={e => setFormData(p => ({ ...p, billing: { ...p.billing, icDph: e.target.value } }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("Street & Number", "Ulica a číslo", "Utca, házszám")}</label>
                    <input
                      type="text"
                      value={formData.billing?.street || ""}
                      onChange={e => setFormData(p => ({ ...p, billing: { ...p.billing, street: e.target.value } }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("City", "Mesto", "Város")}</label>
                    <input
                      type="text"
                      value={formData.billing?.city || ""}
                      onChange={e => setFormData(p => ({ ...p, billing: { ...p.billing, city: e.target.value } }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-micro font-bold text-slate-500 block mb-1">{t("Postal Code / ZIP", "PSČ", "Irányítószám")}</label>
                    <input
                      type="text"
                      value={formData.billing?.zip || ""}
                      onChange={e => setFormData(p => ({ ...p, billing: { ...p.billing, zip: e.target.value } }))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: NOTES */}
          {activeTab === "notes" && (
            <div className="space-y-4 text-ui">
              <div>
                <label className="text-micro font-bold text-slate-500 block mb-1">
                  {t("Customer Note (from e-shop checkout):", "Poznámka od zákazníka (z e-shopu):", "Vevő megjegyzése:")}
                </label>
                <textarea
                  rows={3}
                  value={formData.customerNote || ""}
                  onChange={e => setFormData(p => ({ ...p, customerNote: e.target.value }))}
                  placeholder={t("Customer's delivery requests, door code, special preferences...", "Poznámka k doručeniu, poschodie, kód zvončeka...", "Vevői kérések...")}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="text-micro font-bold text-slate-500 block mb-1">
                  {t("Internal CRM Notes:", "Interná poznámka tímu:", "Belső megjegyzés:")}
                </label>
                <textarea
                  rows={4}
                  value={formData.notes || ""}
                  onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                  placeholder={t("Private team instructions, warehouse notes, packing status...", "Interné inštrukcie pre sklad, balenie, dohody s klientom...", "Belső utasítások...")}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-caption text-slate-500 font-mono">
            {formData.orderNumber} • {formData.items?.length || 0} {t("items", "položiek", "tétel")}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-ui font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              {t("Cancel", "Zrušiť", "Mégse")}
            </button>
            <button
              type="button"
              onClick={() => onSave(formData)}
              disabled={!canEdit}
              className="px-5 py-2 text-ui font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition-colors"
            >
              {t("Save Order", "Uložiť objednávku", "Rendelés mentése")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
