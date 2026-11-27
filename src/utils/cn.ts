import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The type-role font sizes from index.css (`--text-micro` … `--text-metric`).
 *
 * Plain tailwind-merge does not know them and reads `text-ui` as a text colour,
 * so `cn("text-ui", "text-slate-800")` silently dropped the font size and the
 * element fell back to the inherited 16px.
 */
export const TYPE_ROLE_SIZES = ["micro", "caption", "ui", "body", "title-sm", "title", "heading", "display", "metric"] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...TYPE_ROLE_SIZES] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
