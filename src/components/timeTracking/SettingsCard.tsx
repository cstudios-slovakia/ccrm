import type { ReactNode } from "react";
import { Surface } from "../layout";

/** The canvas's Settings card: optional icon tile, title, one-line description, optional action on the right. */
export function SettingsCard({
  title,
  description,
  icon,
  action,
  children,
  className = "",
  titleTestId,
  testId,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  titleTestId?: string;
  testId?: string;
}) {
  return (
    <section data-testid={testId} className="min-w-0">
      <Surface className={`h-full space-y-4 ${className}`}>
        <div className="flex flex-wrap items-start gap-3">
          {icon && <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-entity-subtle text-entity-text">{icon}</span>}
          <div className="min-w-0 flex-1">
            <h3 data-testid={titleTestId} className="type-card-title text-gray-900">{title}</h3>
            {description && <p className="mt-0.5 text-body text-gray-500">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
        {children}
      </Surface>
    </section>
  );
}
