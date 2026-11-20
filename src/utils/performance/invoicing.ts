/**
 * "Na fakturovanie": the invoicable value per status, from the very groups the existing
 * `GroupedStatusValueEquationStats` card is fed, so the totals match what that card shows for
 * the same exclusions.
 *
 * Same rules as that card: a status is excluded when `<groupId>:<item.key>` is in the exclusion
 * list; a status counts its `item.value` (the invoicable value) and `item.count`; the card's
 * subtotal is the sum over the statuses that are not excluded.
 */

import type { StatusStatGroup } from "../../components/GroupedStatusValueEquationStats.tsx";
import type { InvoicingData, InvoicingGroup } from "../../components/dashboard/performance/types.ts";

const GROUP_ID = { pipeline: "leads", projects: "projects" } as const;

const buildGroup = (group: StatusStatGroup | undefined, excluded: ReadonlySet<string>): InvoicingGroup => {
  if (!group) return { rows: [], itemCount: 0, includedStatuses: 0, totalStatuses: 0, total: 0 };

  const rows = group.items.map((item) => ({
    id: item.key,
    label: item.name,
    color: item.color ?? "",
    count: Number(item.count) || 0,
    value: Number(item.value) || 0,
    included: !excluded.has(`${group.id}:${item.key}`),
  }));
  const included = rows.filter((r) => r.included);
  return {
    rows,
    itemCount: included.reduce((sum, r) => sum + r.count, 0),
    includedStatuses: included.length,
    totalStatuses: rows.length,
    total: included.reduce((sum, r) => sum + r.value, 0),
  };
};

export const buildInvoicingData = (groups: readonly StatusStatGroup[], excludedKeys: readonly string[]): InvoicingData => {
  const excluded = new Set(excludedKeys);
  const pipeline = buildGroup(groups.find((g) => g.id === GROUP_ID.pipeline), excluded);
  const projects = buildGroup(groups.find((g) => g.id === GROUP_ID.projects), excluded);
  const total = pipeline.total + projects.total;
  return {
    pipeline,
    projects,
    total,
    itemCount: pipeline.itemCount + projects.itemCount,
    pipelineSharePct: total > 0 ? (pipeline.total / total) * 100 : null,
    projectsSharePct: total > 0 ? (projects.total / total) * 100 : null,
  };
};
