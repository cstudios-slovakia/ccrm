import React from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cx } from "../../../lib/tremorUtils";

export const progressBarVariants = tv({
  slots: {
    background: "bg-gray-200",
    bar: "bg-entity-solid",
  },
  variants: {
    variant: {
      default: {
        background: "bg-entity-muted",
        bar: "bg-entity-solid",
      },
      neutral: {
        background: "bg-gray-200",
        bar: "bg-gray-600",
      },
      warning: {
        background: "bg-amber-100",
        bar: "bg-amber-500",
      },
      error: {
        background: "bg-red-100",
        bar: "bg-red-500",
      },
      success: {
        background: "bg-emerald-100",
        bar: "bg-emerald-500",
      },
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface ProgressBarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof progressBarVariants> {
  value?: number;
  max?: number;
  showAnimation?: boolean;
  label?: string;
}

const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      value = 0,
      max = 100,
      label,
      showAnimation = false,
      variant,
      className,
      ...props
    },
    forwardedRef
  ) => {
    const safeValue = Math.min(max, Math.max(value, 0));
    const { background, bar } = progressBarVariants({ variant });
    return (
      <div
        ref={forwardedRef}
        className={cx("flex w-full items-center", className)}
        role="progressbar"
        aria-valuenow={safeValue}
        aria-valuemin={0}
        aria-valuemax={max}
        tremor-id="tremor-raw"
        {...props}
      >
        <div className={cx("relative flex h-2 w-full items-center rounded-full", background())}>
          <div
            className={cx(
              "h-full flex-col rounded-full",
              bar(),
              showAnimation && "transform-gpu transition-all duration-300 ease-in-out"
            )}
            style={{
              width: max ? `${(safeValue / max) * 100}%` : "0%",
            }}
          />
        </div>
        {label ? (
          <span className="ml-2 whitespace-nowrap text-ui font-medium text-gray-900 tabular-nums">
            {label}
          </span>
        ) : null}
      </div>
    );
  }
);

ProgressBar.displayName = "ProgressBar";

export { ProgressBar };
