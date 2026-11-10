import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, EyeOff, Pin, Plus, Search, X } from "lucide-react";
import { cn } from "../../utils/cn";
import type { Language } from "../../utils/translations";
import { useConfirmDialog } from "../ui/ConfirmDialog";
import type { NavMenuItem } from "../StartMenu";
import { Dots, CountChip, Grip, IconButton, editBtn } from "./primitives";
import { menuEditStrings } from "./menuEditStrings";
import { DeleteGroupDialog } from "./DeleteGroupDialog";
import { endDragGhost, startDragGhost } from "./dragGhost";
import { EditRow, HiddenRow } from "./StartMenuEditRow";
import {
  AddModulePopover,
  GroupMenu,
  HeaderMenu,
  ItemMenu,
  StartScreenMenu,
  type EditGroup,
} from "./StartMenuEditMenus";

/**
 * Desktop "Upraviť menu" dialog of the Start menu (Main / ItemMenu / GroupDelete /
 * Drag artboards). Pure view plus interaction state: every change to the layout
 * goes out through a callback and StartMenu persists it.
 *
 * Below `lg` it renders nothing; the mobile editor mounted by Sidebar covers that.
 */
export interface StartMenuEditDialogProps {
  language: Language;
  visible: boolean;
  dialogRef: React.Ref<HTMLDivElement>;
  /** Set while a layer outside this tree (the restore confirmation) is open, so StartMenu's click-outside ignores it. */
  busyRef: React.MutableRefObject<boolean>;
  groups: EditGroup[];
  hidden: NavMenuItem[];
  /** Choices of the start-screen dropdown. */
  modules: NavMenuItem[];
  defaultPageId: string;
  pinnedIds: string[];
  canPin: boolean;
  onCreateDashboard?: () => void;
  onSetDefaultPage: (id: string) => void;
  onTogglePin: (id: string) => void;
  onCreateGroup: () => { id: string; name: string };
  onRenameGroup: (id: string, name: string) => void;
  onMoveGroup: (id: string, direction: -1 | 1) => void;
  onReorderGroups: (fromId: string, toId: string) => void;
  onDeleteGroup: (id: string) => void;
  onMoveItem: (groupId: string, index: number, direction: -1 | 1) => void;
  /** Move a module to a group (at `index`, default end) or to "unused" (hidden). */
  onMoveItemTo: (itemId: string, target: string, index?: number) => void;
  onResetLayout: () => void;
  onDone: () => void;
}

type Anchored<T = unknown> = { anchor: HTMLElement } & T;

const metaOf = (item: NavMenuItem, s: ReturnType<typeof menuEditStrings>) =>
  item.id.startsWith("dash_") ? s.customDashboard : item.id.startsWith("ue_") ? s.customTable : undefined;

export const StartMenuEditDialog: React.FC<StartMenuEditDialogProps> = (p) => {
  const { groups, hidden } = p;
  const s = useMemo(() => menuEditStrings(p.language), [p.language]);
  const [confirm, confirmNode] = useConfirmDialog();

  const [query, setQuery] = useState("");
  const [itemMenu, setItemMenu] = useState<Anchored<{ itemId: string; groupId: string }> | null>(null);
  const [groupMenu, setGroupMenu] = useState<Anchored<{ groupId: string }> | null>(null);
  const [addMenu, setAddMenu] = useState<Anchored<{ groupId: string }> | null>(null);
  const [headerMenu, setHeaderMenu] = useState<HTMLElement | null>(null);
  const [startMenu, setStartMenu] = useState<HTMLElement | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Drag state: a module (id + where it came from), where it would land, a group column.
  const [drag, setDrag] = useState<{ id: string; from: string } | null>(null);
  const [over, setOver] = useState<{ group: string; index: number } | null>(null);
  const [hiddenOver, setHiddenOver] = useState(false);
  const [dragGroup, setDragGroup] = useState<string | null>(null);
  const [overGroupId, setOverGroupId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const matches = (it: NavMenuItem) =>
    !q || it.label.toLowerCase().includes(q) || it.description.toLowerCase().includes(q) || it.id.toLowerCase().includes(q);

  const endDrag = () => {
    setDrag(null);
    setOver(null);
    setHiddenOver(false);
    setDragGroup(null);
    setOverGroupId(null);
    (window as any).__draggedModuleId = null;
    endDragGhost();
  };

  // A drop on the sidebar, or a drag released outside any target, must not leave the placeholder behind.
  useEffect(() => {
    window.addEventListener("dragend", endDrag);
    window.addEventListener("drop", endDrag);
    return () => {
      window.removeEventListener("dragend", endDrag);
      window.removeEventListener("drop", endDrag);
    };
  }, []);

  const closeMenus = () => {
    setItemMenu(null);
    setGroupMenu(null);
    setAddMenu(null);
    setHeaderMenu(null);
    setStartMenu(null);
  };

  const startRename = (id: string, name: string) => {
    setRenameId(id);
    setRenameValue(name);
    requestAnimationFrame(() =>
      document.querySelector(`[data-group-id="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    );
  };
  const commitRename = () => {
    if (renameId && renameValue.trim()) p.onRenameGroup(renameId, renameValue.trim());
    setRenameId(null);
  };

  const handleNewGroup = () => {
    closeMenus();
    const created = p.onCreateGroup();
    startRename(created.id, created.name);
  };

  const handleRestore = async () => {
    p.busyRef.current = true;
    const ok = await confirm({
      title: s.restoreDefaultsTitle,
      message: s.restoreDefaultsBody,
      confirmLabel: s.restore,
      cancelLabel: s.cancel,
      danger: true,
    });
    window.setTimeout(() => (p.busyRef.current = false), 0);
    if (ok) p.onResetLayout();
  };

  const moveItem = (groupId: string, index: number, dir: -1 | 1, itemId: string) => {
    p.onMoveItem(groupId, index, dir);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-row-id="${itemId}"]`)?.focus());
  };

  const startItemDrag = (e: React.DragEvent, item: NavMenuItem, from: string) => {
    closeMenus();
    (window as any).__draggedModuleId = item.id;
    try {
      e.dataTransfer.setData("application/json", JSON.stringify({ type: "module", id: item.id }));
    } catch {
      /* some browsers refuse custom types */
    }
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
    startDragGhost(e, { label: item.label, icon: item.icon, color: item.color, pinned: p.pinnedIds.includes(item.id) });
    setDrag({ id: item.id, from });
  };

  const hoverRow = (e: React.DragEvent, groupId: string, realIndex: number) => {
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const r = e.currentTarget.getBoundingClientRect();
    const index = realIndex + (e.clientY > r.top + r.height / 2 ? 1 : 0);
    setHiddenOver(false);
    if (over?.group !== groupId || over.index !== index) setOver({ group: groupId, index });
  };

  const hoverGroup = (e: React.DragEvent, g: EditGroup) => {
    if (dragGroup) {
      if (dragGroup === g.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOverGroupId(g.id);
    } else if (drag) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setHiddenOver(false);
      if (over?.group !== g.id) setOver({ group: g.id, index: g.items.length });
    }
  };

  const dropOnGroup = (e: React.DragEvent, g: EditGroup) => {
    if (dragGroup) {
      e.preventDefault();
      if (dragGroup !== g.id) p.onReorderGroups(dragGroup, g.id);
    } else if (drag) {
      e.preventDefault();
      p.onMoveItemTo(drag.id, g.id, over?.group === g.id ? over.index : undefined);
    }
    endDrag();
  };

  const dropOnHidden = (e: React.DragEvent) => {
    if (!drag) return;
    e.preventDefault();
    if (drag.from !== "unused") p.onMoveItemTo(drag.id, "unused");
    endDrag();
  };

  const startItem = p.modules.find((m) => m.id === p.defaultPageId);
  const StartIcon = startItem?.icon;
  const hiddenShown = hidden.filter(matches);

  const renderGroup = (g: EditGroup) => {
    const rows = g.items.map((item, realIndex) => ({ item, realIndex })).filter(({ item }) => matches(item));
    const isRenaming = renameId === g.id;
    const srcIndex = drag?.from === g.id ? g.items.findIndex((i) => i.id === drag.id) : -1;
    const lineAt = over?.group === g.id && drag && !(srcIndex >= 0 && (over.index === srcIndex || over.index === srcIndex + 1)) ? over.index : -1;
    const line = <div className="h-0.5 mx-2 my-0.5 rounded-full bg-slate-300 pointer-events-none" aria-hidden="true" />;

    return (
      <div
        key={g.id}
        data-group-id={g.id}
        onDragOver={(e) => hoverGroup(e, g)}
        onDrop={(e) => dropOnGroup(e, g)}
        className={cn(
          "bg-slate-50 rounded-2xl p-1.5 flex flex-col gap-0.5 transition-shadow duration-150",
          overGroupId === g.id && "ring-2 ring-indigo-300"
        )}
      >
        {isRenaming ? (
          <div className="flex flex-col gap-1 px-1 pt-1 pb-2">
            <div className="flex items-center gap-1">
              <label className="flex-1 min-w-0 flex items-center h-9 px-2.5 rounded-xl border border-indigo-500 bg-white shadow-[0_0_0_3px_rgb(79_110_219/0.2)]">
                <input
                  autoFocus
                  type="text"
                  value={renameValue}
                  aria-label={s.groupName}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitRename();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setRenameId(null);
                    }
                  }}
                  className="w-full border-0 outline-none bg-transparent type-card-title text-slate-900"
                />
              </label>
              <IconButton
                aria-label={s.saveName}
                title={s.saveName}
                onClick={commitRename}
                className="size-9 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700"
              >
                <Check className="size-4" aria-hidden="true" />
              </IconButton>
              <IconButton aria-label={s.cancel} title={s.cancel} onClick={() => setRenameId(null)} className="size-9 text-slate-500">
                <X className="size-4" aria-hidden="true" />
              </IconButton>
            </div>
            <span className="text-caption text-slate-500 pl-1">{s.renameHint}</span>
          </div>
        ) : (
          <div
            draggable
            onDragStart={(e) => {
              closeMenus();
              e.dataTransfer.setData("text/group-id", g.id);
              e.dataTransfer.effectAllowed = "move";
              setDragGroup(g.id);
            }}
            onDragEnd={endDrag}
            className="flex items-center gap-2 pt-1.5 pr-1 pb-2 pl-2"
          >
            <Grip className="cursor-grab active:cursor-grabbing" />
            <h3 className="m-0 flex-1 min-w-0 type-card-title text-slate-900 break-words">{g.name}</h3>
            <CountChip count={rows.length} />
            <IconButton
              open={groupMenu?.groupId === g.id}
              aria-haspopup="menu"
              aria-expanded={groupMenu?.groupId === g.id}
              aria-label={s.groupOptions(g.name)}
              onClick={(e) => {
                const anchor = e.currentTarget;
                closeMenus();
                if (groupMenu?.groupId !== g.id) setGroupMenu({ anchor, groupId: g.id });
              }}
            >
              <Dots />
            </IconButton>
          </div>
        )}

        {rows.map(({ item, realIndex }) => (
          <React.Fragment key={item.id}>
            {lineAt === realIndex && line}
            <EditRow
              item={item}
              strings={s}
              meta={metaOf(item, s)}
              isDefault={item.id === p.defaultPageId}
              pinned={p.pinnedIds.includes(item.id)}
              canPin={p.canPin}
              menuOpen={itemMenu?.itemId === item.id}
              dragging={drag?.id === item.id}
              onTogglePin={() => p.onTogglePin(item.id)}
              onOpenMenu={(anchor) => {
                const wasOpen = itemMenu?.itemId === item.id;
                closeMenus();
                if (!wasOpen) setItemMenu({ anchor, itemId: item.id, groupId: g.id });
              }}
              onKeyMove={(dir) => moveItem(g.id, realIndex, dir, item.id)}
              onDragStart={(e) => startItemDrag(e, item, g.id)}
              onDragEnd={endDrag}
              onDragOver={(e) => hoverRow(e, g.id, realIndex)}
            />
          </React.Fragment>
        ))}
        {lineAt >= g.items.length && line}

        {g.items.length === 0 && !q && (
          <div className="min-h-9 rounded-xl border border-dashed border-slate-300 flex items-center px-3 text-caption text-slate-500">
            {s.emptyGroupDrop}
          </div>
        )}

        <button
          type="button"
          aria-label={s.addModuleToGroup(g.name)}
          aria-haspopup="menu"
          aria-expanded={addMenu?.groupId === g.id}
          onClick={(e) => {
            const anchor = e.currentTarget;
            const wasOpen = addMenu?.groupId === g.id;
            closeMenus();
            if (!wasOpen) setAddMenu({ anchor, groupId: g.id });
          }}
          className={cn(
            "flex items-center gap-2 h-9 px-2 rounded-xl border-0 bg-transparent text-ui font-semibold text-slate-500 w-full text-left cursor-pointer outline-none",
            "transition-[background-color,color,transform] duration-150 hover:bg-white hover:text-indigo-700 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-indigo-500/40",
            addMenu?.groupId === g.id && "bg-white text-indigo-700"
          )}
        >
          <Plus className="size-4 shrink-0" aria-hidden="true" />
          {g.id === "analytics" ? s.addModuleOrDashboard : s.addModule}
        </button>
      </div>
    );
  };

  const hiddenCard = (
    <div
      onDragOver={(e) => {
        if (!drag || drag.from === "unused") return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(null);
        if (!hiddenOver) setHiddenOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHiddenOver(false);
      }}
      onDrop={dropOnHidden}
      className={cn(
        "rounded-2xl border border-dashed p-3 flex flex-col gap-2.5 transition-[border-color,background-color] duration-150",
        hiddenOver ? "border-indigo-300 bg-indigo-50/40" : "border-slate-300"
      )}
    >
      <div className="flex items-center gap-2">
        <EyeOff className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
        <span className="flex-1 min-w-0 text-ui font-semibold text-slate-700">{s.hiddenModules}</span>
        {hiddenOver ? (
          <span className="text-caption text-slate-500">{s.hiddenDropHint}</span>
        ) : (
          <CountChip count={hiddenShown.length} />
        )}
      </div>
      <p className="m-0 text-caption text-slate-500">{s.hiddenHint}</p>
      {hiddenShown.map((item) => (
        <HiddenRow
          key={item.id}
          item={item}
          strings={s}
          dragging={drag?.id === item.id}
          onShow={() => p.onMoveItemTo(item.id, groups.some((g) => g.id === item.defaultSection) ? item.defaultSection : groups[0].id)}
          onDragStart={(e) => startItemDrag(e, item, "unused")}
          onDragEnd={endDrag}
        />
      ))}
    </div>
  );

  const menuItemData = itemMenu
    ? (() => {
        const g = groups.find((x) => x.id === itemMenu.groupId);
        const item = g?.items.find((x) => x.id === itemMenu.itemId);
        return g && item ? { g, item, index: g.items.indexOf(item) } : null;
      })()
    : null;
  const menuGroup = groupMenu ? groups.find((g) => g.id === groupMenu.groupId) : undefined;
  const addGroup = addMenu ? groups.find((g) => g.id === addMenu.groupId) : undefined;
  const deleteGroup = deleteId ? groups.find((g) => g.id === deleteId) : undefined;

  return (
    <div className="hidden lg:block">
      <div
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-[99999] bg-slate-900/[0.32] backdrop-blur-[3px] transition-opacity duration-250 ease-out",
          p.visible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />
      <section
        ref={p.dialogRef}
        data-start-menu="true"
        role="dialog"
        aria-label={s.title}
        style={{ top: 24, right: 24, bottom: 24, left: 288 }}
        className={cn(
          "fixed z-[99999] bg-white rounded-3xl flex flex-col overflow-hidden select-none",
          "shadow-[0_25px_50px_-12px_rgb(15_23_42/0.3)] transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          p.visible ? "opacity-100 scale-100" : "opacity-0 scale-[0.98] pointer-events-none"
        )}
      >
        <header className="flex items-center gap-4 px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <h2 className="m-0 type-panel-title text-slate-900">{s.title}</h2>
            <p className="m-0 text-body text-slate-500">{s.subtitle}</p>
          </div>
          <label className="flex items-center gap-2 h-9 w-58 px-3 rounded-xl border border-slate-200 bg-white text-slate-400 transition-[border-color,box-shadow] duration-150 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={s.searchModule}
              aria-label={s.searchModule}
              className="border-0 outline-none flex-1 min-w-0 text-ui text-slate-800 placeholder:text-slate-400 bg-transparent"
            />
          </label>
          <button type="button" onClick={handleNewGroup} className={cn(editBtn.base, editBtn.secondary)}>
            <Plus className="size-4" aria-hidden="true" />
            {s.newGroup}
          </button>
          <IconButton
            large
            aria-haspopup="menu"
            aria-expanded={!!headerMenu}
            aria-label={s.moreOptions}
            title={s.moreOptions}
            onClick={(e) => {
              const anchor = e.currentTarget;
              const wasOpen = !!headerMenu;
              closeMenus();
              if (!wasOpen) setHeaderMenu(anchor);
            }}
          >
            <Dots />
          </IconButton>
          <button type="button" onClick={p.onDone} className={cn(editBtn.base, editBtn.primary, "px-4")}>
            <Check className="size-4" aria-hidden="true" />
            {s.done}
          </button>
        </header>

        <div className="mt-4 mx-6 py-2 pr-2 pl-4 rounded-2xl bg-slate-50 flex items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="text-caption font-medium text-slate-600">{s.startScreen}</span>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={!!startMenu}
              aria-label={s.startScreenValue(startItem?.label ?? "")}
              onClick={(e) => {
                const anchor = e.currentTarget;
                const wasOpen = !!startMenu;
                closeMenus();
                if (!wasOpen) setStartMenu(anchor);
              }}
              className={cn(
                "h-9 w-54 pl-3 pr-2.5 rounded-xl border bg-white flex items-center gap-2 text-ui text-slate-800 cursor-pointer outline-none",
                "transition-[border-color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-indigo-500/40",
                startMenu ? "border-indigo-300 ring-2 ring-indigo-500/20" : "border-slate-200 hover:border-slate-300"
              )}
            >
              {StartIcon && <StartIcon className="size-4 shrink-0" style={{ color: startItem?.color }} />}
              <span className="flex-1 min-w-0 text-left font-medium truncate">{startItem?.label}</span>
              <ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-5 pr-2 text-caption text-slate-500">
            <span className="flex items-center gap-1.5">
              <Grip />
              {s.legendDrag}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-5.5 rounded-lg bg-indigo-50 text-indigo-600 inline-flex items-center justify-center">
                <Pin className="size-3.5 fill-indigo-200" aria-hidden="true" />
              </span>
              {s.legendPinned}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-slate-400">
                <Dots />
              </span>
              {s.legendMore}
            </span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-6 pt-4 pb-6">
          <div className="grid grid-cols-4 gap-4 items-start">
            {groups.map((g, i) =>
              i === groups.length - 1 ? (
                <div key={g.id} className="flex flex-col gap-4 min-w-0">
                  {renderGroup(g)}
                  {hiddenCard}
                </div>
              ) : (
                renderGroup(g)
              )
            )}
          </div>
        </div>
      </section>

      {itemMenu && menuItemData && (
        <ItemMenu
          key={itemMenu.itemId}
          anchor={itemMenu.anchor}
          strings={s}
          item={menuItemData.item}
          groups={groups}
          currentGroupId={menuItemData.g.id}
          index={menuItemData.index}
          count={menuItemData.g.items.length}
          pinned={p.pinnedIds.includes(menuItemData.item.id)}
          canPin={p.canPin}
          onClose={() => setItemMenu(null)}
          onSetDefault={() => p.onSetDefaultPage(menuItemData.item.id)}
          onTogglePin={() => p.onTogglePin(menuItemData.item.id)}
          onMoveToGroup={(gid) => p.onMoveItemTo(menuItemData.item.id, gid)}
          onMove={(dir) => moveItem(menuItemData.g.id, menuItemData.index, dir, menuItemData.item.id)}
          onHide={() => p.onMoveItemTo(menuItemData.item.id, "unused")}
        />
      )}
      {groupMenu && menuGroup && (
        <GroupMenu
          anchor={groupMenu.anchor}
          strings={s}
          group={menuGroup}
          isFirst={groups[0]?.id === menuGroup.id}
          isLast={groups[groups.length - 1]?.id === menuGroup.id}
          canDelete={groups.length > 1}
          onClose={() => setGroupMenu(null)}
          onRename={() => startRename(menuGroup.id, menuGroup.name)}
          onMove={(dir) => p.onMoveGroup(menuGroup.id, dir)}
          onDelete={() => setDeleteId(menuGroup.id)}
        />
      )}
      {addMenu && addGroup && (
        <AddModulePopover
          anchor={addMenu.anchor}
          strings={s}
          group={addGroup}
          groups={groups}
          hidden={hidden}
          withDashboard={addGroup.id === "analytics"}
          onClose={() => setAddMenu(null)}
          onAdd={(id) => p.onMoveItemTo(id, addGroup.id)}
          onCreateDashboard={p.onCreateDashboard}
        />
      )}
      {headerMenu && (
        <HeaderMenu
          anchor={headerMenu}
          strings={s}
          onClose={() => setHeaderMenu(null)}
          onCreateDashboard={p.onCreateDashboard}
          onRestoreDefaults={handleRestore}
        />
      )}
      {startMenu && (
        <StartScreenMenu
          anchor={startMenu}
          strings={s}
          modules={p.modules}
          currentId={p.defaultPageId}
          onClose={() => setStartMenu(null)}
          onPick={p.onSetDefaultPage}
        />
      )}

      <DeleteGroupDialog
        open={!!deleteGroup}
        title={s.deleteGroupTitle(deleteGroup?.name ?? "")}
        body={s.deleteGroupBody(deleteGroup?.items.length ?? 0)}
        note={s.deleteGroupNote}
        cancelLabel={s.cancel}
        confirmLabel={s.deleteGroup}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) p.onDeleteGroup(deleteId);
          setDeleteId(null);
        }}
      />
      {confirmNode}
    </div>
  );
};
