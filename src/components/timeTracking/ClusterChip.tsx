import type { ReactNode } from "react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import type { TimeCluster } from "../../utils/timeClusters.ts";
import { formatDuration } from "../../utils/timeTracking.ts";
import { workedAndDeliveredLabel } from "../../utils/timeWorkedView.ts";

/** Header label of a parallel cluster: "∥ 3 · worked 2:24" (D5.5). A label, not a control. */
export function ClusterChip({ cluster, className = "" }: { cluster: TimeCluster; className?: string }) {
  const { t } = useTimeTracking();
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-violet-100 px-2 py-0.5 text-micro font-semibold tabular-nums text-violet-800 ${className}`}
      data-testid="cluster-chip"
      data-count={cluster.count}
      title={workedAndDeliveredLabel(t, cluster.deliveredSec, cluster.workedSec) ?? undefined}
    >
      ∥ {cluster.count} · {t("worked", "odpracované", "ledolgozott")} {formatDuration(cluster.workedSec)}
    </span>
  );
}

/**
 * List and Day: the rows of one cluster in a bordered group with the chip and
 * "Worked · Delivered" for the group in its header.
 */
export function ClusterGroup({ cluster, children }: { cluster: TimeCluster; children: ReactNode }) {
  const { t } = useTimeTracking();
  const both = workedAndDeliveredLabel(t, cluster.deliveredSec, cluster.workedSec);
  return (
    <div className="mx-2 my-1 overflow-hidden rounded-lg border border-violet-200 bg-violet-50/30 transition-colors hover:border-violet-300 motion-reduce:transition-none" data-testid="cluster-group" data-count={cluster.count}>
      <div className="flex flex-wrap items-center gap-2 border-b border-violet-100 px-3 py-1.5">
        <ClusterChip cluster={cluster} />
        {both && <span className="type-meta tabular-nums text-gray-600" data-testid="cluster-worked-delivered">{both}</span>}
      </div>
      <div role="rowgroup" className="divide-y divide-gray-100">{children}</div>
    </div>
  );
}

/**
 * Calendar: one frame per cluster behind the blocks of a day column, spanning the cluster's time
 * range and lanes, with the chip on its top edge. Purely visual (no pointer events), so moving and
 * resizing the blocks inside works as before.
 */
export function ClusterFrames({ blocks, clusters }: { blocks: readonly { id: string; startMin: number; endMin: number; column: number; columns: number }[]; clusters: readonly TimeCluster[] }) {
  const frames = clusters.flatMap((cluster) => {
    const mine = blocks.filter((b) => cluster.ids.includes(b.id));
    if (mine.length < 2) return [];
    const startMin = Math.min(...mine.map((b) => b.startMin));
    const endMin = Math.max(...mine.map((b) => b.endMin));
    const left = Math.min(...mine.map((b) => b.column / b.columns));
    const right = Math.max(...mine.map((b) => (b.column + 1) / b.columns));
    return [{ cluster, startMin, endMin, left, right }];
  });
  return (
    <>
      {frames.map(({ cluster, startMin, endMin, left, right }) => {
        const top = Math.min(Math.max(startMin, 0), 1428);
        return (
          <div
            key={cluster.ids.join("|")}
            data-testid="cluster-frame"
            data-count={cluster.count}
            className="pointer-events-none absolute z-[5] rounded-lg border border-violet-300 bg-violet-50/60"
            style={{
              top: `${(top / 1440) * 100}%`,
              height: `${((Math.min(Math.max(endMin, top + 12), 1440) - top) / 1440) * 100}%`,
              left: `${left * 100}%`,
              width: `${(right - left) * 100}%`,
            }}
          >
            <ClusterChip cluster={cluster} className="absolute -top-4 left-1 shadow-sm" />
          </div>
        );
      })}
    </>
  );
}
