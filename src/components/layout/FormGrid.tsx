import type { ReactNode } from "react";

/** One column; two from `ws-md`; three from `ws-2xl` when `dense` (forms with 8+ fields). */
export const FormGrid = ({
  children,
  dense = false,
  className = "",
}: {
  children: ReactNode;
  dense?: boolean;
  className?: string;
}) => (
  <div className={`grid grid-cols-1 gap-x-6 gap-y-4 ws-md:grid-cols-2 ${dense ? "ws-2xl:grid-cols-3" : ""} ${className}`}>
    {children}
  </div>
);

/** Label above the control (`type-label`), hint or error below (`type-meta`). */
export const Field = ({
  label,
  hint,
  error,
  span,
  htmlFor,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  span?: "full";
  htmlFor?: string;
  children: ReactNode;
}) => (
  <div className={`flex min-w-0 flex-col gap-1.5 ${span === "full" ? "ws-md:col-span-full" : ""}`}>
    <label htmlFor={htmlFor} className="type-label text-slate-600">
      {label}
    </label>
    {children}
    {error ? (
      <span className="type-meta text-rose-600">{error}</span>
    ) : hint ? (
      <span className="type-meta text-slate-500">{hint}</span>
    ) : null}
  </div>
);
