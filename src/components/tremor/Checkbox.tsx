import React from "react";
import * as CheckboxPrimitives from "@radix-ui/react-checkbox";
import { cx, focusRing } from "../../lib/tremorUtils";

const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitives.Root>
>(({ className, checked, ...props }, forwardedRef) => {
  return (
    <CheckboxPrimitives.Root
      ref={forwardedRef}
      checked={checked}
      className={cx(
        "relative inline-flex size-4 shrink-0 appearance-none items-center justify-center rounded-sm shadow-2xs outline-none ring-1 ring-inset transition duration-100 cursor-pointer",
        "text-white bg-white ring-gray-300",
        "data-[disabled]:cursor-default data-[disabled]:bg-gray-100 data-[disabled]:text-gray-400 data-[disabled]:ring-gray-300",
        "enabled:data-[state=checked]:bg-entity-solid enabled:data-[state=checked]:ring-transparent",
        "enabled:data-[state=indeterminate]:bg-entity-solid enabled:data-[state=indeterminate]:ring-transparent",
        focusRing,
        className
      )}
      tremor-id="tremor-raw"
      {...props}
    >
      <CheckboxPrimitives.Indicator
        asChild
        className="flex size-full items-center justify-center"
      >
        {checked === "indeterminate" ? (
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <line
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
              x1="4"
              x2="12"
              y1="8"
              y2="8"
            />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M11.2 5.59998L6.79999 9.99998L4.79999 7.99998"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        )}
      </CheckboxPrimitives.Indicator>
    </CheckboxPrimitives.Root>
  );
});

Checkbox.displayName = "Checkbox";

export { Checkbox };
