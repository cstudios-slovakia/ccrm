import React from "react";
import { AlertTriangle, CheckCircle2, Info, Lightbulb, MapPin, Wrench } from "lucide-react";
import { splitListItems, type UpdateBlock, type UpdateLanguage } from "../utils/updateNotes";
import { ZoomableUpdateImage } from "./ZoomableUpdateImage";

interface UpdateNoteBlocksProps {
  blocks: UpdateBlock[] | undefined;
  /** Fancybox group: every image of one article pages through together. */
  group: string;
  language: UpdateLanguage;
}

const PROSE = "prose prose-slate max-w-none text-body text-slate-600 leading-relaxed font-sans ck-content";

const CALLOUTS: Record<string, { icon: React.ElementType; box: string; accent: string; label: [string, string, string] }> = {
  where: { icon: MapPin, box: "bg-indigo-50/70 border-indigo-100", accent: "text-indigo-600", label: ["Where to find it", "Kde to nájdete", "Hol található"] },
  tip: { icon: Lightbulb, box: "bg-emerald-50/70 border-emerald-100", accent: "text-emerald-600", label: ["Tip", "Tip", "Tipp"] },
  info: { icon: Info, box: "bg-sky-50/70 border-sky-100", accent: "text-sky-600", label: ["Good to know", "Dobré vedieť", "Jó tudni"] },
  warning: { icon: AlertTriangle, box: "bg-amber-50/80 border-amber-200", accent: "text-amber-600", label: ["Heads up", "Pozor", "Figyelem"] },
};

/**
 * Renders a release note's Craft `contentMatrix`. Shared by the Updates page
 * (inside the workspace) and the header modal (outside it), so layout switches
 * on a local container rather than on `ws-*` or viewport breakpoints.
 */
export const UpdateNoteBlocks: React.FC<UpdateNoteBlocksProps> = ({ blocks, group, language }) => {
  const t = (en: string, sk: string, hu: string) => (language === "sk" ? sk : language === "hu" ? hu : en);
  const openLabel = t("Open full size", "Otvoriť v plnej veľkosti", "Megnyitás teljes méretben");
  const fallbackAlt = t("Update Image", "Obrázok novinky", "Frissítés képe");

  return (
    <div className="@container/note space-y-6">
      {blocks?.map((block, idx) => {
        switch (block.__typename) {
          case "textblock_Entry":
            return block.text?.html ? (
              <div key={idx} className={PROSE} dangerouslySetInnerHTML={{ __html: block.text.html }} />
            ) : null;

          case "image_Entry": {
            const img = block.image?.[0];
            if (!img) return null;
            return (
              <ZoomableUpdateImage
                key={idx}
                src={img.url}
                alt={img.title || fallbackAlt}
                caption={img.title}
                group={group}
                openLabel={openLabel}
                className="border border-slate-200/80 shadow-md"
                imageClassName="h-auto max-h-120"
              />
            );
          }

          case "imageWithText_Entry": {
            const img = block.image?.[0];
            const isRight = block.imageDirection === true || /^(right|on)$/i.test(String(block.imageDirection ?? ""));
            return (
              <div key={idx} className={`flex flex-col @2xl/note:flex-row gap-6 items-center ${isRight ? "@2xl/note:flex-row-reverse" : ""}`}>
                {img && (
                  <div className="w-full @2xl/note:w-1/2 rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm shrink-0">
                    <ZoomableUpdateImage
                      src={img.url}
                      alt={img.title || fallbackAlt}
                      caption={img.title}
                      group={group}
                      openLabel={openLabel}
                      imageClassName="h-auto max-h-80"
                    />
                  </div>
                )}
                <div className="flex-1">
                  {block.text?.html && <div className={PROSE} dangerouslySetInnerHTML={{ __html: block.text.html }} />}
                </div>
              </div>
            );
          }

          case "heading_Entry": {
            if (!block.headingText) return null;
            const isSub = block.headingLevel === "h3";
            const Tag = isSub ? "h4" : "h3";
            return (
              <div key={idx} className={`flex flex-wrap items-center gap-2.5 ${isSub ? "pt-2" : "pt-4 border-t border-slate-100"}`}>
                <Tag className={`font-heading font-extrabold text-slate-800 ${isSub ? "text-title-sm" : "text-title"}`}>
                  {block.headingText}
                </Tag>
                {block.moduleTag && (
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 type-overline">
                    {block.moduleTag}
                  </span>
                )}
              </div>
            );
          }

          case "gallery_Entry": {
            const images = (block.images ?? []).filter((img) => img?.url);
            if (images.length === 0) return null;
            const cols = block.galleryColumns === "3" ? "@xl/note:grid-cols-2 @3xl/note:grid-cols-3" : "@xl/note:grid-cols-2";
            return (
              <div key={idx} className={`grid grid-cols-1 ${cols} gap-4`}>
                {images.map((img, i) => (
                  <figure key={i} className="flex flex-col gap-2">
                    <ZoomableUpdateImage
                      src={img.url}
                      alt={img.title || fallbackAlt}
                      caption={img.title}
                      group={group}
                      openLabel={openLabel}
                      className="border border-slate-200/80 shadow-sm"
                      imageClassName="h-auto max-h-72"
                    />
                    {img.title && <figcaption className="text-caption text-slate-500 px-1">{img.title}</figcaption>}
                  </figure>
                ))}
              </div>
            );
          }

          case "callout_Entry": {
            if (!block.text?.html) return null;
            const style = CALLOUTS[block.calloutType ?? ""] ?? CALLOUTS.info;
            const Icon = style.icon;
            return (
              <div key={idx} className={`flex gap-3 rounded-2xl border p-4 ${style.box}`}>
                <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${style.accent}`} aria-hidden="true" />
                <div className="min-w-0">
                  <div className={`type-overline ${style.accent}`}>{t(...style.label)}</div>
                  <div className={`${PROSE} mt-1`} dangerouslySetInnerHTML={{ __html: block.text.html }} />
                </div>
              </div>
            );
          }

          case "changeList_Entry": {
            const items = splitListItems(block.listItems);
            if (items.length === 0) return null;
            const isFixes = block.listType !== "improvements";
            const Icon = isFixes ? Wrench : CheckCircle2;
            return (
              <div key={idx} className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-5">
                <h4 className="font-heading font-extrabold text-title-sm text-slate-800 mb-3">
                  {block.headingText ||
                    (isFixes
                      ? t("Bug fixes", "Opravené chyby", "Javított hibák")
                      : t("Improvements", "Vylepšenia", "Fejlesztések"))}
                </h4>
                <ul className="space-y-2">
                  {items.map((item, i) => (
                    <li key={i} className="flex gap-2.5 text-body text-slate-600 leading-relaxed">
                      <Icon className={`h-4 w-4 shrink-0 mt-1 ${isFixes ? "text-emerald-500" : "text-indigo-500"}`} aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          }

          default:
            return null;
        }
      })}
    </div>
  );
};
