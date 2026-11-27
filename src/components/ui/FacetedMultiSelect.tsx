import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Check, ChevronDown, Star } from "lucide-react";
import { getStoredLanguage } from "../../utils/translations";
import { viewSizeScale } from "../../utils/viewSize";
import { orderFacetOptions, type FacetOption } from "../../utils/facetedFilters";
import { DropdownSearchRow } from "./CustomSelect";

/** Leaf component reused across screens that do not hand the language down. */
const COPY = {
  en: { all: "Select all", clear: "Clear", none: "No matches", pin: "Pin as a chip above the list", unpin: "Unpin", noMatch: "No rows with the other filters" },
  sk: { all: "Vybrať všetko", clear: "Zrušiť výber", none: "Žiadne výsledky", pin: "Pripnúť ako čip nad zoznam", unpin: "Odopnúť", noMatch: "Žiadne riadky pri ostatných filtroch" },
  hu: { all: "Összes kijelölése", clear: "Kijelölés törlése", none: "Nincs találat", pin: "Rögzítés chipként a lista fölé", unpin: "Rögzítés megszüntetése", noMatch: "Nincs sor a többi szűrővel" },
} as const;

/** Above drawers and modals, like CustomSelect's panel. */
const PANEL_Z = 100001;
const SEARCH_THRESHOLD = 8;

interface Props {
  options: FacetOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** What the closed control says when nothing is selected ("All managers"). */
  allLabel: string;
  icon?: React.ReactNode;
  className?: string;
  /** Size the closed control to its label, like the toolbar dropdowns do. */
  fitLabel?: boolean;
  searchPlaceholder?: string;
  /** Replaces the closed control's text while something is selected (a default selection that deserves its own name). */
  summary?: string;
  /** Values pinned as chips; with `onTogglePin` every row gets a star. */
  pinned?: string[];
  onTogglePin?: (value: string) => void;
}

interface Coords {
  top?: number;
  bottom?: number;
  left: number;
  minWidth: number;
  maxWidth: number;
  openUp: boolean;
}

const foldText = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Multi-select dropdown for a list filter whose options know how many rows they would
 * give under the OTHER filters (see utils/facetedFilters.ts). An option the current
 * selection rules out stays in the list, faded and marked 0, after the matching ones.
 */
export const FacetedMultiSelect: React.FC<Props> = ({
  options,
  selected,
  onChange,
  allLabel,
  icon,
  className = "",
  fitLabel = true,
  searchPlaceholder,
  summary: summaryOverride,
  pinned,
  onTogglePin,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const copy = COPY[getStoredLanguage()];

  const ordered = useMemo(() => orderFacetOptions(options, selected), [options, selected]);
  const needle = foldText(query.trim());
  const shown = needle ? ordered.filter((o) => foldText(o.label).includes(needle)) : ordered;
  const selectedSet = new Set(selected);
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const summary =
    selected.length === 0 ? allLabel : summaryOverride ? summaryOverride : selected.length === 1 ? labelOf(selected[0]) : `${labelOf(selected[0])} +${selected.length - 1}`;
  const nested = options.some((o) => o.indent);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const height = 330 * viewSizeScale();
    const openUp = spaceBelow < height && rect.top > spaceBelow;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - 260 - margin));
    setCoords({
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
      left,
      minWidth: Math.max(rect.width, 240),
      maxWidth: Math.max(window.innerWidth - left - margin, 240),
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (isOpen) updatePosition();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    const reposition = () => updatePosition();
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setIsOpen(false);
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    // Deferred so the opening click cannot close the panel again.
    const id = window.setTimeout(() => document.addEventListener("mousedown", onDown, true), 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("mousedown", onDown, true);
    };
  }, [isOpen]);

  const toggle = (value: string) =>
    onChange(selectedSet.has(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  const selectAllShown = () => onChange(Array.from(new Set([...selected, ...shown.map((o) => o.value)])));
  const clear = () => onChange([]);
  const hasSelection = selected.length > 0;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setIsOpen(false);
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`${fitLabel ? "w-max max-w-none whitespace-nowrap" : "w-full"} flex items-center justify-between gap-1.5 rounded-md border px-3.5 py-2.5 text-body font-medium text-left shadow-2xs transition-all duration-150 cursor-pointer ${
          isOpen
            ? "bg-white border-entity-solid ring-2 ring-entity-ring text-gray-900"
            : hasSelection
            ? "bg-entity-subtle border-entity-border text-entity-text hover:bg-white"
            : "bg-white border-gray-300 text-gray-800 hover:bg-gray-50 active:scale-[0.99]"
        } ${className}`}
      >
        <span className={`flex items-center gap-1.5 ${fitLabel ? "whitespace-nowrap" : "min-w-0 truncate"}`}>
          {icon}
          <span className={fitLabel ? "whitespace-nowrap" : "truncate"}>{summary}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180 text-entity-text" : "text-gray-400"}`} />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          isOpen ? (
            <motion.div
              ref={panelRef}
              data-dropdown-panel=""
              initial={{ opacity: 0, scale: 0.97, y: coords?.openUp ? 6 : -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: "fixed",
                top: coords?.top,
                bottom: coords?.bottom,
                left: coords?.left,
                minWidth: coords?.minWidth ?? 240,
                maxWidth: coords?.maxWidth,
                maxHeight: 330 * viewSizeScale(),
                zIndex: PANEL_Z,
                transformOrigin: coords?.openUp ? "bottom" : "top",
                visibility: coords ? "visible" : "hidden",
              }}
              className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
            >
              {options.length >= SEARCH_THRESHOLD && (
                <DropdownSearchRow
                  autoFocus
                  value={query}
                  onChange={setQuery}
                  placeholder={searchPlaceholder}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setIsOpen(false);
                      triggerRef.current?.focus();
                    }
                  }}
                />
              )}
              <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3.5 py-1.5 text-ui font-semibold">
                <button type="button" onClick={selectAllShown} className="text-accent hover:underline cursor-pointer">
                  {copy.all}
                </button>
                <button
                  type="button"
                  onClick={clear}
                  disabled={!hasSelection}
                  className="text-slate-500 hover:text-slate-800 hover:underline cursor-pointer disabled:cursor-default disabled:opacity-40 disabled:no-underline"
                >
                  {copy.clear}
                </button>
              </div>
              <div role="listbox" aria-multiselectable="true" className="flex-1 overflow-y-auto py-1.5">
                {shown.length === 0 && <div className="px-3.5 py-2.5 text-body text-slate-400 italic">{copy.none}</div>}
                {shown.map((o) => {
                  const on = selectedSet.has(o.value);
                  const faded = o.count === 0 && !on;
                  const isPinned = !!pinned?.includes(o.value);
                  return (
                    <div
                      key={o.value}
                      role="option"
                      aria-selected={on}
                      title={faded ? copy.noMatch : undefined}
                      onClick={() => toggle(o.value)}
                      style={nested && o.indent ? { paddingLeft: `${0.875 + o.indent * 1.25}rem` } : undefined}
                      className={`group flex items-center gap-2 px-3.5 py-1.5 text-body font-medium transition-colors cursor-pointer hover:bg-gray-50 ${
                        faded ? "text-slate-400" : on ? "text-entity-text" : "text-gray-700"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                          on ? "border-entity-solid bg-entity-solid text-white" : faded ? "border-slate-200 bg-white" : "border-gray-300 bg-white"
                        }`}
                      >
                        {on && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      {o.color && <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${faded ? "opacity-40" : ""}`} style={{ backgroundColor: o.color }} />}
                      <span className={`flex-1 whitespace-nowrap ${on ? "font-semibold" : ""}`}>{o.label}</span>
                      <span
                        className={`min-w-5 rounded-md px-1.5 py-0.5 text-center text-micro font-bold tabular-nums ${
                          faded ? "bg-slate-50 text-slate-300" : on ? "bg-entity-subtle text-entity-text" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {o.count}
                      </span>
                      {onTogglePin && (
                        <button
                          type="button"
                          title={isPinned ? copy.unpin : copy.pin}
                          aria-label={isPinned ? copy.unpin : copy.pin}
                          aria-pressed={isPinned}
                          onClick={(e) => {
                            e.stopPropagation();
                            onTogglePin(o.value);
                          }}
                          className={`shrink-0 rounded-sm p-0.5 transition-opacity cursor-pointer ${
                            isPinned ? "text-amber-500" : "text-slate-300 opacity-0 hover:text-amber-500 group-hover:opacity-100 focus-visible:opacity-100"
                          }`}
                        >
                          <Star className="h-3.5 w-3.5" fill={isPinned ? "currentColor" : "none"} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ) : null,
          document.body,
        )}
    </>
  );
};

export default FacetedMultiSelect;
