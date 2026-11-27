import React from "react";
import * as DrawerPrimitives from "@radix-ui/react-dialog";
import { RiCloseLine } from "@remixicon/react";
import { cx, focusRing } from "../../lib/tremorUtils";
import { Button } from "./Button";

const Drawer = (props: React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Root>) => {
  return <DrawerPrimitives.Root tremor-id="tremor-raw" {...props} />;
};
Drawer.displayName = "Drawer";

const DrawerTrigger = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitives.Trigger>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Trigger>
>(({ className, ...props }, ref) => {
  return <DrawerPrimitives.Trigger ref={ref} className={cx(className)} {...props} />;
});
DrawerTrigger.displayName = "DrawerTrigger";

const DrawerClose = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Close>
>(({ className, ...props }, ref) => {
  return <DrawerPrimitives.Close ref={ref} className={cx(className)} {...props} />;
});
DrawerClose.displayName = "DrawerClose";

const DrawerPortal = DrawerPrimitives.Portal;
DrawerPortal.displayName = "DrawerPortal";

const DrawerOverlay = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitives.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Overlay>
>(({ className, ...props }, forwardedRef) => {
  return (
    <DrawerPrimitives.Overlay
      ref={forwardedRef}
      className={cx(
        "fixed inset-0 z-[100010] overflow-y-auto bg-slate-950/40 backdrop-blur-xs",
        "data-[state=closed]:animate-hide data-[state=open]:animate-dialog-overlay-show",
        className
      )}
      {...props}
    />
  );
});
DrawerOverlay.displayName = "DrawerOverlay";

const DrawerContent = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitives.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Content>
>(({ className, ...props }, forwardedRef) => {
  return (
    <DrawerPortal>
      <DrawerOverlay>
        <DrawerPrimitives.Content
          ref={forwardedRef}
          className={cx(
            "fixed inset-y-2 right-2 z-[100011] flex w-[95vw] max-w-lg flex-1 flex-col overflow-y-auto rounded-lg border p-4 sm:p-6 shadow-2xl focus:outline-none",
            "border-gray-200 bg-white text-gray-900",
            "data-[state=closed]:animate-drawer-slide-right-and-fade data-[state=open]:animate-drawer-slide-left-and-fade",
            className
          )}
          {...props}
        />
      </DrawerOverlay>
    </DrawerPortal>
  );
});
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className="flex items-start justify-between gap-x-4 border-b border-gray-200 pb-4"
      {...props}
    >
      <div className={cx("mt-0.5 flex flex-col gap-y-1 min-w-0", className)}>{children}</div>
      <DrawerPrimitives.Close asChild>
        <Button
          variant="ghost"
          className="aspect-square p-1.5 text-gray-500 hover:bg-gray-100"
        >
          <RiCloseLine className="size-5" aria-hidden="true" />
          <span className="sr-only">Close</span>
        </Button>
      </DrawerPrimitives.Close>
    </div>
  );
});
DrawerHeader.displayName = "DrawerHeader";

const DrawerTitle = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Title>
>(({ className, ...props }, forwardedRef) => (
  <DrawerPrimitives.Title
    ref={forwardedRef}
    className={cx("text-title font-semibold text-gray-900", className)}
    {...props}
  />
));
DrawerTitle.displayName = "DrawerTitle";

const DrawerBody = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  return <div ref={ref} className={cx("flex-1 py-4", className)} {...props} />;
});
DrawerBody.displayName = "DrawerBody";

const DrawerDescription = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Description>
>(({ className, ...props }, forwardedRef) => {
  return (
    <DrawerPrimitives.Description
      ref={forwardedRef}
      className={cx("text-body text-gray-500", className)}
      {...props}
    />
  );
});
DrawerDescription.displayName = "DrawerDescription";

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cx(
        "sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-col-reverse border-t border-gray-200 bg-white px-4 py-4 sm:-mx-6 sm:-mb-6 sm:flex-row sm:justify-end sm:px-6 gap-2 shrink-0",
        className
      )}
      {...props}
    />
  );
};
DrawerFooter.displayName = "DrawerFooter";

export {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
};
export { focusRing };
