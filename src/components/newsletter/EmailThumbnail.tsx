import { useEffect, useMemo, useRef, useState } from "react";
import { sampleMergeValues, substituteMergeTags } from "./builder";

/**
 * A scaled-down, non-interactive view of rendered e-mail HTML (a sandboxed iframe with no scripts).
 * The frame is laid out at `frameWidth` and shrunk to the width of its box.
 */
export const EmailThumbnail = ({
  html,
  frameWidth = 700,
  height = 280,
  label,
  sampleMerge,
}: {
  html: string;
  frameWidth?: number;
  height?: number;
  label: string;
  sampleMerge?: Record<string, string>;
}) => {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const apply = () => setScale(Math.min(1, el.clientWidth / frameWidth) || 0.5);
    apply();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [frameWidth]);
  const srcDoc = useMemo(() => substituteMergeTags(html, sampleMerge ?? sampleMergeValues(), { context: "html", mode: "preview" }), [html, sampleMerge]);
  return (
    <div ref={box} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100" style={{ height }} role="img" aria-label={label}>
      <iframe
        title={label}
        sandbox=""
        srcDoc={srcDoc}
        tabIndex={-1}
        className="pointer-events-none absolute left-0 top-0 border-0 bg-white"
        style={{ width: frameWidth, height: height / scale, transform: `scale(${scale})`, transformOrigin: "top left" }}
      />
    </div>
  );
};
