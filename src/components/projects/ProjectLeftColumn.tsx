import React from "react";
import { ScrollFade } from "../settings/ScrollFade";

/**
 * Left column of the project detail: the project card, its attributes and the paired client card.
 *
 * In the full-page view the column is a fixed-height scroll box next to the Timeline / Gantt tabs. The global
 * scrollbar thumb is slate-100 at 60% on a gray-50 page, i.e. invisible, so the last card (the client
 * relationship card with its address row) looked cut off with no sign that it scrolls. It is therefore a
 * `ScrollFade`: no bar, but the content fades out on every edge that has more behind it, and the bottom
 * padding keeps the last card's border clear of the scroll edge. In the drawer (`isSidebar`) the drawer's
 * own body scrolls, so the column stays a plain block.
 */
export const ProjectLeftColumn: React.FC<{ isSidebar: boolean; children: React.ReactNode }> = ({ isSidebar, children }) => {
  if (isSidebar) return <div className="space-y-4 text-left">{children}</div>;
  return (
    <ScrollFade
      axis="y"
      className="ws-lg:col-span-4 flex flex-col h-auto ws-lg:h-full min-h-0 ws-lg:overflow-y-auto overflow-y-visible gap-4 ws-lg:pr-1 ws-lg:pb-4 text-left"
    >
      {children}
    </ScrollFade>
  );
};
