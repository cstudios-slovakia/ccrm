import type { ReactNode } from "react";

/**
 * Search · filters · view switch · primary action. Filter selects size to
 * their content and never truncate (docs/VIEW-SIZE.md §6.2). The search takes
 * the remaining width.
 */
export const Toolbar = ({
  search,
  filters,
  trailing,
  primary,
  className = "",
}: {
  search?: ReactNode;
  filters?: ReactNode;
  /** View switch, sort, archive toggle… */
  trailing?: ReactNode;
  primary?: ReactNode;
  className?: string;
}) => (
  <div className={`flex flex-wrap items-center gap-3 ${className}`}>
    {search && <div className="flex-1 min-w-60">{search}</div>}
    {filters && (
      <div className="flex flex-wrap items-center gap-2 [&_select]:w-auto [&_select]:whitespace-nowrap">{filters}</div>
    )}
    {trailing}
    {primary && <div className="ml-auto">{primary}</div>}
  </div>
);
