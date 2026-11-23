import type { Lead, Project } from "../../types";
import { isClientRecord } from "../../utils/clientRecord.ts";
import { resolveLinkedClient } from "../../utils/leadClient.ts";
import { formatDuration, type TFn } from "../../utils/timeTracking.ts";

/** How many of the newest project ids count as "recent". */
export const RECENT_LIMIT = 5;

/** The client of a project, by id (its own client, or the client its lead is linked to), never by name. */
export const clientOfProject = (project: Project, leads: readonly Lead[]): Lead | undefined => {
  if (project.clientId) {
    const c = leads.find((l) => l.id === project.clientId);
    if (c) return c;
  }
  const lead = project.leadId ? leads.find((l) => l.id === project.leadId) : undefined;
  if (!lead) return undefined;
  if (isClientRecord(lead)) return lead;
  return resolveLinkedClient(lead, leads as Lead[]) ?? lead;
};

export interface PickerGroup {
  key: string;
  /** Null for the neutral group of projects without a client. */
  clientName: string | null;
  items: Project[];
}

/**
 * Each project once, under its client. Recent projects come first inside a group (newest first),
 * and groups holding a recent project come first; projects without a client sit last.
 */
export function groupProjects(
  visible: readonly Project[],
  leads: readonly Lead[],
  recentIds: readonly string[],
  nameOf: (p: Project) => string,
): PickerGroup[] {
  const rank = new Map(recentIds.slice(0, RECENT_LIMIT).map((id, i) => [id, i]));
  const byClient = new Map<string, PickerGroup>();
  for (const p of visible) {
    const c = clientOfProject(p, leads);
    const key = c?.id ?? "_none";
    const group = byClient.get(key) ?? { key, clientName: c ? c.name ?? "" : null, items: [] };
    group.items.push(p);
    byClient.set(key, group);
  }
  const best = (g: PickerGroup) => Math.min(...g.items.map((p) => rank.get(p.id) ?? Infinity));
  for (const g of byClient.values()) {
    g.items.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || nameOf(a).localeCompare(nameOf(b)));
  }
  return [...byClient.values()].sort((a, b) => {
    if (a.clientName === null) return 1;
    if (b.clientName === null) return -1;
    const diff = best(a) - best(b);
    return (Number.isNaN(diff) ? 0 : diff) || (a.clientName ?? "").localeCompare(b.clientName ?? "");
  });
}

/** "Recent · 3:27 this week", "3:27 this week", "Recent · No time this week" or "No time this week". */
export function optionMeta(recent: boolean, weekSeconds: number | undefined, t: TFn): string {
  const mark = t("Recent", "Nedávne", "Legutóbbi");
  if (weekSeconds && weekSeconds > 0) {
    const time = `${formatDuration(weekSeconds)} ${t("this week", "tento týždeň", "ezen a héten")}`;
    return recent ? `${mark} · ${time}` : time;
  }
  const none = t("No time this week", "Tento týždeň bez času", "Ezen a héten nincs idő");
  return recent ? `${mark} · ${none}` : none;
}
