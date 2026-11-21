import React from "react";
import { cx, focusInput, hasErrorInput } from "../../lib/tremorUtils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, hasError, ...props }, forwardedRef) => {
    return (
      <textarea
        ref={forwardedRef}
        className={cx(
          "flex min-h-16 w-full rounded-md border px-3 py-2 shadow-2xs outline-none transition-colors text-body",
          "text-gray-900 border-gray-300 bg-white placeholder-gray-400",
          "disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-400",
          focusInput,
          hasError && hasErrorInput,
          className
        )}
        tremor-id="tremor-raw"
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

export { Textarea };
