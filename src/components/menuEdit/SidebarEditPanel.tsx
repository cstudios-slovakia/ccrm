import React, { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRightLeft, ArrowUp, Check, Home, Pencil, Pin, PinOff, Plus, Trash, X } from "lucide-react";
import { PRODUCT_NAME } from "../../utils/brand";
import { cn } from "../../utils/cn";
import type { SidebarGroup } from "../../utils/sidebarLayout";
import { getTranslation } from "../../utils/translations";
import type { Language } from "../../utils/translations";
import { DeleteGroupDialog } from "./DeleteGroupDialog";
import { endDragGhost, startDragGhost } from "./dragGhost";
import { menuEditStrings } from "./menuEditStrings";
import { MenuDivider, MenuItem, MenuPopover, MenuRadioItem, MenuSubToggle } from "./MenuPopover";
import { CountChip, Dots, editBtn, Grip, IconButton, Kbd } from "./primitives";
import { SidebarEditAddPopover, type SidebarEditModule } from "./SidebarEditAddPopover";

type NavItem = SidebarEditModule & { customColor?: string };

export interface SidebarEditPanelProps {
  language: Language;
  groups: SidebarGroup[];
  /** Every module that exists (to resolve ids to label/icon). */
  allItems: NavItem[];
  /** Modules the user may pin (visible in this system). */
  availableModules: SidebarEditModule[];
  onStartClick: () => void;
  renamingId: string | null;
  renameValue: string;
  onRenameValue: (value: string) => void;
  onStartRename: (groupId: string, title: string) => void;
  onCancelRename: () => void;
  onSaveRename: (groupId: string, title: string) => void;
  onMoveGroup: (groupId: string, direction: -1 | 1) => void;
  onDeleteGroup: (groupId: string) => void;
  onAddGroup: () => void;
  onMoveItem: (groupId: string, index: number, direction: -1 | 1) => void;
  onMoveItemToGroup: (itemId: string, groupId: string) => void;
  onUnpin: (itemId: string) => void;
  onAddItem: (itemId: string, groupId: string) => void;
  onSetDefault: (itemId: string) => void;
  onCreateDashboard: () => void;
  onItemDragStart: (e: React.DragEvent, itemId: string, groupId: string) => void;
  onItemDragEnd: () => void;
  onDrop: (e: React.DragEvent, groupId?: string, index?: number) => void;
}

type Menu =
  | { kind: "item"; id: string; anchor: HTMLElement }
  | { kind: "group"; id: string; anchor: HTMLElement }
  | { kind: "add"; id: string; anchor: HTMLElement };

type DropTarget = { groupId: string; index: number };

const draggedModuleId = (): string | null => (window as any).__draggedModuleId || null;

/**
 * The desktop sidebar while the menu is being edited ("Bočný panel" of the menu
 * edit design): Start button, banner, grouped rows with ⋯ menus, inline rename,
 * a drop-to-pin state, and a single "new group" button in the footer.
 */
export const SidebarEditPanel: React.FC<SidebarEditPanelProps> = (props) => {
  const { language, groups, allItems, availableModules } = props;
  const s = menuEditStrings(language);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Drag state: module drag over the aside (from here or from the Start menu dialog).
  const [dragId, setDragId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const enterCount = useRef(0);
  const internalDrag = useRef(false);

  const resetDrag = () => {
    enterCount.current = 0;
    internalDrag.current = false;
    setDragId(null);
    setTarget(null);
  };

  useEffect(() => {
    window.addEventListener("dragend", resetDrag);
    window.addEventListener("drop", resetDrag);
    return () => {
      window.removeEventListener("dragend", resetDrag);
      window.removeEventListener("drop", resetDrag);
    };
  }, []);

  const closeMenu = () => {
    setMenu(null);
    setMoveOpen(false);
  };
  const toggleMenu = (kind: Menu["kind"], id: string, el: HTMLElement) => {
    setMoveOpen(false);
    setMenu((cur) => (cur && cur.anchor === el ? null : { kind, id, anchor: el }));
  };

  const pinnedIds = new Set(groups.flatMap((g) => g.items));
  const itemById = (id: string) => allItems.find((i) => i.id === id);
  const groupTitle = (g: SidebarGroup, i: number) => g.title || s.groupFallback(i + 1);
  const dragging = dragId !== null;
  const dragItem = dragId ? itemById(dragId) : undefined;
  const dragIsPinned = dragId ? pinnedIds.has(dragId) : false;

  const aim = (groupId: string, index: number) =>
    setTarget((cur) => (cur && cur.groupId === groupId && cur.index === index ? cur : { groupId, index }));

  const onDragEnter = () => {
    const id = draggedModuleId();
    if (!id) return;
    enterCount.current += 1;
    if (enterCount.current === 1) setDragId(id);
  };
  const onDragLeave = () => {
    if (!dragging) return;
    enterCount.current -= 1;
    if (enterCount.current <= 0) resetDrag();
  };
  const onDropRoot = (e: React.DragEvent) => {
    e.preventDefault();
    const t = target;
    const id = draggedModuleId() || dragId;
    resetDrag();
    if (!t) {
      props.onDrop(e);
      return;
    }
    let index = t.index;
    // The source row leaves its group first, so a later target shifts up by one.
    const src = groups.find((g) => g.id === t.groupId)?.items.indexOf(id || "") ?? -1;
    if (src !== -1 && src < index) index -= 1;
    props.onDrop(e, t.groupId, index);
  };

  const slot = (key: string) =>
    dragItem && (
      <div
        key={key}
        className="h-9 my-0.5 rounded-xl border-2 border-indigo-600 bg-white px-2.5 flex items-center gap-2 text-caption font-semibold text-indigo-700 shrink-0 animate-in fade-in duration-150"
      >
        <Plus className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{s.dropHere(dragItem.label)}</span>
      </div>
    );

  const renderRow = (g: SidebarGroup, id: string, idx: number) => {
    const item = itemById(id);
    if (!item) return null;
    const Icon = item.icon;
    const menuOpen = menu?.kind === "item" && menu.id === id;
    const isSource = dragId === id;
    return (
      <div
        key={id}
        role="listitem"
        tabIndex={0}
        draggable
        data-sidebar-edit-item={id}
        onDragStart={(e) => {
          internalDrag.current = true;
          props.onItemDragStart(e, id, g.id);
          startDragGhost(e, { label: item.label, icon: Icon, color: item.color || item.customColor, pinned: true });
        }}
        onDragEnd={() => {
          props.onItemDragEnd();
          endDragGhost();
          resetDrag();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const r = e.currentTarget.getBoundingClientRect();
          aim(g.id, idx + (e.clientY > r.top + r.height / 2 ? 1 : 0));
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || !e.altKey) return;
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            props.onMoveItem(g.id, idx, e.key === "ArrowUp" ? -1 : 1);
          }
        }}
        className={cn(
          "h-9 flex items-center gap-2.5 pl-2 pr-1 rounded-xl shrink-0 cursor-grab active:cursor-grabbing select-none outline-none",
          "transition-[background-color,height,opacity] duration-150 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500/40",
          menuOpen && "bg-slate-50",
          isSource && internalDrag.current && "h-0 opacity-0 overflow-hidden pointer-events-none"
        )}
      >
        <Grip />
        <Icon className="size-4 shrink-0" style={{ color: item.color || item.customColor }} />
        <span className="flex-1 min-w-0 truncate text-ui font-medium text-slate-800">{item.label}</span>
        <IconButton
          open={menuOpen}
          aria-label={s.itemActions(item.label)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => toggleMenu("item", id, e.currentTarget)}
        >
          <Dots />
        </IconButton>
      </div>
    );
  };

  const renderHeader = (g: SidebarGroup, gi: number) => {
    const title = groupTitle(g, gi);
    if (props.renamingId === g.id) {
      return (
        <div className="pt-3.5 pb-1 pl-1 pr-0.5 flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <input
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              value={props.renameValue}
              aria-label={s.groupName}
              placeholder={s.groupName}
              onChange={(e) => props.onRenameValue(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") props.onSaveRename(g.id, props.renameValue);
                if (e.key === "Escape") props.onCancelRename();
              }}
              className="flex-1 min-w-0 h-9 px-2.5 rounded-xl border border-indigo-500 ring-3 ring-indigo-500/20 bg-white text-ui font-semibold text-slate-800 outline-none"
            />
            <button
              type="button"
              aria-label={s.saveName}
              title={s.saveName}
              onClick={() => props.onSaveRename(g.id, props.renameValue)}
              className="size-9 shrink-0 rounded-xl bg-indigo-50 text-indigo-600 inline-flex items-center justify-center cursor-pointer transition-[background-color,transform] duration-150 hover:bg-indigo-100 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
            >
              <Check className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={s.cancel}
              title={s.cancel}
              onClick={props.onCancelRename}
              className="size-9 shrink-0 rounded-xl text-slate-500 inline-flex items-center justify-center cursor-pointer transition-[background-color,transform] duration-150 hover:bg-slate-100 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <span className="text-caption text-slate-500 pl-1.5">{s.renameHint}</span>
        </div>
      );
    }
    const addOpen = menu?.kind === "add" && menu.id === g.id;
    const optsOpen = menu?.kind === "group" && menu.id === g.id;
    return (
      <div
        className="flex items-center gap-1 pt-3.5 pb-1 pl-2 pr-0.5"
        onDragOver={(e) => {
          e.preventDefault();
          aim(g.id, 0);
        }}
      >
        <span className="type-overline text-slate-500 flex-1 min-w-0 truncate">{title}</span>
        <CountChip count={g.items.length} />
        <IconButton
          open={addOpen}
          aria-label={s.addModuleToGroup(title)}
          aria-haspopup="dialog"
          aria-expanded={addOpen}
          onClick={(e) => toggleMenu("add", g.id, e.currentTarget)}
        >
          <Plus className="size-4" aria-hidden="true" />
        </IconButton>
        <IconButton
          open={optsOpen}
          aria-label={s.groupOptions(title)}
          aria-haspopup="menu"
          aria-expanded={optsOpen}
          onClick={(e) => toggleMenu("group", g.id, e.currentTarget)}
        >
          <Dots />
        </IconButton>
      </div>
    );
  };

  // Popover content ----------------------------------------------------------
  const menuGroupIdx = menu ? groups.findIndex((g) => (menu.kind === "item" ? g.items.includes(menu.id) : g.id === menu.id)) : -1;
  const menuGroup = menuGroupIdx >= 0 ? groups[menuGroupIdx] : undefined;
  const menuItem = menu?.kind === "item" ? itemById(menu.id) : undefined;
  const itemIdx = menu?.kind === "item" && menuGroup ? menuGroup.items.indexOf(menu.id) : -1;
  const act = (fn: () => void) => () => {
    closeMenu();
    fn();
  };

  const deleteGroup = deleteId ? groups.find((g) => g.id === deleteId) : undefined;
  const deleteIdx = deleteGroup ? groups.indexOf(deleteGroup) : -1;
  const firstRemaining = deleteGroup ? groups.findIndex((g) => g.id !== deleteGroup.id) : -1;

  return (
    <div
      className="flex flex-col flex-1 min-h-0 w-full"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={onDropRoot}
    >
      {/* Start button */}
      <div className="pt-4 px-3 pb-2 shrink-0">
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            props.onStartClick();
          }}
          className="w-full flex items-center gap-3 p-2 px-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-left cursor-pointer transition-[background-color,border-color,transform] duration-150 hover:bg-slate-100 hover:border-slate-300 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
        >
          <span className="flex flex-col items-center gap-1 shrink-0">
            <span className="flex gap-1">
              <span className="size-2 rounded-full bg-orange-500" />
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="size-2 rounded-full bg-indigo-500" />
            </span>
            <span className="text-micro leading-none font-semibold text-slate-600">Start</span>
          </span>
          <span className="flex flex-col min-w-0">
            <span className="text-body font-bold text-slate-800 truncate">{PRODUCT_NAME}</span>
            <span className="text-caption text-slate-500 truncate">{getTranslation(language, "sidebar.command_center")}</span>
          </span>
        </button>
      </div>

      {/* Banner */}
      <div className="mx-3 my-1 px-3 py-2.5 rounded-2xl bg-indigo-50 flex flex-col gap-1 shrink-0">
        <span className="flex items-center gap-1.5 text-ui font-semibold text-indigo-700">
          <Pencil className="size-4 shrink-0" aria-hidden="true" />
          {s.editingMenu}
        </span>
        <span className="text-caption text-slate-600">{s.sidebarHint}</span>
      </div>

      {/* Groups */}
      <nav className="flex-1 min-h-0 px-3 relative flex flex-col" aria-label={s.editingMenu}>
        <div
          role="list"
          className={cn(
            "flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex flex-col pb-14 transition-colors duration-150 rounded-2xl",
            dragging && "border-2 border-dashed border-indigo-300 bg-indigo-50/50 px-1.5 py-2.5"
          )}
        >
          {dragging && !dragIsPinned && (
            <div className="flex items-center gap-2 px-2.5 py-2 mb-1 rounded-xl bg-indigo-100 text-indigo-700 text-ui font-semibold shrink-0 animate-in fade-in duration-150">
              <Pin className="size-4 shrink-0" aria-hidden="true" />
              {s.dropToPin}
            </div>
          )}
          {groups.map((g, gi) => (
            <div key={g.id} className="flex flex-col shrink-0">
              {renderHeader(g, gi)}
              {g.items.length === 0 ? (
                target?.groupId === g.id && dragging ? (
                  slot(`slot-${g.id}`)
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      aim(g.id, 0);
                    }}
                    className="h-9 rounded-xl border border-dashed border-slate-200 flex items-center px-3 text-caption text-slate-400"
                  >
                    {s.emptyGroupDrop}
                  </div>
                )
              ) : (
                <>
                  {g.items.map((id, idx) => (
                    <React.Fragment key={id}>
                      {dragging && target?.groupId === g.id && target.index === idx && slot(`slot-${idx}`)}
                      {renderRow(g, id, idx)}
                    </React.Fragment>
                  ))}
                  {dragging && target?.groupId === g.id && target.index >= g.items.length && slot("slot-end")}
                </>
              )}
            </div>
          ))}
        </div>
        <div
          aria-hidden="true"
          className="absolute left-3 right-3 bottom-0 h-14 pointer-events-none bg-gradient-to-b from-white/0 to-white"
        />
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-slate-100 shrink-0">
        <button type="button" className={cn(editBtn.base, editBtn.secondary, "w-full")} onClick={props.onAddGroup}>
          <Plus className="size-4" aria-hidden="true" />
          {s.newSidebarGroup}
        </button>
      </div>

      {/* Menus */}
      {menu?.kind === "item" && menuItem && menuGroup && (
        <MenuPopover anchor={menu.anchor} onClose={closeMenu} ariaLabel={s.itemActions(menuItem.label)}>
          <MenuItem icon={Home} label={s.setAsStart} onClick={act(() => props.onSetDefault(menu.id))} />
          <MenuItem icon={PinOff} label={s.unpinFromSidebar} onClick={act(() => props.onUnpin(menu.id))} />
          <MenuDivider />
          <MenuSubToggle icon={ArrowRightLeft} label={s.moveToGroup} expanded={moveOpen} onClick={() => setMoveOpen((v) => !v)} />
          {moveOpen &&
            groups.map((g, gi) => (
              <MenuRadioItem
                key={g.id}
                checked={g.id === menuGroup.id}
                label={groupTitle(g, gi)}
                onClick={act(() => {
                  if (g.id !== menuGroup.id) props.onMoveItemToGroup(menu.id, g.id);
                })}
              />
            ))}
          <MenuDivider />
          <MenuItem
            icon={ArrowUp}
            label={s.moveUp}
            trailing={<Kbd>{s.kbdUp}</Kbd>}
            disabled={itemIdx <= 0}
            onClick={act(() => props.onMoveItem(menuGroup.id, itemIdx, -1))}
          />
          <MenuItem
            icon={ArrowDown}
            label={s.moveDown}
            trailing={<Kbd>{s.kbdDown}</Kbd>}
            disabled={itemIdx < 0 || itemIdx >= menuGroup.items.length - 1}
            onClick={act(() => props.onMoveItem(menuGroup.id, itemIdx, 1))}
          />
        </MenuPopover>
      )}

      {menu?.kind === "group" && menuGroup && (
        <MenuPopover anchor={menu.anchor} onClose={closeMenu} ariaLabel={s.groupOptions(groupTitle(menuGroup, menuGroupIdx))}>
          <MenuItem icon={Pencil} label={s.rename} onClick={act(() => props.onStartRename(menuGroup.id, groupTitle(menuGroup, menuGroupIdx)))} />
          <MenuItem icon={ArrowUp} label={s.moveUp} disabled={menuGroupIdx === 0} onClick={act(() => props.onMoveGroup(menuGroup.id, -1))} />
          <MenuItem
            icon={ArrowDown}
            label={s.moveDown}
            disabled={menuGroupIdx === groups.length - 1}
            onClick={act(() => props.onMoveGroup(menuGroup.id, 1))}
          />
          <MenuDivider />
          <MenuItem
            icon={Trash}
            danger
            label={s.deleteGroupEllipsis}
            disabled={groups.length <= 1}
            onClick={act(() => setDeleteId(menuGroup.id))}
          />
        </MenuPopover>
      )}

      {menu?.kind === "add" && menuGroup && (
        <SidebarEditAddPopover
          anchor={menu.anchor}
          onClose={closeMenu}
          language={language}
          groupName={groupTitle(menuGroup, menuGroupIdx)}
          modules={availableModules}
          pinnedIds={pinnedIds}
          onAdd={(id) => {
            closeMenu();
            props.onAddItem(id, menuGroup.id);
          }}
          onCreateDashboard={props.onCreateDashboard}
        />
      )}

      <DeleteGroupDialog
        open={!!deleteGroup}
        title={s.deleteGroupTitle(deleteGroup ? groupTitle(deleteGroup, deleteIdx) : "")}
        body={
          deleteGroup && deleteGroup.items.length > 0 && firstRemaining >= 0
            ? s.deleteSidebarGroupBody(deleteGroup.items.length, groupTitle(groups[firstRemaining], firstRemaining))
            : s.deleteSidebarGroupEmpty
        }
        note={s.deleteSidebarGroupNote}
        cancelLabel={s.cancel}
        confirmLabel={s.deleteGroup}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteGroup) props.onDeleteGroup(deleteGroup.id);
          setDeleteId(null);
        }}
      />
    </div>
  );
};
