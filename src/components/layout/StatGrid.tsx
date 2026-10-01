import type { ReactNode } from "react";

// Static class names only: Tailwind cannot see names built at runtime.
const COLS: Record<number, string> = {
  1: "ws-lg:grid-cols-1",
  2: "ws-lg:grid-cols-2",
  3: "ws-lg:grid-cols-3",
  4: "ws-lg:grid-cols-4",
  5: "ws-lg:grid-cols-5",
  6: "ws-lg:grid-cols-6",
};

/** KPI strip: two columns, every tile in one row from `ws-lg` (docs/VIEW-SIZE.md §6.2). */
export const StatGrid = ({ count, children, className = "" }: { count: number; children: ReactNode; className?: string }) => (
  <div className={`grid grid-cols-2 gap-4 ${COLS[Math.min(6, Math.max(1, count))]} ${className}`}>{children}</div>
);

export const StatTile = ({
  label,
  value,
  delta,
  icon,
  tone,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  /** Second line under the value ("of 12 decided offers", "+8 %"). */
  delta?: ReactNode;
  icon?: ReactNode;
  /** With a tone (e.g. "bg-blue-50 text-blue-600") the icon sits in a tinted box on the left. */
  tone?: string;
  className?: string;
}) =>
  tone ? (
    <div className={`flex items-center gap-4 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:shadow-md ${className}`}>
      <div className={`shrink-0 rounded-2xl p-3 [&>svg]:size-6 ${tone}`}>{icon}</div>
      <div className="min-w-0">
        <div className="type-overline text-slate-500">{label}</div>
        <div className="type-metric mt-0.5 truncate text-slate-900">{value}</div>
        {delta && <div className="type-meta text-slate-500">{delta}</div>}
      </div>
    </div>
  ) : (
    <div className={`rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="type-overline text-slate-500">{label}</span>
        {icon && <span className="text-slate-400 [&>svg]:size-5">{icon}</span>}
      </div>
      <div className="type-metric mt-2 text-slate-900">{value}</div>
      {delta && <div className="type-meta mt-1 text-slate-500">{delta}</div>}
    </div>
  );
