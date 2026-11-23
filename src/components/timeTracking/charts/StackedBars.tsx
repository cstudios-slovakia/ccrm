export interface StackedBar {
  key: string;
  /** Axis label under the bar ("4"). */
  label: string;
  /** Full description for the tooltip and the screen-reader table ("4 May"). */
  title: string;
  /** Bottom segment (billable). */
  a: number;
  /** Top segment (non-billable). */
  b: number;
}

/**
 * Stacked columns, one per entry, drawn as plain SVG. `a` is the strong primary segment, `b` the
 * light tint on top. Both read in dark mode because they follow the theme's primary colour. Values
 * are in a `title` per bar and in a visually hidden table.
 */
export function StackedBars({
  bars,
  aLabel,
  bLabel,
  ariaLabel,
  formatValue,
  emptyLabel,
  className = "",
}: {
  bars: readonly StackedBar[];
  aLabel: string;
  bLabel: string;
  ariaLabel: string;
  formatValue: (value: number) => string;
  emptyLabel: string;
  className?: string;
}) {
  const max = Math.max(0, ...bars.map((b) => b.a + b.b));
  const n = bars.length;
  const labelEvery = Math.max(1, Math.ceil(n / 16));
  const H = 100;
  const gap = 0.3;
  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-end gap-3 type-meta text-gray-500">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-entity-solid" />{aLabel}</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-entity-solid/25" />{bLabel}</span>
      </div>
      {n === 0 || max === 0 ? (
        <p className="py-8 text-center text-ui text-gray-400">{emptyLabel}</p>
      ) : (
        <>
          <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${n} ${H}`} preserveAspectRatio="none" className="h-40 w-full">
            <line x1="0" x2={n} y1={H} y2={H} className="stroke-gray-200" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
            {bars.map((bar, i) => {
              const ha = (bar.a / max) * (H - 4);
              const hb = (bar.b / max) * (H - 4);
              return (
                <g key={bar.key}>
                  <title>{`${bar.title}: ${aLabel} ${formatValue(bar.a)}, ${bLabel} ${formatValue(bar.b)}`}</title>
                  <rect x={i + gap / 2} y={H - ha} width={1 - gap} height={ha} className="fill-entity-solid" />
                  <rect x={i + gap / 2} y={H - ha - hb} width={1 - gap} height={hb} className="fill-entity-solid/25" />
                </g>
              );
            })}
          </svg>
          <div className="mt-1 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden="true">
            {bars.map((bar, i) => (
              <span key={bar.key} className="text-center type-meta tabular-nums text-gray-500">
                {i % labelEvery === 0 ? bar.label : ""}
              </span>
            ))}
          </div>
          <table className="sr-only">
            <caption>{ariaLabel}</caption>
            <thead>
              <tr><th>{ariaLabel}</th><th>{aLabel}</th><th>{bLabel}</th></tr>
            </thead>
            <tbody>
              {bars.map((bar) => (
                <tr key={bar.key}><td>{bar.title}</td><td>{formatValue(bar.a)}</td><td>{formatValue(bar.b)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
