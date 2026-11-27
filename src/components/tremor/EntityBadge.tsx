import React from "react";
import { cx } from "../../lib/tremorUtils";
import { entityAccentStyle, resolveSectionId } from "../../utils/entityAccent";
import { SectionIcon } from "../icons/SectionIcon";

export interface EntityBadgeProps {
  /** Target entity identifier (e.g. "clients", "project", "task", "leads", "tickets", "orders", "invoices") */
  entity: string;
  /** Custom hex override if target has a custom color */
  color?: string;
  label: React.ReactNode;
  href?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  size?: "sm" | "md";
  showIcon?: boolean;
  className?: string;
  title?: string;
  testId?: string;
}

/**
 * Cross-entity reference pill/link. Always renders in the TARGET entity's
 * canonical accent color, regardless of which entity view hosts it.
 */
export function EntityBadge({
  entity,
  color,
  label,
  href,
  onClick,
  size = "sm",
  showIcon = true,
  className,
  title,
  testId,
}: EntityBadgeProps) {
  const sectionId = resolveSectionId(entity) || "dashboard";
  const accentVars = entityAccentStyle(color || entity) as React.CSSProperties;

  const baseClasses = cx(
    "inline-flex items-center gap-1.5 rounded-md font-medium whitespace-nowrap border transition-colors",
    "bg-entity-subtle text-entity-text border-entity-border",
    size === "sm" ? "px-2 py-0.5 text-caption" : "px-2.5 py-1 text-ui",
    (href || onClick) && "hover:bg-entity-muted cursor-pointer",
    className
  );

  const iconEl = showIcon ? (
    <SectionIcon
      id={sectionId}
      className={size === "sm" ? "size-3 shrink-0" : "size-3.5 shrink-0"}
      color="var(--entity-accent-text)"
    />
  ) : null;

  if (href) {
    return (
      <a
        href={href}
        onClick={onClick}
        style={accentVars}
        className={baseClasses}
        title={title}
        data-testid={testId}
        data-entity-ref={sectionId}
      >
        {iconEl}
        <span className="truncate">{label}</span>
      </a>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={accentVars}
        className={baseClasses}
        title={title}
        data-testid={testId}
        data-entity-ref={sectionId}
      >
        {iconEl}
        <span className="truncate">{label}</span>
      </button>
    );
  }

  return (
    <span
      style={accentVars}
      className={baseClasses}
      title={title}
      data-testid={testId}
      data-entity-ref={sectionId}
    >
      {iconEl}
      <span className="truncate">{label}</span>
    </span>
  );
}

export const EntityLink = EntityBadge;
