import type { ReactNode } from "react";

/** Vertical rhythm for a routed view. No max-width: the workspace fills the screen (docs/VIEW-SIZE.md §6.4). */
export const Page = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`flex flex-col gap-6 pb-16 font-sans animate-fade-in ${className}`}>{children}</div>
);
