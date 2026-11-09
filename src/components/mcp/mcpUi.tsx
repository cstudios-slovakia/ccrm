import React, { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronRight, Copy } from "lucide-react";

/** Building blocks shared by the "AI Assistant (MCP)" settings and its connect panels. */

export type T = (en: string, sk: string, hu: string) => string;

export const showToast = (message: string, variant?: "error" | "warning") =>
  (window as any).showToast?.(message, variant);

const COPIED_MS = 2500;

/** One copy helper: copies, flips `copied` for 2.5 s, and tells the user when the browser refuses. */
function useCopy(failMessage: string): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async (text: string) => {
    try {
      // Throws when the Clipboard API is missing (plain HTTP) or permission is denied.
      await navigator.clipboard.writeText(text);
    } catch {
      showToast(failMessage, "error");
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };
  return [copied, copy];
}

const CopyButton: React.FC<{
  value: string;
  label: string;
  t: T;
  disabled?: boolean;
  describedBy?: string;
}> = ({ value, label, t, disabled, describedBy }) => {
  const [copied, copy] = useCopy(
    t(
      "Could not copy. Select the text and copy it by hand.",
      "Kopírovanie sa nepodarilo. Označte text a skopírujte ho ručne.",
      "A másolás nem sikerült. Jelölje ki a szöveget, és másolja ki kézzel."
    )
  );
  const copyWord = t("Copy", "Kopírovať", "Másolás");
  const copiedWord = t("Copied!", "Skopírované!", "Másolva!");
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={`${copyWord}: ${label}`}
        aria-describedby={describedBy}
        onClick={() => copy(value)}
        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-ui font-bold transition-all flex items-center gap-1.5 shadow border border-slate-700 cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-slate-300" />}
        <span className={copied ? "text-emerald-300" : ""}>{copied ? copiedWord : copyWord}</span>
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? copiedWord : ""}
      </span>
    </>
  );
};

interface CopyFieldProps {
  label: string;
  value: string;
  t: T;
  hint?: string;
  monospace?: boolean;
  /** Greys out Copy (the value cannot be copied right now) and explains why. */
  disabled?: boolean;
  disabledReason?: string;
  /** What to show instead of `value` (a masked key); Copy still copies `value`. */
  displayValue?: string;
  /** The value still holds `<your key>`: copyable, but the user must replace it. */
  placeholderWarning?: string;
  /** Extra controls next to Copy (Show / Hide). */
  actions?: React.ReactNode;
  /** Long text (instructions): the value sits in a collapsed preview. */
  previewLabel?: string;
  testId?: string;
}

export const CopyField: React.FC<CopyFieldProps> = ({
  label,
  value,
  t,
  hint,
  monospace = true,
  disabled,
  disabledReason,
  displayValue,
  placeholderWarning,
  actions,
  previewLabel,
  testId,
}) => {
  const reasonId = useId();
  const shown = displayValue ?? value;
  const body = (
    <div className={`${monospace ? "font-mono text-caption" : "text-caption"} break-all whitespace-pre-wrap`}>{shown}</div>
  );
  return (
    <div data-testid={testId} className="min-w-0 p-3 bg-slate-900 text-slate-100 rounded-2xl border border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="type-overline text-slate-400 min-w-0">{label}</div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {placeholderWarning && (
            <span className="flex items-center gap-1 text-micro font-semibold text-amber-300">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {placeholderWarning}
            </span>
          )}
          {actions}
          <CopyButton
            value={value}
            label={label}
            t={t}
            disabled={disabled}
            describedBy={disabled && disabledReason ? reasonId : undefined}
          />
        </div>
      </div>
      {previewLabel ? (
        <details className="mt-2 group">
          <summary className="flex items-center gap-1 cursor-pointer text-caption font-semibold text-slate-300 hover:text-white select-none">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            {previewLabel}
          </summary>
          <div className="mt-2">{body}</div>
        </details>
      ) : (
        <div className="mt-1.5">{body}</div>
      )}
      {hint && <p className="mt-1.5 text-micro text-slate-400">{hint}</p>}
      {disabled && disabledReason && (
        <p id={reasonId} className="mt-1.5 text-micro font-semibold text-amber-300">
          {disabledReason}
        </p>
      )}
    </div>
  );
};

export const Disclosure: React.FC<{ summary: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  summary,
  children,
  className = "",
}) => (
  <details className={`group rounded-2xl border border-slate-200 bg-slate-50/60 ${className}`}>
    <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer text-ui font-bold text-slate-700 hover:text-slate-900 select-none">
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
      {summary}
    </summary>
    <div className="px-4 pb-4 space-y-3">{children}</div>
  </details>
);
