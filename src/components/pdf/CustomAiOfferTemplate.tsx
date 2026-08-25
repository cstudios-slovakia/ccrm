import React from "react";
import type { InvoiceOffer, CompanyBillingSettings, AiCustomTemplate } from "../../types";

interface CustomAiOfferTemplateProps {
  offer: InvoiceOffer;
  companySettings?: CompanyBillingSettings | null;
  customTemplate?: AiCustomTemplate | null;
  systemCurrency?: string;
}

export const CustomAiOfferTemplate: React.FC<CustomAiOfferTemplateProps> = ({
  offer,
  companySettings,
  customTemplate,
  systemCurrency = "EUR"
}) => {
  const companyName = companySettings?.companyName || "SIGNUM Slovakia s.r.o.";
  const companySubtitle = companySettings?.companySubtitle || "HYDROIZOLÁCIE A PLOCHÉ STRECHY";
  const logoUrl = companySettings?.companyLogoUrl;
  const phone = companySettings?.phone || "+421 911 742 473";
  const email = companySettings?.email || "teleky@signumslovakia.sk";
  const website = companySettings?.website || "www.signumslovakia.sk";
  const street = companySettings?.street || "Gradus Residence, ul. Biskupa Kondého 179/4A";
  const city = companySettings?.city || "Dunajská Streda";
  const postalCode = companySettings?.postalCode || "929 01";
  const companyId = companySettings?.companyId || "44 282 516";
  const taxId = companySettings?.taxId || "2022 653 226";
  const vatId = companySettings?.vatId || "SK 2022 653 226";
  const socialProof = companySettings?.defaultSocialProof || "Amazon · Heineken · FedEx · JYSK · Alza · Prologis";

  // Template styling tokens
  const primaryColor = customTemplate?.colors?.primary || "#1e1b4b"; // Indigo/Navy default
  const secondaryColor = customTemplate?.colors?.secondary || "#4338ca";
  const accentColor = customTemplate?.colors?.accent || "#6366f1";
  const bannerText = customTemplate?.customBannerText || "Cena za komplexnú dodávku a realizáciu";
  const badgeStyle = customTemplate?.badgeStyle || "rounded";

  const formattedPrice = React.useMemo(() => {
    if (offer.priceRangeMin && offer.priceRangeMax) {
      return `${Math.round(offer.priceRangeMin).toLocaleString("sk-SK")} – ${Math.round(offer.priceRangeMax).toLocaleString("sk-SK")} ${offer.currency || systemCurrency}`;
    }
    return `${offer.totalPrice.toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${offer.currency || systemCurrency}`;
  }, [offer.priceRangeMin, offer.priceRangeMax, offer.totalPrice, offer.currency, systemCurrency]);

  const defaultUsp = [
    { title: "Dlhoročné skúsenosti", subtitle: "Stovky úspešných realizácií a overené technologické postupy." },
    { title: "Certifikované materiály", subtitle: "Výhradne overené a testované materiály s garanciou výrobcu." },
    { title: "Férové platobné podmienky", subtitle: "Platba viazaná na odovzdanie a vašu spokojnosť." },
    { title: "Rozšírená záruka", subtitle: "Záručný a pozáručný servis priamo od realizátora." }
  ];

  const uspCards = (offer.uspCards && offer.uspCards.length > 0) ? offer.uspCards : (companySettings?.defaultUspCards || defaultUsp);

  const getBadgeRadius = () => {
    if (badgeStyle === "pill") return "rounded-full";
    if (badgeStyle === "square") return "rounded-sm";
    return "rounded-xl";
  };

  return (
    <div className="bg-white text-slate-900 font-sans p-8 md:p-12 max-w-[920px] mx-auto shadow-2xl rounded-3xl border border-slate-200 print:shadow-none print:border-none print:p-0 print:max-w-none text-[13px] leading-relaxed select-text">
      
      {/* Header with Custom Accent Bar */}
      <div className="h-2 w-full rounded-full mb-6" style={{ background: `linear-gradient(90deg, ${primaryColor}, ${accentColor})` }}></div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-slate-100 gap-4">
        <div className="flex items-center gap-3.5">
          {logoUrl ? (
            <img src={logoUrl} alt={companyName} className="h-12 w-auto max-w-[180px] object-contain" />
          ) : (
            <div 
              className="p-3 rounded-2xl flex items-center justify-center font-black tracking-widest text-lg text-white shadow-md"
              style={{ backgroundColor: primaryColor }}
            >
              {companyName.slice(0, 3).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-black tracking-tight uppercase" style={{ color: primaryColor }}>{companyName}</h1>
            <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">{companySubtitle}</p>
          </div>
        </div>

        <div className="text-right text-xs text-slate-600 space-y-0.5 self-end md:self-auto">
          <div className="font-semibold text-slate-800">{phone}</div>
          <div><a href={`mailto:${email}`} className="text-slate-600 hover:text-slate-900">{email}</a></div>
          <div><a href={`https://${website}`} target="_blank" rel="noreferrer" className="font-medium" style={{ color: secondaryColor }}>{website}</a></div>
        </div>
      </div>

      {/* Document Meta */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mt-8 pb-4 border-b-2 gap-4" style={{ borderColor: primaryColor }}>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 text-white rounded-full inline-block mb-1.5" style={{ backgroundColor: accentColor }}>
            {customTemplate?.name || "AI Custom Template"}
          </span>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">{offer.title || "Cenová ponuka"}</h2>
          <p className="text-sm font-semibold text-slate-600 mt-0.5">{offer.subject || "Cenová kalkulácia"}</p>
        </div>

        <div className="text-left sm:text-right text-xs space-y-1 bg-slate-50 p-3 sm:p-0 rounded-xl sm:bg-transparent w-full sm:w-auto">
          <div><span className="font-bold text-slate-700">Klient:</span> <span className="font-semibold text-slate-950">{offer.clientName}</span></div>
          <div><span className="font-bold text-slate-700">Dátum vystavenia:</span> <span className="font-medium text-slate-800">{offer.issuedAt}</span></div>
          {offer.location && (
            <div><span className="font-bold text-slate-700">Miesto realizácie:</span> <span className="font-medium text-slate-800">{offer.location}</span></div>
          )}
          {offer.documentNumber && (
            <div><span className="font-bold text-slate-700">Číslo dokladu:</span> <span className="font-medium text-slate-800">{offer.documentNumber}</span></div>
          )}
        </div>
      </div>

      {/* Greeting & Intro */}
      <div className="mt-6 space-y-2.5 text-slate-700">
        <p className="font-semibold text-slate-900">
          {offer.greetingNote || `Dobrý deň, ${offer.clientName},`}
        </p>
        <p>
          {offer.introNote || `ďakujeme za prejavenú dôveru. Pripravili sme pre Vás individuálnu cenovú ponuku zameranú na špičkovú kvalitu a transparentné podmienky.`}
        </p>
      </div>

      {/* USP Grid */}
      <div className="mt-8">
        <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: `${accentColor}40` }}>
          <h3 className="font-bold text-sm" style={{ color: primaryColor }}>
            Prečo si vybrať práve {companyName}?
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
          {uspCards.slice(0, 4).map((card, idx) => (
            <div key={idx} className={`bg-slate-50/90 border border-slate-200/90 p-4 ${getBadgeRadius()} hover:border-slate-300 transition-all`}>
              <div className="font-bold text-slate-950 text-xs flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: accentColor }}></span>
                {card.title}
              </div>
              <div className="text-[11.5px] text-slate-600 mt-1 leading-snug">
                {card.subtitle}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scope Table */}
      <div className="mt-8">
        <h3 className="font-bold text-sm uppercase tracking-wider pb-2 border-b border-slate-200 flex items-center justify-between" style={{ color: primaryColor }}>
          <span>Rozsah dodávky a položiek</span>
          <span className="text-[11px] font-medium text-slate-500 normal-case">Kalkulácia</span>
        </h3>

        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="text-white font-bold text-[11px] uppercase tracking-wider" style={{ backgroundColor: primaryColor }}>
                <th className="p-2.5 rounded-l-lg">Položka</th>
                <th className="p-2.5">Špecifikácia</th>
                <th className="p-2.5 text-center">Množstvo</th>
                <th className="p-2.5 text-right">Jedn. cena</th>
                <th className="p-2.5 text-right rounded-r-lg">Spolu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {offer.items && offer.items.length > 0 ? (
                offer.items.map((item, idx) => (
                  <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50/60" : "bg-white"}>
                    <td className="p-2.5 font-bold text-slate-900 align-top">
                      {item.name}
                      {item.sku && <span className="block text-[10px] text-slate-400 font-normal">SKU: {item.sku}</span>}
                    </td>
                    <td className="p-2.5 text-slate-600 align-top max-w-[260px]">
                      {item.description || "Štandardná dodávka"}
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
                    Kompletná dodávka
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Total Banner */}
      <div 
        className="mt-6 text-white rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-2 shadow-xl"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
      >
        <div className="font-bold text-sm tracking-wide text-slate-100 uppercase">
          {bannerText}
        </div>
        <div className="text-2xl sm:text-3xl font-black text-white tracking-tight whitespace-nowrap drop-shadow">
          {formattedPrice}
        </div>
      </div>

      {/* 3 Parameter Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-center">
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3">
          <div className="text-base font-black text-slate-950">
            {offer.durationText || "2–3 dni"}
          </div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
            DĹŽKA REALIZÁCIE
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3">
          <div className="text-base font-black text-slate-950">
            {offer.startDateText || "Dohodou"}
          </div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
            PREDP. TERMÍN NÁSTUPU
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3">
          <div className="text-base font-black text-slate-950">
            {offer.warrantyText || "10 rokov"}
          </div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
            ZÁRUKA
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <div className="mt-6 p-4 rounded-2xl border text-xs" style={{ backgroundColor: `${accentColor}10`, borderColor: `${accentColor}40` }}>
        <span className="font-black uppercase tracking-wider text-[11px] block" style={{ color: primaryColor }}>Ďalší krok:</span>
        <p className="text-slate-800 mt-1">
          {offer.nextStepsNote || "Radi k vám vyšleme nášho technika na bezplatnú obhliadku a presné zameranie. Stačí nám napísať alebo zavolať a dohodneme si termín."}
        </p>
      </div>

      {/* Sign-off */}
      <div className="mt-6 flex justify-between items-end text-xs text-slate-700">
        <div>
          <p>{offer.closingNote || "Tešíme sa na úspešnú spoluprácu."}</p>
          <p className="font-semibold text-slate-900 mt-2">S úctou a pozdravom,</p>
          <p className="font-bold text-slate-950 text-sm">{offer.signOffTeam || `Tím ${companyName}`}</p>
        </div>
        <div className="text-right text-[11px] text-slate-400 font-mono">
          Vystavil: {offer.createdBy || "Systém CCRM"}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-slate-200 text-[11px] text-slate-500 space-y-1.5">
        <div className="flex flex-wrap justify-between gap-2 font-medium text-slate-600">
          <div><strong className="text-slate-800">{companyName}</strong> · {street}, {postalCode} {city}</div>
          <div>IČO: <span className="text-slate-800 font-semibold">{companyId}</span> · DIČ: <span className="text-slate-800 font-semibold">{taxId}</span> · IČ DPH: <span className="text-slate-800 font-semibold">{vatId}</span></div>
        </div>
        {socialProof && (
          <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100 flex flex-wrap gap-1">
            <span className="font-semibold text-slate-500">Referencie:</span>
            <span>{socialProof}</span>
          </div>
        )}
      </div>

    </div>
  );
};
