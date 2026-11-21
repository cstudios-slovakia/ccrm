import React from "react";
import * as LabelPrimitives from "@radix-ui/react-label";
import { cx } from "../../lib/tremorUtils";

export interface LabelProps
  extends React.ComponentPropsWithoutRef<typeof LabelPrimitives.Root> {
  disabled?: boolean;
}

const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitives.Root>,
  LabelProps
>(({ className, disabled, ...props }, forwardedRef) => (
  <LabelPrimitives.Root
    ref={forwardedRef}
    className={cx(
      "text-ui leading-none font-medium text-gray-900",
      disabled && "text-gray-400 cursor-not-allowed",
      className
    )}
    aria-disabled={disabled}
    tremor-id="tremor-raw"
    {...props}
  />
));

Label.displayName = "Label";

export { Label };
