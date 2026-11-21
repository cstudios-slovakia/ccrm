import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tremor cx utility */
export function cx(...args: ClassValue[]): string {
  return twMerge(clsx(...args));
}

/** Tremor focusInput — entity-accent aware */
export const focusInput = [
  "focus:ring-2",
  "focus:ring-entity-ring",
  "focus:border-entity-solid",
];

/** Tremor focusRing — entity-accent aware */
export const focusRing = [
  "outline outline-offset-2 outline-0 focus-visible:outline-2",
  "outline-entity-solid",
];

/** Tremor hasErrorInput */
export const hasErrorInput = [
  "ring-2",
  "border-red-500",
  "ring-red-200",
];
