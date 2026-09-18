import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";

/**
 * An in-app replacement for `window.confirm()`.
 *
 * The native dialog blocks the page's event loop, which freezes automated
 * (CDP / Playwright) browser clients until someone closes the tab by hand, and
 * it cannot be styled or translated beyond its message. `confirm()` from this
 * hook resolves to the same boolean, so a call site only has to await it.
 */
export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Paints the confirm button as a destructive action. */
  danger?: boolean;
}

export function useConfirmDialog(): [
  (options: ConfirmOptions) => Promise<boolean>,
  React.ReactNode,
] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const settle = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    // A second request while one is open answers the first with "no" rather
    // than leaving its caller awaiting forever.
    resolverRef.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (!options) return;
    confirmButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        settle(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [options, settle]);

  // Never leave a caller hanging if the owner unmounts with the dialog open.
  useEffect(() => () => resolverRef.current?.(false), []);

  const dialog =
    typeof document === "undefined"
      ? null
      : createPortal(
          <AnimatePresence>
            {options && (
              // Above drawers (100000) and select panels (100001).
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[100020] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) settle(false);
                }}
              >
                <motion.div
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="ccrm-confirm-title"
                  data-testid="confirm-dialog"
                  initial={{ opacity: 0, scale: 0.97, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 8 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
                >
                  <div className="flex items-start gap-3 p-5">
                    {options.danger && (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                        <AlertTriangle className="h-4.5 w-4.5" />
                      </span>
                    )}
                    <div className="min-w-0 pt-0.5">
                      <h2
                        id="ccrm-confirm-title"
                        className="font-heading text-sm font-black text-slate-800 break-words"
                      >
                        {options.title}
                      </h2>
                      {options.message && (
                        <p className="mt-1.5 text-xs text-slate-500 break-words">
                          {options.message}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                    <button
                      type="button"
                      data-testid="confirm-dialog-cancel"
                      onClick={() => settle(false)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition-all hover:bg-slate-50 hover:border-slate-300 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                    >
                      {options.cancelLabel}
                    </button>
                    <button
                      ref={confirmButtonRef}
                      type="button"
                      data-testid="confirm-dialog-confirm"
                      onClick={() => settle(true)}
                      className={`rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                        options.danger
                          ? "bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-400"
                          : "bg-accent hover:brightness-110 focus-visible:ring-accent"
                      }`}
                    >
                      {options.confirmLabel}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        );

  return [confirm, dialog];
}
