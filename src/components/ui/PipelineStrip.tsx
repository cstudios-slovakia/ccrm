import { useEffect, useMemo, useRef, useState } from "react";
import { typePx, useViewSize } from "../../utils/viewSize";
import { collapsePipeline, PIPELINE_MAX_SEGMENTS, type PipelineStripSegment } from "./pipelineCollapse";

export type { PipelineStripSegment } from "./pipelineCollapse";

/*
  ── PIPELINE STRIP ──────────────────────────────────────

  A 4px progress bar of chevron segments that opens to 24px on hover and shows
  each step's label. Used by the lead drawer and the project detail; the leads
  list rows draw a lighter copy (LeadPipelineRowStrip) that skips measuring.

  Too many steps fold around the current one (see pipelineCollapse): always
  past PIPELINE_MAX_SEGMENTS, and also when the labels would not fit at the
  view size's smallest type.

  The strip is edge-to-edge by design: the caller hands it the negative margins
  that cancel its container's padding.
*/

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

export const pipelineClipPath = (index: number, count: number): string => {
  if (count <= 1) return "none";
  if (index === 0) return "polygon(0% 0%, calc(100% - 4px) 0%, 100% 50%, calc(100% - 4px) 100%, 0% 100%)";
  if (index === count - 1) return "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 4px 50%)";
  return "polygon(0% 0%, calc(100% - 4px) 0%, 100% 50%, calc(100% - 4px) 100%, 0% 100%, 4px 50%)";
};

interface Fit {
  /** Folded around the current step. */
  collapsed: boolean;
  fontSize: number;
  weights: number[];
}

export function PipelineStrip({ segments, className = "" }: PipelineStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const [hovered, setHovered] = useState(false);
  const { size: viewSize, scale } = useViewSize();
  const [fit, setFit] = useState<Fit>(() => ({
    collapsed: segments.length > PIPELINE_MAX_SEGMENTS,
    fontSize: typePx("micro"),
    weights: [],
  }));

  // Re-fit only when what folding and sizing depend on changes, not on every
  // new segments array. Newline-joined: the labels themselves contain spaces.
  const shapeKey = segments.map((s) => `${s.title}\u0001${s.current ? 1 : 0}${s.filled ? 1 : 0}`).join("\n");

  // Pick the largest font size at which every label fits, and give each
  // segment a flex-grow weight from its own label width — equal widths would
  // peg the whole strip to the longest label.
  useEffect(() => {
    const el = stripRef.current;
    if (!el || segmentsRef.current.length === 0) return;

    const measure = () => {
      const containerWidth = el.clientWidth;
      if (!containerWidth) return;
      const canvas = canvasRef.current ?? (canvasRef.current = document.createElement("canvas"));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.font = `900 ${REF_SIZE}px ui-sans-serif, system-ui, -apple-system, sans-serif`;

      // The unclamped size at which every label fits, and the weights for it.
      const fitFor = (titles: string[]) => {
        const textWidths = titles.map((title) => ctx.measureText(title.toUpperCase()).width * TRACKING);
        if (textWidths.some((w) => !w)) return null;
        const weights = textWidths.map((w) => w + CHROME * 2);
        const weightTotal = weights.reduce((a, b) => a + b, 0);
        const usable = containerWidth - (titles.length - 1);
        let ratio = Infinity;
        weights.forEach((weight, i) => {
          const segWidth = (usable * weight) / weightTotal - CHROME;
          ratio = Math.min(ratio, Math.max(segWidth, 1) / textWidths[i]);
        });
        return { size: REF_SIZE * ratio, weights };
      };

      const all = segmentsRef.current;
      const full = fitFor(all.map((s) => s.title));
      if (!full) return;
      const folded = collapsePipeline(all, 0);
      const collapsed =
        folded !== all && (all.length > PIPELINE_MAX_SEGMENTS || full.size < typePx("micro"));
      const chosen = collapsed ? fitFor(folded.map((s) => s.title)) : full;
      if (!chosen) return;

      // Largest size is the ui role, smallest the micro role: never below the view size's floor.
      const fontSize = Math.min(typePx("ui"), Math.max(typePx("micro"), chosen.size));
      const { weights } = chosen;
      setFit((prev) =>
        prev.collapsed === collapsed &&
        prev.fontSize === fontSize &&
        prev.weights.length === weights.length &&
        prev.weights.every((w, i) => w === weights[i])
          ? prev
          : { collapsed, fontSize, weights },
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shapeKey, viewSize]);

  const shown = useMemo(
    () => (fit.collapsed ? collapsePipeline(segments, 0) : segments),
    [segments, fit.collapsed],
  );

  return (
    <div
      ref={stripRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`flex items-center gap-0.25 select-none bg-slate-200 transition-[height] duration-300 ease-out overflow-hidden shrink-0 ${className}`}
      style={{ height: `${(hovered ? 24 : 4) * scale}px` }}
    >
      {shown.map((seg, index) => (
        <div
          key={seg.key}
          className={`h-full flex items-center justify-center transition-colors duration-300 ${seg.colorClass}`}
          style={{
            // Falls back to equal shares before the first measurement lands.
            flexGrow: fit.weights[index] ?? 1,
            flexShrink: 1,
            flexBasis: 0,
            minWidth: 0,
            clipPath: pipelineClipPath(index, shown.length),
            ...(seg.color ? { backgroundColor: seg.color } : null),
          }}
          title={seg.tooltip}
        >
          {hovered && (
            <span
              className={`font-bold uppercase tracking-wider px-1 truncate ${seg.filled ? "text-white" : "text-slate-700"}`}
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
