import { useEffect, useRef } from "react";
import { Undo2, X } from "lucide-react";

/**
 * The toast shown after an archive/delete: what happened, an Undo button and a
 * thin countdown bar. The countdown pauses while the pointer is over the toast
 * or focus is inside it, so a user reaching for Undo is never raced.
 *
 * It only reports: `onUndo` (button), `onClose` (× button) and `onExpire` (the
 * countdown ran out). What those mean — undoing, committing — is App's concern.
 */
export interface UndoToastProps {
  message: string;
  undoLabel: string;
  closeLabel: string;
  durationMs: number;
  onUndo: () => void;
  onClose: () => void;
  onExpire: () => void;
}

export function UndoToast({ message, undoLabel, closeLabel, durationMs, onUndo, onClose, onExpire }: UndoToastProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    let raf = 0;
    let elapsed = 0;
    let last = performance.now();
    let done = false;
    const tick = (now: number) => {
      if (!pausedRef.current) elapsed += now - last;
      last = now;
      const left = Math.max(0, 1 - elapsed / durationMs);
      if (barRef.current) barRef.current.style.transform = `scaleX(${left})`;
      if (elapsed >= durationMs) {
        if (!done) {
          done = true;
          onExpireRef.current();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="undo-toast"
      className="pointer-events-auto animate-in slide-in-from-bottom duration-300"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
      onFocusCapture={() => { pausedRef.current = true; }}
      onBlurCapture={() => { pausedRef.current = false; }}
    >
      <div className="relative overflow-hidden bg-slate-900 text-white pl-5 pr-4 py-3.5 rounded-2xl shadow-2xl flex items-center gap-4 text-ui font-bold border border-slate-800">
        <span className="min-w-0 break-words" data-testid="undo-toast-message">{message}</span>
        <button
          type="button"
          onClick={onUndo}
          data-testid="undo-toast-undo"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold cursor-pointer transition-all active:scale-95 text-micro shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
        >
          <Undo2 className="size-3.5" aria-hidden="true" />
          {undoLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="text-slate-400 hover:text-white cursor-pointer shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10" aria-hidden="true">
          <div ref={barRef} className="h-full origin-left bg-emerald-400" style={{ transform: "scaleX(1)" }} />
        </div>
      </div>
    </div>
  );
}
