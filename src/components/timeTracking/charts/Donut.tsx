import type { ReactNode } from "react";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  /** CSS colour of the slice and its legend dot (a project colour, a primary tint). */
  color: string;
  /** Right-hand legend text; defaults to the share in percent. */
  valueLabel?: string;
}

/**
 * Donut with the total in the middle and a legend (colour dot, name, share). Plain SVG, no
 * dependencies. Slices beyond `maxSlices` are folded into one "other" slice. The legend doubles as
 * the text alternative, so the SVG itself is a labelled image.
 */
export function Donut({
  slices,
  centerValue,
  centerLabel,
  ariaLabel,
  otherLabel,
  emptyLabel,
  maxSlices = 6,
  className = "",
}: {
  slices: readonly DonutSlice[];
  centerValue: ReactNode;
  centerLabel?: ReactNode;
  ariaLabel: string;
  otherLabel: string;
  emptyLabel: string;
  maxSlices?: number;
  className?: string;
}) {
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const shown = sorted.length > maxSlices ? sorted.slice(0, maxSlices - 1) : sorted;
  const rest = sorted.slice(shown.length);
  const parts: DonutSlice[] = rest.length ? [...shown, { key: "__other", label: otherLabel, value: rest.reduce((s, r) => s + r.value, 0), color: "#94a3b8" }] : shown;
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return <p className={`py-8 text-center text-ui text-slate-400 ${className}`}>{emptyLabel}</p>;

  const R = 40;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className={`flex flex-wrap items-center gap-x-6 gap-y-4 ${className}`}>
      <div className="relative size-40 shrink-0">
        <svg role="img" aria-label={ariaLabel} viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth="14" className="stroke-slate-100" />
          {parts.map((p) => {
            const len = (p.value / total) * C;
            const el = (
              <circle key={p.key} cx="50" cy="50" r={R} fill="none" stroke={p.color} strokeWidth="14" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}>
                <title>{`${p.label}: ${Math.round((p.value / total) * 100)} %`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="type-card-title tabular-nums text-slate-900">{centerValue}</span>
          {centerLabel && <span className="type-meta text-slate-500">{centerLabel}</span>}
        </div>
      </div>
      <ul className="grid min-w-40 flex-1 gap-1.5">
        {parts.map((p) => (
          <li key={p.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-ui">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="truncate text-slate-700" title={p.label}>{p.label}</span>
            <span className="tabular-nums font-semibold text-slate-900">{p.valueLabel ?? `${Math.round((p.value / total) * 100)} %`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
