import React, { useEffect, useState } from "react";
import { ArrowLeft, Lock, Plus, Save, Share2, Sparkles, Trash2 } from "lucide-react";
import type { AiCustomTemplate, CompanyBillingSettings, ExternalInvoicingConfig } from "../types";
import type { Language } from "../utils/translations";
import { cn } from "../utils/cn";
import { HoldToConfirmButton } from "./ui/HoldToConfirm";
import { deleteRecordsWithUndo } from "../utils/recordActions";
import { pickOfferDefaults, withOfferDefaults } from "../utils/offerDefaults";
import type { OfferDefaults } from "../utils/offerDefaults";

interface OfferSettingsProps {
  companyBillingSettings: CompanyBillingSettings | null | undefined;
  setCompanyBillingSettings?: (updater: (prev: CompanyBillingSettings | null) => CompanyBillingSettings | null) => void;
  invoicingIntegrations: ExternalInvoicingConfig | null | undefined;
  setInvoicingIntegrations?: (next: ExternalInvoicingConfig | null) => void;
  aiCustomTemplates: AiCustomTemplate[];
  setAiCustomTemplates?: React.Dispatch<React.SetStateAction<AiCustomTemplate[]>>;
  lang: Language;
  /** False renders every field read-only; saving, uploading and deleting are hidden. */
  canEdit: boolean;
  onBack: () => void;
  /** Opens Settings → Invoicing, where the company identity lives. */
  onOpenCompanySettings?: () => void;
}

const emptyIntegrations = (loaded?: ExternalInvoicingConfig | null): ExternalInvoicingConfig => ({
  superfaktura: {
    enabled: loaded?.superfaktura?.enabled || false,
    email: loaded?.superfaktura?.email || "",
    apiKey: loaded?.superfaktura?.apiKey || "",
    companyId: loaded?.superfaktura?.companyId || "",
    sandbox: loaded?.superfaktura?.sandbox || false
  },
  idoklad: {
    enabled: loaded?.idoklad?.enabled || false,
    clientId: loaded?.idoklad?.clientId || "",
    clientSecret: loaded?.idoklad?.clientSecret || "",
    sandbox: loaded?.idoklad?.sandbox || false
  }
});

type TestStatus = { success: boolean; message: string } | null;

const inputClass = "w-full p-2.5 bg-white border border-slate-200 rounded-xl text-ui focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-500";
const labelClass = "type-overline text-slate-600 block mb-1";

/**
 * Settings of the Price offers module: the texts a new offer starts with, the
 * SuperFaktúra / iDoklad connectors offers can be issued through, and the AI
 * PDF templates. The company identity, bank account and VAT rates stay in
 * Settings → Invoicing because orders and invoices need them too.
 */
export const OfferSettings: React.FC<OfferSettingsProps> = ({
  companyBillingSettings,
  setCompanyBillingSettings,
  invoicingIntegrations,
  setInvoicingIntegrations,
  aiCustomTemplates,
  setAiCustomTemplates,
  lang,
  canEdit,
  onBack,
  onOpenCompanySettings
}) => {
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);
  const toast = (message: string, variant?: "error" | "warning") => {
    const fn = (window as any).showToast;
    if (typeof fn === "function") fn(message, variant);
  };

  const [defaults, setDefaults] = useState<OfferDefaults>(() => pickOfferDefaults(companyBillingSettings));
  const [integrations, setIntegrations] = useState<ExternalInvoicingConfig>(() => emptyIntegrations(invoicingIntegrations));

  // Adopt a change that arrived from sync or from the other settings screen.
  useEffect(() => { setDefaults(pickOfferDefaults(companyBillingSettings)); }, [companyBillingSettings]);
  useEffect(() => { setIntegrations(emptyIntegrations(invoicingIntegrations)); }, [invoicingIntegrations]);

  const [testingSf, setTestingSf] = useState(false);
  const [sfStatus, setSfStatus] = useState<TestStatus>(null);
  const [testingIdk, setTestingIdk] = useState(false);
  const [idkStatus, setIdkStatus] = useState<TestStatus>(null);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [pdfUploadStatus, setPdfUploadStatus] = useState<string | null>(null);

  const patchDefaults = (patch: Partial<OfferDefaults>) => setDefaults(prev => ({ ...prev, ...patch }));
  const patchSf = (patch: Partial<ExternalInvoicingConfig["superfaktura"]>) =>
    setIntegrations(prev => ({ ...prev, superfaktura: { ...prev.superfaktura, ...patch } }));
  const patchIdk = (patch: Partial<ExternalInvoicingConfig["idoklad"]>) =>
    setIntegrations(prev => ({ ...prev, idoklad: { ...prev.idoklad, ...patch } }));

  const handleSave = () => {
    if (!canEdit) return;
    setCompanyBillingSettings?.(prev => withOfferDefaults(prev, defaults));
    setInvoicingIntegrations?.(integrations);
    toast(t("Offer settings saved.", "Nastavenia cenových ponúk boli uložené.", "Az árajánlat-beállítások mentve."));
  };

  const testConnection = async (
    endpoint: string,
    body: Record<string, unknown>,
    setBusy: (v: boolean) => void,
    setStatus: (s: TestStatus) => void
  ) => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_connection", ...body })
      });
      setStatus(await res.json());
    } catch (err: any) {
      setStatus({ success: false, message: t("Network error: ", "Sieťová chyba: ", "Hálózati hiba: ") + err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleUploadAndGenerateAiTemplate = async (file: File) => {
    if (!canEdit) return;
    setIsUploadingPdf(true);
    setPdfUploadStatus(t("Uploading and analyzing PDF with AI...", "Nahrávam a analyzujem PDF pomocou AI...", "PDF feltöltése és elemzése AI-val..."));
    // A missing endpoint answers with the server's HTML 404 page, and a bare
    // res.json() turns that into "Unexpected token '<' ... is not valid JSON",
    // which tells the user nothing. Name the endpoint and the status instead.
    const readJson = async (res: Response, endpoint: string) => {
      const body = await res.text();
      try {
        return JSON.parse(body);
      } catch {
        throw new Error(`${endpoint} (HTTP ${res.status})`);
      }
    };
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("eventId", "custom-template-pdf");
      const uploadRes = await fetch("/upload.php", { method: "POST", body: formData });
      const uploadData = await readJson(uploadRes, "/upload.php");
      if (!uploadData.success) {
        // upload.php reports failures under `error`, not `message`.
        throw new Error(uploadData.error || uploadData.message || "Upload failed");
      }

      const genRes = await fetch("/api/generate_pdf_template.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfName: file.name,
          pdfUrl: uploadData.filePath,
          pdfText: uploadData.extractedText || ""
        })
      });
      const genData = await readJson(genRes, "/api/generate_pdf_template.php");
      if (genData.success && genData.template) {
        setAiCustomTemplates?.(prev => [genData.template, ...prev]);
        setPdfUploadStatus(null);
        toast(t("AI Custom Template successfully generated and saved!", "Vlastná AI šablóna bola úspešne vygenerovaná a uložená!", "Egyedi AI sablon sikeresen létrehozva!"));
      } else {
        throw new Error(genData.message || "Template generation failed");
      }
    } catch (err: any) {
      setPdfUploadStatus(null);
      toast(t("Could not generate the AI template: ", "Chyba pri generovaní AI šablóny: ", "Az AI sablon létrehozása sikertelen: ") + err.message, "error");
    } finally {
      setIsUploadingPdf(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {!canEdit && (
        <div className="flex items-center gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-ui text-amber-900">
          <Lock className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="font-semibold">{t("Read-only access", "Iba na čítanie", "Csak olvasható")}</span>
          <span className="text-amber-800/80">
            {t(
              "Changing these settings needs edit access to General configuration.",
              "Zmena týchto nastavení vyžaduje právo na úpravu Všeobecnej konfigurácie.",
              "A beállítások módosításához az Általános konfiguráció szerkesztési joga szükséges."
            )}
          </span>
        </div>
      )}

      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-8">
        {/* Header */}
        <div className="flex flex-col ws-sm:flex-row justify-between items-start ws-sm:items-center gap-3 border-b border-slate-200 pb-4">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 text-ui font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("Back to price offers", "Späť na cenové ponuky", "Vissza az árajánlatokhoz")}
            </button>
            <h3 className="text-body font-heading font-bold text-slate-900">
              {t("Price offer settings", "Nastavenia cenových ponúk", "Árajánlat-beállítások")}
            </h3>
            <p className="text-ui text-slate-500 font-medium mt-0.5">
              {t(
                "Default texts for new offers, accounting-service connectors and AI PDF templates.",
                "Predvolené texty nových ponúk, prepojenia na účtovné služby a AI šablóny PDF.",
                "Az új ajánlatok alapértelmezett szövegei, könyvelőszolgáltatás-kapcsolatok és AI PDF-sablonok."
              )}
            </p>
            {onOpenCompanySettings && (
              <button
                type="button"
                onClick={onOpenCompanySettings}
                className="text-caption font-semibold text-slate-500 hover:text-indigo-600 underline underline-offset-2 mt-1 cursor-pointer"
              >
                {t(
                  "Company identity, bank account and VAT rates are in Settings → Invoicing.",
                  "Firemné údaje, bankový účet a sadzby DPH sú v Nastaveniach → Fakturácia.",
                  "A cégadatok, bankszámla és ÁFA-kulcsok a Beállítások → Számlázás alatt vannak."
                )}
              </button>
            )}
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-ui font-bold shadow-md cursor-pointer transition-all active:scale-[0.98]"
            >
              <Save className="h-4 w-4" />
              {t("Save offer settings", "Uložiť nastavenia ponúk", "Beállítások mentése")}
            </button>
          )}
        </div>

        <fieldset disabled={!canEdit} className="space-y-8 min-w-0">
          {/* SECTION 1: Default offer texts */}
          <div className="space-y-4">
            <h4 className="text-ui font-bold text-slate-800">
              1. {t("Default offer texts", "Predvolené texty ponuky", "Alapértelmezett ajánlatszövegek")}
            </h4>
            <p className="text-ui text-slate-500 -mt-2">
              {t(
                "Every new offer starts with these. Leaving one blank simply omits that block from the printed offer.",
                "Každá nová ponuka začína s týmito textami. Prázdne pole znamená, že sa blok na ponuke nevytlačí.",
                "Minden új ajánlat ezekkel indul. Az üresen hagyott blokk nem jelenik meg a nyomtatott ajánlaton."
              )}
            </p>

            <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t("Social proof / reference clients", "Referenční klienti v pätičke ponuky", "Referenciák")}</label>
                <input
                  type="text"
                  value={defaults.defaultSocialProof}
                  onChange={e => patchDefaults({ defaultSocialProof: e.target.value })}
                  placeholder={t("e.g. Client A · Client B · Client C", "napr. Klient A · Klient B · Klient C", "pl. A ügyfél · B ügyfél · C ügyfél")}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t("Default warranty text", "Predvolená záruka", "Garancia szövege")}</label>
                <input
                  type="text"
                  value={defaults.defaultWarrantyText}
                  onChange={e => patchDefaults({ defaultWarrantyText: e.target.value })}
                  placeholder={t("e.g. 10 years", "napr. 10 rokov", "pl. 10 év")}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t("Default project duration", "Predvolená dĺžka realizácie", "Alapértelmezett időtartam")}</label>
                <input
                  type="text"
                  value={defaults.defaultDurationText}
                  onChange={e => patchDefaults({ defaultDurationText: e.target.value })}
                  placeholder={t("e.g. 2–3 days", "napr. 2–3 dni", "pl. 2–3 nap")}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t("Default start date text", "Predvolený termín nástupu", "Alapértelmezett kezdés")}</label>
                <input
                  type="text"
                  value={defaults.defaultStartDateText ?? ""}
                  onChange={e => patchDefaults({ defaultStartDateText: e.target.value })}
                  placeholder={t("e.g. by agreement", "napr. dohodou", "pl. megegyezés szerint")}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>{t("Default next step / call to action", "Predvolený text „Ďalší krok“", "Alapértelmezett következő lépés")}</label>
              <textarea
                rows={3}
                value={defaults.defaultNextSteps}
                onChange={e => patchDefaults({ defaultNextSteps: e.target.value })}
                placeholder={t(
                  "e.g. We would gladly send our technician for a free site survey…",
                  "napr. Radi k vám pošleme nášho technika na bezplatnú obhliadku…",
                  "pl. Szívesen kiküldjük technikusunkat egy ingyenes felmérésre…"
                )}
                className={cn(inputClass, "resize-y leading-relaxed")}
              />
            </div>

            <div>
              <label className={cn(labelClass, "mb-2")}>
                {t("Default value proposition cards (4)", "Predvolené USP karty (4)", "Alapértelmezett USP kártyák (4)")}
              </label>
              <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3">
                {defaults.defaultUspCards.map((card, idx) => {
                  const updateCard = (patch: { title?: string; subtitle?: string }) =>
                    patchDefaults({
                      defaultUspCards: defaults.defaultUspCards.map((c, i) => (i === idx ? { ...c, ...patch } : c))
                    });
                  return (
                    <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                      <input
                        type="text"
                        value={card.title}
                        onChange={e => updateCard({ title: e.target.value })}
                        placeholder={t(`Benefit ${idx + 1}`, `Výhoda ${idx + 1}`, `${idx + 1}. előny`)}
                        className="font-bold text-ui w-full bg-transparent border-b border-slate-200 focus:border-indigo-500 focus:outline-none transition-colors py-0.5"
                      />
                      <input
                        type="text"
                        value={card.subtitle}
                        onChange={e => updateCard({ subtitle: e.target.value })}
                        placeholder={t("Short description", "Krátky popis", "Rövid leírás")}
                        className="text-caption text-slate-500 w-full bg-transparent focus:outline-none py-0.5"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* SECTION 2: External accounting connectors */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h4 className="text-ui font-bold text-slate-800 flex items-center gap-2">
              <Share2 className="h-4 w-4 text-indigo-600" />
              2. {t("External accounting APIs (SuperFaktúra & iDoklad)", "Externé účtovníctvo (SuperFaktúra a iDoklad)", "Külső számlázó integrációk")}
            </h4>

            <div className="grid grid-cols-1 ws-md:grid-cols-2 gap-6">
              {/* SuperFaktura */}
              <div className="p-5 bg-slate-50/80 border border-slate-200/90 rounded-2xl space-y-3.5">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div className="font-bold text-ui text-slate-900 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                    SuperFaktúra API
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={integrations.superfaktura.enabled}
                      onChange={e => patchSf({ enabled: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    <span className="text-ui font-bold text-slate-700">{t("Active", "Aktívne", "Aktív")}</span>
                  </label>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className={labelClass}>{t("SuperFaktúra email", "E-mail SuperFaktúry", "SuperFaktúra e-mail")}</label>
                    <input
                      type="email"
                      value={integrations.superfaktura.email}
                      onChange={e => patchSf({ email: e.target.value })}
                      className={inputClass}
                      placeholder="vas@email.sk"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t("API key", "API kľúč", "API kulcs")}</label>
                    <input
                      type="password"
                      value={integrations.superfaktura.apiKey}
                      onChange={e => patchSf({ apiKey: e.target.value })}
                      className={cn(inputClass, "font-mono")}
                      placeholder="••••••••••••••••"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>Company ID ({t("optional", "voliteľné", "opcionális")})</label>
                      <input
                        type="text"
                        value={integrations.superfaktura.companyId}
                        onChange={e => patchSf({ companyId: e.target.value })}
                        className={cn(inputClass, "font-mono")}
                        placeholder="12345"
                      />
                    </div>
                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-1.5 cursor-pointer text-ui font-medium text-slate-600">
                        <input
                          type="checkbox"
                          checked={integrations.superfaktura.sandbox}
                          onChange={e => patchSf({ sandbox: e.target.checked })}
                          className="rounded text-indigo-600"
                        />
                        Sandbox test
                      </label>
                    </div>
                  </div>
                  <div className="pt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={testingSf || !integrations.superfaktura.apiKey}
                      onClick={() => testConnection(
                        "/api/superfaktura.php",
                        {
                          email: integrations.superfaktura.email,
                          apiKey: integrations.superfaktura.apiKey,
                          companyId: integrations.superfaktura.companyId,
                          sandbox: integrations.superfaktura.sandbox
                        },
                        setTestingSf,
                        setSfStatus
                      )}
                      className="px-3 py-1.5 bg-white border border-slate-300 hover:border-indigo-500 rounded-xl text-ui font-bold text-slate-700 shadow-sm cursor-pointer transition-all disabled:opacity-40"
                    >
                      {testingSf ? t("Testing...", "Testujem...", "Tesztelés...") : t("Test connection", "Otestovať pripojenie", "Kapcsolat tesztelése")}
                    </button>
                    {sfStatus && (
                      <span className={cn("text-ui font-bold", sfStatus.success ? "text-emerald-600" : "text-rose-600")}>
                        {sfStatus.message}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* iDoklad */}
              <div className="p-5 bg-slate-50/80 border border-slate-200/90 rounded-2xl space-y-3.5">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div className="font-bold text-ui text-slate-900 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                    iDoklad API
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={integrations.idoklad.enabled}
                      onChange={e => patchIdk({ enabled: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    <span className="text-ui font-bold text-slate-700">{t("Active", "Aktívne", "Aktív")}</span>
                  </label>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className={labelClass}>{t("Client ID", "ID klienta", "Ügyfél-azonosító")}</label>
                    <input
                      type="text"
                      value={integrations.idoklad.clientId}
                      onChange={e => patchIdk({ clientId: e.target.value })}
                      className={cn(inputClass, "font-mono")}
                      placeholder="client-id-uuid"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t("Client secret", "Tajomstvo klienta", "Ügyfél titkos kulcs")}</label>
                    <input
                      type="password"
                      value={integrations.idoklad.clientSecret}
                      onChange={e => patchIdk({ clientSecret: e.target.value })}
                      className={cn(inputClass, "font-mono")}
                      placeholder="••••••••••••••••"
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="flex items-center gap-1.5 cursor-pointer text-ui font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={integrations.idoklad.sandbox}
                        onChange={e => patchIdk({ sandbox: e.target.checked })}
                        className="rounded text-indigo-600"
                      />
                      Sandbox test
                    </label>
                  </div>
                  <div className="pt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={testingIdk || !integrations.idoklad.clientSecret}
                      onClick={() => testConnection(
                        "/api/idoklad.php",
                        {
                          clientId: integrations.idoklad.clientId,
                          clientSecret: integrations.idoklad.clientSecret,
                          sandbox: integrations.idoklad.sandbox
                        },
                        setTestingIdk,
                        setIdkStatus
                      )}
                      className="px-3 py-1.5 bg-white border border-slate-300 hover:border-indigo-500 rounded-xl text-ui font-bold text-slate-700 shadow-sm cursor-pointer transition-all disabled:opacity-40"
                    >
                      {testingIdk ? t("Testing...", "Testujem...", "Tesztelés...") : t("Test connection", "Otestovať pripojenie", "Kapcsolat tesztelése")}
                    </button>
                    {idkStatus && (
                      <span className={cn("text-ui font-bold", idkStatus.success ? "text-emerald-600" : "text-rose-600")}>
                        {idkStatus.message}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: AI custom PDF templates */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex flex-col ws-sm:flex-row justify-between items-start ws-sm:items-center gap-2">
              <div>
                <h4 className="text-ui font-bold text-slate-800 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  3. {t("AI custom PDF template generator", "AI Generátor vlastných PDF šablón", "AI egyedi PDF sablon generátor")}
                </h4>
                <p className="text-ui text-slate-500 mt-0.5">
                  {t(
                    "Upload any sample offer PDF. AI will extract colors and styles and generate a customized template with all mandatory fields guaranteed.",
                    "Nahrajte ukážkové PDF cenovej ponuky. AI analyzuje dizajn a vytvorí šablónu s garanciou všetkých povinných údajov.",
                    "Töltsön fel egy mintát, és az AI generál egy kompatibilis sablont."
                  )}
                </p>
              </div>

              {canEdit && (
                <label className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-ui font-bold shadow-md cursor-pointer transition-all flex items-center gap-2 shrink-0">
                  <Plus className="h-4 w-4" />
                  {isUploadingPdf
                    ? t("Processing with AI...", "Analyzujem pomocou AI...", "Feldolgozás...")
                    : t("Upload PDF & generate template", "Nahrať PDF a vygenerovať šablónu", "PDF feltöltése és generálás")}
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    disabled={isUploadingPdf}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) handleUploadAndGenerateAiTemplate(file);
                    }}
                  />
                </label>
              )}
            </div>

            {pdfUploadStatus && (
              <div className="p-3 bg-purple-50 border border-purple-200 text-purple-800 rounded-xl text-ui font-semibold flex items-center gap-2 animate-pulse">
                <Sparkles className="h-4 w-4 text-purple-600" />
                {pdfUploadStatus}
              </div>
            )}

            {aiCustomTemplates.length === 0 ? (
              <p className="text-ui text-slate-400 italic">
                {t("No AI template yet.", "Zatiaľ žiadna AI šablóna.", "Még nincs AI sablon.")}
              </p>
            ) : (
              <div className="grid grid-cols-1 ws-sm:grid-cols-2 ws-md:grid-cols-3 gap-4 pt-2">
                {aiCustomTemplates.map(template => (
                  <div key={template.id} className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-ui text-slate-900 truncate">{template.name}</div>
                        <div className="text-caption text-slate-500">{template.description || t("AI-generated template", "AI vygenerovaná šablóna", "AI által generált sablon")}</div>
                      </div>
                      {canEdit && setAiCustomTemplates && (
                        <HoldToConfirmButton
                          tone="danger"
                          lang={lang}
                          what={template.name}
                          onConfirm={() =>
                            deleteRecordsWithUndo({
                              collection: "aiCustomTemplates",
                              allRecords: aiCustomTemplates,
                              targets: [template],
                              setRecords: setAiCustomTemplates,
                              lang,
                              entity: "template",
                              titleOf: x => x.name,
                            })
                          }
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-md"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </HoldToConfirmButton>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-200/70">
                      <span className="type-overline text-slate-400">{t("Palette:", "Paleta:", "Paletta:")}</span>
                      <div className="flex items-center gap-1">
                        {[template.colors.primary, template.colors.accent, template.colors.secondary].map((color, i) => (
                          <span key={i} className="h-3 w-3 rounded-full border border-slate-300" style={{ backgroundColor: color }}></span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </fieldset>
      </div>
    </div>
  );
};
