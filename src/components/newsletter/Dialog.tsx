import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A small modal for the newsletter screens: focus moves in and stays in, backdrop and Escape close it, focus returns to where it was. */
export const Dialog = ({
  open,
  title,
  onClose,
  children,
  closeLabel,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  closeLabel: string;
}) => {
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement as HTMLElement | null;
    // First field of the body, else the panel itself.
    const first = body.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      before?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  /** Tab wraps inside the dialog. A portaled dropdown panel is outside it and keeps its own keys. */
  const trap = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const active = document.activeElement;
    if (e.shiftKey && (active === items[0] || active === panel.current)) {
      e.preventDefault();
      items[items.length - 1].focus();
    } else if (!e.shiftKey && active === items[items.length - 1]) {
      e.preventDefault();
      items[0].focus();
    }
  };

  if (!open) return null;
  return createPortal(
    // Drawer layer (100000): portaled CustomSelect / ColorPicker panels (100001) must paint above it.
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        tabIndex={-1}
        onKeyDown={trap}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h3 className="type-panel-title text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>
        <div ref={body} className="min-h-0 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
};
