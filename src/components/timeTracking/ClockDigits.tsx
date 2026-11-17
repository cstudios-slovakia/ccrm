import type { HTMLAttributes } from "react";

/**
 * A duration such as `0:19:22` whose width does not change as it ticks.
 *
 * `tabular-nums` is not enough: the app font (Google Sans) and some themes have no tabular
 * figures, so a "1" is narrower than a "0" and a running timer made its whole row twitch every
 * second. Each digit gets its own 1ch slot instead; separators keep their natural width.
 */
export function ClockDigits({ value, className = "", ...rest }: { value: string } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`inline-flex whitespace-nowrap ${className}`} {...rest}>
      {Array.from(value, (ch, i) =>
        ch >= "0" && ch <= "9" ? (
          <span key={i} className="inline-block w-[1ch] text-center">
            {ch}
          </span>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </span>
  );
}
