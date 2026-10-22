import React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ExternalInvoiceProvider, InvoiceOffer, InvoiceOfferItem } from "../../types";
import type { Language } from "../../utils/translations";
import { CustomSelect } from "../ui/CustomSelect";
import { inputClass, labelClass } from "./styles";

interface ExternalOfferFormProps {
  lang: Language;
  draft: InvoiceOffer;
  /** Totals of the lines as they will be sent. */
  totals: { subtotal: number; vatAmount: number; grandTotal: number };
  patch: (patch: Partial<InvoiceOffer>) => void;
  provider: ExternalInvoiceProvider;
  providers: ExternalInvoiceProvider[];
  onProviderChange: (next: ExternalInvoiceProvider) => void;
  sandbox: boolean;
  clientPicker: React.ReactNode;
  addItem: () => void;
  updateItem: (id: string, patch: Partial<InvoiceOfferItem>) => void;
  removeItem: (id: string) => void;
  vatRates: number[];
  currencySymbol: string;
  money: (value: unknown) => string;
  productPicker: React.ReactNode;
}

const compactInput =
  "w-full min-w-0 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-ui font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/40";

const parseNumber = (raw: string) => {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The accounting-service mode has no document to edit: SuperFaktúra / iDoklad
 * produce the PDF themselves. What the service needs is a handful of fields, so
 * they are a compact form in the same inline panel — provider, client, title,
 * issue date and the lines — and the payload sent to the service is unchanged.
 */
export const ExternalOfferForm: React.FC<ExternalOfferFormProps> = ({
  lang,
  draft,
  totals,
  patch,
  provider,
  providers,
  onProviderChange,
  sandbox,
  clientPicker,
  addItem,
  updateItem,
  removeItem,
  vatRates,
  currencySymbol,
  money,
  productPicker
}) => {
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 ws-sm:p-5 space-y-5" data-offer-external-form>
      <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>{t("Accounting service", "Účtovná služba", "Könyvelő szolgáltatás")}</label>
          <CustomSelect
            value={providers.includes(provider) ? provider : providers[0]}
            onChange={v => onProviderChange(v as ExternalInvoiceProvider)}
            options={providers.map(p => ({ value: p, label: p === "superfaktura" ? "SuperFaktúra" : "iDoklad" }))}
          />
          {sandbox && (
            <p className="text-caption text-amber-700 font-semibold mt-1.5">
              {t(
                "Sandbox mode is on for at least one service — documents are created in the test environment.",
                "Aspoň pre jednu službu je zapnutý sandbox — doklady vzniknú v testovacom prostredí.",
                "Legalább egy szolgáltatásnál sandbox mód aktív — a bizonylatok tesztkörnyezetben jönnek létre."
              )}
            </p>
          )}
        </div>
        <div>
          <label className={labelClass}>{t("Issued on", "Dátum vystavenia", "Kiállítás dátuma")}</label>
          <input
            type="date"
            value={draft.issuedAt}
            onChange={e => patch({ issuedAt: e.target.value })}
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

      <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>{t("Client / lead (required)", "Klient / lead (povinné)", "Ügyfél / lead (kötelező)")}</label>
          <span data-offer-client-picker className="inline-flex items-center gap-1.5 rounded-lg">
            {clientPicker}
          </span>
        </div>
        <div>
          <label className={labelClass}>{t("Offer title", "Názov ponuky", "Ajánlat címe")}</label>
          <input
            type="text"
            value={draft.title}
            onChange={e => patch({ title: e.target.value })}
            placeholder={t("Price offer", "Cenová ponuka", "Árajánlat")}
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <h4 className="type-card-title text-slate-900">
            {t("Scope of delivery & work", "Rozsah dodávky a prác", "Szállítás és munka terjedelme")}
          </h4>
          <button
            type="button"
            data-offer-add-item
            onClick={addItem}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-ui font-bold transition-all cursor-pointer active:scale-[0.98]"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("Custom item", "Vlastná položka", "Saját tétel")}
          </button>
        </div>
        {productPicker}

        {draft.items.length === 0 && (
          <div className="p-5 text-center border border-dashed border-slate-200 rounded-2xl">
            <p className="text-ui text-slate-500">
              {t(
                "No line items yet — pick one from the warehouse or add a custom item.",
                "Zatiaľ žiadne položky — vyberte tovar zo skladu alebo pridajte vlastnú položku.",
                "Még nincs tétel — válasszon a raktárból vagy adjon hozzá sajátot."
              )}
            </p>
          </div>
        )}

        {draft.items.map(item => {
          const rate = Number(item.vatRate) || 0;
          const rates = vatRates.includes(rate) ? vatRates : [rate, ...vatRates].sort((a, b) => b - a);
          return (
            <div key={item.id} className="p-3 bg-white rounded-2xl border border-slate-200 space-y-2 hover:border-slate-300 transition-all">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={item.name}
                  onChange={e => updateItem(item.id, { name: e.target.value })}
                  placeholder={t("Item name", "Názov položky", "Tétel neve")}
                  className="font-bold text-ui text-slate-900 bg-transparent flex-1 min-w-0 border-b border-transparent hover:border-slate-200 focus:border-indigo-500 focus:outline-none transition-colors py-1"
                />
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  title={t("Remove item", "Odstrániť položku", "Tétel eltávolítása")}
                  aria-label={t("Remove item", "Odstrániť položku", "Tétel eltávolítása")}
                  className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 cursor-pointer transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                type="text"
                value={item.description || ""}
                onChange={e => updateItem(item.id, { description: e.target.value })}
                placeholder={t("Detailed specification", "Podrobná špecifikácia", "Részletes leírás")}
                className="w-full text-ui text-slate-500 bg-transparent border-b border-slate-100 focus:border-indigo-400 focus:outline-none transition-colors py-1"
              />
              <div className="grid grid-cols-2 ws-sm:grid-cols-5 gap-2">
                <div>
                  <label className="type-overline text-slate-400">{t("Qty", "Množstvo", "Menny.")}</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.quantity}
                      onChange={e => updateItem(item.id, { quantity: parseNumber(e.target.value) })}
                      className={compactInput}
                    />
                    <input
                      type="text"
                      value={item.unit}
                      aria-label={t("Unit", "Jednotka", "Egység")}
                      onChange={e => updateItem(item.id, { unit: e.target.value })}
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
                    onChange={e => updateItem(item.id, { unitPrice: parseNumber(e.target.value) })}
                    className={compactInput}
                  />
                </div>
                <div>
                  <label className="type-overline text-slate-400">{t("Discount", "Zľava", "Kedvezmény")} %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={item.discountPct}
                    onChange={e => updateItem(item.id, { discountPct: Math.min(100, Math.max(0, parseNumber(e.target.value))) })}
                    className={compactInput}
                  />
                </div>
                <div>
                  <label className="type-overline text-slate-400">{t("VAT", "DPH", "ÁFA")} %</label>
                  <CustomSelect
                    size="sm"
                    value={String(rate)}
                    onChange={v => updateItem(item.id, { vatRate: parseNumber(v) })}
                    options={rates.map(r => ({ value: String(r), label: `${r} %` }))}
                  />
                </div>
                <div className="text-right self-end">
                  <label className="type-overline text-slate-400 block">{t("Line total", "Spolu", "Összesen")}</label>
                  <span className="font-bold text-ui text-slate-900 mt-1 block whitespace-nowrap">{money(item.totalPrice)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
        <div className="type-overline text-slate-500">{t("Total incl. VAT", "Celková cena s DPH", "Végösszeg ÁFÁ-val")}</div>
        <div className="type-metric text-slate-900 mt-0.5">{money(totals.grandTotal)}</div>
        <div className="text-caption text-slate-500 font-medium">
          {t("Net", "Základ", "Nettó")}: {money(totals.subtotal)} · {t("VAT", "DPH", "ÁFA")}: {money(totals.vatAmount)}
        </div>
      </div>
    </div>
  );
};
