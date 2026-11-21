import React from "react";
import { Slot } from "@radix-ui/react-slot";
import { RiLoader2Fill } from "@remixicon/react";
import { tv, type VariantProps } from "tailwind-variants";
import { cx, focusRing } from "../../lib/tremorUtils";

export const buttonVariants = tv({
  base: [
    "relative inline-flex items-center justify-center whitespace-nowrap rounded-md border font-medium shadow-2xs transition-all duration-100 ease-in-out cursor-pointer select-none",
    "text-ui px-3 py-2",
    "disabled:pointer-events-none disabled:shadow-none disabled:opacity-50",
    "active:scale-[0.98]",
    ...focusRing,
  ],
  variants: {
    variant: {
      primary: [
        "border-transparent",
        "text-white",
        "bg-entity-solid",
        "hover:bg-entity-solid-hover",
      ],
      secondary: [
        "border-gray-300",
        "text-gray-900",
        "bg-white",
        "hover:bg-gray-50",
      ],
      light: [
        "shadow-none",
        "border-entity-border",
        "text-entity-text",
        "bg-entity-subtle",
        "hover:bg-entity-muted",
      ],
      ghost: [
        "shadow-none",
        "border-transparent",
        "text-gray-700",
        "hover:bg-gray-100 hover:text-gray-900",
      ],
      destructive: [
        "text-white",
        "border-transparent",
        "bg-red-600",
        "hover:bg-red-700",
      ],
    },
    size: {
      sm: "px-2.5 py-1.5 text-caption",
      md: "px-3 py-2 text-ui",
      lg: "px-4 py-2.5 text-body",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
});

export interface ButtonProps
  extends React.ComponentPropsWithoutRef<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      asChild,
      isLoading = false,
      loadingText,
      className,
      disabled,
      variant,
      size,
      children,
      ...props
    },
    forwardedRef
  ) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component
        ref={forwardedRef}
        className={cx(buttonVariants({ variant, size }), className)}
        disabled={disabled || isLoading}
        tremor-id="tremor-raw"
        {...props}
      >
        {isLoading ? (
          <span className="pointer-events-none flex shrink-0 items-center justify-center gap-1.5">
            <RiLoader2Fill className="size-4 shrink-0 animate-spin" aria-hidden="true" />
            <span className="sr-only">{loadingText ?? "Loading"}</span>
            {loadingText ?? children}
          </span>
        ) : (
          children
        )}
      </Component>
    );
  }
);

Button.displayName = "Button";

export { Button };
