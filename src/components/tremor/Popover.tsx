import React from "react";
import * as PopoverPrimitives from "@radix-ui/react-popover";
import { cx } from "../../lib/tremorUtils";

const Popover = (props: React.ComponentPropsWithoutRef<typeof PopoverPrimitives.Root>) => {
  return <PopoverPrimitives.Root {...props} />;
};
Popover.displayName = "Popover";

const PopoverTrigger = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitives.Trigger>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitives.Trigger>
>((props, forwardedRef) => {
  return <PopoverPrimitives.Trigger ref={forwardedRef} {...props} />;
});
PopoverTrigger.displayName = "PopoverTrigger";

const PopoverAnchor = PopoverPrimitives.Anchor;
const PopoverClose = PopoverPrimitives.Close;

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitives.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitives.Content>
>(
  (
    {
      className,
      sideOffset = 8,
      collisionPadding = 10,
      align = "center",
      ...props
    },
    forwardedRef
  ) => {
    return (
      <PopoverPrimitives.Portal>
        <PopoverPrimitives.Content
          ref={forwardedRef}
          sideOffset={sideOffset}
          align={align}
          collisionPadding={collisionPadding}
          className={cx(
            "z-[100015] min-w-44 max-w-[95vw] rounded-lg border border-gray-200 bg-white p-3 text-ui text-gray-900 shadow-lg outline-none",
            "will-change-[transform,opacity]",
            "data-[state=closed]:animate-hide",
            "data-[side=bottom]:animate-slide-down-and-fade data-[side=left]:animate-slide-left-and-fade data-[side=right]:animate-slide-right-and-fade data-[side=top]:animate-slide-up-and-fade",
            className
          )}
          tremor-id="tremor-raw"
          {...props}
        />
      </PopoverPrimitives.Portal>
    );
  }
);
PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverAnchor, PopoverClose, PopoverContent, PopoverTrigger };
