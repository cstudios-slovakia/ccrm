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
  suffix,
  progress,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  /** Second line under the value ("of 12 decided offers", "+8 %"). */
  delta?: ReactNode;
  icon?: ReactNode;
  /** With a tone (e.g. "bg-blue-50 text-blue-600") the icon sits in a tinted box on the left. */
  tone?: string;
  /** Small text on the value's line ("/ 40:00", "79 %"); only on the plain tile. */
  suffix?: ReactNode;
  /** A thin bar under the tile, 0-100; only on the plain tile. */
  progress?: { value: number; tone?: "primary" | "emerald"; label?: string };
  className?: string;
}) =>
  tone ? (
    <div className={`flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-xs transition-all hover:shadow-sm ${className}`}>
      <div className={`shrink-0 rounded-md p-2.5 [&>svg]:size-5 ${tone}`}>{icon}</div>
      <div className="min-w-0">
        <div className="type-overline text-gray-500">{label}</div>
        <div className="type-metric mt-0.5 truncate text-gray-900 tabular-nums">{value}</div>
        {delta && <div className="type-meta text-gray-500">{delta}</div>}
      </div>
    </div>
  ) : (
    <div className={`rounded-lg border border-gray-200 border-t-2 border-t-entity-solid bg-white p-4 shadow-xs ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="type-overline text-gray-500">{label}</span>
        {icon && (
          <span className="rounded-md bg-entity-subtle p-1.5 text-entity-text [&>svg]:size-4">{icon}</span>
        )}
      </div>
      <div className={`type-metric mt-2 text-gray-900 tabular-nums ${suffix ? "flex items-baseline gap-1.5" : ""}`}>
        {value}
        {suffix}
      </div>
      {progress && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label={progress.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.value)}>
          <div className={`h-full rounded-full ${progress.tone === "emerald" ? "bg-emerald-500" : "bg-entity-solid"}`} style={{ width: `${Math.max(0, Math.min(100, progress.value))}%` }} />
        </div>
      )}
      {delta && <div className="type-meta mt-1 text-gray-500">{delta}</div>}
    </div>
  );
