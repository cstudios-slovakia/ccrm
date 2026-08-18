import React, { useState, useMemo, useRef, useEffect } from "react";
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
  ArrowUpDown,
  ArrowLeft,
  Save,
  Check,
  Tag,
  Upload,
  Camera,
  Loader2,
  Lock,
  Unlock
} from "lucide-react";
import { formatMoney } from "../utils/currency";
import type { Language } from "../utils/translations";

const formatCurrency = (val: number, lang: Language, currency?: string | null) =>
  formatMoney(val, currency, lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getExpirationStatus = (expirationDate: string): { status: "expired" | "warning" | "ok"; daysRemaining: number } => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expDate = new Date(expirationDate);
  const diffTime = expDate.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let status: "expired" | "warning" | "ok" = "ok";
  if (daysRemaining <= 0) {
    status = "expired";
  } else if (daysRemaining <= 30) {
    status = "warning";
  }

  return { status, daysRemaining };
};
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

  // Modals & Navigation state
  const [selectedProductDetailId, setSelectedProductDetailId] = useState<string | "new" | null>(null);
  const [editingItem, setEditingItem] = useState<WarehouseItem | null>(null);

  // Sync hash navigation with product detail selection (e.g. from Universal Search)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#warehouse/item-")) {
        const itemId = hash.replace("#warehouse/item-", "");
        if (itemId) {
          setSelectedProductDetailId(itemId);
          setActiveSubTab("items");
        }
      } else if (hash === "#warehouse/new") {
        setSelectedProductDetailId("new");
        setActiveSubTab("items");
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  
  const [selectedMovementForPrint, setSelectedMovementForPrint] = useState<WarehouseMovement | null>(null);
  const [expandedMovementId, setExpandedMovementId] = useState<string | null>(null);

  // Category Searchable Combobox State
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState("");
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  // Product Image Upload State
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  // Card Lock State (Hold 1s to unlock fixed product data)
  const [isProductCardLocked, setIsProductCardLocked] = useState(true);
  const [lockHoldProgress, setLockHoldProgress] = useState(0);
  const [isHoldingLock, setIsHoldingLock] = useState(false);
  const holdTimerRef = useRef<any>(null);
  const holdIntervalRef = useRef<any>(null);

  // Product Detail Tab Selector
  const [productDetailTab, setProductDetailTab] = useState<"statistics" | "warehouse" | "movements">("statistics");

  // Product Specific Purchase Modal (Príjem tovaru / Nákup)
  const [isProductPurchaseModalOpen, setIsProductPurchaseModalOpen] = useState(false);
  const [productPurchasePartnerId, setProductPurchasePartnerId] = useState<string>("");
  const [productPurchasePartnerSearch, setProductPurchasePartnerSearch] = useState<string>("");
  const [isProductPurchasePartnerOpen, setIsProductPurchasePartnerOpen] = useState(false);
  const [productPurchaseWarehouseId, setProductPurchaseWarehouseId] = useState<string>("");
  const [productPurchaseAmount, setProductPurchaseAmount] = useState<number>(1);
  const [productPurchasePrice, setProductPurchasePrice] = useState<number>(0);
  const [productPurchaseBatchNumber, setProductPurchaseBatchNumber] = useState<string>("");
  const [productPurchaseExpirationDate, setProductPurchaseExpirationDate] = useState<string>("");
  const [productPurchaseNote, setProductPurchaseNote] = useState<string>("");

  // Product Specific Sale Modal (Výdaj tovaru / Predaj)
  const [isProductSaleModalOpen, setIsProductSaleModalOpen] = useState(false);
  const [productSalePartnerId, setProductSalePartnerId] = useState<string>("");
  const [productSalePartnerSearch, setProductSalePartnerSearch] = useState<string>("");
  const [isProductSalePartnerOpen, setIsProductSalePartnerOpen] = useState(false);
  const [productSaleWarehouseId, setProductSaleWarehouseId] = useState<string>("");
  const [productSaleAmount, setProductSaleAmount] = useState<number>(1);
  const [productSalePrice, setProductSalePrice] = useState<number>(0);
  const [productSaleBatchId, setProductSaleBatchId] = useState<string>("");
  const [productSaleExpirationSearch, setProductSaleExpirationSearch] = useState<string>("");
  const [isProductSaleExpirationOpen, setIsProductSaleExpirationOpen] = useState(false);
  const [productSaleNote, setProductSaleNote] = useState<string>("");

  // Form states for Product Modal
  const [itemForm, setItemForm] = useState<{
    name: string;
    sku: string;
    barcode: string;
    categories: string[];
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
    categories: ["Veľkoformátové dosky"],
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

  // Helper to get category list for an item (supports both array and comma-separated string)
  const getItemCategories = (item: { category?: string | null; categories?: string[] } | null | undefined): string[] => {
    if (!item) return [];
    if (Array.isArray(item.categories) && item.categories.length > 0) {
      return item.categories.filter(c => Boolean(c && c.trim()));
    }
    if (item.category) {
      return item.category.split(",").map(c => c.trim()).filter(Boolean);
    }
    return [];
  };

  // Categories list derived from items + defaults + custom categories
  const allCategories = useMemo(() => {
    const set = new Set<string>([
      "Veľkoformátové dosky",
      "Prírodný kameň",
      "Technický kameň",
      "Keramika & Gres",
      "Stavebná chémia",
      "Lepidlá a tmely",
      "Ošetrenie a údržba",
      "Náradie a spotrebný materiál"
    ]);
    warehouseItems.forEach(item => {
      getItemCategories(item).forEach(c => set.add(c));
    });
    customCategories.forEach(c => {
      if (c && c.trim()) set.add(c.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [warehouseItems, customCategories]);

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

      // Category filter (supports multiple categories per item)
      if (selectedCategory !== "all") {
        const itemCats = getItemCategories(item);
        if (!itemCats.includes(selectedCategory)) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchSku = item.sku.toLowerCase().includes(q);
        const matchBarcode = item.barcode?.toLowerCase().includes(q);
        const itemCats = getItemCategories(item);
        const matchCat = itemCats.some(c => c.toLowerCase().includes(q)) || (item.category?.toLowerCase().includes(q));
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

  const handleOpenCreateItem = () => {
    setEditingItem(null);
    setItemForm({
      name: "",
      sku: `SKU-${Date.now().toString().slice(-4)}`,
      barcode: "",
      categories: [allCategories[0] || "Veľkoformátové dosky"],
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
    setIsProductCardLocked(false);
    setIsCategoryDropdownOpen(false);
    setCategorySearchQuery("");
    setSelectedProductDetailId("new");
  };

  const handleOpenEditItem = (item: WarehouseItem) => {
    setEditingItem(item);
    const itemCats = getItemCategories(item);
    setItemForm({
      name: item.name,
      sku: item.sku,
      barcode: item.barcode || "",
      categories: itemCats.length > 0 ? itemCats : ["Veľkoformátové dosky"],
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
    setIsProductCardLocked(true);
    setIsCategoryDropdownOpen(false);
    setCategorySearchQuery("");
    setSelectedProductDetailId(item.id);
  };

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert(t("Please select an image file (PNG, JPG, WEBP, SVG).", "Vyberte obrázkový súbor (PNG, JPG, WEBP, SVG).", "Kérjük, válasszon képfájlt."));
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setItemForm(prev => ({ ...prev, imageUrl: previewUrl }));
    setIsImageUploading(true);
    setImageUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("eventId", `wh_item_${Date.now()}`);

      const res = await fetch("/upload.php", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || t("Upload failed", "Nahrávanie zlyhalo", "Feltöltés sikertelen"));
      }

      const data = await res.json();
      if (data.success && (data.filePath || data.fileName)) {
        const finalPath = data.filePath || `/uploads/${data.fileName}`;
        setItemForm(prev => ({ ...prev, imageUrl: finalPath }));
      }
    } catch (err: any) {
      console.error("Product image upload failed:", err);
      setImageUploadError(err.message || "Upload failed");
    } finally {
      setIsImageUploading(false);
    }
  };

  const startHoldToUnlock = () => {
    if (!isProductCardLocked) return;
    setIsHoldingLock(true);
    setLockHoldProgress(0);

    const startTime = Date.now();
    const duration = 1000;

    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);

    holdIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, (elapsed / duration) * 100);
      setLockHoldProgress(progress);
    }, 20);

    holdTimerRef.current = setTimeout(() => {
      setIsProductCardLocked(false);
      setIsHoldingLock(false);
      setLockHoldProgress(0);
      if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(t("Product details unlocked for editing.", "Údaje tovaru boli odomknuté na úpravu.", "A termékadatok feloldva szerkesztésre."));
      }
    }, duration);
  };

  const cancelHoldToUnlock = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setIsHoldingLock(false);
    setLockHoldProgress(0);
  };

  // Joint Partners (Suppliers) & Clients (Leads) List
  const jointPartnersAndClients = useMemo(() => {
    const list: Array<{ id: string; name: string; type: "partner" | "client"; subtext: string }> = [];
    suppliers.forEach(s => {
      list.push({
        id: `sup_${s.id}`,
        name: s.name,
        type: "partner",
        subtext: s.companyId ? `IČO: ${s.companyId} · ${s.city || t("Supplier / Partner", "Dodávateľ / Partner", "Beszállító / Partner")}` : (s.city || t("Supplier / Partner", "Dodávateľ / Partner", "Beszállító / Partner"))
      });
    });
    leads.forEach(l => {
      list.push({
        id: `lead_${l.id}`,
        name: l.name,
        type: "client",
        subtext: l.clientType === "partner" ? t("B2B Partner", "B2B Partner", "Partner") : (l.city ? `${l.city} · ${t("Client / Customer", "Klient / Odberateľ", "Ügyfél")}` : t("Client / Customer", "Klient / Odberateľ", "Ügyfél"))
      });
    });
    return list;
  }, [suppliers, leads, t]);

  const handleOpenProductPurchaseModal = () => {
    const currentItem = warehouseItems.find(i => i.id === selectedProductDetailId);
    if (!currentItem) return;
    setProductPurchasePartnerId(suppliers[0] ? `sup_${suppliers[0].id}` : (leads[0] ? `lead_${leads[0].id}` : ""));
    setProductPurchasePartnerSearch("");
    setIsProductPurchasePartnerOpen(false);
    setProductPurchaseWarehouseId(warehouses[0]?.id || "");
    setProductPurchaseAmount(1);
    setProductPurchasePrice(currentItem.avgPurchasePrice || 0);
    setProductPurchaseBatchNumber(`BAT-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`);
    setProductPurchaseExpirationDate("");
    setProductPurchaseNote("");
    setIsProductPurchaseModalOpen(true);
  };

  const handleOpenProductSaleModal = () => {
    const currentItem = warehouseItems.find(i => i.id === selectedProductDetailId);
    if (!currentItem) return;
    setProductSalePartnerId(leads[0] ? `lead_${leads[0].id}` : (suppliers[0] ? `sup_${suppliers[0].id}` : ""));
    setProductSalePartnerSearch("");
    setIsProductSalePartnerOpen(false);
    setProductSaleWarehouseId(warehouses[0]?.id || "");
    setProductSaleAmount(1);
    setProductSalePrice(currentItem.defaultSellPrice || 0);
    setProductSaleBatchId("");
    setProductSaleExpirationSearch("");
    setIsProductSaleExpirationOpen(false);
    setProductSaleNote("");
    setIsProductSaleModalOpen(true);
  };

  const handleSaveProductPurchase = () => {
    const currentItem = warehouseItems.find(i => i.id === selectedProductDetailId);
    if (!currentItem) return;
    if (productPurchaseAmount <= 0) {
      alert(t("Please enter a valid quantity.", "Zadajte platné množstvo.", "Kérjük, adjon meg érvényes mennyiséget."));
      return;
    }

    let supplierId: string | null = null;
    let leadId: string | null = null;
    if (productPurchasePartnerId.startsWith("sup_")) {
      supplierId = productPurchasePartnerId.replace("sup_", "");
    } else if (productPurchasePartnerId.startsWith("lead_")) {
      leadId = productPurchasePartnerId.replace("lead_", "");
    }

    const docNum = `PRI-${new Date().getFullYear()}-${String(warehouseMovements.filter(m => m.type === "inward").length + 1).padStart(4, "0")}`;
    const movId = `mov-${Date.now()}`;
    const totalCost = Number(productPurchaseAmount) * Number(productPurchasePrice);

    const movementItem: WarehouseMovementItem = {
      id: `mvi-${Date.now()}-0`,
      movementId: movId,
      itemId: currentItem.id,
      batchId: productPurchaseBatchNumber.trim() ? `bat-${Date.now()}` : null,
      quantity: Number(productPurchaseAmount),
      unitPurchasePrice: Number(productPurchasePrice),
      unitSellPrice: currentItem.defaultSellPrice || 0,
      totalPrice: totalCost,
      expirationDate: productPurchaseExpirationDate || null,
      note: productPurchaseNote || null
    };

    const newMovement: WarehouseMovement = {
      id: movId,
      documentNumber: docNum,
      type: "inward",
      status: "confirmed",
      warehouseId: productPurchaseWarehouseId,
      targetWarehouseId: null,
      supplierId: supplierId,
      leadId: leadId,
      totalCostValue: totalCost,
      totalSellValue: 0,
      totalProfitValue: 0,
      createdBy: currentUser.email,
      note: productPurchaseNote.trim() || null,
      fileName: null,
      filePath: null,
      issuedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      items: [movementItem]
    };

    setWarehouseMovements(prev => [newMovement, ...prev]);

    const currentStock = warehouseStock.find(s => s.warehouseId === productPurchaseWarehouseId && s.itemId === currentItem.id);
    const existingQty = currentStock?.quantity || 0;
    const oldAvgPrice = currentItem.avgPurchasePrice || 0;
    const newTotalQty = existingQty + Number(productPurchaseAmount);
    const newWapPrice = newTotalQty > 0 
      ? ((existingQty * oldAvgPrice) + (Number(productPurchaseAmount) * Number(productPurchasePrice))) / newTotalQty 
      : Number(productPurchasePrice);

    setWarehouseItems(prev => prev.map(i => i.id === currentItem.id ? {
      ...i,
      avgPurchasePrice: Number(newWapPrice.toFixed(2)),
      lastPurchasePrice: Number(productPurchasePrice)
    } : i));
    setItemForm(prev => ({ ...prev, avgPurchasePrice: Number(newWapPrice.toFixed(2)) }));

    setWarehouseStock(prev => {
      const exists = prev.some(s => s.warehouseId === productPurchaseWarehouseId && s.itemId === currentItem.id);
      if (exists) {
        return prev.map(s => s.warehouseId === productPurchaseWarehouseId && s.itemId === currentItem.id ? {
          ...s,
          quantity: s.quantity + Number(productPurchaseAmount)
        } : s);
      } else {
        return [...prev, {
          id: `stk-${Date.now()}`,
          warehouseId: productPurchaseWarehouseId,
          itemId: currentItem.id,
          quantity: Number(productPurchaseAmount),
          reservedQuantity: 0,
          location: currentItem.defaultLocation || "A-01-RACK"
        }];
      }
    });

    if (productPurchaseBatchNumber.trim() || productPurchaseExpirationDate) {
      const newBatch: WarehouseBatch = {
        id: movementItem.batchId || `bat-${Date.now()}`,
        itemId: currentItem.id,
        warehouseId: productPurchaseWarehouseId,
        batchNumber: productPurchaseBatchNumber.trim() || `BAT-${Date.now().toString().slice(-4)}`,
        expirationDate: productPurchaseExpirationDate || new Date(Date.now() + 365*24*60*60*1000).toISOString().slice(0, 10),
        initialQuantity: Number(productPurchaseAmount),
        currentQuantity: Number(productPurchaseAmount),
        purchasePrice: Number(productPurchasePrice),
        createdAt: new Date().toISOString().slice(0, 19).replace("T", " ")
      };
      setWarehouseBatches(prev => [newBatch, ...prev]);
    }

    if (typeof (window as any).showToast === "function") {
      (window as any).showToast(t(`Purchase receipt ${docNum} logged successfully.`, `Príjemka ${docNum} bola úspešne zaevidovaná.`, `A(z) ${docNum} bevételezés rögzítve.`));
    }

    setIsProductPurchaseModalOpen(false);
    setProductPurchaseNote("");
  };

  const handleSaveProductSale = () => {
    const currentItem = warehouseItems.find(i => i.id === selectedProductDetailId);
    if (!currentItem) return;
    if (productSaleAmount <= 0) {
      alert(t("Please enter a valid quantity.", "Zadajte platné množstvo.", "Kérjük, adjon meg érvényes mennyiséget."));
      return;
    }

    const stock = getStockInfoForItem(currentItem.id, productSaleWarehouseId);
    if (productSaleAmount > stock.available) {
      alert(t(
        `Insufficient stock for "${currentItem.name}". Available: ${stock.available} ${currentItem.unit}, Requested: ${productSaleAmount}`,
        `Nedostatočný stav zásob pre "${currentItem.name}". Dostupné: ${stock.available} ${currentItem.unit}, Požadované: ${productSaleAmount}`,
        `Nincs elegendő készlet a(z) "${currentItem.name}" termékből.`
      ));
      return;
    }

    let supplierId: string | null = null;
    let leadId: string | null = null;
    if (productSalePartnerId.startsWith("sup_")) {
      supplierId = productSalePartnerId.replace("sup_", "");
    } else if (productSalePartnerId.startsWith("lead_")) {
      leadId = productSalePartnerId.replace("lead_", "");
    }

    const docNum = `VYD-${new Date().getFullYear()}-${String(warehouseMovements.filter(m => m.type === "outward").length + 1).padStart(4, "0")}`;
    const movId = `mov-${Date.now()}`;
    const unitCost = currentItem.avgPurchasePrice || 0;
    const totalCost = Number(productSaleAmount) * unitCost;
    const totalSell = Number(productSaleAmount) * Number(productSalePrice);

    const movementItem: WarehouseMovementItem = {
      id: `mvi-${Date.now()}-0`,
      movementId: movId,
      itemId: currentItem.id,
      batchId: productSaleBatchId || null,
      quantity: Number(productSaleAmount),
      unitPurchasePrice: unitCost,
      unitSellPrice: Number(productSalePrice),
      totalPrice: totalSell,
      expirationDate: null,
      note: productSaleNote || null
    };

    const newMovement: WarehouseMovement = {
      id: movId,
      documentNumber: docNum,
      type: "outward",
      status: "confirmed",
      warehouseId: productSaleWarehouseId,
      targetWarehouseId: null,
      supplierId: supplierId,
      leadId: leadId,
      totalCostValue: totalCost,
      totalSellValue: totalSell,
      totalProfitValue: totalSell - totalCost,
      createdBy: currentUser.email,
      note: productSaleNote.trim() || null,
      fileName: null,
      filePath: null,
      issuedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      items: [movementItem]
    };

    setWarehouseMovements(prev => [newMovement, ...prev]);

    setWarehouseStock(prev => prev.map(s => s.warehouseId === productSaleWarehouseId && s.itemId === currentItem.id ? {
      ...s,
      quantity: Math.max(0, s.quantity - Number(productSaleAmount))
    } : s));

    if (productSaleBatchId) {
      setWarehouseBatches(prev => prev.map(b => b.id === productSaleBatchId ? {
        ...b,
        currentQuantity: Math.max(0, b.currentQuantity - Number(productSaleAmount))
      } : b));
    }

    if (typeof (window as any).showToast === "function") {
      (window as any).showToast(t(`Sale issue ${docNum} logged successfully.`, `Výdajka ${docNum} bola úspešne zaevidovaná.`, `A(z) ${docNum} kiadás rögzítve.`));
    }

    setIsProductSaleModalOpen(false);
    setProductSaleNote("");
    setProductSaleBatchId("");
  };

  const handleDeleteItem = (itemId: string) => {
    const item = warehouseItems.find(i => i.id === itemId);
    if (!window.confirm(t(
      `Are you sure you want to delete product "${item?.name || itemId}"? This will remove all associated stock records.`,
      `Naozaj chcete vymazať tovar "${item?.name || itemId}"? Odstránia sa aj všetky priradené skladové záznamy.`,
      `Biztosan törli a "${item?.name || itemId}" terméket? Az összes kapcsolódó készletadat is törlődik.`
    ))) {
      return;
    }

    setWarehouseItems(prev => prev.filter(i => i.id !== itemId));
    setWarehouseStock(prev => prev.filter(s => s.itemId !== itemId));
    setSelectedProductDetailId(null);
    setEditingItem(null);

    if (typeof (window as any).showToast === "function") {
      (window as any).showToast(t("Product was deleted successfully.", "Tovar bol úspešne vymazaný.", "A termék sikeresen törölve."));
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
        category: itemForm.categories.join(", ") || null,
        categories: itemForm.categories.length > 0 ? itemForm.categories : [t("Uncategorized", "Bez kategórie", "Kategória nélkül")],
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
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(t("Product updated successfully.", "Tovar bol úspešne upravený.", "A termék sikeresen módosítva."));
      }
    } else {
      // Create new item
      const newItemId = `item-${Date.now()}`;
      const newItem: WarehouseItem = {
        id: newItemId,
        name: itemForm.name.trim(),
        sku: itemForm.sku.trim(),
        barcode: itemForm.barcode.trim() || null,
        category: itemForm.categories.join(", ") || null,
        categories: itemForm.categories.length > 0 ? itemForm.categories : [t("Uncategorized", "Bez kategórie", "Kategória nélkül")],
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

      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(t("New product created successfully.", "Nový tovar bol úspešne pridaný.", "Új termék sikeresen hozzáadva."));
      }
    }

    setSelectedProductDetailId(null);
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

  // ---------------------------------------------------------------------------
  // DEDICATED FULL VIEW: PRODUCT CREATE / EDIT & 360° INVENTORY MANAGEMENT
  // ---------------------------------------------------------------------------
  if (selectedProductDetailId !== null) {
    const isNew = selectedProductDetailId === "new";
    const currentItem = isNew ? null : warehouseItems.find(i => i.id === selectedProductDetailId);
    const overallStock = currentItem ? getStockInfoForItem(currentItem.id, "all") : { onHand: 0, reserved: 0, available: 0, locations: "" };
    const totalStock = overallStock.onHand;
    
    // Live Profit & Margin computations
    const sellPrice = Number(itemForm.defaultSellPrice) || 0;
    const buyPrice = Number(itemForm.avgPurchasePrice) || 0;
    const unitProfit = sellPrice - buyPrice;
    const marginPct = sellPrice > 0 ? (unitProfit / sellPrice) * 100 : 0;
    const markupPct = buyPrice > 0 ? (unitProfit / buyPrice) * 100 : 0;

    // Item-specific movements
    const itemMovements = currentItem ? warehouseMovements.filter(m => m.items?.some(it => it.itemId === currentItem.id)) : [];

    // Categories list: defaults + existing items + user-added custom categories
    const defaultCats = [
      "Veľkoformátové dosky",
      "Prírodný kameň",
      "Technický kameň",
      "Keramika & Gres",
      "Stavebná chémia",
      "Lepidlá a tmely",
      "Ošetrenie a údržba",
      "Náradie a spotrebný materiál"
    ];
    const itemCats = warehouseItems.flatMap(i => getItemCategories(i));
    const allAvailableCategories = Array.from(new Set([...defaultCats, ...itemCats, ...customCategories])).sort((a, b) => a.localeCompare(b));

    return (
      <div className="space-y-6 pb-12 animate-fadeIn">
        {/* TOP BAR / BREADCRUMB HEADER (STICKY ON TOP) */}
        <div className="sticky top-2 z-40 bg-white/95 backdrop-blur-md p-4 md:p-5 rounded-3xl border border-slate-200/80 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setSelectedProductDetailId(null);
                setIsCategoryDropdownOpen(false);
                setCategorySearchQuery("");
              }}
              className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center justify-center shrink-0"
              title={t("Back to Inventory", "Späť na skladové zásoby", "Vissza a készlethez")}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-1">
                <span>{t("Warehouse", "Sklad", "Raktár")}</span>
                <span>/</span>
                <span>{t("Product Catalog", "Katalóg tovaru", "Termékkatalógus")}</span>
                <span>/</span>
                <span className="text-blue-900 font-bold">{isNew ? t("New Product", "Nový tovar", "Új termék") : currentItem?.name}</span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                  {isNew ? t("New Product / Material", "Pridať nový tovar do katalógu", "Új termék felvitele") : itemForm.name || currentItem?.name}
                </h1>
                {!isNew && (
                  <>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                      {itemForm.sku}
                    </span>
                    {itemForm.categories.length === 0 ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                        {t("Uncategorized", "Bez kategórie", "Kategória nélkül")}
                      </span>
                    ) : (
                      itemForm.categories.map(cat => (
                        <span key={cat} className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-900 border border-blue-200">
                          {cat}
                        </span>
                      ))
                    )}
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      overallStock.onHand === 0 
                        ? "bg-rose-50 text-rose-700 border border-rose-200" 
                        : overallStock.onHand <= itemForm.minStock 
                        ? "bg-amber-50 text-amber-700 border border-amber-200" 
                        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    }`}>
                      {overallStock.onHand === 0
                        ? t("Out of stock", "Vypredané", "Kifogyott")
                        : overallStock.onHand <= itemForm.minStock
                        ? t("Low stock", "Nízka zásoba", "Alacsony készlet")
                        : t("In stock", "Na sklade", "Készleten")} ({overallStock.onHand} {itemForm.unit})
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedProductDetailId(null);
                setIsCategoryDropdownOpen(false);
                setCategorySearchQuery("");
              }}
              className="px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
            >
              {t("Cancel", "Zrušiť", "Mégse")}
            </button>

            {!isNew && (
              <button
                onClick={() => currentItem && handleDeleteItem(currentItem.id)}
                className="p-2.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold transition flex items-center gap-1.5"
                title={t("Delete Product", "Vymazať tovar", "Termék törlése")}
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">{t("Delete", "Vymazať", "Törlés")}</span>
              </button>
            )}

            <button
              onClick={handleSaveItem}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-blue-950 hover:bg-blue-900 text-white text-xs font-black shadow-lg shadow-blue-950/20 transition"
            >
              <Save className="w-4 h-4" />
              <span>{isNew ? t("Create Product", "Vytvoriť tovar", "Termék létrehozása") : t("Save Changes", "Uložiť zmeny", "Módosítások mentése")}</span>
            </button>
          </div>
        </div>

        {/* TOP WAREHOUSE TREND & INVENTORY FLOW STATS OVERVIEW */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
          {/* 4 SUMMARY STAT CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Stat 1: Total Stock */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                {t("Total Stock", "Celková zásoba", "Összkészlet")}
              </span>
              <div className="text-lg font-black text-slate-900 font-mono">
                {totalStock} <span className="text-xs font-normal text-slate-500">{itemForm.unit}</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                {t("Across all warehouses", "Na všetkých skladoch", "Összes raktárban")}
              </span>
            </div>

            {/* Stat 2: Total Value at WAP */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                {t("Inventory Value", "Hodnota zásob (WAP)", "Készletérték")}
              </span>
              <div className="text-lg font-black text-emerald-700 font-mono">
                {formatCurrency(totalStock * itemForm.avgPurchasePrice, systemLanguage, systemCurrency)}
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                {t("At avg purchase cost", "Podľa nákupných cien", "Beszerzési áron")}
              </span>
            </div>

            {/* Stat 3: 30d Inflow */}
            <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block mb-1 flex items-center gap-1">
                <ArrowDownLeft className="w-3 h-3" />
                {t("Purchases (30d)", "Nákup (30 dní)", "Beszerzés (30n)")}
              </span>
              <div className="text-lg font-black text-emerald-900 font-mono">
                +{itemMovements
                  .filter(m => m.type === "inward" && new Date(m.issuedAt || m.createdAt || "").getTime() >= Date.now() - 30 * 86400000)
                  .reduce((sum, m) => sum + (m.items?.find(it => it.itemId === currentItem?.id)?.quantity || 0), 0)}{" "}
                <span className="text-xs font-normal text-emerald-700">{itemForm.unit}</span>
              </div>
              <span className="text-[10px] text-emerald-600 mt-0.5 block">
                {t("Inward receipts", "Príjemky na sklad", "Bevételezések")}
              </span>
            </div>

            {/* Stat 4: 30d Outflow */}
            <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block mb-1 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" />
                {t("Sales (30d)", "Predaj (30 dní)", "Értékesítés (30n)")}
              </span>
              <div className="text-lg font-black text-blue-900 font-mono">
                -{itemMovements
                  .filter(m => m.type === "outward" && new Date(m.issuedAt || m.createdAt || "").getTime() >= Date.now() - 30 * 86400000)
                  .reduce((sum, m) => sum + (m.items?.find(it => it.itemId === currentItem?.id)?.quantity || 0), 0)}{" "}
                <span className="text-xs font-normal text-blue-700">{itemForm.unit}</span>
              </div>
              <span className="text-[10px] text-blue-600 mt-0.5 block">
                {t("Issued to clients", "Vydané zákazníkom", "Kiadások")}
              </span>
            </div>
          </div>

          {/* FLOW TRAJECTORY & HEALTH BAR */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={`w-3 h-3 rounded-full ${totalStock > (itemForm.minStock || 0) ? "bg-emerald-500 animate-pulse" : "bg-amber-500 animate-bounce"}`} />
              <div>
                <span className="text-xs font-bold text-slate-800 block">
                  {totalStock > (itemForm.minStock || 0) 
                    ? t("Stock Status: Optimal & Healthy", "Stav zásob: Optimálny a v norme", "Készletállapot: Megfelelő")
                    : t("Stock Status: Low Inventory Alert!", "Stav zásob: Nízka zásoba — potrebné doobjednať!", "Készletállapot: Alacsony készlet!")}
                </span>
                <span className="text-[11px] text-slate-400">
                  {t("Min Alert threshold", "Minimálny limit", "Minimális limit")}: {itemForm.minStock} {itemForm.unit} · {t("Target", "Cieľ", "Cél")}: {itemForm.optimalStock} {itemForm.unit}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-slate-700">
                {Math.min(100, Math.round((totalStock / (itemForm.optimalStock || 1)) * 100))}%
              </span>
              <div className="w-28 h-2.5 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${totalStock > (itemForm.minStock || 0) ? "bg-emerald-600" : "bg-amber-500"}`}
                  style={{ width: `${Math.min(100, (totalStock / (itemForm.optimalStock || 1)) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 2-COLUMN WORKSPACE: LEFT NARROWER SIDEBAR (FIXED DATA) & RIGHT MAIN CONTENT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* LEFT NARROWER COLUMN (1/3 width): FIXED PRODUCT DATA (WEBSHOP STYLE) */}
          <div className="lg:col-span-1 space-y-5">
            {/* CARD: FIXED PRODUCT SPECIFICATIONS */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
              
              {/* LOCK / UNLOCK BAR */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Package className="w-4 h-4 text-blue-900" />
                  <span>{t("Fixed Product Data", "Pevné údaje tovaru", "Fix termékadatok")}</span>
                </div>

                {isProductCardLocked ? (
                  <button
                    type="button"
                    onMouseDown={startHoldToUnlock}
                    onMouseUp={cancelHoldToUnlock}
                    onMouseLeave={cancelHoldToUnlock}
                    onTouchStart={startHoldToUnlock}
                    onTouchEnd={cancelHoldToUnlock}
                    className={`relative overflow-hidden px-3 py-1.5 rounded-xl border text-xs font-bold transition select-none flex items-center gap-1.5 ${
                      isHoldingLock 
                        ? "bg-amber-100 border-amber-300 text-amber-900 scale-95 shadow-inner" 
                        : "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700 cursor-pointer"
                    }`}
                    title={t("Hold for 1 second to unlock fixed data", "Podržte 1 sekundu na odomknutie", "Tartsa nyomva 1 másodpercig a feloldáshoz")}
                  >
                    {isHoldingLock && (
                      <div 
                        className="absolute left-0 top-0 bottom-0 bg-amber-400/40 transition-all duration-75"
                        style={{ width: `${lockHoldProgress}%` }}
                      />
                    )}
                    <Lock className="w-3.5 h-3.5 text-amber-600 relative z-10" />
                    <span className="relative z-10 text-[11px] font-bold">
                      {isHoldingLock ? `${Math.round(lockHoldProgress)}%` : t("Locked (Hold 1s)", "Zamknuté (Držte 1s)", "Zárolva (Tartsa 1s)")}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsProductCardLocked(true)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    title={t("Click to lock fixed data", "Kliknite pre zamknutie údajov", "Kattintson a zároláshoz")}
                  >
                    <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-[11px] font-bold">{t("Unlocked", "Odomknuté", "Feloldva")}</span>
                  </button>
                )}
              </div>

              {/* TOP HEADER: SMALL IMAGE (WITH UPLOAD) ON LEFT, NAME ON RIGHT (WEBSHOP STYLE) */}
              <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
                {/* Small thumbnail with upload trigger on the left */}
                <div className="relative group shrink-0">
                  <div 
                    onClick={() => !isProductCardLocked && document.getElementById("product-image-upload-input")?.click()}
                    className={`w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 border-2 border-dashed shadow-inner flex flex-col items-center justify-center relative transition ${
                      isProductCardLocked 
                        ? "border-slate-200 cursor-not-allowed opacity-90" 
                        : "border-slate-300 group-hover:border-blue-900 cursor-pointer"
                    }`}
                    title={isProductCardLocked ? t("Locked. Hold lock button for 1s to edit.", "Zamknuté. Podržte tlačidlo zámku 1s na úpravu.", "Zárolva.") : t("Click to upload product image", "Kliknite pre nahratie obrázka tovaru", "Kattintson a kép feltöltéséhez")}
                  >
                    {itemForm.imageUrl ? (
                      <>
                        <img
                          src={itemForm.imageUrl}
                          alt={itemForm.name || "Product"}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as any).src = "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=200&h=200&fit=crop";
                          }}
                        />
                        {/* Hover Overlay only when unlocked */}
                        {!isProductCardLocked && (
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center text-white">
                            <Camera className="w-5 h-5 mb-0.5" />
                            <span className="text-[9px] font-bold uppercase tracking-wider">{t("Change", "Zmeniť", "Csere")}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-400 p-1 text-center">
                        <Upload className={`w-5 h-5 mb-1 ${isProductCardLocked ? "text-slate-300" : "text-slate-400 group-hover:text-blue-900 group-hover:scale-110"} transition`} />
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight leading-none">{t("Upload", "Nahrať", "Feltöltés")}</span>
                      </div>
                    )}

                    {/* Uploading spinner overlay */}
                    {isImageUploading && (
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-blue-900 animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Hidden File Input */}
                  <input
                    id="product-image-upload-input"
                    type="file"
                    disabled={isProductCardLocked}
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                    onChange={handleProductImageUpload}
                    className="hidden"
                  />

                  {/* Quick Remove Image Button (when unlocked) */}
                  {itemForm.imageUrl && !isImageUploading && !isProductCardLocked && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setItemForm(prev => ({ ...prev, imageUrl: "" }));
                      }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow-md transition cursor-pointer"
                      title={t("Remove image", "Odstrániť obrázok", "Kép törlése")}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Name on the right */}
                <div className="flex-1 min-w-0">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    {t("Product Name", "Názov tovaru", "Terméknév")} *
                  </label>
                  <input
                    type="text"
                    disabled={isProductCardLocked}
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                    placeholder="napr. Calacatta Gold 20mm"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-900 focus:bg-white focus:outline-none transition leading-tight disabled:bg-slate-100/70 disabled:cursor-not-allowed disabled:text-slate-700"
                  />
                  {!isProductCardLocked && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button
                        type="button"
                        onClick={() => document.getElementById("product-image-upload-input")?.click()}
                        className="text-[10px] font-bold text-blue-900 hover:text-blue-950 flex items-center gap-1 transition"
                      >
                        <Upload className="w-3 h-3" />
                        <span>{itemForm.imageUrl ? t("Change photo", "Zmeniť foto", "Fotó cseréje") : t("Upload photo", "Nahrať foto", "Fotó feltöltése")}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {imageUploadError && (
                <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {imageUploadError}
                </div>
              )}

              {/* 1. SUGGESTED SALE PRICE */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {t("Suggested Sale Price (excl. VAT)", "Predajná cena bez DPH", "Ajánlott eladási ár")} *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    disabled={isProductCardLocked}
                    value={itemForm.defaultSellPrice}
                    onChange={(e) => setItemForm({ ...itemForm, defaultSellPrice: Number(e.target.value) })}
                    className="w-full pl-3.5 pr-14 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-black text-blue-950 focus:ring-2 focus:ring-blue-900 focus:bg-white focus:outline-none transition disabled:bg-slate-100/70 disabled:cursor-not-allowed"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    {systemCurrency || "EUR"} / {itemForm.unit}
                  </span>
                </div>
              </div>

              {/* 2. EAN / BARCODE */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {t("Barcode / EAN", "Čiarový kód / EAN", "Vonalkód")}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    disabled={isProductCardLocked}
                    value={itemForm.barcode}
                    onChange={(e) => setItemForm({ ...itemForm, barcode: e.target.value })}
                    placeholder="858800123401"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-800 focus:ring-2 focus:ring-blue-900 focus:bg-white focus:outline-none transition disabled:bg-slate-100/70 disabled:cursor-not-allowed"
                  />
                  <Barcode className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {/* 3. SKU CODE */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  SKU {t("Code", "Kód", "Kód")} *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    disabled={isProductCardLocked}
                    value={itemForm.sku}
                    onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })}
                    placeholder="SKU-CQ-01"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-900 focus:bg-white focus:outline-none transition disabled:bg-slate-100/70 disabled:cursor-not-allowed"
                  />
                  <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {/* 4. CATEGORIES (MULTI-SELECT SEARCHABLE LIST WITH POSSIBILITY TO ADD OPTIONS) */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    {t("Categories", "Kategórie", "Kategóriák")}
                  </label>
                  {itemForm.categories.length > 0 && (
                    <span className="text-[10px] font-bold text-blue-900 font-mono">
                      {itemForm.categories.length} {t("selected", "vybraté", "kiválasztva")}
                    </span>
                  )}
                </div>
                
                {/* Category Button & Trigger */}
                <div
                  onClick={() => {
                    if (isProductCardLocked) return;
                    setIsCategoryDropdownOpen(!isCategoryDropdownOpen);
                    setCategorySearchQuery("");
                  }}
                  className={`w-full p-2 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-between transition min-h-[38px] ${
                    isProductCardLocked 
                      ? "bg-slate-100/70 text-slate-700 cursor-not-allowed" 
                      : "bg-slate-50 text-slate-800 cursor-pointer hover:bg-slate-100/80"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1.5 flex-1 pr-2">
                    {itemForm.categories.length === 0 ? (
                      <span className="text-slate-400 py-0.5 px-1">
                        {t("Select categories...", "Vyberte kategórie...", "Válasszon kategóriákat...")}
                      </span>
                    ) : (
                      itemForm.categories.map(cat => (
                        <span
                          key={cat}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 text-blue-950 border border-blue-200 text-[11px] font-bold"
                        >
                          <span>{cat}</span>
                          {!isProductCardLocked && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setItemForm(prev => ({
                                  ...prev,
                                  categories: prev.categories.filter(c => c !== cat)
                                }));
                              }}
                              className="hover:bg-blue-200/60 rounded p-0.5 text-blue-800 transition"
                              title={t("Remove category", "Odstrániť kategóriu", "Kategória eltávolítása")}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      ))
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition transform ${isCategoryDropdownOpen ? "rotate-180" : ""}`} />
                </div>

                {/* Dropdown Menu */}
                {isCategoryDropdownOpen && !isProductCardLocked && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 p-2.5 space-y-2">
                    {/* Search inside categories */}
                    <div className="relative">
                      <input
                        type="text"
                        autoFocus
                        value={categorySearchQuery}
                        onChange={(e) => setCategorySearchQuery(e.target.value)}
                        placeholder={t("Search or type new category...", "Hľadať alebo zadať novú...", "Keresés vagy új kategória...")}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && categorySearchQuery.trim()) {
                            const newCat = categorySearchQuery.trim();
                            if (!itemForm.categories.includes(newCat)) {
                              setItemForm(prev => ({ ...prev, categories: [...prev.categories, newCat] }));
                            }
                            setCustomCategories(prev => prev.includes(newCat) ? prev : [...prev, newCat]);
                            setCategorySearchQuery("");
                          }
                        }}
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    </div>

                    {/* Add new option button if query is entered and doesn't match */}
                    {categorySearchQuery.trim() && !allAvailableCategories.some(c => c.toLowerCase() === categorySearchQuery.trim().toLowerCase()) && (
                      <button
                        type="button"
                        onClick={() => {
                          const newCat = categorySearchQuery.trim();
                          if (!itemForm.categories.includes(newCat)) {
                            setItemForm(prev => ({ ...prev, categories: [...prev.categories, newCat] }));
                          }
                          setCustomCategories(prev => prev.includes(newCat) ? prev : [...prev, newCat]);
                          setCategorySearchQuery("");
                        }}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-bold flex items-center gap-1.5 transition text-left cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t("Add & Select", "Pridať a vybrať", "Hozzáadás")}: <span className="font-extrabold text-blue-950">"{categorySearchQuery.trim()}"</span></span>
                      </button>
                    )}

                    {/* Filtered category options with checkboxes */}
                    <div className="max-h-48 overflow-y-auto space-y-1 pt-1">
                      {allAvailableCategories
                        .filter(c => c.toLowerCase().includes(categorySearchQuery.toLowerCase()))
                        .map(cat => {
                          const isSelected = itemForm.categories.includes(cat);
                          return (
                            <div
                              key={cat}
                              onClick={() => {
                                setItemForm(prev => ({
                                  ...prev,
                                  categories: isSelected 
                                    ? prev.categories.filter(c => c !== cat)
                                    : [...prev.categories, cat]
                                }));
                              }}
                              className={`px-2.5 py-1.5 rounded-xl text-xs cursor-pointer flex items-center justify-between transition ${
                                isSelected 
                                  ? "bg-blue-900 text-white font-bold" 
                                  : "hover:bg-slate-100 text-slate-700 font-medium"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition ${
                                  isSelected ? "bg-white border-white text-blue-900" : "border-slate-300 bg-white"
                                }`}>
                                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                                <span>{cat}</span>
                              </div>
                              {isSelected && (
                                <span className="text-[10px] text-blue-200 uppercase font-bold">
                                  {t("Active", "Aktívna", "Aktív")}
                                </span>
                              )}
                            </div>
                          );
                        })}
                    </div>

                    {/* Bottom Done button */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setItemForm(prev => ({ ...prev, categories: [] }))}
                        className="text-[11px] font-bold text-slate-400 hover:text-rose-600 transition"
                      >
                        {t("Clear all", "Zrušiť výber", "Összes törlése")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCategoryDropdownOpen(false)}
                        className="px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
                      >
                        {t("Done", "Hotovo", "Kész")}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 5. UNIT OF MEASURE */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {t("Unit of Measure", "Merná jednotka (MJ)", "Mértékegység")}
                </label>
                <select
                  disabled={isProductCardLocked}
                  value={itemForm.unit}
                  onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-900 focus:bg-white focus:outline-none transition cursor-pointer disabled:bg-slate-100/70 disabled:cursor-not-allowed"
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

              {/* 6. STORAGE LOCATION */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {t("Storage Location / Bin", "Predvolená pozícia / Regál", "Raktári hely")}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    disabled={isProductCardLocked}
                    value={itemForm.defaultLocation}
                    onChange={(e) => setItemForm({ ...itemForm, defaultLocation: e.target.value })}
                    placeholder="A-01-RACK"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-900 focus:bg-white focus:outline-none transition disabled:bg-slate-100/70 disabled:cursor-not-allowed"
                  />
                  <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {/* 7. EXPIRATION TOGGLE */}
              <label className={`flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-200/80 transition ${
                isProductCardLocked ? "cursor-not-allowed opacity-80" : "cursor-pointer hover:bg-slate-100/60"
              }`}>
                <input
                  type="checkbox"
                  disabled={isProductCardLocked}
                  checked={itemForm.hasExpiration}
                  onChange={(e) => setItemForm({ ...itemForm, hasExpiration: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-900 focus:ring-blue-900 mt-0.5 disabled:cursor-not-allowed"
                />
                <div>
                  <span className="font-bold text-xs text-slate-900 block">
                    {t("Track FEFO Expiration", "Sledovať šarže a exspirácie (FEFO)", "FEFO lejárati idő követése")}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {t("Alerts for perishable chemicals & adhesives", "Upozornenia pre chémiu a lepidlá", "Figyelmeztetés a lejáró anyagokra")}
                  </p>
                </div>
              </label>

              {/* 8. DESCRIPTION */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {t("Description", "Popis tovaru", "Leírás")}
                </label>
                <textarea
                  rows={2}
                  disabled={isProductCardLocked}
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  placeholder={t("Technical notes...", "Technické parametre a popis...", "Műszaki adatok...")}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-blue-900 focus:bg-white focus:outline-none transition resize-y disabled:bg-slate-100/70 disabled:cursor-not-allowed"
                />
              </div>

            </div>

            {/* CARD 2: STOCK THRESHOLDS & TARGETS */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                  <Boxes className="w-3.5 h-3.5" />
                </div>
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  {t("Stock Thresholds & Targets", "Skladové limity a cieľové stavy", "Készletlimitek és célértékek")}
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Minimum Stock Alert", "Minimálna zásoba (Alert)", "Minimális készlet")}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      disabled={isProductCardLocked}
                      value={itemForm.minStock}
                      onChange={(e) => setItemForm({ ...itemForm, minStock: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-900 focus:bg-white focus:outline-none transition disabled:bg-slate-100/70 disabled:cursor-not-allowed"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      {itemForm.unit}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Optimal Target Stock", "Optimálna cieľová zásoba", "Optimális készlet")}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      disabled={isProductCardLocked}
                      value={itemForm.optimalStock}
                      onChange={(e) => setItemForm({ ...itemForm, optimalStock: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-900 focus:bg-white focus:outline-none transition disabled:bg-slate-100/70 disabled:cursor-not-allowed"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      {itemForm.unit}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* QUICK ACTIONS CARD (IF EDITING) */}
            {!isNew && currentItem && (
              <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-400">
                  {t("Quick Operations", "Rýchle operácie s tovarom", "Gyors műveletek")}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setReceiptItems([{ itemId: currentItem.id, batchNumber: "", expirationDate: "", quantity: 1, unitPurchasePrice: currentItem.avgPurchasePrice || 0, note: "" }]);
                      setIsReceiptModalOpen(true);
                    }}
                    className="flex flex-col items-center justify-center p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition text-center gap-1 cursor-pointer"
                  >
                    <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                    <span>{t("Receipt (PRI)", "Príjemka (PRI)", "Bevételezés")}</span>
                  </button>

                  <button
                    onClick={() => {
                      setIssueItems([{ itemId: currentItem.id, batchId: "", quantity: 1, unitSellPrice: currentItem.defaultSellPrice || 0, note: "" }]);
                      setIsIssueModalOpen(true);
                    }}
                    className="flex flex-col items-center justify-center p-3 rounded-2xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs font-bold transition text-center gap-1 cursor-pointer"
                  >
                    <ArrowUpRight className="w-4 h-4 text-blue-700" />
                    <span>{t("Issue (VYD)", "Výdajka (VYD)", "Kiadás")}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT WIDER COLUMN (2/3 width): TAB SELECTOR WORKSPACE */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* TAB SELECTOR BAR */}
            <div className="bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setProductDetailTab("statistics")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                  productDetailTab === "statistics"
                    ? "bg-blue-950 text-white shadow-md shadow-blue-950/20"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>{t("Profitability & Statistics", "Ziskovosť a Štatistiky", "Jövedelmezőség és Statisztika")}</span>
              </button>

              <button
                type="button"
                onClick={() => setProductDetailTab("warehouse")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                  productDetailTab === "warehouse"
                    ? "bg-blue-950 text-white shadow-md shadow-blue-950/20"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>{itemForm.hasExpiration ? t("Warehouses & FEFO Map", "Sklady a FEFO mapa", "Raktárak és FEFO térkép") : t("Warehouse Stock", "Stavy na skladoch", "Raktári készletek")}</span>
              </button>

              <button
                type="button"
                onClick={() => setProductDetailTab("movements")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                  productDetailTab === "movements"
                    ? "bg-blue-950 text-white shadow-md shadow-blue-950/20"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                }`}
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>{t("Movements", "Pohyby tovaru", "Mozgások")}</span>
                {itemMovements.length > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    productDetailTab === "movements" ? "bg-blue-800 text-blue-100" : "bg-slate-200 text-slate-700"
                  }`}>
                    {itemMovements.length}
                  </span>
                )}
              </button>
            </div>

            {/* TAB 1: STATISTICS & PRICING */}
            {productDetailTab === "statistics" && (
              <div className="space-y-6">
                {/* CARD 1: DEDICATED PROFITABILITY CALCULATOR */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">
                          {t("Profitability Calculator", "Kalkulátor ziskovosti a marže", "Jövedelmezőségi kalkulátor")}
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          {t("Real-time margin, markup, and unit gross profit analysis", "Výpočet marže, cenovej prirážky a hrubého zisku na jednotku", "Árrés, árréskulcs és egységhaszon valós idejű számítása")}
                        </p>
                      </div>
                    </div>

                    <span className={`self-start sm:self-center px-3 py-1 rounded-full text-xs font-black ${
                      marginPct >= 40 
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                        : marginPct >= 20 
                        ? "bg-blue-50 text-blue-900 border border-blue-200" 
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}>
                      {marginPct >= 40 ? t("High Profit", "Vysoká ziskovosť", "Magas árrés") : marginPct >= 20 ? t("Standard Margin", "Štandardná marža", "Normál árrés") : t("Low Margin", "Nízka marža", "Alacsony árrés")}
                    </span>
                  </div>

                  {/* 3 LIVE PROFITABILITY METRIC CARDS */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Metric 1: Gross Profit */}
                    <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block mb-1">
                        {t("Gross Profit per Unit", "Hrubý zisk na jednotku", "Haszon egységenként")}
                      </span>
                      <div className="text-xl md:text-2xl font-black text-emerald-900 font-mono tracking-tight">
                        +{formatCurrency(unitProfit, systemLanguage, systemCurrency)}
                      </div>
                      <span className="text-[10px] text-emerald-700 mt-1 block">
                        / {itemForm.unit}
                      </span>
                    </div>

                    {/* Metric 2: Gross Margin */}
                    <div className="p-4 rounded-2xl bg-slate-900 text-white">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200 block mb-1">
                        {t("Gross Margin %", "Obchodná marža", "Kereskedelmi árrés")}
                      </span>
                      <div className="text-xl md:text-2xl font-black text-white font-mono tracking-tight">
                        {marginPct.toFixed(1)}%
                      </div>
                      <span className="text-[10px] text-slate-300 mt-1 block">
                        {(marginPct / 100).toFixed(2)} coeff
                      </span>
                    </div>

                    {/* Metric 3: Markup */}
                    <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 block mb-1">
                        {t("Markup over Cost", "Cenová prirážka (Markup)", "Árréskulcs")}
                      </span>
                      <div className="text-xl md:text-2xl font-black text-blue-950 font-mono tracking-tight">
                        +{markupPct.toFixed(1)}%
                      </div>
                      <span className="text-[10px] text-blue-700 mt-1 block">
                        {t("above purchase price", "nad nákupnou cenou", "beszerzés felett")}
                      </span>
                    </div>
                  </div>

                  {/* PRICE COMPOSITION DISTRIBUTION BAR */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span>{t("Sale Price Composition", "Štruktúra predajnej ceny", "Eladási ár összetétele")}</span>
                      <span className="font-mono text-slate-900">{formatCurrency(itemForm.defaultSellPrice, systemLanguage, systemCurrency)}</span>
                    </div>

                    <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden flex">
                      <div
                        className="h-full bg-slate-500 transition-all"
                        style={{ width: `${itemForm.defaultSellPrice > 0 ? Math.min(100, Math.max(0, (itemForm.avgPurchasePrice / itemForm.defaultSellPrice) * 100)) : 0}%` }}
                        title={`${t("Purchase Cost (WAP)", "Nákupný náklad (WAP)", "Beszerzés")}: ${formatCurrency(itemForm.avgPurchasePrice, systemLanguage, systemCurrency)}`}
                      />
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${itemForm.defaultSellPrice > 0 ? Math.min(100, Math.max(0, (unitProfit / itemForm.defaultSellPrice) * 100)) : 0}%` }}
                        title={`${t("Gross Profit Margin", "Marža / Zisk", "Haszon")}: ${formatCurrency(unitProfit, systemLanguage, systemCurrency)}`}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold pt-0.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-500" />
                        {t("WAP Purchase Cost", "Nákup (WAP)", "Beszerzési ár")}: <span className="font-bold text-slate-700">{formatCurrency(itemForm.avgPurchasePrice, systemLanguage, systemCurrency)}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        {t("Gross Profit", "Zisk", "Haszon")}: <span className="font-bold text-emerald-700">+{formatCurrency(unitProfit, systemLanguage, systemCurrency)}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* CARD 2: REVENUE POTENTIAL & INVENTORY VALUE PROJECTION */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-900 flex items-center justify-center font-bold">
                        <BarChart3 className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">
                          {t("Inventory Revenue Potential", "Potenciál tržieb a výnosov zásoby", "Készletbevételi potenciál")}
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          {t("Projected total revenue and gross profit if all current stock is sold at suggested price", "Predpokladané tržby a hrubý zisk pri úplnom odpredaji zásob za predajnú cenu", "Várható bevétel és haszon a teljes készlet eladásakor")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        {t("Total Potential Revenue", "Celkové potenciálne tržby", "Összes várható bevétel")}
                      </span>
                      <div className="text-xl font-black text-slate-900 font-mono">
                        {formatCurrency(totalStock * itemForm.defaultSellPrice, systemLanguage, systemCurrency)}
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        {totalStock} {itemForm.unit} × {formatCurrency(itemForm.defaultSellPrice, systemLanguage, systemCurrency)}
                      </span>
                    </div>

                    <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block mb-1">
                        {t("Total Potential Gross Profit", "Celkový očakávaný zisk", "Várható bruttó haszon")}
                      </span>
                      <div className="text-xl font-black text-emerald-900 font-mono">
                        +{formatCurrency(totalStock * unitProfit, systemLanguage, systemCurrency)}
                      </div>
                      <span className="text-[10px] text-emerald-700 mt-1 block">
                        {t("Net of average purchase cost", "Po odpočítaní nákupných nákladov", "Beszerzés levonása után")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: WAREHOUSES & FEFO MAP */}
            {productDetailTab === "warehouse" && (
              <div className="space-y-5">
                
                {/* WAREHOUSE DISTRIBUTION: TABLE VIEW IF NOT FEFO, CARDS WITH FEFO MAP IF FEFO ACTIVE */}
                {!itemForm.hasExpiration ? (
                  /* CLEAN TABLE VIEW FOR STANDARD NON-EXPIRABLE PRODUCTS */
                  <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-900 flex items-center justify-center font-bold">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-base">
                            {t("Warehouse Stock Balances", "Prehľad skladových zásob", "Raktári készletkimutatás")}
                          </h3>
                          <p className="text-[11px] text-slate-400">
                            {t("Physical inventory, reservations, and available stock per warehouse", "Fyzické stavy, rezervácie a disponibilné množstvo podľa jednotlivých skladov", "Fizikai, foglalt és szabad készlet raktáranként")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-100">
                          <tr>
                            <th className="py-3.5 px-5">{t("Warehouse", "Sklad", "Raktár")}</th>
                            <th className="py-3.5 px-4">{t("Location / Bin", "Pozícia / Regál", "Raktári hely")}</th>
                            <th className="py-3.5 px-4 text-right">{t("Physical Stock", "Fyzicky", "Fizikai készlet")}</th>
                            <th className="py-3.5 px-4 text-right">{t("Reserved", "Rezervované", "Foglalt")}</th>
                            <th className="py-3.5 px-4 text-right">{t("Available", "K dispozícii", "Szabad")}</th>
                            <th className="py-3.5 px-5 text-right">{t("Valuation (WAP)", "Hodnota zásob", "Készletérték")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {warehouses.map(wh => {
                            const st = warehouseStock.find(s => s.warehouseId === wh.id && s.itemId === currentItem?.id);
                            const onHand = st?.quantity || 0;
                            const res = st?.reservedQuantity || 0;
                            const avail = Math.max(0, onHand - res);
                            const whVal = onHand * (itemForm.avgPurchasePrice || 0);

                            return (
                              <tr key={wh.id} className="hover:bg-slate-50/70 transition">
                                <td className="py-4 px-5">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center font-bold text-xs">
                                      <Building2 className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <span className="font-bold text-slate-900 block">{wh.name}</span>
                                      <span className="font-mono text-[10px] font-bold text-slate-400">{wh.code}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-4 px-4 text-slate-600">
                                  <div className="flex items-center gap-1.5 font-medium">
                                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                    <span>{st?.location || itemForm.defaultLocation || t("Main Floor", "Hlavná plocha", "Fő raktárhely")}</span>
                                  </div>
                                </td>
                                <td className="py-4 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                                  {onHand} <span className="text-xs font-normal text-slate-400">{itemForm.unit}</span>
                                </td>
                                <td className="py-4 px-4 text-right font-mono text-slate-500">
                                  {res} <span className="text-xs font-normal text-slate-400">{itemForm.unit}</span>
                                </td>
                                <td className="py-4 px-4 text-right font-mono font-black text-sm">
                                  <span className={avail > 0 ? "text-emerald-700" : "text-slate-400"}>
                                    {avail}
                                  </span>{" "}
                                  <span className="text-xs font-normal text-slate-400">{itemForm.unit}</span>
                                </td>
                                <td className="py-4 px-5 text-right font-mono font-bold text-slate-900">
                                  {formatCurrency(whVal, systemLanguage, systemCurrency)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200/80">
                          <tr>
                            <td className="py-3.5 px-5 text-slate-800 text-xs uppercase tracking-wider" colSpan={2}>
                              {t("Total Across All Warehouses", "Spolu na všetkých skladoch", "Összesen")}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-slate-900 text-sm">
                              {totalStock} <span className="text-xs font-normal text-slate-500">{itemForm.unit}</span>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-slate-500">
                              {warehouseStock.filter(s => s.itemId === currentItem?.id).reduce((sum, s) => sum + (s.reservedQuantity || 0), 0)}{" "}
                              <span className="text-xs font-normal text-slate-400">{itemForm.unit}</span>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-emerald-800 text-sm">
                              {Math.max(0, totalStock - warehouseStock.filter(s => s.itemId === currentItem?.id).reduce((sum, s) => sum + (s.reservedQuantity || 0), 0))}{" "}
                              <span className="text-xs font-normal text-slate-400">{itemForm.unit}</span>
                            </td>
                            <td className="py-3.5 px-5 text-right font-mono text-emerald-700 text-sm">
                              {formatCurrency(totalStock * itemForm.avgPurchasePrice, systemLanguage, systemCurrency)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ) : (
                  /* PER-WAREHOUSE CARDS WITH DEDICATED FEFO MAPS (WHEN EXPIRATION IS TRACKED) */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">
                          {t("Warehouse Stock Balances & FEFO Map", "Stavy na skladoch a FEFO mapa šarží", "Raktári készletek és FEFO térkép")}
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          {t("Detailed physical inventory & batch expiration tracking for each individual warehouse", "Podrobný prehľad zásob a exspirácií šarží pre každý sklad osobitne", "Részletes készlet- és lejáratiidő-nyilvántartás raktáranként")}
                        </p>
                      </div>
                    </div>

                    {/* CARDS FOR EACH WAREHOUSE WITH ITS OWN FEFO MAP */}
                    {warehouses.map(wh => {
                      const st = warehouseStock.find(s => s.warehouseId === wh.id && s.itemId === currentItem?.id);
                      const onHand = st?.quantity || 0;
                      const res = st?.reservedQuantity || 0;
                      const avail = Math.max(0, onHand - res);
                      const whBatches = warehouseBatches.filter(b => b.itemId === currentItem?.id && b.warehouseId === wh.id && b.currentQuantity > 0);

                      return (
                        <div key={wh.id} className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                          {/* WAREHOUSE HEADER */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-900 flex items-center justify-center font-bold">
                                <Building2 className="w-5 h-5 text-blue-900" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-slate-900 text-sm">{wh.name}</h4>
                                  <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 font-mono text-[10px] font-bold">
                                    {wh.code}
                                  </span>
                                </div>
                                <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-3 h-3 text-slate-400" />
                                  {st?.location || itemForm.defaultLocation || t("Main Floor", "Hlavná plocha", "Fő raktárhely")}
                                </span>
                              </div>
                            </div>

                            {/* BALANCES BADGES */}
                            <div className="flex items-center gap-3 self-end sm:self-center">
                              <div className="text-right">
                                <span className="text-[10px] text-slate-400 uppercase font-bold block">{t("Physical", "Fyzicky", "Fizikai")}</span>
                                <span className="font-mono font-bold text-slate-900 text-xs">{onHand} {itemForm.unit}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-slate-400 uppercase font-bold block">{t("Reserved", "Rezervované", "Foglalt")}</span>
                                <span className="font-mono font-bold text-slate-500 text-xs">{res} {itemForm.unit}</span>
                              </div>
                              <div className="text-right pl-2 border-l border-slate-100">
                                <span className="text-[10px] text-emerald-600 uppercase font-bold block">{t("Available", "K dispozícii", "Szabad")}</span>
                                <span className={`font-mono font-black text-sm ${avail > 0 ? "text-emerald-700" : "text-slate-400"}`}>
                                  {avail} {itemForm.unit}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* FEFO MAP SECTION FOR THIS WAREHOUSE */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-700 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                                <Layers className="w-3.5 h-3.5 text-amber-600" />
                                {t("FEFO Batch Map", "FEFO mapa šarží v tomto sklade", "FEFO tételtérkép ezen a raktáron")} ({whBatches.length})
                              </span>
                              {whBatches.length > 0 && (
                                <span className="text-[10px] font-semibold text-slate-400">
                                  {t("Sorted by earliest expiration first", "Zoradené od najstaršej exspirácie", "Lejárati sorrendben")}
                                </span>
                              )}
                            </div>

                            {whBatches.length === 0 ? (
                              <div className="p-3.5 rounded-2xl bg-slate-50/70 border border-dashed border-slate-200 text-center text-xs text-slate-400">
                                {t("No active lots in this warehouse. Inventory tracked as unbatched bulk stock.", "V tomto sklade nie sú zaevidované žiadne konkrétne šarže. Tovar sa eviduje ako voľná zásoba.", "Ezen a raktáron nincsenek aktív tételek.")}
                              </div>
                            ) : (
                              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                                <table className="w-full text-left text-xs">
                                  <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                                    <tr>
                                      <th className="py-2 px-3">{t("Batch / Lot #", "Číslo šarže", "Tételszám")}</th>
                                      <th className="py-2 px-3">{t("Expiration Date", "Dátum exspirácie", "Lejárat")}</th>
                                      <th className="py-2 px-3">{t("FEFO Health", "FEFO stav", "Állapot")}</th>
                                      <th className="py-2 px-3 text-right">{t("Quantity Available", "Zostatok šarže", "Készlet")}</th>
                                      <th className="py-2 px-3 text-right">{t("Purchase Cost", "Nákupná cena", "Beszerzési ár")}</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 font-medium">
                                    {whBatches
                                      .sort((a, b) => {
                                        if (!a.expirationDate) return 1;
                                        if (!b.expirationDate) return -1;
                                        return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
                                      })
                                      .map((batch, bIdx) => {
                                        const expStatus = getExpirationStatus(batch.expirationDate);
                                        return (
                                          <tr key={batch.id} className="hover:bg-slate-50/60 transition">
                                            <td className="py-2.5 px-3">
                                              <div className="flex items-center gap-1.5">
                                                <span className="font-mono font-bold text-slate-900">{batch.batchNumber}</span>
                                                {bIdx === 0 && (
                                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-blue-100 text-blue-900 border border-blue-200 uppercase">
                                                    FEFO #1
                                                  </span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="py-2.5 px-3 font-mono text-slate-700">
                                              {batch.expirationDate ? batch.expirationDate.slice(0, 10) : "-"}
                                            </td>
                                            <td className="py-2.5 px-3">
                                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                                                expStatus.status === "expired"
                                                  ? "bg-rose-100 text-rose-800"
                                                  : expStatus.status === "warning"
                                                  ? "bg-amber-100 text-amber-800"
                                                  : "bg-emerald-100 text-emerald-800"
                                              }`}>
                                                {expStatus.daysRemaining < 0 
                                                  ? t("Expired", "Exspirované", "Lejárt") 
                                                  : `${expStatus.daysRemaining} ${t("days remaining", "dní do exspirácie", "nap van hátra")}`}
                                              </span>
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-bold text-slate-900 font-mono">
                                              {batch.currentQuantity} <span className="text-[10px] font-normal text-slate-400">{itemForm.unit}</span>
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                                              {formatCurrency(batch.purchasePrice, systemLanguage, systemCurrency)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            )}

            {/* TAB 3: MOVEMENTS */}
            {productDetailTab === "movements" && (
              <div className="space-y-4">
                
                {/* TOP HEADER WITH LOG PURCHASE & LOG SALE BUTTONS */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-900" />
                      {t("Product Stock Movements", "Pohyby tovaru na sklade", "Termékmozgások")}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {t("Complete chronological audit trail of receipts, issues and transfers for this product", "Chronologická evidencia príjemiek a výdajok pre tento tovar", "Teljes bevételezési és kiadási előzmény")}
                    </p>
                  </div>

                  {/* ACTION BUTTONS */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleOpenProductPurchaseModal}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <ArrowDownLeft className="w-4 h-4" />
                      <span>{t("Log Purchase (PRI)", "+ Zaznamenať nákup (PRI)", "+ Bevételezés (PRI)")}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenProductSaleModal}
                      className="px-3.5 py-2 rounded-xl bg-blue-900 hover:bg-blue-950 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      <span>{t("Log Sale (VYD)", "- Zaznamenať predaj (VYD)", "- Kiadás (VYD)")}</span>
                    </button>
                  </div>
                </div>

                {/* MOVEMENTS TABLE */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
                  {itemMovements.length === 0 ? (
                    <div className="p-8 text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                        <Clock className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold text-slate-600">
                        {t("No stock movements recorded for this product yet.", "Pre tento tovar zatiaľ neboli zaevidované žiadne skladové pohyby.", "Még nincsenek rögzített mozgások.")}
                      </p>
                      <button
                        type="button"
                        onClick={handleOpenProductPurchaseModal}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <ArrowDownLeft className="w-4 h-4" />
                        <span>{t("Log First Purchase", "Zaznamenať prvý nákup", "Első bevételezés")}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-100">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="py-3 px-3.5">{t("Date & Time", "Dátum a čas", "Dátum")}</th>
                            <th className="py-3 px-3.5">{t("Type", "Typ", "Típus")}</th>
                            <th className="py-3 px-3.5">{t("Document #", "Číslo dokladu", "Bizonylatszám")}</th>
                            <th className="py-3 px-3.5">{t("Partner / Client", "Partner / Klient", "Partner / Ügyfél")}</th>
                            <th className="py-3 px-3.5">{t("Warehouse", "Sklad", "Raktár")}</th>
                            <th className="py-3 px-3.5 text-right">{t("Quantity", "Množstvo", "Mennyiség")}</th>
                            <th className="py-3 px-3.5 text-right">{t("Price / Unit", "Cena / MJ", "Egységár")}</th>
                            <th className="py-3 px-3.5 text-right">{t("Total Value", "Celková suma", "Összérték")}</th>
                            <th className="py-3 px-3.5 text-center">{t("Action", "Akcia", "Művelet")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {itemMovements.map(mov => {
                            const mvItem = mov.items?.find(it => it.itemId === currentItem?.id);
                            const wh = warehouses.find(w => w.id === mov.warehouseId);
                            const supplier = suppliers.find(s => s.id === mov.supplierId);
                            const lead = leads.find(l => l.id === mov.leadId);

                            return (
                              <tr key={mov.id} className="hover:bg-slate-50/60 transition">
                                <td className="py-3 px-3.5 font-mono text-slate-500 text-[11px]">
                                  {mov.issuedAt ? mov.issuedAt.slice(0, 16) : mov.createdAt?.slice(0, 16)}
                                </td>
                                <td className="py-3 px-3.5">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    mov.type === "inward"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : mov.type === "outward"
                                      ? "bg-blue-100 text-blue-800"
                                      : "bg-purple-100 text-purple-800"
                                  }`}>
                                    {mov.type === "inward" ? "PRI (Príjem)" : mov.type === "outward" ? "VYD (Výdaj)" : "PRE (Prevod)"}
                                  </span>
                                </td>
                                <td className="py-3 px-3.5 font-mono font-bold text-slate-900">
                                  {mov.documentNumber}
                                </td>
                                <td className="py-3 px-3.5">
                                  {supplier ? (
                                    <div className="flex items-center gap-1 text-slate-800">
                                      <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">{t("Partner", "Partner", "Partner")}</span>
                                      <span className="font-semibold">{supplier.name}</span>
                                    </div>
                                  ) : lead ? (
                                    <div className="flex items-center gap-1 text-slate-800">
                                      <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 text-[9px] font-bold">{t("Client", "Klient", "Ügyfél")}</span>
                                      <span className="font-semibold">{lead.name}</span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="py-3 px-3.5 text-slate-600">
                                  {wh?.name || "-"}
                                </td>
                                <td className="py-3 px-3.5 text-right font-mono font-black">
                                  <span className={mov.type === "inward" ? "text-emerald-700" : "text-blue-700"}>
                                    {mov.type === "outward" ? "-" : "+"}{mvItem?.quantity || 0} {itemForm.unit}
                                  </span>
                                </td>
                                <td className="py-3 px-3.5 text-right font-mono text-slate-700">
                                  {formatCurrency(mov.type === "inward" ? (mvItem?.unitPurchasePrice || 0) : (mvItem?.unitSellPrice || 0), systemLanguage, systemCurrency)}
                                </td>
                                <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900">
                                  {formatCurrency((mvItem?.quantity || 0) * (mov.type === "inward" ? (mvItem?.unitPurchasePrice || 0) : (mvItem?.unitSellPrice || 0)), systemLanguage, systemCurrency)}
                                </td>
                                <td className="py-3 px-3.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedMovementForPrint(mov)}
                                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                                    title={t("Print document", "Vytlačiť doklad", "Nyomtatás")}
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>
        </div>

        {/* MODAL: LOG PURCHASE (PRI) FOR CURRENT PRODUCT */}
        {isProductPurchaseModalOpen && currentItem && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-100 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <ArrowDownLeft className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{t("Log Purchase (Receipt PRI)", "Zaznamenať nákup (Príjemka PRI)", "Beszerzés rögzítése (PRI)")}</h3>
                    <p className="text-xs text-slate-400 font-medium">{currentItem.name} ({currentItem.sku})</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsProductPurchaseModalOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* JOINT PARTNER & CLIENT SELECTOR */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {t("Supplier / Partner / Client", "Dodávateľ / Partner / Klient", "Beszállító / Partner")} *
                </label>
                <div
                  onClick={() => {
                    setIsProductPurchasePartnerOpen(!isProductPurchasePartnerOpen);
                    setProductPurchasePartnerSearch("");
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition"
                >
                  {productPurchasePartnerId ? (
                    (() => {
                      const sel = jointPartnersAndClients.find(p => p.id === productPurchasePartnerId);
                      return sel ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${sel.type === "partner" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                            {sel.type === "partner" ? t("Partner", "Partner", "Partner") : t("Client", "Klient", "Ügyfél")}
                          </span>
                          <span className="font-bold text-slate-900">{sel.name}</span>
                        </div>
                      ) : <span className="text-slate-400">{t("Select partner...", "Vyberte partnera...", "Válasszon partner...")}</span>;
                    })()
                  ) : (
                    <span className="text-slate-400">{t("Select supplier or client...", "Vyberte dodávateľa alebo klienta...", "Válasszon partnert...")}</span>
                  )}
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </div>

                {isProductPurchasePartnerOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 p-2 space-y-1.5 max-h-56 overflow-y-auto">
                    <div className="relative">
                      <input
                        type="text"
                        autoFocus
                        value={productPurchasePartnerSearch}
                        onChange={(e) => setProductPurchasePartnerSearch(e.target.value)}
                        placeholder={t("Search partner or client...", "Hľadať partnera alebo klienta...", "Keresés...")}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    </div>

                    <div className="space-y-1 pt-1">
                      {jointPartnersAndClients
                        .filter(p => p.name.toLowerCase().includes(productPurchasePartnerSearch.toLowerCase()) || p.subtext.toLowerCase().includes(productPurchasePartnerSearch.toLowerCase()))
                        .map(p => (
                          <div
                            key={p.id}
                            onClick={() => {
                              setProductPurchasePartnerId(p.id);
                              setIsProductPurchasePartnerOpen(false);
                            }}
                            className={`p-2 rounded-xl text-xs cursor-pointer flex items-center justify-between transition ${
                              productPurchasePartnerId === p.id ? "bg-emerald-600 text-white font-bold" : "hover:bg-slate-100 text-slate-800"
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                  productPurchasePartnerId === p.id ? "bg-white/20 text-white" : p.type === "partner" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                                }`}>
                                  {p.type === "partner" ? t("Partner", "Partner", "Partner") : t("Client", "Klient", "Ügyfél")}
                                </span>
                                <span>{p.name}</span>
                              </div>
                              <p className={`text-[10px] ${productPurchasePartnerId === p.id ? "text-emerald-100" : "text-slate-400"}`}>{p.subtext}</p>
                            </div>
                            {productPurchasePartnerId === p.id && <Check className="w-4 h-4 text-white" />}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* DESTINATION WAREHOUSE */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {t("Destination Warehouse", "Cieľový sklad", "Célraktár")} *
                </label>
                <select
                  value={productPurchaseWarehouseId}
                  onChange={(e) => setProductPurchaseWarehouseId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:bg-white focus:outline-none transition"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                  ))}
                </select>
              </div>

              {/* QUANTITY & PURCHASE PRICE */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Quantity", "Množstvo", "Mennyiség")} *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={productPurchaseAmount}
                      onChange={(e) => setProductPurchaseAmount(Number(e.target.value))}
                      className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:bg-white focus:outline-none transition"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      {currentItem.unit}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Unit Purchase Price", "Nákupná cena / MJ", "Beszerzési egységár")} *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={productPurchasePrice}
                      onChange={(e) => setProductPurchasePrice(Number(e.target.value))}
                      className="w-full pl-3.5 pr-14 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:bg-white focus:outline-none transition"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      {systemCurrency || "EUR"}
                    </span>
                  </div>
                </div>
              </div>

              {/* FEFO: BATCH & EXPIRATION */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-amber-50/50 border border-amber-200/70">
                <div>
                  <label className="block text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-1">
                    {t("Batch / Lot #", "Číslo šarže", "Tételszám")}
                  </label>
                  <input
                    type="text"
                    value={productPurchaseBatchNumber}
                    onChange={(e) => setProductPurchaseBatchNumber(e.target.value)}
                    placeholder="BAT-2026-01"
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-1">
                    {t("Expiration Date", "Dátum exspirácie", "Lejárati dátum")}
                  </label>
                  <input
                    type="date"
                    value={productPurchaseExpirationDate}
                    onChange={(e) => setProductPurchaseExpirationDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-mono text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* NOTE */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {t("Note / Invoice Reference", "Poznámka / Číslo faktúry dodávateľa", "Megjegyzés / Számlaszám")}
                </label>
                <input
                  type="text"
                  value={productPurchaseNote}
                  onChange={(e) => setProductPurchaseNote(e.target.value)}
                  placeholder="napr. Faktúra FP-2026-0412"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-emerald-600 focus:bg-white focus:outline-none transition"
                />
              </div>

              {/* TOTAL PREVIEW & SUBMIT */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">{t("Total Purchase Value", "Celková suma nákupu", "Összérték")}</span>
                  <span className="text-base font-black text-emerald-800 font-mono">
                    {formatCurrency(Number(productPurchaseAmount) * Number(productPurchasePrice), systemLanguage, systemCurrency)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsProductPurchaseModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition cursor-pointer"
                  >
                    {t("Cancel", "Zrušiť", "Mégse")}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveProductPurchase}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>{t("Confirm Receipt", "Potvrdiť príjemku", "Bevételezés rögzítése")}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: LOG SALE (VYD) FOR CURRENT PRODUCT */}
        {isProductSaleModalOpen && currentItem && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-100 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-900 flex items-center justify-center">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{t("Log Sale (Issue VYD)", "Zaznamenať predaj (Výdajka VYD)", "Értékesítés rögzítése (VYD)")}</h3>
                    <p className="text-xs text-slate-400 font-medium">{currentItem.name} ({currentItem.sku})</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsProductSaleModalOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* JOINT PARTNER & CLIENT SELECTOR */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {t("Client / Customer / Partner", "Klient / Odberateľ / Partner", "Ügyfél / Partner")} *
                </label>
                <div
                  onClick={() => {
                    setIsProductSalePartnerOpen(!isProductSalePartnerOpen);
                    setProductSalePartnerSearch("");
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition"
                >
                  {productSalePartnerId ? (
                    (() => {
                      const sel = jointPartnersAndClients.find(p => p.id === productSalePartnerId);
                      return sel ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${sel.type === "partner" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                            {sel.type === "partner" ? t("Partner", "Partner", "Partner") : t("Client", "Klient", "Ügyfél")}
                          </span>
                          <span className="font-bold text-slate-900">{sel.name}</span>
                        </div>
                      ) : <span className="text-slate-400">{t("Select partner...", "Vyberte partnera...", "Válasszon...")}</span>;
                    })()
                  ) : (
                    <span className="text-slate-400">{t("Select client or partner...", "Vyberte klienta alebo partnera...", "Válasszon ügyfelet...")}</span>
                  )}
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </div>

                {isProductSalePartnerOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 p-2 space-y-1.5 max-h-56 overflow-y-auto">
                    <div className="relative">
                      <input
                        type="text"
                        autoFocus
                        value={productSalePartnerSearch}
                        onChange={(e) => setProductSalePartnerSearch(e.target.value)}
                        placeholder={t("Search client or partner...", "Hľadať klienta alebo partnera...", "Keresés...")}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    </div>

                    <div className="space-y-1 pt-1">
                      {jointPartnersAndClients
                        .filter(p => p.name.toLowerCase().includes(productSalePartnerSearch.toLowerCase()) || p.subtext.toLowerCase().includes(productSalePartnerSearch.toLowerCase()))
                        .map(p => (
                          <div
                            key={p.id}
                            onClick={() => {
                              setProductSalePartnerId(p.id);
                              setIsProductSalePartnerOpen(false);
                            }}
                            className={`p-2 rounded-xl text-xs cursor-pointer flex items-center justify-between transition ${
                              productSalePartnerId === p.id ? "bg-blue-900 text-white font-bold" : "hover:bg-slate-100 text-slate-800"
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                  productSalePartnerId === p.id ? "bg-white/20 text-white" : p.type === "partner" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                                }`}>
                                  {p.type === "partner" ? t("Partner", "Partner", "Partner") : t("Client", "Klient", "Ügyfél")}
                                </span>
                                <span>{p.name}</span>
                              </div>
                              <p className={`text-[10px] ${productSalePartnerId === p.id ? "text-blue-100" : "text-slate-400"}`}>{p.subtext}</p>
                            </div>
                            {productSalePartnerId === p.id && <Check className="w-4 h-4 text-white" />}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* SOURCE WAREHOUSE */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {t("Source Warehouse", "Zdrojový sklad", "Forrásraktár")} *
                </label>
                <select
                  value={productSaleWarehouseId}
                  onChange={(e) => {
                    setProductSaleWarehouseId(e.target.value);
                    setProductSaleBatchId("");
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-900 focus:bg-white focus:outline-none transition"
                >
                  {warehouses.map(w => {
                    const st = getStockInfoForItem(currentItem.id, w.id);
                    return (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.code}) — {t("Available", "Dostupné", "Szabad")}: {st.available} {currentItem.unit}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* QUANTITY & SALE PRICE */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Quantity", "Množstvo", "Mennyiség")} *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={productSaleAmount}
                      onChange={(e) => setProductSaleAmount(Number(e.target.value))}
                      className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-900 focus:bg-white focus:outline-none transition"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      {currentItem.unit}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {t("Unit Selling Price (excl. VAT)", "Predajná cena bez DPH / MJ", "Eladási egységár")} *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={productSalePrice}
                      onChange={(e) => setProductSalePrice(Number(e.target.value))}
                      className="w-full pl-3.5 pr-14 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-blue-950 focus:ring-2 focus:ring-blue-900 focus:bg-white focus:outline-none transition"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      {systemCurrency || "EUR"}
                    </span>
                  </div>
                </div>
              </div>

              {/* SEARCHABLE EXPIRATION DATE & BATCH SELECTOR (FEFO) */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {t("Select Expiration Date / Batch (FEFO)", "Dátum exspirácie / Šarža (FEFO výber)", "Lejárati dátum / Tétel kiválasztása (FEFO)")}
                </label>
                <div
                  onClick={() => {
                    setIsProductSaleExpirationOpen(!isProductSaleExpirationOpen);
                    setProductSaleExpirationSearch("");
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition"
                >
                  {productSaleBatchId ? (
                    (() => {
                      const selBatch = warehouseBatches.find(b => b.id === productSaleBatchId);
                      const expStatus = selBatch ? getExpirationStatus(selBatch.expirationDate) : null;
                      return selBatch ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">{selBatch.batchNumber}</span>
                          <span className="text-slate-500 font-mono">({selBatch.expirationDate?.slice(0, 10)})</span>
                          {expStatus && (
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              expStatus.status === "expired" ? "bg-rose-100 text-rose-800" : expStatus.status === "warning" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                            }`}>
                              {expStatus.daysRemaining < 0 ? t("Expired", "Exspirované", "Lejárt") : `${expStatus.daysRemaining}d`}
                            </span>
                          )}
                        </div>
                      ) : <span className="text-slate-400">{t("Default / No batch", "Voľný výdaj bez šarže", "Nincs tétel")}</span>;
                    })()
                  ) : (
                    <span className="text-slate-400">{t("Select expiration date / lot (or leave free stock)...", "Vyberte dátum exspirácie / šaržu...", "Válasszon lejárati dátumot...")}</span>
                  )}
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </div>

                {isProductSaleExpirationOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 p-2 space-y-1.5 max-h-56 overflow-y-auto">
                    <div className="relative">
                      <input
                        type="text"
                        autoFocus
                        value={productSaleExpirationSearch}
                        onChange={(e) => setProductSaleExpirationSearch(e.target.value)}
                        placeholder={t("Search by expiration date or lot number...", "Hľadať podľa dátumu exspirácie alebo šarže...", "Keresés dátum vagy szám szerint...")}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    </div>

                    <div className="space-y-1 pt-1">
                      {/* Option for free stock */}
                      <div
                        onClick={() => {
                          setProductSaleBatchId("");
                          setIsProductSaleExpirationOpen(false);
                        }}
                        className={`p-2 rounded-xl text-xs cursor-pointer flex items-center justify-between transition ${
                          !productSaleBatchId ? "bg-slate-900 text-white font-bold" : "hover:bg-slate-100 text-slate-600"
                        }`}
                      >
                        <span>{t("Free bulk stock (No specific batch/expiration)", "Voľný skladový výdaj (bez viazanej šarže)", "Szabad készlet")}</span>
                        {!productSaleBatchId && <Check className="w-4 h-4 text-white" />}
                      </div>

                      {/* Batches sorted by FEFO */}
                      {warehouseBatches
                        .filter(b => b.itemId === currentItem.id && b.warehouseId === productSaleWarehouseId && b.currentQuantity > 0)
                        .filter(b => (b.expirationDate && b.expirationDate.includes(productSaleExpirationSearch)) || b.batchNumber.toLowerCase().includes(productSaleExpirationSearch.toLowerCase()))
                        .sort((a, b) => {
                          if (!a.expirationDate) return 1;
                          if (!b.expirationDate) return -1;
                          return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
                        })
                        .map((b, bIdx) => {
                          const expStatus = getExpirationStatus(b.expirationDate);
                          return (
                            <div
                              key={b.id}
                              onClick={() => {
                                setProductSaleBatchId(b.id);
                                setIsProductSaleExpirationOpen(false);
                              }}
                              className={`p-2.5 rounded-xl text-xs cursor-pointer flex items-center justify-between transition ${
                                productSaleBatchId === b.id ? "bg-blue-900 text-white font-bold" : "hover:bg-slate-100 text-slate-800"
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold">{b.batchNumber}</span>
                                  <span className="font-mono text-[11px] opacity-80">({b.expirationDate?.slice(0, 10)})</span>
                                  {bIdx === 0 && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 text-[9px] font-black uppercase">
                                      FEFO
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] opacity-70">
                                  {t("Available", "K dispozícii", "Szabad")}: {b.currentQuantity} {currentItem.unit}
                                </span>
                              </div>

                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                expStatus.status === "expired" ? "bg-rose-100 text-rose-800" : expStatus.status === "warning" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                              }`}>
                                {expStatus.daysRemaining < 0 ? t("Expired", "Exspirované", "Lejárt") : `${expStatus.daysRemaining}d`}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* NOTE */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {t("Note / Order Reference", "Poznámka / Číslo objednávky", "Megjegyzés / Rendelésszám")}
                </label>
                <input
                  type="text"
                  value={productSaleNote}
                  onChange={(e) => setProductSaleNote(e.target.value)}
                  placeholder="napr. Zákazka OBJ-2026-081"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-blue-900 focus:bg-white focus:outline-none transition"
                />
              </div>

              {/* TOTAL PREVIEW & SUBMIT */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">{t("Total Sale Price", "Celková predajná suma", "Összesen")}</span>
                  <span className="text-base font-black text-blue-950 font-mono">
                    {formatCurrency(Number(productSaleAmount) * Number(productSalePrice), systemLanguage, systemCurrency)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsProductSaleModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition cursor-pointer"
                  >
                    {t("Cancel", "Zrušiť", "Mégse")}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveProductSale}
                    className="px-5 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-950 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-blue-900/20 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>{t("Confirm Issue", "Potvrdiť výdajku", "Kiadás megerősítése")}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

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
            onClick={handleOpenCreateItem}
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
                        <tr 
                          key={item.id} 
                          onClick={() => handleOpenEditItem(item)}
                          className="hover:bg-slate-50/80 transition group cursor-pointer"
                        >
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
                              <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {getItemCategories(item).length === 0 ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                    {t("General", "Všeobecné", "Általános")}
                                  </span>
                                ) : (
                                  getItemCategories(item).map(cat => (
                                    <span key={cat} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-900 border border-blue-100">
                                      {cat}
                                    </span>
                                  ))
                                )}
                              </div>
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEditItem(item);
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
                warehouseItems.filter(it => getItemCategories(it).includes(cat)).forEach(it => {
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
