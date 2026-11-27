import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRightLeft, Layers } from "lucide-react";
import type { TFn } from "../../utils/timeTracking";
import { entityAccentStyle } from "../../utils/entityAccent";

/**
 * Time tracking v2 (C3, D5.4): a Start while something runs, with the preference "ask".
 *
 * A small popover next to the clicked control: "Switch to this" (focused, so Enter picks it) and
 * "Run in parallel (N running)" when the company allows parallel timers, plus "Remember my choice".
 * The `fallback` variant follows a parallel start the server refused (`parallel_disabled` /
 * `parallel_forbidden`): it offers only "Switch instead". Esc or a click outside cancels; focus
 * returns to the control that opened it. Rendered by `TimeTrackingProvider`.
 */
export interface StartModePopoverProps {
  /** The clicked control's box; null centres the popover near the top of the window. */
  anchor: DOMRect | null;
  variant: "ask" | "fallback";
  /** How many timers run now (the "(2 running)" of the parallel button counts the new one too). */
  runningCount: number;
  /** settings.parallel.enabled: without it the parallel choice is not offered. */
  parallelEnabled: boolean;
  /** The fallback's reason (the refusal, translated). */
  message?: string;
  t: TFn;
  onChoose: (mode: "switch" | "parallel", remember: boolean) => void;
  onCancel: () => void;
}

const WIDTH = 288;
const GAP = 8;
const MARGIN = 12;

export function StartModePopover({ anchor, variant, runningCount, parallelEnabled, message, t, onChoose, onCancel }: StartModePopoverProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const switchRef = useRef<HTMLButtonElement | null>(null);
  const [remember, setRemember] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const offerParallel = variant === "ask" && parallelEnabled;

  // Below the control, or above it when the window ends first; always inside the window.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = box.offsetHeight;
    const w = Math.min(WIDTH, vw - MARGIN * 2);
    if (!anchor) {
      setPos({ top: Math.min(96, Math.max(MARGIN, vh - h - MARGIN)), left: Math.max(MARGIN, (vw - w) / 2) });
      return;
    }
    let top = anchor.bottom + GAP;
    if (top + h > vh - MARGIN && anchor.top - GAP - h >= MARGIN) top = anchor.top - GAP - h;
    top = Math.max(MARGIN, Math.min(top, vh - h - MARGIN));
    const left = Math.max(MARGIN, Math.min(anchor.left, vw - w - MARGIN));
    setPos({ top, left });
  }, [anchor]);

  // Focus the default choice; give focus back to whatever had it when the popover closes.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    switchRef.current?.focus();
    return () => {
      if (before && before.isConnected) before.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (boxRef.current && e.target instanceof Node && !boxRef.current.contains(e.target)) onCancel();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
    };
  }, [onCancel]);

  if (typeof document === "undefined") return null;
  const choiceClass =
    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-ui font-semibold transition-all duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

  return createPortal(
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="false"
      aria-label={t("Start while a timer runs", "Spustiť, kým beží časovač", "Indítás futó időzítő mellett")}
      data-testid="start-mode-popover"
      className="fixed z-[100001] rounded-lg border border-gray-200/80 bg-white p-2 shadow-lg animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none"
      style={{ ...(entityAccentStyle("time-tracking") as React.CSSProperties), width: Math.min(WIDTH, typeof window !== "undefined" ? window.innerWidth - MARGIN * 2 : WIDTH), top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
    >
      {message && <p className="px-3 pb-2 pt-1 type-meta text-gray-500">{message}</p>}
      <button
        ref={switchRef}
        type="button"
        onClick={() => onChoose("switch", remember)}
        data-testid="start-mode-switch"
        className={`${choiceClass} bg-entity-solid text-white hover:opacity-90 focus-visible:outline-entity`}
      >
        <ArrowRightLeft className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {variant === "fallback" ? t("Switch instead", "Prepnúť namiesto toho", "Inkább váltás") : t("Switch to this", "Prepnúť na toto", "Váltás erre")}
        </span>
        <kbd className="rounded-md border border-white/30 px-1 text-micro font-medium opacity-80">Enter</kbd>
      </button>
      {offerParallel && (
        <button
          type="button"
          onClick={() => onChoose("parallel", remember)}
          data-testid="start-mode-parallel"
          className={`${choiceClass} mt-1 text-gray-700 hover:bg-gray-100 focus-visible:outline-entity`}
        >
          <Layers className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            {t(`Run in parallel (${runningCount + 1} running)`, `Spustiť paralelne (${runningCount + 1} bežia)`, `Párhuzamos futtatás (${runningCount + 1} fut)`)}
          </span>
        </button>
      )}
      {variant === "ask" && (
        <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 type-meta text-gray-500 transition-colors hover:bg-gray-50 motion-reduce:transition-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            data-testid="start-mode-remember"
            className="size-4 rounded border-gray-300 accent-[var(--entity-accent-solid)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-entity"
          />
          {t("Remember my choice", "Zapamätať si moju voľbu", "Választásom megjegyzése")}
        </label>
      )}
      <button
        type="button"
        onClick={onCancel}
        className={`${choiceClass} mt-1 justify-center font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-entity`}
      >
        {t("Cancel", "Zrušiť", "Mégse")}
      </button>
    </div>,
    document.body,
  );
}
