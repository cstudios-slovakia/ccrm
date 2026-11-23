export interface SegmentSeries {
  key: string;
  label: string;
  /** CSS colour of this segment and its legend dot. */
  color: string;
}

export interface SegmentBar {
  key: string;
  /** Axis label under the bar. */
  label: string;
  /** Full description for the tooltip and the screen-reader table. */
  title: string;
  /** Value per series key; a missing key is zero. */
  values: Record<string, number>;
}

/**
 * Stacked columns with any number of segments (one per person), plain SVG. A legend lists the
 * series; the values are in a `title` per bar and in a visually hidden table.
 */
export function SegmentBars({
  bars,
  series,
  ariaLabel,
  formatValue,
  emptyLabel,
  className = "",
}: {
  bars: readonly SegmentBar[];
  series: readonly SegmentSeries[];
  ariaLabel: string;
  formatValue: (value: number) => string;
  emptyLabel: string;
  className?: string;
}) {
  const sum = (bar: SegmentBar) => series.reduce((s, x) => s + (bar.values[x.key] ?? 0), 0);
  const max = Math.max(0, ...bars.map(sum));
  const n = bars.length;
  const H = 100;
  const gap = 0.3;
  return (
    <div className={className}>
      <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 type-meta text-gray-500">
        {series.map((x) => (
          <li key={x.key} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: x.color }} />
            {x.label}
          </li>
        ))}
      </ul>
      {n === 0 || max === 0 ? (
        <p className="py-8 text-center text-ui text-gray-400">{emptyLabel}</p>
      ) : (
        <>
          <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${n} ${H}`} preserveAspectRatio="none" className="h-40 w-full">
            <line x1="0" x2={n} y1={H} y2={H} className="stroke-gray-200" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
            {bars.map((bar, i) => {
              let y = H;
              return (
                <g key={bar.key}>
                  <title>{`${bar.title}: ${series.filter((x) => (bar.values[x.key] ?? 0) > 0).map((x) => `${x.label} ${formatValue(bar.values[x.key])}`).join(", ") || "0"}`}</title>
                  {series.map((x) => {
                    const h = ((bar.values[x.key] ?? 0) / max) * (H - 4);
                    if (h <= 0) return null;
                    y -= h;
                    return <rect key={x.key} x={i + gap / 2} y={y} width={1 - gap} height={h} fill={x.color} />;
                  })}
                </g>
              );
            })}
          </svg>
          <div className="mt-1 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden="true">
            {bars.map((bar) => (
              <span key={bar.key} className="truncate text-center type-meta tabular-nums text-gray-500">{bar.label}</span>
            ))}
          </div>
          <table className="sr-only">
            <caption>{ariaLabel}</caption>
            <thead>
              <tr>
                <th>{ariaLabel}</th>
                {series.map((x) => <th key={x.key}>{x.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {bars.map((bar) => (
                <tr key={bar.key}>
                  <td>{bar.title}</td>
                  {series.map((x) => <td key={x.key}>{formatValue(bar.values[x.key] ?? 0)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
