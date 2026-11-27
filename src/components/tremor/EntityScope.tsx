import React from "react";
import { entityAccentStyle } from "../../utils/entityAccent";

export interface EntityScopeProps extends React.HTMLAttributes<HTMLElement> {
  /** SectionVisualId, entity alias (e.g. "lead", "project"), or hex color */
  entity?: string | null;
  /** Optional explicit hex override (for custom dashboards / unified entries) */
  color?: string;
  as?: "div" | "section" | "span";
  children: React.ReactNode;
}

/**
 * Sets `--entity-accent*` CSS variables on a subtree so buttons, active tabs,
 * focus rings, switches, row highlights, and KPI bars adopt the entity's accent color.
 */
export function EntityScope({
  entity,
  color,
  as = "div",
  style,
  children,
  ...props
}: EntityScopeProps) {
  const vars = entityAccentStyle(color || entity || "dashboard");
  const Component = as;
  return (
    <Component
      data-entity-scope={entity || undefined}
      style={{ ...(vars as React.CSSProperties), ...style }}
      {...props}
    >
      {children}
    </Component>
  );
}
