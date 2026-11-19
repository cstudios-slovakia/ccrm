import { formatDuration, type TFn } from "../../utils/timeTracking.ts";
import { showsWorkedAndDelivered } from "../../utils/timeWorked.ts";

/**
 * A person's total: one number, or "Worked · Delivered" when parallel work makes them differ
 * (docs/TIME-TRACKING-V2.md, D9). Worked first, it is what the person did.
 */
export function WorkedDelivered({ worked, delivered, t, plain }: { worked: number; delivered: number; t: TFn; plain?: boolean }) {
  const cls = `block tabular-nums text-teal-700${plain ? "" : " font-bold"}`;
  if (!showsWorkedAndDelivered(delivered, worked)) return <span className={cls}>{formatDuration(worked)}</span>;
  const wl = t("Worked", "Odpracované", "Ledolgozott");
  const dl = t("Delivered", "Dodané", "Leszállított");
  return (
    <span className={cls} title={`${wl} · ${dl}`} data-testid="worked-delivered">
      {formatDuration(worked)}
      <span className="type-meta font-normal text-slate-500"> · {formatDuration(delivered)}</span>
    </span>
  );
}
