import React from "react";
import {
  Area,
  Bar,
  Line,
  AreaChart as RechartsAreaChart,
  BarChart as RechartsBarChart,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
} from "recharts";
import {
  AvailableChartColors,
  type AvailableChartColorsKeys,
  constructCategoryColors,
  getColorClassName,
} from "../../../lib/chartUtils";
import { cx } from "../../../lib/tremorUtils";

interface BaseSparkProps extends React.HTMLAttributes<HTMLDivElement> {
  data: Record<string, any>[];
  categories: string[];
  index: string;
  colors?: AvailableChartColorsKeys[];
}

export const SparkAreaChart = React.forwardRef<HTMLDivElement, BaseSparkProps>(
  ({ data = [], categories = [], colors = AvailableChartColors, className, ...other }, ref) => {
    const categoryColors = constructCategoryColors(categories, colors);
    const sparkId = React.useId();
    return (
      <div ref={ref} className={cx("h-10 w-28", className)} {...other}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsAreaChart data={data}>
            {categories.map((cat, idx) => {
              const color = categoryColors.get(cat) ?? "entity";
              const gradId = `${sparkId}-${idx}`;
              return (
                <React.Fragment key={cat}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1" className={getColorClassName(color, "text")}>
                      <stop offset="5%" stopColor="currentColor" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey={cat}
                    stroke=""
                    strokeWidth={1.75}
                    fill={`url(#${gradId})`}
                    className={getColorClassName(color, "stroke")}
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
SparkAreaChart.displayName = "SparkAreaChart";

export const SparkLineChart = React.forwardRef<HTMLDivElement, BaseSparkProps>(
  ({ data = [], categories = [], colors = AvailableChartColors, className, ...other }, ref) => {
    const categoryColors = constructCategoryColors(categories, colors);
    return (
      <div ref={ref} className={cx("h-10 w-28", className)} {...other}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsLineChart data={data}>
            {categories.map((cat) => {
              const color = categoryColors.get(cat) ?? "entity";
              return (
                <Line
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  stroke=""
                  strokeWidth={1.75}
                  dot={false}
                  className={getColorClassName(color, "stroke")}
                  isAnimationActive={false}
                />
              );
            })}
          </RechartsLineChart>
        </ResponsiveContainer>
      </div>
    );
  }
);
SparkLineChart.displayName = "SparkLineChart";

export const SparkBarChart = React.forwardRef<HTMLDivElement, BaseSparkProps>(
  ({ data = [], categories = [], colors = AvailableChartColors, className, ...other }, ref) => {
    const categoryColors = constructCategoryColors(categories, colors);
    return (
      <div ref={ref} className={cx("h-10 w-28", className)} {...other}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart data={data}>
            {categories.map((cat) => {
              const color = categoryColors.get(cat) ?? "entity";
              return (
                <Bar
                  key={cat}
                  dataKey={cat}
                  radius={[2, 2, 0, 0]}
                  className={getColorClassName(color, "fill")}
                  isAnimationActive={false}
                />
              );
            })}
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    );
  }
);
SparkBarChart.displayName = "SparkBarChart";
