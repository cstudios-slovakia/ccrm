import React from "react";
import * as RadioGroupPrimitives from "@radix-ui/react-radio-group";
import { cx, focusRing } from "../../lib/tremorUtils";

const RadioGroup = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitives.Root>
>(({ className, ...props }, forwardedRef) => {
  return (
    <RadioGroupPrimitives.Root
      ref={forwardedRef}
      className={cx("grid gap-2", className)}
      tremor-id="tremor-raw"
      {...props}
    />
  );
});
RadioGroup.displayName = "RadioGroup";

const RadioGroupIndicator = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitives.Indicator>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitives.Indicator>
>(({ className, ...props }, forwardedRef) => {
  return (
    <RadioGroupPrimitives.Indicator
      ref={forwardedRef}
      className={cx("flex items-center justify-center", className)}
      {...props}
    >
      <div className="size-1.5 rounded-full bg-white" />
    </RadioGroupPrimitives.Indicator>
  );
});
RadioGroupIndicator.displayName = "RadioGroupIndicator";

const RadioGroupItem = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitives.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitives.Item>
>(({ className, ...props }, forwardedRef) => {
  return (
    <RadioGroupPrimitives.Item
      ref={forwardedRef}
      className={cx(
        "group relative flex size-4 appearance-none items-center justify-center rounded-full outline-none cursor-pointer",
        "border border-gray-300 bg-white shadow-2xs",
        "data-[state=checked]:border-transparent data-[state=checked]:bg-entity-solid",
        "data-[disabled]:border-gray-300 data-[disabled]:bg-gray-100 data-[disabled]:opacity-60",
        focusRing,
        className
      )}
      {...props}
    >
      <RadioGroupIndicator />
    </RadioGroupPrimitives.Item>
  );
});
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem };
