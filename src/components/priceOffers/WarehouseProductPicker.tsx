import React, { useMemo, useRef, useState } from "react";
import { Package, Search } from "lucide-react";
import type { WarehouseItem } from "../../types";
import type { Language } from "../../utils/translations";
import { cn } from "../../utils/cn";
import { appliedPriceLevel, matchesItemQuery, packHint, resolveSellPrice, type PriceLevel } from "../../utils/priceLevels";

interface WarehouseProductPickerProps {
  lang: Language;
  products: WarehouseItem[];
  /** The search text lives with the editor, so it survives the picker re-mounting. */
  query: string;
  onQueryChange: (next: string) => void;
  onPick: (product: WarehouseItem) => void;
  money: (value: unknown) => string;
  /** The customer's price level and the configured levels: the listed price is theirs, not the default. */
  priceLevelId?: string | null;
  priceLevels?: readonly PriceLevel[];
  /** `paper` sits inside the printed document and inherits its type; `app` is ordinary app chrome. */
  variant?: "paper" | "app";
}

/**
 * Search the warehouse and add a product as a line.
 *
 * The matches open as a list under the field while it has focus or text, so
 * the document underneath keeps its shape. Picking a product keeps the list
 * open: adding several lines in a row is the common case.
 */
export const WarehouseProductPicker: React.FC<WarehouseProductPickerProps> = ({
  lang,
  products,
  query,
  onQueryChange,
  onPick,
  money,
  priceLevelId = null,
  priceLevels = [],
  variant = "app"
}) => {
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);
  const [focused, setFocused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = query.trim();
    // Found by name, SKU, barcode, an alternative code or the external id.
    const pool = q ? products.filter(w => matchesItemQuery(w, q)) : products;
    return pool.slice(0, 12);
  }, [products, query]);

  if (products.length === 0) return null;
  const open = focused || query.trim() !== "";
  const paper = variant === "paper";

  return (
    <div
      ref={rootRef}
      className="relative"
      onFocus={() => setFocused(true)}
      onBlur={e => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="relative w-64 max-w-full">
        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder={t("Add a product from the warehouse…", "Pridať tovar zo skladu…", "Termék hozzáadása a raktárból…")}
          aria-label={t("Search warehouse product or SKU", "Hľadať tovar alebo SKU", "Termék vagy SKU keresése")}
          className={cn(
            "w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-all",
            paper ? "py-1.5 text-slate-800 placeholder:text-slate-400" : "py-1.5 text-ui text-slate-800"
          )}
        />
      </div>
      {open && (
        <div
          role="listbox"
          aria-label={t("Warehouse products", "Produkty zo skladu", "Raktári termékek")}
          className="absolute left-0 top-full mt-1 z-30 w-[min(28rem,calc(100vw-3rem))] max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl animate-fade-in"
        >
          {matches.length > 0 ? (
            matches.map(wh => (
              <button
                key={wh.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => onPick(wh)}
                className={cn(
                  "w-full flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60",
                  paper ? "" : "text-ui"
                )}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <Package className="size-3.5 shrink-0 text-indigo-500" />
                  <span className="truncate">{wh.name}</span>
                </span>
                <span className="shrink-0 text-right text-slate-400">
                  <span title={appliedPriceLevel(wh, priceLevelId, priceLevels)?.name}>
                    {money(resolveSellPrice(wh, priceLevelId, priceLevels))}/{wh.unit}
                  </span>
                  {packHint(wh, t("pack", "bal", "csomag")) && (
                    <span className="block text-micro">{packHint(wh, t("pack", "bal", "csomag"))}</span>
                  )}
                </span>
              </button>
            ))
          ) : (
            <span className={cn("block px-2.5 py-1.5 italic text-slate-400", paper ? "" : "text-ui")}>
              {t("No product matches.", "Žiadny tovar nezodpovedá hľadaniu.", "Nincs találat.")}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
