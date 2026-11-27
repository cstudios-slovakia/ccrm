import React from "react";
import * as HoverCardPrimitives from "@radix-ui/react-hover-card";
import { cx } from "../../../lib/tremorUtils";

export interface TrackerBlockProps {
  key?: string | number;
  color?: string;
  hexColor?: string;
  tooltip?: string;
  hoverEffect?: boolean;
  defaultBackgroundColor?: string;
}

const Block = ({
  color,
  hexColor,
  tooltip,
  defaultBackgroundColor,
  hoverEffect,
}: TrackerBlockProps) => {
  const [open, setOpen] = React.useState(false);
  return (
    <HoverCardPrimitives.Root open={open} onOpenChange={setOpen} openDelay={0} closeDelay={0}>
      <HoverCardPrimitives.Trigger onClick={() => setOpen(true)} asChild>
        <div className="size-full overflow-hidden px-0.5 transition first:rounded-l-[4px] first:pl-0 last:rounded-r-[4px] last:pr-0">
          <div
            className={cx(
              "size-full rounded-[2px]",
              !hexColor && (color || defaultBackgroundColor),
              hoverEffect && "hover:opacity-60"
            )}
            style={hexColor ? { backgroundColor: hexColor } : undefined}
          />
        </div>
      </HoverCardPrimitives.Trigger>
      {tooltip && (
        <HoverCardPrimitives.Portal>
          <HoverCardPrimitives.Content
            sideOffset={8}
            side="top"
            align="center"
            avoidCollisions
            className="z-[100030] w-auto rounded-md bg-gray-900 px-2.5 py-1.5 text-caption font-medium text-white shadow-md"
          >
            {tooltip}
          </HoverCardPrimitives.Content>
        </HoverCardPrimitives.Portal>
      )}
    </HoverCardPrimitives.Root>
  );
};

export interface TrackerProps extends React.HTMLAttributes<HTMLDivElement> {
  data: TrackerBlockProps[];
  defaultBackgroundColor?: string;
  hoverEffect?: boolean;
}

const Tracker = React.forwardRef<HTMLDivElement, TrackerProps>(
  (
    {
      data = [],
      defaultBackgroundColor = "bg-gray-300",
      className,
      hoverEffect = true,
      ...props
    },
    forwardedRef
  ) => {
    return (
      <div
        ref={forwardedRef}
        className={cx("group flex h-6 w-full items-center", className)}
        {...props}
      >
        {data.map((propsItem, index) => (
          <Block
            key={propsItem.key ?? index}
            defaultBackgroundColor={defaultBackgroundColor}
            hoverEffect={hoverEffect}
            {...propsItem}
          />
        ))}
      </div>
    );
  }
);

Tracker.displayName = "Tracker";

export { Tracker };
