import { useTimeTracking } from "../../hooks/useTimeTracking";

/** Small rose "RUNNING" badge with a dot; optional elapsed text after it. */
export function RunningBadge({ elapsed, className = "" }: { elapsed?: string; className?: string }) {
  const { t } = useTimeTracking();
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 text-micro font-bold uppercase tracking-wide text-rose-600 ${className}`} data-testid="running-badge">
      <span className="size-1.5 rounded-full bg-rose-500" />
      {t("Running", "Beží", "Fut")}
      {elapsed && <span className="font-semibold normal-case tabular-nums">· {elapsed}</span>}
    </span>
  );
}
