import React from "react";
import type { InvoiceOffer, CompanyBillingSettings, AiCustomTemplate, UspCardItem } from "../../types";
import type { Language } from "../../utils/translations";
import { formatMoney } from "../../utils/currency";
import { formatDateLocalized } from "../../utils/localTime";
import { OFFER_SECTION_ALERT_CLASS, type OfferEditing, type OfferSectionAlert } from "./offerEditing";
import { OfferField, OfferInput } from "./OfferField";
import {
  EditableEmptyItemsRow, EditableItemRow, EditableItemsFooter, EditableParameterCards,
  EditableUspGrid, IdentityHint, PriceRangeEditor, hasNoUspText
} from "./OfferEditableParts";

interface CustomAiOfferTemplateProps {
  offer: InvoiceOffer;
  companySettings?: CompanyBillingSettings | null;
  customTemplate?: AiCustomTemplate | null;
  systemCurrency?: string | null;
  language?: Language;
  /** Turns the document into its own editor. Left out, it renders the finished document. */
  editing?: OfferEditing;
  /** The required block that just failed Issue — drawn on the document next to the toast. */
  sectionAlert?: OfferSectionAlert | null;
}

/** Never throws on a half-populated row coming back from sync. */
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * The template blueprint is produced by an LLM, so its colour fields are
 * untrusted strings. Anything that is not a plain hex colour is dropped rather
 * than interpolated into a style attribute — and hex is also what the
 * `${color}20` alpha-suffix trick below relies on being well-formed.
 */
const safeColor = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!HEX.test(trimmed)) return fallback;
  // Expand #abc to #aabbcc so appending an alpha pair always yields #rrggbbaa.
  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return trimmed;
};

/**
 * AI-derived document layout.
 *
 * Structure matches the built-in template (the generator guarantees the same
 * section set); only branding — colours, banner wording, badge shape — comes
 * from the uploaded sample. Like the default template it carries no baked-in
 * company identity: all of that is read from Settings → Invoicing.
 */
export const CustomAiOfferTemplate: React.FC<CustomAiOfferTemplateProps> = ({
  offer,
  companySettings,
  customTemplate,
  systemCurrency = "EUR",
  language = "sk",
  editing,
  sectionAlert = null
}) => {
  const t = (en: string, sk: string, hu: string) =>
    language === "sk" ? sk : language === "hu" ? hu : en;

  /** `onChange` for a text field: present only while editing, which is what flips `OfferField` into a control. */
  const edit = (key: keyof InvoiceOffer) =>
    editing ? (next: string) => editing.onChange({ [key]: next } as Partial<InvoiceOffer>) : undefined;

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

  // Styling tokens from the AI blueprint, validated before use.
  const primaryColor = safeColor(customTemplate?.colors?.primary, "#1e1b4b");
  const secondaryColor = safeColor(customTemplate?.colors?.secondary, "#4338ca");
  const accentColor = safeColor(customTemplate?.colors?.accent, "#6366f1");
  const bannerText =
    customTemplate?.customBannerText?.trim() ||
    t("Price for the complete delivery", "Cena za komplexnú dodávku a realizáciu", "A teljes szállítás ára");
  const badgeStyle = customTemplate?.badgeStyle || "rounded";
  const badgeRadius = badgeStyle === "pill" ? "rounded-full" : badgeStyle === "square" ? "rounded-sm" : "rounded-xl";

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
  const hasContact = Boolean(phone || email || website);
  const hasFooterIdentity = Boolean(companyName || registryLine.length > 0 || socialProof);
  const editableUspCards = editing ? offer.uspCards || [] : uspCards;

  return (
    <div
      {...(editing ? { "data-offer-editing": "" } : {})}
      className="view-size-fixed print-document force-light bg-white text-slate-900 font-sans p-8 md:p-12 max-w-[920px] mx-auto shadow-2xl rounded-3xl border border-slate-200 print:shadow-none print:border-none print:max-w-none print:rounded-none text-[13px] leading-relaxed select-text"
    >
      {/* Accent bar */}
      <div
        className="h-2 w-full rounded-full mb-6"
        style={{ background: `linear-gradient(90deg, ${primaryColor}, ${accentColor})` }}
      />

      {/* Brand & contact */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-slate-100 gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          {logoUrl ? (
            <img src={logoUrl} alt={companyName || "Logo"} className="h-12 w-auto max-w-[180px] object-contain" />
          ) : (
            <div
              className="p-3 rounded-2xl flex items-center justify-center font-black tracking-widest text-lg text-white shadow-md shrink-0"
              style={{ backgroundColor: primaryColor }}
            >
              {brandInitials}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-black tracking-tight uppercase truncate" style={{ color: primaryColor }}>
              {companyName || t("Company not configured", "Firma nie je nastavená", "A cég nincs beállítva")}
            </h1>
            {companySubtitle && (
              <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase truncate">{companySubtitle}</p>
            )}
            <IdentityHint editing={editing} empty={!companyName} />
          </div>
        </div>

        {editing && !hasContact && <IdentityHint editing={editing} empty className="shrink-0" />}
        {(phone || email || website) && (
          <div className="text-left md:text-right text-xs text-slate-600 space-y-0.5 shrink-0">
            {phone && <div className="font-semibold text-slate-800">{phone}</div>}
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
                  className="font-medium"
                  style={{ color: secondaryColor }}
                >
                  {website}
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Document meta */}
      <div
        className="flex flex-col sm:flex-row justify-between items-start sm:items-end mt-8 pb-4 border-b-2 gap-4"
        style={{ borderColor: primaryColor }}
      >
        <div className="min-w-0">
          {customTemplate?.name && (
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 text-white rounded-full inline-block mb-1.5"
              style={{ backgroundColor: accentColor }}
            >
              {customTemplate.name}
            </span>
          )}
          <OfferField
            as="h2"
            name="title"
            value={editing ? offer.title : offer.title || t("Price offer", "Cenová ponuka", "Árajánlat")}
            placeholder={t("Price offer", "Cenová ponuka", "Árajánlat")}
            onChange={edit("title")}
            className="text-2xl font-black tracking-tight text-slate-950"
          />
          <OfferField
            name="subject"
            value={offer.subject}
            placeholder={t("Subject of the offer, e.g. Flat roof renovation", "Predmet ponuky, napr. Rekonštrukcia plochej strechy", "Az ajánlat tárgya, pl. Lapostető felújítás")}
            onChange={edit("subject")}
            className="text-sm font-semibold text-slate-600 mt-0.5"
          />
        </div>

        <div className="text-left sm:text-right text-xs space-y-1 bg-slate-50 p-3 sm:p-0 rounded-xl sm:bg-transparent w-full sm:w-auto shrink-0">
          <div>
            <span className="font-bold text-slate-700">{t("Client", "Klient", "Ügyfél")}:</span>{" "}
            {editing ? (
              <span className="inline-block align-middle">{editing.renderClientPicker()}</span>
            ) : (
              <span
                {...(sectionAlert === "client" ? { "data-offer-client": "" } : {})}
                className={
                  sectionAlert === "client"
                    ? `font-semibold text-slate-950 ${OFFER_SECTION_ALERT_CLASS}`
                    : "font-semibold text-slate-950"
                }
              >
                {offer.clientName}
              </span>
            )}
          </div>
          <div>
            <span className="font-bold text-slate-700">{t("Issued", "Dátum vystavenia", "Kiállítva")}:</span>{" "}
            {editing ? (
              <OfferInput
                type="date"
                value={offer.issuedAt}
                aria-label={t("Issued on", "Dátum vystavenia", "Kiállítás dátuma")}
                onChange={e => editing.onChange({ issuedAt: e.target.value })}
                className="w-32 font-medium text-slate-800 text-right"
              />
            ) : (
              <span className="font-medium text-slate-800">{formatDateLocalized(offer.issuedAt, language)}</span>
            )}
          </div>
          {editing ? (
            <div>
              <span className="font-bold text-slate-700">{t("Site", "Miesto realizácie", "Helyszín")}:</span>{" "}
              <OfferField
                as="span"
                name="location"
                value={offer.location}
                placeholder={t("e.g. Bratislava", "napr. Bratislava", "pl. Bratislava")}
                onChange={edit("location")}
                className="font-medium text-slate-800"
                editClassName="inline-block w-32 align-top"
                inputClassName="text-right"
              />
            </div>
          ) : (
            offer.location && (
              <div>
                <span className="font-bold text-slate-700">{t("Site", "Miesto realizácie", "Helyszín")}:</span>{" "}
                <span className="font-medium text-slate-800">{offer.location}</span>
              </div>
            )
          )}
          {offer.documentNumber && (
            <div>
              <span className="font-bold text-slate-700">{t("Document no.", "Číslo dokladu", "Bizonylatszám")}:</span>{" "}
              <span className="font-medium text-slate-800">{offer.documentNumber}</span>
            </div>
          )}
        </div>
      </div>

      {/* Client billing block */}
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
      {editing?.renderClientExtras?.()}

      {/* Greeting & intro */}
      {(editing || offer.greetingNote || offer.introNote) && (
        <div className="mt-6 space-y-2.5 text-slate-700">
          <OfferField
            name="greeting"
            value={offer.greetingNote}
            placeholder={t("Greeting, e.g. Dear Mr. Novák,", "Oslovenie, napr. Dobrý deň, pán Novák,", "Megszólítás, pl. Tisztelt Kovács úr!")}
            onChange={edit("greetingNote")}
            className="font-semibold text-slate-900"
          />
          <OfferField
            name="intro"
            multiline
            preLine
            value={offer.introNote}
            placeholder={t("Opening paragraph — a few words that build trust", "Úvodný odsek — pár viet, ktoré budujú dôveru", "Bevezető bekezdés — néhány mondat, ami bizalmat épít")}
            onChange={edit("introNote")}
          />
        </div>
      )}

      {/* USP grid */}
      {(editing || uspCards.length > 0) && (
        <div className="mt-8">
          <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: `${accentColor}40` }}>
            <h3 className="font-bold text-sm" style={{ color: primaryColor }}>
              {companyName
                ? t(`Why choose ${companyName}?`, `Prečo si vybrať práve ${companyName}?`, `Miért a ${companyName}?`)
                : t("Why choose us?", "Prečo si vybrať práve nás?", "Miért minket válasszon?")}
            </h3>
          </div>

          {editing ? (
            <EditableUspGrid
              cards={editableUspCards}
              editing={editing}
              cardClassName={`bg-slate-50/90 border border-slate-200/90 p-4 ${badgeRadius}`}
              dotClassName="h-2.5 w-2.5 rounded-full shrink-0"
              dotStyle={{ backgroundColor: accentColor }}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
              {uspCards.slice(0, 4).map((card, idx) => (
                <div key={idx} className={`bg-slate-50/90 border border-slate-200/90 p-4 ${badgeRadius}`}>
                  <div className="font-bold text-slate-950 text-xs flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
                    {card.title}
                  </div>
                  {card.subtitle && (
                    <div className="text-[11.5px] text-slate-600 mt-1 leading-snug">{card.subtitle}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {editing ? (
            <div className="mt-4 p-3 bg-slate-100/70 rounded-xl text-xs text-slate-700 font-medium text-center">
              <OfferField
                as="div"
                name="reassurance"
                multiline
                value={offer.reassuranceNote}
                placeholder={t("Reassurance note, e.g. quality guaranteed in writing", "Text o garancii kvality, napr. kvalita písomne zaručená", "Minőségi garancia szövege")}
                onChange={edit("reassuranceNote")}
              />
              {hasNoUspText(editableUspCards) && (
                <p className="mt-1 text-[10px] italic font-normal text-slate-400">{editing.copy.uspNeedsCard}</p>
              )}
            </div>
          ) : (
            offer.reassuranceNote && (
              <div className="mt-4 p-3 bg-slate-100/70 rounded-xl text-xs text-slate-700 font-medium text-center">
                {offer.reassuranceNote}
              </div>
            )
          )}
        </div>
      )}

      {/* Items table */}
      <div className="mt-8">
        <h3
          className="font-bold text-sm uppercase tracking-wider pb-2 border-b border-slate-200 flex items-center justify-between gap-2"
          style={{ color: primaryColor }}
        >
          <span>{t("Scope of delivery", "Rozsah dodávky a položiek", "Szállítás terjedelme")}</span>
          <span className="text-[11px] font-medium text-slate-500 normal-case">
            {t("Breakdown", "Kalkulácia", "Kalkuláció")}
          </span>
        </h3>

        <div
          {...(sectionAlert === "items" ? { "data-offer-items": "" } : {})}
          className={sectionAlert === "items" ? `overflow-x-auto mt-2 ${OFFER_SECTION_ALERT_CLASS}` : "overflow-x-auto mt-2"}
        >
          <table className={`w-full text-left text-xs border-collapse${editing ? " min-w-[640px]" : ""}`}>
            <thead>
              <tr
                className="text-white font-bold text-[11px] uppercase tracking-wider"
                style={{ backgroundColor: primaryColor }}
              >
                <th className="p-2.5 rounded-l-lg">{t("Item", "Položka", "Tétel")}</th>
                <th className="p-2.5">{t("Specification", "Špecifikácia", "Leírás")}</th>
                <th className="p-2.5 text-center">{t("Qty", "Množstvo", "Mennyiség")}</th>
                <th className="p-2.5 text-right">{t("Unit price", "Jedn. cena", "Egységár")}</th>
                <th className="p-2.5 text-right rounded-r-lg">{t("Total", "Spolu", "Összesen")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {editing ? (
                offer.items?.length ? (
                  offer.items.map((item, idx) => (
                    <EditableItemRow
                      key={item.id || idx}
                      item={item}
                      editing={editing}
                      money={money}
                      rowClassName={idx % 2 === 1 ? "bg-slate-50/60" : "bg-white"}
                    />
                  ))
                ) : (
                  <EditableEmptyItemsRow editing={editing} />
                )
              ) : offer.items?.length ? (
                offer.items.map((item, idx) => (
                  <tr key={item.id || idx} className={idx % 2 === 1 ? "bg-slate-50/60" : "bg-white"}>
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
                    {t("Complete delivery", "Kompletná dodávka", "Teljes szállítás")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {editing && <EditableItemsFooter editing={editing} />}

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

      {/* Total banner */}
      <div
        className="mt-4 text-white rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-2 shadow-xl print:shadow-none"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
      >
        <div className="font-bold text-sm tracking-wide text-slate-100 uppercase text-center sm:text-left">
          {bannerText}
        </div>
        <div className="text-2xl sm:text-3xl font-black text-white tracking-tight whitespace-nowrap drop-shadow">
          {formattedPrice}
        </div>
      </div>
      {editing && <PriceRangeEditor offer={offer} editing={editing} />}

      {/* Parameter cards */}
      {editing ? (
        <EditableParameterCards
          offer={offer}
          editing={editing}
          labels={{
            duration: t("DURATION", "DĹŽKA REALIZÁCIE", "IDŐTARTAM"),
            startDate: t("START DATE", "TERMÍN NÁSTUPU", "KEZDÉS"),
            warranty: t("WARRANTY", "ZÁRUKA", "GARANCIA")
          }}
          cardClassName="bg-slate-50 border border-slate-200/80 rounded-2xl p-3"
        />
      ) : hasParameters && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-center">
          {[
            [offer.durationText, t("DURATION", "DĹŽKA REALIZÁCIE", "IDŐTARTAM")],
            [offer.startDateText, t("START DATE", "TERMÍN NÁSTUPU", "KEZDÉS")],
            [offer.warrantyText, t("WARRANTY", "ZÁRUKA", "GARANCIA")]
          ]
            .filter(([value]) => Boolean(value))
            .map(([value, label]) => (
              <div key={String(label)} className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3">
                <div className="text-base font-black text-slate-950">{value}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{label}</div>
              </div>
            ))}
        </div>
      )}

      {/* Next steps */}
      {(editing || offer.nextStepsNote) && (
        <div
          className="mt-6 p-4 rounded-2xl border text-xs"
          style={{ backgroundColor: `${accentColor}10`, borderColor: `${accentColor}40` }}
        >
          <span className="font-black uppercase tracking-wider text-[11px] block" style={{ color: primaryColor }}>
            {t("Next step", "Ďalší krok", "Következő lépés")}:
          </span>
          <OfferField
            name="nextSteps"
            multiline
            preLine
            value={offer.nextStepsNote}
            placeholder={t("Next step — what should the client do now?", "Ďalší krok — čo má klient urobiť teraz?", "Következő lépés — mit tegyen most az ügyfél?")}
            onChange={edit("nextStepsNote")}
            className="text-slate-800 mt-1"
          />
        </div>
      )}

      {/* Sign-off */}
      <div className="mt-6 flex flex-wrap justify-between items-end gap-3 text-xs text-slate-700">
        <div>
          <OfferField
            name="closing"
            multiline
            value={offer.closingNote}
            placeholder={t("Closing note", "Záverečný text", "Záró szöveg")}
            onChange={edit("closingNote")}
          />
          <p className="font-semibold text-slate-900 mt-2">
            {t("Kind regards,", "S úctou a pozdravom,", "Tisztelettel,")}
          </p>
          {editing ? (
            <OfferField
              name="signOff"
              value={offer.signOffTeam}
              placeholder={companyName || t("Your team", "Váš tím", "Az Ön csapata")}
              onChange={edit("signOffTeam")}
              className="font-bold text-slate-950 text-sm"
            />
          ) : (
            (offer.signOffTeam || companyName) && (
              <p className="font-bold text-slate-950 text-sm">{offer.signOffTeam || companyName}</p>
            )
          )}
        </div>
        {offer.createdBy && (
          <div className="text-right text-[11px] text-slate-400 font-mono">
            {t("Issued by", "Vystavil", "Kiállította")}: {offer.createdBy}
          </div>
        )}
      </div>

      {/* Footer */}
      {editing && !hasFooterIdentity && <IdentityHint editing={editing} empty className="mt-8 pt-4 border-t border-slate-200" />}
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
              <span className="font-semibold text-slate-500">{t("References:", "Referencie:", "Referenciák:")}</span>
              <span>{socialProof}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
