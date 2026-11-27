import React from "react";
import { Pie, PieChart as ReChartsDonutChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  AvailableChartColors,
  type AvailableChartColorsKeys,
  constructCategoryColors,
  getColorClassName,
} from "../../../lib/chartUtils";
import { cx } from "../../../lib/tremorUtils";

type DonutChartVariant = "donut" | "pie";

export interface DonutChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: Record<string, any>[];
  category: string;
  value: string;
  colors?: AvailableChartColorsKeys[];
  variant?: DonutChartVariant;
  valueFormatter?: (value: number) => string;
  label?: string;
  showLabel?: boolean;
  showTooltip?: boolean;
  onValueChange?: (value: Record<string, any> | null) => void;
}

const DonutChart = React.forwardRef<HTMLDivElement, DonutChartProps>(
  (
    {
      data = [],
      value,
      category,
      colors = AvailableChartColors,
      variant = "donut",
      valueFormatter = (v: number) => v.toString(),
      label,
      showLabel = false,
      showTooltip = true,
      onValueChange,
      className,
      ...other
    },
    forwardedRef
  ) => {
    const [activeIndex, setActiveIndex] = React.useState<number | undefined>(undefined);
    const isDonut = variant === "donut";

    const categories = data.map((d) => String(d[category] ?? ""));
    const categoryColors = constructCategoryColors(categories, colors);

    const total = React.useMemo(
      () => data.reduce((sum, item) => sum + (Number(item[value]) || 0), 0),
      [data, value]
    );

    const parsedData = data.map((item, idx) => {
      const cat = String(item[category] ?? idx);
      const color = categoryColors.get(cat) ?? "gray";
      return {
        ...item,
        className: getColorClassName(color, "fill"),
        strokeClassName: getColorClassName(color, "stroke"),
      };
    });

    return (
      <div
        ref={forwardedRef}
        className={cx("h-40 w-40", className)}
        tremor-id="tremor-raw"
        {...other}
      >
        <ResponsiveContainer className="size-full">
          <ReChartsDonutChart>
            {isDonut && showLabel && (
              <text
                className="fill-gray-700 text-body font-semibold"
                x="50%"
                y="50%"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {label ?? valueFormatter(total)}
              </text>
            )}
            <Pie
              data={parsedData}
              cx="50%"
              cy="50%"
              startAngle={90}
              endAngle={-270}
              innerRadius={isDonut ? "75%" : "0%"}
              outerRadius="100%"
              stroke=""
              strokeLinejoin="round"
              dataKey={value}
              nameKey={category}
              isAnimationActive={false}
              onClick={(_, index) => {
                const nextIndex = activeIndex === index ? undefined : index;
                setActiveIndex(nextIndex);
                onValueChange?.(nextIndex !== undefined ? data[nextIndex] : null);
              }}
              style={{ outline: "none", cursor: onValueChange ? "pointer" : "default" }}
            />
            {showTooltip && (
              <Tooltip
                wrapperStyle={{ outline: "none", zIndex: 50 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const entry = payload[0];
                  const val = Number(entry.value ?? 0);
                  const catName = String(entry.name ?? "");
                  const colorKey = categoryColors.get(catName) ?? "gray";
                  return (
                    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-ui shadow-md">
                      <div className="flex items-center gap-2">
                        <span
                          className={cx("size-2.5 shrink-0 rounded-full", getColorClassName(colorKey, "bg"))}
                        />
                        <span className="text-gray-600">{catName}</span>
                        <span className="ml-auto font-semibold text-gray-900 tabular-nums">
                          {valueFormatter(val)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
            )}
          </ReChartsDonutChart>
        </ResponsiveContainer>
      </div>
    );
  }
);

DonutChart.displayName = "DonutChart";

export { DonutChart };
