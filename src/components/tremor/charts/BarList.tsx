import React from "react";
import { cx } from "../../../lib/tremorUtils";

export interface BarListItem<T = unknown> {
  key?: string;
  value: number;
  name: string;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  href?: string;
  color?: string;
  data?: T;
}

export interface BarListProps<T = unknown> extends React.HTMLAttributes<HTMLDivElement> {
  data: BarListItem<T>[];
  valueFormatter?: (value: number) => string;
  showAnimation?: boolean;
  onValueChange?: (payload: BarListItem<T>) => void;
  sortOrder?: "ascending" | "descending" | "none";
}

function BarListInner<T = unknown>(
  {
    data = [],
    valueFormatter = (value: number) => value.toString(),
    showAnimation = false,
    onValueChange,
    sortOrder = "descending",
    className,
    ...props
  }: BarListProps<T>,
  forwardedRef: React.ForwardedRef<HTMLDivElement>
) {
  const Component = onValueChange ? "button" : "div";

  const sortedData = React.useMemo(() => {
    if (sortOrder === "none") return data;
    return [...data].sort((a, b) =>
      sortOrder === "ascending" ? a.value - b.value : b.value - a.value
    );
  }, [data, sortOrder]);

  const maxValue = React.useMemo(
    () => Math.max(...sortedData.map((item) => item.value), 0),
    [sortedData]
  );

  const widths = React.useMemo(
    () => sortedData.map((item) => (maxValue > 0 ? Math.max((item.value / maxValue) * 100, item.value === 0 ? 0 : 2) : 0)),
    [sortedData, maxValue]
  );

  const rowHeight = "h-8";

  return (
    <div
      ref={forwardedRef}
      className={cx("flex justify-between space-x-6", className)}
      tremor-id="tremor-raw"
      {...props}
    >
      <div className="relative w-full space-y-1.5">
        {sortedData.map((item, index) => {
          const Icon = item.icon;
          return (
            <Component
              key={item.key ?? item.name}
              type={onValueChange ? "button" : undefined}
              onClick={() => onValueChange?.(item)}
              className={cx(
                "group w-full rounded-sm text-left",
                onValueChange && "cursor-pointer hover:bg-gray-50"
              )}
            >
              <div
                className={cx(
                  "flex items-center rounded-sm transition-all",
                  rowHeight,
                  !item.color && "bg-entity-muted",
                  showAnimation && "duration-500"
                )}
                style={{
                  width: `${widths[index]}%`,
                  ...(item.color ? { backgroundColor: `${item.color}26` } : null),
                }}
              >
                <div className="absolute left-2 flex max-w-full items-center gap-2 pr-2">
                  {Icon ? <Icon className="size-4 shrink-0 text-gray-600" aria-hidden="true" /> : null}
                  {item.href ? (
                    <a
                      href={item.href}
                      onClick={(e) => e.stopPropagation()}
                      className="truncate whitespace-nowrap text-body text-gray-900 hover:underline"
                    >
                      {item.name}
                    </a>
                  ) : (
                    <p className="truncate whitespace-nowrap text-body text-gray-900">
                      {item.name}
                    </p>
                  )}
                </div>
              </div>
            </Component>
          );
        })}
      </div>
      <div>
        {sortedData.map((item, index) => (
          <div
            key={item.key ?? item.name}
            className={cx(
              "flex items-center justify-end",
              rowHeight,
              index === sortedData.length - 1 ? "mb-0" : "mb-1.5"
            )}
          >
            <p className="truncate whitespace-nowrap text-body font-medium leading-none text-gray-900 tabular-nums">
              {valueFormatter(item.value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

const BarList = React.forwardRef(BarListInner) as <T>(
  p: BarListProps<T> & { ref?: React.ForwardedRef<HTMLDivElement> }
) => ReturnType<typeof BarListInner>;

export { BarList };
