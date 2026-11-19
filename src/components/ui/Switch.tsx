/**
 * An on/off switch (`role="switch"`), drawn like the one in project settings; `tone` picks the on colour.
 * Put it inside a `<label>` with visible text and the text toggles it too (a button is labelable).
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  tone = "primary",
  className = "",
  testId,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name when no visible label sits beside it. */
  label?: string;
  disabled?: boolean;
  tone?: "primary" | "emerald";
  className?: string;
  testId?: string;
}) {
  const on = tone === "emerald" ? "bg-emerald-600" : "bg-primary";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:ring-offset-2 ${checked ? on : "bg-slate-300"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:opacity-90"} ${className}`}
    >
      <span className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}
