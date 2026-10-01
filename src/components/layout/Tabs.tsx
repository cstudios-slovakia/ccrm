import type { ReactNode } from "react";

export interface TabItem<K extends string = string> {
  key: K;
  label: ReactNode;
  icon?: ReactNode;
  /** Count badge (`text-micro`). */
  count?: number;
  hidden?: boolean;
}

/**
 * The one tab style: a segmented pill row. Never wraps — it scrolls
 * horizontally (docs/VIEW-SIZE.md §6.2).
 */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  className = "",
  testId,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      role="tablist"
      data-testid={testId}
      className={`flex w-full items-center gap-1 overflow-x-auto no-scrollbar rounded-2xl border border-slate-200 bg-slate-50 p-1 ${className}`}
    >
      {items
        .filter((i) => !i.hidden)
        .map((i) => {
          const active = i.key === value;
          return (
            <button
              key={i.key}
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
              {i.count !== undefined && (
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
    </div>
  );
}
