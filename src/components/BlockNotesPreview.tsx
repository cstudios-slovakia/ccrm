import React from "react";
import { CheckSquare, ChevronRight, Square, Terminal } from "lucide-react";
import { cn } from "../utils/cn";
import { sanitizeRichHtml } from "../utils/safeHtml";
import { getBannerStyles, type EditorBlock } from "../utils/blockNotes";
import { BlockBannerIcon } from "./BlockEditor";

interface BlockNotesPreviewProps {
  blocks: EditorBlock[];
  className?: string;
}

/**
 * Compact read-only renderer for rich `EditorBlock[]` descriptions inside
 * popovers (such as `<TaskDescriptionMark>`) and preview panels.
 */
export const BlockNotesPreview: React.FC<BlockNotesPreviewProps> = ({ blocks, className = "" }) => {
  if (!blocks || blocks.length === 0) return null;

  let numCount = 0;

  return (
    <div className={cn("space-y-1.5 text-left", className)}>
      {blocks.map((block) => {
        if (block.type === "number") numCount += 1;
        const numberIndex = numCount;
        const bannerInfo = block.type === "banner" ? getBannerStyles(block) : null;
        const html = sanitizeRichHtml(block.content || "", "block");
        const toggleHtml = block.toggleContent ? sanitizeRichHtml(block.toggleContent, "block") : "";

        return (
          <div
            key={block.id}
            className="flex items-start gap-2 min-w-0"
            style={{ textAlign: block.align || "left" }}
          >
            {block.type === "todo" && (
              <span className="pt-0.5 shrink-0 text-slate-600">
                {block.checked ? (
                  <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Square className="h-3.5 w-3.5 text-slate-400" />
                )}
              </span>
            )}
            {block.type === "bullet" && (
              <span className="pt-2 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-700 block" />
              </span>
            )}
            {block.type === "number" && (
              <span className="text-caption font-bold text-slate-400 shrink-0 min-w-4 text-right">
                {numberIndex}.
              </span>
            )}
            {block.type === "toggle" && (
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 mt-0.5 text-slate-400 shrink-0 transition-transform",
                  block.toggled && "rotate-90",
                )}
              />
            )}
            {block.type === "banner" && bannerInfo && (
              <span className="pt-1.5 shrink-0">
                <BlockBannerIcon color={bannerInfo.color} variant={bannerInfo.variant} className="h-4 w-4" />
              </span>
            )}
            {block.type === "code" && (
              <Terminal className="h-3.5 w-3.5 mt-1 text-slate-400 shrink-0" />
            )}
            {block.type === "quote" && (
              <div className="w-0.5 self-stretch bg-indigo-500 rounded-full shrink-0" />
            )}

            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  "break-words leading-snug",
                  block.type === "paragraph" && "text-ui text-slate-700",
                  block.type === "h1" && "text-body font-heading font-extrabold text-slate-900",
                  block.type === "h2" && "text-ui font-heading font-bold text-slate-900",
                  block.type === "h3" && "text-ui font-heading font-bold text-slate-800",
                  block.type === "h4" && "text-caption font-heading font-bold text-slate-800",
                  block.type === "todo" && cn("text-ui text-slate-700", block.checked && "line-through text-slate-400"),
                  block.type === "bullet" && "text-ui text-slate-700",
                  block.type === "number" && "text-ui text-slate-700",
                  block.type === "toggle" && "text-ui font-semibold text-slate-800",
                  block.type === "banner" && bannerInfo && cn("text-caption font-semibold p-2 rounded-lg border", bannerInfo.classes),
                  block.type === "code" && "font-mono text-caption bg-slate-900 text-slate-200 p-2 rounded-lg whitespace-pre overflow-x-auto",
                  block.type === "quote" && "italic pl-2 py-0.5 text-ui text-slate-600 bg-slate-50 rounded-r-md",
                  block.type === "pullquote" && "text-center py-1.5 px-2 text-ui font-heading font-bold text-slate-700 italic border-y border-slate-100",
                )}
                dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }}
              />
              {block.type === "toggle" && block.toggled && toggleHtml && (
                <div
                  className="pl-2.5 border-l border-slate-200 mt-1 text-caption text-slate-600 break-words"
                  dangerouslySetInnerHTML={{ __html: toggleHtml }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
