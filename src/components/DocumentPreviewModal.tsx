import React from "react";
import { ExternalLink, FileText, Printer, X } from "lucide-react";
import type { AiCustomTemplate, CompanyBillingSettings, InvoiceOffer } from "../types";
import type { Language } from "../utils/translations";
import { DefaultOfferTemplate } from "./pdf/DefaultOfferTemplate";
import { CustomAiOfferTemplate } from "./pdf/CustomAiOfferTemplate";

interface DocumentPreviewModalProps {
  document: InvoiceOffer;
  companySettings?: CompanyBillingSettings | null;
  aiCustomTemplates?: AiCustomTemplate[];
  currency: string;
  lang: Language;
  onClose: () => void;
  /** Extra controls rendered before the Print button (e.g. a status picker). */
  actions?: React.ReactNode;
}

/**
 * Read-only preview of an issued price offer, invoice or proforma, with print.
 * `window.print()` is enough: the `print-document` class inside the templates is
 * what the global @media print rules keep visible.
 */
export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  document: doc,
  companySettings,
  aiCustomTemplates = [],
  currency,
  lang,
  onClose,
  actions,
}) => {
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);
  const template =
    doc.mode === "custom"
      ? aiCustomTemplates.find(tpl => tpl.id === doc.customTemplateId) || aiCustomTemplates[0] || null
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center gap-3 bg-slate-50/70">
          <div className="flex items-center gap-2 font-bold text-body text-slate-900 min-w-0">
            <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
            <span className="truncate">
              {doc.documentNumber} — {doc.title}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {doc.externalPdfUrl && (
              <a
                href={doc.externalPdfUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-ui font-bold hover:bg-blue-100 cursor-pointer transition-all"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("Official PDF", "Oficiálne PDF", "Hivatalos PDF")}
              </a>
            )}
            {actions}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg text-ui font-bold text-slate-800 cursor-pointer transition-all active:scale-[0.98]"
            >
              <Printer className="h-3.5 w-3.5" />
              {t("Print / PDF", "Tlač / PDF", "Nyomtatás")}
            </button>
            <button
              onClick={onClose}
              title={t("Close", "Zavrieť", "Bezárás")}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-all"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-slate-100">
          {doc.mode === "custom" ? (
            <CustomAiOfferTemplate
              offer={doc}
              companySettings={companySettings}
              customTemplate={template}
              systemCurrency={currency}
              language={lang}
            />
          ) : (
            <DefaultOfferTemplate
              offer={doc}
              companySettings={companySettings}
              systemCurrency={currency}
              language={lang}
            />
          )}
        </div>
      </div>
    </div>
  );
};
