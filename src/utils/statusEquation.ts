/**
 * Which statuses the "Invoicable value by status" widget leaves out of its sums.
 *
 * The lead phases and project statuses are editable in Settings, so the widget
 * cannot carry a fixed list. It stores only what the user picked. Until they pick
 * anything it follows the status settings: closed phases and statuses (won, lost,
 * completed, cancelled, archived…) are out, everything still in play is in.
 */

export interface EquationStatusOption {
  key: string;
  label: string;
  color: string;
  /** Closed in the status settings — excluded unless the user chose otherwise. */
  closed: boolean;
}

/** The keys left out of the sums: the user's pick, else every closed status. */
export const excludedStatusKeys = (
  options: readonly { key: string; closed?: boolean }[],
  picked: readonly string[] | undefined
): Set<string> =>
  Array.isArray(picked)
    ? new Set(picked)
    : new Set(options.filter((option) => option.closed).map((option) => option.key));

/**
 * The setting after one status is flipped in or out of the sums.
 *
 * `undefined` means "no pick": it is returned when the result lands exactly on
 * the default, so the widget goes on following the status settings (a phase
 * closed there later drops out on its own). Keys no longer in `options` — a
 * status deleted in Settings — are dropped rather than carried forever.
 */
export const toggleExcludedStatus = (
  options: readonly { key: string; closed?: boolean }[],
  picked: readonly string[] | undefined,
  key: string
): string[] | undefined => {
  const next = excludedStatusKeys(options, picked);
  if (next.has(key)) next.delete(key);
  else next.add(key);

  const known = options.map((option) => option.key).filter((k) => next.has(k));
  const defaults = options.filter((option) => option.closed).map((option) => option.key);
  const isDefault = known.length === defaults.length && defaults.every((k) => known.includes(k));
  return isDefault ? undefined : known;
};
