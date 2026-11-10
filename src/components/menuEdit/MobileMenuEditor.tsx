import React from "react";
import type { Language } from "../../utils/translations";
import type { SidebarGroup } from "../../utils/sidebarLayout";

/**
 * Mobile "Upraviť menu" (below `lg`): edits the sidebar groups, which on a phone
 * are the modules of the bottom bar. Mounted by Sidebar while the Start menu is
 * in edit mode; it covers the Start menu (which hides its own edit dialog below
 * `lg`).
 *
 * Artboards: "Mobil · Bočný panel v úpravách", "Mobil · Akcie položky",
 * "Mobil · Pridať modul".
 */
export interface MobileMenuEditorItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color?: string;
  /** Custom dashboard (`dash_*`) or custom table (`ue_*`). */
  kind?: "dashboard" | "table";
}

export interface MobileMenuEditorProps {
  open: boolean;
  language: Language;
  /** Sidebar groups in order, each with its item ids in order. */
  groups: SidebarGroup[];
  /** Every module the user may see (visible in the system), pinned or not. */
  items: MobileMenuEditorItem[];
  /** Current start screen module id. */
  defaultPage: string;
  onSetDefaultPage: (id: string) => void;
  /** "Hotovo": leave edit mode (closes the Start menu too). */
  onDone: () => void;
  onMoveItemInGroup: (groupId: string, indexInGroup: number, direction: -1 | 1) => void;
  onMoveItemToGroup: (itemId: string, targetGroupId: string) => void;
  /** Drag result: put `itemId` into `groupId` at `index` (removed from wherever it was). */
  onInsertItem: (itemId: string, groupId: string, index: number) => void;
  /** Unpin from the sidebar (stays in the Start menu). */
  onUnpinItem: (itemId: string) => void;
  /** Pin an unpinned module into a group (appended). */
  onAddItemToGroup: (itemId: string, groupId: string) => void;
  onAddGroup: () => void;
  onRenameGroup: (groupId: string, title: string) => void;
  onMoveGroup: (groupId: string, direction: -1 | 1) => void;
  /** Deletes with an Undo toast; ask first with DeleteGroupDialog. Items go to the first remaining group. */
  onDeleteGroup: (groupId: string) => void;
  onCreateCustomDashboard?: () => void;
}

export const MobileMenuEditor: React.FC<MobileMenuEditorProps> = () => null;
