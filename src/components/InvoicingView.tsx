import React, { useState, useMemo } from "react";
import { 
  FileText, Plus, Search, Filter, Download, Printer, Eye, Trash2, 
  CheckCircle2, Clock, AlertCircle, Sparkles, Building2, Package, 
  Send, ExternalLink, ArrowRight, Check, X, ShieldCheck, ChevronRight,
  TrendingUp, Award, Layers, RefreshCw
} from "lucide-react";
import type { 
  InvoiceOffer, InvoiceOfferItem, InvoiceOfferType, InvoiceOfferMode, 
  InvoiceOfferStatus, Lead, WarehouseItem, CompanyBillingSettings, 
  AiCustomTemplate, ExternalInvoicingConfig, TimelineEvent, UserProfile 
} from "../types";
import { DefaultOfferTemplate } from "./pdf/DefaultOfferTemplate";
import { CustomAiOfferTemplate } from "./pdf/CustomAiOfferTemplate";
import { CustomSelect } from "./ui/CustomSelect";
import { cn } from "../utils/cn";

interface InvoicingViewProps {
  invoicesOffers: InvoiceOffer[];
  setInvoicesOffers: React.Dispatch<React.SetStateAction<InvoiceOffer[]>>;
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  warehouseItems: WarehouseItem[];
  companyBillingSettings?: CompanyBillingSettings | null;
  aiCustomTemplates?: AiCustomTemplate[];
  invoicingIntegrations?: ExternalInvoicingConfig | null;
  currentUser: UserProfile | null;
  systemLanguage?: string;
  systemCurrency?: string;
  onOpenSettings?: () => void;
  onAddTimelineEvent?: (leadId: string, event: TimelineEvent) => void;
}

export const InvoicingView: React.FC<InvoicingViewProps> = ({
  invoicesOffers = [],
  setInvoicesOffers,
  leads = [],
  setLeads,
  warehouseItems = [],
  companyBillingSettings,
  aiCustomTemplates = [],
  invoicingIntegrations,
  currentUser,
  systemLanguage = "sk",
  systemCurrency = "EUR",
  onOpenSettings,
  onAddTimelineEvent
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [modeFilter, setModeFilter] = useState<string>("all");

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [previewOffer, setPreviewOffer] = useState<InvoiceOffer | null>(null);
  const [isExternalLoading, setIsExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState<string | null>(null);

  // Form State for creating a new offer / invoice
  const [draftType, setDraftType] = useState<InvoiceOfferType>("price_offer");
  const [draftMode, setDraftMode] = useState<InvoiceOfferMode>("default");
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  
  // Header details
  const [title, setTitle] = useState("Predbežná cenová ponuka");
  const [subject, setSubject] = useState("");
  const [location, setLocation] = useState("");
  const [greetingNote, setGreetingNote] = useState("");
  const [introNote, setIntroNote] = useState("");
  const [reassuranceNote, setReassuranceNote] = useState("Garancia najvyššej kvality certifikovaných materiálov a technologických postupov.");
  
  // 4 USP Cards
  const [uspCards, setUspCards] = useState([
    { title: "18 rokov skúseností", subtitle: "Viac ako 1 000 000 m² zrealizovaných projektov – zvládame aj náročné detaily." },
    { title: "Certifikované materiály", subtitle: "Výhradne certifikované systémy a presné dodržiavanie noriem." },
    { title: "Žiadne zálohy vopred", subtitle: "Platíte až po úspešnom dokončení práce – riziko preberáme my." },
    { title: "10-ročná záruka", subtitle: "Istota a garancia, ktorú vám radi potvrdíme zmluvne." }
  ]);

  // Scope Items
  const [items, setItems] = useState<InvoiceOfferItem[]>([]);
  const [priceRangeMin, setPriceRangeMin] = useState<string>("");
  const [priceRangeMax, setPriceRangeMax] = useState<string>("");

  // Parameters
  const [durationText, setDurationText] = useState("2–3 dni");
  const [startDateText, setStartDateText] = useState("Koniec mesiaca");
  const [warrantyText, setWarrantyText] = useState("10 rokov");
  const [nextStepsNote, setNextStepsNote] = useState("Aby sme vám vedeli pripraviť finálnu cenovú ponuku, radi by sme k vám poslali nášho technika na bezplatnú obhliadku. Stačí nám napísať alebo zavolať.");
  const [closingNote, setClosingNote] = useState("Tešíme sa, že sa staneme vaším overeným partnerom.");
  const [signOffTeam, setSignOffTeam] = useState(companyBillingSettings?.companyName ? `Tím ${companyBillingSettings.companyName}` : "Tím CCRM");

  // Selected Lead object
  const selectedLead = useMemo(() => {
    return leads.find(l => l.id === selectedLeadId) || null;
  }, [leads, selectedLeadId]);

  // When Lead is selected, auto-fill client fields and default notes
  const handleSelectLead = (leadId: string) => {
    setSelectedLeadId(leadId);
    const ld = leads.find(l => l.id === leadId);
    if (ld) {
      setSubject(ld.interestNote || `Cenová ponuka pre ${ld.name}`);
      setLocation(ld.city || (ld.address?.city || ""));
      setGreetingNote(`Dobrý deň, ${ld.name},`);
      setIntroNote(`ďakujeme, že ste sa na nás obrátili so žiadosťou o cenovú ponuku. Vážime si Váš záujem a pripravili sme pre Vás nasledujúci rozsah riešenia.`);
    }
  };

  // Warehouse Item Addition
  const handleAddWarehouseProduct = (whItem: WarehouseItem) => {
    const newItem: InvoiceOfferItem = {
      id: "ioi-" + Math.random().toString(36).substr(2, 9),
      warehouseItemId: whItem.id,
      sku: whItem.sku,
      name: whItem.name,
      description: whItem.description || "",
      quantity: 1,
      unit: whItem.unit || "ks",
      unitPrice: whItem.defaultSellPrice || 0,
      vatRate: 20,
      discountPct: 0,
      totalPrice: whItem.defaultSellPrice || 0
    };
    setItems(prev => [...prev, newItem]);
  };

  const handleAddCustomItem = () => {
    const newItem: InvoiceOfferItem = {
      id: "ioi-" + Math.random().toString(36).substr(2, 9),
      name: "Nová položka / Práca",
      description: "Popis dodávky alebo služby",
      quantity: 1,
      unit: "ks",
      unitPrice: 100,
      vatRate: 20,
      discountPct: 0,
      totalPrice: 100
    };
    setItems(prev => [...prev, newItem]);
  };

  const handleUpdateItem = (id: string, updates: Partial<InvoiceOfferItem>) => {
    setItems(prev => prev.map(it => {
      if (it.id === id) {
        const merged = { ...it, ...updates };
        const base = (merged.quantity || 0) * (merged.unitPrice || 0);
        const discountFactor = (100 - (merged.discountPct || 0)) / 100;
        merged.totalPrice = Math.round(base * discountFactor * 100) / 100;
        return merged;
      }
      return it;
    }));
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  };

  // Calculations
  const calculatedTotals = useMemo(() => {
    const subtotal = items.reduce((acc, it) => acc + (it.totalPrice || 0), 0);
    const vatAmount = items.reduce((acc, it) => acc + ((it.totalPrice || 0) * ((it.vatRate || 20) / 100)), 0);
    const grandTotal = subtotal + vatAmount;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      vatAmount: Math.round(vatAmount * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100
    };
  }, [items]);

  // Filtered List
  const filteredOffers = useMemo(() => {
    return invoicesOffers.filter(io => {
      const matchesSearch = 
        (io.clientName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (io.documentNumber || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (io.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (io.subject || "").toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = typeFilter === "all" || io.type === typeFilter;
      const matchesStatus = statusFilter === "all" || io.status === statusFilter;
      const matchesMode = modeFilter === "all" || io.mode === modeFilter;

      return matchesSearch && matchesType && matchesStatus && matchesMode;
    });
  }, [invoicesOffers, searchQuery, typeFilter, statusFilter, modeFilter]);

  // Overall Metrics
  const metrics = useMemo(() => {
    const totalOffersVal = invoicesOffers.filter(o => o.type === "price_offer").reduce((sum, o) => sum + (o.totalPrice || 0), 0);
    const totalInvoicedVal = invoicesOffers.filter(o => o.type === "invoice" || o.status === "approved").reduce((sum, o) => sum + (o.totalPrice || 0), 0);
    const approvedCount = invoicesOffers.filter(o => o.status === "approved" || o.status === "invoiced").length;
    const totalCount = invoicesOffers.length;
    const winRate = totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0;
    return { totalOffersVal, totalInvoicedVal, approvedCount, totalCount, winRate };
  }, [invoicesOffers]);

  // Reset and open modal
  const handleOpenCreateModal = () => {
    setModalStep(1);
    setDraftType("price_offer");
    setDraftMode("default");
    setSelectedLeadId(leads[0]?.id || "");
    if (leads[0]) handleSelectLead(leads[0].id);
    setItems([
      {
        id: "ioi-1",
        name: "Dodávka certifikovaného materiálu",
        description: "Podľa technologickej špecifikácie",
        quantity: 1,
        unit: "kpl",
        unitPrice: 2400,
        vatRate: 20,
        discountPct: 0,
        totalPrice: 2400
      },
      {
        id: "ioi-2",
        name: "Odborná montáž a technologický postup",
        description: "Kompletné práce, kotvenie, pofóliované prvky a tesnenie",
        quantity: 1,
        unit: "kpl",
        unitPrice: 1500,
        vatRate: 20,
        discountPct: 0,
        totalPrice: 1500
      }
    ]);
    setPriceRangeMin("3900");
    setPriceRangeMax("4100");
    setExternalError(null);
    setIsCreateModalOpen(true);
  };

  // Save and issue offer
  const handleSaveOffer = async () => {
    if (!selectedLead) {
      alert("Prosím vyberte klienta/lead.");
      return;
    }

    const docPrefix = draftType === "price_offer" ? "CP" : draftType === "proforma" ? "ZF" : "FA";
    const year = new Date().getFullYear();
    const docNum = `${docPrefix}-${year}-${String(invoicesOffers.length + 1).padStart(3, "0")}`;

    const newOffer: InvoiceOffer = {
      id: "io-" + Math.random().toString(36).substr(2, 9),
      documentNumber: docNum,
      type: draftType,
      mode: draftMode,
      leadId: selectedLead.id,
      clientId: selectedLead.id,
      clientName: selectedLead.name,
      clientEmail: selectedLead.email,
      clientPhone: selectedLead.phone,
      clientStreet: selectedLead.address?.street,
      clientCity: selectedLead.city || selectedLead.address?.city,
      clientPostalCode: selectedLead.address?.postalCode,
      clientCountry: selectedLead.address?.country || "Slovensko",
      clientIco: selectedLead.companyId,
      clientDic: selectedLead.taxId,
      clientIcdph: selectedLead.vatId,
      title: title || (draftType === "price_offer" ? "Predbežná cenová ponuka" : "Faktúra"),
      subject: subject || "Cenová ponuka",
      location: location || selectedLead.city,
      greetingNote: greetingNote,
      introNote: introNote,
      uspCards: uspCards,
      reassuranceNote: reassuranceNote,
      items: items,
      subtotal: calculatedTotals.subtotal,
      vatAmount: calculatedTotals.vatAmount,
      totalPrice: calculatedTotals.grandTotal,
      priceRangeMin: priceRangeMin ? parseFloat(priceRangeMin) : null,
      priceRangeMax: priceRangeMax ? parseFloat(priceRangeMax) : null,
      currency: systemCurrency,
      durationText: durationText,
      startDateText: startDateText,
      warrantyText: warrantyText,
      nextStepsNote: nextStepsNote,
      closingNote: closingNote,
      signOffTeam: signOffTeam,
      customTemplateId: selectedTemplateId || null,
      status: "draft",
      issuedAt: new Date().toISOString().split("T")[0],
      validUntil: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      createdBy: currentUser?.name || "Používateľ"
    };

    // If External (SuperFaktura or iDoklad), call the backend connector
    if (draftMode === "external") {
      const provider = invoicingIntegrations?.superfaktura?.enabled ? "superfaktura" : "idoklad";
      setIsExternalLoading(true);
      setExternalError(null);
      try {
        const endpoint = provider === "superfaktura" ? "/api/superfaktura.php" : "/api/idoklad.php";
        const actionName = draftType === "invoice" ? "create_invoice" : "create_estimate";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: actionName,
            document: newOffer
          })
        });
        const data = await res.json();
        if (data.success) {
          newOffer.externalProvider = provider;
          newOffer.externalId = data.externalId;
          newOffer.externalPdfUrl = data.externalPdfUrl;
          if (data.documentNumber) newOffer.documentNumber = data.documentNumber;
        } else {
          setExternalError(data.message || "Chyba komunikácie s externou službou");
          setIsExternalLoading(false);
          return;
        }
      } catch (err: any) {
        setExternalError("Zlyhalo volanie externého API: " + err.message);
        setIsExternalLoading(false);
        return;
      }
      setIsExternalLoading(false);
    }

    // Save to list
    setInvoicesOffers(prev => [newOffer, ...prev]);

    // Attach to Lead Timeline
    const timelineEvent: TimelineEvent = {
      id: "ev-" + Math.random().toString(36).substr(2, 9),
      type: draftType === "price_offer" ? "offer" : draftType === "proforma" ? "proforma_invoice" : "invoice",
      timestamp: new Date().toISOString().replace("T", " ").slice(0, 16),
      title: `${newOffer.title} (${newOffer.documentNumber})`,
      content: `Vystavený doklad pre klienta v hodnote ${newOffer.totalPrice.toLocaleString("sk-SK")} ${newOffer.currency}. Predmet: ${newOffer.subject}`,
      amount: newOffer.totalPrice,
      fileName: `${newOffer.documentNumber}.pdf`,
      author: currentUser?.name || "Systém"
    };

    if (onAddTimelineEvent) {
      onAddTimelineEvent(selectedLead.id, timelineEvent);
    } else {
      setLeads(prev => prev.map(l => {
        if (l.id === selectedLead.id) {
          return {
            ...l,
            timeline: [timelineEvent, ...(l.timeline || [])]
          };
        }
        return l;
      }));
    }

    setIsCreateModalOpen(false);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn">
      
      {/* Top Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 rounded-2xl">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                Cenové ponuky a fakturácia
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Vystavujte precízne cenové ponuky, AI šablóny a doklady prepojené so skladom a CRM.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={handleOpenCreateModal}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider px-5 py-3 rounded-2xl shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Nová cenová ponuka / Faktúra
          </button>
        </div>
      </div>

      {/* KPI Stats Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/50 text-blue-600 rounded-2xl">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Objem ponúk</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
              {metrics.totalOffersVal.toLocaleString("sk-SK", { maximumFractionDigits: 0 })} {systemCurrency}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 rounded-2xl">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vyfakturované</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
              {metrics.totalInvoicedVal.toLocaleString("sk-SK", { maximumFractionDigits: 0 })} {systemCurrency}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/50 text-amber-600 rounded-2xl">
            <Award className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Úspešnosť schválenia</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
              {metrics.winRate} %
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 dark:bg-purple-950/50 text-purple-600 rounded-2xl">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Celkom dokladov</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
              {metrics.totalCount}
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Hľadať doklad, klienta alebo číslo..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-200"
          >
            <option value="all">Všetky typy dokladov</option>
            <option value="price_offer">Cenové ponuky</option>
            <option value="proforma">Zálohové faktúry</option>
            <option value="invoice">Ostré faktúry</option>
          </select>

          <select
            value={modeFilter}
            onChange={e => setModeFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-200"
          >
            <option value="all">Všetky formáty</option>
            <option value="default">Štandardná šablóna</option>
            <option value="custom">AI Vlastná šablóna</option>
            <option value="external">SuperFaktúra / iDoklad</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-200"
          >
            <option value="all">Všetky stavy</option>
            <option value="draft">Návrh (Draft)</option>
            <option value="sent">Odoslaná</option>
            <option value="approved">Schválená</option>
            <option value="rejected">Zamietnutá</option>
            <option value="invoiced">Vyfakturovaná</option>
          </select>
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800">
                <th className="p-4">Číslo dokladu</th>
                <th className="p-4">Typ a šablóna</th>
                <th className="p-4">Klient / Lead</th>
                <th className="p-4">Dátum vystavenia</th>
                <th className="p-4 text-right">Suma</th>
                <th className="p-4 text-center">Stav</th>
                <th className="p-4 text-right">Akcie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredOffers.length > 0 ? (
                filteredOffers.map((offer) => (
                  <tr key={offer.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-4 font-mono font-bold text-slate-900 dark:text-white">
                      {offer.documentNumber}
                      {offer.externalId && (
                        <span className="block text-[10px] text-slate-400 font-sans">
                          Ext ID: {offer.externalId} ({offer.externalProvider})
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        {offer.title}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          offer.mode === "default" ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" :
                          offer.mode === "custom" ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" :
                          "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        )}>
                          {offer.mode === "default" ? "Štandard" : offer.mode === "custom" ? "AI Šablóna" : offer.externalProvider || "Externé"}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {offer.clientName}
                      </div>
                      {offer.location && (
                        <div className="text-[11px] text-slate-400">
                          {offer.location}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-slate-600 dark:text-slate-400">
                      {offer.issuedAt}
                    </td>
                    <td className="p-4 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {offer.totalPrice.toLocaleString("sk-SK", { minimumFractionDigits: 2 })} {offer.currency}
                    </td>
                    <td className="p-4 text-center">
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        offer.status === "approved" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" :
                        offer.status === "sent" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" :
                        offer.status === "rejected" ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" :
                        "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      )}>
                        {offer.status === "draft" ? "Návrh" : offer.status === "sent" ? "Odoslaná" : offer.status === "approved" ? "Schválená" : offer.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setPreviewOffer(offer)}
                          title="Náhľad / Tlač"
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Naozaj chcete zmazať tento doklad?")) {
                              setInvoicesOffers(prev => prev.filter(o => o.id !== offer.id));
                            }
                          }}
                          title="Odstrániť"
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                    Zatiaľ neboli vytvorené žiadne cenové ponuky ani faktúry. Kliknite na tlačidlo "Nová cenová ponuka / Faktúra".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE OFFER / INVOICE MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  Vytvorenie cenovej ponuky / faktúry
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-bold text-indigo-600">Krok {modalStep} z 5</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-500 font-medium">
                    {modalStep === 1 && "Výber formátu a typu dokladu"}
                    {modalStep === 2 && "Prepojenie s klientom a leadom"}
                    {modalStep === 3 && "Položky a skladové zásoby"}
                    {modalStep === 4 && "Parametre, výhody a texty"}
                    {modalStep === 5 && "Živý náhľad a vystavenie"}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              
              {/* STEP 1: Format & Mode */}
              {modalStep === 1 && (
                <div className="space-y-6">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-2">
                      1. Typ dokladu
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { type: "price_offer", label: "Cenová ponuka", desc: "Ponuka pre klienta s rozsahom prác a garanciou" },
                        { type: "proforma", label: "Zálohová faktúra", desc: "Zálohový doklad pred zahájením prác" },
                        { type: "invoice", label: "Ostrá faktúra", desc: "Vyúčtovacia faktúra s DPH a splatnosťou" }
                      ].map(item => (
                        <div
                          key={item.type}
                          onClick={() => setDraftType(item.type as any)}
                          className={cn(
                            "p-4 rounded-2xl border-2 cursor-pointer transition-all",
                            draftType === item.type 
                              ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-200 shadow-sm" 
                              : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                          )}
                        >
                          <div className="font-bold text-sm">{item.label}</div>
                          <div className="text-xs text-slate-500 mt-1">{item.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-2">
                      2. Spôsob a šablóna generovania
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div
                        onClick={() => setDraftMode("default")}
                        className={cn(
                          "p-4 rounded-2xl border-2 cursor-pointer transition-all",
                          draftMode === "default" 
                            ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-sm" 
                            : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                        )}
                      >
                        <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                          <Award className="h-4 w-4 text-orange-500" />
                          Štandardná šablóna
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Vstavaná firemná šablóna so všetkými 10 blokmi, USP kartami a garanciami.
                        </div>
                      </div>

                      <div
                        onClick={() => setDraftMode("custom")}
                        className={cn(
                          "p-4 rounded-2xl border-2 cursor-pointer transition-all",
                          draftMode === "custom" 
                            ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-sm" 
                            : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                        )}
                      >
                        <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                          <Sparkles className="h-4 w-4 text-purple-500" />
                          AI Vlastná šablóna
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Vygenerovaná pomocou AI z vami nahraného PDF s automatickým doplnením polí.
                        </div>
                      </div>

                      <div
                        onClick={() => setDraftMode("external")}
                        className={cn(
                          "p-4 rounded-2xl border-2 cursor-pointer transition-all",
                          draftMode === "external" 
                            ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-sm" 
                            : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                        )}
                      >
                        <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                          <ExternalLink className="h-4 w-4 text-blue-500" />
                          SuperFaktúra / iDoklad
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Priame odoslanie a vystavenie cez API do vášho účtovníctva.
                        </div>
                      </div>
                    </div>
                  </div>

                  {draftMode === "custom" && aiCustomTemplates.length > 0 && (
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-2">
                        Vyberte AI šablónu
                      </label>
                      <select
                        value={selectedTemplateId}
                        onChange={e => setSelectedTemplateId(e.target.value)}
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs text-slate-900 dark:text-white"
                      >
                        <option value="">Najnovšia generovaná šablóna</option>
                        {aiCustomTemplates.map(t => (
                          <option key={t.id} value={t.id}>{t.name} ({t.createdAt.slice(0, 10)})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: Lead & Client Selection */}
              {modalStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-2">
                      Vyberte klienta / lead (povinné)
                    </label>
                    <select
                      value={selectedLeadId}
                      onChange={e => handleSelectLead(e.target.value)}
                      className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs text-slate-900 dark:text-white font-semibold focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Vyberte klienta zo zoznamu --</option>
                      {leads.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.name} {l.city ? `(${l.city})` : ""} — {l.companyId ? `IČO: ${l.companyId}` : "Fyzická osoba"}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedLead && (
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                        <span>Fakturačné údaje klienta</span>
                        <span className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full font-bold">
                          Prepojené s CRM
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600 dark:text-slate-300">
                        <div><strong className="text-slate-800 dark:text-white">Názov/Meno:</strong> {selectedLead.name}</div>
                        <div><strong className="text-slate-800 dark:text-white">Email:</strong> {selectedLead.email || "Neuvedený"}</div>
                        <div><strong className="text-slate-800 dark:text-white">Telefón:</strong> {selectedLead.phone || "Neuvedený"}</div>
                        <div><strong className="text-slate-800 dark:text-white">Adresa:</strong> {selectedLead.address?.street || ""}, {selectedLead.city || selectedLead.address?.city || ""}</div>
                        <div><strong className="text-slate-800 dark:text-white">IČO:</strong> {selectedLead.companyId || "Neuvedené"}</div>
                        <div><strong className="text-slate-800 dark:text-white">DIČ / IČ DPH:</strong> {selectedLead.taxId || ""} {selectedLead.vatId || ""}</div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-1">
                        Predmet ponuky / Názov zákazky
                      </label>
                      <input
                        type="text"
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        placeholder="napr. Rekonštrukcia plochej strechy"
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-1">
                        Lokalita / Miesto realizácie
                      </label>
                      <input
                        type="text"
                        value={location}
                        onChange={e => setLocation(e.target.value)}
                        placeholder="napr. Šahy"
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Items & Scope of Delivery */}
              {modalStep === 3 && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                        Rozsah položiek a prác
                      </h3>
                      <p className="text-xs text-slate-500">
                        Pridajte tovar priamo zo skladu alebo doplňte vlastné položky.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleAddCustomItem}
                        className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all cursor-pointer"
                      >
                        + Vlastná položka
                      </button>
                    </div>
                  </div>

                  {/* Warehouse Quick Picker */}
                  {warehouseItems.length > 0 && (
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-indigo-600" />
                        Rýchly výber zo skladu ({warehouseItems.length} položiek k dispozícii)
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                        {warehouseItems.slice(0, 8).map(wh => (
                          <button
                            key={wh.id}
                            type="button"
                            onClick={() => handleAddWarehouseProduct(wh)}
                            className="px-2.5 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs font-medium hover:border-indigo-500 hover:text-indigo-600 transition-all text-left cursor-pointer"
                          >
                            + {wh.name} ({wh.defaultSellPrice} €/{wh.unit})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Items List Table */}
                  <div className="space-y-2.5">
                    {items.map((item, idx) => (
                      <div key={item.id} className="p-3.5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={item.name}
                            onChange={e => handleUpdateItem(item.id, { name: e.target.value })}
                            placeholder="Názov položky"
                            className="font-bold text-xs text-slate-900 dark:text-white bg-transparent flex-1 border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none"
                          />
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <input
                          type="text"
                          value={item.description || ""}
                          onChange={e => handleUpdateItem(item.id, { description: e.target.value })}
                          placeholder="Podrobná špecifikácia materiálu alebo montáže"
                          className="w-full text-xs text-slate-500 bg-transparent border-b border-slate-100 dark:border-slate-700 focus:outline-none"
                        />

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                          <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase">Množstvo</label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={e => handleUpdateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                                className="w-16 p-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold"
                              />
                              <input
                                type="text"
                                value={item.unit}
                                onChange={e => handleUpdateItem(item.id, { unit: e.target.value })}
                                className="w-12 p-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-center"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase">Jedn. cena (€)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={item.unitPrice}
                              onChange={e => handleUpdateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                              className="w-full p-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase">DPH %</label>
                            <select
                              value={item.vatRate}
                              onChange={e => handleUpdateItem(item.id, { vatRate: parseFloat(e.target.value) || 20 })}
                              className="w-full p-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                            >
                              <option value={20}>20 %</option>
                              <option value={10}>10 %</option>
                              <option value={0}>0 %</option>
                            </select>
                          </div>

                          <div className="text-right">
                            <label className="text-[10px] text-slate-400 font-bold uppercase block">Spolu</label>
                            <span className="font-bold text-xs text-slate-900 dark:text-white mt-1 block">
                              {item.totalPrice.toLocaleString("sk-SK", { minimumFractionDigits: 2 })} €
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pricing Overview & Price Range Options */}
                  <div className="p-4 bg-slate-950 text-white rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-3">
                    <div>
                      <div className="text-xs text-slate-400 font-medium">Kalkulovaná celková cena s DPH:</div>
                      <div className="text-2xl font-black text-orange-400">
                        {calculatedTotals.grandTotal.toLocaleString("sk-SK", { minimumFractionDigits: 2 })} {systemCurrency}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Základ: {calculatedTotals.subtotal.toLocaleString("sk-SK", { minimumFractionDigits: 2 })} € · DPH: {calculatedTotals.vatAmount.toLocaleString("sk-SK", { minimumFractionDigits: 2 })} €
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div>
                        <label className="text-[10px] text-slate-300 font-bold block">Min. rozpätie</label>
                        <input
                          type="text"
                          value={priceRangeMin}
                          onChange={e => setPriceRangeMin(e.target.value)}
                          placeholder="3900"
                          className="w-20 p-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-300 font-bold block">Max. rozpätie</label>
                        <input
                          type="text"
                          value={priceRangeMax}
                          onChange={e => setPriceRangeMax(e.target.value)}
                          placeholder="4100"
                          className="w-20 p-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: Parameters & USP Cards */}
              {modalStep === 4 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-1">
                        Dĺžka realizácie
                      </label>
                      <input
                        type="text"
                        value={durationText}
                        onChange={e => setDurationText(e.target.value)}
                        placeholder="napr. 2–3 dni"
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-1">
                        Termín nástupu
                      </label>
                      <input
                        type="text"
                        value={startDateText}
                        onChange={e => setStartDateText(e.target.value)}
                        placeholder="napr. Koniec mesiaca"
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-1">
                        Záruka
                      </label>
                      <input
                        type="text"
                        value={warrantyText}
                        onChange={e => setWarrantyText(e.target.value)}
                        placeholder="napr. 10 rokov"
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-1">
                      Ďalší krok (Výzva k akcii / Obhliadka)
                    </label>
                    <textarea
                      rows={2}
                      value={nextStepsNote}
                      onChange={e => setNextStepsNote(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-2">
                      4 Kľúčové výhody realizácie (USP karty)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {uspCards.map((usp, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                          <input
                            type="text"
                            value={usp.title}
                            onChange={e => {
                              const updated = [...uspCards];
                              updated[idx].title = e.target.value;
                              setUspCards(updated);
                            }}
                            className="font-bold text-xs w-full bg-transparent border-b border-slate-200 dark:border-slate-700 focus:outline-none"
                          />
                          <input
                            type="text"
                            value={usp.subtitle}
                            onChange={e => {
                              const updated = [...uspCards];
                              updated[idx].subtitle = e.target.value;
                              setUspCards(updated);
                            }}
                            className="text-[11px] text-slate-500 w-full bg-transparent focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5: Live PDF Interactive Preview */}
              {modalStep === 5 && (
                <div className="space-y-4">
                  {externalError && (
                    <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                        <span>{externalError}</span>
                      </div>
                      {onOpenSettings && (
                        <button
                          onClick={onOpenSettings}
                          className="px-3 py-1 bg-rose-600 text-white rounded-lg font-bold text-xs"
                        >
                          Otvoriť Nastavenia
                        </button>
                      )}
                    </div>
                  )}

                  <div className="p-4 bg-slate-100 dark:bg-slate-800/60 rounded-2xl overflow-y-auto max-h-[500px]">
                    {draftMode === "custom" ? (
                      <CustomAiOfferTemplate
                        offer={{
                          id: "preview",
                          documentNumber: "CP-PREVIEW",
                          type: draftType,
                          mode: draftMode,
                          leadId: selectedLead?.id || "",
                          clientName: selectedLead?.name || "Ukážkový Klient",
                          title: title,
                          subject: subject,
                          location: location,
                          greetingNote: greetingNote,
                          introNote: introNote,
                          uspCards: uspCards,
                          reassuranceNote: reassuranceNote,
                          items: items,
                          subtotal: calculatedTotals.subtotal,
                          vatAmount: calculatedTotals.vatAmount,
                          totalPrice: calculatedTotals.grandTotal,
                          priceRangeMin: priceRangeMin ? parseFloat(priceRangeMin) : null,
                          priceRangeMax: priceRangeMax ? parseFloat(priceRangeMax) : null,
                          currency: systemCurrency,
                          durationText: durationText,
                          startDateText: startDateText,
                          warrantyText: warrantyText,
                          nextStepsNote: nextStepsNote,
                          closingNote: closingNote,
                          signOffTeam: signOffTeam,
                          status: "draft",
                          issuedAt: new Date().toISOString().split("T")[0]
                        }}
                        companySettings={companyBillingSettings}
                        systemCurrency={systemCurrency}
                      />
                    ) : (
                      <DefaultOfferTemplate
                        offer={{
                          id: "preview",
                          documentNumber: "CP-PREVIEW",
                          type: draftType,
                          mode: draftMode,
                          leadId: selectedLead?.id || "",
                          clientName: selectedLead?.name || "Ukážkový Klient",
                          title: title,
                          subject: subject,
                          location: location,
                          greetingNote: greetingNote,
                          introNote: introNote,
                          uspCards: uspCards,
                          reassuranceNote: reassuranceNote,
                          items: items,
                          subtotal: calculatedTotals.subtotal,
                          vatAmount: calculatedTotals.vatAmount,
                          totalPrice: calculatedTotals.grandTotal,
                          priceRangeMin: priceRangeMin ? parseFloat(priceRangeMin) : null,
                          priceRangeMax: priceRangeMax ? parseFloat(priceRangeMax) : null,
                          currency: systemCurrency,
                          durationText: durationText,
                          startDateText: startDateText,
                          warrantyText: warrantyText,
                          nextStepsNote: nextStepsNote,
                          closingNote: closingNote,
                          signOffTeam: signOffTeam,
                          status: "draft",
                          issuedAt: new Date().toISOString().split("T")[0]
                        }}
                        companySettings={companyBillingSettings}
                        systemCurrency={systemCurrency}
                      />
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer Controls */}
            <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
              {modalStep > 1 ? (
                <button
                  onClick={() => setModalStep((prev) => Math.max(1, prev - 1) as any)}
                  className="px-4 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-300 transition-all cursor-pointer"
                >
                  Späť
                </button>
              ) : (
                <div></div>
              )}

              {modalStep < 5 ? (
                <button
                  onClick={() => {
                    if (modalStep === 2 && !selectedLeadId) {
                      alert("Prosím vyberte klienta/lead.");
                      return;
                    }
                    setModalStep((prev) => Math.min(5, prev + 1) as any);
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-all"
                >
                  Ďalej na krok {modalStep + 1}
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-300 cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    Vytlačiť / PDF
                  </button>

                  <button
                    disabled={isExternalLoading}
                    onClick={handleSaveOffer}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/20 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {isExternalLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {draftMode === "external" ? "Vystaviť cez externé API" : "Vystaviť a zaevidovať v CRM"}
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* QUICK PREVIEW MODAL FOR EXISTING DOCUMENT */}
      {previewOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/40">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                <FileText className="h-4 w-4 text-indigo-600" />
                {previewOffer.documentNumber} — {previewOffer.title}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg text-xs font-bold hover:bg-slate-300 cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Tlač / PDF
                </button>
                <button
                  onClick={() => setPreviewOffer(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-100 dark:bg-slate-950">
              {previewOffer.mode === "custom" ? (
                <CustomAiOfferTemplate
                  offer={previewOffer}
                  companySettings={companyBillingSettings}
                  systemCurrency={systemCurrency}
                />
              ) : (
                <DefaultOfferTemplate
                  offer={previewOffer}
                  companySettings={companyBillingSettings}
                  systemCurrency={systemCurrency}
                />
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
