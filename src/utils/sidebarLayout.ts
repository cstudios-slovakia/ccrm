/**
 * Utilities for managing and normalizing Sidebar navigation groups and layouts.
 */

export interface SidebarGroup {
  id: string;
  title: string;
  items: string[];
}

/**
 * Normalizes stored or custom sidebar groups.
 * Ensures all active items belong to a valid group without duplicates.
 */
export function normalizeSidebarGroups(
  storedGroups: SidebarGroup[] | null | undefined,
  activeItems: string[]
): SidebarGroup[] {
  const allActiveSet = new Set(activeItems);

  if (Array.isArray(storedGroups) && storedGroups.length > 0) {
    const seenItems = new Set<string>();
    const sanitizedGroups: SidebarGroup[] = [];

    for (const grp of storedGroups) {
      if (!grp || typeof grp !== 'object') continue;
      const validItems = (Array.isArray(grp.items) ? grp.items : [])
        .filter((id): id is string => typeof id === 'string' && allActiveSet.has(id) && !seenItems.has(id));

      const hasTitle = typeof grp.title === 'string' && grp.title.trim().length > 0;
      const hasId = typeof grp.id === 'string' && grp.id.trim().length > 0;

      // Skip empty junk objects that have no id, title, or valid items
      if (!hasTitle && !hasId && validItems.length === 0) continue;

      validItems.forEach((id) => seenItems.add(id));

      sanitizedGroups.push({
        id: String(grp.id || `group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
        title: typeof grp.title === 'string' ? grp.title : '',
        items: validItems
      });
    }

    // Any active items that were not in any group are added to the first group (or a new default group)
    const missingItems = activeItems.filter((id) => !seenItems.has(id));
    if (missingItems.length > 0) {
      if (sanitizedGroups.length > 0) {
        sanitizedGroups[0].items.push(...missingItems);
      } else {
        sanitizedGroups.push({
          id: 'group_main',
          title: '',
          items: missingItems
        });
      }
    }

    return sanitizedGroups.length > 0
      ? sanitizedGroups
      : [{ id: 'group_main', title: '', items: [...activeItems] }];
  }

  // If no groups are defined, wrap all active items in a single default group
  return [
    {
      id: 'group_main',
      title: '',
      items: [...activeItems]
    }
  ];
}

/**
 * Flattens groups back into a single ordered list of item IDs.
 */
export function flattenSidebarGroups(groups: SidebarGroup[]): string[] {
  const result: string[] = [];
  for (const grp of groups) {
    if (Array.isArray(grp.items)) {
      result.push(...grp.items);
    }
  }
  return Array.from(new Set(result));
}
