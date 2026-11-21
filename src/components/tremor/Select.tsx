import React from "react";
import * as SelectPrimitives from "@radix-ui/react-select";
import {
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiCheckLine,
  RiExpandUpDownLine,
} from "@remixicon/react";
import { cx, focusInput, hasErrorInput } from "../../lib/tremorUtils";

const Select = SelectPrimitives.Root;
Select.displayName = "Select";

const SelectGroup = SelectPrimitives.Group;
SelectGroup.displayName = "SelectGroup";

const SelectValue = SelectPrimitives.Value;
SelectValue.displayName = "SelectValue";

const selectTriggerStyles = [
  cx(
    "group/trigger flex w-full select-none items-center justify-between gap-2 truncate rounded-md border px-3 py-2 shadow-2xs outline-none transition text-body cursor-pointer",
    "border-gray-300 text-gray-900 bg-white",
    "data-[placeholder]:text-gray-500",
    "hover:bg-gray-50",
    "data-[disabled]:bg-gray-100 data-[disabled]:text-gray-400 data-[disabled]:cursor-not-allowed",
    focusInput
  ),
];

const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitives.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitives.Trigger> & {
    hasError?: boolean;
  }
>(({ className, hasError, children, ...props }, forwardedRef) => {
  return (
    <SelectPrimitives.Trigger
      ref={forwardedRef}
      className={cx(selectTriggerStyles, hasError && hasErrorInput, className)}
      tremor-id="tremor-raw"
      {...props}
    >
      <span className="truncate">{children}</span>
      <SelectPrimitives.Icon asChild>
        <RiExpandUpDownLine className="size-4 shrink-0 text-gray-400 group-data-[disabled]/trigger:text-gray-300" />
      </SelectPrimitives.Icon>
    </SelectPrimitives.Trigger>
  );
});
SelectTrigger.displayName = "SelectTrigger";

const SelectScrollUpButton = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitives.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitives.ScrollUpButton>
>(({ className, ...props }, forwardedRef) => (
  <SelectPrimitives.ScrollUpButton
    ref={forwardedRef}
    className={cx("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <RiArrowUpSLine className="size-3 shrink-0" aria-hidden="true" />
  </SelectPrimitives.ScrollUpButton>
));
SelectScrollUpButton.displayName = "SelectScrollUpButton";

const SelectScrollDownButton = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitives.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitives.ScrollDownButton>
>(({ className, ...props }, forwardedRef) => (
  <SelectPrimitives.ScrollDownButton
    ref={forwardedRef}
    className={cx("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <RiArrowDownSLine className="size-3 shrink-0" aria-hidden="true" />
  </SelectPrimitives.ScrollDownButton>
));
SelectScrollDownButton.displayName = "SelectScrollDownButton";

const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitives.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitives.Content>
>(
  (
    {
      className,
      position = "popper",
      children,
      sideOffset = 8,
      collisionPadding = 10,
      ...props
    },
    forwardedRef
  ) => (
    <SelectPrimitives.Portal>
      <SelectPrimitives.Content
        ref={forwardedRef}
        className={cx(
          "relative z-[100005] max-h-[--radix-select-content-available-height] min-w-[--radix-select-trigger-width] overflow-hidden rounded-md border shadow-xl",
          "bg-white text-gray-900 border-gray-200",
          "will-change-[transform,opacity]",
          "data-[state=closed]:animate-hide",
          "data-[side=bottom]:animate-slide-down-and-fade data-[side=left]:animate-slide-left-and-fade data-[side=right]:animate-slide-right-and-fade data-[side=top]:animate-slide-up-and-fade",
          className
        )}
        sideOffset={sideOffset}
        position={position}
        collisionPadding={collisionPadding}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitives.Viewport
          className={cx(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[calc(var(--radix-select-trigger-width))]"
          )}
        >
          {children}
        </SelectPrimitives.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitives.Content>
    </SelectPrimitives.Portal>
  )
);
SelectContent.displayName = "SelectContent";

const SelectGroupLabel = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitives.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitives.Label>
>(({ className, ...props }, forwardedRef) => (
  <SelectPrimitives.Label
    ref={forwardedRef}
    className={cx("px-3 py-2 text-caption font-medium tracking-wide text-gray-500", className)}
    {...props}
  />
));
SelectGroupLabel.displayName = "SelectGroupLabel";

const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitives.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitives.Item>
>(({ className, children, ...props }, forwardedRef) => {
  return (
    <SelectPrimitives.Item
      ref={forwardedRef}
      className={cx(
        "grid cursor-pointer grid-cols-[1fr_20px] gap-x-2 rounded-sm px-3 py-2 outline-none transition-colors text-body",
        "text-gray-900",
        "data-[disabled]:pointer-events-none data-[disabled]:text-gray-400",
        "focus:bg-entity-subtle focus:text-entity-text",
        "data-[state=checked]:font-semibold data-[state=checked]:text-entity-text",
        className
      )}
      {...props}
    >
      <SelectPrimitives.ItemText className="flex-1 truncate">
        {children}
      </SelectPrimitives.ItemText>
      <SelectPrimitives.ItemIndicator>
        <RiCheckLine className="size-4 shrink-0 text-entity-text" aria-hidden="true" />
      </SelectPrimitives.ItemIndicator>
    </SelectPrimitives.Item>
  );
});
SelectItem.displayName = "SelectItem";

const SelectSeparator = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitives.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitives.Separator>
>(({ className, ...props }, forwardedRef) => (
  <SelectPrimitives.Separator
    ref={forwardedRef}
    className={cx("-mx-1 my-1 h-px bg-gray-200", className)}
    {...props}
  />
));
SelectSeparator.displayName = "SelectSeparator";

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
