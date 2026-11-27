import React from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cx } from "../../lib/tremorUtils";

export const badgeVariants = tv({
  base: cx(
    "inline-flex items-center gap-x-1 whitespace-nowrap rounded-md px-2 py-0.5 text-caption font-medium ring-1 ring-inset"
  ),
  variants: {
    variant: {
      default: ["bg-entity-subtle text-entity-text ring-entity-border"],
      entity: ["bg-entity-subtle text-entity-text ring-entity-border"],
      neutral: ["bg-gray-50 text-gray-800 ring-gray-300/60"],
      success: ["bg-emerald-50 text-emerald-800 ring-emerald-600/25"],
      error: ["bg-red-50 text-red-800 ring-red-600/25"],
      warning: ["bg-amber-50 text-amber-800 ring-amber-600/25"],
      indigo: ["bg-indigo-50 text-indigo-800 ring-indigo-600/25"],
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface BadgeProps
  extends React.ComponentPropsWithoutRef<"span">,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, forwardedRef) => {
    return (
      <span
        ref={forwardedRef}
        className={cx(badgeVariants({ variant }), className)}
        tremor-id="tremor-raw"
        {...props}
      />
    );
  }
);

Badge.displayName = "Badge";

export { Badge };
