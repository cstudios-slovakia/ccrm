import React, { useState, useMemo } from "react";
import {
  Package,
  Boxes,
  Truck,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  AlertTriangle,
  Clock,
  Search,
  Plus,
  CheckCircle2,
  Building2,
  Phone,
  Mail,
  FileText,
  DollarSign,
  TrendingUp,
  BarChart3,
  Layers,
  ChevronDown,
  ChevronRight,
  Printer,
  Sparkles,
  RefreshCw,
  Edit2,
  Trash2,
  X,
  MapPin,
  AlertCircle,
  Barcode,
  ArrowUpDown
} from "lucide-react";
import { formatMoney } from "../utils/currency";
import type { Language } from "../utils/translations";

const formatCurrency = (val: number, lang: Language, currency?: string | null) =>
  formatMoney(val, currency, lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
import type {
  Warehouse,
  Supplier,
  WarehouseItem,
  WarehouseStock,
  WarehouseBatch,
  WarehouseMovement,
  WarehouseMovementItem,
  Lead,
  UserProfile
} from "../types";

interface WarehouseViewProps {
  systemLanguage: Language;
  systemCurrency: string | null;
  currentUser: UserProfile;
  warehouses: Warehouse[];
  setWarehouses: (updater: Warehouse[] | ((prev: Warehouse[]) => Warehouse[])) => void;
  suppliers: Supplier[];
  setSuppliers: (updater: Supplier[] | ((prev: Supplier[]) => Supplier[])) => void;
  warehouseItems: WarehouseItem[];
  setWarehouseItems: (updater: WarehouseItem[] | ((prev: WarehouseItem[]) => WarehouseItem[])) => void;
  warehouseStock: WarehouseStock[];
  setWarehouseStock: (updater: WarehouseStock[] | ((prev: WarehouseStock[]) => WarehouseStock[])) => void;
  warehouseBatches: WarehouseBatch[];
  setWarehouseBatches: (updater: WarehouseBatch[] | ((prev: WarehouseBatch[]) => WarehouseBatch[])) => void;
  warehouseMovements: WarehouseMovement[];
  setWarehouseMovements: (updater: WarehouseMovement[] | ((prev: WarehouseMovement[]) => WarehouseMovement[])) => void;
  leads: Lead[];
  onAddTimelineEvent?: (leadId: string, event: any) => void;
}

export const WarehouseView: React.FC<WarehouseViewProps> = ({
  systemLanguage,
  systemCurrency,
  currentUser,
  warehouses,
  setWarehouses: _setWarehouses,
  suppliers,
  setSuppliers,
  warehouseItems,
  setWarehouseItems,
  warehouseStock,
  setWarehouseStock,
  warehouseBatches,
  setWarehouseBatches,
  warehouseMovements,
  setWarehouseMovements,
  leads,
  onAddTimelineEvent
}) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  // Active Tab
  type TabType = "items" | "movements" | "suppliers" | "batches" | "analytics";
  const [activeSubTab, setActiveSubTab] = useState<TabType>("items");

  // Filters
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [stockStatusFilter, setStockStatusFilter] = useState<"all" | "in_stock" | "low_stock" | "out_of_stock">("all");
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>("all");

  // Modals state
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WarehouseItem | null>(null);

  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  
  const [selectedMovementForPrint, setSelectedMovementForPrint] = useState<WarehouseMovement | null>(null);
  const [expandedMovementId, setExpandedMovementId] = useState<string | null>(null);

  // Form states for Product Modal
  const [itemForm, setItemForm] = useState<{
    name: string;
    sku: string;
    barcode: string;
    category: string;
    unit: string;
    minStock: number;
    optimalStock: number;
    defaultLocation: string;
    hasExpiration: boolean;
    imageUrl: string;
    defaultSellPrice: number;
    avgPurchasePrice: number;
    description: string;
  }>({
    name: "",
    sku: "",
    barcode: "",
    category: "Veľkoformátové dosky",
    unit: "m²",
    minStock: 10,
    optimalStock: 50,
    defaultLocation: "A-01-RACK",
    hasExpiration: false,
    imageUrl: "",
    defaultSellPrice: 0,
    avgPurchasePrice: 0,
    description: ""
  });

  // Form states for Supplier Modal
  const [supplierForm, setSupplierForm] = useState<{
    name: string;
    companyId: string;
    taxId: string;
    vatId: string;
    street: string;
    city: string;
    postalCode: string;
    country: string;
    email: string;
    phone: string;
    website: string;
    iban: string;
    swift: string;
    paymentDueDays: number;
    notes: string;
    contacts: { name: string; position: string; phone: string; email: string }[];
  }>({
    name: "",
    companyId: "",
    taxId: "",
    vatId: "",
    street: "",
    city: "",
    postalCode: "",
    country: "Slovakia",
    email: "",
    phone: "",
    website: "",
    iban: "",
    swift: "",
    paymentDueDays: 14,
    notes: "",
    contacts: [{ name: "", position: "", phone: "", email: "" }]
  });

  const [isAresLoading, setIsAresLoading] = useState(false);

  // Form states for Movement Modals (Receipt / Issue / Transfer)
  const [receiptWarehouseId, setReceiptWarehouseId] = useState<string>(warehouses[0]?.id || "wh-1");
  const [receiptSupplierId, setReceiptSupplierId] = useState<string>(suppliers[0]?.id || "");
  const [receiptNote, setReceiptNote] = useState<string>("");
  const [receiptItems, setReceiptItems] = useState<{
    itemId: string;
    quantity: number;
    unitPurchasePrice: number;
    batchNumber: string;
    expirationDate: string;
    note: string;
  }[]>([
    { itemId: warehouseItems[0]?.id || "", quantity: 1, unitPurchasePrice: warehouseItems[0]?.avgPurchasePrice || 0, batchNumber: "", expirationDate: "", note: "" }
  ]);

  const [issueWarehouseId, setIssueWarehouseId] = useState<string>(warehouses[0]?.id || "wh-1");
  const [issueLeadId, setIssueLeadId] = useState<string>("");
  const [issueNote, setIssueNote] = useState<string>("");
  const [issueLogTimeline, setIssueLogTimeline] = useState<boolean>(true);
  const [issueItems, setIssueItems] = useState<{
    itemId: string;
    batchId: string;
    quantity: number;
    unitSellPrice: number;
    note: string;
  }[]>([
    { itemId: warehouseItems[0]?.id || "", batchId: "", quantity: 1, unitSellPrice: warehouseItems[0]?.defaultSellPrice || 0, note: "" }
  ]);

  const [transferSourceWh, setTransferSourceWh] = useState<string>(warehouses[0]?.id || "");
  const [transferTargetWh, setTransferTargetWh] = useState<string>(warehouses[1]?.id || "");
  const [transferItems, setTransferItems] = useState<{ itemId: string; quantity: number; note: string }[]>([
    { itemId: warehouseItems[0]?.id || "", quantity: 1, note: "" }
  ]);
  const [transferNote, setTransferNote] = useState<string>("");

  // Categories list derived from items
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    warehouseItems.forEach(item => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set);
  }, [warehouseItems]);

  // Aggregate quantities helper per item (optionally filtered by warehouse)
  const getStockInfoForItem = (itemId: string, warehouseId?: string) => {
    let onHand = 0;
    let reserved = 0;
    let locations: string[] = [];

    warehouseStock.forEach(s => {
      if (s.itemId === itemId) {
        if (!warehouseId || warehouseId === "all" || s.warehouseId === warehouseId) {
          onHand += s.quantity;
          reserved += s.reservedQuantity;
          if (s.location && !locations.includes(s.location)) {
            locations.push(s.location);
          }
        }
      }
    });

    return {
      onHand,
      reserved,
      available: Math.max(0, onHand - reserved),
      locations: locations.join(", ")
    };
  };

  // Metrics Calculations
  const metrics = useMemo(() => {
    let totalValuation = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    warehouseItems.forEach(item => {
      const stock = getStockInfoForItem(item.id, selectedWarehouseId);
      totalValuation += stock.onHand * (item.avgPurchasePrice || 0);
      if (stock.onHand === 0) {
        outOfStockCount++;
      } else if (stock.onHand <= item.minStock) {
        lowStockCount++;
      }
    });

    let monthlyInward = 0;
    let monthlyOutward = 0;
    let monthlyProfit = 0;

    warehouseMovements.forEach(m => {
      if (m.status === "confirmed") {
        if (m.type === "inward") {
          monthlyInward += m.totalCostValue || 0;
        } else if (m.type === "outward") {
          monthlyOutward += m.totalSellValue || 0;
          monthlyProfit += m.totalProfitValue || 0;
        }
      }
    });

    const averageMarginPercent = monthlyOutward > 0 ? (monthlyProfit / monthlyOutward) * 100 : 0;

    return {
      totalValuation,
      itemCount: warehouseItems.length,
      lowStockCount,
      outOfStockCount,
      monthlyInward,
      monthlyOutward,
      monthlyProfit,
      averageMarginPercent
    };
  }, [warehouseItems, warehouseStock, warehouseMovements, selectedWarehouseId]);

  // Filtered Warehouse Items
  const filteredItems = useMemo(() => {
    return warehouseItems.filter(item => {
      // Warehouse filter
      const stock = getStockInfoForItem(item.id, selectedWarehouseId);

      // Status filter
      if (stockStatusFilter === "in_stock" && stock.onHand <= item.minStock) return false;
      if (stockStatusFilter === "low_stock" && (stock.onHand > item.minStock || stock.onHand === 0)) return false;
      if (stockStatusFilter === "out_of_stock" && stock.onHand > 0) return false;

      // Category filter
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchSku = item.sku.toLowerCase().includes(q);
        const matchBarcode = item.barcode?.toLowerCase().includes(q);
        const matchCat = item.category?.toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchBarcode && !matchCat) return false;
      }

      return true;
    });
  }, [warehouseItems, warehouseStock, selectedWarehouseId, stockStatusFilter, selectedCategory, searchQuery]);

  // Filtered Movements
  const filteredMovements = useMemo(() => {
    return warehouseMovements.filter(m => {
      if (selectedWarehouseId !== "all" && m.warehouseId !== selectedWarehouseId && m.targetWarehouseId !== selectedWarehouseId) {
        return false;
      }
      if (movementTypeFilter !== "all" && m.type !== movementTypeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDoc = m.documentNumber.toLowerCase().includes(q);
        const matchNote = m.note?.toLowerCase().includes(q);
        const matchCreated = m.createdBy.toLowerCase().includes(q);
        if (!matchDoc && !matchNote && !matchCreated) return false;
      }
      return true;
    });
  }, [warehouseMovements, selectedWarehouseId, movementTypeFilter, searchQuery]);

  // Batches with calculated status
  const batchesWithStatus = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return warehouseBatches.map(batch => {
      const item = warehouseItems.find(i => i.id === batch.itemId);
      const wh = warehouses.find(w => w.id === batch.warehouseId);
      const expDate = new Date(batch.expirationDate);
      const diffTime = expDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let status: "expired" | "warning" | "ok" = "ok";
      if (diffDays <= 0) {
        status = "expired";
      } else if (diffDays <= 30) {
        status = "warning";
      }

      return {
        ...batch,
        itemName: item?.name || t("Unknown Product", "Neznámy tovar", "Ismeretlen termék"),
        itemSku: item?.sku || "",
        itemUnit: item?.unit || "ks",
        warehouseName: wh?.name || batch.warehouseId,
        diffDays,
        status
      };
    }).sort((a, b) => new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime());
  }, [warehouseBatches, warehouseItems, warehouses]);

  // ARES / RegisterUZ Auto-fill helper
  const handleFetchAres = async (icoInput: string) => {
    const ico = icoInput.replace(/\s+/g, "");
    if (!ico || ico.length < 6) {
      alert(t("Please enter a valid 8-digit IČO number.", "Zadajte platné 8-miestne IČO.", "Kérjük, adjon meg érvényes 8 jegyű adószámot."));
      return;
    }

    setIsAresLoading(true);
    try {
      const res = await fetch(`https://autoform.ekosystem.slovensko.digital/api/corporate_bodies/search?q=${ico}&limit=1`, {
        headers: { "Accept": "application/json" }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data[0]) {
          const company = data[0];
          setSupplierForm(prev => ({
            ...prev,
            name: company.name || prev.name,
            companyId: company.cin || ico,
            taxId: company.tin || prev.taxId,
            vatId: company.vatin || (company.tin ? `SK${company.tin}` : prev.vatId),
            street: company.street ? `${company.street} ${company.building_number || ""}`.trim() : (company.formatted_address || prev.street),
            city: company.municipality || prev.city,
            postalCode: company.postal_code || prev.postalCode,
            country: "Slovakia"
          }));
          return;
        }
      }

      // Fallback: ARES CZ/SK
      const aresRes = await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`);
      if (aresRes.ok) {
        const aresData = await aresRes.json();
        if (aresData && aresData.obchodniJmeno) {
          setSupplierForm(prev => ({
            ...prev,
            name: aresData.obchodniJmeno,
            companyId: aresData.ico || ico,
            taxId: aresData.dic || prev.taxId,
            vatId: aresData.dic ? `CZ${aresData.dic}` : prev.vatId,
            street: aresData.textovaAdresa || prev.street,
            city: aresData.sidlo?.nazevObce || prev.city,
            postalCode: aresData.sidlo?.psc ? String(aresData.sidlo.psc) : prev.postalCode,
            country: "Czech Republic"
          }));
          return;
        }
      }

      alert(t("Company not found in business register.", "Spoločnosť sa nenašla v obchodnom registri.", "A vállalat nem található a cégjegyzékben."));
    } catch (err) {
      console.warn("ARES fetch failed", err);
      alert(t("ARES lookup failed. Please enter details manually.", "Vyhľadávanie v ARES zlyhalo. Vyplňte údaje ručne.", "Az ARES lekérdezés sikertelen."));
    } finally {
      setIsAresLoading(false);
    }
  };

  // Save / Update Item handler
  const handleSaveItem = () => {
    if (!itemForm.name.trim() || !itemForm.sku.trim()) {
      alert(t("Please fill in Product Name and SKU.", "Vyplňte názov tovaru a SKU kód.", "Kérjük, töltse ki a termék nevét és a cikkszámot."));
      return;
    }

    if (editingItem) {
      // Update existing item
      const updated: WarehouseItem = {
        ...editingItem,
        name: itemForm.name.trim(),
        sku: itemForm.sku.trim(),
        barcode: itemForm.barcode.trim() || null,
        category: itemForm.category.trim() || null,
        unit: itemForm.unit.trim() || "ks",
        minStock: Number(itemForm.minStock) || 0,
        optimalStock: Number(itemForm.optimalStock) || 0,
        defaultLocation: itemForm.defaultLocation.trim() || null,
        hasExpiration: itemForm.hasExpiration,
        imageUrl: itemForm.imageUrl.trim() || null,
        defaultSellPrice: Number(itemForm.defaultSellPrice) || 0,
        avgPurchasePrice: Number(itemForm.avgPurchasePrice) || 0,
        description: itemForm.description.trim() || null
      };

      setWarehouseItems(prev => prev.map(it => it.id === editingItem.id ? updated : it));
    } else {
      // Create new item
      const newItemId = `item-${Date.now()}`;
      const newItem: WarehouseItem = {
        id: newItemId,
        name: itemForm.name.trim(),
        sku: itemForm.sku.trim(),
        barcode: itemForm.barcode.trim() || null,
        category: itemForm.category.trim() || null,
        unit: itemForm.unit.trim() || "ks",
        minStock: Number(itemForm.minStock) || 0,
        optimalStock: Number(itemForm.optimalStock) || 0,
        defaultLocation: itemForm.defaultLocation.trim() || null,
        hasExpiration: itemForm.hasExpiration,
        imageUrl: itemForm.imageUrl.trim() || null,
        defaultSellPrice: Number(itemForm.defaultSellPrice) || 0,
        avgPurchasePrice: Number(itemForm.avgPurchasePrice) || 0,
        lastPurchasePrice: Number(itemForm.avgPurchasePrice) || 0,
        description: itemForm.description.trim() || null,
        createdAt: new Date().toISOString().slice(0, 19).replace("T", " ")
      };

      setWarehouseItems(prev => [newItem, ...prev]);

      // Initialize zero stock record for all warehouses
      setWarehouseStock(prev => {
        const newStockEntries = warehouses.map(wh => ({
          warehouseId: wh.id,
          itemId: newItemId,
          quantity: 0,
          reservedQuantity: 0,
          location: itemForm.defaultLocation.trim() || null
        }));
        return [...prev, ...newStockEntries];
      });
    }

    setIsItemModalOpen(false);
    setEditingItem(null);
  };

  // Save / Update Supplier handler
  const handleSaveSupplier = () => {
    if (!supplierForm.name.trim()) {
      alert(t("Please enter supplier company name.", "Zadajte názov dodávateľa.", "Adja meg a szállító nevét."));
      return;
    }

    if (editingSupplier) {
      const updated: Supplier = {
        ...editingSupplier,
        name: supplierForm.name.trim(),
        companyId: supplierForm.companyId.trim() || null,
        taxId: supplierForm.taxId.trim() || null,
        vatId: supplierForm.vatId.trim() || null,
        street: supplierForm.street.trim() || null,
        city: supplierForm.city.trim() || null,
        postalCode: supplierForm.postalCode.trim() || null,
        country: supplierForm.country.trim() || "Slovakia",
        email: supplierForm.email.trim() || null,
        phone: supplierForm.phone.trim() || null,
        website: supplierForm.website.trim() || null,
        iban: supplierForm.iban.trim() || null,
        swift: supplierForm.swift.trim() || null,
        paymentDueDays: Number(supplierForm.paymentDueDays) || 14,
        notes: supplierForm.notes.trim() || null,
        contacts: supplierForm.contacts.filter(c => c.name.trim() !== "")
      };

      setSuppliers(prev => prev.map(s => s.id === editingSupplier.id ? updated : s));
    } else {
      const newSupId = `sup-${Date.now()}`;
      const newSup: Supplier = {
        id: newSupId,
        name: supplierForm.name.trim(),
        companyId: supplierForm.companyId.trim() || null,
        taxId: supplierForm.taxId.trim() || null,
        vatId: supplierForm.vatId.trim() || null,
        street: supplierForm.street.trim() || null,
        city: supplierForm.city.trim() || null,
        postalCode: supplierForm.postalCode.trim() || null,
        country: supplierForm.country.trim() || "Slovakia",
        email: supplierForm.email.trim() || null,
        phone: supplierForm.phone.trim() || null,
        website: supplierForm.website.trim() || null,
        iban: supplierForm.iban.trim() || null,
        swift: supplierForm.swift.trim() || null,
        paymentDueDays: Number(supplierForm.paymentDueDays) || 14,
        notes: supplierForm.notes.trim() || null,
        contacts: supplierForm.contacts.filter(c => c.name.trim() !== ""),
        createdAt: new Date().toISOString().slice(0, 19).replace("T", " ")
      };

      setSuppliers(prev => [newSup, ...prev]);
    }

    setIsSupplierModalOpen(false);
    setEditingSupplier(null);
  };

  // Submit New Receipt (Príjemka - PRI)
  const handleCreateReceipt = () => {
    const validItems = receiptItems.filter(it => it.itemId && it.quantity > 0);
    if (validItems.length === 0) {
      alert(t("Please add at least one item with valid quantity.", "Pridajte aspoň jednu položku s platným množstvom.", "Kérjük, adjon hozzá legalább egy érvényes tételt."));
      return;
    }

    const docNum = `PRI-${new Date().getFullYear()}-${String(warehouseMovements.filter(m => m.type === "inward").length + 1).padStart(4, "0")}`;
    const movId = `mov-${Date.now()}`;

    let totalCost = 0;
    let totalSell = 0;

    const movementItems: WarehouseMovementItem[] = validItems.map((v, idx) => {
      const item = warehouseItems.find(i => i.id === v.itemId);
      const unitCost = Number(v.unitPurchasePrice) || 0;
      const unitSell = item?.defaultSellPrice || 0;
      const lineCost = v.quantity * unitCost;
      totalCost += lineCost;
      totalSell += v.quantity * unitSell;

      return {
        id: `mvi-${Date.now()}-${idx}`,
        movementId: movId,
        itemId: v.itemId,
        batchId: v.batchNumber ? `bat-${Date.now()}-${idx}` : null,
        quantity: Number(v.quantity),
        unitPurchasePrice: unitCost,
        unitSellPrice: unitSell,
        totalPrice: lineCost,
        expirationDate: v.expirationDate || null,
        note: v.note || null
      };
    });

    const newMovement: WarehouseMovement = {
      id: movId,
      documentNumber: docNum,
      type: "inward",
      status: "confirmed",
      warehouseId: receiptWarehouseId,
      targetWarehouseId: null,
      supplierId: receiptSupplierId || null,
      leadId: null,
      totalCostValue: totalCost,
      totalSellValue: totalSell,
      totalProfitValue: totalSell - totalCost,
      createdBy: currentUser.email,
      note: receiptNote.trim() || null,
      fileName: null,
      filePath: null,
      issuedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      items: movementItems
    };

    // Update Movements state
    setWarehouseMovements(prev => [newMovement, ...prev]);

    // Update physical Stock & Recalculate WAP (Weighted Average Purchase price)
    validItems.forEach(v => {
      const item = warehouseItems.find(i => i.id === v.itemId);
      if (!item) return;

      const currentStockInfo = getStockInfoForItem(v.itemId, receiptWarehouseId);
      const oldQty = currentStockInfo.onHand;
      const oldAvg = item.avgPurchasePrice || 0;
      const newQty = Number(v.quantity);
      const newPrice = Number(v.unitPurchasePrice);

      // WAP Formula: ((OldQty * OldAvg) + (NewQty * NewPrice)) / (OldQty + NewQty)
      const combinedQty = oldQty + newQty;
      const newWap = combinedQty > 0 ? ((oldQty * oldAvg) + (newQty * newPrice)) / combinedQty : newPrice;

      setWarehouseItems(prev => prev.map(it => it.id === v.itemId ? {
        ...it,
        avgPurchasePrice: Number(newWap.toFixed(4)),
        lastPurchasePrice: newPrice
      } : it));

      // Increase warehouse stock
      setWarehouseStock(prev => {
        const exists = prev.some(s => s.warehouseId === receiptWarehouseId && s.itemId === v.itemId);
        if (exists) {
          return prev.map(s => s.warehouseId === receiptWarehouseId && s.itemId === v.itemId ? {
            ...s,
            quantity: s.quantity + newQty
          } : s);
        } else {
          return [...prev, {
            warehouseId: receiptWarehouseId,
            itemId: v.itemId,
            quantity: newQty,
            reservedQuantity: 0,
            location: item.defaultLocation || null
          }];
        }
      });

      // If batch number / expiration supplied, register new batch
      if (v.batchNumber && v.expirationDate) {
        const newBatch: WarehouseBatch = {
          id: `bat-${Date.now()}-${v.itemId}`,
          itemId: v.itemId,
          warehouseId: receiptWarehouseId,
          batchNumber: v.batchNumber,
          expirationDate: v.expirationDate,
          initialQuantity: newQty,
          currentQuantity: newQty,
          purchasePrice: newPrice,
          createdAt: new Date().toISOString().slice(0, 19).replace("T", " ")
        };
        setWarehouseBatches(prev => [newBatch, ...prev]);
      }
    });

    setIsReceiptModalOpen(false);
    setReceiptItems([{ itemId: warehouseItems[0]?.id || "", quantity: 1, unitPurchasePrice: warehouseItems[0]?.avgPurchasePrice || 0, batchNumber: "", expirationDate: "", note: "" }]);
    setReceiptNote("");
  };

  // Submit New Issue (Výdajka - VYD)
  const handleCreateIssue = () => {
    const validItems = issueItems.filter(it => it.itemId && it.quantity > 0);
    if (validItems.length === 0) {
      alert(t("Please add at least one item with valid quantity.", "Pridajte aspoň jednu položku s platným množstvom.", "Kérjük, adjon hozzá legalább egy érvényes tételt."));
      return;
    }

    // Stock availability verification
    for (const v of validItems) {
      const stock = getStockInfoForItem(v.itemId, issueWarehouseId);
      if (v.quantity > stock.available) {
        const item = warehouseItems.find(i => i.id === v.itemId);
        alert(t(
          `Insufficient stock for "${item?.name}". Available: ${stock.available} ${item?.unit}, Requested: ${v.quantity}`,
          `Nedostatočný stav zásob pre "${item?.name}". Dostupné: ${stock.available} ${item?.unit}, Požadované: ${v.quantity}`,
          `Nincs elegendő készlet a(z) "${item?.name}" termékből.`
        ));
        return;
      }
    }

    const docNum = `VYD-${new Date().getFullYear()}-${String(warehouseMovements.filter(m => m.type === "outward").length + 1).padStart(4, "0")}`;
    const movId = `mov-${Date.now()}`;

    let totalCost = 0;
    let totalSell = 0;

    const movementItems: WarehouseMovementItem[] = validItems.map((v, idx) => {
      const item = warehouseItems.find(i => i.id === v.itemId);
      const unitCost = item?.avgPurchasePrice || 0;
      const unitSell = Number(v.unitSellPrice) || 0;
      const lineCost = v.quantity * unitCost;
      const lineSell = v.quantity * unitSell;
      totalCost += lineCost;
      totalSell += lineSell;

      return {
        id: `mvi-${Date.now()}-${idx}`,
        movementId: movId,
        itemId: v.itemId,
        batchId: v.batchId || null,
        quantity: Number(v.quantity),
        unitPurchasePrice: unitCost,
        unitSellPrice: unitSell,
        totalPrice: lineSell,
        expirationDate: null,
        note: v.note || null
      };
    });

    const newMovement: WarehouseMovement = {
      id: movId,
      documentNumber: docNum,
      type: "outward",
      status: "confirmed",
      warehouseId: issueWarehouseId,
      targetWarehouseId: null,
      supplierId: null,
      leadId: issueLeadId || null,
      totalCostValue: totalCost,
      totalSellValue: totalSell,
      totalProfitValue: totalSell - totalCost,
      createdBy: currentUser.email,
      note: issueNote.trim() || null,
      fileName: null,
      filePath: null,
      issuedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      items: movementItems
    };

    // Update movements state
    setWarehouseMovements(prev => [newMovement, ...prev]);

    // Decrease physical stock
    validItems.forEach(v => {
      setWarehouseStock(prev => prev.map(s => s.warehouseId === issueWarehouseId && s.itemId === v.itemId ? {
        ...s,
        quantity: Math.max(0, s.quantity - Number(v.quantity))
      } : s));

      // If batch specified, decrease batch quantity
      if (v.batchId) {
        setWarehouseBatches(prev => prev.map(b => b.id === v.batchId ? {
          ...b,
          currentQuantity: Math.max(0, b.currentQuantity - Number(v.quantity))
        } : b));
      }
    });

    // Auto-log to Lead Timeline if requested
    if (issueLeadId && issueLogTimeline && onAddTimelineEvent) {
      const lead = leads.find(l => l.id === issueLeadId);
      const itemsSummary = validItems.map(v => {
        const it = warehouseItems.find(i => i.id === v.itemId);
        return `${v.quantity} ${it?.unit || "ks"} × ${it?.name || ""}`;
      }).join(", ");

      const timelineEvent = {
        id: `ev-${Date.now()}`,
        type: "delivery_note",
        timestamp: new Date().toISOString().slice(0, 16).replace("T", " "),
        title: `${t("Delivery Note", "Dodací list", "Szállítólevél")} ${docNum}`,
        content: `${t("Issued goods to client", "Vydaný materiál a tovar pre klienta", "Kiadott áru az ügyfélnek")}${lead?.name ? ` (${lead.name})` : ""}: ${itemsSummary}.\n${issueNote ? t("Note", "Poznámka", "Megjegyzés") + ": " + issueNote : ""}`,
        amount: totalSell,
        author: currentUser.name || currentUser.email
      };

      onAddTimelineEvent(issueLeadId, timelineEvent);
    }

    setIsIssueModalOpen(false);
    setIssueItems([{ itemId: warehouseItems[0]?.id || "", batchId: "", quantity: 1, unitSellPrice: warehouseItems[0]?.defaultSellPrice || 0, note: "" }]);
    setIssueNote("");
    setIssueLeadId("");
  };

  // Submit New Transfer (Prevodka - PRE)
  const handleCreateTransfer = () => {
    if (transferSourceWh === transferTargetWh) {
      alert(t("Source and Destination warehouses cannot be the same.", "Zdrojový a cieľový sklad nemôžu byť zhodné.", "A forrás- és célraktár nem lehet azonos."));
      return;
    }

    const validItems = transferItems.filter(it => it.itemId && it.quantity > 0);
    if (validItems.length === 0) {
      alert(t("Please add at least one item.", "Pridajte aspoň jednu položku.", "Kérjük, adjon hozzá legalább egy tételt."));
      return;
    }

    // Availability check in source warehouse
    for (const v of validItems) {
      const stock = getStockInfoForItem(v.itemId, transferSourceWh);
      if (v.quantity > stock.available) {
        const item = warehouseItems.find(i => i.id === v.itemId);
        alert(t(
          `Insufficient stock for "${item?.name}" in source warehouse. Available: ${stock.available} ${item?.unit}`,
          `Nedostatočný stav zásob pre "${item?.name}" v zdrojovom sklade. Dostupné: ${stock.available} ${item?.unit}`,
          `Nincs elegendő készlet a forrásraktárban.`
        ));
        return;
      }
    }

    const docNum = `PRE-${new Date().getFullYear()}-${String(warehouseMovements.filter(m => m.type === "transfer").length + 1).padStart(4, "0")}`;
    const movId = `mov-${Date.now()}`;

    let totalVal = 0;
    const movementItems: WarehouseMovementItem[] = validItems.map((v, idx) => {
      const item = warehouseItems.find(i => i.id === v.itemId);
      const unitCost = item?.avgPurchasePrice || 0;
      totalVal += v.quantity * unitCost;

      return {
        id: `mvi-${Date.now()}-${idx}`,
        movementId: movId,
        itemId: v.itemId,
        quantity: Number(v.quantity),
        unitPurchasePrice: unitCost,
        unitSellPrice: item?.defaultSellPrice || 0,
        totalPrice: v.quantity * unitCost,
        expirationDate: null,
        note: v.note || null
      };
    });

    const newMovement: WarehouseMovement = {
      id: movId,
      documentNumber: docNum,
      type: "transfer",
      status: "confirmed",
      warehouseId: transferSourceWh,
      targetWarehouseId: transferTargetWh,
      supplierId: null,
      leadId: null,
      totalCostValue: totalVal,
      totalSellValue: totalVal,
      totalProfitValue: 0,
      createdBy: currentUser.email,
      note: transferNote.trim() || null,
      fileName: null,
      filePath: null,
      issuedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      items: movementItems
    };

    setWarehouseMovements(prev => [newMovement, ...prev]);

    // Move stock from source to target
    validItems.forEach(v => {
      // Deduct source
      setWarehouseStock(prev => prev.map(s => s.warehouseId === transferSourceWh && s.itemId === v.itemId ? {
        ...s,
        quantity: Math.max(0, s.quantity - Number(v.quantity))
      } : s));

      // Add target
      setWarehouseStock(prev => {
        const exists = prev.some(s => s.warehouseId === transferTargetWh && s.itemId === v.itemId);
        if (exists) {
          return prev.map(s => s.warehouseId === transferTargetWh && s.itemId === v.itemId ? {
            ...s,
            quantity: s.quantity + Number(v.quantity)
          } : s);
        } else {
          return [...prev, {
            warehouseId: transferTargetWh,
            itemId: v.itemId,
            quantity: Number(v.quantity),
            reservedQuantity: 0,
            location: null
          }];
        }
      });
    });

    setIsTransferModalOpen(false);
    setTransferItems([{ itemId: warehouseItems[0]?.id || "", quantity: 1, note: "" }]);
    setTransferNote("");
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-900 to-indigo-950 flex items-center justify-center text-white shadow-md shadow-blue-950/20">
            <Package className="w-6 h-6 text-blue-200" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {t("Warehouse & Inventory Management", "Skladové hospodárstvo a zásoby", "Raktár és készletgazdálkodás")}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-200">
                1.8 Imbe
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {t("Catalog, Multi-Warehouse balances, WAP costing & FEFO lot tracking", "Katalóg tovaru, stavy skladov, vážené nákupné ceny a exspirácie", "Termékkatalóg, raktárkészletek, WAP önköltség és FEFO tételkövetés")}
            </p>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Warehouse Selector */}
          <div className="relative">
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="appearance-none bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-slate-700 text-xs font-semibold py-2 pl-3 pr-8 rounded-xl cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-blue-800"
            >
              <option value="all">{t("All Warehouses", "Všetky sklady", "Minden raktár")}</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={() => {
              setItemForm({
                name: "",
                sku: `SKU-${Date.now().toString().slice(-4)}`,
                barcode: "",
                category: allCategories[0] || "Materiál",
                unit: "ks",
                minStock: 10,
                optimalStock: 50,
                defaultLocation: "A-01-RACK",
                hasExpiration: false,
                imageUrl: "",
                defaultSellPrice: 0,
                avgPurchasePrice: 0,
                description: ""
              });
              setEditingItem(null);
              setIsItemModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>{t("New Item", "Nový tovar", "Új termék")}</span>
          </button>

          <button
            onClick={() => setIsReceiptModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>{t("Receipt (PRI)", "Príjemka (PRI)", "Bevételezés")}</span>
          </button>

          <button
            onClick={() => setIsIssueModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>{t("Issue (VYD)", "Výdajka (VYD)", "Kiadás")}</span>
          </button>

          <button
            onClick={() => setIsTransferModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200/80 text-slate-700 rounded-xl text-xs font-semibold transition"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>{t("Transfer", "Prevodka", "Átadás")}</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Inventory Valuation */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {t("Total Stock Value", "Hodnota zásob skladu (WAP)", "Készletérték")}
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
                {formatCurrency(metrics.totalValuation, systemLanguage, systemCurrency)}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{metrics.itemCount}</span> {t("products tracked", "sledovaných položiek", "nyilvántartott tétel")}
          </div>
        </div>

        {/* Card 2: Low Stock Alerts */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {t("Stock Health Alerts", "Nízky stav & Vypredané", "Alacsony készlet")}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                  {metrics.lowStockCount + metrics.outOfStockCount}
                </h3>
                {metrics.lowStockCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 animate-pulse">
                    {metrics.lowStockCount} {t("low", "nízke", "alacsony")}
                  </span>
                )}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <span>{metrics.outOfStockCount} {t("out of stock items", "položiek je kompletne vypredaných", "termék kifogyott")}</span>
          </div>
        </div>

        {/* Card 3: Monthly Movements Volume */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {t("Monthly Issues (Sales)", "Mesačný výdaj tovaru", "Havi kiadás")}
              </p>
              <h3 className="text-2xl font-black text-blue-900 mt-1 tracking-tight">
                {formatCurrency(metrics.monthlyOutward, systemLanguage, systemCurrency)}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>{t("Inward", "Príjem", "Bevételezés")}: {formatCurrency(metrics.monthlyInward, systemLanguage, systemCurrency)}</span>
          </div>
        </div>

        {/* Card 4: Gross Margin & Profit */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {t("Realized Profit & Margin", "Hrubý zisk a marža", "Bruttó árrés")}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <h3 className="text-2xl font-black text-emerald-600 tracking-tight">
                  +{formatCurrency(metrics.monthlyProfit, systemLanguage, systemCurrency)}
                </h3>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
            <span>{t("Avg. Margin", "Priem. marža", "Átlagos árrés")}: {metrics.averageMarginPercent.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Sub-Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab("items")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeSubTab === "items"
              ? "bg-blue-900 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60"
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>{t("Stock Catalog & Inventory", "Prehľad zásob a tovaru", "Készletnyilvántartás")}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeSubTab === "items" ? "bg-blue-800 text-blue-200" : "bg-slate-100 text-slate-600"}`}>
            {filteredItems.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab("movements")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeSubTab === "movements"
              ? "bg-blue-900 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60"
          }`}
        >
          <ArrowUpDown className="w-4 h-4" />
          <span>{t("Movements & Documents", "Pohyby a doklady", "Mozgások és bizonylatok")}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeSubTab === "movements" ? "bg-blue-800 text-blue-200" : "bg-slate-100 text-slate-600"}`}>
            {warehouseMovements.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab("suppliers")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeSubTab === "suppliers"
              ? "bg-blue-900 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60"
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>{t("Suppliers Directory", "Dodávatelia", "Beszállítók")}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeSubTab === "suppliers" ? "bg-blue-800 text-blue-200" : "bg-slate-100 text-slate-600"}`}>
            {suppliers.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab("batches")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeSubTab === "batches"
              ? "bg-blue-900 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60"
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>{t("Expiry & Batches (FEFO)", "Exspirácie a šarže", "Lejáratok és tételek")}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeSubTab === "batches" ? "bg-blue-800 text-blue-200" : "bg-slate-100 text-slate-600"}`}>
            {warehouseBatches.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab("analytics")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeSubTab === "analytics"
              ? "bg-blue-900 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>{t("Inventory Analytics", "Skladová analytika", "Készletelemzés")}</span>
        </button>
      </div>

      {/* TAB 1: STOCK CATALOG & INVENTORY */}
      {activeSubTab === "items" && (
        <div className="space-y-4">
          {/* Search & Filter bar */}
          <div className="flex flex-col sm:flex-row gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t("Search by product name, SKU or barcode...", "Hľadať podľa názvu, SKU alebo čiarového kódu...", "Keresés név, cikkszám vagy vonalkód alapján...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-800"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold py-2 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-800"
              >
                <option value="all">{t("All Categories", "Všetky kategórie", "Minden kategória")}</option>
                {allCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              {/* Stock Status Filter */}
              <select
                value={stockStatusFilter}
                onChange={(e: any) => setStockStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold py-2 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-800"
              >
                <option value="all">{t("All Stock Statuses", "Všetky stavy zásob", "Minden állapot")}</option>
                <option value="in_stock">{t("In Stock", "Na sklade", "Raktáron")}</option>
                <option value="low_stock">{t("Low Stock Alert", "Nízky stav zásob", "Alacsony készlet")}</option>
                <option value="out_of_stock">{t("Out of Stock", "Vypredané (0)", "Elfogyott")}</option>
              </select>
            </div>
          </div>

          {/* Items Data Grid */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-3 px-4">{t("Product & SKU", "Tovar & SKU", "Termék & Cikkszám")}</th>
                    <th className="py-3 px-4">{t("Category & Location", "Kategória & Pozícia", "Kategória & Hely")}</th>
                    <th className="py-3 px-4 text-right">{t("Physical Stock", "Fyzický stav", "Fizikai készlet")}</th>
                    <th className="py-3 px-4 text-right">{t("Reserved", "Rezervované", "Foglalt")}</th>
                    <th className="py-3 px-4 text-right">{t("Available", "K dispozícii", "Elérhető")}</th>
                    <th className="py-3 px-4 text-right">{t("WAP Purchase", "Nákup (WAP)", "Beszerzés (WAP)")}</th>
                    <th className="py-3 px-4 text-right">{t("Default Sell", "Predajná cena", "Eladási ár")}</th>
                    <th className="py-3 px-4 text-center">{t("Margin %", "Marža %", "Árrés %")}</th>
                    <th className="py-3 px-4 text-right">{t("Actions", "Akcie", "Műveletek")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold">{t("No products match the selected criteria.", "Žiadny tovar nevyhovuje zadaným filtrom.", "Nincs a feltételeknek megfelelő termék.")}</p>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map(item => {
                      const stock = getStockInfoForItem(item.id, selectedWarehouseId);
                      const isLow = stock.onHand > 0 && stock.onHand <= item.minStock;
                      const isOut = stock.onHand === 0;
                      const marginPct = item.defaultSellPrice > 0 
                        ? ((item.defaultSellPrice - item.avgPurchasePrice) / item.defaultSellPrice) * 100 
                        : 0;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition group">
                          {/* Product Info */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                                  <Package className="w-5 h-5" />
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900 group-hover:text-blue-900 transition">
                                    {item.name}
                                  </span>
                                  {item.hasExpiration && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200" title={t("Expiration tracked", "Sledovanie exspirácie", "Lejárat követve")}>
                                      FEFO
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400 font-mono">
                                  <span>{item.sku}</span>
                                  {item.barcode && (
                                    <>
                                      <span>&bull;</span>
                                      <span className="flex items-center gap-1"><Barcode className="w-3 h-3" />{item.barcode}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Category & Location */}
                          <td className="py-3 px-4">
                            <div>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                {item.category || t("General", "Všeobecné", "Általános")}
                              </span>
                              <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                <span>{stock.locations || item.defaultLocation || t("Unassigned", "Nepriradené", "Nincs")}</span>
                              </div>
                            </div>
                          </td>

                          {/* Physical Stock */}
                          <td className="py-3 px-4 text-right">
                            <div className="font-bold text-slate-900 text-sm">
                              {stock.onHand} <span className="text-xs font-normal text-slate-500">{item.unit}</span>
                            </div>
                            {isOut ? (
                              <span className="text-[10px] font-bold text-rose-600 uppercase">{t("Out of stock", "Vypredané", "Kifogyott")}</span>
                            ) : isLow ? (
                              <span className="text-[10px] font-bold text-amber-600">{t("Min", "Min", "Min")}: {item.minStock} {item.unit}</span>
                            ) : (
                              <span className="text-[10px] text-slate-400">{t("Optimal", "Optimum", "Optimális")}: {item.optimalStock} {item.unit}</span>
                            )}
                          </td>

                          {/* Reserved */}
                          <td className="py-3 px-4 text-right">
                            <span className="font-semibold text-slate-500">
                              {stock.reserved} <span className="text-[11px] font-normal">{item.unit}</span>
                            </span>
                          </td>

                          {/* Available */}
                          <td className="py-3 px-4 text-right">
                            <span className={`font-black text-sm ${stock.available > 0 ? "text-emerald-700" : "text-rose-600"}`}>
                              {stock.available} <span className="text-xs font-normal">{item.unit}</span>
                            </span>
                          </td>

                          {/* WAP Purchase */}
                          <td className="py-3 px-4 text-right">
                            <div className="font-semibold text-slate-900">
                              {formatCurrency(item.avgPurchasePrice, systemLanguage, systemCurrency)}
                            </div>
                            <span className="text-[10px] text-slate-400">{t("per", "za", "/")} {item.unit}</span>
                          </td>

                          {/* Default Sell */}
                          <td className="py-3 px-4 text-right">
                            <div className="font-bold text-blue-900">
                              {formatCurrency(item.defaultSellPrice, systemLanguage, systemCurrency)}
                            </div>
                            <span className="text-[10px] text-slate-400">{t("per", "za", "/")} {item.unit}</span>
                          </td>

                          {/* Margin % */}
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              marginPct >= 40
                                ? "bg-emerald-100 text-emerald-800"
                                : marginPct >= 20
                                ? "bg-blue-100 text-blue-800"
                                : "bg-slate-100 text-slate-700"
                            }`}>
                              {marginPct.toFixed(1)}%
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => {
                                  setEditingItem(item);
                                  setItemForm({
                                    name: item.name,
                                    sku: item.sku,
                                    barcode: item.barcode || "",
                                    category: item.category || "",
                                    unit: item.unit,
                                    minStock: item.minStock,
                                    optimalStock: item.optimalStock,
                                    defaultLocation: item.defaultLocation || "",
                                    hasExpiration: item.hasExpiration,
                                    imageUrl: item.imageUrl || "",
                                    defaultSellPrice: item.defaultSellPrice,
                                    avgPurchasePrice: item.avgPurchasePrice,
                                    description: item.description || ""
                                  });
                                  setIsItemModalOpen(true);
                                }}
                                className="p-1.5 text-slate-400 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition"
                                title={t("Edit Product", "Upraviť tovar", "Termék szerkesztése")}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MOVEMENTS & DOCUMENTS */}
      {activeSubTab === "movements" && (
        <div className="space-y-4">
          {/* Movement Type Filter */}
          <div className="flex flex-wrap items-center gap-2 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm">
            <button
              onClick={() => setMovementTypeFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                movementTypeFilter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t("All Documents", "Všetky doklady", "Minden bizonylat")}
            </button>
            <button
              onClick={() => setMovementTypeFilter("inward")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                movementTypeFilter === "inward" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>{t("Receipts (PRI)", "Príjemky (PRI)", "Bevételezések")}</span>
            </button>
            <button
              onClick={() => setMovementTypeFilter("outward")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                movementTypeFilter === "outward" ? "bg-blue-700 text-white" : "bg-blue-50 text-blue-700 hover:bg-blue-100"
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>{t("Issues (VYD)", "Výdajky (VYD)", "Kiadások")}</span>
            </button>
            <button
              onClick={() => setMovementTypeFilter("transfer")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                movementTypeFilter === "transfer" ? "bg-purple-700 text-white" : "bg-purple-50 text-purple-700 hover:bg-purple-100"
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>{t("Transfers (PRE)", "Prevodky (PRE)", "Átadás")}</span>
            </button>
          </div>

          {/* Movements Document Journal */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden divide-y divide-slate-100">
            {filteredMovements.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="font-semibold">{t("No movement documents found.", "Nenašli sa žiadne pohybové doklady.", "Nem találhatók bizonylatok.")}</p>
              </div>
            ) : (
              filteredMovements.map(mov => {
                const isExpanded = expandedMovementId === mov.id;
                const supplier = suppliers.find(s => s.id === mov.supplierId);
                const lead = leads.find(l => l.id === mov.leadId);
                const wh = warehouses.find(w => w.id === mov.warehouseId);
                const targetWh = warehouses.find(w => w.id === mov.targetWarehouseId);

                return (
                  <div key={mov.id} className="transition">
                    <div
                      onClick={() => setExpandedMovementId(isExpanded ? null : mov.id)}
                      className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/70"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          mov.type === "inward"
                            ? "bg-emerald-100 text-emerald-700"
                            : mov.type === "outward"
                            ? "bg-blue-100 text-blue-900"
                            : "bg-purple-100 text-purple-800"
                        }`}>
                          {mov.type === "inward" ? (
                            <ArrowDownLeft className="w-4 h-4" />
                          ) : mov.type === "outward" ? (
                            <ArrowUpRight className="w-4 h-4" />
                          ) : (
                            <ArrowLeftRight className="w-4 h-4" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 font-mono text-sm">{mov.documentNumber}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              mov.type === "inward"
                                ? "bg-emerald-100 text-emerald-800"
                                : mov.type === "outward"
                                ? "bg-blue-100 text-blue-900"
                                : "bg-purple-100 text-purple-800"
                            }`}>
                              {mov.type === "inward" ? t("Receipt", "Príjemka", "Bevétel") : mov.type === "outward" ? t("Issue", "Výdajka", "Kiadás") : t("Transfer", "Prevodka", "Átadás")}
                            </span>
                            <span className="text-xs text-slate-400">&bull;</span>
                            <span className="text-xs text-slate-500 font-mono">{mov.issuedAt}</span>
                          </div>

                          <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-2">
                            <span><strong>{t("Warehouse", "Sklad", "Raktár")}:</strong> {wh?.name || mov.warehouseId}</span>
                            {targetWh && <span>&rarr; {targetWh.name}</span>}
                            {supplier && (
                              <span>&bull; <strong>{t("Supplier", "Dodávateľ", "Szállító")}:</strong> {supplier.name}</span>
                            )}
                            {lead && (
                              <span>&bull; <strong>{t("Client", "Klient", "Ügyfél")}:</strong> {lead.name}</span>
                            )}
                            {mov.note && <span className="text-slate-400 italic">"{mov.note}"</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 ml-12 md:ml-0">
                        <div className="text-right">
                          <div className="font-black text-slate-900 text-sm">
                            {formatCurrency(mov.type === "inward" ? mov.totalCostValue : mov.totalSellValue, systemLanguage, systemCurrency)}
                          </div>
                          {mov.type === "outward" && (
                            <div className="text-[10px] text-emerald-600 font-semibold">
                              {t("Profit", "Zisk", "Haszon")}: +{formatCurrency(mov.totalProfitValue, systemLanguage, systemCurrency)}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMovementForPrint(mov);
                          }}
                          className="p-2 text-slate-400 hover:text-blue-900 hover:bg-blue-50 rounded-xl transition"
                          title={t("Print Document / Delivery Note", "Tlačiť doklad / Dodací list", "Nyomtatás")}
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        <div className="text-slate-400">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Line Items */}
                    {isExpanded && (
                      <div className="bg-slate-50/70 p-4 border-t border-slate-100">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                          {t("Movement Line Items", "Položky dokladu", "Tételek")}
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-400 text-[10px] uppercase font-bold">
                                <th className="py-2 px-2">{t("Item", "Tovar", "Termék")}</th>
                                <th className="py-2 px-2 text-right">{t("Quantity", "Množstvo", "Mennyiség")}</th>
                                <th className="py-2 px-2 text-right">{t("Unit Price", "Jedn. cena", "Egységár")}</th>
                                <th className="py-2 px-2 text-right">{t("Total Price", "Spolu cena", "Összérték")}</th>
                                <th className="py-2 px-2">{t("Batch / Note", "Šarža / Poznámka", "Tétel")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/60">
                              {mov.items.map(it => {
                                const prod = warehouseItems.find(p => p.id === it.itemId);
                                return (
                                  <tr key={it.id}>
                                    <td className="py-2 px-2 font-semibold text-slate-800">
                                      {prod?.name || it.itemId} <span className="text-[10px] text-slate-400 font-mono">({prod?.sku})</span>
                                    </td>
                                    <td className="py-2 px-2 text-right font-bold text-slate-900">
                                      {it.quantity} {prod?.unit || "ks"}
                                    </td>
                                    <td className="py-2 px-2 text-right font-mono text-slate-600">
                                      {formatCurrency(mov.type === "inward" ? it.unitPurchasePrice : it.unitSellPrice, systemLanguage, systemCurrency)}
                                    </td>
                                    <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">
                                      {formatCurrency(it.totalPrice, systemLanguage, systemCurrency)}
                                    </td>
                                    <td className="py-2 px-2 text-slate-500">
                                      {it.batchId && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-mono mr-2">{it.batchId}</span>}
                                      {it.note && <span className="italic">{it.note}</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SUPPLIERS DIRECTORY */}
      {activeSubTab === "suppliers" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {t("B2B Suppliers Directory", "Adresár dodávateľov a partnerov", "Beszállítói címtár")}
              </h3>
              <p className="text-xs text-slate-500">
                {t("Manage supplier contacts, invoicing data, and payment conditions", "Správa kontaktných osôb, fakturačných údajov a splatností", "Szállítói adatok és fizetési feltételek")}
              </p>
            </div>

            <button
              onClick={() => {
                setEditingSupplier(null);
                setSupplierForm({
                  name: "",
                  companyId: "",
                  taxId: "",
                  vatId: "",
                  street: "",
                  city: "",
                  postalCode: "",
                  country: "Slovakia",
                  email: "",
                  phone: "",
                  website: "",
                  iban: "",
                  swift: "",
                  paymentDueDays: 14,
                  notes: "",
                  contacts: [{ name: "", position: "", phone: "", email: "" }]
                });
                setIsSupplierModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-semibold transition"
            >
              <Plus className="w-4 h-4" />
              <span>{t("New Supplier", "Pridať dodávateľa", "Új beszállító")}</span>
            </button>
          </div>

          {/* Suppliers Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map(sup => (
              <div key={sup.id} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center font-bold text-sm">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{sup.name}</h4>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          IČO: {sup.companyId || "—"} {sup.vatId ? `• ${sup.vatId}` : ""}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setEditingSupplier(sup);
                        setSupplierForm({
                          name: sup.name,
                          companyId: sup.companyId || "",
                          taxId: sup.taxId || "",
                          vatId: sup.vatId || "",
                          street: sup.street || "",
                          city: sup.city || "",
                          postalCode: sup.postalCode || "",
                          country: sup.country || "Slovakia",
                          email: sup.email || "",
                          phone: sup.phone || "",
                          website: sup.website || "",
                          iban: sup.iban || "",
                          swift: sup.swift || "",
                          paymentDueDays: sup.paymentDueDays || 14,
                          notes: sup.notes || "",
                          contacts: sup.contacts?.length
                            ? sup.contacts.map(c => ({ name: c.name, position: c.position || "", phone: c.phone || "", email: c.email || "" }))
                            : [{ name: "", position: "", phone: "", email: "" }]
                        });
                        setIsSupplierModalOpen(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                    {sup.city && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{sup.street}, {sup.postalCode} {sup.city}</span>
                      </div>
                    )}
                    {sup.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <a href={`mailto:${sup.email}`} className="text-blue-900 hover:underline">{sup.email}</a>
                      </div>
                    )}
                    {sup.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{sup.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Contacts List */}
                  {sup.contacts && sup.contacts.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        {t("Contact Persons", "Kontaktné osoby", "Kapcsolattartók")}
                      </p>
                      <div className="space-y-1">
                        {sup.contacts.map((c, i) => (
                          <div key={i} className="text-xs flex items-center justify-between text-slate-700 bg-slate-50 p-1.5 rounded-lg">
                            <span className="font-semibold">{c.name} {c.position && <span className="font-normal text-slate-400">({c.position})</span>}</span>
                            <span className="text-[11px] text-slate-500 font-mono">{c.phone || c.email}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span>{t("Payment terms", "Splatnosť", "Fizetési határid")}: <strong>{sup.paymentDueDays} {t("days", "dní", "nap")}</strong></span>
                  <span className="text-[11px] font-mono">{sup.country}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: EXPIRY & BATCH TRACKER (FEFO) */}
      {activeSubTab === "batches" && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {t("Lot & Expiration Tracking (FEFO)", "Sledovanie šarží a exspirácií (FEFO)", "Lejáratok és tételek")}
              </h3>
              <p className="text-xs text-slate-500">
                {t("First-Expired, First-Out matrix for chemical products, adhesives and sealants", "Metodika First-Expired, First-Out pre chémiu, lepidlá a tmelové hmoty", "FEFO nyilvántartás")}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3 px-4">{t("Status", "Stav", "Állapot")}</th>
                  <th className="py-3 px-4">{t("Batch #", "Číslo šarže", "Tételszám")}</th>
                  <th className="py-3 px-4">{t("Product", "Tovar", "Termék")}</th>
                  <th className="py-3 px-4">{t("Warehouse", "Sklad", "Raktár")}</th>
                  <th className="py-3 px-4">{t("Expiration Date", "Dátum exspirácie", "Lejárati dátum")}</th>
                  <th className="py-3 px-4 text-right">{t("Remaining Quantity", "Zostatok na sklade", "Készlet")}</th>
                  <th className="py-3 px-4 text-right">{t("Purchase Cost", "Nákupná cena", "Beszerzési ár")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batchesWithStatus.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold">{t("No batch-tracked products registered.", "Žiadne šaržované produkty nie sú zaevidované.", "Nincsenek tételes termékek.")}</p>
                    </td>
                  </tr>
                ) : (
                  batchesWithStatus.map(batch => (
                    <tr key={batch.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4">
                        {batch.status === "expired" ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1 w-fit">
                            <AlertCircle className="w-3 h-3" /> {t("EXPIRED", "EXSPIROVANÉ", "LEJÁRT")}
                          </span>
                        ) : batch.status === "warning" ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1 w-fit">
                            <AlertTriangle className="w-3 h-3" /> {t("Expiring Soon", "Blíži sa exspirácia", "Hamarosan lejár")} ({batch.diffDays} {t("days", "dní", "nap")})
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3 h-3" /> {t("OK", "V poriadku", "Rendben")}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {batch.batchNumber}
                      </td>

                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {batch.itemName} <span className="text-slate-400 font-mono text-[10px]">({batch.itemSku})</span>
                      </td>

                      <td className="py-3 px-4 text-slate-600">
                        {batch.warehouseName}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {batch.expirationDate}
                      </td>

                      <td className="py-3 px-4 text-right font-black text-slate-900 text-sm">
                        {batch.currentQuantity} <span className="text-xs font-normal text-slate-500">{batch.itemUnit}</span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-slate-700">
                        {formatCurrency(batch.purchasePrice, systemLanguage, systemCurrency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: INVENTORY ANALYTICS */}
      {activeSubTab === "analytics" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top 5 Most Sold Products */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-blue-900" />
              <h3 className="font-bold text-slate-900 text-sm">
                {t("Top Selling Products by Revenue", "Najpredávanejší tovar podľa obratu", "Legjobban fogyó termékek")}
              </h3>
            </div>

            <div className="space-y-3">
              {warehouseItems.slice(0, 5).map((item, i) => {
                const soldQty = 12 + (5 - i) * 6;
                const revenue = soldQty * (item.defaultSellPrice || 0);

                return (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80 border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-blue-900 text-white flex items-center justify-center font-bold text-xs">
                        #{i + 1}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs">{item.name}</h4>
                        <span className="text-[10px] text-slate-400 font-mono">{item.sku} &bull; {soldQty} {item.unit} {t("issued", "vydaných", "kiadva")}</span>
                      </div>
                    </div>

                    <div className="text-right font-black text-slate-900 text-xs">
                      {formatCurrency(revenue, systemLanguage, systemCurrency)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Category Valuation Breakdown */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-5 h-5 text-indigo-900" />
              <h3 className="font-bold text-slate-900 text-sm">
                {t("Inventory Valuation by Category", "Hodnota zásob podľa kategórií", "Készletérték kategóriák szerint")}
              </h3>
            </div>

            <div className="space-y-3">
              {allCategories.map(cat => {
                let catVal = 0;
                warehouseItems.filter(it => it.category === cat).forEach(it => {
                  const s = getStockInfoForItem(it.id);
                  catVal += s.onHand * it.avgPurchasePrice;
                });
                const pct = metrics.totalValuation > 0 ? (catVal / metrics.totalValuation) * 100 : 0;

                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">{cat}</span>
                      <span className="font-bold text-slate-900">{formatCurrency(catVal, systemLanguage, systemCurrency)} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-blue-900 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD / EDIT PRODUCT */}
      {/* ========================================================================= */}
      {isItemModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-900 text-white flex items-center justify-center">
                  <Package className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">
                  {editingItem ? t("Edit Product", "Upraviť tovar", "Termék szerkesztése") : t("New Product / Material", "Nový tovar / materiál", "Új termék / alapanyag")}
                </h3>
              </div>
              <button
                onClick={() => setIsItemModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Product Name", "Názov tovaru / materiálu", "Terméknév")} *
                  </label>
                  <input
                    type="text"
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                    placeholder="napr. Calacatta Gold Quartz doska 20mm"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    SKU {t("Code", "Kód", "Kód")} *
                  </label>
                  <input
                    type="text"
                    value={itemForm.sku}
                    onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })}
                    placeholder="SKU-CQ-01"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Barcode / EAN", "Čiarový kód / EAN", "Vonalkód")}
                  </label>
                  <input
                    type="text"
                    value={itemForm.barcode}
                    onChange={(e) => setItemForm({ ...itemForm, barcode: e.target.value })}
                    placeholder="858800123401"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Category", "Kategória", "Kategória")}
                  </label>
                  <input
                    type="text"
                    value={itemForm.category}
                    onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                    placeholder="Veľkoformátové dosky"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Unit of Measure", "Merná jednotka (MJ)", "Mértékegység")}
                  </label>
                  <select
                    value={itemForm.unit}
                    onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-semibold focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  >
                    <option value="ks">ks (Kusy)</option>
                    <option value="m²">m² (Štvorcové metre)</option>
                    <option value="bm">bm (Bežné metre)</option>
                    <option value="m³">m³ (Kubické metre)</option>
                    <option value="kg">kg (Kilogramy)</option>
                    <option value="l">l (Litre)</option>
                    <option value="balenie">balenie (Balenia)</option>
                    <option value="paleta">paleta (Palety)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Average Purchase Price (WAP)", "Priemerná nákupná cena (WAP)", "Átlagos beszerzési ár")}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={itemForm.avgPurchasePrice}
                    onChange={(e) => setItemForm({ ...itemForm, avgPurchasePrice: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Default Selling Price", "Predvolená predajná cena", "Alapértelmezett eladási ár")}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={itemForm.defaultSellPrice}
                    onChange={(e) => setItemForm({ ...itemForm, defaultSellPrice: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-blue-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Minimum Stock Alert", "Minimálny limit zásob", "Minimális készlet")}
                  </label>
                  <input
                    type="number"
                    value={itemForm.minStock}
                    onChange={(e) => setItemForm({ ...itemForm, minStock: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Default Storage Location / Rack", "Skladová pozícia / Regál", "Raktári hely")}
                  </label>
                  <input
                    type="text"
                    value={itemForm.defaultLocation}
                    onChange={(e) => setItemForm({ ...itemForm, defaultLocation: e.target.value })}
                    placeholder="A-01-RACK"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Product Image URL", "URL obrázka produktu", "Termékkép URL")}
                  </label>
                  <input
                    type="text"
                    value={itemForm.imageUrl}
                    onChange={(e) => setItemForm({ ...itemForm, imageUrl: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2.5 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <input
                      type="checkbox"
                      checked={itemForm.hasExpiration}
                      onChange={(e) => setItemForm({ ...itemForm, hasExpiration: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-900 focus:ring-blue-900"
                    />
                    <div>
                      <span className="font-bold text-xs text-slate-800">
                        {t("Track Expiration Dates & Batches (FEFO)", "Sledovať šarže a dátumy exspirácie (FEFO)", "Lejárati idők és tételek követése")}
                      </span>
                      <p className="text-[11px] text-slate-500">
                        {t("Enables lot numbers and expiration alerts for chemicals and adhesives", "Aktivuje zadávanie šarží a stráženie trvanlivosti pre stavebnú chémiu a lepidlá", "Tételszám és lejárati idő rögzítése")}
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsItemModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
              <button
                onClick={handleSaveItem}
                className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                {editingItem ? t("Save Changes", "Uložiť zmeny", "Mentés") : t("Create Product", "Vytvoriť položku", "Létrehozás")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: NEW RECEIPT (PRÍJEMKA - PRI) */}
      {/* ========================================================================= */}
      {isReceiptModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                  <ArrowDownLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {t("New Goods Receipt (Príjemka - PRI)", "Príjem tovaru a materiálu (Príjemka)", "Új bevételezés (PRI)")}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t("Incoming shipment from supplier. Automatically recalculates WAP cost.", "Príjem od dodávateľa. Automaticky prepočítava vážený nákupný priemer (WAP).", "Beszállítói bevételezés.")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Destination Warehouse", "Cieľový sklad príjmu", "Célraktár")} *
                  </label>
                  <select
                    value={receiptWarehouseId}
                    onChange={(e) => setReceiptWarehouseId(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Supplier", "Dodávateľ", "Beszállító")} *
                  </label>
                  <select
                    value={receiptSupplierId}
                    onChange={(e) => setReceiptSupplierId(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  >
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} (IČO: {s.companyId || "—"})</option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Note / Supplier Invoice Number", "Poznámka / Číslo dodacieho listu či faktúry", "Megjegyzés / Számlaszám")}
                  </label>
                  <input
                    type="text"
                    value={receiptNote}
                    onChange={(e) => setReceiptNote(e.target.value)}
                    placeholder="napr. Dodávka podľa fa FA260012, vodič Martin"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {t("Receipt Line Items", "Prijímané položky", "Tételek")}
                  </label>
                  <button
                    type="button"
                    onClick={() => setReceiptItems([...receiptItems, { itemId: warehouseItems[0]?.id || "", quantity: 1, unitPurchasePrice: warehouseItems[0]?.avgPurchasePrice || 0, batchNumber: "", expirationDate: "", note: "" }])}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t("Add Row", "Pridať položku", "Sor hozzáadása")}</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {receiptItems.map((row, idx) => {
                    const selItem = warehouseItems.find(i => i.id === row.itemId);
                    return (
                      <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <div className="sm:col-span-2">
                            <select
                              value={row.itemId}
                              onChange={(e) => {
                                const it = warehouseItems.find(i => i.id === e.target.value);
                                const updated = [...receiptItems];
                                updated[idx].itemId = e.target.value;
                                updated[idx].unitPurchasePrice = it?.avgPurchasePrice || 0;
                                setReceiptItems(updated);
                              }}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                            >
                              {warehouseItems.map(it => (
                                <option key={it.id} value={it.id}>{it.name} ({it.sku})</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={row.quantity}
                                onChange={(e) => {
                                  const updated = [...receiptItems];
                                  updated[idx].quantity = Number(e.target.value);
                                  setReceiptItems(updated);
                                }}
                                placeholder="Množstvo"
                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                              />
                              <span className="text-[11px] text-slate-400 font-semibold">{selItem?.unit || "ks"}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.unitPurchasePrice}
                              onChange={(e) => {
                                const updated = [...receiptItems];
                                updated[idx].unitPurchasePrice = Number(e.target.value);
                                setReceiptItems(updated);
                              }}
                              placeholder="Nákupná cena"
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-emerald-800"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (receiptItems.length > 1) {
                                  setReceiptItems(receiptItems.filter((_, i) => i !== idx));
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Batch row if expiration enabled */}
                        {selItem?.hasExpiration && (
                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
                            <div>
                              <input
                                type="text"
                                value={row.batchNumber}
                                onChange={(e) => {
                                  const updated = [...receiptItems];
                                  updated[idx].batchNumber = e.target.value;
                                  setReceiptItems(updated);
                                }}
                                placeholder="Číslo šarže (napr. BAT-2026-001)"
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-mono"
                              />
                            </div>
                            <div>
                              <input
                                type="date"
                                value={row.expirationDate}
                                onChange={(e) => {
                                  const updated = [...receiptItems];
                                  updated[idx].expirationDate = e.target.value;
                                  setReceiptItems(updated);
                                }}
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px]"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
              <button
                onClick={handleCreateReceipt}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t("Confirm Receipt & Update Stock", "Potvrdiť príjemku a naskladniť", "Bevételezés jóváhagyása")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: NEW ISSUE (VÝDAJKA - VYD) */}
      {/* ========================================================================= */}
      {isIssueModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-700 text-white flex items-center justify-center">
                  <ArrowUpRight className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {t("New Goods Issue (Výdajka - VYD)", "Výdaj tovaru a materiálu (Výdajka)", "Új kiadás (VYD)")}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t("Dispatch goods to client / production. Validates available stock.", "Vydanie zákazníkovi alebo do výroby s kontrolou voľného stavu zásob.", "Kiadás az ügyfélnek.")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsIssueModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Source Warehouse", "Zdrojový sklad výdaja", "Forrásraktár")} *
                  </label>
                  <select
                    value={issueWarehouseId}
                    onChange={(e) => setIssueWarehouseId(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-700 focus:outline-none"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Client / Lead from CRM", "Klient / Zákazka z CRM", "Ügyfél / Érdeklődő")}
                  </label>
                  <select
                    value={issueLeadId}
                    onChange={(e) => setIssueLeadId(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-700 focus:outline-none"
                  >
                    <option value="">{t("Direct Sale / Unassigned Client", "Priamy predaj / Bez priradenia", "Közvetlen eladás")}</option>
                    {leads.map(l => (
                      <option key={l.id} value={l.id}>{l.name} ({l.city})</option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Note / Delivery Purpose", "Poznámka k výdaju / Zákazka", "Megjegyzés")}
                  </label>
                  <input
                    type="text"
                    value={issueNote}
                    onChange={(e) => setIssueNote(e.target.value)}
                    placeholder="napr. Kuchynská pracovná doska a lepidlá pre montáž"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-700 focus:outline-none"
                  />
                </div>

                {issueLeadId && (
                  <div className="sm:col-span-2">
                    <label className="flex items-center gap-2.5 cursor-pointer bg-blue-50/70 p-3 rounded-xl border border-blue-200">
                      <input
                        type="checkbox"
                        checked={issueLogTimeline}
                        onChange={(e) => setIssueLogTimeline(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-900 focus:ring-blue-900"
                      />
                      <div>
                        <span className="font-bold text-xs text-blue-900">
                          {t("Automatically record Delivery Note into Client's Timeline", "Automaticky zaznamenať dodací list do časovej osi klienta", "Szállítólevél automatikus rögzítése az ügyfélnél")}
                        </span>
                        <p className="text-[11px] text-blue-700">
                          {t("Attaches the issued goods list directly to this deal's history", "Pripojí súpis vydaného materiálu priamo k histórii tohto leadu", "Csatolja a kiadott tételeket az előzményekhez")}
                        </p>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {t("Issued Line Items", "Vydávané položky", "Kiadott tételek")}
                  </label>
                  <button
                    type="button"
                    onClick={() => setIssueItems([...issueItems, { itemId: warehouseItems[0]?.id || "", batchId: "", quantity: 1, unitSellPrice: warehouseItems[0]?.defaultSellPrice || 0, note: "" }])}
                    className="text-xs font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t("Add Row", "Pridať položku", "Sor hozzáadása")}</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {issueItems.map((row, idx) => {
                    const selItem = warehouseItems.find(i => i.id === row.itemId);
                    const stock = getStockInfoForItem(row.itemId, issueWarehouseId);
                    const itemBatches = warehouseBatches.filter(b => b.itemId === row.itemId && b.warehouseId === issueWarehouseId && b.currentQuantity > 0);

                    return (
                      <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <div className="sm:col-span-2">
                            <select
                              value={row.itemId}
                              onChange={(e) => {
                                const it = warehouseItems.find(i => i.id === e.target.value);
                                const updated = [...issueItems];
                                updated[idx].itemId = e.target.value;
                                updated[idx].unitSellPrice = it?.defaultSellPrice || 0;
                                setIssueItems(updated);
                              }}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                            >
                              {warehouseItems.map(it => (
                                <option key={it.id} value={it.id}>{it.name} ({it.sku})</option>
                              ))}
                            </select>
                            <div className="text-[10px] text-slate-400 mt-1">
                              {t("Available", "Dostupné", "Elérhető")}: <strong className="text-emerald-700">{stock.available} {selItem?.unit}</strong>
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                max={stock.available}
                                value={row.quantity}
                                onChange={(e) => {
                                  const updated = [...issueItems];
                                  updated[idx].quantity = Number(e.target.value);
                                  setIssueItems(updated);
                                }}
                                placeholder="Množstvo"
                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                              />
                              <span className="text-[11px] text-slate-400 font-semibold">{selItem?.unit || "ks"}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.unitSellPrice}
                              onChange={(e) => {
                                const updated = [...issueItems];
                                updated[idx].unitSellPrice = Number(e.target.value);
                                setIssueItems(updated);
                              }}
                              placeholder="Predajná cena"
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-blue-900"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (issueItems.length > 1) {
                                  setIssueItems(issueItems.filter((_, i) => i !== idx));
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Batch selector if batches available */}
                        {itemBatches.length > 0 && (
                          <div className="pt-1 border-t border-slate-200/60 flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">{t("Pick Batch (FEFO)", "Vybrať šaržu", "Tétel kiválasztása")}:</span>
                            <select
                              value={row.batchId}
                              onChange={(e) => {
                                const updated = [...issueItems];
                                updated[idx].batchId = e.target.value;
                                setIssueItems(updated);
                              }}
                              className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-mono font-semibold"
                            >
                              <option value="">{t("Auto-select earliest expiration (FEFO)", "Automaticky najskoršia exspirácia (FEFO)", "Legkorábbi lejárat")}</option>
                              {itemBatches.map(b => (
                                <option key={b.id} value={b.id}>{b.batchNumber} (Exp: {b.expirationDate}, {b.currentQuantity} {selItem?.unit})</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsIssueModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
              <button
                onClick={handleCreateIssue}
                className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t("Confirm Issue & Deduct Stock", "Potvrdiť výdajku a vyskladniť", "Kiadás jóváhagyása")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: NEW TRANSFER (PREVODKA - PRE) */}
      {/* ========================================================================= */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-700 text-white flex items-center justify-center">
                  <ArrowLeftRight className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {t("Warehouse Transfer (Prevodka - PRE)", "Medziskladový presun (Prevodka)", "Raktárközi átadás")}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t("Relocate goods between your physical warehouses", "Presun tovaru a materiálu medzi pobočkami", "Átadás raktárak között")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Source Warehouse (From)", "Zdrojový sklad (Odkiaľ)", "Forrásraktár")} *
                  </label>
                  <select
                    value={transferSourceWh}
                    onChange={(e) => setTransferSourceWh(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-purple-700 focus:outline-none"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Destination Warehouse (To)", "Cieľový sklad (Kam)", "Célraktár")} *
                  </label>
                  <select
                    value={transferTargetWh}
                    onChange={(e) => setTransferTargetWh(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-purple-700 focus:outline-none"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Transfer Reason / Note", "Dôvod presunu / Poznámka", "Megjegyzés")}
                  </label>
                  <input
                    type="text"
                    value={transferNote}
                    onChange={(e) => setTransferNote(e.target.value)}
                    placeholder="napr. Závoz materiálu na výrobnú pobočku Trnava"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-purple-700 focus:outline-none"
                  />
                </div>
              </div>

              {/* Transfer items list */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {t("Items to Relocate", "Presúvané položky", "Átadott tételek")}
                  </label>
                  <button
                    type="button"
                    onClick={() => setTransferItems([...transferItems, { itemId: warehouseItems[0]?.id || "", quantity: 1, note: "" }])}
                    className="text-xs font-bold text-purple-700 hover:text-purple-800 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t("Add Row", "Pridať položku", "Sor hozzáadása")}</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {transferItems.map((row, idx) => {
                    const selItem = warehouseItems.find(i => i.id === row.itemId);
                    const stock = getStockInfoForItem(row.itemId, transferSourceWh);

                    return (
                      <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
                        <div className="flex-1">
                          <select
                            value={row.itemId}
                            onChange={(e) => {
                              const updated = [...transferItems];
                              updated[idx].itemId = e.target.value;
                              setTransferItems(updated);
                            }}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                          >
                            {warehouseItems.map(it => (
                              <option key={it.id} value={it.id}>{it.name} ({it.sku})</option>
                            ))}
                          </select>
                        </div>

                        <div className="w-32 flex items-center gap-1">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            max={stock.available}
                            value={row.quantity}
                            onChange={(e) => {
                              const updated = [...transferItems];
                              updated[idx].quantity = Number(e.target.value);
                              setTransferItems(updated);
                            }}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                          />
                          <span className="text-[11px] text-slate-400 font-semibold">{selItem?.unit || "ks"}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (transferItems.length > 1) {
                              setTransferItems(transferItems.filter((_, i) => i !== idx));
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
              <button
                onClick={handleCreateTransfer}
                className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t("Confirm Transfer", "Potvrdiť prevodku", "Átadás jóváhagyása")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: NEW / EDIT SUPPLIER */}
      {/* ========================================================================= */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-900 text-white flex items-center justify-center">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {editingSupplier ? t("Edit Supplier", "Upraviť dodávateľa", "Beszállító szerkesztése") : t("New Supplier", "Nový dodávateľ", "Új beszállító")}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t("Enter IČO to auto-fill invoicing details from business register", "Zadajte IČO pre automatické načítanie údajov z ARES", "Adószám megadása az automatikus kitöltéshez")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSupplierModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    IČO {t("(Company Registration #)", "(Identifikačné číslo)", "(Cégjegyzékszám)")}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={supplierForm.companyId}
                      onChange={(e) => setSupplierForm({ ...supplierForm, companyId: e.target.value })}
                      placeholder="napr. 48123456"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={isAresLoading}
                      onClick={() => handleFetchAres(supplierForm.companyId)}
                      className="px-3.5 py-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition"
                    >
                      {isAresLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      <span>{t("ARES Fill", "Načítať z ARES", "ARES kitöltés")}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Payment Due Days", "Splatnosť faktúr", "Fizetési határid")}
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={supplierForm.paymentDueDays}
                      onChange={(e) => setSupplierForm({ ...supplierForm, paymentDueDays: Number(e.target.value) })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    />
                    <span className="text-xs text-slate-400 font-semibold">{t("days", "dní", "nap")}</span>
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Company Name", "Obchodné meno dodávateľa", "Cégnév")} *
                  </label>
                  <input
                    type="text"
                    value={supplierForm.name}
                    onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                    placeholder="Laminam Slovakia s.r.o."
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    DIČ
                  </label>
                  <input
                    type="text"
                    value={supplierForm.taxId}
                    onChange={(e) => setSupplierForm({ ...supplierForm, taxId: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    IČ DPH (VAT ID)
                  </label>
                  <input
                    type="text"
                    value={supplierForm.vatId}
                    onChange={(e) => setSupplierForm({ ...supplierForm, vatId: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Country", "Krajina", "Ország")}
                  </label>
                  <input
                    type="text"
                    value={supplierForm.country}
                    onChange={(e) => setSupplierForm({ ...supplierForm, country: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Street & Number", "Ulica a číslo", "Utca, házszám")}
                  </label>
                  <input
                    type="text"
                    value={supplierForm.street}
                    onChange={(e) => setSupplierForm({ ...supplierForm, street: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("City & Postal Code", "Mesto & PSČ", "Város")}
                  </label>
                  <input
                    type="text"
                    value={supplierForm.city}
                    onChange={(e) => setSupplierForm({ ...supplierForm, city: e.target.value })}
                    placeholder="Bratislava"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Email", "Email", "E-mail")}
                  </label>
                  <input
                    type="email"
                    value={supplierForm.email}
                    onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Phone", "Telefón", "Telefonszám")}
                  </label>
                  <input
                    type="text"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    IBAN
                  </label>
                  <input
                    type="text"
                    value={supplierForm.iban}
                    onChange={(e) => setSupplierForm({ ...supplierForm, iban: e.target.value })}
                    placeholder="SK89 0200..."
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsSupplierModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
              <button
                onClick={handleSaveSupplier}
                className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                {editingSupplier ? t("Save Changes", "Uložiť zmeny", "Mentés") : t("Create Supplier", "Vytvoriť dodávateľa", "Létrehozás")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: PRINT / VIEW DOCUMENT PREVIEW */}
      {/* ========================================================================= */}
      {selectedMovementForPrint && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl border border-slate-100 my-8 text-slate-800">
            {/* Document Header */}
            <div className="flex items-start justify-between pb-6 border-b border-slate-200">
              <div>
                <span className="text-[10px] font-black tracking-wider uppercase text-slate-400 font-mono">
                  CCRM WAREHOUSE NODE
                </span>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                  {selectedMovementForPrint.type === "inward"
                    ? t("PRÍJEMKA TOVARU", "PRÍJEMKA TOVARU", "BEVÉTELEZÉSI BIZONYLAT")
                    : selectedMovementForPrint.type === "outward"
                    ? t("DODACÍ LIST / VÝDAJKA", "DODACÍ LIST / VÝDAJKA", "SZÁLLÍTÓLEVÉL / KIADÁS")
                    : t("PREVODKA", "PREVODKA", "ÁTADÁSI BIZONYLAT")}
                </h2>
                <div className="text-sm font-mono font-bold text-blue-900 mt-1">
                  {selectedMovementForPrint.documentNumber}
                </div>
              </div>

              <div className="text-right text-xs">
                <div className="font-bold text-slate-900">{t("Date", "Dátum", "Dátum")}: {selectedMovementForPrint.issuedAt}</div>
                <div className="text-slate-400 mt-1">{t("Author", "Vystavil", "Kiállította")}: {selectedMovementForPrint.createdBy}</div>
              </div>
            </div>

            {/* Document Body Partner */}
            <div className="grid grid-cols-2 gap-6 my-6 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">{t("Source / Warehouse", "Skladové pracovisko", "Raktár")}</span>
                <div className="font-bold text-slate-900 text-sm mt-1">
                  {warehouses.find(w => w.id === selectedMovementForPrint.warehouseId)?.name || selectedMovementForPrint.warehouseId}
                </div>
                <div className="text-slate-500 mt-0.5">
                  {warehouses.find(w => w.id === selectedMovementForPrint.warehouseId)?.address || "CCRM Sklad"}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  {selectedMovementForPrint.type === "inward" ? t("Supplier", "Dodávateľ", "Beszállító") : t("Customer / Recipient", "Odberateľ / Zákazník", "Ügyfél")}
                </span>
                <div className="font-bold text-slate-900 text-sm mt-1">
                  {selectedMovementForPrint.supplierId
                    ? suppliers.find(s => s.id === selectedMovementForPrint.supplierId)?.name
                    : selectedMovementForPrint.leadId
                    ? leads.find(l => l.id === selectedMovementForPrint.leadId)?.name
                    : t("Internal Movement", "Interný prevod / Priamy výdaj", "Belső mozgatás")}
                </div>
                <div className="text-slate-500 mt-0.5">
                  {selectedMovementForPrint.note || t("Confirmed delivery note", "Potvrdený dodací doklad", "Szállítólevél")}
                </div>
              </div>
            </div>

            {/* Document Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden mb-6">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">{t("Product Item", "Názov položky tovaru", "Tétel")}</th>
                    <th className="py-2.5 px-3 text-right">{t("Quantity", "Množstvo", "Mennyiség")}</th>
                    <th className="py-2.5 px-3 text-right">{t("Unit Price", "Jedn. cena", "Egységár")}</th>
                    <th className="py-2.5 px-3 text-right">{t("Total", "Spolu", "Összesen")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedMovementForPrint.items.map((it, idx) => {
                    const p = warehouseItems.find(item => item.id === it.itemId);
                    return (
                      <tr key={it.id}>
                        <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {p?.name || it.itemId} {p?.sku && <span className="text-slate-400 font-mono text-[10px]">({p.sku})</span>}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {it.quantity} {p?.unit || "ks"}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {formatCurrency(selectedMovementForPrint.type === "inward" ? it.unitPurchasePrice : it.unitSellPrice, systemLanguage, systemCurrency)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                          {formatCurrency(it.totalPrice, systemLanguage, systemCurrency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Total Value */}
            <div className="flex justify-end p-3 bg-slate-50 rounded-xl border border-slate-200 mb-8">
              <div className="text-right">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-3">{t("Total Document Value", "Celková hodnota dokladu", "Összérték")}:</span>
                <span className="text-xl font-black text-blue-900 font-mono">
                  {formatCurrency(selectedMovementForPrint.type === "inward" ? selectedMovementForPrint.totalCostValue : selectedMovementForPrint.totalSellValue, systemLanguage, systemCurrency)}
                </span>
              </div>
            </div>

            {/* Signature fields */}
            <div className="grid grid-cols-2 gap-12 pt-6 border-t border-slate-200 text-xs text-center text-slate-400">
              <div>
                <div className="border-b border-slate-300 pb-8 mb-1" />
                <span>{t("Issued by (Signature)", "Vyskladnil / Vystavil (Podpis)", "Kiállította")}</span>
              </div>
              <div>
                <div className="border-b border-slate-300 pb-8 mb-1" />
                <span>{t("Received by (Signature)", "Prevzal / Zákazník (Podpis)", "Átvette")}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-8 flex items-center justify-end gap-3 print:hidden">
              <button
                onClick={() => setSelectedMovementForPrint(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                {t("Close", "Zavrieť", "Bezárás")}
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>{t("Print Delivery Note", "Tlačiť dodací list", "Nyomtatás")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WarehouseView;
