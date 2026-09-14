import { useEffect, useRef, useState } from "react";

/*
  ── PIPELINE STRIP ──────────────────────────────────────

  A 4px progress bar of chevron segments that opens to 24px on hover and shows
  each step's label. Same look as the lead drawer's pipeline strip in
  LeadsDatagrid, which still carries its own inline copy.

  The strip is edge-to-edge by design: the caller hands it the negative margins
  that cancel its container's padding.
*/

export interface PipelineStripSegment {
  key: string;
  title: string;
  tooltip: string;
  /** Reached — lit in its colour with white text. */
  filled: boolean;
  /** Tailwind background class for the segment. */
  colorClass: string;
}

interface PipelineStripProps {
  segments: PipelineStripSegment[];
  className?: string;
}

// Measured at a reference size and scaled, so one pass sizes every label.
const REF_SIZE = 24;
// Canvas measurement ignores the `tracking-wider` letter-spacing the label
// renders with, so the estimate is padded to compensate.
const TRACKING = 1.12;
// Per-segment chrome: the px-1 padding plus the chevron notch on either side.
// Also added into the weight, so a short label keeps a sane share of the strip.
const CHROME = 9;

const clipPathFor = (index: number, count: number): string => {
  if (count <= 1) return "none";
  if (index === 0) return "polygon(0% 0%, calc(100% - 4px) 0%, 100% 50%, calc(100% - 4px) 100%, 0% 100%)";
  if (index === count - 1) return "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 4px 50%)";
  return "polygon(0% 0%, calc(100% - 4px) 0%, 100% 50%, calc(100% - 4px) 100%, 0% 100%, 4px 50%)";
};

export function PipelineStrip({ segments, className = "" }: PipelineStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [fit, setFit] = useState<{ fontSize: number; weights: number[] }>({ fontSize: 10, weights: [] });

  // Re-fit only when the labels change, not on every new segments array.
  // Newline-joined: the labels themselves contain spaces ("On Hold").
  const titlesKey = segments.map(s => s.title).join("\n");

  // Pick the largest font size at which every label fits, and give each
  // segment a flex-grow weight from its own label width — equal widths would
  // peg the whole strip to the longest label ("COMPLETED / CANCELLED").
  useEffect(() => {
    const el = stripRef.current;
    const titles = titlesKey ? titlesKey.split("\n") : [];
    if (!el || titles.length === 0) return;

    const measure = () => {
      const containerWidth = el.clientWidth;
      if (!containerWidth) return;
      const canvas = canvasRef.current ?? (canvasRef.current = document.createElement("canvas"));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.font = `900 ${REF_SIZE}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      const textWidths = titles.map(title => ctx.measureText(title.toUpperCase()).width * TRACKING);
      if (textWidths.some(w => !w)) return;

      const weights = textWidths.map(w => w + CHROME * 2);
      const weightTotal = weights.reduce((a, b) => a + b, 0);
      const usable = containerWidth - (titles.length - 1);

      let scale = Infinity;
      weights.forEach((weight, i) => {
        const segWidth = (usable * weight) / weightTotal - CHROME;
        scale = Math.min(scale, Math.max(segWidth, 1) / textWidths[i]);
      });

      const fontSize = Math.min(13, Math.max(6, REF_SIZE * scale));
      setFit(prev =>
        prev.fontSize === fontSize && prev.weights.length === weights.length && prev.weights.every((w, i) => w === weights[i])
          ? prev
          : { fontSize, weights },
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [titlesKey]);

  return (
    <div
      ref={stripRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`flex items-center gap-[1px] select-none bg-slate-200 transition-[height] duration-300 ease-out overflow-hidden shrink-0 ${className}`}
      style={{ height: hovered ? "24px" : "4px" }}
    >
      {segments.map((seg, index) => (
        <div
          key={seg.key}
          className={`h-full flex items-center justify-center transition-colors duration-300 ${seg.colorClass}`}
          style={{
            // Falls back to equal shares before the first measurement lands.
            flexGrow: fit.weights[index] ?? 1,
            flexShrink: 1,
            flexBasis: 0,
            minWidth: 0,
            clipPath: clipPathFor(index, segments.length),
          }}
          title={seg.tooltip}
        >
          {hovered && (
            <span
              className={`font-black uppercase tracking-wider px-1 truncate ${seg.filled ? "text-white" : "text-slate-700"}`}
              style={{
                fontSize: `${fit.fontSize}px`,
                // Room for the accents on uppercase Slovak/Hungarian labels.
                lineHeight: `${fit.fontSize + 4}px`,
              }}
            >
              {seg.title}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
