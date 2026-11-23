/** Mantissas a bar scale may end on: 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10 (times a power of ten). */
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const;

/**
 * The smallest "nice" number that is at least `max`: 7.6 -> 8, 21 -> 25, 2.3 -> 2.5.
 * Nothing to scale (zero, negative, not a number) gives 1, so a bar never divides by zero.
 */
export const niceCeil = (max: number): number => {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const exponent = Math.floor(Math.log10(max));
  const base = 10 ** exponent;
  const mantissa = max / base;
  const step = NICE_STEPS.find((s) => s >= mantissa - 1e-9) ?? 10;
  // toPrecision drops the float noise of 3 * 0.1.
  return Number((step * base).toPrecision(12));
};
