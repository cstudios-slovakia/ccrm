import type { ButtonHTMLAttributes } from "react";
import { Pause, Play, Square } from "lucide-react";

export type RoundTimerKind = "start" | "stop" | "pause" | "resume";
type RoundSize = "xl" | "pill" | "lg" | "md" | "touch";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> {
  kind: RoundTimerKind;
  /** The accessible name and the tooltip (the button has no visible text). */
  label: string;
  /** lg: the timer bar; md: a row of the parallel container; touch: the phone sheet; pill: the header pill (header control height minus its border and a 2px gap). */
  size?: RoundSize;
  "data-testid"?: string;
}

const TONE: Record<RoundTimerKind, string> = {
  start: "bg-entity-solid text-white shadow-sm hover:opacity-90",
  stop: "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
  pause: "border border-gray-200 bg-white text-gray-700 hover:bg-gray-100",
  resume: "bg-entity-subtle text-entity-text hover:bg-entity-muted",
};

const SIZE: Record<RoundSize, string> = { xl: "size-16", pill: "size-6.5 xs:size-7 sm:size-8", lg: "size-12", md: "size-9", touch: "size-11" };

/** Classes a CycleRing's replacement button needs to keep the size of the round control it replaces. */
export const roundButtonClass = (size: RoundSize = "lg") =>
  `inline-flex ${SIZE[size]} shrink-0 items-center justify-center rounded-full text-white transition-all active:scale-95 cursor-pointer`;

/** Corner radius for a CycleRing drawn around a round button of this size. */
export const roundButtonRadius = (size: RoundSize = "lg") => (size === "xl" ? 32 : size === "lg" ? 24 : size === "touch" ? 22 : size === "pill" ? 16 : 18);

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
      className={`inline-flex ${SIZE[size]} shrink-0 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-entity ${TONE[kind]}`}
    >
      <Icon className={`${size === "xl" ? "size-5" : size === "lg" ? "size-4" : "size-3.5"} fill-current ${kind === "start" || kind === "resume" ? "ml-0.5" : ""}`} />
    </button>
  );
}
