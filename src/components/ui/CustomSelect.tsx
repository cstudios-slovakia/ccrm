import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { motion } from "framer-motion";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { getStoredLanguage } from "../../utils/translations";

export interface DropdownOption {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Text the search box matches against — needed when `label` is not a plain string. */
  searchText?: string;
}

type RawOption = DropdownOption | string;

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: RawOption[];
  placeholder?: string;
  className?: string;
  panelClassName?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  icon?: React.ReactNode;
  align?: "left" | "right";
  /** Skip the default trigger styling (box/border/padding) and rely on `className` alone — for compact inline pill-style triggers. */
  unstyled?: boolean;
  /** Search box at the top of the panel. Defaults to on once the list is long enough to be worth filtering. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Action button beside the search box — "add a new one" for the thing being picked. Only shown with the search box. */
  onAddNew?: () => void;
  /** Tooltip/aria label of the add-new button. */
  addNewLabel?: string;
  /** Icon of the add-new button. Defaults to a plain plus. */
  addNewIcon?: React.ReactNode;
  /** Inline style applied to the trigger button — for dynamic per-instance colors (e.g. status pipeline colors) that can't be expressed as Tailwind classes. */
  style?: React.CSSProperties;
}

function normalizeOptions(options: RawOption[]): DropdownOption[] {
  return options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
}

/** Lowercased and stripped of diacritics, so "mestanek" finds "Mešťánek". */
function foldText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function optionSearchText(o: DropdownOption): string {
  if (o.searchText !== undefined) return o.searchText;
  if (typeof o.label === "string") return o.label;
  if (typeof o.label === "number") return String(o.label);
  return o.value;
}

interface Coords {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  width: number;
  maxWidth: number;
  openUp: boolean;
}

const PANEL_MAX_HEIGHT = 260;
/** Below this many options, scanning the list beats typing. */
const SEARCH_THRESHOLD = 8;
/** Above drawers (`z-[100000]`) and modals (`z-[9999]`) so portaled options paint on top. */
const PANEL_Z = 100001;

/** The select is a leaf reused across trees that do not pass the language down. */
const SEARCH_COPY = {
  en: { search: "Search...", noMatches: "No matches", noOptions: "No options", addNew: "Add new" },
  sk: { search: "Hľadať...", noMatches: "Žiadne výsledky", noOptions: "Žiadne možnosti", addNew: "Pridať nový" },
  hu: { search: "Keresés...", noMatches: "Nincs találat", noOptions: "Nincs lehetőség", addNew: "Új hozzáadása" },
} as const;

/**
 * The search box that sits at the top of a dropdown panel, with its optional
 * "add a new one" button beside it.
 *
 * Exported because a handful of panels (multi-select checklists, grouped
 * pickers) cannot be a `CustomSelect` but must still look like one — the shape
 * of this row is what makes every dropdown in the app read as the same control.
 */
export const DropdownSearchRow: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  /** Action button beside the box. Left out, the box fills the row. */
  onAddNew?: () => void;
  addNewLabel?: string;
  addNewIcon?: React.ReactNode;
}> = ({ value, onChange, placeholder, onKeyDown, inputRef, autoFocus, onAddNew, addNewLabel, addNewIcon }) => {
  const copy = SEARCH_COPY[getStoredLanguage()];
  const label = addNewLabel ?? copy.addNew;
  return (
    <div className="shrink-0 border-b border-slate-100 p-1.5">
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onClick={(e) => e.stopPropagation()}
            placeholder={placeholder ?? copy.search}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2.5 text-sm font-medium text-slate-700 outline-none transition-colors placeholder:font-medium placeholder:text-slate-400 focus:border-accent focus:bg-white"
          />
        </div>
        {onAddNew && (
          <button
            type="button"
            title={label}
            aria-label={label}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onAddNew();
            }}
            className="shrink-0 flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent transition-all hover:bg-accent/20 active:scale-95 cursor-pointer"
          >
            {addNewIcon ?? <Plus className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
};

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = "Select...",
  className = "",
  panelClassName = "",
  size = "md",
  disabled = false,
  icon,
  align = "left",
  unstyled = false,
  searchable,
  searchPlaceholder,
  onAddNew,
  addNewLabel,
  addNewIcon,
  style,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const allOpts = normalizeOptions(options);
  const selected = allOpts.find((o) => o.value === value);
  const showSearch = searchable ?? allOpts.length >= SEARCH_THRESHOLD;
  const copy = SEARCH_COPY[getStoredLanguage()];
  const needle = showSearch ? foldText(query.trim()) : "";
  const opts = needle ? allOpts.filter((o) => foldText(optionSearchText(o)).includes(needle)) : allOpts;

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < PANEL_MAX_HEIGHT && rect.top > spaceBelow;
    const margin = 8;
    const width = rect.width;
    let left = align === "right" ? undefined : rect.left;
    let right = align === "right" ? window.innerWidth - rect.right : undefined;
    if (left !== undefined) {
      left = Math.max(margin, Math.min(left, window.innerWidth - Math.max(width, 160) - margin));
    }
    if (right !== undefined) {
      right = Math.max(margin, right);
    }
    // A long option label would otherwise stretch the panel sideways, because
    // `minWidth` only sets the floor and the rows size to their content — which
    // is how a full-width field ended up with a panel running off the screen.
    // The panel follows its trigger, and only a narrow trigger (a compact pill)
    // is allowed the room a label needs; either way it stops at the viewport.
    const roomToEdge =
      right !== undefined ? window.innerWidth - right - margin : window.innerWidth - (left ?? margin) - margin;
    const maxWidth = Math.min(Math.max(width, 320), Math.max(roomToEdge, 160));
    setCoords({
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
      left,
      right,
      width,
      maxWidth,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (isOpen) updatePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handle = () => updatePosition();
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    // Defer so the opening click (and its capture-phase mousedown) cannot
    // immediately close the panel. Capture phase: some parents (e.g. draggable
    // canvas cards) stopPropagation() on mousedown during the bubble phase.
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside, true);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      const idx = allOpts.findIndex((o) => o.value === value);
      setHighlighted(idx >= 0 ? idx : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && showSearch) searchRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, showSearch]);

  const close = () => {
    setIsOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };

  const open = () => {
    updatePosition();
    setIsOpen(true);
  };

  const pick = (opt: DropdownOption | undefined) => {
    if (!opt || opt.disabled) return;
    // Close synchronously before the parent re-renders (the task dashboard
    // calendar is expensive). Otherwise the listbox stays in the DOM for
    // hundreds of ms and looks like the choice did not take.
    flushSync(() => {
      setIsOpen(false);
      setQuery("");
    });
    triggerRef.current?.focus();
    onChange(opt.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!isOpen && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      open();
      return;
    }
    if (!isOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, opts.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(opts[highlighted]);
    }
  };

  // The search box takes focus when the panel opens, so it carries the same
  // keyboard navigation the trigger does while the list is filtered.
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, opts.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(opts[highlighted]);
    }
  };

  const sizeClasses = size === "sm" ? "px-2.5 py-1.5 text-xs gap-1" : "px-3.5 py-2.5 text-sm gap-1.5";

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          if (isOpen) setIsOpen(false);
          else open();
        }}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={style}
        className={
          unstyled
            ? `flex items-center transition-all duration-150 cursor-pointer ${disabled ? "opacity-50 cursor-not-allowed" : "active:scale-[0.98]"} ${className}`
            : `w-full flex items-center justify-between rounded-xl border font-semibold text-left transition-all duration-150 cursor-pointer ${sizeClasses} ${
                disabled
                  ? "opacity-50 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-400"
                  : isOpen
                  ? "bg-white border-accent ring-2 ring-accent/20 text-slate-800"
                  : "bg-white border-slate-200 text-slate-700 hover:border-slate-300 active:scale-[0.98]"
              } ${className}`
        }
      >
        <span className="flex items-center gap-1.5 min-w-0 truncate">
          {icon}
          <span className={`truncate ${!selected ? "text-slate-400 font-medium" : ""}`}>
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-accent" : "text-slate-400"
          }`}
        />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          isOpen ? (
              <motion.div
                ref={panelRef}
                initial={{ opacity: 0, scale: 0.97, y: coords?.openUp ? 6 : -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: "fixed",
                  top: coords?.top,
                  bottom: coords?.bottom,
                  left: coords?.left,
                  right: coords?.right,
                  minWidth: coords?.width ?? 160,
                  maxWidth: coords?.maxWidth,
                  maxHeight: PANEL_MAX_HEIGHT,
                  zIndex: PANEL_Z,
                  transformOrigin: coords?.openUp ? "bottom" : "top",
                  visibility: coords ? "visible" : "hidden",
                }}
                className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ring-4 ring-slate-900/[0.03] ${panelClassName}`}
              >
                {showSearch && (
                  <DropdownSearchRow
                    inputRef={searchRef}
                    value={query}
                    onChange={(next) => {
                      setQuery(next);
                      setHighlighted(0);
                    }}
                    onKeyDown={handleSearchKeyDown}
                    placeholder={searchPlaceholder ?? copy.search}
                    addNewLabel={addNewLabel}
                    addNewIcon={addNewIcon}
                    onAddNew={
                      onAddNew
                        ? () => {
                            // The panel has to go first: what opens next is a modal.
                            setIsOpen(false);
                            setQuery("");
                            onAddNew();
                          }
                        : undefined
                    }
                  />
                )}
                {/* The listbox is the option list itself, not the whole panel:
                    the search box and its add-new button are controls beside
                    the list, and a listbox may only contain options. */}
                <div role="listbox" className="flex-1 overflow-y-auto py-1.5">
                  {opts.length === 0 && (
                    <div className="px-3.5 py-2.5 text-sm text-slate-400 italic">
                      {needle ? copy.noMatches : copy.noOptions}
                    </div>
                  )}
                  {opts.map((opt, i) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={opt.value === value}
                      disabled={opt.disabled}
                      onMouseEnter={() => setHighlighted(i)}
                      onClick={(e) => {
                        e.stopPropagation();
                        pick(opt);
                      }}
                      className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-sm font-medium transition-colors cursor-pointer ${
                        opt.disabled
                          ? "opacity-40 cursor-not-allowed"
                          : opt.value === value
                          ? "bg-accent/10 text-accent"
                          : i === highlighted
                          ? "bg-slate-50 text-slate-800"
                          : "text-slate-700"
                      }`}
                    >
                      {opt.icon}
                      <span className="flex-1 truncate">{opt.label}</span>
                      {opt.value === value && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                    </button>
                  ))}
                </div>
              </motion.div>
          ) : null,
          document.body
        )}
    </>
  );
};

export default CustomSelect;
