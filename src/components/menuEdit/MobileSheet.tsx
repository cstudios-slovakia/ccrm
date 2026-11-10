import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { cn } from "../../utils/cn";
import { MENU_EDIT_LAYER_ATTR } from "./primitives";

/**
 * Bottom sheet of the mobile editor: slate-900/40 backdrop, a panel that slides
 * up with a 40x4 handle. Swipe down on the handle area, tap the backdrop or press
 * Escape to close; focus moves into the panel while it is open.
 */
export interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  label: string;
  /** Tall variant (top 72px) used by the add-module sheet. */
  tall?: boolean;
  children: React.ReactNode;
}

export const MobileSheet: React.FC<MobileSheetProps> = ({ open, onClose, label, tall, children }) => {
  const panelRef = useRef<HTMLElement>(null);
  const controls = useDragControls();

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          {...{ [MENU_EDIT_LAYER_ATTR]: "" }}
          className="view-size-fixed fixed inset-0 z-[100040] lg:hidden"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <motion.div
            className="absolute inset-0 bg-slate-900/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.section
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 500) onClose();
            }}
            className={cn(
              "absolute inset-x-0 bottom-0 flex flex-col bg-white rounded-t-3xl shadow-[0_25px_50px_-12px_rgb(15_23_42/0.35)] outline-none",
              tall ? "top-18" : "max-h-[85%]"
            )}
          >
            <div
              className="pt-2 pb-3 -mb-1 flex justify-center cursor-grab shrink-0"
              style={{ touchAction: "none" }}
              onPointerDown={(e) => controls.start(e)}
            >
              <span className="block w-10 h-1 rounded-full bg-slate-300" aria-hidden="true" />
            </div>
            {children}
          </motion.section>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

/** One 48px action of a sheet (`.act` in the design). */
export const ActionRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  meta?: string;
  /** Second line under the label. */
  hint?: string;
  trailing?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}> = ({ icon, label, meta, hint, trailing, disabled, danger, onClick }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={cn(
      "w-full min-h-12 px-3 rounded-xl border-0 bg-transparent flex items-center gap-3 text-left text-body font-medium transition-[background-color,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
      disabled
        ? "text-slate-400 cursor-default"
        : cn(
            "cursor-pointer active:scale-[0.98]",
            danger ? "text-rose-600 hover:bg-rose-50 active:bg-rose-50" : "text-slate-800 hover:bg-slate-50 active:bg-slate-100"
          )
    )}
  >
    <span className="shrink-0 inline-flex" aria-hidden="true">
      {icon}
    </span>
    <span className="flex-1 min-w-0 flex flex-col">
      <span className="truncate">{label}</span>
      {hint && <span className="text-caption font-normal text-slate-500">{hint}</span>}
    </span>
    {meta && <span className="text-caption font-normal text-slate-400 shrink-0">{meta}</span>}
    {trailing}
  </button>
);

/** Full-width 44px "Zrušiť"-style secondary button. */
export const SheetCancel: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full h-11 mt-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-ui font-semibold shadow-[0_1px_2px_rgb(15_23_42/0.05)] cursor-pointer transition-[background-color,transform] duration-150 hover:bg-slate-50 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
  >
    {label}
  </button>
);
