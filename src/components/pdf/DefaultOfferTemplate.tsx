import React from "react";
import type { InvoiceOffer, CompanyBillingSettings, UspCardItem } from "../../types";
import type { Language } from "../../utils/translations";
import { formatMoney } from "../../utils/currency";

interface DefaultOfferTemplateProps {
  offer: InvoiceOffer;
  companySettings?: CompanyBillingSettings | null;
  systemCurrency?: string | null;
  language?: Language;
}

/** Never throws on a half-populated row coming back from sync. */
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Built-in price offer / invoice document.
 *
 * Every company-identity field comes from Settings → Invoicing. There are
 * deliberately NO baked-in company details: this CRM is deployed for several
 * different businesses, and hardcoded fallbacks meant an unconfigured tenant
 * issued documents carrying another company's name, IČO/DIČ and references.
 * Unset fields are simply omitted from the document instead.
 */
export const DefaultOfferTemplate: React.FC<DefaultOfferTemplateProps> = ({
  offer,
  companySettings,
  systemCurrency = "EUR",
  language = "sk"
}) => {
  const t = (en: string, sk: string, hu: string) =>
    language === "sk" ? sk : language === "hu" ? hu : en;

  const currency = offer.currency || systemCurrency || "EUR";
  const money = (value: unknown, decimals = 2) =>
    formatMoney(num(value), currency, language, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });

  const companyName = companySettings?.companyName?.trim() || "";
  const companySubtitle = companySettings?.companySubtitle?.trim() || "";
  const logoUrl = companySettings?.companyLogoUrl || "";
  const phone = companySettings?.phone?.trim() || "";
  const phoneSecondary = companySettings?.phoneSecondary?.trim() || "";
  const email = companySettings?.email?.trim() || "";
  const website = companySettings?.website?.trim() || "";
  const street = companySettings?.street?.trim() || "";
  const city = companySettings?.city?.trim() || "";
  const postalCode = companySettings?.postalCode?.trim() || "";
  const companyId = companySettings?.companyId?.trim() || "";
  const taxId = companySettings?.taxId?.trim() || "";
  const vatId = companySettings?.vatId?.trim() || "";
  const iban = companySettings?.iban?.trim() || "";
  const socialProof = companySettings?.defaultSocialProof?.trim() || "";

  const brandInitials = companyName
    ? companyName.replace(/[^\p{L}\p{N} ]/gu, "").slice(0, 3).toUpperCase()
    : "—";

  // A filled range replaces the exact total — used for preliminary offers where
  // the final figure depends on a site survey.
  const formattedPrice = React.useMemo(() => {
    const min = offer.priceRangeMin;
    const max = offer.priceRangeMax;
    if (typeof min === "number" && typeof max === "number" && Number.isFinite(min) && Number.isFinite(max)) {
      return `${money(min, 0)} – ${money(max, 0)}`;
    }
    return money(offer.totalPrice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.priceRangeMin, offer.priceRangeMax, offer.totalPrice, currency, language]);

  const uspCards: UspCardItem[] = (
    offer.uspCards?.length ? offer.uspCards : companySettings?.defaultUspCards || []
  ).filter(c => c?.title?.trim() || c?.subtitle?.trim());

  const addressLine = [street, [postalCode, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const registryLine = [
    companyId && `IČO: ${companyId}`,
    taxId && `DIČ: ${taxId}`,
    vatId && `IČ DPH: ${vatId}`,
    iban && `IBAN: ${iban}`
  ].filter(Boolean);

  const hasParameters = Boolean(offer.durationText || offer.startDateText || offer.warrantyText);

  return (
    <div className="print-document bg-white text-slate-900 font-sans p-8 md:p-12 max-w-[920px] mx-auto shadow-2xl rounded-2xl border border-slate-200 print:shadow-none print:border-none print:p-0 print:max-w-none print:rounded-none text-[13px] leading-relaxed select-text">
      {/* 1. Brand & contact */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-slate-100 gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          {logoUrl ? (
            <img src={logoUrl} alt={companyName || "Logo"} className="h-12 w-auto max-w-[180px] object-contain" />
          ) : (
            <div className="bg-slate-950 text-white p-3 rounded-xl flex items-center justify-center font-black tracking-widest text-lg shadow-md shrink-0">
              {brandInitials}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-black tracking-tight text-slate-950 uppercase truncate">
              {companyName || t("Company not configured", "Firma nie je nastavená", "A cég nincs beállítva")}
            </h1>
            {companySubtitle && (
              <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase truncate">{companySubtitle}</p>
            )}
          </div>
        </div>

        {(phone || email || website) && (
          <div className="text-left md:text-right text-xs text-slate-600 space-y-0.5 shrink-0">
            {(phone || phoneSecondary) && (
              <div className="font-semibold text-slate-800">
                {[phone, phoneSecondary].filter(Boolean).join(" · ")}
              </div>
            )}
            {email && (
              <div>
                <a href={`mailto:${email}`} className="text-slate-600 hover:text-slate-900">{email}</a>
              </div>
            )}
            {website && (
              <div>
                <a
                  href={website.startsWith("http") ? website : `https://${website}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-600 font-medium"
                >
                  {website}
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Title, subject & metadata */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mt-8 pb-4 border-b-2 border-slate-900 gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-black tracking-tight text-slate-950">
            {offer.title || t("Price offer", "Cenová ponuka", "Árajánlat")}
          </h2>
          {offer.subject && <p className="text-sm font-semibold text-slate-600 mt-0.5">{offer.subject}</p>}
        </div>

        <div className="text-left sm:text-right text-xs space-y-1 bg-slate-50 p-3 sm:p-0 rounded-xl sm:bg-transparent w-full sm:w-auto shrink-0">
          <div>
            <span className="font-bold text-slate-700">{t("Client", "Klient", "Ügyfél")}:</span>{" "}
            <span className="font-semibold text-slate-950">{offer.clientName}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">{t("Date", "Dátum", "Dátum")}:</span>{" "}
            <span className="font-medium text-slate-800">{offer.issuedAt}</span>
          </div>
          {offer.location && (
            <div>
              <span className="font-bold text-slate-700">{t("Site", "Lokalita", "Helyszín")}:</span>{" "}
              <span className="font-medium text-slate-800">{offer.location}</span>
            </div>
          )}
          {offer.documentNumber && (
            <div>
              <span className="font-bold text-slate-700">{t("Document no.", "Číslo dokladu", "Bizonylatszám")}:</span>{" "}
              <span className="font-medium text-slate-800">{offer.documentNumber}</span>
            </div>
          )}
          {offer.dueDate && offer.type !== "price_offer" && (
            <div>
              <span className="font-bold text-slate-700">{t("Due date", "Splatnosť", "Fizetési határidő")}:</span>{" "}
              <span className="font-medium text-slate-800">{offer.dueDate}</span>
            </div>
          )}
          {offer.validUntil && offer.type === "price_offer" && (
            <div>
              <span className="font-bold text-slate-700">{t("Valid until", "Platnosť do", "Érvényes")}:</span>{" "}
              <span className="font-medium text-slate-800">{offer.validUntil}</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. Client billing block */}
      {(offer.clientStreet || offer.clientCity || offer.clientIco || offer.clientIcdph) && (
        <div className="mt-5 text-xs text-slate-600">
          <span className="font-bold text-slate-700">{t("Billed to", "Odberateľ", "Vevő")}:</span>{" "}
          {[
            offer.clientStreet,
            [offer.clientPostalCode, offer.clientCity].filter(Boolean).join(" "),
            offer.clientCountry,
            offer.clientIco && `IČO: ${offer.clientIco}`,
            offer.clientDic && `DIČ: ${offer.clientDic}`,
            offer.clientIcdph && `IČ DPH: ${offer.clientIcdph}`
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}

      {/* 4. Greeting & intro */}
      {(offer.greetingNote || offer.introNote) && (
        <div className="mt-6 space-y-2.5 text-slate-700">
          {offer.greetingNote && <p className="font-semibold text-slate-900">{offer.greetingNote}</p>}
          {offer.introNote && <p className="whitespace-pre-line">{offer.introNote}</p>}
        </div>
      )}

      {/* 5. Value proposition cards */}
      {uspCards.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 pb-2 border-b border-orange-500/80">
            <h3 className="font-bold text-slate-950 text-sm">
              {companyName
                ? t(`Why choose ${companyName}?`, `Prečo zveriť realizáciu ${companyName}?`, `Miért a ${companyName}?`)
                : t("Why choose us?", "Prečo si vybrať nás?", "Miért minket válasszon?")}
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
            {uspCards.slice(0, 4).map((card, idx) => (
              <div key={idx} className="bg-slate-50/80 border border-slate-200/90 rounded-xl p-3.5">
                <div className="font-bold text-slate-950 text-xs flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-orange-500 shrink-0" />
                  {card.title}
                </div>
                {card.subtitle && (
                  <div className="text-[11.5px] text-slate-600 mt-1 leading-snug">{card.subtitle}</div>
                )}
              </div>
            ))}
          </div>

          {offer.reassuranceNote && (
            <div className="mt-4 p-3 bg-slate-100/70 rounded-xl text-xs text-slate-700 font-medium text-center">
              {offer.reassuranceNote}
            </div>
          )}
        </div>
      )}

      {/* 6. Items table */}
      <div className="mt-8">
        <h3 className="font-bold text-slate-950 text-sm uppercase tracking-wider pb-2 border-b border-slate-200 flex items-center justify-between gap-2">
          <span>{t("Scope of delivery & work", "Rozsah dodávky a montáže", "Szállítás és munka")}</span>
          <span className="text-[11px] font-medium text-slate-500 normal-case">
            {t("Itemised breakdown", "Položkový rozpis", "Tételes bontás")}
          </span>
        </h3>

        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white font-bold text-[11px] uppercase tracking-wider">
                <th className="p-2.5 rounded-l-lg">{t("Item", "Položka", "Tétel")}</th>
                <th className="p-2.5">{t("Specification", "Špecifikácia / Popis", "Leírás")}</th>
                <th className="p-2.5 text-center">{t("Qty", "Množstvo", "Mennyiség")}</th>
                <th className="p-2.5 text-right">{t("Unit price", "Jedn. cena", "Egységár")}</th>
                <th className="p-2.5 text-right rounded-r-lg">{t("Total", "Spolu", "Összesen")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {offer.items?.length ? (
                offer.items.map((item, idx) => (
                  <tr key={item.id || idx} className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}>
                    <td className="p-2.5 font-bold text-slate-900 align-top">
                      {item.name}
                      {item.sku && <span className="block text-[10px] text-slate-400 font-normal">SKU: {item.sku}</span>}
                    </td>
                    <td className="p-2.5 text-slate-600 align-top max-w-[260px]">{item.description || "—"}</td>
                    <td className="p-2.5 text-center font-medium text-slate-800 align-top whitespace-nowrap">
                      {num(item.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })} {item.unit}
                    </td>
                    <td className="p-2.5 text-right font-medium text-slate-700 align-top whitespace-nowrap">
                      {money(item.unitPrice)}
                      {num(item.discountPct) > 0 && (
                        <span className="block text-[10px] text-emerald-600 font-semibold">
                          −{num(item.discountPct)} %
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-right font-bold text-slate-950 align-top whitespace-nowrap">
                      {money(item.totalPrice)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-slate-400 italic">
                    {t("Complete delivery per survey", "Kompletná dodávka podľa zamerania", "Teljes szállítás felmérés szerint")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Net / VAT recap — a VAT-registered issuer must show the split */}
        <div className="flex justify-end mt-3">
          <div className="text-xs text-slate-600 space-y-0.5 text-right">
            <div>
              {t("Net total", "Základ dane", "Nettó összeg")}:{" "}
              <span className="font-semibold text-slate-900">{money(offer.subtotal)}</span>
            </div>
            <div>
              {t("VAT", "DPH", "ÁFA")}:{" "}
              <span className="font-semibold text-slate-900">{money(offer.vatAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 7. Total banner */}
      <div className="mt-4 bg-slate-950 text-white rounded-xl p-4 flex flex-col sm:flex-row justify-between items-center gap-2 shadow-lg print:shadow-none">
        <div className="font-bold text-sm tracking-wide text-slate-200 uppercase text-center sm:text-left">
          {offer.type === "price_offer"
            ? t("Estimated price for the complete delivery", "Predbežná cena za komplexnú dodávku a montáž", "Becsült ár a teljes szállításra")
            : t("Total amount due", "Celková suma na úhradu", "Fizetendő összeg")}
        </div>
        <div className="text-2xl sm:text-3xl font-black text-orange-400 tracking-tight whitespace-nowrap">
          {formattedPrice}
        </div>
      </div>

      {/* 8. Key parameters */}
      {hasParameters && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-center">
          {[
            [offer.durationText, t("DURATION", "DĹŽKA REALIZÁCIE", "IDŐTARTAM")],
            [offer.startDateText, t("START DATE", "TERMÍN NÁSTUPU", "KEZDÉS")],
            [offer.warrantyText, t("WARRANTY", "ZÁRUKA", "GARANCIA")]
          ]
            .filter(([value]) => Boolean(value))
            .map(([value, label]) => (
              <div key={String(label)} className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <div className="text-base font-black text-slate-950">{value}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{label}</div>
              </div>
            ))}
        </div>
      )}

      {/* 9. Next steps */}
      {offer.nextStepsNote && (
        <div className="mt-6 p-4 bg-orange-50/60 border border-orange-200/80 rounded-xl text-slate-800 space-y-1 text-xs">
          <span className="font-black text-orange-950 uppercase tracking-wider text-[11px] block">
            {t("Next step", "Ďalší krok", "Következő lépés")}:
          </span>
          <p className="whitespace-pre-line">{offer.nextStepsNote}</p>
        </div>
      )}

      {/* 10. Sign-off */}
      <div className="mt-6 flex flex-wrap justify-between items-end gap-3 text-xs text-slate-700">
        <div>
          {offer.closingNote && <p>{offer.closingNote}</p>}
          <p className="font-semibold text-slate-900 mt-2">
            {t("Kind regards,", "S úctou a pozdravom,", "Tisztelettel,")}
          </p>
          {(offer.signOffTeam || companyName) && (
            <p className="font-bold text-slate-950 text-sm">{offer.signOffTeam || companyName}</p>
          )}
        </div>

        {offer.createdBy && (
          <div className="text-right text-[11px] text-slate-400 font-mono">
            {t("Issued by", "Vystavil", "Kiállította")}: {offer.createdBy}
          </div>
        )}
      </div>

      {/* 11. Footer: billing identity & references */}
      {(companyName || registryLine.length > 0 || socialProof) && (
        <div className="mt-8 pt-4 border-t border-slate-200 text-[11px] text-slate-500 space-y-1.5">
          <div className="flex flex-wrap justify-between gap-2 font-medium text-slate-600">
            {(companyName || addressLine) && (
              <div>
                {companyName && <strong className="text-slate-800">{companyName}</strong>}
                {companyName && addressLine ? " · " : ""}
                {addressLine}
              </div>
            )}
            {registryLine.length > 0 && <div className="text-slate-800 font-semibold">{registryLine.join(" · ")}</div>}
          </div>

          {socialProof && (
            <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100 flex flex-wrap gap-1">
              <span className="font-semibold text-slate-500">
                {t("Selected references:", "Realizovali sme pre:", "Referenciáink:")}
              </span>
              <span>{socialProof}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
