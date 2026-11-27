import React from "react";
import { cx } from "../../lib/tremorUtils";
import { Badge } from "./Badge";
import { Card } from "./Card";

export interface KpiCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: React.ReactNode;
  deltaType?: "positive" | "negative" | "neutral";
  icon?: React.ReactNode;
  accentTop?: boolean;
  className?: string;
}

export function KpiCard({
  label,
  value,
  delta,
  deltaType = "neutral",
  icon,
  accentTop = false,
  className,
}: KpiCardProps) {
  const badgeVariant =
    deltaType === "positive"
      ? "success"
      : deltaType === "negative"
        ? "error"
        : "neutral";

  return (
    <Card accentTop={accentTop} className={cx("p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-overline text-gray-500 truncate">{label}</p>
          <p className="type-metric mt-1.5 text-gray-900 truncate">{value}</p>
        </div>
        {icon && (
          <div className="shrink-0 rounded-md border border-entity-border bg-entity-subtle p-2 text-entity-text [&>svg]:size-5">
            {icon}
          </div>
        )}
      </div>
      {delta && (
        <div className="mt-2.5 flex items-center gap-2">
          <Badge variant={badgeVariant}>{delta}</Badge>
        </div>
      )}
    </Card>
  );
}
