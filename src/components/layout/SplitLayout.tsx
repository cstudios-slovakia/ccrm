import type { ReactNode } from "react";

/**
 * Panes. Stacked below `ws-lg`; `nav` or `aside` becomes a left column from
 * `ws-lg`; `rail` is a third column from `ws-2xl` (below that, render the rail's
 * content yourself inside `children`). Widths are in spacing units, so they
 * scale with the view size (docs/VIEW-SIZE.md §6.2).
 *
 * Class names are written out in full: Tailwind cannot see names built at runtime.
 */
export const SplitLayout = ({
  nav,
  aside,
  rail,
  children,
  className = "",
}: {
  nav?: ReactNode;
  aside?: ReactNode;
  rail?: ReactNode;
  children: ReactNode;
  className?: string;
}) => {
  const left = nav ?? aside;
  let cols = "";
  if (nav && rail) cols = "ws-lg:grid-cols-[--spacing(64)_minmax(0,1fr)] ws-2xl:grid-cols-[--spacing(64)_minmax(0,1fr)_--spacing(88)]";
  else if (nav) cols = "ws-lg:grid-cols-[--spacing(64)_minmax(0,1fr)]";
  else if (aside && rail) cols = "ws-lg:grid-cols-[--spacing(104)_minmax(0,1fr)] ws-2xl:grid-cols-[--spacing(104)_minmax(0,1fr)_--spacing(88)]";
  else if (aside) cols = "ws-lg:grid-cols-[--spacing(104)_minmax(0,1fr)]";
  else if (rail) cols = "ws-2xl:grid-cols-[minmax(0,1fr)_--spacing(88)]";

  return (
    <div className={`grid grid-cols-1 items-start gap-6 ${cols} ${className}`}>
      {left && (
        <div className="min-w-0 ws-lg:sticky ws-lg:top-0 ws-lg:self-start ws-lg:max-h-[calc(100dvh-8rem)] ws-lg:overflow-auto">
          {left}
        </div>
      )}
      <div className="min-w-0">{children}</div>
      {rail && <div className="hidden min-w-0 ws-2xl:sticky ws-2xl:top-0 ws-2xl:block ws-2xl:self-start">{rail}</div>}
    </div>
  );
};
