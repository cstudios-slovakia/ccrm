import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, ChevronUp, Copy } from "lucide-react";

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
        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-ui font-bold transition-all flex items-center gap-1.5 shadow-sm border border-slate-200 cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
        <span className={copied ? "text-emerald-700" : ""}>{copied ? copiedWord : copyWord}</span>
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? copiedWord : ""}
      </span>
    </>
  );
};

/** Lines of a long value shown before the fade and the "Show whole prompt" button. */
const PREVIEW_LINES = 10;
const LINE_HEIGHT = 1.5;

/**
 * A long value (a prompt): the first PREVIEW_LINES lines, faded out at the bottom, with a centred
 * button that opens the rest. A short value that fits shows no fade and no button.
 */
const ClampedBody: React.FC<{ text: string; monospace: boolean; t: T }> = ({ text, monospace, t }) => {
  const bodyId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  // Re-measured when the text changes (a key was filled in) and when the width changes (lines re-wrap).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  const collapsed = overflowing && !expanded;
  const showLabel = t("Show whole prompt", "Zobraziť celý prompt", "Teljes prompt megjelenítése");
  const hideLabel = t("Show less", "Zobraziť menej", "Kevesebb megjelenítése");
  const toggle = (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={bodyId}
      onClick={() => setExpanded((v) => !v)}
      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-sm text-ui font-bold cursor-pointer transition-colors"
    >
      {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      {expanded ? hideLabel : showLabel}
    </button>
  );

  return (
    <div className="relative">
      <div
        id={bodyId}
        ref={ref}
        style={{ lineHeight: LINE_HEIGHT, maxHeight: expanded ? undefined : `${PREVIEW_LINES * LINE_HEIGHT}em` }}
        className={`${monospace ? "font-mono " : ""}text-caption break-all whitespace-pre-wrap overflow-hidden`}
      >
        {text}
      </div>
      {collapsed && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-slate-50 via-slate-50/80 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex justify-center">{toggle}</div>
        </>
      )}
      {overflowing && expanded && <div className="mt-3 flex justify-center">{toggle}</div>}
    </div>
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
  /** Long text (a prompt): the first lines show, faded, with a button for the rest. */
  longText?: boolean;
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
  longText,
  testId,
}) => {
  const reasonId = useId();
  const shown = displayValue ?? value;
  // The surface uses the slate ramp, which the app flips per theme: a light card in the light
  // theme, a dark one in the dark theme (see "The inverted Tailwind palette" in index.css).
  return (
    <div data-testid={testId} className="min-w-0 p-3.5 bg-slate-50 text-slate-800 rounded-2xl border border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="type-overline text-slate-500 min-w-0">{label}</div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {placeholderWarning && (
            <span className="flex items-center gap-1 text-micro font-semibold text-amber-700">
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
      <div className="mt-2.5">
        {longText ? (
          <ClampedBody text={shown} monospace={monospace} t={t} />
        ) : (
          <div className={`${monospace ? "font-mono " : ""}text-caption break-all whitespace-pre-wrap`}>{shown}</div>
        )}
      </div>
      {hint && <p className="mt-1.5 text-micro text-slate-500">{hint}</p>}
      {disabled && disabledReason && (
        <p id={reasonId} className="mt-1.5 text-micro font-semibold text-amber-700">
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
