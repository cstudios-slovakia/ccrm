import type { ButtonHTMLAttributes } from "react";
import { Pause, Play, Square } from "lucide-react";

export type RoundTimerKind = "start" | "stop" | "pause" | "resume";
type RoundSize = "lg" | "md" | "touch";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> {
  kind: RoundTimerKind;
  /** The accessible name and the tooltip (the button has no visible text). */
  label: string;
  /** lg: the timer bar; md: a row of the parallel container; touch: the phone sheet. */
  size?: RoundSize;
  "data-testid"?: string;
}

const TONE: Record<RoundTimerKind, string> = {
  start: "bg-primary text-primary-foreground shadow-sm hover:opacity-90",
  stop: "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
  pause: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100",
  resume: "bg-teal-50 text-teal-800 hover:bg-teal-100",
};

const SIZE: Record<RoundSize, string> = { lg: "size-12", md: "size-9", touch: "size-11" };

/** Classes a CycleRing's replacement button needs to keep the size of the round control it replaces. */
export const roundButtonClass = (size: RoundSize = "lg") =>
  `inline-flex ${SIZE[size]} shrink-0 items-center justify-center rounded-full text-white transition-all active:scale-95 cursor-pointer`;

/** Corner radius for a CycleRing drawn around a round button of this size. */
export const roundButtonRadius = (size: RoundSize = "lg") => (size === "lg" ? 24 : size === "touch" ? 22 : 18);

/**
 * The one round, icon-only timer control: Start, Stop, Pause and Resume in the timer bar, the parallel
 * container and the phone sheet. The label is the accessible name and the tooltip.
 */
export function RoundTimerButton({ kind, label, size = "lg", ...rest }: Props) {
  const Icon = kind === "start" || kind === "resume" ? Play : kind === "stop" ? Square : Pause;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={`inline-flex ${SIZE[size]} shrink-0 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${TONE[kind]}`}
    >
      <Icon className={`${size === "lg" ? "size-4" : "size-3.5"} fill-current ${kind === "start" || kind === "resume" ? "ml-0.5" : ""}`} />
    </button>
  );
}
