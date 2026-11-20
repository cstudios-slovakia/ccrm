import type { ReactNode } from "react";

/** One horizontal bar: label, a track filled to `ratio` (0-1) in `color`, and the value on the right. */
export function BarRow({
  label,
  ratio,
  color,
  value,
  className = "",
}: {
  label: ReactNode;
  ratio: number;
  color?: string;
  value: ReactNode;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 ${className}`}>
      <div className="min-w-0">
        <div className="truncate text-ui text-slate-800">{label}</div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <div className={`h-full rounded-full transition-[width] duration-500 ${color ? "" : "bg-primary"}`} style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      </div>
      <div className="tabular-nums text-ui font-semibold text-slate-900">{value}</div>
    </div>
  );
}
