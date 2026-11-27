import type { TreeItem } from "./subStatusTree.ts";

/** Lead states are three loose maps in settings; the shared sub-status rules work on one list. */

export const LEAD_STATE_GROUPS = ["new", "in_progress", "closed"] as const;

export interface LeadTreeItem extends TreeItem {
  /** The state name as stored in `leadStates` (keys are its lower case). */
  name: string;
}

export const leadTreeItems = (
  states: readonly string[],
  groups: Record<string, string>,
  parents: Record<string, string>,
): LeadTreeItem[] =>
  states.map((name) => {
    const key = name.toLowerCase();
    return { key, name, group: groups[key] || "in_progress", ...(parents[key] ? { parent: parents[key] } : {}) };
  });

/** Back to the three maps the settings store. */
export const leadTreeMaps = (items: readonly LeadTreeItem[]) => ({
  states: items.map((i) => i.name),
  groups: Object.fromEntries(items.map((i) => [i.key, i.group])) as Record<string, "new" | "in_progress" | "closed">,
  parents: Object.fromEntries(items.filter((i) => i.parent).map((i) => [i.key, i.parent as string])),
});
