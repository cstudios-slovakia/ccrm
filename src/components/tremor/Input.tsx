import React from "react";
import { RiEyeFill, RiEyeOffFill, RiSearchLine } from "@remixicon/react";
import { tv, type VariantProps } from "tailwind-variants";
import { cx, focusInput, focusRing, hasErrorInput } from "../../lib/tremorUtils";

export const inputStyles = tv({
  base: [
    "relative block w-full appearance-none rounded-md border px-2.5 py-2 shadow-2xs outline-none transition text-body",
    "border-gray-300 text-gray-900 placeholder-gray-400 bg-white",
    "disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-400",
    "[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
    ...focusInput,
  ],
  variants: {
    hasError: {
      true: hasErrorInput,
    },
    enableStepper: {
      false:
        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
    },
  },
});

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputStyles> {
  inputClassName?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, inputClassName, hasError, enableStepper = true, type, ...props }, forwardedRef) => {
    const [typeState, setTypeState] = React.useState(type);
    const isPassword = type === "password";
    const isSearch = type === "search";

    return (
      <div className={cx("relative w-full", className)} tremor-id="tremor-raw">
        <input
          ref={forwardedRef}
          type={isPassword ? typeState : type}
          className={cx(
            inputStyles({ hasError, enableStepper }),
            isSearch && "pl-8",
            isPassword && "pr-10",
            inputClassName
          )}
          {...props}
        />
        {isSearch && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-2.5 text-gray-400">
            <RiSearchLine className="size-4 shrink-0" aria-hidden="true" />
          </div>
        )}
        {isPassword && (
          <div className="absolute inset-y-0 right-0 flex items-center justify-center pr-3">
            <button
              aria-label="Change password visibility"
              className={cx(
                "h-fit w-fit rounded-xs text-gray-400 transition-all hover:text-gray-600 cursor-pointer",
                focusRing
              )}
              type="button"
              onClick={() => setTypeState(typeState === "password" ? "text" : "password")}
            >
              <span className="sr-only">
                {typeState === "password" ? "Show password" : "Hide password"}
              </span>
              {typeState === "password" ? (
                <RiEyeFill aria-hidden="true" className="size-4 shrink-0" />
              ) : (
                <RiEyeOffFill aria-hidden="true" className="size-4 shrink-0" />
              )}
            </button>
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
