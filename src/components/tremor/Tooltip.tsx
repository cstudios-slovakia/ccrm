import React from "react";
import * as TooltipPrimitives from "@radix-ui/react-tooltip";
import { cx } from "../../lib/tremorUtils";

interface TooltipProps
  extends Omit<TooltipPrimitives.TooltipContentProps, "content" | "onClick">,
    Pick<
      TooltipPrimitives.TooltipProps,
      "open" | "defaultOpen" | "onOpenChange" | "delayDuration"
    > {
  content: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  side?: "bottom" | "left" | "top" | "right";
  showArrow?: boolean;
  triggerAsChild?: boolean;
}

const Tooltip = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitives.Content>,
  TooltipProps
>(
  (
    {
      children,
      className,
      content,
      delayDuration = 200,
      defaultOpen,
      open,
      onClick,
      onOpenChange,
      showArrow = true,
      side = "top",
      sideOffset = 6,
      triggerAsChild = false,
      ...props
    },
    forwardedRef
  ) => {
    return (
      <TooltipPrimitives.Provider delayDuration={delayDuration}>
        <TooltipPrimitives.Root
          open={open}
          defaultOpen={defaultOpen}
          onOpenChange={onOpenChange}
        >
          <TooltipPrimitives.Trigger asChild={triggerAsChild} onClick={onClick}>
            {children}
          </TooltipPrimitives.Trigger>
          <TooltipPrimitives.Portal>
            <TooltipPrimitives.Content
              ref={forwardedRef}
              side={side}
              sideOffset={sideOffset}
              align="center"
              className={cx(
                "z-[100030] max-w-60 select-none rounded-md px-2.5 py-1.5 text-caption leading-5 shadow-md",
                "bg-gray-900 text-gray-50",
                "will-change-[transform,opacity]",
                "data-[state=closed]:animate-hide data-[side=bottom]:animate-slide-down-and-fade data-[side=left]:animate-slide-left-and-fade data-[side=right]:animate-slide-right-and-fade data-[side=top]:animate-slide-up-and-fade",
                className
              )}
              {...props}
            >
              {content}
              {showArrow && (
                <TooltipPrimitives.Arrow
                  className="fill-gray-900"
                  width={10}
                  height={5}
                  aria-hidden="true"
                />
              )}
            </TooltipPrimitives.Content>
          </TooltipPrimitives.Portal>
        </TooltipPrimitives.Root>
      </TooltipPrimitives.Provider>
    );
  }
);
Tooltip.displayName = "Tooltip";

export { Tooltip, type TooltipProps };
