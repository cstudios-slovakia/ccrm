import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Ban, SmilePlus } from "lucide-react";
import { cn } from "../../utils/cn";
import { LIST_ICON_GROUPS } from "../../utils/listIconCatalog.generated";
import { listIconFor, type ListIconKind } from "../../utils/listIcons";
import { saveListIcon, useListIcons } from "../../utils/listIconStore";
import { getStoredLanguage } from "../../utils/translations";
import { viewSizeScale } from "../../utils/viewSize";
import { ScrollFade } from "../settings/ScrollFade";
import { ListIconGlyph } from "./ListIcon";

const PANEL_WIDTH_BASE = 312;
const PANEL_HEIGHT_BASE = 360;
const MARGIN = 8;
/** Same layer as ColorPicker / CustomSelect: above drawers and modals. */
const PANEL_Z = 100001;
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const LABELS = {
  en: {
    choose: "Choose an icon",
    none: "No icon",
    failed: "The icon could not be saved.",
    flags: "Flags",
    channels: "Channels & places",
    business: "Business & products",
    symbols: "Symbols",
  },
  sk: {
    choose: "Vybrať ikonu",
    none: "Bez ikony",
    failed: "Ikonu sa nepodarilo uložiť.",
    flags: "Vlajky",
    channels: "Kanály a miesta",
    business: "Obchod a produkty",
    symbols: "Symboly",
  },
  hu: {
    choose: "Ikon választása",
    none: "Nincs ikon",
    failed: "Az ikont nem sikerült menteni.",
    flags: "Zászlók",
    channels: "Csatornák és helyek",
    business: "Üzlet és termékek",
    symbols: "Szimbólumok",
  },
} as const;

/** "flag-slovakia" → "Flag slovakia" — the tooltip and the screen-reader name. */
const humanize = (id: string) => id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ");

interface Coords {
  top?: number;
  bottom?: number;
  left: number;
  openUp: boolean;
}

/**
 * The icon slot of a list row in Settings: shows the item's icon (or a faint
 * "add icon" glyph) and opens a grid of Twemoji pictures. Saves straight away
 * through listIconStore; nothing else on the page has to know.
 */
export const ListIconPicker: React.FC<{
  kind: ListIconKind;
  itemKey: string;
  disabled?: boolean;
  className?: string;
}> = ({ kind, itemKey, disabled = false, className }) => {
  const labels = LABELS[getStoredLanguage()] ?? LABELS.en;
  const current = listIconFor(useListIcons(), kind, itemKey);
  const reduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const panelWidth = () => PANEL_WIDTH_BASE * viewSizeScale();

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelHeight = panelRef.current?.offsetHeight || PANEL_HEIGHT_BASE * viewSizeScale();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < panelHeight + MARGIN && rect.top > spaceBelow;
    const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - panelWidth() - MARGIN));
    setCoords({
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      left,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (isOpen) updatePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const reposition = () => updatePosition();
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    const id = window.setTimeout(() => document.addEventListener("mousedown", handlePointerDown, true), 0);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("keydown", handleKeyDown, true);
    const focusId = requestAnimationFrame(() => {
      const panel = panelRef.current;
      (panel?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ?? panel?.querySelector<HTMLButtonElement>("button"))?.focus();
    });
    return () => {
      window.clearTimeout(id);
      cancelAnimationFrame(focusId);
      document.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const pick = (icon: string | null) => {
    setIsOpen(false);
    triggerRef.current?.focus();
    if (icon === current) return;
    void saveListIcon(kind, itemKey, icon).then((ok) => {
      if (!ok) (window as unknown as { showToast?: (m: string) => void }).showToast?.(labels.failed);
    });
  };

  // Portaled, but React still bubbles events up the tree into draggable rows.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={labels.choose}
        aria-label={labels.choose}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        data-list-icon-picker={kind}
        onPointerDown={stop}
        onMouseDown={stop}
        onDragStart={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setIsOpen((open) => !open);
        }}
        className={cn(
          "relative flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border cursor-pointer transition-all duration-150 hover:scale-110 active:scale-95",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c29b62] focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100",
          current ? "border-transparent bg-transparent" : "border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:text-slate-600 hover:border-slate-400",
          isOpen && "scale-110 border-slate-400",
          className
        )}
      >
        {current ? <ListIconGlyph id={current} className="h-5 w-5" /> : <SmilePlus className="h-3.5 w-3.5" />}
      </button>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                ref={panelRef}
                role="dialog"
                aria-label={labels.choose}
                initial={{ opacity: 0, scale: 0.96, y: coords?.openUp ? 6 : -6 }}
                animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: reduceMotion ? 0 : 0.18, ease: EASE_OUT } }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: reduceMotion ? 0 : 0.1 } }}
                onClick={stop}
                onMouseDown={stop}
                onPointerDown={stop}
                onKeyDown={stop}
                onDoubleClick={stop}
                style={{
                  position: "fixed",
                  top: coords?.top,
                  bottom: coords?.bottom,
                  left: coords?.left,
                  width: panelWidth(),
                  zIndex: PANEL_Z,
                  transformOrigin: coords?.openUp ? "bottom left" : "top left",
                  visibility: coords ? "visible" : "hidden",
                }}
                className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ring-4 ring-slate-900/[0.03]"
              >
                <div onDragStart={stop}>
                  <button
                    type="button"
                    aria-pressed={current === null}
                    onClick={() => pick(null)}
                    className={cn(
                      "mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-caption font-semibold text-slate-600 cursor-pointer transition-colors hover:bg-slate-100",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c29b62]",
                      current === null && "bg-slate-100 text-slate-900"
                    )}
                  >
                    <Ban className="h-3.5 w-3.5" />
                    {labels.none}
                  </button>
                  <ScrollFade axis="y" className="max-h-[17rem] overflow-y-auto pr-0.5">
                    {LIST_ICON_GROUPS.map((group) => (
                      <div key={group.id} className="mb-2 last:mb-0">
                        <div className="mb-1 px-0.5 type-overline text-slate-400">{labels[group.id]}</div>
                        <div className="grid grid-cols-8 gap-1">
                          {group.icons.map((id) => {
                            const selected = id === current;
                            return (
                              <button
                                key={id}
                                type="button"
                                aria-pressed={selected}
                                title={humanize(id)}
                                aria-label={humanize(id)}
                                onClick={() => pick(id)}
                                className={cn(
                                  "flex aspect-square w-full items-center justify-center rounded-lg cursor-pointer transition-transform duration-150 hover:scale-115 hover:bg-slate-100 active:scale-90",
                                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c29b62]",
                                  selected && "bg-slate-100 ring-2 ring-slate-800"
                                )}
                              >
                                <ListIconGlyph id={id} className="h-5 w-5" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </ScrollFade>
                  <div className="mt-2 border-t border-slate-100 pt-1.5 text-right text-micro text-slate-400">
                    <a href="https://github.com/jdecked/twemoji" target="_blank" rel="noreferrer noopener" className="hover:text-slate-600">
                      Twemoji
                    </a>{" "}
                    · CC BY 4.0
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
};
