import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Pipette } from "lucide-react";
import { cn } from "../../utils/cn";
import { COLOR_PRESETS, DISCREET_COLOR_PRESETS, normalizeHex, prefersDarkInk } from "../../utils/color";
import { getStoredLanguage } from "../../utils/translations";

/**
 * How the trigger looks where the picker sits:
 * - `swatch`  — the button IS the colour dot; size it through `className` (tree rows).
 * - `ring`    — a small bordered circle holding the colour dot (settings tables).
 * - `field`   — an input-sized box, for forms next to text inputs and selects.
 * - `palette` — a rainbow ring around the current colour, the "more colours" button
 *               that sits after a row of inline quick-pick swatches; size via `className`.
 * - `pill`    — an elongated pill (capsule) fully filled with the colour.
 */
export type ColorPickerVariant = "swatch" | "ring" | "field" | "palette" | "pill";

interface ColorPickerProps {
  value: string | null | undefined;
  /** Always receives a normalised `#rrggbb`. Fires live while the custom picker is dragged. */
  onChange: (hex: string) => void;
  variant?: ColorPickerVariant;
  presets?: readonly string[];
  disabled?: boolean;
  title?: string;
  className?: string;
  /** Shown (and offered to the native picker) while `value` is not a valid hex colour. */
  fallback?: string;
  /** Default palette to show when presets not provided: 'discreet' (default) or 'vivid' */
  defaultPalette?: "discreet" | "vivid";
}

const PANEL_WIDTH = 270;
const PANEL_HEIGHT_ESTIMATE = 200;
const MARGIN = 8;
/** Same layer as CustomSelect: above drawers (`z-[100000]`) and modals (`z-[9999]`). */
const PANEL_Z = 100001;
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const LABELS = {
  en: {
    change: "Change color",
    custom: "Color picker",
    hex: "Hex color code",
    discreet: "Discreet",
    vivid: "Vivid",
    title: "Discreet colors",
  },
  sk: {
    change: "Zmeniť farbu",
    custom: "Výber farby",
    hex: "Hex kód farby",
    discreet: "Diskrétne",
    vivid: "Výrazné",
    title: "Diskrétne farby",
  },
  hu: {
    change: "Szín módosítása",
    custom: "Színválasztó",
    hex: "Hex színkód",
    discreet: "Diszkrét",
    vivid: "Élénk",
    title: "Diszkrét színek",
  },
} as const;

const RAINBOW = "conic-gradient(#ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)";

interface Coords {
  top?: number;
  bottom?: number;
  left: number;
  openUp: boolean;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  variant = "swatch",
  presets,
  disabled = false,
  title,
  className = "",
  fallback = "#c29b62",
  defaultPalette = "discreet",
}) => {
  const labels = LABELS[getStoredLanguage()] ?? LABELS.en;
  const current = normalizeHex(value) ?? normalizeHex(fallback) ?? "#c29b62";
  const reduceMotion = useReducedMotion();

  const [activeTab, setActiveTab] = useState<"discreet" | "vivid">(defaultPalette);
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [hexDraft, setHexDraft] = useState(current.slice(1));
  const [hexFocused, setHexFocused] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);

  const displayedPresets = presets ?? (activeTab === "discreet" ? DISCREET_COLOR_PRESETS : COLOR_PRESETS);

  // Keep the hex field in step with outside changes, but never under the user's cursor.
  useEffect(() => {
    if (!hexFocused) setHexDraft(current.slice(1));
  }, [current, hexFocused]);

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelHeight = panelRef.current?.offsetHeight || PANEL_HEIGHT_ESTIMATE;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < panelHeight + MARGIN && rect.top > spaceBelow;
    const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - MARGIN));
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
    // Capture phase: focus lives inside the portaled panel, whose React handlers stop
    // propagation before a bubbling document listener could see the key. Stopping it
    // here also keeps Escape from closing the drawer or modal the picker sits in.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    // Deferred so the click that opened the panel cannot close it; capture phase
    // because draggable rows and canvas cards stop mousedown during bubbling.
    const id = window.setTimeout(() => document.addEventListener("mousedown", handlePointerDown, true), 0);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("keydown", handleKeyDown, true);
    // Land keyboard users on the selected swatch (or the first one).
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

  const commit = (hex: string) => {
    const normalized = normalizeHex(hex);
    if (normalized && normalized !== normalizeHex(value)) onChange(normalized);
  };

  const pickPreset = (hex: string) => {
    commit(hex);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const openNativePicker = () => {
    const input = nativeRef.current;
    if (!input) return;
    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
        return;
      }
    } catch {
      // showPicker throws without user activation or inside cross-origin frames.
    }
    input.click();
  };

  // The panel is portaled to <body>, but React still bubbles its events up the
  // component tree — into draggable category rows, table rows and forms. Stop them here.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const triggerTitle = title ?? labels.change;
  const presetHit = displayedPresets.some((p) => normalizeHex(p) === current);

  const trigger = (() => {
    const shared = {
      ref: triggerRef,
      type: "button" as const,
      disabled,
      title: triggerTitle,
      "aria-label": triggerTitle,
      "aria-haspopup": "dialog" as const,
      "aria-expanded": isOpen,
      onPointerDown: stop,
      onMouseDown: stop,
      onDragStart: (e: React.DragEvent) => e.preventDefault(),
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!disabled) setIsOpen((open) => !open);
      },
    };
    const focusRing = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c29b62] focus-visible:ring-offset-2";
    const disabledState = "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100";

    switch (variant) {
      case "pill":
        return (
          <button
            {...shared}
            className={cn(
              "relative h-7.5 w-12 shrink-0 rounded-full border border-black/10 shadow-xs cursor-pointer transition-all duration-150 hover:scale-105 hover:shadow-sm active:scale-95 ring-1 ring-black/5 flex items-center justify-center overflow-hidden",
              isOpen ? "ring-2 ring-[#c29b62] scale-105 shadow-md" : "hover:border-black/20",
              focusRing,
              disabledState,
              className
            )}
            style={{ backgroundColor: current }}
          >
            {/* Subtle gloss highlight on top half of pill */}
            <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
          </button>
        );
      case "ring":
        return (
          <button
            {...shared}
            className={cn(
              "relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 shadow-inner cursor-pointer transition-transform duration-150 hover:scale-115 active:scale-95",
              isOpen && "scale-115 border-slate-300",
              focusRing,
              disabledState,
              className
            )}
          >
            <span className="h-3 w-3 rounded-full border border-white" style={{ backgroundColor: current }} />
          </button>
        );
      case "field":
        return (
          <button
            {...shared}
            className={cn(
              "relative flex h-8.5 w-12 shrink-0 items-center justify-center rounded-xl border border-black/10 shadow-xs cursor-pointer transition-all duration-150 hover:scale-105 active:scale-95 overflow-hidden ring-1 ring-black/5",
              isOpen ? "border-[#c29b62] ring-2 ring-[#c29b62]/30 scale-105 shadow-md" : "hover:border-slate-300",
              focusRing,
              disabledState,
              className
            )}
            style={{ backgroundColor: current }}
          >
            <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />
          </button>
        );
      case "palette":
        return (
          <button
            {...shared}
            className={cn(
              "relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-[3px] shadow-sm cursor-pointer transition-transform duration-150 hover:scale-115 active:scale-95",
              isOpen && "scale-115",
              focusRing,
              disabledState,
              className
            )}
            style={{ background: RAINBOW }}
          >
            <span
              className="h-full w-full rounded-full border-2 border-white"
              style={{ backgroundColor: presetHit ? "#ffffff" : current }}
            />
          </button>
        );
      default:
        return (
          <button
            {...shared}
            className={cn(
              "relative shrink-0 rounded-full shadow-sm cursor-pointer transition-transform duration-150 hover:scale-125 active:scale-95",
              isOpen && "scale-125",
              focusRing,
              disabledState,
              className
            )}
            style={{ backgroundColor: current }}
          />
        );
    }
  })();

  return (
    <>
      {trigger}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                ref={panelRef}
                role="dialog"
                aria-label={triggerTitle}
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
                  width: PANEL_WIDTH,
                  zIndex: PANEL_Z,
                  transformOrigin: coords?.openUp ? "bottom left" : "top left",
                  visibility: coords ? "visible" : "hidden",
                }}
                className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ring-4 ring-slate-900/[0.03]"
              >
                {/* A plain wrapper: motion.div claims `onDragStart` for its own drag gesture. */}
                <div onDragStart={stop}>
                  {/* Palette Header with Discreet / Vivid Tabs */}
                  {!presets && (
                    <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-100">
                      <span className="text-[11px] font-bold text-slate-700 tracking-tight">
                        {activeTab === "discreet" ? labels.title : labels.vivid}
                      </span>
                      <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-[10px] font-medium text-slate-500">
                        <button
                          type="button"
                          onClick={() => setActiveTab("discreet")}
                          className={cn(
                            "px-2 py-0.5 rounded-md transition-all cursor-pointer",
                            activeTab === "discreet"
                              ? "bg-white text-slate-900 shadow-xs font-bold"
                              : "hover:text-slate-800"
                          )}
                        >
                          {labels.discreet}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("vivid")}
                          className={cn(
                            "px-2 py-0.5 rounded-md transition-all cursor-pointer",
                            activeTab === "vivid"
                              ? "bg-white text-slate-900 shadow-xs font-bold"
                              : "hover:text-slate-800"
                          )}
                        >
                          {labels.vivid}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-8 gap-1.5">
                    {displayedPresets.map((preset) => {
                      const hex = normalizeHex(preset);
                      if (!hex) return null;
                      const selected = hex === current;
                      return (
                        <button
                          key={hex}
                          type="button"
                          aria-pressed={selected}
                          title={hex.toUpperCase()}
                          onClick={() => pickPreset(hex)}
                          className={cn(
                            "flex aspect-square w-full items-center justify-center rounded-full shadow-xs cursor-pointer transition-transform duration-150 hover:scale-120 active:scale-90 border border-black/5 ring-1 ring-black/5",
                            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c29b62] focus-visible:ring-offset-1",
                            selected && "scale-115 ring-2 ring-slate-800 ring-offset-1 z-10 shadow-sm"
                          )}
                          style={{ backgroundColor: hex }}
                        >
                          {selected && (
                            <Check
                              className={cn(
                                "h-3 w-3 animate-in zoom-in-50 duration-150",
                                prefersDarkInk(hex) ? "text-slate-900" : "text-white"
                              )}
                              strokeWidth={3.5}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2.5">
                    <span
                      className="h-8 w-8 shrink-0 rounded-lg border border-black/10 shadow-xs transition-colors duration-150"
                      style={{ backgroundColor: current }}
                    />
                    <label className="flex h-8 min-w-0 flex-1 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 transition-all duration-150 focus-within:border-[#c29b62] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#c29b62]/20">
                      <span className="select-none font-mono text-xs font-bold text-slate-400">#</span>
                      <input
                        type="text"
                        value={hexDraft}
                        maxLength={7}
                        spellCheck={false}
                        aria-label={labels.hex}
                        onFocus={(e) => {
                          setHexFocused(true);
                          e.target.select();
                        }}
                        onBlur={() => {
                          setHexFocused(false);
                          setHexDraft(current.slice(1));
                        }}
                        onChange={(e) => {
                          const next = e.target.value.replace(/[^0-9a-f#]/gi, "").replace(/#/g, "");
                          setHexDraft(next);
                          if (next.length === 6) commit(next);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commit(hexDraft);
                            setIsOpen(false);
                            triggerRef.current?.focus();
                          }
                        }}
                        className="w-full min-w-0 bg-transparent pl-0.5 font-mono text-xs font-bold uppercase text-slate-700 focus:outline-none"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={openNativePicker}
                      className="relative flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700 cursor-pointer transition-all duration-150 hover:border-[#c29b62] hover:bg-[#c29b62]/10 hover:text-slate-900 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c29b62]/40"
                      title={labels.custom}
                    >
                      <Pipette className="h-3.5 w-3.5 text-[#c29b62]" />
                      <span>{labels.custom}</span>
                      {/* The browser's own picker anchors to this input, so it sits under the button. */}
                      <input
                        ref={nativeRef}
                        type="color"
                        tabIndex={-1}
                        aria-hidden="true"
                        value={current}
                        onChange={(e) => commit(e.target.value)}
                        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
                      />
                    </button>
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

export default ColorPicker;
