import React from "react";
import * as TabsPrimitives from "@radix-ui/react-tabs";
import { cx, focusRing } from "../../lib/tremorUtils";

const Tabs = (
  props: Omit<React.ComponentPropsWithoutRef<typeof TabsPrimitives.Root>, "orientation">
) => {
  return <TabsPrimitives.Root tremor-id="tremor-raw" {...props} />;
};
Tabs.displayName = "Tabs";

type TabsListVariant = "line" | "solid";

const TabsListVariantContext = React.createContext<TabsListVariant>("line");

interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitives.List> {
  variant?: TabsListVariant;
}

const variantStyles: Record<TabsListVariant, string> = {
  line: cx("flex items-center justify-start border-b border-gray-200 gap-x-1"),
  solid: cx("inline-flex items-center justify-center rounded-lg p-1 bg-gray-100 border border-gray-200"),
};

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitives.List>,
  TabsListProps
>(({ className, variant = "line", children, ...props }, forwardedRef) => (
  <TabsPrimitives.List
    ref={forwardedRef}
    className={cx(variantStyles[variant], className)}
    {...props}
  >
    <TabsListVariantContext.Provider value={variant}>
      {children}
    </TabsListVariantContext.Provider>
  </TabsPrimitives.List>
));
TabsList.displayName = "TabsList";

function getVariantStyles(tabVariant: TabsListVariant) {
  switch (tabVariant) {
    case "line":
      return cx(
        "-mb-px items-center justify-center whitespace-nowrap border-b-2 border-transparent px-3 pb-2.5 text-ui font-medium transition-all",
        "text-gray-500 hover:text-gray-800 hover:border-gray-300",
        "data-[state=active]:border-entity-solid data-[state=active]:text-entity-text data-[state=active]:font-semibold",
        "data-[disabled]:pointer-events-none data-[disabled]:text-gray-300"
      );
    case "solid":
      return cx(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-ui font-medium transition-all",
        "text-gray-600 hover:text-gray-900",
        "data-[state=active]:bg-white data-[state=active]:text-entity-text data-[state=active]:shadow-2xs data-[state=active]:font-semibold",
        "data-[disabled]:pointer-events-none data-[disabled]:text-gray-400 data-[disabled]:opacity-50"
      );
  }
}

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitives.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitives.Trigger>
>(({ className, children, ...props }, forwardedRef) => {
  const variant = React.useContext(TabsListVariantContext);
  return (
    <TabsPrimitives.Trigger
      ref={forwardedRef}
      className={cx(getVariantStyles(variant), "cursor-pointer", focusRing, className)}
      {...props}
    >
      {children}
    </TabsPrimitives.Trigger>
  );
});
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitives.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitives.Content>
>(({ className, ...props }, forwardedRef) => (
  <TabsPrimitives.Content
    ref={forwardedRef}
    className={cx("outline-none", focusRing, className)}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";

export { Tabs, TabsContent, TabsList, TabsTrigger };
