import React, { useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "../../utils/cn";
import { isBlankText } from "../../utils/offerDraft";

type FieldTag = "p" | "div" | "span" | "h2";

export interface OfferFieldProps {
  value: string | null | undefined;
  /** What belongs here — shown muted in edit mode, never in the finished document. */
  placeholder: string;
  /** Present = edit mode. Absent = the finished document. */
  onChange?: (next: string) => void;
  /** Edit mode: a growing textarea instead of a single-line input. */
  multiline?: boolean;
  /** Read-only: keep the line breaks of the text. Off by default so an existing document prints as it always did. */
  preLine?: boolean;
  /** Element the text is printed in; the editor sits inside the same element. */
  as?: FieldTag;
  /** Typography and layout of the text — applied to the printed element in both modes. */
  className?: string;
  /** Extra classes for the editing control itself (a width, an alignment). */
  inputClassName?: string;
  /** Extra classes for the element the control sits in — edit mode only, so the printed markup is untouched. */
  editClassName?: string;
  /** Stable hook for tests and for focusing a field from outside. */
  name?: string;
  type?: "text" | "date";
}

/**
 * One piece of document text.
 *
 * Read-only it prints the text — or nothing at all when there is none, so the
 * "hide empty fields" rule of the finished document lives in exactly one place.
 * With `onChange` it becomes a control that looks like the printed text: same
 * font, size and colour (it inherits them from the element it sits in), a
 * transparent background, a dashed outline on hover and a solid ring on focus.
 * Multi-line text grows with its content instead of scrolling.
 *
 * Deliberately a real `<input>` / `<textarea>` and not `contentEditable`: the
 * caret does not jump when React re-renders, a paste is plain text, and a test
 * can fill it.
 */
export const OfferField: React.FC<OfferFieldProps> = ({
  value,
  placeholder,
  onChange,
  multiline = false,
  preLine = false,
  as: Tag = "p",
  className,
  inputClassName,
  editClassName,
  name,
  type = "text"
}) => {
  if (!onChange) {
    if (isBlankText(value)) return null;
    return <Tag className={cn(className, preLine && "whitespace-pre-line") || undefined}>{value}</Tag>;
  }

  const text = value ?? "";
  return (
    <Tag className={cn(className, editClassName)} data-offer-field={name}>
      {multiline ? (
        <AutoGrowTextarea value={text} placeholder={placeholder} onChange={onChange} className={inputClassName} />
      ) : (
        <input
          type={type}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={e => onChange(e.target.value)}
          className={cn(CONTROL_CLASS, inputClassName)}
          style={CONTROL_STYLE}
        />
      )}
    </Tag>
  );
};

/**
 * Inherit the printed text's look. Tailwind's preflight already inherits font,
 * colour and letter-spacing into form controls; alignment and case are not
 * covered by it, and a right-aligned amount has to stay right-aligned.
 */
const CONTROL_STYLE: React.CSSProperties = {
  textAlign: "inherit",
  textTransform: "inherit",
  fontStyle: "inherit"
};

/** Looks like text until the pointer is over it, then until it has focus. */
export const CONTROL_CLASS =
  "inline-block align-top w-full min-w-0 bg-transparent border-0 p-0 m-0 rounded-xs outline-0 outline-offset-2 " +
  "placeholder:text-slate-400 placeholder:font-normal placeholder:normal-case placeholder:tracking-normal " +
  "hover:outline-1 hover:outline-dashed hover:outline-indigo-300 hover:bg-indigo-50/50 " +
  "focus:outline-2 focus:outline-solid focus:outline-indigo-500 focus:bg-white focus:hover:bg-white";

const AutoGrowTextarea: React.FC<{
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
  className?: string;
}> = ({ value, placeholder, onChange, className }) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // A wider or narrower document re-wraps the text, so it has to be remeasured.
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={e => onChange(e.target.value)}
      className={cn(CONTROL_CLASS, "resize-none overflow-hidden whitespace-pre-wrap", className)}
      style={CONTROL_STYLE}
    />
  );
};

/** A bare editing control for table cells and inline values, same look as `OfferField`. */
export const OfferInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { numeric?: boolean }
>(({ className, numeric, ...rest }, ref) => (
  <input
    ref={ref}
    {...rest}
    className={cn(
      CONTROL_CLASS,
      numeric && "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
      className
    )}
    style={CONTROL_STYLE}
  />
));
OfferInput.displayName = "OfferInput";
