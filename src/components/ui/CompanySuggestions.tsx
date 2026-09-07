// The dropdown every register-backed input in the app shares.
//
// Render it as the last child of a `relative` wrapper around the input; it
// positions itself under the field, closes on a click elsewhere or on Escape,
// and marks each row with the register it came from so a company (OR SR) is
// told apart from a sole trader (ŽR SR) at a glance.

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { registerLabel, suggestionSubtitle, type CompanySuggestion } from "../../utils/companyRegistry";

interface CompanySuggestionsProps {
  suggestions: CompanySuggestion[];
  /** Usually `lookup.activeField === "<this field>"`. */
  visible: boolean;
  onSelect: (item: CompanySuggestion) => void;
  onDismiss: () => void;
  systemLanguage?: string | null;
}

export function CompanySuggestions({
  suggestions,
  visible,
  onSelect,
  onDismiss,
  systemLanguage,
}: CompanySuggestionsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const open = visible && suggestions.length > 0;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl border border-slate-200 shadow-xl max-h-60 overflow-y-auto z-[999] animate-fade-in"
    >
      {suggestions.map((item, idx) => {
        const badge = registerLabel(item.register, systemLanguage);
        return (
          <button
            key={`${item.source}-${item.id || item.companyId || idx}`}
            type="button"
            onClick={() => onSelect(item)}
            className="w-full px-4 py-3 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer border-b border-slate-100 last:border-0 text-left"
          >
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 text-[11px] truncate">{item.name}</span>
              {badge && (
                <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-1.5 py-0.5">
                  {badge}
                </span>
              )}
              {!item.active && (
                <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-rose-600 bg-rose-50 border border-rose-100 rounded-full px-1.5 py-0.5">
                  {systemLanguage === "sk" ? "Zrušená" : systemLanguage === "hu" ? "Megszűnt" : "Dissolved"}
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 truncate">{suggestionSubtitle(item)}</div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The spinner shown inside a register-backed input while the lookup runs. Place
 * it in the input's own `relative` wrapper; the input needs right padding
 * (`pr-9`) so the text does not run underneath it.
 */
export function CompanyLookupSpinner({ visible, className = "" }: { visible: boolean; className?: string }) {
  if (!visible) return null;
  return (
    <div className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${className}`}>
      <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
    </div>
  );
}
