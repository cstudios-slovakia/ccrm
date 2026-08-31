import React, { useState, useMemo } from "react";
import {
  FileText, Plus, Search, Printer, Eye, Trash2, Pencil,
  AlertCircle, Sparkles, Package, ExternalLink, Award, Layers,
  TrendingUp, RefreshCw, ChevronRight, X, Check
} from "lucide-react";
import type {
  InvoiceOffer, InvoiceOfferItem, InvoiceOfferType, InvoiceOfferMode,
  InvoiceOfferStatus, ExternalInvoiceProvider, UspCardItem,
  Lead, WarehouseItem, CompanyBillingSettings,
  AiCustomTemplate, ExternalInvoicingConfig, TimelineEvent, UserProfile
} from "../types";
import type { Language } from "../utils/translations";
import { DefaultOfferTemplate } from "./pdf/DefaultOfferTemplate";
import { CustomAiOfferTemplate } from "./pdf/CustomAiOfferTemplate";
import { CustomSelect } from "./ui/CustomSelect";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { formatMoney, resolveCurrencySymbol } from "../utils/currency";
import { todayLocal, nowLocalStamp } from "../utils/localTime";
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
  systemLanguage?: string | null;
  systemCurrency?: string | null;
  onOpenSettings?: () => void;
  onAddTimelineEvent?: (leadId: string, event: TimelineEvent) => void;
}

const WIZARD_STEPS = [1, 2, 3, 4, 5] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];

/** Fallback USP cards used only until an admin fills Settings → Invoicing. */
const FALLBACK_USP: UspCardItem[] = [
  { title: "", subtitle: "" },
  { title: "", subtitle: "" },
  { title: "", subtitle: "" },
  { title: "", subtitle: "" }
];

/**
 * The auto-generated titles, in every language. Used to tell "the user has not
 * renamed the document yet" from "the user typed their own title", so switching
 * document type can safely refresh the heading without clobbering custom text.
 */
const WIZARD_TITLES: ((tr: (en: string, sk: string, hu: string) => string) => string)[] = [
  tr => tr("Price offer", "Cenová ponuka", "Árajánlat"),
  tr => tr("Proforma invoice", "Zálohová faktúra", "Előlegszámla"),
  tr => tr("Invoice", "Faktúra", "Számla")
];

const newLineId = () => "ioi-" + Math.random().toString(36).slice(2, 11);
const newDocumentId = () => "io-" + Math.random().toString(36).slice(2, 11);

/**
 * Add whole days to a local "YYYY-MM-DD" date, staying on the local calendar.
 * Pure on purpose: the wizard's dates are stamped once when it opens, so the
 * live preview does not silently re-derive them on every keystroke (and every
 * re-render) the way `Date.now()` in the render path did.
 */
const addDays = (isoDate: string, days: number): string => {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const base = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
};

/** Money that never throws on a half-populated row coming back from sync. */
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

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
  const lang = (systemLanguage === "sk" || systemLanguage === "hu" ? systemLanguage : "en") as Language;
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);
  const currency = systemCurrency || "EUR";
  const currencySymbol = resolveCurrencySymbol(currency, lang);
  const money = (value: unknown, decimals = 2) =>
    formatMoney(num(value), currency, lang, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  const toast = (message: string, variant?: "error" | "warning") => {
    const fn = (window as any).showToast;
    if (typeof fn === "function") fn(message, variant);
  };

  // ---------------------------------------------------------------- list state
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [modeFilter, setModeFilter] = useState<string>("all");

  // --------------------------------------------------------------- modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<WizardStep>(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewOffer, setPreviewOffer] = useState<InvoiceOffer | null>(null);
  const [isExternalLoading, setIsExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState<string | null>(null);
  const [warehouseQuery, setWarehouseQuery] = useState("");

  // ---------------------------------------------------------------- draft state
  const [draftType, setDraftType] = useState<InvoiceOfferType>("price_offer");
  const [draftMode, setDraftMode] = useState<InvoiceOfferMode>("default");
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [externalProvider, setExternalProvider] = useState<ExternalInvoiceProvider>("superfaktura");

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [location, setLocation] = useState("");
  const [greetingNote, setGreetingNote] = useState("");
  const [introNote, setIntroNote] = useState("");
  const [reassuranceNote, setReassuranceNote] = useState("");
  const [uspCards, setUspCards] = useState<UspCardItem[]>(FALLBACK_USP);

  // Document identity is stamped once, when the wizard opens, so the number and
  // the dates stay stable while the user edits (and the live preview shows the
  // exact values that will be saved).
  const [draftId, setDraftId] = useState("");
  const [draftDocumentNumber, setDraftDocumentNumber] = useState("");
  const [draftIssuedAt, setDraftIssuedAt] = useState(() => todayLocal());

  const [items, setItems] = useState<InvoiceOfferItem[]>([]);
  const [priceRangeMin, setPriceRangeMin] = useState<string>("");
  const [priceRangeMax, setPriceRangeMax] = useState<string>("");

  const [durationText, setDurationText] = useState("");
  const [startDateText, setStartDateText] = useState("");
  const [warrantyText, setWarrantyText] = useState("");
  const [nextStepsNote, setNextStepsNote] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const [signOffTeam, setSignOffTeam] = useState("");

  // ------------------------------------------------------------------- helpers
  const defaultTitleFor = (type: InvoiceOfferType) =>
    type === "price_offer"
      ? t("Price offer", "Cenová ponuka", "Árajánlat")
      : type === "proforma"
        ? t("Proforma invoice", "Zálohová faktúra", "Előlegszámla")
        : t("Invoice", "Faktúra", "Számla");

  const selectedLead = useMemo(
    () => leads.find(l => l.id === selectedLeadId) || null,
    [leads, selectedLeadId]
  );

  const enabledProviders = useMemo(() => {
    const list: ExternalInvoiceProvider[] = [];
    if (invoicingIntegrations?.superfaktura?.enabled) list.push("superfaktura");
    if (invoicingIntegrations?.idoklad?.enabled) list.push("idoklad");
    return list;
  }, [invoicingIntegrations]);

  const activeTemplate = useMemo(() => {
    if (!aiCustomTemplates.length) return null;
    return aiCustomTemplates.find(tpl => tpl.id === selectedTemplateId) || aiCustomTemplates[0];
  }, [aiCustomTemplates, selectedTemplateId]);

  const templateFor = (offer: InvoiceOffer) =>
    aiCustomTemplates.find(tpl => tpl.id === offer.customTemplateId) || aiCustomTemplates[0] || null;

  /**
   * Next free document number for the given type and year. Derived from the
   * highest number already issued rather than from the list length, which
   * handed out duplicates the moment a document was deleted.
   */
  const nextDocumentNumber = (type: InvoiceOfferType) => {
    const prefix = type === "price_offer" ? "CP" : type === "proforma" ? "ZF" : "FA";
    const year = new Date().getFullYear();
    const head = `${prefix}-${year}-`;
    const highest = invoicesOffers.reduce((max, io) => {
      const docNo = io.documentNumber || "";
      if (!docNo.startsWith(head)) return max;
      const seq = parseInt(docNo.slice(head.length), 10);
      return Number.isFinite(seq) && seq > max ? seq : max;
    }, 0);
    return `${head}${String(highest + 1).padStart(3, "0")}`;
  };

  const handleSelectLead = (leadId: string) => {
    setSelectedLeadId(leadId);
    const ld = leads.find(l => l.id === leadId);
    if (!ld) return;
    setSubject(prev => prev || ld.interestNote || "");
    setLocation(prev => prev || ld.city || ld.address?.city || "");
    setGreetingNote(t(`Dear ${ld.name},`, `Dobrý deň, ${ld.name},`, `Tisztelt ${ld.name},`));
  };

  // -------------------------------------------------------------- item editing
  const handleAddWarehouseProduct = (whItem: WarehouseItem) => {
    const unitPrice = num(whItem.defaultSellPrice);
    setItems(prev => [
      ...prev,
      {
        id: newLineId(),
        warehouseItemId: whItem.id,
        sku: whItem.sku,
        name: whItem.name,
        description: whItem.description || "",
        quantity: 1,
        unit: whItem.unit || "ks",
        unitPrice,
        vatRate: num(companyBillingSettings?.defaultVatRate) || 20,
        discountPct: 0,
        totalPrice: unitPrice
      }
    ]);
  };

  const handleAddCustomItem = () => {
    setItems(prev => [
      ...prev,
      {
        id: newLineId(),
        name: "",
        description: "",
        quantity: 1,
        unit: "ks",
        unitPrice: 0,
        vatRate: num(companyBillingSettings?.defaultVatRate) || 20,
        discountPct: 0,
        totalPrice: 0
      }
    ]);
  };

  const handleUpdateItem = (id: string, updates: Partial<InvoiceOfferItem>) => {
    setItems(prev =>
      prev.map(it => {
        if (it.id !== id) return it;
        const merged = { ...it, ...updates };
        const base = num(merged.quantity) * num(merged.unitPrice);
        const discountFactor = (100 - num(merged.discountPct)) / 100;
        merged.totalPrice = Math.round(base * discountFactor * 100) / 100;
        return merged;
      })
    );
  };

  const handleRemoveItem = (id: string) => setItems(prev => prev.filter(it => it.id !== id));

  const calculatedTotals = useMemo(() => {
    const subtotal = items.reduce((acc, it) => acc + num(it.totalPrice), 0);
    const vatAmount = items.reduce(
      (acc, it) => acc + num(it.totalPrice) * (num(it.vatRate) / 100),
      0
    );
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      vatAmount: Math.round(vatAmount * 100) / 100,
      grandTotal: Math.round((subtotal + vatAmount) * 100) / 100
    };
  }, [items]);

  // ------------------------------------------------------------ list selectors
  const filteredOffers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return invoicesOffers.filter(io => {
      const matchesSearch =
        !q ||
        (io.clientName || "").toLowerCase().includes(q) ||
        (io.documentNumber || "").toLowerCase().includes(q) ||
        (io.title || "").toLowerCase().includes(q) ||
        (io.subject || "").toLowerCase().includes(q);
      return (
        matchesSearch &&
        (typeFilter === "all" || io.type === typeFilter) &&
        (statusFilter === "all" || io.status === statusFilter) &&
        (modeFilter === "all" || io.mode === modeFilter)
      );
    });
  }, [invoicesOffers, searchQuery, typeFilter, statusFilter, modeFilter]);

  const metrics = useMemo(() => {
    const offers = invoicesOffers.filter(o => o.type === "price_offer");
    const totalOffersVal = offers.reduce((sum, o) => sum + num(o.totalPrice), 0);
    const totalInvoicedVal = invoicesOffers
      .filter(o => o.type === "invoice" || o.status === "invoiced")
      .reduce((sum, o) => sum + num(o.totalPrice), 0);
    // Win rate is only meaningful over offers that reached a verdict — counting
    // drafts as losses pinned it near zero however well the business was doing.
    const decided = offers.filter(o =>
      ["approved", "rejected", "invoiced"].includes(o.status)
    );
    const won = decided.filter(o => o.status === "approved" || o.status === "invoiced");
    const winRate = decided.length > 0 ? Math.round((won.length / decided.length) * 100) : 0;
    return {
      totalOffersVal,
      totalInvoicedVal,
      winRate,
      decidedCount: decided.length,
      totalCount: invoicesOffers.length
    };
  }, [invoicesOffers]);

  // ------------------------------------------------------------ labels & badges
  const typeLabel = (type: InvoiceOfferType) => defaultTitleFor(type);

  const statusLabel = (status: InvoiceOfferStatus) => {
    switch (status) {
      case "draft": return t("Draft", "Návrh", "Piszkozat");
      case "sent": return t("Sent", "Odoslaná", "Elküldve");
      case "approved": return t("Approved", "Schválená", "Jóváhagyva");
      case "rejected": return t("Rejected", "Zamietnutá", "Elutasítva");
      case "invoiced": return t("Invoiced", "Vyfakturovaná", "Kiszámlázva");
      case "cancelled": return t("Cancelled", "Zrušená", "Törölve");
      default: return status;
    }
  };

  const statusBadgeClass = (status: InvoiceOfferStatus) =>
    status === "approved" || status === "invoiced"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "sent"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : status === "rejected" || status === "cancelled"
          ? "bg-rose-50 text-rose-700 border-rose-200"
          : "bg-slate-100 text-slate-600 border-slate-200";

  const modeLabel = (offer: InvoiceOffer) =>
    offer.mode === "default"
      ? t("Standard", "Štandard", "Alap")
      : offer.mode === "custom"
        ? t("AI template", "AI šablóna", "AI sablon")
        : offer.externalProvider === "idoklad"
          ? "iDoklad"
          : offer.externalProvider === "superfaktura"
            ? "SuperFaktúra"
            : t("External", "Externé", "Külső");

  const statusOptions = (["draft", "sent", "approved", "rejected", "invoiced", "cancelled"] as const).map(
    s => ({ value: s, label: statusLabel(s) })
  );

  // ------------------------------------------------------------- draft loading
  const resetDraft = (type: InvoiceOfferType) => {
    const cbs = companyBillingSettings;
    setDraftType(type);
    setDraftMode("default");
    setSelectedTemplateId(aiCustomTemplates[0]?.id || "");
    setExternalProvider(enabledProviders[0] || "superfaktura");
    setSelectedLeadId("");
    setTitle(defaultTitleFor(type));
    setSubject("");
    setLocation("");
    setGreetingNote("");
    setIntroNote("");
    setReassuranceNote("");
    setUspCards(
      cbs?.defaultUspCards?.length
        ? cbs.defaultUspCards.slice(0, 4).map(c => ({ ...c }))
        : FALLBACK_USP.map(c => ({ ...c }))
    );
    setItems([]);
    setPriceRangeMin("");
    setPriceRangeMax("");
    setDurationText(cbs?.defaultDurationText || "");
    setStartDateText(cbs?.defaultStartDateText || "");
    setWarrantyText(cbs?.defaultWarrantyText || "");
    setNextStepsNote(cbs?.defaultNextSteps || "");
    setClosingNote("");
    setSignOffTeam(cbs?.companyName ? t(`The ${cbs.companyName} team`, `Tím ${cbs.companyName}`, `A ${cbs.companyName} csapata`) : "");
    setWarehouseQuery("");
    setExternalError(null);
    setEditingId(null);
    setDraftIssuedAt(todayLocal());
    setDraftDocumentNumber(nextDocumentNumber(type));
    setDraftId(newDocumentId());
    setModalStep(1);
  };

  const handleOpenCreateModal = () => {
    resetDraft("price_offer");
    setIsCreateModalOpen(true);
  };

  const handleOpenEditModal = (offer: InvoiceOffer) => {
    setEditingId(offer.id);
    setDraftType(offer.type);
    setDraftMode(offer.mode);
    setSelectedTemplateId(offer.customTemplateId || aiCustomTemplates[0]?.id || "");
    setExternalProvider(offer.externalProvider || enabledProviders[0] || "superfaktura");
    setSelectedLeadId(offer.leadId || "");
    setTitle(offer.title || defaultTitleFor(offer.type));
    setSubject(offer.subject || "");
    setLocation(offer.location || "");
    setGreetingNote(offer.greetingNote || "");
    setIntroNote(offer.introNote || "");
    setReassuranceNote(offer.reassuranceNote || "");
    setUspCards(offer.uspCards?.length ? offer.uspCards.map(c => ({ ...c })) : FALLBACK_USP.map(c => ({ ...c })));
    setItems((offer.items || []).map(it => ({ ...it })));
    setPriceRangeMin(offer.priceRangeMin != null ? String(offer.priceRangeMin) : "");
    setPriceRangeMax(offer.priceRangeMax != null ? String(offer.priceRangeMax) : "");
    setDurationText(offer.durationText || "");
    setStartDateText(offer.startDateText || "");
    setWarrantyText(offer.warrantyText || "");
    setNextStepsNote(offer.nextStepsNote || "");
    setClosingNote(offer.closingNote || "");
    setSignOffTeam(offer.signOffTeam || "");
    setWarehouseQuery("");
    setExternalError(null);
    setDraftIssuedAt(offer.issuedAt || todayLocal());
    setDraftDocumentNumber(offer.documentNumber || nextDocumentNumber(offer.type));
    setDraftId(offer.id);
    setModalStep(1);
    setIsCreateModalOpen(true);
  };

  /**
   * Switching document type re-stamps the number series (CP/ZF/FA) and, unless
   * the user has typed their own heading, the title too — an invoice used to
   * keep the "price offer" heading because the title was never re-derived.
   */
  const handleChangeDraftType = (type: InvoiceOfferType) => {
    setDraftType(type);
    setTitle(prev => {
      const isUntouched = !prev || WIZARD_TITLES.some(fn => fn(t) === prev);
      return isUntouched ? defaultTitleFor(type) : prev;
    });
    if (!editingId) {
      setDraftDocumentNumber(nextDocumentNumber(type));
    }
  };

  // ------------------------------------------------------------ draft assembly
  const buildDocument = (): InvoiceOffer | null => {
    if (!selectedLead) return null;
    const existing = editingId ? invoicesOffers.find(o => o.id === editingId) : null;
    const dueDays = num(companyBillingSettings?.defaultPaymentDueDays) || 14;
    return {
      id: existing?.id || draftId || newDocumentId(),
      documentNumber: existing?.documentNumber || draftDocumentNumber || nextDocumentNumber(draftType),
      type: draftType,
      mode: draftMode,
      externalProvider: existing?.externalProvider ?? null,
      externalId: existing?.externalId ?? null,
      externalPdfUrl: existing?.externalPdfUrl ?? null,
      leadId: selectedLead.id,
      clientId: selectedLead.id,
      clientName: selectedLead.name,
      clientEmail: selectedLead.email ?? null,
      clientPhone: selectedLead.phone ?? null,
      clientStreet: selectedLead.address?.street ?? null,
      clientCity: selectedLead.city || selectedLead.address?.city || null,
      clientPostalCode: selectedLead.address?.postalCode ?? null,
      clientCountry: selectedLead.address?.country || companyBillingSettings?.country || null,
      clientIco: selectedLead.companyId ?? null,
      clientDic: selectedLead.taxId ?? null,
      clientIcdph: selectedLead.vatId ?? null,
      title: title.trim() || defaultTitleFor(draftType),
      subject: subject.trim(),
      location: location.trim() || null,
      greetingNote: greetingNote.trim() || null,
      introNote: introNote.trim() || null,
      uspCards: uspCards.filter(c => c.title?.trim() || c.subtitle?.trim()),
      reassuranceNote: reassuranceNote.trim() || null,
      items,
      subtotal: calculatedTotals.subtotal,
      vatAmount: calculatedTotals.vatAmount,
      totalPrice: calculatedTotals.grandTotal,
      priceRangeMin: priceRangeMin.trim() !== "" && Number.isFinite(parseFloat(priceRangeMin)) ? parseFloat(priceRangeMin) : null,
      priceRangeMax: priceRangeMax.trim() !== "" && Number.isFinite(parseFloat(priceRangeMax)) ? parseFloat(priceRangeMax) : null,
      currency,
      durationText: durationText.trim() || null,
      startDateText: startDateText.trim() || null,
      warrantyText: warrantyText.trim() || null,
      nextStepsNote: nextStepsNote.trim() || null,
      closingNote: closingNote.trim() || null,
      signOffTeam: signOffTeam.trim() || null,
      customTemplateId: draftMode === "custom" ? selectedTemplateId || activeTemplate?.id || null : null,
      status: existing?.status || "draft",
      issuedAt: existing?.issuedAt || draftIssuedAt,
      validUntil: existing?.validUntil || addDays(draftIssuedAt, 30),
      dueDate: existing?.dueDate || addDays(draftIssuedAt, dueDays),
      createdBy: existing?.createdBy || currentUser?.name || null
    };
  };

  /** Live preview document — the same shape the wizard will persist. */
  const previewDraft = useMemo<InvoiceOffer>(() => {
    const built = buildDocument();
    if (built) return built;
    return {
      id: "preview",
      documentNumber: draftDocumentNumber || nextDocumentNumber(draftType),
      type: draftType,
      mode: draftMode,
      leadId: "",
      clientName: t("Sample client", "Ukážkový klient", "Mintaügyfél"),
      title: title.trim() || defaultTitleFor(draftType),
      subject: subject.trim(),
      location: location.trim() || null,
      greetingNote: greetingNote.trim() || null,
      introNote: introNote.trim() || null,
      uspCards: uspCards.filter(c => c.title?.trim() || c.subtitle?.trim()),
      reassuranceNote: reassuranceNote.trim() || null,
      items,
      subtotal: calculatedTotals.subtotal,
      vatAmount: calculatedTotals.vatAmount,
      totalPrice: calculatedTotals.grandTotal,
      priceRangeMin: priceRangeMin.trim() !== "" ? parseFloat(priceRangeMin) || null : null,
      priceRangeMax: priceRangeMax.trim() !== "" ? parseFloat(priceRangeMax) || null : null,
      currency,
      durationText: durationText.trim() || null,
      startDateText: startDateText.trim() || null,
      warrantyText: warrantyText.trim() || null,
      nextStepsNote: nextStepsNote.trim() || null,
      closingNote: closingNote.trim() || null,
      signOffTeam: signOffTeam.trim() || null,
      status: "draft",
      issuedAt: draftIssuedAt,
      createdBy: currentUser?.name || null
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftType, draftMode, selectedLead, title, subject, location, greetingNote, introNote,
    uspCards, reassuranceNote, items, calculatedTotals, priceRangeMin, priceRangeMax,
    currency, durationText, startDateText, warrantyText, nextStepsNote, closingNote,
    signOffTeam, selectedTemplateId, editingId, draftId, draftDocumentNumber, draftIssuedAt, lang
  ]);

  // ------------------------------------------------------------------- actions
  const handleSaveOffer = async () => {
    const doc = buildDocument();
    if (!doc) {
      toast(t("Please select a client / lead first.", "Najprv vyberte klienta alebo lead.", "Először válasszon ügyfelet."), "error");
      setModalStep(2);
      return;
    }
    if (!doc.items.length) {
      toast(t("Add at least one line item.", "Pridajte aspoň jednu položku.", "Adjon hozzá legalább egy tételt."), "error");
      setModalStep(3);
      return;
    }

    // Only issue upstream once. Re-saving an edit of an already-issued
    // document must not create a second copy in the accounting service.
    const alreadyIssuedExternally = Boolean(doc.externalId);
    if (draftMode === "external" && !alreadyIssuedExternally) {
      if (!enabledProviders.length) {
        setExternalError(
          t(
            "No external accounting service is enabled. Configure SuperFaktúra or iDoklad in Settings → Invoicing.",
            "Nie je zapnutá žiadna externá účtovná služba. Nastavte SuperFaktúru alebo iDoklad v Nastaveniach → Fakturácia.",
            "Nincs engedélyezve külső számlázó. Állítsa be a SuperFaktúrát vagy az iDokladot a Beállításokban."
          )
        );
        return;
      }
      const provider = enabledProviders.includes(externalProvider) ? externalProvider : enabledProviders[0];
      setIsExternalLoading(true);
      setExternalError(null);
      try {
        const endpoint = provider === "superfaktura" ? "/api/superfaktura.php" : "/api/idoklad.php";
        const res = await fetchWithTimeout(
          endpoint,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: draftType === "invoice" ? "create_invoice" : "create_estimate",
              doc
            })
          },
          60000
        );
        const raw = await res.text();
        let data: { success?: boolean; message?: string; externalId?: string; documentNumber?: string; externalPdfUrl?: string } | null = null;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error(
            t("The service returned an unreadable response.", "Služba vrátila nečitateľnú odpoveď.", "A szolgáltatás olvashatatlan választ adott.") +
              ` (HTTP ${res.status})`
          );
        }
        if (!res.ok || !data?.success) {
          setExternalError(data?.message || `HTTP ${res.status}`);
          setIsExternalLoading(false);
          return;
        }
        doc.externalProvider = provider;
        doc.externalId = data.externalId ?? null;
        doc.externalPdfUrl = data.externalPdfUrl ?? null;
        if (data.documentNumber) doc.documentNumber = String(data.documentNumber);
        doc.status = "sent";
      } catch (err) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        setExternalError(
          isAbort
            ? t("The external service did not respond in time.", "Externá služba neodpovedala včas.", "A külső szolgáltatás nem válaszolt időben.")
            : t("External API call failed: ", "Volanie externého API zlyhalo: ", "A külső API hívása sikertelen: ") + (err instanceof Error ? err.message : String(err))
        );
        setIsExternalLoading(false);
        return;
      }
      setIsExternalLoading(false);
    }

    const isEdit = Boolean(editingId);
    setInvoicesOffers(prev =>
      isEdit ? prev.map(o => (o.id === doc.id ? doc : o)) : [doc, ...prev]
    );

    // A brand-new document is announced on the lead's timeline. Edits are not —
    // re-saving a draft should not spam the timeline with duplicates.
    if (!isEdit) {
      const timelineEvent: TimelineEvent = {
        id: "ev-" + Math.random().toString(36).slice(2, 11),
        type: draftType === "price_offer" ? "offer" : draftType === "proforma" ? "proforma_invoice" : "invoice",
        timestamp: nowLocalStamp(),
        title: `${doc.title} (${doc.documentNumber})`,
        content: t(
          `Document issued for ${money(doc.totalPrice)}. Subject: ${doc.subject || "—"}`,
          `Vystavený doklad v hodnote ${money(doc.totalPrice)}. Predmet: ${doc.subject || "—"}`,
          `Kiállított bizonylat ${money(doc.totalPrice)} értékben. Tárgy: ${doc.subject || "—"}`
        ),
        amount: doc.totalPrice,
        author: currentUser?.name || "CCRM"
      };

      if (onAddTimelineEvent) {
        onAddTimelineEvent(doc.leadId, timelineEvent);
      } else {
        setLeads(prev =>
          prev.map(l =>
            l.id === doc.leadId ? { ...l, timeline: [timelineEvent, ...(l.timeline || [])] } : l
          )
        );
      }
    }

    toast(
      isEdit
        ? t("Document updated.", "Doklad bol aktualizovaný.", "A bizonylat frissítve.")
        : t("Document issued and logged in the CRM.", "Doklad bol vystavený a zaevidovaný v CRM.", "A bizonylat kiállítva és rögzítve.")
    );
    setIsCreateModalOpen(false);
    setEditingId(null);
  };

  const handleChangeStatus = (offerId: string, status: InvoiceOfferStatus) => {
    setInvoicesOffers(prev => prev.map(o => (o.id === offerId ? { ...o, status } : o)));
  };

  const handleDelete = (offer: InvoiceOffer) => {
    const ok = window.confirm(
      t(
        `Delete document ${offer.documentNumber}? This cannot be undone.`,
        `Naozaj zmazať doklad ${offer.documentNumber}? Túto akciu nie je možné vrátiť.`,
        `Törli a(z) ${offer.documentNumber} bizonylatot? A művelet nem vonható vissza.`
      )
    );
    if (!ok) return;
    setInvoicesOffers(prev => prev.filter(o => o.id !== offer.id));
    toast(t("Document deleted.", "Doklad bol zmazaný.", "A bizonylat törölve."));
  };

  /**
   * Print just the document. The `print-document` class is what the global
   * @media print rules keep visible — window.print() on its own used to spool
   * the whole app shell (sidebar, header, modal backdrop) onto the page.
   */
  const handlePrint = () => window.print();

  // ------------------------------------------------------------------ warehouse
  const warehouseMatches = useMemo(() => {
    const q = warehouseQuery.trim().toLowerCase();
    const pool = q
      ? warehouseItems.filter(
          w => w.name.toLowerCase().includes(q) || (w.sku || "").toLowerCase().includes(q)
        )
      : warehouseItems;
    return pool.slice(0, 12);
  }, [warehouseItems, warehouseQuery]);

  const billingConfigured = Boolean(companyBillingSettings?.companyName);

  const renderTemplate = (offer: InvoiceOffer, template: AiCustomTemplate | null) =>
    offer.mode === "custom" ? (
      <CustomAiOfferTemplate
        offer={offer}
        companySettings={companyBillingSettings}
        customTemplate={template}
        systemCurrency={currency}
        language={lang}
      />
    ) : (
      <DefaultOfferTemplate
        offer={offer}
        companySettings={companyBillingSettings}
        systemCurrency={currency}
        language={lang}
      />
    );

  const inputClass =
    "w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-all";
  const labelClass = "text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1";

  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6 pb-16 font-sans animate-fade-in">
      {/* 1. SECTION HEADER & COMMAND BAR */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-4 select-none">
        <div className="flex flex-col">
          <h2 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-indigo-600" />
            {t("Price Offers & Invoicing", "Cenové ponuky a fakturácia", "Árajánlatok és számlázás")}
          </h2>
          <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-1">
            {t(
              "Issue price offers and invoices linked to leads, warehouse stock and your accounting service.",
              "Vystavujte cenové ponuky a faktúry prepojené s leadmi, skladom a vaším účtovníctvom.",
              "Állítson ki árajánlatokat és számlákat az ügyfelekhez, raktárhoz és könyveléshez kapcsolva."
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 text-xs font-semibold rounded-2xl shadow-sm transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <Sparkles className="h-4 w-4 text-indigo-500" />
              <span>{t("Billing settings", "Fakturačné nastavenia", "Számlázási beállítások")}</span>
            </button>
          )}
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-2xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            <span>{t("New document", "Nový doklad", "Új bizonylat")}</span>
          </button>
        </div>
      </div>

      {/* 2. SETUP NOTICE — a document issued before Settings are filled in carries no company identity */}
      {!billingConfigured && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <div className="flex items-start gap-2.5 text-xs text-amber-900">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <span className="font-semibold">
              {t(
                "Your company billing identity is not configured yet — documents will be issued without company details, IČO/DIČ and bank account.",
                "Fakturačné údaje firmy zatiaľ nie sú nastavené — doklady sa vystavia bez firemných údajov, IČO/DIČ a bankového spojenia.",
                "A cég számlázási adatai még nincsenek beállítva — a bizonylatok cégadatok nélkül készülnek."
              )}
            </span>
          </div>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="shrink-0 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-[0.98]"
            >
              {t("Open settings", "Otvoriť nastavenia", "Beállítások megnyitása")}
            </button>
          )}
        </div>
      )}

      {/* 3. KPI OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: <Layers className="h-6 w-6" />,
            tone: "bg-blue-50 text-blue-600",
            label: t("Offered volume", "Objem ponúk", "Ajánlatok összege"),
            value: money(metrics.totalOffersVal, 0)
          },
          {
            icon: <TrendingUp className="h-6 w-6" />,
            tone: "bg-emerald-50 text-emerald-600",
            label: t("Invoiced", "Vyfakturované", "Kiszámlázva"),
            value: money(metrics.totalInvoicedVal, 0)
          },
          {
            icon: <Award className="h-6 w-6" />,
            tone: "bg-amber-50 text-amber-600",
            label: t("Win rate", "Úspešnosť ponúk", "Nyerési arány"),
            value: metrics.decidedCount > 0 ? `${metrics.winRate} %` : "—",
            hint:
              metrics.decidedCount > 0
                ? t(`of ${metrics.decidedCount} decided offers`, `z ${metrics.decidedCount} uzavretých ponúk`, `${metrics.decidedCount} lezárt ajánlatból`)
                : t("no decided offers yet", "zatiaľ žiadne uzavreté ponuky", "még nincs lezárt ajánlat")
          },
          {
            icon: <FileText className="h-6 w-6" />,
            tone: "bg-purple-50 text-purple-600",
            label: t("Documents total", "Celkom dokladov", "Összes bizonylat"),
            value: String(metrics.totalCount)
          }
        ].map(card => (
          <div
            key={card.label}
            className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center gap-4 transition-all hover:shadow-md"
          >
            <div className={cn("p-3 rounded-2xl shrink-0", card.tone)}>{card.icon}</div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{card.label}</div>
              <div className="text-xl font-black text-slate-900 mt-0.5 truncate">{card.value}</div>
              {card.hint && <div className="text-[10px] text-slate-400 font-medium">{card.hint}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* 4. SEARCH & FILTERS */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="relative w-full lg:w-80">
          <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder={t("Search document, client or number…", "Hľadať doklad, klienta alebo číslo…", "Bizonylat, ügyfél vagy szám keresése…")}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CustomSelect
            size="sm"
            value={typeFilter}
            onChange={setTypeFilter}
            className="min-w-[170px]"
            options={[
              { value: "all", label: t("All document types", "Všetky typy dokladov", "Minden bizonylattípus") },
              { value: "price_offer", label: typeLabel("price_offer") },
              { value: "proforma", label: typeLabel("proforma") },
              { value: "invoice", label: typeLabel("invoice") }
            ]}
          />
          <CustomSelect
            size="sm"
            value={modeFilter}
            onChange={setModeFilter}
            className="min-w-[160px]"
            options={[
              { value: "all", label: t("All formats", "Všetky formáty", "Minden formátum") },
              { value: "default", label: t("Standard template", "Štandardná šablóna", "Alap sablon") },
              { value: "custom", label: t("AI template", "AI šablóna", "AI sablon") },
              { value: "external", label: "SuperFaktúra / iDoklad" }
            ]}
          />
          <CustomSelect
            size="sm"
            value={statusFilter}
            onChange={setStatusFilter}
            className="min-w-[150px]"
            options={[
              { value: "all", label: t("All statuses", "Všetky stavy", "Minden állapot") },
              ...statusOptions
            ]}
          />
        </div>
      </div>

      {/* 5. DOCUMENTS TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-black uppercase tracking-wider text-[10px] border-b border-slate-200">
                <th className="p-4">{t("Document no.", "Číslo dokladu", "Bizonylatszám")}</th>
                <th className="p-4">{t("Type & template", "Typ a šablóna", "Típus és sablon")}</th>
                <th className="p-4">{t("Client / lead", "Klient / Lead", "Ügyfél / Lead")}</th>
                <th className="p-4">{t("Issued", "Vystavené", "Kiállítva")}</th>
                <th className="p-4 text-right">{t("Amount", "Suma", "Összeg")}</th>
                <th className="p-4 text-center">{t("Status", "Stav", "Állapot")}</th>
                <th className="p-4 text-right">{t("Actions", "Akcie", "Műveletek")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOffers.length > 0 ? (
                filteredOffers.map(offer => (
                  <tr key={offer.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 align-top font-mono font-bold text-slate-900 whitespace-nowrap">
                      {offer.documentNumber}
                      {offer.externalId && (
                        <span className="block text-[10px] text-slate-400 font-sans font-medium">
                          {offer.externalProvider === "idoklad" ? "iDoklad" : "SuperFaktúra"} #{offer.externalId}
                        </span>
                      )}
                    </td>
                    <td className="p-4 align-top">
                      <div className="font-bold text-slate-800">{offer.title}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                          {typeLabel(offer.type)}
                        </span>
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                            offer.mode === "custom"
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : offer.mode === "external"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-slate-50 text-slate-500 border-slate-200"
                          )}
                        >
                          {modeLabel(offer)}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 align-top">
                      <div className="font-bold text-slate-900">{offer.clientName}</div>
                      {offer.location && <div className="text-[11px] text-slate-400">{offer.location}</div>}
                    </td>
                    <td className="p-4 align-top text-slate-600 whitespace-nowrap">{offer.issuedAt}</td>
                    <td className="p-4 align-top text-right font-bold text-slate-900 whitespace-nowrap">
                      {money(offer.totalPrice)}
                    </td>
                    <td className="p-4 align-top text-center">
                      <CustomSelect
                        size="sm"
                        align="right"
                        value={offer.status}
                        onChange={next => handleChangeStatus(offer.id, next as InvoiceOfferStatus)}
                        options={statusOptions}
                        unstyled
                        className={cn(
                          "gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border cursor-pointer transition-all hover:brightness-95",
                          statusBadgeClass(offer.status)
                        )}
                      />
                    </td>
                    <td className="p-4 align-top text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setPreviewOffer(offer)}
                          title={t("Preview & print", "Náhľad a tlač", "Előnézet és nyomtatás")}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(offer)}
                          title={t("Edit", "Upraviť", "Szerkesztés")}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(offer)}
                          title={t("Delete", "Odstrániť", "Törlés")}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-12 text-center">
                    <div className="max-w-sm mx-auto space-y-2.5">
                      <div className="h-12 w-12 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
                        <FileText className="h-6 w-6" />
                      </div>
                      <div className="font-bold text-slate-700 text-sm">
                        {invoicesOffers.length === 0
                          ? t("No documents yet", "Zatiaľ žiadne doklady", "Még nincs bizonylat")
                          : t("Nothing matches these filters", "Filtrom nezodpovedá žiadny doklad", "Nincs találat a szűrőkre")}
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {invoicesOffers.length === 0
                          ? t(
                              'Create your first price offer with "New document".',
                              'Vytvorte prvú cenovú ponuku tlačidlom „Nový doklad“.',
                              'Hozza létre az első árajánlatot az „Új bizonylat” gombbal.'
                            )
                          : t("Try clearing the search or filters.", "Skúste zrušiť vyhľadávanie alebo filtre.", "Törölje a keresést vagy a szűrőket.")}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================== CREATE / EDIT WIZARD ===================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Wizard header */}
            <div className="p-5 sm:p-6 border-b border-slate-100 flex justify-between items-start gap-4 bg-slate-50/70">
              <div className="min-w-0">
                <h3 className="text-lg font-heading font-extrabold text-slate-900 tracking-tight">
                  {editingId
                    ? t("Edit document", "Úprava dokladu", "Bizonylat szerkesztése")
                    : t("New price offer / invoice", "Nová cenová ponuka / faktúra", "Új árajánlat / számla")}
                </h3>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-xs font-bold text-indigo-600">
                    {t(`Step ${modalStep} of 5`, `Krok ${modalStep} z 5`, `${modalStep}. lépés / 5`)}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-500 font-medium">
                    {modalStep === 1 && t("Document type & format", "Typ a formát dokladu", "Bizonylat típusa és formátuma")}
                    {modalStep === 2 && t("Client & lead pairing", "Prepojenie s klientom", "Ügyfél összekapcsolása")}
                    {modalStep === 3 && t("Line items & warehouse stock", "Položky a skladové zásoby", "Tételek és raktárkészlet")}
                    {modalStep === 4 && t("Parameters, benefits & texts", "Parametre, výhody a texty", "Paraméterek, előnyök és szövegek")}
                    {modalStep === 5 && t("Live preview & issue", "Živý náhľad a vystavenie", "Élő előnézet és kiállítás")}
                  </span>
                </div>
                {/* Step progress */}
                <div className="flex items-center gap-1.5 mt-3">
                  {WIZARD_STEPS.map(step => (
                    <button
                      key={step}
                      onClick={() => setModalStep(step)}
                      title={t(`Go to step ${step}`, `Prejsť na krok ${step}`, `Ugrás a(z) ${step}. lépésre`)}
                      className={cn(
                        "h-1.5 rounded-full transition-all cursor-pointer",
                        step === modalStep ? "w-8 bg-indigo-600" : step < modalStep ? "w-4 bg-indigo-300" : "w-4 bg-slate-200"
                      )}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={() => setIsCreateModalOpen(false)}
                title={t("Close", "Zavrieť", "Bezárás")}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 cursor-pointer transition-all shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Wizard body */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
              {/* STEP 1 — type & format */}
              {modalStep === 1 && (
                <div className="space-y-6 animate-fade-in">
                  <div>
                    <label className={labelClass}>
                      1. {t("Document type", "Typ dokladu", "Bizonylat típusa")}
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {([
                        {
                          type: "price_offer" as const,
                          desc: t("Offer with scope of work and guarantees", "Ponuka s rozsahom prác a garanciami", "Ajánlat a munkák terjedelmével")
                        },
                        {
                          type: "proforma" as const,
                          desc: t("Advance document issued before work starts", "Zálohový doklad pred zahájením prác", "Előlegbizonylat a munka megkezdése előtt")
                        },
                        {
                          type: "invoice" as const,
                          desc: t("Final invoice with VAT and due date", "Vyúčtovacia faktúra s DPH a splatnosťou", "Végszámla ÁFÁ-val és fizetési határidővel")
                        }
                      ]).map(opt => (
                        <button
                          key={opt.type}
                          type="button"
                          onClick={() => handleChangeDraftType(opt.type)}
                          className={cn(
                            "p-4 rounded-2xl border-2 text-left transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]",
                            draftType === opt.type
                              ? "border-indigo-500 bg-indigo-50/60 shadow-sm"
                              : "border-slate-200 hover:border-slate-300 bg-white"
                          )}
                        >
                          <div className="font-bold text-sm text-slate-900">{typeLabel(opt.type)}</div>
                          <div className="text-xs text-slate-500 mt-1 leading-snug">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>
                      2. {t("Generation mode & template", "Spôsob a šablóna generovania", "Generálási mód és sablon")}
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {([
                        {
                          mode: "default" as const,
                          icon: <Award className="h-4 w-4 text-orange-500" />,
                          label: t("Standard template", "Štandardná šablóna", "Alap sablon"),
                          desc: t(
                            "Built-in company template with all sections and USP cards.",
                            "Vstavaná firemná šablóna so všetkými blokmi a USP kartami.",
                            "Beépített cégsablon minden blokkal és USP kártyával."
                          ),
                          disabled: false
                        },
                        {
                          mode: "custom" as const,
                          icon: <Sparkles className="h-4 w-4 text-purple-500" />,
                          label: t("AI custom template", "AI vlastná šablóna", "AI egyedi sablon"),
                          desc: aiCustomTemplates.length
                            ? t("Generated by AI from your uploaded sample PDF.", "Vygenerovaná AI z vami nahraného vzorového PDF.", "AI által generálva a feltöltött minta PDF-ből.")
                            : t("No AI template uploaded yet — add one in Settings.", "Zatiaľ nie je nahraná žiadna AI šablóna — pridajte ju v Nastaveniach.", "Még nincs AI sablon — adjon hozzá a Beállításokban."),
                          disabled: aiCustomTemplates.length === 0
                        },
                        {
                          mode: "external" as const,
                          icon: <ExternalLink className="h-4 w-4 text-blue-500" />,
                          label: "SuperFaktúra / iDoklad",
                          desc: enabledProviders.length
                            ? t("Issue directly through your accounting service API.", "Vystavenie priamo cez API vášho účtovníctva.", "Kiállítás közvetlenül a könyvelő API-n keresztül.")
                            : t("No accounting service enabled — configure it in Settings.", "Nie je zapnutá žiadna účtovná služba — nastavte ju v Nastaveniach.", "Nincs engedélyezett könyvelő szolgáltatás."),
                          disabled: enabledProviders.length === 0
                        }
                      ]).map(opt => (
                        <button
                          key={opt.mode}
                          type="button"
                          disabled={opt.disabled}
                          onClick={() => setDraftMode(opt.mode)}
                          className={cn(
                            "p-4 rounded-2xl border-2 text-left transition-all",
                            opt.disabled
                              ? "border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed"
                              : "cursor-pointer hover:scale-[1.01] active:scale-[0.99]",
                            !opt.disabled && draftMode === opt.mode
                              ? "border-indigo-500 bg-indigo-50/60 shadow-sm"
                              : !opt.disabled && "border-slate-200 hover:border-slate-300 bg-white"
                          )}
                        >
                          <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                            {opt.icon}
                            {opt.label}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 leading-snug">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {draftMode === "custom" && aiCustomTemplates.length > 0 && (
                    <div>
                      <label className={labelClass}>{t("AI template", "AI šablóna", "AI sablon")}</label>
                      <CustomSelect
                        value={selectedTemplateId || aiCustomTemplates[0].id}
                        onChange={setSelectedTemplateId}
                        options={aiCustomTemplates.map(tpl => ({
                          value: tpl.id,
                          label: `${tpl.name} (${(tpl.createdAt || "").slice(0, 10)})`
                        }))}
                      />
                    </div>
                  )}

                  {draftMode === "external" && enabledProviders.length > 0 && (
                    <div>
                      <label className={labelClass}>
                        {t("Accounting service", "Účtovná služba", "Könyvelő szolgáltatás")}
                      </label>
                      <CustomSelect
                        value={enabledProviders.includes(externalProvider) ? externalProvider : enabledProviders[0]}
                        onChange={v => setExternalProvider(v as ExternalInvoiceProvider)}
                        options={enabledProviders.map(p => ({
                          value: p,
                          label: p === "superfaktura" ? "SuperFaktúra" : "iDoklad"
                        }))}
                      />
                      {(invoicingIntegrations?.superfaktura?.sandbox || invoicingIntegrations?.idoklad?.sandbox) && (
                        <p className="text-[11px] text-amber-700 font-semibold mt-1.5">
                          {t(
                            "Sandbox mode is on for at least one service — documents are created in the test environment.",
                            "Aspoň pre jednu službu je zapnutý sandbox — doklady vzniknú v testovacom prostredí.",
                            "Legalább egy szolgáltatásnál sandbox mód aktív — a bizonylatok tesztkörnyezetben jönnek létre."
                          )}
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className={labelClass}>{t("Document title", "Názov dokladu", "Bizonylat címe")}</label>
                    <input
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder={defaultTitleFor(draftType)}
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {/* STEP 2 — client */}
              {modalStep === 2 && (
                <div className="space-y-4 animate-fade-in">
                  <div>
                    <label className={labelClass}>
                      {t("Client / lead (required)", "Klient / lead (povinné)", "Ügyfél / lead (kötelező)")}
                    </label>
                    {leads.length > 0 ? (
                      <CustomSelect
                        value={selectedLeadId}
                        onChange={handleSelectLead}
                        placeholder={t("Select a client…", "Vyberte klienta…", "Válasszon ügyfelet…")}
                        options={leads.map(l => ({
                          value: l.id,
                          label: `${l.name}${l.city ? ` (${l.city})` : ""}${l.companyId ? ` — IČO ${l.companyId}` : ""}`
                        }))}
                      />
                    ) : (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                        {t("No leads or clients exist yet.", "Zatiaľ neexistujú žiadne leady ani klienti.", "Még nincs lead vagy ügyfél.")}
                      </div>
                    )}
                  </div>

                  {selectedLead && (
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-xs animate-fade-in">
                      <div className="font-bold text-slate-900 flex items-center justify-between gap-2">
                        <span>{t("Client billing details", "Fakturačné údaje klienta", "Ügyfél számlázási adatai")}</span>
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                          {t("Linked to CRM", "Prepojené s CRM", "CRM-hez kapcsolva")}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                        {[
                          [t("Name", "Názov / Meno", "Név"), selectedLead.name],
                          [t("Email", "Email", "E-mail"), selectedLead.email],
                          [t("Phone", "Telefón", "Telefon"), selectedLead.phone],
                          [
                            t("Address", "Adresa", "Cím"),
                            [selectedLead.address?.street, selectedLead.city || selectedLead.address?.city]
                              .filter(Boolean)
                              .join(", ")
                          ],
                          ["IČO", selectedLead.companyId],
                          ["DIČ / IČ DPH", [selectedLead.taxId, selectedLead.vatId].filter(Boolean).join(" / ")]
                        ].map(([label, value]) => (
                          <div key={String(label)}>
                            <strong className="text-slate-800">{label}:</strong>{" "}
                            {value || <span className="text-slate-400 italic">{t("not set", "neuvedené", "nincs megadva")}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className={labelClass}>
                        {t("Subject / job name", "Predmet ponuky / názov zákazky", "Tárgy / munka neve")}
                      </label>
                      <input
                        type="text"
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        placeholder={t("e.g. Flat roof renovation", "napr. Rekonštrukcia plochej strechy", "pl. Lapostető felújítás")}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        {t("Site / location", "Lokalita / miesto realizácie", "Helyszín")}
                      </label>
                      <input
                        type="text"
                        value={location}
                        onChange={e => setLocation(e.target.value)}
                        placeholder={t("e.g. Bratislava", "napr. Bratislava", "pl. Bratislava")}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>{t("Greeting", "Oslovenie", "Megszólítás")}</label>
                    <input
                      type="text"
                      value={greetingNote}
                      onChange={e => setGreetingNote(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>{t("Opening paragraph", "Úvodný odsek", "Bevezető bekezdés")}</label>
                    <textarea
                      rows={3}
                      value={introNote}
                      onChange={e => setIntroNote(e.target.value)}
                      className={cn(inputClass, "resize-y leading-relaxed")}
                    />
                  </div>
                </div>
              )}

              {/* STEP 3 — items */}
              {modalStep === 3 && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        {t("Scope of delivery & work", "Rozsah dodávky a prác", "Szállítás és munka terjedelme")}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {t(
                          "Add stock products or your own custom line items.",
                          "Pridajte tovar zo skladu alebo doplňte vlastné položky.",
                          "Adjon hozzá raktári terméket vagy saját tételt."
                        )}
                      </p>
                    </div>
                    <button
                      onClick={handleAddCustomItem}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-[0.98]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t("Custom item", "Vlastná položka", "Saját tétel")}
                    </button>
                  </div>

                  {/* Warehouse picker */}
                  {warehouseItems.length > 0 && (
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5 text-indigo-600" />
                          {t(
                            `Warehouse (${warehouseItems.length} products)`,
                            `Sklad (${warehouseItems.length} položiek)`,
                            `Raktár (${warehouseItems.length} termék)`
                          )}
                        </div>
                        <div className="relative w-full sm:w-64">
                          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input
                            type="text"
                            value={warehouseQuery}
                            onChange={e => setWarehouseQuery(e.target.value)}
                            placeholder={t("Search product or SKU…", "Hľadať tovar alebo SKU…", "Termék vagy SKU keresése…")}
                            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                        {warehouseMatches.length > 0 ? (
                          warehouseMatches.map(wh => (
                            <button
                              key={wh.id}
                              type="button"
                              onClick={() => handleAddWarehouseProduct(wh)}
                              className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-600 transition-all text-left cursor-pointer active:scale-[0.98]"
                            >
                              + {wh.name}{" "}
                              <span className="text-slate-400">
                                ({money(wh.defaultSellPrice)}/{wh.unit})
                              </span>
                            </button>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic py-1">
                            {t("No product matches.", "Žiadny tovar nezodpovedá hľadaniu.", "Nincs találat.")}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Line items */}
                  <div className="space-y-2.5">
                    {items.length === 0 && (
                      <div className="p-6 text-center border border-dashed border-slate-200 rounded-2xl">
                        <p className="text-xs text-slate-500">
                          {t(
                            "No line items yet — pick one from the warehouse or add a custom item.",
                            "Zatiaľ žiadne položky — vyberte tovar zo skladu alebo pridajte vlastnú položku.",
                            "Még nincs tétel — válasszon a raktárból vagy adjon hozzá sajátot."
                          )}
                        </p>
                      </div>
                    )}
                    {items.map(item => (
                      <div
                        key={item.id}
                        className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-2 transition-all hover:border-slate-300"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={item.name}
                            onChange={e => handleUpdateItem(item.id, { name: e.target.value })}
                            placeholder={t("Item name", "Názov položky", "Tétel neve")}
                            className="font-bold text-xs text-slate-900 bg-transparent flex-1 border-b border-transparent hover:border-slate-200 focus:border-indigo-500 focus:outline-none transition-colors py-1"
                          />
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            title={t("Remove item", "Odstrániť položku", "Tétel eltávolítása")}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 cursor-pointer transition-all"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <input
                          type="text"
                          value={item.description || ""}
                          onChange={e => handleUpdateItem(item.id, { description: e.target.value })}
                          placeholder={t("Detailed specification", "Podrobná špecifikácia", "Részletes leírás")}
                          className="w-full text-xs text-slate-500 bg-transparent border-b border-slate-100 focus:border-indigo-400 focus:outline-none transition-colors py-1"
                        />

                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                          <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase">
                              {t("Qty", "Množstvo", "Menny.")}
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={item.quantity}
                                onChange={e => handleUpdateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                                className="w-full min-w-0 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                              />
                              <input
                                type="text"
                                value={item.unit}
                                onChange={e => handleUpdateItem(item.id, { unit: e.target.value })}
                                className="w-12 shrink-0 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase">
                              {t("Unit price", "Jedn. cena", "Egységár")} ({currencySymbol})
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={item.unitPrice}
                              onChange={e => handleUpdateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase">
                              {t("Discount", "Zľava", "Kedvezmény")} %
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="any"
                              value={item.discountPct}
                              onChange={e =>
                                handleUpdateItem(item.id, {
                                  discountPct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0))
                                })
                              }
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase">
                              {t("VAT", "DPH", "ÁFA")} %
                            </label>
                            <CustomSelect
                              size="sm"
                              value={String(item.vatRate)}
                              onChange={v => handleUpdateItem(item.id, { vatRate: parseFloat(v) || 0 })}
                              options={[
                                { value: "23", label: "23 %" },
                                { value: "20", label: "20 %" },
                                { value: "19", label: "19 %" },
                                { value: "10", label: "10 %" },
                                { value: "5", label: "5 %" },
                                { value: "0", label: "0 %" }
                              ]}
                            />
                          </div>

                          <div className="text-right self-end">
                            <label className="text-[10px] text-slate-400 font-bold uppercase block">
                              {t("Line total", "Spolu", "Összesen")}
                            </label>
                            <span className="font-bold text-xs text-slate-900 mt-1 block whitespace-nowrap">
                              {money(item.totalPrice)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Totals & optional price range */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        {t("Total incl. VAT", "Celková cena s DPH", "Végösszeg ÁFÁ-val")}
                      </div>
                      <div className="text-2xl font-black text-slate-900 mt-0.5">
                        {money(calculatedTotals.grandTotal)}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        {t("Net", "Základ", "Nettó")}: {money(calculatedTotals.subtotal)} ·{" "}
                        {t("VAT", "DPH", "ÁFA")}: {money(calculatedTotals.vatAmount)}
                      </div>
                    </div>

                    <div className="flex items-end gap-2">
                      <div>
                        <label className={labelClass}>{t("Range from", "Rozpätie od", "Tartomány -tól")}</label>
                        <input
                          type="number"
                          step="any"
                          value={priceRangeMin}
                          onChange={e => setPriceRangeMin(e.target.value)}
                          placeholder={t("optional", "voliteľné", "opcionális")}
                          className="w-28 p-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>{t("Range to", "Rozpätie do", "Tartomány -ig")}</label>
                        <input
                          type="number"
                          step="any"
                          value={priceRangeMax}
                          onChange={e => setPriceRangeMax(e.target.value)}
                          placeholder={t("optional", "voliteľné", "opcionális")}
                          className="w-28 p-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                        />
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 -mt-1">
                    {t(
                      "A filled price range replaces the exact total on the printed document — useful for preliminary offers.",
                      "Vyplnené cenové rozpätie nahradí na doklade presnú sumu — vhodné pre predbežné ponuky.",
                      "A kitöltött ártartomány felváltja a pontos összeget a bizonylaton."
                    )}
                  </p>
                </div>
              )}

              {/* STEP 4 — parameters */}
              {modalStep === 4 && (
                <div className="space-y-5 animate-fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelClass}>{t("Duration", "Dĺžka realizácie", "Kivitelezés hossza")}</label>
                      <input
                        type="text"
                        value={durationText}
                        onChange={e => setDurationText(e.target.value)}
                        placeholder={t("e.g. 2–3 days", "napr. 2–3 dni", "pl. 2–3 nap")}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{t("Start date", "Termín nástupu", "Kezdés időpontja")}</label>
                      <input
                        type="text"
                        value={startDateText}
                        onChange={e => setStartDateText(e.target.value)}
                        placeholder={t("e.g. by agreement", "napr. dohodou", "pl. megegyezés szerint")}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{t("Warranty", "Záruka", "Garancia")}</label>
                      <input
                        type="text"
                        value={warrantyText}
                        onChange={e => setWarrantyText(e.target.value)}
                        placeholder={t("e.g. 10 years", "napr. 10 rokov", "pl. 10 év")}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>
                      {t("Next step (call to action)", "Ďalší krok (výzva k akcii)", "Következő lépés")}
                    </label>
                    <textarea
                      rows={3}
                      value={nextStepsNote}
                      onChange={e => setNextStepsNote(e.target.value)}
                      className={cn(inputClass, "resize-y leading-relaxed")}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>{t("Reassurance note", "Text o garancii kvality", "Minőségi garancia szövege")}</label>
                      <textarea
                        rows={2}
                        value={reassuranceNote}
                        onChange={e => setReassuranceNote(e.target.value)}
                        className={cn(inputClass, "resize-y leading-relaxed")}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{t("Closing note", "Záverečný text", "Záró szöveg")}</label>
                      <textarea
                        rows={2}
                        value={closingNote}
                        onChange={e => setClosingNote(e.target.value)}
                        className={cn(inputClass, "resize-y leading-relaxed")}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>{t("Sign-off", "Podpis / tím", "Aláírás")}</label>
                    <input
                      type="text"
                      value={signOffTeam}
                      onChange={e => setSignOffTeam(e.target.value)}
                      placeholder={companyBillingSettings?.companyName || t("Your team", "Váš tím", "Az Ön csapata")}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>
                      {t("Four key benefits (USP cards)", "4 kľúčové výhody (USP karty)", "Négy fő előny (USP kártyák)")}
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {uspCards.map((usp, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 transition-all hover:border-slate-300">
                          <input
                            type="text"
                            value={usp.title}
                            placeholder={t(`Benefit ${idx + 1}`, `Výhoda ${idx + 1}`, `${idx + 1}. előny`)}
                            onChange={e =>
                              setUspCards(prev => prev.map((c, i) => (i === idx ? { ...c, title: e.target.value } : c)))
                            }
                            className="font-bold text-xs w-full bg-transparent border-b border-slate-200 focus:border-indigo-500 focus:outline-none transition-colors py-0.5"
                          />
                          <input
                            type="text"
                            value={usp.subtitle}
                            placeholder={t("Short description", "Krátky popis", "Rövid leírás")}
                            onChange={e =>
                              setUspCards(prev => prev.map((c, i) => (i === idx ? { ...c, subtitle: e.target.value } : c)))
                            }
                            className="text-[11px] text-slate-500 w-full bg-transparent focus:outline-none py-0.5"
                          />
                        </div>
                      ))}
                    </div>
                    {!companyBillingSettings?.defaultUspCards?.length && onOpenSettings && (
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        {t(
                          "Set these once in Settings → Invoicing and every new document starts pre-filled.",
                          "Nastavte ich raz v Nastaveniach → Fakturácia a každý nový doklad ich bude mať predvyplnené.",
                          "Állítsa be egyszer a Beállításokban, és minden új bizonylat előre kitöltve indul."
                        )}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 5 — preview */}
              {modalStep === 5 && (
                <div className="space-y-4 animate-fade-in">
                  {externalError && (
                    <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                        <span className="font-semibold">{externalError}</span>
                      </div>
                      {onOpenSettings && (
                        <button
                          onClick={onOpenSettings}
                          className="shrink-0 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs cursor-pointer transition-all active:scale-[0.98]"
                        >
                          {t("Open settings", "Otvoriť nastavenia", "Beállítások")}
                        </button>
                      )}
                    </div>
                  )}

                  {!selectedLead && (
                    <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs font-semibold flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                      {t(
                        "This is a sample preview — select a client in step 2 before issuing.",
                        "Toto je ukážkový náhľad — pred vystavením vyberte klienta v kroku 2.",
                        "Ez mintaelőnézet — kiállítás előtt válasszon ügyfelet a 2. lépésben."
                      )}
                    </div>
                  )}

                  <div className="p-4 bg-slate-100 rounded-2xl overflow-y-auto max-h-[52vh]">
                    {renderTemplate(previewDraft, draftMode === "custom" ? activeTemplate : null)}
                  </div>
                </div>
              )}
            </div>

            {/* Wizard footer */}
            <div className="p-5 sm:p-6 border-t border-slate-100 flex justify-between items-center gap-3 bg-slate-50/70">
              {modalStep > 1 ? (
                <button
                  onClick={() => setModalStep(prev => Math.max(1, prev - 1) as WizardStep)}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-[0.98]"
                >
                  {t("Back", "Späť", "Vissza")}
                </button>
              ) : (
                <span />
              )}

              {modalStep < 5 ? (
                <button
                  onClick={() => {
                    if (modalStep === 2 && !selectedLeadId) {
                      toast(t("Please select a client / lead first.", "Najprv vyberte klienta alebo lead.", "Először válasszon ügyfelet."), "error");
                      return;
                    }
                    setModalStep(prev => Math.min(5, prev + 1) as WizardStep);
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                >
                  {t("Continue", "Pokračovať", "Tovább")}
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-[0.98]"
                  >
                    <Printer className="h-4 w-4" />
                    {t("Print / PDF", "Tlač / PDF", "Nyomtatás / PDF")}
                  </button>
                  <button
                    disabled={isExternalLoading}
                    onClick={handleSaveOffer}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    {isExternalLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {editingId
                      ? t("Save changes", "Uložiť zmeny", "Módosítások mentése")
                      : draftMode === "external"
                        ? t("Issue via external API", "Vystaviť cez externé API", "Kiállítás külső API-n")
                        : t("Issue & log in CRM", "Vystaviť a zaevidovať", "Kiállítás és rögzítés")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================== PREVIEW MODAL ===================== */}
      {previewOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center gap-3 bg-slate-50/70">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900 min-w-0">
                <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
                <span className="truncate">
                  {previewOffer.documentNumber} — {previewOffer.title}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {previewOffer.externalPdfUrl && (
                  <a
                    href={previewOffer.externalPdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold hover:bg-blue-100 cursor-pointer transition-all"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t("Official PDF", "Oficiálne PDF", "Hivatalos PDF")}
                  </a>
                )}
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg text-xs font-bold text-slate-800 cursor-pointer transition-all active:scale-[0.98]"
                >
                  <Printer className="h-3.5 w-3.5" />
                  {t("Print / PDF", "Tlač / PDF", "Nyomtatás")}
                </button>
                <button
                  onClick={() => setPreviewOffer(null)}
                  title={t("Close", "Zavrieť", "Bezárás")}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-100">
              {renderTemplate(previewOffer, previewOffer.mode === "custom" ? templateFor(previewOffer) : null)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

