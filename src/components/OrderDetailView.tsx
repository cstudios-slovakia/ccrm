import React, { useState, useMemo, useRef, useEffect } from "react";
import { SectionIcon } from "./icons/SectionIcon";
import { SECTION_VISUALS } from "../utils/sectionVisuals";
import { appliedPriceLevel, clientPriceLevelId, matchesItemQuery, packHint, resolveItemVatRate, resolveSellPrice, type PriceLevel } from "../utils/priceLevels";
import {
  Search,
  Plus,
  FileText,
  UserCheck,
  User,
  Truck,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  Calendar,
  CreditCard,
  MapPin,
  Clock,
  ChevronDown,
  Building2,
  Phone,
  Mail,
  AlertCircle,
  X,
  Coins,
  PackageCheck,
  Save,
  ShoppingBag,
  RotateCcw,
  FileCheck
} from "lucide-react";
import type {
  Order,
  OrderItem,
  OrderItemType,
  OrderPaymentStatus,
  Lead,
  WarehouseItem,
  Warehouse,
  CompanyBillingSettings
} from "../types";
import type { Language } from "../utils/translations";
import { EntityHeader } from "./layout";
import { CustomSelect } from "./ui/CustomSelect";
import {
  orderStatusLabel,
  orderStatusColor,
  calculateOrderItemTotals,
  calculateOrderTotals,
  formatCarrierTrackingUrl,
  type OrderStatusDef
} from "../utils/orders";
import { getAvailableVatRates, getDefaultVatRate } from "../utils/vat";
import { getAvailableShippingMethods } from "../utils/shipping";
import { getAvailablePaymentMethods, getDefaultPaymentMethod } from "../utils/payment";
import { formatDateLocalized } from "../utils/localTime";
import { isClientRecord } from "../utils/clientRecord";

export interface OrderDetailViewProps {
  order: Order;
  onSave: (order: Order) => Promise<void> | void;
  onClose: () => void;
  onDelete?: (order: Order) => Promise<void> | void;
  onConvertGuest?: (order: Order) => Promise<void> | void;
  onFulfillWarehouse?: (order: Order) => void;
  onCreateInvoice?: (order: Order) => void;
  leads: Lead[];
  setLeads?: React.Dispatch<React.SetStateAction<Lead[]>>;
  warehouseItems?: WarehouseItem[];
  warehouses?: Warehouse[];
  orderStatuses: readonly OrderStatusDef[];
  systemCurrency: string;
  userLanguage: Language;
  canEdit: boolean;
  canDelete?: boolean;
  onOpenClient?: (clientId: string) => void;
  companyBillingSettings?: CompanyBillingSettings | null;
  /** The configured price levels: a product is priced on the customer's level. */
  priceLevels?: PriceLevel[];
  backLabel?: string;
}

export const OrderDetailView: React.FC<OrderDetailViewProps> = ({
  order,
  onSave,
  onClose,
  onDelete,
  onConvertGuest,
  onFulfillWarehouse,
  onCreateInvoice,
  leads,
  warehouseItems = [],
  warehouses = [],
  orderStatuses,
  systemCurrency,
  userLanguage,
  canEdit,
  canDelete,
  onOpenClient,
  companyBillingSettings,
  priceLevels = [],
  backLabel
}) => {
  const t = (en: string, sk: string, hu: string) =>
    userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  const availableVatRates = useMemo(
    () => getAvailableVatRates(companyBillingSettings),
    [companyBillingSettings]
  );
  const defaultVatRate = useMemo(
    () => getDefaultVatRate(companyBillingSettings),
    [companyBillingSettings]
  );
  const availableShippingMethods = useMemo(
    () => getAvailableShippingMethods(companyBillingSettings),
    [companyBillingSettings]
  );
  const availablePaymentMethods = useMemo(
    () => getAvailablePaymentMethods(companyBillingSettings),
    [companyBillingSettings]
  );
  const defaultPaymentMethod = useMemo(
    () => getDefaultPaymentMethod(companyBillingSettings),
    [companyBillingSettings]
  );

  const isNew = !order.createdAt && !order.updatedAt;
  const [formData, setFormData] = useState<Order>(() => {
    const copy = JSON.parse(JSON.stringify(order));
    if (!copy.createdAt && !copy.updatedAt && !copy.paymentMethod) {
      copy.paymentMethod = getDefaultPaymentMethod(companyBillingSettings);
    }
    return copy;
  });

  // Keep formData in sync when order invoice details change
  useEffect(() => {
    if (
      order.invoiceNumber !== formData.invoiceNumber ||
      order.invoiceId !== formData.invoiceId ||
      order.invoiceIssuedAt !== formData.invoiceIssuedAt
    ) {
      setFormData(prev => ({
        ...prev,
        invoiceId: order.invoiceId,
        invoiceNumber: order.invoiceNumber,
        invoiceIssuedAt: order.invoiceIssuedAt
      }));
    }
  }, [order.invoiceNumber, order.invoiceId, order.invoiceIssuedAt]);

  const displayedShippingMethods = useMemo(() => {
    const current = formData.shippingMethod?.trim();
    if (current && !availableShippingMethods.includes(current)) {
      return [current, ...availableShippingMethods];
    }
    return availableShippingMethods;
  }, [formData.shippingMethod, availableShippingMethods]);

  const displayedPaymentMethods = useMemo(() => {
    const current = formData.paymentMethod?.trim();
    if (current && !availablePaymentMethods.includes(current)) {
      return [current, ...availablePaymentMethods];
    }
    return availablePaymentMethods;
  }, [formData.paymentMethod, availablePaymentMethods]);

  const paymentMethodLabel = (method: string) => {
    if (method === "Prevod na účet") return t("Bank Wire Transfer", "Prevod na účet", "Banki átutalás");
    if (method === "Dobierka") return t("Cash on Delivery (COD)", "Dobierka", "Utánvét");
    if (method === "Platobná karta") return t("Credit / Debit Card", "Platobná karta", "Bankkártya");
    if (method === "Hotovosť") return t("Cash", "Hotovosť", "Készpénz");
    return method;
  };

  const [isSaving, setIsSaving] = useState(false);
  const [copiedTracking, setCopiedTracking] = useState(false);

  // Search & Selector states
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [isClientSearchOpen, setIsClientSearchOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // Item search dropdown state
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [isItemSearchOpen, setIsItemSearchOpen] = useState(false);
  const itemDropdownRef = useRef<HTMLDivElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setIsClientSearchOpen(false);
      }
      if (itemDropdownRef.current && !itemDropdownRef.current.contains(e.target as Node)) {
        setIsItemSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const money = (val: number = 0) =>
    val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " " +
    (formData.currency || systemCurrency || "EUR");

  const getInitials = (name?: string | null): string => {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Matched selected client from CRM database
  const selectedClient = useMemo(() => {
    if (formData.customerType !== "client" || !formData.clientId) return null;
    return leads.find(l => l.id === formData.clientId) || null;
  }, [formData.customerType, formData.clientId, leads]);

  // `leads` holds clients and pipeline leads alike; an order may be attached to either.
  // A lead has no client profile yet, so it must not be presented as a synced client.
  const selectedIsLead = !!selectedClient && !isClientRecord(selectedClient);

  // The price level the selected client buys on (their own, else their client record's).
  const customerPriceLevelId = useMemo(() => clientPriceLevelId(selectedClient, leads), [selectedClient, leads]);

  // Filtered clients list
  const filteredClients = useMemo(() => {
    if (!clientSearchQuery.trim()) return leads.slice(0, 8);
    const q = clientSearchQuery.toLowerCase();
    return leads
      .filter(l =>
        l.name.toLowerCase().includes(q) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.companyId && l.companyId.includes(q)) ||
        (l.city && l.city.toLowerCase().includes(q))
      )
      .slice(0, 15);
  }, [leads, clientSearchQuery]);

  // Predefined service presets for e-shop orders
  const predefinedServices = useMemo(() => [
    {
      name: t("Courier Shipping (DPD)", "Kuriérska doprava DPD", "Futárszolgálat DPD"),
      unitPrice: 3.90,
      serviceCode: "SHIPPING_DPD",
      category: t("Shipping", "Doprava", "Szállítás")
    },
    {
      name: t("Packeta Pickup Point", "Zásielkovňa / Packeta", "Packeta csomagpont"),
      unitPrice: 2.90,
      serviceCode: "SHIPPING_PACKETA",
      category: t("Shipping", "Doprava", "Szállítás")
    },
    {
      name: t("GLS Express Delivery", "GLS Expresné doručenie", "GLS expressz kézbesítés"),
      unitPrice: 4.50,
      serviceCode: "SHIPPING_GLS",
      category: t("Shipping", "Doprava", "Szállítás")
    },
    {
      name: t("Cash on Delivery (COD) Fee", "Platba na dobierku", "Utánvét díj"),
      unitPrice: 1.20,
      serviceCode: "PAYMENT_COD",
      category: t("Payment", "Platba", "Fizetés")
    },
    {
      name: t("Assembly & Installation", "Montáž a inštalácia", "Összeszerelés és telepítés"),
      unitPrice: 45.00,
      serviceCode: "SERVICE_ASSEMBLY",
      category: t("Service", "Služba", "Szolgáltatás")
    },
    {
      name: t("Protective Packaging", "Ochranné balné", "Biztonsági csomagolás"),
      unitPrice: 1.50,
      serviceCode: "SERVICE_PACKAGING",
      category: t("Packaging", "Balenie", "Csomagolás")
    }
  ], [userLanguage]);

  // Filtered items (products + services) for search dropdown
  const filteredSearchItems = useMemo(() => {
    const q = itemSearchQuery.trim().toLowerCase();
    
    // Filter physical warehouse products
    const matchedProducts = warehouseItems.filter(w => {
      if (!q) return true;
      // name, SKU, barcode, alternative codes and the external id, then the category
      return matchesItemQuery(w, q) || (w.category && w.category.toLowerCase().includes(q));
    }).slice(0, 15);

    // Filter services
    const matchedServices = predefinedServices.filter(s => {
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        (s.serviceCode && s.serviceCode.toLowerCase().includes(q))
      );
    });

    return { products: matchedProducts, services: matchedServices };
  }, [warehouseItems, predefinedServices, itemSearchQuery]);

  // Synchronize client details to delivery and billing addresses
  const handleSelectClient = (client: Lead) => {
    setFormData(prev => ({
      ...prev,
      clientId: client.id,
      delivery: {
        ...prev.delivery,
        recipient: client.contactPerson || client.name,
        street: client.address?.street || prev.delivery?.street,
        city: client.city || client.address?.city || prev.delivery?.city,
        zip: client.address?.postalCode || prev.delivery?.zip,
        country: client.address?.country || prev.delivery?.country || "SK",
        phone: client.phone || prev.delivery?.phone
      },
      billing: {
        ...prev.billing,
        name: client.name,
        street: client.address?.street || prev.billing?.street,
        city: client.city || client.address?.city || prev.billing?.city,
        zip: client.address?.postalCode || prev.billing?.zip,
        country: client.address?.country || prev.billing?.country || "SK",
        ico: client.companyId || prev.billing?.ico,
        dic: client.taxId || prev.billing?.dic,
        icDph: client.vatId || prev.billing?.icDph
      }
    }));
    setIsClientSearchOpen(false);
    setClientSearchQuery("");
  };

  // Detach / unselect client
  const handleClearClient = () => {
    setFormData(prev => ({
      ...prev,
      clientId: null
    }));
    setClientSearchQuery("");
    setIsClientSearchOpen(false);
  };

  // Item operations
  const handleAddItem = (type: OrderItemType = "product", preset?: Partial<OrderItem>) => {
    const newItem: OrderItem = {
      id: `item_${Date.now()}_${Math.random()}`,
      orderId: formData.id,
      itemType: type,
      name: preset?.name || (type === "product" ? t("New Product", "Nový tovar", "Új termék") : t("Service / Delivery", "Služba / Doprava", "Szolgáltatás")),
      quantity: preset?.quantity || 1,
      unit: preset?.unit || "ks",
      unitPrice: preset?.unitPrice !== undefined ? preset.unitPrice : 0,
      discountPercent: preset?.discountPercent || 0,
      taxRate: preset?.taxRate !== undefined ? preset.taxRate : defaultVatRate,
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

    setIsItemSearchOpen(false);
    setItemSearchQuery("");
  };

  const handleItemChange = (index: number, patch: Partial<OrderItem>) => {
    const nextItems = [...(formData.items || [])];
    const target = { ...nextItems[index], ...patch };
    const { totalNetAmount, totalGrossAmount } = calculateOrderItemTotals(target);
    nextItems[index] = { ...target, totalNetAmount, totalGrossAmount };
    const totals = calculateOrderTotals(nextItems);
    setFormData(prev => ({ ...prev, items: nextItems, ...totals }));
  };

  const handleRemoveItem = (index: number) => {
    const nextItems = (formData.items || []).filter((_, i) => i !== index);
    const totals = calculateOrderTotals(nextItems);
    setFormData(prev => ({ ...prev, items: nextItems, ...totals }));
  };

  // Address copy helpers
  const handleCopyBillingToDelivery = () => {
    setFormData(prev => ({
      ...prev,
      delivery: {
        recipient: prev.billing?.name || prev.delivery?.recipient,
        street: prev.billing?.street || prev.delivery?.street,
        city: prev.billing?.city || prev.delivery?.city,
        zip: prev.billing?.zip || prev.delivery?.zip,
        country: prev.billing?.country || prev.delivery?.country || "SK",
        phone: prev.delivery?.phone || ""
      }
    }));
  };

  const handleCopyDeliveryToBilling = () => {
    setFormData(prev => ({
      ...prev,
      billing: {
        name: prev.delivery?.recipient || prev.billing?.name,
        street: prev.delivery?.street || prev.billing?.street,
        city: prev.delivery?.city || prev.billing?.city,
        zip: prev.delivery?.zip || prev.billing?.zip,
        country: prev.delivery?.country || prev.billing?.country || "SK",
        ico: prev.billing?.ico || "",
        dic: prev.billing?.dic || "",
        icDph: prev.billing?.icDph || ""
      }
    }));
  };

  // Copy tracking number
  const handleCopyTrackingNumber = () => {
    if (!formData.shippingTrackingNumber) return;
    navigator.clipboard.writeText(formData.shippingTrackingNumber);
    setCopiedTracking(true);
    setTimeout(() => setCopiedTracking(false), 2000);
  };

  // Submit & Save
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canEdit || isSaving) return;

    // Validate customer attachment
    if (formData.customerType === "client" && !formData.clientId) {
      alert(t("Please select a registered client from the CRM database or switch to guest checkout.", "Prosím vyberte registrovaného klienta z CRM databázy alebo prepnite na nákup bez registrácie.", "Kérjük, válasszon egy regisztrált ügyfelet vagy váltson vendég vásárlásra."));
      return;
    }
    if (formData.customerType === "guest" && !formData.guest?.name && !formData.guest?.email && !formData.guest?.phone) {
      alert(t("Please enter at least the guest customer's name, email, or phone number.", "Prosím vyplňte aspoň meno, email alebo telefón hosťovského zákazníka.", "Kérjük, adja meg legalább a vendég nevét, e-mail címét vagy telefonszámát."));
      return;
    }

    setIsSaving(true);
    try {
      const totals = calculateOrderTotals(formData.items || []);
      const completeOrder: Order = {
        ...formData,
        ...totals
      };
      await onSave(completeOrder);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 select-none animate-in fade-in duration-300 text-slate-800 pb-20 relative">
      {/* 1. TOP ENTITY HEADER (Standardized with Leads and Projects) */}
      <EntityHeader
        onBack={onClose}
        backLabel={backLabel || t("Back to Orders", "Späť na objednávky", "Vissza a rendelésekhez")}
        avatar={
          <div className="size-12 rounded-2xl text-white flex items-center justify-center font-bold text-title shadow-md shrink-0" style={{ backgroundColor: SECTION_VISUALS.orders.color }}>
            <SectionIcon id="orders" className="size-6" color="#ffffff" />
          </div>
        }
        title={
          <div className="flex items-center gap-3">
            <span>
              {isNew
                ? t("New E-Shop Order", "Nová objednávka", "Új rendelés")
                : formData.orderNumber}
            </span>
            {isNew && (
              <span className="px-2.5 py-0.5 rounded-full text-micro font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wider">
                {formData.orderNumber}
              </span>
            )}
          </div>
        }
        badges={
          <>
            {/* Status Dropdown / Badge */}
            <div className="inline-flex items-center">
              <CustomSelect
                size="sm"
                fitLabel
                value={formData.status}
                disabled={!canEdit}
                onChange={status => setFormData({ ...formData, status })}
                className="!rounded-full !py-1 !font-bold !text-white !border-transparent"
                style={{ backgroundColor: orderStatusColor(formData.status, orderStatuses) }}
                options={orderStatuses.map(st => ({
                  value: st.key,
                  label: orderStatusLabel(st.key, t, orderStatuses),
                  color: orderStatusColor(st.key, orderStatuses),
                }))}
              />
            </div>

            {/* Customer Type Badge */}
            {formData.customerType === "client" && selectedIsLead ? (
              <span className="px-2.5 py-0.5 rounded-full text-micro font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                <User className="size-3" />
                {t("Lead", "Lead", "Lead")}
              </span>
            ) : formData.customerType === "client" ? (
              <span className="px-2.5 py-0.5 rounded-full text-micro font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <UserCheck className="size-3" />
                {t("CRM Client", "CRM Klient", "CRM Ügyfél")}
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-micro font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                <User className="size-3" />
                {t("Guest", "Hosť", "Vendég")}
              </span>
            )}

            {/* Payment Status Badge */}
            <span
              className={`px-2.5 py-0.5 rounded-full text-micro font-bold border flex items-center gap-1 ${
                formData.paymentStatus === "paid"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : formData.paymentStatus === "refunded"
                  ? "bg-purple-50 text-purple-700 border-purple-200"
                  : formData.paymentStatus === "partially_paid"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-rose-50 text-rose-700 border-rose-200"
              }`}
            >
              <CreditCard className="size-3" />
              {formData.paymentStatus === "paid"
                ? t("Paid", "Zaplatené", "Fizetve")
                : formData.paymentStatus === "partially_paid"
                ? t("Partial", "Čiastočne", "Részben")
                : formData.paymentStatus === "refunded"
                ? t("Refunded", "Vrátené", "Visszatérítve")
                : t("Unpaid", "Neuhradené", "Fizetetlen")}
            </span>

            {/* Invoice Status Badge */}
            {formData.invoiceNumber && (
              <span
                className="px-2.5 py-0.5 rounded-full text-micro font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center gap-1 font-mono"
                title={t(
                  `Invoice issued: ${formData.invoiceNumber}`,
                  `Faktúra vystavená: ${formData.invoiceNumber}`,
                  `Számla kiállítva: ${formData.invoiceNumber}`
                )}
              >
                <FileCheck className="size-3 text-emerald-600" />
                {formData.invoiceNumber}
              </span>
            )}

            {/* Order Date */}
            <span className="text-slate-500 text-ui font-medium flex items-center gap-1">
              <Calendar className="size-3.5 text-slate-400" />
              {formData.orderDate}
            </span>
          </>
        }
        primaryAction={
          canEdit && (
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={isSaving}
              className="h-11 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] transition-all text-white font-bold text-ui flex items-center gap-2 shadow-sm shadow-indigo-600/25 cursor-pointer disabled:opacity-50"
            >
              <Save className="size-4" />
              <span>{isSaving ? t("Saving…", "Ukladá sa…", "Mentés…") : t("Save Order", "Uložiť objednávku", "Rendelés mentése")}</span>
            </button>
          )
        }
        actions={
          <div className="flex items-center gap-2">
            {/* Operational Actions for Existing Orders */}
            {!isNew && onCreateInvoice && (
              <button
                type="button"
                onClick={() => onCreateInvoice(formData)}
                className={`h-11 px-3.5 rounded-xl border text-ui font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer ${
                  formData.invoiceNumber
                    ? "bg-emerald-50/80 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                    : "bg-white border-slate-200 text-slate-700 hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50/50"
                }`}
                title={
                  formData.invoiceNumber
                    ? t(
                        `Invoice created: ${formData.invoiceNumber}`,
                        `Faktúra vystavená: ${formData.invoiceNumber}`,
                        `Számla kiállítva: ${formData.invoiceNumber}`
                      )
                    : t("Issue Invoice / Proforma", "Vystaviť faktúru", "Számla kiállítása")
                }
              >
                {formData.invoiceNumber ? (
                  <FileCheck className="size-4 text-emerald-600" />
                ) : (
                  <FileText className="size-4 text-emerald-600" />
                )}
                <span className="hidden ws-sm:inline">
                  {formData.invoiceNumber || t("Invoice", "Faktúra", "Számla")}
                </span>
              </button>
            )}

            {!isNew && onFulfillWarehouse && (
              <button
                type="button"
                onClick={() => onFulfillWarehouse(formData)}
                className="h-11 px-3.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50/50 text-ui font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                title={t("Fulfill Physical Products from Warehouse", "Vyskladniť výdajku", "Raktári kiadás")}
              >
                <PackageCheck className="size-4 text-blue-600" />
                <span className="hidden ws-sm:inline">{t("Fulfill", "Výdajka", "Kiadás")}</span>
              </button>
            )}

            {!isNew && canDelete && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(formData)}
                className="size-11 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-all flex items-center justify-center shadow-sm cursor-pointer"
                title={t("Delete Order", "Zmazať objednávku", "Rendelés törlése")}
              >
                <Trash2 className="size-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-ui font-semibold transition-all shadow-sm cursor-pointer"
            >
              {t("Cancel", "Zrušiť", "Mégse")}
            </button>
          </div>
        }
      />

      {/* 2. MASTER DUAL-PANEL DASHBOARD GRID (Layout matching Leads) */}
      <div className="grid grid-cols-1 ws-lg:grid-cols-12 gap-6 items-start">

        {/* ======================================================== */}
        {/* LEFT COLUMN: Client Relationship & Customer / Order Data */}
        {/* ======================================================== */}
        <div className="ws-lg:col-span-5 space-y-6">

          {/* 1. Client Attachment & Relationship Card */}
          <div className="bg-white border border-slate-200 rounded-[28px] p-6 shadow-sm space-y-5">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between gap-2">
              <span className="text-ui font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="size-4.5 text-indigo-600" />
                {t("Customer Profile", "Profil zákazníka", "Ügyfél profil")}
              </span>

              {/* Customer Type Selector */}
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, customerType: "client" })}
                  className={`px-3 py-1 rounded-lg text-micro font-bold transition-all ${
                    formData.customerType === "client"
                      ? "bg-white text-indigo-600 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {t("CRM Client", "CRM Klient", "CRM Ügyfél")}
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, customerType: "guest" })}
                  className={`px-3 py-1 rounded-lg text-micro font-bold transition-all ${
                    formData.customerType === "guest"
                      ? "bg-white text-amber-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {t("Guest Checkout", "Hosť", "Vendég")}
                </button>
              </div>
            </div>

            {/* REGISTERED CRM CLIENT MODE */}
            {formData.customerType === "client" ? (
              <div className="space-y-4">
                {/* Searchable Client Picker */}
                <div className="relative" ref={clientDropdownRef}>
                  <label className="type-overline text-slate-500 block mb-1.5">
                    {t("Select Registered Client", "Vybrať registrovaného klienta", "Regisztrált ügyfél kiválasztása")}
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                    <input
                      type="text"
                      value={clientSearchQuery}
                      onChange={e => {
                        setClientSearchQuery(e.target.value);
                        setIsClientSearchOpen(true);
                      }}
                      onFocus={() => setIsClientSearchOpen(true)}
                      placeholder={
                        selectedClient
                          ? selectedClient.name
                          : t("Search client by name, company, email, IČO…", "Hľadať klienta podľa mena, firmy, IČO…", "Ügyfél keresése név, cég, adószám alapján…")
                      }
                      className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                    />
                    {clientSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => {
                          setClientSearchQuery("");
                          setIsClientSearchOpen(false);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : selectedClient ? (
                      <button
                        type="button"
                        onClick={handleClearClient}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-600 cursor-pointer p-0.5 rounded transition-colors"
                        title={t("Detach client", "Odpojiť klienta", "Ügyfél leválasztása")}
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : (
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
                    )}
                  </div>

                  {/* Client Dropdown Results */}
                  {isClientSearchOpen && (
                    <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150">
                      {filteredClients.length > 0 ? (
                        filteredClients.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleSelectClient(c)}
                            className="w-full text-left px-4 py-2.5 hover:bg-indigo-50/70 border-b border-slate-100 last:border-b-0 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                          >
                            <div className="min-w-0">
                              <p className="text-ui font-bold text-slate-800 truncate flex items-center gap-2">
                                <span className="truncate">{c.name}</span>
                                {!isClientRecord(c) && (
                                  <span className="shrink-0 px-1.5 py-px rounded-full text-micro font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    {t("Lead", "Lead", "Lead")}
                                  </span>
                                )}
                              </p>
                              <p className="text-micro text-slate-500 truncate">
                                {c.contactPerson && `${c.contactPerson} • `}
                                {c.city && `${c.city} • `}
                                {c.companyId && `IČO: ${c.companyId}`}
                              </p>
                            </div>
                            {formData.clientId === c.id && (
                              <Check className="size-4 text-indigo-600 shrink-0" />
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="p-4 text-center text-ui text-slate-400 italic">
                          {t("No clients found.", "Nenašli sa žiadni klienti.", "Nem található ügyfél.")}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Synced Client Relationship Profile Card (Directly matching Leads style) */}
                {selectedClient ? (
                  <div className={selectedIsLead ? "p-5 rounded-2xl border-2 border-indigo-300 bg-indigo-50/70 text-indigo-950 space-y-3.5 shadow-xs" : "p-5 rounded-2xl border-2 border-emerald-300 bg-emerald-50/70 text-emerald-950 space-y-3.5 shadow-xs"}>
                    <div className={selectedIsLead ? "border-b border-indigo-200/60 pb-2.5 flex items-center justify-between gap-2" : "border-b border-emerald-200/60 pb-2.5 flex items-center justify-between gap-2"}>
                      <span className={selectedIsLead ? "text-micro font-bold text-indigo-800 flex items-center gap-1.5 uppercase tracking-wider" : "text-micro font-bold text-emerald-800 flex items-center gap-1.5 uppercase tracking-wider"}>
                        {selectedIsLead
                          ? <User className="size-3.5 text-indigo-600" />
                          : <UserCheck className="size-3.5 text-emerald-600" />}
                        {selectedIsLead
                          ? t("Lead (no client profile)", "Lead (bez profilu klienta)", "Lead (nincs ügyfélprofil)")
                          : t("Synced CRM Client", "Zosynchronizovaný klient", "Szinkronizált ügyfél")}
                      </span>
                      <div className="flex items-center gap-2">
                        {onOpenClient && (
                          <button
                            type="button"
                            onClick={() => onOpenClient(selectedClient.id)}
                            className={selectedIsLead ? "text-micro font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 hover:underline cursor-pointer" : "text-micro font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 hover:underline cursor-pointer"}
                          >
                            {t("Open Profile", "Otvoriť profil", "Profil megnyitása")}
                            <ExternalLink className="size-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleClearClient}
                          className="text-micro font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1 hover:underline cursor-pointer"
                        >
                          <X className="size-3" />
                          {t("Change / Detach", "Zmeniť / Odpojiť", "Módosítás / Leválasztás")}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className={selectedIsLead ? "size-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center font-bold text-ui shadow-xs shrink-0" : "size-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center font-bold text-ui shadow-xs shrink-0"}>
                        {getInitials(selectedClient.name)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-body font-bold text-slate-900 truncate">
                          {selectedClient.name}
                        </h4>
                        {selectedClient.contactPerson && (
                          <p className={selectedIsLead ? "text-micro font-semibold text-indigo-800" : "text-micro font-semibold text-emerald-800"}>
                            {selectedClient.contactPerson}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className={selectedIsLead ? "grid grid-cols-2 gap-2 text-micro font-medium pt-1 border-t border-indigo-200/50" : "grid grid-cols-2 gap-2 text-micro font-medium pt-1 border-t border-emerald-200/50"}>
                      {selectedClient.email && (
                        <div className={selectedIsLead ? "flex items-center gap-1.5 text-indigo-900 truncate" : "flex items-center gap-1.5 text-emerald-900 truncate"}>
                          <Mail className={selectedIsLead ? "size-3 text-indigo-600 shrink-0" : "size-3 text-emerald-600 shrink-0"} />
                          <span className="truncate">{selectedClient.email}</span>
                        </div>
                      )}
                      {selectedClient.phone && (
                        <div className={selectedIsLead ? "flex items-center gap-1.5 text-indigo-900 truncate" : "flex items-center gap-1.5 text-emerald-900 truncate"}>
                          <Phone className={selectedIsLead ? "size-3 text-indigo-600 shrink-0" : "size-3 text-emerald-600 shrink-0"} />
                          <span>{selectedClient.phone}</span>
                        </div>
                      )}
                      {selectedClient.companyId && (
                        <div className={selectedIsLead ? "text-indigo-800" : "text-emerald-800"}>
                          <span className={selectedIsLead ? "text-indigo-600 font-bold" : "text-emerald-600 font-bold"}>IČO:</span> {selectedClient.companyId}
                        </div>
                      )}
                      {selectedClient.city && (
                        <div className={selectedIsLead ? "flex items-center gap-1 text-indigo-800 truncate" : "flex items-center gap-1 text-emerald-800 truncate"}>
                          <MapPin className={selectedIsLead ? "size-3 text-indigo-600 shrink-0" : "size-3 text-emerald-600 shrink-0"} />
                          <span>{selectedClient.city}</span>
                        </div>
                      )}
                    </div>

                    {selectedIsLead && (
                      <p className="text-micro text-indigo-800/80 leading-snug">
                        {t(
                          "This order is attached to a lead. Create a client profile from the lead to turn it into a registered client.",
                          "Objednávka je priradená k leadu. Z leadu môžete vytvoriť profil klienta, aby sa z neho stal registrovaný klient.",
                          "A rendelés egy leadhez van rendelve. A leadből ügyfélprofilt hozhat létre, hogy regisztrált ügyfél legyen."
                        )}
                      </p>
                    )}

                    <div className="pt-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleSelectClient(selectedClient)}
                        className={selectedIsLead ? "text-micro font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer" : "text-micro font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"}
                      >
                        <RotateCcw className="size-3" />
                        {t("Re-sync addresses", "Znovu zosúladiť adresy", "Címek újraszinkronizálása")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 text-center space-y-2">
                    <div className="size-10 rounded-xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                      <User className="size-5 text-slate-400" />
                    </div>
                    <div>
                      <h4 className="text-ui font-bold text-slate-700">
                        {t("No client selected", "Nie je vybraný žiadny klient", "Nincs kiválasztva ügyfél")}
                      </h4>
                      <p className="text-micro text-slate-400 max-w-sm mx-auto mt-0.5">
                        {t(
                          "Search and select an existing CRM client above to link this order, or switch to Guest Checkout.",
                          "Hore vyhľadajte a vyberte existujúceho klienta pre prepojenie s objednávkou, alebo prepnite na Nákup bez registrácie.",
                          "Keressen és válasszon ki egy ügyfelet fent a megrendelés összekapcsolásához, vagy váltson Vendég fizetésre."
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* GUEST CHECKOUT MODE */
              <div className="p-5 rounded-2xl border-2 border-amber-300 bg-amber-50/70 text-amber-950 space-y-4 shadow-xs">
                <div className="border-b border-amber-200/60 pb-2.5 flex items-center justify-between gap-2">
                  <span className="text-micro font-bold text-amber-800 flex items-center gap-1.5 uppercase tracking-wider">
                    <User className="size-3.5 text-amber-600" />
                    {t("Guest Customer Form", "Neregistrovaný nákup (Hosť)", "Vendég vásárló adatai")}
                  </span>
                  {!isNew && onConvertGuest && (
                    <button
                      type="button"
                      onClick={() => onConvertGuest(formData)}
                      className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-micro font-bold transition-all shadow-xs"
                    >
                      {t("Convert to CRM Client", "Vytvoriť klienta v CRM", "Ügyfél létrehozása")}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="type-overline text-amber-800 block">
                      {t("Full Name", "Meno a priezvisko", "Teljes név")} *
                    </label>
                    <input
                      type="text"
                      value={formData.guest?.name || ""}
                      onChange={e => setFormData({
                        ...formData,
                        guest: { ...formData.guest, name: e.target.value }
                      })}
                      placeholder="Ján Novák"
                      className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-ui text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="type-overline text-amber-800 block">
                      {t("Company (Optional)", "Firma (Voliteľné)", "Cégnév (Opcionális)")}
                    </label>
                    <input
                      type="text"
                      value={formData.guest?.company || ""}
                      onChange={e => setFormData({
                        ...formData,
                        guest: { ...formData.guest, company: e.target.value }
                      })}
                      placeholder="Firma s.r.o."
                      className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-ui text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="type-overline text-amber-800 block">
                      {t("Email", "Email", "E-mail")} *
                    </label>
                    <input
                      type="email"
                      value={formData.guest?.email || ""}
                      onChange={e => setFormData({
                        ...formData,
                        guest: { ...formData.guest, email: e.target.value }
                      })}
                      placeholder="jan.novak@example.sk"
                      className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-ui text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="type-overline text-amber-800 block">
                      {t("Phone Number", "Telefónne číslo", "Telefonszám")}
                    </label>
                    <input
                      type="text"
                      value={formData.guest?.phone || ""}
                      onChange={e => setFormData({
                        ...formData,
                        guest: { ...formData.guest, phone: e.target.value }
                      })}
                      placeholder="+421 900 123 456"
                      className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-ui text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="type-overline text-amber-800 block">IČO</label>
                    <input
                      type="text"
                      value={formData.guest?.ico || ""}
                      onChange={e => setFormData({
                        ...formData,
                        guest: { ...formData.guest, ico: e.target.value }
                      })}
                      placeholder="12345678"
                      className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-ui text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="type-overline text-amber-800 block">DIČ / IČ DPH</label>
                    <input
                      type="text"
                      value={formData.guest?.dic || ""}
                      onChange={e => setFormData({
                        ...formData,
                        guest: { ...formData.guest, dic: e.target.value }
                      })}
                      placeholder="SK2020123456"
                      className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-ui text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Delivery Address & Shipping Card */}
          <div className="bg-white border border-slate-200 rounded-[28px] p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between gap-2">
              <span className="text-ui font-bold text-slate-900 flex items-center gap-2">
                <Truck className="size-4.5 text-blue-600" />
                {t("Delivery Address & Carrier", "Dodacia adresa & Preprava", "Szállítási cím és futár")}
              </span>
              <button
                type="button"
                onClick={handleCopyBillingToDelivery}
                className="text-micro font-bold text-indigo-600 hover:text-indigo-800"
              >
                {t("Copy from billing", "Kopírovať z fakturačnej", "Másolás számlázási címből")}
              </button>
            </div>

            <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3">
              <div className="ws-sm:col-span-2 space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Recipient Name", "Príjemca (Meno / Firma)", "Címzett neve")}
                </label>
                <input
                  type="text"
                  value={formData.delivery?.recipient || ""}
                  onChange={e => setFormData({
                    ...formData,
                    delivery: { ...formData.delivery, recipient: e.target.value }
                  })}
                  placeholder={t("e.g. Peter Novák", "napr. Peter Novák", "pl. Kovács Péter")}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Street & Number", "Ulica a súpisné číslo", "Utca és házszám")}
                </label>
                <input
                  type="text"
                  value={formData.delivery?.street || ""}
                  onChange={e => setFormData({
                    ...formData,
                    delivery: { ...formData.delivery, street: e.target.value }
                  })}
                  placeholder="Hlavná 123"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("City", "Mesto", "Város")}
                </label>
                <input
                  type="text"
                  value={formData.delivery?.city || ""}
                  onChange={e => setFormData({
                    ...formData,
                    delivery: { ...formData.delivery, city: e.target.value }
                  })}
                  placeholder="Bratislava"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Postal Code (ZIP)", "PSČ", "Irányítószám")}
                </label>
                <input
                  type="text"
                  value={formData.delivery?.zip || ""}
                  onChange={e => setFormData({
                    ...formData,
                    delivery: { ...formData.delivery, zip: e.target.value }
                  })}
                  placeholder="811 01"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Country", "Štát", "Ország")}
                </label>
                <select
                  value={formData.delivery?.country || "SK"}
                  onChange={e => setFormData({
                    ...formData,
                    delivery: { ...formData.delivery, country: e.target.value }
                  })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="SK">Slovensko</option>
                  <option value="CZ">Česká republika</option>
                  <option value="HU">Magyarország</option>
                  <option value="AT">Österreich</option>
                  <option value="DE">Deutschland</option>
                  <option value="PL">Polska</option>
                </select>
              </div>

              <div className="ws-sm:col-span-2 space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Recipient Contact Phone", "Telefón príjemcu pre kuriéra", "Telefonszám a futárhoz")}
                </label>
                <input
                  type="text"
                  value={formData.delivery?.phone || ""}
                  onChange={e => setFormData({
                    ...formData,
                    delivery: { ...formData.delivery, phone: e.target.value }
                  })}
                  placeholder="+421 900 123 456"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Carrier Method & Tracking */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Shipping Carrier / Method", "Spôsob dopravy", "Szállítási mód")}
                </label>
                <div className="grid grid-cols-2 ws-sm:grid-cols-3 gap-2">
                  {displayedShippingMethods.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          shippingMethod: formData.shippingMethod === m ? "" : m
                        })
                      }
                      className={`px-3 py-2 rounded-xl text-micro font-bold border transition-all text-center ${
                        formData.shippingMethod === m
                          ? "bg-blue-50 border-blue-400 text-blue-800 shadow-xs"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Tracking Number", "Sledovacie číslo zásielky", "Csomagkövetési szám")}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={formData.shippingTrackingNumber || ""}
                    onChange={e => setFormData({ ...formData, shippingTrackingNumber: e.target.value })}
                    placeholder="napr. 0123456789"
                    className="w-full pl-3.5 pr-20 py-2 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-mono font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  {formData.shippingTrackingNumber && (
                    <div className="absolute right-1.5 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleCopyTrackingNumber}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                        title={t("Copy Tracking Number", "Kopírovať číslo", "Szám másolása")}
                      >
                        {copiedTracking ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                      </button>
                      {formatCarrierTrackingUrl(formData.shippingMethod || undefined, formData.shippingTrackingNumber || undefined) && (
                        <a
                          href={formatCarrierTrackingUrl(formData.shippingMethod || undefined, formData.shippingTrackingNumber || undefined) || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-blue-600 hover:text-blue-800 rounded-lg hover:bg-blue-50 transition-colors"
                          title={t("Open Carrier Tracking", "Sledovať zásielku online", "Nyomkövetés megnyitása")}
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Billing Address Card */}
          <div className="bg-white border border-slate-200 rounded-[28px] p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between gap-2">
              <span className="text-ui font-bold text-slate-900 flex items-center gap-2">
                <FileText className="size-4.5 text-purple-600" />
                {t("Billing Information", "Fakturačné údaje", "Számlázási adatok")}
              </span>
              <button
                type="button"
                onClick={handleCopyDeliveryToBilling}
                className="text-micro font-bold text-indigo-600 hover:text-indigo-800"
              >
                {t("Same as delivery", "Zhodná s dodacou", "Megegyezik a szállítással")}
              </button>
            </div>

            <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3">
              <div className="ws-sm:col-span-2 space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Billing Name / Company", "Fakturačný názov / Firma", "Számlázási név / Cég")}
                </label>
                <input
                  type="text"
                  value={formData.billing?.name || ""}
                  onChange={e => setFormData({
                    ...formData,
                    billing: { ...formData.billing, name: e.target.value }
                  })}
                  placeholder="Firma s.r.o. / Meno a priezvisko"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              <div className="space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Street & Number", "Ulica a číslo", "Utca és házszám")}
                </label>
                <input
                  type="text"
                  value={formData.billing?.street || ""}
                  onChange={e => setFormData({
                    ...formData,
                    billing: { ...formData.billing, street: e.target.value }
                  })}
                  placeholder="Obchodná 1"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              <div className="space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("City", "Mesto", "Város")}
                </label>
                <input
                  type="text"
                  value={formData.billing?.city || ""}
                  onChange={e => setFormData({
                    ...formData,
                    billing: { ...formData.billing, city: e.target.value }
                  })}
                  placeholder="Bratislava"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              <div className="space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Postal Code (ZIP)", "PSČ", "Irányítószám")}
                </label>
                <input
                  type="text"
                  value={formData.billing?.zip || ""}
                  onChange={e => setFormData({
                    ...formData,
                    billing: { ...formData.billing, zip: e.target.value }
                  })}
                  placeholder="811 01"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              <div className="space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Country", "Štát", "Ország")}
                </label>
                <select
                  value={formData.billing?.country || "SK"}
                  onChange={e => setFormData({
                    ...formData,
                    billing: { ...formData.billing, country: e.target.value }
                  })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                >
                  <option value="SK">Slovensko</option>
                  <option value="CZ">Česká republika</option>
                  <option value="HU">Magyarország</option>
                  <option value="AT">Österreich</option>
                  <option value="DE">Deutschland</option>
                  <option value="PL">Polska</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="type-overline text-slate-500 block">IČO</label>
                <input
                  type="text"
                  value={formData.billing?.ico || ""}
                  onChange={e => setFormData({
                    ...formData,
                    billing: { ...formData.billing, ico: e.target.value }
                  })}
                  placeholder="12345678"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-mono font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              <div className="space-y-1">
                <label className="type-overline text-slate-500 block">DIČ / IČ DPH</label>
                <input
                  type="text"
                  value={formData.billing?.dic || ""}
                  onChange={e => setFormData({
                    ...formData,
                    billing: { ...formData.billing, dic: e.target.value }
                  })}
                  placeholder="SK2020123456"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-mono font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>
            </div>
          </div>

          {/* 4. Order Lifecycle, Payments & Operational Notes */}
          <div className="bg-white border border-slate-200 rounded-[28px] p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between gap-2">
              <span className="text-ui font-bold text-slate-900 flex items-center gap-2">
                <Clock className="size-4.5 text-slate-600" />
                {t("Payment, Schedule & Notes", "Platba, termíny a poznámky", "Fizetés, határidők és megjegyzések")}
              </span>
            </div>

            <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Payment Method", "Spôsob platby", "Fizetési mód")}
                </label>
                <select
                  value={formData.paymentMethod || defaultPaymentMethod}
                  onChange={e => setFormData({ ...formData, paymentMethod: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                >
                  {displayedPaymentMethods.map(m => (
                    <option key={m} value={m}>
                      {paymentMethodLabel(m)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Payment Status", "Stav úhrady", "Fizetési állapot")}
                </label>
                <select
                  value={formData.paymentStatus}
                  onChange={e => setFormData({ ...formData, paymentStatus: e.target.value as OrderPaymentStatus })}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="unpaid">{t("Unpaid", "Neuhradené", "Fizetetlen")}</option>
                  <option value="paid">{t("Paid", "Zaplatené", "Fizetve")}</option>
                  <option value="partially_paid">{t("Partially Paid", "Čiastočne uhradené", "Részben fizetve")}</option>
                  <option value="refunded">{t("Refunded", "Vrátené", "Visszatérítve")}</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Order Date", "Dátum objednávky", "Rendelés dátuma")}
                </label>
                <input
                  type="date"
                  value={formData.orderDate}
                  onChange={e => setFormData({ ...formData, orderDate: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Requested Delivery Date", "Požadovaný termín dodania", "Kért szállítási határidő")}
                </label>
                <input
                  type="date"
                  value={formData.requestedDeliveryDate || ""}
                  onChange={e => setFormData({ ...formData, requestedDeliveryDate: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {warehouses.length > 0 && (
                <div className="ws-sm:col-span-2 space-y-1">
                  <label className="type-overline text-slate-500 block">
                    {t("Fulfillment Warehouse", "Sklad pre expedíciu", "Kiadási raktár")}
                  </label>
                  <select
                    value={formData.warehouseId || warehouses[0]?.id || ""}
                    onChange={e => setFormData({ ...formData, warehouseId: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.code || w.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Invoice status sub-card */}
              <div className="ws-sm:col-span-2 p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-xl shrink-0 ${
                      formData.invoiceNumber
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {formData.invoiceNumber ? (
                      <FileCheck className="size-4.5" />
                    ) : (
                      <FileText className="size-4.5" />
                    )}
                  </div>
                  <div>
                    <div className="text-caption font-bold text-slate-900 flex items-center gap-2">
                      <span>{t("Invoice", "Faktúra", "Számla")}</span>
                      {formData.invoiceNumber ? (
                        <span className="font-mono text-emerald-700 font-bold">
                          {formData.invoiceNumber}
                        </span>
                      ) : (
                        <span className="text-micro px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 font-medium">
                          {t("Not created", "Nevystavená", "Nincs kiállítva")}
                        </span>
                      )}
                    </div>
                    <div className="text-micro text-slate-500 mt-0.5">
                      {formData.invoiceNumber ? (
                        <>
                          {t("Issued", "Vystavená", "Kiállítva")}:{" "}
                          <span className="font-mono text-slate-700 font-medium">
                            {formatDateLocalized(
                              formData.invoiceIssuedAt || formData.orderDate,
                              userLanguage
                            )}
                          </span>
                        </>
                      ) : (
                        t(
                          "Invoice has not been issued from this order yet.",
                          "K tejto objednávke zatiaľ nebola vystavená faktúra.",
                          "Ehhez a rendeléshez még nem állítottak ki számlát."
                        )
                      )}
                    </div>
                  </div>
                </div>

                {!isNew && onCreateInvoice && (
                  <button
                    type="button"
                    onClick={() => onCreateInvoice(formData)}
                    className={`px-3.5 py-1.5 rounded-xl text-caption font-bold transition-all shadow-xs flex items-center gap-1.5 self-start ws-sm:self-auto cursor-pointer ${
                      formData.invoiceNumber
                        ? "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-emerald-700"
                        : "bg-emerald-600 hover:bg-emerald-700 text-white"
                    }`}
                  >
                    {formData.invoiceNumber ? (
                      <>
                        <FileCheck className="size-3.5 text-emerald-600" />
                        <span>
                          {t(
                            "Re-issue / Create New",
                            "Pre-vystaviť / Nová faktúra",
                            "Újra kiállítás"
                          )}
                        </span>
                      </>
                    ) : (
                      <>
                        <FileText className="size-3.5" />
                        <span>{t("Issue Invoice", "Vystaviť faktúru", "Számla kiállítása")}</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="ws-sm:col-span-2 space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Customer Remark / Notes", "Poznámka od zákazníka", "Vásárlói megjegyzés")}
                </label>
                <textarea
                  rows={2}
                  value={formData.notes || ""}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={t("Customer delivery instruction or note…", "Pokyn pre doručenie alebo poznámka…", "Szállítási utasítás vagy megjegyzés…")}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                />
              </div>

              <div className="ws-sm:col-span-2 space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Internal Note (CRM)", "Interná poznámka (CRM)", "Belső megjegyzés (CRM)")}
                </label>
                <textarea
                  rows={2}
                  value={formData.notes || ""}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={t("Private internal notes for team…", "Interné informácie pre tím…", "Belső feljegyzés a csapatnak…")}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                />
              </div>
            </div>
          </div>

        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: Order Items Table, Search Dropdown & Totals */}
        {/* ======================================================== */}
        <div className="ws-lg:col-span-7 space-y-6">

          {/* 1. Order Items Card */}
          <div className="bg-white border border-slate-200 rounded-[28px] p-6 shadow-sm space-y-5">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShoppingBag className="size-5 text-indigo-600" />
                <h3 className="text-title font-heading font-bold text-slate-900">
                  {t("Order Items", "Položky objednávky", "Rendelési tételek")}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-micro font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {(formData.items || []).length}
                </span>
              </div>
              <div className="text-right">
                <span className="type-overline text-slate-400 block">{t("Subtotal", "Medzisúčet", "Részösszeg")}</span>
                <span className="text-body font-bold text-slate-900">{money(formData.totalGrossAmount)}</span>
              </div>
            </div>

            {/* SEARCHABLE DROPDOWN FOR ADDING ITEMS */}
            <div className="relative" ref={itemDropdownRef}>
              <div className="relative flex items-center">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4.5 text-slate-400" />
                <input
                  ref={itemInputRef}
                  type="text"
                  value={itemSearchQuery}
                  onChange={e => {
                    setItemSearchQuery(e.target.value);
                    if (!isItemSearchOpen) setIsItemSearchOpen(true);
                  }}
                  onFocus={() => setIsItemSearchOpen(true)}
                  placeholder={t(
                    "Search and add warehouse product or service by name, SKU…",
                    "Hľadať a pridať tovar zo skladu alebo službu podľa názvu, SKU…",
                    "Termék vagy szolgáltatás keresése és hozzáadása név, SKU alapján…"
                  )}
                  className="w-full pl-11 pr-28 py-3 bg-indigo-50/40 border border-indigo-200/80 rounded-2xl text-ui font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all shadow-xs"
                />
                {itemSearchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setItemSearchQuery("");
                      itemInputRef.current?.focus();
                    }}
                    className="absolute right-12 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded-md"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setIsItemSearchOpen(!isItemSearchOpen)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-micro font-bold flex items-center gap-1 transition-colors shadow-2xs"
                >
                  <span>{t("Browse", "Prehľad", "Tallózás")}</span>
                  <ChevronDown className="size-3" />
                </button>
              </div>

              {/* SEARCH DROPDOWN POPOVER */}
              {isItemSearchOpen && (
                <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden max-h-96 flex flex-col animate-in fade-in slide-in-from-top-2 duration-150">
                  {/* Header / Filter Category bar */}
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-micro text-slate-500 font-bold uppercase tracking-wider">
                    <span>
                      {t("Warehouse Products & Services", "Skladový tovar & Služby", "Raktári termékek & Szolgáltatások")}
                    </span>
                    <span>
                      {filteredSearchItems.products.length + filteredSearchItems.services.length} {t("results", "výsledkov", "találat")}
                    </span>
                  </div>

                  {/* Scrollable List */}
                  <div className="overflow-y-auto divide-y divide-slate-100 max-h-72">
                    {/* Warehouse Products Group */}
                    {filteredSearchItems.products.length > 0 && (
                      <div>
                        <div className="px-4 py-1.5 bg-slate-100/60 text-micro font-bold text-slate-500 uppercase tracking-wider">
                          {t("Physical Warehouse Goods", "Fyzický tovar na sklade", "Raktári fizikai termékek")}
                        </div>
                        {filteredSearchItems.products.map(wh => (
                          <button
                            key={wh.id}
                            type="button"
                            onClick={() => {
                              handleAddItem("product", {
                                itemId: wh.id,
                                sku: wh.sku,
                                name: wh.name,
                                unit: wh.unit || "ks",
                                // the customer's price level, else the default; the item's own VAT, else the company default
                                unitPrice: resolveSellPrice(wh, customerPriceLevelId, priceLevels),
                                taxRate: resolveItemVatRate(wh, companyBillingSettings)
                              });
                            }}
                            className="w-full px-4 py-2.5 hover:bg-indigo-50/70 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer group"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded text-micro font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                                  {wh.sku}
                                </span>
                                <p className="text-ui font-bold text-slate-800 group-hover:text-indigo-600 truncate">
                                  {wh.name}
                                </p>
                              </div>
                              <p className="text-micro text-slate-400 mt-0.5 truncate">
                                {wh.category && `${wh.category} • `}
                                {t("Unit", "Jedn.", "Egység")}: {wh.unit || "ks"}
                                {packHint(wh, t("pack", "bal", "csomag")) && ` • ${packHint(wh, t("pack", "bal", "csomag"))}`}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <span
                                className="text-ui font-mono font-bold text-slate-900 group-hover:text-indigo-600"
                                title={appliedPriceLevel(wh, customerPriceLevelId, priceLevels)?.name}
                              >
                                {money(resolveSellPrice(wh, customerPriceLevelId, priceLevels))}
                              </span>
                              <span className="block text-micro text-slate-400">/{wh.unit || "ks"}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Predefined Services Group */}
                    {filteredSearchItems.services.length > 0 && (
                      <div>
                        <div className="px-4 py-1.5 bg-slate-100/60 text-micro font-bold text-slate-500 uppercase tracking-wider">
                          {t("Shipping, Delivery & Services", "Doprava, platby a služby", "Szállítás, fizetés és szolgáltatások")}
                        </div>
                        {filteredSearchItems.services.map((srv, idx) => (
                          <button
                            key={srv.serviceCode || idx}
                            type="button"
                            onClick={() => {
                              handleAddItem("service", {
                                name: srv.name,
                                unit: "serv",
                                unitPrice: srv.unitPrice,
                                serviceCode: srv.serviceCode,
                                taxRate: defaultVatRate
                              });
                            }}
                            className="w-full px-4 py-2.5 hover:bg-purple-50/70 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer group"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded text-micro font-bold bg-purple-100 text-purple-700 border border-purple-200 shrink-0">
                                  {srv.category}
                                </span>
                                <p className="text-ui font-bold text-slate-800 group-hover:text-purple-600 truncate">
                                  {srv.name}
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-ui font-mono font-bold text-slate-900 group-hover:text-purple-600">
                                {money(srv.unitPrice)}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* No matches */}
                    {filteredSearchItems.products.length === 0 && filteredSearchItems.services.length === 0 && (
                      <div className="p-6 text-center text-slate-400 text-ui">
                        <AlertCircle className="size-6 mx-auto mb-2 text-slate-300" />
                        <p>{t("No items matching search query.", "Žiadny tovar ani služba nezodpovedá hľadaniu.", "Nincs találat a keresésre.")}</p>
                      </div>
                    )}
                  </div>

                  {/* Dropdown Footer Actions */}
                  <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddItem("product")}
                      className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 text-slate-700 hover:text-indigo-600 text-micro font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Plus className="size-3.5 text-indigo-600" />
                      {t("+ Custom Product", "+ Vlastný tovar", "+ Egyedi termék")}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAddItem("service")}
                      className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-purple-400 text-slate-700 hover:text-purple-600 text-micro font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Plus className="size-3.5 text-purple-600" />
                      {t("+ Custom Service / Fee", "+ Vlastná služba", "+ Egyedi szolgáltatás")}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Service Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="type-overline text-slate-400 text-micro">{t("Quick add:", "Rýchle pridanie:", "Gyors hozzáadás:")}</span>
              {predefinedServices.slice(0, 4).map(srv => (
                <button
                  key={srv.serviceCode}
                  type="button"
                  onClick={() => {
                    handleAddItem("service", {
                      name: srv.name,
                      unit: "serv",
                      unitPrice: srv.unitPrice,
                      serviceCode: srv.serviceCode,
                      taxRate: defaultVatRate
                    });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-micro font-semibold text-slate-700 hover:text-indigo-700 transition-colors flex items-center gap-1"
                >
                  <Plus className="size-3 text-slate-400" />
                  <span>{srv.name}</span>
                  <span className="text-slate-400 font-mono">({money(srv.unitPrice)})</span>
                </button>
              ))}
            </div>

            {/* ITEMS TABLE / LIST */}
            <div className="space-y-3 pt-2">
              {(formData.items || []).length === 0 ? (
                <div className="p-10 rounded-2xl border-2 border-dashed border-slate-200 text-center space-y-3 bg-slate-50/50">
                  <div className="size-12 rounded-2xl bg-indigo-50 text-indigo-500 mx-auto flex items-center justify-center">
                    <ShoppingBag className="size-6" />
                  </div>
                  <div>
                    <h4 className="text-body font-bold text-slate-800">
                      {t("No order items added yet", "Zatiaľ žiadne položky v objednávke", "Még nincsenek tételek")}
                    </h4>
                    <p className="text-ui text-slate-500 max-w-md mx-auto mt-1">
                      {t(
                        "Use the search box above to pick products from your warehouse catalog or add services and delivery fees.",
                        "Použite vyhľadávacie pole vyššie na výber tovaru zo skladu alebo pridajte služby a dopravu.",
                        "Használja a fenti keresőt a raktári termékek kiválasztásához vagy szolgáltatások hozzáadásához."
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs divide-y divide-slate-100">
                  {/* Table Header */}
                  <div className="px-4 py-2.5 bg-slate-50 text-micro font-bold text-slate-500 uppercase tracking-wider grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">{t("Item Description", "Položka / Názov", "Megnevezés")}</div>
                    <div className="col-span-2 text-center">{t("Qty", "Počet", "Menny.")}</div>
                    <div className="col-span-2 text-right">{t("Price / Unit", "Cena / ks", "Egységár")}</div>
                    <div className="col-span-2 text-right">{t("Total Gross", "Celkom s DPH", "Összesen")}</div>
                    <div className="col-span-1 text-center"></div>
                  </div>

                  {/* Rows */}
                  {(formData.items || []).map((item, idx) => (
                    <div key={item.id || idx} className="p-3.5 hover:bg-slate-50/80 transition-colors grid grid-cols-12 gap-2 items-center">
                      {/* Name & Type */}
                      <div className="col-span-5 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-micro font-bold shrink-0 ${
                              item.itemType === "product"
                                ? "bg-blue-100 text-blue-700 border border-blue-200"
                                : "bg-purple-100 text-purple-700 border border-purple-200"
                            }`}
                          >
                            {item.itemType === "product" ? t("Product", "Tovar", "Termék") : t("Service", "Služba", "Szolgáltatás")}
                          </span>
                          {item.sku && (
                            <span className="font-mono text-micro text-slate-400 shrink-0">
                              {item.sku}
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={item.name}
                          onChange={e => handleItemChange(idx, { name: e.target.value })}
                          className="w-full px-2 py-1 bg-transparent hover:bg-white border border-transparent hover:border-slate-200 rounded-lg text-ui font-bold text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none"
                        />
                      </div>

                      {/* Quantity & Unit */}
                      <div className="col-span-2 flex items-center justify-center gap-1">
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={item.quantity}
                          onChange={e => handleItemChange(idx, { quantity: parseFloat(e.target.value) || 0 })}
                          className="w-16 px-2 py-1 text-center bg-slate-50 hover:bg-white border border-slate-200 rounded-lg text-ui font-mono font-bold text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none"
                        />
                        <span className="text-micro text-slate-500 font-semibold">{item.unit || "ks"}</span>
                      </div>

                      {/* Unit Price & Tax */}
                      <div className="col-span-2 text-right space-y-0.5">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={e => handleItemChange(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                          className="w-20 px-2 py-1 text-right bg-slate-50 hover:bg-white border border-slate-200 rounded-lg text-ui font-mono font-bold text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none ml-auto"
                        />
                        <div className="flex items-center justify-end gap-1 text-micro text-slate-400">
                          <span>DPH:</span>
                          <select
                            value={item.taxRate}
                            onChange={e => handleItemChange(idx, { taxRate: parseFloat(e.target.value) || 0 })}
                            className="bg-transparent text-micro font-semibold text-slate-600 focus:outline-none cursor-pointer"
                          >
                            {!availableVatRates.includes(item.taxRate) && (
                              <option key={item.taxRate} value={item.taxRate}>{item.taxRate}%</option>
                            )}
                            {availableVatRates.map(rate => (
                              <option key={rate} value={rate}>{rate}%</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Total Gross */}
                      <div className="col-span-2 text-right">
                        <span className="text-body font-mono font-bold text-slate-900 block">
                          {money(item.totalGrossAmount)}
                        </span>
                        <span className="text-micro font-mono text-slate-400 block">
                          {t("net", "bez DPH", "nettó")}: {money(item.totalNetAmount)}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title={t("Remove item", "Odstrániť položku", "Tétel eltávolítása")}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 2. Financial Summary Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-[28px] p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-200/80 pb-3 flex items-center justify-between">
              <span className="text-ui font-bold text-slate-900 flex items-center gap-2">
                <Coins className="size-4.5 text-indigo-600" />
                {t("Financial Breakdown", "Finančné vyčíslenie objednávky", "Pénzügyi összesítés")}
              </span>
              <span className="text-micro font-mono font-bold text-slate-500 uppercase tracking-wider">
                {formData.currency || systemCurrency}
              </span>
            </div>

            <div className="space-y-2 text-ui font-medium text-slate-600">
              <div className="flex items-center justify-between">
                <span>{t("Physical Goods Subtotal (Net)", "Tovar celkom (bez DPH)", "Termékek összesen (nettó)")}:</span>
                <span className="font-mono font-bold text-slate-800">{money(formData.itemsNetAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("Shipping & Services Subtotal (Net)", "Doprava a služby (bez DPH)", "Szállítás és szolgáltatások (nettó)")}:</span>
                <span className="font-mono font-bold text-slate-800">{money(formData.servicesNetAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("Tax Base Subtotal (Net)", "Základ dane celkom", "Adóalap összesen")}:</span>
                <span className="font-mono font-bold text-slate-800">{money(formData.totalNetAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("Total VAT", "DPH celkom", "ÁFA összesen")}:</span>
                <span className="font-mono font-bold text-slate-800">{money(formData.totalTaxAmount)}</span>
              </div>

              <div className="pt-3 border-t-2 border-slate-200 flex items-baseline justify-between text-slate-900">
                <div>
                  <span className="text-title font-heading font-black block">
                    {t("Total to Pay (Gross)", "Celková suma k úhrade", "Fizetendő végösszeg")}
                  </span>
                  <span className="text-micro text-slate-500">
                    {t("Including VAT & all delivery fees", "Vrátane DPH a všetkých poplatkov", "ÁFÁ-val és díjakkal")}
                  </span>
                </div>
                <span className="text-display font-mono font-black text-indigo-700">
                  {money(formData.totalGrossAmount)}
                </span>
              </div>
            </div>

            {/* Bottom Save Action Button in Financial Panel */}
            {canEdit && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={isSaving}
                  className="w-full py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] transition-all text-white font-bold text-ui flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
                >
                  <Save className="size-5" />
                  <span>{isSaving ? t("Saving Order…", "Ukladá sa objednávka…", "Rendelés mentése…") : t("Save Order & Confirm", "Uložiť a potvrdiť objednávku", "Rendelés mentése és jóváhagyása")}</span>
                </button>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
