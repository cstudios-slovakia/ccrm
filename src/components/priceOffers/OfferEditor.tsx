import React, { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  AlertCircle, Award, Check, ExternalLink, Eye, Pencil, Printer, RefreshCw, Sparkles, UserPlus, X
} from "lucide-react";
import type {
  AiCustomTemplate, CompanyBillingSettings, ExternalInvoiceProvider, ExternalInvoicingConfig,
  InvoiceOffer, InvoiceOfferItem, InvoiceOfferMode, Lead, UserProfile, WarehouseItem
} from "../../types";
import type { Language } from "../../utils/translations";
import { DefaultOfferTemplate } from "../pdf/DefaultOfferTemplate";
import { CustomAiOfferTemplate } from "../pdf/CustomAiOfferTemplate";
import type { OfferEditing, OfferSectionAlert } from "../pdf/offerEditing";
import { ClientSelect } from "../ui/ClientSelect";
import { CustomSelect } from "../ui/CustomSelect";
import { ClientRegistryCompletion } from "./ClientRegistryCompletion";
import { ExternalOfferForm } from "./ExternalOfferForm";
import { NewClientModal } from "./NewClientModal";
import { WarehouseProductPicker } from "./WarehouseProductPicker";
import { formatMoney, resolveCurrencySymbol } from "../../utils/currency";
import { todayLocal, formatDateLocalized } from "../../utils/localTime";
import { getDefaultVatRate } from "../../utils/vat";
import { cn } from "../../utils/cn";
import {
  MAX_USP_CARDS, buildOfferFromDraft, customLine, draftFromOffer, draftSignature, newOfferDraft,
  offerForEditing, offerTotals, patchLine, previewOfferFromDraft, warehouseLine, num
} from "../../utils/offerDraft";
import type { AssembleOptions } from "../../utils/offerDraft";

const newLineId = () => "ioi-" + Math.random().toString(36).slice(2, 11);
const newDocumentId = () => "io-" + Math.random().toString(36).slice(2, 11);

interface OfferEditorProps {
  lang: Language;
  systemLanguage?: string | null;
  /** The format this editor was opened for — the menu entry that was chosen. */
  mode: InvoiceOfferMode;
  /** The AI template to start on, for "custom". */
  initialTemplateId?: string;
  /** The saved offer being edited, or null for a new one. */
  existing: InvoiceOffer | null;
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  warehouseItems: WarehouseItem[];
  companyBillingSettings?: CompanyBillingSettings | null;
  aiCustomTemplates: AiCustomTemplate[];
  enabledProviders: ExternalInvoiceProvider[];
  invoicingIntegrations?: ExternalInvoicingConfig | null;
  availableVatRates: number[];
  currency: string;
  currentUser: UserProfile | null;
  canEdit: boolean;
  canConfigure: boolean;
  /** The status a new offer starts in: the first draft status of the configured list. */
  defaultStatus?: string;
  /** Leaves for Settings → Offer settings. The view decides about unsaved changes. */
  onOpenOfferSettings: () => void;
  nextDocumentNumber: () => string;
  /** An issue or save is in flight (the external service can take a while). */
  saving: boolean;
  saveError: string | null;
  /** Resolves once the document is saved; the view then closes the editor. */
  onIssue: (doc: InvoiceOffer, provider: ExternalInvoiceProvider) => Promise<void>;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

type EditorView = "edit" | "preview";

/**
 * The inline price offer editor.
 *
 * For the Standard and AI templates the editor *is* the document: the template
 * renders with every editable field in place, and Preview shows the very same
 * template without the editing contract — what Print and the preview modal
 * show for the saved offer. The accounting-service mode has no document of its
 * own, so it gets a compact form in the same panel.
 *
 * Everything lives in one `InvoiceOffer`-shaped draft that the template patches
 * directly; `utils/offerDraft` turns it into the document that is saved.
 */
export const OfferEditor: React.FC<OfferEditorProps> = ({
  lang,
  systemLanguage,
  mode,
  initialTemplateId,
  existing,
  leads,
  setLeads,
  warehouseItems,
  companyBillingSettings,
  aiCustomTemplates,
  enabledProviders,
  invoicingIntegrations,
  availableVatRates,
  currency,
  currentUser,
  canEdit,
  canConfigure,
  defaultStatus,
  onOpenOfferSettings,
  nextDocumentNumber,
  saving,
  saveError,
  onIssue,
  onCancel,
  onDirtyChange
}) => {
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);
  const toast = (message: string, variant?: "error" | "warning") => {
    const fn = (window as any).showToast;
    if (typeof fn === "function") fn(message, variant);
  };
  const defaultTitle = t("Price offer", "Cenová ponuka", "Árajánlat");
  const currencySymbol = resolveCurrencySymbol(currency, lang);
  const money = (value: unknown, decimals = 2) =>
    formatMoney(num(value), currency, lang, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const isExternal = mode === "external";
  const isEdit = Boolean(existing);

  // ------------------------------------------------------------------- state
  // Seeded once, when the editor opens: the number and the dates stay stable
  // while the user types, and the document shows the exact values that get saved.
  const seed = useMemo(() => {
    const cbs = companyBillingSettings;
    if (existing) {
      return draftFromOffer(existing, {
        defaultTitle,
        todayIso: todayLocal(),
        fallbackTemplateId: aiCustomTemplates[0]?.id || ""
      });
    }
    return newOfferDraft({
      id: newDocumentId(),
      documentNumber: nextDocumentNumber(),
      issuedAt: todayLocal(),
      mode,
      templateId: initialTemplateId || aiCustomTemplates[0]?.id || "",
      defaultTitle,
      signOffTeam: cbs?.companyName
        ? t(`The ${cbs.companyName} team`, `Tím ${cbs.companyName}`, `A ${cbs.companyName} csapata`)
        : "",
      currency,
      settings: cbs,
      status: defaultStatus
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [draft, setDraft] = useState<InvoiceOffer>(seed);
  const [provider, setProvider] = useState<ExternalInvoiceProvider>(
    existing?.externalProvider || enabledProviders[0] || "superfaktura"
  );
  const [view, setView] = useState<EditorView>("edit");
  const [warehouseQuery, setWarehouseQuery] = useState("");
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [sectionAlert, setSectionAlert] = useState<OfferSectionAlert | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const alertTimer = useRef<number | undefined>(undefined);
  const openedWith = useRef(draftSignature(seed, isExternal ? provider : ""));

  const dirty = draftSignature(draft, isExternal ? provider : "") !== openedWith.current;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty]);
  useEffect(
    () => () => {
      onDirtyChange(false);
      window.clearTimeout(alertTimer.current);
    },
    []
  );

  // The outline is rendered with the alert, so the scroll and focus wait until
  // that block is actually in the document.
  useEffect(() => {
    if (!sectionAlert) return;
    const root = bodyRef.current;
    if (!root) return;
    const section = root.querySelector<HTMLElement>(
      sectionAlert === "client" ? "[data-offer-client-picker], [data-offer-client]" : "[data-offer-items]"
    );
    const control =
      sectionAlert === "client"
        ? section?.querySelector<HTMLElement>("button")
        : root.querySelector<HTMLElement>("[data-offer-add-item]");
    section?.scrollIntoView({ behavior: "smooth", block: "center" });
    control?.focus({ preventScroll: true });
  }, [sectionAlert]);

  // Bring the editor into view and put the cursor in the first field.
  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const first = bodyRef.current?.querySelector<HTMLElement>(
      '[data-offer-field="title"] input, input:not([type="hidden"]), textarea, select, button'
    );
    first?.focus({ preventScroll: true });
  }, []);

  // ----------------------------------------------------------------- derived
  const lead = useMemo(() => leads.find(l => l.id === draft.leadId) || null, [leads, draft.leadId]);
  const activeTemplate = useMemo(
    () => aiCustomTemplates.find(tpl => tpl.id === draft.customTemplateId) || aiCustomTemplates[0] || null,
    [aiCustomTemplates, draft.customTemplateId]
  );

  const assembleOptions: AssembleOptions = {
    lead,
    existing,
    currency,
    defaultTitle,
    defaultCountry: companyBillingSettings?.country,
    createdBy: currentUser?.name,
    fallbackDocumentNumber: draft.documentNumber,
    fallbackId: draft.id,
    activeTemplateId: activeTemplate?.id
  };

  const editorOffer = useMemo(
    () => offerForEditing(draft, assembleOptions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, lead, existing, currency, activeTemplate, lang]
  );
  const previewOffer = useMemo(
    () =>
      previewOfferFromDraft(draft, {
        ...assembleOptions,
        sampleClientName: t("Sample client", "Ukážkový klient", "Mintaügyfél")
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, lead, existing, currency, activeTemplate, lang]
  );
  const totals = useMemo(() => offerTotals(draft.items), [draft.items]);

  // ---------------------------------------------------------------- editing
  const patchDraft = (patch: Partial<InvoiceOffer>) =>
    setDraft(prev => ({
      ...prev,
      ...patch,
      // A cleared date input would leave the document undated.
      ...("issuedAt" in patch ? { issuedAt: patch.issuedAt || todayLocal() } : {})
    }));

  const updateItem = (id: string, patch: Partial<InvoiceOfferItem>) =>
    setDraft(prev => ({ ...prev, items: prev.items.map(it => (it.id === id ? patchLine(it, patch) : it)) }));
  const removeItem = (id: string) => setDraft(prev => ({ ...prev, items: prev.items.filter(it => it.id !== id) }));
  const addItem = () =>
    setDraft(prev => ({
      ...prev,
      items: [...prev.items, customLine(newLineId(), getDefaultVatRate(companyBillingSettings))]
    }));
  const addWarehouseProduct = (product: WarehouseItem) =>
    setDraft(prev => ({
      ...prev,
      items: [...prev.items, warehouseLine(newLineId(), product, getDefaultVatRate(companyBillingSettings))]
    }));

  const updateUsp = (index: number, patch: Partial<InvoiceOffer["uspCards"][number]>) =>
    setDraft(prev => ({ ...prev, uspCards: prev.uspCards.map((c, i) => (i === index ? { ...c, ...patch } : c)) }));
  const addUsp = () =>
    setDraft(prev =>
      prev.uspCards.length >= MAX_USP_CARDS ? prev : { ...prev, uspCards: [...prev.uspCards, { title: "", subtitle: "" }] }
    );
  const removeUsp = (index: number) =>
    setDraft(prev => ({ ...prev, uspCards: prev.uspCards.filter((_, i) => i !== index) }));

  /** Seeds the draft's texts from the client. Takes the record, not its id, so a
   *  client created seconds ago can be linked without waiting for `leads` to
   *  come back around through props. */
  const applyLeadToDraft = (ld: Lead) =>
    setDraft(prev => ({
      ...prev,
      leadId: ld.id,
      subject: prev.subject || ld.interestNote || "",
      location: prev.location || ld.city || ld.address?.city || "",
      greetingNote: t(`Dear ${ld.name},`, `Dobrý deň, ${ld.name},`, `Tisztelt ${ld.name},`)
    }));

  const handleSelectLead = (leadId: string) => {
    const ld = leads.find(l => l.id === leadId);
    if (ld) applyLeadToDraft(ld);
    else setDraft(prev => ({ ...prev, leadId }));
  };

  // ------------------------------------------------------------- validation
  /** Pulse the block the toast is talking about, on the document itself. */
  const flashSection = (which: OfferSectionAlert) => {
    setSectionAlert(which);
    window.clearTimeout(alertTimer.current);
    alertTimer.current = window.setTimeout(() => setSectionAlert(null), 2600);
  };

  const focusClientPicker = () => flashSection("client");
  const focusAddItem = () => flashSection("items");

  const handleIssue = async () => {
    if (!canEdit || saving) return;
    const doc = buildOfferFromDraft(draft, assembleOptions);
    // Validation never moves the user to another mode. The toast says what is
    // missing, and the same block is outlined on the document — Edit, Preview
    // and the external form.
    if (!doc) {
      toast(t("Please select a client / lead first.", "Najprv vyberte klienta alebo lead.", "Először válasszon ügyfelet."), "error");
      focusClientPicker();
      return;
    }
    if (!doc.items.length) {
      toast(t("Add at least one line item.", "Pridajte aspoň jednu položku.", "Adjon hozzá legalább egy tételt."), "error");
      focusAddItem();
      return;
    }
    await onIssue(doc, provider);
  };

  /** Print is always the finished document, so it leaves Edit first. */
  const handlePrint = () => {
    flushSync(() => setView("preview"));
    window.print();
  };

  // ---------------------------------------------------------- client picker
  const clientPicker = (variant: "paper" | "app") => (
    <span
      data-offer-client-picker
      className={cn(
        "inline-flex flex-nowrap items-center gap-1.5 rounded-lg align-middle transition-shadow",
        sectionAlert === "client" && "ring-2 ring-rose-500 ring-offset-2 animate-pulse motion-reduce:animate-none"
      )}
    >
      {leads.length > 0 ? (
        <ClientSelect
          size="sm"
          className="w-56"
          leads={leads}
          value={draft.leadId}
          onChange={handleSelectLead}
          placeholder={t("Select a client…", "Vyberte klienta…", "Válasszon ügyfelet…")}
          renderLabel={l => `${l.name}${l.city ? ` (${l.city})` : ""}${l.companyId ? ` — IČO ${l.companyId}` : ""}`}
          onCreated={applyLeadToDraft}
        />
      ) : (
        <span className="italic text-slate-400">
          {t("No clients yet — register the first one.", "Zatiaľ žiadni klienti — zaregistrujte prvého.", "Még nincs ügyfél — regisztrálja az elsőt.")}
        </span>
      )}
      <button
        type="button"
        onClick={() => setNewClientOpen(true)}
        title={t("Register a new client", "Registrovať nového klienta", "Új ügyfél regisztrálása")}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-indigo-100 bg-indigo-50 px-2 py-1 font-bold text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]",
          variant === "app" && "text-caption"
        )}
      >
        <UserPlus className="size-3.5" />
        {t("New client", "Nový klient", "Új ügyfél")}
      </button>
    </span>
  );

  const productPicker = (variant: "paper" | "app") => (
    <WarehouseProductPicker
      lang={lang}
      products={warehouseItems}
      query={warehouseQuery}
      onQueryChange={setWarehouseQuery}
      onPick={addWarehouseProduct}
      money={money}
      variant={variant}
    />
  );

  const editing: OfferEditing = {
    onChange: patchDraft,
    addItem,
    updateItem,
    removeItem,
    addUsp,
    updateUsp,
    removeUsp,
    vatRates: availableVatRates,
    currencySymbol,
    renderClientPicker: () => clientPicker("paper"),
    renderClientExtras: lead
      ? () => (
          <ClientRegistryCompletion
            lang={lang}
            systemLanguage={systemLanguage}
            lead={lead}
            canEdit={canEdit}
            companyBillingSettings={companyBillingSettings}
            setLeads={setLeads}
          />
        )
      : undefined,
    renderProductPicker: () => productPicker("paper"),
    copy: {
      identityHint: t("Set in offer settings", "Nastaví sa v nastaveniach ponúk", "Az árajánlat-beállításokban adható meg"),
      noItems: t(
        "No line items yet — add a custom item or pick a product from the warehouse.",
        "Zatiaľ žiadne položky — pridajte vlastnú položku alebo vyberte tovar zo skladu.",
        "Még nincs tétel — adjon hozzá saját tételt vagy válasszon a raktárból."
      ),
      addItem: t("Custom item", "Vlastná položka", "Saját tétel"),
      addUsp: t("Add benefit", "Pridať výhodu", "Előny hozzáadása"),
      removeItem: t("Remove item", "Odstrániť položku", "Tétel eltávolítása"),
      removeUsp: t("Remove benefit", "Odstrániť výhodu", "Előny eltávolítása"),
      priceRangeFrom: t("Price range from", "Cenové rozpätie od", "Ártartomány -tól"),
      priceRangeTo: t("to", "do", "-ig"),
      priceRangeHint: t(
        "A filled price range replaces the exact total on the printed document — useful for preliminary offers.",
        "Vyplnené cenové rozpätie nahradí na doklade presnú sumu — vhodné pre predbežné ponuky.",
        "A kitöltött ártartomány felváltja a pontos összeget a bizonylaton."
      ),
      vat: t("VAT", "DPH", "ÁFA"),
      discount: t("Discount %", "Zľava %", "Kedvezmény %"),
      uspNeedsCard: t(
        "Printed only together with at least one benefit above.",
        "Vytlačí sa len spolu s aspoň jednou výhodou vyššie.",
        "Csak legalább egy fenti előnnyel együtt nyomtatódik."
      ),
      optional: t("optional", "voliteľné", "opcionális"),
      itemName: t("Item name", "Názov položky", "Tétel neve"),
      specification: t("Detailed specification", "Podrobná špecifikácia", "Részletes leírás"),
      qty: t("Quantity", "Množstvo", "Mennyiség"),
      unit: t("Unit", "Jednotka", "Egység"),
      unitPrice: t("Unit price", "Jedn. cena", "Egységár"),
      uspTitle: n => t(`Benefit ${n}`, `Výhoda ${n}`, `${n}. előny`),
      uspSubtitle: t("Short description", "Krátky popis", "Rövid leírás"),
      paramPlaceholders: {
        duration: t("Duration, e.g. 2–3 days", "Dĺžka realizácie, napr. 2–3 dni", "Időtartam, pl. 2–3 nap"),
        startDate: t("Start date, e.g. by agreement", "Termín nástupu, napr. dohodou", "Kezdés, pl. megegyezés szerint"),
        warranty: t("Warranty, e.g. 24 months", "Záruka, napr. 24 mesiacov", "Garancia, pl. 24 hónap")
      }
    }
  };

  // ----------------------------------------------------------------- labels
  const modeLabel = isExternal
    ? "SuperFaktúra / iDoklad"
    : mode === "custom"
      ? t("AI template", "AI šablóna", "AI sablon")
      : t("Standard template", "Štandardná šablóna", "Alap sablon");
  const modeIcon = isExternal ? (
    <ExternalLink className="size-5 text-blue-500" />
  ) : mode === "custom" ? (
    <Sparkles className="size-5 text-purple-500" />
  ) : (
    <Award className="size-5 text-orange-500" />
  );
  const sandboxOn = Boolean(invoicingIntegrations?.superfaktura?.sandbox || invoicingIntegrations?.idoklad?.sandbox);

  const issueLabel = isEdit
    ? t("Save changes", "Uložiť zmeny", "Módosítások mentése")
    : isExternal
      ? t("Issue via external API", "Vystaviť cez externé API", "Kiállítás külső API-n")
      : t("Issue & log in CRM", "Vystaviť a zaevidovať", "Kiállítás és rögzítés");

  const segment = (value: EditorView, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === value}
      onClick={() => setView(value)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-ui font-semibold transition-all cursor-pointer",
        view === value ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
      )}
    >
      {icon}
      {label}
    </button>
  );

  // ----------------------------------------------------------------- render
  const documentFor = (offer: InvoiceOffer, withEditing: boolean) =>
    mode === "custom" ? (
      <CustomAiOfferTemplate
        offer={offer}
        companySettings={companyBillingSettings}
        customTemplate={activeTemplate}
        systemCurrency={currency}
        language={lang}
        editing={withEditing ? editing : undefined}
        sectionAlert={sectionAlert}
      />
    ) : (
      <DefaultOfferTemplate
        offer={offer}
        companySettings={companyBillingSettings}
        systemCurrency={currency}
        language={lang}
        editing={withEditing ? editing : undefined}
        sectionAlert={sectionAlert}
      />
    );

  return (
    <div
      ref={rootRef}
      data-offer-editor
      data-offer-view={isExternal ? "external" : view}
      className="space-y-3 animate-fade-in scroll-mt-2"
    >
      {/* Toolbar — sticks to the top of the workspace while the document scrolls */}
      <div className="sticky top-[calc(var(--gutter)*-1)] z-30 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-md backdrop-blur">
        <div className="mr-auto flex min-w-0 items-center gap-2.5">
          {modeIcon}
          <div className="min-w-0">
            <h3 className="type-card-title text-slate-900 truncate">
              {isEdit
                ? t("Edit price offer", "Úprava cenovej ponuky", "Árajánlat szerkesztése")
                : t("New price offer", "Nová cenová ponuka", "Új árajánlat")}
            </h3>
            <p className="type-meta text-slate-500 truncate">
              {modeLabel} · {draft.documentNumber}
              {mode === "custom" && activeTemplate ? ` · ${activeTemplate.name}` : ""}
            </p>
          </div>
        </div>

        {mode === "custom" && aiCustomTemplates.length > 0 && (
          <div className="w-56 max-w-full">
            <CustomSelect
              size="sm"
              value={activeTemplate?.id || ""}
              onChange={id => patchDraft({ customTemplateId: id })}
              options={aiCustomTemplates.map(tpl => ({
                value: tpl.id,
                label: `${tpl.name} (${formatDateLocalized(tpl.createdAt, lang)})`
              }))}
            />
          </div>
        )}

        {!isExternal && (
          <div
            role="tablist"
            aria-label={t("Edit or preview", "Úprava alebo náhľad", "Szerkesztés vagy előnézet")}
            className="inline-flex rounded-xl bg-slate-100 p-1"
          >
            {segment("edit", t("Edit", "Úprava", "Szerkesztés"), <Pencil className="size-3.5" />)}
            {segment("preview", t("Preview", "Náhľad", "Előnézet"), <Eye className="size-3.5" />)}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!isExternal && (
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-xl bg-slate-200 px-4 py-2 text-ui font-bold text-slate-800 transition-all hover:bg-slate-300 cursor-pointer active:scale-[0.98]"
            >
              <Printer className="size-4" />
              {t("Print / PDF", "Tlač / PDF", "Nyomtatás / PDF")}
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={handleIssue}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-ui font-bold text-white shadow-md shadow-emerald-600/20 transition-all cursor-pointer hover:scale-[1.02] hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {saving ? <RefreshCw className="size-4 animate-spin" /> : <Check className="size-4" />}
            {issueLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-ui font-bold text-slate-600 transition-all hover:bg-slate-100 cursor-pointer active:scale-[0.98]"
          >
            <X className="size-4" />
            {t("Cancel", "Zrušiť", "Mégse")}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-ui text-rose-800 ws-sm:flex-row ws-sm:items-center ws-sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600" />
            <span className="font-semibold">{saveError}</span>
          </div>
          {canConfigure && (
            <button
              type="button"
              onClick={onOpenOfferSettings}
              className="shrink-0 rounded-lg bg-rose-600 px-3 py-1.5 text-ui font-bold text-white transition-all hover:bg-rose-700 cursor-pointer active:scale-[0.98]"
            >
              {t("Open settings", "Otvoriť nastavenia", "Beállítások")}
            </button>
          )}
        </div>
      )}

      {!isExternal && view === "preview" && !lead && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-ui font-semibold text-amber-900">
          <AlertCircle className="size-4 shrink-0 text-amber-600" />
          {t(
            "This is a sample preview — select a client in Edit before issuing.",
            "Toto je ukážkový náhľad — pred vystavením vyberte klienta v úprave.",
            "Ez mintaelőnézet — kiállítás előtt válasszon ügyfelet a szerkesztésben."
          )}
        </div>
      )}

      <div ref={bodyRef}>
        {isExternal ? (
          <ExternalOfferForm
            lang={lang}
            draft={draft}
            totals={totals}
            patch={patchDraft}
            provider={provider}
            providers={enabledProviders}
            onProviderChange={setProvider}
            sandbox={sandboxOn}
            clientPicker={clientPicker("app")}
            addItem={addItem}
            updateItem={updateItem}
            removeItem={removeItem}
            vatRates={availableVatRates}
            currencySymbol={currencySymbol}
            money={money}
            productPicker={productPicker("app")}
            sectionAlert={sectionAlert}
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-slate-100 p-3 ws-sm:p-4">
            {view === "edit" ? documentFor(editorOffer, true) : documentFor(previewOffer, false)}
          </div>
        )}
      </div>

      {newClientOpen && (
        <NewClientModal
          lang={lang}
          systemLanguage={systemLanguage}
          canEdit={canEdit}
          currentUser={currentUser}
          companyBillingSettings={companyBillingSettings}
          setLeads={setLeads}
          onClose={() => setNewClientOpen(false)}
          onCreated={applyLeadToDraft}
        />
      )}
    </div>
  );
};
