import React from "react";
import {
  Area,
  CartesianGrid,
  Label,
  AreaChart as RechartsAreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AvailableChartColors,
  type AvailableChartColorsKeys,
  constructCategoryColors,
  getColorClassName,
  getYAxisDomain,
} from "../../../lib/chartUtils";
import { cx } from "../../../lib/tremorUtils";
import { typePx, useViewSize } from "../../../utils/viewSize";

export interface AreaChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: Record<string, any>[];
  index: string;
  categories: string[];
  colors?: AvailableChartColorsKeys[];
  valueFormatter?: (value: number) => string;
  showLegend?: boolean;
  showGridLines?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
  showTooltip?: boolean;
  yAxisWidth?: number;
  xAxisLabel?: string;
  yAxisLabel?: string;
  autoMinValue?: boolean;
  minValue?: number;
  maxValue?: number;
  type?: "default" | "stacked" | "percent";
  fill?: "gradient" | "solid" | "none";
}

const AreaChart = React.forwardRef<HTMLDivElement, AreaChartProps>(
  (
    {
      data = [],
      categories = [],
      index,
      colors = AvailableChartColors,
      valueFormatter = (value: number) => value.toString(),
      showLegend = true,
      showGridLines = true,
      showXAxis = true,
      showYAxis = true,
      showTooltip = true,
      yAxisWidth = 56,
      xAxisLabel,
      yAxisLabel,
      autoMinValue = false,
      minValue,
      maxValue,
      type = "default",
      fill = "gradient",
      className,
      ...other
    },
    forwardedRef
  ) => {
    const { size: viewSize } = useViewSize();
    const axisFontPx = React.useMemo(() => typePx("caption"), [viewSize]);
    const categoryColors = constructCategoryColors(categories, colors);
    const yAxisDomain = getYAxisDomain(autoMinValue, minValue, maxValue);
    const stacked = type === "stacked" || type === "percent";
    const chartId = React.useId();

    return (
      <div
        ref={forwardedRef}
        className={cx("w-full h-72", className)}
        tremor-id="tremor-raw"
        {...other}
      >
        {showLegend && categories.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-end gap-4 text-caption text-gray-600">
            {categories.map((cat) => {
              const color = categoryColors.get(cat) ?? "gray";
              return (
                <div key={cat} className="inline-flex items-center gap-1.5">
                  <span className={cx("h-0.5 w-3 rounded-full shrink-0", getColorClassName(color, "bg"))} />
                  <span>{cat}</span>
                </div>
              );
            })}
          </div>
        )}
        <ResponsiveContainer width="100%" height={showLegend ? "88%" : "100%"}>
          <RechartsAreaChart
            data={data}
            stackOffset={type === "percent" ? "expand" : undefined}
            margin={{
              top: 4,
              right: 8,
              left: yAxisLabel ? 16 : 0,
              bottom: xAxisLabel ? 20 : 4,
            }}
          >
            {showGridLines && (
              <CartesianGrid className="stroke-gray-200 stroke-1" horizontal vertical={false} />
            )}
            <XAxis
              hide={!showXAxis}
              dataKey={index}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: axisFontPx, fill: "currentColor" }}
              className="text-gray-500"
            >
              {xAxisLabel && (
                <Label position="insideBottom" offset={-12} className="fill-gray-600 text-caption font-medium">
                  {xAxisLabel}
                </Label>
              )}
            </XAxis>
            <YAxis
              hide={!showYAxis}
              width={yAxisWidth}
              domain={yAxisDomain}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                type === "percent" ? `${Math.round(v * 100)}%` : valueFormatter(v)
              }
              tick={{ fontSize: axisFontPx, fill: "currentColor" }}
              className="text-gray-500"
            >
              {yAxisLabel && (
                <Label angle={-90} position="insideLeft" className="fill-gray-600 text-caption font-medium">
                  {yAxisLabel}
                </Label>
              )}
            </YAxis>
            {showTooltip && (
              <Tooltip
                content={({ active, payload, label: tipLabel }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-md border border-gray-200 bg-white text-ui shadow-md">
                      <div className="border-b border-gray-200 px-3 py-1.5 font-medium text-gray-900">
                        {String(tipLabel ?? "")}
                      </div>
                      <div className="space-y-1 px-3 py-2">
                        {payload.map((item) => {
                          const cat = String(item.dataKey ?? item.name ?? "");
                          const color = categoryColors.get(cat) ?? "gray";
                          return (
                            <div key={cat} className="flex items-center justify-between gap-6">
                              <span className="flex items-center gap-2 text-gray-600">
                                <span className={cx("h-0.5 w-2.5 rounded-full shrink-0", getColorClassName(color, "bg"))} />
                                {cat}
                              </span>
                              <span className="font-semibold text-gray-900 tabular-nums">
                                {valueFormatter(Number(item.value ?? 0))}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }}
              />
            )}
            {categories.map((category, idx) => {
              const color = categoryColors.get(category) ?? "gray";
              const gradId = `${chartId}-grad-${idx}`;
              return (
                <React.Fragment key={category}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1" className={getColorClassName(color, "text")}>
                      <stop offset="5%" stopColor="currentColor" stopOpacity={fill === "none" ? 0 : fill === "solid" ? 0.35 : 0.3} />
                      <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey={category}
                    name={category}
                    stackId={stacked ? "stack" : undefined}
                    stroke=""
                    strokeWidth={2}
                    fill={`url(#${gradId})`}
                    className={cx(getColorClassName(color, "stroke"))}
                    isAnimationActive={false}
                  />
                </React.Fragment>
              );
            })}
          </RechartsAreaChart>
        </ResponsiveContainer>
      </div>
    );
  }
);

AreaChart.displayName = "AreaChart";

export { AreaChart };
