import React from "react";
import type { AiCustomTemplate, CompanyBillingSettings, InvoiceOffer, InvoiceOfferItem } from "../../types";
import type { Language } from "../../utils/translations";
import { formatMoney } from "../../utils/currency";
import { formatDateLocalized } from "../../utils/localTime";
import { readableTextOn } from "../../utils/aiTemplateBlueprint";
import {
  fieldLabel, itemColumnLabel,
  type BlockStyle, type ItemsColumnId, type OfferBlock, type OfferDocument
} from "../../utils/offerDocument";
import { OFFER_SECTION_ALERT_CLASS, type OfferEditing, type OfferSectionAlert } from "./offerEditing";
import { OfferField } from "./OfferField";
import {
  EditableEmptyItemsRow, EditableItemRow, EditableItemsFooter, EditableUspGrid,
  IdentityHint, PriceRangeEditor
} from "./OfferEditableParts";

export interface OfferBlockReview {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDrop: (index: number, payload: string) => void;
  onText: (id: string, text: string) => void;
  onConvertToField: (id: string, fieldId: string) => void;
  onConvertToText: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  missingIds: string[];
  labelOf: (id: string) => string;
}

interface OfferBlockDocumentProps {
  offer: InvoiceOffer;
  companySettings?: CompanyBillingSettings | null;
  template: AiCustomTemplate;
  document: OfferDocument;
  systemCurrency?: string | null;
  language?: Language;
  editing?: OfferEditing;
  sectionAlert?: OfferSectionAlert | null;
  /** Review is a third mode. It is not offer editing. */
  review?: OfferBlockReview;
}

const FONT_PX: Record<NonNullable<BlockStyle["fontSize"]>, string> = {
  sm: "11px", md: "13px", lg: "16px", xl: "20px", title: "26px"
};

const cssOf = (style?: BlockStyle): React.CSSProperties => {
  if (!style) return {};
  const css: React.CSSProperties = {};
  if (style.color) css.color = style.color;
  if (style.background) css.background = style.background;
  if (style.fontSize) css.fontSize = FONT_PX[style.fontSize];
  if (style.weight) css.fontWeight = style.weight === "bold" ? 700 : style.weight === "medium" ? 500 : 400;
  if (style.align) css.textAlign = style.align;
  if (style.radius) css.borderRadius = { none: 0, sm: 4, md: 8, pill: 999 }[style.radius];
  const edge = style.borderColor || style.color || "#e2e8f0";
  if (style.border === "all") css.border = `1px solid ${edge}`;
  else if (style.border === "left") css.borderLeft = `4px solid ${edge}`;
  return css;
};

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const COMPANY_KEY: Record<string, keyof CompanyBillingSettings> = {
  "company.name": "companyName",
  "company.subtitle": "companySubtitle",
  "company.street": "street",
  "company.city": "city",
  "company.postalCode": "postalCode",
  "company.country": "country",
  "company.companyId": "companyId",
  "company.taxId": "taxId",
  "company.vatId": "vatId",
  "company.email": "email",
  "company.phone": "phone",
  "company.phoneSecondary": "phoneSecondary",
  "company.website": "website",
  "company.iban": "iban",
  "company.swift": "swift",
  "company.bankName": "bankName",
  "company.socialProof": "defaultSocialProof"
};

const DATE_FIELDS = new Set(["offer.issuedAt", "offer.validUntil"]);

/**
 * Renders a reconstructed price offer. Edit, preview, print and the review
 * screen are this one tree. Every string the model supplied is a text child.
 */
export const OfferBlockDocument: React.FC<OfferBlockDocumentProps> = ({
  offer,
  companySettings,
  template,
  document,
  systemCurrency = "EUR",
  language = "sk",
  editing,
  sectionAlert = null,
  review
}) => {
  const t = (en: string, sk: string, hu: string) =>
    language === "sk" ? sk : language === "hu" ? hu : en;
  const currency = offer.currency || systemCurrency || "EUR";
  const money = (value: unknown, decimals = 2) =>
    formatMoney(num(value), currency, language, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  const rangeText = (min: number, max: number) => `${money(min, 0)} – ${money(max, 0)}`;

  const companyText = (id: string): string => {
    const key = COMPANY_KEY[id];
    if (!key || !companySettings) return "";
    const value = companySettings[key];
    return typeof value === "string" ? value.trim() : "";
  };

  const offerText = (id: string): string => {
    const key = id.slice("offer.".length) as keyof InvoiceOffer;
    const value = offer[key];
    return typeof value === "string" ? value : "";
  };

  const DropSlot = ({ index }: { index: number }) => (
    <div
      data-drop-index={index}
      className="h-3 -my-1 rounded print:hidden"
      onDragOver={e => {
        e.preventDefault();
        e.currentTarget.classList.add("bg-indigo-200");
      }}
      onDragLeave={e => e.currentTarget.classList.remove("bg-indigo-200")}
      onDrop={e => {
        e.preventDefault();
        e.currentTarget.classList.remove("bg-indigo-200");
        review?.onDrop(index, e.dataTransfer.getData("text/plain"));
      }}
    />
  );

  const chrome = (block: OfferBlock) => {
    if (!review || review.selectedId !== block.id) return null;
    return (
      <div className="mb-1 flex flex-wrap items-center gap-1 print:hidden" onClick={e => e.stopPropagation()}>
        <span
          draggable
          onDragStart={e => {
            e.dataTransfer.setData("text/plain", `block:${block.id}`);
            e.dataTransfer.effectAllowed = "move";
          }}
          className="cursor-grab rounded bg-slate-100 px-1.5 text-ui text-slate-500"
          title={t("Drag", "Presunúť", "Mozgatás")}
        >
          {t("Drag", "Presunúť", "Mozgatás")}
        </span>
        <button type="button" className="text-ui text-slate-600" onClick={() => review.onMove(block.id, -1)}>{t("Up", "Hore", "Fel")}</button>
        <button type="button" className="text-ui text-slate-600" onClick={() => review.onMove(block.id, 1)}>{t("Down", "Dole", "Le")}</button>
        <button type="button" className="text-ui text-rose-600" onClick={() => review.onDelete(block.id)}>{t("Delete", "Zmazať", "Törlés")}</button>
        {block.type === "text" && (
          <select
            className="text-ui"
            value=""
            aria-label={t("Use as field", "Použiť ako pole", "Mezőként")}
            onChange={e => {
              if (e.target.value) review.onConvertToField(block.id, e.target.value);
            }}
          >
            <option value="">{t("Use as field", "Použiť ako pole", "Mezőként")}</option>
            {review.missingIds.map(id => (
              <option key={id} value={id}>{review.labelOf(id)}</option>
            ))}
          </select>
        )}
        {(block.type === "field" || block.type === "customField") && (
          <button type="button" className="text-ui text-indigo-700" onClick={() => review.onConvertToText(block.id)}>
            {t("Fixed text", "Pevný text", "Rögzített szöveg")}
          </button>
        )}
      </div>
    );
  };

  const wrap = (block: OfferBlock, body: React.ReactNode) => {
    const selected = review?.selectedId === block.id;
    const client = block.type === "field" && block.fieldId.startsWith("offer.client");
    const items = block.type === "itemsTable";
    const alert = (client && sectionAlert === "client") || (items && sectionAlert === "items");
    return (
      <div
        data-offer-block={block.id}
        {...(client && sectionAlert === "client" ? { "data-offer-client": "" } : {})}
        {...(items && sectionAlert === "items" ? { "data-offer-items": "" } : {})}
        className={alert ? OFFER_SECTION_ALERT_CLASS : selected ? "rounded ring-2 ring-indigo-400 print:ring-0" : undefined}
        style={cssOf(block.type === "spacer" ? undefined : block.style)}
        onClick={review ? e => { e.stopPropagation(); review.onSelect(block.id); } : undefined}
      >
        {chrome(block)}
        {body}
      </div>
    );
  };

  const renderField = (block: Extract<OfferBlock, { type: "field" }>) => {
    const label = block.label || fieldLabel(block.fieldId, language);
    if (review) return <span>[{label}]</span>;
    if (block.fieldId === "company.logo") {
      const url = companySettings?.companyLogoUrl || "";
      const name = companyText("company.name");
      const initials = name ? name.replace(/[^\p{L}\p{N} ]/gu, "").slice(0, 3).toUpperCase() : "—";
      return (
        <div>
          {url ? (
            <img src={url} alt={name || "Logo"} className="h-12 w-auto max-w-[180px] object-contain" />
          ) : (
            <div className="inline-flex bg-slate-950 text-white p-3 rounded-xl font-black tracking-widest">{initials}</div>
          )}
          {editing && !url && <IdentityHint editing={editing} empty />}
        </div>
      );
    }
    if (block.fieldId.startsWith("company.")) {
      const value = companyText(block.fieldId);
      return (
        <div>
          {value ? <span>{value}</span> : null}
          {editing && !value && <IdentityHint editing={editing} empty />}
        </div>
      );
    }
    if (block.fieldId === "offer.clientName" && editing) {
      return <span className="inline-block align-middle">{editing.renderClientPicker()}</span>;
    }
    if (DATE_FIELDS.has(block.fieldId) && !editing) {
      const raw = offerText(block.fieldId);
      return raw ? <span>{formatDateLocalized(raw, language)}</span> : null;
    }
    const key = block.fieldId.slice("offer.".length) as keyof InvoiceOffer;
    return (
      <OfferField
        name={String(key)}
        value={offerText(block.fieldId)}
        placeholder={label}
        type={DATE_FIELDS.has(block.fieldId) ? "date" : "text"}
        onChange={editing ? next => editing.onChange({ [key]: next } as Partial<InvoiceOffer>) : undefined}
      />
    );
  };

  const sampleItem = (): InvoiceOfferItem => ({
    id: "sample",
    name: t("Sample line", "Vzorová položka", "Mintatétel"),
    description: t("Description", "Popis", "Leírás"),
    quantity: 2,
    unit: "ks",
    unitPrice: 100,
    vatRate: 20,
    discountPct: 0,
    totalPrice: 200
  });

  const cell = (item: InvoiceOfferItem, column: ItemsColumnId) => {
    switch (column) {
      case "name": return item.name;
      case "description": return item.description || "";
      case "quantity": return String(item.quantity);
      case "unit": return item.unit;
      case "unitPrice": return money(item.unitPrice);
      case "vatRate": return `${item.vatRate} %`;
      case "discountPct": return `${item.discountPct} %`;
      case "totalPrice": return money(item.totalPrice);
      default: return "";
    }
  };

  const renderTable = (block: Extract<OfferBlock, { type: "itemsTable" }>) => {
    const headStyle: React.CSSProperties = {};
    if (block.style?.background) {
      headStyle.background = block.style.background;
      headStyle.color = block.style.color || readableTextOn(block.style.background);
    }
    if (editing) {
      const rows = offer.items.length
        ? offer.items.map(item => (
            <EditableItemRow key={item.id} item={item} editing={editing} money={money} rowClassName="border-b border-slate-100" />
          ))
        : [<EditableEmptyItemsRow key="empty" editing={editing} />];
      return (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={headStyle} className={block.style?.background ? "" : "bg-slate-900 text-white"}>
                  <th className="p-2.5">{t("Item", "Položka", "Tétel")}</th>
                  <th className="p-2.5">{t("Description", "Popis", "Leírás")}</th>
                  <th className="p-2.5 text-center">{t("Qty", "Mn.", "Menny.")}</th>
                  <th className="p-2.5 text-right">{t("Price", "Cena", "Ár")}</th>
                  <th className="p-2.5 text-right">{t("Total", "Spolu", "Összesen")}</th>
                </tr>
              </thead>
              <tbody>{rows}</tbody>
            </table>
          </div>
          <EditableItemsFooter editing={editing} />
        </div>
      );
    }
    const rows = review ? [sampleItem()] : offer.items;
    return (
      <table className="w-full text-left border-collapse">
        <thead>
          <tr style={headStyle} className={block.style?.background ? "" : "bg-slate-900 text-white"}>
            {block.columns.map(column => (
              <th key={column} className="p-2.5">{itemColumnLabel(column, language)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={block.columns.length} className="p-4 text-center text-slate-400 italic">
                {t("No items", "Žiadne položky", "Nincsenek tételek")}
              </td>
            </tr>
          ) : rows.map(item => (
            <tr key={item.id} className="border-b border-slate-100">
              {block.columns.map(column => (
                <td key={column} className="p-2.5">{cell(item, column)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderTotals = (block: Extract<OfferBlock, { type: "totals" }>) => {
    const min = offer.priceRangeMin;
    const max = offer.priceRangeMax;
    const ranged = typeof min === "number" && typeof max === "number" && Number.isFinite(min) && Number.isFinite(max);
    const show = (flag: boolean | undefined, label: string, value: string) =>
      flag ? (
        <div className="flex justify-between gap-6">
          <span>{label}</span>
          <span className="font-semibold">{value}</span>
        </div>
      ) : null;
    const subtotal = review ? 1000 : offer.subtotal;
    const vat = review ? 200 : offer.vatAmount;
    const total = review ? 1200 : offer.totalPrice;
    return (
      <div className="ml-auto w-full max-w-xs space-y-1">
        {show(block.subtotal, t("Subtotal", "Medzisúčet", "Részösszeg"), money(subtotal))}
        {show(block.vat, t("VAT", "DPH", "ÁFA"), money(vat))}
        {show(block.total, t("Total", "Spolu", "Összesen"), block.priceRange && ranged ? rangeText(min as number, max as number) : money(total))}
        {block.priceRange && !ranged && review && show(true, t("Range", "Rozpätie", "Tartomány"), rangeText(1000, 1500))}
        {editing && block.priceRange && <PriceRangeEditor offer={offer} editing={editing} />}
      </div>
    );
  };

  const renderUsp = () => {
    if (review) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="font-bold">{t("Benefit", "Výhoda", "Előny")}</div>
          </div>
        </div>
      );
    }
    const cards = offer.uspCards || [];
    if (editing) {
      return (
        <EditableUspGrid
          cards={cards}
          editing={editing}
          cardClassName="rounded-xl border border-slate-200 p-3"
          dotClassName="inline-block size-2 rounded-full bg-slate-900"
        />
      );
    }
    const visible = cards.filter(card => card.title?.trim() || card.subtitle?.trim());
    if (!visible.length) return null;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visible.map((card, index) => (
          <div key={index} className="rounded-xl border border-slate-200 p-3">
            <div className="font-bold">{card.title}</div>
            {card.subtitle ? <div>{card.subtitle}</div> : null}
          </div>
        ))}
      </div>
    );
  };

  const renderCustom = (block: Extract<OfferBlock, { type: "customField" }>) => {
    if (review) return <span data-custom-field={block.key}>{block.label}</span>;
    return (
      <OfferField
        name={block.key}
        value={offer.customFields?.[block.key] ?? ""}
        placeholder={block.label}
        onChange={editing ? next => editing.onChange({
          customFields: { ...(offer.customFields ?? {}), [block.key]: next }
        }) : undefined}
      />
    );
  };

  const renderBlock = (block: OfferBlock): React.ReactNode => {
    switch (block.type) {
      case "stack":
        return wrap(block, <div className="space-y-3">{block.children.map(child => <React.Fragment key={child.id}>{renderBlock(child)}</React.Fragment>)}</div>);
      case "columns":
        return wrap(block, (
          <div className={block.columns.length === 3 ? "grid grid-cols-1 sm:grid-cols-3 gap-4" : "grid grid-cols-1 sm:grid-cols-2 gap-4"}>
            {block.columns.map((col, index) => (
              <div key={index} className="space-y-2 min-w-0">
                {col.map(child => <React.Fragment key={child.id}>{renderBlock(child)}</React.Fragment>)}
              </div>
            ))}
          </div>
        ));
      case "text":
        return wrap(block, review?.selectedId === block.id ? (
          <textarea
            value={block.text}
            onChange={e => review.onText(block.id, e.target.value)}
            onClick={e => e.stopPropagation()}
            className="w-full bg-transparent border border-dashed border-slate-300 rounded p-1"
          />
        ) : (
          <p className="whitespace-pre-line">{block.text}</p>
        ));
      case "field":
        return wrap(block, renderField(block));
      case "itemsTable":
        return wrap(block, renderTable(block));
      case "totals":
        return wrap(block, renderTotals(block));
      case "uspCards":
        return wrap(block, renderUsp());
      case "customField":
        return wrap(block, renderCustom(block));
      case "divider":
        return wrap(block, <hr className="border-slate-200" />);
      case "spacer":
        return wrap(block, <div className="h-6" />);
      default:
        return null;
    }
  };

  return (
    <div
      data-offer-template={template.id}
      {...(editing ? { "data-offer-editing": "" } : {})}
      className="view-size-fixed print-document force-light bg-white text-slate-900 font-sans p-8 md:p-12 max-w-[920px] mx-auto shadow-2xl rounded-2xl border border-slate-200 print:shadow-none print:border-none print:max-w-none print:rounded-none text-[13px] leading-relaxed select-text"
      onClick={review ? () => review.onSelect(null) : undefined}
    >
      {review && <DropSlot index={0} />}
      {document.blocks.map((block, index) => (
        <React.Fragment key={block.id}>
          {renderBlock(block)}
          {review && <DropSlot index={index + 1} />}
        </React.Fragment>
      ))}
      {editing?.renderClientExtras?.()}
    </div>
  );
};
