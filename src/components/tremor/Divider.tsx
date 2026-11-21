import React from "react";
import { cx } from "../../lib/tremorUtils";

export type DividerProps = React.ComponentPropsWithoutRef<"div">;

const Divider = React.forwardRef<HTMLDivElement, DividerProps>(
  ({ className, children, ...props }, forwardedRef) => (
    <div
      ref={forwardedRef}
      className={cx(
        "mx-auto my-4 flex w-full items-center justify-between gap-3 text-ui text-gray-500",
        className
      )}
      tremor-id="tremor-raw"
      {...props}
    >
      {children ? (
        <>
          <div className="h-px w-full bg-gray-200" />
          <div className="whitespace-nowrap text-inherit">{children}</div>
          <div className="h-px w-full bg-gray-200" />
        </>
      ) : (
        <div className="h-px w-full bg-gray-200" />
      )}
    </div>
  )
);

Divider.displayName = "Divider";

export { Divider };
