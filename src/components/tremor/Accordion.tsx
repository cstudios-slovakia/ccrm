import React from "react";
import * as AccordionPrimitives from "@radix-ui/react-accordion";
import { RiAddLine } from "@remixicon/react";
import { cx } from "../../lib/tremorUtils";

const Accordion = AccordionPrimitives.Root;
Accordion.displayName = "Accordion";

const AccordionItem = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitives.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitives.Item>
>(({ className, ...props }, forwardedRef) => (
  <AccordionPrimitives.Item
    ref={forwardedRef}
    className={cx("overflow-hidden border-b first:mt-0 border-gray-200", className)}
    tremor-id="tremor-raw"
    {...props}
  />
));
AccordionItem.displayName = "AccordionItem";

const AccordionTrigger = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitives.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitives.Trigger>
>(({ className, children, ...props }, forwardedRef) => (
  <AccordionPrimitives.Header className="flex">
    <AccordionPrimitives.Trigger
      ref={forwardedRef}
      className={cx(
        "group flex flex-1 cursor-pointer items-center justify-between py-3 text-left text-body font-medium leading-none transition-all text-gray-900",
        "data-[disabled]:cursor-default data-[disabled]:text-gray-400",
        "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-entity-ring",
        className
      )}
      {...props}
    >
      {children}
      <RiAddLine
        className="size-5 shrink-0 transition-transform duration-150 ease-[cubic-bezier(0.87,_0,_0.13,_1)] group-data-[state=open]:rotate-45 text-gray-400 group-data-[disabled]:text-gray-300"
        aria-hidden="true"
      />
    </AccordionPrimitives.Trigger>
  </AccordionPrimitives.Header>
));
AccordionTrigger.displayName = "AccordionTrigger";

const AccordionContent = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitives.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitives.Content>
>(({ className, children, ...props }, forwardedRef) => (
  <AccordionPrimitives.Content
    ref={forwardedRef}
    className={cx(
      "data-[state=closed]:animate-accordion-close data-[state=open]:animate-accordion-open transform-gpu"
    )}
    {...props}
  >
    <div className={cx("overflow-hidden pb-4 text-body text-gray-700", className)}>
      {children}
    </div>
  </AccordionPrimitives.Content>
));
AccordionContent.displayName = "AccordionContent";

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
