import React from "react";
import { Plus, X } from "lucide-react";
import type { InvoiceOffer, InvoiceOfferItem, UspCardItem } from "../../types";
import { cn } from "../../utils/cn";
import { isBlankText, MAX_USP_CARDS, num } from "../../utils/offerDraft";
import type { OfferEditing } from "./offerEditing";
import { OfferField, OfferInput } from "./OfferField";

/**
 * The edit-mode halves of the offer templates' blocks.
 *
 * Both templates share the same structure and differ only in branding, so the
 * parts that exist only while editing — a table row of controls, the benefit
 * card with a remove button — live here once. The templates call these only
 * when they were given an `editing` contract; otherwise they print their own
 * read-only markup, untouched.
 */

const parseNumber = (raw: string) => {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
};

/** One line of the items table as controls. Same five columns as the printed row. */
export const EditableItemRow: React.FC<{
  item: InvoiceOfferItem;
  editing: OfferEditing;
  money: (value: unknown) => string;
  rowClassName: string;
}> = ({ item, editing, money, rowClassName }) => {
  const { copy } = editing;
  const itemRate = num(item.vatRate);
  const rates = editing.vatRates.includes(itemRate)
    ? editing.vatRates
    : [itemRate, ...editing.vatRates].sort((a, b) => b - a);
  const update = (patch: Partial<InvoiceOfferItem>) => editing.updateItem(item.id, patch);

  return (
    <tr className={cn("group/row", rowClassName)} data-offer-item={item.id}>
      <td className="p-2.5 font-bold text-slate-900 align-top">
        <OfferInput
          type="text"
          value={item.name}
          placeholder={copy.itemName}
          aria-label={copy.itemName}
          onChange={e => update({ name: e.target.value })}
        />
        {item.sku && <span className="block text-[10px] text-slate-400 font-normal">SKU: {item.sku}</span>}
      </td>
      <td className="p-2.5 text-slate-600 align-top min-w-[160px]">
        <OfferField
          as="div"
          multiline
          value={item.description}
          placeholder={copy.specification}
          onChange={description => update({ description })}
        />
      </td>
      <td className="p-2.5 text-center font-medium text-slate-800 align-top whitespace-nowrap">
        <div className="flex items-center justify-center gap-1">
          <OfferInput
            numeric
            type="number"
            min="0"
            step="any"
            value={item.quantity}
            aria-label={copy.qty}
            onChange={e => update({ quantity: parseNumber(e.target.value) })}
            className="w-14 text-center"
          />
          <OfferInput
            type="text"
            value={item.unit}
            aria-label={copy.unit}
            placeholder={copy.unit}
            onChange={e => update({ unit: e.target.value })}
            className="w-10 text-center"
          />
        </div>
      </td>
      <td className="p-2.5 text-right font-medium text-slate-700 align-top whitespace-nowrap">
        <div className="flex items-center justify-end gap-1">
          <OfferInput
            numeric
            type="number"
            step="any"
            value={item.unitPrice}
            aria-label={`${copy.unitPrice} (${editing.currencySymbol})`}
            onChange={e => update({ unitPrice: parseNumber(e.target.value) })}
            className="w-24 text-right"
          />
          <span className="text-slate-400">{editing.currencySymbol}</span>
        </div>
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] font-semibold text-emerald-600">
          <span>−</span>
          <OfferInput
            numeric
            type="number"
            min="0"
            max="100"
            step="any"
            value={item.discountPct}
            aria-label={copy.discount}
            onChange={e => update({ discountPct: Math.min(100, Math.max(0, parseNumber(e.target.value))) })}
            className="w-9 text-right"
          />
          <span>%</span>
        </div>
        <label className="mt-0.5 flex items-center justify-end gap-1 text-[10px] font-semibold text-slate-400">
          {copy.vat}
          <select
            value={String(itemRate)}
            aria-label={copy.vat}
            onChange={e => update({ vatRate: parseNumber(e.target.value) })}
            className="bg-transparent text-[10px] font-semibold text-slate-500 rounded-xs outline-0 hover:outline-1 hover:outline-dashed hover:outline-indigo-300 focus:outline-2 focus:outline-indigo-500 cursor-pointer"
          >
            {rates.map(r => (
              <option key={r} value={String(r)}>
                {r} %
              </option>
            ))}
          </select>
        </label>
      </td>
      <td className="p-2.5 text-right font-bold text-slate-950 align-top whitespace-nowrap">
        <div className="flex items-start justify-end gap-1">
          <span>{money(item.totalPrice)}</span>
          <button
            type="button"
            onClick={() => editing.removeItem(item.id)}
            title={copy.removeItem}
            aria-label={copy.removeItem}
            className="size-4 shrink-0 mt-px inline-flex items-center justify-center rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 transition-opacity"
          >
            <X className="size-3" />
          </button>
        </div>
      </td>
    </tr>
  );
};

/** The row shown while a draft has no lines yet — the table keeps its shape. */
export const EditableEmptyItemsRow: React.FC<{ editing: OfferEditing }> = ({ editing }) => (
  <tr>
    <td colSpan={5} className="p-4 text-center text-slate-400 italic">
      {editing.copy.noItems}
    </td>
  </tr>
);

/** Add a custom line, or search the warehouse — sits right under the table. */
export const EditableItemsFooter: React.FC<{ editing: OfferEditing }> = ({ editing }) => (
  <div className="mt-2 flex flex-wrap items-start gap-2 text-xs">
    <button
      type="button"
      data-offer-add-item
      onClick={editing.addItem}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-600 font-semibold hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-indigo-500"
    >
      <Plus className="size-3.5" />
      {editing.copy.addItem}
    </button>
    {editing.renderProductPicker?.()}
  </div>
);

/** The benefit cards as controls, with a remove × per card and an add slot. */
export const EditableUspGrid: React.FC<{
  cards: UspCardItem[];
  editing: OfferEditing;
  cardClassName: string;
  dotClassName: string;
  dotStyle?: React.CSSProperties;
}> = ({ cards, editing, cardClassName, dotClassName, dotStyle }) => {
  const { copy } = editing;
  const visible = cards.slice(0, MAX_USP_CARDS);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
      {visible.map((card, idx) => (
        <div key={idx} className={cn(cardClassName, "relative group/usp")} data-offer-usp={idx}>
          <div className="font-bold text-slate-950 text-xs flex items-center gap-2">
            <span className={dotClassName} style={dotStyle} />
            <OfferInput
              type="text"
              value={card.title}
              placeholder={copy.uspTitle(idx + 1)}
              aria-label={copy.uspTitle(idx + 1)}
              onChange={e => editing.updateUsp(idx, { title: e.target.value })}
            />
          </div>
          <OfferField
            as="div"
            multiline
            value={card.subtitle}
            placeholder={copy.uspSubtitle}
            onChange={subtitle => editing.updateUsp(idx, { subtitle })}
            className="text-[11.5px] text-slate-600 mt-1 leading-snug"
          />
          <button
            type="button"
            onClick={() => editing.removeUsp(idx)}
            title={copy.removeUsp}
            aria-label={copy.removeUsp}
            className="absolute top-1.5 right-1.5 size-4 inline-flex items-center justify-center rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer opacity-0 group-hover/usp:opacity-100 group-focus-within/usp:opacity-100 focus-visible:opacity-100 transition-opacity"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      {visible.length < MAX_USP_CARDS && (
        <button
          type="button"
          onClick={editing.addUsp}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 p-3.5 text-xs font-semibold text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all cursor-pointer active:scale-[0.98]"
        >
          <Plus className="size-3.5" />
          {copy.addUsp}
        </button>
      )}
    </div>
  );
};

/** Optional price range, edited under the price banner it replaces the total in. */
export const PriceRangeEditor: React.FC<{ offer: InvoiceOffer; editing: OfferEditing }> = ({ offer, editing }) => {
  const { copy } = editing;
  const read = (raw: string) => (raw.trim() === "" || !Number.isFinite(parseFloat(raw)) ? null : parseFloat(raw));
  return (
    <div className="mt-2 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs text-slate-500">
      <span className="font-semibold">{copy.priceRangeFrom}</span>
      <OfferInput
        numeric
        type="number"
        step="any"
        value={offer.priceRangeMin ?? ""}
        placeholder={copy.optional}
        aria-label={copy.priceRangeFrom}
        onChange={e => editing.onChange({ priceRangeMin: read(e.target.value) })}
        className="w-24 text-right"
      />
      <span className="font-semibold">{copy.priceRangeTo}</span>
      <OfferInput
        numeric
        type="number"
        step="any"
        value={offer.priceRangeMax ?? ""}
        placeholder={copy.optional}
        aria-label={copy.priceRangeTo}
        onChange={e => editing.onChange({ priceRangeMax: read(e.target.value) })}
        className="w-24 text-right"
      />
      <span className="basis-full text-right text-[11px] text-slate-400">{copy.priceRangeHint}</span>
    </div>
  );
};

/** The three execution parameters as cards of controls. */
export const EditableParameterCards: React.FC<{
  offer: InvoiceOffer;
  editing: OfferEditing;
  labels: { duration: string; startDate: string; warranty: string };
  cardClassName: string;
}> = ({ offer, editing, labels, cardClassName }) => {
  const fields = [
    { key: "durationText" as const, name: "duration", label: labels.duration, placeholder: editing.copy.paramPlaceholders.duration },
    { key: "startDateText" as const, name: "startDate", label: labels.startDate, placeholder: editing.copy.paramPlaceholders.startDate },
    { key: "warrantyText" as const, name: "warranty", label: labels.warranty, placeholder: editing.copy.paramPlaceholders.warranty }
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-center">
      {fields.map(f => (
        <div key={f.key} className={cardClassName}>
          <OfferField
            as="div"
            name={f.name}
            value={offer[f.key]}
            placeholder={f.placeholder}
            onChange={next => editing.onChange({ [f.key]: next })}
            className="text-base font-black text-slate-950"
          />
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{f.label}</div>
        </div>
      ))}
    </div>
  );
};

/** Muted pointer to Settings → Invoicing, shown only while editing and only where the identity is empty. */
export const IdentityHint: React.FC<{ editing?: OfferEditing; empty: boolean; className?: string }> = ({
  editing,
  empty,
  className
}) =>
  editing && empty ? (
    <p className={cn("text-[10px] italic text-slate-400 normal-case tracking-normal font-normal", className)}>
      {editing.copy.identityHint}
    </p>
  ) : null;

/** True when no benefit card has any text — the reassurance note is printed inside that block. */
export const hasNoUspText = (cards: UspCardItem[]) => cards.every(c => isBlankText(c.title) && isBlankText(c.subtitle));
