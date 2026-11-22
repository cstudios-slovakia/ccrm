import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

/**
 * Page header — title + subtitle left, actions right (docs/VIEW-SIZE.md §6.2).
 * Below `ws-md` the actions wrap under the title.
 */
export interface PageHeaderProps {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Status pill under the subtitle, e.g. the read-only notice. */
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export const PageHeader = ({ icon, title, subtitle, badge, actions, className = "" }: PageHeaderProps) => (
  <div
    className={`flex flex-col ws-md:flex-row ws-md:items-center ws-md:justify-between gap-4 border-b border-gray-200 pb-4 select-none ${className}`}
  >
    <div className="min-w-0 flex items-center gap-3">
      {icon && (
        <div className="size-10 shrink-0 rounded-lg border border-entity-border bg-entity-subtle text-entity-text flex items-center justify-center [&>svg]:size-5 shadow-2xs">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex flex-col">
        <h2 className="type-page-title text-gray-900 flex items-center gap-2">
          <span className="min-w-0">{title}</span>
        </h2>
        {subtitle && <p className="type-body text-gray-500 mt-0.5">{subtitle}</p>}
        {badge}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">{actions}</div>}
  </div>
);

/**
 * Entity variant for detail views: back button → avatar/icon → title, badges and
 * meta under the title, actions on the right. One row, never a button row above
 * the title.
 */
export interface EntityHeaderProps {
  onBack?: () => void;
  backLabel?: string;
  avatar?: ReactNode;
  title: ReactNode;
  badges?: ReactNode;
  meta?: ReactNode;
  primaryAction?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export const EntityHeader = ({
  onBack,
  backLabel = "Back",
  avatar,
  title,
  badges,
  meta,
  primaryAction,
  actions,
  className = "",
}: EntityHeaderProps) => (
  <div className={`flex flex-col ws-md:flex-row ws-md:items-center gap-4 border-b border-gray-200 pb-4 ${className}`}>
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          title={backLabel}
          aria-label={backLabel}
          className="size-9 shrink-0 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-2xs hover:text-gray-900 hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95 cursor-pointer"
        >
          <ArrowLeft className="size-4" />
        </button>
      )}
      {avatar && <div className="shrink-0">{avatar}</div>}
      <div className="min-w-0 flex-1">
        <h2 className="type-entity-title text-gray-900 truncate">{title}</h2>
        {(badges || meta) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {badges}
            {meta && <span className="type-meta text-gray-500">{meta}</span>}
          </div>
        )}
      </div>
    </div>
    {(primaryAction || actions) && (
      <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
        {actions}
        {primaryAction}
      </div>
    )}
  </div>
);
