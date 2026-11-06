import React from "react";
import { ListViewMenu } from "./common/ListViewMenu";
import { LOCKED_PROJECT_COLUMN, moveProjectColumn } from "../utils/projectColumns";
import type { ResolvedProjectColumn } from "../utils/projectColumns";
import type { ProjectSort, ProjectSortKey } from "../utils/projectSort";

interface ProjectListViewMenuProps {
  t: (en: string, sk: string, hu: string) => string;
  sort: ProjectSort;
  sortOptions: { value: ProjectSortKey; label: string }[];
  onSortChange: (next: ProjectSort) => void;
  /** Set when the current view ignores the sort (the structure): shown in place of the sort controls. */
  sortNote?: string;
  /** Every column the table can show, hidden ones included, in order. */
  columns: ResolvedProjectColumn[];
  onColumnsChange: (next: ResolvedProjectColumn[]) => void;
  columnLabel: (col: ResolvedProjectColumn) => string;
  /** False when the layout belongs to a project type the user may not edit. */
  canEditColumns: boolean;
  /** One line under the column list saying whose layout it is. */
  columnsScope: string;
  /** "Use default settings": default order and the type's default columns. */
  onReset: () => void;
}

const DIRECTIONLESS: readonly ProjectSortKey[] = ["default", "manual"];

/**
 * The projects list's "View" menu: how the rows are ordered and which columns
 * the table draws, in one popover next to the cards/table switch. A thin
 * wrapper over the shared ListViewMenu.
 */
export const ProjectListViewMenu: React.FC<ProjectListViewMenuProps> = props => (
  <ListViewMenu<ProjectSortKey, ResolvedProjectColumn>
    {...props}
    directionlessKeys={DIRECTIONLESS}
    lockedColumnKey={LOCKED_PROJECT_COLUMN}
    lockedTitle={props.t("The project name always leads the row.", "Názov projektu je vždy prvý v riadku.", "A projekt neve mindig a sor élén áll.")}
    moveColumn={moveProjectColumn}
  />
);
