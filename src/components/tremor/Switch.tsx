import React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { tv, type VariantProps } from "tailwind-variants";
import { cx, focusRing } from "../../lib/tremorUtils";

export const switchVariants = tv({
  slots: {
    root: [
      "group relative isolate inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5 shadow-inner outline-none ring-1 ring-inset transition-all",
      "bg-gray-200 ring-black/5",
      "data-[state=checked]:bg-entity-solid",
      "data-[disabled]:cursor-default data-[disabled]:bg-gray-100 data-[disabled]:opacity-60",
      ...focusRing,
    ],
    thumb: [
      "pointer-events-none relative inline-block transform appearance-none rounded-full border-none shadow-lg outline-none transition-all duration-150 ease-in-out",
      "bg-white",
    ],
  },
  variants: {
    size: {
      default: {
        root: "h-5 w-9",
        thumb: "size-4 data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
      },
      small: {
        root: "h-4 w-7",
        thumb: "size-3 data-[state=checked]:translate-x-3 data-[state=unchecked]:translate-x-0",
      },
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export interface SwitchProps
  extends Omit<React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>, "asChild">,
    VariantProps<typeof switchVariants> {}

const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(({ className, size, ...props }, forwardedRef) => {
  const { root, thumb } = switchVariants({ size });
  return (
    <SwitchPrimitives.Root
      ref={forwardedRef}
      className={cx(root(), className)}
      tremor-id="tremor-raw"
      {...props}
    >
      <SwitchPrimitives.Thumb className={cx(thumb())} />
    </SwitchPrimitives.Root>
  );
});

Switch.displayName = "Switch";

export { Switch };
