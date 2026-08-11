import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
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
  /** Inline style applied to the trigger button — for dynamic per-instance colors (e.g. status pipeline colors) that can't be expressed as Tailwind classes. */
  style?: React.CSSProperties;
}

function normalizeOptions(options: RawOption[]): DropdownOption[] {
  return options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
}

interface Coords {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  width: number;
  openUp: boolean;
}

const PANEL_MAX_HEIGHT = 260;

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
  style,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const opts = normalizeOptions(options);
  const selected = opts.find((o) => o.value === value);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < PANEL_MAX_HEIGHT && rect.top > spaceBelow;
    setCoords({
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
      left: align === "right" ? undefined : rect.left,
      right: align === "right" ? window.innerWidth - rect.right : undefined,
      width: rect.width,
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
    // Capture phase: some parents (e.g. draggable canvas cards) stopPropagation()
    // on mousedown during the bubble phase, which would otherwise hide this click.
    document.addEventListener("mousedown", handleClickOutside, true);
    return () => document.removeEventListener("mousedown", handleClickOutside, true);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const idx = opts.findIndex((o) => o.value === value);
      setHighlighted(idx >= 0 ? idx : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!isOpen && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setIsOpen(true);
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
      const opt = opts[highlighted];
      if (opt && !opt.disabled) {
        onChange(opt.value);
        close();
      }
    }
  };

  const sizeClasses = size === "sm" ? "px-2.5 py-1.5 text-xs gap-1" : "px-3.5 py-2.5 text-sm gap-1.5";

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((o) => !o)}
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
          <AnimatePresence>
            {isOpen && coords && (
              <motion.div
                ref={panelRef}
                role="listbox"
                initial={{ opacity: 0, scale: 0.97, y: coords.openUp ? 6 : -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: coords.openUp ? 4 : -4 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: "fixed",
                  top: coords.top,
                  bottom: coords.bottom,
                  left: coords.left,
                  right: coords.right,
                  minWidth: coords.width,
                  maxHeight: PANEL_MAX_HEIGHT,
                  transformOrigin: coords.openUp ? "bottom" : "top",
                }}
                className={`z-[1000] overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl ring-4 ring-slate-900/[0.03] ${panelClassName}`}
              >
                {opts.length === 0 && <div className="px-3.5 py-2.5 text-sm text-slate-400 italic">No options</div>}
                {opts.map((opt, i) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={opt.value === value}
                    disabled={opt.disabled}
                    onMouseEnter={() => setHighlighted(i)}
                    onClick={() => {
                      if (opt.disabled) return;
                      onChange(opt.value);
                      close();
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
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
};

export default CustomSelect;
