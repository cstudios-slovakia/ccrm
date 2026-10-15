import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { holdAriaLabel, holdHint, type Lang, type Verb } from "../../utils/undoMessages.ts";

/**
 * Hold-to-confirm for archive and delete actions.
 *
 * The user presses and HOLDS for `holdMs` (500 by default) while a ring fills.
 * Releasing early cancels; a plain click never does anything destructive. The
 * hold replaces the "Are you sure?" dialog — the Undo toast that follows is the
 * safety net for the rest.
 *
 * Two entry points:
 *  - `useHoldToConfirm` for custom markup (it returns the handlers to spread);
 *  - `HoldToConfirmButton` for everything that is a button or a menu item.
 *
 * One clock: progress and the deadline are driven by the same
 * requestAnimationFrame loop off `performance.now()`, so the ring and the action
 * can never drift apart the way a CSS animation plus a setTimeout would.
 */

export const HOLD_MS = 500;
/** How long the ring takes to rewind after a cancelled hold. */
const REWIND_MS = 150;
/** Length of the completion "pop" before the action runs. */
const POP_MS = 120;
/** How long the "Hold to …" hint stays up after an early release. */
const HINT_MS = 1500;

export type HoldTone = "danger" | "archive";

const toneVerb = (tone: HoldTone): Verb => (tone === "danger" ? "delete" : "archive");

/** The UI language the app stored, for call sites that do not pass `lang`. */
export function readUiLanguage(): Lang {
  try {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("crm_language") : null;
    if (stored === "sk" || stored === "hu" || stored === "en") return stored;
  } catch {
    /* storage blocked — fall through */
  }
  return "sk";
}

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type HintState = { text: string; left: number; top: number } | null;

export interface UseHoldToConfirmOptions {
  onConfirm: () => void;
  holdMs?: number;
  disabled?: boolean;
  tone?: HoldTone;
  lang?: Lang;
  /** Overrides the default "Hold to delete / archive" hint text. */
  hint?: string;
}

export interface HoldHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
  onLostPointerCapture: (e: React.PointerEvent<HTMLElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  onKeyUp: (e: React.KeyboardEvent<HTMLElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLElement>) => void;
  onClick: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseDown: (e: React.MouseEvent<HTMLElement>) => void;
  onContextMenu: (e: React.MouseEvent<HTMLElement>) => void;
  style: React.CSSProperties;
}

export interface UseHoldToConfirm {
  /** Spread onto the element that is held. */
  bind: HoldHandlers;
  /** 0…1, fills clockwise from 12 o'clock. */
  progress: number;
  holding: boolean;
  /** True for the ~120 ms completion pop. */
  popping: boolean;
  /** Render once next to the element: the "Hold to …" hint portal (or null). */
  hintNode: React.ReactNode;
  /** Id of the hint element, for aria-describedby while it is visible. */
  hintId: string | undefined;
}

export function useHoldToConfirm({
  onConfirm,
  holdMs = HOLD_MS,
  disabled = false,
  tone = "danger",
  lang,
  hint,
}: UseHoldToConfirmOptions): UseHoldToConfirm {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [popping, setPopping] = useState(false);
  const [hintState, setHintState] = useState<HintState>(null);
  const hintId = useId();

  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const holdMsRef = useRef(holdMs);
  holdMsRef.current = holdMs;

  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const progressRef = useRef(0);
  const activeRef = useRef(false);
  // True from the moment onConfirm fires until the pointer/key is released, so a
  // long hold cannot fire twice and a re-press cannot start a second hold.
  const lockedRef = useRef(false);
  const sourceRef = useRef<"pointer" | "key" | null>(null);
  const elRef = useRef<HTMLElement | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const escRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      if (escRef.current) window.removeEventListener("keydown", escRef.current, true);
    };
  }, []);

  const stopLoop = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const setProg = (value: number) => {
    progressRef.current = value;
    if (mountedRef.current) setProgress(value);
  };

  const removeEscListener = () => {
    if (escRef.current) window.removeEventListener("keydown", escRef.current, true);
    escRef.current = null;
  };

  const showHint = () => {
    const el = elRef.current;
    if (!el || !mountedRef.current) return;
    const rect = el.getBoundingClientRect();
    setHintState({
      text: hint ?? holdHint(lang ?? readUiLanguage(), toneVerb(tone)),
      left: rect.left + rect.width / 2,
      top: rect.top,
    });
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => {
      hintTimerRef.current = null;
      if (mountedRef.current) setHintState(null);
    }, HINT_MS);
  };

  const rewind = () => {
    stopLoop();
    const from = progressRef.current;
    if (from <= 0) return;
    const began = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - began) / REWIND_MS);
      setProg(from * (1 - k));
      rafRef.current = k < 1 ? requestAnimationFrame(step) : null;
    };
    rafRef.current = requestAnimationFrame(step);
  };

  /** Ends a hold that did not complete. `early` shows the hint. */
  const cancel = (early: boolean) => {
    if (!activeRef.current) return;
    activeRef.current = false;
    removeEscListener();
    if (mountedRef.current) setHolding(false);
    rewind();
    if (early) showHint();
  };

  const complete = () => {
    activeRef.current = false;
    lockedRef.current = true;
    removeEscListener();
    stopLoop();
    setProg(1);
    if (mountedRef.current) {
      setHolding(false);
      setPopping(true);
    }
    const run = () => {
      if (mountedRef.current) setPopping(false);
      onConfirmRef.current();
    };
    if (prefersReducedMotion()) run();
    else setTimeout(run, POP_MS);
  };

  const begin = (source: "pointer" | "key", el: HTMLElement) => {
    if (disabled || activeRef.current || lockedRef.current) return;
    activeRef.current = true;
    sourceRef.current = source;
    elRef.current = el;
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    if (mountedRef.current) setHintState(null);
    stopLoop();
    startRef.current = performance.now();
    setProg(0);
    if (mountedRef.current) setHolding(true);
    // Escape cancels a hold started with the pointer too; capture phase so a
    // drawer/modal listening for Escape does not close underneath the user.
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !activeRef.current) return;
      e.stopPropagation();
      cancel(false);
    };
    escRef.current = onEsc;
    window.addEventListener("keydown", onEsc, true);
    const tick = (now: number) => {
      if (!activeRef.current) return;
      const elapsed = now - startRef.current;
      if (elapsed >= holdMsRef.current) {
        complete();
        return;
      }
      setProg(elapsed / holdMsRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const release = () => {
    lockedRef.current = false;
    sourceRef.current = null;
  };

  const bind: HoldHandlers = {
    onPointerDown: (e) => {
      // Never let the hold reach row clicks, drawer openers, drag-to-reorder or
      // menu-close handlers.
      e.stopPropagation();
      if (e.button !== 0 || disabled) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or already released pointer */
      }
      begin("pointer", e.currentTarget);
    },
    onPointerUp: (e) => {
      e.stopPropagation();
      if (sourceRef.current !== "pointer") return;
      cancel(true);
      release();
    },
    onPointerCancel: () => {
      if (sourceRef.current !== "pointer") return;
      cancel(false);
      release();
    },
    onLostPointerCapture: () => {
      if (sourceRef.current !== "pointer") return;
      cancel(false);
      release();
    },
    onKeyDown: (e) => {
      if (e.key === "Escape" && activeRef.current) {
        e.stopPropagation();
        cancel(false);
        return;
      }
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      begin("key", e.currentTarget);
    },
    onKeyUp: (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      if (sourceRef.current !== "key") return;
      cancel(true);
      release();
    },
    onBlur: () => {
      if (sourceRef.current === "key") {
        cancel(false);
        release();
      }
    },
    // A click is what a tap or a quick press produces: it must do nothing.
    onClick: (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onMouseDown: (e) => e.stopPropagation(),
    onContextMenu: (e) => e.preventDefault(),
    style: { touchAction: "manipulation", userSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties,
  };

  const hintNode =
    hintState && typeof document !== "undefined"
      ? createPortal(
          <div
            id={hintId}
            role="status"
            className="pointer-events-none fixed z-[100030] -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-caption font-semibold text-white shadow-lg whitespace-nowrap animate-in fade-in duration-150"
            style={{ left: hintState.left, top: hintState.top - 8 }}
          >
            {hintState.text}
          </div>,
          document.body
        )
      : null;

  return { bind, progress, holding, popping, hintNode, hintId: hintState ? hintId : undefined };
}

// ---------------------------------------------------------------------------
// Ring
// ---------------------------------------------------------------------------

const RING_R = 16;
const RING_C = 2 * Math.PI * RING_R;

const TONE_CLASSES: Record<HoldTone, { stroke: string; track: string; fill: string; focus: string }> = {
  danger: {
    stroke: "stroke-rose-500",
    track: "stroke-rose-200",
    fill: "bg-rose-500",
    focus: "focus-visible:ring-rose-400",
  },
  archive: {
    stroke: "stroke-amber-500",
    track: "stroke-amber-200",
    fill: "bg-amber-500",
    focus: "focus-visible:ring-amber-400",
  },
};

/** The progress ring. Fills clockwise from 12 o'clock. */
export function HoldRing({
  progress,
  tone = "danger",
  popping = false,
  label,
  className = "",
}: {
  progress: number;
  tone?: HoldTone;
  popping?: boolean;
  label: string;
  className?: string;
}) {
  const t = TONE_CLASSES[tone];
  const visible = progress > 0;
  return (
    <svg
      viewBox="0 0 36 36"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      className={`pointer-events-none absolute ${popping ? "scale-110" : "scale-100"} transition-transform duration-100 ${visible ? "opacity-100" : "opacity-0"} ${className}`}
    >
      <circle cx="18" cy="18" r={RING_R} fill="none" strokeWidth="3" className={t.track} opacity="0.5" />
      <circle
        cx="18"
        cy="18"
        r={RING_R}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        className={t.stroke}
        strokeDasharray={RING_C}
        strokeDashoffset={RING_C * (1 - progress)}
        // Start at 12 o'clock and run clockwise.
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "children" | "onPointerDown" | "onPointerUp" | "onKeyDown" | "onKeyUp"
>;

export interface HoldToConfirmButtonProps extends ButtonProps {
  onConfirm: () => void;
  tone?: HoldTone;
  holdMs?: number;
  /** UI language. Falls back to the stored app language. */
  lang?: Lang;
  /** What is being acted on, for the accessible name ("Delete: <what>, hold to confirm"). */
  what?: string;
  /** Overrides the "Hold to delete / archive" hint. */
  hint?: string;
  /**
   * Leading icon. When given the ring encircles the icon and the button's
   * background fills faintly in step with progress (text buttons, menu items).
   * Without it the button is icon-only and the ring encircles the button.
   */
  icon?: React.ReactNode;
  /** The visible label, for text buttons and menu items. */
  children?: React.ReactNode;
  /**
   * Renders a plain button that acts on click. For removals that are only a draft
   * (an unsaved new item), where nothing persisted is lost and there is no Undo
   * toast to catch a mistake — the same control, without the hold.
   */
  instant?: boolean;
}

export function HoldToConfirmButton({
  onConfirm,
  tone = "danger",
  holdMs = HOLD_MS,
  lang,
  what = "",
  hint,
  icon,
  children,
  disabled,
  className = "",
  style,
  title,
  instant = false,
  "aria-label": ariaLabel,
  ...rest
}: HoldToConfirmButtonProps) {
  const language = lang ?? readUiLanguage();
  const { bind, progress, holding, popping, hintNode, hintId } = useHoldToConfirm({
    onConfirm,
    holdMs,
    disabled,
    tone,
    lang: language,
    hint,
  });
  const t = TONE_CLASSES[tone];
  const label = ariaLabel ?? holdAriaLabel(language, toneVerb(tone), what || (typeof title === "string" ? title : ""));
  const withLabel = icon !== undefined;

  if (instant) {
    return (
      <button
        type="button"
        {...rest}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel ?? (what || undefined)}
        onClick={(e) => {
          e.stopPropagation();
          onConfirm();
        }}
        className={`cursor-pointer ${className}`}
        style={style}
      >
        {icon}
        {children}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        {...rest}
        {...bind}
        disabled={disabled}
        title={title}
        aria-label={label}
        aria-describedby={hintId ?? rest["aria-describedby"]}
        data-holding={holding || undefined}
        className={`${/(absolute|fixed|sticky)/.test(className) ? "" : "relative"} cursor-pointer outline-none focus-visible:ring-2 ${t.focus} ${className}`}
        style={{ ...style, ...bind.style }}
      >
        {withLabel ? (
          <>
            {/* The control's background fills faintly in step with the hold. */}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 rounded-[inherit] ${t.fill}`}
              style={{ opacity: progress * 0.18 }}
            />
            <span className="relative inline-flex shrink-0 items-center justify-center">
              {icon}
              <HoldRing
                progress={progress}
                tone={tone}
                popping={popping}
                label={label}
                className="-inset-1.5 h-[calc(100%+0.75rem)] w-[calc(100%+0.75rem)]"
              />
            </span>
            {children != null && <span className="relative">{children}</span>}
          </>
        ) : (
          <>
            {children}
            <HoldRing progress={progress} tone={tone} popping={popping} label={label} className="inset-0 h-full w-full" />
          </>
        )}
      </button>
      {hintNode}
    </>
  );
}
