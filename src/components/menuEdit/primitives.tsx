import React from "react";
import { Home } from "lucide-react";
import { cn } from "../../utils/cn";

/**
 * Small visual atoms of the menu edit mode, drawn exactly as in the design
 * ("Menu Edit Mode Redesign" canvas): the dotted grip, the ⋯ glyph, the count
 * chip, the 28px icon button and the "Start" home badge.
 *
 * Colours stay on the raw slate/indigo palette like the rest of the app.
 */

/** 10×15 dot grid (3 columns × 2 rows of dots); the drag affordance. */
export const Grip: React.FC<{ className?: string; active?: boolean; style?: React.CSSProperties }> = ({
  className,
  active,
  style,
}) => (
  <span
    aria-hidden="true"
    className={cn("inline-block shrink-0", className)}
    style={{
      width: 10,
      height: 15,
      backgroundImage: `radial-gradient(circle, ${active ? "#4f46e5" : "#94a3b8"} 1.2px, transparent 1.5px)`,
      backgroundSize: "5px 5px",
      ...style,
    }}
  />
);

/** Horizontal ⋯ drawn as three dots in currentColor (18×4). */
export const Dots: React.FC<{ className?: string }> = ({ className }) => (
  <span
    aria-hidden="true"
    className={cn("block", className)}
    style={{
      width: 18,
      height: 4,
      backgroundImage: "radial-gradient(circle, currentColor 1.5px, transparent 1.8px)",
      backgroundSize: "6px 4px",
    }}
  />
);

/** Rounded count pill next to a group title. */
export const CountChip: React.FC<{ count: number; className?: string }> = ({ count, className }) => (
  <span
    className={cn(
      "min-w-5 h-5 px-1.5 rounded-full bg-slate-200 text-slate-600 text-micro font-semibold inline-flex items-center justify-center tabular-nums shrink-0",
      className
    )}
  >
    {count}
  </span>
);

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Pressed/pinned look: indigo-50 fill, indigo-600 glyph. */
  on?: boolean;
  /** Menu open for this button: indigo-100 fill, indigo-700 glyph. */
  open?: boolean;
  /** 36px bordered variant used in the dialog header. */
  large?: boolean;
  /** 44px touch variant used on mobile. */
  touch?: boolean;
};

/** The 28px rounded-xl icon button (`.ib` in the design). */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ on, open, large, touch, className, children, type = "button", ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "p-0 inline-flex items-center justify-center shrink-0 cursor-pointer transition-[background-color,color,transform] duration-150 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
        touch ? "size-11 rounded-xl text-slate-500" : large ? "size-9 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" : "size-7 rounded-xl",
        !large && !touch && (open
          ? "bg-indigo-100 text-indigo-700"
          : on
            ? "bg-indigo-50 text-indigo-600 [&_svg]:fill-indigo-200 hover:bg-indigo-100"
            : "bg-transparent text-slate-400 hover:bg-slate-100 hover:text-slate-600"),
        touch && open && "bg-indigo-100 text-indigo-700",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
);
IconButton.displayName = "IconButton";

/** "ÚVODNÁ" pill shown next to the module that is the start screen. */
export const HomeBadge: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center gap-1 h-5 px-1.75 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 type-overline shrink-0">
    <Home className="size-3" aria-hidden="true" />
    {label}
  </span>
);

/** Keyboard shortcut hint inside a menu item. */
export const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-micro font-semibold text-slate-500 border border-slate-200 rounded-md px-1.25 py-px bg-slate-50 shrink-0">
    {children}
  </span>
);

/** Primary / secondary / danger buttons of the design (36px, rounded-xl, 12px semibold). */
export const editBtn = {
  base: "h-9 px-3 rounded-xl text-ui font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
  primary:
    "bg-indigo-600 text-white border border-indigo-600 shadow-[0_4px_6px_-1px_rgb(15_23_42/0.12),0_2px_4px_-2px_rgb(15_23_42/0.1)] hover:bg-indigo-700 hover:border-indigo-700",
  secondary: "bg-white text-slate-700 border border-slate-200 shadow-[0_1px_2px_rgb(15_23_42/0.05)] hover:bg-slate-50 hover:border-slate-300",
  danger: "bg-rose-600 text-white border border-rose-600 shadow-[0_4px_6px_-1px_rgb(15_23_42/0.12)] hover:bg-rose-700 hover:border-rose-700",
} as const;

/**
 * The marker every floating layer of the edit mode carries (menus, sheets,
 * dialogs, the drag ghost). Click-outside handlers of the Start menu and the
 * sidebar ignore targets inside it, so opening a menu never closes the editor.
 */
export const MENU_EDIT_LAYER_ATTR = "data-menu-edit-layer";
export const isInsideMenuEditLayer = (target: EventTarget | null): boolean =>
  target instanceof Element && !!target.closest(`[${MENU_EDIT_LAYER_ATTR}]`);
