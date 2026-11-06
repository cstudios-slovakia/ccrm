import React from "react";
import { ListViewMenu } from "./common/ListViewMenu";
import { LOCKED_LEAD_COLUMN, moveLeadColumn } from "../utils/leadColumns";
import type { ResolvedLeadColumn, LeadSort, LeadSortKey } from "../utils/leadColumns";

interface LeadListViewMenuProps {
  t: (en: string, sk: string, hu: string) => string;
  sort: LeadSort;
  sortOptions: { value: LeadSortKey; label: string }[];
  onSortChange: (next: LeadSort) => void;
  columns: ResolvedLeadColumn[];
  onColumnsChange: (next: ResolvedLeadColumn[]) => void;
  columnLabel: (col: ResolvedLeadColumn) => string;
  onReset: () => void;
}

/**
 * The leads list's "View" menu: how the rows are ordered and which columns
 * the table draws, in one popover next to the list/kanban switch. A thin
 * wrapper over the shared ListViewMenu, in the leads module's blue.
 */
export const LeadListViewMenu: React.FC<LeadListViewMenuProps> = props => (
  <ListViewMenu<LeadSortKey, ResolvedLeadColumn>
    {...props}
    accent="blue"
    lockedColumnKey={LOCKED_LEAD_COLUMN}
    lockedTitle={props.t("The client name always leads the row.", "Názov klienta je vždy prvý v riadku.", "Az ügyfél neve mindig a sor élén áll.")}
    moveColumn={moveLeadColumn}
    canEditColumns
    columnsScope={props.t(
      "Lead columns layout — saved to your preferences.",
      "Rozloženie stĺpcov leadov — uložené vo vašich preferenciách.",
      "Leadek oszlopelrendezése — elmentve a beállításokba."
    )}
  />
);
