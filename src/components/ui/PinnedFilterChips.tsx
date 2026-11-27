import React from "react";
import { Star } from "lucide-react";
import { readableOn } from "../../utils/accentColor";
import type { FacetOption } from "../../utils/facetedFilters";

interface Props {
  /** Every option of the filter; the pinned ones are drawn. */
  options: FacetOption[];
  pinned: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** More chips that are not options of this filter (the projects "Overdue" flag), drawn after a divider. */
  children?: React.ReactNode;
}

/**
 * The options a user pinned (star in the dropdown) as one-click toggle chips above a list.
 * A chip adds/removes its value in the same selection the dropdown edits. Alt/Cmd+click
 * shows that one alone.
 */
export const PinnedFilterChips: React.FC<Props> = ({ options, pinned, selected, onChange, children }) => {
  const chips = pinned.map((v) => options.find((o) => o.value === v)).filter((o): o is FacetOption => !!o);
  if (chips.length === 0 && !children) return null;
  return (
    <div className="w-full flex items-center gap-2 overflow-x-auto scrollbar-none flex-nowrap ws-sm:flex-wrap select-none pb-1 ws-sm:pb-0">
      {chips.map((o) => {
        const on = selected.includes(o.value);
        const faded = o.count === 0 && !on;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={(e) => {
              if (e.altKey || e.metaKey) onChange([o.value]);
              else onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value]);
            }}
            title={o.label}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border shadow-2xs transition-all cursor-pointer shrink-0 ${
              on
                ? o.color
                  ? ""
                  : "bg-slate-900 border-slate-900 text-white"
                : `bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 hover:bg-white ${faded ? "opacity-50" : "opacity-80 hover:opacity-100"}`
            }`}
            style={on && o.color ? { backgroundColor: o.color, borderColor: o.color, color: readableOn(o.color) } : undefined}
          >
            <Star className="h-3 w-3 shrink-0" fill="currentColor" style={{ opacity: on ? 0.8 : 0.45 }} />
            <span className={`font-heading font-bold text-title-sm leading-none tabular-nums ${on ? "" : "text-slate-400"}`}>{o.count}</span>
            <span className={`type-overline leading-none ${on ? "" : "text-slate-400"}`}>{o.label}</span>
          </button>
        );
      })}
      {children && (
        <>
          {chips.length > 0 && <span className="h-6 w-px bg-slate-200 mx-0.5 hidden ws-sm:block shrink-0" />}
          {children}
        </>
      )}
    </div>
  );
};

export default PinnedFilterChips;
