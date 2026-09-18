/**
 * The pieces every dashboard card is built from.
 *
 * The Dashboard is the one screen where a dozen unrelated widgets sit side by
 * side, so the chrome has to be identical across all of them or the grid reads
 * as a pile of cards rather than one panel: the same 24px radius and hairline,
 * the same 28px section chip, the same 11px uppercase heading, the same right
 * hand slot for a toggle or a "see all" link, the same footer rule.
 *
 * Colours configured by an administrator (pipeline phases, lead sources, task
 * states) arrive as hex strings, so they are painted through `liftAccent` —
 * see src/utils/accentColor.ts for why a raw hex cannot be read in dark mode.
 */

import React from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "../../utils/cn";
import { liftAccent } from "../../utils/accentColor";

export type Translate = (en: string, sk: string, hu: string) => string;

/* ------------------------------------------------------------------ chrome */

export const WidgetCard: React.FC<{
  icon: any;
  accent: string;
  title: string;
  /** Toggles and links that live on the right of the heading. */
  actions?: React.ReactNode;
  /** A table pins its own footer to the bottom, so it manages its padding. */
  flush?: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, accent, title, actions, flush, children, className }) => (
  <div
    className={cn(
      "h-full bg-white border border-slate-200 rounded-3xl shadow-sm box-border flex flex-col",
      flush ? "px-[22px] pt-5 pb-3 gap-3.5" : "px-[22px] py-5 gap-[18px]",
      className
    )}
  >
    <div className="flex items-center justify-between gap-3 h-7 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: accent }}
        >
          <Icon className="h-4 w-4 text-white" strokeWidth={2.25} />
        </span>
        <h2 className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 truncate">
          {title}
        </h2>
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
    {children}
  </div>
);

/** The small pill switch used for "Newest / Highest value", "Mine / Whole team". */
export const SegmentedToggle: React.FC<{
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  /** Bigger variant used inside the settings drawer. */
  large?: boolean;
}> = ({ options, value, onChange, large }) => (
  <div
    role="group"
    className={cn(
      "flex items-center gap-0.5 p-[3px] rounded-[10px] bg-slate-100 box-border",
      large ? "h-[34px]" : "h-7"
    )}
  >
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(option.value)}
          className={cn(
            "px-2.5 rounded-lg border-0 text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer",
            large ? "h-7" : "h-[22px]",
            active ? "bg-white shadow-sm text-indigo-600" : "bg-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

/** "See all →" / "Open →". A plain link so it is keyboard reachable. */
export const MoreLink: React.FC<{ label: string; onClick?: () => void; href?: string }> = ({
  label,
  onClick,
  href
}) => (
  <a
    href={href ?? "#"}
    onClick={(e) => {
      if (!onClick) return;
      e.preventDefault();
      onClick();
    }}
    className="flex items-center gap-1 h-7 px-2 rounded-lg text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-colors"
  >
    {label}
    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
  </a>
);

/* ------------------------------------------------------------------ badges */

/**
 * A pipeline phase or task state: the configured colour at 10% for the fill,
 * 25% for the hairline, and lifted for the label.
 */
export const StatusBadge: React.FC<{ label: string; color: string }> = ({ label, color }) => (
  <span
    className="inline-flex items-center gap-1 h-6 px-2 rounded-lg border text-[10px] font-extrabold uppercase tracking-[0.06em] whitespace-nowrap"
    style={{
      backgroundColor: `${color}1a`,
      borderColor: `${color}40`,
      color: liftAccent(color)
    }}
  >
    {label}
  </span>
);

/** A person: a dot in their colour, their name, on a faint indigo chip. */
export const PersonPill: React.FC<{ name: string; color?: string }> = ({ name, color = "#6366f1" }) => (
  <span className="inline-flex items-center gap-1.5 h-6 max-w-full px-2 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold">
    <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ backgroundColor: color }} />
    <span className="truncate">{name}</span>
  </span>
);

/** A big figure. `tnum` keeps columns of numbers from dancing as they update. */
export const BigNumber: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className
}) => (
  <div
    className={cn("text-[34px] font-bold tracking-[-0.02em] leading-[1.05] text-slate-900", className)}
    style={{ fontVariantNumeric: "tabular-nums" }}
  >
    {children}
  </div>
);

/** The hairline-topped strip under a table: count on the left, total on the right. */
/**
 * How many rows a table body shows: at least `min`, and as many more as fit
 * when the card is stretched taller by its neighbours in the grid.
 *
 * Spread `bodyProps` on the body's outer element and put the rows in an
 * absolutely positioned layer inside it (`FILL_ROWS_LAYER`), so the rows never
 * push the card taller themselves: the card's height comes from `min` (or less,
 * when there is less data than that) and from the grid row, and rows fill it.
 */
export const useFillRows = (min: number, available: number, rowHeight: number) => {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [fit, setFit] = React.useState(min);

  React.useLayoutEffect(() => {
    if (!node) return;
    const measure = () => setFit(Math.floor(node.clientHeight / rowHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, rowHeight]);

  return {
    count: Math.min(available, Math.max(min, fit)),
    bodyProps: {
      ref: setNode,
      className: "relative flex-1 overflow-hidden",
      style: { minHeight: Math.min(min, available) * rowHeight }
    }
  };
};

export const FILL_ROWS_LAYER = "absolute inset-x-0 top-0 flex flex-col";

export const CardFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center justify-between border-t border-slate-100 px-3 pt-3 pb-1 shrink-0">
    {children}
  </div>
);

/** A proportional strip — one segment per status, widths from the counts. */
export const SegmentBar: React.FC<{
  segments: { key: string; value: number; color: string; label?: string }[];
  thickness?: number;
}> = ({ segments, thickness = 6 }) => {
  const live = segments.filter((s) => s.value > 0);
  if (live.length === 0) {
    return <span className="block rounded-full bg-slate-100" style={{ height: thickness }} />;
  }
  return (
    <div className="flex gap-[2px] rounded-full overflow-hidden" style={{ height: thickness }}>
      {live.map((segment) => (
        <span
          key={segment.key}
          title={segment.label}
          className="h-full"
          style={{ flexGrow: segment.value, backgroundColor: segment.color }}
        />
      ))}
    </div>
  );
};

/* ----------------------------------------------------------------- helpers */

/** Up to two initials for the avatar disc; falls back to a dash, never blank. */
export const initialsOf = (name: string): string => {
  const parts = String(name || "")
    .replace(/[^\p{L}\p{N}\s—-]/gu, " ")
    .split(/[\s—-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

/** The configured colour for a status, case- and separator-insensitively. */
export const colorForStatus = (
  status: any,
  colors: Record<string, string> | null | undefined,
  fallback = "#64748b"
): string => {
  if (!colors) return fallback;
  const key = String(status ?? "").trim().toLowerCase();
  if (!key) return fallback;
  const direct = colors[key];
  if (direct) return direct;
  const hit = Object.keys(colors).find((k) => k.toLowerCase() === key);
  return hit ? colors[hit] : fallback;
};

/** The label as configured (the app stores statuses lowercased, lists keep casing). */
export const labelForStatus = (status: any, known: string[]): string => {
  const raw = String(status ?? "").trim();
  if (!raw) return "—";
  return known.find((s) => s.toLowerCase() === raw.toLowerCase()) ?? raw;
};

export const EmptyWidgetRows: React.FC<{ t: Translate }> = ({ t }) => (
  <div className="flex-1 flex items-center justify-center py-6 text-xs text-slate-400 font-semibold uppercase tracking-wider">
    {t("No records found", "Žiadne záznamy", "Nincs találat")}
  </div>
);
