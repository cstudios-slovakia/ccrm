import React, { useState, useMemo, useEffect, useRef } from "react";
import { StickyHScrollbar } from "./ui/StickyHScrollbar";
import { useStickyTableHead } from "../hooks/useStickyTableHead";
import {
  FileText, Search, Eye, Trash2, Pencil,
  AlertCircle, Layers, TrendingUp, Award, Lock, Settings
} from "lucide-react";
import type {
  InvoiceOffer, InvoiceOfferMode, ExternalInvoiceProvider,
  Lead, WarehouseItem, CompanyBillingSettings,
  AiCustomTemplate, ExternalInvoicingConfig, TimelineEvent, UserProfile
} from "../types";
import type { Language } from "../utils/translations";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { OfferSettings } from "./OfferSettings";
import { CustomSelect } from "./ui/CustomSelect";
import { useConfirmDialog } from "./ui/ConfirmDialog";
import { NewOfferMenu } from "./priceOffers/NewOfferMenu";
import type { NewOfferChoice } from "./priceOffers/NewOfferMenu";
import { OfferEditor } from "./priceOffers/OfferEditor";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { formatMoney } from "../utils/currency";
import { todayLocal, nowLocalStamp, formatDateLocalized } from "../utils/localTime";
import { nextDocumentNumber as nextDocumentNumberShared } from "../utils/documentNumbering";
import { cn } from "../utils/cn";
import { FULL_MODULE_ACCESS } from "../utils/permissions";
import type { ModuleAccess } from "../utils/permissions";
import { PageHeader, StatGrid, StatTile } from "./layout";
import { getAvailableVatRates } from "../utils/vat";
import { HoldToConfirmButton } from "./ui/HoldToConfirm";
import { deleteRecordsWithUndo } from "../utils/recordActions";
import { num } from "../utils/offerDraft";
import {
  DEFAULT_OFFER_STATUS_DEFS,
  defaultOfferStatus,
  firstOfferStatusOf,
  isWonOfferStatus,
  offerStatusBadgeStyle,
  offerStatusLabel,
  offerStatusOptions,
  offerWinStats,
  type OfferStatusDef,
} from "../utils/offerStatuses";

interface PriceOffersViewProps {
  /**
   * The whole shared document list. Invoices and proformas live in the same
   * collection (orders and clients issue them), so this view filters down to
   * price offers for display and leaves every other row untouched on save.
   */
  invoicesOffers: InvoiceOffer[];
  setInvoicesOffers: React.Dispatch<React.SetStateAction<InvoiceOffer[]>>;
  /** The configurable price-offer statuses (Settings → Offer statuses). Defaults to the six built-ins. */
  offerStatuses?: OfferStatusDef[];
  setOfferStatuses?: React.Dispatch<React.SetStateAction<OfferStatusDef[]>>;
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

/** Offers always carry the CP series; invoices and proformas are issued elsewhere. */
const OFFER_PREFIX = "CP";

/**
 * Which editor is open, if any. Only one at a time: opening another one (a
 * different menu entry, or the edit button of a row) replaces it, after asking
 * when the open one has unsaved changes. `key` remounts the editor so it
 * re-seeds even when the same entry is chosen twice.
 */
interface EditorSession {
  key: number;
  mode: InvoiceOfferMode;
  /** AI template the editor starts on, for the "custom" mode. */
  templateId?: string;
  /** The saved offer being edited; null for a new one. */
  offerId: string | null;
}

export const PriceOffersView: React.FC<PriceOffersViewProps> = ({
  invoicesOffers: allDocuments = [],
  setInvoicesOffers,
  offerStatuses = DEFAULT_OFFER_STATUS_DEFS as OfferStatusDef[],
  setOfferStatuses,
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
  const [tableWrapRef, tableWrapEl] = useStickyTableHead();
  const [showSettings, setShowSettings] = useState(false);
  const currency = systemCurrency || "EUR";
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

  // -------------------------------------------------------------- editor state
  const [editorSession, setEditorSession] = useState<EditorSession | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const sessionCounter = useRef(0);
  const [previewOffer, setPreviewOffer] = useState<InvoiceOffer | null>(null);
  const [isExternalLoading, setIsExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirmDialog();

  // ------------------------------------------------------------------- helpers
  const enabledProviders = useMemo(() => {
    const list: ExternalInvoiceProvider[] = [];
    if (invoicingIntegrations?.superfaktura?.enabled) list.push("superfaktura");
    if (invoicingIntegrations?.idoklad?.enabled) list.push("idoklad");
    return list;
  }, [invoicingIntegrations]);

  /**
   * Next free offer number for the year. Derived from the highest number
   * already issued rather than from the list length, which handed out
   * duplicates the moment a document was deleted.
   */
  const nextDocumentNumber = () =>
    nextDocumentNumberShared(invoicesOffers.map(io => io.documentNumber), OFFER_PREFIX, new Date().getFullYear(), 3);

  const editingOffer = useMemo(
    () => (editorSession?.offerId ? invoicesOffers.find(o => o.id === editorSession.offerId) ?? null : null),
    [editorSession, invoicesOffers]
  );

  // An offer deleted while it is open for editing takes its editor with it.
  useEffect(() => {
    if (editorSession?.offerId && !editingOffer) {
      setEditorSession(null);
      setEditorDirty(false);
    }
  }, [editorSession, editingOffer]);

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
    // Won and lost are the status's group, not its key: the statuses are
    // configurable, and a legacy "invoiced" offer was won too.
    const approvedVal = offers.filter(o => isWonOfferStatus(o.status, offerStatuses)).reduce((sum, o) => sum + num(o.totalPrice), 0);
    // Win rate is only meaningful over offers that reached a verdict — counting
    // drafts as losses pinned it near zero however well the business was doing.
    const { decided, winRate } = offerWinStats(offers, offerStatuses);
    return {
      totalOffersVal,
      approvedVal,
      winRate,
      decidedCount: decided,
      totalCount: offers.length
    };
  }, [invoicesOffers, offerStatuses]);

  // ------------------------------------------------------------ labels & badges
  const statusLabel = (status: string) => offerStatusLabel(status, t, offerStatuses);
  // A key the list does not know (deleted elsewhere, imported) is shown raw in a neutral badge.
  const statusBadgeStyle = (status: string) => offerStatusBadgeStyle(status, offerStatuses);

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

  const filterStatusOptions = offerStatusOptions(t, offerStatuses);

  /** The picker's options, plus this very offer's own status when it is legacy or no longer in the list. */
  const statusOptionsFor = (status: string) => offerStatusOptions(t, offerStatuses, status);

  // ------------------------------------------------------------ editor opening
  /** A pristine editor goes away silently; one with changes asks first. */
  const confirmDiscard = async (): Promise<boolean> => {
    if (!editorSession || !editorDirty) return true;
    return confirm({
      title: t("Discard unsaved changes?", "Zahodiť neuložené zmeny?", "Elveti a nem mentett módosításokat?"),
      message: t(
        "This price offer has changes that were not saved.",
        "Táto cenová ponuka má neuložené zmeny.",
        "Ennek az árajánlatnak vannak nem mentett módosításai."
      ),
      confirmLabel: t("Discard", "Zahodiť", "Elvetés"),
      cancelLabel: t("Keep editing", "Pokračovať v úprave", "Szerkesztés folytatása"),
      danger: true
    });
  };

  const openEditor = async (next: Omit<EditorSession, "key">) => {
    if (!canEdit) return;
    if (!(await confirmDiscard())) return;
    setExternalError(null);
    setEditorDirty(false);
    setEditorSession({ ...next, key: ++sessionCounter.current });
  };

  const closeEditor = async () => {
    if (!(await confirmDiscard())) return;
    setEditorSession(null);
    setEditorDirty(false);
    setExternalError(null);
  };

  const openOfferSettings = async () => {
    if (!(await confirmDiscard())) return;
    setEditorSession(null);
    setEditorDirty(false);
    setExternalError(null);
    setShowSettings(true);
  };

  const handleChooseTemplate = (choice: NewOfferChoice) =>
    openEditor({ mode: choice.mode, templateId: choice.templateId, offerId: null });

  const handleEditOffer = (offer: InvoiceOffer) =>
    openEditor({ mode: offer.mode, templateId: offer.customTemplateId || undefined, offerId: offer.id });

  // ------------------------------------------------------------------- actions
  /** Saves the document the editor built; for the accounting-service mode it is issued upstream first. */
  const handleSaveOffer = async (doc: InvoiceOffer, externalProvider: ExternalInvoiceProvider) => {
    if (!canEdit) return;

    // Only issue upstream once. Re-saving an edit of an already-issued
    // document must not create a second copy in the accounting service.
    const alreadyIssuedExternally = Boolean(doc.externalId);
    if (doc.mode === "external" && !alreadyIssuedExternally) {
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
        // Sent to the client: the first status of the open group, whatever it is called here.
        doc.status = firstOfferStatusOf("open", offerStatuses) ?? doc.status;
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

    const isEdit = Boolean(editorSession?.offerId);
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
    setEditorSession(null);
    setEditorDirty(false);
  };

  const handleChangeStatus = (offerId: string, status: string) => {
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

  const billingConfigured = Boolean(companyBillingSettings?.companyName);

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
          offerStatuses={offerStatuses}
          setOfferStatuses={canConfigure ? setOfferStatuses : undefined}
          documents={allDocuments}
          setDocuments={setInvoicesOffers}
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
      {confirmDialog}

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
              <NewOfferMenu
                lang={lang}
                aiTemplates={aiCustomTemplates}
                hasExternalProvider={enabledProviders.length > 0}
                canConfigure={canConfigure}
                onOpenSettings={openOfferSettings}
                onChoose={handleChooseTemplate}
              />
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

      {/* 2b. INLINE EDITOR — in the page flow, pushing the list down; never an overlay */}
      {canEdit && editorSession && (!editorSession.offerId || editingOffer) && (
        <OfferEditor
          key={editorSession.key}
          lang={lang}
          systemLanguage={systemLanguage}
          mode={editorSession.mode}
          initialTemplateId={editorSession.templateId}
          existing={editingOffer}
          leads={leads}
          setLeads={setLeads}
          warehouseItems={warehouseItems}
          companyBillingSettings={companyBillingSettings}
          aiCustomTemplates={aiCustomTemplates}
          enabledProviders={enabledProviders}
          invoicingIntegrations={invoicingIntegrations}
          availableVatRates={availableVatRates}
          currency={currency}
          currentUser={currentUser}
          canEdit={canEdit}
          canConfigure={canConfigure}
          defaultStatus={defaultOfferStatus(offerStatuses)}
          onOpenOfferSettings={openOfferSettings}
          nextDocumentNumber={nextDocumentNumber}
          saving={isExternalLoading}
          saveError={externalError}
          onIssue={handleSaveOffer}
          onCancel={closeEditor}
          onDirtyChange={setEditorDirty}
        />
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
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-clip">
        <div ref={tableWrapRef} className="table-page-wrap">
          <table className="w-full text-left text-ui border-collapse min-w-195">
            <thead className="table-page-sticky-head">
              <tr className="bg-slate-50 text-slate-500 type-overline border-b border-slate-200">
                <th className="sticky z-10 bg-slate-50 p-4">{t("Offer no.", "Číslo ponuky", "Ajánlatszám")}</th>
                <th className="sticky z-10 bg-slate-50 p-4">{t("Title & template", "Názov a šablóna", "Cím és sablon")}</th>
                <th className="sticky z-10 bg-slate-50 p-4">{t("Client / lead", "Klient / Lead", "Ügyfél / Lead")}</th>
                <th className="sticky z-10 bg-slate-50 p-4">{t("Issued", "Vystavené", "Kiállítva")}</th>
                <th className="sticky z-10 bg-slate-50 p-4 text-right">{t("Amount", "Suma", "Összeg")}</th>
                <th className="sticky z-10 bg-slate-50 p-4 text-center">{t("Status", "Stav", "Állapot")}</th>
                <th className="sticky right-0 z-30 bg-slate-50 p-4 text-right border-l border-slate-200/60">{t("Actions", "Akcie", "Műveletek")}</th>
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
                          onChange={next => handleChangeStatus(offer.id, next)}
                          options={statusOptionsFor(offer.status)}
                          unstyled
                          className="gap-1.5 px-2.5 py-1 rounded-full type-overline border cursor-pointer transition-all hover:brightness-95"
                          style={statusBadgeStyle(offer.status)}
                        />
                      ) : (
                        <span
                          className="inline-flex items-center px-2.5 py-1 rounded-full type-overline border"
                          style={statusBadgeStyle(offer.status)}
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
                            onClick={() => handleEditOffer(offer)}
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
        <StickyHScrollbar target={tableWrapEl} />
      </div>


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
