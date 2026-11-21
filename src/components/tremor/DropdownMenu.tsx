import React from "react";
import * as DropdownMenuPrimitives from "@radix-ui/react-dropdown-menu";
import { RiArrowRightSLine, RiCheckLine, RiCheckboxBlankCircleLine } from "@remixicon/react";
import { cx } from "../../lib/tremorUtils";

const DropdownMenu = DropdownMenuPrimitives.Root;
const DropdownMenuTrigger = DropdownMenuPrimitives.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitives.Group;
const DropdownMenuSubMenu = DropdownMenuPrimitives.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitives.RadioGroup;

const DropdownMenuSubMenuTrigger = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitives.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitives.SubTrigger>
>(({ className, children, ...props }, forwardedRef) => (
  <DropdownMenuPrimitives.SubTrigger
    ref={forwardedRef}
    className={cx(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-1 text-ui outline-none transition-colors",
      "text-gray-900 focus:bg-entity-subtle focus:text-entity-text data-[state=open]:bg-entity-subtle",
      className
    )}
    {...props}
  >
    {children}
    <RiArrowRightSLine className="ml-auto size-4 shrink-0" aria-hidden="true" />
  </DropdownMenuPrimitives.SubTrigger>
));
DropdownMenuSubMenuTrigger.displayName = "DropdownMenuSubMenuTrigger";

const DropdownMenuSubMenuContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitives.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitives.SubContent>
>(({ className, collisionPadding = 8, ...props }, forwardedRef) => (
  <DropdownMenuPrimitives.Portal>
    <DropdownMenuPrimitives.SubContent
      ref={forwardedRef}
      collisionPadding={collisionPadding}
      className={cx(
        "relative z-[100025] min-w-44 overflow-hidden rounded-md border border-gray-200 bg-white p-1 text-gray-900 shadow-lg",
        "data-[state=closed]:animate-hide data-[side=bottom]:animate-slide-down-and-fade data-[side=left]:animate-slide-left-and-fade data-[side=right]:animate-slide-right-and-fade data-[side=top]:animate-slide-up-and-fade",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitives.Portal>
));
DropdownMenuSubMenuContent.displayName = "DropdownMenuSubMenuContent";

const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitives.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitives.Content>
>(({ className, sideOffset = 8, collisionPadding = 8, align = "center", ...props }, forwardedRef) => (
  <DropdownMenuPrimitives.Portal>
    <DropdownMenuPrimitives.Content
      ref={forwardedRef}
      sideOffset={sideOffset}
      align={align}
      collisionPadding={collisionPadding}
      className={cx(
        "relative z-[100025] min-w-48 overflow-hidden rounded-md border border-gray-200 bg-white p-1 text-gray-900 shadow-lg",
        "will-change-[transform,opacity]",
        "data-[state=closed]:animate-hide data-[side=bottom]:animate-slide-down-and-fade data-[side=left]:animate-slide-left-and-fade data-[side=right]:animate-slide-right-and-fade data-[side=top]:animate-slide-up-and-fade",
        className
      )}
      tremor-id="tremor-raw"
      {...props}
    />
  </DropdownMenuPrimitives.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitives.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitives.Item> & {
    shortcut?: string;
    hint?: string;
  }
>(({ className, shortcut, hint, children, ...props }, forwardedRef) => (
  <DropdownMenuPrimitives.Item
    ref={forwardedRef}
    className={cx(
      "group/item relative flex cursor-pointer select-none items-center gap-x-2 rounded-sm py-1.5 px-2 text-ui outline-none transition-colors",
      "text-gray-900 data-[disabled]:pointer-events-none data-[disabled]:text-gray-400",
      "focus:bg-entity-subtle focus:text-entity-text",
      className
    )}
    {...props}
  >
    {children}
    {hint && (
      <span className="ml-auto pl-2 text-caption text-gray-400">{hint}</span>
    )}
    {shortcut && (
      <span className="ml-auto pl-2 text-caption tracking-widest text-gray-400">
        {shortcut}
      </span>
    )}
  </DropdownMenuPrimitives.Item>
));
DropdownMenuItem.displayName = "DropdownMenuItem";

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitives.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitives.CheckboxItem> & {
    shortcut?: string;
  }
>(({ className, children, checked, shortcut, ...props }, forwardedRef) => (
  <DropdownMenuPrimitives.CheckboxItem
    ref={forwardedRef}
    className={cx(
      "relative flex cursor-pointer select-none items-center gap-x-2 rounded-sm py-1.5 pl-8 pr-2 text-ui outline-none transition-colors",
      "text-gray-900 data-[disabled]:pointer-events-none data-[disabled]:text-gray-400",
      "focus:bg-entity-subtle focus:text-entity-text",
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex size-4 items-center justify-center">
      <DropdownMenuPrimitives.ItemIndicator>
        <RiCheckLine className="size-4 shrink-0 text-entity-text" aria-hidden="true" />
      </DropdownMenuPrimitives.ItemIndicator>
    </span>
    {children}
    {shortcut && (
      <span className="ml-auto text-caption tracking-widest text-gray-400">{shortcut}</span>
    )}
  </DropdownMenuPrimitives.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";

const DropdownMenuRadioItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitives.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitives.RadioItem>
>(({ className, children, ...props }, forwardedRef) => (
  <DropdownMenuPrimitives.RadioItem
    ref={forwardedRef}
    className={cx(
      "relative flex cursor-pointer select-none items-center gap-x-2 rounded-sm py-1.5 pl-8 pr-2 text-ui outline-none transition-colors",
      "text-gray-900 data-[disabled]:pointer-events-none data-[disabled]:text-gray-400",
      "focus:bg-entity-subtle focus:text-entity-text",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-4 items-center justify-center">
      <DropdownMenuPrimitives.ItemIndicator>
        <RiCheckLine className="size-4 shrink-0 text-entity-text" aria-hidden="true" />
      </DropdownMenuPrimitives.ItemIndicator>
      <RiCheckboxBlankCircleLine className="size-2 text-gray-300 group-data-[state=checked]:hidden" aria-hidden="true" />
    </span>
    {children}
  </DropdownMenuPrimitives.RadioItem>
));
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

const DropdownMenuLabel = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitives.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitives.Label>
>(({ className, ...props }, forwardedRef) => (
  <DropdownMenuPrimitives.Label
    ref={forwardedRef}
    className={cx("px-2 py-1.5 type-overline text-gray-500", className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";

const DropdownMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitives.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitives.Separator>
>(({ className, ...props }, forwardedRef) => (
  <DropdownMenuPrimitives.Separator
    ref={forwardedRef}
    className={cx("-mx-1 my-1 h-px bg-gray-200", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSubMenu,
  DropdownMenuSubMenuContent,
  DropdownMenuSubMenuTrigger,
  DropdownMenuTrigger,
};
