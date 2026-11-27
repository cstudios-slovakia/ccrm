import React from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cx } from "../../../lib/tremorUtils";

export const progressCircleVariants = tv({
  slots: {
    background: "stroke-entity-muted",
    circle: "stroke-entity",
  },
  variants: {
    variant: {
      default: {
        background: "stroke-entity-muted",
        circle: "stroke-entity",
      },
      neutral: {
        background: "stroke-gray-200",
        circle: "stroke-gray-600",
      },
      warning: {
        background: "stroke-amber-200",
        circle: "stroke-amber-500",
      },
      error: {
        background: "stroke-red-200",
        circle: "stroke-red-500",
      },
      success: {
        background: "stroke-emerald-200",
        circle: "stroke-emerald-500",
      },
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface ProgressCircleProps
  extends Omit<React.SVGProps<SVGSVGElement>, "value">,
    VariantProps<typeof progressCircleVariants> {
  value?: number;
  max?: number;
  showAnimation?: boolean;
  radius?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}

const ProgressCircle = React.forwardRef<SVGSVGElement, ProgressCircleProps>(
  (
    {
      value = 0,
      max = 100,
      radius = 32,
      strokeWidth = 6,
      showAnimation = true,
      variant,
      className,
      children,
      ...props
    },
    forwardedRef
  ) => {
    const safeValue = Math.min(max, Math.max(value, 0));
    const normalizedRadius = radius - strokeWidth / 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (safeValue / max) * circumference;
    const { background, circle } = progressCircleVariants({ variant });

    return (
      <div className="relative inline-flex items-center justify-center" tremor-id="tremor-raw">
        <svg
          ref={forwardedRef}
          width={radius * 2}
          height={radius * 2}
          viewBox={`0 0 ${radius * 2} ${radius * 2}`}
          className={cx("-rotate-90 transform", className)}
          role="progressbar"
          aria-valuenow={safeValue}
          aria-valuemin={0}
          aria-valuemax={max}
          {...props}
        >
          <circle
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            strokeWidth={strokeWidth}
            fill="transparent"
            className={cx("transition-colors ease-linear", background())}
          />
          {safeValue >= 0 ? (
            <circle
              r={normalizedRadius}
              cx={radius}
              cy={radius}
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              fill="transparent"
              strokeLinecap="round"
              className={cx(
                circle(),
                showAnimation && "transform-gpu transition-all duration-300 ease-in-out"
              )}
            />
          ) : null}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      </div>
    );
  }
);

ProgressCircle.displayName = "ProgressCircle";

export { ProgressCircle };
