// The 1-5 star priority a lead or a project carries, and the one set of rules
// for narrowing a list down by it.
//
// Extracted from LeadsDatagrid when projects gained a rating of their own: the
// two lists offer the same dropdown, so "★★★★ and up" has to mean the same
// thing in both — and can be tested once instead of read twice.

/**
 * What the rating dropdown can be set to:
 *   "all"        every row, rated or not
 *   "min4"/"min3" that many stars or more
 *   "5".."1"     exactly that many
 *   "none"       never rated
 *
 * Kept as strings because that is what a `<select>` carries, and what the
 * callers already store in their filter state.
 */
export type RatingFilter = "all" | "none" | `min${number}` | `${number}`;

/** A rating that was never set reads as 0 — the only value "not rated" matches. */
export const ratingValue = (rating?: number | null): number =>
  typeof rating === "number" && Number.isFinite(rating) ? rating : 0;

/**
 * Does this row survive the dropdown? An unrecognised filter lets everything
 * through rather than emptying the list — a stored preference from a future
 * version must never look like "you have no projects".
 */
export function matchesRatingFilter(rating: number | null | undefined, filter: string): boolean {
  if (!filter || filter === "all") return true;
  const value = ratingValue(rating);
  if (filter === "none") return value === 0;
  if (filter.startsWith("min")) {
    const min = Number(filter.slice(3));
    return Number.isFinite(min) ? value >= min : true;
  }
  const exact = Number(filter);
  return Number.isFinite(exact) ? value === exact : true;
}

/**
 * The dropdown's rows, in the order the leads list has always shown them.
 * `t` is the caller's own three-language helper, so the options speak whatever
 * the rest of that screen speaks.
 */
export function ratingFilterOptions(
  t: (en: string, sk: string, hu: string) => string,
): { value: string; label: string }[] {
  const andUp = t("and up", "a viac", "és felette");
  return [
    { value: "all", label: t("All ratings", "Všetky hodnotenia", "Minden értékelés") },
    { value: "min4", label: `★★★★ ${andUp}` },
    { value: "min3", label: `★★★ ${andUp}` },
    ...[5, 4, 3, 2, 1].map((stars) => ({
      value: String(stars),
      label: `${"★".repeat(stars)}${"☆".repeat(5 - stars)}`,
    })),
    { value: "none", label: t("Not rated", "Bez hodnotenia", "Nincs értékelve") },
  ];
}
