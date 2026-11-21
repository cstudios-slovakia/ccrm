import React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cx } from "../../lib/tremorUtils";

export interface CardProps extends React.ComponentPropsWithoutRef<"div"> {
  asChild?: boolean;
  /** Optional subtle top accent stripe in the active --entity-accent */
  accentTop?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, asChild, accentTop, ...props }, forwardedRef) => {
    const Component = asChild ? Slot : "div";
    return (
      <Component
        ref={forwardedRef}
        className={cx(
          "relative w-full rounded-lg border border-gray-200 bg-white p-5 text-left shadow-xs overflow-clip",
          accentTop && "border-t-2 border-t-entity-solid",
          className
        )}
        tremor-id="tremor-raw"
        {...props}
      />
    );
  }
);

Card.displayName = "Card";

export { Card };
