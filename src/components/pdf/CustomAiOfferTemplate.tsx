import React from "react";
import type { InvoiceOffer, CompanyBillingSettings, AiCustomTemplate, UspCardItem } from "../../types";
import type { Language } from "../../utils/translations";
import { formatMoney } from "../../utils/currency";
import { formatDateLocalized } from "../../utils/localTime";
import { cn } from "../../utils/cn";
import { FONT_STACKS, readableTextOn, resolveAiTemplate, type AiTemplateSection } from "../../utils/aiTemplateBlueprint";
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

/**
 * Body text takes the sample's text colour through `--tpl-text`. Without it (a
 * template that predates the variants) the fallback is the slate this element
 * always had, so the old look is untouched.
 */
const TEXT_STRONG = "text-[color:var(--tpl-text,#020617)]";
const TEXT_DEFAULT = "text-[color:var(--tpl-text,#0f172a)]";
const TEXT_SOFT = "text-[color:var(--tpl-text,#334155)]";

/**
 * AI-derived document layout.
 *
 * The block set is the built-in template's (the generator guarantees every
 * required block); the look comes from the uploaded sample — colours, page and
 * text colour, font, header / table head / card / price banner variants, section
 * headings and the order of the blocks. All of it is a bounded set of variants
 * validated by `resolveAiTemplate`; nothing the model wrote is ever markup. Like
 * the default template it carries no baked-in company identity: that is read
 * from Settings → Invoicing, and the template's own name is never printed.
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
  const tpl = resolveAiTemplate(customTemplate);
  const { primary: primaryColor, secondary: secondaryColor, accent: accentColor, dark: darkColor } = tpl.colors;
  const { layout } = tpl;
  const bannerText =
    tpl.bannerText ||
    t("Price for the complete delivery", "Cena za komplexnú dodávku a realizáciu", "A teljes szállítás ára");
  const badgeRadius = tpl.badgeStyle === "pill" ? "rounded-full" : tpl.badgeStyle === "square" ? "rounded-sm" : "rounded-xl";

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

  // ---------------------------------------------------------------- variants
  const headings = layout.headings;
  const isBand = layout.headerStyle !== "light";
  const bandFill = layout.headerStyle === "accent-band" ? accentColor : darkColor;
  const bandText = readableTextOn(bandFill);
  /** The band runs to the page edge only when it is the first block; otherwise it is a rounded panel. */
  const bandBleeds = tpl.sections[0] === "header";

  const uspCardClass =
    layout.uspCardStyle === "left-border"
      ? "bg-white border border-slate-200/90 border-l-4 p-4 rounded-md"
      : layout.uspCardStyle === "outlined"
        ? `bg-white border-2 p-4 ${badgeRadius}`
        : `bg-slate-50/90 border border-slate-200/90 p-4 ${badgeRadius}`;
  const uspCardStyle: React.CSSProperties | undefined =
    layout.uspCardStyle === "left-border"
      ? { borderLeftColor: accentColor }
      : layout.uspCardStyle === "outlined"
        ? { borderColor: accentColor }
        : undefined;

  const tableFill = layout.tableHeaderStyle === "filled-dark" ? darkColor : primaryColor;
  const tableFilled = layout.tableHeaderStyle !== "underline";
  const tableHeadStyle: React.CSSProperties = tableFilled
    ? { backgroundColor: tableFill, color: readableTextOn(tableFill) }
    : { color: primaryColor };
  const thBase = cn("p-2.5", !tableFilled && "border-b-2");
  const thStyle: React.CSSProperties | undefined = tableFilled ? undefined : { borderColor: primaryColor };

  const bannerFill = layout.totalBannerStyle === "solid-dark" ? darkColor : primaryColor;
  const bannerOutlined = layout.totalBannerStyle === "outlined";
  const bannerLight = !bannerOutlined && readableTextOn(bannerFill) === "#ffffff";
  const bannerStyle: React.CSSProperties = bannerOutlined
    ? { border: `2px solid ${primaryColor}`, color: primaryColor }
    : layout.totalBannerStyle === "solid-dark"
      ? { backgroundColor: darkColor, color: readableTextOn(darkColor) }
      : {
          background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
          ...(bannerLight ? {} : { color: readableTextOn(primaryColor) })
        };

  // ---------------------------------------------------------------- sections
  const contactBlock = hasContact && (
    <div
      className={cn("text-left md:text-right text-xs space-y-0.5 shrink-0", !isBand && "text-slate-600")}
      style={isBand ? { color: bandText } : undefined}
    >
      {phone && <div className={cn("font-semibold", !isBand && "text-slate-800")}>{phone}</div>}
      {email && (
        <div>
          <a href={`mailto:${email}`} className={isBand ? "hover:underline" : "text-slate-600 hover:text-slate-900"}>{email}</a>
        </div>
      )}
      {website && (
        <div>
          <a
            href={website.startsWith("http") ? website : `https://${website}`}
            target="_blank"
            rel="noreferrer"
            className={cn("font-medium", isBand && "hover:underline")}
            style={isBand ? undefined : { color: secondaryColor }}
          >
            {website}
          </a>
        </div>
      )}
    </div>
  );

  const brandBlock = (
    <div className="flex items-center gap-3.5 min-w-0">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={companyName || "Logo"}
          className={cn("h-12 w-auto max-w-[180px] object-contain", isBand && "bg-white rounded-lg p-1.5")}
        />
      ) : (
        <div
          className="p-3 rounded-2xl flex items-center justify-center font-black tracking-widest text-lg text-white shadow-md shrink-0"
          style={isBand ? { backgroundColor: accentColor, color: readableTextOn(accentColor) } : { backgroundColor: primaryColor }}
        >
          {brandInitials}
        </div>
      )}
      <div className="min-w-0">
        <h1
          className="text-xl font-black tracking-tight uppercase truncate"
          style={{ color: isBand ? bandText : primaryColor }}
        >
          {companyName || t("Company not configured", "Firma nie je nastavená", "A cég nincs beállítva")}
        </h1>
        {companySubtitle && (
          <p
            className={cn("text-[10px] font-bold tracking-widest uppercase truncate", !isBand && "text-slate-500")}
            style={isBand ? { color: bandText, opacity: 0.75 } : undefined}
          >
            {companySubtitle}
          </p>
        )}
        <IdentityHint editing={editing} empty={!companyName} />
      </div>
    </div>
  );

  const header = isBand ? (
    <div
      className={cn(
        "flex flex-col md:flex-row justify-between items-start md:items-center gap-4",
        bandBleeds
          ? "-mx-8 md:-mx-12 -mt-8 md:-mt-12 px-8 md:px-12 py-6 rounded-t-3xl print:rounded-none"
          : "px-6 py-5 rounded-2xl mt-6"
      )}
      style={{ backgroundColor: bandFill, color: bandText }}
    >
      {brandBlock}
      {editing && !hasContact && <IdentityHint editing={editing} empty className="shrink-0" />}
      {contactBlock}
    </div>
  ) : (
    <>
      {/* Accent bar */}
      <div
        className="h-2 w-full rounded-full mb-6"
        style={{ background: `linear-gradient(90deg, ${primaryColor}, ${accentColor})` }}
      />

      {/* Brand & contact */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-slate-100 gap-4">
        {brandBlock}
        {editing && !hasContact && <IdentityHint editing={editing} empty className="shrink-0" />}
        {contactBlock}
      </div>
    </>
  );

  const clientMetadata = (
    <>
      {/* Document meta */}
      <div
        className="flex flex-col sm:flex-row justify-between items-start sm:items-end mt-8 pb-4 border-b-2 gap-4"
        style={{ borderColor: primaryColor }}
      >
        <div className="min-w-0">
          <OfferField
            as="h2"
            name="title"
            value={editing ? offer.title : offer.title || t("Price offer", "Cenová ponuka", "Árajánlat")}
            placeholder={t("Price offer", "Cenová ponuka", "Árajánlat")}
            onChange={edit("title")}
            className={cn("text-2xl font-black tracking-tight", TEXT_STRONG)}
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
    </>
  );

  const greeting = (editing || offer.greetingNote || offer.introNote) && (
    <div className={cn("mt-6 space-y-2.5", TEXT_SOFT)}>
      <OfferField
        name="greeting"
        value={offer.greetingNote}
        placeholder={t("Greeting, e.g. Dear Mr. Novák,", "Oslovenie, napr. Dobrý deň, pán Novák,", "Megszólítás, pl. Tisztelt Kovács úr!")}
        onChange={edit("greetingNote")}
        className={cn("font-semibold", TEXT_DEFAULT)}
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
  );

  const uspTitle =
    headings.usp ||
    (companyName
      ? t(`Why choose ${companyName}?`, `Prečo si vybrať práve ${companyName}?`, `Miért a ${companyName}?`)
      : t("Why choose us?", "Prečo si vybrať práve nás?", "Miért minket válasszon?"));

  const uspGrid = (editing || uspCards.length > 0) && (
    <div className="mt-8">
      <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: `${accentColor}40` }}>
        <h3 className="font-bold text-sm" style={{ color: primaryColor }}>{uspTitle}</h3>
      </div>

      {editing ? (
        <EditableUspGrid
          cards={editableUspCards}
          editing={editing}
          cardClassName={uspCardClass}
          cardStyle={uspCardStyle}
          dotClassName="h-2.5 w-2.5 rounded-full shrink-0"
          dotStyle={{ backgroundColor: accentColor }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
          {uspCards.slice(0, 4).map((card, idx) => (
            <div key={idx} className={uspCardClass} style={uspCardStyle}>
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
    </div>
  );

  // Printed with the benefit cards: no cards, no reassurance note — as it always was.
  const reassurance = (editing || uspCards.length > 0) && (
    editing ? (
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
    )
  );

  const itemsTable = (
    <div className="mt-8">
      <h3
        className="font-bold text-sm uppercase tracking-wider pb-2 border-b border-slate-200 flex items-center justify-between gap-2"
        style={{ color: primaryColor }}
      >
        <span>{headings.items || t("Scope of delivery", "Rozsah dodávky a položiek", "Szállítás terjedelme")}</span>
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
            <tr className="font-bold text-[11px] uppercase tracking-wider" style={tableHeadStyle}>
              <th className={cn(thBase, tableFilled && "rounded-l-lg")} style={thStyle}>{t("Item", "Položka", "Tétel")}</th>
              <th className={thBase} style={thStyle}>{t("Specification", "Špecifikácia", "Leírás")}</th>
              <th className={cn(thBase, "text-center")} style={thStyle}>{t("Qty", "Množstvo", "Mennyiség")}</th>
              <th className={cn(thBase, "text-right")} style={thStyle}>{t("Unit price", "Jedn. cena", "Egységár")}</th>
              <th className={cn(thBase, "text-right", tableFilled && "rounded-r-lg")} style={thStyle}>{t("Total", "Spolu", "Összesen")}</th>
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
                  <td className={cn("p-2.5 font-bold align-top", TEXT_DEFAULT)}>
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
                  <td className={cn("p-2.5 text-right font-bold align-top whitespace-nowrap", TEXT_STRONG)}>
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
  );

  const totalBox = (
    <>
      <div
        className={cn(
          "mt-4 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-2 print:shadow-none",
          bannerOutlined ? "bg-white" : "shadow-xl",
          !bannerOutlined && bannerLight && "text-white"
        )}
        style={bannerStyle}
      >
        <div
          className={cn(
            "font-bold text-sm tracking-wide uppercase text-center sm:text-left",
            !bannerOutlined && bannerLight && "text-slate-100"
          )}
        >
          {bannerText}
        </div>
        <div
          className={cn(
            "text-2xl sm:text-3xl font-black tracking-tight whitespace-nowrap",
            !bannerOutlined && bannerLight && "text-white drop-shadow"
          )}
        >
          {formattedPrice}
        </div>
      </div>
      {editing && <PriceRangeEditor offer={offer} editing={editing} />}
    </>
  );

  const keyParameters = editing ? (
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
  );

  const nextSteps = (editing || offer.nextStepsNote) && (
    <div
      className="mt-6 p-4 rounded-2xl border text-xs"
      style={{ backgroundColor: `${accentColor}10`, borderColor: `${accentColor}40` }}
    >
      <span className="font-black uppercase tracking-wider text-[11px] block" style={{ color: primaryColor }}>
        {headings.nextStep || `${t("Next step", "Ďalší krok", "Következő lépés")}:`}
      </span>
      <OfferField
        name="nextSteps"
        multiline
        preLine
        value={offer.nextStepsNote}
        placeholder={t("Next step — what should the client do now?", "Ďalší krok — čo má klient urobiť teraz?", "Következő lépés — mit tegyen most az ügyfél?")}
        onChange={edit("nextStepsNote")}
        className="text-[color:var(--tpl-text,#1e293b)] mt-1"
      />
    </div>
  );

  const signoff = (
    <div className={cn("mt-6 flex flex-wrap justify-between items-end gap-3 text-xs", TEXT_SOFT)}>
      <div>
        <OfferField
          name="closing"
          multiline
          value={offer.closingNote}
          placeholder={t("Closing note", "Záverečný text", "Záró szöveg")}
          onChange={edit("closingNote")}
        />
        <p className={cn("font-semibold mt-2", TEXT_DEFAULT)}>
          {t("Kind regards,", "S úctou a pozdravom,", "Tisztelettel,")}
        </p>
        {editing ? (
          <OfferField
            name="signOff"
            value={offer.signOffTeam}
            placeholder={companyName || t("Your team", "Váš tím", "Az Ön csapata")}
            onChange={edit("signOffTeam")}
            className={cn("font-bold text-sm", TEXT_STRONG)}
          />
        ) : (
          (offer.signOffTeam || companyName) && (
            <p className={cn("font-bold text-sm", TEXT_STRONG)}>{offer.signOffTeam || companyName}</p>
          )
        )}
      </div>
      {offer.createdBy && (
        <div className="text-right text-[11px] text-slate-400 font-mono">
          {t("Issued by", "Vystavil", "Kiállította")}: {offer.createdBy}
        </div>
      )}
    </div>
  );

  const footer = (
    <>
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
    </>
  );

  const blocks: Record<AiTemplateSection, React.ReactNode> = {
    header,
    client_metadata: clientMetadata,
    greeting,
    usp_grid: uspGrid,
    reassurance,
    items_table: itemsTable,
    total_box: totalBox,
    key_parameters: keyParameters,
    next_steps: nextSteps,
    signoff,
    footer
  };

  const rootStyle: React.CSSProperties & Record<string, string | undefined> = {};
  if (tpl.colors.background) rootStyle.backgroundColor = tpl.colors.background;
  if (tpl.colors.text) {
    rootStyle.color = tpl.colors.text;
    rootStyle["--tpl-text"] = tpl.colors.text;
  }
  const fontStack = FONT_STACKS[layout.fontFamily];
  if (fontStack) rootStyle.fontFamily = fontStack;

  return (
    <div
      {...(editing ? { "data-offer-editing": "" } : {})}
      data-offer-template={customTemplate?.id || undefined}
      className="view-size-fixed print-document force-light bg-white text-slate-900 font-sans p-8 md:p-12 max-w-[920px] mx-auto shadow-2xl rounded-3xl border border-slate-200 print:shadow-none print:border-none print:max-w-none print:rounded-none text-[13px] leading-relaxed select-text"
      style={Object.keys(rootStyle).length ? rootStyle : undefined}
    >
      {tpl.sections.map(id => (
        <React.Fragment key={id}>{blocks[id]}</React.Fragment>
      ))}
    </div>
  );
};
