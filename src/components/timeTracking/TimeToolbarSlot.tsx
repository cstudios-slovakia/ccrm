import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const SlotContext = createContext<{ el: HTMLElement | null; setEl: (el: HTMLElement | null) => void } | null>(null);

/** Wraps the time-tracking shell: the toolbar target and the views' slots find each other through it. */
export function TimeToolbarProvider({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  return <SlotContext.Provider value={{ el, setEl }}>{children}</SlotContext.Provider>;
}

/** The place in the shell's toolbar row where the active view's controls appear (range navigator, filters). */
export function TimeToolbarTarget({ className = "" }: { className?: string }) {
  const ctx = useContext(SlotContext);
  return <div ref={ctx?.setEl} className={`flex flex-wrap items-center gap-2 ${className}`} data-testid="time-toolbar-slot" />;
}

/** The active view renders its toolbar controls here; they show in the shell's toolbar row. Nothing without a shell. */
export function TimeToolbarSlot({ children }: { children: ReactNode }) {
  const ctx = useContext(SlotContext);
  return ctx?.el ? createPortal(children, ctx.el) : null;
}
