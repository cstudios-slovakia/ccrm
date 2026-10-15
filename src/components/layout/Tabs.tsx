import { useState, useRef, useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pin } from "lucide-react";

export interface TabItem<K extends string = string> {
  key: K;
  label: ReactNode;
  icon?: ReactNode;
  /** Count badge (`text-micro`). */
  count?: number;
  /** Free-form badge (e.g. a coloured amount), shown in place of `count`. */
  badge?: ReactNode;
  hidden?: boolean;
}

/** Lets the user pin the tab they are on as the one this bar opens with. */
export interface TabsDefaultPin<K extends string> {
  /** The tab currently pinned, or null when none is. */
  value: string | null;
  onChange: (key: K | null) => void;
  /** Tooltip while the active tab is not the pinned one. */
  setLabel: string;
  /** Tooltip while the active tab is the pinned one (clicking un-pins it). */
  clearLabel: string;
}

/**
 * The one tab style: a segmented pill row. Never wraps — it scrolls
 * horizontally with edge fades (docs/VIEW-SIZE.md §6.2).
 */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  className = "",
  testId,
  defaultPin,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
  testId?: string;
  defaultPin?: TabsDefaultPin<K>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    checkScroll();
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => checkScroll());
    observer.observe(el);
    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [value]);

  const scrollByAmount = (offset: number) => {
    containerRef.current?.scrollBy({ left: offset, behavior: "smooth" });
  };
  const pinned = !!defaultPin && defaultPin.value === value;
  return (
    <div className={`relative flex items-center w-full group ${className}`}>
      {/* Left Scroll Button / Fade */}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center pr-2 bg-gradient-to-r from-slate-50 via-slate-50/90 to-transparent rounded-l-2xl pointer-events-none">
          <button
            type="button"
            onClick={() => scrollByAmount(-140)}
            className="p-1 rounded-lg bg-white/95 hover:bg-white text-slate-600 hover:text-slate-900 shadow-xs border border-slate-200/80 cursor-pointer transition-all ml-0.5 pointer-events-auto"
            title="Scroll left"
            aria-label="Scroll tabs left"
          >
            <ChevronLeft className="size-3.5" />
          </button>
        </div>
      )}

      {/* Main Tablist Container */}
      <div
        ref={containerRef}
        role="tablist"
        data-testid={testId}
        onScroll={checkScroll}
        className="flex w-full items-center gap-1 overflow-x-auto no-scrollbar rounded-2xl border border-slate-200 bg-slate-50 p-1 scroll-smooth"
      >
        {items
          .filter((i) => !i.hidden)
          .map((i) => {
            const active = i.key === value;
            return (
              <button
                key={i.key}
                ref={active ? activeTabRef : undefined}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChange(i.key)}
                className={`h-9 shrink-0 whitespace-nowrap inline-flex items-center gap-2 rounded-xl px-3 text-ui font-semibold transition-all cursor-pointer active:scale-[0.98] ${
                  active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-white/60"
                }`}
              >
                {i.icon && <span className="[&>svg]:size-4 inline-flex">{i.icon}</span>}
                {i.label}
                {i.badge}
                {i.badge === undefined && i.count !== undefined && (
                  <span
                    className={`rounded-full px-1.5 text-micro font-semibold tabular-nums ${
                      active ? "bg-slate-100 text-slate-600" : "bg-slate-200/70 text-slate-500"
                    }`}
                  >
                    {i.count}
                  </span>
                )}
              </button>
            );
          })}
      {defaultPin && (
        <button
          type="button"
          data-testid="tabs-default-pin"
          aria-pressed={pinned}
          title={pinned ? defaultPin.clearLabel : defaultPin.setLabel}
          aria-label={pinned ? defaultPin.clearLabel : defaultPin.setLabel}
          onClick={() => defaultPin.onChange(pinned ? null : value)}
          className={`ml-auto sticky right-0 h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-xl transition-all cursor-pointer active:scale-[0.96] ${
            pinned ? "text-blue-600 bg-white shadow-sm" : "text-slate-400 hover:text-slate-700 hover:bg-white/60"
          }`}
        >
          <Pin className={`size-4 ${pinned ? "fill-current" : ""}`} />
        </button>
      )}
      </div>

      {/* Right Scroll Button / Fade */}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center pl-2 bg-gradient-to-l from-slate-50 via-slate-50/90 to-transparent rounded-r-2xl pointer-events-none">
          <button
            type="button"
            onClick={() => scrollByAmount(140)}
            className="p-1 rounded-lg bg-white/95 hover:bg-white text-slate-600 hover:text-slate-900 shadow-xs border border-slate-200/80 cursor-pointer transition-all mr-0.5 pointer-events-auto"
            title="Scroll right"
            aria-label="Scroll tabs right"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
