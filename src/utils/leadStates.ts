export type LeadStageGroup = "new" | "in_progress" | "closed";

// The pipeline is always read in this order: incoming leads, work in progress, closed deals.
const GROUP_ORDER: LeadStageGroup[] = ["new", "in_progress", "closed"];

const resolveGroup = (
  state: string,
  leadStageGroups: Record<string, string>,
): LeadStageGroup => {
  const group = leadStageGroups[state.toLowerCase()];
  return group === "new" || group === "closed" ? group : "in_progress";
};

/*
  Canonical pipeline order of the lead states.

  Settings renders the states grouped (new -> in progress -> closed) with every
  substate directly under its parent, while the stored `leadStates` array keeps
  the raw insertion order — a state added later lands at the end of the array
  even when its group places it in the middle. Every consumer (progress bars,
  state overview, kanban, next-state suggestions) has to sort the raw array the
  same way Settings displays it, otherwise the phases show up out of order.
*/
export const orderLeadStates = (
  leadStates: string[],
  leadStageGroups: Record<string, string> = {},
  leadStateParents: Record<string, string> = {},
): string[] => {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (state: string) => {
    if (seen.has(state)) return;
    seen.add(state);
    ordered.push(state);
  };

  GROUP_ORDER.forEach(group => {
    const groupStates = leadStates.filter(s => resolveGroup(s, leadStageGroups) === group);

    groupStates
      .filter(s => !leadStateParents[s.toLowerCase()])
      .forEach(major => {
        push(major);
        groupStates.forEach(sub => {
          if (leadStateParents[sub.toLowerCase()] === major.toLowerCase()) push(sub);
        });
      });

    // Substates whose parent lives in another group (or no longer exists)
    groupStates.forEach(push);
  });

  // Safety net: never drop a state, whatever the maps contain
  leadStates.forEach(push);

  return ordered;
};
