import type { ReactNode } from "react";

/** Centred in its pane: icon, title, one line of body, one action. */
export const EmptyState = ({
  icon,
  title,
  body,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) => (
  <div className={`mx-auto flex max-w-measure flex-col items-center gap-2 py-12 text-center ${className}`}>
    {icon && (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-gray-400 [&>svg]:size-8">{icon}</div>
    )}
    <div className="type-card-title text-gray-900">{title}</div>
    {body && <p className="type-body text-gray-500">{body}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);
