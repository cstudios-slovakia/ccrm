import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../utils/cn";
import { MENU_EDIT_LAYER_ATTR } from "./primitives";

/**
 * Floating action menu of the edit mode (the "Menu položky" / "Menu skupiny"
 * artboards): white, 1px slate-200 border, 16px radius, slate-tinted shadow,
 * 6px padding, 36px rows.
 *
 * Rendered in a portal at the top of the stacking order and anchored to the
 * button that opened it. It closes on Escape, on a click outside it (except on
 * its anchor, which toggles it), on scroll of an ancestor and on window resize.
 * Arrow keys move between items; focus starts on the first one.
 */
export interface MenuPopoverProps {
  /** The ⋯ / + button the menu belongs to. `null` = closed. */
  anchor: HTMLElement | null;
  onClose: () => void;
  ariaLabel: string;
  /** Tailwind width class; 300px (`w-75`) is the design's item menu. */
  widthClass?: string;
  /** Horizontal alignment to the anchor: `start` = menu's left edge 8px left of the anchor's left. */
  align?: "start" | "end";
  children: React.ReactNode;
  className?: string;
  /** Focus the first item on open (default true). Turn off for menus that hold an input. */
  autoFocus?: boolean;
}

const GAP = 6;
const EDGE = 8;

export const MenuPopover: React.FC<MenuPopoverProps> = ({
  anchor,
  onClose,
  ariaLabel,
  widthClass = "w-75",
  align = "start",
  children,
  className,
  autoFocus = true,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const menu = ref.current;
      const w = menu?.offsetWidth ?? 300;
      const h = menu?.offsetHeight ?? 0;
      let left = align === "start" ? a.left - 8 : a.right - w + 8;
      left = Math.max(EDGE, Math.min(left, window.innerWidth - w - EDGE));
      let top = a.bottom + GAP;
      if (top + h > window.innerHeight - EDGE) {
        // Not enough room below: open upwards, else pin to the bottom edge.
        const above = a.top - GAP - h;
        top = above >= EDGE ? above : Math.max(EDGE, window.innerHeight - h - EDGE);
      }
      setPos({ left, top });
    };
    place();
    // Content height changes (a submenu expands) re-place the menu.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    if (ref.current && ro) ro.observe(ref.current);
    window.addEventListener("resize", place);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [anchor, align]);

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        anchor.focus();
      }
    };
    const onScroll = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor, onClose]);

  useEffect(() => {
    if (!anchor || !autoFocus) return;
    const id = requestAnimationFrame(() => {
      ref.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [anchor, autoFocus]);

  if (!anchor) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? []
    );
    if (items.length === 0) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return createPortal(
    <motion.div
      ref={ref}
      {...{ [MENU_EDIT_LAYER_ATTR]: "" }}
      role="menu"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => e.stopPropagation()}
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, transformOrigin: "top left" }}
      className={cn(
        "view-size-fixed z-[100050] bg-white border border-slate-200 rounded-2xl p-1.5 flex flex-col gap-px text-left",
        "shadow-[0_20px_25px_-5px_rgb(15_23_42/0.12),0_8px_10px_-6px_rgb(15_23_42/0.08)]",
        widthClass,
        className
      )}
    >
      {children}
    </motion.div>,
    document.body
  );
};

type ItemProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  label: React.ReactNode;
  /** Second, smaller line under the label (11px slate-500). */
  hint?: React.ReactNode;
  /** Right-aligned content: a <Kbd>, a value, a chevron. */
  trailing?: React.ReactNode;
  danger?: boolean;
};

/** One 36px menu row: 16px slate-500 icon, 12px medium label. */
export const MenuItem: React.FC<ItemProps> = ({ icon: Icon, label, hint, trailing, danger, className, disabled, ...rest }) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    className={cn(
      "w-full flex items-center gap-2.5 min-h-9 px-2.5 border-0 rounded-xl bg-transparent text-ui font-medium text-left cursor-pointer transition-colors duration-100 outline-none",
      "hover:bg-slate-50 focus-visible:bg-slate-50",
      danger ? "text-rose-700" : "text-slate-800",
      disabled && "opacity-40 cursor-default hover:bg-transparent",
      className
    )}
    {...rest}
  >
    {Icon && <Icon className={cn("size-4 shrink-0", danger ? "text-rose-600" : "text-slate-500")} aria-hidden="true" />}
    {hint ? (
      <span className="flex-1 min-w-0 flex flex-col py-1.5">
        <span>{label}</span>
        <span className="text-caption font-normal text-slate-500">{hint}</span>
      </span>
    ) : (
      <span className="flex-1 min-w-0 truncate">{label}</span>
    )}
    {trailing}
  </button>
);

/** Expanding row ("Presunúť do skupiny") whose radio list follows it inline. */
export const MenuSubToggle: React.FC<Omit<ItemProps, "trailing"> & { expanded: boolean }> = ({ expanded, className, ...rest }) => (
  <MenuItem
    {...rest}
    aria-expanded={expanded}
    className={cn(expanded && "bg-slate-50", className)}
    trailing={
      expanded ? (
        <ChevronUp className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
      ) : (
        <ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
      )
    }
  />
);

/** Indented 32px radio row of a submenu; the checked one is indigo with a check. */
export const MenuRadioItem: React.FC<
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { checked: boolean; label: React.ReactNode }
> = ({ checked, label, className, ...rest }) => (
  <button
    type="button"
    role="menuitemradio"
    aria-checked={checked}
    className={cn(
      "w-full flex items-center gap-2.5 min-h-8 pl-9 pr-2.5 border-0 rounded-xl bg-transparent text-ui text-left cursor-pointer transition-colors duration-100 outline-none hover:bg-slate-50 focus-visible:bg-slate-50",
      checked ? "text-indigo-700 font-semibold" : "text-slate-700",
      className
    )}
    {...rest}
  >
    <span className="flex-1 min-w-0 truncate">{label}</span>
    {checked && <Check className="size-4 shrink-0" aria-hidden="true" />}
  </button>
);

export const MenuDivider: React.FC = () => <div role="separator" className="h-px bg-slate-100 mx-1.5 my-1" />;
