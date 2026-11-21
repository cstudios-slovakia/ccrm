import React from "react";
import * as DialogPrimitives from "@radix-ui/react-dialog";
import { cx, focusRing } from "../../lib/tremorUtils";

const Dialog = (props: React.ComponentPropsWithoutRef<typeof DialogPrimitives.Root>) => {
  return <DialogPrimitives.Root {...props} />;
};
Dialog.displayName = "Dialog";

const DialogTrigger = DialogPrimitives.Trigger;
DialogTrigger.displayName = "DialogTrigger";

const DialogClose = DialogPrimitives.Close;
DialogClose.displayName = "DialogClose";

const DialogPortal = DialogPrimitives.Portal;
DialogPortal.displayName = "DialogPortal";

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitives.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitives.Overlay>
>(({ className, ...props }, forwardedRef) => {
  return (
    <DialogPrimitives.Overlay
      ref={forwardedRef}
      className={cx(
        "fixed inset-0 z-[100020] overflow-y-auto bg-slate-950/50 backdrop-blur-xs",
        "data-[state=open]:animate-dialog-overlay-show",
        className
      )}
      {...props}
    />
  );
});
DialogOverlay.displayName = "DialogOverlay";

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitives.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitives.Content>
>(({ className, ...props }, forwardedRef) => {
  return (
    <DialogPortal>
      <DialogOverlay>
        <DialogPrimitives.Content
          ref={forwardedRef}
          className={cx(
            "fixed left-1/2 top-1/2 z-[100021] w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border p-6 shadow-xl",
            "border-gray-200 bg-white text-gray-900",
            "data-[state=open]:animate-dialog-content-show",
            focusRing,
            className
          )}
          tremor-id="tremor-raw"
          {...props}
        />
      </DialogOverlay>
    </DialogPortal>
  );
});
DialogContent.displayName = "DialogContent";

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return <div className={cx("flex flex-col gap-y-1", className)} {...props} />;
};
DialogHeader.displayName = "DialogHeader";

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitives.Title>
>(({ className, ...props }, forwardedRef) => (
  <DialogPrimitives.Title
    ref={forwardedRef}
    className={cx("text-title font-semibold text-gray-900", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitives.Description>
>(({ className, ...props }, forwardedRef) => {
  return (
    <DialogPrimitives.Description
      ref={forwardedRef}
      className={cx("text-body text-gray-500 mt-1", className)}
      {...props}
    />
  );
});
DialogDescription.displayName = "DialogDescription";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cx("flex flex-col-reverse sm:flex-row sm:justify-end gap-2", className)}
      {...props}
    />
  );
};
DialogFooter.displayName = "DialogFooter";

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
