import React from "react";
import type { InvoiceOffer, CompanyBillingSettings } from "../../types";
import { Award, ShieldCheck, CheckCircle2, Clock, Calendar, Sparkles } from "lucide-react";

interface DefaultOfferTemplateProps {
  offer: InvoiceOffer;
  companySettings?: CompanyBillingSettings | null;
  systemCurrency?: string;
}

export const DefaultOfferTemplate: React.FC<DefaultOfferTemplateProps> = ({
  offer,
  companySettings,
  systemCurrency = "EUR"
}) => {
  const companyName = companySettings?.companyName || "SIGNUM Slovakia s.r.o.";
  const companySubtitle = companySettings?.companySubtitle || "HYDROIZOLÁCIE A PLOCHÉ STRECHY";
  const logoUrl = companySettings?.companyLogoUrl;
  const phone = companySettings?.phone || "+421 911 742 473";
  const phoneSecondary = companySettings?.phoneSecondary || "+421 905 778 710";
  const email = companySettings?.email || "teleky@signumslovakia.sk";
  const website = companySettings?.website || "www.signumslovakia.sk";
  const street = companySettings?.street || "Gradus Residence, ul. Biskupa Kondého 179/4A";
  const city = companySettings?.city || "Dunajská Streda";
  const postalCode = companySettings?.postalCode || "929 01";
  const companyId = companySettings?.companyId || "44 282 516";
  const taxId = companySettings?.taxId || "2022 653 226";
  const vatId = companySettings?.vatId || "SK 2022 653 226";
  const socialProof = companySettings?.defaultSocialProof || "Amazon · Heineken · FedEx · JYSK · Alza · Prologis · Goodman Group · Schindler · FC DAC 1904 Dunajská Streda";

  // Formatted price range or single total
  const formattedPrice = React.useMemo(() => {
    if (offer.priceRangeMin && offer.priceRangeMax) {
      return `${Math.round(offer.priceRangeMin).toLocaleString("sk-SK")} – ${Math.round(offer.priceRangeMax).toLocaleString("sk-SK")} ${offer.currency || systemCurrency}`;
    }
    return `${offer.totalPrice.toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${offer.currency || systemCurrency}`;
  }, [offer.priceRangeMin, offer.priceRangeMax, offer.totalPrice, offer.currency, systemCurrency]);

  const defaultUsp = [
    { title: "18 rokov skúseností", subtitle: "Viac ako 1 000 000 m² zrealizovaných striech – zvládneme aj náročné detaily, kde iní improvizujú." },
    { title: "Certifikované materiály", subtitle: "Výhradne certifikované systémy a presné dodržiavanie postupov výrobcu (Sika, Rheinzink, Rockwool a i.)." },
    { title: "Žiadne zálohy vopred", subtitle: "Platíte až po úspešnom dokončení práce – riziko preberáme my, nie vy." },
    { title: "10-ročná záruka", subtitle: "Istota, ktorú menšie alebo začínajúce firmy jednoducho nemôžu ponúknuť." }
  ];

  const uspCards = (offer.uspCards && offer.uspCards.length > 0) ? offer.uspCards : (companySettings?.defaultUspCards || defaultUsp);

  return (
    <div className="bg-white text-slate-900 font-sans p-8 md:p-12 max-w-[920px] mx-auto shadow-2xl rounded-2xl border border-slate-200 print:shadow-none print:border-none print:p-0 print:max-w-none text-[13px] leading-relaxed select-text">
      
      {/* 1. Header with Brand & Contact */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-slate-100 gap-4">
        <div className="flex items-center gap-3.5">
          {logoUrl ? (
            <img src={logoUrl} alt={companyName} className="h-12 w-auto max-w-[180px] object-contain" />
          ) : (
            <div className="bg-slate-950 text-white p-3 rounded-xl flex items-center justify-center font-black tracking-widest text-lg shadow-md">
              {companyName.slice(0, 3).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-950 uppercase">{companyName}</h1>
            <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">{companySubtitle}</p>
          </div>
        </div>

        <div className="text-right text-xs text-slate-600 space-y-0.5 self-end md:self-auto">
          <div className="font-semibold text-slate-800">{phone} {phoneSecondary ? `· ${phoneSecondary}` : ""}</div>
          <div><a href={`mailto:${email}`} className="text-slate-600 hover:text-slate-900">{email}</a></div>
          <div><a href={`https://${website}`} target="_blank" rel="noreferrer" className="text-slate-600 font-medium">{website}</a></div>
        </div>
      </div>

      {/* 2. Document Title, Subject & Metadata */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mt-8 pb-4 border-b-2 border-slate-900 gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">{offer.title || "Predbežná cenová ponuka"}</h2>
          <p className="text-sm font-semibold text-slate-600 mt-0.5">{offer.subject || "Cenová ponuka na mieru"}</p>
        </div>

        <div className="text-left sm:text-right text-xs space-y-1 bg-slate-50 p-3 sm:p-0 rounded-xl sm:bg-transparent w-full sm:w-auto">
          <div><span className="font-bold text-slate-700">Klient:</span> <span className="font-semibold text-slate-950">{offer.clientName}</span></div>
          <div><span className="font-bold text-slate-700">Dátum:</span> <span className="font-medium text-slate-800">{offer.issuedAt}</span></div>
          {offer.location && (
            <div><span className="font-bold text-slate-700">Lokalita:</span> <span className="font-medium text-slate-800">{offer.location}</span></div>
          )}
          {offer.documentNumber && (
            <div><span className="font-bold text-slate-700">Číslo dokladu:</span> <span className="font-medium text-slate-800">{offer.documentNumber}</span></div>
          )}
        </div>
      </div>

      {/* 3. Greeting & Trust Intro */}
      <div className="mt-6 space-y-2.5 text-slate-700">
        <p className="font-semibold text-slate-900">
          {offer.greetingNote || `Dobrý deň, ${offer.clientName},`}
        </p>
        <p>
          {offer.introNote || `ďakujeme, že ste sa na nás obrátili so žiadosťou o cenovú ponuku. Vážime si Váš záujem a veríme, že po prečítaní tejto ponuky pochopíte, prečo sa nám dôvera našich klientov oplatí budovať s maximálnou precíznosťou a garanciou kvality.`}
        </p>
      </div>

      {/* 4. Why Choose Us / 4 USP Cards Grid */}
      <div className="mt-8">
        <div className="flex items-center gap-2 pb-2 border-b border-orange-500/80">
          <h3 className="font-bold text-slate-950 text-sm">
            Prečo zveriť realizáciu profesionálom z {companyName}?
          </h3>
        </div>
        <p className="text-xs text-slate-600 mt-2.5">
          Kvalitná realizácia je jedna z najdôležitejších súčastí stavby – aj malá chyba v technologickom postupe sa prejaví formou zatekania a nákladných opráv. Práve preto sa oplatí vybrať si overeného partnera, ktorý za svojou prácou 100% stojí.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
          {uspCards.slice(0, 4).map((card, idx) => (
            <div key={idx} className="bg-slate-50/80 border border-slate-200/90 rounded-xl p-3.5 hover:border-slate-300 transition-all">
              <div className="font-bold text-slate-950 text-xs flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-orange-500 shrink-0"></span>
                {card.title}
              </div>
              <div className="text-[11.5px] text-slate-600 mt-1 leading-snug">
                {card.subtitle}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-slate-100/70 rounded-xl text-xs text-slate-700 font-medium text-center">
          {offer.reassuranceNote || "Garancia najvyššej kvality materiálov a certifikovaných technologických postupov, ktoré vám zabezpečia bezstarostné užívanie na desiatky rokov."}
        </div>
      </div>

      {/* 5. Scope of Delivery / Items Table */}
      <div className="mt-8">
        <h3 className="font-bold text-slate-950 text-sm uppercase tracking-wider pb-2 border-b border-slate-200 flex items-center justify-between">
          <span>Rozsah dodávky a montáže</span>
          <span className="text-[11px] font-medium text-slate-500 normal-case">Položkový rozpis</span>
        </h3>

        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white font-bold text-[11px] uppercase tracking-wider">
                <th className="p-2.5 rounded-l-lg">Položka</th>
                <th className="p-2.5">Špecifikácia / Popis</th>
                <th className="p-2.5 text-center">Množstvo</th>
                <th className="p-2.5 text-right">Jedn. cena</th>
                <th className="p-2.5 text-right rounded-r-lg">Spolu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {offer.items && offer.items.length > 0 ? (
                offer.items.map((item, idx) => (
                  <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}>
                    <td className="p-2.5 font-bold text-slate-900 align-top">
                      {item.name}
                      {item.sku && <span className="block text-[10px] text-slate-400 font-normal">SKU: {item.sku}</span>}
                    </td>
                    <td className="p-2.5 text-slate-600 align-top max-w-[260px]">
                      {item.description || "Štandardná dodávka podľa technologického listu"}
                    </td>
                    <td className="p-2.5 text-center font-medium text-slate-800 align-top whitespace-nowrap">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="p-2.5 text-right font-medium text-slate-700 align-top whitespace-nowrap">
                      {item.unitPrice.toLocaleString("sk-SK", { minimumFractionDigits: 2 })} €
                    </td>
                    <td className="p-2.5 text-right font-bold text-slate-950 align-top whitespace-nowrap">
                      {item.totalPrice.toLocaleString("sk-SK", { minimumFractionDigits: 2 })} €
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-slate-400 italic">
                    Kompletná dodávka a montáž podľa zamerania
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Prominent Total Price Banner */}
      <div className="mt-6 bg-slate-950 text-white rounded-xl p-4 flex flex-col sm:flex-row justify-between items-center gap-2 shadow-lg">
        <div className="font-bold text-sm tracking-wide text-slate-200 uppercase">
          Predbežná cena za komplexnú dodávku a montáž
        </div>
        <div className="text-2xl sm:text-3xl font-black text-orange-400 tracking-tight whitespace-nowrap">
          {formattedPrice}
        </div>
      </div>

      {/* 7. Key Execution Parameters (3 Highlight Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-center">
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
          <div className="text-base font-black text-slate-950">
            {offer.durationText || "2–3 dni"}
          </div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
            DĹŽKA REALIZÁCIE
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
          <div className="text-base font-black text-slate-950">
            {offer.startDateText || "Dohodou"}
          </div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
            PREDP. TERMÍN NÁSTUPU
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
          <div className="text-base font-black text-slate-950">
            {offer.warrantyText || "10 rokov"}
          </div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
            ZÁRUKA
          </div>
        </div>
      </div>

      {/* 8. Next Steps & Call to Action */}
      <div className="mt-6 p-4 bg-orange-50/60 border border-orange-200/80 rounded-xl text-slate-800 space-y-1 text-xs">
        <span className="font-black text-orange-950 uppercase tracking-wider text-[11px] block">Ďalší krok:</span>
        <p>
          {offer.nextStepsNote || "Aby sme vám vedeli pripraviť finálnu záväznú cenovú ponuku, radi by sme k vám poslali nášho technika na bezplatnú obhliadku a presné zameranie. Stačí nám napísať alebo zavolať a dohodneme si spolu vyhovujúci termín."}
        </p>
      </div>

      {/* 9. Sign-off */}
      <div className="mt-6 flex justify-between items-end text-xs text-slate-700">
        <div>
          <p>
            {offer.closingNote || "Tešíme sa, že sa stanete ďalším z našich mnohých spokojných klientov."}
          </p>
          <p className="font-semibold text-slate-900 mt-2">S úctou a pozdravom,</p>
          <p className="font-bold text-slate-950 text-sm">{offer.signOffTeam || `Tím ${companyName}`}</p>
        </div>

        <div className="text-right text-[11px] text-slate-400 font-mono">
          Vystavil: {offer.createdBy || "Systém CCRM"}
        </div>
      </div>

      {/* 10. Footer: Company Billing & Social Proof */}
      <div className="mt-8 pt-4 border-t border-slate-200 text-[11px] text-slate-500 space-y-1.5">
        <div className="flex flex-wrap justify-between gap-2 font-medium text-slate-600">
          <div>
            <strong className="text-slate-800">{companyName}</strong> · {street}, {postalCode} {city}
          </div>
          <div>
            IČO: <span className="text-slate-800 font-semibold">{companyId}</span> · DIČ: <span className="text-slate-800 font-semibold">{taxId}</span> · IČ DPH: <span className="text-slate-800 font-semibold">{vatId}</span>
          </div>
        </div>

        {socialProof && (
          <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100 flex flex-wrap gap-1">
            <span className="font-semibold text-slate-500">Realizovali sme pre:</span>
            <span>{socialProof}</span>
          </div>
        )}
      </div>

    </div>
  );
};
