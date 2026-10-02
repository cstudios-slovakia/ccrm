import type { ReactNode } from "react";

/**
 * Card. `inset` is the second level (maximum two levels, docs/VIEW-SIZE.md §6.2).
 * Padding uses the workspace breakpoints, so it is for content inside <main>.
 */
export const Surface = ({
  children,
  tone = "card",
  padding = "md",
  className = "",
}: {
  children: ReactNode;
  tone?: "card" | "inset";
  padding?: "md" | "none";
  className?: string;
}) => {
  const base =
    tone === "inset" ? "rounded-2xl bg-slate-50" : "rounded-3xl bg-white border border-slate-200/80 shadow-sm";
  const pad = padding === "none" ? "" : tone === "inset" ? "p-3 ws-sm:p-4" : "p-4 ws-sm:p-6";
  return <div className={`${base} ${pad} ${className}`}>{children}</div>;
};
