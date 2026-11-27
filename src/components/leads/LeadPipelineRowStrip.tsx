import { pipelineClipPath } from "../ui/PipelineStrip";
import { collapsePipeline, type PipelineStripSegment } from "../ui/pipelineCollapse";

/*
  The pipeline strip under a lead row in the leads list. Same segments and
  folding as the drawer's PipelineStrip, but no canvas measuring — the list
  renders one per row — so it folds by count only and gives every segment an
  equal share. The row's hover (CSS, `tr[data-lead-hover]`) opens it and shows
  the labels; see `.lead-hover-strip` in index.css.
*/
export function LeadPipelineRowStrip({ segments }: { segments: PipelineStripSegment[] }) {
  const shown = collapsePipeline(segments);
  return (
    <div className="lead-hover-strip flex items-center gap-0.25 select-none bg-slate-200 overflow-hidden">
      {shown.map((seg, index) => (
        <div
          key={seg.key}
          className={`flex-1 min-w-0 h-full flex items-center justify-center relative transition-all duration-300 ${seg.colorClass}`}
          style={{
            clipPath: pipelineClipPath(index, shown.length),
            ...(seg.color ? { backgroundColor: seg.color } : null),
          }}
          title={seg.tooltip}
        >
          <span
            className={`lead-hover-strip-label type-overline px-1 truncate ${seg.filled ? "text-white" : "text-slate-700"}`}
            style={{
              fontSize: "var(--text-micro)",
              // Room for the accents on uppercase Slovak/Hungarian labels (Ý, Á, Ô, Ő).
              lineHeight: "14px",
            }}
          >
            {seg.title}
          </span>
        </div>
      ))}
    </div>
  );
}
