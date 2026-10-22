import React, { useEffect, useState } from "react";
import type { CompanyBillingSettings, Lead } from "../../types";
import type { Language } from "../../utils/translations";
import { CompanyLookupSpinner, CompanySuggestions } from "../ui/CompanySuggestions";
import { useCompanyLookup } from "../../utils/useCompanyLookup";
import { applyCompanyDetailsToLead, registryCountryOf } from "../../utils/companyRegistry";
import type { CompanyLookupField, CompanySuggestion } from "../../utils/companyRegistry";
import { isBlankText } from "../../utils/offerDraft";

interface ClientRegistryCompletionProps {
  lang: Language;
  systemLanguage?: string | null;
  lead: Lead;
  canEdit: boolean;
  companyBillingSettings?: CompanyBillingSettings | null;
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
}

/**
 * A document is only as good as the client block printed on it. When the lead
 * was captured without its IČO, DIČ or full address, this pulls the missing
 * fields straight from the public registers (companies and sole traders alike)
 * and writes them back onto the client, so the CRM and the invoice agree.
 *
 * Sits under the "Billed to" line while editing; it is not part of the printed
 * document.
 */
export const ClientRegistryCompletion: React.FC<ClientRegistryCompletionProps> = ({
  lang,
  systemLanguage,
  lead,
  canEdit,
  companyBillingSettings,
  setLeads
}) => {
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);
  const registryCountry = lead.address?.country || companyBillingSettings?.country || "Slovakia";
  const lookup = useCompanyLookup<CompanyLookupField>({ country: registryCountry });
  const [query, setQuery] = useState("");

  // Seed the box with what the client already carries, so completing a half-filled
  // lead is a click on a suggestion rather than typing the name out again.
  useEffect(() => {
    setQuery(lead.companyId || lead.name || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  const handleSelect = async (item: CompanySuggestion) => {
    if (!canEdit) return;
    const details = await lookup.select(item, registryCountry);
    if (!details) {
      (window as any).showToast?.(
        t("Error loading company details.", "Chyba pri načítaní údajov z registra.", "Hiba a cégadatok betöltésekor."),
        "error"
      );
      return;
    }
    setLeads(prev => prev.map(l => (l.id === lead.id ? applyCompanyDetailsToLead(l, details) : l)));
    setQuery(details.companyId || details.name || "");
    (window as any).showToast?.(
      t("Client details loaded from the register.", "Údaje klienta boli načítané z registra.", "Az ügyfél adatai betöltve a cégjegyzékből.")
    );
  };

  const missingDetails = isBlankText(lead.companyId) && isBlankText(lead.address?.street);

  return (
    <div
      data-offer-client-extras
      className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-2.5 text-slate-600 space-y-1.5"
    >
      {missingDetails && (
        <p className="font-semibold text-amber-700">
          {t(
            "This client has no address or IČO yet — the “Billed to” line stays empty.",
            "Tento klient zatiaľ nemá adresu ani IČO — riadok „Odberateľ“ zostane prázdny.",
            "Ennek az ügyfélnek még nincs címe és adószáma — a „Vevő” sor üres marad."
          )}
        </p>
      )}
      {registryCountryOf(registryCountry) && (
        <div className="space-y-1">
          <label className="block font-bold text-slate-700">
            {t("Complete from the business register", "Doplniť údaje z obchodného registra", "Kiegészítés a cégjegyzékből")}
          </label>
          <div className="relative">
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  lookup.search("name", e.target.value, registryCountry);
                }}
                onFocus={() => lookup.search("name", query, registryCountry)}
                placeholder={t(
                  "Company name, IČO, DIČ or IČ DPH…",
                  "Názov firmy, IČO, DIČ alebo IČ DPH…",
                  "Cégnév, adószám vagy közösségi adószám…"
                )}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 pr-8 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
              />
              <CompanyLookupSpinner visible={lookup.isLoading || lookup.isResolving} />
            </div>
            <CompanySuggestions
              suggestions={lookup.suggestions}
              visible={lookup.activeField === "name"}
              onSelect={handleSelect}
              onDismiss={lookup.close}
              systemLanguage={systemLanguage}
            />
          </div>
          <p className="text-[0.85em] text-slate-400 font-medium">
            {t(
              "Picking a match updates this client in the CRM, not just this document.",
              "Vybraná zhoda sa uloží ku klientovi v CRM, nielen do tohto dokladu.",
              "A kiválasztott találat a CRM ügyféladatait is frissíti, nem csak ezt a bizonylatot."
            )}
          </p>
        </div>
      )}
    </div>
  );
};
