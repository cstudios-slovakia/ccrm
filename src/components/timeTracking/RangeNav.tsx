import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * One bordered group: previous, label, next; then a reset button ("This week" / "Today") that
 * only shows when the range is not the current one.
 */
export function RangeNav({
  label,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  resetLabel,
  onReset,
  labelTestId,
  className = "",
}: {
  label: ReactNode;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
  /** Shown only when `onReset` is given (the range is not the current one). */
  resetLabel?: string;
  onReset?: () => void;
  labelTestId?: string;
  className?: string;
}) {
  const arrow = "inline-flex size-9 items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-900 cursor-pointer";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="inline-flex items-center divide-x divide-gray-200 overflow-hidden rounded-md border border-gray-200 bg-white">
        <button type="button" onClick={onPrev} aria-label={prevLabel} className={arrow}>
          <ChevronLeft className="size-4" />
        </button>
        <span className="flex h-9 min-w-40 items-center justify-center px-3 text-ui font-semibold text-gray-800" data-testid={labelTestId}>{label}</span>
        <button type="button" onClick={onNext} aria-label={nextLabel} className={arrow}>
          <ChevronRight className="size-4" />
        </button>
      </div>
      {onReset && resetLabel && (
        <button type="button" onClick={onReset} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-ui font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer">{resetLabel}</button>
      )}
    </div>
  );
}
