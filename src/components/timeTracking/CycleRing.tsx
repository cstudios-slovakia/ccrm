import type { ReactNode } from "react";
import { Check, Pause } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { minutesLeft, ringArcs } from "../../utils/timePresenceUi.ts";

interface Props {
  /** The control the ring surrounds (a Stop button, the pill, the container footer). */
  children: ReactNode;
  /** Corner radius of the ring in px, matching the wrapped control. */
  radius?: number;
  /** Replace the wrapped control by "Still working?" / "Resume" in those phases (single Stop buttons). */
  swap?: boolean;
  /** Show the label next to the icon of the replacement button (wide controls). */
  label?: boolean;
  /** Classes of the replacement button, so it keeps the size of the control it replaces. */
  buttonClass?: string;
  className?: string;
}

/**
 * TT2 D8.1: the presence cycle drawn around a control. Tracking: a rose arc fills clockwise;
 * question: the last sixth pulses amber (colour alone under reduced motion) and the control
 * becomes "Still working?"; paused: an empty dashed amber ring and the control becomes Resume.
 * No ring while idle or with presence checks off.
 */
export function CycleRing({ children, radius = 12, swap = false, label = false, buttonClass = "", className = "" }: Props) {
  const { t, presence, presenceView: v, confirm, resumeAll, paused } = useTimeTracking();
  const phase = v.phase;
  const active = !!presence?.enabled && phase !== "idle" && (phase !== "paused" || paused.length > 0);
  if (!active) return <span className={`relative inline-flex ${className}`}>{children}</span>;

  const arcs = ringArcs(phase, v.ringFraction);
  const text =
    phase === "question"
      ? t("Presence check: still working?", "Kontrola prítomnosti: stále pracuješ?", "Jelenlét-ellenőrzés: még dolgozol?")
      : phase === "paused"
        ? t("Paused, resume available", "Pozastavené, možno pokračovať", "Szüneteltetve, folytatható")
        : (() => {
            const n = minutesLeft(v.secondsToPrompt);
            return t(`Presence check in ${n} min`, `Kontrola prítomnosti o ${n} min`, `Jelenlét-ellenőrzés ${n} perc múlva`);
          })();

  let inner = children;
  if (swap && phase === "question") {
    inner = (
      <button type="button" onClick={() => void confirm()} data-testid="cycle-ring-confirm" className={`${buttonClass} bg-amber-500 hover:bg-amber-600`} title={t("Still working?", "Stále pracuješ?", "Még dolgozol?")} aria-label={t("Still working?", "Stále pracuješ?", "Még dolgozol?")}>
        <Check className="size-4" />
        {label && t("Still working?", "Stále pracuješ?", "Még dolgozol?")}
      </button>
    );
  } else if (swap && phase === "paused") {
    inner = (
      <button type="button" onClick={() => void resumeAll()} data-testid="cycle-ring-resume" className={`${buttonClass} bg-amber-500 hover:bg-amber-600`} title={t("Resume", "Pokračovať", "Folytatás")} aria-label={t("Resume", "Pokračovať", "Folytatás")}>
        <Pause className="size-4 fill-current" />
        {label && t("Resume", "Pokračovať", "Folytatás")}
      </button>
    );
  }

  const rect = { x: 1, y: 1, rx: radius, ry: radius, fill: "none", pathLength: 100, style: { width: "calc(100% - 2px)", height: "calc(100% - 2px)" } } as const;
  return (
    <span className={`relative inline-flex ${className}`}>
      {inner}
      <svg role="img" aria-label={text} data-testid="cycle-ring" data-phase={phase} className="pointer-events-none absolute overflow-visible"
        // An <svg> is a replaced element: `inset` alone does not stretch it, it keeps the 300×150
        // default. Size it explicitly to the control plus 3px on each side.
        style={{ top: -3, left: -3, width: "calc(100% + 6px)", height: "calc(100% + 6px)" }}>
        <title>{text}</title>

          {phase === "paused" ? (
            <rect {...rect} stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" />
          ) : (
            <>
              <rect {...rect} stroke="#fecdd3" strokeWidth={2} strokeOpacity={0.5} />
              {arcs.filled > 0 && <rect {...rect} stroke="#e11d48" strokeWidth={2} strokeLinecap="round" strokeDasharray={`${arcs.filled} 100`} />}
              {arcs.alert && <rect {...rect} stroke="#f59e0b" strokeWidth={2.5} strokeLinecap="round" strokeDasharray={`0 ${arcs.alert.start} ${arcs.alert.length} 100`} className="animate-pulse motion-reduce:animate-none" />}
            </>
          )}

      </svg>
    </span>
  );
}
