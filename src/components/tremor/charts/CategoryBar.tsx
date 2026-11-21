import React from "react";
import { type AvailableChartColorsKeys, getColorClassName } from "../../../lib/chartUtils";
import { cx } from "../../../lib/tremorUtils";
import { Tooltip } from "../Tooltip";

export interface CategoryBarProps extends React.HTMLAttributes<HTMLDivElement> {
  values: number[];
  colors?: AvailableChartColorsKeys[];
  marker?: { value: number; tooltip?: string; showAnimation?: boolean };
  showLabels?: boolean;
}

const CategoryBar = React.forwardRef<HTMLDivElement, CategoryBarProps>(
  (
    {
      values = [],
      colors = ["entity", "emerald", "amber", "violet", "gray"],
      marker,
      showLabels = true,
      className,
      ...props
    },
    forwardedRef
  ) => {
    const sumNumericArray = values.reduce((a, b) => a + b, 0);
    const markerPercent =
      marker && sumNumericArray > 0 ? Math.min(100, Math.max(0, (marker.value / sumNumericArray) * 100)) : undefined;

    let cumulative = 0;
    const labels = values.map((v) => {
      cumulative += v;
      return cumulative;
    });

    return (
      <div
        ref={forwardedRef}
        className={cx(className)}
        tremor-id="tremor-raw"
        {...props}
      >
        {showLabels && (
          <div className="relative mb-2 flex h-5 w-full text-ui font-medium text-gray-700 tabular-nums">
            <span className="text-left">0</span>
            {labels.slice(0, -1).map((val, idx) => {
              const pct = sumNumericArray > 0 ? (val / sumNumericArray) * 100 : 0;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-end pr-0.5"
                  style={{ width: `${sumNumericArray > 0 ? (values[idx] / sumNumericArray) * 100 : 0}%` }}
                >
                  {pct > 8 && pct < 92 ? <span>{val}</span> : null}
                </div>
              );
            })}
            <span className="ml-auto text-right">{sumNumericArray}</span>
          </div>
        )}
        <div className="relative flex h-2.5 w-full items-center">
          <div className="flex h-full flex-1 items-center gap-0.5 overflow-hidden rounded-full bg-gray-100">
            {values.map((value, idx) => {
              const widthPct = sumNumericArray > 0 ? (value / sumNumericArray) * 100 : 0;
              const colorKey = colors[idx % colors.length];
              return (
                <div
                  key={idx}
                  className={cx("h-full", getColorClassName(colorKey, "bg"), value === 0 && "hidden")}
                  style={{ width: `${widthPct}%` }}
                />
              );
            })}
          </div>
          {marker && markerPercent !== undefined && (
            <Tooltip content={marker.tooltip ?? `${marker.value}`}>
              <div
                className={cx(
                  "absolute -top-1 bottom-0 w-1 -translate-x-1/2 rounded-full ring-2 ring-white bg-gray-900",
                  marker.showAnimation && "transition-all duration-300"
                )}
                style={{ left: `${markerPercent}%` }}
              />
            </Tooltip>
          )}
        </div>
      </div>
    );
  }
);

CategoryBar.displayName = "CategoryBar";

export { CategoryBar };
