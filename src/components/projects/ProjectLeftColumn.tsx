import React from "react";

/**
 * Left column of the project detail: the project card, its attributes and the paired client card.
 *
 * In the full-page view the column is as tall as its content and the page scrolls, exactly like the lead
 * detail: nothing in it scrolls on its own, so the last card is always whole. In the drawer (`isSidebar`)
 * the drawer's own body scrolls, so the column is a plain block there.
 */
export const ProjectLeftColumn: React.FC<{ isSidebar: boolean; children: React.ReactNode }> = ({ isSidebar, children }) => {
  if (isSidebar) return <div className="space-y-4 text-left">{children}</div>;
  return <div className="ws-lg:col-span-4 flex flex-col gap-4 text-left">{children}</div>;
};
