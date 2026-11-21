import React from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cx } from "../../lib/tremorUtils";

export const calloutVariants = tv({
  base: "flex flex-col overflow-hidden rounded-md p-4 text-body border",
  variants: {
    variant: {
      default: ["bg-entity-subtle text-entity-text border-entity-border"],
      success: ["bg-emerald-50 text-emerald-900 border-emerald-200"],
      error: ["bg-red-50 text-red-900 border-red-200"],
      warning: ["bg-amber-50 text-amber-900 border-amber-200"],
      neutral: ["bg-gray-50 text-gray-900 border-gray-200"],
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface CalloutProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title">,
    VariantProps<typeof calloutVariants> {
  title: React.ReactNode;
  icon?: React.ReactNode;
}

const Callout = React.forwardRef<HTMLDivElement, CalloutProps>(
  ({ title, icon, className, variant, children, ...props }, forwardedRef) => {
    return (
      <div
        ref={forwardedRef}
        className={cx(calloutVariants({ variant }), className)}
        tremor-id="tremor-raw"
        {...props}
      >
        <div className="flex items-start gap-2">
          {icon && <span className="shrink-0 mt-0.5 [&>svg]:size-5">{icon}</span>}
          <span className="font-semibold">{title}</span>
        </div>
        {children && (
          <div className="mt-1.5 overflow-y-auto text-ui leading-relaxed">
            {children}
          </div>
        )}
      </div>
    );
  }
);

Callout.displayName = "Callout";

export { Callout };
