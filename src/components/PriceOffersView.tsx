import React, { useState, useMemo, useEffect } from "react";
import {
  FileText, Plus, Search, Printer, Eye, Trash2, Pencil,
  AlertCircle, Sparkles, Package, ExternalLink, Award, Layers,
  TrendingUp, RefreshCw, ChevronRight, X, Check, UserPlus, Lock, Settings
} from "lucide-react";
import type {
  InvoiceOffer, InvoiceOfferItem, InvoiceOfferMode,
  InvoiceOfferStatus, ExternalInvoiceProvider, UspCardItem,
  Lead, WarehouseItem, CompanyBillingSettings,
  AiCustomTemplate, ExternalInvoicingConfig, TimelineEvent, UserProfile
} from "../types";
import type { Language } from "../utils/translations";
import { DefaultOfferTemplate } from "./pdf/DefaultOfferTemplate";
import { CustomAiOfferTemplate } from "./pdf/CustomAiOfferTemplate";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { OfferSettings } from "./OfferSettings";
import { CustomSelect } from "./ui/CustomSelect";
import { ClientSelect } from "./ui/ClientSelect";
import { CompanyLookupSpinner, CompanySuggestions } from "./ui/CompanySuggestions";
import { useCompanyLookup } from "../utils/useCompanyLookup";
import { applyCompanyDetailsToLead, registryCountryOf, EUROPEAN_COUNTRIES } from "../utils/companyRegistry";
import type { CompanyBackedRecord, CompanyLookupField, CompanySuggestion } from "../utils/companyRegistry";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { formatMoney, resolveCurrencySymbol } from "../utils/currency";
import { todayLocal, nowLocalStamp, formatDateLocalized } from "../utils/localTime";
import { nextDocumentNumber as nextDocumentNumberShared } from "../utils/documentNumbering";
import { cn } from "../utils/cn";
import { FULL_MODULE_ACCESS } from "../utils/permissions";
import type { ModuleAccess } from "../utils/permissions";
import { PageHeader, StatGrid, StatTile } from "./layout";
import { getAvailableVatRates, getDefaultVatRate } from "../utils/vat";
import { HoldToConfirmButton } from "./ui/HoldToConfirm";
import { deleteRecordsWithUndo } from "../utils/recordActions";

interface PriceOffersViewProps {
  /**
   * The whole shared document list. Invoices and proformas live in the same
   * collection (orders and clients issue them), so this view filters down to
   * price offers for display and leaves every other row untouched on save.
   */
  invoicesOffers: InvoiceOffer[];
  setInvoicesOffers: React.Dispatch<React.SetStateAction<InvoiceOffer[]>>;
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  warehouseItems: WarehouseItem[];
  companyBillingSettings?: CompanyBillingSettings | null;
  setCompanyBillingSettings?: (updater: (prev: CompanyBillingSettings | null) => CompanyBillingSettings | null) => void;
  aiCustomTemplates?: AiCustomTemplate[];
  setAiCustomTemplates?: React.Dispatch<React.SetStateAction<AiCustomTemplate[]>>;
  invoicingIntegrations?: ExternalInvoicingConfig | null;
  setInvoicingIntegrations?: (next: ExternalInvoicingConfig | null) => void;
  currentUser: UserProfile | null;
  systemLanguage?: string | null;
  systemCurrency?: string | null;
  /** Opens Settings → Invoicing, where the company identity lives. */
  onOpenSettings?: () => void;
  onAddTimelineEvent?: (leadId: string, event: TimelineEvent) => void;
  /** Role access for the price offers module. `edit: false` renders the view read-only. */
  access?: ModuleAccess;
  /** Whether the user may change the offer settings (connectors hold API keys). */
  canConfigure?: boolean;
}

const WIZARD_STEPS = [1, 2, 3, 4, 5] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];

/** Fallback USP cards used only until an admin fills the offer settings. */
const FALLBACK_USP: UspCardItem[] = [
  { title: "", subtitle: "" },
  { title: "", subtitle: "" },
  { title: "", subtitle: "" },
  { title: "", subtitle: "" }
];

/** Offers always carry the CP series; invoices and proformas are issued elsewhere. */
const OFFER_PREFIX = "CP";

/**
 * Statuses an offer can be moved to. "invoiced" is kept out on purpose — an
 * invoice is no longer tied to the offer it came from — but offers that already
 * carry it keep showing it (see `statusOptionsFor`).
 */
const OFFER_STATUSES = ["draft", "sent", "approved", "rejected", "cancelled"] as const;

const newLineId = () => "ioi-" + Math.random().toString(36).slice(2, 11);
const newDocumentId = () => "io-" + Math.random().toString(36).slice(2, 11);

/**
 * The client the wizard can register on the spot — a Lead in the making.
 *
 * It extends `CompanyBackedRecord` so a picked register row goes through the
 * very same `applyCompanyDetailsToLead` the client register uses, and the
 * establishment date, legal form, SK NACE and the rest ride along into the new
 * client instead of being dropped on the way.
 */
interface NewClientDraft extends CompanyBackedRecord {
  clientType: Lead["clientType"];
  phone: string;
  email: string;
}

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

/** Whole calendar days from one YYYY-MM-DD date to another. */
const daysBetween = (from: string, to: string): number => {
  const parse = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
};

/** Money that never throws on a half-populated row coming back from sync. */
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export const PriceOffersView: React.FC<PriceOffersViewProps> = ({
  invoicesOffers: allDocuments = [],
  setInvoicesOffers,
  leads = [],
  setLeads,
  warehouseItems = [],
  companyBillingSettings,
  setCompanyBillingSettings,
  aiCustomTemplates = [],
  setAiCustomTemplates,
  invoicingIntegrations,
  setInvoicingIntegrations,
  currentUser,
  systemLanguage = "sk",
  systemCurrency = "EUR",
  onOpenSettings,
  onAddTimelineEvent,
  access = FULL_MODULE_ACCESS,
  canConfigure = false
}) => {
  // Only price offers are listed, counted and numbered here.
  const invoicesOffers = useMemo(() => allDocuments.filter(d => d.type === "price_offer"), [allDocuments]);
  const lang = (systemLanguage === "sk" || systemLanguage === "hu" ? systemLanguage : "en") as Language;
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);
  const availableVatRates = useMemo(
    () => getAvailableVatRates(companyBillingSettings),
    [companyBillingSettings]
  );
  // Role gates: a viewer can browse, filter and print, but never issue, change
  // or delete a document. Every mutating handler bails out on these as well,
  // so a hidden control cannot be resurrected through a stale reference.
  const canEdit = access.edit;
  const canDelete = access.delete;
  const [showSettings, setShowSettings] = useState(false);
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
  const defaultTitle = t("Price offer", "Cenová ponuka", "Árajánlat");

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

  /**
   * Next free offer number for the year. Derived from the highest number
   * already issued rather than from the list length, which handed out
   * duplicates the moment a document was deleted.
   */
  const nextDocumentNumber = () =>
    nextDocumentNumberShared(invoicesOffers.map(io => io.documentNumber), OFFER_PREFIX, new Date().getFullYear(), 3);

  /** Seeds the draft's texts from the client. Takes the record, not its id, so a
   *  client created seconds ago can be linked without waiting for `leads` to
   *  come back around through props. */
  const applyLeadToDraft = (ld: Lead) => {
    setSubject(prev => prev || ld.interestNote || "");
    setLocation(prev => prev || ld.city || ld.address?.city || "");
    setGreetingNote(t(`Dear ${ld.name},`, `Dobrý deň, ${ld.name},`, `Tisztelt ${ld.name},`));
  };

  const handleSelectLead = (leadId: string) => {
    setSelectedLeadId(leadId);
    const ld = leads.find(l => l.id === leadId);
    if (ld) applyLeadToDraft(ld);
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
        vatRate: getDefaultVatRate(companyBillingSettings),
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
        vatRate: getDefaultVatRate(companyBillingSettings),
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
        (statusFilter === "all" || io.status === statusFilter) &&
        (modeFilter === "all" || io.mode === modeFilter)
      );
    });
  }, [invoicesOffers, searchQuery, statusFilter, modeFilter]);

  const metrics = useMemo(() => {
    const offers = invoicesOffers;
    const totalOffersVal = offers.reduce((sum, o) => sum + num(o.totalPrice), 0);
    // "invoiced" is a legacy verdict: offers that carry it were won, so they
    // still count as approved here even though it can no longer be picked.
    const isWon = (o: InvoiceOffer) => o.status === "approved" || o.status === "invoiced";
    const approvedVal = offers.filter(isWon).reduce((sum, o) => sum + num(o.totalPrice), 0);
    // Win rate is only meaningful over offers that reached a verdict — counting
    // drafts as losses pinned it near zero however well the business was doing.
    const decided = offers.filter(o => isWon(o) || o.status === "rejected");
    const won = decided.filter(isWon);
    const winRate = decided.length > 0 ? Math.round((won.length / decided.length) * 100) : 0;
    return {
      totalOffersVal,
      approvedVal,
      winRate,
      decidedCount: decided.length,
      totalCount: offers.length
    };
  }, [invoicesOffers]);

  // ------------------------------------------------------------ labels & badges
  const statusLabel = (status: InvoiceOfferStatus) => {
    switch (status) {
      case "draft": return t("Draft", "Návrh", "Piszkozat");
      case "sent": return t("Sent", "Odoslaná", "Elküldve");
      case "approved": return t("Approved", "Schválená", "Jóváhagyva");
      case "rejected": return t("Rejected", "Zamietnutá", "Elutasítva");
      case "invoiced": return t("Approved (invoiced)", "Schválená (vyfakturovaná)", "Jóváhagyva (kiszámlázva)");
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

  const filterStatusOptions = OFFER_STATUSES.map(s => ({ value: s, label: statusLabel(s) }));

  /** The picker's options, plus the legacy "invoiced" when this very offer carries it. */
  const statusOptionsFor = (status: InvoiceOfferStatus) =>
    status === "invoiced"
      ? [...filterStatusOptions, { value: "invoiced" as const, label: statusLabel("invoiced") }]
      : filterStatusOptions;

  // ------------------------------------------------------------- draft loading
  const resetDraft = () => {
    const cbs = companyBillingSettings;
    setDraftMode("default");
    setSelectedTemplateId(aiCustomTemplates[0]?.id || "");
    setExternalProvider(enabledProviders[0] || "superfaktura");
    setSelectedLeadId("");
    setTitle(defaultTitle);
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
    setDraftDocumentNumber(nextDocumentNumber());
    setDraftId(newDocumentId());
    setModalStep(1);
  };

  const handleOpenCreateModal = () => {
    if (!canEdit) return;
    resetDraft();
    setIsCreateModalOpen(true);
  };

  const handleOpenEditModal = (offer: InvoiceOffer) => {
    if (!canEdit) return;
    setEditingId(offer.id);
    setDraftMode(offer.mode);
    setSelectedTemplateId(offer.customTemplateId || aiCustomTemplates[0]?.id || "");
    setExternalProvider(offer.externalProvider || enabledProviders[0] || "superfaktura");
    setSelectedLeadId(offer.leadId || "");
    setTitle(offer.title || defaultTitle);
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
    setDraftDocumentNumber(offer.documentNumber || nextDocumentNumber());
    setDraftId(offer.id);
    setModalStep(1);
    setIsCreateModalOpen(true);
  };

  // ------------------------------------------------------ company registry
  // A document is only as good as the client block printed on it. When the lead
  // was captured without its IČO, DIČ or full address, this pulls the missing
  // fields straight from the public registers (companies and sole traders alike)
  // and writes them back onto the client, so the CRM and the invoice agree.
  const [registryQuery, setRegistryQuery] = useState("");

  const registryCountry =
    selectedLead?.address?.country || companyBillingSettings?.country || "Slovakia";

  const clientLookup = useCompanyLookup<CompanyLookupField>({ country: registryCountry });

  // Seed the box with what the client already carries, so completing a half-filled
  // lead is a click on a suggestion rather than typing the name out again.
  useEffect(() => {
    setRegistryQuery(selectedLead ? selectedLead.companyId || selectedLead.name || "" : "");
  }, [selectedLeadId]);

  const handleSelectClientSuggestion = async (item: CompanySuggestion) => {
    if (!canEdit || !selectedLead) return;

    const details = await clientLookup.select(item, registryCountry);
    if (!details) {
      (window as any).showToast?.(
        t("Error loading company details.", "Chyba pri načítaní údajov z registra.", "Hiba a cégadatok betöltésekor."),
        "error"
      );
      return;
    }

    setLeads(prev => prev.map(lead => (lead.id === selectedLead.id ? applyCompanyDetailsToLead(lead, details) : lead)));
    setRegistryQuery(details.companyId || details.name || "");
    (window as any).showToast?.(
      t("Client details loaded from the register.", "Údaje klienta boli načítané z registra.", "Az ügyfél adatai betöltve a cégjegyzékből.")
    );
  };

  // ------------------------------------------------------- register a client
  // Nothing kills a quote faster than discovering the buyer is not in the CRM
  // yet and having to leave the wizard to put them there. This registers them
  // without leaving the step: the record lands in the client register (status
  // "accepted"), never in the lead pipeline, and is linked to the draft at once.
  const emptyNewClient = (): NewClientDraft => ({
    clientType: "business",
    name: "",
    city: "",
    phone: "",
    email: "",
    contactPerson: "",
    companyId: "",
    taxId: "",
    vatId: "",
    address: {
      street: "",
      city: "",
      postalCode: "",
      country: companyBillingSettings?.country || "Slovakia"
    }
  });

  const [isNewClientOpen, setIsNewClientOpen] = useState(false);
  const [newClient, setNewClient] = useState<NewClientDraft>(emptyNewClient);

  const newClientCountry = newClient.address?.country || companyBillingSettings?.country || "Slovakia";

  const newClientLookup = useCompanyLookup<CompanyLookupField>({
    country: newClientCountry,
    // A private person has nothing to look up — the registers only hold subjects.
    enabled: newClient.clientType !== "person"
  });

  const patchNewClient = (patch: Partial<NewClientDraft>) => setNewClient(prev => ({ ...prev, ...patch }));

  const patchNewClientAddress = (patch: Partial<NewClientDraft["address"]>) =>
    setNewClient(prev => ({ ...prev, address: { ...(prev.address || {}), ...patch } }));

  /** Types into a register-backed field and asks the register about it. */
  const editNewClientField = (field: CompanyLookupField, value: string) => {
    patchNewClient({ [field]: value } as Partial<NewClientDraft>);
    newClientLookup.search(field, value, newClientCountry);
  };

  const handleNewClientSuggestion = async (item: CompanySuggestion) => {
    const details = await newClientLookup.select(item, newClientCountry);

    if (details) {
      setNewClient(prev => applyCompanyDetailsToLead(prev, details));
      toast(
        t("Client details loaded from the register.", "Údaje klienta boli načítané z registra.", "Az ügyfél adatai betöltve a cégjegyzékből.")
      );
      return;
    }

    // The register answered the search but not the detail call — keep what the
    // picked row already carried instead of dropping the choice.
    setNewClient(prev => ({
      ...prev,
      name: item.name || prev.name,
      companyId: item.companyId || prev.companyId,
      taxId: item.taxId || prev.taxId
    }));
    toast(
      t("Error loading company details.", "Chyba pri načítaní údajov z registra.", "Hiba a cégadatok betöltésekor."),
      "error"
    );
  };

  const openNewClientModal = () => {
    if (!canEdit) return;
    setNewClient(emptyNewClient());
    newClientLookup.close();
    setIsNewClientOpen(true);
  };

  const closeNewClientModal = () => {
    newClientLookup.close();
    setIsNewClientOpen(false);
  };

  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    const name = newClient.name.trim();
    if (!name) {
      toast(t("Client name is required.", "Meno klienta je povinné.", "Az ügyfél neve kötelező."), "error");
      return;
    }

    const isCompany = newClient.clientType !== "person";
    const city = (newClient.city || newClient.address?.city || "").trim();
    const orUndefined = (value?: string) => (isCompany && value?.trim() ? value.trim() : undefined);

    const client: Lead = {
      id: `client-${Date.now()}`,
      name,
      city,
      clientType: newClient.clientType,
      // "accepted" is what tells a client from an open lead everywhere in the
      // app — it keeps the record out of the pipeline and in the register.
      status: "accepted",
      source: "website",
      owner: currentUser?.name || "",
      value: 0,
      // `leads.created_at` is a DATE column: a full ISO timestamp makes MySQL
      // reject the whole sync payload.
      createdAt: todayLocal(),
      rating: 5,
      phone: newClient.phone.trim() || undefined,
      email: newClient.email.trim() || undefined,
      address: {
        street: (newClient.address?.street || "").trim(),
        city,
        postalCode: (newClient.address?.postalCode || "").trim(),
        country: newClientCountry
      },
      companyId: orUndefined(newClient.companyId),
      taxId: orUndefined(newClient.taxId),
      vatId: orUndefined(newClient.vatId),
      contactPerson: orUndefined(newClient.contactPerson),
      establishmentDate: orUndefined(newClient.establishmentDate),
      legalForm: orUndefined(newClient.legalForm),
      skNace: orUndefined(newClient.skNace),
      organizationSize: orUndefined(newClient.organizationSize),
      ownershipType: orUndefined(newClient.ownershipType),
      dataSource: orUndefined(newClient.dataSource),
      dissolutionDate: orUndefined(newClient.dissolutionDate),
      region: orUndefined(newClient.region),
      district: orUndefined(newClient.district),
      timeline: [
        {
          id: `ev-${Date.now()}`,
          type: "note",
          timestamp: nowLocalStamp(),
          title: t("Client Registered", "Klient zaregistrovaný", "Ügyfél regisztrálva"),
          content: t(
            "Client profile registered from the price offer / invoice wizard.",
            "Profil klienta bol zaregistrovaný zo sprievodcu cenovou ponukou / faktúrou.",
            "Az ügyfélprofil az árajánlat / számla varázslóból lett regisztrálva."
          )
        }
      ]
    };

    setLeads(prev => [client, ...prev]);
    setSelectedLeadId(client.id);
    applyLeadToDraft(client);
    closeNewClientModal();
    setNewClient(emptyNewClient());
    toast(t("New client registered.", "Nový klient bol zaregistrovaný.", "Az új ügyfél regisztrálva."));
  };

  // ------------------------------------------------------------ draft assembly
  const buildDocument = (): InvoiceOffer | null => {
    /** A stored date moved by as many days as the issue date was moved. */
    const shiftWithIssue = (date?: string | null, storedIssuedAt?: string | null): string | null => {
      if (!date) return null;
      if (!storedIssuedAt || storedIssuedAt === draftIssuedAt) return date;
      return addDays(date, daysBetween(storedIssuedAt, draftIssuedAt));
    };
    if (!selectedLead) return null;
    const existing = editingId ? invoicesOffers.find(o => o.id === editingId) : null;
    return {
      id: existing?.id || draftId || newDocumentId(),
      documentNumber: existing?.documentNumber || draftDocumentNumber || nextDocumentNumber(),
      type: "price_offer",
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
      title: title.trim() || defaultTitle,
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
      // The "Issued on" field is editable on an existing offer too; it used
      // to be ignored there (the stored date won), so a changed date looked
      // saved and never was. Valid-until moves with it by the same number of
      // days, keeping the offer's own terms. An offer has no payment due date.
      issuedAt: draftIssuedAt,
      validUntil: shiftWithIssue(existing?.validUntil, existing?.issuedAt) || addDays(draftIssuedAt, 30),
      dueDate: null,
      createdBy: existing?.createdBy || currentUser?.name || null
    };
  };

  /** Live preview document — the same shape the wizard will persist. */
  const previewDraft = useMemo<InvoiceOffer>(() => {
    const built = buildDocument();
    if (built) return built;
    return {
      id: "preview",
      documentNumber: draftDocumentNumber || nextDocumentNumber(),
      type: "price_offer",
      mode: draftMode,
      leadId: "",
      clientName: t("Sample client", "Ukážkový klient", "Mintaügyfél"),
      title: title.trim() || defaultTitle,
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
    draftMode, selectedLead, title, subject, location, greetingNote, introNote,
    uspCards, reassuranceNote, items, calculatedTotals, priceRangeMin, priceRangeMax,
    currency, durationText, startDateText, warrantyText, nextStepsNote, closingNote,
    signOffTeam, selectedTemplateId, editingId, draftId, draftDocumentNumber, draftIssuedAt, lang
  ]);

  // ------------------------------------------------------------------- actions
  const handleSaveOffer = async () => {
    if (!canEdit) return;
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
            "No external accounting service is enabled. Configure SuperFaktúra or iDoklad in the offer settings.",
            "Nie je zapnutá žiadna externá účtovná služba. Nastavte SuperFaktúru alebo iDoklad v nastaveniach cenových ponúk.",
            "Nincs engedélyezve külső számlázó. Állítsa be a SuperFaktúrát vagy az iDokladot az árajánlat-beállításokban."
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
              action: "create_estimate",
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
        type: "offer",
        timestamp: nowLocalStamp(),
        title: `${doc.title} (${doc.documentNumber})`,
        content: t(
          `Price offer issued for ${money(doc.totalPrice)}. Subject: ${doc.subject || "—"}`,
          `Vystavená cenová ponuka v hodnote ${money(doc.totalPrice)}. Predmet: ${doc.subject || "—"}`,
          `Kiállított árajánlat ${money(doc.totalPrice)} értékben. Tárgy: ${doc.subject || "—"}`
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
        ? t("Price offer updated.", "Cenová ponuka bola aktualizovaná.", "Az árajánlat frissítve.")
        : t("Price offer issued and logged in the CRM.", "Cenová ponuka bola vystavená a zaevidovaná v CRM.", "Az árajánlat kiállítva és rögzítve.")
    );
    setIsCreateModalOpen(false);
    setEditingId(null);
  };

  const handleChangeStatus = (offerId: string, status: InvoiceOfferStatus) => {
    if (!canEdit) return;
    setInvoicesOffers(prev =>
      prev.map(o => (o.id === offerId ? { ...o, status, statusChangedAt: todayLocal() } : o))
    );
  };

  // The hold on the button is the confirmation. Undo restores the offer at its
  // place in the full shared list, so the list passed in is the unfiltered one.
  const handleDelete = (offer: InvoiceOffer) => {
    if (!canDelete) return;
    deleteRecordsWithUndo({
      collection: "invoicesOffers",
      allRecords: allDocuments,
      targets: [offer],
      setRecords: setInvoicesOffers,
      lang,
      entity: "invoice",
      titleOf: (o) => o.documentNumber || o.title,
    });
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
    "w-full p-2.5 bg-white border border-slate-200 rounded-xl text-ui text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-all";
  const labelClass = "type-overline text-slate-600 block mb-1";

  // ---------------------------------------------------------------------------
  if (showSettings) {
    return (
      <div className="space-y-6 pb-16 font-sans animate-fade-in">
        <PageHeader
          icon={<FileText className="h-6 w-6 text-indigo-600" />}
          title={t("Price Offers", "Cenové ponuky", "Árajánlatok")}
          subtitle={t(
            "Defaults, connectors and templates for your price offers.",
            "Predvolené hodnoty, prepojenia a šablóny pre vaše cenové ponuky.",
            "Az árajánlatok alapértékei, kapcsolatai és sablonjai."
          )}
        />
        <OfferSettings
          companyBillingSettings={companyBillingSettings}
          setCompanyBillingSettings={setCompanyBillingSettings}
          invoicingIntegrations={invoicingIntegrations}
          setInvoicingIntegrations={setInvoicingIntegrations}
          aiCustomTemplates={aiCustomTemplates}
          setAiCustomTemplates={setAiCustomTemplates}
          lang={lang}
          canEdit={canConfigure}
          onBack={() => setShowSettings(false)}
          onOpenCompanySettings={onOpenSettings}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6 pb-16 font-sans animate-fade-in">
      {/* 1. SECTION HEADER & COMMAND BAR */}
      <PageHeader
        icon={<FileText className="h-6 w-6 text-indigo-600" />}
        title={t("Price Offers", "Cenové ponuky", "Árajánlatok")}
        subtitle={t(
              "Issue price offers linked to leads and warehouse stock. Invoices live in the Documents registry.",
              "Vystavujte cenové ponuky prepojené s leadmi a skladom. Faktúry nájdete v Registri dokumentov.",
              "Állítson ki árajánlatokat az ügyfelekhez és a raktárhoz kapcsolva. A számlák a Dokumentumtárban találhatók."
            )}
        actions={<>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 text-ui font-semibold rounded-2xl shadow-sm transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <Settings className="h-4 w-4 text-indigo-500" />
              <span>{t("Offer settings", "Nastavenia ponúk", "Ajánlat-beállítások")}</span>
            </button>
            {canEdit && (
              <button
                onClick={handleOpenCreateModal}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-ui font-semibold rounded-2xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" />
                <span>{t("New price offer", "Nová cenová ponuka", "Új árajánlat")}</span>
              </button>
            )}
          </div>
        </>}
      />

      {/* READ-ONLY NOTICE — the role can browse and print, but not issue or change offers */}
      {!canEdit && (
        <div className="flex items-center gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-ui text-amber-900">
          <Lock className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="font-semibold">{t("Read-only access", "Iba na čítanie", "Csak olvasható")}</span>
          <span className="text-amber-800/80">
            {t(
              "Your role can view and print price offers, but not create or change them.",
              "Vaša rola môže cenové ponuky prezerať a tlačiť, ale nie vytvárať ani meniť.",
              "Az Ön szerepköre megtekintheti és kinyomtathatja az árajánlatokat, de nem hozhat létre és nem módosíthat."
            )}
          </span>
        </div>
      )}

      {/* 2. SETUP NOTICE — an offer issued before Settings are filled in carries no company identity */}
      {!billingConfigured && (
        <div className="flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <div className="flex items-start gap-2.5 text-ui text-amber-900">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <span className="font-semibold">
              {t(
                "Your company identity is not configured yet — offers will be issued without company details, IČO/DIČ and bank account.",
                "Firemné údaje zatiaľ nie sú nastavené — ponuky sa vystavia bez firemných údajov, IČO/DIČ a bankového spojenia.",
                "A cég adatai még nincsenek beállítva — az árajánlatok cégadatok nélkül készülnek."
              )}
            </span>
          </div>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="shrink-0 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-ui font-bold transition-all cursor-pointer active:scale-[0.98]"
            >
              {t("Open settings", "Otvoriť nastavenia", "Beállítások megnyitása")}
            </button>
          )}
        </div>
      )}

      {/* 3. KPI OVERVIEW */}
      <StatGrid count={4}>
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
            label: t("Approved volume", "Objem schválených ponúk", "Jóváhagyott ajánlatok összege"),
            value: money(metrics.approvedVal, 0)
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
            label: t("Offers total", "Celkom ponúk", "Összes árajánlat"),
            value: String(metrics.totalCount)
          }
        ].map(card => (
          <StatTile key={card.label} icon={card.icon} tone={card.tone} label={card.label} value={card.value} delta={card.hint} />
        ))}
      </StatGrid>

      {/* 4. SEARCH & FILTERS */}
      <div className="bg-white p-3 ws-sm:p-4 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col ws-xl:flex-row gap-2.5 ws-sm:gap-3 ws-xl:items-center ws-xl:justify-between">
        <div className="relative w-full ws-xl:w-80">
          <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder={t("Search offer, client or number…", "Hľadať ponuku, klienta alebo číslo…", "Ajánlat, ügyfél vagy szám keresése…")}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-ui text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-all"
          />
        </div>

        <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-2 w-full ws-xl:w-auto">
          <CustomSelect
            size="sm"
            value={modeFilter}
            onChange={setModeFilter}
            className="w-full"
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
            className="w-full"
            options={[
              { value: "all", label: t("All statuses", "Všetky stavy", "Minden állapot") },
              ...filterStatusOptions
            ]}
          />
        </div>
      </div>

      {/* 5. DOCUMENTS TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm">
        <div className="table-sticky-scroll rounded-3xl">
          <table className="w-full text-left text-ui border-collapse min-w-195">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-50 text-slate-500 type-overline border-b border-slate-200">
                <th className="sticky top-0 z-10 bg-slate-50 p-4 rounded-tl-3xl">{t("Offer no.", "Číslo ponuky", "Ajánlatszám")}</th>
                <th className="sticky top-0 z-10 bg-slate-50 p-4">{t("Title & template", "Názov a šablóna", "Cím és sablon")}</th>
                <th className="sticky top-0 z-10 bg-slate-50 p-4">{t("Client / lead", "Klient / Lead", "Ügyfél / Lead")}</th>
                <th className="sticky top-0 z-10 bg-slate-50 p-4">{t("Issued", "Vystavené", "Kiállítva")}</th>
                <th className="sticky top-0 z-10 bg-slate-50 p-4 text-right">{t("Amount", "Suma", "Összeg")}</th>
                <th className="sticky top-0 z-10 bg-slate-50 p-4 text-center">{t("Status", "Stav", "Állapot")}</th>
                <th className="sticky top-0 right-0 z-30 bg-slate-50 p-4 text-right border-l border-slate-200/60 rounded-tr-3xl">{t("Actions", "Akcie", "Műveletek")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOffers.length > 0 ? (
                filteredOffers.map(offer => (
                  <tr key={offer.id} className="group hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 align-top font-mono font-bold text-slate-900 whitespace-nowrap">
                      {offer.documentNumber}
                      {offer.externalId && (
                        <span className="block text-micro text-slate-400 font-sans font-medium">
                          {offer.externalProvider === "idoklad" ? "iDoklad" : "SuperFaktúra"} #{offer.externalId}
                        </span>
                      )}
                    </td>
                    <td className="p-4 align-top">
                      <div className="font-bold text-slate-800">{offer.title}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full type-overline border",
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
                      {offer.location && <div className="text-caption text-slate-400">{offer.location}</div>}
                    </td>
                    <td className="p-4 align-top text-slate-600 whitespace-nowrap">{formatDateLocalized(offer.issuedAt, lang)}</td>
                    <td className="p-4 align-top text-right font-bold text-slate-900 whitespace-nowrap">
                      {money(offer.totalPrice)}
                    </td>
                    <td className="p-4 align-top text-center">
                      {canEdit ? (
                        <CustomSelect
                          size="sm"
                          align="right"
                          value={offer.status}
                          onChange={next => handleChangeStatus(offer.id, next as InvoiceOfferStatus)}
                          options={statusOptionsFor(offer.status)}
                          unstyled
                          className={cn(
                            "gap-1.5 px-2.5 py-1 rounded-full type-overline border cursor-pointer transition-all hover:brightness-95",
                            statusBadgeClass(offer.status)
                          )}
                        />
                      ) : (
                        <span
                          className={cn(
                            "inline-flex items-center px-2.5 py-1 rounded-full type-overline border",
                            statusBadgeClass(offer.status)
                          )}
                        >
                          {statusLabel(offer.status)}
                        </span>
                      )}
                    </td>
                    <td className="p-4 align-top text-right sticky right-0 z-10 bg-white shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.04)] border-l border-slate-100/80 transition-colors group-hover:bg-slate-50">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setPreviewOffer(offer)}
                          title={t("Preview & print", "Náhľad a tlač", "Előnézet és nyomtatás")}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => handleOpenEditModal(offer)}
                            title={t("Edit", "Upraviť", "Szerkesztés")}
                            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {canDelete && (
                          <HoldToConfirmButton
                              tone="danger"
                              lang={lang}
                              what={offer.documentNumber}
                              onConfirm={() => handleDelete(offer)}
                              title={t("Delete", "Odstrániť", "Törlés")}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                          >
                            <Trash2 className="h-4 w-4" />
                          </HoldToConfirmButton>
                        )}
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
                      <div className="font-bold text-slate-700 text-body">
                        {invoicesOffers.length === 0
                          ? t("No price offers yet", "Zatiaľ žiadne cenové ponuky", "Még nincs árajánlat")
                          : t("Nothing matches these filters", "Filtrom nezodpovedá žiadna ponuka", "Nincs találat a szűrőkre")}
                      </div>
                      <p className="text-ui text-slate-500 leading-relaxed">
                        {invoicesOffers.length === 0
                          ? canEdit
                            ? t(
                                'Create your first price offer with "New price offer".',
                                'Vytvorte prvú cenovú ponuku tlačidlom „Nová cenová ponuka“.',
                                'Hozza létre az első árajánlatot az „Új árajánlat” gombbal.'
                              )
                            : t(
                                "Price offers issued by your team will show up here.",
                                "Cenové ponuky vystavené vaším tímom sa zobrazia tu.",
                                "A csapata által kiállított árajánlatok itt jelennek meg."
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
      {canEdit && isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Wizard header */}
            <div className="p-5 ws-sm:p-6 border-b border-slate-100 flex justify-between items-start gap-4 bg-slate-50/70">
              <div className="min-w-0">
                <h3 className="text-title font-heading font-extrabold text-slate-900 tracking-tight">
                  {editingId
                    ? t("Edit price offer", "Úprava cenovej ponuky", "Árajánlat szerkesztése")
                    : t("New price offer", "Nová cenová ponuka", "Új árajánlat")}
                </h3>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-ui font-bold text-indigo-600">
                    {t(`Step ${modalStep} of 5`, `Krok ${modalStep} z 5`, `${modalStep}. lépés / 5`)}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-ui text-slate-500 font-medium">
                    {modalStep === 1 && t("Format & title", "Formát a názov ponuky", "Formátum és cím")}
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
            <div className="p-5 ws-sm:p-6 overflow-y-auto flex-1 space-y-6">
              {/* STEP 1 — format & title */}
              {modalStep === 1 && (
                <div className="space-y-6 animate-fade-in">
                  <div>
                    <label className={labelClass}>
                      1. {t("Generation mode & template", "Spôsob a šablóna generovania", "Generálási mód és sablon")}
                    </label>
                    <div className="grid grid-cols-1 ws-sm:grid-cols-3 gap-3">
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
                            : t("No AI template uploaded yet — add one in the offer settings.", "Zatiaľ nie je nahraná žiadna AI šablóna — pridajte ju v nastaveniach ponúk.", "Még nincs AI sablon — adjon hozzá az árajánlat-beállításokban."),
                          disabled: aiCustomTemplates.length === 0
                        },
                        {
                          mode: "external" as const,
                          icon: <ExternalLink className="h-4 w-4 text-blue-500" />,
                          label: "SuperFaktúra / iDoklad",
                          desc: enabledProviders.length
                            ? t("Issue directly through your accounting service API.", "Vystavenie priamo cez API vášho účtovníctva.", "Kiállítás közvetlenül a könyvelő API-n keresztül.")
                            : t("No accounting service enabled — configure it in the offer settings.", "Nie je zapnutá žiadna účtovná služba — nastavte ju v nastaveniach ponúk.", "Nincs engedélyezett könyvelő szolgáltatás."),
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
                          <div className="flex items-center gap-2 font-bold text-body text-slate-900">
                            {opt.icon}
                            {opt.label}
                          </div>
                          <div className="text-ui text-slate-500 mt-1 leading-snug">{opt.desc}</div>
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
                          label: `${tpl.name} (${formatDateLocalized(tpl.createdAt, lang)})`
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
                        <p className="text-caption text-amber-700 font-semibold mt-1.5">
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
                    <label className={labelClass}>{t("Offer title", "Názov ponuky", "Ajánlat címe")}</label>
                    <input
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder={defaultTitle}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>
                      {t("Issued on", "Dátum vystavenia", "Kiállítás dátuma")}
                    </label>
                    <input
                      type="date"
                      value={draftIssuedAt}
                      onChange={e => setDraftIssuedAt(e.target.value || todayLocal())}
                      className={inputClass}
                    />
                    <p className="text-caption text-slate-500 mt-1">
                      {t(
                        "The offer is valid for 30 days from this date.",
                        "Ponuka platí 30 dní od tohto dátumu.",
                        "Az ajánlat ettől a naptól számított 30 napig érvényes."
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 2 — client */}
              {modalStep === 2 && (
                <div className="space-y-4 animate-fade-in">
                  <div>
                    <div className="flex items-end justify-between gap-3 mb-1">
                      <label className={cn(labelClass, "mb-0")}>
                        {t("Client / lead (required)", "Klient / lead (povinné)", "Ügyfél / lead (kötelező)")}
                      </label>
                      <button
                        type="button"
                        onClick={openNewClientModal}
                        className="flex items-center gap-1.5 text-caption font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-lg px-2.5 py-1 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        {t("New client", "Nový klient", "Új ügyfél")}
                      </button>
                    </div>
                    {leads.length > 0 ? (
                      <ClientSelect
                        leads={leads}
                        value={selectedLeadId}
                        onChange={handleSelectLead}
                        placeholder={t("Select a client…", "Vyberte klienta…", "Válasszon ügyfelet…")}
                        renderLabel={l => `${l.name}${l.city ? ` (${l.city})` : ""}${l.companyId ? ` — IČO ${l.companyId}` : ""}`}
                        onCreated={applyLeadToDraft}
                      />
                    ) : (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-500">
                        {t(
                          "No leads or clients exist yet — register the first one above.",
                          "Zatiaľ neexistujú žiadne leady ani klienti — zaregistrujte prvého vyššie.",
                          "Még nincs lead vagy ügyfél — regisztrálja az elsőt fent."
                        )}
                      </div>
                    )}
                  </div>

                  {selectedLead && (
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-ui animate-fade-in">
                      <div className="font-bold text-slate-900 flex items-center justify-between gap-2">
                        <span>{t("Client billing details", "Fakturačné údaje klienta", "Ügyfél számlázási adatai")}</span>
                        <span className="type-overline text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          {t("Linked to CRM", "Prepojené s CRM", "CRM-hez kapcsolva")}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-2 text-slate-600">
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

                      {registryCountryOf(registryCountry) && (
                        <div className="pt-3 border-t border-slate-200 space-y-1.5">
                          <label className={labelClass}>
                            {t(
                              "Complete from the business register",
                              "Doplniť údaje z obchodného registra",
                              "Kiegészítés a cégjegyzékből"
                            )}
                          </label>
                          <div className="relative">
                            <div className="relative">
                              <input
                                type="text"
                                value={registryQuery}
                                onChange={e => {
                                  setRegistryQuery(e.target.value);
                                  clientLookup.search("name", e.target.value, registryCountry);
                                }}
                                onFocus={() => clientLookup.search("name", registryQuery, registryCountry)}
                                placeholder={t(
                                  "Company name, IČO, DIČ or IČ DPH…",
                                  "Názov firmy, IČO, DIČ alebo IČ DPH…",
                                  "Cégnév, adószám vagy közösségi adószám…"
                                )}
                                className={`${inputClass} pr-9`}
                              />
                              <CompanyLookupSpinner visible={clientLookup.isLoading || clientLookup.isResolving} />
                            </div>
                            <CompanySuggestions
                              suggestions={clientLookup.suggestions}
                              visible={clientLookup.activeField === "name"}
                              onSelect={handleSelectClientSuggestion}
                              onDismiss={clientLookup.close}
                              systemLanguage={systemLanguage}
                            />
                          </div>
                          <p className="text-micro text-slate-400 font-medium">
                            {t(
                              "Picking a match updates this client in the CRM, not just this document.",
                              "Vybraná zhoda sa uloží ku klientovi v CRM, nielen do tohto dokladu.",
                              "A kiválasztott találat a CRM ügyféladatait is frissíti, nem csak ezt a bizonylatot."
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3 pt-1">
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
                  <div className="flex flex-col ws-sm:flex-row justify-between items-start ws-sm:items-center gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-body">
                        {t("Scope of delivery & work", "Rozsah dodávky a prác", "Szállítás és munka terjedelme")}
                      </h4>
                      <p className="text-ui text-slate-500">
                        {t(
                          "Add stock products or your own custom line items.",
                          "Pridajte tovar zo skladu alebo doplňte vlastné položky.",
                          "Adjon hozzá raktári terméket vagy saját tételt."
                        )}
                      </p>
                    </div>
                    <button
                      onClick={handleAddCustomItem}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-ui font-bold transition-all cursor-pointer active:scale-[0.98]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t("Custom item", "Vlastná položka", "Saját tétel")}
                    </button>
                  </div>

                  {/* Warehouse picker */}
                  {warehouseItems.length > 0 && (
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                      <div className="flex flex-col ws-sm:flex-row ws-sm:items-center gap-2 justify-between">
                        <div className="type-overline text-slate-500 flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5 text-indigo-600" />
                          {t(
                            `Warehouse (${warehouseItems.length} products)`,
                            `Sklad (${warehouseItems.length} položiek)`,
                            `Raktár (${warehouseItems.length} termék)`
                          )}
                        </div>
                        <div className="relative w-full ws-sm:w-64">
                          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input
                            type="text"
                            value={warehouseQuery}
                            onChange={e => setWarehouseQuery(e.target.value)}
                            placeholder={t("Search product or SKU…", "Hľadať tovar alebo SKU…", "Termék vagy SKU keresése…")}
                            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-ui focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
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
                              className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-ui font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-600 transition-all text-left cursor-pointer active:scale-[0.98]"
                            >
                              + {wh.name}{" "}
                              <span className="text-slate-400">
                                ({money(wh.defaultSellPrice)}/{wh.unit})
                              </span>
                            </button>
                          ))
                        ) : (
                          <span className="text-ui text-slate-400 italic py-1">
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
                        <p className="text-ui text-slate-500">
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
                            className="font-bold text-ui text-slate-900 bg-transparent flex-1 border-b border-transparent hover:border-slate-200 focus:border-indigo-500 focus:outline-none transition-colors py-1"
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
                          className="w-full text-ui text-slate-500 bg-transparent border-b border-slate-100 focus:border-indigo-400 focus:outline-none transition-colors py-1"
                        />

                        <div className="grid grid-cols-2 ws-sm:grid-cols-5 gap-2 pt-1">
                          <div>
                            <label className="type-overline text-slate-400">
                              {t("Qty", "Množstvo", "Menny.")}
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={item.quantity}
                                onChange={e => handleUpdateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                                className="w-full min-w-0 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-ui font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                              />
                              <input
                                type="text"
                                value={item.unit}
                                onChange={e => handleUpdateItem(item.id, { unit: e.target.value })}
                                className="w-12 shrink-0 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-ui text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="type-overline text-slate-400">
                              {t("Unit price", "Jedn. cena", "Egységár")} ({currencySymbol})
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={item.unitPrice}
                              onChange={e => handleUpdateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-ui font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                            />
                          </div>

                          <div>
                            <label className="type-overline text-slate-400">
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
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-ui font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                            />
                          </div>

                          <div>
                            <label className="type-overline text-slate-400">
                              {t("VAT", "DPH", "ÁFA")} %
                            </label>
                            <CustomSelect
                              size="sm"
                              value={String(item.vatRate)}
                              onChange={v => handleUpdateItem(item.id, { vatRate: parseFloat(v) || 0 })}
                              options={(() => {
                                const itemRate = Number(item.vatRate) || 0;
                                const allRates = availableVatRates.includes(itemRate)
                                  ? availableVatRates
                                  : [itemRate, ...availableVatRates].sort((a, b) => b - a);
                                return allRates.map(r => ({ value: String(r), label: `${r} %` }));
                              })()}
                            />
                          </div>

                          <div className="text-right self-end">
                            <label className="type-overline text-slate-400 block">
                              {t("Line total", "Spolu", "Összesen")}
                            </label>
                            <span className="font-bold text-ui text-slate-900 mt-1 block whitespace-nowrap">
                              {money(item.totalPrice)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Totals & optional price range */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col ws-lg:flex-row justify-between items-start ws-lg:items-center gap-4">
                    <div>
                      <div className="type-overline text-slate-500">
                        {t("Total incl. VAT", "Celková cena s DPH", "Végösszeg ÁFÁ-val")}
                      </div>
                      <div className="type-metric text-slate-900 mt-0.5">
                        {money(calculatedTotals.grandTotal)}
                      </div>
                      <div className="text-caption text-slate-500 font-medium">
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
                          className="w-28 p-2 bg-white border border-slate-200 rounded-xl text-ui focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
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
                          className="w-28 p-2 bg-white border border-slate-200 rounded-xl text-ui focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                        />
                      </div>
                    </div>
                  </div>
                  <p className="text-caption text-slate-400 -mt-1">
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
                  <div className="grid grid-cols-1 ws-sm:grid-cols-3 gap-3">
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

                  <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3">
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
                    <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3">
                      {uspCards.map((usp, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 transition-all hover:border-slate-300">
                          <input
                            type="text"
                            value={usp.title}
                            placeholder={t(`Benefit ${idx + 1}`, `Výhoda ${idx + 1}`, `${idx + 1}. előny`)}
                            onChange={e =>
                              setUspCards(prev => prev.map((c, i) => (i === idx ? { ...c, title: e.target.value } : c)))
                            }
                            className="font-bold text-ui w-full bg-transparent border-b border-slate-200 focus:border-indigo-500 focus:outline-none transition-colors py-0.5"
                          />
                          <input
                            type="text"
                            value={usp.subtitle}
                            placeholder={t("Short description", "Krátky popis", "Rövid leírás")}
                            onChange={e =>
                              setUspCards(prev => prev.map((c, i) => (i === idx ? { ...c, subtitle: e.target.value } : c)))
                            }
                            className="text-caption text-slate-500 w-full bg-transparent focus:outline-none py-0.5"
                          />
                        </div>
                      ))}
                    </div>
                    {!companyBillingSettings?.defaultUspCards?.length && (
                      <p className="text-caption text-slate-400 mt-1.5">
                        {t(
                          "Set these once in the offer settings and every new offer starts pre-filled.",
                          "Nastavte ich raz v nastaveniach ponúk a každá nová ponuka ich bude mať predvyplnené.",
                          "Állítsa be egyszer az árajánlat-beállításokban, és minden új ajánlat előre kitöltve indul."
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
                    <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-ui flex flex-col ws-sm:flex-row ws-sm:items-center gap-3 justify-between">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                        <span className="font-semibold">{externalError}</span>
                      </div>
                      {canConfigure && (
                        <button
                          onClick={() => { setIsCreateModalOpen(false); setShowSettings(true); }}
                          className="shrink-0 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-ui cursor-pointer transition-all active:scale-[0.98]"
                        >
                          {t("Open settings", "Otvoriť nastavenia", "Beállítások")}
                        </button>
                      )}
                    </div>
                  )}

                  {!selectedLead && (
                    <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-ui font-semibold flex items-center gap-2">
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
            <div className="p-5 ws-sm:p-6 border-t border-slate-100 flex justify-between items-center gap-3 bg-slate-50/70">
              {modalStep > 1 ? (
                <button
                  onClick={() => setModalStep(prev => Math.max(1, prev - 1) as WizardStep)}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-ui font-bold transition-all cursor-pointer active:scale-[0.98]"
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
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-ui font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                >
                  {t("Continue", "Pokračovať", "Tovább")}
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-ui font-bold cursor-pointer transition-all active:scale-[0.98]"
                  >
                    <Printer className="h-4 w-4" />
                    {t("Print / PDF", "Tlač / PDF", "Nyomtatás / PDF")}
                  </button>
                  <button
                    disabled={isExternalLoading}
                    onClick={handleSaveOffer}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-ui font-bold shadow-md shadow-emerald-600/20 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
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

      {/* ================== NEW CLIENT MODAL (register) ================== */}
      {/* Sits above the wizard (z-[60] over its z-50) so the draft behind it is
          left exactly as it was — cancelling costs the user nothing. */}
      {isNewClientOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <form
            onSubmit={handleCreateClient}
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="p-5 border-b border-slate-100 flex justify-between items-start gap-4 bg-slate-50/70">
              <div className="min-w-0">
                <h3 className="text-title-sm font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <UserPlus className="h-4.5 w-4.5 text-indigo-600" />
                  {t("Register a new client", "Registrovať nového klienta", "Új ügyfél regisztrálása")}
                </h3>
                <p className="text-caption text-slate-500 font-medium mt-1">
                  {t(
                    "Saved to the client register, not to the lead pipeline, and linked to this document straight away.",
                    "Uloží sa do registra klientov, nie medzi leady, a hneď sa prepojí s týmto dokladom.",
                    "Az ügyfélnyilvántartásba kerül, nem a leadek közé, és azonnal összekapcsolódik ezzel a bizonylattal."
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={closeNewClientModal}
                title={t("Close", "Zavrieť", "Bezárás")}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 cursor-pointer transition-all shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Client type */}
              <div>
                <label className={labelClass}>{t("Client type", "Typ klienta", "Ügyfél típusa")}</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: "business" as const, label: t("Company", "Firma", "Cég") },
                    { id: "person" as const, label: t("Person", "Fyzická osoba", "Magánszemély") },
                    { id: "partner" as const, label: t("Partner", "Partner", "Partner") }
                  ]).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        patchNewClient({ clientType: opt.id });
                        if (opt.id === "person") newClientLookup.close();
                      }}
                      className={cn(
                        "px-3 py-2 rounded-xl border-2 text-ui font-bold transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.98]",
                        newClient.clientType === opt.id
                          ? "border-indigo-500 bg-indigo-50/60 text-indigo-700 shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 ws-sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>{t("Country", "Krajina", "Ország")}</label>
                  <CustomSelect
                    value={newClientCountry}
                    onChange={v => patchNewClientAddress({ country: v })}
                    options={EUROPEAN_COUNTRIES.map(c => ({ value: c, label: c }))}
                  />
                </div>
                <div className="ws-sm:col-span-2 relative">
                  <label className={labelClass}>
                    {t("Name / company *", "Meno / názov firmy *", "Név / cégnév *")}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={newClient.name}
                      onChange={e => editNewClientField("name", e.target.value)}
                      placeholder={t("e.g. Ján Novák or Acme s.r.o.", "napr. Ján Novák alebo Acme s.r.o.", "pl. Kiss János vagy Acme Kft.")}
                      className={`${inputClass} pr-9`}
                    />
                    <CompanyLookupSpinner visible={newClientLookup.isLoading && newClientLookup.activeField === "name"} />
                  </div>
                  <CompanySuggestions
                    suggestions={newClientLookup.suggestions}
                    visible={newClientLookup.activeField === "name"}
                    onSelect={handleNewClientSuggestion}
                    onDismiss={newClientLookup.close}
                    systemLanguage={systemLanguage}
                  />
                </div>
              </div>

              {/* Register-backed identifiers — a private person has none. */}
              {newClient.clientType !== "person" && (
                <div className="grid grid-cols-1 ws-sm:grid-cols-3 gap-3 animate-fade-in">
                  {([
                    { field: "companyId" as const, label: "IČO", placeholder: "12345678" },
                    { field: "taxId" as const, label: "DIČ", placeholder: "2020123456" },
                    { field: "vatId" as const, label: "IČ DPH", placeholder: "SK2020123456" }
                  ]).map(f => (
                    <div key={f.field} className="relative">
                      <label className={labelClass}>{f.label}</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={newClient[f.field] || ""}
                          onChange={e => editNewClientField(f.field, e.target.value)}
                          placeholder={f.placeholder}
                          className={`${inputClass} pr-9`}
                        />
                        <CompanyLookupSpinner
                          visible={newClientLookup.isLoading && newClientLookup.activeField === f.field}
                        />
                      </div>
                      <CompanySuggestions
                        suggestions={newClientLookup.suggestions}
                        visible={newClientLookup.activeField === f.field}
                        onSelect={handleNewClientSuggestion}
                        onDismiss={newClientLookup.close}
                        systemLanguage={systemLanguage}
                      />
                    </div>
                  ))}
                </div>
              )}

              {registryCountryOf(newClientCountry) && newClient.clientType !== "person" && (
                <p className="text-micro text-slate-400 font-medium -mt-1">
                  {t(
                    "Start typing a name or IČO — the business register fills in the address and identifiers.",
                    "Začnite písať názov alebo IČO — obchodný register doplní adresu aj identifikátory.",
                    "Kezdje el gépelni a nevet vagy az adószámot — a cégjegyzék kitölti a címet és az azonosítókat."
                  )}
                </p>
              )}

              {newClient.clientType !== "person" && (
                <div>
                  <label className={labelClass}>{t("Contact person", "Kontaktná osoba", "Kapcsolattartó")}</label>
                  <input
                    type="text"
                    value={newClient.contactPerson || ""}
                    onChange={e => patchNewClient({ contactPerson: e.target.value })}
                    className={inputClass}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>{t("Email", "Email", "E-mail")}</label>
                  <input
                    type="email"
                    value={newClient.email}
                    onChange={e => patchNewClient({ email: e.target.value })}
                    placeholder="client@email.com"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t("Phone", "Telefón", "Telefon")}</label>
                  <input
                    type="text"
                    value={newClient.phone}
                    onChange={e => patchNewClient({ phone: e.target.value })}
                    placeholder="+421…"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 ws-sm:grid-cols-4 gap-3">
                <div className="ws-sm:col-span-2">
                  <label className={labelClass}>{t("Street", "Ulica a číslo", "Utca, házszám")}</label>
                  <input
                    type="text"
                    value={newClient.address?.street || ""}
                    onChange={e => patchNewClientAddress({ street: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t("City", "Mesto", "Város")}</label>
                  <input
                    type="text"
                    value={newClient.city || newClient.address?.city || ""}
                    onChange={e => {
                      patchNewClient({ city: e.target.value });
                      patchNewClientAddress({ city: e.target.value });
                    }}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t("Postal code", "PSČ", "Irányítószám")}</label>
                  <input
                    type="text"
                    value={newClient.address?.postalCode || ""}
                    onChange={e => patchNewClientAddress({ postalCode: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeNewClientModal}
                className="px-4 py-2.5 rounded-xl text-ui font-bold text-slate-600 hover:bg-slate-200/70 cursor-pointer transition-all active:scale-[0.98]"
              >
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
              <button
                type="submit"
                disabled={!newClient.name.trim() || newClientLookup.isResolving}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-ui font-bold shadow-md shadow-indigo-600/20 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {newClientLookup.isResolving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {t("Create & link client", "Vytvoriť a prepojiť klienta", "Ügyfél létrehozása és összekapcsolása")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================== PREVIEW MODAL ===================== */}
      {previewOffer && (
        <DocumentPreviewModal
          document={previewOffer}
          companySettings={companyBillingSettings}
          aiCustomTemplates={aiCustomTemplates}
          currency={currency}
          lang={lang}
          onClose={() => setPreviewOffer(null)}
        />
      )}
    </div>
  );
};

